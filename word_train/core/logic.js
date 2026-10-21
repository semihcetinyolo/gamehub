// Word Train — pure game logic shared by every variant. No DOM; every function
// returns new objects and never mutates its input, so state can be stored as JSON.

const LOCALE = 'tr-TR';
const TR_LETTERS = /^[A-ZÇĞİÖŞÜ]+$/;
// Rough Turkish letter frequencies, used to pad letter pools with plausible letters.
const FILLER = 'AAAAAEEEEİİİİNNNRRRLLLIIKKKDDMMYYUUTTSSBBOOÜŞZGÇHĞVCÖPF';

export function trUpper(s) { return String(s ?? '').toLocaleUpperCase(LOCALE); }
export function trLower(s) { return String(s ?? '').toLocaleLowerCase(LOCALE); }
export function normalize(s) { return trUpper(String(s ?? '').trim().replace(/\s+/g, ' ')); }

// phrase that link `index` forms with the link before it ("kitap kapağı").
export function phraseOf(prev, link) { return `${trLower(prev.base)} ${trLower(link.word)}`; }

// How a found word turns into the base the next phrase starts with: the common prefix stays, the rest of
// the word drops off and the rest of the base comes in. suffixSplit('BAHÇESİ', 'BAHÇE') ->
// { keep: 'BAHÇE', drop: 'Sİ', add: '' }; ('KAPAĞI', 'KAPAK') -> { keep: 'KAPA', drop: 'ĞI', add: 'K' }.
export function suffixSplit(word, base) {
  const w = Array.from(word), b = Array.from(base ?? word);
  let n = 0;
  while (n < w.length && n < b.length && w[n] === b[n]) n++;
  return { keep: w.slice(0, n).join(''), drop: w.slice(n).join(''), add: b.slice(n).join('') };
}

// `n` revealed letters followed by blanks: mask('KAPAĞI', 2) -> 'KA____'.
export function mask(word, n = 0, blank = '_') {
  const letters = Array.from(word);
  return letters.map((ch, i) => i < n ? ch : blank).join('');
}

export function validateLevel(level) {
  if (!level || !Array.isArray(level.chain) || level.chain.length < 2) throw new Error('chain needs at least 2 links');
  const seen = new Set();
  level.chain.forEach((link, i) => {
    const where = `level ${level.id} link ${i}`;
    if (!TR_LETTERS.test(link?.word ?? '')) throw new Error(`${where}: word must be uppercase Turkish letters`);
    if (!TR_LETTERS.test(link.base ?? '')) throw new Error(`${where}: base must be uppercase Turkish letters`);
    if (seen.has(link.word)) throw new Error(`${where}: ${link.word} repeats`);
    seen.add(link.word);
    if (i === 0) return;
    const expected = phraseOf(level.chain[i - 1], link);
    if (link.phrase !== expected) throw new Error(`${where}: phrase should be "${expected}"`);
    if (link.distractors !== undefined) {
      if (!Array.isArray(link.distractors) || link.distractors.some(d => !TR_LETTERS.test(d)))
        throw new Error(`${where}: distractors must be uppercase words`);
      if (link.distractors.includes(link.word)) throw new Error(`${where}: answer listed as distractor`);
    }
  });
  return true;
}

function hashSeed(seed) {
  if (Number.isSafeInteger(seed)) return seed >>> 0;
  let h = 2166136261;
  for (const ch of String(seed ?? 1)) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0;
  return h;
}

// Mulberry32. Numbers and strings both work as seeds.
export function rng(seed) {
  let a = hashSeed(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Stable random source for the link being searched, so a reload shows the same choices.
export function linkRand(state) { return rng(`${state.seed}:${state.levelId}:${state.index}`); }

export function shuffle(arr, rand = Math.random) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Letters of `word` plus `extra` filler letters (a count, or explicit letters), shuffled.
// The pool never comes out spelling the word in order.
export function letterPool(word, extra = 0, rand = Math.random) {
  const letters = Array.from(normalize(word).replace(/ /g, ''));
  const pad = typeof extra === 'number'
    ? Array.from({ length: Math.max(0, extra) }, () => FILLER[Math.floor(rand() * FILLER.length)])
    : Array.from(normalize(Array.isArray(extra) ? extra.join('') : extra).replace(/ /g, ''));
  const all = [...letters, ...pad];
  let out = shuffle(all, rand);
  const spells = () => out.slice(0, letters.length).join('') === letters.join('');
  for (let tries = 0; tries < 8 && spells() && new Set(all).size > 1; tries++) out = shuffle(all, rand);
  if (spells() && new Set(all).size > 1) out = [...out.slice(1), out[0]];
  return out;
}

// The answer and up to n − 1 of its distractors (a random pick when there are more), in random order.
export function choices(link, rand = Math.random, n = 8) {
  const others = shuffle([...new Set(link.distractors ?? [])].filter(d => d !== link.word), rand).slice(0, Math.max(0, n - 1));
  return shuffle([link.word, ...others], rand);
}

// The player is always given the first letter of the word being searched ("KİTAP + K…"), so every
// target starts with revealed = 1; letter hints continue from the second letter.
export const GIVEN = 1;

export function createRun(level, { seed = 1 } = {}) {
  return { levelId: level.id, chain: level.chain, seed, index: 1, found: [level.chain[0].word],
    mistakes: 0, hints: 0, revealed: GIVEN, clue: false, done: level.chain.length < 2 };
}

// given = the free first letter; pattern = revealed letters + '_' slots ('K_____'), ready for setGhost.
export function current(state) {
  if (state.done) return null;
  const target = state.chain[state.index];
  return { prev: state.chain[state.index - 1], target, index: state.index, total: state.chain.length,
    revealed: state.revealed, clue: state.clue, given: Array.from(target.word)[0],
    pattern: mask(target.word, state.revealed) };
}

// guess is the word ("kapağı") or the whole phrase ("kitap kapağı"), any case.
export function answer(state, guess) {
  const cur = current(state);
  if (!cur) return { state, result: { ok: false, word: null, base: null, phrase: null, done: true } };
  const g = normalize(guess);
  const ok = g === cur.target.word || g === normalize(cur.target.phrase ?? phraseOf(cur.prev, cur.target));
  const phrase = cur.target.phrase ?? phraseOf(cur.prev, cur.target);
  if (!ok) return { state: { ...state, mistakes: state.mistakes + 1 },
    result: { ok: false, word: cur.target.word, base: cur.target.base, phrase, done: false } };
  const index = state.index + 1;
  const done = index >= state.chain.length;
  return { state: { ...state, index, found: [...state.found, cur.target.word], revealed: GIVEN, clue: false, done },
    result: { ok: true, word: cur.target.word, base: cur.target.base, phrase, done } };
}

// 'letter' reveals one more letter of the target, from the second one on (never the last one);
// 'clue' reveals the link's hint text. `fresh` is false when nothing new was shown.
export function useHint(state, kind) {
  const cur = current(state);
  if (!cur) return { state, reveal: null };
  const word = cur.target.word;
  if (kind === 'letter') {
    const max = Math.max(0, Array.from(word).length - 1);
    const revealed = Math.min(max, state.revealed + 1);
    const fresh = revealed > state.revealed;
    // index/letter = the letter this hint opened (left to right); the latest one when nothing new.
    const index = revealed - 1;
    return { state: fresh ? { ...state, revealed, hints: state.hints + 1 } : state,
      reveal: { kind, fresh, index, letter: index >= 0 ? Array.from(word)[index] : null, count: revealed,
        letters: Array.from(word).slice(0, revealed).join(''), pattern: mask(word, revealed) } };
  }
  if (kind === 'clue') {
    const fresh = !state.clue;
    return { state: fresh ? { ...state, clue: true, hints: state.hints + 1 } : state,
      reveal: { kind, fresh, text: cur.target.hint ?? '' } };
  }
  throw new Error(`Unknown hint kind: ${kind}`);
}
