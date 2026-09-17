/* ПРОТОКОЛ НИША — процедурные текстуры и спрайты. Внешних ассетов нет. */
(function (N) {
  'use strict';

  var U = N.U;
  var T = { wall: {}, flat: {}, sprite: {}, ready: false };

  function surface(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    return { c: c, g: g };
  }

  function bake(w, h, draw) {
    var s = surface(w, h);
    draw(s.g, w, h);
    var img = s.g.getImageData(0, 0, w, h);
    return { w: w, h: h, data: new Uint32Array(img.data.buffer) };
  }

  /* ---------------- стены ---------------- */

  function grime(g, w, h, seed, amount, color) {
    var rng = new U.Rng(seed);
    for (var i = 0; i < amount; i++) {
      var x = rng.range(0, w), y = rng.range(0, h), r = rng.range(0.6, 3.4);
      g.fillStyle = color.replace('%a', rng.range(0.03, 0.14).toFixed(3));
      g.beginPath(); g.arc(x, y, r, 0, U.TAU); g.fill();
    }
  }

  function wallPlate(base, seam, glow) {
    return function (g, w, h) {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      // вертикальные панели
      g.fillStyle = seam;
      for (var x = 0; x < w; x += 16) g.fillRect(x, 0, 1, h);
      g.fillRect(0, h / 2 | 0, w, 1);
      // фаски
      g.fillStyle = 'rgba(255,255,255,0.05)';
      for (x = 0; x < w; x += 16) g.fillRect(x + 1, 0, 1, h);
      // заклёпки
      g.fillStyle = 'rgba(0,0,0,0.45)';
      for (x = 8; x < w; x += 16) {
        for (var y = 8; y < h; y += 24) { g.beginPath(); g.arc(x, y, 1.3, 0, U.TAU); g.fill(); }
      }
      if (glow) {
        g.fillStyle = glow;
        g.fillRect(0, h - 7, w, 2);
      }
      grime(g, w, h, 1337, 160, 'rgba(0,0,0,%a)');
    };
  }

  function wallConcrete(base) {
    return function (g, w, h) {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      var rng = new U.Rng(77);
      for (var i = 0; i < 60; i++) {
        g.fillStyle = 'rgba(255,255,255,' + rng.range(0.01, 0.05).toFixed(3) + ')';
        g.fillRect(rng.range(0, w), rng.range(0, h), rng.range(2, 18), rng.range(1, 7));
      }
      // трещины
      g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1;
      for (i = 0; i < 4; i++) {
        var x = rng.range(0, w), y = rng.range(0, h);
        g.beginPath(); g.moveTo(x, y);
        for (var s = 0; s < 6; s++) { x += rng.range(-7, 7); y += rng.range(2, 9); g.lineTo(x, y); }
        g.stroke();
      }
      grime(g, w, h, 4242, 220, 'rgba(0,0,0,%a)');
    };
  }

  function wallData(base, glow) {
    return function (g, w, h) {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      var rng = new U.Rng(909);
      for (var y = 3; y < h - 3; y += 6) {
        for (var x = 3; x < w - 3; x += 4) {
          var on = rng.next();
          if (on > 0.72) {
            g.fillStyle = glow.replace('%a', (0.25 + on * 0.6).toFixed(2));
            g.fillRect(x, y, 2, 3);
          } else {
            g.fillStyle = 'rgba(0,0,0,0.4)';
            g.fillRect(x, y, 2, 3);
          }
        }
      }
      g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 2;
      g.strokeRect(1, 1, w - 2, h - 2);
    };
  }

  function wallGrate(base, rim) {
    return function (g, w, h) {
      g.fillStyle = '#04070a'; g.fillRect(0, 0, w, h);
      g.fillStyle = base;
      for (var x = 0; x < w; x += 8) g.fillRect(x, 0, 5, h);
      g.fillStyle = rim;
      for (x = 0; x < w; x += 8) g.fillRect(x, 0, 1, h);
      g.fillStyle = 'rgba(0,0,0,0.55)';
      for (var y = 0; y < h; y += 21) g.fillRect(0, y, w, 3);
    };
  }

  function wallFlesh(base, vein) {
    return function (g, w, h) {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      var rng = new U.Rng(555);
      for (var i = 0; i < 26; i++) {
        g.strokeStyle = vein.replace('%a', rng.range(0.08, 0.3).toFixed(2));
        g.lineWidth = rng.range(0.7, 2.4);
        var x = rng.range(0, w), y = rng.range(0, h);
        g.beginPath(); g.moveTo(x, y);
        for (var s = 0; s < 5; s++) { x += rng.range(-10, 10); y += rng.range(-10, 10); g.lineTo(x, y); }
        g.stroke();
      }
      grime(g, w, h, 8181, 200, 'rgba(0,0,0,%a)');
    };
  }

  function wallExit(base, glow) {
    return function (g, w, h) {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      for (var i = 0; i < 6; i++) {
        g.fillStyle = glow.replace('%a', (0.1 + i * 0.12).toFixed(2));
        g.fillRect(4 + i * 2, 4 + i * 2, w - 8 - i * 4, h - 8 - i * 4);
      }
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.fillRect(w / 2 - 1, 6, 2, h - 12);
    };
  }

  /* ---------------- пол и потолок ---------------- */

  function flatTile(base, line, lineColor) {
    return function (g, w, h) {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      if (line) {
        g.fillStyle = lineColor;
        g.fillRect(0, 0, w, 1); g.fillRect(0, 0, 1, h);
      }
      grime(g, w, h, 2024, 140, 'rgba(0,0,0,%a)');
      g.fillStyle = 'rgba(255,255,255,0.03)';
      g.fillRect(2, 2, w - 4, 1);
    };
  }

  function flatGlow(base, glow) {
    return function (g, w, h) {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      g.fillStyle = glow;
      g.fillRect(0, h / 2 - 2, w, 4);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(0, h / 2 - 1, w, 1);
      grime(g, w, h, 616, 80, 'rgba(0,0,0,%a)');
    };
  }


  function flatCeiling(base, panel, glow) {
    return function (g, w, h) {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      g.fillStyle = panel;
      g.fillRect(6, 6, w - 12, h - 12);
      var grd = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w * 0.45);
      grd.addColorStop(0, glow.replace('%a', '0.85'));
      grd.addColorStop(0.55, glow.replace('%a', '0.28'));
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.fillRect(4, 4, w - 8, h - 8);
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(0, 0, w, 4); g.fillRect(0, 0, 4, h);
      g.fillRect(0, h - 4, w, 4); g.fillRect(w - 4, 0, 4, h);
    };
  }

  /* ---------------- фигуры ---------------- */

  function limb(g, x0, y0, x1, y1, width, color) {
    g.strokeStyle = color;
    g.lineWidth = width;
    g.lineCap = 'round';
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  }

  /**
   * Силуэт носителя. pal: {dark, mid, rim, core, visor}
   * pose: {lean, legSplit, armAngle, armExt, crouch, coreGlow, flash, dead, arms}
   */
  function figure(pal, pose) {
    return function (g, W, H) {
      g.clearRect(0, 0, W, H);
      var cx = W / 2, ground = H - 3;

      if (pose.dead) {
        // осевшая груда — то, что остаётся от носителя
        g.fillStyle = U.rgba(pal.rim, 0.14);
        g.beginPath(); g.ellipse(cx, ground - 6, W * 0.4, 10, 0, 0, U.TAU); g.fill();
        g.fillStyle = pal.dark;
        g.beginPath(); g.ellipse(cx, ground - 5, W * 0.34, 7, 0, 0, U.TAU); g.fill();
        g.fillStyle = pal.mid;
        g.beginPath(); g.ellipse(cx - 3, ground - 9, W * 0.24, 6, -0.3, 0, U.TAU); g.fill();
        limb(g, cx - 10, ground - 7, cx - 18, ground - 2, 4, pal.dark);
        limb(g, cx + 9, ground - 8, cx + 17, ground - 3, 4, pal.dark);
        g.fillStyle = pal.dark;
        g.beginPath(); g.arc(cx + 12, ground - 12, 5, 0, U.TAU); g.fill();
        g.fillStyle = U.rgba(pal.core, 0.35);
        g.beginPath(); g.arc(cx - 2, ground - 10, 3.2, 0, U.TAU); g.fill();
        return;
      }

      var sc = pose.crouch ? 0.88 : 1;
      var lean = pose.lean || 0;
      var hipY = ground - 24 * sc;
      var shY = hipY - 21 * sc;
      var headY = shY - 9 * sc;
      var split = pose.legSplit || 0;
      var aa = pose.armAngle == null ? 0.9 : pose.armAngle;
      var ext = pose.armExt == null ? 12 : pose.armExt;
      var sx = cx + 5 + lean, sy = shY + 3;
      var hx = sx + Math.cos(aa) * ext, hy = sy + Math.sin(aa) * ext;

      // ореол: узел виден даже в темноте — иначе его нечем читать
      function halo() {
        var glow = U.rgba(pal.rim, 0.22);
        limb(g, cx - 3, hipY, cx - 5 - split, ground, 11 * sc, glow);
        limb(g, cx + 3, hipY, cx + 5 + split, ground, 11 * sc, glow);
        limb(g, cx, shY + 2, cx, hipY, 24 * sc, glow);
        g.fillStyle = glow;
        g.beginPath(); g.arc(cx + lean * 1.4, headY, 9 * sc, 0, U.TAU); g.fill();
        if (pose.arms === 'wide') {
          limb(g, cx - 6 + lean, sy, cx - 18, sy + 6, 8 * sc, glow);
          limb(g, cx + 6 + lean, sy, cx + 18, sy + 6, 8 * sc, glow);
        } else {
          limb(g, sx, sy, hx, hy, 9 * sc, glow);
        }
      }
      halo();

      // ноги
      limb(g, cx - 3, hipY, cx - 5 - split, ground, 7 * sc, pal.mid);
      limb(g, cx + 3, hipY, cx + 5 + split, ground, 7 * sc, pal.dark);

      // торс
      var tg = g.createLinearGradient(cx - 10, shY, cx + 10, hipY);
      tg.addColorStop(0, pal.mid);
      tg.addColorStop(1, pal.dark);
      g.fillStyle = tg;
      g.beginPath();
      g.moveTo(cx - 9 + lean, shY);
      g.lineTo(cx + 9 + lean, shY);
      g.lineTo(cx + 7, hipY + 2);
      g.lineTo(cx - 7, hipY + 2);
      g.closePath(); g.fill();

      // подсветка контура слева
      g.strokeStyle = pal.rim; g.lineWidth = 1.4;
      g.globalAlpha = 0.8;
      g.beginPath();
      g.moveTo(cx - 9 + lean, shY); g.lineTo(cx - 7, hipY + 2); g.stroke();
      g.globalAlpha = 1;

      // голова + визор
      g.fillStyle = pal.mid;
      g.beginPath(); g.arc(cx + lean * 1.4, headY, 6.2 * sc, 0, U.TAU); g.fill();
      g.strokeStyle = pal.rim; g.lineWidth = 1; g.globalAlpha = 0.6;
      g.beginPath(); g.arc(cx + lean * 1.4, headY, 6.2 * sc, 2.2, 5.2); g.stroke();
      g.globalAlpha = 1;
      g.fillStyle = pal.visor;
      g.fillRect(cx - 5 + lean * 1.4, headY - 2, 10, 3.2);
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.fillRect(cx - 5 + lean * 1.4, headY - 2, 3, 1.2);

      // руки и оружие
      if (pose.arms === 'wide') {
        limb(g, cx - 6 + lean, sy, cx - 18, sy + 6, 4.6 * sc, pal.mid);
        limb(g, cx + 6 + lean, sy, cx + 18, sy + 6, 4.6 * sc, pal.mid);
      } else {
        limb(g, cx - 5 + lean, sy, hx - 4, hy + 1, 4.6 * sc, pal.dark);
        limb(g, sx, sy, hx, hy, 5 * sc, pal.mid);
        g.save();
        g.translate(hx, hy); g.rotate(aa);
        g.fillStyle = '#1d2a36'; g.fillRect(-3, -2.5, 15, 5);
        g.fillStyle = '#0e151c'; g.fillRect(-5, -1, 6, 6);
        g.fillStyle = pal.rim; g.fillRect(9, -1, 3, 2);
        g.restore();
        if (pose.flash) {
          var fx = hx + Math.cos(aa) * 14, fy = hy + Math.sin(aa) * 14;
          var grd = g.createRadialGradient(fx, fy, 0, fx, fy, 12);
          grd.addColorStop(0, 'rgba(255,255,235,0.95)');
          grd.addColorStop(0.4, U.rgba(pal.core, 0.75));
          grd.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = grd;
          g.beginPath(); g.arc(fx, fy, 12, 0, U.TAU); g.fill();
        }
      }

      // ядро паттерна — то, что читается и что вскрывается в окне
      var cg = pose.coreGlow == null ? 0.35 : pose.coreGlow;
      var ccx = cx + lean, ccy = shY + 7;
      var r = 3 + cg * 4.5;
      var cgrd = g.createRadialGradient(ccx, ccy, 0, ccx, ccy, r * 2.4);
      cgrd.addColorStop(0, U.rgba(pal.core, 0.45 + cg * 0.55));
      cgrd.addColorStop(0.45, U.rgba(pal.core, 0.3 + cg * 0.4));
      cgrd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = cgrd;
      g.beginPath(); g.arc(ccx, ccy, r * 2.4, 0, U.TAU); g.fill();
      g.fillStyle = cg > 0.7 ? '#ffffff' : pal.core;
      g.beginPath(); g.arc(ccx, ccy, 1.8 + cg * 1.5, 0, U.TAU); g.fill();
    };
  }

  var POSES = {
    idle: { armAngle: 1.15, armExt: 10, coreGlow: 0.3 },
    walk: { armAngle: 1.0, armExt: 11, legSplit: 7, lean: 0.6, coreGlow: 0.32 },
    tell: { armAngle: 0.1, armExt: 14, lean: 1.6, coreGlow: 0.62, legSplit: 3 },
    fire: { armAngle: -0.06, armExt: 15, lean: 2.2, coreGlow: 0.8, flash: true, legSplit: 4 },
    open: { arms: 'wide', coreGlow: 1, lean: -1.2, legSplit: 2 },
    hurt: { armAngle: 1.7, armExt: 9, lean: -2.6, coreGlow: 0.5, crouch: true },
    dead: { dead: true }
  };

  /* ---------------- эффекты ---------------- */

  function blob(color, soft) {
    return function (g, w, h) {
      var grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      grd.addColorStop(0, 'rgba(255,255,255,0.95)');
      grd.addColorStop(soft || 0.3, color);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
    };
  }

  function beacon(color) {
    return function (g, w, h) {
      var grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, 'rgba(0,0,0,0)');
      grd.addColorStop(0.35, U.rgba(color, 0.45));
      grd.addColorStop(1, U.rgba(color, 0.9));
      g.fillStyle = grd;
      g.fillRect(w * 0.3, 0, w * 0.4, h);
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.fillRect(w * 0.46, h * 0.2, w * 0.08, h * 0.8);
    };
  }

  function terminal(color) {
    return function (g, w, h) {
      g.fillStyle = '#0d141b'; g.fillRect(w * 0.18, h * 0.25, w * 0.64, h * 0.75);
      g.fillStyle = '#1a2530'; g.fillRect(w * 0.22, h * 0.3, w * 0.56, h * 0.36);
      g.fillStyle = U.rgba(color, 0.8);
      for (var i = 0; i < 5; i++) g.fillRect(w * 0.26, h * (0.34 + i * 0.06), w * (0.1 + (i % 3) * 0.12), 2);
      g.fillStyle = '#05080b'; g.fillRect(w * 0.22, h * 0.72, w * 0.56, h * 0.2);
      g.fillStyle = U.rgba(color, 0.5); g.fillRect(w * 0.18, h * 0.25, w * 0.64, 2);
    };
  }

  function pillar(color) {
    return function (g, w, h) {
      g.fillStyle = '#10181f'; g.fillRect(w * 0.3, 0, w * 0.4, h);
      g.fillStyle = U.rgba(color, 0.85); g.fillRect(w * 0.38, h * 0.08, w * 0.24, h * 0.5);
      g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(w * 0.44, h * 0.1, w * 0.12, h * 0.4);
      g.fillStyle = '#080c10'; g.fillRect(w * 0.24, h * 0.9, w * 0.52, h * 0.1);
    };
  }

  function niche(color) {
    return function (g, w, h) {
      g.fillStyle = 'rgba(8,12,17,0.9)';
      g.beginPath(); g.ellipse(w / 2, h * 0.55, w * 0.34, h * 0.45, 0, 0, U.TAU); g.fill();
      var grd = g.createRadialGradient(w / 2, h * 0.5, 2, w / 2, h * 0.5, w * 0.45);
      grd.addColorStop(0, U.rgba(color, 0.9));
      grd.addColorStop(0.5, U.rgba(color, 0.25));
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
      g.strokeStyle = U.rgba(color, 0.8); g.lineWidth = 1.4;
      g.beginPath(); g.ellipse(w / 2, h * 0.55, w * 0.3, h * 0.4, 0, 0, U.TAU); g.stroke();
      // силуэт спящего тела внутри
      g.fillStyle = 'rgba(4,7,10,0.85)';
      g.beginPath(); g.ellipse(w / 2, h * 0.42, w * 0.1, h * 0.12, 0, 0, U.TAU); g.fill();
      g.fillRect(w * 0.42, h * 0.5, w * 0.16, h * 0.32);
    };
  }

  /* ---------------- сборка ---------------- */

  var PALETTES = {
    chorus:  { dark: '#1d2a37', mid: '#3d5a72', rim: '#8ff8ff', core: '#5ff0ff', visor: '#c4fcff' },
    saw:     { dark: '#2e1c24', mid: '#66363f', rim: '#ffa07a', core: '#ff7a4f', visor: '#ffd2bb' },
    clerk:   { dark: '#182b25', mid: '#2d594c', rim: '#a8ffd0', core: '#7bffb0', visor: '#dcffea' },
    surgeon: { dark: '#231b31', mid: '#4c3c68', rim: '#d5b0ff', core: '#c08bff', visor: '#eee0ff' },
    echo:    { dark: '#28172c', mid: '#582b5b', rim: '#ff8fe4', core: '#ff4fd8', visor: '#ffcaf3' },
    zero:    { dark: '#1f262c', mid: '#3d4954', rim: '#ffd884', core: '#ffc24a', visor: '#fff0c8' }
  };

  T.palette = PALETTES;

  T.build = function () {
    if (T.ready) return;

    T.wall[1] = bake(64, 64, wallPlate('#2b3d4f', '#121b24', 'rgba(95,240,255,0.42)'));
    T.wall[2] = bake(64, 64, wallConcrete('#3b4249'));
    T.wall[3] = bake(64, 64, wallData('#16202b', 'rgba(95,240,255,%a)'));
    T.wall[4] = bake(64, 64, wallGrate('#2a3540', 'rgba(150,205,225,0.55)'));
    T.wall[5] = bake(64, 64, wallFlesh('#3d2231', 'rgba(255,79,216,%a)'));
    T.wall[6] = bake(64, 64, wallExit('#0a1418', 'rgba(95,240,255,%a)'));
    T.wall[7] = bake(64, 64, wallPlate('#3b2f28', '#1a1310', 'rgba(255,124,74,0.40)'));
    T.wall[8] = bake(64, 64, wallData('#241428', 'rgba(255,79,216,%a)'));

    T.flat[1] = bake(64, 64, flatTile('#222e39', true, 'rgba(0,0,0,0.5)'));
    T.flat[2] = bake(64, 64, flatGlow('#1a242e', 'rgba(95,240,255,0.30)'));
    T.flat[3] = bake(64, 64, flatTile('#171f28', false));
    T.flat[4] = bake(64, 64, flatTile('#2f2622', true, 'rgba(0,0,0,0.6)'));
    T.flat[5] = bake(64, 64, flatGlow('#22162a', 'rgba(255,79,216,0.28)'));
    T.flat[6] = bake(64, 64, flatTile('#232c23', true, 'rgba(0,0,0,0.45)'));
    T.flat[7] = bake(64, 64, flatCeiling('#0c1218', '#16202a', 'rgba(120,220,245,%a)'));
    T.flat[8] = bake(64, 64, flatCeiling('#140d0a', '#241a14', 'rgba(255,150,90,%a)'));
    T.flat[9] = bake(64, 64, flatCeiling('#120a16', '#1e1226', 'rgba(255,110,220,%a)'));

    Object.keys(PALETTES).forEach(function (key) {
      var pal = PALETTES[key];
      Object.keys(POSES).forEach(function (pose) {
        T.sprite[key + ':' + pose] = bake(48, 72, figure(pal, POSES[pose]));
      });
    });

    T.sprite.bolt = bake(16, 16, blob('rgba(255,140,60,0.9)', 0.35));
    T.sprite.boltCold = bake(16, 16, blob('rgba(95,240,255,0.9)', 0.35));
    T.sprite.boltVoid = bake(16, 16, blob('rgba(255,79,216,0.9)', 0.35));
    T.sprite.spark = bake(8, 8, blob('rgba(255,220,150,0.9)', 0.25));
    T.sprite.mote = bake(8, 8, blob('rgba(95,240,255,0.7)', 0.2));
    T.sprite.smoke = bake(16, 16, blob('rgba(120,130,140,0.35)', 0.5));
    T.sprite.beacon = bake(32, 96, beacon('#5ff0ff'));
    T.sprite.terminal = bake(32, 48, terminal('#5ff0ff'));
    T.sprite.pillar = bake(24, 64, pillar('#5ff0ff'));
    T.sprite.pillarWarm = bake(24, 64, pillar('#ffc24a'));
    T.sprite.nicheZero = bake(64, 80, niche('#ffc24a'));
    T.sprite.nicheEcho = bake(64, 80, niche('#ff4fd8'));

    T.ready = true;
  };

  T.figureKey = function (kind, pose) {
    var k = kind + ':' + pose;
    return T.sprite[k] ? k : 'chorus:idle';
  };

  N.Tex = T;
})(window.NISHA);
