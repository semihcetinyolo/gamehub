#!/usr/bin/env node
// Level pack generator: node tools/gen.js [--seed N] [--dry]
// Carves levels by playing the slide rule on an empty board (so every level has a solution),
// measures them with the solver, then fills a difficulty curve:
//   tutorials 1–3, then cycles of five: normal, normal+, HARD, easy, easy
//   (a hard level is always followed by two easier ones — the Long Cat curve spikes and never lets go).
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

const COUNT = 30;
function slot(i) { // i = 1-based level number
  if (i <= 3) return null;
  const k = i - 4, cyc = k % 5, t = k / (COUNT - 4), hardNo = (i - 6) / 5, round = Math.floor(k / 5);
  const base = 47 + t * 20;                       // normal level ≈ 47 s → 67 s
  const off = [0, 12, 30, -12, -8][cyc];          // normal, normal+, HARD (≤ 100 s), easy, easy (≥ 30 s)
  const size = 6 + Math.floor(t * 2.5) + (cyc === 2 ? 2 : cyc >= 3 ? -1 : 0);
  const W = Math.max(4, Math.min(8, size)), H = Math.max(5, Math.min(11, size + 2 + (cyc === 2 && size >= 8 ? 1 : 0)));
  const hard = cyc === 2;
  // Real decisions on the solution path (choices) vary per slot (easy 2–3, normal 3–4, normal+ 4–5,
  // HARD 5 — with a calm opening the carving tops out around 5); traps = decisions where a wrong
  // pick loses the level. Traps are what make a level hard — many solutions mean little if one
  // wrong swipe kills them all — so every slot also wants 1–2 free decisions (both ways still
  // solvable; in practice a loop the dog can go round either way). Wrong picks are not made
  // obvious: a trap may still bite several moves later.
  const at = a => a[Math.min(round, a.length - 1)];
  const choices = [at([3, 3, 4, 4, 4, 4]), at([4, 4, 4, 5, 5]), at([5, 5, 5, 5, 5]), at([2, 3, 3, 3, 3]), at([3, 2, 3, 3, 3])][cyc];
  const traps = Math.min(choices - 1, [at([2, 2, 3, 3, 3, 3]), at([3, 3, 3, 4, 4]), at([4, 4, 4, 4, 4]), at([1, 2, 2, 2, 2]), at([2, 1, 2, 2, 2])][cyc]);
  // Ideal shape: the opening decisions are all safe (openFree), traps come in the middle, and near
  // the end a wrong turn is rare — only the later HARD levels keep one late trap.
  const opening = choices >= 5 ? 2 : 1, endWant = hard && hardNo >= 2 ? 1 : 0;
  return { target: base + off, choices, traps, opening, endWant, hard, breather: cyc >= 3, W, H };
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
    const ds = E.legal(L, s.filled, s.head);
    if (!ds.length) { out.push({ won: E.won(L, s), head: s.head, dir: s.moves.length ? s.moves.at(-1).dir : null, dec }); return; }
    for (const d of ds) { E.apply(L, s, d); rec(dec + (ds.length > 1 ? 1 : 0)); E.undo(L, s); }
  })(0);
  return { L, out };
}
function findOpenings() {
  const out = [], seen = new Set();
  for (const [W, H] of [[3, 3], [3, 4], [4, 3], [4, 4], [3, 5], [5, 3], [4, 5], [5, 4], [5, 5]]) for (let t = 0; t < 6000; t++) {
    const g = carve(W, H, -0.2 + rand() * 0.8), k = g.join('/');
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
    if (exits.length) out.push({ grid: g, L, end: [ex, ey], arrive: dir, exits, dec: Math.min(...ps.map(p => p.dec)) });
  }
  return out;
}
let OPENINGS = null;
function openingCandidates(W, H, runs, want) {
  // aim the carving at this slot: up to `want.choices` decisions, its traps in the middle, an end trap if wanted
  const judge = a => !a.solvable ? -1e9 : idealJudge(a) + 14 * Math.min(a.choices, want.choices) + 8 * Math.min(midTraps(a), want.traps) + (want.endWant ? 25 * Math.min(1, a.endTraps) : -10 * a.endTraps);
  OPENINGS = OPENINGS || findOpenings();
  const out = [];
  for (let r = 0; r < runs; r++) {
    const o = pick(OPENINGS), gw = o.L.W, gh = o.L.H;
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
      if (a.solvable && a.moves >= 4) out.push({ grid, a });
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
      if (a.solvable) out.push({ grid, a, parts: [canon(A.grid), canon(B.grid)] });
    }
  }
  return out;
}
function entryCandidates(W, H, runs) { // B mazes carved from an S on the edge with a wall straight ahead
  const out = [];
  for (let r = 0; r < runs; r++) {
    const d = pick(E.DIR_KEYS), [dx, dy] = E.DIRS[d], N = W * H, carved = new Uint8Array(N), locked = new Uint8Array(N);
    const x = dx ? (dx > 0 ? 0 : W - 1) : (rand() * W) | 0, y = dy ? (dy > 0 ? 0 : H - 1) : (rand() * H) | 0, start = y * W + x;
    carved[start] = 1; if (x + dx >= 0 && x + dx < W && y + dy >= 0 && y + dy < H) locked[(y + dy) * W + x + dx] = 1;
    for (const grid of beamCarve(W, H, 30, 0.05, freeJudge, { carved, locked, head: start, last: d, count: 1, start })) {
      const a = E.analyse({ grid });
      if (a.solvable && a.choices >= 2) out.push({ grid, a });
    }
  }
  return out;
}
function joinedCandidates(W, H, n) {
  // A: an opening room plus a small maze after it; B: a small maze whose S can be slid onto from
  // outside. A's later free choices that end away from the passage turn into traps — fine, they
  // sit mid-level. B comes last, so its free choices may end anywhere.
  const As = [], Bs = [];
  for (const [w, h] of [[6, 5], [6, 6], [7, 5], [8, 5], [7, 6], [8, 6], [7, 7], [8, 7]]) if (w <= W && h < H) {
    As.push(...openingCandidates(w, h, 25, { choices: 4, traps: 2, endWant: 0 }).filter(c => c.a.openFree >= 1 && c.a.firstRisk >= 0.3 && c.a.choices >= 2));
  }
  for (const [w, h] of [[4, 4], [5, 4], [5, 5], [6, 4], [6, 5], [7, 4], [7, 5], [8, 4], [8, 5]]) if (w <= W && h < H)
    Bs.push(...entryCandidates(w, h, 12).filter(c => edgeEntry(c).dirs.length));
  const out = [];
  for (let t = 0; t < n && As.length && Bs.length; t++) out.push(...joinMazes(pick(As), pick(Bs), W, H));
  return out;
}

// judged beam: favours free decisions (every option still solvable), a safe opening, a calm end,
// then decisions in general
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

const levels = [], used = new Set();
TUTORIALS.forEach(t => levels.push({ ...t, a: E.analyse(t) }));
for (let i = 4; i <= COUNT; i++) {
  const s = slot(i);
  const fresh = [...candidates(s.W, s.H, 2500), ...(s.choices >= 4 && s.W >= 7 ? joinedCandidates(Math.max(s.W, 8), Math.max(s.H, 12), 4000) : []), ...openingCandidates(s.W, s.H, s.choices >= 6 ? 400 : s.choices >= 5 ? 200 : 100, s), ...beamCandidates(s.W, s.H, s.choices >= 7 ? 1500 : s.choices >= 5 ? 300 : 40, s.choices >= 5 ? 60 : 15)].filter(c => !(c.parts || [canon(c.grid)]).some(k => used.has(k)));
  // safe opening: on every winning line the first decision is free (no wrong first pick)
  let pool = fresh.filter(c => c.a.openFree >= 1); if (!pool.length) pool = fresh;
  const calm = pool.filter(c => c.a.firstRisk >= 0.22); if (calm.length >= 10) pool = calm; // no trap anywhere in the first ~fifth
  const early = c => c.a.shape.filter(d => !d.free && d.at < 0.25).length; // traps in the first quarter of the floor
  // hard levels should also have late-biting traps
  const out = c => c.a.seconds < 30 ? 30 - c.a.seconds : c.a.seconds > 100 ? c.a.seconds - 100 : 0;
  const fit = c => Math.abs(c.a.seconds - s.target) + 20 * out(c) + 20 * Math.abs(c.a.choices - s.choices) + 8 * Math.abs(c.a.decisions - s.traps) + 15 * Math.max(0, s.opening - c.a.openFree) + 12 * Math.abs(c.a.endTraps - s.endWant) + 150 * Math.max(0, 0.25 - c.a.firstRisk) + 10 * early(c) + (s.hard && !c.a.lateTraps ? 8 : 0) + (s.hard && c.a.choices < 4 ? 40 : 0);
  pool.sort((p, q) => fit(p) - fit(q));
  const best = pool[0];
  for (const k of best.parts || [canon(best.grid)]) used.add(k); // pieces of a joined level count too
  levels.push({ name: '', grid: best.grid, hard: s.hard || undefined, a: best.a, target: s.target, want: s.choices, wantT: s.traps, opening: s.opening, endWant: s.endWant });
  process.stderr.write('.');
}

const NAMES = ['Sabah esnemesi', 'Koridor', 'Yumak', 'Minder', 'Pencere önü', 'Mama kabı', 'Çatı katı', 'Sepet', 'Halı', 'Kutu',
  'Merdiven', 'Kilim', 'Bahçe', 'Kitaplık', 'Güneşlik', 'Dolap üstü', 'Çamaşır', 'Balkon', 'Mutfak', 'Kiler',
  'Tavan arası', 'Bodrum', 'Sokak', 'Çit', 'Ay ışığı', 'Uzun gece', 'Yıldızlar'];
levels.forEach((l, i) => { if (!l.name) l.name = NAMES[i - 3] || 'Bölüm ' + (i + 1); });

// ---------- report + write ----------
console.log('#   size   floor moves trap/want late ch/want free safe risk end   sec  target');
levels.forEach((l, i) => {
  const a = l.a;
  console.log(`${String(i + 1).padStart(2)} ${(a.W + '×' + a.H).padEnd(6)} ${String(a.floor).padStart(5)} ${String(a.moves).padStart(5)} ${String(a.decisions).padStart(3)}/${l.wantT ?? '-'}    ${String(a.lateTraps).padStart(4)} ${String(a.choices).padStart(2)}/${l.want || '-'}  ${String(a.choices - a.decisions).padStart(3)}  ${String(a.openFree).padStart(3)}/${l.opening ?? '-'} ${a.firstRisk.toFixed(2).padStart(5)} ${String(a.endTraps).padStart(2)}/${l.endWant ?? '-'} ${a.seconds.toFixed(0).padStart(5)} ${l.target ? l.target.toFixed(0).padStart(6) : '     -'}${l.hard ? '  HARD' : ''}`);
});
if (args.includes('--dry')) process.exit(0);
const body = levels.map(l => {
  const meta = { name: l.name, ...(l.tip ? { tip: l.tip } : {}), ...(l.hard ? { hard: true } : {}),
    par: l.a.moves, difficulty: l.a.difficulty, secs: Math.round(l.a.seconds), choices: l.a.choices, traps: l.a.decisions };
  const head = JSON.stringify(meta).slice(1, -1).replace(/"(\w+)":/g, '$1:');
  return `  { ${head},\n    grid: [\n${l.grid.map(r => `      '${r}',`).join('\n')}\n    ] },`;
}).join('\n');
fs.writeFileSync(path.join(__dirname, '..', 'levels.js'),
  `// Generated by tools/gen.js (seed ${opt('--seed') || 7}). '#' wall, '.' floor, 'S' start.\n` +
  `// par = swipes on the solver's solution; difficulty = see engine.js analyse(); secs = estimated solve time.\n` +
  `window.LEVELS = [\n${body}\n];\n`);
console.log('wrote levels.js');
