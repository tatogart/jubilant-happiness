/* ПРОТОКОЛ НИША — носитель: движение, чтение, огонь, переселение */
(function (N) {
  'use strict';

  var U = N.U, TUNE = N.TUNE;

  function Player() {
    this.x = 1.5; this.y = 1.5;
    this.ang = 0; this.pitch = 0;
    this.vx = 0; this.vy = 0;
    this.bob = 0; this.bobAmt = 0;
    this.kick = 0; this.kickX = 0;
    this.recoil = 0;

    this.bodyKey = 'zero';
    this.body = N.BODIES.zero;
    this.hp = 100; this.maxHp = 100;
    this.speed = 3.6;

    this.weapon = N.WEAPONS.whisper;
    this.mag = 12; this.reserve = 48;
    this.cool = 0; this.reloadT = 0;

    this.focus = TUNE.focusMax; this.focusMax = TUNE.focusMax;
    this.focusLock = false; this.focusIdle = 0;

    this.slow = 0; this.reading = false;
    this.target = null; this.possessTarget = null;
    this.drift = 0;
    this.grace = 0; this.dead = false;
    this.dashT = 0; this.dashCd = 0; this.dashX = 0; this.dashY = 0;
    this.iframes = 0;
    this.hurtFlash = 0;
    this.possessT = 0;
    this.stepT = 0;
    this.kills = 0; this.execs = 0; this.possessions = 0;
    this.muzzle = 0;
  }

  Player.prototype.spawn = function (map) {
    this.x = map.start.x; this.y = map.start.y;
    this.ang = 0; this.pitch = 0;
    this.vx = this.vy = 0;
    this.grace = 0; this.dead = false;
    this.target = null; this.possessTarget = null;
    this.focus = this.maxFocus();
    this.cool = 0; this.reloadT = 0;
    this.slow = 0;
  };

  Player.prototype.maxFocus = function () {
    return Math.max(45, TUNE.focusMax - this.drift * TUNE.driftFocusCost);
  };

  /** Занять тело. keepDrift=false только для первого тела сеанса. */
  Player.prototype.setBody = function (key, opts) {
    opts = opts || {};
    var body = N.BODIES[key] || N.BODIES.zero;
    this.bodyKey = key;
    this.body = body;
    this.maxHp = body.hp;
    this.hp = opts.hp == null ? body.hp : opts.hp;
    this.speed = body.speed;
    this.weapon = N.WEAPONS[body.weapon];
    this.mag = this.weapon.mag;
    this.reserve = this.weapon.reserve;
    this.reloadT = 0;
    this.cool = 0;
  };

  Player.prototype.eyeZ = function () {
    return TUNE.eyeHeight + Math.sin(this.bob) * 0.022 * this.bobAmt;
  };

  /* -------------------------------------------------------------- обзор */

  Player.prototype.look = function (dt, input) {
    var s = 0.0022 * input.sensitivity;
    this.ang = U.wrapAngle(this.ang + input.mouse.dx * s);
    var dy = input.mouse.dy * (input.invertY ? -1 : 1);
    // наклон хранится в «пикселях кадра 270p», рендер сам масштабирует
    this.pitch = U.clamp(this.pitch - dy * s * 150, -110, 110);
    if (this.kick > 0) this.kick = U.damp(this.kick, 0, 9, dt);
    if (this.recoil > 0) {
      var back = Math.min(this.recoil, dt * 90);
      this.pitch -= back; this.recoil -= back;
    }
  };

  /* ------------------------------------------------------------ движение */

  Player.prototype.moveStep = function (dt, w, input) {
    var fx = 0, fy = 0;
    if (input.down('up')) fy += 1;
    if (input.down('down')) fy -= 1;
    if (input.down('right')) fx += 1;
    if (input.down('left')) fx -= 1;
    var len = Math.hypot(fx, fy);
    var cos = Math.cos(this.ang), sin = Math.sin(this.ang);
    var wx = 0, wy = 0;
    if (len > 0) {
      fx /= len; fy /= len;
      wx = cos * fy - sin * fx;
      wy = sin * fy + cos * fx;
    }

    var speed = this.speed * (this.reading ? 0.62 : 1);
    if (this.dashT > 0) {
      this.dashT -= dt;
      wx = this.dashX; wy = this.dashY;
      speed = TUNE.dashSpeed;
    } else if (input.hit('dash') && this.dashCd <= 0 && len > 0) {
      this.dashT = TUNE.dashTime;
      this.dashCd = TUNE.dashCooldown;
      this.dashX = wx; this.dashY = wy;
      this.iframes = Math.max(this.iframes, TUNE.dashTime + 0.06);
      N.Audio.dash();
      w.spawnParticles(this.x, this.y, 0.3, 6, 'mote', 1.1);
    }
    if (this.dashCd > 0) this.dashCd -= dt;
    if (this.iframes > 0) this.iframes -= dt;

    this.vx = U.damp(this.vx, wx * speed, 16, dt);
    this.vy = U.damp(this.vy, wy * speed, 16, dt);

    var r = TUNE.playerRadius;
    var nx = this.x + this.vx * dt;
    if (!w.solidCircle(nx, this.y, r)) this.x = nx; else this.vx *= 0.2;
    var ny = this.y + this.vy * dt;
    if (!w.solidCircle(this.x, ny, r)) this.y = ny; else this.vy *= 0.2;

    var moving = Math.hypot(this.vx, this.vy);
    this.bobAmt = U.damp(this.bobAmt, moving > 0.4 ? 1 : 0, 8, dt);
    this.bob += dt * moving * 2.4;
    this.stepT -= dt * moving;
    if (this.stepT <= 0 && moving > 0.6) { this.stepT = 0.62; N.Audio.step(); }
  };

  /* -------------------------------------------------------------- чтение */

  /** Кого мы сейчас читаем: ближайший к перекрестью живой узел. */
  Player.prototype.pickTarget = function (w, coneDeg, maxDist) {
    var best = null, bestScore = 1e9;
    var cone = coneDeg * U.DEG;
    for (var i = 0; i < w.enemies.length; i++) {
      var e = w.enemies[i];
      if (!e.alive) continue;
      var d = U.dist(this.x, this.y, e.x, e.y);
      if (d > maxDist) continue;
      var a = Math.abs(U.wrapAngle(U.angleTo(this.x, this.y, e.x, e.y) - this.ang));
      // крупные цели вблизи прощают неточность прицела
      var slack = Math.atan2(e.radius * 1.6, Math.max(0.6, d));
      if (a - slack > cone) continue;
      var score = a * 3 + d * 0.02;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    if (best && !w.los(this.x, this.y, best.x, best.y)) return null;
    return best;
  };

  Player.prototype.updateRead = function (dt, w, input) {
    var wants = (input.mouse.right || input.down('read')) && !this.dead;
    if (this.focus <= 0.5) this.focusLock = true;
    if (this.focusLock && this.focus > this.maxFocus() * 0.22) this.focusLock = false;
    var can = wants && !this.focusLock;
    if (can !== this.reading) N.Audio[can ? 'slowIn' : 'slowOut']();
    this.reading = can;

    var target = this.pickTarget(w, TUNE.readCone * (can ? 1.35 : 1), 34);
    this.target = target;

    if (can && target) {
      var d = U.dist(this.x, this.y, target.x, target.y);
      var a = Math.abs(U.wrapAngle(U.angleTo(this.x, this.y, target.x, target.y) - this.ang));
      var center = U.clamp(1 - (a / (TUNE.readCone * 1.35 * U.DEG)) * 0.75, 0.3, 1);
      var far = U.clamp(1 - Math.max(0, d - TUNE.readFalloff * 0.45) / TUNE.readFalloff, 0.35, 1);
      var rate = (1 / target.def.readTime) * w.diff.readMul * (1 + this.drift * TUNE.driftReadBonus) * center * far;
      if (target.read < 1) {
        var before = target.read;
        target.read = Math.min(1, target.read + rate * dt);
        if (Math.floor(target.read * 4) > Math.floor(before * 4) && target.read < 1) N.Audio.readTick(target.read);
        if (target.read >= 1 && before < 1) {
          target.readMark = 1;
          N.Audio.readDone();
          w.notice('ПАТТЕРН СНЯТ · ' + target.def.name, target.def.color);
        }
      }
    }

    // незавершённое чтение осыпается
    for (var i = 0; i < w.enemies.length; i++) {
      var e = w.enemies[i];
      if (e === target && can) continue;
      if (e.alive && e.read > 0 && e.read < 1) e.read = Math.max(0, e.read - TUNE.readDecay * dt);
    }

    // фокус
    var slowing = this.slow > 0.12;
    if (slowing) {
      this.focus = Math.max(0, this.focus - TUNE.focusDrain * dt / w.diff.focusMul);
      this.focusIdle = 0;
    } else {
      this.focusIdle += dt;
      if (this.focusIdle > TUNE.focusRegenDelay) {
        this.focus = Math.min(this.maxFocus(), this.focus + TUNE.focusRegen * dt * w.diff.focusMul);
      }
    }
  };

  /* ---------------------------------------------------------------- огонь */

  Player.prototype.currentSpread = function () {
    var base = this.weapon.spread;
    var t = this.target;
    var known = t ? t.read : 0;
    var penalty = TUNE.unreadSpread * (1 - known);
    if (!t) penalty = TUNE.unreadSpread * 0.55;
    var moving = Math.hypot(this.vx, this.vy) / Math.max(1, this.speed);
    return base + penalty + moving * 1.6 + (this.reading ? 0 : 0.7);
  };

  Player.prototype.tryFire = function (dt, w, input) {
    if (this.cool > 0) this.cool -= dt;
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        var need = this.weapon.mag - this.mag;
        var take = Math.min(need, this.reserve);
        this.mag += take; this.reserve -= take;
      }
      return;
    }
    if (input.hit('reload')) { this.reload(); return; }

    var wants = this.weapon.auto ? input.mouse.left : input.mouse.leftEdge;
    if (!wants || this.cool > 0 || this.dead) return;

    if (!this.weapon.melee && this.mag <= 0) {
      if (this.reserve > 0) this.reload();
      else { N.Audio.dry(); w.notice('ПУСТО · ТЕЛО БОЛЬШЕ НЕ ДАЁТ', '#ff3b53'); this.cool = 0.4; }
      return;
    }

    this.cool = 60 / this.weapon.rpm;
    if (!this.weapon.melee) this.mag--;
    this.muzzle = 1;
    this.kick = 1;
    this.recoil += this.weapon.recoil;
    N.Audio.shot(this.weapon.sfx);
    w.shake(this.weapon.recoil * 0.5);

    var spread = this.currentSpread() * U.DEG;
    for (var p = 0; p < this.weapon.pellets; p++) {
      var a = this.ang + U.rand(-spread, spread);
      this.shootRay(w, a);
    }
  };

  Player.prototype.shootRay = function (w, a) {
    var dx = Math.cos(a), dy = Math.sin(a);
    var range = this.weapon.range;
    var step = 0.08;
    var x = this.x, y = this.y;
    for (var t = 0; t < range; t += step) {
      x += dx * step; y += dy * step;
      if (w.solidAt(x, y)) {
        w.spawnParticles(x - dx * 0.1, y - dy * 0.1, 0.5, 3, 'spark', 0.8);
        w.tracer(this.x, this.y, x, y, 'mote');
        return;
      }
      for (var i = 0; i < w.enemies.length; i++) {
        var e = w.enemies[i];
        if (!e.alive) continue;
        if (U.dist2(x, y, e.x, e.y) < e.radius * e.radius) {
          this.hitEnemy(e, w, x, y);
          w.tracer(this.x, this.y, x, y, 'mote');
          return;
        }
      }
    }
    w.tracer(this.x, this.y, x, y, 'mote');
  };

  Player.prototype.hitEnemy = function (e, w, x, y) {
    var known = e.read;
    var mult = TUNE.unreadDamage + (1 - TUNE.unreadDamage) * known;
    var exec = known >= 1 && e.inWindow();
    var dmg = this.weapon.dmg * mult;
    if (exec) {
      e.damage(999, w, { exec: true });
      w.onExecute(e);
    } else {
      var killed = e.damage(dmg, w, {});
      if (killed) w.onPlainKill(e);
      else N.Audio[known >= 1 ? 'hit' : 'hitWeak']();
    }
    w.spawnParticles(x, y, 0.55, exec ? 16 : 4, exec ? 'spark' : 'smoke', exec ? 2 : 0.9);
  };

  Player.prototype.reload = function () {
    if (this.weapon.melee) return;
    if (this.reloadT > 0 || this.mag >= this.weapon.mag || this.reserve <= 0) return;
    this.reloadT = this.weapon.reload;
    N.Audio.reload();
  };

  /* ---------------------------------------------------------- переселение */

  Player.prototype.findPossessTarget = function (w) {
    var best = null, bestScore = 1e9;
    for (var i = 0; i < w.enemies.length; i++) {
      var e = w.enemies[i];
      if (!e.alive || e.read < 1) continue;
      var d = U.dist(this.x, this.y, e.x, e.y);
      if (d > TUNE.possessRange) continue;
      var a = Math.abs(U.wrapAngle(U.angleTo(this.x, this.y, e.x, e.y) - this.ang));
      if (a > 42 * U.DEG) continue;
      if (!w.los(this.x, this.y, e.x, e.y)) continue;
      var score = a * 2 + d * 0.08;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best;
  };

  Player.prototype.tryPossess = function (w, input) {
    if (this.possessT > 0) return;
    var t = this.findPossessTarget(w);
    this.possessTarget = t;
    if (!t || !input.hit('possess')) return;
    this.possessT = TUNE.possessTime;
    this.possessFrom = t;
    N.Audio.possess();
    w.beginPossession(t);
  };

  Player.prototype.completePossession = function (w, e) {
    var key = e.def.body;
    this.setBody(key, {});
    this.drift++;
    this.possessions++;
    this.focus = Math.min(this.maxFocus(), this.focus + TUNE.focusOnPossess);
    this.x = e.x; this.y = e.y;
    this.grace = 0; this.dead = false;
    this.hurtFlash = 0;
    e.possessed = true;
    e.damage(999, w, { possess: true });
    N.Audio.setDrift(this.drift);
    w.onPossess(e);
  };

  /* ------------------------------------------------------------------ урон */

  Player.prototype.hurt = function (dmg, source, w) {
    if (this.dead || this.grace > 0) return;
    if (this.iframes > 0) return;
    this.hp -= dmg * w.diff.dmgIn;
    this.hurtFlash = Math.min(1, this.hurtFlash + dmg * 0.02);
    w.shake(Math.min(3, dmg * 0.12));
    N.Audio.hurt();
    if (this.hp <= 0) {
      this.hp = 0;
      this.grace = TUNE.graceTime;
      w.onGrace();
    }
  };

  Player.prototype.update = function (dt, realDt, w, input) {
    if (this.muzzle > 0) this.muzzle = Math.max(0, this.muzzle - realDt * 12);
    if (this.hurtFlash > 0) this.hurtFlash = Math.max(0, this.hurtFlash - realDt * 1.6);

    this.look(realDt, input);

    if (this.possessT > 0) {
      this.possessT -= realDt;
      if (this.possessT <= 0 && this.possessFrom) {
        this.completePossession(w, this.possessFrom);
        this.possessFrom = null;
      }
      return;
    }

    if (this.grace > 0) {
      this.grace -= realDt;
      this.updateRead(realDt, w, input);
      this.tryPossess(w, input);
      this.moveStep(dt * 0.6, w, input);
      if (this.grace <= 0) { this.dead = true; w.onDeath(); }
      return;
    }

    this.moveStep(dt, w, input);
    this.updateRead(realDt, w, input);
    this.tryFire(dt, w, input);
    this.tryPossess(w, input);
  };

  N.Player = Player;
})(window.NISHA);
