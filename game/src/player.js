// Solara Bay v2 — third-person on-foot controller + camera, enter/exit car.
// Written fresh for v2. Uses createPlayer + updateHuman from characters.js.
// Forward is +Z on the human; yaw=PI faces -Z (from spawn toward the plaza).

import * as THREE from 'three';
import { createPlayer, updateHuman } from './characters.js';
import { PLAYER, WORLD } from './config.js';
import { clamp, collideWorld } from './utils.js';

export function createPlayerController(scene, city, startPos) {
  const group = createPlayer();
  group.position.copy(startPos);
  group.rotation.y = Math.PI;
  scene.add(group);

  const state = {
    group,
    pos: group.position,           // alias: group.position IS the position
    yaw: Math.PI,                  // facing -Z, toward the plaza fountain
    camYaw: Math.PI,
    camPitch: 0.32,
    camDist: 6.8,
    speed: 0,
    moving: false,
    pose: 'idle',
    health: PLAYER.maxHealth,
    inCar: null,                   // traffic car object when driving
    hurtFlash: 0,
    stepTimer: 0,
    dead: false,
  };

  const camTarget = new THREE.Vector3();
  const desired = new THREE.Vector3();

  function lookAtCamera(camera) {
    // Camera sits behind the player at camYaw/camPitch, looking at the chest.
    const d = state.camDist;
    const cy = Math.cos(state.camPitch), sy = Math.sin(state.camPitch);
    desired.set(
      state.pos.x - Math.sin(state.camYaw) * cy * d,
      state.pos.y + 1.6 + sy * d,
      state.pos.z - Math.cos(state.camYaw) * cy * d,
    );
    desired.y = Math.max(desired.y, 0.7);
    camera.position.lerp(desired, 0.35);
    camTarget.set(state.pos.x, state.pos.y + 1.5, state.pos.z);
    camera.lookAt(camTarget);
  }

  function update(dt, input, colliders, time, game) {
    if (state.inCar) return; // traffic owns the car; camera follows it in main
    const look = input.takeLook();
    state.camYaw -= look.dx * 0.0032;
    state.camPitch = clamp(state.camPitch + look.dy * 0.0024, 0.08, 1.1);

    const mv = input.move();
    const run = input.sprint;
    const speed = run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    // Camera-relative movement on the ground plane.
    const sin = Math.sin(state.camYaw), cos = Math.cos(state.camYaw);
    let mx = 0, mz = 0;
    if (mv.f !== 0 || mv.s !== 0) {
      mx = sin * mv.f + cos * mv.s;
      mz = cos * mv.f - sin * mv.s;
      const len = Math.hypot(mx, mz) || 1;
      mx /= len; mz /= len;
    }
    state.moving = mv.f !== 0 || mv.s !== 0;
    state.speed = state.moving ? speed : 0;
    if (state.moving) {
      state.pos.x += mx * speed * dt;
      state.pos.z += mz * speed * dt;
      collideWorld(state.pos, PLAYER.radius, colliders);
      state.pos.x = clamp(state.pos.x, -WORLD.half, WORLD.half);
      state.pos.z = clamp(state.pos.z, -WORLD.half, WORLD.half);
      // Face the direction of travel.
      const targetYaw = Math.atan2(mx, mz);
      let d = targetYaw - state.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      state.yaw += d * Math.min(1, dt * 12);
      state.stepTimer -= dt;
      if (state.stepTimer <= 0) {
        state.stepTimer = run ? 0.28 : 0.42;
        game.audio.footstep(run);
      }
    }
    group.rotation.y = state.yaw;
    state.pose = state.moving ? 'walk' : 'idle';
    updateHuman(group, state.pose, dt, time);
    if (state.hurtFlash > 0) state.hurtFlash = Math.max(0, state.hurtFlash - dt * 2.2);
  }

  function enterCar(car) {
    state.inCar = car;
    group.visible = false;
    updateHuman(group, 'drive', 0, 0);
  }

  function exitCar(spot) {
    state.inCar = null;
    group.visible = true;
    if (spot) {
      state.pos.set(spot.x, 0, spot.z);
      collideWorld(state.pos, PLAYER.radius, city.colliders);
    }
    group.rotation.y = state.yaw;
    updateHuman(group, 'idle', 0, 0);
  }

  function damage(amount, game) {
    if (state.dead) return;
    state.health = Math.max(0, state.health - amount);
    state.hurtFlash = 1;
    if (state.health <= 0) { state.dead = true; game.onPlayerDown(); }
  }

  function heal(amount) { state.health = Math.min(PLAYER.maxHealth, state.health + amount); }

  return {
    state, group,
    update, lookAtCamera, enterCar, exitCar, damage, heal,
    get pos() { return state.pos; },
    get yaw() { return state.yaw; },
    get health() { return state.health; },
    get inCar() { return state.inCar; },
  };
}
