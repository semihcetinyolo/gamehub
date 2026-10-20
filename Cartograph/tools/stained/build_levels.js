// Assemble stained-levels.js: every stained-glass map, its fixed solution (the colours the AI
// artwork was painted from), the four colours read back from the artwork and the starting clues.
// node tools/stained/build_levels.js
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const E = require('../../engine.js');
const { openingSeeds, normalClues } = require('./starting_clues.js');

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
  ...Array.from({ length: 150 }, (_, i) => `chapter_${String(51 + i).padStart(3, '0')}`),
];
// These are source slots, retained for stable clue seeds and saved-level migration.
const creative = JSON.parse(fs.readFileSync(path.join(__dirname, 'creative-prompts.json'), 'utf8'));
for (const entry of creative.assets) {
  if (entry.replaces) assert.equal(ORDER[entry.level - 1], entry.replaces, 'replacement slot changed');
  else assert(entry.level >= 201 && entry.level <= 275, 'invalid new level slot');
  ORDER[entry.level - 1] = entry.id;
}
const previousIds = ORDER.slice();
const patterns = JSON.parse(fs.readFileSync(path.join(__dirname, 'pattern-catalog.json'), 'utf8'));
assert.equal(patterns.assets.length, 75, '75 reference-inspired replacements required');
for (const entry of patterns.assets) {
  assert.equal(ORDER[entry.level - 1], entry.replaces, 'pattern replacement slot changed');
  ORDER[entry.level - 1] = entry.id;
}
ORDER.push('brain');
// First levels: only plain eliminations and several regions paintable at once.
const EASY_UNTIL = 8;

function outlinesFromEdges(map) {
  const out = Array.from({ length: map.count }, () => []);
  for (const [x1, y1, x2, y2, a, b] of map.edges) { out[a].push([x1, y1, x2, y2]); out[b].push([x1, y1, x2, y2]); }
  for (const [x1, y1, x2, y2, a] of map.rim) out[a].push([x1, y1, x2, y2]);
  return out;
}

const authoredLevels = ORDER.map((id, i) => {
  const info = JSON.parse(fs.readFileSync(path.join(__dirname, 'maps', id + '.json'), 'utf8'));
  const art = JSON.parse(fs.readFileSync(path.join(ROOT, info.artMetadata || `assets/glass/${id}.json`), 'utf8'));
  const image = info.image || imageOverrides.get(id) || `assets/glass/${id}.webp`;
  assert(fs.existsSync(path.join(ROOT, image)), `${id}: artwork missing`);
  if (info.artworkStyle === 'stained-glass') {
    assert(art.tool && art.tool !== 'native vector geometry', `${id}: flat guide cannot be used as stained-glass completion artwork`);
  }
  if (info.catalogVersion >= 2 || info.tutorial || info.geometryRevision >= 3) {
    const checked = art.paneColorCheck;
    assert(checked && checked.valid && checked.matched === checked.total, `${id}: artwork colours need correction`);
  }
  if (info.catalogVersion >= 3 || info.geometryRevision >= 3) {
    assert(!info.artworkNeedsRefresh, `${id}: regenerate the colour guide and artwork after recolouring`);
    const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    assert.equal(art.guide, hash(path.join(__dirname, 'guides', id + '.png')), `${id}: guide changed after artwork import`);
    assert.equal(art.sha256, hash(path.join(ROOT, image)), `${id}: artwork changed after colour validation`);
  }
  const { map, solution } = info;
  const geometry = info.geometryQuality;
  const body = map.paths.join('\n') + '\n' + map.shape + '\n'
    + map.adj.map(a => a.join(',')).join(';') + '\n'
    + map.edges.map(e => [...e.slice(0, 4).map(v => v.toFixed(3)), ...e.slice(4)].join(',')).join(';');
  const fingerprint = crypto.createHash('sha256').update(body).digest('hex');
  assert(geometry?.version === 3 && geometry.valid && !geometry.issues.length,
    `${id}: run audit_geometry.py --stamp before building`);
  assert.equal(geometry.fingerprint, fingerprint, `${id}: geometry changed after audit`);

  delete map.clearance;
  for (let r = 0; r < map.count; r++) for (const j of map.adj[r]) {
    assert(map.adj[j].includes(r), `${id}: adjacency not symmetric`);
    assert.notEqual(solution[r], solution[j], `${id}: solution clash`);
  }
  assert.deepEqual([...new Set(solution)].sort(), [0, 1, 2, 3], `${id}: solution must use all four colours`);
  assert.equal(art.palette.length, 4);
  assert.equal(new Set(art.palette).size, 4);
  const hard = info.difficulty?.tier === 'hard';
  const requestedStarts = i < EASY_UNTIL ? 4 : 3;
  const focus = info.clueFocus;
  assert(focus?.version === 1 && focus.prepared && focus.weights.length === map.count,
    `${id}: prepare subject-aware starting clues before building`);
  assert.equal(focus.geometry, geometry.fingerprint, `${id}: focal regions need remapping after geometry changes`);
  assert.equal(focus.solution, crypto.createHash('sha256').update(JSON.stringify(solution)).digest('hex'),
    `${id}: prepare focal clues after solution changes`);
  const given = info.given;
  assert.equal(given.length, map.count, `${id}: clue count mismatch`);
  assert(given.every((c,r) => c === -1 || c === solution[r]), `${id}: clue disagrees with solution`);
  if (i === 0) {
    assert(map.count <= 16 && given.filter(c => c < 0).length === 4, 'rebuild the short cat tutorial');
    assert(info.tutorial, 'cat tutorial needs explicit lesson targets');
  }
  assert(given.some(c => c < 0));
  if (!hard && !info.tutorial) {
    const minimumStarts = openingSeeds(map.adj, solution, [...solution.keys()], requestedStarts).length;
    assert(minimumStarts >= 3, `${id}: normal geometry needs three definite starts`);
    assert(E.openings(map.adj, given, 4) >= minimumStarts, `${id}: no clear starting moves`);
    assert(E.propagationSolves(map.adj, given, 4), `${id}: normal level requires advanced deductions`);
  }
  assert(E.logicSolve(map.adj, given, 4, hard).solved, `${id}: not solvable by logic`);
  if (hard) {
    assert(E.openings(map.adj, given, 4) >= 2, `${id}: hard level needs two clear starting moves`);
    const reasoning = E.logicSolve(map.adj, given, 4, true).stats;
    assert(!E.propagationSolves(map.adj, given, 4), `${id}: too easy`);
    assert(reasoning.pairs + reasoning.probes >= 3 && given.filter(c => c < 0).length >= (info.large ? 35 : 20), `${id}: insufficient difficulty`);
  }
  if (info.large) {
    assert(hard && map.cols >= 27 && map.rows >= 36 && map.count >= 60, `${id}: large hard level required`);
  }
  assert.equal(E.countSolutions(map.adj, given, 4, 2).count, 1, `${id}: solution not unique`);
  const outlines = map.outlines || outlinesFromEdges(map);
  console.log(`${String(i + 1).padStart(2)} ${info.name}: ${map.count} panes, ${given.filter(c => c < 0).length} to paint, ${E.openings(map.adj, given, 4)} starting moves, ${hard ? 'hard' : 'elimination'}`);
  // Legacy maps carry their own outlines; new ones are rebuilt in the game from edges + rim.
  if (map.rim) delete map.outlines; else map.outlines = outlines;
  return { id, name: info.name, palette: art.palette, image, map, solution, given, locks: [],
    ...(info.large ? { canvasSize: 'large' } : {}),
    ...(hard ? { difficulty: info.difficulty } : {}),
    ...(info.tutorial ? { tutorial: info.tutorial } : {}) };
});

// Keep the original first 50 in order, inserting hard levels at 10, 20, …, 270.
// The remaining normal levels are interleaved by visual family so a run does not
// become a block of near-identical rings, maps, figures or large scenes.
function shuffle(items, seed) {
  const out = items.slice(), rand = E.rng(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
const isHard = L => L.difficulty?.tier === 'hard';
function visualFamily(L) {
  const id = L.id;
  if (id === 'brain') return 'brain';
  if (id.startsWith('grand_')) return 'scene';
  if (id.startsWith('story_') || id.startsWith('motif_')) return 'figurative';
  if (/^(rings|spiral|atlas)_/.test(id)) return 'pattern';
  if (id.startsWith('chapter_')) return 'geometric';
  return 'classic';
}
function balancedTail(items, seed) {
  const remaining = shuffle(items, seed);
  const out = [];
  let previous = null;
  while (remaining.length) {
    const options = remaining.filter(L => visualFamily(L) !== previous);
    const pool = options.length ? options : remaining;
    // Keep the seeded order within a family while choosing the least-used family
    // first. This avoids a long run of one family without making the sequence rigid.
    const counts = new Map();
    for (const L of out) counts.set(visualFamily(L), (counts.get(visualFamily(L)) || 0) + 1);
    const min = Math.min(...pool.map(L => counts.get(visualFamily(L)) || 0));
    const pick = pool.find(L => (counts.get(visualFamily(L)) || 0) === min);
    out.push(pick);
    remaining.splice(remaining.indexOf(pick), 1);
    previous = visualFamily(pick);
  }
  return out;
}
// The pattern levels (rings, spirals, maps) also turn up in the first 50 (user, 2026-10-20):
// the easiest ones, one every few levels from level 12 on. Levels 1–10 stay as they are.
// Indexes are into the normal sequence (hard slots excluded): 10 → level 12, 42 → level 47.
const EARLY_PATTERN_SLOTS = [10, 13, 17, 20, 24, 27, 31, 34, 38, 42];
const toPaint = L => L.given.filter(c => c < 0).length;
const easiestOf = family => authoredLevels.filter(L => L.id.startsWith(family + '_') && !isHard(L))
  .sort((a, b) => toPaint(a) - toPaint(b) || a.map.count - b.map.count);
const earlyPatterns = [...easiestOf('rings').slice(0, 4), ...easiestOf('spiral').slice(0, 3), ...easiestOf('atlas').slice(0, 3)]
  .sort((a, b) => toPaint(a) - toPaint(b) || a.map.count - b.map.count);
const earlyIds = new Set(earlyPatterns.map(L => L.id));
const normalHead = authoredLevels.slice(0, 50);
assert(normalHead.every(L => !earlyIds.has(L.id)));
EARLY_PATTERN_SLOTS.forEach((k, i) => normalHead.splice(k, 0, earlyPatterns[i]));
const normalTail = balancedTail(authoredLevels.slice(50).filter(L => !isHard(L) && L.id !== 'brain' && !earlyIds.has(L.id)), 20261019);
// Keep hard-level positions stable when their geometry and pane counts change.
const hardOrder = JSON.parse(fs.readFileSync(path.join(__dirname, 'hard-order.json'), 'utf8'));
const hard = hardOrder.map(id => authoredLevels.find(L => L.id === id && isHard(L)));
assert(hard.every(Boolean), 'a scheduled hard level is missing');
assert.equal(hard.length, Math.floor(authoredLevels.length / 10));
let normalIndex = 0, hardIndex = 0;
const normal = [...normalHead, ...normalTail];
const levels = Array.from({ length: authoredLevels.length - 1 }, (_, i) =>
  (i + 1) % 10 === 0 ? hard[hardIndex++] : normal[normalIndex++]);
levels.push(authoredLevels.find(L => L.id === 'brain'));
assert.equal(normalIndex, normal.length);
assert.equal(hardIndex, hard.length);

// Hard slots are fixed scenes. Place the shuffled tail around those fixed
// boundaries so a family never repeats across a playable step.
const headIds = new Set(normalHead.map(L => L.id));
const movable = L => !headIds.has(L.id) && !isHard(L) && L.id !== 'brain';
const movablePositions = levels.map((L, i) => movable(L) ? i : -1).filter(i => i >= 0);
const remainingTail = shuffle(movablePositions.map(i => levels[i]), 20261019 + 17);
const familyCounts = new Map();
const remainingCounts = new Map();
for (const L of remainingTail) {
  const family = visualFamily(L);
  remainingCounts.set(family, (remainingCounts.get(family) || 0) + 1);
}
for (const pos of movablePositions) {
  const previous = visualFamily(levels[pos - 1]);
  const nextIsFixed = pos + 1 >= levels.length || !movable(levels[pos + 1]);
  const nextFamily = nextIsFixed && pos + 1 < levels.length ? visualFamily(levels[pos + 1]) : null;
  let options = remainingTail.filter(L => visualFamily(L) !== previous
    && (!nextFamily || visualFamily(L) !== nextFamily));
  if (!options.length) options = remainingTail.filter(L => visualFamily(L) !== previous);
  if (!options.length) options = remainingTail;
  // Spend the most plentiful eligible family first so a rare family remains
  // available as a separator near the end of the catalogue.
  const mostRemaining = Math.max(...options.map(L => remainingCounts.get(visualFamily(L)) || 0));
  const pick = options.find(L => (remainingCounts.get(visualFamily(L)) || 0) === mostRemaining);
  levels[pos] = pick;
  remainingTail.splice(remainingTail.indexOf(pick), 1);
  const family = visualFamily(pick);
  familyCounts.set(family, (familyCounts.get(family) || 0) + 1);
  remainingCounts.set(family, remainingCounts.get(family) - 1);
}

// Geometry repairs must not reshuffle the early patterns or the saved play order.
// Catalogue additions/reordering explicitly update this stable-ID manifest.
const playOrder = JSON.parse(fs.readFileSync(path.join(__dirname, 'play-order.json'), 'utf8'));
assert.deepEqual([...playOrder].sort(), levels.map(L => L.id).sort(), 'update play-order.json for catalogue changes');
const byId = new Map(levels.map(L => [L.id, L]));
levels.splice(0, levels.length, ...playOrder.map(id => byId.get(id)));
for (let i = 0; i < levels.length; i++) {
  assert.equal(isHard(levels[i]), (i + 1) % 10 === 0, `hard slot changed at ${i + 1}`);
}

const sets = levels.map(L => L.palette.join());
assert.equal(levels.length, 276, 'the catalog must contain 276 levels');
assert.equal(levels.filter(L => L.canvasSize === 'large').length, 25, 'exactly 25 large levels required');
assert.equal(levels.filter(L => L.id.startsWith('chapter_')).length, 25, '25 old geometric levels should remain');
assert.equal(new Set(levels.map(L => L.id)).size, levels.length, 'duplicate level id');
assert.equal(new Set(sets).size, sets.length, 'two levels share a palette');
for (let i = 1; i < levels.length; i++) {
  const a = visualFamily(levels[i - 1]), b = visualFamily(levels[i]);
  assert(a !== b || a === 'classic', `similar visual families are adjacent at ${i}: ${a}`);
}
const out = 'window.CARTO_STAINED = ' + JSON.stringify(levels) + ';\n'
  + 'window.CARTO_STAINED_ORDER = ' + JSON.stringify({ version: 'mixed-style-hard-every-10-v2', previousIds }) + ';\n';
fs.writeFileSync(path.join(ROOT, 'stained-levels.js'), out);
patterns.assets = patterns.assets.map(entry => ({ ...entry, playLevel: levels.findIndex(L => L.id === entry.id) + 1 }));
fs.writeFileSync(path.join(__dirname, 'pattern-catalog.json'), JSON.stringify(patterns, null, 2) + '\n');
console.log(`stained-levels.js: ${levels.length} levels, ${(out.length / 1024).toFixed(0)} KB`);
