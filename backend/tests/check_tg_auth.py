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

def last(chat_id): return [t for cid, t in sent if cid == chat_id][-1]
def code_from(chat_id): return re.search(r"код для Aqua: (\d{6})", last(chat_id)).group(1)
def number_from(chat_id): return re.search(r"\+7 \d{3} \d{3}-\d{2}-\d{2}", last(chat_id)).group(0)
def expect(exc_type, fn):
    try: fn()
    except exc_type as e: return e
    raise AssertionError(f"ожидалось {exc_type}")
D = lambda **k: types.SimpleNamespace(**k)
fails = 0
def ok(cond, msg):
    global fails
    print(("PASS " if cond else "FAIL ") + msg); fails += (not cond)

# 1. Бот выдаёт номер на /start; номер стабильный для чата и разный для разных чатов
tg._handle({"message": {"chat": {"id": 555}, "text": "/start"}})
num = number_from(555)
tg._handle({"message": {"chat": {"id": 555}, "text": "/start"}})
ok(number_from(555) == num, "бот выдаёт один и тот же номер этому чату")
tg._handle({"message": {"chat": {"id": 666}, "text": "/start"}})
ok(number_from(666) != num, "другой чат получает другой номер")

# 2. Номер в приложении → код в чат → верный код подтверждает номер
digits = lambda n: re.sub(r"\D", "", n)
att = tg_auth.register_phone(D(phone=num), c)
ok(att["ref"] and att["link"] == "https://t.me/aqua_test_bot", "номер принят, в ответе ref и ссылка на бота")
ok(re.fullmatch(r"\d{6}", code_from(555)) is not None, "код пришёл в чат этого номера")
ok(expect(HTTPException, lambda: tg_auth.register_confirm(D(ref=att["ref"], code="000000"), c)).status == 400, "неверный код: 400")
tg_auth.register_confirm(D(ref=att["ref"], code=code_from(555)), c)
ok(c.execute("SELECT verified FROM tg_refs WHERE ref=?", (att["ref"],)).fetchone()["verified"] == 1, "верный код: номер подтверждён")

# 3. Логин и пароль → аккаунт, привязанный к Telegram
fin = tg_auth.register(D(ref=att["ref"], username="newbie", password="secret123"), c)
u = c.execute("SELECT * FROM users WHERE username='newbie'").fetchone()
ok(fin["token"] and u["tg_chat_id"] == 555, "логин и пароль: аккаунт создан, tg_chat_id=555")
ok(expect(HTTPException, lambda: tg_auth.register(D(ref=att["ref"], username="again", password="secret123"), c)).status == 400, "попытка уже использована")

# 4. Тот же Telegram второй аккаунт не заведёт; неизвестный номер не принимается
ok(expect(HTTPException, lambda: tg_auth.register_phone(D(phone=num), c)).status == 409, "тот же Telegram уже привязан: 409")
ok(expect(HTTPException, lambda: tg_auth.register_phone(D(phone="79000000000"), c)).status == 404, "неизвестный номер: 404")
att_b = tg_auth.register_phone(D(phone=number_from(666)), c)
ok(att_b["ref"] != att["ref"], "второй чат получает свою попытку")

# 5. Логин и пароль без подтверждённого номера не принимаются
ok(expect(HTTPException, lambda: tg_auth.register(D(ref=att_b["ref"], username="nope", password="secret123"), c)).status == 400, "без подтверждения номера аккаунт не создаётся")

# 6. Брут-форс: 5 неверных → попытка сгорает
for _ in range(5):
    try: tg_auth.register_confirm(D(ref=att_b["ref"], code="111111"), c)
    except HTTPException: pass
ok(expect(HTTPException, lambda: tg_auth.register_confirm(D(ref=att_b["ref"], code=code_from(666)), c)).status == 429, "после 5 неверных вводов попытка сгорает: 429")

# 7. Восстановление пароля: код только в чат владельца
rs = tg_auth.reset_start(D(username="newbie"), c)
tg._handle({"message": {"chat": {"id": 777}, "text": "/start x_" + rs["ref"]}})
ok(not any(cid == 777 and "код для Aqua" in t for cid, t in sent), "чужой чат кода не получает")
tg._handle({"message": {"chat": {"id": 555}, "text": "/start x_" + rs["ref"]}})
out = tg_auth.reset_password(D(ref=rs["ref"], code=code_from(555), password="newpass99"), c)
ok(bool(out["token"]), "восстановление: пароль заменён, выдан токен")

# 8. Бот не настроен → 503
tg.enabled = lambda: False
ok(expect(HTTPException, lambda: tg_auth.register_phone(D(phone=num), c)).status == 503, "без токена бота вход по номеру недоступен: 503")

print("ALL OK" if not fails else f"{fails} FAILED"); sys.exit(1 if fails else 0)
