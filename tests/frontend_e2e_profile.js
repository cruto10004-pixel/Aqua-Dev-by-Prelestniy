// Тест: окно профиля — просмотр, ник, @логин, описание, системные аватарки, сохранение.
const { chromium } = require('playwright'); const { setup } = require('./mock.js');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch();
  const t = await setup(b, { viewport: { width: 420, height: 800 } });
  const { page, be, errs } = t;
  await page.addInitScript(() => { localStorage.setItem('aqua.token', 'tok'); sessionStorage.setItem('aqua.splash.seen', '1'); });
  await page.goto('http://127.0.0.1:8765/index.html'); await page.waitForSelector('#chat-list .chat-item');
  await page.click('#nav-profile'); await page.waitForSelector('#modal-settings.is-open');
  ok(await page.textContent('#profile-login') === '@alice', 'логин показан с @');
  ok(await page.textContent('#profile-name') === 'alice', 'без ника показывается логин');
  ok(await page.locator('#profile-avatar .avatar').count() === 1, 'аватар показан (инициалы)');
  await page.screenshot({ path: 'tests/shots/profile-view.png' });
  ok(await page.locator('.avatar-picker__item').count() === 0, 'списка системных аватарок больше нет');
  await page.click('#profile-edit-btn');
  ok(await page.inputValue('#profile-login-ro') === '@alice', 'логин в форме с @, только чтение');
  await page.fill('#profile-nick', 'Алиса'); await page.fill('#profile-bio-input', 'Люблю море');
  await page.screenshot({ path: 'tests/shots/profile-edit.png' });
  await page.click('#profile-save');
  await page.waitForSelector('#profile-view:not([hidden])');
  ok(be.profilePatches[0].display_name === 'Алиса' && be.profilePatches[0].bio === 'Люблю море', 'на сервер ушли ник и описание');
  ok(await page.textContent('#profile-name') === 'Алиса' && await page.textContent('#profile-login') === '@alice', 'ник и @логин раздельно');
  ok(await page.textContent('#profile-bio') === 'Люблю море', 'описание показано');
  await page.click('#profile-edit-btn'); await page.fill('#profile-nick', 'Другой'); await page.click('#profile-cancel');
  ok(await page.textContent('#profile-name') === 'Алиса', 'Отмена не меняет профиль');
  ok(errs.length === 0, 'нет ошибок консоли ' + JSON.stringify(errs.slice(0, 3)));
  await b.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
