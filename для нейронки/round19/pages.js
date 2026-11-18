/* Detail routes extend state.page/renderPage. Frames retain real DOM and scroll;
   browser Back and on-screen Back use the same history entries. No timed motion
   is started here except through AquaMotion. All data stays in this demo tab. */
const AquaPages = (() => {
  const routes = new Set([...AquaSettings.routes,'peer','addcontact','media','viewer','pins','new','create','editprofile','chatsearch','members','blocked','forward','sharecontact','shareprofile','username','password']);
  let frames = [], position = 0, sequence = 0, changing = false, afterRoot = null;
  let departure = null, mediaDeparture=false;
  let rootTab = 'chats', model = {}, searchTimer, searchEpoch = 0;
  const chat = () => chats.find(c => c.id === state.chat);
  const list = () => messages[state.chat] ??= initialMessages(chat());
  const summary = m => m.text || m.file?.name || (m.voice ? 'Голосовое сообщение' : m.video ? 'Видео' : 'Фото');
  const pins = c => c.pins ??= c.pinned ? [c.pinned] : [];
  const control = (text, action, cls='soft-btn') => `<button type="button" class="${cls}" ${action==='back'?'aria-label="Назад"':''} data-page-action="${action}">${text}</button>`;
  const note = text => `<p class="page-note">${text}</p>`;
  const empty = (title, text) => `<div class="route-empty">${icon('folder')}<h2>${title}</h2><p>${text}</p></div>`;
  const input = (label, key, value='', extra='') => `<label class="field">${label}<input data-draft="${key}" value="${esc(value)}" ${extra}></label>`;
  const titleFor = {peer:'Профиль',addcontact:'Добавить контакт',media:'Медиа и файлы',viewer:'Просмотр',pins:'Закрепления',new:'Новое общение',create:'Создание',editprofile:'Изменить профиль',chatsearch:'Поиск в переписке',members:'Участники',blocked:'Заблокированные',forward:'Переслать',sharecontact:'Поделиться контактом',shareprofile:'Поделиться профилем',username:'Имя пользователя',password:'Изменить пароль'};
  function capture(frame) {
    mediaDeparture=state.page==='viewer';
    AquaMedia.suspend();
    const workspace = $('#workspace');
    document.querySelectorAll('.detail-departure').forEach(n=>n.remove());
    departure = workspace.offsetWidth ? workspace.cloneNode(true) : null;
    frame.state = {page:state.page, chat:state.chat, mobile:state.mobile};
    frame.className = workspace.className;
    frame.scroll = [workspace,...workspace.querySelectorAll('*')].map(n=>[n,n.scrollTop,n.scrollLeft]);
    frame.nodes = [...workspace.childNodes];
    frame.gesture = typeof gestureSurface !== 'undefined' && !!gestureSurface;
    frame.focus = document.activeElement;
    frame.model = model;
  }
  function place(frame) {
    Object.assign(state, frame.state);
    model = frame.model;
    const workspace = $('#workspace');
    workspace.replaceChildren(...frame.nodes);
    if(frame.gesture){const n=workspace.firstElementChild;n.style.transform="";n.style.position="";n.style.zIndex="";}
    workspace.className = frame.className;
    frame.scroll.forEach(([n,y,x])=>{n.scrollTop=y;n.scrollLeft=x;});
    app.classList.toggle('detail-open', position>0);
    AquaChrome.sync();
    $('.sidebar').inert = position>0;
    if (position===0) {
      AquaMessages.syncChat();
      if(state.page==='settings') AquaSettings.refreshHome();
      const sidebarList = $('#chat-list'), scroll = sidebarList.scrollTop;
      renderList(); sidebarList.scrollTop = scroll;
      if (state.page==='contacts') {
        $('#contacts').innerHTML=contactRows($('#contact-search')?.value||'');
        $('.page-contacts .section-label').textContent='Ваши контакты · '+chats.filter(c=>c.id>0&&!c.saved&&!c.group&&!c.channel).length;
      }
    }
    frame.focus?.isConnected && frame.focus.focus({preventScroll:true});
    if (state.page==='pins'||AquaSettings.routes.includes(state.page)) paint();
    if(state.page==='profile') AquaProfile.restore();
    if(state.page==='viewer') AquaMedia.mount(model);
    AquaMedia.restored();
  }
  function motion(back=false, step=false) {
    if(state.page==='viewer'||mediaDeparture){departure=null;mediaDeparture=false;return;}
    const surface = $('.detail-page') || $('#workspace');
    if (departure && AquaMotion.isEnabled()) {
      const old=departure;departure=null;
      old.removeAttribute('id');old.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));
      old.className='detail-departure';old.inert=true;old.setAttribute('aria-hidden','true');
      $('#workspace').append(old);
      AquaMotion.play(old,[{opacity:1,transform:'none'},{opacity:0,transform:back?'translateX(60px)':'translateX(-24px)'}],back?220:180).then(()=>old.remove());
    } else departure=null;
    if (step) AquaMotion.play(surface,[{opacity:.35,transform:`translateX(${back?-20:20}px)`},{opacity:1,transform:'none'}],220);
    else if (!back && state.page==='peer') {
      AquaMotion.play($('.peer-hero'),[{opacity:0,transform:'scale(.92)'},{opacity:1,transform:'none'}],300);
      AquaMotion.play($('.peer-actions'),[{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'none'}],240,70);
    } else if (!back && state.page==='media') {
      AquaMotion.play(surface,[{opacity:.3,clipPath:'inset(0 0 10% 0 round 24px)'},{opacity:1,clipPath:'inset(0 round 0)'}],280);
    } else if (!back && state.page==='pins') {
      document.querySelectorAll('.pin-card').forEach((n,i)=>AquaMotion.play(n,[{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'none'}],240,Math.min(i,5)*30));
    } else AquaMotion.play(surface,back ? [{opacity:.5,transform:'scale(.985)'},{opacity:1,transform:'none'}] : [{opacity:.4,transform:'translateX(28px)'},{opacity:1,transform:'none'}],280);
  }
  function go(page, data={}) {
    if (changing) return;
    if (position && state.page===page && !['viewer','create'].includes(page)) return;
    if (!position) {
      // A reload restores the browser history state but starts this in-memory
      // stack at its root. Remove only our stale page marker before pushing.
      try {
        if (history.state?.aquaPage) {
          const rootState={...history.state};
          delete rootState.aquaPage;
          history.replaceState(rootState,'');
        }
      } catch { /* Restricted file hosts keep the local-history fallback. */ }
      rootTab=currentTab();
      frames=[{id:null}]; position=0;
    }
    AquaChat.settle();
    capture(frames[position]);
    frames=frames.slice(0,position+1);
    const id=++sequence;
    frames.push({id}); position++;
    model=data;
    if(data.chatId!==undefined)state.chat=data.chatId;
    state.page=page; state.mobile=true;
    $('#modal').close(); AquaMessages.close(true);
    $('#workspace').className='workspace show-mobile page-mode';
    app.classList.add('detail-open'); $('.sidebar').inert=true;
    renderPage();
    try { history.pushState({...history.state,aquaPage:id},''); } catch { frames[position].local=true; }
    AquaChrome.sync();
    motion(false);
    $('.detail-header h1')?.focus({preventScroll:true});
  }
  function back(toRoot=false) {
    if (!position || changing) return;
    capture(frames[position]);
    if (frames[position].local) { position=toRoot?0:position-1;place(frames[position]);finish();return; }
    changing=true;
    history.go(toRoot?-position:-1);
  }
  function finish() {
    changing=false; motion(true);
    if (!position && afterRoot) {const cb=afterRoot;afterRoot=null;cb();}
  }
  function leave(cb) {afterRoot=cb;back(true);}
  function openChat(id) {
    leave(()=>{
      if (state.page==='chats' && state.mobile && state.chat===id) return;
      AquaChat.open(id,document.querySelector(`[data-action="chat:${id}"]`));
    });
  }
  function paint() { renderPage(); }
  function formError(text) { const e=$('#page-error'); if(e) {e.textContent=text;e.focus();} }
  function body(page) {
    const c=chat();
    if(page==='peer') return `<div class="peer-hero">${avatar(c)}<h2>${esc(c.name)}</h2><p>${esc(chatSubtitle(c))}</p></div><div class="peer-actions">${control(icon('chats')+'Написать','write')}${!c.group&&!c.channel&&!c.logo&&!c.saved?control(icon('plus')+(c.contact===false?'В контакты':'В контактах'),'add-peer'):''}${control(icon('send')+'Поделиться','share-profile')}</div><h3 class="section-label">О ${c.channel||c.logo?'канале':'собеседнике'}</h3><div class="detail-card"><p>${esc(c.description || (c.group?'Обсуждаем идеи и создаём Aqua вместе.':c.saved?'Ваше личное пространство для заметок.':'Маленькие моменты. Большие воспоминания.'))}</p><span class="page-note">${c.username?'@'+esc(c.username):c.id===1?'@alexandra':'Демонстрационный профиль Aqua'}</span></div><div class="group">${row('image','Медиа и файлы','Фото, видео, документы','media')}${row('pin','Закреплённые сообщения',`${pins(c).length} сообщений`,'pinned')}${c.group?row('contacts','Участники','Контакты этой демонстрации','members'):''}</div><label class="setting-row"><span>Уведомления</span><input type="checkbox" class="toggle" data-peer-mute ${!c.muted?'checked':''} aria-label="Уведомления собеседника"></label>${note('Звонки в этом прототипе не предусмотрены. Все действия выполняются только в текущей вкладке.')}`;
    if(page==='addcontact') return `<div class="route-intro"><span class="route-symbol">${icon('contacts')}</span><h2>Найдите своих</h2><p>По имени, @username или номеру</p></div><form id="lookup-form">${input('Пользователь','query',model.query||'','id="lookup-query" autocomplete="off" placeholder="Имя, @username или номер" required')}<button class="primary-btn" ${model.loading?'disabled':''}>${model.loading?'Поиск…':'Найти пользователя'}</button></form><div id="lookup-result" aria-live="polite">${lookupResult()}</div>${note('Поиск по реальным аккаунтам заработает после подключения сервера.')}`;
    if(page==='media') {
      const types=[['photo','Фото'],['video','Видео'],['file','Файлы'],['voice','Аудио']];
      const kind=model.kind||'photo';
      const items=list().map((m,i)=>({m,i})).filter(({m})=>kind==='photo'?m.photo&&!m.video:m[kind]);
      return `<div class="route-tabs" role="group" aria-label="Тип медиа">${types.map(([k,t])=>control(t,`media-tab:${k}`,kind===k?'active':'')).join('')}</div>${items.length?`<div class="${kind==='photo'||kind==='video'?'media-grid':'media-files'}">${items.map(({m,i})=>`<button class="media-tile ${kind}" data-page-action="view:${i}" aria-label="${esc(summary(m))}">${kind==='photo'||kind==='video'?`<img src="${esc(m.photoSrc||m.poster||'assets/coast.svg')}" alt="${kind==='photo'?'Фото':'Демонстрационный кадр видео'}">${kind==='video'?icon('play'):''}`:`${icon(kind==='file'?'doc':'play')}<span>${esc(summary(m))}<small>${esc(m.file?.size||m.voice?.dur||'')}</small></span>`}</button>`).join('')}</div>`:empty('Здесь пока пусто','В этом разделе появятся вложения текущей переписки.')}${note('Показаны вложения сообщений этой демонстрации.')}`;
    }
    if(page==='pins') return `${note('Закреплённые сообщения этой переписки. В демо у вас есть право закреплять и откреплять сообщения.')}<div class="pin-cards">${pins(c).filter(m=>list().includes(m)).map(m=>`<article class="detail-card pin-card"><small>${m.out?'Вы':esc(c.name)} · ${esc(m.time||'14 ноября · демо')}</small><p>${esc(summary(m))}</p><div class="actions">${control('К сообщению',`pin-jump:${list().indexOf(m)}`)}${control('Открепить',`unpin:${list().indexOf(m)}`)}</div></article>`).join('')||empty('Закреплений нет','Удерживайте сообщение в переписке и выберите «Закрепить».')}</div>`;
    if(page==='new')return `<div class="route-intro"><h2>Начните что-то хорошее</h2><p>Разговор для двоих или пространство для многих</p></div><div class="group">${row('chats','Личное сообщение','Выберите собеседника','page:pick-contact')}${row('contacts','Создать группу','Название и участники','create:group')}${row('chats','Создать канал','Идея, оформление и первая публикация','create:channel')}</div>`;
    if(page==='create') return creation();
    if(page==='editprofile') return `<form id="detail-profile-form">${input('Имя','name',model.name,'maxlength="60" required')}<label class="field">О себе<textarea data-draft="bio" maxlength="240">${esc(model.bio)}</textarea></label><button class="primary-btn">Сохранить профиль</button></form>`;
    if(page==='chatsearch')return `${input('Текст сообщения','query',model.query||'','id="detail-message-search" placeholder="Найти в переписке"')}<div id="detail-search-results" aria-live="polite">${searchResults()}</div>`;
    if(page==='members'||page==='sharecontact'||page==='pick-contact'||page==='forward'||page==='shareprofile') {
      const recipients=chats.filter(x=>page==='members'||page==='sharecontact'||page==='pick-contact'?!x.saved&&!x.channel&&!x.group&&!x.logo:x);
      return `${page==='forward'?`<div class="detail-card">${esc(summary(model.message))}</div>`:''}${page==='shareprofile'?`<div class="detail-card">Отправить профиль: ${esc(c.name)}</div>`:''}${note(page==='members'?'Демонстрационные участники группы.':'Выберите получателя в этой демонстрации.')}<div class="group">${recipients.map(x=>`<button class="chat-row" data-page-action="recipient:${x.id}">${avatar(x)}<span class="row-copy"><strong>${esc(x.name)}</strong><p>${esc(chatSubtitle(x))}</p></span>${icon('chevron')}</button>`).join('')}</div>`;
    }
    if(page==='blocked') return empty('Никто не заблокирован','Здесь будут собеседники, которым вы ограничили доступ.');
    if(page==='username'||page==='password') return `<form id="detail-account-form">${page==='username'?input('Имя пользователя','value',model.value,'pattern="[A-Za-z0-9_]{3,32}" required'):input('Текущий пароль','current',model.current||'','type="password" autocomplete="current-password" required')+input('Новый пароль','value',model.value||'','type="password" autocomplete="new-password" minlength="8" required')}<button class="primary-btn">Сохранить</button></form>${note('Это локальная демонстрация. Реальные учётные данные не изменяются; не вводите настоящий пароль.')}`;
    return '';
  }
  function lookupResult() {
    if(model.loading)return `<div class="route-empty" role="status">${icon('search')}<p>Ищем…</p></div>`;
    if(model.result) {const c=model.result;return `<div class="detail-card lookup-person">${avatar(c)}<h2>${esc(c.name)}</h2><p>@${esc(c.username)}</p>${model.added?'<p class="success" role="status">Контакт добавлен</p>':control('Добавить контакт','confirm-contact','primary-btn')}</div>`;}
    return model.searched?empty('Никого не нашли','Поиск по аккаунтам заработает после подключения сервера.'):'';
  }
  const catalog=[]; /* Round20: no backend, no fake directory */
  function searchResults() {
    const q=normalizeSearch(model.query); /* Round20: tolerant search + highlight */
    if(!q)return note('Введите текст — результаты появятся здесь.');
    const found=list().map((m,i)=>({m,i})).filter(({m})=>chatMatches({name:summary(m)},q));
    return (found.length?`<p class="page-note">Найдено: ${found.length}</p>`:'')+found.map(({m,i})=>`<button class="detail-card search-hit" data-page-action="pin-jump:${i}"><small>${m.out?'Вы':esc(chat().name)}</small><p>${highlightMatch(summary(m),q)}</p></button>`).join('')||empty('Ничего не найдено','Попробуйте другое слово.');
  }
  function creation() {
    const d=model.draft, group=d.kind==='group';
    const step=group?model.step:[0,4,1,2,5,3][model.step];
    const labels=group?['Идея','Оформление','Доступ','Проверка']:['Имя','Описание','Аватар','Доступ','Настройки','Проверка'];
    let content='';
    if(step===0)content=`<h2>${group?'Объедините своих':'Расскажите о главном'}</h2>${input('Название','name',d.name,'maxlength="60" placeholder="Название вашего пространства" required')}<label class="field">Описание<textarea data-draft="description" maxlength="300" placeholder="Что здесь будет происходить">${esc(d.description)}</textarea></label>`;
    if(step===0&&!group)content=`<h2>Расскажите о главном</h2>${input('Название','name',d.name,'maxlength="60" required')}`;
    if(step===4)content=`<h2>О чём ваш канал?</h2><label class="field">Описание<textarea data-draft="description" maxlength="300">${esc(d.description)}</textarea></label>`;
    if(step===5)content=`<h2>Настройте пространство</h2><label class="setting-row"><span>Уведомления для вас</span><input type="checkbox" data-channel-notify ${d.notify!==false?'checked':''}></label>${note('Локальная настройка. Доставка push-уведомлений требует backend.')}`;
    if(step===1)content=`<h2>Узнаваемый с первого взгляда</h2><div class="channel-avatar">${d.image?`<img src="${d.image}" alt="Аватар канала">`:`<span>${esc(d.name[0]||'A')}</span>`}</div><label class="upload-label">${icon('image')} Выбрать аватар<input type="file" id="channel-avatar" accept="image/png,image/jpeg,image/webp"></label>${d.image?control('Убрать фото','remove-avatar'):''}${note('Необязательно. PNG, JPEG или WebP до 3 МБ. Фото хранится только в памяти вкладки.')}`;
    if(step===2)content=group?`<h2>Кто будет рядом?</h2>${chats.filter(c=>!c.saved&&!c.logo&&!c.channel&&!c.group).map(c=>`<label class="setting-row"><span>${esc(c.name)}</span><input type="checkbox" data-member="${c.id}" ${d.members.includes(c.id)?'checked':''}></label>`).join('')}`:`<h2>Кому доступен канал?</h2><label class="access-card"><input type="radio" name="channel-type" value="public" ${d.type==='public'?'checked':''}><span><strong>Публичный</strong><small>Открытое пространство с именем</small></span></label><label class="access-card"><input type="radio" name="channel-type" value="private" ${d.type==='private'?'checked':''}><span><strong>Частный</strong><small>Только приглашённые участники</small></span></label>${d.type==='public'?input('Имя канала','username',d.username,'pattern="[A-Za-z][A-Za-z0-9_]{4,31}" placeholder="aqua_news" required')+note('5–32 латинских символа, первая — буква. Проверка уникальности только среди локальных чатов.'):note('Настоящие пригласительные ссылки требуют backend и не создаются.')}`;
    if(step===3)content=`<div class="peer-hero">${d.image?`<img class="review-avatar" src="${d.image}" alt="Аватар">`:`<span class="review-initial">${esc(d.name[0])}</span>`}<h2>${esc(d.name)}</h2><p>${group?`Группа · ${d.members.length+1} участников`:d.type==='public'?'@'+esc(d.username):'Частный канал'}</p></div><div class="detail-card"><h3>Всё готово?</h3><p>${esc(d.description||'Описание не задано')}</p></div>${note('Будет создано только в этой вкладке. Без публикации на сервере.')}`;
    return `<div class="step-progress" aria-label="Шаг ${model.step+1} из ${labels.length}">${labels.map((t,i)=>`<span class="${i<=model.step?'done':''}"><b>${i+1}</b>${t}</span>`).join('')}</div><form id="channel-step">${content}<p id="page-error" class="form-error" role="alert" tabindex="-1"></p><div class="step-actions">${model.step?control('Назад','step-back'):''}<button class="primary-btn">${step===3?'Создать '+(group?'группу':'канал'):'Продолжить'}</button></div></form>`;
  }
  function render() {
    if(AquaSettings.render(state.page,model))return true;
    if(state.page==='viewer'){AquaMedia.render(model);return true;}
    if(!routes.has(state.page)&&state.page!=='pick-contact')return false;
    $('#workspace').innerHTML=`<section class="page detail-page route-${state.page}"><div class="detail-inner"><header class="detail-header">${control(icon('back'),'back','icon-btn')}<h1 tabindex="-1">${state.page==='create'?(model.draft.kind==='group'?'Новая группа':'Новый канал'):titleFor[state.page]||'Выберите контакт'}</h1><span class="demo-tag">Демо</span></header><div class="detail-body">${body(state.page)}${state.page==='create'?'':'<p id="page-error" class="form-error" role="alert" tabindex="-1"></p>'}</div></div></section>`;
    return true;
  }
  function jump(m) {
    if(!list().includes(m))return toast('Сообщение уже удалено');
    leave(()=>{
      const node=document.querySelector(`[data-message="${list().indexOf(m)}"]`);
      node?.scrollIntoView({block:'center',behavior:AquaMotion.isEnabled()?'smooth':'instant'});
      AquaMotion.play(node,[{boxShadow:'0 0 0 3px var(--accent)'},{boxShadow:'0 0 0 0 transparent'}],1100);
    });
  }
  function pinMessage(c,m) { if(!pins(c).includes(m))pins(c).push(m);c.pinned=m; }
  function install() {
    window.addEventListener('popstate',()=>{
      const target=history.state?.aquaPage;
      const index=target?frames.findIndex(f=>f.id===target):0;
      if(!frames.length||index<0||index===position)return;
      capture(frames[position]);position=index;place(frames[index]);finish();
    });
    document.addEventListener('click',e=>{
      const action=e.target.closest('[data-action]')?.dataset.action;
      const pageAction=e.target.closest('[data-page-action]')?.dataset.pageAction;
      if(pageAction){e.preventDefault();e.stopImmediatePropagation();act(pageAction);return;}
      let route=action;
      if (position && action==='nav:settings') {e.preventDefault();e.stopImmediatePropagation();back();return;}
      if(e.target.closest('.chat-head > .avatar'))route='info';
      const mapping={info:'peer',pinned:'pins',media:'media',addcontact:'addcontact',new:'new',editprofile:'s-account',chatsearch:'chatsearch',members:'members',blocked:'blocked','nav:appearance':'appearance','nav:privacy':'s-privacy','nav:account':'s-account',sharecontact:'sharecontact',username:'username',password:'password','page:pick-contact':'pick-contact'};
      if(mapping[route]||route?.startsWith('create:')) {
        e.preventDefault();e.stopImmediatePropagation();
        let data={};
        if(route==='editprofile')data={...state.profile};
        if(route==='username')data={value:state.profile.username};
        if(route?.startsWith('create:'))data={step:0,draft:{kind:route.split(':')[1],name:'',description:'',image:'',type:'public',username:'',members:[]}};
        go(mapping[route]||'create',data);
      } else if(position && action && /^(nav:|chat:|auth:)/.test(action)) {
        e.preventDefault();e.stopImmediatePropagation();
        leave(()=>document.querySelector(`[data-action="${action}"]`)?.click());
      }
    },true);
    document.addEventListener('input',e=>{
      const key=e.target.dataset.draft;
      if(!position||!key)return;
      const target=state.page==='create'?model.draft:model;
      target[key]=e.target.value;
      if(state.page==='chatsearch')$('#detail-search-results').innerHTML=searchResults();
    });
    document.addEventListener('change',e=>{
      if(e.target.matches('[data-peer-mute]'))chat().muted=!e.target.checked;
      if(e.target.matches('[data-channel-notify]'))model.draft.notify=e.target.checked;
      if(e.target.name==='channel-type'){model.draft.type=e.target.value;paint();}
      if(e.target.dataset.member){const id=+e.target.dataset.member;model.draft.members=e.target.checked?[...model.draft.members,id]:model.draft.members.filter(x=>x!==id);}
      if(e.target.id==='channel-avatar') {
        const file=e.target.files[0];if(!file)return;
        if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>3*1024*1024)return formError('Выберите PNG, JPEG или WebP размером до 3 МБ.');
        const owner=model;const reader=new FileReader();reader.onload=()=>{const image=new Image();image.onload=()=>{owner.draft.image=reader.result;if(model===owner&&state.page==='create')paint();};image.onerror=()=>formError('Не удалось прочитать изображение.');image.src=reader.result;};reader.onerror=()=>formError('Не удалось открыть файл.');reader.readAsDataURL(file);
      }
    });
    document.addEventListener('submit',e=>{
      if(!e.target.closest('.detail-page'))return;
      e.preventDefault();e.stopImmediatePropagation();
      if(changing)return;
      if(e.target.id==='lookup-form') {
        clearTimeout(searchTimer);const owner=model,request=++searchEpoch;model.loading=true;model.searched=false;paint();
        searchTimer=setTimeout(()=>{if(request!==searchEpoch)return;const q=owner.query.trim().toLowerCase().replace(/^@/,'').replace(/[ ()-]/g,'');owner.result=catalog.find(c=>c.username===q||c.name.toLowerCase().includes(q)||c.phone===q);owner.loading=false;owner.searched=true;owner.added=!!chats.find(c=>c.username===owner.result?.username);if(model===owner&&state.page==='addcontact')paint();},420);
      }
      if(e.target.id==='channel-step') {
        const d=model.draft;
        if(model.step===0&&!d.name.trim())return formError('Введите название.');
        if(model.step===3&&d.kind==='channel'&&d.type==='public') {
          if(!/^[a-z][a-z0-9_]{4,31}$/i.test(d.username))return formError('Проверьте имя канала: 5–32 латинских символа.');
          if(chats.some(c=>c.username?.toLowerCase()===d.username.toLowerCase()))return formError('Это имя уже занято в демо.');
        }
        if(model.step<(d.kind==='group'?3:5)){go('create',{draft:model.draft,step:model.step+1});motion(false,true);return;}
        const c={id:Math.max(...chats.map(c=>c.id))+1,name:d.name.trim(),description:d.description,username:d.type==='public'?d.username:'',image:d.image,type:d.type,group:d.kind==='group',channel:d.kind==='channel',sub:'Создано в этой демонстрации',time:'Сейчас',color:'lilac',initial:d.name[0],subscribers:1,muted:d.notify===false,members:[...d.members]};
        chats.push(c);messages[c.id]=[];openChat(c.id);toast('Создано в демо');
      }
      if(e.target.id==='detail-profile-form') {state.profile.name=model.name.trim()||state.profile.name;state.profile.bio=model.bio;leave(()=>{if(state.page==='chats')renderChat();else renderPage();toast('Профиль сохранён');});}
      if(e.target.id==='detail-account-form') {if(state.page==='username')state.profile.username=model.value;model.current='';model.value='';back();toast('Изменение сохранено в демо');}
    },true);
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&position&&!document.querySelector('dialog[open]')){e.preventDefault();back();}});
  }
  function act(action) {
    const [key,arg]=action.split(':');
    if(key==='back')back();
    if(key==='write')openChat(state.chat);
    if(key==='add-peer'){chat().contact=true;toast('Контакт уже в вашем списке');paint();}
    if(key==='share-profile')go('shareprofile');
    if(key==='confirm-contact') {if(model.added)return;const c=model.result;if(!c)return;if(!chats.some(x=>x.username===c.username))chats.push({...c,id:Math.max(...chats.map(x=>x.id))+1,sub:'Новый контакт',time:'Сейчас',contact:true});model.added=true;paint();}
    if(key==='media-tab'){model.kind=arg;paint();}
    if(key==='view')go('viewer',{message:list()[+arg]});
    if(key==='jump')jump(model.message);
    if(key==='pin-jump')jump(list()[+arg]);
    if(key==='unpin'){chat().pins=pins(chat()).filter(m=>m!==list()[+arg]);chat().pinned=chat().pins.at(-1);paint();}
    if(key==='remove-avatar'){model.draft.image='';paint();}
    if(key==='step-back')back();
    if(key==='recipient') {
      let id=+arg;if(state.page==='members'||state.page==='pick-contact'){openChat(id);return;}
      const source=state.chat;
      const m=state.page==='forward'?model.message:null;
      if(m&&!list().includes(m))return formError('Исходное сообщение удалено.');
      messages[id]??=initialMessages(chats.find(c=>c.id===id));
      const sharedName=state.page==='sharecontact'?chats.find(c=>c.id===id).name:chat().name;
      if(state.page==='sharecontact') id=source;
      messages[id]??=initialMessages(chats.find(c=>c.id===id));
      const copy=m?structuredClone(m):{text:'👤 '+sharedName};delete copy.reactions;delete copy.reaction;copy.out=true;copy.status='sent';
      if(m)copy.reply={author:'Переслано',text:chat().name};
      messages[id].push(copy);chats.find(c=>c.id===id).sub='Вы: '+summary(copy);
      leave(()=>{if(id===source && state.page==='chats'){const text=$('#message-input')?.value||'',scroll=$('#messages')?.scrollTop||0;renderChat();$('#message-input').value=text;$('#messages').scrollTop=scroll;}renderList();toast('Отправлено в демо');});
    }
  }
  let gestureSurface=null, gestureUnder=null;
  function beginGesture(){
    if(!position||changing)return false;
    const frame=frames[position-1];
    gestureSurface=$('#workspace').firstElementChild;
    gestureUnder=document.createElement('div');gestureUnder.className='gesture-under';gestureUnder.inert=true;
    frame.nodes.forEach(n=>gestureUnder.append(n.cloneNode(true)));
    gestureUnder.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));
    $('#workspace').prepend(gestureUnder);
    gestureSurface.style.position='relative';gestureSurface.style.zIndex='1';
    return true;
  }
  function scrubBack(p){if(gestureSurface)gestureSurface.style.transform=`translateX(${p*innerWidth}px)`;}
  async function finishGesture(commit){
    const n=gestureSurface;if(!n)return;
    await AquaMotion.play(n,[{transform:n.style.transform},{transform:commit?`translateX(${innerWidth}px)`:'none'}],200);
    if(commit) {
      n.style.transform=`translateX(${innerWidth}px)`;
      back();
      const clean=()=>{if(n.isConnected){requestAnimationFrame(clean);return;}n.style.transform='';n.style.position='';n.style.zIndex='';};
      requestAnimationFrame(clean);
    } else {n.style.transform='';n.style.position='';n.style.zIndex='';}
    gestureUnder?.remove();gestureUnder=null;gestureSurface=null;
  }
  return {back,beginGesture,scrubBack,finishGesture,install,render,go,pinMessage,pins,root:()=>position?rootTab:null,active:()=>position>0};
})();
