# Регистрация и восстановление через Telegram-бота без FastAPI: роутеры вызываются как функции.
# python3 -I backend/tests/check_tg_auth.py
import sys, types, os, tempfile, pathlib, re, time
os.environ["AQUA_DATA_DIR"] = tempfile.mkdtemp()
os.environ["AQUA_TG_BOT_TOKEN"] = "123:test"; os.environ["AQUA_TG_BOT_USERNAME"] = "aqua_test_bot"

class HTTPException(Exception):
    def __init__(self, status, detail=None, headers=None): self.status, self.detail = status, detail
fa = types.ModuleType("fastapi")
class _R:
    def __init__(self, *a, **k): pass
    def __getattr__(self, name): return lambda *a, **k: (lambda f: f)
fa.APIRouter = _R; fa.HTTPException = HTTPException; fa.Depends = lambda f=None: f; fa.WebSocket = object
fa.UploadFile = object; fa.Query = lambda *a, **k: None; fa.Response = object; fa.Header = lambda *a, **k: None
fa.WebSocketDisconnect = Exception; fa.status = types.SimpleNamespace()
sys.modules["fastapi"] = fa
fr = types.ModuleType("fastapi.responses"); fr.FileResponse = object; sys.modules["fastapi.responses"] = fr
pyd = types.ModuleType("pydantic")
class BaseModel:
    def __init__(self, **k): self.__dict__.update(k)
pyd.BaseModel = BaseModel; pyd.Field = lambda *a, **k: None; sys.modules["pydantic"] = pyd
_b = types.ModuleType("bcrypt"); _b.hashpw = lambda p, s: b"x"; _b.gensalt = lambda *a, **k: b"s"; _b.checkpw = lambda *a: False
sys.modules.setdefault("bcrypt", _b)
_j = types.ModuleType("jwt"); _j.encode = lambda *a, **k: "tok"; _j.decode = lambda *a, **k: {}; sys.modules.setdefault("jwt", _j)
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from app import config, database, services, tg, tg_auth
database.init_db()
c = database._open(config.DB_PATH)

sent = []
def fake_call(method, payload, timeout=30):
    if method == "sendMessage": sent.append((payload["chat_id"], payload["text"]))
    return {"ok": True, "result": []}
tg._call = fake_call

def code_from(chat_id):
    text = [t for cid, t in sent if cid == chat_id][-1]
    return re.search(r"код для Aqua: (\d{6})", text).group(1)
def ref_from(link): return link.split("start=")[1][2:]
def expect(exc_type, fn):
    try: fn()
    except exc_type as e: return e
    raise AssertionError(f"ожидалось {exc_type}")
D = lambda **k: types.SimpleNamespace(**k)
fails = 0
def ok(cond, msg):
    global fails
    print(("PASS " if cond else "FAIL ") + msg); fails += (not cond)

# 1. Регистрация: ссылка с r_ и код приходит в чат после Start
att = tg_auth.register_start(D(username="newbie", password="secret123"), c)
ok(att["link"].startswith("https://t.me/aqua_test_bot?start=r_") and att["ref"] in att["link"], "регистрация: получена ссылка на бота")
tg._handle({"message": {"chat": {"id": 555}, "text": "/start r_" + att["ref"]}})
ok(re.fullmatch(r"\d{6}", code_from(555)) is not None, "бот по /start r_ прислал 6-значный код в чат")

# 2. Неверный код, затем верный → аккаунт привязан к чату
e = expect(HTTPException, lambda: tg_auth.register(D(ref=att["ref"], code="000000"), c))
ok(e.status == 400 and "Осталось попыток" in e.detail, "неверный код: 400 с остатком попыток")
res = tg_auth.register(D(ref=att["ref"], code=code_from(555)), c)
u = c.execute("SELECT * FROM users WHERE username='newbie'").fetchone()
ok(res["token"] and u and u["tg_chat_id"] == 555, "верный код: аккаунт создан, tg_chat_id=555")
ok(expect(HTTPException, lambda: tg_auth.register(D(ref=att["ref"], code=code_from(555)), c)).status == 400, "попытка уже использована: повтор запрещён")

# 3. Тот же Telegram не может завести второй аккаунт
att2 = tg_auth.register_start(D(username="second", password="secret123"), c)
tg._handle({"message": {"chat": {"id": 555}, "text": "/start r_" + att2["ref"]}})
ok(expect(HTTPException, lambda: tg_auth.register(D(ref=att2["ref"], code=code_from(555)), c)).status == 409, "тот же Telegram уже привязан: 409")

# 4. Восстановление: код уходит только в чат владельца
rs = tg_auth.reset_start(D(username="newbie"), c)
tg._handle({"message": {"chat": {"id": 777}, "text": "/start x_" + rs["ref"]}})
ok(not any(cid == 777 and "код для Aqua" in t for cid, t in sent), "чужой чат кода не получает")
tg._handle({"message": {"chat": {"id": 555}, "text": "/start x_" + rs["ref"]}})
rcode = code_from(555)
out = tg_auth.reset_password(D(ref=rs["ref"], code=rcode, password="newpass99"), c)
ok(bool(out["token"]), "восстановление: пароль заменён, выдан токен")
ok(expect(HTTPException, lambda: tg_auth.reset_start(D(username="second"), c)).status == 404, "без привязки к Telegram восстановить нельзя: 404")

# 5. Брут-форс: 5 неверных → попытка сгорает
att3 = tg_auth.register_start(D(username="brute", password="secret123"), c)
tg._handle({"message": {"chat": {"id": 888}, "text": "/start r_" + att3["ref"]}})
for _ in range(5):
    try: tg_auth.register(D(ref=att3["ref"], code="111111"), c)
    except HTTPException: pass
ok(expect(HTTPException, lambda: tg_auth.register(D(ref=att3["ref"], code=code_from(888)), c)).status == 429, "после 5 неверных вводов попытка сгорает: 429")

# 6. Просроченная ссылка
att4 = tg_auth.register_start(D(username="late", password="secret123"), c)
c.execute("UPDATE tg_refs SET expires_at=? WHERE ref=?", (time.time() - 1, att4["ref"])); c.commit()
tg._handle({"message": {"chat": {"id": 999}, "text": "/start r_" + att4["ref"]}})
ok("устарела" in [t for cid, t in sent if cid == 999][-1], "просроченная ссылка: бот отвечает, что устарела, кода нет")

# 7. Бот не настроен → 503
tg.enabled = lambda: False
ok(expect(HTTPException, lambda: tg_auth.register_start(D(username="nobot", password="secret123"), c)).status == 503, "без токена бота регистрация недоступна: 503")

print("ALL OK" if not fails else f"{fails} FAILED"); sys.exit(1 if fails else 0)
