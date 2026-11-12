/* Тактильная отдача через navigator.vibrate().
   Поддерживается в Chrome/Edge/Firefox на Android; в Safari (iOS) API нет — вызовы безопасно игнорируются.
   Chrome также запрещает вибрацию, пока пользователь не взаимодействовал со страницей. */

const supported = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

export function vibrate(pattern) {
  if (!supported) return false;
  // userActivation: без жеста пользователя Chrome пишет предупреждение — не пытаемся.
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return false;
  try { return navigator.vibrate(pattern); } catch { return false; }
}

export const haptic = {
  tap:     () => vibrate(8),             // нажатие важной кнопки
  send:    () => vibrate(14),            // сообщение отправлено
  receive: () => vibrate([12, 40, 12]),  // пришло сообщение
  success: () => vibrate([10, 30, 20]),
  error:   () => vibrate([30, 40, 30]),
};

/** Лёгкая вибрация на всех «важных» кнопках интерфейса (делегирование одним обработчиком). */
export function initTapHaptics(root = document) {
  root.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    if (e.target.closest('.btn, .btn-icon, .chat-item, .tabs__tab, .reaction')) haptic.tap();
  }, { passive: true });
}
