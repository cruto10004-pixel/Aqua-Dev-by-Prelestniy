/* Константы клиента Aqua. Фронтенд отдаётся тем же сервером, что и API (тот же origin). */
export const API_BASE = '/api';
export const wsUrl = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

export const TOKEN_KEY = 'aqua.token';
export const PAGE_SIZE = 50;            // сообщений за один запрос истории

// «Печатает…»
export const TYPING_THROTTLE_MS = 2500; // как часто слать «печатаю» пока идёт набор
export const TYPING_IDLE_MS = 3000;     // через сколько тишины слать «перестал»
export const TYPING_EXPIRE_MS = 5000;   // через сколько скрывать чужой индикатор, если не пришло обновление

// Heartbeat WebSocket
export const PING_INTERVAL_MS = 25000;
export const PONG_TIMEOUT_MS = 10000;

// На сенсорных устройствах Enter — перенос строки (отправка кнопкой), как в мобильных мессенджерах.
// Поставьте false, чтобы Enter отправлял и на телефонах.
export const ENTER_NEWLINE_ON_TOUCH = true;

// Эмодзи-реакции. Порядок и значения совпадают с ALLOWED_REACTIONS на сервере (backend/app/config.py).
export const REACTIONS = [
  '\u{1F44D}', '\u2764\uFE0F', '\u{1F602}', '\u{1F62E}',
  '\u{1F622}', '\u{1F525}', '\u{1F44F}', '\u{1F389}',
  // негативные
  '\u{1F44E}', '\u{1F92C}', '\u{1F4A9}', '\u{1F921}',
];

// Голосовые сообщения
export const VOICE_MAX_MS = 5 * 60 * 1000;   // автоматическая остановка и отправка
export const VOICE_MIN_MS = 600;             // короче — считаем случайным нажатием
export const VOICE_WAVE_BARS = 40;           // столбиков волны в сообщении

// Заставка: показываем раз за сессию вкладки, но не дольше SPLASH_MAX_MS
export const SPLASH_KEY = 'aqua.splash.seen';
export const SPLASH_MAX_MS = 4500;
