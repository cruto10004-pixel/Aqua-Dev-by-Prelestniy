"""Менеджер WebSocket-подключений (реальное время).

Не знает про БД: ему передают готовые списки получателей.
У одного пользователя может быть несколько подключений (вкладки/устройства).
"""
from collections import defaultdict
from typing import Iterable

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self._conns: dict[int, set[WebSocket]] = defaultdict(set)

    def is_online(self, user_id: int) -> bool:
        return bool(self._conns.get(user_id))

    def connect(self, user_id: int, ws: WebSocket) -> bool:
        """Регистрирует подключение. True — если это первое подключение (стал онлайн)."""
        first = not self._conns[user_id]
        self._conns[user_id].add(ws)
        return first

    def disconnect(self, user_id: int, ws: WebSocket) -> bool:
        """Удаляет подключение. True — если подключений не осталось (стал оффлайн)."""
        self._conns[user_id].discard(ws)
        if not self._conns[user_id]:
            self._conns.pop(user_id, None)
            return True
        return False

    async def send_to_user(self, user_id: int, payload: dict) -> None:
        for ws in list(self._conns.get(user_id, ())):
            try:
                await ws.send_json(payload)
            except Exception:
                # Сокет умер — его уберёт обработчик disconnect.
                pass

    async def send_to_users(
        self, user_ids: Iterable[int], payload: dict, exclude: int | None = None
    ) -> None:
        for uid in set(user_ids):
            if uid != exclude:
                await self.send_to_user(uid, payload)


manager = ConnectionManager()
