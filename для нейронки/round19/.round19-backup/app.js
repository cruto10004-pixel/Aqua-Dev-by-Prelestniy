// SVG delivery states. Existing fixtures are locally sent; no server receipts are inferred.
function statusSVG(status = "sent") {
  const labels = {
    local: "Сохранено в демо на этом устройстве",
    sending: "Отправляется",
    sent: "Отправлено",
    delivered: "Доставлено",
    read: "Прочитано",
    error: "Ошибка отправки",
  };
  const shapes = {
    local: '<rect x="6" y="3" width="13" height="18" rx="3"/><path d="M11 17h3"/>',
    sending: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
    sent: '<path d="m5 12 4 4L19 6"/>',
    delivered: '<path d="m2 12 4 4L16 6m-4 9 2 2L24 7"/>',
    read: '<path d="m2 12 4 4L16 6m-4 9 2 2L24 7"/>',
    error: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 4h.01"/>',
  };
  return `<svg class="delivery-status ${status}" viewBox="0 0 26 24" role="img" aria-label="${labels[status] || labels.sent}">${shapes[status] || shapes.sent}</svg>`;
}
const $ = (s) => document.querySelector(s),
  app = $("#app");
const paths = {
  chats: "M4 4h16v12H9l-5 4zM8 8h8M8 12h5",
  contacts:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  profile: "M20 21v-2a7 7 0 0 0-14 0v2M13 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
  settings:
    "m12 3 2 3 4-.2.2 4 3 2-3 2-.2 4-4-.2-2 3-2-3-4 .2-.2-4-3-2 3-2 .2-4 4 .2zM15 12a3 3 0 1 0-6 0 3 3 0 0 0 6 0",
  search: "m21 21-5-5M18 10a8 8 0 1 0-16 0 8 8 0 0 0 16 0",
  plus: "M12 5v14M5 12h14",
  back: "m14 5-7 7 7 7M7 12h14",
  more: "M12 5h.01M12 12h.01M12 19h.01",
  send: "m3 3 19 9-19 9 4-9zM7 12h15",
  smile: "M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0M8 14q4 5 8 0M8 8h.01M16 8h.01",
  clip: "m9 13 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l9-9",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
  info: "M12 11v6M12 7h.01M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0",
  pin: "m8 3 8 0-1 7 4 4H5l4-4zM12 14v7",
  check: "m5 12 4 4L19 6",
  chevron: "m9 5 7 7-7 7",
  edit: "m4 16 12-12 4 4L8 20H4zM13 7l4 4",
  saved: "M6 3h12v18l-6-4-6 4z",
  shield: "m12 3 8 3v7q0 5-8 8-8-3-8-8V6zM8 12l3 3 5-6",
  palette:
    "M21 11a9 9 0 1 0-9 10c5 0-1-6 4-6h2q3 0 3-4M7 8h.01M12 6h.01M16 9h.01M6 13h.01",
  logout: "M9 3H3v18h6M9 12h12m-4-4 4 4-4 4",
  image: "M3 3h18v18H3zM3 17l6-6 5 5 3-3 4 4M16 7h.01",
  folder: "M3 6V4h7l3 3h8v14H3z",
  close: "m6 6 12 12M6 18 18 6",
  play: "M7 5v14l12-7z",
  doc: "M6 3h8l4 4v14H6zM14 3v4h4M9 13h6M9 17h6",
  copy: "M8 8h12v13H8zM16 8V4H4v13h4",
};
const icon = (n) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[n] || paths.chats}"/></svg>`;
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const btn = (n, a, cls = "icon-btn", label = n) =>
  `<button type="button" class="${cls}" data-action="${a}" aria-label="${label}" title="${label}">${icon(n)}</button>`;
const chats = [
  {
    id: 0,
    name: "Aqua",
    sub: "Добро пожаловать. Здесь всё начинается.",
    time: "14:48",
    badge: 2,
    logo: true,
    pin: true,
  },
  {
    id: 1,
    name: "Александра",
    sub: "Мне нравится, как получилось ♡",
    time: "14:32",
    color: "coral",
    initial: "А",
    online: true,
  },
  {
    id: 2,
    name: "Избранное",
    sub: "Вы: Идеи, которые хочется сохранить",
    time: "13:16",
    initial: "",
    saved: true,
  },
  {
    id: 3,
    name: "Aqua · команда",
    sub: "Даня: Собрали всё в одном месте",
    time: "12:41",
    color: "lilac",
    initial: "A",
    badge: 5,
    group: true,
  },
  {
    id: 4,
    name: "Михаил",
    sub: "Фото с выходных уже здесь",
    time: "11:58",
    color: "mint",
    initial: "М",
  },
  {
    id: 5,
    name: "Дизайн и детали",
    sub: "Новая коллекция вдохновения",
    time: "10:24",
    color: "gold",
    initial: "Д",
    channel: true,
  },
  {
    id: 6,
    name: "София",
    sub: "Договорились, до завтра!",
    time: "Вчера",
    color: "lilac",
    initial: "С",
  },
  { id: 7, name: "Никита", sub: "Отличная идея", time: "Вчера", initial: "Н" },
];
let state = {
  page: "chats",
  chat: 1,
  filter: "all",
  mobile: false,
  picker: false,
  pickerTab: "emoji",
  profile: {
    id: null, // Reserved for the backend; never derived from username or phone.
    localId: null, // Browser-scoped identity is assigned by AquaProfile.
    name: "Алексей",
    bio: "Ловлю моменты. Сохраняю важное.",
    username: "alex.aqua",
  },
  theme: "#aebfee",
  toggles: {},
  auth: "login",
  searchOpen: false,
  filterOpen: false,
};
const messages = {};
function avatar(c, large = "") {
  const initials = c.initial || String(c.name || 'Aqua').trim().split(/\s+/).slice(0,2).map(part=>Array.from(part)[0]||'').join('') || 'A';
  const image = c.image || (c.logo ? 'assets/aqua.png' : '');
  return `<span class="avatar ${c.color || ""} ${c.online ? "online" : ""} ${large}"><span class="avatar-fallback" aria-hidden="true">${c.saved ? icon("saved") : esc(initials)}</span>${image ? `<img src="${esc(image)}" alt="" onerror="this.hidden=true">` : ''}</span>`;
}
const navItems = [
  ["chats", "Чаты"],
  ["contacts", "Контакты"],
  ["settings", "Настройки"],
  ["profile", "Профиль"],
];
paths.menu = "M5 7h14M5 12h14M5 17h14";
const navPaths = {
  chats:
    "M3 3h15a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2zm5 18 3-3h7a3 3 0 0 0 3-3V8h1v11a2 2 0 0 1-2 2H8z",
  contacts:
    "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 9c0-4 3-6 7-6s7 2 7 6v1H2zm16-8a3.5 3.5 0 1 0-2.5-6 5 5 0 0 1 0 5.5c.7.4 1.5.5 2.5.5zm-.5 2c3 0 4.5 2.5 4.5 5v2h-4v-1c0-2-.6-4-2-5.5.5-.3 1-.5 1.5-.5z",
  profile:
    "M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zm-8 8c0-4.2 3.4-6.5 8-6.5s8 2.3 8 6.5V21H4z",
  settings:
    "M10 2h4l.7 2.3 1.6.7 2.2-1.1 2.8 2.8-1.1 2.2.7 1.6 2.3.7v4l-2.3.7-.7 1.6 1.1 2.2-2.8 2.8-2.2-1.1-1.6.7L14 23h-4l-.7-2.3-1.6-.7-2.2 1.1-2.8-2.8 1.1-2.2-.7-1.6L1 14.8v-4l2.3-.7.7-1.6-1.1-2.2 2.8-2.8 2.2 1.1 1.6-.7zm2 7a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z",
};
function navIcon(n) {
  return `<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${navPaths[n]}"/></svg>`;
}
function nav() {
  return navItems
    .map(
      ([n, t]) =>
        `<button type="button" data-action="nav:${n}" class="${state.page === n ? "active" : ""}" aria-label="${t}">${navIcon(n)}<span>${t}</span></button>`,
    )
    .join("");
}
function render() {
  if (state.page === "auth") {
    auth();
    return;
  }
  app.innerHTML = `<aside class="rail"><div class="brand"><img src="assets/aqua.png" alt="Aqua"></div>${navItems.map(([n, t]) => `<button data-action="nav:${n}" class="${state.page === n ? "active" : ""}" aria-label="${t}">${icon(n)}<small>${t}</small></button>`).join("")}<button class="bottom" data-action="auth:login" aria-label="Экран входа">${icon("logout")}</button>${avatar({ ...state.profile, color: "lilac" })}</aside><aside class="sidebar ${state.mobile ? "hidden-mobile" : ""}"><header class="side-head"><h1>Чаты</h1><div class="head-actions">${btn("saved", "chat:2", "square desktop-saved", "Избранное")}${btn("folder", "togglefilters", "square mobile-filters", "Фильтры чатов")}${btn("plus", "new", "square", "Создать чат")}</div></header><label class="search sidebar-search ${state.searchOpen ? "is-open" : ""}">${icon("search")}<input id="chat-search" placeholder="Поиск в Aqua" aria-label="Поиск чатов"></label><div class="tabs side-tabs ${state.filterOpen ? "is-open" : ""}"><button data-action="filter:all" class="${state.filter === "all" ? "active" : ""}">Все чаты</button><button data-action="filter:unread" class="${state.filter === "unread" ? "active" : ""}">Непрочитанные</button></div><button type="button" class="self-shortcut" data-action="nav:profile" aria-label="Открыть мой профиль"><span class="self-avatar">${avatar({ name: state.profile.name, color: "lilac", image:state.profile.image, initial: state.profile.name[0] })}<span class="self-badge">✦</span></span><span>Вы</span></button><div class="chat-list" id="chat-list"></div><footer class="side-foot"><span>AQUA</span><span>Ваше пространство для общения</span></footer></aside><main class="workspace ${state.mobile ? "show-mobile" : ""} ${state.page !== "chats" ? "page-mode" : ""}" id="workspace"></main><nav class="mobile-nav"><div class="nav-capsule">${nav()}</div>${btn("search", "search", "square", "Поиск")}</nav>`;
  renderList();
  if (state.page === "chats") renderChat();
  else renderPage();
}
function renderList(query = "") {
  const list = chats.filter(
    (c) =>
      (state.filter !== "unread" || c.badge) &&
      c.name.toLowerCase().includes(query.toLowerCase()),
  );
  $("#chat-list").innerHTML =
    list
      .map(
        (c) =>
          `<button class="chat-row ${state.chat === c.id ? "selected" : ""}" data-action="chat:${c.id}">${avatar(c)}<span class="row-copy"><strong>${esc(c.name)} ${c.id === 0 ? '<span style="color:#b3c5fa">✦</span>' : ""}</strong><p>${esc(c.sub)}</p></span><span class="row-meta"><span class="time">${c.time}</span>${c.badge ? `<span class="badge">${c.badge}</span>` : `<span class="ticks">${c.pin ? icon("pin") : ""}</span>`}</span></button>`,
      )
      .join("") || '<p class="empty">Чаты не найдены</p>';
}
function initialMessages(c) {
  if (c.saved)
    return [
      { text: "Здесь — всё, что хочется оставить под рукой.", out: false },
      { text: "Идея на выходные: меньше планов, больше моря 🌊", out: true },
    ];
  if (c.logo)
    return [
      { text: "Добро пожаловать в Aqua 💧", out: false },
      {
        text: "Личные чаты, каналы и любимые люди — в одном месте.",
        out: false,
      },
    ];
  return [
    { text: "Привет! Как проходит твой день?", out: false },
    {
      text: "Привет! Сегодня наконец-то выбрался к воде. Здесь невероятно спокойно.",
      out: true,
    },
    {
      text: "Кажется, я знаю, где хочу провести выходные",
      out: true,
      photo: true,
    },
    {
      text: "Как красиво! Иногда именно таких моментов и не хватает 🌊",
      out: false,
    },
    { text: "Давай в следующий раз вместе?", out: true },
    {
      text: "С удовольствием. Сохрани это место ♡",
      out: false,
      reply: { author: "Вы", text: "Давай в следующий раз вместе?" },
    },
    { voice: { dur: "0:24" }, out: false },
    { file: { name: "Маршрут-выходные.pdf", size: "1,2 МБ" }, out: true },
    { video: true, text: "Короткое видео с берега", out: false },
    {
      text: "Поправил адрес, теперь точно верный",
      out: true,
      edited: true,
      reaction: true,
    },
  ];
}
// Demo channels use 500K only when no numeric subscriber data is supplied.
function formatSubscriberCount(value) {
  const count = Number.isFinite(value) && value >= 0 ? value : 500000;
  const compact = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
  // Round before choosing the unit so 999,950 does not become "1000К".
  if (count >= 999950) return `${compact.format(count / 1000000)}М`;
  if (count >= 1000) return `${compact.format(count / 1000)}К`;
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(
    count,
  );
}
function chatSubtitle(chat) {
  if (chat.channel || chat.logo) {
    const n = chat.subscribers;
    const label = Number.isInteger(n) && n < 1000
      ? new Intl.PluralRules('ru').select(n) : 'many';
    return `${formatSubscriberCount(n)} ${{one:'Подписчик',few:'Подписчика',many:'Подписчиков',other:'Подписчиков'}[label]}`;
  }
  if (chat.group) return Array.isArray(chat.members) ? `${chat.members.length + 1} участников · демо` : "5 участников, 2 в сети";
  if (chat.saved) return "Заметки и файлы";
  return chat.status || (chat.online ? "в сети" : "был(а) недавно");
}
function renderChat() {
  const c = chats.find((c) => c.id === state.chat);
  messages[c.id] ??= initialMessages(c);
  $("#workspace").innerHTML =
    `<header class="chat-head">${btn("back", "back", "icon-btn back-mobile", "Назад")}<div class="pill optional">${btn("bell", "mute", "icon-btn", "Уведомления")}</div><button class="peer-avatar-button" type="button" data-action="info" aria-label="Профиль собеседника">${avatar(c)}</button><button type="button" class="chat-title" data-action="info"><strong>${esc(c.name)}</strong><small>${esc(chatSubtitle(c))}</small></button><div class="pill">${btn("search", "chatsearch", "icon-btn optional", "Поиск в переписке")}${btn("info", "info", "icon-btn", "Информация о чате")}${btn("more", "chatmenu", "icon-btn", "Меню чата")}</div></header><button class="pinned" data-action="pinned"><div class="pin-line"><small>Закреплённое сообщение</small><p>Маленькие моменты. Большие воспоминания.</p></div>${icon("pin")}</button><div class="messages" id="messages"><div class="date">14 ноября</div>${messages[c.id].map((m, i) => messageHTML(m, i)).join("")}</div><div class="composer-wrap"><form class="composer" id="composer">${btn("menu", "chatmenu", "composer-menu", "Действия чата")}<div class="input-pill">${btn("plus", "attach", "icon-btn", "Прикрепить файл")}<input id="message-input" placeholder="Введите сообщение…" aria-label="Сообщение" autocomplete="off">${btn("smile", "picker", "icon-btn", "Эмодзи и стикеры")}${btn("image", "attach", "icon-btn", "Фото")}</div><button type="submit" class="send" aria-label="Отправить сообщение">${icon("send")}</button></form><div id="picker-slot"></div></div>`;
  AquaMessages.syncChat();
  if (state.picker) renderPicker();
  $("#messages").scrollTop = 99999;
}
const WAVE = [
  0.35, 0.6, 0.9, 0.5, 0.8, 0.4, 1, 0.7, 0.5, 0.9, 0.6, 0.3, 0.7, 0.85, 0.5,
  0.4, 0.75, 0.6, 0.95, 0.45, 0.3, 0.6, 0.8, 0.5,
];
function voiceHTML(v) {
  return `<div class="voice"><button class="voice-play" type="button" aria-label="Воспроизвести">${icon("play")}</button><span class="wave" aria-hidden="true">${WAVE.map((h) => `<i style="--h:${h}"></i>`).join("")}</span><time class="voice-dur">${v.dur}</time></div>`;
}
function fileHTML(f) {
  return `<div class="file"><span class="file-ico">${icon("doc")}</span><span class="file-copy"><strong>${esc(f.name)}</strong><small>${esc(f.size)}</small></span></div>`;
}
function messageHTML(m, i) {
  const list = messages[state.chat] || [],
    previous = list[i - 1],
    next = list[i + 1];
  const joined = previous && previous.out === m.out,
    hasNext = next && next.out === m.out;
  const minute = 12 + i * 2,
    time =
      m.time ||
      `${14 + Math.floor(minute / 60)}:${String(minute % 60).padStart(2, "0")}`;
  return `<div class="message ${m.out ? "out" : ""} ${joined ? "joined" : ""} ${hasNext ? "has-next" : ""}" data-message="${i}" tabindex="0" aria-label="Сообщение: меню по Shift F10">${m.reply ? `<div class="reply"><strong>${esc(m.reply.author)}</strong>${esc(m.reply.text)}</div>` : ""}${m.photo ? '<div class="photo" role="img" aria-label="Тихая бухта"></div>' : ""}${m.video ? `<div class="photo video" role="img" aria-label="Видео"><span class="play-badge">${icon("play")}</span></div>` : ""}${m.voice ? voiceHTML(m.voice) : ""}${m.file ? fileHTML(m.file) : ""}${m.text ? `<span class="message-text">${esc(m.text)}</span>` : ""}<span class="stamp">${m.edited ? '<span class="edited">изменено ·</span>' : ""}<time>${time}</time>${m.out ? statusSVG(m.status || "sent") : ""}</span>${AquaMessages.reactionsHTML(m)}</div>`;
}
function row(n, title, sub, action, tone = "") {
  return `<button class="setting-row" data-action="${action}"><span class="tile-icon ${tone}">${icon(n)}</span><span class="row-copy"><strong>${title}</strong><p>${sub}</p></span>${icon("chevron")}</button>`;
}
function field(label, val = "", type = "text", id = "") {
  return `<label class="field">${label}<input ${id ? `id="${id}"` : ""} type="${type}" value="${esc(val)}" required></label>`;
}
function toggle(label, sub, key) {
  return `<label class="setting-row"><span class="row-copy"><strong>${label}</strong><p>${sub}</p></span><input class="toggle" type="checkbox" aria-label="${label}" data-toggle="${key}" ${state.toggles[key] !== false ? "checked" : ""}></label>`;
}
function renderPage() {
  if (AquaPages.render()) return;
  if(state.page==="settings"){AquaSettings.home();return;}
  if(state.page==="profile"){AquaProfile.render();return;}
  const p = state.page;
  let title =
    {
      profile: "Профиль",
      settings: "Настройки",
      contacts: "Контакты",
      appearance: "Настройки чатов",
      privacy: "Конфиденциальность",
      account: "Аккаунт",
    }[p] || "Настройки";
  let body = "";
  const hero = `<div class="profile-hero">${avatar({ name: state.profile.name, color: "lilac", image:state.profile.image, initial: state.profile.name[0] })}<h2>${esc(state.profile.name)} ${esc(state.profile.surname||" ")} <span style="color:#afbee8">✧</span></h2><p>@${esc(state.profile.username)}</p>${state.profile.channel?`<p>${esc(state.profile.channel)}</p>`:""}</div>`;
  if (p === "profile")
    body =
      hero +
      `<div class="actions"><button class="soft-btn" data-action="editprofile">${icon("edit")}Изменить</button><button class="soft-btn" data-action="profilemenu">${icon("more")}Ещё</button></div><h3 class="section-label">О себе</h3><div class="profile-value">${esc(state.profile.bio)}</div><h3 class="section-label">Ник</h3><div class="profile-value">${esc(state.profile.name)}</div><h3 class="section-label">Имя пользователя</h3><div class="profile-value">@${esc(state.profile.username)}</div><h3 class="section-label">Моё</h3><div class="group">${row("saved", "Избранное", "Заметки, сообщения и файлы", "chat:2", "pink")}${row("settings", "Настройки", "Настройте Aqua под себя", "nav:settings")}</div>`;
  if (p === "settings")
    body = `<label class="search">${icon("search")}<input id="settings-search" placeholder="Найти настройки Aqua" aria-label="Найти настройки"></label><button type="button" class="settings-person" data-action="nav:profile">${avatar({ name: state.profile.name, color: "lilac", image:state.profile.image, initial: state.profile.name[0] })}<span class="row-copy"><strong>${esc(state.profile.name)}</strong><p>Аккаунт Aqua</p></span>${icon("chevron")}</button><button type="button" class="account-shortcut" data-action="nav:account">${icon("profile")}<span>Аккаунт (1)</span>${icon("chevron")}</button><h3 class="section-label">Оформление</h3><div class="group">${row("palette", "Настройки чатов", "Тема, обои, сообщения и реакции", "nav:appearance", "pink")}</div><h3 class="section-label">Личное</h3><div class="group">${row("shield", "Конфиденциальность", "Кто может писать и видеть активность", "nav:privacy")}${row("saved", "Избранное", "Заметки и файлы", "chat:2", "pink")}</div><p class="note" style="text-align:center;margin-top:35px">Aqua · пространство для ваших разговоров</p>`;
  if (p === "appearance")
    body = `<div class="group" style="padding:20px;background:#131823"><div class="message">Привет! Как тебе новая тема? <span class="stamp">14:32</span></div><div class="message out" style="margin:12px 0 0 auto">Очень нравится ♡<span class="stamp">14:33 ${statusSVG("sent")}</span></div></div><h3 class="section-label">Тема</h3><div class="tabs"><button data-action="scheme:dark">Тёмная</button><button data-action="scheme:light">Светлая</button></div><h3 class="section-label">Цветовая гамма</h3><div class="group swatches">${["#aebfee", "#c5acd6", "#a5c9ba", "#d9bf9c"].map((c) => `<button class="swatch ${c === state.theme ? "active" : ""}" style="--sw:${c}" data-action="color:${c}" aria-label="Цвет ${c}"></button>`).join("")}</div><h3 class="section-label">Сообщения</h3><div class="group">${toggle("Скруглённые сообщения", "Мягкие формы пузырьков", "rounded")}${toggle("Анимации", "Плавные переходы интерфейса", "animations")}<label class="setting-row"><span class="row-copy"><strong>Размер текста</strong><p>Настройте для удобного чтения</p></span><input type="range" min="12" max="18" value="${state.fontSize || 16}" id="font-size" aria-label="Размер текста"></label></div><h3 class="section-label">Обои чата</h3><div class="tabs"><button data-action="wall:pattern" class="${!state.plain ? "active" : ""}">Узоры</button><button data-action="wall:plain" class="${state.plain ? "active" : ""}">Без обоев</button></div><h3 class="section-label">Быстрая реакция</h3><div class="tabs">${["♡", "👍", "🔥", "🌊"].map((e) => `<button data-action="quick:${e}">${e}</button>`).join("")}</div>`;
  if (p === "privacy")
    body = `<h3 class="section-label">Ваша активность</h3><div class="group">${toggle("Показывать «в сети»", "Другие видят, когда вы в Aqua", "online")}</div><h3 class="section-label">Кто может связаться со мной</h3>${["Личные сообщения", "Добавление в группы", "Приглашения в каналы"].map((x, i) => `<label class="field">${x}<select data-pref="privacy${i}">${["Все", "Только контакты", "Никто"].map((v) => `<option ${state["privacy" + i] === v ? "selected" : ""}>${v}</option>`).join("")}</select></label>`).join("")}<div class="group">${row("shield", "Заблокированные пользователи", "Список блокировок", "blocked", "gray")}</div>`;
  if (p === "account")
    body = `<h3 class="section-label">Ваш аккаунт</h3><div class="group">${row("profile", "@" + esc(state.profile.username), "Изменить имя пользователя", "username")}${row("shield", "Пароль", "Изменить пароль", "password", "gray")}</div><h3 class="section-label">Аккаунты</h3><div class="group">${row("check", esc(state.profile.name), "Текущий аккаунт", "nav:profile")}${row("plus", "Добавить аккаунт", "Войти в другой аккаунт Aqua", "auth:login", "gray")}</div><div class="actions"><button class="soft-btn" data-action="logout">${icon("logout")}Выйти из аккаунта</button></div>`;
  if (p === "contacts")
    body = `<label class="search">${icon("search")}<input placeholder="Поиск контактов" id="contact-search" aria-label="Поиск контактов"></label><div class="group">${row("plus", "Добавить контакт", "Найти по имени пользователя", "addcontact")}</div><h3 class="section-label">Ваши контакты · ${chats.filter((c) => c.id > 0 && !c.saved && !c.group && !c.channel).length}</h3><div class="contact-grid" id="contacts">${contactRows("")}</div>`;
  $("#workspace").innerHTML =
    `<div class="page page-${p}"><div class="page-inner"><header class="page-header">${p !== "settings" && p !== "contacts" && p !== "profile" ? btn("back", "nav:settings", "icon-btn", "Назад") : ""}<h1>${title}</h1>${p === "contacts" ? btn("plus", "addcontact", "square", "Добавить контакт") : ""}</header>${body}</div></div>`;
}
function contactRows(q) {
  return (
    chats
      .filter(
        (c) =>
          c.id > 0 &&
          !c.saved &&
          !c.group &&
          !c.channel &&
          c.name.toLowerCase().includes(q.toLowerCase()),
      )
      .map(
        (c) =>
          `<button class="chat-row" data-action="chat:${c.id}">${avatar(c)}<span class="row-copy"><strong>${esc(c.name)}</strong><p>${c.online ? "в сети" : "был(а) недавно"}</p></span>${icon("chats")}</button>`,
      )
      .join("") || '<p class="empty">Контакты не найдены</p>'
  );
}
function modal(title, body) {
  $("#modal").innerHTML =
    `<header class="modal-title"><h2>${title}</h2>${btn("close", "close", "icon-btn", "Закрыть")}</header>${body}`;
  if (!$("#modal").open) $("#modal").showModal();
}
function toast(t) {
  $("#toast").textContent = t;
  $("#toast").classList.add("show");
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(
    () => $("#toast").classList.remove("show"),
    2600,
  );
}
function renderPicker() {
  const emoji = [
    "😀",
    "😊",
    "🥰",
    "😎",
    "🥹",
    "😂",
    "🤍",
    "✨",
    "👋",
    "👍",
    "🔥",
    "🌊",
    "💧",
    "🫶",
    "🌿",
    "☀️",
    "🌙",
    "🎉",
    "🤔",
    "😍",
    "🐳",
    "🪸",
    "💙",
    "🙌",
  ];
  $("#picker-slot").innerHTML =
    `<div class="picker"><div class="tabs"><button class="${state.pickerTab === "emoji" ? "active" : ""}" data-action="pickertab:emoji">Эмодзи</button><button class="${state.pickerTab === "stickers" ? "active" : ""}" data-action="pickertab:stickers">Стикеры</button></div><label class="picker-search">${icon("search")}<input type="search" id="picker-search" placeholder="${state.pickerTab === "emoji" ? "Поиск эмодзи" : "Поиск стикеров"}" aria-label="${state.pickerTab === "emoji" ? "Поиск эмодзи" : "Поиск стикеров"}"></label>${
      state.pickerTab === "emoji"
        ? `<div class="emoji-grid">${emoji.map((e, i) => `<button data-action="emoji:${e}" aria-label="${e}" data-keywords="${["улыбка smile", "улыбка smile", "любовь love", "круто cool", "грусть sad", "смех laugh", "сердце heart", "звёзды star", "привет wave", "да like", "огонь fire", "волна wave", "капля water", "руки heart", "лист leaf", "солнце sun", "луна moon", "праздник party", "мысль think", "любовь love", "кит whale", "коралл coral", "сердце heart", "ура hooray"][i]}">${e}</button>`).join("")}</div>`
        : `<div class="sticker-grid">${[
            ["🐳", "Кит"],
            ["🦭", "Тюлень"],
            ["🐙", "Осьминог"],
            ["🪼", "Медуза"],
            ["🐬", "Дельфин"],
            ["🦦", "Выдра"],
          ]
            .map(
              ([e, n]) =>
                `<button data-action="sticker:${e}" data-keywords="${n.toLowerCase()} aqua" aria-label="${n}">${e}<small>${n}</small></button>`,
            )
            .join("")}</div>`
    }</div>`;
  $("#messages").scrollTop = 99999;
}
function auth() {
  const a = state.auth;
  const titles = {
    login: "С возвращением",
    register: "Начнём знакомство",
    code: "Проверьте Telegram",
    finish: "Почти готово",
    recover: "Восстановление",
    newpass: "Новый пароль",
  };
  app.innerHTML = `<main class="auth"><section class="auth-art"><div class="brand"><img src="assets/aqua.png" alt="">Aqua</div><div><div class="auth-orbit"></div><h1>Ближе.<br>Даже на<br>расстоянии.</h1><p>Ваши люди, важные слова и маленькие моменты. Всё в одном пространстве.</p></div><small>AQUA MESSENGER</small></section><section class="auth-form"><div class="brand"><img src="assets/aqua.png" alt="Aqua"></div><h1>${titles[a]}</h1><p class="note" style="margin-left:0">${a === "login" ? "Войдите, чтобы продолжить общение." : a === "code" ? "В демо используйте любой шестизначный код." : "Демонстрация интерфейса · без подключения к сервисам"}</p><div class="tabs"><button data-action="auth:login" class="${a === "login" ? "active" : ""}">Вход</button><button data-action="auth:register" class="${a !== "login" ? "active" : ""}">Регистрация</button></div><form id="auth-form">${a === "login" ? field("Логин", "", "text") + field("Пароль", "", "password") : a === "register" ? field("Номер из Telegram-бота", "", "tel") + '<p class="note">В Aqua номер и код выдаёт Telegram-бот.</p><button type="button" class="text-btn" data-action="demobot">Открыть Telegram-бота</button>' : a === "code" ? '<label class="field">Код подтверждения<input required inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="000000"></label>' : a === "finish" ? field("Логин") + field("Пароль (от 8 символов)", "", "password") : a === "recover" ? field("Логин") : field("Новый пароль", "", "password")}<button class="soft-btn" type="submit">${a === "login" ? "Войти" : a === "register" || a === "recover" ? "Получить код" : a === "code" ? "Подтвердить" : a === "finish" ? "Создать аккаунт" : "Сохранить пароль"} ${icon("chevron")}</button></form>${a === "login" ? '<button class="text-btn" data-action="auth:recover">Забыли пароль?</button>' : ""}<button class="text-btn" data-action="nav:chats">Открыть демо Aqua</button></section></main>`;
}
function send(text) {
  if (!text.trim()) return;
  AquaMotion.play(
    $(".send"),
    [{ transform: "scale(.84)" }, { transform: "scale(1)" }],
    170,
  );
  messages[state.chat].push({
    text,
    reply: AquaMessages.consumeReply(),
    out: true,
    status: "local",
    time: new Date().toLocaleTimeString("ru", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  });
  chats.find((c) => c.id === state.chat).sub = "Вы: " + text;
  const list = $("#messages");
  const previous = messages[state.chat].at(-2);
  if (previous?.out) list.lastElementChild?.classList.add("has-next");
  list.insertAdjacentHTML(
    "beforeend",
    messageHTML(messages[state.chat].at(-1), messages[state.chat].length - 1),
  );
  const sent = messages[state.chat].at(-1),
    chatId = state.chat;
  chats.find((c) => c.id === state.chat).time = sent.time;
  $("#message-input").value = "";
  AquaMotion.enter(list.lastElementChild, "sent");
  list.scrollTop = list.scrollHeight;
  renderList();
  if (state.chat !== 0 && state.chat !== 2) typeReply(state.chat);
}
function typeReply(chatId) {
  const list = $("#messages");
  if (!list || state.chat !== chatId) return;
  const dots = document.createElement("div");
  dots.className = "message typing-bubble";
  dots.innerHTML =
    '<span class="dots" role="status" aria-label="Печатает"><i></i><i></i><i></i></span>';
  list.append(dots);
  AquaMotion.enter(dots, "message");
  list.scrollTop = list.scrollHeight;
  setTimeout(() => {
    dots.remove();
    const reply = { text: "Отлично, отвечу чуть позже ♡", out: false };
    messages[chatId].push(reply);
    chats.find((c) => c.id === chatId).sub = reply.text;
    if (state.chat !== chatId || !list.isConnected) {
      renderList();
      return;
    }
    list.insertAdjacentHTML(
      "beforeend",
      messageHTML(reply, messages[chatId].length - 1),
    );
    const node = list.lastElementChild;
    AquaMotion.enter(node, "message");
    list.scrollTop = list.scrollHeight;
    renderList();
  }, 1100);
}
app.addEventListener("submit", (e) => {
  e.preventDefault();
  if (e.target.id === "composer") {
    send($("#message-input").value);
    return;
  }
  if (e.target.id === "auth-form") {
    let a = state.auth;
    if (a === "login" || a === "finish" || a === "newpass") {
      state.page = "chats";
      state.mobile = false;
      render();
      toast("Добро пожаловать в демо Aqua");
    } else {
      if (a === "recover") state.recovering = true;
      state.auth =
        a === "code" ? (state.recovering ? "newpass" : "finish") : "code";
      auth();
    }
  }
});
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  const [a, ...rest] = el.dataset.action.split(":"),
    v = rest.join(":");
  if (a === "close") {
    closeModal();
    return;
  }
  if (a === "nav") {
    state.page = v;
    state.mobile = v !== "chats";
    render();
  } else if (a === "chat") {
    state.chat = +v;
    state.page = "chats";
    state.mobile = true;
    chats.find((c) => c.id === +v).badge = 0;
    closeModal();
    render();
  } else if (a === "back") {
    state.mobile = false;
    state.picker = false;
    render();
  } else if (a === "filter") {
    state.filter = v;
    renderList($("#chat-search").value);
    document
      .querySelectorAll(".side-tabs button")
      .forEach((b) =>
        b.classList.toggle("active", b.dataset.action === "filter:" + v),
      );
  } else if (a === "togglefilters") {
    state.filterOpen = !state.filterOpen;
    $(".side-tabs").classList.toggle("is-open", state.filterOpen);
  } else if (a === "auth") {
    state.page = "auth";
    state.auth = v;
    state.recovering = false;
    closeModal();
    render();
  } else if (a === "picker") {
    state.picker = !state.picker;
    state.picker ? renderPicker() : dismissPicker();
  } else if (a === "pickertab") {
    state.pickerTab = v;
    renderPicker();
  } else if (a === "emoji") {
    $("#message-input").value += v;
    $("#message-input").focus();
  } else if (a === "sticker") {
    send(v);
    toast("Стикер отправлен");
  } else if (a === "search") {
    state.page = "chats";
    state.mobile = false;
    state.searchOpen = true;
    render();
    $("#chat-search").focus();
  } else if (a === "chatsearch") {
    modal(
      "Поиск в переписке",
      '<label class="field">Текст сообщения<input id="message-search" placeholder="Найти…"></label><div id="search-results" class="note">Введите текст для поиска</div>',
    );
  } else if (a === "info") {
    const c = chats.find((c) => c.id === state.chat);
    modal(
      c.saved ? "Избранное" : "Информация о чате",
      `<div class="profile-hero">${avatar(c)}<h2>${esc(c.name)}</h2><p>${c.group ? "5 участников" : c.channel ? "@aqua_design" : c.saved ? "Ваше личное пространство" : "@" + (c.id === 1 ? "alexandra" : "aqua_user")}</p></div><p class="note">${c.saved ? "Сохраняйте сообщения, идеи и файлы." : c.group ? "Обсуждаем идеи и создаём Aqua вместе." : "Маленькие моменты. Большие воспоминания."}</p><div class="group">${row("image", "Медиа и файлы", "Фото из переписки", "media")}${c.group ? row("contacts", "Участники", "Алексей, Александра, Михаил и ещё 2", "members") : ""}</div>`,
    );
  } else if (a === "new")
    modal(
      "Новое общение",
      row("chats", "Личное сообщение", "Выберите контакт", "nav:contacts") +
        row(
          "contacts",
          "Создать группу",
          "Объедините близких",
          "create:group",
        ) +
        row("chats", "Создать канал", "Делитесь важным", "create:channel"),
    );
  else if (a === "create")
    modal(
      v === "group" ? "Новая группа" : "Новый канал",
      `<form id="create-form" data-kind="${v}">${field("Название", "", "text", "new-name")}${v === "channel" ? field("Публичный username", "", "text", "new-username") : '<p class="note">В демо будут добавлены ваши контакты.</p>'}<button class="soft-btn" type="submit">Создать</button></form>`,
    );
  else if (a === "editprofile")
    modal(
      "Изменить профиль",
      `<form id="profile-form">${field("Ник", state.profile.name, "text", "profile-name")}<label class="field">О себе<textarea id="profile-bio">${esc(state.profile.bio)}</textarea></label><button class="soft-btn" type="submit">Сохранить</button></form>`,
    );
  else if (a === "chatmenu")
    modal(
      "Действия с чатом",
      row("bell", "Уведомления", "Включить или выключить", "mute") +
        row(
          "saved",
          "Сохранить сообщение",
          "Добавить закреплённое в избранное",
          "savepin",
        ) +
        row("search", "Поиск", "Найти сообщение", "chatsearch"),
    );
  else if (a === "profilemenu")
    modal(
      "Ваш профиль",
      row("profile", "Изменить профиль", "Имя и описание", "editprofile") +
        row("logout", "Выйти", "Открыть экран входа", "logout"),
    );
  else if (a === "logout")
    modal(
      "Выйти из Aqua?",
      '<p class="note">Демонстрационные сообщения останутся доступны в этой вкладке.</p><div class="actions"><button class="soft-btn" data-action="close">Отмена</button><button class="soft-btn" data-action="auth:login">Выйти</button></div>',
    );
  else if (a === "mute") {
    state.toggles.mute = !state.toggles.mute;
    toast(
      state.toggles.mute ? "Уведомления выключены" : "Уведомления включены",
    );
  } else if (a === "pinned")
    modal(
      "Закреплённое сообщение",
      '<p class="note">Маленькие моменты. Большие воспоминания.</p><button class="soft-btn" data-action="savepin">Сохранить в избранное</button>',
    );
  else if (a === "savepin") {
    messages[2] ??= initialMessages(chats[2]);
    messages[2].push({
      text: "Маленькие моменты. Большие воспоминания.",
      out: true,
    });
    closeModal();
    toast("Сохранено в избранном");
  } else if (a === "attach")
    modal(
      "Вложение",
      row("image", "Фото или видео", "Выбрать с устройства", "file") +
        row("folder", "Документ", "Отправить файл", "file") +
        row("contacts", "Контакт", "Поделиться контактом", "sharecontact"),
    );
  else if (a === "file") {
    const input = document.createElement("input");
    input.type = "file";
    input.onchange = () => {
      if (input.files[0]) {
        send("📎 " + input.files[0].name);
        closeModal();
      }
    };
    input.click();
  } else if (a === "sharecontact")
    modal(
      "Поделиться контактом",
      chats
        .filter((c) => c.online || c.id === 4)
        .map((c) =>
          row("profile", esc(c.name), "Контакт Aqua", "share:" + c.id),
        )
        .join(""),
    );
  else if (a === "share") {
    send("👤 " + chats.find((c) => c.id === +v).name);
    closeModal();
  } else if (a === "media")
    modal(
      "Медиа и файлы",
      '<div class="message" style="max-width:100%"><div class="photo">BY THE WATER</div><small>Сегодня · фото из переписки</small></div>',
    );
  else if (a === "members") modal("Участники", contactRows(""));
  else if (a === "blocked")
    modal(
      "Заблокированные",
      '<p class="note">Заблокированных пользователей нет. В этом списке появятся контакты, которым вы ограничили доступ.</p>',
    );
  else if (a === "addcontact")
    modal(
      "Добавить контакт",
      `<form id="contact-form">${field("Имя", "", "text", "contact-name")}${field("Имя пользователя", "", "text", "contact-username")}<button class="soft-btn" type="submit">Добавить</button></form>`,
    );
  else if (a === "color") {
    state.theme = v;
    document.documentElement.style.setProperty("--accent", v);
    renderPage();
    toast("Цветовая гамма сохранена");
  } else if (a === "wall") {
    state.plain = v === "plain";
    renderPage();
    toast("Обои изменены");
  } else if (a === "quick") {
    state.quick = v;
    toast("Быстрая реакция: " + v);
  } else if (a === "username" || a === "password")
    modal(
      a === "username" ? "Изменить логин" : "Изменить пароль",
      `<form id="account-form" data-kind="${a}">${a === "username" ? field("Новый логин", state.profile.username, "text", "account-value") : field("Текущий пароль", "", "password") + field("Новый пароль", "", "password", "account-value")}<button type="submit" class="soft-btn">Сохранить</button></form>`,
    );
  else if (a === "demobot")
    modal(
      "Telegram-бот Aqua",
      '<p class="note">Это автономная демонстрация. Продолжите регистрацию с любым номером и шестизначным кодом — сообщение в Telegram не отправляется.</p><button class="soft-btn" data-action="close">Понятно</button>',
    );
  if (a === "scheme") { document.documentElement.dataset.scheme = v; state.scheme = v; }
  if (a === "nav") closeModal();
  applyPrefs();
});
document.addEventListener("submit", (e) => {
  if (!e.target.closest("#modal")) return;
  e.preventDefault();
  if (e.target.id === "profile-form") {
    state.profile.name = $("#profile-name").value.trim() || "Алексей";
    state.profile.bio = $("#profile-bio").value;
    renderPage();
    toast("Профиль сохранён");
  }
  if (e.target.id === "create-form") {
    const name = $("#new-name").value.trim();
    if (!name) return;
    const kind = e.target.dataset.kind;
    const c = {
      id: chats.length,
      name,
      sub: "Чат создан",
      time: "Сейчас",
      initial: name[0],
      color: "lilac",
      group: kind === "group",
      channel: kind === "channel",
    };
    chats.push(c);
    messages[c.id] = [
      {
        text:
          kind === "group"
            ? "Группа создана. Начните разговор!"
            : "Канал создан. Напишите первую публикацию.",
        out: false,
      },
    ];
    state.chat = c.id;
    state.page = "chats";
    state.mobile = true;
    render();
    toast("Готово");
  }
  if (e.target.id === "contact-form") {
    const name = $("#contact-name").value.trim();
    if (!name) return;
    chats.push({
      id: chats.length,
      name,
      sub: "Новый контакт",
      time: "Сейчас",
      initial: name[0],
      color: "mint",
    });
    renderPage();
    toast("Контакт добавлен");
  }
  if (e.target.id === "account-form") {
    if (e.target.dataset.kind === "username")
      state.profile.username = $("#account-value").value.trim();
    toast("Изменения сохранены");
    renderPage();
  }
  closeModal();
});
app.addEventListener("input", (e) => {
  if (e.target.id === "chat-search") renderList(e.target.value);
  if (e.target.id === "picker-search") {
    const q = e.target.value.toLowerCase().trim();
    document
      .querySelectorAll(".picker [data-keywords]")
      .forEach(
        (b) =>
          (b.hidden =
            !b.dataset.keywords.includes(q) &&
            !b.textContent.toLowerCase().includes(q)),
      );
  }
  if (e.target.id === "contact-search")
    $("#contacts").innerHTML = contactRows(e.target.value);
  if (e.target.id === "settings-search")
    document
      .querySelectorAll(".page .setting-row")
      .forEach(
        (r) =>
          (r.hidden = !r.textContent
            .toLowerCase()
            .includes(e.target.value.toLowerCase())),
      );
  if (e.target.id === "font-size") {
    state.fontSize = e.target.value;
    applyPrefs();
  }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "message-search") {
    $("#search-results").innerHTML =
      messages[state.chat]
        .filter((m) =>
          (m.text || "").toLowerCase().includes(e.target.value.toLowerCase()),
        )
        .map((m) => `<p style="padding:10px">${esc(m.text)}</p>`)
        .join("") || "Ничего не найдено";
  }
});
app.addEventListener("change", (e) => {
  if (e.target.dataset.toggle) {
    state.toggles[e.target.dataset.toggle] = e.target.checked;
    applyPrefs();
    toast("Настройка сохранена");
  }
  if (e.target.dataset.pref) {
    state[e.target.dataset.pref] = e.target.value;
    toast("Настройка сохранена");
  }
});
function applyPrefs() {
  AquaMotion.setEnabled(!state.settings?.power && state.toggles.animations !== false);
  const root = document.documentElement;
  root.style.setProperty("--message-size", `${state.fontSize || 16}px`);
  root.style.setProperty(
    "--message-radius",
    state.toggles.rounded === false ? "6px" : "16px",
  );
  root.style.setProperty(
    "--outgoing",
    `color-mix(in srgb,${state.theme} 12%,#20242d)`,
  );
  let sheet = $("#preferences");
  if (!sheet) {
    sheet = document.createElement("style");
    sheet.id = "preferences";
    document.head.append(sheet);
  }
  sheet.textContent = `${state.plain ? ".messages{background:#101319}" : ""}${state.toggles.animations === false ? "*{transition:none!important}.dots i{animation:none!important}" : ""}`;
}

$("#modal").addEventListener("click", (e) => {
  if (e.target === $("#modal")) {
    const r = e.target.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      closeModal();
  }
});
let modalEpoch = 0;
function closeModal() {
  const dialog = $("#modal");
  if (!dialog.open) return;
  const epoch = ++modalEpoch;
  AquaMotion.play(
    dialog,
    [
      { opacity: 1, transform: "none" },
      { opacity: 0, transform: "translateY(24px) scale(.985)" },
    ],
    170,
  ).then(() => {
    if (epoch === modalEpoch) dialog.close();
  });
}
function dismissPicker() {
  const node = $(".picker");
  AquaMotion.play(
    node,
    [
      { opacity: 1, transform: "none" },
      { opacity: 0, transform: "translateY(6px)" },
    ],
    150,
  ).then(() => {
    if (!state.picker) node?.remove();
  });
}
$("#modal").addEventListener("cancel", (e) => {
  e.preventDefault();
  closeModal();
});
let rendering = false;
const tabOrder = ["chats", "contacts", "settings", "profile"];
function currentTab() {
  if (AquaPages.root()) return AquaPages.root();
  return ["appearance", "privacy", "account"].includes(state.page)
    ? "settings"
    : state.page;
}
function syncDock(dock, animate = true) {
  if (!dock || !dock.getBoundingClientRect().width) return;
  const tab = currentTab(),
    capsule = dock.querySelector(".nav-capsule");
  const buttons = [...capsule.querySelectorAll('[data-action^="nav:"]')];
  const indicator = capsule.querySelector(".dock-indicator");
  const before = indicator?.getBoundingClientRect();
  const previous = buttons.map((b) => b.getBoundingClientRect());
  indicator?.getAnimations().forEach((a) => a.cancel());
  buttons.forEach((b) => b.getAnimations().forEach((a) => a.cancel()));
  buttons.forEach((b) => {
    const on = b.dataset.action === "nav:" + tab;
    b.classList.toggle("active", on);
    b.setAttribute("aria-current", on ? "page" : "false");
  });
  const active = buttons.find((b) => b.classList.contains("active"));
  const container = capsule.getBoundingClientRect(),
    target = active.getBoundingClientRect();
  const pill = indicator || document.createElement("span");
  if (!indicator) {
    pill.className = "dock-indicator";
    pill.setAttribute("aria-hidden", "true");
    pill.innerHTML = '<span class="glass-volume"></span>';
    capsule.prepend(pill);
  }
  pill.style.width = `${target.width}px`;
  pill.style.transform = `translateX(${target.left - container.left - 5}px)`;
  if (before && animate) {
    const after = pill.getBoundingClientRect(),
      scale = before.width / after.width;
    AquaMotion.play(
      pill,
      [
        {
          transform: `translateX(${before.left - container.left - 5}px) scaleX(${scale})`,
        },
        { transform: pill.style.transform },
      ],
      360, 0, "spring",
    );
    buttons.forEach((b, i) => {
      const delta = previous[i].left - b.getBoundingClientRect().left;
      if (delta)
        AquaMotion.play(
          b,
          [{ transform: `translateX(${delta}px)` }, { transform: "none" }],
          220,
        );
    });
  }
}
for (const name of [
  "render",
  "renderPage",
  "renderChat",
  "auth",
  "renderPicker",
  "modal",
]) {
  const original = {
    render,
    renderPage,
    renderChat,
    auth,
    renderPicker,
    modal,
  }[name];
  const wrapped = function (...args) {
    if (!rendering) AquaTransitions.capture(name);
    const nested = rendering;
    rendering = true;
    const dock = name === "render" ? $(".mobile-nav") : null;
    if (name === "modal") {
      modalEpoch++;
      $("#modal")
        .getAnimations()
        .forEach((a) => a.cancel());
    }
    try {
      return original(...args);
    } finally {
      rendering = nested;
      if (!nested) {
        if (name === "render") {
          const replacement = $(".mobile-nav");
          if (dock && replacement) replacement.replaceWith(dock);
          syncDock($(".mobile-nav"));
          if (!dock) AquaMotion.enter($(".nav-capsule"), "sheet");
        }
        if (name === "render" && state.page === "chats" && state.mobile)
          app.classList.add("conversation-open");
        else if (name === "render") app.classList.remove("conversation-open");
        const target =
          name === "modal"
            ? $("#modal")
            : name === "renderPicker"
              ? $(".picker")
              : name === "renderChat"
                ? $("#workspace")
                : state.page === "auth"
                  ? $(".auth-form")
                  : state.page !== "chats"
                    ? $(".page-inner")
                    : state.mobile
                      ? $("#workspace")
                      : $(".sidebar");
        if (name === "render") {
          AquaChat.afterRender();
          AquaSearch.sync();
        }
        AquaTransitions.run(name, target, args);
        if(name==='auth')document.querySelector('#auth-form input[pattern]')?.setAttribute('inputmode',state.settings?.keyboard==='system'?'text':'numeric');
      }
    }
  };
  if (name === "render") render = wrapped;
  if (name === "renderPage") renderPage = wrapped;
  if (name === "renderChat") renderChat = wrapped;
  if (name === "auth") auth = wrapped;
  if (name === "renderPicker") renderPicker = wrapped;
  if (name === "modal") modal = wrapped;
}
// Track the visual viewport so the composer stays above the software keyboard.
let viewportFrame;
function resizeViewport() {
  cancelAnimationFrame(viewportFrame);
  viewportFrame = requestAnimationFrame(() => {
    document.documentElement.style.setProperty(
      "--viewport-height",
      `${window.visualViewport?.height || innerHeight}px`,
    );
    syncDock($(".mobile-nav"), false);
  });
}
window.visualViewport?.addEventListener("resize", resizeViewport);
window.addEventListener("resize", resizeViewport);
resizeViewport();
AquaPages.install();
AquaChat.install();
AquaSearch.install();
AquaSettings.init();
render();
