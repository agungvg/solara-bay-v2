// Solara Bay v2 — tuning constants. Written fresh for v2.
// City is ~440x440, ground y=0, ocean past z=212. 1 unit = 1 metre.
export const SEED = 20261118;
export const STEP = 1 / 60;
export const WORLD = { half: 215, beachZ: 212, groundY: 0 };

export const PLAYER = {
  walkSpeed: 4.2,
  runSpeed: 7.0,
  radius: 0.45,
  maxHealth: 100,
  startMoney: 200,
  punchRange: 1.9,
  punchDamage: 30,
  punchCooldown: 0.45,
};

export const CAR = {
  accel: 14,
  brake: 26,
  maxSpeed: 31,          // ~112 km/h
  maxReverse: 9,
  steer: 1.9,
  radius: 2.4,
  health: 100,
};

export const TRAFFIC = { aiCars: 12, parkedCars: 14, peds: 45 };

export const WANTED = {
  thresholds: [0, 1, 2, 3, 4, 5],
  decaySeconds: 14,      // clean again after this long unseen at <=2 stars
  maxUnits: 6,
  roadblockAt: 4,
};

export const COMBAT = {
  magSize: 12,
  reserveStart: 48,
  shotDamage: 34,
  reloadSeconds: 1.2,
  shootCooldown: 0.22,
  range: 80,
};

export const MISSIONS = [
  { id: 1, title: 'Welcome to Solara Bay', reward: 300 },
  { id: 2, title: 'Dockside Delivery', reward: 400 },
  { id: 3, title: 'Borrowed Wheels', reward: 500 },
  { id: 4, title: 'Lose the Heat', reward: 600 },
  { id: 5, title: 'Vipers at the Docks', reward: 800 },
  { id: 6, title: 'The Beach Run', reward: 1000 },
];

export const RADIO = [
  { station: 'BAY FM 98.4', tracks: ['Solara Sunset Drive', 'Palm Line Boogie', 'Harbour Lights'] },
  { station: 'TIDE 101.2', tracks: ['Salt Air', 'Night Ferry', 'Golden Hour'] },
  { station: 'VIPER ROCK 88.9', tracks: ['Engine Roar', 'Midnight Run', 'Concrete Coast'] },
];

export const PALETTE = {
  sky: 0x5e9bd6, horizon: 0xffe9c4, sun: 0xffe3b0,
  asphalt: 0x33363c, pavement: 0xc2b49a, sand: 0xe9d49b,
  policeBlue: 0x2e5cb0, policeWhite: 0xe8e8e8,
};

export const SAVE_KEY = 'solara-bay-v2.save.v1';
export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
