/* Конфигурация Capacitor. Адрес сервера берётся из переменной окружения AQUA_URL
   (в GitHub Actions — из входного параметра или переменной репозитория AQUA_URL). */
const url = (process.env.AQUA_URL || '').replace(/\/+$/, '');
if (!url.startsWith('https://')) {
  throw new Error('Задайте AQUA_URL — https-адрес вашего сервера, например https://aqua-production.up.railway.app');
}

module.exports = {
  appId: 'com.aqua.messenger',
  appName: 'Aqua',
  webDir: 'www',                       // запасная страница на случай, если сервер недоступен
  server: {
    url,                               // приложение загружается с сервера: обновления без пересборки APK
    cleartext: false,
    androidScheme: 'https',
  },
  android: { allowMixedContent: false },
};
