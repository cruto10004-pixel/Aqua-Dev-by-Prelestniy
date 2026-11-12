/* Внутренний файловый менеджер Aqua (вместо системного окна выбора файла).
   Корень: «папки» (Фото / Видео / Голосовые / Файлы с количеством) и сетка последних загрузок.
   Кнопка «С устройства» открывает скрытый <input type="file">. */
import { $, el, icon } from '../dom.js';
import { api, mediaUrl } from '../api.js';
import { openModal, closeModal } from './modal.js';
import { toast } from './toast.js';
import { formatSize } from '../format.js';

const FOLDERS = [
  { kind: 'image', label: 'Фото', icon: 'i-photo' },
  { kind: 'video', label: 'Видео', icon: 'i-video' },
  { kind: 'voice', label: 'Голосовые', icon: 'i-mic' },
  { kind: 'file',  label: 'Файлы', icon: 'i-file' },
];

function cell(item, onPick) {
  const url = mediaUrl(item.url);
  let inner;
  if (item.kind === 'image') inner = el('img', { src: url, alt: item.name, loading: 'lazy' });
  else if (item.kind === 'video') inner = [el('video', { src: `${url}#t=0.1`, preload: 'metadata', muted: true, playsinline: true, 'aria-hidden': 'true' }),
    el('span', { class: 'media-cell__badge' }, icon('i-play', 'icon--white icon--sm'))];
  else inner = [icon(item.kind === 'voice' ? 'i-mic' : 'i-file', 'icon--lg'), el('b', { text: item.name }), el('small', { text: formatSize(item.size) })];
  return el('button', {
    class: `media-cell${item.kind === 'image' || item.kind === 'video' ? '' : ' media-cell--file'}`,
    type: 'button', 'aria-label': item.name, onclick: () => onPick(item),
  }, inner);
}

/** @param {{onDeviceFile:(f:File)=>void, onPickExisting:(item:object)=>void}} cfg */
export function initFileManager({ onDeviceFile, onPickExisting }) {
  const body = $('#fm-body');
  const backBtn = $('#fm-back');
  const title = $('#fm-title');
  const input = $('#file-input');
  let token = 0;                                     // защита от «гонок» при быстрой навигации

  const pick = (item) => { closeModal('modal-files'); onPickExisting(item); };
  const grid = (items) => items.length
    ? el('div', { class: 'grid-media' }, items.map((i) => cell(i, pick)))
    : el('p', { class: 'sidebar__empty', text: 'Здесь пока пусто. Загрузите файл с устройства.' });

  async function showRoot() {
    const mine = ++token;
    title.textContent = 'Файлы'; backBtn.hidden = true;
    body.replaceChildren(el('div', { class: 'spinner', style: 'margin:2rem auto' }));
    try {
      const [summary, recent] = await Promise.all([api.mediaSummary(), api.recentMedia()]);
      if (mine !== token) return;
      body.replaceChildren(
        el('h3', { class: 'list-heading', text: 'Папки' }),
        el('div', { class: 'folders' }, FOLDERS.map((f) => el('button', {
          class: 'folder-tile', type: 'button', onclick: () => showFolder(f),
        }, icon(f.icon, 'icon--lg'), el('b', { text: f.label }), el('small', { text: String(summary[f.kind] ?? 0) })))),
        el('h3', { class: 'list-heading', text: 'Недавние' }),
        grid(recent.filter((m) => m.kind !== 'voice').slice(0, 24)),
      );
    } catch (e) { if (mine === token) body.replaceChildren(el('p', { class: 'sidebar__empty', text: e.message })); }
  }

  async function showFolder(folder) {
    const mine = ++token;
    title.textContent = folder.label; backBtn.hidden = false;
    body.replaceChildren(el('div', { class: 'spinner', style: 'margin:2rem auto' }));
    try {
      const items = await api.recentMedia(folder.kind);
      if (mine === token) body.replaceChildren(grid(items));
    } catch (e) { if (mine === token) body.replaceChildren(el('p', { class: 'sidebar__empty', text: e.message })); }
  }

  backBtn.addEventListener('click', showRoot);
  $('#fm-device').addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;                                 // value сбрасываем при следующем открытии (open),
                                                       // чтобы не ломать чтение файла у части браузеров
    closeModal('modal-files');
    onDeviceFile(file);
  });

  return { open() { input.value = ''; openModal('modal-files'); showRoot().catch((e) => toast(e.message)); } };
}
