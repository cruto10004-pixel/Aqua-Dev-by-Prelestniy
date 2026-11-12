/* Вкладка «Стикеры»: лента (сверху вниз) — Избранные, Недавние (последние 30), затем стикерпаки;
   внизу полоса с превью паков (превью = первый добавленный стикер) и кнопкой «создать стикерпак».
   Стикер: тап — отправить, долгое нажатие — крупный план с действиями. */
import { $, el, icon } from '../dom.js';
import { api, mediaUrl } from '../api.js';
import { toast } from './toast.js';
import { askText } from './dialogs.js';
import { openModal, closeModal } from './modal.js';
import { saveToGallery } from './media-actions.js';
import { haptic } from '../haptics.js';

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
export function showStickerPreview(s, ctx = {}) {
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
export async function openPackViewer(packId, { onChange } = {}) {
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
export function initStickers({ feed, packsBar, onSend }) {
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
