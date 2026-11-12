"""GIF-вкладка: поиск, прокси превью и импорт выбранной GIF в медиа пользователя."""
import asyncio
import sqlite3
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field

from .. import config, gifs
from ..deps import get_current_user, get_db, get_user_header_or_query
from .. import services
from ..services import ServiceError, now_iso
from .media import _serialize

router = APIRouter(prefix="/api/gifs", tags=["gifs"])


def _raise(e: gifs.GifError):
    raise HTTPException(e.status, e.message)


@router.get("/status")
def status(_: sqlite3.Row = Depends(get_current_user)):
    name = gifs.provider()
    return {"enabled": name is not None, "provider": name}


@router.get("/saved")
def saved(me: sqlite3.Row = Depends(get_current_user), conn: sqlite3.Connection = Depends(get_db)):
    """Сохранённые GIF (новые сверху). «Недавних» у GIF нет — только сохранённые."""
    return services.list_saved_gifs(conn, me["id"])


class SaveIn(BaseModel):
    media_id: int


@router.post("/saved", status_code=201)
def save(data: SaveIn, me: sqlite3.Row = Depends(get_current_user), conn: sqlite3.Connection = Depends(get_db)):
    """Сохранить GIF из сообщения: чужой файл копируется пользователю. Принимает и обычные GIF-файлы, и видео без звука."""
    try:
        row = services.clone_media(conn, data.media_id, me["id"])
    except ServiceError as e:
        raise HTTPException(e.status, e.message)
    if row["kind"] not in ("image", "video"):
        raise HTTPException(400, "Это не GIF.")
    services.save_gif(conn, me["id"], row["id"])
    return services.media_json(row)


@router.delete("/saved/{media_id}", status_code=204)
def unsave(media_id: int, me: sqlite3.Row = Depends(get_current_user), conn: sqlite3.Connection = Depends(get_db)):
    conn.execute("DELETE FROM saved_gifs WHERE user_id = ? AND media_id = ?", (me["id"], media_id))


@router.get("/search")
async def search(q: str = Query("", max_length=100), pos: int = Query(0, ge=0, le=100000),
                 _: sqlite3.Row = Depends(get_current_user)):
    """Пустой q — популярные. Ответ: {items:[{id,title,preview,url,w,h}], next}."""
    try:
        return await asyncio.to_thread(gifs.search, q, pos)
    except gifs.GifError as e:
        _raise(e)


@router.get("/proxy")
async def proxy(u: str = Query(max_length=1000), _: sqlite3.Row = Depends(get_user_header_or_query)):
    """Превью GIF через наш сервер: не нужен доступ браузера к CDN (CSP) и не светим IP пользователя."""
    try:
        data, mime = await asyncio.to_thread(gifs.download_gif, u)
    except gifs.GifError as e:
        _raise(e)
    return Response(data, media_type=mime, headers={"Cache-Control": "private, max-age=86400",
                                                    "X-Content-Type-Options": "nosniff"})


class ImportIn(BaseModel):
    url: str = Field(max_length=1000)
    title: str = Field("", max_length=120)


@router.post("/import", status_code=201)
async def import_gif(data: ImportIn, user: sqlite3.Row = Depends(get_current_user),
                     conn: sqlite3.Connection = Depends(get_db)):
    """Скачивает выбранную GIF и сохраняет как обычное изображение пользователя — дальше отправляется как медиа."""
    try:
        body, mime = await asyncio.to_thread(gifs.download_gif, data.url)
    except gifs.GifError as e:
        _raise(e)
    ext, kind = config.ALLOWED_MIME[mime]
    stored = f"{uuid.uuid4().hex}{ext}"
    (config.UPLOAD_DIR / stored).write_bytes(body)
    cur = conn.execute(
        "INSERT INTO media (owner_id, original_name, stored_name, mime, size, kind, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (user["id"], f"gif-{uuid.uuid4().hex[:8]}{ext}", stored, mime, len(body), kind, now_iso()),
    )
    return _serialize(conn.execute("SELECT * FROM media WHERE id = ?", (cur.lastrowid,)).fetchone())
