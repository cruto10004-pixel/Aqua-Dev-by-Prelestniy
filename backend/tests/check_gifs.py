# Проверка разбора ответов GIPHY/Klipy и защиты адресов (без сети и без FastAPI): python3 -I backend/tests/check_gifs.py
import sys, types, os, tempfile
os.environ["AQUA_DATA_DIR"] = tempfile.mkdtemp()
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[1]))
from app import config, gifs
ok = gifs.allowed_url
assert ok("https://media3.giphy.com/media/x/200w.gif") and ok("https://static.klipy.com/a.gif") and ok("https://giphy.com/x.gif")
for bad in ("http://media.giphy.com/a.gif", "https://evil.com/giphy.com", "https://giphy.com.evil.com/a.gif", "https://notgiphy.com/a.gif",
            "https://media.giphy.com:8443/a.gif", "https://user@media.giphy.com/a.gif", "https://127.0.0.1/a.gif", "file:///etc/passwd", "//media.giphy.com/a.gif"):
    assert not ok(bad), bad
g = {"data": [{"id": "1", "title": "кот", "images": {"fixed_width": {"url": "https://media1.giphy.com/p.gif", "width": "200", "height": "150"},
      "downsized": {"url": "https://media1.giphy.com/f.gif"}}},
     {"id": "2", "images": {"fixed_width": {"url": "https://evil.com/p.gif"}, "original": {"url": "https://evil.com/o.gif"}}}],
     "pagination": {"total_count": 100, "count": 2, "offset": 0}}
r = gifs.normalize_giphy(g, 0); assert len(r["items"]) == 1 and r["items"][0]["h"] == 150 and r["next"] == 2, r
k = {"result": True, "data": {"data": [{"id": 7, "title": "dog", "files": {
        "sm": {"webp": {"url": "https://static.klipy.com/sm.webp", "width": 100, "height": 90}, "gif": {"url": "https://static.klipy.com/sm.gif"}},
        "md": {"gif": {"url": "https://static.klipy.com/md.gif", "width": 220, "height": 200}}}},
        {"id": 8, "files": {}}], "current_page": 1, "has_next": True}}
r = gifs.normalize_klipy(k, 1); it = r["items"][0]
assert len(r["items"]) == 1 and it["preview"].endswith("sm.webp") and it["url"].endswith("md.gif") and r["next"] == 2, r
assert gifs.provider() is None
try: gifs.search("кот"); raise SystemExit("без ключа должна быть ошибка")
except gifs.GifError as e: assert e.status == 503
# download_gif: проверка сигнатуры файла подменой http_get
gifs.http_get = lambda url, **kw: (b"GIF89a" + b"0" * 10, "image/gif")
assert gifs.download_gif("https://media.giphy.com/a.gif")[1] == "image/gif"
gifs.http_get = lambda url, **kw: (b"<html>evil</html>", "text/html")
try: gifs.download_gif("https://media.giphy.com/a.gif"); raise SystemExit("html не должен проходить")
except gifs.GifError as e: assert e.status == 415
print("gifs OK")
