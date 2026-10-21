// V2 tutorial clues (v2_cat): 4 blanks, a forced first paint, unique, plain elimination.
// Same lesson rule as ../build_tutorial.js, on the staged work/<id>.map.json.
// node tools/stained/vitray/tutorial.js v2_cat
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const E = require('../../../engine.js');
const id = process.argv[2];
const file = path.join(__dirname, 'work', id + '.map.json');
const info = JSON.parse(fs.readFileSync(file, 'utf8'));
const { map, solution } = info;
assert(map.count <= 16, 'tutorial must have few large panes');
const area = d => { // shoelace on the outer ring of an M/L path
  const pts = d.split('Z')[0].replace('M', '').split('L').map(p => p.trim().split(/\s+/).map(Number));
  let s = 0; for (let i = 0; i < pts.length; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]; s += x1 * y2 - x2 * y1; }
  return Math.abs(s) / 2;
};
const size = map.paths.map(area);
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
      const score = size[paint] * 4 + size[note] + info.clueFocus.weights.reduce((s, w, r) => s + (given[r] < 0 ? w : 0), 0);
      if (!best || score > best.score) best = { given, paint, note, score };
    }
  }
}
assert(best, 'no complete paint lesson for this map');
info.given = best.given;
info.tutorial = { paint: best.paint, note: best.note };
info.clueFocus.solution = crypto.createHash('sha256').update(JSON.stringify(solution)).digest('hex');
info.clueFocus.prepared = true;
fs.writeFileSync(file, JSON.stringify(info));
console.log(`${id}: tutorial, ${map.count} panes, 4 to paint; first ${best.paint}`);
