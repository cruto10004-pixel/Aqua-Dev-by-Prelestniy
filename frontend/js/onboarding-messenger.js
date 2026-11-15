// Local messenger demo; messages never leave this page.
(() => {
  const $ = selector => document.querySelector(selector);
  const root = $('.messenger');
  const list = $('#demo-chat-list');
  const conversation = $('#conversation');
  const messageList = $('#message-list');
  const input = $('#message-input');
  const menu = $('#conversation-popover');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  // The round illustration is cropped from the supplied SlimChat profile screenshot.
  const seed = () => [
    {id:'aqua',name:'Команда Aqua',color:'#38b3ad',unread:2,messages:[{text:'Привет! Рады видеть вас в Aqua 🌊',time:'10:24'},{text:'Здесь можно попробовать интерфейс и написать первое сообщение.',time:'10:25'}]},
    {id:'nika',name:'Ника Морская',color:'#8c81da',unread:1,messages:[{text:'Давай увидимся у моря?',time:'Вчера'}]},
    {id:'artem',name:'Артём',color:'#559dcf',messages:[{text:'Отлично, договорились!',time:'Вчера',out:true}]},
    {id:'friends',name:'Наши люди',color:'#d384a9',messages:[{text:'Аня: Всем хорошего дня ✨',time:'Пн'}]},
    {id:'volna',name:'Волна',image:'assets/onboarding/reference-avatar.png',messages:[{text:'Поймали немного вдохновения',time:'Пн'}]}
  ];
  let chats = seed(), selected = null, page = 'chats', closingTimer;
  let compact = false, motion = true, profileBio = '';
  function avatar(node, chat) {
    node.replaceChildren();
    node.style.setProperty('--avatar-color',chat.color || '#405875');
    if (chat.image) { const img = document.createElement('img'); img.src = chat.image; img.alt = ''; node.append(img); }
    else node.textContent = chat.name.slice(0,1).toUpperCase();
  }
  function lastMessage(chat) { return chat.messages[chat.messages.length - 1]; }
  function renderChats() {
    const query = $('#chat-search').value.trim().toLocaleLowerCase('ru');
    const visible = chats.filter(chat => chat.name.toLocaleLowerCase('ru').includes(query));
    list.replaceChildren(); $('#search-empty').hidden = visible.length !== 0;
    $('#chat-counter').textContent = chats.length+' диалогов';
    visible.forEach(chat => {
      const row=document.createElement('button'); row.type='button';row.className='demo-chat-row'+(selected===chat.id?' is-selected':'');
      row.setAttribute('aria-label','Открыть чат '+chat.name);
      const icon=document.createElement('span');icon.className='chat-avatar';avatar(icon,chat);
      const lines=document.createElement('span');lines.className='chat-lines';
      const name=document.createElement('strong');name.textContent=chat.name;
      const preview=document.createElement('span');preview.className='chat-preview';const last=lastMessage(chat);preview.textContent=(last.out?'Вы: ':'')+last.text;
      lines.append(name,preview);
      const meta=document.createElement('span');meta.className='chat-meta';const time=document.createElement('span');time.className='chat-time';time.textContent=last.time;meta.append(time);
      if(chat.unread){const badge=document.createElement('span');badge.className='chat-unread';badge.textContent=chat.unread;badge.setAttribute('aria-label',chat.unread+' непрочитанных');meta.append(badge);}
      row.append(icon,lines,meta);row.addEventListener('click',()=>openChat(chat.id));list.append(row);
    });
  }
  function renderMessages(chat, sent = false) {
    messageList.replaceChildren();const day=document.createElement('div');day.className='day-label';day.textContent='Демонстрационный диалог';messageList.append(day);
    chat.messages.forEach((message, index)=>{
      const bubble=document.createElement('div');bubble.className='message'+(message.out?' outgoing':'')+(sent && index < chat.messages.length - 1 ? ' settled' : '');
      const body=document.createElement('span');body.textContent=message.text;const time=document.createElement('time');time.textContent=message.time;bubble.append(body,time);messageList.append(bubble);
    });
    messageList.scrollTop=messageList.scrollHeight;
  }
  function openChat(id) {
    clearTimeout(closingTimer);const chat=chats.find(item=>item.id===id);if(!chat)return;
    selected=id;chat.unread=0;$('#conversation-title').textContent=chat.name;avatar($('#conversation-avatar'),chat);input.value='';$('#message-send').disabled=true;
    menu.hidden=true;$('#conversation-menu').setAttribute('aria-expanded','false');conversation.classList.remove('is-closing');conversation.hidden=false;renderMessages(chat);renderChats();
  }
  function closeChat() {
    if(conversation.hidden)return;
    menu.hidden=true;$('#conversation-menu').setAttribute('aria-expanded','false');conversation.classList.add('is-closing');
    const finish=()=>{conversation.hidden=true;conversation.classList.remove('is-closing');selected=null;renderChats();};
    if(reduced.matches||!motion)finish();else closingTimer=setTimeout(finish,260);
  }
  function setPage(next) {
    if(!conversation.hidden)closeChat();
    page=next;document.querySelectorAll('[data-page]').forEach(p=>p.hidden=p.dataset.page!==next);
    document.querySelectorAll('[data-tab]').forEach(b=>{const active=b.dataset.tab===next;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
    if(next==='profile')renderProfile();
    $('.messenger-content').scrollTop=0;
  }
  function renderProfile() {
    const name=$('#home-name').textContent.trim();const username=$('#home-username').textContent.trim();
    $('#profile-handle').textContent=username;$('#messenger-bio').textContent=profileBio || 'Расскажите немного о себе.';
    if(!name)$('#home-name').textContent='Пользователь Aqua';
  }
  $('#chat-search').addEventListener('input',renderChats);
  document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>setPage(button.dataset.tab)));
  $('#conversation-back').addEventListener('click',closeChat);
  $('#conversation-menu').addEventListener('click',()=>{menu.hidden=!menu.hidden;$('#conversation-menu').setAttribute('aria-expanded',String(!menu.hidden));});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!root.hidden&&!$('#profile-dialog').open){if(!menu.hidden){menu.hidden=true;$('#conversation-menu').setAttribute('aria-expanded','false');}else closeChat();}});
  input.addEventListener('input',()=>{$('#message-send').disabled=!input.value.trim();});
  $('#message-form').addEventListener('submit',event=>{
    event.preventDefault();const text=input.value.trim();const chat=chats.find(item=>item.id===selected);if(!text||!chat)return;
    const time=new Intl.DateTimeFormat('ru',{hour:'2-digit',minute:'2-digit'}).format(new Date());chat.messages.push({text,time,out:true});chats=[chat,...chats.filter(item=>item!==chat)];input.value='';$('#message-send').disabled=true;renderMessages(chat, true);renderChats();input.focus({preventScroll:true});
  });
  $('#setting-compact').addEventListener('click',event=>{compact=!compact;root.classList.toggle('compact',compact);event.currentTarget.setAttribute('aria-checked',String(compact));});
  $('#setting-motion').addEventListener('click',event=>{motion=!motion;root.classList.toggle('no-motion',!motion);event.currentTarget.setAttribute('aria-checked',String(motion));});
  $('#profile-edit').addEventListener('click',()=>{$('#edit-name').value=$('#home-name').textContent;$('#edit-bio').value=profileBio;$('#edit-error').textContent='';$('#profile-dialog').showModal();});
  $('#profile-cancel').addEventListener('click',()=>$('#profile-dialog').close());
  $('#profile-edit-form').addEventListener('submit',event=>{event.preventDefault();const name=$('#edit-name').value.trim();if(!name){$('#edit-error').textContent='Укажите имя.';return;}$('#home-name').textContent=name;profileBio=$('#edit-bio').value.trim();renderProfile();$('#profile-dialog').close();});
  $('#restart').addEventListener('click',()=>{clearTimeout(closingTimer);chats=seed();selected=null;conversation.hidden=true;conversation.classList.remove('is-closing');$('#chat-search').value='';compact=false;motion=true;root.classList.remove('compact','no-motion');$('#setting-compact').setAttribute('aria-checked','false');$('#setting-motion').setAttribute('aria-checked','true');setPage('chats');renderChats();});
  // Onboarding sets the profile before it reveals the messenger.
  new MutationObserver(()=>{if(!root.hidden) { profileBio=$('#home-back').textContent === 'На стартовый экран' ? '' : $('#bio').value.trim(); setPage('chats'); renderChats(); }}).observe(root,{attributes:true,attributeFilter:['hidden']});
  renderChats();
})();
