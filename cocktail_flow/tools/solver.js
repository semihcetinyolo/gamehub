// Beam-search solver for a Cocktail Flow level + a human-pace timing check.
// Used by gen.js (pick levels) and verify.js (re-check levels.js).
//
// Model = the game's rules. Vessels 0..NL-1 are the front supply bottles of the
// lanes, NL..NL+prepCount-1 the preparation glasses. A move pours the top layer
// of one vessel onto another with room: a preparation glass takes any colour,
// a supply bottle only the same colour. When a pour empties a front bottle the
// next bottle of that lane moves up (the game animates it); an exhausted lane
// is GONE. Only the first `maxActiveCustomers` unserved orders are on screen;
// a glass that equals one of them is served automatically and empties.
'use strict';

// Timing model, mirrors game.js (ARRIVE_S, LEAVE_S) plus a human pace.
const T = {
  firstLook: 4,   // s before the first move
  move: 2.2,      // s per pour (tap + tap + thinking)
  serve: 0.5,     // auto-serve animation the player waits for
  leave: 0.8,     // card leave animation (game LEAVE_S)
  arrive: 0.5,    // card arrive animation; patience starts after it (game ARRIVE_S)
};

const GONE = '#';

function encode(level) {
  const ids = [];
  const ch = c => { let i = ids.indexOf(c); if (i < 0) { ids.push(c); i = ids.length - 1; } return String.fromCharCode(97 + i); };
  const lanes = level.lanes.map(lane => lane.map(b => b.map(ch).join('')));
  return {
    cap: level.bottleCapacity,
    K: Math.min(3, level.maxActiveCustomers),
    NL: lanes.length,
    NP: level.prepCount,
    lanes,
    orders: level.orders.map(o => o.layers.map(ch).join('')),
  };
}

function startState(E) {
  return { b: E.lanes.map(l => l[0]).concat(Array(E.NP).fill('')), ptr: E.lanes.map(() => 0) };
}

function canPour(b, i, j, E) {
  if (i === j || !b[i] || b[i] === GONE || b[j] === GONE || b[j].length >= E.cap) return false;
  return j >= E.NL || !b[j] || b[j][b[j].length - 1] === b[i][b[i].length - 1];
}

// pour i -> j in place; a front bottle left empty is replaced by the next one
// of its lane (or GONE). ptr is changed in place too.
function apply(b, ptr, i, j, E) {
  b[j] += b[i][b[i].length - 1];
  b[i] = b[i].slice(0, -1);
  if (!b[i] && i < E.NL) {
    ptr[i]++;
    b[i] = ptr[i] < E.lanes[i].length ? E.lanes[i][ptr[i]] : GONE;
  }
}

// Serve every glass that equals an on-screen order; a served customer's place
// goes to the next in the queue, which may match another glass right away.
function settle(b, rem, E, acts) {
  for (let changed = true; changed;) {
    changed = false;
    for (let j = E.NL; j < b.length && !changed; j++) {
      if (!b[j]) continue;
      for (let k = 0; k < Math.min(E.K, rem.length); k++) {
        if (b[j] !== E.orders[rem[k]]) continue;
        if (acts) acts.push({ serve: j, order: rem[k] });
        b[j] = '';
        rem.splice(k, 1);
        changed = true;
        break;
      }
    }
  }
}

// Lower = closer: per glass, wrong layers + layers still missing for the
// on-screen order it fits best; colour changes inside front bottles; how deep
// each glass's next needed colour is buried (or not in front at all).
function heuristic(b, rem, E) {
  const vis = rem.slice(0, E.K).map(r => E.orders[r]);
  let h = 0;
  for (let j = E.NL; j < b.length; j++) {
    const m = b[j];
    if (!m) { h += E.cap; continue; }
    let best = null;
    for (const o of vis) {
      let p = 0;
      while (p < m.length && p < o.length && m[p] === o[p]) p++;
      const junk = m.length - p;
      const score = junk * 3 + o.length - p;
      if (!best || score < best.score) best = { score, o, p, junk };
    }
    if (!best) { h += m.length * 3; continue; }
    h += best.score;
    if (!best.junk && best.p < best.o.length) {
      const c = best.o[best.p];
      let depth = 6;
      for (let i = 0; i < E.NL; i++) {
        if (b[i] === GONE) continue;
        const at = b[i].lastIndexOf(c);
        if (at >= 0) depth = Math.min(depth, b[i].length - 1 - at);
      }
      h += depth;
    }
  }
  for (let i = 0; i < E.NL; i++) {
    if (b[i] === GONE) continue;
    for (let k = 1; k < b[i].length; k++) if (b[i][k] !== b[i][k - 1]) h++;
  }
  return h;
}

function key(b, ptr, rem, E) {
  const fronts = [];
  for (let i = 0; i < E.NL; i++) fronts.push(ptr[i] + ':' + b[i]);
  return fronts.join('|') + '#' + b.slice(E.NL).sort().join('|') + '#' + rem.join(',');
}

// Returns { moves, actions: [{from,to}|{serve,order}] } or null.
function solve(level, opts = {}) {
  const widths = opts.widths || [300, 1500, 6000];
  const E = encode(level);
  for (const W of widths) {
    const r = beam(E, W, opts.maxDepth || 300);
    if (r) return r;
  }
  return null;
}

// The faster (for the customers) of two plans: serving strictly in arrival
// order, and the free plan that builds whichever on-screen orders are easiest.
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
  const st = startState(E);
  const start = { b: st.b, ptr: st.ptr, rem: E.orders.map((_, i) => i), parent: null, acts: [] };
  settle(start.b, start.rem, E, start.acts);
  if (!start.rem.length) return finish(start);
  const seen = new Set([key(start.b, start.ptr, start.rem, E)]);
  let frontier = [start];
  for (let depth = 0; depth < maxDepth && frontier.length; depth++) {
    const next = [];
    for (const s of frontier) {
      const b = s.b;
      let emptySeen = false;
      for (let j = 0; j < b.length; j++) {
        if (b[j] === GONE || b[j].length >= E.cap) continue;
        if (j >= E.NL && !b[j]) { if (emptySeen) continue; emptySeen = true; }   // empty glasses are alike
        for (let i = 0; i < b.length; i++) {
          if (!canPour(b, i, j, E)) continue;
          if (i >= E.NL && !b[j] && b[i].length === 1) continue;   // a lone layer to another empty glass
          const nb = b.slice(), ptr = s.ptr.slice();
          apply(nb, ptr, i, j, E);
          const rem = s.rem.slice();
          const acts = [{ from: i, to: j }];
          settle(nb, rem, E, acts);
          const k = key(nb, ptr, rem, E);
          if (seen.has(k)) continue;
          seen.add(k);
          const c = { b: nb, ptr, rem, parent: s, acts };
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
  const { b, ptr } = startState(E);
  const queue = E.orders.map((_, i) => i);
  const slots = [];
  let t = T.firstLook;
  const open = at => { if (queue.length) slots.push({ o: queue.shift(), since: at }); };
  for (let k = 0; k < E.K; k++) open(T.arrive);
  let worst = 0;
  const waits = [];   // per order: seconds from arrival to served
  for (const a of actions) {
    if (a.from !== undefined) {
      if (!canPour(b, a.from, a.to, E)) return { ratio: Infinity };
      apply(b, ptr, a.from, a.to, E);
      t += T.move;
    } else {
      const si = slots.findIndex(s => s.o === a.order);
      if (si < 0 || a.serve < E.NL || b[a.serve] !== E.orders[a.order]) return { ratio: Infinity };
      t += T.serve;
      const s = slots.splice(si, 1)[0];
      waits[s.o] = t - s.since;
      worst = Math.max(worst, waits[s.o] / patienceOf(level, s.o));
      b[a.serve] = '';
      open(t + T.leave + T.arrive);
    }
  }
  if (slots.length || queue.length) return { ratio: Infinity };
  return { ratio: worst, seconds: t, waits };
}

function patienceOf(level, i) {
  return level.orders[i].patience || level.customerPatienceSeconds;
}

module.exports = { solve, solveTimed, timing, T, GONE, encode, startState, canPour, apply, settle };
