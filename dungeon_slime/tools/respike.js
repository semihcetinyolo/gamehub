#!/usr/bin/env node
// Re-place the spikes of the existing levels as 1-tile floor strips in front of walls
// (see tools/spikes.js). Old spike cells (which used to replace wall cells) become walls again,
// the level is solved without spikes, then the strips go on the faces that solution never
// touches, and spikes a reshape could land on become plain wall (no surprise deaths). Every level
// is re-verified; rewrites only the grids in levels.js.
//   node tools/respike.js [--p 0.6] [--seed 1]
const E = require('../engine.js');
const SPK = require('./spikes.js');
const LEVELS = require('../levels.js');
const { writeGrids } = require('./levelfile.js');

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1]]] : a, []));
const P = +(args.p || .6);
const PER = { 'Diken Tarlası': .9, 'Fabrika Kapısı': .85, 'Büyük Kaçış': .75, 'Dikenli Duvarlar': .7 };
let seed = +(args.seed || 1);
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

const grids = LEVELS.map((lv, i) => {
  if (!lv.grid.some(r => r.includes('*'))) return null; // levels without spikes stay as they are
  const bare = lv.grid.map(r => r.replace(/\*/g, '#'));
  const L0 = E.parse({ ...lv, grid: bare });
  const sol = E.solve(L0, E.initialState(L0), false, 80000);
  if (!sol) throw new Error(`${i + 1}. ${lv.name}: unsolvable even without spikes`);
  for (let attempt = 0; attempt < 20; attempt++) {
    const spiked = SPK.addFloorSpikes(bare, SPK.touchedCells(L0, sol.path), PER[lv.name] || P, rnd);
    const safe = SPK.defuseReshapeDeaths({ ...lv, grid: spiked }); // no surprise deaths
    if (safe.gateDeaths.length) continue;
    const L = E.parse({ ...lv, grid: safe.grid });
    const s2 = E.solve(L, E.initialState(L), false, 80000);
    if (s2 && !E.lint(L).length) { console.log(`${String(i + 1).padStart(2)}. ${lv.name.padEnd(18)} par ${sol.path.length} -> ${s2.path.length}`); return safe.grid; }
  }
  throw new Error(`${i + 1}. ${lv.name}: no valid spike layout`);
});
writeGrids(grids); // grids only: theme, jelly, feature and every other field stay untouched
