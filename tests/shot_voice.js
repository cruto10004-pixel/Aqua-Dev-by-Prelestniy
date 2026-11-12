const { chromium } = require('playwright'); const { setup } = require('./mock.js');
(async () => {
  const b = await chromium.launch();
  const t = await setup(b, { viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true });
  const { page, be } = t;
  const md = be.newMedia({ kind: 'voice', name: 'v.wav', mime: 'audio/wav', size: 1000 });
  const wave = Array.from({ length: 40 }, (_, i) => 20 + Math.round(70 * Math.abs(Math.sin(i / 3))));
  be.add(1, be.bob, null, 1, { kind: 'voice', meta: { duration: 95, wave }, media: { id: md.id, url: '/api/media/' + md.id, name: 'v.wav', mime: 'audio/wav', size: 1000 } });
  be.add(1, be.me, null, 0, { kind: 'voice', meta: { duration: 7, wave }, media: { id: md.id, url: '/api/media/' + md.id, name: 'v.wav', mime: 'audio/wav', size: 1000 } });
  await page.addInitScript(() => { localStorage.setItem('aqua.token', 'tok'); sessionStorage.setItem('aqua.splash.seen', '1'); });
  await page.goto('http://127.0.0.1:8765/index.html'); await page.waitForSelector('#chat-list .chat-item');
  await page.tap('.chat-item[data-chat-id="1"]'); await page.waitForSelector('.vp');
  await page.waitForTimeout(600);
  const info = await page.evaluate(() => [...document.querySelectorAll('.msg--in .vp, .msg--out .vp')].slice(-2).map((v) => { const r = v.getBoundingClientRect(), p = v.closest('.msg__bubble').getBoundingClientRect(); return { vp: [r.left, r.right].map(Math.round), bubble: [p.left, p.right].map(Math.round), time: v.querySelector('.vp__time').getBoundingClientRect().right | 0, overflow: v.scrollWidth > v.clientWidth }; }));
  console.log(JSON.stringify(info));
  await page.screenshot({ path: 'tests/shots/voice-360.png' }); await b.close();
})();
