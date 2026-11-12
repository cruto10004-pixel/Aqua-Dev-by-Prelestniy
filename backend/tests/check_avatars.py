# Галерея аватарок на SQLite без FastAPI: python3 -I backend/tests/check_avatars.py
import sys, types, os, tempfile
os.environ["AQUA_DATA_DIR"] = tempfile.mkdtemp()
fa = types.ModuleType("fastapi"); fa.WebSocket = object; sys.modules["fastapi"] = fa
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[1]))
from app import config, database, services
database.init_db(); database.init_db()
c = database._open(config.DB_PATH); ts = services.now_iso()
for n in ("a", "b"): c.execute("INSERT INTO users (username,password_hash,created_at) VALUES (?,?,?)", (n, "x", ts))
for i in (1, 2, 3):
    c.execute("INSERT INTO media (owner_id,original_name,stored_name,mime,size,kind,created_at) VALUES (1,?,?,?,?,?,?)", (f"{i}.png", f"{i}.png", "image/png", 1, "image", ts))
for m in (1, 2, 3): services.add_avatar(c, 1, m)
services.add_avatar(c, 1, 2)                                   # повтор не дублирует
c.execute("UPDATE users SET avatar_id = 2 WHERE id = 1")
l = services.list_avatars(c, 1)
assert [x["media_id"] for x in l] == [2, 3, 1] and l[0]["current"] and not l[1]["current"], l
assert services.can_access_media(c, 1, 2) and services.can_access_media(c, 3, 2), "галерея видна другим"
# удаление текущего → следующее по новизне; миграция подхватывает старый avatar_id
c.execute("DELETE FROM user_avatars WHERE user_id=1 AND media_id=2")
nxt = c.execute("SELECT media_id FROM user_avatars WHERE user_id=1 ORDER BY id DESC LIMIT 1").fetchone()["media_id"]; assert nxt == 3
c.execute("UPDATE users SET avatar_id = 1 WHERE id = 2"); c.execute("DELETE FROM user_avatars"); c.commit()
database.init_db(); c2 = database._open(config.DB_PATH)
assert [x["media_id"] for x in services.list_avatars(c2, 2)] == [1], "миграция"
print("avatars OK")
