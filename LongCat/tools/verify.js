#!/usr/bin/env node
// node tools/verify.js — every level parses, is solvable, and follows the curve rules:
//  · saw-tooth: blocks of five (1–5, 6–10, …) climb in estimated solve time, each block from the
//    2nd on ends on its HARD peak, and the curve rises: block averages trend up
//  · from level 4 on every level has 2+ real decisions, HARD ones 4+
//  · ideal shape: no harsh trap (1 good swipe of 4, 1 of 2 …) on any winning line before 20% of the
//    floor is covered; a soft one (1 bad swipe of 3–4) is allowed there in at most 1 level in 8,
//    otherwise the opening is all free; late traps (80%+) ≤ 2 per level, in at most 1 in 6
//    non-HARD levels
//  · traps (decisions where a wrong pick loses) are not all of them: 2/3 of levels 4+ have a free decision
//  · mechanics: each one is introduced by its tutorial level (lv.intro, with a tip) and never shows
//    up before it; tutorials are exempt from the time and decision rules
//  · HARD peaks are Longcat-hard: 3+ traps and a floor of 67 s rising to 76 s (peaks average ≈ Longcat's ~82 s)
//  · from level 4 on, estimated solve time is 30–100 s (average ≈ 60 s)
const E = require('../engine.js'); global.window = {}; require('../levels.js'); const LEVELS = window.LEVELS;
let bad = 0, sum = 0, n = 0;
const A = LEVELS.map(lv => E.analyse(lv));
const MECH = { turn: /[┌┐└┘]/, glass: /g/, box: /b/, portal: /@/, pit: /o/, arrow: /[\^>v<]/ };
const mechsOf = lv => Object.keys(MECH).filter(k => MECH[k].test(lv.grid.join('')));
const introAt = {}; LEVELS.forEach((lv, i) => { if (lv.intro) introAt[lv.intro] = i; });
LEVELS.forEach((lv, i) => {
  const a = A[i];
  if (!a.solvable) { console.log(`✗ ${i + 1} ${lv.name}: no solution`); bad++; return; }
  const mk = mechsOf(lv);
  for (const k of mk) if (!(k in introAt) || introAt[k] > i) { console.log(`  ✗ level ${i + 1}: ${k} before its tutorial`); bad++; }
  if (lv.intro && !lv.tip) { console.log(`  ✗ level ${i + 1}: tutorial without a tip`); bad++; }
  console.log(`✓ ${String(i + 1).padStart(3)} ${lv.name.padEnd(16)} ${a.W}×${a.H} floor ${String(a.floor).padStart(2)}  par ${String(a.moves).padStart(2)}  choices ${a.choices} (traps ${a.decisions}, free ${a.choices - a.decisions})  first trap ${Math.round(a.firstRisk * 100)}%  ~${Math.round(a.seconds)} s${lv.hard ? '  HARD' : ''}${lv.intro ? '  TUTORIAL ' + lv.intro : mk.length ? '  ' + mk.join('+') : ''}`);
  if (i >= 3 && !lv.intro) {
    sum += a.seconds; n++;
    if (a.seconds < 30 || a.seconds > 100) { console.log(`  ✗ level ${i + 1}: ~${Math.round(a.seconds)} s is outside 30–100 s`); bad++; }
  }
  const hardMin = 67 + 9 * (i - 3) / (LEVELS.length - 4);
  if (lv.hard && (a.decisions < 3 || a.seconds < hardMin)) { console.log(`  ✗ hard level ${i + 1}: ${a.decisions} traps, ~${Math.round(a.seconds)} s (Longcat-hard needs 3+ traps, ${Math.round(hardMin)} s+)`); bad++; }
  if (i >= 3 && !lv.intro && a.choices < 2) { console.log(`  ✗ level ${i + 1}: only ${a.choices} decision(s)`); bad++; }
  if (lv.hard && a.choices < 4) { console.log(`  ✗ hard level ${i + 1}: only ${a.choices} decisions`); bad++; }
});
const means = [];
for (let c = 0; c * 5 < LEVELS.length; c++) {
  const lo = Math.max(3, c * 5), hi = Math.min(LEVELS.length, c * 5 + 5), idx = [...Array(hi - lo).keys()].map(j => lo + j).filter(j => !LEVELS[j].intro), b = idx.map(j => A[j]);
  for (let j = 1; j < b.length; j++) if (b[j].seconds < b[j - 1].seconds) { console.log(`  ✗ level ${idx[j] + 1} is quicker than level ${idx[j - 1] + 1} (blocks must climb)`); bad++; }
  for (let j = lo; j < hi; j++) if (!!LEVELS[j].hard !== (c > 0 && j === hi - 1)) { console.log(`  ✗ level ${j + 1}: HARD tag should sit on block peaks only`); bad++; }
  means.push(b.reduce((s, a) => s + a.seconds, 0) / b.length);
}
for (let c = 3; c < means.length; c++) if (means[c] < means[c - 2] - 3) { console.log(`  ✗ block ${c + 1} (avg ~${Math.round(means[c])} s) is easier than block ${c - 1} (~${Math.round(means[c - 2])} s)`); bad++; }
const xs = means.slice(1), mx = (xs.length - 1) / 2, my = xs.reduce((s, v) => s + v, 0) / xs.length;
const slope = xs.reduce((s, v, k) => s + (k - mx) * (v - my), 0) / xs.reduce((s, v, k) => s + (k - mx) ** 2, 0);
if (!(slope > 0.3)) { console.log(`✗ the curve does not rise (block averages +${slope.toFixed(2)} s per block)`); bad++; }
A.forEach((a, i) => {
  if (i < 3 || !a.solvable || LEVELS[i].intro) return;
  if (a.firstHard < 0.2) { console.log(`  ✗ level ${i + 1}: harsh trap at ${Math.round(a.firstHard * 100)}% progress (needs 20%+)`); bad++; }
  if (a.endTraps > 2) { console.log(`  ✗ level ${i + 1}: ${a.endTraps} traps near the end`); bad++; }
});
const endy = A.filter(a => a.endTraps).length, softy = A.filter((a, i) => i >= 3 && !LEVELS[i].intro && a.firstRisk < 0.2).length;
if (softy > Math.ceil(LEVELS.length / 8)) { console.log(`✗ ${softy} levels with a trap at the start (max ${Math.ceil(LEVELS.length / 8)})`); bad++; }
const endSoft = A.filter((a, i) => a.endTraps && !LEVELS[i].hard).length;
if (endSoft > Math.ceil(LEVELS.length / 6)) { console.log(`✗ ${endSoft} non-HARD levels with a late trap (max ${Math.ceil(LEVELS.length / 6)})`); bad++; }
const play = A.filter((a, i) => i >= 3 && !LEVELS[i].intro), withFree = play.filter(a => a.choices > a.decisions).length;
if (withFree < play.length * 2 / 3) { console.log(`✗ only ${withFree}/${play.length} levels have a free decision`); bad++; }
console.log(`traps ${play.reduce((s, a) => s + a.decisions, 0)} of ${play.reduce((s, a) => s + a.choices, 0)} decisions, ${withFree}/${play.length} levels with a free one`);
const peaksAvg = A.filter((a, i) => LEVELS[i].hard).reduce((s, a, _, r) => s + a.seconds / r.length, 0);
console.log(`HARD peaks average ~${Math.round(peaksAvg)} s`);
console.log(`blocks: ${means.map(m => Math.round(m)).join(' ')} s (+${slope.toFixed(1)} s per block)`);
console.log(`average ~${Math.round(sum / n)} s (level 4+), late traps in ${endy} levels, soft start traps in ${softy}`);
console.log(bad ? `${bad} problem(s)` : `all ${LEVELS.length} levels ok`);
process.exit(bad ? 1 : 0);
