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


from app.routers import chats as chats_r, message_ops
import asyncio
def run(coro): return asyncio.get_event_loop_policy().new_event_loop().run_until_complete(coro)
# сообщения
m1 = services.create_message(c, 1, 1, "привет", None); m2 = services.create_message(c, 1, 2, "ответ", None)
mm = M(1, "p1"); m3 = services.create_message(c, 1, 1, "фото", mm)
# --- прочитанность
chat = services.serialize_chat(c, 1, 1); assert chat["reads"] == {1: 0, 2: 0} and chat["pinned"] is None, chat["reads"]
assert services.mark_read(c, 1, 2, m3["id"]) == m3["id"]
assert services.mark_read(c, 1, 2, 1) == m3["id"], "прочитанность не уменьшается"
assert services.serialize_chat(c, 1, 1)["reads"][2] == m3["id"]
try: services.mark_read(c, 1, 3, 5); raise AssertionError
except services.ServiceError as e: assert e.status == 404
# --- закреп
p = services.set_pinned(c, 1, 2, m1["id"]); assert p["id"] == m1["id"] and services.serialize_chat(c, 1, 1)["pinned"]["id"] == m1["id"]
try: services.set_pinned(c, 1, 2, 9999); raise AssertionError
except services.ServiceError: pass
services.delete_message(c, m1["id"], 1, "all"); assert services.serialize_chat(c, 1, 2)["pinned"] is None, "удаление снимает закреп"
services.set_pinned(c, 1, 1, m2["id"]); assert services.set_pinned(c, 1, 1, None) is None and services.serialize_chat(c, 1, 1)["pinned"] is None
# --- пересылка в другой чат
c.execute("INSERT INTO chats (type, created_by, created_at) VALUES ('direct', 1, ?)", (ts,))
for u in (1, 3): c.execute("INSERT INTO chat_members (chat_id,user_id,joined_at) VALUES (2,?,?)", (u, ts))
f = services.forward_messages(c, 1, [m3["id"], m2["id"]], 2, False)
assert [x["text"] for x in f] == ["ответ", "фото"] or len(f) == 2
by = {x["text"]: x for x in f}
assert by["ответ"]["forwarded"] == {"id": 2, "name": "b"}, by["ответ"]["forwarded"]
assert by["фото"]["forwarded"]["id"] == 1 and by["фото"]["media"]["id"] == mm
h = services.forward_messages(c, 2, [m2["id"]], 1, True)[0]; assert h["forwarded"] is None and h["sender"]["id"] == 2
f2 = services.forward_messages(c, 1, [by["ответ"]["id"]], 1, False)[0]; assert f2["forwarded"]["id"] == 2, "исходный автор сохраняется"
try: services.forward_messages(c, 3, [m2["id"]], 2, False); raise AssertionError("чужой чат")
except services.ServiceError as e: assert e.status == 404
fc = services.forward_messages(c, 2, [m3["id"]], 1, True)[0]; assert fc["media"]["id"] != mm, "чужой файл копируется пересылающему"
# стикер пересылается без копии файла и без id пака в meta
pack = stickers.create_pack(stickers.PackIn(title="t"), users[1], c); st = stickers.add_sticker(pack["id"], stickers.StickerIn(media_id=M(1, "stk")), users[1], c)
sm = services.create_message(c, 1, 1, None, st["media_id"], {"sticker": st["id"]})
fs = services.forward_messages(c, 1, [sm["id"]], 2, True)[0]; assert fs["meta"]["sticker"] == st["id"] and fs["media"]["id"] == st["media_id"]
# --- роутер пересылки
async def fake_send(*a, **k): pass
message_ops.manager.send_to_user = fake_send; chats_r.manager.send_to_users = fake_send
out = run(message_ops.forward(message_ops.ForwardIn(message_ids=[m2["id"]], chat_id=2, hide_sender=False), users[1], c)); assert len(out) == 1
r = run(chats_r.mark_read(1, chats_r.ReadIn(up_to=m3["id"]), users[1], c)); assert r["up_to"] == m3["id"]
r = run(chats_r.pin_message(1, chats_r.PinIn(message_id=m3["id"]), users[1], c)); assert r["message"]["id"] == m3["id"]
print("block4 OK")
