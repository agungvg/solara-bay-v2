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
    // Visible traffic: one AI car ahead in the same lane, one oncoming,
    // so the road reads as traffic, not an empty street. Placed relative
    // to the car's ACTUAL position: advance(0.6) at 97 km/h moves it ~16 m
    // north of its spawn, so fixed coordinates would strand them behind.
    const ai = g.traffic.cars.filter((c) => c.kind === 'ai');
    if (ai.length >= 2) {
      const a1 = ai[0];
      a1.pos.set(car.pos.x - 2.4, 0, car.pos.z - 26);
      a1.yaw = Math.PI;
      a1.mesh.rotation.y = Math.PI;
      const a2 = ai[1];
      a2.pos.set(car.pos.x + 2.4, 0, car.pos.z - 14);
      a2.yaw = 0;
      a2.mesh.rotation.y = 0;
    }
    // Closer camera (8 m behind the car instead of the 10.5 m chase cam):
    // the hero car fills the frame, road + traffic ahead. Also relative
    // to the car's actual position (same ~16 m drift as above).
    g.camera.position.set(car.pos.x, 2.9, car.pos.z + 8);
    g.camera.lookAt(car.pos.x, 1.2, car.pos.z - 8);
    g.camera.updateMatrixWorld(true);
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
    // Second unit in the left lane, 12 m ahead — two police cars in
    // frame, so the pursuit reads as a response, not a single car.
    if (units.length > 1) {
      const u2 = units[1];
      u2.pos.set(47.5, 0, car.pos.z - 12);
      u2.yaw = Math.PI; // same direction as the player, pursuing
      u2.mesh.position.copy(u2.pos);
      u2.mesh.rotation.y = Math.PI;
      u2.speed = 12;
      u2.status = 'pursue';
    }
    hud.hideBrief();
    // Closer camera (8.5 m behind instead of 10.5 m): the hero car is
    // large in the frame and the police car ahead is still in shot.
    // Relative to the car's ACTUAL position: advance(2.0) at 62 km/h moves
    // it ~34 m north of its spawn, so fixed coordinates would strand the
    // camera ~42 m behind the car.
    g.camera.position.set(car.pos.x, 2.9, car.pos.z + 8.5);
    g.camera.lookAt(car.pos.x, 1.2, car.pos.z - 14);
    g.camera.updateMatrixWorld(true);
    return;
  }

  if (name === 'mission') {
    // Docks: Tomas on foot facing the 4 Vipers, mission 5 active.
    g.missions.startMission(4);
    player.pos.set(0, 0, 112);
    player.state.yaw = 0; // face +Z toward the Vipers
    player.state.camYaw = 0;
    g.advance(1.2);
    // Group the Vipers into a loose arc 9-15 m ahead so they read as a
    // gang, not four specks across an empty yard. (The old staging left
    // the yard empty and the figures small and dark.)
    const arc = [[-5, 121], [5, 123], [0, 127], [10, 120]];
    g.missions.vipers.forEach((v, i) => {
      const [x, z] = arc[i % arc.length];
      v.pos.set(x, 0, z);
      v.yaw = Math.atan2(player.pos.x - x, player.pos.z - z);
      v.human.rotation.y = v.yaw;
    });
    // Aim pose: right arm forward, pistol toward the Vipers. Set AFTER
    // the last advance() so updateHuman() cannot reset it.
    const parts = player.group.userData.parts;
    if (parts && parts.armR) {
      parts.armR.rotation.x = -1.35;
      parts.armR.userData.elbow.rotation.x = -0.15;
    }
    hud.hideBrief();
    // Closer camera, behind-right of the hero (pistol side), Vipers +
    // beacon ahead. 5.5 m back instead of the default 6.8 m on-foot cam.
    g.camera.position.set(2.2, 2.6, 106.5);
    g.camera.lookAt(0, 1.3, 121);
    g.camera.updateMatrixWorld(true);
    // One staged shot: the muzzle flash + tracer prove the combat is
    // real. Shot damage (34) cannot kill a Viper (90 HP), so the gang
    // stays at 4. HUD ammo updates to 11 / 48 via shoot() -> setAmmo().
    g.combat.shoot();
    hud.update(0.11);
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

