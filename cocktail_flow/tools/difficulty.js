// How hard a level is for a person, measured two ways:
//   detours  extra pours (beyond one per layer) in the best plan the solver
//            finds: layers that must be parked somewhere first because the
//            layer under them is needed sooner
//   deadRate share of quick, sensible-but-shortsighted playthroughs that get
//            stuck: they always build a glass when they can, otherwise park a
//            layer (same colour onto a bottle, or into a glass). The 3 empty
//            preparation glasses are the parking space, so this is what tells
//            whether that space is tight.
// Used by gen.js to pick candidates; `node tools/difficulty.js` prints levels.js.
'use strict';
const S = require('./solver.js');

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

// One playthrough of a sensible but shortsighted player. Returns the pours
// made, or -1 when it got stuck.
//  - every glass works on one on-screen order (its contents are the start of
//    that recipe); a new glass is only started for an order nobody works on
//  - it builds whenever it can (a random one of those moves)
//  - otherwise it parks a layer: onto the same colour in a bottle first, else
//    onto a glass that already holds junk, else into an empty glass; it never
//    covers a glass that is a good start of a recipe
//  - a glass whose top layer is wrong gets that layer taken off again
function playout(E, r) {
  const { b, ptr } = S.startState(E);
  const rem = E.orders.map((_, i) => i);
  const layers = E.orders.length * E.cap;
  const seen = new Set();
  const keyAfter = (i, j) => {   // state after pouring i -> j (no going round in circles)
    const nb = b.slice(), np = ptr.slice();
    S.apply(nb, np, i, j, E);
    return nb.join('|') + np.join(',') + rem.length;
  };
  for (let n = 0; n < layers * 3; n++) {
    const vis = rem.slice(0, E.K).map(k => E.orders[k]);
    const glasses = [];
    for (let j = E.NL; j < b.length; j++) glasses.push(j);
    const goodFor = m => vis.findIndex(o => m && o.startsWith(m));
    // which order each glass works on (first come, first served)
    const claimed = new Map();
    for (const j of glasses) {
      const m = b[j];
      if (!m) continue;
      const k = vis.findIndex((o, x) => o.startsWith(m) && !claimed.has(x));
      if (k >= 0) claimed.set(k, j);
    }
    const workOn = j => { for (const [k, g] of claimed) if (g === j) return vis[k]; return null; };
    const junk = j => b[j] && workOn(j) === null;
    const build = [], tidy = [], park = [], fix = [];
    for (let i = 0; i < b.length; i++) {
      if (!b[i] || b[i] === S.GONE) continue;
      const c = b[i][b[i].length - 1];
      const fromGood = i >= E.NL && workOn(i) !== null;
      if (fromGood) continue;   // never take apart a good start
      for (let j = 0; j < b.length; j++) {
        if (!S.canPour(b, i, j, E)) continue;
        if (j >= E.NL) {
          const target = workOn(j);
          if (target && target.startsWith(b[j] + c)) build.push([i, j]);
          else if (!b[j] && vis.some((o, k) => !claimed.has(k) && o[0] === c)) build.push([i, j]);
          else if (i < E.NL && junk(j)) park.push([i, j, 0]);
          else if (i < E.NL && !b[j]) park.push([i, j, 1]);
          else if (i >= E.NL && junk(i) && junk(j)) fix.push([i, j]);
        } else if (i >= E.NL) fix.push([i, j]);   // junk back onto its colour
        else tidy.push([i, j]);
      }
    }
    const fresh = list => list.filter(([i, j]) => !seen.has(keyAfter(i, j)));
    const parkJunk = park.filter(p => p[2] === 0);
    let pool = null;
    for (const list of [build, fix, r() < 0.5 ? tidy : parkJunk, tidy, parkJunk, park]) {
      const f = fresh(list);
      if (f.length) { pool = f; break; }
    }
    if (!pool) return -1;
    const [i, j] = pool[Math.floor(r() * pool.length)];
    seen.add(keyAfter(i, j));
    S.apply(b, ptr, i, j, E);
    S.settle(b, rem, E, null);
    if (!rem.length) return n + 1;
  }
  return -1;
}

function measure(level, opts = {}) {
  const E = S.encode(level);
  const r = rng(opts.seed || 7);
  const N = opts.runs || 120;
  let dead = 0, extra = 0, ok = 0;
  const layers = E.orders.length * E.cap;
  for (let k = 0; k < N; k++) {
    const m = playout(E, r);
    if (m < 0) dead++; else { ok++; extra += m - layers; }
  }
  return { deadRate: dead / N, extra: ok ? extra / ok : null };
}

module.exports = { measure };

if (require.main === module) {
  const fs = require('fs'), path = require('path'), vm = require('vm');
  const Core = require('../core.js');
  const box = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'levels.js'), 'utf8'), box);
  for (const raw of box.window.FLOW_LEVELS) {
    const L = Core.resolveLevel(raw);
    const s = S.solve(L, { widths: [300, 1500] });
    const m = measure(L);
    const layers = L.orders.length * L.bottleCapacity;
    console.log(`L${String(L.levelOrder).padStart(2)} ${(L.difficulty || '').padEnd(8)} layers ${layers}  detours ${s ? s.moves - layers : '-'}  dead ${(m.deadRate * 100).toFixed(0)}%  extra ${m.extra === null ? '-' : m.extra.toFixed(1)}`);
  }
}
