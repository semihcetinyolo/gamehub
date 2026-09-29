#!/usr/bin/env node
// node tools/verify.js — every level parses, is solvable, and follows the curve rule
// (a HARD level is followed by two levels that are easier than it).
const E = require('../engine.js'); global.window = {}; require('../levels.js'); const LEVELS = window.LEVELS;
let bad = 0;
LEVELS.forEach((lv, i) => {
  const a = E.analyse(lv);
  if (!a.solvable) { console.log(`✗ ${i + 1} ${lv.name}: no solution`); bad++; return; }
  const flag = lv.hard ? ' HARD' : '';
  console.log(`✓ ${String(i + 1).padStart(2)} ${lv.name.padEnd(16)} ${a.W}×${a.H} floor ${String(a.floor).padStart(2)}  par ${String(a.moves).padStart(2)}  diff ${a.difficulty.toFixed(2)}${flag}`);
  if (lv.hard) for (const j of [i + 1, i + 2]) {
    const n = LEVELS[j]; if (!n) continue;
    if (E.analyse(n).difficulty >= a.difficulty) { console.log(`  ✗ level ${j + 1} is not easier than hard level ${i + 1}`); bad++; }
  }
});
console.log(bad ? `${bad} problem(s)` : `all ${LEVELS.length} levels ok`);
process.exit(bad ? 1 : 0);
