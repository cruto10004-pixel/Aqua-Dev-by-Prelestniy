/* Клиентская проверка логина и пароля. Правила зеркалят серверные (backend/app/validators.py);
   окончательное решение всегда за сервером. */

export const PASSWORD_RULES = [
  { id: 'length', test: (p) => p.length >= 8 },
  { id: 'lower',  test: (p) => /[a-z]/.test(p) },
  { id: 'digit',  test: (p) => /[0-9]/.test(p) },
];
const PASSWORD_MAX_BYTES = 72; // предел bcrypt

/** Результат по каждому правилу: [{id, ok}] */
export function checkPassword(password) {
  return PASSWORD_RULES.map((r) => ({ id: r.id, ok: r.test(password) }));
}

export function isPasswordValid(password) {
  return checkPassword(password).every((r) => r.ok) &&
    new TextEncoder().encode(password).length <= PASSWORD_MAX_BYTES;
}

const USERNAME_RE = /^[A-Za-z0-9_]{3,32}$/;

/** Возвращает текст ошибки или пустую строку. */
export function usernameError(username) {
  return USERNAME_RE.test(username)
    ? ''
    : 'Имя пользователя: 3–32 символа, только латинские буквы, цифры и «_».';
}
