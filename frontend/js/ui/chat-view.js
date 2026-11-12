/* Окно переписки: шапка, лента сообщений, индикатор «печатает…», подгрузка истории. */
import { $, el, icon } from '../dom.js';
import { state, peerOf, pendingToMessage } from '../state.js';
import { voicePlayer } from './voice-player.js';
import { avatar } from './avatar.js';
import { mediaUrl } from '../api.js';
import { timeHM, dayKey, dayLabel, lastSeenText, formatSize } from '../format.js';

const messagesEl = $('#messages');
const typingEl = $('#typing-indicator');
const chatEl = $('.chat');
let lastDay = null;          // ключ дня последнего отрисованного сообщения
let onLoadMore = () => {};
let onRetry = () => {};

const nearBottom = () => messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 140;
export const scrollToBottom = (smooth = false) =>
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
export function refreshTicks() {
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
export function setPinnedBar(message) {
  pinnedBar.hidden = !message;
  pinnedBar.dataset.id = message?.id ?? '';
  if (message) $('#pinned-text').textContent = message.text || ({ image: 'Фото', video: 'Видео', voice: 'Голосовое сообщение', file: 'Файл' }[message.kind] ?? '');
}

/** Прокрутка к сообщению (если оно загружено) с подсветкой. */
export function scrollToMessage(id) {
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
export function setReactions(messageId, reactions) {
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

export function initChatView({ loadMore, retry }) {
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
export function setEmpty(empty) { chatEl.dataset.empty = String(empty); }

export function renderHeader(chat) {
  const peer = peerOf(chat);
  $('#peer-avatar').replaceChildren(avatar(chat.title, { online: Boolean(peer?.online), small: true, user: peer }));
  $('#peer-name').textContent = chat.title;
  renderStatus(chat);
}

export function renderStatus(chat) {
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
export function renderMessages(chat) {
  const h = state.history.get(chat.id);
  const items = [...(h?.items ?? []), ...(state.pending.get(chat.id) ?? []).map(pendingToMessage)];
  lastDay = null;
  messagesEl.replaceChildren(...buildNodes(items, chat), typingEl);
  scrollToBottom();
}

/** Добавляет одно сообщение в конец; прокручивает вниз, если пользователь и так внизу (или это его сообщение). */
export function appendMessage(m, chat, { forceScroll = false } = {}) {
  const stick = forceScroll || nearBottom();
  insertNodes(buildNodes([m], chat, { animate: true }));
  if (stick) scrollToBottom(true);
}

/** Обновляет показанное сообщение (после изменения текста) без перерисовки всей ленты. */
export function updateMessage(m, chat) {
  const node = messagesEl.querySelector(`.msg[data-id="${m.id}"]`);
  if (node) node.replaceWith(messageNode(m, { group: chat.type === 'group' }));
}

/** Перерисовка ленты с сохранением места прокрутки (после удаления сообщения). */
export function refreshMessages(chat) {
  const top = messagesEl.scrollTop, wasBottom = nearBottom();
  const h = state.history.get(chat.id);
  const items = [...(h?.items ?? []), ...(state.pending.get(chat.id) ?? []).map(pendingToMessage)];
  lastDay = null;
  messagesEl.replaceChildren(...buildNodes(items, chat), typingEl);
  if (wasBottom) scrollToBottom(); else messagesEl.scrollTop = top;
}

/** Заменяет «временное» сообщение настоящим. Возвращает false, если временного узла нет в ленте. */
export function resolvePending(clientId, real, chat) {
  const node = messagesEl.querySelector(`.msg[data-client-id="${CSS.escape(clientId)}"]`);
  if (!node) return false;
  node.replaceWith(messageNode(real, { group: chat.type === 'group' }));
  return true;
}

export function markFailed(clientId, chat) {
  const node = messagesEl.querySelector(`.msg[data-client-id="${CSS.escape(clientId)}"]`);
  const p = (state.pending.get(chat.id) ?? []).find((x) => x.clientId === clientId);
  if (node && p) node.replaceWith(messageNode(pendingToMessage({ ...p, failed: true }), { failed: true, group: chat.type === 'group' }));
}

/** Вставляет старые сообщения в начало, сохраняя положение прокрутки.
 *  @param {string|undefined} firstShownIso — время самого старого из уже показанных сообщений
 *  (нужно, чтобы не дублировать разделитель дня на стыке). */
export function prependMessages(items, chat, firstShownIso) {
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

export function setTyping(visible) {
  const stick = nearBottom();
  typingEl.hidden = !visible;
  if (visible && stick) scrollToBottom(true);
}

export function showLoader(visible) {
  let node = $('#history-loader');
  if (visible && !node) {
    node = el('div', { id: 'history-loader', class: 'history-loader' }, el('div', { class: 'spinner' }));
    messagesEl.prepend(node);
  } else if (!visible && node) node.remove();
}
