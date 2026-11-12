"""Безопасность: хеширование паролей (bcrypt), JWT и ограничитель попыток входа."""
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from . import config


# --- Пароли ----------------------------------------------------------------
def hash_password(password: str) -> str:
    """bcrypt с индивидуальной солью; результат содержит соль и стоимость."""
    return bcrypt.hashpw(
        password.encode("utf-8"), bcrypt.gensalt(rounds=config.BCRYPT_ROUNDS)
    ).decode("ascii")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("ascii"))
    except ValueError:
        return False


# Хеш-пустышка: проверяем пароль и для несуществующего логина, чтобы время
# ответа не выдавало, существует ли такой пользователь.
DUMMY_HASH = hash_password("aqua-dummy-password-0")


# --- JWT ---------------------------------------------------------------------
def create_token(user_id: int) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(hours=config.JWT_TTL_HOURS),
    }
    return jwt.encode(payload, config.SECRET_KEY, algorithm=config.JWT_ALGORITHM)


def decode_token(token: str) -> int | None:
    """Возвращает id пользователя или None, если токен недействителен/просрочен."""
    try:
        payload = jwt.decode(token, config.SECRET_KEY, algorithms=[config.JWT_ALGORITHM])
        return int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None


# --- Ограничитель попыток входа (в памяти процесса) -------------------------
class LoginLimiter:
    """Не более LOGIN_MAX_FAILS неудачных попыток за LOGIN_WINDOW_SEC на ключ.

    Ключ — «ip|username». Для нескольких воркеров нужен общий стор (Redis).
    """

    def __init__(self) -> None:
        self._fails: dict[str, deque[float]] = defaultdict(deque)

    def _prune(self, key: str) -> deque[float]:
        q = self._fails[key]
        limit = time.monotonic() - config.LOGIN_WINDOW_SEC
        while q and q[0] < limit:
            q.popleft()
        return q

    def is_blocked(self, key: str) -> bool:
        return len(self._prune(key)) >= config.LOGIN_MAX_FAILS

    def register_fail(self, key: str) -> None:
        self._prune(key).append(time.monotonic())

    def reset(self, key: str) -> None:
        self._fails.pop(key, None)


login_limiter = LoginLimiter()
