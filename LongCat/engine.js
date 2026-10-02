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

  // ---------- time estimate ----------
  // Expected seconds for a careful player who remembers dead ends: they avoid swipes that
  // leave them stuck at once, try the rest in random order, and back out of a lost branch
  // (restart + replay). Constants are guesses until real playtest times replace them.
  const T = { move: 1.3, decide: 1.0, think: 0.6, fail: 2.0, back: 1.5, backPerMove: 0.5, capLost: 20, read: 3 };
  function estimateSeconds(root) {
    const think = k => k > 1 ? T.decide + T.think * (k - 1) : 0; // every real choice costs a pause, more options cost more
    const pool = n => { const ok = n.kids.filter(x => x.c.win || x.c.kids.length); return ok.length ? ok : n.kids; };
    const lost = new Map(), won = new Map();
    function F(n) { // time to exhaust a lost subtree (capped: nobody explores it all)
      if (lost.has(n)) return lost.get(n);
      let t = T.fail;
      if (n.kids.length) { const p = pool(n); t = think(p.length) + p.reduce((a, x) => a + T.move + F(x.c) + T.back, 0); }
      t = Math.min(t, T.capLost); lost.set(n, t); return t;
    }
    function E(n, depth) {
      if (!n.kids.length) return 0;
      if (won.has(n)) return won.get(n);
      const p = pool(n), W = p.filter(x => x.c.win), Lz = p.filter(x => !x.c.win);
      let t = think(p.length) + W.reduce((a, x) => a + T.move + E(x.c, depth + 1), 0) / W.length;
      if (Lz.length) t += (Lz.length / (W.length + 1)) * (Lz.reduce((a, x) => a + T.move + F(x.c), 0) / Lz.length + T.back + T.backPerMove * depth);
      won.set(n, t); return t;
    }
    return T.read + E(root, 0);
  }

  // Level stats for ordering. Difficulty = -log2(chance a careful-but-blind player solves it)
  // plus a small length term; traps that bite late count extra.
  function analyse(lv) {
    const L = parse(lv), S = makeSolver(L), s = newState(L), root = S.at(s);
    if (!root.win) return { solvable: false };
    // walk one solution, measuring decision points and how late wrong turns fail
    // shape = where the decisions sit on the solver's line: at = share of the floor already covered (0 start, 1 end)
    let n = root, moves = 0, decisions = 0, lateTraps = 0, choices = 0, count = 1; const path = [], shape = [];
    while (n.kids.length) {
      const w = n.kids.find(x => x.c.win);
      const bad = n.kids.filter(x => !x.c.win);
      if (n.kids.length > 1) { choices++; shape.push({ at: +(count / L.floor).toFixed(2), free: !bad.length }); } // a real choice: 2+ legal swipes here
      if (bad.length) { decisions++; if (bad.some(x => x.c.dead >= 2)) lateTraps++; }
      path.push(w.d); count += w.len; n = w.c; moves++;
    }
    // Ideal level: the first decisions are all safe, the traps sit in the middle, the end is calm.
    // firstRisk = progress at which ANY play (not just the solver's line) first meets a losing option;
    // endTraps = most trap decisions after 80% progress on any winning line.
    // openFree = fewest free decisions any winning line passes before its first trap.
    let firstRisk = 1, openFree = Infinity; const seen = new Map(), endMemo = new Map();
    (function walk(n, c, f) {
      if (seen.has(n) && seen.get(n) <= f) return; seen.set(n, f);
      if (n.kids.some(x => !x.c.win)) { firstRisk = Math.min(firstRisk, c / L.floor); openFree = Math.min(openFree, f); return; }
      for (const x of n.kids) walk(x.c, c + x.len, f + (n.kids.length > 1 ? 1 : 0));
    })(root, 1, 0);
    if (openFree === Infinity) openFree = choices;
    const endTraps = (function E(n, c) {
      if (!n.kids.length) return 0;
      let v = endMemo.get(n); if (v !== undefined) return v;
      const trap = c / L.floor >= 0.8 && n.kids.some(x => !x.c.win) ? 1 : 0;
      v = trap + Math.max(...n.kids.filter(x => x.c.win).map(x => E(x.c, c + x.len)));
      endMemo.set(n, v); return v;
    })(root, 1);
    const rootLegal = root.kids.length, rootWin = root.kids.filter(x => x.c.win).length;
    const seconds = estimateSeconds(root);
    // every distinct way to play until the level ends (won or stuck); sols counts the won ones
    const pc = new Map(), paths = (function P(n) { if (!n.kids.length) return 1; let v = pc.get(n); if (v === undefined) { v = Math.min(1e9, n.kids.reduce((a, x) => a + P(x.c), 0)); pc.set(n, v); } return v; })(root);
    const d = -Math.log2(Math.max(root.pSmart, 1e-9)) + 0.06 * moves + 0.35 * lateTraps;
    return { solvable: true, rootLegal, rootWin, choices, paths, shape, firstRisk: +firstRisk.toFixed(2), openFree, endTraps, seconds: +seconds.toFixed(1), moves, decisions, lateTraps, sols: root.sols, pRand: root.pRand, pSmart: root.pSmart,
      difficulty: +d.toFixed(2), states: S.states(), solution: path, floor: L.floor, W: L.W, H: L.H };
  }

  const api = { DIRS, DIR_KEYS, OPP, parse, slide, legal, newState, apply, undo, won, stuck, makeSolver, analyse };
  if (typeof module !== 'undefined') module.exports = api; else root.LongCatEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
