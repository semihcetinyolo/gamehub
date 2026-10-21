// v4 "Ray Çiz" honeycomb board: neighbours, whole-board generation and the gravity refill guarantee.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../levels.js';
import { rng } from '../core/logic.js';
import {
  CELLS, GEOMETRY, ROWS, adjacent, buildBoard, centerOf, findPaths, neighbours, refill, rowOf, runIn,
} from '../v4/board.js';

const spells = (board, word) => {
  const p = board.solutionPath;
  return p.length === Array.from(word).length && new Set(p).size === p.length
    && p.every((id, i) => i === 0 || adjacent(p[i - 1], id))
    && p.map((id) => board.cells[id].letter).join('') === word;
};

const withinCap = (cells, word) => {
  const inWord = {};
  for (const ch of word) inWord[ch] = (inWord[ch] ?? 0) + 1;
  const seen = {};
  for (const c of cells) seen[c.letter] = (seen[c.letter] ?? 0) + 1;
  return Object.entries(seen).every(([ch, n]) => n <= ((inWord[ch] ?? 0) > 2 ? inWord[ch] + 2 : 4));
};

test('neighbours are symmetric and exactly the stones one step apart', () => {
  for (let a = 0; a < CELLS; a++) {
    for (let b = 0; b < CELLS; b++) {
      if (a === b) continue;
      const A = centerOf(a), B = centerOf(b);
      const near = Math.hypot(A.x - B.x, A.y - B.y) < GEOMETRY.yStep * 1.05;
      assert.equal(adjacent(a, b), near, `${a}-${b}`);
      assert.equal(adjacent(a, b), adjacent(b, a));
    }
    assert.ok(neighbours(a).length <= 6);
  }
});

test('every level word gets a valid board, same seed same board, letter caps hold', () => {
  for (const seed of [1, 2, 3, 'x', 99]) {
    LEVELS.forEach((level, li) => level.chain.slice(1).forEach((link, k) => {
      const board = buildBoard(link.word, { levelNo: li + 1, rand: rng(`${seed}:${level.id}:${k}`) });
      assert.equal(board.cells.length, CELLS);
      assert.ok(spells(board, link.word), `${level.id} ${link.word}`);
      assert.ok(withinCap(board.cells, link.word), `cap ${level.id} ${link.word}`);
    }));
  }
  const a = buildBoard('TASARIMI', { levelNo: 6, rand: rng('same') });
  const b = buildBoard('TASARIMI', { levelNo: 6, rand: rng('same') });
  assert.deepEqual(a, b);
});

test('gravity refill never leaves a level unsolvable and rarely rebuilds the board', () => {
  let refills = 0, full = 0;
  LEVELS.forEach((level, li) => {
    for (let seed = 0; seed < 10; seed++) {
      const words = level.chain.slice(1).map((l) => l.word);
      let board = buildBoard(words[0], { levelNo: li + 1, rand: rng(`${seed}:${level.id}:1`), ahead: words[1] });
      for (let k = 1; k < words.length; k++) {
        const paths = findPaths(board.cells, words[k - 1], 5);
        const used = paths[(seed + k) % paths.length];
        const r = refill(board, used, words[k], rng(`${seed}:${level.id}:${k + 1}`), li + 1, { ahead: words[k + 1] });
        refills++;
        if (r.fullReset) full++;
        board = { ...r.board, solutionPath: r.solutionPath };
        assert.ok(spells(board, words[k]), `${level.id} ${words[k]}`);
        assert.equal(new Set(board.cells.map((c) => c.key)).size, CELLS, 'stone keys stay unique');
        assert.ok(r.changedCells.length <= 3);
        if (!r.fullReset) {
          assert.ok(withinCap(r.newCells.map((id) => board.cells[id]), words[k]));
          // survivors only move down their own column
          for (const m of r.moves) assert.ok(m.to % 5 === m.from % 5 && m.to > m.from);
        }
      }
    }
  });
  assert.ok(full / refills < 0.02, `full resets ${full}/${refills}`);
});

// Plays every level's chain through gravity refills: mostly along the planned path, sometimes another valid
// one (the plan for the next word breaks then). visit(round) for every refill that is not a full reset.
function playRefills(seeds, visit) {
  let full = 0, rounds = 0;
  LEVELS.forEach((level, li) => {
    for (let seed = 0; seed < seeds; seed++) {
      const words = level.chain.slice(1).map((l) => l.word);
      let board = buildBoard(words[0], { levelNo: li + 1, rand: rng(`t${seed}:${level.id}:1`), ahead: words[1] });
      for (let k = 1; k < words.length; k++) {
        const paths = findPaths(board.cells, words[k - 1], 5);
        const used = (seed + k) % 4 ? board.solutionPath : paths[(seed + k) % paths.length];
        const r = refill(board, used, words[k], rng(`t${seed}:${level.id}:${k + 1}`), li + 1, { ahead: words[k + 1] });
        board = { ...r.board, solutionPath: r.solutionPath };
        assert.ok(spells(board, words[k]), `${level.id} ${words[k]}`);
        if (r.fullReset) { full++; continue; }
        rounds++;
        visit({ levelNo: li + 1, word: words[k], board, r, label: `${level.id} ${words[k]}` });
      }
    }
  });
  assert.ok(full / (rounds + full) < 0.005, `full resets ${full}/${rounds + full}`);
  return rounds;
}

test('new stones never give the next answer away', () => {
  let onFresh = 0, firstFresh = 0, changed = 0;
  const rounds = playRefills(20, ({ levelNo, word, board, r, label }) => {
    const fresh = new Set(r.newCells);
    const marks = r.solutionPath.map((id) => fresh.has(id));
    assert.ok(marks.filter(Boolean).length <= (levelNo <= 2 ? 1 : 2), `${label}: too many letters on new stones`);
    assert.ok(marks.every((m, i) => !(m && marks[i - 1])), `${label}: two path letters in a row on new stones`);
    assert.deepEqual(runIn(board.cells, r.newCells, word), [], `${label}: 3 answer letters in a row on new stones`);
    onFresh += marks.filter(Boolean).length / marks.length;
    if (marks[0]) firstFresh++;
    changed += r.changedCells.length;
  });
  assert.ok(onFresh / rounds <= 0.2, `answer on new stones ${(100 * onFresh / rounds).toFixed(1)}%`);
  assert.ok(firstFresh / rounds < 0.02, `first letter on a new stone ${firstFresh}/${rounds}`);
  assert.ok(changed / rounds <= 0.5, `changed old stones ${(changed / rounds).toFixed(2)} per round`);
});

test('answers spread over every row of the board, not just under the new stones', () => {
  const cells = Array(ROWS).fill(0), firsts = Array(ROWS).fill(0);
  const rounds = playRefills(20, ({ r }) => {
    for (const id of r.solutionPath) cells[rowOf(id)]++;
    firsts[rowOf(r.solutionPath[0])]++;
  });
  const total = cells.reduce((a, b) => a + b, 0);
  const share = (n, of) => `${(100 * n / of).toFixed(0)}%`;
  const msg = `rows ${cells.map((n) => share(n, total)).join(' ')}, first letters ${firsts.map((n) => share(n, rounds)).join(' ')}`;
  cells.forEach((n) => assert.ok(n / total >= 0.11 && n / total <= 0.23, msg));
  assert.ok(cells[ROWS - 1] / total >= 0.1, msg);
  firsts.forEach((n) => assert.ok(n / rounds >= 0.08 && n / rounds <= 0.26, msg));
});

test('refill is deterministic', () => {
  const start = buildBoard('KAPAĞI', { levelNo: 3, rand: rng('d') });
  const one = refill(start, start.solutionPath, 'TASARIMI', rng('d2'), 3, { ahead: 'EKİBİ' });
  const two = refill(start, start.solutionPath, 'TASARIMI', rng('d2'), 3, { ahead: 'EKİBİ' });
  assert.deepEqual(one, two);
});
