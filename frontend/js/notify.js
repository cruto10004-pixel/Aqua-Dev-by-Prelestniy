/* Временная версия уведомлений: показываются, пока приложение открыто или свёрнуто, но соединение живо.
   Настоящие push-уведомления (когда приложение закрыто) потребуют FCM — это отдельный этап.
   Браузер/PWA: Notification API через service worker; Android-приложение (Capacitor): плагин LocalNotifications. */
import { el } from './dom.js';
import { storage } from './storage.js';
import { avatarSrc } from './ui/avatar.js';

const cap = () => window.Capacitor?.Plugins?.LocalNotifications ?? null;
const isNative = () => Boolean(window.Capacitor?.isNativePlatform?.());

/** Текущее состояние: 'granted' | 'denied' | 'default' | 'unsupported'. */
export async function permissionState() {
  try {
    if (isNative() && cap()) { const r = await cap().checkPermissions(); return r.display === 'prompt' || r.display === 'prompt-with-rationale' ? 'default' : r.display; }
    if (typeof Notification === 'undefined') return 'unsupported';
    return Notification.permission;
  } catch { return 'unsupported'; }
}

async function request() {
  try {
    if (isNative() && cap()) return (await cap().requestPermissions()).display === 'granted';
    return (await Notification.requestPermission()) === 'granted';
  } catch { return false; }
}

/** При входе в приложение: если разрешение ещё не выдано и не отклонено — обязательно спрашиваем. */
export async function askPermissionOnEntry() {
  if ((await permissionState()) !== 'default') return;
  await new Promise((resolve) => {
    const done = async (allow) => { box.remove(); if (allow) await request(); else storage.set('aqua.notif-declined', String(Date.now())); resolve(); };
    const box = el('div', { class: 'notif-ask', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'notif-ask-title' },
      el('div', { class: 'notif-ask__card' },
        el('h2', { id: 'notif-ask-title', text: 'Включить уведомления?' }),
        el('p', { text: 'Аква будет показывать, кто и что вам написал, пока приложение работает в фоне.' }),
        el('button', { type: 'button', class: 'btn btn--primary', id: 'notif-allow', text: 'Разрешить', onclick: () => done(true) }),
        el('button', { type: 'button', class: 'btn btn--ghost', id: 'notif-later', text: 'Не сейчас', onclick: () => done(false) })));
    document.body.append(box);
  });
}

function bodyOf(m) {
  if (m.meta?.sticker) return 'Стикер';
  if (m.meta?.gif) return 'GIF';
  if (m.kind === 'voice') return 'Голосовое сообщение';
  if (m.kind === 'image') return m.text || 'Фото';
  if (m.kind === 'video') return m.text || 'Видео';
  if (m.kind === 'file') return m.text || 'Файл';
  return m.text || 'Сообщение';
}

/** Показывает уведомление о входящем сообщении. onOpen(chatId) вызывается по тапу. */
export async function notifyMessage(m, chat, onOpen) {
  if ((await permissionState()) !== 'granted' || chat?.muted) return;
  const sender = m.sender?.display_name || m.sender?.username || 'Новое сообщение';
  const title = chat?.type === 'group' || chat?.type === 'channel' ? `${chat.title ?? ''}`.trim() || sender : sender;
  const text = chat?.type === 'group' ? `${sender}: ${bodyOf(m)}` : bodyOf(m);
  const icon = avatarSrc(m.sender?.avatar) || 'assets/icon-192.png';
  try {
    if (isNative() && cap()) {
      await cap().schedule({ notifications: [{ id: m.id % 2147483647, title, body: text, extra: { chatId: m.chat_id } }] });
      return;
    }
    const reg = await navigator.serviceWorker?.getRegistration();
    const opts = { body: text, icon, tag: `chat-${m.chat_id}`, renotify: true, data: { chatId: m.chat_id } };
    if (reg) { await reg.showNotification(title, opts); return; }
    const n = new Notification(title, opts);
    n.onclick = () => { window.focus(); onOpen?.(m.chat_id); n.close(); };
  } catch { /* уведомления — приятное дополнение, ошибки не должны ломать чат */ }
}

/** Регистрирует service worker и слушает тапы по уведомлениям. */
export function initNotifications(onOpen) {
  if (isNative() && cap()) {
    cap().addListener?.('localNotificationActionPerformed', (e) => { const id = e?.notification?.extra?.chatId; if (id) onOpen(Number(id)); });
    return;
  }
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.type === 'open-chat') onOpen(Number(e.data.chatId)); });
}
