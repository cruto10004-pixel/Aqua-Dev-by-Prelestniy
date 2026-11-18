(async()=>{
const w=(n=380)=>new Promise(r=>setTimeout(r,n)),out=[],ok=(v,s)=>{if(!v)throw Error(s);out.push(s)},click=async s=>{document.querySelector(s).click();await w();};
await click('[data-action="nav:settings"]');await click('[data-action="settings:s-privacy"]');await click('[data-action="settings:s-access:phone"]');
const toggle=document.querySelector('[data-setting^=exception]');toggle.checked=true;toggle.dispatchEvent(new Event('change',{bubbles:true}));ok(state.settings[toggle.dataset.setting]===true,'exception saved');
await click('[data-access-open]');const previous=state.settings['access-phone'],set=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw Error('test quota')};await click('[data-access-choice=none]');Storage.prototype.setItem=set;ok(state.settings['access-phone']===previous&&$('#modal').open,'storage failure rolls back radio value');await click('[data-action=close]');
await click('[data-access-open]');const checked=$('#modal [aria-checked=true]');ok(document.activeElement===checked,'selected option receives focus');await click('[data-access-choice=all]');ok(state.settings['access-phone']==='all','everyone choice');await click('[data-access-open]');await click('[data-access-choice=none]');ok(state.settings['access-phone']==='none','nobody choice');
await click('[data-page-action=back]');await click('[data-page-action=back]');await click('[data-action="nav:chats"]');AquaChat.open(1,document.querySelector('[data-action="chat:1"]'));await w();
const m=messages[1].find(m=>m.video);m.qualities=[{label:'Source test A',src:'assets/aqua-demo.webm?a=1'},{label:'Source test B',src:'assets/aqua-demo.webm?a=2'}];
const container=$('#messages');container.scrollTop=80;const scroll=container.scrollTop;
AquaPages.go('viewer',{message:m});await w(800);let v=$('video');v.currentTime=2;await w();
await click('[data-media=quality]');await click('[data-media=quality-1]');await w(800);ok(v.currentSrc.includes('a=2')&&Math.abs(v.currentTime-2)<.2,'quality source changes and retains time');
await click('[data-media=back]');ok($('#messages')===container&&container.scrollTop===scroll&&v.paused,'back preserves original chat and scroll, video stopped');
AquaPages.go('viewer',{message:m});await w();v=$('video');v.src='data:video/webm;base64,AA==';v.load();await w(700);ok($('.viewer-error').textContent.includes('не удалось'),'invalid video error state');await click('[data-media=back]');
return out;
})()
