/* Profile and media extend the existing state, AquaPages and AquaMotion.
   No account data or media are uploaded. IDs from this demo are local only. */
const AquaProfile = (() => {
  const t=(ru,en)=>AquaSettings.t(ru,en);
  let signature='', expanded=false, busy=false, scrollAnchor=0;
  function identity(){
    if(!state.profile.localId){
      state.profile.localId='local:'+(crypto.randomUUID?.()||Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join(''));
      state.profile.id??=null; // Reserved for an authoritative backend ID.
      state.settings.profile={...state.profile};
      AquaSettings.persist();
    }
    return state.profile;
  }
  const info=(label,value)=>value?`<div class="profile-info"><strong>${esc(value)}</strong><small>${label}</small></div>`:'';
  function subscribers(c){
    const n=c?.subscribers;
    if(!Number.isFinite(n))return t('Число подписчиков неизвестно','Subscriber count unavailable');
    const plural=n>=1000?'many':new Intl.PluralRules(state.settings.language).select(n);
    return new Intl.NumberFormat(state.settings.language,{notation:'compact'}).format(n)+' '+t(({one:'подписчик',few:'подписчика'})[plural]||'подписчиков',plural==='one'?'subscriber':'subscribers');
  }
  function channel(){
    const p=state.profile;
    if(!p.channel)return `<button class="profile-channel empty-channel" data-action="settings:s-account">${icon('plus')}<span><strong>${t('Личный канал','Personal channel')}</strong><small>${t('Прикрепить в настройках аккаунта','Attach in account settings')}</small></span>${icon('chevron')}</button>`;
    const c=chats.find(c=>c.channel&&c.name===p.channel)||p.channelData;
    return `<button class="profile-channel" data-profile="channel">${avatar(c||{name:p.channel,color:'lilac'})}<span><small>${t('Личный канал · демо','Personal channel · demo')}</small><strong>${esc(c?.name||p.channel)}</strong><small>${c?subscribers(c):t('Данные канала недоступны','Channel details unavailable')}</small><p>${esc(c?.description||t('Описание пока не добавлено','No description yet'))}</p></span>${icon('chevron')}</button>`;
  }
  function music(){
    const m=state.profile.music;
    return `<section class="profile-music" aria-label="${t('Музыка','Music')}"><div class="music-cover">${m?.cover?`<img src="${esc(m.cover)}" alt="">`:icon('play')}</div><span><strong>${esc(m?.title||t('Ваша музыка','Your music'))}</strong><small>${esc(m?.artist||t('Композиция пока не прикреплена','No track attached yet'))}</small></span><button class="icon-btn" data-profile="music" ${m?.src?'':'disabled'} aria-label="${t('Воспроизвести музыку','Play music')}">${icon('play')}</button>${m?.src?`<audio class="profile-audio" preload="none" src="${esc(m.src)}"></audio>`:''}</section>`;
  }
  function render(){
    const p=identity();signature=JSON.stringify(p);
    $('#workspace').innerHTML=`<section class="page page-profile"><div class="page-inner">
      <header class="page-header"><h1>${t('Профиль','Profile')}</h1></header>
      <div class="aqua-profile-hero"><button class="profile-avatar-button" data-profile="avatar" aria-label="${t('Раскрыть аватар','Expand avatar')}" aria-expanded="false">${avatar({...p,color:'lilac'},'profile-portrait')}</button><h2>${esc([p.name,p.surname].filter(Boolean).join(' '))}</h2><p>${t('Локальный профиль','Local profile')}</p></div>
      <div class="profile-actions"><button class="soft-btn" data-profile="photo">${icon('image')}${t('Фотография','Photo')}</button><button class="soft-btn" data-action="settings:s-account">${icon('edit')}${t('Изменить','Edit')}</button><button class="soft-btn" data-action="nav:settings">${icon('settings')}${t('Настройки','Settings')}</button></div>
      <input type="file" id="profile-photo" accept="image/png,image/jpeg,image/webp" hidden>
      <div class="profile-details">${info(t('О себе','About you'),p.bio)}${info(t('Телефон','Phone'),p.phone)}${info(t('Юзернейм','Username'),'@'+p.username)}${info(t('Дата рождения','Birthday'),p.birthday)}</div>
      ${channel()}${music()}
      <div class="group">${row('saved',t('Избранное','Saved messages'),t('Заметки, сообщения и файлы','Notes, messages and files'),'chat:2','pink')}<button class="setting-row" data-profile="identity"><span class="tile-icon">${icon('shield')}</span><span class="row-copy"><strong>${t('ID пользователя','User ID')}</strong><p>${t('Системный идентификатор','System identifier')}</p></span>${icon('chevron')}</button></div>
    </div></section>`;
    expanded=false;mount();
  }
  function mount(){
    const page=$('.page-profile');if(!page)return;
    const audio=page.querySelector('.profile-audio'), musicButton=page.querySelector('[data-profile=music]');
    if(audio&&musicButton){
      const sync=()=>{musicButton.innerHTML=audio.paused?icon('play'):'Ⅱ';musicButton.setAttribute('aria-label',t(audio.paused?'Воспроизвести музыку':'Пауза',audio.paused?'Play music':'Pause'));};
      audio.onplay=audio.onpause=audio.onended=sync;sync();
    }
    page.onscroll=()=>{
      // Collapse only in response to deliberate scrolling, not layout expansion.
      if(expanded&&!busy&&page.scrollTop>scrollAnchor+56)setExpanded(false);
    };
  }
  async function setExpanded(value){
    const b=$('.profile-avatar-button');if(!b||value===expanded)return;
    const rect=b.getBoundingClientRect();expanded=value;busy=true;
    b.classList.toggle('expanded',value);b.setAttribute('aria-expanded',String(value));
    b.setAttribute('aria-label',t(value?'Открыть аватар во весь экран':'Раскрыть аватар',value?'Open full-screen avatar':'Expand avatar'));
    const end=b.getBoundingClientRect();
    await AquaMotion.play(b,[{width:rect.width+'px',height:rect.height+'px',borderRadius:value?'50%':'24px'},{width:end.width+'px',height:end.height+'px',borderRadius:value?'24px':'50%'}],340);
    busy=false;scrollAnchor=$('.page-profile')?.scrollTop||0;
  }
  function restore(){
    const page=$('.page-profile');if(!page)return;
    if(signature!==JSON.stringify(state.profile)){const y=page.scrollTop;render();$('.page-profile').scrollTop=y;}else mount();
  }
  async function copy(value){
    try{await navigator.clipboard.writeText(value);toast(t('ID скопирован','ID copied'));}
    catch{toast(t('Копирование недоступно. Выделите ID вручную.','Copy unavailable. Select the ID manually.'));}
  }
  document.addEventListener('click',e=>{
    const action=e.target.closest('[data-profile]')?.dataset.profile;if(!action)return;e.preventDefault();e.stopImmediatePropagation();
    if(action==='avatar'){
      if(busy)return;
      if(!expanded)setExpanded(true);else{
        const source=$('.profile-avatar-button');
        AquaPages.go('viewer',{avatar:true,origin:source,portrait:source.firstElementChild,rect:source.getBoundingClientRect()});
      }
    }
    if(action==='photo')$('#profile-photo').click();
    if(action==='channel'){
      let c=chats.find(c=>c.channel&&c.name===state.profile.channel);
      if(!c&&state.profile.channelData){c={...state.profile.channelData,id:Math.max(...chats.map(c=>c.id))+1};chats.push(c);messages[c.id]=[];}
      if(c)AquaPages.go('peer',{chatId:c.id});else toast(t('Сведения о канале отсутствуют в этой версии','Channel details are absent from this version'));
    }
    if(action==='identity'){
      const p=identity();modal(t('ID пользователя','User ID'),`<p>${t('Серверный ID','Server ID')}: <strong>${esc(p.id??t('ещё не назначен','not assigned yet'))}</strong></p><p class="page-note">${t('Этот ID не зависит от юзернейма. Локальный ID ниже действует только в данных этого браузера; очистка хранилища создаст новый.','The ID is independent of the username. The local ID below belongs only to this browser data; clearing storage creates a new one.')}</p><p class="identity-value">${esc(p.localId)}</p><button class="primary-btn" data-profile="copy-id">${t('Копировать локальный ID','Copy local ID')}</button>${p.id!=null?`<button class="soft-btn" data-profile="copy-server-id">${t('Копировать серверный ID','Copy server ID')}</button>`:''}`);
    }
    if(action==='copy-id')copy(state.profile.localId);
    if(action==='copy-server-id')copy(String(state.profile.id));
    if(action==='music'){
      const audio=$('.profile-audio');if(!audio)return;
      if(audio.paused)audio.play().catch(()=>toast(t('Не удалось воспроизвести аудио','Could not play audio')));
      else audio.pause();
    }
  },true);
  document.addEventListener('change',e=>{
    if(e.target.id!=='profile-photo')return;
    const file=e.target.files[0];e.target.value='';if(!file)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>3*1024*1024)return toast(t('Выберите PNG, JPEG или WebP до 3 МБ','Choose PNG, JPEG or WebP up to 3 MB'));
    const reader=new FileReader();reader.onerror=()=>toast(t('Не удалось открыть фотографию','Could not open photo'));
    reader.onload=()=>{const img=new Image();img.onerror=()=>toast(t('Повреждённое изображение','Invalid image'));img.onload=()=>{
      // Bound decoded image dimensions and localStorage use; no original upload.
      const canvas=document.createElement('canvas'),scale=Math.min(1,960/Math.max(img.width,img.height));canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
      const image=canvas.toDataURL('image/webp',.85),previous=state.settings.profile;state.settings.profile={...state.profile,image};
      if(!AquaSettings.persist()){state.settings.profile=previous;return;}state.profile.image=image;
      for(const n of document.querySelectorAll('.self-avatar > .avatar,.rail > .avatar'))n.outerHTML=avatar({...state.profile,color:'lilac'});
      if(state.page==='profile')render();toast(t('Фото сохранено на этом устройстве','Photo saved on this device'));
    };img.src=reader.result;};reader.readAsDataURL(file);
  });
  return {render,restore};
})();

const AquaMedia = (() => {
  const t=(ru,en)=>AquaSettings.t(ru,en);
  let current=null, controller=null, returnFlight=null, hideTimer=null, portraitResize=null;
  const time=value=>{const n=Number.isFinite(value)?Math.floor(value):0;return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;};
  const glyph={volume:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m11 4-6 5H2v6h3l6 5zM15 8c3 2 3 6 0 8M18 4c6 4 6 12 0 16"/></svg>',fullscreen:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5"/></svg>',pause:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>'};
  const button=(action,label,content)=>`<button type="button" class="icon-btn" data-media="${action}" aria-label="${label}">${content}</button>`;
  function render(model){
    current=model;
    const m=model.message||{};
    if(!model.avatar && !(messages[state.chat]||[]).includes(m)){
      $('#workspace').innerHTML=`<section class="page detail-page"><header class="detail-header"><button data-page-action="back" class="icon-btn">${icon('back')}</button><h1>${t('Медиа недоступно','Media unavailable')}</h1></header></section>`;return;
    }
    const photos=(messages[state.chat]||[]).filter(x=>x.photo&&!x.video);model.gallery=model.avatar?[]:photos;
    const isPhoto=model.avatar||m.photo, isVideo=!!m.video;
    $('#workspace').innerHTML=`<section class="aqua-viewer ${isVideo?'video-viewer':'photo-viewer'}" aria-label="${t(isVideo?'Просмотр видео':'Просмотр медиа',isVideo?'Video viewer':'Media viewer')}">
      <header class="viewer-toolbar">${button('back',t('Назад','Back'),icon('back'))}<span>${t(model.avatar?'Аватар':isVideo?'Видео':'Медиа',model.avatar?'Avatar':isVideo?'Video':'Media')}</span>${button('more',t('Дополнительные действия','More actions'),icon('more'))}</header>
      <div class="viewer-stage" ${isPhoto?'data-media="toggle"':''}>
      ${model.avatar?'':isVideo?`<video playsinline preload="metadata" poster="${esc(m.poster||'assets/coast.svg')}" src="${esc(m.videoSrc||'assets/aqua-demo.webm')}" data-media="toggle"></video>`:m.photo?`<img draggable="false" class="viewer-photo" src="${esc(m.photoSrc||'assets/coast.svg')}" alt="${esc(m.text||t('Фотография','Photo'))}">`:`<div class="route-empty">${icon(m.file?'doc':'play')}<h2>${esc(m.file?.name||t('Аудио','Audio'))}</h2><p>${t('Содержимое вложения отсутствует в исходном прототипе.','The original prototype has no attachment content.')}</p></div>`}
      </div>
      <div class="viewer-bottom">
      <p class="viewer-caption">${esc(model.avatar?state.profile.name:m.text||'')}${isVideo&&!m.videoSrc?` · ${t('Синтетический деморолик','Synthetic demo clip')}`:''}</p>
      <p class="viewer-error" role="alert"></p>
      ${isVideo?`<div class="video-controls"><div class="video-timeline"><output data-time="current">0:00</output><input aria-label="${t('Перемотка','Seek')}" data-video="seek" type="range" min="0" max="100" step="0.1" value="0" disabled><output data-time="duration">0:00</output></div><div class="video-buttons">${button('play',t('Воспроизвести','Play'),icon('play'))}${button('mute',t('Выключить звук','Mute'),glyph.volume)}<input type="range" data-video="volume" min="0" max="1" step="0.05" value="1" aria-label="${t('Громкость','Volume')}">${m.qualities?.length?button('quality',t('Качество видео','Video quality'),'HD'):''}${button('fullscreen',t('Полный экран','Fullscreen'),glyph.fullscreen)}</div></div>`:isPhoto?`<div class="photo-controls">${!model.avatar&&photos.length>1?`${button('prev',t('Предыдущее фото','Previous photo'),icon('back'))}<output>${photos.indexOf(m)+1} / ${photos.length}</output>${button('next',t('Следующее фото','Next photo'),icon('chevron'))}`:''}</div>`:''}
      </div>
      <div class="viewer-menu" hidden></div>
    </section>`;
    mount(model);
    AquaMotion.play($('.viewer-toolbar'),[{opacity:0,transform:'translateY(-8px)'},{opacity:1,transform:'none'}],180);
    AquaMotion.play($('.viewer-bottom'),[{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'none'}],220);
    if(!model.avatar)AquaMotion.play($('.viewer-stage'),[{opacity:.2},{opacity:1}],180);
  }
  function flight(node,from){
    const to=node.getBoundingClientRect();if(!from||!to.width)return;
    return AquaMotion.play(node,[{transform:`translate(${from.left-to.left}px,${from.top-to.top}px) scale(${from.width/to.width},${from.height/to.height})`,borderRadius:'24px'},{transform:'none',borderRadius:'0px'}],300);
  }
  function mount(model){
    if(!$('.aqua-viewer'))return;
    controller?.abort();portraitResize?.disconnect();controller=new AbortController();current=model;
    if(model.avatar&&model.portrait){
      const stage=$('.viewer-stage');stage.append(model.portrait);
      const fit=()=>{if(model.portrait.parentElement!==stage||!stage.isConnected)return;const size=Math.min(stage.clientWidth,stage.clientHeight);model.portrait.style.width=model.portrait.style.height=size+'px';};
      fit();portraitResize=new ResizeObserver(fit);portraitResize.observe(stage);
      if(model.rect){flight(model.portrait,model.rect);model.rect=null;}
    }
    const photo=$('.viewer-photo');
    if(photo){const failed=()=>{$('.viewer-error').textContent=t('Не удалось загрузить фотографию','Could not load photo');};photo.addEventListener('error',failed,{signal:controller.signal});if(photo.complete&&!photo.naturalWidth)failed();}
    const v=$('.aqua-viewer video');
    if(v){
      const on=(name,fn)=>v.addEventListener(name,fn,{signal:controller.signal});
      const update=()=>{
        if(!v.isConnected)return;
        $('[data-time=current]').textContent=time(v.currentTime);$('[data-time=duration]').textContent=time(v.duration);
        const seek=$('[data-video=seek]');seek.disabled=!Number.isFinite(v.duration)||!v.duration;if(!seek.matches(':active'))seek.value=v.duration?v.currentTime/v.duration*100:0;
        const play=$('[data-media=play]');play.innerHTML=v.paused?icon('play'):glyph.pause;play.setAttribute('aria-label',t(v.paused?'Воспроизвести':'Пауза',v.paused?'Play':'Pause'));
      };
      on('loadedmetadata',()=>{if(model.playhead) v.currentTime=Math.min(model.playhead,v.duration);update();});
      ['timeupdate','durationchange'].forEach(n=>on(n,update));
      ['pause','play','ended'].forEach(n=>on(n,()=>{update();if(v.paused)showControls(true);else scheduleHide();}));
      on('error',()=>{$('.viewer-error').textContent=t('Видео не удалось загрузить. Проверьте файл или формат.','Could not load video. Check the file or format.');showControls(true);});
      on('playing',()=>{$('.viewer-error').textContent='';});
      on('waiting',()=>{$('.viewer-error').textContent=t('Загрузка…','Loading…');});on('canplay',()=>{$('.viewer-error').textContent='';});
      const syncVolume=()=>{
        const mute=$('[data-media=mute]');
        mute.setAttribute('aria-label',t(v.muted?'Включить звук':'Выключить звук',v.muted?'Unmute':'Mute'));
        mute.setAttribute('aria-pressed',String(v.muted));mute.style.opacity=v.muted?'.5':'1';
        $('[data-video=volume]').value=v.volume;
      };
      on('volumechange',syncVolume);syncVolume();update();
    }
    let start=null;
    const stage=$('.viewer-stage');
    stage.addEventListener('dragstart',e=>e.preventDefault(),{signal:controller.signal});
    stage.addEventListener('pointerdown',e=>{start={x:e.clientX,y:e.clientY};},{signal:controller.signal});
    stage.addEventListener('pointerup',e=>{if(!start)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;start=null;if(!v&&!model.avatar&&Math.abs(dx)>50&&Math.abs(dy)<35){step(dx<0?1:-1);suppressUntil=performance.now()+350;}},{signal:controller.signal});
    stage.addEventListener('pointercancel',()=>start=null,{signal:controller.signal});
  }
  let suppressUntil=0;
  function suspend(){
    clearTimeout(hideTimer);document.querySelectorAll('video,audio').forEach(n=>n.pause());
    const v=$('.aqua-viewer video');if(v&&current)current.playhead=v.currentTime;
    if(state.page==='viewer'&&current?.avatar&&current.portrait?.isConnected){
      returnFlight={node:current.portrait,rect:current.portrait.getBoundingClientRect()};
      portraitResize?.disconnect();
      current.portrait.style.width=current.portrait.style.height='';
      current.origin.append(current.portrait);
    }
    controller?.abort();
    if(document.fullscreenElement?.classList.contains('aqua-viewer'))document.exitFullscreen().catch(()=>{});
  }
  function restored(){if(returnFlight?.node.isConnected){flight(returnFlight.node,returnFlight.rect);returnFlight=null;}}
  function showControls(show){const viewer=$('.aqua-viewer');if(!viewer)return;viewer.classList.toggle('controls-hidden',!show);viewer.querySelectorAll('.viewer-toolbar,.viewer-bottom').forEach(n=>n.inert=!show);if(show)scheduleHide();}
  function scheduleHide(){clearTimeout(hideTimer);const v=$('.aqua-viewer video');if(v&&!v.paused)hideTimer=setTimeout(()=>{if(!$('.viewer-menu:not([hidden])')&&!$('.viewer-bottom :focus-visible'))showControls(false);},2600);}
  function step(delta){
    const items=current.gallery;if(items.length<2)return;
    current.message=items[(items.indexOf(current.message)+delta+items.length)%items.length];
    render(current);
  }
  async function play(){const v=$('.aqua-viewer video');if(!v)return;if(!v.paused){v.pause();return;}try{await v.play();}catch{$('.viewer-error').textContent=t('Воспроизведение недоступно','Playback unavailable');}}
  document.addEventListener('click',async e=>{
    const el=e.target.closest('[data-media]');if(!el)return;e.preventDefault();e.stopImmediatePropagation();const action=el.dataset.media;if(performance.now()<suppressUntil)return;
    const v=$('.aqua-viewer video');
    if(action==='back')AquaPages.back();
    if(action==='toggle'){const menu=$('.viewer-menu');if(!menu.hidden)menu.hidden=true;else showControls($('.aqua-viewer').classList.contains('controls-hidden'));}
    if(action==='play')await play();
    if(action==='mute'&&v)v.muted=!v.muted;
    if(action==='prev'||action==='next')step(action==='next'?1:-1);
    if(action==='fullscreen'){
      try{if(document.fullscreenElement)await document.exitFullscreen();else if($('.aqua-viewer').requestFullscreen)await $('.aqua-viewer').requestFullscreen();else throw Error();}catch{toast(t('Полноэкранный режим недоступен в этом браузере','Fullscreen is unavailable in this browser'));}
    }
    if(action==='more'||action==='quality'){
      const menu=$('.viewer-menu');const wasOpen=!menu.hidden;menu.hidden=wasOpen;if(wasOpen)return;
      menu.innerHTML=action==='quality'?`<strong>${t('Качество','Quality')}</strong>${current.message.qualities.map((q,i)=>`<button data-media="quality-${i}">${esc(q.label)}</button>`).join('')}`:`${!current.avatar?`<button data-page-action="jump">${t('К сообщению','Go to message')}</button>`:''}<button data-media="back">${t('Закрыть просмотр','Close viewer')}</button>`;
      AquaMotion.enter(menu,'dialog');showControls(true);
    }
    if(action.startsWith('quality-')&&v){
      const q=current.message.qualities?.[Number(action.slice(8))];if(!q)return;
      const pos=v.currentTime,playing=!v.paused;current.message.videoSrc=q.src;
      v.addEventListener('loadedmetadata',()=>{v.currentTime=Math.min(pos,v.duration);if(playing)play();},{once:true,signal:controller.signal});v.src=q.src;v.load();$('.viewer-menu').hidden=true;
    }
  },true);
  document.addEventListener('input',e=>{
    const v=$('.aqua-viewer video');if(!v)return;
    if(e.target.dataset.video==='seek'&&Number.isFinite(v.duration))v.currentTime=Number(e.target.value)*v.duration/100;
    if(e.target.dataset.video==='volume'){v.volume=Number(e.target.value);v.muted=false;}
  });
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&$('.viewer-menu:not([hidden])')){e.preventDefault();e.stopImmediatePropagation();$('.viewer-menu').hidden=true;return;}
    if(!$('.aqua-viewer'))return;
    if(e.key==='Tab')showControls(true);
    if(e.target.matches('input,button'))return;
    if(e.code==='Space'&&$('.aqua-viewer video')){e.preventDefault();play();}
    if(e.key==='ArrowLeft'&&!$('.aqua-viewer video'))step(-1);
    if(e.key==='ArrowRight'&&!$('.aqua-viewer video'))step(1);
  },true);
  document.addEventListener('click',e=>{if(e.target.closest('[data-action^="nav:"]'))document.querySelectorAll('.profile-audio').forEach(a=>a.pause());},true);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)document.querySelectorAll('video,audio').forEach(v=>v.pause());});
  return {render,mount,suspend,restored};
})();
