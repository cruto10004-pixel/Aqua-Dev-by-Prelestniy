// Local design prototype. No network requests, account creation or persistent storage.
(() => {
  const $ = s => document.querySelector(s);
  const screens = [...document.querySelectorAll('[data-step]')];
  const labels = ['ДОБРО ПОЖАЛОВАТЬ', 'ВАШЕ СОГЛАСИЕ', 'НОМЕР ОТ БОТА', 'ПОДТВЕРЖДЕНИЕ', 'ВАШ ПРОФИЛЬ', 'ВСЁ ГОТОВО', 'ДЕМО AQUA', 'ВХОД ПОДТВЕРЖДЁН', 'УЧЁТНАЯ ЗАПИСЬ', 'НОВЫЙ ПАРОЛЬ', 'ВОССТАНОВЛЕНИЕ ЗАВЕРШЕНО'];
  let step = 0, moving = false, photoUrl = '', photoRequest = 0;
  let flow = 'login', successTimer;
  const demoProfile = {number: '12345678901', name: 'Мира Волна', username: 'mira_wave'};
  const route = () => flow === 'login' ? [0, 7, 6] : flow === 'recover' ? [0, 2, 3, 9, 10] : [0, 1, 2, 3, 8, 4, 5, 6];
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
      if (next === 0) { flow = 'login'; document.querySelectorAll('[data-password]').forEach(i => i.value = ''); }
      document.querySelectorAll('input[type=password], input[data-password]').forEach(input => { input.type = 'password'; input.nextElementSibling?.setAttribute('aria-pressed', 'false'); if(input.nextElementSibling?.matches('.password-toggle')) input.nextElementSibling.textContent = 'Показать'; });
      $('.shell').scrollTop = 0;
      screens[step].hidden = false;
      $('#back').hidden = [0, 6, 10].includes(step);
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
    document.querySelectorAll('.error').forEach(e => e.textContent = '');
    $('#bot-number').value = '';
    $('#number-error').textContent = '';
    $('#bot-number').removeAttribute('aria-invalid');
    $('#bot-hint').hidden = true;
    cells.forEach(c => c.value = ''); refreshOtp();
    const login = flow === 'recover';
    $('[data-step="2"] h2').textContent = login ? 'Восстановление доступа' : 'Номер от бота';
    $('[data-step="2"] .lead').textContent = 'Введите целиком номер, полученный от Telegram-бота Aqua. Это не номер телефона и не код подтверждения.';
    $('[data-step="3"] h2').textContent = login ? 'Подтверждение восстановления' : 'Подтвердите номер';
    $('#login-fixture').hidden = !login;
    if (login) $('[data-step="2"] .lead').textContent = 'Для восстановления введите номер, полученный от Telegram-бота Aqua. Демонстрация: код не отправляется.';
    $('#home-back').textContent = login ? 'На стартовый экран' : 'Вернуться к профилю';
    document.querySelectorAll('[data-password]').forEach(i => i.value = '');
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
  $('#create-account').onclick = () => begin('register');
  $('#forgot-password').onclick = () => begin('recover');
  $('#return-login').onclick = () => show(0);
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
    if (flow === 'recover' && digits !== demoProfile.number) {
      $('#number-error').textContent = 'Демо-аккаунт не найден. Для входа используйте номер 12345678901 или вернитесь и создайте аккаунт.';
      input.setAttribute('aria-invalid', 'true'); input.focus(); return;
    }
    cells.forEach(c => c.value = ''); refreshOtp();
    input.value = digits; $('#number-preview').textContent = digits; show(3);
  };
  const otp = $('.otp');
  for (let i = 0; i < 6; i++) {
    const input = document.createElement('input');
    input.type = 'text'; input.inputMode = 'none'; input.readOnly = true; input.maxLength = 1;
    input.autocomplete = i === 0 ? 'one-time-code' : 'off';
    input.setAttribute('aria-label', `Цифра ${i + 1}`);
    input.setAttribute('aria-describedby', 'otp-error');
    otp.append(input);
  }
  const cells = [...otp.children];
  let activeCell = 0, editingCell = false;
  const keypad = $('.keypad');
  for (const value of ['1','2','3','4','5','6','7','8','9','delete','0']) {
    const key = document.createElement('button'); key.type = 'button'; key.className = 'keypad-key'; key.dataset.key = value;
    if (value === 'delete') { key.setAttribute('aria-label', 'Удалить последнюю цифру'); key.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5h11v14H9l-7-7z" fill="currentColor" stroke="none"/></svg>'; }
    else key.textContent = value;
    key.addEventListener('click', () => { if (value === 'delete') deleteDigit(); else typeDigit(value); });
    keypad.insertBefore(key, $('.keypad-confirm'));
  }
  function selectCell(index, editing = false) {
    activeCell = index; editingCell = editing;
    cells.forEach((c, i) => c.classList.toggle('is-active', i === index));
    cells[index].focus({preventScroll: true});
  }
  function typeDigit(value) {
    if (moving || step !== 3) return;
    const index = editingCell ? activeCell : cells.findIndex(c => !c.value);
    if (index < 0) return;
    cells[index].value = value; refreshOtp();
    const next = cells.findIndex(c => !c.value);
    selectCell(next < 0 ? index : next);
  }
  function deleteDigit() {
    const index = cells.findLastIndex(c => c.value);
    if (index < 0) { selectCell(0); return; }
    cells[index].value = ''; refreshOtp(); selectCell(index);
  }
  $('#otp-paste').onclick = async () => {
    try { const text = await navigator.clipboard.readText(); if (!/\d/.test(text)) throw Error(); insertCode(text, 0); }
    catch { $('#otp-error').textContent = 'Не удалось вставить код. Разрешите доступ к буферу или введите цифры на клавиатуре ниже.'; }
  };
  function refreshOtp() {
    $('.keypad-confirm').disabled = cells.some(c => !c.value);
    if (cells.every(c => !c.value)) { activeCell = 0; editingCell = false; }
    cells.forEach((c, i) => c.classList.toggle('is-active', i === activeCell)); otp.classList.remove('invalid'); $('#otp-error').textContent = ''; cells.forEach(c => { c.classList.toggle('filled', !!c.value); c.removeAttribute('aria-invalid'); }); }
  function insertCode(value, start) {
    const digits = value.replace(/\D/g, '').slice(0, 6);
    if (!digits) return;
    if (digits.length === 6) start = 0;
    [...digits].forEach((d, i) => { if (cells[start + i]) cells[start + i].value = d; });
    refreshOtp(); selectCell(Math.min(start + digits.length, 5));
  }
  cells.forEach((c, i) => {
    c.addEventListener('input', () => { const v = c.value; c.value = ''; insertCode(v, i); refreshOtp(); });
    c.addEventListener('paste', e => { e.preventDefault(); insertCode(e.clipboardData.getData('text'), i); });
    c.addEventListener('click', () => selectCell(i, !!c.value));
    c.addEventListener('keydown', e => {
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); typeDigit(e.key); }
      if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); deleteDigit(); }
      if (e.key === 'Enter' && !$('.keypad-confirm').disabled) { e.preventDefault(); $('#otp-form').requestSubmit(); }
      if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); selectCell(i - 1, !!cells[i - 1].value); }
      if (e.key === 'ArrowRight' && i < 5) { e.preventDefault(); selectCell(i + 1, !!cells[i + 1].value); }
    });
  });
  $('#otp-form').onsubmit = e => {
    e.preventDefault();
    if (cells.map(c => c.value).join('') !== '123456') {
      $('#otp-error').textContent = 'Для прототипа используйте тестовый код 123456.';
      otp.classList.add('invalid'); cells.forEach(c => c.setAttribute('aria-invalid', 'true')); selectCell(0, true); return;
    }
    show(flow === 'recover' ? 9 : 8);
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
    let invalid = !name ? $('#display-name') : null;
    $('#profile-error').textContent = !name ? 'Как к вам обращаться? Укажите имя или никнейм.' : invalid ? 'Username: от 3 до 24 символов — латиница, цифры и _.' : '';
    [$('#display-name'), $('#username')].forEach(c => c.setAttribute('aria-invalid', String(c === invalid)));
    if (invalid) { invalid.focus(); return; }
    $('#final-name').textContent = `${name}!`; $('#final-username').textContent = `@${user}`; $('#final-bio').textContent = $('#bio').value.trim();
    $('#reg-password').value = ''; $('#reg-repeat').value = '';
    paintAvatar($('#final-avatar')); paintAvatar($('#home-avatar'));
    $('#home-name').textContent = name; $('#home-username').textContent = '@' + user; show(5);
  };
  // All credentials below are disposable demo fixtures, never a server session.
  function passwordError(password, repeat) {
    if ([...password].length < 8 || !/[a-z]/.test(password) || !/[0-9]/.test(password)) return 'Нужны минимум 8 символов, строчная латинская буква и цифра.';
    if (new TextEncoder().encode(password).length > 72) return 'Пароль слишком длинный: максимум 72 байта.';
    if (password !== repeat) return 'Пароли не совпадают.';
    return '';
  }
  document.querySelectorAll('input[type=password]').forEach(input => {
    input.dataset.password = '';
    const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'password-toggle'; toggle.textContent = 'Показать'; toggle.setAttribute('aria-label', 'Показать или скрыть: ' + input.parentElement.firstChild.textContent); toggle.setAttribute('aria-pressed', 'false');
    toggle.onclick = () => { const reveal = input.type === 'password'; input.type = reveal ? 'text' : 'password'; toggle.textContent = reveal ? 'Скрыть' : 'Показать'; toggle.setAttribute('aria-pressed', String(reveal)); };
    input.after(toggle);
  });
  $('#login-form').onsubmit = e => {
    e.preventDefault();
    const name = $('#login-name').value.trim(), password = $('#login-password').value;
    $('#login-error').textContent = !name || !password ? 'Введите логин и пароль.' : name !== demoProfile.username || password !== 'Aqua2026' ? 'Неверный демо-логин или пароль. Используйте mira_wave / Aqua2026.' : '';
    if ($('#login-error').textContent) return;
    flow = 'login'; $('#login-password').value = '';
    $('#home-name').textContent = demoProfile.name; $('#home-username').textContent = '@' + demoProfile.username;
    $('#home-avatar').replaceChildren(Object.assign(document.createElement('span'), {textContent: 'М'})); show(7);
  };
  $('#credentials-form').onsubmit = e => {
    e.preventDefault();
    $('#credentials-error').textContent = !/^[A-Za-z0-9_]{3,32}$/.test($('#username').value.trim()) ? 'Логин: 3–32 символа, латиница, цифры или _.' : passwordError($('#reg-password').value, $('#reg-repeat').value);
    if (!$('#credentials-error').textContent) show(4);
  };
  $('#reset-form').onsubmit = e => {
    e.preventDefault(); $('#reset-error').textContent = passwordError($('#reset-password').value, $('#reset-repeat').value);
    if (!$('#reset-error').textContent) { $('#reset-password').value = ''; $('#reset-repeat').value = ''; show(10); }
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
