/* Всплывающие уведомления. */
import { $ } from '../dom.js';

let timer;
export function toast(message, ms = 3200) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.add('is-visible');
  clearTimeout(timer);
  timer = setTimeout(() => node.classList.remove('is-visible'), ms);
}
