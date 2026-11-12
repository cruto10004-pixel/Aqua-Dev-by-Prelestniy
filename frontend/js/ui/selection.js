/* Режим выделения сообщений: долгое нажатие → «выделено: N», стрелка слева выходит из режима,
   снизу панель действий (копировать, изменить, закрепить, переслать, удалить). */
import { $ } from '../dom.js';
import { state } from '../state.js';
import { haptic } from '../haptics.js';

const isReal = (id) => /^\d+$/.test(id || '');

/**
 * @param {{container:HTMLElement, getMessage:(id:number)=>object|undefined, isPinned:(id:number)=>boolean,
 *   onCopy:(msgs:object[])=>void, onEdit:(m:object)=>void, onPin:(m:object)=>void,
 *   onForward:(ids:number[])=>Promise<boolean>|void, onDelete:(msgs:object[])=>Promise<boolean>|void}} cfg
 */
export function initSelection({ container, getMessage, isPinned, onCopy, onEdit, onPin, onForward, onDelete }) {
  const selected = new Set();
  const app = $('#app');
  const title = $('#sel-title');
  const bar = $('#selbar');

  const msgs = () => [...selected].map(getMessage).filter(Boolean).sort((a, b) => a.id - b.id);
  const active = () => selected.size > 0;

  function paint() {
    container.querySelectorAll('.msg').forEach((n) => n.classList.toggle('is-selected', selected.has(Number(n.dataset.id))));
    const on = active();
    app.dataset.selecting = String(on);
    title.hidden = !on; $('#chat-peer').hidden = on;
    bar.hidden = !on; $('#composer').hidden = on;
    if ($('#picker')) $('#picker').hidden = true;
    if (!on) return;
    title.textContent = `выделено: ${selected.size}`;
    const list = msgs(), one = list.length === 1 ? list[0] : null;
    const mine = one && one.sender.id === state.user.id;
    $('#sel-edit').hidden = !(one && mine && one.kind !== 'voice' && !one.meta?.sticker);
    $('#sel-pin').hidden = !one;
    if (one) $('#sel-pin span').textContent = isPinned(one.id) ? 'Открепить' : 'Закрепить';
    $('#sel-copy').hidden = !list.some((m) => m.text);
  }

  function enter(id) { if (!isReal(String(id))) return; selected.add(Number(id)); haptic.tap(); paint(); }
  function toggle(id) { id = Number(id); if (selected.has(id)) selected.delete(id); else selected.add(id); paint(); }
  function exit() { if (!active()) return; selected.clear(); paint(); }
  /** Убирает из выделения сообщения, которых больше нет (удалены). */
  function prune() { for (const id of [...selected]) if (!getMessage(id)) selected.delete(id); if (container.isConnected) paint(); }

  // В режиме выделения тап по сообщению ставит/снимает отметку; остальные обработчики кликов не должны срабатывать
  container.addEventListener('click', (e) => {
    if (!active()) return;
    const node = e.target.closest('.msg');
    e.stopImmediatePropagation(); e.preventDefault();
    if (node && isReal(node.dataset.id)) { toggle(node.dataset.id); haptic.tap(); }
  }, true);
  container.addEventListener('dblclick', (e) => { if (active()) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
  container.addEventListener('contextmenu', (e) => { if (active()) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);

  $('#sel-copy').addEventListener('click', () => { onCopy(msgs()); exit(); });
  $('#sel-edit').addEventListener('click', () => { const m = msgs()[0]; exit(); if (m) onEdit(m); });
  $('#sel-pin').addEventListener('click', () => { const m = msgs()[0]; exit(); if (m) onPin(m); });
  $('#sel-forward').addEventListener('click', async () => { if (await onForward(msgs().map((m) => m.id))) exit(); });
  $('#sel-delete').addEventListener('click', async () => { if (await onDelete(msgs())) exit(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && active() && !document.querySelector('.dialog, .modal.is-open, .lb')) exit(); });

  return { enter, exit, active, prune, toggle };
}
