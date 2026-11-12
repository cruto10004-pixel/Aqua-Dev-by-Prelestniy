// Уведомления: запрос разрешения при входе, показ входящих в фоне, без показа для открытого чата.
const { chromium } = require('playwright'); const { setup } = require('./mock.js');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch();
  const { page, push, errs } = await setup(b, { viewport: { width: 420, height: 820 } });
  await page.addInitScript(() => {
    localStorage.setItem('aqua.token', 'tok');
    window.__asked = 0; window.__shown = [];
    let perm = 'default'; navigator.serviceWorker.getRegistration = async () => undefined;
    window.Notification = function (t, o) { window.__shown.push([t, o.body]); };
    Object.defineProperty(Notification, 'permission', { get: () => perm });
    Notification.requestPermission = async () => { window.__asked++; perm = 'granted'; return 'granted'; };
  });
  await page.goto('http://127.0.0.1:8765/index.html');
  await page.waitForSelector('#notif-allow');
  ok(true, 'при входе показан запрос уведомлений');
  await page.click('#notif-allow');
  await page.waitForSelector('#notif-allow', { state: 'detached' });
  ok(await page.evaluate(() => window.__asked) === 1, 'системное разрешение запрошено');
  await page.waitForSelector('#chat-list .chat-item');
  const msg = { id: 9001, chat_id: 1, sender: { id: 2, username: 'bob', display_name: 'Боб' }, kind: 'text', text: 'привет из фона', meta: {}, created_at: new Date().toISOString(), reactions: [] };
  push({ type: 'message', message: msg });
  await page.waitForTimeout(400);
  const shown = await page.evaluate(() => window.__shown);
  ok(shown.length === 1 && shown[0][0] === 'Боб' && shown[0][1] === 'привет из фона', 'уведомление: имя и текст ' + JSON.stringify(shown));
  await page.click('.chat-item[data-chat-id="1"]'); await page.waitForSelector('#messages .msg');
  push({ type: 'message', message: { ...msg, id: 9002, text: 'в открытом чате' } });
  await page.waitForTimeout(400);
  ok((await page.evaluate(() => window.__shown)).length === 1, 'в открытом чате уведомление не показывается');
  ok(errs.length === 0, 'нет ошибок консоли: ' + JSON.stringify(errs));
  await b.close(); process.exit(fails ? 1 : 0);
})();
