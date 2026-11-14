// Adapted from the supplied prototype's motion.js: interruptible WAAPI transitions.
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const active = new Map();
export function enter(node, kind = 'page') {
  if (!node || reduced.matches) return;
  active.get(node)?.cancel();
  const message = kind === 'message';
  const animation = node.animate([
    { opacity: 0, transform: `translateY(${message ? 12 : 18}px)` },
    { opacity: 1, transform: 'translateY(0)' },
  ], { duration: message ? 280 : 360, easing: 'cubic-bezier(.2,.8,.2,1)' });
  active.set(node, animation);
  animation.finished.catch(() => {}).finally(() => { if (active.get(node) === animation) active.delete(node); });
}
export function initMotion() {
  enter(document.querySelector('.auth__card'));
  reduced.addEventListener('change', () => { if (reduced.matches) { active.forEach(a => a.cancel()); active.clear(); } });
  // Menus mount dynamically; animate their own surface without animating the backdrop.
  new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) {
      if (node.nodeType !== 1) continue;
      if (node.matches('.menu,.peer-menu,.dialog')) enter(node.querySelector('.dialog__card') || node);
    }
  }).observe(document.body, {childList: true, subtree: true});
}
