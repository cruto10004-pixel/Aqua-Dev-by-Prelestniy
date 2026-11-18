/* Screen navigation controller. A tab transition owns exactly two surfaces.
   Local effects continue to use AquaMotion; tab content never animates vertically. */
const AquaTransitions = (() => {
  let previous = { page: "chats", chat: null, mobile: false };
  let outgoing = null,
    source = null,
    epoch = 0,
    busy = false,
    queued = null;
  const topPage = (page) =>
    ["appearance", "privacy", "account"].includes(page) ? "settings" : page;
  const surface = (view) =>
    document.querySelector(
      view.page === "chats" && !view.mobile ? ".sidebar" : "#workspace",
    );
  const current = () => ({
    page: state.page,
    chat: state.chat,
    mobile: state.mobile,
  });
  const enabled = () => AquaMotion.isEnabled();
  function clear() {
    epoch++;
    document
      .querySelectorAll(".navigation-outgoing")
      .forEach((n) => n.remove());
    outgoing = null;
    busy = false;
    queued = null;
    document
      .getAnimations()
      .filter((a) => a.effect?.target?.matches(".sidebar,.workspace"))
      .forEach((a) => a.cancel());
  }
  function capture(kind) {
    if (kind !== "render") return;
    clear();
    const now = current();
    const order = [
      ...document.querySelectorAll('.nav-capsule [data-action^="nav:"]'),
    ].map((n) => n.dataset.action.slice(4));
    const from = order.indexOf(topPage(previous.page)),
      to = order.indexOf(topPage(now.page));
    const old = surface(previous);
    if (
      enabled() &&
      matchMedia("(max-width:700px)").matches &&
      old &&
      from >= 0 &&
      to >= 0 &&
      (from !== to || previous.page !== now.page) &&
      !(now.page === "chats" && now.mobile)
    ) {
      const clone = old.cloneNode(true);
      const oldNodes = [old, ...old.querySelectorAll("*")],
        newNodes = [clone, ...clone.querySelectorAll("*")];
      // Save scroll positions before detachment; cloned DOM doesn't inherit them.
      const scroll = oldNodes.map((n) => [n.scrollLeft, n.scrollTop]);
      newNodes.forEach((n) => {
        n.removeAttribute("id");
        n.removeAttribute("autofocus");
      });
      clone.inert = true;
      clone.setAttribute("aria-hidden", "true");
      outgoing = {
        clone,
        scroll,
        newNodes,
        direction: Math.sign(to - from) || (now.page === "settings" ? -1 : 1),
        height: old.offsetHeight,
      };
    }
    const av = document.querySelector(
      `[data-action="chat:${state.chat}"] .avatar`,
    );
    source =
      av && av.getBoundingClientRect().width
        ? av.getBoundingClientRect()
        : null;
  }
  function tabs(now) {
    const saved = outgoing;
    outgoing = null;
    const incoming = surface(now),
      host = document.createElement("div");
    host.className = "navigation-outgoing";
    host.setAttribute("aria-hidden", "true");
    host.inert = true;
    host.append(saved.clone);
    app.append(host);
    Object.assign(saved.clone.style, {
      display: "flex",
      position: "absolute",
      inset: "0",
      width: "100%",
      height: `${saved.height}px`,
      transform: "none",
      margin: "0",
    });
    saved.newNodes.forEach((n, i) => {
      n.scrollLeft = saved.scroll[i][0];
      n.scrollTop = saved.scroll[i][1];
    });
    const x = saved.direction * app.clientWidth,
      token = ++epoch;
    busy = true;
    // Both effects start in the same task, before the next painted frame.
    Promise.all([
      AquaMotion.play(
        saved.clone,
        [{ transform: "translateX(0)" }, { transform: `translateX(${-x}px)` }],
        300,
      ),
      AquaMotion.play(
        incoming,
        [{ transform: `translateX(${x}px)` }, { transform: "translateX(0)" }],
        300,
      ),
    ]).then(() => {
      host.remove();
      if (token !== epoch) return;
      busy = false;
      const next = queued;
      queued = null;
      if (next && next !== topPage(state.page))
        document
          .querySelector(`.nav-capsule [data-action="nav:${next}"]`)
          ?.click();
    });
  }
  function run(kind, target, args) {
    const now = current();
    if (AquaPages.active()) return;
    if (kind === "render" && AquaChat.handlesRender()) {
      previous = now;
      return;
    }
    if (kind === "render" && outgoing) tabs(now);
    else if (kind === "modal") {
      const sheet = args[0] === "Вложение";
      AquaMotion.play(
        target,
        sheet
          ? [
              { transform: "translateY(64px)", opacity: 0 },
              { transform: "none", opacity: 1 },
            ]
          : [
              { transform: "scale(.95)", opacity: 0 },
              { transform: "none", opacity: 1 },
            ],
        sheet ? 280 : 190,
      );
    } else if (kind === "renderPicker")
      AquaMotion.play(
        target,
        [
          { clipPath: "inset(0 0 100% 0 round 18px)", opacity: 0.5 },
          { clipPath: "inset(0 0 0 0 round 18px)", opacity: 1 },
        ],
        240,
      );
    else if (["appearance", "privacy", "account"].includes(now.page)) {
      AquaMotion.play(
        target,
        [
          { opacity: 0.2, transform: "translateX(24px)" },
          { opacity: 1, transform: "none" },
        ],
        240,
      );
    } else if (
      topPage(previous.page) === topPage(now.page) &&
      previous.page !== now.page
    ) {
      AquaMotion.play(
        target,
        [
          { opacity: 0.3, transform: "translateX(-18px)" },
          { opacity: 1, transform: "none" },
        ],
        220,
      );
    }
    if (kind === "render" && previous.page !== now.page && now.page === 'profile') {
      AquaMotion.sequence([
        {node:document.querySelector('.profile-hero .avatar'),frames:[{opacity:.2,transform:'translateY(12px) scale(.9)'},{opacity:1,transform:'none'}],duration:340,at:60,curve:'spring'},
        {node:document.querySelector('.profile-hero h2'),frames:[{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'none'}],duration:220,at:110},
        {node:document.querySelector('.page-profile .actions'),frames:[{opacity:0},{opacity:1}],duration:180,at:160}
      ]);
    }
    if (kind === "render") {
      if (previous.page !== now.page) {
        AquaMotion.play(
          document.querySelector(".nav-capsule .active .nav-icon"),
          [
            { transform: "scale(.85)" },
            { transform: "scale(1.06)", offset: 0.6 },
            { transform: "scale(1)" },
          ],
          240,
        );
        AquaMotion.play(
          document.querySelector(".nav-capsule .active span"),
          [{ opacity: 0.4 }, { opacity: 1 }],
          220,
        );
      }
      previous = now;
    }
  }
  // Coalesce quick taps to the last requested destination. State changes only
  // after the currently visible pair has completed, so no blank snapshots arise.
  document.addEventListener(
    "click",
    (event) => {
      const button = event.target.closest('[data-action^="nav:"]');
      if (!busy || !button) return;
      queued = button.dataset.action.slice(4);
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true,
  );
  window.addEventListener("resize", () => {
    queued = null;
    clear();
  });
  return { capture, run };
})();
