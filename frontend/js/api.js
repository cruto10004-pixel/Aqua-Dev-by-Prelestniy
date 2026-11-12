/* Тонкая обёртка над fetch для REST API Aqua. */
import { API_BASE } from './config.js';

export class ApiError extends Error {
  /** @param {number} status  @param {object} fields — {username_errors, password_errors} при 422 */
  constructor(status, message, fields = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

let token = null;
let onUnauthorized = () => {};
export const setToken = (t) => { token = t; };
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };
export const getToken = () => token;

/** Приводит разные формы detail (строка / объект Aqua / массив FastAPI) к понятному тексту. */
function normalizeError(status, detail) {
  if (typeof detail === 'string') return new ApiError(status, detail);
  if (Array.isArray(detail)) return new ApiError(status, 'Проверьте введённые данные.');
  if (detail && typeof detail === 'object') {
    return new ApiError(status, detail.message || 'Ошибка запроса.', {
      username_errors: detail.username_errors || [],
      password_errors: detail.password_errors || [],
    });
  }
  return new ApiError(status, 'Неизвестная ошибка сервера.');
}

async function request(path, { method = 'GET', json, form, auth = true } = {}) {
  const headers = {};
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  let body;
  if (json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
  if (form) body = form;   // FormData: Content-Type с boundary браузер выставит сам

  let res;
  try {
    res = await fetch(API_BASE + path, { method, headers, body });
  } catch {
    throw new ApiError(0, 'Нет соединения с сервером.');
  }
  let data = null;
  try { data = await res.json(); } catch { /* пустое тело */ }

  if (!res.ok) {
    // 401 на обычных запросах = токен истёк.
    if (res.status === 401 && auth && token) onUnauthorized();
    throw normalizeError(res.status, data?.detail);
  }
  return data;
}

export const api = {
  login:        (username, password) => request('/auth/login', { method: 'POST', json: { username, password }, auth: false }),
  registerCode: (d) => request('/auth/register/code', { method: 'POST', json: d, auth: false }),
  register:     (d) => request('/auth/register', { method: 'POST', json: d, auth: false }),
  me:       () => request('/auth/me'),
  searchUsers: (q) => request(`/users/search?q=${encodeURIComponent(q)}`),
  listChats: () => request('/chats'),
  updateChannel: (id, patch) => request(`/chats/${id}`, { method: 'PATCH', json: patch }),
  createChannel: (title, username) => request('/chats', { method: 'POST', json: { type: 'channel', title, username } }),
  createDirectChat: (username) => request('/chats', { method: 'POST', json: { type: 'direct', username } }),
  getMessages: (chatId, beforeId, limit) =>
    request(`/chats/${chatId}/messages?limit=${limit}${beforeId ? `&before_id=${beforeId}` : ''}`),
  sendMessage: (chatId, text, mediaId = null, meta = null, coverId = null) =>
    request(`/chats/${chatId}/messages`, { method: 'POST', json: { text, media_id: mediaId, meta, cover_id: coverId } }),
  toggleReaction: (messageId, emoji) =>
    request(`/messages/${messageId}/reactions`, { method: 'PUT', json: { emoji } }),
  uploadMedia: (file) => { const form = new FormData(); form.append('file', file); return request('/media', { method: 'POST', form }); },
  editMessage: (id, text) => request(`/messages/${id}`, { method: 'PATCH', json: { text } }),
  deleteMessage: (id, scope) => request(`/messages/${id}?scope=${scope}`, { method: 'DELETE' }),
  userAvatars: (id) => request(`/users/${id}/avatars`),
  deleteAvatar: (mediaId) => request(`/profile/avatars/${mediaId}`, { method: 'DELETE' }),
  userProfile: (id) => request(`/users/${id}/profile`),
  updatePrivacy: (body) => request('/profile/privacy', { method: 'PUT', json: body }),
  updatePrefs: (body) => request('/profile/prefs', { method: 'PUT', json: body }),
  changeUsername: (username, password) => request('/profile/username', { method: 'PUT', json: { username, password } }),
  changePassword: (current_password, new_password) => request('/profile/password', { method: 'PUT', json: { current_password, new_password } }),
  listContacts: () => request('/contacts'),
  listBlocks: () => request('/blocks'),
  setBlocked: (id, on) => request(`/blocks/${id}`, { method: on ? 'PUT' : 'DELETE' }),
  setContact: (id, on) => request(`/contacts/${id}`, { method: on ? 'PUT' : 'DELETE' }),
  updateProfile: (body) => request('/profile', { method: 'PATCH', json: body }),
  gifStatus: () => request('/gifs/status'),
  gifSearch: (q, pos) => request(`/gifs/search?q=${encodeURIComponent(q)}&pos=${pos}`),
  gifImport: (url, title) => request('/gifs/import', { method: 'POST', json: { url, title } }),
  markRead: (chatId, upTo) => request(`/chats/${chatId}/read`, { method: 'POST', json: { up_to: upTo } }),
  pinMessage: (chatId, messageId) => request(`/chats/${chatId}/pin`, { method: 'PUT', json: { message_id: messageId } }),
  forward: (messageIds, chatId, hideSender) => request('/messages/forward', { method: 'POST', json: { message_ids: messageIds, chat_id: chatId, hide_sender: hideSender } }),
  stickerLibrary: () => request('/stickers'),
  createPack: (title) => request('/stickers/packs', { method: 'POST', json: { title } }),
  getPack: (id) => request(`/stickers/packs/${id}`),
  renamePack: (id, title) => request(`/stickers/packs/${id}`, { method: 'PATCH', json: { title } }),
  deletePack: (id) => request(`/stickers/packs/${id}`, { method: 'DELETE' }),
  addPack: (id) => request(`/stickers/packs/${id}/add`, { method: 'PUT' }),
  addSticker: (packId, mediaId) => request(`/stickers/packs/${packId}/stickers`, { method: 'POST', json: { media_id: mediaId } }),
  deleteSticker: (id) => request(`/stickers/${id}`, { method: 'DELETE' }),
  setFavorite: (id, on) => request(`/stickers/${id}/favorite`, { method: on ? 'PUT' : 'DELETE' }),
  removeRecentSticker: (id) => request(`/stickers/${id}/recent`, { method: 'DELETE' }),
  savedGifs: () => request('/gifs/saved'),
  saveGif: (mediaId) => request('/gifs/saved', { method: 'POST', json: { media_id: mediaId } }),
  unsaveGif: (mediaId) => request(`/gifs/saved/${mediaId}`, { method: 'DELETE' }),
  cloneMedia: (id) => request(`/media/${id}/clone`, { method: 'POST' }),
  mediaSummary: () => request('/media/summary'),
  recentMedia: (kind) => request(`/media${kind ? `?kind=${kind}` : ''}`),
};

/** URL файла с токеном (теги <img>/<video>/<audio> не умеют слать заголовки). */
export const mediaUrl = (url) => `${url}?token=${encodeURIComponent(token || '')}`;

/** Превью GIF идёт через наш сервер (CSP не пускает на чужие CDN). */
export const gifProxyUrl = (u) => `${API_BASE}/gifs/proxy?u=${encodeURIComponent(u)}&token=${encodeURIComponent(token || '')}`;
