/* One motion owner for screen, surface and micro interactions (Web Animations API).
   Interruption and reduced motion are handled centrally. Scene controllers supply
   their own keyframes; only this module starts timed Web Animations effects. */
const AquaMotion = (() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const running = new Set();
  let enabled = true;
  const curves = {
    presence: "cubic-bezier(.32,0,.2,1)",
    standard: "cubic-bezier(.22,1,.36,1)",
    spring: "linear(0, .12 8%, .42 20%, .76 38%, .96 58%, 1.018 78%, 1)",
  };
  function play(node, frames, duration = 240, delay = 0, curve = "standard", retain = false) {
    if (!node || !enabled || reduce.matches || !node.animate)
      return Promise.resolve();
    for (const active of running)
      if (active.effect?.target === node || !active.effect?.target?.isConnected)
        active.cancel();
    // Anime is the only clock. Native paused effects preserve exact CSS
    // keyframes/offsets and the getAnimations() cancellation contract of scenes.
    const animation = node.animate(frames, {
      duration, delay, easing: curves[curve], fill: retain ? 'both' : 'backwards'
    });
    animation.pause();
    animation.currentTime = 0;
    running.add(animation);
    let completed = false;
    const clock = {time:0};
    const driver = anime.animate(clock, {
      time: duration + delay, duration: duration + delay, ease:'linear',
      onUpdate: () => { if (animation.playState !== 'idle') animation.currentTime=clock.time; },
      onComplete: () => { if (animation.playState !== 'idle') { completed=true; animation.finish(); } }
    });
    animation.addEventListener('cancel',()=>driver.cancel(),{once:true});
    return animation.finished.catch(()=>{}).finally(()=>{
      // Scene tracks retain their last frame until the owner finalizes the scene.
      // Cancellation must never commit an obsolete target.
      if (retain && completed && animation.playState === 'finished' && node.isConnected) {
        // Our scene tracks supply explicit terminal values. Copy only these
        // properties: no layout read or commitStyles on hidden mobile controls.
        for (const [key, value] of Object.entries(frames.at(-1))) {
          if (['offset','easing','composite'].includes(key)) continue;
          if (key.startsWith('--')) node.style.setProperty(key, value);
          else node.style[key] = value;
        }
      }
      driver.cancel(); animation.cancel(); running.delete(animation);
    });
  }
  function sequence(tracks) {
    return Promise.all(tracks.map(({node,frames,duration=240,at=0,curve='standard'})=>play(node,frames,duration,at,curve)));
  }

  function enter(node, kind = "page") {
    const presets = {
      sent: [
        { opacity: 0, transform: "translate(18px,22px) scale(.9)" },
        { opacity: 1, transform: "none" },
      ],
      status: [
        { opacity: 0, transform: "scale(.65) rotate(-20deg)" },
        { opacity: 1, transform: "none" },
      ],
      slide: [
        { opacity: 0.65, transform: "translateX(32px)" },
        { opacity: 1, transform: "none" },
      ],
      page: [
        { opacity: 0.4, transform: "translateY(10px)" },
        { opacity: 1, transform: "none" },
      ],
      dialog: [
        { opacity: 0, transform: "translateY(36px) scale(.97)" },
        { opacity: 1, transform: "none" },
      ],
      sheet: [
        { opacity: 0, transform: "translateY(24px)" },
        { opacity: 1, transform: "none" },
      ],
      message: [
        { opacity: 0, transform: "translateY(12px) scale(.96)" },
        { opacity: 1, transform: "none" },
      ],
      content: [
        { opacity: 0, transform: "translateY(8px)" },
        { opacity: 1, transform: "none" },
      ],
    };
    return play(
      node,
      presets[kind] || presets.content,
      kind === "message" ? 240 : 300,
      0,
      kind === "message" ? "spring" : "standard",
    );
  }
  function setEnabled(value) {
    enabled = value;
    if (!enabled || reduce.matches) for (const a of running) a.cancel();
  }
  reduce.addEventListener("change", () => setEnabled(enabled));
  return {
    play,
    sequence,
    enter,
    setEnabled,
    isEnabled: () => enabled && !reduce.matches,
  };
})();
