/* Классический (не модульный) скрипт-страж. Запускается даже там, где модули не работают.
   Если страницу открыли как файл (file://) или основной модуль не загрузился, формы не должны
   «молча» перезагружать страницу — вместо этого показываем понятную подсказку. */
(function () {
  var started = false;
  window.__aquaStarted = function () {
    started = true;
    // Медленная сеть: баннер мог успеть появиться, но приложение всё же запустилось — убираем его
    var b = document.getElementById('boot-banner');
    if (b) b.remove();
  };

  function banner(text) {
    var b = document.getElementById('boot-banner');
    if (!b) {
      b = document.createElement('div');
      b.id = 'boot-banner';
      b.className = 'boot-banner';
      b.setAttribute('role', 'alert');
      document.body.appendChild(b);
    }
    b.textContent = text;
  }

  // Пока приложение не стартовало, отправка любой формы не должна обновлять страницу
  document.addEventListener('submit', function (e) {
    if (started) return;
    e.preventDefault();
    if (location.protocol === 'file:') check(true);
    else banner('Приложение ещё загружается — подождите пару секунд и повторите.');
  }, true);

  // Настоящий сбой: скрипт не скачался или модуль упал при запуске — говорим сразу
  window.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t.tagName === 'SCRIPT') check(true);
    else if (!started) setTimeout(function () { check(true); }, 1500);
  }, true);

  // Экран «boot» скрыт; если модули долго не стартуют — показываем вход, чтобы страница не была пустой
  setTimeout(function () {
    if (started) return;
    var app = document.getElementById('app');
    if (app && app.dataset.screen === 'boot') app.dataset.screen = 'auth';
    check(false);
  }, 4000);
  // Баннер об ошибке — только если за 20 с (медленная мобильная сеть/VPN) приложение так и не запустилось
  setTimeout(function () { check(true); }, 20000);

  function check(force) {
    if (started) return;
    if (location.protocol === 'file:') {
      banner('Aqua нельзя открыть двойным кликом по файлу. Запустите сервер (uvicorn app.main:app) и откройте http://127.0.0.1:8000 — подробности в README.');
    } else if (force) {
      banner('Приложение не загрузилось. Проверьте, что папка frontend/js на месте, и обновите страницу (Ctrl+F5).');
    }
  }
  window.addEventListener('load', function () { setTimeout(function () { check(false); }, 600); });
})();
