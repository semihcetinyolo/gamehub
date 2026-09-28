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

// Level rule: no move may die ONLY because of the reshape. That is a move whose slide was safe but
// whose new form lands touching a hazard (a spike tile or a closed gate): the player cannot see it
// coming. Explores every reachable state. Returns { deaths, complete } where each death is
// { state, dir, body, tiles: spike rects touched, gates: closed gate indices touched }.
function reshapeDeaths(L, limit = 100000) {
  const s0 = E.initialState(L), seen = new Set([E.keyOf(s0)]), q = [s0], deaths = [];
  for (let head = 0; head < q.length; head++) {
    if (seen.size >= limit) return { deaths, complete: false };
    const s = q[head];
    for (const dir of Object.keys(E.DIRS)) {
      const r = E.move(L, s, dir);
      if (r.result === 'none' || r.result === 'win') continue;
      if (r.result === 'dead') {
        if (r.impact && r.impact.reshaped) {
          const body = { x: r.state.x, y: r.state.y, w: r.state.w, h: r.state.h };
          deaths.push({ state: s, dir, body,
            tiles: L.solids.filter(t => t.t === 'spike' && E.touches(t, body)),
            gates: L.gates.flatMap((g, i) => !E.gateOpen(L, r.state, i) && E.touches(g, body) ? [i] : []) });
        }
        continue;
      }
      const k = E.keyOf(r.state);
      if (!seen.has(k)) { seen.add(k); q.push(r.state); }
    }
  }
  return { deaths, complete: true };
}

// Remove every reshape death caused by spike tiles: each straight spike segment a reshape can land
// on becomes plain wall. '*' and '#' are the same solid geometry, so every slide, every reshape
// and the solution stay exactly the same; only that surface stops being lethal. Repeats until
// none is left (a defused surface can open new states). Deaths on closed gates cannot be defused
// this way (the gate is a mechanic) and are returned so the caller can reject or report them.
function defuseReshapeDeaths(level) {
  let grid = level.grid.slice(), converted = 0;
  for (let round = 0; round < 60; round++) {
    const L = E.parse({ ...level, grid });
    const { deaths, complete } = reshapeDeaths(L);
    const gateDeaths = deaths.filter(d => d.gates.length && !d.tiles.length);
    const cells = new Set();
    for (const d of deaths) for (const t of d.tiles) for (let i = 0; i < t.w; i++) for (let j = 0; j < t.h; j++) cells.add((t.x + i) + ',' + (t.y + j));
    if (!cells.size) return { grid, converted, gateDeaths, complete };
    const g = grid.map(r => r.split('')), H = g.length, W = g[0].length;
    const at = (x, y) => (y < 0 || y >= H || x < 0 || x >= W) ? '#' : g[y][x];
    const segment = new Set();
    for (const c of cells) { // grow each touched tile to its whole straight segment along its wall
      const [x, y] = c.split(',').map(Number);
      segment.add(c);
      for (const [wx, wy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (at(x + wx, y + wy) !== '#') continue;
        const [ax, ay] = wx ? [0, 1] : [1, 0]; // the strip runs perpendicular to the wall side
        for (const k of [-1, 1]) for (let n = 1; ; n++) {
          const nx = x + ax * k * n, ny = y + ay * k * n;
          if (at(nx, ny) !== '*' || at(nx + wx, ny + wy) !== '#') break;
          segment.add(nx + ',' + ny);
        }
      }
    }
    for (const c of segment) { const [x, y] = c.split(',').map(Number); if (g[y][x] === '*') { g[y][x] = '#'; converted++; } }
    grid = g.map(r => r.join(''));
  }
  throw new Error(`${level.name}: reshape deaths did not settle`);
}

module.exports = { touchedCells, addFloorSpikes, reshapeDeaths, defuseReshapeDeaths };
