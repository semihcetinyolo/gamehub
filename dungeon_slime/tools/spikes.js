// Spike placement shared by tools/gen.js and tools/respike.js.
// Legacy authoring helper: reserves untouched cells next to masonry as hazardous solid
// wall material ('*'). The renderer unifies these cells and backing masonry into one
// visible boundary. Only faces the solution never approaches receive hazards.
const E = require('../engine.js');

// Cells the solution's body comes near (swept rects grown by a safety margin).
function touchedCells(L, path, M = .15) {
  const hit = new Set();
  const mark = b => {
    for (let y = Math.floor(b.y - M); y < Math.ceil(b.y + b.h + M); y++)
      for (let x = Math.floor(b.x - M); x < Math.ceil(b.x + b.w + M); x++) hit.add(x + ',' + y);
  };
  let s = E.initialState(L); mark(s);
  for (const d of path) {
    const r = E.move(L, s, d); let p = s;
    for (const q of r.path) {
      mark({ x: Math.min(p.x, q.x), y: Math.min(p.y, q.y), w: Math.abs(q.x - p.x) + s.w, h: Math.abs(q.y - p.y) + s.h });
      p = { ...q, w: s.w, h: s.h };
    }
    s = r.state; mark(s);
  }
  return hit;
}

// Put spike strips on untouched floor tiles that sit against a wall; each 4-connected run of
// such tiles is spiked as a whole with probability p. rnd() -> [0, 1).
function addFloorSpikes(grid, touched, p, rnd) {
  const g = grid.map(r => r.split(''));
  const H = g.length, W = g[0].length;
  const at = (x, y) => (y < 0 || y >= H || x < 0 || x >= W) ? '#' : g[y][x];
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const cand = new Set();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
    if (g[y][x] === '.' && !touched.has(x + ',' + y) && N4.some(([dx, dy]) => at(x + dx, y + dy) === '#')) cand.add(x + ',' + y);
  const seen = new Set();
  for (const k of cand) {
    if (seen.has(k)) continue;
    const run = [], q = [k]; seen.add(k);
    while (q.length) {
      const c = q.pop(); run.push(c); const [x, y] = c.split(',').map(Number);
      for (const [dx, dy] of N4) { const n = (x + dx) + ',' + (y + dy); if (cand.has(n) && !seen.has(n)) { seen.add(n); q.push(n); } }
    }
    if (run.length >= 2 && rnd() < p) for (const c of run) { const [x, y] = c.split(',').map(Number); g[y][x] = '*'; }
  }
  // a spike tile must face open floor somewhere; drop any that ended up boxed in
  for (let changed = true; changed;) {
    changed = false;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
      if (g[y][x] === '*' && !N4.some(([dx, dy]) => !'#*'.includes(at(x + dx, y + dy)))) { g[y][x] = '.'; changed = true; }
  }
  return g.map(r => r.join(''));
}

module.exports = { touchedCells, addFloorSpikes };
