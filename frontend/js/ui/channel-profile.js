/* Страница канала: подписчикам — название, описание, ссылка, списки; администратору — карандаш справа сверху
   и «Настройки канала» (название, описание). Окно открывается как страница: назад, без крестика. */
import { $, el } from '../dom.js';
import { api } from '../api.js';
import { avatar } from './avatar.js';
import { toast } from './toast.js';
import { openModal, closeModal } from './modal.js';

const ID = 'modal-channel';

export function initChannelProfile({ onChange }) {
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
