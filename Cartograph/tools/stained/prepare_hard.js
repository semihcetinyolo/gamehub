// Choose deterministic, unique starting clues that REQUIRE advanced deductions.
// This is level production, not a gameplay test.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const E = require('../../engine.js');
const { hardCluesWithStart } = require('./starting_clues.js');
const dir = path.join(__dirname, 'maps');
const ids = [...Array.from({ length: 25 }, (_, i) => `grand_${String(i + 1).padStart(2, '0')}`),
  'motif_rooster', 'motif_lobster'];
const failed = [];
for (const [index, id] of ids.entries()) {
  const n = index + 1;
  const file = path.join(dir, id + '.json');
  if (!fs.existsSync(file)) continue;
  const info = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (info.difficulty?.tier === 'hard') {
    if (E.openings(info.map.adj, info.given, 4) >= 2) continue;
    info.given = hardCluesWithStart(info.map.adj, info.solution, info.given, info.large ? 35 : 20);
    const logic = E.logicSolve(info.map.adj, info.given, 4, true);
    assert.equal(E.countSolutions(info.map.adj, info.given, 4, 2).count, 1, `${id}: must be unique`);
    info.difficulty = { ...info.difficulty, toPaint: info.given.filter(c => c < 0).length,
      openings: E.openings(info.map.adj, info.given, 4), pairs: logic.stats.pairs,
      contradictions: logic.stats.probes, simpleEliminationSolves: false };
    fs.writeFileSync(file, JSON.stringify(info));
    console.log(`${id}: added clear starts, ${info.difficulty.openings} openings, ${info.difficulty.toPaint} empty`);
    continue;
  }
  const { map } = info;
  let solution = info.solution.slice();
  let best = null;
  for (let attempt = 0; attempt < 800; attempt++) {
    const rand = E.rng(74011 + n * 7919 + attempt * 104729);
    // A different valid colouring can expose deeper deductions on the same clean graph.
    if (!best && attempt >= 160 && attempt % 80 === 0) {
      solution = info.solution.slice();
      for (let swap = 0; swap < 12; swap++) {
        const start = Math.floor(rand() * solution.length), a = solution[start], b = Math.floor(rand() * 4);
        if (a === b) continue;
        const seen = new Set([start]), queue = [start];
        while (queue.length) for (const j of map.adj[queue.pop()]) {
          if (!seen.has(j) && (solution[j] === a || solution[j] === b)) { seen.add(j); queue.push(j); }
        }
        for (const r of seen) solution[r] = solution[r] === a ? b : a;
      }
      if (new Set(solution).size !== 4) solution = info.solution.slice();
    }
    const order = [...solution.keys()];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const given = solution.slice();
    for (const r of order) {
      given[r] = -1;
      // Once two starts exist, retain that entry point while removing clues.
      const openingCount = E.openings(map.adj, given, 4);
      if (!E.logicSolve(map.adj, given, 4, true).solved
          || (given.filter(c => c < 0).length >= 2 && openingCount < 2)) given[r] = solution[r];
    }
    const logic = E.logicSolve(map.adj, given, 4, true);
    const empty = given.filter(c => c < 0).length;
    const advanced = logic.stats.pairs + logic.stats.probes;
    const openings = E.openings(map.adj, given, 4);
    if (openings < 2 || advanced < 3 || empty < (info.large ? 35 : 20) || E.propagationSolves(map.adj, given, 4)) continue;
    const score = advanced * 8 + empty - openings * 2;
    if (!best || score > best.score) best = { given, solution: solution.slice(), score, empty, openings, stats: logic.stats };
    if (attempt >= 47 && best && best.stats.pairs + best.stats.probes >= 6) break;
  }
  if (!best) { failed.push(id); console.error(`${id}: design needs a stronger deduction graph`); continue; }
  assert.equal(E.countSolutions(map.adj, best.given, 4, 2).count, 1, `${id}: must be unique`);
  info.given = best.given;
  if (JSON.stringify(info.solution) !== JSON.stringify(best.solution)) info.artworkNeedsRefresh = true;
  info.solution = best.solution;
  info.difficulty = { tier: 'hard', label: 'Zor', toPaint: best.empty, openings: best.openings,
    pairs: best.stats.pairs, contradictions: best.stats.probes, simpleEliminationSolves: false };
  fs.writeFileSync(file, JSON.stringify(info));
  console.log(`${id}: ${map.count} panes, ${best.empty} empty, ${best.stats.pairs} pairs, ${best.stats.probes} contradictions`);
}
assert.equal(failed.length, 0, 'Rework hard clue graphs: ' + failed.join(', '));
