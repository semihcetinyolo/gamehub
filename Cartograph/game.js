(function () {
  'use strict';

  const E = window.CartoEngine;
  const NS = 'http://www.w3.org/2000/svg';
  const PALETTE = [
    { name: 'Yeşil', base: '#8ca473', dark: '#6f8a57' },
    { name: 'Hardal', base: '#d6bd6f', dark: '#b89d4f' },
    { name: 'Kiremit', base: '#bf8c70', dark: '#9f6d52' },
    { name: 'Gök', base: '#7f9bb8', dark: '#617d9b' },
  ];
  const EMPTY = '#efeddc';
  const MAX_LIVES = 3;
  const START_HINTS = 3;
  const DOUBLE_MS = 300;

  const $ = id => document.getElementById(id);
  const svg = $('board');
  const store = {
    get(k, d) { try { const v = localStorage.getItem('carto.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('carto.' + k, JSON.stringify(v)); } catch { /* private mode */ } },
  };

  const S = {
    level: store.get('level', 1),
    sound: store.get('sound', true),
    puzzle: null, given: [], fill: [], marks: [], color: 0,
    lives: MAX_LIVES, hints: START_HINTS, done: false,
    locks: new Map(), opened: new Set(),
  };
  // v1: tap a region = note, double tap = paint, with the selected bar colour.
  // v3: the colour comes from a bubble that pops up where you tap (first tap, long press, or the
  //     colour chip); after that, tap a region = note, double tap = paint, like v1.
  const CONTROLS = {
    v1: { name: 'V1', desc: 'Tek dokun not, çift dokun boya. Alttaki seçili renk kullanılır.' },
    v3: { name: 'V3', desc: 'Dokunduğun yerde renk balonu açılır, rengi seç. Sonra bölgeye tek dokun not, çift dokun boya. Rengi değiştirmek için basılı tut.' },
  };
  let controls = CONTROLS[store.get('controls', 'v1')] ? store.get('controls', 'v1') : 'v1';
  // Lives off: anything can be painted; only a full board is judged (tick → next level, or "wrong").
  let livesOn = store.get('lives', true) !== false;
  // 'clues': level opens with its given colours and locks; 'empty': nothing painted, any valid colouring wins.
  let startMode = store.get('start', 'clues') === 'empty' ? 'empty' : 'clues';
  let lastTap = null;
  let armed = false;
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
    unlock: () => { tone(520, 0.1, 'square', 0.05); setTimeout(() => tone(780, 0.1, 'square', 0.05), 80); setTimeout(() => tone(1170, 0.22, 'triangle', 0.1), 160); },
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

  function regionPath(map, r) {
    let d = '';
    for (let c = 0; c < map.cols * map.rows; c++) {
      for (let k = 0; k < 2; k++) {
        if (map.atoms[c * 2 + k] !== r) continue;
        const tri = E.triangle(c % map.cols, (c / map.cols) | 0, map.orient[c], k);
        d += `M${tri[0][0]} ${tri[0][1]}L${tri[1][0]} ${tri[1][1]}L${tri[2][0]} ${tri[2][1]}Z`;
      }
    }
    return d;
  }

  function edgesPath(edges) {
    return edges.map(e => `M${e[0]} ${e[1]}L${e[2]} ${e[3]}`).join('');
  }

  function buildBoard() {
    const { map } = S.puzzle;
    svg.innerHTML = '';
    svg.setAttribute('viewBox', `0 0 ${map.cols} ${map.rows}`);
    const defs = el('defs', {}, svg);
    PALETTE.forEach((p, i) => {
      const pat = el('pattern', { id: 'hatch' + i, width: 0.16, height: 0.16, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
      el('rect', { width: 0.16, height: 0.16, fill: p.base }, pat);
      el('rect', { width: 0.05, height: 0.16, fill: p.dark, opacity: 0.55 }, pat);
    });
    const lockPat = el('pattern', { id: 'lockHatch', width: 0.2, height: 0.2, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    el('rect', { width: 0.2, height: 0.2, fill: '#ddd6bd' }, lockPat);
    el('rect', { width: 0.07, height: 0.2, fill: '#c9c0a2' }, lockPat);
    const gRegions = el('g', {}, svg);
    regionEls = [];
    for (let r = 0; r < map.count; r++) {
      const g = el('g', { class: 'region', 'data-r': r, tabindex: 0, role: 'button', 'aria-label': `Bölge ${r + 1}` }, gRegions);
      const path = el('path', { class: 'fill', d: regionPath(map, r), 'stroke-width': 0.04, 'stroke-linejoin': 'round' }, g);
      regionEls.push({ g, path });
    }
    layers.hint = el('g', {}, svg);
    el('path', {
      d: edgesPath(map.edges), fill: 'none', stroke: '#454e3e', 'stroke-width': 1.7,
      'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none',
    }, svg);
    el('rect', {
      x: 0, y: 0, width: map.cols, height: map.rows, fill: 'none', stroke: '#454e3e',
      'stroke-width': 2.6, 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none',
    }, svg);
    layers.conflict = el('path', {
      fill: 'none', stroke: '#e2343f', 'stroke-width': 4.5, 'stroke-linecap': 'round',
      'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none', class: 'conflict', d: '',
    }, svg);
    layers.dots = el('g', { 'pointer-events': 'none' }, svg);
    layers.locks = el('g', { 'pointer-events': 'none' }, svg);
    buildDotGrid(map);
    fitBoard();
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
    if (bubble) placeBubble();
  }

  // Pencil dots: each mark count gets its own layout over the whole region —
  // 1 colour: hex grid, 2: checkerboard square grid, 3 and 4: hex grid with an even colour cycle.
  const HEX_STEP = 0.3, SQ_STEP = 0.28, DOT_R = 0.065, DOT_MARGIN = 0.1;
  let dotCache = [];
  function buildDotGrid() { dotCache = []; }

  function regionGeom(r) {
    const map = S.puzzle.map;
    const outline = E.regionOutline(map, r);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of outline) {
      x0 = Math.min(x0, s[0], s[2]); x1 = Math.max(x1, s[0], s[2]);
      y0 = Math.min(y0, s[1], s[3]); y1 = Math.max(y1, s[1], s[3]);
    }
    return { outline, box: [x0, y0, x1, y1] };
  }
  function insideRegion(map, r, outline, x, y) {
    if (x <= 0 || y <= 0 || x >= map.cols || y >= map.rows) return false;
    const cx = Math.floor(x), cy = Math.floor(y), fx = x - cx, fy = y - cy, c = cy * map.cols + cx;
    const k = map.orient[c] === 0 ? (fx > fy ? 0 : 1) : (fx + fy < 1 ? 0 : 1);
    if (map.atoms[c * 2 + k] !== r) return false;
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
            if (insideRegion(map, r, outline, x, y)) pts.push([fmt(x), fmt(y), i, j]);
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
    const { map } = S.puzzle, given = S.given;
    for (let r = 0; r < map.count; r++) {
      const c = S.fill[r];
      const paint = lockLeft(r) > 0 ? 'url(#lockHatch)' : c < 0 ? EMPTY : given[r] >= 0 ? `url(#hatch${c})` : PALETTE[c].base;
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
    layers.locks.innerHTML = '';
    for (const r of S.locks.keys()) {
      const left = lockLeft(r);
      if (left > 0) lockBadge(r, left, layers.locks);
    }
    layers.conflict.setAttribute('d', livesOn ? edgesPath(conflictEdges()) : '');
    const filled = S.fill.filter(c => c >= 0).length;
    $('progress').textContent = `${filled}/${map.count}`;
    $('livesNum').textContent = S.lives;
    $('lives').hidden = !livesOn;
    $('levelPill').textContent = 'SEVİYE ' + S.level;
    const badge = $('hintBadge');
    badge.textContent = S.hints > 0 ? S.hints : '+';
    badge.classList.toggle('plus', S.hints <= 0);
  }

  // ---------- locked clues ----------
  const LOCK_ICON = 'M2 0h4v1h1v3h1v5H0V4h1V1h1zm1 1v3h2V1zM3 5v2h2V5z';
  const paintedCount = () => S.fill.filter((c, r) => c >= 0 && S.given[r] < 0).length;
  const lockLeft = r => (S.locks.has(r) && !S.opened.has(r) ? Math.max(0, S.locks.get(r) - paintedCount()) : 0);

  function lockBadge(r, left, parent, cls) {
    const [ax, ay] = S.puzzle.map.anchors[r];
    const g = el('g', { class: 'lock-badge' + (cls ? ' ' + cls : ''), 'data-r': r, transform: `translate(${ax} ${ay})` }, parent);
    const inner = el('g', { class: 'lock-inner' }, g);
    const w = left >= 10 ? 1.1 : 0.94, x0 = -w / 2;
    el('rect', { x: x0, y: -0.25, width: w, height: 0.5, rx: 0.15, fill: '#e7c77a', stroke: '#6b4a1f', 'stroke-width': 0.045 }, inner);
    el('path', { d: LOCK_ICON, fill: '#6b4a1f', transform: `translate(${fmt(x0 + 0.1)} -0.165) scale(0.037)`, 'shape-rendering': 'crispEdges' }, inner);
    const t = el('text', {
      x: fmt((x0 + 0.4 + w / 2 - 0.05) / 2), y: 0.125, 'text-anchor': 'middle', 'font-size': 0.36, fill: '#6b4a1f',
      'font-family': 'Rounded, sans-serif', 'font-weight': 900,
    }, inner);
    t.textContent = left > 0 ? left : '';
    return g;
  }

  function nudgeLock(r) {
    const b = layers.locks.querySelector(`.lock-badge[data-r="${r}"]`);
    if (b) { b.classList.remove('nudge'); void b.getBBox(); b.classList.add('nudge'); }
    sfx.undot();
    const left = lockLeft(r);
    toast(`Kilitli: ${left} bölge daha boya`);
  }

  // Reveal any lock whose count has been reached; once open it stays open.
  function openLocks() {
    const revealed = [];
    for (const r of S.locks.keys()) {
      if (S.opened.has(r) || lockLeft(r) > 0) continue;
      S.opened.add(r);
      revealed.push(r);
      S.fill[r] = S.given[r];
      S.marks[r] = 0;
      const fx = lockBadge(r, 0, layers.hint, 'opening');
      setTimeout(() => fx.remove(), 600);
      pulse(r, 'paint');
      sfx.unlock();
      const clash = S.puzzle.map.adj[r].some(j => S.fill[j] === S.fill[r]);
      toast(clash ? 'Kilit açıldı! Kırmızı sınırdaki rengi düzelt' : 'Kilit açıldı!', clash ? 2400 : 1600);
    }
    return revealed;
  }

  const popcount = m => { let c = 0; while (m) { c += m & 1; m >>= 1; } return c; };

  function conflictEdges(extra) {
    const { map } = S.puzzle;
    return map.edges.filter(e => {
      const a = e[4], b = e[5];
      if (extra && (a === extra.r || b === extra.r)) {
        const other = a === extra.r ? b : a;
        return S.fill[other] === extra.c;
      }
      return S.fill[a] >= 0 && S.fill[a] === S.fill[b];
    });
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
  function startLevel(n) {
    closeBubble();
    S.level = n;
    store.set('level', n);
    S.puzzle = E.generate(n);
    const empty = startMode === 'empty';
    S.given = empty ? new Array(S.puzzle.map.count).fill(-1) : S.puzzle.given.slice();
    S.fill = S.given.slice();
    S.locks = new Map(empty ? [] : (S.puzzle.locks || []).map(l => [l.r, l.k]));
    S.opened = new Set();
    for (const r of S.locks.keys()) S.fill[r] = -1;
    S.marks = new Array(S.puzzle.map.count).fill(0);
    S.lives = MAX_LIVES;
    S.hints = START_HINTS;
    S.done = false;
    lastTap = null;
    $('boardCard').classList.remove('won');
    $('solvedTick').classList.remove('show');
    buildBoard();
    render();
    if (n === 1 && !store.get('seenHow', false)) { store.set('seenHow', true); showHow(); }
  }

  // ---------- input ----------
  const LONG_PRESS_MS = 450;
  let downAt = null, pressTimer = 0, longPressed = false;
  svg.addEventListener('pointerdown', e => {
    downAt = { x: e.clientX, y: e.clientY };
    longPressed = false;
    clearTimeout(pressTimer);
    if (controls === 'v3') {
      pressTimer = setTimeout(() => { longPressed = true; buzz(10); openBubble(downAt.x, downAt.y); }, LONG_PRESS_MS);
    }
  });
  svg.addEventListener('pointermove', e => {
    if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 14) clearTimeout(pressTimer);
  });
  const endPress = () => clearTimeout(pressTimer);
  svg.addEventListener('pointerup', endPress);
  svg.addEventListener('pointercancel', () => { endPress(); downAt = null; });
  svg.addEventListener('contextmenu', e => e.preventDefault());
  svg.addEventListener('click', e => {
    if (!downAt) return;
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    downAt = null;
    if (longPressed) { longPressed = false; return; }
    if (moved > 14) return;
    const g = e.target.closest && e.target.closest('.region');
    if (!g) return;
    const b = svg.getBoundingClientRect(), m = S.puzzle.map;
    tapRegion(+g.dataset.r, { x: (e.clientX - b.left) / b.width * m.cols, y: (e.clientY - b.top) / b.height * m.rows }, { x: e.clientX, y: e.clientY });
  });
  svg.addEventListener('dblclick', e => e.preventDefault());
  svg.addEventListener('keydown', e => {
    const region = e.target.closest('.region');
    if (region && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      const r = regionEls[+region.dataset.r].g.getBoundingClientRect();
      tapRegion(+region.dataset.r, null, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
    }
  });

  function tapRegion(r, at, client) {
    if (S.done) return;
    if (bubble) { closeBubble(); return; }
    if (controls === 'v3' && !armed) { openBubble(client.x, client.y); return; }
    if (lockLeft(r) > 0) { nudgeLock(r); return; }
    if (S.given[r] >= 0) { pulse(r, 'flash'); toast('Bu bölge haritada sabit'); return; }
    tapV1(r, at);
  }

  function tapV1(r, at) {
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
    renderBar();
  }

  function pruneMarks(coloredRegions) {
    for (const r of coloredRegions) {
      const bit = 1 << S.fill[r];
      for (const j of S.puzzle.map.adj[r]) if (S.fill[j] < 0) S.marks[j] &= ~bit;
    }
  }

  function paintRegion(r, c) {
    const next = S.fill[r] === c ? -1 : c;
    if (livesOn && next >= 0 && S.puzzle.map.adj[r].some(j => S.fill[j] === next)) { reject(r, next); return; }
    S.fill[r] = next;
    S.marks[r] = 0;
    if (next >= 0) { pulse(r, 'paint'); sfx.paint(); buzz(8); } else sfx.erase();
    clearHint();
    pruneMarks([...(next >= 0 ? [r] : []), ...openLocks()]);
    render();
    renderBar();
    checkWin();
  }

  function chooseColor(c) {
    if (S.done) return;
    selectColor(c);
  }

  function selectColor(c) {
    if (S.color === c && (controls === 'v1' || armed)) return;
    S.color = c;
    lastTap = null;
    sfx.select();
    renderBar();
  }

  function reject(r, c) {
    S.lives = Math.max(0, S.lives - 1);
    sfx.bad(); buzz([30, 40, 30]); shakeBoard();
    const lives = $('lives');
    lives.classList.remove('hit'); void lives.offsetWidth; lives.classList.add('hit');
    render();
    // Flash the would-be clash on the borders for a moment.
    layers.conflict.setAttribute('d', edgesPath(conflictEdges({ r, c })));
    regionEls[r].path.setAttribute('fill', PALETTE[c].base);
    regionEls[r].path.setAttribute('stroke', PALETTE[c].base);
    toast('Komşu bölgeler aynı renk olamaz');
    setTimeout(() => { render(); if (S.lives <= 0) showFail(); }, 650);
    S.done = S.lives <= 0;
    if (S.done) closeBubble();
  }

  function checkWin() {
    if (S.fill.some(c => c < 0)) return;
    if (conflictEdges().length) {
      if (!livesOn) toast('Yanlış çözüm');
      return;
    }
    S.done = true;
    sfx.win();
    $('toast').classList.remove('show');
    $('boardCard').classList.add('won');
    if (!livesOn) {
      store.set('level', S.level + 1);
      closeBubble();
      $('solvedTick').classList.add('show');
      setTimeout(() => { if (S.done) startLevel(S.level + 1); }, 1400);
      return;
    }
    const stars = Math.max(1, S.lives);
    store.set('stars.' + S.level, Math.max(stars, store.get('stars.' + S.level, 0)));
    store.set('level', S.level + 1);
    setTimeout(() => showCard(`
      <div class="stars">${[0, 1, 2].map(i => STAR.replace('<svg', `<svg class="${i < stars ? '' : 'off'}"`)).join('')}</div>
      <h2>HARİTA TAMAM!</h2>
      <p>Seviye ${S.level} çözüldü.</p>
      <button class="btn-green" data-act="next">DEVAM</button>`), 700);
  }

  function showFail() {
    showCard(`
      <h2>CANIN BİTTİ</h2>
      <p>Komşu iki bölgeyi aynı renge boyadın.<br>Haritayı baştan dene.</p>
      <button class="btn-green" data-act="retry">TEKRAR DENE</button>`);
  }

  // ---------- hint ----------
  let hintTimer = 0;
  // With clues the solution is unique. On an empty start, aim for a colouring that keeps as much
  // of the player's paint as possible: drop one painted region (clashing ones first) if needed.
  function hintSolution() {
    if (startMode !== 'empty') return S.puzzle.solution;
    const { adj } = S.puzzle.map, k = PALETTE.length;
    const solve = fixed => E.countSolutions(adj, fixed, k, 1).solution;
    const found = solve(S.fill);
    if (found) return found;
    const clashing = new Set(conflictEdges().flatMap(e => [e[4], e[5]]));
    const painted = S.fill.map((c, r) => r).filter(r => S.fill[r] >= 0)
      .sort((a, b) => clashing.has(b) - clashing.has(a));
    for (const r of painted) {
      const fixed = S.fill.slice(); fixed[r] = -1;
      const sol = solve(fixed);
      if (sol) return sol;
    }
    return solve(new Array(adj.length).fill(-1));
  }
  function clearHint() { layers.hint.innerHTML = ''; clearTimeout(hintTimer); }

  function useHint() {
    if (S.done) return;
    closeBubble();
    if (S.hints <= 0) {
      S.hints += 3;
      toast('+3 ipucu (reklam yeri)');
      render();
      return;
    }
    const { map } = S.puzzle, given = S.given;
    const solution = hintSolution();
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
      if (given[j] < 0 && S.fill[j] === solution[target]) {
        S.fill[j] = -1;
      }
    }
    S.fill[target] = solution[target];
    S.marks[target] = 0;
    S.hints--;
    sfx.hint();
    clearHint();
    pruneMarks([target, ...openLocks()]);
    el('path', { d: regionPath(map, target), fill: 'rgba(255, 255, 255,.3)', class: 'hint-ring', 'pointer-events': 'none' }, layers.hint);
    el('path', {
      class: 'hint-ring', d: edgesPath(E.regionOutline(map, target)), fill: 'none', stroke: '#fff',
      'stroke-width': 5, 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none',
    }, layers.hint);
    hintTimer = setTimeout(clearHint, 3600);
    pulse(target, 'paint');
    render();
    checkWin();
  }

  const CHECK_SVG = '<svg viewBox="0 0 20 20"><path d="m4 10 4 4 8-8" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const colorButtons = PALETTE.map((p, c) => {
    const button = document.createElement('button');
    button.className = 'color-choice';
    button.type = 'button';
    button.setAttribute('aria-label', p.name);
    button.style.setProperty('--swatch', p.base);
    button.style.setProperty('--swatch-dark', p.dark);
    button.innerHTML = `<span class="color-check" aria-hidden="true">${CHECK_SVG}</span>`;
    button.addEventListener('click', () => chooseColor(c));
    $('palette').appendChild(button);
    return button;
  });
  const pickerButtons = PALETTE.map((p, c) => {
    const button = document.createElement('button');
    button.className = 'pick-choice';
    button.type = 'button';
    button.setAttribute('aria-label', p.name);
    button.style.setProperty('--swatch', p.base);
    button.style.setProperty('--swatch-dark', p.dark);
    button.innerHTML = `<span class="pick-swatch" aria-hidden="true"><span class="pick-check">${CHECK_SVG}</span></span><span class="pick-name" aria-hidden="true">${p.name.toLocaleUpperCase('tr')}</span>`;
    button.addEventListener('click', () => pickFromBubble(c));
    $('pickerPalette').appendChild(button);
    return button;
  });

  function renderBar() {
    const bar = $('colorBar');
    bar.dataset.controls = controls;
    bar.hidden = controls === 'v3';
    colorButtons.forEach((button, c) => button.setAttribute('aria-pressed', String(c === S.color)));
    pickerButtons.forEach((button, c) => button.setAttribute('aria-pressed', String(armed && c === S.color)));
    const chip = $('colorChip');
    chip.hidden = controls !== 'v3';
    $('mapRule').hidden = controls === 'v3';
    chip.classList.toggle('unset', !armed);
    chip.style.setProperty('--swatch', PALETTE[S.color].base);
    $('chipName').textContent = armed ? PALETTE[S.color].name.toLocaleUpperCase('tr') : 'RENK SEÇ';
  }

  // ---------- v3 colour bubble ----------
  let bubble = null; // { x, y } in client coords
  function openBubble(x, y) {
    if (S.done) return;
    bubble = { x, y };
    renderBar();
    const el = $('regionPicker');
    el.style.visibility = 'hidden';
    el.hidden = false;
    placeBubble();
    el.style.visibility = '';
    sfx.select();
  }

  // Sit just above the finger (below if there is no room), arrow pointing at the tap.
  function placeBubble() {
    const el = $('regionPicker');
    const app = $('app').getBoundingClientRect();
    const x = bubble.x - app.left, y = bubble.y - app.top;
    const width = el.offsetWidth, height = el.offsetHeight, gap = 18;
    const left = Math.max(8, Math.min(app.width - width - 8, x - width / 2));
    let top = y - height - gap, side = 'top';
    if (top < 8) { top = y + gap; side = 'bottom'; }
    el.style.left = left + 'px';
    el.style.top = Math.min(top, app.height - height - 8) + 'px';
    el.style.setProperty('--pointer-x', Math.max(18, Math.min(width - 18, x - left)) + 'px');
    el.dataset.side = side;
  }

  function closeBubble() {
    bubble = null;
    $('regionPicker').hidden = true;
  }

  function pickFromBubble(c) {
    const first = !armed;
    armed = true;
    S.color = c;
    lastTap = null;
    closeBubble();
    sfx.select();
    renderBar();
    toast(first ? `${PALETTE[c].name}: bölgeye tek dokun not, çift dokun boya` : `${PALETTE[c].name} seçildi`, first ? 2200 : 1100);
  }

  $('pickerClose').addEventListener('click', () => closeBubble());
  $('colorChip').addEventListener('click', () => {
    const r = $('colorChip').getBoundingClientRect();
    openBubble(r.left + r.width / 2, r.top);
  });

  function setControls(v) {
    controls = v;
    store.set('controls', v);
    lastTap = null;
    closeBubble();
    renderBar();
  }

  document.addEventListener('pointerdown', e => {
    if (!bubble || $('regionPicker').contains(e.target) || $('colorChip').contains(e.target)) return;
    if (svg.contains(e.target)) return;
    closeBubble();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && bubble) { e.preventDefault(); closeBubble(); }
  });

  // ---------- popups ----------
  function showCard(html) {
    closeBubble();
    $('card').innerHTML = html;
    $('overlay').classList.remove('hidden');
  }
  function hideCard() { $('overlay').classList.add('hidden'); }

  const STAR = `<svg viewBox="0 0 48 48"><path d="M24 4.5l5.9 12 13.2 1.9-9.6 9.3 2.3 13.1L24 34.6l-11.8 6.2 2.3-13.1-9.6-9.3 13.2-1.9z" fill="#ffd23f" stroke="#c98a00" stroke-width="2.4" stroke-linejoin="round"/><path d="M17 19.5l4.6-.7 2.4-4.8" stroke="#fff6c8" stroke-width="2.6" fill="none" stroke-linecap="round"/></svg>`;
  const ICON_TAP = `<svg viewBox="0 0 48 48"><rect x="4" y="4" width="40" height="40" rx="10" fill="#fff"/><circle cx="19" cy="20" r="4.5" fill="#8ca473"/><circle cx="30" cy="20" r="4.5" fill="#d6bd6f"/><circle cx="24" cy="31" r="4.5" fill="#7f9bb8"/></svg>`;
  const ICON_PALETTE = `<svg viewBox="0 0 48 48"><rect x="2" y="9" width="44" height="30" rx="7" fill="#294f43"/><rect x="5" y="15" width="8" height="17" rx="2" fill="#8ca473" stroke="#faf3df" stroke-width="2"/><rect x="15" y="16" width="8" height="15" rx="2" fill="#d6bd6f"/><rect x="25" y="16" width="8" height="15" rx="2" fill="#bf8c70"/><rect x="35" y="16" width="8" height="15" rx="2" fill="#7f9bb8"/></svg>`;
  const ICON_LOCK = `<svg viewBox="0 0 48 48"><rect x="4" y="4" width="40" height="40" rx="10" fill="#ddd6bd"/><rect x="7" y="15" width="34" height="18" rx="6" fill="#e7c77a" stroke="#6b4a1f" stroke-width="1.6"/><path d="${LOCK_ICON}" fill="#6b4a1f" transform="translate(11 18.5) scale(1.25)"/><text x="30" y="29.5" font-size="13" text-anchor="middle" fill="#6b4a1f" font-family="Rounded,sans-serif" font-weight="900">3</text></svg>`;
  const ICON_RULE = `<svg viewBox="0 0 48 48"><rect x="4" y="4" width="40" height="40" rx="10" fill="#fff"/><path d="M8 10h14l4 14-4 14H8z" fill="#7f9bb8"/><path d="M26 24l-4 14h18V10H22z" fill="#7f9bb8"/><path d="M22 10l4 14-4 14" stroke="#e2343f" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`;

  function showHow() {
    const steps = {
      v1: `${ICON_PALETTE}<span><b>Renk seç:</b> alttaki dört renkten biri hep seçilidir, değiştirmek için dokun.</span>
        ${ICON_TAP}<span><b>Tek dokun:</b> bölgeye seçili rengin notunu koy. <b>Çift dokun:</b> bölgeyi boya.</span>`,
      v3: `${ICON_PALETTE}<span><b>Renk balonu:</b> haritaya dokununca balon açılır, rengi seç. Değiştirmek için haritaya basılı tut ya da alttaki renk düğmesine dokun.</span>
        ${ICON_TAP}<span><b>Tek dokun:</b> bölgeye seçili rengin notunu koy. <b>Çift dokun:</b> bölgeyi boya.</span>`,
    };
    showCard(`
      <button class="close" data-act="close" aria-label="Kapat"></button>
      <h2>NASIL OYNANIR</h2>
      <div class="how">
        ${ICON_RULE}<span>Birbirine değen bölgeler aynı renk olamaz.</span>
        ${steps[controls]}
        ${ICON_LOCK}<span><b>Kilitli bölge:</b> üstündeki sayı kadar bölge boyayınca rengi açılır.</span>
      </div>
      <button class="btn-green" data-act="close">OYNA</button>`);
  }

  function segRow(label, act, options, current, desc) {
    return `<div class="controls-setting">
        <span class="setting-label">${label}</span>
        <div class="seg" role="radiogroup" aria-label="${label}">
          ${options.map(([v, name]) => `<button role="radio" aria-checked="${v === current}" data-act="${act}" data-v="${v}">${name}</button>`).join('')}
        </div>
        <p class="setting-desc">${desc}</p>
      </div>`;
  }

  function showSettings() {
    showCard(`
      <button class="close" data-act="close" aria-label="Kapat"></button>
      <h2>AYARLAR</h2>
      ${segRow('KONTROL', 'controls', Object.entries(CONTROLS).map(([v, c]) => [v, c.name]), controls, CONTROLS[controls].desc)}
      ${segRow('CAN', 'lives', [['on', 'VAR'], ['off', 'YOK']], livesOn ? 'on' : 'off',
        livesOn ? 'Komşuyla aynı renge boyamak bir can götürür.' : 'Serbestçe boya. Harita dolunca doğruysa sonraki bölüme geçilir, yanlışsa “Yanlış çözüm” yazar.')}
      ${segRow('BAŞLANGIÇ', 'start', [['clues', 'İPUÇLU'], ['empty', 'BOŞ']], startMode,
        (startMode === 'clues' ? 'Bölüm hazır boyalı bölgeler ve kilitlerle açılır.' : 'Bölüm hiç boyasız açılır; kurala uyan her boyama çözümdür.') + ' Değişince bölüm baştan başlar.')}
      <button class="btn-flat" data-act="sound">SES: ${S.sound ? 'AÇIK' : 'KAPALI'}</button>
      <button class="btn-flat" data-act="how">NASIL OYNANIR</button>
      <button class="btn-flat" data-act="retry">YENİDEN BAŞLA</button>
      <button class="btn-flat" data-act="skip">BÖLÜMÜ ATLA (TASLAK)</button>`);
  }

  function setLives(on) {
    if (livesOn === on) return;
    livesOn = on;
    store.set('lives', on);
    if (on) S.lives = MAX_LIVES;
    render();
  }

  function setStart(mode) {
    if (startMode === mode) return;
    startMode = mode;
    store.set('start', mode);
    startLevel(S.level);
  }

  $('card').addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'close') hideCard();
    else if (act === 'next') { hideCard(); startLevel(S.level + 1); }
    else if (act === 'retry') { hideCard(); startLevel(S.level); }
    else if (act === 'skip') { hideCard(); startLevel(S.level + 1); }
    else if (act === 'how') showHow();
    else if (act === 'sound') { S.sound = !S.sound; store.set('sound', S.sound); showSettings(); }
    else if (act === 'controls') { setControls(b.dataset.v); showSettings(); }
    else if (act === 'lives') { setLives(b.dataset.v === 'on'); showSettings(); }
    else if (act === 'start') { setStart(b.dataset.v); showSettings(); }
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
    choose: chooseColor,
    pick: pickFromBubble,
    bubble: openBubble,
    controls: setControls,
    lives: setLives,
    start: setStart,
    level: startLevel,
    solveAll() {
      S.puzzle.solution.forEach((c, r) => { S.fill[r] = c; });
      render(); checkWin();
    },
  };
})();
