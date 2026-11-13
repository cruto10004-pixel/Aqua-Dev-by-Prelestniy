# Регистрация с кодом из письма без FastAPI: код одноразовый, после ошибок сгорает, занятые логин/почта, вход по паролю остался.
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
from app import database, config, email_auth, mail
from app.routers import auth
database.init_db()
c = database._open(config.DB_PATH)
sent = {}
config.EMAIL_DEV = True
def fake_send(to, code, purpose="register"):
    sent[to] = code; sent[(to, purpose)] = code
mail.send_login_code = fake_send
email_auth.send_login_code = fake_send
email_auth.mail_ready = lambda: True
def expect(status, fn):
    try: fn(); raise SystemExit(f"expected {status}")
    except HTTPException as e: assert e.status == status, (e.status, e.detail)
S = email_auth.RegisterStart; F = email_auth.RegisterFinish
d = dict(username="ann_1", password="secret123", email="Ann@Example.com")
expect(422, lambda: email_auth.send_code(S(username="a!", password="secret123", email="ann@example.com"), c))   # плохой логин
expect(422, lambda: email_auth.send_code(S(username="ann_1", password="short", email="ann@example.com"), c))     # плохой пароль
expect(422, lambda: email_auth.send_code(S(username="ann_1", password="secret123", email="nope"), c))           # плохая почта
email_auth.send_code(S(**d), c)
code = sent["ann@example.com"]
try: email_auth.send_code(S(**d), c); raise SystemExit("expected 429")
except HTTPException as e:                                                                                       # cooldown
    assert e.status == 429 and 1 <= e.detail["retry_after"] <= config.EMAIL_CODE_COOLDOWN_SEC, e.detail
assert config.EMAIL_CODE_COOLDOWN_SEC == 30
wrong = "000000" if code != "000000" else "111111"
expect(400, lambda: email_auth.register(F(**d, code=wrong), c))
r = email_auth.register(F(**d, code=code), c)
assert r["user"]["username"] == "ann_1" and r["token"]
row = c.execute("SELECT email FROM users WHERE username='ann_1'").fetchone(); assert row["email"] == "ann@example.com"
expect(409, lambda: email_auth.register(F(**d, code=code), c))                                                   # логин уже занят
expect(409, lambda: email_auth.send_code(S(username="ann_2", password="secret123", email="ann@example.com"), c)) # почта занята
# брутфорс: 5 неверных — код сгорает
bd = dict(username="bob_1", password="secret123", email="bob@example.com")
email_auth.send_code(S(**bd), c)
bw = "000000" if sent["bob@example.com"] != "000000" else "111111"
for _ in range(5):
    expect(400, lambda: email_auth.register(F(**bd, code=bw), c))
expect(429, lambda: email_auth.register(F(**bd, code=sent["bob@example.com"]), c))
assert hasattr(auth, "login")

# письмо не ушло: 503, код не остаётся в базе, повторный запрос сразу после сбоя не упирается в кулдаун
def boom(to, code, purpose="register"): raise mail.MailDeliveryError("provider down")
cd = dict(username="cat_1", password="secret123", email="cat@example.com")
email_auth.send_login_code = boom
expect(503, lambda: email_auth.send_code(S(**cd), c))
assert c.execute("SELECT COUNT(*) n FROM email_codes WHERE email='cat@example.com'").fetchone()["n"] == 0
email_auth.send_login_code = fake_send
email_auth.send_code(S(**cd), c)
assert (("cat@example.com", "register") in sent)

# повторная отправка после кулдауна: прежний код перестаёт действовать, новый работает
dd = dict(username="dan_1", password="secret123", email="dan@example.com")
email_auth.send_code(S(**dd), c); first = sent["dan@example.com"]
c.execute("UPDATE email_codes SET created_at = created_at - 100 WHERE email = 'dan@example.com'"); c.commit()
email_auth.send_code(S(**dd), c); second = sent["dan@example.com"]
if first != second: expect(400, lambda: email_auth.register(F(**dd, code=first), c))
assert email_auth.register(F(**dd, code=second), c)["user"]["username"] == "dan_1"

# восстановление пароля: нет такой почты — 404; код регистрации для сброса не годится; верный код меняет пароль
RS = email_auth.ResetStart; RF = email_auth.ResetFinish
expect(404, lambda: email_auth.send_reset_code(RS(email="nobody@example.com"), c))
email_auth.send_reset_code(RS(email="ann@example.com"), c)
rcode = sent[("ann@example.com", "reset")]
expect(422, lambda: email_auth.reset_password(RF(email="ann@example.com", code=rcode, password="short"), c))
wrong = "000000" if rcode != "000000" else "111111"
expect(400, lambda: email_auth.reset_password(RF(email="ann@example.com", code=wrong, password="newsecret1"), c))
r = email_auth.reset_password(RF(email="ann@example.com", code=rcode, password="newsecret1"), c)
assert r["user"]["username"] == "ann_1" and r["token"]
expect(400, lambda: email_auth.reset_password(RF(email="ann@example.com", code=rcode, password="newsecret1"), c))   # код одноразовый
print("email auth OK")
