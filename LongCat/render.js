// Long Dog — board drawing. The static board is baked once per level/size into an offscreen
// canvas; each frame only blits it and draws the paw dots, the dog (dog.js) and short-lived effects.
//
// Depth: instead of per-level drop shadows, the board uses the UI's own button language —
// a flat top face and a darker lip below it. Walls are a raised slab, floor is cut into it,
// and each wall shows its front face on the floor cell below. One light direction, everywhere.
// `depth: 'flat'` turns the lips off (Settings → Derinlik) so both can be compared.
(function () {
  const PAL = {
    slabTop: '#8fa3ef', slabHi: '#a9b9f6', slabLip: '#4e5fb8', slabFace: '#6577d0', shadow: 'rgba(10,16,48,.35)',
    floor: '#fff1d9', floor2: '#fbe7c6', paw: '#ecd0a2', floorEdge: '#e8cfa6',
    ink: '#3d1c0b', hint: '#ffdf6b',
  };

  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

  const fallbackTheme = { name: 'Lavanta', top: PAL.slabTop, hi: PAL.slabHi, edge: '#c3d0ff', outer: ['#7d8fdb', '#5d6dc0', '#435398'], face: ['#8799e4', '#7183ce', '#5263a9'], side: '#7687ca' };
  const themes = (window.BOARD_ART || {}).themes || [{ ...fallbackTheme, src: (window.BOARD_ART || {}).wall }];
  const wallTextures = [];
  function wallTheme(levelIndex = 0) { return themes[((levelIndex % themes.length) + themes.length) % themes.length]; }
  function load() {
    return Promise.all(themes.map(({ src }, index) => new Promise(resolve => {
      if (!src) { resolve(); return; }
      const im = new Image();
      im.onload = () => { wallTextures[index] = im; resolve(); };
      im.onerror = () => { console.warn('wall art missing:', src); resolve(); };
      im.src = src;
    })));
  }

  // ---------- board ----------
  function layout(L, cssW, cssH, maxCell = 62) {
    const m = 0.62; // wall margin around the floor, in cells
    const cell = Math.floor(Math.min(maxCell, cssW / (L.W + 2 * m + 0.4), cssH / (L.H + 2 * m + 0.6)));
    const bw = (L.W + 2 * m) * cell, bh = (L.H + 2 * m) * cell;
    const ox = Math.round((cssW - bw) / 2 + m * cell), oy = Math.round((cssH - bh) / 2 + m * cell - cell * 0.12);
    return { cell, ox, oy, m, cssW, cssH };
  }

  function bakeBoard(L, lay, dpr, depth, levelIndex = 0) {
    const theme = wallTheme(levelIndex), wallTexture = wallTextures[((levelIndex % themes.length) + themes.length) % themes.length];
    const { cell: c, ox, oy, m } = lay, deep = depth !== 'flat';
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(lay.cssW * dpr); cv.height = Math.ceil(lay.cssH * dpr);
    const g = cv.getContext('2d'); g.scale(dpr, dpr);
    const open = (x, y) => x >= 0 && y >= 0 && x < L.W && y < L.H && L.open[y * L.W + x] === 1;
    const sx = ox - m * c, sy = oy - m * c, sw = (L.W + 2 * m) * c, sh = (L.H + 2 * m) * c, R = c * 0.55;
    const lip = deep ? c * 0.25 : 0;
    // slab
    if (deep) { g.fillStyle = PAL.shadow; g.filter = `blur(${c * 0.25}px)`; rr(g, sx + c * 0.1, sy + c * 0.35, sw - c * 0.2, sh, R); g.fill(); g.filter = 'none'; }
    const outerFace = g.createLinearGradient(0, sy + sh - c, 0, sy + sh + lip);
    outerFace.addColorStop(0, theme.outer[0]); outerFace.addColorStop(.7, theme.outer[1]); outerFace.addColorStop(1, theme.outer[2]);
    g.fillStyle = outerFace; rr(g, sx, sy + lip, sw, sh, R); g.fill();
    g.fillStyle = theme.top; rr(g, sx, sy, sw, sh, R); g.fill();
    if (wallTexture) {
      g.save(); rr(g, sx, sy, sw, sh, R); g.clip();
      g.globalAlpha = .85; g.drawImage(wallTexture, sx, sy, sw, sh); g.restore();
    }
    if (deep) { g.strokeStyle = theme.hi; g.lineWidth = c * 0.06; rr(g, sx + c * 0.05, sy + c * 0.05, sw - c * 0.1, sh - c * 0.1, R * 0.9); g.stroke(); }

    // floor: every open cell, convex corners rounded
    const r = c * 0.28;
    for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) {
      if (!open(x, y)) continue;
      const px = ox + x * c, py = oy + y * c;
      const N = open(x, y - 1), S = open(x, y + 1), W = open(x - 1, y), E = open(x + 1, y);
      const radii = [!N && !W ? r : 0, !N && !E ? r : 0, !S && !E ? r : 0, !S && !W ? r : 0];
      g.fillStyle = (x + y) % 2 ? PAL.floor2 : PAL.floor;
      g.beginPath(); g.roundRect(px - 0.5, py - 0.5, c + 1, c + 1, radii); g.fill();
      // wall front face falling onto this cell
      if (deep) {
        g.save(); g.beginPath(); g.roundRect(px - 0.5, py - 0.5, c + 1, c + 1, radii); g.clip();
        if (!N) {
          const face = g.createLinearGradient(0, py, 0, py + lip);
          face.addColorStop(0, theme.face[0]); face.addColorStop(.2, theme.face[1]); face.addColorStop(1, theme.face[2]);
          g.fillStyle = face; g.fillRect(px - 1, py - 1, c + 2, lip + 1);
          g.fillStyle = theme.edge; g.fillRect(px - 1, py, c + 2, c * .035);
          const shade = g.createLinearGradient(0, py + lip, 0, py + lip + c * .16);
          shade.addColorStop(0, 'rgba(60,48,72,.25)'); shade.addColorStop(1, 'rgba(60,48,72,0)');
          g.fillStyle = shade; g.fillRect(px - 1, py + lip, c + 2, c * .16);
        }
        if (!W) {
          const side = g.createLinearGradient(px, 0, px + c * .12, 0);
          side.addColorStop(0, theme.side); side.addColorStop(.4, 'rgba(66,57,48,.22)'); side.addColorStop(1, 'rgba(66,57,48,0)');
          g.fillStyle = side; g.fillRect(px, py, c * .12, c);
        }
        if (!E) { g.fillStyle = 'rgba(71,64,97,.15)'; g.fillRect(px + c * .965, py, c * .035, c); }
        if (!S) { g.fillStyle = 'rgba(64,62,111,.28)'; g.fillRect(px, py + c * .95, c, c * .05); }
        g.restore();
      }
    }
    // rounded wall corners poking into the floor (fillets)
    for (let y = 0; y <= L.H; y++) for (let x = 0; x <= L.W; x++) {
      // corner point between cells (x-1,y-1) (x,y-1) (x-1,y) (x,y)
      const a = open(x - 1, y - 1), b = open(x, y - 1), d = open(x - 1, y), e = open(x, y);
      const n = a + b + d + e; if (n !== 3) continue;
      const px = ox + x * c, py = oy + y * c, f = c * 0.22;
      // the wall cell's corner sits at (px,py); pull floor over it and redraw the wall as a quarter disc
      const wx = !a ? -1 : !b ? 1 : !d ? -1 : 1, wy = !a ? -1 : !b ? -1 : !d ? 1 : 1;
      if (deep && wy < 0) continue; // a wall above keeps its square front face
      const wcx = x + (wx < 0 ? -1 : 0), wcy = y + (wy < 0 ? -1 : 0);
      g.fillStyle = (wcx + wcy + 1) % 2 ? PAL.floor2 : PAL.floor;
      g.fillRect(wx < 0 ? px - f : px, wy < 0 ? py - f : py, f, f);
      g.fillStyle = theme.top; g.beginPath(); g.arc(px + wx * f, py + wy * f, f, 0, Math.PI * 2); g.fill();
    }
    return cv;
  }

  function paw(g, x, y, s, col) {
    g.fillStyle = col;
    g.beginPath(); g.ellipse(x, y + s * 0.18, s * 0.26, s * 0.21, 0, 0, Math.PI * 2); g.fill();
    for (const [dx, dy] of [[-0.27, -0.12], [-0.1, -0.3], [0.1, -0.3], [0.27, -0.12]]) {
      g.beginPath(); g.arc(x + dx * s, y + dy * s, s * 0.1, 0, Math.PI * 2); g.fill();
    }
  }

  function arrow(g, x, y, dir, c, t) {
    const [dx, dy] = dir, k = 0.5 + 0.5 * Math.sin(t * 8);
    g.save(); g.translate(x + dx * c * (0.95 + k * 0.2), y + dy * c * (0.95 + k * 0.2)); g.rotate(Math.atan2(dy, dx));
    g.fillStyle = PAL.hint; g.strokeStyle = PAL.ink; g.lineWidth = c * 0.06; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(c * 0.32, 0); g.lineTo(-c * 0.08, -c * 0.3); g.lineTo(-c * 0.08, -c * 0.12); g.lineTo(-c * 0.3, -c * 0.12);
    g.lineTo(-c * 0.3, c * 0.12); g.lineTo(-c * 0.08, c * 0.12); g.lineTo(-c * 0.08, c * 0.3); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }

  window.LongCatRender = { PAL, load, layout, bakeBoard, paw, arrow, wallTheme };
})();
