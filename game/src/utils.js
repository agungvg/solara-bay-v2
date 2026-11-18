// Solara Bay v2 — small shared helpers: seeded RNG, math, AABB collision.
// Written fresh for v2. No dependencies.

export function mulberry32(seed) {
  let a = (seed >>> 0) || 1;
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length) % arr.length]; }
export function range(rng, lo, hi) { return lo + rng() * (hi - lo); }
export function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return Math.hypot(dx, dz); }

/** Shortest signed angle from `a` to `b`, in (-PI, PI]. */
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}
export function angleLerp(a, b, t) { return a + angleDelta(a, b) * clamp(t, 0, 1); }

/**
 * Push a circle (x,z,r) out of an AABB collider {min,max} (Vector3-like).
 * Returns true when a push happened. Mutates the passed {x,z} object.
 */
export function resolveCircleAABB(p, r, box) {
  const cx = clamp(p.x, box.min.x, box.max.x);
  const cz = clamp(p.z, box.min.z, box.max.z);
  const dx = p.x - cx, dz = p.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    p.x = cx + (dx / d) * r;
    p.z = cz + (dz / d) * r;
  } else {
    // Centre inside the box: push out along the smallest penetration axis.
    const px = Math.min(p.x - box.min.x, box.max.x - p.x);
    const pz = Math.min(p.z - box.min.z, box.max.z - p.z);
    if (px < pz) p.x = (p.x - box.min.x < box.max.x - p.x) ? box.min.x - r : box.max.x + r;
    else p.z = (p.z - box.min.z < box.max.z - p.z) ? box.min.z - r : box.max.z + r;
  }
  return true;
}

/** Resolve a circle against a list of colliders (skips boxes shorter than 0.3). */
export function collideWorld(p, r, colliders) {
  for (let i = 0; i < colliders.length; i += 1) {
    const b = colliders[i];
    if (b.max.y < 0.3) continue;
    if (p.x < b.min.x - r || p.x > b.max.x + r || p.z < b.min.z - r || p.z > b.max.z + r) continue;
    resolveCircleAABB(p, r, b);
  }
  p.x = clamp(p.x, -214, 214);
  p.z = clamp(p.z, -214, 214);
}

/** Ray (origin, dir unit) vs sphere (centre, radius). Returns distance or Infinity. */
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return Infinity;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  const r2 = r * r;
  if (d2 > r2) return Infinity;
  return tca - Math.sqrt(r2 - d2);
}

export function fmtMoney(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
export function fmtClock(hours) {
  const h = Math.floor(hours) % 24;
  const m = Math.floor((hours % 1) * 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}
