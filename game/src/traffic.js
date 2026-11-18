// Solara Bay v2 — traffic, pedestrians, pickups, car stealing.
// Written fresh for v2. Cars are procedural low-poly builds (boxes +
// cylinders, palette colours); people come from characters.js createNPC.
// 12 AI cars drive the road grid, 14 sit parked at the city's carSpots,
// 45 pedestrians walk routines across the plaza, sidewalks and beachfront.

import * as THREE from 'three';
import { createNPC, updateHuman, ARCHETYPES } from './characters.js';
import { CAR, TRAFFIC } from './config.js';
import { angleDelta, clamp, collideWorld, dist2, mulberry32, pick, range } from './utils.js';

const CAR_COLORS = [0xc23b2e, 0x2e5cb0, 0xe8c832, 0x3a9e5c, 0xd98a6b, 0x6b8ca3, 0xe8e2d2, 0x33363c, 0x9fb27f, 0xa95f43];
const ROADS = [-208, -156, -104, -52, 52, 104, 156, 208];
const CHATTER = [
  'Beautiful day on the bay.', 'Did you see the Bay PD chase?', 'The market has fresh fish today.',
  'I heard the Vipers are back at the docks.', 'This sun never quits.', 'Coffee at the plaza, then work.',
  'The ferry is late again.', 'Sal knows everyone in this city.', 'Watch out for the traffic on Bay Avenue.',
];

const CAR_GEO = {
  body: new THREE.BoxGeometry(1, 1, 1),
  cabin: new THREE.BoxGeometry(1, 1, 1),
  wheel: new THREE.CylinderGeometry(0.34, 0.34, 0.24, 12),
  light: new THREE.BoxGeometry(0.28, 0.12, 0.06),
};
const CAR_MAT = new Map();
function carMat(color, rough = 0.45, metal = 0.35) {
  const k = color + '|' + rough;
  if (!CAR_MAT.has(k)) CAR_MAT.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
  return CAR_MAT.get(k);
}
const GLASS_MAT = new THREE.MeshStandardMaterial({ color: 0x1c2a33, roughness: 0.15, metalness: 0.6 });
const TYRE_MAT = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 });
const LIGHT_MAT = new THREE.MeshStandardMaterial({ color: 0xffe9a8, roughness: 0.3, emissive: 0x554400, emissiveIntensity: 0.4 });
const TAIL_MAT = new THREE.MeshStandardMaterial({ color: 0xa02020, roughness: 0.4, emissive: 0x400000, emissiveIntensity: 0.5 });

function buildCarMesh(color, police) {
  const g = new THREE.Group();
  const bodyCol = police ? 0xe8e8e8 : color;
  const body = new THREE.Mesh(CAR_GEO.body, carMat(bodyCol));
  body.scale.set(1.9, 0.62, 4.3);
  body.position.y = 0.55;
  body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(CAR_GEO.cabin, police ? carMat(0x2e5cb0, 0.4, 0.2) : GLASS_MAT);
  cabin.scale.set(1.65, 0.55, 2.1);
  cabin.position.set(0, 1.12, -0.25);
  cabin.castShadow = true;
  g.add(cabin);
  if (police) {
    const stripe = new THREE.Mesh(CAR_GEO.body, carMat(0x2e5cb0, 0.5, 0.1));
    stripe.scale.set(1.92, 0.16, 4.32);
    stripe.position.y = 0.72;
    g.add(stripe);
    const bar = new THREE.Mesh(CAR_GEO.body, new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4 }));
    bar.scale.set(1.1, 0.1, 0.3);
    bar.position.set(0, 1.46, -0.25);
    g.add(bar);
    const r = new THREE.Mesh(CAR_GEO.light, new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff1010, emissiveIntensity: 2 }));
    r.scale.set(1, 1, 1); r.position.set(-0.32, 1.54, -0.25); r.userData.policeLight = 'red';
    const b = new THREE.Mesh(CAR_GEO.light, new THREE.MeshStandardMaterial({ color: 0x2040ff, emissive: 0x1020ff, emissiveIntensity: 2 }));
    b.position.set(0.32, 1.54, -0.25); b.userData.policeLight = 'blue';
    g.add(r, b);
    g.userData.policeLights = [r, b];
  }
  const wheels = [];
  for (const [x, z] of [[-0.85, 1.35], [0.85, 1.35], [-0.85, -1.35], [0.85, -1.35]]) {
    const w = new THREE.Mesh(CAR_GEO.wheel, TYRE_MAT);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.34, z);
    g.add(w); wheels.push(w);
  }
  const hl = new THREE.Mesh(CAR_GEO.light, LIGHT_MAT);
  hl.position.set(-0.6, 0.6, 2.16); g.add(hl);
  const hl2 = hl.clone(); hl2.position.x = 0.6; g.add(hl2);
  const tl = new THREE.Mesh(CAR_GEO.light, TAIL_MAT);
  tl.position.set(-0.6, 0.6, -2.16); g.add(tl);
  const tl2 = tl.clone(); tl2.position.x = 0.6; g.add(tl2);
  g.userData.wheels = wheels;
  return g;
}

export function createTraffic(scene, city, rng, game) {
  const cars = [];
  const peds = [];
  const pickups = [];
  const parkedSpots = city.carSpots.slice();

  // --- AI driving cars -------------------------------------------------
  for (let i = 0; i < TRAFFIC.aiCars; i += 1) {
    const axis = rng() < 0.5 ? 'x' : 'z';
    const line = pick(rng, ROADS);
    const dir = rng() < 0.5 ? 1 : -1;
    const lane = (rng() < 0.5 ? -1 : 1) * 2.4;
    const mesh = buildCarMesh(pick(rng, CAR_COLORS), false);
    const pos = axis === 'x'
      ? new THREE.Vector3(range(rng, -200, 200), 0, line + lane)
      : new THREE.Vector3(line + lane, 0, range(rng, -200, 200));
    mesh.position.copy(pos);
    mesh.rotation.y = axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
    scene.add(mesh);
    cars.push({
      id: 'ai-' + i, kind: 'ai', mesh, pos: mesh.position,
      yaw: mesh.rotation.y, speed: range(rng, 8, 14), cruise: range(rng, 8, 14),
      axis, line, dir, lane, health: CAR.health, driver: null, stolen: false, honkTimer: range(rng, 5, 20),
    });
  }

  // --- Parked cars (stealable) ------------------------------------------
  for (let i = 0; i < TRAFFIC.parkedCars && i < parkedSpots.length; i += 1) {
    const spot = parkedSpots[i];
    const mesh = buildCarMesh(pick(rng, CAR_COLORS), false);
    mesh.position.set(spot.x, 0, spot.z);
    // Parked along the avenue: face along the road.
    mesh.rotation.y = Math.abs(spot.x) > 100 ? 0 : Math.PI / 2;
    scene.add(mesh);
    cars.push({
      id: 'parked-' + i, kind: 'parked', mesh, pos: mesh.position,
      yaw: mesh.rotation.y, speed: 0, cruise: 0,
      axis: 'x', line: 0, dir: 1, lane: 0, health: CAR.health, driver: null, stolen: false,
    });
  }

  // --- Pedestrians -------------------------------------------------------
  const archetypeCounts = {};
  for (let i = 0; i < TRAFFIC.peds; i += 1) {
    const archetype = ARCHETYPES[i % ARCHETYPES.length];
    archetypeCounts[archetype] = (archetypeCounts[archetype] || 0) + 1;
    const human = createNPC(archetype, rng);
    // Spread across plaza, sidewalks, beachfront and harbour walk.
    const zone = rng();
    let x, z;
    if (zone < 0.4) { x = range(rng, -45, 45); z = range(rng, -45, 45); }
    else if (zone < 0.7) { const road = pick(rng, ROADS); x = road + range(rng, -8, 8); z = range(rng, -200, 200); if (rng() < 0.5) { const t = x; x = z; z = t; } }
    else if (zone < 0.85) { x = range(rng, -120, 120); z = range(rng, 186, 208); }
    else { x = range(rng, -70, 70); z = range(rng, 100, 160); }
    human.position.set(x, 0, z);
    human.rotation.y = rng() * Math.PI * 2;
    human.userData.pedRef = null;
    scene.add(human);
    const ped = {
      id: 'ped-' + i, human, archetype,
      pos: human.position, yaw: human.rotation.y,
      dest: new THREE.Vector3(x, 0, z), state: 'walk',
      timer: range(rng, 0, 4), speed: range(rng, 1.1, 1.9),
      health: 100, down: 0, panicFrom: null, witnessAt: 0, barkTimer: range(rng, 8, 30),
      stuckTimer: 0, lastX: x, lastZ: z,
    };
    human.userData.pedRef = ped;
    peds.push(ped);
  }

  // --- Pickups: cash + health, scattered at named spots ------------------
  const pickupDefs = [
    { kind: 'cash', amount: 50, pos: [14, 0, -18] },
    { kind: 'cash', amount: 50, pos: [-38, 0, 44] },
    { kind: 'cash', amount: 75, pos: [60, 0, 132] },
    { kind: 'health', amount: 40, pos: [-20, 0, 196] },
    { kind: 'health', amount: 40, pos: [104, 0, -52] },
    { kind: 'cash', amount: 75, pos: [-104, 0, 104] },
  ];
  const pickupGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
  for (const def of pickupDefs) {
    const mat = new THREE.MeshStandardMaterial({
      color: def.kind === 'cash' ? 0xe8c832 : 0x6fbe4e, roughness: 0.3, metalness: 0.4,
      emissive: def.kind === 'cash' ? 0x664400 : 0x1a4400, emissiveIntensity: 0.7,
    });
    const mesh = new THREE.Mesh(pickupGeo, mat);
    mesh.position.set(def.pos[0], 0.9, def.pos[2]);
    scene.add(mesh);
    pickups.push({ ...def, mesh, taken: false, spin: 0 });
  }

  function randomDest(ped) {
    const zone = rng();
    if (zone < 0.45) return new THREE.Vector3(range(rng, -45, 45), 0, range(rng, -45, 45));
    if (zone < 0.8) {
      const road = pick(rng, ROADS);
      const off = (rng() < 0.5 ? -1 : 1) * range(rng, 5.5, 8.5);
      if (rng() < 0.5) return new THREE.Vector3(road + off, 0, range(rng, -200, 200));
      return new THREE.Vector3(range(rng, -200, 200), 0, road + off);
    }
    return new THREE.Vector3(range(rng, -120, 120), 0, range(rng, 186, 208));
  }

  function pedPoseFor(ped) {
    if (ped.state === 'panic') return 'panic';
    if (ped.state === 'sit') return 'sit';
    if (ped.state === 'talk' || ped.state === 'work') return 'talk';
    if (ped.state === 'walk') return 'walk';
    return 'idle';
  }

  function updatePeds(dt, time) {
    for (const ped of peds) {
      if (ped.down > 0) {
        ped.down -= dt;
        ped.human.rotation.x = ped.down > 0 ? -Math.PI / 2 * 0.9 : 0;
        if (ped.down <= 0) { ped.health = 100; ped.human.rotation.x = 0; ped.state = 'walk'; ped.dest = randomDest(ped); }
        continue;
      }
      if (ped.state === 'panic') {
        ped.timer -= dt;
        if (ped.panicFrom) {
          const dx = ped.pos.x - ped.panicFrom.x, dz = ped.pos.z - ped.panicFrom.z;
          const len = Math.hypot(dx, dz) || 1;
          ped.pos.x += (dx / len) * 5 * dt;
          ped.pos.z += (dz / len) * 5 * dt;
          ped.yaw = Math.atan2(dx / len, dz / len);
          collideWorld(ped.pos, 0.45, city.colliders);
        }
        if (ped.timer <= 0) { ped.state = 'walk'; ped.dest = randomDest(ped); }
      } else if (ped.state === 'walk') {
        const dx = ped.dest.x - ped.pos.x, dz = ped.dest.z - ped.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.8) {
          // Arrive: pick a street pose by archetype.
          ped.state = ped.archetype === 'sitter' ? 'sit'
            : ped.archetype === 'talker' || ped.archetype === 'shopkeeper' ? 'talk'
            : ped.archetype === 'worker' ? 'work' : 'idle';
          ped.timer = range(rng, 3, 9);
        } else {
          const vx = dx / d, vz = dz / d;
          ped.pos.x += vx * ped.speed * dt;
          ped.pos.z += vz * ped.speed * dt;
          collideWorld(ped.pos, 0.45, city.colliders);
          ped.yaw = Math.atan2(vx, vz);
          // Stuck against a wall? Pick a new destination.
          if (Math.hypot(ped.pos.x - ped.lastX, ped.pos.z - ped.lastZ) < 0.05) {
            ped.stuckTimer += dt;
            if (ped.stuckTimer > 3) { ped.dest = randomDest(ped); ped.stuckTimer = 0; }
          } else ped.stuckTimer = 0;
          ped.lastX = ped.pos.x; ped.lastZ = ped.pos.z;
        }
      } else {
        ped.timer -= dt;
        if (ped.timer <= 0) { ped.state = 'walk'; ped.dest = randomDest(ped); }
      }
      ped.human.rotation.y = ped.yaw;
      updateHuman(ped.human, pedPoseFor(ped), dt, time);
      // Occasional ambient bark.
      ped.barkTimer -= dt;
      if (ped.barkTimer <= 0) {
        ped.barkTimer = range(rng, 25, 60);
        if (dist2(ped.pos.x, ped.pos.z, game.player.pos.x, game.player.pos.z) < 30) {
          game.hud.bark(pick(rng, CHATTER));
        }
      }
    }
  }

  function updateCars(dt, time) {
    for (const car of cars) {
      if (car.kind === 'parked' || car.stolen) continue;
      if (car.kind === 'police') continue; // police module drives its own cars
      // Slow down for a car ahead in the same lane.
      let target = car.cruise;
      for (const other of cars) {
        if (other === car || other.axis !== car.axis || other.line !== car.line) continue;
        const along = car.axis === 'x' ? (other.pos.x - car.pos.x) * car.dir : (other.pos.z - car.pos.z) * car.dir;
        const lateral = car.axis === 'x' ? Math.abs(other.pos.z - car.pos.z) : Math.abs(other.pos.x - car.pos.x);
        if (along > 0 && along < 9 && lateral < 3) { target = 0; break; }
      }
      car.speed = THREE.MathUtils.lerp(car.speed, target, Math.min(1, dt * 1.5));
      const step = car.speed * car.dir * dt;
      if (car.axis === 'x') car.pos.x += step; else car.pos.z += step;
      const along = car.axis === 'x' ? car.pos.x : car.pos.z;
      if (along > 212 || along < -212) {
        // Wrap to the far end, possibly on a new road.
        const newLine = pick(rng, ROADS);
        car.line = newLine;
        if (car.axis === 'x') { car.pos.x = -car.dir * 210; car.pos.z = newLine + car.lane; }
        else { car.pos.z = -car.dir * 210; car.pos.x = newLine + car.lane; }
        car.cruise = range(rng, 8, 14);
      }
      car.mesh.rotation.y = car.yaw;
      for (const w of car.mesh.userData.wheels) w.rotation.x += car.speed * dt * 2.4;
      // Honk if the player blocks the lane ahead.
      car.honkTimer -= dt;
      if (car.honkTimer <= 0) {
        car.honkTimer = range(rng, 12, 30);
        const pd = dist2(car.pos.x, car.pos.z, game.player.pos.x, game.player.pos.z);
        if (pd < 12 && !game.player.inCar) game.audio.honk();
      }
    }
  }

  function updatePickups(dt, time) {
    for (const p of pickups) {
      if (p.taken) continue;
      p.spin += dt;
      p.mesh.rotation.y = p.spin * 1.5;
      p.mesh.position.y = 0.9 + Math.sin(p.spin * 2) * 0.12;
      if (!game.player.inCar && dist2(p.mesh.position.x, p.mesh.position.z, game.player.pos.x, game.player.pos.z) < 1.6) {
        p.taken = true;
        p.mesh.visible = false;
        if (p.kind === 'cash') { game.addMoney(p.amount); game.hud.note('Picked up $' + p.amount); }
        else { game.player.heal(p.amount); game.hud.note('Health +' + p.amount); }
        game.audio.pickup();
      }
    }
  }

  /** Flee + witness reactions to a crime at (x,z). Returns witness count. */
  function reactToCrime(x, z, loud) {
    let witnesses = 0;
    for (const ped of peds) {
      const d = dist2(ped.pos.x, ped.pos.z, x, z);
      if (d < (loud ? 42 : 22)) {
        ped.state = 'panic';
        ped.timer = 2.5 + rng() * 2;
        ped.panicFrom = { x, z };
        if (d < 26) witnesses += 1;
      }
    }
    return witnesses;
  }

  function nearestCar(pos, maxDist, kinds) {
    let best = null, bestD = maxDist;
    for (const car of cars) {
      if (kinds && !kinds.includes(car.kind)) continue;
      const d = dist2(car.pos.x, car.pos.z, pos.x, pos.z);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function nearestPed(pos, maxDist, includeDown = false) {
    let best = null, bestD = maxDist;
    for (const ped of peds) {
      if (ped.down > 0 && !includeDown) continue;
      const d = dist2(ped.pos.x, ped.pos.z, pos.x, pos.z);
      if (d < bestD) { bestD = d; best = ped; }
    }
    return best;
  }

  function update(dt, time) {
    updatePeds(dt, time);
    updateCars(dt, time);
    updatePickups(dt, time);
  }

  return {
    cars, peds, pickups, archetypeCounts,
    update, reactToCrime, nearestCar, nearestPed,
    get aiCarCount() { return cars.filter((c) => c.kind === 'ai').length; },
    get parkedCount() { return cars.filter((c) => c.kind === 'parked').length; },
  };
}

export { buildCarMesh };
