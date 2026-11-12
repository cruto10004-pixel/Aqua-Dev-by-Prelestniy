/* Точка входа клиента Aqua: связывает API, WebSocket, состояние и UI-модули. */
import { $ } from './dom.js';
import { debounce } from './dom.js';
import { api, mediaUrl, setToken, getToken, setUnauthorizedHandler } from './api.js';
import { AquaSocket } from './socket.js';
import { storage } from './storage.js';
import { haptic, initTapHaptics } from './haptics.js';
import { initEdgeSwipeBack, initViewportFix } from './touch.js';
import { TOKEN_KEY, PAGE_SIZE, TYPING_EXPIRE_MS, REACTIONS } from './config.js';
import {
  state, activeChat, peerOf, setChats, upsertChat, sortChats, setPresence, resetState, pendingToMessage,
} from './state.js';
import { toast } from './ui/toast.js';
import { initModals, openModal, closeModal } from './ui/modal.js';
import { initAuthView } from './ui/auth-view.js';
import { initChatList } from './ui/chat-list.js';
import {
  initChatView, setEmpty, renderHeader, renderStatus, renderMessages, appendMessage,
  resolvePending, markFailed, refreshTicks, setPinnedBar, scrollToMessage, prependMessages, setTyping, showLoader, scrollToBottom, setReactions,
  updateMessage, refreshMessages,
} from './ui/chat-view.js';
import { initComposer } from './ui/composer.js';
import { initPicker } from './ui/picker.js';
import { avatar } from './ui/avatar.js';
import { initProfile } from './ui/profile.js';
import { initSettings } from './ui/settings.js';
import { initPeerProfile } from './ui/peer-profile.js';
import { createAvatarViewer, initPullDown } from './ui/avatar-viewer.js';
import { initContacts } from './ui/contacts.js';
import { applyPrefs, applyCachedPrefs } from './theme.js';
import { copyText } from './ui/clipboard.js';
import { initSplash } from './ui/splash.js';
import { initReactions, closeReactionMenu } from './ui/reactions.js';
import { stopVoice } from './ui/voice-player.js';
import { initVoiceRecorder } from './ui/voice-recorder.js';
import { initFileManager } from './ui/file-manager.js';
import { initLightbox } from './ui/lightbox.js';
import { initSelection } from './ui/selection.js';
import { forwardMessages } from './ui/media-actions.js';
import { askDelete, askText } from './ui/dialogs.js';
import { initChannelProfile } from './ui/channel-profile.js';
import { getDraft, setDraft } from './drafts.js';
import { initNotifications, askPermissionOnEntry, notifyMessage } from './notify.js';
import { rememberAccount, forgetAccount, listAccounts, switchAccount, startAddAccount, hasPrevSession, cancelAddAccount, clearPrev } from './accounts.js';
import { openEditor } from './editor/editor-modal.js';

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
