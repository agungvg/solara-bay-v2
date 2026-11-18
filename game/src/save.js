// Solara Bay v2 — localStorage save / load. Written fresh for v2.
// Saves money, mission progress, player position + facing, health, clock
// and ammo. Versioned so an old save never loads into a new shape.

import { SAVE_KEY } from './config.js';

export function saveGameData(data) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1, savedAt: Date.now(), ...data }));
    return true;
  } catch { return false; }
}

export function loadGameData() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch { return null; }
}

export function hasSave() { return loadGameData() !== null; }

export function clearSave() {
  try { window.localStorage.removeItem(SAVE_KEY); } catch {}
}
