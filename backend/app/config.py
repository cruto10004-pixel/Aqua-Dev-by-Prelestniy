"""Конфигурация сервера Aqua.

Все настройки читаются из переменных окружения, у каждой есть безопасное
значение по умолчанию для локальной разработки.
"""
import os
import secrets
from pathlib import Path

# --- Пути ---------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parents[2]          # корень проекта aqua/
# Где хранятся база и загрузки. Порядок: AQUA_DATA_DIR → том Railway (RAILWAY_VOLUME_MOUNT_PATH, задаётся
# автоматически, когда к сервису подключён Volume) → папка data/ в проекте (на Railway она стирается при деплое!).
_VOLUME = os.getenv("AQUA_DATA_DIR") or os.getenv("RAILWAY_VOLUME_MOUNT_PATH")
DATA_DIR = Path(_VOLUME) if _VOLUME else BASE_DIR / "data"
DATA_PERSISTENT = bool(_VOLUME)          # False — данные пропадут при перезапуске/деплое в облаке
UPLOAD_DIR = DATA_DIR / "uploads"
DB_PATH = Path(os.getenv("AQUA_DB_PATH", DATA_DIR / "aqua.db"))
FRONTEND_DIR = BASE_DIR / "frontend"

DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def _load_secret_key() -> str:
    """Секрет для подписи JWT.

    Берём из AQUA_SECRET_KEY; если не задан — генерируем один раз и
    сохраняем в data/secret.key (права 600), чтобы токены переживали перезапуск.
    В продакшене лучше задавать переменную окружения явно.
    """
    env_key = os.getenv("AQUA_SECRET_KEY")
    if env_key:
        return env_key
    key_file = DATA_DIR / "secret.key"
    if key_file.exists():
        return key_file.read_text().strip()
    key = secrets.token_urlsafe(64)
    key_file.write_text(key)
    os.chmod(key_file, 0o600)
    return key


# --- Аутентификация ------------------------------------------------------
SECRET_KEY = _load_secret_key()
JWT_ALGORITHM = "HS256"
JWT_TTL_HOURS = int(os.getenv("AQUA_JWT_TTL_HOURS", 24 * 7))
BCRYPT_ROUNDS = int(os.getenv("AQUA_BCRYPT_ROUNDS", 12))

# Ограничение попыток входа: не более N неудач за окно (секунды)
LOGIN_MAX_FAILS = 5
LOGIN_WINDOW_SEC = 300

# --- Сообщения и медиа ---------------------------------------------------
MAX_MESSAGE_LENGTH = 4000
MAX_VOICE_SECONDS = 600                 # голосовое не длиннее 10 минут

# Допустимые эмодзи-реакции. Список и порядок совпадают с js/config.js (REACTIONS).
# ❤️ записано с селектором вариации U+FE0F — строки должны совпадать побайтно.
ALLOWED_REACTIONS = ["\U0001F44D", "\u2764\ufe0f", "\U0001F602", "\U0001F62E",
                     "\U0001F622", "\U0001F525", "\U0001F44F", "\U0001F389",
                     # негативные реакции
                     "\U0001F44E", "\U0001F92C", "\U0001F4A9", "\U0001F921"]
# --- Профиль ------------------------------------------------------------------
DISPLAY_NAME_MAX = 40
BIO_MAX = 300
MAX_TRACKS = 20
PRIVACY_FIELDS = ("who_can_write", "who_can_voice")            # правила «кому можно»: все / только выбранные / все кроме
PRIVACY_VALUES = ("everyone", "selected", "except")
ACTIVITY_MODES = ("none", "all", "selected", "noncontacts")     # скрывать активность: никому / от всех / от выбранных / от неконтактов
PRIVACY_MAX_USERS = 500
DEFAULT_PRIVACY = {f: {"mode": "everyone", "users": []} for f in PRIVACY_FIELDS}
DEFAULT_QUICK_REACTION = ALLOWED_REACTIONS[0]
MAX_UPLOAD_MB = int(os.getenv("AQUA_MAX_UPLOAD_MB", 50))
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024

# Белый список MIME -> (расширение на диске, тип вложения).
# Расширение выбираем сами и не доверяем имени файла от клиента.
# SVG намеренно исключён: в нём может быть JavaScript (XSS).
ALLOWED_MIME = {
    "image/jpeg": (".jpg", "image"),
    "image/png": (".png", "image"),
    "image/gif": (".gif", "image"),
    "image/webp": (".webp", "image"),
    "video/mp4": (".mp4", "video"),
    "video/webm": (".webm", "video"),
    "video/quicktime": (".mov", "video"),
    "audio/webm": (".weba", "voice"),   # MediaRecorder в Chrome/Firefox/Edge
    "audio/ogg": (".ogg", "voice"),
    "audio/mp4": (".m4a", "voice"),     # MediaRecorder в Safari
    "audio/mpeg": (".mp3", "voice"),
    "audio/wav": (".wav", "voice"),
    "application/pdf": (".pdf", "file"),
    "application/zip": (".zip", "file"),
    "text/plain": (".txt", "file"),
}

# Системные аватарки: файлы лежат в frontend/assets/avatars/<id>.svg
AVATAR_PRESETS = ("wave", "fish", "shell", "anchor", "starfish", "sun", "moon", "drop", "boat", "jelly", "turtle", "pearl")

# --- GIF-поиск -------------------------------------------------------------------
# Tenor API закрыт Google (2026), поэтому поддерживаем GIPHY и Klipy. Ключ задаётся переменной окружения;
# если заданы оба, используется Klipy. Без ключа вкладка GIF показывает подсказку.
GIPHY_API_KEY = os.getenv("GIPHY_API_KEY", "").strip()
KLIPY_API_KEY = os.getenv("KLIPY_API_KEY", "").strip()
# Скачивать и проксировать разрешено только с доменов GIF-сервисов (защита от SSRF).
GIF_HOST_SUFFIXES = ("giphy.com", "klipy.com", "klipy.co")
GIF_MAX_BYTES = 10 * 1024 * 1024
GIF_PAGE_SIZE = 24

# --- CORS ------------------------------------------------------------------
# По умолчанию фронтенд отдаётся с того же origin, CORS не нужен.
CORS_ORIGINS = [o for o in os.getenv("AQUA_CORS_ORIGINS", "").split(",") if o]

# --- Заголовки безопасности -------------------------------------------------
# CSP: скрипты и стили только свои (style-attr нужен для динамических --h/--hue и позиций).
# blob: — локальные превью/плеер до отправки; ws:/wss: — WebSocket того же хоста.
CONTENT_SECURITY_POLICY = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self'; style-src-attr 'unsafe-inline'; "
    "img-src 'self' blob: data:; media-src 'self' blob:; "
    "connect-src 'self' ws: wss:; "
    "object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
)


# --- Вход/регистрация по коду из письма ----------------------------------------
# SMTP задаётся переменными окружения. Без SMTP письма не уходят: в проде коды не
# пишутся в лог; локально можно включить AQUA_EMAIL_DEV=1 — тогда код печатается в консоль.
SMTP_HOST = os.getenv("AQUA_SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("AQUA_SMTP_PORT", "587"))
SMTP_USER = os.getenv("AQUA_SMTP_USER", "").strip()
SMTP_PASSWORD = os.getenv("AQUA_SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("AQUA_SMTP_FROM", "").strip() or SMTP_USER
EMAIL_DEV = os.getenv("AQUA_EMAIL_DEV", "") == "1"
EMAIL_CODE_TTL_SEC = 600          # код живёт 10 минут
EMAIL_CODE_COOLDOWN_SEC = 60      # повторно можно запросить через минуту
EMAIL_CODE_MAX_TRIES = 5          # после 5 неверных вводов код сгорает
EMAIL_TICKET_TTL_SEC = 900        # время на выбор имени после подтверждения почты
