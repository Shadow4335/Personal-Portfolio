(function () {
  // EchoName: the hero name with four afterimages that close in and lock
  // into one word over a pinned screen of scrolling. Only transforms and
  // opacity change per frame; every layout read happens in measure().
  var FD = window.FD = window.FD || {};
  var pin = document.querySelector('.hero-pin');
  if (!pin) return;
  var sticky = pin.querySelector('.hero-sticky');
  var stage = pin.querySelector('.hero-stage');
  var stack = pin.querySelector('.echo-stack');
  var front = pin.querySelector('.echo-front');
  var echoes = [].slice.call(stack.querySelectorAll('.echo'));
  var metas = [].slice.call(pin.querySelectorAll('.hero-meta'));
  var curtains = pin.querySelector('.curtains');

  var STEP = 0.26;                  // gap between afterimages, in em
  var LAG = { 1: 0.16, 2: 0.10 };   // inner pair follows closely, outer pair trails
  var LOCK_AT = 0.65;               // share of the pin spent closing in
  var REST = 0.08 / STEP;           // reduced motion: fixed 0.08em spread

  var state = { 1: 0, 2: 0 };       // spread per ring: 1 = open, 0 = locked
  var scale = 1, lift = 0, fade = 1;
  var open = 0, openFrom = 0;       // intro hand-off: closed → full spread
  var pinTop = 0, range = 1, locked = false;
  var reduce = FD.reduceMotion.matches;

  function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  // Fit the name to the content width (44px → 240px), and cache the pin geometry
  function measure() {
    stack.style.fontSize = '100px';
    var w = front.offsetWidth;
    var cs = getComputedStyle(stage);
    var avail = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    stack.style.fontSize = Math.min(240, Math.max(44, 100 * avail / w)) + 'px';
    var r = pin.getBoundingClientRect();
    pinTop = r.top + scrollY;
    range = Math.max(1, pin.offsetHeight - sticky.offsetHeight);
  }

  function render(now, dt) {
    var p = reduce ? 0 : clamp((scrollY - pinTop) / range);

    // Intro: echoes fan out over dur-cinematic after the pre-flight
    if (FD.ready && open < 1) {
      if (!openFrom) openFrom = now;
      open = reduce ? 1 : easeOut(clamp((now - openFrom) / 1400));
    }

    var target = reduce ? REST : (1 - easeInOut(clamp(p / LOCK_AT))) * open;
    var widest = 0;
    for (var r = 1; r <= 2; r++) {
      var k = reduce ? 1 : 1 - Math.pow(1 - LAG[r], dt);
      state[r] += (target - state[r]) * k;
      if (Math.abs(state[r] - target) < 0.0005) state[r] = target;
      widest = Math.max(widest, state[r]);
    }

    for (var i = 0; i < echoes.length; i++) {
      var el = echoes[i], kk = el._k;
      el.style.transform = 'translate3d(0,' + (kk * STEP * state[Math.abs(kk)]).toFixed(4) + 'em,0)';
    }

    // After the lock the name settles: 88% scale and a slight lift
    var post = easeOut(clamp((p - LOCK_AT) / (1 - LOCK_AT)));
    var e = reduce ? 1 : 1 - Math.pow(1 - 0.14, dt);
    scale += (1 - 0.12 * post - scale) * e;
    lift += (-6 * post - lift) * e;
    stack.style.transform = 'translate3d(0,' + lift.toFixed(2) + '%,0) scale(' + scale.toFixed(4) + ')';

    var f = 0.15 + 0.85 * (1 - clamp(p / 0.45));
    if (Math.abs(f - fade) > 0.001) {
      fade = f;
      for (var m = 0; m < metas.length; m++) metas[m].style.opacity = f.toFixed(3);
    }

    // Curtains react a little to scroll
    if (curtains && !reduce) curtains.style.translate = '0 ' + (p * -40).toFixed(1) + 'px';

    // Lock "thock" and release whoosh use different thresholds so they never stutter
    if (FD.ready && open >= 1) {
      if (!locked && widest < 0.012) { locked = true; FD.sound && FD.sound.play('echoLock'); }
      else if (locked && widest > 0.2) { locked = false; FD.sound && FD.sound.play('echoRelease'); }
    }
  }

  echoes.forEach(function (el) { el._k = +el.getAttribute('data-k'); });

  FD.reduceMotion.addEventListener('change', function (e) { reduce = e.matches; measure(); });
  addEventListener('resize', measure);
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(measure);
  addEventListener('load', measure);
  measure();
  FD.ticker.add(render);
})();
