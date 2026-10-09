// Re-checks levels.js: data rules (core.validateLevel), hard / very hard on the
// right level numbers, solvable by the
// pouring rules + worst customer wait at human pace. Run after hand edits.
//   node tools/verify.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Core = require('../core.js');
const Solver = require('./solver.js');

const src = fs.readFileSync(path.join(__dirname, '..', 'levels.js'), 'utf8');
const box = { window: {} };
vm.runInNewContext(src, box);
const levels = box.window.COCKTAIL_LEVELS;

let bad = 0;
const seen = new Set();
for (const raw of levels) {
  const L = Core.resolveLevel(raw);
  const errs = Core.validateLevel(L);
  if (seen.has(L.levelOrder)) errs.push('duplicate levelOrder');
  const n = L.levelOrder + 1;   // level number the player sees
  const want = n % 10 === 0 ? 'hard' : n % 5 === 0 && n >= 15 ? 'veryHard' : undefined;
  if (L.difficulty !== want) errs.push(`difficulty ${L.difficulty} (expected ${want})`);
  seen.add(L.levelOrder);
  let line = `L${String(L.levelOrder).padStart(2)}  ${L.bottleCount} bottles  ${L.orders.length} orders` + (L.difficulty ? `  ${L.difficulty}` : '');
  if (!errs.length) {
    const s = Solver.solveTimed(L);
    if (!s) errs.push('no solution found');
    else {
      line += `  ${s.moves} moves  wait ${(s.timing.ratio * 100).toFixed(0)}%`;
      if (s.timing.ratio > 1) errs.push('customers time out even at solver pace');
    }
  }
  if (errs.length) { bad++; line += '  FAIL: ' + errs.join('; '); }
  console.log(line);
}
console.log(bad ? `${bad} level(s) failed` : `all ${levels.length} levels OK`);
process.exit(bad ? 1 : 0);
