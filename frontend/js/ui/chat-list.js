/* Боковая панель: список чатов, поиск, результаты поиска пользователей. */
import { getDraft } from '../drafts.js';
import { $, el } from '../dom.js';
import { state, peerOf } from '../state.js';
import { avatar } from './avatar.js';
import { listTime } from '../format.js';

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
export function initChatList({ onOpenChat, onOpenUser }) {
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
