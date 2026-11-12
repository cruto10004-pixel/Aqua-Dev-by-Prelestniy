/* Аватар: своя картинка, системная заготовка или инициалы; индикатор «онлайн». */
import { el } from '../dom.js';
import { initials, hueFor } from '../format.js';
import { mediaUrl } from '../api.js';

/** Адрес картинки аватара пользователя (или null, если аватара нет). */
export function avatarSrc(av) {
  if (!av) return null;
  if (av.preset) return `assets/avatars/${av.preset}.svg`;
  return av.url ? mediaUrl(av.url) : null;
}

export function avatar(name, { online = false, small = false, user = null, big = false } = {}) {
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
