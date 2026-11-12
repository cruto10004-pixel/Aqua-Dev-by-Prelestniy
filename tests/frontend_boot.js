// Тест: при сохранённом входе экран входа не мигает; без входа показывается сразу после проверки.
const { chromium } = require('playwright'); const { setup } = require('./mock.js');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch();
  for (const withToken of [true, false]) {
    const t = await setup(b, { viewport: { width: 420, height: 800 } });
    const { page } = t;
    await page.addInitScript((w) => {
      sessionStorage.setItem('aqua.splash.seen', '1'); if (w) localStorage.setItem('aqua.token', 'tok');
      window.__seen = [];
      const rec = () => { const a = document.getElementById('app'); const v = a && a.dataset.screen; if (v && window.__seen[window.__seen.length - 1] !== v) window.__seen.push(v); };
      new MutationObserver(rec).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-screen'] });
    }, withToken);
    await page.goto('http://127.0.0.1:8765/index.html');
    await page.waitForFunction(() => document.getElementById('app').dataset.screen !== 'boot');
    await page.waitForTimeout(300);
    const seen = await page.evaluate(() => window.__seen);
    if (withToken) { ok(!seen.includes('auth') && seen.at(-1) === 'chat', 'с входом: экран входа ни разу не показан (' + seen.join('→') + ')'); }
    else ok(seen.at(-1) === 'auth', 'без входа: показан экран входа (' + seen.join('→') + ')');
    await t.page.close();
  }
  await b.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
