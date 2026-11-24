import { gsap } from 'gsap';

// Launch gate: boot checklist, then press-and-hold to launch (a tap auto-completes).
// Resolves when the gate is gone. `sceneReady` resolves to the scene or null.
export function runIntro({ sound, sceneReady, reduced }) {
  const gate = document.querySelector('.gate');
  const done = (quick) => ({ quick });

  let returning = false;
  try { returning = sessionStorage.getItem('av-launched') === '1'; } catch {}
  if (!gate || returning) {
    if (gate) gate.hidden = true;
    // don't hold the page for the 3D: it eases in whenever it's ready
    sceneReady.then((scene) => {
      if (scene) gsap.fromTo({ p: 0.55 }, { p: 0.55 }, { p: 1, duration: reduced ? 0.01 : 1.8, ease: 'power3.out', onUpdate() { scene.setIntro(this.targets()[0].p); } });
    });
    return Promise.resolve(done(true));
  }

  const btn = gate.querySelector('.ignite');
  const clock = gate.querySelector('.gate-clock b');
  const count = gate.querySelector('.gate-count');
  const soundBtn = gate.querySelector('.gate-sound');
  const skipBtn = gate.querySelector('.gate-skip');
  const checks = [...gate.querySelectorAll('.gate-checks li')];
  const HOLD_MS = reduced ? 900 : 1700;

  let scene = null, hold = 0, holding = false, auto = false, pressedAt = 0, digit = 4, rumble = null, launched = false, last = 0, raf = 0;

  const setSoundUi = () => {
    soundBtn.setAttribute('aria-pressed', String(sound.enabled));
    soundBtn.querySelector('b').textContent = sound.enabled ? 'On' : 'Off';
  };
  setSoundUi();
  soundBtn.addEventListener('click', () => { sound.setEnabled(!sound.enabled); sound.unlock(); setSoundUi(); sound.click(); });

  // Boot: clock counts T-10 → T-4 while the checks come up, then holds for the visitor.
  const boot = new Promise((res) => {
    let t = 10, i = 0;
    const id = setInterval(() => {
      t -= 1; clock.textContent = String(t).padStart(2, '0');
      if (checks[i]) checks[i++].classList.add('is-on');
      if (t <= 4) { clearInterval(id); res(); }
    }, reduced ? 60 : 210);
  });
  const timeout = new Promise((res) => setTimeout(res, 7000)); // never trap a visitor behind a slow GPU
  Promise.all([boot, Promise.race([sceneReady.then((s) => { scene = s; }), timeout])]).then(() => {
    clock.textContent = '04 · Hold';
    btn.disabled = false;
    btn.focus({ preventScroll: true });
  });
  // a scene that arrives after launch (slow GPU, 7 s cap hit) must skip straight to the launched view
  sceneReady.then((s) => { scene = s; if (s) { s.setIntro(launched ? 1 : 0); s.setShake(0); } });

  return new Promise((resolve) => {
    const press = () => {
      if (btn.disabled || launched || holding) return;
      sound.unlock();
      holding = true; auto = false; pressedAt = performance.now();
      rumble = rumble || sound.rumble();
      gate.classList.add('is-holding');
      if (!reduced) gate.classList.add('is-shaking');
      if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
    };
    const release = () => {
      if (!holding || auto) return;
      if (performance.now() - pressedAt < 260) { auto = true; return; } // a tap launches too
      holding = false;
      sound.abort();
    };
    const tick = (now) => {
      const dt = Math.min(64, now - last); last = now;
      hold = Math.max(0, Math.min(1, hold + (holding ? dt / HOLD_MS : -dt / 380)));
      gate.style.setProperty('--hold', hold.toFixed(3));
      rumble && rumble.set(hold);
      scene && scene.setShake(reduced ? 0 : hold * 0.55);
      const d = hold >= 1 ? 0 : 3 - Math.min(2, Math.floor(hold * 3));
      if (holding && d !== digit) { digit = d; if (d > 0) { count.textContent = d; sound.beep(d); clock.textContent = '0' + d; } }
      raf = 0;
      if (hold >= 1) return launch(false);
      if (!holding && hold === 0) {
        gate.classList.remove('is-holding', 'is-shaking'); digit = 4; count.textContent = ''; clock.textContent = '04 · Hold';
        rumble && rumble.stop(150); rumble = null;
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    const launch = (skipped) => {
      if (launched) return;
      launched = true; holding = false;
      try { sessionStorage.setItem('av-launched', '1'); } catch {}
      clock.textContent = '00 · Liftoff';
      count.textContent = '';
      if (!skipped) { sound.beep(0); sound.liftoff(); }
      rumble && rumble.stop(skipped ? 150 : 900); rumble = null;
      gate.classList.remove('is-holding');

      const shake = { a: skipped ? 0 : 0.9 };
      const tl = gsap.timeline();
      if (scene) {
        const p = { v: 0 };
        tl.to(p, { v: 1, duration: skipped || reduced ? 1.4 : 3, ease: 'power2.inOut', onUpdate: () => scene.setIntro(p.v) }, 0);
        if (!reduced) tl.to(shake, { a: 0, duration: 2.4, ease: 'power2.out', onUpdate: () => scene.setShake(shake.a) }, 0);
      }
      tl.to(gate, { '--hold': skipped ? 0 : 1, duration: 0.15 }, 0)
        .to(gate.querySelectorAll('.gate-center, .gate-checks'), { y: reduced ? 0 : '45vh', opacity: 0, duration: 1.1, ease: 'power3.in' }, 0.05)
        .to(gate.querySelectorAll('.gate-top, .gate-bottom'), { opacity: 0, duration: 0.5 }, 0.1)
        .to(gate, { opacity: 0, duration: 1.1, ease: 'power2.inOut' }, 0.6)
        .call(() => gate.classList.remove('is-shaking'), null, 1.1)
        .call(() => resolve(done(skipped)), null, skipped ? 0.3 : 1.3)
        .call(() => { gate.hidden = true; }, null, 1.7); // gone as soon as it's faded, so it can't swallow taps
    };

    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); btn.setPointerCapture?.(e.pointerId); press(); });
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    // Keyboard: hold Space or Enter. Escape skips.
    const onKey = (e) => {
      if (launched) return document.removeEventListener('keydown', onKey), document.removeEventListener('keyup', onKey);
      if (e.key === 'Escape') { sound.unlock(); return launch(true); }
      if (e.key !== ' ' && e.key !== 'Enter') return;
      if (e.target.closest('.gate-bottom')) return; // let those buttons work normally
      e.preventDefault();
      if (e.type === 'keydown' && !e.repeat) press();
      if (e.type === 'keyup') release();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('keyup', onKey);
    skipBtn.addEventListener('click', () => { sound.unlock(); launch(true); });
  });
}
