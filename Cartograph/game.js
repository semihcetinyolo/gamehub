(function () {
  'use strict';

  const E = window.CartoEngine;
  const NS = 'http://www.w3.org/2000/svg';
  // Pale palettes use a light, cool paper tone to separate warm cream panes without darkening the board.
  const PAPER = '#efeddc', PAPER_COOL = '#e5e9e8';
  // A near-white glass colour on a pale empty pane reads as "already painted" (user, 2026-10-20:
  // "beyaz üstüne beyaz"). Auto then uses sand when that sets the empty panes clearly apart
  // (fox, sailboat, waterfall, snowflake). Grey was tried and rejected as ugly.
  const PAPER_SAND = '#d8cbb5';
  const EMPTY_TONES = [
    { id: 'auto', name: 'Otomatik', color: null },
    { id: 'ivory', name: 'Fildişi', color: '#f6f3ea' },
    { id: 'sand', name: 'Kum', color: '#d8cbb5' },
    { id: 'stone', name: 'Taş grisi', color: '#b8bdbb' },
    { id: 'mist', name: 'Buz mavisi', color: '#c4d3db' },
    { id: 'slate', name: 'Arduvaz', color: '#667580' },
  ];
  let EMPTY = PAPER;
  let PALETTE = [];
  const START_HINTS = 3;

  const $ = id => document.getElementById(id);
  const svg = $('board');
  const store = {
    get(k, d) { try { const v = localStorage.getItem('carto.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('carto.' + k, JSON.stringify(v)); } catch { /* private mode */ } },
  };
  let emptyTone = store.get('emptyTone', 'auto');
  if (!EMPTY_TONES.some(tone => tone.id === emptyTone)) emptyTone = 'auto';
  // 3D is the default look (user, 2026-10-03); a choice saved before that is reset once.
  if (store.get('boardLookVersion', 0) < 1) {
    try { localStorage.removeItem('carto.boardLook'); } catch { /* private mode */ }
    store.set('boardLookVersion', 1);
  }
  let boardLook = store.get('boardLook', '3d') === 'classic' ? 'classic' : '3d';
  $('app').dataset.boardLook = boardLook;

  // One way to play: pick a colour at the bottom, tap a pane to paint it (the same colour again clears it).
  // No hearts: anything can be painted; a full board is either the panel or shows its clashes.
  const S = {
    level: store.get('level', 1),
    sound: store.get('sound', true),
    puzzle: null, given: [], fill: [], color: 0,
    hints: START_HINTS, done: false,
  };
  let locksShown = false;
  let layers = {};
  let regionEls = [];
  const paintSpreads = new Map();
  let paintSpreadId = 0;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

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
    clearPaintSpreads();
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
    layers.conflict = el('g', { class: 'conflict', 'pointer-events': 'none', 'aria-hidden': 'true' }, layers.surface);
    mistakeKey = ''; wrongOn = false; preFocus = null; clearTimeout(wrongTimer);
    layers.locks = el('g', { class: 'locks', 'pointer-events': 'none', 'aria-hidden': 'true' }, layers.surface);
    locksShown = false;
    layers.coach = el('g', { 'pointer-events': 'none' }, layers.surface);
    if (boardLook === '3d') buildDepth();
    fitBoard(true);
  }

  // Reuse the playable paths: lighting never changes geometry or hit targets.
  function buildDepth() {
    if (layers.depth) return;
    const defs = svg.querySelector('defs'), { map } = S.puzzle;
    [EMPTY, ...PALETTE.map(p => p.base)].forEach((color, i) => {
      const gradient = el('linearGradient', { id: 'tileColor' + i, x1: '0%', y1: '0%', x2: '75%', y2: '100%' }, defs);
      setTileGradient(gradient, color);
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

  function setTileGradient(gradient, color) {
    gradient.replaceChildren();
    [[0, shade(color, .22)], [.35, shade(color, .05)], [.7, color], [1, shade(color, -.18)]].forEach(([offset, value]) => {
      el('stop', { offset, 'stop-color': value }, gradient);
    });
  }

  function emptyColor(id = emptyTone) {
    const tone = EMPTY_TONES.find(option => option.id === id);
    if (tone && tone.color) return tone.color;
    const base = PALETTE.some(p => luminance(p.base) > 0.7) ? PAPER_COOL : PAPER;
    const gap = c => Math.min(...PALETTE.map(p => deltaE(p.base, c)));
    return gap(base) < 20 && gap(PAPER_SAND) > gap(base) + 5 ? PAPER_SAND : base;
  }

  function setEmptyTone(id) {
    if (!EMPTY_TONES.some(tone => tone.id === id)) return;
    clearPaintSpreads();
    emptyTone = id;
    store.set('emptyTone', id);
    EMPTY = emptyColor();
    const gradient = svg.querySelector('#tileColor0');
    if (gradient) setTileGradient(gradient, EMPTY);
    clearHint();
    render();
  }

  function setBoardLook(value) {
    clearPaintSpreads();
    boardLook = value === '3d' ? '3d' : 'classic';
    store.set('boardLook', boardLook);
    $('app').dataset.boardLook = boardLook;
    clearHint();
    if (boardLook === '3d') buildDepth();
    render();
  }

  function fitBoard(reset = false) {
    if (!S.puzzle) return;
    const { cols, rows } = S.puzzle.map;
    const stage = $('stage').getBoundingClientRect();
    const pad = parseFloat(getComputedStyle($('boardCard')).paddingLeft) * 2;
    const stageStyle = getComputedStyle($('stage'));
    const availW = stage.width - parseFloat(stageStyle.paddingLeft) - parseFloat(stageStyle.paddingRight) - pad;
    const availH = stage.height - parseFloat(stageStyle.paddingTop) - parseFloat(stageStyle.paddingBottom) - pad;
    const cell = Math.max(1, Math.min(availW / cols, availH / rows));
    const oldW = parseFloat(svg.style.width) || 1, oldH = parseFloat(svg.style.height) || 1;
    svg.style.width = Math.floor(cell * cols) + 'px';
    svg.style.height = Math.floor(cell * rows) + 'px';
    if (reset) setZoom(1, 0, 0); // every level, large ones too, opens showing the whole panel
    else setZoom(Z.z, Z.x * parseFloat(svg.style.width) / oldW, Z.y * parseFloat(svg.style.height) / oldH);
  }

  function regionGeom(r) {
    const outline = S.puzzle.map.outlines[r];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of outline) {
      x0 = Math.min(x0, s[0], s[2]); x1 = Math.max(x1, s[0], s[2]);
      y0 = Math.min(y0, s[1], s[3]); y1 = Math.max(y1, s[1], s[3]);
    }
    return { outline, box: [x0, y0, x1, y1] };
  }

  // Commit paint immediately, then reveal it over the previous colour. Both paths
  // retain the pane's exact geometry and gradient bounds, underneath its bevel/seams.
  function spreadPaint(r, previousColor, origin) {
    paintSpreads.get(r)?.finish();
    if (reducedMotion.matches) return;
    const { map } = S.puzzle;
    const [x, y] = origin || map.anchors[r];
    const bounds = regionEls[r].path.getBBox();
    const pad = .06;
    const x0 = bounds.x - pad, y0 = bounds.y - pad;
    const x1 = bounds.x + bounds.width + pad, y1 = bounds.y + bounds.height + pad;
    const radius = Math.max(...[[x0, y0], [x1, y0], [x0, y1], [x1, y1]]
      .map(([px, py]) => Math.hypot(px - x, py - y))) / .88;
    const id = 'paintSpread' + ++paintSpreadId;
    const defs = svg.querySelector('defs');
    const gradient = el('radialGradient', {
      id: id + 'Gradient', gradientUnits: 'userSpaceOnUse', cx: x, cy: y, r: .001,
    }, defs);
    [[0, 1], [.88, 1], [1, 0]].forEach(([offset, opacity]) => {
      el('stop', { offset, 'stop-color': '#fff', 'stop-opacity': opacity }, gradient);
    });
    const mask = el('mask', {
      id, maskUnits: 'userSpaceOnUse', maskContentUnits: 'userSpaceOnUse',
      x: x0, y: y0, width: x1 - x0, height: y1 - y0,
    }, defs);
    el('rect', { x: x0, y: y0, width: x1 - x0, height: y1 - y0, fill: `url(#${id}Gradient)` }, mask);
    const overlay = el('g', { 'pointer-events': 'none', 'aria-hidden': 'true' }, regionEls[r].g);
    const attrs = { d: map.paths[r], 'stroke-width': .04, 'stroke-linejoin': 'round' };
    const previous = panePaint(previousColor), next = panePaint(S.fill[r]);
    el('path', { ...attrs, fill: previous, stroke: previous }, overlay);
    el('path', { ...attrs, fill: next, stroke: next, mask: `url(#${id})` }, overlay);
    let frame = 0, timer = 0, finished = false, resolve;
    const done = new Promise(complete => { resolve = complete; });
    const finish = () => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      overlay.remove(); mask.remove(); gradient.remove();
      paintSpreads.delete(r);
      resolve();
    };
    paintSpreads.set(r, { finish, done });
    const started = performance.now(), duration = 380;
    const step = now => {
      const t = Math.min(1, (now - started) / duration);
      if (t >= 1 || reducedMotion.matches) { finish(); return; }
      gradient.setAttribute('r', Math.max(.001, radius * (1 - Math.pow(1 - t, 3))));
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    // Also settle while the tab is hidden and animation frames are suspended.
    timer = setTimeout(finish, duration + 80);
  }

  function clearPaintSpreads() {
    for (const spread of paintSpreads.values()) spread.finish();
  }

  // ---------- render ----------
  function render() {
    const { map } = S.puzzle;
    for (let r = 0; r < map.count; r++) {
      const c = S.fill[r];
      const paint = panePaint(c);
      regionEls[r].path.setAttribute('fill', paint);
      regionEls[r].path.setAttribute('stroke', paint);
    }
    showMistakes();
    const filled = S.fill.filter(c => c >= 0).length;
    $('progress').textContent = `${filled}/${map.count}`;
    const hard = S.puzzle.glass.difficulty?.tier === 'hard';
    $('levelPill').textContent = 'SEVİYE ' + S.level + (hard ? ' · ZOR' : '');
    $('levelPill').classList.toggle('is-hard', hard);
    const badge = $('hintBadge');
    badge.textContent = S.hints > 0 ? S.hints : '+';
    badge.classList.toggle('plus', S.hints <= 0);
  }

  const popcount = m => { let c = 0; while (m) { c += m & 1; m >>= 1; } return c; };
  const clashEdges = () => S.puzzle.map.edges.filter(e => S.fill[e[4]] >= 0 && S.fill[e[4]] === S.fill[e[5]]);

  // A full board that isn't the panel. Each pair of same-coloured neighbours gets a golden glow on
  // their shared border and a brass lens (assets/wrong/wrong-lens.webp) over it; right after the
  // board fills, everything else dims until the next tap. The bar under the board steps through them.
  // After WRONG_MS it all fades and the board looks normal again; the next paint that leaves the
  // board full and wrong shows it again.
  const LENS = { src: 'assets/wrong/wrong-lens.webp', cx: 0.428, cy: 0.413, r: 0.35 }; // tools/wrong/build_art.py
  const LENS_PX = 26; // lens ring radius on screen at zoom 1
  const WRONG_MS = 3000;
  let wrongOn = false, wrongDim = false, wrongTimer = 0, clashStep = 0, clashList = [], mistakeKey = '';
  let preFocus = null; // the zoom before ‹ › moved it, put back when the marks fade

  function flashMistakes() {
    if (!wrongOn) { wrongDim = true; clashStep = 0; }
    wrongOn = true;
    setFading(false);
    keepMistakes();
    showMistakes();
  }
  function keepMistakes() {
    clearTimeout(wrongTimer);
    wrongTimer = setTimeout(() => {
      setFading(true);
      wrongTimer = setTimeout(() => { setFading(false); wrongOn = false; wrongDim = false; showMistakes(); restoreFocus(); }, 450);
    }, WRONG_MS);
  }
  function restoreFocus() {
    if (!preFocus) return;
    svg.classList.add('glide');
    setZoom(preFocus.z, preFocus.x, preFocus.y);
    preFocus = null;
    setTimeout(() => svg.classList.remove('glide'), 400);
  }
  function setFading(on) {
    for (const n of [layers.wrong, layers.conflict, $('clashBar')]) n.classList.toggle('fade-out', on);
  }

  function clashPairs(clashes) {
    const by = new Map();
    for (const e of clashes) {
      const k = e[4] + '-' + e[5];
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(e);
    }
    return [...by.values()].map(segs => {
      // the lens goes on the border, at the segment nearest the border's middle
      const mids = segs.map(e => [(e[0] + e[2]) / 2, (e[1] + e[3]) / 2]);
      const mx = mids.reduce((t, m) => t + m[0], 0) / mids.length, my = mids.reduce((t, m) => t + m[1], 0) / mids.length;
      const at = mids.reduce((b, m) => (Math.hypot(m[0] - mx, m[1] - my) < Math.hypot(b[0] - mx, b[1] - my) ? m : b));
      return { a: segs[0][4], b: segs[0][5], segs, at };
    });
  }

  function showMistakes() {
    const full = S.fill.every(c => c >= 0);
    const pairs = wrongOn && full && !S.done ? clashPairs(clashEdges()) : [];
    if (!pairs.length) { wrongOn = false; wrongDim = false; clearTimeout(wrongTimer); setFading(false); }
    clashList = pairs;
    clashStep = Math.min(clashStep, Math.max(0, pairs.length - 1));
    renderClashBar();
    const { map } = S.puzzle;
    const size = parseFloat(svg.style.width) || 1;
    const key = pairs.map(p => p.a + '-' + p.b).join() + '|' + wrongDim + '|' + size;
    if (key === mistakeKey) return;
    mistakeKey = key;
    layers.wrong.innerHTML = '';
    layers.conflict.innerHTML = '';
    if (!pairs.length) return;
    if (wrongDim) {
      const mask = el('mask', { id: 'wrongMask', maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: map.cols, height: map.rows }, layers.wrong);
      el('rect', { width: map.cols, height: map.rows, fill: '#fff' }, mask);
      for (const r of new Set(pairs.flatMap(p => [p.a, p.b]))) el('path', { d: map.paths[r], fill: '#000' }, mask);
      el('rect', { class: 'wrong-dim', width: map.cols, height: map.rows, fill: '#14201a', mask: 'url(#wrongMask)' }, layers.wrong);
    }
    const ring = LENS_PX * map.cols / size, d = ring / LENS.r;
    pairs.forEach((p, i) => {
      const g = el('g', { class: 'clash', 'data-i': i }, layers.conflict);
      const seam = edgesPath(p.segs);
      for (const [w, color, op] of [[15, '#ffd36a', 0.28], [8, '#ffd36a', 0.55], [3.5, '#fff6d2', 1]]) {
        el('path', { d: seam, fill: 'none', stroke: color, 'stroke-opacity': op, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' }, g);
      }
      el('image', { class: 'lens', href: LENS.src, width: fmt(d), height: fmt(d), x: fmt(p.at[0] - LENS.cx * d), y: fmt(p.at[1] - LENS.cy * d) }, g);
    });
  }

  function renderClashBar() {
    const n = clashList.length;
    $('clashBar').hidden = !n;
    // the bar needs more room under the board than the rule line; refit when it comes or goes
    if ($('stage').classList.contains('has-clash') !== !!n) { $('stage').classList.toggle('has-clash', !!n); fitBoard(); }
    if (!n) return;
    $('clashCount').textContent = `${n} yerde · birini değiştir`;
    $('clashIdx').textContent = `${clashStep + 1}/${n}`;
  }

  // Zoom in on one clash and slide the board so its lens sits in the middle.
  function focusClash(step) {
    if (!clashList.length) return;
    clashStep = (step + clashList.length) % clashList.length;
    setFading(false);
    keepMistakes(); // looking around keeps the marks up
    renderClashBar();
    const { map } = S.puzzle, p = clashList[clashStep];
    const w = parseFloat(svg.style.width), h = parseFloat(svg.style.height), z = Math.max(Z.z, 2.2);
    if (!preFocus) preFocus = { ...Z };
    svg.classList.add('glide');
    setZoom(z, -z * (p.at[0] / map.cols - 0.5) * w, -z * (p.at[1] / map.rows - 0.5) * h);
    setTimeout(() => svg.classList.remove('glide'), 400);
    const g = layers.conflict.querySelector(`[data-i="${clashStep}"]`);
    if (g) { g.classList.remove('nudge'); void g.getBBox(); g.classList.add('nudge'); }
    sfx.select();
  }
  $('clashPrev').addEventListener('click', () => focusClash(clashStep - 1));
  $('clashNext').addEventListener('click', () => focusClash(clashStep + 1));

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
  // Every level is a stained-glass panel; after the last one it starts over.
  // STAINED is the active list (V2 by default, see setLevelVersion), shared with menu.js.
  const STAINED = window.CARTO_LEVELS = (window.CARTO_STAINED_V2 || window.CARTO_STAINED).slice();
  const wrap = n => ((n - 1) % STAINED.length + STAINED.length) % STAINED.length + 1;

  // Level lists (user, 2026-10-21): V2 is the default, the new real-stained-glass
  // drawings (stained-levels-v2.js, shipped with the page): the tutorial cat, a ramp
  // of small panels, then the Pinterest panels and every subject level redrawn.
  // V1 is the original catalogue (stained-levels.js, loaded when chosen).
  // Each list remembers its own current level; solved panels are kept per level id.
  const VERSIONS = [
    { id: 'v1', name: 'V1', note: 'İlk çizimler' },
    { id: 'v2', name: 'V2', note: 'Yeni vitraylar' },
  ];
  const LIST_FILES = { v1: ['CARTO_STAINED', 'stained-levels.js'], v2: ['CARTO_STAINED_V2', 'stained-levels-v2.js'] };
  let levelVersion = 'v2';
  function savedLevelId(version) {
    const id = store.get('levelId.' + version, null);
    if (id || version !== 'v1') return id;
    // V1 positions from before the lists existed (and from older V1 orders).
    const order = window.CARTO_STAINED_ORDER;
    return store.get('levelId', null) || (store.get('levelOrder', null) !== order?.version
      ? order?.previousIds[store.get('level', 1) - 1] : null);
  }
  function setLevelVersion(version, done) {
    const [global, file] = LIST_FILES[version];
    const apply = () => {
      const list = window[global];
      if (!list || !list.length) { toast('Bölümler yüklenemedi', 2200); return; }
      STAINED.splice(0, STAINED.length, ...list);
      levelVersion = version;
      store.set('levelList', version);
      const saved = STAINED.findIndex(L => L.id === savedLevelId(version));
      S.level = saved >= 0 ? saved + 1 : 1;
      done && done();
    };
    if (window[global]) return apply();
    const script = document.createElement('script');
    script.src = file;
    script.onload = apply;
    script.onerror = () => toast('Bölümler yüklenemedi', 2200);
    document.head.appendChild(script);
  }
  let glassTimer = 0, glassImage = null;

  // Maps ship only shared edges + rim segments; each pane's outline is rebuilt here.
  function outlinesOf(map) {
    const out = Array.from({ length: map.count }, () => []);
    for (const [x1, y1, x2, y2, a, b] of map.edges) { out[a].push([x1, y1, x2, y2]); out[b].push([x1, y1, x2, y2]); }
    for (const [x1, y1, x2, y2, a] of map.rim) out[a].push([x1, y1, x2, y2]);
    return out;
  }

  // quiet: set the board up behind the main menu without starting the tutorial yet.
  function startLevel(n, quiet) {
    n = wrap(n);
    S.level = n;
    const glass = STAINED[n - 1];
    store.set('levelId.' + levelVersion, glass.id);
    if (levelVersion === 'v1') {
      store.set('level', n); store.set('levelId', glass.id);
      if (window.CARTO_STAINED_ORDER) store.set('levelOrder', window.CARTO_STAINED_ORDER.version);
    }
    if (!glass.map.outlines) glass.map.outlines = outlinesOf(glass.map);
    setupPuzzle({ map: glass.map, given: glass.given, solution: glass.solution, glass });
    if (!quiet) maybeCoach();
    if (!quiet && glass.canvasSize === 'large') toast('Büyük vitray · İstersen +/− ile yakınlaştır', 3000);
  }
  const maybeCoach = () => { if (S.level === 1 && !store.get('tutorial', false) && !S.done) startCoach(); };

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
    EMPTY = emptyColor();
    glassImage = new Image();
    glassImage.src = puzzle.glass.image;
    $('dock').classList.remove('art-finished');
    $('dock').style.minHeight = '';
    $('mapRule').textContent = 'KOMŞU BÖLGELER, FARKLI RENKLER';
    S.puzzle = puzzle;
    S.given = puzzle.given.slice();
    S.fill = S.given.slice();
    S.hints = S.level === 1 ? START_HINTS + 2 : START_HINTS;
    S.hintsUsed = 0;
    S.done = false;
    $('boardCard').classList.remove('won', 'stained');
    $('zoomTools').hidden = false;
    buildBoard();
    render();
    renderBar();
  }

  // ---------- zoom ----------
  // Pinch (or the +/− buttons, or the mouse wheel) zooms the board up to 6×; one finger drags it
  // while zoomed. A gesture never counts as a tap.
  const MAX_ZOOM = 6;
  const Z = { z: 1, x: 0, y: 0 };
  const pointers = new Map();
  let gesture = null, quietUntil = 0, zoomRest = 0;

  function setZoom(z, x, y) {
    z = Math.max(1, Math.min(MAX_ZOOM, z));
    const w = parseFloat(svg.style.width) || 0, h = parseFloat(svg.style.height) || 0;
    const mx = w * (z - 1) / 2, my = h * (z - 1) / 2;
    Z.z = z;
    Z.x = Math.max(-mx, Math.min(mx, x));
    Z.y = Math.max(-my, Math.min(my, y));
    svg.style.transform = z === 1 ? '' : `translate(${Z.x}px, ${Z.y}px) scale(${z})`;
    // While the board moves it rides on its own GPU layer (smooth, but painted at the old size);
    // once it rests the layer is dropped so the browser redraws the vectors sharp at the new zoom.
    svg.classList.add('zooming');
    clearTimeout(zoomRest);
    zoomRest = setTimeout(() => svg.classList.remove('zooming'), 450);
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
    const matrix = svg.getScreenCTM();
    const point = svg.createSVGPoint();
    point.x = e.clientX; point.y = e.clientY;
    const local = matrix && point.matrixTransform(matrix.inverse());
    tapRegion(+g.dataset.r, local ? [local.x, local.y] : undefined);
  });
  svg.addEventListener('dblclick', e => e.preventDefault());
  svg.addEventListener('keydown', e => {
    const region = e.target.closest('.region');
    if (region && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      tapRegion(+region.dataset.r);
    }
  });

  // A tap on a pre-painted pane shows a lock on every pre-painted pane; the next tap hides them.
  function showLocks(on) {
    locksShown = on;
    layers.locks.innerHTML = '';
    if (!on) return;
    const { map } = S.puzzle;
    for (let r = 0; r < map.count; r++) {
      if (S.given[r] < 0) continue;
      const [x, y] = map.anchors[r];
      const g = el('g', { class: 'lock-pop' }, el('g', { transform: `translate(${fmt(x)} ${fmt(y + 0.03)}) scale(0.5)` }, layers.locks));
      el('path', { d: 'M-0.21 -0.06V-0.24A0.21 0.21 0 0 1 0.21 -0.24V-0.06', fill: 'none', stroke: '#fff', 'stroke-width': 0.26, 'stroke-linecap': 'round' }, g);
      el('path', { d: 'M-0.21 -0.06V-0.24A0.21 0.21 0 0 1 0.21 -0.24V-0.06', fill: 'none', stroke: '#2f362a', 'stroke-width': 0.12, 'stroke-linecap': 'round' }, g);
      el('rect', { x: -0.33, y: -0.1, width: 0.66, height: 0.52, rx: 0.1, fill: '#2f362a', stroke: '#fff', 'stroke-width': 0.08, 'paint-order': 'stroke fill' }, g);
      el('path', { d: 'M0 0.06a0.07 0.07 0 0 1 0.04 0.13l0.02 0.11h-0.12l0.02 -0.11a0.07 0.07 0 0 1 0.04 -0.13z', fill: '#f4ecd8' }, g);
    }
  }

  function tapRegion(r, origin) {
    if (S.done) return;
    if (wrongDim) { wrongDim = false; showMistakes(); }
    if (S.given[r] >= 0) {
      pulse(r, 'flash'); sfx.select();
      showLocks(!locksShown);
      return;
    }
    if (coach && coach.step !== 'done') {
      if (coach.step === 'welcome') { toast('Başlamak için HAZIRIM düğmesine dokun'); return; }
      if (r !== coach.r) { toast('Önce parlayan bölgeyi deneyelim'); return; }
      if (coach.step === 'color') { toast('Önce aşağıdaki parlayan rengi seç'); return; }
    }
    paintRegion(r, S.color, origin);
  }

  function paintRegion(r, c, origin) {
    const previousColor = S.fill[r];
    paintSpreads.get(r)?.finish();
    const next = S.fill[r] === c ? -1 : c;
    if (S.fill[r] < 0 && next >= 0) store.set('stats.panes', store.get('stats.panes', 0) + 1);
    S.fill[r] = next;
    if (next >= 0) { sfx.paint(); buzz(8); } else sfx.erase();
    clearHint();
    render();
    if (next >= 0) spreadPaint(r, previousColor, origin);
    coachEvent('paint', r);
    checkWin();
  }

  function selectColor(c) {
    if (S.done) return;
    if (S.color !== c) { S.color = c; sfx.select(); }
    renderBar();
    coachEvent('color', c);
  }

  function checkWin() {
    if (S.done || S.fill.some(c => c < 0)) return;
    const clashes = clashEdges();
    if (clashes.length) {
      sfx.bad(); buzz([30, 40, 30]); shakeBoard();
      $('toast').classList.remove('show');
      flashMistakes();
      return;
    }
    S.done = true;
    showLocks(false);
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
      await Promise.all([glassImage.decode(), ...[...paintSpreads.values()].map(spread => spread.done)]);
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
    const art = el('g', { class: 'glass-art', 'pointer-events': 'none', role: 'img', 'aria-label': glass.name + ' — tamamlanmış vitray' }, layers.surface);
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
    store.set('levelId.' + levelVersion, STAINED[wrap(S.level + 1) - 1].id);
    if (levelVersion === 'v1') store.set('level', wrap(S.level + 1));
    store.set('solved', [...new Set([...store.get('solved', []), glass.id])]);
    if (!S.hintsUsed) store.set('perfect', [...new Set([...store.get('perfect', []), glass.id])]);
    window.dispatchEvent(new CustomEvent('carto:solved', { detail: { id: glass.id, level: S.level } }));
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

  function lab(hex) {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92));
    const f = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047), y = f(r * 0.2126 + g * 0.7152 + b * 0.0722), z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  }
  const deltaE = (a, b) => { const A = lab(a), B = lab(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };

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
    if (coach && coach.step !== 'done') { toast('Önce kısa eğitimi tamamlayalım'); return; }
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
    clearPaintSpreads();
    // Wrong neighbours would block the correct colour; clear them first.
    for (const j of map.adj[target]) {
      if (given[j] < 0 && S.fill[j] === solution[target]) S.fill[j] = -1;
    }
    const previousColor = S.fill[target];
    S.fill[target] = solution[target];
    S.hints--;
    S.hintsUsed++;
    store.set('stats.hints', store.get('stats.hints', 0) + 1);
    sfx.hint();
    clearHint();
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
  // A twelve-pane cat with four empty panes: rules, colour choice, paint, then the rest alone.
  let coach = null; // { step, r, c }
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
    const lesson = S.puzzle.glass.tutorial;
    const r = lesson && forced.includes(lesson.paint) ? lesson.paint : forced[0];
    coach = { step: 'welcome', r, c: sol[r] };
    if (S.color === coach.c) { S.color = (coach.c + 1) % 4; renderBar(); }
    showCoach();
  }

  function showCoach() {
    if (!coach) return;
    const box = $('coach');
    const name = PALETTE[coach.c].name.toLocaleLowerCase('tr');
    const texts = {
      welcome: `Bu kediyi birlikte boyayalım! Yalnızca <b>${S.fill.filter(c => c < 0).length} boş alan</b> var. <b>Çizgili alanlar hazırdır.</b> Kenarı ortak olan alanlar farklı renk olmalı.`,
      color: `Parlayan bölgenin komşularında üç renk var. Geriye <b>${name}</b> kalıyor. Aşağıdan parlayan <b>${name}</b> rengini seç.`,
      paint: `Parlayan bölgeye <b>dokun</b>. Seçtiğin renk bütün alanı boyar.`,
      done: `<b>Bir dokunuş boyar; aynı renkle yeniden dokunmak siler.</b> Şimdi kalan <b>${S.fill.filter(c => c < 0).length} alanı</b> tamamla.`,
    };
    const titles = { welcome: '1 / 3 · KURAL', color: '2 / 3 · RENGİ SEÇ', paint: '3 / 3 · BOYA', done: 'SIRA SENDE' };
    box.innerHTML = `<span class="coach-step">${titles[coach.step]}</span><p>${texts[coach.step]}</p>`
      + (coach.step === 'welcome' ? '<button class="btn-green" type="button" id="coachReady">HAZIRIM</button>' : '')
      + (coach.step === 'done' ? '<button class="btn-green" type="button" id="coachOk">DEVAM ET</button>' : '<button class="coach-skip" type="button" id="coachSkip">Eğitimi geç</button>');
    box.hidden = false;
    const ok = $('coachOk'), skip = $('coachSkip');
    if (ok) ok.addEventListener('click', () => endCoach(true));
    const ready = $('coachReady');
    if (ready) ready.addEventListener('click', () => { coach.step = 'color'; showCoach(); });
    if (skip) skip.addEventListener('click', () => endCoach(true));
    colorButtons.forEach((b, c) => b.classList.toggle('coach-target', coach.step === 'color' && c === coach.c));
    layers.coach.innerHTML = '';
    const target = ['done', 'welcome'].includes(coach.step) ? -1 : coach.r;
    if (target >= 0) {
      el('path', {
        class: 'coach-ring', d: edgesPath(S.puzzle.map.outlines[target]), fill: 'none', stroke: '#fff7d6',
        'stroke-width': 6, 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke',
      }, layers.coach);
    }
    placeCoach();
  }

  // Sit on the half of the screen away from the glowing pane: over the header when the pane is
  // low, just above the colour bar when it is high.
  function placeCoach() {
    const box = $('coach');
    if (!coach || box.hidden) return;
    const app = $('app').getBoundingClientRect(), board = svg.getBoundingClientRect(), dock = $('dock').getBoundingClientRect();
    const { map } = S.puzzle;
    const target = coach.r;
    const y = coach.step !== 'done' ? board.top + map.anchors[target][1] / map.rows * board.height : board.bottom;
    const low = y > board.top + board.height * 0.5;
    box.style.top = (low ? 8 : Math.max(8, dock.top - app.top - box.offsetHeight - 8)) + 'px';
  }

  function coachEvent(kind, v) {
    if (!coach) return;
    if (coach.step === 'color' && kind === 'color' && v === coach.c) coach.step = 'paint';
    else if (coach.step === 'paint' && kind === 'color' && v !== coach.c) coach.step = 'color';
    else if (coach.step === 'paint' && kind === 'paint' && v === coach.r) {
      if (S.fill[coach.r] !== coach.c) { toast('Bu renk olmaz, komşusuyla aynı. Tekrar dene'); return; }
      coach.step = 'done';
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

  const ICON_TAP = `<svg viewBox="0 0 48 48"><rect x="4" y="4" width="40" height="40" rx="10" fill="#efeddc"/><path d="M9 9h30v30H9z" fill="#8ca473"/><circle cx="26" cy="24" r="6" fill="#fff" fill-opacity=".85"/><circle cx="26" cy="24" r="10.5" fill="none" stroke="#fff" stroke-width="2" stroke-opacity=".7"/></svg>`;
  const ICON_PALETTE = `<svg viewBox="0 0 48 48"><rect x="2" y="9" width="44" height="30" rx="7" fill="#294f43"/><rect x="5" y="15" width="8" height="17" rx="2" fill="#8ca473" stroke="#faf3df" stroke-width="2"/><rect x="15" y="16" width="8" height="15" rx="2" fill="#d6bd6f"/><rect x="25" y="16" width="8" height="15" rx="2" fill="#bf8c70"/><rect x="35" y="16" width="8" height="15" rx="2" fill="#7f9bb8"/></svg>`;
  const ICON_FIXED = `<svg viewBox="0 0 48 48"><defs><pattern id="howStripes" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="1.6" height="5" fill="#ad3802"/></pattern></defs><rect x="4" y="4" width="40" height="40" rx="10" fill="#efeddc"/><path d="M9 9h17l-4 30H9z" fill="#d84602"/><path d="M9 9h17l-4 30H9z" fill="url(#howStripes)"/><path d="M26 9h13v30H22z" fill="#d84602"/><path d="M9 9h30v30H9zM26 9l-4 30" fill="none" stroke="#3a4234" stroke-width="2"/></svg>`;
  const ICON_RULE = `<svg viewBox="0 0 48 48"><rect x="4" y="4" width="40" height="40" rx="10" fill="#fff"/><path d="M8 10h14l4 14-4 14H8z" fill="#7f9bb8"/><path d="M26 24l-4 14h18V10H22z" fill="#7f9bb8"/><path d="M22 10l4 14-4 14" stroke="#e2343f" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`;

  function showHow() {
    showCard(`
      <button class="close" data-act="close" aria-label="Kapat"></button>
      <h2>NASIL OYNANIR</h2>
      <div class="how">
        ${ICON_RULE}<span>Ortak kenarı olan bölgeler aynı renk olamaz. Yalnızca köşede buluşanlar komşu sayılmaz. Harita dolunca yanlış yerler kırmızı yanar.</span>
        ${ICON_PALETTE}<span><b>Renk seç:</b> alttaki dört renkten biri hep seçilidir, değiştirmek için dokun.</span>
        ${ICON_TAP}<span><b>Dokun:</b> bölge seçili renge boyanır. Aynı renkle yeniden dokunursan silinir.</span>
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
      <div class="controls-setting version-setting">
        <span class="setting-label" id="versionLabel">SÜRÜM</span>
        <div class="appearance-options" role="group" aria-labelledby="versionLabel">
          ${VERSIONS.map(v => `<button class="appearance-option version-option" data-act="version" data-version="${v.id}" aria-pressed="${levelVersion === v.id}"><span>${v.name}<small>${v.note}</small></span></button>`).join('')}
        </div>
        <small class="setting-help">V2 yeni gerçek vitray çizimleri (varsayılan), V1 ilk çizimler. Her liste kaldığın yeri ayrı saklar.</small>
      </div>
      <div class="controls-setting appearance-setting">
        <span class="setting-label" id="appearanceLabel">GÖRÜNÜM</span>
        <div class="appearance-options" role="group" aria-labelledby="appearanceLabel">
          <button class="appearance-option" data-act="appearance" data-look="classic" aria-pressed="${boardLook === 'classic'}"><i class="appearance-preview classic-preview" aria-hidden="true"></i><span>Klasik<small>Düz renkler</small></span></button>
          <button class="appearance-option" data-act="appearance" data-look="3d" aria-pressed="${boardLook === '3d'}"><i class="appearance-preview depth-preview" aria-hidden="true"></i><span>3D<small>Varsayılan · kabartmalı</small></span></button>
        </div>
      </div>
      <div class="controls-setting empty-setting">
        <span class="setting-label" id="emptyToneLabel">BOYANMAMIŞ ALANLAR</span>
        <div class="empty-options" role="group" aria-labelledby="emptyToneLabel">
          ${EMPTY_TONES.map(tone => {
            const color = emptyColor(tone.id);
            return `<button class="empty-option" data-act="empty-tone" data-tone="${tone.id}" aria-pressed="${emptyTone === tone.id}">
              <span class="empty-preview" aria-hidden="true" style="--empty-base:${color};--empty-light:${shade(color, .22)};--empty-shade:${shade(color, -.18)}">
                <svg viewBox="0 0 48 24">${PALETTE.map((p, i) => `<rect x="${5 + i * 10}" y="8" width="8" height="8" rx="1.5" fill="${p.base}"/>`).join('')}</svg>
              </span>
              <span>${tone.name}</span>
            </button>`;
          }).join('')}
        </div>
        <small class="setting-help">Boş alanların rengini seç. Otomatik, zemini bölümün renklerine göre seçer.</small>
      </div>
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
    const hard = L.difficulty?.tier === 'hard';
    return `<button class="level-chip${hard ? ' is-hard' : ''}${i + 1 === S.level ? ' current' : ''}${done ? ' done' : ''}" data-act="glass" data-i="${i}"
      aria-label="Seviye ${i + 1}: ${L.name}${L.canvasSize === 'large' ? ', büyük vitray' : ''}${hard ? ', zor' : ''}${done ? ', tamamlandı' : ''}"${i + 1 === S.level ? ' aria-current="true"' : ''}>
      <b>${i + 1}</b><span class="chip-colors">${L.palette.map(c => `<i style="background:${c}"></i>`).join('')}</span>${hard ? '<small class="chip-difficulty">ZOR</small>' : ''}</button>`;
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
    else if (act === 'version') {
      const pressed = b.dataset.version;
      setLevelVersion(pressed, () => {
        startLevel(S.level, true);
        window.dispatchEvent(new Event('carto:list'));
        showSettings(); // the level grid shows the chosen list
      });
    }
    else if (act === 'appearance') {
      setBoardLook(b.dataset.look);
      $('card').querySelectorAll('[data-act="appearance"]').forEach(button => button.setAttribute('aria-pressed', button.dataset.look === boardLook));
    }
    else if (act === 'empty-tone') {
      setEmptyTone(b.dataset.tone);
      $('card').querySelectorAll('[data-act="empty-tone"]').forEach(button => button.setAttribute('aria-pressed', button.dataset.tone === emptyTone));
    }
  });

  $('glassNext').addEventListener('click', () => {
    if (!S.done) return;
    if (svg.querySelector('.glass-art')) nextLevel();
    else revealGlass();
  });
  $('glassHome').addEventListener('click', () => {
    if (S.done && svg.querySelector('.glass-art')) startLevel(S.level + 1, true);
    window.CartoMenu && window.CartoMenu.show();
  });
  $('homeBtn').addEventListener('click', () => { endCoach(false); window.CartoMenu && window.CartoMenu.show(); });
  $('hintBtn').addEventListener('click', useHint);
  $('settingsBtn').addEventListener('click', showSettings);
  new ResizeObserver(() => fitBoard()).observe($('stage'));
  document.addEventListener('gesturestart', e => e.preventDefault());

  // The board is set up behind the main menu; the menu's play button calls CartoGame.play().
  const wantedList = store.get('levelList', 'v2');
  setLevelVersion('v2');
  startLevel(Math.max(1, S.level | 0), !!document.getElementById('menu'));
  if (wantedList === 'v1') setLevelVersion('v1', () => { startLevel(S.level, true); window.dispatchEvent(new Event('carto:list')); });
  if (document.fonts) document.fonts.ready.then(() => fitBoard());

  window.CartoGame = {
    S,
    tap: r => tapRegion(r),
    choose: selectColor,
    level: startLevel,
    play(n) {
      if (n && n !== S.level) startLevel(n, true);
      if (S.done) startLevel(S.level, true);
      fitBoard();
      maybeCoach();
    },
    settings: showSettings,
    store,
    solveAll() {
      S.puzzle.solution.forEach((c, r) => { S.fill[r] = c; });
      render(); checkWin();
    },
  };
})();
