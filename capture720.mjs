// Capture the Solara Bay v2 dossier screenshots at TRUE 1280x720.
// Re-created after a VM restart wiped /tmp/capture720.mjs.
// Self-contained CDP driver (Node built-in WebSocket + fetch, no deps).
// Pattern: /tmp/bounded-e2e.mjs (surviving) + the polish pass's capture720.
//
// Usage: node capture720.mjs   (from ~/workspace/makefun/solara-bay-v2/)
//   - Serves game/ on http://127.0.0.1:8080 if not already up.
//   - For each shot (start/play/chase/mission/face): navigates to
//     ?shot=<name>&seed=1, waits for window.__shotReady, captures JPEG
//     (dossier, <=262144 B) + PNG (review mirror for Lyso's phone).
//   - MUST force Emulation.setDeviceMetricsOverride 1280x720:
//     --window-size=1280,720 alone yields a 1280x520 viewport here.
// Output: out/screenshots/<n>-<name>.jpg  +  review-png/<n>-<name>.png
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = '/home/hatch/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome';
const PORT = 9224;
const BASE = 'http://127.0.0.1:8080';
const ROOT = process.cwd();
const OUT = path.join(ROOT, 'out', 'screenshots');
const PNGDIR = path.join(ROOT, 'review-png');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(PNGDIR, { recursive: true });

const SHOTS = [
  ['1-start', 'start'],
  ['2-play', 'play'],
  ['3-chase', 'chase'],
  ['4-mission', 'mission'],
  ['5-face', 'face'],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Ensure the local server is up ------------------------------------------
let serverProc = null;
try {
  const res = await fetch(BASE + '/index.html');
  if (!res.ok) throw new Error('bad status ' + res.status);
  console.log('server already up on 8080');
} catch {
  console.log('starting server: node serve.ts');
  serverProc = spawn('node', ['serve.ts'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let up = false;
  for (let i = 0; i < 30; i += 1) {
    await sleep(500);
    try { const r = await fetch(BASE + '/index.html'); if (r.ok) { up = true; break; } } catch {}
  }
  if (!up) { serverProc.kill(); throw new Error('server did not start'); }
  console.log('server up');
}

// --- Launch Chrome -----------------------------------------------------------
const proc = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--window-size=1280,720', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/cdp-profile-capture-' + process.pid,
  'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });

let devtools = null;
for (let i = 0; i < 60; i += 1) {
  await sleep(500);
  try { const res = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (res.ok) { devtools = await res.json(); break; } } catch {}
}
if (!devtools) { proc.kill(); if (serverProc) serverProc.kill(); throw new Error('chrome did not start'); }

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
let page = list.find((t) => t.type === 'page');
if (!page) page = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { const { res, rej } = pending.get(msg.id); pending.delete(msg.id); msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result); }
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const mid = ++id;
  pending.set(mid, { res, rej });
  ws.send(JSON.stringify({ id: mid, method, params }));
  setTimeout(() => { if (pending.has(mid)) { pending.delete(mid); rej(new Error('timeout ' + method)); } }, 120000);
});
const evl = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  if (r.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.exceptionDetails).slice(0, 400));
  return r.result.value;
};

const results = [];
try {
  await send('Runtime.enable');
  await send('Page.enable');
  // TRUE 1280x720 viewport (window-size alone gives 1280x520 here).
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });

  for (const [file, shot] of SHOTS) {
    await send('Page.navigate', { url: `${BASE}/index.html?shot=${shot}&seed=1` });
    let ready = false;
    let state = null;
    for (let i = 0; i < 120; i += 1) {
      await sleep(1000);
      try {
        if (await evl('window.__shotError ? "ERR:"+window.__shotError : null')) {
          throw new Error('shot error: ' + await evl('window.__shotError'));
        }
        ready = await evl('!!window.__shotReady');
        if (ready) break;
      } catch (e) { if (String(e.message).startsWith('shot error')) throw e; }
    }
    if (!ready) throw new Error(`shot ${shot} never became ready`);
    try { state = await evl('window.__game ? window.__game.getState() : null'); } catch {}
    const jpg = await send('Page.captureScreenshot', { format: 'jpeg', quality: 85 });
    const png = await send('Page.captureScreenshot', { format: 'png' });
    const jpgPath = path.join(OUT, `${file}.jpg`);
    const pngPath = path.join(PNGDIR, `${file}.png`);
    fs.writeFileSync(jpgPath, Buffer.from(jpg.data, 'base64'));
    fs.writeFileSync(pngPath, Buffer.from(png.data, 'base64'));
    const jpgSize = fs.statSync(jpgPath).size;
    const pngSize = fs.statSync(pngPath).size;
    const ok = jpgSize <= 262144;
    results.push({ file, shot, jpgSize, pngSize, ok, state });
    console.log(`${ok ? 'OK  ' : 'OVER'}  ${file}.jpg ${jpgSize} B  ${file}.png ${pngSize} B` +
      (state ? `  | vipersAlive=${state.vipersAlive} ammo=${state.ammo} wanted=${state.wanted} speed=${state.speedKmh} errors=${state.errors.length}` : ''));
    if (state && state.errors.length) console.log('     ERRORS: ' + JSON.stringify(state.errors).slice(0, 500));
  }
} finally {
  ws.close();
  proc.kill();
  if (serverProc) serverProc.kill();
}

const over = results.filter((r) => !r.ok);
console.log(over.length ? `FAIL: ${over.length} JPG(s) over the 262144 B cap` : 'ALL JPGs under the 262144 B cap');
