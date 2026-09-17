/* ПРОТОКОЛ НИША — запуск */
(function (N) {
  'use strict';

  var RES = [[320, 180], [480, 270], [640, 360], [800, 450]];

  function boot() {
    N.Tex.build();

    var view = document.getElementById('view');
    var hudCanvas = document.getElementById('hud');
    var stage = document.getElementById('stage');
    var hint = document.getElementById('lock-hint');

    var game = new N.Game(view, hudCanvas);
    var resIdx = N.U.clamp(N.U.store.read('resIndex', 1), 0, RES.length - 1);
    game.renderer.setResolution(RES[resIdx][0], RES[resIdx][1]);

    function resize() {
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      game.hud.resize(stage.clientWidth, stage.clientHeight, dpr);
    }
    window.addEventListener('resize', resize);
    resize();

    N.Input.attach(stage);
    N.Input.onLockChange = function (locked) {
      hint.hidden = locked || game.state !== 'playing';
      if (!locked && game.state === 'playing') N.UI.pause();
    };

    stage.addEventListener('mousedown', function () {
      if (game.state === 'playing' && !N.Input.locked) {
        N.Audio.resume();
        N.Input.requestLock();
      }
    });

    N.UI.init(game);

    var last = performance.now();
    function frame(now) {
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      if (game.state === 'playing') {
        hint.hidden = N.Input.locked;
        if (N.Input.locked) {
          if (N.Input.hit('pause')) N.UI.pause();
          else game.update(dt, N.Input);
        }
      }
      if (game.map) game.draw();
      N.Input.endFrame();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    // первая же клавиша или клик будят звук (политика браузеров)
    function wake() {
      N.Audio.resume();
      window.removeEventListener('keydown', wake);
      window.removeEventListener('mousedown', wake);
    }
    window.addEventListener('keydown', wake);
    window.addEventListener('mousedown', wake);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.NISHA);
