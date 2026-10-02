#!/usr/bin/env node
// node tools/verify.js — every level parses, is solvable, and follows the curve rules:
//  · a HARD level is followed by two levels that are quicker to solve
//  · from level 4 on every level has 2+ real decisions, HARD ones 4+
//  · ideal shape: on every winning line the first decision is free and no trap shows up before
//    20% of the floor is covered; near the end (80%+) a trap is rare (≤ 1 per level, ≤ 1 level in 8)
//  · traps (decisions where a wrong pick loses) are not all of them: 2/3 of levels 4+ have a free decision
//  · from level 4 on, estimated solve time is 30–100 s (average ≈ 60 s)
const E = require('../engine.js'); global.window = {}; require('../levels.js'); const LEVELS = window.LEVELS;
let bad = 0, sum = 0, n = 0;
const A = LEVELS.map(lv => E.analyse(lv));
LEVELS.forEach((lv, i) => {
  const a = A[i];
  if (!a.solvable) { console.log(`✗ ${i + 1} ${lv.name}: no solution`); bad++; return; }
  console.log(`✓ ${String(i + 1).padStart(2)} ${lv.name.padEnd(16)} ${a.W}×${a.H} floor ${String(a.floor).padStart(2)}  par ${String(a.moves).padStart(2)}  choices ${a.choices} (traps ${a.decisions}, free ${a.choices - a.decisions})  first trap ${Math.round(a.firstRisk * 100)}%  ~${Math.round(a.seconds)} s${lv.hard ? '  HARD' : ''}`);
  if (i >= 3) {
    sum += a.seconds; n++;
    if (a.seconds < 30 || a.seconds > 100) { console.log(`  ✗ level ${i + 1}: ~${Math.round(a.seconds)} s is outside 30–100 s`); bad++; }
  }
  if (i >= 3 && a.choices < 2) { console.log(`  ✗ level ${i + 1}: only ${a.choices} decision(s)`); bad++; }
  if (lv.hard && a.choices < 4) { console.log(`  ✗ hard level ${i + 1}: only ${a.choices} decisions`); bad++; }
  if (lv.hard) for (const j of [i + 1, i + 2]) {
    if (A[j] && A[j].seconds >= a.seconds) { console.log(`  ✗ level ${j + 1} is not quicker than hard level ${i + 1}`); bad++; }
  }
});
A.forEach((a, i) => {
  if (i < 3 || !a.solvable) return;
  if (a.openFree < 1) { console.log(`  ✗ level ${i + 1}: the opening decision can lose`); bad++; }
  if (a.firstRisk < 0.2) { console.log(`  ✗ level ${i + 1}: first trap at ${Math.round(a.firstRisk * 100)}% progress (needs 20%+)`); bad++; }
  if (a.endTraps > 1) { console.log(`  ✗ level ${i + 1}: ${a.endTraps} traps near the end`); bad++; }
});
const endy = A.filter(a => a.endTraps).length;
if (endy > Math.ceil(LEVELS.length / 8)) { console.log(`✗ ${endy} levels with a late trap (max ${Math.ceil(LEVELS.length / 8)})`); bad++; }
const play = A.slice(3), withFree = play.filter(a => a.choices > a.decisions).length;
if (withFree < play.length * 2 / 3) { console.log(`✗ only ${withFree}/${play.length} levels have a free decision`); bad++; }
console.log(`traps ${play.reduce((s, a) => s + a.decisions, 0)} of ${play.reduce((s, a) => s + a.choices, 0)} decisions, ${withFree}/${play.length} levels with a free one`);
console.log(`average ~${Math.round(sum / n)} s (level 4+), late traps in ${endy} levels`);
console.log(bad ? `${bad} problem(s)` : `all ${LEVELS.length} levels ok`);
process.exit(bad ? 1 : 0);
