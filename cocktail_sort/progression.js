// Progression defaults + colour palette. Hand-edited.
// A level in levels.js may omit any field; the tier whose `from` is the last one
// <= levelOrder fills it in. Fields a level sets itself always win.
(function (root) {
  const PROGRESSION = [
    // from = first levelOrder of the tier. bottleCount includes the mixer (the
    // preparation vessel in the top middle). freeUnits = empty layer slots in
    // the normal bottles at the start; refillCount = mixed full batches that
    // refill normal bottles as they run empty. The orders use up exactly the
    // starting liquid + the refills. colorCount / freeUnits / refillCount are
    // generator inputs (tools/gen.js). Customer patience is fitted per level
    // by tools/gen.js; customerPatienceSeconds here is only a fallback.
    { from: 0,  bottleCount: 6,  freeUnits: 4, refillCount: 2, colorCount: 2, customerPatienceSeconds: 60 },
    { from: 2,  bottleCount: 6,  freeUnits: 4, refillCount: 2, colorCount: 3, customerPatienceSeconds: 60 },
    { from: 5,  bottleCount: 7,  freeUnits: 4, refillCount: 2, colorCount: 3, customerPatienceSeconds: 60 },
    { from: 15, bottleCount: 8,  freeUnits: 4, refillCount: 2, colorCount: 3, customerPatienceSeconds: 60 },
    { from: 30, bottleCount: 10, freeUnits: 4, refillCount: 2, colorCount: 4, customerPatienceSeconds: 60 },
  ];

  const COMMON = { bottleCapacity: 4, maxActiveCustomers: 3, startingHearts: 3 };

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
    milk:     { label: 'Süt',      hex: '#d9edf7', hi: '#ffffff', lo: '#8eafc4' },
    caramel:  { label: 'Karamel',  hex: '#d98a2b', hi: '#f0ad55', lo: '#b56a12' },
    lavender: { label: 'Lavanta',  hex: '#a98be0', hi: '#c8b2f3', lo: '#8466c4' },
  };

  // Level themes. palette = colours in order of appearance (a level with N
  // colours uses the first N). Art files get a `_<theme>` suffix when the theme
  // has its own (assets.js), e.g. mixer_coffee.png.
  const THEMES = {
    cocktail: { palette: ['pink', 'orange', 'purple', 'lime'], mixerTag: 'KAP',
      hint: 'Tarifi ortadaki kapta alttan üste kur!' },
    coffee:   { palette: ['espresso', 'milk', 'caramel', 'lavender'], mixerTag: 'FİNCAN',
      hint: 'Kahveyi ortadaki fincanda alttan üste kur!' },
  };

  function tierFor(levelOrder) {
    let t = PROGRESSION[0];
    for (const p of PROGRESSION) if (p.from <= levelOrder) t = p;
    return t;
  }

  const api = { PROGRESSION, COMMON, COLORS, THEMES, tierFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CocktailProgression = api;
})(this);
