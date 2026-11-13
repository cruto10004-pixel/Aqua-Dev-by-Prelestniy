// Вход: логин+пароль. Регистрация: логин+пароль+почта → страница с кодом (6 ячеек, повторная отправка раз в 30 с).
// Запуск: cd frontend && python3 -m http.server 8765 &   затем   node tests/frontend_e2e_auth.js
const { chromium } = require('playwright'); const { setup } = require('./mock.js');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch();
  const { page, be, errs } = await setup(b, { viewport: { width: 420, height: 820 } });
  await page.clock.install();
  await page.goto('http://127.0.0.1:8765/index.html');
  await page.waitForSelector('#form-login:not([hidden])');
  ok(await page.locator('#login-username').isVisible() && await page.locator('#login-password').isVisible(), 'вход: логин и пароль');
  await page.click('#tab-register');
  await page.waitForSelector('#form-register:not([hidden])');
  ok(await page.locator('#reg-username').isVisible() && await page.locator('#reg-password').isVisible() && await page.locator('#reg-email').isVisible(), 'регистрация: логин, пароль, Telegram-ник');

  await page.fill('#reg-username', 'bad name!'); await page.fill('#reg-password', 'short'); await page.fill('#reg-email', 'nope');
  await page.click('#reg-submit');
  ok(!be.reqs.includes('POST /auth/register/code'), 'невалидные поля не уходят на сервер');

  await page.fill('#reg-username', 'newbie'); await page.fill('#reg-password', 'secret123'); await page.fill('#reg-email', '@newbie_tg');

  // Письмо не ушло: остаёмся на форме, видна ошибка, кнопка снова доступна (не зависает на «Подождите…»)
  be.codeMode = 'fail';
  await page.click('#reg-submit');
  await page.waitForSelector('#reg-error:not([hidden])');
  ok((await page.locator('#reg-error').textContent()).includes('Не удалось отправить письмо'), 'сбой отправки: показана ошибка');
  ok(await page.locator('#view-code').isHidden() && await page.locator('#reg-submit').isEnabled(), 'сбой отправки: страница кода не открыта, кнопка активна');

  // Код уже отправлен недавно (429): ведём на ввод кода, таймер стартует с остатка кулдауна
  be.codeMode = 'cooldown';
  await page.click('#reg-submit');
  await page.waitForSelector('#view-code:not([hidden])');
  ok(/через 12 с/.test(await page.locator('#code-resend').textContent()), '429: открылась страница кода, таймер с остатка (12 с)');
  await page.click('#code-back');
  await page.waitForSelector('#view-auth:not([hidden])');

  // Нормальная отправка: страница кода, 6 ячеек, повторная отправка через 30 секунд
  be.codeMode = 'ok';
  await page.click('#reg-submit');
  await page.waitForSelector('#view-code:not([hidden])');
  ok(await page.locator('.code-box').count() === 6 && await page.locator('.code-box').first().isVisible(), 'после запроса открылась страница с 6 ячейками кода');
  ok(/через 30 с/.test(await page.locator('#code-resend').textContent()) && await page.locator('#code-resend').isDisabled(), 'повторная отправка заблокирована, таймер 30 с');
  ok(await page.locator('#code-submit').isDisabled(), 'без кода «Подтвердить» неактивна');

  await page.clock.runFor(29000);
  ok(await page.locator('#code-resend').isDisabled(), 'через 29 с кнопка ещё заблокирована');
  await page.clock.runFor(2000);
  ok(await page.locator('#code-resend').isEnabled() && (await page.locator('#code-resend').textContent()).trim() === 'Отправить снова', 'через 30 с можно отправить новый код');
  const before = be.reqs.filter((r) => r === 'POST /auth/register/code').length;
  await page.click('#code-resend');
  await page.waitForFunction(() => /через 30 с/.test(document.querySelector('#code-resend').textContent));
  ok(be.reqs.filter((r) => r === 'POST /auth/register/code').length === before + 1, 'повторная отправка ушла на сервер, таймер пошёл заново');

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
  await b.close(); process.exit(fails ? 1 : 0);
})();
