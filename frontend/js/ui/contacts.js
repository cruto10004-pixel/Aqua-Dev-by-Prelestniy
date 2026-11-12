/* Окно «Контакты»: список добавленных пользователей; нажатие открывает чат. */
import { $, el } from '../dom.js';
import { api } from '../api.js';
import { avatar } from './avatar.js';

export function initContacts({ onOpen }) {
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
