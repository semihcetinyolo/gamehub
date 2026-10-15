// Art hook-up (customers, icons, mixer glass from ../cocktail_flow). The belt and
// the fruits are drawn in SVG by game.js. Anything missing falls back to built-in drawings.
(function (root) {
  const DIR = 'assets/img/';
  const CUSTOMERS = 12;   // customer_01 ... customer_12

  // mixer.png (order glass) is drawn on a 400x860 canvas; `liquid` is the inside
  // the layers fill, in that canvas' pixels.
  const GLASS = { w: 400, h: 860, liquid: { x: 58, y: 262, w: 284, h: 546, r: 38 } };

  const FILES = {
    bg: 'bg_cafe.png',
    mixer: 'mixer.png',
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

  function url(k) { return ok[k] || null; }
  function customerPool() {
    const withArt = [];
    for (let i = 1; i <= CUSTOMERS; i++) if (ok[`c${i}`]) withArt.push(i);
    return withArt.length ? withArt : [1, 2, 3, 4, 5, 6];
  }
  function customer(i, mood) { return (mood && ok[`c${i}_${mood}`]) || ok[`c${i}`] || null; }

  root.BeltAssets = { load, url, customer, customerPool, FILES, GLASS, CUSTOMERS, DIR };
})(this);
