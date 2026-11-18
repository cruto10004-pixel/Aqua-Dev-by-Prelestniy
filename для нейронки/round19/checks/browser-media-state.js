/* CodeRabbit generated. Synthetic browser data only; start at a root screen. */
(async()=>{
 const wait=(n=400)=>new Promise(r=>setTimeout(r,n)),out=[];
 const ok=(v,m)=>{if(!v)throw Error(m);out.push(m);};
 document.querySelector('[data-action="nav:profile"]').click();await wait();
 state.profile.music={title:'Lifecycle test',artist:'Synthetic',src:'assets/aqua-demo.webm'};AquaProfile.render();
 const audio=document.querySelector('audio'),button=document.querySelector('[data-profile=music]');
 audio.muted=true;await audio.play();await wait();ok(button.getAttribute('aria-label')==='Пауза','audio play updates button');
 AquaPages.go('s-account');await wait();AquaPages.back();await wait();
 ok(document.querySelector('audio')===audio&&audio.paused&&button.getAttribute('aria-label')==='Воспроизвести музыку','paused music restored with play button');
 await audio.play();audio.pause();await wait();ok(button.getAttribute('aria-label')==='Воспроизвести музыку','external pause updates music');
 delete state.profile.music;AquaProfile.render();
 document.querySelector('[data-action="nav:chats"]').click();await wait();AquaChat.open(1,document.querySelector('[data-action="chat:1"]'));await wait();
 AquaPages.go('viewer',{message:messages[1].find(m=>m.video)});await wait(700);
 const v=document.querySelector('video'),mute=document.querySelector('[data-media=mute]'),volume=document.querySelector('[data-video=volume]');
 mute.click();await wait();ok(v.muted&&mute.getAttribute('aria-pressed')==='true','mute state synchronized');
 volume.value=.3;volume.dispatchEvent(new Event('input',{bubbles:true}));await wait();
 ok(!v.muted&&mute.getAttribute('aria-pressed')==='false'&&mute.getAttribute('aria-label')==='Выключить звук','volume unmutes and updates button');
 v.volume=.6;v.muted=true;await wait();ok(volume.value==='0.6'&&mute.getAttribute('aria-pressed')==='true','external volumechange synchronized');
 document.querySelector('.aqua-viewer').classList.add('controls-hidden');document.querySelector('.viewer-bottom').inert=true;
 volume.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true}));
 ok(!document.querySelector('.aqua-viewer').classList.contains('controls-hidden')&&!document.querySelector('.viewer-bottom').inert,'Tab from input reveals controls');
 AquaPages.back();await wait();return out;
})()
