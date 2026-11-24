import { gsap } from 'gsap';
import { createFilm, T, SWEEP_PERIOD, IGN, SEP, COUNT, CALLOUTS } from './film.js';

const CHAPTERS = ['01 — Go for launch', '02 — Liftoff', '03 — Orbit', '04 — First light'];
const LINES = [
  [0.3, 1.0, 'RANGE › AV26, weather is go, range is green. You are go for launch.', true],
  [1.5, 0.7, 'AV26 › Copy, go for launch.', true],
  [8.1, 1.1, 'Above 100 km the sky stays black, even at noon.'],
  [9.4, 1.0, 'Orion. Follow the belt down and you hit Sirius, the brightest star in the night sky.'],
];
const PING_BEARINGS = [40, 205, 300]; // radar blips the sweep crosses before the radar fades

// Sound gate, then a 13-second film (film.js paints it), then a telescope-aperture iris onto the site.
// Resolves when the site should start revealing; `quick` means no film was shown.
export function runIntro({ sound, sceneReady, reduced }) {
  const gate = document.querySelector('.gate');
  let returning = false;
  try { returning = sessionStorage.getItem('av-launched') === '1'; } catch {}
  if (!gate || returning) {
    if (gate) gate.hidden = true;
    sceneReady.then((s) => {
      if (s) gsap.fromTo({ p: 0.55 }, { p: 0.55 }, { p: 1, duration: reduced ? 0.01 : 1.8, ease: 'power3.out', onUpdate() { s.setIntro(this.targets()[0].p); } });
    });
    return Promise.resolve({ quick: true });
  }

  const $ = (s) => gate.querySelector(s);
  const canvas = $('.film'), card = $('.gate-card'), hud = $('.film-hud'), skipBtn = $('.film-skip');
  const chapterEl = $('.hud-chapter'), bars = [...gate.querySelectorAll('.hud-bars i')], timeEl = $('.hud-time');
  const caption = $('.hud-caption'), progress = $('.hud-progress');
  const lowPower = !matchMedia('(hover: hover) and (pointer: fine)').matches || (navigator.hardwareConcurrency || 8) <= 4;
  const film = createFilm(canvas, { lowPower });

  // the real 3D launch loads and compiles while the visitor reads the gate; if WebGL can't, the 2D rocket stands in
  const canvas3d = $('.launch3d');
  let launch3d = null, has3D = false;
  if (!reduced && canvas3d) {
    import('./launch3d.js')
      .then((m) => m.createLaunch3D(canvas3d, { lowPower }))
      .then((api) => { launch3d = api; })
      .catch((err) => console.warn('3D launch unavailable, using the 2D one.', err));
  }
  const drop3d = () => { if (launch3d) { launch3d.dispose(); launch3d = null; } has3D = false; canvas3d?.remove(); };

  let scene = null, started = false, revealed = false, idle = 0, tl = null;
  sceneReady.then((s) => { scene = s; if (s) s.setIntro(revealed ? 1 : 0); });

  const loop = (now) => { film.drawGate(now / 1000); idle = requestAnimationFrame(loop); };
  idle = requestAnimationFrame(loop);
  $('[data-enter="sound"]').focus({ preventScroll: true });

  return new Promise((resolve) => {
    let chapter = -1;
    const irisMax = () => Math.hypot(innerWidth, innerHeight) / 2 + 40;
    const iris = { r: 0 };
    const setIris = () => gate.style.setProperty('--iris', `${iris.r.toFixed(1)}px`);

    const frame = (t) => {
      if (has3D) {
        if (t < 8.2) {
          launch3d.render(Math.max(t, 2.2));
          canvas3d.style.opacity = Math.min(1, Math.max(0, (t - 2.3) / 0.6)) * (1 - Math.min(1, Math.max(0, (t - 7.5) / 0.6)));
        } else drop3d(); // free the GPU once the launch is over
      }
      film.draw(t, iris.r, has3D);
      timeEl.textContent = `AV26 · T+${t.toFixed(1).padStart(4, '0')}`;
      progress.style.transform = `scaleX(${(t / T.end).toFixed(4)})`;
      const c = t < T.launch ? 0 : t < T.orbit ? 1 : t < T.light ? 2 : 3;
      if (c !== chapter) {
        chapter = c;
        chapterEl.textContent = CHAPTERS[c];
        bars.forEach((b, i) => b.classList.toggle('is-on', i <= c));
      }
    };

    const reveal = () => {
      if (revealed) return;
      revealed = true;
      resolve({ quick: false });
    };

    const finish = () => {
      gate.hidden = true;
      film.dispose();
      drop3d();
      document.removeEventListener('keydown', onKey);
    };

    // typed radio/caption lines, ticking like a teleprinter
    const type = (text, dur, radio) => {
      if (radio) { sound.squelch(); sound.quindar(); }
      const o = { n: 0 };
      let last = 0;
      return gsap.to(o, {
        n: text.length, duration: dur, ease: 'none',
        onUpdate() { const n = o.n | 0; if (n !== last) { last = n; caption.textContent = text.slice(0, n); sound.typeTick(); } },
      });
    };

    const play = () => {
      gate.classList.add('is-playing');
      const clock = { t: 0 };
      tl = gsap.timeline({ onComplete: finish });
      tl.to(clock, { t: T.end, duration: T.end, ease: 'none', onUpdate: () => frame(clock.t) }, 0)
        .to(card, { autoAlpha: 0, y: -24, duration: 0.5, ease: 'power2.in' }, 0)
        .to([hud, skipBtn], { autoAlpha: 1, duration: 0.6 }, 0.2)
        .call(() => sound.music.cue('depart'), null, 0)
        .call(() => { has3D = !!launch3d; }, null, 2.1) // decided once, before the pad appears
        .call(() => { sound.music.cue('climb'); caption.textContent = ''; }, null, T.launch)
        .call(() => { sound.beep(0); sound.liftoff(); sound.music.setIntensity(0.55, 0.6); }, null, IGN)
        .call(() => sound.stageSep(), null, SEP)
        .call(() => { sound.music.cue('orbit'); sound.music.setIntensity(1, 1.5); sound.whoosh(); }, null, T.orbit)
        .call(() => sound.sparkle(), null, 9.35)
        .call(() => { caption.textContent = ''; }, null, T.light)
        .call(() => { sound.music.cue('reveal'); sound.hit(); }, null, T.hit)
        .to(hud, { autoAlpha: 0, duration: 0.5 }, T.iris - 0.3)
        .to(skipBtn, { autoAlpha: 0, duration: 0.3 }, T.iris - 0.3)
        .call(() => { sound.shutter(); sound.whoosh(); sound.music.setIntensity(0.35, 4); gate.classList.add('is-iris'); }, null, T.iris)
        .to(iris, { r: irisMax(), duration: T.end - T.iris, ease: 'power3.inOut', onUpdate: setIris }, T.iris)
        .call(reveal, null, T.iris + 0.4);
      PING_BEARINGS.forEach((b) => tl.call(() => sound.radarPing(), null, (b / 360) * SWEEP_PERIOD));
      COUNT.forEach(([at, n]) => tl.call(() => sound.beep(Number(n)), null, at));
      CALLOUTS.forEach(([at]) => tl.call(() => sound.callout(), null, at));
      LINES.forEach(([at, dur, text, radio]) => tl.call(() => { tl.add(type(text, dur, radio), at); }, null, at));
      // the 3D sky climbs into its hero framing behind the film, ready for the iris
      const p = { v: 0 };
      tl.to(p, { v: 1, duration: 2.6, ease: 'power2.inOut', onUpdate: () => scene && scene.setIntro(p.v) }, T.iris - 1.2);
    };

    const skip = () => {
      if (!tl || revealed) return;
      tl.kill();
      drop3d();
      sound.music.cue('reveal');
      sound.music.setIntensity(0.35, 3);
      sound.shutter();
      gate.classList.add('is-iris');
      gsap.to([hud, skipBtn], { autoAlpha: 0, duration: 0.3 });
      if (scene) gsap.fromTo({ v: 0.5 }, { v: 0.5 }, { v: 1, duration: 1.2, ease: 'power2.out', onUpdate() { scene.setIntro(this.targets()[0].v); } });
      gsap.to(iris, { r: irisMax(), duration: 0.9, ease: 'power3.inOut', onUpdate: () => { setIris(); film.draw(T.end, iris.r); }, onComplete: finish });
      setTimeout(reveal, 250);
    };

    const enter = (withSound) => {
      if (started) return;
      started = true;
      cancelAnimationFrame(idle);
      try { sessionStorage.setItem('av-launched', '1'); } catch {}
      sound.setEnabled(withSound);
      if (withSound) { sound.unlock(); sound.music.start(1); }
      if (reduced) {
        if (scene) scene.setIntro(1);
        if (withSound) sound.music.setIntensity(0.35, 3);
        gsap.to(gate, { autoAlpha: 0, duration: 0.5, onComplete: finish });
        return reveal();
      }
      play();
    };

    function onKey(e) {
      if (e.key === 'Escape') return started ? skip() : enter(false);
      if (e.key === 'Enter' && !started && !e.target.closest('button')) enter(true);
    }
    document.addEventListener('keydown', onKey);
    $('[data-enter="sound"]').addEventListener('click', () => enter(true));
    $('[data-enter="silent"]').addEventListener('click', () => enter(false));
    skipBtn.addEventListener('click', skip);
  });
}
