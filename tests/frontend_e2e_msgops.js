// Тест: копирование, изменение, удаление у себя / у всех.
const { chromium } = require('playwright'); const { setup } = require('./mock.js');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const URL = 'http://127.0.0.1:8765/index.html';
(async () => {
  const b = await chromium.launch();
  const t = await setup(b, { viewport: { width: 1100, height: 800 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const { page, be, errs } = t;
  await page.addInitScript(() => { localStorage.setItem('aqua.token', 'tok'); sessionStorage.setItem('aqua.splash.seen', '1'); });
  await page.goto(URL); await page.waitForSelector('#chat-list .chat-item');
  await page.click('.chat-item[data-chat-id="1"]'); await page.waitForSelector('#messages .msg');
  const myMsg = async () => page.locator('#messages .msg--out .msg__text').last();
  // Плавная прокрутка ленты закрывает меню — при гонке повторяем открытие
  const open = async (loc) => {
    for (let i = 0; i < 4; i++) {
      await loc.click({ button: 'right' });
      if (await page.waitForSelector('.menu', { timeout: 1500 }).then(() => true).catch(() => false)) { await page.waitForTimeout(150); if (await page.locator('.menu').count()) return; }
      await page.waitForTimeout(400);
    }
    throw new Error('меню не открылось');
  };

  // Своё сообщение: отправляем, чтобы у него появился настоящий id
  await page.fill('#message-input', 'моё сообщение'); await page.press('#message-input', 'Enter');
  await page.waitForFunction(() => { const l = [...document.querySelectorAll('#messages .msg--out')].at(-1); return l && l.textContent.includes('моё сообщение') && /^\d+$/.test(l.dataset.id) && !l.classList.contains('is-pending'); });
  await page.waitForTimeout(700);                      // плавная прокрутка вниз закрывает меню — ждём её конца
  const labels = async () => page.locator('.menu__action span').allTextContents();

  /* ---- меню своего сообщения ---- */
  await open(await myMsg());
  ok(JSON.stringify(await labels()) === JSON.stringify(['Выделить', 'Копировать', 'Изменить', 'Удалить у меня', 'Удалить у всех']), 'своё сообщение: копировать / изменить / удалить у меня / у всех');
  await page.screenshot({ path: 'tests/shots/msgops-menu.png' });

  /* ---- копирование ---- */
  await page.click('.menu__action:has-text("Копировать")');
  ok(await page.evaluate(() => navigator.clipboard.readText()) === 'моё сообщение', 'копирование: текст в буфере обмена');
  ok(/Скопировано/.test(await page.locator('#toast').textContent()), 'копирование: показано «Скопировано»');

  /* ---- изменение ---- */
  await open(await myMsg());
  await page.click('.menu__action:has-text("Изменить")');
  ok(await page.locator('#edit-bar').isVisible(), 'изменение: показана панель «Редактирование»');
  ok(await page.inputValue('#message-input') === 'моё сообщение', 'изменение: текст подставлен в поле');
  await page.fill('#message-input', 'исправленное');
  await page.press('#message-input', 'Enter');
  await page.waitForFunction(() => /изменено/.test([...document.querySelectorAll('#messages .msg--out')].at(-1)?.querySelector('.msg__meta')?.textContent || ''));
  ok((await (await myMsg()).textContent()) === 'исправленное', 'изменение: новый текст в ленте');
  ok(await page.locator('#edit-bar').isHidden() && await page.inputValue('#message-input') === '', 'изменение: поле очищено, режим закрыт');
  ok(/исправленное/.test(await page.locator('.chat-item[data-chat-id="1"] .chat-item__text, .chat-item[data-chat-id="1"]').first().textContent()), 'изменение: превью в списке чатов обновилось');
  const wsBefore = be.wsIn.length;
  await open(await myMsg()); await page.click('.menu__action:has-text("Изменить")'); await page.keyboard.press('Escape');
  ok(await page.locator('#edit-bar').isHidden(), 'Esc отменяет редактирование');
  ok(be.wsIn.filter((d) => d.type === 'message').length === be.wsIn.slice(0, wsBefore).filter((d) => d.type === 'message').length, 'отмена ничего не отправляет');
  await open(await myMsg()); await page.click('.menu__action:has-text("Изменить")');
  await page.fill('#message-input', ''); await page.press('#message-input', 'Enter');
  ok(await page.locator('#edit-bar').isVisible(), 'пустой текст у текстового сообщения не принимается');
  await page.click('#edit-cancel');

  /* ---- чужое сообщение: нельзя менять и удалять у всех ---- */
  const theirs = page.locator('#messages .msg--in .msg__text').last();
  await open(theirs);
  ok(JSON.stringify(await labels()) === JSON.stringify(['Выделить', 'Копировать', 'Удалить у меня']), 'чужое сообщение: только копировать и удалить у меня');
  await page.keyboard.press('Escape');

  /* ---- удалить у себя (чужое) ---- */
  const countIn = await page.locator('#messages .msg--in').count();
  const theirText = await theirs.textContent();
  await open(theirs); await page.click('.menu__action:has-text("Удалить у меня")');
  await page.waitForFunction((n) => document.querySelectorAll('#messages .msg--in').length === n, countIn - 1);
  ok(!(await page.locator('#messages').textContent()).includes(theirText), 'удалить у себя: чужое сообщение исчезло из ленты');
  ok(be.deleted.at(-1).scope === 'me', 'удалить у себя: запрос scope=me');
  const rest = be.msgs[1].filter((x) => !be.hidden.has(x.id));
  ok(rest.length === be.msgs[1].length - 1, 'удалить у себя: у собеседника сообщение осталось (скрыто только у нас)');

  /* ---- удалить у всех (своё, с подтверждением) ---- */
  const myCount = await page.locator('#messages .msg--out').count();
  await open(await myMsg());
  await page.click('.menu__action:has-text("Удалить у всех")');
  ok(await page.locator('.menu__action.is-armed').count() === 1 && /Точно/.test(await page.locator('.menu__action.is-armed').textContent()), 'удалить у всех: просит подтверждение вторым нажатием');
  ok(await page.locator('#messages .msg--out').count() === myCount, 'до подтверждения ничего не удалено');
  await page.click('.menu__action.is-armed');
  await page.waitForFunction((n) => document.querySelectorAll('#messages .msg--out').length === n, myCount - 1);
  ok(be.deleted.at(-1).scope === 'all', 'удалить у всех: запрос scope=all');
  await page.waitForTimeout(150);
  const preview = await page.locator('.chat-item[data-chat-id="1"]').textContent();
  ok(!/исправленное/.test(preview), 'удалить у всех: превью в списке чатов обновилось');

  /* ---- мобильный: шторка с действиями помещается ---- */
  const m = await setup(b, { viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true });
  await m.page.addInitScript(() => { localStorage.setItem('aqua.token', 'tok'); sessionStorage.setItem('aqua.splash.seen', '1'); });
  await m.page.goto(URL); await m.page.waitForSelector('#chat-list .chat-item');
  await m.page.tap('.chat-item[data-chat-id="1"]'); await m.page.waitForSelector('#messages .msg--in'); await m.page.waitForTimeout(900);   // дождаться прокрутки к низу
  await m.page.locator('#messages .msg--in .msg__bubble').last().click({ button: 'right' });
  await m.page.waitForSelector('.menu'); await m.page.waitForTimeout(400);
  const r = await m.page.locator('.menu').boundingBox();
  ok(r.x >= 0 && r.x + r.width <= 361 && r.y + r.height <= 741, 'мобильная шторка помещается в экран');
  await m.page.screenshot({ path: 'tests/shots/msgops-mobile.png' });

  ok(errs.length === 0 && m.errs.length === 0, 'нет ошибок консоли ' + JSON.stringify([...errs, ...m.errs]));
  await b.close();
  console.log(fails ? `\nПРОВАЛЕНО: ${fails}` : '\nВсе проверки пройдены');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
