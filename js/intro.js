(function () {
  // Sound gate → Intro v2 → hero. One clock drives a pure render(t);
  // the timeline and checklist come from the brand book (HeroPreflight).
  var FD = window.FD = window.FD || {};
  var root = document.documentElement;
  var gate = document.querySelector('.gate');
  var pre = document.querySelector('.preflight');
  var mode = root.getAttribute('data-intro') || 'quick';
  var reduce = FD.reduceMotion.matches;

  FD.ready = false;

  // While the gate or intro is up, the page behind it is inert
  var behind = [].slice.call(document.querySelectorAll('.site-nav, main, .site-footer'));
  function setInert(on) { behind.forEach(function (el) { el.inert = on; }); }

  function ready() {
    if (FD.ready) return;
    FD.ready = true;
    root.classList.remove('fd-locked', 'fd-gate', 'fd-intro');
    setInert(false);
    document.dispatchEvent(new CustomEvent('fd:ready'));
  }

  // ── Timelines (ms) ──
  var FULL = {
    end: 8600, lines: [700, 1320, 1940, 2560, 3180, 3800], cps: 14, okd: 160,
    term: 4300, eta: 4950, st2: 5400, w: [6000, 6400, 6800], s3: 7300, lift: 8000
  };
  var QUICK = {
    end: 3000, lines: [200, 420, 640, 860, 1080, 1300], cps: 6, okd: 80,
    term: null, eta: null, st2: null, w: null, s3: 1700, lift: 2400
  };
  var LIFT = 600;

  var LINES = [
    ['Identity confirmed', 'Arnav Verma · CS & AI'],
    ['Forecast models online', 'ODYSSEY · SIH 2026'],
    ['Compliance link', 'ASCI · CCPA · BrandGuard'],
    ['Civic loop closed', 'ReeSolve · SLA tracking'],
    ['Orbital telemetry', 'ISS live tracker'],
    ['Skill graph loaded', '21 nodes · 5 clusters']
  ];
  var TERM = 'eta.predict(train) → delay propagation';

  function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function ease(x) { return 1 - Math.pow(1 - x, 3); }
  function pad(n, l) { n = String(n); while (n.length < l) n = '0' + n; return n; }
  function q(sel) { return pre.querySelector(sel); }

  var T, el = {}, rows = [], tdots = [], words = [];

  function build() {
    el.cur = q('.pf-curtains'); el.prog = q('.pf-topline i'); el.pct = q('.pf-pct');
    el.main = q('.pf-main'); el.term = q('.pf-term'); el.tt = q('.pf-tt'); el.eta = q('.pf-eta');
    el.panel = q('.pf-panel'); el.iss = q('.pf-iss'); el.sat = q('.pf-sat'); el.tl = q('.pf-tl');
    el.lat = q('.pf-lat'); el.lon = q('.pf-lon'); el.stmt = q('.pf-stmt'); el.l1 = q('.pf-l1');
    el.fin = q('.pf-fin'); el.go = q('.pf-go'); el.skip = q('.preflight-skip');
    words = [].slice.call(q('.pf-wd').children);
    var log = q('.pf-log');
    rows = LINES.map(function (l) {
      var d = document.createElement('div');
      d.className = 'pf-ln';
      d.innerHTML = '<span class="pf-tag">[ <b>··</b> ]</span><span class="pf-lab"></span><span class="pf-det"></span>';
      log.appendChild(d);
      return { el: d, tag: d.querySelector('.pf-tag'), b: d.querySelector('b'), lab: d.querySelector('.pf-lab'), det: d.querySelector('.pf-det'), l: l[0], d: l[1] };
    });
    var trail = q('.pf-trail');
    for (var i = 0; i < 12; i++) {
      var c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('r', 3.2 - i * 0.2);
      trail.appendChild(c);
      tdots.push(c);
    }
  }

  function orbit(th, rx, ry, rot) {
    var a = rot * Math.PI / 180, x = rx * Math.cos(th), y = ry * Math.sin(th);
    return [180 + x * Math.cos(a) - y * Math.sin(a), 125 + x * Math.sin(a) + y * Math.cos(a)];
  }

  // Pure function of the clock: every frame is fully described by t
  function render(t) {
    el.cur.style.setProperty('--lit', ease(clamp(t / 900)));
    var x = clamp((t - 200) / (T.s3 - 200));
    var p = x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
    el.prog.style.transform = 'scaleX(' + p + ')';
    el.pct.textContent = pad(Math.round(p * 100), 3) + '%';

    rows.forEach(function (o, i) {
      var s = T.lines[i], full = o.l.length + o.d.length, dur = full * T.cps;
      var n = Math.floor(full * clamp((t - s) / dur));
      o.el.style.opacity = t >= s ? 1 : 0;
      o.lab.textContent = o.l.slice(0, Math.min(n, o.l.length));
      o.det.textContent = o.d.slice(0, Math.max(0, n - o.l.length));
      var ok = t > s + dur + T.okd;
      o.tag.classList.toggle('ok', ok);
      o.b.textContent = ok ? 'OK' : '··';
    });

    if (T.term !== null) {
      var k = Math.floor(TERM.length * clamp((t - T.term) / (TERM.length * T.cps)));
      el.term.style.opacity = t >= T.term ? 1 : 0;
      el.tt.textContent = TERM.slice(0, k);
      el.eta.style.opacity = t >= T.eta ? 1 : 0;
    } else {
      el.term.style.opacity = 0;
      el.eta.style.opacity = 0;
    }

    var dim = T.st2 !== null ? ease(clamp((t - T.st2) / 300)) : 0;
    var gone = 1 - ease(clamp((t - T.s3) / 300));
    el.main.style.opacity = (1 - dim * 0.88) * gone;
    el.main.style.filter = dim > 0 ? 'blur(' + (dim * 3).toFixed(2) + 'px)' : 'none';
    el.panel.style.opacity = ease(clamp((t - 500) / 500));

    // Decorative orbit: computed from the clock, never from a live feed
    var th = t * 0.0012, pi = orbit(th, 158, 70, 22);
    el.iss.setAttribute('cx', pi[0]); el.iss.setAttribute('cy', pi[1]);
    for (var j = 0; j < tdots.length; j++) {
      var tq = orbit(th - (j + 1) * 0.07, 158, 70, 22);
      tdots[j].setAttribute('cx', tq[0]); tdots[j].setAttribute('cy', tq[1]);
      tdots[j].style.opacity = (1 - j / tdots.length) * 0.7;
    }
    var ps = orbit(-t * 0.0007 + 1.2, 110, 44, -18);
    el.sat.setAttribute('cx', ps[0]); el.sat.setAttribute('cy', ps[1]);
    el.tl.setAttribute('x', pi[0] + 10); el.tl.setAttribute('y', pi[1] - 8);
    var lat = 51.6 * Math.sin(th), lon = ((th * 180 / Math.PI + 77) % 360 + 360) % 360 - 180;
    el.lat.textContent = (lat >= 0 ? '+' : '−') + pad(Math.abs(lat).toFixed(3), 6) + '°';
    el.lon.textContent = (lon >= 0 ? '+' : '−') + pad(Math.abs(lon).toFixed(3), 7) + '°';

    if (T.st2 !== null) {
      el.stmt.style.opacity = ease(clamp((t - T.st2) / 300)) * gone;
      el.l1.style.setProperty('--s', (ease(clamp((t - T.st2 - 100) / 600)) * 100).toFixed(2) + '%');
      words.forEach(function (w, i) {
        var inn = ease(clamp((t - T.w[i]) / 260)), out = i < 2 ? ease(clamp((t - T.w[i + 1]) / 260)) : 0;
        w.style.transform = 'translateY(' + ((1 - inn) * 100 - out * 100).toFixed(2) + '%)';
      });
    } else {
      el.stmt.style.opacity = 0;
    }

    var fe = ease(clamp((t - T.s3) / 450));
    el.fin.style.opacity = fe;
    el.fin.style.transform = 'translateY(' + ((1 - fe) * 14).toFixed(1) + 'px) scale(' + (0.97 + 0.03 * fe).toFixed(3) + ')';
    el.go.style.opacity = ease(clamp((t - T.s3 - 350) / 300));

    var lf = clamp((t - T.lift) / LIFT);
    pre.style.transform = 'translateY(' + (-lf * lf * lf * 100).toFixed(2) + '%)';
    el.skip.style.opacity = t < T.lift ? ease(clamp((t - 600) / 300)) : 0;
    el.skip.style.visibility = t >= 600 && t < T.lift ? 'visible' : 'hidden';
  }

  function cues() {
    var c = T.lines.map(function (x) { return { t: x, f: 'tick' }; });
    if (T.st2 !== null) c.push({ t: T.st2, f: 'swell' });
    c.push({ t: T.s3, f: 'nominal' }, { t: T.lift, f: 'whoosh' });
    return c;
  }

  // ── The clock ──
  var t = 0, CUES = [], running = false;

  function tick(now, dt) {
    var prev = t;
    t = Math.min(T.end, t + dt * 16.67);
    CUES.forEach(function (c) { if (prev < c.t && t >= c.t) FD.sound.play(c.f); });
    if (t >= T.lift) ready();                 // interactive at the start of the lift
    render(t);
    if (t >= T.end) finish();
  }

  function skipToLift() {
    if (!running || t >= T.lift) return;
    t = T.lift;
    FD.sound.play('whoosh');
  }

  function onKey(e) {
    if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); skipToLift(); }
  }
  function onPointer(e) { if (e.button === 0) skipToLift(); }

  function finish() {
    running = false;
    FD.ticker.remove(tick);
    removeEventListener('keydown', onKey, true);
    removeEventListener('pointerdown', onPointer, true);
    pre.classList.remove('is-running');
    pre.hidden = true;
  }

  function remember() {
    try { localStorage.setItem('fd-intro-seen', '1'); } catch (e) {}
    try { sessionStorage.setItem('fd-session', '1'); } catch (e) {}
  }

  function startIntro() {
    remember();
    if (mode === 'none' || !pre) { if (pre) pre.hidden = true; ready(); return; }
    T = mode === 'full' ? FULL : QUICK;
    build();
    pre.classList.add('is-running');

    // Reduced motion: one still frame for 1.5s, then a plain fade
    if (reduce) {
      render(T.s3 + 600);
      pre.style.transform = 'none';
      el.skip.style.visibility = 'visible';
      el.skip.style.opacity = 1;
      var done = function () {
        if (FD.ready) return;
        ready();
        pre.classList.add('is-fading');
        setTimeout(function () { pre.classList.remove('is-running'); pre.hidden = true; }, 220);
      };
      el.skip.addEventListener('click', done);
      setTimeout(done, 1500);
      return;
    }

    CUES = cues();
    running = true;
    el.skip.addEventListener('click', skipToLift);
    addEventListener('keydown', onKey, true);
    addEventListener('pointerdown', onPointer, true);
    render(0);
    FD.ticker.add(tick);
    setTimeout(function () { if (running) el.skip.focus({ preventScroll: true }); }, 600);
  }

  // ── Gate ──
  function choose(withSound) {
    if (!root.classList.contains('fd-gate')) return;
    FD.sound.set(withSound);
    root.classList.remove('fd-gate');
    gate.classList.add('is-leaving');
    document.removeEventListener('keydown', gateKeys);
    setTimeout(function () { gate.hidden = true; }, 400);
    // Start the intro on the next turn so the choosing click doesn't skip it
    setTimeout(startIntro, 0);
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

  if (root.classList.contains('fd-first') && gate) {
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
    if (mode !== 'none') setInert(true);
    startIntro();
  }
})();
