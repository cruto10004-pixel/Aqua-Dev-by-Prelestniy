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
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from app import database, config, services
from app.services import ServiceError
database.init_db()
c = database._open(config.DB_PATH); ts = services.now_iso()
for n in ("ann", "ben"): c.execute("INSERT INTO users (username,password_hash,created_at) VALUES (?,?,?)", (n, "x", ts))
a, b = c.execute("SELECT id FROM users WHERE username='ann'").fetchone()[0], c.execute("SELECT id FROM users WHERE username='ben'").fetchone()[0]
ch = services.create_channel(c, a, "Новости", "@News_1")
assert c.execute("SELECT username, is_channel FROM chats WHERE id=?", (ch,)).fetchone()[0] == "news_1"
c.execute("INSERT INTO chat_members (chat_id,user_id,role,joined_at) VALUES (?,?,'member',?)", (ch, b, ts))
s_a = services.serialize_chat(c, ch, a); s_b = services.serialize_chat(c, ch, b)
assert s_a["type"] == "channel" and s_a["can_post"] is True and s_b["can_post"] is False
try: services.require_can_post(c, ch, b); raise SystemExit("subscriber could post")
except ServiceError as e: assert e.status == 403
services.require_can_post(c, ch, a)
try: services.create_channel(c, b, "Dup", "news_1"); raise SystemExit("dup allowed")
except ServiceError as e: assert e.status == 409
try: services.create_channel(c, b, "x", "ab"); raise SystemExit("bad name allowed")
except ServiceError as e: assert e.status == 400
print("channels OK")
services.update_channel(c, ch, a, "Новое имя", "Описание канала")
row = c.execute("SELECT title, description FROM chats WHERE id=?", (ch,)).fetchone()
assert row[0] == "Новое имя" and row[1] == "Описание канала"
assert services.serialize_chat(c, ch, b)["description"] == "Описание канала"
try: services.update_channel(c, ch, b, "hack", None); raise SystemExit("subscriber edited")
except ServiceError as e: assert e.status == 403
print("channel edit OK")
