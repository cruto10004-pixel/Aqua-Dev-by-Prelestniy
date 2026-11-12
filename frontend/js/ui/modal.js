/* Модальные окна: открытие/закрытие классом .is-open, Esc, клик по подложке, возврат фокуса. */
import { $, $$ } from '../dom.js';

let lastFocus = null;
let openId = null;
const closeHooks = new Map();        // id окна -> функция, вызываемая при любом закрытии

/** Подписка на закрытие окна (крестик, Esc, подложка или closeModal). */
export function onModalClose(id, fn) { closeHooks.set(id, fn); }

export function openModal(id) {
  const modal = $('#' + id);
  if (!modal) return;
  if (!openId) lastFocus = document.activeElement;      // вложенные окна не затирают точку возврата фокуса
  modal.classList.add('is-open');
  openId = id;
  document.body.classList.add('has-modal');
  // Фокус в окно после начала анимации (visibility меняется мгновенно при открытии)
  requestAnimationFrame(() => modal.querySelector('button, input, [tabindex]')?.focus());
}

export function closeModal(id = openId) {
  if (!id) return;
  const modal = $('#' + id);
  if (!modal?.classList.contains('is-open')) return;
  modal.classList.remove('is-open');
  if (openId === id) openId = null;
  if (!openId) document.body.classList.remove('has-modal');
  lastFocus?.focus?.();
  closeHooks.get(id)?.();
}

export function initModals() {
  $$('[data-close-modal]').forEach((n) => n.addEventListener('click', () => closeModal(n.closest('.modal').id)));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
}
