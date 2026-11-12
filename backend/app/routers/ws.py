"""WebSocket-канал реального времени.

Протокол (JSON):
  клиент → сервер
    {"type": "auth", "token": "<jwt>"}                 — первое сообщение, в течение 10 с
    {"type": "message", "chat_id": 1, "text": "...", "media_id": null, "meta": null, "cover_id": null, "client_id": "tmp-1"}
    {"type": "typing", "chat_id": 1, "is_typing": true}
    {"type": "ping"}
  сервер → клиент
    {"type": "ready", "user": {...}}
    {"type": "message", "message": {...}, "client_id": "tmp-1"|null}
    {"type": "typing", "chat_id": 1, "user_id": 2, "username": "bob", "is_typing": true}
    {"type": "presence", "user_id": 2, "online": true, "last_seen": "..."}
    {"type": "reaction", "chat_id": 1, "message_id": 5, "reactions": [{"emoji": "🔥", "count": 2, "users": [1, 2]}]}
    {"type": "chat_created", "chat": {...}}
    {"type": "pong"} / {"type": "error", "detail": "..."}

Токен передаётся первым сообщением, а не в URL, чтобы он не попадал в логи прокси.
"""
import asyncio
import sqlite3

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from .. import services
from ..database import connect
from ..realtime import manager
from ..security import decode_token
from ..services import ServiceError

router = APIRouter()

AUTH_TIMEOUT_SEC = 10


async def _authenticate(ws: WebSocket) -> sqlite3.Row | None:
    try:
        first = await asyncio.wait_for(ws.receive_json(), AUTH_TIMEOUT_SEC)
    except Exception:
        return None
    if not isinstance(first, dict) or first.get("type") != "auth":
        return None
    user_id = decode_token(str(first.get("token", "")))
    if user_id is None:
        return None
    with connect() as conn:
        return conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()


async def _broadcast_presence(user_id: int, online: bool) -> None:
    """Статус рассылаем каждому получателю отдельно: приватность активности у каждого своя."""
    with connect() as conn:
        if not online:
            conn.execute("UPDATE users SET last_seen = ? WHERE id = ?", (services.now_iso(), user_id))
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        payloads = {}
        for uid in services.contact_ids(conn, user_id):
            if services.activity_visible(conn, row, uid):
                payloads[uid] = {"type": "presence", "user_id": user_id, "online": online, "last_seen": row["last_seen"]}
            else:
                payloads[uid] = {"type": "presence", "user_id": user_id, "online": False, "last_seen": None}
    for uid, payload in payloads.items():
        await manager.send_to_users([uid], payload)


async def _handle_message(user: sqlite3.Row, data: dict) -> None:
    chat_id, media_id = data.get("chat_id"), data.get("media_id")
    cover_id = data.get("cover_id")
    if not isinstance(chat_id, int) or any(
        v is not None and (isinstance(v, bool) or not isinstance(v, int)) for v in (media_id, cover_id)
    ):
        raise ServiceError(400, "Неверный формат сообщения.")
    text = data.get("text")
    if text is not None and not isinstance(text, str):
        raise ServiceError(400, "Неверный формат сообщения.")

    with connect() as conn:
        message = services.create_message(conn, chat_id, user["id"], text, media_id, data.get("meta"), data.get("cover_id"))
        recipients = services.member_ids(conn, chat_id)
    client_id = data.get("client_id")
    for uid in recipients:
        payload = {"type": "message", "message": message}
        if uid == user["id"]:
            # client_id нужен автору, чтобы заменить своё «временное» сообщение настоящим.
            payload["client_id"] = client_id if isinstance(client_id, str) else None
        await manager.send_to_user(uid, payload)


async def _handle_typing(user: sqlite3.Row, data: dict) -> None:
    chat_id = data.get("chat_id")
    if not isinstance(chat_id, int):
        return
    with connect() as conn:
        services.require_member(conn, chat_id, user["id"])
        recipients = services.member_ids(conn, chat_id)
    await manager.send_to_users(
        recipients,
        {
            "type": "typing", "chat_id": chat_id, "user_id": user["id"],
            "username": user["username"], "is_typing": bool(data.get("is_typing")),
        },
        exclude=user["id"],
    )


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    user = await _authenticate(ws)
    if user is None:
        await ws.close(code=4401)          # 4401 — «не авторизован»
        return

    became_online = manager.connect(user["id"], ws)
    try:
        await ws.send_json({"type": "ready", "user": services.serialize_user(user)})
        if became_online:
            await _broadcast_presence(user["id"], True)

        while True:
            data = await ws.receive_json()
            if not isinstance(data, dict):
                continue
            kind = data.get("type")
            try:
                if kind == "message":
                    await _handle_message(user, data)
                elif kind == "typing":
                    await _handle_typing(user, data)
                elif kind == "ping":
                    await ws.send_json({"type": "pong"})
            except ServiceError as e:
                await ws.send_json({"type": "error", "detail": e.message})
    except WebSocketDisconnect:
        pass
    except Exception:
        # Битый JSON и прочее — закрываем соединение, клиент переподключится.
        try:
            await ws.close(code=1003)
        except Exception:
            pass
    finally:
        became_offline = manager.disconnect(user["id"], ws)
        if became_offline:
            await _broadcast_presence(user["id"], False)
