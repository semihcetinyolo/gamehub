// Reorder the start of the game by total pane count (user, 2026-10-20): a big panel with only
// a handful of blanks looks odd early on, so levels 2–50 take the smallest panels, in rising
// size. Cat stays first, hard levels keep their slots (10, 20, …); the brain is level BRAIN_AT.
// Levels 2–20 are the showcase (user, same day: "ilk 20 çok önemli, kedi gibi etkileyici görseller"):
// hand-picked classic panels with a clear subject, smallest first.
// The rest keep their current relative order. Rewrites play-order.json; then run build_levels.js.
//   node tools/stained/order_small_start.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '../..');
const ORDER_FILE = path.join(__dirname, 'play-order.json');
const START = 50;        // levels 2..START are the "start of the game"
const MIN_SHARE = 0.25;  // an early level leaves at least this share of its panes to paint
const FEATURED = ['fish', 'moon', 'flower', 'fox', 'sailboat', 'pear', 'rabbit', 'mushroom',
  'lighthouse', 'cactus', 'lotus', 'balloon', 'heart', 'whale', 'penguin', 'strawberry'];
const BRAIN_AT = 3;     // user, 2026-10-20: the brain comes in the first five
const SERIES_GAP = 15;
const AFTER_SHOWCASE = 18; // 21–50 don't drop back to tiny panels; those stay in the later mix as breathers   // the same series (Yıldız Kırığı 2 and 11) or subject (two boots) is this far apart early on

global.window = {};
require(path.join(ROOT, 'stained-levels.js'));
const byId = new Map(window.CARTO_STAINED.map(L => [L.id, L]));
const order = JSON.parse(fs.readFileSync(ORDER_FILE, 'utf8'));
assert.deepEqual([...order].sort(), [...byId.keys()].sort(), 'play-order.json and stained-levels.js differ');

const isHard = id => byId.get(id).difficulty?.tier === 'hard';
const count = id => byId.get(id).map.count;
const toPaint = id => byId.get(id).given.filter(c => c < 0).length;
function family(id) { // same families as build_levels.js
  if (id === 'brain') return 'brain';
  if (id.startsWith('grand_')) return 'scene';
  if (id.startsWith('story_') || id.startsWith('motif_')) return 'figurative';
  if (/^(rings|spiral|atlas)_/.test(id)) return 'pattern';
  if (id.startsWith('chapter_')) return 'geometric';
  return 'classic';
}
// "Yıldız Kırığı 11" → "Yıldız Kırığı"; story_boots and motif_boots are the same subject.
function series(id) {
  if (id.startsWith('chapter_')) return byId.get(id).name.replace(/\s*\d+$/, '');
  return id.replace(/^(story|motif)_/, '');
}
const clash = (a, b) => a && b && family(a) === family(b) && family(a) !== 'classic';

const out = order.map((id, i) => (i === 0 || isHard(id) ? id : null));
assert.equal(out[BRAIN_AT - 1], null);
out[BRAIN_AT - 1] = 'brain';
assert.equal(out[0], 'cat');
const free = order.filter(id => !out.includes(id));
const rank = new Map(order.map((id, i) => [id, i]));
const take = (pool, i) => {
  const ok = pool.filter(id => !clash(out[i - 1], id) && !clash(out[i + 1], id));
  let pick = (ok.length ? ok : pool)[0];
  // Keep enough separators for later: once one family fills more than every other free slot
  // that is left, it goes first.
  const slotsLeft = out.slice(i + 1).filter(id => id === null).length;
  const left = new Map();
  for (const id of free) if (id !== pick && family(id) !== 'classic') left.set(family(id), (left.get(family(id)) || 0) + 1);
  const [crowded, n] = [...left].sort((x, y) => y[1] - x[1])[0] || [];
  if (n > Math.ceil(slotsLeft / 2)) pick = ok.find(id => family(id) === crowded) || pick;
  free.splice(free.indexOf(pick), 1);
  return pick;
};

// smallest panels first; ties: fewer to paint, then the old position
const small = i => free.filter(id => toPaint(id) / count(id) >= MIN_SHARE && count(id) >= AFTER_SHOWCASE
    && !out.slice(Math.max(0, i - SERIES_GAP + 1), i).some(prev => prev && series(prev) === series(id)))
  .sort((a, b) => count(a) - count(b) || toPaint(a) - toPaint(b) || rank.get(a) - rank.get(b));
const showcase = FEATURED.slice().sort((a, b) => count(a) - count(b) || toPaint(a) - toPaint(b));
for (let i = 1; showcase.length; i++) if (out[i] === null) out[i] = take([showcase.shift()], i);
assert(out.indexOf(FEATURED.find(id => out.indexOf(id) > 19) || 'cat') < 20, 'the showcase must fit in levels 2–20');
for (let i = 1; i < START; i++) if (out[i] === null) out[i] = take(small(i), i);
for (let i = START; i < out.length; i++) if (out[i] === null) out[i] = take(free.slice(), i);

assert.equal(free.length, 0);
assert.equal(new Set(out).size, order.length);
for (let i = 1; i < out.length; i++) assert(!clash(out[i - 1], out[i]), `same family next to each other at ${i}`);
fs.writeFileSync(ORDER_FILE, JSON.stringify(out, null, 2) + '\n');
const moved = out.filter((id, i) => id !== order[i]).length;
console.log(`play-order.json: levels 2–${START} by pane count (${count(out[1])}–${Math.max(...out.slice(1, START).filter(id => !isHard(id)).map(count))} panes), ${moved} positions changed`);
