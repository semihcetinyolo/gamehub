// Prepare clues for staged visible-contact repairs: deduction rules first, then
// subject-aware focal clues. Removing a hidden adjacency removes a constraint,
// so published clues are retained only while they still pass every rule.
// node tools/stained/visible_contact_clues.js [ids…]   (after repair + focus)
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const E = require('../../engine.js');
const { normalClues, focalClues, openingSeeds } = require('./starting_clues.js');
const dir = path.resolve(__dirname, '../../output/visible-contacts');
const rows = JSON.parse(fs.readFileSync(path.join(dir, 'before/manifest.json')));
const ctx = { window: {} };
require('node:vm').runInNewContext(fs.readFileSync(path.join(dir, 'before/stained-levels.js'), 'utf8'), ctx);
const sourceOrder = [...ctx.window.CARTO_STAINED_ORDER.previousIds, 'brain'];
for (const entry of JSON.parse(fs.readFileSync(path.join(__dirname, 'pattern-catalog.json'))).assets) sourceOrder[entry.level - 1] = entry.id;
const selected = process.argv.slice(2);

function measures(l, given) {
  const logic = E.logicSolve(l.map.adj, given, 4, true);
  return { startingMoves: E.openings(l.map.adj, given, 4), toPaint: given.filter(c => c < 0).length,
    elimination: E.propagationSolves(l.map.adj, given, 4), solved: logic.solved,
    pairs: logic.stats.pairs, contradictions: logic.stats.probes };
}
function acceptable(l, given, hard) {
  if (!given || given.length !== l.map.count || given.some((c, i) => c >= 0 && c !== l.solution[i])) return false;
  if (E.countSolutions(l.map.adj, given, 4, 2).count !== 1) return false;
  const m = measures(l, given);
  return m.solved && m.startingMoves >= (hard ? 2 : 3)
    && (hard ? !m.elimination && m.pairs + m.contradictions >= 3 && m.toPaint >= (l.large ? 35 : 20) : m.elimination);
}
function hardClues(l, level) {
  let best = null;
  for (let attempt = 0; attempt < 800 && !(best && attempt >= 48); attempt++) {
    const rand = E.rng(74011 + level * 7919 + attempt * 104729);
    const order = [...l.solution.keys()];
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const given = l.solution.slice();
    for (const r of order) {
      given[r] = -1;
      if (!E.logicSolve(l.map.adj, given, 4, true).solved
        || (given.filter(c => c < 0).length >= 2 && E.openings(l.map.adj, given, 4) < 2)) given[r] = l.solution[r];
    }
    if (!acceptable(l, given, true)) continue;
    const m = measures(l, given), score = (m.pairs + m.contradictions) * 8 + m.toPaint - m.startingMoves * 2;
    if (!best || score > best.score) best = { score, given };
  }
  assert(best, l.id + ': no suitable hard clue set');
  return best.given;
}

const report = [];
for (const row of rows) {
  if (selected.length && !selected.includes(row.id)) continue;
  const file = path.join(dir, 'maps', row.id + '.json');
  const l = JSON.parse(fs.readFileSync(file));
  if (!l.visibleContactRepair || l.clueFocus?.prepared || l.tutorial) continue;
  assert(l.geometryQuality.valid && l.clueFocus, row.id + ': run repair and focus first');
  const published = ctx.window.CARTO_STAINED.find(x => x.id === row.id);
  const sourceIndex = sourceOrder.indexOf(row.id);
  const requested = sourceIndex >= 0 && sourceIndex < 8 ? 4 : 3;
  let given = published.given;
  const retained = acceptable(l, given, row.hard);
  if (!retained) given = row.hard ? hardClues(l, row.level) : normalClues(l.map.adj, l.solution, 1100 + Math.max(0, sourceIndex), requested);
  const weights = l.clueFocus.weights;
  const seeds = row.hard ? 2 : openingSeeds(l.map.adj, l.solution, [...l.solution.keys()], requested).length;
  given = focalClues(l.map.adj, l.solution, given, weights, 98171 + row.level * 7919,
    { hard: row.hard, requested: seeds, minimumEmpty: row.hard ? (l.large ? 35 : 20) : 1 });
  assert(acceptable(l, given, row.hard), row.id + ': clue requirements');
  l.given = given;
  const logic = { id: row.id, level: row.level, retained, ...measures(l, given), solutions: E.countSolutions(l.map.adj, given, 4, 2).count };
  if (row.hard) l.difficulty = { tier: 'hard', label: 'Zor', toPaint: logic.toPaint, openings: logic.startingMoves,
    pairs: logic.pairs, contradictions: logic.contradictions, simpleEliminationSolves: false };
  l.clueFocus.solution = crypto.createHash('sha256').update(JSON.stringify(l.solution)).digest('hex');
  l.clueFocus.prepared = true;
  l.visibleContactRepair.logic = logic;
  fs.writeFileSync(file, JSON.stringify(l));
  report.push(logic); console.log(JSON.stringify(logic));
}
fs.writeFileSync(path.join(dir, 'reports', selected.length === 1 ? `logic-${selected[0]}.json` : 'logic.json'), JSON.stringify(report, null, 2));
