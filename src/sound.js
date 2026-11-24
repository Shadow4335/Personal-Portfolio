// Flight-deck sound: the score and every effect are synthesised with Web Audio (no files).
// Nothing makes noise until unlock() has run inside a user gesture.
// Energy sits in 150 Hz–5 kHz on purpose: laptop and phone speakers can't play deep bass.
const KEY = 'av-sound';
const db = (v) => 10 ** (v / 20);
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

let enabled = true;
try { enabled = localStorage.getItem(KEY) !== 'off'; } catch { /* storage blocked */ }

let ctx = null, master, sfx, musicBus, padFilter, reverb, delayIn, analyser, meterBuf;
let busy = [], lastHover = 0, lastTick = 0, unlockedOnce = false;
const bufs = {};

/* ── graph ──────────────────────────────────────────────── */
function ensureCtx() {
  if (ctx) return ctx;
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC({ latencyHint: 'interactive' });
    master = ctx.createGain();
    master.gain.value = enabled ? db(-3) : 0;
    // limiter so stacked cues never clip
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -10; lim.knee.value = 6; lim.ratio.value = 12; lim.attack.value = 0.003; lim.release.value = 0.2;
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    meterBuf = new Float32Array(analyser.fftSize);
    master.connect(lim).connect(analyser).connect(ctx.destination);

    // shared hall reverb
    reverb = ctx.createConvolver();
    reverb.buffer = impulse(3.2);
    const wet = ctx.createGain(); wet.gain.value = 0.55;
    reverb.connect(wet).connect(master);

    // ping-pong delay for the arpeggio and sparkles
    delayIn = ctx.createGain();
    const dl = ctx.createDelay(1), dr = ctx.createDelay(1), fb = ctx.createGain(), merge = ctx.createChannelMerger(2), dg = ctx.createGain();
    dl.delayTime.value = 0.375; dr.delayTime.value = 0.375; fb.gain.value = 0.38; dg.gain.value = 0.5;
    delayIn.connect(dl); dl.connect(dr); dr.connect(fb).connect(dl);
    dl.connect(merge, 0, 0); dr.connect(merge, 0, 1);
    merge.connect(dg); dg.connect(master); dg.connect(reverb);

    sfx = ctx.createGain(); sfx.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = 0;
    padFilter = ctx.createBiquadFilter(); padFilter.type = 'lowpass'; padFilter.frequency.value = 1200; padFilter.Q.value = 0.4;
    padFilter.connect(musicBus);
    musicBus.connect(master);
    const send = ctx.createGain(); send.gain.value = 0.6; musicBus.connect(send).connect(reverb);

    // a hidden tab shouldn't keep a synth running
    globalThis.document?.addEventListener('visibilitychange', () => {
      if (!ctx) return;
      if (document.hidden) ctx.suspend().catch(() => {});
      else if (enabled) ctx.resume().catch(() => {});
    });
  } catch { ctx = null; }
  return ctx;
}

function impulse(sec) {
  const len = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6;
  }
  return b;
}

function noiseBuf(kind) {
  if (bufs[kind]) return bufs[kind];
  const n = ctx.sampleRate * 2, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'pink') { b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.25; }
    else if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    else if (kind === 'crackle') d[i] = Math.random() < 0.0015 ? w : 0;
    else d[i] = w;
  }
  return (bufs[kind] = b);
}

const ready = () => enabled && ctx && ctx.state === 'running';

// Never more than 4 overlapping one-shots; extras are dropped. Audio failure is never fatal.
function fx(len, fn) {
  try {
    if (!ready()) return;
    const t = ctx.currentTime;
    busy = busy.filter((end) => end > t);
    if (busy.length >= 4) return;
    busy.push(t + len);
    fn(t);
  } catch { /* ignore */ }
}

function env(param, t, peak, attack, len) {
  param.setValueAtTime(0.0001, t);
  param.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
  param.exponentialRampToValueAtTime(0.0001, t + len);
}

// one oscillator with an envelope; `sends` = extra destinations (reverb, delay)
function tone(type, f0, f1, len, level, at = 0, sends = [], attack = 0.006) {
  const t = ctx.currentTime + at, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + len * 0.85);
  env(g.gain, t, level, Math.min(attack, len / 3), len);
  o.connect(g); g.connect(sfx);
  sends.forEach((s) => g.connect(s));
  o.start(t); o.stop(t + len + 0.05);
}

// filtered noise burst with a sweeping filter
function noise(kind, ftype, f0, f1, q, len, level, at = 0, attackFrac = 0.15, sends = []) {
  const t = ctx.currentTime + at, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf(kind); s.loop = true;
  f.type = ftype; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(f1, t + len);
  env(g.gain, t, level, len * attackFrac, len);
  s.connect(f).connect(g).connect(sfx);
  sends.forEach((x) => g.connect(x));
  s.start(t, Math.random()); s.stop(t + len + 0.05);
  return { f, g };
}

/* ── music ──────────────────────────────────────────────── */
// voicings kept between D3 and C#5 so small speakers carry them
const CHORDS = {
  Dmaj9: [50, 57, 61, 64, 66],
  Bm9: [47, 59, 62, 66, 69, 73],
  Gmaj7: [43, 55, 59, 62, 66, 71],
  'Gmaj7#11': [43, 55, 59, 62, 66, 73],
  Em9: [40, 52, 59, 62, 66, 67],
  Dlift: [50, 57, 62, 64, 66, 69, 73, 76],
};
const SEQS = {
  depart: { chords: ['Dmaj9'], len: 8 },
  climb: { chords: ['Bm9', 'Gmaj7'], len: 1.6 },
  orbit: { chords: ['Gmaj7#11', 'Em9'], len: 1.4 },
  reveal: { chords: ['Dlift', 'Bm9', 'Gmaj7#11', 'Em9', 'Dmaj9', 'Bm9', 'Gmaj7#11', 'Em9'], len: 8 },
  background: { chords: ['Dmaj9', 'Bm9', 'Gmaj7#11', 'Em9'], len: 8 },
};
const STEP = 0.1875; // a sixteenth at 80 bpm
const M = { wanted: false, playing: false, intensity: 0.35, seq: null, seqAt: 0, i: 0, chord: null, voices: [], next: 0, timer: 0, walk: 0 };

const musicLevel = (x) => (x <= 0 ? 0 : db(-23 + 11 * x)); // 1 → −12 dB (film), 0.35 → −19 dB (reading)

function padVoice(midi, at, attack) {
  const f = mtof(midi), g = ctx.createGain();
  const level = (midi < 48 ? 0.05 : 0.085);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(level, at + attack);
  const oscs = [['sawtooth', -7], ['sawtooth', 6], ['triangle', 0]].map(([type, cents]) => {
    const o = ctx.createOscillator();
    o.type = type; o.frequency.value = f; o.detune.value = cents;
    o.connect(g); o.start(at);
    return o;
  });
  g.connect(padFilter);
  return { g, oscs };
}

function release(v, at, rel) {
  const p = v.g.gain;
  if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(at); else p.cancelScheduledValues(at);
  p.setTargetAtTime(0, at, rel / 4);
  v.oscs.forEach((o) => { try { o.stop(at + rel + 0.2); } catch { /* already stopped */ } });
}

function setChord(name, at, fast) {
  const notes = CHORDS[name];
  if (!notes) return;
  const attack = fast ? 0.5 : 1.4;
  M.voices.forEach((v) => release(v, at, fast ? 0.9 : 2.2));
  M.voices = notes.map((m) => padVoice(m, at, attack));
  M.chord = notes;
}

function pluck(midi, at, level) {
  const f = mtof(midi), o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), dry = ctx.createGain();
  o.type = 'sine'; o.frequency.value = f;
  o2.type = 'triangle'; o2.frequency.value = f * 2; // a little brightness on top
  const g2 = ctx.createGain(); g2.gain.value = 0.18;
  o.connect(g); o2.connect(g2).connect(g);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(level, at + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 1.1);
  dry.gain.value = 0.7;
  g.connect(dry).connect(musicBus);
  g.connect(delayIn);
  o.start(at); o2.start(at); o.stop(at + 1.2); o2.stop(at + 1.2);
}

function shimmer(at) {
  const top = M.chord[M.chord.length - 1] + 12;
  [top, top + 7].forEach((m, k) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = mtof(m);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(0.022, at + 1.2 + k * 0.3);
    g.gain.linearRampToValueAtTime(0.0001, at + 4);
    o.connect(g); g.connect(musicBus); g.connect(delayIn);
    o.start(at); o.stop(at + 4.1);
  });
}

function schedule() {
  if (!ctx || ctx.state !== 'running' || !M.playing) return;
  const now = ctx.currentTime;
  if (M.next < now) M.next = now + 0.05; // after a pause, don't fire a backlog of notes
  while (M.seq && M.seqAt < now + 0.25) {
    const s = M.seq;
    setChord(s.chords[M.i % s.chords.length], Math.max(M.seqAt, now), s.len < 3);
    M.i++;
    M.seqAt = Math.max(M.seqAt, now) + s.len;
  }
  while (M.next < now + 0.25) {
    const x = M.intensity, at = M.next;
    const stepNo = Math.round(at / STEP);
    if (M.chord && Math.random() < 0.08 + 0.5 * x * (stepNo % 2 ? 0.6 : 1)) {
      // walk up and down the chord, an octave or two above the pad
      const pool = M.chord.filter((m) => m >= 50).flatMap((m) => [m + 12, m + 24]).filter((m) => m <= 88).sort((a, b) => a - b);
      M.walk = Math.max(0, Math.min(pool.length - 1, M.walk + (Math.random() < 0.5 ? -1 : 1) * (1 + (Math.random() < 0.3 ? 1 : 0))));
      pluck(pool[M.walk], at, 0.09 + 0.1 * x);
    }
    if (M.chord && stepNo % 64 === 0 && x > 0.5) shimmer(at);
    M.next += STEP;
  }
}

function startMusic() {
  if (!enabled || !ensureCtx()) return;
  const t = ctx.currentTime;
  padFilter.frequency.setTargetAtTime(500 + 1900 * M.intensity, t, 0.5);
  musicBus.gain.cancelScheduledValues(t);
  musicBus.gain.setTargetAtTime(musicLevel(M.intensity), t, 0.6); // ~2 s fade in
  if (M.playing) return;
  M.playing = true;
  if (!M.seq) { M.seq = SEQS.background; M.i = 0; M.seqAt = t; }
  M.next = t + 0.1;
  clearInterval(M.timer);
  M.timer = setInterval(schedule, 50);
  schedule();
}

function stopMusic(fade = 1.5) {
  clearInterval(M.timer);
  M.playing = false;
  if (!ctx) return;
  const t = ctx.currentTime;
  musicBus.gain.cancelScheduledValues(t);
  musicBus.gain.setTargetAtTime(0, t, fade / 4);
  M.voices.forEach((v) => release(v, t + fade, 0.5));
  M.voices = [];
  M.seq = null;
}

/* ── public API ─────────────────────────────────────────── */
export const sound = {
  get enabled() { return enabled; },
  get state() { return ctx ? ctx.state : 'none'; },

  setEnabled(on) {
    enabled = !!on;
    try { localStorage.setItem(KEY, enabled ? 'on' : 'off'); } catch { /* ignore */ }
    if (enabled) {
      this.unlock();
      if (master) master.gain.setTargetAtTime(db(-3), ctx.currentTime, 0.05);
    } else if (ctx) {
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.05); // ~150 ms fade
      const wanted = M.wanted;
      stopMusic(0.3);
      M.wanted = wanted; // turning sound back on brings the music back
    }
  },

  // Call from any user gesture (pointerup/click/touchend/keydown). Safe to call repeatedly.
  unlock() {
    if (!enabled || !ensureCtx()) return;
    try {
      // iOS: play through the silent switch like a media app would
      if (globalThis.navigator?.audioSession) navigator.audioSession.type = 'playback';
    } catch { /* not supported */ }
    try {
      if (ctx.state !== 'running') ctx.resume().catch(() => {});
      if (!unlockedOnce) {
        const s = ctx.createBufferSource(); // a silent buffer, for older iOS
        s.buffer = ctx.createBuffer(1, 1, 22050);
        s.connect(ctx.destination); s.start(0);
        unlockedOnce = true;
      }
      if (M.wanted && !M.playing) startMusic();
    } catch { /* ignore */ }
  },

  // RMS level of what's actually coming out, 0..1 (to check sound really plays)
  meter() {
    if (!analyser) return 0;
    analyser.getFloatTimeDomainData(meterBuf);
    let sum = 0;
    for (const v of meterBuf) sum += v * v;
    return Math.sqrt(sum / meterBuf.length);
  },

  /* site cues */
  hover() {
    const now = performance.now();
    if (now - lastHover < 60) return;
    lastHover = now;
    fx(0.02, () => tone('sine', 1800, 1800, 0.018, db(-28)));
  },
  click() { fx(0.07, () => { tone('triangle', 520, 260, 0.06, db(-16)); tone('sine', 1500, 1100, 0.025, db(-24)); }); },
  quindar() { fx(0.25, () => tone('sine', 2525, 2525, 0.25, db(-21))); }, // Apollo's radio key tone
  section() { fx(0.2, () => { tone('sine', 1320, 1320, 0.07, db(-26)); tone('sine', 1760, 1760, 0.1, db(-26), 0.08); }); },
  copy() { fx(0.2, () => { tone('sine', 880, 880, 0.08, db(-20)); tone('sine', 1320, 1320, 0.14, db(-20), 0.07); }); },
  ambient(on) { on ? this.music.start(0.35) : this.music.stop(); },

  /* film cues */
  squelch() { // radio key-up
    fx(0.18, () => {
      noise('white', 'bandpass', 2400, 900, 1.4, 0.14, db(-17), 0, 0.05);
      tone('square', 1200, 700, 0.03, db(-32));
    });
  },
  radarPing() { fx(0.8, () => tone('sine', 1200, 1180, 0.7, db(-17), 0, [reverb], 0.004)); },
  typeTick() {
    const now = performance.now();
    if (now - lastTick < 35) return;
    lastTick = now;
    fx(0.012, () => noise('white', 'highpass', 3200, 3200, 0.7, 0.01, db(-30), 0, 0.2));
  },
  callout() { // cockpit chime: ding-dong
    fx(0.6, () => {
      tone('sine', 988, 988, 0.45, db(-16), 0, [reverb]);
      tone('triangle', 988, 988, 0.3, db(-26));
      tone('sine', 740, 740, 0.55, db(-16), 0.16, [reverb]);
      tone('triangle', 740, 740, 0.35, db(-26), 0.16);
    });
  },
  beep(i) { // countdown: 3, 2, 1 short; 0 = ignition, longer and higher
    if (i === 0) fx(0.45, () => tone('sine', 1480, 1480, 0.42, db(-15), 0, [reverb]));
    else fx(0.15, () => tone('sine', 988, 988, 0.13, db(-15)));
  },
  liftoff() { // ignition and climb-out: a mid-heavy roar (so laptops carry it), crackle, a thump
    try {
      if (!ready()) return;
      const t = ctx.currentTime, D = 4.4;
      const roar = noise('brown', 'lowpass', 260, 1300, 0.7, D, db(-8), 0, 0.08);
      roar.f.frequency.setValueAtTime(260, t);
      roar.f.frequency.exponentialRampToValueAtTime(1300, t + 0.9);
      roar.f.frequency.exponentialRampToValueAtTime(380, t + D);
      noise('pink', 'bandpass', 700, 1800, 0.9, D * 0.85, db(-15), 0, 0.12);
      noise('crackle', 'bandpass', 1600, 1100, 1.2, D * 0.8, db(-10), 0.25, 0.1);
      tone('sine', 120, 48, 0.8, db(-9));
      tone('triangle', 240, 90, 0.5, db(-16));
    } catch { /* ignore */ }
  },
  stageSep() { // pyro bolts: a hard knock, a hiss of thrusters
    fx(1.0, () => {
      tone('sine', 190, 60, 0.28, db(-11));
      noise('white', 'bandpass', 1300, 600, 1.1, 0.25, db(-15), 0, 0.03, [reverb]);
      noise('white', 'highpass', 4200, 3000, 0.7, 0.8, db(-26), 0.15, 0.2);
    });
  },
  whoosh() {
    fx(1.2, () => {
      const t = ctx.currentTime, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), p = ctx.createStereoPanner();
      s.buffer = noiseBuf('pink'); s.loop = true;
      f.type = 'bandpass'; f.Q.value = 0.9;
      f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(3200, t + 0.55); f.frequency.exponentialRampToValueAtTime(600, t + 1.1);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(db(-12), t + 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.15);
      p.pan.setValueAtTime(-0.7, t); p.pan.linearRampToValueAtTime(0.7, t + 1.1);
      s.connect(f).connect(g).connect(p).connect(sfx);
      g.connect(reverb);
      s.start(t, Math.random()); s.stop(t + 1.2);
    });
  },
  sparkle() { // stars and labels appearing
    fx(1.0, () => [76, 79, 81, 84, 86, 88].forEach((m, i) => tone('sine', mtof(m), mtof(m), 0.35, db(-22), i * 0.05, [delayIn, reverb], 0.003)));
  },
  hit() { // the name lands: a full chord, a soft low boom, a glint on top
    try {
      if (!ready()) return;
      const t = ctx.currentTime, f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = 'lowpass'; f.Q.value = 0.5;
      f.frequency.setValueAtTime(3400, t); f.frequency.exponentialRampToValueAtTime(900, t + 3.5);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(db(-12), t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 4.5);
      f.connect(g); g.connect(sfx); g.connect(reverb);
      [50, 57, 62, 66, 69, 73, 76].forEach((m) => [-6, 6].forEach((c) => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = c;
        const vg = ctx.createGain(); vg.gain.value = 0.11;
        o.connect(vg).connect(f); o.start(t); o.stop(t + 4.6);
      }));
      tone('sine', 110, 55, 0.9, db(-10));
      noise('brown', 'lowpass', 600, 200, 0.7, 0.4, db(-12), 0, 0.02);
      [88, 93].forEach((m, i) => tone('sine', mtof(m), mtof(m), 1.4, db(-24), 0.05 + i * 0.08, [reverb, delayIn], 0.01));
    } catch { /* ignore */ }
  },
  shutter() { // telescope aperture: three mechanical ticks and a swish
    fx(0.5, () => {
      [0, 0.06, 0.11].forEach((at) => noise('white', 'highpass', 2600, 2600, 0.9, 0.012, db(-16), at, 0.1));
      noise('white', 'bandpass', 1400, 3000, 1.2, 0.35, db(-22), 0.05, 0.3, [reverb]);
    });
  },

  music: {
    get playing() { return M.playing; },
    start(intensity = 1) {
      M.wanted = true;
      M.intensity = intensity;
      startMusic();
    },
    setIntensity(x, sec = 2) {
      M.intensity = x;
      if (!ctx || !M.playing) return;
      const t = ctx.currentTime;
      musicBus.gain.cancelScheduledValues(t);
      musicBus.gain.setTargetAtTime(musicLevel(x), t, Math.max(0.05, sec / 3));
      padFilter.frequency.setTargetAtTime(500 + 1900 * x, t, Math.max(0.05, sec / 3));
    },
    // jump the score to a chapter right away
    cue(name) {
      if (!SEQS[name]) return;
      M.seq = SEQS[name]; M.i = 0;
      M.seqAt = ctx ? ctx.currentTime : 0;
      if (M.playing) schedule();
    },
    stop(fade = 1.5) { M.wanted = false; stopMusic(fade); },
  },
};
