// Live ISS position via our own /api/iss (see api/iss.js).
// Polls every 5 s while the panel is on screen, every 30 s otherwise (keeps the globe marker honest).
const API = '/api/iss';

export function startIss(onPosition) {
  const panel = document.querySelector('.iss');
  if (!panel) return;
  const $ = (s) => panel.querySelector(s);
  const el = { lat: $('.iss-lat'), lon: $('.iss-lon'), alt: $('.iss-alt'), vel: $('.iss-vel'), age: $('.iss-age'), sun: $('.iss-sun') };
  let visible = false, timer = 0, lastOk = 0, fails = 0, busy = false;

  const fmt = (v, pos, neg) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? pos : neg}`;

  async function poll() {
    clearTimeout(timer);
    if (document.hidden || busy) return; // resumes on visibilitychange
    busy = true;
    try {
      const r = await fetch(API, { cache: 'no-store', signal: AbortSignal.timeout(8000) }); // a hung request must not stall polling
      if (!r.ok) throw new Error(r.status);
      const d = await r.json();
      if (!Number.isFinite(d.lat) || !Number.isFinite(d.lon)) throw new Error('bad data');
      el.lat.textContent = fmt(d.lat, 'N', 'S');
      el.lon.textContent = fmt(d.lon, 'E', 'W');
      el.alt.textContent = Number.isFinite(d.alt) ? `${Math.round(d.alt)} km` : '≈ 420 km';
      el.vel.textContent = Number.isFinite(d.vel) ? `${Math.round(d.vel).toLocaleString('en-US')} km/h` : '≈ 27,600 km/h';
      el.sun.textContent = d.sun === 'eclipsed' ? 'Right now it’s in Earth’s shadow, so it’s night on board.' : d.sun === 'daylight' ? 'Right now it’s in sunlight.' : '';
      panel.classList.remove('is-lost');
      lastOk = Date.now(); fails = 0;
      onPosition?.(d.lat, d.lon);
    } catch {
      fails += 1;
      panel.classList.add('is-lost');
      el.age.textContent = 'Signal lost · retrying';
    }
    busy = false;
    const base = visible ? 5000 : 30000;
    timer = setTimeout(poll, Math.min(base * 2 ** Math.max(0, fails - 1), 120000));
  }

  setInterval(() => {
    if (lastOk && !panel.classList.contains('is-lost')) {
      const s = Math.round((Date.now() - lastOk) / 1000);
      el.age.textContent = s < 2 ? 'Updated just now' : `Updated ${s}s ago`;
    }
  }, 1000);

  new IntersectionObserver(([e]) => {
    const was = visible; visible = e.isIntersecting;
    if (visible && !was && Date.now() - lastOk > 5000) poll();
  }).observe(panel);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
  poll();
}
