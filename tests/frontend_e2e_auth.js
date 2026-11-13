// Вход, регистрация по номеру из бота и восстановление: код из Telegram (6 ячеек), логин и пароль.
// Запуск: cd frontend && python3 -m http.server 8765 &   затем   node tests/frontend_e2e_auth.js
const { chromium } = require('playwright'); const { setup } = require('./mock.js');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch();

  // --- Восстановление пароля (с экрана входа) ---
  {
    const { page, be, errs } = await setup(b, { viewport: { width: 420, height: 820 } });
    await page.route('https://t.me/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>bot</p>' }));
    await page.goto('http://127.0.0.1:8765/index.html');
    await page.waitForSelector('#form-login:not([hidden])');
    await page.click('#to-recover');
    await page.waitForSelector('#view-recover:not([hidden])');
    ok(await page.locator('#recover-username').isVisible() && await page.locator('#recover-email').count() === 0, 'восстановление: спрашивает логин, без почты');
    await page.fill('#recover-username', 'newbie');
    await page.click('#form-recover button[type=submit]');
    await page.waitForURL(/t\.me\/aqua_test_bot\?start=x_x1/);
    ok(true, 'восстановление: автоматический переход в бота по ссылке x_');
    await page.goto('http://127.0.0.1:8765/index.html');
    await page.waitForSelector('#view-code:not([hidden])');
    ok((await page.getAttribute('#code-bot', 'href')).includes('start=x_x1'), 'восстановление: при возврате открыта страница кода');
    ok(await page.locator('#code-resend').count() === 0, 'кнопки повторной отправки нет (код только через бота)');
    await page.locator('.code-box').nth(0).click();
    await page.keyboard.type('123456');
    await page.click('#code-submit');
    await page.waitForSelector('#view-newpass:not([hidden])');
    await page.fill('#newpass-password', 'newpass1');
    await page.click('#form-newpass button[type=submit]');
    await page.waitForSelector('#chat-list .chat-item');
    ok(be.reqs.includes('POST /auth/reset/code') && be.reqs.includes('POST /auth/reset'), 'восстановление: запросы ушли, аккаунт открыт');
    ok(errs.length === 0, 'восстановление: нет ошибок консоли: ' + JSON.stringify(errs));
    await page.close();
  }

  // --- Регистрация: номер из бота → код в Telegram → логин и пароль ---
  {
    const { page, be, errs } = await setup(b, { viewport: { width: 420, height: 820 } });
    await page.goto('http://127.0.0.1:8765/index.html');
    await page.waitForSelector('#form-login:not([hidden])');
    ok(await page.locator('#login-username').isVisible() && await page.locator('#login-password').isVisible(), 'вход: логин и пароль');
    await page.click('#tab-register');
    await page.waitForSelector('#form-register:not([hidden])');
    ok(await page.locator('#reg-phone').isVisible() && await page.locator('#reg-username').count() === 0, 'регистрация, шаг 1: только номер из бота');
    ok((await page.getAttribute('#reg-bot', 'href')).includes('t.me/aqua_test_bot'), 'кнопка «Открыть бота» ведёт в бота');

    await page.fill('#reg-phone', '12');
    await page.click('#reg-submit');
    ok(!be.reqs.includes('POST /auth/register/phone'), 'короткий номер не уходит на сервер');

    be.codeMode = 'fail';
    await page.fill('#reg-phone', '+7 900 123-45-67');
    await page.click('#reg-submit');
    await page.waitForSelector('#reg-error:not([hidden])');
    ok((await page.locator('#reg-error').textContent()).includes('Такого номера нет'), 'неизвестный номер: ошибка на форме');
    ok(await page.locator('#view-code').isHidden(), 'неизвестный номер: страница кода не открыта');

    be.codeMode = 'ok';
    await page.click('#reg-submit');
    await page.waitForSelector('#view-code:not([hidden])');
    ok(await page.locator('.code-box').count() === 6, '6 ячеек кода видны');
    ok(await page.locator('#code-submit').isDisabled(), 'без кода «Подтвердить» неактивна');

    for (let i = 0; i < 6; i++) await page.locator('.code-box').nth(i).fill('0');
    await page.click('#code-submit');
    await page.waitForSelector('#code-error:not([hidden])');
    ok((await page.textContent('#code-error')).includes('Неверный код'), 'неверный код — ошибка на странице кода');
    for (let i = 0; i < 6; i++) await page.locator('.code-box').nth(i).fill(String(i + 1));
    await page.click('#code-submit');
    await page.waitForSelector('#view-finish:not([hidden])');
    ok(!be.reqs.includes('POST /auth/register'), 'номер подтверждён, аккаунт ещё не создан');

    await page.fill('#finish-username', 'bad name!'); await page.fill('#finish-password', 'short');
    await page.click('#form-finish button[type=submit]');
    ok(!be.reqs.includes('POST /auth/register'), 'невалидные логин и пароль не уходят на сервер');
    await page.fill('#finish-username', 'newbie'); await page.fill('#finish-password', 'secret123');
    await page.click('#form-finish button[type=submit]');
    await page.waitForSelector('#chat-list .chat-item');
    ok(await page.locator('#app').getAttribute('data-screen') === 'chat', 'аккаунт создан, открыт мессенджер');
    ok(errs.length === 0, 'нет ошибок консоли: ' + JSON.stringify(errs));
    await page.close();
  }

  await b.close(); process.exit(fails ? 1 : 0);
})();
