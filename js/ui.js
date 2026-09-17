/* ПРОТОКОЛ НИША — экраны, меню, сохранение прогресса */
(function (N) {
  'use strict';

  var U = N.U;

  var SCREENS = ['scr-title', 'scr-missions', 'scr-settings', 'scr-help',
    'scr-briefing', 'scr-debrief', 'scr-dead', 'scr-pause', 'scr-end'];

  var UI = {
    game: null,
    current: 'scr-title',
    backTo: 'scr-title',
    progress: null
  };

  function $(id) { return document.getElementById(id); }

  function defaultProgress() {
    return {
      unlocked: 1,
      completed: [],
      run: { mission: 0, body: 'zero', drift: 0 },
      seenEnding: null
    };
  }

  UI.load = function () {
    var p = U.store.read('progress', null);
    if (!p || typeof p.unlocked !== 'number') p = defaultProgress();
    if (!p.run) p.run = { mission: 0, body: 'zero', drift: 0 };
    if (!p.completed) p.completed = [];
    this.progress = p;
  };

  UI.save = function () { U.store.write('progress', this.progress); };

  UI.show = function (id) {
    SCREENS.forEach(function (s) {
      var el = $(s);
      if (el) el.hidden = (s !== id);
    });
    $('screens').style.pointerEvents = id ? 'auto' : 'none';
    this.current = id;
    if (id) N.Input.releaseLock();
    $('lock-hint').hidden = true;
  };

  UI.hideAll = function () {
    SCREENS.forEach(function (s) { var el = $(s); if (el) el.hidden = true; });
    $('screens').style.pointerEvents = 'none';
    this.current = null;
  };

  /* --------------------------------------------------------------- экраны */

  UI.renderLines = function (host, lines) {
    host.innerHTML = '';
    lines.forEach(function (l) {
      var p = document.createElement('p');
      p.textContent = l.t;
      if (l.cls) p.className = l.cls;
      host.appendChild(p);
    });
  };

  UI.buildMissions = function () {
    var host = $('mission-list');
    host.innerHTML = '';
    N.Maps.meta.forEach(function (m, i) {
      var b = document.createElement('button');
      b.className = 'mission';
      var done = UI.progress.completed.indexOf(i) >= 0;
      b.disabled = i >= UI.progress.unlocked;
      b.innerHTML = '<span class="no">' + String(i + 1).padStart(2, '0') + '</span>' +
        '<span class="nm">' + m.name + '</span>' +
        '<span class="st">' + (b.disabled ? 'ЗАКРЫТ' : (done ? 'ПРОЙДЕН' : 'ДОСТУПЕН')) + '</span>';
      b.addEventListener('click', function () {
        N.Audio.ui();
        UI.beginMission(i, { body: i === 0 ? 'zero' : UI.progress.run.body, drift: i === 0 ? 0 : UI.progress.run.drift });
      });
      host.appendChild(b);
    });
  };

  UI.buildSettings = function () {
    var host = $('settings-list');
    host.innerHTML = '';

    function row(label, valueText) {
      var d = document.createElement('div');
      d.className = 'setting';
      d.innerHTML = '<span class="lbl">' + label + '</span>';
      var v = document.createElement('span');
      v.className = 'val';
      v.textContent = valueText;
      return { el: d, val: v };
    }

    // разрешение
    var resList = [[320, 180], [480, 270], [640, 360], [800, 450]];
    var resIdx = U.store.read('resIndex', 1);
    var r1 = row('ВНУТРЕННЕЕ РАЗРЕШЕНИЕ', resList[resIdx].join('×'));
    var rb = document.createElement('button');
    rb.textContent = 'СМЕНИТЬ';
    rb.addEventListener('click', function () {
      resIdx = (resIdx + 1) % resList.length;
      U.store.write('resIndex', resIdx);
      r1.val.textContent = resList[resIdx].join('×');
      UI.game.renderer.setResolution(resList[resIdx][0], resList[resIdx][1]);
      N.Audio.ui();
    });
    r1.el.appendChild(r1.val); r1.el.appendChild(rb); host.appendChild(r1.el);

    // чувствительность
    var r2 = row('ЧУВСТВИТЕЛЬНОСТЬ', N.Input.sensitivity.toFixed(2));
    var sl = document.createElement('input');
    sl.type = 'range'; sl.min = '0.2'; sl.max = '3'; sl.step = '0.05';
    sl.value = String(N.Input.sensitivity);
    sl.addEventListener('input', function () {
      N.Input.setSensitivity(parseFloat(sl.value));
      r2.val.textContent = N.Input.sensitivity.toFixed(2);
    });
    r2.el.appendChild(r2.val); r2.el.appendChild(sl); host.appendChild(r2.el);

    // инверсия
    var r3 = row('ИНВЕРСИЯ ПО Y', N.Input.invertY ? 'ВКЛ' : 'ВЫКЛ');
    var ib = document.createElement('button');
    ib.textContent = 'ПЕРЕКЛЮЧИТЬ';
    ib.addEventListener('click', function () {
      N.Input.setInvert(!N.Input.invertY);
      r3.val.textContent = N.Input.invertY ? 'ВКЛ' : 'ВЫКЛ';
      N.Audio.ui();
    });
    r3.el.appendChild(r3.val); r3.el.appendChild(ib); host.appendChild(r3.el);

    // громкость
    var r4 = row('ГРОМКОСТЬ', Math.round(N.Audio.volume * 100) + '%');
    var vs = document.createElement('input');
    vs.type = 'range'; vs.min = '0'; vs.max = '1'; vs.step = '0.05';
    vs.value = String(N.Audio.volume);
    vs.addEventListener('input', function () {
      N.Audio.setVolume(parseFloat(vs.value));
      r4.val.textContent = Math.round(N.Audio.volume * 100) + '%';
    });
    r4.el.appendChild(r4.val); r4.el.appendChild(vs); host.appendChild(r4.el);

    // сложность
    var keys = Object.keys(N.DIFFICULTY);
    var r5 = row('РЕЖИМ', UI.game.diff.name);
    var db = document.createElement('button');
    db.textContent = 'СМЕНИТЬ';
    db.addEventListener('click', function () {
      var i = (keys.indexOf(UI.game.diff.key) + 1) % keys.length;
      UI.game.diff = N.DIFFICULTY[keys[i]];
      U.store.write('difficulty', keys[i]);
      r5.val.textContent = UI.game.diff.name;
      N.Audio.ui();
    });
    r5.el.appendChild(r5.val); r5.el.appendChild(db); host.appendChild(r5.el);

    // сброс
    var r6 = row('ПРОГРЕСС', UI.progress.completed.length + ' / ' + N.Maps.count);
    var cb = document.createElement('button');
    cb.textContent = 'СТЕРЕТЬ';
    cb.addEventListener('click', function () {
      UI.progress = defaultProgress();
      UI.save();
      r6.val.textContent = '0 / ' + N.Maps.count;
      UI.buildMissions();
      N.Audio.ui();
    });
    r6.el.appendChild(r6.val); r6.el.appendChild(cb); host.appendChild(r6.el);
  };

  UI.showBriefing = function (index, opts) {
    this.pendingMission = { index: index, opts: opts || {} };
    var m = N.Story.missions[index];
    $('brief-tag').textContent = m.tag;
    $('brief-title').textContent = m.title;
    var lines = m.brief.slice();
    if (index > 0 && opts && opts.body && opts.body !== 'zero') {
      lines = lines.concat([{ t: 'Ты входишь в сеанс в теле, которое взял в прошлый раз: ' +
        (N.BODIES[opts.body] || N.BODIES.zero).name + '. Дрейф: ' + (opts.drift || 0) + '.', cls: 'host' }]);
    }
    lines = lines.concat([{ t: N.Story.tips[index % N.Story.tips.length], cls: '' }]);
    this.renderLines($('brief-lines'), lines);
    this.show('scr-briefing');
  };

  UI.beginMission = function (index, opts) {
    this.showBriefing(index, opts);
  };

  UI.launch = function () {
    var pm = this.pendingMission;
    if (!pm) return;
    this.hideAll();
    N.Audio.resume();
    this.game.startMission(pm.index, pm.opts);
    $('lock-hint').hidden = false;
    N.Input.requestLock();
  };

  UI.showDebrief = function () {
    var g = this.game, idx = g.missionIndex;
    var m = N.Story.missions[idx];
    $('debrief-tag').textContent = '// СЕАНС ' + String(idx + 1).padStart(2, '0') + ' ЗАВЕРШЁН';
    $('debrief-title').textContent = 'ЧИСТО';
    this.renderLines($('debrief-lines'), m.debrief);
    $('debrief-stats').innerHTML =
      '<span>ВРЕМЯ <b>' + U.timecode(g.missionTime) + '</b></span>' +
      '<span>СНЯТО <b>' + g.player.kills + '</b></span>' +
      '<span>ПРОТОКОЛОВ <b>' + g.player.execs + '</b></span>' +
      '<span>ПЕРЕСЕЛЕНИЙ <b>' + g.player.possessions + '</b></span>' +
      '<span>ДРЕЙФ <b>' + g.player.drift + '</b></span>';

    if (this.progress.completed.indexOf(idx) < 0) this.progress.completed.push(idx);
    this.progress.unlocked = Math.max(this.progress.unlocked, Math.min(N.Maps.count, idx + 2));
    this.progress.run = { mission: idx + 1, body: g.player.bodyKey, drift: g.player.drift };
    this.save();
    this.buildMissions();
    this.show('scr-debrief');
  };

  UI.showDead = function () {
    var lines = [{ t: N.Story.deaths[(Math.random() * N.Story.deaths.length) | 0], cls: 'echo' }];
    var g = this.game;
    lines.push({ t: 'Сеанс ' + (g.missionIndex + 1) + ' · ' + g.map.name +
      '. Снято узлов: ' + g.player.kills + '. Осталось: ' + g.aliveCount() + '.' });
    lines.push({ t: 'Протокол перезапустит тебя с начала сеанса. Протокол всегда перезапускает.', cls: 'host' });
    this.renderLines($('dead-lines'), lines);
    this.show('scr-dead');
  };

  UI.showEnding = function (kind) {
    var e = N.Story.endings[kind] || N.Story.endings.zero;
    $('end-title').textContent = e.title;
    this.renderLines($('end-lines'), e.lines);
    var idx = this.game.missionIndex;
    if (this.progress.completed.indexOf(idx) < 0) this.progress.completed.push(idx);
    this.progress.seenEnding = kind;
    this.progress.run = { mission: 0, body: 'zero', drift: 0 };
    this.save();
    this.buildMissions();
    this.show('scr-end');
  };

  UI.pause = function () {
    if (this.game.state !== 'playing') return;
    this.game.state = 'paused';
    this.show('scr-pause');
  };

  UI.resume = function () {
    if (this.game.state !== 'paused') return;
    this.hideAll();
    this.game.state = 'playing';
    $('lock-hint').hidden = false;
    N.Input.requestLock();
  };

  /* --------------------------------------------------------------- кнопки */

  UI.bind = function () {
    var self = this;
    document.addEventListener('click', function (ev) {
      var btn = ev.target.closest ? ev.target.closest('[data-act]') : null;
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      N.Audio.resume();
      N.Audio.ui();
      switch (act) {
        case 'new':
          self.progress.run = { mission: 0, body: 'zero', drift: 0 };
          self.save();
          self.beginMission(0, { body: 'zero', drift: 0 });
          break;
        case 'continue':
          var idx = Math.min(self.progress.run.mission || 0, N.Maps.count - 1);
          self.beginMission(idx, { body: self.progress.run.body, drift: self.progress.run.drift });
          break;
        case 'missions': self.backTo = 'scr-title'; self.buildMissions(); self.show('scr-missions'); break;
        case 'settings':
          self.backTo = (self.game.state === 'paused') ? 'scr-pause' : 'scr-title';
          self.buildSettings(); self.show('scr-settings');
          break;
        case 'help': self.backTo = 'scr-title'; self.show('scr-help'); break;
        case 'back': self.show(self.backTo || 'scr-title'); break;
        case 'start': self.launch(); break;
        case 'next':
          var nxt = self.game.missionIndex + 1;
          if (nxt >= N.Maps.count) self.show('scr-title');
          else self.beginMission(nxt, { body: self.progress.run.body, drift: self.progress.run.drift });
          break;
        case 'retry':
          self.hideAll();
          self.game.restart();
          $('lock-hint').hidden = false;
          N.Input.requestLock();
          break;
        case 'restart':
          self.hideAll();
          self.game.restart();
          $('lock-hint').hidden = false;
          N.Input.requestLock();
          break;
        case 'resume': self.resume(); break;
        case 'abort':
          N.Audio.stopMusic();
          self.game.state = 'menu';
          self.show('scr-title');
          break;
      }
    });
  };

  UI.init = function (game) {
    this.game = game;
    this.load();
    this.bind();
    this.buildMissions();
    var cont = document.querySelector('[data-act="continue"]');
    if (cont && !this.progress.completed.length && !this.progress.run.mission) cont.disabled = true;

    var self = this;
    game.onEvent = function (kind) {
      if (kind === 'debrief') self.showDebrief();
      else if (kind === 'dead') self.showDead();
      else if (kind === 'ending') self.showEnding(self.game.ending);
    };
    this.show('scr-title');
  };

  N.UI = UI;
})(window.NISHA);
