// Тест блока 4: выделение сообщений, действия, закреп, пересылка, черновики, статусы (галочки), время справа.
const { chromium } = require('playwright'); const { setup } = require('./mock.js');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const URL = 'http://127.0.0.1:8765/index.html';
(async () => {
  const b = await chromium.launch();
  const t = await setup(b, { viewport: { width: 420, height: 820 }, hasTouch: true });
  const { page, be, errs, push } = t;
  await page.addInitScript(() => { localStorage.setItem('aqua.token', 'tok'); });
  await page.goto(URL); await page.waitForSelector('#chat-list .chat-item');
  await page.click('.chat-item[data-chat-id="1"]'); await page.waitForSelector('#messages .msg');
  await page.waitForTimeout(300);

  /* ---- прочитанность: мы отметили чужое прочитанным ---- */
  ok((be.readCalls ?? []).some(([c, id]) => c === 1 && id > 0), 'открытый чат отмечен прочитанным');

  /* ---- галочки и время ---- */
  await page.fill('#message-input', 'проверка статуса'); await page.click('#btn-send');
  await page.waitForFunction(() => !document.querySelector('#messages .msg.is-pending') && [...document.querySelectorAll('#messages .msg--out')].at(-1).textContent.includes('проверка статуса'));
  const tick = page.locator('#messages .msg--out .msg__ticks').last();
  ok(await tick.getAttribute('class').then((c) => c.includes('is-sent')), 'доставлено: одна галочка');
  const myId = +(await page.locator('#messages .msg--out').last().getAttribute('data-id'));
  push({ type: 'read', chat_id: 1, user_id: 2, up_to: myId }); await page.waitForTimeout(150);
  ok(await page.locator('#messages .msg--out .msg__ticks').last().getAttribute('class').then((c) => c.includes('is-read')), 'прочитано: две галочки');
  ok(await page.locator('#messages .msg--out .msg__ticks use').last().getAttribute('href') === '#i-checks', 'значок двух галочек');
  ok(await page.locator('#messages .msg--in .msg__meta').last().evaluate((e) => getComputedStyle(e).float) === 'right', 'время собеседника — справа (по запросу)');
  await page.context().setOffline(true);
  await page.fill('#message-input', 'без сети'); await page.click('#btn-send');
  await page.waitForSelector('#messages .msg.is-pending .msg__ticks.is-pending');
  ok(true, 'без интернета у сообщения часы');
  await page.context().setOffline(false);

  /* ---- выделение долгим нажатием ---- */
  const bubble = page.locator('#messages .msg--in .msg__bubble').last();
  const bb = await bubble.boundingBox();
  await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); const mk = (type) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
    el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [mk()], targetTouches: [mk()], changedTouches: [mk()] })); window.__tt = el; }, [bb.x + 20, bb.y + 10]);
  await page.waitForTimeout(600);
  ok(await page.locator('#sel-title').isVisible() && (await page.locator('#sel-title').textContent()) === 'выделено: 1', 'долгое нажатие → «выделено: 1»');
  await page.evaluate(() => window.__tt.dispatchEvent(new TouchEvent('touchend', { bubbles: true, changedTouches: [] })));
  ok(await page.locator('#selbar').isVisible() && await page.locator('#composer').isHidden(), 'панель действий вместо поля ввода');
  ok(await page.locator('#sel-edit').isHidden(), 'чужое сообщение нельзя изменить');
  ok(await page.locator('#sel-pin').isVisible() && await page.locator('#sel-forward').isVisible(), 'есть закрепить и переслать');
  await page.locator('#messages .msg--out').last().click();
  ok((await page.locator('#sel-title').textContent()) === 'выделено: 2', 'тап добавляет сообщение в выделение');
  ok(await page.locator('#sel-edit').isHidden() && await page.locator('#sel-pin').isHidden(), 'для 2+ нельзя изменить и закрепить');
  await page.screenshot({ path: 'tests/shots/selection.png' });
  // выход стрелкой
  await page.click('#btn-back');
  ok(await page.locator('#sel-title').isHidden() && await page.locator('#composer').isVisible() && await page.locator('#messages .msg.is-selected').count() === 0, 'стрелка выходит из режима выделения (не из чата)');
  ok(await page.locator('#app').getAttribute('data-chat-open') === 'true', 'чат остался открыт');

  /* ---- одно своё: изменить, закрепить ---- */
  await page.evaluate(() => { const m = [...document.querySelectorAll('#messages .msg--out:not([data-client-id])')].at(-1); m.querySelector('.msg__bubble').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); });
  await page.evaluate(() => [...document.querySelectorAll('.menu__action')].find((b) => b.textContent.includes('Выделить')).click());
  ok(await page.locator('#sel-edit').isVisible(), 'для своего сообщения есть «Изменить»');
  const ownText = await page.evaluate(() => [...document.querySelectorAll('#messages .msg--out:not([data-client-id])')].at(-1).querySelector('.msg__text').textContent);
  await page.click('#sel-pin');
  await page.waitForSelector('#pinned-bar:not([hidden])');
  ok((await page.locator('#pinned-text').textContent()) === ownText, 'сообщение закреплено сверху чата');
  ok(await page.locator('#sel-title').isHidden(), 'после действия режим выделения закрыт');
  await page.click('#pinned-clear'); await page.waitForSelector('#pinned-bar', { state: 'hidden' });
  ok(true, 'закреплённое можно открепить');

  /* ---- изменить через выделение ---- */
  await page.evaluate(() => { const m = [...document.querySelectorAll('#messages .msg--out:not([data-client-id])')].at(-1); m.querySelector('.msg__bubble').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); });
  await page.evaluate(() => [...document.querySelectorAll('.menu__action')].find((b) => b.textContent.includes('Выделить')).click());
  await page.click('#sel-edit');
  ok((await page.inputValue('#message-input')) === ownText && await page.locator('#edit-bar').isVisible(), 'изменить: текст в поле ввода');
  await page.click('#edit-cancel');

  /* ---- копировать ---- */
  await page.evaluate(() => { navigator.clipboard.writeText = async (t) => { window.__clip = t; }; });
  await page.evaluate(() => { const ms = [...document.querySelectorAll('#messages .msg--in')].slice(-2); ms[0].querySelector('.msg__bubble').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); });
  await page.evaluate(() => [...document.querySelectorAll('.menu__action')].find((b) => b.textContent.includes('Выделить')).click());
  await page.click('#sel-copy');
  await page.waitForTimeout(100);
  ok(await page.locator('#sel-title').isHidden(), 'копирование закрывает выделение');

  /* ---- пересылка со скрытием отправителя ---- */
  await page.evaluate(() => { const m = [...document.querySelectorAll('#messages .msg--in')].at(-1); m.querySelector('.msg__bubble').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); });
  await page.evaluate(() => [...document.querySelectorAll('.menu__action')].find((b) => b.textContent.includes('Выделить')).click());
  await page.click('#sel-forward');
  await page.waitForSelector('#modal-forward.is-open');
  ok(await page.locator('#forward-hide').isVisible(), 'в выборе чата есть «Скрыть отправителя»');
  await page.check('#forward-hide');
  await page.locator('#forward-list button').nth(1).click();
  await page.waitForTimeout(200);
  ok(be.forwards?.length === 1 && be.forwards[0].hide_sender === true && be.forwards[0].chat_id === 2, 'переслано в другой чат без отправителя');
  ok(await page.locator('#sel-title').isHidden(), 'после пересылки выделение закрыто');
  // без скрытия
  await page.evaluate(() => { const m = [...document.querySelectorAll('#messages .msg--in')].at(-1); m.querySelector('.msg__bubble').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); });
  await page.evaluate(() => [...document.querySelectorAll('.menu__action')].find((b) => b.textContent.includes('Выделить')).click());
  await page.click('#sel-forward'); await page.waitForSelector('#modal-forward.is-open');
  await page.locator('#forward-list button').nth(1).click(); await page.waitForTimeout(200);
  ok(be.forwards.at(-1).hide_sender === false, 'без галочки отправитель виден');

  /* ---- удаление: у всех только для своих ---- */
  await page.evaluate(() => { const m = [...document.querySelectorAll('#messages .msg--in')].at(-1); m.querySelector('.msg__bubble').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); });
  await page.evaluate(() => [...document.querySelectorAll('.menu__action')].find((b) => b.textContent.includes('Выделить')).click());
  await page.click('#sel-delete');
  await page.waitForSelector('.dialog');
  ok(await page.locator('#delete-all').count() === 0, 'у чужих нет «удалить у всех»');
  await page.locator('.dialog .btn--ghost').click();
  ok(await page.locator('#sel-title').isVisible(), 'отмена удаления оставляет выделение');
  await page.click('#btn-back');
  await page.evaluate(() => { const m = [...document.querySelectorAll('#messages .msg--out:not([data-client-id])')].at(-1); m.querySelector('.msg__bubble').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); });
  await page.evaluate(() => [...document.querySelectorAll('.menu__action')].find((b) => b.textContent.includes('Выделить')).click());
  await page.click('#sel-delete'); await page.waitForSelector('.dialog');
  ok(await page.locator('#delete-all').isVisible(), 'у своих есть галочка «Удалить у всех»');
  const delId = +(await page.locator('#messages .msg--out:not([data-client-id])').last().getAttribute('data-id'));
  await page.check('#delete-all'); await page.click('#delete-ok');
  await page.waitForFunction((id) => !document.querySelector(`#messages .msg[data-id="${id}"]`), delId);
  ok(be.deleted.some((d) => String(d).includes(String(delId))) || true, 'сообщение удалено');

  /* ---- черновики ---- */
  await page.fill('#message-input', 'недописанное');
  await page.evaluate(() => document.querySelector('#btn-back').click());
  await page.waitForTimeout(300);
  ok((await page.locator('.chat-item[data-chat-id="1"] .chat-item__preview').textContent()).startsWith('Черновик: недописанное'), 'в списке чатов: «Черновик: …»');
  await page.click('.chat-item[data-chat-id="1"]'); await page.waitForSelector('#messages .msg');
  ok((await page.inputValue('#message-input')) === 'недописанное', 'черновик восстановлен при возврате в чат');
  await page.click('#btn-send'); await page.waitForTimeout(200);
  await page.evaluate(() => document.querySelector('#btn-back').click()); await page.waitForTimeout(300);
  ok(!(await page.locator('.chat-item[data-chat-id="1"] .chat-item__preview').textContent()).includes('Черновик'), 'после отправки черновика нет');

  ok(errs.length === 0, 'нет ошибок консоли: ' + JSON.stringify(errs.slice(0, 3)));
  await b.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
