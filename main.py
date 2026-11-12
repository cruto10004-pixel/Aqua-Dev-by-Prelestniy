"""Точка входа для платформ, которые по умолчанию запускают `uvicorn main:app` из корня репозитория.

Настоящее приложение лежит в backend/app/main.py (пакет `app`). Здесь мы только добавляем backend/
в путь импорта и отдаём тот же объект `app`. Рабочая команда остаётся прежней:
    cd backend && uvicorn app.main:app
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "backend"))

from app.main import app  # noqa: E402,F401
