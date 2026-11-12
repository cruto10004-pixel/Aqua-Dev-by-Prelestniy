// Сквозной тест Этапа 5A: заставка, реакции, голосовые сообщения (Playwright + моки из mock.js).
// Запуск: cd frontend && python3 -m http.server 8765 &   затем   node tests/frontend_e2e_5a.js
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
const { setup } = require('./mock.js');
const OUT = path.join(__dirname, 'shots') + '/'; fs.mkdirSync(OUT, { recursive: true });
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const URL = 'http://127.0.0.1:8765/index.html';
const login = async (page) => { await page.addInitScript(() => localStorage.setItem('aqua.token', 'tok')); await page.goto(URL); await page.waitForSelector('#chat-list .chat-item'); };

(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });

  /* ===== Заставка ===== */
  let t = await setup(browser, { viewport: { width: 1000, height: 700 } }, { splash: true });
  await t.page.goto(URL);
  ok(await t.page.locator('#splash').count() === 1, 'заставка показана при входе');
  ok(await t.page.locator('#splash-video').getAttribute('src') === 'assets/start.webm', 'заставка использует start.webm (VP9 с прозрачностью)');
  ok(await t.page.evaluate(() => getComputedStyle(document.getElementById('splash')).backgroundColor) === 'rgba(0, 0, 0, 0)', 'фон заставки прозрачный — приложение видно сразу');
  await t.page.waitForFunction(() => document.getElementById('splash-video').currentTime > 0.4, null, { timeout: 5000 });
  ok(true, 'видео заставки реально воспроизводится (currentTime растёт)');
  ok(await t.page.locator('#screen-auth, #screen-chat').first().isVisible(), 'под заставкой видно экран приложения');
  await t.page.screenshot({ path: OUT + '5b-splash-over-app.png' });
  await t.page.click('#splash').catch(() => {});                // тап — пропустить
  await t.page.waitForSelector('#splash', { state: 'detached', timeout: 3000 });
  ok(true, 'заставка закрывается по тапу и убирается из DOM');
  await t.page.reload(); await t.page.waitForTimeout(300);
  ok(await t.page.locator('#splash').count() === 0, 'повторный вход в той же сессии — без заставки');
  await t.ctx.close();

  t = await setup(browser, { viewport: { width: 1000, height: 700 }, reducedMotion: 'reduce' }, { splash: true });
  await t.page.goto(URL); await t.page.waitForTimeout(300);
  ok(await t.page.locator('#splash').count() === 0, 'prefers-reduced-motion: заставка пропускается');
  await t.ctx.close();

  /* ===== Реакции (десктоп) ===== */
  t = await setup(browser, { viewport: { width: 1280, height: 800 } });
  let { page, be } = t;
  await login(page);
  await page.click('.chat-item[data-chat-id="1"]'); await page.waitForSelector('#messages .msg');
  const target = page.locator('#messages .msg--in .msg__bubble').last();
  await target.click({ button: 'right' });
  ok(await page.locator('.menu').isVisible(), 'ПКМ по сообщению открывает меню реакций');
  ok(await page.locator('.menu .menu__item').count() === 12, 'в меню 12 реакций (с негативными)');
  const box = await page.locator('.menu').boundingBox(), tb = await target.boundingBox();
  ok(box.y + box.height <= tb.y + 1 && box.x >= 0 && box.x + box.width <= 1280, 'меню над сообщением и в пределах окна');
  await page.screenshot({ path: OUT + '5a-menu-desktop.png' });
  await page.keyboard.press('Escape');
  ok(await page.locator('.menu').count() === 0, 'Esc закрывает меню');
  await target.click({ button: 'right' });
  ok(await page.locator('.menu').isVisible(), 'правый клик открывает меню');
  await page.locator('.menu .menu__item', { hasText: '🔥' }).click();
  await page.waitForSelector('#messages .msg--in .reaction');
  ok(be.reqs.includes('PUT /messages/122/reactions') || be.reqs.some((r) => /PUT \/messages\/\d+\/reactions/.test(r)), 'реакция отправлена на сервер (PUT)');
  const chip = page.locator('#messages .msg--in').last().locator('.reaction');
  ok((await chip.textContent()).includes('🔥') && await chip.locator('.avatar').count() === 1, 'чип 🔥 с аватаркой под сообщением (в личном чате вместо цифры)');
  ok((await chip.getAttribute('class')).includes('is-mine'), 'своя реакция подсвечена');
  await page.waitForTimeout(100);
  ok(await page.locator('#messages .msg--in').last().locator('.reaction').count() === 1, 'после события сервера чип не дублируется');
  const msgId = +(await page.locator('#messages .msg--in').last().getAttribute('data-id'));
  t.push({ type: 'reaction', chat_id: 1, message_id: msgId, reactions: [{ emoji: '🔥', count: 2, users: [1, 2] }, { emoji: '👍', count: 1, users: [2] }] });
  await page.waitForTimeout(100);
  ok(await page.locator('#messages .msg--in').last().locator('.reaction').count() === 2, 'WS: чужая реакция появилась мгновенно');
  ok(await page.locator('#messages .msg--in').last().locator('.reaction').first().locator('.avatar').count() === 2, 'WS: у реакции две аватарки');
  await target.click({ button: 'right' });
  ok(await page.locator('.menu .menu__item.is-active').count() === 1, 'в меню подсвечена уже поставленная реакция');
  await page.keyboard.press('Escape');
  await page.locator('#messages .msg--in').last().locator('.reaction.is-mine').click();
  await page.waitForTimeout(200);
  ok(!(await page.locator('#messages .msg--in').last().locator('.reaction.is-mine').count()), 'клик по своему чипу снимает реакцию');
  await page.screenshot({ path: OUT + '5a-reactions-desktop.png' });
  ok(t.errs.length === 0, 'нет ошибок JS (реакции, десктоп) ' + JSON.stringify(t.errs));
  await t.ctx.close();

  /* ===== Реакции (телефон: долгое нажатие → шторка) ===== */
  t = await setup(browser, { viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  ({ page, be } = t);
  await login(page);
  await page.tap('.chat-item[data-chat-id="1"]'); await page.waitForSelector('#messages .msg'); await page.waitForTimeout(500);
  await page.evaluate(() => {
    const el = document.querySelector('#messages .msg--in:last-of-type .msg__bubble') || [...document.querySelectorAll('#messages .msg--in .msg__bubble')].pop();
    const r = el.getBoundingClientRect(); const t = new Touch({ identifier: 5, target: el, clientX: r.left + 20, clientY: r.top + 10 });
    el.dispatchEvent(new TouchEvent('touchstart', { touches: [t], changedTouches: [t], bubbles: true }));
  });
  await page.waitForTimeout(250);
  ok(await page.locator('#sel-title').isHidden(), 'телефон: до 450 мс выделение не включается');
  await page.waitForTimeout(400);
  ok(await page.locator('#sel-title').isVisible(), 'телефон: долгое нажатие включает режим выделения');
  await page.evaluate(() => document.querySelector('#btn-back').click());
  await page.evaluate(() => { const el = [...document.querySelectorAll('#messages .msg--in .msg__bubble')].at(-1); el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); });
  await page.waitForSelector('.menu'); await page.waitForTimeout(500);
  const mb = await page.locator('.menu').boundingBox();
  ok(Math.abs(mb.y + mb.height - 780) < 2 && mb.width >= 389, 'телефон: меню — шторка во всю ширину у нижнего края');
  ok((await page.evaluate(() => window.__vib)).length > 0, 'телефон: вибрация при долгом нажатии');
  await page.screenshot({ path: OUT + '5a-menu-mobile.png' });
  await page.locator('.menu .menu__item', { hasText: '❤️' }).tap();
  await page.waitForSelector('#messages .reaction');
  ok(await page.locator('.menu').count() === 0, 'телефон: после выбора меню закрыто');
  await t.ctx.close();

  /* ===== Голосовые сообщения ===== */
  t = await setup(browser, { viewport: { width: 1280, height: 800 }, permissions: ['microphone'] });
  ({ page, be } = t);
  await login(page);
  await page.click('.chat-item[data-chat-id="1"]'); await page.waitForSelector('#messages .msg');
  const n0 = await page.locator('#messages .msg').count();
  ok(await page.evaluate(() => typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia), 'MediaRecorder и getUserMedia доступны');

  await page.click('#btn-voice');
  await page.waitForSelector('#recorder:not([hidden])', { timeout: 4000 });
  ok(await page.locator('#composer').isHidden(), 'идёт запись: поле ввода заменено панелью записи');
  await page.waitForTimeout(1500);
  ok((await page.textContent('#rec-time')) !== '0:00', 'таймер записи идёт: ' + await page.textContent('#rec-time'));
  const heights = await page.$$eval('#rec-wave span', (els) => els.map((e) => +e.style.getPropertyValue('--h')));
  ok(heights.length >= 16 && heights.some((h) => h > 8), 'живая волна реагирует на звук (макс. ' + Math.max(...heights) + ')');
  await page.screenshot({ path: OUT + '5a-recording.png' });
  // отмена
  await page.click('#rec-cancel'); await page.waitForTimeout(300);
  ok(await page.locator('#recorder').isHidden() && await page.locator('#composer').isVisible(), 'отмена возвращает поле ввода');
  ok(be.uploads.length === 0, 'после отмены ничего не загружено');

  // запись и отправка
  await page.click('#btn-voice'); await page.waitForSelector('#recorder:not([hidden])');
  await page.waitForTimeout(1600);
  await page.click('#rec-send');
  await page.waitForSelector('#messages .msg--out .vp', { timeout: 4000 });
  ok(true, 'голосовое сразу показано в ленте (локальный плеер)');
  await page.waitForTimeout(600);
  ok(be.uploads.length === 1 && be.uploads[0].ct.startsWith('multipart/form-data'), 'файл загружен как multipart (POST /media)');
  ok(/name="file"; filename="voice-\d+\.(wav|webm|ogg|m4a)"/.test(be.uploads[0].text) && /Content-Type: audio\//.test(be.uploads[0].text), 'в форме поле file, имя voice-*.webm, тип audio/*');
  ok(/filename="voice-\d+\.wav"/.test(be.uploads[0].text) && /Content-Type: audio\/wav/.test(be.uploads[0].text), 'запись перекодирована в WAV (играет везде, точная длительность)');
  const vm = be.wsIn.find((d) => d.type === 'message' && d.media_id);
  ok(!!vm && vm.meta.duration >= 1 && vm.meta.duration < 5, 'сообщение ушло по WS с media_id и duration=' + vm?.meta?.duration);
  ok(vm.meta.wave.length === 40 && vm.meta.wave.every((v) => Number.isInteger(v) && v >= 10 && v <= 100), 'wave: 40 целых значений 10..100');
  ok(await page.locator('.msg.is-pending').count() === 0 && await page.locator('#messages .msg').count() === n0 + 1, 'подтверждение от сервера заменило временное сообщение');
  const vp = page.locator('#messages .msg--out .vp').last();
  ok(await vp.locator('.vp__bar').count() === 40, 'плеер: 40 столбиков волны');
  ok((await vp.locator('.vp__time').textContent()).match(/^0:0[1-4]$/) !== null, 'плеер: длительность ' + await vp.locator('.vp__time').textContent());
  await page.screenshot({ path: OUT + '5a-voice-sent.png' });

  // воспроизведение
  await vp.locator('.vp__btn').click();
  await page.waitForTimeout(400);
  ok(await vp.evaluate((e) => e.classList.contains('is-playing')), 'плеер: по клику играет (is-playing)');
  ok(await vp.locator('.vp__btn use').getAttribute('href') === '#i-pause', 'плеер: иконка сменилась на «пауза»');
  await page.waitForTimeout(500);
  ok(await vp.locator('.vp__bar.is-played').count() > 0, 'плеер: волна закрашивается по мере воспроизведения');
  await vp.locator('.vp__btn').click();
  await page.waitForTimeout(150);                  // событие pause приходит асинхронно
  ok(!(await vp.evaluate((e) => e.classList.contains('is-playing'))), 'плеер: пауза работает');
  ok(t.errs.length === 0, 'нет ошибок JS (голосовые) ' + JSON.stringify(t.errs));
  await t.ctx.close();

  // слишком короткая запись
  t = await setup(browser, { viewport: { width: 1280, height: 800 }, permissions: ['microphone'] });
  await login(t.page); await t.page.click('.chat-item[data-chat-id="1"]'); await t.page.waitForSelector('#messages .msg');
  await t.page.click('#btn-voice'); await t.page.waitForSelector('#recorder:not([hidden])');
  await t.page.click('#rec-send'); await t.page.waitForTimeout(500);
  ok(t.be.uploads.length === 0 && (await t.page.textContent('#toast')).includes('короткое'), 'слишком короткая запись не отправляется, показан тост');
  // смена чата во время записи отменяет её
  await t.page.click('#btn-voice'); await t.page.waitForSelector('#recorder:not([hidden])');
  await t.page.click('.chat-item[data-chat-id="2"]'); await t.page.waitForTimeout(400);
  ok(await t.page.locator('#recorder').isHidden() && t.be.uploads.length === 0, 'смена чата во время записи отменяет её');
  await t.ctx.close();

  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
