// Produce clue sets for the staged catalogue junction repairs.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const E = require('../../engine.js');
const { normalClues } = require('./starting_clues.js');
const dir = path.resolve(__dirname, '../../output/junction-rollout');
const rows = JSON.parse(fs.readFileSync(path.join(dir, 'before/manifest.json')));
const selected = process.argv.slice(2);
const report = [];
const beforeContext = { window: {} };
require('node:vm').runInNewContext(fs.readFileSync(path.join(dir, 'before/stained-levels.js'), 'utf8'), beforeContext);
const sourceOrder = [...beforeContext.window.CARTO_STAINED_ORDER.previousIds, 'brain'];
for (const entry of JSON.parse(fs.readFileSync(path.join(__dirname, 'pattern-catalog.json'))).assets) sourceOrder[entry.level - 1] = entry.id;
function measures(l, given) {
  const logic = E.logicSolve(l.map.adj, given, 4, true);
  return { startingMoves: E.openings(l.map.adj, given, 4),
    toPaint: given.filter(c => c < 0).length,
    elimination: E.propagationSolves(l.map.adj, given, 4),
    solved: logic.solved, pairs: logic.stats.pairs, contradictions: logic.stats.probes };
}
function acceptable(l, given, hard) {
  if (!given || given.length !== l.map.count || given.some((c,i) => c >= 0 && c !== l.solution[i])) return false;
  const m = measures(l, given);
  return m.solved && m.startingMoves >= (hard ? 2 : 3)
    && (hard ? !m.elimination && m.pairs + m.contradictions >= 3 && m.toPaint >= (l.large ? 35 : 20) : m.elimination);
}
for (const row of rows) {
  if (selected.length && !selected.includes(row.id)) continue;
  const file = path.join(dir, 'maps', row.id + '.json');
  const l = JSON.parse(fs.readFileSync(file));
  if (!l.junctionRollout || l.junctionRollout.remaining.length) continue;
  try {
  const old = JSON.parse(fs.readFileSync(path.join(dir, 'before/maps', row.id + '.json')));
  const published = beforeContext.window.CARTO_STAINED.find(x => x.id === row.id);
  const sourceIndex = sourceOrder.indexOf(row.id);
  assert(sourceIndex >= 0, row.id + ': source slot');
  if (!row.hard) l.given = normalClues(l.map.adj, l.solution, 1100 + sourceIndex, sourceIndex < 8 ? 4 : 3);
  else if (acceptable(l, l.given, true)) { /* Retain already prepared hard clues. */ }
  else if (acceptable(l, published.given, true)) l.given = published.given;
  else {
    let solution = l.solution.slice(), best = null;
    for (let attempt = 0; attempt < 800; attempt++) {
      const rand = E.rng(74011 + row.level * 7919 + attempt * 104729);
      if (!best && attempt >= 160 && attempt % 80 === 0) {
        solution = l.solution.slice();
        for (let swap = 0; swap < 12; swap++) {
          const start = Math.floor(rand() * solution.length), a = solution[start], b = Math.floor(rand() * 4);
          if (a === b) continue;
          const seen = new Set([start]), queue = [start];
          while (queue.length) for (const j of l.map.adj[queue.pop()]) {
            if (!seen.has(j) && (solution[j] === a || solution[j] === b)) { seen.add(j); queue.push(j); }
          }
          for (const r of seen) solution[r] = solution[r] === a ? b : a;
        }
        if (new Set(solution).size !== 4) solution = l.solution.slice();
      }
      const order = [...solution.keys()];
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]];
      }
      const given = solution.slice();
      for (const r of order) {
        given[r] = -1;
        if (!E.logicSolve(l.map.adj, given, 4, true).solved
          || (given.filter(c => c < 0).length >= 2 && E.openings(l.map.adj, given, 4) < 2)) given[r] = solution[r];
      }
      const candidate = { ...l, solution };
      if (!acceptable(candidate, given, true)) continue;
      const m = measures(candidate, given), score = (m.pairs + m.contradictions) * 8 + m.toPaint - m.startingMoves * 2;
      if (!best || score > best.score) best = { score, solution: solution.slice(), given };
      if (attempt >= 47 && best && m.pairs + m.contradictions >= 6) break;
    }
    assert(best, row.id + ': no suitable hard clue set');
    l.solution = best.solution; l.given = best.given;
  }
  assert(acceptable(l, l.given, row.hard), row.id + ': clue requirements');
  const logic = { id: row.id, level: row.level, ...measures(l, l.given), solutions: E.countSolutions(l.map.adj, l.given, 4, 2).count };
  assert.equal(logic.solutions, 1, row.id + ': unique solution');
  if (row.hard) l.difficulty = { tier: 'hard', label: 'Zor', toPaint: logic.toPaint,
    openings: logic.startingMoves, pairs: logic.pairs, contradictions: logic.contradictions, simpleEliminationSolves: false };
  l.junctionRollout.logic = logic;
  l.junctionRollout.solutionChanged = JSON.stringify(l.solution) !== JSON.stringify(old.solution);
  l.junctionRollout.panesBefore = old.map.count;
  fs.writeFileSync(file, JSON.stringify(l)); report.push(logic);
  console.log(JSON.stringify(logic));
  } catch (e) { const failure = {id:row.id, error:e.message}; report.push(failure); console.log(JSON.stringify(failure)); }
}
fs.writeFileSync(path.join(dir, selected.length ? 'reports/logic-' + selected[0] + '.json' : 'logic-report.json'), JSON.stringify(report, null, 2));

if (report.some(r => r.error)) process.exitCode = 1;
