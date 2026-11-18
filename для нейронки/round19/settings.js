/* Settings extend AquaPages; preferences live in the existing state object. */
const AquaSettings=(()=>{
 const routes=['s-account','s-edit','s-privacy','s-access','s-security','s-devices','s-qr','s-notifications','s-data','s-download','s-storage','s-traffic','s-energy','s-language','s-appearance'];
 const pairs={account:['Аккаунт','Account'],privacy:['Конфиденциальность и безопасность','Privacy and security'],devices:['Устройства','Devices'],notifications:['Уведомления','Notifications'],data:['Данные и память','Data and storage'],energy:['Энергосбережение','Power saving'],language:['Язык','Language'],appearance:['Настройки чатов','Chat settings'],storage:['Использование памяти','Storage usage'],traffic:['Использование трафика','Data usage']};
 const access=[['phone','Номер телефона','Phone number'],['online','Последнее посещение и онлайн','Last seen and online'],['photo','Фото профиля','Profile photo'],['forward','Пересылка сообщений','Message forwarding'],['calls','Звонки','Calls'],['voice','Голосовые сообщения','Voice messages'],['messages','Личные сообщения','Direct messages'],['birthday','Дата рождения','Birthday'],['gifts','Подарки','Gifts']];
 const security=[['password','Облачный пароль','Cloud password'],['autodelete','Автоудаление сообщений','Auto-delete messages'],['passcode','Код-пароль','Passcode'],['keyboard','Клавиатура регистрации','Registration keyboard'],['email','Почта для входа','Sign-in email']];
 let ready=false, current={}, draft=null;
 const t=(ru,en)=>state.settings?.language==='en'?en:ru;
 function init(){if(ready)return;ready=true;let saved={};try{saved=JSON.parse(localStorage.getItem('aqua-preferences')||'{}')}catch{}state.settings={language:'ru',...saved};if(saved.profile)Object.assign(state.profile,saved.profile);apply();}
 function persist(){try{localStorage.setItem('aqua-preferences',JSON.stringify(state.settings));return true}catch{toast(t('Не удалось сохранить: хранилище недоступно','Could not save: storage unavailable'));return false}}
 function apply(){AquaMotion.setEnabled(!state.settings.power && state.toggles.animations!==false);document.documentElement.classList.toggle('low-power',!!state.settings.power);document.documentElement.lang=state.settings.language;}
 const note=()=>`<p class="page-note">${t('Локальный прототип. Изменения не отправляются на сервер.','Local prototype. Changes are not sent to a server.')}</p>`;
 const link=(label,route,sub='')=>row(({'s-account':'profile','s-privacy':'shield','s-devices':'doc','s-notifications':'bell','s-data':'folder','s-appearance':'palette','s-language':'chats'})[route]||'settings',label,sub,`settings:${route}`);
 const field=(label,key,value='',type='text')=>`<label class="field">${label}<input name="${key}" type="${type}" value="${esc(value)}" ${key==='name'?'required':''}></label>`;
 const select=(label,key,options)=>`<label class="field">${label}<select data-setting="${key}">${options.map(([v,ru,en])=>`<option value="${v}" ${String(state.settings[key]??options[0][0])===String(v)?'selected':''}>${t(ru,en)}</option>`).join('')}</select></label>`;
 const check=(label,key,def=true)=>`<label class="setting-row"><span>${label}</span><input class="toggle" type="checkbox" data-setting="${key}" ${(state.settings[key]??def)?'checked':''}></label>`;
 const button=(label,action,cls='soft-btn')=>`<button type="button" class="${cls}" data-settings-action="${action}">${label}</button>`;
 function shell(title,body){$('#workspace').innerHTML=`<section class="page detail-page"><div class="detail-inner"><header class="detail-header"><button class="icon-btn" data-page-action="back" aria-label="${t('Назад','Back')}">${icon('back')}</button><h1>${title}</h1><span class="demo-tag">${t('Демо','Demo')}</span></header><div class="detail-body settings-body">${body}</div></div></section>`;}
 const accessOptions=[['all','Все','Everyone'],['contacts','Мои контакты','My contacts'],['none','Никто','Nobody']];
 function accessControl(key){const chosen=accessOptions.find(o=>o[0]===state.settings[key])||accessOptions[0];return `<div class="field">${t('Кому разрешено','Who is allowed')}<button class="access-trigger" type="button" data-access-open="${key}" aria-haspopup="dialog"><span>${t(chosen[1],chosen[2])}</span>${icon('chevron')}</button></div>`;}
 document.addEventListener('click',e=>{
  const trigger=e.target.closest('[data-access-open]'),choice=e.target.closest('[data-access-choice]');
  if(!trigger&&!choice)return;e.preventDefault();e.stopImmediatePropagation();
  if(trigger){const key=trigger.dataset.accessOpen;modal(t('Кому разрешено','Who is allowed'),`<div class="access-options" role="radiogroup" aria-label="${t('Кому разрешено','Who is allowed')}">${accessOptions.map(([v,ru,en])=>`<button type="button" role="radio" aria-checked="${(state.settings[key]||'all')===v}" data-access-key="${key}" data-access-choice="${v}"><span>${t(ru,en)}</span><i aria-hidden="true"></i></button>`).join('')}</div>`);$('#modal').classList.add('access-sheet');$('#modal [aria-checked="true"]').focus();}
  else{const key=choice.dataset.accessKey,previous=state.settings[key];state.settings[key]=choice.dataset.accessChoice;if(!persist()){state.settings[key]=previous;return;}const trigger=document.querySelector(`[data-access-open="${key}"]`);if(trigger){const option=accessOptions.find(o=>o[0]===state.settings[key]);trigger.querySelector('span').textContent=t(option[1],option[2]);}closeModal();}
 },true);
 document.addEventListener('keydown',e=>{if(!e.target.matches('[data-access-choice]')||!['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const items=[...$('#modal').querySelectorAll('[data-access-choice]')],i=items.indexOf(e.target);items[e.key==='Home'?0:e.key==='End'?2:(i+(['ArrowDown','ArrowRight'].includes(e.key)?1:2))%3].focus();});
 document.addEventListener('DOMContentLoaded',()=>$('#modal').addEventListener('close',()=>$('#modal').classList.remove('access-sheet')));
 function homeProfile(){
  const fullName=[state.profile.name,state.profile.surname].filter(Boolean).join(' ');
  const user=state.profile.username ? '@'+state.profile.username : t('Юзернейм не указан','Username not set');
  const phone=state.profile.phone || t('Телефон не указан','Phone not set');
  return `<button type="button" class="settings-profile-summary" data-action="settings:s-account" aria-label="${t('Редактировать аккаунт','Edit account')}">
    ${avatar({name:fullName||'Aqua',color:'lilac',image:state.profile.image})}
    <span class="settings-profile-copy"><strong>${esc(fullName)}</strong><span>${esc(user)}</span><span>${esc(phone)}</span></span>
    <span class="settings-profile-edit" aria-hidden="true">${icon('edit')}</span>
  </button>`;
 }
 function refreshHome(){
  const old=document.querySelector('.settings-profile-summary');
  if(old)old.outerHTML=homeProfile();
  const lang=document.querySelector('[data-settings-value="language"]');if(lang)lang.textContent=state.settings.language==='en'?'English':'Русский';
  const power=document.querySelector('[data-settings-value="energy"]');if(power)power.textContent=state.settings.power?t('Вкл.','On'):t('Выкл.','Off');
 }
 function home(){
  init();
  const icons={account:'profile',appearance:'palette',privacy:'shield',devices:'doc',notifications:'bell',data:'folder',energy:'energy',language:'language'};
  const categoryIcon=(name)=>name==='energy'?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 5 13h6l-1 9 9-12h-6z"/></svg>':name==='language'?'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 5 5 13 0 18M12 3c-5 5-5 13 0 18"/></svg>':icon(name);
  const categories=['account','appearance','privacy','devices','notifications','data','energy','language'];
  $('#workspace').innerHTML=`<div class="page page-settings"><div class="page-inner"><header class="page-header"><h1>${t('Настройки','Settings')}</h1></header>
    ${homeProfile()}
    <label class="search">${icon('search')}<input id="settings-search" aria-label="${t('Найти настройки','Search settings')}" placeholder="${t('Найти настройки…','Search settings…')}"></label>
    <div class="settings-list">${categories.map(k=>`<button type="button" class="setting-row settings-category" data-action="settings:s-${k}"><span class="tile-icon">${categoryIcon(icons[k])}</span><span class="row-copy"><strong>${t(...pairs[k])}</strong></span>${k==='language'||k==='energy'?`<span class="settings-value" data-settings-value="${k}"></span>`:''}${icon('chevron')}</button>`).join('')}</div>
  </div></div>`;
  refreshHome();
 }
 function accountForm(){
  draft??={...state.profile};
  const channels=chats.filter(c=>c.channel&&c.subscribers===1);
  // A selected channel may outlive a page render; never silently clear it.
  const retained=draft.channel&&!channels.some(c=>c.name===draft.channel)
    ? `<option value="${esc(draft.channel)}" selected>${esc(draft.channel)}</option>` : '';
  return `<form id="settings-profile" class="account-form">
    <section class="account-section"><h2>${t('Ваше имя','Your name')}</h2>
      <div class="account-fields">${field(t('Имя','First name'),'name',draft.name)}${field(t('Фамилия','Last name'),'surname',draft.surname)}</div>
    </section>
    <section class="account-section"><h2>${t('О себе','About you')}</h2>
      <label class="field"><span class="visually-hidden">${t('О себе','About you')}</span><textarea name="bio" rows="3" maxlength="240" placeholder="${t('Расскажите немного о себе…','Tell us a little about yourself…')}">${esc(draft.bio||'')}</textarea></label>
    </section>
    <section class="account-section"><h2>${t('Информация о вас','Your information')}</h2>
      <div class="account-fields">${field(t('Номер телефона','Phone number'),'phone',draft.phone,'tel')}${field(t('Юзернейм','Username'),'username',draft.username)}${field(t('Дата рождения','Birthday'),'birthday',draft.birthday,'date')}</div>
    </section>
    <section class="account-section"><h2>${t('Личный канал','Personal channel')}</h2>
      <label class="field"><span class="account-helper">${t('Канал будет отображаться в вашем профиле','The channel appears on your profile')}</span><select name="channel"><option value="">${t('Не выбран','Not selected')}</option>${retained}${channels.map(c=>`<option value="${esc(c.name)}" ${draft.channel===c.name?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label>
    </section>
    <p class="form-error" id="settings-error" role="alert"></p>
    <div class="account-form-actions"><button class="primary-btn" type="submit">${t('Сохранить','Save')}</button>${button(t('Отмена','Cancel'),'cancel-edit')}</div>
  </form>`;
 }
 function render(route,model){init();if(!routes.includes(route))return false;current=model;let body='',title=t(...(pairs[route.slice(2)]||['Настройки','Settings']));
 if(route==='s-account'||route==='s-edit'){
  if(route==='s-edit') title=t('Редактирование аккаунта','Edit account');
  body=accountForm();
  if(route==='s-account') body+=`<section class="account-section account-management"><h2>${t('Аккаунты','Accounts')}</h2>
    <div class="account-current">${avatar({name:state.profile.name,color:'lilac',image:state.profile.image})}<span><strong>${esc([state.profile.name,state.profile.surname].filter(Boolean).join(' '))}</strong><small>${t('Текущий локальный аккаунт','Current local account')}</small></span></div>
    ${button(t('Добавить аккаунт','Add account'),'add-account','account-add')}
    <p class="page-note">${t('Добавление и переключение реальных аккаунтов требует авторизации на сервере.','Adding and switching real accounts requires server authentication.')}</p></section>
    <div class="account-logout">${button(t('Выйти из аккаунта','Sign out'),'logout','soft-btn danger')}</div>`;
 }
 if(route==='s-privacy')body=`<h3>${t('Безопасность аккаунта','Account security')}</h3><div class="group">${security.map(([k,ru,en])=>link(t(ru,en),'s-security:'+k)).join('')}${link(t('Чёрный список','Blocked users'),'blocked')}</div><p class="page-note">${t('Ключ доступа — в будущем','Passkeys — coming later')}</p><h3>${t('Приватность','Privacy')}</h3><div class="group">${access.map(([k,ru,en])=>link(t(ru,en),'s-access:'+k)).join('')}</div><p class="page-note">${t('Сохранённая музыка — в будущем','Saved music — coming later')}</p>`;
 if(route==='s-access'){const a=access.find(a=>a[0]===model.key);title=t(a[1],a[2]);body=accessControl('access-'+model.key)+`<h3>${t('Исключения: разрешить','Exceptions: allow')}</h3>`+chats.filter(c=>c.online||c.id===4).map(c=>check(esc(c.name),'exception-'+model.key+'-'+c.id,false)).join('')+note();}
 if(route==='s-security'){const item=security.find(a=>a[0]===model.key);title=t(item[1],item[2]);body=note();if(model.key==='autodelete')body+=select(t('Период','Period'),'autodelete',[['off','Выключено','Off'],['1','1 день','1 day'],['7','7 дней','7 days'],['30','30 дней','30 days']])+`<p>${t('Серверное удаление сообщений не выполняется.','Server message deletion is not performed.')}</p>`;else if(model.key==='keyboard')body+=select(t('Раскладка','Layout'),'keyboard',[['system','Системная','System'],['numeric','Цифровая','Numeric']])+`<p>${t('Выбор применяется к полю кода регистрации. Системную клавиатуру приложение не заменяет.','Applied to the registration code input. The app cannot replace the system keyboard.')}</p>`;else body+=`<p>${t('Безопасная настройка требует backend. Секреты здесь не сохраняются.','Secure setup requires a backend. Secrets are not stored here.')}</p>`;}
 if(route==='s-devices')body=`${note()}${link(t('Подключить устройство по QR','Link device with QR'),'s-qr')}<h3>${t('Текущий сеанс','Current session')}</h3><div class="detail-card">${t('Этот браузер · локальный прототип','This browser · local prototype')}</div><h3>${t('Демонстрационные сеансы','Demo sessions')}</h3>${state.settings.ended?`<p>${t('Других сеансов нет','No other sessions')}</p>`:`<div class="detail-card">Aqua Desktop · ${t('Демо, активность неизвестна','Demo, activity unknown')}${button(t('Завершить','Terminate'),'end-session')}</div>${button(t('Завершить остальные сеансы','Terminate other sessions'),'end-session')}`}`;
 if(route==='s-qr'){title=t('Подключение устройства','Link a device');body=`<div class="route-empty">${icon('shield')}<h2>${t('Ожидается сервер подключения','Pairing server required')}</h2><p>${t('QR-код должен содержать одноразовый серверный токен. Фиктивный код не создаётся.','A QR code must contain a one-time server token. No fake pairing code is generated.')}</p></div>`;}
 if(route==='s-notifications')body=note()+['personal','groups','channels'].map((k,i)=>`<h3>${t(['Личные чаты','Группы','Каналы'][i],['Private chats','Groups','Channels'][i])}</h3>${check(t('Уведомления','Notifications'),'notify-'+k)}${check(t('Предпросмотр текста','Message previews'),'preview-'+k)}${check(t('Вибрация','Vibration'),'vibrate-'+k)}${select(t('Звук','Sound'),'sound-'+k,[['aqua','Aqua','Aqua'],['silent','Без звука','Silent']])}`).join('');
 if(route==='s-data')body=`<div class="group">${link('Wi-Fi','s-download:wifi')}${link(t('Мобильная сеть','Mobile data'),'s-download:mobile')}${link(t(...pairs.storage),'s-storage')}${link(t(...pairs.traffic),'s-traffic')}</div>`;
 if(route==='s-download'){title=model.key==='wifi'?'Wi-Fi':t('Мобильная сеть','Mobile data');body=note()+['photo','video','file','audio'].map((k,i)=>check(t(['Изображения','Видео','Файлы','Аудио'][i],['Images','Video','Files','Audio'][i]),model.key+'-'+k,false)).join('')+select(t('Для чатов','For chats'),model.key+'-scope',[['all','Все','All'],['contacts','Контакты','Contacts'],['none','Ни для каких','None']]);}
 if(route==='s-storage')body=note()+`<div class="detail-card">${['Изображения / Images','Видео / Video','Файлы / Files','Аудио / Audio'].map(x=>`<p>${t(x.split(' / ')[0],x.split(' / ')[1])}: 0 B</p>`).join('')}<small>${t('Управляемого медиакэша в прототипе нет. Кэш браузера здесь не измеряется.','The prototype has no managed media cache. Browser cache is not measured here.')}</small></div>${button(t('Очистить кэш','Clear cache'),'clear-cache')}`;
 if(route==='s-traffic')body=`<div class="route-empty"><h2>${t('Статистика недоступна','Statistics unavailable')}</h2><p>${t('Браузер не предоставляет приложению надёжное разделение трафика Wi-Fi и мобильной сети.','The browser does not provide reliable per-network traffic totals.')}</p></div>`;
 if(route==='s-energy')body=check(t('Энергосбережение','Power saving'),'power',false)+`<p>${t('Отключает анимации интерфейса и размытие стекла.','Disables interface animations and glass blur.')}</p>`+check(t('Анимированные стикеры','Animated stickers'),'stickers',true)+`<p class="page-note">${t('В текущем наборе стикеров нет анимации.','The current sticker set contains no animations.')}</p>`;
 if(route==='s-language')body=select(t('Язык приложения','App language'),'language',[['ru','Русский','Русский'],['en','English','English']]);
 if(route==='s-appearance'){const previous=state.page;state.page='appearance';renderPage();state.page=previous;const content=$('.page-inner');body=content.innerHTML.replace(/<header[\s\S]*?<\/header>/,'');}
 shell(title,body);return true;
 }
 function confirmAction(action){modal(t('Подтвердите действие','Confirm action'),`<p>${t('Действие применяется только к локальному прототипу.','This action applies only to the local prototype.')}</p>${button(t('Отмена','Cancel'),'dismiss')}${button(t('Подтвердить','Confirm'),'confirm-'+action,'primary-btn')}`);}
 document.addEventListener('click',e=>{const action=e.target.closest('[data-settings-action]')?.dataset.settingsAction;const route=e.target.closest('[data-action^="settings:"]')?.dataset.action.slice(9);if(!action&&!route)return;e.preventDefault();e.stopImmediatePropagation();init();if(route){const [p,key]=route.split(':');AquaPages.go(p,{key});return;}if(action==='edit')AquaPages.go('s-edit');else if(action==='cancel-edit'){draft=null;if(state.page==='s-account')render(state.page,current);else AquaPages.back();}else if(action==='dismiss')closeModal();else if(action==='add-account')toast(t('Требуется сервер авторизации','Authentication server required'));else if(action.startsWith('confirm-')){closeModal();const key=action.slice(8);if(key==='logout'){draft=null;AquaPages.back(true);setTimeout(()=>{state.page='auth';auth('login');},350);}else{if(key==='end-session')state.settings.ended=true;persist();render(state.page,current);toast(t('Готово в локальном прототипе','Done in the local prototype'));}}else confirmAction(action);},true);
 document.addEventListener('input',e=>{if(e.target.closest('#settings-profile')){draft??={...state.profile};draft[e.target.name]=e.target.value;}});
 document.addEventListener('submit',e=>{if(e.target.id!=='settings-profile')return;e.preventDefault();e.stopImmediatePropagation();const data=Object.fromEntries(new FormData(e.target));if(!data.name.trim()||!/^[\w.]{3,32}$/.test(data.username)||data.birthday>new Date().toISOString().slice(0,10)){ $('#settings-error').textContent=t('Проверьте имя, юзернейм (3–32 символа) и дату рождения.','Check name, username (3–32 characters) and birthday.');return;}const previous=state.settings.profile;const channel=chats.find(c=>c.channel&&c.name===data.channel);
state.settings.profile={...state.profile,...data,channelData:channel?{...channel}:data.channel===state.profile.channel?state.profile.channelData:null};if(!persist()){state.settings.profile=previous;return;}Object.assign(state.profile,state.settings.profile);draft=null;if(state.page==='s-account')render(state.page,current);else AquaPages.back();toast(t('Сохранено','Saved'));},true);
 document.addEventListener('change',e=>{if(e.target.closest('#settings-profile')&&e.target.name){draft??={...state.profile};draft[e.target.name]=e.target.value;}const key=e.target.dataset.setting;if(!key)return;const previous=state.settings[key];state.settings[key]=e.target.type==='checkbox'?e.target.checked:e.target.value;if(!persist()){state.settings[key]=previous;if(e.target.type==='checkbox')e.target.checked=!e.target.checked;else e.target.value=previous;return;}apply();if(key==='language'){render(state.page,current);AquaLocale.apply();}});
 return {routes,home,refreshHome,render,init,t,persist};
})();
