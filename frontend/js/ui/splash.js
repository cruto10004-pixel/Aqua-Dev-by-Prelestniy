/* Заставка при входе (assets/start.webm — VP9 с прозрачным фоном: поверх уже видно приложение).
   Показывается один раз за сессию вкладки. Закрывается по окончанию видео, по тапу, при ошибке
   воспроизведения или по таймауту — приложение никогда не «застрянет» на заставке. */
import { $ } from '../dom.js';
import { session } from '../storage.js';
import { SPLASH_KEY, SPLASH_MAX_MS } from '../config.js';

export function initSplash() {
  const splash = $('#splash');
  const video = $('#splash-video');
  if (!splash) return Promise.resolve();

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || session.get(SPLASH_KEY)) {
    splash.remove();
    return Promise.resolve();
  }
  // WebM с прозрачностью умеют Chrome/Edge/Firefox/Android WebView; Safari рисует прозрачное чёрным — там заставку пропускаем
  const isSafari = /^((?!chrome|chromium|android|crios|fxios).)*safari/i.test(navigator.userAgent);
  if (isSafari || !video.canPlayType('video/webm; codecs="vp9"')) {
    splash.remove();
    return Promise.resolve();
  }
  session.set(SPLASH_KEY, '1');

  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      splash.classList.add('is-leaving');                          // плавное растворение
      setTimeout(() => { splash.remove(); resolve(); }, 700);
    };
    video.addEventListener('ended', finish);
    video.addEventListener('error', finish);
    splash.addEventListener('click', finish);                      // тап — пропустить
    setTimeout(finish, SPLASH_MAX_MS);
    // muted + playsinline обязательны для автозапуска в Safari/iOS и Chrome
    const started = video.play();
    if (started?.catch) started.catch(finish);
  });
}
