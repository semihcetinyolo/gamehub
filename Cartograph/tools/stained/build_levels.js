// Assemble stained-levels.js: every stained-glass map, its fixed solution (the colours the AI
// artwork was painted from), the four colours read back from the artwork and the starting clues.
// node tools/stained/build_levels.js
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const E = require('../../engine.js');

const ROOT = path.join(__dirname, '..', '..');
const generatedArt = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'glass', 'first-three-v2-prompts.json'), 'utf8'));
// Images made elsewhere for a level only count while they are newer than that level's map:
// once the map is rebuilt they no longer line up with its panes.
const mapTime = id => fs.statSync(path.join(__dirname, 'maps', id + '.json')).mtimeMs;
const imageOverrides = new Map(generatedArt.assets
  .filter(asset => asset.level !== null && fs.existsSync(path.join(ROOT, asset.file)) && fs.statSync(path.join(ROOT, asset.file)).mtimeMs > mapTime(asset.id))
  .map(asset => [asset.id, asset.file]));
// Levels 1–10 in the order the user picked (2026-10-02); the rest roughly by pane count.
const ORDER = [
  'cat', 'cactus', 'lotus', 'heart', 'fox', 'fish', 'flower', 'moon', 'mushroom', 'owl',
  'turtle', 'peacock', 'balloon', 'bird', 'rosewindow', 'sailboat', 'mountain', 'bee', 'lighthouse',
  'snowflake', 'tulip', 'kaleido', 'tree', 'medallion', 'compass',
  'butterflygarden', 'dragonfly', 'snail', 'seashell', 'jellyfish',
  'whale', 'penguin', 'rabbit', 'bear', 'cherries',
  'pear', 'strawberry', 'pumpkin', 'maple', 'acorn',
  'rose', 'iris', 'teapot', 'lantern', 'windmill',
  'castle', 'bridge', 'waterfall', 'planet', 'hourglass',
];
// First levels: only plain eliminations and several regions paintable at once.
const EASY_UNTIL = 8;
const TUTORIAL_PAINT = 20;

function clues(adj, solution, seed, easy) {
  const k = 4;
  let best = null;
  for (let t = 0; t < 8; t++) {
    const rand = E.rng(seed * 7919 + t * 104729 + 17);
    const order = [...solution.keys()];
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const given = solution.slice();
    for (const r of order) {
      given[r] = -1;
      const ok = (easy ? E.propagationSolves(adj, given, k) : E.logicSolve(adj, given, k, false).solved)
        && E.countSolutions(adj, given, k, 2).count === 1;
      if (!ok) given[r] = solution[r];
    }
    while (easy && E.openings(adj, given, k) < 4) {
      let pick = -1, n = -1;
      for (let r = 0; r < adj.length; r++) {
        if (given[r] >= 0) continue;
        given[r] = solution[r];
        const o = E.openings(adj, given, k);
        given[r] = -1;
        if (o > n) { n = o; pick = r; }
      }
      if (pick < 0) break;
      given[pick] = solution[pick];
    }
    const count = given.filter(c => c >= 0).length;
    if (!best || count < best.count) best = { given, count };
  }
  return best.given;
}

// Empty panes whose painted neighbours use exactly two colours (two choices left).
function twoLeft(adj, given) {
  let n = 0;
  for (let r = 0; r < adj.length; r++) {
    if (given[r] >= 0) continue;
    if (new Set(adj[r].map(j => given[j]).filter(c => c >= 0)).size === 2) n++;
  }
  return n;
}

function outlinesFromEdges(map) {
  const out = Array.from({ length: map.count }, () => []);
  for (const [x1, y1, x2, y2, a, b] of map.edges) { out[a].push([x1, y1, x2, y2]); out[b].push([x1, y1, x2, y2]); }
  for (const [x1, y1, x2, y2, a] of map.rim) out[a].push([x1, y1, x2, y2]);
  return out;
}

const levels = ORDER.map((id, i) => {
  const info = JSON.parse(fs.readFileSync(path.join(__dirname, 'maps', id + '.json'), 'utf8'));
  const art = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'glass', id + '.json'), 'utf8'));
  const image = imageOverrides.get(id) || `assets/glass/${id}.webp`;
  assert(fs.existsSync(path.join(ROOT, image)), `${id}: artwork missing`);
  const { map, solution } = info;
  delete map.clearance;
  for (let r = 0; r < map.count; r++) for (const j of map.adj[r]) {
    assert(map.adj[j].includes(r), `${id}: adjacency not symmetric`);
    assert.notEqual(solution[r], solution[j], `${id}: solution clash`);
  }
  assert.deepEqual([...new Set(solution)].sort(), [0, 1, 2, 3], `${id}: solution must use all four colours`);
  assert.equal(art.palette.length, 4);
  assert.equal(new Set(art.palette).size, 4);
  const given = clues(map.adj, solution, 1100 + i, i < EASY_UNTIL);
  // The tutorial level starts much fuller: only TUTORIAL_PAINT panes are left to paint.
  while (i === 0 && given.filter(c => c < 0).length > TUTORIAL_PAINT) {
    let pick = -1, n = -1;
    for (let r = 0; r < map.count; r++) {
      if (given[r] >= 0) continue;
      given[r] = solution[r];
      const o = E.openings(map.adj, given, 4);
      const keepsNoteStep = twoLeft(map.adj, given) >= 2; // the tutorial's note step needs these
      given[r] = -1;
      if (keepsNoteStep && (o > n || (o === n && map.adj[r].length > map.adj[pick].length))) { n = o; pick = r; }
    }
    if (pick < 0) break;
    given[pick] = solution[pick];
  }
  assert(given.some(c => c < 0));
  assert(E.logicSolve(map.adj, given, 4, false).solved, `${id}: not solvable by logic`);
  assert.equal(E.countSolutions(map.adj, given, 4, 2).count, 1, `${id}: solution not unique`);
  const outlines = map.outlines || outlinesFromEdges(map);
  console.log(`${String(i + 1).padStart(2)} ${info.name}: ${map.count} panes, ${given.filter(c => c < 0).length} to paint, ${i < EASY_UNTIL ? 'easy' : 'logic'}`);
  // Legacy maps carry their own outlines; new ones are rebuilt in the game from edges + rim.
  if (map.rim) delete map.outlines; else map.outlines = outlines;
  return { id, name: info.name, palette: art.palette, image, map, solution, given, locks: [] };
});

const sets = levels.map(L => L.palette.join());
assert.equal(new Set(sets).size, sets.length, 'two levels share a palette');
const out = 'window.CARTO_STAINED = ' + JSON.stringify(levels) + ';\n';
fs.writeFileSync(path.join(ROOT, 'stained-levels.js'), out);
console.log(`stained-levels.js: ${levels.length} levels, ${(out.length / 1024).toFixed(0)} KB`);
