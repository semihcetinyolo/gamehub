// Starting clues for staged vitray maps (work/<id>.map.json), after final geometry and solution.
// node tools/stained/vitray/clues.js <id> [--hard] [...]
// Normal: >=3 definite non-adjacent starts, plain elimination solves, unique.
// Hard (--hard): >=2 starts, >=3 advanced deductions, not plain elimination, >=35 blanks.
// Scenery first: focal (central, prominent) panes start blank when the rules allow.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const E = require('../../../engine.js');
const { openingSeeds, normalClues, focalClues } = require('../starting_clues.js');

const args = process.argv.slice(2);
const hardIds = new Set();
const ids = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--hard') hardIds.add(args[++i]);
  else ids.push(args[i]);
}
for (const id of [...hardIds]) if (!ids.includes(id)) ids.push(id);

// Small panels: the design colouring may leave fewer than three panes whose
// neighbours show three colours (a definite start), or so few blanks that the
// level is over in three taps. Collect the four-colourings that change at most
// MAX_CHANGES panes and have three starts; the caller keeps the one that leaves
// the most to paint, then the fewest changes.
const MAX_CHANGES = 4;
function starts(adj, solution) {
  try { return openingSeeds(adj, solution, [...solution.keys()], 3).length; } catch { return 0; }
}

function colourings(adj, current, limit = 400, budget = 3e6) {
  const n = current.length, order = [...current.keys()].sort((a, b) => adj[b].length - adj[a].length);
  const col = Array(n).fill(-1), out = [];
  let steps = 0;
  (function dfs(k, cost) {
    if (++steps > budget || out.length >= limit || cost > MAX_CHANGES) return;
    if (k === n) {
      if (new Set(col).size === 4 && starts(adj, col) >= 3) out.push({ cost, sol: col.slice() });
      return;
    }
    const r = order[k];
    for (const c of [current[r], ...[0, 1, 2, 3].filter(c => c !== current[r])]) {
      if (adj[r].some(j => col[j] === c)) continue;
      col[r] = c; dfs(k + 1, cost + (c !== current[r])); col[r] = -1;
    }
  })(0, 0);
  return out;
}

const sha = v => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
for (const id of ids) {
  const file = path.join(__dirname, 'work', id + '.map.json');
  const info = JSON.parse(fs.readFileSync(file, 'utf8'));
  const { map } = info;
  let { solution } = info;
  const weights = info.clueFocus.weights;
  const seed = [...id].reduce((s, c) => (s * 31 + c.charCodeAt(0)) >>> 0, 7);
  let hard = hardIds.has(id);
  let given, best = null;
  if (hard) {
    // Remove clues in a scenery-last order while the puzzle stays logically solvable.
    for (let attempt = 0; attempt < 400; attempt++) {
      const rand = E.rng(seed + attempt * 104729);
      const order = solution.map((_, r) => ({ r, p: weights[r] + rand() * 8 })).sort((a, b) => b.p - a.p).map(x => x.r);
      const g = solution.slice();
      for (const r of order) {
        g[r] = -1;
        const blanks = g.filter(c => c < 0).length;
        if (!E.logicSolve(map.adj, g, 4, true).solved || (blanks >= 2 && E.openings(map.adj, g, 4) < 2)) g[r] = solution[r];
      }
      const logic = E.logicSolve(map.adj, g, 4, true);
      const empty = g.filter(c => c < 0).length, openings = E.openings(map.adj, g, 4);
      if (openings < 2 || logic.stats.pairs + logic.stats.probes < 3 || empty < (map.count >= 60 ? 35 : 20) || E.propagationSolves(map.adj, g, 4)) continue;
      const score = (logic.stats.pairs + logic.stats.probes) * 8 + empty - openings * 2;
      if (!best || score > best.score) best = { g, score, logic, empty, openings };
      if (attempt >= 60 && best) break;
    }
    // Some redrawn panels are too open for a hard set; they stay normal levels.
    if (!best) { hard = false; console.log(`${id}: no hard clue set, normal clues instead`); }
  }
  if (hard) {
    given = best.g;
    info.difficulty = { tier: 'hard', label: 'Zor', toPaint: best.empty, openings: best.openings,
      pairs: best.logic.stats.pairs, contradictions: best.logic.stats.probes, simpleEliminationSolves: false };
  } else {
    const normal = sol => {
      const requested = starts(map.adj, sol);
      if (requested < 3) return null;
      const base = normalClues(map.adj, sol, seed, requested);
      return focalClues(map.adj, sol, base, weights, seed + 98171, { hard: false, requested, minimumEmpty: 1 });
    };
    const wanted = Math.max(5, Math.round(map.count * .35));
    given = normal(solution);
    const blanks = g => g ? g.filter(c => c < 0).length : 0;
    if (map.count <= 40 && blanks(given) < wanted) {
      let pick = { cost: 0, sol: solution, given };
      for (const cand of colourings(map.adj, solution)) {
        const g = normal(cand.sol);
        const better = Math.min(blanks(g), wanted) - Math.min(blanks(pick.given), wanted);
        if (better > 0 || (better === 0 && blanks(g) > blanks(pick.given) && cand.cost <= pick.cost)) pick = { ...cand, given: g };
      }
      if (pick.sol !== solution) {
        console.log(`${id}: recoloured ${pick.cost} panes (${blanks(given)} -> ${blanks(pick.given)} to paint)`);
        solution = info.solution = pick.sol; given = pick.given;
      }
    }
    assert(given, `${id}: geometry needs three definite starts`);
    assert(E.propagationSolves(map.adj, given, 4), `${id}: needs advanced deductions`);
    delete info.difficulty;
    assert(E.propagationSolves(map.adj, given, 4), `${id}: needs advanced deductions`);
  }
  assert.equal(E.countSolutions(map.adj, given, 4, 2).count, 1, `${id}: solution not unique`);
  info.given = given;
  info.clueFocus.solution = sha(solution);
  info.clueFocus.prepared = true;
  fs.writeFileSync(file, JSON.stringify(info));
  const focus = weights.map((w, r) => w > 0 ? r : -1).filter(r => r >= 0);
  console.log(`${id}: ${map.count} panes, ${given.filter(c => c < 0).length} to paint, ${E.openings(map.adj, given, 4)} starts, `
    + `${focus.filter(r => given[r] >= 0).length}/${focus.length} focal panes given${hard ? ', hard' : ''}`);
}
