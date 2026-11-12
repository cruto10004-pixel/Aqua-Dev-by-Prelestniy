/* Черновики: набранный, но не отправленный текст хранится на устройстве отдельно для каждого чата. */
import { state } from './state.js';
import { storage } from './storage.js';

const key = (chatId) => `aqua.draft.${state.user?.id ?? 0}.${chatId}`;

export const getDraft = (chatId) => storage.get(key(chatId)) || '';
export function setDraft(chatId, text) {
  const t = (text || '').trim() ? text : '';
  if (t) storage.set(key(chatId), t); else storage.remove(key(chatId));
}
