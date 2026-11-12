/* АВТОСГЕНЕРИРОВАНО tools/build_bundle.js — не редактировать вручную.
 * Пересобрать: node tools/build_bundle.js
 * Источник: frontend/js/app.js и его граф import'ов.
 */

(function () {

'use strict';

const __m = {};

__m["dom.js"] = (function () {

/* Мини-хелперы для работы с DOM. Текст пользователей вставляется только через textContent /
   createTextNode — это исключает XSS. innerHTML для пользовательских данных не используется. */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** el('div', {class:'a', dataset:{id:1}, onclick: fn}, 'текст', childNode) */
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(child));
  }
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
/** SVG-иконка из спрайта: icon('i-file', 'icon--sm') */
function icon(id, extraClass = '') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', `icon ${extraClass}`.trim());
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#${id}`);
  svg.append(use);
  return svg;
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

  return { $, $$, el, icon, debounce };
})();

__m["config.js"] = (function () {

/* Константы клиента Aqua. Фронтенд отдаётся тем же сервером, что и API (тот же origin). */
const API_BASE = '/api';
const wsUrl = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

const TOKEN_KEY = 'aqua.token';
const PAGE_SIZE = 50;            // сообщений за один запрос истории

// «Печатает…»
const TYPING_THROTTLE_MS = 2500; // как часто слать «печатаю» пока идёт набор
const TYPING_IDLE_MS = 3000;     // через сколько тишины слать «перестал»
const TYPING_EXPIRE_MS = 5000;   // через сколько скрывать чужой индикатор, если не пришло обновление

// Heartbeat WebSocket
const PING_INTERVAL_MS = 25000;
const PONG_TIMEOUT_MS = 10000;

// На сенсорных устройствах Enter — перенос строки (отправка кнопкой), как в мобильных мессенджерах.
// Поставьте false, чтобы Enter отправлял и на телефонах.
const ENTER_NEWLINE_ON_TOUCH = true;

// Эмодзи-реакции. Порядок и значения совпадают с ALLOWED_REACTIONS на сервере (backend/app/config.py).
const REACTIONS = [
  '\u{1F44D}', '\u2764\uFE0F', '\u{1F602}', '\u{1F62E}',
  '\u{1F622}', '\u{1F525}', '\u{1F44F}', '\u{1F389}',
  // негативные
  '\u{1F44E}', '\u{1F92C}', '\u{1F4A9}', '\u{1F921}',
];

// Голосовые сообщения
const VOICE_MAX_MS = 5 * 60 * 1000;   // автоматическая остановка и отправка
const VOICE_MIN_MS = 600;             // короче — считаем случайным нажатием
const VOICE_WAVE_BARS = 40;           // столбиков волны в сообщении

// Заставка: показываем раз за сессию вкладки, но не дольше SPLASH_MAX_MS
const SPLASH_KEY = 'aqua.splash.seen';
const SPLASH_MAX_MS = 4500;

  return { API_BASE, wsUrl, TOKEN_KEY, PAGE_SIZE, TYPING_THROTTLE_MS, TYPING_IDLE_MS, TYPING_EXPIRE_MS, PING_INTERVAL_MS, PONG_TIMEOUT_MS, ENTER_NEWLINE_ON_TOUCH, REACTIONS, VOICE_MAX_MS, VOICE_MIN_MS, VOICE_WAVE_BARS, SPLASH_KEY, SPLASH_MAX_MS };
})();

__m["api.js"] = (function () {
  const { API_BASE } = __m["config.js"];
/* Тонкая обёртка над fetch для REST API Aqua. */


class ApiError extends Error {
  /** @param {number} status  @param {object} fields — {username_errors, password_errors} при 422 */
  constructor(status, message, fields = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

let token = null;
let onUnauthorized = () => {};
const setToken = (t) => { token = t; };
const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };
const getToken = () => token;

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

const api = {
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
const mediaUrl = (url) => `${url}?token=${encodeURIComponent(token || '')}`;

/** Превью GIF идёт через наш сервер (CSP не пускает на чужие CDN). */
const gifProxyUrl = (u) => `${API_BASE}/gifs/proxy?u=${encodeURIComponent(u)}&token=${encodeURIComponent(token || '')}`;

  return { ApiError, setToken, setUnauthorizedHandler, getToken, api, mediaUrl, gifProxyUrl };
})();

__m["socket.js"] = (function () {
  const { wsUrl, PING_INTERVAL_MS, PONG_TIMEOUT_MS } = __m["config.js"];
/* WebSocket-клиент: авторизация первым сообщением, автопереподключение с экспоненциальной
   задержкой, heartbeat. Протокол описан в backend/app/routers/ws.py. */


class AquaSocket {
  /** @param {() => string} getToken */
  constructor(getToken) {
    this.getToken = getToken;
    this.ws = null;
    this.state = 'closed';            // closed | connecting | open
    this.handlers = new Map();        // type -> Set<fn>
    this.retry = 0;
    this.manualClose = false;
    this.reconnectTimer = null;
    this.pingTimer = null;
    this.pongTimer = null;

    // Вернулись в сеть / на вкладку — не ждём таймера, переподключаемся сразу.
    window.addEventListener('online', () => this._reconnectNow());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this._reconnectNow(); });
  }

  /** Подписка на событие сервера или служебное: 'state', 'ready', 'message', 'typing', ... Возвращает отписку. */
  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.handlers.get(type)?.delete(fn);
  }
  _emit(type, payload) { this.handlers.get(type)?.forEach((fn) => fn(payload)); }
  _setState(s) { if (this.state !== s) { this.state = s; this._emit('state', s); } }

  connect() {
    this.manualClose = false;
    if (this.ws) return;
    this._setState('connecting');
    const ws = new WebSocket(wsUrl());
    this.ws = ws;

    ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token: this.getToken() }));

    ws.onmessage = (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch { return; }
      if (data.type === 'ready') {
        this.retry = 0;
        this._setState('open');
        this._startHeartbeat();
      } else if (data.type === 'pong') {
        clearTimeout(this.pongTimer);
      }
      this._emit(data.type, data);
    };

    ws.onclose = (event) => {
      this._stopHeartbeat();
      if (this.ws === ws) this.ws = null;
      this._setState('closed');
      if (event.code === 4401) { this._emit('unauthorized'); return; }   // токен не принят
      if (!this.manualClose) this._scheduleReconnect();
    };
    ws.onerror = () => { /* close придёт следом */ };
  }

  /** Возвращает true, если сообщение ушло в сокет. */
  send(payload) {
    if (this.state !== 'open' || !this.ws) return false;
    this.ws.send(JSON.stringify(payload));
    return true;
  }

  close() {
    this.manualClose = true;
    clearTimeout(this.reconnectTimer);
    this._stopHeartbeat();
    if (this.ws) this.ws.close();
    this.ws = null;
    this._setState('closed');
  }

  _scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    const delay = Math.min(1000 * 2 ** this.retry, 15000) + Math.random() * 500;
    this.retry += 1;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  _reconnectNow() {
    if (this.manualClose || this.ws || !this.getToken()) return;
    clearTimeout(this.reconnectTimer);
    this.connect();
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this.pingTimer = setInterval(() => {
      this.send({ type: 'ping' });
      // Нет pong — соединение «зависло» (бывает на мобильных сетях): рвём и переподключаемся.
      this.pongTimer = setTimeout(() => this.ws?.close(), PONG_TIMEOUT_MS);
    }, PING_INTERVAL_MS);
  }
  _stopHeartbeat() { clearInterval(this.pingTimer); clearTimeout(this.pongTimer); }
}

  return { AquaSocket };
})();

__m["storage.js"] = (function () {

/* Безопасная обёртка над localStorage (может быть недоступен в приватном режиме). */
const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* игнорируем */ } },
  remove(key) { try { localStorage.removeItem(key); } catch { /* игнорируем */ } },
};

/** То же для sessionStorage (живёт, пока открыта вкладка). */
const session = {
  get(key) { try { return sessionStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { sessionStorage.setItem(key, value); } catch { /* игнорируем */ } },
};

  return { storage, session };
})();

__m["haptics.js"] = (function () {

/* Тактильная отдача через navigator.vibrate().
   Поддерживается в Chrome/Edge/Firefox на Android; в Safari (iOS) API нет — вызовы безопасно игнорируются.
   Chrome также запрещает вибрацию, пока пользователь не взаимодействовал со страницей. */

const supported = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

function vibrate(pattern) {
  if (!supported) return false;
  // userActivation: без жеста пользователя Chrome пишет предупреждение — не пытаемся.
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return false;
  try { return navigator.vibrate(pattern); } catch { return false; }
}

const haptic = {
  tap:     () => vibrate(8),             // нажатие важной кнопки
  send:    () => vibrate(14),            // сообщение отправлено
  receive: () => vibrate([12, 40, 12]),  // пришло сообщение
  success: () => vibrate([10, 30, 20]),
  error:   () => vibrate([30, 40, 30]),
};

/** Лёгкая вибрация на всех «важных» кнопках интерфейса (делегирование одним обработчиком). */
function initTapHaptics(root = document) {
  root.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    if (e.target.closest('.btn, .btn-icon, .chat-item, .tabs__tab, .reaction')) haptic.tap();
  }, { passive: true });
}

  return { vibrate, haptic, initTapHaptics };
})();

__m["touch.js"] = (function () {

/* Особенности сенсорных экранов. */
/**
 * Свайп вправо от левого края — «назад» (как в iOS). Слушаем touch-события пассивно,
 * чтобы не мешать прокрутке. Срабатывает, только если жест начался у края и ушёл вправо
 * заметно сильнее, чем по вертикали.
 */
function initEdgeSwipeBack(target, onBack, { edge = 28, distance = 70 } = {}) {
  let startX = 0, startY = 0, tracking = false;
  target.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    tracking = e.touches.length === 1 && t.clientX <= edge;
    startX = t.clientX; startY = t.clientY;
  }, { passive: true });
  target.addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - startX, dy = Math.abs(t.clientY - startY);
    if (dx > distance && dx > dy * 2) onBack();
  }, { passive: true });
  target.addEventListener('touchcancel', () => { tracking = false; }, { passive: true });
}

/**
 * Длинное нажатие (для контекстного меню реакций на Этапе 5).
 * Отменяется, если палец сдвинулся больше чем на `slop` пикселей (это прокрутка).
 */
function onLongPress(target, selector, callback, { ms = 450, slop = 10 } = {}) {
  let timer = null, sx = 0, sy = 0;
  const cancel = () => { clearTimeout(timer); timer = null; };
  target.addEventListener('touchstart', (e) => {
    const node = e.target.closest(selector);
    if (!node || e.touches.length !== 1) return;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    timer = setTimeout(() => { timer = null; callback(node, sx, sy); }, ms);
  }, { passive: true });
  target.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    if (timer && Math.hypot(t.clientX - sx, t.clientY - sy) > slop) cancel();
  }, { passive: true });
  target.addEventListener('touchend', cancel, { passive: true });
  target.addEventListener('touchcancel', cancel, { passive: true });
}

/**
 * Экранная клавиатура на iOS не меняет размер layout viewport, и поле ввода оказывается под ней.
 * Следим за visualViewport и выставляем --vvh (видимая высота) — .app использует её как height.
 */
function initViewportFix(onResize) {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  const update = () => {
    root.style.setProperty('--vvh', `${vv.height}px`);
    window.scrollTo(0, 0);                 // iOS может «сдвинуть» страницу вверх при фокусе
    onResize?.();
  };
  vv.addEventListener('resize', update);
  update();
}

  return { initEdgeSwipeBack, onLongPress, initViewportFix };
})();

__m["state.js"] = (function () {

/* Единое состояние приложения (без фреймворка): данные лежат здесь, UI-модули только читают и рисуют. */

const state = {
  user: null,                 // {id, username}
  chats: new Map(),           // chatId -> chat (как отдаёт API)
  order: [],                  // chatId в порядке отображения
  activeChatId: null,
  conn: '',                   // подпись состояния соединения («Соединение...») или пусто
  history: new Map(),         // chatId -> {items: [message], hasMore, loading}
  pending: new Map(),         // chatId -> [{clientId, text, created_at, failed}]
  unread: new Map(),          // chatId -> число непрочитанных за эту сессию
  typing: new Map(),          // chatId -> Map(userId -> {username, timer})
};

const activeChat = () => state.chats.get(state.activeChatId) ?? null;

function peerOf(chat) {
  return chat.type === 'direct' ? chat.members.find((m) => m.id !== state.user.id) ?? null : null;
}

function setChats(list) {
  state.chats = new Map(list.map((c) => [c.id, c]));
  sortChats();
}

function upsertChat(chat) {
  state.chats.set(chat.id, chat);
  sortChats();
}

/** Свежие переписки сверху; чаты без сообщений — по id. */
function sortChats() {
  state.order = [...state.chats.values()]
    .sort((a, b) => (b.last_message?.id ?? 0) - (a.last_message?.id ?? 0) || b.id - a.id)
    .map((c) => c.id);
}

function setPresence(userId, online, lastSeen) {
  for (const chat of state.chats.values()) {
    for (const m of chat.members) {
      if (m.id === userId) { m.online = online; m.last_seen = lastSeen; }
    }
  }
}

function resetState() {
  state.user = null;
  state.chats = new Map(); state.order = []; state.activeChatId = null;
  state.history.clear(); state.pending.clear(); state.unread.clear();
  for (const m of state.typing.values()) for (const t of m.values()) clearTimeout(t.timer);
  state.typing.clear();
}

/** Отправляемое (ещё не подтверждённое сервером) сообщение в формате обычного сообщения для отрисовки. */
function pendingToMessage(p) {
  let media = null;
  if (p.localUrl) media = { id: null, url: p.localUrl, local: true, name: p.file?.name || 'файл', mime: p.file?.type, size: p.file?.size ?? 0 };
  else if (p.mediaInfo) media = p.mediaInfo;                       // уже загруженный файл (из файлового менеджера)
  return {
    id: p.clientId, clientId: p.clientId, sender: state.user, kind: p.kind || 'text',
    text: p.text || null, meta: p.meta || null, reactions: [], created_at: p.created_at,
    media, cover: p.coverLocalUrl ? { url: p.coverLocalUrl, local: true } : null,
    pending: !p.failed, failed: p.failed,
  };
}

  return { state, activeChat, peerOf, setChats, upsertChat, sortChats, setPresence, resetState, pendingToMessage };
})();

__m["ui/toast.js"] = (function () {
  const { $ } = __m["dom.js"];
/* Всплывающие уведомления. */


let timer;
function toast(message, ms = 3200) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.add('is-visible');
  clearTimeout(timer);
  timer = setTimeout(() => node.classList.remove('is-visible'), ms);
}

  return { toast };
})();

__m["ui/modal.js"] = (function () {
  const { $, $$ } = __m["dom.js"];
/* Модальные окна: открытие/закрытие классом .is-open, Esc, клик по подложке, возврат фокуса. */


let lastFocus = null;
let openId = null;
const closeHooks = new Map();        // id окна -> функция, вызываемая при любом закрытии

/** Подписка на закрытие окна (крестик, Esc, подложка или closeModal). */
function onModalClose(id, fn) { closeHooks.set(id, fn); }

function openModal(id) {
  const modal = $('#' + id);
  if (!modal) return;
  if (!openId) lastFocus = document.activeElement;      // вложенные окна не затирают точку возврата фокуса
  modal.classList.add('is-open');
  openId = id;
  document.body.classList.add('has-modal');
  // Фокус в окно после начала анимации (visibility меняется мгновенно при открытии)
  requestAnimationFrame(() => modal.querySelector('button, input, [tabindex]')?.focus());
}

function closeModal(id = openId) {
  if (!id) return;
  const modal = $('#' + id);
  if (!modal?.classList.contains('is-open')) return;
  modal.classList.remove('is-open');
  if (openId === id) openId = null;
  if (!openId) document.body.classList.remove('has-modal');
  lastFocus?.focus?.();
  closeHooks.get(id)?.();
}

function initModals() {
  $$('[data-close-modal]').forEach((n) => n.addEventListener('click', () => closeModal(n.closest('.modal').id)));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
}

  return { onModalClose, openModal, closeModal, initModals };
})();

__m["validators.js"] = (function () {

/* Клиентская проверка логина и пароля. Правила зеркалят серверные (backend/app/validators.py);
   окончательное решение всегда за сервером. */

const PASSWORD_RULES = [
  { id: 'length', test: (p) => p.length >= 8 },
  { id: 'lower',  test: (p) => /[a-z]/.test(p) },
  { id: 'digit',  test: (p) => /[0-9]/.test(p) },
];
const PASSWORD_MAX_BYTES = 72; // предел bcrypt

/** Результат по каждому правилу: [{id, ok}] */
function checkPassword(password) {
  return PASSWORD_RULES.map((r) => ({ id: r.id, ok: r.test(password) }));
}

function isPasswordValid(password) {
  return checkPassword(password).every((r) => r.ok) &&
    new TextEncoder().encode(password).length <= PASSWORD_MAX_BYTES;
}

const USERNAME_RE = /^[A-Za-z0-9_]{3,32}$/;

/** Возвращает текст ошибки или пустую строку. */
function usernameError(username) {
  return USERNAME_RE.test(username)
    ? ''
    : 'Имя пользователя: 3–32 символа, только латинские буквы, цифры и «_».';
}

  return { PASSWORD_RULES, checkPassword, isPasswordValid, usernameError };
})();

__m["ui/auth-view.js"] = (function () {
  const { $ } = __m["dom.js"];
  const { usernameError, isPasswordValid } = __m["validators.js"];
  const { haptic } = __m["haptics.js"];
/* Экран входа и регистрации.
   Вход: логин + пароль. Регистрация: логин + пароль + код из письма (почта нужна, чтобы код отправить). */




const RESEND_SEC = 60;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

function showFormError(node, message) {
  node.textContent = message || '';
  node.hidden = !message;
}
function setFieldError(input, message) {
  input.closest('.field')?.classList.toggle('field--error', Boolean(message));
  const out = $('#' + input.id + '-error');
  if (out) out.textContent = message || '';
}
function shake(node) {
  node.classList.remove('is-shaking');
  void node.offsetWidth;
  node.classList.add('is-shaking');
}
function setBusy(btn, busy, label) {
  btn.disabled = busy;
  btn.dataset.label ??= btn.textContent;
  btn.textContent = busy ? 'Подождите…' : (label ?? btn.dataset.label);
}

/**
 * handlers:
 *  onLogin(username, password)            — вход;
 *  onSendCode({username, password, email}) — проверить поля и отправить код (бросает ApiError);
 *  onRegister({username, password, email, code}) — создать аккаунт.
 */
function initAuthView({ onLogin, onSendCode, onRegister }) {
  const tabs = $('#auth-tabs');
  const loginForm = $('#form-login'), regForm = $('#form-register');
  const lUser = $('#login-username'), lPass = $('#login-password');
  const rUser = $('#reg-username'), rPass = $('#reg-password'), rMail = $('#reg-email'), rCode = $('#reg-code');
  const codeBlock = $('#reg-code-block'), codeRow = $('#reg-code-row'), regBtn = $('#reg-submit');
  const resendBtn = $('#code-resend');
  let codeStage = false, timer = null;

  function setTab(name) {
    tabs.dataset.active = name;
    $('#tab-login').setAttribute('aria-selected', String(name === 'login'));
    $('#tab-register').setAttribute('aria-selected', String(name === 'register'));
    loginForm.hidden = name !== 'login';
    regForm.hidden = name !== 'register';
    (name === 'login' ? lUser : rUser).focus();
  }
  $('#tab-login').addEventListener('click', () => setTab('login'));
  $('#tab-register').addEventListener('click', () => setTab('register'));

  function setStage(on) {
    codeStage = on;
    codeBlock.hidden = !on; codeRow.hidden = !on;
    for (const i of [rUser, rPass, rMail]) i.readOnly = on;
    regBtn.dataset.label = on ? 'Создать аккаунт' : 'Получить код';
    regBtn.textContent = regBtn.dataset.label;
    if (on) rCode.focus();
    else clearInterval(timer);
  }
  function startCooldown(sec = RESEND_SEC) {
    clearInterval(timer);
    let left = sec;
    resendBtn.disabled = true;
    const tick = () => {
      resendBtn.textContent = left > 0 ? `Снова через ${left} с` : 'Отправить снова';
      if (left <= 0) { clearInterval(timer); resendBtn.disabled = false; }
      left -= 1;
    };
    tick(); timer = setInterval(tick, 1000);
  }
  const regData = () => ({ username: rUser.value.trim(), password: rPass.value, email: rMail.value.trim().toLowerCase() });

  // Вход
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#login-error'); showFormError(err, '');
    const username = lUser.value.trim();
    if (!username || !lPass.value) {
      showFormError(err, 'Введите логин и пароль.'); shake(loginForm); haptic.error(); return;
    }
    const btn = loginForm.querySelector('button[type="submit"]');
    setBusy(btn, true);
    try { await onLogin(username, lPass.value); haptic.success(); }
    catch (e2) { showFormError(err, e2.message); shake(loginForm); haptic.error(); }
    finally { setBusy(btn, false); }
  });

  rUser.addEventListener('input', () => setFieldError(rUser, rUser.value ? usernameError(rUser.value.trim()) : ''));
  rPass.addEventListener('input', () => setFieldError(rPass, rPass.value && !isPasswordValid(rPass.value)
    ? 'Пароль: от 8 символов, строчная латинская буква и цифра.' : ''));

  // Регистрация
  regForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#reg-error'); showFormError(err, '');
    const d = regData();
    if (!codeStage) {
      const uErr = usernameError(d.username);
      const pErr = isPasswordValid(d.password) ? '' : 'Пароль: от 8 символов, строчная латинская буква и цифра.';
      const mErr = EMAIL_RE.test(d.email) ? '' : 'Введите корректный адрес почты.';
      setFieldError(rUser, uErr); setFieldError(rPass, pErr); setFieldError(rMail, mErr);
      if (uErr || pErr || mErr) { shake(regForm); haptic.error(); return; }
      setBusy(regBtn, true);
      try {
        await onSendCode(d);
        $('#code-sent').textContent = `Код отправлен на ${d.email}. Он действует 10 минут.`;
        rCode.value = '';
        setStage(true); startCooldown();
      } catch (e2) {
        const f = e2.fields || {};
        if (f.username_errors?.length) setFieldError(rUser, f.username_errors[0]);
        else if (f.password_errors?.length) setFieldError(rPass, f.password_errors[0]);
        else showFormError(err, e2.message);
        shake(regForm); haptic.error();
      } finally { setBusy(regBtn, false); }
      return;
    }
    const code = rCode.value.trim();
    if (!/^\d{6}$/.test(code)) { setFieldError(rCode, 'Код — 6 цифр из письма.'); shake(regForm); haptic.error(); return; }
    setFieldError(rCode, '');
    setBusy(regBtn, true);
    try { await onRegister({ ...d, code }); haptic.success(); }
    catch (e2) { showFormError(err, e2.message); shake(regForm); haptic.error(); }
    finally { setBusy(regBtn, false); }
  });

  resendBtn.addEventListener('click', async () => {
    const err = $('#reg-error'); showFormError(err, '');
    try { await onSendCode(regData()); startCooldown(); }
    catch (e2) { showFormError(err, e2.message); }
  });
  $('#code-back').addEventListener('click', () => { setStage(false); rUser.focus(); });

  return {
    reset() {
      clearInterval(timer);
      loginForm.reset(); regForm.reset();
      for (const n of ['#login-error', '#reg-error']) showFormError($(n), '');
      for (const i of [rUser, rPass, rMail, rCode]) setFieldError(i, '');
      setStage(false);
      setTab('login');
    },
  };
}

  return { initAuthView };
})();

__m["drafts.js"] = (function () {
  const { state } = __m["state.js"];
  const { storage } = __m["storage.js"];
/* Черновики: набранный, но не отправленный текст хранится на устройстве отдельно для каждого чата. */



const key = (chatId) => `aqua.draft.${state.user?.id ?? 0}.${chatId}`;

const getDraft = (chatId) => storage.get(key(chatId)) || '';
function setDraft(chatId, text) {
  const t = (text || '').trim() ? text : '';
  if (t) storage.set(key(chatId), t); else storage.remove(key(chatId));
}

  return { getDraft, setDraft };
})();

__m["format.js"] = (function () {

/* Форматирование времени, имён и аватаров. */
const pad = (n) => String(n).padStart(2, '0');
const MONTHS = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const WEEKDAYS = ['вс','пн','вт','ср','чт','пт','сб'];

const timeHM = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const daysAgo = (iso) => Math.round((startOfDay(new Date()) - startOfDay(new Date(iso))) / 86400000);

/** Ключ дня для группировки сообщений. */
const dayKey = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

function dayLabel(iso) {
  const n = daysAgo(iso), d = new Date(iso);
  if (n === 0) return 'Сегодня';
  if (n === 1) return 'Вчера';
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === new Date().getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/** Время в списке чатов: сегодня — часы, вчера — «вчера», неделя — день недели, иначе дата. */
function listTime(iso) {
  if (!iso) return '';
  const n = daysAgo(iso), d = new Date(iso);
  if (n === 0) return timeHM(iso);
  if (n === 1) return 'вчера';
  if (n < 7) return WEEKDAYS[d.getDay()];
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${String(d.getFullYear()).slice(2)}`;
}

function lastSeenText(iso) {
  if (!iso) return 'был(а) недавно';
  const n = daysAgo(iso);
  if (n === 0) return `был(а) в ${timeHM(iso)}`;
  if (n === 1) return `был(а) вчера в ${timeHM(iso)}`;
  const d = new Date(iso);
  return `был(а) ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function initials(name) {
  const words = name.trim().split(/\s+/);
  return (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
}

/** Стабильный оттенок аватара по имени. */
function hueFor(name) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)) % 360;
  return h;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / 1024 ** 2).toFixed(1)} МБ`;
}

  return { timeHM, dayKey, dayLabel, listTime, lastSeenText, initials, hueFor, formatSize };
})();

__m["ui/avatar.js"] = (function () {
  const { el } = __m["dom.js"];
  const { initials, hueFor } = __m["format.js"];
  const { mediaUrl } = __m["api.js"];
/* Аватар: своя картинка, системная заготовка или инициалы; индикатор «онлайн». */




/** Адрес картинки аватара пользователя (или null, если аватара нет). */
function avatarSrc(av) {
  if (!av) return null;
  if (av.preset) return `assets/avatars/${av.preset}.svg`;
  return av.url ? mediaUrl(av.url) : null;
}

function avatar(name, { online = false, small = false, user = null, big = false } = {}) {
  const src = avatarSrc(user?.avatar);
  return el('span', {
      class: `avatar${small ? ' avatar--sm' : ''}${big ? ' avatar--xl' : ''}${online ? ' is-online' : ''}${src ? ' has-img' : ''}`,
      style: `--hue:${hueFor(name)}`,
      'aria-hidden': 'true',
    },
    src ? el('img', { class: 'avatar__img', src, alt: '', draggable: 'false' }) : initials(name),
    el('span', { class: 'avatar__dot' }),
  );
}

  return { avatarSrc, avatar };
})();

__m["ui/chat-list.js"] = (function () {
  const { getDraft } = __m["drafts.js"];
  const { $, el } = __m["dom.js"];
  const { state, peerOf } = __m["state.js"];
  const { avatar } = __m["ui/avatar.js"];
  const { listTime } = __m["format.js"];
/* Боковая панель: список чатов, поиск, результаты поиска пользователей. */






const KIND_LABEL = { image: 'Фото', video: 'Видео', voice: 'Голосовое сообщение', file: 'Файл' };

function previewText(chat) {
  const m = chat.last_message;
  if (!m) return 'Нет сообщений';
  let text = m.text || (m.meta?.sticker ? 'Стикер' : (m.meta?.gif || m.media?.mime === 'image/gif') ? 'GIF' : KIND_LABEL[m.kind]) || '';
  if (m.sender.id === state.user.id) text = `Вы: ${text}`;
  else if (chat.type === 'group') text = `${m.sender.username}: ${text}`;
  return text;
}

function typingLabel(chat) {
  const typers = state.typing.get(chat.id);
  if (!typers?.size) return '';
  return chat.type === 'group' ? `${[...typers.values()][0].username} печатает…` : 'печатает…';
}

/** «Черновик: текст» — вместо последнего сообщения, если в чате что-то набрано и не отправлено. */
function draftPreview(chat, typing) {
  const d = typing ? '' : getDraft(chat.id).trim();
  if (!d) return null;
  return el('span', { class: 'chat-item__preview' }, el('span', { class: 'chat-item__draft', text: 'Черновик: ' }), d.replace(/\s+/g, ' ').slice(0, 80));
}

function chatItem(chat) {
  const peer = peerOf(chat);
  const unread = state.unread.get(chat.id) || 0;
  const typing = typingLabel(chat);
  return el('li', {},
    el('button', {
        class: `chat-item${chat.id === state.activeChatId ? ' is-active' : ''}`,
        type: 'button', dataset: { chatId: chat.id },
      },
      avatar(chat.title, { online: Boolean(peer?.online), user: peer }),
      el('span', { class: 'chat-item__body' },
        el('span', { class: 'chat-item__row' },
          el('span', { class: 'chat-item__name', text: chat.title }),
          el('span', { class: 'chat-item__time', text: listTime(chat.last_message?.created_at) })),
        el('span', { class: 'chat-item__row' },
          draftPreview(chat, typing) ?? el('span', { class: `chat-item__preview${typing ? ' is-typing' : ''}`, text: typing || previewText(chat) }),
          unread ? el('span', { class: 'badge', text: unread > 99 ? '99+' : unread }) : null)),
    ));
}

function userItem(user) {
  return el('li', {},
    el('button', { class: 'chat-item', type: 'button', dataset: { username: user.username } },
      avatar(user.display_name || user.username, { online: user.online, user }),
      el('span', { class: 'chat-item__body' },
        el('span', { class: 'chat-item__name', text: user.username }),
        el('span', { class: 'chat-item__preview', text: 'Написать сообщение' }))));
}

/**
 * @param {{onOpenChat:(id:number)=>void, onOpenUser:(username:string)=>void}} handlers
 * Рендерит список заново (чатов немного — простота важнее виртуального списка).
 */
function initChatList({ onOpenChat, onOpenUser }) {
  const list = $('#chat-list');
  list.addEventListener('click', (e) => {
    const btn = e.target.closest('.chat-item');
    if (!btn) return;
    if (btn.dataset.chatId) onOpenChat(Number(btn.dataset.chatId));
    else if (btn.dataset.username) onOpenUser(btn.dataset.username);
  });

  return {
    /** @param {string} query  @param {Array|null} foundUsers — результаты серверного поиска */
    render(query = '', foundUsers = null) {
      const q = query.trim().toLowerCase();
      const chats = state.order.map((id) => state.chats.get(id)).filter((c) => !q || c.title.toLowerCase().includes(q));
      const nodes = chats.map(chatItem);

      if (q && foundUsers) {
        // Не предлагаем тех, с кем чат уже есть — он и так виден выше
        const haveChat = new Set(state.order.map((id) => peerOf(state.chats.get(id))?.id));
        const users = foundUsers.filter((u) => u.id !== state.user.id && !haveChat.has(u.id));
        if (users.length) nodes.push(el('li', { class: 'list-heading', text: 'Пользователи' }), ...users.map(userItem));
      }
      if (!nodes.length) {
        nodes.push(el('li', { class: 'sidebar__empty', text: q ? 'Ничего не найдено.' : 'Чатов пока нет. Найдите человека через поиск и напишите ему.' }));
      }
      list.replaceChildren(...nodes);
    },
  };
}

  return { initChatList };
})();

__m["ui/voice-player.js"] = (function () {
  const { el, icon } = __m["dom.js"];
/* Плеер голосового сообщения: кнопка, анимированная волна с прогрессом, время.
   Форма волны приходит с сервера (message.meta.wave) — аудио декодировать не нужно. */


let current = null;        // одновременно играет только одно голосовое

const fmt = (sec) => {
  const s = Math.max(0, Math.round(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Если волны нет (старые/чужие сообщения) — рисуем ровный «псевдо-узор». */
const fallbackWave = (n = 40) => Array.from({ length: n }, (_, i) => 25 + Math.round(35 * Math.abs(Math.sin(i * 0.7))));

function stopVoice() {
  current?.pause();
  current = null;
}

/** @param {{src:string, duration?:number, wave?:number[]}} cfg */
function voicePlayer({ src, duration = 0, wave }) {
  const audio = new Audio();
  audio.preload = 'auto';
  audio.src = src;
  let triedBlob = false;

  const levels = wave?.length ? wave : fallbackWave();
  const bars = levels.map((v) => el('span', { class: 'vp__bar', style: `--h:${Math.max(12, v)}` }));
  const playIcon = icon('i-play');
  const btn = el('button', { class: 'vp__btn', type: 'button', 'aria-label': 'Воспроизвести' }, playIcon);
  const time = el('span', { class: 'vp__time', text: fmt(duration) });
  const track = el('div', { class: 'vp__wave', role: 'slider', 'aria-label': 'Позиция', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': 0 }, bars);
  const root = el('div', { class: 'vp' }, btn, track, time);

  // Длительность берём из meta: у webm из MediaRecorder audio.duration бывает Infinity
  const total = () => (duration > 0 ? duration : Number.isFinite(audio.duration) ? audio.duration : 0);
  const setPlaying = (on) => {
    playIcon.firstChild.setAttribute('href', on ? '#i-pause' : '#i-play');
    btn.setAttribute('aria-label', on ? 'Пауза' : 'Воспроизвести');
    root.classList.toggle('is-playing', on);
  };
  const paint = (ratio) => {
    const played = Math.round(ratio * bars.length);
    bars.forEach((b, i) => b.classList.toggle('is-played', i < played));
    track.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
  };

  btn.addEventListener('click', () => {
    if (audio.paused) {
      if (current && current !== audio) current.pause();
      current = audio;
      audio.play().catch(() => { time.textContent = 'ошибка'; });
    } else {
      audio.pause();
    }
  });
  audio.addEventListener('play', () => setPlaying(true));
  audio.addEventListener('pause', () => setPlaying(false));
  audio.addEventListener('ended', () => { setPlaying(false); paint(0); time.textContent = fmt(total()); audio.currentTime = 0; });
  // Запасной путь: если потоковое воспроизведение не пошло (Range/кодек/прокси), скачиваем файл целиком
  audio.addEventListener('error', async () => {
    if (triedBlob || src.startsWith('blob:')) { time.textContent = 'ошибка'; return; }
    triedBlob = true;
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error(String(res.status));
      audio.src = URL.createObjectURL(await res.blob());
      audio.load();
    } catch { time.textContent = 'ошибка'; }
  });
  audio.addEventListener('timeupdate', () => {
    const t = total();
    if (t > 0) paint(Math.min(1, audio.currentTime / t));
    time.textContent = fmt(audio.paused && audio.currentTime === 0 ? t : audio.currentTime);
  });

  // Перемотка касанием/кликом по волне
  track.addEventListener('click', (e) => {
    const t = total();
    if (!t) return;
    const r = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    try { audio.currentTime = ratio * t; paint(ratio); } catch { /* не все потоки перематываются */ }
  });

  return root;
}

  return { stopVoice, voicePlayer };
})();

__m["ui/chat-view.js"] = (function () {
  const { $, el, icon } = __m["dom.js"];
  const { state, peerOf, pendingToMessage } = __m["state.js"];
  const { voicePlayer } = __m["ui/voice-player.js"];
  const { avatar } = __m["ui/avatar.js"];
  const { mediaUrl } = __m["api.js"];
  const { timeHM, dayKey, dayLabel, lastSeenText, formatSize } = __m["format.js"];
/* Окно переписки: шапка, лента сообщений, индикатор «печатает…», подгрузка истории. */







const messagesEl = $('#messages');
const typingEl = $('#typing-indicator');
const chatEl = $('.chat');
let lastDay = null;          // ключ дня последнего отрисованного сообщения
let onLoadMore = () => {};
let onRetry = () => {};

const nearBottom = () => messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 140;
const scrollToBottom = (smooth = false) =>
  messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });

function mediaNode(m) {
  const { media, kind, meta, cover } = m;
  const url = media.local ? media.url : mediaUrl(media.url);     // local — blob: URL ещё не отправленного файла
  if (meta?.sticker) return el('img', { class: 'msg__sticker', src: url, alt: 'Стикер', draggable: 'false', dataset: { pack: meta.pack ?? '' } });
  if (kind === 'voice') return voicePlayer({ src: url, duration: meta?.duration, wave: meta?.wave });
  if (kind === 'image' || kind === 'video') {
    const gif = Boolean(meta?.gif) && kind === 'video';          // GIF из видео без звука — крутим по кругу
    let node;
    if (kind === 'image') node = el('img', { class: 'msg__media', src: url, alt: media.name, loading: 'lazy' });
    else if (gif) {
      node = el('video', { class: 'msg__media is-gif', src: url, loop: true, autoplay: true, muted: true, playsinline: true, preload: 'metadata' });
      node.muted = true;                                          // атрибут сам по себе не включает беззвучный режим в части браузеров
    } else {
      const poster = cover ? (cover.local ? cover.url : mediaUrl(cover.url)) : null;
      node = el('video', { class: 'msg__media', src: url, preload: 'metadata', playsinline: true, ...(poster ? { poster } : {}) });
    }
    const wrap = el('div', { class: 'msg__mediawrap' }, node,
      kind === 'video' && !gif ? el('span', { class: 'msg__play', 'aria-hidden': 'true' }, icon('i-play', 'icon--white')) : null);
    if (media.id && !media.local) wrap.append(el('button', { type: 'button', class: 'msg__more', 'aria-label': 'Действия с медиа' }, icon('i-more', 'icon--white')));
    return wrap;
  }
  return el('a', { class: 'msg__file', href: url, download: media.name },
    icon('i-file'), el('span', {}, el('b', { text: media.name }), el('small', { text: formatSize(media.size) })));
}

/** Прочитал ли собеседник сообщение (личные чаты): его last_read_id ≥ id сообщения. */
function isRead(m) {
  const chat = state.chats.get(m.chat_id ?? state.activeChatId);
  const peer = chat?.type === 'direct' ? chat.members.find((x) => x.id !== state.user.id) : null;
  return Boolean(peer && (chat.reads?.[peer.id] ?? 0) >= m.id);
}

/** Статус своего сообщения: часы — ещё не отправлено, ✓ — доставлено, ✓✓ — прочитано. */
function ticksNode(m, opts) {
  const status = opts.pending ? 'pending' : isRead(m) ? 'read' : 'sent';
  const label = { pending: 'Не отправлено', sent: 'Доставлено', read: 'Прочитано' }[status];
  return el('span', { class: `msg__ticks is-${status}`, role: 'img', 'aria-label': label, title: label },
    icon(status === 'pending' ? 'i-clock' : status === 'read' ? 'i-checks' : 'i-check'));
}

/** Пересчитывает галочки у уже показанных сообщений (когда собеседник прочитал чат). */
function refreshTicks() {
  for (const t of messagesEl.querySelectorAll('.msg--out:not(.is-pending) .msg__ticks')) {
    const id = Number(t.closest('.msg').dataset.id);
    const read = isRead({ id, chat_id: state.activeChatId });
    if (t.classList.contains('is-read') === read) continue;
    t.className = `msg__ticks is-${read ? 'read' : 'sent'}`;
    t.querySelector('use').setAttribute('href', read ? '#i-checks' : '#i-check');
    const label = read ? 'Прочитано' : 'Доставлено'; t.setAttribute('aria-label', label); t.title = label;
  }
}

const pinnedBar = $('#pinned-bar');
/** Закреплённое сообщение — полоска под шапкой чата. */
function setPinnedBar(message) {
  pinnedBar.hidden = !message;
  pinnedBar.dataset.id = message?.id ?? '';
  if (message) $('#pinned-text').textContent = message.text || ({ image: 'Фото', video: 'Видео', voice: 'Голосовое сообщение', file: 'Файл' }[message.kind] ?? '');
}

/** Прокрутка к сообщению (если оно загружено) с подсветкой. */
function scrollToMessage(id) {
  const node = messagesEl.querySelector(`.msg[data-id="${id}"]`);
  if (!node) return false;
  node.scrollIntoView({ block: 'center', behavior: 'smooth' });
  node.classList.add('is-flash'); setTimeout(() => node.classList.remove('is-flash'), 1400);
  return true;
}

/** Узел сообщения. opts: {pending, failed, animate, group} */
function messageNode(m, opts = {}) {
  const mine = m.sender.id === state.user.id;
  const bubble = el('div', { class: 'msg__bubble' },
    opts.group && !mine ? el('button', { type: 'button', class: 'msg__author', text: m.sender.username, dataset: { userId: m.sender.id } }) : null,
    m.forwarded?.name ? el('p', { class: 'msg__fwd', text: `Переслано от ${m.forwarded.name}` }) : null,
    m.media ? mediaNode(m) : null,
    m.text ? el('p', { class: 'msg__text', text: m.text }) : null,
    el('span', { class: 'msg__meta' },
      mine && !opts.failed ? ticksNode(m, opts) : null,                 // галочки — слева от времени
      (m.edited_at ? 'изменено · ' : '') + timeHM(m.created_at) + (opts.failed ? ' · не отправлено, нажмите, чтобы повторить' : '')));
  const node = el('article', {
    class: `msg msg--${mine ? 'out' : 'in'}${m.meta?.sticker ? ' msg--sticker' : ''}${m.media && !m.meta?.sticker && (m.kind === 'image' || m.kind === 'video') ? ' msg--media' : ''}${opts.animate ? ' is-new' : ''}${opts.pending ? ' is-pending' : ''}${opts.failed ? ' is-failed' : ''}`,
    dataset: { id: m.id, ...(m.clientId ? { clientId: m.clientId } : {}) },
  }, bubble);
  if (m.reactions?.length) node.append(reactionsNode(m.reactions));
  return node;
}

/** Ряд «чипов» реакций под сообщением: эмодзи + счётчик; свои подсвечены. */
function reactionsNode(reactions) {
  const chat = state.chats.get(state.activeChatId);
  const direct = chat?.type === 'direct';                    // в личном чате вместо числа — аватарка того, кто поставил
  const member = (id) => chat?.members.find((x) => x.id === id) ?? (id === state.user.id ? state.user : null);
  return el('div', { class: 'msg__reactions' }, reactions.map((r) => el('button', {
    class: `reaction${r.users.includes(state.user.id) ? ' is-mine' : ''}${direct ? ' reaction--faces' : ''}`, type: 'button',
    dataset: { emoji: r.emoji }, 'aria-label': `Реакция ${r.emoji}: ${r.count}`,
  }, r.emoji, direct
    ? [...r.users.slice(0, 3).map((id) => { const u = member(id); return u ? avatar(u.display_name || u.username, { user: u, small: true }) : null; }),
       r.users.length > 3 ? el('span', { class: 'reaction__more', text: `+${r.users.length - 3}` }) : null]
    : el('span', { text: r.count }))));
}

/** Обновляет реакции у уже показанного сообщения (без перерисовки всей ленты). */
function setReactions(messageId, reactions) {
  const node = messagesEl.querySelector(`.msg[data-id="${messageId}"]`);
  if (!node) return;
  node.querySelector('.msg__reactions')?.remove();
  if (reactions.length) node.append(reactionsNode(reactions));
}

function daySeparator(iso) { return el('div', { class: 'day-sep', text: dayLabel(iso) }); }

/** Добавляет узлы перед индикатором «печатает…» (он всегда последний). */
function insertNodes(nodes) { nodes.forEach((n) => messagesEl.insertBefore(n, typingEl)); }

function buildNodes(items, chat, { animate = false } = {}) {
  const nodes = [];
  for (const m of items) {
    const key = dayKey(m.created_at);
    if (key !== lastDay) { nodes.push(daySeparator(m.created_at)); lastDay = key; }
    nodes.push(messageNode(m, { animate, group: chat.type === 'group', pending: m.pending, failed: m.failed }));
  }
  return nodes;
}

function initChatView({ loadMore, retry }) {
  onLoadMore = loadMore; onRetry = retry;
  // Подгрузка истории при прокрутке к началу
  messagesEl.addEventListener('scroll', () => { if (messagesEl.scrollTop < 80) onLoadMore(); }, { passive: true });
  // Повторная отправка по тапу на неотправленное сообщение
  messagesEl.addEventListener('click', (e) => {
    const node = e.target.closest('.msg.is-failed');
    if (node) onRetry(node.dataset.clientId);
  });
}

/** Показывает/скрывает заглушку «выберите чат» (на десктопе, пока чат не выбран). */
function setEmpty(empty) { chatEl.dataset.empty = String(empty); }

function renderHeader(chat) {
  const peer = peerOf(chat);
  $('#peer-avatar').replaceChildren(avatar(chat.title, { online: Boolean(peer?.online), small: true, user: peer }));
  $('#peer-name').textContent = chat.title;
  renderStatus(chat);
}

function renderStatus(chat) {
  const node = $('#peer-status');
  // В канале писать могут только администраторы: у подписчика вместо поля ввода — подсказка
  const ro = chat.type === 'channel' && !chat.can_post;
  $('#composer').hidden = ro || $('#app').dataset.selecting === 'true';
  $('#channel-readonly')?.toggleAttribute('hidden', !ro);
  const typers = state.typing.get(chat.id);
  const peer = peerOf(chat);
  node.classList.toggle('is-online', !state.conn && (Boolean(typers?.size) || Boolean(peer?.online)));
  if (state.conn) node.textContent = state.conn;                               // «Соединение...» вместо «в сети»
  else if (chat.type === 'direct' && peer?.blocked_me) node.textContent = 'Вы заблокированы';
  else if (typers?.size) {
    const who = chat.type === 'group' ? `${[...typers.values()][0].username} печатает` : 'печатает';
    node.replaceChildren(who, ...[1, 2, 3].map(() => el('span', { class: 'typing__dot' })));
  } else if (chat.type === 'channel') node.textContent = `${chat.members.length} подписч.`;
  else if (chat.type === 'group') node.textContent = `${chat.members.length} участн.`;
  else node.textContent = peer?.online ? 'в сети' : lastSeenText(peer?.last_seen);
}

/** Полная перерисовка ленты: загруженные сообщения + отправляемые. */
function renderMessages(chat) {
  const h = state.history.get(chat.id);
  const items = [...(h?.items ?? []), ...(state.pending.get(chat.id) ?? []).map(pendingToMessage)];
  lastDay = null;
  messagesEl.replaceChildren(...buildNodes(items, chat), typingEl);
  scrollToBottom();
}

/** Добавляет одно сообщение в конец; прокручивает вниз, если пользователь и так внизу (или это его сообщение). */
function appendMessage(m, chat, { forceScroll = false } = {}) {
  const stick = forceScroll || nearBottom();
  insertNodes(buildNodes([m], chat, { animate: true }));
  if (stick) scrollToBottom(true);
}

/** Обновляет показанное сообщение (после изменения текста) без перерисовки всей ленты. */
function updateMessage(m, chat) {
  const node = messagesEl.querySelector(`.msg[data-id="${m.id}"]`);
  if (node) node.replaceWith(messageNode(m, { group: chat.type === 'group' }));
}

/** Перерисовка ленты с сохранением места прокрутки (после удаления сообщения). */
function refreshMessages(chat) {
  const top = messagesEl.scrollTop, wasBottom = nearBottom();
  const h = state.history.get(chat.id);
  const items = [...(h?.items ?? []), ...(state.pending.get(chat.id) ?? []).map(pendingToMessage)];
  lastDay = null;
  messagesEl.replaceChildren(...buildNodes(items, chat), typingEl);
  if (wasBottom) scrollToBottom(); else messagesEl.scrollTop = top;
}

/** Заменяет «временное» сообщение настоящим. Возвращает false, если временного узла нет в ленте. */
function resolvePending(clientId, real, chat) {
  const node = messagesEl.querySelector(`.msg[data-client-id="${CSS.escape(clientId)}"]`);
  if (!node) return false;
  node.replaceWith(messageNode(real, { group: chat.type === 'group' }));
  return true;
}

function markFailed(clientId, chat) {
  const node = messagesEl.querySelector(`.msg[data-client-id="${CSS.escape(clientId)}"]`);
  const p = (state.pending.get(chat.id) ?? []).find((x) => x.clientId === clientId);
  if (node && p) node.replaceWith(messageNode(pendingToMessage({ ...p, failed: true }), { failed: true, group: chat.type === 'group' }));
}

/** Вставляет старые сообщения в начало, сохраняя положение прокрутки.
 *  @param {string|undefined} firstShownIso — время самого старого из уже показанных сообщений
 *  (нужно, чтобы не дублировать разделитель дня на стыке). */
function prependMessages(items, chat, firstShownIso) {
  const prevHeight = messagesEl.scrollHeight;
  const prevTop = messagesEl.scrollTop;
  const saved = lastDay;
  lastDay = null;
  const nodes = buildNodes(items, chat);        // после вызова lastDay = день самого нового из items
  if (firstShownIso && dayKey(firstShownIso) === lastDay) messagesEl.querySelector('.day-sep')?.remove();
  messagesEl.querySelector('#history-loader')?.after(...nodes) ?? messagesEl.prepend(...nodes);
  lastDay = saved;
  messagesEl.scrollTop = prevTop + (messagesEl.scrollHeight - prevHeight);
}

function setTyping(visible) {
  const stick = nearBottom();
  typingEl.hidden = !visible;
  if (visible && stick) scrollToBottom(true);
}

function showLoader(visible) {
  let node = $('#history-loader');
  if (visible && !node) {
    node = el('div', { id: 'history-loader', class: 'history-loader' }, el('div', { class: 'spinner' }));
    messagesEl.prepend(node);
  } else if (!visible && node) node.remove();
}

  return { scrollToBottom, refreshTicks, setPinnedBar, scrollToMessage, setReactions, initChatView, setEmpty, renderHeader, renderStatus, renderMessages, appendMessage, updateMessage, refreshMessages, resolvePending, markFailed, prependMessages, setTyping, showLoader };
})();

__m["ui/composer.js"] = (function () {
  const { $ } = __m["dom.js"];
  const { haptic } = __m["haptics.js"];
  const { TYPING_THROTTLE_MS, TYPING_IDLE_MS, ENTER_NEWLINE_ON_TOUCH } = __m["config.js"];
/* Поле ввода: автовысота, Enter / Shift+Enter, индикатор набора, кнопка «отправить/голос». */




const isTouch = () => window.matchMedia('(pointer: coarse)').matches;

/**
 * @param {{onSend:(text:string)=>void, onTyping:(isTyping:boolean)=>void, onAttach:()=>void, onVoice:()=>void, onEmoji:()=>void}} h
 */
function initComposer({ onSend, onEdit, onTyping, onAttach, onVoice, onEmoji, onDraft = () => {} }) {
  const form = $('#composer');
  const input = $('#message-input');
  const sendBtn = $('#btn-send');

  let typingSentAt = 0;
  let idleTimer = null;
  let typingActive = false;
  let editing = null;                                   // {id, original, allowEmpty} — режим редактирования
  const bar = $('#edit-bar');

  function autosize() {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 128)}px`;   // 8rem — как max-height в CSS
    form.dataset.hasText = String(Boolean(editing) || input.value.trim().length > 0);
  }

  function stopTyping() {
    clearTimeout(idleTimer);
    if (typingActive) { typingActive = false; onTyping(false); }
  }

  input.addEventListener('input', () => {
    autosize();
    if (!editing) onDraft(input.value);
    if (!input.value.trim()) { stopTyping(); return; }
    const now = Date.now();
    // Шлём «печатает» не чаще раза в TYPING_THROTTLE_MS, а «перестал» — после паузы
    if (!typingActive || now - typingSentAt > TYPING_THROTTLE_MS) {
      typingActive = true; typingSentAt = now; onTyping(true);
    }
    clearTimeout(idleTimer);
    idleTimer = setTimeout(stopTyping, TYPING_IDLE_MS);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey) return;           // Shift+Enter — перенос строки (по умолчанию)
    if (e.isComposing || e.keyCode === 229) return;        // IME (ввод иероглифов/подсказки) — не перехватываем
    if (ENTER_NEWLINE_ON_TOUCH && isTouch()) return;       // на телефоне Enter = новая строка
    e.preventDefault();
    form.requestSubmit();
  });

  // Не даём кнопке «отправить» забрать фокус — иначе на телефоне закрывается клавиатура.
  sendBtn.addEventListener('pointerdown', (e) => e.preventDefault());

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (editing) {
      const { id, original, allowEmpty } = editing;
      if (!text && !allowEmpty) return;                 // у текстового сообщения подпись не может стать пустой
      endEdit();
      if (text !== original) onEdit(id, text);
      return;
    }
    if (!text) return;
    stopTyping();
    onSend(text);
    haptic.send();
    sendBtn.classList.remove('is-animating'); void sendBtn.offsetWidth; sendBtn.classList.add('is-animating');
    setTimeout(() => sendBtn.classList.remove('is-animating'), 600);
    input.value = '';
    autosize();
    onDraft('');
    input.focus();
  });

  function endEdit() {
    editing = null;
    bar.hidden = true;
    input.value = '';
    autosize();
  }
  $('#edit-cancel').addEventListener('click', endEdit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape' && editing) endEdit(); });

  $('#btn-attach').addEventListener('click', onAttach);
  $('#btn-voice').addEventListener('click', onVoice);
  $('#btn-emoji').addEventListener('click', onEmoji);

  return {
    /** Вставка текста (смайлика) в позицию курсора. */
    insert(text) {
      const a = input.selectionStart ?? input.value.length, b = input.selectionEnd ?? a;
      input.setRangeText(text, a, b, 'end');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    },
    /** Текст в поле (для черновиков). Событие не вызываем — черновик не перезаписывается самим собой. */
    getText: () => (editing ? '' : input.value),
    setText(text) { editing = null; bar.hidden = true; input.value = text || ''; autosize(); },
    /** Значок кнопки справа от поля: 'smile' или 'gif' (запоминаемая вкладка пикера). */
    setPickerIcon(tab) {
      $('#btn-emoji use').setAttribute('href', tab === 'gif' ? '#i-gif' : tab === 'stickers' ? '#i-sticker' : '#i-smile');
    },
    setPickerOpen: (open) => $('#btn-emoji').setAttribute('aria-expanded', String(open)),
    focus: () => { if (!isTouch()) input.focus(); },   // на телефоне не открываем клавиатуру сама по себе
    /** Режим редактирования: текст сообщения попадает в поле, отправка сохраняет изменение. */
    startEdit({ id, text, allowEmpty }) {
      editing = { id, original: text || '', allowEmpty: Boolean(allowEmpty) };
      $('#edit-bar-text').textContent = text || 'Подпись';
      bar.hidden = false;
      input.value = text || '';
      autosize();
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    },
    reset() { editing = null; bar.hidden = true; input.value = ''; autosize(); stopTyping(); },
    stopTyping,
  };
}

  return { initComposer };
})();

__m["emoji-data.js"] = (function () {

/* Набор смайликов по категориям: все базовые смайлы Unicode (без вариантов оттенков кожи).
   Формат: список строк «смайлик<TAB>название» (название нужно для поиска). Сгенерировано из локальных данных. */
const EMOJI_CATS = [
  { id: "smileys", title: "Смайлы", icon: "😀", list: "😀\tgrinning face\n😃\tgrinning face with big eyes\n😄\tgrinning face with smiling eyes\n😁\tbeaming face with smiling eyes\n😆\tgrinning squinting face\n😅\tgrinning face with sweat\n🤣\trolling on the floor laughing\n😂\tface with tears of joy\n🙂\tslightly smiling face\n🙃\tupside-down face\n🫠\tmelting face\n😉\twinking face\n😊\tsmiling face with smiling eyes\n😇\tsmiling face with halo\n🥰\tsmiling face with hearts\n😍\tsmiling face with heart-eyes\n🤩\tstar-struck\n😘\tface blowing a kiss\n😗\tkissing face\n☺️\tsmiling face\n😚\tkissing face with closed eyes\n😙\tkissing face with smiling eyes\n🥲\tsmiling face with tear\n😋\tface savoring food\n😛\tface with tongue\n😜\twinking face with tongue\n🤪\tzany face\n😝\tsquinting face with tongue\n🤑\tmoney-mouth face\n🤗\tsmiling face with open hands\n🤭\tface with hand over mouth\n🫢\tface with open eyes and hand over mouth\n🫣\tface with peeking eye\n🤫\tshushing face\n🤔\tthinking face\n🫡\tsaluting face\n🤐\tzipper-mouth face\n🤨\tface with raised eyebrow\n😐\tneutral face\n😑\texpressionless face\n😶\tface without mouth\n🫥\tdotted line face\n😶‍🌫️\tface in clouds\n😏\tsmirking face\n😒\tunamused face\n🙄\tface with rolling eyes\n😬\tgrimacing face\n😮‍💨\tface exhaling\n🤥\tlying face\n🫨\tshaking face\n🙂‍↔️\thead shaking horizontally\n🙂‍↕️\thead shaking vertically\n😌\trelieved face\n😔\tpensive face\n😪\tsleepy face\n🤤\tdrooling face\n😴\tsleeping face\n🫩\tface with bags under eyes\n😷\tface with medical mask\n🤒\tface with thermometer\n🤕\tface with head-bandage\n🤢\tnauseated face\n🤮\tface vomiting\n🤧\tsneezing face\n🥵\thot face\n🥶\tcold face\n🥴\twoozy face\n😵\tface with crossed-out eyes\n😵‍💫\tface with spiral eyes\n🤯\texploding head\n🤠\tcowboy hat face\n🥳\tpartying face\n🥸\tdisguised face\n😎\tsmiling face with sunglasses\n🤓\tnerd face\n🧐\tface with monocle\n😕\tconfused face\n🫤\tface with diagonal mouth\n😟\tworried face\n🙁\tslightly frowning face\n☹️\tfrowning face\n😮\tface with open mouth\n😯\thushed face\n😲\tastonished face\n😳\tflushed face\n🥺\tpleading face\n🥹\tface holding back tears\n😦\tfrowning face with open mouth\n😧\tanguished face\n😨\tfearful face\n😰\tanxious face with sweat\n😥\tsad but relieved face\n😢\tcrying face\n😭\tloudly crying face\n😱\tface screaming in fear\n😖\tconfounded face\n😣\tpersevering face\n😞\tdisappointed face\n😓\tdowncast face with sweat\n😩\tweary face\n😫\ttired face\n🥱\tyawning face\n😤\tface with steam from nose\n😡\tenraged face\n😠\tangry face\n🤬\tface with symbols on mouth\n😈\tsmiling face with horns\n👿\tangry face with horns\n💀\tskull\n☠️\tskull and crossbones\n💩\tpile of poo\n🤡\tclown face\n👹\togre\n👺\tgoblin\n👻\tghost\n👽\talien\n👾\talien monster\n🤖\trobot\n😺\tgrinning cat\n😸\tgrinning cat with smiling eyes\n😹\tcat with tears of joy\n😻\tsmiling cat with heart-eyes\n😼\tcat with wry smile\n😽\tkissing cat\n🙀\tweary cat\n😿\tcrying cat\n😾\tpouting cat\n🙈\tsee-no-evil monkey\n🙉\thear-no-evil monkey\n🙊\tspeak-no-evil monkey\n💌\tlove letter\n💘\theart with arrow\n💝\theart with ribbon\n💖\tsparkling heart\n💗\tgrowing heart\n💓\tbeating heart\n💞\trevolving hearts\n💕\ttwo hearts\n💟\theart decoration\n❣️\theart exclamation\n💔\tbroken heart\n❤️‍🔥\theart on fire\n❤️‍🩹\tmending heart\n❤️\tred heart\n🩷\tpink heart\n🧡\torange heart\n💛\tyellow heart\n💚\tgreen heart\n💙\tblue heart\n🩵\tlight blue heart\n💜\tpurple heart\n🤎\tbrown heart\n🖤\tblack heart\n🩶\tgrey heart\n🤍\twhite heart\n💋\tkiss mark\n💯\thundred points\n💢\tanger symbol\n💥\tcollision\n💫\tdizzy\n💦\tsweat droplets\n💨\tdashing away\n🕳️\thole\n💬\tspeech balloon\n👁️‍🗨️\teye in speech bubble\n🗨️\tleft speech bubble\n🗯️\tright anger bubble\n💭\tthought balloon\n💤\tZZZ" },
  { id: "people", title: "Люди", icon: "🖐️", list: "✊\traised fist\n✋\traised hand\n🎅\tfather christmas\n🏂\tsnowboarder\n🏃\trunner\n🏄\tsurfer\n🏇\thorse racing\n🏊\tswimmer\n👂\tear\n👃\tnose\n👆\twhite up pointing backhand index\n👇\twhite down pointing backhand index\n👈\twhite left pointing backhand index\n👉\twhite right pointing backhand index\n👊\tfisted hand sign\n👋\twaving hand sign\n👌\tok hand sign\n👍\tthumbs up sign\n👎\tthumbs down sign\n👏\tclapping hands sign\n👐\topen hands sign\n👦\tboy\n👧\tgirl\n👫\tman and woman holding hands\n👬\ttwo men holding hands\n👭\ttwo women holding hands\n👮\tpolice officer\n👰\tbride with veil\n👱\tperson with blond hair\n👲\tman with gua pi mao\n👳\tman with turban\n👴\tolder man\n👵\tolder woman\n👶\tbaby\n👷\tconstruction worker\n👸\tprincess\n👼\tbaby angel\n💁\tinformation desk person\n💂\tguardsman\n💃\tdancer\n💅\tnail polish\n💆\tface massage\n💇\thaircut\n💏\tkiss\n💑\tcouple with heart\n💪\tflexed biceps\n🕺\tman dancing\n🖕\treversed hand with middle finger extended\n🖖\traised hand with part between middle and ring fingers\n🙅\tface with no good gesture\n🙆\tface with ok gesture\n🙇\tperson bowing deeply\n🙋\thappy person raising one hand\n🙌\tperson raising both hands in celebration\n🙍\tperson frowning\n🙎\tperson with pouting face\n🙏\tperson with folded hands\n🚣\trowboat\n🚴\tbicyclist\n🚵\tmountain bicyclist\n🚶\tpedestrian\n🛀\tbath\n🛌\tsleeping accommodation\n🤌\tpinched fingers\n🤏\tpinching hand\n🤘\tsign of the horns\n🤙\tcall me hand\n🤚\traised back of hand\n🤛\tleft-facing fist\n🤜\tright-facing fist\n🤝\thandshake\n🤞\thand with index and middle fingers crossed\n🤟\ti love you hand sign\n🤦\tface palm\n🤰\tpregnant woman\n🤱\tbreast-feeding\n🤲\tpalms up together\n🤳\tselfie\n🤴\tprince\n🤵\tman in tuxedo\n🤶\tmother christmas\n🤷\tshrug\n🤸\tperson doing cartwheel\n🤹\tjuggling\n🤽\twater polo\n🤾\thandball\n🥷\tninja\n🦵\tleg\n🦶\tfoot\n🦸\tsuperhero\n🦹\tsupervillain\n🦻\tear with hearing aid\n🧍\tstanding person\n🧎\tkneeling person\n🧏\tdeaf person\n🧒\tchild\n🧓\tolder adult\n🧔\tbearded person\n🧕\tperson with headscarf\n🧖\tperson in steamy room\n🧗\tperson climbing\n🧘\tperson in lotus position\n🧙\tmage\n🧚\tfairy\n🧛\tvampire\n🧜\tmerperson\n🧝\telf\n🫃\tpregnant man\n🫄\tpregnant person\n🫅\tperson with crown\n🫰\thand with index finger and thumb crossed\n🫱\trightwards hand\n🫲\tleftwards hand\n🫳\tpalm down hand\n🫴\tpalm up hand\n🫵\tindex pointing at the viewer\n🫶\theart hands\n🫷\tleftwards pushing hand\n🫸\trightwards pushing hand\n🖐️\thand with fingers splayed\n✌️\tvictory hand\n☝️\tindex pointing up\n✍️\twriting hand\n🦾\tmechanical arm\n🦿\tmechanical leg\n🧠\tbrain\n🫀\tanatomical heart\n🫁\tlungs\n🦷\ttooth\n🦴\tbone\n👀\teyes\n👁️\teye\n👅\ttongue\n👄\tmouth\n🫦\tbiting lip\n🕵️\tdetective\n🧞\tgenie\n🧞‍♂️\tman genie\n🧞‍♀️\twoman genie\n🧟\tzombie\n🧟‍♂️\tman zombie\n🧟‍♀️\twoman zombie\n🧌\ttroll\n🕴️\tperson in suit levitating\n👯\tpeople with bunny ears\n👯‍♂️\tmen with bunny ears\n👯‍♀️\twomen with bunny ears\n🤺\tperson fencing\n⛷️\tskier\n🏌️\tperson golfing\n⛹️\tperson bouncing ball\n🏋️\tperson lifting weights\n🤼\tpeople wrestling\n🤼‍♂️\tmen wrestling\n🤼‍♀️\twomen wrestling\n👨‍👩‍👦\tfamily: man, woman, boy\n👨‍👩‍👧\tfamily: man, woman, girl\n👨‍👩‍👧‍👦\tfamily: man, woman, girl, boy\n👨‍👩‍👦‍👦\tfamily: man, woman, boy, boy\n👨‍👩‍👧‍👧\tfamily: man, woman, girl, girl\n👨‍👨‍👦\tfamily: man, man, boy\n👨‍👨‍👧\tfamily: man, man, girl\n👨‍👨‍👧‍👦\tfamily: man, man, girl, boy\n👨‍👨‍👦‍👦\tfamily: man, man, boy, boy\n👨‍👨‍👧‍👧\tfamily: man, man, girl, girl\n👩‍👩‍👦\tfamily: woman, woman, boy\n👩‍👩‍👧\tfamily: woman, woman, girl\n👩‍👩‍👧‍👦\tfamily: woman, woman, girl, boy\n👩‍👩‍👦‍👦\tfamily: woman, woman, boy, boy\n👩‍👩‍👧‍👧\tfamily: woman, woman, girl, girl\n👨‍👦\tfamily: man, boy\n👨‍👦‍👦\tfamily: man, boy, boy\n👨‍👧\tfamily: man, girl\n👨‍👧‍👦\tfamily: man, girl, boy\n👨‍👧‍👧\tfamily: man, girl, girl\n👩‍👦\tfamily: woman, boy\n👩‍👦‍👦\tfamily: woman, boy, boy\n👩‍👧\tfamily: woman, girl\n👩‍👧‍👦\tfamily: woman, girl, boy\n👩‍👧‍👧\tfamily: woman, girl, girl\n🗣️\tspeaking head\n👤\tbust in silhouette\n👥\tbusts in silhouette\n🫂\tpeople hugging\n👪\tfamily\n🧑‍🧑‍🧒\tfamily: adult, adult, child\n🧑‍🧑‍🧒‍🧒\tfamily: adult, adult, child, child\n🧑‍🧒\tfamily: adult, child\n🧑‍🧒‍🧒\tfamily: adult, child, child\n👣\tfootprints\n🫆\tfingerprint\n🦰\tred hair\n🦱\tcurly hair\n🦳\twhite hair\n🦲\tbald" },
  { id: "animals", title: "Животные и природа", icon: "🐶", list: "🐵\tmonkey face\n🐒\tmonkey\n🦍\tgorilla\n🦧\torangutan\n🐶\tdog face\n🐕\tdog\n🦮\tguide dog\n🐕‍🦺\tservice dog\n🐩\tpoodle\n🐺\twolf\n🦊\tfox\n🦝\traccoon\n🐱\tcat face\n🐈\tcat\n🐈‍⬛\tblack cat\n🦁\tlion\n🐯\ttiger face\n🐅\ttiger\n🐆\tleopard\n🐴\thorse face\n🫎\tmoose\n🫏\tdonkey\n🐎\thorse\n🦄\tunicorn\n🦓\tzebra\n🦌\tdeer\n🦬\tbison\n🐮\tcow face\n🐂\tox\n🐃\twater buffalo\n🐄\tcow\n🐷\tpig face\n🐖\tpig\n🐗\tboar\n🐽\tpig nose\n🐏\tram\n🐑\tewe\n🐐\tgoat\n🐪\tcamel\n🐫\ttwo-hump camel\n🦙\tllama\n🦒\tgiraffe\n🐘\telephant\n🦣\tmammoth\n🦏\trhinoceros\n🦛\thippopotamus\n🐭\tmouse face\n🐁\tmouse\n🐀\trat\n🐹\thamster\n🐰\trabbit face\n🐇\trabbit\n🐿️\tchipmunk\n🦫\tbeaver\n🦔\thedgehog\n🦇\tbat\n🐻\tbear\n🐻‍❄️\tpolar bear\n🐨\tkoala\n🐼\tpanda\n🦥\tsloth\n🦦\totter\n🦨\tskunk\n🦘\tkangaroo\n🦡\tbadger\n🐾\tpaw prints\n🦃\tturkey\n🐔\tchicken\n🐓\trooster\n🐣\thatching chick\n🐤\tbaby chick\n🐥\tfront-facing baby chick\n🐦\tbird\n🐧\tpenguin\n🕊️\tdove\n🦅\teagle\n🦆\tduck\n🦢\tswan\n🦉\towl\n🦤\tdodo\n🪶\tfeather\n🦩\tflamingo\n🦚\tpeacock\n🦜\tparrot\n🪽\twing\n🐦‍⬛\tblack bird\n🪿\tgoose\n🐦‍🔥\tphoenix\n🐸\tfrog\n🐊\tcrocodile\n🐢\tturtle\n🦎\tlizard\n🐍\tsnake\n🐲\tdragon face\n🐉\tdragon\n🦕\tsauropod\n🦖\tT-Rex\n🐳\tspouting whale\n🐋\twhale\n🐬\tdolphin\n🦭\tseal\n🐟\tfish\n🐠\ttropical fish\n🐡\tblowfish\n🦈\tshark\n🐙\toctopus\n🐚\tspiral shell\n🪸\tcoral\n🪼\tjellyfish\n🦀\tcrab\n🦞\tlobster\n🦐\tshrimp\n🦑\tsquid\n🦪\toyster\n🐌\tsnail\n🦋\tbutterfly\n🐛\tbug\n🐜\tant\n🐝\thoneybee\n🪲\tbeetle\n🐞\tlady beetle\n🦗\tcricket\n🪳\tcockroach\n🕷️\tspider\n🕸️\tspider web\n🦂\tscorpion\n🦟\tmosquito\n🪰\tfly\n🪱\tworm\n🦠\tmicrobe\n💐\tbouquet\n🌸\tcherry blossom\n💮\twhite flower\n🪷\tlotus\n🏵️\trosette\n🌹\trose\n🥀\twilted flower\n🌺\thibiscus\n🌻\tsunflower\n🌼\tblossom\n🌷\ttulip\n🪻\thyacinth\n🌱\tseedling\n🪴\tpotted plant\n🌲\tevergreen tree\n🌳\tdeciduous tree\n🌴\tpalm tree\n🌵\tcactus\n🌾\tsheaf of rice\n🌿\therb\n☘️\tshamrock\n🍀\tfour leaf clover\n🍁\tmaple leaf\n🍂\tfallen leaf\n🍃\tleaf fluttering in wind\n🪹\tempty nest\n🪺\tnest with eggs\n🍄\tmushroom\n🪾\tleafless tree" },
  { id: "food", title: "Еда и напитки", icon: "🍕", list: "🍇\tgrapes\n🍈\tmelon\n🍉\twatermelon\n🍊\ttangerine\n🍋\tlemon\n🍋‍🟩\tlime\n🍌\tbanana\n🍍\tpineapple\n🥭\tmango\n🍎\tred apple\n🍏\tgreen apple\n🍐\tpear\n🍑\tpeach\n🍒\tcherries\n🍓\tstrawberry\n🫐\tblueberries\n🥝\tkiwi fruit\n🍅\ttomato\n🫒\tolive\n🥥\tcoconut\n🥑\tavocado\n🍆\teggplant\n🥔\tpotato\n🥕\tcarrot\n🌽\tear of corn\n🌶️\thot pepper\n🫑\tbell pepper\n🥒\tcucumber\n🥬\tleafy green\n🥦\tbroccoli\n🧄\tgarlic\n🧅\tonion\n🥜\tpeanuts\n🫘\tbeans\n🌰\tchestnut\n🫚\tginger root\n🫛\tpea pod\n🍄‍🟫\tbrown mushroom\n🫜\troot vegetable\n🍞\tbread\n🥐\tcroissant\n🥖\tbaguette bread\n🫓\tflatbread\n🥨\tpretzel\n🥯\tbagel\n🥞\tpancakes\n🧇\twaffle\n🧀\tcheese wedge\n🍖\tmeat on bone\n🍗\tpoultry leg\n🥩\tcut of meat\n🥓\tbacon\n🍔\thamburger\n🍟\tfrench fries\n🍕\tpizza\n🌭\thot dog\n🥪\tsandwich\n🌮\ttaco\n🌯\tburrito\n🫔\ttamale\n🥙\tstuffed flatbread\n🧆\tfalafel\n🥚\tegg\n🍳\tcooking\n🥘\tshallow pan of food\n🍲\tpot of food\n🫕\tfondue\n🥣\tbowl with spoon\n🥗\tgreen salad\n🍿\tpopcorn\n🧈\tbutter\n🧂\tsalt\n🥫\tcanned food\n🍱\tbento box\n🍘\trice cracker\n🍙\trice ball\n🍚\tcooked rice\n🍛\tcurry rice\n🍜\tsteaming bowl\n🍝\tspaghetti\n🍠\troasted sweet potato\n🍢\toden\n🍣\tsushi\n🍤\tfried shrimp\n🍥\tfish cake with swirl\n🥮\tmoon cake\n🍡\tdango\n🥟\tdumpling\n🥠\tfortune cookie\n🥡\ttakeout box\n🍦\tsoft ice cream\n🍧\tshaved ice\n🍨\tice cream\n🍩\tdoughnut\n🍪\tcookie\n🎂\tbirthday cake\n🍰\tshortcake\n🧁\tcupcake\n🥧\tpie\n🍫\tchocolate bar\n🍬\tcandy\n🍭\tlollipop\n🍮\tcustard\n🍯\thoney pot\n🍼\tbaby bottle\n🥛\tglass of milk\n☕\thot beverage\n🫖\tteapot\n🍵\tteacup without handle\n🍶\tsake\n🍾\tbottle with popping cork\n🍷\twine glass\n🍸\tcocktail glass\n🍹\ttropical drink\n🍺\tbeer mug\n🍻\tclinking beer mugs\n🥂\tclinking glasses\n🥃\ttumbler glass\n🫗\tpouring liquid\n🥤\tcup with straw\n🧋\tbubble tea\n🧃\tbeverage box\n🧉\tmate\n🧊\tice\n🥢\tchopsticks\n🍽️\tfork and knife with plate\n🍴\tfork and knife\n🥄\tspoon\n🔪\tkitchen knife\n🫙\tjar\n🏺\tamphora" },
  { id: "travel", title: "Транспорт и места", icon: "🚗", list: "🌍\tglobe showing Europe-Africa\n🌎\tglobe showing Americas\n🌏\tglobe showing Asia-Australia\n🌐\tglobe with meridians\n🗺️\tworld map\n🗾\tmap of Japan\n🧭\tcompass\n🏔️\tsnow-capped mountain\n⛰️\tmountain\n🌋\tvolcano\n🗻\tmount fuji\n🏕️\tcamping\n🏖️\tbeach with umbrella\n🏜️\tdesert\n🏝️\tdesert island\n🏞️\tnational park\n🏟️\tstadium\n🏛️\tclassical building\n🏗️\tbuilding construction\n🧱\tbrick\n🪨\trock\n🪵\twood\n🛖\thut\n🏘️\thouses\n🏚️\tderelict house\n🏠\thouse\n🏡\thouse with garden\n🏢\toffice building\n🏣\tJapanese post office\n🏤\tpost office\n🏥\thospital\n🏦\tbank\n🏨\thotel\n🏩\tlove hotel\n🏪\tconvenience store\n🏫\tschool\n🏬\tdepartment store\n🏭\tfactory\n🏯\tJapanese castle\n🏰\tcastle\n💒\twedding\n🗼\tTokyo tower\n🗽\tStatue of Liberty\n⛪\tchurch\n🕌\tmosque\n🛕\thindu temple\n🕍\tsynagogue\n⛩️\tshinto shrine\n🕋\tkaaba\n⛲\tfountain\n⛺\ttent\n🌁\tfoggy\n🌃\tnight with stars\n🏙️\tcityscape\n🌄\tsunrise over mountains\n🌅\tsunrise\n🌆\tcityscape at dusk\n🌇\tsunset\n🌉\tbridge at night\n♨️\thot springs\n🎠\tcarousel horse\n🛝\tplayground slide\n🎡\tferris wheel\n🎢\troller coaster\n💈\tbarber pole\n🎪\tcircus tent\n🚂\tlocomotive\n🚃\trailway car\n🚄\thigh-speed train\n🚅\tbullet train\n🚆\ttrain\n🚇\tmetro\n🚈\tlight rail\n🚉\tstation\n🚊\ttram\n🚝\tmonorail\n🚞\tmountain railway\n🚋\ttram car\n🚌\tbus\n🚍\toncoming bus\n🚎\ttrolleybus\n🚐\tminibus\n🚑\tambulance\n🚒\tfire engine\n🚓\tpolice car\n🚔\toncoming police car\n🚕\ttaxi\n🚖\toncoming taxi\n🚗\tautomobile\n🚘\toncoming automobile\n🚙\tsport utility vehicle\n🛻\tpickup truck\n🚚\tdelivery truck\n🚛\tarticulated lorry\n🚜\ttractor\n🏎️\tracing car\n🏍️\tmotorcycle\n🛵\tmotor scooter\n🦽\tmanual wheelchair\n🦼\tmotorized wheelchair\n🛺\tauto rickshaw\n🚲\tbicycle\n🛴\tkick scooter\n🛹\tskateboard\n🛼\troller skate\n🚏\tbus stop\n🛣️\tmotorway\n🛤️\trailway track\n🛢️\toil drum\n⛽\tfuel pump\n🛞\twheel\n🚨\tpolice car light\n🚥\thorizontal traffic light\n🚦\tvertical traffic light\n🛑\tstop sign\n🚧\tconstruction\n⚓\tanchor\n🛟\tring buoy\n⛵\tsailboat\n🛶\tcanoe\n🚤\tspeedboat\n🛳️\tpassenger ship\n⛴️\tferry\n🛥️\tmotor boat\n🚢\tship\n✈️\tairplane\n🛩️\tsmall airplane\n🛫\tairplane departure\n🛬\tairplane arrival\n🪂\tparachute\n💺\tseat\n🚁\thelicopter\n🚟\tsuspension railway\n🚠\tmountain cableway\n🚡\taerial tramway\n🛰️\tsatellite\n🚀\trocket\n🛸\tflying saucer\n🛎️\tbellhop bell\n🧳\tluggage\n⌛\thourglass done\n⏳\thourglass not done\n⌚\twatch\n⏰\talarm clock\n⏱️\tstopwatch\n⏲️\ttimer clock\n🕰️\tmantelpiece clock\n🕛\ttwelve o’clock\n🕧\ttwelve-thirty\n🕐\tone o’clock\n🕜\tone-thirty\n🕑\ttwo o’clock\n🕝\ttwo-thirty\n🕒\tthree o’clock\n🕞\tthree-thirty\n🕓\tfour o’clock\n🕟\tfour-thirty\n🕔\tfive o’clock\n🕠\tfive-thirty\n🕕\tsix o’clock\n🕡\tsix-thirty\n🕖\tseven o’clock\n🕢\tseven-thirty\n🕗\teight o’clock\n🕣\teight-thirty\n🕘\tnine o’clock\n🕤\tnine-thirty\n🕙\tten o’clock\n🕥\tten-thirty\n🕚\televen o’clock\n🕦\televen-thirty\n🌑\tnew moon\n🌒\twaxing crescent moon\n🌓\tfirst quarter moon\n🌔\twaxing gibbous moon\n🌕\tfull moon\n🌖\twaning gibbous moon\n🌗\tlast quarter moon\n🌘\twaning crescent moon\n🌙\tcrescent moon\n🌚\tnew moon face\n🌛\tfirst quarter moon face\n🌜\tlast quarter moon face\n🌡️\tthermometer\n☀️\tsun\n🌝\tfull moon face\n🌞\tsun with face\n🪐\tringed planet\n⭐\tstar\n🌟\tglowing star\n🌠\tshooting star\n🌌\tmilky way\n☁️\tcloud\n⛅\tsun behind cloud\n⛈️\tcloud with lightning and rain\n🌤️\tsun behind small cloud\n🌥️\tsun behind large cloud\n🌦️\tsun behind rain cloud\n🌧️\tcloud with rain\n🌨️\tcloud with snow\n🌩️\tcloud with lightning\n🌪️\ttornado\n🌫️\tfog\n🌬️\twind face\n🌀\tcyclone\n🌈\trainbow\n🌂\tclosed umbrella\n☂️\tumbrella\n☔\tumbrella with rain drops\n⛱️\tumbrella on ground\n⚡\thigh voltage\n❄️\tsnowflake\n☃️\tsnowman\n⛄\tsnowman without snow\n☄️\tcomet\n🔥\tfire\n💧\tdroplet\n🌊\twater wave" },
  { id: "activities", title: "Спорт и активности", icon: "⚽", list: "🎃\tjack-o-lantern\n🎄\tChristmas tree\n🎆\tfireworks\n🎇\tsparkler\n🧨\tfirecracker\n✨\tsparkles\n🎈\tballoon\n🎉\tparty popper\n🎊\tconfetti ball\n🎋\ttanabata tree\n🎍\tpine decoration\n🎎\tJapanese dolls\n🎏\tcarp streamer\n🎐\twind chime\n🎑\tmoon viewing ceremony\n🧧\tred envelope\n🎀\tribbon\n🎁\twrapped gift\n🎗️\treminder ribbon\n🎟️\tadmission tickets\n🎫\tticket\n🎖️\tmilitary medal\n🏆\ttrophy\n🏅\tsports medal\n🥇\t1st place medal\n🥈\t2nd place medal\n🥉\t3rd place medal\n⚽\tsoccer ball\n⚾\tbaseball\n🥎\tsoftball\n🏀\tbasketball\n🏐\tvolleyball\n🏈\tamerican football\n🏉\trugby football\n🎾\ttennis\n🥏\tflying disc\n🎳\tbowling\n🏏\tcricket game\n🏑\tfield hockey\n🏒\tice hockey\n🥍\tlacrosse\n🏓\tping pong\n🏸\tbadminton\n🥊\tboxing glove\n🥋\tmartial arts uniform\n🥅\tgoal net\n⛳\tflag in hole\n⛸️\tice skate\n🎣\tfishing pole\n🤿\tdiving mask\n🎽\trunning shirt\n🎿\tskis\n🛷\tsled\n🥌\tcurling stone\n🎯\tbullseye\n🪀\tyo-yo\n🪁\tkite\n🔫\twater pistol\n🎱\tpool 8 ball\n🔮\tcrystal ball\n🪄\tmagic wand\n🎮\tvideo game\n🕹️\tjoystick\n🎰\tslot machine\n🎲\tgame die\n🧩\tpuzzle piece\n🧸\tteddy bear\n🪅\tpiñata\n🪩\tmirror ball\n🪆\tnesting dolls\n♠️\tspade suit\n♥️\theart suit\n♦️\tdiamond suit\n♣️\tclub suit\n♟️\tchess pawn\n🃏\tjoker\n🀄\tmahjong red dragon\n🎴\tflower playing cards\n🎭\tperforming arts\n🖼️\tframed picture\n🎨\tartist palette\n🧵\tthread" },
  { id: "objects", title: "Предметы", icon: "💡", list: "🪡\tsewing needle\n🧶\tyarn\n🪢\tknot\n👓\tglasses\n🕶️\tsunglasses\n🥽\tgoggles\n🥼\tlab coat\n🦺\tsafety vest\n👔\tnecktie\n👕\tt-shirt\n👖\tjeans\n🧣\tscarf\n🧤\tgloves\n🧥\tcoat\n🧦\tsocks\n👗\tdress\n👘\tkimono\n🥻\tsari\n🩱\tone-piece swimsuit\n🩲\tbriefs\n🩳\tshorts\n👙\tbikini\n👚\twoman’s clothes\n🪭\tfolding hand fan\n👛\tpurse\n👜\thandbag\n👝\tclutch bag\n🛍️\tshopping bags\n🎒\tbackpack\n🩴\tthong sandal\n👞\tman’s shoe\n👟\trunning shoe\n🥾\thiking boot\n🥿\tflat shoe\n👠\thigh-heeled shoe\n👡\twoman’s sandal\n🩰\tballet shoes\n👢\twoman’s boot\n🪮\thair pick\n👑\tcrown\n👒\twoman’s hat\n🎩\ttop hat\n🎓\tgraduation cap\n🧢\tbilled cap\n🪖\tmilitary helmet\n⛑️\trescue worker’s helmet\n📿\tprayer beads\n💄\tlipstick\n💍\tring\n💎\tgem stone\n🔇\tmuted speaker\n🔈\tspeaker low volume\n🔉\tspeaker medium volume\n🔊\tspeaker high volume\n📢\tloudspeaker\n📣\tmegaphone\n📯\tpostal horn\n🔔\tbell\n🔕\tbell with slash\n🎼\tmusical score\n🎵\tmusical note\n🎶\tmusical notes\n🎙️\tstudio microphone\n🎚️\tlevel slider\n🎛️\tcontrol knobs\n🎤\tmicrophone\n🎧\theadphone\n📻\tradio\n🎷\tsaxophone\n🪗\taccordion\n🎸\tguitar\n🎹\tmusical keyboard\n🎺\ttrumpet\n🎻\tviolin\n🪕\tbanjo\n🥁\tdrum\n🪘\tlong drum\n🪇\tmaracas\n🪈\tflute\n🪉\tharp\n📱\tmobile phone\n📲\tmobile phone with arrow\n☎️\ttelephone\n📞\ttelephone receiver\n📟\tpager\n📠\tfax machine\n🔋\tbattery\n🪫\tlow battery\n🔌\telectric plug\n💻\tlaptop\n🖥️\tdesktop computer\n🖨️\tprinter\n⌨️\tkeyboard\n🖱️\tcomputer mouse\n🖲️\ttrackball\n💽\tcomputer disk\n💾\tfloppy disk\n💿\toptical disk\n📀\tdvd\n🧮\tabacus\n🎥\tmovie camera\n🎞️\tfilm frames\n📽️\tfilm projector\n🎬\tclapper board\n📺\ttelevision\n📷\tcamera\n📸\tcamera with flash\n📹\tvideo camera\n📼\tvideocassette\n🔍\tmagnifying glass tilted left\n🔎\tmagnifying glass tilted right\n🕯️\tcandle\n💡\tlight bulb\n🔦\tflashlight\n🏮\tred paper lantern\n🪔\tdiya lamp\n📔\tnotebook with decorative cover\n📕\tclosed book\n📖\topen book\n📗\tgreen book\n📘\tblue book\n📙\torange book\n📚\tbooks\n📓\tnotebook\n📒\tledger\n📃\tpage with curl\n📜\tscroll\n📄\tpage facing up\n📰\tnewspaper\n🗞️\trolled-up newspaper\n📑\tbookmark tabs\n🔖\tbookmark\n🏷️\tlabel\n💰\tmoney bag\n🪙\tcoin\n💴\tyen banknote\n💵\tdollar banknote\n💶\teuro banknote\n💷\tpound banknote\n💸\tmoney with wings\n💳\tcredit card\n🧾\treceipt\n💹\tchart increasing with yen\n✉️\tenvelope\n📧\te-mail\n📨\tincoming envelope\n📩\tenvelope with arrow\n📤\toutbox tray\n📥\tinbox tray\n📦\tpackage\n📫\tclosed mailbox with raised flag\n📪\tclosed mailbox with lowered flag\n📬\topen mailbox with raised flag\n📭\topen mailbox with lowered flag\n📮\tpostbox\n🗳️\tballot box with ballot\n✏️\tpencil\n✒️\tblack nib\n🖋️\tfountain pen\n🖊️\tpen\n🖌️\tpaintbrush\n🖍️\tcrayon\n📝\tmemo\n💼\tbriefcase\n📁\tfile folder\n📂\topen file folder\n🗂️\tcard index dividers\n📅\tcalendar\n📆\ttear-off calendar\n🗒️\tspiral notepad\n🗓️\tspiral calendar\n📇\tcard index\n📈\tchart increasing\n📉\tchart decreasing\n📊\tbar chart\n📋\tclipboard\n📌\tpushpin\n📍\tround pushpin\n📎\tpaperclip\n🖇️\tlinked paperclips\n📏\tstraight ruler\n📐\ttriangular ruler\n✂️\tscissors\n🗃️\tcard file box\n🗄️\tfile cabinet\n🗑️\twastebasket\n🔒\tlocked\n🔓\tunlocked\n🔏\tlocked with pen\n🔐\tlocked with key\n🔑\tkey\n🗝️\told key\n🔨\thammer\n🪓\taxe\n⛏️\tpick\n⚒️\thammer and pick\n🛠️\thammer and wrench\n🗡️\tdagger\n⚔️\tcrossed swords\n💣\tbomb\n🪃\tboomerang\n🏹\tbow and arrow\n🛡️\tshield\n🪚\tcarpentry saw\n🔧\twrench\n🪛\tscrewdriver\n🔩\tnut and bolt\n⚙️\tgear\n🗜️\tclamp\n⚖️\tbalance scale\n🦯\twhite cane\n🔗\tlink\n⛓️‍💥\tbroken chain\n⛓️\tchains\n🪝\thook\n🧰\ttoolbox\n🧲\tmagnet\n🪜\tladder\n🪏\tshovel\n⚗️\talembic\n🧪\ttest tube\n🧫\tpetri dish\n🧬\tdna\n🔬\tmicroscope\n🔭\ttelescope\n📡\tsatellite antenna\n💉\tsyringe\n🩸\tdrop of blood\n💊\tpill\n🩹\tadhesive bandage\n🩼\tcrutch\n🩺\tstethoscope\n🩻\tx-ray\n🚪\tdoor\n🛗\televator\n🪞\tmirror\n🪟\twindow\n🛏️\tbed\n🛋️\tcouch and lamp\n🪑\tchair\n🚽\ttoilet\n🪠\tplunger\n🚿\tshower\n🛁\tbathtub\n🪤\tmouse trap\n🪒\trazor\n🧴\tlotion bottle\n🧷\tsafety pin\n🧹\tbroom\n🧺\tbasket\n🧻\troll of paper\n🪣\tbucket\n🧼\tsoap\n🫧\tbubbles\n🪥\ttoothbrush\n🧽\tsponge\n🧯\tfire extinguisher\n🛒\tshopping cart\n🚬\tcigarette\n⚰️\tcoffin\n🪦\theadstone\n⚱️\tfuneral urn\n🧿\tnazar amulet\n🪬\thamsa\n🗿\tmoai\n🪧\tplacard\n🪪\tidentification card" },
  { id: "symbols", title: "Символы", icon: "❤️", list: "🏧\tATM sign\n🚮\tlitter in bin sign\n🚰\tpotable water\n♿\twheelchair symbol\n🚹\tmen’s room\n🚺\twomen’s room\n🚻\trestroom\n🚼\tbaby symbol\n🚾\twater closet\n🛂\tpassport control\n🛃\tcustoms\n🛄\tbaggage claim\n🛅\tleft luggage\n⚠️\twarning\n🚸\tchildren crossing\n⛔\tno entry\n🚫\tprohibited\n🚳\tno bicycles\n🚭\tno smoking\n🚯\tno littering\n🚱\tnon-potable water\n🚷\tno pedestrians\n📵\tno mobile phones\n🔞\tno one under eighteen\n☢️\tradioactive\n☣️\tbiohazard\n⬆️\tup arrow\n↗️\tup-right arrow\n➡️\tright arrow\n↘️\tdown-right arrow\n⬇️\tdown arrow\n↙️\tdown-left arrow\n⬅️\tleft arrow\n↖️\tup-left arrow\n↕️\tup-down arrow\n↔️\tleft-right arrow\n↩️\tright arrow curving left\n↪️\tleft arrow curving right\n⤴️\tright arrow curving up\n⤵️\tright arrow curving down\n🔃\tclockwise vertical arrows\n🔄\tcounterclockwise arrows button\n🔙\tBACK arrow\n🔚\tEND arrow\n🔛\tON! arrow\n🔜\tSOON arrow\n🔝\tTOP arrow\n🛐\tplace of worship\n⚛️\tatom symbol\n🕉️\tom\n✡️\tstar of David\n☸️\twheel of dharma\n☯️\tyin yang\n✝️\tlatin cross\n☦️\torthodox cross\n☪️\tstar and crescent\n☮️\tpeace symbol\n🕎\tmenorah\n🔯\tdotted six-pointed star\n🪯\tkhanda\n♈\tAries\n♉\tTaurus\n♊\tGemini\n♋\tCancer\n♌\tLeo\n♍\tVirgo\n♎\tLibra\n♏\tScorpio\n♐\tSagittarius\n♑\tCapricorn\n♒\tAquarius\n♓\tPisces\n⛎\tOphiuchus\n🔀\tshuffle tracks button\n🔁\trepeat button\n🔂\trepeat single button\n▶️\tplay button\n⏩\tfast-forward button\n⏭️\tnext track button\n⏯️\tplay or pause button\n◀️\treverse button\n⏪\tfast reverse button\n⏮️\tlast track button\n🔼\tupwards button\n⏫\tfast up button\n🔽\tdownwards button\n⏬\tfast down button\n⏸️\tpause button\n⏹️\tstop button\n⏺️\trecord button\n⏏️\teject button\n🎦\tcinema\n🔅\tdim button\n🔆\tbright button\n📶\tantenna bars\n🛜\twireless\n📳\tvibration mode\n📴\tmobile phone off\n♀️\tfemale sign\n♂️\tmale sign\n⚧️\ttransgender symbol\n✖️\tmultiply\n➕\tplus\n➖\tminus\n➗\tdivide\n🟰\theavy equals sign\n♾️\tinfinity\n‼️\tdouble exclamation mark\n⁉️\texclamation question mark\n❓\tred question mark\n❔\twhite question mark\n❕\twhite exclamation mark\n❗\tred exclamation mark\n〰️\twavy dash\n💱\tcurrency exchange\n💲\theavy dollar sign\n⚕️\tmedical symbol\n♻️\trecycling symbol\n⚜️\tfleur-de-lis\n🔱\ttrident emblem\n📛\tname badge\n🔰\tJapanese symbol for beginner\n⭕\thollow red circle\n✅\tcheck mark button\n☑️\tcheck box with check\n✔️\tcheck mark\n❌\tcross mark\n❎\tcross mark button\n➰\tcurly loop\n➿\tdouble curly loop\n〽️\tpart alternation mark\n✳️\teight-spoked asterisk\n✴️\teight-pointed star\n❇️\tsparkle\n©️\tcopyright\n®️\tregistered\n™️\ttrade mark\n🫟\tsplatter\n#️⃣\tkeycap: #\n*️⃣\tkeycap: *\n0️⃣\tkeycap: 0\n1️⃣\tkeycap: 1\n2️⃣\tkeycap: 2\n3️⃣\tkeycap: 3\n4️⃣\tkeycap: 4\n5️⃣\tkeycap: 5\n6️⃣\tkeycap: 6\n7️⃣\tkeycap: 7\n8️⃣\tkeycap: 8\n9️⃣\tkeycap: 9\n🔟\tkeycap: 10\n🔠\tinput latin uppercase\n🔡\tinput latin lowercase\n🔢\tinput numbers\n🔣\tinput symbols\n🔤\tinput latin letters\n🅰️\tA button (blood type)\n🆎\tAB button (blood type)\n🅱️\tB button (blood type)\n🆑\tCL button\n🆒\tCOOL button\n🆓\tFREE button\nℹ️\tinformation\n🆔\tID button\nⓂ️\tcircled M\n🆕\tNEW button\n🆖\tNG button\n🅾️\tO button (blood type)\n🆗\tOK button\n🅿️\tP button\n🆘\tSOS button\n🆙\tUP! button\n🆚\tVS button\n🈁\tJapanese “here” button\n🈂️\tJapanese “service charge” button\n🈷️\tJapanese “monthly amount” button\n🈶\tJapanese “not free of charge” button\n🈯\tJapanese “reserved” button\n🉐\tJapanese “bargain” button\n🈹\tJapanese “discount” button\n🈚\tJapanese “free of charge” button\n🈲\tJapanese “prohibited” button\n🉑\tJapanese “acceptable” button\n🈸\tJapanese “application” button\n🈴\tJapanese “passing grade” button\n🈳\tJapanese “vacancy” button\n㊗️\tJapanese “congratulations” button\n㊙️\tJapanese “secret” button\n🈺\tJapanese “open for business” button\n🈵\tJapanese “no vacancy” button\n🔴\tred circle\n🟠\torange circle\n🟡\tyellow circle\n🟢\tgreen circle\n🔵\tblue circle\n🟣\tpurple circle\n🟤\tbrown circle\n⚫\tblack circle\n⚪\twhite circle\n🟥\tred square\n🟧\torange square\n🟨\tyellow square\n🟩\tgreen square\n🟦\tblue square\n🟪\tpurple square\n🟫\tbrown square\n⬛\tblack large square\n⬜\twhite large square\n◼️\tblack medium square\n◻️\twhite medium square\n◾\tblack medium-small square\n◽\twhite medium-small square\n▪️\tblack small square\n▫️\twhite small square\n🔶\tlarge orange diamond\n🔷\tlarge blue diamond\n🔸\tsmall orange diamond\n🔹\tsmall blue diamond\n🔺\tred triangle pointed up\n🔻\tred triangle pointed down\n💠\tdiamond with a dot\n🔘\tradio button\n🔳\twhite square button\n🔲\tblack square button" },
  { id: "flags", title: "Флаги", icon: "🏁", list: "🏁\tchequered flag\n🚩\ttriangular flag\n🎌\tcrossed flags\n🏴\tblack flag\n🏳️\twhite flag\n🏳️‍🌈\trainbow flag\n🏳️‍⚧️\ttransgender flag\n🏴‍☠️\tpirate flag\n🇦🇨\tflag: Ascension Island\n🇦🇩\tflag: Andorra\n🇦🇪\tflag: United Arab Emirates\n🇦🇫\tflag: Afghanistan\n🇦🇬\tflag: Antigua & Barbuda\n🇦🇮\tflag: Anguilla\n🇦🇱\tflag: Albania\n🇦🇲\tflag: Armenia\n🇦🇴\tflag: Angola\n🇦🇶\tflag: Antarctica\n🇦🇷\tflag: Argentina\n🇦🇸\tflag: American Samoa\n🇦🇹\tflag: Austria\n🇦🇺\tflag: Australia\n🇦🇼\tflag: Aruba\n🇦🇽\tflag: Åland Islands\n🇦🇿\tflag: Azerbaijan\n🇧🇦\tflag: Bosnia & Herzegovina\n🇧🇧\tflag: Barbados\n🇧🇩\tflag: Bangladesh\n🇧🇪\tflag: Belgium\n🇧🇫\tflag: Burkina Faso\n🇧🇬\tflag: Bulgaria\n🇧🇭\tflag: Bahrain\n🇧🇮\tflag: Burundi\n🇧🇯\tflag: Benin\n🇧🇱\tflag: St. Barthélemy\n🇧🇲\tflag: Bermuda\n🇧🇳\tflag: Brunei\n🇧🇴\tflag: Bolivia\n🇧🇶\tflag: Caribbean Netherlands\n🇧🇷\tflag: Brazil\n🇧🇸\tflag: Bahamas\n🇧🇹\tflag: Bhutan\n🇧🇻\tflag: Bouvet Island\n🇧🇼\tflag: Botswana\n🇧🇾\tflag: Belarus\n🇧🇿\tflag: Belize\n🇨🇦\tflag: Canada\n🇨🇨\tflag: Cocos (Keeling) Islands\n🇨🇩\tflag: Congo - Kinshasa\n🇨🇫\tflag: Central African Republic\n🇨🇬\tflag: Congo - Brazzaville\n🇨🇭\tflag: Switzerland\n🇨🇮\tflag: Côte d’Ivoire\n🇨🇰\tflag: Cook Islands\n🇨🇱\tflag: Chile\n🇨🇲\tflag: Cameroon\n🇨🇳\tflag: China\n🇨🇴\tflag: Colombia\n🇨🇵\tflag: Clipperton Island\n🇨🇶\tflag: Sark\n🇨🇷\tflag: Costa Rica\n🇨🇺\tflag: Cuba\n🇨🇻\tflag: Cape Verde\n🇨🇼\tflag: Curaçao\n🇨🇽\tflag: Christmas Island\n🇨🇾\tflag: Cyprus\n🇨🇿\tflag: Czechia\n🇩🇪\tflag: Germany\n🇩🇬\tflag: Diego Garcia\n🇩🇯\tflag: Djibouti\n🇩🇰\tflag: Denmark\n🇩🇲\tflag: Dominica\n🇩🇴\tflag: Dominican Republic\n🇩🇿\tflag: Algeria\n🇪🇦\tflag: Ceuta & Melilla\n🇪🇨\tflag: Ecuador\n🇪🇪\tflag: Estonia\n🇪🇬\tflag: Egypt\n🇪🇭\tflag: Western Sahara\n🇪🇷\tflag: Eritrea\n🇪🇸\tflag: Spain\n🇪🇹\tflag: Ethiopia\n🇪🇺\tflag: European Union\n🇫🇮\tflag: Finland\n🇫🇯\tflag: Fiji\n🇫🇰\tflag: Falkland Islands\n🇫🇲\tflag: Micronesia\n🇫🇴\tflag: Faroe Islands\n🇫🇷\tflag: France\n🇬🇦\tflag: Gabon\n🇬🇧\tflag: United Kingdom\n🇬🇩\tflag: Grenada\n🇬🇪\tflag: Georgia\n🇬🇫\tflag: French Guiana\n🇬🇬\tflag: Guernsey\n🇬🇭\tflag: Ghana\n🇬🇮\tflag: Gibraltar\n🇬🇱\tflag: Greenland\n🇬🇲\tflag: Gambia\n🇬🇳\tflag: Guinea\n🇬🇵\tflag: Guadeloupe\n🇬🇶\tflag: Equatorial Guinea\n🇬🇷\tflag: Greece\n🇬🇸\tflag: South Georgia & South Sandwich Islands\n🇬🇹\tflag: Guatemala\n🇬🇺\tflag: Guam\n🇬🇼\tflag: Guinea-Bissau\n🇬🇾\tflag: Guyana\n🇭🇰\tflag: Hong Kong SAR China\n🇭🇲\tflag: Heard & McDonald Islands\n🇭🇳\tflag: Honduras\n🇭🇷\tflag: Croatia\n🇭🇹\tflag: Haiti\n🇭🇺\tflag: Hungary\n🇮🇨\tflag: Canary Islands\n🇮🇩\tflag: Indonesia\n🇮🇪\tflag: Ireland\n🇮🇱\tflag: Israel\n🇮🇲\tflag: Isle of Man\n🇮🇳\tflag: India\n🇮🇴\tflag: British Indian Ocean Territory\n🇮🇶\tflag: Iraq\n🇮🇷\tflag: Iran\n🇮🇸\tflag: Iceland\n🇮🇹\tflag: Italy\n🇯🇪\tflag: Jersey\n🇯🇲\tflag: Jamaica\n🇯🇴\tflag: Jordan\n🇯🇵\tflag: Japan\n🇰🇪\tflag: Kenya\n🇰🇬\tflag: Kyrgyzstan\n🇰🇭\tflag: Cambodia\n🇰🇮\tflag: Kiribati\n🇰🇲\tflag: Comoros\n🇰🇳\tflag: St. Kitts & Nevis\n🇰🇵\tflag: North Korea\n🇰🇷\tflag: South Korea\n🇰🇼\tflag: Kuwait\n🇰🇾\tflag: Cayman Islands\n🇰🇿\tflag: Kazakhstan\n🇱🇦\tflag: Laos\n🇱🇧\tflag: Lebanon\n🇱🇨\tflag: St. Lucia\n🇱🇮\tflag: Liechtenstein\n🇱🇰\tflag: Sri Lanka\n🇱🇷\tflag: Liberia\n🇱🇸\tflag: Lesotho\n🇱🇹\tflag: Lithuania\n🇱🇺\tflag: Luxembourg\n🇱🇻\tflag: Latvia\n🇱🇾\tflag: Libya\n🇲🇦\tflag: Morocco\n🇲🇨\tflag: Monaco\n🇲🇩\tflag: Moldova\n🇲🇪\tflag: Montenegro\n🇲🇫\tflag: St. Martin\n🇲🇬\tflag: Madagascar\n🇲🇭\tflag: Marshall Islands\n🇲🇰\tflag: North Macedonia\n🇲🇱\tflag: Mali\n🇲🇲\tflag: Myanmar (Burma)\n🇲🇳\tflag: Mongolia\n🇲🇴\tflag: Macao SAR China\n🇲🇵\tflag: Northern Mariana Islands\n🇲🇶\tflag: Martinique\n🇲🇷\tflag: Mauritania\n🇲🇸\tflag: Montserrat\n🇲🇹\tflag: Malta\n🇲🇺\tflag: Mauritius\n🇲🇻\tflag: Maldives\n🇲🇼\tflag: Malawi\n🇲🇽\tflag: Mexico\n🇲🇾\tflag: Malaysia\n🇲🇿\tflag: Mozambique\n🇳🇦\tflag: Namibia\n🇳🇨\tflag: New Caledonia\n🇳🇪\tflag: Niger\n🇳🇫\tflag: Norfolk Island\n🇳🇬\tflag: Nigeria\n🇳🇮\tflag: Nicaragua\n🇳🇱\tflag: Netherlands\n🇳🇴\tflag: Norway\n🇳🇵\tflag: Nepal\n🇳🇷\tflag: Nauru\n🇳🇺\tflag: Niue\n🇳🇿\tflag: New Zealand\n🇴🇲\tflag: Oman\n🇵🇦\tflag: Panama\n🇵🇪\tflag: Peru\n🇵🇫\tflag: French Polynesia\n🇵🇬\tflag: Papua New Guinea\n🇵🇭\tflag: Philippines\n🇵🇰\tflag: Pakistan\n🇵🇱\tflag: Poland\n🇵🇲\tflag: St. Pierre & Miquelon\n🇵🇳\tflag: Pitcairn Islands\n🇵🇷\tflag: Puerto Rico\n🇵🇸\tflag: Palestinian Territories\n🇵🇹\tflag: Portugal\n🇵🇼\tflag: Palau\n🇵🇾\tflag: Paraguay\n🇶🇦\tflag: Qatar\n🇷🇪\tflag: Réunion\n🇷🇴\tflag: Romania\n🇷🇸\tflag: Serbia\n🇷🇺\tflag: Russia\n🇷🇼\tflag: Rwanda\n🇸🇦\tflag: Saudi Arabia\n🇸🇧\tflag: Solomon Islands\n🇸🇨\tflag: Seychelles\n🇸🇩\tflag: Sudan\n🇸🇪\tflag: Sweden\n🇸🇬\tflag: Singapore\n🇸🇭\tflag: St. Helena\n🇸🇮\tflag: Slovenia\n🇸🇯\tflag: Svalbard & Jan Mayen\n🇸🇰\tflag: Slovakia\n🇸🇱\tflag: Sierra Leone\n🇸🇲\tflag: San Marino\n🇸🇳\tflag: Senegal\n🇸🇴\tflag: Somalia\n🇸🇷\tflag: Suriname\n🇸🇸\tflag: South Sudan\n🇸🇹\tflag: São Tomé & Príncipe\n🇸🇻\tflag: El Salvador\n🇸🇽\tflag: Sint Maarten\n🇸🇾\tflag: Syria\n🇸🇿\tflag: Eswatini\n🇹🇦\tflag: Tristan da Cunha\n🇹🇨\tflag: Turks & Caicos Islands\n🇹🇩\tflag: Chad\n🇹🇫\tflag: French Southern Territories\n🇹🇬\tflag: Togo\n🇹🇭\tflag: Thailand\n🇹🇯\tflag: Tajikistan\n🇹🇰\tflag: Tokelau\n🇹🇱\tflag: Timor-Leste\n🇹🇲\tflag: Turkmenistan\n🇹🇳\tflag: Tunisia\n🇹🇴\tflag: Tonga\n🇹🇷\tflag: Türkiye\n🇹🇹\tflag: Trinidad & Tobago\n🇹🇻\tflag: Tuvalu\n🇹🇼\tflag: Taiwan\n🇹🇿\tflag: Tanzania\n🇺🇦\tflag: Ukraine\n🇺🇬\tflag: Uganda\n🇺🇲\tflag: U.S. Outlying Islands\n🇺🇳\tflag: United Nations\n🇺🇸\tflag: United States\n🇺🇾\tflag: Uruguay\n🇺🇿\tflag: Uzbekistan\n🇻🇦\tflag: Vatican City\n🇻🇨\tflag: St. Vincent & Grenadines\n🇻🇪\tflag: Venezuela\n🇻🇬\tflag: British Virgin Islands\n🇻🇮\tflag: U.S. Virgin Islands\n🇻🇳\tflag: Vietnam\n🇻🇺\tflag: Vanuatu\n🇼🇫\tflag: Wallis & Futuna\n🇼🇸\tflag: Samoa\n🇽🇰\tflag: Kosovo\n🇾🇪\tflag: Yemen\n🇾🇹\tflag: Mayotte\n🇿🇦\tflag: South Africa\n🇿🇲\tflag: Zambia\n🇿🇼\tflag: Zimbabwe\n🏴󠁧󠁢󠁥󠁮󠁧󠁿\tflag: England\n🏴󠁧󠁢󠁳󠁣󠁴󠁿\tflag: Scotland\n🏴󠁧󠁢󠁷󠁬󠁳󠁿\tflag: Wales" },
];
const EMOJI = EMOJI_CATS.map((c) => ({
  id: c.id, title: c.title, icon: c.icon,
  items: c.list.split('\n').map((l) => { const [e, n] = l.split('\t'); return { e, n: n || '' }; }),
}));

  return { EMOJI_CATS, EMOJI };
})();

__m["ui/dialogs.js"] = (function () {
  const { el } = __m["dom.js"];
  const { avatar } = __m["ui/avatar.js"];
/* Маленькое окошко с полем ввода вместо window.prompt (в приложении-обёртке prompt работает плохо). */



/** @returns {Promise<string|null>} введённый текст или null при отмене */
function askText({ title, placeholder = '', value = '', ok = 'Готово', max = 40 }) {
  return new Promise((resolve) => {
    const input = el('input', { class: 'dialog__input', type: 'text', maxlength: String(max), placeholder, value, 'aria-label': title });
    const close = (v) => { box.remove(); resolve(v); };
    const submit = () => { const t = input.value.trim(); if (t) close(t); else input.focus(); };
    const box = el('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      el('div', { class: 'dialog__backdrop', onclick: () => close(null) }),
      el('form', { class: 'dialog__card', onsubmit: (e) => { e.preventDefault(); submit(); } },
        el('h3', { class: 'dialog__title', text: title }), input,
        el('div', { class: 'dialog__actions' },
          el('button', { class: 'btn btn--ghost', type: 'button', text: 'Отмена', onclick: () => close(null) }),
          el('button', { class: 'btn btn--primary', type: 'submit', text: ok }))));
    box.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(null); } });
    document.body.append(box);
    input.focus(); input.select();
  });
}

/** Окошко удаления: «Удалить N сообщений?» с галочкой «Удалить у всех» (если можно). @returns {Promise<{all:boolean}|null>} */
function askDelete({ count, canAll }) {
  return new Promise((resolve) => {
    const cb = el('input', { type: 'checkbox', id: 'delete-all' });
    const close = (v) => { box.remove(); resolve(v); };
    const box = el('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Удаление' },
      el('div', { class: 'dialog__backdrop', onclick: () => close(null) }),
      el('div', { class: 'dialog__card' },
        el('h3', { class: 'dialog__title', text: count === 1 ? 'Удалить сообщение?' : `Удалить сообщения (${count})?` }),
        canAll ? el('label', { class: 'check' }, cb, el('span', { text: 'Удалить у всех' })) : el('p', { class: 'dialog__hint', text: 'Сообщения исчезнут только у вас.' }),
        el('div', { class: 'dialog__actions' },
          el('button', { class: 'btn btn--ghost', type: 'button', text: 'Отмена', onclick: () => close(null) }),
          el('button', { class: 'btn btn--danger', type: 'button', id: 'delete-ok', text: 'Удалить', onclick: () => close({ all: canAll && cb.checked }) }))));
    box.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(null); } });
    document.body.append(box);
    box.querySelector('#delete-ok').focus();
  });
}

/** Выбор пользователей галочками. @returns {Promise<number[]|null>} id выбранных или null при отмене */
function pickUsers({ title, users, selected = [], hint = '' }) {
  return new Promise((resolve) => {
    const chosen = new Set(selected);
    const close = (v) => { box.remove(); resolve(v); };
    const rows = users.map((u) => {
      const cb = el('input', { type: 'checkbox', checked: chosen.has(u.id), dataset: { uid: u.id },
        onchange: () => { if (cb.checked) chosen.add(u.id); else chosen.delete(u.id); } });
      return el('label', { class: 'pick__row' }, cb, avatar(u.display_name || u.username, { user: u, small: true }),
        el('span', { class: 'pick__name' }, el('b', { text: u.display_name || u.username }), el('small', { text: `@${u.username}` })));
    });
    const box = el('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      el('div', { class: 'dialog__backdrop', onclick: () => close(null) }),
      el('div', { class: 'dialog__card dialog__card--tall' },
        el('h3', { class: 'dialog__title', text: title }),
        hint ? el('p', { class: 'dialog__hint', text: hint }) : null,
        el('div', { class: 'pick' }, rows.length ? rows : [el('p', { class: 'dialog__hint', text: 'Пока некого выбрать: добавьте контакты или начните переписку.' })]),
        el('div', { class: 'dialog__actions' },
          el('button', { class: 'btn btn--ghost', type: 'button', text: 'Отмена', onclick: () => close(null) }),
          el('button', { class: 'btn btn--primary', type: 'button', id: 'pick-ok', text: 'Готово', onclick: () => close([...chosen]) }))));
    box.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(null); } });
    document.body.append(box);
  });
}

  return { askText, askDelete, pickUsers };
})();

__m["ui/media-actions.js"] = (function () {
  const { $, el } = __m["dom.js"];
  const { api, mediaUrl } = __m["api.js"];
  const { state, peerOf } = __m["state.js"];
  const { avatar } = __m["ui/avatar.js"];
  const { openModal, closeModal, onModalClose } = __m["ui/modal.js"];
  const { toast } = __m["ui/toast.js"];
/* Действия с медиа: сохранить в галерею (скачать/«поделиться» на телефоне) и переслать в другой чат. */







const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };
const touchDevice = () => window.matchMedia('(pointer: coarse)').matches;

/** Сохранить файл: на телефоне — системное меню «Сохранить в галерею/Фото», на компьютере — обычное скачивание. */
async function saveToGallery(media) {
  try {
    const blob = await (await fetch(media.local ? media.url : mediaUrl(media.url))).blob();
    const type = media.mime || blob.type;
    const name = (media.name && /\.[a-z0-9]{2,4}$/i.test(media.name)) ? media.name : `aqua-${Date.now()}.${EXT[type] || 'bin'}`;
    const file = new File([blob], name, { type });
    if (touchDevice() && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return true; } catch (e) { if (e.name === 'AbortError') return false; }
    }
    const a = el('a', { href: URL.createObjectURL(file), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    toast('Файл сохранён.');
    return true;
  } catch { toast('Не удалось сохранить файл.'); return false; }
}

/** Сохранить GIF в «Сохранённые». */
async function saveGif(media) {
  try { await api.saveGif(media.id); toast('GIF сохранена.'); return true; }
  catch (e) { toast(e.message || 'Не удалось сохранить GIF.'); return false; }
}

const isGifMessage = (m) => Boolean(m.meta?.gif) || m.media?.mime === 'image/gif';

/** Выбор чата и пересылка сообщений (опционально — без «Переслано от …»). @returns {Promise<boolean>} переслано ли */
function forwardMessages(ids) {
  return new Promise((resolve) => {
    const list = $('#forward-list');
    $('#forward-hide').checked = false;
    const chats = [...state.chats.values()];
    let done = false, chosen = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    list.replaceChildren(...(chats.length ? chats.map((c) => {
      const peer = c.type === 'direct' ? peerOf(c) : null;
      return el('li', {}, el('button', { type: 'button', class: 'contacts__row', onclick: async () => {
        const hide = $('#forward-hide').checked;
        chosen = true;
        closeModal('modal-forward');
        try { await api.forward(ids, c.id, hide); toast(`Отправлено: ${c.title}`); finish(true); }
        catch (e) { toast(e.message || 'Не удалось переслать.'); finish(false); }
      } }, avatar(c.title, { user: peer }), el('span', { class: 'contacts__name' }, el('b', { text: c.title }))));
    }) : [el('li', { class: 'contacts__empty', text: 'Чатов пока нет.' })]));
    onModalClose('modal-forward', () => { if (!chosen) finish(false); });
    openModal('modal-forward');
  });
}

  return { saveToGallery, saveGif, isGifMessage, forwardMessages };
})();

__m["ui/stickers.js"] = (function () {
  const { $, el, icon } = __m["dom.js"];
  const { api, mediaUrl } = __m["api.js"];
  const { toast } = __m["ui/toast.js"];
  const { askText } = __m["ui/dialogs.js"];
  const { openModal, closeModal } = __m["ui/modal.js"];
  const { saveToGallery } = __m["ui/media-actions.js"];
  const { haptic } = __m["haptics.js"];
/* Вкладка «Стикеры»: лента (сверху вниз) — Избранные, Недавние (последние 30), затем стикерпаки;
   внизу полоса с превью паков (превью = первый добавленный стикер) и кнопкой «создать стикерпак».
   Стикер: тап — отправить, долгое нажатие — крупный план с действиями. */








const MAX_SIDE = 512;                                    // стикер уменьшаем до 512 px (как в Telegram)
const LONG_MS = 420;

/** Картинка → webp/png ≤512 px с сохранением прозрачности. */
async function prepareStickerFile(file) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((resolve) => c.toBlob(resolve, 'image/webp', 0.9));
  if (!blob) throw new Error('Не удалось подготовить картинку.');
  const type = blob.type === 'image/webp' ? 'image/webp' : 'image/png';
  return new File([blob], `sticker.${type === 'image/webp' ? 'webp' : 'png'}`, { type });
}

const stickerImg = (s) => el('img', { src: mediaUrl(s.url), alt: 'Стикер', loading: 'lazy', draggable: 'false' });

/** Долгое нажатие (touch / мышь) + контекстное меню; после срабатывания гасим «клик» следом. */
function bindPress(node, { onTap, onLong }) {
  let timer = null, sx = 0, sy = 0, fired = false;
  const cancel = () => { clearTimeout(timer); timer = null; };
  node.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    sx = e.clientX; sy = e.clientY; fired = false;
    timer = setTimeout(() => { timer = null; fired = true; haptic.tap(); onLong(); }, LONG_MS);
  });
  node.addEventListener('pointermove', (e) => { if (timer && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) cancel(); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => node.addEventListener(t, cancel));
  node.addEventListener('click', (e) => { if (fired) { fired = false; e.preventDefault(); return; } onTap(); });
  node.addEventListener('contextmenu', (e) => { e.preventDefault(); cancel(); if (!fired) { fired = true; onLong(); } });
}

/** Крупный план стикера с действиями (не на весь экран). ctx: {inRecent, isFav, own, onChange} */
function showStickerPreview(s, ctx = {}) {
  const close = () => box.remove();
  const act = (label, ic, fn, danger) => el('button', { type: 'button', class: `menu__action${danger ? ' is-danger' : ''}`, onclick: async () => { close(); try { await fn(); } catch (e) { toast(e.message || 'Не удалось выполнить действие.'); } ctx.onChange?.(); } },
    icon(ic), el('span', { text: label }));
  const box = el('div', { class: 'sticker-preview', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Стикер' },
    el('div', { class: 'sticker-preview__backdrop', onclick: close }),
    el('div', { class: 'sticker-preview__card' },
      el('img', { class: 'sticker-preview__img', src: mediaUrl(s.url), alt: 'Стикер' }),
      el('div', { class: 'menu__list' },
        ctx.inRecent ? act('Убрать из недавних', 'i-close', () => api.removeRecentSticker(s.id)) : null,
        act(ctx.isFav ? 'Удалить из избранного' : 'Добавить в избранное', 'i-star', () => api.setFavorite(s.id, !ctx.isFav)),
        act('Сохранить в галерею', 'i-download', () => saveToGallery({ url: s.url })),
        ctx.own ? act('Удалить из стикерпака', 'i-trash', () => api.deleteSticker(s.id), true) : null)));
  box.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  document.body.append(box);
  box.querySelector('button')?.focus();
}

/** Окно стикерпака из чата: название, все стикеры, кнопка «Добавить стикерпак себе». */
async function openPackViewer(packId, { onChange } = {}) {
  const grid = $('#pack-grid'), btn = $('#pack-add'), title = $('#pack-title');
  grid.replaceChildren(); title.textContent = 'Стикерпак'; btn.hidden = true;
  openModal('modal-pack');
  try {
    const pack = await api.getPack(packId);
    title.textContent = pack.title;
    grid.replaceChildren(...pack.stickers.map((s) => el('button', { type: 'button', class: 'pack-grid__item', 'aria-label': 'Стикер',
      onclick: () => showStickerPreview(s, { isFav: false, inRecent: false, own: false, onChange }) }, stickerImg(s))));
    btn.hidden = false;
    const paint = (added) => {
      btn.disabled = pack.own;
      btn.textContent = pack.own ? 'Это ваш стикерпак' : added ? 'Убрать стикерпак' : 'Добавить стикерпак себе';
      btn.classList.toggle('btn--primary', !added && !pack.own); btn.classList.toggle('btn--ghost', added);
    };
    let added = pack.added; paint(added);
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        if (added) { await api.deletePack(pack.id); added = false; toast('Стикерпак убран.'); }
        else { await api.addPack(pack.id); added = true; toast('Стикерпак добавлен.'); }
        onChange?.();
      } catch (e) { toast(e.message || 'Не удалось.'); }
      btn.disabled = false; paint(added);
    };
  } catch (e) { toast(e.message || 'Не удалось открыть стикерпак.'); closeModal('modal-pack'); }
}

/** @param {{feed:HTMLElement, packsBar:HTMLElement, onSend:(sticker)=>void}} cfg */
function initStickers({ feed, packsBar, onSend }) {
  let lib = { packs: [], recent: [], favorites: [] };
  const picker = document.createElement('input');
  picker.type = 'file'; picker.accept = 'image/*'; picker.multiple = true; picker.hidden = true;
  document.body.append(picker);
  let pickFor = null;

  const favIds = () => new Set(lib.favorites.map((s) => s.id));
  const recentIds = () => new Set(lib.recent.map((s) => s.id));

  function tile(s, packOwn) {
    const b = el('button', { type: 'button', class: 'picker__sticker', 'aria-label': 'Стикер', dataset: { id: s.id } }, stickerImg(s));
    bindPress(b, {
      onTap: () => onSend(s),
      onLong: () => showStickerPreview(s, { inRecent: recentIds().has(s.id), isFav: favIds().has(s.id), own: Boolean(packOwn), onChange: load }),
    });
    return b;
  }
  const section = (id, title, children, extra) => el('section', { class: 'sticker-sec', dataset: { sec: id } },
    el('header', { class: 'sticker-sec__head' }, el('h4', { text: title }), extra || null),
    el('div', { class: 'sticker-sec__grid' }, children));

  async function addFiles(packId, files) {
    for (const f of files) {
      try {
        const media = await api.uploadMedia(await prepareStickerFile(f));
        await api.addSticker(packId, media.id);
      } catch (e) { toast(e.message || 'Не удалось добавить стикер.'); }
    }
    await load();
  }
  picker.addEventListener('change', () => { const files = [...picker.files]; picker.value = ''; if (pickFor && files.length) addFiles(pickFor, files); });

  function packSection(p) {
    const head = el('div', { class: 'sticker-sec__tools' });
    if (p.own) {
      head.append(
        el('button', { type: 'button', class: 'btn-icon btn-icon--sm', 'aria-label': 'Переименовать', onclick: async () => {
          const t = await askText({ title: 'Название стикерпака', value: p.title }); if (t) { await api.renamePack(p.id, t).catch((e) => toast(e.message)); load(); }
        } }, icon('i-edit')));
    }
    let armed = null;
    const del = el('button', { type: 'button', class: 'btn-icon btn-icon--sm', 'aria-label': p.own ? 'Удалить стикерпак' : 'Убрать стикерпак', onclick: async () => {
      if (!armed) { del.classList.add('is-armed'); toast(p.own ? 'Нажмите ещё раз, чтобы удалить пак со стикерами.' : 'Нажмите ещё раз, чтобы убрать пак.'); armed = setTimeout(() => { armed = null; del.classList.remove('is-armed'); }, 3000); return; }
      clearTimeout(armed); await api.deletePack(p.id).catch((e) => toast(e.message)); load();
    } }, icon('i-trash'));
    head.append(del);
    const items = p.stickers.map((s) => tile(s, p.own));
    if (p.own) items.push(el('button', { type: 'button', class: 'picker__sticker picker__sticker--add', 'aria-label': 'Добавить стикер', onclick: () => { pickFor = p.id; picker.click(); } }, icon('i-plus')));
    const sec = section(`pack-${p.id}`, p.title, items, head);
    if (!p.stickers.length && !p.own) sec.append(el('p', { class: 'picker__note', text: 'В этом паке пока нет стикеров.' }));
    return sec;
  }

  function jump(sec) {
    const node = feed.querySelector(`[data-sec="${sec}"]`);
    if (node) feed.scrollTo({ top: node.offsetTop - feed.offsetTop, behavior: 'smooth' });
  }

  function render() {
    const parts = [];
    if (lib.favorites.length) parts.push(section('fav', 'Избранные', lib.favorites.map((s) => tile(s, false))));
    if (lib.recent.length) parts.push(section('recent', 'Недавние', lib.recent.map((s) => tile(s, false))));
    for (const p of lib.packs) parts.push(packSection(p));
    if (!parts.length) parts.push(el('p', { class: 'picker__note', text: 'Здесь пока пусто. Нажмите «+» внизу, чтобы создать свой стикерпак и добавить в него стикеры.' }));
    feed.replaceChildren(...parts);

    // Нижняя полоса: сначала паки (превью — первый стикер), «+» — создать
    const btns = [];
    if (lib.favorites.length) btns.push(el('button', { type: 'button', class: 'picker__cat', title: 'Избранные', 'aria-label': 'Избранные', onclick: () => jump('fav') }, icon('i-star')));
    if (lib.recent.length) btns.push(el('button', { type: 'button', class: 'picker__cat', title: 'Недавние', 'aria-label': 'Недавние', onclick: () => jump('recent') }, '🕘'));
    for (const p of lib.packs) {
      btns.push(el('button', { type: 'button', class: 'picker__cat picker__cat--pack', title: p.title, 'aria-label': p.title, dataset: { pack: p.id }, onclick: () => jump(`pack-${p.id}`) },
        p.preview ? stickerImg(p.preview) : el('span', { text: p.title.slice(0, 1).toUpperCase() })));
    }
    btns.push(el('button', { type: 'button', class: 'picker__cat picker__cat--new', id: 'sticker-new', title: 'Создать стикерпак', 'aria-label': 'Создать стикерпак', onclick: createPack }, icon('i-plus')));
    packsBar.replaceChildren(...btns);
  }

  async function createPack() {
    const title = await askText({ title: 'Новый стикерпак', placeholder: 'Название', ok: 'Создать' });
    if (!title) return;
    try { const p = await api.createPack(title); await load(); jump(`pack-${p.id}`); toast('Стикерпак создан — добавьте в него стикеры кнопкой «+».'); }
    catch (e) { toast(e.message || 'Не удалось создать стикерпак.'); }
  }

  async function load() {
    try { lib = await api.stickerLibrary(); } catch (e) { toast(e.message || 'Не удалось загрузить стикеры.'); }
    const top = feed.scrollTop;
    render();
    feed.scrollTop = top;
  }
  return { load };
}

  return { showStickerPreview, openPackViewer, initStickers };
})();

__m["ui/picker.js"] = (function () {
  const { $, el, icon } = __m["dom.js"];
  const { api, gifProxyUrl, mediaUrl } = __m["api.js"];
  const { storage } = __m["storage.js"];
  const { EMOJI } = __m["emoji-data.js"];
  const { initStickers } = __m["ui/stickers.js"];
/* Панель «Смайлики / Стикеры / GIF» над полем ввода. Выбранная вкладка запоминается и меняет значок кнопки. */






const TAB_KEY = 'aqua.picker.tab';
const RECENT_KEY = 'aqua.emoji.recent';
const RECENT_MAX = 24;
const TABS = ['emoji', 'stickers', 'gif'];

function initPicker({ onEmoji, onGif, onSticker, onTabChange, onToggle }) {
  const panel = $('#picker');
  const tabs = [...panel.querySelectorAll('.picker__tab')];
  const panes = { emoji: $('#picker-emoji'), stickers: $('#picker-stickers'), gif: $('#picker-gif') };
  const cats = $('#emoji-cats'), grid = $('#emoji-grid'), emojiSearch = $('#emoji-search');
  const gifGrid = $('#gif-grid'), gifNote = $('#gif-note'), gifSearch = $('#gif-search');

  const saved = storage.get(TAB_KEY);
  let tab = TABS.includes(saved) ? saved : 'emoji';
  let gifState = { q: '', next: 0, loading: false, enabled: null, seq: 0 };

  /* ---------- Смайлики: одна лента со всеми категориями, вкладки-категории прокручивают к разделу ---------- */
  const recent = () => { try { return JSON.parse(storage.get(RECENT_KEY) || '[]'); } catch { return []; } };
  function pushRecent(e) { storage.set(RECENT_KEY, JSON.stringify([e, ...recent().filter((x) => x !== e)].slice(0, RECENT_MAX))); }

  const emojiBtn = (e, name) => el('button', { type: 'button', class: 'picker__emoji', text: e, 'aria-label': name || e });
  const catBtn = (c) => el('button', { type: 'button', class: 'picker__cat', text: c.icon, title: c.title, 'aria-label': c.title, 'aria-pressed': 'false', dataset: { cat: c.id } });
  let built = false;

  function buildEmoji() {
    const list = [{ id: 'recent', icon: '🕘', title: 'Недавние' }, ...EMOJI];
    cats.replaceChildren(...list.map(catBtn));
    const secs = [el('section', { class: 'emoji-sec', dataset: { sec: 'recent' } }, el('h4', { text: 'Недавние' }), el('div', { class: 'emoji-sec__grid', id: 'emoji-recent' }))];
    for (const c of EMOJI) {
      secs.push(el('section', { class: 'emoji-sec', dataset: { sec: c.id } }, el('h4', { text: c.title }),
        el('div', { class: 'emoji-sec__grid' }, c.items.map((it) => emojiBtn(it.e, it.n)))));
    }
    grid.replaceChildren(...secs);
    built = true;
  }
  function paintRecent() {
    const box = $('#emoji-recent'), r = recent();
    box.parentElement.hidden = !r.length;
    box.replaceChildren(...r.map((e) => emojiBtn(e)));
  }
  function setActiveCat(id) { cats.querySelectorAll('.picker__cat').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cat === id))); }
  function jumpToCat(id) {
    const sec = grid.querySelector(`[data-sec="${id}"]`);
    if (sec && !sec.hidden) grid.scrollTo({ top: sec.offsetTop - grid.offsetTop });
    setActiveCat(id);
  }
  function spy() {
    if (emojiSearch.value) return;
    const top = grid.scrollTop + 8;
    let cur = 'recent';
    for (const s of grid.querySelectorAll('.emoji-sec')) { if (!s.hidden && s.offsetTop - grid.offsetTop <= top) cur = s.dataset.sec; }
    setActiveCat(cur);
    const b = cats.querySelector(`[data-cat="${cur}"]`);
    if (b) cats.scrollTo({ left: b.offsetLeft - cats.clientWidth / 2 + b.clientWidth / 2 });
  }
  function searchEmoji() {
    const q = emojiSearch.value.trim().toLowerCase();
    for (const sec of grid.querySelectorAll('.emoji-sec')) {
      if (sec.dataset.sec === 'recent') { sec.hidden = Boolean(q) || !recent().length; continue; }
      const cat = EMOJI.find((c) => c.id === sec.dataset.sec);
      const btns = sec.querySelectorAll('.picker__emoji');
      let any = false;
      cat.items.forEach((it, i) => { const ok = !q || it.n.toLowerCase().includes(q) || it.e === q; btns[i].hidden = !ok; any ||= ok; });
      sec.hidden = !any;
    }
    grid.scrollTop = 0;
  }
  cats.addEventListener('click', (e) => {
    const b = e.target.closest('.picker__cat'); if (!b) return;
    if (b.dataset.cat === 'recent') paintRecent();          // обновляем недавние только по запросу — чтобы лента не «прыгала» под пальцем
    if (emojiSearch.value) { emojiSearch.value = ''; searchEmoji(); }
    jumpToCat(b.dataset.cat);
  });
  grid.addEventListener('click', (e) => {
    const b = e.target.closest('.picker__emoji'); if (!b) return;
    pushRecent(b.textContent); onEmoji(b.textContent);
  });
  grid.addEventListener('scroll', spy, { passive: true });
  emojiSearch.addEventListener('input', () => { clearTimeout(emojiSearch._t); emojiSearch._t = setTimeout(searchEmoji, 120); });
  function showEmoji() {
    if (!built) buildEmoji();
    paintRecent();
    if (!emojiSearch.value) { requestAnimationFrame(() => { grid.scrollTop = 0; setActiveCat(recent().length ? 'recent' : 'smileys'); if (!recent().length) jumpToCat('smileys'); }); }
  }

  /* ---------- Стикеры ---------- */
  const stickers = initStickers({ feed: $('#sticker-feed'), packsBar: $('#sticker-packs'), onSend: (s) => onSticker(s) });

  /* ---------- GIF: по умолчанию «Сохранённые» (лента вертикальная), поиск — по интернету ---------- */
  function note(text) { gifNote.textContent = text || ''; gifNote.hidden = !text; }

  const gifMedia = (m) => (m.kind === 'video'
    ? el('video', { src: mediaUrl(m.url), muted: true, loop: true, autoplay: true, playsinline: true, preload: 'metadata' })
    : el('img', { src: mediaUrl(m.url), alt: 'GIF', loading: 'lazy', decoding: 'async' }));
  // Атрибут muted не всегда превращается в свойство — без этого автозапуск в браузерах блокируется
  const forceMuted = (v) => { if (v.tagName === 'VIDEO') { v.muted = true; v.play?.().catch(() => {}); } return v; };

  async function loadSaved() {
    const seq = ++gifState.seq; gifGrid.replaceChildren(); note(''); gifGrid.classList.add('is-saved');
    try {
      const items = await api.savedGifs();
      if (seq !== gifState.seq) return;
      if (!items.length) { note('Здесь будут все GIF, которые вы отправили или сохранили. Найдите GIF через поиск выше.'); return; }
      for (const m of items) gifGrid.append(savedTile(m));
    } catch (e) { if (seq === gifState.seq) note(e.message || 'Не удалось загрузить GIF.'); }
  }
  function savedTile(m) {
    const b = el('div', { class: 'picker__gif picker__gif--saved', role: 'button', tabindex: '0', title: 'GIF' }, forceMuted(gifMedia(m)),
      el('button', { type: 'button', class: 'picker__gif-del', 'aria-label': 'Убрать из сохранённых', onclick: async (e) => {
        e.stopPropagation(); await api.unsaveGif(m.id).catch(() => {}); b.remove(); if (!gifGrid.children.length) loadSaved();
      } }, icon('i-close')));
    const send = () => onGif({ saved: m });
    b.addEventListener('click', send);
    b.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
    return b;
  }

  async function loadGifs(reset) {
    const g = gifState;
    if (!g.q) { if (reset) loadSaved(); return; }
    if (g.loading && !reset) return;
    if (reset) { g.next = 0; g.seq++; gifGrid.classList.remove('is-saved'); gifGrid.replaceChildren(); gifGrid.scrollTop = 0; note(''); }
    if (g.next === null) return;
    const seq = g.seq; g.loading = true;
    try {
      if (g.enabled === null) g.enabled = (await api.gifStatus()).enabled;
      if (!g.enabled) { note('GIF-поиск не настроен: администратору нужно задать KLIPY_API_KEY или GIPHY_API_KEY на сервере.'); return; }
      const res = await api.gifSearch(g.q, g.next ?? 0);
      if (seq !== g.seq) return;                       // ответ на устаревший запрос
      for (const it of res.items) gifGrid.append(gifTile(it));
      g.next = res.next;
      if (!gifGrid.children.length) note('Ничего не найдено.');
    } catch (e) {
      if (seq === g.seq) note(e.message || 'Не удалось загрузить GIF.');
    } finally {
      if (seq === g.seq) {
        g.loading = false;
        // Если лента не заполнила панель, прокрутки не будет — догружаем сами
        requestAnimationFrame(() => { if (!panel.hidden && g.q && g.next !== null && gifGrid.scrollHeight <= gifGrid.clientHeight + 200) loadGifs(false); });
      }
    }
  }
  function gifTile(it) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'picker__gif'; b.title = it.title || 'GIF';
    b.style.aspectRatio = `${it.w} / ${it.h}`;
    const img = document.createElement('img');
    img.src = gifProxyUrl(it.preview); img.alt = it.title || 'GIF'; img.loading = 'lazy'; img.decoding = 'async';
    b.append(img);
    b.addEventListener('click', () => { b.disabled = true; Promise.resolve(onGif(it)).finally(() => { b.disabled = false; }); });
    return b;
  }
  gifSearch.addEventListener('input', () => {
    clearTimeout(gifSearch._t);
    gifSearch._t = setTimeout(() => { gifState.q = gifSearch.value.trim(); loadGifs(true); }, 350);
  });
  gifGrid.addEventListener('scroll', () => {
    if (gifState.q && gifGrid.scrollTop + gifGrid.clientHeight > gifGrid.scrollHeight - 200) loadGifs(false);
  });

  /* ---------- Вкладки ---------- */
  function setTab(next, { save = true } = {}) {
    tab = next;
    if (save) storage.set(TAB_KEY, tab);
    tabs.forEach((t) => { const on = t.dataset.tab === tab; t.setAttribute('aria-selected', String(on)); t.classList.toggle('is-active', on); });
    for (const k of TABS) panes[k].hidden = tab !== k;
    if (tab === 'emoji') showEmoji();
    else if (tab === 'stickers') stickers.load();
    else { gifState.q = gifSearch.value.trim(); loadGifs(true); }
    onTabChange(tab);
  }
  tabs.forEach((t) => t.addEventListener('click', () => setTab(t.dataset.tab)));

  const open = () => { panel.hidden = false; setTab(tab, { save: false }); onToggle(true); };
  const close = () => { panel.hidden = true; onToggle(false); };
  $('#picker-close').addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) close(); });

  onTabChange(tab);                                    // значок кнопки сразу соответствует сохранённому выбору
  return { toggle: () => (panel.hidden ? open() : close()), close, isOpen: () => !panel.hidden, tab: () => tab, reloadStickers: () => stickers.load() };
}

  return { initPicker };
})();

__m["editor/image-ops.js"] = (function () {

/* Операции над изображением на HTML5 Canvas. Без DOM-состояния: функции принимают и возвращают canvas.
   Фильтры сделаны попиксельно (getImageData), а не через ctx.filter — он не работает в части версий Safari,
   а так результат одинаков во всех браузерах. */

const MAX_DIM = 1920;      // дольше стороны не храним: экономит память и трафик (особенно на телефонах)

const FILTERS = [
  { id: 'none',  label: 'Оригинал' },
  { id: 'mono',  label: 'Ч/Б' },
  { id: 'sepia', label: 'Сепия' },
  { id: 'vivid', label: 'Яркий' },
  { id: 'cool',  label: 'Холод' },
  { id: 'warm',  label: 'Тепло' },
  { id: 'fade',  label: 'Блёклый' },
];

const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Попиксельные формулы. Каждая получает (r, g, b) и возвращает массив [r, g, b]. */
const PIXEL = {
  mono:  (r, g, b) => { const y = 0.299 * r + 0.587 * g + 0.114 * b; return [y, y, y]; },
  sepia: (r, g, b) => [0.393 * r + 0.769 * g + 0.189 * b, 0.349 * r + 0.686 * g + 0.168 * b, 0.272 * r + 0.534 * g + 0.131 * b],
  vivid: (r, g, b) => {                                   // насыщенность ×1.35 и контраст ×1.1
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const s = (c) => (y + (c - y) * 1.35 - 128) * 1.1 + 128;
    return [s(r), s(g), s(b)];
  },
  cool:  (r, g, b) => [r * 0.9, g * 1.0, b * 1.15 + 6],   // сдвиг в бирюзово-синий — цвет Aqua
  warm:  (r, g, b) => [r * 1.1 + 6, g * 1.02, b * 0.88],
  fade:  (r, g, b) => [(r - 128) * 0.82 + 142, (g - 128) * 0.82 + 142, (b - 128) * 0.82 + 146],
};

/** Применяет фильтр к canvas «на месте». */
function applyFilter(canvas, id) {
  const fn = PIXEL[id];
  if (!fn) return;
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const [r, g, b] = fn(d[i], d[i + 1], d[i + 2]);
    d[i] = clamp(r); d[i + 1] = clamp(g); d[i + 2] = clamp(b);
  }
  ctx.putImageData(img, 0, 0);
}

function newCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function cloneCanvas(src) {
  const c = newCanvas(src.width, src.height);
  c.getContext('2d').drawImage(src, 0, 0);
  return c;
}

/** Загружает File/Blob в canvas, уменьшая до MAX_DIM. EXIF-поворот учитывает createImageBitmap. */
async function loadImageToCanvas(file) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { bmp = await createImageBitmap(file); }
  const k = Math.min(1, MAX_DIM / Math.max(bmp.width, bmp.height));
  const c = newCanvas(bmp.width * k, bmp.height * k);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return c;
}

/** Поворот на 90° по часовой стрелке. */
function rotate90(src) {
  const c = newCanvas(src.height, src.width);
  const ctx = c.getContext('2d');
  ctx.translate(c.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(src, 0, 0);
  return c;
}

/** Обрезка по прямоугольнику {x, y, w, h} в координатах src. */
function cropCanvas(src, { x, y, w, h }) {
  const c = newCanvas(w, h);
  c.getContext('2d').drawImage(src, Math.round(x), Math.round(y), Math.round(w), Math.round(h), 0, 0, c.width, c.height);
  return c;
}

/** Рисует текст с тёмной обводкой (читается на любом фоне). (x, y) — левый край, середина строки. */
function drawText(canvas, text, x, y, { color = '#ffffff', size = 48 } = {}) {
  const ctx = canvas.getContext('2d');
  ctx.font = `700 ${size}px -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, size / 7);
  ctx.strokeStyle = 'rgba(0, 20, 40, .55)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/** Итог: JPEG-файл с применённым фильтром (под прозрачные PNG подкладывается белый фон). */
function exportJpeg(work, filterId, quality = 0.9) {
  const out = newCanvas(work.width, work.height);
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(work, 0, 0);
  applyFilter(out, filterId);
  return new Promise((resolve, reject) =>
    out.toBlob((b) => (b ? resolve(new File([b], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' })) : reject(new Error('Не удалось сохранить изображение.'))), 'image/jpeg', quality));
}

  return { MAX_DIM, FILTERS, applyFilter, newCanvas, cloneCanvas, loadImageToCanvas, rotate90, cropCanvas, drawText, exportJpeg };
})();

__m["editor/photo-editor.js"] = (function () {
  const { el, icon } = __m["dom.js"];
  const { FILTERS, loadImageToCanvas, cloneCanvas, rotate90, cropCanvas, drawText, exportJpeg, applyFilter, newCanvas } = __m["editor/image-ops.js"];
/* Редактор фото: кадрирование, поворот, кисть, текст, фильтры. Рабочее изображение — canvas `work`
   (правки применяются к нему); на экране показывается уменьшенная копия с фильтром.
   Недавние состояния хранятся для «Отменить» (UNDO_LIMIT штук — каждое весит как само изображение). */



const UNDO_LIMIT = 5;
const COLORS = ['#ffffff', '#111111', '#e5484d', '#f5a524', '#2fb344', '#1290bf'];
const BRUSH_SIZES = [{ label: 'S', k: 0.006 }, { label: 'M', k: 0.012 }, { label: 'L', k: 0.024 }];
const ASPECTS = [{ label: 'Свободно', v: null }, { label: '1:1', v: 1 }, { label: '4:3', v: 4 / 3 }, { label: '16:9', v: 16 / 9 }];
const TOOLS = [
  { id: 'crop', label: 'Обрезать', icon: 'i-crop' },
  { id: 'rotate', label: 'Повернуть', icon: 'i-rotate' },
  { id: 'brush', label: 'Кисть', icon: 'i-brush' },
  { id: 'text', label: 'Текст', icon: 'i-text' },
  { id: 'filter', label: 'Фильтры', icon: 'i-photo' },
];

/** @param {{stage:HTMLElement, canvas:HTMLCanvasElement, cropBox:HTMLElement, textInput:HTMLInputElement, tools:HTMLElement}} ui */
function createPhotoEditor({ stage, canvas, cropBox, textInput, tools, mask = null, zoomInput = null }) {
  const ctx = canvas.getContext('2d');
  let work = null;
  let undo = [];
  let tool = null;
  let filter = 'none';
  let color = COLORS[0];
  let brushK = BRUSH_SIZES[1].k;
  let aspect = null;
  let crop = null;                  // {x, y, w, h} в координатах отображаемого canvas
  let onUndoChange = () => {};

  /* ---------- Режим аватарки: круглая маска, фото двигается и масштабируется ---------- */
  let avatarMode = false;
  const av = { z: 1, tx: 0, ty: 0 };            // z — масштаб относительно «покрыть маску», tx/ty — сдвиг в px экрана
  const maskSize = () => Math.round(Math.min(stage.clientWidth, stage.clientHeight) * 0.86);
  const zMin = () => maskSize() / Math.max(1, Math.min(canvas.width, canvas.height));   // минимум: фото полностью закрывает маску
  function layoutAvatar(reset = false) {
    if (!avatarMode || !work) return;
    const S = maskSize();
    Object.assign(mask.style, { width: `${S}px`, height: `${S}px` });
    const zm = zMin();
    if (reset) { av.z = zm; av.tx = av.ty = 0; }
    av.z = Math.min(Math.max(av.z, zm), zm * 6);
    const maxX = Math.max(0, (canvas.width * av.z - S) / 2), maxY = Math.max(0, (canvas.height * av.z - S) / 2);
    av.tx = Math.min(Math.max(av.tx, -maxX), maxX); av.ty = Math.min(Math.max(av.ty, -maxY), maxY);
    canvas.style.transform = `translate(${av.tx}px, ${av.ty}px) scale(${av.z})`;
    if (zoomInput) zoomInput.value = String(av.z / zm);
  }
  const pts = new Map();
  let g = null;                                    // состояние жеста
  const gestureActive = () => avatarMode && tool !== 'brush' && tool !== 'text';
  stage.addEventListener('pointerdown', (e) => {
    if (!gestureActive() || e.target === zoomInput) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { stage.setPointerCapture(e.pointerId); } catch { /* синтетические события без активного указателя */ }
    g = { tx: av.tx, ty: av.ty, z: av.z, pts: [...pts.values()].map((p) => ({ ...p })) };
    e.preventDefault();
  });
  stage.addEventListener('pointermove', (e) => {
    if (!g || !pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const cur = [...pts.values()];
    if (cur.length >= 2 && g.pts.length >= 2) {
      const d0 = Math.hypot(g.pts[0].x - g.pts[1].x, g.pts[0].y - g.pts[1].y) || 1;
      const d1 = Math.hypot(cur[0].x - cur[1].x, cur[0].y - cur[1].y);
      av.z = g.z * (d1 / d0);
      av.tx = g.tx + ((cur[0].x + cur[1].x) - (g.pts[0].x + g.pts[1].x)) / 2;
      av.ty = g.ty + ((cur[0].y + cur[1].y) - (g.pts[0].y + g.pts[1].y)) / 2;
    } else if (cur.length === 1) {
      av.tx = g.tx + cur[0].x - g.pts[0].x; av.ty = g.ty + cur[0].y - g.pts[0].y;
    }
    layoutAvatar();
  });
  const endGesture = (e) => {
    pts.delete(e.pointerId);
    g = pts.size ? { tx: av.tx, ty: av.ty, z: av.z, pts: [...pts.values()].map((p) => ({ ...p })) } : null;
  };
  stage.addEventListener('pointerup', endGesture); stage.addEventListener('pointercancel', endGesture);
  stage.addEventListener('wheel', (e) => {
    if (!gestureActive()) return;
    e.preventDefault(); av.z *= Math.exp(-e.deltaY * 0.0015); layoutAvatar();
  }, { passive: false });
  zoomInput?.addEventListener('input', () => { av.z = zMin() * Number(zoomInput.value); layoutAvatar(); });

  /* ---------- Отрисовка ---------- */
  function render() {
    if (!work) return;
    const maxW = stage.clientWidth, maxH = stage.clientHeight;
    const k = Math.min(maxW / work.width, maxH / work.height, 1);
    canvas.width = Math.max(1, Math.round(work.width * k));
    canvas.height = Math.max(1, Math.round(work.height * k));
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(work, 0, 0, canvas.width, canvas.height);
    if (filter !== 'none') applyFilter(canvas, filter);
    if (tool === 'crop') layoutCrop();
    layoutAvatar();
  }

  const toWork = (clientX, clientY) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((clientX - r.left) * work.width) / r.width, y: ((clientY - r.top) * work.height) / r.height, k: work.width / r.width };
  };

  function snapshot() {
    undo.push(cloneCanvas(work));
    if (undo.length > UNDO_LIMIT) undo.shift();
    onUndoChange(undo.length > 0);
  }

  /* ---------- Кадрирование ---------- */
  function layoutCrop() {
    if (!crop) {
      const w = canvas.width * 0.9, h = canvas.height * 0.9;
      crop = { x: (canvas.width - w) / 2, y: (canvas.height - h) / 2, w, h };
      if (aspect) fitAspect('se');
    }
    const off = { x: canvas.offsetLeft, y: canvas.offsetTop };
    Object.assign(cropBox.style, {
      left: `${off.x + crop.x}px`, top: `${off.y + crop.y}px`, width: `${crop.w}px`, height: `${crop.h}px`,
    });
  }

  /** Подгоняет рамку под выбранные пропорции, сохраняя противоположный угол/центр. */
  function fitAspect(handle) {
    if (!aspect || !crop) return;
    let w = crop.w, h = w / aspect;
    if (h > canvas.height) { h = canvas.height; w = h * aspect; }
    if (w > canvas.width) { w = canvas.width; h = w / aspect; }
    const cx = crop.x + crop.w / 2, cy = crop.y + crop.h / 2;
    crop.w = w; crop.h = h;
    crop.x = Math.min(Math.max(0, handle === 'nw' || handle === 'sw' ? crop.x + (crop.w - w) : cx - w / 2), canvas.width - w);
    crop.y = Math.min(Math.max(0, cy - h / 2), canvas.height - h);
  }

  let drag = null;
  cropBox.addEventListener('pointerdown', (e) => {
    const handle = e.target.dataset?.h || 'move';
    drag = { handle, sx: e.clientX, sy: e.clientY, start: { ...crop } };
    cropBox.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  cropBox.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy, s = drag.start, MIN = 40;
    const W = canvas.width, H = canvas.height;
    if (drag.handle === 'move') {
      crop.x = Math.min(Math.max(0, s.x + dx), W - s.w);
      crop.y = Math.min(Math.max(0, s.y + dy), H - s.h);
    } else {
      let x1 = s.x, y1 = s.y, x2 = s.x + s.w, y2 = s.y + s.h;
      if (drag.handle.includes('w')) x1 = Math.min(Math.max(0, s.x + dx), x2 - MIN);
      if (drag.handle.includes('e')) x2 = Math.max(Math.min(W, s.x + s.w + dx), x1 + MIN);
      if (drag.handle.includes('n')) y1 = Math.min(Math.max(0, s.y + dy), y2 - MIN);
      if (drag.handle.includes('s')) y2 = Math.max(Math.min(H, s.y + s.h + dy), y1 + MIN);
      if (aspect) {                                   // ширина главная, высота подстраивается
        const w = x2 - x1;
        const h = w / aspect;
        if (drag.handle.includes('n')) y1 = y2 - h; else y2 = y1 + h;
        if (y1 < 0 || y2 > H) { return; }
      }
      crop = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    }
    layoutCrop();
  });
  const endDrag = () => { drag = null; };
  cropBox.addEventListener('pointerup', endDrag);
  cropBox.addEventListener('pointercancel', endDrag);

  function applyCrop() {
    if (!crop) return;
    const k = work.width / canvas.width;
    snapshot();
    work = cropCanvas(work, { x: crop.x * k, y: crop.y * k, w: crop.w * k, h: crop.h * k });
    crop = null;
    setTool(null);
  }

  /* ---------- Кисть ---------- */
  let stroke = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (tool === 'brush') {
      snapshot();
      const p = toWork(e.clientX, e.clientY);
      stroke = { last: p };
      canvas.setPointerCapture(e.pointerId);
      drawSegment(p, p);
      e.preventDefault();
    } else if (tool === 'text') {
      placeTextInput(e);
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!stroke) return;
    const p = toWork(e.clientX, e.clientY);
    drawSegment(stroke.last, p);
    stroke.last = p;
  });
  const endStroke = () => { if (stroke) { stroke = null; render(); } };   // полная перерисовка с фильтром
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);

  function drawSegment(a, b) {
    const w = brushK * work.width;
    for (const [c, scale] of [[work.getContext('2d'), 1], [ctx, canvas.width / work.width]]) {
      c.strokeStyle = color; c.lineWidth = w * scale; c.lineCap = c.lineJoin = 'round';
      c.beginPath(); c.moveTo(a.x * scale, a.y * scale); c.lineTo(b.x * scale + 0.01, b.y * scale); c.stroke();
    }
  }

  /* ---------- Текст ---------- */
  let textAt = null;
  function placeTextInput(e) {
    commitText();
    textAt = toWork(e.clientX, e.clientY);
    const r = stage.getBoundingClientRect();
    Object.assign(textInput.style, { left: `${e.clientX - r.left}px`, top: `${e.clientY - r.top}px`, color });
    textInput.value = '';
    textInput.hidden = false;
    setTimeout(() => textInput.focus(), 0);
    e.preventDefault();
  }
  function commitText() {
    const value = textInput.value.trim();
    if (!textInput.hidden && value && textAt) {
      snapshot();
      drawText(work, value, textAt.x, textAt.y, { color, size: Math.round(work.width * 0.06) });
      render();
    }
    textInput.hidden = true; textInput.value = ''; textAt = null;
  }
  textInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commitText(); } if (e.key === 'Escape') { e.stopPropagation(); textInput.hidden = true; } });
  textInput.addEventListener('blur', commitText);

  /* ---------- Панель инструментов ---------- */
  const sub = el('div', { class: 'editor__sub' });
  const toolButtons = new Map();

  function chips(items, current, onPick, cls = '') {
    return items.map((it) => el('button', {
      class: `chip${current(it) ? ' is-active' : ''} ${cls}`, type: 'button', onclick: () => { onPick(it); renderSub(); },
    }, it.label));
  }
  function swatches() {
    return el('div', { class: 'swatches' }, COLORS.map((c) => el('button', {
      class: `swatch${c === color ? ' is-active' : ''}`, type: 'button', style: `--c:${c}`, 'aria-label': `Цвет ${c}`,
      onclick: () => { color = c; textInput.style.color = c; renderSub(); },
    })));
  }

  function renderSub() {
    const nodes = {
      crop: () => [
        ...chips(ASPECTS, (a) => a.v === aspect, (a) => { aspect = a.v; fitAspect('se'); layoutCrop(); }),
        el('button', { class: 'btn btn--primary btn--sm', type: 'button', onclick: applyCrop }, icon('i-check', 'icon--white icon--sm'), 'Применить'),
      ],
      brush: () => [swatches(), ...chips(BRUSH_SIZES, (s) => s.k === brushK, (s) => { brushK = s.k; })],
      text: () => [swatches(), el('span', { class: 'editor__hint', text: 'Нажмите на фото, чтобы добавить надпись' })],
      filter: () => chips(FILTERS, (f) => f.id === filter, (f) => { filter = f.id; render(); }),
    }[tool];
    sub.replaceChildren(...(nodes ? nodes() : []));
    sub.hidden = !nodes;
    toolButtons.forEach((b, id) => b.classList.toggle('is-active', id === tool));
  }

  function setTool(next) {
    commitText();
    tool = next === tool ? null : next;
    cropBox.hidden = tool !== 'crop';
    if (tool !== 'crop') crop = null;
    canvas.style.cursor = tool === 'brush' ? 'crosshair' : tool === 'text' ? 'text' : '';
    stage.dataset.tool = tool ?? '';
    render();
    renderSub();
  }

  tools.replaceChildren(
    el('div', { class: 'editor__toolrow' }, TOOLS.map((t) => {
      const b = el('button', {
        class: 'icon-tile', type: 'button', dataset: { tool: t.id },
        onclick: () => {
          if (t.id === 'rotate') { snapshot(); work = rotate90(work); crop = null; render(); layoutAvatar(true); return; }
          setTool(t.id);
        },
      }, icon(t.icon, 'icon--lg'), t.label);
      toolButtons.set(t.id, b);
      return b;
    })),
    sub,
  );
  sub.hidden = true;

  window.addEventListener('resize', () => { if (work) { crop = null; render(); } });

  return {
    async load(file) {
      work = await loadImageToCanvas(file);
      undo = []; filter = 'none'; crop = null; tool = null;
      onUndoChange(false);
      setTool(null);
      render();
      layoutAvatar(true);
    },
    undo() {
      if (!undo.length) return;
      work = undo.pop(); crop = null;
      onUndoChange(undo.length > 0);
      render();
    },
    onUndoChange(fn) { onUndoChange = fn; },
    relayout: () => { crop = null; render(); },
    async export() {
      commitText();
      if (!avatarMode) return exportJpeg(work, filter);
      // Берём из рабочего изображения ровно то, что сейчас видно в круге
      const R = canvas.getBoundingClientRect(), M = mask.getBoundingClientRect();
      const f = R.width / work.width;
      const sw = M.width / f, sx = (M.left - R.left) / f, sy = (M.top - R.top) / f;
      const size = Math.max(256, Math.min(1024, Math.round(sw)));
      const sq = newCanvas(size, size), c = sq.getContext('2d');
      c.fillStyle = '#fff'; c.fillRect(0, 0, size, size);
      c.imageSmoothingQuality = 'high';
      c.drawImage(work, sx, sy, sw, sw, 0, 0, size, size);
      return exportJpeg(sq, filter);
    },
    /** Включает/выключает режим аватарки (круглая маска + перемещение и масштаб). */
    setAvatarMode(on) {
      avatarMode = on;
      canvas.style.transform = '';
      if (on) { setTool(null); render(); layoutAvatar(true); }
    },
    get size() { return work ? { w: work.width, h: work.height } : null; },
    destroy() { work = null; undo = []; textInput.hidden = true; },
  };
}

  return { createPhotoEditor };
})();

__m["editor/video-trim.js"] = (function () {

/* Обрезка видео в браузере без библиотек: воспроизводим выбранный отрезок в скрытом <video>,
   кадры рисуем в canvas, звук берём через Web Audio, всё пишем MediaRecorder-ом.
   Минусы подхода: идёт в реальном времени (отрезок 20 с обрабатывается ~20 с) и вкладку нельзя сворачивать. */

const MAX_SIDE = 1280;                       // итоговое видео не больше 1280 px по длинной стороне
const MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4',
];

const canTrim = () =>
  typeof window.MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function';

const pickMime = () => MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported?.(t)) ?? '';

const once = (target, ok, bad = 'error') => new Promise((resolve, reject) => {
  target.addEventListener(ok, resolve, { once: true });
  target.addEventListener(bad, () => reject(new Error('Не удалось прочитать видео.')), { once: true });
});

/**
 * @param {File} file
 * @param {number} start  секунды
 * @param {number} end    секунды
 * @param {{onProgress?:(ratio:number)=>void, signal?:AbortSignal}} opts
 * @returns {Promise<File>}
 */
async function trimVideo(file, start, end, { onProgress, signal, mute = false } = {}) {
  if (!canTrim()) throw new Error('Этот браузер не умеет обрезать видео.');
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.playsInline = true; v.preload = 'auto'; v.src = url;
  if (mute) v.muted = true;                                                    // «без звука» — дорожку звука не записываем вовсе
  let audioCtx = null, timer = null, recorder = null;

  const cleanup = () => {
    clearInterval(timer);
    v.pause();
    stream?.getTracks().forEach((t) => t.stop());
    audioCtx?.close?.().catch(() => {});
    URL.revokeObjectURL(url);
  };
  let stream = null;

  try {
    await once(v, 'loadedmetadata');
    const k = Math.min(1, MAX_SIDE / Math.max(v.videoWidth, v.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(2, Math.round((v.videoWidth * k) / 2) * 2);       // чётные размеры нужны кодекам
    canvas.height = Math.max(2, Math.round((v.videoHeight * k) / 2) * 2);
    const ctx = canvas.getContext('2d');

    stream = canvas.captureStream(30);
    if (!mute) try {                                                           // звук: через Web Audio, не в динамики
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const dest = audioCtx.createMediaStreamDestination();
      audioCtx.createMediaElementSource(v).connect(dest);
      dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    } catch { /* видео без звука — не страшно */ }

    const mime = pickMime();
    recorder = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 2_500_000 });
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const stopped = new Promise((resolve) => { recorder.onstop = resolve; });

    v.currentTime = start;
    await once(v, 'seeked');
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    recorder.start(250);
    try { await v.play(); } catch { throw new Error('Браузер не разрешил обработку видео. Попробуйте ещё раз.'); }

    await new Promise((resolve, reject) => {
      timer = setInterval(() => {
        if (signal?.aborted) { reject(new DOMException('Отменено', 'AbortError')); return; }
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        onProgress?.(Math.min(1, Math.max(0, (v.currentTime - start) / (end - start))));
        if (v.currentTime >= end || v.ended) resolve();
      }, 33);
    });
    clearInterval(timer);
    v.pause();
    recorder.stop();
    await stopped;

    const type = (recorder.mimeType || mime || 'video/webm').split(';')[0];
    const ext = type.includes('mp4') ? 'mp4' : 'webm';
    onProgress?.(1);
    return new File([new Blob(chunks, { type })], `video-${Date.now()}.${ext}`, { type });
  } catch (e) {
    if (recorder && recorder.state !== 'inactive') { try { recorder.stop(); } catch { /* уже остановлен */ } }
    throw e;
  } finally {
    cleanup();
  }
}

/** Кадр видео в момент t → JPEG-обложка (ширина до 640 px). */
async function captureCover(video, t) {
  if (Math.abs(video.currentTime - t) > 0.01) {
    video.currentTime = t;
    await once(video, 'seeked');
  }
  const k = Math.min(1, 640 / video.videoWidth);
  const c = document.createElement('canvas');
  c.width = Math.round(video.videoWidth * k);
  c.height = Math.round(video.videoHeight * k);
  c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(new File([b], 'cover.jpg', { type: 'image/jpeg' })) : reject(new Error('Не удалось сделать обложку.'))), 'image/jpeg', 0.85));
}

  return { canTrim, trimVideo, captureCover };
})();

__m["editor/video-editor.js"] = (function () {
  const { el, icon } = __m["dom.js"];
  const { trimVideo, captureCover, canTrim } = __m["editor/video-trim.js"];
/* Редактор видео: предпросмотр, обрезка начала/конца (две ручки), выбор обложки. */



const MIN_LEN = 0.5;                                    // минимальная длина после обрезки, с
const fmt = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

/** У webm из MediaRecorder duration бывает Infinity — «прокручиваем» в конец, чтобы браузер её узнал. */
async function readDuration(video) {
  if (Number.isFinite(video.duration)) return video.duration;
  await new Promise((resolve) => {
    video.addEventListener('timeupdate', resolve, { once: true });
    video.currentTime = 1e6;
  });
  const d = video.duration;
  video.currentTime = 0;
  return d;
}

/** @param {{video:HTMLVideoElement, playBtn:HTMLElement, tools:HTMLElement}} ui */
function createVideoEditor({ video, playBtn, tools }) {
  let file = null, url = null, duration = 0, start = 0, end = 0, coverTime = 0, muted = false;

  const startH = el('button', { class: 'trim__handle', type: 'button', role: 'slider', 'aria-label': 'Начало' });
  const endH = el('button', { class: 'trim__handle', type: 'button', role: 'slider', 'aria-label': 'Конец' });
  const range = el('div', { class: 'trim__range' });
  const head = el('div', { class: 'trim__head' });
  const track = el('div', { class: 'trim__track' }, range, startH, endH, head);
  const tStart = el('span'), tLen = el('b'), tEnd = el('span');
  const coverRange = el('input', { type: 'range', min: 0, max: 1000, value: 0, class: 'cover__range', 'aria-label': 'Кадр обложки' });
  const coverLabel = el('span', { class: 'editor__hint' });

  const muteBtn = el('button', { class: 'chip', type: 'button', id: 'video-mute', 'aria-pressed': 'false' }, icon('i-volume'), el('span', { text: 'Со звуком' }));
  const muteHint = el('p', { class: 'editor__hint', text: 'Без звука видео отправится как GIF и попадёт в «Сохранённые GIF».', hidden: true });
  muteBtn.addEventListener('click', () => {
    muted = !muted;
    muteBtn.setAttribute('aria-pressed', String(muted));
    muteBtn.querySelector('use').setAttribute('href', muted ? '#i-volume-off' : '#i-volume');
    muteBtn.lastChild.textContent = muted ? 'Без звука (GIF)' : 'Со звуком';
    muteHint.hidden = !muted; video.muted = muted;
  });

  tools.replaceChildren(
    el('div', { class: 'trim' }, el('p', { class: 'editor__label', text: 'Обрезка' }), track,
      el('div', { class: 'trim__times' }, tStart, tLen, tEnd)),
    el('div', { class: 'sound' }, muteBtn, muteHint),
    el('div', { class: 'cover' }, el('p', { class: 'editor__label', text: 'Обложка (кадр)' }), coverRange, coverLabel),
  );

  const pct = (t) => `${(t / duration) * 100}%`;
  function paint() {
    track.style.setProperty('--s', pct(start));
    track.style.setProperty('--e', pct(end));
    tStart.textContent = fmt(start); tEnd.textContent = fmt(end); tLen.textContent = `${fmt(end - start)} с`;
    startH.setAttribute('aria-valuenow', start.toFixed(1)); endH.setAttribute('aria-valuenow', end.toFixed(1));
    coverTime = Math.min(end, Math.max(start, coverTime));
    coverRange.value = end > start ? Math.round(((coverTime - start) / (end - start)) * 1000) : 0;
    coverLabel.textContent = `Кадр на ${fmt(coverTime)}`;
  }

  /* Перетаскивание ручек */
  function bindHandle(handle, which) {
    const move = (clientX) => {
      const r = track.getBoundingClientRect();
      const t = Math.min(duration, Math.max(0, ((clientX - r.left) / r.width) * duration));
      if (which === 'start') start = Math.min(t, end - MIN_LEN);
      else end = Math.max(t, start + MIN_LEN);
      video.pause();
      video.currentTime = which === 'start' ? start : Math.max(start, end - 0.05);
      paint();
    };
    handle.addEventListener('pointerdown', (e) => { handle.setPointerCapture(e.pointerId); handle.dataset.drag = '1'; e.preventDefault(); });
    handle.addEventListener('pointermove', (e) => { if (handle.dataset.drag) move(e.clientX); });
    const stop = () => { delete handle.dataset.drag; };
    handle.addEventListener('pointerup', stop); handle.addEventListener('pointercancel', stop);
    handle.addEventListener('keydown', (e) => {                      // доступность: стрелки двигают на 0.1 с
      const step = e.key === 'ArrowLeft' ? -0.1 : e.key === 'ArrowRight' ? 0.1 : 0;
      if (!step) return;
      e.preventDefault();
      const r = track.getBoundingClientRect();
      const cur = (which === 'start' ? start : end) + step;
      move(r.left + (cur / duration) * r.width);
    });
  }
  bindHandle(startH, 'start');
  bindHandle(endH, 'end');

  coverRange.addEventListener('input', () => {
    coverTime = start + ((end - start) * coverRange.value) / 1000;
    video.pause();
    video.currentTime = coverTime;
    coverLabel.textContent = `Кадр на ${fmt(coverTime)}`;
  });

  /* Воспроизведение только внутри выбранного отрезка */
  const setPlayIcon = (playing) => {
    playBtn.querySelector('use').setAttribute('href', playing ? '#i-pause' : '#i-play');
    playBtn.setAttribute('aria-label', playing ? 'Пауза' : 'Воспроизвести');
    playBtn.classList.toggle('is-playing', playing);
  };
  playBtn.addEventListener('click', () => {
    if (!video.paused) { video.pause(); return; }
    if (video.currentTime < start || video.currentTime >= end - 0.05) video.currentTime = start;
    video.play().catch(() => {});
  });
  video.addEventListener('click', () => playBtn.click());
  video.addEventListener('play', () => setPlayIcon(true));
  video.addEventListener('pause', () => setPlayIcon(false));
  video.addEventListener('timeupdate', () => {
    if (!video.paused && video.currentTime >= end - 0.03) { video.pause(); video.currentTime = start; }
    head.style.left = pct(Math.min(duration, video.currentTime));
  });

  return {
    async load(f) {
      file = f; muted = false; muteBtn.setAttribute('aria-pressed', 'false'); muteHint.hidden = true; muteBtn.lastChild.textContent = 'Со звуком'; muteBtn.querySelector('use').setAttribute('href', '#i-volume'); video.muted = false;
      url = URL.createObjectURL(f);
      video.src = url;
      await new Promise((resolve, reject) => {
        video.addEventListener('loadedmetadata', resolve, { once: true });
        video.addEventListener('error', () => reject(new Error('Не удалось открыть видео. Возможно, формат не поддерживается браузером.')), { once: true });
      });
      duration = await readDuration(video);
      start = 0; end = duration; coverTime = Math.min(0.1, duration / 2);
      video.currentTime = coverTime;
      setPlayIcon(false);
      paint();
    },

    /** @returns {Promise<{file:File, cover:File|null, trimmed:boolean, warning?:string}>} */
    async export({ onProgress, signal } = {}) {
      video.pause();
      let cover = null;
      try { cover = await captureCover(video, coverTime); } catch { /* без обложки — не критично */ }
      const needsTrim = start > 0.05 || end < duration - 0.05;
      if (muted) {                                                              // без звука: всегда перекодируем без звуковой дорожки → GIF
        if (!canTrim()) return { file, cover, trimmed: false, warning: 'Браузер не умеет убирать звук — видео отправлено как есть.' };
        const silent = await trimVideo(file, start, end, { onProgress, signal, mute: true });
        return { file: silent, cover, trimmed: true, gif: true };
      }
      if (!needsTrim) return { file, cover, trimmed: false };                 // без перекодирования — без потерь
      if (!canTrim()) return { file, cover, trimmed: false, warning: 'Браузер не умеет обрезать видео — отправлено целиком.' };
      const trimmed = await trimVideo(file, start, end, { onProgress, signal });
      return { file: trimmed, cover, trimmed: true };
    },

    get range() { return { start, end, duration }; },
    destroy() {
      video.pause(); video.removeAttribute('src'); video.load();
      if (url) URL.revokeObjectURL(url);
      file = url = null;
    },
  };
}

  return { createVideoEditor };
})();

__m["editor/editor-modal.js"] = (function () {
  const { $ } = __m["dom.js"];
  const { openModal, closeModal, onModalClose } = __m["ui/modal.js"];
  const { toast } = __m["ui/toast.js"];
  const { createPhotoEditor } = __m["editor/photo-editor.js"];
  const { createVideoEditor } = __m["editor/video-editor.js"];
/* Окно редактора: выбирает режим (фото/видео), собирает результат.
   openEditor(file) → Promise<{file, cover, caption} | null> (null — пользователь закрыл окно). */






let photo = null, video = null, wired = false;
let resolveCurrent = null, abort = null, mode = 'photo';

const modal = () => $('#modal-editor');

function busy(on, text = 'Обработка…') {
  $('#editor-busy').hidden = !on;
  $('#editor-busy-text').textContent = text;
  $('#editor-done').disabled = on;
}

function wire() {
  wired = true;
  photo = createPhotoEditor({
    stage: $('#editor-stage'), canvas: $('#editor-canvas'), cropBox: $('#crop-box'),
    textInput: $('#editor-text-input'), tools: $('#photo-tools'), mask: $('#avatar-mask'), zoomInput: $('#avatar-zoom'),
  });
  video = createVideoEditor({ video: $('#editor-video'), playBtn: $('#editor-play'), tools: $('#video-tools') });
  photo.onUndoChange((has) => { $('#editor-undo').disabled = !has; });
  $('#editor-undo').addEventListener('click', () => photo.undo());
  $('#editor-cancel').addEventListener('click', () => abort?.abort());

  $('#editor-done').addEventListener('click', async () => {
    busy(true, mode === 'photo' ? 'Сохраняем…' : 'Готовим видео…');
    abort = new AbortController();
    try {
      let result;
      if (mode === 'photo') {
        result = { file: await photo.export(), cover: null };
      } else {
        const r = await video.export({
          signal: abort.signal,
          onProgress: (p) => { $('#editor-busy-text').textContent = `Обрезаем видео… ${Math.round(p * 100)}%`; },
        });
        if (r.warning) toast(r.warning);
        result = { file: r.file, cover: r.cover, gif: Boolean(r.gif) };
      }
      finish({ ...result, caption: $('#editor-caption').value.trim() });
    } catch (e) {
      if (e.name !== 'AbortError') toast(e.message || 'Не удалось подготовить файл.');
    } finally {
      busy(false);
      abort = null;
    }
  });

  // Любое закрытие окна (крестик, Esc, подложка) без «Готово» = отмена
  onModalClose('modal-editor', () => {
    abort?.abort();
    photo.setAvatarMode(false); modal().dataset.avatar = 'false';
    photo.destroy(); video.destroy();
    if (resolveCurrent) { resolveCurrent(null); resolveCurrent = null; }
  });
}

function finish(result) {
  const resolve = resolveCurrent;
  resolveCurrent = null;                     // чтобы onModalClose не отправил null следом
  closeModal('modal-editor');
  resolve?.(result);
}

/** options.avatar — режим «Фото профиля»: круглая маска, перемещение и масштаб; результат — квадратный JPEG. */
async function openEditor(file, { avatar = false } = {}) {
  if (!wired) wire();
  mode = file.type.startsWith('video/') ? 'video' : 'photo';
  avatar = avatar && mode === 'photo';
  modal().dataset.mode = mode;
  modal().dataset.avatar = String(avatar);
  $('#editor-caption').value = '';
  $('#editor-title').textContent = avatar ? 'Фото профиля' : mode === 'video' ? 'Видео' : 'Фото';
  $('#editor-undo').disabled = true;
  busy(false);

  return new Promise((resolve) => {
    resolveCurrent = resolve;
    openModal('modal-editor');
    // Ждём кадр: у окна должны появиться размеры, иначе canvas не вычислит масштаб
    requestAnimationFrame(() => requestAnimationFrame(async () => {
      try {
        await (mode === 'video' ? video.load(file) : photo.load(file));
        if (avatar) photo.setAvatarMode(true);
      } catch (e) {
        toast(e.message || 'Не удалось открыть файл.');
        closeModal('modal-editor');
      }
    }));
  });
}

  return { openEditor };
})();

__m["ui/profile.js"] = (function () {
  const { $ } = __m["dom.js"];
  const { api } = __m["api.js"];
  const { state } = __m["state.js"];
  const { avatar } = __m["ui/avatar.js"];
  const { toast } = __m["ui/toast.js"];
  const { openEditor } = __m["editor/editor-modal.js"];
/* Окно профиля: аватар (с каруселью фото), ник, @логин, описание; редактирование ника и описания. */







const displayName = (u) => u.display_name || u.username;

/** onChange(user) — после сохранения; onAvatars() — открыть карусель своих фото. */
function initProfile({ onChange, onAvatars }) {
  const setEditing = (on) => {
    $('#profile-view').hidden = on; $('#profile-edit').hidden = !on;
    $('#profile-footer').hidden = !on;
    $('#modal-settings-title').textContent = on ? 'Изменить профиль' : 'Профиль';
  };

  function renderView() {
    const u = state.user;
    $('#profile-avatar').replaceChildren(avatar(displayName(u), { user: u, big: true }));
    $('#profile-name').textContent = displayName(u);
    $('#profile-login').textContent = `@${u.username}`;
    const bio = $('#profile-bio');
    bio.textContent = u.bio || 'Описание не добавлено';
    bio.classList.toggle('is-empty', !u.bio);
  }

  /** Загружает фото и делает его текущим; прежние остаются в карусели. */
  async function uploadAvatar(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast('Выберите картинку.'); return; }
    // Подтверждение через круглую маску: можно двигать, масштабировать и править фото тем же редактором
    const edited = await openEditor(file, { avatar: true });
    if (!edited) return;
    try {
      const media = await api.uploadMedia(edited.file);
      onChange(await api.updateProfile({ avatar_id: media.id }));
      toast('Фото профиля обновлено');
    } catch (e) { toast(e.message || 'Не удалось загрузить фото.'); }
  }
  const pick = () => $('#avatar-file').click();
  $('#avatar-file').addEventListener('change', () => { const f = $('#avatar-file').files[0]; $('#avatar-file').value = ''; uploadAvatar(f); });
  $('#profile-photo-btn').addEventListener('click', pick);
  $('#profile-avatar-edit').addEventListener('click', pick);
  $('#profile-avatar').addEventListener('click', () => onAvatars?.());

  function renderEditAvatar() {
    $('#profile-avatar-edit').replaceChildren(avatar(displayName(state.user), { user: state.user, big: true }));
  }
  $('#profile-edit-btn').addEventListener('click', () => {
    const u = state.user;
    $('#profile-nick').value = displayName(u);
    $('#profile-login-ro').value = `@${u.username}`;
    $('#profile-bio-input').value = u.bio || '';
    setEditing(true); renderEditAvatar();
  });
  $('#profile-cancel').addEventListener('click', () => setEditing(false));

  $('#profile-save').addEventListener('click', async () => {
    if (!$('#profile-nick').value.trim()) { toast('Укажите ник.'); $('#profile-nick').focus(); return; }
    const btn = $('#profile-save'); btn.disabled = true;
    try {
      const updated = await api.updateProfile({ display_name: $('#profile-nick').value, bio: $('#profile-bio-input').value });
      setEditing(false);
      onChange(updated);
      toast('Профиль сохранён');
    } catch (e) { toast(e.message || 'Не удалось сохранить профиль.'); }
    finally { btn.disabled = false; }
  });

  return {
    /** Вызывать при каждом открытии окна и после изменения профиля. */
    render() { setEditing(false); renderView(); },
  };
}

  return { displayName, initProfile };
})();

__m["theme.js"] = (function () {
  const { mediaUrl } = __m["api.js"];
  const { storage } = __m["storage.js"];
/* Тема оформления и обои чата. Палитра строится из одного акцентного цвета (или выбирается тёмная). */



const CACHE_KEY = 'aqua.prefs';

const PALETTES = [
  { id: 'sea', name: 'Море', accent: null, swatch: '#146CA4' },
  { id: 'mint', name: 'Мята', accent: '#12896B', swatch: '#12896B' },
  { id: 'violet', name: 'Сирень', accent: '#6B4FC9', swatch: '#6B4FC9' },
  { id: 'rose', name: 'Роза', accent: '#C2417A', swatch: '#C2417A' },
  { id: 'sunset', name: 'Закат', accent: '#D9642B', swatch: '#D9642B' },
  { id: 'graphite', name: 'Графит', accent: '#475569', swatch: '#475569' },
  { id: 'night', name: 'Ночь', dark: true, swatch: '#0E1A26' },
];

const WALLPAPERS = [
  { id: 'waves', name: 'Волны', css: 'linear-gradient(160deg,#cfe9ff,#a2d1ff 55%,#7fbbe8)' },
  { id: 'sand', name: 'Песок', css: 'linear-gradient(160deg,#fff4dc,#f6dcae)' },
  { id: 'mint', name: 'Мята', css: 'linear-gradient(160deg,#dcf7ec,#a8e6cf)' },
  { id: 'dusk', name: 'Сумерки', css: 'linear-gradient(160deg,#e6dcff,#b8a6f0)' },
  { id: 'rose', name: 'Розовый', css: 'linear-gradient(160deg,#ffe3ec,#ffb8cf)' },
  { id: 'deep', name: 'Глубина', css: 'linear-gradient(160deg,#16314a,#0b1b2b)' },
  { id: 'bubbles', name: 'Пузыри', css: 'radial-gradient(circle at 18% 28%,rgba(255,255,255,.55) 0 .7rem,transparent .75rem),radial-gradient(circle at 72% 62%,rgba(255,255,255,.4) 0 1.1rem,transparent 1.15rem),radial-gradient(circle at 40% 86%,rgba(255,255,255,.45) 0 .5rem,transparent .55rem),linear-gradient(170deg,#bfe3ff,#5fb3e6)' },
];

const DARK = {
  '--color-bg': '#0E1A26', '--color-surface': '#15263A', '--color-surface-alt': '#1B3047', '--color-border': '#26405C',
  '--color-text': '#E6F2FF', '--color-text-muted': '#8FB0CC', '--color-primary': '#7CC4F2', '--color-accent': '#5BB8E8',
  '--bubble-in-bg': '#1F3550', '--bubble-in-text': '#E6F2FF',
  '--aqua-50': '#1B3047', '--aqua-100': '#20384F', '--aqua-200': '#274560', '--aqua-300': '#2F5473',
  '--aqua-deep': '#E6F2FF', '--aqua-icon': '#8CCBF2', '--aqua-teal-600': '#2A86B8', '--aqua-navy': '#1D5F8A', '--aqua-sky': '#12314A',
  '--color-focus': 'rgba(91,184,232,.5)',
};

const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => {                       // t — доля цвета b
  const [x, y] = [hex2rgb(a), hex2rgb(b)];
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
};

function derive(accent) {
  return {
    '--aqua-teal-600': accent, '--aqua-teal': mix(accent, '#ffffff', .12), '--aqua-navy': mix(accent, '#0A2540', .35),
    '--aqua-icon': mix(accent, '#000000', .2), '--aqua-deep': mix(accent, '#06121D', .8), '--aqua-sky': mix(accent, '#ffffff', .6),
    '--aqua-50': mix(accent, '#ffffff', .95), '--aqua-100': mix(accent, '#ffffff', .9),
    '--aqua-200': mix(accent, '#ffffff', .8), '--aqua-300': mix(accent, '#ffffff', .7),
    '--color-border': mix(accent, '#ffffff', .82), '--color-text-muted': mix(accent, '#5B6670', .55),
  };
}

const MANAGED = new Set(['--bubble-radius', '--msg-scale', ...Object.keys(DARK), ...Object.keys(derive('#000000'))]);

function paletteVars(prefs) {
  const id = prefs?.palette;
  if (id === 'night') return DARK;
  if (id === 'custom' && /^#[0-9a-f]{6}$/i.test(prefs.accent || '')) return derive(prefs.accent);
  const p = PALETTES.find((x) => x.id === id);
  return p?.accent ? derive(p.accent) : {};
}

function wallpaperCss(w) {
  if (w?.type === 'preset') return WALLPAPERS.find((x) => x.id === w.id)?.css ?? '';
  if (w?.type === 'media' && w.url) return `url("${mediaUrl(w.url)}") center / cover no-repeat`;
  return '';
}

/** Применяет тему и обои. Результат кэшируется, чтобы при следующем запуске не было вспышки старого оформления. */
function applyPrefs(prefs, { cache = true } = {}) {
  const root = document.documentElement;
  for (const name of MANAGED) root.style.removeProperty(name);
  const vars = paletteVars(prefs);
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.style.colorScheme = prefs?.palette === 'night' ? 'dark' : 'light';
  root.dataset.theme = prefs?.palette === 'night' ? 'dark' : 'light';
  if (Number.isInteger(prefs?.bubble_radius)) root.style.setProperty('--bubble-radius', `${prefs.bubble_radius}px`);
  if (Number.isInteger(prefs?.text_size)) root.style.setProperty('--msg-scale', String(prefs.text_size / 100));
  const css = wallpaperCss(prefs?.wallpaper);
  if (css) root.style.setProperty('--chat-wallpaper', css); else root.style.removeProperty('--chat-wallpaper');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', vars['--aqua-sky'] ?? '#A2D1FF');
  if (cache) {
    try { storage.set(CACHE_KEY, JSON.stringify({ palette: prefs?.palette, accent: prefs?.accent, bubble_radius: prefs?.bubble_radius, text_size: prefs?.text_size, wallpaper: prefs?.wallpaper?.type === 'preset' ? prefs.wallpaper : null })); } catch { /* не критично */ }
  }
}

/** Ранняя подстановка кэшированной темы (до входа в аккаунт). */
function applyCachedPrefs() {
  try { applyPrefs(JSON.parse(storage.get(CACHE_KEY) || 'null') || {}, { cache: false }); } catch { /* ничего */ }
}

  return { PALETTES, WALLPAPERS, paletteVars, wallpaperCss, applyPrefs, applyCachedPrefs };
})();

__m["ui/settings.js"] = (function () {
  const { $, el, icon } = __m["dom.js"];
  const { api } = __m["api.js"];
  const { state } = __m["state.js"];
  const { REACTIONS } = __m["config.js"];
  const { PALETTES, WALLPAPERS, applyPrefs } = __m["theme.js"];
  const { toast } = __m["ui/toast.js"];
  const { avatar } = __m["ui/avatar.js"];
  const { pickUsers } = __m["ui/dialogs.js"];
/* Окно «Настройки»: список разделов → «Настройки чатов» (вид сообщений, тема, обои, реакция), «Конфиденциальность», «Аккаунт». */









const WHO = [['everyone', 'Все'], ['selected', 'Только выбранные'], ['except', 'Все, кроме выбранных']];
const ACTIVITY = [['none', 'Не скрывать'], ['all', 'Скрыть от всех'], ['selected', 'Скрыть от выбранных'], ['noncontacts', 'Скрыть от неконтактов']];

/** onLogout не нужен: выход остаётся в профиле. onUsername(user) — логин изменён. */
function initSettings({ onUsername, onUnblock, accounts }) {
  const body = $('#prefs-body');

  const prefs = () => state.user.prefs ?? {};
  async function savePrefs(patch) {
    try {
      state.user.prefs = await api.updatePrefs(patch);
      applyPrefs(state.user.prefs);
      render();
    } catch (e) { toast(e.message || 'Не удалось сохранить.'); }
  }

  const section = (title, ...kids) => el('section', { class: 'prefs__section' }, el('h3', { class: 'prefs__title', text: title }), ...kids);

  /* ---- Оформление ---- */
  function themeSection() {
    const cur = prefs().palette || 'sea';
    const swatches = PALETTES.map((p) => el('button', {
      type: 'button', class: 'theme-sw', role: 'radio', 'aria-checked': String(cur === p.id), 'aria-label': p.name, title: p.name,
      dataset: { palette: p.id }, style: `--sw:${p.swatch}`, onclick: () => savePrefs({ palette: p.id, accent: null }),
    }));
    const custom = el('label', { class: 'theme-sw theme-sw--custom', title: 'Свой цвет', 'aria-label': 'Свой цвет' },
      el('input', { type: 'color', id: 'accent-input', value: prefs().accent || '#0F7DA6',
        onchange: (e) => savePrefs({ palette: 'custom', accent: e.target.value }) }));
    custom.setAttribute('aria-checked', String(cur === 'custom'));
    if (cur === 'custom') custom.style.setProperty('--sw', prefs().accent);
    return section('Цветовая гамма', el('div', { class: 'theme-sws', role: 'radiogroup', 'aria-label': 'Цветовая гамма' }, swatches, custom));
  }

  /* ---- Обои ---- */
  function wallpaperSection() {
    const w = prefs().wallpaper ?? { type: 'none' };
    const tile = (id, name, css, on, click) => el('button', {
      type: 'button', class: 'wp', role: 'radio', 'aria-checked': String(on), 'aria-label': name, title: name,
      dataset: { wp: id }, style: css ? `background:${css}` : null, onclick: click,
    }, css ? null : el('span', { text: 'Нет' }));
    const fileInput = el('input', { type: 'file', accept: 'image/*', hidden: true, id: 'wp-file', onchange: async () => {
      const f = fileInput.files[0]; fileInput.value = ''; if (!f) return;
      try { const m = await api.uploadMedia(f); await savePrefs({ wallpaper: { type: 'media', media_id: m.id } }); }
      catch (e) { toast(e.message || 'Не удалось загрузить обои.'); }
    } });
    return section('Обои чата', el('div', { class: 'wps', role: 'radiogroup', 'aria-label': 'Обои чата' },
      tile('none', 'Без обоев', null, w.type === 'none', () => savePrefs({ wallpaper: { type: 'none' } })),
      WALLPAPERS.map((x) => tile(x.id, x.name, x.css, w.type === 'preset' && w.id === x.id, () => savePrefs({ wallpaper: { type: 'preset', id: x.id } }))),
      el('button', { type: 'button', class: `wp wp--own${w.type === 'media' ? ' is-on' : ''}`, id: 'wp-own', 'aria-label': 'Своё фото', title: 'Своё фото',
        onclick: () => fileInput.click() }, el('span', { text: '+ Фото' })), fileInput));
  }

  /* ---- Быстрая реакция ---- */
  function reactionSection() {
    const cur = prefs().quick_reaction || REACTIONS[0];
    return section('Быстрая реакция',
      el('p', { class: 'prefs__hint', text: 'Ставится двойным касанием по сообщению.' }),
      el('div', { class: 'qr', role: 'radiogroup' }, REACTIONS.map((r) => el('button', {
        type: 'button', class: 'qr__item', role: 'radio', 'aria-checked': String(cur === r), 'aria-label': r, text: r,
        onclick: () => savePrefs({ quick_reaction: r }),
      }))));
  }

  /* ---- Приватность ---- */
  /** Кого можно выбирать: контакты и собеседники из личных чатов. */
  async function candidates() {
    const map = new Map();
    try { for (const u of await api.listContacts()) map.set(u.id, u); } catch { /* список контактов недоступен — берём только собеседников */ }
    for (const c of state.chats.values()) for (const m of c.members) if (c.type === 'direct' && m.id !== state.user.id) map.set(m.id, map.get(m.id) ?? m);
    return [...map.values()];
  }
  async function savePrivacy(patch, rerender) {
    try { state.user.privacy = await api.updatePrivacy(patch); }
    catch (e) { toast(e.message || 'Не удалось сохранить.'); }
    rerender();
  }
  /** Выбор режима + кнопка «выбрать людей» для режимов, где она нужна. */
  function modeField({ id, label, options, get, set, lists }) {
    const holder = el('div', { class: 'field', id: `field-${id}` });
    const paint = () => {
      const cur = get();
      const sel = el('select', { class: 'input', id: `priv-${id}`, 'aria-label': label,
        onchange: () => savePrivacy(set({ ...cur, mode: sel.value }), paint) }, options.map(([v, t]) => el('option', { value: v, text: t, selected: v === cur.mode })));
      const extra = (lists[cur.mode] ?? []).map(({ key, title, hint }) => el('button', { type: 'button', class: 'btn btn--ghost priv__pick', dataset: { list: key },
        text: `${title}: ${cur[key]?.length ?? 0}`, onclick: async () => {
          const ids = await pickUsers({ title, hint, users: await candidates(), selected: cur[key] ?? [] });
          if (ids) savePrivacy(set({ ...cur, [key]: ids }), paint);
        } }));
      holder.replaceChildren(el('label', { class: 'field__label', for: `priv-${id}`, text: label }), sel, ...extra);
    };
    paint();
    return holder;
  }
  const rule = (field, label) => modeField({ id: field, label, options: WHO,
    get: () => state.user.privacy?.[field] ?? { mode: 'everyone', users: [] },
    set: (v) => ({ [field]: { mode: v.mode, users: v.users ?? [] } }),
    lists: { selected: [{ key: 'users', title: 'Разрешено', hint: 'Только эти люди смогут вам писать.' }],
             except: [{ key: 'users', title: 'Запрещено', hint: 'Эти люди не смогут вам писать.' }] } });
  const activityField = () => modeField({ id: 'hide_activity', label: 'Скрыть «в сети» и время посещения', options: ACTIVITY,
    get: () => state.user.privacy?.hide_activity ?? { mode: 'none', users: [], always: [] },
    set: (v) => ({ hide_activity: { mode: v.mode, users: v.users ?? [], always: v.always ?? [] } }),
    lists: { all: [{ key: 'always', title: 'Всегда разрешать', hint: 'Выбранные люди будут видеть вашу активность, даже если она скрыта.' }],
             selected: [{ key: 'users', title: 'Скрыть от', hint: 'Эти люди не увидят вашу активность.' }] } });
  const blockedBox = el('div', { class: 'blocked', id: 'blocked-list' });
  async function loadBlocked() {
    try {
      const list = await api.listBlocks();
      blockedBox.replaceChildren(...(list.length ? list.map((u) => el('div', { class: 'blocked__row' },
        avatar(u.display_name, { user: u, small: true }),
        el('span', { class: 'blocked__name', text: `${u.display_name} @${u.username}` }),
        el('button', { type: 'button', class: 'btn btn--ghost', dataset: { unblock: u.id }, text: 'Разблокировать', onclick: async () => {
          try { await api.setBlocked(u.id, false); onUnblock?.(u.id); loadBlocked(); } catch (e) { toast(e.message); }
        } }),
      )) : [el('p', { class: 'prefs__hint', text: 'Список пуст.' })]));
    } catch (e) { blockedBox.textContent = e.message; }
  }
  const privacySection = () => section('Приватность',
    rule('who_can_write', 'Кто может писать мне'), rule('who_can_voice', 'Кто может присылать голосовые'), activityField(),
    el('h4', { class: 'prefs__sub', text: 'Заблокированные' }), blockedBox);

  /* ---- Аккаунт ---- */
  function formBox(id, summary, fields, submitText, onSubmit) {
    const err = el('p', { class: 'form-error', role: 'alert', hidden: true });
    const inputs = fields.map((f) => el('div', { class: 'field' },
      el('label', { class: 'field__label', for: `${id}-${f.name}`, text: f.label }),
      el('input', { class: 'input', id: `${id}-${f.name}`, name: f.name, type: f.type || 'text', autocomplete: f.auto || 'off', maxlength: 64 })));
    const form = el('form', { class: 'prefs__form', id, novalidate: true, onsubmit: async (e) => {
      e.preventDefault(); err.hidden = true;
      const v = Object.fromEntries(inputs.map((d) => { const i = d.querySelector('input'); return [i.name, i.value]; }));
      try { await onSubmit(v); form.reset(); details.open = false; }
      catch (x) { err.textContent = x.message || 'Ошибка.'; err.hidden = false; }
    } }, inputs, err, el('button', { class: 'btn btn--primary', type: 'submit', text: submitText }));
    const details = el('details', { class: 'prefs__details' }, el('summary', { text: summary }), form);
    return details;
  }
  /** Быстрое переключение аккаунтов: список всех аккаунтов этого устройства с аватаркой и ником. */
  const accountsSection = () => {
    const list = accounts?.list() ?? [];
    return section('Аккаунты на этом устройстве',
      el('div', { class: 'accs', id: 'accounts-list' }, list.map((a) => {
        const cur = a.id === accounts.current();
        return el('button', { type: 'button', class: `accs__row${cur ? ' is-current' : ''}`, dataset: { account: a.id }, 'aria-current': cur ? 'true' : null,
          onclick: () => { if (!cur) accounts.onSwitch(a.id); } },
          avatar(a.display_name, { user: { id: a.id, display_name: a.display_name, username: a.username, avatar: a.avatar }, small: true }),
          el('span', { class: 'accs__name' }, el('b', { text: a.display_name }), el('small', { text: `@${a.username}` })),
          cur ? icon('i-check') : null);
      })),
      el('button', { type: 'button', class: 'btn btn--ghost', id: 'account-add', text: '+ Добавить аккаунт', onclick: () => accounts.onAdd() }));
  };
  const accountSection = () => section('Аккаунт',
    formBox('form-username', 'Сменить логин', [
      { name: 'username', label: 'Новый логин', auto: 'username' }, { name: 'password', label: 'Текущий пароль', type: 'password', auto: 'current-password' },
    ], 'Сменить логин', async (v) => { const u = await api.changeUsername(v.username, v.password); onUsername(u); toast('Логин изменён'); }),
    formBox('form-password', 'Сменить пароль', [
      { name: 'current', label: 'Текущий пароль', type: 'password', auto: 'current-password' },
      { name: 'next', label: 'Новый пароль', type: 'password', auto: 'new-password' },
      { name: 'again', label: 'Повторите новый пароль', type: 'password', auto: 'new-password' },
    ], 'Сменить пароль', async (v) => {
      if (v.next !== v.again) throw new Error('Пароли не совпадают.');
      await api.changePassword(v.current, v.next); toast('Пароль изменён');
    }));

  /* ---- Вид сообщений ---- */
  function range(id, label, min, max, value, unit, onLive, onSave) {
    const out = el('output', { text: `${value}${unit}` });
    const input = el('input', { type: 'range', id, min, max, step: 1, value,
      oninput: () => { out.textContent = `${input.value}${unit}`; onLive(+input.value); },
      onchange: () => onSave(+input.value) });
    return el('div', { class: 'range' }, el('label', { class: 'range__head', for: id }, el('span', { text: label }), out), input);
  }
  function previewSection() {
    const bubble = (cls, text, time) => el('div', { class: `msg ${cls}` },
      el('div', { class: 'msg__bubble' }, el('div', { class: 'msg__text', text }), el('span', { class: 'msg__meta', text: time })));
    return el('div', { class: 'prefs__preview', id: 'prefs-preview', 'aria-hidden': 'true' },
      bubble('msg--in', 'Привет! Как дела?', '12:30'), bubble('msg--out', 'Отлично, смотри на новые пузыри', '12:31'));
  }
  function bubblesSection() {
    const live = (patch) => applyPrefs({ ...prefs(), ...patch }, { cache: false });
    return section('Сообщения',
      range('bubble-radius', 'Скругление пузырей', 0, 28, prefs().bubble_radius ?? 18, ' px',
        (v) => live({ bubble_radius: v }), (v) => savePrefs({ bubble_radius: v })),
      range('text-size', 'Размер текста', 85, 130, prefs().text_size ?? 100, ' %',
        (v) => live({ text_size: v }), (v) => savePrefs({ text_size: v })),
      el('button', { type: 'button', class: 'btn btn--ghost', id: 'prefs-reset-view', text: 'Сбросить вид',
        onclick: () => savePrefs({ bubble_radius: null, text_size: null }) }));
  }

  /* ---- Страницы ---- */
  const PAGES = {
    menu: { title: 'Настройки', build: () => [menuHeader(), accountsMini(), el('div', { class: 'tg-list' },
      tgRow('account', 'i-profile', 'tg-ico--blue', 'Аккаунт', 'Номер, имя пользователя, «О себе»'),
      tgRow('chats', 'i-chats', 'tg-ico--orange', 'Настройки чатов', 'Обои, тема, вид сообщений, реакции'),
      tgRow('privacy', 'i-eye', 'tg-ico--green', 'Конфиденциальность', 'Кто может писать, активность, блокировки'))] },
    chats: { title: 'Настройки чатов', build: () => [previewSection(), bubblesSection(), themeSection(), wallpaperSection(), reactionSection()] },
    privacy: { title: 'Конфиденциальность', build: () => [privacySection()], after: loadBlocked },
    account: { title: 'Аккаунт', build: () => [accounts ? accountsSection() : null, accountSection()].filter(Boolean) },
  };
  let page = 'menu';
  /* Главная страница настроек в стиле Telegram: шапка с аватаркой, «Аккаунты», цветные иконки разделов */
  function currentAccount() {
    const list = accounts?.list() ?? [];
    return list.find((a) => a.id === accounts?.current()) ?? list[0] ?? null;
  }
  function menuHeader() {
    const a = currentAccount();
    if (!a) return el('div');
    const name = a.display_name || a.username;
    return el('div', { class: 'tg-head' },
      avatar(name, { user: { id: a.id, display_name: name, username: a.username, avatar: a.avatar }, big: true }),
      el('b', { class: 'tg-head__name', text: name }),
      el('small', { class: 'tg-head__login', text: `@${a.username}` }));
  }
  function accountsMini() {
    if (!accounts) return el('div');
    const list = accounts.list();
    return el('section', { class: 'tg-section' },
      el('h3', { class: 'tg-section__title', text: 'Аккаунты' }),
      el('div', { class: 'tg-list' },
        list.map((a) => {
          const cur = a.id === accounts.current();
          return el('button', { type: 'button', class: 'tg-row tg-row--acc', dataset: { account: a.id },
            onclick: () => { if (!cur) accounts.onSwitch(a.id); } },
            avatar(a.display_name || a.username, { user: { id: a.id, display_name: a.display_name, username: a.username, avatar: a.avatar }, small: true }),
            el('span', { class: 'tg-row__text' }, el('b', { text: a.display_name || a.username })),
            cur ? icon('i-check', 'tg-row__mark') : null);
        }),
        el('button', { type: 'button', class: 'tg-row tg-row--add', id: 'account-add-mini', onclick: () => accounts.onAdd() },
          el('span', { class: 'tg-ico tg-ico--plus' }, icon('i-plus')),
          el('span', { class: 'tg-row__text' }, el('b', { text: 'Добавить аккаунт' })))));
  }
  function tgRow(id, iconId, tone, title, hint) {
    return el('button', { type: 'button', class: 'tg-row', dataset: { page: id }, onclick: () => render(id) },
      el('span', { class: `tg-ico ${tone}` }, icon(iconId)),
      el('span', { class: 'tg-row__text' }, el('b', { text: title }), el('small', { text: hint })),
      icon('i-chevron', 'tg-row__chev'));
  }
  function navRow(id, title, hint) {
    return el('button', { type: 'button', class: 'prefs__nav', dataset: { page: id }, onclick: () => render(id) },
      el('span', {}, el('b', { text: title }), el('small', { text: hint })), icon('i-chevron'));
  }
  $('#prefs-back').addEventListener('click', () => render('menu'));

  function render(next = page) {
    const top = next === page ? body.scrollTop : 0;
    page = next;
    const def = PAGES[page];
    $('#prefs-title').textContent = def.title;
    $('#prefs-back').hidden = page === 'menu';
    body.replaceChildren(...def.build());
    body.scrollTop = top;
    def.after?.();
  }
  /** Открытие окна всегда начинается с главного списка. */
  return { render: () => render('menu') };
}

  return { initSettings };
})();

__m["ui/peer-profile.js"] = (function () {
  const { $, el } = __m["dom.js"];
  const { api } = __m["api.js"];
  const { avatar } = __m["ui/avatar.js"];
  const { toast } = __m["ui/toast.js"];
  const { openModal, closeModal } = __m["ui/modal.js"];
  const { lastSeenText } = __m["format.js"];
/* Профиль собеседника: открывается по клику на аватарку/ник в чате. Меню ⋮: контакт и блокировка. */







function initPeerProfile({ onChange, onAvatars }) {
  let user = null;                 // профиль, показанный сейчас
  const menu = $('#peer-menu'), more = $('#peer-more');

  const closeMenu = () => { menu.hidden = true; more.setAttribute('aria-expanded', 'false'); };
  const toggleMenu = () => {
    const open = menu.hidden;
    menu.hidden = !open; more.setAttribute('aria-expanded', String(open));
    if (open) menu.querySelector('button')?.focus();
  };
  more.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
  document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target)) closeMenu(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

  function render() {
    const name = user.display_name || user.username;
    $('#peer-big-avatar').replaceChildren(avatar(name, { user, big: true }));
    $('#peer-big-name').textContent = name;
    $('#peer-big-status').textContent = user.online ? 'в сети' : lastSeenText(user.last_seen);
    const badge = $('#peer-badge');
    badge.hidden = !user.is_blocked; badge.textContent = user.is_blocked ? 'Заблокирован' : '';
    const bio = $('#peer-bio');
    bio.textContent = user.bio || 'Описание не добавлено'; bio.classList.toggle('is-empty', !user.bio);
    $('#peer-login').textContent = `@${user.username}`;
    menu.replaceChildren(
      el('button', { type: 'button', role: 'menuitem', id: 'peer-act-contact', class: 'peer-menu__item', onclick: toggleContact,
        text: user.is_contact ? 'Удалить из контактов' : 'Добавить в контакты' }),
      el('button', { type: 'button', role: 'menuitem', id: 'peer-act-block', class: 'peer-menu__item peer-menu__item--danger', onclick: toggleBlock,
        text: user.is_blocked ? 'Разблокировать' : 'Заблокировать' }));
  }

  async function toggleContact() {
    closeMenu();
    try {
      await api.setContact(user.id, !user.is_contact);
      user.is_contact = !user.is_contact; render();
      toast(user.is_contact ? 'Добавлен в контакты' : 'Удалён из контактов');
    } catch (e) { toast(e.message || 'Не удалось выполнить.'); }
  }
  async function toggleBlock() {
    closeMenu();
    try {
      await api.setBlocked(user.id, !user.is_blocked);
      user.is_blocked = !user.is_blocked; render();
      toast(user.is_blocked ? 'Пользователь заблокирован' : 'Пользователь разблокирован');
      onChange?.(user);
    } catch (e) { toast(e.message || 'Не удалось выполнить.'); }
  }

  $('#peer-big-avatar').addEventListener('click', () => user && onAvatars?.(user));

  return {
    openAvatars: () => user && onAvatars?.(user),
    async open(userId) {
      try { user = await api.userProfile(userId); } catch (e) { toast(e.message || 'Профиль недоступен.'); return; }
      closeMenu(); render(); openModal('modal-peer');
    },
    close: () => closeModal('modal-peer'),
  };
}

  return { initPeerProfile };
})();

__m["ui/avatar-viewer.js"] = (function () {
  const { el, icon } = __m["dom.js"];
  const { api, mediaUrl } = __m["api.js"];
  const { toast } = __m["ui/toast.js"];
/* Увеличение аватарки прямо в профиле: на месте кружка раскрывается карусель всех фото профиля.
   У своего профиля — меню ⋮ (сделать основным, удалить). */




/** host — контейнер профиля (внутри него есть .profile__avatar). */
function createAvatarViewer({ host, onOwnChange }) {
  let root = null, track, dots, menu, more, list = [], own = false, circle = null;

  const index = () => (track ? Math.round(track.scrollLeft / Math.max(track.clientWidth, 1)) : 0);
  const closeMenu = () => { if (menu) { menu.hidden = true; more.setAttribute('aria-expanded', 'false'); } };

  function renderDots() {
    dots.replaceChildren(...list.map((_, i) => el('i', { class: i === index() ? 'is-on' : '' })));
    dots.hidden = list.length < 2;
  }
  function renderSlides() {
    track.replaceChildren(...list.map((a) => el('div', { class: 'avv__slide' },
      el('img', { src: mediaUrl(a.url), alt: 'Фото профиля', draggable: 'false' }))));
    renderDots();
  }
  function renderMenu() {
    const cur = list[index()];
    const items = [];
    if (cur && !cur.current) items.push(['Сделать основным', 'avv-act-main', false, makeMain]);
    items.push(['Удалить фото', 'avv-act-delete', true, remove]);
    menu.replaceChildren(...items.map(([t, id, danger, fn]) => el('button', {
      type: 'button', role: 'menuitem', id, class: `peer-menu__item${danger ? ' peer-menu__item--danger' : ''}`, text: t,
      onclick: () => { closeMenu(); fn(); },
    })));
  }

  async function makeMain() {
    const cur = list[index()];
    try {
      onOwnChange(await api.updateProfile({ avatar_id: cur.media_id }));
      list = await api.userAvatars(own.id); renderSlides(); track.scrollLeft = 0; renderDots(); toast('Фото сделано основным');
    } catch (e) { toast(e.message || 'Не удалось выполнить.'); }
  }
  async function remove() {
    const cur = list[index()];
    try {
      const res = await api.deleteAvatar(cur.media_id);
      onOwnChange(res.profile); list = res.avatars;
      if (!list.length) { close(); toast('Фото удалено'); return; }
      const keep = Math.min(index(), list.length - 1);
      renderSlides(); track.scrollLeft = keep * track.clientWidth; renderDots(); toast('Фото удалено');
    } catch (e) { toast(e.message || 'Не удалось удалить.'); }
  }

  function close() {
    if (!root) return;
    root.remove(); root = null;
    if (circle) circle.hidden = false;
  }

  function build(user, isOwn) {
    dots = el('div', { class: 'avv__dots' });
    track = el('div', { class: 'avv__track', onscroll: () => { renderDots(); closeMenu(); } });
    menu = el('div', { class: 'peer-menu', id: 'avv-menu', role: 'menu', hidden: true });
    more = el('button', { type: 'button', class: 'btn-icon avv__btn', id: 'avv-more', 'aria-label': 'Ещё', 'aria-haspopup': 'menu', 'aria-expanded': 'false',
      onclick: (e) => { e.stopPropagation(); renderMenu(); menu.hidden = !menu.hidden; more.setAttribute('aria-expanded', String(!menu.hidden)); } },
      icon('i-more', 'icon--white'));
    const closeBtn = el('button', { type: 'button', class: 'btn-icon avv__btn', id: 'avv-close', 'aria-label': 'Свернуть фото', onclick: close },
      icon('i-close', 'icon--white'));
    root = el('div', { class: 'avv', id: 'avatar-viewer', role: 'group', 'aria-label': 'Фото профиля' },
      dots, el('div', { class: 'avv__top' }, closeBtn, isOwn ? el('div', { class: 'peer-menu-wrap' }, more, menu) : null), track);
    // Свайп вверх по карусели сворачивает её
    let y0 = null, x0 = 0;
    root.addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; }, { passive: true });
    root.addEventListener('touchend', (e) => {
      if (y0 == null) return;
      const t = e.changedTouches[0]; const dy = t.clientY - y0, dx = t.clientX - x0; y0 = null;
      if (dy < -60 && Math.abs(dx) < 40) close();
    });
    document.addEventListener('click', (e) => { if (root && !menu.hidden && !menu.contains(e.target)) closeMenu(); });
  }

  return {
    /** Возвращает false, если фото нет. */
    async open(user, isOwn) {
      if (root) return true;
      let items;
      try { items = await api.userAvatars(user.id); } catch (e) { toast(e.message || 'Не удалось загрузить фото.'); return false; }
      if (!items.length) return false;
      list = items; own = isOwn ? user : false;
      build(user, isOwn);
      circle = host.querySelector('.profile__avatar'); circle.hidden = true;
      host.prepend(root);
      renderSlides(); track.scrollLeft = 0;
      return true;
    },
    close, isOpen: () => Boolean(root),
  };
}

/** Жест «потянуть вниз» на прокручиваемом теле окна: контент уже вверху, палец ушёл вниз дальше порога — вызываем onPull. */
function initPullDown(scroller, onPull, { threshold = 70, target = null } = {}) {
  let y0 = null, pulled = false;
  scroller.addEventListener('touchstart', (e) => { y0 = scroller.scrollTop <= 0 ? e.touches[0].clientY : null; pulled = false; }, { passive: true });
  scroller.addEventListener('touchmove', (e) => {
    if (y0 == null || pulled) return;
    const dy = e.touches[0].clientY - y0;
    if (target) target.style.transform = dy > 0 ? `scale(${1 + Math.min(dy, 140) / 700})` : '';
    if (dy > threshold && scroller.scrollTop <= 0) { pulled = true; if (target) target.style.transform = ''; onPull(); }
  }, { passive: true });
  const reset = () => { y0 = null; if (target) target.style.transform = ''; };
  scroller.addEventListener('touchend', reset); scroller.addEventListener('touchcancel', reset);
}

  return { createAvatarViewer, initPullDown };
})();

__m["ui/contacts.js"] = (function () {
  const { $, el } = __m["dom.js"];
  const { api } = __m["api.js"];
  const { avatar } = __m["ui/avatar.js"];
/* Окно «Контакты»: список добавленных пользователей; нажатие открывает чат. */




function initContacts({ onOpen }) {
  const list = $('#contacts-list');
  return {
    async render() {
      list.replaceChildren(el('li', { class: 'contacts__empty', text: 'Загрузка…' }));
      try {
        const items = await api.listContacts();
        list.replaceChildren(...(items.length ? items.map((u) => el('li', {},
          el('button', { type: 'button', class: 'contacts__row', dataset: { username: u.username }, onclick: () => onOpen(u) },
            avatar(u.display_name || u.username, { user: u }),
            el('span', { class: 'contacts__name' }, el('b', { text: u.display_name || u.username }), el('small', { text: `@${u.username}` })))))
          : [el('li', { class: 'contacts__empty', text: 'Контактов пока нет. Откройте профиль собеседника и добавьте его в контакты через меню ⋮.' })]));
      } catch (e) { list.replaceChildren(el('li', { class: 'contacts__empty', text: e.message || 'Не удалось загрузить контакты.' })); }
    },
  };
}

  return { initContacts };
})();

__m["ui/clipboard.js"] = (function () {

/* Копирование текста в буфер обмена (с запасным способом для старых браузеров и http). */
async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* пробуем запасной путь */ }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
  document.body.append(area);
  area.select();
  area.setSelectionRange(0, text.length);               // iOS
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  area.remove();
  return ok;
}

  return { copyText };
})();

__m["ui/splash.js"] = (function () {
  const { $ } = __m["dom.js"];
  const { session } = __m["storage.js"];
  const { SPLASH_KEY, SPLASH_MAX_MS } = __m["config.js"];
/* Заставка при входе (assets/start.webm — VP9 с прозрачным фоном: поверх уже видно приложение).
   Показывается один раз за сессию вкладки. Закрывается по окончанию видео, по тапу, при ошибке
   воспроизведения или по таймауту — приложение никогда не «застрянет» на заставке. */




function initSplash() {
  const splash = $('#splash');
  const video = $('#splash-video');
  if (!splash) return Promise.resolve();

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || session.get(SPLASH_KEY)) {
    splash.remove();
    return Promise.resolve();
  }
  // WebM с прозрачностью умеют Chrome/Edge/Firefox/Android WebView; Safari рисует прозрачное чёрным — там заставку пропускаем
  const isSafari = /^((?!chrome|chromium|android|crios|fxios).)*safari/i.test(navigator.userAgent);
  if (isSafari || !video.canPlayType('video/webm; codecs="vp9"')) {
    splash.remove();
    return Promise.resolve();
  }
  session.set(SPLASH_KEY, '1');

  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      splash.classList.add('is-leaving');                          // плавное растворение
      setTimeout(() => { splash.remove(); resolve(); }, 700);
    };
    video.addEventListener('ended', finish);
    video.addEventListener('error', finish);
    splash.addEventListener('click', finish);                      // тап — пропустить
    setTimeout(finish, SPLASH_MAX_MS);
    // muted + playsinline обязательны для автозапуска в Safari/iOS и Chrome
    const started = video.play();
    if (started?.catch) started.catch(finish);
  });
}

  return { initSplash };
})();

__m["ui/reactions.js"] = (function () {
  const { el, icon } = __m["dom.js"];
  const { REACTIONS } = __m["config.js"];
  const { haptic } = __m["haptics.js"];
  const { onLongPress } = __m["touch.js"];
/* Эмодзи-реакции: контекстное меню (ПКМ / двойной клик / долгое нажатие) и клик по «чипам».
   На телефоне меню — «шторка» снизу (стили в components.css), на десктопе — всплывает над сообщением. */





const isMobile = () => window.matchMedia('(max-width: 47.99rem)').matches;
const isRealId = (id) => /^\d+$/.test(id || '');        // у «отправляемых» сообщений id временный
let menu = null;
let outsideHandler = null;

/** Кнопка действия. Опасное действие (confirm) требует второго нажатия в течение 3 секунд. */
function actionButton(a) {
  const label = el('span', { text: a.label });
  let armed = null;
  const btn = el('button', {
    class: `menu__action${a.danger ? ' is-danger' : ''}`, type: 'button', role: 'menuitem',
    onclick: () => {
      if (a.confirm && !armed) {
        label.textContent = a.confirm; btn.classList.add('is-armed'); haptic.tap();
        armed = setTimeout(() => { armed = null; label.textContent = a.label; btn.classList.remove('is-armed'); }, 3000);
        return;
      }
      clearTimeout(armed);
      closeReactionMenu();
      a.run();
    },
  }, icon(a.icon), label);
  return btn;
}

function closeReactionMenu() {
  menu?.remove();
  menu = null;
  if (outsideHandler) {
    document.removeEventListener('pointerdown', outsideHandler, true);
    outsideHandler = null;
  }
}

/**
 * @param {{container:HTMLElement, onPick:(messageId:number, emoji:string)=>void,
 *          getMine:(messageId:number)=>string[],
 *          getActions?:(messageId:number)=>{icon:string,label:string,danger?:boolean,confirm?:string,run:()=>void}[]}} cfg
 *   getMine — какие эмодзи пользователь уже поставил (для подсветки в меню)
 *   getActions — действия под реакциями (копировать, изменить, удалить); confirm — текст второго нажатия
 */
function initReactions({ container, onPick, getMine, getActions = () => [], getQuick = null, onLongSelect = null }) {
  function open(bubble) {
    const msg = bubble.closest('.msg');
    if (!msg || !isRealId(msg.dataset.id) || msg.classList.contains('is-pending')) return;
    const id = Number(msg.dataset.id);
    closeReactionMenu();

    const mine = new Set(getMine(id));
    const actions = getActions(id);
    menu = el('div', { class: 'menu', role: 'menu', 'aria-label': 'Сообщение' },
      el('div', { class: 'menu__row' }, REACTIONS.map((emoji) => el('button', {
        class: `menu__item${mine.has(emoji) ? ' is-active' : ''}`, type: 'button', role: 'menuitem',
        'aria-label': emoji, text: emoji,
        onclick: () => { closeReactionMenu(); haptic.tap(); onPick(id, emoji); },
      }))),
      actions.length ? el('div', { class: 'menu__list' }, actions.map(actionButton)) : null);
    document.body.append(menu);

    if (!isMobile()) {
      // Над сообщением; если не помещается сверху — под ним. Не выходим за края окна.
      const r = bubble.getBoundingClientRect();
      const mw = menu.offsetWidth, mh = menu.offsetHeight;
      const top = r.top - mh - 8 >= 8 ? r.top - mh - 8 : Math.min(r.bottom + 8, window.innerHeight - mh - 8);
      const left = Math.max(8, Math.min(msg.classList.contains('msg--out') ? r.right - mw : r.left, window.innerWidth - mw - 8));
      Object.assign(menu.style, { top: `${top}px`, left: `${left}px` });
    }

    // Закрытие: касание/клик вне меню, Esc, прокрутка
    outsideHandler = (e) => { if (!menu?.contains(e.target)) closeReactionMenu(); };
    setTimeout(() => document.addEventListener('pointerdown', outsideHandler, true), 0);
  }

  container.addEventListener('contextmenu', (e) => {
    const bubble = e.target.closest('.msg__bubble');
    if (bubble) { e.preventDefault(); open(bubble); }
  });
  container.addEventListener('dblclick', (e) => {
    const bubble = e.target.closest('.msg__bubble');
    if (bubble && !e.target.closest('.vp, a, audio, video')) {
      window.getSelection()?.removeAllRanges();      // двойной клик по умолчанию выделяет слово — убираем
      const msg = bubble.closest('.msg');
      // Быстрая реакция из настроек; без неё (getQuick не задан) двойной клик открывает меню
      if (getQuick && msg && isRealId(msg.dataset.id) && !msg.classList.contains('is-pending')) { closeReactionMenu(); haptic.tap(); onPick(Number(msg.dataset.id), getQuick()); }
      else open(bubble);
    }
  });
  // Телефон: долгое нажатие. Системное меню iOS отключено через -webkit-touch-callout: none.
  onLongPress(container, '.msg__bubble', (bubble) => {
    const msg = bubble.closest('.msg');
    if (onLongSelect && msg && isRealId(msg.dataset.id) && !msg.classList.contains('is-pending')) { onLongSelect(Number(msg.dataset.id)); return; }   // долгое нажатие → выделение
    haptic.tap(); open(bubble);
  });

  // Клик по уже поставленной реакции — поставить/снять свою
  container.addEventListener('click', (e) => {
    const chip = e.target.closest('.reaction');
    const msg = chip?.closest('.msg');
    if (chip && msg && isRealId(msg.dataset.id)) onPick(Number(msg.dataset.id), chip.dataset.emoji);
  });

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeReactionMenu(); });
  container.addEventListener('scroll', closeReactionMenu, { passive: true });
  window.addEventListener('resize', closeReactionMenu);
}

  return { closeReactionMenu, initReactions };
})();

__m["ui/wav.js"] = (function () {

/* Перекодирование записи в WAV (PCM 16 бит, моно).
   Зачем: webm/opus из MediaRecorder не имеет длительности в заголовке, иногда теряет хвост и не играет
   на части устройств (например, Safari). WAV проигрывается везде, перематывается и имеет точную длину. */

const RATE = 22050;                    // для голоса достаточно; 10 минут ≈ 26 МБ

function encodePcm16(samples, rate) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}

/** @returns {Promise<{blob:Blob, duration:number}>} — бросает ошибку, если браузер не смог декодировать. */
async function toWav(blob) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  try {
    const decoded = await new Promise((resolve, reject) => {
      blob.arrayBuffer().then((ab) => ctx.decodeAudioData(ab, resolve, reject)).catch(reject);   // callback-форма — для старого Safari
    });
    const frames = Math.max(1, Math.ceil(decoded.duration * RATE));
    const off = new OfflineAudioContext(1, frames, RATE);       // 1 канал: многоканальный звук сводится в моно
    const src = off.createBufferSource();
    src.buffer = decoded;
    src.connect(off.destination);
    src.start();
    const rendered = await off.startRendering();
    return { blob: encodePcm16(rendered.getChannelData(0), RATE), duration: rendered.duration };
  } finally {
    ctx.close?.().catch(() => {});
  }
}

  return { toWav };
})();

__m["ui/voice-recorder.js"] = (function () {
  const { $, el } = __m["dom.js"];
  const { VOICE_MAX_MS, VOICE_MIN_MS, VOICE_WAVE_BARS } = __m["config.js"];
  const { haptic } = __m["haptics.js"];
  const { toWav } = __m["ui/wav.js"];
/* Запись голосового: MediaRecorder + AnalyserNode (живая волна и данные для волны в сообщении).
   Панель записи: [отмена] ● 0:07 ▂▃▅▇▅▃▂ [отправить]. Нужен HTTPS или localhost. */





// Chrome/Firefox/Edge пишут webm/ogg (opus), Safari — mp4 (aac). Берём первое поддерживаемое.
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
const TAIL_MS = 300;                   // «хвост» записи после нажатия «отправить»
const BAR_STEP_PX = 5;                 // ширина столбика + зазор в живой волне

const voiceSupported = () =>
  Boolean(navigator.mediaDevices?.getUserMedia) && typeof window.MediaRecorder !== 'undefined';

function pickMime() {
  return MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported?.(t)) ?? '';
}

/** Сводит записанные уровни громкости к VOICE_WAVE_BARS целым числам 10..100. */
function makeWave(levels, bars = VOICE_WAVE_BARS) {
  if (!levels.length) return Array(bars).fill(10);
  const peaks = Array.from({ length: bars }, (_, i) => {
    const from = Math.floor((i * levels.length) / bars);
    const to = Math.max(from + 1, Math.floor(((i + 1) * levels.length) / bars));
    return Math.max(...levels.slice(from, to));
  });
  const max = Math.max(...peaks, 0.05);               // нормируем, чтобы тихая речь тоже была видна
  return peaks.map((v) => Math.round(10 + 90 * Math.min(1, v / max)));
}

const fmtTime = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/**
 * @param {{onSend:(r:{blob:Blob, mime:string, duration:number, wave:number[]})=>void, onError:(msg:string)=>void}} cfg
 */
function initVoiceRecorder({ onSend, onError }) {
  const panel = $('#recorder');
  const form = $('#composer');
  const timeEl = $('#rec-time');
  const liveEl = $('#rec-wave');
  const micBtn = $('#btn-voice');

  let recorder = null, stream = null, ctx = null, analyser = null, buf = null;
  let sampleTimer = null, startedAt = 0, levels = [], chunks = [], discard = false, starting = false, stopping = false;

  let liveBars = [];

  /** Столько столбиков, сколько помещается в панель (на десктопе их больше, чем на телефоне). */
  function buildLiveBars() {
    const count = Math.max(16, Math.floor(liveEl.clientWidth / BAR_STEP_PX));
    liveBars = Array.from({ length: count }, () => el('span', { style: '--h:8' }));
    liveEl.replaceChildren(...liveBars);
  }

  function setUi(recording) {
    panel.hidden = !recording;
    form.hidden = recording;
    micBtn.classList.toggle('is-recording', recording);
  }

  function sample() {
    analyser.getByteTimeDomainData(buf);
    let peak = 0;
    for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
    const level = Math.min(1, peak / 80);
    levels.push(level);
    // Живая волна: последние уровни, новые справа
    const tail = levels.slice(-liveBars.length);
    liveBars.forEach((bar, i) => {
      const v = tail[i - (liveBars.length - tail.length)] ?? 0;
      bar.style.setProperty('--h', String(Math.max(8, Math.round(v * 100))));
    });
    const elapsed = performance.now() - startedAt;
    timeEl.textContent = fmtTime(elapsed);
    if (elapsed >= VOICE_MAX_MS && !stopping) stop(true);
  }

  function releaseAudio() {
    clearInterval(sampleTimer);
    stream?.getTracks().forEach((t) => t.stop());          // гасим индикатор микрофона в браузере
    ctx?.close?.().catch(() => {});
    stream = ctx = analyser = null;
  }

  async function onStop() {
    let duration = (performance.now() - startedAt) / 1000;
    let mime = (recorder.mimeType || 'audio/webm').split(';')[0];
    const wave = makeWave(levels);
    let blob = new Blob(chunks, { type: mime });
    releaseAudio();
    recorder = null;
    if (discard) { setUi(false); return; }
    if (duration * 1000 < VOICE_MIN_MS) { setUi(false); onError('Слишком короткое сообщение — удерживайте дольше.'); return; }
    // Перекодируем в WAV: играет на любом устройстве, длительность точная, хвост не теряется.
    // Если браузер не смог — отправляем как есть (исходный формат).
    try {
      const wav = await toWav(blob);
      blob = wav.blob; duration = wav.duration; mime = 'audio/wav';
    } catch { /* оставляем исходную запись */ }
    setUi(false);
    onSend({ blob, mime, duration, wave });
  }

  async function start() {
    if (recorder || starting) return;
    if (!voiceSupported()) {
      onError('Запись голоса недоступна: нужен HTTPS или localhost и современный браузер.');
      return;
    }
    starting = true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      starting = false;
      onError(e.name === 'NotAllowedError' ? 'Нет доступа к микрофону. Разрешите его в настройках браузера.'
        : e.name === 'NotFoundError' ? 'Микрофон не найден.' : 'Не удалось включить микрофон.');
      return;
    }
    starting = false;

    const mime = pickMime();
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunks = []; levels = []; discard = false;
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = onStop;

    ctx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    buf = new Uint8Array(analyser.fftSize);

    startedAt = performance.now();
    timeEl.textContent = '0:00';
    recorder.start(250);
    sampleTimer = setInterval(sample, 80);
    setUi(true);
    buildLiveBars();                  // после показа панели — тогда известна её ширина
    haptic.tap();
  }

  function stop(send) {
    if (!recorder || recorder.state === 'inactive') return;
    discard = !send;
    if (!send) { clearInterval(sampleTimer); recorder.stop(); return; }
    // Отправка: пишем ещё ~0.3 с, иначе браузеры обрезают окончание фразы
    if (stopping) return;
    stopping = true;
    setTimeout(() => {
      clearInterval(sampleTimer);
      stopping = false;
      if (recorder && recorder.state !== 'inactive') { try { recorder.requestData(); } catch { /* ок */ } recorder.stop(); }
    }, TAIL_MS);
  }

  $('#rec-cancel').addEventListener('click', () => { haptic.tap(); stop(false); });
  $('#rec-send').addEventListener('click', () => { stop(true); });

  return { start, cancel: () => stop(false), isRecording: () => Boolean(recorder) };
}

  return { voiceSupported, makeWave, initVoiceRecorder };
})();

__m["ui/file-manager.js"] = (function () {
  const { $, el, icon } = __m["dom.js"];
  const { api, mediaUrl } = __m["api.js"];
  const { openModal, closeModal } = __m["ui/modal.js"];
  const { toast } = __m["ui/toast.js"];
  const { formatSize } = __m["format.js"];
/* Внутренний файловый менеджер Aqua (вместо системного окна выбора файла).
   Корень: «папки» (Фото / Видео / Голосовые / Файлы с количеством) и сетка последних загрузок.
   Кнопка «С устройства» открывает скрытый <input type="file">. */






const FOLDERS = [
  { kind: 'image', label: 'Фото', icon: 'i-photo' },
  { kind: 'video', label: 'Видео', icon: 'i-video' },
  { kind: 'voice', label: 'Голосовые', icon: 'i-mic' },
  { kind: 'file',  label: 'Файлы', icon: 'i-file' },
];

function cell(item, onPick) {
  const url = mediaUrl(item.url);
  let inner;
  if (item.kind === 'image') inner = el('img', { src: url, alt: item.name, loading: 'lazy' });
  else if (item.kind === 'video') inner = [el('video', { src: `${url}#t=0.1`, preload: 'metadata', muted: true, playsinline: true, 'aria-hidden': 'true' }),
    el('span', { class: 'media-cell__badge' }, icon('i-play', 'icon--white icon--sm'))];
  else inner = [icon(item.kind === 'voice' ? 'i-mic' : 'i-file', 'icon--lg'), el('b', { text: item.name }), el('small', { text: formatSize(item.size) })];
  return el('button', {
    class: `media-cell${item.kind === 'image' || item.kind === 'video' ? '' : ' media-cell--file'}`,
    type: 'button', 'aria-label': item.name, onclick: () => onPick(item),
  }, inner);
}

/** @param {{onDeviceFile:(f:File)=>void, onPickExisting:(item:object)=>void}} cfg */
function initFileManager({ onDeviceFile, onPickExisting }) {
  const body = $('#fm-body');
  const backBtn = $('#fm-back');
  const title = $('#fm-title');
  const input = $('#file-input');
  let token = 0;                                     // защита от «гонок» при быстрой навигации

  const pick = (item) => { closeModal('modal-files'); onPickExisting(item); };
  const grid = (items) => items.length
    ? el('div', { class: 'grid-media' }, items.map((i) => cell(i, pick)))
    : el('p', { class: 'sidebar__empty', text: 'Здесь пока пусто. Загрузите файл с устройства.' });

  async function showRoot() {
    const mine = ++token;
    title.textContent = 'Файлы'; backBtn.hidden = true;
    body.replaceChildren(el('div', { class: 'spinner', style: 'margin:2rem auto' }));
    try {
      const [summary, recent] = await Promise.all([api.mediaSummary(), api.recentMedia()]);
      if (mine !== token) return;
      body.replaceChildren(
        el('h3', { class: 'list-heading', text: 'Папки' }),
        el('div', { class: 'folders' }, FOLDERS.map((f) => el('button', {
          class: 'folder-tile', type: 'button', onclick: () => showFolder(f),
        }, icon(f.icon, 'icon--lg'), el('b', { text: f.label }), el('small', { text: String(summary[f.kind] ?? 0) })))),
        el('h3', { class: 'list-heading', text: 'Недавние' }),
        grid(recent.filter((m) => m.kind !== 'voice').slice(0, 24)),
      );
    } catch (e) { if (mine === token) body.replaceChildren(el('p', { class: 'sidebar__empty', text: e.message })); }
  }

  async function showFolder(folder) {
    const mine = ++token;
    title.textContent = folder.label; backBtn.hidden = false;
    body.replaceChildren(el('div', { class: 'spinner', style: 'margin:2rem auto' }));
    try {
      const items = await api.recentMedia(folder.kind);
      if (mine === token) body.replaceChildren(grid(items));
    } catch (e) { if (mine === token) body.replaceChildren(el('p', { class: 'sidebar__empty', text: e.message })); }
  }

  backBtn.addEventListener('click', showRoot);
  $('#fm-device').addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;                                 // value сбрасываем при следующем открытии (open),
                                                       // чтобы не ломать чтение файла у части браузеров
    closeModal('modal-files');
    onDeviceFile(file);
  });

  return { open() { input.value = ''; openModal('modal-files'); showRoot().catch((e) => toast(e.message)); } };
}

  return { initFileManager };
})();

__m["ui/lightbox.js"] = (function () {
  const { $, el, icon } = __m["dom.js"];
  const { mediaUrl } = __m["api.js"];
  const { state } = __m["state.js"];
  const { toast } = __m["ui/toast.js"];
  const { saveToGallery, saveGif, forwardMessages, isGifMessage } = __m["ui/media-actions.js"];
  const { openPackViewer } = __m["ui/stickers.js"];
/* Просмотр фото/видео на весь экран + мини-меню ⋮ в ленте.
   Видео: свой плеер — скорость, перемотка двойным тапом (слева −10 с, справа +10 с), кнопка «альбомный режим». */







const SPEEDS = [0.5, 1, 1.25, 1.5, 2];
const SEEK = 10;
const fmt = (s) => { if (!Number.isFinite(s)) s = 0; return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; };

let menu = null, menuOff = null;
function closeMenu() { menu?.remove(); menu = null; if (menuOff) { document.removeEventListener('pointerdown', menuOff, true); menuOff = null; } }

/** Всплывающее мини-меню рядом с кнопкой. items: [{label, icon, run, danger, confirm}] */
function popMenu(anchor, items, host = document.body) {
  closeMenu();
  menu = el('div', { class: 'menu menu--pop', role: 'menu' }, el('div', { class: 'menu__list' }, items.map((a) => {
    const label = el('span', { text: a.label });
    let armed = null;
    const btn = el('button', { class: `menu__action${a.danger ? ' is-danger' : ''}`, type: 'button', role: 'menuitem',
      onclick: () => {
        if (a.confirm && !armed) { label.textContent = a.confirm; btn.classList.add('is-armed'); armed = setTimeout(() => { armed = null; label.textContent = a.label; btn.classList.remove('is-armed'); }, 3000); return; }
        clearTimeout(armed); closeMenu(); a.run();
      } }, icon(a.icon), label);
    return btn;
  })));
  host.append(menu);
  const r = anchor.getBoundingClientRect(), mw = menu.offsetWidth, mh = menu.offsetHeight;
  const top = Math.min(r.bottom + 4, window.innerHeight - mh - 8);
  const left = Math.max(8, Math.min(r.right - mw, window.innerWidth - mw - 8));
  Object.assign(menu.style, { top: `${Math.max(8, top)}px`, left: `${left}px` });
  menuOff = (e) => { if (!menu?.contains(e.target)) closeMenu(); };
  setTimeout(() => document.addEventListener('pointerdown', menuOff, true), 0);
}

/** @param {{container:HTMLElement, getMessage:(id:string)=>object|undefined, onDelete:(id:number, mine:boolean)=>void}} cfg */
function initLightbox({ container, getMessage, onDelete }) {
  let lb = null;

  function actionsFor(m, { withDelete = false } = {}) {
    const mine = m.sender.id === state.user.id;
    const list = [{ label: 'Сохранить в галерею', icon: 'i-download', run: () => saveToGallery(m.media) }];
    if (isGifMessage(m)) list.push({ label: 'Сохранить GIF', icon: 'i-gif', run: () => saveGif(m.media) });
    if (withDelete) {
      list.push({ label: 'Переслать', icon: 'i-forward', run: () => { close(); forwardMessages([m.id]); } });
      list.push({ label: mine ? 'Удалить у всех' : 'Удалить у меня', icon: 'i-trash', danger: true, confirm: 'Точно удалить?', run: () => { close(); onDelete(m.id, mine); } });
    }
    return list;
  }

  function close() {
    closeMenu();
    if (!lb) return;
    try { if (document.fullscreenElement === lb.node) document.exitFullscreen?.(); screen.orientation?.unlock?.(); } catch { /* не поддерживается */ }
    lb.media.pause?.();
    lb.node.remove(); lb = null;
    document.removeEventListener('keydown', onKey);
  }
  const onKey = (e) => { if (e.key === 'Escape' && lb) { e.stopPropagation(); close(); } };

  function open(m) {
    close();
    const url = mediaUrl(m.media.url);
    const isVideo = m.kind === 'video';
    const media = isVideo
      ? el('video', { class: 'lb__media', src: url, playsinline: true, preload: 'auto', ...(m.cover ? { poster: mediaUrl(m.cover.url) } : {}) })
      : el('img', { class: 'lb__media', src: url, alt: m.media.name, draggable: 'false' });
    const more = el('button', { class: 'btn-icon', type: 'button', 'aria-label': 'Меню', id: 'lb-more', onclick: () => popMenu(more, actionsFor(m, { withDelete: true }), node) }, icon('i-more'));
    const stage = el('div', { class: 'lb__stage' }, media);
    const node = el('div', { class: 'lb', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Просмотр' },
      el('div', { class: 'lb__bar' },
        el('button', { class: 'btn-icon', type: 'button', id: 'lb-close', 'aria-label': 'Закрыть', onclick: close }, icon('i-back')), more),
      stage);
    lb = { node, media };
    let idleTimer = null;
    const wake = () => { node.classList.remove('is-idle'); clearTimeout(idleTimer); if (isVideo && !media.paused) idleTimer = setTimeout(() => node.classList.add('is-idle'), 2500); };

    if (isVideo) {
      const play = el('button', { class: 'btn-icon', type: 'button', id: 'lb-play', 'aria-label': 'Воспроизвести' }, icon('i-play'));
      const seek = el('input', { class: 'lb__seek', type: 'range', min: 0, max: 1000, value: 0, 'aria-label': 'Перемотка' });
      const time = el('span', { class: 'lb__time', text: '0:00 / 0:00' });
      const speed = el('button', { class: 'lb__speed', type: 'button', id: 'lb-speed', 'aria-label': 'Скорость', text: '1×' });
      const land = el('button', { class: 'btn-icon', type: 'button', id: 'lb-land', 'aria-label': 'Альбомный режим' }, icon('i-landscape'));
      node.append(el('div', { class: 'lb__controls' }, play, seek, time, speed, land));

      const setIcon = () => { play.querySelector('use').setAttribute('href', media.paused ? '#i-play' : '#i-pause'); };
      const toggle = () => { if (media.paused) media.play().catch(() => {}); else media.pause(); };
      play.addEventListener('click', toggle);
      media.addEventListener('play', () => { setIcon(); wake(); });
      media.addEventListener('pause', () => { setIcon(); wake(); });
      media.addEventListener('timeupdate', () => {
        if (!seek.matches(':active')) seek.value = media.duration ? Math.round((media.currentTime / media.duration) * 1000) : 0;
        time.textContent = `${fmt(media.currentTime)} / ${fmt(media.duration)}`;
      });
      seek.addEventListener('input', () => { if (media.duration) media.currentTime = (seek.value / 1000) * media.duration; });
      let si = 1;
      speed.addEventListener('click', () => { si = (si + 1) % SPEEDS.length; media.playbackRate = SPEEDS[si]; speed.textContent = `${SPEEDS[si]}×`; });

      // Один тап — показать/скрыть панели и пауза; двойной тап слева/справа — перемотка на 10 с
      let lastTap = 0, lastSide = '', singleTimer = null;
      stage.addEventListener('click', (e) => {
        const r = stage.getBoundingClientRect();
        const side = e.clientX - r.left < r.width / 2 ? 'l' : 'r';
        const now = Date.now();
        if (now - lastTap < 320 && side === lastSide) {
          clearTimeout(singleTimer); lastTap = 0;
          media.currentTime = Math.max(0, Math.min(media.duration || 0, media.currentTime + (side === 'l' ? -SEEK : SEEK)));
          const tip = el('span', { class: `lb__tap lb__tap--${side}`, text: side === 'l' ? `−${SEEK} с` : `+${SEEK} с` });
          stage.append(tip); setTimeout(() => tip.remove(), 650); wake();
          return;
        }
        lastTap = now; lastSide = side;
        singleTimer = setTimeout(() => { toggle(); wake(); }, 320);
      });
      land.addEventListener('click', async () => {
        const on = !node.classList.contains('is-land');
        node.classList.toggle('is-land', on);
        if (!on) { node.classList.remove('lb--rotated'); try { screen.orientation?.unlock?.(); if (document.fullscreenElement) await document.exitFullscreen(); } catch { /* ok */ } return; }
        try { await node.requestFullscreen?.(); await screen.orientation.lock('landscape'); }
        catch { node.classList.add('lb--rotated'); }                      // запасной вариант: поворачиваем сами
      });
      node.addEventListener('pointermove', wake);
      media.play().catch(() => {});
    } else {
      stage.addEventListener('click', () => node.classList.toggle('is-idle'));
    }
    document.body.append(node);
    document.addEventListener('keydown', onKey);
    $('#lb-close')?.focus();
  }

  let openTimer = null;
  // Клики в ленте: ⋮ → мини-меню, фото/видео → просмотр, стикер → окно стикерпака
  container.addEventListener('click', (e) => {
    const msgNode = e.target.closest('.msg');
    const id = msgNode?.dataset.id;
    if (!id || !/^\d+$/.test(id)) return;
    const m = getMessage(Number(id));
    if (!m) return;
    const more = e.target.closest('.msg__more');
    if (more) { e.stopPropagation(); popMenu(more, actionsFor(m)); return; }
    const st = e.target.closest('.msg__sticker');
    if (st && m.meta?.pack) { openPackViewer(m.meta.pack); return; }
    // Небольшая задержка: двойной тап по фото — быстрая реакция, а не просмотр
    if (e.target.closest('.msg__mediawrap')) { clearTimeout(openTimer); openTimer = setTimeout(() => open(m), 260); }
  });
  container.addEventListener('dblclick', () => clearTimeout(openTimer));
  container.addEventListener('scroll', closeMenu, { passive: true });

  return { open, close };
}

  return { initLightbox };
})();

__m["ui/selection.js"] = (function () {
  const { $ } = __m["dom.js"];
  const { state } = __m["state.js"];
  const { haptic } = __m["haptics.js"];
/* Режим выделения сообщений: долгое нажатие → «выделено: N», стрелка слева выходит из режима,
   снизу панель действий (копировать, изменить, закрепить, переслать, удалить). */




const isReal = (id) => /^\d+$/.test(id || '');

/**
 * @param {{container:HTMLElement, getMessage:(id:number)=>object|undefined, isPinned:(id:number)=>boolean,
 *   onCopy:(msgs:object[])=>void, onEdit:(m:object)=>void, onPin:(m:object)=>void,
 *   onForward:(ids:number[])=>Promise<boolean>|void, onDelete:(msgs:object[])=>Promise<boolean>|void}} cfg
 */
function initSelection({ container, getMessage, isPinned, onCopy, onEdit, onPin, onForward, onDelete }) {
  const selected = new Set();
  const app = $('#app');
  const title = $('#sel-title');
  const bar = $('#selbar');

  const msgs = () => [...selected].map(getMessage).filter(Boolean).sort((a, b) => a.id - b.id);
  const active = () => selected.size > 0;

  function paint() {
    container.querySelectorAll('.msg').forEach((n) => n.classList.toggle('is-selected', selected.has(Number(n.dataset.id))));
    const on = active();
    app.dataset.selecting = String(on);
    title.hidden = !on; $('#chat-peer').hidden = on;
    bar.hidden = !on; $('#composer').hidden = on;
    if ($('#picker')) $('#picker').hidden = true;
    if (!on) return;
    title.textContent = `выделено: ${selected.size}`;
    const list = msgs(), one = list.length === 1 ? list[0] : null;
    const mine = one && one.sender.id === state.user.id;
    $('#sel-edit').hidden = !(one && mine && one.kind !== 'voice' && !one.meta?.sticker);
    $('#sel-pin').hidden = !one;
    if (one) $('#sel-pin span').textContent = isPinned(one.id) ? 'Открепить' : 'Закрепить';
    $('#sel-copy').hidden = !list.some((m) => m.text);
  }

  function enter(id) { if (!isReal(String(id))) return; selected.add(Number(id)); haptic.tap(); paint(); }
  function toggle(id) { id = Number(id); if (selected.has(id)) selected.delete(id); else selected.add(id); paint(); }
  function exit() { if (!active()) return; selected.clear(); paint(); }
  /** Убирает из выделения сообщения, которых больше нет (удалены). */
  function prune() { for (const id of [...selected]) if (!getMessage(id)) selected.delete(id); if (container.isConnected) paint(); }

  // В режиме выделения тап по сообщению ставит/снимает отметку; остальные обработчики кликов не должны срабатывать
  container.addEventListener('click', (e) => {
    if (!active()) return;
    const node = e.target.closest('.msg');
    e.stopImmediatePropagation(); e.preventDefault();
    if (node && isReal(node.dataset.id)) { toggle(node.dataset.id); haptic.tap(); }
  }, true);
  container.addEventListener('dblclick', (e) => { if (active()) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
  container.addEventListener('contextmenu', (e) => { if (active()) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);

  $('#sel-copy').addEventListener('click', () => { onCopy(msgs()); exit(); });
  $('#sel-edit').addEventListener('click', () => { const m = msgs()[0]; exit(); if (m) onEdit(m); });
  $('#sel-pin').addEventListener('click', () => { const m = msgs()[0]; exit(); if (m) onPin(m); });
  $('#sel-forward').addEventListener('click', async () => { if (await onForward(msgs().map((m) => m.id))) exit(); });
  $('#sel-delete').addEventListener('click', async () => { if (await onDelete(msgs())) exit(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && active() && !document.querySelector('.dialog, .modal.is-open, .lb')) exit(); });

  return { enter, exit, active, prune, toggle };
}

  return { initSelection };
})();

__m["ui/channel-profile.js"] = (function () {
  const { $, el } = __m["dom.js"];
  const { api } = __m["api.js"];
  const { avatar } = __m["ui/avatar.js"];
  const { toast } = __m["ui/toast.js"];
  const { openModal, closeModal } = __m["ui/modal.js"];
/* Страница канала: подписчикам — название, описание, ссылка, списки; администратору — карандаш справа сверху
   и «Настройки канала» (название, описание). Окно открывается как страница: назад, без крестика. */






const ID = 'modal-channel';

function initChannelProfile({ onChange }) {
  let chat = null;
  let mode = 'info';          // info | edit
  let people = null;          // null | 'subs' | 'admins'

  const isAdmin = () => Boolean(chat?.can_post);
  const admins = () => (chat?.members || []).filter((m) => chat.roles?.[String(m.id)] === 'owner');

  function setMode(next) {
    mode = next;
    $('#channel-view').hidden = mode !== 'info';
    $('#channel-edit-form').hidden = mode !== 'edit';
    $('#channel-edit').hidden = mode !== 'info' || !isAdmin();
    $('#channel-save').hidden = mode !== 'edit';
    $('#channel-title').textContent = mode === 'edit' ? 'Настройки канала' : 'Канал';
  }

  function renderInfo() {
    const name = chat.title || 'Канал';
    $('#channel-big-avatar').replaceChildren(avatar(name, { user: { id: chat.id, display_name: name, avatar: null }, big: true }));
    $('#channel-big-name').textContent = name;
    $('#channel-subs').textContent = `публичный канал · ${chat.members.length} подписч.`;
    $('#channel-link').textContent = chat.username ? `${location.origin}/@${chat.username}` : '—';
    const desc = $('#channel-desc');
    desc.textContent = chat.description || 'Описание не добавлено'; desc.classList.toggle('is-empty', !chat.description);
    $('#channel-subs-count').textContent = String(chat.members.length);
    $('#channel-admins-count').textContent = String(admins().length);
    $('#channel-open-settings').hidden = !isAdmin();
    renderPeople();
  }

  function renderPeople() {
    const list = $('#channel-people');
    if (!people) { list.hidden = true; return; }
    const src = people === 'admins' ? admins() : chat.members;
    list.replaceChildren(...src.map((m) => {
      const label = m.display_name || m.username;
      const role = chat.roles?.[String(m.id)] === 'owner' ? 'администратор' : 'подписчик';
      return el('li', { class: 'channel-person' },
        avatar(label, { user: { id: m.id, display_name: label, username: m.username, avatar: m.avatar }, small: true }),
        el('span', { class: 'channel-person__text' }, el('b', { text: label }), el('small', { text: role })));
    }));
    list.hidden = false;
  }

  function fillEdit() {
    $('#channel-title-input').value = chat.title || '';
    $('#channel-desc-input').value = chat.description || '';
    $('#channel-type-link').textContent = chat.username ? `@${chat.username}` : '—';
  }

  $('#channel-edit').addEventListener('click', () => { fillEdit(); setMode('edit'); });
  $('#channel-open-settings').addEventListener('click', () => { fillEdit(); setMode('edit'); });
  $('#channel-open-subs').addEventListener('click', () => { people = people === 'subs' ? null : 'subs'; renderPeople(); });
  $('#channel-open-admins').addEventListener('click', () => { people = people === 'admins' ? null : 'admins'; renderPeople(); });

  $('#channel-save').addEventListener('click', async () => {
    const title = $('#channel-title-input').value.trim();
    if (!title) { toast('Укажите название канала.'); return; }
    try {
      chat = await api.updateChannel(chat.id, { title, description: $('#channel-desc-input').value });
      onChange?.(chat); renderInfo(); setMode('info'); toast('Канал сохранён');
    } catch (e) { toast(e.message || 'Не удалось сохранить.'); }
  });

  $('#channel-back').addEventListener('click', () => (mode === 'edit' ? setMode('info') : closeModal(ID)));

  return {
    open(c) { chat = c; people = null; setMode('info'); renderInfo(); openModal(ID); },
    close: () => closeModal(ID),
    get chat() { return chat; },
  };
}

  return { initChannelProfile };
})();

__m["notify.js"] = (function () {
  const { el } = __m["dom.js"];
  const { storage } = __m["storage.js"];
  const { avatarSrc } = __m["ui/avatar.js"];
/* Временная версия уведомлений: показываются, пока приложение открыто или свёрнуто, но соединение живо.
   Настоящие push-уведомления (когда приложение закрыто) потребуют FCM — это отдельный этап.
   Браузер/PWA: Notification API через service worker; Android-приложение (Capacitor): плагин LocalNotifications. */




const cap = () => window.Capacitor?.Plugins?.LocalNotifications ?? null;
const isNative = () => Boolean(window.Capacitor?.isNativePlatform?.());

/** Текущее состояние: 'granted' | 'denied' | 'default' | 'unsupported'. */
async function permissionState() {
  try {
    if (isNative() && cap()) { const r = await cap().checkPermissions(); return r.display === 'prompt' || r.display === 'prompt-with-rationale' ? 'default' : r.display; }
    if (typeof Notification === 'undefined') return 'unsupported';
    return Notification.permission;
  } catch { return 'unsupported'; }
}

async function request() {
  try {
    if (isNative() && cap()) return (await cap().requestPermissions()).display === 'granted';
    return (await Notification.requestPermission()) === 'granted';
  } catch { return false; }
}

/** При входе в приложение: если разрешение ещё не выдано и не отклонено — обязательно спрашиваем. */
async function askPermissionOnEntry() {
  if ((await permissionState()) !== 'default') return;
  await new Promise((resolve) => {
    const done = async (allow) => { box.remove(); if (allow) await request(); else storage.set('aqua.notif-declined', String(Date.now())); resolve(); };
    const box = el('div', { class: 'notif-ask', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'notif-ask-title' },
      el('div', { class: 'notif-ask__card' },
        el('h2', { id: 'notif-ask-title', text: 'Включить уведомления?' }),
        el('p', { text: 'Аква будет показывать, кто и что вам написал, пока приложение работает в фоне.' }),
        el('button', { type: 'button', class: 'btn btn--primary', id: 'notif-allow', text: 'Разрешить', onclick: () => done(true) }),
        el('button', { type: 'button', class: 'btn btn--ghost', id: 'notif-later', text: 'Не сейчас', onclick: () => done(false) })));
    document.body.append(box);
  });
}

function bodyOf(m) {
  if (m.meta?.sticker) return 'Стикер';
  if (m.meta?.gif) return 'GIF';
  if (m.kind === 'voice') return 'Голосовое сообщение';
  if (m.kind === 'image') return m.text || 'Фото';
  if (m.kind === 'video') return m.text || 'Видео';
  if (m.kind === 'file') return m.text || 'Файл';
  return m.text || 'Сообщение';
}

/** Показывает уведомление о входящем сообщении. onOpen(chatId) вызывается по тапу. */
async function notifyMessage(m, chat, onOpen) {
  if ((await permissionState()) !== 'granted' || chat?.muted) return;
  const sender = m.sender?.display_name || m.sender?.username || 'Новое сообщение';
  const title = chat?.type === 'group' || chat?.type === 'channel' ? `${chat.title ?? ''}`.trim() || sender : sender;
  const text = chat?.type === 'group' ? `${sender}: ${bodyOf(m)}` : bodyOf(m);
  const icon = avatarSrc(m.sender?.avatar) || 'assets/icon-192.png';
  try {
    if (isNative() && cap()) {
      await cap().schedule({ notifications: [{ id: m.id % 2147483647, title, body: text, extra: { chatId: m.chat_id } }] });
      return;
    }
    const reg = await navigator.serviceWorker?.getRegistration();
    const opts = { body: text, icon, tag: `chat-${m.chat_id}`, renotify: true, data: { chatId: m.chat_id } };
    if (reg) { await reg.showNotification(title, opts); return; }
    const n = new Notification(title, opts);
    n.onclick = () => { window.focus(); onOpen?.(m.chat_id); n.close(); };
  } catch { /* уведомления — приятное дополнение, ошибки не должны ломать чат */ }
}

/** Регистрирует service worker и слушает тапы по уведомлениям. */
function initNotifications(onOpen) {
  if (isNative() && cap()) {
    cap().addListener?.('localNotificationActionPerformed', (e) => { const id = e?.notification?.extra?.chatId; if (id) onOpen(Number(id)); });
    return;
  }
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.type === 'open-chat') onOpen(Number(e.data.chatId)); });
}

  return { permissionState, askPermissionOnEntry, notifyMessage, initNotifications };
})();

__m["accounts.js"] = (function () {
  const { storage } = __m["storage.js"];
  const { TOKEN_KEY } = __m["config.js"];
/* Несколько аккаунтов на устройстве: у каждого своя сессия (токен) — переключение мгновенное, без пароля.
   Токены лежат только в localStorage этого устройства; данные в памяти приложения при переключении сбрасываются. */



const KEY = 'aqua.accounts';
const PREV = 'aqua.prev-token';

function listAccounts() {
  try { const v = JSON.parse(storage.get(KEY) || '[]'); return Array.isArray(v) ? v.filter((a) => a?.id && a?.token) : []; }
  catch { return []; }
}
const save = (list) => storage.set(KEY, JSON.stringify(list));

/** Запоминает/обновляет аккаунт (при входе и при смене профиля). */
function rememberAccount(user, token) {
  const list = listAccounts().filter((a) => a.id !== user.id);
  const old = listAccounts().find((a) => a.id === user.id);
  list.push({ id: user.id, username: user.username, display_name: user.display_name || user.username, avatar: user.avatar ?? null, token: token || old?.token });
  save(list.filter((a) => a.token));
}

function forgetAccount(id) { save(listAccounts().filter((a) => a.id !== id)); }

/** Переключиться: подменяем активный токен и перезагружаем приложение. */
function switchAccount(id) {
  const acc = listAccounts().find((a) => a.id === id);
  if (!acc) return false;
  storage.set(TOKEN_KEY, acc.token);
  storage.remove(PREV);
  location.reload();
  return true;
}

/** «Добавить аккаунт»: прячем текущую сессию и показываем вход; отмена вернёт её обратно. */
function startAddAccount() {
  const cur = storage.get(TOKEN_KEY);
  if (cur) storage.set(PREV, cur);
  storage.remove(TOKEN_KEY);
  location.reload();
}
const hasPrevSession = () => Boolean(storage.get(PREV));
function cancelAddAccount() {
  const prev = storage.get(PREV);
  storage.remove(PREV);
  if (prev) storage.set(TOKEN_KEY, prev);
  location.reload();
}
const clearPrev = () => storage.remove(PREV);

  return { listAccounts, rememberAccount, forgetAccount, switchAccount, startAddAccount, hasPrevSession, cancelAddAccount, clearPrev };
})();

__m["app.js"] = (function () {
  const { $ } = __m["dom.js"];
  const { debounce } = __m["dom.js"];
  const { api, mediaUrl, setToken, getToken, setUnauthorizedHandler } = __m["api.js"];
  const { AquaSocket } = __m["socket.js"];
  const { storage } = __m["storage.js"];
  const { haptic, initTapHaptics } = __m["haptics.js"];
  const { initEdgeSwipeBack, initViewportFix } = __m["touch.js"];
  const { TOKEN_KEY, PAGE_SIZE, TYPING_EXPIRE_MS, REACTIONS } = __m["config.js"];
  const { state, activeChat, peerOf, setChats, upsertChat, sortChats, setPresence, resetState, pendingToMessage } = __m["state.js"];
  const { toast } = __m["ui/toast.js"];
  const { initModals, openModal, closeModal } = __m["ui/modal.js"];
  const { initAuthView } = __m["ui/auth-view.js"];
  const { initChatList } = __m["ui/chat-list.js"];
  const { initChatView, setEmpty, renderHeader, renderStatus, renderMessages, appendMessage, resolvePending, markFailed, refreshTicks, setPinnedBar, scrollToMessage, prependMessages, setTyping, showLoader, scrollToBottom, setReactions, updateMessage, refreshMessages } = __m["ui/chat-view.js"];
  const { initComposer } = __m["ui/composer.js"];
  const { initPicker } = __m["ui/picker.js"];
  const { avatar } = __m["ui/avatar.js"];
  const { initProfile } = __m["ui/profile.js"];
  const { initSettings } = __m["ui/settings.js"];
  const { initPeerProfile } = __m["ui/peer-profile.js"];
  const { createAvatarViewer, initPullDown } = __m["ui/avatar-viewer.js"];
  const { initContacts } = __m["ui/contacts.js"];
  const { applyPrefs, applyCachedPrefs } = __m["theme.js"];
  const { copyText } = __m["ui/clipboard.js"];
  const { initSplash } = __m["ui/splash.js"];
  const { initReactions, closeReactionMenu } = __m["ui/reactions.js"];
  const { stopVoice } = __m["ui/voice-player.js"];
  const { initVoiceRecorder } = __m["ui/voice-recorder.js"];
  const { initFileManager } = __m["ui/file-manager.js"];
  const { initLightbox } = __m["ui/lightbox.js"];
  const { initSelection } = __m["ui/selection.js"];
  const { forwardMessages } = __m["ui/media-actions.js"];
  const { askDelete, askText } = __m["ui/dialogs.js"];
  const { initChannelProfile } = __m["ui/channel-profile.js"];
  const { getDraft, setDraft } = __m["drafts.js"];
  const { initNotifications, askPermissionOnEntry, notifyMessage } = __m["notify.js"];
  const { rememberAccount, forgetAccount, listAccounts, switchAccount, startAddAccount, hasPrevSession, cancelAddAccount, clearPrev } = __m["accounts.js"];
  const { openEditor } = __m["editor/editor-modal.js"];
/* Точка входа клиента Aqua: связывает API, WebSocket, состояние и UI-модули. */







































const app = $('#app');
// Текст сообщения выделяется только когда выделено само сообщение (режим выделения).
document.addEventListener('selectstart', (e) => { const n = e.target?.nodeType === 1 ? e.target : e.target?.parentElement; if (n?.closest('.msg') && !n.closest('.msg.is-selected')) e.preventDefault(); });
const socket = new AquaSocket(getToken);
const isMobileLayout = () => window.matchMedia('(max-width: 47.99rem)').matches;

let searchQuery = '';
let foundUsers = null;
let searchSeq = 0;
let connectedOnce = false;
let outageShown = false;

/* ============================== Экраны ============================== */
const showScreen = (name) => { app.dataset.screen = name; };
const renderList = () => chatList.render(searchQuery, foundUsers);

/* ============================== Авторизация ============================== */
async function authenticate(request) {
  const { token, user } = await request;
  storage.set(TOKEN_KEY, token);
  setToken(token);
  clearPrev();
  rememberAccount(user, token);
  await enterApp(user);
}

/** Профиль обновлён (нами или пришёл по WS): правим пользователя в чатах и перерисовываем. */
function renderNavAvatar() {
  const u = state.user; if (!u) return;
  $('#nav-avatar').replaceChildren(avatar(u.display_name || u.username, { user: u, small: true }));
}
function applyProfile(u) {
  if (u.id === state.user.id) { state.user = { ...state.user, ...u }; rememberAccount(state.user); }
  for (const chat of state.chats.values()) {
    chat.members = chat.members.map((m) => (m.id === u.id ? { ...m, ...u } : m));
    if (chat.type === 'direct' && chat.members.some((m) => m.id === u.id) && u.id !== state.user.id) chat.title = u.display_name || u.username;
  }
  profile.render();
  renderNavAvatar();
  renderList();
  const chat = activeChat();
  if (chat) renderHeader(chat);
}
const profile = initProfile({ onChange: applyProfile, onAvatars: () => ownViewer.open(state.user, true) });
const ownViewer = createAvatarViewer({ host: $('#profile-view'), onOwnChange: (u) => applyProfile(u) });
const peerViewer = createAvatarViewer({ host: $('#peer-view'), onOwnChange: () => {} });
const contacts = initContacts({ onOpen: (u) => { closeModal('modal-contacts'); openUser(u.username); } });
// Потянуть вниз в профиле — открыть фото крупно (свой и чужой профиль)
initPullDown($('#modal-settings .modal__body'), () => ownViewer.open(state.user, true), { target: $('#profile-avatar') });

applyCachedPrefs();
const settings = initSettings({
  onUsername: (u) => applyProfile(u),
  accounts: { list: listAccounts, current: () => state.user?.id, onSwitch: switchAccount, onAdd: startAddAccount },
  onUnblock: () => {},
});
const peerProfile = initPeerProfile({ onChange: () => {}, onAvatars: (u) => peerViewer.open(u, false) });
initPullDown($('#modal-peer .modal__body'), () => peerProfile.openAvatars(), { target: $('#peer-big-avatar') });

const authView = initAuthView({
  onLogin: (username, password) => authenticate(api.login(username, password)),
  onSendCode: (d) => api.registerCode(d),
  onRegister: (d) => authenticate(api.register(d)),
});

async function enterApp(user) {
  state.user = user;
  applyPrefs(user.prefs);
  renderNavAvatar();
  profile.render();
  setEmpty(true);
  await loadChats();                            // сначала данные, потом экран — без мигания пустого списка
  showScreen('chat');
  socket.connect();
  initNotifications((id) => { if (state.chats.has(id)) openChat(id); });
  askPermissionOnEntry();                       // при входе обязательно спрашиваем разрешение на уведомления
}

function logout(message) {
  if (state.user) forgetAccount(state.user.id);
  const next = listAccounts()[0];
  if (next && switchAccount(next.id)) return;                    // есть другой аккаунт — переходим в него
  socket.close();
  storage.remove(TOKEN_KEY);
  setToken(null);
  resetState();
  connectedOnce = false; outageShown = false; renderConn();
  searchQuery = ''; foundUsers = null; $('#search').value = '';
  closeModal('modal-settings'); closeModal('modal-prefs'); closeModal('modal-peer'); closeModal('modal-contacts'); closeModal('modal-channel');
  applyPrefs({}, { cache: false });
  stopMedia();
  app.dataset.chatOpen = 'false';
  picker.close();
  composer.reset();
  authView.reset();
  showScreen('auth');
  if (message) toast(message);
}

setUnauthorizedHandler(() => logout('Сессия истекла. Войдите снова.'));
socket.on('unauthorized', () => logout('Сессия истекла. Войдите снова.'));

/** Останавливает воспроизведение, запись голоса и закрывает меню реакций (при смене/закрытии чата). */
function stopMedia() {
  stopVoice();
  voiceRecorder.cancel();
  closeReactionMenu();
}

/* ============================== Чаты ============================== */
async function loadChats() {
  try {
    setChats(await api.listChats());
    renderList();
  } catch (e) { toast(e.message); }
}

async function openChat(id, { push = true } = {}) {
  const chat = state.chats.get(id);
  if (!chat) return;
  const wasOpen = app.dataset.chatOpen === 'true';
  stopMedia();
  state.activeChatId = id;
  state.unread.delete(id);
  app.dataset.chatOpen = 'true';
  // На телефоне диалог — «следующий экран»: добавляем запись в историю, чтобы системная кнопка «Назад» вела в список
  if (push && !wasOpen && isMobileLayout()) history.pushState({ chat: id }, '');
  setEmpty(false);
  selection.exit();
  renderHeader(chat);
  renderList();
  setTyping(Boolean(state.typing.get(id)?.size));
  composer.setText(getDraft(id));
  setPinnedBar(chat.pinned);

  if (state.history.has(id)) {
    renderMessages(chat);
  } else {
    state.history.set(id, { items: [], hasMore: true, loading: false });
    renderMessages(chat);
    await loadHistory(id, true);
  }
  composer.focus();
  markRead(chat);
}

function closeChat() {
  selection.exit();
  stopMedia();
  state.activeChatId = null;
  app.dataset.chatOpen = 'false';
  setEmpty(true);
  picker.close();
  composer.reset();
  renderList();
}

function goBack() {
  if (selection.active()) { selection.exit(); return; }       // стрелка в режиме выделения — выход из режима
  if (history.state?.chat) history.back();   // popstate вызовет closeChat
  else closeChat();
}
window.addEventListener('popstate', () => { if (state.activeChatId && isMobileLayout()) closeChat(); });

async function loadHistory(chatId, initial = false) {
  const h = state.history.get(chatId);
  if (!h || h.loading || (!initial && !h.hasMore)) return;
  h.loading = true;
  if (!initial) showLoader(true);
  try {
    const page = await api.getMessages(chatId, initial ? undefined : h.items[0]?.id, PAGE_SIZE);
    const chat = state.chats.get(chatId);
    const firstIso = h.items[0]?.created_at;
    h.hasMore = page.length === PAGE_SIZE;
    const known = new Set(h.items.map((m) => m.id));
    const fresh = page.filter((m) => !known.has(m.id));
    h.items = [...fresh, ...h.items];
    if (state.activeChatId === chatId) {
      if (initial) renderMessages(chat);
      else prependMessages(fresh, chat, firstIso);
    }
  } catch (e) {
    toast(e.message);
  } finally {
    h.loading = false;
    if (!initial) showLoader(false);
  }
}

/** После переподключения подтягиваем пропущенное. */
async function resync() {
  await loadChats();
  const id = state.activeChatId;
  const h = id && state.history.get(id);
  if (!h) return;
  try {
    const page = await api.getMessages(id, undefined, PAGE_SIZE);
    const known = new Set(h.items.map((m) => m.id));
    const missed = page.filter((m) => !known.has(m.id));
    if (missed.length) {
      h.items.push(...missed);
      if (state.activeChatId === id) renderMessages(state.chats.get(id));
    }
  } catch { /* повторим при следующем подключении */ }
}

/* ============================== Отправка ============================== */
const newClientId = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

function removePending(chatId, clientId) {
  const list = state.pending.get(chatId) ?? [];
  const p = list.find((x) => x.clientId === clientId);
  if (p?.localUrl) URL.revokeObjectURL(p.localUrl);
  if (p?.coverLocalUrl) URL.revokeObjectURL(p.coverLocalUrl);
  state.pending.set(chatId, list.filter((x) => x.clientId !== clientId));
}

/** Кладёт сообщение в очередь «отправляется»: показываем сразу, отправляем в фоне. */
function enqueue(draft) {
  const chat = activeChat();
  if (!chat) return;
  const list = state.pending.get(chat.id) ?? [];
  state.pending.set(chat.id, list);
  const p = { clientId: newClientId(), created_at: new Date().toISOString(), failed: false, kind: 'text', text: null, ...draft };
  list.push(p);
  appendMessage(pendingToMessage(p), chat, { forceScroll: true });
  dispatch(chat, p);
}

/** Отправка: голосовое сначала загружаем как медиа, затем шлём сообщение (WebSocket → запасной REST). */
async function dispatch(chat, p) {
  try {
    // Любое вложение сначала загружаем как медиа (повторная отправка не грузит заново)
    if (p.file && !p.mediaId) p.mediaId = (await api.uploadMedia(p.file)).id;
    if (p.coverFile && !p.coverId) p.coverId = (await api.uploadMedia(p.coverFile)).id;
    const payload = { chat_id: chat.id, text: p.text, media_id: p.mediaId ?? null, meta: p.meta ?? null, cover_id: p.coverId ?? null };

    // Если за 15 с подтверждения нет — помечаем неотправленным (тап — повторить)
    setTimeout(() => {
      const still = (state.pending.get(chat.id) ?? []).find((x) => x.clientId === p.clientId);
      if (still && !still.failed) { still.failed = true; markFailed(p.clientId, chat); }
    }, 15000);

    if (socket.send({ type: 'message', ...payload, client_id: p.clientId })) return;
    const message = await api.sendMessage(chat.id, p.text, payload.media_id, payload.meta, payload.cover_id);
    onMessage({ message, client_id: p.clientId });
  } catch (e) {
    p.failed = true;
    markFailed(p.clientId, chat);
    toast(e.message);
    haptic.error();
  }
}

function retrySend(clientId) {
  const chat = activeChat();
  const p = chat && (state.pending.get(chat.id) ?? []).find((x) => x.clientId === clientId);
  if (!p) return;
  p.failed = false;
  renderMessages(chat);
  dispatch(chat, p);
}

const sendText = (text) => enqueue({ text });

function sendVoice({ blob, mime, duration, wave }) {
  const ext = mime.includes('wav') ? 'wav' : mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';
  const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: mime });
  enqueue({ kind: 'voice', file, meta: { duration: Math.round(duration * 100) / 100, wave }, localUrl: URL.createObjectURL(blob) });
}

/** Файл с устройства: фото/видео → редактор, остальное отправляем сразу. */
async function handleFile(file) {
  if (!state.activeChatId) return;
  if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
    const res = await openEditor(file);
    if (!res) return;
    const kind = res.file.type.startsWith('video/') ? 'video' : 'image';
    enqueue({
      kind, file: res.file, text: res.caption || null, localUrl: URL.createObjectURL(res.file),
      ...(res.gif && kind === 'video' ? { meta: { gif: true } } : {}),
      ...(res.cover ? { coverFile: res.cover, coverLocalUrl: URL.createObjectURL(res.cover) } : {}),
    });
    return;
  }
  const kind = file.type.startsWith('audio/') ? 'voice' : 'file';
  if (kind === 'voice') { toast('Для голосовых используйте микрофон.'); return; }
  enqueue({ kind: 'file', file, localUrl: URL.createObjectURL(file) });
}

/** Уже загруженный файл из менеджера: фото/видео скачиваем в редактор, прочее шлём как есть. */
async function handleExisting(item) {
  if (item.kind === 'image' || item.kind === 'video') {
    try {
      const blob = await (await fetch(mediaUrl(item.url))).blob();
      await handleFile(new File([blob], item.name, { type: item.mime }));
    } catch { toast('Не удалось открыть файл.'); }
    return;
  }
  enqueue({ kind: item.kind, mediaId: item.id, mediaInfo: item, meta: null });
}

/* ============================== Действия с сообщениями ============================== */
const findMessage = (id) => state.history.get(state.activeChatId)?.items.find((m) => m.id === id);

function messageActions(id) {
  const m = findMessage(id);
  if (!m) return [];
  const mine = m.sender.id === state.user.id;
  const list = [{ icon: 'i-check', label: 'Выделить', run: () => selection.enter(id) }];
  if (m.text) list.push({ icon: 'i-copy', label: 'Копировать', run: async () => toast((await copyText(m.text)) ? 'Скопировано' : 'Не удалось скопировать') });
  if (mine && m.kind !== 'voice' && !m.meta?.sticker) {
    list.push({ icon: 'i-edit', label: 'Изменить', run: () => composer.startEdit({ id: m.id, text: m.text, allowEmpty: m.kind !== 'text' }) });
  }
  list.push({ icon: 'i-trash', label: 'Удалить у меня', danger: true, run: () => removeMessage(id, 'me') });
  if (mine) list.push({ icon: 'i-trash', label: 'Удалить у всех', danger: true, confirm: 'Точно удалить у всех?', run: () => removeMessage(id, 'all') });
  return list;
}

async function removeMessage(id, scope) {
  try {
    const res = await api.deleteMessage(id, scope);
    applyDeleted({ chat_id: res.chat_id, message_id: id, last_message: undefined });   // WS-событие уточнит «последнее сообщение»
  } catch (e) { toast(e.message); haptic.error(); }
}

async function saveEdit(id, text) {
  try { applyEdited(await api.editMessage(id, text)); }
  catch (e) { toast(e.message); haptic.error(); }
}

/** Сообщение изменено (нами или собеседником). Идемпотентно: вызывается и из ответа API, и из WS. */
function applyEdited(m) {
  const h = state.history.get(m.chat_id);
  const i = h?.items.findIndex((x) => x.id === m.id) ?? -1;
  if (i >= 0) h.items[i] = { ...h.items[i], ...m };
  const chat = state.chats.get(m.chat_id);
  if (chat?.last_message?.id === m.id) chat.last_message = { ...chat.last_message, ...m };
  if (m.chat_id === state.activeChatId && chat) updateMessage(h?.items[i] ?? m, chat);
  renderList();
}

/** Сообщение удалено (у всех или только у нас). */
function applyDeleted({ chat_id: chatId, message_id: id, last_message: last }) {
  const h = state.history.get(chatId);
  if (h) h.items = h.items.filter((x) => x.id !== id);
  const chat = state.chats.get(chatId);
  if (chat) {
    if (last !== undefined) chat.last_message = last;
    else if (chat.last_message?.id === id) chat.last_message = h?.items.at(-1) ?? chat.last_message;   // временно, до WS-события
    sortChats();
  }
  if (chatId === state.activeChatId && chat) refreshMessages(chat);
  renderList();
}

/* ============================== Реакции ============================== */
function applyReactions(chatId, messageId, reactions) {
  const m = state.history.get(chatId)?.items.find((x) => x.id === messageId);
  if (m) m.reactions = reactions;
  const last = state.chats.get(chatId)?.last_message;
  if (last?.id === messageId) last.reactions = reactions;
  if (chatId === state.activeChatId) setReactions(messageId, reactions);
}

async function pickReaction(messageId, emoji) {
  const chatId = state.activeChatId;
  try {
    const res = await api.toggleReaction(messageId, emoji);
    applyReactions(chatId, messageId, res.reactions);
  } catch (e) { toast(e.message); }
}

/** Отмечает чат прочитанным (до последнего входящего сообщения) — у собеседника появятся две галочки. */
function markRead(chat = activeChat()) {
  if (!chat || chat.id !== state.activeChatId || document.hidden) return;
  const items = state.history.get(chat.id)?.items ?? [];
  const last = [...items].reverse().find((m) => m.sender.id !== state.user.id && /^\d+$/.test(String(m.id)));
  if (!last) return;
  chat.reads ??= {};
  if ((chat.reads[state.user.id] ?? 0) >= last.id) return;
  chat.reads[state.user.id] = last.id;
  api.markRead(chat.id, last.id).catch(() => {});
}
document.addEventListener('visibilitychange', () => markRead());
window.addEventListener('focus', () => markRead());

/* ============================== События сервера ============================== */
function onMessage({ message: m, client_id: clientId }) {
  const chat = state.chats.get(m.chat_id);
  if (!chat) { loadChats(); return; }          // сообщение из нового, ещё неизвестного чата

  const mine = m.sender.id === state.user.id;
  chat.last_message = m;
  sortChats();
  clearTyper(m.chat_id, m.sender.id, { silent: true });

  const h = state.history.get(m.chat_id);
  const known = Boolean(h?.items.some((x) => x.id === m.id));
  if (h && !known) h.items.push(m);
  if (clientId) removePending(m.chat_id, clientId);

  const active = m.chat_id === state.activeChatId;
  if (active) {
    const replaced = clientId ? resolvePending(clientId, m, chat) : false;
    if (!replaced && !known) appendMessage(m, chat, { forceScroll: mine });
    renderStatus(chat);
    setTyping(Boolean(state.typing.get(m.chat_id)?.size));
    if (!mine) markRead(chat);
  }
  if (!mine) {
    if (!(active && !document.hidden)) state.unread.set(m.chat_id, (state.unread.get(m.chat_id) || 0) + 1);
    haptic.receive();
    if (document.hidden || !active) notifyMessage(m, chat, (id) => openChat(id));
  }
  renderList();
}

/* --- «печатает…» --- */
function setTyper(chatId, userId, username) {
  let map = state.typing.get(chatId);
  if (!map) { map = new Map(); state.typing.set(chatId, map); }
  clearTimeout(map.get(userId)?.timer);
  // Если обновление не пришло — сами гасим индикатор
  map.set(userId, { username, timer: setTimeout(() => clearTyper(chatId, userId), TYPING_EXPIRE_MS) });
  refreshTyping(chatId);
}

function clearTyper(chatId, userId, { silent = false } = {}) {
  const map = state.typing.get(chatId);
  const t = map?.get(userId);
  if (!t) return;
  clearTimeout(t.timer);
  map.delete(userId);
  if (!silent) refreshTyping(chatId);
}

function refreshTyping(chatId) {
  renderList();
  if (chatId === state.activeChatId) {
    renderStatus(state.chats.get(chatId));
    setTyping(Boolean(state.typing.get(chatId)?.size));
  }
}

/* Статус соединения: вместо всплывающих уведомлений — надпись рядом с «Aqua» и в шапке чата вместо «в сети» */
const CONN_TEXT = { waiting: 'Ожидание сети...', connecting: 'Соединение...', updating: 'Обновление...' };
let updating = false;
function renderConn() {
  let key = '';
  if (state.user) key = !navigator.onLine ? 'waiting' : socket.state !== 'open' ? 'connecting' : updating ? 'updating' : '';
  state.conn = CONN_TEXT[key] || '';
  const node = $('#conn-status');
  node.hidden = !state.conn; node.textContent = state.conn;
  const chat = activeChat();
  if (chat) renderStatus(chat);
}
window.addEventListener('online', renderConn);
window.addEventListener('offline', renderConn);
socket.on('ready', async () => {
  if (connectedOnce) { updating = true; renderConn(); await resync(); updating = false; }
  connectedOnce = true;
  renderConn();
});
socket.on('state', renderConn);
socket.on('blocked_me', ({ user_id, value }) => {
  for (const chat of state.chats.values()) chat.members = chat.members.map((m) => (m.id === user_id ? { ...m, blocked_me: value } : m));
  const chat = activeChat(); if (chat) renderStatus(chat);
});
socket.on('message', onMessage);
socket.on('typing', ({ chat_id, user_id, username, is_typing }) =>
  is_typing ? setTyper(chat_id, user_id, username) : clearTyper(chat_id, user_id));
socket.on('presence', ({ user_id, online, last_seen }) => {
  setPresence(user_id, online, last_seen);
  renderList();
  const chat = activeChat();
  if (chat) renderHeader(chat);
});
socket.on('profile', ({ user }) => applyProfile(user));
socket.on('read', ({ chat_id, user_id, up_to }) => {
  const chat = state.chats.get(chat_id); if (!chat) return;
  chat.reads = { ...(chat.reads ?? {}), [user_id]: Math.max(chat.reads?.[user_id] ?? 0, up_to) };
  if (chat_id === state.activeChatId) refreshTicks();
});
socket.on('pinned', ({ chat_id, message }) => {
  const chat = state.chats.get(chat_id); if (!chat) return;
  chat.pinned = message;
  if (chat_id === state.activeChatId) setPinnedBar(message);
});
socket.on('message_edited', ({ message }) => applyEdited(message));
socket.on('message_deleted', (e) => { applyDeleted(e); const c = state.chats.get(e.chat_id); if (c?.pinned?.id === e.message_id && e.scope === 'all') { c.pinned = null; if (e.chat_id === state.activeChatId) setPinnedBar(null); } selection.prune(); });
socket.on('reaction', ({ chat_id, message_id, reactions }) => applyReactions(chat_id, message_id, reactions));
socket.on('chat_created', ({ chat }) => { upsertChat(chat); renderList(); });
socket.on('error', ({ detail }) => {
  toast(detail || 'Ошибка сервера');
  haptic.error();
  // Сервер не говорит, какое сообщение отклонено, — помечаем самое старое отправляемое
  const chat = activeChat();
  const p = chat && (state.pending.get(chat.id) ?? []).find((x) => !x.failed);
  if (p) { p.failed = true; markFailed(p.clientId, chat); }
});

/* ============================== Поиск ============================== */
const searchUsers = debounce(async (q) => {
  const mySeq = ++searchSeq;
  try {
    const users = await api.searchUsers(q);
    if (mySeq === searchSeq) { foundUsers = users; renderList(); }
  } catch { /* поиск по локальным чатам продолжает работать */ }
}, 250);

$('#search').addEventListener('input', (e) => {
  searchQuery = e.target.value.slice(0, 32);
  if (searchQuery.trim()) searchUsers(searchQuery.trim());
  else { searchSeq += 1; foundUsers = null; }
  renderList();
});

async function openUser(username) {
  try {
    const chat = await api.createDirectChat(username);
    upsertChat(chat);
    searchQuery = ''; foundUsers = null; $('#search').value = '';
    await openChat(chat.id);
  } catch (e) { toast(e.message); }
}

/** Карандаш: создать канал (название и @username). Создатель — администратор, публиковать могут только админы. */
async function createChannel() {
  const title = await askText({ title: 'Название канала', placeholder: 'Например, Новости Aqua', max: 64 });
  if (!title) return;
  const username = await askText({ title: 'Публичный @username канала', placeholder: 'latin_letters_123', max: 32, ok: 'Создать' });
  if (!username) return;
  try {
    const chat = await api.createChannel(title, username.replace(/^@/, ''));
    upsertChat(chat); renderList();
    await openChat(chat.id);
  } catch (e) { toast(e.message); }
}
$('#btn-new-channel').addEventListener('click', createChannel);

/* ============================== Сборка UI ============================== */
const chatList = initChatList({ onOpenChat: (id) => openChat(id), onOpenUser: openUser });
initChatView({
  loadMore: () => loadHistory(state.activeChatId),
  retry: retrySend,
});
const composer = initComposer({
  onSend: (text) => sendText(text),
  onEdit: saveEdit,
  onTyping: (isTyping) => { if (state.activeChatId) socket.send({ type: 'typing', chat_id: state.activeChatId, is_typing: isTyping }); },
  onAttach: () => { if (state.activeChatId) fileManager.open(); },
  onVoice: () => { if (state.activeChatId) voiceRecorder.start(); },
  onEmoji: () => picker.toggle(),
  onDraft: (text) => { if (state.activeChatId) setDraft(state.activeChatId, text); },
});

/** Панель смайликов/стикеров/GIF: смайлик вставляется в текст, стикер и GIF уходят отдельным сообщением. */
const picker = initPicker({
  onEmoji: (e) => composer.insert(e),
  onGif: async (it) => {
    if (!state.activeChatId) return;
    try {
      if (it.saved) {                                              // из «Сохранённых»: файл уже наш
        const m = it.saved;
        enqueue({ kind: m.kind, mediaId: m.id, mediaInfo: m, meta: { gif: true } });
      } else {                                                     // из поиска: скачиваем на сервер и отправляем
        const media = await api.gifImport(it.url, it.title);
        enqueue({ kind: 'image', mediaId: media.id, mediaInfo: media, meta: { gif: true } });
      }
      picker.close();
    } catch (e) { toast(e.message || 'Не удалось отправить GIF.'); haptic.error(); }
  },
  onSticker: (s) => {
    if (!state.activeChatId) return;
    enqueue({ kind: 'image', mediaId: s.media_id, mediaInfo: { id: s.media_id, url: s.url, name: 'sticker', mime: 'image/webp', size: 0 }, meta: { sticker: s.id, pack: s.pack_id } });
    setTimeout(() => { if (picker.isOpen() && picker.tab() === 'stickers') picker.reloadStickers(); }, 900);   // «недавние» обновятся
  },
  onTabChange: (tab) => composer.setPickerIcon(tab),
  onToggle: (open) => composer.setPickerOpen(open),
});

const fileManager = initFileManager({ onDeviceFile: handleFile, onPickExisting: handleExisting });
initLightbox({ container: $('#messages'), getMessage: findMessage, onDelete: (id, mine) => removeMessage(id, mine ? 'all' : 'me') });
const voiceRecorder = initVoiceRecorder({ onSend: sendVoice, onError: (msg) => { toast(msg); haptic.error(); } });
const selection = initSelection({
  container: $('#messages'),
  getMessage: findMessage,
  isPinned: (id) => activeChat()?.pinned?.id === id,
  onCopy: async (list) => toast((await copyText(list.map((m) => m.text).filter(Boolean).join('\n'))) ? 'Скопировано' : 'Не удалось скопировать'),
  onEdit: (m) => composer.startEdit({ id: m.id, text: m.text, allowEmpty: m.kind !== 'text' }),
  onPin: (m) => pinMessage(m.id),
  onForward: (ids) => forwardMessages(ids),
  onDelete: async (list) => {
    const res = await askDelete({ count: list.length, canAll: list.every((m) => m.sender.id === state.user.id) });
    if (!res) return false;
    await Promise.all(list.map((m) => removeMessage(m.id, res.all ? 'all' : 'me')));
    return true;
  },
});

async function pinMessage(id) {
  const chat = activeChat(); if (!chat) return;
  const unpin = chat.pinned?.id === id || id === null;
  try { await api.pinMessage(chat.id, unpin ? null : id); } catch (e) { toast(e.message || 'Не удалось закрепить.'); }
}
$('#pinned-clear').addEventListener('click', () => pinMessage(null));
$('#pinned-go').addEventListener('click', () => { const id = Number($('#pinned-bar').dataset.id); if (id && !scrollToMessage(id)) toast('Сообщение находится выше — прокрутите историю.'); });

initReactions({
  container: $('#messages'),
  onPick: pickReaction,
  getQuick: () => state.user.prefs?.quick_reaction || REACTIONS[0],
  getActions: messageActions,
  onLongSelect: (id) => selection.enter(id),
  getMine: (id) => (state.history.get(state.activeChatId)?.items.find((m) => m.id === id)?.reactions ?? [])
    .filter((r) => r.users.includes(state.user.id)).map((r) => r.emoji),
});

$('#btn-back').addEventListener('click', goBack);
$('#profile-settings-btn').addEventListener('click', () => { settings.render(); openModal('modal-prefs'); });
const channelProfile = initChannelProfile({ onChange: (c) => { upsertChat(c); renderList(); if (state.activeChatId === c.id) renderStatus(c); } });
const openPeer = () => {
  const c = activeChat();
  if (c?.type === 'channel') return channelProfile.open(c);
  const p = peerOf(c ?? { type: '' }); if (p) peerProfile.open(p.id);
};
$('#chat-peer').addEventListener('click', openPeer);
$('#chat-peer').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPeer(); } });
$('#messages').addEventListener('click', (e) => {
  const a = e.target.closest('.msg__author[data-user-id]');
  if (a && Number(a.dataset.userId) !== state.user.id) peerProfile.open(Number(a.dataset.userId));
});
/* Вкладки нижней панели — страницы: переключаются между собой, без крестика и подложки */
const TABS = ['modal-settings', 'modal-prefs', 'modal-contacts'];
function openTab(id) { for (const t of TABS) if (t !== id) closeModal(t); openModal(id); }
$('#nav-profile').addEventListener('click', () => { ownViewer.close(); profile.render(); openTab('modal-settings'); });
$('#nav-settings').addEventListener('click', () => { settings.render(); openTab('modal-prefs'); });
$('#nav-contacts').addEventListener('click', () => { contacts.render(); openTab('modal-contacts'); });
/* Выделение выбранной вкладки нижней панели плавно переезжает к нажатой кнопке */
const navPill = $('#nav-pill');
function moveNavPill(btn) {
  if (!btn || !navPill) return;
  navPill.style.width = `${btn.offsetWidth}px`;
  navPill.style.transform = `translateX(${btn.offsetLeft}px)`;
}
function setNavActive(btn) {
  document.querySelectorAll('.nav__item').forEach((b) => { const on = b === btn; b.classList.toggle('is-active', on); on ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'); });
  moveNavPill(btn);
}
document.querySelectorAll('.nav__item').forEach((b) => b.addEventListener('click', () => setNavActive(b)));
window.addEventListener('resize', () => moveNavPill(document.querySelector('.nav__item.is-active')));
/* Панель скрыта, пока идёт загрузка (ширина кнопок 0): ставим пилюлю на место, как только она появилась или изменилась */
if ('ResizeObserver' in window) new ResizeObserver(() => moveNavPill(document.querySelector('.nav__item.is-active'))).observe($('#nav'));
requestAnimationFrame(() => moveNavPill(document.querySelector('.nav__item.is-active')));
$('#nav-chats').addEventListener('click', () => { for (const m of ['modal-settings', 'modal-prefs', 'modal-contacts', 'modal-peer', 'modal-channel']) closeModal(m); $('#chat-list').scrollTo({ top: 0, behavior: 'smooth' }); });
$('#btn-logout').addEventListener('click', () => logout());

initModals();
initTapHaptics();
initEdgeSwipeBack($('#screen-chat'), () => { if (state.activeChatId && isMobileLayout()) goBack(); });
initViewportFix(() => { if (state.activeChatId) scrollToBottom(); });

/* ============================== Запуск ============================== */
initSplash();                                   // заставка идёт параллельно с загрузкой данных

(async function boot() {
  const saved = storage.get(TOKEN_KEY);
  if (saved) {
    setToken(saved);
    try {
      const me = await api.me();
      rememberAccount(me, saved);
      await enterApp(me);
      return;
    } catch { /* токен недействителен или нет сети — показываем вход */ }
  }
  $('#auth-cancel').hidden = !hasPrevSession();
  showScreen('auth');
})();
$('#auth-cancel').addEventListener('click', cancelAddAccount);

window.__aquaStarted?.();                       // сообщаем стражу (boot-check.js), что модули загрузились

  return {};
})();

})();