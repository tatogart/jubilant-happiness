/* ПРОТОКОЛ НИША — математика и мелкая утварь */
window.NISHA = window.NISHA || {};
(function (N) {
  'use strict';

  var TAU = Math.PI * 2;
  var DEG = Math.PI / 180;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  /** Кадронезависимое сглаживание к цели. */
  function damp(a, b, lambda, dt) { return lerp(a, b, 1 - Math.exp(-lambda * dt)); }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function wrapAngle(a) {
    a %= TAU;
    if (a > Math.PI) a -= TAU;
    if (a < -Math.PI) a += TAU;
    return a;
  }
  function angleTo(x0, y0, x1, y1) { return Math.atan2(y1 - y0, x1 - x0); }
  function dist(x0, y0, x1, y1) { var dx = x1 - x0, dy = y1 - y0; return Math.sqrt(dx * dx + dy * dy); }
  function dist2(x0, y0, x1, y1) { var dx = x1 - x0, dy = y1 - y0; return dx * dx + dy * dy; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function randInt(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
  function chance(p) { return Math.random() < p; }

  /** ABGR-упаковка для Uint32-буфера кадра. */
  function packRGB(r, g, b) {
    return (255 << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255);
  }
  function hexToRGB(hex) {
    var v = parseInt(hex.replace('#', ''), 16);
    return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
  }
  function packHex(hex) { var c = hexToRGB(hex); return packRGB(c.r, c.g, c.b); }
  function mixHex(a, b, t) {
    var A = hexToRGB(a), B = hexToRGB(b);
    return 'rgb(' + Math.round(lerp(A.r, B.r, t)) + ',' + Math.round(lerp(A.g, B.g, t)) + ',' +
      Math.round(lerp(A.b, B.b, t)) + ')';
  }
  function rgba(hex, a) {
    var c = hexToRGB(hex);
    return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')';
  }

  /** Форматирование секунд в MM:SS. */
  function timecode(sec) {
    sec = Math.max(0, sec | 0);
    var m = (sec / 60) | 0, s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  /** Детерминированный генератор — для шума текстур. */
  function Rng(seed) {
    this.s = (seed >>> 0) || 1;
  }
  Rng.prototype.next = function () {
    // xorshift32
    var x = this.s;
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5; x >>>= 0;
    this.s = x;
    return x / 4294967296;
  };
  Rng.prototype.range = function (a, b) { return a + this.next() * (b - a); };
  Rng.prototype.int = function (a, b) { return Math.floor(this.range(a, b + 1)); };

  var store = {
    read: function (key, fallback) {
      try {
        var raw = localStorage.getItem('nisha.' + key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    write: function (key, value) {
      try { localStorage.setItem('nisha.' + key, JSON.stringify(value)); } catch (e) { /* приватный режим */ }
    }
  };

  N.U = {
    TAU: TAU, DEG: DEG,
    clamp: clamp, lerp: lerp, damp: damp, smooth: smooth, wrapAngle: wrapAngle,
    angleTo: angleTo, dist: dist, dist2: dist2,
    rand: rand, randInt: randInt, pick: pick, chance: chance,
    packRGB: packRGB, packHex: packHex, hexToRGB: hexToRGB, mixHex: mixHex, rgba: rgba,
    timecode: timecode, Rng: Rng, store: store
  };
})(window.NISHA);
