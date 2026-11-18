// city.js — Solara Bay v2: city and environment for the open-world crime
// game (make.fun gta6-01). A modern coastal city with a stone market square,
// a two-tier fountain, cloth banners, striped food stalls, palms, a cobbled
// footbridge, a container harbour and a beach. Everything here is procedural
// — Three.js primitives, canvas-painted textures, MeshStandardMaterial —
// with no network use and no outside assets. The build is deterministic:
// the same seed always grows the same city.
//
// Layout (1 unit = 1 metre, Y-up, ground at y = 0, city about 430 x 430):
//   road centrelines at -208, -156, -104, -52, 52, 104, 156, 208 on both
//   axes; the middle block (-52..52) is the market square; towers stand
//   centre-north; the harbour yard sits near z = 130; sand runs z 186..214
//   and the sea starts at beachZ = 212.
// API: buildCity(scene, seed = 20261118, maxAnisotropy = 4) returns
//   { update, colliders, roadGrid, spawnPlayer, plazaCenter, dockCenter,
//     beachZ, carSpots, landmarks: { tower, fountain, beach } }
// Colliders are axis-aligned boxes: { min: THREE.Vector3, max: THREE.Vector3 }.
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Seeded random numbers (sfc32). One stream per build, so a fixed seed
// replays the same streets, the same lit windows, the same palms.
// ---------------------------------------------------------------------------
function sfc32(seed) {
  let a = seed >>> 0;
  let b = (seed ^ 0x9e3779b9) >>> 0;
  let c = (seed ^ 0x85ebca6b) >>> 0;
  let d = (seed ^ 0xc2b2ae35) >>> 0;
  return function next() {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

function pick(rng, list) { return list[Math.floor(rng() * list.length)]; }

// ---------------------------------------------------------------------------
// Canvas helpers
// ---------------------------------------------------------------------------
function makeCanvas2D(w, h) {
  const sheet = document.createElement("canvas");
  sheet.width = w; sheet.height = h;
  return [sheet, sheet.getContext("2d")];
}

function toTexture(sheet, repeat) {
  const texture = new THREE.CanvasTexture(sheet);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = MAX_ANISO;
  if (repeat) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
  }
  return texture;
}

// Highest anisotropy the GPU reports (main.js passes it in via buildCity);
// ground textures at grazing angles stay sharp instead of smearing.
// Default 4 until buildCity runs.
let MAX_ANISO = 4;

function dust(g, w, h, n, rng, alpha) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = rng() < 0.5
      ? 'rgba(0,0,0,' + alpha + ')'
      : 'rgba(255,255,255,' + alpha + ')';
    g.fillRect(rng() * w, rng() * h, 1 + rng() * 2, 1 + rng() * 2);
  }
}

// ---------------------------------------------------------------------------
// Facades. Each elevation is painted whole: the canvas stands for one
// building face, with exactly as many window floors as the building has,
// a cornice at the top and a shopfront or a doorway at the bottom. The
// cache key is (wall colour, floors, window columns, lit level), so
// lookalike buildings share one texture instead of each minting its own.
// ---------------------------------------------------------------------------
const WALL_COLOURS = [
  '#EFDDB2', '#DDBB8E', '#A95F43', '#C4744E',
  '#9FB27F', '#6B8CA3', '#D98A6B', '#EFE7D8',
];
function paintFacade(rng, cache, wall, floors, cols, litMode) {
  const key = wall + '|' + floors + '|' + cols + '|' + litMode;
  const hit = cache.get(key);
  if (hit) return hit;
  const W = 192, H = 288;
  const [cv, g] = makeCanvas2D(W, H);
  g.fillStyle = wall; g.fillRect(0, 0, W, H);
  dust(g, W, H, 220, rng, 0.06);
  // Side shading so the face is not a flat slab of colour.
  const edge = g.createLinearGradient(0, 0, W, 0);
  edge.addColorStop(0, 'rgba(0,0,0,0.20)');
  edge.addColorStop(0.12, 'rgba(0,0,0,0)');
  edge.addColorStop(0.88, 'rgba(0,0,0,0)');
  edge.addColorStop(1, 'rgba(0,0,0,0.20)');
  g.fillStyle = edge; g.fillRect(0, 0, W, H);
  const litChance = litMode === 0 ? 0.10 : 0.32;
  const floorH = (H - 58) / floors;
  const winW = Math.min(24, (W - 24) / cols - 8);
  // Window floors, top to bottom, above the ground floor.
  for (let f = 0; f < floors; f++) {
    const y = 14 + f * floorH;
    for (let c = 0; c < cols; c++) {
      const x = 12 + c * ((W - 24) / cols) + ((W - 24) / cols - winW) / 2;
      g.fillStyle = 'rgba(255,255,255,0.30)';
      g.fillRect(x - 2, y, winW + 4, floorH * 0.62);
      const lit = rng() < litChance;
      g.fillStyle = lit ? (rng() < 0.6 ? '#FFD166' : '#FFE9A8') : '#2A3A4E';
      g.fillRect(x, y + 2, winW, floorH * 0.62 - 4);
      if (!lit) {
        g.fillStyle = 'rgba(255,255,255,0.20)';
        g.fillRect(x, y + 2, winW, 3);
      }
    }
  }
  // Cornice.
  g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(0, 0, W, 12);
  g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(0, 12, W, 3);
  // Ground floor: shopfront glass + door, or a doorway + small windows.
  const gy = H - 44;
  if (litMode === 2) {
    const grad = g.createLinearGradient(0, gy, 0, H);
    grad.addColorStop(0, '#3E6E7E'); grad.addColorStop(1, '#16242E');
    g.fillStyle = grad; g.fillRect(8, gy, W - 16, 44);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.beginPath(); g.moveTo(30, H); g.lineTo(70, gy); g.lineTo(86, gy); g.lineTo(46, H); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.45)';
    for (let x = 8; x < W - 8; x += 32) g.fillRect(x, gy, 3, 44);
    g.fillStyle = '#1A2A33'; g.fillRect(W - 52, gy + 10, 30, 34);
    g.strokeStyle = '#FFD166'; g.lineWidth = 2;
    g.strokeRect(W - 52, gy + 10, 30, 34);
  } else {
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, gy - 4, W, 4);
    g.fillStyle = '#2A2A30'; g.fillRect(W / 2 - 14, gy + 6, 28, 38);
    g.fillStyle = '#FFD166'; g.fillRect(W / 2 + 8, gy + 22, 3, 3);
    g.fillStyle = '#2A3A4E';
    g.fillRect(16, gy + 10, 22, 18);
    g.fillRect(W - 38, gy + 10, 22, 18);
  }
  const texture = toTexture(cv, false);
  cache.set(key, texture);
  return texture;
}

// Shopfront awning stripes (two palette colours).
function paintAwning(a, b) {
  const [cv, g] = makeCanvas2D(128, 64);
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 === 0 ? a : b;
    g.fillRect(i * 16, 0, 16, 64);
  }
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, 50, 128, 14);
  return toTexture(cv, true);
}

// Painted signboard. Invented names only — no real brands.
function paintSignboard(text, bg, fg) {
  const [cv, g] = makeCanvas2D(512, 128);
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = fg; g.lineWidth = 5; g.strokeRect(10, 10, 492, 108);
  g.fillStyle = fg;
  g.font = 'bold 48px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 70);
  return toTexture(cv, false);
}

// Vertical plaza banner: a gull over a crescent sun and three waves.
function paintBannerGull() {
  const [cv, g] = makeCanvas2D(192, 320);
  g.fillStyle = '#17434E'; g.fillRect(0, 0, 192, 320);
  g.strokeStyle = '#FFD166'; g.lineWidth = 7; g.strokeRect(9, 9, 174, 302);
  // Crescent sun.
  g.fillStyle = '#FFD166';
  g.beginPath(); g.arc(96, 92, 40, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#17434E';
  g.beginPath(); g.arc(112, 82, 34, 0, Math.PI * 2); g.fill();
  // Gulls: two small chevrons.
  g.strokeStyle = '#FFE9A8'; g.lineWidth = 5; g.lineCap = 'round';
  for (const [gx, gy, s] of [[64, 158, 12], [126, 150, 9]]) {
    g.beginPath(); g.moveTo(gx - s, gy); g.quadraticCurveTo(gx, gy - s, gx + s, gy); g.stroke();
  }
  // Waves.
  g.strokeStyle = '#2EA6B6'; g.lineWidth = 8;
  for (let k = 0; k < 3; k++) {
    g.beginPath();
    for (let x = 26; x <= 166; x += 8) {
      const y = 196 + k * 22 + Math.sin(x * 0.07 + k * 1.7) * 7;
      if (x === 26) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }
  g.fillStyle = '#FFE9A8';
  g.font = 'bold 34px sans-serif'; g.textAlign = 'center';
  g.fillText('SOLARA', 96, 278);
  g.font = 'bold 22px sans-serif'; g.fillStyle = '#2EA6B6';
  g.fillText('B A Y', 96, 302);
  return toTexture(cv, false);
}

// Cloth for the market arch: gull, sun, and the city's name.
function paintArchCloth() {
  const [cv, g] = makeCanvas2D(512, 224);
  g.fillStyle = '#17434E'; g.fillRect(0, 0, 512, 224);
  g.strokeStyle = '#FFD166'; g.lineWidth = 7; g.strokeRect(9, 9, 494, 206);
  g.fillStyle = '#FFD166';
  g.beginPath(); g.arc(84, 112, 46, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#17434E';
  g.beginPath(); g.arc(100, 100, 38, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#FFE9A8';
  g.font = 'bold 64px sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText('SOLARA BAY', 156, 104);
  g.font = 'bold 24px sans-serif'; g.fillStyle = '#2EA6B6';
  g.fillText('HARBOUR  •  MARKET  •  BEACH', 158, 158);
  return toTexture(cv, false);
}

// Shipping-box face: ribs, three door bars, a brand and a code.
function paintBoxFace(rng, base, brand, code) {
  const [cv, g] = makeCanvas2D(512, 256);
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 256);
  for (let x = 0; x < 512; x += 20) {
    g.fillStyle = 'rgba(0,0,0,0.26)'; g.fillRect(x, 0, 5, 256);
    g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(x + 5, 0, 4, 256);
  }
  g.fillStyle = 'rgba(0,0,0,0.32)';
  for (const x of [330, 375, 420]) g.fillRect(x, 20, 6, 216);
  g.fillStyle = 'rgba(0,0,0,0.38)';
  g.fillRect(0, 0, 512, 14); g.fillRect(0, 242, 512, 14);
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.font = 'bold 40px sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText(brand, 28, 70);
  g.font = 'bold 26px sans-serif'; g.fillStyle = 'rgba(255,255,255,0.85)';
  g.fillText(code, 28, 118);
  g.font = '20px sans-serif'; g.fillStyle = 'rgba(255,255,255,0.68)';
  g.fillText('TARE 2 240 KG', 28, 156);
  for (let n = 0; n < 14; n++) {
    const x = rng() * 512, len = 24 + rng() * 70;
    const grad = g.createLinearGradient(0, 14, 0, 14 + len);
    grad.addColorStop(0, 'rgba(90,50,20,0.38)');
    grad.addColorStop(1, 'rgba(88,48,20,0)');
    g.fillStyle = grad;
    g.fillRect(x, 14, 4 + rng() * 4, len);
  }
  return toTexture(cv, false);
}

// Timber crate face: planks and a stencil mark.
function paintCrateFace(rng) {
  const [cv, g] = makeCanvas2D(128, 128);
  g.fillStyle = '#A8873A'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(60,40,15,0.5)';
  for (let y = 0; y <= 128; y += 26) {
    g.fillRect(0, y, 128, 3);
  }
  g.strokeStyle = 'rgba(60,40,15,0.38)'; g.lineWidth = 6;
  g.strokeRect(4, 4, 120, 120);
  g.fillStyle = 'rgba(60,40,15,0.62)';
  g.font = 'bold 18px sans-serif'; g.textAlign = 'center';
  g.fillText('BAY GOODS', 64, 68);
  dust(g, 128, 128, 36, rng, 0.07);
  return toTexture(cv, false);
}

// Rounded cobbles for the footbridge deck.
function paintCobbles(rng) {
  const [cv, g] = makeCanvas2D(256, 128);
  g.fillStyle = '#B59A72'; g.fillRect(0, 0, 256, 128);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 8; col++) {
      const off = row % 2 === 0 ? 0 : 16;
      const shade = 148 + Math.floor(rng() * 52);
      g.fillStyle = 'rgb(' + shade + ',' + (shade - 14) + ',' + (shade - 48) + ')';
      g.beginPath();
      g.ellipse(col * 32 + off + 16, row * 32 + 16, 13, 12, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  return toTexture(cv, true);
}

// Ashlar stone courses for the market arch pillars.
function paintAshlar(rng) {
  const [cv, g] = makeCanvas2D(256, 256);
  g.fillStyle = '#DDBB8E'; g.fillRect(0, 0, 256, 256);
  dust(g, 256, 256, 280, rng, 0.07);
  g.strokeStyle = 'rgba(90,65,30,0.38)'; g.lineWidth = 3;
  for (let y = 0; y <= 256; y += 36) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke();
  }
  for (let y = 18; y <= 256; y += 36) {
    const off = (Math.floor(y / 36) % 2 === 0) ? 0 : 36;
    for (let x = off; x <= 256; x += 72) {
      g.beginPath(); g.moveTo(x, y - 18); g.lineTo(x, y + 18); g.stroke();
    }
  }
  return toTexture(cv, true);
}

// Channel water: deep teal with lighter flow streaks along the channel
// and pale glints. The old concentric-ring texture stretched 15:1 across
// the 60 m plane and read as flat painted bands. Own fixed sub-stream:
// the shared seed stream is untouched, so the layout does not reshuffle.
function paintChannelWater() {
  const sub = sfc32(0xC4A11E1);
  const [cv, g] = makeCanvas2D(256, 64);
  g.fillStyle = '#0F5568'; g.fillRect(0, 0, 256, 64);
  for (let k = 0; k < 46; k++) {
    const y = sub() * 64, w = 20 + sub() * 70, h = 1 + sub() * 2.5;
    g.fillStyle = sub() < 0.6 ? 'rgba(46,139,158,0.55)' : 'rgba(120,200,210,0.35)';
    g.fillRect(sub() * 256, y, w, h);
  }
  for (let k = 0; k < 60; k++) {
    g.fillStyle = 'rgba(255,255,255,' + (0.12 + sub() * 0.25) + ')';
    g.fillRect(sub() * 256, sub() * 64, 1 + sub() * 3, 1);
  }
  // Darker edges: depth under the banks.
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, 'rgba(6,42,52,0.55)');
  grad.addColorStop(0.5, 'rgba(6,42,52,0)');
  grad.addColorStop(1, 'rgba(6,42,52,0.55)');
  g.fillStyle = grad; g.fillRect(0, 0, 256, 64);
  return toTexture(cv, true);
}

// Fountain water: dashed concentric rings on shallow teal.
function paintRipples() {
  const [cv, g] = makeCanvas2D(256, 256);
  g.fillStyle = '#2EA6B6'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(255,255,255,0.32)'; g.lineWidth = 3;
  g.setLineDash([14, 10]);
  for (let r = 18; r < 132; r += 22) {
    g.beginPath(); g.arc(128, 128, r, 0, Math.PI * 2); g.stroke();
  }
  g.setLineDash([]);
  g.strokeStyle = 'rgba(255,255,255,0.16)'; g.lineWidth = 2;
  for (let r = 28; r < 132; r += 22) {
    g.beginPath(); g.arc(128, 128, r, 0.6, 2.6); g.stroke();
  }
  return toTexture(cv, true);
}

// Asphalt tile: 12 metres of road per tile, edge lines and a centre dash.
// 256 px per tile (was 128): dash and edge lines stay crisp when the road
// fills the frame.
function paintAsphalt(rng) {
  const S = 256;
  const [cv, g] = makeCanvas2D(S, S);
  g.fillStyle = '#33363C'; g.fillRect(0, 0, S, S);
  dust(g, S, S, 200, rng, 0.08);
  g.fillStyle = 'rgba(232,232,226,0.55)';
  g.fillRect(6, 0, 4, S); g.fillRect(246, 0, 4, S);
  g.fillStyle = '#E8C832';
  g.fillRect(122, 28, 12, 88);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  for (let k = 0; k < 5; k++) {
    g.fillRect(rng() * S, rng() * S, 16 + rng() * 28, 6);
  }
  return toTexture(cv, true);
}

// Sand with a damp band along the waterline edge (canvas bottom).
function paintSand(rng) {
  const [cv, g] = makeCanvas2D(256, 256);
  g.fillStyle = '#E9D49B'; g.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 900; k++) {
    g.fillStyle = rng() < 0.5 ? 'rgba(120,95,50,0.18)' : 'rgba(255,240,200,0.20)';
    g.fillRect(rng() * 256, rng() * 256, 1 + rng() * 3, 1 + rng() * 3);
  }
  const grad = g.createLinearGradient(0, 196, 0, 256);
  grad.addColorStop(0, 'rgba(211,178,110,0)');
  grad.addColorStop(1, 'rgba(211,178,110,0.9)');
  g.fillStyle = grad; g.fillRect(0, 196, 256, 60);
  return toTexture(cv, true);
}

// Yard concrete: joints, stains, tyre scuffs. 512 px tile (was 256),
// darker base and harder joints/stains: the docks yard must read as
// concrete slabs, not a flat beige plane.
function paintConcrete(rng) {
  const S = 512;
  const [cv, g] = makeCanvas2D(S, S);
  g.fillStyle = '#857C71'; g.fillRect(0, 0, S, S);
  dust(g, S, S, 500, rng, 0.07);
  g.strokeStyle = 'rgba(0,0,0,0.40)';
  g.lineWidth = 4;
  for (let v = 0; v <= S; v += 128) {
    g.beginPath(); g.moveTo(v, 0); g.lineTo(v, S); g.stroke();
    g.beginPath(); g.moveTo(0, v); g.lineTo(S, v); g.stroke();
  }
  // Faded yellow yard guide lines (they repeat with the tile).
  g.fillStyle = 'rgba(232,200,50,0.20)';
  g.fillRect(0, 128, S, 8);
  g.fillRect(0, 384, S, 8);
  for (let k = 0; k < 8; k++) {
    const x = rng() * S, y = rng() * S, r = 28 + rng() * 52;
    if (k < 3) {
      // Dark oil spot, not a soft stain, so the yard is not one even tone.
      g.fillStyle = 'rgba(20,16,12,0.45)';
      g.beginPath(); g.arc(x, y, r * 0.5, 0, Math.PI * 2);
      g.fill();
      continue;
    }
    const halo = g.createRadialGradient(x, y, 1, x, y, r);
    halo.addColorStop(0, 'rgba(25,20,16,0.38)');
    halo.addColorStop(1, 'rgba(25,20,16,0)');
    g.fillStyle = halo;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  return toTexture(cv, true);
}

// Bare ground between roads and buildings: warm tan with soft blotches,
// so the gaps are not one flat beige plane. Own fixed sub-stream: the
// shared seed stream is untouched, so the city layout does not reshuffle.
function paintGround() {
  const sub = sfc32(0x6B30);
  const S = 256;
  const [cv, g] = makeCanvas2D(S, S);
  g.fillStyle = '#B3A184'; g.fillRect(0, 0, S, S);
  dust(g, S, S, 900, sub, 0.06);
  for (let k = 0; k < 14; k++) {
    const x = sub() * S, y = sub() * S, r = 30 + sub() * 50;
    const halo = g.createRadialGradient(x, y, 1, x, y, r);
    halo.addColorStop(0, 'rgba(90,70,45,0.14)');
    halo.addColorStop(1, 'rgba(90,70,45,0)');
    g.fillStyle = halo;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  return toTexture(cv, true);
}

// Plaza paving: stone tiles in varied shades, ring joints around the
// fountain (canvas point 512,342 is the fountain at world (0,-10)) and a
// dark channel bed stripe (canvas y 786..854 is the water channel z 16..20).
// 1024 px (was 512): the paving stays crisp under the start camera.
function paintPlazaTiles(rng) {
  const S = 1024;
  const T = S / 8;
  const [cv, g] = makeCanvas2D(S, S);
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const shade = 196 + Math.floor(rng() * 26);
      g.fillStyle = 'rgb(' + shade + ',' + (shade - 18) + ',' + (shade - 52) + ')';
      g.fillRect(col * T, row * T, T, T);
    }
  }
  g.strokeStyle = 'rgba(120,90,50,0.4)'; g.lineWidth = 4;
  for (let v = 0; v <= S; v += T) {
    g.beginPath(); g.moveTo(v, 0); g.lineTo(v, S); g.stroke();
    g.beginPath(); g.moveTo(0, v); g.lineTo(S, v); g.stroke();
  }
  g.strokeStyle = 'rgba(120,90,50,0.5)'; g.lineWidth = 6;
  for (const r of [92, 156, 220, 284]) {
    g.beginPath(); g.arc(S / 2, S * 171 / 512, r, 0, Math.PI * 2); g.stroke();
  }
  for (let k = 0; k < 700; k++) {
    g.fillStyle = rng() < 0.5 ? 'rgba(90,70,40,0.14)' : 'rgba(255,240,200,0.14)';
    g.fillRect(rng() * S, rng() * S, 4, 4);
  }
  g.fillStyle = '#1E4A52';
  g.fillRect(0, S * 393 / 512, S, S * 34 / 512);
  g.fillStyle = '#2A5A62';
  g.fillRect(0, S * 401 / 512, S, S * 18 / 512);
  return toTexture(cv, false);
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------
// Join several non-indexed geometries into one (crowns, canopies, clouds).
function joinGeoms(list) {
  const flat = list.map((geo) => (geo.index ? geo.toNonIndexed() : geo));
  let count = 0;
  for (const g of flat) count += g.attributes.position.count;
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  let at = 0;
  for (const g of flat) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, at * 3);
    if (g.attributes.normal) nor.set(g.attributes.normal.array, at * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, at * 2);
    at += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}

// Palm trunk: three stacked, shrinking segments that lean a little more
// with each step, merged into one piece.
function palmTrunkGeo() {
  const segs = [];
  const defs = [
    [0.34, 0.28, 2.2, 1.1, 0.0, 0.0],
    [0.28, 0.23, 2.2, 3.3, 0.18, -0.08],
    [0.23, 0.17, 2.0, 5.2, 0.42, -0.14],
  ];
  for (const [rTop, rBot, h, y, x, rz] of defs) {
    const s = new THREE.CylinderGeometry(rTop, rBot, h, 6);
    s.rotateZ(rz);
    s.translate(x, y, 0);
    segs.push(s);
  }
  return joinGeoms(segs);
}

// Palm crown: six fronds, each a plane folded into a shallow V, tapered
// to a point and drooping at the tip, fanned around the trunk top.
function palmCrownGeo() {
  const fronds = [];
  for (let k = 0; k < 6; k++) {
    const f = new THREE.PlaneGeometry(3.4, 1.0, 5, 2);
    f.rotateX(-Math.PI / 2);
    const p = f.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const t = (x + 1.7) / 3.4;
      p.setZ(i, z * (1 - t * 0.8));
      p.setY(i, Math.abs(z) * 0.45 - t * t * 1.15);
    }
    f.computeVertexNormals();
    f.translate(1.7, 0, 0);
    f.rotateY((k / 6) * Math.PI * 2 + 0.3);
    fronds.push(f);
  }
  const crown = joinGeoms(fronds);
  crown.translate(0, 6.3, 0);
  return crown;
}

// Broadleaf crown: three puffy spheres merged into one lumpy canopy.
function leafyCrownGeo() {
  const a = new THREE.IcosahedronGeometry(2.4, 1); a.translate(0, 0.4, 0);
  const b = new THREE.IcosahedronGeometry(1.7, 1); b.translate(1.6, 1.0, 0.4);
  const c = new THREE.IcosahedronGeometry(1.6, 1); c.translate(-1.5, 0.9, -0.5);
  return joinGeoms([a, b, c]);
}

// Boulders: a hash-based wobble plus a slow cosine bulge. The hash mixes
// the vertex position with the seed, so two seeds give two different rocks
// and the same seed always gives the same rock.
function hash3(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

function roughenStone(geo, seed, amp) {
  const verts = geo.attributes.position;
  const p = new THREE.Vector3();
  for (let i = 0; i < verts.count; i++) {
    p.fromBufferAttribute(verts, i);
    const wob = hash3(p.x * 1.9 + seed * 3.1, p.y * 1.9 + seed, p.z * 1.9 - seed * 1.7);
    const bulge = Math.cos(p.x * 2.3 + seed * 0.7)
      * Math.cos(p.y * 1.9 + seed * 1.3)
      * Math.cos(p.z * 2.1 + seed * 0.4) * 0.10;
    p.multiplyScalar(1 + (wob - 0.5) * 2 * amp + bulge);
    verts.setXYZ(i, p.x, p.y, p.z);
  }
  geo.computeVertexNormals();
  return geo;
}

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------
const ROADS = [-208, -156, -104, -52, 52, 104, 156, 208];
const CELLS = [-182, -130, -78, 0, 78, 130, 182];
const BEACH_Z = 212;
const PLAZA_HALF = 30; // the paved square, x/z -30..30

function widthOf(v) {
  if (Math.abs(v) >= 156) return 14;
  if (Math.abs(v) === 104) return 12;
  return 10;
}

// ---------------------------------------------------------------------------
// buildCity
// ---------------------------------------------------------------------------
export function buildCity(scene, seed = 20261118, maxAnisotropy = 4) {
  MAX_ANISO = Math.max(4, Math.min(16, maxAnisotropy || 4));
  const rng = sfc32(seed);
  const colliders = [];
  const city = new THREE.Group();
  city.name = 'solara-bay';
  const placer = new THREE.Object3D();
  function commitMatrices(inst) { inst.instanceMatrix['needsUpdate'] = true; }
  function commitColours(inst) { inst.instanceColor['needsUpdate'] = true; }

  function solid(x0, z0, x1, z1, h, y0) {
    colliders.push({
      min: new THREE.Vector3(x0, y0 || 0, z0),
      max: new THREE.Vector3(x1, (y0 || 0) + h, z1),
    });
  }

  // -- Light and air: one warm key sun, cool hemisphere fill, fog the
  //    colour of the horizon. Bright on purpose — the street must read
  //    sunlit, not dim — but the fog stays light (0.0007) and the fill
  //    stays restrained, or distant geometry washes out to cream.
  const sunDir = new THREE.Vector3(0.52, 0.45, 0.72).normalize();
  const sun = new THREE.DirectionalLight(0xFFE3B0, 2.6);
  sun.position.copy(sunDir).multiplyScalar(380);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -200;
  sun.shadow.camera.right = 200;
  sun.shadow.camera.top = 200;
  sun.shadow.camera.bottom = -200;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 900;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  scene.add(sun.target);
  scene.add(new THREE.HemisphereLight(0xCFE4FF, 0x8A6F45, 0.75));
  scene.fog = new THREE.FogExp2(0xEAD9B4, 0.0007);

  // -- Sky dome: four-band warm daylight gradient with a sun disc and a
  //    glow on the same bearing as the key light.
  const domeMat = new THREE.ShaderMaterial({
    uniforms: {
      uSun: { value: sunDir },
      uTop: { value: new THREE.Color(0x5E9BD6) },
      uHigh: { value: new THREE.Color(0x8FC3E8) },
      uMid: { value: new THREE.Color(0xFFD9A8) },
      uLow: { value: new THREE.Color(0xF2D6A0) },
      uUnder: { value: new THREE.Color(0x6B7A86) },
    },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: [
      'varying vec3 vDir;',
      'void main() {',
      '  vDir = position;',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}',
    ].join('\n'),
    fragmentShader: [
      'uniform vec3 uSun;',
      'uniform vec3 uTop;',
      'uniform vec3 uHigh;',
      'uniform vec3 uMid;',
      'uniform vec3 uLow;',
      'uniform vec3 uUnder;',
      'varying vec3 vDir;',
      'void main() {',
      '  vec3 d = normalize(vDir);',
      '  float h = d.y;',
      '  vec3 col = mix(uUnder, uLow, smoothstep(-0.12, 0.0, h));',
      '  col = mix(col, uMid, smoothstep(0.0, 0.16, h));',
      '  col = mix(col, uHigh, smoothstep(0.16, 0.45, h));',
      '  col = mix(col, uTop, smoothstep(0.45, 0.8, h));',
      '  float s = max(dot(d, uSun), 0.0);',
      '  col += vec3(1.0, 0.85, 0.55) * pow(s, 24.0) * 0.32;',
      '  col += vec3(1.0, 0.9, 0.65) * smoothstep(0.9993, 0.9997, s) * 2.5;',
      '  gl_FragColor = vec4(col, 1.0);',
      '  #include <tonemapping_fragment>',
      '  #include <colorspace_fragment>',
      '}',
    ].join('\n'),
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(850, 32, 18), domeMat);
  dome.renderOrder = -1;
  dome.frustumCulled = false;
  city.add(dome);

  // -- Ocean: a shader plane past the waterline. Four travelling waves
  //    share one displacement field; the normals are the analytic
  //    derivatives of that same field, so the glitter and the shape agree.
  const seaUniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uSun: { value: sunDir },
      uDeep: { value: new THREE.Color(0x0A5468) },
      uShallow: { value: new THREE.Color(0x2EA6B6) },
      uSky: { value: new THREE.Color(0xFFE9C4) },
      uFoam: { value: new THREE.Color(0xEAF6F2) },
    },
  ]);
  const seaMat = new THREE.ShaderMaterial({
    uniforms: seaUniforms,
    fog: true,
    vertexShader: [
      'uniform float uTime;',
      'varying vec3 vWorldPos;',
      'varying vec3 vNormalW;',
      'varying float vCrest;',
      '#include <fog_pars_vertex>',
      'void main() {',
      '  vec4 wp0 = modelMatrix * vec4(position, 1.0);',
      '  float t = uTime;',
      '  vec2 p = wp0.xz;',
      '  float h = 0.0;',
      '  float dx = 0.0;',
      '  float dz = 0.0;',
      '  vec2 d1 = normalize(vec2(1.0, 0.3));',
      '  vec2 d2 = normalize(vec2(-0.6, 1.0));',
      '  vec2 d3 = normalize(vec2(0.8, -0.6));',
      '  vec2 d4 = normalize(vec2(0.2, 1.0));',
      '  float ph1 = dot(d1, p) * 0.09 + t * 0.9;',
      '  float ph2 = dot(d2, p) * 0.13 - t * 1.25;',
      '  float ph3 = dot(d3, p) * 0.21 + t * 1.6;',
      '  float ph4 = dot(d4, p) * 0.33 - t * 2.1;',
      '  h += 0.32 * sin(ph1) + 0.22 * sin(ph2) + 0.13 * sin(ph3) + 0.07 * sin(ph4);',
      '  dx += 0.32 * 0.09 * d1.x * cos(ph1) + 0.22 * 0.13 * d2.x * cos(ph2)',
      '      + 0.13 * 0.21 * d3.x * cos(ph3) + 0.07 * 0.33 * d4.x * cos(ph4);',
      '  dz += 0.32 * 0.09 * d1.y * cos(ph1) + 0.22 * 0.13 * d2.y * cos(ph2)',
      '      + 0.13 * 0.21 * d3.y * cos(ph3) + 0.07 * 0.33 * d4.y * cos(ph4);',
      '  float att = 0.3 + 0.7 * smoothstep(212.0, 250.0, wp0.z);',
      '  vec3 pos = position;',
      '  pos.z += h * att;',
      '  vec4 wp = modelMatrix * vec4(pos, 1.0);',
      '  vWorldPos = wp.xyz;',
      '  vNormalW = normalize(vec3(-dx * att, 1.0, -dz * att));',
      '  vCrest = h;',
      '  vec4 mvPosition = viewMatrix * wp;',
      '  gl_Position = projectionMatrix * mvPosition;',
      '  #include <fog_vertex>',
      '}',
    ].join('\n'),
    fragmentShader: [
      'uniform float uTime;',
      'uniform vec3 uSun;',
      'uniform vec3 uDeep;',
      'uniform vec3 uShallow;',
      'uniform vec3 uSky;',
      'uniform vec3 uFoam;',
      'varying vec3 vWorldPos;',
      'varying vec3 vNormalW;',
      'varying float vCrest;',
      '#include <fog_pars_fragment>',
      'void main() {',
      '  vec3 V = normalize(cameraPosition - vWorldPos);',
      '  vec3 N = normalize(vNormalW);',
      '  float rip = sin(vWorldPos.x * 1.7 + uTime * 1.4)',
      '    * sin(vWorldPos.z * 2.1 - uTime * 1.1);',
      '  N = normalize(N + vec3(rip * 0.05, 0.0, rip * 0.04));',
      '  float shore = smoothstep(246.0, 214.0, vWorldPos.z);',
      '  vec3 col = mix(uDeep, uShallow, clamp(shore * 0.9 + 0.08, 0.0, 1.0));',
      '  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);',
      '  col = mix(col, uSky, fres * 0.32);',
      '  vec3 R = reflect(-uSun, N);',
      '  float spec = pow(max(dot(R, V), 0.0), 180.0);',
      '  col += vec3(1.0, 0.8, 0.5) * spec * 1.6;',
      '  float lap = 0.5 + 0.5 * sin(vWorldPos.z * 1.5 - uTime * 2.0);',
      '  float foam = smoothstep(0.45, 0.75, vCrest * 0.8 + shore * 0.5 + lap * 0.25);',
      '  col = mix(col, uFoam, clamp(foam, 0.0, 1.0) * 0.55);',
      '  gl_FragColor = vec4(col, 1.0);',
      '  #include <fog_fragment>',
      '  #include <tonemapping_fragment>',
      '  #include <colorspace_fragment>',
      '}',
    ].join('\n'),
  });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1000, 340, 96, 30), seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.3, 382);
  city.add(sea);
  const surfMat = new THREE.MeshBasicMaterial({
    color: 0xEAF6F2, transparent: true, opacity: 0.25, depthWrite: false,
  });
  const surfBand = new THREE.Mesh(new THREE.PlaneGeometry(1000, 4), surfMat);
  surfBand.rotation.x = -Math.PI / 2;
  surfBand.position.set(0, -0.1, 213.5);
  city.add(surfBand);

  // -- Clouds: seven puff clusters built from merged spheres, drifting
  //    on two layers. Positions are rolled from the seed, not listed.
  const puffGeo = (() => {
    const balls = [];
    const spots = [[0, 0, 0, 2.4], [2.2, 0.2, 0.3, 1.8], [-2.1, 0.1, -0.2, 1.7], [0.9, 0.7, -0.4, 1.5], [-1.0, 0.6, 0.5, 1.4]];
    for (const [x, y, z, r] of spots) {
      const s = new THREE.SphereGeometry(r, 10, 8);
      s.scale(1.5, 0.55, 1.15);
      s.translate(x, y, z);
      balls.push(s);
    }
    return joinGeoms(balls);
  })();
  const puffMat = new THREE.MeshBasicMaterial({
    color: 0xFFFFFF, transparent: true, opacity: 0.8, fog: false,
  });
  const clouds = [];
  for (let i = 0; i < 7; i++) {
    const c = new THREE.Mesh(puffGeo, puffMat);
    const overSea = i < 2;
    c.position.set(
      (rng() - 0.5) * 1200,
      130 + rng() * 70,
      overSea ? 300 + rng() * 220 : (rng() - 0.5) * 1100);
    const w = 34 + rng() * 30;
    c.scale.set(w, w * 0.9, w);
    c.userData.speed = 1.4 + rng() * 1.4;
    clouds.push(c);
    city.add(c);
  }

  // -- Ground base: one warm pavement plane with a subtle blotched
  //    texture (not a flat beige slab); roads, parks, the square,
  //    the yard and the sand are separate planes laid on top of it.
  const groundTex = paintGround();
  groundTex.repeat.set(12, 11);
  const baseMat = new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1 });
  const base = new THREE.Mesh(new THREE.PlaneGeometry(540, 480), baseMat);
  base.rotation.x = -Math.PI / 2;
  base.position.set(0, 0, -30);
  base.receiveShadow = true;
  city.add(base);

  // -- Roads as individual planes with a repeating asphalt tile (12 m
  //    per tile: edge lines and one centre dash). The south boundary
  //    road at z = 208 is not paved — that strip is beach.
  const asphaltTex = paintAsphalt(rng);
  const roadGeoV = new THREE.PlaneGeometry(1, 402);
  const roadGeoH = new THREE.PlaneGeometry(434, 1);
  for (const v of ROADS) {
    const w = widthOf(v);
    const tex = asphaltTex.clone();
    tex.needsUpdate = true;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
    if (v !== 208) {
      const hRoad = new THREE.Mesh(roadGeoH, mat);
      hRoad.scale.y = w;
      tex.repeat.set(434 / 12, 1);
      hRoad.rotation.x = -Math.PI / 2;
      hRoad.position.set(0, 0.02, v);
      hRoad.receiveShadow = true;
      city.add(hRoad);
    }
    const vTex = asphaltTex.clone();
    vTex.needsUpdate = true;
    vTex.repeat.set(1, 402 / 12);
    const vMat = new THREE.MeshStandardMaterial({ map: vTex, roughness: 0.95 });
    const vRoad = new THREE.Mesh(roadGeoV, vMat);
    vRoad.scale.x = w;
    vRoad.rotation.x = -Math.PI / 2;
    vRoad.position.set(v, 0.02, -17);
    vRoad.receiveShadow = true;
    city.add(vRoad);
  }

  // -- Crosswalks: one instanced set of white stripes at every crossing.
  const stripeGeo = new THREE.PlaneGeometry(1.1, 2.4);
  stripeGeo.rotateX(-Math.PI / 2);
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xE8E8E2, roughness: 0.9 });
  const crossSpots = [];
  for (const rx of ROADS) {
    for (const rz of ROADS) {
      if (rz === 208) continue;
      const hwX = widthOf(rx) / 2, hwZ = widthOf(rz) / 2;
      for (let k = -2; k <= 2; k++) {
        crossSpots.push([rx + k * 2, rz - hwZ - 1.6, 0]);
        crossSpots.push([rx + k * 2, rz + hwZ + 1.6, 0]);
        crossSpots.push([rx - hwX - 1.6, rz + k * 2, 1]);
        crossSpots.push([rx + hwX + 1.6, rz + k * 2, 1]);
      }
    }
  }
  const stripeInst = new THREE.InstancedMesh(stripeGeo, stripeMat, crossSpots.length);
  crossSpots.forEach(([x, z, rot], i) => {
    placer.rotation.set(0, rot ? Math.PI / 2 : 0, 0);
    placer.scale.set(1, 1, 1);
    placer.position.set(x, 0.035, z);
    placer.updateMatrix();
    stripeInst.setMatrixAt(i, placer.matrix);
  });
  commitMatrices(stripeInst);
  stripeInst.receiveShadow = true;
  city.add(stripeInst);

  // -- The square: stone paving with ring joints and a dark channel bed.
  const plazaMat = new THREE.MeshStandardMaterial({ map: paintPlazaTiles(rng), roughness: 0.95 });
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), plazaMat);
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(0, 0.04, 0);
  plaza.receiveShadow = true;
  city.add(plaza);

  // -- Channel water across the square (the bridge crosses it at x = 0).
  //    Stone curbs frame both banks so the water reads as a sunken
  //    watercourse, not a painted stripe on the paving; the water sits
  //    between them, deep teal with flow streaks and a sun glint.
  const channelTex = paintChannelWater();
  channelTex.repeat.set(6, 1);
  const channelMat = new THREE.MeshStandardMaterial({
    map: channelTex, color: 0xFFFFFF, transparent: true, opacity: 0.96,
    roughness: 0.08, metalness: 0.25,
  });
  const channel = new THREE.Mesh(new THREE.PlaneGeometry(60, 4), channelMat);
  channel.rotation.x = -Math.PI / 2;
  channel.position.set(0, 0.07, 18);
  city.add(channel);
  const curbMat = new THREE.MeshStandardMaterial({ color: 0xA89A78, roughness: 0.9 });
  for (const [cx0, cx1] of [[-30, -3.4], [3.4, 30]]) {
    for (const cz of [15.7, 20.3]) {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(cx1 - cx0, 0.18, 0.5), curbMat);
      curb.position.set((cx0 + cx1) / 2, 0.09, cz);
      curb.castShadow = true; curb.receiveShadow = true;
      city.add(curb);
    }
  }

  // -- Sand, promenade, harbour apron, park lawns.
  const sandTex = paintSand(rng);
  sandTex.wrapS = THREE.RepeatWrapping;
  sandTex.repeat.set(4, 1);
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(540, 30),
    new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1 }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.02, 199);
  sand.receiveShadow = true;
  city.add(sand);
  const prom = new THREE.Mesh(new THREE.PlaneGeometry(540, 10),
    new THREE.MeshStandardMaterial({ color: 0xC4B89E, roughness: 1 }));
  prom.rotation.x = -Math.PI / 2;
  prom.position.set(0, 0.03, 181);
  prom.receiveShadow = true;
  city.add(prom);
  const concTex = paintConcrete(rng);
  concTex.wrapS = THREE.RepeatWrapping;
  concTex.wrapT = THREE.RepeatWrapping;
  concTex.repeat.set(6, 2);
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(170, 54),
    new THREE.MeshStandardMaterial({ map: concTex, roughness: 0.95 }));
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(0, 0.03, 130);
  apron.receiveShadow = true;
  city.add(apron);
  const lawnMat = new THREE.MeshStandardMaterial({ color: 0x5FA84B, roughness: 1 });
  for (const [lx, lz] of [[-130, 130], [130, -130]]) {
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(46, 46), lawnMat);
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.set(lx, 0.03, lz);
    lawn.receiveShadow = true;
    city.add(lawn);
  }

  // -- Buildings. Each block cell grows 1–3 buildings from its district.
  //    A building is one box with one whole-elevation texture; the roof
  //    cap, the awning and the sign are collected separately so repeats
  //    stay instanced.
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const matCache = new Map();
  const perBuildFacadeCache = new Map();
  function wallMaterial(wall, floors, cols, litMode) {
    const key = wall + '|' + floors + '|' + cols + '|' + litMode;
    let m = matCache.get(key);
    if (!m) {
      const glassy = wall === '#6B8CA3';
      m = new THREE.MeshStandardMaterial({
        map: paintFacade(rng, perBuildFacadeCache, wall, floors, cols, litMode),
        roughness: glassy ? 0.4 : 0.88,
        metalness: glassy ? 0.25 : 0,
      });
      matCache.set(key, m);
    }
    return m;
  }
  const flatCaps = [];
  const pitchedRoofs = [];
  const acSpots = [];
  const tankSpots = [];
  const antSpots = [];
  const awningSpots = [];
  const signJobs = [];
  const bannerJobs = [];
  const towerFaces = [];
  let tallest = { h: 0, x: 0, z: 0 };

  // Which side of a building faces its nearest road?
  function roadFace(bx, bz) {
    let bestX = null, bestZ = null, dx = 1e9, dz = 1e9;
    for (const v of ROADS) {
      if (Math.abs(bx - v) < dx) { dx = Math.abs(bx - v); bestX = v; }
      if (Math.abs(bz - v) < dz) { dz = Math.abs(bz - v); bestZ = v; }
    }
    if (dx <= dz) return { axis: 'x', dir: bestX > bx ? 1 : -1 };
    return { axis: 'z', dir: bestZ > bz ? 1 : -1 };
  }

  function facePoint(bx, bz, w, d, face, out) {
    if (face.axis === 'x') return [bx + face.dir * (w / 2 + out), bz];
    return [bx, bz + face.dir * (d / 2 + out)];
  }

  function raiseBuilding(bx, bz, w, d, h, wall, shop, pitched, originFace) {
    const floors = Math.max(1, Math.round(h / 3.4));
    const cols = Math.max(3, Math.min(6, Math.round(w / 4.2)));
    const litMode = shop ? 2 : (rng() < 0.5 ? 0 : 1);
    const mesh = new THREE.Mesh(unitBox, wallMaterial(wall, floors, cols, litMode));
    mesh.scale.set(w, h, d);
    mesh.position.set(bx, h / 2, bz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    city.add(mesh);
    solid(bx - w / 2, bz - d / 2, bx + w / 2, bz + d / 2, h);
    if (h > tallest.h) tallest = { h, x: bx, z: bz };
    if (h > 40) towerFaces.push([bx, bz, w, d, h]);
    if (pitched) pitchedRoofs.push([bx, bz, w, d, h]);
    else flatCaps.push([bx, bz, w, d, h]);
    if (h > 14 && rng() < 0.7) {
      acSpots.push([bx + (rng() - 0.5) * (w - 3), h + 0.9, bz + (rng() - 0.5) * (d - 3), rng() * Math.PI]);
    }
    if (h > 22 && rng() < 0.45) {
      tankSpots.push([bx + (rng() - 0.5) * (w - 4), h + 1.7, bz + (rng() - 0.5) * (d - 4)]);
    }
    if (rng() < 0.3) {
      antSpots.push([bx + (rng() - 0.5) * (w - 2), h + 2.4, bz + (rng() - 0.5) * (d - 2)]);
    }
    const face = originFace || roadFace(bx, bz);
    if (shop) {
      awningSpots.push([bx, bz, w, d, face]);
      if (rng() < 0.55) signJobs.push([bx, bz, w, d, face]);
    }
    return mesh;
  }

  function districtOf(cx, cz) {
    if (cx === 0 && cz === 0) return 'square';
    if (cz === 182) return 'beach';
    if (cz === 130 && Math.abs(cx) <= 78) return 'harbour';
    if ((cx === -130 && cz === 130) || (cx === 130 && cz === -130)) return 'park';
    if (cx === -182 && cz === -78) return 'precinct';
    if (cx === 182 && cz === -78) return 'clinic';
    if (cx === 182 && cz === 78) return 'garage';
    if (cz <= -78 && Math.abs(cx) <= 78) return 'tower';
    if ((cx === 0 && Math.abs(cz) === 78) || (Math.abs(cx) === 78 && cz === 0)) return 'market';
    if (Math.abs(cx) >= 130 || cz === 130) return 'home';
    return 'mid';
  }

  const SHOP_NAMES = ['KOPI BAY', 'NOODLE HOUSE', 'TACO SOL', 'FISH & CO', 'BAY BAKERY', 'SURF SHOP', 'GULL CAFE', 'SPICE MARKET', 'JUICE BAR', 'RAMEN YA'];
  const SIGN_STYLES = [
    ['#22242C', '#FFD166'], ['#17434E', '#FFE9A8'], ['#5E2A6E', '#FF5C8A'], ['#123A4A', '#37D6E0'],
  ];
  let shopIndex = 0;

  for (let ix = 0; ix < CELLS.length; ix++) {
    for (let iz = 0; iz < CELLS.length; iz++) {
      const cx = CELLS[ix], cz = CELLS[iz];
      const district = districtOf(cx, cz);
      if (district === 'square' || district === 'beach' || district === 'harbour' || district === 'park') continue;
      if (district === 'precinct') {
        raiseBuilding(cx, cz, 30, 18, 13, '#4A6FA5', false, false);
        signJobs.push([cx, cz, 30, 18, { axis: 'z', dir: 1 }]);
        continue;
      }
      if (district === 'clinic') {
        raiseBuilding(cx, cz, 32, 20, 17, '#EFE7D8', false, false);
        signJobs.push([cx, cz, 32, 20, { axis: 'z', dir: 1 }]);
        continue;
      }
      if (district === 'garage') {
        raiseBuilding(cx, cz, 26, 16, 9, '#C4744E', false, false);
        signJobs.push([cx, cz, 26, 16, { axis: 'z', dir: -1 }]);
        continue;
      }
      const beat = ((ix + iz) % 2 === 0) ? 1.15 : 0.85;
      let lots, wMin, wMax, hMin, hMax, walls, shopChance, pitched;
      if (district === 'tower') {
        lots = rng() < 0.5 ? 1 : 2;
        wMin = 18; wMax = 26; hMin = 26; hMax = 58;
        walls = ['#6B8CA3', '#DDBB8E', '#EFDDB2'];
        shopChance = 0.5; pitched = false;
      } else if (district === 'market') {
        lots = 2 + (rng() < 0.4 ? 1 : 0);
        wMin = 10; wMax = 14; hMin = 10; hMax = 20;
        walls = ['#EFDDB2', '#DDBB8E', '#A95F43', '#C4744E', '#D98A6B'];
        shopChance = 1; pitched = false;
      } else if (district === 'home') {
        lots = 2 + (rng() < 0.4 ? 1 : 0);
        wMin = 10; wMax = 14; hMin = 6; hMax = 11;
        walls = ['#9FB27F', '#EFDDB2', '#EFE7D8', '#C4744E'];
        shopChance = 0; pitched = true;
      } else {
        lots = 2 + (rng() < 0.4 ? 1 : 0);
        wMin = 11; wMax = 15; hMin = 12; hMax = 24;
        walls = ['#EFDDB2', '#DDBB8E', '#A95F43', '#9FB27F', '#6B8CA3'];
        shopChance = 0.6; pitched = false;
      }
      const step = 38 / lots;
      for (let k = 0; k < lots; k++) {
        const w = wMin + rng() * (wMax - wMin);
        const d = wMin + rng() * (wMax - wMin);
        const h = (hMin + rng() * rng() * (hMax - hMin)) * beat;
        const bx = cx - 19 + step * (k + 0.5) + (rng() - 0.5) * 2;
        const bz = cz + (rng() - 0.5) * 10;
        const shop = rng() < shopChance;
        raiseBuilding(bx, bz, Math.min(w, step - 2), d, h, pick(rng, walls), shop, pitched);
      }
    }
  }

  // -- Market ring inside the square block: six shop buildings facing in.
  const ringDefs = [
    [-39, -39, 14, 14, 15, '#DDBB8E'], [39, -39, 14, 14, 13, '#EFDDB2'],
    [-39, 39, 14, 14, 12, '#A95F43'], [39, 39, 14, 14, 16, '#DDBB8E'],
    [0, -41, 20, 10, 18, '#C4744E'], [0, 41, 20, 10, 14, '#EFDDB2'],
  ];
  for (const [bx, bz, w, d, h, wall] of ringDefs) {
    const face = Math.abs(bx) > Math.abs(bz)
      ? { axis: 'x', dir: -Math.sign(bx) }
      : { axis: 'z', dir: -Math.sign(bz) };
    raiseBuilding(bx, bz, w, d, h, wall, true, false, face);
    bannerJobs.push([bx, bz, w, d, face]);
  }

  // -- Roof caps (instanced) and rooftop props (instanced).
  const capMat = new THREE.MeshStandardMaterial({ color: 0x5A5148, roughness: 0.95 });
  const capInst = new THREE.InstancedMesh(unitBox, capMat, flatCaps.length);
  flatCaps.forEach(([x, z, w, d, h], i) => {
    placer.rotation.set(0, 0, 0);
    placer.scale.set(w + 0.7, 0.7, d + 0.7);
    placer.position.set(x, h + 0.35, z);
    placer.updateMatrix();
    capInst.setMatrixAt(i, placer.matrix);
  });
  commitMatrices(capInst);
  city.add(capInst);
  const pyrGeo = new THREE.ConeGeometry(1, 1, 4);
  const pyrMat = new THREE.MeshStandardMaterial({ color: 0x8A4A3A, roughness: 0.9, flatShading: true });
  const pyrInst = new THREE.InstancedMesh(pyrGeo, pyrMat, Math.max(1, pitchedRoofs.length));
  pitchedRoofs.forEach(([x, z, w, d, h], i) => {
    placer.rotation.set(0, Math.PI / 4, 0);
    placer.scale.set((w + 0.6) * 0.72, 2.6, (d + 0.6) * 0.72);
    placer.position.set(x, h + 1.3, z);
    placer.updateMatrix();
    pyrInst.setMatrixAt(i, placer.matrix);
  });
  commitMatrices(pyrInst);
  pyrInst.count = pitchedRoofs.length;
  city.add(pyrInst);
  function fillInstanced(geo, mat, spots, withRot) {
    const inst = new THREE.InstancedMesh(geo, mat, Math.max(1, spots.length));
    spots.forEach((s, i) => {
      placer.rotation.set(0, withRot ? s[3] : 0, 0);
      placer.scale.set(1, 1, 1);
      placer.position.set(s[0], s[1], s[2]);
      placer.updateMatrix();
      inst.setMatrixAt(i, placer.matrix);
    });
    commitMatrices(inst);
    inst.count = spots.length;
    inst.castShadow = true;
    city.add(inst);
    return inst;
  }
  fillInstanced(new THREE.BoxGeometry(1.8, 0.9, 1.4),
    new THREE.MeshStandardMaterial({ color: 0x9A9A92, roughness: 0.9 }), acSpots, true);
  fillInstanced(new THREE.CylinderGeometry(1.2, 1.2, 2.4, 10),
    new THREE.MeshStandardMaterial({ color: 0x8A6A4A, roughness: 0.9 }), tankSpots, false);
  fillInstanced(new THREE.CylinderGeometry(0.06, 0.1, 4, 5),
    new THREE.MeshStandardMaterial({ color: 0x2C2F36, roughness: 0.8 }), antSpots, false);

  // -- Awnings (instanced, striped) and signs (painted boards).
  const awnTexA = paintAwning('#FF8C42', '#FFF2E0');
  const awnTexB = paintAwning('#37D6E0', '#FFF2E0');
  const awnMatA = new THREE.MeshStandardMaterial({ map: awnTexA, roughness: 0.9 });
  const awnMatB = new THREE.MeshStandardMaterial({ map: awnTexB, roughness: 0.9 });
  const awnGeo = new THREE.BoxGeometry(1, 0.14, 1);
  const awnInstA = new THREE.InstancedMesh(awnGeo, awnMatA, awningSpots.length);
  const awnInstB = new THREE.InstancedMesh(awnGeo, awnMatB, awningSpots.length);
  let awnA = 0, awnB = 0;
  awningSpots.forEach(([bx, bz, w, d, face], i) => {
    const [fx, fz] = facePoint(bx, bz, w, d, face, 0.95);
    const useA = i % 2 === 0;
    placer.position.set(fx, 4.35, fz);
    if (face.axis === 'z') {
      placer.scale.set(w * 0.92, 1, 1.9);
      placer.rotation.set(face.dir > 0 ? 0.35 : -0.35, 0, 0);
    } else {
      placer.scale.set(1.9, 1, w * 0.92);
      placer.rotation.set(0, 0, face.dir > 0 ? -0.35 : 0.35);
    }
    placer.updateMatrix();
    if (useA) { awnInstA.setMatrixAt(awnA, placer.matrix); awnA++; }
    else { awnInstB.setMatrixAt(awnB, placer.matrix); awnB++; }
  });
  awnInstA.count = awnA; awnInstB.count = awnB;
  commitMatrices(awnInstA);
  commitMatrices(awnInstB);
  city.add(awnInstA);
  city.add(awnInstB);

  const NAMED_SIGNS = {
    '-182,-78': ['HARBOR PRECINCT', '#1A2A5A', '#FFFFFF'],
    '182,-78': ['BAYVIEW CLINIC', '#EFE7D8', '#2A6A4A'],
    '182,78': ["MARCO'S AUTO", '#C4744E', '#FFFFFF'],
  };
  for (const [bx, bz, w, d, face] of signJobs) {
    const key = bx + ',' + bz;
    let text, bg, fg;
    if (NAMED_SIGNS[key]) {
      [text, bg, fg] = NAMED_SIGNS[key];
    } else {
      text = SHOP_NAMES[shopIndex % SHOP_NAMES.length];
      shopIndex++;
      [bg, fg] = SIGN_STYLES[shopIndex % SIGN_STYLES.length];
    }
    const [fx, fz] = facePoint(bx, bz, w, d, face, 0.18);
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(6.4, 1.6),
      new THREE.MeshBasicMaterial({ map: paintSignboard(text, bg, fg) }),
    );
    board.position.set(fx, 5.6, fz);
    board.rotation.y = face.axis === 'x' ? (face.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (face.dir > 0 ? 0 : Math.PI);
    city.add(board);
  }

  // -- Banners on the square-facing ring buildings.
  const gullTex = paintBannerGull();
  const gullMat = new THREE.MeshStandardMaterial({ map: gullTex, roughness: 0.9, side: THREE.DoubleSide });
  for (const [bx, bz, w, d, face] of bannerJobs) {
    const [fx, fz] = facePoint(bx, bz, w, d, face, 0.22);
    const ban = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 3.0), gullMat);
    ban.position.set(fx, 6.8, fz);
    ban.rotation.y = face.axis === 'x' ? (face.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (face.dir > 0 ? 0 : Math.PI);
    city.add(ban);
  }

  // -- Billboards mounted on the south faces of the three tallest towers
  //    actually raised above (recorded while building, not invented).
  const BILLBOARDS = [
    ['SAIL THE BAY', '#2E5CB0', '#FFFFFF'],
    ['EAT. DRIVE. REPEAT.', '#A83A2C', '#FFFFFF'],
    ['BAY NIGHTS', '#3A2A5E', '#FFE9A8'],
  ];
  while (towerFaces.length < 3) {
    towerFaces.push([tallest.x - 24 + towerFaces.length * 24, tallest.z, 20, 18, tallest.h]);
  }
  towerFaces.slice(0, 3).forEach(([bx, bz, w, d, h], k) => {
    const [text, bg, fg] = BILLBOARDS[k];
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 4.4),
      new THREE.MeshBasicMaterial({ map: paintSignboard(text, bg, fg) }),
    );
    board.position.set(bx, h * 0.72, bz + d / 2 + 0.2);
    city.add(board);
  });

  // -- The fountain: stone basin, still water, a column, an upper bowl
  //    and a spray of droplets that rise and fall in update().
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xB9A98A, roughness: 0.9 });
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 7, 1.0, 20), stoneMat);
  basin.position.set(0, 0.5, -10);
  basin.castShadow = true; basin.receiveShadow = true;
  city.add(basin);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(6.5, 0.28, 8, 28), stoneMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.set(0, 1.0, -10);
  city.add(rim);
  const fountWaterTex = paintRipples();
  const fountWater = new THREE.Mesh(
    new THREE.CircleGeometry(5.7, 24),
    new THREE.MeshStandardMaterial({
      map: fountWaterTex, color: 0x2EA6B6, transparent: true, opacity: 0.95, roughness: 0.15,
    }),
  );
  fountWater.rotation.x = -Math.PI / 2;
  fountWater.position.set(0, 0.88, -10);
  city.add(fountWater);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 2.4, 12), stoneMat);
  column.position.set(0, 2.2, -10);
  column.castShadow = true;
  city.add(column);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 1.9, 0.6, 16), stoneMat);
  bowl.position.set(0, 3.6, -10);
  bowl.castShadow = true;
  city.add(bowl);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.9, 8), stoneMat);
  spout.position.set(0, 4.2, -10);
  city.add(spout);
  solid(-7, -17, 7, -3, 1.2);
  const SPRAY_N = 54;
  const sprayGeo = new THREE.BufferGeometry();
  const sprayPos = new Float32Array(SPRAY_N * 3);
  const spraySeed = [];
  for (let i = 0; i < SPRAY_N; i++) {
    spraySeed.push([(rng() * Math.PI * 2), rng(), 0.8 + rng() * 0.5]);
  }
  sprayGeo.setAttribute('position', new THREE.BufferAttribute(sprayPos, 3));
  const spray = new THREE.Points(sprayGeo, new THREE.PointsMaterial({
    color: 0xDFF4FF, size: 0.5, transparent: true, opacity: 0.85, depthWrite: false,
  }));
  city.add(spray);

  // -- The cobbled footbridge: a deck bent into a shallow arch, with two
  //    parapets bent the same way. The channel walls block wading except
  //    at the bridge gap.
  function bendArch(geo, span, lift) {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i);
      const t = (z + span / 2) / span;
      p.setY(i, p.getY(i) + Math.sin(t * Math.PI) * lift);
    }
    geo.computeVertexNormals();
    return geo;
  }
  const deckGeo = bendArch(new THREE.BoxGeometry(4.6, 0.35, 7.5, 1, 1, 10), 7.5, 1.15);
  const deck = new THREE.Mesh(deckGeo,
    new THREE.MeshStandardMaterial({ map: paintCobbles(rng), roughness: 0.95 }));
  deck.position.set(0, 0.15, 18);
  deck.castShadow = true; deck.receiveShadow = true;
  city.add(deck);
  for (const px of [-2.15, 2.15]) {
    const parGeo = bendArch(new THREE.BoxGeometry(0.3, 0.9, 7.5, 1, 1, 10), 7.5, 1.15);
    const par = new THREE.Mesh(parGeo, stoneMat);
    par.position.set(px, 0.6, 18);
    par.castShadow = true;
    city.add(par);
  }
  solid(-30, 14, -3.4, 20, 0.5);
  solid(3.4, 14, 30, 20, 0.5);

  // -- The market arch over the north entry road.
  const ashlarMat = new THREE.MeshStandardMaterial({ map: paintAshlar(rng), roughness: 0.9 });
  for (const px of [-5, 5]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 7, 1.4), ashlarMat);
    pillar.position.set(px, 3.5, -52);
    pillar.castShadow = true;
    city.add(pillar);
    solid(px - 0.7, -52.7, px + 0.7, -51.3, 7);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(11.6, 1.4, 1.4), ashlarMat);
  beam.position.set(0, 7.2, -52);
  beam.castShadow = true;
  city.add(beam);
  const cloth = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 3.2),
    new THREE.MeshStandardMaterial({ map: paintArchCloth(), roughness: 0.9, side: THREE.DoubleSide }),
  );
  cloth.position.set(0, 5.0, -52);
  city.add(cloth);

  // -- Food stalls: timber counter, striped awning, four poles, a board.
  const stallDefs = [
    [-24, 6, '#FF8C42', 'KOPI BAY'], [24, 6, '#37D6E0', 'TACO SOL'],
    [-24, -24, '#FF5C8A', 'NOODLE HOUSE'], [24, -24, '#3AA655', 'JUICE BAR'],
    [140, 198, '#FF8C42', 'GULL BITES'],
  ];
  const timberMat = new THREE.MeshStandardMaterial({ color: 0x8A6A45, roughness: 0.95 });
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2C2F36, roughness: 0.8 });
  const stallPoleSpots = [];
  for (const [sx, sz, awnCol, name] of stallDefs) {
    const counter = new THREE.Mesh(unitBox, timberMat);
    counter.scale.set(4.2, 1.05, 1.7);
    counter.position.set(sx, 0.55, sz);
    counter.castShadow = true;
    city.add(counter);
    const awn = new THREE.Mesh(unitBox,
      new THREE.MeshStandardMaterial({ map: paintAwning(awnCol, '#FFF2E0'), roughness: 0.9 }));
    awn.scale.set(4.6, 0.18, 2.4);
    awn.position.set(sx, 2.6, sz);
    awn.rotation.x = 0.18;
    awn.castShadow = true;
    city.add(awn);
    for (const [ox, oz] of [[-2.1, -1], [2.1, -1], [-2.1, 1], [2.1, 1]]) {
      stallPoleSpots.push([sx + ox, 1.3, sz + oz]);
    }
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(5, 1.25),
      new THREE.MeshBasicMaterial({ map: paintSignboard(name, '#222222', '#FFD166') }),
    );
    board.position.set(sx, 3.35, sz + 0.2);
    city.add(board);
    solid(sx - 2, sz - 0.8, sx + 2, sz + 0.8, 1.1);
  }
  const stallPoleInst = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.06, 0.06, 2.6, 5), poleMat, stallPoleSpots.length);
  stallPoleSpots.forEach(([x, y, z], i) => {
    placer.rotation.set(0, 0, 0);
    placer.scale.set(1, 1, 1);
    placer.position.set(x, y, z);
    placer.updateMatrix();
    stallPoleInst.setMatrixAt(i, placer.matrix);
  });
  commitMatrices(stallPoleInst);
  city.add(stallPoleInst);

  // -- Bollards around the square paving, planters at its corners.
  const postSpots = [];
  for (const off of [-20, 0, 20]) {
    postSpots.push([-30, off], [30, off], [off, -30], [off, 30]);
  }
  const postInst = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.2, 0.24, 0.85, 8),
    new THREE.MeshStandardMaterial({ color: 0x2C2F36, roughness: 0.8 }), postSpots.length);
  const postCapInst = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.21, 0.21, 0.1, 8),
    new THREE.MeshBasicMaterial({ color: 0xFF8C42 }), postSpots.length);
  postSpots.forEach(([x, z], i) => {
    placer.rotation.set(0, 0, 0);
    placer.scale.set(1, 1, 1);
    placer.position.set(x, 0.45, z);
    placer.updateMatrix();
    postInst.setMatrixAt(i, placer.matrix);
    placer.position.set(x, 0.92, z);
    placer.updateMatrix();
    postCapInst.setMatrixAt(i, placer.matrix);
    solid(x - 0.3, z - 0.3, x + 0.3, z + 0.3, 0.9);
  });
  commitMatrices(postInst);
  commitMatrices(postCapInst);
  city.add(postInst);
  city.add(postCapInst);
  const troughSpots = [];
  for (const [px, pz] of [[-24, -24], [24, -24], [-24, 24], [24, 24]]) {
    troughSpots.push([px, pz, 0]);
    troughSpots.push([px, pz, Math.PI / 2]);
  }
  const troughInst = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1.2, 0.9, 2.4), timberMat, troughSpots.length);
  const troughTopInst = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.75, 0),
    new THREE.MeshStandardMaterial({ color: 0x4C8A3E, roughness: 1 }), troughSpots.length);
  troughSpots.forEach(([x, z, rot], i) => {
    placer.rotation.set(0, rot, 0);
    placer.scale.set(1, 1, 1);
    placer.position.set(x, 0.45, z);
    placer.updateMatrix();
    troughInst.setMatrixAt(i, placer.matrix);
    placer.position.set(x, 1.15, z);
    placer.updateMatrix();
    troughTopInst.setMatrixAt(i, placer.matrix);
    solid(x - 0.7, z - 0.7, x + 0.7, z + 0.7, 0.9);
  });
  commitMatrices(troughInst);
  commitMatrices(troughTopInst);
  city.add(troughInst);
  city.add(troughTopInst);

  // -- Flower beds flanking the spawn, benches, banner poles.
  const soilMat = new THREE.MeshStandardMaterial({ color: 0x4A3220, roughness: 1 });
  for (const bx of [-16, 16]) {
    const soil = new THREE.Mesh(unitBox, soilMat);
    soil.scale.set(6, 0.3, 3);
    soil.position.set(bx, 0.15, 24);
    city.add(soil);
  }
  const benchSpots = [[10, 2], [-12, -2], [6, -20], [-10, 24], [-138, 122], [138, -138]];
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x6A4A2A, roughness: 0.9 });
  const benchInst = new THREE.InstancedMesh(unitBox, benchMat, benchSpots.length);
  const benchLegInst = new THREE.InstancedMesh(unitBox, poleMat, benchSpots.length * 2);
  benchSpots.forEach(([x, z], i) => {
    placer.rotation.set(0, 0, 0);
    placer.scale.set(2.4, 0.18, 0.7);
    placer.position.set(x, 0.5, z);
    placer.updateMatrix();
    benchInst.setMatrixAt(i, placer.matrix);
    for (let k = 0; k < 2; k++) {
      placer.scale.set(0.12, 0.5, 0.6);
      placer.position.set(x + (k === 0 ? -1 : 1), 0.25, z);
      placer.updateMatrix();
      benchLegInst.setMatrixAt(i * 2 + k, placer.matrix);
    }
  });
  commitMatrices(benchInst);
  commitMatrices(benchLegInst);
  city.add(benchInst);
  city.add(benchLegInst);
  for (const [px, pz] of [[-28, -28], [28, -28], [-28, 28], [28, 28]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5, 6), poleMat);
    pole.position.set(px, 2.5, pz);
    city.add(pole);
    const ban = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.4), gullMat);
    ban.position.set(px, 3.6, pz);
    ban.rotation.y = Math.atan2(-px, -pz);
    city.add(ban);
    solid(px - 0.2, pz - 0.2, px + 0.2, pz + 0.2, 5);
  }

  // -- Harbour: painted boxes, a portal crane, a timber pier, crates,
  //    barrels, pallets and a fence with a gap at the entrance.
  const boxDefs = [
    ['#A83A2C', 'AZURE FREIGHT', 'AZFU 731 208 4', -60, 148, false, 0],
    ['#2E5CB0', 'GULL LINE', 'GLIU 904 117 9', -46, 148, false, 0],
    ['#3A9E5C', 'CORAL CARGO', 'CCCU 552 390 1', -32, 148, false, 0.05],
    ['#A83A2C', 'GULL LINE', 'GLIU 904 118 3', -18, 148, false, 0],
    ['#2E5CB0', 'AZURE FREIGHT', 'AZFU 731 209 8', -4, 148, false, 0],
    ['#3A9E5C', 'CORAL CARGO', 'CCCU 552 391 6', 10, 148, false, -0.04],
    ['#2E5CB0', 'CORAL CARGO', 'CCCU 552 392 0', 24, 148, false, 0],
    ['#A83A2C', 'AZURE FREIGHT', 'AZFU 731 210 2', 38, 148, false, 0],
    ['#3A9E5C', 'AZURE FREIGHT', 'AZFU 731 211 5', -46, 147, true, 0],
    ['#A83A2C', 'GULL LINE', 'GLIU 904 119 7', 10, 149, true, 0.06],
    ['#2E5CB0', 'GULL LINE', 'GLIU 904 120 1', 24, 148, true, 0],
  ];
  for (const [col, brand, code, cx, cz, stacked, rotY] of boxDefs) {
    const box = new THREE.Mesh(unitBox, new THREE.MeshStandardMaterial({
      map: paintBoxFace(rng, col, brand, code), roughness: 0.8, metalness: 0.15,
    }));
    box.scale.set(6, 2.6, 2.6);
    box.position.set(cx, 1.3 + (stacked ? 2.6 : 0), cz);
    box.rotation.y = rotY;
    box.castShadow = true; box.receiveShadow = true;
    city.add(box);
    if (!stacked) solid(cx - 3, cz - 1.3, cx + 3, cz + 1.3, 5.2);
  }
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x3A3F46, roughness: 0.7, metalness: 0.5 });
  const hazardMat = new THREE.MeshStandardMaterial({ color: 0xE8C832, roughness: 0.6, metalness: 0.2 });
  for (const [lx, lz] of [[-70, 140], [-58, 140], [-70, 156], [-58, 156]]) {
    const leg = new THREE.Mesh(unitBox, steelMat);
    leg.scale.set(0.9, 15, 0.9);
    leg.position.set(lx, 7.5, lz);
    leg.castShadow = true;
    city.add(leg);
    solid(lx - 0.6, lz - 0.6, lx + 0.6, lz + 0.6, 15);
  }
  const craneTop = new THREE.Mesh(unitBox, steelMat);
  craneTop.scale.set(14, 1, 18);
  craneTop.position.set(-64, 15, 148);
  craneTop.castShadow = true;
  city.add(craneTop);
  const jib = new THREE.Mesh(unitBox, hazardMat);
  jib.scale.set(16, 0.8, 0.8);
  jib.position.set(-48, 14.6, 148);
  jib.castShadow = true;
  city.add(jib);
  const hoistLine = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 5.5, 5),
    new THREE.MeshStandardMaterial({ color: 0x1E1E1E, roughness: 0.85 }));
  hoistLine.position.set(-42, 11.6, 148);
  city.add(hoistLine);
  const hook = new THREE.Mesh(unitBox, hazardMat);
  hook.scale.set(1, 1, 0.6);
  hook.position.set(-42, 8.4, 148);
  hook.castShadow = true;
  city.add(hook);
  const weight = new THREE.Mesh(unitBox, steelMat);
  weight.scale.set(2.5, 3, 1.5);
  weight.position.set(-70, 13.5, 148);
  city.add(weight);
  const pier = new THREE.Mesh(unitBox, timberMat);
  pier.scale.set(36, 1, 16);
  pier.position.set(0, 0.5, 200);
  pier.receiveShadow = true;
  city.add(pier);
  const pierBollardSpots = [];
  for (const bx of [-15, 0, 15]) {
    pierBollardSpots.push([bx, 193], [bx, 207]);
  }
  const pierBollardInst = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.2, 0.24, 0.85, 8), hazardMat, pierBollardSpots.length);
  pierBollardSpots.forEach(([x, z], i) => {
    placer.rotation.set(0, 0, 0);
    placer.scale.set(1, 1, 1);
    placer.position.set(x, 1.45, z);
    placer.updateMatrix();
    pierBollardInst.setMatrixAt(i, placer.matrix);
  });
  commitMatrices(pierBollardInst);
  city.add(pierBollardInst);
  const crateMat = new THREE.MeshStandardMaterial({ map: paintCrateFace(rng), roughness: 0.9 });
  const crateSpots = [];
  for (let k = 0; k < 4; k++) crateSpots.push([-24 + k * 3, 192 + (k % 2) * 3, 2.6 + rng() * 1.2]);
  for (let k = 0; k < 4; k++) crateSpots.push([16 + k * 3, 192 + (k % 2) * 3, 2.6 + rng() * 1.2]);
  // Foreground crates for the mission-5 docks fight (x +/-16-20, z 116-120):
  // off the player/Viper approach lines, so they fill the frame without
  // blocking anyone. (The yard in front of the containers read as empty.)
  crateSpots.push([-16, 116, 2.8], [-13, 118, 2.2], [18, 118, 2.8], [20, 120, 2.0]);
  const crateInst = new THREE.InstancedMesh(unitBox, crateMat, crateSpots.length);
  crateSpots.forEach(([x, z, s], i) => {
    placer.rotation.set(0, rng() * 0.4, 0);
    placer.scale.set(s, s, s);
    placer.position.set(x, s / 2, z);
    placer.updateMatrix();
    crateInst.setMatrixAt(i, placer.matrix);
    solid(x - s / 2, z - s / 2, x + s / 2, z + s / 2, s);
  });
  commitMatrices(crateInst);
  crateInst.castShadow = true;
  city.add(crateInst);
  const barrelTints = [new THREE.Color(0x8A3A2A), new THREE.Color(0x2A4A7A), new THREE.Color(0xC8A020)];
  const barrelSpots = [];
  for (const [bx, bz] of [[-30, 168], [30, 168], [-12, 126], [14, 132]]) {
    for (let k = 0; k < 4; k++) {
      barrelSpots.push([bx + (k % 2) * 1.1 - 0.5, bz + Math.floor(k / 2) * 1.1 - 0.5]);
    }
  }
  const barrelInst = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.42, 0.42, 1.05, 10),
    new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.75, metalness: 0.3 }),
    barrelSpots.length);
  barrelSpots.forEach(([x, z], i) => {
    placer.rotation.set(0, 0, 0);
    placer.scale.set(1, 1, 1);
    placer.position.set(x, 0.55, z);
    placer.updateMatrix();
    barrelInst.setMatrixAt(i, placer.matrix);
    barrelInst.setColorAt(i, barrelTints[i % 3]);
  });
  commitMatrices(barrelInst);
  commitColours(barrelInst);
  barrelInst.castShadow = true;
  city.add(barrelInst);
  const palletInst = new THREE.InstancedMesh(unitBox,
    new THREE.MeshStandardMaterial({ color: 0x8A6B45, roughness: 0.95 }), 6);
  let palletI = 0;
  for (const [px, pz] of [[-40, 164], [36, 164]]) {
    for (let k = 0; k < 3; k++) {
      placer.rotation.set(0, k * 0.2, 0);
      placer.scale.set(1.6, 0.15, 1.2);
      placer.position.set(px, 0.08 + k * 0.16, pz);
      placer.updateMatrix();
      palletInst.setMatrixAt(palletI, placer.matrix);
      palletI++;
    }
  }
  commitMatrices(palletInst);
  palletInst.count = palletI;
  city.add(palletInst);
  const fenceMat = new THREE.MeshStandardMaterial({ color: 0x4A4A52, roughness: 0.8, metalness: 0.4 });
  const fencePostSpots = [];
  for (const [fx0, fx1] of [[-85, -20], [20, 85]]) {
    for (let x = fx0; x <= fx1; x += 6) fencePostSpots.push(x);
  }
  const fencePostInst = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.09, 0.09, 2.2, 6), fenceMat, fencePostSpots.length);
  fencePostSpots.forEach((x, i) => {
    placer.rotation.set(0, 0, 0);
    placer.scale.set(1, 1, 1);
    placer.position.set(x, 1.1, 104);
    placer.updateMatrix();
    fencePostInst.setMatrixAt(i, placer.matrix);
  });
  commitMatrices(fencePostInst);
  city.add(fencePostInst);
  for (const [fx0, fx1] of [[-85, -20], [20, 85]]) {
    for (const railY of [0.65, 1.85]) {
      const rail = new THREE.Mesh(unitBox, fenceMat);
      rail.scale.set(fx1 - fx0, 0.12, 0.12);
      rail.position.set((fx0 + fx1) / 2, railY, 104);
      city.add(rail);
    }
    solid(fx0, 103.7, fx1, 104.3, 2.2);
  }
  for (const px of [-2.8, 2.8]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 4.6, 6), fenceMat);
    post.position.set(px, 2.3, 104);
    city.add(post);
  }
  const dockBoard = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 1.5),
    new THREE.MeshBasicMaterial({ map: paintSignboard('DOCK 7', '#2A4A5A', '#FFD166') }),
  );
  dockBoard.position.set(0, 4.6, 104);
  dockBoard.rotation.y = Math.PI;
  city.add(dockBoard);

  // -- Beach: the bar hut, umbrellas, boulders, scree.
  const hut = new THREE.Mesh(unitBox,
    new THREE.MeshStandardMaterial({ color: 0xE8B04A, roughness: 0.9 }));
  hut.scale.set(12, 5, 8);
  hut.position.set(-150, 2.5, 196);
  hut.castShadow = true;
  city.add(hut);
  const hutRoof = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 4), pyrMat);
  hutRoof.scale.set(9.5, 2.4, 6.5);
  hutRoof.rotation.y = Math.PI / 4;
  hutRoof.position.set(-150, 6.2, 196);
  hutRoof.castShadow = true;
  city.add(hutRoof);
  const hutBoard = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 1.5),
    new THREE.MeshBasicMaterial({ map: paintSignboard('GULL BAR', '#2E8BB0', '#FFFFFF') }),
  );
  hutBoard.position.set(-150, 4.2, 191.8);
  hutBoard.rotation.y = Math.PI;
  city.add(hutBoard);
  solid(-156, 192, -144, 200, 5);
  const umbSpots = [];
  for (const ux of [-185, -120, -80, -40, 45, 85, 125, 185]) {
    umbSpots.push([ux, 198 + rng() * 6]);
  }
  const umbCols = [new THREE.Color(0xE85D5D), new THREE.Color(0x2E8BB0), new THREE.Color(0xE8C832)];
  const umbInst = new THREE.InstancedMesh(
    new THREE.ConeGeometry(3, 1.6, 8),
    new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.9 }), umbSpots.length);
  const umbPoleInst = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.12, 0.12, 2.6, 6), timberMat, umbSpots.length);
  umbSpots.forEach(([x, z], i) => {
    placer.rotation.set(0, 0, 0);
    placer.scale.set(1, 1, 1);
    placer.position.set(x, 2.6, z);
    placer.updateMatrix();
    umbInst.setMatrixAt(i, placer.matrix);
    umbInst.setColorAt(i, umbCols[i % 3]);
    placer.position.set(x, 1.3, z);
    placer.updateMatrix();
    umbPoleInst.setMatrixAt(i, placer.matrix);
  });
  commitMatrices(umbInst);
  commitColours(umbInst);
  commitMatrices(umbPoleInst);
  city.add(umbInst);
  city.add(umbPoleInst);

  // -- Boulders and pebbles along the sand.
  const boulderGeoA = roughenStone(new THREE.IcosahedronGeometry(1, 1), 11, 0.16);
  const boulderGeoB = roughenStone(new THREE.IcosahedronGeometry(1, 1), 47, 0.2);
  const boulderMatA = new THREE.MeshStandardMaterial({ color: 0xC9B083, roughness: 0.95, flatShading: true });
  const boulderMatB = new THREE.MeshStandardMaterial({ color: 0x7D7A72, roughness: 0.95, flatShading: true });
  const boulderSpots = [];
  for (let k = 0; k < 6; k++) boulderSpots.push([-258 + rng() * 20, 196 + rng() * 14, 2.2 + rng() * 1.8]);
  for (let k = 0; k < 6; k++) boulderSpots.push([238 + rng() * 20, 196 + rng() * 14, 2.2 + rng() * 1.8]);
  for (let k = 0; k < 10; k++) {
    const flank = rng() < 0.5 ? -1 : 1;
    boulderSpots.push([flank * (120 + rng() * 110), 192 + rng() * 14, 0.8 + rng() * 0.8]);
  }
  const boulderSetA = boulderSpots.filter((s, i) => i % 2 === 0);
  const boulderSetB = boulderSpots.filter((s, i) => i % 2 === 1);
  function placeBoulders(inst, spots) {
    spots.forEach(([bx, bz, size], i) => {
      placer.rotation.set((rng() - 0.5) * 0.3, rng() * Math.PI * 2, (rng() - 0.5) * 0.3);
      placer.scale.set(size * (0.9 + rng() * 0.5), size * (0.55 + rng() * 0.25), size * (0.9 + rng() * 0.5));
      placer.position.set(bx, size * 0.32, bz);
      placer.updateMatrix();
      inst.setMatrixAt(i, placer.matrix);
      if (size > 2) solid(bx - size * 1.2, bz - size * 1.2, bx + size * 1.2, bz + size * 1.2, size);
    });
    commitMatrices(inst);
  }
  const boulderMeshA = new THREE.InstancedMesh(boulderGeoA, boulderMatA, boulderSetA.length);
  const boulderMeshB = new THREE.InstancedMesh(boulderGeoB, boulderMatB, boulderSetB.length);
  boulderMeshA.castShadow = true; boulderMeshA.receiveShadow = true;
  boulderMeshB.castShadow = true; boulderMeshB.receiveShadow = true;
  placeBoulders(boulderMeshA, boulderSetA);
  placeBoulders(boulderMeshB, boulderSetB);
  city.add(boulderMeshA);
  city.add(boulderMeshB);
  const cragGeo = roughenStone(new THREE.IcosahedronGeometry(1, 2), 99, 0.18);
  const cragMat = new THREE.MeshStandardMaterial({ color: 0x9A7A58, roughness: 0.95, flatShading: true });
  for (const [ox, oz, size] of [[-266, 206, 5.2], [264, 205, 4.4]]) {
    const crag = new THREE.Mesh(cragGeo, cragMat);
    crag.scale.set(size, size * 0.5, size * 0.85);
    crag.rotation.y = rng() * Math.PI * 2;
    crag.position.set(ox, size * 0.15, oz);
    crag.castShadow = true;
    crag.receiveShadow = true;
    city.add(crag);
    solid(ox - size, oz - size * 0.85, ox + size, oz + size * 0.85, size * 0.5);
  }
  const pebbleInst = new THREE.InstancedMesh(
    roughenStone(new THREE.IcosahedronGeometry(1, 0), 3, 0.22), boulderMatB, 120);
  for (let i = 0; i < 120; i++) {
    placer.rotation.set(0, rng() * Math.PI * 2, 0);
    placer.scale.setScalar(0.15 + rng() * 0.35);
    placer.position.set(-260 + rng() * 520, 0.05, 206 + rng() * 5);
    placer.updateMatrix();
    pebbleInst.setMatrixAt(i, placer.matrix);
  }
  commitMatrices(pebbleInst);
  city.add(pebbleInst);

  // -- Vegetation. Palms line the avenues and the beachfront, broadleaf
  //    trees fill the parks and gardens, and tufts, flowers and bushes
  //    fill the gaps. Every repeat is one InstancedMesh.
  const palmSpots = [];
  for (const v of [-156, -104, -52, 52, 104, 156]) {
    for (let k = 0; k < 8; k++) {
      const a = -168 + k * 48;
      const off = widthOf(v) / 2 + 2.5;
      const side = k % 2 === 0 ? 1 : -1;
      palmSpots.push([v + off * side, a]);
      palmSpots.push([a, v + off * side]);
    }
  }
  for (let x = -200; x <= 200; x += 26) {
    if (Math.abs(x) >= 30) palmSpots.push([x, 180]);
  }
  palmSpots.push([34, 12], [-34, 12], [34, -12], [-34, -12]);
  function inSquareBlock(x, z) { return Math.abs(x) < 56 && Math.abs(z) < 56; }
  function inHarbourYard(x, z) { return Math.abs(x) < 86 && z > 100 && z < 160; }
  function inPark(x, z) {
    return (Math.abs(x + 130) < 26 && Math.abs(z - 130) < 26)
      || (Math.abs(x - 130) < 26 && Math.abs(z + 130) < 26);
  }
  const palmSites = palmSpots.filter(([x, z]) =>
    !inSquareBlock(x, z) && !inHarbourYard(x, z) && !inPark(x, z) && z <= 182 && Math.abs(x) <= 215);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7A5A38, roughness: 1 });
  const palmMat = new THREE.MeshStandardMaterial({
    color: 0x2F8F46, roughness: 0.9, side: THREE.DoubleSide,
  });
  const trunkInst = new THREE.InstancedMesh(palmTrunkGeo(), trunkMat, palmSites.length);
  const crownInst = new THREE.InstancedMesh(palmCrownGeo(), palmMat, palmSites.length);
  trunkInst.castShadow = true;
  palmSites.forEach(([x, z], i) => {
    placer.rotation.set((rng() - 0.5) * 0.06, rng() * Math.PI * 2, (rng() - 0.5) * 0.06);
    placer.scale.setScalar(0.85 + rng() * 0.35);
    placer.position.set(x, 0, z);
    placer.updateMatrix();
    trunkInst.setMatrixAt(i, placer.matrix);
    crownInst.setMatrixAt(i, placer.matrix);
    solid(x - 0.5, z - 0.5, x + 0.5, z + 0.5, 6);
  });
  commitMatrices(trunkInst);
  commitMatrices(crownInst);
  city.add(trunkInst);
  city.add(crownInst);

  const leafSpots = [];
  for (const [px, pz] of [[-130, 130], [130, -130]]) {
    for (let k = 0; k < 5; k++) leafSpots.push([px + (rng() - 0.5) * 36, pz + (rng() - 0.5) * 36]);
  }
  for (const cx of CELLS) {
    for (const cz of CELLS) {
      if (districtOf(cx, cz) !== 'home') continue;
      for (let k = 0; k < 2; k++) leafSpots.push([cx + (rng() - 0.5) * 32, cz + (rng() - 0.5) * 32]);
    }
  }
  const leafTrunkInst = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.3, 0.45, 4, 6), trunkMat, leafSpots.length);
  const leafCrownInst = new THREE.InstancedMesh(
    leafyCrownGeo(),
    new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 1 }), leafSpots.length);
  leafCrownInst.castShadow = true;
  const leafGreens = [new THREE.Color(0x3E7A34), new THREE.Color(0x4C8A3E), new THREE.Color(0x6FBE4E)];
  leafSpots.forEach(([x, z], i) => {
    placer.rotation.set(0, rng() * Math.PI * 2, 0);
    placer.scale.setScalar(0.85 + rng() * 0.4);
    placer.position.set(x, 2, z);
    placer.updateMatrix();
    leafTrunkInst.setMatrixAt(i, placer.matrix);
    placer.position.set(x, 5.2, z);
    placer.scale.set(0.85 + rng() * 0.4, 0.7 + rng() * 0.25, 0.85 + rng() * 0.4);
    placer.updateMatrix();
    leafCrownInst.setMatrixAt(i, placer.matrix);
    leafCrownInst.setColorAt(i, leafGreens[Math.floor(rng() * leafGreens.length)]);
  });
  commitMatrices(leafTrunkInst);
  commitMatrices(leafCrownInst);
  commitColours(leafCrownInst);
  city.add(leafTrunkInst);
  city.add(leafCrownInst);

  const tuftGeo = new THREE.ConeGeometry(0.45, 1.1, 5);
  tuftGeo.translate(0, 0.55, 0);
  const tuftSpots = [];
  for (const [px, pz] of [[-130, 130], [130, -130]]) {
    for (let k = 0; k < 90; k++) tuftSpots.push([px + (rng() - 0.5) * 40, pz + (rng() - 0.5) * 40, 0]);
  }
  for (let k = 0; k < 120; k++) tuftSpots.push([-260 + rng() * 520, 186 + rng() * 6, 1]);
  for (const cx of CELLS) {
    for (const cz of CELLS) {
      if (districtOf(cx, cz) !== 'home') continue;
      for (let k = 0; k < 8; k++) tuftSpots.push([cx + (rng() - 0.5) * 36, cz + (rng() - 0.5) * 36, 0]);
    }
  }
  const tuftInst = new THREE.InstancedMesh(tuftGeo,
    new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 1 }), tuftSpots.length);
  const tuftGreens = [new THREE.Color(0x4A8A3F), new THREE.Color(0x67A844), new THREE.Color(0x7FB84A)];
  const tuftDry = new THREE.Color(0xC9B458);
  tuftSpots.forEach(([x, z, dry], i) => {
    placer.rotation.set(0, rng() * Math.PI * 2, 0);
    placer.scale.set(0.7 + rng() * 0.9, 0.7 + rng() * 0.8, 0.7 + rng() * 0.9);
    placer.position.set(x, 0, z);
    placer.updateMatrix();
    tuftInst.setMatrixAt(i, placer.matrix);
    tuftInst.setColorAt(i, dry ? tuftDry : tuftGreens[Math.floor(rng() * tuftGreens.length)]);
  });
  commitMatrices(tuftInst);
  commitColours(tuftInst);
  city.add(tuftInst);

  const bloomSpots = [];
  for (const [bx, bz] of [[-16, 24], [16, 24]]) {
    for (let k = 0; k < 30; k++) bloomSpots.push([bx + (rng() - 0.5) * 5.4, bz + (rng() - 0.5) * 2.4]);
  }
  for (const [px, pz] of [[-130, 130], [130, -130]]) {
    for (let k = 0; k < 30; k++) bloomSpots.push([px + (rng() - 0.5) * 36, pz + (rng() - 0.5) * 36]);
  }
  const bloomInst = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.2, 0),
    new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.8 }), bloomSpots.length);
  const bloomHues = [new THREE.Color(0xFF6FA5), new THREE.Color(0xFF8C42),
    new THREE.Color(0xFFD166), new THREE.Color(0xFFF2E0)];
  bloomSpots.forEach(([x, z], i) => {
    placer.rotation.set(0, 0, 0);
    placer.scale.setScalar(0.8 + rng() * 0.5);
    placer.position.set(x, 0.45, z);
    placer.updateMatrix();
    bloomInst.setMatrixAt(i, placer.matrix);
    bloomInst.setColorAt(i, bloomHues[Math.floor(rng() * bloomHues.length)]);
  });
  commitMatrices(bloomInst);
  commitColours(bloomInst);
  city.add(bloomInst);

  const shrubSpots = [];
  for (const [px, pz] of [[-130, 130], [130, -130]]) {
    for (let k = 0; k < 10; k++) shrubSpots.push([px + (rng() - 0.5) * 40, pz + (rng() - 0.5) * 40]);
  }
  for (const [bx, bz] of [[-26, -26], [26, -26], [-26, 26], [26, 26]]) {
    shrubSpots.push([bx, bz]);
    shrubSpots.push([bx + 1.5, bz + 1]);
  }
  for (let k = 0; k < 6; k++) shrubSpots.push([-160 + rng() * 24, 200 + rng() * 6]);
  for (const cx of CELLS) {
    for (const cz of CELLS) {
      if (districtOf(cx, cz) !== 'home') continue;
      for (let k = 0; k < 2; k++) shrubSpots.push([cx + (rng() - 0.5) * 34, cz + (rng() - 0.5) * 34]);
    }
  }
  const shrubInst = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1.05, 0),
    new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 1 }), shrubSpots.length);
  const shrubHues = [new THREE.Color(0x3A7A34), new THREE.Color(0x4C8A3E)];
  shrubSpots.forEach(([x, z], i) => {
    placer.rotation.set(0, rng() * Math.PI * 2, 0);
    placer.scale.set(0.8 + rng() * 0.7, 0.55 + rng() * 0.3, 0.8 + rng() * 0.7);
    placer.position.set(x, 0.35, z);
    placer.updateMatrix();
    shrubInst.setMatrixAt(i, placer.matrix);
    shrubInst.setColorAt(i, shrubHues[Math.floor(rng() * shrubHues.length)]);
  });
  commitMatrices(shrubInst);
  commitColours(shrubInst);
  city.add(shrubInst);

  // -- Street lamps, hydrants, bins, traffic lights.
  const lampSpots = [];
  let lampFlip = 0;
  for (const v of ROADS) {
    if (v === 208) continue;
    for (let a = -182; a <= 182; a += 52) {
      const off = widthOf(v) / 2 + 1.5;
      const side = lampFlip % 2 === 0 ? 1 : -1;
      lampFlip++;
      lampSpots.push([v + off * side, a]);
      lampSpots.push([a, v + off * side]);
    }
  }
  const lampSpotsF = lampSpots.filter(([x, z]) =>
    !inSquareBlock(x, z) && !inHarbourYard(x, z) && !inPark(x, z) && z <= 176 && Math.abs(x) <= 215);
  const lampPoleInst = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.12, 0.16, 6.5, 6), poleMat, lampSpotsF.length);
  const lampBulbInst = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.35, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xFFF2B0 }), lampSpotsF.length);
  lampSpotsF.forEach(([x, z], i) => {
    placer.rotation.set(0, 0, 0);
    placer.scale.set(1, 1, 1);
    placer.position.set(x, 3.25, z);
    placer.updateMatrix();
    lampPoleInst.setMatrixAt(i, placer.matrix);
    placer.position.set(x, 6.6, z);
    placer.updateMatrix();
    lampBulbInst.setMatrixAt(i, placer.matrix);
    solid(x - 0.3, z - 0.3, x + 0.3, z + 0.3, 6.5);
  });
  commitMatrices(lampPoleInst);
  commitMatrices(lampBulbInst);
  city.add(lampPoleInst);
  city.add(lampBulbInst);

  const hydrantSpots = [];
  const binSpots = [];
  for (let k = 0; k < 28; k++) {
    const v = pick(rng, ROADS.filter((r) => r !== 208));
    const a = -200 + rng() * 400;
    const off = widthOf(v) / 2 + 1.5;
    const side = rng() < 0.5 ? 1 : -1;
    const [x, z] = rng() < 0.5 ? [v + off * side, a] : [a, v + off * side];
    if (inSquareBlock(x, z) || inHarbourYard(x, z) || z > 176) continue;
    if (k % 2 === 0) hydrantSpots.push([x, z]); else binSpots.push([x, z]);
  }
  const hydrantInst = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.28, 0.34, 0.9, 8),
    new THREE.MeshStandardMaterial({ color: 0xD53A3A, roughness: 0.7 }),
    Math.max(1, hydrantSpots.length));
  hydrantSpots.forEach(([x, z], i) => {
    placer.rotation.set(0, 0, 0);
    placer.scale.set(1, 1, 1);
    placer.position.set(x, 0.45, z);
    placer.updateMatrix();
    hydrantInst.setMatrixAt(i, placer.matrix);
  });
  hydrantInst.count = hydrantSpots.length;
  commitMatrices(hydrantInst);
  city.add(hydrantInst);
  const binInst = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.4, 0.36, 0.9, 8),
    new THREE.MeshStandardMaterial({ color: 0x2E5D3A, roughness: 0.8 }),
    Math.max(1, binSpots.length));
  binSpots.forEach(([x, z], i) => {
    placer.rotation.set(0, 0, 0);
    placer.scale.set(1, 1, 1);
    placer.position.set(x, 0.45, z);
    placer.updateMatrix();
    binInst.setMatrixAt(i, placer.matrix);
  });
  binInst.count = binSpots.length;
  commitMatrices(binInst);
  city.add(binInst);

  const tlCorners = [[52, 104], [-52, -104], [104, -52], [-104, 52]];
  const tlPoleInst = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.12, 0.14, 5.5, 6), poleMat, tlCorners.length);
  const tlHeadInst = new THREE.InstancedMesh(unitBox, poleMat, tlCorners.length);
  const tlLampInst = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.16, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xFFFFFF }), tlCorners.length);
  const tlCols = [new THREE.Color(0x2ECC40), new THREE.Color(0xCC2222)];
  tlCorners.forEach(([ix, iz], i) => {
    placer.rotation.set(0, 0, 0);
    placer.scale.set(1, 1, 1);
    placer.position.set(ix + 9, 2.75, iz + 9);
    placer.updateMatrix();
    tlPoleInst.setMatrixAt(i, placer.matrix);
    placer.scale.set(0.5, 1.2, 0.4);
    placer.position.set(ix + 9, 5.4, iz + 9);
    placer.updateMatrix();
    tlHeadInst.setMatrixAt(i, placer.matrix);
    placer.scale.set(1, 1, 1);
    placer.position.set(ix + 9, 5.7, iz + 9.22);
    placer.updateMatrix();
    tlLampInst.setMatrixAt(i, placer.matrix);
    tlLampInst.setColorAt(i, tlCols[i % 2]);
  });
  commitMatrices(tlPoleInst);
  commitMatrices(tlHeadInst);
  commitMatrices(tlLampInst);
  commitColours(tlLampInst);
  city.add(tlPoleInst);
  city.add(tlHeadInst);
  city.add(tlLampInst);

  // -- Parked-car spots along the two wide avenues, and the landmarks.
  const carSpots = [];
  for (const z of [-120, -60, 0, 60, 120]) {
    carSpots.push(new THREE.Vector3(-150.5, 0, z));
    carSpots.push(new THREE.Vector3(150.5, 0, z));
  }
  for (const x of [-60, 0, 60]) carSpots.push(new THREE.Vector3(x, 0, 150.5));
  carSpots.push(new THREE.Vector3(-60, 0, -150.5));

  scene.add(city);

  // -- Animation: the sea, the foam line, the drifting clouds, the
  //    channel and fountain water, and the fountain spray.
  let clockT = 0;
  function update(dt, time) {
    clockT = time !== undefined ? time : clockT + (dt || 0);
    seaUniforms.uTime.value = clockT;
    surfMat.opacity = 0.2 + 0.06 * Math.sin(clockT * 0.9);
    const step = dt || 0.016;
    for (const puff of clouds) {
      puff.position.x += puff.userData.speed * step;
      if (puff.position.x > 760) puff.position.x = -760;
    }
    channelTex.offset.set(clockT * 0.03, 0); // slow flow along the channel
    fountWaterTex.offset.set(clockT * 0.02, clockT * 0.025);
    for (let i = 0; i < SPRAY_N; i++) {
      const [ang, ph, sp] = spraySeed[i];
      const tt = (clockT * 0.55 * sp + ph) % 1;
      const r = 0.25 + tt * 2.4;
      sprayPos[i * 3] = Math.cos(ang) * r;
      sprayPos[i * 3 + 1] = 4.6 + 3.4 * tt - 4.4 * tt * tt;
      sprayPos[i * 3 + 2] = -10 + Math.sin(ang) * r;
    }
    sprayGeo.attributes.position.needsUpdate = true;
  }
  update(0, 0);

  return {
    update,
    colliders,
    roadGrid: { lines: ROADS.slice(), width: widthOf, halfSize: 215, beachZ: BEACH_Z },
    spawnPlayer: new THREE.Vector3(0, 0, 26),
    plazaCenter: new THREE.Vector3(0, 0, 0),
    dockCenter: new THREE.Vector3(0, 0, 130),
    beachZ: BEACH_Z,
    carSpots,
    landmarks: {
      tower: new THREE.Vector3(tallest.x, tallest.h, tallest.z),
      fountain: new THREE.Vector3(0, 1.5, -10),
      beach: new THREE.Vector3(0, 0, 200),
    },
  };
}
