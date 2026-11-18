// Solara Bay v2 — synthesised WebAudio only. No audio files, no network.
// Every sound is built from oscillators / filtered noise at call time.
// The AudioContext is created lazily on the first user gesture (browsers
// start it suspended) and resumed from that gesture. Written fresh for v2.

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let engineNodes = null;
  let sirenNodes = null;
  let ambientNodes = null;
  let radioTimer = 0;
  let radioStep = 0;
  let radioOn = false;
  let radioScale = [0, 3, 5, 7, 10];

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return true; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.55;
      master.connect(ctx.destination);
    } catch { return false; }
    return true;
  }

  function noiseBuffer(seconds = 1) {
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function blip(freq, dur, type = 'sine', gain = 0.2, when = 0, slideTo = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function noiseHit(dur, filterFreq, gain = 0.3, type = 'lowpass', when = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(Math.max(0.1, dur + 0.05));
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur + 0.05);
  }

  return {
    /** Call from a user gesture (Start button). Returns true when audio is live. */
    unlock() { return ensure(); },
    get muted() { return muted; },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.55;
      return muted;
    },

    click() { if (ensure()) blip(660, 0.07, 'triangle', 0.12); },
    footstep(run) { if (ctx) noiseHit(0.07, 300, run ? 0.10 : 0.06); },
    punch() { if (ensure()) { noiseHit(0.12, 500, 0.35); blip(90, 0.12, 'sine', 0.3, 0, 45); } },
    gunshot() {
      if (!ensure()) return;
      noiseHit(0.16, 1800, 0.5, 'highpass');
      noiseHit(0.1, 400, 0.4);
      blip(140, 0.12, 'sine', 0.35, 0, 50);
    },
    reload() { if (ensure()) { blip(420, 0.05, 'square', 0.08); blip(300, 0.05, 'square', 0.08, 0.12); } },
    honk() { if (ensure()) { blip(370, 0.32, 'square', 0.14); blip(466, 0.32, 'square', 0.10); } },
    pickup() { if (ensure()) { blip(523, 0.1, 'triangle', 0.16); blip(784, 0.16, 'triangle', 0.16, 0.09); } },
    missionDone() {
      if (!ensure()) return;
      [523, 659, 784, 1047].forEach((f, i) => blip(f, 0.22, 'triangle', 0.18, i * 0.11));
    },
    busted() { if (ensure()) [392, 330, 262].forEach((f, i) => blip(f, 0.3, 'sawtooth', 0.12, i * 0.16)); },
    bark() { if (ctx) blip(220 + Math.random() * 80, 0.09, 'triangle', 0.05); },

    engineStart() {
      if (!ensure() || engineNodes) return;
      const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 55;
      const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 110;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
      const g = ctx.createGain(); g.gain.value = 0.0;
      g.gain.linearRampToValueAtTime(0.09, ctx.currentTime + 0.4);
      o1.connect(f); o2.connect(f); f.connect(g); g.connect(master);
      o1.start(); o2.start();
      engineNodes = { o1, o2, f, g };
    },
    engineSet(speed01, revving) {
      if (!engineNodes) return;
      const t = ctx.currentTime;
      const base = 52 + speed01 * 130 + (revving ? 25 : 0);
      engineNodes.o1.frequency.setTargetAtTime(base, t, 0.08);
      engineNodes.o2.frequency.setTargetAtTime(base * 2, t, 0.08);
      engineNodes.f.frequency.setTargetAtTime(380 + speed01 * 900, t, 0.1);
      engineNodes.g.gain.setTargetAtTime(0.07 + speed01 * 0.05, t, 0.1);
    },
    engineStop() {
      if (!engineNodes) return;
      const n = engineNodes; engineNodes = null;
      try {
        n.g.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
        setTimeout(() => { try { n.o1.stop(); n.o2.stop(); } catch {} }, 400);
      } catch {}
    },

    sirenStart() {
      if (!ensure() || sirenNodes) return;
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 750;
      const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 0.55;
      const lg = ctx.createGain(); lg.gain.value = 170;
      lfo.connect(lg); lg.connect(o.frequency);
      const g = ctx.createGain(); g.gain.value = 0.05;
      o.connect(g); g.connect(master);
      o.start(); lfo.start();
      sirenNodes = { o, lfo, g };
    },
    sirenStop() {
      if (!sirenNodes) return;
      const n = sirenNodes; sirenNodes = null;
      try { n.o.stop(); n.lfo.stop(); } catch {}
    },

    ambientStart() {
      if (!ensure() || ambientNodes) return;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(2); src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 320;
      const g = ctx.createGain(); g.gain.value = 0.035;
      src.connect(f); f.connect(g); g.connect(master);
      src.start();
      ambientNodes = { src, g };
    },

    /** Tiny radio sequencer while driving: a bleep melody per station. Call each tick. */
    radioTick(dt, driving, stationIndex) {
      if (!ctx || !driving) { radioOn = false; return; }
      radioOn = true;
      const scales = [[0, 3, 5, 7, 10], [0, 2, 4, 7, 9], [0, 3, 5, 6, 10]];
      radioScale = scales[stationIndex % scales.length];
      radioTimer -= dt;
      if (radioTimer <= 0) {
        radioTimer = 0.42;
        const deg = radioScale[radioStep % radioScale.length];
        const oct = radioStep % 8 < 4 ? 0 : 1;
        blip(220 * Math.pow(2, (deg + oct * 12) / 12), 0.32, 'triangle', 0.05);
        radioStep += 1;
      }
    },
  };
}
