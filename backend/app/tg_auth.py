"""Регистрация и восстановление пароля через Telegram-бота (без почты).

1) Фронтенд шлёт логин+пароль (или логин для восстановления) → сервер создаёт попытку (ref) и отдаёт ссылку на бота.
2) Пользователь открывает ссылку и нажимает Start → бот присылает код в чат.
3) Фронтенд шлёт ref+код → аккаунт создан или пароль заменён. Чат записывается в users.tg_chat_id."""
import hmac
import secrets
import sqlite3
import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from . import config, tg
from .deps import get_db
from .security import create_token, hash_password
from .services import now_iso, serialize_user
from .validators import validate_password, validate_username

router = APIRouter(prefix="/api/auth/register", tags=["auth"])
reset_router = APIRouter(prefix="/api/auth/reset", tags=["auth"])


class RegisterStart(BaseModel):
    username: str = Field(max_length=64)
    password: str = Field(max_length=256)


class RegisterFinish(BaseModel):
    ref: str = Field(max_length=64)
    code: str = Field(max_length=12)


class ResetStart(BaseModel):
    username: str = Field(max_length=64)


class ResetFinish(BaseModel):
    ref: str = Field(max_length=64)
    code: str = Field(max_length=12)
    password: str = Field(max_length=256)


def _new_attempt(conn: sqlite3.Connection, kind: str, **fields) -> dict:
    if not tg.enabled():
        raise HTTPException(503, "Сейчас это недоступно: Telegram-бот не настроен.")
    ref = secrets.token_urlsafe(12)
    now = time.time()
    conn.execute(
        "INSERT INTO tg_refs (ref, kind, username, password_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (ref, kind, fields.get("username"), fields.get("password_hash"), fields.get("user_id"),
         now, now + config.TG_REF_TTL_SEC))
    conn.commit()
    return {"ref": ref, "link": tg.link_for(ref, kind), "ttl": config.TG_REF_TTL_SEC}


def _check_code(conn: sqlite3.Connection, ref: str, kind: str, code: str):
    """Проверяет код попытки; возвращает строку tg_refs или бросает HTTPException."""
    row = conn.execute("SELECT * FROM tg_refs WHERE ref = ? AND kind = ?", (ref, kind)).fetchone()
    if not row or row["used"] or time.time() > row["expires_at"] or not row["code_hash"]:
        raise HTTPException(400, "Код не запрошен или истёк. Начните заново.")
    if row["tries"] >= config.TG_CODE_MAX_TRIES:
        conn.execute("UPDATE tg_refs SET used = 1 WHERE ref = ?", (ref,)); conn.commit()
        raise HTTPException(429, "Слишком много неверных попыток. Начните заново.")
    if not hmac.compare_digest(row["code_hash"], tg.code_hash(ref, code)):
        conn.execute("UPDATE tg_refs SET tries = tries + 1 WHERE ref = ?", (ref,)); conn.commit()
        raise HTTPException(400, f"Неверный код. Осталось попыток: {config.TG_CODE_MAX_TRIES - row['tries'] - 1}.")
    return row


def _mark_used(conn: sqlite3.Connection, ref: str) -> None:
    conn.execute("UPDATE tg_refs SET used = 1 WHERE ref = ?", (ref,))
    conn.commit()


@router.post("/code")
def register_start(data: RegisterStart, conn: sqlite3.Connection = Depends(get_db)):
    """Шаг 1: проверяем логин и пароль, отдаём ссылку на бота."""
    username = data.username.strip()
    u_err, p_err = validate_username(username), validate_password(data.password)
    if u_err or p_err:
        raise HTTPException(422, detail={"message": "Проверьте введённые данные.", "username_errors": u_err, "password_errors": p_err})
    if conn.execute("SELECT 1 FROM users WHERE username = ? COLLATE NOCASE", (username,)).fetchone():
        raise HTTPException(409, "Это имя пользователя уже занято.")
    return _new_attempt(conn, "register", username=username, password_hash=hash_password(data.password))


@router.post("", status_code=201)
def register(data: RegisterFinish, conn: sqlite3.Connection = Depends(get_db)):
    """Шаг 2: код из бота верный — создаём аккаунт, привязанный к этому Telegram."""
    row = _check_code(conn, data.ref, "register", (data.code or "").strip())
    if conn.execute("SELECT 1 FROM users WHERE tg_chat_id = ?", (row["chat_id"],)).fetchone():
        raise HTTPException(409, "Этот Telegram уже привязан к аккаунту.")
    if conn.execute("SELECT 1 FROM users WHERE username = ? COLLATE NOCASE", (row["username"],)).fetchone():
        raise HTTPException(409, "Это имя пользователя уже занято.")
    cur = conn.execute(
        "INSERT INTO users (username, password_hash, created_at, tg_chat_id) VALUES (?, ?, ?, ?)",
        (row["username"], row["password_hash"], now_iso(), row["chat_id"]))
    _mark_used(conn, data.ref)
    user = conn.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()
    return {"token": create_token(user["id"]), "token_type": "bearer", "user": serialize_user(user)}


# ---------------------------- Восстановление пароля ----------------------------

@reset_router.post("/code")
def reset_start(data: ResetStart, conn: sqlite3.Connection = Depends(get_db)):
    """Шаг 1: ищем аккаунт с привязанным Telegram и отдаём ссылку; код придёт только в его чат."""
    user = conn.execute("SELECT id, tg_chat_id FROM users WHERE username = ? COLLATE NOCASE",
                        (data.username.strip(),)).fetchone()
    if not user or not user["tg_chat_id"]:
        raise HTTPException(404, "Аккаунт не найден или не привязан к Telegram.")
    return _new_attempt(conn, "reset", user_id=user["id"])


@reset_router.post("")
def reset_password(data: ResetFinish, conn: sqlite3.Connection = Depends(get_db)):
    """Шаг 2: код верный — меняем пароль и сразу логиним пользователя."""
    p_err = validate_password(data.password)
    if p_err:
        raise HTTPException(422, detail={"message": "Проверьте пароль.", "password_errors": p_err})
    row = _check_code(conn, data.ref, "reset", (data.code or "").strip())
    conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(data.password), row["user_id"]))
    _mark_used(conn, data.ref)
    user = conn.execute("SELECT * FROM users WHERE id = ?", (row["user_id"],)).fetchone()
    return {"token": create_token(user["id"]), "token_type": "bearer", "user": serialize_user(user)}
