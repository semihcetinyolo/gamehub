/* Jigsolitaire — swap-to-complete picture puzzle.
 *
 * The image is cut into a grid of SQUARE tiles; every tile lives on the board
 * (no tray). You drag a tile/card and drop it elsewhere to SWAP positions.
 * Whenever tiles that are correct relative neighbours end up touching — even
 * if they are not yet at their final spot — they MERGE into one card and from
 * then on move together. Merge everything into one card to win.
 */
(() => {
  'use strict';

  // aspect = width / height (defaults to 1 = square). Non-square levels use a
  // cols×rows grid of square cells that matches the picture's shape.
  const LEVELS = [
    { name: 'Kittens',       src: 'levels/130001.webp' },
    { name: 'Rose Heart',    src: 'levels/101904.webp' },
    { name: 'Harvest',       src: 'levels/106401.webp' },
    { name: 'Lagoon Bridge', src: 'levels/108207.webp' },
    { name: 'Mare & Foal',   src: 'levels/130006.webp' },
    { name: 'Blooming Rose', src: 'levels/flower_bloom.gif', badge: 'GIF' },
    { name: 'Green Snake',   src: 'levels/test_snake.gif',  badge: 'GIF', aspect: 839 / 602 },
    { name: 'Torus Field',   src: 'levels/testlevel.gif',   badge: 'GIF', aspect: 800 / 600 },
  ];

  // Board formats. `base` formats keep square cells and match the picture's
  // own aspect ratio. `cols/rows` formats are fixed portrait grids — the
  // picture is cover-cropped to fill them (this is how a square photo becomes
  // a tall, reference-style board).
  const FORMATS = [
    { label: '3×3', base: 3 },
    { label: '4×4', base: 4 },
    { label: '5×5', base: 5 },
    { label: '6×4', cols: 4, rows: 6 },   // 4 wide × 6 tall (portrait)
    { label: '8×5', cols: 5, rows: 8 },   // 5 wide × 8 tall (portrait)
  ];

  const GAP = 2;        // space between separate cards (px) — nearly touching
  const RAD = 0;        // outer corner radius (px) — square corners
  const BORDER = 2;     // white card edge (px)

  const state = {
    levelIndex: 0,
    formatIndex: 1,     // index into FORMATS (default 4×4)
    cols: 4,
    rows: 4,
    S: 0,               // cell size in px (square)
    boardW: 0,
    boardH: 0,
    dispW: 0, dispH: 0, // displayed (cover-fitted) picture size
    offX: 0, offY: 0,   // top-left of the picture within the board
    grid: [],           // grid[r][c] = pieceId currently there
    els: [],            // els[pieceId] = DOM element
    moves: 0,
    startedAt: 0,
    timerId: null,
    won: false,
  };

  // DOM
  const board = document.getElementById('board');
  const peek = document.getElementById('peek');
  const movesEl = document.getElementById('moves');
  const timerEl = document.getElementById('timer');
  const levelStrip = document.getElementById('levelStrip');
  const winOverlay = document.getElementById('winOverlay');
  const winStats = document.getElementById('winStats');

  // piece id <-> home position helpers (id encodes its correct cell)
  const hr = (id) => Math.floor(id / state.cols);
  const hc = (id) => id % state.cols;

  // ---- Build -------------------------------------------------------------
  function computeGrid() {
    const f = FORMATS[state.formatIndex];
    if (f.cols != null) {                 // fixed portrait/landscape grid
      state.cols = f.cols; state.rows = f.rows;
    } else {                              // square cells matching the picture
      const a = LEVELS[state.levelIndex].aspect || 1, b = f.base;
      if (a >= 1) { state.rows = b; state.cols = Math.max(2, Math.round(b * a)); }
      else { state.cols = b; state.rows = Math.max(2, Math.round(b / a)); }
    }
  }
  function computeCell() {
    const wrap = board.parentElement; // .board-wrap
    const S = Math.max(34, Math.floor(Math.min(
      wrap.clientWidth / state.cols, wrap.clientHeight / state.rows)));
    state.S = S;
    state.boardW = S * state.cols;
    state.boardH = S * state.rows;
  }
  // cover-fit the picture into the board (scale to fill, centre, crop overflow)
  function computeFit() {
    const a = LEVELS[state.levelIndex].aspect || 1;
    const bw = state.boardW, bh = state.boardH;
    let dispW, dispH;
    if (bw / bh >= a) { dispW = bw; dispH = bw / a; }
    else { dispH = bh; dispW = bh * a; }
    state.dispW = dispW; state.dispH = dispH;
    state.offX = (bw - dispW) / 2;
    state.offY = (bh - dispH) / 2;
  }

  function build() {
    state.won = false;
    state.moves = 0;
    winOverlay.classList.add('hidden');
    document.querySelectorAll('.confetti').forEach(c => c.remove());

    // wipe old pieces (keep #peek)
    state.els.forEach(el => el && el.remove());
    state.els = [];

    computeGrid();
    computeCell();
    computeFit();
    board.style.width = state.boardW + 'px';
    board.style.height = state.boardH + 'px';
    const src = LEVELS[state.levelIndex].src;
    peek.style.backgroundImage = `url("${src}")`;
    state.src = src;

    // solved grid, then shuffle
    const cols = state.cols, rows = state.rows, total = cols * rows;
    const ids = [];
    for (let i = 0; i < total; i++) ids.push(i);
    shuffle(ids);
    // avoid an accidentally-finished board
    if (ids.every((id, i) => id === i)) shuffle(ids);

    state.grid = [];
    for (let r = 0; r < rows; r++) {
      state.grid[r] = [];
      for (let c = 0; c < cols; c++) state.grid[r][c] = ids[r * cols + c];
    }

    // create one element per piece
    for (let id = 0; id < total; id++) {
      const el = document.createElement('div');
      el.className = 'piece';
      el.style.backgroundImage = `url("${src}")`;
      el.style.backgroundSize = `${state.dispW}px ${state.dispH}px`;
      el.dataset.id = id;
      attachDrag(el);
      state.els[id] = el;
      board.appendChild(el);
    }

    render();
    resetTimer();
    updateMoves();
  }

  // Recompute sizes and repaint WITHOUT reshuffling — keeps the player's
  // progress when the window/phone frame is resized.
  function relayout() {
    if (!state.grid.length) return;
    computeCell();
    computeFit();
    board.style.width = state.boardW + 'px';
    board.style.height = state.boardH + 'px';
    for (let id = 0; id < state.els.length; id++) {
      if (state.els[id]) state.els[id].style.backgroundSize = `${state.dispW}px ${state.dispH}px`;
    }
    render();
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
  }

  // ---- Merge logic -------------------------------------------------------
  // Two tiles are "joined" when their current adjacency matches their home
  // adjacency, regardless of where on the board they sit.
  function joinedRight(r, c) {            // is (r,c) merged with (r,c+1)?
    if (c + 1 >= state.cols) return false;
    const a = state.grid[r][c], b = state.grid[r][c + 1];
    return hr(a) === hr(b) && hc(a) + 1 === hc(b);
  }
  function joinedDown(r, c) {             // is (r,c) merged with (r+1,c)?
    if (r + 1 >= state.rows) return false;
    const a = state.grid[r][c], b = state.grid[r + 1][c];
    return hc(a) === hc(b) && hr(a) + 1 === hr(b);
  }
  function same(r, c, dir) {
    if (dir === 'R') return joinedRight(r, c);
    if (dir === 'L') return c > 0 && joinedRight(r, c - 1);
    if (dir === 'D') return joinedDown(r, c);
    if (dir === 'U') return r > 0 && joinedDown(r - 1, c);
    return false;
  }

  // connected group of cells starting at (r,c) via merge adjacency
  function groupCells(r0, c0) {
    const seen = new Set([r0 + ',' + c0]);
    const stack = [[r0, c0]];
    const out = [[r0, c0]];
    while (stack.length) {
      const [r, c] = stack.pop();
      const nbrs = [];
      if (same(r, c, 'U')) nbrs.push([r - 1, c]);
      if (same(r, c, 'D')) nbrs.push([r + 1, c]);
      if (same(r, c, 'L')) nbrs.push([r, c - 1]);
      if (same(r, c, 'R')) nbrs.push([r, c + 1]);
      for (const [nr, nc] of nbrs) {
        const k = nr + ',' + nc;
        if (!seen.has(k)) { seen.add(k); stack.push([nr, nc]); out.push([nr, nc]); }
      }
    }
    return out;
  }

  // ---- Render ------------------------------------------------------------
  function render() {
    const S = state.S;
    for (let r = 0; r < state.rows; r++) {
      for (let c = 0; c < state.cols; c++) {
        const id = state.grid[r][c];
        const el = state.els[id];
        const u = same(r, c, 'U'), d = same(r, c, 'D');
        const l = same(r, c, 'L'), ri = same(r, c, 'R');
        const lIns = l ? 0 : GAP / 2, rIns = ri ? 0 : GAP / 2;
        const tIns = u ? 0 : GAP / 2, bIns = d ? 0 : GAP / 2;

        el.style.left = (c * S + lIns) + 'px';
        el.style.top = (r * S + tIns) + 'px';
        el.style.width = (S - lIns - rIns) + 'px';
        el.style.height = (S - tIns - bIns) + 'px';
        el.style.transform = '';

        // borders only on outer (non-merged) sides
        el.style.borderTopWidth = u ? '0px' : BORDER + 'px';
        el.style.borderBottomWidth = d ? '0px' : BORDER + 'px';
        el.style.borderLeftWidth = l ? '0px' : BORDER + 'px';
        el.style.borderRightWidth = ri ? '0px' : BORDER + 'px';
        el.style.borderTopLeftRadius = (u || l) ? '0px' : RAD + 'px';
        el.style.borderTopRightRadius = (u || ri) ? '0px' : RAD + 'px';
        el.style.borderBottomLeftRadius = (d || l) ? '0px' : RAD + 'px';
        el.style.borderBottomRightRadius = (d || ri) ? '0px' : RAD + 'px';

        // show this piece's HOME fragment (from the cover-fitted picture)
        el.style.backgroundPosition =
          `${state.offX - (hc(id) * S + lIns)}px ${state.offY - (hr(id) * S + tIns)}px`;
        el.classList.remove('dragging', 'valid', 'invalid');
        el.dataset.r = r; el.dataset.c = c;
      }
    }
  }

  // ---- Drag to swap ------------------------------------------------------
  let zTop = 9000;

  function attachDrag(el) {
    el.addEventListener('pointerdown', (e) => {
      if (state.won) return;
      e.preventDefault();
      if (!state.startedAt) startTimer();

      const r0 = +el.dataset.r, c0 = +el.dataset.c;
      const footprint = groupCells(r0, c0);                  // cells moving together
      const anchor = [r0, c0];
      const startX = e.clientX, startY = e.clientY;
      const S = state.S;
      // bounding box so we can clamp the move and keep the whole group on board
      const rs = footprint.map(c => c[0]), cs = footprint.map(c => c[1]);
      const minR = Math.min(...rs), maxR = Math.max(...rs);
      const minC = Math.min(...cs), maxC = Math.max(...cs);
      const dragEls = footprint.map(([r, c]) => state.els[state.grid[r][c]]);
      dragEls.forEach(d => { d.classList.add('dragging'); d.style.zIndex = ++zTop; });
      try { el.setPointerCapture(e.pointerId); } catch (_) {}

      let lastDelta = [0, 0], lastValid = false;

      const move = (ev) => {
        const dx = ev.clientX - startX, dy = ev.clientY - startY;
        dragEls.forEach(d => { d.style.transform = `translate(${dx}px, ${dy}px)`; });
        // clamp the cell delta so the whole group stays inside the board
        let dRow = Math.round(dy / S), dCol = Math.round(dx / S);
        dRow = Math.max(-minR, Math.min(state.rows - 1 - maxR, dRow));
        dCol = Math.max(-minC, Math.min(state.cols - 1 - maxC, dCol));
        lastDelta = [dRow, dCol];
        lastValid = (dRow !== 0 || dCol !== 0);
        dragEls.forEach(d => { d.classList.toggle('valid', lastValid); });
      };
      const up = () => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        try { el.releasePointerCapture(e.pointerId); } catch (_) {}
        const [dRow, dCol] = lastDelta;
        if (lastValid && (dRow || dCol)) {
          applySwap(footprint, dRow, dCol, anchor);
        } else {
          render(); // snap back
        }
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    });
  }

  // Move the whole group rigidly by (dRow,dCol). The group keeps its shape and
  // lands at the new spot; whatever non-group pieces sat in the destination get
  // pushed into the cells the group vacated. Works even when source and target
  // overlap (e.g. nudging a 4-card up by one). Any in-bounds, non-zero move is
  // valid — see the clamp in the drag handler.
  function applySwap(footprint, dRow, dCol) {
    const old = state.grid.map(row => row.slice());
    const k = (r, c) => r + ',' + c;
    const Fset = new Set(footprint.map(([r, c]) => k(r, c)));
    const newF = footprint.map(([r, c]) => [r + dRow, c + dCol]);
    const newFset = new Set(newF.map(([r, c]) => k(r, c)));

    // displaced = destination cells that weren't the group's own cells
    const displaced = newF.filter(([r, c]) => !Fset.has(k(r, c)));
    // vacated = the group's old cells that the group no longer covers
    const vacated = footprint.filter(([r, c]) => !newFset.has(k(r, c)));

    // pair them in a natural order for the drag axis so pieces "wrap" sensibly
    const vert = Math.abs(dRow) >= Math.abs(dCol);
    const key = ([r, c]) => vert ? c * 1000 + r : r * 1000 + c;
    displaced.sort((a, b) => key(a) - key(b));
    vacated.sort((a, b) => key(a) - key(b));

    // 1) group pieces translate by delta (preserves the merged card)
    for (const [r, c] of footprint) state.grid[r + dRow][c + dCol] = old[r][c];
    // 2) displaced pieces fall into the vacated cells
    for (let i = 0; i < displaced.length; i++) {
      const [dr, dc] = displaced[i], [vr, vc] = vacated[i];
      state.grid[vr][vc] = old[dr][dc];
    }

    state.moves++;
    updateMoves();
    render();
    flashMoved(footprint, dRow, dCol);
    blip(560 + Math.random() * 90);
    checkWin();
  }

  // pulse pieces that just gained a new merged neighbour
  function flashMoved(A, dRow, dCol) {
    const cells = A.map(([r, c]) => [r + dRow, c + dCol]);
    for (const [r, c] of cells) {
      if (same(r, c, 'U') || same(r, c, 'D') || same(r, c, 'L') || same(r, c, 'R')) {
        const el = state.els[state.grid[r][c]];
        el.classList.add('merged-pop');
        el.addEventListener('animationend', () => el.classList.remove('merged-pop'), { once: true });
      }
    }
  }

  // ---- Win / HUD ---------------------------------------------------------
  function checkWin() {
    for (let r = 0; r < state.rows; r++)
      for (let c = 0; c < state.cols; c++)
        if (state.grid[r][c] !== r * state.cols + c) return;
    win();
  }
  function win() {
    state.won = true;
    if (state.timerId) clearInterval(state.timerId);
    const elapsed = state.startedAt ? Date.now() - state.startedAt : 0;
    winStats.textContent =
      `${LEVELS[state.levelIndex].name} · ${FORMATS[state.formatIndex].label} · ${state.moves} moves · ${fmt(elapsed)}`;
    confetti();
    chord();
    setTimeout(() => winOverlay.classList.remove('hidden'), 600);
  }
  function updateMoves() { movesEl.textContent = state.moves + (state.moves === 1 ? ' move' : ' moves'); }
  function fmt(ms) {
    const s = Math.floor(ms / 1000);
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }
  function resetTimer() {
    if (state.timerId) clearInterval(state.timerId);
    state.timerId = null; state.startedAt = 0;
    timerEl.textContent = '00:00';
  }
  function startTimer() {
    state.startedAt = Date.now();
    state.timerId = setInterval(() => { timerEl.textContent = fmt(Date.now() - state.startedAt); }, 250);
  }

  function confetti() {
    const colors = ['#e8a13a', '#f2c36b', '#7fd1ae', '#ef6f6c', '#6fa8ef', '#f4ece0'];
    for (let i = 0; i < 80; i++) {
      const c = document.createElement('div');
      c.className = 'confetti';
      c.style.left = Math.random() * 100 + '%';
      c.style.background = colors[i % colors.length];
      c.style.animationDuration = 2.2 + Math.random() * 1.6 + 's';
      c.style.animationDelay = Math.random() * 0.4 + 's';
      winOverlay.parentElement.appendChild(c);
      setTimeout(() => c.remove(), 4600);
    }
  }

  // ---- Audio -------------------------------------------------------------
  let actx;
  function tone(freq, dur, type, gain) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type || 'sine'; o.frequency.value = freq;
      o.connect(g); g.connect(actx.destination);
      const t = actx.currentTime;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain || 0.16, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.18));
      o.start(t); o.stop(t + (dur || 0.18) + 0.02);
    } catch (e) {}
  }
  function blip(f) { tone(f, 0.14, 'triangle', 0.14); }
  function chord() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.5, 'sine', 0.13), i * 110)); }

  // ---- Levels + controls -------------------------------------------------
  function buildLevelStrip() {
    levelStrip.innerHTML = '';
    LEVELS.forEach((lv, i) => {
      const t = document.createElement('button');
      t.className = 'level-thumb' + (i === state.levelIndex ? ' active' : '');
      t.style.backgroundImage = `url("${lv.src}")`;
      if (lv.badge) t.innerHTML = `<span class="badge">${lv.badge}</span>`;
      t.title = lv.name;
      t.addEventListener('click', () => {
        state.levelIndex = i;
        document.querySelectorAll('.level-thumb').forEach((el, j) => el.classList.toggle('active', j === i));
        build();
      });
      levelStrip.appendChild(t);
    });
  }

  document.getElementById('difficulty').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    state.formatIndex = +b.dataset.fi;
    document.querySelectorAll('#difficulty button').forEach(x => x.classList.toggle('active', x === b));
    build();
  });
  document.getElementById('shuffleBtn').addEventListener('click', build);
  document.getElementById('newBtn').addEventListener('click', build);

  const peekBtn = document.getElementById('peekBtn');
  const showPeek = () => peek.classList.add('show');
  const hidePeek = () => peek.classList.remove('show');
  peekBtn.addEventListener('pointerdown', showPeek);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => peekBtn.addEventListener(ev, hidePeek));

  document.getElementById('winAgainBtn').addEventListener('click', build);
  document.getElementById('winNextBtn').addEventListener('click', () => {
    state.levelIndex = (state.levelIndex + 1) % LEVELS.length;
    document.querySelectorAll('.level-thumb').forEach((el, j) => el.classList.toggle('active', j === state.levelIndex));
    build();
  });

  // re-fit (not reshuffle) on resize so progress is preserved
  let rsz;
  window.addEventListener('resize', () => { clearTimeout(rsz); rsz = setTimeout(relayout, 150); });

  // ---- Boot --------------------------------------------------------------
  function boot() { buildLevelStrip(); build(); }
  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot);
})();
