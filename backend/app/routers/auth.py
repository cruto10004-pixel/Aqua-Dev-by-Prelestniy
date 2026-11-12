"""Вход по логину и паролю. Регистрация с кодом из письма — в email_auth.py."""
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from ..deps import get_current_user, get_db
from ..security import DUMMY_HASH, create_token, login_limiter, verify_password
from ..services import serialize_profile, serialize_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


class Credentials(BaseModel):
    username: str = Field(max_length=64)
    password: str = Field(max_length=256)


@router.post("/login")
def login(data: Credentials, request: Request, conn: sqlite3.Connection = Depends(get_db)):
    key = f"{request.client.host if request.client else '-'}|{data.username.strip().lower()}"
    if login_limiter.is_blocked(key):
        raise HTTPException(429, "Слишком много попыток входа. Попробуйте через несколько минут.")
    user = conn.execute("SELECT * FROM users WHERE username = ?", (data.username.strip(),)).fetchone()
    # Хеш проверяем всегда — одинаковое время ответа для несуществующего логина.
    ok = verify_password(data.password, user["password_hash"] if user else DUMMY_HASH)
    if not user or not ok:
        login_limiter.register_fail(key)
        raise HTTPException(401, "Неверное имя пользователя или пароль.")
    login_limiter.reset(key)
    return {"token": create_token(user["id"]), "token_type": "bearer", "user": serialize_user(user)}


@router.get("/me")
def me(user: sqlite3.Row = Depends(get_current_user), conn: sqlite3.Connection = Depends(get_db)):
    # Свой профиль целиком: включая приватность и настройки (тема, обои, быстрая реакция)
    return serialize_profile(conn, user, own=True)
