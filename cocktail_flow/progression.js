// Progression defaults + colour palette. Hand-edited.
// A level in levels.js may omit any field; the tier whose `from` is the last one
// <= levelOrder fills it in. Fields a level sets itself always win.
(function (root) {
  const PROGRESSION = [
    // from = first levelOrder of the tier. The supply bottles stand in 3 lanes;
    // depth = bottles per lane (only the front one can be tapped, the one behind
    // it is shown). Orders = lanes × depth, so the liquid is exactly what the
    // orders use. depth / colorCount / mix are generator inputs (tools/gen.js):
    // mix = typical share of a row's layers swapped with the row behind it
    // (layers the on-screen customers need sit further back); candidates draw
    // up to twice this and the level keeps the one whose measured difficulty
    // (tools/difficulty.js, glasses counted as free space) hits its target. Customer patience is fitted
    // per level by tools/gen.js; customerPatienceSeconds here is only a fallback.
    { from: 0,  depth: 2, colorCount: 2, mix: 0,    customerPatienceSeconds: 60 },
    { from: 2,  depth: 2, colorCount: 3, mix: 0.1,  customerPatienceSeconds: 60 },
    { from: 5,  depth: 3, colorCount: 3, mix: 0.15, customerPatienceSeconds: 60 },
    { from: 15, depth: 4, colorCount: 3, mix: 0.2,  customerPatienceSeconds: 60 },
    { from: 25, depth: 4, colorCount: 4, mix: 0.2,  customerPatienceSeconds: 60 },
  ];

  const COMMON = { bottleCapacity: 4, prepCount: 3, maxActiveCustomers: 3, startingHearts: 3 };

  // Liquid colours. `hi`/`lo` are the light top and dark bottom of a layer.
  const COLORS = {
    pink:   { label: 'Pembe',   hex: '#ff5a9e', hi: '#ff8fbf', lo: '#e23a80' },
    orange: { label: 'Turuncu', hex: '#ff9a1f', hi: '#ffbe5c', lo: '#ea7a0a' },
    purple: { label: 'Mor',     hex: '#8a43f0', hi: '#a978ff', lo: '#6a27cf' },
    lime:   { label: 'Yeşil',   hex: '#6fcf3b', hi: '#9be66b', lo: '#4fae22' },
    blue:   { label: 'Mavi',    hex: '#2f9bf0', hi: '#6cbcff', lo: '#1b78cf' },
    yellow: { label: 'Sarı',    hex: '#ffd23a', hi: '#ffe47e', lo: '#f0b512' },
    // coffee levels
    espresso: { label: 'Espresso', hex: '#4b2a1a', hi: '#70452f', lo: '#2f180c' },
    milk:     { label: 'Süt',      hex: '#f1f5f7', hi: '#ffffff', lo: '#a5b5c1' },
    caramel:  { label: 'Karamel',  hex: '#d98a2b', hi: '#f0ad55', lo: '#b56a12' },
    lavender: { label: 'Lavanta',  hex: '#a98be0', hi: '#c8b2f3', lo: '#8466c4' },
  };

  // Level themes. palette = colours in order of appearance (a level with N
  // colours uses the first N). Art files get a `_<theme>` suffix when the theme
  // has its own (assets.js), e.g. mixer_coffee.png.
  const THEMES = {
    cocktail: { palette: ['pink', 'orange', 'purple', 'lime'], prepTag: 'HAZIRLIK',
      hint: 'Şişeden bardağa dök, tarifi alttan üste kur!' },
    coffee:   { palette: ['espresso', 'milk', 'caramel', 'lavender'], prepTag: 'FİNCANLAR',
      hint: 'Şişeden fincana dök, kahveyi alttan üste kur!' },
  };

  function tierFor(levelOrder) {
    let t = PROGRESSION[0];
    for (const p of PROGRESSION) if (p.from <= levelOrder) t = p;
    return t;
  }

  const api = { PROGRESSION, COMMON, COLORS, THEMES, tierFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FlowProgression = api;
})(this);
