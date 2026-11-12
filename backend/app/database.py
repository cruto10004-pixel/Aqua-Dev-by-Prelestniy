"""Работа с SQLite: подключение и схема БД.

Для MVP используется стандартный sqlite3. Схема написана на переносимом SQL,
переход на PostgreSQL потребует лишь замены типов/плейсхолдеров.
"""
import sqlite3
from contextlib import contextmanager
from pathlib import Path

from .config import DB_PATH

SCHEMA = """
-- Пользователи. Только username + хеш пароля (никаких email/телефонов).
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT    NOT NULL,            -- bcrypt, соль внутри хеша
    created_at    TEXT    NOT NULL,
    last_seen     TEXT,                         -- обновляется при выходе из сети
    display_name  TEXT,                         -- «ник»: показывается в чатах (логин остаётся для входа)
    bio           TEXT,                         -- описание профиля
    avatar_id     INTEGER REFERENCES media(id) ON DELETE SET NULL,
    privacy       TEXT,                         -- JSON: кто может писать / звонить / слать голосовые
    prefs         TEXT                          -- JSON: тема, обои, быстрая реакция (следуют за аккаунтом)
);

-- Чаты: личные (direct) и групповые (group).
CREATE TABLE IF NOT EXISTS chats (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    type       TEXT    NOT NULL CHECK (type IN ('direct', 'group')),
    title      TEXT,                            -- только для групп
    direct_key TEXT    UNIQUE,                  -- "minId:maxId" — защита от дублей личных чатов
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT    NOT NULL
);

-- Участники чатов (связь многие-ко-многим).
CREATE TABLE IF NOT EXISTS chat_members (
    chat_id   INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role      TEXT    NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
    joined_at TEXT    NOT NULL,
    PRIMARY KEY (chat_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_members_user ON chat_members(user_id);

-- Загруженные файлы. На диске лежат под случайным именем stored_name.
CREATE TABLE IF NOT EXISTS media (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    original_name TEXT    NOT NULL,
    stored_name   TEXT    NOT NULL UNIQUE,
    mime          TEXT    NOT NULL,
    size          INTEGER NOT NULL,
    kind          TEXT    NOT NULL CHECK (kind IN ('image', 'video', 'voice', 'file')),
    created_at    TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_media_owner ON media(owner_id, id DESC);

-- Сообщения. Текст и/или вложение.
CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id    INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    sender_id  INTEGER NOT NULL REFERENCES users(id),
    kind       TEXT    NOT NULL DEFAULT 'text'
               CHECK (kind IN ('text', 'image', 'video', 'voice', 'file')),
    text       TEXT,
    media_id   INTEGER REFERENCES media(id) ON DELETE SET NULL,
    meta       TEXT,                           -- JSON: для голосовых {duration, wave}
    cover_id   INTEGER REFERENCES media(id) ON DELETE SET NULL,   -- обложка видео (картинка из media)
    created_at TEXT    NOT NULL,
    edited_at  TEXT                            -- когда сообщение изменили (NULL — не менялось)
);
-- Основной индекс для пагинации истории: последние N сообщений чата.
CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, id DESC);

-- Музыка в профиле (как в Telegram): трек = аудиофайл из media + название/исполнитель.
CREATE TABLE IF NOT EXISTS profile_tracks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    media_id   INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    title      TEXT    NOT NULL,
    artist     TEXT,
    created_at TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tracks_user ON profile_tracks(user_id, id);

-- Все аватарки пользователя (карусель в профиле); текущая — users.avatar_id.
CREATE TABLE IF NOT EXISTS user_avatars (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    media_id   INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    created_at TEXT    NOT NULL,
    UNIQUE (user_id, media_id)
);
CREATE INDEX IF NOT EXISTS idx_user_avatars ON user_avatars(user_id, id);

-- Контакты и чёрный список (односторонние: «я добавил» / «я заблокировал»).
CREATE TABLE IF NOT EXISTS contacts (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contact_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT    NOT NULL,
    PRIMARY KEY (user_id, contact_id)
);
CREATE TABLE IF NOT EXISTS blocks (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT    NOT NULL,
    PRIMARY KEY (user_id, blocked_id)
);

-- «Удалить у себя»: сообщение скрыто только для этого пользователя.
CREATE TABLE IF NOT EXISTS message_hidden (
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (message_id, user_id)
);

-- Реакции: одна пара (сообщение, пользователь, эмодзи) — одна строка.
CREATE TABLE IF NOT EXISTS reactions (
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji      TEXT    NOT NULL,
    created_at TEXT    NOT NULL,
    PRIMARY KEY (message_id, user_id, emoji)
);
-- Стикеры: паки (создаёт и наполняет только владелец), «мои паки», недавние (последние 30) и избранные.
CREATE TABLE IF NOT EXISTS sticker_packs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      TEXT    NOT NULL,
    created_at TEXT    NOT NULL
);
CREATE TABLE IF NOT EXISTS stickers (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    pack_id    INTEGER NOT NULL REFERENCES sticker_packs(id) ON DELETE CASCADE,
    media_id   INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    created_at TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stickers_pack ON stickers(pack_id, id);
CREATE INDEX IF NOT EXISTS idx_stickers_media ON stickers(media_id);
CREATE TABLE IF NOT EXISTS user_packs (
    user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pack_id  INTEGER NOT NULL REFERENCES sticker_packs(id) ON DELETE CASCADE,
    added_at TEXT    NOT NULL,
    PRIMARY KEY (user_id, pack_id)
);
CREATE TABLE IF NOT EXISTS sticker_recent (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sticker_id INTEGER NOT NULL REFERENCES stickers(id) ON DELETE CASCADE,
    used_at    TEXT    NOT NULL,
    PRIMARY KEY (user_id, sticker_id)
);
CREATE TABLE IF NOT EXISTS sticker_favs (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sticker_id INTEGER NOT NULL REFERENCES stickers(id) ON DELETE CASCADE,
    added_at   TEXT    NOT NULL,
    PRIMARY KEY (user_id, sticker_id)
);

-- Сохранённые GIF (у GIF нет «недавних»: сюда попадают все отправленные и сохранённые гифки).
CREATE TABLE IF NOT EXISTS saved_gifs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    media_id   INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    created_at TEXT    NOT NULL,
    UNIQUE (user_id, media_id)
);
CREATE INDEX IF NOT EXISTS idx_saved_gifs ON saved_gifs(user_id, id DESC);
"""


def _open(path: Path) -> sqlite3.Connection:
    # check_same_thread=False: FastAPI выполняет sync-зависимости и эндпоинты
    # в разных потоках пула; одно соединение используется только одним запросом.
    conn = sqlite3.connect(path, check_same_thread=False, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")     # в SQLite выключено по умолчанию
    return conn


@contextmanager
def connect(path: Path = DB_PATH):
    """Соединение с автокоммитом при успехе и откатом при ошибке."""
    conn = _open(path)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db(path: Path = DB_PATH) -> None:
    """Создаёт таблицы (идемпотентно) и включает WAL для параллельного чтения."""
    conn = _open(path)
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
        # Миграция для баз, созданных на Этапе 1 (без столбца meta)
        cols = {r["name"] for r in conn.execute("PRAGMA table_info(messages)")}
        if "meta" not in cols:
            conn.execute("ALTER TABLE messages ADD COLUMN meta TEXT")
        if "edited_at" not in cols:
            conn.execute("ALTER TABLE messages ADD COLUMN edited_at TEXT")
        if "cover_id" not in cols:
            conn.execute("ALTER TABLE messages ADD COLUMN cover_id INTEGER REFERENCES media(id) ON DELETE SET NULL")
        # Блок 7: каналы — признак канала и публичный @username (канал = группа с is_channel=1)
        ccols = {r["name"] for r in conn.execute("PRAGMA table_info(chats)")}
        if "is_channel" not in ccols:
            conn.execute("ALTER TABLE chats ADD COLUMN is_channel INTEGER NOT NULL DEFAULT 0")
        if "username" not in ccols:
            conn.execute("ALTER TABLE chats ADD COLUMN username TEXT")
        if "description" not in ccols:
            conn.execute("ALTER TABLE chats ADD COLUMN description TEXT NOT NULL DEFAULT ''")
        conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_chats_username ON chats(username)")
        # Вход/регистрация по почте: адрес (уникальный, без учёта регистра) и одноразовые коды
        ucols = {r["name"] for r in conn.execute("PRAGMA table_info(users)")}
        if "email" not in ucols:
            conn.execute("ALTER TABLE users ADD COLUMN email TEXT COLLATE NOCASE")
        conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)")
        conn.execute("""CREATE TABLE IF NOT EXISTS email_codes (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            email       TEXT    NOT NULL COLLATE NOCASE,
            code_hash   TEXT    NOT NULL,
            created_at  REAL    NOT NULL,
            expires_at  REAL    NOT NULL,
            tries       INTEGER NOT NULL DEFAULT 0,
            used        INTEGER NOT NULL DEFAULT 0)""")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_email_codes_email ON email_codes(email)")
        # Блок 4: пересланные, закреплённое сообщение, прочитанность
        if "fwd" not in cols:
            conn.execute("ALTER TABLE messages ADD COLUMN fwd TEXT")
        ccols = {r["name"] for r in conn.execute("PRAGMA table_info(chats)")}
        if "pinned_id" not in ccols:
            conn.execute("ALTER TABLE chats ADD COLUMN pinned_id INTEGER")
        mcols = {r["name"] for r in conn.execute("PRAGMA table_info(chat_members)")}
        if "last_read_id" not in mcols:
            conn.execute("ALTER TABLE chat_members ADD COLUMN last_read_id INTEGER NOT NULL DEFAULT 0")
        # Миграция Этапа 6: поля профиля
        ucols = {r["name"] for r in conn.execute("PRAGMA table_info(users)")}
        for col, ddl in (("display_name", "TEXT"), ("bio", "TEXT"),
                         ("avatar_id", "INTEGER REFERENCES media(id) ON DELETE SET NULL"),
                         ("privacy", "TEXT"), ("prefs", "TEXT"), ("avatar_preset", "TEXT")):
            if col not in ucols:
                conn.execute(f"ALTER TABLE users ADD COLUMN {col} {ddl}")
        # Ранее загруженные аватарки попадают в галерею
        conn.execute("""INSERT OR IGNORE INTO user_avatars (user_id, media_id, created_at)
                        SELECT id, avatar_id, created_at FROM users WHERE avatar_id IS NOT NULL""")
        conn.commit()
    finally:
        conn.close()
