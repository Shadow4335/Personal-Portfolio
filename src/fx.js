// The living layer: a custom cursor that leaves a short comet trail, and the odd shooting star.
// One canvas over the page; its loop sleeps whenever nothing is moving.
export function initFx({ reduced, fine }) {
  const canvas = document.querySelector('.fx');
  const cursor = document.querySelector('.cursor');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w = 0, h = 0, raf = 0, last = 0;
  const parts = [], meteors = [];
  const COLORS = ['236,230,218', '236,230,218', '169,203,236', '255,90,31'];

  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = innerWidth; h = innerHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  addEventListener('resize', resize);

  // cursor: the dot sits exactly on the pointer, the ring eases after it
  const dot = cursor?.querySelector('.c-dot'), ring = cursor?.querySelector('.c-ring'), label = cursor?.querySelector('.c-label');
  const pos = { x: -100, y: -100 }, rpos = { x: -100, y: -100 };
  let px = 0, py = 0, hot = null;

  const kick = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); } };

  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    ctx.clearRect(0, 0, w, h);
    // comet trail
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt / p.max;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96;
      ctx.fillStyle = `rgba(${p.c},${(p.life * 0.85).toFixed(3)})`;
      const z = p.z * (0.5 + p.life * 0.5);
      ctx.fillRect(p.x - z / 2, p.y - z / 2, z, z);
    }
    // shooting stars
    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i];
      m.t += dt;
      if (m.t > m.life) { meteors.splice(i, 1); continue; }
      const k = m.t / m.life, a = Math.sin(Math.PI * k); // fade in, then out
      const x = m.x + m.vx * m.t, y = m.y + m.vy * m.t, sp = Math.hypot(m.vx, m.vy);
      const tx = x - (m.vx / sp) * m.len, ty = y - (m.vy / sp) * m.len;
      const g = ctx.createLinearGradient(x, y, tx, ty);
      g.addColorStop(0, `rgba(255,250,240,${0.9 * a})`); g.addColorStop(1, 'rgba(169,203,236,0)');
      ctx.strokeStyle = g; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.fillStyle = `rgba(255,255,255,${0.9 * a})`;
      ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill();
    }
    // ring follows the pointer with a little lag
    let moving = false;
    if (cursor) {
      rpos.x += (pos.x - rpos.x) * Math.min(1, dt * 14);
      rpos.y += (pos.y - rpos.y) * Math.min(1, dt * 14);
      ring.style.transform = `translate3d(${rpos.x.toFixed(1)}px, ${rpos.y.toFixed(1)}px, 0)`;
      moving = Math.abs(pos.x - rpos.x) + Math.abs(pos.y - rpos.y) > 0.3;
    }
    raf = parts.length || meteors.length || moving ? requestAnimationFrame(loop) : 0;
  }

  if (fine && cursor && !reduced) {
    document.documentElement.classList.add('has-cursor');
    addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      pos.x = e.clientX; pos.y = e.clientY;
      dot.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
      cursor.classList.add('is-on');
      const d = Math.hypot(pos.x - px, pos.y - py);
      if (d > 5 && parts.length < 90) {
        px = pos.x; py = pos.y;
        const n = d > 30 ? 2 : 1;
        for (let i = 0; i < n; i++) {
          parts.push({ x: pos.x, y: pos.y, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30 + 12, life: 1, max: 0.5 + Math.random() * 0.5, z: 1 + Math.random() * 1.8, c: COLORS[(Math.random() * COLORS.length) | 0] });
        }
      }
      kick();
    }, { passive: true });
    document.addEventListener('pointerover', (e) => {
      const el = e.target.closest('a, button, [data-cursor], .chart-stars .hit, .cluster');
      if (el === hot) return;
      hot = el;
      cursor.classList.toggle('is-hot', !!el);
      const text = el ? el.dataset.cursor ?? (el.target === '_blank' ? 'Open ↗' : '') : '';
      label.textContent = text;
      cursor.classList.toggle('has-label', !!text);
    });
    addEventListener('pointerdown', () => cursor.classList.add('is-down'));
    addEventListener('pointerup', () => cursor.classList.remove('is-down'));
    document.documentElement.addEventListener('mouseleave', () => cursor.classList.remove('is-on'));
  }

  // a shooting star every few seconds, never while the tab is hidden
  if (!reduced) {
    const spawn = () => {
      if (!document.hidden) {
        const dir = Math.random() < 0.5 ? -1 : 1, ang = (22 + Math.random() * 16) * (Math.PI / 180), sp = 900 + Math.random() * 600;
        meteors.push({ x: w * (0.15 + Math.random() * 0.7), y: h * Math.random() * 0.45, vx: Math.cos(ang) * sp * dir, vy: Math.sin(ang) * sp, len: 140 + Math.random() * 120, life: 0.6 + Math.random() * 0.4, t: 0 });
        kick();
      }
      setTimeout(spawn, 4500 + Math.random() * 7000);
    };
    setTimeout(spawn, 3000);
  }
}
