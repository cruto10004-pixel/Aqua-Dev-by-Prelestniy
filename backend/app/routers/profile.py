"""Профиль: ник, логин, пароль, аватар, описание, приватность, тема/обои/быстрая реакция, музыка."""
import re
import sqlite3

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import config, services
from ..deps import get_current_user, get_db
from ..realtime import manager
from ..security import hash_password, verify_password
from ..validators import validate_password, validate_username

router = APIRouter(prefix="/api", tags=["profile"])

_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
_ID = re.compile(r"^[a-z0-9-]{1,24}$")


def _user(conn: sqlite3.Connection, user_id: int) -> sqlite3.Row:
    return conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()


async def _announce(conn: sqlite3.Connection, user_id: int) -> None:
    """Рассылает обновлённый публичный профиль собеседникам и другим устройствам владельца."""
    payload = {"type": "profile", "user": services.serialize_user(_user(conn, user_id))}
    await manager.send_to_users([user_id, *services.contact_ids(conn, user_id)], payload)


def _own_image(conn: sqlite3.Connection, media_id: int, user_id: int):
    row = conn.execute("SELECT owner_id, kind FROM media WHERE id = ?", (media_id,)).fetchone()
    if row is None or row["owner_id"] != user_id or row["kind"] != "image":
        raise HTTPException(400, "Нужна ваша загруженная картинка.")


# --- Просмотр ---------------------------------------------------------------------
@router.get("/profile")
def my_profile(user: sqlite3.Row = Depends(get_current_user), conn: sqlite3.Connection = Depends(get_db)):
    return services.serialize_profile(conn, user, own=True)


@router.get("/users/{user_id}/profile")
def user_profile(user_id: int, me: sqlite3.Row = Depends(get_current_user), conn: sqlite3.Connection = Depends(get_db)):
    row = _user(conn, user_id)
    if row is None:
        raise HTTPException(404, "Пользователь не найден.")
    return services.serialize_profile(conn, row, own=(row["id"] == me["id"]), viewer_id=me["id"])


@router.get("/users/{user_id}/avatars")
def user_avatars(user_id: int, _: sqlite3.Row = Depends(get_current_user), conn: sqlite3.Connection = Depends(get_db)):
    if _user(conn, user_id) is None:
        raise HTTPException(404, "Пользователь не найден.")
    return services.list_avatars(conn, user_id)


@router.delete("/profile/avatars/{media_id}")
async def delete_avatar(media_id: int, user: sqlite3.Row = Depends(get_current_user), conn: sqlite3.Connection = Depends(get_db)):
    """Убирает фото из галереи. Если оно было текущим, текущим становится следующее (или аватара не будет)."""
    cur = conn.execute("DELETE FROM user_avatars WHERE user_id = ? AND media_id = ?", (user["id"], media_id))
    if cur.rowcount == 0:
        raise HTTPException(404, "Фото не найдено.")
    if user["avatar_id"] == media_id:
        nxt = conn.execute("SELECT media_id FROM user_avatars WHERE user_id = ? ORDER BY id DESC LIMIT 1", (user["id"],)).fetchone()
        conn.execute("UPDATE users SET avatar_id = ? WHERE id = ?", (nxt["media_id"] if nxt else None, user["id"]))
        conn.commit()
        await _announce(conn, user["id"])
    return {"profile": services.serialize_profile(conn, _user(conn, user["id"]), own=True),
            "avatars": services.list_avatars(conn, user["id"])}


# --- Основное -----------------------------------------------------------------------
class ProfileUpdate(BaseModel):
    display_name: str | None = Field(None, max_length=100)
    bio: str | None = Field(None, max_length=1000)
    avatar_id: int | None = None          # своя картинка; null — убрать
    avatar_preset: str | None = None      # системная аватарка (имя из config.AVATAR_PRESETS)


@router.patch("/profile")
async def update_profile(data: ProfileUpdate, user: sqlite3.Row = Depends(get_current_user),
                         conn: sqlite3.Connection = Depends(get_db)):
    sent = data.model_fields_set
    fields: dict = {}
    if "display_name" in sent:
        name = " ".join((data.display_name or "").split())
        if len(name) > config.DISPLAY_NAME_MAX:
            raise HTTPException(422, f"Ник не длиннее {config.DISPLAY_NAME_MAX} символов.")
        if any(not c.isprintable() for c in name):
            raise HTTPException(422, "Ник содержит недопустимые символы.")
        fields["display_name"] = name or None          # пусто = показывать логин
    if "bio" in sent:
        bio = (data.bio or "").strip()
        if len(bio) > config.BIO_MAX:
            raise HTTPException(422, f"Описание не длиннее {config.BIO_MAX} символов.")
        fields["bio"] = bio or None
    if "avatar_id" in sent:
        if data.avatar_id is not None:
            _own_image(conn, data.avatar_id, user["id"])
        fields["avatar_id"] = data.avatar_id
        if data.avatar_id is not None:
            fields["avatar_preset"] = None
            services.add_avatar(conn, user["id"], data.avatar_id)
    if "avatar_preset" in sent:
        if data.avatar_preset is not None and data.avatar_preset not in config.AVATAR_PRESETS:
            raise HTTPException(422, "Неизвестная системная аватарка.")
        fields["avatar_preset"] = data.avatar_preset
        if data.avatar_preset is not None:
            fields["avatar_id"] = None
    if fields:
        conn.execute(f"UPDATE users SET {', '.join(f'{k} = ?' for k in fields)} WHERE id = ?",
                     (*fields.values(), user["id"]))
        conn.commit()
        await _announce(conn, user["id"])
    return services.serialize_profile(conn, _user(conn, user["id"]), own=True)


class UsernameChange(BaseModel):
    username: str = Field(max_length=64)
    password: str = Field(max_length=256)           # подтверждение текущим паролем


@router.put("/profile/username")
async def change_username(data: UsernameChange, user: sqlite3.Row = Depends(get_current_user),
                          conn: sqlite3.Connection = Depends(get_db)):
    new = data.username.strip()
    if not verify_password(data.password, user["password_hash"]):
        raise HTTPException(403, "Неверный пароль.")
    errors = validate_username(new)
    if errors:
        raise HTTPException(422, errors[0])
    if conn.execute("SELECT 1 FROM users WHERE username = ? AND id != ?", (new, user["id"])).fetchone():
        raise HTTPException(409, "Этот логин уже занят.")
    conn.execute("UPDATE users SET username = ? WHERE id = ?", (new, user["id"]))
    conn.commit()
    await _announce(conn, user["id"])
    return services.serialize_profile(conn, _user(conn, user["id"]), own=True)


class PasswordChange(BaseModel):
    current_password: str = Field(max_length=256)
    new_password: str = Field(max_length=256)


@router.put("/profile/password")
def change_password(data: PasswordChange, user: sqlite3.Row = Depends(get_current_user),
                    conn: sqlite3.Connection = Depends(get_db)):
    if not verify_password(data.current_password, user["password_hash"]):
        raise HTTPException(403, "Текущий пароль неверный.")
    errors = validate_password(data.new_password)
    if errors:
        raise HTTPException(422, errors[0])
    conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(data.new_password), user["id"]))
    return {"ok": True}


# --- Приватность и предпочтения ----------------------------------------------------
class PrivacyUpdate(BaseModel):
    who_can_write: dict | None = None
    who_can_voice: dict | None = None
    hide_activity: dict | None = None


@router.put("/profile/privacy")
async def update_privacy(data: PrivacyUpdate, user: sqlite3.Row = Depends(get_current_user),
                         conn: sqlite3.Connection = Depends(get_db)):
    """Правила: {mode: everyone|selected|except, users:[id]}; активность: {mode: none|all|selected|noncontacts, users, always}."""
    import json
    privacy = services.get_privacy(user)
    for field in config.PRIVACY_FIELDS:
        value = getattr(data, field)
        if value is None:
            continue
        if value.get("mode") not in config.PRIVACY_VALUES:
            raise HTTPException(422, "Допустимо: everyone, selected, except.")
        privacy[field] = services.normalize_rule(value)
    if data.hide_activity is not None:
        if data.hide_activity.get("mode") not in config.ACTIVITY_MODES:
            raise HTTPException(422, "Неверный режим скрытия активности.")
        privacy["hide_activity"] = services.normalize_activity(data.hide_activity)
    conn.execute("UPDATE users SET privacy = ? WHERE id = ?", (json.dumps(privacy), user["id"]))
    conn.commit()
    # Собеседники сразу видят новый статус (или перестают его видеть)
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
    for uid in services.contact_ids(conn, user["id"]):
        vis = services.activity_visible(conn, row, uid)
        await manager.send_to_users([uid], {"type": "presence", "user_id": user["id"],
            "online": vis and manager.is_online(user["id"]), "last_seen": row["last_seen"] if vis else None})
    return privacy


class PrefsUpdate(BaseModel):
    palette: str | None = None              # id палитры (клиент знает набор) или "custom"
    accent: str | None = None               # #rrggbb для своей палитры
    wallpaper: dict | None = None           # {"type": "none"} | {"type":"preset","id":..} | {"type":"media","media_id":..}
    quick_reaction: str | None = None
    bubble_radius: int | None = None        # скругление пузырей сообщений, px (0–28)
    text_size: int | None = None            # размер текста сообщений, % (85–130)


@router.put("/profile/prefs")
def update_prefs(data: PrefsUpdate, user: sqlite3.Row = Depends(get_current_user),
                 conn: sqlite3.Connection = Depends(get_db)):
    import json
    prefs = services.get_prefs(user)
    sent = data.model_fields_set
    if "palette" in sent:
        if data.palette is not None and not _ID.match(data.palette):
            raise HTTPException(422, "Неверная палитра.")
        prefs["palette"] = data.palette
    if "accent" in sent:
        if data.accent is not None and not _HEX.match(data.accent):
            raise HTTPException(422, "Цвет должен быть в формате #rrggbb.")
        prefs["accent"] = data.accent
    if "quick_reaction" in sent:
        if data.quick_reaction not in config.ALLOWED_REACTIONS:
            raise HTTPException(422, "Эта реакция недоступна.")
        prefs["quick_reaction"] = data.quick_reaction
    if "bubble_radius" in sent:
        if data.bubble_radius is not None and not 0 <= data.bubble_radius <= 28:
            raise HTTPException(422, "Скругление должно быть от 0 до 28.")
        prefs["bubble_radius"] = data.bubble_radius
    if "text_size" in sent:
        if data.text_size is not None and not 85 <= data.text_size <= 130:
            raise HTTPException(422, "Размер текста должен быть от 85 до 130 %.")
        prefs["text_size"] = data.text_size
    if "wallpaper" in sent:
        w = data.wallpaper or {"type": "none"}
        kind = w.get("type")
        if kind == "none":
            prefs["wallpaper"] = {"type": "none"}
        elif kind == "preset" and isinstance(w.get("id"), str) and _ID.match(w["id"]):
            prefs["wallpaper"] = {"type": "preset", "id": w["id"]}
        elif kind == "media" and isinstance(w.get("media_id"), int) and not isinstance(w.get("media_id"), bool):
            _own_image(conn, w["media_id"], user["id"])
            prefs["wallpaper"] = {"type": "media", "media_id": w["media_id"], "url": f"/api/media/{w['media_id']}"}
        else:
            raise HTTPException(422, "Неверные обои.")
    conn.execute("UPDATE users SET prefs = ? WHERE id = ?", (json.dumps(prefs), user["id"]))
    return services.get_prefs(_user(conn, user["id"]))


# --- Музыка в профиле -----------------------------------------------------------------
class TrackCreate(BaseModel):
    media_id: int
    title: str = Field(min_length=1, max_length=80)
    artist: str | None = Field(None, max_length=80)


@router.post("/profile/tracks", status_code=201)
def add_track(data: TrackCreate, user: sqlite3.Row = Depends(get_current_user),
              conn: sqlite3.Connection = Depends(get_db)):
    media = conn.execute("SELECT owner_id, kind, mime FROM media WHERE id = ?", (data.media_id,)).fetchone()
    if media is None or media["owner_id"] != user["id"] or media["kind"] != "voice":
        raise HTTPException(400, "Нужен ваш загруженный аудиофайл.")
    count = conn.execute("SELECT COUNT(*) AS n FROM profile_tracks WHERE user_id = ?", (user["id"],)).fetchone()["n"]
    if count >= config.MAX_TRACKS:
        raise HTTPException(400, f"Не больше {config.MAX_TRACKS} треков в профиле.")
    title = " ".join(data.title.split())
    if not title:
        raise HTTPException(422, "Укажите название трека.")
    artist = " ".join((data.artist or "").split()) or None
    conn.execute("INSERT INTO profile_tracks (user_id, media_id, title, artist, created_at) VALUES (?, ?, ?, ?, ?)",
                 (user["id"], data.media_id, title, artist, services.now_iso()))
    return services.serialize_tracks(conn, user["id"])


@router.delete("/profile/tracks/{track_id}")
def delete_track(track_id: int, user: sqlite3.Row = Depends(get_current_user),
                 conn: sqlite3.Connection = Depends(get_db)):
    cur = conn.execute("DELETE FROM profile_tracks WHERE id = ? AND user_id = ?", (track_id, user["id"]))
    if cur.rowcount == 0:
        raise HTTPException(404, "Трек не найден.")
    return services.serialize_tracks(conn, user["id"])
