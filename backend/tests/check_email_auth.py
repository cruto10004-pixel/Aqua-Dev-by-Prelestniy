# Регистрация по Telegram-нику без FastAPI: код приходит в бота, одноразовый, после ошибок сгорает,
# занятые логин/ник, сбой отправки, и восстановление пароля по почте (старый путь остался).
import sys, types, os, tempfile, pathlib, time
os.environ["AQUA_DATA_DIR"] = tempfile.mkdtemp()
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
class HTTPException(Exception):
    def __init__(self, status, detail=None, headers=None): self.status, self.detail = status, detail
fa = types.ModuleType("fastapi")
class _R:
    def __init__(self, *a, **k): pass
    def __getattr__(self, name): return lambda *a, **k: (lambda f: f)
fa.APIRouter = _R; fa.HTTPException = HTTPException; fa.Depends = lambda f=None: f; fa.WebSocket = object
fa.UploadFile = object; fa.Query = lambda *a, **k: None; fa.Response = object; fa.Header = lambda *a, **k: None
fa.WebSocketDisconnect = Exception; fa.status = types.SimpleNamespace(); fa.Request = object
sys.modules["fastapi"] = fa
fr = types.ModuleType("fastapi.responses"); fr.FileResponse = object; sys.modules["fastapi.responses"] = fr
_b = types.ModuleType("bcrypt"); _b.hashpw = lambda p, s: b"x"; _b.gensalt = lambda *a, **k: b"s"; _b.checkpw = lambda *a: False
sys.modules["bcrypt"] = _b
pyd = types.ModuleType("pydantic")
class BaseModel:
    def __init__(self, **kw):
        for k, v in kw.items(): setattr(self, k, v)
pyd.BaseModel = BaseModel; pyd.Field = lambda *a, **k: None; sys.modules["pydantic"] = pyd
from app import database, config, email_auth, mail, tg
from app.routers import auth
from app.services import now_iso
database.init_db()
c = database._open(config.DB_PATH)
sent = {}
# Telegram: бот «включён», код уходит в заглушку (контакт → код)
config.TG_BOT_TOKEN, config.TG_BOT_USERNAME = "test", "aqua_test_bot"
def fake_tg_send(chat_id, code):
    sent[chat_id] = code
tg.send_code = fake_tg_send
# Почта — только для восстановления пароля
def fake_send(to, code, purpose="reset"):
    sent[(to, purpose)] = code
mail.send_login_code = fake_send
email_auth.send_login_code = fake_send
email_auth.mail_ready = lambda: True
def expect(status, fn):
    try: fn(); raise SystemExit(f"expected {status}")
    except HTTPException as e: assert e.status == status, (e.status, e.detail)
def link(username, chat_id):
    c.execute("INSERT OR REPLACE INTO tg_chats (username, chat_id, updated_at) VALUES (?, ?, ?)", (username, chat_id, time.time())); c.commit()
S = email_auth.RegisterStart; F = email_auth.RegisterFinish
d = dict(username="ann_1", password="secret123", email="@Ann_One")
link("ann_one", 1001)
expect(422, lambda: email_auth.send_code(S(username="a!", password="secret123", email="@ann_one"), c))   # плохой логин
expect(422, lambda: email_auth.send_code(S(username="ann_1", password="short", email="@ann_one"), c))     # плохой пароль
expect(422, lambda: email_auth.send_code(S(username="ann_1", password="secret123", email="no spaces!"), c))  # плохой ник
expect(422, lambda: email_auth.send_code(S(username="ann_1", password="secret123", email="@nolink_user"), c))  # не нажал Start
email_auth.send_code(S(**d), c)
code = sent[1001]
try: email_auth.send_code(S(**d), c); raise SystemExit("expected 429")
except HTTPException as e:                                                                                     # кулдаун
    assert e.status == 429 and 1 <= e.detail["retry_after"] <= config.EMAIL_CODE_COOLDOWN_SEC, e.detail
assert config.EMAIL_CODE_COOLDOWN_SEC == 30
wrong = "000000" if code != "000000" else "111111"
expect(400, lambda: email_auth.register(F(**d, code=wrong), c))
r = email_auth.register(F(**d, code=code), c)
assert r["user"]["username"] == "ann_1" and r["token"]
row = c.execute("SELECT email FROM users WHERE username='ann_1'").fetchone(); assert row["email"] == "@ann_one"
expect(409, lambda: email_auth.register(F(**d, code=code), c))                                                # логин занят
expect(409, lambda: email_auth.send_code(S(username="ann_2", password="secret123", email="@ann_one"), c))   # ник занят
# брутфорс: 5 неверных — код сгорает
link("bob_1", 1002)
bd = dict(username="bob_1", password="secret123", email="@bob_1")
email_auth.send_code(S(**bd), c)
bw = "000000" if sent[1002] != "000000" else "111111"
for _ in range(5):
    expect(400, lambda: email_auth.register(F(**bd, code=bw), c))
expect(429, lambda: email_auth.register(F(**bd, code=sent[1002]), c))
assert hasattr(auth, "login")

# сбой отправки: 503, код не остаётся в базе, повтор сразу после сбоя не упирается в кулдаун
def boom(chat_id, code): raise mail.MailDeliveryError("telegram: forbidden")
link("cat_1", 1003)
cd = dict(username="cat_1", password="secret123", email="@cat_1")
tg.send_code = boom
expect(503, lambda: email_auth.send_code(S(**cd), c))
assert c.execute("SELECT COUNT(*) n FROM email_codes WHERE email='@cat_1'").fetchone()["n"] == 0
tg.send_code = fake_tg_send
email_auth.send_code(S(**cd), c)
assert 1003 in sent

# повторная отправка после кулдауна: прежний код перестаёт действовать, новый работает
link("dan_1", 1004)
dd = dict(username="dan_1", password="secret123", email="@dan_1")
email_auth.send_code(S(**dd), c); first = sent[1004]
c.execute("UPDATE email_codes SET created_at = created_at - 100 WHERE email = '@dan_1'"); c.commit()
email_auth.send_code(S(**dd), c); second = sent[1004]
if first != second: expect(400, lambda: email_auth.register(F(**dd, code=first), c))
assert email_auth.register(F(**dd, code=second), c)["user"]["username"] == "dan_1"

# Telegram выключен — понятная ошибка, а не падение
tg_token = config.TG_BOT_TOKEN; config.TG_BOT_TOKEN = ""
expect(503, lambda: email_auth.send_code(S(username="eve_1", password="secret123", email="@eve_1"), c))
config.TG_BOT_TOKEN = tg_token

# восстановление пароля по почте (старый путь): аккаунт с почтой вставляем напрямую
c.execute("INSERT INTO users (username, password_hash, created_at, email) VALUES ('rob_1', 'x', ?, 'rob@example.com')", (now_iso(),)); c.commit()
RS = email_auth.ResetStart; RF = email_auth.ResetFinish
expect(404, lambda: email_auth.send_reset_code(RS(email="nobody@example.com"), c))
email_auth.send_reset_code(RS(email="rob@example.com"), c)
rcode = sent[("rob@example.com", "reset")]
expect(422, lambda: email_auth.reset_password(RF(email="rob@example.com", code=rcode, password="short"), c))
wrong = "000000" if rcode != "000000" else "111111"
expect(400, lambda: email_auth.reset_password(RF(email="rob@example.com", code=wrong, password="newsecret1"), c))
r = email_auth.reset_password(RF(email="rob@example.com", code=rcode, password="newsecret1"), c)
assert r["user"]["username"] == "rob_1" and r["token"]
expect(400, lambda: email_auth.reset_password(RF(email="rob@example.com", code=rcode, password="newsecret1"), c))  # одноразовый
print("email auth OK (telegram registration)")
