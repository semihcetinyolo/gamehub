// Verify the published catalogue against the fresh pre-repair snapshot.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..'), out = path.join(root, 'output/visible-panes');
const read = file => JSON.parse(fs.readFileSync(file));
const load = file => { const ctx = { window: {} }; vm.runInNewContext(fs.readFileSync(file, 'utf8'), ctx); return JSON.parse(JSON.stringify(ctx.window.CARTO_STAINED)); };
const old = load(path.join(out, 'before/stained-levels.js')), levels = load(path.join(root, 'stained-levels.js'));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.deepEqual(levels.map(l => l.id), old.map(l => l.id), 'Keep displayed order and IDs');
assert.deepEqual(levels[0], old[0], 'Keep the complete cat tutorial');
const hard = ls => ls.flatMap((l, i) => l.difficulty?.tier === 'hard' ? [i + 1] : []);
assert.deepEqual(hard(levels), hard(old));
assert.deepEqual(hard(levels), Array.from({ length: 27 }, (_, i) => (i + 1) * 10));
assert.equal(levels.filter(l => l.canvasSize === 'large').length, 25);
const changes = [];
let checkedPanes = 0;
for (const [i, l] of levels.entries()) {
  const info = read(path.join(__dirname, 'maps', l.id + '.json'));
  assert.equal(info.geometryQuality.version, 4);
  assert(info.geometryQuality.valid && !info.geometryQuality.issues.length, l.id + ': geometry');
  assert(info.clueFocus.prepared && info.clueFocus.geometry === info.geometryQuality.fingerprint, l.id + ': clues');
  const art = read(path.join(root, info.artMetadata));
  assert.equal(hash(path.join(root, l.image)), art.sha256);
  assert(art.paneColorCheck.valid && art.paneColorCheck.matched === l.map.count && art.paneColorCheck.total === l.map.count, l.id + ': glass');
  if (info.visiblePaneRepair) {
    assert(l.image.endsWith('-panes.webp') && l.image !== old[i].image, l.id + ': asset connection');
    checkedPanes += l.map.count;
    changes.push({ level: i + 1, id: l.id, before: old[i].map.count, after: l.map.count, image: l.image });
  } else {
    assert.deepEqual(l, old[i], l.id + ': unaffected level must remain unchanged');
  }
}
const report = { valid: true, levels: levels.length, repairedLevels: changes.length, glassAssets: changes.length,
  matchedGlassPanes: checkedPanes, hardSlots: hard(levels), largeLevels: 25, orderPreserved: true, tutorialPreserved: true, changes };
fs.writeFileSync(path.join(out, 'reports/catalogue.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, changes: changes.map(l => l.level) }));
