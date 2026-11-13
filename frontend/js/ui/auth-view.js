/* Экран входа и регистрации.
   Вход: логин + пароль (плюс восстановление через почту). Регистрация: логин + почта + пароль,
   затем отдельная страница с кодом из письма (почта нужна, чтобы код отправить). */
import { $ } from '../dom.js';
import { usernameError, isPasswordValid } from '../validators.js';
import { haptic } from '../haptics.js';

const RESEND_SEC = 30;       // запасное значение; реальный интервал приходит от сервера (cooldown)
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

function showFormError(node, message) {
  node.textContent = message || '';
  node.hidden = !message;
}
function setFieldError(input, message) {
  input.closest('.field')?.classList.toggle('field--error', Boolean(message));
  const out = $('#' + input.id + '-error');
  if (out) out.textContent = message || '';
}
function shake(node) {
  node.classList.remove('is-shaking');
  void node.offsetWidth;
  node.classList.add('is-shaking');
}
/** Запрашивает код и возвращает, через сколько секунд можно отправить новый. Если код уже отправлен
 *  меньше интервала назад (429 + retry_after), письмо у пользователя уже есть — просто ведём на ввод кода. */
async function requestCode(send) {
  try {
    const res = await send();
    return Number(res?.cooldown) > 0 ? Number(res.cooldown) : RESEND_SEC;
  } catch (e) {
    const wait = Number(e.fields?.retry_after);
    if (e.status === 429 && wait > 0) return wait;
    throw e;
  }
}
function setBusy(btn, busy, label) {
  btn.disabled = busy;
  btn.dataset.label ??= btn.textContent;
  btn.textContent = busy ? 'Подождите…' : (label ?? btn.dataset.label);
}

/**
 * handlers:
 *  onLogin(username, password)                   — вход;
 *  onSendCode({username, password, email})       — проверить поля регистрации и отправить код (бросает ApiError);
 *  onRegister({username, password, email, code})  — создать аккаунт;
 *  onResetCode(email)                             — отправить код для сброса пароля (бросает ApiError);
 *  onResetPassword({email, code, password})       — сменить пароль по коду.
 */
export function initAuthView({ onLogin, onSendCode, onRegister, onResetCode, onResetPassword }) {
  const tabs = $('#auth-tabs');
  const loginForm = $('#form-login'), regForm = $('#form-register');
  const lUser = $('#login-username'), lPass = $('#login-password');
  const rUser = $('#reg-username'), rPass = $('#reg-password'), rMail = $('#reg-email');

  // ---------------------------------------------------------------------
  // Общий приём плавного переключения: высота обёртки перетекает к нужной,
  // а то, что показываем, тихо проявляется — без скачка и без дорогих
  // эффектов (только opacity/transform/height). Используется и для вкладок
  // Вход/Регистрация внутри страницы авторизации, и для смены целых страниц
  // (вход ↔ код ↔ восстановление).
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function naturalHeight(el) {
    if (!el.hidden) return el.offsetHeight;
    el.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;';
    el.hidden = false;
    const h = el.offsetHeight;
    el.hidden = true;
    el.style.cssText = '';
    return h;
  }

  function makeSwitcher(wrap) {
    let token = 0, pending = null;
    return function switchTo(from, to, { onShown } = {}) {
      if (from === to) { onShown?.(); return; }
      const myToken = ++token;
      if (pending) { clearTimeout(pending); pending = null; }

      if (reduceMotion()) {
        from.hidden = true; to.hidden = false; onShown?.(); return;
      }

      const startH = wrap.getBoundingClientRect().height;
      const endH = naturalHeight(to);
      wrap.style.height = startH + 'px';
      wrap.classList.add('is-morphing');
      from.classList.add('auth-form--out');
      void wrap.offsetHeight;                      // force reflow перед новым значением высоты
      wrap.style.height = endH + 'px';

      pending = setTimeout(() => {
        if (myToken !== token) return;              // переключили ещё раз, пока ждали
        from.hidden = true;
        from.classList.remove('auth-form--out');
        to.hidden = false;
        to.classList.add('auth-form--in');
        void to.offsetHeight;
        to.classList.remove('auth-form--in');
        onShown?.();
        pending = setTimeout(() => {
          if (myToken !== token) return;
          wrap.style.height = '';
          wrap.classList.remove('is-morphing');
          pending = null;
        }, 220);
      }, 140);
    };
  }

  // ---------------------------------------------------------------------
  // Страницы верхнего уровня: вход/регистрация, код, восстановление (почта), новый пароль.
  const pagesWrap = $('#auth-forms');
  const switchPage = makeSwitcher(pagesWrap);
  const viewAuth = $('#view-auth'), viewCode = $('#view-code'), viewRecover = $('#view-recover'), viewNewpass = $('#view-newpass');
  let currentView = viewAuth;
  function goTo(view, opts) {
    const from = currentView;
    currentView = view;
    switchPage(from, view, opts);
  }

  // Вкладки Вход/Регистрация внутри первой страницы.
  const tabforms = $('#auth-tabforms');
  const switchTab = makeSwitcher(tabforms);

  function setTab(name) {
    if (tabs.dataset.active === name) return;
    tabs.dataset.active = name;
    $('#tab-login').setAttribute('aria-selected', String(name === 'login'));
    $('#tab-register').setAttribute('aria-selected', String(name === 'register'));
    const from = name === 'login' ? regForm : loginForm;
    const to = name === 'login' ? loginForm : regForm;
    const focusTarget = name === 'login' ? lUser : rUser;
    switchTab(from, to, { onShown: () => focusTarget.focus({ preventScroll: true }) });
  }
  $('#tab-login').addEventListener('click', () => setTab('login'));
  $('#tab-register').addEventListener('click', () => setTab('register'));

  // ---------------------------------------------------------------------
  // Страница кода: шесть красивых ячеек под цифры, общая для регистрации и восстановления.
  const codeTitle = $('#code-title'), codeSent = $('#code-sent');
  const codeBoxesWrap = $('#code-boxes');
  const codeBoxes = Array.from(codeBoxesWrap.querySelectorAll('.code-box'));
  const codeError = $('#code-error'), codeSubmit = $('#code-submit'), codeResend = $('#code-resend');
  let codeCtx = null;             // { purpose: 'register'|'reset', data, onDone }
  let resendTimer = null;

  function codeValue() { return codeBoxes.map((b) => b.value).join(''); }
  function clearCode() {
    for (const b of codeBoxes) { b.value = ''; b.classList.remove('is-filled'); }
    codeSubmit.disabled = true;
  }
  function updateCodeState() {
    const full = codeBoxes.every((b) => b.value);
    codeSubmit.disabled = !full;
    for (const b of codeBoxes) b.classList.toggle('is-filled', Boolean(b.value));
  }
  codeBoxes.forEach((box, i) => {
    box.addEventListener('input', () => {
      box.value = box.value.replace(/\D/g, '').slice(-1);
      updateCodeState();
      if (box.value && codeBoxes[i + 1]) codeBoxes[i + 1].focus();
    });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && codeBoxes[i - 1]) { codeBoxes[i - 1].focus(); }
      if (e.key === 'ArrowLeft' && codeBoxes[i - 1]) { e.preventDefault(); codeBoxes[i - 1].focus(); }
      if (e.key === 'ArrowRight' && codeBoxes[i + 1]) { e.preventDefault(); codeBoxes[i + 1].focus(); }
      if (e.key === 'Enter' && !codeSubmit.disabled) submitCode();
    });
    box.addEventListener('paste', (e) => {
      const digits = (e.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, codeBoxes.length);
      if (!digits) return;
      e.preventDefault();
      digits.split('').forEach((d, j) => { if (codeBoxes[j]) codeBoxes[j].value = d; });
      updateCodeState();
      (codeBoxes[digits.length] || codeBoxes[codeBoxes.length - 1]).focus();
      if (digits.length === codeBoxes.length) submitCode();
    });
  });

  function maskEmail(email) {
    const [name, domain] = email.split('@');
    if (!domain) return email;
    const visible = name.slice(0, 2);
    return `${visible}${'•'.repeat(Math.max(1, name.length - visible.length))}@${domain}`;
  }

  function startResendCooldown(resend, seconds = RESEND_SEC) {
    clearInterval(resendTimer);
    let left = seconds;
    codeResend.disabled = true;
    const tick = () => {
      codeResend.textContent = left > 0 ? `Отправить снова через ${left} с` : 'Отправить снова';
      if (left <= 0) { clearInterval(resendTimer); codeResend.disabled = false; }
      left -= 1;
    };
    tick(); resendTimer = setInterval(tick, 1000);
    codeResend.onclick = async () => {
      showFormError(codeError, '');
      codeResend.disabled = true;
      try {
        const sec = await requestCode(resend);
        clearCode(); codeBoxes[0].focus();
        startResendCooldown(resend, sec);
      } catch (e) {
        showFormError(codeError, e.message);
        codeResend.disabled = false;
        codeResend.textContent = 'Отправить снова';
      }
    };
  }

  /** Открывает страницу кода. sent — текст над ячейками, resend — функция повторной отправки. */
  function openCodePage({ title, email, onDone, resend, cooldown }) {
    codeCtx = { onDone };
    codeTitle.textContent = title;
    codeSent.textContent = `Код отправлен на ${maskEmail(email)}. Он действует 10 минут.`;
    clearCode();
    showFormError(codeError, '');
    goTo(viewCode, { onShown: () => codeBoxes[0].focus() });
    startResendCooldown(resend, cooldown);
  }

  async function submitCode() {
    if (codeSubmit.disabled || !codeCtx) return;
    const code = codeValue();
    setBusy(codeSubmit, true, 'Подтвердить');
    try {
      await codeCtx.onDone(code);
      haptic.success();
    } catch (e) {
      showFormError(codeError, e.message);
      shake(codeBoxesWrap); haptic.error();
    } finally {
      setBusy(codeSubmit, false);
    }
  }
  codeSubmit.addEventListener('click', submitCode);

  function backFromCode() {
    clearInterval(resendTimer);
    codeCtx = null;
    goTo(viewAuth, { onShown: () => (tabs.dataset.active === 'login' ? lUser : rUser).focus({ preventScroll: true }) });
  }
  $('#code-back').addEventListener('click', backFromCode);

  // ---------------------------------------------------------------------
  // Вход
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#login-error'); showFormError(err, '');
    const username = lUser.value.trim();
    if (!username || !lPass.value) {
      showFormError(err, 'Введите логин и пароль.'); shake(loginForm); haptic.error(); return;
    }
    const btn = loginForm.querySelector('button[type="submit"]');
    setBusy(btn, true);
    try { await onLogin(username, lPass.value); haptic.success(); }
    catch (e2) { showFormError(err, e2.message); shake(loginForm); haptic.error(); }
    finally { setBusy(btn, false); }
  });

  rUser.addEventListener('input', () => setFieldError(rUser, rUser.value ? usernameError(rUser.value.trim()) : ''));
  rPass.addEventListener('input', () => setFieldError(rPass, rPass.value && !isPasswordValid(rPass.value)
    ? 'Пароль: от 8 символов, строчная латинская буква и цифра.' : ''));

  // Регистрация: логин + почта + пароль → страница кода → создание аккаунта.
  const regData = () => ({ username: rUser.value.trim(), password: rPass.value, email: rMail.value.trim().toLowerCase() });
  const regBtn = $('#reg-submit');
  regForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#reg-error'); showFormError(err, '');
    const d = regData();
    const uErr = usernameError(d.username);
    const pErr = isPasswordValid(d.password) ? '' : 'Пароль: от 8 символов, строчная латинская буква и цифра.';
    const mErr = EMAIL_RE.test(d.email) ? '' : 'Введите корректный адрес почты.';
    setFieldError(rUser, uErr); setFieldError(rPass, pErr); setFieldError(rMail, mErr);
    if (uErr || pErr || mErr) { shake(regForm); haptic.error(); return; }
    setBusy(regBtn, true);
    try {
      const cooldown = await requestCode(() => onSendCode(d));
      openCodePage({
        title: 'Подтверждение почты',
        email: d.email,
        cooldown,
        resend: () => onSendCode(regData()),
        onDone: (code) => onRegister({ ...regData(), code }),
      });
    } catch (e2) {
      const f = e2.fields || {};
      if (f.username_errors?.length) setFieldError(rUser, f.username_errors[0]);
      else if (f.password_errors?.length) setFieldError(rPass, f.password_errors[0]);
      else showFormError(err, e2.message);
      shake(regForm); haptic.error();
    } finally { setBusy(regBtn, false); }
  });

  // ---------------------------------------------------------------------
  // Восстановление пароля: почта → страница кода → новый пароль.
  const recoverForm = $('#form-recover'), recoverEmail = $('#recover-email');
  let resetEmail = '', resetCode = '';

  $('#to-recover').addEventListener('click', () => {
    showFormError($('#recover-error'), '');
    recoverForm.reset();
    goTo(viewRecover, { onShown: () => recoverEmail.focus({ preventScroll: true }) });
  });
  $('#recover-back').addEventListener('click', () => {
    goTo(viewAuth, { onShown: () => lUser.focus({ preventScroll: true }) });
  });

  recoverForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#recover-error'); showFormError(err, '');
    const email = recoverEmail.value.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) { showFormError(err, 'Введите корректный адрес почты.'); shake(recoverForm); haptic.error(); return; }
    const btn = recoverForm.querySelector('button[type="submit"]');
    setBusy(btn, true);
    try {
      const cooldown = await requestCode(() => onResetCode(email));
      resetEmail = email;
      openCodePage({
        title: 'Восстановление пароля',
        email,
        cooldown,
        resend: () => onResetCode(resetEmail),
        onDone: async (code) => {
          resetCode = code;
          clearInterval(resendTimer);
          $('#newpass-password').value = '';
          showFormError($('#newpass-error'), '');
          goTo(viewNewpass, { onShown: () => $('#newpass-password').focus({ preventScroll: true }) });
        },
      });
    } catch (e2) { showFormError(err, e2.message); shake(recoverForm); haptic.error(); }
    finally { setBusy(btn, false); }
  });

  const newpassForm = $('#form-newpass'), newpassInput = $('#newpass-password');
  newpassInput.addEventListener('input', () => setFieldError(newpassInput, newpassInput.value && !isPasswordValid(newpassInput.value)
    ? 'Пароль: от 8 символов, строчная латинская буква и цифра.' : ''));
  newpassForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#newpass-error'); showFormError(err, '');
    const pErr = isPasswordValid(newpassInput.value) ? '' : 'Пароль: от 8 символов, строчная латинская буква и цифра.';
    setFieldError(newpassInput, pErr);
    if (pErr) { shake(newpassForm); haptic.error(); return; }
    const btn = newpassForm.querySelector('button[type="submit"]');
    setBusy(btn, true);
    try { await onResetPassword({ email: resetEmail, code: resetCode, password: newpassInput.value }); haptic.success(); }
    catch (e2) {
      showFormError(err, e2.message); shake(newpassForm); haptic.error();
      // Код мог успеть истечь, пока вводили пароль — возвращаем на страницу кода, а не бросаем тупик.
      goTo(viewCode, { onShown: () => codeBoxes[0].focus() });
    }
    finally { setBusy(btn, false); }
  });

  return {
    reset() {
      clearInterval(resendTimer);
      loginForm.reset(); regForm.reset(); recoverForm?.reset(); newpassForm?.reset();
      for (const n of ['#login-error', '#reg-error', '#recover-error', '#newpass-error', '#code-error']) showFormError($(n), '');
      for (const i of [rUser, rPass, rMail, newpassInput]) setFieldError(i, '');
      clearCode();
      codeCtx = null; resetEmail = ''; resetCode = '';
      for (const v of [viewCode, viewRecover, viewNewpass]) { v.hidden = true; v.classList.remove('auth-form--out', 'auth-form--in'); }
      viewAuth.hidden = false; viewAuth.classList.remove('auth-form--out', 'auth-form--in');
      currentView = viewAuth;
      pagesWrap.style.height = ''; pagesWrap.classList.remove('is-morphing');
      setTab('login');
    },
  };
}
