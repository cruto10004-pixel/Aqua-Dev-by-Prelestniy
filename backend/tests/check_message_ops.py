# Проверка логики изменения/удаления сообщений на SQLite без FastAPI: python3 -I backend/tests/check_message_ops.py
import sys, types, os, tempfile
os.environ["AQUA_DATA_DIR"] = tempfile.mkdtemp()
fa = types.ModuleType("fastapi"); fa.WebSocket = object; sys.modules["fastapi"] = fa
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[1]))
from app import config, database, services
from app.services import ServiceError
database.init_db(); database.init_db()
c = database._open(config.DB_PATH); ts = services.now_iso()
for n in ("a", "b", "c"): c.execute("INSERT INTO users (username,password_hash,created_at) VALUES (?,?,?)", (n, "x", ts))
chat, _ = services.create_direct_chat(c, 1, "b"); other, _ = services.create_direct_chat(c, 1, "c")
m1 = services.create_message(c, chat, 1, "привет", None); m2 = services.create_message(c, chat, 2, "ответ", None)
# изменение
e = services.edit_message(c, m1["id"], 1, "  привет, мир ")
assert e["text"] == "привет, мир" and e["edited_at"]
for who, mid in ((2, m1["id"]), (3, m1["id"])):
    try: services.edit_message(c, mid, who, "x"); raise SystemExit("чужое менять нельзя")
    except ServiceError as ex: assert ex.status in (403, 404), ex.status
try: services.edit_message(c, m1["id"], 1, "   "); raise SystemExit("пустой текст")
except ServiceError as ex: assert ex.status == 400
# скрыть у себя: чужое сообщение у себя
services.delete_message(c, m2["id"], 1, "me")
assert [m["id"] for m in services.get_history(c, chat, None, 50, 1)] == [m1["id"]]
assert [m["id"] for m in services.get_history(c, chat, None, 50, 2)] == [m1["id"], m2["id"]]
assert services.serialize_chat(c, chat, 1)["last_message"]["id"] == m1["id"]
assert services.serialize_chat(c, chat, 2)["last_message"]["id"] == m2["id"]
# удалить у всех: только своё
try: services.delete_message(c, m2["id"], 1, "all"); raise SystemExit("чужое у всех нельзя")
except ServiceError as ex: assert ex.status == 403
try: services.delete_message(c, m1["id"], 3, "me"); raise SystemExit("не участник")
except ServiceError as ex: assert ex.status == 404
services.toggle_reaction(c, m1["id"], 2, config.ALLOWED_REACTIONS[0])
services.delete_message(c, m1["id"], 1, "all")
assert [m["id"] for m in services.get_history(c, chat, None, 50, 2)] == [m2["id"]]
assert c.execute("SELECT COUNT(*) FROM reactions").fetchone()[0] == 0, "реакции должны удаляться каскадом"
assert services.last_message_for(c, chat, 1) is None and services.last_message_for(c, chat, 2)["id"] == m2["id"]
print("ops OK")
