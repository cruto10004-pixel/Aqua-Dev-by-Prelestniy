// Вход, регистрация и восстановление через Telegram-бота: ссылка на бота, код из бота (6 ячеек), новый пароль.
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

  // --- Регистрация ---
  {
    const { page, be, errs } = await setup(b, { viewport: { width: 420, height: 820 } });
    await page.route('https://t.me/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>bot</p>' }));
    await page.goto('http://127.0.0.1:8765/index.html');
    await page.waitForSelector('#form-login:not([hidden])');
    ok(await page.locator('#login-username').isVisible() && await page.locator('#login-password').isVisible(), 'вход: логин и пароль');
    await page.click('#tab-register');
    await page.waitForSelector('#form-register:not([hidden])');
    ok(await page.locator('#reg-username').isVisible() && await page.locator('#reg-password').isVisible() && await page.locator('#reg-email').count() === 0, 'регистрация: только логин и пароль');

    await page.fill('#reg-username', 'bad name!'); await page.fill('#reg-password', 'short');
    await page.click('#reg-submit');
    ok(!be.reqs.includes('POST /auth/register/code'), 'невалидные поля не уходят на сервер');

    await page.fill('#reg-username', 'newbie'); await page.fill('#reg-password', 'secret123');

    // Бот не настроен: остаёмся на форме, видна ошибка, кнопка снова доступна
    be.codeMode = 'fail';
    await page.click('#reg-submit');
    await page.waitForSelector('#reg-error:not([hidden])');
    ok((await page.locator('#reg-error').textContent()).includes('Telegram-бот'), 'сбой: показана ошибка');
    ok(await page.locator('#view-code').isHidden() && await page.locator('#reg-submit').isEnabled(), 'сбой: страница кода не открыта, кнопка активна');

    // Нормальный запрос: страница кода со ссылкой на бота и 6 ячейками
    be.codeMode = 'ok';
    await page.click('#reg-submit');
    await page.waitForURL(/t\.me\/aqua_test_bot\?start=r_r1/);
    ok(true, 'регистрация: автоматический переход в бота по ссылке r_');
    await page.goto('http://127.0.0.1:8765/index.html');
    await page.waitForSelector('#view-code:not([hidden])');
    ok((await page.getAttribute('#code-bot', 'href')).includes('start=r_r1'), 'регистрация: при возврате открыта страница кода');
    ok(await page.locator('.code-box').count() === 6 && await page.locator('.code-box').first().isVisible(), '6 ячеек кода видны');
    ok(await page.locator('#code-submit').isDisabled(), 'без кода «Подтвердить» неактивна');

    await page.locator('.code-box').nth(0).click();
    await page.keyboard.type('12');
    ok(await page.locator('#code-submit').isDisabled(), 'неполный код не отправить');
    await page.keyboard.type('3456');
    ok(await page.locator('#code-submit').isEnabled(), 'шесть цифр — «Подтвердить» активна');
    ok(!be.reqs.includes('POST /auth/register'), 'до подтверждения аккаунт не создаётся');
    await page.click('#code-submit');
    await page.waitForSelector('#chat-list .chat-item');
    ok(await page.locator('#app').getAttribute('data-screen') === 'chat', 'аккаунт создан, открыт мессенджер');
    ok(errs.length === 0, 'нет ошибок консоли: ' + JSON.stringify(errs));
    await page.close();
  }

  await b.close(); process.exit(fails ? 1 : 0);
})();
