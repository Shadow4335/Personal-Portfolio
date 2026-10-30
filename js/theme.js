(function () {
  // Night flight (dark, default) and Day flight (light), with a circular wipe
  var root = document.documentElement;
  var btn = document.querySelector('.theme-toggle');
  if (!btn) return;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)');

  function current() { return root.getAttribute('data-theme') === 'light' ? 'light' : 'dark'; }

  function sync() {
    var day = current() === 'light';
    btn.setAttribute('aria-pressed', String(day));
    btn.setAttribute('aria-label', day ? 'Switch to Night flight' : 'Switch to Day flight');
  }

  function set(theme) {
    root.setAttribute('data-theme', theme);
    try { localStorage.setItem('fd-theme', theme); } catch (e) {}
    sync();
    document.dispatchEvent(new CustomEvent('fd:theme', { detail: theme }));
  }

  btn.addEventListener('click', function () {
    var next = current() === 'light' ? 'dark' : 'light';
    if (!document.startViewTransition || reduce.matches) { set(next); return; }

    // The wipe grows from the toggle to the farthest corner of the viewport
    var r = btn.getBoundingClientRect();
    var x = r.left + r.width / 2, y = r.top + r.height / 2;
    var radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    root.style.setProperty('--wipe-x', x + 'px');
    root.style.setProperty('--wipe-y', y + 'px');
    root.style.setProperty('--wipe-r', radius + 'px');
    document.startViewTransition(function () { set(next); });
  });

  sync();
})();
