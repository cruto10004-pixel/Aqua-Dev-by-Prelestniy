/* Профиль собеседника: открывается по клику на аватарку/ник в чате. Меню ⋮: контакт и блокировка. */
import { $, el } from '../dom.js';
import { api } from '../api.js';
import { avatar } from './avatar.js';
import { toast } from './toast.js';
import { openModal, closeModal } from './modal.js';
import { lastSeenText } from '../format.js';

export function initPeerProfile({ onChange, onAvatars }) {
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
