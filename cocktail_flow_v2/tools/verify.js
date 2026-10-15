// node tools/verify.js  — checks every level in levels.js: data rules and that a
// throw order exists which serves every order within the level's belt slots.
'use strict';
const path = require('path');
const Core = require('../core.js');
global.window = {};
require(path.join(__dirname, '..', 'levels.js'));
let bad = 0;
for (const raw of window.BELT_LEVELS) {
  const L = Core.resolveLevel(raw);
  const errs = Core.validateLevel(L);
  const plan = errs.length ? null : Core.solve(L, L.beltSlots);
  if (errs.length || !plan) {
    bad++;
    console.log(`L${L.levelOrder + 1}: ${errs.length ? errs.join('; ') : 'no solution with ' + L.beltSlots + ' slots'}`);
  }
}
console.log(bad ? `${bad} level(s) failed` : `all ${window.BELT_LEVELS.length} levels ok`);
process.exit(bad ? 1 : 0);
