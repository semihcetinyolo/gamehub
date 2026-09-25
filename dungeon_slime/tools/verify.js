#!/usr/bin/env node
// Checks every level: layout rules, solvable, par (min swipes), gem par, solution.
//   node tools/verify.js            report
//   node tools/verify.js --gems     also suggest gem cells (never touched by the optimal route, +1..+4 swipes)
const E = require('../engine.js');
const LEVELS = require('../levels.js');
const gems = process.argv.includes('--gems');
let bad = 0;
LEVELS.forEach((lv, i) => {
  const L = E.parse(lv);
  const lint = E.lint(L);
  if (lint.length) { bad++; console.log(`${i + 1}. ${lv.name}: ${lint.join('; ')}`); }
  const s = E.initialState(L);
  const sol = E.solve(L, s);
  if (!sol) { bad++; console.log(`${i + 1}. ${lv.name}: UNSOLVABLE`); return; }
  let line = `${String(i + 1).padStart(2)}. ${lv.name.padEnd(16)} par ${String(sol.path.length).padStart(2)}  states ${String(sol.explored).padStart(5)}`;
  if (L.hasGem) {
    const g = E.solve(L, s, true);
    line += g ? `  gemPar ${g.path.length}` : '  GEM UNREACHABLE';
    if (!g) bad++;
  }
  console.log(line + '\n      ' + sol.path.join(' '));
  if (gems && !L.hasGem) {
    // cells the optimal route sweeps over (body rects between path points)
    const hitCells = new Set(); let st = s;
    const mark = (a, b) => {
      const x0 = Math.floor(Math.min(a.x, b.x)), x1 = Math.ceil(Math.max(a.x, b.x) + a.w), y0 = Math.floor(Math.min(a.y, b.y)), y1 = Math.ceil(Math.max(a.y, b.y) + a.h);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) hitCells.add(x + ',' + y);
    };
    mark(st, st);
    for (const d of sol.path) {
      const r = E.move(L, st, d); let p = st;
      for (const q of r.path) { mark(p, { ...q, w: st.w, h: st.h }); p = { ...q, w: st.w, h: st.h }; }
      st = r.state; mark(st, st);
    }
    const opts = [];
    L.cells.forEach((row, y) => row.forEach((c, x) => {
      if (c !== '.' || hitCells.has(x + ',' + y)) return;
      const g2 = lv.grid.map((r, yy) => yy === y ? r.slice(0, x) + 'g' + r.slice(x + 1) : r);
      const L2 = E.parse({ ...lv, grid: g2 });
      const gs = E.solve(L2, E.initialState(L2), true, 20000);
      const extra = gs && gs.path.length - sol.path.length;
      if (gs && extra >= 1 && extra <= 4) opts.push(`(${x},${y})+${extra}`);
    }));
    console.log('      gem options: ' + (opts.slice(0, 12).join(' ') || '-'));
  }
});
if (bad) { console.log(`${bad} problem(s)`); process.exit(1); }
console.log('all levels OK');
