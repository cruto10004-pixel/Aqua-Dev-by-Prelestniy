// Сквозной тест фронтенда (Playwright; API и WebSocket подменены моками).
// Запуск: cd frontend && python3 -m http.server 8765 &   затем   node tests/frontend_e2e.js   (нужен пакет playwright).
// Скриншоты пишутся в tests/shots/.
const { chromium, devices } = require('playwright');
const OUT=require('path').join(__dirname,'shots')+'/'; require('fs').mkdirSync(OUT,{recursive:true});
let fails=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++; };
const iso=(m)=>new Date(Date.now()-m*60000).toISOString();

const { setup } = require('./mock.js');

(async()=>{
  const browser=await chromium.launch();
  const URL='http://127.0.0.1:8765/index.html';

  /* ===== 1. Десктоп: регистрация, чат, отправка ===== */
  let t=await setup(browser,{viewport:{width:1280,height:800}});
  let {page,be}=t;
  await page.goto(URL);
  ok(await page.locator('#app').getAttribute('data-screen')==='auth','экран входа показан без токена');

  await page.fill('#login-username','alice'); await page.fill('#login-password','wrongpass1');
  await page.click('#form-login button[type=submit]');
  await page.waitForSelector('#login-error:not([hidden])');
  ok((await page.textContent('#login-error')).includes('Неверное'),'неверный пароль — ошибка на форме входа');
  await page.click('#tab-register');
  await page.fill('#reg-username','alice'); await page.fill('#reg-password','secret123'); await page.fill('#reg-email','alice@example.com');
  await page.click('#reg-submit');
  await page.waitForSelector('#reg-code-block:not([hidden])');
  ok(await page.locator('#code-resend').isDisabled(),'повтор кода доступен не сразу (cooldown)');
  await page.fill('#reg-code','000000'); await page.click('#reg-submit');
  await page.waitForSelector('#reg-error:not([hidden])');
  ok((await page.textContent('#reg-error')).includes('Неверный код'),'неверный код — ошибка на форме');
  await page.fill('#reg-code','123456'); await page.click('#reg-submit');
  await page.waitForSelector('#chat-list .chat-item');
  ok(await page.locator('#app').getAttribute('data-screen')==='chat','после подтверждения кода открыт мессенджер');
  ok(await page.evaluate(()=>localStorage.getItem('aqua.token'))==='tok','токен сохранён');
  ok(await page.locator('#chat-list .chat-item').count()===2,'в списке 2 чата');
  ok(await page.locator('.chat').getAttribute('data-empty')==='true','до выбора чата — заглушка');

  await page.click('.chat-item[data-chat-id="1"]');
  await page.waitForSelector('#messages .msg');
  ok(await page.locator('#messages .msg').count()===50,'загружена 1-я страница истории (50)');
  ok((await page.textContent('#peer-name'))==='bob' && (await page.textContent('#peer-status'))==='в сети','шапка: bob, в сети');

  // Подгрузка при прокрутке вверх
  await page.evaluate(()=>{document.getElementById('messages').scrollTop=0});
  await page.waitForFunction(()=>document.querySelectorAll('#messages .msg').length>50,null,{timeout:3000}).catch(()=>{});
  ok(await page.locator('#messages .msg').count()===100,'подгрузка истории при прокрутке вверх (100)');

  // Enter / Shift+Enter
  await page.click('#message-input');
  await page.keyboard.type('строка 1');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('строка 2');
  ok(!be.wsIn.some(d=>d.type==='message'),'Shift+Enter не отправляет');
  ok((await page.inputValue('#message-input'))==='строка 1\nстрока 2','Shift+Enter переносит строку');
  ok((await page.locator('#composer').getAttribute('data-has-text'))==='true','кнопка «отправить» активна');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(30);
  ok(await page.locator('.msg.is-pending').count()===1,'сообщение сразу показано как «отправляется»');
  await page.waitForTimeout(300);
  const sent=be.wsIn.find(d=>d.type==='message');
  ok(sent&&sent.text==='строка 1\nстрока 2'&&sent.chat_id===1&&sent.client_id,'Enter отправляет по WebSocket с client_id');
  ok(await page.locator('.msg.is-pending').count()===0,'временное сообщение заменено подтверждением');
  ok(await page.locator('#messages .msg--out').last().textContent().then(s=>s.includes('строка 2')),'своё сообщение в ленте');
  ok(await page.inputValue('#message-input')==='' ,'поле очищено');
  ok(be.wsIn.some(d=>d.type==='typing'&&d.is_typing===true),'отправлено «печатаю»');
  ok(be.wsIn.some(d=>d.type==='typing'&&d.is_typing===false),'после отправки — «перестал печатать»');
  ok((await page.evaluate(()=>window.__vib)).length>0,'вибрация вызывалась (navigator.vibrate)');

  // Входящие события
  t.push({type:'typing',chat_id:1,user_id:2,username:'bob',is_typing:true});
  await page.waitForTimeout(100);
  ok(await page.locator('#typing-indicator').isVisible(),'индикатор «печатает…» в ленте');
  ok((await page.textContent('#peer-status')).startsWith('печатает'),'«печатает…» в шапке');
  ok((await page.textContent('.chat-item[data-chat-id="1"] .chat-item__preview'))==='печатает…','«печатает…» в списке чатов');
  const m=be.add(1,be.bob,'Отлично!',0);
  t.push({type:'message',message:m});
  await page.waitForTimeout(150);
  ok(!(await page.locator('#typing-indicator').isVisible()),'индикатор скрыт после сообщения');
  ok((await page.locator('#messages .msg--in').last().textContent()).includes('Отлично!'),'входящее сообщение появилось мгновенно');
  const before=(await page.evaluate(()=>window.__vib)).length;
  const m2=be.add(2,be.carl,'Ещё файл',0);
  t.push({type:'message',message:m2});
  await page.waitForTimeout(150);
  ok((await page.textContent('.chat-item[data-chat-id="2"] .badge'))==='1','бейдж непрочитанных у другого чата');
  ok((await page.evaluate(()=>window.__vib)).length>before,'вибрация при получении');
  ok(await page.locator('#chat-list .chat-item').first().getAttribute('data-chat-id')==='2','чат с новым сообщением поднялся наверх');
  t.push({type:'presence',user_id:2,online:false,last_seen:iso(1)});
  await page.waitForTimeout(100);
  ok((await page.textContent('#peer-status')).startsWith('был(а) в'),'presence: оффлайн → «был(а) в …»');

  // Поиск пользователей
  await page.fill('#search','ca');
  await page.waitForTimeout(500);
  ok(await page.locator('#chat-list .list-heading').count()===0,'поиск: carl уже в чатах — не дублируется в «Пользователи»');
  await page.fill('#search','da'); await page.waitForTimeout(500);
  ok(await page.locator('#chat-list .list-heading').count()===1 && await page.locator('#chat-list [data-username="dave"]').count()===1,'поиск: найденный dave показан в «Пользователи»');
  await page.fill('#search','zzz'); await page.waitForTimeout(500);
  ok((await page.textContent('#chat-list')).includes('Ничего не найдено'),'поиск: пустой результат');
  await page.screenshot({path:OUT+'e2e-desktop.png'});
  ok(t.errs.length===0,'нет ошибок JS (десктоп) '+JSON.stringify(t.errs));
  await t.ctx.close();

  /* ===== 2. Телефон: навигация, Enter, сенсорные события ===== */
  const iphone=devices['iPhone 13'];
  t=await setup(browser,{...iphone});
  ({page,be}=t);
  await page.addInitScript(()=>localStorage.setItem('aqua.token','tok'));
  await page.goto(URL);
  await page.waitForSelector('#chat-list .chat-item');
  ok(await page.locator('#app').getAttribute('data-screen')==='chat','автовход по сохранённому токену');
  await page.tap('.chat-item[data-chat-id="1"]');
  await page.waitForSelector('#messages .msg');
  ok(await page.locator('#app').getAttribute('data-chat-open')==='true','телефон: диалог открыт');
  await page.waitForTimeout(500);
  await page.screenshot({path:OUT+'e2e-mobile-chat.png'});
  await page.tap('#message-input'); await page.keyboard.type('с телефона'); await page.keyboard.press('Enter');
  ok(!be.wsIn.some(d=>d.type==='message'),'телефон: Enter — перенос строки, не отправка');
  await page.tap('#btn-send');
  await page.waitForTimeout(300);
  ok(be.wsIn.some(d=>d.type==='message'&&d.text==='с телефона'),'телефон: кнопка отправляет');
  await page.tap('#btn-back');
  await page.waitForTimeout(500);
  ok(await page.locator('#app').getAttribute('data-chat-open')==='false','кнопка «Назад» возвращает к списку');
  await page.tap('.chat-item[data-chat-id="1"]'); await page.waitForTimeout(400);
  await page.goBack(); await page.waitForTimeout(400);
  ok(await page.locator('#app').getAttribute('data-chat-open')==='false','системная «Назад» (history) закрывает диалог');
  // свайп от левого края
  await page.tap('.chat-item[data-chat-id="1"]'); await page.waitForTimeout(500);
  await page.evaluate(()=>{
    const mk=(type,x,y)=>{const t=new Touch({identifier:1,target:document.body,clientX:x,clientY:y});return new TouchEvent(type,{touches:type==='touchend'?[]:[t],changedTouches:[t],bubbles:true})};
    const el=document.querySelector('.chat__messages'); el.dispatchEvent(mk('touchstart',8,300)); el.dispatchEvent(mk('touchend',140,310));
  });
  await page.waitForTimeout(500);
  ok(await page.locator('#app').getAttribute('data-chat-open')==='false','свайп от края возвращает к списку');
  await page.screenshot({path:OUT+'e2e-mobile-list.png'});
  ok(t.errs.length===0,'нет ошибок JS (телефон) '+JSON.stringify(t.errs));
  await t.ctx.close();

  /* ===== 3. Ошибка входа и выход ===== */
  t=await setup(browser,{viewport:{width:1000,height:700}});
  ({page,be}=t);
  await page.goto(URL);
  await page.fill('#login-username','alice'); await page.fill('#login-password','nope12345');
  await page.click('#form-login button[type=submit]');
  await page.waitForSelector('#login-error:not([hidden])');
  ok((await page.textContent('#login-error')).includes('Неверное'),'ошибка неверного пароля показана');
  await page.fill('#login-password','secret123');
  await page.click('#form-login button[type=submit]');
  await page.waitForSelector('#chat-list .chat-item');
  if (await page.locator('#nav').isHidden()) await page.click('#btn-back').catch(() => {});
  await page.click('#nav-profile'); await page.waitForTimeout(300);
  ok(await page.locator('#modal-settings.is-open').count()===1,'меню открывает настройки (модальное окно)');
  ok((await page.textContent('#profile-login'))==='@alice','в профиле логин с @');
  await page.click('#btn-logout'); await page.waitForTimeout(200);
  ok(await page.locator('#app').getAttribute('data-screen')==='auth' && !(await page.evaluate(()=>localStorage.getItem('aqua.token'))),'выход: экран входа, токен удалён');
  await t.ctx.close();

  await browser.close();
  console.log(fails?`\n${fails} FAILED`:'\nALL PASSED');
})().catch(e=>{console.error(e);process.exit(1)});
