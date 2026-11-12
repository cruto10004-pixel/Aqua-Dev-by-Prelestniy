"""Удаляет старые аккаунты, созданные по логину и паролю (без привязанной почты).

Запуск (сначала без --yes — покажет, что будет удалено):
    python3 backend/tools/purge_legacy_accounts.py
    python3 backend/tools/purge_legacy_accounts.py --yes
На Railway: railway run python3 backend/tools/purge_legacy_accounts.py --yes
Перед удалением делается копия базы рядом с файлом.
"""
import shutil
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import config  # noqa: E402


def main() -> None:
    db_path = Path(config.DB_PATH)
    if not db_path.exists():
        print(f"Базы нет: {db_path}")
        return
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    legacy = [r["id"] for r in conn.execute("SELECT id FROM users WHERE email IS NULL OR email = ''")]
    print(f"Старых аккаунтов без почты: {len(legacy)}")
    if not legacy:
        return
    if "--yes" not in sys.argv:
        print("Запустите с --yes, чтобы удалить. Ничего не изменено.")
        return
    backup = db_path.with_name(f"{db_path.stem}.before-purge-{datetime.now():%Y%m%d-%H%M%S}.db")
    conn.close()
    shutil.copy2(db_path, backup)
    print(f"Резервная копия: {backup}")
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    marks = ",".join("?" * len(legacy))
    with conn:
        conn.execute(f"DELETE FROM messages WHERE sender_id IN ({marks})", legacy)
        conn.execute(f"DELETE FROM chats WHERE created_by IN ({marks})", legacy)
        conn.execute(f"DELETE FROM users WHERE id IN ({marks})", legacy)
    problems = conn.execute("PRAGMA foreign_key_check").fetchall()
    print("Удалено. Проблемных ссылок после удаления:", len(problems))
    conn.close()


if __name__ == "__main__":
    main()
