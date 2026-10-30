(function () {
  // One requestAnimationFrame loop for the whole site. Modules subscribe
  // with FD.ticker.add(fn); fn(now, dt) gets dt in 60fps frames (capped at 4).
  var FD = window.FD = window.FD || {};
  var subs = [];
  var last = performance.now();

  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min((now - last) / 16.67, 4);
    last = now;
    // One failing subscriber must not stop the others
    for (var i = 0; i < subs.length; i++) {
      try { subs[i](now, dt); } catch (e) { if (window.console) console.error(e); subs.splice(i--, 1); }
    }
  }

  FD.ticker = {
    add: function (fn) { subs.push(fn); },
    remove: function (fn) { var i = subs.indexOf(fn); if (i > -1) subs.splice(i, 1); }
  };

  FD.reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  FD.finePointer = matchMedia('(hover: hover) and (pointer: fine)');

  requestAnimationFrame(frame);
})();
