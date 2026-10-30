(function () {
  // Mouse/trackpad only, and respect reduced-motion settings
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var FD = window.FD;
  var root = document.documentElement;
  var dot = document.querySelector('.cursor-dot');
  var ring = document.querySelector('.cursor-ring');
  var glow = document.querySelector('.cursor-glow');
  var LINKS = 'a, button, label, .btn, .nm-node';
  var CARDS = '.card';
  var DRAG = '.nm-stage';

  var mx = innerWidth / 2, my = innerHeight / 2; // pointer
  var rx = mx, ry = my, gx = mx, gy = my;        // eased followers
  var size = 1, down = false;                    // eased ring scale
  var hovered = null, card = null, btn = null, btnBox = null;
  var dirty = false;

  root.classList.add('has-cursor', 'cursor-hidden');

  function clamp8(v) { return Math.max(-8, Math.min(8, v)); }

  // A button's resting box, minus any lean it currently has
  function baseBox(b) {
    var r = b.getBoundingClientRect();
    var t = getComputedStyle(b).translate.split(' ');
    var tx = parseFloat(t[0]) || 0, ty = parseFloat(t[1]) || 0;
    return { left: r.left - tx, top: r.top - ty, width: r.width, height: r.height };
  }

  // Work out what is under the pointer (also re-run after scrolling)
  function updateTarget() {
    var el = document.elementFromPoint(mx, my);
    if (el === hovered) return;
    hovered = el;
    var link = el && el.closest(LINKS);
    card = el && el.closest(CARDS);
    var drag = el && el.closest(DRAG);
    var node = el && el.closest('.nm-node');
    root.classList.toggle('cursor-link', !!link && !drag);
    root.classList.toggle('cursor-drag', !!drag && !node);
    root.classList.toggle('cursor-card', !link && !drag && !!card);

    var next = el && el.closest('.btn');
    if (next !== btn) {
      if (btn) btn.style.translate = '';
      btn = next;
      // Measure the resting box so the lean can't feed back on itself
      btnBox = btn ? baseBox(btn) : null;
    }
  }

  addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse') return;
    mx = e.clientX;
    my = e.clientY;
    root.classList.remove('cursor-hidden');
    dirty = true;
  }, { passive: true });

  addEventListener('scroll', function () { hovered = null; btnBox = null; dirty = true; }, { passive: true });
  document.addEventListener('mouseleave', function () { root.classList.add('cursor-hidden'); });
  addEventListener('pointerdown', function () { down = true; root.classList.add('cursor-down'); });
  function release() { down = false; root.classList.remove('cursor-down'); }
  addEventListener('pointerup', release);
  addEventListener('blur', release);

  // Rides the site's single animation loop, eased by elapsed time
  FD.ticker.add(function (now, dt) {
    function ease(k) { return 1 - Math.pow(1 - k, dt); }

    if (dirty) {
      dirty = false;
      updateTarget();
      if (btn && !btnBox) btnBox = baseBox(btn);

      // Buttons lean toward the pointer (magnetic, up to 8px)
      if (btn && btnBox) {
        btn.style.translate =
          clamp8((mx - btnBox.left - btnBox.width / 2) * 0.15) + 'px ' +
          clamp8((my - btnBox.top - btnBox.height / 2) * 0.25) + 'px';
      }
    }

    var target = root.classList.contains('cursor-link') ? 1.6
               : root.classList.contains('cursor-card') ? 1.9
               : root.classList.contains('cursor-drag') ? 1.5 : 1;
    if (down) target *= 0.8;

    rx += (mx - rx) * ease(0.2);
    ry += (my - ry) * ease(0.2);
    gx += (mx - gx) * ease(0.07);
    gy += (my - gy) * ease(0.07);
    size += (target - size) * ease(0.15);

    dot.style.transform = 'translate(' + mx + 'px,' + my + 'px)';
    ring.style.transform = 'translate(' + rx + 'px,' + ry + 'px) scale(' + size + ')';
    glow.style.transform = 'translate(' + gx + 'px,' + gy + 'px)';
  });
})();
