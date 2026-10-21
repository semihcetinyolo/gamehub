// Word Train — tiny WebAudio sounds, no files. The context starts on the first sound
// (always inside a tap), and the mute switch is remembered under `wordtrain.muted`.

const KEY = 'wordtrain.muted';
let ctx = null;
let master = null;
let noiseBuffer = null;
let muted = false;
try { muted = localStorage.getItem(KEY) === '1'; } catch {}

function audio() {
  if (muted) return null;
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq, { at = 0, dur = 0.12, type = 'sine', vol = 0.3, to, attack = 0.005, filter } = {}) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + at;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let out = osc;
  if (filter) {
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filter;
    osc.connect(f);
    out = f;
  }
  out.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise({ at = 0, dur = 0.08, vol = 0.25, freq = 1200, q = 1, type = 'bandpass' } = {}) {
  const ac = audio();
  if (!ac) return;
  if (!noiseBuffer) {
    noiseBuffer = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const t = ac.currentTime + at;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer;
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(gain).connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

const NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51];

export const sfx = {
  get muted() { return muted; },
  setMuted(value) {
    muted = Boolean(value);
    try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch {}
    if (muted && ctx?.state === 'running') ctx.suspend().catch(() => {});
    return muted;
  },
  toggle() { return this.setMuted(!muted); },

  tap() { tone(880, { dur: 0.05, type: 'triangle', vol: 0.18 }); },
  // Rising pitch as letters/pieces are picked: letter(0), letter(1), …
  letter(i = 0) { tone(NOTES[Math.min(i, NOTES.length - 1)], { dur: 0.09, type: 'triangle', vol: 0.2 }); },
  // A letter/piece dropping into its slot.
  place() {
    tone(330, { dur: 0.07, type: 'triangle', vol: 0.2, to: 260 });
    noise({ dur: 0.04, vol: 0.12, freq: 1500, q: 1.5 });
  },
  // Two pieces trading places.
  swap() {
    noise({ dur: 0.09, vol: 0.12, freq: 2400, q: 1.2 });
    tone(520, { dur: 0.08, type: 'triangle', vol: 0.14, to: 700 });
  },
  correct() {
    tone(659.25, { dur: 0.14, type: 'triangle', vol: 0.25 });
    tone(987.77, { at: 0.09, dur: 0.22, type: 'triangle', vol: 0.25 });
  },
  wrong() {
    tone(196, { dur: 0.2, type: 'square', vol: 0.12, to: 140, filter: 900 });
    tone(185, { at: 0.02, dur: 0.2, type: 'sawtooth', vol: 0.06, to: 130, filter: 700 });
  },
  hint() {
    [1318.51, 1567.98, 2093].forEach((f, i) => tone(f, { at: i * 0.06, dur: 0.16, type: 'sine', vol: 0.12 }));
  },
  // Wheels on rails while a wagon rolls in (~0.9 s).
  chug() {
    for (let i = 0; i < 6; i++) {
      noise({ at: i * 0.15, dur: 0.07, vol: 0.14 - i * 0.015, freq: 700, q: 0.8 });
      tone(90, { at: i * 0.15, dur: 0.06, type: 'sine', vol: 0.08 });
    }
  },
  // Wooden coupling clunk.
  couple() {
    noise({ dur: 0.05, vol: 0.35, freq: 1800, q: 2 });
    tone(140, { dur: 0.12, type: 'sine', vol: 0.35, to: 70 });
    tone(620, { at: 0.01, dur: 0.07, type: 'triangle', vol: 0.12 });
  },
  // Toy train "tuu-tuu".
  whistle(delay = 0) {
    for (const at of [delay, delay + 0.32]) {
      tone(740, { at, dur: 0.26, type: 'sine', vol: 0.16, attack: 0.03 });
      tone(932, { at, dur: 0.26, type: 'sine', vol: 0.12, attack: 0.03 });
      noise({ at, dur: 0.24, vol: 0.04, freq: 2500, q: 0.7 });
    }
  },
  win() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      tone(f, { at: i * 0.11, dur: i === 3 ? 0.45 : 0.16, type: 'triangle', vol: 0.24 }));
    sfx.whistle(0.6);
  },
};

// Same shared instance; `muted` (if given) overrides the remembered switch.
export function createSfx({ muted: m } = {}) {
  if (m !== undefined) sfx.setMuted(m);
  return sfx;
}

export const isMuted = () => muted;
export const setMuted = value => sfx.setMuted(value);

export default sfx;
