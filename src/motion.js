import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

const GLYPHS = '01#/<>[]=+*ABCDEFKXYZ';

// Scroll-driven and hover motion that makes the page feel alive. Everything here is decoration:
// with reduced motion it's skipped, and the content works without it.
export function initMotion({ lenis, reduced, fine }) {
  const $$ = (s) => [...document.querySelectorAll(s)];
  if (reduced) return;

  // Hero: scrolling away splits the name apart like stages separating
  gsap.timeline({ scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 0.6 } })
    .fromTo('.hn-line:first-child', { xPercent: 0, yPercent: 0, opacity: 1 }, { xPercent: -16, yPercent: -45, opacity: 0, ease: 'none', immediateRender: false }, 0)
    .fromTo('.hn-line:last-child', { xPercent: 0, yPercent: 0, opacity: 1 }, { xPercent: 16, yPercent: -15, opacity: 0, ease: 'none', immediateRender: false }, 0)
    .fromTo('.hero .eyebrow, .hero-lede, .hero-meta, .hero-cta', { y: 0, opacity: 1 }, { y: -90, opacity: 0, stagger: 0.05, ease: 'none', immediateRender: false }, 0)
    .fromTo('.scroll-cue', { opacity: 1 }, { opacity: 0, ease: 'none', duration: 0.3, immediateRender: false }, 0);

  // About: the words light up as you read down
  document.fonts.ready.then(() => {
    $$('.prose p').forEach((p) => {
      const split = SplitText.create(p, { type: 'words' });
      gsap.fromTo(split.words, { opacity: 0.16 }, { opacity: 1, stagger: 0.05, ease: 'none', scrollTrigger: { trigger: p, start: 'top 82%', end: 'bottom 50%', scrub: true } });
    });
    ScrollTrigger.refresh();
  });

  // Telemetry labels decode themselves when they scroll in
  $$('.sec-head .eyebrow').forEach((el) => {
    const node = el.lastChild, final = node.textContent;
    ScrollTrigger.create({
      trigger: el, start: 'top 90%', once: true,
      onEnter: () => {
        let f = 0;
        const total = 24, id = setInterval(() => {
          f += 1;
          const k = Math.floor((final.length * f) / total);
          node.textContent = final.slice(0, k) + final.slice(k).replace(/[^\s—·,.]/g, () => GLYPHS[(Math.random() * GLYPHS.length) | 0]);
          if (f >= total) { clearInterval(id); node.textContent = final; }
        }, 32);
      },
    });
  });

  // The ticker band: drifts on its own, speeds up and leans with your scroll
  const rows = $$('.band-row');
  if (rows.length) {
    const state = rows.map((r, i) => ({ el: r, x: 0, dir: i % 2 ? 1 : -1 }));
    let skew = 0;
    gsap.ticker.add((_, dt) => {
      const v = lenis.velocity || 0, flip = lenis.direction < 0 ? -1 : 1;
      skew += (Math.max(-8, Math.min(8, v * 0.4)) - skew) * 0.1;
      for (const s of state) {
        const half = s.el.scrollWidth / 2;
        if (!half) continue;
        s.x = (s.x + s.dir * flip * (0.04 + Math.abs(v) * 0.02) * dt) % half;
        if (s.x > 0) s.x -= half;
        s.el.style.transform = `translate3d(${s.x.toFixed(1)}px,0,0) skewX(${(-skew).toFixed(2)}deg)`;
      }
    });
  }

  if (!fine) return;

  // Cards lean toward the cursor, with a soft glare where it points
  $$('[data-tilt], .flights li > *').forEach((el) => {
    gsap.set(el, { transformPerspective: 900 });
    const rx = gsap.quickTo(el, 'rotationX', { duration: 0.5, ease: 'power3' });
    const ry = gsap.quickTo(el, 'rotationY', { duration: 0.5, ease: 'power3' });
    el.addEventListener('pointermove', (e) => {
      const b = el.getBoundingClientRect(), x = (e.clientX - b.left) / b.width, y = (e.clientY - b.top) / b.height;
      rx((0.5 - y) * 9); ry((x - 0.5) * 11);
      el.style.setProperty('--gx', `${(x * 100).toFixed(1)}%`);
      el.style.setProperty('--gy', `${(y * 100).toFixed(1)}%`);
    });
    el.addEventListener('pointerleave', () => { rx(0); ry(0); });
  });

  // Buttons are a little magnetic
  $$('.btn').forEach((b) => {
    const x = gsap.quickTo(b, 'x', { duration: 0.4, ease: 'power3' }), y = gsap.quickTo(b, 'y', { duration: 0.4, ease: 'power3' });
    b.addEventListener('pointermove', (e) => {
      const r = b.getBoundingClientRect();
      x((e.clientX - r.left - r.width / 2) * 0.22); y((e.clientY - r.top - r.height / 2) * 0.32);
    });
    b.addEventListener('pointerleave', () => { x(0); y(0); });
  });
}
