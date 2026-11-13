"""Telegram-бот: единственный канал регистрации и восстановления пароля.

Пользователь открывает ссылку t.me/<бот>?start=r_<ref> (регистрация) или ?start=x_<ref> (восстановление).
Бот получает /start, привязывает chat_id к попытке и присылает 6-значный код в чат.
Опрос getUpdates идёт в фоновом потоке. Без AQUA_TG_BOT_TOKEN модуль неактивен."""
import hashlib
import hmac
import json
import logging
import secrets
import sqlite3
import threading
import time
import urllib.error
import urllib.request

from . import config
from .database import connect

log = logging.getLogger("aqua.tg")
API = "https://api.telegram.org/bot{token}/{method}"


class TgError(Exception):
    """Telegram не принял запрос (нет соединения, бот заблокирован пользователем и т. п.)."""


def enabled() -> bool:
    return bool(config.TG_BOT_TOKEN and config.TG_BOT_USERNAME)


def bot_link() -> str:
    return f"https://t.me/{config.TG_BOT_USERNAME}"


def link_for(ref: str) -> str:
    return f"https://t.me/{config.TG_BOT_USERNAME}?start=x_{ref}"


def fmt_number(number: str) -> str:
    return f"+{number[0]} {number[1:4]} {number[4:7]}-{number[7:9]}-{number[9:11]}"


def number_for(conn, chat_id: int) -> str:
    """Номер, который бот выдаёт этому чату. Создаётся один раз и не меняется."""
    row = conn.execute("SELECT number FROM tg_numbers WHERE chat_id = ?", (chat_id,)).fetchone()
    if row:
        return row["number"]
    while True:
        number = "79" + "".join(secrets.choice("0123456789") for _ in range(9))
        try:
            conn.execute("INSERT INTO tg_numbers (number, chat_id, created_at) VALUES (?, ?, ?)",
                         (number, chat_id, time.time()))
            conn.commit()
            return number
        except sqlite3.IntegrityError:
            continue


def code_hash(ref: str, code: str) -> str:
    return hmac.new(config.SECRET_KEY.encode(), f"{ref}|{code}".encode(), hashlib.sha256).hexdigest()


def _call(method: str, payload: dict, timeout: int = 30) -> dict:
    req = urllib.request.Request(
        API.format(token=config.TG_BOT_TOKEN, method=method), data=json.dumps(payload).encode(), method="POST",
        headers={"Content-Type": "application/json", "User-Agent": "Aqua/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:                      # раньше URLError: это его подкласс
        raise TgError(f"HTTP {e.code}: {e.read().decode(errors='replace')[:300]}") from e
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as e:
        raise TgError(f"нет соединения: {type(e).__name__}") from e
    if not data.get("ok"):
        raise TgError(data.get("description", "ошибка"))
    return data


def _send(chat_id: int, text: str) -> None:
    _call("sendMessage", {"chat_id": chat_id, "text": text}, timeout=15)


def send_code(chat_id: int, code: str) -> None:
    _send(chat_id, f"Ваш код для Aqua: {code}\n\nКод действует 15 минут. Никому его не сообщайте.")


def new_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def _start_reset(conn, ref: str, chat_id: int) -> None:
    row = conn.execute("SELECT * FROM tg_refs WHERE ref = ?", (ref,)).fetchone()
    if not row or row["kind"] != "reset" or row["used"] or time.time() > row["expires_at"]:
        _send(chat_id, "Ссылка устарела. Начните заново в приложении Aqua.")
        return
    owner = conn.execute("SELECT tg_chat_id FROM users WHERE id = ?", (row["user_id"],)).fetchone()
    if not owner or owner["tg_chat_id"] != chat_id:           # код восстановления — только в чат владельца
        _send(chat_id, "Этот запрос создан для другого аккаунта.")
        return
    code = new_code()
    conn.execute("UPDATE tg_refs SET chat_id = ?, code_hash = ?, tries = 0 WHERE ref = ?",
                 (chat_id, code_hash(ref, code), ref))
    conn.commit()
    send_code(chat_id, code)


def _handle(update: dict) -> None:
    msg = update.get("message") or {}
    chat_id = (msg.get("chat") or {}).get("id")
    if not chat_id:
        return
    text = (msg.get("text") or "").strip()
    if not text.startswith("/start"):
        with connect() as conn:
            _send(chat_id, f"Ваш номер для Aqua: {fmt_number(number_for(conn, chat_id))}\n\nВведите его в приложении.")
        return
    payload = text[len("/start"):].strip()
    if payload.startswith("x_") and len(payload) > 2:       # восстановление пароля по ссылке из приложения
        with connect() as conn:
            _start_reset(conn, payload[2:], chat_id)
        return
    with connect() as conn:                                  # регистрация: бот выдаёт номер
        number = number_for(conn, chat_id)
    _send(chat_id, f"Ваш номер для Aqua: {fmt_number(number)}\n\nЭто не настоящий номер. Введите его в приложении, и сюда придёт код.")


def _poll_loop() -> None:
    offset = None
    while True:
        try:
            payload = {"timeout": 25, "allowed_updates": ["message"]}
            if offset is not None:
                payload["offset"] = offset
            for upd in _call("getUpdates", payload, timeout=35).get("result", []):
                offset = upd["update_id"] + 1
                try:
                    _handle(upd)
                except Exception as e:                        # один плохой апдейт не должен останавливать опрос
                    log.error("Telegram: апдейт не обработан: %s", e)
        except Exception as e:
            log.error("Telegram: опрос обновлений не удался: %s", e)
            time.sleep(5)


def start_polling() -> None:
    if not (enabled() and config.TG_POLLING):
        return
    threading.Thread(target=_poll_loop, name="aqua-tg-poll", daemon=True).start()
    log.info("Telegram: бот @%s принимает /start", config.TG_BOT_USERNAME)
