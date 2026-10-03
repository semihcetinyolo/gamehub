// Puppy Maze — pure game logic (browser + node).
// Grid legend: '#' wall, '.' floor, 'S' floor where the dog starts. Mechanics (rules follow
// Longcat's own LevelSolver, see longcat-ldd.html):
//   'g' glass  — stops the dog like a wall; when the dog stops right in front of it, it breaks and
//                becomes floor that must be filled too. Swiping into glass you already touch breaks it.
//   'b' box    — when the dog stops right in front of it, the box is pushed one cell if the cell
//                behind is empty floor; its old cell becomes floor to fill. Otherwise it is a wall.
//   '┌┐└┘' turn — a floor cell with two open sides; the dog enters through one and leaves through
//                the other in the same slide. Closed sides are walls.
//   '^>v<' arrow — floor; whatever way the dog comes in, it carries on the way the arrow points.
//   'o' pit    — exactly two; the dog drops in one and comes out of the other, same direction.
//   '@' portal — paired by lv.portals {"x,y": [face, pair]}; entered only through its open face,
//                the dog comes out of the twin moving the way the twin faces.
// A swipe runs until something stops it; every cell passed becomes body. Win = every walkable
// cell covered. No swipe changes anything = stuck.
(function (root) {
  const DIRS = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };
  const DIR_KEYS = ['up', 'right', 'down', 'left'];
  const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
  const DI = { up: 0, right: 1, down: 2, left: 3 }, OPPI = [2, 3, 0, 1], CCWI = [3, 0, 1, 2]; // index forms
  const VEC = DIR_KEYS.map(k => DIRS[k]);
  const T = { WALL: 0, FLOOR: 1, GLASS: 2, BOX: 3, TURN: 4, ARROW: 5, PORTAL: 7, PIT: 8 };
  const WALK = [0, 1, 0, 0, 1, 1, 0, 1, 1];
  // a turn cell keeps one direction c: its open sides are c and c rotated 90° anticlockwise
  const TURN_CH = { '└': 1, '┘': 0, '┐': 3, '┌': 2 }, ARROW_CH = { '^': 0, '>': 1, 'v': 2, '<': 3 };
  const TURN_OF = ['┘', '└', '┌', '┐'], ARROW_OF = ['^', '>', 'v', '<'];

  function parse(lv) {
    const rows = lv.grid, H = rows.length, W = Math.max(...rows.map(r => r.length)), N = W * H;
    const t = new Int8Array(N), d = new Int8Array(N), pair = new Int8Array(N).fill(-1), open = new Uint8Array(N);
    let start = -1, floor = 0, mech = 0;
    const pits = [], portals = {};
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const ch = rows[y][x] || '#', i = y * W + x;
      if (ch === '#') continue;
      open[i] = 1; // not a wall: drawn as floor (glass and boxes sit on floor)
      if (ch === '.' || ch === 'S') t[i] = T.FLOOR;
      else if (ch === 'g') t[i] = T.GLASS;
      else if (ch === 'b') t[i] = T.BOX;
      else if (ch in TURN_CH) { t[i] = T.TURN; d[i] = TURN_CH[ch]; }
      else if (ch in ARROW_CH) { t[i] = T.ARROW; d[i] = ARROW_CH[ch]; }
      else if (ch === 'o') { t[i] = T.PIT; pits.push(i); }
      else if (ch === '@') {
        const p = lv.portals && lv.portals[x + ',' + y];
        if (!p) throw new Error(`portal at ${x},${y} has no entry in lv.portals`);
        t[i] = T.PORTAL; d[i] = DI[p[0]]; pair[i] = p[1]; (portals[p[1]] = portals[p[1]] || []).push(i);
      } else throw new Error(`unknown cell '${ch}'`);
      if (t[i] !== T.FLOOR) mech++;
      if (WALK[t[i]]) floor++;
      if (ch === 'S') start = i;
    }
    if (start < 0) throw new Error('level has no S');
    if (pits.length && pits.length !== 2) throw new Error('a level needs exactly two pits');
    const twin = new Int32Array(N).fill(-1);
    if (pits.length) { twin[pits[0]] = pits[1]; twin[pits[1]] = pits[0]; }
    for (const k in portals) { const [a, b] = portals[k]; if (b === undefined) throw new Error('portal ' + k + ' has no twin'); twin[a] = b; twin[b] = a; }
    return { W, H, t, d, twin, open, start, floor, mech, name: lv.name };
  }

  // ---------- play state ----------
  function newState(L) {
    const filled = new Uint8Array(L.W * L.H); filled[L.start] = 1;
    return { head: L.start, filled, t: Int8Array.from(L.t), count: 1, need: L.floor, moves: [] };
  }
  const cloneState = s => ({ head: s.head, filled: Uint8Array.from(s.filled), t: Int8Array.from(s.t), count: s.count, need: s.need, moves: s.moves.slice() });

  // What a swipe does, without changing s: { dir, from, cells, segs, mut } or null when nothing
  // happens. cells = every cell the body grows over, in order; segs = the same cells split where
  // the dog drops through a pit or portal; mut = [cell, oldType, newType] (glass breaks, boxes move).
  function move(L, s, dir) {
    const W = L.W, H = L.H, over = new Map(), tt = i => over.has(i) ? over.get(i) : s.t[i];
    const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
    const cells = [], seen = new Set(), segs = [[]], mut = [];
    const set = (i, nt) => { mut.push([i, tt(i), nt]); over.set(i, nt); };
    const opens = (i, di) => L.d[i] === di || CCWI[L.d[i]] === di; // turn cell i is open on side di
    function interact(pos, di) { // the cell in front of a resting dog: glass breaks, a box is pushed
      if (tt(pos) === T.TURN && !opens(pos, di)) return false;
      const [dx, dy] = VEC[di], ax = pos % W + dx, ay = ((pos / W) | 0) + dy;
      if (!inb(ax, ay)) return false;
      const a = ay * W + ax, at = tt(a);
      if (at === T.GLASS) { set(a, T.FLOOR); return true; }
      if (at === T.BOX) {
        const bx = ax + dx, by = ay + dy; if (!inb(bx, by)) return false;
        const b = by * W + bx;
        if (tt(b) !== T.FLOOR || s.filled[b] || seen.has(b)) return false;
        set(a, T.FLOOR); set(b, T.BOX); return true;
      }
      return false;
    }
    function step(from, di) { // straight run from `from` until something stops it
      const [dx, dy] = VEC[di], res = []; let x = from % W + dx, y = ((from / W) | 0) + dy;
      for (;;) {
        if (!inb(x, y)) return res;
        const q = y * W + x, t = tt(q);
        if (s.filled[q] || seen.has(q) || !WALK[t]) return res;
        if (t === T.TURN) { if (opens(q, OPPI[di])) res.push(q); return res; }
        if (t === T.ARROW || t === T.PIT) { res.push(q); return res; }
        if (t === T.PORTAL) { if (OPPI[di] === L.d[q]) res.push(q); return res; }
        res.push(q); x += dx; y += dy;
      }
    }
    let di = DI[dir], pos = s.head;
    const ht = tt(pos);
    if (ht === T.TURN && !opens(pos, di)) return null;
    if (!(ht === T.PORTAL && L.d[pos] !== di)) for (;;) { // a portal is only left through its face
      const run = step(pos, di);
      if (!run.length) break;
      for (const q of run) { cells.push(q); seen.add(q); segs[segs.length - 1].push(q); }
      const e = run[run.length - 1], et = tt(e);
      if (et === T.PIT || et === T.PORTAL) {
        const ex = L.twin[e];
        if (ex < 0 || s.filled[ex] || seen.has(ex)) break;
        cells.push(ex); seen.add(ex); segs.push([ex]);
        if (et === T.PORTAL) di = L.d[ex];
        pos = ex; continue;
      }
      if (et === T.ARROW) { di = L.d[e]; pos = e; continue; }
      if (et === T.TURN) { di = OPPI[di] === L.d[e] ? CCWI[L.d[e]] : L.d[e]; pos = e; continue; }
      break;
    }
    const end = cells.length ? cells[cells.length - 1] : s.head;
    const hit = interact(end, cells.length ? di : DI[dir]);
    if (!cells.length && !hit) return null;
    return { dir, from: s.head, cells, segs: segs.filter(g => g.length), mut, last: DIR_KEYS[di] };
  }
  const legal = (L, s) => DIR_KEYS.filter(d => move(L, s, d));
  function commit(s, m) {
    for (const i of m.cells) s.filled[i] = 1;
    for (const [i, o, n] of m.mut) { s.t[i] = n; s.need += WALK[n] - WALK[o]; }
    s.count += m.cells.length; if (m.cells.length) s.head = m.cells[m.cells.length - 1];
  }
  function revert(s, m) {
    for (const i of m.cells) s.filled[i] = 0;
    for (let k = m.mut.length - 1; k >= 0; k--) { const [i, o, n] = m.mut[k]; s.t[i] = o; s.need -= WALK[n] - WALK[o]; }
    s.count -= m.cells.length; s.head = m.from;
  }
  function apply(L, s, dir) { const m = move(L, s, dir); if (!m) return null; commit(s, m); s.moves.push(m); return m; }
  function undo(L, s) { const m = s.moves.pop(); if (!m) return null; revert(s, m); return m; }
  const won = (L, s) => s.count === s.need;
  const stuck = (L, s) => !won(L, s) && !legal(L, s).length;
  // plain straight-run helper kept for tools that carve plain levels
  function slide(L, filled, head, dir) {
    const [dx, dy] = DIRS[dir], out = []; let x = head % L.W, y = (head / L.W) | 0;
    for (;;) { x += dx; y += dy; if (x < 0 || y < 0 || x >= L.W || y >= L.H) break; const i = y * L.W + x; if (!L.open[i] || filled[i]) break; out.push(i); }
    return out;
  }

  // ---------- solver ----------
  // Memoised DFS over (filled, head, mechanic state). Returns per-level stats and a hint function.
  function makeSolver(L) {
    const N = L.W * L.H, z1 = new Int32Array(N), z2 = new Int32Array(N), z3 = new Int32Array(N * 9);
    let seed = 0x9e3779b9;
    const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; };
    for (let i = 0; i < N; i++) { z1[i] = rnd(); z2[i] = rnd(); }
    for (let i = 0; i < N * 9; i++) z3[i] = rnd();
    const memo = new Map();
    function key(ws) {
      let a = 0, b = 0, c = 0;
      for (let i = 0; i < N; i++) { if (ws.filled[i]) { a ^= z1[i]; b ^= z2[i]; } if (ws.t[i] !== L.t[i]) c ^= z3[i * 9 + ws.t[i]]; }
      return a + ',' + b + ',' + c + ',' + ws.head;
    }
    // node: {win, pRand, pSmart, sols (capped), dead: moves until stuck in a lost node, kids}
    function node(ws, k) {
      let n = memo.get(k); if (n) return n;
      if (ws.count === ws.need) { n = { win: true, pRand: 1, pSmart: 1, sols: 1, dead: 0, kids: [] }; memo.set(k, n); return n; }
      memo.set(k, n = { win: false, pRand: 0, pSmart: 0, sols: 0, dead: 0, kids: [] }); // placeholder guards against cycles
      const kids = [];
      for (const d of DIR_KEYS) {
        const m = move(L, ws, d); if (!m) continue;
        commit(ws, m);
        const c = node(ws, key(ws));
        revert(ws, m);
        kids.push({ d, c, len: m.cells.length });
      }
      if (kids.length) {
        n.kids = kids;
        n.pRand = kids.reduce((s, x) => s + x.c.pRand, 0) / kids.length;
        // "smart" player: never picks a swipe that leaves them stuck right away
        const ok = kids.filter(x => x.c.win || x.c.kids.length), pool = ok.length ? ok : kids;
        n.pSmart = pool.reduce((s, x) => s + x.c.pSmart, 0) / pool.length;
        n.win = kids.some(x => x.c.win);
        n.sols = Math.min(1e6, kids.reduce((s, x) => s + x.c.sols, 0));
        n.dead = n.win ? 0 : 1 + Math.max(...kids.map(x => x.c.dead));
      }
      return n;
    }
    function at(s) { const ws = cloneState(s); return node(ws, key(ws)); }
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
  const TIME = { move: 1.3, decide: 1.0, think: 0.6, fail: 2.0, back: 1.5, backPerMove: 0.5, capLost: 20, read: 3 };
  function estimateSeconds(root) {
    const think = k => k > 1 ? TIME.decide + TIME.think * (k - 1) : 0; // every real choice costs a pause, more options cost more
    const pool = n => { const ok = n.kids.filter(x => x.c.win || x.c.kids.length); return ok.length ? ok : n.kids; };
    const lost = new Map(), won = new Map();
    function F(n) { // time to exhaust a lost subtree (capped: nobody explores it all)
      if (lost.has(n)) return lost.get(n);
      let t = TIME.fail;
      if (n.kids.length) { const p = pool(n); t = think(p.length) + p.reduce((a, x) => a + TIME.move + F(x.c) + TIME.back, 0); }
      t = Math.min(t, TIME.capLost); lost.set(n, t); return t;
    }
    function E(n, depth) {
      if (!n.kids.length) return 0;
      if (won.has(n)) return won.get(n);
      const p = pool(n), W = p.filter(x => x.c.win), Lz = p.filter(x => !x.c.win);
      let t = think(p.length) + W.reduce((a, x) => a + TIME.move + E(x.c, depth + 1), 0) / W.length;
      if (Lz.length) t += (Lz.length / (W.length + 1)) * (Lz.reduce((a, x) => a + TIME.move + F(x.c), 0) / Lz.length + TIME.back + TIME.backPerMove * depth);
      won.set(n, t); return t;
    }
    return TIME.read + E(root, 0);
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
      if (n.kids.length > 1) { choices++; shape.push({ at: +(count / L.floor).toFixed(2), free: !bad.length, soft: bad.length === 1 && n.kids.length >= 3 }); } // a real choice: 2+ legal swipes here
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
    // A "soft" trap leaves most options open: one losing swipe out of 3 or 4. firstHard = progress
    // at which any winning line first meets a harsher trap (1 of 2, 1 of 3, ...); earlySoft = soft
    // traps any line can meet before 20% progress.
    let firstHard = 1; const seen2 = new Set(), soft = new Set();
    (function walk(n, c) {
      if (seen2.has(n)) return; seen2.add(n);
      const lose = n.kids.filter(x => !x.c.win).length, win = n.kids.length - lose;
      if (lose && !(lose === 1 && win >= 2)) { firstHard = Math.min(firstHard, c / L.floor); return; }
      if (lose && c / L.floor < 0.2) soft.add(n);
      for (const x of n.kids) if (x.c.win) walk(x.c, c + x.len);
    })(root, 1);
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
    return { solvable: true, start: [L.start % L.W, (L.start / L.W) | 0], rootLegal, rootWin, choices, paths, shape, firstRisk: +firstRisk.toFixed(2), firstHard: +firstHard.toFixed(2), earlySoft: soft.size, openFree, endTraps, seconds: +seconds.toFixed(1), moves, decisions, lateTraps, sols: root.sols, pRand: root.pRand, pSmart: root.pSmart,
      difficulty: +d.toFixed(2), states: S.states(), solution: path, floor: L.floor, W: L.W, H: L.H };
  }

  const api = { DIRS, DIR_KEYS, OPP, T, WALK, TURN_OF, ARROW_OF, parse, slide, move, legal, newState, cloneState, apply, undo, won, stuck, makeSolver, analyse };
  if (typeof module !== 'undefined') module.exports = api; else root.LongCatEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
