/* Просмотр фото/видео на весь экран + мини-меню ⋮ в ленте.
   Видео: свой плеер — скорость, перемотка двойным тапом (слева −10 с, справа +10 с), кнопка «альбомный режим». */
import { $, el, icon } from '../dom.js';
import { mediaUrl } from '../api.js';
import { state } from '../state.js';
import { toast } from './toast.js';
import { saveToGallery, saveGif, forwardMessages, isGifMessage } from './media-actions.js';
import { openPackViewer } from './stickers.js';

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
export function initLightbox({ container, getMessage, onDelete }) {
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
