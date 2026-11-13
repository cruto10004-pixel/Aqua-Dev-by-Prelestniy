"""Регистрация с подтверждением почты (логин + почта + пароль) и восстановление пароля по почте.
Вход — только логин и пароль (routers/auth.py). Код одноразовый, живёт 10 минут, хранится только как HMAC.
Коды регистрации и восстановления хранятся в одной таблице, но разделены полем purpose — код
от одной цели нельзя использовать для другой."""
import hashlib
import hmac
import logging
import re
import secrets
import sqlite3
import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from . import config, tg
from .deps import get_db
from .mail import mail_ready, send_login_code
from .security import create_token, hash_password
from .services import now_iso, serialize_user
from .validators import validate_password, validate_username

log = logging.getLogger("aqua.email_auth")

router = APIRouter(prefix="/api/auth/register", tags=["auth"])
reset_router = APIRouter(prefix="/api/auth/reset", tags=["auth"])

EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,24}$")


def _norm_email(raw: str) -> str:
    email = (raw or "").strip().lower()
    if len(email) > 254 or not EMAIL_RE.match(email):
        raise HTTPException(422, "Введите корректный адрес почты.")
    return email


TG_RE = re.compile(r"^@?([A-Za-z][A-Za-z0-9_]{4,31})$")


def _norm_tg(raw: str) -> str:
    """Telegram-ник в виде «@name» (5–32 символа, латиница, цифры и _)."""
    m = TG_RE.match((raw or "").strip())
    if not m:
        raise HTTPException(422, "Введите Telegram-ник, например @name.")
    return "@" + m.group(1).lower()


def _code_hash(email: str, code: str) -> str:
    return hmac.new(config.SECRET_KEY.encode(), f"{email}|{code}".encode(), hashlib.sha256).hexdigest()


def _send_code(conn: sqlite3.Connection, email: str, purpose: str) -> dict:
    """Общая отправка одноразового кода: лимит частоты, HMAC-хранение, доставка.
    Контакт «@name» — код уходит в Telegram-бот, иначе — на почту (восстановление пароля)."""
    to_chat = None
    if email.startswith("@"):
        if not tg.enabled():
            raise HTTPException(503, "Сейчас это недоступно: Telegram-бот не настроен.")
        to_chat = tg.chat_id_for(conn, email)
        if to_chat is None:
            raise HTTPException(422, detail=f"Откройте бота @{config.TG_BOT_USERNAME}, нажмите Start и повторите.")
    elif not mail_ready():
        raise HTTPException(503, "Сейчас это недоступно: почта не настроена.")
    now = time.time()
    last = conn.execute(
        "SELECT created_at FROM email_codes WHERE email = ? AND purpose = ? ORDER BY id DESC LIMIT 1",
        (email, purpose)).fetchone()
    if last and now - last["created_at"] < config.EMAIL_CODE_COOLDOWN_SEC:
        wait = int(config.EMAIL_CODE_COOLDOWN_SEC - (now - last["created_at"])) + 1
        raise HTTPException(429, detail={"message": f"Код уже отправлен. Повторить можно через {wait} с.", "retry_after": wait})
    code = f"{secrets.randbelow(1_000_000):06d}"
    cur = conn.execute(
        "INSERT INTO email_codes (email, code_hash, created_at, expires_at, purpose) VALUES (?, ?, ?, ?, ?)",
        (email, _code_hash(email, code), now, now + config.EMAIL_CODE_TTL_SEC, purpose))
    new_id = cur.lastrowid
    conn.commit()
    try:
        if to_chat is not None:
            tg.send_code(to_chat, code)
        else:
            send_login_code(email, code, purpose=purpose)
    except Exception as e:
        # Письмо не ушло — код удаляем целиком: иначе он запустит кулдаун и пользователь будет ждать зря.
        conn.execute("DELETE FROM email_codes WHERE id = ?", (new_id,))
        conn.commit()
        log.error("Код (%s) не отправлен: %s: %s", purpose, type(e).__name__, e)
        raise HTTPException(503, "Не удалось отправить письмо. Попробуйте позже.")
    # Доставлено — прежние неиспользованные коды больше не действуют, живёт только новый.
    conn.execute("UPDATE email_codes SET used = 1 WHERE email = ? AND purpose = ? AND used = 0 AND id <> ?",
                 (email, purpose, new_id))
    conn.commit()
    return {"ok": True, "ttl": config.EMAIL_CODE_TTL_SEC, "cooldown": config.EMAIL_CODE_COOLDOWN_SEC}


def _verify_code(conn: sqlite3.Connection, email: str, code: str, purpose: str) -> None:
    """Проверяет код; бросает HTTPException с понятным сообщением, если он неверный/истёк."""
    row = conn.execute(
        "SELECT * FROM email_codes WHERE email = ? AND purpose = ? AND used = 0 ORDER BY id DESC LIMIT 1",
        (email, purpose)).fetchone()
    if not row or time.time() > row["expires_at"]:
        raise HTTPException(400, "Код истёк или не запрашивался. Запросите новый.")
    if row["tries"] >= config.EMAIL_CODE_MAX_TRIES:
        conn.execute("UPDATE email_codes SET used = 1 WHERE id = ?", (row["id"],)); conn.commit()
        raise HTTPException(429, "Слишком много неверных попыток. Запросите новый код.")
    if not hmac.compare_digest(row["code_hash"], _code_hash(email, code)):
        conn.execute("UPDATE email_codes SET tries = tries + 1 WHERE id = ?", (row["id"],)); conn.commit()
        raise HTTPException(400, f"Неверный код. Осталось попыток: {config.EMAIL_CODE_MAX_TRIES - row['tries'] - 1}.")
    conn.execute("UPDATE email_codes SET used = 1 WHERE id = ?", (row["id"],)); conn.commit()


class RegisterStart(BaseModel):
    username: str = Field(max_length=64)
    password: str = Field(max_length=256)
    email: str = Field(max_length=254)


class RegisterFinish(RegisterStart):
    code: str = Field(max_length=12)


def _check_fields(conn: sqlite3.Connection, data: RegisterStart) -> tuple[str, str]:
    """data.email здесь — Telegram-ник (поле оставлено прежним для совместимости API)."""
    username = data.username.strip()
    contact = _norm_tg(data.email)
    u_err, p_err = validate_username(username), validate_password(data.password)
    if u_err or p_err:
        raise HTTPException(422, detail={"message": "Проверьте введённые данные.", "username_errors": u_err, "password_errors": p_err})
    if conn.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
        raise HTTPException(409, "Это имя пользователя уже занято.")
    if conn.execute("SELECT 1 FROM users WHERE email = ?", (contact,)).fetchone():
        raise HTTPException(409, "Этот Telegram-ник уже привязан к аккаунту.")
    return username, contact


@router.post("/code")
def send_code(data: RegisterStart, conn: sqlite3.Connection = Depends(get_db)):
    """Шаг 1: проверяем логин/пароль/почту и отправляем код на почту."""
    username, email = _check_fields(conn, data)
    return _send_code(conn, email, "register")


@router.post("", status_code=201)
def register(data: RegisterFinish, conn: sqlite3.Connection = Depends(get_db)):
    """Шаг 2: код верный — создаём аккаунт с этой почтой."""
    username, email = _check_fields(conn, data)
    _verify_code(conn, email, (data.code or "").strip(), "register")
    cur = conn.execute("INSERT INTO users (username, password_hash, created_at, email) VALUES (?, ?, ?, ?)",
                       (username, hash_password(data.password), now_iso(), email))
    conn.commit()
    user = conn.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()
    return {"token": create_token(user["id"]), "token_type": "bearer", "user": serialize_user(user)}


# ---------------------------- Восстановление пароля ----------------------------

class ResetStart(BaseModel):
    email: str = Field(max_length=254)


class ResetFinish(BaseModel):
    email: str = Field(max_length=254)
    code: str = Field(max_length=12)
    password: str = Field(max_length=256)


@reset_router.post("/code")
def send_reset_code(data: ResetStart, conn: sqlite3.Connection = Depends(get_db)):
    """Шаг 1: если почта привязана к аккаунту — шлём код для сброса пароля."""
    email = _norm_email(data.email)
    if not conn.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
        raise HTTPException(404, "Аккаунт с такой почтой не найден.")
    return _send_code(conn, email, "reset")


@reset_router.post("")
def reset_password(data: ResetFinish, conn: sqlite3.Connection = Depends(get_db)):
    """Шаг 2: код верный — меняем пароль и сразу логиним пользователя."""
    email = _norm_email(data.email)
    p_err = validate_password(data.password)
    if p_err:
        raise HTTPException(422, detail={"message": "Проверьте пароль.", "password_errors": p_err})
    user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if not user:
        raise HTTPException(404, "Аккаунт с такой почтой не найден.")
    _verify_code(conn, email, (data.code or "").strip(), "reset")
    conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(data.password), user["id"]))
    conn.commit()
    user = conn.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
    return {"token": create_token(user["id"]), "token_type": "bearer", "user": serialize_user(user)}
