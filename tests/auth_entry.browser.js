// Run on the signed-out entry screen in the shared Preview:
// coderabbit-agent-browser eval "$(cat tests/auth_entry.browser.js)"
// The bot may be unavailable locally. External Telegram delivery is a separate check.
(async () => {
  const $ = s => document.querySelector(s);
  const assert = (value, text) => { if (!value) throw new Error(text); };
  const settled = () => new Promise((resolve, reject) => {
    const deadline = performance.now() + 3000;
    function check() {
      if (!document.querySelector('.is-morphing')) return resolve();
      if (performance.now() > deadline) return reject(new Error('Auth transition did not finish'));
      requestAnimationFrame(check);
    }
    requestAnimationFrame(check);
  });
  assert($('#app').dataset.screen === 'auth', 'Sign out before running this check');
  assert(getComputedStyle($('.auth')).backgroundImage === 'none', 'Old gradient must be removed');
  assert(getComputedStyle($('.auth__card')).backgroundColor === 'rgb(28, 39, 62)', 'Navy card must be applied');
  for (let i = 0; i < 3; i++) {
    $('#tab-register').click(); await settled();
    assert(!$('#form-register').hidden, 'Registration must be visible');
    assert($('#reg-phone').type === 'text' && $('#reg-phone').inputMode === 'numeric', 'Identifier must not request a telephone number');
    assert($('#form-register').textContent.includes('не номер телефона'), 'Explain the identifier');
    assert(!$('#auth-tabforms').style.height, 'Transition height must be cleaned up');
    $('#tab-login').click(); await settled();
    assert(!$('#form-login').hidden && $('#form-register').hidden, 'Login must be restored');
  }
  $('#tab-register').click(); await settled();
  if (!$('#reg-submit').disabled) {
    $('#reg-phone').value = '123';
    $('#reg-submit').click();
    assert($('#reg-phone-error').textContent.includes('11 цифр'), 'Invalid identifier must be rejected locally');
    $('#reg-phone').value = '';
    $('#reg-phone').dispatchEvent(new Event('input', {bubbles: true}));
  } else {
    assert(!$('#reg-error').hidden, 'Unavailable registration must explain why');
  }
  $('#tab-login').click(); await settled();
  $('#to-recover').click(); await settled();
  assert(!$('#view-recover').hidden, 'Password recovery must open');
  $('#recover-back').click(); await settled();
  assert(!$('#view-auth').hidden, 'Back must return to authentication');
  assert(document.documentElement.scrollWidth <= innerWidth, 'No horizontal overflow');
  return {passed:true, tabCycles:3, recovery:true};
})()
