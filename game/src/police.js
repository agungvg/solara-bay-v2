// Solara Bay v2 — wanted level + Bay PD pursuit.
// Written fresh for v2. Wanted 0-5 stars; police cars chase and ram, set
// roadblocks at 4+, search the last known position when they lose sight,
// and bust the player on foot when they close in. Busted = caught on foot,
// wasted = health 0 (handled by the player module).

import * as THREE from 'three';
import { buildCarMesh } from './traffic.js';
import { WANTED } from './config.js';
import { angleLerp, clamp, dist2, mulberry32 } from './utils.js';

const UNIT_NAMES = ['Unit 7', 'Unit 12', 'Unit 19', 'Unit 23', 'Unit 31', 'Unit 44'];
const UNIT_STATUS = { pursue: 'Pursuing', search: 'Searching', block: 'Roadblock', arrive: 'Responding' };

export function createPolice(scene, city, game) {
  const rng = mulberry32(99173);
  const units = [];
  let wanted = 0;
  let unseenTimer = 0;
  let lastKnown = new THREE.Vector3();
  let bustTimer = 0;
  let roadblockSet = false;
  let sirenOn = false;

  function wantedCount() { return wanted; }

  function spawnUnit() {
    const mesh = buildCarMesh(0xe8e8e8, true);
    // Spawn on a road ring around the player, 40-60m away.
    const ang = rng() * Math.PI * 2;
    const px = clamp(game.player.pos.x + Math.cos(ang) * 50, -200, 200);
    const pz = clamp(game.player.pos.z + Math.sin(ang) * 50, -200, 200);
    mesh.position.set(px, 0, pz);
    scene.add(mesh);
    const unit = {
      id: 'pd-' + units.length,
      name: UNIT_NAMES[units.length % UNIT_NAMES.length],
      mesh, pos: mesh.position, yaw: 0, speed: 0,
      status: 'arrive', stateTimer: 0, ramCooldown: 0,
    };
    units.push(unit);
    return unit;
  }

  function removeUnit(unit) {
    scene.remove(unit.mesh);
    const i = units.indexOf(unit);
    if (i >= 0) units.splice(i, 1);
  }

  function setWanted(level, reason) {
    const next = clamp(level, 0, 5);
    if (next === wanted) return;
    wanted = next;
    unseenTimer = 0;
    bustTimer = 0;
    game.hud.setWanted(wanted);
    if (wanted > 0) {
      game.hud.note(reason ? 'Wanted ' + wanted + '★ — ' + reason : 'Wanted ' + wanted + '★');
      game.audio.sirenStart();
      sirenOn = true;
    } else {
      game.hud.note('You lost the Bay PD. Clean — for now.');
      game.audio.sirenStop();
      sirenOn = false;
      for (const u of [...units]) removeUnit(u);
      roadblockSet = false;
    }
    game.hud.setPoliceUnits(units.map((u) => ({ name: u.name, status: UNIT_STATUS[u.status] || u.status })));
  }

  function addWanted(n, reason) { setWanted(wanted + n, reason); }

  /** A witness saw a crime: police are called after a short delay. */
  function witnessCall(delaySeconds = 4) {
    if (wanted >= 5) return;
    game.timers.push({ t: delaySeconds, fn: () => addWanted(1, 'a witness called it in') });
  }

  function placeRoadblock() {
    // Two police cars parked across the road ahead of the player's heading.
    const p = game.player;
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    for (let i = 0; i < 2; i += 1) {
      const mesh = buildCarMesh(0xe8e8e8, true);
      const bx = p.pos.x + fx * 26 + (i === 0 ? -fz * 3 : fz * 3);
      const bz = p.pos.z + fz * 26 + (i === 0 ? fx * 3 : -fx * 3);
      mesh.position.set(bx, 0, bz);
      mesh.rotation.y = p.yaw + Math.PI / 2;
      scene.add(mesh);
      units.push({
        id: 'rb-' + i, name: UNIT_NAMES[(units.length + i) % UNIT_NAMES.length],
        mesh, pos: mesh.position, yaw: mesh.rotation.y, speed: 0,
        status: 'block', stateTimer: 0, ramCooldown: 0, roadblock: true,
      });
    }
    roadblockSet = true;
    game.hud.note('Bay PD roadblock ahead!');
  }

  function update(dt, time) {
    if (wanted === 0) return;
    // Keep unit count matched to wanted level (1..wanted+1, capped).
    const want = Math.min(WANTED.maxUnits, wanted + 1);
    while (units.filter((u) => !u.roadblock).length < want) spawnUnit();
    while (units.filter((u) => !u.roadblock).length > want) {
      const u = units.find((x) => !x.roadblock);
      if (u) removeUnit(u); else break;
    }
    if (wanted >= WANTED.roadblockAt && !roadblockSet) placeRoadblock();

    const pp = game.player.pos;
    const playerSpeed = game.player.inCar ? Math.abs(game.player.inCar.speed) : game.player.state.speed;
    // Last known position only refreshes while a unit is close enough to see.
    let nearestNow = Infinity;
    for (const u of units) nearestNow = Math.min(nearestNow, dist2(u.pos.x, u.pos.z, pp.x, pp.z));
    if (nearestNow < 60) lastKnown.set(pp.x, 0, pp.z);

    // Lose-the-heat: unseen + slow at low wanted decays the level.
    if (wanted <= 2) {
      let nearest = Infinity;
      for (const u of units) nearest = Math.min(nearest, dist2(u.pos.x, u.pos.z, pp.x, pp.z));
      if (nearest > 55 && playerSpeed < 3) unseenTimer += dt; else unseenTimer = 0;
      if (unseenTimer > WANTED.decaySeconds) { setWanted(wanted - 1, ''); unseenTimer = 0; }
    }

    let busted = false;
    for (const unit of units) {
      if (unit.roadblock) {
        unit.status = 'block';
        continue;
      }
      const d = dist2(unit.pos.x, unit.pos.z, pp.x, pp.z);
      unit.status = d < 60 ? 'pursue' : 'search';
      const targetSpeed = unit.status === 'pursue' ? 13 + wanted * 2.4 : 8;
      // Steer toward the player (pursue) or the last known spot (search).
      const tx = unit.status === 'pursue' ? pp.x : lastKnown.x;
      const tz = unit.status === 'pursue' ? pp.z : lastKnown.z;
      const wantYaw = Math.atan2(tx - unit.pos.x, tz - unit.pos.z);
      unit.yaw = angleLerp(unit.yaw, wantYaw, Math.min(1, dt * 1.6));
      unit.speed = THREE.MathUtils.lerp(unit.speed, targetSpeed, Math.min(1, dt * 0.9));
      unit.pos.x += Math.sin(unit.yaw) * unit.speed * dt;
      unit.pos.z += Math.cos(unit.yaw) * unit.speed * dt;
      unit.mesh.rotation.y = unit.yaw;
      for (const w of unit.mesh.userData.wheels) w.rotation.x += unit.speed * dt * 2.4;
      // Police light flash.
      if (unit.mesh.userData.policeLights) {
        const phase = Math.floor(time * 6) % 2 === 0;
        unit.mesh.userData.policeLights[0].material.emissiveIntensity = phase ? 2.4 : 0.2;
        unit.mesh.userData.policeLights[1].material.emissiveIntensity = phase ? 0.2 : 2.4;
      }
      unit.ramCooldown -= dt;
      // Ram: contact with the player car damages it; contact on foot busts.
      if (d < 3.4 && unit.ramCooldown <= 0) {
        unit.ramCooldown = 1.2;
        if (game.player.inCar) {
          const car = game.player.inCar;
          car.health -= 12;
          game.player.damage(4, game);
          game.hud.note('Bay PD rammed your car!');
          game.audio.punch();
        } else {
          bustTimer += 1.2;
        }
      }
      if (!game.player.inCar && d < 2.6) bustTimer += dt;
    }
    if (bustTimer > 1.6) { bustTimer = 0; busted = true; }
    game.hud.setPoliceUnits(units.map((u) => ({ name: u.name, status: UNIT_STATUS[u.status] || u.status })));
    if (busted) game.onBusted();
  }

  function clearAll() {
    for (const u of [...units]) removeUnit(u);
    roadblockSet = false;
    setWanted(0, '');
  }

  return {
    update, setWanted, addWanted, witnessCall, clearAll,
    get wanted() { return wanted; },
    get units() { return units; },
  };
}
