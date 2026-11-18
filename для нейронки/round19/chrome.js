/* Persistent chrome owns presence. DOM stays alive until an exit completes. */
const AquaChrome = (() => {
  let dockNode, shown, searchable, epoch=0, searchEpoch=0;
  function sync() {
    const nav=document.querySelector('.mobile-nav');
    if(!nav)return;
    const first=dockNode!==nav;
    if(first){dockNode=nav;shown=undefined;searchable=undefined;}
    const visible= !AquaPages.active() && !(state.page==='chats'&&state.mobile) && state.page!=='auth';
    const search=state.page==='chats'&&!state.mobile;
    const button=nav.querySelector('[data-action="search"]'), capsule=nav.querySelector('.nav-capsule');
    if(searchable!==search){
      searchable=search;const token=++searchEpoch;
      const from=button.hidden?{opacity:0,transform:'translateX(-12px) scale(.65)'}:{opacity:getComputedStyle(button).opacity,transform:getComputedStyle(button).transform};
      const old=getComputedStyle(capsule).translate;
      button.hidden=false;button.inert=!search;
      button.setAttribute('aria-hidden',String(!search));
      capsule.style.translate=search?'0px':'32px';
      button.style.opacity=search?'1':'0';
      button.style.transform=search?'none':'translateX(-12px) scale(.65)';
      if(first||!visible){button.hidden=!search;}
      else {
        AquaMotion.sequence([
          {node:button,frames:[from,{opacity:search?1:0,transform:search?'none':'translateX(-12px) scale(.65)'}],duration:search?300:320,curve:search?'standard':'presence'},
          {node:capsule,frames:[{translate:old==='none'?'0px':old},{translate:capsule.style.translate}],duration:280}
        ]).then(()=>{if(token===searchEpoch)button.hidden=!search;});
      }
    }
    if(shown!==visible){
      shown=visible;const token=++epoch;
      const from={opacity:getComputedStyle(nav).opacity,transform:getComputedStyle(nav).transform};
      nav.style.visibility='visible';nav.inert=!visible;
      nav.setAttribute('aria-hidden',String(!visible));
      if(first){nav.style.opacity=visible?'1':'0';nav.style.visibility=visible?'visible':'hidden';return;}
      nav.style.opacity=visible?'1':'0';
      AquaMotion.play(nav,[visible?{opacity:0,transform:'translate(-50%, 18px) scale(.96)'}:from,
        {opacity:visible?1:0,transform:visible?'translate(-50%,0)':'translate(-50%,18px) scale(.96)'}],visible?280:190)
        .then(()=>{if(token===epoch&&!visible)nav.style.visibility='hidden';});
    }
  }
  return {sync};
})();
