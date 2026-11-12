/* Редактор фото: кадрирование, поворот, кисть, текст, фильтры. Рабочее изображение — canvas `work`
   (правки применяются к нему); на экране показывается уменьшенная копия с фильтром.
   Недавние состояния хранятся для «Отменить» (UNDO_LIMIT штук — каждое весит как само изображение). */
import { el, icon } from '../dom.js';
import {
  FILTERS, loadImageToCanvas, cloneCanvas, rotate90, cropCanvas, drawText, exportJpeg,
  applyFilter, newCanvas,
} from './image-ops.js';

const UNDO_LIMIT = 5;
const COLORS = ['#ffffff', '#111111', '#e5484d', '#f5a524', '#2fb344', '#1290bf'];
const BRUSH_SIZES = [{ label: 'S', k: 0.006 }, { label: 'M', k: 0.012 }, { label: 'L', k: 0.024 }];
const ASPECTS = [{ label: 'Свободно', v: null }, { label: '1:1', v: 1 }, { label: '4:3', v: 4 / 3 }, { label: '16:9', v: 16 / 9 }];
const TOOLS = [
  { id: 'crop', label: 'Обрезать', icon: 'i-crop' },
  { id: 'rotate', label: 'Повернуть', icon: 'i-rotate' },
  { id: 'brush', label: 'Кисть', icon: 'i-brush' },
  { id: 'text', label: 'Текст', icon: 'i-text' },
  { id: 'filter', label: 'Фильтры', icon: 'i-photo' },
];

/** @param {{stage:HTMLElement, canvas:HTMLCanvasElement, cropBox:HTMLElement, textInput:HTMLInputElement, tools:HTMLElement}} ui */
export function createPhotoEditor({ stage, canvas, cropBox, textInput, tools, mask = null, zoomInput = null }) {
  const ctx = canvas.getContext('2d');
  let work = null;
  let undo = [];
  let tool = null;
  let filter = 'none';
  let color = COLORS[0];
  let brushK = BRUSH_SIZES[1].k;
  let aspect = null;
  let crop = null;                  // {x, y, w, h} в координатах отображаемого canvas
  let onUndoChange = () => {};

  /* ---------- Режим аватарки: круглая маска, фото двигается и масштабируется ---------- */
  let avatarMode = false;
  const av = { z: 1, tx: 0, ty: 0 };            // z — масштаб относительно «покрыть маску», tx/ty — сдвиг в px экрана
  const maskSize = () => Math.round(Math.min(stage.clientWidth, stage.clientHeight) * 0.86);
  const zMin = () => maskSize() / Math.max(1, Math.min(canvas.width, canvas.height));   // минимум: фото полностью закрывает маску
  function layoutAvatar(reset = false) {
    if (!avatarMode || !work) return;
    const S = maskSize();
    Object.assign(mask.style, { width: `${S}px`, height: `${S}px` });
    const zm = zMin();
    if (reset) { av.z = zm; av.tx = av.ty = 0; }
    av.z = Math.min(Math.max(av.z, zm), zm * 6);
    const maxX = Math.max(0, (canvas.width * av.z - S) / 2), maxY = Math.max(0, (canvas.height * av.z - S) / 2);
    av.tx = Math.min(Math.max(av.tx, -maxX), maxX); av.ty = Math.min(Math.max(av.ty, -maxY), maxY);
    canvas.style.transform = `translate(${av.tx}px, ${av.ty}px) scale(${av.z})`;
    if (zoomInput) zoomInput.value = String(av.z / zm);
  }
  const pts = new Map();
  let g = null;                                    // состояние жеста
  const gestureActive = () => avatarMode && tool !== 'brush' && tool !== 'text';
  stage.addEventListener('pointerdown', (e) => {
    if (!gestureActive() || e.target === zoomInput) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { stage.setPointerCapture(e.pointerId); } catch { /* синтетические события без активного указателя */ }
    g = { tx: av.tx, ty: av.ty, z: av.z, pts: [...pts.values()].map((p) => ({ ...p })) };
    e.preventDefault();
  });
  stage.addEventListener('pointermove', (e) => {
    if (!g || !pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const cur = [...pts.values()];
    if (cur.length >= 2 && g.pts.length >= 2) {
      const d0 = Math.hypot(g.pts[0].x - g.pts[1].x, g.pts[0].y - g.pts[1].y) || 1;
      const d1 = Math.hypot(cur[0].x - cur[1].x, cur[0].y - cur[1].y);
      av.z = g.z * (d1 / d0);
      av.tx = g.tx + ((cur[0].x + cur[1].x) - (g.pts[0].x + g.pts[1].x)) / 2;
      av.ty = g.ty + ((cur[0].y + cur[1].y) - (g.pts[0].y + g.pts[1].y)) / 2;
    } else if (cur.length === 1) {
      av.tx = g.tx + cur[0].x - g.pts[0].x; av.ty = g.ty + cur[0].y - g.pts[0].y;
    }
    layoutAvatar();
  });
  const endGesture = (e) => {
    pts.delete(e.pointerId);
    g = pts.size ? { tx: av.tx, ty: av.ty, z: av.z, pts: [...pts.values()].map((p) => ({ ...p })) } : null;
  };
  stage.addEventListener('pointerup', endGesture); stage.addEventListener('pointercancel', endGesture);
  stage.addEventListener('wheel', (e) => {
    if (!gestureActive()) return;
    e.preventDefault(); av.z *= Math.exp(-e.deltaY * 0.0015); layoutAvatar();
  }, { passive: false });
  zoomInput?.addEventListener('input', () => { av.z = zMin() * Number(zoomInput.value); layoutAvatar(); });

  /* ---------- Отрисовка ---------- */
  function render() {
    if (!work) return;
    const maxW = stage.clientWidth, maxH = stage.clientHeight;
    const k = Math.min(maxW / work.width, maxH / work.height, 1);
    canvas.width = Math.max(1, Math.round(work.width * k));
    canvas.height = Math.max(1, Math.round(work.height * k));
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(work, 0, 0, canvas.width, canvas.height);
    if (filter !== 'none') applyFilter(canvas, filter);
    if (tool === 'crop') layoutCrop();
    layoutAvatar();
  }

  const toWork = (clientX, clientY) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((clientX - r.left) * work.width) / r.width, y: ((clientY - r.top) * work.height) / r.height, k: work.width / r.width };
  };

  function snapshot() {
    undo.push(cloneCanvas(work));
    if (undo.length > UNDO_LIMIT) undo.shift();
    onUndoChange(undo.length > 0);
  }

  /* ---------- Кадрирование ---------- */
  function layoutCrop() {
    if (!crop) {
      const w = canvas.width * 0.9, h = canvas.height * 0.9;
      crop = { x: (canvas.width - w) / 2, y: (canvas.height - h) / 2, w, h };
      if (aspect) fitAspect('se');
    }
    const off = { x: canvas.offsetLeft, y: canvas.offsetTop };
    Object.assign(cropBox.style, {
      left: `${off.x + crop.x}px`, top: `${off.y + crop.y}px`, width: `${crop.w}px`, height: `${crop.h}px`,
    });
  }

  /** Подгоняет рамку под выбранные пропорции, сохраняя противоположный угол/центр. */
  function fitAspect(handle) {
    if (!aspect || !crop) return;
    let w = crop.w, h = w / aspect;
    if (h > canvas.height) { h = canvas.height; w = h * aspect; }
    if (w > canvas.width) { w = canvas.width; h = w / aspect; }
    const cx = crop.x + crop.w / 2, cy = crop.y + crop.h / 2;
    crop.w = w; crop.h = h;
    crop.x = Math.min(Math.max(0, handle === 'nw' || handle === 'sw' ? crop.x + (crop.w - w) : cx - w / 2), canvas.width - w);
    crop.y = Math.min(Math.max(0, cy - h / 2), canvas.height - h);
  }

  let drag = null;
  cropBox.addEventListener('pointerdown', (e) => {
    const handle = e.target.dataset?.h || 'move';
    drag = { handle, sx: e.clientX, sy: e.clientY, start: { ...crop } };
    cropBox.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  cropBox.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy, s = drag.start, MIN = 40;
    const W = canvas.width, H = canvas.height;
    if (drag.handle === 'move') {
      crop.x = Math.min(Math.max(0, s.x + dx), W - s.w);
      crop.y = Math.min(Math.max(0, s.y + dy), H - s.h);
    } else {
      let x1 = s.x, y1 = s.y, x2 = s.x + s.w, y2 = s.y + s.h;
      if (drag.handle.includes('w')) x1 = Math.min(Math.max(0, s.x + dx), x2 - MIN);
      if (drag.handle.includes('e')) x2 = Math.max(Math.min(W, s.x + s.w + dx), x1 + MIN);
      if (drag.handle.includes('n')) y1 = Math.min(Math.max(0, s.y + dy), y2 - MIN);
      if (drag.handle.includes('s')) y2 = Math.max(Math.min(H, s.y + s.h + dy), y1 + MIN);
      if (aspect) {                                   // ширина главная, высота подстраивается
        const w = x2 - x1;
        const h = w / aspect;
        if (drag.handle.includes('n')) y1 = y2 - h; else y2 = y1 + h;
        if (y1 < 0 || y2 > H) { return; }
      }
      crop = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    }
    layoutCrop();
  });
  const endDrag = () => { drag = null; };
  cropBox.addEventListener('pointerup', endDrag);
  cropBox.addEventListener('pointercancel', endDrag);

  function applyCrop() {
    if (!crop) return;
    const k = work.width / canvas.width;
    snapshot();
    work = cropCanvas(work, { x: crop.x * k, y: crop.y * k, w: crop.w * k, h: crop.h * k });
    crop = null;
    setTool(null);
  }

  /* ---------- Кисть ---------- */
  let stroke = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (tool === 'brush') {
      snapshot();
      const p = toWork(e.clientX, e.clientY);
      stroke = { last: p };
      canvas.setPointerCapture(e.pointerId);
      drawSegment(p, p);
      e.preventDefault();
    } else if (tool === 'text') {
      placeTextInput(e);
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!stroke) return;
    const p = toWork(e.clientX, e.clientY);
    drawSegment(stroke.last, p);
    stroke.last = p;
  });
  const endStroke = () => { if (stroke) { stroke = null; render(); } };   // полная перерисовка с фильтром
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);

  function drawSegment(a, b) {
    const w = brushK * work.width;
    for (const [c, scale] of [[work.getContext('2d'), 1], [ctx, canvas.width / work.width]]) {
      c.strokeStyle = color; c.lineWidth = w * scale; c.lineCap = c.lineJoin = 'round';
      c.beginPath(); c.moveTo(a.x * scale, a.y * scale); c.lineTo(b.x * scale + 0.01, b.y * scale); c.stroke();
    }
  }

  /* ---------- Текст ---------- */
  let textAt = null;
  function placeTextInput(e) {
    commitText();
    textAt = toWork(e.clientX, e.clientY);
    const r = stage.getBoundingClientRect();
    Object.assign(textInput.style, { left: `${e.clientX - r.left}px`, top: `${e.clientY - r.top}px`, color });
    textInput.value = '';
    textInput.hidden = false;
    setTimeout(() => textInput.focus(), 0);
    e.preventDefault();
  }
  function commitText() {
    const value = textInput.value.trim();
    if (!textInput.hidden && value && textAt) {
      snapshot();
      drawText(work, value, textAt.x, textAt.y, { color, size: Math.round(work.width * 0.06) });
      render();
    }
    textInput.hidden = true; textInput.value = ''; textAt = null;
  }
  textInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commitText(); } if (e.key === 'Escape') { e.stopPropagation(); textInput.hidden = true; } });
  textInput.addEventListener('blur', commitText);

  /* ---------- Панель инструментов ---------- */
  const sub = el('div', { class: 'editor__sub' });
  const toolButtons = new Map();

  function chips(items, current, onPick, cls = '') {
    return items.map((it) => el('button', {
      class: `chip${current(it) ? ' is-active' : ''} ${cls}`, type: 'button', onclick: () => { onPick(it); renderSub(); },
    }, it.label));
  }
  function swatches() {
    return el('div', { class: 'swatches' }, COLORS.map((c) => el('button', {
      class: `swatch${c === color ? ' is-active' : ''}`, type: 'button', style: `--c:${c}`, 'aria-label': `Цвет ${c}`,
      onclick: () => { color = c; textInput.style.color = c; renderSub(); },
    })));
  }

  function renderSub() {
    const nodes = {
      crop: () => [
        ...chips(ASPECTS, (a) => a.v === aspect, (a) => { aspect = a.v; fitAspect('se'); layoutCrop(); }),
        el('button', { class: 'btn btn--primary btn--sm', type: 'button', onclick: applyCrop }, icon('i-check', 'icon--white icon--sm'), 'Применить'),
      ],
      brush: () => [swatches(), ...chips(BRUSH_SIZES, (s) => s.k === brushK, (s) => { brushK = s.k; })],
      text: () => [swatches(), el('span', { class: 'editor__hint', text: 'Нажмите на фото, чтобы добавить надпись' })],
      filter: () => chips(FILTERS, (f) => f.id === filter, (f) => { filter = f.id; render(); }),
    }[tool];
    sub.replaceChildren(...(nodes ? nodes() : []));
    sub.hidden = !nodes;
    toolButtons.forEach((b, id) => b.classList.toggle('is-active', id === tool));
  }

  function setTool(next) {
    commitText();
    tool = next === tool ? null : next;
    cropBox.hidden = tool !== 'crop';
    if (tool !== 'crop') crop = null;
    canvas.style.cursor = tool === 'brush' ? 'crosshair' : tool === 'text' ? 'text' : '';
    stage.dataset.tool = tool ?? '';
    render();
    renderSub();
  }

  tools.replaceChildren(
    el('div', { class: 'editor__toolrow' }, TOOLS.map((t) => {
      const b = el('button', {
        class: 'icon-tile', type: 'button', dataset: { tool: t.id },
        onclick: () => {
          if (t.id === 'rotate') { snapshot(); work = rotate90(work); crop = null; render(); layoutAvatar(true); return; }
          setTool(t.id);
        },
      }, icon(t.icon, 'icon--lg'), t.label);
      toolButtons.set(t.id, b);
      return b;
    })),
    sub,
  );
  sub.hidden = true;

  window.addEventListener('resize', () => { if (work) { crop = null; render(); } });

  return {
    async load(file) {
      work = await loadImageToCanvas(file);
      undo = []; filter = 'none'; crop = null; tool = null;
      onUndoChange(false);
      setTool(null);
      render();
      layoutAvatar(true);
    },
    undo() {
      if (!undo.length) return;
      work = undo.pop(); crop = null;
      onUndoChange(undo.length > 0);
      render();
    },
    onUndoChange(fn) { onUndoChange = fn; },
    relayout: () => { crop = null; render(); },
    async export() {
      commitText();
      if (!avatarMode) return exportJpeg(work, filter);
      // Берём из рабочего изображения ровно то, что сейчас видно в круге
      const R = canvas.getBoundingClientRect(), M = mask.getBoundingClientRect();
      const f = R.width / work.width;
      const sw = M.width / f, sx = (M.left - R.left) / f, sy = (M.top - R.top) / f;
      const size = Math.max(256, Math.min(1024, Math.round(sw)));
      const sq = newCanvas(size, size), c = sq.getContext('2d');
      c.fillStyle = '#fff'; c.fillRect(0, 0, size, size);
      c.imageSmoothingQuality = 'high';
      c.drawImage(work, sx, sy, sw, sw, 0, 0, size, size);
      return exportJpeg(sq, filter);
    },
    /** Включает/выключает режим аватарки (круглая маска + перемещение и масштаб). */
    setAvatarMode(on) {
      avatarMode = on;
      canvas.style.transform = '';
      if (on) { setTool(null); render(); layoutAvatar(true); }
    },
    get size() { return work ? { w: work.width, h: work.height } : null; },
    destroy() { work = null; undo = []; textInput.hidden = true; },
  };
}
