/* Окно «Настройки»: список разделов → «Настройки чатов» (вид сообщений, тема, обои, реакция), «Конфиденциальность», «Аккаунт». */
import { $, el, icon } from '../dom.js';
import { api } from '../api.js';
import { state } from '../state.js';
import { REACTIONS } from '../config.js';
import { PALETTES, WALLPAPERS, applyPrefs } from '../theme.js';
import { toast } from './toast.js';
import { avatar } from './avatar.js';
import { pickUsers } from './dialogs.js';

const WHO = [['everyone', 'Все'], ['selected', 'Только выбранные'], ['except', 'Все, кроме выбранных']];
const ACTIVITY = [['none', 'Не скрывать'], ['all', 'Скрыть от всех'], ['selected', 'Скрыть от выбранных'], ['noncontacts', 'Скрыть от неконтактов']];

/** onLogout не нужен: выход остаётся в профиле. onUsername(user) — логин изменён. */
export function initSettings({ onUsername, onUnblock, accounts }) {
  const body = $('#prefs-body');

  const prefs = () => state.user.prefs ?? {};
  async function savePrefs(patch) {
    try {
      state.user.prefs = await api.updatePrefs(patch);
      applyPrefs(state.user.prefs);
      render();
    } catch (e) { toast(e.message || 'Не удалось сохранить.'); }
  }

  const section = (title, ...kids) => el('section', { class: 'prefs__section' }, el('h3', { class: 'prefs__title', text: title }), ...kids);

  /* ---- Оформление ---- */
  function themeSection() {
    const cur = prefs().palette || 'sea';
    const swatches = PALETTES.map((p) => el('button', {
      type: 'button', class: 'theme-sw', role: 'radio', 'aria-checked': String(cur === p.id), 'aria-label': p.name, title: p.name,
      dataset: { palette: p.id }, style: `--sw:${p.swatch}`, onclick: () => savePrefs({ palette: p.id, accent: null }),
    }));
    const custom = el('label', { class: 'theme-sw theme-sw--custom', title: 'Свой цвет', 'aria-label': 'Свой цвет' },
      el('input', { type: 'color', id: 'accent-input', value: prefs().accent || '#0F7DA6',
        onchange: (e) => savePrefs({ palette: 'custom', accent: e.target.value }) }));
    custom.setAttribute('aria-checked', String(cur === 'custom'));
    if (cur === 'custom') custom.style.setProperty('--sw', prefs().accent);
    return section('Цветовая гамма', el('div', { class: 'theme-sws', role: 'radiogroup', 'aria-label': 'Цветовая гамма' }, swatches, custom));
  }

  /* ---- Обои ---- */
  function wallpaperSection() {
    const w = prefs().wallpaper ?? { type: 'none' };
    const tile = (id, name, css, on, click) => el('button', {
      type: 'button', class: 'wp', role: 'radio', 'aria-checked': String(on), 'aria-label': name, title: name,
      dataset: { wp: id }, style: css ? `background:${css}` : null, onclick: click,
    }, css ? null : el('span', { text: 'Нет' }));
    const fileInput = el('input', { type: 'file', accept: 'image/*', hidden: true, id: 'wp-file', onchange: async () => {
      const f = fileInput.files[0]; fileInput.value = ''; if (!f) return;
      try { const m = await api.uploadMedia(f); await savePrefs({ wallpaper: { type: 'media', media_id: m.id } }); }
      catch (e) { toast(e.message || 'Не удалось загрузить обои.'); }
    } });
    return section('Обои чата', el('div', { class: 'wps', role: 'radiogroup', 'aria-label': 'Обои чата' },
      tile('none', 'Без обоев', null, w.type === 'none', () => savePrefs({ wallpaper: { type: 'none' } })),
      WALLPAPERS.map((x) => tile(x.id, x.name, x.css, w.type === 'preset' && w.id === x.id, () => savePrefs({ wallpaper: { type: 'preset', id: x.id } }))),
      el('button', { type: 'button', class: `wp wp--own${w.type === 'media' ? ' is-on' : ''}`, id: 'wp-own', 'aria-label': 'Своё фото', title: 'Своё фото',
        onclick: () => fileInput.click() }, el('span', { text: '+ Фото' })), fileInput));
  }

  /* ---- Быстрая реакция ---- */
  function reactionSection() {
    const cur = prefs().quick_reaction || REACTIONS[0];
    return section('Быстрая реакция',
      el('p', { class: 'prefs__hint', text: 'Ставится двойным касанием по сообщению.' }),
      el('div', { class: 'qr', role: 'radiogroup' }, REACTIONS.map((r) => el('button', {
        type: 'button', class: 'qr__item', role: 'radio', 'aria-checked': String(cur === r), 'aria-label': r, text: r,
        onclick: () => savePrefs({ quick_reaction: r }),
      }))));
  }

  /* ---- Приватность ---- */
  /** Кого можно выбирать: контакты и собеседники из личных чатов. */
  async function candidates() {
    const map = new Map();
    try { for (const u of await api.listContacts()) map.set(u.id, u); } catch { /* список контактов недоступен — берём только собеседников */ }
    for (const c of state.chats.values()) for (const m of c.members) if (c.type === 'direct' && m.id !== state.user.id) map.set(m.id, map.get(m.id) ?? m);
    return [...map.values()];
  }
  async function savePrivacy(patch, rerender) {
    try { state.user.privacy = await api.updatePrivacy(patch); }
    catch (e) { toast(e.message || 'Не удалось сохранить.'); }
    rerender();
  }
  /** Выбор режима + кнопка «выбрать людей» для режимов, где она нужна. */
  function modeField({ id, label, options, get, set, lists }) {
    const holder = el('div', { class: 'field', id: `field-${id}` });
    const paint = () => {
      const cur = get();
      const sel = el('select', { class: 'input', id: `priv-${id}`, 'aria-label': label,
        onchange: () => savePrivacy(set({ ...cur, mode: sel.value }), paint) }, options.map(([v, t]) => el('option', { value: v, text: t, selected: v === cur.mode })));
      const extra = (lists[cur.mode] ?? []).map(({ key, title, hint }) => el('button', { type: 'button', class: 'btn btn--ghost priv__pick', dataset: { list: key },
        text: `${title}: ${cur[key]?.length ?? 0}`, onclick: async () => {
          const ids = await pickUsers({ title, hint, users: await candidates(), selected: cur[key] ?? [] });
          if (ids) savePrivacy(set({ ...cur, [key]: ids }), paint);
        } }));
      holder.replaceChildren(el('label', { class: 'field__label', for: `priv-${id}`, text: label }), sel, ...extra);
    };
    paint();
    return holder;
  }
  const rule = (field, label) => modeField({ id: field, label, options: WHO,
    get: () => state.user.privacy?.[field] ?? { mode: 'everyone', users: [] },
    set: (v) => ({ [field]: { mode: v.mode, users: v.users ?? [] } }),
    lists: { selected: [{ key: 'users', title: 'Разрешено', hint: 'Только эти люди смогут вам писать.' }],
             except: [{ key: 'users', title: 'Запрещено', hint: 'Эти люди не смогут вам писать.' }] } });
  const activityField = () => modeField({ id: 'hide_activity', label: 'Скрыть «в сети» и время посещения', options: ACTIVITY,
    get: () => state.user.privacy?.hide_activity ?? { mode: 'none', users: [], always: [] },
    set: (v) => ({ hide_activity: { mode: v.mode, users: v.users ?? [], always: v.always ?? [] } }),
    lists: { all: [{ key: 'always', title: 'Всегда разрешать', hint: 'Выбранные люди будут видеть вашу активность, даже если она скрыта.' }],
             selected: [{ key: 'users', title: 'Скрыть от', hint: 'Эти люди не увидят вашу активность.' }] } });
  const blockedBox = el('div', { class: 'blocked', id: 'blocked-list' });
  async function loadBlocked() {
    try {
      const list = await api.listBlocks();
      blockedBox.replaceChildren(...(list.length ? list.map((u) => el('div', { class: 'blocked__row' },
        avatar(u.display_name, { user: u, small: true }),
        el('span', { class: 'blocked__name', text: `${u.display_name} @${u.username}` }),
        el('button', { type: 'button', class: 'btn btn--ghost', dataset: { unblock: u.id }, text: 'Разблокировать', onclick: async () => {
          try { await api.setBlocked(u.id, false); onUnblock?.(u.id); loadBlocked(); } catch (e) { toast(e.message); }
        } }),
      )) : [el('p', { class: 'prefs__hint', text: 'Список пуст.' })]));
    } catch (e) { blockedBox.textContent = e.message; }
  }
  const privacySection = () => section('Приватность',
    rule('who_can_write', 'Кто может писать мне'), rule('who_can_voice', 'Кто может присылать голосовые'), activityField(),
    el('h4', { class: 'prefs__sub', text: 'Заблокированные' }), blockedBox);

  /* ---- Аккаунт ---- */
  function formBox(id, summary, fields, submitText, onSubmit) {
    const err = el('p', { class: 'form-error', role: 'alert', hidden: true });
    const inputs = fields.map((f) => el('div', { class: 'field' },
      el('label', { class: 'field__label', for: `${id}-${f.name}`, text: f.label }),
      el('input', { class: 'input', id: `${id}-${f.name}`, name: f.name, type: f.type || 'text', autocomplete: f.auto || 'off', maxlength: 64 })));
    const form = el('form', { class: 'prefs__form', id, novalidate: true, onsubmit: async (e) => {
      e.preventDefault(); err.hidden = true;
      const v = Object.fromEntries(inputs.map((d) => { const i = d.querySelector('input'); return [i.name, i.value]; }));
      try { await onSubmit(v); form.reset(); details.open = false; }
      catch (x) { err.textContent = x.message || 'Ошибка.'; err.hidden = false; }
    } }, inputs, err, el('button', { class: 'btn btn--primary', type: 'submit', text: submitText }));
    const details = el('details', { class: 'prefs__details' }, el('summary', { text: summary }), form);
    return details;
  }
  /** Быстрое переключение аккаунтов: список всех аккаунтов этого устройства с аватаркой и ником. */
  const accountsSection = () => {
    const list = accounts?.list() ?? [];
    return section('Аккаунты на этом устройстве',
      el('div', { class: 'accs', id: 'accounts-list' }, list.map((a) => {
        const cur = a.id === accounts.current();
        return el('button', { type: 'button', class: `accs__row${cur ? ' is-current' : ''}`, dataset: { account: a.id }, 'aria-current': cur ? 'true' : null,
          onclick: () => { if (!cur) accounts.onSwitch(a.id); } },
          avatar(a.display_name, { user: { id: a.id, display_name: a.display_name, username: a.username, avatar: a.avatar }, small: true }),
          el('span', { class: 'accs__name' }, el('b', { text: a.display_name }), el('small', { text: `@${a.username}` })),
          cur ? icon('i-check') : null);
      })),
      el('button', { type: 'button', class: 'btn btn--ghost', id: 'account-add', text: '+ Добавить аккаунт', onclick: () => accounts.onAdd() }));
  };
  const accountSection = () => section('Аккаунт',
    formBox('form-username', 'Сменить логин', [
      { name: 'username', label: 'Новый логин', auto: 'username' }, { name: 'password', label: 'Текущий пароль', type: 'password', auto: 'current-password' },
    ], 'Сменить логин', async (v) => { const u = await api.changeUsername(v.username, v.password); onUsername(u); toast('Логин изменён'); }),
    formBox('form-password', 'Сменить пароль', [
      { name: 'current', label: 'Текущий пароль', type: 'password', auto: 'current-password' },
      { name: 'next', label: 'Новый пароль', type: 'password', auto: 'new-password' },
      { name: 'again', label: 'Повторите новый пароль', type: 'password', auto: 'new-password' },
    ], 'Сменить пароль', async (v) => {
      if (v.next !== v.again) throw new Error('Пароли не совпадают.');
      await api.changePassword(v.current, v.next); toast('Пароль изменён');
    }));

  /* ---- Вид сообщений ---- */
  function range(id, label, min, max, value, unit, onLive, onSave) {
    const out = el('output', { text: `${value}${unit}` });
    const input = el('input', { type: 'range', id, min, max, step: 1, value,
      oninput: () => { out.textContent = `${input.value}${unit}`; onLive(+input.value); },
      onchange: () => onSave(+input.value) });
    return el('div', { class: 'range' }, el('label', { class: 'range__head', for: id }, el('span', { text: label }), out), input);
  }
  function previewSection() {
    const bubble = (cls, text, time) => el('div', { class: `msg ${cls}` },
      el('div', { class: 'msg__bubble' }, el('div', { class: 'msg__text', text }), el('span', { class: 'msg__meta', text: time })));
    return el('div', { class: 'prefs__preview', id: 'prefs-preview', 'aria-hidden': 'true' },
      bubble('msg--in', 'Привет! Как дела?', '12:30'), bubble('msg--out', 'Отлично, смотри на новые пузыри', '12:31'));
  }
  function bubblesSection() {
    const live = (patch) => applyPrefs({ ...prefs(), ...patch }, { cache: false });
    return section('Сообщения',
      range('bubble-radius', 'Скругление пузырей', 0, 28, prefs().bubble_radius ?? 18, ' px',
        (v) => live({ bubble_radius: v }), (v) => savePrefs({ bubble_radius: v })),
      range('text-size', 'Размер текста', 85, 130, prefs().text_size ?? 100, ' %',
        (v) => live({ text_size: v }), (v) => savePrefs({ text_size: v })),
      el('button', { type: 'button', class: 'btn btn--ghost', id: 'prefs-reset-view', text: 'Сбросить вид',
        onclick: () => savePrefs({ bubble_radius: null, text_size: null }) }));
  }

  /* ---- Страницы ---- */
  const PAGES = {
    menu: { title: 'Настройки', build: () => [menuHeader(), accountsMini(), el('div', { class: 'tg-list' },
      tgRow('account', 'i-profile', 'tg-ico--blue', 'Аккаунт', 'Номер, имя пользователя, «О себе»'),
      tgRow('chats', 'i-chats', 'tg-ico--orange', 'Настройки чатов', 'Обои, тема, вид сообщений, реакции'),
      tgRow('privacy', 'i-eye', 'tg-ico--green', 'Конфиденциальность', 'Кто может писать, активность, блокировки'))] },
    chats: { title: 'Настройки чатов', build: () => [previewSection(), bubblesSection(), themeSection(), wallpaperSection(), reactionSection()] },
    privacy: { title: 'Конфиденциальность', build: () => [privacySection()], after: loadBlocked },
    account: { title: 'Аккаунт', build: () => [accounts ? accountsSection() : null, accountSection()].filter(Boolean) },
  };
  let page = 'menu';
  /* Главная страница настроек в стиле Telegram: шапка с аватаркой, «Аккаунты», цветные иконки разделов */
  function currentAccount() {
    const list = accounts?.list() ?? [];
    return list.find((a) => a.id === accounts?.current()) ?? list[0] ?? null;
  }
  function menuHeader() {
    const a = currentAccount();
    if (!a) return el('div');
    const name = a.display_name || a.username;
    return el('div', { class: 'tg-head' },
      avatar(name, { user: { id: a.id, display_name: name, username: a.username, avatar: a.avatar }, big: true }),
      el('b', { class: 'tg-head__name', text: name }),
      el('small', { class: 'tg-head__login', text: `@${a.username}` }));
  }
  function accountsMini() {
    if (!accounts) return el('div');
    const list = accounts.list();
    return el('section', { class: 'tg-section' },
      el('h3', { class: 'tg-section__title', text: 'Аккаунты' }),
      el('div', { class: 'tg-list' },
        list.map((a) => {
          const cur = a.id === accounts.current();
          return el('button', { type: 'button', class: 'tg-row tg-row--acc', dataset: { account: a.id },
            onclick: () => { if (!cur) accounts.onSwitch(a.id); } },
            avatar(a.display_name || a.username, { user: { id: a.id, display_name: a.display_name, username: a.username, avatar: a.avatar }, small: true }),
            el('span', { class: 'tg-row__text' }, el('b', { text: a.display_name || a.username })),
            cur ? icon('i-check', 'tg-row__mark') : null);
        }),
        el('button', { type: 'button', class: 'tg-row tg-row--add', id: 'account-add-mini', onclick: () => accounts.onAdd() },
          el('span', { class: 'tg-ico tg-ico--plus' }, icon('i-plus')),
          el('span', { class: 'tg-row__text' }, el('b', { text: 'Добавить аккаунт' })))));
  }
  function tgRow(id, iconId, tone, title, hint) {
    return el('button', { type: 'button', class: 'tg-row', dataset: { page: id }, onclick: () => render(id) },
      el('span', { class: `tg-ico ${tone}` }, icon(iconId)),
      el('span', { class: 'tg-row__text' }, el('b', { text: title }), el('small', { text: hint })),
      icon('i-chevron', 'tg-row__chev'));
  }
  function navRow(id, title, hint) {
    return el('button', { type: 'button', class: 'prefs__nav', dataset: { page: id }, onclick: () => render(id) },
      el('span', {}, el('b', { text: title }), el('small', { text: hint })), icon('i-chevron'));
  }
  $('#prefs-back').addEventListener('click', () => render('menu'));

  function render(next = page) {
    const top = next === page ? body.scrollTop : 0;
    page = next;
    const def = PAGES[page];
    $('#prefs-title').textContent = def.title;
    $('#prefs-back').hidden = page === 'menu';
    body.replaceChildren(...def.build());
    body.scrollTop = top;
    def.after?.();
  }
  /** Открытие окна всегда начинается с главного списка. */
  return { render: () => render('menu') };
}
