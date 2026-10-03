#!/usr/bin/env node
// Level pack generator: node tools/gen.js [--seed N] [--dry]
// Carves levels by playing the slide rule on an empty board (so every level has a solution),
// measures them with the solver, then fills a difficulty curve:
//   tutorials 1–3, then a saw-tooth: blocks of five that climb easy → HARD while the curve rises.
// Each level also targets a number of real decisions (choices = spots on the solution path with 2+
// legal swipes), varied per slot: easy 2–4, normal 3–5, normal+ 4–6, HARD 5–7, and a number of
// traps (decisions where a wrong pick loses): easy 1–2, normal 2–4, normal+ 3–5, HARD 4–6.
// Targets are ESTIMATED SECONDS to solve (engine.js estimateSeconds): about 60 s on average,
// 30–100 s per level. Ideal shape: opening decisions are all safe, traps sit in the middle,
// and near the end of the right line a losing turn is rare.
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
// Beam version of carve for levels with many decisions. Every stop leaves its two side cells
// "pending"; a later run that carves one means that side was open floor when the dog stood
// there, i.e. the player had a real choice. The beam keeps the K partial carves with the most
// such hits (single random carves almost never reach 6–7 decisions). Any prefix of a
// carve is itself a valid level, so the best states of every depth are returned as grids.
function beamCarve(W, H, K = 30, bias = 0.05, judge = null, init = null) {
  const N = W * H, inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const s0 = { carved: new Uint8Array(N), locked: new Uint8Array(N), pending: new Int32Array(N), head: 0, last: null, step: 0, hits: 0, count: 1 };
  let start = ((rand() * H) | 0) * W + ((rand() * W) | 0); s0.head = start; s0.carved[start] = 1;
  if (init) { s0.carved = init.carved; s0.locked = init.locked; s0.head = init.head; s0.last = init.last; s0.count = init.count; start = init.start; } // continue after a placed opening
  let beam = [s0]; const out = [];
  for (let step = 0; step < 60 && beam.length; step++) {
    const next = [];
    for (const st of beam) for (const d of E.DIR_KEYS) {
      if (st.last && (d === st.last || d === E.OPP[st.last])) continue;
      const [dx, dy] = E.DIRS[d];
      let x = st.head % W, y = (st.head / W) | 0; const run = [];
      for (;;) { x += dx; y += dy; if (!inb(x, y) || st.carved[y * W + x] || st.locked[y * W + x]) break; run.push(y * W + x); }
      for (let k = 1; k <= run.length; k++) {
        const n = { carved: st.carved.slice(), locked: st.locked.slice(), pending: st.pending.slice(), head: run[k - 1], last: d, step: step + 1, hits: st.hits, count: st.count + k };
        for (let i = 0; i < k; i++) { const p = n.pending[run[i]]; if (p && p < step + 1) n.hits++; n.pending[run[i]] = 0; n.carved[run[i]] = 1; }
        if (k < run.length) n.locked[run[k]] = 1;
        const hx = n.head % W, hy = (n.head / W) | 0;
        for (const [px, py] of [[hx + dy, hy + dx], [hx - dy, hy - dx]]) if (inb(px, py) && !n.carved[py * W + px] && !n.locked[py * W + px]) n.pending[py * W + px] = step + 2;
        n.score = n.hits * 10 + n.count * bias + rand() * 2.5;
        next.push(n);
      }
    }
    next.sort((a, b) => b.score - a.score);
    if (judge) { // solver-scored beam: every partial carve is a real level, so measure it
      const top = next.slice(0, K * 6);
      for (const n of top) n.score = judge(E.analyse({ grid: toGrid(n) })) + rand() * 2;
      top.sort((a, b) => b.score - a.score); beam = top.slice(0, K);
    } else beam = next.slice(0, K);
    for (const st of beam.slice(0, judge ? 8 : 3)) out.push(st);
  }
  function toGrid(st) {
    const g = [];
    for (let y = 0; y < H; y++) { let row = ''; for (let x = 0; x < W; x++) { const i = y * W + x; row += i === start ? 'S' : st.carved[i] ? '.' : '#'; } g.push(row); }
    return trim(g);
  }
  return out.map(toGrid);
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

const COUNT = 100;
// Saw-tooth curve: levels come in blocks of five (1–5, 6–10, …) that each climb from easy to a
// HARD peak (levels 10, 15, …, 100), while the whole curve rises slowly. Block 1 holds the three
// tutorials, so its peak (level 5) is a gentle one and not tagged HARD.
function slot(i) { // i = 1-based level number
  if (i <= 3) return null;
  const c = Math.floor((i - 1) / 5), p = (i - 1) % 5, t = (i - 4) / (COUNT - 4), hard = p === 4 && c > 0;
  const base = 36 + t * 26;                               // block start ≈ 36 s → 62 s
  const off = [0, 6, 12, 20, 32][p] * (c ? 1 : 0.4);      // climb within the block
  // board size grows with the curve (block 1's peak stays small, later peaks are big enough for
  // 4–5 decisions); the shape is jittered per level — narrow and tall, squat, square — for variety
  const size = 5 + Math.round(t * 3.5) + [0, 0, 0, 1, c ? 2 : 1][p] + (!hard && t > 0.2 && rand() < 0.3 ? -1 : 0);
  const W = Math.max(4, Math.min(8, size)), H = Math.max(5, Math.min(12, size + pick([0, 1, 2, 2, 3, 4]) + (hard && size >= 8 ? 1 : 0)));
  // Real decisions on the solution path (choices) and traps (decisions where a wrong pick loses)
  // rise with the block position and slowly with the curve: easy 2–3 decisions, peaks 4–5.
  // Every slot also wants a free decision (both ways still solvable). Wrong picks are not made
  // obvious: a trap may still bite several moves later.
  const choices = Math.max(2, Math.min(5, Math.round(2 + t * 1.5 + [0, 0, 1, 1, c ? 2 : 1][p])));
  const traps = Math.max(1, Math.min(choices - (hard ? 0 : 1), Math.round(1 + t * 1.5 + [0, 0, 0.5, 1, 2][p])));
  // Ideal shape: the opening decisions are safe (openFree), traps come in the middle and the end
  // is mostly calm. HARD peaks bite at the end too, and later "normal+" levels keep one late trap.
  // Rarely the start may hold a SOFT trap — one losing swipe out of 3 or 4 — but never a harsh one
  // (1 good of 4, 1 of 2) before 20% progress.
  const opening = choices >= 5 ? 2 : 1;
  const endWant = hard ? (c >= 8 ? 2 : 1) : p === 3 && c >= 6 ? 1 : 0;
  const soft = (hard && c % 3 === 2 && c >= 5) || (p === 3 && c % 7 === 3); // only on boards big enough to still give 4+ decisions
  // HARD peaks are pulled up to Longcat's level (≈3+ traps, ≈80–95 s of our estimate)
  const target = hard ? 82 + t * 14 : base + off;
  return { target, choices, traps: hard ? Math.max(3, traps) : traps, opening, endWant, soft, hard, block: c, W, H, mechs: mechPlan(i, p, c, hard) };
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

// ---------- safe openings ----------
// Ideal level: the first decisions are all safe, the traps come in the middle, the end is calm.
// Random carving puts traps right at the start (the board is emptiest there), so levels are built
// from a small opening room where EVERY way to play wins and every play ends on the same cell,
// moving the same way (e.g. a 3×4 room the dog can spiral either way). The room is walled off
// except one exit next to that cell, then the rest of the level is carved on from there.
function playsOf(grid) {
  const L = E.parse({ grid }), s = E.newState(L), out = [];
  (function rec(dec) {
    if (out.length > 200) return;
    const ds = E.legal(L, s);
    if (!ds.length) { out.push({ won: E.won(L, s), head: s.head, dir: s.moves.length ? s.moves.at(-1).dir : null, dec }); return; }
    for (const d of ds) { E.apply(L, s, d); rec(dec + (ds.length > 1 ? 1 : 0)); E.undo(L, s); }
  })(0);
  return { L, out };
}
function findOpenings() {
  const out = [], seen = new Set();
  for (const [W, H] of [[3, 3], [3, 4], [4, 3], [4, 4], [3, 5], [5, 3], [4, 5], [5, 4], [5, 5], [3, 6], [4, 6], [6, 4], [5, 6]]) for (let t = 0; t < 15000; t++) {
    const g = carve(W, H, -0.3 + rand() * 1.0), k = g.join('/');
    if (seen.has(k)) continue; seen.add(k);
    const { L, out: ps } = playsOf(g);
    if (ps.length < 2 || ps.length > 200 || !ps.every(p => p.won)) continue;
    const { head, dir } = ps[0];
    if (!ps.every(p => p.head === head && p.dir === dir)) continue;
    const ex = head % L.W, ey = (head / L.W) | 0, exits = [];
    for (const d of E.DIR_KEYS) {
      if (d === dir || d === E.OPP[dir]) continue; // the exit leaves sideways from the last slide
      const [dx, dy] = E.DIRS[d], nx = ex + dx, ny = ey + dy;
      if (nx < 0 || ny < 0 || nx >= L.W || ny >= L.H) exits.push(d);
    }
    if (exits.length) out.push({ grid: g, L, end: [ex, ey], arrive: dir, exits, dec: Math.min(...ps.map(p => p.dec)), room: canon(g) });
  }
  return out;
}
// Soft openings (rare slots): one decision in the room has a single losing swipe out of 3–4, every
// other line still wins and ends on the same cell. Few exist, so all 8 rotations/mirrors are used.
function softRoom(g) {
  const L = E.parse({ grid: g }), S = E.makeSolver(L), st = E.newState(L), ends = new Set();
  let soft = 0, bad = false;
  (function walk() {
    if (bad) return;
    const ds = E.legal(L, st);
    if (!ds.length) { ends.add(st.head + ' ' + st.moves.at(-1).dir); return; }
    const res = ds.map(d => { E.apply(L, st, d); const w = S.solvable(st); E.undo(L, st); return [d, w]; });
    const lose = res.filter(r => !r[1]).length;
    if (lose) { if (lose === 1 && res.length >= 3) soft++; else { bad = true; return; } }
    for (const [d, w] of res) if (w) { E.apply(L, st, d); walk(); E.undo(L, st); }
  })();
  if (bad || !soft || ends.size !== 1) return null;
  const [head, dir] = [...ends][0].split(' ');
  return { L, head: +head, dir };
}
function rotations(o) {
  const out = [], rot = { up: 'right', right: 'down', down: 'left', left: 'up' }, flip = { left: 'right', right: 'left', up: 'up', down: 'down' };
  let cur = o;
  for (let m = 0; m < 2; m++) {
    for (let r = 0; r < 4; r++) { // rotate 90° clockwise: (x, y) → (h-1-y, x)
      out.push(cur);
      const g = cur.grid, h = g.length, w = g[0].length, grid = [...Array(w).keys()].map(x => [...Array(h).keys()].map(y => g[h - 1 - y][x]).join(''));
      cur = { ...cur, grid, L: E.parse({ grid }), end: [h - 1 - cur.end[1], cur.end[0]], arrive: rot[cur.arrive], exits: cur.exits.map(d => rot[d]) };
    }
    const g = cur.grid, w = g[0].length, grid = g.map(r => [...r].reverse().join(''));
    cur = { ...cur, grid, L: E.parse({ grid }), end: [w - 1 - cur.end[0], cur.end[1]], arrive: flip[cur.arrive], exits: cur.exits.map(d => flip[d]) };
  }
  return out;
}
function findSoftOpenings() {
  const out = [], seen = new Set();
  for (const [W, H] of [[3, 4], [4, 4], [3, 5], [4, 5], [5, 5], [4, 6], [5, 6]]) for (let t = 0; t < 20000; t++) {
    const g = carve(W, H, -0.3 + rand() * 1.0), k = g.join('/');
    if (seen.has(k)) continue; seen.add(k);
    const r = softRoom(g); if (!r) continue;
    const ex = r.head % r.L.W, ey = (r.head / r.L.W) | 0, exits = [];
    for (const d of E.DIR_KEYS) {
      if (d === r.dir || d === E.OPP[r.dir]) continue;
      const [dx, dy] = E.DIRS[d], nx = ex + dx, ny = ey + dy;
      if (nx < 0 || ny < 0 || nx >= r.L.W || ny >= r.L.H) exits.push(d);
    }
    if (exits.length) out.push(...rotations({ grid: g, L: r.L, end: [ex, ey], arrive: r.dir, exits, room: canon(g) }));
  }
  return out;
}
let OPENINGS = null, SOFT_OPENINGS = null;
function openingCandidates(W, H, runs, want) {
  // aim the carving at this slot: up to `want.choices` decisions, its traps in the middle, an end trap if wanted
  const judge = a => !a.solvable ? -1e9 : idealJudge(a) + 14 * Math.min(a.choices, want.choices) + 8 * Math.min(midTraps(a), want.traps) + (want.endWant ? 25 * Math.min(want.endWant, a.endTraps) : -10 * a.endTraps) + (want.soft ? 60 * Math.min(0.4, a.firstHard) : 0);
  OPENINGS = OPENINGS || findOpenings().flatMap(rotations); // every room in all 8 orientations
  if (want.soft) SOFT_OPENINGS = SOFT_OPENINGS || findSoftOpenings();
  const rooms = want.soft && SOFT_OPENINGS.length ? SOFT_OPENINGS : OPENINGS, out = [];
  for (let r = 0; r < runs; r++) {
    const o = pick(rooms), gw = o.L.W, gh = o.L.H;
    if (gw > W || gh > H) continue;
    const ox = (rand() * (W - gw + 1)) | 0, oy = (rand() * (H - gh + 1)) | 0, d = pick(o.exits), [dx, dy] = E.DIRS[d];
    const xx = ox + o.end[0] + dx, xy = oy + o.end[1] + dy;
    if (xx < 0 || xy < 0 || xx >= W || xy >= H) continue;
    const N = W * H, carved = new Uint8Array(N), locked = new Uint8Array(N); let start = -1;
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const i = (oy + y) * W + ox + x, ch = o.grid[y][x];
      if (ch === '#') locked[i] = 1; else carved[i] = 1;
      if (ch === 'S') start = i;
    }
    for (let i = 0; i < N; i++) if (carved[i]) for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { // wall the room in
      const nx = i % W + ax, ny = ((i / W) | 0) + ay;
      if (nx >= 0 && ny >= 0 && nx < W && ny < H && !carved[ny * W + nx] && !(nx === xx && ny === xy)) locked[ny * W + nx] = 1;
    }
    const init = { carved, locked, head: (oy + o.end[1]) * W + ox + o.end[0], last: o.arrive, count: o.L.floor, start };
    for (const grid of beamCarve(W, H, 30, 0.05, judge, init)) {
      const floor = grid.join('').replace(/#/g, '').length;
      if (floor < W * H * 0.45 || floor > 62 || floor / (grid.length * grid[0].length) < 0.5) continue;
      const a = E.analyse({ grid });
      if (a.solvable && a.moves >= 4) out.push({ grid, a, room: o.room });
    }
  }
  return out;
}
const midTraps = a => a.shape.filter(d => !d.free && d.at >= 0.25 && d.at < 0.8).length;
const idealJudge = a => !a.solvable ? -1e9 : freeJudge(a) + 60 * Math.min(0.4, a.firstRisk) + 8 * midTraps(a);

// ---------- two mazes in one level ----------
// Level A is played out as usual, but where its solution ends a short passage leads on into a
// second maze B: one slide from A's last cell runs down the passage and stops on B's start
// (B's S sits on its edge with a wall straight ahead). Two small mazes give more decisions than
// one big one, and A's calm opening still comes first.
function lineEnd(c) { // where the solver's line finishes, and which way the last slide went
  const L = E.parse({ grid: c.grid }), st = E.newState(L);
  for (const d of c.a.solution) E.apply(L, st, d);
  return { x: st.head % L.W, y: (st.head / L.W) | 0, dir: c.a.solution.at(-1) };
}
function edgeEntry(c) { // directions a slide can come in from outside and stop right on B's S
  const g = c.grid, h = g.length, w = g[0].length, si = g.join('').indexOf('S'), sx = si % w, sy = (si / w) | 0, out = [];
  const solid = (x, y) => x < 0 || y < 0 || x >= w || y >= h || g[y][x] === '#';
  for (const d of E.DIR_KEYS) { const [dx, dy] = E.DIRS[d]; if (solid(sx - dx, sy - dy) && solid(sx + dx, sy + dy)) {
    let x = sx - dx, y = sy - dy, open = true; // the way in from the edge must be all wall inside B's box
    while (x >= 0 && y >= 0 && x < w && y < h) { if (g[y][x] !== '#') { open = false; break; } x -= dx; y -= dy; }
    if (open) out.push(d);
  } }
  return { sx, sy, dirs: out };
}
// same maze up to rotation / mirroring (so a joined level can't reuse a piece seen before)
function canon(grid) {
  let best = null, g = grid.map(r => r.replace('S', '.'));
  for (let m = 0; m < 2; m++) {
    for (let r = 0; r < 4; r++) {
      const k = g.join('/'); if (best === null || k < best) best = k;
      const h = g.length, w = g[0].length;
      g = [...Array(w).keys()].map(x => [...Array(h).keys()].map(y => g[h - 1 - y][x]).join(''));
    }
    g = g.map(r => [...r].reverse().join(''));
  }
  return best;
}
function joinMazes(A, B, maxW, maxH) {
  const end = lineEnd(A), entry = edgeEntry(B), out = [];
  const ga = A.grid, gb = B.grid, ha = ga.length, wa = ga[0].length, hb = gb.length, wb = gb[0].length;
  for (const d of entry.dirs) {
    if (d === end.dir || d === E.OPP[end.dir]) continue; // the passage leaves A sideways from its last slide
    const [dx, dy] = E.DIRS[d];
    for (let len = 1; len <= 3; len++) {
      const P = 12, CW = wa + wb + 2 * P, CH = ha + hb + 2 * P, cell = new Map();
      for (let y = 0; y < ha; y++) for (let x = 0; x < wa; x++) if (ga[y][x] !== '#') cell.set((y + P) * CW + x + P, ga[y][x]);
      const ex = end.x + P, ey = end.y + P, path = [];
      for (let j = 1; j <= len; j++) path.push([ex + dx * j, ey + dy * j]);
      const bx = ex + dx * (len + 1) - entry.sx, by = ey + dy * (len + 1) - entry.sy; // B's box origin
      if (bx < 0 || by < 0 || bx + wb > CW || by + hb > CH) continue;
      let ok = path.every(([x, y]) => !cell.has(y * CW + x));
      const bCells = [];
      for (let y = 0; y < hb && ok; y++) for (let x = 0; x < wb; x++) if (gb[y][x] !== '#') {
        const X = bx + x, Y = by + y;
        for (const [ax, ay] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) if (cell.has((Y + ay) * CW + X + ax)) ok = false; // B stays clear of A
        bCells.push([X, Y, gb[y][x]]);
      }
      if (!ok) continue;
      for (const [x, y] of path) cell.set(y * CW + x, '.');
      for (const [X, Y, ch] of bCells) cell.set(Y * CW + X, ch === 'S' ? '.' : '.');
      const rows = [];
      for (let y = 0; y < CH; y++) { let r = ''; for (let x = 0; x < CW; x++) r += cell.get(y * CW + x) || '#'; rows.push(r); }
      const grid = trim(rows);
      if (grid.length > maxH || grid[0].length > maxW) continue;
      const a = E.analyse({ grid });
      if (a.solvable) out.push({ grid, a, parts: [canon(A.grid), canon(B.grid)], room: A.room, joined: true });
    }
  }
  return out;
}
function entryCandidates(W, H, runs, judge = freeJudge) { // B mazes carved from an S on the edge with a wall straight ahead
  const out = [];
  for (let r = 0; r < runs; r++) {
    const d = pick(E.DIR_KEYS), [dx, dy] = E.DIRS[d], N = W * H, carved = new Uint8Array(N), locked = new Uint8Array(N);
    const x = dx ? (dx > 0 ? 0 : W - 1) : (rand() * W) | 0, y = dy ? (dy > 0 ? 0 : H - 1) : (rand() * H) | 0, start = y * W + x;
    carved[start] = 1; if (x + dx >= 0 && x + dx < W && y + dy >= 0 && y + dy < H) locked[(y + dy) * W + x + dx] = 1;
    for (const grid of beamCarve(W, H, 30, 0.05, judge, { carved, locked, head: start, last: d, count: 1, start })) {
      const a = E.analyse({ grid });
      if (a.solvable && a.choices >= 2) out.push({ grid, a });
    }
  }
  return out;
}
function joinedCandidates(W, H, n, bitingEnd = false) {
  // A: an opening room plus a small maze after it; B: a small maze whose S can be slid onto from
  // outside. A's later free choices that end away from the passage turn into traps — fine, they
  // sit mid-level. B comes last, so its free choices may end anywhere; for a biting end (HARD)
  // B is carved for traps instead.
  const key = W + 'x' + H + (bitingEnd ? 'b' : ''); // the piece pools only depend on the box: build once
  if (!JOIN_POOLS[key]) JOIN_POOLS[key] = joinPools(W, H, bitingEnd);
  const { As, Bs } = JOIN_POOLS[key], out = [];
  for (let t = 0; t < n && As.length && Bs.length; t++) out.push(...joinMazes(pick(As), pick(Bs), W, H));
  return out;
}
const JOIN_POOLS = {};
function joinPools(W, H, bitingEnd) {
  const As = [], Bs = [];
  for (const [w, h] of [[6, 5], [6, 6], [7, 5], [8, 5], [7, 6], [8, 6], [7, 7], [8, 7]]) if (w <= W && h < H) {
    As.push(...openingCandidates(w, h, 25, { choices: 4, traps: 2, endWant: 0 }).filter(c => c.a.openFree >= 1 && c.a.firstRisk >= 0.3 && c.a.choices >= 2));
  }
  for (const [w, h] of [[4, 4], [5, 4], [5, 5], [6, 4], [6, 5], [7, 4], [7, 5], [8, 4], [8, 5]]) if (w <= W && h < H)
    Bs.push(...entryCandidates(w, h, 12, bitingEnd ? trapJudge : freeJudge).filter(c => edgeEntry(c).dirs.length));
  return { As, Bs };
}

// judged beam: favours free decisions (every option still solvable), a safe opening, a calm end,
// then decisions in general
const trapJudge = a => !a.solvable ? -1e9 : a.decisions * 15 + a.lateTraps * 10 + a.choices * 5 - Math.max(0, a.seconds - 95) * 3;
const freeJudge = a => !a.solvable ? -1e9 : (a.choices - a.decisions) * 20 + Math.min(2, a.openFree) * 15 + a.choices * 5 - a.endTraps * 10 - Math.max(0, a.seconds - 95) * 3;
function beamCandidates(W, H, runs, judged = 0) {
  const out = [];
  for (let r = 0; r < runs + judged; r++) for (const grid of beamCarve(W, H, 60, 0.05, r < runs ? null : freeJudge)) {
    const floor = grid.join('').replace(/#/g, '').length;
    if (floor < W * H * 0.45 || floor > 62 || floor / (grid.length * grid[0].length) < 0.5) continue; // > 62 floor: solver blows up
    const a = E.analyse({ grid });
    if (a.solvable && a.moves >= 4) out.push({ grid, a });
  }
  return out;
}

// ---------- mechanics ----------
// Longcat's cell types (see longcat-ldd.html and engine.js). A plain level gets mechanics added by
// small edits that are then re-solved:
//  turn / arrow — put on a cell where the solver's line stops and turns: the line still works (one
//                 swipe now does both legs), so these always fit; the solver re-measures the level
//  glass / box  — put where the line stops (on the wall in front, or on a cell of a later run)
//  pit / portal — a pair on two floor cells of the line
// A variant is kept when it is still solvable and every mechanic is used on the solver's line
// (glass broken, box pushed; walkable mechanics must be crossed anyway).
const MECHS = ['turn', 'glass', 'box', 'portal', 'pit', 'arrow'];
function lineStops(c) { // [{cell, dir, next}] along the solver's line
  const L = E.parse(c), s = E.newState(L), out = [];
  c.a.solution.forEach((d, k) => { const m = E.apply(L, s, d); out.push({ cell: m.cells.length ? m.cells.at(-1) : s.head, dir: d, next: c.a.solution[k + 1], run: m.cells }); });
  return { L, out };
}
function usesAll(lv, a) { // every glass broken and every box moved on the solver's line
  const L = E.parse(lv), s = E.newState(L); let pushed = 0;
  for (const d of a.solution) { const m = E.apply(L, s, d); pushed += m.mut.filter(([, o, n]) => n === E.T.BOX).length; }
  const glassLeft = s.t.some(t => t === E.T.GLASS), boxes = [...L.t].filter(t => t === E.T.BOX).length;
  return !glassLeft && (!boxes || pushed >= boxes);
}
function placeMech(c, kind) { // one random edit of kind into level c → new {grid, portals} or null
  const { L, out } = lineStops(c), W = L.W, H = L.H, g = c.grid.map(r => r.split(''));
  const portals = { ...(c.portals || {}) };
  const free = i => g[(i / W) | 0][i % W] === '.';
  const at = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const put = (i, ch) => { g[(i / W) | 0][i % W] = ch; };
  const di = d => E.DIR_KEYS.indexOf(d), CCWI = [3, 0, 1, 2];
  if (kind === 'turn' || kind === 'arrow') {
    const turns = out.filter(o => o.next && free(o.cell));
    if (!turns.length) return null;
    const o = pick(turns), inSide = di(E.OPP[o.dir]), outSide = di(o.next);
    if (kind === 'arrow') put(o.cell, E.ARROW_OF[outSide]);
    else { const k = [0, 1, 2, 3].find(k => (k === inSide && CCWI[k] === outSide) || (k === outSide && CCWI[k] === inSide)); if (k === undefined) return null; put(o.cell, E.TURN_OF[k]); }
  } else if (kind === 'glass' || kind === 'box') {
    const o = pick(out), [dx, dy] = E.DIRS[o.dir], x = o.cell % W + dx, y = ((o.cell / W) | 0) + dy;
    if (rand() < 0.5 && at(x, y) && g[y][x] === '#') { // on the wall the dog stops against
      if (kind === 'box') { const bx = x + dx, by = y + dy; if (!at(bx, by) || g[by][bx] !== '.') return null; }
      g[y][x] = kind === 'glass' ? 'g' : 'b';
    } else { // on a cell of a later run: the dog now stops in front of it
      const later = out.slice(out.indexOf(o) + 1).flatMap(q => q.run).filter(free);
      if (!later.length) return null;
      put(pick(later), kind === 'glass' ? 'g' : 'b');
    }
  } else { // pit / portal pair
    if (kind === 'pit' && c.grid.some(r => r.includes('o'))) return null;
    const cells = out.flatMap(q => q.run).filter(free);
    if (cells.length < 4) return null;
    const a = pick(cells), b = pick(cells.filter(i => i !== a && Math.abs(i % W - a % W) + Math.abs(((i / W) | 0) - ((a / W) | 0)) > 2));
    if (b === undefined) return null;
    if (kind === 'pit') { put(a, 'o'); put(b, 'o'); }
    else {
      const id = Object.keys(portals).length / 2, face = () => pick(E.DIR_KEYS);
      put(a, '@'); put(b, '@'); portals[(a % W) + ',' + ((a / W) | 0)] = [face(), id]; portals[(b % W) + ',' + ((b / W) | 0)] = [face(), id];
    }
  }
  return { grid: g.map(r => r.join('')), ...(Object.keys(portals).length ? { portals } : {}) };
}
const mechsOf = lv => { const k = new Set(), j = lv.grid.join('');
  if (/[┌┐└┘]/.test(j)) k.add('turn'); if (j.includes('g')) k.add('glass'); if (j.includes('b')) k.add('box');
  if (j.includes('@')) k.add('portal'); if (j.includes('o')) k.add('pit'); if (/[\^>v<]/.test(j)) k.add('arrow'); return [...k]; };
// variants of candidate c carrying the given mechanics (each kind placed 1–2 times)
function withMechs(c, kinds, tries) {
  const out = [];
  for (let t = 0; t < tries; t++) {
    let lv = { grid: c.grid, a: c.a };
    for (const kind of kinds) for (let n = 1 + (rand() < 0.35 ? 1 : 0); n > 0 && lv; n--) {
      const v = placeMech(lv, kind); if (!v) { lv = null; break; }
      let a; try { a = E.analyse(v); } catch (e) { lv = null; break; }
      if (!a.solvable || !usesAll(v, a)) { lv = null; break; }
      lv = { ...v, a };
    }
    if (lv && lv.a !== c.a) out.push({ ...lv, mechs: kinds.slice() });
  }
  return out;
}

// ---------- variety ----------
// Shape features of a level: board size, how much of it is floor, open areas (2×2 floor blocks),
// junctions and dead ends. New levels are pushed away from the last few in this space, and an
// opening room is not reused soon or often, so neighbouring levels don't look alike.
function features(grid) {
  const h = grid.length, w = grid[0].length, at = (x, y) => x >= 0 && y >= 0 && x < w && y < h && grid[y][x] !== '#';
  let floor = 0, open = 0, junc = 0, dead = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (at(x, y)) {
    floor++;
    if ([[0, 0], [-1, 0], [0, -1], [-1, -1]].some(([dx, dy]) => at(x + dx, y + dy) && at(x + dx + 1, y + dy) && at(x + dx, y + dy + 1) && at(x + dx + 1, y + dy + 1))) open++;
    const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => at(x + dx, y + dy)).length;
    if (n >= 3) junc++; if (n === 1) dead++;
  }
  return { w, h, dens: floor / (w * h), open: open / floor, junc: junc / floor, dead: dead / floor };
}
const featDist = (a, b) => Math.abs(a.w - b.w) / 2 + Math.abs(a.h - b.h) / 3 + 4 * (Math.abs(a.dens - b.dens) + Math.abs(a.open - b.open) + Math.abs(a.junc - b.junc) + Math.abs(a.dead - b.dead));
function flipRandom(grid) { // mirror images play the same; vary where the level starts on screen
  let g = grid;
  if (rand() < 0.5) g = g.map(r => [...r].reverse().join(''));
  if (rand() < 0.5) g = [...g].reverse();
  return g;
}

// Mechanic schedule: each mechanic opens its block with a short tutorial level (Longcat's order:
// turn, glass, box, portal, pit, arrow), most of that block then uses it, and afterwards about half
// of the levels mix one or two known mechanics.
const INTRO = { 11: 'turn', 21: 'glass', 31: 'box', 41: 'portal', 51: 'pit', 61: 'arrow' };
const introAt = kind => +Object.keys(INTRO).find(k => INTRO[k] === kind);
const TIPS = {
  turn: 'Kıvrık karo seni çevirir: bir açık kenarından girer, öbüründen çıkarsın.',
  glass: 'Cama burnunu dayayınca kırılır. Kırılan yeri de doldurman gerek.',
  box: 'Kutuya dayanınca bir kare itersin. Arkası boş olmalı.',
  portal: 'Kapıya açık yüzünden girersin, eşinden çıkarsın.',
  pit: 'Bir çukura giren öbüründen çıkar, aynı yöne devam eder.',
  arrow: 'Ok karosu seni okun gösterdiği yöne çevirir.',
};
const featuredAt = c => { // the mechanic a block shows off: introduced in this block or the one before
  const k = Object.keys(INTRO).map(Number).filter(n => Math.floor((n - 1) / 5) === c || Math.floor((n - 1) / 5) === c - 1).pop();
  return k ? INTRO[k] : null;
};
function mechPlan(i, p, c, hard) {
  const known = MECHS.filter(k => introAt(k) < i);
  if (!known.length) return [];
  const feat = featuredAt(c), introBlock = feat && Math.floor((introAt(feat) - 1) / 5) === c;
  if (feat && introBlock) return rand() < 0.8 ? [feat] : [];
  if (feat) return rand() < 0.55 ? [feat] : rand() < 0.4 ? [pick(known)] : [];
  if (rand() < (hard ? 0.6 : 0.5)) { const a = pick(known), b = pick(known); return rand() < 0.3 && a !== b ? [a, b] : [a]; }
  return [];
}
function introLevel(kind) { // a short, readable level where the mechanic shows up in the first swipes
  let best = null, bestF = Infinity;
  for (const [w, h] of [[4, 4], [5, 4], [4, 5], [5, 5], [5, 6]]) for (const c of candidates(w, h, 300).filter(c => c.a.moves >= 3 && c.a.moves <= 8).slice(0, 40)) {
    for (const v of withMechs(c, [kind], 6)) {
      const L = E.parse(v), st = E.newState(L); let firstUse = 99;
      v.a.solution.forEach((d, k) => { const m = E.apply(L, st, d); if (firstUse === 99 && (m.mut.length || m.segs.length > 1 || m.cells.some(q => L.t[q] !== E.T.FLOOR))) firstUse = k; });
      const f = firstUse * 6 + v.a.decisions * 8 + Math.abs(v.a.seconds - 24) + (v.a.choices < 1 ? 10 : 0);
      if (f < bestF) { bestF = f; best = v; }
    }
  }
  return best;
}

const levels = [], used = new Set(), roomUses = new Map();
TUTORIALS.forEach(t => levels.push({ ...t, a: E.analyse(t) }));
for (let i = 4; i <= COUNT; i++) {
  if (INTRO[i]) { // tutorial level for a new mechanic
    const kind = INTRO[i], v = introLevel(kind);
    levels.push({ name: '', grid: v.grid, portals: v.portals, a: v.a, intro: kind, tip: TIPS[kind], mechs: [kind] });
    process.stderr.write(i % 10 ? '.' : String(i)); continue;
  }
  const s = slot(i);
  const fresh = [...candidates(s.W, s.H, 2500), ...(s.choices >= 4 && s.W >= 7 ? joinedCandidates(Math.max(s.W, 8), Math.max(s.H, 12), 4000, s.endWant > 0) : []), ...openingCandidates(s.W, s.H, s.choices >= 6 ? 400 : s.choices >= 5 ? 200 : 100, s), ...beamCandidates(s.W, s.H, s.choices >= 7 ? 1500 : s.choices >= 5 ? 300 : 40, s.choices >= 5 ? 60 : 15)].filter(c => !(c.parts || [canon(c.grid)]).some(k => used.has(k)));
  // safe opening: on every winning line the first decision is free (no wrong first pick)
  // never a harsh trap in the first ~fifth; a soft one (1 bad swipe of 3–4) only in `soft` slots
  let pool = fresh.filter(c => c.a.firstHard >= 0.22 && (c.a.openFree >= 1 || s.soft)); if (!pool.length) pool = fresh;
  const calm = pool.filter(c => s.soft ? c.a.earlySoft >= 1 : c.a.firstRisk >= 0.22); if (calm.length >= 10) pool = calm;
  const timely = c => c.a.seconds >= 31 && c.a.seconds <= 99; // 30–100 s, with a little margin
  const inTime = pool.filter(timely), wider = fresh.filter(c => timely(c) && c.a.firstHard >= 0.22 && c.a.openFree >= 1);
  if (inTime.length) pool = inTime; else if (wider.length) pool = wider;
  const early = c => c.a.shape.filter(d => !d.free && d.at < 0.25).length; // traps in the first quarter of the floor
  // hard levels should also have late-biting traps
  const out = c => c.a.seconds < 30 ? 30 - c.a.seconds : c.a.seconds > 100 ? c.a.seconds - 100 : 0;
  const fit = c => Math.abs(c.a.seconds - s.target) + 20 * out(c) + 20 * Math.abs(c.a.choices - s.choices) + 8 * Math.abs(c.a.decisions - s.traps) + 15 * Math.max(0, s.opening - c.a.openFree) + (s.hard ? 25 : 12) * Math.abs(c.a.endTraps - s.endWant) + 150 * Math.max(0, 0.25 - (s.soft ? c.a.firstHard : c.a.firstRisk)) + (s.soft ? 0 : 10 * early(c)) + (s.hard ? 200 * Math.max(0, c.a.sols / c.a.paths - 0.08) : 0) + (s.hard && !c.a.lateTraps ? 8 : 0) + (s.hard && c.a.choices < 4 ? 40 : 0) + (s.hard ? 30 * Math.max(0, 3 - c.a.decisions) + 2 * Math.max(0, 76 - c.a.seconds) : 0);
  // variety: no opening room from the last 8 levels, none used more than 3 times; keep the shape
  // away from the last 6 levels
  const recent = levels.slice(-8).map(l => l.room).filter(Boolean), last = levels.slice(-6).map(l => l.feat || features(l.grid));
  const fresher = pool.filter(c => !c.room || (!recent.includes(c.room) && (roomUses.get(c.room) || 0) < 3));
  if (fresher.length >= 5) pool = fresher;
  for (const c of pool) c.feat = c.feat || features(c.grid);
  const novelty = c => last.reduce((sum, f) => sum + Math.max(0, 1.2 - featDist(c.feat, f)), 0) * 5 + (c.joined && levels.slice(-2).some(l => l.joined) ? 6 : 0);
  pool.sort((p, q) => fit(p) + novelty(p) - fit(q) - novelty(q));
  let best = pool[0];
  if (s.mechs.length) { // mechanic slot: dress the best few plain fits with this slot's mechanics
    const dressed = pool.slice(0, 14).flatMap(c => withMechs(c, s.mechs, 14).map(v => ({ ...c, ...v, feat: features(v.grid) })))
      .filter(c => c.a.firstHard >= 0.22 && (c.a.openFree >= 1 || s.soft) && timely(c)); // same opening and time rules as plain levels
    if (dressed.length) { dressed.sort((p, q) => fit(p) + novelty(p) - fit(q) - novelty(q)); best = dressed[0]; }
  }
  if (best.room) roomUses.set(best.room, (roomUses.get(best.room) || 0) + 1);
  for (const k of best.parts || [canon(best.grid)]) used.add(k); // pieces of a joined level count too
  const grid = best.mechs ? best.grid : flipRandom(best.grid); // re-measured: the solver's line (and so a few stats) can differ on a mirror image
  levels.push({ name: '', grid, portals: best.portals, mechs: best.mechs || [], room: best.room, feat: best.feat, joined: best.joined, hard: s.hard || undefined, a: grid === best.grid ? best.a : E.analyse({ grid }), target: s.target, want: s.choices, wantT: s.traps, opening: s.opening, endWant: s.endWant, soft: s.soft });
  process.stderr.write(i % 10 ? '.' : String(i));
}

// Level order: the generated levels are dealt out by estimated solve time. The two easiest plain
// ones open the game (block 1 = levels 4–5) and the mechanic tutorials keep their places; the rest
// are cut into five tiers by solve time, and tier k fills position k of every block. So each block
// climbs easy → HARD, every position rises slowly over the game, and neighbours come from
// different tiers (different sizes and shapes). Inside a tier a level only goes where all of its
// mechanics are already introduced, preferring the block's featured mechanic. The HARD tier
// prefers decision- and trap-heavy levels (Longcat-hard peaks).
{
  const fixed = new Map(levels.map((l, i) => [i, l]).filter(([, l]) => l.intro));
  const play = levels.slice(3).filter(l => !l.intro).sort((p, q) => p.a.seconds - q.a.seconds || p.a.choices - q.a.choices);
  const plainFirst = play.filter(l => !l.mechs.length).slice(0, 2), rest = play.filter(l => !plainFirst.includes(l));
  const slotsOf = k => { const o = []; for (let i = 5; i < COUNT; i++) if (i % 5 === k && !fixed.has(i)) o.push(i); return o; }; // 0-based level index
  const tierSlots = [0, 1, 2, 3, 4].map(slotsOf);
  const peakKey = l => l.a.seconds + (l.a.choices >= 4 ? 15 : 0) + (l.a.decisions >= 3 ? 12 : 0) + (l.a.decisions >= 3 && l.a.seconds >= 75 ? 40 : 0);
  const peaks = [...rest].sort((p, q) => peakKey(q) - peakKey(p)).slice(0, tierSlots[4].length);
  const others = rest.filter(l => !peaks.includes(l));
  const tiers = [[], [], [], [], peaks]; let at = 0;
  for (let k = 0; k < 4; k++) { tiers[k] = others.slice(at, at + tierSlots[k].length); at += tierSlots[k].length; }
  const out = [...levels.slice(0, 3), ...plainFirst];
  for (const [i, l] of fixed) out[i] = l;
  const allowed = (l, i) => l.mechs.every(k => introAt(k) <= i); // index i is 0-based, intro levels are 1-based
  for (let k = 0; k < 5; k++) {
    const left = tiers[k].slice().sort((p, q) => p.a.seconds - q.a.seconds);
    for (const i of tierSlots[k]) {
      const feat = featuredAt(Math.floor(i / 5)), ok = left.filter(l => allowed(l, i));
      // the featured mechanic wins only among the three easiest allowed, so the tier keeps rising
      const pickL = ok.slice(0, 3).find(l => feat && l.mechs.includes(feat)) || ok[0] || left[0];
      left.splice(left.indexOf(pickL), 1); out[i] = pickL;
    }
  }
  out.forEach((l, i) => { l.hard = i >= 5 && i % 5 === 4 ? true : undefined; levels[i] = l; });
}

const NAMES = ['Sabah esnemesi', 'Koridor', 'Yumak', 'Minder', 'Pencere önü', 'Mama kabı', 'Çatı katı', 'Sepet', 'Halı', 'Kutu',
  'Merdiven', 'Kilim', 'Bahçe', 'Kitaplık', 'Güneşlik', 'Dolap üstü', 'Çamaşır', 'Balkon', 'Mutfak', 'Kiler',
  'Tavan arası', 'Bodrum', 'Sokak', 'Çit', 'Ay ışığı', 'Uzun gece', 'Yıldızlar',
  'Kemik', 'Tasma', 'Top', 'Kulübe', 'Patik', 'Kuyruk sallama', 'Öğle uykusu', 'Yağmur', 'Su birikintisi', 'Çamur',
  'Park', 'Bank', 'Fıskiye', 'Çimen', 'Papatya', 'Kelebek', 'Sincap', 'Güvercin', 'Komşu kedi', 'Postacı',
  'Kapı önü', 'Paspas', 'Ayakkabılık', 'Terlik', 'Çorap', 'Battaniye', 'Yastık', 'Kanepe', 'Koltuk altı', 'Şömine',
  'Halı saçağı', 'Banyo', 'Köpük', 'Havlu', 'Fön', 'Tırnak günü', 'Veteriner', 'Aşı günü', 'Ödül maması', 'Bisküvi',
  'Sosis', 'Peynir', 'Piknik', 'Sepet dolusu', 'Orman yolu', 'Dere kenarı', 'Köprü', 'Değirmen', 'Tarla', 'Saman',
  'Ahır', 'Kümes', 'Tavuklar', 'Bahar', 'Yaz tatili', 'Kumsal', 'Dalga', 'Kum kalesi', 'Sonbahar', 'Yapraklar',
  'Kestane', 'Kar', 'Kardan adam', 'Kızak', 'Sıcak süt', 'Yılbaşı', 'Hediye paketi', 'Kurdele', 'Havai fişek', 'Eve dönüş'];
levels.forEach((l, i) => { if (!l.name) l.name = NAMES[i - 3] || 'Bölüm ' + (i + 1); });

// ---------- report + write ----------
console.log('#   size   floor moves trap/want late ch/want free safe risk end soft   sec  target');
levels.forEach((l, i) => {
  const a = l.a;
  console.log(`${String(i + 1).padStart(3)} ${(a.W + '×' + a.H).padEnd(6)} ${String(a.floor).padStart(5)} ${String(a.moves).padStart(5)} ${String(a.decisions).padStart(3)}/${l.wantT ?? '-'}    ${String(a.lateTraps).padStart(4)} ${String(a.choices).padStart(2)}/${l.want || '-'}  ${String(a.choices - a.decisions).padStart(3)}  ${String(a.openFree).padStart(3)}/${l.opening ?? '-'} ${a.firstRisk.toFixed(2).padStart(5)} ${String(a.endTraps).padStart(2)}/${l.endWant ?? '-'} ${a.earlySoft}${l.soft ? '*' : ' '} ${a.seconds.toFixed(0).padStart(5)} ${l.target ? l.target.toFixed(0).padStart(6) : '     -'}${l.hard ? '  HARD' : ''}${l.intro ? '  INTRO ' + l.intro : ''}${l.mechs && l.mechs.length && !l.intro ? '  ' + l.mechs.join('+') : ''}`);
});
if (args.includes('--dry')) process.exit(0);
const body = levels.map(l => {
  const meta = { name: l.name, ...(l.tip ? { tip: l.tip } : {}), ...(l.hard ? { hard: true } : {}), ...(l.intro ? { intro: l.intro } : {}),
    par: l.a.moves, difficulty: l.a.difficulty, secs: Math.round(l.a.seconds), choices: l.a.choices, traps: l.a.decisions };
  const head = JSON.stringify(meta).slice(1, -1).replace(/"(\w+)":/g, '$1:');
  const portals = l.portals && Object.keys(l.portals).length ? `\n    portals: ${JSON.stringify(l.portals)},` : '';
  return `  { ${head},${portals}\n    grid: [\n${l.grid.map(r => `      '${r}',`).join('\n')}\n    ] },`;
}).join('\n');
fs.writeFileSync(path.join(__dirname, '..', 'levels.js'),
  `// Generated by tools/gen.js (seed ${opt('--seed') || 7}). '#' wall, '.' floor, 'S' start; mechanics: see engine.js.\n` +
  `// par = swipes on the solver's solution; difficulty = see engine.js analyse(); secs = estimated solve time.\n` +
  `window.LEVELS = [\n${body}\n];\n`);
console.log('wrote levels.js');
