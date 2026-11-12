// Тест: панель смайликов/GIF, запоминание вкладки, значок кнопки, отправка GIF.
const { chromium } = require('playwright'); const { setup } = require('./mock.js');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const URL = 'http://127.0.0.1:8765/index.html';
(async () => {
  const b = await chromium.launch();
  const t = await setup(b, { viewport: { width: 420, height: 800 } });
  const { page, be, errs } = t;
  await page.addInitScript(() => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.setItem('aqua.token', 'tok'); } sessionStorage.setItem('aqua.splash.seen', '1'); });
  await page.goto(URL); await page.waitForSelector('#chat-list .chat-item');
  await page.click('.chat-item[data-chat-id="1"]'); await page.waitForSelector('#messages .msg');
  const icon = () => page.locator('#btn-emoji use').getAttribute('href');
  ok(await icon() === '#i-smile', 'по умолчанию значок смайлика');
  ok(await page.locator('#picker').isHidden(), 'панель закрыта');

  await page.click('#btn-emoji');
  ok(await page.locator('#picker').isVisible() && await page.locator('#picker-emoji').isVisible(), 'открылась вкладка смайликов');
  await page.fill('#message-input', 'привет ');
  await page.waitForSelector('.emoji-sec[data-sec="smileys"] .picker__emoji');
  ok(await page.locator('.emoji-sec').count() === 10, 'есть недавние + 9 категорий (смайлы, люди, животные, еда, транспорт, спорт, предметы, символы, флаги)');
  ok(await page.locator('.picker__emoji').count() > 1500, 'в панели весь набор смайликов (' + await page.locator('.picker__emoji').count() + ')');
  await page.locator('.emoji-sec[data-sec="smileys"] .picker__emoji').first().click();
  ok((await page.inputValue('#message-input')) === 'привет 😀', 'смайлик вставлен в текст');
  ok(await page.locator('#composer').getAttribute('data-has-text') === 'true', 'появилась кнопка отправки');
  const titles = await page.locator('.emoji-sec h4').allTextContents();
  ok(['Транспорт и места', 'Еда и напитки', 'Спорт и активности', 'Флаги', 'Животные и природа', 'Смайлы'].every((t) => titles.includes(t)), 'категории: ' + titles.join(', '));
  await page.click('.picker__cat[data-cat="food"]');
  await page.waitForTimeout(100);
  ok(await page.locator('#emoji-grid').evaluate((g) => g.scrollTop) > 300, 'нажатие на категорию прокручивает ленту к ней');
  ok(await page.locator('.picker__cat[data-cat="food"]').getAttribute('aria-pressed') === 'true', 'активная категория подсвечена');
  await page.locator('#emoji-grid').evaluate((g) => { g.scrollTop = g.querySelector('[data-sec="flags"]').offsetTop - g.offsetTop; });
  await page.waitForTimeout(150);
  ok(await page.locator('.picker__cat[data-cat="flags"]').getAttribute('aria-pressed') === 'true', 'при прокрутке ленты вкладка категории следует за ней');
  await page.click('.picker__cat[data-cat="recent"]');
  ok(await page.locator('.emoji-sec[data-sec="recent"] .picker__emoji').first().textContent() === '😀', 'недавние содержат выбранный');
  await page.fill('#emoji-search', 'pizza'); await page.waitForTimeout(250);
  ok(await page.locator('.picker__emoji:visible').first().textContent() === '🍕', 'поиск по названию находит пиццу');
  await page.fill('#emoji-search', '');  await page.waitForTimeout(250);
  await page.screenshot({ path: 'tests/shots/picker-emoji.png' });

  await page.click('.picker__tab[data-tab="gif"]');
  await page.waitForSelector('#gif-note:not([hidden])');
  ok(await icon() === '#i-gif', 'на вкладке GIF значок кнопки стал GIF');
  ok((await page.locator('#gif-note').textContent()).includes('Здесь будут все GIF'), 'без сохранённых — подсказка (недавних у GIF нет)');
  await page.screenshot({ path: 'tests/shots/picker-gif.png' });
  await page.fill('#gif-search', 'кот');
  await page.waitForFunction(() => document.querySelector('.picker__gif')?.title.startsWith('кот'));
  ok(be.gifQueries.includes('кот@0'), 'поиск отправил запрос');
  await page.evaluate(() => { const g = document.querySelector('#gif-grid'); g.scrollTop = g.scrollHeight; });
  await page.waitForFunction(() => document.querySelectorAll('.picker__gif').length >= 12);
  ok(true, 'подгрузка следующей страницы при прокрутке');

  await page.locator('.picker__gif').first().click();
  await page.waitForFunction(() => [...document.querySelectorAll('#messages .msg--out img.msg__media')].length > 0);
  ok(be.gifImports.length === 1 && be.gifImports[0].includes('giphy.com/f0.gif'), 'GIF импортирована и отправлена как изображение');
  ok(be.wsIn.some((d) => d.type === 'message' && d.meta?.gif === true), 'сообщение помечено как GIF');
  ok(await page.locator('#picker').isHidden(), 'после выбора GIF панель закрылась');
  ok(await page.locator('#message-input').inputValue() === 'привет 😀', 'набранный текст не потерян');

  // Выбор вкладки сохраняется (перезагрузка) и значок остаётся GIF
  await page.reload(); await page.waitForSelector('#chat-list .chat-item');
  ok(await icon() === '#i-gif', 'после перезагрузки значок GIF сохранён');
  await page.click('.chat-item[data-chat-id="1"]'); await page.click('#btn-emoji');
  await page.waitForSelector('#picker-gif:not([hidden])');
  ok(await page.locator('#picker-gif').isVisible(), 'открывается сразу на вкладке GIF');
  await page.waitForSelector('.picker__gif--saved');
  ok(await page.locator('.picker__gif--saved').count() === 1, 'отправленная GIF автоматически попала в «Сохранённые»');
  await page.click('.picker__tab[data-tab="emoji"]');
  ok(await icon() === '#i-smile', 'возврат на смайлики возвращает значок');
  await page.keyboard.press('Escape');
  ok(await page.locator('#picker').isHidden(), 'Esc закрывает панель');

  // Сервер без ключа
  be.gifsEnabled = false;
  await page.click('.picker__tab[data-tab="gif"]').catch(() => {});
  await page.click('#btn-emoji'); await page.click('.picker__tab[data-tab="gif"]');
  ok(true, 'переключение без ошибок');
  ok(errs.length === 0, 'нет ошибок консоли: ' + JSON.stringify(errs.slice(0, 3)));
  await b.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
