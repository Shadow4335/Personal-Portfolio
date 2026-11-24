// The opening film, drawn on a 2D canvas as a pure function of time t (seconds).
// intro.js owns the clock, the sound cues and the HTML overlay; this file only paints.

export const T = { depart: 0, climb: 3.2, orbit: 6.4, light: 9.2, hit: 10.6, iris: 11.2, end: 12.4 };

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

const CALLOUTS = [[3.6, 'V1'], [3.95, 'ROTATE'], [4.7, 'POSITIVE RATE'], [5.4, 'GEAR UP']];
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
    const sc = 1 + seg(t, 2.8, 3.4) * 0.08;
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
    text('TWR  RWY 28', -R * 0.98, R * 1.0, narrow ? 9 : 10, `rgba(${BONE},0.45)`);
    ctx.restore();
  }

  function speedAt(t) { return t < 3.2 ? 0 : t < 3.95 ? 150 * seg(t, 3.2, 3.95) ** 1.3 : lerp(150, 230, out(seg(t, 3.95, 6.4))); }
  function altFtAt(t) { return 10000 * seg(t, 3.95, 6.4) ** 1.6; }

  function tape(x, w2, value, step, every, fmt, readout) {
    const top = cy - R, H = R * 2, px = H / 6;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, top, w2, H); ctx.clip();
    ctx.fillStyle = 'rgba(12,14,22,0.85)'; ctx.fillRect(x, top, w2, H);
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
    // current value box
    ctx.fillStyle = '#030409'; ctx.fillRect(x - 4, cy - 14, w2 + 8, 28);
    ctx.strokeStyle = `rgba(${SIG},0.9)`; ctx.strokeRect(x - 4, cy - 14, w2 + 8, 28);
    text(readout, x + w2 / 2, cy, narrow ? 11 : 13, `rgb(${BONE})`, 'center', 700);
  }

  function pfd(t, a) {
    if (a <= 0) return;
    const pitch = 14 * out(seg(t, 3.95, 4.9)) - 2 * seg(t, 5.2, 6.2);
    const roll = Math.sin(t * 1.4) * 3 * seg(t, 4.3, 4.9);
    const grow = inOut(seg(t, 6.4, 7.3));
    const r = lerp(R, Math.hypot(w, h) / 2 + 20, grow);
    const dark = seg(t, 6.2, 7.2);
    const ppd = R / 22;
    ctx.save();
    ctx.globalAlpha = a;
    // attitude indicator: sky over ground, rotated by roll, shifted by pitch
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.clip();
    ctx.translate(cx, cy); ctx.rotate(-roll * DEG);
    const hy = pitch * ppd;
    const g1 = ctx.createLinearGradient(0, hy - r * 1.6, 0, hy);
    g1.addColorStop(0, mix('#0c2350', '#030409', dark)); g1.addColorStop(1, mix('#5b8fcc', '#030409', dark));
    ctx.fillStyle = g1; ctx.fillRect(-r * 2, hy - r * 3, r * 4, r * 3);
    const Re = lerp(r * 60, r * 1.9, dark ** 0.7), ey = hy + Re;
    const g2 = ctx.createLinearGradient(0, hy, 0, hy + r);
    g2.addColorStop(0, mix('#5a3b22', '#0b1626', dark)); g2.addColorStop(1, mix('#24170d', '#030409', dark));
    ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(0, ey, Re, 0, TAU); ctx.fill();
    if (dark > 0) {
      ctx.save();
      ctx.strokeStyle = `rgba(120,175,255,${(0.75 * dark).toFixed(3)})`; ctx.lineWidth = 2 + 3 * dark;
      ctx.shadowColor = 'rgba(90,150,255,0.9)'; ctx.shadowBlur = 26 * dark;
      ctx.beginPath(); ctx.arc(0, ey, Re, Math.PI * 1.02, Math.PI * 1.98); ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = a * (1 - dark);
    ctx.strokeStyle = `rgb(${BONE})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, ey, Re, Math.PI * 1.02, Math.PI * 1.98); ctx.stroke();
    // pitch ladder
    ctx.lineWidth = 1.2;
    for (let d = -20; d <= 25; d += 5) {
      if (!d) continue;
      const y = hy - d * ppd, half = (d % 10 ? 0.12 : 0.24) * R;
      ctx.strokeStyle = `rgba(${BONE},0.85)`;
      ctx.beginPath(); ctx.moveTo(-half, y); ctx.lineTo(half, y); ctx.stroke();
      if (!(d % 10)) { text(String(Math.abs(d)), -half - 16, y, narrow ? 9 : 10, `rgba(${BONE},0.85)`, 'center'); text(String(Math.abs(d)), half + 16, y, narrow ? 9 : 10, `rgba(${BONE},0.85)`, 'center'); }
    }
    ctx.restore();
    const fixed = a * (1 - seg(t, 6.3, 6.8));
    if (fixed <= 0) return;
    ctx.save();
    ctx.globalAlpha = fixed;
    // bezel, roll scale and the orange aircraft symbol
    ctx.strokeStyle = `rgba(${BONE},0.35)`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
    for (const d of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
      const an = (d - 90) * DEG, l = d % 30 ? 0.05 : 0.09;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(an) * R, cy + Math.sin(an) * R); ctx.lineTo(cx + Math.cos(an) * R * (1 + l), cy + Math.sin(an) * R * (1 + l)); ctx.stroke();
    }
    const pa = (-roll - 90) * DEG;
    ctx.fillStyle = `rgb(${BONE})`;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(pa) * R * 0.97, cy + Math.sin(pa) * R * 0.97);
    ctx.lineTo(cx + Math.cos(pa - 0.05) * R * 0.88, cy + Math.sin(pa - 0.05) * R * 0.88);
    ctx.lineTo(cx + Math.cos(pa + 0.05) * R * 0.88, cy + Math.sin(pa + 0.05) * R * 0.88); ctx.fill();
    ctx.strokeStyle = `rgb(${SIG})`; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx - R * 0.42, cy); ctx.lineTo(cx - R * 0.16, cy); ctx.lineTo(cx - R * 0.1, cy + R * 0.06);
    ctx.moveTo(cx + R * 0.42, cy); ctx.lineTo(cx + R * 0.16, cy); ctx.lineTo(cx + R * 0.1, cy + R * 0.06); ctx.stroke();
    ctx.fillStyle = `rgb(${SIG})`; ctx.fillRect(cx - 3, cy - 3, 6, 6);
    ctx.lineCap = 'butt';
    // speed, altitude and heading tapes
    const tw = narrow ? 46 : 64, gap = narrow ? 10 : 22;
    const spd = speedAt(t), alt = altFtAt(t);
    if (cx - R - gap - tw > 2) {
      tape(cx - R - gap - tw, tw, spd, 10, 20, (v) => String(v), String(Math.round(spd)));
      tape(cx + R + gap, tw, alt, 500, 1000, (v) => String(v), String(Math.round(alt / 10) * 10));
      text('KT', cx - R - gap - tw / 2, cy - R - 14, 10, `rgba(${BONE},0.5)`, 'center');
      text('FT', cx + R + gap + tw / 2, cy - R - 14, 10, `rgba(${BONE},0.5)`, 'center');
    } else {
      text(`${Math.round(spd)} KT`, cx - R * 0.6, cy + R + 22, 12, `rgb(${BONE})`, 'center', 700);
      text(`${Math.round(alt / 10) * 10} FT`, cx + R * 0.6, cy + R + 22, 12, `rgb(${BONE})`, 'center', 700);
    }
    const hdg = 280 + Math.sin(t * 0.7) * 1.5, ht = cy - R - (narrow ? 44 : 48), span = R * 0.9;
    for (let d = Math.ceil((hdg - 20) / 5) * 5; d <= hdg + 20; d += 5) {
      const x = cx + ((d - hdg) / 20) * span;
      ctx.strokeStyle = `rgba(${BONE},0.5)`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, ht + 8); ctx.lineTo(x, ht + (d % 10 ? 13 : 17)); ctx.stroke();
      if (!(d % 10)) text(String(((d % 360) + 360) % 360 / 10).padStart(2, '0'), x, ht - 2, narrow ? 9 : 10, `rgba(${BONE},0.75)`, 'center');
    }
    ctx.fillStyle = `rgb(${SIG})`;
    ctx.beginPath(); ctx.moveTo(cx, ht + 20); ctx.lineTo(cx - 5, ht + 27); ctx.lineTo(cx + 5, ht + 27); ctx.fill();
    ctx.restore();
    // the copilot's callouts
    CALLOUTS.forEach(([at, msg], i) => {
      const end = Math.min(at + 0.7, (CALLOUTS[i + 1]?.[0] ?? Infinity) - 0.02); // never overlap the next one
      const ca = seg(t, at, at + 0.08) * (1 - seg(t, end - 0.15, end));
      if (ca > 0) text(msg, cx, cy + R + (narrow ? 58 : 64), narrow ? 22 : 30, `rgba(${BONE},${ca})`, 'center', 700);
    });
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
    const ra0 = 84 + (gateMode ? t * 0.6 : (t - 7) * 0.8), dec0 = gateMode ? 4 : 0;
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
    const draw = seg(t, 7.6, 8.6);
    ctx.strokeStyle = `rgba(${BONE},0.55)`; ctx.lineWidth = 1.2;
    ORION.forEach(([a1, b1], i) => {
      const k = clamp01(draw * ORION.length - i);
      if (k <= 0) return;
      const [x1, y1] = p(a1), [x2, y2] = p(b1);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(lerp(x1, x2, k), lerp(y1, y2, k)); ctx.stroke();
    });
    const pt = seg(t, 8.4, 9.0);
    if (pt > 0) {
      ctx.setLineDash([3, 6]); ctx.strokeStyle = `rgba(${ICE},${0.5 * pt})`;
      POINTERS.forEach(([a1, b1]) => { const [x1, y1] = p(a1), [x2, y2] = p(b1); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(lerp(x1, x2, pt), lerp(y1, y2, pt)); ctx.stroke(); });
      ctx.setLineDash([]);
    }
    const la = seg(t, 8.1, 8.7);
    for (const k in STARS) {
      const [x, y] = p(k), big = k === 'betelgeuse' || k === 'rigel' || k === 'sirius';
      const sa = k === 'sirius' || k === 'aldebaran' ? pt : seg(t, 7.4, 7.9);
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
    const starA = seg(t, 7.0, 8.0) * (1 - seg(t, 11.0, 11.6) * 0.6);
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
    const la = seg(t, 10.15, 10.7) * 0.4 * (1 - seg(t, 11.0, 11.5) * 0.6);
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
    show(6.75, 7.75, '100 KM', 'KÁRMÁN LINE · SPACE STARTS HERE');
    show(7.85, 9.0, '400 KM', 'LOW EARTH ORBIT');
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
    draw(t, irisR = 0) {
      ctx.clearRect(0, 0, w, h);
      stars(t, t < T.climb ? 0.3 * (1 - seg(t, 2.8, 3.3)) : seg(t, 7.0, 8.0) * (1 - seg(t, T.light, T.light + 1) * 0.5));
      radar(t, 1 - seg(t, 2.9, 3.4));
      pfd(t, seg(t, 3.0, 3.5) * (1 - seg(t, 7.0, 7.6)));
      chart(t, seg(t, 7.2, 8.0) * (1 - seg(t, T.light, T.light + 0.7)), false);
      banners(t);
      nameStars(t);
      aperture(irisR);
    },
    dispose() { removeEventListener('resize', resize); },
  };
}
