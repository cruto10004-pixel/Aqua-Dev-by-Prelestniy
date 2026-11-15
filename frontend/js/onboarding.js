// Local design prototype. No network requests, account creation or persistent storage.
(() => {
  const $ = s => document.querySelector(s);
  const screens = [...document.querySelectorAll('[data-step]')];
  const labels = ['ДОБРО ПОЖАЛОВАТЬ', 'ВАШЕ СОГЛАСИЕ', 'НОМЕР ОТ БОТА', 'ПОДТВЕРЖДЕНИЕ', 'ВАШ ПРОФИЛЬ', 'ВСЁ ГОТОВО', 'ДЕМО AQUA'];
  let step = 0, moving = false, photoUrl = '', photoRequest = 0;
  let flow = 'register', successTimer;
  const demoProfile = {number: '12345678901', name: 'Мира Волна', username: 'mira_wave'};
  const route = () => flow === 'login' ? [0, 2, 3, 7, 6] : [0, 1, 2, 3, 4, 5, 6];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  function show(next) {
    if (moving || !Number.isInteger(next) || next < 0 || next >= screens.length) return;
    clearTimeout(successTimer);
    moving = true;
    $('.journey').classList.toggle('reverse', route().indexOf(next) < route().indexOf(step));
    document.activeElement?.blur();
    screens[step].classList.add('leaving');
    setTimeout(() => {
      screens[step].hidden = true;
      screens[step].classList.remove('leaving');
      step = next;
      $('.shell').scrollTop = 0;
      screens[step].hidden = false;
      $('#back').hidden = step === 0;
      const total = route().length - 1;
      const position = Math.min(route().indexOf(step) + 1, total);
      $('#step-label').textContent = step === 7 ? 'ВХОД ПОДТВЕРЖДЁН' : labels[step];
      $('#step-count').textContent = `${String(position).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
      $('#progress-fill').style.width = `${position / total * 100}%`;
      const heading = screens[step].querySelector('h2');
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
      if (innerWidth <= 700) window.scrollTo({ top: 0, behavior: 'instant' });
      moving = false;
      if (step === 7) successTimer = setTimeout(() => show(6), reduced.matches ? 900 : 1700);
    }, reduced.matches ? 0 : 220);
  }
  function begin(nextFlow) {
    if (moving) return;
    flow = nextFlow;
    $('#bot-number').value = '';
    $('#number-error').textContent = '';
    $('#bot-number').removeAttribute('aria-invalid');
    $('#bot-hint').hidden = true;
    cells.forEach(c => c.value = ''); refreshOtp();
    const login = flow === 'login';
    $('[data-step="2"] h2').textContent = login ? 'С возвращением!' : 'Номер от бота';
    $('[data-step="2"] .lead').textContent = 'Введите целиком номер, полученный от Telegram-бота Aqua. Это не номер телефона и не код подтверждения.';
    $('[data-step="3"] h2').textContent = login ? 'Подтверждение входа' : 'Подтвердите номер';
    $('#login-fixture').hidden = !login;
    $('#home-back').textContent = login ? 'На стартовый экран' : 'Вернуться к профилю';
    show(login ? 2 : 1);
  }
  function previous() {
    const previousStep = route()[route().indexOf(step) - 1];
    if (step === 3 || step === 7) { cells.forEach(c => c.value = ''); refreshOtp(); }
    show(previousStep);
  }
  document.querySelectorAll('[data-next]').forEach(b => b.addEventListener('click', () => step === 0 ? begin('register') : show(route()[route().indexOf(step) + 1])));
  document.querySelectorAll('[data-prev]').forEach(b => b.addEventListener('click', previous));
  $('#back').onclick = previous;
  $('#start-login').onclick = () => begin('login');
  $('#home-back').onclick = () => show(flow === 'login' ? 0 : 5);
  $('#consent').onchange = e => { $('#policy-next').disabled = !e.target.checked; };
  $('#policy-next').onclick = () => { if ($('#consent').checked) show(2); };
  $('#bot-info').onclick = () => { $('#bot-hint').hidden = !$('#bot-hint').hidden; };
  $('#number-form').onsubmit = e => {
    e.preventDefault();
    const input = $('#bot-number'), digits = input.value.replace(/\s/g, '');
    const valid = /^[0-9]{11}$/.test(digits);
    $('#number-error').textContent = valid ? '' : 'Введите весь номер от бота: 11 цифр. Для демо: 12345678901.';
    input.setAttribute('aria-invalid', String(!valid));
    if (!valid) { input.focus(); return; }
    if (flow === 'login' && digits !== demoProfile.number) {
      $('#number-error').textContent = 'Демо-аккаунт не найден. Для входа используйте номер 12345678901 или вернитесь и создайте аккаунт.';
      input.setAttribute('aria-invalid', 'true'); input.focus(); return;
    }
    cells.forEach(c => c.value = ''); refreshOtp();
    input.value = digits; $('#number-preview').textContent = digits; show(3);
  };
  const otp = $('.otp');
  for (let i = 0; i < 6; i++) {
    const input = document.createElement('input');
    input.type = 'text'; input.inputMode = 'numeric'; input.maxLength = 1;
    input.autocomplete = i === 0 ? 'one-time-code' : 'off';
    input.setAttribute('aria-label', `Цифра ${i + 1}`);
    input.setAttribute('aria-describedby', 'otp-error');
    otp.append(input);
  }
  const cells = [...otp.children];
  function refreshOtp() { otp.classList.remove('invalid'); $('#otp-error').textContent = ''; cells.forEach(c => { c.classList.toggle('filled', !!c.value); c.removeAttribute('aria-invalid'); }); }
  function insertCode(value, start) {
    const digits = value.replace(/\D/g, '').slice(0, 6);
    if (!digits) return;
    if (digits.length === 6) start = 0;
    [...digits].forEach((d, i) => { if (cells[start + i]) cells[start + i].value = d; });
    refreshOtp(); cells[Math.min(start + digits.length, 5)].focus();
  }
  cells.forEach((c, i) => {
    c.addEventListener('input', () => { const v = c.value; c.value = ''; insertCode(v, i); refreshOtp(); });
    c.addEventListener('paste', e => { e.preventDefault(); insertCode(e.clipboardData.getData('text'), i); });
    c.addEventListener('focus', () => c.select());
    c.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !c.value && i > 0) { e.preventDefault(); cells[i - 1].value = ''; cells[i - 1].focus(); refreshOtp(); }
      if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); cells[i - 1].focus(); }
      if (e.key === 'ArrowRight' && i < 5) { e.preventDefault(); cells[i + 1].focus(); }
    });
  });
  $('#otp-form').onsubmit = e => {
    e.preventDefault();
    if (cells.map(c => c.value).join('') !== '123456') {
      $('#otp-error').textContent = 'Для прототипа используйте тестовый код 123456.';
      otp.classList.add('invalid'); cells.forEach(c => c.setAttribute('aria-invalid', 'true')); cells[0].focus(); return;
    }
    if (flow === 'login') {
      $('#home-name').textContent = demoProfile.name;
      $('#home-username').textContent = '@' + demoProfile.username;
      $('#home-avatar').replaceChildren(Object.assign(document.createElement('span'), {textContent: 'М'}));
      show(7);
    } else show(4);
  };
  function paintAvatar(target) {
    target.replaceChildren();
    if (photoUrl) { const img = new Image(); img.alt = 'Выбранное фото профиля'; img.src = photoUrl; target.append(img); }
    else { const span = document.createElement('span'); span.textContent = $('#display-name').value.trim().slice(0, 1).toUpperCase() || 'А'; target.append(span); }
  }
  $('#display-name').oninput = () => { if (!photoUrl) paintAvatar($('#avatar-preview')); };
  $('#photo').onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    const request = ++photoRequest;
    $('#photo-error').textContent = '';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      $('#photo-error').textContent = 'Выберите JPG, PNG или WebP размером до 5 МБ.'; e.target.value = ''; return;
    }
    const next = URL.createObjectURL(file), image = new Image(); image.src = next;
    try { await image.decode(); } catch { URL.revokeObjectURL(next); if (request !== photoRequest) return; $('#photo-error').textContent = 'Не удалось прочитать изображение. Выберите другое фото.'; e.target.value = ''; return; }
    if (request !== photoRequest) { URL.revokeObjectURL(next); return; }
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = next; paintAvatar($('#avatar-preview')); if ($('#photo-dialog').open) paintAvatar($('#photo-large')); $('#remove-photo').hidden = false;
  };
  $('#remove-photo').onclick = () => {
    photoRequest++;
    if (photoUrl) URL.revokeObjectURL(photoUrl); photoUrl = ''; $('#photo').value = '';
    paintAvatar($('#avatar-preview')); $('#remove-photo').hidden = true; $('#photo-error').textContent = '';
  };
  $('#profile-form').onsubmit = e => {
    e.preventDefault();
    const name = $('#display-name').value.trim(), user = $('#username').value.trim();
    let invalid = null;
    if (!name) invalid = $('#display-name'); else if (!/^[a-zA-Z0-9_]{3,24}$/.test(user)) invalid = $('#username');
    $('#profile-error').textContent = !name ? 'Как к вам обращаться? Укажите имя или никнейм.' : invalid ? 'Username: от 3 до 24 символов — латиница, цифры и _.' : '';
    [$('#display-name'), $('#username')].forEach(c => c.setAttribute('aria-invalid', String(c === invalid)));
    if (invalid) { invalid.focus(); return; }
    $('#final-name').textContent = `${name}!`; $('#final-username').textContent = `@${user}`; $('#final-bio').textContent = $('#bio').value.trim();
    paintAvatar($('#final-avatar')); paintAvatar($('#home-avatar'));
    $('#home-name').textContent = name; $('#home-username').textContent = '@' + user; show(5);
  };
  document.querySelectorAll('.ambient i').forEach((el, i) => {
    const values = {'--x': `${(i * 37 + 7) % 100}%`, '--y': `${(i * 23 + 3) % 100}%`, '--size': `${12 + (i * 13) % 42}px`, '--alpha': `${.035 + (i % 4) * .019}`, '--radius': i % 3 === 0 ? '50%' : '22%', '--duration': `${18 + i % 9 * 3}s`, '--delay': `${-i * 3}s`, '--dx': `${i % 2 ? -40 : 50}px`, '--dy': `${-60 - i % 5 * 20}px`, '--spin': `${i % 2 ? 65 : -80}deg`};
    Object.entries(values).forEach(([k, v]) => el.style.setProperty(k, v));
  });
  // Adapt the app viewport to the actual space above the system keyboard.
  const viewport = window.visualViewport;
  function resizeViewport() { document.documentElement.style.setProperty('--app-height', `${viewport?.height || innerHeight}px`); }
  viewport?.addEventListener('resize', resizeViewport);
  window.addEventListener('resize', resizeViewport);
  resizeViewport();
  const photoDialog = $('#photo-dialog');
  $('.upload').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#photo').click(); } });
  $('#avatar-preview').onclick = () => { paintAvatar($('#photo-large')); photoDialog.showModal(); };
  $('.dialog-close').onclick = () => photoDialog.close();
  $('#photo-done').onclick = () => photoDialog.close();
  $('#photo-choose').onclick = () => $('#photo').click();
  $('#photo-delete').onclick = () => { $('#remove-photo').click(); paintAvatar($('#photo-large')); };
  $('#restart').onclick = () => {
    clearTimeout(successTimer);
    $('#remove-photo').click(); document.querySelectorAll('form').forEach(f => f.reset());
    $('#consent').checked = false; $('#policy-next').disabled = true; $('#bot-hint').hidden = true;
    document.querySelectorAll('.error').forEach(e => e.textContent = '');
    document.querySelectorAll('[aria-invalid]').forEach(e => e.removeAttribute('aria-invalid'));
    refreshOtp(); paintAvatar($('#avatar-preview')); show(0);
  };
})();
