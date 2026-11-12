// Тест: несколько аватарок, карусель, жест «потянуть вниз», удаление/«сделать основным», чужой профиль.
const { chromium } = require('playwright'); const { setup } = require('./mock.js'); const path = require('path');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const PNG = path.join(__dirname, 'fixtures', 'photo.jpg');
const addPhoto = async (page) => {
  await page.setInputFiles('#avatar-file', PNG);
  await page.waitForSelector('#modal-editor.is-open'); await page.waitForTimeout(300);
  await page.click('#editor-done');
  await page.waitForSelector('#modal-editor.is-open', { state: 'detached' }).catch(() => {});
  await page.waitForTimeout(300);
};
(async () => {
  const b = await chromium.launch();
  const t = await setup(b, { viewport: { width: 420, height: 800 }, hasTouch: true });
  const { page, be, errs } = t;
  await page.addInitScript(() => { localStorage.setItem('aqua.token', 'tok'); sessionStorage.setItem('aqua.splash.seen', '1'); });
  await page.goto('http://127.0.0.1:8765/index.html'); await page.waitForSelector('#chat-list .chat-item');
  await page.click('#nav-profile'); await page.waitForSelector('#modal-settings.is-open');
  ok(await page.locator('#avatar-viewer').count() === 0, 'карусель закрыта');
  await page.click('#profile-avatar'); await page.waitForTimeout(200);
  ok(await page.locator('#avatar-viewer').count() === 0, 'без фото карусель не открывается');

  // Добавляем два фото
  for (let i = 0; i < 2; i++) await addPhoto(page);
  ok(be.gallery.length === 2 && be.profilePatches.filter((p) => p.avatar_id).length === 2, 'два фото загружены и сделаны аватаркой');
  ok(await page.locator('#profile-avatar img.avatar__img').count() === 1, 'текущая аватарка показана');

  // Открытие по нажатию
  await page.click('#profile-avatar'); await page.waitForSelector('#avatar-viewer');
  ok(await page.locator('.avv__slide').count() === 2 && await page.locator('.avv__dots i').count() === 2, 'в карусели 2 фото и 2 индикатора');
  ok(await page.locator('#avv-more').isVisible(), 'у своего профиля есть меню ⋮');
  ok(await page.locator('#profile-view .profile__avatar').isHidden() && await page.locator('#profile-name').isVisible(), 'карусель заменила кружок, имя осталось');
  await page.screenshot({ path: 'tests/shots/avatar-viewer.png' });
  // Листание
  await page.evaluate(() => { const t = document.querySelector('.avv__track'); t.scrollTo({ left: t.clientWidth, behavior: 'instant' }); });
  await page.waitForFunction(() => document.querySelectorAll('.avv__dots i')[1].classList.contains('is-on'));
  ok(true, 'индикатор переключился на второе фото');
  await page.click('#avv-more');
  ok(await page.locator('#avv-act-main').isVisible(), 'для не основного фото есть «Сделать основным»');
  const second = be.gallery[1];
  await page.click('#avv-act-main');
  await page.waitForFunction((id) => document.querySelectorAll('.avv__slide').length === 2, second);
  ok(be.me.avatar.id === second, 'второе фото стало основным');
  // Удаление
  await page.click('#avv-more'); await page.click('#avv-act-delete');
  await page.waitForFunction(() => document.querySelectorAll('.avv__slide').length === 1);
  ok(be.gallery.length === 1, 'фото удалено на сервере, осталось одно');
  await page.click('#avv-more'); await page.click('#avv-act-delete');
  await page.waitForSelector('#avatar-viewer', { state: 'detached' });
  ok(be.gallery.length === 0 && be.me.avatar === null, 'удалено последнее: карусель закрылась, аватарки нет');

  // Жест «потянуть вниз» в своём профиле
  await addPhoto(page);
  const pull = (sel) => page.evaluate((s) => {
    const body = document.querySelector(s); const mk = (y) => new Touch({ identifier: 1, target: body, clientX: 200, clientY: y });
    body.dispatchEvent(new TouchEvent('touchstart', { touches: [mk(300)], bubbles: true }));
    body.dispatchEvent(new TouchEvent('touchmove', { touches: [mk(420)], bubbles: true }));
    body.dispatchEvent(new TouchEvent('touchend', { touches: [], bubbles: true }));
  }, sel);
  await pull('#modal-settings .modal__body');
  await page.waitForSelector('#avatar-viewer');
  ok(true, 'потянув вниз в профиле, открылась карусель');
  await page.click('#avv-close'); await page.waitForSelector('#avatar-viewer', { state: 'detached' });
  ok(await page.locator('#modal-settings.is-open').count() === 1, 'карусель свёрнута, профиль открыт');
  await page.click('#nav-chats');

  // Чужой профиль: нет меню, жест работает
  await page.click('.chat-item[data-chat-id="1"]');
  await page.waitForSelector('#messages .msg');
  await page.click('#chat-peer'); await page.waitForSelector('#modal-peer.is-open');
  await pull('#modal-peer .modal__body');
  await page.waitForSelector('#avatar-viewer');
  ok(await page.locator('.avv__slide').count() === 2, 'в чужом профиле открылась карусель из 2 фото');
  ok(await page.locator('#avv-more').count() === 0, 'у чужого профиля меню ⋮ нет');
  await page.click('#avv-close'); ok(await page.locator('#avatar-viewer').count() === 0 && await page.locator('#peer-big-avatar').isVisible(), 'крестик сворачивает карусель обратно в аватарку');
  ok(errs.length === 0, 'нет ошибок консоли: ' + JSON.stringify(errs.slice(0, 3)));
  await b.close(); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
