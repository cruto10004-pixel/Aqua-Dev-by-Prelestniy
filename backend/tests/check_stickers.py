# Стикеры, сохранённые GIF и реакции без FastAPI: роутеры вызываются как обычные функции.
# python3 -I backend/tests/check_stickers.py
import sys, types, os, tempfile, pathlib
os.environ["AQUA_DATA_DIR"] = tempfile.mkdtemp()

class HTTPException(Exception):
    def __init__(self, status, detail=None, headers=None): self.status, self.detail = status, detail
fa = types.ModuleType("fastapi")
class _R:
    def __init__(self, *a, **k): pass
    def __getattr__(self, name): return lambda *a, **k: (lambda f: f)
fa.APIRouter = _R; fa.HTTPException = HTTPException; fa.Depends = lambda f=None: f; fa.WebSocket = object
fa.UploadFile = object; fa.Query = lambda *a, **k: None; fa.Response = object; fa.Header = lambda *a, **k: None
fa.WebSocketDisconnect = Exception; fa.status = types.SimpleNamespace(); 
sys.modules["fastapi"] = fa
fr = types.ModuleType("fastapi.responses"); fr.FileResponse = object; sys.modules["fastapi.responses"] = fr
_b = types.ModuleType("bcrypt"); _b.hashpw = lambda p, s: b"x"; _b.gensalt = lambda *a, **k: b"s"; _b.checkpw = lambda *a: False
sys.modules.setdefault("bcrypt", _b)
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from app import config, database, services
from app.routers import stickers, gifs, media
database.init_db()
c = database._open(config.DB_PATH); ts = services.now_iso()
for n in ("a", "b", "c"): c.execute("INSERT INTO users (username,password_hash,created_at) VALUES (?,?,?)", (n, "x", ts))
users = {i: c.execute("SELECT * FROM users WHERE id=?", (i,)).fetchone() for i in (1, 2, 3)}
c.execute("INSERT INTO chats (type, created_by, created_at) VALUES ('direct', 1, ?)", (ts,))
for u in (1, 2): c.execute("INSERT INTO chat_members (chat_id,user_id,joined_at) VALUES (1,?,?)", (u, ts))
def M(owner, i, kind="image", mime="image/png", ext=".png"):
    (config.UPLOAD_DIR / f"{i}{ext}").write_bytes(b"x")
    c.execute("INSERT INTO media (owner_id,original_name,stored_name,mime,size,kind,created_at) VALUES (?,?,?,?,1,?,?)", (owner, f"{i}{ext}", f"{i}{ext}", mime, kind, ts))
    return c.execute("SELECT last_insert_rowid()").fetchone()[0]
def err(fn, *a, status):
    try: fn(*a)
    except HTTPException as e: assert e.status == status, (e.status, status); return
    raise AssertionError("ожидалась ошибка %s" % status)

# --- стикерпаки
P = stickers.PackIn(title="Мой пак")
pack = stickers.create_pack(P, users[1], c); assert pack["own"] and pack["preview"] is None and pack["added"]
m1, m2, m3 = M(1, "s1"), M(1, "s2"), M(1, "s3")
s1 = stickers.add_sticker(pack["id"], stickers.StickerIn(media_id=m1), users[1], c)
s2 = stickers.add_sticker(pack["id"], stickers.StickerIn(media_id=m2), users[1], c)
assert stickers.get_pack(pack["id"], users[1], c)["preview"]["id"] == s1["id"], "превью — первый добавленный"
err(stickers.add_sticker, pack["id"], stickers.StickerIn(media_id=m3), users[2], c, status=403)   # чужой пак
mb = M(2, "b1"); err(stickers.add_sticker, pack["id"], stickers.StickerIn(media_id=mb), users[1], c, status=400)  # чужой файл
mv = M(1, "v1", "video", "video/mp4", ".mp4"); err(stickers.add_sticker, pack["id"], stickers.StickerIn(media_id=mv), users[1], c, status=400)

# --- отправка стикера: любой участник; media принадлежит автору пака
msg = services.create_message(c, 1, 2, "игнор", s1["media_id"], {"sticker": s1["id"]})
assert msg["meta"] == {"sticker": s1["id"], "pack": pack["id"]} and msg["text"] is None and msg["kind"] == "image", msg
assert services.can_access_media(c, s1["media_id"], 3), "стикеры видны всем"
try: services.create_message(c, 1, 2, None, s1["media_id"], {"sticker": s2["id"]}); raise AssertionError
except services.ServiceError: pass                                    # media не от этого стикера
lib = stickers.library(users[2], c); assert [x["id"] for x in lib["recent"]] == [s1["id"]] and not lib["packs"]
# --- чужой пак: просмотр, добавить себе
g = stickers.get_pack(pack["id"], users[2], c); assert not g["added"] and len(g["stickers"]) == 2 and not g["own"]
assert stickers.add_pack(pack["id"], users[2], c)["added"]
assert len(stickers.library(users[2], c)["packs"]) == 1
# --- избранное / недавние
stickers.add_favorite(s2["id"], users[2], c); stickers.add_favorite(s2["id"], users[2], c)
l2 = stickers.library(users[2], c); assert [x["id"] for x in l2["favorites"]] == [s2["id"]]
stickers.remove_recent(s1["id"], users[2], c); assert stickers.library(users[2], c)["recent"] == []
stickers.remove_favorite(s2["id"], users[2], c); assert stickers.library(users[2], c)["favorites"] == []
# --- недавние ≤ 30
ids = []
for i in range(35):
    mi = M(1, f"x{i}"); ids.append(stickers.add_sticker(pack["id"], stickers.StickerIn(media_id=mi), users[1], c)["id"]) if i < 30 else None
# в паке лимит 120, добавим ещё пак для 35 стикеров
p2 = stickers.create_pack(stickers.PackIn(title="Большой"), users[1], c)
all_ids = [stickers.add_sticker(p2["id"], stickers.StickerIn(media_id=M(1, f"y{i}")), users[1], c)["id"] for i in range(35)]
for sid in all_ids: services.touch_recent(c, 1, sid)
r = stickers.library(users[1], c)["recent"]; assert len(r) == 30 and r[0]["id"] == all_ids[-1], len(r)
# --- удаление: пак владельцем / из списка не владельцем; стикер
stickers.delete_pack(pack["id"], users[2], c)                          # b убирает из своего списка
assert c.execute("SELECT 1 FROM sticker_packs WHERE id=?", (pack["id"],)).fetchone() and not stickers.library(users[2], c)["packs"]
stickers.delete_sticker(s2["id"], users[1], c); assert len(stickers.get_pack(pack["id"], users[1], c)["stickers"]) == 31
err(stickers.delete_sticker, s1["id"], users[2], c, status=403)
stickers.delete_pack(pack["id"], users[1], c); err(stickers.get_pack, pack["id"], users[1], c, status=404)

# --- GIF: отправка сохраняет, чужую можно сохранить копией
mg = M(1, "g1", "image", "image/gif", ".gif")
gm = services.create_message(c, 1, 1, None, mg, {"gif": True}); assert gm["meta"] == {"gif": True}
assert [x["id"] for x in gifs.saved(users[1], c)] == [mg]
assert gifs.saved(users[2], c) == []
saved = gifs.save(gifs.SaveIn(media_id=mg), users[2], c); assert saved["id"] != mg
assert [x["id"] for x in gifs.saved(users[2], c)] == [saved["id"]]
assert (config.UPLOAD_DIR / c.execute("SELECT stored_name FROM media WHERE id=?", (saved["id"],)).fetchone()[0]).exists()
err(gifs.save, gifs.SaveIn(media_id=mg), users[3], c, status=400) if False else None
try: gifs.save(gifs.SaveIn(media_id=mg), users[3], c); raise AssertionError("чужой доступ")
except HTTPException as e: assert e.status == 404
gifs.unsave(saved["id"], users[2], c); assert gifs.saved(users[2], c) == []
mvg = M(1, "g2", "video", "video/webm", ".webm")                       # GIF из видео без звука
services.create_message(c, 1, 1, None, mvg, {"gif": True}); assert len(gifs.saved(users[1], c)) == 2
try: services.create_message(c, 1, 1, "t", None, {"gif": True}); raise AssertionError
except services.ServiceError: pass
mf = M(1, "f1", "file", "text/plain", ".txt")
try: services.create_message(c, 1, 1, None, mf, {"gif": True}); raise AssertionError
except services.ServiceError: pass
cl = media.clone(mg, users[2], c); assert cl["id"] != mg and cl["kind"] == "image"

# --- реакции: одна на пользователя, негативные
for e in ("\U0001F44E", "\U0001F92C", "\U0001F4A9"): assert e in config.ALLOWED_REACTIONS
_, r = services.toggle_reaction(c, gm["id"], 1, "\U0001F44D"); assert r[0]["count"] == 1
_, r = services.toggle_reaction(c, gm["id"], 1, "\U0001F44E"); assert [x["emoji"] for x in r] == ["\U0001F44E"], r   # заменила
_, r = services.toggle_reaction(c, gm["id"], 2, "\U0001F44E"); assert r[0]["count"] == 2
_, r = services.toggle_reaction(c, gm["id"], 1, "\U0001F44E"); assert r[0]["count"] == 1 and r[0]["users"] == [2]  # снятие
print("stickers/gifs/reactions OK")
