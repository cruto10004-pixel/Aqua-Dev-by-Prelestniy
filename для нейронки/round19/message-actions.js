/* Local message actions. Object references keep delayed actions attached to the
   selected message even when another message is inserted or removed. */
const AquaMessages = (() => {
  const definitions = {
    heart: [
      "Любовь",
      "#efafc5",
      "M12 20S3 15 3 9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6-9 11-9 11Z",
    ],
    like: [
      "Нравится",
      "#b6c6ed",
      "M8 10 12 3c3 0 2 5 2 6h5q2 0 1 3l-2 8H8ZM3 10h5v10H3Z",
    ],
    laugh: [
      "Смешно",
      "#e7c48d",
      "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM7 9l2-1 2 1m2 0 2-1 2 1M7 13h10q-1 6-5 5-4 0-5-5Z",
    ],
    wow: [
      "Удивление",
      "#c7b8e8",
      "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM8 8v1m8-1v1m-4 4c-3 0-3 5 0 5s3-5 0-5Z",
    ],
    sad: [
      "Грусть",
      "#9bcbd8",
      "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM8 9h1m6 0h1m-8 8q4-4 8 0M6 11l-2 3q2 3 4 0Z",
    ],
    fire: [
      "Огонь",
      "#edb197",
      "M12 2c2 5 8 7 8 13a8 8 0 0 1-16 0c0-3 2-6 4-8 0 4 2 5 3 5 2-3 2-6 1-10Zm0 12c-5 5-2 7 0 7s5-2 0-7Z",
    ],
  };
  let selected = null,
    reply = null,
    hold = null,
    layer = null,
    epoch = 0,
    suppressUntil = 0;
  function svg(key) {
    const d = definitions[key] || definitions.heart;
    return `<svg class="reaction-icon" style="color:${d[1]}" viewBox="0 0 24 24" aria-hidden="true"><path d="${d[2]}"/></svg>`;
  }
  function normalize(m) {
    if (!m.reactions)
      m.reactions = m.reaction ? { heart: { count: 2, mine: false } } : {};
    return m.reactions;
  }
  function reactionsHTML(m) {
    return `<div class="reaction-line">${Object.entries(normalize(m))
      .filter(([, v]) => v.count > 0)
      .map(
        ([k, v]) =>
          `<button class="reaction-chip ${v.mine ? "mine" : ""}" data-reaction="${k}" aria-label="${definitions[k][0]}: ${v.count}" aria-pressed="${v.mine}">${svg(k)}<span>${v.count}</span></button>`,
      )
      .join("")}</div>`;
  }
  function summary(m) {
    return (
      m.text ||
      m.file?.name ||
      (m.voice ? "Голосовое сообщение" : m.video ? "Видео" : "Фото")
    );
  }
  function syncChat() {
    const c = chats.find((c) => c.id === state.chat),
      bar = document.querySelector(".pinned");
    if (bar) {
      bar.querySelector("p").textContent = c?.pinned ? summary(c.pinned) : "Нет закреплённых сообщений";
    }
    document.querySelector(".reply-draft")?.remove();
    if (reply && reply.chat === state.chat) {
      const box = document.createElement("div");
      box.className = "reply-draft";
      box.innerHTML = `<div><strong>Ответ ${reply.message.out ? "себе" : esc(c.name)}</strong><p>${esc(summary(reply.message))}</p></div><button aria-label="Отменить ответ" data-message-action="cancel-reply">${icon("close")}</button>`;
      document.querySelector(".composer-wrap")?.prepend(box);
    }
  }
  function consumeReply() {
    if (!reply || reply.chat !== state.chat) return;
    const result = {
      author: reply.message.out
        ? "Вы"
        : chats.find((c) => c.id === reply.chat).name,
      text: summary(reply.message),
    };
    reply = null;
    document.querySelector(".reply-draft")?.remove();
    return result;
  }
  function refresh(m) {
    const i = messages[state.chat].indexOf(m),
      node = document.querySelector(`[data-message="${i}"]`);
    if (node) {
      node.outerHTML = messageHTML(m, i);
      AquaMotion.play(
        document.querySelector(`[data-message="${i}"] .reaction-line`),
        [
          { opacity: 0.4, transform: "scale(.85)" },
          { opacity: 1, transform: "none" },
        ],
        240,
        0,
        "spring",
      );
    }
  }
  function react(m, key) {
    const data = normalize(m),
      v = data[key] || { count: 0, mine: false };
    v.count += v.mine ? -1 : 1;
    v.mine = !v.mine;
    data[key] = v;
    refresh(m);
  }
  function ensureLayer() {
    if (layer) return;
    layer = document.createElement("dialog");
    layer.id = "message-context";
    layer.setAttribute("aria-label", "Действия с сообщением");
    document.body.append(layer);
    layer.addEventListener("cancel", (e) => {
      e.preventDefault();
      close();
    });
    layer.addEventListener("click", (event) => {
      if (event.target === layer) close();
    });
  }
  function close(instant = false) {
    epoch++;
    selected = null;
    document
      .querySelectorAll(".context-selected")
      .forEach((n) => n.classList.remove("context-selected"));
    if (!layer?.open) return;
    const token = epoch;
    const finish = () => {
      if (token === epoch) layer.close();
    };
    if (instant) finish();
    else
      AquaMotion.play(
        layer.querySelector(".context-stack"),
        [{ opacity: 1 }, { opacity: 0, transform: "scale(.97)" }],
        140,
      ).then(finish);
  }
  function open(node) {
    const m = messages[state.chat]?.[+node.dataset.message];
    if (!m || !node.isConnected) return;
    close(true);
    ensureLayer();
    selected = { message: m, chat: state.chat };
    node.classList.add("context-selected");
    const reactions = normalize(m);
    layer.innerHTML = `<div class="context-stack"><div class="reaction-toolbar" role="group" aria-label="Реакции">${Object.keys(
      definitions,
    )
      .map(
        (k) =>
          `<button data-context-reaction="${k}" aria-label="${definitions[k][0]}" aria-pressed="${!!reactions[k]?.mine}">${svg(k)}</button>`,
      )
      .join(
        "",
      )}</div><div class="context-preview">${esc(summary(m))}</div><div class="message-menu">${[
      ["reply", "back", "Ответить"],
      ["forward", "send", "Переслать"],
      ["pin", "pin", "Закрепить"],
      ...(m.text ? [["copy", "copy", "Копировать"]] : []),
      ["delete", "close", "Удалить сообщение"],
    ]
      .map(
        ([a, i, t]) =>
          `<button data-message-action="${a}" class="${a === "delete" ? "danger" : ""}">${icon(i)}${t}</button>`,
      )
      .join("")}</div></div>`;
    layer.showModal();
    const r = node.getBoundingClientRect(),
      stack = layer.querySelector(".context-stack");
    const viewportHeight = visualViewport?.height || innerHeight;
    const toolbar = stack.querySelector(".reaction-toolbar");
    const preview = stack.querySelector(".context-preview");
    const menu = stack.querySelector(".message-menu");
    // Place the controls above low messages and put reactions below the preview.
    const above = r.top + stack.offsetHeight - toolbar.offsetHeight > viewportHeight - 12;
    stack.classList.toggle("context-above", above);
    const h = stack.offsetHeight, w = stack.offsetWidth;
    const desiredTop = above
      ? r.bottom - menu.offsetHeight - preview.offsetHeight - 10
      : r.top - toolbar.offsetHeight - 10;
    stack.style.left = `${Math.max(12, Math.min(innerWidth - w - 12, r.left))}px`;
    stack.style.top = `${Math.max(12, Math.min(viewportHeight - h - 12, desiredTop))}px`;
    toolbar.style.transformOrigin = above ? '50% 0%' : '50% 100%';
    menu.style.transformOrigin = above ? '50% 100%' : '50% 0%';
    AquaMotion.play(
      stack.querySelector(".reaction-toolbar"),
      [
        { opacity: 0, transform: "scale(.88) translateY(6px)" },
        { opacity: 1, transform: "none" },
      ],
      280,
      0,
      "spring",
    );
    AquaMotion.play(
      stack.querySelector(".message-menu"),
      [
        { opacity: 0, transform: "translateY(-8px)" },
        { opacity: 1, transform: "none" },
      ],
      200,
      50,
    );
    AquaMotion.play(
      stack.querySelector(".context-preview"),
      [{ opacity: 0 }, { opacity: 1 }],
      160,
    );
  }
  function act(action) {
    if (action === "cancel-reply") {
      reply = null;
      syncChat();
      return;
    }
    const chosen = selected;
    if (!chosen) return;
    const { message: m, chat } = chosen;
    close(true);
    if (!messages[chat]?.includes(m)) return;
    if (action === "copy" && m.text) {
      if (!navigator.clipboard?.writeText) {
        toast("Буфер обмена недоступен в этом браузере");
      } else {
        navigator.clipboard.writeText(m.text).then(
          () => toast("Текст скопирован"),
          () => toast("Не удалось скопировать текст"),
        );
      }
    }
    if (action === "reply") {
      reply = chosen;
      syncChat();
      document.querySelector("#message-input")?.focus();
    }
    if (action === "pin") {
      AquaPages.pinMessage(chats.find((c) => c.id === chat), m);
      syncChat();
      toast("Сообщение закреплено");
    }
    if (action === "forward") {
      AquaPages.go("forward", {message:m});
    }

    if (action === "delete") {
      modal(
        "Удалить сообщение?",
        `<p class="note">${esc(summary(m))}</p><p class="note">Сообщение будет удалено из этой демонстрации.</p><div class="actions"><button class="soft-btn" data-action="close">Отмена</button><button class="soft-btn danger" id="confirm-message-delete">Удалить</button></div>`,
      );
      document.querySelector("#confirm-message-delete").onclick = () => {
        const list = messages[chat],
          i = list.indexOf(m);
        if (i >= 0) list.splice(i, 1);
        const c = chats.find((c) => c.id === chat);
        if (c.pinned === m) delete c.pinned;
        if (c.pins) c.pins = c.pins.filter(p => p !== m);
        if (reply?.message === m) reply = null;
        closeModal();
        if (state.chat === chat) renderChat();
        toast("Сообщение удалено");
      };
    }
  }
  function cancelHold() {
    clearTimeout(hold?.timer);
    hold = null;
  }
  document.addEventListener("pointerdown", (e) => {
    cancelHold();
    const node = e.target.closest("[data-message]");
    if (
      !node ||
      !e.isPrimary ||
      e.button !== 0 ||
      e.target.closest("button") ||
      (window.getSelection()?.toString() && node.contains(window.getSelection().anchorNode)) ||
      e.clientX <= 40
    )
      return;
    hold = {
      x: e.clientX,
      y: e.clientY,
      id: e.pointerId,
      node,
      timer: setTimeout(() => {
        suppressUntil = performance.now() + 700;
        open(node);
        cancelHold();
      }, 500),
    };
  });
  document.addEventListener("pointermove", (e) => {
    if (
      hold &&
      (Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > 9 ||
        !hold.node.contains(document.elementFromPoint(e.clientX, e.clientY)))
    )
      cancelHold();
  });
  for (const event of ["pointerup", "pointercancel"])
    document.addEventListener(event, cancelHold);
  document.addEventListener(
    "scroll",
    () => {
      cancelHold();
      if (layer?.open) close(true);
    },
    true,
  );
  window.addEventListener("resize", () => close(true));
  visualViewport?.addEventListener("resize", () => close(true));
  document.addEventListener("contextmenu", (e) => {
    const node = e.target.closest("[data-message]");
    if (node) {
      const selection = window.getSelection();
      if (selection?.toString() && node.contains(selection.anchorNode)) return;
      e.preventDefault();
      cancelHold();
      if (performance.now() >= suppressUntil) open(node);
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.shiftKey && e.key === "F10" && e.target.matches("[data-message]")) {
      e.preventDefault();
      open(e.target);
    }
  });
  document.addEventListener(
    "click",
    (e) => {
      if (
        performance.now() < suppressUntil &&
        !e.target.closest("#message-context")
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      const media = e.target.closest("[data-message] .photo");
      if (media) {
        const m = messages[state.chat][+media.closest("[data-message]").dataset.message];
        AquaPages.go("viewer", {message:m});
        return;
      }
      const reaction = e.target.closest("[data-context-reaction]");
      if (reaction && selected) {
        react(selected.message, reaction.dataset.contextReaction);
        close();
        return;
      }
      const action = e.target.closest("[data-message-action]");
      if (action) {
        act(action.dataset.messageAction);
        return;
      }
      const chip = e.target.closest("[data-reaction]");
      if (chip) {
        const m =
          messages[state.chat][+chip.closest("[data-message]").dataset.message];
        react(m, chip.dataset.reaction);
        return;
      }
      const pin = e.target.closest('[data-action="pinned"]');
      if (pin) {
        e.stopImmediatePropagation();
        AquaPages.go("pins");
      }
    },
    true,
  );
  document.addEventListener("dblclick", (e) => {
    const node = e.target.closest("[data-message]");
    if (node && !e.target.closest("button"))
      react(messages[state.chat][+node.dataset.message], "heart");
  });
  return { reactionsHTML, syncChat, consumeReply, open, close };
})();
