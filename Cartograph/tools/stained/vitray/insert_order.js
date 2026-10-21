// Place the published vitray levels in play-order.json / hard-order.json.
// node tools/stained/vitray/insert_order.js
// Existing levels keep their relative order. Normal vitray levels are spread
// evenly after level 50 (the hand-ordered start stays as it is); hard ones take
// evenly spread hard slots, so hard levels remain exactly at 10, 20, 30, ...
// Idempotent: vitray ids already in the order are taken out first.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const STAINED = path.join(__dirname, '..');
const ORDER_FILE = path.join(STAINED, 'play-order.json');
const HARD_FILE = path.join(STAINED, 'hard-order.json');
const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, 'catalog.json'), 'utf8')).levels;
const isVitray = id => id.startsWith('vitray_');

const current = JSON.parse(fs.readFileSync(ORDER_FILE, 'utf8'));
const hardSeq = current.filter((id, i) => (i + 1) % 10 === 0 && !isVitray(id));
const normal = current.filter((id, i) => (i + 1) % 10 !== 0 && !isVitray(id));
const hardIds = new Set(JSON.parse(fs.readFileSync(HARD_FILE, 'utf8')).filter(id => !isVitray(id)));
assert.deepEqual([...hardIds].sort(), [...hardSeq].sort(), 'hard slots and hard-order.json disagree');

const family = id => {
  if (isVitray(id)) return 'vitray';
  if (id === 'brain') return 'brain';
  if (id.startsWith('grand_')) return 'scene';
  if (id.startsWith('story_') || id.startsWith('motif_')) return 'figurative';
  if (/^(rings|spiral|atlas)_/.test(id)) return 'pattern';
  if (id.startsWith('chapter_')) return 'geometric';
  return 'classic';
};

function spread(list, extra, from) {
  // insert `extra` at even gaps in list[from..]
  const out = list.slice();
  const span = out.length - from;
  extra.forEach((id, j) => {
    const at = from + Math.round(span * (j + 1) / (extra.length + 1)) + j;
    out.splice(at, 0, id);
  });
  return out;
}
const newNormal = catalog.filter(l => !l.hard).map(l => l.id);
const newHard = catalog.filter(l => l.hard).map(l => l.id);
const START_NORMAL = 45; // normal index 45 is play level 51
const normals = spread(normal, newNormal, START_NORMAL);
const hards = spread(hardSeq, newHard, 5);
const total = normals.length + hards.length;
assert.equal(hards.length, Math.floor(total / 10), `need ${Math.floor(total / 10)} hard levels, have ${hards.length}`);

let n = 0, h = 0;
const out = Array.from({ length: total }, (_, i) => ((i + 1) % 10 === 0 ? hards[h++] : normals[n++]));
// Same visual family may not sit side by side (build_levels.js rule). Hard
// slots and levels 1-50 are fixed; the rest are laid out greedily, each slot
// taking the earliest waiting level that does not clash with its neighbours,
// so levels move at most a few places.
const clash = (a, b) => a && b && family(a) === family(b) && family(a) !== 'classic';
const fixed = i => i < 50 || (i + 1) % 10 === 0;
const queue = out.filter((_, i) => !fixed(i));
for (let i = 0; i < out.length; i++) {
  if (fixed(i)) continue;
  const next = i + 1 < out.length && fixed(i + 1) ? out[i + 1] : null;
  let k = queue.findIndex(id => !clash(out[i - 1], id) && !clash(id, next));
  if (k < 0) k = queue.findIndex(id => !clash(out[i - 1], id));
  if (k < 0) k = 0;
  out[i] = queue.splice(k, 1)[0];
}
for (let i = 1; i < out.length; i++) assert(!clash(out[i - 1], out[i]), `family clash at ${i}: ${out[i - 1]} ${out[i]}`);
assert.equal(new Set(out).size, out.length);
fs.writeFileSync(ORDER_FILE, JSON.stringify(out, null, 2) + '\n');
fs.writeFileSync(HARD_FILE, JSON.stringify(hards, null, 2) + '\n');
console.log(`play-order.json: ${out.length} levels; vitray at ` + out.map((id, i) => isVitray(id) ? i + 1 : 0).filter(Boolean).join(', '));
