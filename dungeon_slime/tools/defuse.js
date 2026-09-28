#!/usr/bin/env node
// Enforce the "no surprise death" rule on the existing levels: every spike segment that a reshape
// can land on becomes plain wall (same solid geometry, so routes and solutions stay the same).
// Deaths on closed gates cannot be fixed this way and are only reported. Rewrites levels.js
// in place (grids only).   node tools/defuse.js
const E = require('../engine.js');
const SPK = require('./spikes.js');
const { writeGrids } = require('./levelfile.js');
const LEVELS = require('../levels.js');

let gateLevels = 0;
const grids = LEVELS.map((lv, i) => {
  const before = E.solve(E.parse(lv), E.initialState(E.parse(lv)));
  const r = SPK.defuseReshapeDeaths(lv);
  const tag = `${String(i + 1).padStart(2)}. ${lv.name.padEnd(18)}`;
  if (r.gateDeaths.length) { gateLevels++; console.log(`${tag} ${r.gateDeaths.length} reshape death(s) on a closed gate — needs a design decision`); }
  if (!r.converted) return null;
  const L = E.parse({ ...lv, grid: r.grid });
  const after = E.solve(L, E.initialState(L));
  if (!after || E.lint(L).length) throw new Error(`${tag} broke after defusing`);
  console.log(`${tag} ${r.converted} spike tile(s) -> wall   par ${before.path.length} -> ${after.path.length}${r.complete ? '' : '   (state limit hit)'}`);
  return r.grid;
});
writeGrids(grids);
console.log(gateLevels ? `${gateLevels} level(s) still have reshape deaths on gates` : 'no reshape deaths left');
