(function () {
  // Flight Deck sound: every cue is synthesised with Web Audio, so there are
  // no files to load. Nothing plays until the visitor has chosen sound.
  var FD = window.FD = window.FD || {};
  var root = document.documentElement;
  var toggle = document.querySelector('.sound-toggle');
  var stateLabel = toggle && toggle.querySelector('.sound-state');
  var blocked = document.querySelector('.sound-blocked');

  var ctx = null, master = null;
  var on = root.classList.contains('sound-on');
  var busy = [];          // end times of cues still sounding (max two at once)

  function db(v) { return Math.pow(10, v / 20); }

  function store(v) { try { localStorage.setItem('fd-sound', v ? 'on' : 'off'); } catch (e) {} }

  // Create or resume the audio context. Must run inside a user gesture.
  function unlock() {
    if (!on) return;
    try {
      if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain();
        master.gain.value = 1;
        master.connect(ctx.destination);
        document.dispatchEvent(new CustomEvent('fd:audio-ready'));
      }
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) { ctx = null; }
    setTimeout(checkBlocked, 300);
  }

  function checkBlocked() {
    if (!blocked) return;
    blocked.hidden = !(on && (!ctx || ctx.state !== 'running'));
  }

  function ready() { return on && ctx && ctx.state === 'running'; }

  // Never more than two cues at once
  function claim(len) {
    var t = ctx.currentTime;
    busy = busy.filter(function (end) { return end > t; });
    if (busy.length >= 2) return false;
    busy.push(t + len);
    return true;
  }

  function env(g, t, peak, attack, len) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  }

  function tone(type, f0, f1, len, level, at) {
    var t = ctx.currentTime + (at || 0);
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + len * 0.8);
    env(g, t, level, Math.min(0.008, len / 4), len);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + len + 0.02);
  }

  var noiseBuf = null;
  function noise() {
    if (!noiseBuf) {
      var len = ctx.sampleRate, d;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      d = noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    return src;
  }

  function filteredNoise(type, f0, f1, q, len, level, at) {
    var t = ctx.currentTime + (at || 0);
    var src = noise(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + len);
    env(g, t, level, len * 0.15, len);
    src.connect(f).connect(g).connect(master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + len + 0.02);
  }

  // The cue table from the brand book (levels in dB)
  var cues = {
    tick: function () {            // pre-flight [ OK ] line, 40ms, −18 dB
      filteredNoise('highpass', 3000, 3000, 0.7, 0.012, db(-24));
      tone('sine', 2400, 2400, 0.04, db(-18), 0.006);
    },
    nominal: function () {         // two-note rising fifth, 600ms, −14 dB
      tone('sine', 523.25, 523.25, 0.32, db(-14));
      tone('sine', 783.99, 783.99, 0.45, db(-14), 0.15);
    },
    hover: function () {           // 15ms sine tick at 1.8 kHz, −26 dB
      tone('sine', 1800, 1800, 0.015, db(-26));
    },
    click: function () {           // low-passed "thock", 60ms, −18 dB
      tone('triangle', 220, 90, 0.06, db(-18));
    },
    arrival: function () {         // low sub swell, 500ms, −24 dB
      var t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(48, t);
      o.frequency.linearRampToValueAtTime(62, t + 0.5);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(db(-24), t + 0.2);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + 0.52);
    },
    themeDay: function () {        // up-sweep, 300ms, −20 dB
      tone('sine', 420, 1260, 0.3, db(-20));
    },
    themeNight: function () {      // down-sweep, 300ms, −20 dB
      tone('sine', 1260, 420, 0.3, db(-20));
    },
    linkOut: function () {         // short radio squelch, 120ms, −20 dB
      filteredNoise('bandpass', 2600, 900, 3, 0.12, db(-20));
      tone('square', 1400, 700, 0.05, db(-34));
    },
    echoLock: function () {        // low soft thock, pitch falling, 220ms, −18 dB
      tone('sine', 150, 55, 0.22, db(-18));
    },
    echoRelease: function () {     // airy filtered whoosh, falling, 350ms, −22 dB
      filteredNoise('bandpass', 1800, 420, 1.2, 0.35, db(-22));
    },
    count: function () {           // counter digit tick
      tone('sine', 2200, 2200, 0.012, db(-30));
    }
  };

  var LEN = {
    tick: 0.05, nominal: 0.6, hover: 0.015, click: 0.06, arrival: 0.5,
    themeDay: 0.3, themeNight: 0.3, linkOut: 0.12, echoLock: 0.22,
    echoRelease: 0.35, count: 0.012, pluck: 0.3, chord: 0.6, roll: 0.7
  };
  var THROTTLE = { hover: 80, count: 60 };
  var lastPlayed = {};

  // Neural Map voices: one pentatonic note per cluster (C D E G A)
  var NOTES = { ai: 261.63, prod: 293.66, dev: 329.63, front: 392.0, cad: 440.0 };
  function pluck(f, at, level) {
    tone('triangle', f, f, 0.3, level || db(-22), at);
    tone('sine', f * 2, f * 2, 0.12, db(-34), at);
  }
  cues.pluck = function (c) { pluck(NOTES[c] || NOTES.ai); };
  cues.chord = function (c) {    // the cluster's note plus the fifth above
    var f = NOTES[c] || NOTES.ai;
    pluck(f, 0, db(-20));
    pluck(f * 1.5, 0.06, db(-22));
  };
  cues.roll = function () {      // all five notes rolled quickly, low to high
    ['ai', 'prod', 'dev', 'front', 'cad'].forEach(function (c, i) { pluck(NOTES[c], i * 0.07, db(-24)); });
  };

  FD.sound = {
    cues: cues,
    db: db,
    tone: function () { if (ctx) tone.apply(null, arguments); },
    filteredNoise: function () { if (ctx) filteredNoise.apply(null, arguments); },
    noise: function () { return ctx && noise(); },
    get ctx() { return ctx; },
    get master() { return master; },
    get on() { return on; },
    ready: ready,

    play: function (name, arg) {
      if (!ready() || !cues[name]) return;
      if ((name === 'hover' || name === 'pluck') && !FD.finePointer.matches) return;   // no hover cues on phones
      if (THROTTLE[name]) {
        var now = performance.now();
        if (now - (lastPlayed[name] || 0) < THROTTLE[name]) return;
        lastPlayed[name] = now;
      }
      if (!claim(LEN[name] || 0.3)) return;            // never more than two at once
      cues[name](arg);
    },

    // Called by the gate (choice) and the nav toggle / M key
    set: function (value, persist) {
      on = !!value;
      root.classList.toggle('sound-on', on);
      if (persist !== false) store(on);
      if (on) unlock();
      if (master && ctx) master.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.05);
      sync();
      checkBlocked();
      document.dispatchEvent(new CustomEvent('fd:sound', { detail: on }));
    },

    unlock: unlock
  };

  function sync() {
    if (!toggle) return;
    toggle.setAttribute('aria-pressed', String(on));
    stateLabel.textContent = on ? 'Sound on' : 'Sound off';
  }

  if (toggle) toggle.addEventListener('click', function () { FD.sound.set(!on); });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'm' && e.key !== 'M') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest && e.target.closest('input, textarea, [contenteditable]')) return;
    if (root.classList.contains('fd-gate')) return;   // the gate asks first
    FD.sound.set(!on);
  });

  // Returning visitors with sound on: audio can only start after a gesture
  function firstGesture() {
    unlock();
    removeEventListener('pointerdown', firstGesture, true);
    removeEventListener('keydown', firstGesture, true);
  }
  addEventListener('pointerdown', firstGesture, true);
  addEventListener('keydown', firstGesture, true);

  if (blocked) blocked.addEventListener('click', function () { unlock(); });
  if (on && root.classList.contains('fd-returning') && blocked) blocked.hidden = false;

  sync();
})();

// Sound wiring: the ambient bed, the Neural Map drag whoosh, and which
// interactions play which cue. Cues start on the same event as their motion.
(function () {
  var FD = window.FD, S = FD.sound;
  if (!S) return;
  var db = S.db;

  // ── Ambient bed: cockpit hum + filtered air, a faint crackle every 20–40s ──
  var amb = null, lastScroll = performance.now(), ducked = false, crackleTimer = 0;

  function startAmbient() {
    var ctx = S.ctx;
    if (amb || !ctx || !S.on || !FD.ready) return;
    var t = ctx.currentTime;
    var bed = ctx.createGain();
    bed.gain.setValueAtTime(0.0001, t);
    bed.gain.exponentialRampToValueAtTime(db(-30), t + 2);
    bed.connect(S.master);

    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;
    lp.connect(bed);

    var h1 = ctx.createOscillator(), h2 = ctx.createOscillator();
    var g1 = ctx.createGain(), g2 = ctx.createGain();
    h1.frequency.value = 55;
    h2.frequency.value = 110.6;          // slightly detuned for a slow beat
    g1.gain.value = 0.5;
    g2.gain.value = 0.22;
    h1.connect(g1).connect(lp);
    h2.connect(g2).connect(lp);

    var air = S.noise(), af = ctx.createBiquadFilter(), ag = ctx.createGain();
    air.loop = true;
    af.type = 'lowpass';
    af.frequency.value = 520;
    af.Q.value = 0.5;
    ag.gain.value = 0.35;
    air.connect(af).connect(ag).connect(bed);

    h1.start(t); h2.start(t); air.start(t);
    amb = { bed: bed, nodes: [h1, h2, air] };
    ducked = false;
    scheduleCrackle();
  }

  function stopAmbient() {
    if (!amb) return;
    var ctx = S.ctx, t = ctx.currentTime, a = amb;
    amb = null;
    clearTimeout(crackleTimer);
    a.bed.gain.setTargetAtTime(0.0001, t, 0.3);
    a.nodes.forEach(function (n) { n.stop(t + 1.5); });
  }

  function scheduleCrackle() {
    crackleTimer = setTimeout(function () {
      if (!amb) return;
      if (S.ready()) {
        S.filteredNoise('bandpass', 3200, 2400, 4, 0.06, db(-40));
        S.filteredNoise('bandpass', 2800, 2000, 4, 0.04, db(-42), 0.09);
      }
      scheduleCrackle();
    }, 20000 + Math.random() * 20000);
  }

  // Ducks to −40 dB while the visitor reads (no scroll for 8s)
  addEventListener('scroll', function () { lastScroll = performance.now(); }, { passive: true });
  FD.ticker.add(function (now) {
    if (!amb) return;
    var quiet = now - lastScroll > 8000;
    if (quiet !== ducked) {
      ducked = quiet;
      amb.bed.gain.setTargetAtTime(db(quiet ? -40 : -30), S.ctx.currentTime, 0.8);
    }
  });

  document.addEventListener('fd:audio-ready', startAmbient);
  document.addEventListener('fd:ready', startAmbient);
  document.addEventListener('fd:sound', function (e) { e.detail ? startAmbient() : stopAmbient(); });

  // ── Interaction cues ──
  var HOVER = 'a, button, .btn, .nm-row, .nm-reset';

  document.addEventListener('pointerover', function (e) {
    var el = e.target.closest && e.target.closest(HOVER);
    if (el && !(e.relatedTarget && el.contains(e.relatedTarget))) S.play('hover');
    var node = e.target.closest && e.target.closest('.nm-node--leaf');
    if (node && !(e.relatedTarget && node.contains(e.relatedTarget))) S.play('pluck', clusterOf(node));
  });

  document.addEventListener('pointerdown', function (e) {
    var el = e.target.closest && e.target.closest('.btn, button, a');
    if (!el) return;
    // Buttons always thock; on phones every tap does
    if (el.matches('.btn, button') || e.pointerType !== 'mouse') S.play('click');
  });

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[target="_blank"], a[href^="mailto:"]');
    if (a) S.play('linkOut');
  });

  document.addEventListener('fd:arrival', function () { S.play('arrival'); });
  document.addEventListener('fd:count', function () { S.play('count'); });
  document.addEventListener('fd:theme', function (e) { S.play(e.detail === 'light' ? 'themeDay' : 'themeNight'); });

  // ── Neural Map: chord on cluster pick, roll on Show all ──
  function clusterOf(el) {
    var hub = el.closest('.nm-hub');
    var m = hub && hub.className.match(/nm-hub--(\w+)/);
    return m ? m[1] : 'ai';
  }

  var map = document.querySelector('.neural');
  if (!map) return;

  map.addEventListener('change', function (e) {
    if (!e.target.classList.contains('nm-radio')) return;
    if (e.target.id === 'nm-all') S.play('roll');
    else S.play('chord', e.target.id.replace('nm-', ''));
  });

  // Drag whoosh: volume follows spin speed (read from --yaw) and fades with momentum
  var whoosh = null, lastYaw = null;

  function makeWhoosh() {
    var ctx = S.ctx, src = S.noise(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.loop = true;
    f.type = 'bandpass';
    f.frequency.value = 700;
    f.Q.value = 0.8;
    g.gain.value = 0;
    src.connect(f).connect(g).connect(S.master);
    src.start();
    return { gain: g, filter: f };
  }

  FD.ticker.add(function () {
    var yaw = parseFloat(map.style.getPropertyValue('--yaw')) || 0;
    var d = lastYaw === null ? 0 : yaw - lastYaw;
    lastYaw = yaw;
    d = ((d + 180) % 360 + 360) % 360 - 180;          // ignore the wrap when settling
    if (!S.ready()) { if (whoosh) whoosh.gain.gain.value = 0; return; }
    var speed = Math.min(1, Math.abs(d) / 12);
    if (!whoosh) { if (speed < 0.02) return; whoosh = makeWhoosh(); }
    var t = S.ctx.currentTime;
    whoosh.gain.gain.setTargetAtTime(speed * db(-22), t, 0.06);
    whoosh.filter.frequency.setTargetAtTime(500 + speed * 900, t, 0.06);
  });
})();
