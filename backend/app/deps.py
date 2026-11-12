"""Зависимости FastAPI: соединение с БД и текущий пользователь."""
import sqlite3
from typing import Iterator

from fastapi import Depends, Header, HTTPException, Query

from .database import connect
from .security import decode_token


def get_db() -> Iterator[sqlite3.Connection]:
    with connect() as conn:
        yield conn


def _user_from_token(conn: sqlite3.Connection, token: str | None) -> sqlite3.Row:
    user_id = decode_token(token) if token else None
    user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone() if user_id else None
    if user is None:
        raise HTTPException(401, "Требуется авторизация.", headers={"WWW-Authenticate": "Bearer"})
    return user


def get_current_user(
    authorization: str | None = Header(None), conn: sqlite3.Connection = Depends(get_db)
) -> sqlite3.Row:
    """Токен из заголовка `Authorization: Bearer <jwt>`."""
    scheme, _, token = (authorization or "").partition(" ")
    return _user_from_token(conn, token if scheme.lower() == "bearer" else None)


def get_user_header_or_query(
    authorization: str | None = Header(None),
    token: str | None = Query(None),
    conn: sqlite3.Connection = Depends(get_db),
) -> sqlite3.Row:
    """Как выше, но допускает ?token=... — теги <img>/<video>/<audio> не умеют слать заголовки."""
    scheme, _, bearer = (authorization or "").partition(" ")
    return _user_from_token(conn, bearer if scheme.lower() == "bearer" else token)
