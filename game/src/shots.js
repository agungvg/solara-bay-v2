// Solara Bay v2 — screenshot staging for ?shot= presets.
// Written fresh for v2. Each preset stages the real game deterministically
// (same seed -> same frame), renders twice in main.js, then sets
// window.__shotReady. Face close-up uses characters.js stageFaceCloseup.
// Transient cards (mission brief, hint bar) are dismissed in every shot so
// the hero / car stays visible; the task bar still carries the objective.

import * as THREE from 'three';
import { stageFaceCloseup } from './characters.js';

export function stageShot(name, game) {
  const g = game;
  const player = g.player;
  const hud = g.hud;

  function putPlayerInCarAt(x, z, yaw, speedKmh) {
    const car = g.traffic.cars.find((c) => c.kind === 'parked');
    car.pos.set(x, 0, z);
    car.yaw = yaw;
    car.mesh.position.copy(car.pos);
    car.mesh.rotation.y = yaw;
    car.speed = speedKmh / 3.6;
    player.pos.set(x, 0, z);
    player.enterCar(car);
    g.audio.engineStart();
    return car;
  }

  if (name === 'play') {
    // Driving 97 km/h downtown on the x=52 avenue, heading north (-Z).
    const car = putPlayerInCarAt(52, -20, Math.PI, 97);
    g.advance(0.6);
    car.speed = 97 / 3.6; // coasting decay would otherwise read ~80 km/h
    hud.update(0.11); // refresh the speedo with the staged speed
    hud.hideBrief();
    hud.setTask('Free roam — explore Solara Bay');
    hud.note('Downtown — Bay Avenue');
    return;
  }

  if (name === 'chase') {
    // 3 stars, police closing on the player's car on the avenue.
    const car = putPlayerInCarAt(52, 10, Math.PI, 62);
    g.police.setWanted(3, 'stolen car');
    g.advance(2.0);
    car.speed = 62 / 3.6;
    hud.update(0.11); // refresh the speedo with the staged speed
    hud.setTask('On the run — lose the Bay PD');
    // Put the nearest unit head-on in view, ~14 m ahead, closing in.
    const units = g.police.units;
    if (units.length > 0) {
      const u = units[0];
      u.pos.set(52, 0, car.pos.z - 14);
      u.yaw = 0; // facing +Z, toward the player
      u.mesh.position.copy(u.pos);
      u.mesh.rotation.y = 0;
      u.speed = 12;
      u.status = 'pursue';
    }
    hud.hideBrief();
    return;
  }

  if (name === 'mission') {
    // Docks: Tomas on foot facing the 4 Vipers, mission 5 active.
    g.missions.startMission(4);
    player.pos.set(0, 0, 112);
    player.state.yaw = 0; // face +Z toward the Vipers
    player.state.camYaw = 0;
    g.advance(1.2);
    hud.hideBrief();
    return;
  }

  if (name === 'face') {
    // Character face close-up: HUD off, camera tight on Tomas's face.
    hud.hide();
    player.pos.set(0, 0, 26);
    player.state.yaw = Math.PI;
    player.group.rotation.y = Math.PI;
    g.advance(0.4);
    stageFaceCloseup(player.group, g.camera);
    // Tighten: 35% closer than the default 1.2 m so the face fills frame.
    const head = new THREE.Vector3();
    player.group.userData.head.getWorldPosition(head);
    const dir = g.camera.position.clone().sub(head);
    g.camera.position.copy(head).addScaledVector(dir, 0.65);
    g.camera.lookAt(head.x, head.y + 0.03, head.z);
    return;
  }

  // Default: 'start' — plaza spawn, hero view toward the fountain.
  player.pos.set(0, 0, 26);
  player.state.yaw = Math.PI;
  player.state.camYaw = Math.PI;
  player.state.camPitch = 0.32;
  g.advance(1.5);
  hud.hideBrief();
  hud.note('Solara Bay — the plaza at golden hour');
}

