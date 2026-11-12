"""Изменение и удаление сообщений."""
import sqlite3
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from .. import services
from ..deps import get_current_user, get_db
from ..realtime import manager
from ..services import ServiceError

router = APIRouter(prefix="/api/messages", tags=["messages"])


class EditIn(BaseModel):
    text: str | None = Field(None, max_length=8000)


@router.patch("/{message_id}")
async def edit_message(message_id: int, data: EditIn, user: sqlite3.Row = Depends(get_current_user),
                       conn: sqlite3.Connection = Depends(get_db)):
    """Изменить своё сообщение. Всем участникам чата уходит событие `message_edited`."""
    try:
        message = services.edit_message(conn, message_id, user["id"], data.text)
    except ServiceError as e:
        raise HTTPException(e.status, e.message)
    conn.commit()
    await manager.send_to_users(services.member_ids(conn, message["chat_id"]),
                                {"type": "message_edited", "message": message})
    return message


@router.delete("/{message_id}")
async def delete_message(message_id: int, scope: Literal["all", "me"] = Query("me"),
                         user: sqlite3.Row = Depends(get_current_user),
                         conn: sqlite3.Connection = Depends(get_db)):
    """scope=all — удалить у всех (только свои); scope=me — скрыть только у себя.

    Событие `message_deleted` получают: при «у всех» — все участники, при «у себя» — только вы (другие ваши устройства).
    В событии — актуальное последнее сообщение чата для каждого получателя.
    """
    try:
        chat_id = services.delete_message(conn, message_id, user["id"], scope)
    except ServiceError as e:
        raise HTTPException(e.status, e.message)
    conn.commit()
    recipients = services.member_ids(conn, chat_id) if scope == "all" else [user["id"]]
    for uid in recipients:
        await manager.send_to_user(uid, {
            "type": "message_deleted", "chat_id": chat_id, "message_id": message_id, "scope": scope,
            "last_message": services.last_message_for(conn, chat_id, uid),
        })
    return {"ok": True, "chat_id": chat_id, "message_id": message_id, "scope": scope}


class ForwardIn(BaseModel):
    message_ids: list[int] = Field(min_length=1, max_length=100)
    chat_id: int
    hide_sender: bool = False


@router.post("/forward", status_code=201)
async def forward(data: ForwardIn, user: sqlite3.Row = Depends(get_current_user), conn: sqlite3.Connection = Depends(get_db)):
    """Переслать сообщения в чат. hide_sender — без подписи «Переслано от …»."""
    try:
        messages = services.forward_messages(conn, user["id"], data.message_ids, data.chat_id, data.hide_sender)
    except ServiceError as e:
        raise HTTPException(e.status, e.message)
    conn.commit()
    recipients = services.member_ids(conn, data.chat_id)
    for m in messages:
        for uid in recipients:
            await manager.send_to_user(uid, {"type": "message", "message": m})
    return messages
