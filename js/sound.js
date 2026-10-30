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
  var lastHover = 0;

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
      return 0.05;
    },
    nominal: function () {         // two-note rising fifth, 600ms, −14 dB
      tone('sine', 523.25, 523.25, 0.32, db(-14));
      tone('sine', 783.99, 783.99, 0.45, db(-14), 0.15);
      return 0.6;
    },
    hover: function () {           // 15ms sine tick at 1.8 kHz, −26 dB
      tone('sine', 1800, 1800, 0.015, db(-26));
      return 0.015;
    },
    click: function () {           // low-passed "thock", 60ms, −18 dB
      tone('triangle', 220, 90, 0.06, db(-18));
      return 0.06;
    }
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

    play: function (name) {
      if (!ready() || !cues[name]) return;
      if (name === 'hover') {
        if (!FD.finePointer.matches) return;          // no hover cues on phones
        var now = performance.now();
        if (now - lastHover < 80) return;             // one per 80ms
        lastHover = now;
      }
      var probe = { tick: 0.05, nominal: 0.6, hover: 0.015, click: 0.06 }[name] || 0.3;
      if (!claim(probe)) return;
      cues[name]();
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
