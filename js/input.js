/* ПРОТОКОЛ НИША — клавиатура, мышь, захват указателя */
(function (N) {
  'use strict';

  var I = {
    keys: Object.create(null),
    pressed: Object.create(null),   // нажатия текущего кадра
    mouse: { dx: 0, dy: 0, left: false, right: false, leftEdge: false, rightEdge: false },
    locked: false,
    sensitivity: N.U.store.read('sens', 1),
    invertY: N.U.store.read('invertY', false),
    onLockChange: null,
    enabled: true
  };

  var CODE_ALIAS = {
    KeyW: 'up', ArrowUp: 'up',
    KeyS: 'down', ArrowDown: 'down',
    KeyA: 'left', ArrowLeft: 'left',
    KeyD: 'right', ArrowRight: 'right',
    ShiftLeft: 'read', ShiftRight: 'read',
    Space: 'dash',
    KeyF: 'possess', KeyE: 'possess',
    KeyR: 'reload',
    Tab: 'objective',
    Escape: 'pause'
  };

  function alias(code) { return CODE_ALIAS[code] || null; }

  I.down = function (name) { return !!I.keys[name]; };
  I.hit = function (name) { return !!I.pressed[name]; };

  /** Вызывается в конце кадра: одноразовые нажатия сгорают. */
  I.endFrame = function () {
    I.pressed = Object.create(null);
    I.mouse.dx = 0; I.mouse.dy = 0;
    I.mouse.leftEdge = false; I.mouse.rightEdge = false;
  };

  I.clear = function () {
    I.keys = Object.create(null);
    I.pressed = Object.create(null);
    I.mouse.left = I.mouse.right = false;
  };

  I.attach = function (el) {
    I.el = el;

    window.addEventListener('keydown', function (e) {
      var a = alias(e.code);
      if (e.code === 'Tab' || (e.code === 'Space' && I.locked)) e.preventDefault();
      if (!a) return;
      if (!I.keys[a]) I.pressed[a] = true;
      I.keys[a] = true;
    });

    window.addEventListener('keyup', function (e) {
      var a = alias(e.code);
      if (a) I.keys[a] = false;
    });

    window.addEventListener('blur', function () { I.clear(); });

    el.addEventListener('mousedown', function (e) {
      if (!I.locked) return;
      e.preventDefault();
      if (e.button === 0) { if (!I.mouse.left) I.mouse.leftEdge = true; I.mouse.left = true; }
      if (e.button === 2) { if (!I.mouse.right) I.mouse.rightEdge = true; I.mouse.right = true; }
    });

    window.addEventListener('mouseup', function (e) {
      if (e.button === 0) I.mouse.left = false;
      if (e.button === 2) I.mouse.right = false;
    });

    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    document.addEventListener('mousemove', function (e) {
      if (!I.locked) return;
      I.mouse.dx += e.movementX || 0;
      I.mouse.dy += e.movementY || 0;
    });

    document.addEventListener('pointerlockchange', function () {
      I.locked = document.pointerLockElement === el;
      if (!I.locked) I.clear();
      if (I.onLockChange) I.onLockChange(I.locked);
    });
  };

  I.requestLock = function () {
    if (!I.el || I.locked) return;
    var p = I.el.requestPointerLock && I.el.requestPointerLock();
    if (p && p.catch) p.catch(function () { /* браузер отказал — не страшно */ });
  };

  I.releaseLock = function () {
    if (document.pointerLockElement) document.exitPointerLock();
  };

  I.setSensitivity = function (v) {
    I.sensitivity = N.U.clamp(v, 0.2, 3);
    N.U.store.write('sens', I.sensitivity);
  };

  I.setInvert = function (v) {
    I.invertY = !!v;
    N.U.store.write('invertY', I.invertY);
  };

  N.Input = I;
})(window.NISHA);
