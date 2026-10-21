// Word Train — short vibrations via navigator.vibrate. Silent where unsupported (iOS Safari),
// while the sound is muted (core/sfx.js), or when switched off (`wordtrain.haptics` = '0').

import { isMuted } from './sfx.js';

const KEY = 'wordtrain.haptics';
let enabled = true;
try { enabled = localStorage.getItem(KEY) !== '0'; } catch {}

export const supported = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

export function vibrate(pattern) {
  if (!supported || !enabled || isMuted()) return false;
  try { return navigator.vibrate(pattern); } catch { return false; }
}

export const haptics = {
  supported,
  get enabled() { return enabled; },
  setEnabled(value) {
    enabled = Boolean(value);
    try { localStorage.setItem(KEY, enabled ? '1' : '0'); } catch {}
    if (!enabled && supported) try { navigator.vibrate(0); } catch {}
    return enabled;
  },
  toggle() { return this.setEnabled(!enabled); },
  tap() { vibrate(8); },
  place() { vibrate(12); },
  swap() { vibrate(10); },
  hint() { vibrate([10, 40, 10]); },
  correct() { vibrate([14, 50, 22]); },
  wrong() { vibrate([45, 35, 45]); },
  couple() { vibrate(18); },
  win() { vibrate([20, 50, 20, 50, 70]); },
};
haptics.success = haptics.correct;
haptics.error = haptics.wrong;

// haptic('tap' | 'place' | 'swap' | 'hint' | 'correct' | 'success' | 'wrong' | 'error' | 'couple' | 'win')
export function haptic(name) { haptics[name]?.(); }

export default haptics;
