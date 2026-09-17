/* ПРОТОКОЛ НИША — рендер: DDA-рейкастинг стен, пола, потолка и билбордов */
(function (N) {
  'use strict';

  var U = N.U;

  function Renderer(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.ctx.imageSmoothingEnabled = false;
    this.w = 0; this.h = 0;
    this.setResolution(canvas.width, canvas.height);
  }

  Renderer.prototype.setResolution = function (w, h) {
    if (this.w === w && this.h === h) return;
    this.w = w; this.h = h;
    this.canvas.width = w; this.canvas.height = h;
    this.img = this.ctx.createImageData(w, h);
    this.buf32 = new Uint32Array(this.img.data.buffer);
    this.tmp32 = new Uint32Array(w * h);
    this.zbuf = new Float32Array(w);
    this.buildVignette();
  };

  Renderer.prototype.buildVignette = function () {
    var w = this.w, h = this.h;
    var v = new Uint8Array(w * h);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var dx = (x / w - 0.5) * 2, dy = (y / h - 0.5) * 2;
        var d = Math.sqrt(dx * dx + dy * dy) / 1.42;
        v[y * w + x] = Math.round(U.clamp(1 - Math.pow(d, 2.7) * 0.55, 0, 1) * 255);
      }
    }
    this.vignette = v;
  };

  /**
   * scene = {
   *   map:    { w, h, cells, floors, ceils, fog:{r,g,b}, fogDist },
   *   cam:    { x, y, ang, pitch, eyeZ, fov },
   *   sprites:[ { x, y, z, size, tex, tint, alpha, additive, flash, unfogged } ]
   * }
   */
  Renderer.prototype.render = function (scene) {
    var w = this.w, h = this.h, buf = this.buf32, zbuf = this.zbuf;
    var map = scene.map, cam = scene.cam, tex = N.Tex;
    var cells = map.cells, mw = map.w, mh = map.h;

    var dirX = Math.cos(cam.ang), dirY = Math.sin(cam.ang);
    var f = Math.tan(cam.fov * 0.5) * (w / h) * (9 / 16);
    var planeX = -dirY * f, planeY = dirX * f;
    var horizon = Math.round(h * 0.5 + cam.pitch);
    var eyeZ = cam.eyeZ;
    var fog = map.fog, fogR = fog.r, fogG = fog.g, fogB = fog.b;
    var fogPack = U.packRGB(fogR, fogG, fogB);
    var fogDist = map.fogDist;

    /* ---------- пол и потолок ---------- */
    var r0x = dirX - planeX, r0y = dirY - planeY;
    var r1x = dirX + planeX, r1y = dirY + planeY;
    var floors = map.floors, ceils = map.ceils;
    var flatSet = tex.flat;

    for (var y = 0; y < h; y++) {
      var p = y - horizon;
      var row = y * w;
      if (p === 0) { for (var fx0 = 0; fx0 < w; fx0++) buf[row + fx0] = fogPack; continue; }
      var isFloor = p > 0;
      var rowDist = isFloor ? (eyeZ * h) / p : ((1 - eyeZ) * h) / (-p);
      if (rowDist > fogDist || rowDist < 0) {
        for (var q = 0; q < w; q++) buf[row + q] = fogPack;
        continue;
      }
      var stepX = rowDist * (r1x - r0x) / w;
      var stepY = rowDist * (r1y - r0y) / w;
      var wx = cam.x + rowDist * r0x;
      var wy = cam.y + rowDist * r0y;
      var s = Math.round(U.clamp(1 - Math.pow(rowDist / fogDist, 1.45), 0, 1) * (isFloor ? 255 : 235));
      var is = 256 - s;
      var fr = fogR * is, fg = fogG * is, fb = fogB * is;
      var source = isFloor ? floors : ceils;
      var def = isFloor ? map.floorTex : map.ceilTex;

      for (var x = 0; x < w; x++) {
        var cx = wx | 0, cy = wy | 0;
        var t = null;
        if (cx >= 0 && cy >= 0 && cx < mw && cy < mh) {
          var id = source[cy * mw + cx] || def;
          t = flatSet[id] || flatSet[def];
        } else t = flatSet[def];
        var tx = ((wx - cx) * 64) & 63;
        var ty = ((wy - cy) * 64) & 63;
        var c = t.data[(ty << 6) + tx];
        buf[row + x] = 0xFF000000 |
          (((((c >> 16) & 255) * s + fb) >> 8) << 16) |
          (((((c >> 8) & 255) * s + fg) >> 8) << 8) |
          ((((c & 255) * s + fr) >> 8));
        wx += stepX; wy += stepY;
      }
    }

    /* ---------- стены ---------- */
    for (var col = 0; col < w; col++) {
      var camX = 2 * col / w - 1;
      var rdx = dirX + planeX * camX;
      var rdy = dirY + planeY * camX;
      var mapX = cam.x | 0, mapY = cam.y | 0;
      var ddx = rdx === 0 ? 1e30 : Math.abs(1 / rdx);
      var ddy = rdy === 0 ? 1e30 : Math.abs(1 / rdy);
      var stepMX, stepMY, sideX, sideY;
      if (rdx < 0) { stepMX = -1; sideX = (cam.x - mapX) * ddx; }
      else { stepMX = 1; sideX = (mapX + 1 - cam.x) * ddx; }
      if (rdy < 0) { stepMY = -1; sideY = (cam.y - mapY) * ddy; }
      else { stepMY = 1; sideY = (mapY + 1 - cam.y) * ddy; }

      var hit = 0, side = 0, guard = 0, cell = 0;
      while (!hit && guard++ < 256) {
        if (sideX < sideY) { sideX += ddx; mapX += stepMX; side = 0; }
        else { sideY += ddy; mapY += stepMY; side = 1; }
        if (mapX < 0 || mapY < 0 || mapX >= mw || mapY >= mh) { hit = 2; break; }
        cell = cells[mapY * mw + mapX];
        if (cell > 0) hit = 1;
      }

      var perp;
      if (hit === 1) perp = side === 0 ? (sideX - ddx) : (sideY - ddy);
      else perp = fogDist;
      if (perp < 0.0001) perp = 0.0001;
      zbuf[col] = perp;
      if (hit !== 1 || perp >= fogDist) {
        // ничего не рисуем — пол/потолок уже залиты туманом
        continue;
      }

      var lineH = h / perp;
      var drawStart = Math.round(horizon + (eyeZ - 1) * lineH);
      var drawEnd = Math.round(horizon + eyeZ * lineH);
      var y0 = drawStart < 0 ? 0 : drawStart;
      var y1 = drawEnd > h ? h : drawEnd;
      if (y0 >= y1) continue;

      var wallX = side === 0 ? cam.y + perp * rdy : cam.x + perp * rdx;
      wallX -= Math.floor(wallX);
      var texture = tex.wall[cell] || tex.wall[1];
      var texX = (wallX * 64) | 0;
      if ((side === 0 && rdx > 0) || (side === 1 && rdy < 0)) texX = 63 - texX;
      texX &= 63;

      var sh = U.clamp(1 - Math.pow(perp / fogDist, 1.45), 0, 1);
      sh *= side === 1 ? 0.72 : 1;
      var ws = Math.round(sh * 255), wis = 256 - ws;
      var wfr = fogR * wis, wfg = fogG * wis, wfb = fogB * wis;
      var stepT = 64 / lineH;
      var texPos = (y0 - horizon - (eyeZ - 1) * lineH) * stepT;
      var data = texture.data;

      for (var yy = y0; yy < y1; yy++) {
        var tyv = texPos & 63;
        texPos += stepT;
        var tc = data[(tyv << 6) + texX];
        buf[yy * w + col] = 0xFF000000 |
          (((((tc >> 16) & 255) * ws + wfb) >> 8) << 16) |
          (((((tc >> 8) & 255) * ws + wfg) >> 8) << 8) |
          ((((tc & 255) * ws + wfr) >> 8));
      }
    }

    /* ---------- билборды ---------- */
    var sprites = scene.sprites;
    var n = sprites.length;
    if (!n) return;
    for (var i = 0; i < n; i++) {
      var sp = sprites[i];
      sp._d = U.dist2(cam.x, cam.y, sp.x, sp.y);
    }
    sprites.sort(function (a, b) { return b._d - a._d; });

    var invDet = 1 / (planeX * dirY - dirX * planeY);
    for (i = 0; i < n; i++) {
      var s2 = sprites[i];
      var rx = s2.x - cam.x, ry = s2.y - cam.y;
      var trX = invDet * (dirY * rx - dirX * ry);
      var trY = invDet * (-planeY * rx + planeX * ry);
      if (trY < 0.14) continue;
      var t2 = N.Tex.sprite[s2.tex];
      if (!t2) continue;
      var unit = h / trY;
      var size = s2.size || 0.9;
      var zBase = s2.z || 0;
      var pxH = size * unit;
      var pxW = pxH * (t2.w / t2.h);
      var screenX = (w * 0.5) * (1 + trX / trY);
      var yTop = horizon + (eyeZ - (zBase + size)) * unit;
      var x0 = Math.round(screenX - pxW * 0.5);
      var x1 = Math.round(screenX + pxW * 0.5);
      if (x1 < 0 || x0 >= w) continue;
      var yy0 = Math.round(yTop), yy1 = Math.round(yTop + pxH);
      var cy0 = yy0 < 0 ? 0 : yy0, cy1 = yy1 > h ? h : yy1;
      if (cy0 >= cy1) continue;

      var alpha = s2.alpha == null ? 1 : s2.alpha;
      if (alpha <= 0.02) continue;
      var add = !!s2.additive;
      var tint = s2.tint;
      var flash = s2.flash || 0;
      var shade = s2.unfogged ? 1 : U.clamp(1 - Math.pow(trY / fogDist, 1.45), 0, 1);
      var sr = 256, sg = 256, sb = 256;
      if (tint) { sr = tint[0]; sg = tint[1]; sb = tint[2]; }
      sr = sr * shade; sg = sg * shade; sb = sb * shade;
      var sdata = t2.data, sw = t2.w, shh = t2.h;
      var cx0 = x0 < 0 ? 0 : x0, cx1 = x1 > w ? w : x1;
      var spanX = x1 - x0, spanY = yy1 - yy0;

      for (var sx = cx0; sx < cx1; sx++) {
        if (zbuf[sx] <= trY) continue;
        var u = (((sx - x0) * sw / spanX) | 0);
        if (u < 0 || u >= sw) continue;
        for (var sy = cy0; sy < cy1; sy++) {
          var v = (((sy - yy0) * shh / spanY) | 0);
          var px = sdata[v * sw + u];
          var a = (px >>> 24);
          if (a < 8) continue;
          var af = (a / 255) * alpha;
          var pr = (px & 255) * sr / 256;
          var pg = ((px >> 8) & 255) * sg / 256;
          var pb = ((px >> 16) & 255) * sb / 256;
          if (flash) {
            pr = pr + (255 - pr) * flash;
            pg = pg + (255 - pg) * flash;
            pb = pb + (255 - pb) * flash;
          }
          if (!s2.unfogged && !add) {
            var inv = 1 - shade;
            pr += fogR * inv; pg += fogG * inv; pb += fogB * inv;
          }
          var idx = sy * w + sx;
          var dst = buf[idx];
          var dr = dst & 255, dg = (dst >> 8) & 255, db = (dst >> 16) & 255;
          var orr, og, ob;
          if (add) {
            orr = dr + pr * af; og = dg + pg * af; ob = db + pb * af;
            if (orr > 255) orr = 255; if (og > 255) og = 255; if (ob > 255) ob = 255;
          } else {
            orr = dr + (pr - dr) * af;
            og = dg + (pg - dg) * af;
            ob = db + (pb - db) * af;
          }
          buf[idx] = 0xFF000000 | ((ob | 0) << 16) | ((og | 0) << 8) | (orr | 0);
        }
      }
    }
  };

  /**
   * Один проход постобработки: виньетка, растяжение времени, урон, вспышка, глитч.
   * fx = { slow, damage, flash, glitch, tint:[r,g,b] }
   */
  Renderer.prototype.post = function (fx) {
    var w = this.w, h = this.h, buf = this.buf32, vig = this.vignette;
    var slow = fx.slow || 0, dmg = fx.damage || 0, flash = fx.flash || 0, glitch = fx.glitch || 0;

    if (glitch > 0.01) {
      // построчный сдвиг — «шов» чужой личности
      var tmp = this.tmp32;
      tmp.set(buf);
      var bands = 2 + (glitch * 7) | 0;
      for (var b = 0; b < bands; b++) {
        var by = (Math.random() * h) | 0;
        var bh = 1 + (Math.random() * (3 + glitch * 12)) | 0;
        var off = Math.round((Math.random() * 2 - 1) * glitch * 26);
        for (var yy = by; yy < Math.min(h, by + bh); yy++) {
          var row = yy * w;
          for (var xx = 0; xx < w; xx++) {
            var sxx = xx - off;
            if (sxx < 0) sxx = 0; else if (sxx >= w) sxx = w - 1;
            buf[row + xx] = tmp[row + sxx];
          }
        }
      }
    }

    var needTint = slow > 0.005 || dmg > 0.005 || flash > 0.005;
    var slowR = 70, slowG = 150, slowB = 180;
    var len = w * h;
    for (var i = 0; i < len; i++) {
      var c = buf[i];
      var r = c & 255, g = (c >> 8) & 255, bl = (c >> 16) & 255;
      if (needTint) {
        if (slow > 0.005) {
          var lum = (r * 77 + g * 151 + bl * 28) >> 8;
          var k = slow * 0.55;
          r = r + (lum * slowR / 180 - r) * k;
          g = g + (lum * slowG / 180 - g) * k;
          bl = bl + (lum * slowB / 180 - bl) * k;
        }
        if (dmg > 0.005) {
          r = r + (190 - r) * dmg * 0.55;
          g = g * (1 - dmg * 0.4);
          bl = bl * (1 - dmg * 0.4);
        }
        if (flash > 0.005) {
          r = r + (255 - r) * flash;
          g = g + (255 - g) * flash;
          bl = bl + (255 - bl) * flash;
        }
      }
      var vv = vig[i];
      r = (r * vv) >> 8; g = (g * vv) >> 8; bl = (bl * vv) >> 8;
      buf[i] = 0xFF000000 | ((bl | 0) << 16) | ((g | 0) << 8) | (r | 0);
    }
  };

  Renderer.prototype.blit = function () {
    this.ctx.putImageData(this.img, 0, 0);
  };

  Renderer.prototype.fill = function (packed) {
    this.buf32.fill(packed);
  };

  N.Renderer = Renderer;
})(window.NISHA);
