"""Контакты и чёрный список."""
import sqlite3

from fastapi import APIRouter, Depends, HTTPException

from .. import services
from ..deps import get_current_user, get_db
from ..realtime import manager

router = APIRouter(prefix="/api", tags=["contacts"])


def _target(conn: sqlite3.Connection, me: sqlite3.Row, user_id: int) -> sqlite3.Row:
    if user_id == me["id"]:
        raise HTTPException(400, "Нельзя применить к самому себе.")
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "Пользователь не найден.")
    return row


def _list(conn: sqlite3.Connection, table: str, col: str, owner: int) -> list[dict]:
    rows = conn.execute(
        f"SELECT u.* FROM {table} t JOIN users u ON u.id = t.{col} WHERE t.user_id = ? ORDER BY t.created_at DESC", (owner,)).fetchall()
    return [services.serialize_user(r, conn, owner) for r in rows]


@router.get("/contacts")
def contacts(me: sqlite3.Row = Depends(get_current_user), conn: sqlite3.Connection = Depends(get_db)):
    return _list(conn, "contacts", "contact_id", me["id"])


@router.put("/contacts/{user_id}")
def add_contact(user_id: int, me: sqlite3.Row = Depends(get_current_user), conn: sqlite3.Connection = Depends(get_db)):
    _target(conn, me, user_id)
    conn.execute("INSERT OR IGNORE INTO contacts (user_id, contact_id, created_at) VALUES (?, ?, ?)",
                 (me["id"], user_id, services.now_iso()))
    return {"is_contact": True}


@router.delete("/contacts/{user_id}")
def remove_contact(user_id: int, me: sqlite3.Row = Depends(get_current_user), conn: sqlite3.Connection = Depends(get_db)):
    conn.execute("DELETE FROM contacts WHERE user_id = ? AND contact_id = ?", (me["id"], user_id))
    return {"is_contact": False}


@router.get("/blocks")
def blocks(me: sqlite3.Row = Depends(get_current_user), conn: sqlite3.Connection = Depends(get_db)):
    return _list(conn, "blocks", "blocked_id", me["id"])


@router.put("/blocks/{user_id}")
async def block(user_id: int, me: sqlite3.Row = Depends(get_current_user), conn: sqlite3.Connection = Depends(get_db)):
    _target(conn, me, user_id)
    conn.execute("INSERT OR IGNORE INTO blocks (user_id, blocked_id, created_at) VALUES (?, ?, ?)",
                 (me["id"], user_id, services.now_iso()))
    await manager.send_to_users([me["id"]], {"type": "block", "user_id": user_id, "blocked": True})
    await manager.send_to_users([user_id], {"type": "blocked_me", "user_id": me["id"], "value": True})
    return {"is_blocked": True}


@router.delete("/blocks/{user_id}")
async def unblock(user_id: int, me: sqlite3.Row = Depends(get_current_user), conn: sqlite3.Connection = Depends(get_db)):
    conn.execute("DELETE FROM blocks WHERE user_id = ? AND blocked_id = ?", (me["id"], user_id))
    await manager.send_to_users([me["id"]], {"type": "block", "user_id": user_id, "blocked": False})
    await manager.send_to_users([user_id], {"type": "blocked_me", "user_id": me["id"], "value": False})
    return {"is_blocked": False}
