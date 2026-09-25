#!/usr/bin/env node
// Re-place the spikes of the existing levels as 1-tile floor strips in front of walls
// (see tools/spikes.js). Old spike cells (which used to replace wall cells) become walls again,
// the level is solved without spikes, then the strips go on the faces that solution never
// touches. Every level is re-verified; rewrites levels.js in place.
//   node tools/respike.js [--p 0.6] [--seed 1]
const fs = require('fs'), path = require('path');
const E = require('../engine.js');
const SPK = require('./spikes.js');
const LEVELS = require('../levels.js');

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1]]] : a, []));
const P = +(args.p || .6);
const PER = { 'Diken Tarlası': .9, 'Fabrika Kapısı': .85, 'Büyük Kaçış': .75, 'Dikenli Duvarlar': .7 };
let seed = +(args.seed || 1);
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

const out = LEVELS.map((lv, i) => {
  if (!lv.grid.some(r => r.includes('*'))) return lv; // tutorials have no spikes
  const bare = lv.grid.map(r => r.replace(/\*/g, '#'));
  const L0 = E.parse({ ...lv, grid: bare });
  const sol = E.solve(L0, E.initialState(L0), false, 80000);
  if (!sol) throw new Error(`${i + 1}. ${lv.name}: unsolvable even without spikes`);
  for (let attempt = 0; attempt < 20; attempt++) {
    const grid = SPK.addFloorSpikes(bare, SPK.touchedCells(L0, sol.path), PER[lv.name] || P, rnd);
    const L = E.parse({ ...lv, grid });
    const s2 = E.solve(L, E.initialState(L), false, 80000);
    if (s2 && !E.lint(L).length) { console.log(`${String(i + 1).padStart(2)}. ${lv.name.padEnd(18)} par ${sol.path.length} -> ${s2.path.length}`); return { ...lv, grid }; }
  }
  throw new Error(`${i + 1}. ${lv.name}: no valid spike layout`);
});

const js = s => "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
const file = path.join(__dirname, '..', 'levels.js');
const src = fs.readFileSync(file, 'utf8');
const header = src.slice(0, src.indexOf('(function (root) {'));
const body = out.map(lv => {
  const extra = (lv.hard ? ', hard: true' : '') + (lv.tip ? ', tip: ' + js(lv.tip) : '');
  return `    { name: ${js(lv.name)}${extra}, grid: [\n${lv.grid.map(r => `      '${r}',`).join('\n')}\n    ]},`;
}).join('\n');
fs.writeFileSync(file, header + `(function (root) {\n  const LEVELS = [\n${body}\n  ];\n  if (typeof module !== 'undefined' && module.exports) module.exports = LEVELS;\n  else root.LEVELS = LEVELS;\n})(this);\n`);
