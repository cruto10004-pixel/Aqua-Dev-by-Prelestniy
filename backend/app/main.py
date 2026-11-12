"""Точка входа: приложение FastAPI «Aqua».

Запуск (из папки backend/):
    uvicorn app.main:app --reload
"""
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import config
from .database import init_db
from . import email_auth
from .routers import auth, chats, contacts, gifs, media, message_ops, profile, reactions, stickers, ws


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()          # создаём таблицы при старте
    log = logging.getLogger("uvicorn.error")
    log.info("Aqua: данные в %s (база: %s)", config.DATA_DIR, config.DB_PATH)
    if not config.DATA_PERSISTENT and (os.getenv("RAILWAY_ENVIRONMENT") or os.getenv("RAILWAY_PROJECT_ID")):
        log.warning("Aqua: ВНИМАНИЕ — Volume не подключён, база и файлы будут стёрты при следующем деплое. "
                    "Добавьте Volume (Mount path /data) к сервису.")
    yield


app = FastAPI(title="Aqua Messenger", version="0.1.0", lifespan=lifespan)

if config.CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware, allow_origins=config.CORS_ORIGINS,
        allow_methods=["*"], allow_headers=["*"],
    )


@app.middleware("http")
async def security_headers(request: Request, call_next):
    """Базовые защитные заголовки для всех ответов."""
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "same-origin")
    response.headers.setdefault("Content-Security-Policy", config.CONTENT_SECURITY_POLICY)
    response.headers.setdefault("Permissions-Policy", "microphone=(self), camera=(), geolocation=()")
    # HSTS — только когда запрос пришёл по HTTPS (в том числе через обратный прокси)
    if request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https":
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return response


@app.get("/api/health", tags=["service"])
def health():
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(email_auth.router)
app.include_router(chats.router)
app.include_router(media.router)
app.include_router(reactions.router)
app.include_router(message_ops.router)
app.include_router(gifs.router)
app.include_router(stickers.router)
app.include_router(contacts.router)
app.include_router(profile.router)
app.include_router(ws.router)

# Фронтенд (Этап 2+) отдаём с того же origin — так не нужен CORS, а WS работает без хлопот.
# Монтируем последним, чтобы не перекрывать /api и /ws.
if (config.FRONTEND_DIR / "index.html").exists():
    app.mount("/", StaticFiles(directory=config.FRONTEND_DIR, html=True), name="frontend")
else:
    app.mount("/assets", StaticFiles(directory=config.FRONTEND_DIR / "assets"), name="assets")
