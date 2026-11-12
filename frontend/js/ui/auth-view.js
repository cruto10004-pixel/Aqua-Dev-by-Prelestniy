/* Экран входа и регистрации.
   Вход: логин + пароль. Регистрация: логин + пароль + код из письма (почта нужна, чтобы код отправить). */
import { $ } from '../dom.js';
import { usernameError, isPasswordValid } from '../validators.js';
import { haptic } from '../haptics.js';

const RESEND_SEC = 60;
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
function setBusy(btn, busy, label) {
  btn.disabled = busy;
  btn.dataset.label ??= btn.textContent;
  btn.textContent = busy ? 'Подождите…' : (label ?? btn.dataset.label);
}

/**
 * handlers:
 *  onLogin(username, password)            — вход;
 *  onSendCode({username, password, email}) — проверить поля и отправить код (бросает ApiError);
 *  onRegister({username, password, email, code}) — создать аккаунт.
 */
export function initAuthView({ onLogin, onSendCode, onRegister }) {
  const tabs = $('#auth-tabs');
  const loginForm = $('#form-login'), regForm = $('#form-register');
  const lUser = $('#login-username'), lPass = $('#login-password');
  const rUser = $('#reg-username'), rPass = $('#reg-password'), rMail = $('#reg-email'), rCode = $('#reg-code');
  const codeBlock = $('#reg-code-block'), codeRow = $('#reg-code-row'), regBtn = $('#reg-submit');
  const resendBtn = $('#code-resend');
  let codeStage = false, timer = null;

  // Переключение вкладок раньше дёргало экран: формы разной высоты менялись
  // мгновенно (атрибут hidden), карточка скачком меняла размер. Теперь высота
  // обёртки плавно перетекает к нужной, а форма, которую показываем, тихо
  // проявляется — без скачка и без дорогих эффектов (только opacity/transform/height).
  const formsWrap = $('#auth-forms');
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let swapToken = 0, pendingSwap = null;

  function naturalHeight(form) {
    if (!form.hidden) return form.offsetHeight;
    // Измеряем высоту скрытой формы, не показывая её и не ломая раскладку остальных.
    form.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;';
    form.hidden = false;
    const h = form.offsetHeight;
    form.hidden = true;
    form.style.cssText = '';
    return h;
  }

  function setTab(name) {
    if (tabs.dataset.active === name) return;
    tabs.dataset.active = name;
    $('#tab-login').setAttribute('aria-selected', String(name === 'login'));
    $('#tab-register').setAttribute('aria-selected', String(name === 'register'));

    const from = name === 'login' ? regForm : loginForm;
    const to = name === 'login' ? loginForm : regForm;
    const focusTarget = name === 'login' ? lUser : rUser;

    if (reduceMotion()) {
      from.hidden = true;
      to.hidden = false;
      focusTarget.focus({ preventScroll: true });
      return;
    }

    const token = ++swapToken;
    if (pendingSwap) { clearTimeout(pendingSwap); pendingSwap = null; }

    const startH = formsWrap.getBoundingClientRect().height;
    const endH = naturalHeight(to);
    formsWrap.style.height = startH + 'px';
    formsWrap.classList.add('is-morphing');
    from.classList.add('auth-form--out');
    // force reflow перед новым значением высоты, иначе transition не запустится
    void formsWrap.offsetHeight;
    formsWrap.style.height = endH + 'px';

    pendingSwap = setTimeout(() => {
      if (token !== swapToken) return; // переключили ещё раз, пока ждали — эта смена уже не актуальна
      from.hidden = true;
      from.classList.remove('auth-form--out');
      to.hidden = false;
      to.classList.add('auth-form--in');
      void to.offsetHeight;
      to.classList.remove('auth-form--in');
      focusTarget.focus({ preventScroll: true });
      pendingSwap = setTimeout(() => {
        if (token !== swapToken) return;
        formsWrap.style.height = '';
        formsWrap.classList.remove('is-morphing');
        pendingSwap = null;
      }, 220);
    }, 140);
  }
  $('#tab-login').addEventListener('click', () => setTab('login'));
  $('#tab-register').addEventListener('click', () => setTab('register'));

  function setStage(on) {
    codeStage = on;
    codeBlock.hidden = !on; codeRow.hidden = !on;
    for (const i of [rUser, rPass, rMail]) i.readOnly = on;
    regBtn.dataset.label = on ? 'Создать аккаунт' : 'Получить код';
    regBtn.textContent = regBtn.dataset.label;
    if (on) rCode.focus();
    else clearInterval(timer);
  }
  function startCooldown(sec = RESEND_SEC) {
    clearInterval(timer);
    let left = sec;
    resendBtn.disabled = true;
    const tick = () => {
      resendBtn.textContent = left > 0 ? `Снова через ${left} с` : 'Отправить снова';
      if (left <= 0) { clearInterval(timer); resendBtn.disabled = false; }
      left -= 1;
    };
    tick(); timer = setInterval(tick, 1000);
  }
  const regData = () => ({ username: rUser.value.trim(), password: rPass.value, email: rMail.value.trim().toLowerCase() });

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

  // Регистрация
  regForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#reg-error'); showFormError(err, '');
    const d = regData();
    if (!codeStage) {
      const uErr = usernameError(d.username);
      const pErr = isPasswordValid(d.password) ? '' : 'Пароль: от 8 символов, строчная латинская буква и цифра.';
      const mErr = EMAIL_RE.test(d.email) ? '' : 'Введите корректный адрес почты.';
      setFieldError(rUser, uErr); setFieldError(rPass, pErr); setFieldError(rMail, mErr);
      if (uErr || pErr || mErr) { shake(regForm); haptic.error(); return; }
      setBusy(regBtn, true);
      try {
        await onSendCode(d);
        $('#code-sent').textContent = `Код отправлен на ${d.email}. Он действует 10 минут.`;
        rCode.value = '';
        setStage(true); startCooldown();
      } catch (e2) {
        const f = e2.fields || {};
        if (f.username_errors?.length) setFieldError(rUser, f.username_errors[0]);
        else if (f.password_errors?.length) setFieldError(rPass, f.password_errors[0]);
        else showFormError(err, e2.message);
        shake(regForm); haptic.error();
      } finally { setBusy(regBtn, false); }
      return;
    }
    const code = rCode.value.trim();
    if (!/^\d{6}$/.test(code)) { setFieldError(rCode, 'Код — 6 цифр из письма.'); shake(regForm); haptic.error(); return; }
    setFieldError(rCode, '');
    setBusy(regBtn, true);
    try { await onRegister({ ...d, code }); haptic.success(); }
    catch (e2) { showFormError(err, e2.message); shake(regForm); haptic.error(); }
    finally { setBusy(regBtn, false); }
  });

  resendBtn.addEventListener('click', async () => {
    const err = $('#reg-error'); showFormError(err, '');
    try { await onSendCode(regData()); startCooldown(); }
    catch (e2) { showFormError(err, e2.message); }
  });
  $('#code-back').addEventListener('click', () => { setStage(false); rUser.focus(); });

  return {
    reset() {
      clearInterval(timer);
      loginForm.reset(); regForm.reset();
      for (const n of ['#login-error', '#reg-error']) showFormError($(n), '');
      for (const i of [rUser, rPass, rMail, rCode]) setFieldError(i, '');
      setStage(false);
      setTab('login');
    },
  };
}
