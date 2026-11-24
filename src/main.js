import '@fontsource-variable/archivo/wdth.css';
import '@fontsource-variable/jetbrains-mono';
import './styles.css';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';
import { sound } from './sound.js';
import { runIntro } from './intro.js';
import { startIss } from './iss.js';
import { initSkills } from './skills.js';
import { skyLine } from './sky.js';

gsap.registerPlugin(ScrollTrigger, SplitText);
const root = document.documentElement;
root.classList.add('js');
document.querySelector('.gate')?.classList.add('is-managed');
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
const quality = !finePointer || innerWidth < 768 || (navigator.hardwareConcurrency || 8) <= 4 ? 'low' : 'high';

/* ── Smooth scroll: Lenis driven by GSAP's ticker ───────── */
const lenis = new Lenis({ lerp: reduced ? 1 : 0.1, wheelMultiplier: 0.9 });
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((t) => lenis.raf(t * 1000));
gsap.ticker.lagSmoothing(0);

/* ── 3D scene (lazy chunk) ──────────────────────────────── */
let scene = null;
let issPos = null;
let launched = false;
const sceneReady = import('./scene/scene.js')
  .then((m) => m.createScene($('.space'), { quality, reducedMotion: reduced }))
  .catch((err) => {
    console.warn('3D scene unavailable, using the flat sky.', err);
    root.classList.add('no-webgl');
    return null;
  });
sceneReady.then((s) => {
  scene = s;
  if (s && issPos) s.setIss(...issPos);
});

/* ── Launch ─────────────────────────────────────────────── */
// The gate always opens at the top; browsers may restore an old scroll position after load.
const toTop = () => { if (!launched) lenis.scrollTo(0, { immediate: true, force: true }); };
toTop();
addEventListener('load', toTop);
lenis.stop();
runIntro({ sound, sceneReady, reduced }).then(({ quick }) => {
  toTop();
  root.classList.add('is-launched');
  lenis.start();
  revealHero(quick);
  if (sound.enabled) sound.ambient(true);
  syncSoundUi();
  launched = true;
  const target = location.hash && document.getElementById(location.hash.slice(1));
  if (target) setTimeout(() => lenis.scrollTo(target, { duration: 1.6 }), 600);
});

function revealHero(quick) {
  document.fonts.ready.then(() => {
    gsap.set('.hero > *', { opacity: 1 });
    if (reduced) return;
    const split = SplitText.create('.hero-name', { type: 'chars', mask: 'chars' });
    gsap.timeline({ delay: quick ? 0.1 : 0.2 })
      .from(split.chars, { yPercent: 108, duration: 1.3, ease: 'expo.out', stagger: 0.04 })
      .from('.hero .eyebrow, .hero-lede, .hero-meta, .hero-cta, .scroll-cue', { opacity: 0, y: 26, duration: 1.1, ease: 'expo.out', stagger: 0.09 }, 0.3);
  });
}

/* ── Section reveals ────────────────────────────────────── */
document.fonts.ready.then(() => {
  $$('.split').forEach((el) => {
    if (reduced) return el.classList.add('is-split');
    SplitText.create(el, {
      type: 'lines,words',
      mask: 'lines',
      autoSplit: true,
      onSplit(self) {
        el.classList.add('is-split');
        return gsap.from(self.words, { yPercent: 115, duration: 1.15, ease: 'expo.out', stagger: 0.07, scrollTrigger: { trigger: el, start: 'top 86%', once: true } });
      },
    });
  });
  ScrollTrigger.refresh();
});

if (reduced) gsap.set('.reveal', { opacity: 1, y: 0 });
else ScrollTrigger.batch('.reveal', {
  start: 'top 90%',
  once: true,
  onEnter: (els) => gsap.to(els, { opacity: 1, y: 0, duration: 1.1, ease: 'expo.out', stagger: 0.08, overwrite: true }),
});

$$('[data-count]').forEach((dd) => {
  const o = { v: 0 }, n = Number(dd.dataset.count);
  ScrollTrigger.create({
    trigger: dd, start: 'top 92%', once: true,
    onEnter: () => gsap.to(o, { v: n, duration: reduced ? 0.01 : 1.4, ease: 'power2.out', onUpdate: () => { dd.textContent = String(Math.round(o.v)).padStart(2, '0'); } }),
  });
});

const timeline = $('.timeline');
ScrollTrigger.create({ trigger: timeline, start: 'top 70%', end: 'bottom 65%', onUpdate: (s) => timeline.style.setProperty('--fill', s.progress.toFixed(3)) });

/* ── Missions: pinned orbit carousel on wide screens ────── */
const mm = gsap.matchMedia();
mm.add({ wide: '(min-width: 901px)', narrow: '(max-width: 900px)' }, (ctx) => {
  const track = $('.orbit-track');
  const cards = $$('.mission', track);
  if (ctx.conditions.wide) {
    const span = () => {
      const f = cards[0], l = cards[cards.length - 1];
      return l.offsetLeft + l.offsetWidth / 2 - (f.offsetLeft + f.offsetWidth / 2);
    };
    // Cards swing on a shallow arc: the further from centre, the more they turn away and recede.
    const tilt = () => {
      const cx = innerWidth / 2;
      for (const c of cards) {
        const b = c.getBoundingClientRect();
        const a = Math.max(-1, Math.min(1, (b.left + b.width / 2 - cx) / innerWidth));
        c.style.transform = `translateZ(${(-Math.abs(a) * 420).toFixed(1)}px) rotateY(${(a * -32).toFixed(2)}deg)`;
        c.style.opacity = (1 - Math.min(1, Math.abs(a) * 1.15) * 0.65).toFixed(3);
      }
    };
    gsap.to(track, {
      x: () => -span(),
      ease: 'none',
      onUpdate: tilt,
      scrollTrigger: { trigger: '.orbit', start: 'center center', end: () => '+=' + span() * 1.15, pin: true, scrub: reduced ? true : 0.9, invalidateOnRefresh: true, refreshPriority: 1, onRefresh: tilt, onToggle: (st) => root.classList.toggle('in-orbit', st.isActive) },
    });
    tilt();
    return () => { root.classList.remove('in-orbit'); cards.forEach((c) => { c.style.transform = ''; c.style.opacity = ''; }); };
  }
  if (!reduced) cards.forEach((c) => gsap.from(c, {
    rotationX: 18, y: 90, opacity: 0, transformPerspective: 1100, transformOrigin: '50% 0%', ease: 'none',
    scrollTrigger: { trigger: c, start: 'top 98%', end: 'top 62%', scrub: 0.6 },
  }));
});

/* ── Journey: scroll position → scene stage, altimeter, nav ─ */
const stages = $$('[data-stage]');
const stageTriggers = stages.slice(1).map((sec) => ScrollTrigger.create({ trigger: sec, start: 'top 85%', end: 'top 15%' }));
const ALTS = [400, 35786, 200000, 384400, 1.5e6, 6.0e9]; // km at each stage
const altitude = (j) => {
  const i = Math.min(4, Math.floor(j)), f = j - i;
  return Math.exp(Math.log(ALTS[i]) + (Math.log(ALTS[i + 1]) - Math.log(ALTS[i])) * f);
};
const smooth = (x) => x * x * (3 - 2 * x);
const altVal = $('.alt-val'), altFill = $('.alt-fill'), altStops = $$('.alt-stops li');
const navLinks = $$('.nav-links a');
const dotLabel = $('.dot-label');
let stage = -1, lastAlt = '';

gsap.ticker.add(() => {
  let j = 0;
  for (const st of stageTriggers) j += smooth(st.progress);
  if (scene) {
    scene.setJourney(j);
    scene.setVelocity(lenis.velocity);
  }
  const txt = Math.round(altitude(j)).toLocaleString('en-US');
  if (txt !== lastAlt) { altVal.textContent = txt; lastAlt = txt; }
  altFill.style.transform = `scaleY(${(j / 5).toFixed(4)})`;

  const s = Math.round(j);
  if (s !== stage) {
    if (launched && stage !== -1) sound.section();
    stage = s;
    altStops.forEach((li, i) => li.classList.toggle('is-on', i <= s));
    const id = stages[s]?.id;
    navLinks.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === '#' + id));
  }

  if (scene && j > 4.55) {
    const p = scene.project('earth');
    dotLabel.style.transform = `translate(${(p.x + 8).toFixed(1)}px, ${(p.y - 8).toFixed(1)}px)`;
    dotLabel.classList.toggle('is-on', p.visible && j > 4.8);
  } else if (dotLabel.classList.contains('is-on')) dotLabel.classList.remove('is-on');
});

/* ── Nav ────────────────────────────────────────────────── */
const nav = $('.nav'), menuBtn = $('.menu-toggle');
const setMenu = (open) => {
  nav.classList.toggle('is-open', open);
  menuBtn.setAttribute('aria-expanded', String(open));
  open ? lenis.stop() : launched && lenis.start();
};
menuBtn.addEventListener('click', () => setMenu(!nav.classList.contains('is-open')));
addEventListener('keydown', (e) => { if (e.key === 'Escape' && nav.classList.contains('is-open')) setMenu(false); });
lenis.on('scroll', (l) => nav.classList.toggle('is-hidden', l.direction > 0 && l.scroll > innerHeight * 0.6 && !nav.classList.contains('is-open')));

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a || a.classList.contains('skip-link')) return;
  const id = a.getAttribute('href');
  const target = id === '#top' ? 0 : document.getElementById(id.slice(1));
  if (target === null) return;
  e.preventDefault();
  setMenu(false);
  lenis.scrollTo(target, { duration: reduced ? 0 : 1.8, easing: (x) => 1 - Math.pow(1 - x, 4) });
  const focusEl = target === 0 ? $('#hero-name') : target;
  focusEl.setAttribute('tabindex', '-1');
  focusEl.focus({ preventScroll: true });
});

/* ── Sound ──────────────────────────────────────────────── */
const soundBtn = $('.sound-toggle');
function syncSoundUi() { soundBtn.setAttribute('aria-pressed', String(sound.enabled)); }
function toggleSound() {
  const on = !sound.enabled;
  sound.setEnabled(on);
  if (on) { sound.unlock(); sound.ambient(true); sound.click(); }
  syncSoundUi();
  toast(on ? 'Sound on' : 'Sound off');
}
syncSoundUi();
soundBtn.addEventListener('click', toggleSound);
addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() !== 'm' || e.metaKey || e.ctrlKey || e.altKey || !launched) return;
  if (e.target.closest('input, textarea, [contenteditable]')) return;
  toggleSound();
});
addEventListener('pointerdown', () => sound.unlock(), { passive: true });
// touch only counts as a user gesture on lift, so listen to every event that can unlock audio
for (const ev of ['pointerup', 'click', 'touchend']) addEventListener(ev, () => sound.unlock(), { passive: true });
addEventListener('keydown', () => sound.unlock());

let hoverEl = null;
const reticle = $('.reticle');
document.addEventListener('pointerover', (e) => {
  if (e.pointerType !== 'mouse') return;
  const el = e.target.closest('a, button');
  if (el !== hoverEl) {
    hoverEl = el;
    reticle.classList.toggle('is-hot', !!el);
    if (el && launched) sound.hover();
  }
});
document.addEventListener('click', (e) => {
  const el = e.target.closest('a, button');
  if (!el || el.closest('.gate') || el.classList.contains('copy') || el === soundBtn) return;
  if (el.target === '_blank' || el.href?.startsWith('mailto:')) sound.quindar();
  else sound.click();
});

/* ── Copy email ─────────────────────────────────────────── */
const toastEl = $('.toast');
let toastT = 0;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('is-on');
  clearTimeout(toastT);
  toastT = setTimeout(() => toastEl.classList.remove('is-on'), 2200);
}
$('.copy')?.addEventListener('click', async (e) => {
  const v = e.currentTarget.dataset.copy;
  try {
    await navigator.clipboard.writeText(v);
    sound.copy();
    toast('Email copied. Talk soon.');
  } catch {
    location.href = 'mailto:' + v;
  }
});

/* ── Cursor reticle + scene parallax ────────────────────── */
if (finePointer) {
  const xTo = gsap.quickTo(reticle, 'x', { duration: 0.35, ease: 'power3' });
  const yTo = gsap.quickTo(reticle, 'y', { duration: 0.35, ease: 'power3' });
  addEventListener('pointermove', (e) => {
    xTo(e.clientX); yTo(e.clientY);
    reticle.classList.add('is-on');
    scene?.setPointer((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
  }, { passive: true });
  document.documentElement.addEventListener('mouseleave', () => reticle.classList.remove('is-on'));
}

/* ── Live data ──────────────────────────────────────────── */
startIss((lat, lon) => { issPos = [lat, lon]; scene?.setIss(lat, lon); });
initSkills({ reduced, sound });

const skyTime = $('.foot-time'), skyMoon = $('.foot-moon');
const paintSky = () => { const s = skyLine(); skyTime.textContent = s.time; skyMoon.textContent = s.moon; };
paintSky();
setInterval(paintSky, 30000);
