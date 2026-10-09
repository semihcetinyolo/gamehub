// Builds levels.js: for each levelOrder, makes candidate levels from the
// progression tier (+ per-level overrides below), solves each one, picks a
// candidate by measured difficulty (tools/difficulty.js), then sets the customers' patience
// from the human-pace timing of a solution.
//
//   node tools/gen.js            -> levels.js + tools/solutions.json
//   node tools/gen.js 12 13      -> only print those levels (no write; SHOW=1 prints the data)
'use strict';
const fs = require('fs');
const path = require('path');
const P = require('../progression.js');
const Core = require('../core.js');
const Solver = require('./solver.js');
const Difficulty = require('./difficulty.js');

const ROOT = path.join(__dirname, '..');
const LEVEL_COUNT = 40;
const LANES = 3;
const CANDIDATES = 28;
// Shortest patience any customer gets (s): enough to build a 4-layer drink from
// scratch at a calm pace, even when the plan had it nearly ready on arrival.
const MIN_PATIENCE = { normal: 25, hard: 22, veryHard: 20 };

// Difficulty by level number n = levelOrder + 1 (what the player sees):
//   hard      every 10th level (10, 20, 30, 40)
//   veryHard  every other 5th level from 15 on (15, 25, 35)
//   the level after one of those is a breather; the others ramp up in between.
// Difficulty is measured with the 3 empty preparation glasses counted as the
// player's free space (tools/difficulty.js): `dead` = share of sensible but
// shortsighted playthroughs that get stuck, `detours` = layers even the best
// plan has to park in a glass first. Each level picks the candidate whose dead
// share is nearest its target (targetOf); hard levels also want detours.
// minDetours: hard levels must need the glasses as parking space
// wait:       at human pace a customer uses at most this share of their patience;
//             each customer draws their own share from [wait - 0.3, wait]
const DIFFICULTY = {
  normal:   { minDetours: 0, wait: null, extraColor: 0, candidates: CANDIDATES },
  hard:     { minDetours: 1, wait: 0.78, extraColor: 0, candidates: 60 },
  veryHard: { minDetours: 1, wait: 0.85, extraColor: 1, candidates: 60 },
};
function difficultyOf(order) {
  const n = order + 1;
  if (n % 10 === 0) return 'hard';
  if (n % 5 === 0 && n >= 15) return 'veryHard';
  return 'normal';
}
// Target share of stuck playthroughs: 3% at level 1 rising to ~45% at level
// 40, a small ramp inside every block of 5, spikes on hard / very hard levels
// and a breather right after them.
function targetOf(order) {
  const n = order + 1;
  const base = 0.03 + 0.42 * Math.min(1, (n - 1) / 39);
  const d = difficultyOf(order);
  if (d === 'hard') return Math.min(0.75, base + 0.18);
  if (d === 'veryHard') return Math.min(0.8, base + 0.28);
  if (n > 10 && n % 5 === 1) return base * 0.45;
  return Math.max(0.01, base + [0.06, -0.06, -0.03, 0, 0.03][n % 5]);
}

// Special levels: anything here replaces the computed value for that level.
//   depth:  bottles per lane
//   wait:   see DIFFICULTY (lower = more patient customers)
//   dup:    at least two customers want the same recipe
//   name:   level name (shown in the pause menu)
const OVERRIDES = {
  0:  { buryMax: 0, mixMax: 0 },
  7:  { dup: true, name: 'İkiz sipariş' },
  20: { wait: 0.5, name: 'Sakin akşam' },
  22: { dup: true },
  27: { wait: 0.75, name: 'Yoğun saat' },
  33: { maxActiveCustomers: 2, name: 'Tek tek' },
  38: { depth: 5, name: 'Uzun kuyruk' },
};

// Coffee levels: level numbers 8, 13, 18, ... (n % 5 === 3 from 8 on), never a
// hard / very hard one. Colours come from the theme's palette (progression.js).
function themeOf(order) {
  const n = order + 1;
  return n >= 8 && n % 5 === 3 ? 'coffee' : 'cocktail';
}

const NAME_POOL = {
  espresso: ['Ristretto', 'Cortado', 'Americano', 'Long Black', 'Lungo', 'Red Eye', 'Café Noir',
    'Affogato', 'Café Cubano', 'Doppio', 'Dark Roast', 'Midnight Brew'],
  milk: ['Latte', 'Flat White', 'Cappuccino', 'Café au Lait', 'Breve', 'Cortadito', 'Milk Cloud',
    'Latte Macchiato', 'White Velvet', 'Morning Foam', 'Cloud Latte', 'Piccolo'],
  caramel: ['Caramel Macchiato', 'Caramel Latte', 'Salted Caramel', 'Toffee Nut Latte', 'Dulce de Leche',
    'Butterscotch Brew', 'Honey Latte', 'Golden Crema', 'Caramel Cloud', 'Toffee Twist'],
  lavender: ['Lavender Latte', 'Lavender Cloud', 'Violet Mocha', 'Lilac Cappuccino', 'Purple Haze Brew',
    'Moonlight Latte', 'Blossom Brew', 'Lavender Breeze'],
  pink: ['Pink Lagoon', 'Cherry Bloom', 'Ruby Spritz', 'Flamingo', 'Rose Garden', 'Bubblegum',
    'Raspberry Ripple', 'Hibiscus Cooler', 'Candy Cloud', 'Velvet Rose', 'Pomegranate Pop', 'Wild Berry',
    'Dragonfruit Dream', 'Lychee Love', 'Blossom Fizz', 'Strawberry Fields', 'Pink Sky', 'Rosé Spritz'],
  orange: ['Mango Tango', 'Sunset Fizz', 'Peach Bellini', 'Golden Hour', 'Papaya Pop', 'Tangerine Dream',
    'Sundown', 'Fizzy Peach', 'Honey Glow', 'Firecracker', 'Tiki Torch', 'Copper Sky', 'Harvest Moon',
    'Ember', 'Sunrise Spritz', 'Merry Mango', 'Apricot Glow', 'Desert Bloom'],
  purple: ['Velvet Dusk', 'Grape Escape', 'Midnight Plum', 'Lavender Haze', 'Plum Blossom', 'Orchid Mist',
    'Lilac Lane', 'Violet Hour', 'Moonbeam', 'Aurora', 'Cosmo Glow', 'Pixie Punch', 'Fig & Fizz',
    'Blackberry Night', 'Amethyst', 'Starry Night'],
  lime: ['Lime Spark', 'Neon Mojito', 'Kiwi Kick', 'Electric Lime', 'Jade Garden', 'Mint Breeze',
    'Melon Ball', 'Cactus Cooler', 'Jungle Bird', 'Sweet Pea', 'Matcha Fizz', 'Green Fairy',
    'Cucumber Cool', 'Emerald Isle', 'Basil Smash', 'Lemon-Lime'],
};
const names = {};
const namePos = {};
// Names are picked by the recipe's main colour (most layers; ties -> top layer).
function recipeName(layers) {
  const k = layers.join(',');
  if (!names[k]) {
    const count = {};
    for (const c of layers) count[c] = (count[c] || 0) + 1;
    const main = [...layers].reverse().sort((a, b) => count[b] - count[a])[0];
    const pool = NAME_POOL[main] || NAME_POOL.pink;
    const i = namePos[main] = (namePos[main] || 0);
    namePos[main]++;
    const round = Math.floor(i / pool.length);
    names[k] = pool[i % pool.length] + (round ? ` No.${round + 1}` : '');
  }
  return names[k];
}

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
const pick = (r, a) => a[Math.floor(r() * a.length)];
function shuffle(r, a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function specFor(order) {
  const tier = P.tierFor(order);
  const difficulty = difficultyOf(order);
  const d = DIFFICULTY[difficulty];
  const target = targetOf(order);
  return Object.assign({}, P.COMMON, {
    depth: tier.depth,
    colorCount: Math.min(4, tier.colorCount + d.extraColor),
    // each candidate draws its own mix / bury up to these, for a spread of difficulty
    mixMax: Math.min(0.5, tier.mix * 2 + (difficulty === 'normal' ? 0 : 0.1)),
    buryMax: 1,
    theme: themeOf(order),
    difficulty, target, minDetours: d.minDetours, candidates: d.candidates,
    wait: d.wait !== null ? d.wait : 0.6 + 0.3 * Math.min(1, target / 0.6),
  }, OVERRIDES[order] || {});
}

// One random candidate: LANES × depth recipes in queue order. Row k (the k-th
// bottle of every lane) gets the layers of orders 3k..3k+2, shuffled; then
// some layers trade places with the row behind (spec.mix), so an on-screen
// order may need a layer that is still in the back. Some bottles are "buried":
// the layers the earliest orders need go to the bottom.
function candidate(spec, r) {
  const colors = P.THEMES[spec.theme].palette.slice(0, spec.colorCount);
  const cap = spec.bottleCapacity;
  const orderCount = LANES * spec.depth;
  let recipes;
  do {
    recipes = [];
    for (let i = 0; i < orderCount; i++) {
      let s;
      do s = Array.from({ length: cap }, () => pick(r, colors));
      while (new Set(s).size < 2);
      recipes.push(s);
    }
    if (spec.dup) recipes[1 + Math.floor(r() * (recipes.length - 1))] = recipes[0].slice();
  } while (colors.some(c => !recipes.some(s => s.includes(c))) ||
           (!spec.dup && new Set(recipes.map(String)).size < recipes.length));

  const rows = [];
  for (let k = 0; k < spec.depth; k++)
    rows.push(shuffle(r, recipes.slice(k * LANES, k * LANES + LANES).flatMap((s, i) => s.map(c => ({ c, need: k * LANES + i })))));
  const swaps = Math.round(spec.mix * LANES * cap);
  for (let k = 0; k + 1 < spec.depth; k++) {
    for (let n = 0; n < swaps; n++) {
      const a = Math.floor(r() * rows[k].length), b = Math.floor(r() * rows[k + 1].length);
      [rows[k][a], rows[k + 1][b]] = [rows[k + 1][b], rows[k][a]];
    }
  }
  const lanes = Array.from({ length: LANES }, () => []);
  rows.forEach(row => {
    for (let l = 0; l < LANES; l++) {
      const b = row.slice(l * cap, l * cap + cap);
      if (r() < spec.bury) b.sort((x, y) => x.need - y.need);
      lanes[l].push(b.map(u => u.c));
    }
  });
  return { recipes, lanes };
}

// Patience per customer, from how long they actually wait at human pace in
// the best plan (plans[0]), allowing for a player who serves strictly in
// arrival order instead (plans[1]) up to 1.4x + 5 s, divided by a share drawn
// for them. So a customer who arrives late may well be an impatient one, and
// the order of the timers is not predictable.
function fitPatience(level, plans, spec, r) {
  level.orders.forEach(o => { o.patience = 1; });
  const waits = plans.map(p => Solver.timing(level, p.actions).waits);
  const floor = MIN_PATIENCE[spec.difficulty] || MIN_PATIENCE.normal;
  level.orders.forEach((o, i) => {
    const best = waits[0][i] || 0;
    const wait = Math.min(Math.max(...waits.map(w => w[i] || 0)), best * 1.4 + 5);
    const share = spec.wait - 0.3 * r();
    o.patience = Math.max(floor, Math.ceil(wait / share));
  });
  const p = level.orders.map(o => o.patience).sort((a, b) => a - b);
  level.customerPatienceSeconds = p[Math.floor(p.length / 2)];   // median, shown as a fallback only
}

function build(order) {
  const spec = specFor(order);
  const r = rng(order * 7919 + 17);
  const ok = [];
  for (let tries = 0; ok.length < spec.candidates && tries < spec.candidates * 4; tries++) {
    const c = candidate(Object.assign({}, spec, { mix: r() * spec.mixMax, bury: r() * spec.buryMax }), r);
    const level = {
      levelOrder: order,
      theme: spec.theme,
      bottleCapacity: spec.bottleCapacity,
      prepCount: spec.prepCount,
      lanes: c.lanes,
      orders: c.recipes.map(layers => ({ layers })),
      customerPatienceSeconds: 0,
      maxActiveCustomers: spec.maxActiveCustomers,
      startingHearts: spec.startingHearts,
    };
    const free = Solver.solve(level, { widths: [300, 1500] });
    if (!free) continue;
    const layers = c.recipes.length * spec.bottleCapacity;
    const m = Difficulty.measure(level, { seed: order * 31 + tries });
    const detours = free.moves - layers;
    // distance from the target; hard levels that never need a parked layer lose
    const score = Math.abs(m.deadRate - spec.target) + Math.max(0, spec.minDetours - detours) * 0.3;
    ok.push({ level, free, dead: m.deadRate, detours, score });
  }
  if (!ok.length) throw new Error(`level ${order}: no candidate solved`);
  ok.sort((a, b) => a.score - b.score);
  const best = ok[0];
  const L = best.level;
  const strict = Solver.solve(Object.assign({}, L, { maxActiveCustomers: 1 }), { widths: [300, 1500] });
  fitPatience(L, [best.free, strict].filter(Boolean), spec, r);
  const sol = best.free;
  sol.timing = Solver.timing(L, sol.actions);
  if (spec.difficulty !== 'normal') L.difficulty = spec.difficulty;
  if (spec.name) L.name = spec.name;
  L.orders.forEach(o => { o.name = recipeName(o.layers); o.coins = Core.orderPrice(o.layers); });
  const errs = Core.validateLevel(Core.resolveLevel(L));
  if (errs.length) throw new Error(`level ${order}: ${errs.join('; ')}`);
  return { level: L, sol, pool: ok.length, dead: best.dead, detours: best.detours, target: spec.target };
}

function fmtLevel(L) {
  const arr = a => '[' + a.map(c => `'${c}'`).join(', ') + ']';
  const lines = [
    `  {`,
    `    levelOrder: ${L.levelOrder},` + (L.difficulty ? ` difficulty: '${L.difficulty}',` : '') + (L.name ? ` name: '${L.name}',` : ''),
    `    theme: '${L.theme}', bottleCapacity: ${L.bottleCapacity}, prepCount: ${L.prepCount},`,
    `    customerPatienceSeconds: ${L.customerPatienceSeconds}, maxActiveCustomers: ${L.maxActiveCustomers}, startingHearts: ${L.startingHearts},`,
    `    lanes: [`,
    ...L.lanes.map(lane => `      [${lane.map(arr).join(', ')}],`),
    `    ],`,
    `    orders: [`,
    ...L.orders.map(o => `      { name: '${o.name.replace(/'/g, "\\'")}', layers: ${arr(o.layers)}, patience: ${o.patience}, coins: ${o.coins} },`),
    `    ],`,
    `  },`,
  ];
  return lines.join('\n');
}

function main() {
  const only = process.argv.slice(2).map(Number);
  const orders = only.length ? only : Array.from({ length: LEVEL_COUNT }, (_, i) => i);
  const out = [], sols = {};
  for (const o of orders) {
    const t0 = Date.now();
    const { level, sol, pool, dead, detours, target } = build(o);
    out.push(level);
    sols[o] = { moves: sol.moves, ratio: +sol.timing.ratio.toFixed(3), actions: sol.actions };
    console.log(`L${String(o).padStart(2)}  ${level.lanes[0].length} deep  ${level.orders.length} orders  ` +
      `${sol.moves} moves  detours ${detours}  stuck ${(dead * 100).toFixed(0)}% (target ${(target * 100).toFixed(0)}%)  patience ${level.customerPatienceSeconds}s  wait ${(sol.timing.ratio * 100).toFixed(0)}%  pool ${pool}  ${Date.now() - t0}ms` +
      (level.theme !== 'cocktail' ? `  ${level.theme}` : '') + (level.difficulty ? `  ${level.difficulty.toUpperCase()}` : '') + (level.name ? `  "${level.name}"` : ''));
  }
  if (only.length) { if (process.env.SHOW) console.log(out.map(fmtLevel).join('\n')); return; }
  const head = `// GENERATED by tools/gen.js — edit tools/gen.js (or progression.js) and rerun.
// Layers are listed bottom -> top. lanes[l] = the supply bottles of lane l, front
// -> back: only the front one can be poured from / into (same colour only), the
// next one is shown behind it and moves up when the front one runs empty. The
// prepCount preparation glasses take any colour; a glass that equals an
// on-screen order is served. Every level is solver-verified (tools/verify.js).\n`;
  fs.writeFileSync(path.join(ROOT, 'levels.js'),
    head + `window.FLOW_LEVELS = [\n${out.map(fmtLevel).join('\n')}\n];\n`);
  fs.writeFileSync(path.join(__dirname, 'solutions.json'), JSON.stringify(sols));
  console.log(`wrote ${out.length} levels`);
}

main();
