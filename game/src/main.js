// Solara Bay v2 — bootstrap: renderer + post pipeline, screens, game loop,
// driving, save/load, screenshot staging, test hooks. Written fresh for v2.
// ?shot=start|play|chase|mission|face (&seed=N) stages a screenshot scene
// instead of the title screen. ?seed=N fixes the world seed.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildCity } from './city.js';
import { SEED, STEP, PLAYER, CAR, RADIO } from './config.js';
import { mulberry32, clamp, angleLerp, dist2, collideWorld } from './utils.js';
import { createInput, ACTION } from './input.js';
import { createAudio } from './audio.js';
import { createPlayerController } from './player.js';
import { createTraffic } from './traffic.js';
import { createPolice } from './police.js';
import { createCombat } from './combat.js';
import { createMissions } from './missions.js';
import { createHud } from './hud.js';
import { saveGameData, loadGameData, hasSave, clearSave } from './save.js';
import { stageShot } from './shots.js';

window.__errors = [];
window.addEventListener('error', (e) => window.__errors.push(String(e.message || e.error)));
window.addEventListener('unhandledrejection', (e) => window.__errors.push('rejection: ' + String(e.reason)));

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const still = params.get('still') === '1'; // test hook: rAF loop idles, time advances only via __game.advance()
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : SEED;

const stageEl = document.getElementById('stage');

// --- Renderer: ACES filmic, exposure 1.15, HalfFloat MSAA composer --------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
stageEl.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffe9c4);
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(0, 5, 36);

const composer = new EffectComposer(
  renderer,
  new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { type: THREE.HalfFloatType, samples: 4 }),
);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.7, 0.5, 0.85);
composer.addPass(bloom);
composer.addPass(new OutputPass());

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// --- World -----------------------------------------------------------------
const city = buildCity(scene, seed);
const rng = mulberry32(seed);
const audio = createAudio();
const input = createInput(renderer.domElement);

// --- Game state (single source of truth; modules read this object) ---------
const game = {
  screen: 'title',
  money: PLAYER.startMoney,
  timeOfDay: 16.5,
  timers: [],
  radioIndex: 0,
  trackIndex: 0,
  trackTimer: 0,
  autosaveTimer: 20,
  won: false,
  audio, input, city, scene, camera,
  player: null, traffic: null, police: null, missions: null, combat: null, hud: null,
  addMoney(n) { game.money += n; game.hud.setMoney(game.money); },
  /** Run fixed steps synchronously (screenshot staging + tests).
   *  Pass render=false to skip the (slow in software GL) present. */
  advance(seconds, render = true) {
    const n = Math.round(seconds / STEP);
    for (let i = 0; i < n; i += 1) tick(STEP);
    if (render) composer.render();
  },
  saveGame() {
    const m = game.missions;
    const missionIndex = m ? (m.state.done ? Math.min(6, m.index + 1) : m.index) : 0;
    saveGameData({
      money: game.money, missionIndex,
      pos: [game.player.pos.x, game.player.pos.y, game.player.pos.z],
      yaw: game.player.yaw, health: game.player.health,
      timeOfDay: game.timeOfDay,
      mag: game.combat.state.mag, reserve: game.combat.state.reserve,
    });
  },
  onPlayerDown() {
    game.screen = 'wasted';
    showOver('WASTED', 'Tomas is down. The bay keeps moving without you.');
    audio.busted();
    game.police.clearAll();
  },
  onBusted() {
    game.money = Math.max(0, game.money - 100);
    game.screen = 'busted';
    showOver('BUSTED', 'Bay PD caught you. $100 bail, and the heat is off — for now.');
    audio.busted();
    game.police.clearAll();
  },
};

game.player = createPlayerController(scene, city, city.spawnPlayer.clone());
game.traffic = createTraffic(scene, city, rng, game);
game.police = createPolice(scene, city, game);
game.missions = createMissions(scene, city, game);
game.combat = createCombat(scene, camera, game);
game.hud = createHud(game);
game.hud.setMoney(game.money);
game.hud.setAmmo(game.combat.state.mag, game.combat.state.reserve);
game.hud.setWanted(0);
game.hud.setRadio(RADIO[0].station, RADIO[0].tracks[0]);

// --- Screens ---------------------------------------------------------------
const screens = document.getElementById('sb-screens');
function showScreen(name) {
  for (const s of screens.querySelectorAll('[data-screen]')) s.hidden = s.dataset.screen !== name;
  if (name === 'title') { /* title section visible by default state */ }
}
function showOver(title, text) {
  document.getElementById('sb-over-title').textContent = title;
  document.getElementById('sb-over-text').textContent = text;
  showScreen('over');
  game.hud.hide();
}
function hideScreens() { for (const s of screens.querySelectorAll('[data-screen]')) s.hidden = true; }

function startGame(fromSave) {
  input.takeActions();
  audio.unlock();
  audio.ambientStart();
  hideScreens();
  game.hud.show();
  game.screen = 'playing';
  const saved = fromSave ? loadGameData() : null;
  if (saved) {
    game.money = saved.money ?? PLAYER.startMoney;
    game.player.pos.set(saved.pos[0], 0, saved.pos[2]);
    game.player.state.yaw = saved.yaw ?? Math.PI;
    game.player.state.camYaw = saved.yaw ?? Math.PI;
    game.player.state.health = saved.health ?? 100;
    game.timeOfDay = saved.timeOfDay ?? 16.5;
    game.combat.state.mag = saved.mag ?? 12;
    game.combat.state.reserve = saved.reserve ?? 48;
    game.hud.setMoney(game.money);
    game.hud.setAmmo(game.combat.state.mag, game.combat.state.reserve);
    const mi = Math.min(6, saved.missionIndex ?? 0);
    if (mi < 6) game.missions.startMission(mi);
    else game.hud.setTask('Story complete — free roam · explore Solara Bay');
    game.hud.note('Save loaded — welcome back to Solara Bay');
  } else {
    game.missions.startMission(0);
    game.hud.hint('WASD move · E enter car / talk · F punch · Click shoot · M mute', 8);
  }
}

function respawn() {
  game.player.pos.copy(city.spawnPlayer);
  game.player.state.yaw = Math.PI;
  game.player.state.camYaw = Math.PI;
  game.player.state.health = PLAYER.maxHealth;
  game.player.state.dead = false;
  game.player.group.visible = true;
  if (game.player.inCar) game.player.state.inCar = null;
  hideScreens();
  game.hud.show();
  game.screen = 'playing';
  game.hud.note('Back on the streets of Solara Bay');
}

document.getElementById('sb-start').addEventListener('click', () => { audio.click(); startGame(false); });
document.getElementById('sb-resume-save').addEventListener('click', () => { audio.click(); startGame(true); });
document.getElementById('sb-unpause').addEventListener('click', () => { audio.click(); game.screen = 'playing'; hideScreens(); });
document.getElementById('sb-reload-save').addEventListener('click', () => { audio.click(); startGame(true); });
document.getElementById('sb-to-title').addEventListener('click', () => { audio.click(); game.screen = 'title'; showScreen('title'); game.hud.hide(); });
document.getElementById('sb-again').addEventListener('click', () => { audio.click(); respawn(); });
document.getElementById('sb-over-title-btn').addEventListener('click', () => { audio.click(); game.screen = 'title'; showScreen('title'); game.hud.hide(); });
if (hasSave()) document.getElementById('sb-resume-save').hidden = false;

// --- Driving ---------------------------------------------------------------
const driveCam = { yaw: Math.PI, pitch: 0.3 };
function enterCar(car) {
  car.stolen = true;
  if (car.kind === 'ai') car.kind = 'parked'; // it stops being traffic now
  game.player.enterCar(car);
  audio.engineStart();
  game.hud.setGear('GEAR D');
  const witnesses = game.traffic.reactToCrime(car.pos.x, car.pos.z, false);
  if (car.kind === 'parked' && witnesses > 0) game.police.addWanted(1, 'car theft witnessed');
  else if (witnesses > 0) game.police.witnessCall(6);
  game.hud.note(car.kind === 'parked' ? 'You took the car' : 'You took the car');
  game.hud.hint('WASD drive · Shift boost · E exit · H horn · Q radio', 6);
}
function exitCar() {
  const car = game.player.inCar;
  if (!car) return;
  car.speed = 0;
  const side = { x: car.pos.x + Math.cos(car.yaw) * 2.6, z: car.pos.z - Math.sin(car.yaw) * 2.6 };
  game.player.exitCar(side);
  audio.engineStop();
  game.hud.setGear('ON FOOT');
}
function updateDriving(dt, inputState) {
  const car = game.player.inCar;
  const mv = inputState.move();
  const now = performance.now() / 1000;
  if (mv.f > 0) car.speed += CAR.accel * dt * (inputState.sprint ? 1.25 : 1);
  else if (mv.f < 0) car.speed -= (car.speed > 0.5 ? CAR.brake : CAR.accel * 0.6) * dt;
  else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 8 * dt);
  car.speed = clamp(car.speed, -CAR.maxReverse, CAR.maxSpeed);
  if (Math.abs(car.speed) > 0.3) {
    car.yaw += mv.s * CAR.steer * dt * clamp(Math.abs(car.speed) / 8, 0.3, 1) * Math.sign(car.speed) * -1;
  }
  const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
  car.pos.x += fx * car.speed * dt;
  car.pos.z += fz * car.speed * dt;
  // The player's position IS the car's while driving (missions, HUD, police).
  game.player.pos.set(car.pos.x, 0, car.pos.z);
  collideWorld(car.pos, 2.0, city.colliders);
  car.pos.x = clamp(car.pos.x, -213, 213);
  car.pos.z = clamp(car.pos.z, -213, 213);
  // Bump AI cars: slow both, damage on hard hits.
  for (const other of game.traffic.cars) {
    if (other === car || other.kind === 'parked') continue;
    const d = dist2(car.pos.x, car.pos.z, other.pos.x, other.pos.z);
    if (d < 4.4 && d > 0.01) {
      const push = (4.4 - d) / 2;
      const nx = (car.pos.x - other.pos.x) / d, nz = (car.pos.z - other.pos.z) / d;
      car.pos.x += nx * push; car.pos.z += nz * push;
      other.pos.x -= nx * push; other.pos.z -= nz * push;
      if (Math.abs(car.speed) > 10) { car.health -= 6; game.hud.note('Crash! Car damaged'); }
      car.speed *= 0.6;
    }
  }
  car.mesh.rotation.y = car.yaw;
  for (const w of car.mesh.userData.wheels) w.rotation.x += car.speed * dt * 2.4;
  // Peds dive out of the way of a speeding car; a hit is a crime.
  if (Math.abs(car.speed) > 6) {
    for (const ped of game.traffic.peds) {
      const d = dist2(car.pos.x, car.pos.z, ped.pos.x, ped.pos.z);
      if (d < 6 && ped.state !== 'panic') { ped.state = 'panic'; ped.timer = 2; ped.panicFrom = { x: car.pos.x, z: car.pos.z }; }
      if (d < 2.2 && ped.down <= 0) {
        ped.down = 10; ped.health = 0;
        game.traffic.reactToCrime(ped.pos.x, ped.pos.z, true);
        game.police.addWanted(2, 'pedestrian hit by your car');
        game.hud.note('You hit a pedestrian!');
      }
    }
  }
  if (car.health <= 0) {
    car.health = 0;
    game.hud.note('Your car is wrecked!');
    exitCar();
    game.player.damage(15, game);
  }
  // Chase camera.
  driveCam.yaw = angleLerp(driveCam.yaw, car.yaw, Math.min(1, dt * 2.2));
  const look = inputState.takeLook();
  driveCam.yaw -= look.dx * 0.003;
  const d = 10.5;
  const cy = Math.cos(driveCam.pitch), sy = Math.sin(driveCam.pitch);
  camera.position.lerp(new THREE.Vector3(
    car.pos.x - Math.sin(driveCam.yaw) * cy * d,
    3.4 + sy * d,
    car.pos.z - Math.cos(driveCam.yaw) * cy * d,
  ), 0.3);
  camera.position.y = Math.max(camera.position.y, 1.0);
  camera.lookAt(car.pos.x, car.pos.y + 1.6, car.pos.z);
  audio.engineSet(Math.abs(car.speed) / CAR.maxSpeed, mv.f > 0);
  audio.radioTick(dt, true, game.radioIndex);
  game.player.state.speed = Math.abs(car.speed);
}

// --- One fixed step ----------------------------------------------------------
let elapsed = 0;
function tick(dt) {
  elapsed += dt;
  game.timeOfDay = (16.5 + elapsed / 240) % 24;
  // Paused / over: freeze the world, only the HUD timers run.
  if (game.screen === 'paused' || game.screen === 'busted' || game.screen === 'wasted') {
    if (game.screen === 'paused') {
      const pa = input.takeActions();
      if (pa & ACTION.PAUSE) { game.screen = 'playing'; hideScreens(); }
    }
    game.hud.update(dt);
    return;
  }
  // Delayed callbacks (witness calls, next-mission starts).
  for (let i = game.timers.length - 1; i >= 0; i -= 1) {
    game.timers[i].t -= dt;
    if (game.timers[i].t <= 0) { const cb = game.timers[i].fn; game.timers.splice(i, 1); cb(); }
  }
  // Radio track rotation.
  game.trackTimer -= dt;
  if (game.trackTimer <= 0) {
    game.trackTimer = 25;
    const st = RADIO[game.radioIndex];
    game.trackIndex = (game.trackIndex + 1) % st.tracks.length;
    game.hud.setRadio(st.station, st.tracks[game.trackIndex]);
  }
  city.update(dt, elapsed);
  game.traffic.update(dt, elapsed);
  game.police.update(dt, elapsed);
  game.missions.update(dt, elapsed);
  game.combat.update(dt);
  if (game.screen === 'playing') {
    const actions = input.takeActions();
    if (actions & ACTION.PAUSE) { game.screen = 'paused'; showScreen('pause'); }
    if (actions & ACTION.MUTE) { const m = audio.toggleMute(); game.hud.note(m ? 'Muted (M to unmute)' : 'Sound on'); }
    if (actions & ACTION.RADIO_NEXT) {
      game.radioIndex = (game.radioIndex + 1) % RADIO.length;
      game.trackIndex = 0; game.trackTimer = 25;
      const st = RADIO[game.radioIndex];
      game.hud.setRadio(st.station, st.tracks[0]);
      game.hud.note('Radio: ' + st.station);
    }
    if (actions & ACTION.HORN && game.player.inCar) audio.honk();
    if (actions & ACTION.RELOAD) game.combat.reload();
    if (actions & ACTION.PUNCH && !game.player.inCar) game.combat.punch();
    if (actions & (ACTION.ENTER_CAR | ACTION.INTERACT)) {
      if (game.player.inCar) exitCar();
      else {
        // Talk to Sal first when close; otherwise steal the nearest car.
        if (!game.missions.talkToSal()) {
          const car = game.traffic.nearestCar(game.player.pos, 3.6, ['parked', 'ai']);
          if (car) enterCar(car);
          else game.hud.hint('No car close enough — walk up to one and press E', 3);
        }
      }
    }
    if (game.player.inCar) updateDriving(dt, input);
    else {
      game.player.update(dt, input, city.colliders, elapsed, game);
      game.player.lookAtCamera(camera);
      audio.radioTick(dt, false, game.radioIndex);
    }
    game.autosaveTimer -= dt;
    if (game.autosaveTimer <= 0) { game.autosaveTimer = 20; game.saveGame(); }
  } else if (game.screen === 'title') {
    // Gentle orbit behind the hero for the title backdrop.
    game.player.lookAtCamera(camera);
  }
  game.hud.update(dt);
}

// --- Test / screenshot hooks -------------------------------------------------
function getState() {
  const p = game.player;
  return {
    screen: game.screen, money: Math.round(game.money),
    missionIndex: game.missions.index, missionStep: game.missions.state.step,
    missionActive: game.missions.active, objective: game.missions.objectiveText,
    wanted: game.police.wanted, health: Math.round(p.health),
    pos: [Number(p.pos.x.toFixed(2)), Number(p.pos.y.toFixed(2)), Number(p.pos.z.toFixed(2))],
    inCar: !!p.inCar, speedKmh: Math.round(Math.abs(p.inCar ? p.inCar.speed : p.state.speed) * 3.6),
    peds: game.traffic.peds.length,
    pedArchetypes: game.traffic.archetypeCounts,
    aiCars: game.traffic.aiCarCount, parkedCars: game.traffic.parkedCount,
    policeUnits: game.police.units.length,
    vipersAlive: game.missions.vipers.filter((v) => v.health > 0).length,
    ammo: [game.combat.state.mag, game.combat.state.reserve],
    timeOfDay: Number(game.timeOfDay.toFixed(2)),
    errors: window.__errors.slice(),
  };
}
window.__game = {
  game, version: 'solara-bay-v2',
  getState, start: (fromSave) => startGame(!!fromSave),
  saveGame: () => game.saveGame(),
  setWanted: (n, reason) => game.police.setWanted(n, reason || 'debug'),
  teleport: (x, z) => { game.player.pos.set(x, 0, z); },
  advance(seconds) {
    const n = Math.round(seconds / STEP);
    for (let i = 0; i < n; i += 1) tick(STEP);
    composer.render();
  },
};

// --- Main loop ---------------------------------------------------------------
let last = performance.now();
let accumulator = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (still) return; // E2E mode: no real-time ticks, no software-GL presents
  const frameDt = Math.min((now - last) / 1000, 0.25);
  last = now;
  if (!shotName) {
    accumulator += frameDt;
    let steps = 0;
    while (accumulator >= STEP && steps < 5) { tick(STEP); accumulator -= STEP; steps += 1; }
    if (steps === 5) accumulator = 0;
  }
  composer.render();
}

if (shotName) {
  // Screenshot staging: start the game, stage the scene, paint twice.
  startGame(false);
  stageShot(shotName, game);
  let painted = 0;
  (function paint() {
    composer.render();
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }());
} else {
  showScreen('title');
  requestAnimationFrame(frame);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.screen === 'playing') {
    game.screen = 'paused';
    showScreen('pause');
  }
});
