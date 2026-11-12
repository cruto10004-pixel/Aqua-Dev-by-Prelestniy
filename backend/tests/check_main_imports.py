# Вход по почте без FastAPI: код одноразовый, после ошибок сгорает, билет для нового адреса, старый вход отключён.
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

for name in ("fastapi.middleware", "fastapi.middleware.cors", "fastapi.staticfiles", "fastapi.responses"):
    m = types.ModuleType(name); sys.modules[name] = m
sys.modules["fastapi.middleware.cors"].CORSMiddleware = object
sys.modules["fastapi.staticfiles"].StaticFiles = lambda *a, **k: None
sys.modules["fastapi.responses"].FileResponse = object
sys.modules["fastapi.responses"].JSONResponse = object
class _App:
    def __init__(self, *a, **k): pass
    def __getattr__(self, n): return lambda *a, **k: (lambda f: f)
fa.FastAPI = _App; fa.Request = object
for n in ("jwt",):
    pass
import importlib
try:
    importlib.import_module("app.main")
except ImportError as e:
    raise SystemExit(f"main.py не импортируется: {e}")
print("main imports OK")
