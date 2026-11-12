"""Серверная валидация логина и пароля (без внешних зависимостей)."""
import re

PASSWORD_MIN_LEN = 8
# bcrypt учитывает только первые 72 байта, поэтому ограничиваем сверху явно.
PASSWORD_MAX_BYTES = 72

USERNAME_RE = re.compile(r"^[A-Za-z0-9_]{3,32}$")


def validate_password(password: str) -> list[str]:
    """Возвращает список понятных ошибок; пустой список — пароль подходит.

    Правила:
      * минимум 8 символов;
      * хотя бы одна строчная латинская буква (a-z);
      * хотя бы одна цифра (0-9).
    """
    errors: list[str] = []
    if len(password) < PASSWORD_MIN_LEN:
        errors.append(f"Пароль должен содержать не менее {PASSWORD_MIN_LEN} символов.")
    if not re.search(r"[a-z]", password):
        errors.append("Добавьте хотя бы одну строчную латинскую букву (a–z).")
    if not re.search(r"[0-9]", password):
        errors.append("Добавьте хотя бы одну цифру (0–9).")
    if len(password.encode("utf-8")) > PASSWORD_MAX_BYTES:
        errors.append(f"Пароль слишком длинный (максимум {PASSWORD_MAX_BYTES} байт).")
    return errors


def validate_username(username: str) -> list[str]:
    """Логин: 3–32 символа, только латиница, цифры и подчёркивание."""
    if not USERNAME_RE.fullmatch(username):
        return ["Имя пользователя: 3–32 символа, только латинские буквы, цифры и «_»."]
    return []
