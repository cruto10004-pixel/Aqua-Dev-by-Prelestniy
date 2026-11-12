/* Страховка: если ui/splash.js не загрузился, заставка всё равно исчезнет.
   Вынесено из index.html в отдельный файл — CSP запрещает встроенные скрипты. */
setTimeout(function () {
  var s = document.getElementById('splash');
  if (s) s.remove();
}, 8000);
