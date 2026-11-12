"""Клиент GIF-сервисов (GIPHY, Klipy) без внешних зависимостей: только стандартная библиотека.

Модуль не зависит от FastAPI, чтобы его можно было проверять отдельно.
Все обращения блокирующие — вызывайте их через asyncio.to_thread.
"""
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from urllib.parse import urlparse

from . import config


class GifError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status, self.message = status, message


# --- Безопасные HTTP-запросы --------------------------------------------------------------
class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Редиректы не следуем: иначе можно обойти список разрешённых доменов."""
    def redirect_request(self, *args, **kwargs):
        return None


_opener = urllib.request.build_opener(_NoRedirect)


def allowed_url(url: str) -> bool:
    """Только https и только домены GIF-сервисов (и их поддомены), без нестандартных портов."""
    try:
        u = urlparse(url)
        host = (u.hostname or "").lower()
        if u.scheme != "https" or u.port not in (None, 443) or u.username or u.password:
            return False
    except ValueError:
        return False
    return any(host == s or host.endswith("." + s) for s in config.GIF_HOST_SUFFIXES)


def http_get(url: str, *, max_bytes: int, timeout: float = 8.0) -> tuple[bytes, str]:
    req = urllib.request.Request(url, headers={"User-Agent": "AquaMessenger/1.0", "Accept": "*/*"})
    try:
        with _opener.open(req, timeout=timeout) as resp:
            ctype = resp.headers.get("Content-Type", "").split(";")[0].strip().lower()
            data = resp.read(max_bytes + 1)
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise GifError(502, "GIF-сервис недоступен.") from e
    if len(data) > max_bytes:
        raise GifError(413, "GIF слишком большой.")
    return data, ctype


def download_gif(url: str) -> tuple[bytes, str]:
    """Скачивает картинку с разрешённого домена. Возвращает (байты, mime) — только gif или webp."""
    if not allowed_url(url):
        raise GifError(400, "Недопустимый адрес GIF.")
    data, ctype = http_get(url, max_bytes=config.GIF_MAX_BYTES)
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return data, "image/gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return data, "image/webp"
    raise GifError(415, f"Ожидалась GIF-картинка, получено: {ctype or 'неизвестно'}.")


# --- Провайдеры ----------------------------------------------------------------------------
def provider() -> str | None:
    if config.KLIPY_API_KEY:
        return "klipy"
    if config.GIPHY_API_KEY:
        return "giphy"
    return None


def _item(id_, title, preview, url, w, h) -> dict | None:
    if not (preview and url and allowed_url(preview) and allowed_url(url)):
        return None
    return {"id": str(id_), "title": title or "", "preview": preview, "url": url,
            "w": int(w or 200), "h": int(h or 200)}


def normalize_giphy(payload: dict, offset: int) -> dict:
    items = []
    for g in payload.get("data", []):
        im = g.get("images", {})
        prev = im.get("fixed_width") or im.get("fixed_width_small") or im.get("original") or {}
        full = im.get("downsized") or im.get("fixed_width") or im.get("original") or {}
        it = _item(g.get("id"), g.get("title"), prev.get("url"), full.get("url"), prev.get("width"), prev.get("height"))
        if it:
            items.append(it)
    pg = payload.get("pagination", {})
    nxt = offset + int(pg.get("count", len(items)) or 0)
    return {"items": items, "next": nxt if items and nxt < int(pg.get("total_count", 0) or 0) else None}


def _klipy_file(files: dict, sizes, formats) -> dict:
    for size in sizes:
        node = files.get(size)
        if isinstance(node, dict):
            for fmt in formats:
                f = node.get(fmt)
                if isinstance(f, dict) and f.get("url"):
                    return f
    return {}


def normalize_klipy(payload: dict, page: int) -> dict:
    """Klipy: data.data[] с files{размер:{формат:{url,width,height}}}. Разбираем терпимо к вариациям."""
    block = payload.get("data", {})
    rows = block.get("data", []) if isinstance(block, dict) else []
    items = []
    for g in rows:
        files = g.get("files") or g.get("file") or {}
        prev = _klipy_file(files, ("sm", "md", "xs", "hd"), ("webp", "gif"))
        full = _klipy_file(files, ("md", "sm", "hd", "xs"), ("gif", "webp"))
        it = _item(g.get("id") or g.get("slug"), g.get("title"), prev.get("url"), full.get("url"),
                   prev.get("width"), prev.get("height"))
        if it:
            items.append(it)
    has_next = bool(block.get("has_next")) if isinstance(block, dict) else False
    return {"items": items, "next": page + 1 if has_next and items else None}


_cache: dict[str, tuple[float, dict]] = {}
_TTL = 120


def _get_json(url: str) -> dict:
    now = time.monotonic()
    hit = _cache.get(url)
    if hit and now - hit[0] < _TTL:
        return hit[1]
    data, _ = http_get(url, max_bytes=2 * 1024 * 1024)
    try:
        parsed = json.loads(data)
    except ValueError as e:
        raise GifError(502, "GIF-сервис вернул неверный ответ.") from e
    if len(_cache) > 200:
        _cache.clear()
    _cache[url] = (now, parsed)
    return parsed


def search(query: str, pos: int = 0) -> dict:
    """Поиск (или популярное, если запрос пуст). pos — смещение (GIPHY) или номер страницы (Klipy)."""
    name = provider()
    if name is None:
        raise GifError(503, "GIF-поиск не настроен: задайте KLIPY_API_KEY или GIPHY_API_KEY.")
    query = query.strip()[:100]
    n = config.GIF_PAGE_SIZE
    if name == "giphy":
        kind = "search" if query else "trending"
        params = {"api_key": config.GIPHY_API_KEY, "limit": n, "offset": max(pos, 0), "rating": "g", "lang": "ru"}
        if query:
            params["q"] = query
        return normalize_giphy(_get_json(f"https://api.giphy.com/v1/gifs/{kind}?" + urllib.parse.urlencode(params)), max(pos, 0))
    kind = "search" if query else "trending"
    params = {"per_page": n, "page": max(pos, 1), "rating": "g", "locale": "ru_RU"}
    if query:
        params["q"] = query
    key = urllib.parse.quote(config.KLIPY_API_KEY, safe="")
    return normalize_klipy(_get_json(f"https://api.klipy.com/api/v1/{key}/gifs/{kind}?" + urllib.parse.urlencode(params)), max(pos, 1))
