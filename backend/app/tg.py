"""Telegram-бот для регистрации: код приходит в чат пользователю.

Бот не может написать первым, поэтому пользователь сначала нажимает Start в боте.
Опрос обновлений (getUpdates) запоминает ник → chat_id в таблице tg_chats.
Без AQUA_TG_BOT_TOKEN модуль просто не активен."""
import json
import logging
import threading
import time
import urllib.error
import urllib.request

from . import config
from .database import connect
from .mail import MailDeliveryError

log = logging.getLogger("aqua.tg")
API = "https://api.telegram.org/bot{token}/{method}"


def enabled() -> bool:
    return bool(config.TG_BOT_TOKEN and config.TG_BOT_USERNAME)


def _call(method: str, payload: dict, timeout: int = 30) -> dict:
    req = urllib.request.Request(
        API.format(token=config.TG_BOT_TOKEN, method=method), data=json.dumps(payload).encode(), method="POST",
        headers={"Content-Type": "application/json", "User-Agent": "Aqua/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:                      # раньше URLError: это его подкласс
        raise MailDeliveryError(f"telegram: HTTP {e.code}: {e.read().decode(errors='replace')[:300]}") from e
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as e:
        raise MailDeliveryError(f"telegram: нет соединения: {type(e).__name__}") from e
    if not data.get("ok"):
        raise MailDeliveryError(f"telegram: {data.get('description', 'ошибка')}")
    return data


def chat_id_for(conn, contact: str) -> int | None:
    """contact — вида «@name»."""
    row = conn.execute("SELECT chat_id FROM tg_chats WHERE username = ?", (contact[1:],)).fetchone()
    return row["chat_id"] if row else None


def send_code(chat_id: int, code: str) -> None:
    text = f"Ваш код для регистрации в Aqua: {code}\n\nКод действует 10 минут. Никому его не сообщайте."
    _call("sendMessage", {"chat_id": chat_id, "text": text})


def _remember(username: str, chat_id: int) -> None:
    with connect() as conn:
        conn.execute(
            "INSERT INTO tg_chats (username, chat_id, updated_at) VALUES (?, ?, ?) "
            "ON CONFLICT(username) DO UPDATE SET chat_id = excluded.chat_id, updated_at = excluded.updated_at",
            (username, chat_id, time.time()))
        conn.commit()


def _handle(update: dict) -> None:
    msg = update.get("message") or {}
    username = (msg.get("from") or {}).get("username")
    chat_id = (msg.get("chat") or {}).get("id")
    if not username or not chat_id:
        return                                               # у пользователя без ника код не отправить
    _remember(username, chat_id)
    if (msg.get("text") or "").startswith("/start"):
        _call("sendMessage", {"chat_id": chat_id, "text":
              "Готово! Вернитесь в Aqua и нажмите «Получить код»."}, timeout=15)


def _poll_loop() -> None:
    offset = None
    while True:
        try:
            payload = {"timeout": 25, "allowed_updates": ["message"]}
            if offset is not None:
                payload["offset"] = offset
            for upd in _call("getUpdates", payload, timeout=35).get("result", []):
                offset = upd["update_id"] + 1
                _handle(upd)
        except Exception as e:                                # сеть недоступна — подождать и повторить
            log.error("Telegram: опрос обновлений не удался: %s", e)
            time.sleep(5)


def start_polling() -> None:
    if not (enabled() and config.TG_POLLING):
        return
    threading.Thread(target=_poll_loop, name="aqua-tg-poll", daemon=True).start()
    log.info("Telegram: бот @%s слушает /start", config.TG_BOT_USERNAME)
