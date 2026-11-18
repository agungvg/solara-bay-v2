// Solara Bay v2 — punch + shoot combat with authored hit volumes.
// Written fresh for v2. Shots use ray-vs-sphere tests (no mesh raycast):
// each person is a torso sphere + head sphere, each car a centre sphere.
// Muzzle flash, tracer line and impact sparks are pooled presentation.

import * as THREE from 'three';
import { COMBAT } from './config.js';
import { clamp, raySphere } from './utils.js';

export function createCombat(scene, camera, game) {
  const state = {
    mag: COMBAT.magSize,
    reserve: COMBAT.reserveStart,
    cooldown: 0,
    punchCooldown: 0,
    reloadTimer: 0,
    reloading: false,
  };

  // Pooled tracer + sparks.
  const tracerGeo = new THREE.BufferGeometry();
  const tracerPos = new Float32Array(6);
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(tracerPos, 3));
  const tracer = new THREE.Line(tracerGeo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 }));
  tracer.frustumCulled = false;
  scene.add(tracer);
  let tracerLife = 0;

  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(24 * 3);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ color: 0xffd166, size: 0.14, transparent: true, opacity: 0 }));
  sparks.frustumCulled = false;
  scene.add(sparks);
  let sparkLife = 0;

  const flash = new THREE.PointLight(0xffe9a8, 0, 9, 1.6);
  scene.add(flash);
  let flashLife = 0;

  const muzzle = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0 }),
  );
  muzzle.visible = false;
  scene.add(muzzle);

  const rayDir = new THREE.Vector3();
  const muzzlePos = new THREE.Vector3();

  function personSpheres(ped) {
    // Torso + head spheres in world space (human faces +Z, origin at feet).
    const p = ped.pos;
    return [
      { x: p.x, y: 1.05, z: p.z, r: 0.42 },
      { x: p.x, y: 1.62, z: p.z, r: 0.22 },
    ];
  }

  function shoot() {
    if (state.cooldown > 0 || state.reloading) return false;
    if (state.mag <= 0) { game.hud.note('Out of ammo — press R to reload'); game.audio.reload(); return false; }
    state.mag -= 1;
    state.cooldown = COMBAT.shootCooldown;
    game.audio.gunshot();

    camera.getWorldDirection(rayDir);
    const o = camera.position;
    // Muzzle: just right of the player, at chest height.
    const p = game.player.pos;
    muzzlePos.set(p.x + Math.sin(game.player.yaw + 0.5) * 0.4, 1.35, p.z + Math.cos(game.player.yaw + 0.5) * 0.4);
    muzzle.position.copy(muzzlePos);
    muzzle.visible = true;
    flash.position.copy(muzzlePos);
    flash.intensity = 26;
    flashLife = 0.06;

    // Find the closest hit among people, Vipers and cars.
    let bestT = COMBAT.range;
    let hit = null;
    const targets = [];
    for (const ped of game.traffic.peds) {
      if (ped.down > 0) continue;
      for (const s of personSpheres(ped)) targets.push({ t: raySphere(o.x, o.y, o.z, rayDir.x, rayDir.y, rayDir.z, s.x, s.y, s.z, s.r), kind: 'ped', ref: ped });
    }
    for (const v of game.missions.vipers) {
      if (v.health <= 0) continue;
      for (const s of personSpheres(v)) targets.push({ t: raySphere(o.x, o.y, o.z, rayDir.x, rayDir.y, rayDir.z, s.x, s.y, s.z, s.r), kind: 'viper', ref: v });
    }
    for (const car of game.traffic.cars) {
      const t = raySphere(o.x, o.y, o.z, rayDir.x, rayDir.y, rayDir.z, car.pos.x, 1.0, car.pos.z, 2.6);
      targets.push({ t, kind: 'car', ref: car });
    }
    for (const t of targets) if (t.t < bestT) { bestT = t.t; hit = t; }

    const end = new THREE.Vector3().copy(o).addScaledVector(rayDir, bestT);
    tracerPos[0] = muzzlePos.x; tracerPos[1] = muzzlePos.y; tracerPos[2] = muzzlePos.z;
    tracerPos[3] = end.x; tracerPos[4] = end.y; tracerPos[5] = end.z;
    tracerGeo.attributes.position.needsUpdate = true;
    tracer.material.opacity = 0.95;
    tracerLife = 0.09;

    // Impact sparks at the hit point.
    for (let i = 0; i < 24; i += 1) {
      sparkPos[i * 3] = end.x + (Math.random() - 0.5) * 0.4;
      sparkPos[i * 3 + 1] = end.y + (Math.random() - 0.5) * 0.4;
      sparkPos[i * 3 + 2] = end.z + (Math.random() - 0.5) * 0.4;
    }
    sparkGeo.attributes.position.needsUpdate = true;
    sparks.material.opacity = 0.95;
    sparkLife = 0.25;

    if (hit) {
      if (hit.kind === 'ped') {
        hit.ref.health -= COMBAT.shotDamage;
        game.traffic.reactToCrime(hit.ref.pos.x, hit.ref.pos.z, true);
        if (hit.ref.health <= 0) { hit.ref.down = 10; hit.ref.health = 0; }
        game.police.addWanted(2, 'shots fired');
        game.hud.note('You shot a pedestrian — Bay PD is coming');
      } else if (hit.kind === 'viper') {
        game.missions.damageViper(hit.ref, COMBAT.shotDamage);
        game.hud.note('Hit a Viper — ' + Math.max(0, hit.ref.health) + ' HP left');
      } else if (hit.kind === 'car') {
        hit.ref.health -= COMBAT.shotDamage;
        if (hit.ref.health <= 0 && hit.ref.kind !== 'parked') hit.ref.speed = 0;
      }
    }
    game.hud.setAmmo(state.mag, state.reserve);
    return true;
  }

  function punch() {
    if (state.punchCooldown > 0) return false;
    state.punchCooldown = 0.45;
    game.audio.punch();
    const p = game.player;
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    // Nearest person in front, within range.
    let best = null, bestD = 1.9;
    const consider = (ref, pos) => {
      const dx = pos.x - p.pos.x, dz = pos.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < bestD && (dx * fx + dz * fz) / Math.max(d, 0.001) > 0.35) { bestD = d; best = ref; }
    };
    for (const ped of game.traffic.peds) if (ped.down <= 0) consider(ped, ped.pos);
    for (const v of game.missions.vipers) if (v.health > 0) consider(v, v.pos);
    if (!best) return true;
    if (best.health !== undefined && game.missions.vipers.includes(best)) {
      best.pos.x += fx * 1.2; best.pos.z += fz * 1.2; // knockback opens space
      game.missions.damageViper(best, 30);
      game.hud.note('You punched a Viper!');
    } else {
      best.health -= 30;
      best.pos.x += fx * 0.9; best.pos.z += fz * 0.9;
      if (best.health <= 0) { best.down = 10; best.health = 0; }
      const witnesses = game.traffic.reactToCrime(best.pos.x, best.pos.z, false);
      if (witnesses > 0) game.police.addWanted(1, 'assault witnessed');
      else game.police.witnessCall(5);
      game.hud.note('You punched a pedestrian');
    }
    return true;
  }

  function reload() {
    if (state.reloading || state.reserve <= 0 || state.mag === COMBAT.magSize) return;
    state.reloading = true;
    state.reloadTimer = COMBAT.reloadSeconds;
    game.audio.reload();
  }

  function update(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.punchCooldown = Math.max(0, state.punchCooldown - dt);
    if (state.reloading) {
      state.reloadTimer -= dt;
      if (state.reloadTimer <= 0) {
        const need = COMBAT.magSize - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take; state.reserve -= take;
        state.reloading = false;
        game.hud.setAmmo(state.mag, state.reserve);
      }
    }
    if (tracerLife > 0) { tracerLife -= dt; if (tracerLife <= 0) tracer.material.opacity = 0; }
    if (sparkLife > 0) { sparkLife -= dt; if (sparkLife <= 0) sparks.material.opacity = 0; }
    if (flashLife > 0) { flashLife -= dt; if (flashLife <= 0) { flash.intensity = 0; muzzle.visible = false; } }
    // Auto-fire while the mouse is held.
    if (game.input.mouseDown && !game.player.inCar) shoot();
  }

  return { state, shoot, punch, reload, update };
}
