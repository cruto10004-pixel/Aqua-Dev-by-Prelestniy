/* Запись голосового: MediaRecorder + AnalyserNode (живая волна и данные для волны в сообщении).
   Панель записи: [отмена] ● 0:07 ▂▃▅▇▅▃▂ [отправить]. Нужен HTTPS или localhost. */
import { $, el } from '../dom.js';
import { VOICE_MAX_MS, VOICE_MIN_MS, VOICE_WAVE_BARS } from '../config.js';
import { haptic } from '../haptics.js';
import { toWav } from './wav.js';

// Chrome/Firefox/Edge пишут webm/ogg (opus), Safari — mp4 (aac). Берём первое поддерживаемое.
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
const TAIL_MS = 300;                   // «хвост» записи после нажатия «отправить»
const BAR_STEP_PX = 5;                 // ширина столбика + зазор в живой волне

export const voiceSupported = () =>
  Boolean(navigator.mediaDevices?.getUserMedia) && typeof window.MediaRecorder !== 'undefined';

function pickMime() {
  return MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported?.(t)) ?? '';
}

/** Сводит записанные уровни громкости к VOICE_WAVE_BARS целым числам 10..100. */
export function makeWave(levels, bars = VOICE_WAVE_BARS) {
  if (!levels.length) return Array(bars).fill(10);
  const peaks = Array.from({ length: bars }, (_, i) => {
    const from = Math.floor((i * levels.length) / bars);
    const to = Math.max(from + 1, Math.floor(((i + 1) * levels.length) / bars));
    return Math.max(...levels.slice(from, to));
  });
  const max = Math.max(...peaks, 0.05);               // нормируем, чтобы тихая речь тоже была видна
  return peaks.map((v) => Math.round(10 + 90 * Math.min(1, v / max)));
}

const fmtTime = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/**
 * @param {{onSend:(r:{blob:Blob, mime:string, duration:number, wave:number[]})=>void, onError:(msg:string)=>void}} cfg
 */
export function initVoiceRecorder({ onSend, onError }) {
  const panel = $('#recorder');
  const form = $('#composer');
  const timeEl = $('#rec-time');
  const liveEl = $('#rec-wave');
  const micBtn = $('#btn-voice');

  let recorder = null, stream = null, ctx = null, analyser = null, buf = null;
  let sampleTimer = null, startedAt = 0, levels = [], chunks = [], discard = false, starting = false, stopping = false;

  let liveBars = [];

  /** Столько столбиков, сколько помещается в панель (на десктопе их больше, чем на телефоне). */
  function buildLiveBars() {
    const count = Math.max(16, Math.floor(liveEl.clientWidth / BAR_STEP_PX));
    liveBars = Array.from({ length: count }, () => el('span', { style: '--h:8' }));
    liveEl.replaceChildren(...liveBars);
  }

  function setUi(recording) {
    panel.hidden = !recording;
    form.hidden = recording;
    micBtn.classList.toggle('is-recording', recording);
  }

  function sample() {
    analyser.getByteTimeDomainData(buf);
    let peak = 0;
    for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
    const level = Math.min(1, peak / 80);
    levels.push(level);
    // Живая волна: последние уровни, новые справа
    const tail = levels.slice(-liveBars.length);
    liveBars.forEach((bar, i) => {
      const v = tail[i - (liveBars.length - tail.length)] ?? 0;
      bar.style.setProperty('--h', String(Math.max(8, Math.round(v * 100))));
    });
    const elapsed = performance.now() - startedAt;
    timeEl.textContent = fmtTime(elapsed);
    if (elapsed >= VOICE_MAX_MS && !stopping) stop(true);
  }

  function releaseAudio() {
    clearInterval(sampleTimer);
    stream?.getTracks().forEach((t) => t.stop());          // гасим индикатор микрофона в браузере
    ctx?.close?.().catch(() => {});
    stream = ctx = analyser = null;
  }

  async function onStop() {
    let duration = (performance.now() - startedAt) / 1000;
    let mime = (recorder.mimeType || 'audio/webm').split(';')[0];
    const wave = makeWave(levels);
    let blob = new Blob(chunks, { type: mime });
    releaseAudio();
    recorder = null;
    if (discard) { setUi(false); return; }
    if (duration * 1000 < VOICE_MIN_MS) { setUi(false); onError('Слишком короткое сообщение — удерживайте дольше.'); return; }
    // Перекодируем в WAV: играет на любом устройстве, длительность точная, хвост не теряется.
    // Если браузер не смог — отправляем как есть (исходный формат).
    try {
      const wav = await toWav(blob);
      blob = wav.blob; duration = wav.duration; mime = 'audio/wav';
    } catch { /* оставляем исходную запись */ }
    setUi(false);
    onSend({ blob, mime, duration, wave });
  }

  async function start() {
    if (recorder || starting) return;
    if (!voiceSupported()) {
      onError('Запись голоса недоступна: нужен HTTPS или localhost и современный браузер.');
      return;
    }
    starting = true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      starting = false;
      onError(e.name === 'NotAllowedError' ? 'Нет доступа к микрофону. Разрешите его в настройках браузера.'
        : e.name === 'NotFoundError' ? 'Микрофон не найден.' : 'Не удалось включить микрофон.');
      return;
    }
    starting = false;

    const mime = pickMime();
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunks = []; levels = []; discard = false;
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = onStop;

    ctx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    buf = new Uint8Array(analyser.fftSize);

    startedAt = performance.now();
    timeEl.textContent = '0:00';
    recorder.start(250);
    sampleTimer = setInterval(sample, 80);
    setUi(true);
    buildLiveBars();                  // после показа панели — тогда известна её ширина
    haptic.tap();
  }

  function stop(send) {
    if (!recorder || recorder.state === 'inactive') return;
    discard = !send;
    if (!send) { clearInterval(sampleTimer); recorder.stop(); return; }
    // Отправка: пишем ещё ~0.3 с, иначе браузеры обрезают окончание фразы
    if (stopping) return;
    stopping = true;
    setTimeout(() => {
      clearInterval(sampleTimer);
      stopping = false;
      if (recorder && recorder.state !== 'inactive') { try { recorder.requestData(); } catch { /* ок */ } recorder.stop(); }
    }, TAIL_MS);
  }

  $('#rec-cancel').addEventListener('click', () => { haptic.tap(); stop(false); });
  $('#rec-send').addEventListener('click', () => { stop(true); });

  return { start, cancel: () => stop(false), isRecording: () => Boolean(recorder) };
}
