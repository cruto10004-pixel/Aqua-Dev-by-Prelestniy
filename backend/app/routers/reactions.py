"""Эмодзи-реакции на сообщения."""
import sqlite3

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import services
from ..deps import get_current_user, get_db
from ..realtime import manager
from ..services import ServiceError

router = APIRouter(prefix="/api/messages", tags=["reactions"])


class ReactionIn(BaseModel):
    emoji: str = Field(min_length=1, max_length=16)


@router.put("/{message_id}/reactions")
async def toggle_reaction(
    message_id: int,
    data: ReactionIn,
    user: sqlite3.Row = Depends(get_current_user),
    conn: sqlite3.Connection = Depends(get_db),
):
    """Переключатель: поставить реакцию или снять, если она уже стоит.

    Всем участникам чата уходит событие `reaction` с актуальным списком реакций сообщения.
    """
    try:
        chat_id, reactions = services.toggle_reaction(conn, message_id, user["id"], data.emoji)
    except ServiceError as e:
        raise HTTPException(e.status, e.message)
    conn.commit()
    await manager.send_to_users(
        services.member_ids(conn, chat_id),
        {"type": "reaction", "chat_id": chat_id, "message_id": message_id, "reactions": reactions},
    )
    return {"message_id": message_id, "reactions": reactions}
