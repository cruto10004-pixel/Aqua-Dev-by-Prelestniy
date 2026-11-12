/* Увеличение аватарки прямо в профиле: на месте кружка раскрывается карусель всех фото профиля.
   У своего профиля — меню ⋮ (сделать основным, удалить). */
import { el, icon } from '../dom.js';
import { api, mediaUrl } from '../api.js';
import { toast } from './toast.js';

/** host — контейнер профиля (внутри него есть .profile__avatar). */
export function createAvatarViewer({ host, onOwnChange }) {
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
export function initPullDown(scroller, onPull, { threshold = 70, target = null } = {}) {
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
