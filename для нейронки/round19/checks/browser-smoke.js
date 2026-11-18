(async()=>{
 const wait=(n=400)=>new Promise(r=>setTimeout(r,n)),ok=(v,m)=>{if(!v)throw Error(m);out.push(m)},out=[];
 const click=async s=>{const el=document.querySelector(s);if(!el)throw Error('Missing '+s);el.click();await wait();};
 if(!sessionStorage.getItem('aqua18-backup'))sessionStorage.setItem('aqua18-backup',JSON.stringify(localStorage.getItem('aqua-preferences')));
 window.aquaErrors=[];addEventListener('error',e=>aquaErrors.push(e.message));addEventListener('unhandledrejection',e=>aquaErrors.push(String(e.reason)));
 if(state.page!=='profile')await click('[data-action="nav:profile"]');
 const original=$('.profile-avatar-button .avatar'),id=state.profile.localId;
 ok(id.startsWith('local:')&&state.profile.id===null,'local and server IDs separate');
 await click('[data-profile=avatar]');ok($('.profile-avatar-button').classList.contains('expanded'),'round to square');
 await click('[data-profile=avatar]');ok(state.page==='viewer'&&$('.viewer-stage .avatar')===original,'same portrait DOM in fullscreen');
 await click('[data-media=back]');ok(state.page==='profile'&&$('.profile-avatar-button .avatar')===original,'same portrait restored');
 $('.page-profile').scrollTop=140;await wait();ok(!$('.profile-avatar-button').classList.contains('expanded'),'scroll collapses avatar');
 await click('[data-profile=identity]');ok($('#modal').textContent.includes(id),'ID visible');await click('[data-action=close]');
 const channel={id:990,name:'Demo channel',channel:true,subscribers:1,description:'Local test',color:'lilac'};chats.push(channel);state.profile.channel=channel.name;state.profile.channelData=channel;AquaProfile.render();
 await click('[data-profile=channel]');ok(state.page==='peer'&&state.chat===990,'profile channel opens');await click('[data-page-action=back]');ok(state.page==='profile','channel returns to profile');
 ok(!!$('.profile-music')&&$('[data-profile=music]').disabled,'music honest empty state');
 await click('[data-action="settings:s-account"]');const input=$('[name=username]');input.value='new.user';input.dispatchEvent(new Event('input',{bubbles:true}));$('#settings-profile').requestSubmit();await wait();ok(state.profile.localId===id&&state.profile.username==='new.user','ID stable after username edit');await click('[data-page-action=back]');ok($('.profile-details').textContent.includes('new.user'),'profile refresh on back');
 await click('[data-action="nav:settings"]');await click('[data-action="settings:s-privacy"]');
 for(const key of ['phone','online','photo','forward','calls','voice','messages','birthday','gifts']){
   await click(`[data-action="settings:s-access:${key}"]`);ok(!document.querySelector('.settings-body select'),'no native privacy select '+key);
   await click('[data-access-open]');ok($('#modal').open&&document.querySelectorAll('.access-options [role=radio]').length===3,'custom radio sheet '+key);
   await click('[data-access-choice=contacts]');ok(state.settings['access-'+key]==='contacts'&&!$('#modal').open,'privacy persists '+key);
   await click('[data-page-action=back]');
 }
 await click('[data-page-action=back]');await click('[data-action="nav:chats"]');
 AquaChat.open(1,document.querySelector('[data-action="chat:1"]'));await wait();
 const items=messages[1];const photo=items.find(m=>m.photo),video=items.find(m=>m.video);items.push({photo:true,photoSrc:'assets/aqua.png',text:'second test photo'});
 AquaPages.go('viewer',{message:photo});await wait();ok(!!$('.viewer-photo')&&!$('video'),'photo viewer');await click('[data-media=next]');ok($('.viewer-photo').src.endsWith('aqua.png'),'gallery next');await click('[data-media=back]');ok(state.page==='chats','photo back to chat');
 AquaPages.go('viewer',{message:video});await wait(800);const v=$('video');ok(v.readyState>=1&&v.duration>7,'video metadata');ok(aquaErrors.length===0,'no runtime errors');return out;
})()
