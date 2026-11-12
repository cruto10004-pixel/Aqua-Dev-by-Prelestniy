/* Тема оформления и обои чата. Палитра строится из одного акцентного цвета (или выбирается тёмная). */
import { mediaUrl } from './api.js';
import { storage } from './storage.js';

const CACHE_KEY = 'aqua.prefs';

export const PALETTES = [
  { id: 'sea', name: 'Море', accent: null, swatch: '#146CA4' },
  { id: 'mint', name: 'Мята', accent: '#12896B', swatch: '#12896B' },
  { id: 'violet', name: 'Сирень', accent: '#6B4FC9', swatch: '#6B4FC9' },
  { id: 'rose', name: 'Роза', accent: '#C2417A', swatch: '#C2417A' },
  { id: 'sunset', name: 'Закат', accent: '#D9642B', swatch: '#D9642B' },
  { id: 'graphite', name: 'Графит', accent: '#475569', swatch: '#475569' },
  { id: 'night', name: 'Ночь', dark: true, swatch: '#0E1A26' },
];

export const WALLPAPERS = [
  { id: 'waves', name: 'Волны', css: 'linear-gradient(160deg,#cfe9ff,#a2d1ff 55%,#7fbbe8)' },
  { id: 'sand', name: 'Песок', css: 'linear-gradient(160deg,#fff4dc,#f6dcae)' },
  { id: 'mint', name: 'Мята', css: 'linear-gradient(160deg,#dcf7ec,#a8e6cf)' },
  { id: 'dusk', name: 'Сумерки', css: 'linear-gradient(160deg,#e6dcff,#b8a6f0)' },
  { id: 'rose', name: 'Розовый', css: 'linear-gradient(160deg,#ffe3ec,#ffb8cf)' },
  { id: 'deep', name: 'Глубина', css: 'linear-gradient(160deg,#16314a,#0b1b2b)' },
  { id: 'bubbles', name: 'Пузыри', css: 'radial-gradient(circle at 18% 28%,rgba(255,255,255,.55) 0 .7rem,transparent .75rem),radial-gradient(circle at 72% 62%,rgba(255,255,255,.4) 0 1.1rem,transparent 1.15rem),radial-gradient(circle at 40% 86%,rgba(255,255,255,.45) 0 .5rem,transparent .55rem),linear-gradient(170deg,#bfe3ff,#5fb3e6)' },
];

const DARK = {
  '--color-bg': '#0E1A26', '--color-surface': '#15263A', '--color-surface-alt': '#1B3047', '--color-border': '#26405C',
  '--color-text': '#E6F2FF', '--color-text-muted': '#8FB0CC', '--color-primary': '#7CC4F2', '--color-accent': '#5BB8E8',
  '--bubble-in-bg': '#1F3550', '--bubble-in-text': '#E6F2FF',
  '--aqua-50': '#1B3047', '--aqua-100': '#20384F', '--aqua-200': '#274560', '--aqua-300': '#2F5473',
  '--aqua-deep': '#E6F2FF', '--aqua-icon': '#8CCBF2', '--aqua-teal-600': '#2A86B8', '--aqua-navy': '#1D5F8A', '--aqua-sky': '#12314A',
  '--color-focus': 'rgba(91,184,232,.5)',
};

const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => {                       // t — доля цвета b
  const [x, y] = [hex2rgb(a), hex2rgb(b)];
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
};

function derive(accent) {
  return {
    '--aqua-teal-600': accent, '--aqua-teal': mix(accent, '#ffffff', .12), '--aqua-navy': mix(accent, '#0A2540', .35),
    '--aqua-icon': mix(accent, '#000000', .2), '--aqua-deep': mix(accent, '#06121D', .8), '--aqua-sky': mix(accent, '#ffffff', .6),
    '--aqua-50': mix(accent, '#ffffff', .95), '--aqua-100': mix(accent, '#ffffff', .9),
    '--aqua-200': mix(accent, '#ffffff', .8), '--aqua-300': mix(accent, '#ffffff', .7),
    '--color-border': mix(accent, '#ffffff', .82), '--color-text-muted': mix(accent, '#5B6670', .55),
  };
}

const MANAGED = new Set(['--bubble-radius', '--msg-scale', ...Object.keys(DARK), ...Object.keys(derive('#000000'))]);

export function paletteVars(prefs) {
  const id = prefs?.palette;
  if (id === 'night') return DARK;
  if (id === 'custom' && /^#[0-9a-f]{6}$/i.test(prefs.accent || '')) return derive(prefs.accent);
  const p = PALETTES.find((x) => x.id === id);
  return p?.accent ? derive(p.accent) : {};
}

export function wallpaperCss(w) {
  if (w?.type === 'preset') return WALLPAPERS.find((x) => x.id === w.id)?.css ?? '';
  if (w?.type === 'media' && w.url) return `url("${mediaUrl(w.url)}") center / cover no-repeat`;
  return '';
}

/** Применяет тему и обои. Результат кэшируется, чтобы при следующем запуске не было вспышки старого оформления. */
export function applyPrefs(prefs, { cache = true } = {}) {
  const root = document.documentElement;
  for (const name of MANAGED) root.style.removeProperty(name);
  const vars = paletteVars(prefs);
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.style.colorScheme = prefs?.palette === 'night' ? 'dark' : 'light';
  root.dataset.theme = prefs?.palette === 'night' ? 'dark' : 'light';
  if (Number.isInteger(prefs?.bubble_radius)) root.style.setProperty('--bubble-radius', `${prefs.bubble_radius}px`);
  if (Number.isInteger(prefs?.text_size)) root.style.setProperty('--msg-scale', String(prefs.text_size / 100));
  const css = wallpaperCss(prefs?.wallpaper);
  if (css) root.style.setProperty('--chat-wallpaper', css); else root.style.removeProperty('--chat-wallpaper');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', vars['--aqua-sky'] ?? '#A2D1FF');
  if (cache) {
    try { storage.set(CACHE_KEY, JSON.stringify({ palette: prefs?.palette, accent: prefs?.accent, bubble_radius: prefs?.bubble_radius, text_size: prefs?.text_size, wallpaper: prefs?.wallpaper?.type === 'preset' ? prefs.wallpaper : null })); } catch { /* не критично */ }
  }
}

/** Ранняя подстановка кэшированной темы (до входа в аккаунт). */
export function applyCachedPrefs() {
  try { applyPrefs(JSON.parse(storage.get(CACHE_KEY) || 'null') || {}, { cache: false }); } catch { /* ничего */ }
}
