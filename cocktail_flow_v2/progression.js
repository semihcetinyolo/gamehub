// Progression defaults + colour palette. Hand-edited.
// A level in levels.js may omit any field; the tier whose `from` is the last one
// <= levelOrder fills it in. Fields a level sets itself always win.
(function (root) {
  const PROGRESSION = [
    // from = first levelOrder of the tier. seats = customers around the belt at
    // once; colors / depth (layers per order) / orders are generator inputs
    // (tools/gen.js). slack = belt slots on top of the fewest the level needs
    // (tools/gen.js measures it). lap = seconds for one belt round.
    // patience = seconds per order layer (+ PATIENCE_BASE).
    { from: 0,  seats: 2, colors: 2, depth: 2, orders: 4,  slack: 4, lap: 10,  patience: 12 },
    { from: 2,  seats: 3, colors: 3, depth: 3, orders: 6,  slack: 4, lap: 10,  patience: 11 },
    { from: 6,  seats: 3, colors: 3, depth: 3, orders: 8,  slack: 3, lap: 9.5, patience: 10 },
    { from: 12, seats: 4, colors: 4, depth: 3, orders: 9,  slack: 3, lap: 9,   patience: 10 },
    { from: 20, seats: 4, colors: 4, depth: 4, orders: 10, slack: 2, lap: 8.5, patience: 9 },
  ];
  const PATIENCE_BASE = 14;

  const COMMON = { lanes: 3, startingHearts: 3, maxSeats: 4 };

  // Ingredients (fruits) and the colour of the layer each one adds to a drink.
  // `hi`/`lo` are the light top and dark bottom of a layer.
  const COLORS = {
    pink:   { label: 'Çilek',    hex: '#ff5a9e', hi: '#ff8fbf', lo: '#e23a80' },
    orange: { label: 'Portakal', hex: '#ff9a1f', hi: '#ffbe5c', lo: '#ea7a0a' },
    purple: { label: 'Üzüm',     hex: '#8a43f0', hi: '#a978ff', lo: '#6a27cf' },
    lime:   { label: 'Limon',    hex: '#6fcf3b', hi: '#9be66b', lo: '#4fae22' },
    blue:   { label: 'Yaban mersini', hex: '#2f9bf0', hi: '#6cbcff', lo: '#1b78cf' },
  };
  const PALETTE = ['pink', 'orange', 'purple', 'lime', 'blue'];

  function tierFor(levelOrder) {
    let t = PROGRESSION[0];
    for (const p of PROGRESSION) if (p.from <= levelOrder) t = p;
    return t;
  }

  const api = { PROGRESSION, PATIENCE_BASE, COMMON, COLORS, PALETTE, tierFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BeltProgression = api;
})(this);
