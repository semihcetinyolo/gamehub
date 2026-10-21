// Assemble stained-levels-v2.js: the new-style V2 level list (user, 2026-10-21).
// node tools/stained/vitray/build_v2.js
// Order: the v2_cat tutorial, then a size ramp (user: few panes at the start, then
// medium, the large ones kept): small (<25 panes), medium (<50) and large levels are
// drawn from three queues by RAMP. Within a size the order is: the Pinterest levels
// (vitray/v2-catalog.json, smallest first), the redrawn V1 subjects in V1 play order
// (redraw/queue.json), then the new subjects (fresh/queue.json).
// Only finished levels are included, so the list grows while the pipeline runs.
// Hard levels take every 10th place from place 20 while there are any.
// Same checks as build_levels.js.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const E = require('../../../engine.js');
const { openingSeeds } = require('../starting_clues.js');

const HERE = __dirname, STAINED = path.join(HERE, '..'), ROOT = path.join(STAINED, '..', '..');
const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const pinterest = read(path.join(HERE, 'v2-catalog.json')).levels.map(l => l.id);
const redraw = read(path.join(HERE, 'redraw', 'queue.json')).map(q => q.id);
const fresh = fs.existsSync(path.join(HERE, 'fresh', 'queue.json')) ? read(path.join(HERE, 'fresh', 'queue.json')).map(q => q.id) : [];
const extra = fs.readdirSync(path.join(HERE, 'work')).filter(f => f.endsWith('.map.json')).map(f => f.slice(0, -9))
  .filter(id => id.startsWith('vitray_') && !pinterest.includes(id));
// After the tutorial: 15 opening places mostly small, then this cycle.
const OPENING = 'SSSMSSSMSSSMSSM', RAMP = 'SMLMLSMLLM';
const work = id => path.join(HERE, 'work', id + '.map.json');

function ready(id) {
  if (!fs.existsSync(work(id))) return null;
  const info = read(work(id));
  if (info.artworkNeedsRefresh || !info.given || !info.clueFocus?.prepared || !info.artMetadata) return null;
  return info;
}

function entry(id, info) {
  const { map, solution, given } = info;
  const art = read(path.join(ROOT, info.artMetadata));
  const image = info.image;
  assert(fs.existsSync(path.join(ROOT, image)), `${id}: artwork missing`);
  assert(art.paneColorCheck?.valid && art.paneColorCheck.matched === art.paneColorCheck.total, `${id}: artwork colours`);
  assert.equal(art.guide, sha(fs.readFileSync(path.join(STAINED, 'guides', id + '.png'))), `${id}: guide changed after artwork`);
  assert.equal(art.sha256, sha(fs.readFileSync(path.join(ROOT, image))), `${id}: artwork changed after validation`);
  const body = `${map.cols.toFixed(3)},${map.rows.toFixed(3)}\n` + map.paths.join('\n') + '\n' + map.shape + '\n'
    + map.adj.map(a => a.join(',')).join(';') + '\n'
    + map.edges.map(e => [...e.slice(0, 4).map(v => v.toFixed(3)), ...e.slice(4)].join(',')).join(';');
  const q = info.geometryQuality;
  assert(q?.version === 4 && q.valid && !q.issues.length && q.fingerprint === sha(body), `${id}: geometry approval`);
  assert.equal(info.clueFocus.solution, sha(JSON.stringify(solution)), `${id}: clues prepared for another solution`);
  for (let r = 0; r < map.count; r++) for (const j of map.adj[r]) {
    assert(map.adj[j].includes(r), `${id}: adjacency`);
    assert.notEqual(solution[r], solution[j], `${id}: solution clash`);
  }
  assert.deepEqual([...new Set(solution)].sort(), [0, 1, 2, 3], `${id}: four colours`);
  assert(given.every((c, r) => c === -1 || c === solution[r]) && given.some(c => c < 0), `${id}: clues`);
  const hard = info.difficulty?.tier === 'hard';
  if (info.tutorial) {
    assert(map.count <= 16 && given.filter(c => c < 0).length === 4, `${id}: tutorial shape`);
  } else if (!hard) {
    assert(openingSeeds(map.adj, solution, [...solution.keys()], 3).length >= 3, `${id}: three definite starts`);
    assert(E.openings(map.adj, given, 4) >= 3, `${id}: starting moves`);
    assert(E.propagationSolves(map.adj, given, 4), `${id}: plain elimination`);
  } else {
    assert(E.openings(map.adj, given, 4) >= 2 && !E.propagationSolves(map.adj, given, 4), `${id}: hard entry`);
    const s = E.logicSolve(map.adj, given, 4, true).stats;
    assert(s.pairs + s.probes >= 3, `${id}: hard deductions`);
  }
  assert(E.logicSolve(map.adj, given, 4, hard).solved, `${id}: not solvable by logic`);
  assert.equal(E.countSolutions(map.adj, given, 4, 2).count, 1, `${id}: not unique`);
  const m = { ...map }; delete m.clearance; delete m.outlines;
  return { id, name: info.name, palette: art.palette, image, map: m, solution, given, locks: [],
    ...(map.count >= 60 ? { canvasSize: 'large' } : {}),
    ...(hard ? { difficulty: info.difficulty } : {}),
    ...(info.tutorial ? { tutorial: info.tutorial } : {}) };
}

const head = ['v2_cat'];
const pin = [...pinterest, ...extra].map(id => [id, ready(id)]).filter(([, i]) => i)
  .sort((a, b) => a[1].map.count - b[1].map.count).map(([id]) => id);
const tail = [...redraw.filter(id => id !== 'v2_cat'), ...fresh];
const ids = [...head, ...pin, ...tail].filter(id => ready(id));
// A level that fails a check stays out (and is reported) instead of stopping the whole list.
const levels = ids.flatMap(id => {
  try { return [entry(id, ready(id))]; } catch (e) { console.warn(`skipped ${e.message}`); return []; }
});
const size = L => L.map.count < 25 ? 'S' : L.map.count < 50 ? 'M' : 'L';
const out = levels.filter(L => L.tutorial);
const hardQ = levels.filter(L => L.difficulty && !L.tutorial);
const Q = { S: [], M: [], L: [] };
for (const L of levels) if (!L.tutorial && !L.difficulty) Q[size(L)].push(L);
// Small and medium levels grow steadily; large ones keep their list order.
Q.S.sort((a, b) => a.map.count - b.map.count); Q.M.sort((a, b) => a.map.count - b.map.count);
const FALLBACK = { S: 'SML', M: 'MSL', L: 'LMS' };
for (let k = 0; hardQ.length || Q.S.length || Q.M.length || Q.L.length; k++) {
  const place = out.length + 1;
  if (hardQ.length && (place >= 20 && place % 10 === 0 || !(Q.S.length || Q.M.length || Q.L.length))) { out.push(hardQ.shift()); continue; }
  const want = k < OPENING.length ? OPENING[k] : RAMP[(k - OPENING.length) % RAMP.length];
  const from = [...FALLBACK[want]].find(c => Q[c].length);
  out.push(Q[from].shift());
}
assert.equal(new Set(out.map(L => L.palette.join())).size, out.length, 'two V2 levels share a palette');
const text = 'window.CARTO_STAINED_V2 = ' + JSON.stringify(out) + ';\n';
fs.writeFileSync(path.join(ROOT, 'stained-levels-v2.js'), text);
console.log(`stained-levels-v2.js: ${out.length} levels (${out.filter(L => L.difficulty).length} hard), ${(text.length / 1024).toFixed(0)} KB`);
