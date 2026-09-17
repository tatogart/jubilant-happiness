/* ПРОТОКОЛ НИША — интерфейс носителя поверх кадра */
(function (N) {
  'use strict';

  var U = N.U, TUNE = N.TUNE;
  var CY = '#5ff0ff', MG = '#ff4fd8', AM = '#ffc24a', BAD = '#ff3b53', INK = '#d8e6ee';

  function Hud(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.w = canvas.width; this.h = canvas.height;
    this.hit = 0; this.hitExec = false;
    this.adsBlend = 0;
  }

  Hud.prototype.resize = function (cssW, cssH, dpr) {
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.w = this.canvas.width; this.h = this.canvas.height;
    this.s = this.h / 720;
  };

  Hud.prototype.hitmark = function (exec) { this.hit = 1; this.hitExec = exec; };

  Hud.prototype.font = function (size, weight) {
    var g = this.ctx;
    g.font = (weight || '400') + ' ' + Math.round(size * this.s) + 'px "JetBrains Mono","DejaVu Sans Mono",monospace';
    try { g.letterSpacing = Math.round(size * this.s * 0.14) + 'px'; } catch (e) { /* старый браузер */ }
  };

  /** Проекция мировой точки в экранные координаты HUD (совпадает с рендером). */
  Hud.prototype.project = function (game, x, y, z) {
    var p = game.player;
    var r = game.renderer;
    var da = U.wrapAngle(U.angleTo(p.x, p.y, x, y) - p.ang);
    if (Math.abs(da) > 1.45) return null;
    var fov = (p.reading ? 66 : 76) * U.DEG;
    var f = Math.tan(fov * 0.5) * (r.w / r.h) * (9 / 16);
    var d = U.dist(p.x, p.y, x, y);
    var perp = Math.max(0.15, d * Math.cos(da));
    var ix = (r.w * 0.5) * (1 + Math.tan(da) / f);
    var horizon = r.h * 0.5 + (p.pitch - p.kick * 5) * (r.h / 270);
    var unit = r.h / perp;
    var iy = horizon + (p.eyeZ() - z) * unit;
    return {
      x: ix * (this.w / r.w),
      y: iy * (this.h / r.h),
      size: unit * (this.h / r.h),
      dist: perp
    };
  };

  Hud.prototype.draw = function (game) {
    var g = this.ctx, W = this.w, H = this.h, s = this.s;
    g.clearRect(0, 0, W, H);
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    var p = game.player;

    this.drawViewmodel(game);
    this.drawMarkers(game);
    this.drawCrosshair(game);
    this.drawWheel(game);
    this.drawBars(game);
    this.drawObjective(game);
    this.drawNotices(game);
    this.drawWhisper(game);
    this.drawMinimap(game);
    this.drawPrompts(game);
    if (p.grace > 0) this.drawGrace(game);
    if (this.hit > 0) this.hit -= 0.055;
  };

  /* ---------------------------------------------------------- перекрестье */

  Hud.prototype.drawCrosshair = function (game) {
    var g = this.ctx, W = this.w, H = this.h, s = this.s;
    var p = game.player;
    var cx = W / 2, cy = H / 2 + (p.pitch - p.kick * 5) * (H / 270);
    var t = p.target;
    var read = t ? t.read : 0;
    var spread = p.currentSpread();
    var r = (10 + spread * 5.5) * s;
    var col = t ? (read >= 1 ? (t.inWindow() ? AM : CY) : U.mixHex('#6d8496', CY, read)) : '#8fa0ad';

    g.save();
    g.strokeStyle = col;
    g.lineWidth = Math.max(1, 1.6 * s);
    g.globalAlpha = 0.9;
    for (var i = 0; i < 4; i++) {
      var a = i * Math.PI / 2 + Math.PI / 4;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      g.lineTo(cx + Math.cos(a) * (r + 7 * s), cy + Math.sin(a) * (r + 7 * s));
      g.stroke();
    }
    g.globalAlpha = 1;
    g.fillStyle = col;
    g.fillRect(cx - 1 * s, cy - 1 * s, 2 * s, 2 * s);

    // кольцо чтения
    if (t && read > 0.001 && read < 1) {
      g.strokeStyle = 'rgba(95,240,255,0.22)';
      g.lineWidth = 3 * s;
      g.beginPath(); g.arc(cx, cy, r + 14 * s, 0, U.TAU); g.stroke();
      g.strokeStyle = CY;
      g.beginPath();
      g.arc(cx, cy, r + 14 * s, -Math.PI / 2, -Math.PI / 2 + U.TAU * read);
      g.stroke();
    }
    if (t && read >= 1) {
      g.strokeStyle = t.inWindow() ? AM : 'rgba(95,240,255,0.55)';
      g.lineWidth = (t.inWindow() ? 3.5 : 2) * s;
      g.beginPath(); g.arc(cx, cy, r + 14 * s, 0, U.TAU); g.stroke();
    }

    // попадание
    if (this.hit > 0) {
      g.globalAlpha = U.clamp(this.hit, 0, 1);
      g.strokeStyle = this.hitExec ? AM : '#ffffff';
      g.lineWidth = 2.4 * s;
      var hr = (this.hitExec ? 22 : 14) * s;
      for (i = 0; i < 4; i++) {
        var ha = i * Math.PI / 2 + Math.PI / 4;
        g.beginPath();
        g.moveTo(cx + Math.cos(ha) * hr * 0.45, cy + Math.sin(ha) * hr * 0.45);
        g.lineTo(cx + Math.cos(ha) * hr, cy + Math.sin(ha) * hr);
        g.stroke();
      }
      g.globalAlpha = 1;
    }
    g.restore();
  };

  /* ------------------------------------------------------- метки над целями */

  Hud.prototype.drawMarkers = function (game) {
    var g = this.ctx, s = this.s;
    var p = game.player;
    for (var i = 0; i < game.enemies.length; i++) {
      var e = game.enemies[i];
      if (!e.alive) continue;
      if (e.read <= 0.002 && e !== p.target && !e.alert) continue;
      if (!game.los(p.x, p.y, e.x, e.y)) continue;
      var pr = this.project(game, e.x, e.y, e.height * 1.02);
      if (!pr || pr.dist > 30) continue;
      var half = Math.max(8, pr.size * 0.26);
      var x = pr.x, y = pr.y;
      var col = e.def.color;

      g.save();
      g.globalAlpha = U.clamp(1.25 - pr.dist / 30, 0.25, 1);

      // скобки
      g.strokeStyle = e.read >= 1 ? col : 'rgba(150,170,185,0.65)';
      g.lineWidth = Math.max(1, 1.4 * s);
      var bw = half, bh = half * 0.5;
      g.beginPath();
      g.moveTo(x - bw, y + bh); g.lineTo(x - bw, y); g.lineTo(x - bw + bh * 0.6, y);
      g.moveTo(x + bw, y + bh); g.lineTo(x + bw, y); g.lineTo(x + bw - bh * 0.6, y);
      g.stroke();

      // полоса прочитанности
      if (e.read > 0.002 && e.read < 1) {
        g.fillStyle = 'rgba(10,18,24,0.7)';
        g.fillRect(x - bw, y - 7 * s, bw * 2, 3.2 * s);
        g.fillStyle = CY;
        g.fillRect(x - bw, y - 7 * s, bw * 2 * e.read, 3.2 * s);
      }

      if (e.read >= 1) {
        this.font(10, '600');
        g.textAlign = 'center';
        if (e.inWindow()) {
          g.fillStyle = AM;
          g.fillText('ОКНО', x, y - 12 * s);
          g.strokeStyle = AM;
          g.lineWidth = 2 * s;
          g.globalAlpha *= 0.55 + Math.sin(game.time * 20) * 0.35;
          g.beginPath(); g.arc(x, y + half * 1.2, half * 0.9, 0, U.TAU); g.stroke();
        } else {
          g.fillStyle = col;
          var tw = e.timeToWindow();
          g.fillText(tw >= 0 ? 'ОКНО ' + tw.toFixed(1) : 'ПРОЧИТАН', x, y - 12 * s);
        }
      }

      // ЭХО читает тебя в ответ
      if (e.def.readsPlayer && e.playerRead > 0.02) {
        g.globalAlpha = 1;
        g.fillStyle = 'rgba(20,8,20,0.7)';
        g.fillRect(x - bw, y + half * 2.1, bw * 2, 3.2 * s);
        g.fillStyle = MG;
        g.fillRect(x - bw, y + half * 2.1, bw * 2 * e.playerRead, 3.2 * s);
        if (e.playerRead >= 1) {
          this.font(9, '600'); g.textAlign = 'center'; g.fillStyle = MG;
          g.fillText('ОН ЧИТАЕТ ТЕБЯ', x, y + half * 2.9);
        }
      }
      g.restore();
    }
  };

  /* ------------------------------------------------------- колесо паттерна */

  Hud.prototype.drawWheel = function (game) {
    var g = this.ctx, W = this.w, H = this.h, s = this.s;
    var e = game.player.target;
    if (!e || !e.alive || e.read < 0.55) return;
    var cx = 96 * s, cy = H - 218 * s;
    var R = 40 * s;
    var pat = e.def.pattern;
    var total = 0, k;
    for (k = 0; k < pat.length; k++) total += pat[k].dur * e.rate;

    g.save();
    g.translate(cx, cy);
    g.rotate(-Math.PI / 2);
    var acc = 0;
    for (k = 0; k < pat.length; k++) {
      var seg = pat[k].dur * e.rate;
      var a0 = (acc / total) * U.TAU, a1 = ((acc + seg) / total) * U.TAU;
      g.beginPath();
      g.arc(0, 0, R, a0 + 0.02, a1 - 0.02);
      g.lineWidth = (pat[k].window ? 9 : 5) * s;
      g.strokeStyle = pat[k].window
        ? (e.read >= 1 ? AM : 'rgba(120,140,150,0.5)')
        : (k === e.phase ? e.def.color : 'rgba(120,150,165,0.35)');
      g.stroke();
      acc += seg;
    }
    // стрелка текущей фазы
    var cur = 0;
    for (k = 0; k < e.phase; k++) cur += pat[k].dur * e.rate;
    cur += Math.min(e.t, pat[e.phase].dur * e.rate);
    var ang = (cur / total) * U.TAU;
    g.strokeStyle = '#ffffff';
    g.lineWidth = 2 * s;
    g.beginPath();
    g.moveTo(Math.cos(ang) * (R - 12 * s), Math.sin(ang) * (R - 12 * s));
    g.lineTo(Math.cos(ang) * (R + 12 * s), Math.sin(ang) * (R + 12 * s));
    g.stroke();
    g.restore();

    this.font(10, '600');
    g.textAlign = 'center';
    g.fillStyle = e.def.color;
    g.fillText(e.def.name + ' · ' + pat[e.phase].label, cx, cy + R + 15 * s);
    this.font(9);
    if (e.read < 1) {
      g.fillStyle = 'rgba(216,230,238,0.55)';
      g.fillText('ПАТТЕРН СНЯТ НА ' + Math.round(e.read * 100) + '%', cx, cy + R + 28 * s);
    } else {
      var tw = e.timeToWindow();
      g.fillStyle = e.inWindow() ? AM : 'rgba(216,230,238,0.55)';
      g.fillText(e.inWindow() ? 'ОКНО ОТКРЫТО' : (tw >= 0 ? 'ОКНО ЧЕРЕЗ ' + tw.toFixed(1) + 'С' : ''),
        cx, cy + R + 28 * s);
    }
  };

  /* ------------------------------------------------------------- панели */

  function bar(g, x, y, w, h, v, colA, colB, bgA) {
    g.fillStyle = bgA || 'rgba(8,14,20,0.72)';
    g.fillRect(x, y, w, h);
    var grd = g.createLinearGradient(x, y, x + w, y);
    grd.addColorStop(0, colA); grd.addColorStop(1, colB);
    g.fillStyle = grd;
    g.fillRect(x, y, w * U.clamp(v, 0, 1), h);
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.lineWidth = 1;
    g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  Hud.prototype.drawBars = function (game) {
    var g = this.ctx, W = this.w, H = this.h, s = this.s;
    var p = game.player;
    var m = 34 * s;
    var bw = 250 * s, bh = 13 * s;

    // целостность носителя
    var y = H - m - 46 * s;
    this.font(11, '600'); g.textAlign = 'left';
    g.fillStyle = p.drift > 0 ? AM : INK;
    g.fillText(p.body.name, m, y - 13 * s);
    var hpFrac = p.hp / p.maxHp;
    bar(g, m, y, bw, bh, hpFrac, hpFrac > 0.35 ? '#2b8ea8' : BAD, hpFrac > 0.35 ? CY : '#ff7a7a');
    this.font(10);
    g.fillStyle = 'rgba(216,230,238,0.75)';
    g.fillText(Math.ceil(p.hp) + ' / ' + p.maxHp, m, y + bh + 11 * s);

    // дрейф
    this.font(10);
    g.fillStyle = MG;
    g.textAlign = 'left';
    var dtxt = 'ДРЕЙФ ' + p.drift;
    g.fillText(dtxt, m + bw - 62 * s, y + bh + 11 * s);

    // фокус
    var fy = H - m - 12 * s;
    var fw = 300 * s;
    var fx = W / 2 - fw / 2;
    bar(g, fx, fy, fw, 8 * s, p.focus / p.maxFocus(),
      p.focusLock ? '#6a2b3a' : '#2b6a8e', p.focusLock ? BAD : CY);
    this.font(9); g.textAlign = 'center';
    g.fillStyle = p.focusLock ? BAD : 'rgba(216,230,238,0.65)';
    g.fillText(p.focusLock ? 'ФОКУС ИСЧЕРПАН' : 'ФОКУС', W / 2, fy - 9 * s);

    // оружие
    g.textAlign = 'right';
    this.font(13, '600');
    g.fillStyle = INK;
    g.fillText(p.weapon.name, W - m, H - m - 30 * s);
    this.font(18, '600');
    if (p.weapon.melee) {
      g.fillStyle = 'rgba(216,230,238,0.6)';
      g.fillText('∞', W - m, H - m - 8 * s);
    } else {
      g.fillStyle = p.mag > 0 ? INK : BAD;
      g.fillText(p.mag + ' / ' + p.reserve, W - m, H - m - 8 * s);
      if (p.reloadT > 0) {
        this.font(10);
        g.fillStyle = AM;
        g.fillText('ПЕРЕЗАРЯДКА', W - m, H - m + 10 * s);
      }
    }
  };

  Hud.prototype.drawObjective = function (game) {
    var g = this.ctx, W = this.w, s = this.s;
    var m = 34 * s;
    g.textAlign = 'center';
    this.font(11, '600');
    g.fillStyle = game.exitOpen ? CY : 'rgba(216,230,238,0.78)';
    g.fillText(game.objective, W / 2, m);
    this.font(9);
    g.fillStyle = 'rgba(216,230,238,0.4)';
    g.fillText('СЕАНС ' + (game.missionIndex + 1) + ' · ' + game.map.name + ' · ' +
      U.timecode(game.missionTime), W / 2, m + 16 * s);
  };

  Hud.prototype.drawNotices = function (game) {
    var g = this.ctx, W = this.w, s = this.s;
    var m = 34 * s;
    g.textAlign = 'right';
    this.font(11, '600');
    for (var i = 0; i < game.notices.length; i++) {
      var n = game.notices[i];
      g.globalAlpha = U.clamp(n.life, 0, 1);
      g.fillStyle = n.color;
      g.fillText(n.text, W - m, m + 74 * s + i * 17 * s);
    }
    g.globalAlpha = 1;
  };

  Hud.prototype.drawWhisper = function (game) {
    if (game.echoT <= 0 || !game.echoLine) return;
    var g = this.ctx, W = this.w, H = this.h, s = this.s;
    g.textAlign = 'center';
    this.font(13);
    g.globalAlpha = U.clamp(game.echoT / 1.2, 0, 1) * 0.9;
    g.fillStyle = MG;
    g.fillText('« ' + game.echoLine + ' »', W / 2, H - 120 * s);
    g.globalAlpha = 1;
  };

  Hud.prototype.drawPrompts = function (game) {
    var g = this.ctx, W = this.w, H = this.h, s = this.s;
    var p = game.player;
    g.textAlign = 'center';
    if (p.possessTarget && p.possessT <= 0) {
      this.font(12, '600');
      g.fillStyle = MG;
      g.fillText('[F] ПЕРЕСЕЛЕНИЕ · ' + (N.BODIES[p.possessTarget.def.body] || {}).name,
        W / 2, H / 2 + 76 * s);
    } else if (p.target && p.target.read < 1 && !p.reading) {
      this.font(11);
      g.fillStyle = 'rgba(216,230,238,0.5)';
      g.fillText('[ПКМ] ЧИТАТЬ ПАТТЕРН', W / 2, H / 2 + 76 * s);
    }
    if (game.map.finale && game.nicheNear && game.exitOpen) {
      this.font(13, '600');
      g.fillStyle = game.nicheNear.kind === 'zero' ? AM : MG;
      g.fillText('[F] ЗАНЯТЬ ' + (game.nicheNear.kind === 'zero' ? 'НУЛЕВОЕ ТЕЛО' : 'ТЕЛО ЭХА'),
        W / 2, H / 2 + 100 * s);
    }
  };

  Hud.prototype.drawGrace = function (game) {
    var g = this.ctx, W = this.w, H = this.h, s = this.s;
    var p = game.player;
    var k = p.grace / TUNE.graceTime;
    g.textAlign = 'center';
    this.font(30, '700');
    g.fillStyle = BAD;
    g.globalAlpha = 0.6 + Math.sin(game.missionTime * 30) * 0.4;
    g.fillText('РАСПАД', W / 2, H / 2 - 140 * s);
    g.globalAlpha = 1;
    this.font(11, '600');
    g.fillStyle = INK;
    g.fillText('ПРЫГАЙ В ПРОЧИТАННОЕ ТЕЛО · F', W / 2, H / 2 - 112 * s);
    var bw = 220 * s;
    bar(g, W / 2 - bw / 2, H / 2 - 100 * s, bw, 5 * s, k, '#8a1f2c', BAD);
  };

  /* ------------------------------------------------------------- миникарта */

  Hud.prototype.drawMinimap = function (game) {
    var g = this.ctx, s = this.s;
    var size = 132 * s, m = 34 * s;
    var map = game.map, p = game.player;
    var span = 13; // клеток в обе стороны
    var scale = size / (span * 2);
    var ox = m + size / 2, oy = m + size / 2;

    g.save();
    g.beginPath(); g.arc(ox, oy, size / 2, 0, U.TAU); g.clip();
    g.fillStyle = 'rgba(5,8,12,0.55)';
    g.fillRect(ox - size / 2, oy - size / 2, size, size);

    var cx = Math.floor(p.x), cy = Math.floor(p.y);
    for (var y = cy - span; y <= cy + span; y++) {
      for (var x = cx - span; x <= cx + span; x++) {
        if (x < 0 || y < 0 || x >= map.w || y >= map.h) continue;
        if (map.cells[y * map.w + x] === 0) continue;
        g.fillStyle = 'rgba(95,240,255,0.16)';
        g.fillRect(ox + (x - p.x) * scale, oy + (y - p.y) * scale, scale + 0.5, scale + 0.5);
      }
    }

    for (var i = 0; i < game.enemies.length; i++) {
      var e = game.enemies[i];
      if (!e.alive) continue;
      var vis = e.read > 0 || e.alert;
      if (!vis) continue;
      g.fillStyle = e.read >= 1 ? e.def.color : 'rgba(200,215,225,0.45)';
      g.beginPath();
      g.arc(ox + (e.x - p.x) * scale, oy + (e.y - p.y) * scale, 2.4 * s, 0, U.TAU);
      g.fill();
    }

    if (map.exit) {
      g.fillStyle = game.exitOpen ? CY : 'rgba(95,240,255,0.25)';
      g.fillRect(ox + (map.exit.x - p.x) * scale - 2 * s, oy + (map.exit.y - p.y) * scale - 2 * s, 4 * s, 4 * s);
    }
    for (i = 0; i < map.niches.length; i++) {
      var nn = map.niches[i];
      g.fillStyle = nn.kind === 'zero' ? AM : MG;
      g.fillRect(ox + (nn.x - p.x) * scale - 2 * s, oy + (nn.y - p.y) * scale - 2 * s, 4 * s, 4 * s);
    }

    // сам носитель
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(ox + Math.cos(p.ang) * 5 * s, oy + Math.sin(p.ang) * 5 * s);
    g.lineTo(ox + Math.cos(p.ang + 2.5) * 4 * s, oy + Math.sin(p.ang + 2.5) * 4 * s);
    g.lineTo(ox + Math.cos(p.ang - 2.5) * 4 * s, oy + Math.sin(p.ang - 2.5) * 4 * s);
    g.closePath(); g.fill();
    g.restore();

    g.strokeStyle = 'rgba(95,240,255,0.25)';
    g.lineWidth = 1.2 * s;
    g.beginPath(); g.arc(ox, oy, size / 2, 0, U.TAU); g.stroke();
  };

  /* ------------------------------------------------------------- оружие */

  Hud.prototype.drawViewmodel = function (game) {
    var g = this.ctx, W = this.w, H = this.h, s = this.s;
    var p = game.player;
    var bobX = Math.sin(p.bob) * 13 * s * p.bobAmt;
    var bobY = Math.abs(Math.cos(p.bob)) * 10 * s * p.bobAmt;
    var kick = p.kick * 30 * s;
    var reloadDip = p.reloadT > 0
      ? Math.sin((1 - p.reloadT / Math.max(0.2, p.weapon.reload)) * Math.PI) * 80 * s : 0;
    this.adsBlend = U.lerp(this.adsBlend == null ? 0 : this.adsBlend, p.reading ? 1 : 0, 0.22);
    var a = this.adsBlend;

    var x = U.lerp(W * 0.76, W * 0.54, a) + bobX * (1 - a * 0.75);
    var y = H + U.lerp(14, 116, a) * s + bobY + kick + reloadDip;
    var pal = N.Tex.palette[p.body.sprite] || N.Tex.palette.zero;

    g.save();
    g.translate(x, y);
    g.rotate(U.lerp(-0.24, -0.05, a));
    g.scale(s * U.lerp(2.2, 1.9, a), s * U.lerp(2.2, 1.9, a));

    // градиенты вместо плоской заливки — иначе оружие читается плитой
    var METAL = g.createLinearGradient(-38, 0, 34, 0);
    METAL.addColorStop(0, '#546d85'); METAL.addColorStop(0.42, '#31434f'); METAL.addColorStop(1, '#161f28');
    var METAL2 = g.createLinearGradient(-34, 0, 30, 0);
    METAL2.addColorStop(0, '#3a4c5c'); METAL2.addColorStop(0.5, '#222e39'); METAL2.addColorStop(1, '#101820');
    var RIM = '#93b2ca', DARK = '#101820';

    function quad(pts, fill, rim) {
      g.beginPath();
      g.moveTo(pts[0], pts[1]);
      for (var i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
      g.closePath();
      g.fillStyle = fill; g.fill();
      if (rim) { g.strokeStyle = rim; g.lineWidth = 1.2; g.stroke(); }
    }
    // предплечье носителя: тело чужое, но руки — те, которыми стреляешь
    function arm(gx, gy) {
      g.lineCap = 'round';
      g.strokeStyle = pal.dark; g.lineWidth = 26;
      g.beginPath(); g.moveTo(gx + 52, gy + 108); g.lineTo(gx, gy); g.stroke();
      g.strokeStyle = pal.mid; g.lineWidth = 19;
      g.beginPath(); g.moveTo(gx + 52, gy + 108); g.lineTo(gx, gy); g.stroke();
      g.strokeStyle = pal.rim; g.lineWidth = 1.4; g.globalAlpha = 0.35;
      g.beginPath(); g.moveTo(gx + 44, gy + 108); g.lineTo(gx - 8, gy); g.stroke();
      g.globalAlpha = 1;
      g.fillStyle = pal.mid;
      g.beginPath(); g.ellipse(gx, gy, 15, 13, -0.3, 0, U.TAU); g.fill();
      g.fillStyle = pal.dark;
      g.beginPath(); g.ellipse(gx + 2, gy + 2, 11, 9, -0.3, 0, U.TAU); g.fill();
    }

    var muzzle = [0, -150];
    switch (p.weapon.view) {
      case 'smg':
        arm(10, 4);
        quad([-26, -46, 26, -36, 30, 16, -22, 6], METAL, RIM);              // коробка
        quad([-12, 2, 14, 8, 6, 62, -18, 54], METAL2, RIM);                 // магазин
        quad([-20, -46, 20, -40, 14, -170, -12, -174], METAL, RIM);         // кожух
        quad([-30, -12, -64, -4, -60, 18, -26, 12], METAL2, RIM);           // приклад
        quad([-11, -172, 11, -168, 9, -188, -9, -192], DARK, RIM);
        muzzle = [0, -190];
        break;
      case 'shotgun':
        arm(14, 8);
        quad([-34, -42, 34, -30, 38, 26, -30, 14], METAL, RIM);
        quad([-28, -44, -4, -40, -6, -204, -26, -208], METAL2, RIM);
        quad([2, -40, 26, -36, 22, -200, 2, -204], METAL2, RIM);
        quad([-27, -206, 25, -200, 23, -216, -25, -222], DARK, RIM);
        quad([-36, -4, -70, 6, -64, 30, -32, 20], METAL2, RIM);
        muzzle = [-2, -218];
        break;
      case 'rifle':
        arm(12, 10);
        quad([-22, -38, 24, -30, 28, 22, -18, 14], METAL, RIM);
        quad([-14, -38, 12, -34, 6, -228, -10, -232], METAL2, RIM);
        quad([-26, -110, 18, -104, 18, -84, -26, -90], DARK, RIM);          // прицел
        quad([-19, -103, 11, -99, 11, -92, -19, -96], pal.core, null);
        quad([-28, -2, -62, 8, -56, 32, -24, 22], METAL2, RIM);
        muzzle = [-2, -232];
        break;
      case 'claw':
        arm(4, 26);
        quad([-30, 34, -6, 38, 6, 12, -18, 8], METAL, RIM);
        quad([-22, 12, -4, 16, 4, -186, -10, -192], METAL2, RIM);
        quad([-6, 14, 14, 18, 30, -152, 12, -158], METAL2, RIM);
        g.globalAlpha = 0.9;
        quad([-9, -176, 0, -206, 5, -174], pal.rim, null);
        quad([15, -142, 27, -172, 29, -138], pal.rim, null);
        g.globalAlpha = 1;
        muzzle = [0, -180];
        break;
      default: // пистолет
        arm(8, 6);
        quad([-30, -50, 28, -40, 32, -6, -26, -16], METAL, RIM);            // затвор
        quad([-22, -50, 20, -42, 13, -138, -15, -144], METAL, RIM);         // ствол
        quad([-14, -140, 12, -134, 10, -150, -12, -156], DARK, RIM);
        quad([-24, -12, 14, -4, 26, 54, -12, 46], METAL2, RIM);             // рукоять
        muzzle = [-1, -152];
        break;
    }

    // продольный блик и метка занятого тела
    g.globalAlpha = 0.4;
    g.fillStyle = RIM;
    g.fillRect(-18, -130, 2.5, 90);
    g.globalAlpha = 0.8;
    g.fillStyle = pal.core;
    g.fillRect(-20, -34, 6, 11);
    g.globalAlpha = 1;

    if (p.muzzle > 0.02 && !p.weapon.melee) {
      var mr = 40 * p.muzzle;
      var grd = g.createRadialGradient(muzzle[0], muzzle[1], 0, muzzle[0], muzzle[1], mr);
      grd.addColorStop(0, 'rgba(255,255,235,' + (0.95 * p.muzzle) + ')');
      grd.addColorStop(0.35, U.rgba(pal.core, 0.7 * p.muzzle));
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.beginPath(); g.arc(muzzle[0], muzzle[1], mr, 0, U.TAU); g.fill();
    }
    g.restore();
  };

  N.Hud = Hud;
})(window.NISHA);
