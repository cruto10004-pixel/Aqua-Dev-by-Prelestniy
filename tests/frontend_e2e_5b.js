// Сквозной тест Этапа 5B: файловый менеджер, редактор фото/видео, CSP.
// Запуск: cd frontend && python3 -m http.server 8765 &   затем   node tests/frontend_e2e_5b.js
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
const { setup } = require('./mock.js');
const OUT = path.join(__dirname, 'shots') + '/'; fs.mkdirSync(OUT, { recursive: true });
const FX = path.join(__dirname, 'fixtures') + '/';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const URL = 'http://127.0.0.1:8765/index.html';
// Та же политика, что отдаёт backend (config.CONTENT_SECURITY_POLICY)
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const t = await setup(browser, { viewport: { width: 1100, height: 800 } });
  const { page, be, errs } = t;
  await page.addInitScript(() => {
    window.__csp = []; window.__fd = [];
    const ap = FormData.prototype.append; FormData.prototype.append = function (k, v, n) { window.__fd.push([k, v && v.size, v && v.type]); return ap.apply(this, arguments); };
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI));
    localStorage.setItem('aqua.token', 'tok');
  });
  await page.route(URL, async (r) => { const resp = await r.fetch(); await r.fulfill({ response: resp, headers: { ...resp.headers(), 'content-security-policy': CSP } }); });
  await page.goto(URL); await page.waitForSelector('#chat-list .chat-item');
  await page.click('.chat-item[data-chat-id="1"]'); await page.waitForSelector('#messages .msg');

  /* ===== Файловый менеджер ===== */
  await page.click('#btn-attach');
  await page.waitForSelector('#modal-files.is-open');
  await page.waitForSelector('#fm-body .folder-tile');
  ok(await page.locator('.folder-tile').count() === 4, 'менеджер: 4 папки (Фото/Видео/Голосовые/Файлы)');
  ok(await page.locator('#fm-body .sidebar__empty').count() === 1, 'менеджер: пустое состояние «недавних»');
  ok(await page.locator('#file-input').isHidden(), 'системный input скрыт (используется только кнопкой «С устройства»)');
  await page.screenshot({ path: OUT + '5b-files-empty.png' });

  /* ===== Фото ===== */
  await page.setInputFiles('#file-input', FX + 'photo.jpg');
  await page.waitForSelector('#modal-editor.is-open');
  await page.waitForFunction(() => document.getElementById('editor-canvas').width > 10);
  ok(await page.locator('#modal-files.is-open').count() === 0, 'менеджер закрылся, открылся редактор');
  ok(await page.getAttribute('#modal-editor', 'data-mode') === 'photo', 'режим редактора: фото');
  ok(await page.locator('#photo-tools .icon-tile').count() === 5, 'инструменты фото: 5 кнопок');
  ok(await page.locator('#editor-video').isHidden(), 'видео-элемент скрыт в режиме фото');
  await page.waitForTimeout(400);   // окно доанимировалось, размеры сцены стабильны
  const w0 = await page.evaluate(() => document.getElementById('editor-canvas').width);
  const h0 = await page.evaluate(() => document.getElementById('editor-canvas').height);
  await page.click('[data-tool="rotate"]');
  await page.waitForTimeout(150);
  const w1 = await page.evaluate(() => document.getElementById('editor-canvas').width);
  ok(w1 !== w0 || h0 === w0, 'поворот меняет пропорции холста');
  ok(await page.locator('#editor-undo').isEnabled(), 'после действия доступна «отмена»');
  await page.click('#editor-undo'); await page.waitForTimeout(100);
  const w2 = await page.evaluate(() => document.getElementById('editor-canvas').width);
  ok(w2 === w0, 'отмена возвращает исходный вид (' + w0 + ' → ' + w1 + ' → ' + w2 + ')');
  // кисть
  await page.click('[data-tool="brush"]');
  const box = await page.locator('#editor-canvas').boundingBox();
  await page.mouse.move(box.x + 30, box.y + 30); await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 90, { steps: 8 }); await page.mouse.up();
  ok(await page.locator('#editor-undo').isEnabled(), 'кисть: штрих записан в историю');
  // кадрирование
  await page.click('[data-tool="crop"]');
  ok(await page.locator('#crop-box').isVisible(), 'кадрирование: рамка видна');
  const cb = await page.locator('#crop-box').boundingBox();
  await page.mouse.move(cb.x + cb.width - 2, cb.y + cb.height - 2); await page.mouse.down();
  await page.mouse.move(cb.x + cb.width - 80, cb.y + cb.height - 60, { steps: 5 }); await page.mouse.up();
  const cb2 = await page.locator('#crop-box').boundingBox();
  ok(cb2.width < cb.width, 'кадрирование: рамку можно уменьшить за угол');
  // фильтр
  await page.click('[data-tool="filter"]');
  await page.locator('.editor__sub .chip').nth(1).click();
  await page.fill('#editor-caption', 'Подпись к фото');
  await page.screenshot({ path: OUT + '5b-photo-editor.png' });
  await page.click('#editor-done');
  await page.waitForSelector('#modal-editor.is-open', { state: 'detached' }).catch(() => {});
  await page.waitForSelector('#messages .msg--out img.msg__media', { timeout: 5000 });
  ok(be.uploads.at(-1)?.meta?.mime === 'image/jpeg', 'на сервер ушёл JPEG (результат Canvas → Blob → File → FormData)');
  ok(/^photo-.*\.jpg$/.test(be.uploads.at(-1)?.meta?.name || ''), 'имя файла photo-<время>.jpg');
  await page.waitForFunction(() => !document.querySelector('#messages .msg.is-pending'));
  ok((await page.locator('#messages .msg--out .msg__text').last().textContent()) === 'Подпись к фото', 'подпись показана под фото');
  const sent = be.wsIn.filter((d) => d.type === 'message').at(-1);
  ok(sent.media_id && sent.cover_id == null, 'сообщение ссылается на media_id, без обложки');

  /* ===== Видео ===== */
  await page.click('#btn-attach'); await page.waitForSelector('#modal-files.is-open');
  await page.setInputFiles('#file-input', FX + 'clip.webm');
  await page.waitForSelector('#modal-editor.is-open');
  await page.waitForFunction(() => { const v = document.getElementById('editor-video'); return v.readyState >= 1 && Number.isFinite(v.duration); });
  ok(await page.getAttribute('#modal-editor', 'data-mode') === 'video', 'режим редактора: видео');
  ok(await page.locator('#editor-canvas').isHidden() && await page.locator('#editor-video').isVisible(), 'в видео-режиме виден <video>, canvas скрыт');
  const dur = await page.evaluate(() => document.getElementById('editor-video').duration);
  ok(dur > 3.5 && dur < 4.5, 'длительность видео определена: ' + dur.toFixed(2));
  // Двигаем правую ручку к ~50% дорожки
  const tr = await page.locator('.trim__track').boundingBox();
  const hb = await page.locator('.trim__handle').nth(1).boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await page.mouse.down();
  await page.mouse.move(tr.x + tr.width * 0.5, hb.y + hb.height / 2, { steps: 6 }); await page.mouse.up();
  const rangeTxt = await page.locator('.trim__times b').textContent();
  ok(/^0:0[1-2]/.test(rangeTxt), 'после обрезки длина ≈2 с: ' + rangeTxt);
  // ручка начала нельзя заводить за конец
  const sb = await page.locator('.trim__handle').nth(0).boundingBox();
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2); await page.mouse.down();
  await page.mouse.move(tr.x + tr.width * 0.95, sb.y + sb.height / 2, { steps: 6 }); await page.mouse.up();
  const r = await page.evaluate(() => [...document.querySelectorAll('.trim__times span')].map((n) => n.textContent));
  const toSec = (s) => { const [m, x] = s.split(':'); return +m * 60 + +x; };
  ok(toSec(r[1]) - toSec(r[0]) >= 0.49, 'минимальная длина отрезка 0.5 с соблюдается');
  // вернём начало в 0.5с и выберем обложку
  await page.mouse.move(sb.x + 2, sb.y + 5); // no-op
  await page.focus('.trim__handle >> nth=0');
  for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowLeft');
  ok(toSec(await page.locator('.trim__times span').first().textContent()) < 0.2, 'ручку начала можно двигать стрелками (доступность)');
  await page.locator('.cover__range').fill('500');
  ok(/Кадр на/.test(await page.locator('.cover .editor__hint').textContent()), 'выбор обложки обновляет подпись кадра');
  await page.screenshot({ path: OUT + '5b-video-editor.png' });
  const before = be.uploads.length;
  await page.click('#editor-done');
  ok(await page.locator('#editor-busy').isVisible(), 'во время обработки виден индикатор');
  await page.waitForSelector('#messages .msg--out video.msg__media', { timeout: 20000 });
  const ups = be.uploads.slice(before).map((u) => u.meta);
  ok(ups.length === 2, 'загружено 2 файла: видео и обложка');
  ok(ups.some((u) => u.kind === 'video') && ups.some((u) => u.mime === 'image/jpeg' && u.name === 'cover.jpg'), 'видео + cover.jpg');
  const vid = Object.values(be.media).filter((x) => x.kind === 'video').at(-1);
  const durOf = (md) => { // вырезаем файл из multipart и спрашиваем ffprobe
    const b = md.bytes, f = path.join(OUT, 'probe-' + md.id + '.bin');
    fs.writeFileSync(f, b.subarray(b.indexOf('\r\n\r\n') + 4, b.lastIndexOf('\r\n--')));
    return parseFloat(require('child_process').execSync(`ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 ${f}`).toString()) / 25;
  };
  const trimmedSec = durOf(vid);
  ok(trimmedSec > 1 && trimmedSec < 3, 'обрезанное видео ≈2 с вместо 4 с (по кадрам: ' + trimmedSec.toFixed(2) + ' с)');
  await page.waitForFunction(() => !document.querySelector('#messages .msg.is-pending'));
  ok(be.wsIn.filter((d) => d.type === 'message').at(-1).cover_id > 0, 'сообщение содержит cover_id');
  ok(!!(await page.locator('#messages video.msg__media').last().getAttribute('poster')), 'у видео в чате есть постер (обложка)');
  await page.screenshot({ path: OUT + '5b-chat-media.png' });

  /* ===== Видео без обрезки: без перекодирования ===== */
  const n0 = be.uploads.length;
  await page.click('#btn-attach'); await page.waitForSelector('#modal-files.is-open');
  await page.setInputFiles('#file-input', FX + 'clip.webm');
  await page.waitForFunction(() => { const v = document.getElementById('editor-video'); return v.readyState >= 1 && Number.isFinite(v.duration); });
  await page.waitForTimeout(300);
  await page.click('#editor-done');
  await page.waitForFunction((n) => document.querySelectorAll('#messages video.msg__media').length >= n, 2, { timeout: 8000 });
  await page.waitForFunction(() => !document.querySelector('#messages .msg.is-pending'));
  // Размер файла, положенного в FormData, смотрим в браузере (перехват append): надёжнее, чем разбор multipart в моке
  const fd = await page.evaluate(() => window.__fd);
  const lastVideo = fd.filter((x) => x[2] === 'video/webm').at(-1);
  ok(lastVideo[1] === fs.statSync(FX + 'clip.webm').size, 'без обрезки видео уходит как есть, байт-в-байт (' + lastVideo[1] + ')');

  /* ===== Отмена и менеджер с данными ===== */
  await page.click('#btn-attach'); await page.waitForSelector('#modal-files.is-open');
  await page.waitForSelector('#fm-body .media-cell');
  const counts = await page.locator('.folder-tile small').allTextContents();
  ok(counts[0] === '3' && counts[1] === '2' && counts.length === 4, 'счётчики папок: фото=3 (фото + 2 обложки), видео=2: ' + counts.join(','));
  ok(await page.locator('#fm-body .media-cell').count() >= 3, 'недавние загрузки показаны сеткой');
  await page.locator('.folder-tile').first().click();
  await page.waitForSelector('#fm-back:not([hidden])');
  ok(await page.locator('#fm-title').textContent() === 'Фото', 'вход в папку меняет заголовок');
  await page.click('#fm-back');
  await page.waitForSelector('#fm-body .folder-tile');
  ok(await page.locator('#fm-back').isHidden(), 'возврат в корень');
  // выбор уже загруженного фото → редактор
  await page.locator('#fm-body .media-cell img').first().click();
  await page.waitForSelector('#modal-editor.is-open');
  await page.waitForFunction(() => document.getElementById('editor-canvas').width > 10);
  ok(true, 'выбор из «недавних» открывает редактор');
  const msgsBefore = await page.locator('#messages .msg--out').count();
  await page.keyboard.press('Escape');
  await page.waitForSelector('#modal-editor.is-open', { state: 'detached' }).catch(() => {});
  await page.waitForTimeout(300);
  ok(await page.locator('#messages .msg--out').count() === msgsBefore, 'закрытие редактора без «Готово» ничего не отправляет');

  /* ===== Обычный файл — сразу, без редактора ===== */
  const n1 = be.uploads.length;
  fs.writeFileSync(FX + 'note.txt', 'hello');
  await page.click('#btn-attach'); await page.waitForSelector('#modal-files.is-open');
  await page.setInputFiles('#file-input', FX + 'note.txt');
  await page.waitForSelector('#messages .msg--out a.msg__file', { timeout: 5000 });
  ok(be.uploads.length === n1 + 1 && be.uploads.at(-1).meta.kind === 'file', 'текстовый файл отправлен без редактора как вложение');

  /* ===== Мобильный вид ===== */
  const m = await setup(browser, { viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
  await m.page.addInitScript(() => localStorage.setItem('aqua.token', 'tok'));
  await m.page.goto(URL); await m.page.waitForSelector('#chat-list .chat-item');
  await m.page.tap('.chat-item[data-chat-id="1"]'); await m.page.waitForSelector('#messages .msg');
  await m.page.tap('#btn-attach'); await m.page.waitForSelector('#modal-files.is-open');
  await m.page.setInputFiles('#file-input', FX + 'photo.jpg');
  await m.page.waitForSelector('#modal-editor.is-open');
  await m.page.waitForFunction(() => document.getElementById('editor-canvas').width > 10);
  await m.page.waitForTimeout(400);
  const noScroll = await m.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  ok(noScroll, 'мобильный: нет горизонтальной прокрутки');
  const foot = await m.page.locator('.editor__footer').boundingBox();
  ok(foot.y + foot.height <= 780 + 1, 'мобильный: кнопка «Готово» в пределах экрана');
  await m.page.screenshot({ path: OUT + '5b-editor-mobile.png' });
  ok(m.errs.length === 0, 'мобильный: нет ошибок консоли ' + JSON.stringify(m.errs));

  /* ===== CSP ===== */
  const viol = await page.evaluate(() => window.__csp);
  ok(viol.length === 0, 'CSP: нарушений нет ' + JSON.stringify(viol));
  ok(errs.length === 0, 'нет ошибок страницы/консоли ' + JSON.stringify(errs));

  await browser.close();
  console.log(fails ? `\nПРОВАЛЕНО: ${fails}` : '\nВсе проверки 5B пройдены');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
