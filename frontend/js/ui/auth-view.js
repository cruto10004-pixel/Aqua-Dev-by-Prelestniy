/* Экран входа и регистрации.
   Вход: логин + пароль. Регистрация и восстановление: код приходит в Telegram-бота по ссылке,
   который открывает пользователь (бот привязывает чат к попытке). */
import { $ } from '../dom.js';
import { usernameError, isPasswordValid } from '../validators.js';
import { haptic } from '../haptics.js';

const PASSWORD_HINT = 'Пароль: от 8 символов, строчная латинская буква и цифра.';
// Незавершённая попытка (регистрация или восстановление) хранится, пока человек в боте.
const PENDING_KEY = 'aqua.tgPending';
function savePending(p) { try { localStorage.setItem(PENDING_KEY, JSON.stringify(p)); } catch { /* приватный режим */ } }
function loadPending() { try { return JSON.parse(localStorage.getItem(PENDING_KEY) || 'null'); } catch { return null; } }
function clearPending() { try { localStorage.removeItem(PENDING_KEY); } catch { /* ignore */ } }
/** Переводит в Telegram-бота по ссылке с ref. */
function goToBot(link) { window.location.href = link; }
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
 *  onLogin(username, password)        — вход;
 *  onLoadBotLink() → {link}           — ссылка на Telegram-бота (для кнопки «Открыть бота»);
 *  onSendPhone(phone) → {ref, link}   — номер из бота: код уходит в его чат (бросает ApiError);
 *  onConfirmPhone({ref, code})        — подтвердить номер кодом из бота;
 *  onRegister({ref, username, password}) — логин и пароль, аккаунт создан;
 *  onResetCode(username)              — создать попытку восстановления → {ref, link} (бросает ApiError);
 *  onResetPassword({ref, code, password}) — сменить пароль по коду из бота.
 */
export function initAuthView({ onLogin, onLoadBotLink, onSendPhone, onConfirmPhone, onRegister, onResetCode, onResetPassword }) {
  const tabs = $('#auth-tabs');
  const loginForm = $('#form-login'), regForm = $('#form-register');
  const lUser = $('#login-username'), lPass = $('#login-password');
  const rPhone = $('#reg-phone'), regBot = $('#reg-bot');
  const fUser = $('#finish-username'), fPass = $('#finish-password'), finishForm = $('#form-finish');
  const viewFinish = $('#view-finish');

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
    const focusTarget = name === 'login' ? lUser : rPhone;
    switchTab(from, to, { onShown: () => focusTarget.focus({ preventScroll: true }) });
  }
  $('#tab-login').addEventListener('click', () => setTab('login'));
  $('#tab-register').addEventListener('click', () => setTab('register'));

  // ---------------------------------------------------------------------
  // Страница кода: шесть красивых ячеек под цифры, общая для регистрации и восстановления.
  const codeTitle = $('#code-title'), codeSent = $('#code-sent');
  const codeBoxesWrap = $('#code-boxes');
  const codeBoxes = Array.from(codeBoxesWrap.querySelectorAll('.code-box'));
  const codeError = $('#code-error'), codeSubmit = $('#code-submit');
  let codeCtx = null;             // { onDone }
  const codeBot = $('#code-bot');

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

  /** Открывает страницу кода. link — ссылка на бота, onDone(code) — подтверждение кода. */
  function openCodePage({ title, sent, link, onDone }) {
    codeCtx = { onDone };
    codeTitle.textContent = title;
    codeSent.textContent = sent;
    codeBot.href = link;
    clearCode();
    showFormError(codeError, '');
    goTo(viewCode, { onShown: () => codeBoxes[0].focus() });
  }

  /** Продолжает незавершённую попытку восстановления: открывает страницу кода. */
  function runCodeFlow(p) {
    openCodePage({
      title: 'Восстановление пароля',
      sent: 'Код пришёл в Telegram-бота, привязанного к аккаунту. Введите его здесь.',
      link: p.link,
      onDone: async (code) => {
        resetRef = p.ref; resetCode = code;
        $('#newpass-password').value = '';
        showFormError($('#newpass-error'), '');
        goTo(viewNewpass, { onShown: () => $('#newpass-password').focus({ preventScroll: true }) });
      },
    });
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
    codeCtx = null;
    clearPending();
    goTo(viewAuth, { onShown: () => (tabs.dataset.active === 'login' ? lUser : rPhone).focus({ preventScroll: true }) });
  }
  $('#code-back').addEventListener('click', backFromCode);
  $('#finish-back').addEventListener('click', () => goTo(viewAuth, { onShown: () => rPhone.focus({ preventScroll: true }) }));

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

  rPhone.addEventListener('input', () => setFieldError(rPhone, ''));
  // Ссылка на бота нужна сразу: без неё человек не получит номер. Если бот не настроен — кнопку прячем.
  onLoadBotLink().then((r) => { regBot.href = r.link; }).catch(() => { regBot.hidden = true; });

  // Регистрация: номер из бота → код в Telegram → логин и пароль.
  let regRef = '';
  const regBtn = $('#reg-submit');
  regForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#reg-error'); showFormError(err, '');
    const phone = rPhone.value.replace(/\D/g, '');
    const pErr = phone.length === 11 ? '' : 'Введите номер из бота, например +7 900 000-00-00.';
    setFieldError(rPhone, pErr);
    if (pErr) { shake(regForm); haptic.error(); return; }
    setBusy(regBtn, true);
    try {
      const { ref, link } = await onSendPhone(phone);
      regRef = ref;
      openCodePage({
        title: 'Подтверждение',
        sent: 'Код отправлен в Telegram-бота. Введите его здесь. Он действует 15 минут.',
        link,
        onDone: async (code) => {
          await onConfirmPhone({ ref: regRef, code });
          goTo(viewFinish, { onShown: () => fUser.focus({ preventScroll: true }) });
        },
      });
    } catch (e2) { showFormError(err, e2.message); shake(regForm); haptic.error(); }
    finally { setBusy(regBtn, false); }
  });

  finishForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#finish-error'); showFormError(err, '');
    const username = fUser.value.trim();
    const uErr = usernameError(username);
    const pErr = isPasswordValid(fPass.value) ? '' : PASSWORD_HINT;
    setFieldError(fUser, uErr); setFieldError(fPass, pErr);
    if (uErr || pErr) { shake(finishForm); haptic.error(); return; }
    const btn = finishForm.querySelector('button[type="submit"]');
    setBusy(btn, true);
    try { await onRegister({ ref: regRef, username, password: fPass.value }); haptic.success(); }
    catch (e2) {
      const f = e2.fields || {};
      if (f.username_errors?.length) setFieldError(fUser, f.username_errors[0]);
      else if (f.password_errors?.length) setFieldError(fPass, f.password_errors[0]);
      else showFormError(err, e2.message);
      shake(finishForm); haptic.error();
    } finally { setBusy(btn, false); }
  });

  // ---------------------------------------------------------------------
  // Восстановление пароля: логин → ссылка на бота → код → новый пароль.
  const recoverForm = $('#form-recover'), recoverUser = $('#recover-username');
  let resetRef = '', resetCode = '';  // resetRef задаётся в runCodeFlow / recoverForm

  $('#to-recover').addEventListener('click', () => {
    showFormError($('#recover-error'), '');
    recoverForm.reset();
    goTo(viewRecover, { onShown: () => recoverUser.focus({ preventScroll: true }) });
  });
  $('#recover-back').addEventListener('click', () => {
    goTo(viewAuth, { onShown: () => lUser.focus({ preventScroll: true }) });
  });

  recoverForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#recover-error'); showFormError(err, '');
    const username = recoverUser.value.trim();
    if (!username) { showFormError(err, 'Введите логин.'); shake(recoverForm); haptic.error(); return; }
    const btn = recoverForm.querySelector('button[type="submit"]');
    setBusy(btn, true);
    try {
      const { ref, link } = await onResetCode(username);
      savePending({ kind: 'reset', ref, link });
      goToBot(link);
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
    try { await onResetPassword({ ref: resetRef, code: resetCode, password: newpassInput.value }); clearPending(); haptic.success(); }
    catch (e2) {
      // Код проверяется на сервере только здесь: при ошибке (неверный или истёкший код) ведём на ввод кода.
      clearCode();
      showFormError(codeError, e2.message); shake(codeBoxesWrap); haptic.error();
      goTo(viewCode, { onShown: () => codeBoxes[0].focus() });
    }
    finally { setBusy(btn, false); }
  });

  // Вернулись из бота: продолжаем с кода, который уже выслан.
  const pending = loadPending();
  if (pending && pending.kind === 'reset') runCodeFlow(pending);

  return {
    reset() {
      loginForm.reset(); regForm.reset(); finishForm.reset(); recoverForm?.reset(); newpassForm?.reset();
      for (const n of ['#login-error', '#reg-error', '#finish-error', '#recover-error', '#newpass-error', '#code-error']) showFormError($(n), '');
      for (const i of [rPhone, fUser, fPass, newpassInput]) setFieldError(i, '');
      clearCode();
      codeCtx = null; regRef = ''; resetRef = ''; resetCode = '';
      for (const v of [viewCode, viewFinish, viewRecover, viewNewpass]) { v.hidden = true; v.classList.remove('auth-form--out', 'auth-form--in'); }
      viewAuth.hidden = false; viewAuth.classList.remove('auth-form--out', 'auth-form--in');
      currentView = viewAuth;
      pagesWrap.style.height = ''; pagesWrap.classList.remove('is-morphing');
      setTab('login');
    },
  };
}
