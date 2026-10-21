import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLE_LEVEL } from './fixtures/sample-level.js';
import { trUpper, trLower, normalize, phraseOf, mask, suffixSplit, validateLevel, rng, linkRand, shuffle, letterPool,
  choices, createRun, current, answer, useHint } from '../core/logic.js';

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

const level = deepFreeze(structuredClone(SAMPLE_LEVEL));

test('Turkish casing keeps dotted and dotless i apart', () => {
  assert.equal(trUpper('istanbul ılık'), 'İSTANBUL ILIK');
  assert.equal(trLower('IŞIK İĞNE'), 'ışık iğne');
  assert.equal(normalize('  kitap   kapağı '), 'KİTAP KAPAĞI');
  assert.equal(normalize('çiçek'), 'ÇİÇEK');
  assert.equal(normalize(null), '');
  assert.equal(phraseOf(level.chain[0], level.chain[1]), 'kitap kapağı');
});

test('mask reveals a prefix', () => {
  assert.equal(mask('KAPAĞI', 2), 'KA____');
  assert.equal(mask('İĞNE', 0, '·'), '····');
  assert.equal(mask('KOL', 9), 'KOL');
});

test('sample level is valid; broken levels are rejected', () => {
  assert.ok(validateLevel(level));
  const bad = structuredClone(SAMPLE_LEVEL);
  bad.chain[2].phrase = 'kapağı tasarımı';
  assert.throws(() => validateLevel(bad), /phrase should be "kapak tasarımı"/);
  const lower = structuredClone(SAMPLE_LEVEL);
  lower.chain[1].word = 'kapağı';
  assert.throws(() => validateLevel(lower), /uppercase/);
  const dup = structuredClone(SAMPLE_LEVEL);
  dup.chain[3].distractors = ['EKİBİ'];
  assert.throws(() => validateLevel(dup), /distractor/);
});

test('rng is deterministic per seed and stays in [0,1)', () => {
  const a = rng(42), b = rng(42), c = rng('42x');
  const xs = Array.from({ length: 200 }, a);
  assert.deepEqual(xs, Array.from({ length: 200 }, b));
  assert.notDeepEqual(xs.slice(0, 5), Array.from({ length: 5 }, c));
  assert.ok(xs.every(x => x >= 0 && x < 1));
  assert.deepEqual(Array.from({ length: 3 }, rng('a')), Array.from({ length: 3 }, rng('a')));
});

test('shuffle is a permutation and leaves the input alone', () => {
  const src = Object.freeze(['A', 'B', 'C', 'D', 'E']);
  const out = shuffle(src, rng(7));
  assert.deepEqual([...out].sort(), [...src]);
  assert.deepEqual(shuffle(src, rng(7)), out);
});

test('letterPool holds every letter, pads, and never spells the word in order', () => {
  for (let seed = 0; seed < 300; seed++) {
    const pool = letterPool('kapağı', 3, rng(seed));
    assert.equal(pool.length, 9);
    for (const ch of 'KAPAĞI') assert.ok(pool.includes(ch));
    assert.notEqual(pool.slice(0, 6).join(''), 'KAPAĞI');
    assert.ok(pool.every(ch => /^[A-ZÇĞİÖŞÜ]$/.test(ch)));
  }
  assert.deepEqual([...letterPool('İĞNE', 'xy', rng(1))].sort(), ['E', 'N', 'X', 'Y', 'Ğ', 'İ'].sort());
  assert.deepEqual(letterPool('AA', 0, rng(1)), ['A', 'A']);
});

test('choices = answer + distractors, deterministic', () => {
  const link = level.chain[1];
  const out = choices(link, rng(3));
  assert.deepEqual([...out].sort(), [link.word, ...link.distractors].sort());
  assert.deepEqual(choices(link, rng(3)), out);
  assert.deepEqual(choices({ word: 'X' }, rng(1)), ['X']);
});

test('choices caps at n (default 8) and always keeps the answer', () => {
  const many = { word: 'KAPAĞI', distractors: ['KABI', 'KASASI', 'KALIBI', 'KILIFI', 'KUTUSU', 'KONUSU', 'KÖŞESİ', 'KAĞIDI', 'KIYISI', 'KAPAĞI'] };
  for (let seed = 0; seed < 50; seed++) {
    const out = choices(many, rng(seed));
    assert.equal(out.length, 8);
    assert.ok(out.includes('KAPAĞI'));
    assert.equal(new Set(out).size, 8);
    assert.ok(out.every(w => w === 'KAPAĞI' || many.distractors.includes(w)));
  }
  assert.equal(choices(many, rng(1), 4).length, 4);
  assert.equal(choices(level.chain[1], rng(1), 8).length, 4); // only 3 distractors: all of them
});

test('a full run with mistakes, never mutating state', () => {
  let state = deepFreeze(createRun(level, { seed: 5 }));
  assert.deepEqual(state.found, ['KİTAP']);
  assert.deepEqual(current(state), { prev: level.chain[0], target: level.chain[1], index: 1, total: 10,
    revealed: 1, clue: false, given: 'K', pattern: 'K_____' });
  let r = answer(state, 'kapısı');
  assert.equal(r.result.ok, false);
  assert.equal(r.state.mistakes, 1);
  assert.equal(state.mistakes, 0);
  state = deepFreeze(r.state);
  r = answer(state, ' kapağı ');
  assert.deepEqual(r.result, { ok: true, word: 'KAPAĞI', base: 'KAPAK', phrase: 'kitap kapağı', done: false });
  state = deepFreeze(r.state);
  r = answer(state, 'Kapak Tasarımı'); // whole phrase is accepted too
  assert.equal(r.result.ok, true);
  state = r.state;
  for (const link of level.chain.slice(3)) {
    r = answer(deepFreeze(state), trLower(link.word));
    assert.equal(r.result.ok, true, link.word);
    state = r.state;
  }
  assert.equal(r.result.done, true);
  assert.equal(state.done, true);
  assert.equal(current(state), null);
  assert.deepEqual(state.found, level.chain.map(l => l.word));
  assert.equal(state.mistakes, 1);
  const after = answer(state, 'X');
  assert.equal(after.state, state);
  assert.equal(after.result.done, true);
});

test('state survives a JSON round trip', () => {
  let state = createRun(level, { seed: 'abc' });
  state = answer(state, 'KAPAĞI').state;
  state = useHint(state, 'letter').state;
  const back = JSON.parse(JSON.stringify(state));
  assert.deepEqual(back, state);
  assert.equal(answer(back, 'TASARIMI').result.ok, true);
  assert.deepEqual(choices(current(back).target, linkRand(back)), choices(current(state).target, linkRand(state)));
});

test('the first letter is given; letter hints go on from the second, never the whole word', () => {
  let state = createRun(level);
  assert.equal(current(state).given, 'K');
  assert.equal(current(state).pattern, 'K_____');
  let r;
  for (let i = 2; i <= 5; i++) {
    r = useHint(state, 'letter');
    state = r.state;
    assert.equal(r.reveal.count, i);
    assert.equal(r.reveal.index, i - 1);
    assert.equal(r.reveal.letter, 'KAPAĞI'[i - 1]);
    assert.equal(r.reveal.letters, 'KAPAĞI'.slice(0, i));
    assert.equal(r.reveal.fresh, true);
  }
  assert.equal(r.reveal.pattern, 'KAPAĞ_');
  assert.equal(current(state).pattern, 'KAPAĞ_');
  r = useHint(state, 'letter');
  assert.equal(r.reveal.fresh, false);
  assert.equal(r.state, state);
  assert.equal(state.hints, 4);
  state = answer(state, 'KAPAĞI').state;
  assert.equal(current(state).revealed, 1);
  assert.equal(current(state).pattern, 'T_______');
  assert.equal(state.hints, 4);
});

test('a two-letter target gets no letter hints beyond the given one', () => {
  const tiny = { id: 99, chain: [{ word: 'KOL', base: 'KOL' }, { word: 'AY', base: 'AY', phrase: 'kol ay' }] };
  const r = useHint(createRun(tiny), 'letter');
  assert.equal(r.reveal.fresh, false);
  assert.equal(r.reveal.letter, 'A');
});

test('clue hint shows the hint text once', () => {
  let state = createRun(level);
  const r = useHint(state, 'clue');
  assert.deepEqual(r.reveal, { kind: 'clue', fresh: true, text: 'Kitabın en dış yüzü' });
  assert.equal(r.state.hints, 1);
  assert.equal(useHint(r.state, 'clue').reveal.fresh, false);
  assert.equal(useHint(r.state, 'clue').state.hints, 1);
  assert.throws(() => useHint(state, 'nope'), /Unknown hint/);
  assert.equal(useHint(answer(state, 'x').state, 'clue').reveal.text, 'Kitabın en dış yüzü');
});

test('linkRand differs per link but is stable', () => {
  const s = createRun(level, { seed: 9 });
  const s2 = answer(s, 'KAPAĞI').state;
  assert.equal(linkRand(s)(), linkRand(s)());
  assert.notEqual(linkRand(s)(), linkRand(s2)());
});

test('every level in levels.js plays through with the core', async () => {
  let LEVELS;
  try { ({ LEVELS } = await import('../levels.js')); } catch { return; }
  for (const lvl of LEVELS) {
    validateLevel(lvl);
    let state = createRun(lvl, { seed: lvl.id });
    for (const link of lvl.chain.slice(1)) {
      assert.equal(choices(link, linkRand(state)).includes(link.word), true);
      const r = answer(state, link.word);
      assert.equal(r.result.ok, true, `${lvl.id} ${link.word}`);
      state = r.state;
    }
    assert.equal(state.done, true);
  }
});

test('suffixSplit: the common prefix stays, the suffix drops, the base ending comes in', () => {
  assert.deepEqual(suffixSplit('BAHÇESİ', 'BAHÇE'), { keep: 'BAHÇE', drop: 'Sİ', add: '' });
  assert.deepEqual(suffixSplit('KAPAĞI', 'KAPAK'), { keep: 'KAPA', drop: 'ĞI', add: 'K' });
  assert.deepEqual(suffixSplit('KAYDI', 'KAYIT'), { keep: 'KAY', drop: 'DI', add: 'IT' });
  assert.deepEqual(suffixSplit('HACMİ', 'HACİM'), { keep: 'HAC', drop: 'Mİ', add: 'İM' });
  assert.deepEqual(suffixSplit('KİTAP', 'KİTAP'), { keep: 'KİTAP', drop: '', add: '' });
  assert.deepEqual(suffixSplit('KİTAP'), { keep: 'KİTAP', drop: '', add: '' });
});

test('suffixSplit holds for every link in levels.js', async () => {
  let LEVELS;
  try { ({ LEVELS } = await import('../levels.js')); } catch { return; }
  let links = 0, plain = 0;
  for (const lvl of LEVELS) {
    for (const link of lvl.chain.slice(1)) {
      const { keep, drop, add } = suffixSplit(link.word, link.base);
      assert.equal(keep + drop, link.word, link.word);
      assert.equal(keep + add, link.base, link.word);
      assert.ok(keep.length > 0, `${link.word} keeps nothing of ${link.base}`);
      links++;
      if (!add) plain++;
    }
  }
  assert.ok(links > 0);
  assert.ok(plain > 0 && plain < links);
});
