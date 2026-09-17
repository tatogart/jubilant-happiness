/* ПРОТОКОЛ НИША — мир сеанса: симуляция, правила миссии, сборка кадра */
(function (N) {
  'use strict';

  var U = N.U, TUNE = N.TUNE;

  function Game(viewCanvas, hudCanvas) {
    this.renderer = new N.Renderer(viewCanvas);
    this.hud = new N.Hud(hudCanvas);
    this.player = new N.Player();
    this.particles = new N.Particles(460);

    this.enemies = [];
    this.bolts = [];
    this.props = [];
    this.notices = [];
    this.sprites = [];

    this.map = null;
    this.missionIndex = 0;
    this.state = 'menu';       // menu | playing | paused | debrief | dead | ending
    this.diff = N.DIFFICULTY[N.U.store.read('difficulty', 'hunter')] || N.DIFFICULTY.hunter;

    this.time = 0;
    this.slowBlend = 0;
    this.timeScale = 1;
    this.playerScale = 1;
    this.shakeAmt = 0;
    this.flashAmt = 0;
    this.glitch = 0;
    this.exitOpen = false;
    this.finished = false;
    this.missionTime = 0;
    this.objective = '';
    this.ending = null;
    this.echoLine = null;
    this.echoT = 0;

    this.flow = null;
    this.flowT = 0;
    this.onEvent = null;       // мост к экранам (ui.js)
  }

  /* --------------------------------------------------------- запуск сеанса */

  Game.prototype.startMission = function (index, opts) {
    opts = opts || {};
    var map = N.Maps.load(index);
    this.map = map;
    this.missionIndex = index;
    this.enemies.length = 0;
    this.bolts.length = 0;
    this.notices.length = 0;
    this.particles.clear();
    this.props = map.props.map(function (p) {
      return { tex: p.tex, x: p.x, y: p.y, z: p.z || 0, size: p.size, additive: p.additive,
               alpha: p.alpha == null ? 1 : p.alpha, unfogged: p.unfogged, tag: p.tag,
               blocking: p.blocking, radius: p.radius || 0.3 };
    });

    for (var i = 0; i < map.spawns.length; i++) {
      var s = map.spawns[i];
      var def = N.ENEMIES[s.kind];
      if (def) this.enemies.push(new N.Enemy(def, s.x, s.y));
    }

    var p = this.player;
    if (opts.body) { p.drift = opts.drift || 0; p.setBody(opts.body, {}); }
    p.kills = p.execs = p.possessions = 0;
    p.spawn(map);
    p.ang = this.pickStartAngle(map, p.x, p.y);

    this.startBody = p.bodyKey;
    this.startDrift = p.drift;
    this.time = 0;
    this.missionTime = 0;
    this.slowBlend = 0;
    this.timeScale = 1;
    this.exitOpen = false;
    this.finished = false;
    this.ending = null;
    this.flow = null;
    this.flowT = 0;
    this.glitch = 0;
    this.state = 'playing';
    this.objective = N.Story.missions[index].objective;
    this.buildFlow();

    N.Audio.startMusic(map.drone);
    N.Audio.setDrift(p.drift);
    this.notice('СЕАНС ' + (index + 1) + ' · ' + map.name, '#5ff0ff');
    this.notice('НОСИТЕЛЬ: ' + p.body.name, '#ffc24a');
  };

  /** Смотреть туда, где больше открытого пространства. */
  Game.prototype.pickStartAngle = function (map, x, y) {
    var best = 0, bestD = -1;
    for (var i = 0; i < 16; i++) {
      var a = (i / 16) * U.TAU;
      var d = 0;
      while (d < 12 && !this.solidAt(x + Math.cos(a) * d, y + Math.sin(a) * d)) d += 0.25;
      if (d > bestD) { bestD = d; best = a; }
    }
    return best;
  };

  Game.prototype.restart = function () {
    this.startMission(this.missionIndex, { body: this.startBody, drift: this.startDrift });
  };

  /* ------------------------------------------------------------ геометрия */

  Game.prototype.solidAt = function (x, y) {
    return N.Maps.solid(this.map, x, y);
  };

  Game.prototype.solidCircle = function (x, y, r) {
    if (this.solidAt(x - r, y - r) || this.solidAt(x + r, y - r) ||
        this.solidAt(x - r, y + r) || this.solidAt(x + r, y + r)) return true;
    for (var i = 0; i < this.props.length; i++) {
      var p = this.props[i];
      if (!p.blocking) continue;
      var rr = p.radius + r;
      if (U.dist2(x, y, p.x, p.y) < rr * rr) return true;
    }
    return false;
  };

  Game.prototype.los = function (x0, y0, x1, y1) {
    var dx = x1 - x0, dy = y1 - y0;
    var d = Math.hypot(dx, dy);
    if (d < 0.001) return true;
    var steps = Math.ceil(d / 0.14);
    var sx = dx / steps, sy = dy / steps;
    var x = x0, y = y0;
    for (var i = 0; i < steps; i++) {
      x += sx; y += sy;
      if (this.solidAt(x, y)) return false;
    }
    return true;
  };

  /** Волна расстояний от игрока — грубая, но связная навигация. */
  Game.prototype.buildFlow = function () {
    var map = this.map, w = map.w, h = map.h;
    if (!this.flow || this.flow.length !== w * h) this.flow = new Uint16Array(w * h);
    var flow = this.flow;
    flow.fill(65535);
    var sx = this.player.x | 0, sy = this.player.y | 0;
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) return;
    var q = [sy * w + sx];
    flow[sy * w + sx] = 0;
    var head = 0;
    while (head < q.length) {
      var i = q[head++];
      var d = flow[i] + 1;
      var cx = i % w, cy = (i / w) | 0;
      for (var k = 0; k < 4; k++) {
        var nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0);
        var ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        var ni = ny * w + nx;
        if (map.cells[ni] > 0 || flow[ni] <= d) continue;
        flow[ni] = d;
        q.push(ni);
      }
    }
  };

  Game.prototype.flowStep = function (x, y) {
    var map = this.map, w = map.w, h = map.h, flow = this.flow;
    if (!flow) return null;
    var cx = x | 0, cy = y | 0;
    if (cx < 0 || cy < 0 || cx >= w || cy >= h) return null;
    var best = flow[cy * w + cx], bx = 0, by = 0, found = false;
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        var nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (map.cells[ny * w + nx] > 0) continue;
        if (dx && dy && (map.cells[cy * w + nx] > 0 || map.cells[ny * w + cx] > 0)) continue;
        var v = flow[ny * w + nx];
        if (v < best) { best = v; bx = dx; by = dy; found = true; }
      }
    }
    if (!found) return null;
    // целимся в центр следующей клетки: иначе узел прижимается к косяку и застревает
    return { x: cx + bx + 0.5, y: cy + by + 0.5 };
  };

  Game.prototype.blinkSpot = function (px, py, minD, maxD) {
    var map = this.map;
    for (var tries = 0; tries < 40; tries++) {
      var a = U.rand(0, U.TAU), d = U.rand(minD, maxD);
      var x = px + Math.cos(a) * d, y = py + Math.sin(a) * d;
      if (x < 1 || y < 1 || x > map.w - 1 || y > map.h - 1) continue;
      if (this.solidCircle(x, y, 0.4)) continue;
      if (!this.los(x, y, px, py)) continue;
      return { x: x, y: y };
    }
    return null;
  };

  /* ---------------------------------------------------------------- эффекты */

  Game.prototype.spawnBolt = function (x, y, z, vx, vy, dmg, tex, owner) {
    this.bolts.push(new N.Bolt(x, y, z, vx, vy, dmg, tex, owner));
  };

  Game.prototype.spawnParticles = function (x, y, z, n, tex, power) {
    this.particles.spawn(x, y, z, n, tex, power);
  };

  Game.prototype.tracer = function (x0, y0, x1, y1, tex) {
    var d = U.dist(x0, y0, x1, y1);
    var n = Math.min(16, Math.max(3, Math.round(d * 1.6)));
    for (var i = 1; i <= n; i++) {
      var t = i / n;
      this.particles.list.push({
        x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, z: TUNE.eyeHeight,
        vx: 0, vy: 0, vz: 0, life: 0.07, maxLife: 0.07, tex: tex, size: 0.05
      });
    }
  };

  Game.prototype.laser = function (from, to) {
    var t = U.rand(0.2, 1);
    this.particles.list.push({
      x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, z: TUNE.eyeHeight,
      vx: 0, vy: 0, vz: 0, life: 0.09, maxLife: 0.09, tex: 'mote', size: 0.045
    });
  };

  Game.prototype.shake = function (a) { this.shakeAmt = Math.min(6, this.shakeAmt + a); };

  Game.prototype.notice = function (text, color) {
    this.notices.push({ text: text, color: color || '#d8e6ee', life: 3.2 });
    if (this.notices.length > 5) this.notices.shift();
  };

  Game.prototype.whisper = function (text) {
    this.echoLine = text;
    this.echoT = 4.5;
  };

  Game.prototype.alertNear = function (src, radius) {
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (e === src || !e.alive || e.alert) continue;
      if (U.dist(e.x, e.y, src.x, src.y) < radius) { e.alert = true; e.lastSeen.x = src.lastSeen.x; e.lastSeen.y = src.lastSeen.y; }
    }
  };

  /* -------------------------------------------------------------- события */

  Game.prototype.onKill = function (e, exec) {
    var p = this.player;
    if (!e.possessed) p.kills++;
    p.focus = Math.min(p.maxFocus(), p.focus + (exec ? TUNE.focusOnExec : TUNE.focusOnKill));
    N.Audio.kill();
    // контур слышит пропавший голос
    for (var i = 0; i < this.enemies.length; i++) {
      var o = this.enemies[i];
      if (!o.alive || o === e) continue;
      if (U.dist(o.x, o.y, e.x, e.y) < 9) { o.alert = true; o.stagger = Math.max(o.stagger, 0.22); }
    }
  };

  Game.prototype.onPlainKill = function (e) {
    this.notice('УЗЕЛ СНЯТ · ' + e.def.name, e.def.color);
    this.hud.hitmark(false);
  };

  Game.prototype.onExecute = function (e) {
    this.player.execs++;
    this.notice('ПРОТОКОЛ · ОКНО ' + e.def.name, '#ffc24a');
    this.flashAmt = 0.55;
    this.shake(2.4);
    this.hud.hitmark(true);
    N.Audio.exec();
  };

  Game.prototype.beginPossession = function (e) {
    this.flashAmt = 0.8;
    this.possessing = e;
  };

  Game.prototype.onPossess = function (e) {
    this.possessing = null;
    this.notice('ПЕРЕСЕЛЕНИЕ · ' + this.player.body.name, '#ff4fd8');
    this.whisper(N.Story.echoFor(e.kind));
    this.glitch = Math.min(1, this.glitch + 0.5);
    var drift = this.player.drift;
    for (var i = 0; i < N.Story.drift.length; i++) {
      var d = N.Story.drift[i];
      if (d.at === drift) this.whisper(d.t);
    }
  };

  Game.prototype.onGrace = function () {
    this.notice('РАСПАД · ПРЫГАЙ', '#ff3b53');
    N.Audio.alarm();
    this.flashAmt = 0.4;
  };

  Game.prototype.onDeath = function () {
    if (this.state !== 'playing') return;
    this.state = 'dead';
    N.Audio.death();
    N.Audio.stopMusic();
    if (this.onEvent) this.onEvent('dead');
  };

  /* ------------------------------------------------------------ симуляция */

  Game.prototype.update = function (realDt, input) {
    if (this.state !== 'playing') return;
    var p = this.player;
    this.missionTime += realDt;

    var graceMode = p.grace > 0;
    var target = (p.reading || graceMode) ? 1 : 0;
    this.slowBlend = U.damp(this.slowBlend, target, TUNE.slowBlend, realDt);
    var floor = graceMode ? TUNE.graceSlow : TUNE.slowScale;
    this.timeScale = U.lerp(1, floor, this.slowBlend);
    if (p.possessT > 0) this.timeScale *= 0.08;
    this.playerScale = U.lerp(1, TUNE.playerSlowFloor, this.slowBlend);
    p.slow = this.slowBlend;
    N.Audio.setSlow(this.slowBlend);

    var dt = realDt * this.timeScale;
    var pdt = realDt * this.playerScale;
    this.time += dt;

    p.update(pdt, realDt, this, input);

    this.flowT -= realDt;
    if (this.flowT <= 0) { this.flowT = 0.28; this.buildFlow(); }

    for (var i = 0; i < this.enemies.length; i++) this.enemies[i].update(dt, this);
    for (i = this.bolts.length - 1; i >= 0; i--) {
      this.bolts[i].update(dt, this);
      if (this.bolts[i].dead) this.bolts.splice(i, 1);
    }
    this.particles.update(dt);

    for (i = this.notices.length - 1; i >= 0; i--) {
      this.notices[i].life -= realDt;
      if (this.notices[i].life <= 0) this.notices.splice(i, 1);
    }
    if (this.echoT > 0) this.echoT -= realDt;

    this.shakeAmt = U.damp(this.shakeAmt, 0, 7, realDt);
    this.flashAmt = Math.max(0, this.flashAmt - realDt * 2.4);
    this.glitch = U.damp(this.glitch, Math.min(0.42, p.drift * 0.035), 1.4, realDt);

    this.checkObjective(input);
  };

  Game.prototype.aliveCount = function () {
    var n = 0;
    for (var i = 0; i < this.enemies.length; i++) if (this.enemies[i].alive) n++;
    return n;
  };

  Game.prototype.checkObjective = function (input) {
    if (this.finished || this.player.dead) return;
    var left = this.aliveCount();
    if (!this.exitOpen && left === 0) {
      this.exitOpen = true;
      if (this.map.finale) {
        this.objective = 'Выбери тело: НУЛЕВОЕ или ЭХО. Подойди и нажми F.';
        this.notice('ОБЕ НИШИ ОТКРЫТЫ', '#ffc24a');
      } else {
        this.objective = 'Выход открыт. Уходи.';
        this.notice('ВЫХОД ОТКРЫТ', '#5ff0ff');
      }
      N.Audio.readDone();
    }
    if (!this.exitOpen) {
      this.objective = this.missionTime < 7
        ? N.Story.missions[this.missionIndex].objective
        : 'Узлов в контуре: ' + left;
      return;
    }

    var p = this.player;
    if (this.map.finale) {
      var near = null;
      for (var i = 0; i < this.map.niches.length; i++) {
        var n = this.map.niches[i];
        if (U.dist(p.x, p.y, n.x, n.y) < 1.4) near = n;
      }
      this.nicheNear = near;
      if (near && input.hit('possess')) {
        this.finished = true;
        this.ending = near.kind;
        this.state = 'ending';
        N.Audio.possess();
        N.Audio.stopMusic();
        if (this.onEvent) this.onEvent('ending');
      }
      return;
    }

    if (this.map.exit && U.dist(p.x, p.y, this.map.exit.x, this.map.exit.y) < 0.9) {
      this.finished = true;
      this.state = 'debrief';
      N.Audio.stopMusic();
      N.Audio.readDone();
      if (this.onEvent) this.onEvent('debrief');
    }
  };

  /* ---------------------------------------------------------------- кадр */

  Game.prototype.buildScene = function () {
    var sprites = this.sprites;
    sprites.length = 0;
    var p = this.player;

    for (var i = 0; i < this.props.length; i++) {
      var pr = this.props[i];
      var alpha = pr.alpha;
      if (pr.tag === 'exit') alpha *= this.exitOpen ? (0.75 + Math.sin(this.time * 4) * 0.25) : 0.14;
      if (pr.tag === 'niche-zero' || pr.tag === 'niche-echo') {
        alpha *= this.exitOpen ? (0.8 + Math.sin(this.time * 3) * 0.2) : 0.35;
      }
      sprites.push({ x: pr.x, y: pr.y, z: pr.z, size: pr.size, tex: pr.tex,
        additive: pr.additive, alpha: alpha, unfogged: pr.unfogged });
    }

    for (i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      var pose = e.pose();
      var tint = null;
      if (e.alive && e.read >= 1) tint = [300, 300, 300];
      if (e.alive && e.inWindow() && e.read >= 1) {
        var pulse = 300 + Math.sin(this.time * 18) * 90;
        tint = [pulse, pulse, pulse];
      }
      sprites.push({
        x: e.x, y: e.y, z: 0, size: e.alive ? e.height : e.height * 0.55,
        tex: N.Tex.figureKey(e.def.sprite, pose),
        flash: e.flash * 0.85, tint: tint, alpha: 1
      });
    }

    for (i = 0; i < this.bolts.length; i++) {
      var b = this.bolts[i];
      sprites.push({ x: b.x, y: b.y, z: b.z, size: 0.26, tex: b.tex, additive: true, unfogged: true, alpha: 0.95 });
    }

    var list = this.particles.list;
    for (i = 0; i < list.length; i++) {
      var q = list[i];
      var k = q.life / q.maxLife;
      var smoke = q.tex === 'smoke';
      sprites.push({
        x: q.x, y: q.y, z: q.z, size: q.size * (smoke ? (2 - k) : 1),
        tex: q.tex, additive: !smoke, unfogged: !smoke, alpha: smoke ? k * 0.5 : k
      });
    }
    return sprites;
  };

  Game.prototype.draw = function () {
    if (!this.map) return;
    var p = this.player;
    var shakeX = 0, shakeY = 0;
    if (this.shakeAmt > 0.01) {
      shakeX = U.rand(-1, 1) * this.shakeAmt * 0.012;
      shakeY = U.rand(-1, 1) * this.shakeAmt * 2.2;
    }
    var cam = {
      x: p.x, y: p.y,
      ang: p.ang + shakeX,
      pitch: (p.pitch + shakeY - p.kick * 5) * (this.renderer.h / 270),
      eyeZ: p.eyeZ(),
      fov: (p.reading ? 66 : 76) * U.DEG
    };
    this.renderer.render({ map: this.map, cam: cam, sprites: this.buildScene() });
    this.renderer.post({
      slow: this.slowBlend,
      damage: Math.min(0.6, p.hurtFlash + (p.grace > 0 ? 0.35 : 0) + (1 - p.hp / p.maxHp) * 0.12),
      flash: this.flashAmt,
      glitch: this.glitch + (p.grace > 0 ? 0.5 : 0)
    });
    this.renderer.blit();
    this.hud.draw(this);
  };

  N.Game = Game;
})(window.NISHA);
