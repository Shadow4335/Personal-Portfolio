  (function () {
    var map = document.querySelector('.neural');
    if (!map) return;
    var stage = map.querySelector('.nm-stage');
    var yaw = 0, tilt = 0, vel = 0;          // degrees
    var dragging = false, lastX = 0, lastY = 0, settle = false;

    function apply() {
      map.style.setProperty('--yaw', yaw + 'deg');
      map.style.setProperty('--tilt', tilt + 'deg');
    }

    stage.addEventListener('pointerdown', function (e) {
      dragging = true;
      settle = false;
      vel = 0;
      lastX = e.clientX;
      lastY = e.clientY;
      stage.setPointerCapture(e.pointerId);
      map.classList.add('is-dragging');
    });

    stage.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      vel = dx * 0.35;
      yaw += vel;
      tilt = Math.max(-40, Math.min(40, tilt - dy * 0.25));
      apply();
    });

    function end() {
      if (!dragging) return;
      dragging = false;
      map.classList.remove('is-dragging');
    }
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);

    // Picking a cluster eases the drag offset back to zero so it centres
    map.addEventListener('change', function () { settle = true; vel = 0; });

    (function frame() {
      if (!dragging) {
        if (Math.abs(vel) > 0.01) {        // momentum after release
          yaw += vel;
          vel *= 0.94;
          apply();
        }
        if (settle) {
          yaw -= Math.round(yaw / 360) * 360; // take the short way home
          yaw *= 0.88;
          tilt *= 0.88;
          if (Math.abs(yaw) < 0.05 && Math.abs(tilt) < 0.05) { yaw = tilt = 0; settle = false; }
          apply();
        }
      }
      requestAnimationFrame(frame);
    })();
  })();
