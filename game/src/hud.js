// Solara Bay v2 — HUD wiring for the fresh `sb-` DOM (see game/index.html).
// Written fresh for v2. One source of truth is the game; this module only
// presents it. Values are cached so the DOM is touched only on change;
// the speedometer is throttled to ~10 Hz. Minimap is a circular canvas
// with player / mission / police / car blips and named sites.

import { fmtMoney, fmtClock } from './utils.js';

const $ = (id) => document.getElementById(id);

export function createHud(game) {
  const el = {
    hud: $('sb-hud'), cash: $('sb-cash'), time: $('sb-time'),
    vitalityFill: $('sb-vitality-fill'), vitalityNum: $('sb-vitality-num'),
    heat: $('sb-heat'), pd: $('sb-pd'), pdList: $('sb-pd-list'),
    task: $('sb-task'), taskDist: $('sb-task-dist'), clock: $('sb-clock'),
    gun: $('sb-gun'), bullets: $('sb-bullets'),
    speed: $('sb-speed'), speedFill: $('sb-speedbar-fill'), gear: $('sb-gear'),
    station: $('sb-station'), track: $('sb-track'),
    map: $('sb-map'), hint: $('sb-hint'), note: $('sb-note'), chatter: $('sb-chatter'),
    talk: $('sb-talk'), talkFace: $('sb-talk-face'), talkName: $('sb-talk-name'), talkLine: $('sb-talk-line'),
    brief: $('sb-brief'), briefTitle: $('sb-brief-title'), briefText: $('sb-brief-text'),
    aim: $('sb-aim'), hurt: $('sb-hurt'),
  };
  const mapCtx = el.map ? el.map.getContext('2d') : null;
  const cache = new Map();
  let speedTimer = 0;
  let noteTimer = 0;
  let chatterTimer = 0;
  let talkTimer = 0;
  let briefTimer = 0;
  let hintTimer = 0;

  function setText(node, key, value) {
    if (!node) return;
    if (cache.get(key) !== value) { cache.set(key, value); node.textContent = value; }
  }

  function show() { el.hud.classList.remove('sb-off'); el.hud.setAttribute('aria-hidden', 'false'); }
  function hide() { el.hud.classList.add('sb-off'); el.hud.setAttribute('aria-hidden', 'true'); }

  function setMoney(n) { setText(el.cash, 'cash', fmtMoney(n)); }
  function setTime(hours) { setText(el.time, 'time', fmtClock(hours) + ' · Solara Bay'); }
  function setHealth(h) {
    const v = Math.max(0, Math.round(h));
    if (cache.get('hp') !== v) {
      cache.set('hp', v);
      el.vitalityFill.style.width = v + '%';
      el.vitalityFill.style.background = v > 50 ? 'linear-gradient(90deg,#7ec850,#a8e063)'
        : v > 25 ? 'linear-gradient(90deg,#e8a832,#f2c94c)' : 'linear-gradient(90deg,#e5534b,#ff8a50)';
      el.vitalityNum.textContent = v + ' HP';
    }
  }
  function setWanted(n) {
    const s = '★'.repeat(n) + '☆'.repeat(5 - n);
    setText(el.heat, 'heat', s);
    el.heat.style.color = n >= 4 ? '#ff5a50' : n >= 2 ? '#ff9a50' : '#ffd166';
    if (el.pd) el.pd.hidden = n === 0;
  }
  function setPoliceUnits(units) {
    const key = units.map((u) => u.name + ':' + u.status).join('|');
    if (cache.get('pd') === key) return;
    cache.set('pd', key);
    if (!el.pdList) return;
    el.pdList.innerHTML = units.map((u) => `<li><b>${u.name}</b> — ${u.status}</li>`).join('');
  }
  function setTask(text) { setText(el.task, 'task', text); }
  function setAmmo(mag, reserve) {
    setText(el.bullets, 'ammo', mag + ' / ' + reserve);
    setText(el.gun, 'gun', 'PISTOL');
  }
  function setRadio(station, track) {
    setText(el.station, 'station', station);
    setText(el.track, 'track', track);
  }
  function setGear(g) { setText(el.gear, 'gear', g); }
  function setHurt(amount) { if (el.hurt) el.hurt.style.opacity = String(Math.min(1, amount)); }
  function setAimVisible(v) { if (el.aim) el.aim.hidden = !v; }

  function note(text, seconds = 4) {
    if (!el.note) return;
    el.note.textContent = text;
    el.note.hidden = false;
    noteTimer = seconds;
  }
  function bark(text, seconds = 5) {
    if (!el.chatter) return;
    el.chatter.innerHTML = '<b>Pedestrian:</b> ' + text;
    el.chatter.hidden = false;
    chatterTimer = seconds;
  }
  function hint(text, seconds = 6) {
    if (!el.hint) return;
    el.hint.textContent = text;
    el.hint.hidden = false;
    hintTimer = seconds;
  }
  function showTalk(name, line, seconds = 6) {
    if (!el.talk) return;
    el.talkName.textContent = name;
    el.talkLine.textContent = line;
    el.talkFace.textContent = name.charAt(0);
    el.talk.hidden = false;
    talkTimer = seconds;
  }
  function showBrief(title, text, seconds = 7) {
    if (!el.brief) return;
    el.briefTitle.textContent = title;
    el.briefText.textContent = text;
    el.brief.hidden = false;
    briefTimer = seconds;
  }
  /** Screenshot staging: dismiss transient cards so the hero stays visible. */
  function hideBrief() {
    if (el.brief) el.brief.hidden = true;
    if (el.hint) el.hint.hidden = true;
    briefTimer = 0; hintTimer = 0;
  }

  function drawMinimap() {
    if (!mapCtx) return;
    const W = 180, R = 90;
    mapCtx.clearRect(0, 0, W, W);
    mapCtx.save();
    mapCtx.beginPath(); mapCtx.arc(R, R, R - 1, 0, Math.PI * 2); mapCtx.clip();
    // Sea + sand (south edge) and ground.
    mapCtx.fillStyle = '#20242c'; mapCtx.fillRect(0, 0, W, W);
    const toMap = (x, z) => [R + (x / 215) * (R - 4), R + (z / 215) * (R - 4)];
    const [bx0, by0] = toMap(-215, 186);
    mapCtx.fillStyle = '#2ea6b6'; mapCtx.fillRect(0, by0, W, W - by0);
    mapCtx.fillStyle = '#e9d49b'; mapCtx.fillRect(0, by0 - 6, W, 6);
    // Roads.
    mapCtx.strokeStyle = 'rgba(255,255,255,0.28)'; mapCtx.lineWidth = 2;
    for (const line of [-208, -156, -104, -52, 52, 104, 156, 208]) {
      const [x1, y1] = toMap(line, -215); const [x2, y2] = toMap(line, 215);
      mapCtx.beginPath(); mapCtx.moveTo(x1, y1); mapCtx.lineTo(x2, y2); mapCtx.stroke();
      const [x3, y3] = toMap(-215, line); const [x4, y4] = toMap(215, line);
      mapCtx.beginPath(); mapCtx.moveTo(x3, y3); mapCtx.lineTo(x4, y4); mapCtx.stroke();
    }
    // Named sites.
    const sites = [
      { x: 0, z: 0, label: 'PLAZA', color: '#ffd166' },
      { x: 0, z: 130, label: 'DOCKS', color: '#7fd4c1' },
      { x: 0, z: 200, label: 'BEACH', color: '#e9d49b' },
    ];
    mapCtx.font = 'bold 8px system-ui, sans-serif'; mapCtx.textAlign = 'center';
    for (const s of sites) {
      const [sx, sy] = toMap(s.x, s.z);
      mapCtx.fillStyle = s.color;
      mapCtx.beginPath(); mapCtx.arc(sx, sy, 3, 0, Math.PI * 2); mapCtx.fill();
      mapCtx.fillText(s.label, sx, sy - 6);
    }
    // Mission waypoint (pulsing gold).
    const wp = game.missions ? game.missions.waypoint : null;
    if (wp) {
      const [wx, wy] = toMap(wp.x, wp.z);
      const pulse = 5 + Math.sin(performance.now() / 280) * 2;
      mapCtx.strokeStyle = '#ffd166'; mapCtx.lineWidth = 2;
      mapCtx.beginPath(); mapCtx.arc(wx, wy, pulse, 0, Math.PI * 2); mapCtx.stroke();
      mapCtx.fillStyle = '#ffd166';
      mapCtx.beginPath(); mapCtx.arc(wx, wy, 3, 0, Math.PI * 2); mapCtx.fill();
    }
    // Cars (white), police (red), peds (faint).
    if (game.traffic) {
      for (const car of game.traffic.cars) {
        const [cx, cy] = toMap(car.pos.x, car.pos.z);
        mapCtx.fillStyle = 'rgba(255,255,255,0.75)';
        mapCtx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
      }
      mapCtx.fillStyle = 'rgba(255,255,255,0.35)';
      for (const ped of game.traffic.peds) {
        const [px, py] = toMap(ped.pos.x, ped.pos.z);
        mapCtx.fillRect(px - 1, py - 1, 2, 2);
      }
    }
    if (game.police) {
      for (const u of game.police.units) {
        const [ux, uy] = toMap(u.pos.x, u.pos.z);
        mapCtx.fillStyle = '#ff4d4d';
        mapCtx.beginPath(); mapCtx.arc(ux, uy, 3.5, 0, Math.PI * 2); mapCtx.fill();
      }
    }
    // Player arrow (rotates with facing).
    const [px, py] = toMap(game.player.pos.x, game.player.pos.z);
    const yaw = game.player.inCar ? game.player.inCar.yaw : game.player.yaw;
    mapCtx.save();
    mapCtx.translate(px, py);
    mapCtx.rotate(Math.PI - yaw);
    mapCtx.fillStyle = '#ffffff';
    mapCtx.strokeStyle = '#1a1410'; mapCtx.lineWidth = 1;
    mapCtx.beginPath(); mapCtx.moveTo(0, -7); mapCtx.lineTo(5, 6); mapCtx.lineTo(-5, 6); mapCtx.closePath();
    mapCtx.fill(); mapCtx.stroke();
    mapCtx.restore();
    mapCtx.restore();
    // Ring is the CSS border; draw a soft inner ring for legibility.
    mapCtx.strokeStyle = 'rgba(255,209,102,0.9)'; mapCtx.lineWidth = 2;
    mapCtx.beginPath(); mapCtx.arc(R, R, R - 2, 0, Math.PI * 2); mapCtx.stroke();
  }

  /** Per-frame HUD refresh: timers, distance, clock, speedo @ ~10 Hz. */
  function update(dt) {
    if (noteTimer > 0) { noteTimer -= dt; if (noteTimer <= 0 && el.note) el.note.hidden = true; }
    if (chatterTimer > 0) { chatterTimer -= dt; if (chatterTimer <= 0 && el.chatter) el.chatter.hidden = true; }
    if (talkTimer > 0) { talkTimer -= dt; if (talkTimer <= 0 && el.talk) el.talk.hidden = true; }
    if (briefTimer > 0) { briefTimer -= dt; if (briefTimer <= 0 && el.brief) el.brief.hidden = true; }
    if (hintTimer > 0) { hintTimer -= dt; if (hintTimer <= 0 && el.hint) el.hint.hidden = true; }

    setTime(game.timeOfDay);
    setHealth(game.player.health);
    setMoney(game.money);
    setHurt(game.player.state.hurtFlash);
    setAimVisible(!game.player.inCar && game.screen === 'playing');

    // Objective distance + mission timer.
    const wp = game.missions ? game.missions.waypoint : null;
    if (wp && game.missions.active) {
      const d = Math.round(Math.hypot(wp.x - game.player.pos.x, wp.z - game.player.pos.z));
      setText(el.taskDist, 'dist', d + ' m');
    } else setText(el.taskDist, 'dist', '');
    const t = game.missions ? game.missions.timer : 0;
    if (t > 0) {
      el.clock.hidden = false;
      setText(el.clock, 'clock', Math.ceil(t) + 's');
    } else el.clock.hidden = true;

    // Speedometer at ~10 Hz.
    speedTimer -= dt;
    if (speedTimer <= 0) {
      speedTimer = 0.1;
      const kmh = game.player.inCar ? Math.abs(game.player.inCar.speed) * 3.6 : Math.abs(game.player.state.speed) * 3.6;
      setText(el.speed, 'speed', String(Math.round(kmh)));
      if (el.speedFill) el.speedFill.style.width = Math.min(100, (kmh / 120) * 100) + '%';
      setGear(game.player.inCar
        ? (game.player.inCar.speed > 0.5 ? 'GEAR D' : game.player.inCar.speed < -0.5 ? 'GEAR R' : 'GEAR N')
        : 'ON FOOT');
      drawMinimap();
    }
  }

  return {
    show, hide, setMoney, setTime, setHealth, setWanted, setPoliceUnits,
    setTask, setAmmo, setRadio, setGear, setHurt, setAimVisible,
    note, bark, hint, showTalk, showBrief, hideBrief, update, drawMinimap,
  };
}
