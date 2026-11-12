// Тест блоков 1–3: реакции с аватарками, стикеры, сохранённые GIF, просмотр медиа, видео без звука → GIF.
const { chromium } = require('playwright'); const path = require('path');
const { setup } = require('./mock.js');
const FX = path.join(__dirname, 'fixtures') + '/';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const URL = 'http://127.0.0.1:8765/index.html';
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const t = await setup(b, { viewport: { width: 420, height: 820 }, hasTouch: false });
  const { page, be, errs } = t;
  await page.addInitScript(() => { localStorage.setItem('aqua.token', 'tok'); });
  await page.goto(URL); await page.waitForSelector('#chat-list .chat-item');
  await page.click('.chat-item[data-chat-id="1"]'); await page.waitForSelector('#messages .msg');

  /* ---- Реакции: аватарки вместо цифры, одна на человека ---- */
  const last = page.locator('#messages .msg--in').last();
  await last.locator('.msg__bubble').click({ button: 'right' });
  await page.locator('.menu__row button').first().click();
  await page.waitForSelector('.reaction--faces');
  ok(await page.locator('.reaction--faces .avatar').count() === 1 && !(await page.locator('.reaction--faces').textContent()).match(/\d/), 'в личном чате у реакции аватарка, а не цифра');
  await last.locator('.msg__bubble').click({ button: 'right' });
  const emojis = await page.locator('.menu__row button').allTextContents();
  ok(['👎', '🤬', '💩'].every((e) => emojis.includes(e)), 'в меню есть негативные реакции');
  await page.locator('.menu__row button', { hasText: '👎' }).click();
  await page.waitForFunction(() => document.querySelectorAll('#messages .msg--in:last-of-type .reaction--faces').length === 1);
  ok(be.reactionsOf(be.msgs[1].at(-1).id).length === 1 && be.reactionsOf(be.msgs[1].at(-1).id)[0].emoji === '👎', 'новая реакция заменила прежнюю (одна на человека)');

  /* ---- Стикеры: создать пак, добавить стикер ---- */
  await page.click('#btn-emoji'); await page.click('.picker__tab[data-tab="stickers"]');
  ok(await page.locator('#btn-emoji use').getAttribute('href') === '#i-sticker', 'значок кнопки — стикер');
  await page.waitForSelector('#sticker-new');
  await page.click('#sticker-new');
  await page.fill('.dialog__input', 'Мои коты'); await page.click('.dialog__actions .btn--primary');
  await page.waitForSelector('.picker__cat--pack');
  ok(await page.locator('.sticker-sec__head h4').first().textContent() === 'Мои коты', 'стикерпак создан');
  await page.setInputFiles('input[type=file][multiple]', [FX + 'photo.jpg', FX + 'photo.jpg']).catch(async () => {
    await page.click('.picker__sticker--add'); });
  await page.waitForFunction(() => document.querySelectorAll('.sticker-sec__grid .picker__sticker img').length >= 2).catch(() => {});
  if (!(await page.locator('.sticker-sec__grid .picker__sticker img').count())) {
    await page.locator('.picker__sticker--add').click();
    await page.setInputFiles('input[type=file][multiple]', [FX + 'photo.jpg', FX + 'photo.jpg']);
    await page.waitForFunction(() => document.querySelectorAll('.sticker-sec__grid .picker__sticker img').length >= 2);
  }
  ok(await page.locator('.picker__sticker img').count() === 2, 'в свой пак добавлены 2 стикера');
  ok(be.uploads.at(-1).meta.mime.startsWith('image/'), 'стикер загружен как картинка');
  ok(await page.locator('.picker__cat--pack img').count() === 1, 'превью пака — картинка (первый стикер)');
  const firstSrc = await page.locator('.sticker-sec__grid .picker__sticker img').first().getAttribute('src');
  ok((await page.locator('.picker__cat--pack img').getAttribute('src')) === firstSrc, 'превью пака = первый добавленный стикер');
  await page.screenshot({ path: 'tests/shots/stickers.png' });

  /* ---- Долгое нажатие: крупный план, избранное ---- */
  const st = page.locator('.sticker-sec__grid .picker__sticker:not(.picker__sticker--add)').first();
  const bb = await st.boundingBox();
  await page.mouse.move(bb.x + 20, bb.y + 20); await page.mouse.down(); await page.waitForTimeout(650); await page.mouse.up();
  await page.waitForSelector('.sticker-preview__card');
  const acts = await page.locator('.sticker-preview .menu__action').allTextContents();
  ok(acts.includes('Добавить в избранное') && acts.includes('Сохранить в галерею') && !acts.includes('Убрать из недавних'), 'крупный план: избранное и галерея, «недавних» ещё нет: ' + acts.join(' | '));
  ok(await page.locator('.sticker-preview__card').evaluate((c) => c.getBoundingClientRect().height < innerHeight * 0.8), 'крупный план не на весь экран');
  await page.locator('.sticker-preview .menu__action', { hasText: 'Добавить в избранное' }).click();
  await page.waitForSelector('.sticker-sec[data-sec="fav"]');
  ok(await page.locator('.sticker-sec[data-sec="fav"] .picker__sticker').count() === 1, 'стикер в «Избранных»');

  /* ---- Отправка стикера ---- */
  await st.click();
  await page.waitForSelector('#messages .msg--sticker');
  ok(be.wsIn.some((d) => d.type === 'message' && d.meta?.sticker === 1), 'ушло сообщение со стикером');
  ok(await page.locator('#messages .msg--sticker .msg__bubble').evaluate((e) => getComputedStyle(e).backgroundColor === 'rgba(0, 0, 0, 0)'), 'стикер без «пузыря»');
  await page.waitForSelector('.sticker-sec[data-sec="recent"]', { timeout: 4000 });
  const order = await page.locator('.sticker-sec').evaluateAll((a) => a.map((x) => x.dataset.sec));
  ok(order.join() === 'fav,recent,pack-1', 'лента сверху вниз: избранные, недавние, паки: ' + order.join());
  // убрать из недавних
  const rc = page.locator('.sticker-sec[data-sec="recent"] .picker__sticker').first(); const rb = await rc.boundingBox();
  await page.mouse.move(rb.x + 20, rb.y + 20); await page.mouse.down(); await page.waitForTimeout(650); await page.mouse.up();
  await page.locator('.sticker-preview .menu__action', { hasText: 'Убрать из недавних' }).click();
  await page.waitForFunction(() => !document.querySelector('.sticker-sec[data-sec="recent"]'));
  ok(true, '«Убрать из недавних» работает');
  // удалить из избранного
  const fc = page.locator('.sticker-sec[data-sec="fav"] .picker__sticker').first(); const fb = await fc.boundingBox();
  await page.mouse.move(fb.x + 20, fb.y + 20); await page.mouse.down(); await page.waitForTimeout(650); await page.mouse.up();
  await page.locator('.sticker-preview .menu__action', { hasText: 'Удалить из избранного' }).click();
  await page.waitForFunction(() => !document.querySelector('.sticker-sec[data-sec="fav"]'));
  ok(true, '«Удалить из избранного» работает');

  /* ---- Тап по стикеру в чате → окно пака ---- */
  await page.keyboard.press('Escape');
  await page.locator('#messages .msg__sticker').last().click();
  await page.waitForSelector('#modal-pack.is-open'); await page.waitForSelector('#pack-grid .pack-grid__item');
  ok(await page.locator('#pack-title').textContent() === 'Мои коты' && await page.locator('#pack-grid .pack-grid__item').count() === 2 || console.log(await page.locator('#pack-title').textContent(), await page.locator('#pack-grid .pack-grid__item').count()), 'окно пака: название и все стикеры');
  ok(/ваш/.test(await page.locator('#pack-add').textContent()), 'для своего пака кнопка неактивна');
  await page.keyboard.press('Escape');

  /* ---- Сохранённые GIF + вертикальный список ---- */
  await page.click('#btn-emoji'); await page.click('.picker__tab[data-tab="gif"]');
  await page.fill('#gif-search', 'кот'); await page.waitForSelector('.picker__gif');
  await page.locator('.picker__gif').first().click();
  await page.waitForSelector('#messages .msg--out img.msg__media');
  await page.click('#btn-emoji'); await page.fill('#gif-search', '');
  await page.waitForSelector('.picker__gif--saved');
  ok(await page.locator('.picker__gif--saved').count() === 1, 'отправленная GIF в «Сохранённых»');
  ok(await page.locator('#gif-grid.is-saved .picker__gif--saved').evaluate((t) => { const r = t.getBoundingClientRect(); return Math.abs(r.width - r.height) < 2; }), 'сохранённые GIF — квадратные плитки, как стикеры');
  ok(await page.locator('#gif-grid').evaluate((g) => { const c = getComputedStyle(g); return c.overflowX === 'hidden' && c.overflowY === 'auto' && c.touchAction === 'pan-y' && g.scrollWidth <= g.clientWidth; }), 'GIF листаются только вертикально (по горизонтали прокрутки нет)');
  await page.keyboard.press('Escape');

  /* ---- Меню ⋮ у медиа и просмотр на весь экран ---- */
  const media = page.locator('#messages .msg--out .msg__mediawrap').last();
  await media.hover();
  await media.locator('.msg__more').click();
  const items = await page.locator('.menu--pop .menu__action').allTextContents();
  ok(items.includes('Сохранить в галерею') && items.includes('Сохранить GIF'), 'меню ⋮: ' + items.join(' | '));
  await page.locator('.menu--pop .menu__action', { hasText: 'Сохранить GIF' }).click();
  await page.waitForTimeout(150);
  ok(be.savedCalls?.length === 1, 'GIF сохранена через меню');
  await media.locator('.msg__media').click();
  await page.waitForSelector('.lb');
  ok(await page.locator('.lb img.lb__media').isVisible(), 'фото открылось на весь экран');
  await page.click('#lb-more');
  const lbItems = await page.locator('.lb .menu__action').allTextContents();
  ok(['Сохранить в галерею', 'Сохранить GIF', 'Переслать', 'Удалить у всех'].every((x) => lbItems.includes(x)), 'меню просмотра: ' + lbItems.join(' | '));
  await page.locator('.lb .menu__action', { hasText: 'Переслать' }).click();
  await page.waitForSelector('#modal-forward.is-open');
  await page.locator('#forward-list button').nth(1).click();
  await page.waitForTimeout(200);
  ok(be.forwards?.length === 1 && be.forwards[0].chat_id === 2, 'пересылка из просмотра: сообщение ушло в выбранный чат');
  await page.waitForFunction(() => !document.querySelector('.lb'));
  ok(true, 'просмотр закрылся после пересылки');

  /* ---- Видео без звука → GIF; плеер ---- */
  await page.click('#btn-attach'); await page.waitForSelector('#modal-files.is-open');
  await page.setInputFiles('#file-input', FX + 'clip.webm');
  await page.waitForSelector('#modal-editor.is-open');
  await page.waitForFunction(() => { const v = document.getElementById('editor-video'); return v.readyState >= 1 && Number.isFinite(v.duration); });
  await page.click('#video-mute');
  ok(await page.locator('#video-mute').getAttribute('aria-pressed') === 'true', 'переключатель «без звука» включён');
  await page.click('#editor-done');
  await page.waitForSelector('#messages video.msg__media.is-gif', { timeout: 25000 });
  ok(be.wsIn.filter((d) => d.type === 'message').at(-1).meta?.gif === true, 'видео без звука ушло с меткой GIF');
  await page.waitForFunction(() => !document.querySelector('#messages .msg.is-pending'));
  await page.waitForTimeout(200);
  ok(be.savedGifs.length >= 2, 'такая GIF автоматически в «Сохранённых»');
  await page.locator('#messages video.msg__media.is-gif').last().click();
  await page.waitForSelector('.lb video');
  await page.waitForFunction(() => document.querySelector('.lb video').readyState >= 1);
  ok(await page.locator('#lb-speed').isVisible() && await page.locator('#lb-land').isVisible(), 'в плеере есть скорость и альбомный режим');
  await page.click('#lb-speed');
  ok(await page.evaluate(() => document.querySelector('.lb video').playbackRate) === 1.25, 'скорость переключается');
  await page.evaluate(() => { const v = document.querySelector('.lb video'); v.pause(); v.currentTime = 1; });
  const sb = await page.locator('.lb__stage').boundingBox();
  await page.mouse.dblclick(sb.x + sb.width * 0.85, sb.y + sb.height / 2);
  ok(await page.locator('.lb__tap--r').count() === 1 && (await page.locator('.lb__tap--r').textContent()) === '+10 с', 'двойной тап справа: перемотка +10 с');
  await page.waitForTimeout(700);
  await page.mouse.dblclick(sb.x + sb.width * 0.15, sb.y + sb.height / 2);
  ok(await page.locator('.lb__tap--l').count() === 1, 'двойной тап слева: перемотка −10 с');
  await page.screenshot({ path: 'tests/shots/lightbox.png' });
  await page.keyboard.press('Escape');

  ok(errs.length === 0, 'нет ошибок консоли: ' + JSON.stringify(errs.slice(0, 3)));
  await b.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
