# Solara Bay v2 — judge-score gap list (gta6-01)

Audit against the sealed judge criteria (RULES.txt) + the ai-judge-contests skill.
The judge sees ONE contact sheet (cover large, 3 small beneath) + a short source
outline, within 1,536 tokens. The first criterion on which two entries differ
decides. "100%" is not achievable as a number — the judge is pairwise, so the
score depends on the other entries too. The goal is to win as many pairwise
games as possible: be obviously more complete and more readable than the median.

## Fixes applied in this pass (2026-11-18 ~22:00 WIB, before re-capture)
1. **Cars** — new module `game/src/vehicles.js`: `buildCarMesh(color, police,
   style)` with sedan / hatch / pickup styles (hood + trunk steps, glasshouse
   with sloped windshield + rear glass + pillars, bumpers, grille, mirrors,
   side skirts, wheel wells + hubcaps, exhaust, plates; Bay PD livery =
   white + blue stripe + light bar). traffic.js + police.js now import it;
   traffic stages a random style per car. Footprint / wheels / userData
   unchanged, so driving, collisions and wheel spin are untouched.
2. **4-mission staging** — shots.js: Vipers grouped into a loose arc 9-15 m
   ahead of the player, aim pose (right arm forward), closer camera
   (5.5 m back, behind-right, pistol side), one staged `combat.shoot()` at
   the end (muzzle flash + tracer; 34 dmg cannot kill a 90 HP Viper, so the
   gang stays at 4; HUD ammo 11/48). city.js: 4 foreground crates + 2 barrel
   clusters added near the mission area (off the approach lines; crates have
   colliders, barrels do not).
3. **Pistol** — characters.js: `pistol` spec flag; a small dark pistol (grip +
   slide, barrel along the fingers) in the hero's right hand, enabled only
   via createPlayer. Now the combat is visible in the hand, not just on the
   HUD.
4. **Face (small, low-ROI pass)** — characters.js: eyelid raised + thinned
   (y 0.023→0.025, half-height 0.008→0.007) so more iris shows; iris/pupil
   y 0.006→0.008 (less down-gaze); lower lip fuller (0.026→0.028 wide,
   0.006→0.008 tall); one extra fringe piece to break the straight hairline.
   The face is NOT in the judged dossier (closeup-face is review-only), so
   this pass is deliberately small and low-risk.
5. **2-play / 3-chase staging** — shots.js: closer cameras (8 m / 8.5 m
   behind instead of 10.5 m); 2-play stages 2 AI cars (same lane ahead +
   oncoming); 3-chase stages a second police unit in the left lane.
6. **Capture script re-created** — `capture720.mjs` (repo root, durable —
   the /tmp copy was wiped by a VM restart). Same CDP pattern as the
   surviving /tmp/bounded-e2e.mjs; forces 1280x720 via
   Emulation.setDeviceMetricsOverride; writes JPG (dossier, <=262144 B) to
   out/screenshots/ + PNG mirrors to review-png/ (for Lyso's phone).

## Criterion 1 — Complete open world, shown in screenshots (most important)
- [x] City on foot — 1-start (plaza), 4-mission (docks)
- [x] City by car — 2-play, 3-chase
- [x] Cars read as plain boxes — FIXED (vehicles.js, see above). Verify on
  the new 2-play / 3-chase captures.
- [x] Traffic is sparse in the shots — FIXED (2 AI cars staged in 2-play).
- [x] Pedestrians — 1-start, 4-mission (Vipers)
- [x] Wanted level + police who respond — 3-chase (3 stars, responding-units
  panel, 2 police cars in frame)
- [x] Missions — 1-start + 4-mission objectives on the HUD task bar
- [x] Combat is NOT visible in any dossier shot — FIXED (pistol mesh + aim
  pose + staged muzzle flash / tracer in 4-mission).
- [~] Car stealing is NOT visible in a shot (no "press E" moment). Mitigated
  by the source outline (player.js / traffic.js steal functions). No shot
  is spent on it — the skill says show the loop, not a prompt.
- [~] Save / start screen are NOT in the shots. Deliberate: a menu shot shows
  less than a gameplay shot. Covered by the outline (save.js, main.ts).

## Criterion 2 — Depth and fun
- [x] 6 missions + story (Tomas / Sal / Vipers / Bay PD), rewards $300–$1,000
- [x] Vehicles to steal and drive (mission 3 is a steal; driving in 2 shots)
- [~] Activities (cash/health pickups) exist but are not shown. Minor.
- [x] Combat — FIXED (see criterion 1: pistol + staged shot).
- [~] Progression: money $200 on the HUD; no reward moment shown. Minor.

## Criterion 3 — Feel and polish
- [x] HUD + circular minimap in all 4 shots; golden-hour ACES + bloom
- [x] Controls/camera read well in the driving shots (chase cam, speedo)
- [~] Menus not shown (deliberate, see above).

## Criterion 4 — Look and originality
- [x] Coherent sun-soaked city, original names (Solara Bay, Tomas, Sal,
  Bay PD, Vipers, GULL LINE / CORAL CARGO containers)
- [!] Cars as boxes hurt the look directly (see criterion 1).
- [~] Face is stylized low-poly, not photoreal — but the face is NOT in the
  judged dossier (closeup-face is review-only; the hero is seen from behind
  in 1-start / 4-mission). Low judge ROI; small cheap pass only.

## Criterion 5 — Structure (source outline)
- [x] Named modules, one job each (main / city / characters / traffic /
  police / missions / combat / hud / audio / save / player / input / config /
  utils / shots)
- [!] city.js is ~2,000 lines / 85 KB — one very large file. FIX: the car
  builder moves out of traffic.js into its own named module (vehicles.js),
  which also gives the outline a clear "vehicles" entry.

## Screenshot plan (4 dossier shots, cover first)
1. 1-start (cover, large) — plaza golden hour, on foot, HUD + minimap +
   mission objective. KEEP (strongest frame).
2. 2-play — driving, hero car LARGE + detailed, AI traffic visible,
   speedo 97 km/h. RE-STAGE (closer camera, traffic in frame).
3. 3-chase — police chase, wanted 3 stars, police car LARGE + detailed,
   responding-units panel, minimap with red dots. RE-STAGE (closer camera).
4. 4-mission — docks combat: hero aiming pistol (muzzle flash + tracer),
   Vipers LARGE in frame, beacon, containers/crates foreground.
   RE-STAGE (closer camera, grouped Vipers, foreground props).

## Study material
- X post https://x.com/0xZackBh/status/2123054136719769702 (Lyso, 2026-11-18):
  COULD NOT BE READ — x.com is blocked by the sandbox domain policy and
  the search index does not carry that tweet's text (3 attempts). No content
  from it is used here; nothing is fabricated. The audit above rests on the
  sealed judge criteria in RULES.txt, which is the authoritative source.
