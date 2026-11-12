/* WebSocket-клиент: авторизация первым сообщением, автопереподключение с экспоненциальной
   задержкой, heartbeat. Протокол описан в backend/app/routers/ws.py. */
import { wsUrl, PING_INTERVAL_MS, PONG_TIMEOUT_MS } from './config.js';

export class AquaSocket {
  /** @param {() => string} getToken */
  constructor(getToken) {
    this.getToken = getToken;
    this.ws = null;
    this.state = 'closed';            // closed | connecting | open
    this.handlers = new Map();        // type -> Set<fn>
    this.retry = 0;
    this.manualClose = false;
    this.reconnectTimer = null;
    this.pingTimer = null;
    this.pongTimer = null;

    // Вернулись в сеть / на вкладку — не ждём таймера, переподключаемся сразу.
    window.addEventListener('online', () => this._reconnectNow());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this._reconnectNow(); });
  }

  /** Подписка на событие сервера или служебное: 'state', 'ready', 'message', 'typing', ... Возвращает отписку. */
  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.handlers.get(type)?.delete(fn);
  }
  _emit(type, payload) { this.handlers.get(type)?.forEach((fn) => fn(payload)); }
  _setState(s) { if (this.state !== s) { this.state = s; this._emit('state', s); } }

  connect() {
    this.manualClose = false;
    if (this.ws) return;
    this._setState('connecting');
    const ws = new WebSocket(wsUrl());
    this.ws = ws;

    ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token: this.getToken() }));

    ws.onmessage = (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch { return; }
      if (data.type === 'ready') {
        this.retry = 0;
        this._setState('open');
        this._startHeartbeat();
      } else if (data.type === 'pong') {
        clearTimeout(this.pongTimer);
      }
      this._emit(data.type, data);
    };

    ws.onclose = (event) => {
      this._stopHeartbeat();
      if (this.ws === ws) this.ws = null;
      this._setState('closed');
      if (event.code === 4401) { this._emit('unauthorized'); return; }   // токен не принят
      if (!this.manualClose) this._scheduleReconnect();
    };
    ws.onerror = () => { /* close придёт следом */ };
  }

  /** Возвращает true, если сообщение ушло в сокет. */
  send(payload) {
    if (this.state !== 'open' || !this.ws) return false;
    this.ws.send(JSON.stringify(payload));
    return true;
  }

  close() {
    this.manualClose = true;
    clearTimeout(this.reconnectTimer);
    this._stopHeartbeat();
    if (this.ws) this.ws.close();
    this.ws = null;
    this._setState('closed');
  }

  _scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    const delay = Math.min(1000 * 2 ** this.retry, 15000) + Math.random() * 500;
    this.retry += 1;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  _reconnectNow() {
    if (this.manualClose || this.ws || !this.getToken()) return;
    clearTimeout(this.reconnectTimer);
    this.connect();
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this.pingTimer = setInterval(() => {
      this.send({ type: 'ping' });
      // Нет pong — соединение «зависло» (бывает на мобильных сетях): рвём и переподключаемся.
      this.pongTimer = setTimeout(() => this.ws?.close(), PONG_TIMEOUT_MS);
    }, PING_INTERVAL_MS);
  }
  _stopHeartbeat() { clearInterval(this.pingTimer); clearTimeout(this.pongTimer); }
}
