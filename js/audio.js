/* ПРОТОКОЛ НИША — весь звук синтезируется на лету, файлов нет */
(function (N) {
  'use strict';

  var A = {
    ctx: null,
    master: null,
    lp: null,          // общий фильтр: проседает при растяжении времени
    noiseBuf: null,
    music: null,
    volume: N.U.store.read('volume', 0.7),
    enabled: true,
    _slow: 0
  };

  A.init = function () {
    if (A.ctx) return;
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) { A.enabled = false; return; }
    A.ctx = new Ctx();
    A.lp = A.ctx.createBiquadFilter();
    A.lp.type = 'lowpass';
    A.lp.frequency.value = 18000;
    A.master = A.ctx.createGain();
    A.master.gain.value = A.volume;
    A.lp.connect(A.master);
    A.master.connect(A.ctx.destination);

    var len = A.ctx.sampleRate * 1.2;
    A.noiseBuf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
    var d = A.noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  };

  A.resume = function () {
    A.init();
    if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume();
  };

  A.setVolume = function (v) {
    A.volume = N.U.clamp(v, 0, 1);
    N.U.store.write('volume', A.volume);
    if (A.master) A.master.gain.setTargetAtTime(A.volume, A.ctx.currentTime, 0.05);
  };

  /** slow: 0 — обычное время, 1 — полное растяжение. Глушит верх и уводит гул вниз. */
  A.setSlow = function (slow) {
    A._slow = slow;
    if (!A.ctx) return;
    var t = A.ctx.currentTime;
    A.lp.frequency.setTargetAtTime(N.U.lerp(18000, 900, slow), t, 0.08);
    if (A.music) {
      A.music.a.detune.setTargetAtTime(N.U.lerp(0, -900, slow), t, 0.12);
      A.music.b.detune.setTargetAtTime(N.U.lerp(7, -880, slow), t, 0.12);
      A.music.pulse.gain.setTargetAtTime(N.U.lerp(0.06, 0.015, slow), t, 0.12);
    }
  };

  function env(node, t0, peak, attack, decay) {
    node.gain.setValueAtTime(0.0001, t0);
    node.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
    node.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  /** Короткий тон с огибающей. */
  A.tone = function (freq, dur, opts) {
    if (!A.enabled) return;
    A.init(); if (!A.ctx) return;
    opts = opts || {};
    var t = A.ctx.currentTime;
    var o = A.ctx.createOscillator();
    var g = A.ctx.createGain();
    o.type = opts.type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t + dur);
    env(g, t, (opts.gain == null ? 0.22 : opts.gain), opts.attack || 0.004, dur);
    o.connect(g); g.connect(A.lp);
    o.start(t); o.stop(t + dur + 0.05);
  };

  /** Шумовой всплеск через полосовой фильтр. */
  A.noise = function (dur, opts) {
    if (!A.enabled) return;
    A.init(); if (!A.ctx) return;
    opts = opts || {};
    var t = A.ctx.currentTime;
    var s = A.ctx.createBufferSource();
    s.buffer = A.noiseBuf;
    s.playbackRate.value = opts.rate || 1;
    var f = A.ctx.createBiquadFilter();
    f.type = opts.filter || 'bandpass';
    f.frequency.setValueAtTime(opts.freq || 1200, t);
    if (opts.freqTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, opts.freqTo), t + dur);
    f.Q.value = opts.q || 1.2;
    var g = A.ctx.createGain();
    env(g, t, opts.gain == null ? 0.2 : opts.gain, opts.attack || 0.003, dur);
    s.connect(f); f.connect(g); g.connect(A.lp);
    s.start(t); s.stop(t + dur + 0.05);
  };

  /* ---------- игровые события ---------- */

  A.shot = function (kind) {
    switch (kind) {
      case 'smg':
        A.noise(0.07, { freq: 2600, freqTo: 700, gain: 0.16, q: 0.8 });
        A.tone(210, 0.05, { type: 'square', to: 90, gain: 0.1 });
        break;
      case 'shotgun':
        A.noise(0.26, { freq: 1500, freqTo: 180, gain: 0.34, q: 0.6 });
        A.tone(96, 0.22, { type: 'sawtooth', to: 42, gain: 0.2 });
        break;
      case 'rifle':
        A.noise(0.18, { freq: 4200, freqTo: 500, gain: 0.26, q: 1.6 });
        A.tone(420, 0.14, { type: 'square', to: 70, gain: 0.14 });
        break;
      case 'melee':
        A.noise(0.12, { freq: 3200, freqTo: 900, gain: 0.2, q: 3 });
        break;
      default:
        A.noise(0.1, { freq: 2100, freqTo: 480, gain: 0.22, q: 1 });
        A.tone(300, 0.08, { type: 'square', to: 110, gain: 0.13 });
    }
  };

  A.dry = function () { A.tone(150, 0.05, { type: 'square', gain: 0.07 }); };
  A.reload = function () {
    A.tone(520, 0.05, { type: 'square', gain: 0.08 });
    setTimeout(function () { A.tone(360, 0.07, { type: 'square', gain: 0.09 }); }, 130);
  };
  A.hit = function () { A.noise(0.08, { freq: 900, freqTo: 300, gain: 0.16, q: 2 }); };
  A.hitWeak = function () { A.noise(0.05, { freq: 600, freqTo: 250, gain: 0.08, q: 2 }); };
  A.kill = function () {
    A.noise(0.3, { freq: 700, freqTo: 120, gain: 0.22, q: 0.7 });
    A.tone(180, 0.28, { type: 'triangle', to: 55, gain: 0.14 });
  };
  A.exec = function () {
    A.tone(1380, 0.07, { type: 'square', gain: 0.2 });
    A.tone(920, 0.16, { type: 'sawtooth', to: 200, gain: 0.18 });
    A.noise(0.34, { freq: 2600, freqTo: 140, gain: 0.24, q: 0.8 });
  };
  A.readTick = function (level) {
    A.tone(520 + level * 620, 0.05, { type: 'sine', gain: 0.07 });
  };
  A.readDone = function () {
    A.tone(880, 0.09, { type: 'sine', gain: 0.14 });
    A.tone(1320, 0.16, { type: 'sine', gain: 0.1 });
  };
  A.slowIn = function () { A.tone(300, 0.3, { type: 'sine', to: 120, gain: 0.1 }); };
  A.slowOut = function () { A.tone(160, 0.22, { type: 'sine', to: 420, gain: 0.08 }); };
  A.hurt = function () {
    A.noise(0.2, { freq: 420, freqTo: 110, gain: 0.26, q: 0.8, filter: 'lowpass' });
    A.tone(120, 0.16, { type: 'sawtooth', to: 60, gain: 0.12 });
  };
  A.possess = function () {
    A.tone(90, 0.5, { type: 'sawtooth', to: 700, gain: 0.2 });
    A.noise(0.5, { freq: 200, freqTo: 5200, gain: 0.2, q: 0.6 });
    A.tone(1500, 0.3, { type: 'sine', to: 400, gain: 0.1 });
  };
  A.death = function () {
    A.tone(420, 1.1, { type: 'sawtooth', to: 30, gain: 0.26 });
    A.noise(1.2, { freq: 1800, freqTo: 60, gain: 0.22, q: 0.5 });
  };
  A.ui = function () { A.tone(660, 0.04, { type: 'square', gain: 0.07 }); };
  A.alarm = function () { A.tone(240, 0.5, { type: 'sawtooth', to: 180, gain: 0.12 }); };
  A.step = function () { A.noise(0.05, { freq: 260, freqTo: 120, gain: 0.05, filter: 'lowpass', q: 0.6 }); };
  A.dash = function () { A.noise(0.22, { freq: 900, freqTo: 2600, gain: 0.12, q: 0.7 }); };
  A.telegraph = function () { A.tone(1180, 0.07, { type: 'sine', gain: 0.05 }); };

  /** Фоновый гул уровня. */
  A.startMusic = function (root) {
    A.init(); if (!A.ctx || A.music) return;
    var t = A.ctx.currentTime;
    var g = A.ctx.createGain(); g.gain.value = 0.0001;
    g.gain.exponentialRampToValueAtTime(0.09, t + 3);
    var a = A.ctx.createOscillator(); a.type = 'sawtooth'; a.frequency.value = root || 55;
    var b = A.ctx.createOscillator(); b.type = 'sawtooth'; b.frequency.value = (root || 55) * 1.5; b.detune.value = 7;
    var f = A.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 340; f.Q.value = 4;
    var lfo = A.ctx.createOscillator(); lfo.frequency.value = 0.07;
    var lfoG = A.ctx.createGain(); lfoG.gain.value = 180;
    lfo.connect(lfoG); lfoG.connect(f.frequency);
    var pulse = A.ctx.createGain(); pulse.gain.value = 0.06;
    a.connect(f); b.connect(f); f.connect(pulse); pulse.connect(g); g.connect(A.lp);
    a.start(t); b.start(t); lfo.start(t);
    A.music = { a: a, b: b, g: g, lfo: lfo, pulse: pulse, f: f };
  };

  A.stopMusic = function () {
    if (!A.music || !A.ctx) return;
    var m = A.music, t = A.ctx.currentTime;
    A.music = null;
    m.g.gain.cancelScheduledValues(t);
    m.g.gain.setValueAtTime(Math.max(0.0002, m.g.gain.value), t);
    m.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    setTimeout(function () {
      try { m.a.stop(); m.b.stop(); m.lfo.stop(); } catch (e) { /* уже остановлено */ }
    }, 1000);
  };

  /** Дрейф личности расстраивает гул. */
  A.setDrift = function (drift) {
    if (!A.music || !A.ctx) return;
    A.music.b.detune.setTargetAtTime(7 + drift * 11, A.ctx.currentTime, 0.5);
  };

  N.Audio = A;
})(window.NISHA);
