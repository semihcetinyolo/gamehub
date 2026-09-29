// Long Cat — pure game logic (browser + node).
// Grid legend: '#' wall, '.' floor, 'S' floor where the cat starts.
// A swipe slides the head until the next cell is a wall, the edge or the cat's own body;
// every cell it passes becomes body. Win = every floor cell covered. No legal swipe left = stuck.
(function (root) {
  const DIRS = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };
  const DIR_KEYS = ['up', 'right', 'down', 'left'];
  const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };

  function parse(lv) {
    const rows = lv.grid, H = rows.length, W = Math.max(...rows.map(r => r.length));
    const open = new Uint8Array(W * H);
    let start = -1, floor = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const ch = rows[y][x] || '#';
      if (ch !== '#') { open[y * W + x] = 1; floor++; }
      if (ch === 'S') start = y * W + x;
    }
    if (start < 0) throw new Error('level has no S');
    return { W, H, open, start, floor, name: lv.name };
  }

  // cells passed by a slide from `head` toward `dir` (empty = blocked)
  function slide(L, filled, head, dir) {
    const [dx, dy] = DIRS[dir], out = [];
    let x = head % L.W, y = (head / L.W) | 0;
    for (;;) {
      x += dx; y += dy;
      if (x < 0 || y < 0 || x >= L.W || y >= L.H) break;
      const i = y * L.W + x;
      if (!L.open[i] || filled[i]) break;
      out.push(i);
    }
    return out;
  }
  const legal = (L, filled, head) => DIR_KEYS.filter(d => slide(L, filled, head, d).length);

  // ---------- play state ----------
  function newState(L) {
    const filled = new Uint8Array(L.W * L.H); filled[L.start] = 1;
    return { head: L.start, filled, count: 1, moves: [] };
  }
  function apply(L, s, dir) {
    const cells = slide(L, s.filled, s.head, dir);
    if (!cells.length) return null;
    for (const i of cells) s.filled[i] = 1;
    s.count += cells.length; s.head = cells[cells.length - 1];
    const m = { dir, cells }; s.moves.push(m); return m;
  }
  function undo(L, s) {
    const m = s.moves.pop(); if (!m) return null;
    for (const i of m.cells) s.filled[i] = 0;
    s.count -= m.cells.length;
    s.head = s.moves.length ? s.moves[s.moves.length - 1].cells.at(-1) : L.start;
    return m;
  }
  const won = (L, s) => s.count === L.floor;
  const stuck = (L, s) => !won(L, s) && !legal(L, s.filled, s.head).length;

  // ---------- solver ----------
  // Zobrist-hashed DFS over (filled, head). Returns per-level stats and a hint function.
  function makeSolver(L) {
    const N = L.W * L.H, z1 = new Int32Array(N), z2 = new Int32Array(N);
    let seed = 0x9e3779b9;
    const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; };
    for (let i = 0; i < N; i++) { z1[i] = rnd(); z2[i] = rnd(); }
    const memo = new Map();
    // node: {win: bool, pRand, pSmart, sols (capped), dead: moves until stuck in a lost node}
    function key(filled, head) {
      let a = 0, b = 0;
      for (let i = 0; i < N; i++) if (filled[i]) { a ^= z1[i]; b ^= z2[i]; }
      return a + ',' + b + ',' + head;
    }
    function node(filled, count, head, k) {
      let n = memo.get(k); if (n) return n;
      if (count === L.floor) { n = { win: true, pRand: 1, pSmart: 1, sols: 1, dead: 0, kids: [] }; memo.set(k, n); return n; }
      const kids = [];
      for (const d of DIR_KEYS) {
        const cells = slide(L, filled, head, d); if (!cells.length) continue;
        for (const i of cells) filled[i] = 1;
        const nh = cells[cells.length - 1];
        let a = 0, b = 0; // incremental key
        const [pa, pb] = k.split(',');
        a = +pa; b = +pb; for (const i of cells) { a ^= z1[i]; b ^= z2[i]; }
        const c = node(filled, count + cells.length, nh, a + ',' + b + ',' + nh);
        for (const i of cells) filled[i] = 0;
        kids.push({ d, c, len: cells.length });
      }
      if (!kids.length) { n = { win: false, pRand: 0, pSmart: 0, sols: 0, dead: 0, kids }; memo.set(k, n); return n; }
      const pRand = kids.reduce((s, x) => s + x.c.pRand, 0) / kids.length;
      // "smart" player: never picks a swipe that leaves them stuck right away
      const ok = kids.filter(x => x.c.win || x.c.kids.length);
      const pool = ok.length ? ok : kids;
      const pSmart = pool.reduce((s, x) => s + x.c.pSmart, 0) / pool.length;
      const win = kids.some(x => x.c.win);
      const sols = Math.min(1e6, kids.reduce((s, x) => s + x.c.sols, 0));
      const dead = win ? 0 : 1 + Math.max(...kids.map(x => x.c.dead));
      n = { win, pRand, pSmart, sols, dead, kids }; memo.set(k, n); return n;
    }
    function at(s) {
      const f = new Uint8Array(s.filled);
      return node(f, s.count, s.head, key(f, s.head));
    }
    return {
      at,
      hint(s) { const n = at(s); const w = n.kids.find(x => x.c.win); return w ? w.d : null; },
      solvable(s) { return at(s).win; },
      states: () => memo.size,
    };
  }

  // Level stats for ordering. Difficulty = -log2(chance a careful-but-blind player solves it)
  // plus a small length term; traps that bite late count extra.
  function analyse(lv) {
    const L = parse(lv), S = makeSolver(L), s = newState(L), root = S.at(s);
    if (!root.win) return { solvable: false };
    // walk one solution, measuring decision points and how late wrong turns fail
    let n = root, moves = 0, decisions = 0, lateTraps = 0; const path = [];
    while (n.kids.length) {
      const w = n.kids.find(x => x.c.win);
      const bad = n.kids.filter(x => !x.c.win);
      if (bad.length) { decisions++; if (bad.some(x => x.c.dead >= 2)) lateTraps++; }
      path.push(w.d); n = w.c; moves++;
    }
    const d = -Math.log2(Math.max(root.pSmart, 1e-9)) + 0.06 * moves + 0.35 * lateTraps;
    return { solvable: true, moves, decisions, lateTraps, sols: root.sols, pRand: root.pRand, pSmart: root.pSmart,
      difficulty: +d.toFixed(2), states: S.states(), solution: path, floor: L.floor, W: L.W, H: L.H };
  }

  const api = { DIRS, DIR_KEYS, OPP, parse, slide, legal, newState, apply, undo, won, stuck, makeSolver, analyse };
  if (typeof module !== 'undefined') module.exports = api; else root.LongCatEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
