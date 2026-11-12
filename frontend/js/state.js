/* Единое состояние приложения (без фреймворка): данные лежат здесь, UI-модули только читают и рисуют. */

export const state = {
  user: null,                 // {id, username}
  chats: new Map(),           // chatId -> chat (как отдаёт API)
  order: [],                  // chatId в порядке отображения
  activeChatId: null,
  conn: '',                   // подпись состояния соединения («Соединение...») или пусто
  history: new Map(),         // chatId -> {items: [message], hasMore, loading}
  pending: new Map(),         // chatId -> [{clientId, text, created_at, failed}]
  unread: new Map(),          // chatId -> число непрочитанных за эту сессию
  typing: new Map(),          // chatId -> Map(userId -> {username, timer})
};

export const activeChat = () => state.chats.get(state.activeChatId) ?? null;

export function peerOf(chat) {
  return chat.type === 'direct' ? chat.members.find((m) => m.id !== state.user.id) ?? null : null;
}

export function setChats(list) {
  state.chats = new Map(list.map((c) => [c.id, c]));
  sortChats();
}

export function upsertChat(chat) {
  state.chats.set(chat.id, chat);
  sortChats();
}

/** Свежие переписки сверху; чаты без сообщений — по id. */
export function sortChats() {
  state.order = [...state.chats.values()]
    .sort((a, b) => (b.last_message?.id ?? 0) - (a.last_message?.id ?? 0) || b.id - a.id)
    .map((c) => c.id);
}

export function setPresence(userId, online, lastSeen) {
  for (const chat of state.chats.values()) {
    for (const m of chat.members) {
      if (m.id === userId) { m.online = online; m.last_seen = lastSeen; }
    }
  }
}

export function resetState() {
  state.user = null;
  state.chats = new Map(); state.order = []; state.activeChatId = null;
  state.history.clear(); state.pending.clear(); state.unread.clear();
  for (const m of state.typing.values()) for (const t of m.values()) clearTimeout(t.timer);
  state.typing.clear();
}

/** Отправляемое (ещё не подтверждённое сервером) сообщение в формате обычного сообщения для отрисовки. */
export function pendingToMessage(p) {
  let media = null;
  if (p.localUrl) media = { id: null, url: p.localUrl, local: true, name: p.file?.name || 'файл', mime: p.file?.type, size: p.file?.size ?? 0 };
  else if (p.mediaInfo) media = p.mediaInfo;                       // уже загруженный файл (из файлового менеджера)
  return {
    id: p.clientId, clientId: p.clientId, sender: state.user, kind: p.kind || 'text',
    text: p.text || null, meta: p.meta || null, reactions: [], created_at: p.created_at,
    media, cover: p.coverLocalUrl ? { url: p.coverLocalUrl, local: true } : null,
    pending: !p.failed, failed: p.failed,
  };
}
