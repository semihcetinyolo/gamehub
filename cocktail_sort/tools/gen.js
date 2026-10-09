// Builds levels.js: for each levelOrder, makes candidate levels from the
// progression tier (+ per-level overrides below), solves each one, picks a
// candidate by the level's difficulty band, then sets the customers' patience
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

const ROOT = path.join(__dirname, '..');
const LEVEL_COUNT = 40;
const CANDIDATES = 24;
// Each customer gets the level's patience times one of these, so customers on
// screen together never share a timer. Taken from a shuffled copy, 5 at a time.
const PATIENCE_MULT = [0.75, 0.9, 1.0, 1.15, 1.3];

// Difficulty by level number n = levelOrder + 1 (what the player sees):
//   hard      every 10th level (10, 20, 30, 40)
//   veryHard  every other 5th level from 15 on (15, 25, 35)
//   the level after one of those is a breather; the others ramp up in between.
// band:   0 = easiest candidate, 1 = hardest (by moves needed serving in order)
// bury:   share of bottles dealt with the first orders' layers at the bottom
// wait:   patience is set so the worst customer uses this share of it at human pace
const DIFFICULTY = {
  normal:   { band: null, bury: null, wait: null, extraColor: 0, candidates: CANDIDATES },
  hard:     { band: 0.92, bury: 0.7,  wait: 0.78, extraColor: 0, candidates: 40 },
  veryHard: { band: 1,    bury: 0.9,  wait: 0.85, extraColor: 1, candidates: 40 },
};
function difficultyOf(order) {
  const n = order + 1;
  if (n % 10 === 0) return 'hard';
  if (n % 5 === 0 && n >= 15) return 'veryHard';
  return 'normal';
}
function bandOf(order) {
  const d = DIFFICULTY[difficultyOf(order)];
  if (d.band !== null) return d.band;
  const n = order + 1;
  if (n <= 4) return [0, 0.15, 0.3, 0.4][n - 1];
  return [0.65, 0.1, 0.3, 0.45, 0.6][n % 5];   // n%5: 0 -> level 5, 1 -> breather after a hard one
}

// How the free space in the normal bottles is spread, cycled by levelOrder.
// Bottle positions are shuffled too. The mixer always starts empty. No normal
// bottle starts empty: the game fills every empty one while refills are left.
const LAYOUTS = ['gaps', 'mixed'];

// Special levels: anything here replaces the computed value for that level.
//   layout: one of LAYOUTS
//   wait:   see DIFFICULTY (lower = more patient customers)
//   dup:    at least two customers want the same recipe
//   name:   level name (shown in the pause menu)
const OVERRIDES = {
  7:  { dup: true, name: 'İkiz sipariş' },
  12: { layout: 'gaps', name: 'Yarım şişeler' },
  20: { freeUnits: 8, layout: 'mixed', wait: 0.5, name: 'Sakin akşam' },
  22: { dup: true },
  27: { wait: 0.75, name: 'Yoğun saat' },
  33: { maxActiveCustomers: 2, name: 'Tek tek' },
  38: { layout: 'gaps', name: 'Dolu tezgâh' },
};

// Coffee levels: level numbers 8, 13, 18, ... (n % 5 === 3 from 8 on), never a
// hard / very hard one. Colours come from the theme's palette (progression.js).
function themeOf(order) {
  const n = order + 1;
  return n >= 8 && n % 5 === 3 ? 'coffee' : 'cocktail';
}

const NAME_SEED = {
  'purple,orange,pink,pink': 'Berry Sunrise',
  'pink,orange,orange,orange': 'Citrus Kiss',
  'orange,purple,orange,purple': 'Twilight',
};
// Names are picked by the recipe's main colour (most layers; ties -> top layer).
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
const names = Object.assign({}, NAME_SEED);
const namePos = {};
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
  const band = bandOf(order);
  return Object.assign({}, P.COMMON, {
    bottleCount: tier.bottleCount, freeUnits: tier.freeUnits, refillCount: tier.refillCount,
    colorCount: Math.min(4, tier.colorCount + d.extraColor),
    theme: themeOf(order),
    layout: LAYOUTS[order % LAYOUTS.length],
    difficulty, band, candidates: d.candidates,
    bury: d.bury !== null ? d.bury : 0.2 + 0.4 * band,
    wait: d.wait !== null ? d.wait : 0.6 + 0.15 * band,
  }, OVERRIDES[order] || {});
}

// Units per normal bottle for a layout with `freeUnits` empty slots in total.
function layoutFill(spec, r) {
  const n = spec.bottleCount - 1, cap = spec.bottleCapacity;
  const fill = Array(n).fill(cap);
  let free = spec.freeUnits;
  // 'gaps' spreads one empty slot per bottle, 'mixed' makes them two deep
  const deep = spec.layout === 'mixed' ? 2 : 1;
  for (let i = 0; free > 0; i = (i + 1) % n) {
    const take = Math.min(deep, free, fill[i] - 1);
    if (take > 0) { fill[i] -= take; free -= take; }
  }
  return shuffle(r, fill);
}

// One random candidate: recipes, then their layers dealt into the normal
// bottles (the first orders) and the refill batches (the later orders, mixed,
// one layer swapped with the next batch now and then). Some bottles are
// "buried": the layers the first orders need go to the bottom.
function candidate(spec, r) {
  const colors = P.THEMES[spec.theme].palette.slice(0, spec.colorCount);
  const cap = spec.bottleCapacity;
  const fill = layoutFill(spec, r);
  const units = fill.reduce((a, b) => a + b, 0);
  if (units % cap) throw new Error(`${spec.bottleCount} bottles with ${spec.freeUnits} free slots: ${units} layers is not whole orders`);
  const m = units / cap;
  spec.orderCount = m + spec.refillCount;
  let recipes;
  do {
    recipes = [];
    for (let i = 0; i < spec.orderCount; i++) {
      let s;
      do s = Array.from({ length: cap }, () => pick(r, colors));
      while (new Set(s).size < 2);
      recipes.push(s);
    }
    if (spec.dup) recipes[1 + Math.floor(r() * (recipes.length - 1))] = recipes[0].slice();
  } while (colors.some(c => !recipes.some(s => s.includes(c))) ||
           (!spec.dup && new Set(recipes.map(String)).size < recipes.length));

  const start = shuffle(r, recipes.slice(0, m).flatMap((s, i) => s.map(c => ({ c, need: i }))));
  const bottles = [[]];                    // index 0 = the mixer, starts empty
  let at = 0;
  for (const n of fill) {
    const b = start.slice(at, at + n);
    at += n;
    if (r() < spec.bury) b.sort((x, y) => x.need - y.need);
    bottles.push(b.map(u => u.c));
  }
  const refills = recipes.slice(m).map(s => s.slice());
  for (let j = 0; j + 1 < refills.length; j++) {
    if (r() < 0.5) {
      const a = Math.floor(r() * cap), b = Math.floor(r() * cap);
      [refills[j][a], refills[j + 1][b]] = [refills[j + 1][b], refills[j][a]];
    }
  }
  refills.forEach(b => shuffle(r, b));
  return { recipes, bottles, refills };
}

// Smallest base patience (5 s steps) where the worst customer waits at most
// `wait` of their patience along the given solution.
function fitPatience(level, actions, mults, wait) {
  for (let base = 20; base <= 240; base += 5) {
    level.orders.forEach((o, i) => { o.patience = Math.round(base * mults[i]); });
    level.customerPatienceSeconds = base;
    if (Solver.timing(level, actions).ratio <= wait) return base;
  }
  return null;
}

function build(order) {
  const spec = specFor(order);
  const r = rng(order * 7919 + 17);
  const ok = [];
  for (let tries = 0; ok.length < spec.candidates && tries < spec.candidates * 4; tries++) {
    const c = candidate(spec, r);
    const level = {
      levelOrder: order,
      bottleCount: spec.bottleCount,
      bottleCapacity: spec.bottleCapacity,
      mixer: 0,
      theme: spec.theme,
      initialBottles: c.bottles,
      refills: c.refills,
      orders: c.recipes.map(layers => ({ layers })),
      customerPatienceSeconds: 0,
      maxActiveCustomers: spec.maxActiveCustomers,
      startingHearts: spec.startingHearts,
    };
    // difficulty = moves when serving strictly in arrival order (one customer
    // at a time); patience comes from the quicker of that and the free plan
    const strict = Solver.solve(Object.assign({}, level, { maxActiveCustomers: 1 }), { widths: [300, 1500] });
    const free = Solver.solve(level, { widths: [300, 1500] });
    if (!strict || !free) continue;
    ok.push({ level, strict, free, score: strict.moves / c.recipes.length });
  }
  if (!ok.length) throw new Error(`level ${order}: no candidate solved`);
  ok.sort((a, b) => a.score - b.score);
  const best = ok[Math.min(ok.length - 1, Math.round(spec.band * (ok.length - 1)))];
  const L = best.level;
  const mults = [];
  while (mults.length < L.orders.length) mults.push(...shuffle(r, PATIENCE_MULT.slice()));
  const plans = [best.strict, best.free].map(s => ({ s, base: fitPatience(L, s.actions, mults, spec.wait) }))
    .filter(p => p.base !== null).sort((a, b) => a.base - b.base);
  if (!plans.length) throw new Error(`level ${order}: no patience fits`);
  fitPatience(L, plans[0].s.actions, mults, spec.wait);
  const sol = plans[0].s;
  sol.timing = Solver.timing(L, sol.actions);
  if (spec.difficulty !== 'normal') L.difficulty = spec.difficulty;
  if (spec.name) L.name = spec.name;
  L.orders.forEach(o => { o.name = recipeName(o.layers); o.coins = Core.orderPrice(o.layers); });
  const errs = Core.validateLevel(Core.resolveLevel(L));
  if (errs.length) throw new Error(`level ${order}: ${errs.join('; ')}`);
  return { level: L, sol, pool: ok.length, strictMoves: best.strict.moves };
}

function fmtLevel(L) {
  const arr = a => '[' + a.map(c => `'${c}'`).join(', ') + ']';
  const lines = [
    `  {`,
    `    levelOrder: ${L.levelOrder},` + (L.difficulty ? ` difficulty: '${L.difficulty}',` : '') + (L.name ? ` name: '${L.name}',` : ''),
    `    theme: '${L.theme}', bottleCount: ${L.bottleCount}, bottleCapacity: ${L.bottleCapacity}, mixer: ${L.mixer},`,
    `    customerPatienceSeconds: ${L.customerPatienceSeconds}, maxActiveCustomers: ${L.maxActiveCustomers}, startingHearts: ${L.startingHearts},`,
    `    initialBottles: [`,
    ...L.initialBottles.map(b => `      ${arr(b)},`),
    `    ],`,
    `    refills: [`,
    ...L.refills.map(b => `      ${arr(b)},`),
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
    const { level, sol, pool, strictMoves } = build(o);
    out.push(level);
    sols[o] = { moves: sol.moves, ratio: +sol.timing.ratio.toFixed(3), actions: sol.actions };
    console.log(`L${String(o).padStart(2)}  ${level.bottleCount} bottles  ${level.orders.length} orders  ` +
      `${sol.moves} moves (${strictMoves} in order)  patience ${level.customerPatienceSeconds}s  wait ${(sol.timing.ratio * 100).toFixed(0)}%  pool ${pool}  ${Date.now() - t0}ms` +
      (level.theme !== 'cocktail' ? `  ${level.theme}` : '') + (level.difficulty ? `  ${level.difficulty.toUpperCase()}` : '') + (level.name ? `  "${level.name}"` : ''));
  }
  if (only.length) { if (process.env.SHOW) console.log(out.map(fmtLevel).join('\n')); return; }
  const head = `// GENERATED by tools/gen.js — edit tools/gen.js (or progression.js) and rerun.\n` +
    `// Layers are listed bottom -> top. initialBottles[mixer] is the preparation vessel
// (any colour on any colour; orders are served from it), the others only take a
// layer onto the same colour or when empty. refills = mixed batches that refill
// a normal bottle when a pour leaves it empty, in that order. Every level is solver-verified (tools/verify.js).\n`;
  fs.writeFileSync(path.join(ROOT, 'levels.js'),
    head + `window.COCKTAIL_LEVELS = [\n${out.map(fmtLevel).join('\n')}\n];\n`);
  fs.writeFileSync(path.join(__dirname, 'solutions.json'), JSON.stringify(sols));
  console.log(`wrote ${out.length} levels`);
}

main();
