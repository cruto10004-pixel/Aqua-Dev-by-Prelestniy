/* Форматирование времени, имён и аватаров. */
const pad = (n) => String(n).padStart(2, '0');
const MONTHS = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const WEEKDAYS = ['вс','пн','вт','ср','чт','пт','сб'];

export const timeHM = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const daysAgo = (iso) => Math.round((startOfDay(new Date()) - startOfDay(new Date(iso))) / 86400000);

/** Ключ дня для группировки сообщений. */
export const dayKey = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

export function dayLabel(iso) {
  const n = daysAgo(iso), d = new Date(iso);
  if (n === 0) return 'Сегодня';
  if (n === 1) return 'Вчера';
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === new Date().getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/** Время в списке чатов: сегодня — часы, вчера — «вчера», неделя — день недели, иначе дата. */
export function listTime(iso) {
  if (!iso) return '';
  const n = daysAgo(iso), d = new Date(iso);
  if (n === 0) return timeHM(iso);
  if (n === 1) return 'вчера';
  if (n < 7) return WEEKDAYS[d.getDay()];
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${String(d.getFullYear()).slice(2)}`;
}

export function lastSeenText(iso) {
  if (!iso) return 'был(а) недавно';
  const n = daysAgo(iso);
  if (n === 0) return `был(а) в ${timeHM(iso)}`;
  if (n === 1) return `был(а) вчера в ${timeHM(iso)}`;
  const d = new Date(iso);
  return `был(а) ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

export function initials(name) {
  const words = name.trim().split(/\s+/);
  return (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase();
}

/** Стабильный оттенок аватара по имени. */
export function hueFor(name) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)) % 360;
  return h;
}

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / 1024 ** 2).toFixed(1)} МБ`;
}
