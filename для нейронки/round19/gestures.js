/* Interactive edge-back gesture. Vertical scrolling, controls and selection keep priority. */
(() => {
  let gesture = null,
    settling = false,
    ignoreClickUntil = 0;
  const eligible = (target) =>
    matchMedia("(max-width:700px)").matches &&
    ((state.page === "chats" && state.mobile) || AquaPages.active()) &&
    !$("#modal").open &&
    !state.picker &&
    !document.querySelector("#message-context[open]") &&
    !target.closest("button,input,textarea,select,a,[contenteditable],.photo,.voice,.file,.route-tabs,.media-grid,.mobile-nav,.aqua-viewer");
  app.addEventListener("pointerdown", (event) => {
    if (
      settling ||
      !event.isPrimary ||
      event.button !== 0 ||
      !eligible(event.target) ||
      String(getSelection())
    )
      return;
    gesture = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      last: event.clientX,
      time: event.timeStamp,
      velocity: 0,
      locked: false,
    };
  });
  app.addEventListener(
    "pointermove",
    (event) => {
      const g = gesture;
      if (!g || g.id !== event.pointerId) return;
      const dx = event.clientX - g.x,
        dy = event.clientY - g.y;
      if (!g.locked) {
        if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) {
          gesture = null;
          return;
        }
        if (dx < 8 || dx < Math.abs(dy) * 1.3) return;
        g.locked = true;
        app.setPointerCapture(g.id);
        getSelection()?.removeAllRanges();
        g.owner=AquaPages.active()?AquaPages:AquaChat;
        if(!g.owner.beginGesture()){gesture=null;return;}
      }
      event.preventDefault();
      g.velocity =
        (event.clientX - g.last) / Math.max(1, event.timeStamp - g.time);
      g.last = event.clientX;
      g.time = event.timeStamp;
      g.dx = Math.max(0, Math.min(innerWidth, dx));
      g.owner.scrubBack(g.dx / innerWidth);
    },
    { passive: false },
  );
  function finish(event) {
    const g = gesture;
    if (!g || g.id !== event.pointerId) return;
    gesture = null;
    if (!g.locked) return;
    if (app.hasPointerCapture(g.id)) app.releasePointerCapture(g.id);
    const complete =
      event.type !== "pointercancel" &&
      (g.dx > innerWidth * 0.32 || (g.dx > 55 && g.velocity > 0.5));
    settling = true;
    ignoreClickUntil = performance.now() + 400;
    g.owner.finishGesture(complete).finally(() => {
      settling = false;
    });
  }
  app.addEventListener("pointerup", finish);
  app.addEventListener("pointercancel", finish);
  app.addEventListener(
    "click",
    (event) => {
      if (performance.now() < ignoreClickUntil) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
})();
