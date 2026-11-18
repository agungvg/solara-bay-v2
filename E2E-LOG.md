# Solara Bay v2 — E2E record (headless Chromium, CDP, SwiftShader)

Tooling (in /tmp, not in repo): `/tmp/cdp.mjs` (CDP driver, Playwright Chromium
chromium-1255, `--use-angle=swiftshader`), `/tmp/e2e.mjs` (verb chain),
`/tmp/shots.mjs` (screenshots), `/tmp/probe3.mjs` (perf probe).
Server: `python3 -m http.server 8080` on `game/`.

## Runs

### Run 1 (2026-11-18 ~12:0x WIB)
7 passed, then a `Runtime.evaluate` timeout (60 s) killed it. Cause: per-chunk
CDP round-trips + `advance()` rendering each time in SwiftShader.

### Run 2 (2026-11-18 ~12:2x WIB) — 7 passed, 5 failed, ~346 s
- PASS: boot (zero errors, 45 peds / 7 archetypes, 12 AI + 14 parked, plaza
  clean, 28 requests local), start, walk-to-Sal.
- FAIL: mission 1 talk (player stuck at (2.47, 0, -2.55) on the fountain collider
  edge, 5.5 m from Sal, outside the then-3.2 m talk radius), mission 2 start,
  docks package reach, package pickup, harness timeout on the beach-bar walk leg
  (player trapped by the channel wall, target x=8 pulling east away from the gap).
- Fixes applied after run 2: Sal moved to (10, 0, -6); talk radius 3.2 → 4.5 m;
  `?still=1` hook (rAF loop idles, time advances only via `__game.advance()`);
  `advance(..., false)` (no SwiftShader presents); in-page navigation legs;
  channel-gap waypointing; diagonal sidestep when stuck.

### Run 3 (2026-11-18 ~12:4x WIB) — 9 passed, 3 failed, ~229 s
- PASS: boot ×5, start, walk to Sal (3.6 s), **mission 1: talk to Sal → +$300
  (money $500)**, mission 2 started.
- FAIL: mission 2 reached docks package (walkTo(8,128) false after 34.3 s),
  mission 2 package pickup (step 0), harness `Runtime.evaluate` timeout on the
  next walk leg.
- Fixes applied after run 3: road-grid routing (axis-aligned legs on real road
  lines — the old straight-line route cut through buildings), channel detour
  only when the crossing x is inside the walls (|x| < 32), batched legs
  (≤40 chunks per CDP eval), CDP timeout 180 s → 600 s.

### Run 4 (2026-11-18 ~13:0x WIB) — 9 passed, 1 failed, ~243 s
- PASS: same 9 as run 3 (boot ×5, start, walk to Sal, mission 1 +$300,
  mission 2 started).
- FAIL: harness `Runtime.evaluate` timeout — walkLeg(8,104) took 38.8 s and
  returned false, the next leg eval then exceeded the timeout. Root cause is VM
  CPU throttling, not sim cost: a probe (`probe3.mjs`) shows ~0.7 ms/tick,
  600 ticks in ~400 ms, heap stable at 30 MB, no growth while stuck against a
  building. E2E legs ran at ~10–25 ms/tick under load (load average 7.2 at the
  time; the VM is shared with other agents' work).

### Run 5 (2026-11-18 13:10–13:26 WIB) — KILLED at ~16 min, no result file
- The final run used the fixed road routing + batched legs. It never completed:
  at ~15 min a read-only peek at the live tab showed the renderer main thread
  blocked solid (even a trivial `getState()` evaluate timed out at 30 s) inside
  one long synchronous eval — most likely the mission-2 road-routed walk leg
  (docks) or an `advance(35)` wait. The run was killed on the finish-now order;
  its piped stdout (through `tail -n 75`) was lost on kill, so no per-verb
  record survives for this run beyond the boot → mission-1 passes already
  proven in runs 3–4.

## Verified (in-browser, multiple runs)
- Boot: zero page errors, zero console errors, 28 requests, all local.
- 45 peds / 7 archetypes (walker 7, jogger 7, tourist 7, worker 6, shopkeeper 6,
  talker 6, sitter 6); 12 AI cars + 14 parked; plaza clean of AI cars.
- Start → mission 1 active; walk to Sal; talk → +$300 (money $500);
  mission 2 starts.
- Shot stagings exercise: enterCar + driving at 97 km/h, wanted 3 + police
  pursuit with 4 units, mission 5 with 4 Vipers spawned, save key present —
  but these are staged, not the E2E chain.

## NOT verified end-to-end in one run
Missions 2–6 completion, car steal / drive / exit, punch → wanted 1 → police
spawn, save → reload → continue (money + mission preserved). Recommended next
step: re-run the chain when the VM is quiet, or split it into per-mission runs
with a fresh boot each.
