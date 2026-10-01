#!/usr/bin/env node
// Suggest the level order that best fits the difficulty curve of tools/limits.js (onboarding 1–6,
// then cycles of normal, normal+, HARD, easy, easy), using the levels that exist. Onboarding stays
// where it is; the other levels are shuffled into the cycle slots by simulated annealing so each
// level's difficulty lands as close as possible to its slot's target, under these rules:
//   - a mechanic's first level (its introduction) comes before every other level that uses it and
//     sits in an easy slot; the introductions keep their order (wafer, key, stone, plate);
//   - levels with a `feature` tag (stones, plates) keep their order;
//   - the last level stays last, every HARD level is followed by two easier ones, and levels move
//     no further than needed.
//   node tools/curve-plan.js           print the suggested order
//   node tools/curve-plan.js --write   reorder levels.js (then run: node tools/limits.js --write)
const LEVELS = require('../levels.js');
const { analyse, slotOf, ONBOARDING } = require('./limits.js');

const rows = analyse(LEVELS), n = LEVELS.length, free = rows.slice(ONBOARDING).map(r => r.i);
const MECHANICS = { w: 'wafer', k: 'key', o: 'stone', b: 'plate' };
const uses = rows.map(r => Object.keys(MECHANICS).filter(c => r.lv.grid.some(row => row.includes(c))));
const intro = {}; // mechanic -> index of the first level (current order) that uses it
for (const r of rows) for (const c of uses[r.i]) if (intro[c] === undefined) intro[c] = r.i;
const introOrder = Object.keys(MECHANICS).map(c => intro[c]).filter(i => i !== undefined && i >= ONBOARDING);
const tagged = rows.filter(r => r.lv.feature && r.i >= ONBOARDING).map(r => r.i); // in their current order
const slots = free.map((_, k) => slotOf(ONBOARDING + k, n));
const got = (i, s) => s.kind === 'easy' ? rows[i].window.dMin : Math.min(rows[i].window.dMax, Math.max(rows[i].window.dMin, s.target));

function cost(order) { // order[k] = level (current index) in cycle slot k
  const pos = {}; order.forEach((i, k) => pos[i] = k);
  const g = order.map((i, k) => got(i, slots[k]));
  let c = 0;
  order.forEach((i, k) => {
    const s = slots[k], w = rows[i].window; let e = Math.abs(g[k] - s.target);
    if (s.kind === 'easy' && w.dMin > s.target) e *= 2.5;           // a breather must really be easy
    if (s.kind === 'HARD' && w.dMax < s.target) e *= 1.5;
    c += e * e * 10 + e + .015 * Math.abs(ONBOARDING + k - i);        // fit, then stay near the old place
    for (const ch of uses[i]) if (intro[ch] >= ONBOARDING && intro[ch] !== i && pos[intro[ch]] > k) c += 50;
    if (introOrder.includes(i) && s.kind !== 'easy') c += 8;
    if (s.kind === 'HARD') for (const j of [k + 1, k + 2]) if (j < order.length && g[j] >= g[k]) c += 20;
  });
  for (const seq of [introOrder, tagged]) for (let a = 1; a < seq.length; a++) if (pos[seq[a]] < pos[seq[a - 1]]) c += 30;
  if (order[order.length - 1] !== n - 1) c += 3;
  return c;
}

let seed = 1; const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
let best = free, bestCost = cost(free);
for (let run = 0; run < 12; run++) {
  let cur = [...free].sort(() => rand() - .5), cc = cost(cur);
  for (let it = 0, temp = 5; it < 60000; it++, temp *= .99985) {
    const a = Math.floor(rand() * cur.length), b = Math.floor(rand() * cur.length); if (a === b) continue;
    [cur[a], cur[b]] = [cur[b], cur[a]]; const nc = cost(cur);
    if (nc <= cc || rand() < Math.exp((cc - nc) / temp)) cc = nc; else [cur[a], cur[b]] = [cur[b], cur[a]];
  }
  if (cc < bestCost) { bestCost = cc; best = [...cur]; }
}
const order = [...rows.slice(0, ONBOARDING).map(r => r.i), ...best];
console.log(' #  kind      target  level                 was  par   fits');
order.forEach((i, k) => {
  const s = slotOf(k, n), r = rows[i], a = k < ONBOARDING ? null : got(i, s);
  console.log(`${String(k + 1).padStart(2)}  ${s.kind.padEnd(8)} ${s.target !== undefined ? s.target.toFixed(2).padStart(6) : '     -'}  ${r.lv.name.padEnd(20)} ${String(i + 1).padStart(4)} ${String(r.par).padStart(4)}   ${a === null ? '' : a.toFixed(2) + (Math.abs(a - s.target) > .15 ? ' *' : '')}`);
});
if (process.argv.includes('--write')) {
  require('./levelfile.js').reorder(order);
  console.log('\nreordered levels.js — now run: node tools/limits.js --write');
}
