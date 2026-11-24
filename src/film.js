// The opening film, drawn on a 2D canvas as a pure function of time t (seconds).
// intro.js owns the clock, the sound cues and the HTML overlay; this file only paints.

export const T = { depart: 0, launch: 2.6, orbit: 7.6, light: 10.4, hit: 11.8, iris: 12.4, end: 13.6 };
export const IGN = 4.6, LIFT = 5.0, SEP = 7.3; // ignition, liftoff, stage separation
export const COUNT = [[2.9, '3'], [3.5, '2'], [4.1, '1']];

const BONE = '236,230,218';
const ICE = '169,203,236';
const SIG = '255,90,31';
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const seg = (t, a, b) => clamp01((t - a) / (b - a)); // how far t is through [a, b]
const lerp = (a, b, x) => a + (b - a) * x;
const inOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const out = (x) => 1 - Math.pow(1 - x, 3);
const MONO = '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace';
const DISPLAY = '"Archivo Variable", Archivo, "Helvetica Neue", Arial, sans-serif';

// Orion and two neighbours (RA in hours, Dec in degrees, J2000).
const STARS = {
  betelgeuse: [5.919, 7.407, 'BETELGEUSE  α Ori'],
  bellatrix: [5.418, 6.35, 'BELLATRIX  γ Ori'],
  meissa: [5.585, 9.934],
  alnitak: [5.679, -1.943],
  alnilam: [5.604, -1.202, 'BELT'],
  mintaka: [5.533, -0.299],
  saiph: [5.796, -9.67],
  rigel: [5.242, -8.202, 'RIGEL  β Ori'],
  sirius: [6.752, -16.716, 'SIRIUS  α CMa'],
  aldebaran: [4.599, 16.509, 'ALDEBARAN  α Tau'],
};
const ORION = [['meissa', 'betelgeuse'], ['meissa', 'bellatrix'], ['betelgeuse', 'alnitak'], ['bellatrix', 'mintaka'],
  ['alnitak', 'alnilam'], ['alnilam', 'mintaka'], ['alnitak', 'saiph'], ['mintaka', 'rigel']];
const POINTERS = [['alnitak', 'sirius'], ['mintaka', 'aldebaran']]; // the belt points both ways

export const CALLOUTS = [[5.0, 'LIFTOFF'], [6.0, 'MAX-Q'], [6.9, 'MECO'], [7.3, 'STAGE SEPARATION']];
const BLIPS = [[0.13, 205, 'AV26'], [0.62, 40], [0.78, 118], [0.45, 300], [0.86, 255], [0.33, 150]];
export const SWEEP_PERIOD = 2.4;

// small seeded RNG so the sky is the same on every visit
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, x) => { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], x))).join(',')})`; };

export function createFilm(canvas, { lowPower = false } = {}) {
  const ctx = canvas.getContext('2d');
  const rand = rng(26);
  const sky = Array.from({ length: lowPower ? 320 : 640 }, () => ({ x: rand(), y: rand(), m: rand() ** 3, p: rand() * TAU }));
  let w = 0, h = 0, R = 0, cx = 0, cy = 0, narrow = false;
  let name = null; // { pts, links, fs, lines, ty }

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, lowPower ? 1.5 : 2);
    w = innerWidth; h = innerHeight; narrow = w < 700;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    R = Math.min(w, h) * (narrow ? 0.36 : 0.29);
    cx = w / 2; cy = h / 2 - (narrow ? h * 0.05 : 0);
    name = layoutName();
  }

  // Sample the name into points; each point starts life as a star somewhere in the sky.
  function layoutName() {
    if (w < 1 || h < 1) return null; // hidden tab or zero-size frame: try again on the next resize
    const lines = narrow || w / h < 1.1 ? ['ARNAV', 'VERMA'] : ['ARNAV VERMA'];
    const fs = lines.length === 1 ? Math.min(w * 0.095, h * 0.2) : Math.min(w * 0.19, h * 0.13);
    const off = document.createElement('canvas');
    off.width = Math.ceil(w); off.height = Math.ceil(h);
    const o = off.getContext('2d');
    o.font = `800 ${fs}px ${DISPLAY}`;
    try { o.fontStretch = 'expanded'; } catch { /* older canvas: normal width */ }
    o.textAlign = 'center'; o.textBaseline = 'middle'; o.fillStyle = '#fff';
    const lh = fs * 0.92, top = cy - ((lines.length - 1) * lh) / 2;
    lines.forEach((l, i) => o.fillText(l, cx, top + i * lh));
    const step = Math.max(4, Math.round(fs / (lowPower ? 16 : 22)));
    const data = o.getImageData(0, 0, off.width, off.height).data;
    let pts = [];
    for (let y = 0; y < off.height; y += step) {
      for (let x = 0; x < off.width; x += step) {
        if (data[(y * off.width + x) * 4 + 3] > 140) pts.push({ tx: x, ty: y });
      }
    }
    const r = rng(7);
    for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; }
    pts = pts.slice(0, lowPower ? 420 : 900);
    const minX = Math.min(...pts.map((p) => p.tx)), maxX = Math.max(...pts.map((p) => p.tx));
    pts.forEach((p) => { p.sx = r() * w; p.sy = r() * h; p.d = (p.tx - minX) / (maxX - minX || 1); p.m = r(); });
    // constellation-style strokes: each point links to its nearest neighbours
    const links = [], max = step * 1.75;
    for (let i = 0; i < pts.length; i++) {
      let best = [];
      for (let j = i + 1; j < pts.length; j++) {
        const d = Math.hypot(pts[i].tx - pts[j].tx, pts[i].ty - pts[j].ty);
        if (d < max) best.push([d, j]);
      }
      best.sort((a, b) => a[0] - b[0]).slice(0, 2).forEach(([, j]) => links.push([i, j]));
    }
    return { pts, links, fs, lines, top, lh };
  }

  /* ── pieces ───────────────────────────────────────────── */
  function stars(t, alpha) {
    if (alpha <= 0) return;
    for (const s of sky) {
      const a = alpha * (0.2 + 0.8 * s.m) * (0.75 + 0.25 * Math.sin(t * 2.6 + s.p));
      const z = 0.6 + s.m * 1.6;
      ctx.fillStyle = `rgba(${BONE},${a.toFixed(3)})`;
      ctx.fillRect(s.x * w, s.y * h, z, z);
    }
  }

  function text(str, x, y, size, color, align = 'left', weight = 500, font = MONO) {
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  function radar(t, a) {
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a;
    const sc = 1 + seg(t, 2.2, 2.8) * 0.08;
    ctx.translate(cx, cy); ctx.scale(sc, sc);
    // range rings and crosshair
    ctx.lineWidth = 1;
    [0.25, 0.5, 0.75, 1].forEach((k) => { ctx.strokeStyle = `rgba(${BONE},${k === 1 ? 0.4 : 0.14})`; ctx.beginPath(); ctx.arc(0, 0, R * k, 0, TAU); ctx.stroke(); });
    ctx.strokeStyle = `rgba(${BONE},0.1)`;
    ctx.beginPath(); ctx.moveTo(-R, 0); ctx.lineTo(R, 0); ctx.moveTo(0, -R); ctx.lineTo(0, R); ctx.stroke();
    // bearing ticks, numbered every 30°
    for (let b = 0; b < 360; b += 5) {
      const an = (b - 90) * DEG, long = b % 30 === 0;
      ctx.strokeStyle = `rgba(${BONE},${long ? 0.5 : 0.22})`;
      ctx.beginPath(); ctx.moveTo(Math.cos(an) * R, Math.sin(an) * R); ctx.lineTo(Math.cos(an) * R * (long ? 1.045 : 1.022), Math.sin(an) * R * (long ? 1.045 : 1.022)); ctx.stroke();
      if (long) text(String(b).padStart(3, '0'), Math.cos(an) * R * 1.1, Math.sin(an) * R * 1.1, narrow ? 9 : 10, `rgba(${BONE},0.55)`, 'center');
    }
    // sweep with a fading trail
    const sw = (t / SWEEP_PERIOD) * TAU - Math.PI / 2;
    for (let i = 0; i < 28; i++) {
      ctx.fillStyle = `rgba(${ICE},${(0.16 * (1 - i / 28)).toFixed(3)})`;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, sw - (i + 1) * 0.035, sw - i * 0.035); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = `rgba(${ICE},0.85)`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(sw) * R, Math.sin(sw) * R); ctx.stroke();
    // blips glow when the sweep passes, then fade
    for (const [r, b, tag] of BLIPS) {
      const an = (b - 90) * DEG;
      const since = (((sw - an) % TAU) + TAU) % TAU;
      const glow = Math.exp(-since * 0.9);
      const x = Math.cos(an) * R * r, y = Math.sin(an) * R * r;
      ctx.fillStyle = tag ? `rgba(${SIG},${(0.45 + 0.55 * glow).toFixed(3)})` : `rgba(${BONE},${(0.15 + 0.7 * glow).toFixed(3)})`;
      ctx.fillRect(x - 2.5, y - 2.5, 5, 5);
      if (tag) {
        // a controller's data block: callsign, flight level, speed
        ctx.strokeStyle = `rgba(${SIG},0.6)`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x + 4, y - 4); ctx.lineTo(x + 26, y - 22); ctx.stroke();
        text('AV26', x + 30, y - 30, narrow ? 10 : 11, `rgba(${BONE},0.95)`, 'left', 600);
        text('↑005  140KT', x + 30, y - 16, narrow ? 9 : 10, `rgba(${BONE},0.6)`);
      }
    }
    text('RANGE  PAD 26', -R * 0.98, R * 1.0, narrow ? 9 : 10, `rgba(${BONE},0.45)`);
    ctx.restore();
  }

  function tape(x, w2, value, step, every, fmt, readout) {
    const top = cy - R, H = R * 2, px = H / 6;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, top, w2, H); ctx.clip();
    ctx.fillStyle = 'rgba(12,14,22,0.7)'; ctx.fillRect(x, top, w2, H);
    const base = Math.floor(value / step) * step;
    for (let k = -4; k <= 4; k++) {
      const v = base + k * step;
      if (v < 0) continue;
      const y = cy - ((v - value) / step) * px;
      ctx.strokeStyle = `rgba(${BONE},0.5)`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + (x < cx ? w2 - 8 : 0), y); ctx.lineTo(x + (x < cx ? w2 : 8), y); ctx.stroke();
      if (v % every === 0) text(fmt(v), x + w2 / 2, y, narrow ? 9 : 11, `rgba(${BONE},0.8)`, 'center');
    }
    ctx.restore();
    ctx.strokeStyle = `rgba(${BONE},0.3)`; ctx.strokeRect(x, top, w2, H);
    ctx.fillStyle = '#030409'; ctx.fillRect(x - 4, cy - 14, w2 + 8, 28);
    ctx.strokeStyle = `rgba(${SIG},0.9)`; ctx.strokeRect(x - 4, cy - 14, w2 + 8, 28);
    text(readout, x + w2 / 2, cy, narrow ? 11 : 13, `rgb(${BONE})`, 'center', 700);
  }

  /* ── chapter 2: the launch ────────────────────────────── */
  // a soft white puff, drawn once and stamped for every bit of smoke and cloud
  const puff = document.createElement('canvas');
  puff.width = puff.height = 64;
  { const p = puff.getContext('2d'), g = p.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(236,230,218,1)'); g.addColorStop(0.5, 'rgba(236,230,218,0.42)'); g.addColorStop(1, 'rgba(236,230,218,0)');
    p.fillStyle = g; p.fillRect(0, 0, 64, 64); }
  // smoke is a pure function of time too: each puff has its own launch moment, direction and speed
  const smoke = Array.from({ length: lowPower ? 80 : 170 }, () => ({ ts: IGN + rand() * 1.5, dir: rand() < 0.5 ? -1 : 1, sp: rand(), rise: rand(), r0: 0.5 + rand() * 0.9 }));

  const s0 = () => Math.min((h * (narrow ? 0.4 : 0.46)) / 14, w * 0.055);
  const baseY = () => h * (narrow ? 0.76 : 0.8);
  function altPx(t) { return t < LIFT ? 0 : h * 0.55 * (t - LIFT) ** 2.2; }
  function camPx(t) {
    // the camera holds while the rocket clears the tower, then follows it up (smoothly, no jolt)
    const k = h * 0.2, f = (d) => (d + Math.hypot(d, k)) / 2;
    return f(altPx(t) - h * 0.28) - f(-h * 0.28);
  }
  function rocketPos(t) {
    const s = s0() * lerp(1, 0.32, inOut(seg(t, 6.6, 8.2)));
    return {
      x: cx + w * (narrow ? 0.05 : 0.12) * inOut(seg(t, 6.2, 7.6)), // pitching east
      y: baseY() - altPx(t) + camPx(t) - 0.4 * s0(),
      s, ang: 0.26 * inOut(seg(t, 5.8, 7.6)),
    };
  }

  function plume(y, s, power, t, vac) {
    if (power <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const f = 0.86 + 0.14 * Math.sin(t * 41) * Math.sin(t * 27 + 1);
    const L = s * (vac ? 6 : 7.5) * power * f, W = s * (vac ? 0.85 : 0.78);
    const col = vac ? '170,195,255' : '255,150,70';
    let g = ctx.createRadialGradient(0, y + L * 0.3, 0, 0, y + L * 0.3, L);
    g.addColorStop(0, `rgba(${col},${(vac ? 0.28 : 0.5) * power})`); g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, y + L * 0.45, W * (vac ? 1.2 : 1.8), L * 0.7, 0, 0, TAU); ctx.fill();
    g = ctx.createLinearGradient(0, y, 0, y + L);
    g.addColorStop(0, `rgba(255,240,210,${0.95 * power})`);
    g.addColorStop(0.35, vac ? `rgba(190,210,255,${0.5 * power})` : `rgba(255,165,75,${0.8 * power})`);
    g.addColorStop(1, 'rgba(255,90,31,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(-W * 0.55, y); ctx.quadraticCurveTo(-W, y + L * 0.3, 0, y + L); ctx.quadraticCurveTo(W, y + L * 0.3, W * 0.55, y); ctx.fill();
    ctx.fillStyle = `rgba(255,255,245,${0.9 * power})`;
    ctx.beginPath(); ctx.ellipse(0, y + L * 0.1, W * 0.3, L * 0.13, 0, 0, TAU); ctx.fill();
    if (!vac) for (let i = 1; i <= 3; i++) { // shock diamonds
      const yy = y + L * (0.2 + i * 0.13), d = W * 0.22 / i;
      ctx.fillStyle = `rgba(255,240,210,${(0.45 * power) / i})`;
      ctx.beginPath(); ctx.moveTo(0, yy - d * 1.6); ctx.lineTo(d, yy); ctx.lineTo(0, yy + d * 1.6); ctx.lineTo(-d, yy); ctx.fill();
    }
    ctx.restore();
  }

  function bodyGrad(s) {
    const g = ctx.createLinearGradient(-0.55 * s, 0, 0.55 * s, 0);
    g.addColorStop(0, '#6c6861'); g.addColorStop(0.33, '#ece6da'); g.addColorStop(0.62, '#d6d0c4'); g.addColorStop(1, '#77726a');
    return g;
  }

  // the rocket, nozzle exit at (0,0), pointing up; parts: 'all' | 'lower' | 'upper'
  function rocket(p, t, parts, flame) {
    const { s } = p;
    ctx.save();
    ctx.translate(p.x, p.y); ctx.rotate(p.ang);
    const body = bodyGrad(s);
    if (parts !== 'upper') {
      plume(0, s, flame, t, false);
      ctx.fillStyle = '#17191f';
      ctx.beginPath(); ctx.moveTo(-0.4 * s, 0); ctx.lineTo(0.4 * s, 0); ctx.lineTo(0.5 * s, -0.55 * s); ctx.lineTo(-0.5 * s, -0.55 * s); ctx.fill();
      ctx.fillStyle = body; ctx.fillRect(-0.5 * s, -8 * s, s, 7.46 * s);
      ctx.fillStyle = `rgb(${SIG})`; ctx.fillRect(-0.5 * s, -6.95 * s, s, 0.28 * s);
      ctx.fillStyle = '#17191f';
      ctx.fillRect(-0.74 * s, -7.8 * s, 0.24 * s, 0.32 * s); ctx.fillRect(0.5 * s, -7.8 * s, 0.24 * s, 0.32 * s); // grid fins
      ctx.strokeStyle = '#2a2d35'; ctx.lineWidth = Math.max(1, s * 0.07);
      ctx.beginPath(); ctx.moveTo(-0.48 * s, -0.6 * s); ctx.lineTo(-0.6 * s, -2.6 * s); ctx.moveTo(0.48 * s, -0.6 * s); ctx.lineTo(0.6 * s, -2.6 * s); ctx.stroke(); // folded legs
      if (s > 9) {
        ctx.save(); ctx.translate(0.06 * s, -4.2 * s); ctx.rotate(-Math.PI / 2);
        text('AV26', 0, 0, Math.max(8, s * 0.42), 'rgba(23,25,31,0.85)', 'center', 800, DISPLAY);
        ctx.restore();
      }
      ctx.fillStyle = '#16181e'; ctx.fillRect(-0.5 * s, -8.9 * s, s, 0.92 * s); // interstage
    }
    if (parts !== 'lower') {
      if (parts === 'upper') {
        plume(-8.1 * s, s, flame, t, true);
        ctx.fillStyle = '#2a2d35';
        ctx.beginPath(); ctx.moveTo(-0.16 * s, -8.9 * s); ctx.lineTo(0.16 * s, -8.9 * s); ctx.lineTo(0.38 * s, -8.1 * s); ctx.lineTo(-0.38 * s, -8.1 * s); ctx.fill();
      }
      ctx.fillStyle = body; ctx.fillRect(-0.5 * s, -11.4 * s, s, 2.52 * s);
      ctx.beginPath();
      ctx.moveTo(-0.56 * s, -11.4 * s); ctx.lineTo(-0.56 * s, -12.2 * s);
      ctx.quadraticCurveTo(-0.5 * s, -13.5 * s, 0, -14 * s); ctx.quadraticCurveTo(0.5 * s, -13.5 * s, 0.56 * s, -12.2 * s);
      ctx.lineTo(0.56 * s, -11.4 * s); ctx.fill();
      ctx.strokeStyle = 'rgba(23,25,31,0.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, -11.4 * s); ctx.lineTo(0, -13.9 * s); ctx.stroke(); // fairing seam
    }
    ctx.restore();
  }

  function skyFill(t, a) {
    const k = seg(t, 5.2, 7.4);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, mix('#0a1830', '#030409', k));
    g.addColorStop(0.62, mix('#1d3658', '#030409', k));
    g.addColorStop(1, mix('#7a5243', '#030409', Math.min(1, k * 1.5)));
    ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); ctx.restore();
  }

  function clouds(t, layers) {
    const cam = camPx(t);
    for (const [alt, a, off] of layers) {
      const y = baseY() - alt * h + cam;
      if (y < -h * 0.2 || y > h * 1.2) continue;
      ctx.globalAlpha = a * (1 - seg(t, 6.6, 7.4));
      for (let j = 0; j < 6; j++) {
        const x = ((j / 5) * 1.3 - 0.15 + off) * w, cw = w * 0.42, ch = h * 0.07;
        ctx.drawImage(puff, x - cw / 2, y - ch / 2 + (j % 2) * ch * 0.3, cw, ch);
      }
    }
    ctx.globalAlpha = 1;
  }

  function pad(t, gy, s) {
    if (gy > h + 20) return;
    // distant ridge and ground
    ctx.fillStyle = '#07080d';
    ctx.beginPath(); ctx.moveTo(0, gy - h * 0.035);
    for (let x = 0; x <= w; x += w / 12) ctx.lineTo(x, gy - h * (0.02 + 0.018 * Math.sin(x * 0.011 + 1.3)));
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.fill();
    ctx.fillStyle = '#040508'; ctx.fillRect(0, gy, w, h - gy + 2);
    // floodlights
    for (const fx of [-6, 7]) {
      const g = ctx.createRadialGradient(cx + fx * s, gy - s, 0, cx + fx * s, gy - s, s * 6);
      g.addColorStop(0, 'rgba(255,230,190,0.22)'); g.addColorStop(1, 'rgba(255,230,190,0)');
      ctx.fillStyle = g; ctx.fillRect(cx + fx * s - s * 6, gy - s * 7, s * 12, s * 12);
    }
    // launch mount
    ctx.fillStyle = '#121419'; ctx.fillRect(cx - 2.6 * s, gy - 0.4 * s, 5.2 * s, 0.4 * s);
    // the tower: a lattice with a red aviation light on top
    const tx = cx - 2.2 * s, tw = 1.1 * s, th = 13 * s;
    ctx.strokeStyle = '#30343d'; ctx.lineWidth = Math.max(1, s * 0.06);
    ctx.beginPath();
    ctx.moveTo(tx, gy); ctx.lineTo(tx, gy - th); ctx.moveTo(tx - tw, gy); ctx.lineTo(tx - tw, gy - th);
    for (let y = 0; y < th; y += tw) { ctx.moveTo(tx, gy - y); ctx.lineTo(tx - tw, gy - y - tw); ctx.moveTo(tx - tw, gy - y); ctx.lineTo(tx, gy - y - tw); }
    const arm = 1.6 * s * (1 - seg(t, IGN - 1, IGN - 0.3)); // the access arm swings away before ignition
    ctx.moveTo(tx, gy - 11 * s); ctx.lineTo(tx + arm, gy - 11 * s);
    ctx.stroke();
    if (Math.sin(t * 5) > 0) {
      ctx.fillStyle = 'rgba(255,60,40,0.95)'; ctx.beginPath(); ctx.arc(tx - tw / 2, gy - th - 4, 2.5, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,60,40,0.2)'; ctx.beginPath(); ctx.arc(tx - tw / 2, gy - th - 4, 10, 0, TAU); ctx.fill();
    }
  }

  function smokeAndVapour(t, gy, s, p) {
    // cold vapour venting off the tank before ignition
    if (t < IGN + 0.4) {
      for (let i = 0; i < 6; i++) {
        const ph = (t * 0.7 + i / 6) % 1, side = i % 2 ? 1 : -1;
        const x = p.x + side * (0.5 + ph * 1.1) * s, y = p.y - (5.5 + (i % 3) * 1.6) * s - ph * 1.4 * s, r = s * (0.3 + ph * 0.9);
        ctx.globalAlpha = 0.28 * (1 - ph) * (1 - seg(t, IGN, IGN + 0.4));
        ctx.drawImage(puff, x - r, y - r, r * 2, r * 2);
      }
    }
    // exhaust smoke billowing out of the flame trench
    for (const q of smoke) {
      const a = t - q.ts;
      if (a <= 0) continue;
      const dx = q.dir * s * (1.2 + q.sp * 7) * (1 - Math.exp(-a * 1.4));
      const dy = s * (0.3 + q.rise * 2.2 * a);
      const r = s * (q.r0 + 1.6 * a);
      const al = 0.55 * seg(a, 0, 0.15) * (1 - seg(a, 1.6, 4.2));
      const y = gy - dy;
      if (al <= 0 || y - r > h) continue;
      ctx.globalAlpha = al;
      ctx.drawImage(puff, cx + dx - r, y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
    // the flame lights the smoke from inside
    const glow = seg(t, IGN, IGN + 0.2) * (1 - seg(t, LIFT + 0.6, LIFT + 2.2));
    if (glow > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(cx, gy, 0, cx, gy, s * 9);
      g.addColorStop(0, `rgba(255,150,70,${0.55 * glow})`); g.addColorStop(1, 'rgba(255,90,31,0)');
      ctx.fillStyle = g; ctx.fillRect(cx - s * 9, gy - s * 9, s * 18, s * 18);
      ctx.restore();
    }
  }

  function launch(t, a, has3D) {
    if (!has3D) launchScene(t, a); // with WebGL the real 3D rocket (launch3d.js) shows instead
    launchHud(t);
  }

  // the 2D fallback rocket, pad and smoke
  function launchScene(t, a) {
    const p = rocketPos(t), gy = baseY() + camPx(t), s = s0();
    const shake = s * 0.07 * seg(t, IGN, IGN + 0.3) * (1 - seg(t, LIFT + 0.5, LIFT + 1.8));
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(Math.sin(t * 91) * shake, Math.sin(t * 73 + 2) * shake);
    clouds(t, [[1.9, 0.22, 0.1], [3.1, 0.18, -0.2]]);
    pad(t, gy, s);
    const flame = seg(t, IGN, IGN + 0.25) * (1 - seg(t, 6.9, 7.0)); // MECO at 6.9 s
    if (t < SEP) rocket(p, t, 'all', flame);
    else { // the spent first stage falls away, tumbling
      const k = t - SEP;
      rocket({ x: p.x - k * p.s * 1.2, y: p.y + k * k * p.s * 9, s: p.s, ang: p.ang - k * 0.7 }, t, 'lower', 0);
    }
    smokeAndVapour(t, gy, s, p);
    clouds(t, [[1.2, 0.3, 0.35]]); // one layer passes in front
    ctx.restore();
  }

  // countdown, telemetry and callouts, drawn over either rocket
  function launchHud(t) {
    for (const [at, n] of COUNT) {
      const k = seg(t, at, at + 0.06) * (1 - seg(t, at + 0.45, at + 0.58));
      if (k > 0) {
        text('T−', cx - (narrow ? 44 : 70), h * 0.22, narrow ? 14 : 18, `rgba(${SIG},${k})`, 'right', 700);
        text(n, cx, h * 0.22, Math.min(w, h) * 0.17, `rgba(${BONE},${k})`, 'center', 800, DISPLAY);
      }
    }
    const tel = seg(t, LIFT, LIFT + 0.4) * (1 - seg(t, 7.4, 7.9));
    if (tel > 0) {
      const v = 7800 * seg(t, LIFT, 7.6) ** 1.6, km = 80 * seg(t, LIFT, 7.6) ** 2;
      ctx.save(); ctx.globalAlpha = tel;
      const tw = narrow ? 46 : 64, edge = narrow ? 12 : w * 0.12;
      if (!narrow) {
        tape(edge, tw, v, 500, 1000, (x) => (x / 1000).toFixed(0) + 'k', Math.round(v).toLocaleString('en-US'));
        tape(w - edge - tw, tw, km, 5, 10, String, km.toFixed(1));
        text('KM/H', edge + tw / 2, cy - R - 14, 10, `rgba(${BONE},0.5)`, 'center');
        text('ALT KM', w - edge - tw / 2, cy - R - 14, 10, `rgba(${BONE},0.5)`, 'center');
      } else {
        text(`${Math.round(v).toLocaleString('en-US')} KM/H`, edge, h * 0.1, 12, `rgb(${BONE})`, 'left', 700);
        text(`${km.toFixed(1)} KM`, w - edge, h * 0.1, 12, `rgb(${BONE})`, 'right', 700);
      }
      ctx.restore();
    }
    CALLOUTS.forEach(([at, msg], i) => {
      const end = Math.min(at + 0.75, (CALLOUTS[i + 1]?.[0] ?? Infinity) - 0.02);
      const k = seg(t, at, at + 0.08) * (1 - seg(t, end - 0.15, end));
      if (k > 0) text(msg, cx, h * 0.9, narrow ? 20 : 28, `rgba(${BONE},${k})`, 'center', 700);
    });
  }

  // after separation the second stage keeps burning toward orbit, shrinking into the stars
  function upperStage(t, has3D) {
    if (t < SEP) return;
    const a = 1 - seg(t, 9.6, 10.3);
    if (a <= 0) return;
    if (has3D) {
      // the 3D view has handed over: the stage is now a far-off light burning toward orbit
      const k = inOut(seg(t, T.orbit, 10.2)), x = lerp(cx + w * 0.04, cx + w * (narrow ? 0.22 : 0.3), k), y = lerp(h * 0.42, h * 0.16, k);
      const fade = a * seg(t, T.orbit - 0.1, T.orbit + 0.4);
      if (fade <= 0) return;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 14);
      g.addColorStop(0, `rgba(220,232,255,${fade})`); g.addColorStop(1, 'rgba(170,195,255,0)');
      ctx.fillStyle = g; ctx.fillRect(x - 14, y - 14, 28, 28);
      ctx.strokeStyle = `rgba(169,203,236,${0.35 * fade})`; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - (narrow ? 30 : 60), y + (narrow ? 26 : 50)); ctx.stroke();
      return;
    }
    let p = rocketPos(Math.min(t, T.orbit));
    if (t > T.orbit) {
      const k = inOut(seg(t, T.orbit, 10.2)), q = p;
      p = { x: lerp(q.x, cx + w * (narrow ? 0.22 : 0.3), k), y: lerp(q.y, h * 0.16, k), s: lerp(q.s, q.s * 0.25, k), ang: lerp(q.ang, 0.9, k) };
    }
    ctx.save(); ctx.globalAlpha = a;
    rocket(p, t, 'upper', seg(t, SEP + 0.15, SEP + 0.3));
    ctx.restore();
  }

  // Earth's curved edge rises into view once we're above the air
  function limb(t) {
    const a = seg(t, T.orbit, T.orbit + 0.8) * (1 - seg(t, T.light, T.light + 0.8));
    if (a <= 0) return;
    const Re = Math.max(w, h) * 1.4, top = lerp(h + 30, h * (narrow ? 0.88 : 0.84), out(seg(t, T.orbit, T.orbit + 1.4)));
    ctx.save(); ctx.globalAlpha = a;
    const g = ctx.createLinearGradient(0, top, 0, h);
    g.addColorStop(0, '#0d1b30'); g.addColorStop(1, '#030409');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, top + Re, Re, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(120,175,255,0.8)'; ctx.lineWidth = 3; ctx.shadowColor = 'rgba(90,150,255,0.9)'; ctx.shadowBlur = 24;
    ctx.beginPath(); ctx.arc(cx, top + Re, Re, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    ctx.restore();
  }

  function project(raH, dec, ra0, dec0, s) {
    const ra = raH * 15 * DEG, a0 = ra0 * DEG, d = dec * DEG, d0 = dec0 * DEG;
    const cosc = Math.sin(d0) * Math.sin(d) + Math.cos(d0) * Math.cos(d) * Math.cos(ra - a0);
    const x = Math.cos(d) * Math.sin(ra - a0);
    const y = Math.cos(d0) * Math.sin(d) - Math.sin(d0) * Math.cos(d) * Math.cos(ra - a0);
    return [cx - x * s, cy - y * s, cosc > 0]; // east is left on a sky chart
  }

  function chart(t, a, gateMode) {
    if (a <= 0) return;
    const ra0 = 84 + (gateMode ? t * 0.6 : (t - 8.2) * 0.8), dec0 = gateMode ? 4 : 0;
    const s = Math.min(w, h) * (narrow ? 1.5 : 1.25);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.lineWidth = 1;
    // right ascension / declination grid
    ctx.strokeStyle = `rgba(${ICE},0.13)`;
    for (let dec = -60; dec <= 60; dec += 10) {
      ctx.beginPath();
      for (let ra = ra0 - 90; ra <= ra0 + 90; ra += 3) { const [x, y, v] = project(ra / 15, dec, ra0, dec0, s); if (v) ctx.lineTo(x, y); }
      ctx.stroke();
      const [lx, ly, lv] = project((ra0 + 27) / 15, dec, ra0, dec0, s);
      if (lv && dec) text(`${dec > 0 ? '+' : ''}${dec}°`, lx + 4, ly - 7, 9, `rgba(${ICE},0.4)`);
    }
    for (let ra = Math.floor((ra0 - 90) / 15) * 15; ra <= ra0 + 90; ra += 15) {
      ctx.beginPath();
      for (let dec = -80; dec <= 80; dec += 4) { const [x, y, v] = project(ra / 15, dec, ra0, dec0, s); if (v) ctx.lineTo(x, y); }
      ctx.stroke();
      const [lx, ly, lv] = project(ra / 15, -24, ra0, dec0, s);
      if (lv) text(`${((ra / 15) % 24 + 24) % 24}h`, lx + 4, ly, 9, `rgba(${ICE},0.4)`);
    }
    if (gateMode) { ctx.restore(); return; }
    // Orion draws itself in, then the belt's pointers to Sirius and Aldebaran
    const p = (k) => project(STARS[k][0], STARS[k][1], ra0, dec0, s);
    const draw = seg(t, 8.8, 9.8);
    ctx.strokeStyle = `rgba(${BONE},0.55)`; ctx.lineWidth = 1.2;
    ORION.forEach(([a1, b1], i) => {
      const k = clamp01(draw * ORION.length - i);
      if (k <= 0) return;
      const [x1, y1] = p(a1), [x2, y2] = p(b1);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(lerp(x1, x2, k), lerp(y1, y2, k)); ctx.stroke();
    });
    const pt = seg(t, 9.6, 10.2);
    if (pt > 0) {
      ctx.setLineDash([3, 6]); ctx.strokeStyle = `rgba(${ICE},${0.5 * pt})`;
      POINTERS.forEach(([a1, b1]) => { const [x1, y1] = p(a1), [x2, y2] = p(b1); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(lerp(x1, x2, pt), lerp(y1, y2, pt)); ctx.stroke(); });
      ctx.setLineDash([]);
    }
    const la = seg(t, 9.3, 9.9);
    for (const k in STARS) {
      const [x, y] = p(k), big = k === 'betelgeuse' || k === 'rigel' || k === 'sirius';
      const sa = k === 'sirius' || k === 'aldebaran' ? pt : seg(t, 8.6, 9.1);
      if (sa <= 0) continue;
      ctx.fillStyle = k === 'betelgeuse' || k === 'aldebaran' ? `rgba(255,190,140,${sa})` : `rgba(220,232,255,${sa})`;
      ctx.beginPath(); ctx.arc(x, y, big ? 3.2 : 2.2, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(${BONE},${0.12 * sa})`;
      ctx.beginPath(); ctx.arc(x, y, big ? 11 : 7, 0, TAU); ctx.fill();
      if (STARS[k][2] && la > 0) text(STARS[k][2], x + 12, y - 10, narrow ? 9 : 10, `rgba(${BONE},${0.75 * la * (k === 'sirius' || k === 'aldebaran' ? pt : 1)})`);
    }
    ctx.restore();
  }

  function nameStars(t) {
    if (!name) return;
    const { pts, links } = name;
    const starA = seg(t, 8.0, 9.0) * (1 - seg(t, T.iris - 0.2, T.iris + 0.4) * 0.6);
    const moving = t > T.light;
    ctx.lineWidth = 1;
    for (const q of pts) {
      const a0 = T.light + 0.1 + q.d * 0.35, a1 = a0 + 1.0; // last letter lands as the name hits
      const k = moving ? inOut(seg(t, a0, a1)) : 0;
      q.x = lerp(q.sx, q.tx, k); q.y = lerp(q.sy, q.ty, k); q.k = k;
      const flying = k > 0 && k < 1;
      const a = starA * (moving ? 0.7 + 0.3 * k : 0.25 + 0.6 * q.m);
      if (flying) {
        // a short streak behind each star while it travels
        const kb = inOut(seg(t - 0.035, a0, a1));
        ctx.strokeStyle = `rgba(${ICE},${(a * 0.35).toFixed(3)})`;
        ctx.beginPath(); ctx.moveTo(lerp(q.sx, q.tx, kb), lerp(q.sy, q.ty, kb)); ctx.lineTo(q.x, q.y); ctx.stroke();
      }
      const z = moving ? (flying ? 2.2 : 1.8) : 0.8 + q.m * 1.2;
      ctx.fillStyle = `rgba(${BONE},${a.toFixed(3)})`;
      ctx.fillRect(q.x - z / 2, q.y - z / 2, z, z);
    }
    const la = seg(t, T.hit - 0.45, T.hit + 0.1) * 0.4 * (1 - seg(t, T.iris - 0.2, T.iris + 0.3) * 0.6);
    if (la > 0) {
      ctx.strokeStyle = `rgba(${ICE},${la.toFixed(3)})`; ctx.lineWidth = 0.7;
      ctx.beginPath();
      for (const [i, j] of links) if (pts[i].k === 1 && pts[j].k === 1) { ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y); } // only once both stars have landed
      ctx.stroke();
    }
    // the solid name lands on top of its own constellation
    const sa = seg(t, T.hit, T.hit + 0.45);
    if (sa > 0) {
      ctx.save();
      ctx.font = `800 ${name.fs}px ${DISPLAY}`;
      try { ctx.fontStretch = 'expanded'; } catch { /* normal width */ }
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = `rgba(${SIG},${0.35 * sa})`; ctx.shadowBlur = 30 * (1 - seg(t, T.hit + 0.3, T.hit + 1.2)) + 6;
      ctx.fillStyle = `rgba(${BONE},${sa})`;
      name.lines.forEach((l, i) => ctx.fillText(l, cx, name.top + i * name.lh));
      ctx.restore();
      const ta = seg(t, T.hit + 0.3, T.hit + 0.8);
      text('B U I L D S   S O F T W A R E  ·  W A T C H E S   T H E   S K Y', cx, name.top + (name.lines.length - 0.35) * name.lh + 18, narrow ? 9 : 12, `rgba(${BONE},${0.7 * ta})`, 'center');
    }
  }

  function banners(t) {
    const show = (a, b, big, small) => {
      const k = seg(t, a, a + 0.25) * (1 - seg(t, b - 0.3, b));
      if (k <= 0) return;
      const y = cy + Math.min(w, h) * (narrow ? 0.3 : 0.26);
      text(big, cx, y, narrow ? 34 : 54, `rgba(${BONE},${k})`, 'center', 800, DISPLAY);
      text(small, cx, y + (narrow ? 30 : 44), narrow ? 10 : 12, `rgba(${SIG},${k})`, 'center', 600);
    };
    show(7.95, 8.95, '100 KM', 'KÁRMÁN LINE · SPACE STARTS HERE');
    show(9.05, 10.2, '400 KM', 'LOW EARTH ORBIT');
  }

  function aperture(r) {
    if (r <= 0) return;
    // eight blades: chords tangent to the opening, rotating as it widens
    ctx.save();
    ctx.strokeStyle = `rgba(${BONE},0.5)`; ctx.lineWidth = 1;
    const rot = r * 0.0015;
    for (let i = 0; i < 8; i++) {
      const an = rot + (i / 8) * TAU;
      const px = cx + Math.cos(an) * (r + 1), py = h / 2 + Math.sin(an) * (r + 1);
      const dx = -Math.sin(an), dy = Math.cos(an), L = r * 0.9 + 60;
      ctx.beginPath(); ctx.moveTo(px - dx * L * 0.15, py - dy * L * 0.15); ctx.lineTo(px + dx * L, py + dy * L); ctx.stroke();
    }
    ctx.strokeStyle = `rgba(${SIG},0.7)`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, h / 2, r + 1, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  resize();
  addEventListener('resize', resize);
  // the name needs the real font before it can be sampled
  document.fonts?.load(`800 100px ${DISPLAY}`).then(() => { name = layoutName(); }).catch(() => {});

  return {
    // the idle frame behind the sound gate: a slowly turning star chart
    drawGate(now) {
      ctx.clearRect(0, 0, w, h);
      stars(now, 0.5);
      chart(now, 0.7, true);
    },
    // has3D: the WebGL launch layer is showing chapter two underneath this canvas
    draw(t, irisR = 0, has3D = false) {
      ctx.clearRect(0, 0, w, h);
      const L = seg(t, 2.3, 2.9) * (1 - seg(t, 7.5, 8.1)); // the launch scene is on screen
      if (L > 0 && !has3D) skyFill(t, L);
      const launchStars = has3D ? seg(t, 7.5, 8.1) : lerp(0.2, 1, seg(t, 5.6, 7.4)); // the 3D sky has its own stars
      stars(t, t < T.launch ? 0.3 * (1 - seg(t, 2.2, 2.7)) : t < T.orbit ? launchStars : 1 - seg(t, T.light, T.light + 1) * 0.5);
      radar(t, 1 - seg(t, 2.3, 2.8));
      if (L > 0) launch(t, L, has3D);
      limb(t);
      upperStage(t, has3D);
      chart(t, seg(t, 8.4, 9.2) * (1 - seg(t, T.light, T.light + 0.7)), false);
      banners(t);
      nameStars(t);
      aperture(irisR);
    },
    dispose() { removeEventListener('resize', resize); },
  };
}
