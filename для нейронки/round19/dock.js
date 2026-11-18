/* Direct manipulation extends the existing indicator and navigation commit path.
   Geometry is cached at contact; pointer samples are painted once per frame. */
(() => {
  let drag = null, frame = 0, suppressUntil = 0;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function volume(pill) {
    let node = pill.querySelector('.glass-volume');
    if (!node) {
      node = document.createElement('span');
      node.className = 'glass-volume';
      pill.append(node);
    }
    return node;
  }
  function paint() {
    frame = 0;
    const d = drag;
    if (!d?.moved) return;
    const raw = clamp(d.clientX - d.left - d.offset - 5, 0, d.max);
    d.index = d.stops.reduce((best, x, i) =>
      Math.abs(x - raw) < Math.abs(d.stops[best] - raw) ? i : best, 0);
    const distance = d.stops[d.index] - raw;
    // A shallow magnetic well preserves direct control and exact end positions.
    const attraction = .2 * Math.pow(Math.max(0, 1 - Math.abs(distance) / (d.width * .65)), 2);
    const x = raw + distance * attraction;
    d.pill.style.transform = `translateX(${x}px)`;
    const live = AquaMotion.isEnabled();
    const bend = live ? clamp(d.velocity, -1.5, 1.5) : 0;
    const stretch = Math.abs(bend);
    d.skin.style.transform = live
      ? `scale(${1.035 + stretch * .055},${1.045 - stretch * .035}) skewX(${-bend * 3}deg)` : 'none';
    d.skin.style.borderRadius = `${25 - stretch * 5}px ${25 + bend * 5}px ${25 - stretch * 4}px ${25 - bend * 5}px`;
    d.skin.style.setProperty('--glass-light', `${clamp(50 + bend * 22 + distance * .25, 12, 88)}%`);
    d.skin.style.setProperty('--glass-depth', `${3 + stretch * 3}px`);
    d.buttons.forEach((b, i) => b.classList.toggle('drag-hover', i === d.index));
  }
  document.addEventListener('pointerdown', e => {
    // A new contact is a new click sequence, even during the previous recoil.
    suppressUntil = 0;
    const nav = e.target.closest('.nav-capsule');
    if (!nav || drag || !e.isPrimary || e.button !== 0 || nav.inert) return;
    const pill = nav.querySelector('.dock-indicator');
    if (!pill) return;
    const bounds = pill.getBoundingClientRect();
    if (e.clientX < bounds.left || e.clientX > bounds.right) {
      const button=e.target.closest('button');
      if (!button) return;
      drag={nav,id:e.pointerId,passive:true,button,x:e.clientX,y:e.clientY,cancelled:false};
      nav.setPointerCapture(e.pointerId);
      return;
    }
    const rect = nav.getBoundingClientRect();
    const buttons = [...nav.querySelectorAll('button')];
    const skin = volume(pill);
    drag = {nav, pill, skin, buttons, id:e.pointerId, x:e.clientX,
      clientX:e.clientX, last:e.clientX, time:e.timeStamp, velocity:0,
      left:rect.left, width:pill.offsetWidth, max:rect.width-pill.offsetWidth-10,
      stops:buttons.map(b=>b.getBoundingClientRect().left-rect.left-5),
      offset:e.clientX-bounds.left, moved:false,
      index:buttons.findIndex(b=>b.classList.contains('active'))};
    nav.classList.add('glass-held');
    skin.getAnimations().forEach(a=>a.cancel());
    AquaMotion.play(skin, [
      {transform:getComputedStyle(skin).transform},
      {transform:'scale(1.055,1.075)',offset:.16},
      {transform:'scale(1.035,1.05)',offset:.48},
      {transform:'scale(1.05,1.065)',offset:.76},
      {transform:'scale(1.035,1.05)'}
    ], 1250);
    skin.style.transform = AquaMotion.isEnabled() ? 'scale(1.035,1.05)' : 'none';
    nav.setPointerCapture(e.pointerId);
  });
  document.addEventListener('pointermove', e => {
    const d=drag;
    if (!d || e.pointerId!==d.id) return;
    if (d.passive) {
      if (Math.hypot(e.clientX-d.x,e.clientY-d.y)>8) d.cancelled=true;
      return;
    }
    if (!d.moved && Math.abs(e.clientX-d.x)<4) return;
    if (!d.moved) {
      d.skin.getAnimations().forEach(a=>a.cancel());
      d.pill.getAnimations().forEach(a=>a.cancel());
      d.moved=true; d.nav.classList.add('dragging');
    }
    e.preventDefault();
    const sample = e.getCoalescedEvents?.().at(-1) || e;
    d.velocity = clamp((sample.clientX-d.last)/Math.max(8,sample.timeStamp-d.time),-2,2);
    d.last=sample.clientX; d.time=sample.timeStamp; d.clientX=sample.clientX;
    if (!frame) frame=requestAnimationFrame(paint);
  }, {passive:false});
  function finish(e, cancel=false) {
    const d=drag;
    if (!d || (e.pointerId!=null && e.pointerId!==d.id)) return;
    if (d.passive) {
      drag=null;
      if(d.nav.hasPointerCapture(d.id))d.nav.releasePointerCapture(d.id);
      suppressUntil=performance.now()+400;
      if(!cancel&&!d.cancelled)d.button.click();
      return;
    }
    if (e.type==='pointerup' && d.moved) d.clientX=e.clientX;
    cancelAnimationFrame(frame); frame=0;
    paint();
    const from = getComputedStyle(d.skin).transform;
    const radius = getComputedStyle(d.skin).borderRadius;
    d.skin.getAnimations().forEach(a=>a.cancel());
    d.nav.classList.remove('dragging','glass-held');
    d.buttons.forEach(b=>b.classList.remove('drag-hover'));
    drag=null;
    if(d.nav.hasPointerCapture(d.id))d.nav.releasePointerCapture(d.id);
    d.skin.style.transform='none'; d.skin.style.borderRadius='';
    d.skin.style.removeProperty('--glass-light'); d.skin.style.removeProperty('--glass-depth');
    AquaMotion.play(d.skin,[
      {transform:from,borderRadius:radius},
      {transform:cancel?'scale(.975,1.025)':'scale(1.025,.98)',borderRadius:'28px',offset:.65},
      {transform:'none',borderRadius:'28px'}
    ],cancel?440:360,0,'spring');
    suppressUntil=performance.now()+400;
    if(!cancel) d.buttons[d.index].click();
    syncDock(document.querySelector('.mobile-nav'),true);
  }
  document.addEventListener('pointerup',e=>finish(e));
  document.addEventListener('pointercancel',e=>finish(e,true));
  document.addEventListener('lostpointercapture',e=>finish(e,true));
  window.addEventListener('resize',()=>finish({},true));
  window.addEventListener('blur',()=>finish({},true));
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',()=>finish({},true));
  document.addEventListener('click',e=>{
    if(e.isTrusted && e.detail > 0 && performance.now()<suppressUntil && e.target.closest('.nav-capsule')) {
      e.preventDefault(); e.stopImmediatePropagation();
    }
  },true);
})();
/* The enclosing glass responds only to contact, with no idle motion. */
(() => {
  let contact;
  function release(e) {
    if(!contact || (e?.pointerId!=null&&e.pointerId!==contact.id))return;
    const {nav}=contact;cancelAnimationFrame(contact.frame);contact=null;
    const before=getComputedStyle(nav).transform;
    nav.classList.remove('surface-held');nav.style.removeProperty('--surface-light');
    AquaMotion.play(nav,[{transform:before},{transform:'none'}],230);
  }
  document.addEventListener('pointerdown',e=>{
    const nav=e.target.closest('.nav-capsule');
    if(!nav||!e.isPrimary||e.button!==0)return;
    contact={nav,id:e.pointerId,rect:nav.getBoundingClientRect()};
    nav.classList.add('surface-held');
    AquaMotion.play(nav,[{transform:'none'},{transform:'scale(1.008,1.025)'}],160);
    nav.style.transform=AquaMotion.isEnabled()?'scale(1.008,1.025)':'none';
  });
  document.addEventListener('pointermove',e=>{
    if(!contact||e.pointerId!==contact.id)return;
    contact.x=e.clientX;
    if(!contact.frame)contact.frame=requestAnimationFrame(()=>{
      if(!contact)return;
      contact.frame=0;
      contact.nav.style.setProperty('--surface-light',`${Math.max(5,Math.min(95,100*(contact.x-contact.rect.left)/contact.rect.width))}%`);
    });
  });
  for(const name of ['pointerup','pointercancel','lostpointercapture'])document.addEventListener(name,e=>{
    if(contact&&contact.id===e.pointerId)contact.nav.style.transform='none';
    release(e);
  });
  window.addEventListener('blur',()=>{if(contact)contact.nav.style.transform='none';release();});
})();
