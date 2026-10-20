// Pick a short, reproducible lesson with a forced paint followed by a two-colour note.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const E = require('../../engine.js');
const file = path.join(__dirname, 'maps', 'cat.json');
const info = JSON.parse(fs.readFileSync(file, 'utf8'));
const { map, solution } = info;
assert(map.count <= 16, 'tutorial must have few large panes');
const used = (r, fill) => new Set(map.adj[r].map(j => fill[j]).filter(c => c >= 0));
let best;
for (let mask = 0; mask < 2 ** map.count; mask++) {
  const given = solution.map((c, r) => mask >> r & 1 ? -1 : c);
  if (given.filter(c => c < 0).length !== 4 || !E.propagationSolves(map.adj, given, 4)) continue;
  if (E.countSolutions(map.adj, given, 4, 2).count !== 1) continue;
  for (let paint = 0; paint < map.count; paint++) {
    if (given[paint] >= 0 || used(paint, given).size !== 3) continue;
    const after = given.slice(); after[paint] = solution[paint];
    for (let note = 0; note < map.count; note++) {
      if (after[note] >= 0 || used(note, after).size !== 2) continue;
      const score = map.clearance[paint] * 4 + map.clearance[note];
      if (!best || score > best.score) best = { given, paint, note, score };
    }
  }
}
assert(best, 'no complete paint + note lesson for this map');
info.given = best.given;
info.tutorial = { paint: best.paint, note: best.note };
info.image = 'assets/glass/cat-tutorial.webp';
info.artMetadata = 'assets/glass/cat-tutorial.json';
fs.writeFileSync(file, JSON.stringify(info));
console.log(`Tutorial: ${map.count} panes, 4 to paint; first ${best.paint}, note ${best.note}`);
