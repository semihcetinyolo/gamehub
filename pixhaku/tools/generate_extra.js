#!/usr/bin/env node
'use strict';
// Levels 101–340, played after the 100 picture levels. They have no picture: the game draws a
// mosaic of the solution as the reward.
//   101–200  Classic: numbers only, ten blocks of ten that each climb from medium to expert
//   201–290  one clue type per block of ten, in the order the picture levels introduce them
//   291–340  All Together: 15 levels with two clue types, 15 with three, 12 with four, 8 with five
// Writes tools/extra/<order>.json { order, section, feature, spec, puzzle }; build_pack.js adds
// them to the game. Resumable: existing files are kept, pass orders to remake them.
//   node tools/generate_extra.js [--workers 10] [order ...]
const fs = require('fs'), path = require('path');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const { generatePuzzle, analyse, puzzleClues } = require('./shikaku');

const DIR = path.join(__dirname, 'extra');
const lerp = (a, b, t) => a + (b - a) * t;
// the order the picture levels bring them in; each gets ten levels from 201 on
const FEATURES = [
  ['hidden', 'Mystery Numbers', { hiddenCount: 2 }, { hiddenCount: 3 }],
  ['rect', 'Tall & Wide', { shapes: 2, shapeKinds: ['tall', 'wide'] }, { shapes: 4, shapeKinds: ['tall', 'wide'] }],
  ['square', 'Squares', { shapes: 1, shapeKinds: ['square'] }, { shapes: 2, shapeKinds: ['square'] }],
  ['parity', 'Odd or Even', { parity: 3 }, { parity: 5 }],
  ['more', 'More Than', { more: 3 }, { more: 4 }],
  ['corner', 'Corners', { corners: 3 }, { corners: 5 }],
  ['lock', 'Locks', { lockCount: 1 }, { lockCount: 2 }],
  ['twins', 'Twin Mysteries', { links: 1 }, { links: 2 }],
  ['keylock', 'Key Locks', { keyLocks: 1 }, { keyLocks: 2 }],
];
// one clue type's share in a mixed level
const UNIT = {
  hidden: { hiddenCount: 1 }, rect: { shapes: 1 }, square: { shapes: 1 }, parity: { parity: 2 }, more: { more: 2 },
  corner: { corners: 2 }, lock: { lockCount: 1 }, twins: { links: 1 }, keylock: { keyLocks: 1 },
};
const MIX_SIZES = [...Array(15).fill(2), ...Array(15).fill(3), ...Array(12).fill(4), ...Array(8).fill(5)];
const LAST = 290 + MIX_SIZES.length;
// each level takes the clue types used least so far (fixed tie order), never the same set twice
const MIXES = (() => {
  const used = Object.fromEntries(FEATURES.map(([f]) => [f, 0])), sets = new Set();
  return MIX_SIZES.map((k, j) => {
    const order = FEATURES.map(([f], i) => [f, used[f], (i * 7 + j * 4) % FEATURES.length]).sort((x, y) => x[1] - y[1] || x[2] - y[2]).map(([f]) => f);
    let pick = order.slice(0, k);
    for (let shift = 1; sets.has(pick.slice().sort().join()) && shift < order.length; shift++) pick = [...order.slice(0, k - 1), order[(k - 1 + shift) % order.length]];
    sets.add(pick.slice().sort().join());
    pick.forEach((f) => used[f]++);
    const extras = {};
    for (const f of pick) for (const [key, v] of Object.entries(UNIT[f])) extras[key] = (extras[key] || 0) + v;
    const kinds = [...(pick.includes('rect') ? ['tall', 'wide'] : []), ...(pick.includes('square') ? ['square'] : [])];
    if (kinds.length) { extras.shapeKinds = kinds; extras.shapes = Math.max(extras.shapes, kinds.length); }
    return { features: pick, extras };
  });
})();

function jobOf(order) {
  if (order <= 200) {
    const block = Math.floor((order - 101) / 10), pos = (order - 101) % 10;
    return { order, section: 'Classic', feature: null, extras: {}, effort: lerp(lerp(60, 115, block / 9), lerp(95, 150, block / 9), pos / 9) };
  }
  if (order <= 290) {
    const [feature, section, light, heavy] = FEATURES[Math.floor((order - 201) / 10)], pos = (order - 201) % 10;
    return { order, section, feature, extras: pos < 5 ? light : heavy, effort: lerp(55, 115, pos / 9) };
  }
  // effort climbs inside each group (pairs, threes, fours, fives) and from group to group
  const j = order - 291, k = MIX_SIZES[j], first = MIX_SIZES.indexOf(k), n = MIX_SIZES.filter((x) => x === k).length;
  const [lo, hi] = { 2: [70, 95], 3: [85, 112], 4: [100, 130], 5: [115, 150] }[k];
  return { order, section: 'All Together', feature: 'mix', features: MIXES[j].features, extras: MIXES[j].extras, effort: lerp(lo, hi, (j - first) / Math.max(1, n - 1)) };
}

// the spec style follows the effort: medium-like, hard-like or expert-like boards
function specOf(job, cols, rows) {
  const a = cols * rows, e = job.effort;
  const base = { cols, rows, maxTech: 4, effortTarget: Math.round(e), hiddenCount: 0, lockCount: 0, shapes: 0 };
  const style = e < 80 ? { start: [1, 2], pieces: [Math.round(a / 6.5), Math.round(a / 4)], t1Max: 0.42, decMin: 5, liveMin: 2.6 }
    : e < 115 ? { start: [1, 1], pieceStyle: 'big', pieces: [Math.round(a / 8.5), Math.round(a / 5.5)], t1Max: 0.34, decMin: 8, liveMin: 3, deepMin: 2, cornerMax: 0.45 }
    : { start: [0, 0], openTech: 3, calm: 0, pieceStyle: 'big', pieces: [Math.round(a / 8.5), Math.round(a / 5.5)], t1Max: 0.28, decMin: 9, liveMin: 3, deepMin: 3, cornerMax: 0.45 };
  return { ...base, ...style, ...job.extras };
}

const sizesFor = (e) => (e < 70 ? [[7, 8], [8, 8], [7, 9]] : e < 95 ? [[8, 9], [8, 10], [9, 9]] : e < 120 ? [[9, 10], [8, 11], [9, 11]] : [[9, 11], [10, 12], [10, 11]]);
const seedOf = (n) => (Math.imul(n, 2654435761) >>> 0) || 1;

function run(job) {
  let best = null;
  const tries = [];
  for (const [i, [cols, rows]] of [...sizesFor(job.effort), ...sizesFor(job.effort)].entries()) {
    const spec = specOf(job, cols, rows);
    const puzzle = generatePuzzle(cols, rows, spec, { seed: (seedOf(job.order) + i * 104729) >>> 0, tilings: 8, samples: 220, polish: 700, deadline: Date.now() + 60000 });
    if (!puzzle) { tries.push(`${cols}x${rows} none`); continue; }
    const a = analyse({ rows, cols, clues: puzzleClues(puzzle).solver });
    if (!a.unique || !a.solved) continue;
    const error = Math.abs(a.effort - spec.effortTarget);
    tries.push(`${cols}x${rows} ${a.effort}`);
    if (!best || error < best.error) best = { spec, puzzle, error, a };
    if (error <= 8) break;
  }
  if (!best) throw new Error(`${job.order}: no puzzle (${tries.join(', ')})`);
  const { order, section, feature, features } = job;
  fs.writeFileSync(path.join(DIR, `${order}.json`), JSON.stringify({ order, section, feature, ...(features ? { features } : {}), spec: best.spec, puzzle: best.puzzle }, null, 2) + '\n');
  return { order, section, features: job.features, size: `${best.spec.cols}x${best.spec.rows}`, effort: best.a.effort, target: Math.round(job.effort) };
}

if (!isMainThread) {
  try { parentPort.postMessage({ ok: run(workerData) }); } catch (e) { parentPort.postMessage({ error: String(e.message || e) }); }
} else {
  fs.mkdirSync(DIR, { recursive: true });
  const args = process.argv.slice(2);
  const wi = args.indexOf('--workers');
  const workers = wi >= 0 ? +args.splice(wi, 2)[1] : 8;
  const only = new Set(args.map(Number));
  const todo = [];
  for (let order = 101; order <= LAST; order++) {
    if (only.size ? only.has(order) : !fs.existsSync(path.join(DIR, `${order}.json`))) todo.push(jobOf(order));
  }
  todo.sort((x, y) => y.effort - x.effort); // the slow big ones first
  let cursor = 0, failures = 0;
  const next = async () => {
    while (cursor < todo.length) {
      const job = todo[cursor++];
      await new Promise((resolve) => {
        const w = new Worker(__filename, { workerData: job });
        w.once('message', (m) => { console.log(JSON.stringify(m)); if (m.error) failures++; resolve(); });
        w.once('error', (e) => { console.error(job.order, e); failures++; resolve(); });
      });
    }
  };
  Promise.all(Array.from({ length: workers }, next)).then(() => {
    console.log(`done: ${todo.length - failures}/${todo.length} made, ${failures} failed`);
    process.exitCode = failures ? 1 : 0;
  });
}
