/* A brief brand transition; no video surface obscures the entry screen. */
import { $ } from '../dom.js';
import { session } from '../storage.js';
import { SPLASH_KEY } from '../config.js';
export function initSplash() {
  const splash = $('#splash');
  if (!splash) return Promise.resolve();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || session.get(SPLASH_KEY)) {
    splash.remove(); return Promise.resolve();
  }
  session.set(SPLASH_KEY, '1');
  const animation = splash.animate([{opacity:1},{opacity:0}], {duration:450,easing:'cubic-bezier(.2,.8,.2,1)'});
  splash.addEventListener('click', () => animation.finish(), {once:true});
  return animation.finished.catch(() => {}).finally(() => splash.remove());
}
