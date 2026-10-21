import test from 'node:test';
import assert from 'node:assert/strict';
import * as levelData from '../levels.js';
const { LEVELS } = levelData;
// The level author can add language sets without changing this test matrix.
const LEVEL_SETS = levelData.LEVEL_SETS ?? { en: LEVELS };
import { DEFAULTS, validateLevel, createGame, submit, findSolutions, wordOf, shuffleWheel } from '../logic.js';

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    Object.values(value).forEach(freeze);
  }
  return value;
}

function invariant(state, slots, rows) {
  assert.equal(state.wheel.length, slots);
  assert.ok(state.rows.length <= rows);
  assert.equal(state.found.length + state.rows.length + state.queue.length, state.total);
  assert.equal(new Set([...state.found, ...state.rows.map(r => r.word), ...state.queue]).size, state.total);
  const nodes = state.wheel.filter(Boolean);
  assert.equal(new Set(nodes.map(n => n.id)).size, nodes.length);
  assert.equal(new Set(state.rows.map(r => r.id)).size, state.rows.length);
  for (const row of state.rows) assert.equal(row.suffixLength, row.word.length - state.root.length);
  const solutions = findSolutions(state);
  if (!state.done) assert.ok(solutions.length > 0, 'There must always be a playable row');
  for (const solution of solutions) {
    assert.equal(new Set(solution.nodeIds).size, solution.nodeIds.length);
    assert.equal(wordOf(state, solution.nodeIds), state.rows.find(r => r.id === solution.rowId).word);
  }
  return solutions;
}

for (const [language, levels] of Object.entries(LEVEL_SETS)) {
for (const level of levels) {
  for (const [visibleRows, wheelSlots] of [[4, 5], [4, 7], [1, 3], [2, 4], [14, 12]]) {
    test(`${language} level ${level.id}: 250 full games, rows=${visibleRows}, slots=${wheelSlots}`, () => {
      for (let seed = 0; seed < 250; seed++) {
        let state = createGame(level, { seed, visibleRows, wheelSlots });
        const everNodes = new Set(state.wheel.filter(Boolean).map(n => n.id));
        const everRows = new Set(state.rows.map(r => r.id));
        let steps = 0;
        while (!state.done) {
          const solutions = invariant(state, wheelSlots, visibleRows);
          const selected = solutions[(seed + steps * 7) % solutions.length];
          const old = freeze(state);
          const before = JSON.stringify(old);
          const { state: next, result } = submit(old, selected.nodeIds);
          assert.equal(JSON.stringify(old), before);
          assert.ok(result.ok);
          assert.deepEqual(result.usedNodeIds, selected.nodeIds);
          const previous = new Set(old.wheel.filter(Boolean).map(n => n.id));
          const added = next.wheel.filter(n => n && !previous.has(n.id)).map(n => n.id);
          assert.deepEqual(result.addedNodeIds, added);
          for (const id of added) { assert.ok(!everNodes.has(id), 'node id never recycled'); everNodes.add(id); }
          for (let i = 0; i < next.wheel.length; i++) {
            const node = next.wheel[i];
            if (node && previous.has(node.id)) assert.deepEqual(node, old.wheel[i], 'surviving nodes keep their slot');
          }
          if (result.addedRowId) { assert.ok(!everRows.has(result.addedRowId)); everRows.add(result.addedRowId); }
          assert.deepEqual(next.rows.slice(0, old.rows.length - 1), old.rows.filter(r => r.id !== result.rowId));
          state = JSON.parse(JSON.stringify(next));
          invariant(state, wheelSlots, visibleRows);
          assert.ok(++steps <= level.words.length);
        }
        assert.equal(steps, level.words.length);
        assert.deepEqual([...state.found].sort(), level.words.map(w => w.word).sort());
        assert.deepEqual(state.rows, []);
        assert.deepEqual(state.queue, []);
      }
    });
  }
}

}

test('authored levels and validation errors', () => {
  assert.ok(LEVELS.length >= 3);
  for (const level of Object.values(LEVEL_SETS).flat()) { validateLevel(level); assert.ok(level.words.length >= 8 && level.words.length <= 14); }
  for (const opts of [{ wheelSlots: 2 }, { visibleRows: 0 }, { wheelSlots: 3.5 }, { visibleRows: NaN }]) {
    assert.throws(() => validateLevel(LEVELS[0], opts));
  }
  assert.throws(() => validateLevel({ root: 'snow', words: [] }), /root/);
  assert.throws(() => validateLevel({ root: 'X', words: [] }), /nonempty/);
  assert.throws(() => validateLevel({ root: 'X', words: [{ word: 'XA', parts: ['TOOLONG'] }] }), /1–3/);
  assert.throws(() => validateLevel({ root: 'X', words: [{ word: 'XBB', parts: ['A', 'B'] }] }), /spell/);
  assert.throws(() => validateLevel({ root: 'X', words: [{ word: 'XAB', parts: ['A', 'B'] }, { word: 'XAB', parts: ['A', 'B'] }] }), /Duplicate/);
  assert.throws(() => validateLevel({ root: 'X', words: [{ word: 'XAB', parts: ['AB'] }] }), /at least 2/);
  assert.deepEqual(DEFAULTS, { visibleRows: 4, wheelSlots: 5, decoys: 0 });
});

test('wrong answers preserve state identity and contents', () => {
  const state = freeze(createGame(LEVELS[0]));
  const id = state.wheel.find(Boolean).id;
  for (const [ids, reason] of [[[], 'too-short'], [[id, id], 'duplicate-node'], [['missing'], 'unknown-node'], [[id], 'not-a-target']]) {
    assert.deepEqual(submit(state, ids), { state, result: { ok: false, reason } });
    assert.equal(submit(state, ids).state, state);
  }
  assert.equal(wordOf(state, []), 'SNOW');
});

test('deterministic seeds, varied placement, and JSON-restored continuation', () => {
  const a = createGame(LEVELS[0], { seed: 42 });
  assert.deepEqual(a, createGame(LEVELS[0], { seed: 42 }));
  assert.notDeepEqual(a.wheel, createGame(LEVELS[0], { seed: 43 }).wheel);
  const ids = findSolutions(a)[0].nodeIds;
  assert.deepEqual(submit(a, ids), submit(JSON.parse(JSON.stringify(a)), ids));
  const level = JSON.parse(JSON.stringify(LEVELS[0]));
  const detached = createGame(level, { seed: 42 });
  level.words[0].parts[0] = 'XX';
  assert.deepEqual(detached, a);
});

test('duplicate texts have distinct ids, including two LL nodes', () => {
  const state = createGame(LEVELS[0], { wheelSlots: 9 });
  const copies = state.wheel.filter(n => n?.text === 'LL');
  assert.equal(copies.length, 2);
  assert.notEqual(copies[0].id, copies[1].id);
  const repeated = createGame({ root: 'X', words: [{ word: 'XAAAA', parts: ['AA', 'AA'] }] });
  const solution = findSolutions(repeated)[0];
  assert.equal(solution.nodeIds.length, 2);
  assert.equal(submit(repeated, solution.nodeIds).state.done, true);
});

test('alternate authored splits count by spelling', () => {
  const state = createGame({ root: 'X', words: [
    { word: 'XAB', parts: ['A', 'B'] }, { word: 'XABC', parts: ['AB', 'C'] },
  ] });
  // Deliberate legacy/alternate wheel: initial generation now avoids whole-suffix tiles.
  const ab = { id: `n${state._meta.nextNode++}`, text: 'AB' };
  state.wheel[state.wheel.findIndex(n => n === null)] = ab;
  const outcome = submit(state, [ab.id]);
  assert.equal(outcome.result.word, 'XAB');
  assert.ok(outcome.result.ok);
  invariant(outcome.state, DEFAULTS.wheelSlots, DEFAULTS.visibleRows);
});

for (const text of ['Z', 'C']) {
  test(`eviction repairs alternate split with surplus ${text} nodes`, () => {
    const state = createGame({ root: 'X', words: [
      { word: 'XAB', parts: ['A', 'B'] }, { word: 'XCDE', parts: ['C', 'D', 'E'] },
    ] }, { wheelSlots: 4 });
    // A valid wheel reachable through alternate splits in larger vocabularies:
    // one-node answer frees less space than the next target needs.
    state.wheel = ['AB', text, text, text].map((part, i) => ({ id: `n${i + 1}`, text: part }));
    state._meta.nextNode = 5;
    const next = submit(freeze(state), ['n1']);
    assert.ok(next.result.ok);
    assert.ok(next.state.wheel.filter(Boolean).some(n => !['n1', 'n2', 'n3', 'n4'].includes(n.id)));
    assert.ok(state.wheel.slice(1).some(n => !next.state.wheel.some(x => x?.id === n.id)), 'surplus was evicted');
    const solution = invariant(next.state, 4, 4)[0];
    assert.equal(submit(next.state, solution.nodeIds).state.done, true);
  });
}

test('near the end only useful authored parts are added', () => {
  const state = createGame({ root: 'X', words: [{ word: 'XYZ', parts: ['Y', 'Z'] }] });
  assert.equal(state.wheel.filter(Boolean).length, 2);
  assert.equal(submit(state, findSolutions(state)[0].nodeIds).state.done, true);
});


test('Turkish uppercase roots and İ/Ş/Ğ parts validate and play to completion', () => {
  const level = { root: 'İŞ', words: [
    { word: 'İŞÇİ', parts: ['Ç', 'İ'] },
    { word: 'İŞLEYİŞ', parts: ['LE', 'Yİ', 'Ş'] },
    { word: 'İŞÇİLİĞİ', parts: ['Çİ', 'Lİ', 'Ğİ'] },
  ] };
  validateLevel(level);
  for (let seed = 0; seed < 100; seed++) {
    let state = createGame(level, { seed, visibleRows: 2, wheelSlots: 3 });
    while (!state.done) {
      const solutions = invariant(state, 3, 2);
      const chosen = solutions[seed % solutions.length];
      const outcome = submit(freeze(state), chosen.nodeIds);
      assert.ok(outcome.result.ok);
      assert.equal(outcome.result.word, wordOf(state, chosen.nodeIds));
      state = outcome.state;
      invariant(state, 3, 2);
    }
    assert.deepEqual([...state.found].sort(), level.words.map(word => word.word).sort());
  }
  for (const root of ['Ç', 'Ğ', 'İ', 'Ö', 'Ş', 'Ü', 'I']) {
    validateLevel({ root, words: [{ word: root + 'ÇĞİÖŞÜ', parts: ['ÇĞİ', 'ÖŞÜ'] }] });
  }
  for (const letter of ['i', 'ı', 'ş', 'ğ', 'ü', 'ö', 'ç', 'É']) {
    assert.throws(() => validateLevel({ root: letter, words: [{ word: letter + 'A', parts: ['A'] }] }), /root/);
    assert.throws(() => validateLevel({ root: 'İŞ', words: [{ word: 'İŞ' + letter, parts: [letter] }] }), /uppercase/);
  }
});


test('shuffle is pure, deterministic, preserves targets and solutions, and never keeps 2+ nodes in place', () => {
  for (const levels of Object.values(LEVEL_SETS)) {
    for (const level of levels) {
      for (let seed = 0; seed < 50; seed++) {
        const state = freeze(createGame(level, { seed }));
        const before = JSON.stringify(state);
        const next = shuffleWheel(state);
        assert.notEqual(next, state);
        assert.equal(JSON.stringify(state), before);
        assert.deepEqual(next, shuffleWheel(JSON.parse(before)));
        const { wheel: ignoredWheel, _meta: ignoredMeta, ...fields } = state;
        const { wheel: newWheel, _meta: newMeta, ...nextFields } = next;
        assert.deepEqual(nextFields, fields);
        assert.deepEqual({ ...newMeta, rng: ignoredMeta.rng }, ignoredMeta);
        assert.notEqual(newMeta.rng, ignoredMeta.rng);
        assert.deepEqual(newWheel.filter(Boolean).sort((a,b)=>a.id.localeCompare(b.id)),
          state.wheel.filter(Boolean).sort((a,b)=>a.id.localeCompare(b.id)));
        assert.equal(newWheel.filter(n=>n===null).length, state.wheel.filter(n=>n===null).length);
        assert.notDeepEqual(next.wheel, state.wheel);
        const solutions = invariant(next, DEFAULTS.wheelSlots, DEFAULTS.visibleRows);
        assert.deepEqual(solutions.map(s=>s.rowId), findSolutions(state).map(s=>s.rowId));
        assert.ok(submit(next, solutions[0].nodeIds).result.ok);
      }
    }
  }
});

test('shuffle handles sparse, duplicate-text, one-node, and completed wheels', () => {
  const level = { root: 'X', words: [{ word: 'XAAAA', parts: ['AA', 'AA'] }] };
  const layouts = new Set();
  for (let seed = 0; seed < 100; seed++) {
    for (const wheelSlots of [2, 5, 7]) {
      const state = freeze(createGame(level, { seed, wheelSlots }));
      const next = shuffleWheel(state);
      assert.notDeepEqual(next.wheel, state.wheel, 'even a two-node identity draw must move');
      invariant(next, wheelSlots, 4);
      layouts.add(next.wheel.map(n=>n?.id ?? '_').join(','));
    }
  }
  assert.ok(layouts.size > 2, 'seeds vary sparse slot placements');
  const single = createGame({ root: 'X', words: [{ word: 'XAB', parts: ['A', 'B'] }] });
  // A restored alternate wheel can still contain a single node.
  single.wheel = [{ id: `n${single._meta.nextNode++}`, text: 'AB' }, ...Array(DEFAULTS.wheelSlots - 1).fill(null)];
  invariant(shuffleWheel(freeze(single)), DEFAULTS.wheelSlots, DEFAULTS.visibleRows);
  const done = freeze(submit(single, findSolutions(single)[0].nodeIds).state);
  const shuffledDone = shuffleWheel(done);
  assert.equal(shuffledDone.done, true);
  assert.deepEqual(shuffledDone.wheel, done.wheel);
  assert.deepEqual(shuffledDone.found, done.found);
});

test('open compounds validate and expose boolean row flags without changing spelling or gameplay', () => {
  const level = { root: 'YER', words: [
    { word: 'YERLEŞİM', parts: ['LE', 'ŞİM'] },
    { word: 'YERÇEKİMİ', parts: ['ÇE', 'Kİ', 'Mİ'], open: true },
    { word: 'YERLEŞKE', parts: ['LE', 'ŞKE'], open: false },
  ] };
  validateLevel(level);
  for (const open of [null, 'true', 1, {}, []]) {
    assert.throws(() => validateLevel({ ...level, words: [{ ...level.words[0], open }] }), /open must be a boolean/);
  }
  const config = { visibleRows: 1, seed: 42 };
  let state = createGame(level, config);
  const closed = createGame({ ...level, words: level.words.map(word => ({ ...word, open: false })) }, config);
  assert.deepEqual(state.wheel, closed.wheel, 'display metadata does not affect initial generation');
  assert.equal(state.rows[0].open, false);
  // Metadata is copied from input and survives serialisation and queue promotion.
  level.words[1].open = false;
  const expected = [false, true, false];
  for (let i = 0; i < expected.length; i++) {
    assert.equal(state.rows[0].open, expected[i]);
    assert.equal(state.rows[0].suffixLength, level.words[i].parts.join('').length);
    const solution = findSolutions(state)[0];
    assert.equal(wordOf(state, solution.nodeIds), level.words[i].word);
    const outcome = submit(freeze(state), solution.nodeIds);
    assert.equal(outcome.result.word, level.words[i].word);
    assert.ok(outcome.result.ok);
    state = JSON.parse(JSON.stringify(outcome.state));
  }
  assert.equal(state.done, true);
  assert.deepEqual(state.found, level.words.map(word => word.word));
});
