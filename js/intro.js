(function () {
  // Sound gate → pre-flight check → hero. Returning visitors skip both.
  var FD = window.FD = window.FD || {};
  var root = document.documentElement;
  var gate = document.querySelector('.gate');
  var pre = document.querySelector('.preflight');
  var lines = pre ? [].slice.call(pre.querySelectorAll('.preflight-log li')) : [];
  var LINE = 300, TOTAL = 2400;   // one line every ~300ms, about 2.4s in all
  var timers = [], running = false;

  FD.ready = false;

  // While the gate or checklist is up, the page behind it is inert
  var behind = [].slice.call(document.querySelectorAll('.site-nav, main, .site-footer'));
  function setInert(on) { behind.forEach(function (el) { el.inert = on; }); }

  function ready() {
    if (FD.ready) return;
    FD.ready = true;
    root.classList.remove('fd-locked', 'fd-gate', 'fd-intro');
    setInert(false);
    document.dispatchEvent(new CustomEvent('fd:ready'));
  }

  // ── Pre-flight ──
  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }

  function startPreflight() {
    running = true;
    root.classList.add('fd-intro');
    lines.forEach(function (li, i) {
      later(function () {
        li.classList.add('is-on');
        if (i > 0) FD.sound.play('tick');
      }, 120 + i * LINE);
    });
    later(function () { FD.sound.play('nominal'); }, 120 + lines.length * LINE);
    later(finishPreflight, TOTAL);
    addEventListener('keydown', skip, true);
    addEventListener('pointerdown', skip, true);
  }

  function skip(e) {
    if (e.type === 'keydown' && (e.key === 'Tab' || e.key === 'Shift')) return;
    finishPreflight();
  }

  function finishPreflight() {
    if (!running) return;
    running = false;
    timers.forEach(clearTimeout);
    removeEventListener('keydown', skip, true);
    removeEventListener('pointerdown', skip, true);
    pre.classList.add('is-leaving');
    setTimeout(function () { pre.hidden = true; }, 400);
    ready();
  }

  // ── Gate ──
  function choose(withSound) {
    if (!root.classList.contains('fd-gate')) return;
    FD.sound.set(withSound);
    root.classList.remove('fd-gate');
    gate.classList.add('is-leaving');
    document.removeEventListener('keydown', gateKeys);
    setTimeout(function () { gate.hidden = true; }, 400);
    FD.sound.play('tick');              // first pre-flight tick plays as the gate lifts
    // Start the checklist on the next turn so the choosing click doesn't skip it
    setTimeout(startPreflight, 0);
  }

  function gateKeys(e) {
    if (e.key === 'Enter' && !(e.target.closest && e.target.closest('[data-sound="off"]'))) {
      e.preventDefault();
      choose(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      choose(false);
    }
  }

  if (root.classList.contains('fd-first') && gate && pre) {
    root.classList.add('fd-locked', 'fd-gate');
    setInert(true);
    gate.addEventListener('click', function (e) {
      var b = e.target.closest('[data-sound]');
      if (b) choose(b.getAttribute('data-sound') === 'on');
    });
    document.addEventListener('keydown', gateKeys);
    var first = gate.querySelector('[data-sound="on"]');
    if (first) first.focus({ preventScroll: true });
  } else {
    if (gate) gate.hidden = true;
    if (pre) pre.hidden = true;
    ready();
  }
})();
