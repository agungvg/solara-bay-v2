// Solara Bay v2 — keyboard + mouse-look input. Written fresh for v2.
// Keys feed a held set; one-shot presses are queued and taken once by the
// loop, so a press between frames is never lost or double-counted.

export const ACTION = {
  ENTER_CAR: 1, PUNCH: 2, RELOAD: 4, MUTE: 8, PAUSE: 16,
  INTERACT: 32, RADIO_NEXT: 64, HORN: 128,
};

const KEY_ACTIONS = {
  KeyE: ACTION.ENTER_CAR | ACTION.INTERACT,
  KeyF: ACTION.PUNCH,
  KeyR: ACTION.RELOAD,
  KeyM: ACTION.MUTE,
  KeyP: ACTION.PAUSE,
  Escape: ACTION.PAUSE,
  KeyQ: ACTION.RADIO_NEXT,
  KeyH: ACTION.HORN,
};

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let lookDX = 0, lookDY = 0;
  let mouseDown = false;
  let locked = false;

  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    keys.add(e.code);
    const a = KEY_ACTIONS[e.code];
    if (a && !e.repeat) actions |= a;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
  });
  canvas.addEventListener('click', () => {
    if (document.pointerLockElement !== canvas) {
      try { canvas.requestPointerLock(); } catch { /* headless / denied: drag-look still works */ }
    }
  });
  canvas.addEventListener('mousedown', (e) => { if (e.button === 0) mouseDown = true; });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) mouseDown = false; });
  window.addEventListener('mousemove', (e) => {
    if (locked) { lookDX += e.movementX || 0; lookDY += e.movementY || 0; }
  });

  function axis(neg, pos) { return (keys.has(pos) ? 1 : 0) - (keys.has(neg) ? 1 : 0); }

  return {
    /** Forward/back strafe in camera space: {f, s} each -1..1. */
    move() {
      const f = axis('KeyS', 'KeyW') + axis('ArrowDown', 'ArrowUp');
      const s = axis('KeyA', 'KeyD') + axis('ArrowLeft', 'ArrowRight');
      return { f: Math.max(-1, Math.min(1, f)), s: Math.max(-1, Math.min(1, s)) };
    },
    get sprint() { return keys.has('ShiftLeft') || keys.has('ShiftRight'); },
    get mouseDown() { return mouseDown; },
    takeLook() { const r = { dx: lookDX, dy: lookDY }; lookDX = 0; lookDY = 0; return r; },
    takeActions() { const t = actions; actions = 0; return t; },
    peekActions() { return actions; },
    has(code) { return keys.has(code); },
    queueAction(a) { actions |= a; },
  };
}
