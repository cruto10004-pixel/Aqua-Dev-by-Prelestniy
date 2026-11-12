// Тест: настройки (тема, обои, быстрая реакция, приватность, логин/пароль) и профиль собеседника (⋮: контакт, блок).
const { chromium } = require('playwright'); const { setup } = require('./mock.js');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch();
  const t = await setup(b, { viewport: { width: 420, height: 800 } });
  const { page, be, errs } = t;
  await page.addInitScript(() => { localStorage.setItem('aqua.token', 'tok'); sessionStorage.setItem('aqua.splash.seen', '1'); });
  await page.goto('http://127.0.0.1:8765/index.html'); await page.waitForSelector('#chat-list .chat-item');
  const rootVar = (n) => page.evaluate((k) => document.documentElement.style.getPropertyValue(k), n);

  // --- Настройки ---

  await page.click('#nav-settings'); await page.waitForSelector('#modal-prefs.is-open');
  ok(await page.locator('.tg-row[data-page]').count() === 3 && await page.locator('#prefs-back').isHidden(), 'настройки: 3 раздела');
  await page.click('[data-page="chats"]');
  ok(await page.locator('#prefs-title').textContent() === 'Настройки чатов' && await page.locator('#prefs-preview').isVisible(), 'раздел «Настройки чатов» с предпросмотром');
  ok(await page.locator('.theme-sw').count() === 8, 'палитры: 7 готовых + свой цвет');
  await page.click('.theme-sw[data-palette="mint"]');
  await page.waitForFunction(() => document.documentElement.style.getPropertyValue('--aqua-teal-600').toLowerCase() === '#12896b');
  ok(be.prefsPuts.at(-1).palette === 'mint', 'палитра сохранена на сервере');
  await page.click('.theme-sw[data-palette="night"]');
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  ok(await rootVar('--color-surface') === '#15263A', 'тёмная тема применена');
  await page.screenshot({ path: 'tests/shots/settings-dark.png' });
  await page.click('.theme-sw[data-palette="sea"]');
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  ok(await rootVar('--aqua-teal-600') === '', 'море = стандартные цвета');
  await page.fill('#accent-input', '#c2417a'); await page.dispatchEvent('#accent-input', 'change');
  await page.waitForFunction(() => document.documentElement.style.getPropertyValue('--aqua-teal-600') === '#c2417a');
  ok(be.prefsPuts.at(-1).palette === 'custom' && be.prefsPuts.at(-1).accent === '#c2417a', 'свой цвет сохранён');
  await page.click('.theme-sw[data-palette="sea"]');

  await page.click('.wp[data-wp="mint"]');
  await page.waitForFunction(() => document.documentElement.style.getPropertyValue('--chat-wallpaper').includes('gradient'));
  ok(be.prefsPuts.at(-1).wallpaper.id === 'mint', 'обои выбраны и сохранены');

  await page.click('.qr__item >> nth=2');
  ok(be.prefsPuts.at(-1).quick_reaction === '😂', 'быстрая реакция выбрана');

  // Вид сообщений: ползунки меняют CSS-переменные сразу и сохраняются
  await page.locator('#bubble-radius').fill('4');
  await page.waitForFunction(() => document.documentElement.style.getPropertyValue('--bubble-radius') === '4px');
  await page.locator('#text-size').fill('120');
  await page.waitForFunction(() => document.documentElement.style.getPropertyValue('--msg-scale') === '1.2');
  await page.waitForTimeout(200);
  ok(be.prefsPuts.some((p) => p.bubble_radius === 4) && be.prefsPuts.some((p) => p.text_size === 120), 'скругление и размер текста сохранены');
  ok(await page.evaluate(() => getComputedStyle(document.querySelector('#prefs-preview .msg--out .msg__bubble')).borderTopLeftRadius) === '4px', 'предпросмотр использует скругление');
  await page.screenshot({ path: 'tests/shots/chat-settings.png' });
  await page.click('#prefs-back'); await page.click('[data-page="privacy"]');
  await page.selectOption('#priv-who_can_write', 'except');
  await page.selectOption('#priv-who_can_voice', 'selected');
  await page.waitForTimeout(300);
  ok(be.privPuts[0].who_can_write?.mode === 'except' && be.privPuts[1].who_can_voice?.mode === 'selected', 'приватность сохранена');

  await page.click('#prefs-back'); await page.click('[data-page="account"]');
  await page.click('details:has(#form-username) > summary'); await page.fill('#form-username-username', 'alice2'); await page.fill('#form-username-password', 'bad');
  await page.click('#form-username button[type=submit]'); await page.waitForSelector('#form-username .form-error:not([hidden])');
  ok((await page.textContent('#form-username .form-error')).includes('Неверный пароль'), 'ошибка смены логина показана');
  await page.fill('#form-username-password', 'secret123'); await page.click('#form-username button[type=submit]');
  await page.waitForFunction(() => document.querySelector('#profile-login').textContent === '@alice2');
  ok(true, 'логин сменён, в профиле @alice2');
  await page.click('details:has(#form-password) > summary'); await page.fill('#form-password-current', 'secret123');
  await page.fill('#form-password-next', 'newpass123'); await page.fill('#form-password-again', 'other');
  await page.click('#form-password button[type=submit]');
  ok((await page.textContent('#form-password .form-error')).includes('не совпадают'), 'пароли должны совпадать');
  await page.fill('#form-password-again', 'newpass123'); await page.click('#form-password button[type=submit]');
  await page.waitForFunction(() => document.querySelector('#form-password').closest('details').open === false);
  ok(be.pwPuts.at(-1).new_password === 'newpass123', 'пароль отправлен на сервер');
  await page.click('#nav-chats');

  // Тема сохраняется в кэше и применяется при перезагрузке
  await page.reload(); await page.waitForSelector('#chat-list .chat-item');
  ok((await rootVar('--chat-wallpaper')).includes('gradient'), 'обои применяются после перезагрузки');

  // --- Быстрая реакция по двойному тапу ---
  await page.click('.chat-item[data-chat-id="1"]'); await page.waitForSelector('#messages .msg--in');
  await page.locator('#messages .msg--in .msg__bubble').last().dblclick();
  await page.waitForSelector('#messages .msg--in .reaction');
  ok(be.reqs.some((r) => /PUT \/messages\/\d+\/reactions/.test(r)) && (await page.locator('#messages .reaction').last().textContent()).includes('😂'), 'двойной тап ставит быструю реакцию');
  ok(await page.locator('.menu').count() === 0, 'меню не открывается');

  // --- Профиль собеседника ---
  await page.click('#chat-peer'); await page.waitForSelector('#modal-peer.is-open');
  ok((await page.textContent('#peer-login')) === '@bob' || (await page.textContent('#peer-login')).startsWith('@'), 'профиль собеседника: логин с @');
  ok((await page.textContent('#peer-bio')).includes('море'), 'описание собеседника показано');
  await page.click('#peer-more'); ok(await page.locator('#peer-menu').isVisible(), 'меню ⋮ открылось');
  await page.screenshot({ path: 'tests/shots/peer-menu.png' });
  await page.click('#peer-act-contact');
  await page.waitForFunction(() => document.querySelector('#toast, .toast')?.textContent.includes('контакты'));
  ok(be.contacts.size === 1, 'добавлен в контакты');
  await page.click('#peer-more');
  ok((await page.textContent('#peer-act-contact')) === 'Удалить из контактов', 'пункт меню сменился');
  await page.click('#peer-act-block');
  await page.waitForFunction(() => !document.querySelector('#peer-badge').hidden);
  ok(be.blocked.size === 1 && (await page.textContent('#peer-badge')) === 'Заблокирован', 'пользователь заблокирован, виден бейдж');
  await page.click('#peer-more');
  ok((await page.textContent('#peer-act-block')) === 'Разблокировать', 'пункт меню: разблокировать');
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  // Список заблокированных в настройках и разблокировка
  await page.click('#btn-back').catch(() => {}); await page.waitForSelector('#nav-profile');
  await page.click('#nav-settings'); await page.click('[data-page="privacy"]');
  await page.waitForSelector('[data-unblock]');
  await page.click('[data-unblock]'); await page.waitForFunction(() => !document.querySelector('[data-unblock]'));
  ok(be.blocked.size === 0, 'разблокировка из настроек');
  ok(errs.length === 0, 'нет ошибок консоли: ' + JSON.stringify(errs.slice(0, 3)));
  await b.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
