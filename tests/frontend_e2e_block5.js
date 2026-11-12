// Тест блока 5: статусы подключения, «Вы заблокированы», приватность, переключение аккаунтов.
const { chromium } = require('playwright'); const { setup } = require('./mock.js');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const URL = 'http://127.0.0.1:8765/index.html';
(async () => {
  const b = await chromium.launch();
  const t = await setup(b, { viewport: { width: 420, height: 820 } });
  const { page, be, errs, push } = t;
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('aqua.token', 'tok'); } });
  await page.goto(URL); await page.waitForSelector('#chat-list .chat-item');
  await page.waitForTimeout(300);
  ok(await page.locator('#conn-status').isHidden(), 'в сети: статус рядом с «Аква» скрыт');

  /* ---- нет сети ---- */
  await page.context().setOffline(true);
  await page.waitForSelector('#conn-status:not([hidden])');
  ok((await page.locator('#conn-status').textContent()).startsWith('Ожидание сети'), 'без сети: «Ожидание сети...»');
  ok(!/оединение/.test(await page.locator('#toast').textContent()), 'нет тоста «соединение потеряно»');
  await page.click('.chat-item[data-chat-id="1"]'); await page.waitForSelector('#messages .msg');
  const st = await page.locator('#peer-status').textContent().catch(() => '');
  ok(st.includes('Ожидание сети'), 'в чате вместо «в сети»: ' + st);
  await page.context().setOffline(false);
  await page.waitForFunction(() => document.querySelector('#conn-status').hidden, null, { timeout: 15000 });
  ok(true, 'сеть вернулась — статус исчез');
  await page.waitForTimeout(200);
  ok(!/оединение/.test(await page.locator('#toast').textContent()), 'нет тоста «соединение восстановлено»');

  /* ---- заблокированы ---- */
  push({ type: 'blocked_me', user_id: 2, value: true }); await page.waitForTimeout(200);
  ok((await page.locator('#peer-status').textContent()).includes('Вы заблокированы'), '«Вы заблокированы» вместо статуса');
  push({ type: 'blocked_me', user_id: 2, value: false }); await page.waitForTimeout(200);
  ok(!(await page.locator('#peer-status').textContent()).includes('Вы заблокированы'), 'после разблокировки статус вернулся');

  /* ---- приватность ---- */
  await page.click('#btn-back').catch(() => {});
  await page.click('#nav-settings'); await page.click('[data-page="privacy"]');
  ok(await page.locator('#priv-hide_activity').count() === 1, 'есть настройка скрытия активности');
  await page.selectOption('#priv-hide_activity', 'all');
  await page.waitForTimeout(150);
  ok(await page.locator('.priv__pick[data-list="always"]').count() === 1, 'при «скрыть от всех» — список «всегда разрешать»');
  await page.selectOption('#priv-who_can_write', 'selected');
  await page.waitForTimeout(150);
  ok(await page.locator('.priv__pick[data-list="users"]').count() >= 1, 'кнопка выбора пользователей');
  ok(be.privPuts.some((p) => p.hide_activity?.mode === 'all'), 'скрытие активности сохранено');

  /* ---- аккаунты ---- */
  await page.click('#prefs-back').catch(() => {}); await page.click('[data-page="account"]');
  await page.waitForSelector('#accounts-list .accs__row');
  ok(await page.locator('#accounts-list .accs__row.is-current').count() === 1, 'текущий аккаунт отмечен в списке');
  await page.evaluate(() => localStorage.setItem('aqua.accounts', JSON.stringify([
    { id: 1, username: 'alice', display_name: 'alice', avatar: null, token: 'tok' },
    { id: 9, username: 'zed', display_name: 'Zed', avatar: null, token: 'tok9' }])));
  await page.click('#prefs-back').catch(() => {}); await page.click('[data-page="account"]');
  ok(await page.locator('#accounts-list .accs__row').count() === 2, 'список всех аккаунтов устройства');
  await Promise.all([page.waitForNavigation(), page.click('.accs__row[data-account="9"]')]);
  ok(await page.evaluate(() => localStorage.getItem('aqua.token')) === 'tok9', 'переключение подменило сессию');
  await page.evaluate(() => localStorage.setItem('aqua.token', 'tok'));
  await page.goto(URL); await page.waitForSelector('#chat-list .chat-item');
  await page.click('#nav-settings'); await page.click('[data-page="account"]');
  await Promise.all([page.waitForNavigation(), page.click('#account-add')]);
  console.log(await page.evaluate(() => JSON.stringify({t: localStorage.getItem('aqua.token'), p: localStorage.getItem('aqua.prev-token'), h: document.querySelector('#auth-cancel').hidden, url: location.href})));
  await page.waitForSelector('#auth-cancel:not([hidden])', {timeout: 5000});
  ok(true, 'добавление аккаунта: экран входа с кнопкой возврата');
  await Promise.all([page.waitForNavigation(), page.click('#auth-cancel')]);
  await page.waitForSelector('#chat-list .chat-item');
  ok(true, 'отмена вернула прежнюю сессию');

  const real = errs.filter((e) => !/Failed to load resource|net::ERR/.test(e));
  ok(real.length === 0, 'нет ошибок консоли: ' + JSON.stringify(real));
  await b.close(); process.exit(fails ? 1 : 0);
})();
