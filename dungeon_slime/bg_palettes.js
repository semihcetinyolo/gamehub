// Floor (background tile) palettes for Jelly Squish: two-tone checkerboards. Shared by
// index.html (?bg=<id>) and bg_variants.html. One tile = one unit = THINNEST Jöli's short side;
// purely decorative.
//   close / mid / far: one colour family, the second tone a little / more / much darker
//   pair:              two different light colours
(function (root) {
  const FAMILIES = [
    ['peach', 'Şeftali', '#fff3e4'], ['cream', 'Krem', '#fff8ec'], ['rose', 'Gül', '#fff0f3'],
    ['coral', 'Mercan', '#fff1ec'], ['blush', 'Allık', '#fdf0f6'], ['lilac', 'Leylak', '#faf0fb'],
    ['lavender', 'Lavanta', '#f5f1fc'], ['periwinkle', 'Mürdüm mavi', '#f0f2fd'], ['sky', 'Gök', '#f1f8fd'],
    ['aqua', 'Su', '#eefbfb'], ['mint', 'Nane', '#eefaf4'], ['sage', 'Adaçayı', '#f2f7ee'],
    ['lemon', 'Limon', '#fffbe6'], ['butter', 'Tereyağı', '#fff8e0'], ['sand', 'Kum', '#f9f3ea'],
    ['stone', 'Taş', '#f2f3f6'],
  ];
  const LEVELS = [['close', 'Çok yakın tonlar', 3], ['mid', 'Orta kontrast', 7], ['far', 'Yüksek kontrast', 13]];
  const PAIRS = [
    ['peach', 'mint'], ['lavender', 'sky'], ['lemon', 'rose'], ['mint', 'lilac'], ['sky', 'peach'],
    ['cream', 'aqua'], ['blush', 'periwinkle'], ['sage', 'butter'], ['coral', 'lavender'], ['stone', 'sky'],
  ];

  // hex <-> hsl, and a "darker by d lightness points" tone of the same hue
  function hexToHsl(hex) {
    const n = parseInt(hex.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    if (mx === mn) return [0, 0, l * 100];
    const d = mx - mn, s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
    const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s * 100, l * 100];
  }
  function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = n => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
    return '#' + [f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, '0')).join('');
  }
  function darker(hex, d) { const [h, s, l] = hexToHsl(hex); return hslToHex(h, Math.min(100, s + d * 1.5), Math.max(0, l - d)); }

  const PALETTES = [];
  for (const [lv, , d] of LEVELS) for (const [id, name, base] of FAMILIES)
    PALETTES.push({ id: `checker-${id}-${lv}`, group: lv, name, colors: [base, darker(base, d)] });
  const fam = Object.fromEntries(FAMILIES.map(([id, name, base]) => [id, { name, base }]));
  for (const [a, b] of PAIRS)
    PALETTES.push({ id: `pair-${a}-${b}`, group: 'pair', name: `${fam[a].name} + ${fam[b].name}`, colors: [fam[a].base, darker(fam[b].base, 2)] });
  // the game's previous floor (kept so old ?bg= links still work)
  PALETTES.push({ id: 'checker-peach', group: 'current', name: 'Şeftali (eski)', colors: ['#fff3e4', '#fcede0'] });

  const GROUPS = [
    { id: 'current', title: 'Eski zemin' },
    ...LEVELS.map(([id, title]) => ({ id, title })),
    { id: 'pair', title: 'İki farklı renk' },
  ];
  const DEFAULT = 'checker-lilac-close';
  const byId = id => PALETTES.find(p => p.id === id) || PALETTES.find(p => p.id === DEFAULT);

  // Paint the floor tile at (x, y) with tile size T (context already translated to the map).
  function drawFloor(ctx, pal, x, y, T) {
    ctx.fillStyle = pal.colors[(x + y) % 2];
    ctx.fillRect(x * T, y * T, T + .5, T + .5);
  }

  const api = { PALETTES, GROUPS, DEFAULT, byId, drawFloor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JellyBG = api;
})(this);
