// Вход: логин+пароль. Регистрация: логин+пароль+почта → код. Проверка валидации и потока.
const { chromium } = require('playwright'); const { setup } = require('./mock.js');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch();
  const { page, be, errs } = await setup(b, { viewport: { width: 420, height: 820 } });
  await page.goto('http://127.0.0.1:8765/index.html');
  await page.waitForSelector('#form-login:not([hidden])');
  ok(await page.locator('#login-username').isVisible() && await page.locator('#login-password').isVisible() && !(await page.locator('#reg-code').isVisible()), 'вход: только логин и пароль');
  await page.click('#tab-register');
  ok(await page.locator('#reg-username').isVisible() && await page.locator('#reg-password').isVisible(), 'регистрация: логин и пароль');
  await page.fill('#reg-username', 'bad name!'); await page.fill('#reg-password', 'short'); await page.fill('#reg-email', 'nope');
  await page.click('#reg-submit');
  ok(!be.reqs.includes('POST /auth/register/code'), 'невалидные поля не уходят на сервер');
  await page.fill('#reg-username', 'newbie'); await page.fill('#reg-password', 'secret123'); await page.fill('#reg-email', 'New@Example.org');
  await page.click('#reg-submit');
  await page.waitForSelector('#reg-code-block:not([hidden])');
  ok(await page.locator('#reg-code').isVisible(), 'после запроса появилось поле кода');
  await page.fill('#reg-code', '12'); await page.click('#reg-submit');
  ok(!be.reqs.includes('POST /auth/register'), 'короткий код не уходит на сервер');
  await page.fill('#reg-code', '123456'); await page.click('#reg-submit');
  await page.waitForSelector('#chat-list .chat-item');
  ok(await page.locator('#app').getAttribute('data-screen') === 'chat', 'аккаунт создан, открыт мессенджер');
  ok(errs.length === 0, 'нет ошибок консоли: ' + JSON.stringify(errs));
  await b.close(); process.exit(fails ? 1 : 0);
})();
