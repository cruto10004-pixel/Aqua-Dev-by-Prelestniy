"""Пользователи, чаты и история сообщений."""
import sqlite3
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from .. import services
from ..deps import get_current_user, get_db
from ..realtime import manager
from ..services import ServiceError

router = APIRouter(prefix="/api", tags=["chats"])


def _raise(e: ServiceError):
    raise HTTPException(e.status, e.message)


# --- Поиск пользователей -----------------------------------------------------
@router.get("/users/search")
def search_users(
    q: str = Query(min_length=1, max_length=32),
    user: sqlite3.Row = Depends(get_current_user),
    conn: sqlite3.Connection = Depends(get_db),
):
    # Экранируем спецсимволы LIKE, чтобы «_» и «%» искались буквально.
    safe = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    rows = conn.execute(
        "SELECT * FROM users WHERE (username LIKE ? ESCAPE '\\' OR display_name LIKE ? ESCAPE '\\') AND id != ? "
        "ORDER BY username LIMIT 20",
        (f"%{safe}%", f"%{safe}%", user["id"]),
    ).fetchall()
    return [services.serialize_user(r, conn, user["id"]) for r in rows]


# --- Чаты -----------------------------------------------------------------------
class ChatCreate(BaseModel):
    type: Literal["direct", "group", "channel"]
    username: str | None = Field(None, max_length=64)          # для direct и канала (@username канала)
    title: str | None = Field(None, max_length=64)             # для group
    members: list[str] = Field(default_factory=list, max_length=50)  # для group


@router.get("/chats")
def list_chats(
    user: sqlite3.Row = Depends(get_current_user), conn: sqlite3.Connection = Depends(get_db)
):
    return services.list_chats(conn, user["id"])


@router.post("/chats", status_code=201)
async def create_chat(
    data: ChatCreate,
    user: sqlite3.Row = Depends(get_current_user),
    conn: sqlite3.Connection = Depends(get_db),
):
    try:
        if data.type == "direct":
            if not data.username:
                raise HTTPException(422, "Укажите username собеседника.")
            chat_id, created = services.create_direct_chat(conn, user["id"], data.username)
        elif data.type == "channel":
            chat_id = services.create_channel(conn, user["id"], data.title or "", data.username or "")
            created = True
        else:
            chat_id = services.create_group_chat(conn, user["id"], data.title or "", data.members)
            created = True
    except ServiceError as e:
        _raise(e)

    conn.commit()  # чат должен быть виден до рассылки уведомления
    if created:
        # Сообщаем остальным участникам о новом чате (у каждого свой заголовок).
        for uid in services.member_ids(conn, chat_id):
            if uid != user["id"]:
                await manager.send_to_user(
                    uid, {"type": "chat_created", "chat": services.serialize_chat(conn, chat_id, uid)}
                )
    return services.serialize_chat(conn, chat_id, user["id"])


# --- История и отправка (REST-вариант; основной канал — WebSocket) ---------------
@router.get("/chats/{chat_id}/messages")
def get_messages(
    chat_id: int,
    before_id: int | None = Query(None, ge=1, description="Вернуть сообщения старше этого id"),
    limit: int = Query(50, ge=1, le=100),
    user: sqlite3.Row = Depends(get_current_user),
    conn: sqlite3.Connection = Depends(get_db),
):
    try:
        services.require_member(conn, chat_id, user["id"])
    except ServiceError as e:
        _raise(e)
    return services.get_history(conn, chat_id, before_id, limit, user["id"])


class MessageCreate(BaseModel):
    text: str | None = Field(None, max_length=8000)
    media_id: int | None = None
    meta: dict | None = None        # голосовые: {duration, wave}
    cover_id: int | None = None     # видео: id картинки-обложки


@router.post("/chats/{chat_id}/messages", status_code=201)
async def post_message(
    chat_id: int,
    data: MessageCreate,
    user: sqlite3.Row = Depends(get_current_user),
    conn: sqlite3.Connection = Depends(get_db),
):
    try:
        message = services.create_message(
            conn, chat_id, user["id"], data.text, data.media_id, data.meta, data.cover_id
        )
    except ServiceError as e:
        _raise(e)
    conn.commit()
    # Рассылаем всем участникам (включая отправителя на других устройствах).
    await manager.send_to_users(
        services.member_ids(conn, chat_id), {"type": "message", "message": message}
    )
    return message


class ReadIn(BaseModel):
    up_to: int


@router.post("/chats/{chat_id}/read")
async def mark_read(chat_id: int, data: ReadIn, user: sqlite3.Row = Depends(get_current_user), conn: sqlite3.Connection = Depends(get_db)):
    """Прочитано до сообщения up_to. Остальные участники получают событие `read` (две галочки)."""
    try:
        up_to = services.mark_read(conn, chat_id, user["id"], data.up_to)
    except ServiceError as e:
        _raise(e)
    conn.commit()
    await manager.send_to_users(services.member_ids(conn, chat_id),
                                {"type": "read", "chat_id": chat_id, "user_id": user["id"], "up_to": up_to}, exclude=user["id"])
    return {"chat_id": chat_id, "up_to": up_to}


class PinIn(BaseModel):
    message_id: int | None = None


class ChannelPatch(BaseModel):
    title: str | None = Field(None, max_length=64)
    description: str | None = Field(None, max_length=500)


@router.patch("/chats/{chat_id}")
async def patch_channel(chat_id: int, data: ChannelPatch, user: sqlite3.Row = Depends(get_current_user), conn: sqlite3.Connection = Depends(get_db)):
    """Название и описание канала (только администратор)."""
    try:
        services.update_channel(conn, chat_id, user["id"], data.title, data.description)
    except ServiceError as e:
        _raise(e)
    return services.serialize_chat(conn, chat_id, user["id"])


@router.put("/chats/{chat_id}/pin")
async def pin_message(chat_id: int, data: PinIn, user: sqlite3.Row = Depends(get_current_user), conn: sqlite3.Connection = Depends(get_db)):
    """Закрепить сообщение в чате (message_id=null — открепить). Событие `pinned` получают все участники."""
    try:
        message = services.set_pinned(conn, chat_id, user["id"], data.message_id)
    except ServiceError as e:
        _raise(e)
    conn.commit()
    await manager.send_to_users(services.member_ids(conn, chat_id), {"type": "pinned", "chat_id": chat_id, "message": message})
    return {"chat_id": chat_id, "message": message}
