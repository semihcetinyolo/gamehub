#!/usr/bin/env node
// Level pack generator: node tools/gen.js [--seed N] [--dry]
// Carves levels by playing the slide rule on an empty board (so every level has a solution),
// measures them with the solver, then fills a difficulty curve:
//   tutorials 1–3, then cycles of five: normal, normal+, HARD, easy, easy
//   (a hard level is always followed by two easier ones — the Long Cat curve spikes and never lets go).
const fs = require('fs'), path = require('path');
const E = require('../engine.js');

const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i < 0 ? null : args[i + 1]; };
let seed = +(opt('--seed') || 7);
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const pick = a => a[(rand() * a.length) | 0];

// ---------- carving ----------
function carve(W, H, bias = 0.5) {
  const N = W * H, carved = new Uint8Array(N), locked = new Uint8Array(N);
  const sx = (rand() * W) | 0, sy = (rand() * H) | 0;
  let head = sy * W + sx, last = null; carved[head] = 1; let count = 1;
  const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  for (let step = 0; step < 80; step++) {
    const opts = [];
    for (const d of E.DIR_KEYS) {
      if (last && (d === last || d === E.OPP[last])) continue;
      const [dx, dy] = E.DIRS[d];
      let x = head % W, y = (head / W) | 0, run = [];
      for (;;) {
        x += dx; y += dy;
        if (!inb(x, y) || carved[y * W + x] || locked[y * W + x]) break;
        run.push(y * W + x);
      }
      // stopping after k cells needs the (k+1)th cell to stay solid: edge, body, or a wall we lock
      // (the cell after a full run is already solid; after a partial run it is run[k], which we lock)
      for (let k = 1; k <= run.length; k++) opts.push({ d, k, run, stop: k < run.length ? run[k] : -1 });
    }
    if (!opts.length) break;
    // favour longer runs a little so levels read as corridors and rooms, not confetti
    const w = opts.map(o => Math.max(0.05, 0.6 + o.k * bias + (o.k === o.run.length ? 0.8 : 0)));
    let r = rand() * w.reduce((a, b) => a + b, 0), o = opts[0];
    for (let i = 0; i < opts.length; i++) { r -= w[i]; if (r <= 0) { o = opts[i]; break; } }
    for (let i = 0; i < o.k; i++) carved[o.run[i]] = 1;
    count += o.k; head = o.run[o.k - 1]; last = o.d;
    if (o.stop >= 0) locked[o.stop] = 1;
  }
  const grid = [];
  for (let y = 0; y < H; y++) {
    let row = '';
    for (let x = 0; x < W; x++) { const i = y * W + x; row += i === sy * W + sx ? 'S' : carved[i] ? '.' : '#'; }
    grid.push(row);
  }
  return trim(grid);
}
function trim(g) {
  let rows = g.filter(r => /[.S]/.test(r));
  let x0 = Infinity, x1 = -1;
  for (const r of rows) for (let x = 0; x < r.length; x++) if (r[x] !== '#') { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
  return rows.map(r => r.slice(x0, x1 + 1));
}

// ---------- the curve ----------
const TUTORIALS = [
  { name: 'İlk adım', tip: 'Kaydır — sosis duvara kadar uzar.', grid: [
    '####.',
    'S....',
  ] },
  { name: 'Kıvrıl', tip: 'Her kareyi doldur.', grid: [
    '.....',
    '.###.',
    '.#S..',
  ] },
  { name: 'Kendi kuyruğun', tip: 'Kendi gövden de duvar gibi durdurur.', grid: [
    'S...',
    '....',
    '....',
    '....',
  ] },
];

const COUNT = 30;
function slot(i) { // i = 1-based level number
  if (i <= 3) return null;
  const k = i - 4, cyc = k % 5, t = k / (COUNT - 4);
  const base = 1.3 + t * 5.2;                    // normal difficulty rises 1.3 → 6.5
  const off = [0, 0.6, 3.0, -1.1, -0.8][cyc];    // normal, normal+, HARD, easy, easy
  const size = 4 + Math.floor(t * 4.2) + (cyc === 2 ? 1 : cyc >= 3 ? -1 : 0);
  const W = Math.max(4, Math.min(8, size)), H = Math.max(5, Math.min(11, size + 2));
  return { target: Math.max(0.6, base + off), hard: cyc === 2, breather: cyc >= 3, W, H };
}

function candidates(W, H, n) {
  const out = [];
  for (let t = 0; t < n; t++) {
    const grid = carve(W, H, -0.15 + rand() * 0.8);
    const floor = grid.join('').replace(/#/g, '').length, area = grid.length * grid[0].length;
    if (floor < W * H * 0.45 || floor / area < 0.5 || grid.length < 3 || grid[0].length < 3) continue;
    const a = E.analyse({ grid });
    if (!a.solvable || a.moves < 4) continue;
    out.push({ grid, a });
  }
  return out;
}

const levels = [], used = new Set();
TUTORIALS.forEach(t => levels.push({ ...t, a: E.analyse(t) }));
for (let i = 4; i <= COUNT; i++) {
  const s = slot(i);
  const pool = candidates(s.W, s.H, 600 + Math.round(s.target * 500)).filter(c => !used.has(c.grid.join('/')));
  // hard levels must also have late-biting traps; breathers must be short and readable
  const fit = c => Math.abs(c.a.difficulty - s.target) + (s.hard && !c.a.lateTraps ? 2 : 0) + (s.breather ? c.a.moves * 0.02 : 0);
  pool.sort((p, q) => fit(p) - fit(q));
  const best = pool[0];
  used.add(best.grid.join('/'));
  levels.push({ name: '', grid: best.grid, hard: s.hard || undefined, a: best.a, target: s.target });
}

const NAMES = ['Sabah esnemesi', 'Koridor', 'Yumak', 'Minder', 'Pencere önü', 'Mama kabı', 'Çatı katı', 'Sepet', 'Halı', 'Kutu',
  'Merdiven', 'Kilim', 'Bahçe', 'Kitaplık', 'Güneşlik', 'Dolap üstü', 'Çamaşır', 'Balkon', 'Mutfak', 'Kiler',
  'Tavan arası', 'Bodrum', 'Sokak', 'Çit', 'Ay ışığı', 'Uzun gece', 'Yıldızlar'];
levels.forEach((l, i) => { if (!l.name) l.name = NAMES[i - 3] || 'Bölüm ' + (i + 1); });

// ---------- report + write ----------
console.log('#   size   floor moves dec late   pSmart  diff  target');
levels.forEach((l, i) => {
  const a = l.a;
  console.log(`${String(i + 1).padStart(2)} ${(a.W + '×' + a.H).padEnd(6)} ${String(a.floor).padStart(5)} ${String(a.moves).padStart(5)} ${String(a.decisions).padStart(3)} ${String(a.lateTraps).padStart(4)}  ${a.pSmart.toFixed(3).padStart(7)} ${a.difficulty.toFixed(2).padStart(5)} ${l.target ? l.target.toFixed(2).padStart(6) : '     -'}${l.hard ? '  HARD' : ''}`);
});
if (args.includes('--dry')) process.exit(0);
const body = levels.map(l => {
  const meta = { name: l.name, ...(l.tip ? { tip: l.tip } : {}), ...(l.hard ? { hard: true } : {}),
    par: l.a.moves, difficulty: l.a.difficulty };
  const head = JSON.stringify(meta).slice(1, -1).replace(/"(\w+)":/g, '$1:');
  return `  { ${head},\n    grid: [\n${l.grid.map(r => `      '${r}',`).join('\n')}\n    ] },`;
}).join('\n');
fs.writeFileSync(path.join(__dirname, '..', 'levels.js'),
  `// Generated by tools/gen.js (seed ${opt('--seed') || 7}). '#' wall, '.' floor, 'S' start.\n` +
  `// par = swipes on the solver's solution; difficulty = see engine.js analyse().\n` +
  `window.LEVELS = [\n${body}\n];\n`);
console.log('wrote levels.js');
