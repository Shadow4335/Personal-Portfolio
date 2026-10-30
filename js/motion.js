(function () {
  // Motion layer: smooth scroll, reveals, counters, scroll progress, card
  // parallax and the promise-word cycle. Everything rides FD.ticker.
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
  var headings = [].slice.call(document.querySelectorAll('.section-heading, .contact-heading'));

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
  var targets = [].slice.call(document.querySelectorAll('.reveal, .section-heading, .contact-heading, .stat-tiles'));
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var el = e.target;
      el.classList.add('is-in');
      io.unobserve(el);
      if (el.classList.contains('stat-tiles')) countUp(el);
      if (el.classList.contains('section-heading') || el.classList.contains('contact-heading')) {
        document.dispatchEvent(new CustomEvent('fd:arrival'));
      }
    });
  }, { rootMargin: '0px 0px -20% 0px' });
  targets.forEach(function (el) { io.observe(el); });

  // ── StatTile counters: 00 → value over dur-cinematic, ease-out ──
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function countUp(group) {
    var counts = [].slice.call(group.querySelectorAll('.count'));
    if (reduce) return;
    var start = null;
    counts.forEach(function (c) { c._to = +c.getAttribute('data-to'); c._shown = 0; c.textContent = '00'; });
    function step(now) {
      if (start === null) start = now;
      var t = Math.min(1, (now - start) / 1400), e = 1 - Math.pow(1 - t, 3);
      counts.forEach(function (c) {
        var v = Math.round(c._to * e);
        if (v !== c._shown) {
          c._shown = v;
          c.textContent = pad(v);
          document.dispatchEvent(new CustomEvent('fd:count'));
        }
      });
      if (t >= 1) FD.ticker.remove(step);
    }
    FD.ticker.add(step);
  }

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

  // ── Promise word cycles every 2.5s with a line mask ──
  var promise = document.querySelector('.promise-word');
  if (promise && !reduce) {
    var words = [].slice.call(promise.children), idx = 0;
    promise.classList.add('is-cycling');
    words[0].classList.add('is-on');
    setInterval(function () {
      var prev = words[idx];
      idx = (idx + 1) % words.length;
      prev.classList.remove('is-on');
      prev.classList.add('is-out');
      words[idx].classList.remove('is-out');
      words[idx].classList.add('is-on');
      setTimeout(function () { prev.classList.remove('is-out'); }, 720);
    }, 2500);
  }
})();
