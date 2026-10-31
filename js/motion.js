(function () {
  // Motion layer: smooth scroll, reveals, counters, scroll progress, card
  // parallax and the v2 scenes (statements, signal bars, date block, boarding
  // pass) on one shared scroll + reveal helper. Everything rides FD.ticker.
  var FD = window.FD = window.FD || {};
  var root = document.documentElement;
  var reduce = FD.reduceMotion.matches;

  if (!reduce) root.classList.add('motion');

  // ── Smooth scroll (Lenis, lerp 0.1). Off for reduced motion. ──
  if (!reduce && window.Lenis) {
    var lenis = FD.lenis = new Lenis({ lerp: 0.1, autoRaf: false, anchors: true });
    FD.ticker.add(function (now) { lenis.raf(now); });
    function lock() { root.classList.contains('fd-locked') ? lenis.stop() : lenis.start(); }
    lock();
    document.addEventListener('fd:ready', lock);
  }

  // ── Scroll progress: the 2px horizon line ──
  var bar = document.querySelector('.scroll-progress');
  var maxScroll = 1, lastP = -1;
  function measure() { maxScroll = Math.max(1, root.scrollHeight - innerHeight); }
  addEventListener('resize', measure);
  addEventListener('load', measure);
  measure();
  FD.ticker.add(function () {
    var p = Math.min(1, Math.max(0, scrollY / maxScroll));
    if (Math.abs(p - lastP) < 0.0005) return;
    lastP = p;
    bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
  });

  // ── Headings split into lines that rise from a mask ──
  var headings = [].slice.call(document.querySelectorAll('.section-heading'));

  function splitWords(el) {
    var words = [];
    [].slice.call(el.childNodes).forEach(function (node) {
      if (node.nodeType === 3) {
        node.textContent.split(/(\s+)/).forEach(function (part) {
          if (!part) return;
          if (/^\s+$/.test(part)) { words.push(document.createTextNode(' ')); return; }
          var w = document.createElement('span');
          w.className = 'w';
          w.textContent = part;
          words.push(w);
        });
      } else {
        var w = document.createElement('span');
        w.className = 'w';
        w.appendChild(node);
        words.push(w);
      }
    });
    el.textContent = '';
    words.forEach(function (w) { el.appendChild(w); });
  }

  function groupLines(el) {
    // Undo any previous grouping, then regroup words by their line
    [].slice.call(el.querySelectorAll('.line')).forEach(function (line) {
      var inner = line.firstChild;
      while (inner.firstChild) el.insertBefore(inner.firstChild, line);
      el.removeChild(line);
    });
    var lines = [], top = null, cur = null;
    [].slice.call(el.childNodes).forEach(function (n) {
      var t = n.nodeType === 1 ? n.offsetTop : top;
      if (cur === null || (n.nodeType === 1 && Math.abs(t - top) > 4)) { cur = []; lines.push(cur); top = t; }
      cur.push(n);
    });
    lines.forEach(function (nodes, i) {
      var line = document.createElement('span'), inner = document.createElement('span');
      line.className = 'line';
      inner.className = 'line-inner';
      inner.style.transitionDelay = (i * 60) + 'ms';   // --stagger
      line.appendChild(inner);
      el.insertBefore(line, nodes[0]);
      nodes.forEach(function (n) { inner.appendChild(n); });
    });
  }

  if (!reduce) {
    headings.forEach(function (h) { h.classList.remove('reveal'); splitWords(h); });
    var relayout = function () { headings.forEach(groupLines); };
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(relayout);
    var lastW = innerWidth;
    addEventListener('resize', function () {
      if (innerWidth === lastW) return;
      lastW = innerWidth;
      relayout();
    });
  }

  // Eyebrows type on letter by letter
  [].slice.call(document.querySelectorAll('.eyebrow')).forEach(function (el) {
    el.style.setProperty('--n', el.textContent.trim().length);
  });

  // ── Entrances at 80% of the viewport ──
  var revealers = new WeakMap();
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var el = e.target;
      el.classList.add('is-in');
      io.unobserve(el);
      if (el.classList.contains('section-heading')) document.dispatchEvent(new CustomEvent('fd:arrival'));
      if (revealers.has(el)) revealers.get(el)();
    });
  }, { rootMargin: '0px 0px -20% 0px' });
  [].slice.call(document.querySelectorAll('.reveal, .section-heading')).forEach(function (el) { io.observe(el); });

  // Run fn once when el reaches 80% of the viewport
  FD.reveal = function (el, fn) {
    if (fn) revealers.set(el, fn);
    io.observe(el);
  };

  // ── Card content parallaxes up to 6px toward the cursor ──
  if (!reduce && FD.finePointer.matches) {
    document.addEventListener('pointermove', function (e) {
      var card = e.target.closest && e.target.closest('.card');
      if (card !== FD._card) {
        if (FD._card) { FD._card.style.removeProperty('--px'); FD._card.style.removeProperty('--py'); }
        FD._card = card;
      }
      if (!card) return;
      var r = card.getBoundingClientRect();
      var x = ((e.clientX - r.left) / r.width - 0.5) * 2;
      var y = ((e.clientY - r.top) / r.height - 0.5) * 2;
      card.style.setProperty('--px', (x * 6).toFixed(2) + 'px');
      card.style.setProperty('--py', (y * 6).toFixed(2) + 'px');
    }, { passive: true });
  }

  // ── Shared scroll helper: scroll-linked, damped progress for a scene ──
  // mode 'pin': 0 → 1 across the element's pinned scroll range
  // mode 'enter': 0 → 1 as the element rises through the lower 60% of the view
  var scenes = [];
  function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function ease(t) { return 1 - Math.pow(1 - t, 3); }
  FD.ease = ease;
  FD.clamp = clamp;

  function measureScenes() {
    scenes.forEach(function (sc) {
      var r = sc.el.getBoundingClientRect();
      sc.top = r.top + scrollY;
      sc.h = sc.el.offsetHeight;
    });
  }

  FD.scene = function (el, mode, render) {
    var sc = { el: el, mode: mode, render: render, top: 0, h: 0, cur: reduce ? 1 : 0, drawn: -1 };
    scenes.push(sc);
    measureScenes();
    render(sc.cur);
    return sc;
  };

  FD.ticker.add(function () {
    var vh = innerHeight, y = scrollY;
    for (var i = 0; i < scenes.length; i++) {
      var sc = scenes[i];
      if (y + vh < sc.top - vh || y > sc.top + sc.h + vh) continue;   // far away: skip
      var p = reduce ? 1 : sc.mode === 'pin'
        ? clamp((y - sc.top) / Math.max(1, sc.h - vh))
        : clamp((y + vh - sc.top) / (vh * 0.6));
      sc.cur += (p - sc.cur) * (reduce ? 1 : 0.12);
      if (Math.abs(sc.cur - sc.drawn) < 0.0005) continue;
      sc.drawn = sc.cur;
      sc.render(sc.cur);
    }
  });

  addEventListener('resize', measureScenes);
  addEventListener('load', measureScenes);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureScenes);

  // ── StatementScene: lines develop through slits, then the glow rises ──
  [].slice.call(document.querySelectorAll('.statement')).forEach(function (st) {
    var lines = [].slice.call(st.querySelectorAll('.st-ln'));
    var glow = st.querySelector('.st-glow'), hz = st.querySelector('.st-horizon'), swelled = false;
    FD.scene(st, 'pin', function (p) {
      lines.forEach(function (l, i) { l.style.setProperty('--s', (ease(clamp((p - i * 0.14) / 0.42)) * 100).toFixed(2) + '%'); });
      var g = ease(clamp((p - 0.25) / 0.5));
      glow.style.opacity = g;
      glow.style.transform = 'translateX(-50%) translateY(' + (-g * 14).toFixed(2) + '%)';
      hz.style.opacity = g * 0.8;
      if (!swelled && g > 0.5) { swelled = true; if (FD.sound) FD.sound.play('swell'); }
      if (swelled && g < 0.1) swelled = false;
    });
  });

  // ── Display headlines (Contact) use the same slit reveal ──
  [].slice.call(document.querySelectorAll('.contact-heading')).forEach(function (h) {
    var lines = [].slice.call(h.querySelectorAll('.slit'));
    FD.scene(h, 'enter', function (p) {
      lines.forEach(function (l, i) { l.style.setProperty('--s', (ease(clamp((p - i * 0.14) / 0.6)) * 100).toFixed(2) + '%'); });
    });
    FD.reveal(h, function () { document.dispatchEvent(new CustomEvent('fd:arrival')); });
  });

  // ── SignalBars: one bar per skill, rising 45ms apart; the numeral counts up ──
  var sbHost = document.querySelector('.sb-bars');
  if (sbHost) {
    var SKILLS = ['Onshape 3D CAD', 'HTML5', 'Google Stitch', 'CSS3', 'Rapid prototyping', 'Git / GitHub', 'Antigravity',
      'GitHub Copilot', 'Data visualization', 'Data analysis', 'Python', 'AI app building', 'System architecture',
      'Data-driven decisions', 'MVP scoping', 'Product teardowns', 'Responsible AI', 'AI-assisted development',
      'Feature viability', 'ASCI guidelines', 'CCPA compliance'];
    SKILLS.forEach(function (name, i) {
      var x = (i - 10) / 5.2, h = 26 + 74 * Math.exp(-x * x) + ((i * 7) % 5) - 2;
      var d = document.createElement('div');
      d.className = 'sb-bar';
      d.style.setProperty('--h', h.toFixed(1) + '%');
      d.style.setProperty('--i', i);
      d.innerHTML = '<i></i><b>' + name + '</b>';
      sbHost.appendChild(d);
    });
    var sb = sbHost.closest('.signal-bars'), count = sb.querySelector('.sb-count');
    FD.reveal(sb, function () {
      if (reduce) return;
      count.textContent = '00';
      var start = null, shown = 0;
      function step(now) {
        if (start === null) start = now;
        var t = Math.min(1, (now - start) / 1400), v = Math.round(21 * ease(t));
        if (v !== shown) { shown = v; count.textContent = v < 10 ? '0' + v : String(v); document.dispatchEvent(new CustomEvent('fd:count')); }
        if (t >= 1) FD.ticker.remove(step);
      }
      FD.ticker.add(step);
    });
  }

  // ── DateBlock: the outlined year draws in, the solid year slides up ──
  var dblock = document.querySelector('.dateblock');
  if (dblock) FD.reveal(dblock);
})();
