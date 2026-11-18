(async()=>{
const w=()=>new Promise(r=>setTimeout(r,380)),out=[],check=(value,msg)=>{if(!value)throw Error(msg);};
for(const theme of ['dark','light']){
 document.documentElement.dataset.scheme=theme;
 document.querySelector('.mobile-nav [data-action="nav:profile"]').click();await w();
 for(const el of document.querySelectorAll('.profile-actions,.profile-channel,.profile-music,.profile-info')){const r=el.getBoundingClientRect();check(r.left>=0&&r.right<=innerWidth+1,'profile overflow '+el.className);}
 document.querySelector('[data-profile=avatar]').click();await w();let r=document.querySelector('.profile-avatar-button').getBoundingClientRect();check(Math.abs(r.width-r.height)<1&&r.right<=innerWidth,'square geometry');
 document.querySelector('[data-profile=avatar]').click();await w();r=document.querySelector('.viewer-stage .avatar').getBoundingClientRect();check(Math.abs(r.width-r.height)<1&&r.bottom<=innerHeight,'fullscreen portrait geometry');
 document.querySelector('[data-media=back]').click();await w();document.querySelector('.page-profile').scrollTop=160;await w();check(document.querySelector('.profile-avatar-button').getAttribute('aria-expanded')==='false','collapse after scroll');
 document.querySelector('[data-action="nav:settings"]').click();await w();AquaPages.go('s-access',{key:'phone'});await w();document.querySelector('[data-access-open]').click();await w();r=document.querySelector('#modal').getBoundingClientRect();check(r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,'privacy sheet fits');
 document.querySelector('[data-action=close]').click();await w();document.querySelector('[data-page-action=back]').click();await w();
 document.querySelector('.mobile-nav [data-action="nav:chats"]').click();await w();AquaChat.open(1,document.querySelector('[data-action="chat:1"]'));await w();AquaPages.go('viewer',{message:messages[1].find(m=>m.video)});await w();
 for(const el of document.querySelectorAll('.viewer-toolbar,.video-controls,.video-buttons,.video-timeline')){r=el.getBoundingClientRect();check(r.left>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight,'video overflow '+el.className);}
 check(!document.querySelector('video').controls,'no native video controls');document.querySelector('[data-media=back]').click();await w();out.push(`${innerWidth}x${innerHeight} ${theme}: profile, avatar, sheet, video bounds/back`);
}return out;
})()
