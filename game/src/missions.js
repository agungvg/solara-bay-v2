// Solara Bay v2 — six story missions with intro/outro cards, objectives,
// waypoints and rewards. Written fresh for v2. Tomas, Sal, Bay PD and the
// Vipers are invented names; nothing here copies any commercial game.

import * as THREE from 'three';
import { makeHuman, updateHuman } from './characters.js';
import { MISSIONS } from './config.js';
import { dist2 } from './utils.js';

const SAL_POS = new THREE.Vector3(10, 0, -6);
const DOCK_PACKAGE = new THREE.Vector3(8, 0, 128);
const BEACH_BAR = new THREE.Vector3(0, 0, 196);
const GARAGE = new THREE.Vector3(158, 0, 78);
const BEACH_RUN = new THREE.Vector3(0, 0, 200);

const BRIEFS = [
  {
    title: 'Mission 1 — Welcome to Solara Bay',
    intro: 'Tomas is new in town and broke. Sal, an old friend, waits by the plaza fountain with a job and a warning: the Bay PD watches everything. Walk to Sal and say hello.',
    outro: 'Sal: "Good to see you, Tomas. The city pays those who move fast — and punishes those who get caught. Here is $300 to start. Next: a package at the docks."',
  },
  {
    title: 'Mission 2 — Dockside Delivery',
    intro: 'Sal needs a package moved from the harbour yard to the beach bar — no questions asked. Pick it up at the docks, then carry it to the bar on the sand.',
    outro: 'Delivered, no questions. The bar keeper slips you $400 and a rumour: someone has been borrowing cars all over the garage district.',
  },
  {
    title: 'Mission 3 — Borrowed Wheels',
    intro: 'Sal wants a car at the garage on the east side — any car, any way you get it. Steal one (E near a car) and drive it to the garage marker. The clock is ticking: 90 seconds.',
    outro: 'The garage takes the car without a word. $500. Sal laughs: "You drive like you stole it — because you did."',
  },
  {
    title: 'Mission 4 — Lose the Heat',
    intro: 'The Bay PD is on to you. Get their attention up to 2 stars — then lose them completely. Break line of sight, slow down, and stay out of sight until the heat dies.',
    outro: 'Clean. The PD moves on to someone louder. $600, and a lesson: in Solara Bay, disappearing is a skill.',
  },
  {
    title: 'Mission 5 — Vipers at the Docks',
    intro: 'The Vipers, a dock gang, grabbed Sal\'s cut. Four of them wait at the harbour. Go to the docks and settle it — fists or pistol, your call. Watch your health.',
    outro: 'The docks are quiet again. Sal gets his cut back, and you get $800. One job left — the big one.',
  },
  {
    title: 'Mission 6 — The Beach Run',
    intro: 'Final job: drive to the beachfront before the PD locks the city down. Get in a car and reach the beach marker within 120 seconds. Finish this, and Solara Bay is yours.',
    outro: 'You made it. The sea, the sun, the whole city behind you — and $1,000 richer. SOLARA BAY: story complete. Free roam continues.',
  },
];

export function createMissions(scene, city, game) {
  // Sal — old friend, red jacket, waits by the fountain.
  const sal = makeHuman({
    height: 1.78, skin: 0xc98d64, hairColor: 0x3a2a1a, hairStyle: 'short',
    topColor: 0x8a2a24, jacketColor: 0x8a2a24, bottomColor: 0x2c3440,
    shoesColor: 0x2a2018, archetype: 'talker', female: false, seed: 90210,
  });
  sal.position.copy(SAL_POS);
  sal.rotation.y = Math.PI * 0.75;
  scene.add(sal);

  // Package for mission 2.
  const pkgGeo = new THREE.BoxGeometry(0.55, 0.4, 0.55);
  const pkg = new THREE.Mesh(pkgGeo, new THREE.MeshStandardMaterial({ color: 0xe8c832, roughness: 0.4, metalness: 0.3, emissive: 0x554400, emissiveIntensity: 0.5 }));
  pkg.position.set(DOCK_PACKAGE.x, 0.7, DOCK_PACKAGE.z);
  pkg.visible = false;
  scene.add(pkg);

  // Waypoint beacon: gold cylinder + beam, moved to the active objective.
  const beacon = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 0.18, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  );
  ring.position.y = 0.1;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.55, 26, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 13;
  beacon.add(ring, beam);
  beacon.visible = false;
  scene.add(beacon);

  const vipers = [];
  const state = {
    index: 0, step: 0, active: false, done: false,
    timer: 0, timerMax: 0, hasPackage: false, sawHeat: false,
    objectiveText: '', waypoint: null, talkOpen: false,
  };

  function objectiveFor(i, step) {
    switch (i) {
      case 0: return { text: 'Meet Sal at the plaza fountain', waypoint: SAL_POS };
      case 1: return step === 0
        ? { text: 'Pick up the package at the docks', waypoint: DOCK_PACKAGE }
        : { text: 'Deliver the package to the beach bar', waypoint: BEACH_BAR };
      case 2: return step === 0
        ? { text: 'Steal a car (E near any car)', waypoint: null }
        : { text: 'Drive the car to the garage — 90s', waypoint: GARAGE };
      case 3: return step === 0
        ? { text: 'Raise your wanted level to 2 stars', waypoint: null }
        : { text: 'Lose the Bay PD — stay unseen until clean', waypoint: null };
      case 4: return { text: 'Defeat the 4 Vipers at the docks', waypoint: new THREE.Vector3(0, 0, 130) };
      case 5: return { text: 'Drive to the beachfront — 120s', waypoint: BEACH_RUN };
      default: return { text: 'Free roam — explore Solara Bay', waypoint: null };
    }
  }

  function spawnVipers() {
    const spots = [[-8, 122], [6, 136], [-2, 142], [12, 126]];
    for (let i = 0; i < 4; i += 1) {
      const v = makeHuman({
        height: 1.82 + i * 0.02, skin: 0xd9a077, hairColor: 0x14100c, hairStyle: 'short',
        topColor: 0x1f2a1f, jacketColor: 0x1f2a1f, bottomColor: 0x141414,
        shoesColor: 0x141414, archetype: 'walker', female: false, seed: 5000 + i * 77,
      });
      v.position.set(spots[i][0], 0, spots[i][1]);
      scene.add(v);
      vipers.push({ human: v, pos: v.position, yaw: 0, health: 90, attackCooldown: 0, id: 'viper-' + i });
    }
  }

  function clearVipers() {
    for (const v of vipers) scene.remove(v.human);
    vipers.length = 0;
  }

  function refreshObjective() {
    const o = objectiveFor(state.index, state.step);
    state.objectiveText = o.text;
    state.waypoint = o.waypoint;
    if (o.waypoint) { beacon.position.set(o.waypoint.x, 0, o.waypoint.z); beacon.visible = true; }
    else beacon.visible = false;
    game.hud.setTask((MISSIONS[state.index] ? MISSIONS[state.index].title + ' — ' : '') + o.text);
  }

  function startMission(i) {
    state.index = i; state.step = 0; state.active = true; state.done = false;
    state.timer = 0; state.timerMax = 0; state.hasPackage = false; state.sawHeat = false;
    if (i === 1) pkg.visible = true;
    if (i === 2) state.timerMax = 90;
    if (i === 4) spawnVipers();
    if (i === 5) state.timerMax = 120;
    game.hud.showBrief(BRIEFS[i].title, BRIEFS[i].intro);
    refreshObjective();
  }

  function completeMission() {
    const m = MISSIONS[state.index];
    game.addMoney(m.reward);
    game.audio.missionDone();
    game.hud.showBrief(m.title + ' — COMPLETE  +$' + m.reward, BRIEFS[state.index].outro);
    game.hud.note('Mission complete! +$' + m.reward);
    game.saveGame();
    if (state.index === 1) pkg.visible = false;
    if (state.index === 4) clearVipers();
    state.active = false;
    state.done = true;
    beacon.visible = false;
    game.timers.push({
      t: 4, fn: () => {
        if (state.index + 1 < MISSIONS.length) startMission(state.index + 1);
        else {
          state.objectiveText = 'Story complete — free roam';
          game.hud.setTask('Story complete — free roam · explore Solara Bay');
        }
      },
    });
  }

  function advanceStep() {
    state.step += 1;
    if (state.index === 1 && state.step === 1) { pkg.visible = false; state.hasPackage = true; }
    if (state.index === 2 && state.step === 1) state.timer = state.timerMax;
    refreshObjective();
  }

  function failTimer() {
    game.hud.note('Too slow — try again');
    if (state.index === 2) { state.step = 0; state.timer = 0; refreshObjective(); }
    if (state.index === 5) { state.timer = state.timerMax; refreshObjective(); }
  }

  function talkToSal() {
    const p = game.player.pos;
    if (dist2(p.x, p.z, SAL_POS.x, SAL_POS.z) > 4.5) return false;
    if (state.index === 0 && state.active) {
      game.hud.showTalk('Sal', 'Tomas! You made it. The city pays those who move fast — and punishes those who get caught. Take this $300 and get to work.');
      game.audio.bark();
      state.talkOpen = true;
      game.timers.push({ t: 0.1, fn: () => {} });
      completeMission();
      return true;
    }
    game.hud.showTalk('Sal', 'The bay never sleeps, Tomas. Keep your head down and your pockets full.');
    return true;
  }

  function damageViper(v, dmg) {
    v.health = Math.max(0, v.health - dmg);
    if (v.health <= 0) {
      v.human.rotation.x = -Math.PI / 2 * 0.9;
      v.human.position.y = 0.25;
      game.hud.note('Viper down — ' + vipers.filter((x) => x.health > 0).length + ' left');
    }
  }

  function update(dt, time) {
    // Sal idles by the fountain; talks when the player is near.
    updateHuman(sal, state.talkOpen ? 'talk' : 'idle', dt, time);
    // Beacon pulse.
    if (beacon.visible) {
      const s = 1 + Math.sin(time * 3) * 0.12;
      ring.scale.set(s, 1, s);
      beam.material.opacity = 0.22 + Math.sin(time * 3) * 0.08;
    }
    if (pkg.visible) { pkg.rotation.y += dt * 1.2; pkg.position.y = 0.7 + Math.sin(time * 2) * 0.08; }
    // Vipers hunt the player.
    for (const v of vipers) {
      if (v.health <= 0) continue;
      const p = game.player.pos;
      const d = dist2(v.pos.x, v.pos.z, p.x, p.z);
      if (d < 45 && !game.player.inCar) {
        const dx = (p.x - v.pos.x) / Math.max(d, 0.001), dz = (p.z - v.pos.z) / Math.max(d, 0.001);
        v.pos.x += dx * 3.4 * dt; v.pos.z += dz * 3.4 * dt;
        v.yaw = Math.atan2(dx, dz);
        v.human.rotation.y = v.yaw;
        v.attackCooldown -= dt;
        if (d < 1.9 && v.attackCooldown <= 0) {
          v.attackCooldown = 1.4;
          game.player.damage(5, game);
          game.hud.note('A Viper hit you!');
        }
        updateHuman(v.human, 'walk', dt, time);
      } else {
        updateHuman(v.human, 'idle', dt, time);
      }
    }
    if (!state.active) return;
    const p = game.player.pos;
    // Timers for missions 3 (step 1) and 6.
    if (state.timerMax > 0 && ((state.index === 2 && state.step === 1) || state.index === 5)) {
      state.timer -= dt;
      if (state.timer <= 0) { state.timer = 0; failTimer(); }
    }
    switch (state.index) {
      case 0: break; // completed by talking to Sal
      case 1:
        if (state.step === 0 && dist2(p.x, p.z, DOCK_PACKAGE.x, DOCK_PACKAGE.z) < 2.2) {
          game.audio.pickup();
          game.hud.note('Package picked up — take it to the beach bar');
          advanceStep();
        } else if (state.step === 1 && dist2(p.x, p.z, BEACH_BAR.x, BEACH_BAR.z) < 3) completeMission();
        break;
      case 2:
        if (state.step === 0 && game.player.inCar) { advanceStep(); game.hud.note('Now drive to the garage — fast!'); }
        else if (state.step === 1 && game.player.inCar && dist2(p.x, p.z, GARAGE.x, GARAGE.z) < 7) completeMission();
        break;
      case 3:
        if (state.step === 0 && game.police.wanted >= 2) { state.sawHeat = true; advanceStep(); game.hud.note('Heat is on — now lose them!'); }
        else if (state.step === 1 && state.sawHeat && game.police.wanted === 0) completeMission();
        break;
      case 4:
        if (vipers.length > 0 && vipers.every((v) => v.health <= 0)) completeMission();
        break;
      case 5:
        if (state.step === 0 && game.player.inCar) state.step = 1;
        if (game.player.inCar && dist2(p.x, p.z, BEACH_RUN.x, BEACH_RUN.z) < 7) completeMission();
        break;
      default: break;
    }
  }

  return {
    state, vipers, sal,
    startMission, completeMission, talkToSal, damageViper, update,
    get objectiveText() { return state.objectiveText; },
    get waypoint() { return state.waypoint; },
    get timer() { return state.timer; },
    get index() { return state.index; },
    get active() { return state.active; },
  };
}
