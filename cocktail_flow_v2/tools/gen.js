// node tools/gen.js  ->  levels.js
// Builds every level from progression.js: random recipes, then the supply lanes.
// Lanes start in a serving order dealt over the 3 lanes, then get shuffled a
// little; each candidate is measured (core.js): `need` = fewest belt slots that
// still serve everything, `jam` = share of shortsighted plays that jam the belt
// with the level's slots. The candidate whose jam is nearest the level's target wins.
'use strict';
const fs = require('fs');
const path = require('path');
const P = require('../progression.js');
const Core = require('../core.js');

const COUNT = 30;
const CANDIDATES = 40;
const NAMES = ['Mango Tango', 'Pink Lagoon', 'Cherry Bloom', 'Sunset Fizz', 'Peach Bellini', 'Ruby Spritz',
  'Berry Sunrise', 'Citrus Kiss', 'Twilight', 'Honey Glow', 'Harvest Moon', 'Lime Breeze', 'Violet Dream',
  'Tropic Wave', 'Blue Lagoon', 'Coral Reef', 'Plum Punch', 'Kiwi Cooler', 'Neon Nights', 'Velvet Rose'];

let seed = 20261009;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const pick = a => a[Math.floor(rnd() * a.length)];

const hard = n => n >= 4 && n % 5 === 4;
// target jam share: 0 for the first two levels, then a slow ramp; hard levels
// spike, the level after a hard one breathes
function targetOf(n) {
  if (n < 2) return 0;
  let t = 0.04 + 0.3 * (n - 2) / (COUNT - 3);
  if (hard(n)) t += 0.15;
  else if (n > 4 && hard(n - 1)) t -= 0.06;
  return Math.max(0, t);
}

function makeOrders(tier) {
  const colors = P.PALETTE.slice(0, tier.colors);
  for (;;) {
    const orders = [];
    for (let i = 0; i < tier.orders; i++) {
      let layers;
      do layers = Array.from({ length: tier.depth }, () => pick(colors));
      while (tier.depth > 1 && new Set(layers).size < 2);
      orders.push(layers);
    }
    if (new Set(orders.flat()).size === colors.length) return orders;
  }
}

// The colours in an order the seated customers could take them, one random
// customer at a time.
function servingOrder(level) {
  const s = Core.initState(level), seq = [];
  while (s.done < level.orders.length) {
    const x = pick(s.seats.filter(q => q.o >= 0));
    const c = level.orders[x.o].layers[x.k];
    seq.push(c);
    x.k++;   // straight to this seat (settle would give it to the first in belt order)
    if (x.k === level.orders[x.o].layers.length) {
      s.done++;
      if (s.next < level.orders.length) { x.o = s.next++; x.k = 0; } else x.o = -1;
    }
  }
  return seq;
}

function deal(seq, lanes) {
  const out = Array.from({ length: lanes }, () => []);
  const max = Math.ceil(seq.length / lanes);
  for (const c of seq) pick(out.filter(l => l.length < max)).push(c);
  return out;
}

// swaps between nearby places (up to three apart) in two lanes
function shuffle(lanes, swaps) {
  for (let i = 0; i < swaps; i++) {
    const a = Math.floor(rnd() * lanes.length), b = Math.floor(rnd() * lanes.length);
    const p = Math.floor(rnd() * lanes[a].length);
    const q = Math.max(0, Math.min(lanes[b].length - 1, p + Math.floor(rnd() * 7) - 3));
    if (a === b && p === q) continue;
    [lanes[a][p], lanes[b][q]] = [lanes[b][q], lanes[a][p]];
  }
}

function build(n) {
  const tier = P.tierFor(n);
  const orders = makeOrders(tier);
  const patienceK = hard(n) ? 0.85 : 1;
  const names = NAMES.slice().sort(() => rnd() - 0.5);
  const base = {
    levelOrder: n, seats: tier.seats, lap: tier.lap,
    orders: orders.map((layers, i) => ({
      name: names[i % names.length], layers,
      patience: Math.round((P.PATIENCE_BASE + tier.patience * layers.length) * patienceK * (0.85 + 0.35 * rnd())),
      coins: Core.orderPrice(layers),
    })),
  };
  if (hard(n)) base.difficulty = 'hard';
  const target = targetOf(n);
  let best = null;
  for (let k = 0; k < CANDIDATES; k++) {
    const level = Object.assign({}, base, { lanes: [] });
    const total = orders.flat().length;
    level.lanes = deal(servingOrder(level), P.COMMON.lanes);
    shuffle(level.lanes, Math.round(total * rnd() * (n < 2 ? 0 : 0.6 + 1.6 * n / COUNT)));
    const need = Core.minBelt(Core.resolveLevel(level));
    const slack = Math.max(1, tier.slack - (hard(n) ? 1 : 0));
    level.beltSlots = Math.max(4, tier.seats + 1, need + slack);
    const L = Core.resolveLevel(level);
    const jam = Core.jamRate(L, level.beltSlots);
    const score = Math.abs(jam - target);
    if (!best || score < best.score) best = { level, score, need, jam };
  }
  return best;
}

const fmt = a => '[' + a.map(c => `'${c}'`).join(', ') + ']';
function emit(l) {
  return `  {\n    levelOrder: ${l.levelOrder},${l.difficulty ? ` difficulty: '${l.difficulty}',` : ''}\n` +
    `    seats: ${l.seats}, beltSlots: ${l.beltSlots}, lap: ${l.lap},\n` +
    `    lanes: [\n${l.lanes.map(x => '      ' + fmt(x) + ',').join('\n')}\n    ],\n` +
    `    orders: [\n${l.orders.map(o => `      { name: '${o.name}', layers: ${fmt(o.layers)}, patience: ${o.patience}, coins: ${o.coins} },`).join('\n')}\n    ],\n  },`;
}

const out = [];
for (let n = 0; n < COUNT; n++) {
  const b = build(n);
  out.push(b.level);
  console.log(`L${n + 1}${b.level.difficulty ? ' ' + b.level.difficulty : ''}: slots ${b.level.beltSlots} (need ${b.need}), jam ${(b.jam * 100).toFixed(0)}% (target ${(targetOf(n) * 100).toFixed(0)}%)`);
}
const head = `// GENERATED by tools/gen.js — edit tools/gen.js (or progression.js) and rerun.\n` +
  `// lanes[l] = the ingredients of supply lane l, front -> back (only the front one\n` +
  `// can be thrown on the belt). Order layers are bottom -> top; a customer takes\n` +
  `// only the next layer of their order. Every level is solver-verified (tools/verify.js).\n`;
fs.writeFileSync(path.join(__dirname, '..', 'levels.js'), head + 'window.BELT_LEVELS = [\n' + out.map(emit).join('\n') + '\n];\n');
