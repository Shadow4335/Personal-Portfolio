// The opening film, drawn on a 2D canvas as a pure function of time t (seconds).
// intro.js owns the clock, the sound cues and the HTML overlay; this file only paints.
// Three beats: a terminal boots the flight, a cockpit HUD takes off and climbs, and the climb
// keeps going past the Kármán line until the stars pull together into my name.

export const T = { boot: 0, roll: 2.8, rotate: 4.6, space: 7.4, light: 8.8, hit: 10.2, iris: 10.8, end: 12.0 };

export const PROMPT = './takeoff --callsign AV26 --to orbit';
export const TYPE_AT = [0.35, 1.15]; // the prompt types itself in this window
export const BOOT = [
  [1.3, 'compile flight_plan.ts', 'ok'],
  [1.55, 'pre-flight checklist', '12/12'],
  [1.8, 'weather VIDP', 'VFR 260/08'],
  [2.05, 'atc clearance', 'RWY 26'],
];
export const SPOOL = 2.3; // engines spool up; the takeoff roll starts at T.roll
export const CALLOUTS = [[4.15, 'V1'], [T.rotate, 'ROTATE'], [5.05, 'POSITIVE RATE'], [5.5, 'GEAR UP']];

// altitude (km) and ground speed (km/h) through the film. V1 ≈ 130 kt, rotate ≈ 157 kt, orbit ≈ 7.7 km/s
const ALT = [[T.rotate, 0], [5.4, 0.5], [6.0, 3], [6.6, 11], [T.space, 100], [8.3, 408], [T.end, 420]];
const SPEED = [[T.roll, 0], [3.6, 60], [4.15, 240], [T.rotate, 290], [5.4, 420], [6.6, 900], [T.space, 9000], [8.3, 27600]];
const MARKS = [[0, 'RUNWAY 26', 'RWY 26'], [11, 'AIRLINERS', 'JETS'], [100, 'KÁRMÁN LINE', 'KÁRMÁN'], [408, 'ISS', 'ISS']];
function table(rows, x) {
  if (x <= rows[0][0]) return rows[0][1];
  for (let i = 1; i < rows.length; i++) {
    if (x <= rows[i][0]) { const [x0, y0] = rows[i - 1], [x1, y1] = rows[i]; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0); }
  }
  return rows[rows.length - 1][1];
}
export const altKm = (t) => table(ALT, t);
export const speed = (t) => table(SPEED, t);
export const fmtAlt = (km) => (km < 1 ? `${Math.round(km * 1000)} M` : `${km.toFixed(km < 100 ? 1 : 0)} KM`);

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
const S = 3; // runway edge-light spacing, world units

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
  const city = Array.from({ length: lowPower ? 50 : 110 }, () => ({ x: (rand() - 0.5) * 260, z: 70 + rand() * 180, m: rand() }));
  const cloud = Array.from({ length: 14 }, () => ({ an: rand() * TAU, ph: rand(), r: 0.6 + rand() * 0.8 }));
  let w = 0, h = 0, R = 0, cx = 0, cy = 0, f = 1, narrow = false;
  let name = null; // { pts, links, fs, lines, top, lh }

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, lowPower ? 1.5 : 2);
    w = innerWidth; h = innerHeight; narrow = w < 700;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    R = Math.min(w, h) * (narrow ? 0.36 : 0.29);
    cx = w / 2; cy = h / 2 - (narrow ? h * 0.05 : 0);
    f = Math.max(w, h) * 0.75; // lens focal length in px
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
      const best = [];
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

  /* ── beat 1: the terminal ─────────────────────────────── */
  function terminal(t) {
    const a = seg(t, 0, 0.25) * (1 - seg(t, 2.7, 3.0));
    if (a <= 0) return;
    const fs = narrow ? 11 : 14, lh = fs * 1.8, W = Math.min(620, w - 32), H = lh * 8 + 34;
    const z = 1 + inOut(seg(t, 2.55, 3.0)) * 0.5; // the window rushes past as the runway takes over
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(cx, cy); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2);
    ctx.fillStyle = 'rgba(8,10,16,0.92)'; ctx.strokeStyle = `rgba(${BONE},0.22)`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(0, 0, W, H, 10); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 30); ctx.lineTo(W, 30); ctx.stroke();
    ['255,95,87', '254,188,46', '40,200,64'].forEach((c, i) => { ctx.fillStyle = `rgba(${c},0.85)`; ctx.beginPath(); ctx.arc(18 + i * 18, 15, 5, 0, TAU); ctx.fill(); });
    text(narrow ? 'av26 — zsh' : 'av26 — flight-computer — zsh', W / 2, 15, 11, `rgba(${BONE},0.5)`, 'center');

    const x0 = 18, y0 = 30 + lh * 0.9, host = narrow ? '~ %' : 'arnav@faridabad ~ %';
    const n = Math.floor(PROMPT.length * seg(t, TYPE_AT[0], TYPE_AT[1]));
    ctx.font = `500 ${fs}px ${MONO}`;
    const hw = ctx.measureText(host + ' ').width;
    text(host, x0, y0, fs, `rgb(${SIG})`, 'left', 600);
    text(PROMPT.slice(0, n), x0 + hw, y0, fs, `rgb(${BONE})`);
    if (t < TYPE_AT[1] + 0.1 && Math.sin(t * 18) > -0.2) {
      ctx.fillStyle = `rgb(${BONE})`; ctx.fillRect(x0 + hw + ctx.measureText(PROMPT.slice(0, n)).width + 2, y0 - fs * 0.55, fs * 0.55, fs * 1.1);
    }
    const cols = narrow ? 30 : 34;
    BOOT.forEach(([at, label, val], i) => {
      if (t < at) return;
      const y = y0 + lh * (i + 1);
      text('✓', x0, y, fs, `rgb(${ICE})`, 'left', 700);
      const line = `  ${label} `.padEnd(cols - val.length, '.') + ` ${val}`;
      text(line, x0 + fs * 0.6, y, fs, `rgba(${BONE},0.85)`);
    });
    if (t >= SPOOL) {
      const y = y0 + lh * (BOOT.length + 1), k = seg(t, SPOOL, T.roll - 0.1), cells = narrow ? 10 : 16, on = Math.round(k * cells);
      text('▸', x0, y, fs, `rgb(${SIG})`, 'left', 700);
      text(`  engines  [${'■'.repeat(on)}${'·'.repeat(cells - on)}] ${String(Math.round(k * 100)).padStart(3)}%`, x0 + fs * 0.6, y, fs, `rgba(${BONE},0.85)`);
    }
    if (t >= T.roll - 0.25) text('cleared for takeoff.', x0, y0 + lh * (BOOT.length + 2), fs, `rgb(${SIG})`, 'left', 700);
    ctx.restore();
  }

  /* ── beat 2: the cockpit HUD ──────────────────────────── */
  const pitch = (t) => 13 * inOut(seg(t, T.rotate, T.rotate + 0.7)) + 10 * inOut(seg(t, 5.8, 6.8)); // degrees nose-up
  const camH = (t) => 1 + 12 * Math.max(0, t - T.rotate) ** 2; // eye height above the runway
  const dist = (t) => 6 * Math.max(0, t - T.roll) ** 2; // distance rolled down the runway

  function world(t, a, hy) {
    if (a <= 0) return;
    const H = camH(t), d = dist(t), up = seg(t, 6.0, 7.4);
    ctx.save();
    ctx.globalAlpha = a;
    // dawn sky that drains to black as the air runs out
    const g = ctx.createLinearGradient(0, hy - h, 0, hy);
    g.addColorStop(0, mix('#071022', '#030409', up));
    g.addColorStop(0.75, mix('#14284a', '#030409', up));
    g.addColorStop(1, mix('#8a5a44', '#06101e', up));
    ctx.fillStyle = g; ctx.fillRect(0, Math.min(0, hy - h), w, Math.max(h, hy) + 2);
    ctx.fillStyle = '#05060a'; ctx.fillRect(0, hy, w, h - hy + 2);
    // the city on the horizon
    for (const c of city) {
      const y = hy + (f * H) / c.z;
      if (y > h) continue;
      ctx.fillStyle = `rgba(255,${190 + c.m * 50},${120 + c.m * 60},${(0.35 + 0.5 * c.m).toFixed(2)})`;
      ctx.fillRect(cx + (f * c.x) / c.z, y, 1.6, 1.6);
    }
    // runway: asphalt, centreline, and edge lights that are ones and zeros
    const P = (X, Z) => [cx + (f * X) / Z, hy + (f * H) / Z];
    const zn = 0.5, zf = Math.max(zn + 1, 160 - d);
    ctx.fillStyle = '#151820';
    ctx.beginPath(); ctx.moveTo(...P(-2.2, zn)); ctx.lineTo(...P(2.2, zn)); ctx.lineTo(...P(2.2, zf)); ctx.lineTo(...P(-2.2, zf)); ctx.fill();
    ctx.fillStyle = `rgba(${BONE},0.45)`;
    for (let i = Math.ceil(d / S); i * S - d < zf; i++) {
      const z1 = Math.max(zn, i * S - d + 0.6), z2 = i * S - d + 1.8;
      if (z2 <= zn) continue;
      ctx.beginPath(); ctx.moveTo(...P(-0.07, z1)); ctx.lineTo(...P(0.07, z1)); ctx.lineTo(...P(0.07, z2)); ctx.lineTo(...P(-0.07, z2)); ctx.fill();
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = Math.ceil((d + 1.5) / S); i * S - d < zf; i++) {
      const z = i * S - d, size = Math.min(44, (f * 0.6) / z);
      if (size < 3) break;
      const last = i * S > 130; // the last stretch of runway lights goes amber, as on a real runway
      ctx.font = `700 ${size.toFixed(1)}px ${MONO}`;
      ctx.fillStyle = last ? `rgba(255,190,90,${(1 - z / 170).toFixed(2)})` : `rgba(${BONE},${(1 - z / 170).toFixed(2)})`;
      for (const X of [-2.6, 2.6]) { const [x, y] = P(X, z); ctx.fillText((i + (X > 0)) % 2 ? '1' : '0', x, y); }
    }
    ctx.restore();
  }

  // punching up through a cloud layer
  function clouds(t) {
    const band = seg(t, 5.5, 5.75) * (1 - seg(t, 6.15, 6.45));
    if (band <= 0) return;
    ctx.save();
    for (const c of cloud) {
      const ph = (t * 1.4 + c.ph) % 1, rr = ph * ph * Math.max(w, h) * 0.9, s = (60 + ph * 520) * c.r;
      ctx.globalAlpha = band * 0.5 * Math.sin(ph * Math.PI);
      ctx.drawImage(puff, cx + Math.cos(c.an) * rr - s / 2, cy + Math.sin(c.an) * rr * 0.7 - s / 2, s, s * 0.6);
    }
    ctx.globalAlpha = band * 0.18; ctx.fillStyle = `rgb(${BONE})`; ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  const puff = document.createElement('canvas');
  puff.width = puff.height = 64;
  { const p = puff.getContext('2d'), g = p.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(236,230,218,1)'); g.addColorStop(0.5, 'rgba(236,230,218,0.42)'); g.addColorStop(1, 'rgba(236,230,218,0)');
    p.fillStyle = g; p.fillRect(0, 0, 64, 64); }

  function hud(t, a, hy) {
    if (a <= 0) return;
    const ppd = f * DEG, L = Math.min(w * 0.2, 170), gap = Math.min(w * 0.06, 48), col = (k) => `rgba(${ICE},${k})`;
    const shake = (1 - seg(t, T.rotate, T.rotate + 0.3)) * seg(t, T.roll, T.roll + 0.4) * 1.2;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(Math.sin(t * 87) * shake, Math.sin(t * 61) * shake);
    ctx.lineWidth = 1.3; ctx.strokeStyle = col(0.85);
    // pitch ladder, clipped to the middle of the glass
    ctx.save();
    ctx.beginPath(); ctx.rect(cx - L - 40, cy - R * 1.05, (L + 40) * 2, R * 2.1); ctx.clip();
    for (let p = -20; p <= 40; p += 5) {
      const y = hy - p * ppd;
      if (p === 0) { ctx.beginPath(); ctx.moveTo(cx - L - 40, y); ctx.lineTo(cx - gap, y); ctx.moveTo(cx + gap, y); ctx.lineTo(cx + L + 40, y); ctx.stroke(); continue; }
      const tick = p > 0 ? 8 : -8;
      ctx.setLineDash(p < 0 ? [6, 5] : []);
      ctx.beginPath();
      ctx.moveTo(cx - L, y + tick); ctx.lineTo(cx - L, y); ctx.lineTo(cx - gap, y);
      ctx.moveTo(cx + gap, y); ctx.lineTo(cx + L, y); ctx.lineTo(cx + L, y + tick);
      ctx.stroke();
      text(String(Math.abs(p)), cx - L - 8, y, 10, col(0.8), 'right');
      text(String(Math.abs(p)), cx + L + 8, y, 10, col(0.8));
    }
    ctx.setLineDash([]);
    ctx.restore();
    // aircraft reference and flight path marker
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx - 30, cy); ctx.lineTo(cx - 12, cy); ctx.lineTo(cx - 6, cy + 7); ctx.lineTo(cx, cy); ctx.lineTo(cx + 6, cy + 7); ctx.lineTo(cx + 12, cy); ctx.lineTo(cx + 30, cy); ctx.stroke();
    const fy = cy + 4 * ppd * seg(t, T.rotate, T.rotate + 0.8);
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, fy, 6, 0, TAU); ctx.moveTo(cx - 16, fy); ctx.lineTo(cx - 6, fy); ctx.moveTo(cx + 6, fy); ctx.lineTo(cx + 16, fy); ctx.moveTo(cx, fy - 6); ctx.lineTo(cx, fy - 13); ctx.stroke();
    // heading strip: runway 26
    const hy0 = cy - R * 1.15;
    ctx.lineWidth = 1;
    for (let d = -20; d <= 20; d += 5) {
      const x = cx + d * 6;
      ctx.beginPath(); ctx.moveTo(x, hy0); ctx.lineTo(x, hy0 + (d % 10 ? 5 : 9)); ctx.stroke();
      if (d % 10 === 0 && d) text(String(26 + d / 10), x, hy0 - 9, 10, col(0.7), 'center');
    }
    ctx.strokeRect(cx - 18, hy0 - 19, 36, 18); text('260', cx, hy0 - 10, 11, col(1), 'center', 700);
    // speed box
    const sx = narrow ? 14 : cx - L - 96;
    ctx.strokeRect(sx, cy - 15, 70, 30);
    text(Math.round(speed(t)).toLocaleString('en-US'), sx + 62, cy, 13, col(1), 'right', 700);
    text('KM/H', sx, cy - 26, 10, col(0.6));
    text(`ALT ${fmtAlt(altKm(t))}`, sx, cy + 28, 10, col(0.85));
    ctx.restore();
  }

  // altitude ladder on a log scale, marked with what lives at each height
  function ladder(t, a) {
    if (a <= 0) return;
    const x = narrow ? w - 76 : Math.min(w - 190, cx + R * 2), y0 = cy + R, y1 = cy - R;
    const Y = (km) => lerp(y0, y1, Math.log10(1 + km) / Math.log10(1 + 420));
    ctx.save(); ctx.globalAlpha = a;
    ctx.strokeStyle = `rgba(${BONE},0.35)`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
    const km = altKm(t), y = Y(km);
    ctx.strokeStyle = `rgba(${SIG},0.9)`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y); ctx.stroke();
    for (const [mk, label, short] of MARKS) {
      const my = Y(mk), passed = km >= mk;
      ctx.fillStyle = passed ? `rgb(${SIG})` : `rgba(${BONE},0.5)`; ctx.fillRect(x - 3, my - 1, 6, 2);
      text(narrow ? `${short} ${mk || ''}` : `${label} · ${mk ? mk + ' KM' : '0'}`, x + 10, my, narrow ? 9 : 10, `rgba(${BONE},${passed ? 0.9 : 0.45})`);
    }
    ctx.fillStyle = `rgb(${SIG})`;
    ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x - 12, y - 5); ctx.lineTo(x - 12, y + 5); ctx.fill();
    ctx.restore();
  }

  function callouts(t) {
    CALLOUTS.forEach(([at, msg], i) => {
      const end = Math.min(at + 0.7, (CALLOUTS[i + 1]?.[0] ?? Infinity) - 0.02);
      const k = seg(t, at, at + 0.06) * (1 - seg(t, end - 0.12, end));
      if (k <= 0) return;
      const fs = narrow ? 20 : 28, y = cy + R * 0.62;
      ctx.font = `700 ${fs}px ${MONO}`;
      const bw = ctx.measureText(msg).width + 28;
      ctx.fillStyle = `rgba(3,4,9,${0.7 * k})`; ctx.fillRect(cx - bw / 2, y - fs * 0.8, bw, fs * 1.6);
      text(msg, cx, y, fs, `rgba(${ICE},${k})`, 'center', 700);
    });
  }

  /* ── beat 3: space ────────────────────────────────────── */
  // Earth's curved edge rises into view once we're above the air
  function limb(t) {
    const a = seg(t, T.space - 0.6, T.space + 0.4) * (1 - seg(t, T.light, T.light + 0.8));
    if (a <= 0) return;
    const Re = Math.max(w, h) * 1.4, top = lerp(h + 30, h * (narrow ? 0.88 : 0.84), out(seg(t, T.space - 0.6, T.space + 1)));
    ctx.save(); ctx.globalAlpha = a;
    const g = ctx.createLinearGradient(0, top, 0, h);
    g.addColorStop(0, '#0d1b30'); g.addColorStop(1, '#030409');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, top + Re, Re, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(120,175,255,0.8)'; ctx.lineWidth = 3; ctx.shadowColor = 'rgba(90,150,255,0.9)'; ctx.shadowBlur = 24;
    ctx.beginPath(); ctx.arc(cx, top + Re, Re, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    ctx.restore();
  }

  function banners(t) {
    const show = (a, b, big, small) => {
      const k = seg(t, a, a + 0.25) * (1 - seg(t, b - 0.3, b));
      if (k <= 0) return;
      const y = cy + Math.min(w, h) * (narrow ? 0.3 : 0.26);
      text(big, cx, y, narrow ? 34 : 54, `rgba(${BONE},${k})`, 'center', 800, DISPLAY);
      text(small, cx, y + (narrow ? 30 : 44), narrow ? 10 : 12, `rgba(${SIG},${k})`, 'center', 600);
    };
    show(T.space - 0.05, T.space + 0.85, '100 KM', 'KÁRMÁN LINE · SPACE STARTS HERE');
    show(8.0, 8.95, '408 KM', 'WHERE THE ISS LIVES');
  }

  // the idle sky behind the sound gate: a slowly turning RA/Dec grid
  function project(raH, dec, ra0, dec0, s) {
    const ra = raH * 15 * DEG, a0 = ra0 * DEG, d = dec * DEG, d0 = dec0 * DEG;
    const cosc = Math.sin(d0) * Math.sin(d) + Math.cos(d0) * Math.cos(d) * Math.cos(ra - a0);
    const x = Math.cos(d) * Math.sin(ra - a0);
    const y = Math.cos(d0) * Math.sin(d) - Math.sin(d0) * Math.cos(d) * Math.cos(ra - a0);
    return [cx - x * s, cy - y * s, cosc > 0]; // east is left on a sky chart
  }
  function chart(t, a) {
    const ra0 = 84 + t * 0.6, dec0 = 4, s = Math.min(w, h) * (narrow ? 1.5 : 1.25);
    ctx.save();
    ctx.globalAlpha = a; ctx.lineWidth = 1; ctx.strokeStyle = `rgba(${ICE},0.13)`;
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
    ctx.restore();
  }

  function nameStars(t) {
    if (!name) return;
    const { pts, links } = name;
    const starA = seg(t, 6.8, 7.8) * (1 - seg(t, T.iris - 0.2, T.iris + 0.4) * 0.6);
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
    drawGate(now) {
      ctx.clearRect(0, 0, w, h);
      stars(now, 0.5);
      chart(now, 0.7);
    },
    draw(t, irisR = 0) {
      ctx.clearRect(0, 0, w, h);
      const hy = cy + pitch(t) * f * DEG; // the horizon drops as the nose comes up
      const G = seg(t, 2.55, 3.0) * (1 - seg(t, 6.9, 7.6)); // ground and sky on screen
      stars(t, t < T.roll ? 0.3 * (1 - seg(t, 2.5, 2.9)) : t < T.light ? seg(t, 6.4, 7.6) : 1 - seg(t, T.light, T.light + 1) * 0.5);
      world(t, G, hy);
      clouds(t);
      limb(t);
      hud(t, seg(t, 2.7, 3.1) * (1 - seg(t, 7.5, 8.2)), hy);
      ladder(t, seg(t, 2.8, 3.2) * (1 - seg(t, 8.6, 9.0)));
      callouts(t);
      terminal(t);
      banners(t);
      nameStars(t);
      aperture(irisR);
    },
    dispose() { removeEventListener('resize', resize); },
  };
}
