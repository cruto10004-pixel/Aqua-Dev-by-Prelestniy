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
mail.send_login_code = lambda to, code: sent.__setitem__(to, code)
email_auth.send_login_code = mail.send_login_code
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
expect(429, lambda: email_auth.send_code(S(**d), c))                                                             # cooldown
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
print("email auth OK")
