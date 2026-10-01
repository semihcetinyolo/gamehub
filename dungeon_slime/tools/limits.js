#!/usr/bin/env node
// Move limits and the difficulty curve: the calculation behind every level's move budget
// ("hamle hakkı"), its HARD flag and its place on the curve.
//
// For each level the whole reachable state graph is built (every position, form, wafer, key,
// stone and plate combination) and, for every state, the fewest swipes still needed to escape.
// A simple player model then measures how a move budget changes the chance of escaping. Every
// swipe that moves Jöli gets a weight and the player picks one in proportion:
//   best swipe (brings the exit one swipe closer) 1,  wasteful swipe or dead end  r,
//   swipe into a VISIBLE hazard  r × DANGER (people rarely slide into spikes they can see).
// r follows from the skill q: in a typical spot (one best swipe, two wrong ones) the player finds
// the best swipe with probability q, so r = (1 − q) / (2q). q = 0.9 ≈ one slip in ten swipes.
// P(L) = exact probability of escaping within L swipes, by dynamic programming over the graph.
// P(∞) is the same with no budget: the level's own difficulty.
//
// Difficulty has the same shape as Puppy Maze's (LongCat/engine.js analyse):
//   D = −log2 P(budget) + 0.06 × par
// how unlikely a first-try escape is, plus a small term for every swipe of the best route.
//
//   node tools/limits.js              report (no changes)
//   node tools/limits.js --write      also store the budgets (`moves`) and HARD flags in levels.js
//   node tools/limits.js --q 0.85     skill of the reference player (default 0.9)
//   node tools/limits.js --json       rows as JSON (for charts)
const E = require('../engine.js');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const Q = +opt('q', .9), DANGER = +opt('danger', .2);

// ---------- the state graph ----------
function graph(L, limit = 400000) {
  const s0 = E.initialState(L), index = new Map([[E.keyOf(s0), 0]]), states = [s0], out = [];
  for (let i = 0; i < states.length; i++) {
    if (states.length > limit) throw new Error(`${L.name}: more than ${limit} states`);
    const moves = [];
    for (const dir of Object.keys(E.DIRS)) {
      const r = E.move(L, states[i], dir);
      if (r.result === 'none') continue;                       // swiping into what it touches: free
      if (r.result !== 'stop') { moves.push({ dir, res: r.result }); continue; } // win / dead
      const k = E.keyOf(r.state);
      if (!index.has(k)) { index.set(k, states.length); states.push(r.state); }
      moves.push({ dir, res: 'stop', to: index.get(k) });
    }
    out.push(moves);
  }
  // fewest swipes to escape from every state (Infinity = the exit is no longer reachable)
  const dist = new Array(states.length).fill(Infinity), back = states.map(() => []);
  const queue = [];
  out.forEach((ms, i) => ms.forEach(m => { if (m.res === 'win') { if (dist[i] > 1) { dist[i] = 1; queue.push(i); } } else if (m.res === 'stop') back[m.to].push(i); }));
  for (let h = 0; h < queue.length; h++) for (const p of back[queue[h]]) if (dist[p] === Infinity) { dist[p] = dist[queue[h]] + 1; queue.push(p); }
  return { states, out, dist, par: dist[0] };
}

// ---------- the player model ----------
// policy: probability of each swipe from state i (weights: best 1, wrong r, visible death r·DANGER)
function policy(G, i, q) {
  const ms = G.out[i], d = G.dist[i], r = (1 - q) / (2 * q);
  const w = ms.map(m => m.res === 'win' || (m.res === 'stop' && G.dist[m.to] === d - 1) ? 1
    : m.res === 'dead' ? r * DANGER : r);
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map(v => v / sum);
}
// P[m] = probability of escaping within m swipes, for m = 0..maxL (index 0 is the start state)
function escapeCurve(G, q, maxL) {
  const n = G.states.length, pol = G.out.map((_, i) => policy(G, i, q));
  let V = new Float64Array(n); const curve = [0];
  for (let m = 1; m <= maxL; m++) {
    const W = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const ms = G.out[i], p = pol[i]; let v = 0;
      for (let k = 0; k < ms.length; k++) v += p[k] * (ms[k].res === 'win' ? 1 : ms[k].res === 'dead' ? 0 : V[ms[k].to]);
      W[i] = v;
    }
    V = W; curve.push(V[0]);
  }
  return curve;
}
// what one mistake costs on a best route: extra swipes it adds, or fatal (death / dead end)
function mistakes(G) {
  let fatal = 0, total = 0; const cost = {};
  const onRoute = new Set([0]); // states on some best route from the start
  const order = [0];
  for (let h = 0; h < order.length; h++) {
    const i = order[h];
    for (const m of G.out[i]) {
      const best = m.res === 'win' || (m.res === 'stop' && G.dist[m.to] === G.dist[i] - 1);
      if (best) { if (m.res === 'stop' && !onRoute.has(m.to)) { onRoute.add(m.to); order.push(m.to); } continue; }
      total++;
      if (m.res === 'dead' || G.dist[m.to] === Infinity) { fatal++; continue; }
      const extra = 1 + G.dist[m.to] - G.dist[i]; cost[extra] = (cost[extra] || 0) + 1;
    }
  }
  const costs = Object.entries(cost).flatMap(([c, n]) => Array(n).fill(+c)).sort((a, b) => a - b);
  return { total, fatal, median: costs.length ? costs[Math.floor(costs.length / 2)] : 0 };
}

// ---------- the difficulty curve ----------
// Like Puppy Maze: levels 1–6 teach (1–4 the forms, 5–6 spikes), then cycles of five
//   normal, normal+, HARD, easy, easy
// so every HARD level is followed at once by two easier ones, and the normal level rises slowly
// from 0.85 (level 7) to 1.25 (the last level). Slot targets: normal = base, normal+ = base + 0.22,
// HARD = base + 1.0, easy = base − 0.4 and base − 0.3. New mechanics are introduced in easy slots
// (the level order itself: tools/curve-plan.js).
// The budget L stays between the fair floor, par + one typical slip (the level's median mistake
// cost, so a single ordinary slip is always forgiven), and the generous end: the smallest L that
// keeps 95% of the level's own chance P(∞), at most par + max(6, par / 2).
//   easy       the generous end
//   the rest   the smallest L whose difficulty D(L) is at most the slot's target
// A level more than 0.15 off its target is flagged. Onboarding (1–6) keeps its own rule:
// tutorials 97% and the spike intros 88% first-try, plus an allowance that starts high and
// shrinks level by level until onboarding ends: at least +8 extra moves in level 1, then 7, 6, 5,
// 4, +3 in level 6. Stars: ★★★ par, ★★ par + half the slack, ★ the budget.
const LEN = .06, ONBOARDING = 6, ONBOARD_START = 8, ONBOARD_END = 3;
const KINDS = ['normal', 'normal+', 'HARD', 'easy', 'easy'], OFFSET = [0, .22, 1, -.4, -.3];
const BASE0 = .85, BASE1 = 1.25, TMIN = .4, SLACK_MIN = 6, TOLERANCE = .15;
const onboardSlack = i => i >= ONBOARDING ? 0
  : Math.round(ONBOARD_START - (ONBOARD_START - ONBOARD_END) * i / Math.max(1, ONBOARDING - 1));
const difficulty = (p, par) => -Math.log2(Math.max(p, 1e-9)) + LEN * par;
function slotOf(i, n) { // i: 0-based level index, n: number of levels
  if (i < 4) return { kind: 'tutorial', goal: .97 };
  if (i < ONBOARDING) return { kind: 'intro', goal: .88 };
  const k = i - ONBOARDING, cyc = k % 5, t = k / Math.max(1, n - 1 - ONBOARDING);
  return { kind: KINDS[cyc], target: Math.max(TMIN, BASE0 + (BASE1 - BASE0) * t + OFFSET[cyc]) };
}
// the budget window of one level: fair floor .. generous end, and the difficulty at both ends
function windowOf(G, curve, m) {
  const pInf = curve[curve.length - 1], fair = G.par + Math.max(1, m.median);
  const most = G.par + Math.max(SLACK_MIN, Math.round(G.par / 2));
  let generous = fair; while (generous < most && curve[generous] < .95 * pInf) generous++;
  return { fair, generous, dMax: difficulty(curve[fair], G.par), dMin: difficulty(curve[generous], G.par) };
}
function budgetOf(G, curve, m, slot, i) {
  if (slot.goal) { // onboarding: first-try goal, one slip (+2 in tutorials), shrinking allowance
    const pInf = curve[curve.length - 1], goal = pInf < slot.goal ? pInf * .92 : Math.min(slot.goal, pInf * .995);
    let L = G.par; while (L < curve.length - 1 && curve[L] < goal - 1e-12) L++;
    return Math.max(L, G.par + (slot.kind === 'tutorial' ? 2 : Math.max(1, m.median)), G.par + onboardSlack(i));
  }
  const w = windowOf(G, curve, m);
  if (slot.kind === 'easy') return w.generous;
  let L = w.fair; while (L < w.generous && difficulty(curve[L], G.par) > slot.target + 1e-9) L++;
  return L;
}

// Everything the report, verify.js and curve-plan.js need, for every level.
function analyse(levels, q = Q) {
  return levels.map((lv, i) => {
    const L = E.parse(lv), G = graph(L);
    if (!Number.isFinite(G.par)) throw new Error(`${lv.name}: unsolvable`);
    const maxL = Math.max(90, G.par * 4), curve = escapeCurve(G, q, maxL), weak = escapeCurve(G, .8, maxL);
    const m = mistakes(G), slot = slotOf(i, levels.length), limit = budgetOf(G, curve, m, slot, i), w = windowOf(G, curve, m);
    const stored = Number.isInteger(lv.moves) ? lv.moves : null;
    const d = difficulty(curve[limit], G.par), dStored = stored === null ? null : difficulty(curve[Math.min(stored, maxL)], G.par);
    let flag = null;
    if (slot.target !== undefined) {
      if (d > slot.target + TOLERANCE) flag = 'harder';
      else if (slot.kind !== 'easy' && d < slot.target - TOLERANCE) flag = 'easier';
    } else if (curve[maxL] < slot.goal) flag = 'harder';
    return { i, lv, ...slot, par: G.par, limit, two: G.par + Math.ceil((limit - G.par) / 2), stored, d, dStored, window: w,
      pInf: curve[maxL], pLim: curve[limit], pWeak: weak[limit], curve, m, flag };
  });
}
// The curve rule (as in Puppy Maze): the two levels after a HARD level are easier than it.
function curveProblems(rows, key = 'd') {
  const bad = [];
  rows.forEach((r, i) => {
    if (r.kind !== 'HARD') return;
    for (const j of [i + 1, i + 2]) if (rows[j] && rows[j][key] >= r[key]) bad.push(`level ${j + 1} is not easier than HARD level ${i + 1}`);
  });
  return bad;
}
module.exports = { graph, escapeCurve, policy, mistakes, slotOf, windowOf, difficulty, analyse, curveProblems, LEN, ONBOARDING };

if (require.main === module) {
  const LEVELS = require('../levels.js'), rows = analyse(LEVELS);
  if (args.includes('--json')) { // machine-readable rows (e.g. for charts)
    console.log(JSON.stringify(rows.map(r => ({ level: r.i + 1, name: r.lv.name, kind: r.kind, par: r.par, limit: r.limit, twoStar: r.two,
      target: r.target === undefined ? null : +r.target.toFixed(3), difficulty: +r.d.toFixed(3),
      withLimit: +r.pLim.toFixed(4), noLimit: +r.pInf.toFixed(4), weakPlayer: +r.pWeak.toFixed(4), flag: r.flag }))));
    process.exit(0);
  }
  const pct = v => (v * 100).toFixed(v >= .995 || v < .01 ? 1 : 0).padStart(5) + '%';
  console.log(`reference player q = ${Q}, danger awareness ${DANGER} (P = chance to escape on the first try; ∞ = no move limit)`);
  console.log(`difficulty D = −log2 P(limit) + ${LEN} × par; after onboarding: cycles of normal, normal+, HARD, easy, easy`);
  console.log(' #  level                kind      par  limit  slack  ★★ ≤  target      D   P(limit)   P(∞)   q=0.8   mistake: median / fatal');
  for (const r of rows) {
    const target = r.target !== undefined ? r.target.toFixed(2).padStart(6) : pct(r.goal);
    console.log(`${String(r.i + 1).padStart(2)}  ${r.lv.name.padEnd(20)} ${r.kind.padEnd(8)} ${String(r.par).padStart(4)} ${String(r.limit).padStart(6)} ${('+' + (r.limit - r.par)).padStart(6)} ${String(r.two).padStart(5)}  ${target}  ${r.d.toFixed(2).padStart(5)}  ${pct(r.pLim)}  ${pct(r.pInf)}  ${pct(r.pWeak)}     +${r.m.median} / ${r.m.total ? Math.round(r.m.fatal / r.m.total * 100) : 0}%${r.flag === 'harder' ? '   ⚠ harder than its slot' : r.flag === 'easier' ? '   ↓ easier than its slot' : ''}`);
  }
  const bad = curveProblems(rows);
  console.log(bad.length ? `\ncurve rule broken:\n  ${bad.join('\n  ')}` : '\ncurve rule ok: every HARD level is followed by two easier ones');
  if (args.includes('--write')) {
    const { writeField, writeFlag } = require('./levelfile.js');
    writeField('moves', rows.map(r => r.limit));
    writeFlag('hard', rows.map(r => r.kind === 'HARD'));
    console.log('wrote `moves` and the HARD flags into levels.js');
  }
}
