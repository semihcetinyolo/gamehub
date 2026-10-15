#!/usr/bin/env node
// Level generator for the café drink game.
//   node tools/gen.js            -> writes levels.js + tools/solutions.json
//   ONLY=3,10 node tools/gen.js  -> dry run of a few levels
// Every column is a tiffin; the move that completes a tiffin equal (bottom -> top) to an
// open order serves it, the tiffin is refilled with the next ingredient batch and the next
// order opens. Nothing is ever served without that move (see fillSlots). A shelf (lane) only takes a layer onto an empty shelf or onto the same
// ingredient. Each level is checked with a beam-search solver of exactly these rules;
// the solver's move count drives candidate choice (difficulty) and customer patience.
'use strict';
const fs = require('fs');
const path = require('path');
const FOOD_ITEMS = require('../items.js');
const MEAL_MENUS = require('../menus.js');

const COUNT = 50;

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

// Level curve. hard = saw-tooth peak (every 5th level): harder candidate, tighter clock.
// k = ingredient kinds, orders = drinks to serve, open = orders shown side by side.
function params(n) {
  return {
    cols: 4, h: 3, open: 2, lanes: [3, 3],
    // Introduce familiar meal families gradually; every order comes from a curated menu.
    menuPool: n <= 5 ? [0, 7] : n <= 10 ? [0, 7, 2] : n <= 15 ? [1, 5] : n <= 20 ? [3, 4] : n <= 30 ? [0, 7, 2, 5] : n <= 40 ? [1, 3, 4, 5] : MEAL_MENUS.map((_, i) => i),
    // at least cols + 1 orders, so every level refills a tiffin at least once
    orders: n <= 5 ? 5 : n <= 15 ? 6 : n <= 25 ? 7 : n <= 35 ? 8 : n <= 42 ? 9 : 10,
    frozen: 0, hidden: 0, chained: 0, hard: n % 5 === 0,
  };
}

// ---------- solver ----------
// stacks: 0 = left lane, 1..cols = glasses, cols+1 = right lane (deep end first).
// State: t stacks, act open order ids, q queued order ids, sup next refill batch,
// served count, gone = bitmask of locks whose disc was served away.
function prefix(col, t) {
  let p = 0;
  while (p < col.length && col[p] === t[p]) p++;
  return p;
}
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// Nothing may ever be served without the move that completes it, so a newly opened order
// must not match a full tiffin and a refill must not match an open order. An order keeps
// its ingredients but its layer sequence is chosen when it opens: the designed sequence,
// else the first other arrangement no full tiffin shows. If no queued order can open that
// way, the slot waits ("customer on the way") until the tiffins change. Refills use the
// first arrangement that matches no open order. The game does exactly the same.
function perms(rec) {
  const out = [], seen = new Set();
  const go = (rest, cur) => {
    if (!rest.length) { const k = cur.join(); if (!seen.has(k)) { seen.add(k); out.push(cur); } return; }
    rest.forEach((v, i) => go(rest.slice(0, i).concat(rest.slice(i + 1)), cur.concat(v)));
  };
  go(rec, []);
  return out;   // the designed sequence comes first
}
const fullTiffins = (s, L) => s.t.slice(1, L.cols + 1).filter(g => g.length === L.h);
// open orders while slots are free and some queued order has an arrangement no full tiffin shows
function fillSlots(s, L) {
  while (s.act.length < L.open && s.q.length) {
    const full = fullTiffins(s, L);
    let pick = null;
    for (let i = 0; i < s.q.length && !pick; i++) {
      const r = perms(L.recipes[s.q[i]]).find(r => !full.some(g => same(g, r)));
      if (r) pick = [i, r];
    }
    if (!pick) return;
    s.q = s.q.slice();
    const [o] = s.q.splice(pick[0], 1);
    s.act.push({ o, r: pick[1] });
  }
}
function refillBatch(batch, s) {
  return perms(batch).find(r => !s.act.some(a => same(a.r, r))) || batch.slice();
}
const matchOf = (s, L, c) => s.t[c].length === L.h ? s.act.findIndex(a => same(a.r, s.t[c])) : -1;
// serve tiffin c (it matches open order s.act[i])
function serve(s, L, c, i) {
  s.t[c] = [];
  s.act.splice(i, 1);
  fillSlots(s, L);
  s.t[c] = s.sup < L.batches.length ? refillBatch(L.batches[s.sup], s) : [];
  s.sup++;
  s.served++;
  fillSlots(s, L);
  L.locks.forEach((lk, j) => { if (lk.c + 1 === c) s.gone |= 1 << j; });
}
function lockedTop(s, a, L) {
  for (let j = 0; j < L.locks.length; j++) {
    const lk = L.locks[j];
    if (s.gone & (1 << j) || lk.c + 1 !== a || s.t[a].length !== lk.i + 1) continue;
    if (lk.type === 'frozen' ? s.d < lk.n : s.served < lk.n) return true;
  }
  return false;
}
function score(s, L) {
  let sc = s.served * 60;
  const avail = new Set();
  for (const lane of [0, L.cols + 1]) {
    const t = s.t[lane];
    if (t.length) avail.add(t[t.length - 1]);
    sc -= t.length * 0.4;
  }
  const best = [];
  for (let c = 1; c <= L.cols; c++) {
    const col = s.t[c];
    let bp = 0, bo = null;
    for (const a of s.act) { const p = prefix(col, a.r); if (p > bp) { bp = p; bo = a.r; } }
    best[c] = [bp, bo];
    if (bp < col.length) avail.add(col[col.length - 1]);
    sc += bp * 6 - (col.length - bp) * 2;
  }
  for (let c = 1; c <= L.cols; c++) {
    const [bp, bo] = best[c];
    if (bo && bp === s.t[c].length && bp < L.h && avail.has(bo[bp])) sc += 2;
  }
  return sc;
}
function key(s) {
  return s.t.map(c => c.join(',')).join('|') + '#' + s.act.map(a => a.o + ':' + a.r.join(',')).join(',') + '#' + s.q.join(',') + '#' + s.gone;
}
function expand(s, L) {
  const out = [];
  const T = s.t.length;
  for (let a = 0; a < T; a++) {
    const src = s.t[a];
    if (!src.length || lockedTop(s, a, L)) continue;
    const v = src[src.length - 1];
    for (let b = 0; b < T; b++) {
      if (b === a || s.t[b].length >= L.cap[b]) continue;
      // shelves hold one ingredient kind only
      if ((b === 0 || b === T - 1) && s.t[b].length && s.t[b][s.t[b].length - 1] !== v) continue;
      const t = s.t.slice();
      t[a] = src.slice(0, -1);
      t[b] = s.t[b].concat(v);
      const n = { t, act: s.act.slice(), q: s.q, sup: s.sup, served: s.served, gone: s.gone, d: s.d + 1, par: s, mv: ['t' + a, 't' + b] };
      if (b >= 1 && b <= L.cols && matchOf(n, L, b) >= 0) serve(n, L, b, matchOf(n, L, b));
      else fillSlots(n, L);   // a waiting customer may be able to come now
      out.push(n);
    }
  }
  return out;
}
function solve(L, W) {
  const s0 = { t: [[]].concat(L.start.map(c => c.slice()), [[]]), act: [], q: L.recipes.map((_, o) => o), sup: 0, served: 0, gone: 0, d: 0 };
  fillSlots(s0, L);
  let frontier = [s0];
  const visited = new Set([key(s0)]);
  for (let depth = 0; depth < 500; depth++) {
    const next = [];
    for (const s of frontier) {
      for (const t of expand(s, L)) {
        if (t.served === L.recipes.length) return t;
        const k = key(t);
        if (visited.has(k)) continue;
        visited.add(k);
        t.sc = score(t, L);
        next.push(t);
      }
    }
    if (!next.length) return null;
    next.sort((x, y) => y.sc - x.sc);
    frontier = next.slice(0, W);
  }
  return null;
}

// ---------- level build ----------
function makeCandidate(p, r) {
  const menuIds = Array.from({ length: p.orders }, () => p.menuPool[Math.floor(r() * p.menuPool.length)]);
  // Two distinct, familiar meals make the opening goal easy to read.
  if (p.menuPool.length > 1 && menuIds[0] === menuIds[1]) menuIds[1] = p.menuPool[(p.menuPool.indexOf(menuIds[0]) + 1) % p.menuPool.length];
  const recipes = menuIds.map(id => MEAL_MENUS[id].items.slice());
  // the glasses start with the first `cols` drinks' ingredients, all mixed up;
  // every later refill batch is one later drink, shuffled
  let start;
  for (let tries = 0; tries < 50; tries++) {
    const pool = shuffle([].concat(...recipes.slice(0, p.cols)), r);
    start = [];
    for (let c = 0; c < p.cols; c++) start.push(pool.slice(c * p.h, (c + 1) * p.h));
    if (!start.some(col => recipes.slice(0, p.open).some(rec => same(rec, col)))) break;
  }
  const batches = recipes.slice(p.cols).map(rec => shuffle(rec.slice(), r));
  return { recipes, menuIds, start, batches };
}

function placeSpecials(p, r) {
  const specials = [];
  const used = new Set();
  const pick = (ok) => {
    for (let t = 0; t < 200; t++) {
      const c = Math.floor(r() * p.cols), i = Math.floor(r() * p.h);
      const k = c + ':' + i;
      if (used.has(k) || !ok(c, i)) continue;
      used.add(k);
      return [c, i];
    }
    return null;
  };
  // frozen / chained: never the very top piece, never two locks in one glass
  const lockedCols = new Set();
  const lockOk = (c, i) => i < p.h - 1 && i > 0 && !lockedCols.has(c);
  for (let j = 0; j < p.frozen; j++) {
    const at = pick(lockOk);
    if (!at) break;
    lockedCols.add(at[0]);
    specials.push({ c: at[0], i: at[1], type: 'frozen', n: 4 + Math.floor(r() * 4) + (p.hard ? 2 : 0) });
  }
  for (let j = 0; j < p.chained; j++) {
    const at = pick(lockOk);
    if (!at) break;
    lockedCols.add(at[0]);
    specials.push({ c: at[0], i: at[1], type: 'chained', n: 1 + Math.floor(r() * 2) });
  }
  for (let j = 0; j < p.hidden; j++) {
    const at = pick((c, i) => i < p.h - 1);
    if (!at) break;
    specials.push({ c: at[0], i: at[1], type: 'hidden' });
  }
  return specials;
}

function build(n) {
  const p = params(n);
  const r = rng(2000 + n * 7919);
  const cands = [];
  for (let k = 0; k < 6; k++) {
    const cand = makeCandidate(p, r);
    cand.specials = placeSpecials(p, r);
    const L = {
      cols: p.cols, h: p.h, open: p.open, recipes: cand.recipes, batches: cand.batches, start: cand.start,
      cap: [p.lanes[0]].concat(cand.start.map(() => p.h), [p.lanes[1]]),
      locks: cand.specials.filter(x => x.type !== 'hidden'),
    };
    const end = solve(L, +(process.env.W || 300)) || solve(L, 1500);
    if (!end) continue;
    const path = [];
    for (let s = end; s.par; s = s.par) path.unshift(s.mv);
    cands.push(Object.assign(cand, { moves: end.d, path }));
  }
  if (!cands.length) throw new Error('no solvable candidate for level ' + n);
  cands.sort((a, b) => a.moves - b.moves);
  // easy early levels take the shortest, peaks take the longest, rest the median
  const c = cands[p.hard ? cands.length - 1 : n <= 4 ? 0 : Math.floor(cands.length / 2)];
  // seconds per move: generous early, tighter later; hard peaks a bit tighter again
  let spm = n <= 5 ? 4 : n <= 15 ? 3.2 : n <= 30 ? 2.8 : 2.5;
  if (p.hard) spm *= 0.88;
  // patience of one customer: time for the open orders ahead of it plus slack
  // (the first wave gets 1.5x in the game, the board starts mixed up)
  const perServe = (c.moves * spm + p.hidden * 1.5) / p.orders;
  const patience = Math.ceil((perServe * (p.open + 0.5) + 8) / 5) * 5;
  return {
    n, cols: p.cols, h: p.h, lanes: p.lanes, open: p.open, hard: p.hard, patience, moves: c.moves,
    recipes: c.recipes, menuIds: c.menuIds, start: c.start, batches: c.batches, specials: c.specials, path: c.path,
  };
}

const ONLY = process.env.ONLY ? process.env.ONLY.split(',').map(Number) : null;
const levels = [];
const solutions = [];
for (let n = 1; n <= COUNT; n++) {
  if (ONLY && !ONLY.includes(n)) continue;
  const L = build(n);
  solutions.push(L.path);
  delete L.path;
  levels.push(L);
  process.stdout.write(`L${n}: ${L.cols}x${L.h} orders ${L.recipes.length} moves ${L.moves} patience ${L.patience}s${L.hard ? ' HARD' : ''}\n`);
}
if (ONLY) process.exit(0);
fs.writeFileSync(path.join(__dirname, '..', 'levels.js'),
  '// Generated by tools/gen.js — do not edit by hand.\nwindow.LEVELS = ' + JSON.stringify(levels) + ';\n');
fs.writeFileSync(path.join(__dirname, 'solutions.json'), JSON.stringify(solutions));
