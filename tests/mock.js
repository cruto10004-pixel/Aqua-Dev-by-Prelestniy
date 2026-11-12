// Мок бэкенда Aqua для Playwright: те же маршруты и форматы, что у backend/app/routers.
const iso = (m) => new Date(Date.now() - m * 60000).toISOString();

// 4 секунды тишины в WAV — чтобы <audio> реально загружался и играл в тестах голосовых
function silentWav(seconds = 4, rate = 8000) {
  const n = seconds * rate, buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  return buf;
}

function makeBackend() {
  const me = { id: 1, username: 'alice', online: true, last_seen: null };
  const bob = { id: 2, username: 'bob', online: true, last_seen: null };
  const carl = { id: 3, username: 'carl', online: false, last_seen: iso(300) };
  let mid = 0, mediaId = 0;
  const msgs = { 1: [], 2: [] }, media = {}, reactions = {};
  const reactionsOf = (id) => Object.entries(reactions[id] || {})
    .filter(([, u]) => u.length).map(([emoji, users]) => ({ emoji, count: users.length, users: [...users] }));
  const add = (chat, sender, text, ago, extra = {}) => {
    const m = { id: ++mid, chat_id: chat, sender: { id: sender.id, username: sender.username }, kind: 'text', text,
      media: null, meta: null, reactions: [], created_at: iso(ago), ...extra };
    msgs[chat].push(m); return m;
  };
  // Начальные данные: длинная история с bob (для проверки подгрузки) и одно сообщение от carl
  for (let i = 0; i < 120; i++) add(1, i % 2 ? me : bob, 'старое сообщение ' + i, 2000 - i * 10);
  add(1, bob, 'Привет! Как дела?', 5);
  add(2, carl, 'Скинул макеты', 90);
  const hidden = new Set();                           // «удалено у себя»
  const lastOf = (c) => msgs[c].filter((x) => !hidden.has(x.id)).at(-1) || null;
  const chats = () => [
    { id: 1, type: 'direct', title: 'bob', created_at: iso(9999), members: [me, bob], last_message: lastOf(1), reads: reads[1], pinned: pinned[1] ?? null },
    { id: 2, type: 'direct', title: 'carl', created_at: iso(9999), members: [me, carl], last_message: lastOf(2), reads: reads[2], pinned: pinned[2] ?? null }];
  const toggle = (id, emoji, userId) => {
    const r = (reactions[id] ??= {}); const u = (r[emoji] ??= []);
    // одна реакция на пользователя: другая заменяет прежнюю, та же — снимает
    const had = Object.entries(r).find(([e, us]) => us.includes(userId))?.[0];
    for (const us of Object.values(r)) { const k = us.indexOf(userId); if (k >= 0) us.splice(k, 1); }
    if (had !== emoji) u.push(userId);
    const m = Object.values(msgs).flat().find((x) => x.id === id); if (m) m.reactions = reactionsOf(id);
    return reactionsOf(id);
  };
  const reads = { 1: { 1: 0, 2: 0 }, 2: { 1: 0, 3: 0 } }, pinned = {};
  const stk = { packs: [], recent: [], favs: [], added: new Set(), sid: 0, pid: 0 };
  const savedGifs = [];
  return { reads, pinned, stk, savedGifs, hidden, me, bob, carl, msgs, media, chats, add, toggle, reactionsOf, reqs: [], deleted: [], wsIn: [], uploads: [],
    newMedia: (o) => (media[++mediaId] = { id: mediaId, ...o }) };
}

/** Открывает страницу с моками. opts.splash=true — не пропускать заставку. */
async function setup(browser, ctxOpts = {}, opts = {}) {
  const be = makeBackend();
  const ctx = await browser.newContext(ctxOpts);
  await ctx.addInitScript((showSplash) => {
    window.__vib = []; navigator.vibrate = (p) => { window.__vib.push(p); return true; };
    if (!showSplash) { try { sessionStorage.setItem('aqua.splash.seen', '1'); } catch {} }
  }, Boolean(opts.splash));
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|start\.mp4|media/i.test(m.text())) errs.push(m.text()); });

  let wsRoute = null;
  const push = (o) => wsRoute.send(JSON.stringify(o));
  await page.routeWebSocket(/\/ws$/, (ws) => {
    wsRoute = ws;
    ws.onMessage((raw) => {
      const d = JSON.parse(raw); be.wsIn.push(d);
      if (d.type === 'auth') ws.send(JSON.stringify({ type: 'ready', user: be.me }));
      if (d.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
      if (d.type === 'message') {
        const md = d.media_id ? be.media[d.media_id] : null;
        let meta = d.meta ?? null;
        if (meta?.sticker) {                                           // как сервер: добавляет пак, трогает «недавние»
          const st = be.stk.packs.flatMap((p) => p.stickers).find((x) => x.id === meta.sticker);
          meta = { sticker: meta.sticker, pack: st?.pack_id }; d.text = null;
          be.stk.recent = [meta.sticker, ...be.stk.recent.filter((x) => x !== meta.sticker)].slice(0, 30);
        }
        if (meta?.gif && md && !be.savedGifs.includes(md.id)) be.savedGifs.unshift(md.id);
        const m = be.add(d.chat_id, be.me, d.text, 0, md ? {
          kind: md.kind, meta,
          cover: d.cover_id && be.media[d.cover_id] ? { id: d.cover_id, url: `/api/media/${d.cover_id}` } : null,
          media: { id: md.id, url: `/api/media/${md.id}`, name: md.name, mime: md.mime, size: md.size } } : {});
        setTimeout(() => ws.send(JSON.stringify({ type: 'message', message: m, client_id: d.client_id })), 80);
      }
    });
  });
  await page.route('**/api/**', async (route) => {
    const req = route.request(); const u = new URL(req.url()); const path = u.pathname.replace('/api', '');
    be.reqs.push(req.method() + ' ' + path);
    let m1; const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/auth/login') {
      const d = req.postDataJSON();
      return d.password === 'secret123' ? json(200, { token: 'tok', token_type: 'bearer', user: be.me })
        : json(401, { detail: 'Неверное имя пользователя или пароль.' });
    }
    if (path === '/auth/register/code') return json(200, { ok: true, ttl: 600, cooldown: 60 });
    if (path === '/auth/register') {
      const d = req.postDataJSON();
      return d.code === '123456' ? json(201, { token: 'tok', token_type: 'bearer', user: be.me })
        : json(400, { detail: 'Неверный код. Осталось попыток: 4.' });
    }
    if (path === '/profile' && req.method() === 'PATCH') {
      const d = req.postDataJSON(); be.profilePatches = (be.profilePatches || []); be.profilePatches.push(d);
      if ('display_name' in d) be.me.display_name = d.display_name || be.me.username;
      if ('bio' in d) be.me.bio = d.bio;
      if ('avatar_preset' in d) be.me.avatar = d.avatar_preset ? { preset: d.avatar_preset } : null;
      if ('avatar_id' in d) { be.me.avatar = d.avatar_id ? { id: d.avatar_id, url: `/api/media/${d.avatar_id}` } : null;
        be.gallery = be.gallery || []; if (d.avatar_id && !be.gallery.includes(d.avatar_id)) be.gallery.unshift(d.avatar_id); }
      return json(200, be.me);
    }
    if (/^\/users\/[123]\/avatars$/.test(path)) {
      if (path !== '/users/1/avatars') return json(200, [{ media_id: 501, url: '/api/media/501', current: true }, { media_id: 502, url: '/api/media/502', current: false }]);
      const g = be.gallery || [], cur = be.me.avatar?.id;
      return json(200, [...g].sort((a, b) => (b === cur) - (a === cur)).map((id) => ({ media_id: id, url: `/api/media/${id}`, current: id === cur })));
    }
    m1 = path.match(/^\/profile\/avatars\/(\d+)$/);
    if (m1 && req.method() === 'DELETE') { const id = +m1[1]; be.gallery = (be.gallery || []).filter((x) => x !== id);
      if (be.me.avatar?.id === id) { const n = be.gallery[0]; be.me.avatar = n ? { id: n, url: `/api/media/${n}` } : null; }
      const cur = be.me.avatar?.id;
      return json(200, { profile: be.me, avatars: be.gallery.map((x) => ({ media_id: x, url: `/api/media/${x}`, current: x === cur })) }); }
    if (path === '/profile/prefs') { const d = req.postDataJSON(); (be.prefsPuts = be.prefsPuts || []).push(d);
      be.me.prefs = { ...(be.me.prefs || {}), ...d };
      if (d.wallpaper?.type === 'media') be.me.prefs.wallpaper = { ...d.wallpaper, url: `/api/media/${d.wallpaper.media_id}` };
      return json(200, be.me.prefs); }
    if (path === '/profile/privacy') { const d = req.postDataJSON(); (be.privPuts = be.privPuts || []).push(d); be.me.privacy = { ...(be.me.privacy || {}), ...d }; return json(200, be.me.privacy); }
    if (path === '/profile/username') { const d = req.postDataJSON();
      if (d.password !== 'secret123') return json(403, { detail: 'Неверный пароль.' });
      if (d.username === 'carl') return json(409, { detail: 'Этот логин уже занят.' });
      be.me.username = d.username; return json(200, be.me); }
    if (path === '/profile/password') { const d = req.postDataJSON(); (be.pwPuts = be.pwPuts || []).push(d);
      return d.current_password === 'secret123' ? json(200, { ok: true }) : json(403, { detail: 'Текущий пароль неверный.' }); }
    if (path === '/blocks' && req.method() === 'GET') return json(200, [...(be.blocked || new Set())].map((id) => ({ ...be.carl, id, display_name: be.carl.username })));
    const mb = path.match(/^\/blocks\/(\d+)$/);
    if (mb) { be.blocked = be.blocked || new Set(); req.method() === 'PUT' ? be.blocked.add(+mb[1]) : be.blocked.delete(+mb[1]); return json(200, { is_blocked: req.method() === 'PUT' }); }
    if (path === '/contacts' && req.method() === 'GET') return json(200, [...(be.contacts || new Set())].map((id) => ({ ...be.carl, id, display_name: be.carl.username })));
    const mc = path.match(/^\/contacts\/(\d+)$/);
    if (mc) { be.contacts = be.contacts || new Set(); req.method() === 'PUT' ? be.contacts.add(+mc[1]) : be.contacts.delete(+mc[1]); return json(200, { is_contact: req.method() === 'PUT' }); }
    const mu = path.match(/^\/users\/(\d+)\/profile$/);
    if (mu) { const id = +mu[1]; return json(200, { ...be.carl, id, bio: 'Дизайнер. Люблю море.', tracks: [], is_contact: Boolean(be.contacts?.has(id)), is_blocked: Boolean(be.blocked?.has(id)) }); }
    if (path === '/auth/me') return json(200, be.me);
    let m;
    if (path === '/chats' && req.method() === 'GET') return json(200, be.chats());
    if ((m = path.match(/^\/chats\/(\d+)$/)) && req.method() === 'PATCH') {
      const d = req.postDataJSON(); const ch = (be.created || []).find((c) => c.id === +m[1]);
      if (d.title !== undefined) ch.title = d.title; if (d.description !== undefined) ch.description = d.description;
      return json(200, { ...ch, members: [be.me], can_post: true });
    }
    if (path === '/chats' && req.method() === 'POST' && req.postDataJSON().type === 'channel') {
      const d = req.postDataJSON(); const ch = { id: 77, type: 'channel', title: d.title, username: d.username, can_post: true, created_at: new Date().toISOString(),
        members: [be.me], last_message: null, reads: {}, pinned: null };
      (be.created ??= []).push(ch); return json(201, ch);
    }
    m = path.match(/^\/chats\/(\d+)\/messages$/);
    if (m && req.method() === 'GET') {
      const before = +u.searchParams.get('before_id') || Infinity, lim = +u.searchParams.get('limit');
      return json(200, (be.msgs[m[1]] || []).filter((x) => x.id < before).slice(-lim));
    }
    if (path === '/users/search') return json(200, [be.carl, { id: 4, username: 'dave', online: false, last_seen: null }].filter((x) => x.username.includes(u.searchParams.get('q'))));
    m = path.match(/^\/messages\/(\d+)$/);
    if (m && (req.method() === 'PATCH' || req.method() === 'DELETE')) {
      const id = +m[1];
      const [chat, list] = Object.entries(be.msgs).find(([, a]) => a.some((x) => x.id === id)) || [];
      if (!list) return json(404, { detail: 'Сообщение не найдено.' });
      const msg = list.find((x) => x.id === id);
      if (req.method() === 'PATCH') {
        if (msg.sender.id !== be.me.id) return json(403, { detail: 'Можно изменять только свои сообщения.' });
        const text = (JSON.parse(req.postData() || '{}').text || '').trim();
        if (!text && msg.kind === 'text') return json(400, { detail: 'Сообщение не может быть пустым.' });
        msg.text = text || null; msg.edited_at = iso(0);
        setTimeout(() => push({ type: 'message_edited', message: msg }), 20);
        return json(200, msg);
      }
      const scope = u.searchParams.get('scope');
      if (scope === 'all' && msg.sender.id !== be.me.id) return json(403, { detail: 'Удалить у всех можно только свои сообщения.' });
      be.deleted.push({ id, scope });
      if (scope === 'all') list.splice(list.indexOf(msg), 1); else be.hidden.add(id);
      const rest = list.filter((x) => !(be.hidden?.has(x.id)));
      setTimeout(() => push({ type: 'message_deleted', chat_id: +chat, message_id: id, scope, last_message: rest.at(-1) || null }), 20);
      return json(200, { ok: true, chat_id: +chat, message_id: id, scope });
    }
    m = path.match(/^\/messages\/(\d+)\/reactions$/);
    if (m && req.method() === 'PUT') {
      const id = +m[1], emoji = req.postDataJSON().emoji;
      const list = be.toggle(id, emoji, 1);
      const chat = Object.entries(be.msgs).find(([, a]) => a.some((x) => x.id === id))[0];
      setTimeout(() => push({ type: 'reaction', chat_id: +chat, message_id: id, reactions: list }), 20); // как сервер: рассылка всем
      return json(200, { message_id: id, reactions: list });
    }
    if (path === '/media' && req.method() === 'POST') {
      const body = req.postDataBuffer(); const ct = req.headers()['content-type'] || '';
      be.uploads.push({ ct, size: body?.length ?? 0, text: body?.toString('latin1').slice(0, 300) });
      const head = body?.toString('latin1').slice(0, 400) ?? '';
      const name = (head.match(/filename="([^"]*)"/) || [])[1] || 'file';
      const mime = ((head.match(/Content-Type:\s*([^\r\n;]+)/i) || [])[1] || 'application/octet-stream').trim();
      const kind = mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'voice' : 'file';
      const rec = be.newMedia({ kind, name, mime, size: body?.length ?? 0, bytes: body, created_at: iso(0) });
      be.uploads[be.uploads.length - 1].meta = { name, mime, kind };
      const { bytes, ...pub } = rec;
      return json(201, { ...pub, url: `/api/media/${rec.id}` });
    }
    if ((m = path.match(/^\/chats\/(\d+)\/read$/)) && req.method() === 'POST') { const up = req.postDataJSON().up_to; (be.readCalls ??= []).push([+m[1], up]); be.reads[+m[1]][1] = Math.max(be.reads[+m[1]][1], up); return json(200, { chat_id: +m[1], up_to: up }); }
    if ((m = path.match(/^\/chats\/(\d+)\/pin$/)) && req.method() === 'PUT') {
      const id = req.postDataJSON().message_id; const msg = id ? be.msgs[+m[1]].find((x) => x.id === id) : null; be.pinned[+m[1]] = msg ?? null;
      setTimeout(() => push({ type: 'pinned', chat_id: +m[1], message: msg ?? null }), 20); return json(200, { chat_id: +m[1], message: msg ?? null }); }
    if (path === '/messages/forward' && req.method() === 'POST') {
      const d = req.postDataJSON(); (be.forwards ??= []).push(d);
      const out = d.message_ids.map((id) => { const src = Object.values(be.msgs).flat().find((x) => x.id === id);
        const nm = be.add(d.chat_id, be.me, src.text, 0, { forwarded: d.hide_sender ? null : { id: src.sender.id, name: src.sender.username } });
        setTimeout(() => push({ type: 'message', message: nm }), 20); return nm; });
      return json(201, out); }
    const pub = (id) => { const { bytes, ...x } = be.media[id]; return { ...x, url: `/api/media/${id}` }; };
    const sj = (st) => ({ id: st.id, pack_id: st.pack_id, media_id: st.media_id, url: `/api/media/${st.media_id}` });
    const pj = (p) => ({ id: p.id, title: p.title, owner_id: 1, own: true, added: be.stk.added.has(p.id), preview: p.stickers[0] ? sj(p.stickers[0]) : null, stickers: p.stickers.map(sj) });
    const allSt = () => be.stk.packs.flatMap((p) => p.stickers);
    if (path === '/gifs/saved' && req.method() === 'GET') return json(200, be.savedGifs.map(pub));
    if (path === '/gifs/saved' && req.method() === 'POST') { const id = req.postDataJSON().media_id; if (!be.savedGifs.includes(id)) be.savedGifs.unshift(id); (be.savedCalls ??= []).push(id); return json(201, pub(id)); }
    if ((m = path.match(/^\/gifs\/saved\/(\d+)$/)) && req.method() === 'DELETE') { be.savedGifs = be.savedGifs.filter((x) => x !== +m[1]); return route.fulfill({ status: 204 }); }
    if ((m = path.match(/^\/media\/(\d+)\/clone$/)) && req.method() === 'POST') { (be.clones ??= []).push(+m[1]); return json(201, pub(+m[1])); }
    if (path === '/stickers' && req.method() === 'GET') return json(200, { packs: be.stk.packs.filter((p) => be.stk.added.has(p.id)).map(pj),
      recent: be.stk.recent.map((id) => allSt().find((x) => x.id === id)).filter(Boolean).map(sj), favorites: be.stk.favs.map((id) => allSt().find((x) => x.id === id)).filter(Boolean).map(sj) });
    if (path === '/stickers/packs' && req.method() === 'POST') { const p = { id: ++be.stk.pid, title: req.postDataJSON().title, stickers: [] }; be.stk.packs.push(p); be.stk.added.add(p.id); return json(201, pj(p)); }
    if ((m = path.match(/^\/stickers\/packs\/(\d+)$/))) {
      const p = be.stk.packs.find((x) => x.id === +m[1]); if (!p) return json(404, { detail: 'Стикерпак не найден.' });
      if (req.method() === 'GET') return json(200, pj(p));
      if (req.method() === 'PATCH') { p.title = req.postDataJSON().title; return json(200, pj(p)); }
      if (req.method() === 'DELETE') { be.stk.packs = be.stk.packs.filter((x) => x !== p); be.stk.added.delete(p.id); return route.fulfill({ status: 204 }); }
    }
    if ((m = path.match(/^\/stickers\/packs\/(\d+)\/add$/))) { be.stk.added.add(+m[1]); return json(200, pj(be.stk.packs.find((x) => x.id === +m[1]))); }
    if ((m = path.match(/^\/stickers\/packs\/(\d+)\/stickers$/)) && req.method() === 'POST') {
      const p = be.stk.packs.find((x) => x.id === +m[1]); const st = { id: ++be.stk.sid, pack_id: p.id, media_id: req.postDataJSON().media_id }; p.stickers.push(st); return json(201, sj(st)); }
    if ((m = path.match(/^\/stickers\/(\d+)\/favorite$/))) { const id = +m[1]; be.stk.favs = be.stk.favs.filter((x) => x !== id); if (req.method() === 'PUT') be.stk.favs.unshift(id); return route.fulfill({ status: 204 }); }
    if ((m = path.match(/^\/stickers\/(\d+)\/recent$/)) && req.method() === 'DELETE') { be.stk.recent = be.stk.recent.filter((x) => x !== +m[1]); return route.fulfill({ status: 204 }); }
    if ((m = path.match(/^\/stickers\/(\d+)$/)) && req.method() === 'DELETE') { for (const p of be.stk.packs) p.stickers = p.stickers.filter((x) => x.id !== +m[1]); return route.fulfill({ status: 204 }); }
    if (path === '/gifs/status') return json(200, { enabled: be.gifsEnabled !== false, provider: 'giphy' });
    if (path === '/gifs/search') {
      const q = u.searchParams.get('q'), pos = +u.searchParams.get('pos');
      be.gifQueries = (be.gifQueries || []); be.gifQueries.push(q + '@' + pos);
      const items = Array.from({ length: 6 }, (_, i) => ({ id: `g${pos + i}`, title: `${q || 'hot'} ${pos + i}`, preview: `https://media.giphy.com/p${pos + i}.gif`, url: `https://media.giphy.com/f${pos + i}.gif`, w: 200, h: 120 + i * 20 }));
      return json(200, { items, next: pos < 6 ? pos + 6 : null });
    }
    if (path === '/gifs/proxy') return route.fulfill({ status: 200, contentType: 'image/gif', body: Buffer.from('R0lGODlhAQABAIAAAKLRjwAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64') });
    if (path === '/gifs/import' && req.method() === 'POST') {
      (be.gifImports = be.gifImports || []).push(req.postDataJSON().url);
      const rec = be.newMedia({ kind: 'image', name: 'gif-1.gif', mime: 'image/gif', size: 43, created_at: iso(0) });
      const { bytes, ...pub } = rec; return json(201, { ...pub, url: `/api/media/${rec.id}` });
    }
    if (path === '/media/summary') {
      const out = { image: 0, video: 0, voice: 0, file: 0 };
      Object.values(be.media).forEach((x) => { out[x.kind]++; });
      return json(200, out);
    }
    if (path === '/media' && req.method() === 'GET') {
      const k = u.searchParams.get('kind');
      return json(200, Object.values(be.media).filter((x) => !k || x.kind === k).reverse()
        .map(({ bytes, ...x }) => ({ ...x, url: `/api/media/${x.id}` })));
    }
    m = path.match(/^\/media\/(\d+)$/);
    if (m) {
      const md = be.media[m[1]];
      if (md?.bytes && md.kind !== 'voice') {   // отдаём то, что загрузили (тело multipart → вырезаем содержимое файла)
        const b = md.bytes, start = b.indexOf('\r\n\r\n') + 4, end = b.lastIndexOf('\r\n--');
        return route.fulfill({ status: 200, contentType: md.mime, body: b.subarray(start, end) });
      }
      if (md?.seed) return route.fulfill({ status: 200, contentType: md.mime, body: md.seed });
      return route.fulfill({ status: 200, contentType: 'audio/wav', body: silentWav() });
    }
    return json(404, { detail: 'no mock' });
  });
  return { page, ctx, be, errs, push };
}
module.exports = { makeBackend, setup, iso, silentWav };
