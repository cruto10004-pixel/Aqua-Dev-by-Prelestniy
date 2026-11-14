/** The search morph owns temporary geometry only while transitioning. */
export function initSearchMorph() {
  const dock = document.querySelector('#nav-dock');
  const nav = document.querySelector('#nav');
  const button = document.querySelector('#nav-search');
  const field = document.querySelector('#nav-search-field');
  const input = document.querySelector('#search');
  let phase = 'closed', generation = 0;
  let animations = [];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  function reset() {
    generation++;
    animations.forEach(a => a.cancel()); animations = [];
    field.hidden = true; field.removeAttribute('style');
    requestAnimationFrame(() => { if (phase === 'closed') field.removeAttribute('style'); });
    nav.removeAttribute('style'); button.removeAttribute('style');
    nav.inert = false; button.inert = false;
    dock.classList.remove('search-open'); phase = 'closed';
    button.setAttribute('aria-expanded', 'false');
    input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  async function transition(open) {
    if (open ? phase !== 'closed' : phase !== 'open') return;
    const run = ++generation;
    const bounds = dock.getBoundingClientRect();
    const from = open ? button.getBoundingClientRect() : field.getBoundingClientRect();
    const navWidth = bounds.width - 60;
    phase = open ? 'opening' : 'closing';
    field.hidden = false; nav.inert = true; button.inert = true;
    // Freeze actual pixels before closing. Never animate left and right together.
    field.style.position = 'absolute'; field.style.width = `${from.width}px`;
    field.style.left = `${from.left - bounds.left}px`; field.style.removeProperty('right');
    const duration = reduced.matches ? 0 : open ? 400 : 350;
    const options = { duration, easing: 'cubic-bezier(.22,.8,.24,1)', fill: 'forwards' };
    animations = [field.animate([{width:`${from.width}px`,left:`${from.left-bounds.left}px`},
      {width:`${open ? bounds.width : 52}px`,left:`${open ? 0 : bounds.width-52}px`}], options),
      nav.animate([{width:`${open ? navWidth : 0}px`,opacity:open?1:0},{width:`${open ? 0 : navWidth}px`,opacity:open?0:1}],options),
      button.animate([{width:`${open ? 52 : 0}px`,opacity:open?1:0},{width:`${open ? 0 : 52}px`,opacity:open?0:1}],options)];
    field.classList.remove('is-ready');
    await Promise.all(animations.map(a => a.finished.catch(() => {})));
    if (run !== generation) return;
    if (!open) { reset(); button.focus(); return; }
    dock.classList.add('search-open');
    animations.forEach(a => a.cancel()); animations = [];
    field.removeAttribute('style'); phase = 'open'; field.classList.add('is-ready');
    button.setAttribute('aria-expanded','true'); input.focus();
  }
  button.addEventListener('click', () => transition(true));
  document.querySelector('#nav-search-close').addEventListener('click', () => transition(false));
  input.addEventListener('keydown', e => { if(e.key==='Escape') { e.stopPropagation(); transition(false); } });
  const sync = () => {
    const available = !document.querySelector('.modal.is-open') && document.querySelector('#app').dataset.chatOpen !== 'true';
    button.hidden = !available;
    if (!available && phase !== 'closed') reset();
  };
  new MutationObserver(sync).observe(document.querySelector('#app'),{attributes:true,attributeFilter:['data-chat-open']});
  document.querySelectorAll('.modal').forEach(m => new MutationObserver(sync).observe(m,{attributes:true,attributeFilter:['class']}));
  let width = dock.getBoundingClientRect().width;
  new ResizeObserver(() => { const next=dock.getBoundingClientRect().width; if(next!==width && (phase==='opening'||phase==='closing')) reset(); width=next; }).observe(dock);
  sync();
}
