/* Conversation transition owns the shared elements, retained list and reverse
   geometry. All timed motion runs through AquaMotion. Pointer moves only scrub
   the same geometry; they do not start competing animations. */
const AquaChat = (() => {
  let retained = null,
    source = null,
    layers = [],
    hidden = [],
    details = [],
    token = 0,
    routing = false;
  let requestId = 0,
    listPosition = 0,
    gestureBase = 1;
  let scene = null,
    progress = 1,
    historyOwned = false,
    releasing = null,
    pending = null;
  const mobile = () => matchMedia("(max-width:700px)").matches;
  const rect = (n) => n?.getBoundingClientRect();
  const clamp = (n) => Math.max(0, Math.min(1, n));
  function clean() {
    ++token;
    for (const n of layers) {
      n.getAnimations().forEach((a) => a.cancel());
      n.remove();
    }
    layers = [];
    details.forEach((n) => {
      n.getAnimations().forEach((a) => a.cancel());
      n.style.removeProperty("opacity");
      n.style.removeProperty("transform");
    });
    details = [];
    hidden.forEach((n) => n.style.removeProperty("visibility"));
    hidden = [];
    for (const n of [document.querySelector("#workspace"), retained]) {
      if (!n) continue;
      n.getAnimations().forEach((a) => a.cancel());
      for (const key of [
        "transform",
        "clip-path",
        "filter",
        "opacity",
        "background-color",
      ])
        n.style.removeProperty(key);
      n.classList.remove("chat-transition-surface", "chat-transition-list");
      n.inert = false;
    }
    scene = null;
  }
  function restoreList() {
    const fresh = document.querySelector(".sidebar");
    if (!fresh) return;
    if (retained && retained !== fresh) {
      fresh.replaceWith(retained);
    } else retained = fresh;
    retained.classList.toggle("hidden-mobile", state.mobile);
    retained.classList.toggle(
      "chat-retained",
      state.mobile && state.page === "chats",
    );
    const list = retained.querySelector("#chat-list");
    if (list) list.scrollTop = listPosition;
  }
  function afterRender() {
    if (!mobile()) {
      retained = null;
      return;
    }
    if (retained && (routing || (state.page === "chats" && state.mobile))) {
      restoreList();
    } else {
      // Ordinary list/tab renders must keep their newly rendered controls.
      retained = document.querySelector(".sidebar");
      listPosition = retained?.querySelector("#chat-list")?.scrollTop || 0;
    }
  }
  function marker() {
    if (historyOwned) return;
    try {
      if (!history.state?.aquaChat)
        history.pushState({ ...history.state, aquaChat: true }, "");
      historyOwned = true;
    } catch {}
  }
  function dropMarker() {
    if (!historyOwned) return Promise.resolve();
    historyOwned = false;
    if (!history.state?.aquaChat) return Promise.resolve();
    pending = new Promise((r) => (releasing = r));
    history.back();
    return pending;
  }
  function remember(row) {
    if (!row) return null;
    const av = row.querySelector(".avatar"),
      name = row.querySelector(".row-copy strong");
    return {
      row: rect(row),
      avatar: av?.cloneNode(true),
      name: name?.cloneNode(true),
      avRect: rect(av),
      nameRect: rect(name),
    };
  }
  function shared(node, start, end) {
    if (!node || !start?.width || !end?.width) return null;
    node.removeAttribute("id");
    node.classList.add("chat-shared");
    node.setAttribute("aria-hidden", "true");
    Object.assign(node.style, {
      left: `${end.left}px`,
      top: `${end.top}px`,
      width: `${end.width}px`,
      height: `${end.height}px`,
      margin: "0",
      transformOrigin: "0 0",
    });
    document.body.append(node);
    layers.push(node);
    return { node, start, end };
  }
  function refreshList() {
    if (!retained) return;
    const scroll = retained.querySelector("#chat-list")?.scrollTop || 0;
    renderList();
    if (retained.querySelector("#chat-list"))
      retained.querySelector("#chat-list").scrollTop = scroll;
  }
  function build() {
    const card = document.querySelector("#workspace");
    if (!card || !retained) return;
    card.classList.add('chat-transition-surface');
    retained.classList.add('chat-transition-list');
    retained.inert=true;
    scene={card,list:retained,parts:[],shared:[]};
  }
  function values(p) {
    return {card:{opacity:p},list:{opacity:1,transform:'none'}};
  }
  function sharedFrame() {return {};}
  function partFrame(item, p) {
    const q = clamp((p - item.start) / (1 - item.start));
    return {
      opacity: q,
      transform: `translateY(${item.distance * (1 - q)}px)`,
    };
  }
  function scrub(p) {
    if (!scene) return;
    progress = clamp(p);
    const v = values(progress);
    Object.assign(scene.card.style, v.card);
    Object.assign(scene.list.style, v.list);
    scene.parts.forEach((i) =>
      Object.assign(i.node.style, partFrame(i, progress)),
    );
    scene.shared.forEach((i) =>
      Object.assign(i.node.style, sharedFrame(i, progress)),
    );
  }
  async function animate(to, duration = 260) {
    if (!scene) return;
    const current = progress,
      own = token,
      v0 = values(current),
      v1 = values(to);
    const track=(node,frames,time)=>AquaMotion.play(node,frames,time,0,"standard",true);
    await Promise.all([
      track(scene.card, [v0.card, v1.card], duration),
      track(
        scene.list,
        Array.from({ length: 21 }, (_, index) => {
          const offset = index / 20;
          return { ...values(current + (to - current) * offset).list, offset };
        }),
        duration,
      ),
      ...scene.parts.map((i) =>
        track(
          i.node,
          Array.from({ length: 21 }, (_, index) => {
            const offset = index / 20;
            return {
              ...partFrame(i, current + (to - current) * offset),
              offset,
            };
          }),
          duration,
        ),
      ),
      ...scene.shared.map((i) =>
        track(
          i.node,
          [sharedFrame(i, current), sharedFrame(i, to)],
          duration,
        ),
      ),
    ]);
    if (own === token) scrub(to);
  }
  async function ripple(row, tapX) {
    if (!row?.isConnected || !row.matches(".chat-row") || !mobile() || state.searchOpen || !AquaMotion.isEnabled()) return;
    const box = row.getBoundingClientRect();
    const at = tapX == null || !box.width ? 50 : Math.round(clamp((tapX - box.left) / box.width) * 100);
    const wave = document.createElement("span");
    wave.className = "row-ripple";
    wave.setAttribute("aria-hidden", "true");
    Object.assign(wave.style, { position: "absolute", inset: "0", borderRadius: "inherit", background: "#ffffff29", pointerEvents: "none" });
    row.append(wave);
    await AquaMotion.play(wave, [
      { clipPath: `inset(0 ${100 - at}% 0 ${at}% round 18px)` },
      { clipPath: "inset(0 0 0 0 round 18px)" },
    ], 130);
  }
  async function open(id, row, tapX) {
    if (pending) await pending;
    const request = ++requestId;
    const start = remember(row);
    await ripple(row, tapX);
    if (request !== requestId) return;
    clean();
    if (state.page === "chats" && !state.mobile) {
      retained = document.querySelector(".sidebar");
      listPosition = retained.querySelector("#chat-list")?.scrollTop || 0;
      source = start;
    } else if (state.chat !== id)
      source =
        start ||
        remember(retained?.querySelector(`[data-action="chat:${id}"]`));
    await AquaSearch.close(true);
    if (request !== requestId) return;
    clean();
    const own = ++token;
    routing = true;
    state.chat = id;
    state.page = "chats";
    state.mobile = true;
    state.picker = false;
    chats.find((c) => c.id === id).badge = 0;
    closeModal();
    render();
    routing = false;
    if (!retained) retained = document.querySelector(".sidebar");
    marker();
    if (!AquaMotion.isEnabled()) {
      clean();
      return;
    }
    build();
    progress = 0;
    scrub(0);
    await animate(1, 150);
    document.querySelectorAll(".row-ripple").forEach((n) => n.remove());
    if (own === token) clean();
  }
  function measuredProgress() {
    if(!scene)return 1;
    return clamp(parseFloat(getComputedStyle(scene.card).opacity) || 0);
  }
  async function close(fromBack = false) {
    if (state.page !== "chats" || !state.mobile) return;
    ++requestId;
    const from = measuredProgress();
    clean();
    const own = token;
    refreshList();
    document.activeElement?.blur();
    AquaMessages.close(true);
    build();
    scrub(from);
    await animate(0, 160);
    if (own !== token) return;
    completeClose(fromBack);
  }
  function completeClose(fromBack = false) {
    clean();
    routing = true;
    state.mobile = false;
    state.picker = false;
    render();
    routing = false;
    if (fromBack) historyOwned = false;
    else dropMarker();
  }
  function beginGesture() {
    if (!mobile() || !state.mobile) return false;
    ++requestId;
    gestureBase = measuredProgress();
    clean();
    refreshList();
    build();
    scrub(gestureBase);
    return !!scene;
  }
  async function finishGesture(commit) {
    const own = token;
    await animate(commit ? 0 : 1, commit ? 160 : 200);
    if (own !== token) return;
    if (commit) completeClose();
    else clean();
  }
  function install() {
    document.addEventListener(
      "click",
      (event) => {
        const button = event.target.closest("[data-action]");
        if (!button || !mobile()) return;
        const action = button.dataset.action;
        if (action.startsWith("chat:")) {
          event.preventDefault();
          event.stopImmediatePropagation();
          open(+action.slice(5), button, event.clientX);
        } else if (
          action === "back" &&
          state.page === "chats" &&
          state.mobile
        ) {
          event.preventDefault();
          event.stopImmediatePropagation();
          close();
        } else if (action.startsWith("nav:") || action.startsWith("auth:")) {
          ++requestId;
          clean();
          if (historyOwned) dropMarker();
        }
      },
      true,
    );
    window.addEventListener("popstate", () => {
      if (releasing) {
        const r = releasing;
        releasing = null;
        pending = null;
        r();
        return;
      }
      if (historyOwned && !history.state?.aquaChat) close(true);
    });
    window.addEventListener("resize", () => clean());
  }
  return {
    install,
    settle: () => { ++requestId; clean(); },
    afterRender,
    handlesRender: () => routing,
    beginGesture,
    scrubBack: (f) => scrub(gestureBase * (1 - clamp(f))),
    finishGesture,
    open,
    close,
  };
})();
