// Production rules for visible starting moves, shared by both clue builders.
const assert = require('node:assert/strict');
const E = require('../../engine.js');

// These empty regions can each see all three other colours. Keep them
// non-adjacent so their coloured neighbours can establish several clear starts.
function openingSeeds(adj, solution, order, requested) {
  const eligible = order.filter(r => new Set(adj[r].map(j => solution[j])).size === 3);
  function choose(from, selected, count) {
    if (selected.length === count) return selected;
    for (let i = from; i <= eligible.length - (count - selected.length); i++) {
      const r = eligible[i];
      if (selected.some(j => adj[r].includes(j))) continue;
      const result = choose(i + 1, [...selected, r], count);
      if (result) return result;
    }
    return null;
  }
  for (let count = requested; count > 0; count--) {
    const result = choose(0, [], count);
    if (result) return result;
  }
  throw new Error('Map has no region deducible from its coloured neighbours');
}

function normalClues(adj, solution, seed, requested = 3) {
  let best = null;
  for (let t = 0; t < 8; t++) {
    const rand = E.rng(seed * 7919 + t * 104729 + 17);
    const order = [...solution.keys()];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const starts = openingSeeds(adj, solution, order, requested);
    const given = solution.slice();
    for (const r of starts) given[r] = -1;
    for (const r of order) {
      if (given[r] < 0) continue;
      given[r] = -1;
      if (E.openings(adj, given, 4) < starts.length || !E.propagationSolves(adj, given, 4)) {
        given[r] = solution[r];
      }
    }
    const count = given.filter(c => c >= 0).length;
    if (!best || count < best.count) best = { given, count };
  }
  return best.given;
}

// Add only enough clues to enter a hard puzzle. Preserve its solution and its
// advanced deductions; no recolouring or artwork regeneration is involved.
function hardCluesWithStart(adj, solution, original, minimumEmpty, requested = 2) {
  if (E.openings(adj, original, 4) >= requested) return original.slice();
  const visited = new Set();
  function search(given, budget) {
    const key = given.join(',');
    if (visited.has(key)) return null;
    visited.add(key);
    const moves = E.openings(adj, given, 4);
    if (moves >= requested) return given;
    if (!budget || given.filter(c => c < 0).length <= minimumEmpty) return null;
    const candidates = [];
    for (let r = 0; r < given.length; r++) {
      if (given[r] >= 0) continue;
      const next = given.slice(); next[r] = solution[r];
      const openings = E.openings(adj, next, 4);
      if (openings <= moves) continue;
      const logic = E.logicSolve(adj, next, 4, true);
      if (!logic.solved || logic.stats.pairs + logic.stats.probes < 3
          || E.propagationSolves(adj, next, 4)) continue;
      candidates.push({ next, openings });
    }
    candidates.sort((a, b) => b.openings - a.openings);
    for (const { next } of candidates) {
      const result = search(next, budget - 1);
      if (result) return result;
    }
    return null;
  }
  for (let budget = 1; budget <= requested; budget++) {
    visited.clear();
    const result = search(original.slice(), budget);
    if (result) return result;
  }
  assert.fail('Hard puzzle needs starting clues that preserve advanced deductions');
}

// Prefer clues in scenery. A subject clue is allowed only when needed by the
// fixed colouring and deduction requirements; never recolour art to hide it.
function focalClues(adj, solution, original, weights, seed, options = {}) {
  const hard = !!options.hard, requested = options.requested || (hard ? 2 : 3);
  const minimumEmpty = options.minimumEmpty || 1;
  function acceptable(given) {
    if (E.openings(adj, given, 4) < requested || given.filter(c => c < 0).length < minimumEmpty) return false;
    if (!hard) return E.propagationSolves(adj, given, 4);
    if (E.propagationSolves(adj, given, 4)) return false;
    const logic = E.logicSolve(adj, given, 4, true);
    return logic.solved && logic.stats.pairs + logic.stats.probes >= 3;
  }
  const penalty = given => given.reduce((s, c, r) => s + (c < 0 ? 0 : weights[r]), 0);
  const clueCount = given => given.filter(c => c >= 0).length;
  const maximumClues = clueCount(original) + Math.max(3, Math.round(adj.length * .1));
  let best = original.slice();
  assert(acceptable(best), 'Original clue set must satisfy deduction requirements');
  for (let attempt = 0; attempt < (hard ? 120 : 64); attempt++) {
    const rand = E.rng(seed + attempt * 104729);
    const order = solution.map((_, r) => ({r, priority: weights[r] * (attempt % 4 === 0 ? .25 : 1) + rand() * (attempt % 3 === 0 ? 18 : 6)}))
      .sort((a,b) => b.priority - a.priority).map(x => x.r);
    const given = solution.slice();
    for (const r of order) {
      given[r] = -1;
      const solved = hard ? E.logicSolve(adj, given, 4, true).solved : E.propagationSolves(adj, given, 4);
      const blanks = given.filter(c => c < 0).length;
      if (!solved || E.openings(adj, given, 4) < Math.min(requested, blanks)) given[r] = solution[r];
    }
    if (clueCount(given) > maximumClues || !acceptable(given)) continue;
    if (penalty(given) < penalty(best) - 1e-6 ||
        (Math.abs(penalty(given) - penalty(best)) < 1e-6 && clueCount(given) < clueCount(best))) best = given;
  }
  assert.equal(E.countSolutions(adj, best, 4, 2).count, 1, 'Focal clues must retain a unique solution');
  return best;
}

module.exports = { openingSeeds, normalClues, hardCluesWithStart, focalClues };
