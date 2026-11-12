/* Плеер голосового сообщения: кнопка, анимированная волна с прогрессом, время.
   Форма волны приходит с сервера (message.meta.wave) — аудио декодировать не нужно. */
import { el, icon } from '../dom.js';

let current = null;        // одновременно играет только одно голосовое

const fmt = (sec) => {
  const s = Math.max(0, Math.round(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Если волны нет (старые/чужие сообщения) — рисуем ровный «псевдо-узор». */
const fallbackWave = (n = 40) => Array.from({ length: n }, (_, i) => 25 + Math.round(35 * Math.abs(Math.sin(i * 0.7))));

export function stopVoice() {
  current?.pause();
  current = null;
}

/** @param {{src:string, duration?:number, wave?:number[]}} cfg */
export function voicePlayer({ src, duration = 0, wave }) {
  const audio = new Audio();
  audio.preload = 'auto';
  audio.src = src;
  let triedBlob = false;

  const levels = wave?.length ? wave : fallbackWave();
  const bars = levels.map((v) => el('span', { class: 'vp__bar', style: `--h:${Math.max(12, v)}` }));
  const playIcon = icon('i-play');
  const btn = el('button', { class: 'vp__btn', type: 'button', 'aria-label': 'Воспроизвести' }, playIcon);
  const time = el('span', { class: 'vp__time', text: fmt(duration) });
  const track = el('div', { class: 'vp__wave', role: 'slider', 'aria-label': 'Позиция', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': 0 }, bars);
  const root = el('div', { class: 'vp' }, btn, track, time);

  // Длительность берём из meta: у webm из MediaRecorder audio.duration бывает Infinity
  const total = () => (duration > 0 ? duration : Number.isFinite(audio.duration) ? audio.duration : 0);
  const setPlaying = (on) => {
    playIcon.firstChild.setAttribute('href', on ? '#i-pause' : '#i-play');
    btn.setAttribute('aria-label', on ? 'Пауза' : 'Воспроизвести');
    root.classList.toggle('is-playing', on);
  };
  const paint = (ratio) => {
    const played = Math.round(ratio * bars.length);
    bars.forEach((b, i) => b.classList.toggle('is-played', i < played));
    track.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
  };

  btn.addEventListener('click', () => {
    if (audio.paused) {
      if (current && current !== audio) current.pause();
      current = audio;
      audio.play().catch(() => { time.textContent = 'ошибка'; });
    } else {
      audio.pause();
    }
  });
  audio.addEventListener('play', () => setPlaying(true));
  audio.addEventListener('pause', () => setPlaying(false));
  audio.addEventListener('ended', () => { setPlaying(false); paint(0); time.textContent = fmt(total()); audio.currentTime = 0; });
  // Запасной путь: если потоковое воспроизведение не пошло (Range/кодек/прокси), скачиваем файл целиком
  audio.addEventListener('error', async () => {
    if (triedBlob || src.startsWith('blob:')) { time.textContent = 'ошибка'; return; }
    triedBlob = true;
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error(String(res.status));
      audio.src = URL.createObjectURL(await res.blob());
      audio.load();
    } catch { time.textContent = 'ошибка'; }
  });
  audio.addEventListener('timeupdate', () => {
    const t = total();
    if (t > 0) paint(Math.min(1, audio.currentTime / t));
    time.textContent = fmt(audio.paused && audio.currentTime === 0 ? t : audio.currentTime);
  });

  // Перемотка касанием/кликом по волне
  track.addEventListener('click', (e) => {
    const t = total();
    if (!t) return;
    const r = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    try { audio.currentTime = ratio * t; paint(ratio); } catch { /* не все потоки перематываются */ }
  });

  return root;
}
