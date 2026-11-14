// Run in the shared Preview on an authenticated chat list:
// coderabbit-agent-browser eval "$(cat tests/search_morph.browser.js)"
(async () => {
  const $ = selector => document.querySelector(selector);
  const assert = (value, description) => { if (!value) throw new Error(description); };
  // Wait for actual Web Animations completion, then the cleanup animation frame.
  const settle = async () => {
    await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {})));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  };
  for (let cycle = 0; cycle < 4; cycle++) {
    $('#nav-search').click();
    await settle();
    assert(!$('#nav-search-field').hidden, 'Search must open');
    assert(document.activeElement === $('#search'), 'Search must receive focus');
    assert(Math.abs($('#nav-search-field').getBoundingClientRect().width - $('#nav-dock').getBoundingClientRect().width) < 1, 'Search must span the dock');
    $('#nav-search-close').click();
    $('#nav-search-close').click();
    $('#nav-search').click();
    await settle();
    assert($('#nav-search-field').hidden, 'Search must close despite rapid clicks');
    assert($('#nav-search-field').style.length === 0, 'Temporary inline geometry must be removed');
    assert($('#nav-search').getBoundingClientRect().width === 52, 'Search button must return to 52px');
  }
  return { passed: true, cycles: 4, checks: 24 };
})()
