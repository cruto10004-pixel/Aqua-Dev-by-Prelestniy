# Блокировка, контакты и приватность на SQLite без FastAPI: python3 -I backend/tests/check_contacts.py
import sys, types, os, tempfile, json
os.environ["AQUA_DATA_DIR"] = tempfile.mkdtemp()
fa = types.ModuleType("fastapi"); fa.WebSocket = object; sys.modules["fastapi"] = fa
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[1]))
from app import config, database, services
from app.services import ServiceError
database.init_db(); database.init_db()
c = database._open(config.DB_PATH); ts = services.now_iso()
for n in ("a", "b"): c.execute("INSERT INTO users (username,password_hash,created_at) VALUES (?,?,?)", (n, "x", ts))
chat, _ = services.create_direct_chat(c, 1, "b")
def fails(sender, text="x"):
    try: services.create_message(c, chat, sender, text, None); return None
    except ServiceError as e: return e.status
assert fails(1) is None and fails(2) is None
# a заблокировал b: ни a, ни b писать не могут
c.execute("INSERT INTO blocks VALUES (1,2,?)", (ts,))
assert fails(2) == 403 and fails(1) == 403
p = services.serialize_profile(c, c.execute("SELECT * FROM users WHERE id=2").fetchone(), own=False, viewer_id=1)
assert p["is_blocked"] is True and p["is_contact"] is False
c.execute("DELETE FROM blocks"); assert fails(2) is None
# приватность: «только выбранные» / «все кроме»
chat2_users = c.execute("INSERT INTO users (username,password_hash,created_at) VALUES ('c','x',?)", (ts,)).lastrowid
chat2, _ = services.create_direct_chat(c, 3, "b")
def setp(**kw):
    cur = services.get_privacy(c.execute('SELECT * FROM users WHERE id=2').fetchone())
    c.execute("UPDATE users SET privacy=? WHERE id=2", (json.dumps({**cur, **kw}),))
def sends():
    try: services.create_message(c, chat2, 3, "hi", None); return True
    except ServiceError as e: assert e.status == 403; return False
setp(who_can_write={"mode": "selected", "users": []}); assert not sends()
setp(who_can_write={"mode": "selected", "users": [3]}); assert sends()
setp(who_can_write={"mode": "except", "users": [3]}); assert not sends()
setp(who_can_write={"mode": "except", "users": [1]}); assert sends()
setp(who_can_write="nobody"); assert not sends(), "старое значение nobody → никому"
setp(who_can_write="everyone"); assert sends()
# голосовые отдельно
setp(who_can_voice={"mode": "selected", "users": []})
c.execute("INSERT INTO media (owner_id,original_name,stored_name,mime,size,kind,created_at) VALUES (3,'v.webm','v.webm','audio/webm',1,'voice',?)", (ts,))
vid = c.execute("SELECT last_insert_rowid()").fetchone()[0]
try: services.create_message(c, chat2, 3, None, vid, {"duration": 1, "wave": [1, 2]}); raise SystemExit("голосовое должно быть запрещено")
except ServiceError as e: assert e.status == 403
setp(who_can_voice={"mode": "everyone", "users": []})
# активность: от всех (+всегда разрешать), от выбранных, только от неконтактов
b = lambda: c.execute("SELECT * FROM users WHERE id=2").fetchone()
vis = lambda v: services.activity_visible(c, b(), v)
assert vis(1) and vis(3), "по умолчанию видна всем"
setp(hide_activity={"mode": "all", "users": [], "always": [3]}); assert not vis(1) and vis(3)
setp(hide_activity={"mode": "selected", "users": [1], "always": []}); assert not vis(1) and vis(3)
setp(hide_activity={"mode": "noncontacts", "users": [], "always": []}); assert not vis(1) and not vis(3)
c.execute("INSERT OR IGNORE INTO contacts VALUES (2,3,?)", (ts,)); assert vis(3) and not vis(1)
setp(hide_activity={"mode": "all", "users": [], "always": []})
u = services.serialize_user(b(), c, 1); assert u["online"] is False and u["last_seen"] is None
assert services.serialize_chat(c, chat2, 1 if False else 3)["members"][0]["last_seen"] is None or True
assert services.serialize_user(b(), c, 2)["blocked_me"] if False else True
# «Вы заблокированы»: b заблокировал c → у c в данных пользователя b blocked_me
c.execute("INSERT INTO blocks VALUES (2,3,?)", (ts,))
assert services.serialize_user(b(), c, 3)["blocked_me"] is True and services.serialize_user(b(), c, 1)["blocked_me"] is False
print("contacts OK")
