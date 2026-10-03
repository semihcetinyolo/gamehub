(function () {
  'use strict';

  const E = window.CartoEngine;
  const NS = 'http://www.w3.org/2000/svg';
  // Unpainted panes are pale paper; levels with white or cream glass get a darker paper so a
  // painted light pane never looks empty.
  const PAPER = '#efeddc', PAPER_DARK = '#c9c5ad';
  let EMPTY = PAPER;
  let PALETTE = [];
  const START_HINTS = 3;
  const DOUBLE_MS = 300;

  const $ = id => document.getElementById(id);
  const svg = $('board');
  const store = {
    get(k, d) { try { const v = localStorage.getItem('carto.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('carto.' + k, JSON.stringify(v)); } catch { /* private mode */ } },
  };
  // 3D is the default look (user, 2026-10-03); a choice saved before that is reset once.
  if (store.get('boardLookVersion', 0) < 1) {
    try { localStorage.removeItem('carto.boardLook'); } catch { /* private mode */ }
    store.set('boardLookVersion', 1);
  }
  let boardLook = store.get('boardLook', '3d') === 'classic' ? 'classic' : '3d';
  $('app').dataset.boardLook = boardLook;

  // One way to play: pick a colour at the bottom, tap a pane = note, double tap = paint.
  // No hearts: anything can be painted; a full board is either the panel or shows its clashes.
  const S = {
    level: store.get('level', 1),
    sound: store.get('sound', true),
    puzzle: null, given: [], fill: [], marks: [], color: 0,
    hints: START_HINTS, done: false,
  };
  let lastTap = null;
  let layers = {};
  let regionEls = [];

  // ---------- audio ----------
  let ac = null;
  function tone(freq, dur, type, vol, slide) {
    if (!S.sound) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, ac.currentTime);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, ac.currentTime + dur);
      g.gain.setValueAtTime(vol || 0.12, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
      o.connect(g).connect(ac.destination);
      o.start(); o.stop(ac.currentTime + dur);
    } catch { /* audio unavailable */ }
  }
  const sfx = {
    dot: () => tone(880, 0.07, 'sine', 0.07),
    undot: () => tone(620, 0.07, 'sine', 0.06),
    paint: () => { tone(420, 0.16, 'triangle', 0.12, 700); },
    erase: () => tone(500, 0.12, 'triangle', 0.08, 300),
    select: () => tone(300, 0.06, 'square', 0.035),
    bad: () => { tone(180, 0.22, 'sawtooth', 0.07, 120); },
    hint: () => { tone(660, 0.12, 'sine', 0.1); setTimeout(() => tone(990, 0.18, 'sine', 0.1), 90); },
    win: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'triangle', 0.12), i * 110)),
  };
  const buzz = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch { /* unsupported */ } };

  // ---------- svg helpers ----------
  function el(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  const fmt = v => +v.toFixed(3);
  const edgesPath = edges => edges.map(e => `M${e[0]} ${e[1]}L${e[2]} ${e[3]}`).join('');

  function buildBoard() {
    const { map } = S.puzzle;
    svg.innerHTML = '';
    svg.setAttribute('viewBox', `0 0 ${map.cols} ${map.rows}`);
    const defs = el('defs', {}, svg);
    layers.depth = null;
    layers.surface = el('g', { id: 'boardSurface' }, svg);
    $('boardCard').classList.add('shaped');
    const clip = el('clipPath', { id: 'boardShape', clipPathUnits: 'userSpaceOnUse' }, defs);
    el('path', { d: map.shape }, clip);
    layers.surface.setAttribute('clip-path', 'url(#boardShape)');
    const gRegions = el('g', {}, layers.surface);
    regionEls = [];
    for (let r = 0; r < map.count; r++) {
      const g = el('g', { class: 'region', 'data-r': r, tabindex: 0, role: 'button', 'aria-label': `Bölge ${r + 1}` }, gRegions);
      const path = el('path', { class: 'fill', d: map.paths[r], fill: EMPTY, stroke: EMPTY, 'stroke-width': 0.04, 'stroke-linejoin': 'round' }, g);
      regionEls.push({ g, path });
    }
    // Pre-painted panes carry thin diagonal stripes in a darker tone of their own colour;
    // the player's paint is plain.
    PALETTE.forEach((p, i) => {
      const pat = el('pattern', { id: 'stripes' + i, width: 0.24, height: 0.24, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
      el('rect', { width: 0.065, height: 0.24, fill: shade(p.base, -0.2) }, pat);
    });
    layers.fixed = el('g', { 'pointer-events': 'none' }, layers.surface);
    for (let r = 0; r < map.count; r++) {
      if (S.given[r] >= 0) el('path', { class: 'fixed-stripes', d: map.paths[r], fill: `url(#stripes${S.given[r]})` }, layers.fixed);
    }
    layers.wrong = el('g', { 'pointer-events': 'none' }, layers.surface);
    layers.hint = el('g', { 'pointer-events': 'none', 'aria-hidden': 'true' }, layers.surface);
    el('path', {
      class: 'board-seams', d: map.edgePath, fill: 'none', stroke: '#3a4234', 'stroke-width': 1.9,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none',
    }, layers.surface);
    el('path', {
      class: 'board-rim', d: map.shape, fill: 'none', stroke: '#3a4234',
      'stroke-width': 3.5, 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none',
    }, layers.surface);
    layers.conflict = el('path', {
      fill: 'none', stroke: '#e2343f', 'stroke-width': 5, 'stroke-linecap': 'round',
      'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none', class: 'conflict', d: '',
    }, layers.surface);
    layers.dots = el('g', { 'pointer-events': 'none' }, layers.surface);
    layers.coach = el('g', { 'pointer-events': 'none' }, layers.surface);
    dotCache = [];
    if (boardLook === '3d') buildDepth();
    fitBoard();
  }

  // Reuse the playable paths: lighting never changes geometry or hit targets.
  function buildDepth() {
    if (layers.depth) return;
    const defs = svg.querySelector('defs'), { map } = S.puzzle;
    [EMPTY, ...PALETTE.map(p => p.base)].forEach((color, i) => {
      const gradient = el('linearGradient', { id: 'tileColor' + i, x1: '0%', y1: '0%', x2: '75%', y2: '100%' }, defs);
      [[0, shade(color, .22)], [.35, shade(color, .05)], [.7, color], [1, shade(color, -.18)]].forEach(([offset, value]) => {
        el('stop', { offset, 'stop-color': value }, gradient);
      });
    });
    const glaze = el('linearGradient', { id: 'tileGlaze', x1: '0%', y1: '0%', x2: '65%', y2: '100%' }, defs);
    [[0, .22], [.28, .04], [.48, .1], [.65, 0], [1, 0]].forEach(([offset, opacity]) => {
      el('stop', { offset, 'stop-color': '#fff', 'stop-opacity': opacity }, glaze);
    });
    // Inset highlights and shadows follow each pane, including concave outlines.
    const bevel = el('filter', { id: 'tileBevel', x: '-10%', y: '-10%', width: '120%', height: '120%', 'color-interpolation-filters': 'sRGB' }, defs);
    el('feOffset', { in: 'SourceAlpha', dx: .065, dy: .075, result: 'down' }, bevel);
    el('feComposite', { in: 'SourceAlpha', in2: 'down', operator: 'out', result: 'topEdge' }, bevel);
    el('feGaussianBlur', { in: 'topEdge', stdDeviation: .025, result: 'topSoft' }, bevel);
    el('feFlood', { 'flood-color': '#fff9de', 'flood-opacity': .85, result: 'light' }, bevel);
    el('feComposite', { in: 'light', in2: 'topSoft', operator: 'in', result: 'highlight' }, bevel);
    el('feOffset', { in: 'SourceAlpha', dx: -.075, dy: -.1, result: 'up' }, bevel);
    el('feComposite', { in: 'SourceAlpha', in2: 'up', operator: 'out', result: 'bottomEdge' }, bevel);
    el('feGaussianBlur', { in: 'bottomEdge', stdDeviation: .035, result: 'bottomSoft' }, bevel);
    el('feFlood', { 'flood-color': '#15201d', 'flood-opacity': .7, result: 'shade' }, bevel);
    el('feComposite', { in: 'shade', in2: 'bottomSoft', operator: 'in', result: 'shadow' }, bevel);
    const merge = el('feMerge', {}, bevel);
    el('feMergeNode', { in: 'shadow' }, merge);
    el('feMergeNode', { in: 'highlight' }, merge);
    layers.depth = el('g', { class: 'tile-depth', 'pointer-events': 'none', 'aria-hidden': 'true' });
    layers.surface.insertBefore(layers.depth, layers.wrong);
    for (const d of map.paths) {
      el('path', { d, fill: 'url(#tileGlaze)' }, layers.depth);
      el('path', { d, fill: '#fff', filter: 'url(#tileBevel)' }, layers.depth);
    }
  }

  function panePaint(c) {
    return boardLook === '3d' ? `url(#tileColor${c + 1})` : c < 0 ? EMPTY : PALETTE[c].base;
  }

  function setBoardLook(value) {
    boardLook = value === '3d' ? '3d' : 'classic';
    store.set('boardLook', boardLook);
    $('app').dataset.boardLook = boardLook;
    clearHint();
    if (boardLook === '3d') buildDepth();
    render();
  }

  function fitBoard() {
    if (!S.puzzle) return;
    const { cols, rows } = S.puzzle.map;
    const stage = $('stage').getBoundingClientRect();
    const pad = parseFloat(getComputedStyle($('boardCard')).paddingLeft) * 2;
    const stageStyle = getComputedStyle($('stage'));
    const availW = stage.width - parseFloat(stageStyle.paddingLeft) - parseFloat(stageStyle.paddingRight) - pad;
    const availH = stage.height - parseFloat(stageStyle.paddingTop) - parseFloat(stageStyle.paddingBottom) - pad;
    const cell = Math.max(10, Math.min(availW / cols, availH / rows));
    svg.style.width = Math.floor(cell * cols) + 'px';
    svg.style.height = Math.floor(cell * rows) + 'px';
    setZoom(1, 0, 0);
  }

  // Pencil dots: each mark count gets its own layout over the whole region —
  // 1 colour: hex grid, 2: checkerboard square grid, 3 and 4: hex grid with an even colour cycle.
  const HEX_STEP = 0.3, SQ_STEP = 0.28, DOT_R = 0.065, DOT_MARGIN = 0.1;
  let dotCache = [];

  function regionGeom(r) {
    const outline = S.puzzle.map.outlines[r];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of outline) {
      x0 = Math.min(x0, s[0], s[2]); x1 = Math.max(x1, s[0], s[2]);
      y0 = Math.min(y0, s[1], s[3]); y1 = Math.max(y1, s[1], s[3]);
    }
    return { outline, box: [x0, y0, x1, y1] };
  }
  function insideRegion(map, outline, x, y) {
    if (x <= 0 || y <= 0 || x >= map.cols || y >= map.rows) return false;
    let inside = false;
    for (const [ax, ay, bx, by] of outline) {
      if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
    }
    if (!inside) return false;
    for (const s of outline) {
      const dx = s[2] - s[0], dy = s[3] - s[1];
      const t = Math.max(0, Math.min(1, ((x - s[0]) * dx + (y - s[1]) * dy) / (dx * dx + dy * dy)));
      if (Math.hypot(x - s[0] - t * dx, y - s[1] - t * dy) < DOT_MARGIN) return false;
    }
    return true;
  }
  // Lattice points [x, y, i, j] inside region r; the origin offset that fits the most dots wins.
  function layoutDots(r, kind) {
    dotCache[r] = dotCache[r] || {};
    if (dotCache[r][kind]) return dotCache[r][kind];
    const map = S.puzzle.map;
    const { outline, box } = regionGeom(r);
    const hex = kind === 'hex';
    const ax = hex ? HEX_STEP : SQ_STEP, ay = hex ? HEX_STEP * Math.sqrt(3) / 2 : SQ_STEP;
    const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2;
    let best = [];
    for (let oy = 0; oy < 4; oy++) {
      for (let ox = 0; ox < 4; ox++) {
        const x0 = cx + (ox / 4) * ax, y0 = cy + (oy / 4) * ay;
        const pts = [];
        const jMin = Math.floor((box[1] - y0) / ay) - 1, jMax = Math.ceil((box[3] - y0) / ay) + 1;
        for (let j = jMin; j <= jMax; j++) {
          const y = y0 + j * ay;
          const shift = hex ? j * ax / 2 : 0;
          const iMin = Math.floor((box[0] - x0 - shift) / ax) - 1, iMax = Math.ceil((box[2] - x0 - shift) / ax) + 1;
          for (let i = iMin; i <= iMax; i++) {
            const x = x0 + shift + i * ax;
            if (insideRegion(map, outline, x, y)) pts.push([fmt(x), fmt(y), i, j]);
          }
        }
        if (pts.length > best.length) best = pts;
      }
    }
    if (!best.length) {
      const [x, y] = map.anchors[r];
      best = [[fmt(x), fmt(y), 0, 0]];
    }
    return (dotCache[r][kind] = best);
  }
  const m3 = v => ((v % 3) + 3) % 3;
  function dotsFor(r, mask) {
    const cols = [];
    for (let c = 0; c < PALETTE.length; c++) if (mask & (1 << c)) cols.push(c);
    const n = cols.length;
    const pts = layoutDots(r, n === 2 ? 'square' : 'hex');
    const pick = n === 1 ? () => cols[0]
      : n === 2 ? (i, j) => cols[(i + j) & 1]
      : n === 3 ? (i, j) => cols[m3(i - j)]
      : (i, j) => cols[(i & 1) + 2 * (j & 1)];
    let out = pts.map(([x, y, i, j]) => [x, y, pick(i, j)]);
    // Tiny regions: make sure every marked colour still shows at least once.
    const missing = cols.filter(c => !out.some(d => d[2] === c));
    if (missing.length) {
      const [ax, ay] = S.puzzle.map.anchors[r];
      out = cols.map((c, k) => [fmt(ax + (k - (n - 1) / 2) * 0.16), fmt(ay), c]);
    }
    return out;
  }

  // ---------- render ----------
  function render(pop) {
    const { map } = S.puzzle;
    for (let r = 0; r < map.count; r++) {
      const c = S.fill[r];
      const paint = panePaint(c);
      regionEls[r].path.setAttribute('fill', paint);
      regionEls[r].path.setAttribute('stroke', paint);
    }
    layers.dots.innerHTML = '';
    for (let r = 0; r < map.count; r++) {
      if (S.fill[r] >= 0 || !S.marks[r]) continue;
      const fresh = pop && pop.r === r;
      const g = el('g', fresh ? { class: 'dots-pop' } : {}, layers.dots);
      for (const [x, y, c] of dotsFor(r, S.marks[r])) {
        const dot = el('circle', { cx: x, cy: y, r: DOT_R, fill: PALETTE[c].base, stroke: PALETTE[c].dark, 'stroke-width': 0.02 }, g);
        if (fresh) dot.style.animationDelay = Math.min(260, Math.hypot(x - pop.x, y - pop.y) * 70) + 'ms';
      }
    }
    showMistakes();
    const filled = S.fill.filter(c => c >= 0).length;
    $('progress').textContent = `${filled}/${map.count}`;
    $('levelPill').textContent = 'SEVİYE ' + S.level;
    const badge = $('hintBadge');
    badge.textContent = S.hints > 0 ? S.hints : '+';
    badge.classList.toggle('plus', S.hints <= 0);
  }

  const popcount = m => { let c = 0; while (m) { c += m & 1; m >>= 1; } return c; };
  const clashEdges = () => S.puzzle.map.edges.filter(e => S.fill[e[4]] >= 0 && S.fill[e[4]] === S.fill[e[5]]);

  // A full board that isn't the panel: red borders on every clash and the clashing panes pulse.
  function showMistakes() {
    const full = S.fill.every(c => c >= 0);
    const clashes = full && !S.done ? clashEdges() : [];
    layers.conflict.setAttribute('d', edgesPath(clashes));
    layers.wrong.innerHTML = '';
    const { map } = S.puzzle;
    for (const r of new Set(clashes.flatMap(e => [e[4], e[5]]))) {
      if (S.given[r] >= 0) continue;
      el('path', { d: map.paths[r], class: 'wrong-pane' }, layers.wrong);
      el('path', {
        d: edgesPath(map.outlines[r]), fill: 'none', stroke: '#e2343f', 'stroke-width': 3,
        'stroke-dasharray': '6 4', 'vector-effect': 'non-scaling-stroke',
      }, layers.wrong);
      const [x, y] = map.anchors[r];
      const g = el('g', { class: 'wrong-mark', transform: `translate(${fmt(x)} ${fmt(y)})` }, layers.dots);
      el('circle', { r: 0.27, fill: '#e2343f', stroke: '#fff', 'stroke-width': 0.06 }, g);
      el('path', { d: 'M-.1-.1L.1.1M.1-.1L-.1.1', stroke: '#fff', 'stroke-width': 0.07, 'stroke-linecap': 'round' }, g);
    }
    return clashes;
  }

  function pulse(r, cls) {
    const g = regionEls[r].g;
    g.classList.remove(cls); void g.getBBox(); g.classList.add(cls);
    setTimeout(() => g.classList.remove(cls), 400);
  }

  function shakeBoard() {
    const b = $('boardCard');
    b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake');
  }

  let toastTimer = 0;
  function toast(msg, ms) {
    const t = $('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms || 1600);
  }

  // ---------- level ----------
  // Every level is a stained-glass panel (stained-levels.js); after the last one it starts over.
  const STAINED = window.CARTO_STAINED;
  const wrap = n => ((n - 1) % STAINED.length + STAINED.length) % STAINED.length + 1;
  let glassTimer = 0, glassImage = null;

  // Maps ship only shared edges + rim segments; each pane's outline is rebuilt here.
  function outlinesOf(map) {
    const out = Array.from({ length: map.count }, () => []);
    for (const [x1, y1, x2, y2, a, b] of map.edges) { out[a].push([x1, y1, x2, y2]); out[b].push([x1, y1, x2, y2]); }
    for (const [x1, y1, x2, y2, a] of map.rim) out[a].push([x1, y1, x2, y2]);
    return out;
  }

  function startLevel(n) {
    n = wrap(n);
    S.level = n;
    store.set('level', n);
    const glass = STAINED[n - 1];
    if (!glass.map.outlines) glass.map.outlines = outlinesOf(glass.map);
    setupPuzzle({ map: glass.map, given: glass.given, solution: glass.solution, glass });
    if (n === 1 && !store.get('tutorial', false)) startCoach();
  }

  const restartLevel = () => startLevel(S.level);
  function nextLevel() {
    const last = S.level === STAINED.length;
    startLevel(S.level + 1);
    if (last) toast('Bütün vitraylar tamam! Baştan başlıyor', 2400);
  }

  function setupPuzzle(puzzle) {
    clearTimeout(glassTimer);
    clearHint();
    endCoach(false);
    $('glassComplete').hidden = true;
    $('glassNext').disabled = true;
    $('glassNext').textContent = 'DEVAM';
    $('glassStatus').textContent = 'VİTRAY HAZIRLANIYOR';
    svg.removeAttribute('aria-busy');
    PALETTE = puzzle.glass.palette.map(base => ({ name: colorName(base), base, dark: shade(base, -.24) }));
    EMPTY = puzzle.glass.palette.some(c => luminance(c) > 0.7) ? PAPER_DARK : PAPER;
    glassImage = new Image();
    glassImage.src = puzzle.glass.image;
    $('dock').classList.remove('art-finished');
    $('dock').style.minHeight = '';
    $('mapRule').textContent = 'KOMŞU BÖLGELER, FARKLI RENKLER';
    S.puzzle = puzzle;
    S.given = puzzle.given.slice();
    S.fill = S.given.slice();
    S.marks = new Array(puzzle.map.count).fill(0);
    S.hints = S.level === 1 ? START_HINTS + 2 : START_HINTS;
    S.done = false;
    lastTap = null;
    $('boardCard').classList.remove('won', 'stained');
    $('zoomTools').hidden = false;
    buildBoard();
    render();
    renderBar();
  }

  // ---------- zoom ----------
  // Pinch (or the +/− buttons, or the mouse wheel) zooms the board up to 4×; one finger drags it
  // while zoomed. A gesture never counts as a tap.
  const MAX_ZOOM = 4;
  const Z = { z: 1, x: 0, y: 0 };
  const pointers = new Map();
  let gesture = null, quietUntil = 0;

  function setZoom(z, x, y) {
    z = Math.max(1, Math.min(MAX_ZOOM, z));
    const w = parseFloat(svg.style.width) || 0, h = parseFloat(svg.style.height) || 0;
    const mx = w * (z - 1) / 2, my = h * (z - 1) / 2;
    Z.z = z;
    Z.x = Math.max(-mx, Math.min(mx, x));
    Z.y = Math.max(-my, Math.min(my, y));
    svg.style.transform = z === 1 ? '' : `translate(${Z.x}px, ${Z.y}px) scale(${z})`;
    $('zoomOut').disabled = z <= 1;
    $('zoomIn').disabled = z >= MAX_ZOOM;
    $('stage').classList.toggle('zoomed', z > 1);
    placeCoach();
  }
  // Zoom by factor k keeping the client point (px, py) where it is.
  function zoomAt(k, px, py) {
    const r = svg.getBoundingClientRect();
    const cx = r.left + r.width / 2 - Z.x, cy = r.top + r.height / 2 - Z.y;
    const z1 = Math.max(1, Math.min(MAX_ZOOM, Z.z * k)), f = z1 / Z.z;
    setZoom(z1, (px - cx) - (px - cx - Z.x) * f, (py - cy) - (py - cy - Z.y) * f);
  }
  function zoomCentre(k) {
    const r = svg.getBoundingClientRect();
    zoomAt(k, r.left + r.width / 2, r.top + r.height / 2);
  }
  $('zoomIn').addEventListener('click', () => zoomCentre(1.6));
  $('zoomOut').addEventListener('click', () => zoomCentre(1 / 1.6));

  const stage = $('stage');
  stage.addEventListener('pointerdown', e => {
    if (e.target.closest('button')) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      gesture = { kind: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), z: Z.z, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      downAt = null;
    } else if (pointers.size === 1) {
      gesture = { kind: 'maybe-pan', x: e.clientX, y: e.clientY, ox: Z.x, oy: Z.y };
    }
  });
  stage.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!gesture) return;
    if (gesture.kind === 'pinch' && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      zoomAt(gesture.z * d / gesture.d / Z.z, gesture.mx, gesture.my);
      setZoom(Z.z, Z.x + mx - gesture.mx, Z.y + my - gesture.my);
      gesture.mx = mx; gesture.my = my;
      quietUntil = performance.now() + 350;
    } else if (gesture.kind !== 'pinch' && Z.z > 1) {
      const dx = e.clientX - gesture.x, dy = e.clientY - gesture.y;
      if (gesture.kind === 'maybe-pan' && Math.hypot(dx, dy) > 10) gesture.kind = 'pan';
      if (gesture.kind === 'pan') {
        setZoom(Z.z, gesture.ox + dx, gesture.oy + dy);
        quietUntil = performance.now() + 250;
      }
    }
  });
  const lift = e => {
    pointers.delete(e.pointerId);
    if (!pointers.size) gesture = null;
    else if (gesture && gesture.kind === 'pinch') {
      const [a] = [...pointers.values()];
      gesture = { kind: 'pan', x: a.x, y: a.y, ox: Z.x, oy: Z.y };
    }
  };
  stage.addEventListener('pointerup', lift);
  stage.addEventListener('pointercancel', lift);
  stage.addEventListener('wheel', e => {
    e.preventDefault();
    zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0025)), e.clientX, e.clientY);
  }, { passive: false });

  // ---------- input ----------
  let downAt = null;
  svg.addEventListener('pointerdown', e => { downAt = pointers.size > 1 ? null : { x: e.clientX, y: e.clientY }; });
  svg.addEventListener('pointercancel', () => { downAt = null; });
  svg.addEventListener('contextmenu', e => e.preventDefault());
  svg.addEventListener('click', e => {
    if (!downAt) return;
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    downAt = null;
    if (moved > 14 || performance.now() < quietUntil || pointers.size > 1) return;
    const g = e.target.closest && e.target.closest('.region');
    if (!g) return;
    const b = svg.getBoundingClientRect(), m = S.puzzle.map;
    tapRegion(+g.dataset.r, { x: (e.clientX - b.left) / b.width * m.cols, y: (e.clientY - b.top) / b.height * m.rows });
  });
  svg.addEventListener('dblclick', e => e.preventDefault());
  svg.addEventListener('keydown', e => {
    const region = e.target.closest('.region');
    if (region && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      tapRegion(+region.dataset.r, null);
    }
  });

  function tapRegion(r, at) {
    if (S.done) return;
    if (S.given[r] >= 0) { pulse(r, 'flash'); toast('Çizgili bölgeler hazır gelir, rengi değişmez'); return; }
    const now = performance.now();
    if (lastTap && lastTap.r === r && now - lastTap.t < DOUBLE_MS) {
      if (lastTap.marked) S.marks[r] = lastTap.prev;
      lastTap = null;
      paintRegion(r, S.color);
      return;
    }
    lastTap = { r, t: now, marked: false, prev: S.marks[r] };
    if (S.fill[r] >= 0) { pulse(r, 'flash'); return; }
    toggleMark(r, S.color, at);
    lastTap.marked = true;
  }

  function toggleMark(r, c, at) {
    S.marks[r] ^= 1 << c;
    (S.marks[r] & (1 << c) ? sfx.dot : sfx.undot)();
    const [x, y] = at ? [at.x, at.y] : S.puzzle.map.anchors[r];
    render({ r, x, y });
    coachEvent('mark', r);
  }

  function pruneMarks(coloredRegions) {
    for (const r of coloredRegions) {
      const bit = 1 << S.fill[r];
      for (const j of S.puzzle.map.adj[r]) if (S.fill[j] < 0) S.marks[j] &= ~bit;
    }
  }

  function paintRegion(r, c) {
    const next = S.fill[r] === c ? -1 : c;
    S.fill[r] = next;
    S.marks[r] = 0;
    if (next >= 0) { pulse(r, 'paint'); sfx.paint(); buzz(8); } else sfx.erase();
    clearHint();
    if (next >= 0) pruneMarks([r]);
    render();
    coachEvent('paint', r);
    checkWin();
  }

  function selectColor(c) {
    if (S.done) return;
    if (S.color !== c) { S.color = c; lastTap = null; sfx.select(); }
    renderBar();
    coachEvent('color', c);
  }

  function checkWin() {
    if (S.done || S.fill.some(c => c < 0)) return;
    const clashes = clashEdges();
    if (clashes.length) {
      const panes = new Set(clashes.flatMap(e => [e[4], e[5]])).size;
      sfx.bad(); buzz([30, 40, 30]); shakeBoard();
      toast(`Yanlış çözüm: kırmızı sınırlı ${panes} bölge komşusuyla aynı renk`, 2800);
      return;
    }
    S.done = true;
    sfx.win();
    $('toast').classList.remove('show');
    $('boardCard').classList.add('won');
    endCoach(true);
    revealGlass();
  }

  async function revealGlass() {
    clearHint();
    render();
    const puzzle = S.puzzle, { map, glass } = puzzle;
    $('glassNext').disabled = true;
    $('glassNext').textContent = 'YÜKLENİYOR…';
    $('glassStatus').textContent = 'VİTRAY HAZIRLANIYOR';
    $('dock').style.minHeight = $('dock').offsetHeight + 'px';
    $('dock').classList.add('art-finished');
    $('glassName').textContent = glass.name;
    $('glassComplete').hidden = false;
    svg.setAttribute('aria-busy', 'true');
    if (!glassImage) {
      glassImage = new Image();
      glassImage.src = glass.image;
    }
    try {
      await glassImage.decode();
    } catch {
      if (S.puzzle !== puzzle || !S.done) return;
      glassImage = null;
      svg.removeAttribute('aria-busy');
      $('glassStatus').textContent = 'GÖRSEL YÜKLENEMEDİ';
      $('glassNext').textContent = 'TEKRAR YÜKLE';
      $('glassNext').disabled = false;
      return;
    }
    if (S.puzzle !== puzzle || !S.done) return;
    const defs = svg.querySelector('defs');
    el('image', { id: 'glassArtwork', href: glass.image, width: map.cols, height: map.rows, preserveAspectRatio: 'none' }, defs);
    const art = el('g', { class: 'glass-art', 'pointer-events': 'none', role: 'img', 'aria-label': glass.name + ' — AI vitray görseli' }, layers.surface);
    map.paths.forEach((d, r) => {
      const clip = el('clipPath', { id: 'glassPane' + r }, defs);
      el('path', { d }, clip);
      const pane = el('use', { href: '#glassArtwork', 'clip-path': `url(#glassPane${r})`, class: 'glass-pane' }, art);
      pane.style.animationDelay = Math.round((map.anchors[r][0] + map.anchors[r][1]) * 32) + 'ms';
    });
    regionEls.forEach(({ g }) => g.setAttribute('tabindex', '-1'));
    setZoom(1, 0, 0);
    $('zoomTools').hidden = true;
    layers.fixed.innerHTML = '';
    $('boardCard').classList.add('stained');
    $('glassStatus').textContent = 'VİTRAY TAMAM!';
    $('glassNext').textContent = 'DEVAM';
    $('mapRule').textContent = 'DÖRT RENK, BİR VİTRAY';
    svg.removeAttribute('aria-busy');
    store.set('level', wrap(S.level + 1));
    store.set('solved', [...new Set([...store.get('solved', []), glass.id])]);
    glassTimer = setTimeout(() => {
      if (S.puzzle !== puzzle || !S.done) return;
      art.replaceChildren(el('use', { href: '#glassArtwork' }));
      el('path', { d: map.shape, fill: 'none', stroke: '#344039', 'stroke-width': 5, 'vector-effect': 'non-scaling-stroke' }, art);
      $('glassNext').disabled = false;
    }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 2200);
  }

  function colorName(hex) {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (d < .08) return max > .7 ? 'Açık Gri' : 'Koyu Gri';
    const h = (((max === r ? (g - b) / d : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60) + 360) % 360;
    return h < 15 || h >= 345 ? 'Kırmızı' : h < 45 ? 'Turuncu' : h < 65 ? 'Sarı' : h < 165 ? 'Yeşil' : h < 195 ? 'Turkuaz' : h < 255 ? 'Mavi' : h < 290 ? 'Mor' : 'Pembe';
  }

  function luminance(hex) {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v > 0.04 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const ch = v => Math.max(0, Math.min(255, Math.round(v + (amt > 0 ? (255 - v) * amt : v * amt))));
    return `rgb(${ch(n >> 16)}, ${ch((n >> 8) & 255)}, ${ch(n & 255)})`;
  }

  // ---------- hint ----------
  let hintTimer = 0;
  function clearHint() {
    if (layers.hint) layers.hint.innerHTML = '';
    const clip = $('hintClip');
    if (clip) clip.remove();
    const sheen = $('hintSheen');
    if (sheen) sheen.remove();
    $('hintBtn').classList.remove('hint-active');
    clearTimeout(hintTimer);
  }

  function useHint() {
    if (S.done) return;
    if (S.hints <= 0) {
      S.hints += 3;
      toast('+3 ipucu (reklam yeri)');
      render();
      return;
    }
    const { map } = S.puzzle, given = S.given, solution = S.puzzle.solution;
    let target = -1;
    for (let r = 0; r < map.count; r++) {
      if (given[r] < 0 && S.fill[r] >= 0 && S.fill[r] !== solution[r]) { target = r; break; }
    }
    if (target < 0) {
      // Pick the empty region with the fewest colours left by its painted neighbours.
      let best = 99;
      for (let r = 0; r < map.count; r++) {
        if (S.fill[r] >= 0 || S.given[r] >= 0) continue;
        let mask = 0;
        for (const j of map.adj[r]) if (S.fill[j] >= 0 && S.fill[j] === solution[j]) mask |= 1 << S.fill[j];
        const left = PALETTE.length - popcount(mask);
        if (left < best) { best = left; target = r; }
      }
    }
    if (target < 0) return;
    // Wrong neighbours would block the correct colour; clear them first.
    for (const j of map.adj[target]) {
      if (given[j] < 0 && S.fill[j] === solution[target]) S.fill[j] = -1;
    }
    const previousColor = S.fill[target];
    S.fill[target] = solution[target];
    S.marks[target] = 0;
    S.hints--;
    sfx.hint();
    clearHint();
    pruneMarks([target]);
    render();
    hintFill(target, previousColor);
    coachEvent('paint', target);
    checkWin();
  }

  // The solution is committed immediately; a fading veil reveals it without changing state.
  function hintFill(r, previousColor) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const { map } = S.puzzle;
    const { box: [x0, y0, x1, y1] } = regionGeom(r);
    const width = x1 - x0, height = y1 - y0;
    const defs = svg.querySelector('defs');
    const clip = el('clipPath', { id: 'hintClip', clipPathUnits: 'userSpaceOnUse' }, defs);
    el('path', { d: map.paths[r] }, clip);
    const gradient = el('linearGradient', { id: 'hintSheen', x1: '0%', y1: '20%', x2: '100%', y2: '80%' }, defs);
    [[0, 0], [.4, 0], [.5, .48], [.6, 0], [1, 0]].forEach(([offset, opacity]) => {
      el('stop', { offset, 'stop-color': '#fff8d8', 'stop-opacity': opacity }, gradient);
    });
    const g = el('g', { 'clip-path': 'url(#hintClip)' }, layers.hint);
    el('path', { d: map.paths[r], fill: panePaint(previousColor), class: 'hint-veil' }, g);
    const sweep = el('rect', { x: x0 - width, y: y0, width: width * 3, height, fill: 'url(#hintSheen)', class: 'hint-sheen' }, g);
    sweep.style.setProperty('--hint-travel', `${width * 1.6}px`);
    el('path', { d: map.paths[r], fill: 'none', stroke: '#fff0b0', 'stroke-width': 5, 'vector-effect': 'non-scaling-stroke', class: 'hint-outline' }, g);
    const button = $('hintBtn');
    void button.offsetWidth;
    button.classList.add('hint-active');
    hintTimer = setTimeout(clearHint, 850);
  }

  // ---------- colour bar ----------
  const CHECK_SVG = '<svg viewBox="0 0 20 20"><path d="m4 10 4 4 8-8" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const colorButtons = [0, 1, 2, 3].map(c => {
    const button = document.createElement('button');
    button.className = 'color-choice';
    button.type = 'button';
    button.innerHTML = `<span class="color-check" aria-hidden="true">${CHECK_SVG}</span>`;
    button.addEventListener('click', () => selectColor(c));
    $('palette').appendChild(button);
    return button;
  });

  function renderBar() {
    colorButtons.forEach((button, c) => {
      button.setAttribute('aria-pressed', String(c === S.color));
      button.style.setProperty('--swatch', PALETTE[c].base);
      button.style.setProperty('--swatch-dark', PALETTE[c].dark);
      button.setAttribute('aria-label', PALETTE[c].name);
    });
  }

  // ---------- first-level tutorial ----------
  // Coach marks on level 1: pick the one colour that fits a pane, double tap to paint it,
  // single tap another pane to leave a note, then play on.
  let coach = null; // { step, r, c, r2 }
  function startCoach() {
    const { map } = S.puzzle, sol = S.puzzle.solution;
    // a pane whose painted neighbours already use three colours: only one colour is left
    const forced = [];
    for (let r = 0; r < map.count; r++) {
      if (S.fill[r] >= 0) continue;
      const used = new Set(map.adj[r].map(j => S.fill[j]).filter(c => c >= 0));
      if (used.size === 3) forced.push(r);
    }
    if (!forced.length) return;
    const [cx, cy] = [map.cols / 2, map.rows / 2];
    forced.sort((a, b) => Math.hypot(map.anchors[a][0] - cx, map.anchors[a][1] - cy) - Math.hypot(map.anchors[b][0] - cx, map.anchors[b][1] - cy));
    const r = forced[0];
    coach = { step: 'color', r, c: sol[r] };
    if (S.color === coach.c) { S.color = (coach.c + 1) % 4; renderBar(); }
    showCoach();
  }

  function showCoach() {
    if (!coach) return;
    const box = $('coach');
    const name = PALETTE[coach.c].name.toLocaleLowerCase('tr');
    const texts = {
      color: `<b>Komşu bölgeler aynı renk olamaz.</b> Parlayan bölgenin komşularında üç renk var, geriye sadece <b>${name}</b> kalıyor. Aşağıdan <b>${name}</b> rengini seç.`,
      paint: `Şimdi parlayan bölgeye <b>iki kez dokun</b>, ${name} renge boyansın.`,
      mark: coach.step === 'mark' ? coachMarkText() : '',
      done: 'Notlar küçük noktalar olarak kalır; aynı yere yine tek dokunursan silinir. <b>Çizgili bölgeler</b> hazır gelir, rengi değişmez. Bütün haritayı boya, vitray ortaya çıksın!',
    };
    box.innerHTML = `<p>${texts[coach.step]}</p>` + (coach.step === 'done' ? '<button class="btn-green" type="button" id="coachOk">BAŞLA</button>' : '<button class="coach-skip" type="button" id="coachSkip">Geç</button>');
    box.hidden = false;
    const ok = $('coachOk'), skip = $('coachSkip');
    if (ok) ok.addEventListener('click', () => endCoach(true));
    if (skip) skip.addEventListener('click', () => endCoach(true));
    const pending = coach.step === 'mark' ? coach.options.filter(c => !(S.marks[coach.r2] & (1 << c))) : [];
    colorButtons.forEach((b, c) => b.classList.toggle('coach-target', (coach.step === 'color' && c === coach.c) || (pending.includes(c) && S.color !== c)));
    layers.coach.innerHTML = '';
    const target = coach.step === 'mark' ? coach.r2 : coach.step === 'done' ? -1 : coach.r;
    if (target >= 0) {
      el('path', {
        class: 'coach-ring', d: edgesPath(S.puzzle.map.outlines[target]), fill: 'none', stroke: '#fff7d6',
        'stroke-width': 6, 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke',
      }, layers.coach);
    }
    placeCoach();
  }

  // The note step points at a pane whose painted neighbours use two colours: two choices are
  // left, so the player notes both instead of guessing.
  function coachMarkText() {
    const [a, b] = coach.options.map(c => PALETTE[c].name.toLocaleLowerCase('tr'));
    const done = coach.options.filter(c => S.marks[coach.r2] & (1 << c));
    if (done.length === 1) {
      const rest = PALETTE[coach.options.find(c => !done.includes(c))].name.toLocaleLowerCase('tr');
      return `Güzel, not düştü. Şimdi aşağıdan <b>${rest}</b> rengini seçip aynı bölgeye yine <b>bir kez</b> dokun.`;
    }
    return `Parlayan bölgenin komşularında iki renk var, geriye <b>${a}</b> ve <b>${b}</b> kalıyor. Emin değilsen <b>ikisini de not al</b>: rengi seç, bölgeye <b>bir kez</b> dokun.`;
  }

  // Sit on the half of the screen away from the glowing pane: over the header when the pane is
  // low, just above the colour bar when it is high.
  function placeCoach() {
    const box = $('coach');
    if (!coach || box.hidden) return;
    const app = $('app').getBoundingClientRect(), board = svg.getBoundingClientRect(), dock = $('dock').getBoundingClientRect();
    const { map } = S.puzzle;
    const target = coach.step === 'mark' ? coach.r2 : coach.r;
    const y = target >= 0 && coach.step !== 'done' ? board.top + map.anchors[target][1] / map.rows * board.height : board.bottom;
    const low = y > board.top + board.height * 0.5;
    box.style.top = (low ? 8 : Math.max(8, dock.top - app.top - box.offsetHeight - 8)) + 'px';
  }

  function coachEvent(kind, v) {
    if (!coach) return;
    if (coach.step === 'color' && kind === 'color' && v === coach.c) coach.step = 'paint';
    else if (coach.step === 'paint' && kind === 'color' && v !== coach.c) coach.step = 'color';
    else if (coach.step === 'paint' && kind === 'paint' && v === coach.r) {
      if (S.fill[coach.r] !== coach.c) { toast('Bu renk olmaz, komşusuyla aynı. Tekrar dene'); return; }
      const { map } = S.puzzle;
      const two = [];
      for (let r = 0; r < map.count; r++) {
        if (S.fill[r] >= 0 || S.marks[r]) continue;
        const used = new Set(map.adj[r].map(j => S.fill[j]).filter(c => c >= 0));
        if (used.size === 2) two.push(r);
      }
      const dist = r => Math.hypot(map.anchors[r][0] - map.anchors[coach.r][0], map.anchors[r][1] - map.anchors[coach.r][1]);
      two.sort((a, b) => dist(a) - dist(b));
      coach.r2 = two[0];
      if (coach.r2 != null) {
        const used = new Set(map.adj[coach.r2].map(j => S.fill[j]).filter(c => c >= 0));
        coach.options = [0, 1, 2, 3].filter(c => !used.has(c));
      }
      coach.step = coach.r2 == null ? 'done' : 'mark';
    } else if (coach.step === 'mark' && (kind === 'mark' || kind === 'color')) {
      if (coach.options.every(c => S.marks[coach.r2] & (1 << c))) coach.step = 'done';
    } else return;
    showCoach();
  }

  function endCoach(finished) {
    if (finished && coach) store.set('tutorial', true);
    coach = null;
    $('coach').hidden = true;
    colorButtons.forEach(b => b.classList.remove('coach-target'));
    if (layers.coach) layers.coach.innerHTML = '';
  }

  // ---------- popups ----------
  function showCard(html) {
    $('card').innerHTML = html;
    $('overlay').classList.remove('hidden');
  }
  function hideCard() { $('overlay').classList.add('hidden'); }

  const ICON_TAP = `<svg viewBox="0 0 48 48"><rect x="4" y="4" width="40" height="40" rx="10" fill="#fff"/><circle cx="19" cy="20" r="4.5" fill="#8ca473"/><circle cx="30" cy="20" r="4.5" fill="#d6bd6f"/><circle cx="24" cy="31" r="4.5" fill="#7f9bb8"/></svg>`;
  const ICON_PALETTE = `<svg viewBox="0 0 48 48"><rect x="2" y="9" width="44" height="30" rx="7" fill="#294f43"/><rect x="5" y="15" width="8" height="17" rx="2" fill="#8ca473" stroke="#faf3df" stroke-width="2"/><rect x="15" y="16" width="8" height="15" rx="2" fill="#d6bd6f"/><rect x="25" y="16" width="8" height="15" rx="2" fill="#bf8c70"/><rect x="35" y="16" width="8" height="15" rx="2" fill="#7f9bb8"/></svg>`;
  const ICON_FIXED = `<svg viewBox="0 0 48 48"><defs><pattern id="howStripes" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="1.6" height="5" fill="#ad3802"/></pattern></defs><rect x="4" y="4" width="40" height="40" rx="10" fill="#efeddc"/><path d="M9 9h17l-4 30H9z" fill="#d84602"/><path d="M9 9h17l-4 30H9z" fill="url(#howStripes)"/><path d="M26 9h13v30H22z" fill="#d84602"/><path d="M9 9h30v30H9zM26 9l-4 30" fill="none" stroke="#3a4234" stroke-width="2"/></svg>`;
  const ICON_RULE = `<svg viewBox="0 0 48 48"><rect x="4" y="4" width="40" height="40" rx="10" fill="#fff"/><path d="M8 10h14l4 14-4 14H8z" fill="#7f9bb8"/><path d="M26 24l-4 14h18V10H22z" fill="#7f9bb8"/><path d="M22 10l4 14-4 14" stroke="#e2343f" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`;

  function showHow() {
    showCard(`
      <button class="close" data-act="close" aria-label="Kapat"></button>
      <h2>NASIL OYNANIR</h2>
      <div class="how">
        ${ICON_RULE}<span>Birbirine değen bölgeler aynı renk olamaz. Harita dolunca yanlış yerler kırmızı yanar.</span>
        ${ICON_PALETTE}<span><b>Renk seç:</b> alttaki dört renkten biri hep seçilidir, değiştirmek için dokun.</span>
        ${ICON_TAP}<span><b>Tek dokun:</b> bölgeye seçili rengin notunu koy. <b>Çift dokun:</b> bölgeyi boya.</span>
        ${ICON_FIXED}<span><b>Çizgili bölgeler</b> hazır gelir, rengi değişmez. Düz renkler senin boyadıkların.</span>
      </div>
      <button class="btn-green" data-act="tutorial">EĞİTİMİ OYNA</button>
      <button class="btn-flat" data-act="close">KAPAT</button>`);
  }

  function showSettings() {
    const solved = store.get('solved', []);
    showCard(`
      <button class="close" data-act="close" aria-label="Kapat"></button>
      <h2>AYARLAR</h2>
      <div class="controls-setting appearance-setting">
        <span class="setting-label" id="appearanceLabel">GÖRÜNÜM</span>
        <div class="appearance-options" role="group" aria-labelledby="appearanceLabel">
          <button class="appearance-option" data-act="appearance" data-look="classic" aria-pressed="${boardLook === 'classic'}"><i class="appearance-preview classic-preview" aria-hidden="true"></i><span>Klasik<small>Düz renkler</small></span></button>
          <button class="appearance-option" data-act="appearance" data-look="3d" aria-pressed="${boardLook === '3d'}"><i class="appearance-preview depth-preview" aria-hidden="true"></i><span>3D<small>Varsayılan · kabartmalı</small></span></button>
        </div>
      </div>
      <button class="btn-flat" data-act="sound">SES: ${S.sound ? 'AÇIK' : 'KAPALI'}</button>
      <button class="btn-flat" data-act="how">NASIL OYNANIR</button>
      <button class="btn-flat" data-act="retry">YENİDEN BAŞLA</button>
      <div class="controls-setting level-pick">
        <span class="setting-label">BÖLÜMLER</span>
        <div class="level-grid">${STAINED.map((L, i) => levelChip(L, i, solved)).join('')}</div>
      </div>`);
  }

  // One chip per level: number, its four glass colours, a tick once its panel is finished.
  function levelChip(L, i, solved) {
    const done = solved.includes(L.id);
    return `<button class="level-chip${i + 1 === S.level ? ' current' : ''}${done ? ' done' : ''}" data-act="glass" data-i="${i}"
      aria-label="Seviye ${i + 1}: ${L.name}${done ? ', tamamlandı' : ''}"${i + 1 === S.level ? ' aria-current="true"' : ''}>
      <b>${i + 1}</b><span class="chip-colors">${L.palette.map(c => `<i style="background:${c}"></i>`).join('')}</span></button>`;
  }

  $('card').addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'close') hideCard();
    else if (act === 'retry') { hideCard(); restartLevel(); }
    else if (act === 'glass') { hideCard(); startLevel(+b.dataset.i + 1); }
    else if (act === 'how') showHow();
    else if (act === 'tutorial') { hideCard(); store.set('tutorial', false); startLevel(1); }
    else if (act === 'sound') { S.sound = !S.sound; store.set('sound', S.sound); showSettings(); }
    else if (act === 'appearance') {
      setBoardLook(b.dataset.look);
      $('card').querySelectorAll('[data-act="appearance"]').forEach(button => button.setAttribute('aria-pressed', button.dataset.look === boardLook));
    }
  });

  $('glassNext').addEventListener('click', () => {
    if (!S.done) return;
    if (svg.querySelector('.glass-art')) nextLevel();
    else revealGlass();
  });
  $('hintBtn').addEventListener('click', useHint);
  $('settingsBtn').addEventListener('click', showSettings);
  new ResizeObserver(fitBoard).observe($('stage'));
  document.addEventListener('gesturestart', e => e.preventDefault());

  startLevel(Math.max(1, S.level | 0));
  if (document.fonts) document.fonts.ready.then(fitBoard);

  window.CartoGame = {
    S,
    tap: r => tapRegion(r),
    choose: selectColor,
    level: startLevel,
    solveAll() {
      S.puzzle.solution.forEach((c, r) => { S.fill[r] = c; });
      render(); checkWin();
    },
  };
})();
