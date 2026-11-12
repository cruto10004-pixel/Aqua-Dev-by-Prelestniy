/* Безопасная обёртка над localStorage (может быть недоступен в приватном режиме). */
export const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* игнорируем */ } },
  remove(key) { try { localStorage.removeItem(key); } catch { /* игнорируем */ } },
};

/** То же для sessionStorage (живёт, пока открыта вкладка). */
export const session = {
  get(key) { try { return sessionStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { sessionStorage.setItem(key, value); } catch { /* игнорируем */ } },
};
