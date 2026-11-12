/* Панель «Смайлики / Стикеры / GIF» над полем ввода. Выбранная вкладка запоминается и меняет значок кнопки. */
import { $, el, icon } from '../dom.js';
import { api, gifProxyUrl, mediaUrl } from '../api.js';
import { storage } from '../storage.js';
import { EMOJI } from '../emoji-data.js';
import { initStickers } from './stickers.js';

const TAB_KEY = 'aqua.picker.tab';
const RECENT_KEY = 'aqua.emoji.recent';
const RECENT_MAX = 24;
const TABS = ['emoji', 'stickers', 'gif'];

export function initPicker({ onEmoji, onGif, onSticker, onTabChange, onToggle }) {
  const panel = $('#picker');
  const tabs = [...panel.querySelectorAll('.picker__tab')];
  const panes = { emoji: $('#picker-emoji'), stickers: $('#picker-stickers'), gif: $('#picker-gif') };
  const cats = $('#emoji-cats'), grid = $('#emoji-grid'), emojiSearch = $('#emoji-search');
  const gifGrid = $('#gif-grid'), gifNote = $('#gif-note'), gifSearch = $('#gif-search');

  const saved = storage.get(TAB_KEY);
  let tab = TABS.includes(saved) ? saved : 'emoji';
  let gifState = { q: '', next: 0, loading: false, enabled: null, seq: 0 };

  /* ---------- Смайлики: одна лента со всеми категориями, вкладки-категории прокручивают к разделу ---------- */
  const recent = () => { try { return JSON.parse(storage.get(RECENT_KEY) || '[]'); } catch { return []; } };
  function pushRecent(e) { storage.set(RECENT_KEY, JSON.stringify([e, ...recent().filter((x) => x !== e)].slice(0, RECENT_MAX))); }

  const emojiBtn = (e, name) => el('button', { type: 'button', class: 'picker__emoji', text: e, 'aria-label': name || e });
  const catBtn = (c) => el('button', { type: 'button', class: 'picker__cat', text: c.icon, title: c.title, 'aria-label': c.title, 'aria-pressed': 'false', dataset: { cat: c.id } });
  let built = false;

  function buildEmoji() {
    const list = [{ id: 'recent', icon: '🕘', title: 'Недавние' }, ...EMOJI];
    cats.replaceChildren(...list.map(catBtn));
    const secs = [el('section', { class: 'emoji-sec', dataset: { sec: 'recent' } }, el('h4', { text: 'Недавние' }), el('div', { class: 'emoji-sec__grid', id: 'emoji-recent' }))];
    for (const c of EMOJI) {
      secs.push(el('section', { class: 'emoji-sec', dataset: { sec: c.id } }, el('h4', { text: c.title }),
        el('div', { class: 'emoji-sec__grid' }, c.items.map((it) => emojiBtn(it.e, it.n)))));
    }
    grid.replaceChildren(...secs);
    built = true;
  }
  function paintRecent() {
    const box = $('#emoji-recent'), r = recent();
    box.parentElement.hidden = !r.length;
    box.replaceChildren(...r.map((e) => emojiBtn(e)));
  }
  function setActiveCat(id) { cats.querySelectorAll('.picker__cat').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cat === id))); }
  function jumpToCat(id) {
    const sec = grid.querySelector(`[data-sec="${id}"]`);
    if (sec && !sec.hidden) grid.scrollTo({ top: sec.offsetTop - grid.offsetTop });
    setActiveCat(id);
  }
  function spy() {
    if (emojiSearch.value) return;
    const top = grid.scrollTop + 8;
    let cur = 'recent';
    for (const s of grid.querySelectorAll('.emoji-sec')) { if (!s.hidden && s.offsetTop - grid.offsetTop <= top) cur = s.dataset.sec; }
    setActiveCat(cur);
    const b = cats.querySelector(`[data-cat="${cur}"]`);
    if (b) cats.scrollTo({ left: b.offsetLeft - cats.clientWidth / 2 + b.clientWidth / 2 });
  }
  function searchEmoji() {
    const q = emojiSearch.value.trim().toLowerCase();
    for (const sec of grid.querySelectorAll('.emoji-sec')) {
      if (sec.dataset.sec === 'recent') { sec.hidden = Boolean(q) || !recent().length; continue; }
      const cat = EMOJI.find((c) => c.id === sec.dataset.sec);
      const btns = sec.querySelectorAll('.picker__emoji');
      let any = false;
      cat.items.forEach((it, i) => { const ok = !q || it.n.toLowerCase().includes(q) || it.e === q; btns[i].hidden = !ok; any ||= ok; });
      sec.hidden = !any;
    }
    grid.scrollTop = 0;
  }
  cats.addEventListener('click', (e) => {
    const b = e.target.closest('.picker__cat'); if (!b) return;
    if (b.dataset.cat === 'recent') paintRecent();          // обновляем недавние только по запросу — чтобы лента не «прыгала» под пальцем
    if (emojiSearch.value) { emojiSearch.value = ''; searchEmoji(); }
    jumpToCat(b.dataset.cat);
  });
  grid.addEventListener('click', (e) => {
    const b = e.target.closest('.picker__emoji'); if (!b) return;
    pushRecent(b.textContent); onEmoji(b.textContent);
  });
  grid.addEventListener('scroll', spy, { passive: true });
  emojiSearch.addEventListener('input', () => { clearTimeout(emojiSearch._t); emojiSearch._t = setTimeout(searchEmoji, 120); });
  function showEmoji() {
    if (!built) buildEmoji();
    paintRecent();
    if (!emojiSearch.value) { requestAnimationFrame(() => { grid.scrollTop = 0; setActiveCat(recent().length ? 'recent' : 'smileys'); if (!recent().length) jumpToCat('smileys'); }); }
  }

  /* ---------- Стикеры ---------- */
  const stickers = initStickers({ feed: $('#sticker-feed'), packsBar: $('#sticker-packs'), onSend: (s) => onSticker(s) });

  /* ---------- GIF: по умолчанию «Сохранённые» (лента вертикальная), поиск — по интернету ---------- */
  function note(text) { gifNote.textContent = text || ''; gifNote.hidden = !text; }

  const gifMedia = (m) => (m.kind === 'video'
    ? el('video', { src: mediaUrl(m.url), muted: true, loop: true, autoplay: true, playsinline: true, preload: 'metadata' })
    : el('img', { src: mediaUrl(m.url), alt: 'GIF', loading: 'lazy', decoding: 'async' }));
  // Атрибут muted не всегда превращается в свойство — без этого автозапуск в браузерах блокируется
  const forceMuted = (v) => { if (v.tagName === 'VIDEO') { v.muted = true; v.play?.().catch(() => {}); } return v; };

  async function loadSaved() {
    const seq = ++gifState.seq; gifGrid.replaceChildren(); note(''); gifGrid.classList.add('is-saved');
    try {
      const items = await api.savedGifs();
      if (seq !== gifState.seq) return;
      if (!items.length) { note('Здесь будут все GIF, которые вы отправили или сохранили. Найдите GIF через поиск выше.'); return; }
      for (const m of items) gifGrid.append(savedTile(m));
    } catch (e) { if (seq === gifState.seq) note(e.message || 'Не удалось загрузить GIF.'); }
  }
  function savedTile(m) {
    const b = el('div', { class: 'picker__gif picker__gif--saved', role: 'button', tabindex: '0', title: 'GIF' }, forceMuted(gifMedia(m)),
      el('button', { type: 'button', class: 'picker__gif-del', 'aria-label': 'Убрать из сохранённых', onclick: async (e) => {
        e.stopPropagation(); await api.unsaveGif(m.id).catch(() => {}); b.remove(); if (!gifGrid.children.length) loadSaved();
      } }, icon('i-close')));
    const send = () => onGif({ saved: m });
    b.addEventListener('click', send);
    b.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
    return b;
  }

  async function loadGifs(reset) {
    const g = gifState;
    if (!g.q) { if (reset) loadSaved(); return; }
    if (g.loading && !reset) return;
    if (reset) { g.next = 0; g.seq++; gifGrid.classList.remove('is-saved'); gifGrid.replaceChildren(); gifGrid.scrollTop = 0; note(''); }
    if (g.next === null) return;
    const seq = g.seq; g.loading = true;
    try {
      if (g.enabled === null) g.enabled = (await api.gifStatus()).enabled;
      if (!g.enabled) { note('GIF-поиск не настроен: администратору нужно задать KLIPY_API_KEY или GIPHY_API_KEY на сервере.'); return; }
      const res = await api.gifSearch(g.q, g.next ?? 0);
      if (seq !== g.seq) return;                       // ответ на устаревший запрос
      for (const it of res.items) gifGrid.append(gifTile(it));
      g.next = res.next;
      if (!gifGrid.children.length) note('Ничего не найдено.');
    } catch (e) {
      if (seq === g.seq) note(e.message || 'Не удалось загрузить GIF.');
    } finally {
      if (seq === g.seq) {
        g.loading = false;
        // Если лента не заполнила панель, прокрутки не будет — догружаем сами
        requestAnimationFrame(() => { if (!panel.hidden && g.q && g.next !== null && gifGrid.scrollHeight <= gifGrid.clientHeight + 200) loadGifs(false); });
      }
    }
  }
  function gifTile(it) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'picker__gif'; b.title = it.title || 'GIF';
    b.style.aspectRatio = `${it.w} / ${it.h}`;
    const img = document.createElement('img');
    img.src = gifProxyUrl(it.preview); img.alt = it.title || 'GIF'; img.loading = 'lazy'; img.decoding = 'async';
    b.append(img);
    b.addEventListener('click', () => { b.disabled = true; Promise.resolve(onGif(it)).finally(() => { b.disabled = false; }); });
    return b;
  }
  gifSearch.addEventListener('input', () => {
    clearTimeout(gifSearch._t);
    gifSearch._t = setTimeout(() => { gifState.q = gifSearch.value.trim(); loadGifs(true); }, 350);
  });
  gifGrid.addEventListener('scroll', () => {
    if (gifState.q && gifGrid.scrollTop + gifGrid.clientHeight > gifGrid.scrollHeight - 200) loadGifs(false);
  });

  /* ---------- Вкладки ---------- */
  function setTab(next, { save = true } = {}) {
    tab = next;
    if (save) storage.set(TAB_KEY, tab);
    tabs.forEach((t) => { const on = t.dataset.tab === tab; t.setAttribute('aria-selected', String(on)); t.classList.toggle('is-active', on); });
    for (const k of TABS) panes[k].hidden = tab !== k;
    if (tab === 'emoji') showEmoji();
    else if (tab === 'stickers') stickers.load();
    else { gifState.q = gifSearch.value.trim(); loadGifs(true); }
    onTabChange(tab);
  }
  tabs.forEach((t) => t.addEventListener('click', () => setTab(t.dataset.tab)));

  const open = () => { panel.hidden = false; setTab(tab, { save: false }); onToggle(true); };
  const close = () => { panel.hidden = true; onToggle(false); };
  $('#picker-close').addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) close(); });

  onTabChange(tab);                                    // значок кнопки сразу соответствует сохранённому выбору
  return { toggle: () => (panel.hidden ? open() : close()), close, isOpen: () => !panel.hidden, tab: () => tab, reloadStickers: () => stickers.load() };
}
