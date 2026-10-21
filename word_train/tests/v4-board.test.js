// v4 "Ray Çiz" honeycomb board: neighbours, whole-board generation and the gravity refill guarantee.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../levels.js';
import { rng } from '../core/logic.js';
import {
  CELLS, GEOMETRY, ROWS, adjacent, buildBoard, centerOf, findPaths, neighbours, refill, rowOf, runIn,
} from '../v4/board.js';

// screen angles of the board.js flow directions: down, down-left, up-left, up, up-right, down-right
const FLOW_ANGLES = [90, 150, -150, -90, -30, 30].map((deg) => (deg * Math.PI) / 180);

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

// Every refill policy the admin sheet offers: always solvable, stones move only as the mode says.
test('every refill mode keeps the level solvable and moves stones only along its flow', () => {
  for (const policy of ['mixflow', 'gravity', 'stay', 'mix', 'flow']) {
    let refills = 0, full = 0;
    LEVELS.forEach((level, li) => {
      for (let seed = 0; seed < 6; seed++) {
        const words = level.chain.slice(1).map((l) => l.word);
        let board = buildBoard(words[0], { levelNo: li + 1, rand: rng(`${seed}:${level.id}:1`), ahead: words[1], policy });
        for (let k = 1; k < words.length; k++) {
          const paths = findPaths(board.cells, words[k - 1], 5);
          const used = paths[(seed + k) % paths.length];
          const planned = board.nextMode;
          const r = refill(board, used, words[k], rng(`${seed}:${level.id}:${k + 1}`), li + 1, { ahead: words[k + 1], policy });
          refills++;
          if (r.fullReset) full++;
          board = { ...r.board, solutionPath: r.solutionPath };
          const label = `${policy} ${level.id} ${words[k]}`;
          assert.ok(spells(board, words[k]), label);
          assert.equal(new Set(board.cells.map((c) => c.key)).size, CELLS, 'stone keys stay unique');
          assert.ok(r.changedCells.length <= 5, label);
          assert.deepEqual(r.mode, planned, 'the refill runs in the mode the board planned for');
          if (r.fullReset) continue;
          assert.ok(withinCap(r.newCells.map((id) => board.cells[id]), words[k]), label);
          assert.equal(r.newCells.length, used.length, label);
          for (const m of r.moves) {
            assert.notEqual(r.mode.kind, 'stay', label);
            const a = centerOf(m.from), b = centerOf(m.to);
            const angle = Math.atan2(b.y - a.y, b.x - a.x);
            const want = r.mode.kind === 'flow' ? FLOW_ANGLES[r.mode.dir] : Math.PI / 2;
            assert.ok(Math.abs(Math.atan2(Math.sin(angle - want), Math.cos(angle - want))) < 0.05, `${label}: stone moved off its flow`);
            if (r.mode.kind === 'cols') assert.ok(r.mode.cols[m.to % 5], `${label}: a still column moved`);
          }
        }
      }
    });
    assert.ok(full / refills < 0.01, `${policy}: full resets ${full}/${refills}`);
  }
});

// Plays every level's chain through refills (default policy): mostly along the planned path, sometimes another valid
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

test('answers spread over every row and column of the board, not just under the new stones', () => {
  const cells = Array(ROWS).fill(0), firsts = Array(ROWS).fill(0), cols = Array(5).fill(0);
  const rounds = playRefills(20, ({ r }) => {
    for (const id of r.solutionPath) { cells[rowOf(id)]++; cols[id % 5]++; }
    firsts[rowOf(r.solutionPath[0])]++;
  });
  const total = cells.reduce((a, b) => a + b, 0);
  const share = (n, of) => `${(100 * n / of).toFixed(0)}%`;
  const msg = `rows ${cells.map((n) => share(n, total)).join(' ')}, first letters ${firsts.map((n) => share(n, rounds)).join(' ')}`;
  cells.forEach((n) => assert.ok(n / total >= 0.11 && n / total <= 0.23, msg));
  assert.ok(cells[ROWS - 1] / total >= 0.1, msg);
  firsts.forEach((n) => assert.ok(n / rounds >= 0.08 && n / rounds <= 0.26, msg));
  const colTotal = cols.reduce((x, y) => x + y, 0);
  cols.forEach((n) => assert.ok(n / colTotal >= 0.14 && n / colTotal <= 0.26, `columns ${cols.map((c) => share(c, colTotal)).join(' ')}`));
});

test('refill is deterministic', () => {
  const start = buildBoard('KAPAĞI', { levelNo: 3, rand: rng('d') });
  const one = refill(start, start.solutionPath, 'TASARIMI', rng('d2'), 3, { ahead: 'EKİBİ' });
  const two = refill(start, start.solutionPath, 'TASARIMI', rng('d2'), 3, { ahead: 'EKİBİ' });
  assert.deepEqual(one, two);
});
