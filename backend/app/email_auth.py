"""Регистрация с подтверждением почты: логин + пароль + код из письма. Вход — только логин и пароль (routers/auth.py).
Код одноразовый, живёт 10 минут, хранится только как HMAC."""
import hashlib
import hmac
import re
import secrets
import sqlite3
import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from . import config
from .deps import get_db
from .mail import mail_ready, send_login_code
from .security import create_token, hash_password
from .services import now_iso, serialize_user
from .validators import validate_password, validate_username

router = APIRouter(prefix="/api/auth/register", tags=["auth"])

EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,24}$")


def _norm_email(raw: str) -> str:
    email = (raw or "").strip().lower()
    if len(email) > 254 or not EMAIL_RE.match(email):
        raise HTTPException(422, "Введите корректный адрес почты.")
    return email


def _code_hash(email: str, code: str) -> str:
    return hmac.new(config.SECRET_KEY.encode(), f"{email}|{code}".encode(), hashlib.sha256).hexdigest()


class RegisterStart(BaseModel):
    username: str = Field(max_length=64)
    password: str = Field(max_length=256)
    email: str = Field(max_length=254)


class RegisterFinish(RegisterStart):
    code: str = Field(max_length=12)


def _check_fields(conn: sqlite3.Connection, data: RegisterStart) -> tuple[str, str]:
    username = data.username.strip()
    email = _norm_email(data.email)
    u_err, p_err = validate_username(username), validate_password(data.password)
    if u_err or p_err:
        raise HTTPException(422, detail={"message": "Проверьте введённые данные.", "username_errors": u_err, "password_errors": p_err})
    if conn.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
        raise HTTPException(409, "Это имя пользователя уже занято.")
    if conn.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
        raise HTTPException(409, "Эта почта уже используется.")
    return username, email


@router.post("/code")
def send_code(data: RegisterStart, conn: sqlite3.Connection = Depends(get_db)):
    """Шаг 1: проверяем логин/пароль/почту и отправляем код на почту."""
    username, email = _check_fields(conn, data)
    if not mail_ready():
        raise HTTPException(503, "Регистрация временно недоступна: почта не настроена.")
    now = time.time()
    last = conn.execute("SELECT created_at FROM email_codes WHERE email = ? ORDER BY id DESC LIMIT 1", (email,)).fetchone()
    if last and now - last["created_at"] < config.EMAIL_CODE_COOLDOWN_SEC:
        wait = int(config.EMAIL_CODE_COOLDOWN_SEC - (now - last["created_at"])) + 1
        raise HTTPException(429, f"Код уже отправлен. Повторить можно через {wait} с.")
    code = f"{secrets.randbelow(1_000_000):06d}"
    conn.execute("UPDATE email_codes SET used = 1 WHERE email = ? AND used = 0", (email,))
    conn.execute("INSERT INTO email_codes (email, code_hash, created_at, expires_at) VALUES (?, ?, ?, ?)",
                 (email, _code_hash(email, code), now, now + config.EMAIL_CODE_TTL_SEC))
    conn.commit()
    try:
        send_login_code(email, code)
    except Exception:                              # SMTP недоступен или не настроен
        conn.execute("UPDATE email_codes SET used = 1 WHERE email = ? AND used = 0", (email,))
        conn.commit()
        raise HTTPException(503, "Не удалось отправить письмо. Попробуйте позже.")
    return {"ok": True, "ttl": config.EMAIL_CODE_TTL_SEC, "cooldown": config.EMAIL_CODE_COOLDOWN_SEC}


@router.post("", status_code=201)
def register(data: RegisterFinish, conn: sqlite3.Connection = Depends(get_db)):
    """Шаг 2: код верный — создаём аккаунт с этой почтой."""
    username, email = _check_fields(conn, data)
    code = (data.code or "").strip()
    row = conn.execute("SELECT * FROM email_codes WHERE email = ? AND used = 0 ORDER BY id DESC LIMIT 1", (email,)).fetchone()
    if not row or time.time() > row["expires_at"]:
        raise HTTPException(400, "Код истёк или не запрашивался. Запросите новый.")
    if row["tries"] >= config.EMAIL_CODE_MAX_TRIES:
        conn.execute("UPDATE email_codes SET used = 1 WHERE id = ?", (row["id"],)); conn.commit()
        raise HTTPException(429, "Слишком много неверных попыток. Запросите новый код.")
    if not hmac.compare_digest(row["code_hash"], _code_hash(email, code)):
        conn.execute("UPDATE email_codes SET tries = tries + 1 WHERE id = ?", (row["id"],)); conn.commit()
        raise HTTPException(400, f"Неверный код. Осталось попыток: {config.EMAIL_CODE_MAX_TRIES - row['tries'] - 1}.")
    conn.execute("UPDATE email_codes SET used = 1 WHERE id = ?", (row["id"],))
    cur = conn.execute("INSERT INTO users (username, password_hash, created_at, email) VALUES (?, ?, ?, ?)",
                       (username, hash_password(data.password), now_iso(), email))
    conn.commit()
    user = conn.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()
    return {"token": create_token(user["id"]), "token_type": "bearer", "user": serialize_user(user)}
