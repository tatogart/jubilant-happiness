/* ПРОТОКОЛ НИША — узлы, их паттерны, снаряды и взвесь */
(function (N) {
  'use strict';

  var U = N.U, TUNE = N.TUNE;

  /* ------------------------------------------------------------------ узел */

  function Enemy(def, x, y) {
    this.def = def;
    this.kind = def.key;
    this.x = x; this.y = y;
    this.ang = U.rand(0, U.TAU);
    this.hp = def.hp;
    this.maxHp = def.hp;
    this.radius = def.radius;
    this.height = def.height;

    this.phase = 0;
    this.t = 0;
    this.rate = U.rand(0.93, 1.07);   // лёгкий разброс темпа — узлы не маршируют в такт
    this.shotsFired = 0;

    this.read = 0;          // прочитанность 0..1
    this.readMark = 0;      // вспышка при завершении чтения
    this.playerRead = 0;    // ЭХО читает тебя в ответ

    this.alive = true;
    this.alert = false;
    this.seeT = 99;
    this.lastSeen = { x: x, y: y };
    this.flash = 0;
    this.stagger = 0;
    this.corpseT = 0;
    this.walkPhase = 0;
    this.blinkT = 0;
    this.wander = { x: x, y: y, t: 0 };
    this.stuckT = 0;
    this.slideDir = U.chance(0.5) ? 1 : -1;
    this.possessed = false;
  }

  Enemy.prototype.phaseDef = function () { return this.def.pattern[this.phase]; };

  Enemy.prototype.inWindow = function () {
    return this.alive && !!this.phaseDef().window && this.stagger <= 0;
  };

  /** Сколько секунд до открытия окна (для колеса паттерна). */
  Enemy.prototype.timeToWindow = function () {
    var pat = this.def.pattern;
    if (this.inWindow()) return 0;
    var t = 0, i = this.phase;
    var cur = pat[i];
    t += Math.max(0, cur.dur * this.rate - this.t);
    for (var n = 1; n <= pat.length; n++) {
      var p = pat[(i + n) % pat.length];
      if (p.window) return t;
      t += p.dur * this.rate;
    }
    return -1;
  };

  Enemy.prototype.pose = function () {
    if (!this.alive) return 'dead';
    if (this.stagger > 0) return 'hurt';
    var p = this.phaseDef();
    if (p.window) return 'open';
    switch (p.kind) {
      case 'tell': return 'tell';
      case 'fire': return 'fire';
      case 'lunge': return 'fire';
      case 'blink': return 'walk';
      default: return (this.walkPhase % 1) < 0.5 ? 'walk' : 'idle';
    }
  };

  Enemy.prototype.advance = function (w) {
    this.phase = (this.phase + 1) % this.def.pattern.length;
    this.t = 0;
    this.shotsFired = 0;
    this.rate = U.rand(0.93, 1.07);
    var p = this.phaseDef();
    if (p.kind === 'blink') this.blinkT = 0;
    if (p.kind === 'tell' && w) N.Audio.telegraph();
  };

  Enemy.prototype.canSee = function (w) {
    var p = w.player;
    var d = U.dist(this.x, this.y, p.x, p.y);
    if (d > this.def.sight) return false;
    return w.los(this.x, this.y, p.x, p.y);
  };

  /** Движение с раздельными осями и расталкиванием соседей. Возвращает, сдвинулся ли узел. */
  Enemy.prototype.move = function (dt, w, vx, vy) {
    var r = this.radius, moved = false;
    var nx = this.x + vx * dt;
    if (nx !== this.x && !w.solidCircle(nx, this.y, r)) { this.x = nx; moved = true; }
    var ny = this.y + vy * dt;
    if (ny !== this.y && !w.solidCircle(this.x, ny, r)) { this.y = ny; moved = true; }
    this.walkPhase += dt * 3.2;

    for (var i = 0; i < w.enemies.length; i++) {
      var o = w.enemies[i];
      if (o === this || !o.alive) continue;
      var dx = this.x - o.x, dy = this.y - o.y;
      var d2 = dx * dx + dy * dy;
      var min = this.radius + o.radius;
      if (d2 > 0.0001 && d2 < min * min) {
        var d = Math.sqrt(d2), push = (min - d) * 0.5;
        this.x += (dx / d) * push; this.y += (dy / d) * push;
      }
    }
    return moved;
  };

  /** Шаг в сторону игрока: по прямой, если видно, иначе по волне расстояний. */
  Enemy.prototype.chase = function (dt, w, speed, opts) {
    opts = opts || {};
    var p = w.player;
    var tx, ty;
    if (this.seeT < 0.4) { tx = p.x; ty = p.y; }
    else {
      var step = w.flowStep(this.x, this.y);
      if (step) { tx = step.x; ty = step.y; }
      else { tx = this.lastSeen.x; ty = this.lastSeen.y; }
    }
    var a = U.angleTo(this.x, this.y, tx, ty);
    var d = U.dist(this.x, this.y, p.x, p.y);
    var keep = opts.keep || this.def.keepDistance || 0;
    var dir = 1;
    if (keep && d < keep && this.seeT < 0.4) dir = -1;
    var vx = Math.cos(a) * speed * dir, vy = Math.sin(a) * speed * dir;
    if (opts.strafe) {
      var s = Math.sin(w.time * 1.7 + this.rate * 9) * speed * 0.8;
      vx += Math.cos(a + Math.PI / 2) * s;
      vy += Math.sin(a + Math.PI / 2) * s;
    }
    var moved = this.move(dt, w, vx, vy);
    if (!moved && (vx || vy)) {
      // упёрлись в угол — идём вдоль стены, пока не отпустит
      this.stuckT += dt;
      if (this.stuckT > 0.7) { this.stuckT = 0; this.slideDir = -this.slideDir; }
      var sa = a + this.slideDir * Math.PI / 2;
      this.move(dt, w, Math.cos(sa) * speed, Math.sin(sa) * speed);
    } else if (moved) this.stuckT = 0;
    this.ang = U.wrapAngle(a + (dir < 0 ? Math.PI : 0));
    if (this.seeT < 0.4) this.ang = U.angleTo(this.x, this.y, p.x, p.y);
  };

  Enemy.prototype.fireBolt = function (w, phase) {
    var p = w.player;
    var a = U.angleTo(this.x, this.y, p.x, p.y);
    var spread = (phase.spread || 3) * U.DEG;
    if (this.playerRead >= 1) spread *= 0.25;
    a += U.rand(-spread, spread);
    var speed = phase.speed || 10;
    var dmg = phase.dmg * (this.playerRead >= 1 ? 1.4 : 1);
    w.spawnBolt(this.x, this.y, TUNE.eyeHeight, Math.cos(a) * speed, Math.sin(a) * speed,
      dmg, phase.bolt || 'bolt', this);
    w.spawnParticles(this.x + Math.cos(a) * 0.3, this.y + Math.sin(a) * 0.3, 0.55, 3, 'spark', 0.8);
    N.Audio.shot(this.kind === 'surgeon' ? 'shotgun' : 'smg');
  };

  Enemy.prototype.fireHitscan = function (w, phase) {
    var p = w.player;
    if (!w.los(this.x, this.y, p.x, p.y)) return;
    var a = U.angleTo(this.x, this.y, p.x, p.y);
    w.tracer(this.x, this.y, p.x, p.y, 'mote');
    var miss = this.playerRead >= 1 ? 0 : (U.chance(0.22) ? 1 : 0);
    if (!miss) p.hurt(phase.dmg * (this.playerRead >= 1 ? 1.35 : 1), this, w);
    N.Audio.shot('rifle');
    this.ang = a;
  };

  Enemy.prototype.update = function (dt, w) {
    if (!this.alive) { this.corpseT += dt; return; }
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 4);
    if (this.readMark > 0) this.readMark = Math.max(0, this.readMark - dt * 2);

    var p = w.player;
    var seen = this.canSee(w);
    if (seen) {
      this.seeT = 0;
      this.lastSeen.x = p.x; this.lastSeen.y = p.y;
      if (!this.alert) { this.alert = true; w.alertNear(this, 7); }
    } else this.seeT += dt;

    // ЭХО читает игрока в ответ
    if (this.def.readsPlayer) {
      if (seen) this.playerRead = Math.min(1, this.playerRead + dt * 0.26);
      else this.playerRead = Math.max(0, this.playerRead - dt * 0.22);
    }

    if (this.stagger > 0) { this.stagger -= dt; return; }

    if (!this.alert) {
      // патруль: короткие перебежки по своей клетке
      this.wander.t -= dt;
      if (this.wander.t <= 0) {
        this.wander.t = U.rand(1.6, 3.4);
        var a = U.rand(0, U.TAU), r = U.rand(0.8, 2.4);
        this.wander.x = this.x + Math.cos(a) * r;
        this.wander.y = this.y + Math.sin(a) * r;
      }
      var wa = U.angleTo(this.x, this.y, this.wander.x, this.wander.y);
      if (U.dist(this.x, this.y, this.wander.x, this.wander.y) > 0.25) {
        this.move(dt, w, Math.cos(wa) * this.def.speed * 0.42, Math.sin(wa) * this.def.speed * 0.42);
        this.ang = wa;
      }
      return;
    }

    var phase = this.phaseDef();
    var dur = phase.dur * this.rate;
    this.t += dt;

    switch (phase.kind) {
      case 'move':
        this.chase(dt, w, this.def.speed * (phase.speedMul || 1), { strafe: phase.strafe });
        break;

      case 'tell':
        this.ang = U.angleTo(this.x, this.y, p.x, p.y);
        this.move(dt, w, 0, 0);
        if (phase.laser && seen) w.laser(this, p);
        // без прямой видимости телеграф срывается — узел возвращается к поиску
        if (!seen && this.seeT > 0.55) { this.phase = 0; this.t = 0; }
        break;

      case 'fire':
        this.ang = U.angleTo(this.x, this.y, p.x, p.y);
        if (phase.hitscan) {
          if (this.shotsFired === 0) { this.fireHitscan(w, phase); this.shotsFired = 1; }
        } else {
          var want = Math.min(phase.shots, Math.floor((this.t / dur) * phase.shots) + 1);
          while (this.shotsFired < want) { this.fireBolt(w, phase); this.shotsFired++; }
        }
        break;

      case 'lunge':
        var la = U.angleTo(this.x, this.y, p.x, p.y);
        this.ang = la;
        this.move(dt, w, Math.cos(la) * phase.dashSpeed, Math.sin(la) * phase.dashSpeed);
        if (!this.hitDone && U.dist(this.x, this.y, p.x, p.y) < phase.reach) {
          p.hurt(phase.dmg, this, w);
          this.hitDone = true;
          N.Audio.shot('melee');
          w.spawnParticles(p.x, p.y, 0.6, 8, 'spark', 1.4);
        }
        break;

      case 'blink':
        this.blinkT += dt;
        if (this.blinkT > dur * 0.5 && !this.blinked) {
          this.blinked = true;
          var spot = w.blinkSpot(p.x, p.y, 4, 8);
          if (spot) {
            w.spawnParticles(this.x, this.y, 0.5, 14, 'boltVoid', 2.2);
            this.x = spot.x; this.y = spot.y;
            w.spawnParticles(this.x, this.y, 0.5, 14, 'boltVoid', 2.2);
            // полное чтение пережить смещение может, частичное — нет
            if (this.read < 1) this.read = Math.max(0, this.read - 0.4);
          }
        }
        break;

      default: // recover / reload — окно
        this.move(dt, w, 0, 0);
        if (seen) this.ang = U.angleTo(this.x, this.y, p.x, p.y);
        break;
    }

    if (this.t >= dur) {
      this.hitDone = false;
      this.blinked = false;
      this.advance(w);
    }
  };

  Enemy.prototype.damage = function (amount, w, opts) {
    opts = opts || {};
    if (!this.alive) return false;
    this.alert = true;
    this.flash = 1;
    if (opts.exec) this.hp = 0;
    else this.hp -= amount;
    if (!opts.exec && amount >= 20) this.stagger = Math.max(this.stagger, 0.16);
    w.spawnParticles(this.x, this.y, 0.55, opts.exec ? 22 : 5, opts.exec ? 'spark' : 'smoke', opts.exec ? 2.4 : 0.9);
    if (this.hp <= 0) { this.die(w, opts); return true; }
    return false;
  };

  Enemy.prototype.die = function (w, opts) {
    this.alive = false;
    this.corpseT = 0;
    this.read = Math.max(this.read, 1);
    w.onKill(this, !!(opts && opts.exec));
  };

  /* --------------------------------------------------------------- снаряды */

  function Bolt(x, y, z, vx, vy, dmg, tex, owner) {
    this.x = x; this.y = y; this.z = z;
    this.vx = vx; this.vy = vy;
    this.dmg = dmg; this.tex = tex; this.owner = owner;
    this.life = 4;
    this.dead = false;
  }

  Bolt.prototype.update = function (dt, w) {
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    var steps = Math.max(1, Math.ceil(Math.abs(this.vx * dt) + Math.abs(this.vy * dt)) * 3);
    var sdt = dt / steps;
    for (var i = 0; i < steps; i++) {
      this.x += this.vx * sdt;
      this.y += this.vy * sdt;
      if (w.solidAt(this.x, this.y)) {
        w.spawnParticles(this.x, this.y, this.z, 5, 'spark', 1.1);
        this.dead = true; return;
      }
      var p = w.player;
      if (U.dist2(this.x, this.y, p.x, p.y) < 0.14) {
        p.hurt(this.dmg, this.owner, w);
        w.spawnParticles(this.x, this.y, this.z, 6, 'spark', 1.3);
        this.dead = true; return;
      }
    }
  };

  /* ------------------------------------------------------------------ взвесь */

  function Particles(limit) {
    this.list = [];
    this.limit = limit || 420;
  }

  Particles.prototype.spawn = function (x, y, z, count, tex, power) {
    for (var i = 0; i < count; i++) {
      if (this.list.length >= this.limit) this.list.shift();
      var a = U.rand(0, U.TAU), s = U.rand(0.4, 1) * (power || 1);
      this.list.push({
        x: x, y: y, z: z,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: U.rand(0.2, 2.2) * (power || 1) * 0.5,
        life: U.rand(0.25, 0.8) * (power || 1) * 0.9,
        maxLife: 1, tex: tex, size: U.rand(0.05, 0.14) * (power || 1)
      });
      var p = this.list[this.list.length - 1];
      p.maxLife = p.life;
    }
  };

  Particles.prototype.update = function (dt) {
    for (var i = this.list.length - 1; i >= 0; i--) {
      var p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) { this.list.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.z += p.vz * dt; p.vz -= 4.2 * dt;
      if (p.z < 0.02) { p.z = 0.02; p.vz = 0; p.vx *= 0.7; p.vy *= 0.7; }
      p.vx *= (1 - dt * 1.6); p.vy *= (1 - dt * 1.6);
    }
  };

  Particles.prototype.clear = function () { this.list.length = 0; };

  N.Enemy = Enemy;
  N.Bolt = Bolt;
  N.Particles = Particles;
})(window.NISHA);
