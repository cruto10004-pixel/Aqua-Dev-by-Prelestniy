"""Стикеры и стикерпаки. Наполнять пак может только его владелец; любой может добавить пак себе."""
import sqlite3

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import services
from ..deps import get_current_user, get_db
from ..services import now_iso

router = APIRouter(prefix="/api/stickers", tags=["stickers"])

MAX_PACKS_OWN = 50
MAX_STICKERS_IN_PACK = 120


def _pack(conn: sqlite3.Connection, pack_id: int) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM sticker_packs WHERE id = ?", (pack_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "Стикерпак не найден.")
    return row


def _own_pack(conn: sqlite3.Connection, pack_id: int, user_id: int) -> sqlite3.Row:
    row = _pack(conn, pack_id)
    if row["owner_id"] != user_id:
        raise HTTPException(403, "Менять можно только свой стикерпак.")
    return row


def _sticker(conn: sqlite3.Connection, sticker_id: int) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM stickers WHERE id = ?", (sticker_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "Стикер не найден.")
    return row


class PackIn(BaseModel):
    title: str = Field(min_length=1, max_length=40)


class StickerIn(BaseModel):
    media_id: int


@router.get("")
def library(me: sqlite3.Row = Depends(get_current_user), conn: sqlite3.Connection = Depends(get_db)):
    """Всё для ленты стикеров: мои паки, недавние (до 30) и избранные."""
    return services.sticker_library(conn, me["id"])


@router.post("/packs", status_code=201)
def create_pack(data: PackIn, me: sqlite3.Row = Depends(get_current_user), conn: sqlite3.Connection = Depends(get_db)):
    title = data.title.strip()
    if not title:
        raise HTTPException(422, "Введите название стикерпака.")
    n = conn.execute("SELECT COUNT(*) FROM sticker_packs WHERE owner_id = ?", (me["id"],)).fetchone()[0]
    if n >= MAX_PACKS_OWN:
        raise HTTPException(400, f"Не больше {MAX_PACKS_OWN} стикерпаков.")
    cur = conn.execute("INSERT INTO sticker_packs (owner_id, title, created_at) VALUES (?, ?, ?)", (me["id"], title, now_iso()))
    conn.execute("INSERT INTO user_packs (user_id, pack_id, added_at) VALUES (?, ?, ?)", (me["id"], cur.lastrowid, now_iso()))
    return services.serialize_pack(conn, _pack(conn, cur.lastrowid), me["id"])


@router.get("/packs/{pack_id}")
def get_pack(pack_id: int, me: sqlite3.Row = Depends(get_current_user), conn: sqlite3.Connection = Depends(get_db)):
    """Окно пака из чата: название, все стикеры и признак «уже добавлен»."""
    return services.serialize_pack(conn, _pack(conn, pack_id), me["id"])


@router.patch("/packs/{pack_id}")
def rename_pack(pack_id: int, data: PackIn, me: sqlite3.Row = Depends(get_current_user), conn: sqlite3.Connection = Depends(get_db)):
    pack = _own_pack(conn, pack_id, me["id"])
    conn.execute("UPDATE sticker_packs SET title = ? WHERE id = ?", (data.title.strip() or pack["title"], pack_id))
    return services.serialize_pack(conn, _pack(conn, pack_id), me["id"])


@router.delete("/packs/{pack_id}", status_code=204)
def delete_pack(pack_id: int, me: sqlite3.Row = Depends(get_current_user), conn: sqlite3.Connection = Depends(get_db)):
    """Владелец удаляет пак целиком; остальные просто убирают его из своего списка."""
    pack = _pack(conn, pack_id)
    if pack["owner_id"] == me["id"]:
        conn.execute("DELETE FROM sticker_packs WHERE id = ?", (pack_id,))
    else:
        conn.execute("DELETE FROM user_packs WHERE user_id = ? AND pack_id = ?", (me["id"], pack_id))


@router.put("/packs/{pack_id}/add")
def add_pack(pack_id: int, me: sqlite3.Row = Depends(get_current_user), conn: sqlite3.Connection = Depends(get_db)):
    pack = _pack(conn, pack_id)
    conn.execute("INSERT OR IGNORE INTO user_packs (user_id, pack_id, added_at) VALUES (?, ?, ?)", (me["id"], pack_id, now_iso()))
    return services.serialize_pack(conn, pack, me["id"])


@router.post("/packs/{pack_id}/stickers", status_code=201)
def add_sticker(pack_id: int, data: StickerIn, me: sqlite3.Row = Depends(get_current_user), conn: sqlite3.Connection = Depends(get_db)):
    """Добавить стикер в СВОЙ пак: файл — своя загруженная картинка."""
    _own_pack(conn, pack_id, me["id"])
    media = conn.execute("SELECT owner_id, kind, mime FROM media WHERE id = ?", (data.media_id,)).fetchone()
    if media is None or media["owner_id"] != me["id"] or media["kind"] != "image":
        raise HTTPException(400, "Нужна ваша загруженная картинка.")
    n = conn.execute("SELECT COUNT(*) FROM stickers WHERE pack_id = ?", (pack_id,)).fetchone()[0]
    if n >= MAX_STICKERS_IN_PACK:
        raise HTTPException(400, f"В паке не больше {MAX_STICKERS_IN_PACK} стикеров.")
    cur = conn.execute("INSERT INTO stickers (pack_id, media_id, created_at) VALUES (?, ?, ?)", (pack_id, data.media_id, now_iso()))
    return services._sticker_json(_sticker(conn, cur.lastrowid))


@router.delete("/{sticker_id}", status_code=204)
def delete_sticker(sticker_id: int, me: sqlite3.Row = Depends(get_current_user), conn: sqlite3.Connection = Depends(get_db)):
    st = _sticker(conn, sticker_id)
    _own_pack(conn, st["pack_id"], me["id"])
    conn.execute("DELETE FROM stickers WHERE id = ?", (sticker_id,))


@router.put("/{sticker_id}/favorite", status_code=204)
def add_favorite(sticker_id: int, me: sqlite3.Row = Depends(get_current_user), conn: sqlite3.Connection = Depends(get_db)):
    _sticker(conn, sticker_id)
    conn.execute("INSERT OR IGNORE INTO sticker_favs (user_id, sticker_id, added_at) VALUES (?, ?, ?)", (me["id"], sticker_id, now_iso()))


@router.delete("/{sticker_id}/favorite", status_code=204)
def remove_favorite(sticker_id: int, me: sqlite3.Row = Depends(get_current_user), conn: sqlite3.Connection = Depends(get_db)):
    conn.execute("DELETE FROM sticker_favs WHERE user_id = ? AND sticker_id = ?", (me["id"], sticker_id))


@router.delete("/{sticker_id}/recent", status_code=204)
def remove_recent(sticker_id: int, me: sqlite3.Row = Depends(get_current_user), conn: sqlite3.Connection = Depends(get_db)):
    conn.execute("DELETE FROM sticker_recent WHERE user_id = ? AND sticker_id = ?", (me["id"], sticker_id))
