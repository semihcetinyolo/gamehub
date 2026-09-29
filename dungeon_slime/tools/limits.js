#!/usr/bin/env node
// Move limits: the calculation behind every level's move budget ("hamle hakkı").
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
// P(∞) is the same with no budget: the level's own difficulty. The budget is chosen from a
// target curve over the level order (see the difficulty curve below).
//
//   node tools/limits.js              report (no changes)
//   node tools/limits.js --write      also store the budgets as `moves` in levels.js
//   node tools/limits.js --q 0.85     skill of the reference player (default 0.9)
//   node tools/limits.js --json       rows as JSON (for charts)
const E = require('../engine.js');
const LEVELS = require('../levels.js');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const Q = +opt('q', .9), WRITE = args.includes('--write');
const DANGER = +opt('danger', .2);

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
// Target first-try escape chance of the reference player (q, default 0.9 = one mistake in ten
// swipes) along the level order: tutorials almost always pass, each new mechanic is introduced
// gently, and the rest declines smoothly from 80% (level 7) to 40% (the last level); HARD levels
// sit 8 points lower. The budget is the smallest L ≥ par with P(L) ≥ target, but never less than
// par + one typical mistake (the level's median mistake cost; +2 in the tutorials), so a single
// ordinary slip is always forgiven (GDD: fair difficulty). A level whose own difficulty is already
// below its target (P(∞) too low) keeps a nearly invisible budget (≥ 92% of its escapes) and is
// flagged "harder than its slot"; one that stays clearly above its target even at the one-slip
// floor is flagged "easier than its slot" (onboarding levels are generous on purpose and are not
// flagged). Stars: ★★★ par, ★★ par + half the slack, ★ the budget.
// Onboarding (the hand-made teaching levels 1–6): a generous allowance that starts high and shrinks
// level by level until onboarding ends: at least +8 extra moves in level 1, then 7, 6, 5, 4, +3 in
// level 6. After that the normal calculation takes over (level 7 gets +4 from the curve).
const ONBOARDING = 6, ONBOARD_START = 8, ONBOARD_END = 3;
const onboardSlack = i => i >= ONBOARDING ? 0
  : Math.round(ONBOARD_START - (ONBOARD_START - ONBOARD_END) * i / Math.max(1, ONBOARDING - 1));
const INTROS = new Set(['Dikenlere Dikkat', 'Lav Koridoru', 'Gofret Kapısı', 'Şeker Anahtar', 'Yıldız Taşı', 'Taşın Yolu', 'Yıldızlı Düğme', 'Geçidi Aç']);
function targetOf(lv, i, n) {
  if (i < 4) return { role: 'tutorial', target: .97 };
  if (INTROS.has(lv.name)) return { role: 'intro', target: .88 };
  const base = .80 - .40 * Math.max(0, i - 6) / Math.max(1, n - 1 - 6);
  return lv.hard ? { role: 'hard', target: base - .08 } : { role: 'level', target: base };
}

const MAXL = 90, rows = [];
LEVELS.forEach((lv, i) => {
  const L = E.parse(lv), G = graph(L);
  if (!Number.isFinite(G.par)) throw new Error(`${lv.name}: unsolvable`);
  const maxL = Math.max(MAXL, G.par * 4);
  const curve = escapeCurve(G, Q, maxL), pInf = curve[maxL];
  const weak = escapeCurve(G, .8, maxL);                    // a weaker player, for reference
  const { role, target } = targetOf(lv, i, LEVELS.length);
  const harder = pInf < target;                           // the level alone is already harder
  const goal = harder ? pInf * .92 : Math.min(target, pInf * .995);
  const m = mistakes(G);
  let limit = G.par; while (limit < maxL && curve[limit] < goal - 1e-12) limit++;
  limit = Math.max(limit, G.par + (role === 'tutorial' ? 2 : Math.max(1, m.median))); // one slip is always forgiven
  limit = Math.max(limit, G.par + onboardSlack(i));                                   // onboarding: generous, shrinking
  const easier = !harder && i >= ONBOARDING && curve[limit] > target + .1;
  const two = G.par + Math.ceil((limit - G.par) / 2);
  rows.push({ i, lv, role, target, harder, easier, par: G.par, limit, two, pInf, pLim: curve[limit], pWeak: weak[limit], m });
});

if (args.includes('--json')) { // machine-readable rows (e.g. for charts)
  console.log(JSON.stringify(rows.map(r => ({ level: r.i + 1, name: r.lv.name, role: r.role, par: r.par, limit: r.limit, twoStar: r.two,
    target: +r.target.toFixed(4), withLimit: +r.pLim.toFixed(4), noLimit: +r.pInf.toFixed(4), weakPlayer: +r.pWeak.toFixed(4),
    flag: r.harder ? 'harder' : r.easier ? 'easier' : null }))));
  process.exit(0);
}
const pct = v => (v * 100).toFixed(v >= .995 || v < .01 ? 1 : 0).padStart(5) + '%';
console.log(`reference player q = ${Q}, danger awareness ${DANGER} (P = chance to escape on the first try; ∞ = no move limit)`);
console.log(' #  level                role      par  limit  slack  ★★ ≤  target  P(limit)   P(∞)   q=0.8   mistake: median cost / fatal');
for (const r of rows) {
  console.log(`${String(r.i + 1).padStart(2)}  ${r.lv.name.padEnd(20)} ${r.role.padEnd(8)} ${String(r.par).padStart(4)} ${String(r.limit).padStart(6)} ${('+' + (r.limit - r.par)).padStart(6)} ${String(r.two).padStart(5)}  ${pct(r.target)}  ${pct(r.pLim)}  ${pct(r.pInf)}  ${pct(r.pWeak)}     +${r.m.median} / ${r.m.total ? Math.round(r.m.fatal / r.m.total * 100) : 0}%${r.harder ? '   ⚠ harder than its slot' : r.easier ? '   ↓ easier than its slot' : ''}`);
}

if (WRITE) {
  const { writeField } = require('./levelfile.js');
  writeField('moves', rows.map(r => r.limit));
  console.log('\nwrote `moves` into levels.js');
}
module.exports = { graph, escapeCurve, policy };
