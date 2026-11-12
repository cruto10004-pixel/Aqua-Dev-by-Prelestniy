"""Бизнес-логика работы с чатами и сообщениями.

Используется и REST-роутерами, и WebSocket-обработчиком, чтобы правила
(проверка членства, лимиты, сериализация) были в одном месте.
"""
import json
import re
import shutil
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

from . import config
from .realtime import manager


class ServiceError(Exception):
    """Ошибка бизнес-логики с HTTP-подобным статусом."""

    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


# --- Пользователи --------------------------------------------------------------
def _json(value, default):
    try:
        data = json.loads(value) if value else None
    except ValueError:
        data = None
    return data if isinstance(data, dict) else default


def _ids(value) -> list[int]:
    if not isinstance(value, list):
        return []
    out = []
    for v in value:
        if isinstance(v, int) and not isinstance(v, bool) and v not in out:
            out.append(v)
    return out[: config.PRIVACY_MAX_USERS]


def normalize_rule(value) -> dict:
    """Правило «кому можно»: {mode: everyone|selected|except, users: [id…]}. Старые строки приводим к новому виду."""
    if isinstance(value, dict) and value.get("mode") in config.PRIVACY_VALUES:
        return {"mode": value["mode"], "users": _ids(value.get("users"))}
    if value == "nobody":
        return {"mode": "selected", "users": []}
    return {"mode": "everyone", "users": []}


def normalize_activity(value) -> dict:
    """Скрытие активности: mode + users (для «от выбранных») + always (кому всегда показывать при «от всех»)."""
    value = value if isinstance(value, dict) else {}
    mode = value.get("mode") if value.get("mode") in config.ACTIVITY_MODES else "none"
    return {"mode": mode, "users": _ids(value.get("users")), "always": _ids(value.get("always"))}


def get_privacy(row: sqlite3.Row) -> dict:
    """Настройки приватности с значениями по умолчанию для отсутствующих ключей."""
    saved = _json(row["privacy"], {})
    out = {f: normalize_rule(saved.get(f)) for f in config.PRIVACY_FIELDS}
    out["hide_activity"] = normalize_activity(saved.get("hide_activity"))
    return out


def rule_allows(rule: dict, user_id: int) -> bool:
    if rule["mode"] == "selected":
        return user_id in rule["users"]
    if rule["mode"] == "except":
        return user_id not in rule["users"]
    return True


def activity_visible(conn: sqlite3.Connection, owner: sqlite3.Row, viewer_id: int) -> bool:
    """Видит ли viewer «в сети / был(а) …» пользователя owner."""
    if owner["id"] == viewer_id:
        return True
    rule = get_privacy(owner)["hide_activity"]
    if rule["mode"] == "all":
        return viewer_id in rule["always"]
    if rule["mode"] == "selected":
        return viewer_id not in rule["users"]
    if rule["mode"] == "noncontacts":
        return is_contact(conn, owner["id"], viewer_id)
    return True


def get_prefs(row: sqlite3.Row) -> dict:
    prefs = _json(row["prefs"], {})
    if prefs.get("quick_reaction") not in config.ALLOWED_REACTIONS:
        prefs["quick_reaction"] = config.DEFAULT_QUICK_REACTION
    return prefs


def avatar_ref(media_id: int | None, preset: str | None = None) -> dict | None:
    """Аватар: своя картинка (media) или системная заготовка (preset — имя файла assets/avatars/<preset>.svg)."""
    if media_id:
        return {"id": media_id, "url": f"/api/media/{media_id}"}
    if preset in config.AVATAR_PRESETS:
        return {"preset": preset}
    return None


def add_avatar(conn: sqlite3.Connection, user_id: int, media_id: int) -> None:
    conn.execute("INSERT OR IGNORE INTO user_avatars (user_id, media_id, created_at) VALUES (?, ?, ?)",
                 (user_id, media_id, now_iso()))


def list_avatars(conn: sqlite3.Connection, user_id: int) -> list[dict]:
    """Все фото профиля: текущее первым, дальше от новых к старым."""
    cur = conn.execute("SELECT avatar_id FROM users WHERE id = ?", (user_id,)).fetchone()
    current = cur["avatar_id"] if cur else None
    rows = conn.execute("SELECT media_id FROM user_avatars WHERE user_id = ? ORDER BY id DESC", (user_id,)).fetchall()
    items = [{"media_id": r["media_id"], "url": f"/api/media/{r['media_id']}", "current": r["media_id"] == current} for r in rows]
    items.sort(key=lambda x: not x["current"])          # сортировка устойчива: порядок «новые сверху» сохраняется
    return items


def serialize_user(row: sqlite3.Row, conn: sqlite3.Connection | None = None, viewer_id: int | None = None) -> dict:
    """Публичные данные пользователя. С conn и viewer_id учитывает приватность активности и блокировку."""
    data = {
        "id": row["id"],
        "username": row["username"],
        "display_name": row["display_name"] or row["username"],
        "avatar": avatar_ref(row["avatar_id"], row["avatar_preset"]),
        "online": manager.is_online(row["id"]),
        "last_seen": row["last_seen"],
    }
    if conn is not None and viewer_id is not None and viewer_id != row["id"]:
        if not activity_visible(conn, row, viewer_id):
            data["online"], data["last_seen"] = False, None
        data["blocked_me"] = is_blocked(conn, row["id"], viewer_id)      # «Вы заблокированы» вместо «был(а) недавно»
    return data


def serialize_tracks(conn: sqlite3.Connection, user_id: int) -> list[dict]:
    rows = conn.execute(
        """SELECT t.id, t.title, t.artist, t.media_id, md.size FROM profile_tracks t
           JOIN media md ON md.id = t.media_id WHERE t.user_id = ? ORDER BY t.id""", (user_id,)).fetchall()
    return [{"id": r["id"], "title": r["title"], "artist": r["artist"], "size": r["size"],
             "url": f"/api/media/{r['media_id']}"} for r in rows]


def is_contact(conn: sqlite3.Connection, owner_id: int, other_id: int) -> bool:
    return conn.execute("SELECT 1 FROM contacts WHERE user_id = ? AND contact_id = ?", (owner_id, other_id)).fetchone() is not None


def is_blocked(conn: sqlite3.Connection, owner_id: int, other_id: int) -> bool:
    """True, если owner заблокировал other."""
    return conn.execute("SELECT 1 FROM blocks WHERE user_id = ? AND blocked_id = ?", (owner_id, other_id)).fetchone() is not None


def serialize_profile(conn: sqlite3.Connection, row: sqlite3.Row, *, own: bool, viewer_id: int | None = None) -> dict:
    """Профиль целиком. Приватность и настройки отдаём только владельцу; для чужого — признаки «контакт/заблокирован»."""
    data = {**serialize_user(row, conn, viewer_id), "bio": row["bio"] or "", "tracks": serialize_tracks(conn, row["id"])}
    if own:
        data["privacy"] = get_privacy(row)
        data["prefs"] = get_prefs(row)
    elif viewer_id is not None:
        data["is_contact"] = is_contact(conn, viewer_id, row["id"])
        data["is_blocked"] = is_blocked(conn, viewer_id, row["id"])
    return data


# --- Чаты ------------------------------------------------------------------------
def member_ids(conn: sqlite3.Connection, chat_id: int) -> list[int]:
    rows = conn.execute("SELECT user_id FROM chat_members WHERE chat_id = ?", (chat_id,))
    return [r["user_id"] for r in rows]


def require_member(conn: sqlite3.Connection, chat_id: int, user_id: int) -> None:
    """404 вместо 403, чтобы не раскрывать существование чужих чатов."""
    row = conn.execute(
        "SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?", (chat_id, user_id)
    ).fetchone()
    if row is None:
        raise ServiceError(404, "Чат не найден.")


def contact_ids(conn: sqlite3.Connection, user_id: int) -> list[int]:
    """Все, кто состоит с пользователем хотя бы в одном чате (для рассылки статуса)."""
    rows = conn.execute(
        """SELECT DISTINCT m2.user_id FROM chat_members m1
           JOIN chat_members m2 ON m2.chat_id = m1.chat_id
           WHERE m1.user_id = ? AND m2.user_id != ?""",
        (user_id, user_id),
    )
    return [r["user_id"] for r in rows]


def _is_owner(conn, chat_id, uid) -> bool:
    r = conn.execute("SELECT role FROM chat_members WHERE chat_id = ? AND user_id = ?", (chat_id, uid)).fetchone()
    return bool(r and r["role"] == "owner")


def serialize_chat(conn: sqlite3.Connection, chat_id: int, viewer_id: int) -> dict:
    chat = conn.execute("SELECT * FROM chats WHERE id = ?", (chat_id,)).fetchone()
    members = conn.execute(
        """SELECT u.* FROM chat_members cm
           JOIN users u ON u.id = cm.user_id WHERE cm.chat_id = ? ORDER BY u.username""",
        (chat_id,),
    ).fetchall()
    # У личного чата заголовок — имя собеседника.
    title = chat["title"]
    if chat["type"] == "direct":
        other = next((m for m in members if m["id"] != viewer_id), None)
        title = (other["display_name"] or other["username"]) if other else "—"
    last = conn.execute(
        "SELECT id FROM messages WHERE chat_id = ? "
        "AND id NOT IN (SELECT message_id FROM message_hidden WHERE user_id = ?) ORDER BY id DESC LIMIT 1",
        (chat_id, viewer_id),
    ).fetchone()
    return {
        "id": chat["id"],
        "type": "channel" if chat["is_channel"] else chat["type"],
        "username": chat["username"],
        "description": chat["description"] or "",
        "roles": {str(r["user_id"]): r["role"] for r in conn.execute("SELECT user_id, role FROM chat_members WHERE chat_id = ?", (chat_id,))},
        "can_post": not chat["is_channel"] or _is_owner(conn, chat_id, viewer_id),
        "title": title,
        "created_at": chat["created_at"],
        "members": [serialize_user(m, conn, viewer_id) for m in members],
        "last_message": get_message(conn, last["id"]) if last else None,
        "reads": {r["user_id"]: r["last_read_id"] for r in conn.execute(
            "SELECT user_id, last_read_id FROM chat_members WHERE chat_id = ?", (chat_id,))},
        "pinned": get_message(conn, chat["pinned_id"]) if chat["pinned_id"] else None,
    }


def list_chats(conn: sqlite3.Connection, user_id: int) -> list[dict]:
    """Чаты пользователя, сверху — с самым свежим сообщением."""
    rows = conn.execute(
        """SELECT c.id FROM chats c
           JOIN chat_members cm ON cm.chat_id = c.id AND cm.user_id = ?
           ORDER BY COALESCE((SELECT MAX(id) FROM messages WHERE chat_id = c.id), 0) DESC,
                    c.id DESC""",
        (user_id,),
    ).fetchall()
    return [serialize_chat(conn, r["id"], user_id) for r in rows]


def _user_by_name(conn: sqlite3.Connection, username: str) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM users WHERE username = ?", (username.strip(),)).fetchone()
    if row is None:
        raise ServiceError(404, f"Пользователь «{username}» не найден.")
    return row


def create_direct_chat(conn: sqlite3.Connection, me: int, username: str) -> tuple[int, bool]:
    """Личный чат. Возвращает (chat_id, создан_ли_новый)."""
    other = _user_by_name(conn, username)
    if other["id"] == me:
        raise ServiceError(400, "Нельзя создать чат с самим собой.")
    key = f"{min(me, other['id'])}:{max(me, other['id'])}"
    existing = conn.execute("SELECT id FROM chats WHERE direct_key = ?", (key,)).fetchone()
    if existing:
        return existing["id"], False
    ts = now_iso()
    cur = conn.execute(
        "INSERT INTO chats (type, direct_key, created_by, created_at) VALUES ('direct', ?, ?, ?)",
        (key, me, ts),
    )
    chat_id = cur.lastrowid
    conn.executemany(
        "INSERT INTO chat_members (chat_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)",
        [(chat_id, me, ts), (chat_id, other["id"], ts)],
    )
    return chat_id, True


def create_group_chat(
    conn: sqlite3.Connection, me: int, title: str, usernames: list[str]
) -> int:
    title = (title or "").strip()
    if not title:
        raise ServiceError(400, "Укажите название группы.")
    ids = {me}
    for name in usernames:
        ids.add(_user_by_name(conn, name)["id"])
    ts = now_iso()
    cur = conn.execute(
        "INSERT INTO chats (type, title, created_by, created_at) VALUES ('group', ?, ?, ?)",
        (title, me, ts),
    )
    chat_id = cur.lastrowid
    conn.executemany(
        "INSERT INTO chat_members (chat_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)",
        [(chat_id, uid, "owner" if uid == me else "member", ts) for uid in ids],
    )
    return chat_id


def create_channel(conn: sqlite3.Connection, me: int, title: str, username: str) -> int:
    """Канал: создатель — администратор, публиковать могут только администраторы."""
    title = (title or "").strip()
    username = (username or "").strip().lstrip("@").lower()
    if not title:
        raise ServiceError(400, "Укажите название канала.")
    if not re.fullmatch(r"[a-z0-9_]{4,32}", username):
        raise ServiceError(400, "Имя канала: 4–32 латинских буквы, цифры или _.")
    if conn.execute("SELECT 1 FROM chats WHERE username = ?", (username,)).fetchone() or \
       conn.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
        raise ServiceError(409, "Такое имя уже занято.")
    ts = now_iso()
    cur = conn.execute(
        "INSERT INTO chats (type, title, username, is_channel, created_by, created_at) VALUES ('group', ?, ?, 1, ?, ?)",
        (title, username, me, ts))
    conn.execute("INSERT INTO chat_members (chat_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)",
                 (cur.lastrowid, me, ts))
    return cur.lastrowid


def update_channel(conn: sqlite3.Connection, chat_id: int, me: int, title: str | None, description: str | None) -> None:
    """Правка канала — только администратор канала."""
    chat = conn.execute("SELECT is_channel FROM chats WHERE id = ?", (chat_id,)).fetchone()
    if chat is None or not chat["is_channel"]:
        raise ServiceError(404, "Канал не найден.")
    if not _is_owner(conn, chat_id, me):
        raise ServiceError(403, "Редактировать канал может только администратор.")
    if title is not None:
        if not title.strip():
            raise ServiceError(400, "Название не может быть пустым.")
        conn.execute("UPDATE chats SET title = ? WHERE id = ?", (title.strip(), chat_id))
    if description is not None:
        conn.execute("UPDATE chats SET description = ? WHERE id = ?", (description.strip()[:500], chat_id))
    conn.commit()


def require_can_post(conn: sqlite3.Connection, chat_id: int, sender_id: int) -> None:
    chat = conn.execute("SELECT is_channel FROM chats WHERE id = ?", (chat_id,)).fetchone()
    if chat is None or not chat["is_channel"]:
        return
    row = conn.execute("SELECT role FROM chat_members WHERE chat_id = ? AND user_id = ?", (chat_id, sender_id)).fetchone()
    if row is None or row["role"] != "owner":
        raise ServiceError(403, "В канале публиковать может только администратор.")


# --- Сообщения -----------------------------------------------------------------
_MESSAGE_SELECT = """
    SELECT m.id, m.chat_id, m.sender_id, u.username AS sender_username,
           u.display_name AS sender_display, u.avatar_id AS sender_avatar, u.avatar_preset AS sender_preset, m.kind, m.text,
           m.media_id, m.meta, m.cover_id, m.created_at, m.edited_at, m.fwd, md.original_name, md.mime, md.size
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    LEFT JOIN media md ON md.id = m.media_id
"""


def serialize_message(row: sqlite3.Row) -> dict:
    media = None
    if row["media_id"] is not None:
        media = {
            "id": row["media_id"],
            "url": f"/api/media/{row['media_id']}",
            "name": row["original_name"],
            "mime": row["mime"],
            "size": row["size"],
        }
    return {
        "id": row["id"],
        "chat_id": row["chat_id"],
        "sender": {"id": row["sender_id"], "username": row["sender_username"],
                   "display_name": row["sender_display"] or row["sender_username"],
                   "avatar": avatar_ref(row["sender_avatar"], row["sender_preset"])},
        "kind": row["kind"],
        "text": row["text"],
        "media": media,
        "meta": json.loads(row["meta"]) if row["meta"] else None,   # голосовые: {duration, wave}
        "cover": {"id": row["cover_id"], "url": f"/api/media/{row['cover_id']}"} if row["cover_id"] else None,
        "reactions": [],                                            # заполняет attach_reactions
        "created_at": row["created_at"],
        "edited_at": row["edited_at"],
        "forwarded": json.loads(row["fwd"]) if row["fwd"] else None,   # {id, name} — «Переслано от …»
    }


def attach_reactions(conn: sqlite3.Connection, messages: list[dict]) -> list[dict]:
    """Одним запросом добавляет к сообщениям сгруппированные реакции: [{emoji, count, users}]."""
    if not messages:
        return messages
    ids = [m["id"] for m in messages]
    rows = conn.execute(
        f"SELECT message_id, emoji, user_id FROM reactions "
        f"WHERE message_id IN ({','.join('?' * len(ids))}) ORDER BY created_at, rowid",
        ids,
    )
    grouped: dict[int, dict[str, list[int]]] = {}
    for r in rows:
        grouped.setdefault(r["message_id"], {}).setdefault(r["emoji"], []).append(r["user_id"])
    for m in messages:
        m["reactions"] = [
            {"emoji": e, "count": len(u), "users": u} for e, u in grouped.get(m["id"], {}).items()
        ]
    return messages


def get_reactions(conn: sqlite3.Connection, message_id: int) -> list[dict]:
    return attach_reactions(conn, [{"id": message_id}])[0]["reactions"]


def toggle_reaction(
    conn: sqlite3.Connection, message_id: int, user_id: int, emoji: str
) -> tuple[int, list[dict]]:
    """Ставит реакцию или снимает, если она уже стоит. Возвращает (chat_id, реакции сообщения)."""
    if emoji not in config.ALLOWED_REACTIONS:
        raise ServiceError(400, "Такая реакция недоступна.")
    row = conn.execute("SELECT chat_id FROM messages WHERE id = ?", (message_id,)).fetchone()
    if row is None:
        raise ServiceError(404, "Сообщение не найдено.")
    require_member(conn, row["chat_id"], user_id)
    # Одна реакция на пользователя: повторный выбор той же снимает её, другая — заменяет прежнюю
    had = conn.execute(
        "SELECT emoji FROM reactions WHERE message_id = ? AND user_id = ?", (message_id, user_id)
    ).fetchone()
    conn.execute("DELETE FROM reactions WHERE message_id = ? AND user_id = ?", (message_id, user_id))
    if had is None or had["emoji"] != emoji:
        conn.execute(
            "INSERT INTO reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)",
            (message_id, user_id, emoji, now_iso()),
        )
    return row["chat_id"], get_reactions(conn, message_id)


def get_message(conn: sqlite3.Connection, message_id: int) -> dict:
    row = conn.execute(_MESSAGE_SELECT + " WHERE m.id = ?", (message_id,)).fetchone()
    return attach_reactions(conn, [serialize_message(row)])[0]


def get_history(
    conn: sqlite3.Connection, chat_id: int, before_id: int | None, limit: int, viewer_id: int | None = None
) -> list[dict]:
    """Страница истории: последние `limit` сообщений старше `before_id`, по возрастанию.
    Сообщения, скрытые зрителем («удалить у себя»), не показываем."""
    params: list = [chat_id]
    where = " WHERE m.chat_id = ?"
    if viewer_id is not None:
        where += " AND m.id NOT IN (SELECT message_id FROM message_hidden WHERE user_id = ?)"
        params.append(viewer_id)
    if before_id is not None:
        where += " AND m.id < ?"
        params.append(before_id)
    rows = conn.execute(
        _MESSAGE_SELECT + where + " ORDER BY m.id DESC LIMIT ?", (*params, limit)
    ).fetchall()
    return attach_reactions(conn, [serialize_message(r) for r in reversed(rows)])


def validate_meta(kind: str, meta) -> dict | None:
    """Метаданные: у голосовых — длительность и волна; у фото/видео — флаг GIF; у картинок — id стикера."""
    if meta is None:
        return None
    if not isinstance(meta, dict):
        raise ServiceError(400, "Неверные метаданные сообщения.")
    if kind in ("image", "video") and ("gif" in meta or "sticker" in meta):
        if "sticker" in meta:
            sid = meta["sticker"]
            if kind != "image" or isinstance(sid, bool) or not isinstance(sid, int):
                raise ServiceError(400, "Неверный стикер.")
            return {"sticker": sid}
        if meta.get("gif") is not True:
            raise ServiceError(400, "Неверные метаданные GIF.")
        return {"gif": True}
    bad = ServiceError(400, "Неверные данные голосового сообщения.")
    if kind != "voice":
        raise bad
    duration, wave = meta.get("duration"), meta.get("wave")
    if isinstance(duration, bool) or not isinstance(duration, (int, float)) \
            or not 0 < duration <= config.MAX_VOICE_SECONDS:
        raise bad
    if not isinstance(wave, list) or not 1 <= len(wave) <= 100 or any(
        isinstance(v, bool) or not isinstance(v, int) or not 0 <= v <= 100 for v in wave
    ):
        raise bad
    return {"duration": round(float(duration), 2), "wave": wave}


def enforce_privacy(conn: sqlite3.Connection, chat_id: int, sender_id: int, *, voice: bool) -> None:
    """Личные чаты: учитываем, кому получатель разрешил писать / слать голосовые.

    «contacts» = получатель добавил отправителя в контакты или уже сам писал ему в этом чате.
    Заблокированный пользователь писать не может вовсе.
    На группы и каналы настройки не действуют.
    """
    require_can_post(conn, chat_id, sender_id)
    chat = conn.execute("SELECT type FROM chats WHERE id = ?", (chat_id,)).fetchone()
    if chat is None or chat["type"] != "direct":
        return
    other = conn.execute(
        "SELECT u.* FROM chat_members cm JOIN users u ON u.id = cm.user_id WHERE cm.chat_id = ? AND cm.user_id != ?",
        (chat_id, sender_id)).fetchone()
    if other is None:
        return
    if is_blocked(conn, sender_id, other["id"]):
        raise ServiceError(403, "Вы заблокировали этого пользователя. Разблокируйте его, чтобы писать.")
    if is_blocked(conn, other["id"], sender_id):
        raise ServiceError(403, "Вы не можете писать этому пользователю.")
    privacy = get_privacy(other)
    if not rule_allows(privacy["who_can_write"], sender_id):
        raise ServiceError(403, "Пользователь ограничил, кто может ему писать.")
    if voice and not rule_allows(privacy["who_can_voice"], sender_id):
        raise ServiceError(403, "Пользователь не принимает голосовые сообщения от вас.")


def create_message(
    conn: sqlite3.Connection,
    chat_id: int,
    sender_id: int,
    text: str | None,
    media_id: int | None,
    meta: dict | None = None,
    cover_id: int | None = None,
) -> dict:
    """Проверяет права и лимиты, сохраняет сообщение, возвращает его в виде dict."""
    require_member(conn, chat_id, sender_id)
    text = (text or "").strip() or None
    enforce_privacy(conn, chat_id, sender_id, voice=False)
    if text is None and media_id is None:
        raise ServiceError(400, "Сообщение пустое.")
    if text and len(text) > config.MAX_MESSAGE_LENGTH:
        raise ServiceError(400, f"Сообщение длиннее {config.MAX_MESSAGE_LENGTH} символов.")

    kind = "text"
    media = None
    if media_id is not None:
        media = conn.execute(
            "SELECT owner_id, kind FROM media WHERE id = ?", (media_id,)
        ).fetchone()
        if media is None:
            raise ServiceError(400, "Вложение не найдено.")
        kind = media["kind"]

    if kind == "voice":
        enforce_privacy(conn, chat_id, sender_id, voice=True)
    meta = validate_meta(kind, meta)
    if meta and "sticker" in meta:
        # Стикер: файл принадлежит автору пака, но отправить его может любой — берём его media из стикера
        st = conn.execute("SELECT pack_id, media_id FROM stickers WHERE id = ?", (meta["sticker"],)).fetchone()
        if st is None or st["media_id"] != media_id:
            raise ServiceError(400, "Стикер не найден.")
        meta["pack"] = st["pack_id"]
        text = None
    elif media is not None and media["owner_id"] != sender_id:
        raise ServiceError(400, "Вложение не найдено.")        # обычные файлы — только свои
    if cover_id is not None:
        # Обложка — только у видео, только своя картинка
        cover = conn.execute("SELECT owner_id, kind FROM media WHERE id = ?", (cover_id,)).fetchone()
        if kind != "video" or cover is None or cover["owner_id"] != sender_id or cover["kind"] != "image":
            raise ServiceError(400, "Неверная обложка видео.")
    cur = conn.execute(
        "INSERT INTO messages (chat_id, sender_id, kind, text, media_id, meta, cover_id, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (chat_id, sender_id, kind, text, media_id, json.dumps(meta) if meta else None, cover_id, now_iso()),
    )
    if meta and meta.get("gif"):
        save_gif(conn, sender_id, media_id)                      # отправленные GIF попадают в «Сохранённые»
    elif meta and "sticker" in meta:
        touch_recent(conn, sender_id, meta["sticker"])           # и в «недавние» стикеры
    return get_message(conn, cur.lastrowid)


# --- Медиа -----------------------------------------------------------------------
def can_access_media(conn: sqlite3.Connection, media_id: int, user_id: int) -> bool:
    """Файл доступен владельцу и участникам чатов, куда он (или он как обложка видео) был отправлен."""
    row = conn.execute(
        """SELECT 1 FROM media WHERE id = ? AND owner_id = ?
           UNION
           SELECT 1 FROM messages m
           JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = ?
           WHERE m.media_id = ? OR m.cover_id = ?
           UNION
           SELECT 1 FROM users WHERE avatar_id = ?
           UNION
           SELECT 1 FROM user_avatars WHERE media_id = ?
           UNION
           SELECT 1 FROM profile_tracks WHERE media_id = ?
           UNION
           SELECT 1 FROM stickers WHERE media_id = ?""",             # стикеры доступны всем вошедшим
        (media_id, user_id, user_id, media_id, media_id, media_id, media_id, media_id, media_id),
    ).fetchone()
    return row is not None


def media_summary(conn: sqlite3.Connection, user_id: int) -> dict:
    """Сколько файлов каждого типа загрузил пользователь — «папки» файлового менеджера."""
    counts = {"image": 0, "video": 0, "voice": 0, "file": 0}
    for r in conn.execute("SELECT kind, COUNT(*) AS n FROM media WHERE owner_id = ? GROUP BY kind", (user_id,)):
        counts[r["kind"]] = r["n"]
    return counts


# --- Изменение и удаление сообщений -----------------------------------------------
def _own_or_member_message(conn: sqlite3.Connection, message_id: int, user_id: int) -> sqlite3.Row:
    """Сообщение, к которому у пользователя есть доступ (он участник чата). Иначе 404, чтобы не раскрывать id."""
    row = conn.execute("SELECT * FROM messages WHERE id = ?", (message_id,)).fetchone()
    if row is None or conn.execute(
        "SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?", (row["chat_id"], user_id)
    ).fetchone() is None:
        raise ServiceError(404, "Сообщение не найдено.")
    return row


def edit_message(conn: sqlite3.Connection, message_id: int, user_id: int, text: str | None) -> dict:
    """Меняет текст (или подпись к медиа) своего сообщения. Голосовые изменить нельзя."""
    row = _own_or_member_message(conn, message_id, user_id)
    if row["sender_id"] != user_id:
        raise ServiceError(403, "Можно изменять только свои сообщения.")
    if row["kind"] == "voice":
        raise ServiceError(400, "Голосовое сообщение нельзя изменить.")
    text = (text or "").strip()
    if len(text) > config.MAX_MESSAGE_LENGTH:
        raise ServiceError(400, f"Сообщение длиннее {config.MAX_MESSAGE_LENGTH} символов.")
    if not text and row["kind"] == "text":
        raise ServiceError(400, "Сообщение не может быть пустым.")
    conn.execute("UPDATE messages SET text = ?, edited_at = ? WHERE id = ?", (text or None, now_iso(), message_id))
    return attach_reactions(conn, [get_message(conn, message_id)])[0]


def delete_message(conn: sqlite3.Connection, message_id: int, user_id: int, scope: str) -> int:
    """scope='all' — удалить у всех (только автор); scope='me' — скрыть только у себя. Возвращает chat_id."""
    row = _own_or_member_message(conn, message_id, user_id)
    if scope == "all":
        if row["sender_id"] != user_id:
            raise ServiceError(403, "Удалить у всех можно только свои сообщения.")
        conn.execute("DELETE FROM messages WHERE id = ?", (message_id,))      # реакции и «скрытия» уйдут каскадом
        conn.execute("UPDATE chats SET pinned_id = NULL WHERE pinned_id = ?", (message_id,))
    elif scope == "me":
        conn.execute("INSERT OR IGNORE INTO message_hidden (message_id, user_id) VALUES (?, ?)", (message_id, user_id))
    else:
        raise ServiceError(422, "scope: all или me.")
    return row["chat_id"]


def last_message_for(conn: sqlite3.Connection, chat_id: int, viewer_id: int) -> dict | None:
    """Актуальное «последнее сообщение» чата для конкретного зрителя (после удаления/скрытия)."""
    return serialize_chat(conn, chat_id, viewer_id)["last_message"]


# --- Копия медиа (сохранить чужую GIF, переслать фото) ------------------------------
def clone_media(conn: sqlite3.Connection, media_id: int, user_id: int) -> sqlite3.Row:
    """Даёт пользователю собственную копию доступного ему файла (если уже владелец — возвращает исходный)."""
    if not can_access_media(conn, media_id, user_id):
        raise ServiceError(404, "Файл не найден.")
    row = conn.execute("SELECT * FROM media WHERE id = ?", (media_id,)).fetchone()
    if row["owner_id"] == user_id:
        return row
    src = config.UPLOAD_DIR / row["stored_name"]
    if not src.exists():
        raise ServiceError(404, "Файл не найден.")
    stored = f"{uuid.uuid4().hex}{Path(row['stored_name']).suffix}"
    shutil.copyfile(src, config.UPLOAD_DIR / stored)
    cur = conn.execute(
        "INSERT INTO media (owner_id, original_name, stored_name, mime, size, kind, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (user_id, row["original_name"], stored, row["mime"], row["size"], row["kind"], now_iso()),
    )
    return conn.execute("SELECT * FROM media WHERE id = ?", (cur.lastrowid,)).fetchone()


# --- Сохранённые GIF -------------------------------------------------------------------
def media_json(row: sqlite3.Row) -> dict:
    return {"id": row["id"], "url": f"/api/media/{row['id']}", "name": row["original_name"], "mime": row["mime"],
            "size": row["size"], "kind": row["kind"], "created_at": row["created_at"]}


def save_gif(conn: sqlite3.Connection, user_id: int, media_id: int) -> None:
    conn.execute("INSERT OR IGNORE INTO saved_gifs (user_id, media_id, created_at) VALUES (?, ?, ?)",
                 (user_id, media_id, now_iso()))


def list_saved_gifs(conn: sqlite3.Connection, user_id: int) -> list[dict]:
    rows = conn.execute(
        "SELECT m.* FROM saved_gifs g JOIN media m ON m.id = g.media_id WHERE g.user_id = ? ORDER BY g.id DESC", (user_id,)
    ).fetchall()
    return [media_json(r) for r in rows]


# --- Стикеры ---------------------------------------------------------------------------
RECENT_STICKERS = 30


def _sticker_json(row: sqlite3.Row) -> dict:
    return {"id": row["id"], "pack_id": row["pack_id"], "media_id": row["media_id"], "url": f"/api/media/{row['media_id']}"}


def touch_recent(conn: sqlite3.Connection, user_id: int, sticker_id: int) -> None:
    conn.execute("INSERT OR REPLACE INTO sticker_recent (user_id, sticker_id, used_at) VALUES (?, ?, ?)",
                 (user_id, sticker_id, now_iso()))
    conn.execute(
        "DELETE FROM sticker_recent WHERE user_id = ? AND sticker_id NOT IN "
        "(SELECT sticker_id FROM sticker_recent WHERE user_id = ? ORDER BY used_at DESC, rowid DESC LIMIT ?)",
        (user_id, user_id, RECENT_STICKERS))


def serialize_pack(conn: sqlite3.Connection, pack: sqlite3.Row, viewer_id: int) -> dict:
    rows = conn.execute("SELECT * FROM stickers WHERE pack_id = ? ORDER BY id", (pack["id"],)).fetchall()
    stickers = [_sticker_json(r) for r in rows]
    mine_list = conn.execute("SELECT 1 FROM user_packs WHERE user_id = ? AND pack_id = ?", (viewer_id, pack["id"])).fetchone()
    return {"id": pack["id"], "title": pack["title"], "owner_id": pack["owner_id"], "own": pack["owner_id"] == viewer_id,
            "added": mine_list is not None, "preview": stickers[0] if stickers else None, "stickers": stickers}


def sticker_library(conn: sqlite3.Connection, user_id: int) -> dict:
    packs = conn.execute(
        "SELECT p.* FROM user_packs up JOIN sticker_packs p ON p.id = up.pack_id WHERE up.user_id = ? ORDER BY up.added_at, p.id", (user_id,)
    ).fetchall()
    recent = conn.execute(
        "SELECT s.* FROM sticker_recent r JOIN stickers s ON s.id = r.sticker_id WHERE r.user_id = ? "
        "ORDER BY r.used_at DESC, r.rowid DESC LIMIT ?", (user_id, RECENT_STICKERS)).fetchall()
    favs = conn.execute(
        "SELECT s.* FROM sticker_favs f JOIN stickers s ON s.id = f.sticker_id WHERE f.user_id = ? ORDER BY f.added_at DESC, f.rowid DESC", (user_id,)).fetchall()
    return {"packs": [serialize_pack(conn, p, user_id) for p in packs],
            "recent": [_sticker_json(r) for r in recent], "favorites": [_sticker_json(r) for r in favs]}


# --- Прочитанность, закреп, пересылка ---------------------------------------------
def mark_read(conn: sqlite3.Connection, chat_id: int, user_id: int, up_to: int) -> int:
    """Отмечает сообщения чата прочитанными до up_to включительно (не может уменьшиться). Возвращает новое значение."""
    require_member(conn, chat_id, user_id)
    top = conn.execute("SELECT COALESCE(MAX(id), 0) FROM messages WHERE chat_id = ? AND id <= ?", (chat_id, up_to)).fetchone()[0]
    conn.execute("UPDATE chat_members SET last_read_id = MAX(last_read_id, ?) WHERE chat_id = ? AND user_id = ?", (top, chat_id, user_id))
    return conn.execute("SELECT last_read_id FROM chat_members WHERE chat_id = ? AND user_id = ?", (chat_id, user_id)).fetchone()[0]


def set_pinned(conn: sqlite3.Connection, chat_id: int, user_id: int, message_id: int | None) -> dict | None:
    require_member(conn, chat_id, user_id)
    if message_id is not None:
        row = conn.execute("SELECT 1 FROM messages WHERE id = ? AND chat_id = ?", (message_id, chat_id)).fetchone()
        if row is None:
            raise ServiceError(404, "Сообщение не найдено.")
    conn.execute("UPDATE chats SET pinned_id = ? WHERE id = ?", (message_id, chat_id))
    return get_message(conn, message_id) if message_id else None


def forward_messages(conn: sqlite3.Connection, user_id: int, message_ids: list[int], chat_id: int, hide_sender: bool) -> list[dict]:
    """Пересылает сообщения в чат: файлы копируются пользователю; «Переслано от …» можно скрыть."""
    require_member(conn, chat_id, user_id)
    out = []
    for mid in sorted(set(message_ids)):
        src = conn.execute("SELECT * FROM messages WHERE id = ?", (mid,)).fetchone()
        if src is None:
            raise ServiceError(404, "Сообщение не найдено.")
        require_member(conn, src["chat_id"], user_id)
        if conn.execute("SELECT 1 FROM message_hidden WHERE message_id = ? AND user_id = ?", (mid, user_id)).fetchone():
            raise ServiceError(404, "Сообщение не найдено.")
        meta = json.loads(src["meta"]) if src["meta"] else None
        media_id = cover_id = None
        if src["media_id"] is not None:
            media_id = src["media_id"] if (meta and "sticker" in meta) else clone_media(conn, src["media_id"], user_id)["id"]
        if src["cover_id"] is not None:
            cover_id = clone_media(conn, src["cover_id"], user_id)["id"]
        if meta and "pack" in meta:
            meta = {"sticker": meta["sticker"]}
        msg = create_message(conn, chat_id, user_id, src["text"], media_id, meta, cover_id)
        if not hide_sender:
            fwd = json.loads(src["fwd"]) if src["fwd"] else None
            if fwd is None:
                u = conn.execute("SELECT username, display_name FROM users WHERE id = ?", (src["sender_id"],)).fetchone()
                fwd = {"id": src["sender_id"], "name": u["display_name"] or u["username"]}
            conn.execute("UPDATE messages SET fwd = ? WHERE id = ?", (json.dumps(fwd, ensure_ascii=False), msg["id"]))
            msg = get_message(conn, msg["id"])
        out.append(msg)
    return out
