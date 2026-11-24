// Mission-control sound: every cue is synthesised with Web Audio (no files).
// Nothing makes noise until unlock() has run inside a user gesture.
const KEY = 'av-sound';
const db = (v) => 10 ** (v / 20);

let enabled = true;
try { enabled = localStorage.getItem(KEY) !== 'off'; } catch { /* storage blocked */ }

let ctx = null, master = null;
let busy = [];            // end times of one-shot cues still sounding
let lastHover = 0;
let ambientWanted = false, amb = null;
const bufs = {};

function ensureCtx() {
  if (ctx) return ctx;
  try {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = enabled ? 1 : 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 24;
    comp.ratio.value = 4;
    comp.attack.value = 0.005;
    comp.release.value = 0.25;
    master.connect(comp).connect(ctx.destination);
  } catch { ctx = master = null; }
  return ctx;
}

const ready = () => enabled && ctx && ctx.state === 'running';

// Never more than 3 overlapping one-shots; extras are dropped.
function claim(len) {
  const t = ctx.currentTime;
  busy = busy.filter((end) => end > t);
  if (busy.length >= 3) return false;
  busy.push(t + len);
  return true;
}

// Cue wrapper: no-op unless audible and under the overlap cap; never throws.
const cue = (len, fn) => {
  try { if (ready() && claim(len)) fn(); } catch { /* audio failure is never fatal */ }
};

function env(g, t, peak, attack, len) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
}

function tone(type, f0, f1, len, level, at = 0, dest = master) {
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + len * 0.8);
  env(g, t, level, Math.min(0.008, len / 4), len);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + len + 0.02);
}

// Cached 2s noise buffers: white, pink (Kellet filter), brown (integrated), crackle (sparse impulses).
function buffer(kind) {
  if (bufs[kind]) return bufs[kind];
  const n = ctx.sampleRate * 2;
  const b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'pink') {
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.25;
    } else if (kind === 'brown') {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else if (kind === 'crackle') {
      d[i] = Math.random() < 0.0012 ? (Math.random() * 2 - 1) : 0;
    } else d[i] = w;
  }
  return (bufs[kind] = b);
}

function noise(kind, loop = true) {
  const s = ctx.createBufferSource();
  s.buffer = buffer(kind);
  s.loop = loop;
  return s;
}

const filter = (type, freq, q = 0.7) => {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
};

function stopAmbient() {
  if (!amb || !ctx) return;
  const a = amb, t = ctx.currentTime;
  amb = null;
  a.bed.gain.cancelScheduledValues(t);
  a.bed.gain.setTargetAtTime(0, t, 0.3);               // ~1s fade out
  a.nodes.forEach((n) => n.stop(t + 1.5));
}

function startAmbient() {
  if (amb || !enabled || !ensureCtx()) return;
  const t = ctx.currentTime;
  const bed = ctx.createGain();
  bed.gain.setValueAtTime(0, t);
  bed.gain.linearRampToValueAtTime(db(-34), t + 2);      // 2s fade in
  bed.connect(master);

  const lp = filter('lowpass', 260, 0.5);
  lp.connect(bed);
  const nodes = [];
  [[55, 0.5], [82.5, 0.3], [110.4, 0.2]].forEach(([f, v]) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = f;                               // 110.4 beats slowly against 110
    g.gain.value = v;
    o.connect(g).connect(lp);
    o.start(t);
    nodes.push(o);
  });
  const air = noise('pink'), ag = ctx.createGain();
  ag.gain.value = 0.6;
  air.connect(ag).connect(lp);
  air.start(t);
  // slow LFO breathes the filter cutoff
  const lfo = ctx.createOscillator(), lg = ctx.createGain();
  lfo.frequency.value = 0.07;
  lg.gain.value = 120;
  lfo.connect(lg).connect(lp.frequency);
  lfo.start(t);
  nodes.push(air, lfo);
  amb = { bed, nodes };
}

const NOOP_RUMBLE = { set() {}, stop() {} };

export const sound = {
  get enabled() { return enabled; },

  setEnabled(on) {
    enabled = !!on;
    try { localStorage.setItem(KEY, enabled ? 'on' : 'off'); } catch { /* ignore */ }
    if (enabled) {
      this.unlock();
      if (master) master.gain.setTargetAtTime(1, ctx.currentTime, 0.05);
      if (ambientWanted) startAmbient();
    } else if (ctx) {
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.05);   // ~150ms fade
      stopAmbient();
    }
  },

  unlock() {
    if (!enabled || !ensureCtx()) return;
    try {
      if (ctx.state === 'suspended') ctx.resume();
      const s = ctx.createBufferSource();                // silent buffer unlocks iOS
      s.buffer = ctx.createBuffer(1, 1, 22050);
      s.connect(ctx.destination);
      s.start(0);
      if (ambientWanted) startAmbient();
    } catch { /* ignore */ }
  },

  hover() {                                              // 15ms tick, -30 dB, max 1 per 60ms
    const now = performance.now();
    if (now - lastHover < 60) return;
    lastHover = now;
    cue(0.015, () => tone('sine', 1800, 1800, 0.015, db(-30)));
  },

  click() { cue(0.06, () => tone('triangle', 220, 90, 0.06, db(-18))); },

  quindar() { cue(0.25, () => tone('sine', 2525, 2525, 0.25, db(-20))); },

  beep(i) {
    if (i === 0) cue(0.4, () => tone('sine', 1500, 1500, 0.4, db(-14)));
    else cue(0.12, () => tone('sine', 1000, 1000, 0.12, db(-16)));
  },

  section() {
    cue(0.2, () => {
      tone('sine', 1320, 1320, 0.07, db(-28));
      tone('sine', 1760, 1760, 0.09, db(-28), 0.08);
    });
  },

  liftoff() {                                            // always plays, ignores the cue cap
    try {
      if (!ready()) return;
      const t = ctx.currentTime, D = 2.6;
      // roar: brown noise, lowpass sweeps up then down
      const roar = noise('brown'), rf = filter('lowpass', 120, 0.8), rg = ctx.createGain();
      rf.frequency.setValueAtTime(120, t);
      rf.frequency.exponentialRampToValueAtTime(1400, t + 1.1);
      rf.frequency.exponentialRampToValueAtTime(180, t + D);
      rg.gain.setValueAtTime(0.0001, t);
      rg.gain.exponentialRampToValueAtTime(db(-9), t + 0.5);
      rg.gain.setValueAtTime(db(-9), t + 1.2);
      rg.gain.exponentialRampToValueAtTime(0.0001, t + D);
      roar.connect(rf).connect(rg).connect(master);
      roar.start(t); roar.stop(t + D + 0.05);
      // sub thump
      tone('sine', 70, 28, 0.6, db(-8));
      // crackle: sparse impulses through a bandpass
      const cr = noise('crackle', false), cf = filter('bandpass', 2400, 1.5), cg = ctx.createGain();
      cg.gain.setValueAtTime(db(-14), t);
      cg.gain.linearRampToValueAtTime(0.0001, t + D);
      cr.connect(cf).connect(cg).connect(master);
      cr.start(t); cr.stop(t + D);
      // airy rising whoosh
      const wh = noise('pink'), wf = filter('bandpass', 300, 0.8), wg = ctx.createGain();
      wf.frequency.setValueAtTime(300, t);
      wf.frequency.exponentialRampToValueAtTime(3200, t + D);
      env(wg, t, db(-24), 1.4, D);
      wh.connect(wf).connect(wg).connect(master);
      wh.start(t); wh.stop(t + D + 0.05);
    } catch { /* ignore */ }
  },

  abort() {                                              // falling minor third
    cue(0.3, () => {
      tone('sine', 880, 880, 0.15, db(-18));
      tone('sine', 740, 740, 0.15, db(-18), 0.15);
    });
  },

  copy() {
    cue(0.2, () => {
      tone('sine', 880, 880, 0.08, db(-22));
      tone('sine', 1320, 1320, 0.12, db(-22), 0.07);
    });
  },

  ambient(on) {
    ambientWanted = !!on;
    try { on ? startAmbient() : stopAmbient(); } catch { /* ignore */ }
  },

  rumble() {                                             // hold-to-launch build-up
    try {
      if (!enabled || !ctx) return NOOP_RUMBLE; // may still be resuming; nodes start once it runs
      const t = ctx.currentTime;
      const src = noise('brown'), lp = filter('lowpass', 80, 0.9), g = ctx.createGain();
      const sub = ctx.createOscillator(), sg = ctx.createGain();
      g.gain.value = 0;
      sub.type = 'sine';
      sub.frequency.value = 38;
      sg.gain.value = 0.6;
      src.connect(lp).connect(g).connect(master);
      sub.connect(sg).connect(g);
      src.start(t); sub.start(t);
      let done = false;
      return {
        set(level) {
          if (done) return;
          const l = Math.min(1, Math.max(0, level)), n = ctx.currentTime;
          g.gain.setTargetAtTime(l * db(-12), n, 0.08);
          lp.frequency.setTargetAtTime(80 * (900 / 80) ** l, n, 0.08);
          sub.frequency.setTargetAtTime(38 + l * 14, n, 0.1);
        },
        stop(fadeMs = 200) {
          if (done) return;
          done = true;
          const n = ctx.currentTime, s = fadeMs / 1000;
          g.gain.cancelScheduledValues(n);
          g.gain.setTargetAtTime(0, n, s / 3);
          src.stop(n + s + 0.1); sub.stop(n + s + 0.1);
        },
      };
    } catch { return NOOP_RUMBLE; }
  },
};

