// characters.js — REALISTIC humans for Solara Bay (make.fun gta6-01).
//
// Written from scratch in this session. No copied code, no external assets,
// no network: only Three.js primitives + MeshStandardMaterial.
//
// SILHOUETTE FIRST (the acceptance test):
//   * Head is an OVAL, longer than wide, with a jaw that narrows toward the
//     chin. Never a sphere/ball sitting on the shoulders. In silhouette the
//     head reads as a human head: cranium wide at the temples, tapering down
//     through the cheeks to a narrower chin.
//   * Torso is a LATHE profile: wider at the shoulders, narrower at the
//     waist, wider again at the hips. Never a rectangular box. The lathe
//     silhouette alone must read as a human torso.
//   * Limbs are TAPERED lathes (thick at the top, narrow toward hand/foot),
//     with rounded ends. Never uniform rectangular bars.
//   * Fill the figure solid black at thumbnail size and it must read as a
//     human, not a snowman (ball head + rectangle body).
//
// PROPORTIONS (canonical build height 1.8 units, then group-scaled):
//   * ~7 heads tall: head height 0.257, total 1.80  =>  1.80 / 0.257 = 7.0
//   * Eye line at half the head height; each eye 0.20 of face width;
//     one eye-width gap between the eyes.
//   * Shoulders wider than hips for men, narrower for women.
//   * Face: sculpted, not a flat plate — nose + brow + cheek steps in the
//     side view; eyes are small sclera spheres SET INTO the head (recessed),
//     with iris + pupil + an upper lid covering the top of the iris.
//     No bulging googly eyes.
//
// PERF: one human is ~50-56 meshes. Geometries and materials are shared
// (module-level caches); per-human variation comes from mesh scale /
// material colour, not new geometry. Cloning a mesh reuses its geometry.
//
// Forward is +Z. Group origin is at the feet (y = 0), so the group can be
// placed directly on the ground.
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Small deterministic RNG (mulberry32) so a seed always builds the same human.
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let a = (seed >>> 0) || 1;
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

function range(rng, lo, hi) {
  return lo + rng() * (hi - lo);
}

// ---------------------------------------------------------------------------
// Shared materials (keyed by colour + roughness + metalness) and geometries.
// ---------------------------------------------------------------------------
const MAT_CACHE = new Map();
function stdMat(color, roughness = 0.8, metalness = 0) {
  const key = `${color}|${roughness}|${metalness}`;
  let m = MAT_CACHE.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    MAT_CACHE.set(key, m);
  }
  return m;
}

/** A 3-step value ramp for one palette colour: highlight / mid / shadow. */
function ramp(color, f) {
  const c = new THREE.Color(color);
  c.offsetHSL(0, 0, f);
  return c.getHex();
}

// Unit sphere, scaled per mesh — the workhorse for cranium, jaw, joints,
// palms, buns, boot toes. One geometry, many sizes.
const GEO = {
  sphere: new THREE.SphereGeometry(1, 20, 14),
  sphereLow: new THREE.SphereGeometry(1, 12, 8),
  // Tapered limb, pivot at the TOP (shoulder / hip), hanging down -Y.
  // Profile: rounded cap at the joint, thick at the top, narrow at the
  // far end, rounded tip. y runs 0 .. -length.
  limb(radiusTop, radiusBottom, length) {
    const pts = [
      new THREE.Vector2(0.001, 0.005),
      new THREE.Vector2(radiusTop * 0.92, 0.0),
      new THREE.Vector2(radiusTop, -length * 0.18),
      new THREE.Vector2(radiusTop * 0.82, -length * 0.55),
      new THREE.Vector2(radiusBottom, -length * 0.92),
      new THREE.Vector2(radiusBottom * 0.7, -length),
      new THREE.Vector2(0.001, -length - 0.004),
    ];
    return new THREE.LatheGeometry(pts, 12);
  },
  // Torso lathe, pivot at the WAIST (y = 0), rising to the shoulders.
  // Profile is the whole point: shoulders wide, waist narrow. y 0 .. 0.44.
  torso(shoulderR, waistR, chestR) {
    const pts = [
      new THREE.Vector2(0.001, 0.0),
      new THREE.Vector2(waistR * 1.06, 0.0),
      new THREE.Vector2(waistR, 0.10),
      new THREE.Vector2(waistR * 0.90, 0.16),
      new THREE.Vector2(chestR * 0.92, 0.26),
      new THREE.Vector2(chestR, 0.33),
      new THREE.Vector2(shoulderR, 0.41),
      new THREE.Vector2(shoulderR * 0.82, 0.44),
      new THREE.Vector2(0.055, 0.45),
      new THREE.Vector2(0.001, 0.45),
    ];
    return new THREE.LatheGeometry(pts, 16);
  },
  // Hip / pelvis lathe: wider at the hips, narrowing up to the waist.
  hips(hipR, waistR) {
    const pts = [
      new THREE.Vector2(0.001, -0.02),
      new THREE.Vector2(hipR, -0.01),
      new THREE.Vector2(hipR * 0.98, 0.06),
      new THREE.Vector2(waistR * 1.05, 0.12),
      new THREE.Vector2(0.001, 0.13),
    ];
    return new THREE.LatheGeometry(pts, 16);
  },
  // Skirt / dress flare: narrow waist, flared hem.
  skirt(waistR, hemR, length) {
    const pts = [
      new THREE.Vector2(waistR, 0.0),
      new THREE.Vector2(waistR * 1.1, -length * 0.4),
      new THREE.Vector2(hemR, -length),
      new THREE.Vector2(hemR * 0.98, -length - 0.005),
      new THREE.Vector2(0.001, -length - 0.005),
    ];
    return new THREE.LatheGeometry(pts, 16);
  },
  // Jacket lathe: same shoulder-waist shape as the torso, a touch larger
  // so it reads as a LAYER over the torso, with a step in the silhouette.
  jacket(shoulderR, waistR, chestR) {
    const pts = [
      new THREE.Vector2(0.001, -0.02),
      new THREE.Vector2(waistR * 1.14, -0.02),
      new THREE.Vector2(waistR * 1.02, 0.10),
      new THREE.Vector2(waistR * 0.96, 0.16),
      new THREE.Vector2(chestR, 0.26),
      new THREE.Vector2(chestR * 1.06, 0.33),
      new THREE.Vector2(shoulderR * 1.06, 0.41),
      new THREE.Vector2(shoulderR * 0.9, 0.44),
      new THREE.Vector2(0.06, 0.45),
      new THREE.Vector2(0.001, 0.45),
    ];
    return new THREE.LatheGeometry(pts, 16);
  },
  // Hair back mass: a flattened half-shell, wider than the cranium.
  hairBack: new THREE.SphereGeometry(1, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62),
  // Thin torus for collars, belts, trim rings.
  ring: new THREE.TorusGeometry(1, 0.09, 8, 20),
  // Small cone for the nose.
  nose: new THREE.ConeGeometry(1, 1, 8),
  // Thin cylinder for fingers, hair locks, piping.
  rod: new THREE.CylinderGeometry(1, 1, 1, 8),
};

const GEO_CACHE = new Map();
function limbGeo(kind, rTop, rBot, len) {
  const key = `${kind}|${rTop}|${rBot}|${len}`;
  let g = GEO_CACHE.get(key);
  if (!g) { g = GEO.limb(rTop, rBot, len); GEO_CACHE.get(key); GEO_CACHE.set(key, g); }
  return g;
}
function torsoGeo(sh, wa, ch) {
  const key = `torso|${sh}|${wa}|${ch}`;
  let g = GEO_CACHE.get(key);
  if (!g) { g = GEO.torso(sh, wa, ch); GEO_CACHE.set(key, g); }
  return g;
}
function jacketGeo(sh, wa, ch) {
  const key = `jacket|${sh}|${wa}|${ch}`;
  let g = GEO_CACHE.get(key);
  if (!g) { g = GEO.jacket(sh, wa, ch); GEO_CACHE.set(key, g); }
  return g;
}
function hipsGeo(hip, wa) {
  const key = `hips|${hip}|${wa}`;
  let g = GEO_CACHE.get(key);
  if (!g) { g = GEO.hips(hip, wa); GEO_CACHE.set(key, g); }
  return g;
}

// Canonical (1.80 m) dimensions. The whole group is scaled by height/1.8,
// so every proportion below holds at any height.
const H = {
  total: 1.8,
  headH: 0.257,          // 1.80 / 0.257 = 7.0 heads tall
  headCenterY: 1.67,     // chin ~1.54, crown ~1.80
  waistY: 1.04,          // torso pivot
  hipY: 0.94,            // leg pivots
  shoulderY: 1.42,       // arm pivots
  shoulderX: 0.20,
  legX: 0.095,
  upperArmLen: 0.27,
  forearmLen: 0.25,
  thighLen: 0.44,
  shinLen: 0.42,
};

const SKINS = [0xe8b98a, 0xc98d5f, 0x8a5a3b, 0xf0c8a0, 0x6b4226, 0xd9a077];
const HAIRS = [0x1c1210, 0x111111, 0x5a3a22, 0x8a8a8a, 0xc8a040, 0x6e2a1a, 0x3a2a1a];
const IRIS_COLORS = [0x4a2a12, 0x2a4a6a, 0x2a5a3a, 0x3a3a3a];
// Muted, realistic clothing palette — no flat bright cartoon colours.
const TOPS = [0x5a6a7a, 0x7a3a34, 0x3a5a44, 0x8a7a5a, 0x4a4a5a, 0x6a5a7a, 0x9a8a7a, 0x2e4a5a];
const BOTTOMS = [0x2c3440, 0x3a3a3a, 0x4a3226, 0x2a3a4a, 0x555555, 0x33302e];
const SHOES = [0x1e1e24, 0x3a2a22, 0x2a2a2a, 0x5a3a2a, 0xdddddd];

function mesh(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// ---------------------------------------------------------------------------
// HEAD — oval + tapered jaw. This is the part the old version got wrong:
// a sphere head reads as a ball. The silhouette here is cranium (wide at
// the temples) -> cheeks -> jaw (narrower) -> chin (narrowest).
// Head group origin = head centre (eye line is at the origin's height).
// Face width at the eye line ~= 0.19; each eye is 0.038 wide = 0.20 of it.
// ---------------------------------------------------------------------------
function buildHead(spec, skin, hairMat, rng) {
  const head = new THREE.Group();
  head.position.y = H.headCenterY - H.waistY; // torso-local; set by caller
  // Slight life: never a perfect mirror — a 1-2% tilt / brow offset.
  head.rotation.z = (rng() - 0.5) * 0.03;

  // Cranium: ellipsoid, longer (tall) than wide. Radii: x 0.095, y 0.128,
  // z 0.098 — height 0.256, width 0.19. An oval, not a ball.
  const cranium = mesh(GEO.sphere, skin);
  cranium.scale.set(0.095, 0.128, 0.098);
  head.add(cranium);

  // Jaw: a smaller ellipsoid tucked under the cranium, shifted slightly
  // forward. This is what makes the side view taper instead of staying
  // round, and what gives the face its cheek step.
  const jaw = mesh(GEO.sphere, skin, 0, -0.072, 0.008);
  jaw.scale.set(0.078, 0.072, 0.082);
  head.add(jaw);

  // Chin: small rounded mass at the bottom of the jaw.
  const chin = mesh(GEO.sphere, skin, 0, -0.122, 0.022);
  chin.scale.set(0.036, 0.026, 0.03);
  head.add(chin);

  // ---- FACE (front = +Z, eye line y = 0 = half head height) ----
  const face = new THREE.Group();
  head.add(face);

  const eyeWhiteMat = stdMat(0xf4f1e8, 0.35, 0);
  const pupilMat = stdMat(0x0a0a0a, 0.25, 0);
  const irisMat = stdMat(pick(rng, IRIS_COLORS), 0.3, 0);
  const lipMat = stdMat(0x8a4a42, 0.6, 0);
  const lipLightMat = stdMat(0xa8625a, 0.6, 0);
  // Brow: LIGHTER than the hair (dark hair + near-black brow = a black
  // bar). Lift the hair colour one step and thin the ellipsoid down so
  // the brow reads as a soft arch, not a painted bar.
  const browMat = stdMat(ramp(hairMat.color.getHex(), 0.12), 0.8, 0);

  // Eye geometry, all shared: sclera r 0.019, iris r 0.010, pupil r 0.005.
  // Centres at x = +/-0.038, so the gap between the eyes (0.038) equals
  // one eye width (0.038) — the classic proportion.
  // The sclera sits RECESSED (z 0.080, inside the cranium surface ~0.088 at
  // that x/y), the iris/pupil sit just proud of it. Nothing bulges out.
  const EYE_X = 0.038;
  const EYE_W = 0.038; // 0.20 x face width (0.19)
  for (const side of [-1, 1]) {
    const sclera = mesh(GEO.sphere, eyeWhiteMat, side * EYE_X, 0.008, 0.080);
    sclera.scale.set(0.019, 0.023, 0.010);
    const iris = mesh(GEO.sphere, irisMat, side * EYE_X, 0.006, 0.088);
    iris.scale.set(0.010, 0.012, 0.005);
    const pupil = mesh(GEO.sphere, pupilMat, side * EYE_X, 0.006, 0.0915);
    pupil.scale.set(0.005, 0.006, 0.003);
    // Upper eyelid: a flattened skin cap covering just the TOP edge of
    // the iris. (Was y 0.020 / half-height 0.010 — it covered half the
    // iris and the eyes read as sleepy / half-closed in the close-up.)
    const lid = mesh(GEO.sphere, skin, side * EYE_X, 0.023, 0.086);
    lid.scale.set(0.021, 0.008, 0.010);
    // Brow: thin, soft arch — flattened ellipsoid lying ON the brow
    // bone, inner end a touch higher than the outer end. Thinner and
    // lighter than the old bar (was 0.030 x 0.005 in near-black hair).
    const brow = mesh(GEO.sphere, browMat, side * (EYE_X + 0.002), 0.050 + (side < 0 ? 0.002 : 0), 0.084);
    brow.scale.set(0.026, 0.0032, 0.005);
    brow.rotation.z = side < 0 ? -0.16 : 0.10;
    brow.rotation.x = -0.15; // lie flat against the forehead curve
    // Ear: flattened ellipsoid at the side, spanning brow-to-nose height.
    const ear = mesh(GEO.sphere, skin, side * 0.093, -0.018, 0.0);
    ear.scale.set(0.012, 0.030, 0.020);
    face.add(sclera, iris, pupil, lid, brow, ear);
  }

  // Nose: a small bridge (flattened ellipsoid down the face) + a soft
  // ROUNDED tip (flattened sphere), not a cone — the old cone tip read
  // as a spike in the close-up. Two tiny shadow dots under the tip
  // suggest nostrils without adding a point.
  const bridge = mesh(GEO.sphere, skin, 0, -0.020, 0.090);
  bridge.scale.set(0.011, 0.028, 0.010);
  const noseTip = mesh(GEO.sphere, skin, 0, -0.048, 0.094);
  noseTip.scale.set(0.011, 0.013, 0.009);
  face.add(bridge, noseTip);
  const nostrilMat = stdMat(ramp(skin.color.getHex(), -0.14), 0.7, 0);
  for (const side of [-1, 1]) {
    const nostril = mesh(GEO.sphere, nostrilMat, side * 0.007, -0.058, 0.092);
    nostril.scale.set(0.0035, 0.0028, 0.003);
    face.add(nostril);
  }

  // Lips: a thin curved upper lip (flattened ellipsoid) + a smaller,
  // lighter lower lip tucked below it. Not a red line.
  const upperLip = mesh(GEO.sphere, lipMat, 0, -0.088, 0.082);
  upperLip.scale.set(0.032, 0.007, 0.010);
  const lowerLip = mesh(GEO.sphere, lipLightMat, 0, -0.100, 0.080);
  lowerLip.scale.set(0.026, 0.006, 0.009);
  face.add(upperLip, lowerLip);

  // Store the measured eye ratio on the face group for the report/tests.
  face.userData.eyeWidthFraction = EYE_W / 0.19;

  buildHair(head, spec, hairMat, rng);
  return { head, face };
}

// ---------------------------------------------------------------------------
// HAIR — volume, not a flat cap. A back shell larger than the cranium, a
// fringe that frames the face, side locks, and the chosen style's mass
// (ponytail / long / bun / short / cap). Every chunk tapers to a point;
// no rectangular ends.
// ---------------------------------------------------------------------------
function buildHair(head, spec, hairMat, rng) {
  const style = spec.hairStyle || 'short';
  const s = H.headH; // head height, for scale reference

  // Back shell: covers top, sides and back of the skull, slightly larger
  // than the cranium so the hair reads as a layer with volume.
  const back = mesh(GEO.hairBack, hairMat, 0, 0.012, -0.012);
  back.scale.set(0.102, 0.132, 0.104);
  back.rotation.x = -0.25;
  head.add(back);

  // Fringe: ONE swept band lying FLAT on the forehead, following the
  // cranium curve — never vertical rods. The old two upright rods stuck
  // 0.025 above the crown and read as horns in the close-up. The band's
  // top edge stays below the crown (y <= ~0.10) and its face is pressed
  // to the forehead, with two small flat side sweeps at the temples.
  const fringe = mesh(GEO.sphere, hairMat, 0.004, 0.094, 0.078);
  fringe.scale.set(0.082, 0.020, 0.020);
  fringe.rotation.x = -0.38; // top edge leans back onto the skull
  fringe.rotation.z = -0.06; // slight asymmetric sweep
  head.add(fringe);
  for (const side of [-1, 1]) {
    const sweep = mesh(GEO.sphere, hairMat, side * 0.065, 0.086, 0.045);
    sweep.scale.set(0.020, 0.014, 0.012);
    sweep.rotation.z = side * -0.35;
    sweep.rotation.x = -0.30;
    head.add(sweep);
  }

  // No hanging side locks: for a short style the back shell already
  // covers the sides of the head, and flat locks beside the cheeks read
  // as black bars / earmuffs in the close-up. Long / ponytail styles
  // get their side volume from the back panel / ponytail instead.

  if (style === 'ponytail') {
    // Ponytail: two tapered cylinders curving down the back + a rounded
    // tip — the Genshin-reference silhouette (long hair gathered high,
    // falling past the shoulders). Tied high at the back of the crown.
    const tie = mesh(GEO.sphere, stdMat(0x7a2a22, 0.7, 0), 0, 0.075, -0.095);
    tie.scale.set(0.020, 0.016, 0.016);
    head.add(tie);
    const seg1 = mesh(GEO.rod, hairMat, 0, -0.02, -0.125);
    seg1.scale.set(0.042, 0.16, 0.042);
    seg1.rotation.x = 0.28;
    const seg2 = mesh(GEO.rod, hairMat, 0, -0.17, -0.155);
    seg2.scale.set(0.030, 0.16, 0.030);
    seg2.rotation.x = 0.12;
    head.add(seg1, seg2); // seg2 tapers to a point — no separate tip mesh
  } else if (style === 'long') {
    // Long hair: a back panel falling to the shoulders + the side locks
    // already added. Panel is a tapered, flattened rod.
    const panel = mesh(GEO.rod, hairMat, 0, -0.10, -0.105);
    panel.scale.set(0.085, 0.20, 0.030);
    panel.rotation.x = 0.10;
    head.add(panel);
  } else if (style === 'bun') {
    const bun = mesh(GEO.sphere, hairMat, 0, 0.105, -0.055);
    bun.scale.set(0.055, 0.055, 0.055);
    head.add(bun);
  } else if (style === 'cap') {
    // Cap: a squat cylinder crown + a brim forward. Hair still shows
    // at the sides/back (the back shell above stays).
    const capMat = stdMat(spec.topColor ?? 0x3a4a5a, 0.85, 0);
    const crown = mesh(new THREE.CylinderGeometry(0.105, 0.108, 0.06, 14), capMat, 0, 0.105, 0);
    const brim = mesh(GEO.sphere, capMat, 0, 0.088, 0.115);
    brim.scale.set(0.085, 0.012, 0.055);
    head.add(crown, brim);
  }
  // 'short': back shell + fringe + side locks is the whole style.
  void s;
}

// ---------------------------------------------------------------------------
// HAND — flattened-sphere palm + 4 small cylinder fingers + a thumb.
// Articulated, not a mitten blob. Fingers curl slightly.
// ---------------------------------------------------------------------------
function buildHand(skin, isLeft) {
  const hand = new THREE.Group();
  const palm = mesh(GEO.sphere, skin, 0, -0.02, 0);
  palm.scale.set(0.042, 0.052, 0.018);
  hand.add(palm);
  const fingerX = [-0.027, -0.009, 0.009, 0.027];
  const fingerLen = [0.042, 0.052, 0.048, 0.038];
  fingerX.forEach((x, i) => {
    const f = mesh(GEO.rod, skin, x, -0.085, 0.002);
    f.scale.set(0.0085, fingerLen[i], 0.0085);
    f.rotation.x = 0.18; // slight natural curl
    hand.add(f);
  });
  const thumb = mesh(GEO.rod, skin, isLeft ? 0.048 : -0.048, -0.035, 0.008);
  thumb.scale.set(0.008, 0.042, 0.008);
  thumb.rotation.z = isLeft ? -0.55 : 0.55;
  thumb.rotation.x = 0.25;
  hand.add(thumb);
  return hand;
}

// ---------------------------------------------------------------------------
// ARM — pivot at the shoulder. Upper arm + forearm are tapered lathes;
// elbow is the overlap of the two (no extra joint ball needed — the taper
// already rounds it). Hand hangs at the wrist.
// ---------------------------------------------------------------------------
function buildArm(skin, topMat, isLeft, female) {
  const pivot = new THREE.Group();
  pivot.position.set((isLeft ? -1 : 1) * H.shoulderX, H.shoulderY - H.waistY, 0);
  const rTop = female ? 0.050 : 0.058; // was 0.044 / 0.050 — arms read as sticks
  const upper = mesh(limbGeo('arm', rTop, rTop * 0.72, H.upperArmLen), topMat);
  pivot.add(upper);
  const elbow = new THREE.Group();
  elbow.position.y = -H.upperArmLen;
  pivot.add(elbow);
  const fore = mesh(limbGeo('fore', rTop * 0.72, rTop * 0.55, H.forearmLen), skin);
  elbow.add(fore);
  const hand = buildHand(skin, isLeft);
  hand.position.y = -H.forearmLen - 0.01;
  elbow.add(hand);
  pivot.userData.elbow = elbow;
  pivot.userData.hand = hand;
  return pivot;
}

// ---------------------------------------------------------------------------
// LEG — pivot at the hip. Thigh + shin are tapered lathes; the boot is a
// rounded form (sphere toe + sole slab) at the ankle, so the foot is not
// a box either.
// ---------------------------------------------------------------------------
function buildLeg(bottomMat, shoeMat, soleMat, isLeft, skirt) {
  const pivot = new THREE.Group();
  pivot.position.set((isLeft ? -1 : 1) * H.legX, H.hipY, 0);
  const thigh = mesh(limbGeo('thigh', 0.072, 0.052, H.thighLen), bottomMat);
  pivot.add(thigh);
  const knee = new THREE.Group();
  knee.position.y = -H.thighLen;
  pivot.add(knee);
  const shinMat = skirt ? stdMat(0x2a2018, 0.7, 0) : bottomMat; // stockings under a skirt
  const shin = mesh(limbGeo('shin', 0.052, 0.036, H.shinLen), shinMat);
  knee.add(shin);
  // Boot: rounded toe (flattened sphere) + pale sole. The toe sphere is
  // long enough to cover the heel — no separate heel block needed.
  const boot = new THREE.Group();
  boot.position.y = -H.shinLen - 0.016; // relative to the KNEE, not the hip; sole touches y=0
  const toe = mesh(GEO.sphere, shoeMat, 0, -0.02, 0.035);
  toe.scale.set(0.055, 0.038, 0.085);
  const sole = mesh(GEO.sphere, soleMat, 0, -0.052, 0.02);
  sole.scale.set(0.058, 0.012, 0.095);
  boot.add(toe, sole);
  knee.add(boot);
  pivot.userData.knee = knee;
  pivot.userData.boot = boot;
  return pivot;
}

// ---------------------------------------------------------------------------
// makeHuman — the core builder. spec:
//   { height=1.8, skin, hairColor, hairStyle, topColor, bottomColor,
//     shoesColor, archetype, seed, female }
// Returns a THREE.Group, origin at the feet, forward +Z.
// userData: { height, head, face, parts, archetype, seed, female }
// ---------------------------------------------------------------------------
export function makeHuman(spec = {}) {
  const seed = spec.seed ?? Math.floor(Math.random() * 4294967296);
  const rng = mulberry32(seed);
  const height = spec.height ?? 1.8;
  const s = height / H.total; // canonical build, then one group scale
  const female = spec.female ?? (rng() < 0.45);
  const archetype = spec.archetype ?? 'walker';

  const skinCol = spec.skin ?? pick(rng, SKINS);
  const skin = stdMat(skinCol, 0.6, 0);           // warm skin, roughness ~0.6
  const hairCol = spec.hairColor ?? pick(rng, HAIRS);
  const hairMat = stdMat(hairCol, 0.75, 0);
  const topCol = spec.topColor ?? pick(rng, TOPS);
  const topMat = stdMat(topCol, 0.8, 0);
  const topDark = stdMat(ramp(topCol, -0.09), 0.85, 0);
  const topLight = stdMat(ramp(topCol, 0.08), 0.8, 0);
  const bottomCol = spec.bottomColor ?? pick(rng, BOTTOMS);
  const bottomMat = stdMat(bottomCol, 0.85, 0);
  const shoeCol = spec.shoesColor ?? pick(rng, SHOES);
  const shoeMat = stdMat(shoeCol, 0.7, 0.1);
  const soleMat = stdMat(0xcfc8b8, 0.85, 0);
  const buckleMat = stdMat(0xb08d3e, 0.3, 0.8); // only metal: buckles

  const g = new THREE.Group();

  // ---- HIPS + TORSO (lathe silhouettes — the anti-box-body core) ----
  // Pelvis: wider at the hips, narrowing to the waist. Female hips wider,
  // male shoulders wider — the ratio flips by sex, as in a real body.
  const hipR = female ? 0.165 : 0.150;
  const waistR = female ? 0.116 : 0.126; // was 0.128 / 0.140 — front-view waist taper
  const shoulderR = female ? 0.168 : 0.190;
  const chestR = female ? 0.150 : 0.168;
  const hips = mesh(hipsGeo(hipR, waistR), bottomMat, 0, H.hipY, 0);
  hips.scale.z = 0.68; // pelvis is deeper than wide? No — flatter front/back
  g.add(hips);

  // Torso pivot at the waist: twist / lean / breathing rotate from here.
  const torso = new THREE.Group();
  torso.position.y = H.waistY;
  g.add(torso);

  const torsoMesh = mesh(torsoGeo(shoulderR, waistR, chestR), topMat);
  torsoMesh.scale.z = 0.62; // chest is an ellipse, not a circle
  torso.add(torsoMesh);

  // ---- LAYERED CLOTHING (Genshin-style: each layer steps the silhouette)
  const skirt = !!spec.skirt;
  if (skirt) {
    const skirtMesh = mesh(new THREE.LatheGeometry([
      new THREE.Vector2(waistR * 1.05, 0.02),
      new THREE.Vector2(waistR * 1.15, -0.10),
      new THREE.Vector2(0.19, -0.30),
      new THREE.Vector2(0.20, -0.34),
      new THREE.Vector2(0.001, -0.34),
    ], 16), bottomMat, 0, H.waistY - H.hipY + 0.06, 0);
    skirtMesh.scale.z = 0.72;
    g.add(skirtMesh);
  }

  // Jacket / overshirt layer: a slightly larger lathe over the torso.
  // Only for archetypes that wear one (player, worker, shopkeeper, talker);
  // others show the shirt torso itself, with a collar + trim.
  const jacketCol = spec.jacketColor ?? topCol;
  const jacketMat = stdMat(jacketCol, 0.8, 0);
  const jacketDark = stdMat(ramp(jacketCol, -0.10), 0.85, 0);
  let jacketMesh = null;
  if (spec.jacket !== false) {
    jacketMesh = mesh(jacketGeo(shoulderR * 1.04, waistR * 1.06, chestR * 1.05), jacketMat);
    jacketMesh.scale.z = 0.66;
    torso.add(jacketMesh);
    // Shirt V at the chest: a NARROW sliver under the open jacket, in
    // the TRIM colour (red on Tomas) — a vertical break in the white
    // slab. The old wide oval (0.075 x 0.13) read as a red medallion.
    // Only on the hero (trimmed jacket) — NPC jackets stay closed.
    if (spec.trimColor !== undefined) {
      const shirtPanel = mesh(GEO.sphere, stdMat(spec.trimColor, 0.8, 0), 0, 0.33, chestR * 0.62);
      shirtPanel.scale.set(0.032, 0.085, 0.018);
      torso.add(shirtPanel);
      // Centre seam: a thin red rod down the jacket front, tilted to
      // follow the chest-to-waist slope, so the white is broken
      // top-to-bottom instead of one big patch.
      const seam = mesh(GEO.rod, stdMat(spec.trimColor, 0.8, 0), 0, 0.20, 0.098);
      seam.scale.set(0.006, 0.11, 0.006);
      seam.rotation.x = -0.12;
      torso.add(seam);
    }
  }

  // Collar: a SLIM standing band (short cylinder) around the neck, in
  // the trim colour when there is one. The old torus collar was a fat
  // tube: GEO.ring scaled (0.085, 0.085, 0.7) — the 0.7 was an ABSOLUTE
  // z-scale, 8x the x/y scale, so the tube read as a thick white pipe.
  const collarMat = spec.trimColor !== undefined ? stdMat(spec.trimColor, 0.75, 0) : jacketDark;
  const collar = mesh(new THREE.CylinderGeometry(0.062, 0.070, 0.038, 16), collarMat, 0, 0.445, 0);
  collar.scale.z = 0.78;
  torso.add(collar);

  // Trim / piping: a thin dark-red band at the jacket hem, PROUD of the
  // jacket surface (jacket hem radius is waist*1.14, so the band must be
  // wider than that to be seen at all — the old torus ring at 1.12 was
  // buried inside the jacket). A short cylinder is unambiguous, unlike
  // the old torus whose absolute z-scale made it a tall band.
  if (spec.trimColor !== undefined) {
    const trim = mesh(new THREE.CylinderGeometry(waistR * 1.17, waistR * 1.17, 0.014, 20), stdMat(spec.trimColor, 0.75, 0), 0, 0.055, 0);
    trim.scale.z = 0.68;
    torso.add(trim);
  }

  // Pocket: one flap on the jacket front, a touch askew (asymmetry = life).
  const pocket = mesh(GEO.sphere, jacketDark, -0.095, 0.10, chestR * 0.60);
  pocket.scale.set(0.045, 0.035, 0.012);
  pocket.rotation.z = 0.06;
  torso.add(pocket);

  // Belt: a dark leather BAND (short cylinder) around the waist, proud
  // of the jacket hem (jacket bottom radius waist*1.14) so the white is
  // visibly broken at the waist — the old torus belt at 1.12 was buried
  // inside the jacket and its absolute z-scale (0.68) made it a tall tube.
  const belt = mesh(new THREE.CylinderGeometry(waistR * 1.18, waistR * 1.18, 0.032, 20), stdMat(0x2a2018, 0.8, 0), 0, 0.005, 0);
  belt.scale.z = 0.68;
  torso.add(belt);
  const buckle = mesh(GEO.sphere, buckleMat, 0, 0.005, waistR * 1.18 * 0.68 + 0.006);
  buckle.scale.set(0.028, 0.020, 0.010);
  torso.add(buckle);

  // ---- NECK + HEAD ----
  const neck = mesh(new THREE.CylinderGeometry(0.042, 0.055, 0.10, 10), skin, 0, 0.47, 0);
  torso.add(neck);
  const { head, face } = buildHead(spec, skin, hairMat, rng);
  // buildHead positions the head torso-local; override to the neck top.
  head.position.set(0, 0.63, 0.005);
  torso.add(head);

  // ---- ARMS + LEGS (tapered lathes, pivots at shoulder / hip) ----
  const armL = buildArm(skin, jacketMesh ? jacketMat : topMat, true, female);
  const armR = buildArm(skin, jacketMesh ? jacketMat : topMat, false, female);
  // Arms hang from the torso pivot so a torso twist carries them.
  armL.position.y = 0.38;
  armR.position.y = 0.38;
  torso.add(armL, armR);

  const legL = buildLeg(bottomMat, shoeMat, soleMat, true, skirt);
  const legR = buildLeg(bottomMat, shoeMat, soleMat, false, skirt);
  g.add(legL, legR);

  // ---- ARCHETYPE ACCESSORIES (one signature prop each, silhouette step) ----
  if (archetype === 'worker') {
    // Hi-vis vest: a slightly larger, shorter lathe over the jacket.
    const vest = mesh(jacketGeo(shoulderR * 1.08, waistR * 1.10, chestR * 1.08),
      stdMat(0xc8b820, 0.85, 0));
    vest.scale.set(1, 0.62, 0.66);
    vest.position.y = 0.06;
    torso.add(vest);
    // The hi-vis yellow IS the read; no extra stripe mesh needed.
  } else if (archetype === 'shopkeeper') {
    const apron = mesh(GEO.sphere, stdMat(0xe8e2d2, 0.9, 0), 0, 0.18, chestR * 0.62);
    apron.scale.set(0.13, 0.20, 0.015);
    torso.add(apron);
  } else if (archetype === 'tourist') {
    // Backpack: a rounded box-free mass (scaled sphere) on the back.
    const pack = mesh(GEO.sphere, stdMat(pick(rng, TOPS), 0.85, 0), 0, 0.24, -chestR * 0.75);
    pack.scale.set(0.13, 0.16, 0.07);
    torso.add(pack);
  } else if (archetype === 'jogger') {
    // Sweatband + running shoes are the read; headband is a thin ring.
    const band = mesh(GEO.ring, stdMat(0xc83a3a, 0.8, 0), 0, 0.06, 0);
    band.scale.set(0.098, 0.098, 0.098);
    band.rotation.x = Math.PI / 2 - 0.15;
    head.add(band);
  }

  g.scale.setScalar(s);
  g.userData = {
    height,
    head,
    face,
    parts: {
      torso, head,
      armL, armR, legL, legR,
      handL: armL.userData.hand, handR: armR.userData.hand,
    },
    archetype,
    seed,
    female,
    // Canonical (unscaled) anchor heights, for stageFaceCloseup / callers.
    headCenterY: H.headCenterY,
    waistY: H.waistY,
  };
  // Keep the canonical scale factor reachable without re-deriving it.
  g.userData.scale = s;
  return g;
}

// ---------------------------------------------------------------------------
// ARCHETYPES — 7 street roles. Each varies height, sex ratio, hair, palette.
// ---------------------------------------------------------------------------
export const ARCHETYPES = ['walker', 'jogger', 'tourist', 'worker', 'shopkeeper', 'talker', 'sitter'];

const ARCHETYPE_STYLE = {
  walker:     { h: [1.65, 1.88], female: 0.45, hair: ['short', 'long', 'ponytail', 'bun'], jacket: true,  skirt: 0.25 },
  jogger:     { h: [1.68, 1.88], female: 0.40, hair: ['short', 'ponytail', 'bun'],          jacket: false, skirt: 0 },
  tourist:    { h: [1.62, 1.90], female: 0.50, hair: ['short', 'long', 'ponytail', 'cap'],  jacket: true,  skirt: 0.30 },
  worker:     { h: [1.70, 1.90], female: 0.20, hair: ['short', 'cap'],                      jacket: true,  skirt: 0 },
  shopkeeper: { h: [1.60, 1.82], female: 0.55, hair: ['short', 'long', 'bun'],              jacket: true,  skirt: 0.35 },
  talker:     { h: [1.65, 1.86], female: 0.50, hair: ['short', 'long', 'ponytail'],          jacket: true,  skirt: 0.25 },
  sitter:     { h: [1.62, 1.86], female: 0.50, hair: ['short', 'long', 'bun', 'cap'],       jacket: true,  skirt: 0.30 },
};

// ---------------------------------------------------------------------------
// createPlayer — Tomas, the hero. Layered white/red jacket with trim
// (the Genshin-reference palette: white body, red trim/collar, dark
// trousers, dark hair, red-brown boots). Must read as the hero at a glance:
// the only white jacket + red trim on the street.
// ---------------------------------------------------------------------------
export function createPlayer() {
  return makeHuman({
    height: 1.82,
    skin: 0xe8b98a,
    hairColor: 0x1c1210,
    hairStyle: 'short',
    topColor: 0xe8e4dc,       // white jacket body
    jacketColor: 0xe8e4dc,
    trimColor: 0x8a2a24,      // red trim at the hem
    bottomColor: 0x2c3440,    // dark trousers
    shoesColor: 0x5a2a22,     // red-brown boots
    archetype: 'walker',
    female: false,
    seed: 417,
    jacket: true,
  });
}

// ---------------------------------------------------------------------------
// createNPC — one human for an archetype. rng may be a function () => [0,1),
// an object with .random() / .next(), or omitted (Math.random).
// ---------------------------------------------------------------------------
export function createNPC(archetype, rng) {
  const style = ARCHETYPE_STYLE[archetype] || ARCHETYPE_STYLE.walker;
  let next;
  if (typeof rng === 'function') next = rng;
  else if (rng && typeof rng.random === 'function') next = () => rng.random();
  else if (rng && typeof rng.next === 'function') next = () => rng.next();
  else next = Math.random;
  const seed = Math.floor(next() * 4294967296);
  const local = mulberry32(seed);
  const female = local() < style.female;
  const skirt = female && local() < style.skirt;
  return makeHuman({
    height: range(local, style.h[0], style.h[1]),
    hairStyle: pick(local, style.hair),
    archetype,
    female,
    skirt,
    jacket: style.jacket,
    seed,
  });
}

// ---------------------------------------------------------------------------
// updateHuman — poses, by rotating limb pivots only. Every call sets every
// animated rotation from scratch (no accumulation), so poses never drift.
// human.userData._phase accumulates walk time; dt is seconds since last call.
// ---------------------------------------------------------------------------
export function updateHuman(human, pose = 'idle', dt = 0.016, time = 0) {
  const p = human.userData.parts;
  if (!p) return;
  const u = human.userData;
  u._phase = (u._phase ?? 0) + dt;
  const t = u._phase;
  const now = time || t;

  // Reset everything to a neutral stand first; each pose then overrides.
  p.torso.rotation.set(0, 0, 0);
  p.torso.position.y = H.waistY;
  p.head.rotation.set(0, 0, 0.02);
  p.head.position.y = 0.63;
  p.armL.rotation.set(0, 0, 0.07);
  p.armR.rotation.set(0, 0, -0.07);
  p.armL.userData.elbow.rotation.set(0, 0, 0);
  p.armR.userData.elbow.rotation.set(0, 0, 0);
  p.legL.rotation.set(0, 0, 0);
  p.legR.rotation.set(0, 0, 0);
  p.legL.userData.knee.rotation.set(0, 0, 0);
  p.legR.userData.knee.rotation.set(0, 0, 0);

  if (pose === 'idle') {
    // Breathing: torso rises ~1 cm, arms sway a touch, head looks around.
    const b = Math.sin(now * 1.4) * 0.008;
    p.torso.position.y = H.waistY + b;
    p.torso.rotation.z = Math.sin(now * 0.7) * 0.02;
    p.armL.rotation.x = Math.sin(now * 0.9) * 0.05;
    p.armR.rotation.x = -Math.sin(now * 0.9) * 0.05;
    p.head.rotation.y = Math.sin(now * 0.35) * 0.35;
    p.head.position.y = 0.63 + b * 0.5;
  } else if (pose === 'walk') {
    const s = Math.sin(t * 7) * 0.55;
    p.legL.rotation.x = s;
    p.legR.rotation.x = -s;
    p.legL.userData.knee.rotation.x = Math.max(0, -Math.sin(t * 7)) * 0.5;
    p.legR.userData.knee.rotation.x = Math.max(0, Math.sin(t * 7)) * 0.5;
    p.armL.rotation.x = -s * 0.75;
    p.armR.rotation.x = s * 0.75;
    p.armL.userData.elbow.rotation.x = -0.25;
    p.armR.userData.elbow.rotation.x = -0.25;
    p.torso.rotation.y = Math.sin(t * 7) * 0.08;
    p.torso.rotation.x = 0.05;
    p.torso.position.y = H.waistY + Math.abs(Math.cos(t * 7)) * 0.02;
    p.head.rotation.y = Math.sin(t * 3.5) * 0.10;
  } else if (pose === 'panic') {
    // Arms thrown up, fast short steps, head darting side to side.
    p.armL.rotation.z = 2.35;
    p.armR.rotation.z = -2.35;
    p.legL.rotation.x = Math.sin(t * 14) * 0.5;
    p.legR.rotation.x = -Math.sin(t * 14) * 0.5;
    p.legL.userData.knee.rotation.x = 0.4;
    p.legR.userData.knee.rotation.x = 0.4;
    p.torso.rotation.x = -0.08;
    p.torso.position.y = H.waistY + Math.abs(Math.sin(t * 14)) * 0.015;
    p.head.rotation.y = Math.sin(now * 2.2) * 0.5;
    p.head.rotation.x = -0.12;
  } else if (pose === 'talk') {
    // One hand gestures, head nods and tilts toward the partner.
    const g = Math.sin(now * 2.2) * 0.4;
    p.armR.rotation.x = -0.85 + g * 0.35;
    p.armR.rotation.z = -0.30;
    p.armR.userData.elbow.rotation.x = -0.5;
    p.armL.rotation.x = -0.35 + Math.sin(now * 2.2 + 1.2) * 0.25;
    p.armL.rotation.z = 0.30;
    p.torso.rotation.x = 0.06;
    p.torso.rotation.y = 0.08;
    p.head.rotation.x = Math.sin(now * 2.2) * 0.06;
    p.head.rotation.y = Math.sin(now * 0.9) * 0.22;
    p.head.rotation.z = 0.05;
  } else if (pose === 'sit') {
    // Seated: thighs forward (hips bent ~85 deg), shins down, hands on lap.
    p.legL.rotation.x = -1.45;
    p.legR.rotation.x = -1.45;
    p.legL.userData.knee.rotation.x = 1.35;
    p.legR.userData.knee.rotation.x = 1.35;
    p.armL.rotation.x = -0.55;
    p.armR.rotation.x = -0.55;
    p.armL.userData.elbow.rotation.x = -0.5;
    p.armR.userData.elbow.rotation.x = -0.5;
    p.torso.rotation.x = -0.06;
    p.head.rotation.y = 0.18;
  } else if (pose === 'drive') {
    // Arms forward to a wheel, elbows bent, slight forward lean.
    p.armL.rotation.x = -1.05;
    p.armR.rotation.x = -1.05;
    p.armL.rotation.z = 0.25;
    p.armR.rotation.z = -0.25;
    p.armL.userData.elbow.rotation.x = -0.35;
    p.armR.userData.elbow.rotation.x = -0.35;
    p.legL.rotation.x = -0.9;
    p.legR.rotation.x = -0.9;
    p.legL.userData.knee.rotation.x = 0.9;
    p.legR.userData.knee.rotation.x = 0.9;
    p.torso.rotation.x = 0.10;
    p.head.rotation.x = 0.04;
  }
}

// ---------------------------------------------------------------------------
// stageFaceCloseup — put the camera ~1.2 units in front of the face,
// slightly above eye level, looking at the face. A screenshot from here
// proves (or disproves) that the face looks human.
// ---------------------------------------------------------------------------
export function stageFaceCloseup(human, camera) {
  human.updateWorldMatrix(true, true);
  const headPos = new THREE.Vector3();
  human.userData.head.getWorldPosition(headPos);
  // Human forward is +Z.
  const forward = new THREE.Vector3();
  human.getWorldDirection(forward);
  if (forward.lengthSq() < 0.5) forward.set(0, 0, 1);
  forward.y = 0;
  forward.normalize();
  const eyeY = headPos.y + 0.03; // slightly above eye level
  camera.position.set(
    headPos.x + forward.x * 1.2,
    eyeY + 0.10,
    headPos.z + forward.z * 1.2,
  );
  camera.lookAt(headPos.x, eyeY, headPos.z);
  camera.updateMatrixWorld(true);
  return camera;
}
