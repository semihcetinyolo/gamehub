#!/usr/bin/env node
// Level generator for the four-colour sliding board.
//   node tools/gen.js            -> writes levels.js + tools/solutions.json
//   ONLY=1,10 node tools/gen.js  -> dry run of a few levels
//
// Board (like the wooden toy): `cols` vertical slots of `cap` = rows cells (no spare row), and a top
// channel of cols + 2 cells (one free pocket beyond each outer slot). Slot c hangs under
// channel cell c + 1. The board stands upright, so a disc dropped into a slot falls to the
// lowest free cell. Nothing floats: a disc in the channel only stays in a pocket or above a
// slot that is full or closed; above an open slot with room it falls in (also later, when
// that slot opens). A disc only travels through empty cells, so a disc in the channel
// blocks the way past it.
// A slot that shows exactly its card column is complete: it gets a lid and is locked.
// The level is won when every slot is complete.
//
// Level features (adapted from Magic Sort's blockers, see game.js for the player view):
//   hidden   [[c,k]]      "?" disc, colour shown once it is the top of its slot
//   clay     c            slot only takes discs, nothing can be taken out of it
//   box      {c,key:[a,k]} slot c is boxed (no in/out, hidden) until the slot holding the key
//                          disc (starts at slot a, height k) is complete
//   ice      {c,k}        frozen disc: can't leave while on top; thaws when any slot completes
//   plaster  c            slot sealed (no in/out, hidden) until a neighbour slot completes
//   stopper  {c,open}     slot mouth opens/closes after every move
//   bag      {c,n}        slot sealed (no in/out, hidden) until n slots are complete
//   tag      {x,color}    end pocket where only that colour may stop
//
// A level is a random target card plus a start made by walking random legal moves back
// from the solved board, then features are placed and a beam solver of all the rules above
// checks it; its move count is the level's par (stars) and picks the difficulty.
'use strict';
const fs = require('fs');
const path = require('path');

const COUNT = 50;
const COLORS = 4;

function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(a, r) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- level curve ----------
// each feature is introduced alone, then mixed in; every 5th level is a harder peak
const PLAN = {
  1: [], 2: [], 3: ['hidden'], 4: ['hidden'], 5: ['hidden'],
  6: ['clay'], 7: ['clay', 'hidden'], 8: ['box'], 9: ['box', 'hidden'], 10: ['box', 'clay'],
  11: ['ice'], 12: ['ice', 'hidden'], 13: [], 14: ['hidden'], 15: ['ice', 'box'],
  16: ['plaster'], 17: ['plaster', 'hidden'], 18: ['clay', 'ice'], 19: ['stopper'], 20: ['stopper', 'plaster'],
  21: ['tag'], 22: ['tag', 'hidden'], 23: ['bag'], 24: ['bag', 'ice'], 25: ['box', 'stopper', 'hidden'],
};
// level that introduces each feature
const FIRST = {};
for (const n of Object.keys(PLAN).map(Number).sort((a, b) => a - b)) for (const f of PLAN[n]) if (!(f in FIRST)) FIRST[f] = n;
const MIX = ['hidden', 'clay', 'box', 'ice', 'plaster', 'stopper', 'bag', 'tag'];
function params(n, r) {
  const rows = n <= 12 ? 3 : 4;
  const hard = n % 5 === 0;
  let features = PLAN[n];
  if (!features) {
    const k = hard ? 3 : 2;
    features = shuffle(MIX.slice(), r).slice(0, k);
  }
  return { n, cols: 4, rows, cap: rows, hard, features };
}

// ---------- model ----------
// state: t = slot stacks (bottom first), ch = channel (-1 empty); a disc is its colour, the key
// disc is colour + KEY (so it is tracked wherever it goes); done = bitmask of complete
// slots, box = box opened, thaw = ice gone, d = moves made (stopper phase)
const KEY = 4, colour = v => v & 3;
const bit = c => 1 << c;
const popcount = m => { let n = 0; while (m) { n += m & 1; m >>= 1; } return n; };
function covered(s, c, F) {          // sealed and hidden
  if (F.box && F.box.c === c && !s.box) return true;
  if (F.plaster === c && !(s.done & bit(c - 1)) && !(s.done & bit(c + 1))) return true;
  if (F.bag && F.bag.c === c && popcount(s.done) < F.bag.n) return true;
  return false;
}
function blocked(s, c, F) {
  if (s.done & bit(c) || covered(s, c, F)) return true;
  return !!F.stopper && F.stopper.c === c && ((s.d % 2 === 0) !== F.stopper.open);
}
function canTake(s, c, F) {
  if (blocked(s, c, F) || F.clay === c) return false;
  return !(F.ice && F.ice.c === c && !s.thaw && s.t[c].length === F.ice.k + 1);
}
const chOk = (x, v, F) => !F.tag || F.tag.x !== x || F.tag.color === colour(v);
// after a move: box, completions, ice, then discs above open slots fall in (repeat)
function after(s, F, card, cap) {
  for (let again = true; again;) {
    again = false;
    update(s, F, card);
    for (let c = 0; c < card.length; c++) {
      const v = s.ch[c + 1];
      if (v < 0 || blocked(s, c, F) || s.t[c].length >= cap) continue;
      s.t = s.t.slice(); s.t[c] = s.t[c].concat(v);
      s.ch = s.ch.slice(); s.ch[c + 1] = -1;
      again = true;
    }
  }
}
// a channel cell where a disc may come to rest (pocket, or above a full / closed slot)
const canRest = (s, t, x, F, cap) => x === 0 || x === t.length + 1 || blocked(s, x - 1, F) || t[x - 1].length >= cap;
function update(s, F, card) {
  for (let again = true; again;) {
    again = false;
    for (let c = 0; c < card.length; c++) {
      if (s.done & bit(c) || covered(s, c, F)) continue;
      const col = s.t[c];
      if (col.length === card[c].length && col.every((v, i) => colour(v) === card[c][i])) { s.done |= bit(c); again = true; }
    }
    // the box opens once the slot holding the key disc is complete
    if (F.box && !s.box && s.t.some((col, c) => s.done & bit(c) && col.some(v => v >= KEY))) { s.box = true; again = true; }
  }
  if (s.done) s.thaw = true;
}
const key = (s, F) => s.t.map(c => c.join('')).join('|') + '#' + s.ch.map(v => v < 0 ? '.' : v).join('') +
  '#' + s.done + (s.box ? 'b' : '') + (s.thaw ? 'i' : '') + (F.stopper ? s.d % 2 : '');
function emptyRun(ch, x) {
  let l = x, r = x;
  while (l > 0 && ch[l - 1] < 0) l--;
  while (r < ch.length - 1 && ch[r + 1] < 0) r++;
  return [l, r];
}
// every legal move from s: [state, move]; move = [from, to] with 'tC' slot / 'hX' channel
function moves(s, cap, F, card) {
  const out = [], n = s.t.length;
  const next = (t, ch, mv) => {
    const ns = { t, ch, done: s.done, box: s.box, thaw: s.thaw, d: s.d + 1 };
    after(ns, F, card, cap);
    out.push([ns, mv]);
  };
  for (let a = 0; a < n; a++) {
    const src = s.t[a];
    if (!src.length || s.ch[a + 1] >= 0 || !canTake(s, a, F)) continue;
    const v = src[src.length - 1];
    const [l, r] = emptyRun(s.ch, a + 1);
    for (let b = 0; b < n; b++) {
      if (b === a || b + 1 < l || b + 1 > r || s.t[b].length >= cap || blocked(s, b, F)) continue;
      const t = s.t.slice(); t[a] = src.slice(0, -1); t[b] = s.t[b].concat(v);
      next(t, s.ch, ['t' + a, 't' + b]);
    }
    for (let x = l; x <= r; x++) {
      const t = s.t.slice(); t[a] = src.slice(0, -1);
      if (!chOk(x, v, F) || !canRest(s, t, x, F, cap)) continue;
      const ch = s.ch.slice(); ch[x] = v;
      next(t, ch, ['t' + a, 'h' + x]);
    }
  }
  for (let x = 0; x < s.ch.length; x++) {
    const v = s.ch[x];
    if (v < 0) continue;
    const [l, r] = emptyRun(s.ch, x);
    for (let b = 0; b < n; b++) {
      if (b + 1 < l || b + 1 > r || s.t[b].length >= cap || blocked(s, b, F)) continue;
      const t = s.t.slice(); t[b] = s.t[b].concat(v);
      const ch = s.ch.slice(); ch[x] = -1;
      next(t, ch, ['h' + x, 't' + b]);
    }
    for (let y = l; y <= r; y++) {
      if (y === x || !chOk(y, v, F) || !canRest(s, s.t, y, F, cap)) continue;
      const ch = s.ch.slice(); ch[x] = -1; ch[y] = v;
      next(s.t, ch, ['h' + x, 'h' + y]);
    }
  }
  return out;
}

// ---------- solver ----------
function prefix(col, t) { let p = 0; while (p < col.length && colour(col[p]) === t[p]) p++; return p; }
function score(s, card) {
  let sc = popcount(s.done) * 30;
  const avail = new Set();
  s.ch.forEach(v => { if (v >= 0) { avail.add(colour(v)); sc -= 1.2; } });
  s.t.forEach((col, c) => {
    if (s.done & bit(c)) return;
    const p = prefix(col, card[c]);
    if (p < col.length) avail.add(colour(col[col.length - 1]));
    sc += p * 6 - (col.length - p) * 2;
  });
  s.t.forEach((col, c) => {
    const p = prefix(col, card[c]);
    if (p === col.length && p < card[c].length && avail.has(card[c][p])) sc += 2;
  });
  if (s.box) sc += 4;
  if (s.thaw) sc += 3;
  return sc;
}
function solve(start, card, cap, F, W) {
  const all = (1 << card.length) - 1;
  const t0 = start.t.map(c => c.slice());
  if (F.box) t0[F.box.key[0]][F.box.key[1]] += KEY;
  const s0 = { t: t0, ch: start.ch, done: 0, box: false, thaw: false, d: 0, par: null, mv: null };
  after(s0, F, card, cap);
  if (s0.done) return null;            // nothing may start complete
  let frontier = [s0];
  const seen = new Set([key(s0, F)]);
  for (let depth = 0; depth < 300; depth++) {
    const next = [];
    for (const s of frontier) {
      for (const [t, mv] of moves(s, cap, F, card)) {
        const k = key(t, F);
        if (seen.has(k)) continue;
        seen.add(k);
        t.par = s; t.mv = mv;
        if (t.done === all) return t;
        t.sc = score(t, card);
        next.push(t);
      }
    }
    if (!next.length) return null;
    next.sort((a, b) => b.sc - a.sc);
    frontier = next.slice(0, W);
  }
  return null;
}

// ---------- level build ----------
function makeCard(p, r) {
  // no column already sorted into one colour, so every column needs work
  for (;;) {
    const bag = shuffle(Array.from({ length: p.cols * p.rows }, (_, i) => i % COLORS), r);
    const card = Array.from({ length: p.cols }, (_, c) => bag.slice(c * p.rows, (c + 1) * p.rows));
    if (!card.some(col => col.every(v => v === col[0]))) return card;
  }
}
// featureless moves for the scramble walk
function plainMoves(s, cap) {
  return moves({ ...s, done: 0, box: true, thaw: true, d: 0 }, cap, {}, []).map(([t, mv]) => [{ t: t.t, ch: t.ch }, mv]);
}
function scramble(card, p, r, steps) {
  let s = { t: card.map(c => c.slice()), ch: new Array(p.cols + 2).fill(-1) };
  let last = null;
  // slots have no spare row, so the start may keep some discs resting in the channel
  for (let i = 0; i < steps; i++) {
    const opts = plainMoves(s, p.cap).filter(([t]) => key({ ...t, done: 0 }, {}) !== last);
    last = key({ ...s, done: 0 }, {});
    s = opts[Math.floor(r() * opts.length)][0];
  }
  return s;
}
// place the level's features on a scrambled start; null if the start doesn't allow it
function placeFeatures(p, start, card, r) {
  const F = {};
  const free = shuffle([0, 1, 2, 3], r);     // one slot feature per slot
  const take = (ok) => { const i = free.findIndex(ok); return i < 0 ? -1 : free.splice(i, 1)[0]; };
  const isPrefix = c => start.t[c].length < card[c].length && start.t[c].every((v, i) => v === card[c][i]);
  for (const f of p.features) {
    if (f === 'clay') { const c = take(isPrefix); if (c < 0) return null; F.clay = c; }
    if (f === 'box') {
      const keySlot = take(c => start.t[c].length >= 2);
      const c = take(() => true);
      if (keySlot < 0 || c < 0) return null;
      F.box = { c, key: [keySlot, Math.floor(r() * (start.t[keySlot].length - 1))] };
    }
    if (f === 'ice') {
      const c = take(c => start.t[c].length >= 1);
      if (c < 0) return null;
      F.ice = { c, k: Math.min(p.cap - 2, Math.floor(r() * start.t[c].length)) };
      if (F.ice.k >= start.t[c].length) return null;
    }
    if (f === 'plaster') {
      // the intro level puts it in a middle slot, so it has a neighbour on both sides
      const c = take(c => p.n !== FIRST.plaster || (c > 0 && c < p.cols - 1));
      if (c < 0) return null;
      F.plaster = c;
    }
    if (f === 'stopper') { const c = take(() => true); if (c < 0) return null; F.stopper = { c, open: r() < 0.5 }; }
    if (f === 'bag') { const c = take(() => true); if (c < 0) return null; F.bag = { c, n: 1 + Math.floor(r() * 2) }; }
    if (f === 'tag') {
      // only in the end pockets, never under a start disc of another colour (it couldn't rest there)
      const color = Math.floor(r() * COLORS);
      const xs = [0, p.cols + 1].filter(x => start.ch[x] < 0 || start.ch[x] === color);
      if (!xs.length) return null;
      F.tag = { x: xs[Math.floor(r() * xs.length)], color };
    }
    if (f === 'hidden') {
      const spots = [];
      start.t.forEach((col, c) => col.forEach((_, k) => { if (k < col.length - 1) spots.push([c, k]); }));
      F.hidden = shuffle(spots, r).slice(0, p.rows === 3 ? 3 + Math.floor(r() * 2) : 4 + Math.floor(r() * 3));
    }
  }
  return F;
}
function build(n) {
  const r = rng(5000 + n * 7919);
  const p = params(n, r);
  const want = p.rows === 3 ? 6 + n * 0.8 : 12 + (n - 12) * 0.35;
  let best = null;
  for (let tries = 0; tries < 80; tries++) {
    const card = makeCard(p, r);
    const start = scramble(card, p, r, 120 + Math.floor(r() * 40));
    const F = placeFeatures(p, start, card, r);
    if (!F) continue;
    const end = solve(start, card, p.cap, F, 400) || solve(start, card, p.cap, F, 2000);
    if (!end || end.d < 4) continue;
    const pathMv = [];
    for (let s = end; s.par; s = s.par) pathMv.unshift(s.mv);
    const cand = { card, start: start.t, startCh: start.ch, features: F, par: end.d, path: pathMv };
    const target = want * (p.hard ? 1.25 : 1);
    if (!best || Math.abs(cand.par - target) < Math.abs(best.par - target)) best = cand;
    if (tries >= 6 && Math.abs(best.par - target) <= 2) break;
  }
  if (!best) throw new Error('no level ' + n);
  return { n, cols: p.cols, rows: p.rows, cap: p.cap, hard: p.hard, par: best.par,
    card: best.card, start: best.start, startCh: best.startCh, features: best.features, path: best.path };
}

const ONLY = process.env.ONLY ? process.env.ONLY.split(',').map(Number) : null;
const levels = [], solutions = [];
for (let n = 1; n <= COUNT; n++) {
  if (ONLY && !ONLY.includes(n)) continue;
  const L = build(n);
  solutions.push(L.path);
  delete L.path;
  levels.push(L);
  process.stdout.write(`L${n}: ${L.cols}x${L.rows} par ${L.par}${L.hard ? ' HARD' : ''} ${Object.keys(L.features).join(',')}\n`);
}
if (ONLY) process.exit(0);
fs.writeFileSync(path.join(__dirname, '..', 'levels.js'),
  '// Generated by tools/gen.js — do not edit by hand.\nwindow.LEVELS = ' + JSON.stringify(levels) + ';\n');
fs.writeFileSync(path.join(__dirname, 'solutions.json'), JSON.stringify(solutions));
