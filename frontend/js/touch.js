/* Особенности сенсорных экранов. */
/**
 * Свайп вправо от левого края — «назад» (как в iOS). Слушаем touch-события пассивно,
 * чтобы не мешать прокрутке. Срабатывает, только если жест начался у края и ушёл вправо
 * заметно сильнее, чем по вертикали.
 */
export function initEdgeSwipeBack(target, onBack, { edge = 28, distance = 70 } = {}) {
  let startX = 0, startY = 0, tracking = false;
  target.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    tracking = e.touches.length === 1 && t.clientX <= edge;
    startX = t.clientX; startY = t.clientY;
  }, { passive: true });
  target.addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - startX, dy = Math.abs(t.clientY - startY);
    if (dx > distance && dx > dy * 2) onBack();
  }, { passive: true });
  target.addEventListener('touchcancel', () => { tracking = false; }, { passive: true });
}

/**
 * Длинное нажатие (для контекстного меню реакций на Этапе 5).
 * Отменяется, если палец сдвинулся больше чем на `slop` пикселей (это прокрутка).
 */
export function onLongPress(target, selector, callback, { ms = 450, slop = 10 } = {}) {
  let timer = null, sx = 0, sy = 0;
  const cancel = () => { clearTimeout(timer); timer = null; };
  target.addEventListener('touchstart', (e) => {
    const node = e.target.closest(selector);
    if (!node || e.touches.length !== 1) return;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    timer = setTimeout(() => { timer = null; callback(node, sx, sy); }, ms);
  }, { passive: true });
  target.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    if (timer && Math.hypot(t.clientX - sx, t.clientY - sy) > slop) cancel();
  }, { passive: true });
  target.addEventListener('touchend', cancel, { passive: true });
  target.addEventListener('touchcancel', cancel, { passive: true });
}

/**
 * Экранная клавиатура на iOS не меняет размер layout viewport, и поле ввода оказывается под ней.
 * Следим за visualViewport и выставляем --vvh (видимая высота) — .app использует её как height.
 */
export function initViewportFix(onResize) {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  const update = () => {
    root.style.setProperty('--vvh', `${vv.height}px`);
    window.scrollTo(0, 0);                 // iOS может «сдвинуть» страницу вверх при фокусе
    onResize?.();
  };
  vv.addEventListener('resize', update);
  update();
}
