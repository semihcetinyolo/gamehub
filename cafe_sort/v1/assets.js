// Art hook-up. Drop PNGs from assets/ASTRA_PROMPTS.md into assets/img/ with
// these exact names; anything missing falls back to the built-in drawings.
(function (root) {
  const DIR = 'v1/assets/img/';
  const CUSTOMERS = 12;   // customer_01 ... customer_12 (assets/ASTRA_PROMPTS.md)

  // bottle.png is drawn on a 400x860 canvas (assets/wireframes/07_bottle_template.png).
  // `liquid` is the inside of the glass the layers fill, in that canvas' pixels.
  // If a generated bottle comes out slightly different, tune these numbers and
  // check with index.html?calib=1 (draws the liquid box over every bottle).
  const BOTTLE = {
    w: 400, h: 860,
    liquid: { x: 58, y: 262, w: 284, h: 570, r: 38 },
    // Keep liquid above each generated vessel's glass base / metal band.
    liquidByAsset: {
      'bottle_coffee.png': { x: 58, y: 262, w: 284, h: 546, r: 38 },
      'mixer.png': { x: 58, y: 262, w: 284, h: 546, r: 38 },
      'mixer_cocktail.png': { x: 62, y: 200, w: 276, h: 546, r: 38 },
      'mixer_cocktail_gold.png': { x: 66, y: 190, w: 268, h: 530, r: 34 },
      'mixer_coffee.png': { x: 62, y: 200, w: 276, h: 546, r: 38 },
    },
  };

  const FILES = {
    bg: 'bg_cafe.png',
    bottle: 'bottle.png',
    bottleOverlay: 'bottle_overlay.png',
    mixer: 'mixer_cocktail_gold.png', // gold-mounted preparation glass, also used in orders
    // coffee levels (fall back to the cocktail art when missing)
    bg_coffee: 'bg_coffee.png',
    bottle_coffee: 'bottle_coffee.png',
    mixer_coffee: 'mixer_coffee.png',
    heartFull: 'heart_full.png',
    heartEmpty: 'heart_empty.png',
    clock: 'clock.png',
    coin: 'coin.png',
    check: 'check_badge.png',
    pause: 'icon_pause.png',
    winArt: 'win_art.png',
    loseArt: 'lose_art.png',
  };
  for (let i = 1; i <= CUSTOMERS; i++) {
    const n = String(i).padStart(2, '0');
    FILES[`c${i}`] = `customer_${n}.png`;
    FILES[`c${i}_happy`] = `customer_${n}_happy.png`;
    FILES[`c${i}_sad`] = `customer_${n}_sad.png`;
  }

  const ok = {};
  function load(timeoutMs) {
    const jobs = Object.entries(FILES).map(([k, f]) => new Promise(res => {
      const img = new Image();
      img.onload = () => { ok[k] = DIR + f; res(); };
      img.onerror = () => res();
      img.src = DIR + f;
    }));
    return Promise.race([Promise.all(jobs), new Promise(r => setTimeout(r, timeoutMs || 2500))]);
  }

  // URL of a loaded asset, or null. Customer moods fall back to the idle face.
  function url(k) { return ok[k] || null; }
  // The theme's own version of an asset (e.g. mixer_coffee), else the default.
  function themed(k, theme) { return (theme && theme !== 'cocktail' && ok[`${k}_${theme}`]) || ok[k] || null; }
  // Customer looks the game may use: the ones with art once any art exists,
  // otherwise the 6 built-in drawings.
  function customerPool() {
    const withArt = [];
    for (let i = 1; i <= CUSTOMERS; i++) if (ok[`c${i}`]) withArt.push(i);
    return withArt.length ? withArt : [1, 2, 3, 4, 5, 6];
  }
  function customer(i, mood) {
    return (mood && ok[`c${i}_${mood}`]) || ok[`c${i}`] || null;
  }

  root.CocktailAssets = { load, url, themed, customer, customerPool, FILES, BOTTLE, CUSTOMERS, DIR };
})(this);
