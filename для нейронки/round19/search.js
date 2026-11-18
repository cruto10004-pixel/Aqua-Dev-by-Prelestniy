/* Dock search: one real input stays inside the navigation footprint.
   AquaMotion owns clip, icon travel and control fades; no floating shell. */
const AquaSearch = (() => {
  let filterTimer;
  let phase = "closed",
    epoch = 0,
    query = "",
    savedScroll = 0;
  let historyOwned = false,
    releaseHistory = null,
    historyPending = null;
  let pointerMode = false;
  document.addEventListener("pointerdown", () => (pointerMode = true), true);
  document.addEventListener("keydown", () => (pointerMode = false), true);
  const mobile = () => matchMedia("(max-width:700px)").matches;
  const dock = () => document.querySelector(".mobile-nav");
  const field = () => document.querySelector(".sidebar-search");
  const input = () => document.querySelector("#chat-search");
  const trigger = () =>
    document.querySelector('.mobile-nav [data-action="search"]');
  function sync() {
    const nav = dock(),
      fresh = document.querySelector(".sidebar>.sidebar-search");
    if (mobile() && nav && fresh) {
      nav.querySelector(".sidebar-search")?.remove();
      nav.append(fresh);
    } else if (!mobile() && nav?.querySelector(".sidebar-search")) {
      if (fresh) nav.querySelector(".sidebar-search").remove();
      else
        document
          .querySelector(".side-head")
          ?.after(nav.querySelector(".sidebar-search"));
    }
    const box = field(),
      control = input();
    if (!box || !control) return;
    if (!box.querySelector(".search-dismiss")) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "search-dismiss";
      b.dataset.action = "closesearch";
      b.setAttribute("aria-label", "Закрыть поиск");
      b.innerHTML = icon("close");
      box.append(b);
    }
    const useful = state.page === 'chats' && !state.mobile;
    AquaChrome.sync();
    if (nav) syncDock(nav, false);
    const visible = phase !== "closed";
    box.classList.toggle("search-active", visible);
    if (control.value !== query) control.value = query;
    control.readOnly = !visible;
    control.setAttribute("aria-label", "Поиск чатов");
    control.setAttribute("aria-expanded", String(visible));
    box.querySelector(".search-dismiss").tabIndex = visible ? 0 : -1;
    nav?.classList.toggle("dock-search-active", visible && mobile());
    for (const n of [nav?.querySelector(".nav-capsule"), trigger()])
      if (n) {
        n.inert = (visible && mobile()) || (n === trigger() && !useful);
        n.setAttribute("aria-hidden", String((visible && mobile()) || (n === trigger() && !useful)));
      }
    trigger()?.setAttribute("aria-expanded", String(visible));
    viewport();
  }
  function viewport() {
    const vv = window.visualViewport;
    const inset =
      mobile() && vv ? Math.max(0, innerHeight - vv.height - vv.offsetTop) : 0;
    dock()?.style.setProperty("--search-keyboard-inset", `${inset}px`);
  }
  async function morph(opening, token) {
    const box = field(),
      nav = dock();
    if (!box) return;
    const iconNode = box.querySelector(":scope>svg"),
      control = input(),
      dismiss = box.querySelector(".search-dismiss");
    const width = box.getBoundingClientRect().width;
    const origin = trigger()?.getBoundingClientRect();
    const boxRect = box.getBoundingClientRect();
    const iconRect = iconNode?.getBoundingClientRect();
    const diameter = origin?.width || 56;
    const travel = mobile() && iconRect
      ? origin.left + diameter / 2 - (iconRect.left + iconRect.width / 2 - new DOMMatrix(getComputedStyle(iconNode).transform).m41) : 0;
    const closed = mobile()
      ? `inset(${Math.max(0,(boxRect.height-diameter)/2)}px 0 ${Math.max(0,(boxRect.height-diameter)/2)}px calc(100% - ${diameter}px) round ${diameter/2}px)`
      : "inset(0 0 0 0 round 18px)";
    const full = "inset(0 0 0 0 round 32px)";
    const frames = opening
      ? [{ clipPath: closed }, { clipPath: full }]
      : [{ clipPath: getComputedStyle(box).clipPath }, { clipPath: closed }];
    const target = opening ? "none" : `translateX(${travel}px)`;
    await Promise.all([
      AquaMotion.play(box, frames, opening ? 300 : 260),
      AquaMotion.play(
        iconNode,
        [
          {
            transform: opening
              ? `translateX(${travel}px)`
              : getComputedStyle(iconNode).transform,
          },
          { transform: target },
        ],
        opening ? 300 : 260,
      ),
      AquaMotion.play(
        control,
        opening
          ? [
              { opacity: 0, transform: "translateX(8px)" },
              { opacity: 1, transform: "none" },
            ]
          : [
              { opacity: 1, offset: 0 },
              { opacity: 0, offset: 0.42 },
              { opacity: 0, offset: 1 },
            ],
        opening ? 170 : 260,
        opening ? 100 : 0,
      ),
      AquaMotion.play(
        dismiss,
        opening
          ? [
              { opacity: 0, transform: "scale(.75)" },
              { opacity: 1, transform: "none" },
            ]
          : [
              { opacity: 1, transform: "none", offset: 0 },
              { opacity: 0, transform: "scale(.75)", offset: 0.42 },
              { opacity: 0, transform: "scale(.75)", offset: 1 },
            ],
        opening ? 170 : 260,
        opening ? 110 : 0,
      ),
      AquaMotion.play(
        nav?.querySelector(".nav-capsule"),
        opening
          ? [
              { opacity: 1, transform: "scaleX(1)" },
              { opacity: 0, transform: "scaleX(.96)" },
            ]
          : [
              { opacity: 0, transform: "scaleX(.96)" },
              { opacity: 1, transform: "scaleX(1)" },
            ],
        opening ? 180 : 260,
      ),
    ]);
  }
  function ownHistory() {
    if (historyOwned) return;
    if (history.state?.aquaSearch) {
      historyOwned = true;
      return;
    }
    try {
      history.pushState({ ...history.state, aquaSearch: true }, "");
      historyOwned = true;
    } catch {
      /* file hosts can restrict history; Escape and close still work. */
    }
  }
  function dropHistory() {
    if (!historyOwned) return Promise.resolve();
    historyOwned = false;
    if (!history.state?.aquaSearch) return Promise.resolve();
    historyPending = new Promise((resolve) => {
      releaseHistory = resolve;
    });
    history.back();
    return historyPending;
  }
  async function open() {
    if (historyPending) await historyPending;
    if (phase === "open") {
      return;
    }
    if (phase === "opening") return;
    const token = ++epoch;
    phase = "opening";
    ownHistory();
    state.searchOpen = true;
    if (state.page !== "chats" || state.mobile) {
      state.page = "chats";
      state.mobile = false;
      render();
      await Promise.all(
        document
          .getAnimations()
          .filter((a) => a.effect?.target?.matches(".sidebar,.workspace"))
          .map((a) => a.finished.catch(() => {})),
      );
    }
    if (token !== epoch) return;
    savedScroll = document.querySelector("#chat-list")?.scrollTop || 0;
    sync();
    await morph(true, token);
    if (token !== epoch) return;
    phase = "open";
    sync();
  }
  async function close(instant = false, fromBack = false) {
    if (phase === "closed" || phase === "closing") return;
    clearTimeout(filterTimer);
    document.querySelector("#chat-list")?.removeAttribute("aria-busy");
    field()?.classList.remove("search-pending");
    const token = ++epoch;
    phase = "closing";
    // Blur first; keep the expanded surface attached to the recovering viewport.
    input()?.blur();
    if (!instant && mobile() && window.visualViewport) {
      await new Promise(resolve => {
        const started=performance.now();
        let stable=0, last=visualViewport.height;
        function recovered() {
          const height=visualViewport.height;
          stable=Math.abs(height-last)<1?stable+1:0; last=height;
          const inset=Math.max(0,innerHeight-height-visualViewport.offsetTop);
          if ((inset<2&&stable>=2)||performance.now()-started>700) resolve();
          else requestAnimationFrame(recovered);
        }
        requestAnimationFrame(recovered);
      });
    }
    if (token !== epoch) return;
    if (!instant) await morph(false, token);
    if (token !== epoch) return;
    input()?.blur();
    phase = "closed";
    query = "";
    state.searchOpen = false;
    sync();
    renderList("");
    const list = document.querySelector("#chat-list");
    if (list) list.scrollTop = savedScroll;
    if (!instant && !pointerMode) trigger()?.focus({ preventScroll: true });
    if (fromBack) historyOwned = false;
    else await dropHistory();
  }
  function install() {
    document.addEventListener("input", event => {
      if(event.target.id!=="chat-search")return;
      event.stopImmediatePropagation();
      clearTimeout(filterTimer);
      const value=event.target.value;
      document.querySelector("#chat-list")?.setAttribute("aria-busy","true");
      field()?.classList.add("search-pending");
      filterTimer=setTimeout(()=>{
        if(phase!=="closed"&&phase!=="closing")renderList(value);
        document.querySelector("#chat-list")?.removeAttribute("aria-busy");
        field()?.classList.remove("search-pending");
      },120);
    },true);
    const original = renderList;
    renderList = function (value = query) {
      query = phase === "closed" ? "" : value;
      const list = document.querySelector("#chat-list");
      if (!list) return;
      if (phase === "closed") {
        original("");
        return;
      }
      list.querySelectorAll(".search-leaving").forEach((n) => n.remove());
      const old = [...list.children].map((n) => ({
        node: n,
        key: n.dataset.action || "empty",
        rect: n.getBoundingClientRect(),
        html: n.outerHTML,
      }));
      original(query);
      const fresh = [...list.children],
        keys = new Set(fresh.map((n) => n.dataset.action || "empty")),
        bounds = list.getBoundingClientRect();
      fresh.forEach((node, i) => {
        const key = node.dataset.action || "empty",
          before = old.find((n) => n.key === key);
        if (before && (before.html === node.outerHTML || key === "empty")) {
          node.replaceWith(before.node);
          node = before.node;
        }
        const after = node.getBoundingClientRect();
        if (before) {
          const delta = before.rect.top - after.top;
          if (delta)
            AquaMotion.play(
              node,
              [{ transform: `translateY(${delta}px)` }, { transform: "none" }],
              230,
            );
        }
        if (key === "empty") {
          node.innerHTML = `<span class="search-empty-art">${icon("search")}</span><strong>Ничего не найдено</strong><span>Попробуйте другое имя или название чата</span>`;
          node.setAttribute("role", "status");
          if (!before)
            AquaMotion.play(
              node,
              [
                { opacity: 0, transform: "scale(.96)" },
                { opacity: 1, transform: "none" },
              ],
              220,
            );
        } else if (!before)
          AquaMotion.play(
            node,
            [
              { opacity: 0, transform: "translateX(12px)" },
              { opacity: 1, transform: "none" },
            ],
            190,
            Math.min(i, 4) * 18,
          );
      });
      if (AquaMotion.isEnabled())
        old
          .filter((n) => !keys.has(n.key))
          .forEach(({ node, rect }) => {
            if (rect.bottom < bounds.top || rect.top > bounds.bottom) return;
            node.classList.add("search-leaving");
            node.inert = true;
            node.setAttribute("aria-hidden", "true");
            node.removeAttribute("data-action");
            Object.assign(node.style, {
              position: "absolute",
              left: `${rect.left - bounds.left}px`,
              top: `${rect.top - bounds.top + list.scrollTop}px`,
              width: `${rect.width}px`,
              margin: 0,
            });
            list.append(node);
            AquaMotion.play(
              node,
              [
                { opacity: 1, transform: "none" },
                { opacity: 0, transform: "translateX(-10px) scale(.985)" },
              ],
              150,
            ).then(() => node.remove());
          });
    };
    document.addEventListener(
      "click",
      (e) => {
        const button = e.target.closest("[data-action]"),
          action = button?.dataset.action;
        if (action === "search") {
          e.preventDefault();
          e.stopImmediatePropagation();
          open(button.getBoundingClientRect());
          return;
        }
        if (action === "closesearch") {
          e.preventDefault();
          e.stopImmediatePropagation();
          close();
          return;
        }
        if (e.target.closest(".sidebar-search") && phase === "closed") {
          e.preventDefault();
          open(field().getBoundingClientRect());
          return;
        }
        if (
          action &&
          (action.startsWith("nav:") ||
            action.startsWith("chat:") ||
            action.startsWith("auth:"))
        )
          close(true);
      },
      true,
    );
    document.addEventListener("keydown", (e) => {
      if (
        e.key === "Escape" &&
        phase !== "closed" &&
        !document.querySelector("dialog[open]")
      ) {
        e.preventDefault();
        close();
      }
      if (
        e.target.id === "chat-search" &&
        phase === "closed" &&
        ["Enter", " "].includes(e.key)
      ) {
        e.preventDefault();
        open(field().getBoundingClientRect());
      }
    });
    window.addEventListener("resize", () => {
      sync();
    });
    window.visualViewport?.addEventListener("resize", viewport);
    window.visualViewport?.addEventListener("scroll", viewport);
    window.addEventListener("popstate", () => {
      if (releaseHistory) {
        const done = releaseHistory;
        releaseHistory = null;
        historyPending = null;
        done();
        return;
      }
      if (phase === "closed" && history.state?.aquaSearch) {
        historyOwned = true;
        open();
        return;
      }
      if (phase !== "closed" && !history.state?.aquaSearch) close(false, true);
    });
  }
  return { install, sync, open, close };
})();
