/* Перекодирование записи в WAV (PCM 16 бит, моно).
   Зачем: webm/opus из MediaRecorder не имеет длительности в заголовке, иногда теряет хвост и не играет
   на части устройств (например, Safari). WAV проигрывается везде, перематывается и имеет точную длину. */

const RATE = 22050;                    // для голоса достаточно; 10 минут ≈ 26 МБ

function encodePcm16(samples, rate) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}

/** @returns {Promise<{blob:Blob, duration:number}>} — бросает ошибку, если браузер не смог декодировать. */
export async function toWav(blob) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  try {
    const decoded = await new Promise((resolve, reject) => {
      blob.arrayBuffer().then((ab) => ctx.decodeAudioData(ab, resolve, reject)).catch(reject);   // callback-форма — для старого Safari
    });
    const frames = Math.max(1, Math.ceil(decoded.duration * RATE));
    const off = new OfflineAudioContext(1, frames, RATE);       // 1 канал: многоканальный звук сводится в моно
    const src = off.createBufferSource();
    src.buffer = decoded;
    src.connect(off.destination);
    src.start();
    const rendered = await off.startRendering();
    return { blob: encodePcm16(rendered.getChannelData(0), RATE), duration: rendered.duration };
  } finally {
    ctx.close?.().catch(() => {});
  }
}
