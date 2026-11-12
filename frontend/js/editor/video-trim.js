/* Обрезка видео в браузере без библиотек: воспроизводим выбранный отрезок в скрытом <video>,
   кадры рисуем в canvas, звук берём через Web Audio, всё пишем MediaRecorder-ом.
   Минусы подхода: идёт в реальном времени (отрезок 20 с обрабатывается ~20 с) и вкладку нельзя сворачивать. */

const MAX_SIDE = 1280;                       // итоговое видео не больше 1280 px по длинной стороне
const MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4',
];

export const canTrim = () =>
  typeof window.MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function';

const pickMime = () => MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported?.(t)) ?? '';

const once = (target, ok, bad = 'error') => new Promise((resolve, reject) => {
  target.addEventListener(ok, resolve, { once: true });
  target.addEventListener(bad, () => reject(new Error('Не удалось прочитать видео.')), { once: true });
});

/**
 * @param {File} file
 * @param {number} start  секунды
 * @param {number} end    секунды
 * @param {{onProgress?:(ratio:number)=>void, signal?:AbortSignal}} opts
 * @returns {Promise<File>}
 */
export async function trimVideo(file, start, end, { onProgress, signal, mute = false } = {}) {
  if (!canTrim()) throw new Error('Этот браузер не умеет обрезать видео.');
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.playsInline = true; v.preload = 'auto'; v.src = url;
  if (mute) v.muted = true;                                                    // «без звука» — дорожку звука не записываем вовсе
  let audioCtx = null, timer = null, recorder = null;

  const cleanup = () => {
    clearInterval(timer);
    v.pause();
    stream?.getTracks().forEach((t) => t.stop());
    audioCtx?.close?.().catch(() => {});
    URL.revokeObjectURL(url);
  };
  let stream = null;

  try {
    await once(v, 'loadedmetadata');
    const k = Math.min(1, MAX_SIDE / Math.max(v.videoWidth, v.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(2, Math.round((v.videoWidth * k) / 2) * 2);       // чётные размеры нужны кодекам
    canvas.height = Math.max(2, Math.round((v.videoHeight * k) / 2) * 2);
    const ctx = canvas.getContext('2d');

    stream = canvas.captureStream(30);
    if (!mute) try {                                                           // звук: через Web Audio, не в динамики
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const dest = audioCtx.createMediaStreamDestination();
      audioCtx.createMediaElementSource(v).connect(dest);
      dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    } catch { /* видео без звука — не страшно */ }

    const mime = pickMime();
    recorder = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 2_500_000 });
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const stopped = new Promise((resolve) => { recorder.onstop = resolve; });

    v.currentTime = start;
    await once(v, 'seeked');
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    recorder.start(250);
    try { await v.play(); } catch { throw new Error('Браузер не разрешил обработку видео. Попробуйте ещё раз.'); }

    await new Promise((resolve, reject) => {
      timer = setInterval(() => {
        if (signal?.aborted) { reject(new DOMException('Отменено', 'AbortError')); return; }
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        onProgress?.(Math.min(1, Math.max(0, (v.currentTime - start) / (end - start))));
        if (v.currentTime >= end || v.ended) resolve();
      }, 33);
    });
    clearInterval(timer);
    v.pause();
    recorder.stop();
    await stopped;

    const type = (recorder.mimeType || mime || 'video/webm').split(';')[0];
    const ext = type.includes('mp4') ? 'mp4' : 'webm';
    onProgress?.(1);
    return new File([new Blob(chunks, { type })], `video-${Date.now()}.${ext}`, { type });
  } catch (e) {
    if (recorder && recorder.state !== 'inactive') { try { recorder.stop(); } catch { /* уже остановлен */ } }
    throw e;
  } finally {
    cleanup();
  }
}

/** Кадр видео в момент t → JPEG-обложка (ширина до 640 px). */
export async function captureCover(video, t) {
  if (Math.abs(video.currentTime - t) > 0.01) {
    video.currentTime = t;
    await once(video, 'seeked');
  }
  const k = Math.min(1, 640 / video.videoWidth);
  const c = document.createElement('canvas');
  c.width = Math.round(video.videoWidth * k);
  c.height = Math.round(video.videoHeight * k);
  c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(new File([b], 'cover.jpg', { type: 'image/jpeg' })) : reject(new Error('Не удалось сделать обложку.'))), 'image/jpeg', 0.85));
}
