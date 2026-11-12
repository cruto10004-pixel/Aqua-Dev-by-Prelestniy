/* Несколько аккаунтов на устройстве: у каждого своя сессия (токен) — переключение мгновенное, без пароля.
   Токены лежат только в localStorage этого устройства; данные в памяти приложения при переключении сбрасываются. */
import { storage } from './storage.js';
import { TOKEN_KEY } from './config.js';

const KEY = 'aqua.accounts';
const PREV = 'aqua.prev-token';

export function listAccounts() {
  try { const v = JSON.parse(storage.get(KEY) || '[]'); return Array.isArray(v) ? v.filter((a) => a?.id && a?.token) : []; }
  catch { return []; }
}
const save = (list) => storage.set(KEY, JSON.stringify(list));

/** Запоминает/обновляет аккаунт (при входе и при смене профиля). */
export function rememberAccount(user, token) {
  const list = listAccounts().filter((a) => a.id !== user.id);
  const old = listAccounts().find((a) => a.id === user.id);
  list.push({ id: user.id, username: user.username, display_name: user.display_name || user.username, avatar: user.avatar ?? null, token: token || old?.token });
  save(list.filter((a) => a.token));
}

export function forgetAccount(id) { save(listAccounts().filter((a) => a.id !== id)); }

/** Переключиться: подменяем активный токен и перезагружаем приложение. */
export function switchAccount(id) {
  const acc = listAccounts().find((a) => a.id === id);
  if (!acc) return false;
  storage.set(TOKEN_KEY, acc.token);
  storage.remove(PREV);
  location.reload();
  return true;
}

/** «Добавить аккаунт»: прячем текущую сессию и показываем вход; отмена вернёт её обратно. */
export function startAddAccount() {
  const cur = storage.get(TOKEN_KEY);
  if (cur) storage.set(PREV, cur);
  storage.remove(TOKEN_KEY);
  location.reload();
}
export const hasPrevSession = () => Boolean(storage.get(PREV));
export function cancelAddAccount() {
  const prev = storage.get(PREV);
  storage.remove(PREV);
  if (prev) storage.set(TOKEN_KEY, prev);
  location.reload();
}
export const clearPrev = () => storage.remove(PREV);
