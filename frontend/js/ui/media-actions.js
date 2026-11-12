/* Действия с медиа: сохранить в галерею (скачать/«поделиться» на телефоне) и переслать в другой чат. */
import { $, el } from '../dom.js';
import { api, mediaUrl } from '../api.js';
import { state, peerOf } from '../state.js';
import { avatar } from './avatar.js';
import { openModal, closeModal, onModalClose } from './modal.js';
import { toast } from './toast.js';

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };
const touchDevice = () => window.matchMedia('(pointer: coarse)').matches;

/** Сохранить файл: на телефоне — системное меню «Сохранить в галерею/Фото», на компьютере — обычное скачивание. */
export async function saveToGallery(media) {
  try {
    const blob = await (await fetch(media.local ? media.url : mediaUrl(media.url))).blob();
    const type = media.mime || blob.type;
    const name = (media.name && /\.[a-z0-9]{2,4}$/i.test(media.name)) ? media.name : `aqua-${Date.now()}.${EXT[type] || 'bin'}`;
    const file = new File([blob], name, { type });
    if (touchDevice() && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return true; } catch (e) { if (e.name === 'AbortError') return false; }
    }
    const a = el('a', { href: URL.createObjectURL(file), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    toast('Файл сохранён.');
    return true;
  } catch { toast('Не удалось сохранить файл.'); return false; }
}

/** Сохранить GIF в «Сохранённые». */
export async function saveGif(media) {
  try { await api.saveGif(media.id); toast('GIF сохранена.'); return true; }
  catch (e) { toast(e.message || 'Не удалось сохранить GIF.'); return false; }
}

export const isGifMessage = (m) => Boolean(m.meta?.gif) || m.media?.mime === 'image/gif';

/** Выбор чата и пересылка сообщений (опционально — без «Переслано от …»). @returns {Promise<boolean>} переслано ли */
export function forwardMessages(ids) {
  return new Promise((resolve) => {
    const list = $('#forward-list');
    $('#forward-hide').checked = false;
    const chats = [...state.chats.values()];
    let done = false, chosen = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    list.replaceChildren(...(chats.length ? chats.map((c) => {
      const peer = c.type === 'direct' ? peerOf(c) : null;
      return el('li', {}, el('button', { type: 'button', class: 'contacts__row', onclick: async () => {
        const hide = $('#forward-hide').checked;
        chosen = true;
        closeModal('modal-forward');
        try { await api.forward(ids, c.id, hide); toast(`Отправлено: ${c.title}`); finish(true); }
        catch (e) { toast(e.message || 'Не удалось переслать.'); finish(false); }
      } }, avatar(c.title, { user: peer }), el('span', { class: 'contacts__name' }, el('b', { text: c.title }))));
    }) : [el('li', { class: 'contacts__empty', text: 'Чатов пока нет.' })]));
    onModalClose('modal-forward', () => { if (!chosen) finish(false); });
    openModal('modal-forward');
  });
}
