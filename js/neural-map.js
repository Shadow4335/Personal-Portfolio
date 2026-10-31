(function () {
  // Neural Map v2: an SVG constellation of 21 skills around the ARNAV core.
  // Behaviour kept from v1: drag yaw 0.35°/px (unlimited) and tilt 0.25°/px
  // (±40°), momentum × 0.94 per frame, re-centre at 12% per frame the short
  // way round, Show all → 0°, hover reveals names. The nm-cluster radios are
  // the source of truth for focus.
  var FD = window.FD;
  var map = document.querySelector('.neural');
  if (!map) return;

  var C = [
    { k: 'ai',    t: 'AI · Data',    lon: 288, lat: -22, s: ['Data analysis', 'Data visualization', 'Data-driven decisions', 'Responsible AI', 'AI app building', 'AI-assisted development'] },
    { k: 'prod',  t: 'Product',      lon: 0,   lat: 34,  s: ['Product teardowns', 'MVP scoping', 'Feature viability', 'ASCI guidelines', 'CCPA compliance'] },
    { k: 'dev',   t: 'Development',  lon: 72,  lat: -10, s: ['Python', 'Git / GitHub', 'System architecture', 'GitHub Copilot', 'Antigravity'] },
    { k: 'front', t: 'Frontend',     lon: 150, lat: 24,  s: ['HTML5', 'CSS3', 'Google Stitch', 'Rapid prototyping'] },
    { k: 'cad',   t: 'Design · CAD', lon: 215, lat: -30, s: ['Onshape 3D CAD'] }
  ];
  var BY = {};
  C.forEach(function (c) { BY[c.k] = c; });

  var NS = 'http://www.w3.org/2000/svg';
  var stage = map.querySelector('.nm-stage');
  var svg = map.querySelector('.nm-svg');
  var gL = svg.querySelector('.nm-links'), gP = svg.querySelector('.nm-pulses'), gN = svg.querySelector('.nm-nodes');
  var tip = stage.querySelector('.nm-tip');
  var hudYaw = stage.querySelector('.nm-yaw'), hudTilt = stage.querySelector('.nm-tiltv');
  var hudFocus = stage.querySelector('.nm-focus'), tape = stage.querySelector('.nm-tape i');
  var reduce = FD.reduceMotion.matches;
  var CX = 284, CY = 290, R = 166, F = 3.2;

  function make(n, a, parent) {
    var e = document.createElementNS(NS, n);
    for (var k in a) e.setAttribute(k, a[k]);
    parent.appendChild(e);
    return e;
  }
  function vec(lon, lat) {
    var o = lon * Math.PI / 180, a = lat * Math.PI / 180;
    return [Math.cos(a) * Math.sin(o), -Math.sin(a), Math.cos(a) * Math.cos(o)];
  }
  function norm(p) { var l = Math.hypot(p[0], p[1], p[2]); return [p[0] / l, p[1] / l, p[2] / l]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function clampTilt(v) { return Math.max(-40, Math.min(40, v)); }

  // ── Model ──
  C.forEach(function (c, ci) {
    var d = vec(c.lon, c.lat);
    var t1 = norm(cross(d, [0, 1, 0.001])), t2 = cross(d, t1);
    c.p = d;
    c.i = ci;
    var g = make('g', { class: 'nm-node nm-node--hub', 'data-cluster': c.k }, gN);
    make('circle', { class: 'nm-hubring', r: 9 }, g);
    make('text', { class: 'nm-hubnum' }, g).textContent = '0' + (ci + 1);
    var lbl = make('text', { class: 'nm-lbl' }, g);
    lbl.textContent = c.t;
    c.n = { g: g, link: make('line', { class: 'nm-lk' }, gL), lbl: lbl, c: c, hub: true };
    c.leaves = c.s.map(function (name, j) {
      var a = j / c.s.length * Math.PI * 2 + ci + 0.4, one = c.s.length === 1;
      var lg = make('g', { class: 'nm-node nm-node--leaf', 'data-cluster': c.k }, gN);
      var dot = make('circle', { class: 'nm-leafdot', r: 3 }, lg);
      var t = make('text', { class: 'nm-lbl' }, lg);
      t.textContent = name;
      var n = {
        g: lg, link: make('line', { class: 'nm-lk nm-lk--leaf' }, gL), lbl: t, c: c, name: name,
        // position for a given spread: wider spacing when the cluster is focused
        p: function (sp) {
          var r = one ? 0 : sp, o = one ? 1.5 : 1.38;
          return [
            d[0] * o + (t1[0] * Math.cos(a) + t2[0] * Math.sin(a)) * r,
            d[1] * o + (t1[1] * Math.cos(a) + t2[1] * Math.sin(a)) * r,
            d[2] * o + (t1[2] * Math.cos(a) + t2[2] * Math.sin(a)) * r
          ];
        }
      };
      dot.addEventListener('pointerenter', function () { hover = n; });
      dot.addEventListener('pointerleave', function () { if (hover === n) hover = null; });
      return n;
    });
    c.pulse = make('circle', { class: 'nm-pulse', r: 1.8 }, gP);
    c.pt = Math.random();
    c.sp = 0.4;
  });

  // ── Index rows (labels for the radios) ──
  var rows = {};
  [].slice.call(map.querySelectorAll('.nm-row')).forEach(function (row) {
    var k = row.getAttribute('data-cluster');
    rows[k] = row;
    row.addEventListener('pointerenter', function () { preview = k; });
    row.addEventListener('pointerleave', function () { if (preview === k) preview = null; });
  });

  // ── State ──
  var yaw = 20, tilt = -8, vel = 0, dragging = false, settle = false, lx = 0, ly = 0;
  var focus = null, preview = null, hover = null;
  var visible = false, booted = reduce, bootStart = 0, last = performance.now();

  // The one approved change: a picked cluster turns to face the viewer
  function faceCluster(c) {
    if (!c) return { yaw: 0, tilt: 0 };
    return { yaw: -c.lon + 60, tilt: clampTilt(-c.lat * 0.5) };
  }

  function syncFocus() {
    var checked = map.querySelector('.nm-radio:checked');
    var k = checked && checked.id !== 'nm-all' ? checked.id.replace('nm-', '') : null;
    focus = k;
    settle = true;
    vel = 0;
    for (var key in rows) rows[key].classList.toggle('is-on', key === k);
    map.classList.toggle('has-focus', !!k);
    hudFocus.textContent = k ? BY[k].t + ' — 0' + BY[k].s.length + ' nodes' : 'All systems';
    if (reduce) C.forEach(function (c) { c.sp = c.k === k ? 0.66 : 0.4; });
  }
  map.addEventListener('change', function (e) { if (e.target.classList.contains('nm-radio')) syncFocus(); });

  // ── Drag, momentum, keyboard ──
  stage.addEventListener('pointerdown', function (e) {
    if (e.target.classList && e.target.classList.contains('nm-leafdot')) return;
    dragging = true;
    settle = false;
    vel = 0;
    lx = e.clientX;
    ly = e.clientY;
    stage.setPointerCapture(e.pointerId);
    map.classList.add('is-dragging');
  });
  stage.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    var dx = e.clientX - lx, dy = e.clientY - ly;
    lx = e.clientX;
    ly = e.clientY;
    vel = dx * 0.35;
    yaw += vel;
    tilt = clampTilt(tilt - dy * 0.25);
  });
  function end() { dragging = false; map.classList.remove('is-dragging'); }
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);

  // Arrow keys: 15° of yaw or 10° of tilt per press
  stage.addEventListener('keydown', function (e) {
    var k = e.key;
    if (k !== 'ArrowLeft' && k !== 'ArrowRight' && k !== 'ArrowUp' && k !== 'ArrowDown') return;
    e.preventDefault();
    settle = false;
    vel = 0;
    if (k === 'ArrowLeft') yaw -= 15;
    if (k === 'ArrowRight') yaw += 15;
    if (k === 'ArrowUp') tilt = clampTilt(tilt - 10);
    if (k === 'ArrowDown') tilt = clampTilt(tilt + 10);
  });

  // ── Projection and drawing ──
  function proj(p, grow) {
    var y = yaw * Math.PI / 180, t = tilt * Math.PI / 180;
    var x = p[0] * Math.cos(y) + p[2] * Math.sin(y), z = -p[0] * Math.sin(y) + p[2] * Math.cos(y);
    var yy = p[1] * Math.cos(t) - z * Math.sin(t), zz = p[1] * Math.sin(t) + z * Math.cos(t);
    var s = F / (F + zz) * grow;
    return { x: CX + x * R * s, y: CY + yy * R * s, z: zz, s: F / (F + zz) };
  }

  function deg(n) { n = Math.round(((n % 360) + 360) % 360); return ('00' + n).slice(-3) + '°'; }

  function setNode(n, p, on, pv, dim, hub, hx, hy) {
    n._z = p.z;
    n._x = p.x;
    n._y = p.y;
    var depth = 1 - (p.z + 1.6) / 3.2, sc = hub ? p.s : p.s * (on ? 1.25 : 1);
    n.g.setAttribute('transform', 'translate(' + p.x.toFixed(1) + ',' + p.y.toFixed(1) + ') scale(' + sc.toFixed(3) + ')');
    n.g.style.opacity = dim ? 0.18 : Math.max(0.3, Math.min(1, 0.35 + depth * 0.8));
    n.g.style.filter = !dim && depth < 0.35 ? 'blur(' + ((0.35 - depth) * 3).toFixed(2) + 'px)' : 'none';
    n.g.classList.toggle('is-on', on);
    n.g.classList.toggle('is-pv', pv);
    // Labels sit on the side away from the core; skills also lean away from their hub
    var ox = p.x - CX, oy = p.y - CY, L = Math.hypot(ox, oy) || 1;
    ox /= L; oy /= L;
    if (!hub) {
      var hxd = p.x - hx, hyd = p.y - hy, H = Math.hypot(hxd, hyd) || 1;
      ox += hxd / H; oy += hyd / H;
      L = Math.hypot(ox, oy) || 1;
      ox /= L; oy /= L;
    }
    var off = hub ? 16 : 9;
    n.lbl.setAttribute('x', (ox * off).toFixed(1));
    n.lbl.setAttribute('y', (oy * off + 3).toFixed(1));
    n.lbl.setAttribute('text-anchor', ox > 0.25 ? 'start' : ox < -0.25 ? 'end' : 'middle');
  }

  function line(l, x1, y1, x2, y2) {
    l.setAttribute('x1', x1); l.setAttribute('y1', y1); l.setAttribute('x2', x2); l.setAttribute('y2', y2);
  }

  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!visible && !dragging && !settle) return;

    if (!dragging) {
      if (Math.abs(vel) > 0.01) {                         // momentum after release
        yaw += vel;
        vel *= 0.94;
      } else if (settle) {
        var tg = faceCluster(focus && BY[focus]);
        var dy = ((tg.yaw - yaw) % 360 + 540) % 360 - 180;  // take the short way round
        yaw = tg.yaw - dy;
        yaw += dy * 0.12;
        tilt += (tg.tilt - tilt) * 0.12;
        if (Math.abs(dy) < 0.05 && Math.abs(tg.tilt - tilt) < 0.05) { yaw = tg.yaw; tilt = tg.tilt; settle = false; }
      } else if (!focus && !reduce && booted) {
        yaw += 2 * dt;                                    // idle drift: 2° per second
      }
    }

    map.style.setProperty('--yaw', yaw + 'deg');
    map.style.setProperty('--tilt', tilt + 'deg');
    hudYaw.textContent = deg(yaw);
    var tv = Math.round(-tilt);
    hudTilt.textContent = (tv >= 0 ? '+' : '−') + ('0' + Math.abs(tv)).slice(-2) + '°';
    tape.style.transform = 'translateX(' + (-(((yaw % 72) + 72) % 72)).toFixed(1) + 'px)';

    // Boot: nodes grow out from the core one cluster after another
    var boot = reduce ? 1 : bootStart ? Math.min(1, (now - bootStart) / 1400) : 0;
    if (boot >= 1) booted = true;

    var act = focus || preview, list = [];
    C.forEach(function (c) {
      var bi = Math.max(0, Math.min(1, boot * 1.6 - c.i * 0.12)), be = 1 - Math.pow(1 - bi, 3);
      var h = proj(c.p, be);
      var on = focus === c.k, pv = !on && preview === c.k, dim = !!act && act !== c.k;
      c.sp += ((on ? 0.66 : 0.4) - c.sp) * (reduce ? 1 : 0.1);
      setNode(c.n, h, on, pv, dim, true);
      line(c.n.link, CX, CY, h.x, h.y);
      c.n.link.setAttribute('class', 'nm-lk' + (on ? ' is-on' : pv ? ' is-pv' : ''));
      c.n.link.style.opacity = dim ? 0.25 : 0.35 + 0.65 * (1 - (h.z + 1.4) / 2.8);
      c.leaves.forEach(function (n) {
        var lp = proj(n.p(c.sp), be);
        setNode(n, lp, on, pv, dim, false, h.x, h.y);
        line(n.link, h.x, h.y, lp.x, lp.y);
        n.link.setAttribute('class', 'nm-lk nm-lk--leaf' + (on ? ' is-on' : pv ? ' is-pv' : ''));
        n.link.style.opacity = dim ? 0.15 : 0.3 + 0.7 * (1 - (lp.z + 1.6) / 3.2);
        n.g.classList.toggle('show', on);
        n.g.classList.toggle('hover', hover === n);
        list.push(n);
      });
      list.push(c.n);
      // Signal pulse from the core to the hub; faster for the focused cluster
      if (!reduce) { c.pt += dt * (on ? 0.9 : 0.35); if (c.pt > 1) c.pt = 0; }
      c.pulse.setAttribute('cx', CX + (h.x - CX) * c.pt);
      c.pulse.setAttribute('cy', CY + (h.y - CY) * c.pt);
      c.pulse.style.opacity = reduce || dim ? 0 : Math.sin(c.pt * Math.PI) * (on ? 1 : 0.6) * boot;
    });

    // Depth sort: far nodes first so near ones draw on top
    list.sort(function (a, b) { return b._z - a._z; });
    list.forEach(function (n) { gN.appendChild(n.g); });

    // Tooltip and the two-way link with the index
    var hot = map.querySelector('.nm-chip.is-hot');
    if (hot) hot.classList.remove('is-hot');
    if (hover) {
      tip.querySelector('b').textContent = hover.name;
      tip.querySelector('span').textContent = hover.c.t;
      var r = svg.getBoundingClientRect(), sr = stage.getBoundingClientRect();
      var vb = Math.min(r.width / 640, r.height / 580), ox = (r.width - 640 * vb) / 2, oy = (r.height - 580 * vb) / 2;
      tip.style.left = (hover._x * vb + ox + r.left - sr.left) + 'px';
      tip.style.top = (hover._y * vb + oy + r.top - sr.top) + 'px';
      tip.classList.add('is-on');
      var chip = rows[hover.c.k].querySelector('[data-s="' + hover.name + '"]');
      if (chip) chip.classList.add('is-hot');
    } else {
      tip.classList.remove('is-on');
    }
    for (var k in rows) rows[k].classList.toggle('is-pv', preview === k || (!!hover && hover.c.k === k));
  }

  // Only animate while the stage is on screen; boot the first time it appears
  new IntersectionObserver(function (es) {
    visible = es[0].isIntersecting;
    if (visible && !bootStart && !reduce) {
      bootStart = performance.now();
      if (FD.sound) FD.sound.play('shimmer');
    }
  }, { rootMargin: '0px 0px -10% 0px' }).observe(stage);

  syncFocus();
  settle = false;
  FD.ticker.add(frame);
})();
