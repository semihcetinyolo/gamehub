// Rules shared by the game (game.js) and the tools (tools/gen.js, tools/verify.js).
(function (root) {
  const P = typeof module !== 'undefined' && module.exports
    ? require('./progression.js') : root.CocktailProgression;

  // Fill missing fields from the progression tier. Never mutates `raw`.
  function resolveLevel(raw) {
    const tier = P.tierFor(raw.levelOrder);
    const L = Object.assign({}, P.COMMON, {
      bottleCount: tier.bottleCount,
      customerPatienceSeconds: tier.customerPatienceSeconds,
    }, raw);
    L.maxActiveCustomers = Math.max(1, Math.min(3, L.maxActiveCustomers));
    L.initialBottles = (raw.initialBottles || []).map(b => b.slice());
    L.theme = P.THEMES[raw.theme] ? raw.theme : 'cocktail';
    L.mixer = raw.mixer || 0;   // index of the preparation vessel
    L.refills = (raw.refills || []).map(b => b.slice());   // for normal bottles that run empty
    L.orders = (raw.orders || []).map((o, i) => ({
      name: o.name || `Kokteyl ${i + 1}`,
      layers: o.layers.slice(),
      patience: o.patience || L.customerPatienceSeconds,
      coins: o.coins || orderPrice(o.layers),
    }));
    return L;
  }

  // Data checks from the design doc. Solvability is checked by tools/verify.js.
  function validateLevel(L) {
    const err = [];
    if (L.initialBottles.length !== L.bottleCount)
      err.push(`initialBottles has ${L.initialBottles.length} bottles, bottleCount is ${L.bottleCount}`);
    L.initialBottles.forEach((b, i) => {
      if (b.length > L.bottleCapacity) err.push(`bottle ${i} holds ${b.length} > capacity ${L.bottleCapacity}`);
    });
    if (!L.initialBottles[L.mixer]) err.push(`mixer ${L.mixer} is not a bottle`);
    L.refills.forEach((b, i) => {
      if (!b.length || b.length > L.bottleCapacity) err.push(`refill ${i} has ${b.length} layers`);
    });
    if (!L.orders.length) err.push('no orders');
    const have = {}, need = {};
    for (const b of L.initialBottles.concat(L.refills)) for (const c of b) have[c] = (have[c] || 0) + 1;
    L.orders.forEach((o, i) => {
      if (!o.layers.length || o.layers.length > L.bottleCapacity) err.push(`order ${i} has ${o.layers.length} layers`);
      for (const c of o.layers) need[c] = (need[c] || 0) + 1;
    });
    for (const c of new Set([...Object.keys(have), ...Object.keys(need)])) {
      if (!P.COLORS[c]) err.push(`unknown colour "${c}"`);
      if ((have[c] || 0) !== (need[c] || 0)) err.push(`${c}: bottles + refills have ${have[c] || 0}, orders need ${need[c] || 0}`);
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

  // The mixer (anyColor) takes any colour; a normal bottle only takes a layer
  // when it is empty or its top is the same colour.
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
  else root.CocktailCore = api;
})(this);
