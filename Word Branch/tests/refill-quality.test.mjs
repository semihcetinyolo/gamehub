import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVEL_SETS } from '../levels.js';
import { createGame, findSolutions, submit } from '../logic.js';

function canSpell(suffix, texts) {
  if (!suffix) return true;
  return texts.some((text, i) => suffix.startsWith(text) &&
    canSpell(suffix.slice(text.length), texts.filter((_, j) => j !== i)));
}

// Independent feasibility oracle: enumerate spellings, then use the maximum
// available survivor count for each chunk. Replacing a survivor with a fresh
// duplicate can never improve the no-new-only condition.
function safeRefillPossible(before, usedIds, after) {
  const suffixes = after.rows.map(row => row.word.slice(after.root.length));
  const survivors = before.wheel.filter(node => node && !usedIds.includes(node.id) && !suffixes.includes(node.text));
  const chunks = [...new Set([...Object.values(before._meta.parts).flat(), ...survivors.map(n => n.text)])].filter(text => !suffixes.includes(text));
  for (const suffix of suffixes) {
    function search(rest, spelling) {
      if (spelling.length > before.wheel.length) return false;
      if (!rest) {
        const available = survivors.map(node => node.text);
        const fresh = [];
        for (const text of spelling) {
          const index = available.indexOf(text);
          if (index < 0) fresh.push(text);
          else available.splice(index, 1);
        }
        return fresh.length < spelling.length && !suffixes.some(word => canSpell(word, fresh));
      }
      return chunks.some(text => rest.startsWith(text) && search(rest.slice(text.length), [...spelling, text]));
    }
    if (search(suffix, [])) return true;
  }
  return false;
}

function adjacent(state, wheel = state.wheel) {
  return state.rows.some(row => {
    const suffix = row.word.slice(state.root.length);
    return wheel.some((_, start) => [1, -1].some(direction => {
      let text = '';
      for (let n = 0; n < wheel.length; n++) {
        const node = wheel[(start + direction * n + wheel.length) % wheel.length];
        if (!node) return false;
        text += node.text;
        if (text === suffix) return true;
        if (!suffix.startsWith(text)) return false;
      }
      return false;
    }));
  });
}

function separatedPermutationExists(state) {
  if (state.rows.some(row => state.wheel.some(node => node?.text === row.word.slice(state.root.length)))) return false;
  const pool = [...state.wheel];
  const prefix = [pool.shift()]; // rotation does not affect adjacency
  function search() {
    if (!pool.length) return !adjacent(state, prefix);
    const tried = new Set();
    for (let i = 0; i < pool.length; i++) {
      const text = pool[i]?.text ?? null;
      if (tried.has(text)) continue;
      tried.add(text);
      const [node] = pool.splice(i, 1);
      prefix.push(node);
      const ok = search();
      prefix.pop();
      pool.splice(i, 0, node);
      if (ok) return true;
    }
    return false;
  }
  return search();
}

for (const [language, levels] of Object.entries(LEVEL_SETS)) {
  test(`${language}: refill quality over all levels, 30 seeds and 24 row/slot configurations`, t => {
    const stats = [];
    for (const visibleRows of [1, 2, 4, 6]) {
      for (const wheelSlots of [3, 4, 5, 6, 7, 8]) {
        const result = { rows: visibleRows, slots: wheelSlots, games: 0, refills: 0,
          newOnly: 0, avoidable: 0, initialAdjacent: 0, initialAvoidable: 0 };
        for (const level of levels) {
          for (let seed = 0; seed < 30; seed++) {
            let state = createGame(level, { seed, visibleRows, wheelSlots });
            result.games++;
            assert.ok(!state.rows.some(row => state.wheel.some(n => n?.text === row.word.slice(state.root.length))));
            if (adjacent(state)) {
              result.initialAdjacent++;
              if (separatedPermutationExists(state)) result.initialAvoidable++;
            }
            let step = 0;
            while (!state.done) {
              const solutions = findSolutions(state);
              assert.ok(solutions.length, 'always playable');
              const picked = solutions[(seed + step * 7) % solutions.length];
              const outcome = submit(state, picked.nodeIds);
              assert.ok(outcome.result.ok);
              const next = outcome.state;
              if (!next.done) {
                result.refills++;
                assert.ok(!next.rows.some(row => next.wheel.some(n => n?.text === row.word.slice(next.root.length))), 'no whole-suffix nodes');
                assert.ok(findSolutions(next).length);
                const added = new Set(outcome.result.addedNodeIds);
                const fresh = next.wheel.filter(node => node && added.has(node.id)).map(node => node.text);
                if (next.rows.some(row => canSpell(row.word.slice(next.root.length), fresh))) {
                  result.newOnly++;
                  if (safeRefillPossible(state, picked.nodeIds, next)) result.avoidable++;
                }
              }
              assert.ok(++step <= level.words.length);
              state = next;
            }
          }
        }
        stats.push(result);
        assert.equal(result.avoidable, 0, `avoidable new-only solutions: ${JSON.stringify(result)}`);
        assert.equal(result.initialAvoidable, 0, `avoidable initial adjacency: ${JSON.stringify(result)}`);
      }
    }
    t.diagnostic(JSON.stringify({ language, stats }));
  });
}

test('refill retains a partial next word instead of supplying its entire fresh answer', () => {
  const level = { root: 'X', words: [
    { word: 'XAB', parts: ['A', 'B'] },
    { word: 'XCD', parts: ['C', 'D'] },
    { word: 'XEF', parts: ['E', 'F'] },
  ] };
  let state = createGame(level, { visibleRows: 1, wheelSlots: 3, seed: 4 });
  while (!state.done) {
    const next = submit(state, findSolutions(state)[0].nodeIds);
    if (!next.state.done) {
      const added = new Set(next.result.addedNodeIds);
      assert.equal(findSolutions({ ...next.state, wheel: next.state.wheel.map(n => n && added.has(n.id) ? n : null) }).length, 0);
    }
    state = next.state;
  }
});
