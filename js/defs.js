/* ПРОТОКОЛ НИША — правила: баланс, оружие, тела, паттерны узлов */
(function (N) {
  'use strict';

  /* Всё, что хочется крутить, лежит здесь. */
  var TUNE = {
    slowScale: 0.20,        // во сколько раз замедляется мир при чтении
    playerSlowFloor: 0.58,  // насколько замедляется сам игрок (Superhot-компромисс)
    slowBlend: 9,           // скорость входа/выхода из растяжения
    focusMax: 100,
    focusDrain: 26,         // %/сек растяжения
    focusRegen: 13,         // %/сек вне растяжения
    focusRegenDelay: 0.55,
    focusOnKill: 24,
    focusOnExec: 46,
    focusOnPossess: 35,
    readCone: 12,           // градусов: в каком конусе цель «ложится» под чтение
    readFalloff: 26,        // дальше — читается медленнее
    readDecay: 0.35,        // затухание незавершённого чтения в секунду
    unreadSpread: 7.2,      // градусов добавочного разброса по непрочитанной цели
    unreadDamage: 0.4,      // доля урона по непрочитанной цели
    execWindowBonus: 1,     // множитель: попадание в окно = устранение
    possessRange: 7.5,
    possessTime: 0.34,
    graceTime: 1.7,         // «распад»: сколько есть на прыжок в чужое тело
    graceSlow: 0.07,
    driftReadBonus: 0.05,   // каждое переселение чуть ускоряет чтение
    driftFocusCost: 3.5,    // ...и отъедает максимум фокуса
    dashSpeed: 12,
    dashTime: 0.17,
    dashCooldown: 1.1,
    playerRadius: 0.26,
    eyeHeight: 0.52
  };

  var WEAPONS = {
    whisper: {
      key: 'whisper', name: 'ШЁПОТ', kind: 'pistol', sfx: 'pistol',
      dmg: 27, rpm: 280, auto: false, pellets: 1, spread: 0.5,
      mag: 12, reserve: 48, range: 26, recoil: 1.25, reload: 1.0, view: 'pistol'
    },
    swarm: {
      key: 'swarm', name: 'РОЙ', kind: 'smg', sfx: 'smg',
      dmg: 12, rpm: 720, auto: true, pellets: 1, spread: 1.5,
      mag: 34, reserve: 112, range: 21, recoil: 0.55, reload: 1.3, view: 'smg'
    },
    split: {
      key: 'split', name: 'РАСКОЛ', kind: 'shotgun', sfx: 'shotgun',
      dmg: 13, pellets: 8, rpm: 78, auto: false, spread: 4.6,
      mag: 6, reserve: 24, range: 12, recoil: 3.6, reload: 1.7, view: 'shotgun'
    },
    needle: {
      key: 'needle', name: 'ИГЛА', kind: 'rifle', sfx: 'rifle',
      dmg: 78, rpm: 58, auto: false, pellets: 1, spread: 0.08,
      mag: 4, reserve: 14, range: 42, recoil: 2.8, reload: 1.6, view: 'rifle'
    },
    saw: {
      key: 'saw', name: 'ПИЛА', kind: 'melee', sfx: 'melee', melee: true,
      dmg: 44, rpm: 190, auto: true, pellets: 1, spread: 0,
      mag: 0, reserve: 0, range: 2.0, recoil: 1.4, reload: 0, view: 'claw'
    }
  };

  var BODIES = {
    zero:    { key: 'zero',    name: 'НУЛЕВОЕ ТЕЛО', hp: 100, speed: 3.6, weapon: 'whisper', sprite: 'zero' },
    chorus:  { key: 'chorus',  name: 'ТЕЛО ХОРА',    hp: 85,  speed: 3.6, weapon: 'whisper', sprite: 'chorus' },
    saw:     { key: 'saw',     name: 'ТЕЛО ПИЛЫ',    hp: 115, speed: 4.4, weapon: 'saw',     sprite: 'saw' },
    clerk:   { key: 'clerk',   name: 'ТЕЛО КЛЕРКА',  hp: 62,  speed: 3.2, weapon: 'needle',  sprite: 'clerk' },
    surgeon: { key: 'surgeon', name: 'ТЕЛО ХИРУРГА', hp: 155, speed: 2.9, weapon: 'split',   sprite: 'surgeon' },
    echo:    { key: 'echo',    name: 'ТЕЛО ЭХА',     hp: 120, speed: 4.1, weapon: 'swarm',   sprite: 'echo' }
  };

  /* Паттерн — это и есть личность узла. Прочитал паттерн — владеешь телом. */
  var ENEMIES = {
    chorus: {
      key: 'chorus', name: 'ХОР', sprite: 'chorus', color: '#5ff0ff',
      hp: 58, speed: 2.2, radius: 0.34, sight: 17, readTime: 1.1, height: 0.92,
      body: 'chorus',
      pattern: [
        { id: 'scan',  label: 'ОБХОД',    dur: 1.45, kind: 'move' },
        { id: 'lock',  label: 'ЗАХВАТ',   dur: 0.62, kind: 'tell' },
        { id: 'burst', label: 'ОЧЕРЕДЬ',  dur: 0.62, kind: 'fire', shots: 3, bolt: 'boltCold', dmg: 9, speed: 12, spread: 3.4 },
        { id: 'hold',  label: 'СБРОС',    dur: 0.42, kind: 'recover' },
        { id: 'feed',  label: 'ПОДАЧА',   dur: 1.10, kind: 'reload', window: true }
      ]
    },
    saw: {
      key: 'saw', name: 'ПИЛА', sprite: 'saw', color: '#ff7a4f',
      hp: 82, speed: 3.5, radius: 0.36, sight: 19, readTime: 1.25, height: 0.94,
      body: 'saw',
      pattern: [
        { id: 'stalk',  label: 'СЛЕД',       dur: 1.05, kind: 'move', speedMul: 1.3 },
        { id: 'coil',   label: 'СЖАТИЕ',     dur: 0.48, kind: 'tell' },
        { id: 'lunge',  label: 'РЫВОК',      dur: 0.46, kind: 'lunge', dmg: 21, reach: 2.0, dashSpeed: 10 },
        { id: 'unwind', label: 'РАСКРУТКА',  dur: 0.95, kind: 'recover', window: true }
      ]
    },
    clerk: {
      key: 'clerk', name: 'КЛЕРК', sprite: 'clerk', color: '#7bffb0',
      hp: 46, speed: 1.7, radius: 0.32, sight: 30, readTime: 1.0, height: 0.9,
      body: 'clerk', keepDistance: 7,
      pattern: [
        { id: 'shift', label: 'СМЕЩЕНИЕ',   dur: 1.3, kind: 'move', strafe: true },
        { id: 'aim',   label: 'НАВОДКА',    dur: 1.35, kind: 'tell', laser: true },
        { id: 'pin',   label: 'ИГЛА',       dur: 0.14, kind: 'fire', hitscan: true, dmg: 25 },
        { id: 'cool',  label: 'ОСТЫВАНИЕ',  dur: 1.5, kind: 'recover', window: true }
      ]
    },
    surgeon: {
      key: 'surgeon', name: 'ХИРУРГ', sprite: 'surgeon', color: '#c08bff',
      hp: 132, speed: 1.9, radius: 0.42, sight: 18, readTime: 1.45, height: 1.02,
      body: 'surgeon',
      pattern: [
        { id: 'walk',  label: 'ПОДХОД',    dur: 1.7, kind: 'move' },
        { id: 'draw',  label: 'НАБОР',     dur: 0.78, kind: 'tell' },
        { id: 'blow',  label: 'ВЫДОХ',     dur: 0.5, kind: 'fire', shots: 5, bolt: 'boltVoid', dmg: 8, speed: 8, spread: 15 },
        { id: 'vent',  label: 'ПРОДУВКА',  dur: 1.4, kind: 'recover', window: true }
      ]
    },
    echo: {
      key: 'echo', name: 'ЭХО', sprite: 'echo', color: '#ff4fd8',
      hp: 115, speed: 3.3, radius: 0.34, sight: 26, readTime: 1.6, height: 0.95,
      body: 'echo', readsPlayer: true, elite: true,
      pattern: [
        { id: 'blink',  label: 'СМЕЩЕНИЕ',   dur: 0.42, kind: 'blink' },
        { id: 'hunt',   label: 'ОХОТА',      dur: 0.9, kind: 'move', speedMul: 1.15 },
        { id: 'mirror', label: 'ЗЕРКАЛО',    dur: 0.52, kind: 'tell' },
        { id: 'rain',   label: 'ОЧЕРЕДЬ',    dur: 0.8, kind: 'fire', shots: 5, bolt: 'boltVoid', dmg: 8, speed: 14, spread: 4.5 },
        { id: 'rebuild', label: 'ПЕРЕСБОРКА', dur: 0.82, kind: 'recover', window: true }
      ]
    }
  };

  var DIFFICULTY = {
    read:   { key: 'read',   name: 'ЧИТАТЕЛЬ',  dmgIn: 0.7, readMul: 1.2, focusMul: 1.25 },
    hunter: { key: 'hunter', name: 'ОХОТНИК',   dmgIn: 1.0, readMul: 1.0, focusMul: 1.0 },
    ghost:  { key: 'ghost',  name: 'БЕЗ ТЕЛА',  dmgIn: 1.5, readMul: 0.85, focusMul: 0.8 }
  };

  N.TUNE = TUNE;
  N.WEAPONS = WEAPONS;
  N.BODIES = BODIES;
  N.ENEMIES = ENEMIES;
  N.DIFFICULTY = DIFFICULTY;
})(window.NISHA);
