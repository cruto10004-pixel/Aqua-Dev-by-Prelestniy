/* Эмодзи-реакции: контекстное меню (ПКМ / двойной клик / долгое нажатие) и клик по «чипам».
   На телефоне меню — «шторка» снизу (стили в components.css), на десктопе — всплывает над сообщением. */
import { el, icon } from '../dom.js';
import { REACTIONS } from '../config.js';
import { haptic } from '../haptics.js';
import { onLongPress } from '../touch.js';

const isMobile = () => window.matchMedia('(max-width: 47.99rem)').matches;
const isRealId = (id) => /^\d+$/.test(id || '');        // у «отправляемых» сообщений id временный
let menu = null;
let outsideHandler = null;

/** Кнопка действия. Опасное действие (confirm) требует второго нажатия в течение 3 секунд. */
function actionButton(a) {
  const label = el('span', { text: a.label });
  let armed = null;
  const btn = el('button', {
    class: `menu__action${a.danger ? ' is-danger' : ''}`, type: 'button', role: 'menuitem',
    onclick: () => {
      if (a.confirm && !armed) {
        label.textContent = a.confirm; btn.classList.add('is-armed'); haptic.tap();
        armed = setTimeout(() => { armed = null; label.textContent = a.label; btn.classList.remove('is-armed'); }, 3000);
        return;
      }
      clearTimeout(armed);
      closeReactionMenu();
      a.run();
    },
  }, icon(a.icon), label);
  return btn;
}

export function closeReactionMenu() {
  menu?.remove();
  menu = null;
  if (outsideHandler) {
    document.removeEventListener('pointerdown', outsideHandler, true);
    outsideHandler = null;
  }
}

/**
 * @param {{container:HTMLElement, onPick:(messageId:number, emoji:string)=>void,
 *          getMine:(messageId:number)=>string[],
 *          getActions?:(messageId:number)=>{icon:string,label:string,danger?:boolean,confirm?:string,run:()=>void}[]}} cfg
 *   getMine — какие эмодзи пользователь уже поставил (для подсветки в меню)
 *   getActions — действия под реакциями (копировать, изменить, удалить); confirm — текст второго нажатия
 */
export function initReactions({ container, onPick, getMine, getActions = () => [], getQuick = null, onLongSelect = null }) {
  function open(bubble) {
    const msg = bubble.closest('.msg');
    if (!msg || !isRealId(msg.dataset.id) || msg.classList.contains('is-pending')) return;
    const id = Number(msg.dataset.id);
    closeReactionMenu();

    const mine = new Set(getMine(id));
    const actions = getActions(id);
    menu = el('div', { class: 'menu', role: 'menu', 'aria-label': 'Сообщение' },
      el('div', { class: 'menu__row' }, REACTIONS.map((emoji) => el('button', {
        class: `menu__item${mine.has(emoji) ? ' is-active' : ''}`, type: 'button', role: 'menuitem',
        'aria-label': emoji, text: emoji,
        onclick: () => { closeReactionMenu(); haptic.tap(); onPick(id, emoji); },
      }))),
      actions.length ? el('div', { class: 'menu__list' }, actions.map(actionButton)) : null);
    document.body.append(menu);

    if (!isMobile()) {
      // Над сообщением; если не помещается сверху — под ним. Не выходим за края окна.
      const r = bubble.getBoundingClientRect();
      const mw = menu.offsetWidth, mh = menu.offsetHeight;
      const top = r.top - mh - 8 >= 8 ? r.top - mh - 8 : Math.min(r.bottom + 8, window.innerHeight - mh - 8);
      const left = Math.max(8, Math.min(msg.classList.contains('msg--out') ? r.right - mw : r.left, window.innerWidth - mw - 8));
      Object.assign(menu.style, { top: `${top}px`, left: `${left}px` });
    }

    // Закрытие: касание/клик вне меню, Esc, прокрутка
    outsideHandler = (e) => { if (!menu?.contains(e.target)) closeReactionMenu(); };
    setTimeout(() => document.addEventListener('pointerdown', outsideHandler, true), 0);
  }

  container.addEventListener('contextmenu', (e) => {
    const bubble = e.target.closest('.msg__bubble');
    if (bubble) { e.preventDefault(); open(bubble); }
  });
  container.addEventListener('dblclick', (e) => {
    const bubble = e.target.closest('.msg__bubble');
    if (bubble && !e.target.closest('.vp, a, audio, video')) {
      window.getSelection()?.removeAllRanges();      // двойной клик по умолчанию выделяет слово — убираем
      const msg = bubble.closest('.msg');
      // Быстрая реакция из настроек; без неё (getQuick не задан) двойной клик открывает меню
      if (getQuick && msg && isRealId(msg.dataset.id) && !msg.classList.contains('is-pending')) { closeReactionMenu(); haptic.tap(); onPick(Number(msg.dataset.id), getQuick()); }
      else open(bubble);
    }
  });
  // Телефон: долгое нажатие. Системное меню iOS отключено через -webkit-touch-callout: none.
  onLongPress(container, '.msg__bubble', (bubble) => {
    const msg = bubble.closest('.msg');
    if (onLongSelect && msg && isRealId(msg.dataset.id) && !msg.classList.contains('is-pending')) { onLongSelect(Number(msg.dataset.id)); return; }   // долгое нажатие → выделение
    haptic.tap(); open(bubble);
  });

  // Клик по уже поставленной реакции — поставить/снять свою
  container.addEventListener('click', (e) => {
    const chip = e.target.closest('.reaction');
    const msg = chip?.closest('.msg');
    if (chip && msg && isRealId(msg.dataset.id)) onPick(Number(msg.dataset.id), chip.dataset.emoji);
  });

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeReactionMenu(); });
  container.addEventListener('scroll', closeReactionMenu, { passive: true });
  window.addEventListener('resize', closeReactionMenu);
}
