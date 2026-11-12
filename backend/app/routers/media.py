"""Загрузка и выдача медиафайлов."""
import sqlite3
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import FileResponse

from .. import config
from ..deps import get_current_user, get_db, get_user_header_or_query
from .. import services
from ..services import ServiceError, can_access_media, media_summary, now_iso

router = APIRouter(prefix="/api/media", tags=["media"])


def _serialize(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "url": f"/api/media/{row['id']}",
        "name": row["original_name"],
        "mime": row["mime"],
        "size": row["size"],
        "kind": row["kind"],
        "created_at": row["created_at"],
    }


@router.post("", status_code=201)
async def upload(
    file: UploadFile,
    user: sqlite3.Row = Depends(get_current_user),
    conn: sqlite3.Connection = Depends(get_db),
):
    """Принимает файл (multipart/form-data, поле `file`).

    Проверки: MIME из белого списка, лимит размера (читаем потоком),
    на диске файл хранится под случайным именем с нашим расширением.
    """
    # MediaRecorder шлёт, например, "audio/webm;codecs=opus" — отбрасываем параметры.
    mime = (file.content_type or "").split(";")[0].strip().lower()
    if mime not in config.ALLOWED_MIME:
        raise HTTPException(415, "Этот тип файла не поддерживается.")
    ext, kind = config.ALLOWED_MIME[mime]

    stored_name = f"{uuid.uuid4().hex}{ext}"
    path = config.UPLOAD_DIR / stored_name
    size = 0
    try:
        with open(path, "wb") as out:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > config.MAX_UPLOAD_BYTES:
                    raise HTTPException(413, f"Файл больше {config.MAX_UPLOAD_MB} МБ.")
                out.write(chunk)
        if size == 0:
            raise HTTPException(400, "Файл пустой.")
    except BaseException:
        path.unlink(missing_ok=True)   # не оставляем обрезанные файлы
        raise

    # Имя для отображения: без путей и управляющих символов, не длиннее 120 символов.
    original = (file.filename or "file").replace("\\", "/").split("/")[-1]
    original = "".join(c for c in original if c.isprintable())[:120] or "file"

    cur = conn.execute(
        "INSERT INTO media (owner_id, original_name, stored_name, mime, size, kind, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (user["id"], original, stored_name, mime, size, kind, now_iso()),
    )
    row = conn.execute("SELECT * FROM media WHERE id = ?", (cur.lastrowid,)).fetchone()
    return _serialize(row)


@router.get("/summary")
def summary(
    user: sqlite3.Row = Depends(get_current_user), conn: sqlite3.Connection = Depends(get_db)
):
    """Количество файлов по типам — для «папок» файлового менеджера. Объявлено до /{media_id}."""
    return media_summary(conn, user["id"])


@router.get("")
def recent_media(
    kind: str | None = None,
    limit: int = 60,
    user: sqlite3.Row = Depends(get_current_user),
    conn: sqlite3.Connection = Depends(get_db),
):
    """Последние загрузки пользователя — данные для окна файлового менеджера."""
    limit = max(1, min(limit, 200))
    if kind is not None and kind not in ("image", "video", "voice", "file"):
        raise HTTPException(422, "Неизвестный тип медиа.")
    sql = "SELECT * FROM media WHERE owner_id = ?"
    params: list = [user["id"]]
    if kind:
        sql += " AND kind = ?"
        params.append(kind)
    rows = conn.execute(sql + " ORDER BY id DESC LIMIT ?", (*params, limit)).fetchall()
    return [_serialize(r) for r in rows]


@router.post("/{media_id}/clone", status_code=201)
def clone(media_id: int, user: sqlite3.Row = Depends(get_current_user), conn: sqlite3.Connection = Depends(get_db)):
    """Своя копия доступного файла — для «Переслать» и «Сохранить»."""
    try:
        return _serialize(services.clone_media(conn, media_id, user["id"]))
    except ServiceError as e:
        raise HTTPException(e.status, e.message)


@router.get("/{media_id}")
def download(
    media_id: int,
    user: sqlite3.Row = Depends(get_user_header_or_query),
    conn: sqlite3.Connection = Depends(get_db),
):
    """Отдаёт файл только владельцу и участникам чата, куда он отправлен.

    FileResponse поддерживает Range-запросы (перемотка видео/аудио).
    """
    if not can_access_media(conn, media_id, user["id"]):
        raise HTTPException(404, "Файл не найден.")
    row = conn.execute("SELECT * FROM media WHERE id = ?", (media_id,)).fetchone()
    path = config.UPLOAD_DIR / row["stored_name"]
    if not path.exists():
        raise HTTPException(404, "Файл не найден.")
    headers = {
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=86400",
    }
    # Изображения/видео/аудио показываем inline, остальное — скачиванием.
    disposition = "inline" if row["kind"] != "file" else "attachment"
    return FileResponse(
        path, media_type=row["mime"], filename=row["original_name"],
        content_disposition_type=disposition, headers=headers,
    )
