// Word Branch — V2 "click" input: a root chip + build bar, and the wheel's parts as tappable tiles.
// Pure UI component. It never reads logic state beyond what game.js passes in, and never upper-cases
// text (level words are already upper case in their own alphabet, e.g. Turkish İ).
//
//   const board = createClickBoard(container, { root, getTargets, onLive, onSubmit, onWrong, t });
//   board.setNodes(state.wheel, { removedIds, addedIds });   // also used after shuffle (FLIP)
//   board.clear(); board.setEnabled(false); board.showHint(nodeIds); board.destroy();
// Optional: spaceAfterRoot(builtWord) -> true puts a word gap between the root chip and the parts.

const CONFIG = {
  wrongMs: 420,        // shake + red flash before the selection clears
  removeMs: 260,       // used tiles shrink away
  moveMs: 380,         // tiles gliding to new positions (shuffle / reflow)
  addMs: 420,          // new tiles pop in
  addDelay: 140,       // new tiles wait a moment for the removed ones
  addStagger: 60,
  minBarFont: 12,      // px, build bar letters shrink to fit long words
  // sizes grow with the container's spare height: [at the smallest, at the largest]
  tileH: [56, 72],     // px, tile height
  tileFont: [24, 32],
  tileGap: [8, 14],
  barH: [56, 68],
  barFont: [24, 30],   // largest build bar letters before fitting
  boardGap: [10, 22],  // bar <-> tiles
  pad: [4, 12],        // below the tiles
  tileRows: 2,         // sized for up to 8 tiles, 4 per row, so the size stays put as tiles come and go
};

const SVG = {
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6-7z"/><path d="M12.5 9.5l5 5M17.5 9.5l-5 5"/></svg>',
  clear: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v5h5"/></svg>',
};

let cssRequested = false;
function ensureCss() {
  if (cssRequested) return;
  cssRequested = true;
  const href = new URL('./v2.css', import.meta.url).href;
  if ([...document.styleSheets].some((s) => s.href === href)) return;
  if (document.querySelector(`link[href="${href}"], link[href="v2.css"], link[href="./v2.css"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.append(link);
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

export function createClickBoard(container, {
  root = '',
  getTargets = () => [],
  onLive = () => {},
  onSubmit = () => {},
  onWrong = () => {},
  t = (key) => key,
  spaceAfterRoot = null,   // (builtWord) => true: show a word gap after the root (open compounds, "YER ÇEKİMİ")
} = {}) {
  ensureCss();

  // t(key) falls back to the key itself in game.js; use our own English text then
  const say = (key, fallback) => {
    const s = t?.(key);
    return typeof s === 'string' && s && s !== key ? s : fallback;
  };

  // ---------- DOM ----------
  const boardEl = el('div', 'v2');
  const barEl = el('div', 'v2-bar');
  const buildEl = el('div', 'v2-build');
  buildEl.setAttribute('aria-hidden', 'true');
  const rootChip = el('span', 'v2-chip v2-root');
  rootChip.textContent = root;
  const partsEl = el('span', 'v2-parts');
  const caretEl = el('span', 'v2-caret');
  buildEl.append(rootChip, partsEl, caretEl);

  const backBtn = el('button', 'v2-btn v2-back', SVG.back);
  backBtn.type = 'button';
  const clearBtn = el('button', 'v2-btn v2-clear', SVG.clear);
  clearBtn.type = 'button';
  const label = (btn, key, fb) => { const s = say(key, fb); btn.setAttribute('aria-label', s); btn.title = s; };
  label(backBtn, 'undo', 'Undo');
  label(clearBtn, 'clearWord', 'Clear');

  barEl.append(buildEl, backBtn, clearBtn);
  const tilesEl = el('div', 'v2-tiles');
  tilesEl.setAttribute('role', 'group');
  tilesEl.setAttribute('aria-label', say('parts', 'Parts'));
  const ghostLayer = el('div', 'v2-ghosts');
  ghostLayer.setAttribute('aria-hidden', 'true');
  boardEl.append(barEl, tilesEl, ghostLayer);
  container.append(boardEl);

  // ---------- state ----------
  let nodes = [];                // [{ id, text }] in slot order, no nulls
  const tileById = new Map();    // id -> button
  let selected = [];             // node ids, in tap order
  let hintIds = [];
  let enabled = true;
  let busy = false;              // wrong shake running, or a correct word waiting for setNodes()
  let wrongTimer = 0;
  let destroyed = false;

  const textOf = (id) => nodes.find((n) => n.id === id)?.text ?? '';
  const builtWord = () => root + selected.map(textOf).join('');

  // ---------- rendering ----------
  function renderBar(flash) {
    partsEl.replaceChildren(...selected.map((id) => {
      const chip = el('span', 'v2-chip v2-part');
      chip.textContent = textOf(id);
      return chip;
    }));
    const has = selected.length > 0;
    backBtn.disabled = !has;
    clearBtn.disabled = !has;
    barEl.classList.toggle('has-parts', has);
    let open = false;
    if (has && typeof spaceAfterRoot === 'function') {
      try { open = !!spaceAfterRoot(builtWord()); } catch { open = false; }
    }
    barEl.classList.toggle('open-gap', open);
    if (flash === 'add') partsEl.lastElementChild?.classList.add('v2-chip-in');
    fitBar();
  }

  // the board fills the container's height: spare height makes tiles, letters and gaps bigger
  let barFont = CONFIG.barFont[0];
  function sizeToContainer() {
    const h = container.clientHeight;
    const lerp = ([a, b], k) => Math.round(a + (b - a) * k);
    let k = 0;
    if (h > 0) {
      // height needed at k: top padding + bar + gap + tile rows + bottom padding
      const need = (x) => 4 + lerp(CONFIG.barH, x) + lerp(CONFIG.boardGap, x)
        + CONFIG.tileRows * lerp(CONFIG.tileH, x) + (CONFIG.tileRows - 1) * lerp(CONFIG.tileGap, x) + lerp(CONFIG.pad, x);
      k = Math.max(0, Math.min(1, (h - need(0)) / (need(1) - need(0))));
    }
    const st = boardEl.style;
    st.setProperty('--v2-tile-h', `${lerp(CONFIG.tileH, k)}px`);
    // 4 tiles per row: a 3-letter part has to fit the tile width too
    const tileW = (Math.min(container.clientWidth || 440, 440) - 8 - 3 * lerp(CONFIG.tileGap, k)) / 4;
    const font = Math.max(CONFIG.tileFont[0] - 4, Math.min(lerp(CONFIG.tileFont, k), Math.floor(tileW * 0.39)));
    st.setProperty('--v2-tile-font', `${font}px`);
    st.setProperty('--v2-tile-gap', `${lerp(CONFIG.tileGap, k)}px`);
    st.setProperty('--v2-bar-h', `${lerp(CONFIG.barH, k)}px`);
    st.setProperty('--v2-gap', `${lerp(CONFIG.boardGap, k)}px`);
    st.setProperty('--v2-pad', `${lerp(CONFIG.pad, k)}px`);
    barFont = lerp(CONFIG.barFont, k);
    fitBar();
  }

  // long words (HEADQUARTERS, KOLEKSİYON) shrink the bar letters instead of overflowing
  function fitBar() {
    let size = barFont;
    buildEl.style.fontSize = `${size}px`;
    const room = buildEl.clientWidth;
    if (!room) return;
    for (let i = 0; i < 8 && buildEl.scrollWidth > room + 1 && size > CONFIG.minBarFont; i++) {
      size = Math.max(CONFIG.minBarFont, Math.floor(size * Math.min(0.94, room / buildEl.scrollWidth)));
      buildEl.style.fontSize = `${size}px`;
    }
  }

  function renderTileStates() {
    for (const [id, tile] of tileById) {
      const pos = selected.indexOf(id);
      tile.classList.toggle('used', pos >= 0);
      tile.classList.toggle('last', pos >= 0 && pos === selected.length - 1);
      tile.setAttribute('aria-pressed', pos >= 0 ? 'true' : 'false');
      const h = hintIds.indexOf(id);
      tile.classList.toggle('hinted', h >= 0);
      const badge = tile.querySelector('.v2-badge');
      if (h >= 0) {
        if (badge) badge.textContent = String(h + 1);
        else { const b = el('span', 'v2-badge'); b.textContent = String(h + 1); tile.append(b); }
      } else badge?.remove();
    }
    boardEl.classList.toggle('disabled', !enabled);
  }

  function emitLive() { onLive?.(builtWord()); }

  function makeTile(node) {
    const tile = el('button', 'v2-tile');
    tile.type = 'button';
    tile.dataset.id = node.id;
    const span = el('span', 'v2-text');
    span.textContent = node.text;
    tile.append(span);
    tile.setAttribute('aria-label', node.text);
    return tile;
  }

  // ---------- input ----------
  const canTap = () => enabled && !busy && !destroyed;

  function tapTile(id) {
    if (!canTap() || !tileById.has(id)) return;
    clearHint();
    const pos = selected.indexOf(id);
    if (pos >= 0) {
      if (pos === selected.length - 1) undo();
      else nudge(tileById.get(id));
      return;
    }
    selected.push(id);
    tileById.get(id).classList.add('tapped');
    setTimeout(() => tileById.get(id)?.classList.remove('tapped'), 180);
    renderBar('add');
    renderTileStates();
    emitLive();
    check();
  }

  function undo() {
    if (!canTap() || !selected.length) return;
    clearHint();
    selected.pop();
    renderBar();
    renderTileStates();
    emitLive();
  }

  function clearSelection({ live = true } = {}) {
    selected = [];
    barEl.classList.remove('good', 'bad');
    renderBar();
    renderTileStates();
    if (live) emitLive();
  }

  function nudge(tile) {
    if (!tile || reducedMotion()) return;
    tile.animate([
      { transform: 'translateX(0)' }, { transform: 'translateX(-4px)' },
      { transform: 'translateX(4px)' }, { transform: 'translateX(0)' },
    ], { duration: 200, easing: 'ease-in-out' });
  }

  // exact match -> submit; no target starts with the built word -> wrong
  function check() {
    const word = builtWord();
    const targets = (getTargets?.() ?? []).filter((w) => typeof w === 'string');
    if (targets.includes(word)) return submitWord();
    if (!targets.some((w) => w.startsWith(word))) return wrong();
  }

  function submitWord() {
    const ids = [...selected];
    busy = true;
    barEl.classList.remove('bad');
    barEl.classList.add('good');
    for (const id of ids) tileById.get(id)?.classList.add('good');
    let result;
    try { result = onSubmit?.(ids); } catch (err) { busy = false; clearSelection(); throw err; }
    const settle = (res) => {
      if (destroyed) return;
      // a refusal from logic (should not happen) is treated like a wrong word
      if (res && res.ok === false) { busy = false; wrong({ notify: false }); }
      // otherwise stay "good" until game.js sends the new wheel through setNodes() or calls clear()
    };
    if (result && typeof result.then === 'function') result.then(settle, () => { busy = false; clearSelection(); });
    else settle(result);
  }

  function wrong({ notify = true } = {}) {
    const ids = [...selected];
    busy = true;
    barEl.classList.remove('good', 'bad');
    void barEl.offsetWidth; // restart the shake
    barEl.classList.add('bad');
    for (const id of ids) tileById.get(id)?.classList.add('bad');
    if (notify) onWrong?.(ids);
    clearTimeout(wrongTimer);
    wrongTimer = setTimeout(() => {
      if (destroyed) return;
      for (const tile of tileById.values()) tile.classList.remove('bad');
      busy = false;
      clearSelection();
    }, reducedMotion() ? 200 : CONFIG.wrongMs);
  }

  // pointerdown feels instant on phones; keyboard activation arrives as a click with detail 0
  function onPointerDown(e) {
    if (e.button > 0 || !e.isPrimary) return;
    const tile = e.target.closest('.v2-tile');
    if (tile && tilesEl.contains(tile)) { e.preventDefault(); tapTile(tile.dataset.id); return; }
    if (backBtn.contains(e.target)) { e.preventDefault(); undo(); return; }
    if (clearBtn.contains(e.target)) { e.preventDefault(); if (canTap()) { clearHint(); clearSelection(); } }
  }
  function onClick(e) {
    if (e.detail !== 0) return; // pointer taps were handled on pointerdown
    const tile = e.target.closest('.v2-tile');
    if (tile && tilesEl.contains(tile)) tapTile(tile.dataset.id);
    else if (backBtn.contains(e.target)) undo();
    else if (clearBtn.contains(e.target) && canTap()) { clearHint(); clearSelection(); }
  }
  function onKey(e) {
    if (!boardEl.isConnected || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable], dialog, [role="dialog"]')) return;
    if (e.key === 'Backspace') { e.preventDefault(); undo(); }
    else if (e.key === 'Escape' && selected.length && canTap()) { clearHint(); clearSelection(); }
  }
  const onResize = () => fitBar();
  const resizeObs = typeof ResizeObserver === 'function' ? new ResizeObserver(() => sizeToContainer()) : null;
  resizeObs?.observe(container);

  boardEl.addEventListener('pointerdown', onPointerDown);
  boardEl.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize);

  // ---------- hint ----------
  function clearHint() {
    if (!hintIds.length) return;
    hintIds = [];
    renderTileStates();
  }

  // ---------- nodes + animations ----------
  function setNodes(wheel, { removedIds = [], addedIds = [] } = {}) {
    if (destroyed) return;
    const next = (wheel ?? []).filter(Boolean).map((n) => ({ id: n.id, text: n.text }));
    const nextIds = new Set(next.map((n) => n.id));
    const removed = new Set(removedIds);
    const added = new Set(addedIds);
    const animate = !reducedMotion() && tilesEl.isConnected;

    // FIRST: where every current tile is now
    const first = new Map();
    const boardBox = boardEl.getBoundingClientRect();
    for (const [id, tile] of tileById) first.set(id, tile.getBoundingClientRect());

    // tiles that leave: a ghost copy shrinks away where the tile was
    for (const [id, tile] of tileById) {
      if (nextIds.has(id)) continue;
      if (animate && (removed.has(id) || removed.size === 0)) {
        const r = first.get(id);
        const ghost = tile.cloneNode(true);
        ghost.classList.add('v2-ghost');
        ghost.removeAttribute('data-id');
        Object.assign(ghost.style, {
          left: `${r.left - boardBox.left}px`, top: `${r.top - boardBox.top}px`,
          width: `${r.width}px`, height: `${r.height}px`,
        });
        ghostLayer.append(ghost);
        ghost.animate([
          { transform: 'scale(1)', opacity: 1 },
          { transform: 'scale(1.12)', opacity: 1, offset: 0.3 },
          { transform: 'scale(0.2)', opacity: 0 },
        ], { duration: CONFIG.removeMs, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' })
          .finished.catch(() => {}).then(() => ghost.remove());
      }
      tile.remove();
      tileById.delete(id);
    }

    // selection / hint survive a shuffle, not a word that used their tiles
    const pendingWord = busy && barEl.classList.contains('good');
    if (pendingWord || selected.some((id) => !nextIds.has(id))) selected = [];
    if (pendingWord || hintIds.some((id) => !nextIds.has(id))) hintIds = [];
    if (pendingWord) busy = false;
    if (!busy) barEl.classList.remove('good', 'bad');
    for (const tile of tileById.values()) tile.classList.remove('good', 'bad');

    // update texts of kept tiles (ids are never reused, so this is only a safety net)
    nodes = next;
    const order = next.map((n) => {
      let tile = tileById.get(n.id);
      if (!tile) { tile = makeTile(n); tileById.set(n.id, tile); }
      else if (tile.querySelector('.v2-text').textContent !== n.text) {
        tile.querySelector('.v2-text').textContent = n.text;
        tile.setAttribute('aria-label', n.text);
      }
      return tile;
    });
    tilesEl.replaceChildren(...order);
    tilesEl.dataset.count = String(order.length);
    renderBar();
    renderTileStates();

    if (!animate) { emitLive(); return; }

    // LAST + INVERT + PLAY: kept tiles glide from their old spot, new ones pop in
    let addIndex = 0;
    for (const n of next) {
      const tile = tileById.get(n.id);
      const from = first.get(n.id);
      if (from) {
        const to = tile.getBoundingClientRect();
        const dx = from.left - to.left;
        const dy = from.top - to.top;
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
          tile.getAnimations().forEach((a) => a.cancel());
          tile.animate([
            { transform: `translate(${dx}px, ${dy}px)` },
            { transform: 'translate(0, 0)' },
          ], { duration: CONFIG.moveMs, easing: 'cubic-bezier(.3,1.25,.5,1)' });
        }
      } else if (added.has(n.id) || first.size) {
        tile.animate([
          { transform: 'scale(0.2)', opacity: 0 },
          { transform: 'scale(1.1)', opacity: 1, offset: 0.65 },
          { transform: 'scale(1)', opacity: 1 },
        ], {
          duration: CONFIG.addMs,
          delay: (removed.size ? CONFIG.addDelay : 0) + addIndex++ * CONFIG.addStagger,
          easing: 'cubic-bezier(.3,1.2,.5,1)',
          fill: 'backwards',
        });
      }
    }
    emitLive();
  }

  function showHint(nodeIds = []) {
    if (destroyed) return;
    const ids = nodeIds.filter((id) => tileById.has(id));
    if (selected.length && canTap()) clearSelection();
    hintIds = ids;
    renderTileStates();
  }

  function setEnabled(on) {
    enabled = !!on;
    renderTileStates();
  }

  function clear() {
    clearTimeout(wrongTimer);
    busy = false;
    for (const tile of tileById.values()) tile.classList.remove('good', 'bad');
    clearSelection();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    clearTimeout(wrongTimer);
    boardEl.removeEventListener('pointerdown', onPointerDown);
    boardEl.removeEventListener('click', onClick);
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    resizeObs?.disconnect();
    boardEl.remove();
    tileById.clear();
  }

  renderBar();
  sizeToContainer();
  requestAnimationFrame(sizeToContainer);
  return { setNodes, clear, setEnabled, showHint, destroy };
}
