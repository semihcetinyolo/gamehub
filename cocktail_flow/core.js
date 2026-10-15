// Rules shared by the game (game.js) and the tools (tools/gen.js, tools/verify.js).
(function (root) {
  const P = typeof module !== 'undefined' && module.exports
    ? require('./progression.js') : root.FlowProgression;

  // Fill missing fields from the progression tier. Never mutates `raw`.
  function resolveLevel(raw) {
    const tier = P.tierFor(raw.levelOrder);
    const L = Object.assign({}, P.COMMON, {
      customerPatienceSeconds: tier.customerPatienceSeconds,
    }, raw);
    L.maxActiveCustomers = Math.max(1, Math.min(3, L.maxActiveCustomers));
    // lanes[l] = the supply bottles of lane l, front -> back
    L.lanes = (raw.lanes || []).map(lane => lane.map(b => b.slice()));
    L.theme = P.THEMES[raw.theme] ? raw.theme : 'cocktail';
    L.orders = (raw.orders || []).map((o, i) => ({
      name: o.name || `Kokteyl ${i + 1}`,
      layers: o.layers.slice(),
      patience: o.patience || L.customerPatienceSeconds,
      coins: o.coins || orderPrice(o.layers),
    }));
    return L;
  }

  // Data checks. Solvability is checked by tools/verify.js.
  function validateLevel(L) {
    const err = [];
    if (!L.lanes.length) err.push('no lanes');
    if (L.prepCount < 1) err.push('no preparation glasses');
    L.lanes.forEach((lane, l) => {
      if (!lane.length) err.push(`lane ${l} is empty`);
      lane.forEach((b, k) => {
        if (!b.length || b.length > L.bottleCapacity) err.push(`lane ${l} bottle ${k} has ${b.length} layers`);
      });
    });
    if (!L.orders.length) err.push('no orders');
    const have = {}, need = {};
    for (const lane of L.lanes) for (const b of lane) for (const c of b) have[c] = (have[c] || 0) + 1;
    L.orders.forEach((o, i) => {
      if (!o.layers.length || o.layers.length > L.bottleCapacity) err.push(`order ${i} has ${o.layers.length} layers`);
      for (const c of o.layers) need[c] = (need[c] || 0) + 1;
    });
    for (const c of new Set([...Object.keys(have), ...Object.keys(need)])) {
      if (!P.COLORS[c]) err.push(`unknown colour "${c}"`);
      if ((have[c] || 0) !== (need[c] || 0)) err.push(`${c}: bottles have ${have[c] || 0}, orders need ${need[c] || 0}`);
    }
    return err;
  }

  // Default coin price of an order: 10, +5 per colour change bottom -> top,
  // +5 per colour beyond two. 15 (AABB) ... 35 (ABCD).
  function orderPrice(layers) {
    let changes = 0;
    for (let i = 1; i < layers.length; i++) if (layers[i] !== layers[i - 1]) changes++;
    return 10 + 5 * changes + 5 * Math.max(0, new Set(layers).size - 2);
  }

  // A preparation glass (anyColor) takes any colour; a supply bottle only takes
  // a layer when its top is the same colour.
  function canPour(from, to, cap, anyColor) {
    if (from === to || !from.length || to.length >= cap) return false;
    return anyColor || !to.length || to[to.length - 1] === from[from.length - 1];
  }

  function sameLayers(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  const api = { resolveLevel, validateLevel, orderPrice, canPour, sameLayers };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FlowCore = api;
})(this);
