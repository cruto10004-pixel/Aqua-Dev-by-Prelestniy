/* Операции над изображением на HTML5 Canvas. Без DOM-состояния: функции принимают и возвращают canvas.
   Фильтры сделаны попиксельно (getImageData), а не через ctx.filter — он не работает в части версий Safari,
   а так результат одинаков во всех браузерах. */

export const MAX_DIM = 1920;      // дольше стороны не храним: экономит память и трафик (особенно на телефонах)

export const FILTERS = [
  { id: 'none',  label: 'Оригинал' },
  { id: 'mono',  label: 'Ч/Б' },
  { id: 'sepia', label: 'Сепия' },
  { id: 'vivid', label: 'Яркий' },
  { id: 'cool',  label: 'Холод' },
  { id: 'warm',  label: 'Тепло' },
  { id: 'fade',  label: 'Блёклый' },
];

const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Попиксельные формулы. Каждая получает (r, g, b) и возвращает массив [r, g, b]. */
const PIXEL = {
  mono:  (r, g, b) => { const y = 0.299 * r + 0.587 * g + 0.114 * b; return [y, y, y]; },
  sepia: (r, g, b) => [0.393 * r + 0.769 * g + 0.189 * b, 0.349 * r + 0.686 * g + 0.168 * b, 0.272 * r + 0.534 * g + 0.131 * b],
  vivid: (r, g, b) => {                                   // насыщенность ×1.35 и контраст ×1.1
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const s = (c) => (y + (c - y) * 1.35 - 128) * 1.1 + 128;
    return [s(r), s(g), s(b)];
  },
  cool:  (r, g, b) => [r * 0.9, g * 1.0, b * 1.15 + 6],   // сдвиг в бирюзово-синий — цвет Aqua
  warm:  (r, g, b) => [r * 1.1 + 6, g * 1.02, b * 0.88],
  fade:  (r, g, b) => [(r - 128) * 0.82 + 142, (g - 128) * 0.82 + 142, (b - 128) * 0.82 + 146],
};

/** Применяет фильтр к canvas «на месте». */
export function applyFilter(canvas, id) {
  const fn = PIXEL[id];
  if (!fn) return;
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const [r, g, b] = fn(d[i], d[i + 1], d[i + 2]);
    d[i] = clamp(r); d[i + 1] = clamp(g); d[i + 2] = clamp(b);
  }
  ctx.putImageData(img, 0, 0);
}

export function newCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export function cloneCanvas(src) {
  const c = newCanvas(src.width, src.height);
  c.getContext('2d').drawImage(src, 0, 0);
  return c;
}

/** Загружает File/Blob в canvas, уменьшая до MAX_DIM. EXIF-поворот учитывает createImageBitmap. */
export async function loadImageToCanvas(file) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { bmp = await createImageBitmap(file); }
  const k = Math.min(1, MAX_DIM / Math.max(bmp.width, bmp.height));
  const c = newCanvas(bmp.width * k, bmp.height * k);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return c;
}

/** Поворот на 90° по часовой стрелке. */
export function rotate90(src) {
  const c = newCanvas(src.height, src.width);
  const ctx = c.getContext('2d');
  ctx.translate(c.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(src, 0, 0);
  return c;
}

/** Обрезка по прямоугольнику {x, y, w, h} в координатах src. */
export function cropCanvas(src, { x, y, w, h }) {
  const c = newCanvas(w, h);
  c.getContext('2d').drawImage(src, Math.round(x), Math.round(y), Math.round(w), Math.round(h), 0, 0, c.width, c.height);
  return c;
}

/** Рисует текст с тёмной обводкой (читается на любом фоне). (x, y) — левый край, середина строки. */
export function drawText(canvas, text, x, y, { color = '#ffffff', size = 48 } = {}) {
  const ctx = canvas.getContext('2d');
  ctx.font = `700 ${size}px -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, size / 7);
  ctx.strokeStyle = 'rgba(0, 20, 40, .55)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/** Итог: JPEG-файл с применённым фильтром (под прозрачные PNG подкладывается белый фон). */
export function exportJpeg(work, filterId, quality = 0.9) {
  const out = newCanvas(work.width, work.height);
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(work, 0, 0);
  applyFilter(out, filterId);
  return new Promise((resolve, reject) =>
    out.toBlob((b) => (b ? resolve(new File([b], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' })) : reject(new Error('Не удалось сохранить изображение.'))), 'image/jpeg', quality));
}
