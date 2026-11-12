// Тест: выбор фото профиля открывает редактор с круглой маской; фото двигается, масштабируется; результат — квадрат.
const { chromium } = require('playwright'); const { setup } = require('./mock.js'); const path = require('path');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const PHOTO = path.join(__dirname, 'fixtures', 'photo.jpg');
(async () => {
  const b = await chromium.launch();
  const t = await setup(b, { viewport: { width: 420, height: 800 }, hasTouch: true });
  const { page, be, errs } = t;
  await page.addInitScript(() => {
    localStorage.setItem('aqua.token', 'tok'); sessionStorage.setItem('aqua.splash.seen', '1');
    const orig = FormData.prototype.append;
    FormData.prototype.append = function (k, v, ...r) { if (v instanceof File) (window.__uploads = window.__uploads || []).push(v); return orig.call(this, k, v, ...r); };
  });
  await page.goto('http://127.0.0.1:8765/index.html'); await page.waitForSelector('#chat-list .chat-item');
  await page.click('#nav-profile'); await page.waitForSelector('#modal-settings.is-open');
  await page.setInputFiles('#avatar-file', PHOTO);
  await page.waitForSelector('#modal-editor.is-open'); await page.waitForTimeout(400);
  ok(await page.getAttribute('#modal-editor', 'data-avatar') === 'true' && (await page.textContent('#editor-title')) === 'Фото профиля', 'открылся редактор в режиме «Фото профиля»');
  ok(await page.locator('#avatar-mask').isVisible(), 'круглая маска показана');
  ok(await page.locator('.icon-tile[data-tool="crop"]').isHidden() && await page.locator('.icon-tile[data-tool="brush"]').isVisible(), 'остальные инструменты редактора на месте, прямоугольной обрезки нет');
  const tr = () => page.evaluate(() => document.querySelector('#editor-canvas').style.transform);
  const t0 = await tr();
  await page.screenshot({ path: 'tests/shots/avatar-editor.png' });
  ok(await page.locator('#avatar-zoom').count() === 0, 'ползунка и подписи нет');
  const box = await page.locator('#editor-stage').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -600); await page.waitForTimeout(100);
  const t1 = await tr();
  ok(t1 !== t0 && /scale\(/.test(t1), 'колесо увеличивает масштаб');
  // перемещение пальцем
  await page.evaluate(({ x, y }) => {
    const st = document.querySelector('#editor-stage'); const mk = (dx) => ({ pointerId: 7, bubbles: true, clientX: x + dx, clientY: y, pointerType: 'touch', isPrimary: true });
    st.dispatchEvent(new PointerEvent('pointerdown', mk(0))); st.dispatchEvent(new PointerEvent('pointermove', mk(-40))); st.dispatchEvent(new PointerEvent('pointerup', mk(-40)));
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  const t2 = await tr();
  ok(t2 !== t1, 'перетаскивание двигает фото (' + t2 + ')');
  // отдаляем до предела: масштаб не меньше «покрыть маску»
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 5; i++) await page.mouse.wheel(0, 2000);
  await page.waitForTimeout(100);
  const minScale = parseFloat((await tr()).match(/scale\(([\d.]+)\)/)[1]);
  await page.mouse.wheel(0, 2000); await page.waitForTimeout(100);
  ok(parseFloat((await tr()).match(/scale\(([\d.]+)\)/)[1]) === minScale, 'меньше «покрывает круг» отдалить нельзя');
  await page.mouse.wheel(0, -800); await page.waitForTimeout(100);
  await page.click('#editor-done');
  await page.waitForFunction(() => (window.__uploads || []).length === 1);
  const dims = await page.evaluate(async () => { const f = window.__uploads[0]; const bm = await createImageBitmap(f); return [bm.width, bm.height, f.type]; });
  ok(dims[0] === dims[1] && dims[0] >= 256 && dims[2] === 'image/jpeg', `загружен квадратный JPEG ${dims[0]}×${dims[1]}`);
  await page.waitForTimeout(300);
  ok(be.me.avatar && be.gallery.length === 1, 'аватарка сохранена');
  // Отмена не загружает
  await page.setInputFiles('#avatar-file', PHOTO); await page.waitForSelector('#modal-editor.is-open'); await page.waitForTimeout(300);
  await page.click('#modal-editor .btn-icon[data-close-modal]'); await page.waitForTimeout(400);
  ok(be.gallery.length === 1, 'закрытие редактора без «Готово» ничего не загружает');
  // Обычное фото из чата — без маски
  ok(await page.getAttribute('#modal-editor', 'data-avatar') === 'false', 'режим аватарки выключается после закрытия');
  ok(errs.length === 0, 'нет ошибок консоли: ' + JSON.stringify(errs.slice(0, 3)));
  await b.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
