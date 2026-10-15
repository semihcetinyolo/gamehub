// Rules shared by the game (game.js) and the tools (tools/gen.js, tools/verify.js).
(function (root) {
  const P = typeof module !== 'undefined' && module.exports
    ? require('./progression.js') : root.BeltProgression;

  // Fill missing fields from the progression tier. Never mutates `raw`.
  function resolveLevel(raw) {
    const tier = P.tierFor(raw.levelOrder);
    const L = Object.assign({}, P.COMMON, { seats: tier.seats, lap: tier.lap }, raw);
    L.seats = Math.max(1, Math.min(P.COMMON.maxSeats, L.seats));
    // lanes[l] = the ingredients of supply lane l, front -> back
    L.lanes = (raw.lanes || []).map(lane => lane.slice());
    L.orders = (raw.orders || []).map((o, i) => ({
      name: o.name || `Kokteyl ${i + 1}`,
      layers: o.layers.slice(),
      patience: o.patience || P.PATIENCE_BASE + tier.patience * o.layers.length,
      coins: o.coins || orderPrice(o.layers),
    }));
    return L;
  }

  // Data checks. Solvability is checked by tools/verify.js.
  function validateLevel(L) {
    const err = [];
    if (!L.lanes.length) err.push('no lanes');
    if (!(L.beltSlots >= 1)) err.push('no belt slots');
    if (!L.orders.length) err.push('no orders');
    const have = {}, need = {};
    for (const lane of L.lanes) for (const c of lane) have[c] = (have[c] || 0) + 1;
    L.orders.forEach((o, i) => {
      if (!o.layers.length) err.push(`order ${i} is empty`);
      for (const c of o.layers) need[c] = (need[c] || 0) + 1;
    });
    for (const c of new Set([...Object.keys(have), ...Object.keys(need)])) {
      if (!P.COLORS[c]) err.push(`unknown colour "${c}"`);
      if ((have[c] || 0) !== (need[c] || 0)) err.push(`${c}: lanes have ${have[c] || 0}, orders need ${need[c] || 0}`);
    }
    return err;
  }

  // Default coin price of an order: 10, +5 per colour change bottom -> top,
  // +5 per colour beyond two.
  function orderPrice(layers) {
    let changes = 0;
    for (let i = 1; i < layers.length; i++) if (layers[i] !== layers[i - 1]) changes++;
    return 10 + 5 * changes + 5 * Math.max(0, new Set(layers).size - 2);
  }

  // ---------- turn-based model of the belt (tools) ----------
  // Timing left out: a thrown ingredient goes to the first seat along the belt
  // whose customer needs that colour next (seats are listed in belt order),
  // otherwise it stays on the belt ("parked"). A throw needs a free belt slot.
  // A finished customer's seat takes the next order at once.
  function initState(L) {
    const seats = [];
    let next = 0;
    for (let i = 0; i < L.seats; i++) seats.push(next < L.orders.length ? { o: next++, k: 0 } : { o: -1, k: 0 });
    return { ptr: L.lanes.map(() => 0), parked: {}, onBelt: 0, seats, next, done: 0 };
  }
  function cloneState(s) {
    return { ptr: s.ptr.slice(), parked: Object.assign({}, s.parked), onBelt: s.onBelt,
      seats: s.seats.map(x => ({ o: x.o, k: x.k })), next: s.next, done: s.done };
  }
  function needs(L, s) {
    const n = new Set();
    for (const x of s.seats) if (x.o >= 0) n.add(L.orders[x.o].layers[x.k]);
    return n;
  }
  function settle(L, s) {
    let changed = true;
    while (changed) {
      changed = false;
      for (const x of s.seats) {
        if (x.o < 0) continue;
        const c = L.orders[x.o].layers[x.k];
        if (!s.parked[c]) continue;
        s.parked[c]--; s.onBelt--; x.k++; changed = true;
        if (x.k === L.orders[x.o].layers.length) {
          s.done++;
          if (s.next < L.orders.length) { x.o = s.next++; x.k = 0; } else x.o = -1;
        }
      }
    }
  }
  function canThrow(L, s, l, cap) { return s.ptr[l] < L.lanes[l].length && s.onBelt < cap; }
  function throwLane(L, s, l) {
    const c = L.lanes[l][s.ptr[l]++];
    s.parked[c] = (s.parked[c] || 0) + 1; s.onBelt++;
    settle(L, s);
  }
  function keyOf(s) {
    return s.ptr.join(',') + '|' + Object.keys(s.parked).sort().map(c => c + s.parked[c]).join('') +
      '|' + s.seats.map(x => x.o + ':' + x.k).join(',');
  }

  // A throw order (lane indices) that serves everything with `cap` belt slots, or null.
  function solve(L, cap, budget = 400000) {
    const dead = new Set();
    let visits = 0;
    const path = [];
    function dfs(s) {
      if (s.done === L.orders.length) return true;
      const k = keyOf(s);
      if (dead.has(k) || ++visits > budget) return false;
      // needed-now lanes first: finds a plan fast when one exists
      const want = needs(L, s);
      const order = L.lanes.map((_, l) => l).filter(l => canThrow(L, s, l, cap))
        .sort((a, b) => want.has(L.lanes[b][s.ptr[b]]) - want.has(L.lanes[a][s.ptr[a]]));
      for (const l of order) {
        const t = cloneState(s);
        throwLane(L, t, l);
        path.push(l);
        if (dfs(t)) return true;
        path.pop();
      }
      dead.add(k);
      return false;
    }
    return dfs(initState(L)) ? path.slice() : null;
  }

  // Fewest belt slots that still let the level be served.
  function minBelt(L) {
    const total = L.lanes.reduce((n, l) => n + l.length, 0);
    for (let cap = 1; cap <= total; cap++) if (solve(L, cap)) return cap;
    return total;
  }

  // Share of plausible-but-shortsighted plays that jam the belt: throw a lane
  // whose front some customer needs right now if there is one, else a random lane.
  function jamRate(L, cap, runs = 300, seed = 1) {
    let r = seed >>> 0 || 1;
    const rnd = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 4294967296);
    let jams = 0;
    for (let i = 0; i < runs; i++) {
      const s = initState(L);
      while (s.done < L.orders.length) {
        const open = L.lanes.map((_, l) => l).filter(l => canThrow(L, s, l, cap));
        if (!open.length) { jams++; break; }
        const want = needs(L, s);
        const good = open.filter(l => want.has(L.lanes[l][s.ptr[l]]));
        const pick = good.length ? good : open;
        throwLane(L, s, pick[Math.floor(rnd() * pick.length)]);
      }
    }
    return jams / runs;
  }

  const api = { resolveLevel, validateLevel, orderPrice, initState, cloneState, needs, settle,
    canThrow, throwLane, solve, minBelt, jamRate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BeltCore = api;
})(this);
