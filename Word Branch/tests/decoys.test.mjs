import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVEL_SETS } from '../levels.js';
import { createGame, submit, findSolutions } from '../logic.js';

const poolFor = (levels, skip) => levels.filter((_, i) => i !== skip).flatMap(level => level.words.flatMap(w => w.parts));

function playThrough(level, opts) {
  let state = createGame(level, opts);
  const remainders = level.words.map(w => w.word.slice(level.root.length));
  const decoyTexts = () => state.wheel.filter(n => n && state._meta.decoyIds.includes(n.id)).map(n => n.text);
  let steps = 0;
  while (!state.done) {
    assert.equal(state.wheel.length, opts.wheelSlots + opts.decoys, 'ring size is real slots plus decoys');
    const decoys = decoyTexts();
    assert.equal(decoys.length, opts.decoys);
    assert.equal(new Set(decoys).size, decoys.length, 'decoy texts are distinct');
    for (const text of decoys) assert.ok(!remainders.some(rest => rest.includes(text)), `${text} fits no target`);
    const solutions = findSolutions(state);
    assert.ok(solutions.length, 'a visible word is always completable');
    for (const s of solutions) assert.ok(s.nodeIds.every(id => !state._meta.decoyIds.includes(id)));
    const before = new Set(state._meta.decoyIds);
    const out = submit(state, solutions[0].nodeIds);
    assert.ok(out.result.ok);
    state = out.state;
    if (!state.done) assert.ok(state._meta.decoyIds.every(id => !before.has(id)), 'decoys change after a found word');
    assert.ok(++steps <= level.words.length);
  }
}

for (const [lang, levels] of Object.entries(LEVEL_SETS)) {
  test(`${lang}: decoys never fit a target and games still complete`, () => {
    levels.forEach((level, i) => {
      for (const seed of [1, 7, 42]) {
        playThrough(level, { visibleRows: 4, wheelSlots: 5, decoys: 2, seed, decoyPool: poolFor(levels, i) });
        playThrough(level, { visibleRows: 2, wheelSlots: 6, decoys: 3, seed, decoyPool: poolFor(levels, i) });
      }
    });
  });
}

test('without a pool, decoys are built from the level letters', () => {
  const level = LEVEL_SETS.en[0];
  playThrough(level, { visibleRows: 4, wheelSlots: 5, decoys: 2, seed: 3 });
});

test('a fixed seed gives the same decoys', () => {
  const level = LEVEL_SETS.tr[0];
  const opts = { wheelSlots: 5, decoys: 2, seed: 9, decoyPool: poolFor(LEVEL_SETS.tr, 0) };
  assert.deepEqual(createGame(level, opts).wheel, createGame(level, opts).wheel);
});
