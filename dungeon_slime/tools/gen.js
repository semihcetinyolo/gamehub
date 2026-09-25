#!/usr/bin/env node
// Dungeon-style level generator (like Dungeon Slime): big rooms of many tiles with 1-tile walls,
// joined by corridors, small wall pieces inside rooms, one continuous map scrolled by the camera.
// GDD §9: "prosedürel taslak + el ile cilalama". Jöli is continuous (see engine.js); the ASCII
// grid only describes the walls.
//
//   node tools/gen.js --rooms 3 --need spread:6,thinnest --items "m:2" --n 2 --seed 7
//
// Rooms are stacked bottom -> top; each is joined to the next by a vertical corridor whose width
// is one of --doors (4: the square fits, 2: needs 2×6, 1: needs 1×8). The last corridor ends in the
// exit (E). Side pockets (--pockets p) hang off rooms as detours. Rooms are added one at a time and
// each must keep the whole map solvable and add >= --roompar swipes. After solving, the floor tiles
// in front of wall faces the solution never touches get a 1-tile spike strip with probability
// --spikep (whole runs), so off-route walls are deadly.
// --need name[:min]: spread thin flat thinnest flattest square wafer key
const E = require('../engine.js');

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) =>
  v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1]]] : a, []));
const W = +(args.w || 32), ROOMS = +(args.rooms || 3), ROOMPAR = +(args.roompar || 3);
const [RW0, RW1] = (args.rw || '12-28').split('-').map(Number);
const [RH0, RH1] = (args.rh || '9-15').split('-').map(Number);
const DOORS = (args.doors || '4,2,1').split(',').map(Number);
const BLOCKS = (args.blocks || '1-4').split('-').map(Number);
const POCKETS = args.pockets !== undefined ? +args.pockets : .4;
const NEED = (args.need || '').split(',').filter(Boolean).map(t => { const [k, n] = t.split(':'); return [k, +(n || 1)]; });
const ITEMS = (args.items || '').split(',').filter(Boolean).map(t => { const [c, n] = t.split(':'); return [c, +n]; });
const N = +(args.n || 2), TRIES = +(args.tries || 30);
const MINPAR = +(args.minpar || 4), MAXPAR = +(args.maxpar || 40);
const SPIKEP = args.spikep !== undefined ? +args.spikep : .6;
let seed = +(args.seed || Date.now() % 100000);
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = a => a[Math.floor(rnd() * a.length)];
const inR = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

// Rasterise floor rects (minus wall blocks) into an ASCII grid with 1-tile walls around.
// y grows downward; rooms are built upward with negative y and shifted into place here.
function raster(m) {
  const all = [...m.floor, ...m.exit];
  const x0 = Math.min(...all.map(r => r.x)) - 1, y0 = Math.min(...all.map(r => r.y)) - (m.exit.length ? 0 : 1);
  const x1 = Math.max(...all.map(r => r.x + r.w)) + 1, y1 = Math.max(...all.map(r => r.y + r.h)) + 1;
  const rows = [];
  for (let y = y0; y < y1; y++) {
    let row = '';
    for (let x = x0; x < x1; x++) {
      let c = '#';
      if (m.floor.some(r => inR(r, x, y)) && !m.blocks.some(r => inR(r, x, y))) c = '.';
      if (m.exit.some(r => inR(r, x, y))) c = 'E';
      const it = m.items.find(t => inR({ x: t.x, y: t.y, w: 2, h: 2 }, x, y)); if (it && c === '.') c = it.c; // items are 2×2
      if (m.start && x === m.start[0] && y === m.start[1]) c = 'S';
      row += c;
    }
    rows.push(row);
  }
  return rows;
}
function randomRoom(below) { // below: the corridor the room must sit on top of (or null)
  const w = ri(RW0, Math.min(RW1, W - 2)), h = ri(RH0, RH1);
  let x;
  if (below) x = Math.max(1, Math.min(W - 1 - w, ri(below.x + below.w - w, below.x)));
  else x = ri(1, W - 1 - w);
  if (below && (x > below.x || x + w < below.x + below.w)) return null;
  const y = below ? below.y - h : 0;
  return { x, y, w, h };
}
function roomBlocks(room, keepClear) {
  const out = [];
  for (let i = ri(BLOCKS[0], BLOCKS[1]); i > 0; i--) {
    const bw = rnd() < .5 ? ri(1, 2) : ri(2, 6), bh = rnd() < .5 ? ri(1, 2) : ri(2, 5);
    const b = { x: ri(room.x + 1, room.x + room.w - 1 - bw), y: ri(room.y + 1, room.y + room.h - 1 - bh), w: bw, h: bh };
    if (bw > room.w - 6 || bh > room.h - 4) continue;
    if (keepClear.some(k => b.x < k.x + k.w + 1 && b.x + b.w > k.x - 1 && b.y < k.y + k.h + 1 && b.y + b.h > k.y - 1)) continue;
    out.push(b);
  }
  return out;
}

function usage(L, path) {
  let s = E.initialState(L);
  const u = { spread: 0, thin: 0, flat: 0, thinnest: 0, flattest: 0, square: 0, wafer: 0, key: 0 };
  for (const d of path) {
    const r = E.move(L, s, d);
    if (r.state.w !== s.w) { u.spread++; u[E.shapeOf(r.state.w, r.state.h)]++; }
    if (r.path.some(p => p.ev === 'break')) u.wafer++;
    if (r.state.key && !s.key) u.key++;
    s = r.state;
  }
  return u;
}
// Spikes: 1-tile strips on the floor in front of wall faces the solution never touches.
const SPK = require('./spikes.js');
const touchedCells = (L, path) => SPK.touchedCells(L, path);
const addSpikes = (grid, touched) => SPK.addFloorSpikes(grid, touched, SPIKEP, rnd);

function buildLevel() {
  const m = { floor: [], blocks: [], exit: [], items: [], start: null };
  const bag = []; for (const [c, n] of ITEMS) for (let i = 0; i < n; i++) bag.push(c);
  const per = Array.from({ length: ROOMS }, () => []);
  bag.forEach(c => per[ri(0, ROOMS - 1)].push(c));
  let below = null, par = 0;
  for (let k = 0; k < ROOMS; k++) {
    let best = null;
    for (let t = 0; t < 50; t++) {
      const room = randomRoom(below);
      if (!room) continue;
      const cw = pick(DOORS);
      if (room.w < cw + 2) continue;
      const cx = ri(room.x, room.x + room.w - cw), cl = ri(2, 5);
      const corr = { x: cx, y: room.y - cl, w: cw, h: cl };
      const extra = [];
      if (rnd() < POCKETS) { // side pocket: a detour room hanging off the left or right wall
        const pw = ri(5, 10), ph = ri(5, Math.min(9, room.h)), left = rnd() < .5, pc = ri(1, 3), pcw = pick([1, 2, 4].filter(v => v <= ph));
        const py = ri(room.y, room.y + room.h - ph), px = left ? room.x - pc - pw : room.x + room.w + pc;
        if (px >= 1 && px + pw <= W - 1) {
          const cy = ri(py, py + ph - pcw);
          extra.push({ x: px, y: py, w: pw, h: ph }, { x: left ? px + pw : room.x + room.w, y: cy, w: pc, h: pcw });
        }
      }
      const clear = [below, corr, ...extra.slice(1)].filter(Boolean);
      const cand = { ...m, floor: [...m.floor, room, ...extra, corr], blocks: [...m.blocks], items: [...m.items], exit: [{ x: corr.x, y: corr.y - 1, w: cw, h: 1 }] };
      if (k === 0) {
        const sx = ri(room.x, room.x + room.w - 4), sy = ri(room.y + Math.floor(room.h / 2), room.y + room.h - 4);
        cand.start = [sx, sy]; clear.push({ x: sx, y: sy, w: 4, h: 4 });
      }
      cand.blocks.push(...roomBlocks(room, clear));
      for (const c of per[k]) for (let tries = 0; tries < 20; tries++) { // a 2×2 item on clear floor
        const it = { c, x: ri(room.x, room.x + room.w - 2), y: ri(room.y, room.y + room.h - 2) }, box = { x: it.x, y: it.y, w: 2, h: 2 };
        const hits = r => box.x < r.x + r.w && box.x + box.w > r.x && box.y < r.y + r.h && box.y + box.h > r.y;
        if (cand.blocks.some(hits) || cand.items.some(o => hits({ x: o.x, y: o.y, w: 2, h: 2 })) || (cand.start && hits({ x: cand.start[0], y: cand.start[1], w: 4, h: 4 }))) continue;
        cand.items.push(it); break;
      }
      const grid = raster(cand);
      let L; try { L = E.parse({ name: 'gen', grid }); } catch (e) { continue; }
      if (E.lint(L).length) continue;
      const s = E.solve(L, E.initialState(L), false, 50000);
      if (!s) continue;
      const gain = s.path.length - par;
      if (gain < ROOMPAR) continue;
      const u = usage(L, s.path);
      const sc = gain + u.wafer + u.key * 2 + u.thinnest + u.flattest - (gain > 9 ? gain - 9 : 0);
      if (!best || sc > best.sc) best = { cand, corr, s, sc };
      if (t > 25 && best) break;
    }
    if (!best) return null;
    Object.assign(m, best.cand); m.exit = [];
    below = best.corr; par = best.s.path.length;
    if (k === ROOMS - 1) m.exit = best.cand.exit;
  }
  return raster(m);
}

function deathRate(L) {
  const seen = new Set(); const q = [E.initialState(L)]; seen.add(E.keyOf(q[0]));
  let deaths = 0, moves = 0;
  while (q.length && seen.size < 3000) {
    const s = q.shift();
    for (const d of Object.keys(E.DIRS)) {
      const r = E.move(L, s, d);
      if (r.result === 'none') continue;
      moves++;
      if (r.result === 'dead') { deaths++; continue; }
      if (r.result === 'win') continue;
      const k = E.keyOf(r.state);
      if (!seen.has(k)) { seen.add(k); q.push(r.state); }
    }
  }
  return { states: seen.size, death: deaths / Math.max(1, moves) };
}

const out = [];
for (let t = 0; t < TRIES; t++) {
  let grid = buildLevel();
  if (!grid) continue;
  let L = E.parse({ name: 'gen', grid });
  const sol = E.solve(L, E.initialState(L), false, 60000);
  if (!sol || sol.path.length < MINPAR || sol.path.length > MAXPAR) continue;
  const u = usage(L, sol.path);
  if (!NEED.every(([k, n]) => u[k] >= n)) continue;
  grid = addSpikes(grid, touchedCells(L, sol.path));
  L = E.parse({ name: 'gen', grid });
  const sol2 = E.solve(L, E.initialState(L), false, 60000);
  if (!sol2 || E.lint(L).length) continue;
  const dr = deathRate(L);
  const score = sol2.path.length + u.spread + u.thinnest * 2 + u.flattest * 2 + u.wafer * 2 + u.key * 2 + dr.death * 20;
  out.push({ grid, par: sol2.path.length, path: sol2.path.join(' '), u, dr, score });
}
out.sort((a, b) => b.score - a.score);
for (const o of out.slice(0, N)) {
  const u = Object.entries(o.u).filter(([, v]) => v).map(([k, v]) => k + ':' + v).join(' ');
  console.log(`par ${o.par} score ${o.score.toFixed(1)} states ${o.dr.states} death ${(o.dr.death * 100).toFixed(0)}%  ${u}`);
  console.log('  ' + o.path);
  console.log(o.grid.map(r => `      '${r}',`).join('\n'));
}
console.log(`${out.length} candidates`);
