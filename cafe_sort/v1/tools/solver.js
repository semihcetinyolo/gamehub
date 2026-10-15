// Beam-search solver for a cocktail level + a human-pace timing check.
// Used by gen.js (pick levels) and verify.js (re-check levels.js).
//
// Model = the game's rules: a move pours the top layer of one bottle onto
// another with room. The mixer (level.mixer) takes any colour; a normal bottle
// only takes a layer when it is empty or its top is the same colour. Only the
// first `maxActiveCustomers` unserved orders are on screen; when the mixer
// equals one of them it is served automatically and the mixer empties. A
// normal bottle that is empty (from the start or after a pour) is refilled
// with the next batch of `refills` (the game shows a short animation first); once the refills are
// used up, such a bottle disappears for the rest of the level (GONE) unless
// that would leave fewer normal bottles than colours still on the board.
(function (root) {
'use strict';

// Timing model, mirrors game.js (ARRIVE_S, LEAVE_S) plus a human pace.
const T = {
  firstLook: 4,   // s before the first move
  move: 2.2,      // s per pour (tap + tap + thinking)
  serve: 0.5,     // auto-serve animation the player waits for
  leave: 0.8,     // card leave animation (game LEAVE_S)
  arrive: 0.5,    // card arrive animation; patience starts after it (game ARRIVE_S)
};

function encode(level) {
  const ids = [];
  const ch = c => { let i = ids.indexOf(c); if (i < 0) { ids.push(c); i = ids.length - 1; } return String.fromCharCode(97 + i); };
  return {
    cap: level.bottleCapacity,
    K: Math.min(3, level.maxActiveCustomers),
    M: level.mixer || 0,
    bottles: level.initialBottles.map(b => b.map(ch).join('')),
    orders: level.orders.map(o => o.layers.map(ch).join('')),
    refills: (level.refills || []).map(b => b.map(ch).join('')),
  };
}

const GONE = '#';

function canPour(b, i, j, E) {
  if (i === j || !b[i] || b[i] === GONE || b[j] === GONE || b[j].length >= E.cap) return false;
  return j === E.M || !b[j] || b[j][b[j].length - 1] === b[i][b[i].length - 1];
}

function settle(b, rem, E, acts) {
  for (let k = 0; k < Math.min(E.K, rem.length); k++) {
    if (b[E.M] !== E.orders[rem[k]]) continue;
    if (acts) acts.push({ serve: E.M, order: rem[k] });
    b[E.M] = '';
    rem.splice(k, 1);
    return;
  }
}

// Lower = closer: wrong layers in the mixer, layers the best on-screen order
// still needs, colour changes inside normal bottles (each needs a move), and
// how deep the next needed colour is buried.
function heuristic(b, rem, E) {
  const m = b[E.M];
  let best = null;
  for (const r of rem.slice(0, E.K)) {
    const o = E.orders[r];
    let p = 0;
    while (p < m.length && p < o.length && m[p] === o[p]) p++;
    const junk = m.length - p;
    const score = junk * 3 + o.length - p;
    if (!best || score < best.score) best = { score, o, p, junk };
  }
  let h = best ? best.score : 0;
  for (let i = 0; i < b.length; i++) {
    if (i === E.M) continue;
    for (let k = 1; k < b[i].length; k++) if (b[i][k] !== b[i][k - 1]) h++;
  }
  if (best && !best.junk && best.p < best.o.length) {
    const c = best.o[best.p];
    let depth = 99;
    for (let i = 0; i < b.length; i++) {
      if (i === E.M) continue;
      const at = b[i].lastIndexOf(c);
      if (at >= 0) depth = Math.min(depth, b[i].length - 1 - at);
    }
    if (depth < 99) h += depth;
  }
  return h;
}

function key(b, rem, r, E) {
  return b[E.M] + '#' + b.filter((_, i) => i !== E.M).sort().join('|') + '#' + rem.join(',') + '#' + r;
}

// game.js mayVanish: keep at least one normal bottle per colour still on the
// board, so a wrongly built mixer can always be taken apart again.
function mayVanish(b, i, E) {
  const colours = new Set();
  let left = 0;
  b.forEach((s, j) => {
    if (s === GONE) return;
    for (const c of s) colours.add(c);
    if (j !== E.M && j !== i) left++;
  });
  return left >= colours.size;
}

// While refills are left no normal bottle stays empty: each empty one takes the
// next batch, in board order (game.js fillEmpties). Returns the new refill count.
function fillEmpties(b, r, E) {
  for (let i = 0; i < b.length && r < E.refills.length; i++) {
    if (i !== E.M && b[i] === '') b[i] = E.refills[r++];
  }
  return r;
}

// pour i -> j in place; a normal bottle poured empty is refilled (or removed
// when no refills are left). Returns the new refill count.
function apply(b, i, j, r, E) {
  b[j] += b[i][b[i].length - 1];
  b[i] = b[i].slice(0, -1);
  if (!b[i] && i !== E.M && r >= E.refills.length && mayVanish(b, i, E)) b[i] = GONE;
  return fillEmpties(b, r, E);
}

// Returns { moves, actions: [{from,to}|{serve,order}] } or null.
function solve(level, opts = {}) {
  const widths = opts.widths || [300, 1500, 6000];
  const E = encode(level);
  for (const W of widths) {
    const r = beam(E, W, opts.maxDepth || 250);
    if (r) return r;
  }
  return null;
}

// The faster (for the customers) of two plans: serving strictly in arrival
// order, and the free plan that builds whichever on-screen order is easiest.
function solveTimed(level, opts = {}) {
  let best = null;
  for (const K of [1, level.maxActiveCustomers]) {
    const s = solve(Object.assign({}, level, { maxActiveCustomers: K }), opts);
    if (!s) continue;
    s.timing = timing(level, s.actions);
    if (!best || s.timing.ratio < best.timing.ratio) best = s;
  }
  return best;
}

function beam(E, W, maxDepth) {
  const b0 = E.bottles.slice();
  const start = { b: b0, rem: E.orders.map((_, i) => i), r: fillEmpties(b0, 0, E), parent: null, acts: [] };
  settle(start.b, start.rem, E, start.acts);
  if (!start.rem.length) return finish(start);
  const seen = new Set([key(start.b, start.rem, 0, E)]);
  let frontier = [start];
  for (let depth = 0; depth < maxDepth && frontier.length; depth++) {
    const next = [];
    for (const s of frontier) {
      const b = s.b;
      let emptySeen = false;
      for (let j = 0; j < b.length; j++) {
        if (b[j].length >= E.cap) continue;
        const toEmpty = j !== E.M && b[j].length === 0;
        if (toEmpty) { if (emptySeen) continue; emptySeen = true; }
        for (let i = 0; i < b.length; i++) {
          if (!canPour(b, i, j, E)) continue;
          if (toEmpty && i !== E.M && b[i].length === 1 && s.r >= E.refills.length) continue;
          const nb = b.slice();
          const r = apply(nb, i, j, s.r, E);
          const rem = s.rem.slice();
          const acts = [{ from: i, to: j }];
          settle(nb, rem, E, acts);
          const k = key(nb, rem, r, E);
          if (seen.has(k)) continue;
          seen.add(k);
          const c = { b: nb, rem, r, parent: s, acts };
          if (!rem.length) return finish(c);
          c.h = heuristic(nb, rem, E) * 10 + rem.length * 60;
          next.push(c);
        }
      }
    }
    next.sort((x, y) => x.h - y.h);
    frontier = next.slice(0, W);
  }
  return null;
}

function finish(s) {
  const chain = [];
  for (let n = s; n; n = n.parent) chain.push(n.acts);
  const actions = chain.reverse().flat();
  return { moves: actions.filter(a => a.from !== undefined).length, actions };
}

// Replay an action list with a human pace. Returns the worst wait/patience
// ratio over all customers, or Infinity if the actions don't solve the level.
function timing(level, actions) {
  const E = encode(level);
  const b = E.bottles.slice();
  let r = fillEmpties(b, 0, E);
  const queue = E.orders.map((_, i) => i);
  const slots = [];
  let t = T.firstLook;
  const open = at => { if (queue.length) slots.push({ o: queue.shift(), since: at }); };
  for (let k = 0; k < E.K; k++) open(T.arrive);
  let worst = 0;
  for (const a of actions) {
    if (a.from !== undefined) {
      if (!canPour(b, a.from, a.to, E)) return { ratio: Infinity };
      r = apply(b, a.from, a.to, r, E);
      t += T.move;
    } else {
      const si = slots.findIndex(s => s.o === a.order);
      if (si < 0 || a.serve !== E.M || b[E.M] !== E.orders[a.order]) return { ratio: Infinity };
      t += T.serve;
      const s = slots.splice(si, 1)[0];
      worst = Math.max(worst, (t - s.since) / patienceOf(level, s.o));
      b[E.M] = '';
      open(t + T.leave + T.arrive);
    }
  }
  if (slots.length || queue.length) return { ratio: Infinity };
  return { ratio: worst, seconds: t };
}

function patienceOf(level, i) {
  return level.orders[i].patience || level.customerPatienceSeconds;
}

// Can the level still be finished from a position in the game (customer
// patience ignored)? Used by game.js after every pour to catch dead ends.
// state: { cap, K, mixer, bottles: [layers | null when gone], orders: [layers]
// still to serve (on-screen ones first), refills: [layers] still to come }.
// A quick beam search answers almost every time; if it fails, a full search
// with a node budget decides. Returns false only when no solution exists
// (budget exhausted counts as "can finish", so the player is never punished
// by a guess).
function canFinish(state, budget = 60000) {
  const ids = [];
  const ch = c => { let i = ids.indexOf(c); if (i < 0) { ids.push(c); i = ids.length - 1; } return String.fromCharCode(97 + i); };
  const E = {
    cap: state.cap, K: Math.min(3, state.K), M: state.mixer,
    bottles: state.bottles.map(b => b === null ? GONE : b.map(ch).join('')),
    orders: state.orders.map(o => o.map(ch).join('')),
    refills: state.refills.map(b => b.map(ch).join('')),
  };
  if (!E.orders.length || beam(E, 60, 120)) return true;
  const seen = new Set();
  let nodes = 0;
  const dfs = (b, rem, r) => {
    if (!rem.length) return true;
    if (++nodes > budget) return true;
    const k = key(b, rem, r, E);
    if (seen.has(k)) return false;
    seen.add(k);
    for (let i = 0; i < b.length; i++) {
      for (let j = 0; j < b.length; j++) {
        if (!canPour(b, i, j, E)) continue;
        const nb = b.slice(), nrem = rem.slice();
        const nr = apply(nb, i, j, r, E);
        settle(nb, nrem, E);
        if (dfs(nb, nrem, nr)) return true;
      }
    }
    return false;
  };
  const b0 = E.bottles.slice(), rem0 = E.orders.map((_, i) => i);
  const r0 = fillEmpties(b0, 0, E);
  settle(b0, rem0, E);
  return dfs(b0, rem0, r0);
}

const api = { solve, solveTimed, timing, canFinish, T };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.CocktailSolver = api;
})(this);
