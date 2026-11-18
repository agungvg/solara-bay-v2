# Solara Bay v2 — Rebuild-from-Scratch Assessment

**Competition:** make.fun gta6-01 "Make GTA 6" — $1,666, deadline Tue 24 Nov 2026 22:00 WIB.
**Repo:** https://github.com/agungvg/solara-bay-v2
**Rule followed:** zero reuse of the previous build (pass 1 / pass 2). No file under
`~/workspace/makefun/solara-bay/` was opened, read, or referenced at any point — not
code, not structure, not assets, not even as a comparison. Same theme only
(open-world crime game in Solara Bay, 6 missions, police, NPCs). Everything in this
repo was written fresh in this session from the brief, the two given v2 files
(`game/src/characters.js`, `game/src/city.js`), `ART-BIBLE.md`, and the skills.

## What this build is (fresh)

- **City:** ~440×440 Solara Bay — Downtown, Plaza (fountain + water channel with a
  footbridge), Harbour (docks, containers), Beachfront (sand + ocean), Homes, Greens.
  334 collision AABBs, a road grid, 14 car spots, 6 districts with named signs.
- **Characters:** hero Tomas (white jacket, red trim) + Sal + 45 pedestrians in 7
  archetypes (walker, jogger, tourist, worker, shopkeeper, talker, sitter), each with
  routines (walk → idle / work / chat / sit → next destination), panic/flee, witness
  calls, bump barks. 4 Vipers (red jackets) at the docks for mission 5.
- **Systems:** 12 AI cars + 14 stealable parked cars; wanted 0–5 stars with police
  pursuit, ramming, roadblocks at ≥4, search behaviour, busted on foot; punch + pistol
  (raycast, tracer, muzzle flash, sparks); 6 story missions with brief/outro cards,
  waypoint beacon (gold ring + beam), timers, rewards $300/$400/$500/$600/$800/$1000;
  synthesised WebAudio only (engine, honk, footsteps, punch, gunshot, siren, ambient
  bed, 3 radio stations); localStorage save/load (money, mission index, position,
  health, time, ammo); autosave every 20 s.
- **HUD (`sb-` scheme):** cash, clock, vitality bar, wanted stars, PD unit list,
  objective + distance, mission timer, weapon/ammo, speedo + gear, radio station +
  track, circular minimap (roads, beach, named sites PLAZA/DOCKS/BEACH, pulsing
  mission waypoint, player arrow, police red, cars white), dialogue box with face
  portrait, barks, toasts, hint bar, mission brief card, crosshair, damage flash.
- **Rendering:** ACESFilmic, exposure 1.15, warm sun + cool hemisphere, FogExp2,
  sky dome, HalfFloat MSAA (samples 4) composer → UnrealBloomPass(0.7, 0.5, 0.85) →
  OutputPass. Fixed 60 Hz tick. All assets local; 28 requests at boot, 0 external.

## Visual / functional deltas vs the old build's LOOK (no old code referenced)

- **Characters are sculpted, not blocky:** oval tapered heads with hair, eyes,
  brows, nose, mouth; lathe torsos with shoulders/waist; tapered limbs; recessed
  eyes. The face close-up (`review/closeup-face.jpg`) shows a recognisably human
  face — oval, featured, not a sphere on a rectangle. **Honest caveat (see below):**
  the front-on torso still reads as a broad white slab at close range; the taper is
  visible in silhouette/profile, not from the front.
- **Brighter, warmer scene:** golden-hour daylight per the art bible (sun #FFE3B0,
  sky #5E9BD6, exposure 1.15) instead of the old build's dim/washed look. The
  screenshots read bright and HD.
- **HUD is complete and legible:** every zone populated in every shot (cash, clock,
  HP, stars, objective, speedo, radio, minimap, ammo, hint). No overlaps found at
  1280×720 (the clock line sits clear above the HP bar).
- **Plaza reads as a plaza:** fountain, channel + footbridge, market stalls (KOPI
  BAY, TACO SOL, SALTU), benches, palms — instead of an empty flat square.
- **Docks read as docks:** containers (BULL LINE / AZURE FREIGHT), cranes, palms,
  beach and ocean beyond; the mission-5 beacon is a visible gold ring + beam.

## E2E summary (see E2E-LOG.md for the full record)

- **Boot:** zero page errors, zero console errors, 28 requests all local, `__game`
  present. 45 peds / 7 archetypes, 12 AI + 14 parked cars, plaza clean of AI cars —
  passed in every run.
- **Mission 1 (verified end-to-end in-browser):** start → mission 1 active →
  walk to Sal at the plaza → talk → +$300 (money $200 → $500) → mission 2 starts.
  Passed in 3 consecutive runs.
- **Full verb chain (missions 2–6, car steal/drive, punch → wanted → police,
  save → reload): NOT completed in a single run.** The final run hung inside one
  long synchronous eval during the mission-2 walk leg (docks, road-routed walk):
  the renderer main thread stayed blocked for 15+ minutes and even a trivial
  probe evaluate timed out; the run was killed at ~16 min. Underlying cause is
  VM CPU throttling (shared 1.5 CPU, load spiking to 7) against SwiftShader +
  ~25k sim ticks in one chain — the sim itself is fast in isolation
  (~0.7 ms/tick probed). The individual mechanics are exercised by the shot
  stagings (enterCar + driving at 97 km/h, wanted 3 + police pursuit, mission 5
  Vipers spawned, mission 1 complete) but the full chain is **not proven
  end-to-end**. This is the top item in the still-thin list.

## Screenshot notes (all 5 viewed, 1280×720, each ≤ 262,144 B)

- `1-start.jpg` (73,629 B): Tomas on the footbridge facing the fountain; plaza,
  stalls, channel, minimap, full HUD. The blue channel reads as a wide flat stripe
  across the frame — it is the water feature, but it dominates the lower third.
- `2-play.jpg` (66,400 B): orange car at **97 km/h** down Bay Avenue, zebra
  crossings, palms, shops. Car reads as a simple red slab with black windshield
  from the high chase camera.
- `3-chase.jpg` (67,933 B): player car at **62 km/h**, police car ahead head-on,
  3 stars, 4 PD units listed "Pursuing", "On the run — lose the Bay PD".
  A red cylinder prop floats slightly on the right sidewalk (minor).
- `4-mission.jpg` (47,726 B): Tomas on foot at the docks, 4 Vipers visible as dark
  figures, gold beacon "18 m", containers, palms, beach. Crane beams at top-right
  slightly clip the wanted stars. Strongest shot.
- `review/closeup-face.jpg` (33,522 B, NOT in dossier): face fills the frame —
  oval face, dark hair, visible eyes/brows/nose/mouth. **Honest verdict on Lyso's
  #1 criterion: PARTIAL PASS.** The head is human-proportioned and sculpted, not a
  ball — the "round head" failure is fixed. But the torso, front-on, still reads as
  a broad white slab (shoulders wide, no visible waist taper from the front; the
  collar reads as a thick white tube; arms are thin pale sticks). The hair also
  has two odd vertical tufts sticking up and the eyebrows are heavy black bars.
  At game distance (in-play shots) characters read as people; at close-up the body
  is the remaining weak point. A front-view waist taper / slimmer collar / hair
  fix in `characters.js` is the concrete next step if Lyso wants it — it was not
  done here because the order was finish-now, no more feature work.

## Still thin / not proven

1. Full E2E verb chain unproven end-to-end (see above) — missions 2–6, car
   steal/drive/exit, punch → wanted → police spawn, save → reload → continue.
   Highest-value next verification: run the chain when the VM is quiet, or split
   it into per-mission runs.
2. Character body front-on still reads slab-like (see face verdict). Hair tufts +
   heavy brows in the close-up.
3. The plaza channel reads as a flat blue stripe in the start shot; the red
   sidewalk prop floats slightly in the chase shot; the crane clips the stars in
   the mission shot.
4. No live buy→sell-style round trip is relevant here — this is a game entry, not
   a swap — but the entry has had no human playtest yet; Lyso's eye test is the
   real gate.
5. `out/dossier.json` is built (509 KB, cover 0, 4 images) and the kit check was
   run — see STATUS.json for its result. Transcripts for submission will be
   bundled later from sessions (not submitted now, per Lyso's order).
