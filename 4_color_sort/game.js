(() => {
'use strict';

// Four-colour sliding board, like the wooden toy:
//   x = 1..cols are the vertical slots (rows y = 1..cap, y = cap is the bottom),
//   y = 0 is the top channel, x = 0..cols+1, with one free pocket past each outer slot.
// The board stands upright: a disc dropped into a slot falls to the lowest free cell. Nothing
// floats: in the channel a disc only rests in a pocket or above a full / closed slot; above
// an open slot with room it falls in (also later, as soon as that slot opens). Discs only travel through empty cells, so a disc in the
// channel blocks the way past it. A slot that shows exactly its card column is complete: it
// gets a lid and is locked. Solved when every slot is complete.
// Level features (Magic Sort style blockers, level.features):
//   hidden  "?" disc, colour shown once it is the top of its slot
//   clay    slot only takes discs, nothing can be taken out
//   box     boxed slot (no in/out, hidden) until the slot holding the key disc is complete
//   ice     frozen disc can't leave while on top; thaws when any slot completes
//   plaster sealed slot until a neighbour slot completes
//   stopper slot mouth opens/closes after every move
//   bag     sealed slot until n slots are complete
//   tag     end pocket where only one colour may stop (others pass through)
// tools/gen.js uses exactly these rules.

const $ = (s) => document.querySelector(s);
const boardEl = $('#board'), frameEl = $('#frame'), overlayEl = $('#overlay'), popEl = $('#pop');
const LS = { level: 'fcs_level', stars: 'fcs_stars', seen: 'fcs_seen', pockets: 'fcs_pockets' };
const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
let pocketsEnabled = load(LS.pockets, true) !== false;

// design units = pixels of the board artwork (assets/board-panel.png, 1024 × 1536), cropped by
// OX / OY crop the artwork. Columns stay evenly spaced; stacked discs almost touch.
const GRID_LEFT = 154, GRID_RIGHT = 875;
const COLUMN_PITCH = (GRID_RIGHT - GRID_LEFT) / 5;
const D = 104, U = D + 2, OX = 16, OY = 55;
const ART_W = 1024, ART_H = 1536, ART_BOTTOM = 1420;   // board edge + shadow in the artwork
const CH_Y = 585;                                       // channel centre in the artwork
const ART_LAST = 1220;                                  // lowest disc centre the artwork's slots allow
const SEAM = 760, FADE = 40;                            // where the art is cut to shorten the slots

let stars = load(LS.stars, {});
let seen = load(LS.seen, {});
const FEATURES = window.FEATURE_INFO;   // features.js
let levelIdx = Math.min(load(LS.level, 0), LEVELS.length - 1);
// ?level=N (1-based) jumps straight to a level
const askedLevel = parseInt(new URLSearchParams(location.search).get('level'), 10);
if (askedLevel >= 1 && askedLevel <= LEVELS.length) levelIdx = askedLevel - 1;
let st = null, G = null, sel = null, drag = null, nextId = 1;

// ---------------------------------------------------------------- level setup
function startLevel(i) {
  levelIdx = i;
  save(LS.level, i);
  const L = LEVELS[i];
  const T = L.cols + 2;
  const cells = [], idx = new Map(), adj = [];
  const add = (x, y, kind) => { idx.set(x + ',' + y, cells.length); cells.push({ x, y, kind }); adj.push([]); };
  const link = (a, b) => { adj[a].push(b); adj[b].push(a); };
  for (let x = 0; x < T; x++) add(x, 0, 'ch');
  for (let x = 1; x <= L.cols; x++) for (let y = 1; y <= L.cap; y++) add(x, y, 'col');
  for (let x = 0; x + 1 < T; x++) link(idx.get(x + ',0'), idx.get(x + 1 + ',0'));
  for (let x = 1; x <= L.cols; x++) for (let y = 0; y < L.cap; y++) link(idx.get(x + ',' + y), idx.get(x + ',' + (y + 1)));
  const F = L.features || {};
  st = { L, T, F, cells, idx, adj, at: new Array(cells.length).fill(null), moves: 0, history: [], over: false,
    done: 0, boxOpen: false, thaw: false };
  L.start.forEach((col, c) => col.forEach((color, k) => {
    const p = { id: nextId++, color, cell: slotCell(c + 1, k), hidden: false, key: false, ice: false };
    st.at[p.cell] = p;
  }));
  (L.startCh || []).forEach((color, x) => {   // discs resting in the channel at the start
    if (color < 0) return;
    const p = { id: nextId++, color, cell: idx.get(x + ',0'), hidden: false, key: false, ice: false };
    st.at[p.cell] = p;
  });
  const discAt = (c, k) => st.at[slotCell(c + 1, k)];
  (F.hidden || []).forEach(([c, k]) => { discAt(c, k).hidden = true; });
  if (F.box) discAt(F.box.key[0], F.box.key[1]).key = true;
  if (F.ice) discAt(F.ice.c, F.ice.k).ice = true;
  sel = null; drag = null;
  afterMove();   // the same settling the generator applies to the start
  buildBoard();
  render();
  $('#lvlNum').textContent = i + 1;
  $('#lvlTag').textContent = L.hard ? 'ZOR' : '';
  $('#par').textContent = '/ ' + L.par + ' hamle';
  setHint('Taşları kaydır, karttaki deseni oluştur', false, true);
  hideOverlay();
  const fresh = Object.keys(F).filter(f => FEATURES[f] && !seen[f]);
  if (fresh.length) showFeature(fresh);
}

// ---------------------------------------------------------------- features (slot c = x - 1)
const bit = c => 1 << c;
const popcount = m => { let n = 0; while (m) { n += m & 1; m >>= 1; } return n; };
function covered(c) {          // sealed and hidden
  const F = st.F;
  if (F.box && F.box.c === c && !st.boxOpen) return 'box';
  if (F.plaster === c && !(st.done & bit(c - 1)) && !(st.done & bit(c + 1))) return 'plaster';
  if (F.bag && F.bag.c === c && popcount(st.done) < F.bag.n) return 'bag';
  return null;
}
const stopperClosed = (c) => !!st.F.stopper && st.F.stopper.c === c && ((st.moves % 2 === 0) !== st.F.stopper.open);
function blocked(c) { return !!(st.done & bit(c)) || !!covered(c) || stopperClosed(c); }
// why the top disc of slot c can't be taken (null = it can)
function takeBlock(c) {
  if (st.done & bit(c)) return 'Bu yuva tamamlandı';
  if (covered(c) === 'box') return 'Kilitli kutu: anahtarlı taşın olduğu yuvayı tamamla';
  if (covered(c)) return 'Bu yuva kapalı';
  if (stopperClosed(c)) return 'Kapak kapalı, bir hamle sonra açılır';
  if (st.F.clay === c) return 'Kil yuva tek yönlü: giren taş geri çıkmaz';
  const top = slotTop(c + 1);
  if (top && top.ice && !st.thaw) return 'Buzlu taş donmuş: herhangi bir yuvayı tamamlayınca buz kırılır';
  return null;
}
const chOk = (x, color) => !st.F.tag || st.F.tag.x !== x || st.F.tag.color === color;
// after a move: box, completions, ice, then channel discs above open slots fall in (repeat);
// returns what changed
function afterMove() {
  const F = st.F, out = { done: [], thaw: false, box: false, falls: [] };
  for (let moved = true; moved;) {
    moved = false;
    for (let again = true; again;) {
      again = false;
      st.L.card.forEach((col, c) => {
        if (st.done & bit(c) || covered(c)) return;
        const have = slotDiscs(c + 1);
        if (have.length === col.length && have.every((p, i) => p.color === col[i])) {
          st.done |= bit(c); out.done.push(c); again = true;
          have.forEach(p => { p.hidden = false; });
        }
      });
      // the box opens once the slot holding the key disc is complete
      if (F.box && !st.boxOpen && st.L.card.some((_, c) => st.done & bit(c) && slotDiscs(c + 1).some(p => p.key))) {
        st.boxOpen = out.box = true; again = true;
      }
    }
    if (st.done && !st.thaw) st.thaw = out.thaw = !!F.ice;
    for (let x = 1; x <= st.L.cols; x++) {
      const from = st.idx.get(x + ',0'), p = st.at[from], to = landing(x);
      if (!p || blocked(x - 1) || to == null) continue;
      st.at[from] = null; st.at[to] = p; p.cell = to;
      out.falls.push({ p, from, to });
      moved = true;
    }
  }
  return out;
}
// may a disc stop in channel cell x? pockets yes; above a slot only when the slot is full or
// closed (`leaving` = slot the disc itself comes out of)
function canRest(x, leaving) {
  if (x === 0 || x === st.T - 1 || blocked(x - 1)) return true;
  return slotCount(x) - (leaving === x ? 1 : 0) >= st.L.cap;
}
function revealTops() {
  for (let x = 1; x <= st.L.cols; x++) {
    const p = slotTop(x);
    if (p && p.hidden && !covered(x - 1)) p.hidden = false;
  }
}

// ---------------------------------------------------------------- geometry
const slotCell = (x, k) => st.idx.get(x + ',' + (st.L.cap - k));     // k = 0 is the bottom
function slotCount(x) { let n = 0; for (let k = 0; k < st.L.cap; k++) if (st.at[slotCell(x, k)]) n++; return n; }
function slotTop(x) { const n = slotCount(x); return n ? st.at[slotCell(x, n - 1)] : null; }
function landing(x) { const n = slotCount(x); return n < st.L.cap ? slotCell(x, n) : null; }
function slotDiscs(x) { const out = []; for (let k = 0; k < st.L.cap; k++) { const p = st.at[slotCell(x, k)]; if (p) out.push(p); } return out; }

function geometry() {
  const L = st.L;
  // the artwork's slots are deeper than any level needs: cut a band out of their straight part
  // so the lowest disc sits in the rounded end (no spare room above the discs)
  const shift = ART_LAST - (CH_Y + L.cap * U);
  const W = ART_W - 2 * OX, H = ART_BOTTOM - shift - OY;
  const stage = $('#stage');
  const availW = Math.max(260, stage.clientWidth - 20);
  const availH = Math.max(300, stage.clientHeight - 10);
  const scale = Math.min(availW / W, availH / H, 0.9);
  return { W, H, scale, shift, y0: CH_Y - OY };
}
// Source slot centres are only used to lay out the background artwork.
// Pieces, pockets, targets, feature overlays and pointer input share this regular grid.
const ART_SLOT_X = [258, 427.5, 599.5, 770.5];
const cx = (x) => GRID_LEFT + x * COLUMN_PITCH - OX;
const cy = (y) => G.y0 + y * U;
const cellXY = (c) => [cx(st.cells[c].x), cy(st.cells[c].y)];
const toXY = ([x, y]) => `translate(${x - D / 2}px, ${y - D / 2}px)`;
const FEAT_ART = (f) => (ART.features && ART.features[f]) || `assets/feat-${f}.png`;

// ---------------------------------------------------------------- render
function discHTML(p) {
  if (p.hidden) return `<div class="disc hidden"><span class="q">?</span></div>`;
  const art = ART.discs[p.color];
  const extra = (p.key ? KEY_ICON : '') + (p.ice && !st.thaw ? ICE : '');
  return `<div class="disc c${p.color}"${art ? ` style="background-image:url('${art}')"` : ''}>${extra}</div>`;
}
const KEY_ICON = `<span class="key-ico"><svg viewBox="0 0 24 24"><g transform="translate(-1 0)"><circle cx="8" cy="12" r="4.2"/><path d="M12 12h9M18 12v3.5M15.5 12v2.5"/></g></svg></span>`;
// ice block around a frozen disc: frost cube, two cracks, snowflake chip
const ICE = `<span class="ice"><img class="ice-cube" src="${ART.features?.iceCube || 'assets/ice-cube.png'}" alt=""><img class="ice-chip" src="${ART.features?.iceChip || 'assets/ice-chip.png'}" alt=""></span>`;
const discSig = (p) => `${p.hidden}|${p.color}|${p.key}|${p.ice && !st.thaw}`;

function buildBoard() {
  // Cancel old movement sounds before replacing the board (restart, resize, level change).
  boardEl.querySelectorAll('.piece').forEach(el => el.getAnimations().forEach(a => a.cancel()));
  stopMarbleRolls();
  G = geometry();
  const { W, H, scale, shift } = G;
  const L = st.L;
  boardEl.style.width = W + 'px';
  boardEl.style.height = H + 'px';
  boardEl.style.transform = `scale(${scale})`;
  frameEl.style.width = W * scale + 'px';
  frameEl.style.height = H * scale + 'px';
  if (ART.table) {
    document.body.style.backgroundImage = `url('${ART.table}')`;
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundPosition = 'center';
  }

  // board artwork in two pieces: the top down to the seam, then the bottom moved up by `shift`
  // (cross-faded over FADE px, the slots are straight there so only the marble veins blend)
  const cut = SEAM - OY;
  // Keep each felt slot at its original width; resize the spaces between slots.
  // This also moves the painted grooves when pocket visibility is turned off.
  const anchors = [[OX, OX], [GRID_LEFT, GRID_LEFT]];
  ART_SLOT_X.forEach((source, i) => {
    const target = GRID_LEFT + (i + 1) * COLUMN_PITCH;
    anchors.push([source - 62, target - 62], [source + 62, target + 62]);
  });
  anchors.push([GRID_RIGHT, GRID_RIGHT], [ART_W - OX, ART_W - OX]);
  const piece = (top, h, srcY, cls, remap) => {
    const edges = remap ? anchors : [[OX, OX], [ART_W - OX, ART_W - OX]];
    return edges.slice(0, -1).map(([srcLeft, left], i) => {
      const [srcRight, right] = edges[i + 1];
      const scaleX = (right - left) / (srcRight - srcLeft);
      // Keep one screen pixel of overlap even at small mobile scales.
      const overlap = i < edges.length - 2 ? 1 / scale : 0;
      return `<div class="board-art ${cls}" style="left:${left - OX}px;top:${top}px;width:${right - left + overlap}px;height:${h + 1 / scale}px;` +
        `background-image:url('${ART.wood}');background-size:${ART_W * scaleX}px ${ART_H}px;background-position:${-srcLeft * scaleX}px ${-srcY}px"></div>`;
    }).join('');
  };
  const playTop = 500 - OY;
  const art = piece(0, playTop, OY, 'art-top', false) +
    piece(playTop, cut + FADE / 2 - playTop, 500, 'art-top', true) +
    piece(cut - FADE / 2, H - cut + FADE / 2, SEAM - FADE / 2 + shift, 'art-bottom', true);

  // target card: dot columns line up with the slots, rows centred in the card frame
  const CARD_Y = 290 - OY, DOT = 80, ROW = 86;
  let dots = '';
  for (let c = 0; c < L.cols; c++) for (let r = 0; r < L.rows; r++) {
    const k = L.rows - 1 - r, color = L.card[c][k];
    const x = cx(c + 1), y = CARD_Y + (r - (L.rows - 1) / 2) * ROW;
    dots += ART.discs[color]
      ? `<image class="dot target-marble" data-c="${c}" data-k="${k}" href="${ART.discs[color]}" x="${x - DOT / 2}" y="${y - DOT / 2}" width="${DOT}" height="${DOT}"/>`
      : `<circle class="dot" data-c="${c}" data-k="${k}" cx="${x}" cy="${y}" r="${DOT / 2 - 2}" fill="${DISC_COLORS[color].face}"/>`;
  }
  let separators = '';
  for (let c = 1; c < L.cols; c++) {
    const sx = (cx(c) + cx(c + 1)) / 2;
    separators += `<path class="recipe-sep" d="M${sx} ${CARD_Y - 160}V${CARD_Y + 160}"/>`;
  }
  // Neutral cups are visual guides only; the coloured pocket stays a separate feature.
  const pockets = st.cells.map((cell, c) => {
    if (st.F.tag && cell.y === 0 && cell.x === st.F.tag.x) return '';
    return `<img class="cell-pocket" data-c="${c}" src="${FEAT_ART('tag')}" alt="" draggable="false" style="transform:${toXY(cellXY(c))}">`;
  }).join('');
  boardEl.innerHTML = `${art}<svg class="art" width="${W}" height="${H}">${separators}${dots}</svg>
    <div class="feats"></div><div class="pockets" aria-hidden="true"${pocketsEnabled ? '' : ' hidden'}>${pockets}</div><div class="spots"></div>`;
  st.els = new Map();
  st.feats = new Map();
  forEachPiece(p => {
    const el = document.createElement('div');
    el.className = 'piece';
    boardEl.appendChild(el);
    st.els.set(p.id, el);
  });
}

// slot covers, lids, clay, stopper and channel tag; elements are kept by id so they can animate out
function featureMarks() {
  const F = st.F, L = st.L, marks = [];
  const art = (f) => `<img src="${FEAT_ART(f)}" alt="">`;
  // a covered slot: from just under the channel down to the rounded end of the slot
  const slotBox = (x) => ({ left: cx(x) - 62, top: G.y0 + 50, width: 124, height: L.cap * U + 10 });
  const mouth = (x) => ({ left: cx(x) - 66, top: G.y0 + 38, width: 132, height: 28 });
  // badge on the marble under the slot, says what kind of slot it is
  for (let c = 0; c < L.cols; c++) {
    const x = c + 1, cov = covered(c), done = !!(st.done & bit(c));
    if (cov === 'box') marks.push(['box' + c, 'cover box', slotBox(x), art('box')]);
    if (cov === 'plaster') marks.push(['pl' + c, 'cover plaster', slotBox(x), art('plaster') + '<i class="arrows"><span>‹</span><span>›</span></i>']);
    if (cov === 'bag') marks.push(['bag' + c, 'cover bag', slotBox(x), `<span class="bag-art">${art('bag')}<b>${F.bag.n - popcount(st.done)}</b></span>`]);
    if (F.clay === c && !done) {
      // One-way slot: the generated ceramic collar joins the lining at the mouth.
      const liner = L.cap <= 3 ? ART.features?.clayLiner3 : ART.features?.clayLiner4;
      marks.push(['clayl' + c, 'clay-liner', slotBox(x), `<img src="${liner || 'assets/clay-liner-4.png'}" alt="">`]);
      marks.push(['clay' + c, 'clay', { left: cx(x) - 64, top: G.y0 + 34, width: 128, height: 40 },
        `<img src="${ART.features?.clayMouth || 'assets/clay-mouth-v2.png'}" alt="">`]);
    }
    if (F.stopper && F.stopper.c === c && !done) {
      // two brass doors over the mouth: shut (slot dimmed, ✕) / slid apart (✓), swap every move
      const shut = stopperClosed(c);
      marks.push(['stopdim' + c, 'stop-dim' + (shut ? ' on' : ''), slotBox(x), '']);
      marks.push(['stop' + c, 'stopper' + (shut ? ' closed' : ''), { left: cx(x) - 72, top: G.y0 + 30, width: 144, height: 46 },
        `<img class="door-img l" src="${ART.features?.stopperDoorL || 'assets/stopper-door-l.png'}" alt=""><img class="door-img r" src="${ART.features?.stopperDoorR || 'assets/stopper-door-r.png'}" alt=""><img class="status-chip chip-open" src="${ART.features.stopperChipOpen}" alt=""><img class="status-chip chip-shut" src="${ART.features.stopperChipShut}" alt="">`]);
    }
    if (done) marks.push(['lid' + c, 'lid', mouth(x), '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>']);
  }
  if (F.tag) {
    const [tx, ty] = [cx(F.tag.x), cy(0)], s = D + 16;
    marks.push(['tag', 'ctag c' + F.tag.color, { left: tx - s / 2, top: ty - s / 2, width: s, height: s }, art('tag')]);
  }
  return marks;
}
function renderFeatures() {
  const box = boardEl.querySelector('.feats');
  const want = new Set();
  for (const [id, cls, r, html] of featureMarks()) {
    want.add(id);
    let el = st.feats.get(id);
    if (!el) { el = document.createElement('div'); box.appendChild(el); st.feats.set(id, el); el.dataset.html = ''; }
    el.className = 'feat ' + cls;
    Object.assign(el.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
  }
  for (const [id, el] of st.feats) {
    if (want.has(id)) continue;
    st.feats.delete(id);
    el.classList.add('gone');
    setTimeout(() => el.remove(), 450);
  }
}

function forEachPiece(fn) { st.at.forEach(p => p && fn(p)); }
function place(p) { st.els.get(p.id).style.transform = toXY(cellXY(p.cell)); }

function render() {
  forEachPiece(p => {
    const el = st.els.get(p.id), sig = discSig(p);
    if (el.dataset.sig !== sig) {
      const wasIce = /\|true$/.test(el.dataset.sig || '');
      el.innerHTML = discHTML(p); el.dataset.sig = sig;
      if (wasIce && !/\|true$/.test(sig)) shatter(el);   // the ice just broke
    }
    el.firstChild.classList.toggle('sel', p === sel);
    if (!(drag && drag.moved && drag.p === p)) place(p);
  });
  renderFeatures();
  // dots on the card light up once their disc is in place (never for hidden or sealed discs)
  boardEl.querySelectorAll('.dot').forEach(d => {
    const c = +d.dataset.c, p = st.at[slotCell(c + 1, +d.dataset.k)];
    d.classList.toggle('ok', !!p && !p.hidden && !covered(c) && p.color === st.L.card[c][+d.dataset.k]);
  });
  showSpots(sel ? dests(sel).cells : []);
  $('#moves').textContent = st.moves;
  $('#btnUndo').disabled = !st.history.length || st.over;
}
// ice breaking: shards fly off the disc
function shatter(el) {
  const box = document.createElement('div');
  box.className = 'shards';
  box.style.setProperty('--shard-art', `url('${ART.features.iceShards}')`);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + Math.random() * .4, d = 70 + Math.random() * 40;
    const sh = document.createElement('i');
    sh.style.setProperty('--dx', Math.cos(a) * d + 'px');
    sh.style.setProperty('--dy', Math.sin(a) * d + 'px');
    sh.style.setProperty('--r', (Math.random() * 300 - 150) + 'deg');
    sh.style.setProperty('--sprite', (i % 4) * -30 + 'px');
    box.appendChild(sh);
  }
  el.appendChild(box);
  setTimeout(() => box.remove(), 700);
}
function showSpots(cells) {
  boardEl.querySelector('.spots').innerHTML = cells.map(c => `<i data-c="${c}" style="transform:${toXY(cellXY(c))}"></i>`).join('');
  const available = new Set(cells);
  boardEl.querySelectorAll('.cell-pocket').forEach(el => {
    el.classList.toggle('available', available.has(+el.dataset.c));
  });
}
function setPocketsEnabled(enabled) {
  pocketsEnabled = !!enabled;
  save(LS.pockets, pocketsEnabled);
  const pockets = boardEl.querySelector('.pockets');
  if (pockets) pockets.hidden = !pocketsEnabled;
}
// short toast over the board (rule messages, completions); the start text stays silent
let hintTimer = 0;
function setHint(text, bad, quiet) {
  const h = $('#hint');
  h.textContent = text; h.classList.toggle('bad', !!bad);
  clearTimeout(hintTimer);
  h.classList.toggle('show', !quiet);
  if (!quiet) hintTimer = setTimeout(() => h.classList.remove('show'), bad ? 2200 : 1400);
}

// ---------------------------------------------------------------- rules
// empty cells reachable from `from`, with BFS parents for the slide path
function reach(from) {
  const par = new Map([[from, -1]]);
  const q = [from];
  while (q.length) {
    const a = q.shift();
    for (const b of st.adj[a]) {
      if (par.has(b) || st.at[b]) continue;
      par.set(b, a);
      q.push(b);
    }
  }
  return par;
}
function dests(p) {
  const own = st.cells[p.cell];
  if (own.kind === 'col' && (takeBlock(own.x - 1) || slotTop(own.x) !== p)) return { cells: [], par: new Map() };
  const par = reach(p.cell);
  const cells = [];
  const leaving = own.kind === 'col' ? own.x : -1;
  for (const c of par.keys()) {
    const cell = st.cells[c];
    if (c !== p.cell && cell.kind === 'ch' && chOk(cell.x, p.color) && canRest(cell.x, leaving)) cells.push(c);
  }
  for (let x = 1; x <= st.L.cols; x++) {
    if (own.kind === 'col' && own.x === x) continue;
    if (blocked(x - 1)) continue;
    const l = landing(x);
    if (l != null && par.has(l)) cells.push(l);
  }
  return { cells, par };
}
// the cell under the finger -> where the disc really ends up (a slot drops it to the bottom)
// (a channel cell above an open slot with room means that slot: the disc would fall in)
function resolve(c, p) {
  if (c == null) return null;
  const cell = st.cells[c];
  if (cell.kind === 'col') return landing(cell.x);
  const own = p ? st.cells[p.cell] : null;
  if (cell.x >= 1 && cell.x <= st.L.cols && !canRest(cell.x, own && own.kind === 'col' ? own.x : -1)) return landing(cell.x);
  return c;
}
// a press on a slot takes its top disc, in the channel the disc under the finger
function grabAt(c) {
  if (c == null) return null;
  const cell = st.cells[c];
  if (cell.kind === 'col') return covered(cell.x - 1) ? null : slotTop(cell.x);
  return st.at[c];
}
const solved = () => st.done === (1 << st.L.cols) - 1;
const snapshot = () => ({ done: st.done, boxOpen: st.boxOpen, thaw: st.thaw,
  hidden: [...st.at].filter(p => p && p.hidden).map(p => p.id),
  pos: [...st.at].filter(Boolean).map(p => [p, p.cell]) });

function doMove(p, to, fromXY) {
  const { cells, par } = dests(p);
  if (!cells.includes(to)) return false;
  const route = [];
  for (let c = to; c !== -1; c = par.get(c)) route.unshift(c);
  st.history.push({ id: p.id, from: p.cell, to, snap: snapshot() });
  st.at[p.cell] = null;
  st.at[to] = p;
  p.cell = to;
  st.moves++;
  sel = null;
  const dest = st.cells[to];
  const ch = afterMove();
  revealTops();
  render();
  if (!ch.falls.some(f => f.p === p)) slide(p, fromXY ? [fromXY, cellXY(to)] : route.map(cellXY));
  // a disc that came to rest above a slot, or waited there for it to open, drops in
  ch.falls.forEach(f => {
    const pts = f.p === p ? (fromXY ? [fromXY, cellXY(f.from), cellXY(f.to)] : route.map(cellXY).concat([cellXY(f.to)])) : [cellXY(f.from), cellXY(f.to)];
    slide(f.p, pts);
  });
  if (ch.done.length) { setTimeout(() => sfx('lock'), 250); setHint(ch.box ? 'Anahtarlı yuva tamamlandı, kutu açıldı!' : ch.thaw ? 'Yuva tamamlandı, buz kırıldı!' : ch.done.length > 1 ? 'Yuvalar tamamlandı!' : 'Yuva tamamlandı!'); }
  else if (ch.box) setHint('Kutu açıldı!');
  else if (ch.thaw) setHint('Buz kırıldı!');
  if (ch.box || ch.thaw) setTimeout(() => sfx('crack'), 200);
  if (solved()) win();
  return true;
}
function undo() {
  const h = st.history.pop();
  if (!h || st.over) return;
  // put every disc back where it was (a move can also drop other discs into slots)
  const was = new Map(st.at.filter(Boolean).map(q => [q, q.cell]));
  st.at.fill(null);
  h.snap.pos.forEach(([q, c]) => { q.cell = c; st.at[c] = q; });
  st.moves--;
  st.done = h.snap.done; st.boxOpen = h.snap.boxOpen; st.thaw = h.snap.thaw;
  const hid = new Set(h.snap.hidden);
  forEachPiece(q => { q.hidden = hid.has(q.id); });
  sel = null;
  render();
  was.forEach((c, q) => { if (c !== q.cell) slide(q, [cellXY(c), cellXY(q.cell)]); });
}

// Only a marble directly underneath makes glass contact; side neighbours do not.
function landingSound(p) {
  const cell = st.cells[p.cell];
  if (cell.y === 0 && (cell.x === 0 || cell.x === st.T - 1 || blocked(cell.x - 1))) return 'marbleSeat';
  const below = st.idx.get(cell.x + ',' + (cell.y + 1));
  return below != null && st.at[below] ? 'marbleHit' : 'marbleSeat';
}

// slide a disc through the corners of its route, ending where place() put it
function slide(p, pts) {
  if (pts.length < 2) return;
  const keep = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const [a, b, c] = [pts[i - 1], pts[i], pts[i + 1]];
    if ((b[0] - a[0]) * (c[1] - b[1]) !== (b[1] - a[1]) * (c[0] - b[0])) keep.push(b);
  }
  keep.push(pts[pts.length - 1]);
  const seg = keep.map((q, i) => i ? Math.hypot(q[0] - keep[i - 1][0], q[1] - keep[i - 1][1]) : 0);
  const len = seg.reduce((a, b) => a + b, 0);
  let acc = 0;
  const frames = keep.map((q, i) => { acc += seg[i]; return { transform: toXY(q), offset: len ? acc / len : 1 }; });
  const el = st.els.get(p.id);
  el.getAnimations().forEach(a => a.cancel());
  el.style.zIndex = 5;
  const duration = Math.min(520, Math.max(140, len / U * 75));
  // Capture the landing surface now so a later move cannot change this sound.
  const impact = landingSound(p);
  const stopRoll = marbleRoll(duration / 1000);
  const animation = el.animate(frames, { duration, easing: 'cubic-bezier(.35,.1,.25,1)' });
  animation.oncancel = () => { stopRoll(); el.style.zIndex = ''; };
  animation.onfinish = () => {
    stopRoll();
    el.style.zIndex = '';
    if (el.isConnected && st.els.get(p.id) === el) sfx(impact);
  };
}

function win() {
  st.over = true;
  const L = st.L;
  const got = st.moves <= L.par ? 3 : st.moves <= L.par + Math.ceil(L.par / 2) ? 2 : 1;
  stars[levelIdx] = Math.max(stars[levelIdx] || 0, got);
  save(LS.stars, stars);
  setTimeout(() => {
    sfx('win');
    const last = levelIdx >= LEVELS.length - 1;
    showPop(`<h2>Harika!</h2>
      <div class="stars">${[0, 1, 2].map(k => `<span class="${k < got ? '' : 'off'}">★</span>`).join('')}</div>
      <p>${st.moves} hamlede bitirdin · hedef ${L.par}</p>
      <button class="btn" data-act="${last ? 'menu' : 'next'}">${last ? 'Bölümler' : 'Sonraki Bölüm'}</button>
      <button class="btn ghost" data-act="retry">Tekrar Oyna</button>`);
  }, 650);
}

// ---------------------------------------------------------------- input
function boardXY(e) {
  const r = frameEl.getBoundingClientRect();
  return [(e.clientX - r.left) / G.scale, (e.clientY - r.top) / G.scale];
}
function nearestCell(x, y, maxDist) {
  let best = null, bd = maxDist;
  st.cells.forEach((c, i) => {
    const d = Math.hypot(cx(c.x) - x, cy(c.y) - y);
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

function onDown(e) {
  if (!st || st.over || !overlayEl.classList.contains('hidden')) return;
  if (!e.target.closest('#board')) { if (sel) { sel = null; render(); } return; }
  audioContext(); // Unlock audio from the pointer gesture, including on mobile Safari.
  const [x, y] = boardXY(e);
  const c = nearestCell(x, y, U * 0.75);
  drag = { c, p: grabAt(c), x0: e.clientX, y0: e.clientY, moved: false, pid: e.pointerId };
}
function onMove(e) {
  if (!drag || e.pointerId !== drag.pid) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 7) {
    if (!drag.p) { drag = null; return; }
    drag.d = dests(drag.p);
    if (!drag.d.cells.length) { nope(drag.p); drag = null; return; }
    drag.moved = true;
    sel = null;
    render();
    showSpots(drag.d.cells);
    st.els.get(drag.p.id).classList.add('dragging');
    sfx('pick');
  }
  if (drag.moved) {
    const [x, y] = boardXY(e);
    const now = performance.now();
    if ((!drag.rollAt || now - drag.rollAt >= 90) &&
        (!drag.rollXY || Math.hypot(x - drag.rollXY[0], y - drag.rollXY[1]) > 3)) {
      marbleRoll(.12, .65);
      drag.rollAt = now;
      drag.rollXY = [x, y];
    }
    st.els.get(drag.p.id).style.transform = toXY([x, y - 20]);
    const to = resolve(nearestCell(x, y - 20, U * 0.9), drag.p);
    boardEl.querySelectorAll('.spots i').forEach(s => s.classList.toggle('over', +s.dataset.c === to));
  }
}
function onUp(e) {
  if (!drag || e.pointerId !== drag.pid) return;
  const d = drag; drag = null;
  if (d.moved) {
    const [x, y] = boardXY(e);
    st.els.get(d.p.id).classList.remove('dragging');
    const from = [x, y - 20];
    const to = resolve(nearestCell(x, y - 20, U * 0.9), d.p);
    if (to == null || !d.d.cells.includes(to) || !doMove(d.p, to, from)) {
      render();
      slide(d.p, [from, cellXY(d.p.cell)]);
      if (to != null && to !== d.p.cell) { setHint(dropBlock(to) || 'Oraya giden yol kapalı', true); sfx('nope'); }
    }
    return;
  }
  // tap: pick a disc, then tap where it should go
  if (sel) {
    const to = resolve(d.c, sel);
    if (to != null && dests(sel).cells.includes(to)) { doMove(sel, to); return; }
    if (d.p === sel || !d.p) { sel = null; render(); return; }
  }
  if (d.p) {
    if (!dests(d.p).cells.length) { nope(d.p); return; }
    sel = d.p; sfx('pick'); render();
  }
}
// why a disc can't be dropped on cell `to` (null = no special reason)
function dropBlock(to) {
  const cell = st.cells[to];
  if (cell.kind !== 'col') return null;
  const c = cell.x - 1;
  if (stopperClosed(c)) return 'Kapak kapalı, bir hamle sonra açılır';
  if (covered(c) === 'box') return 'Kilitli kutu: anahtarlı taşın olduğu yuvayı tamamla';
  return null;
}
function nope(p) {
  const el = st.els.get(p.id).firstChild;
  el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
  const cell = st.cells[p.cell];
  setHint((cell.kind === 'col' && takeBlock(cell.x - 1)) || 'Bu taşın gidebileceği boş yol yok', true);
  sfx('nope');
}
document.addEventListener('pointerdown', onDown);
document.addEventListener('pointermove', onMove);
document.addEventListener('pointerup', onUp);
document.addEventListener('pointercancel', () => {
  if (drag && drag.moved) { st.els.get(drag.p.id).classList.remove('dragging'); drag = null; render(); }
  drag = null;
});
document.addEventListener('animationend', (e) => e.target.classList?.remove('shake'));

// ---------------------------------------------------------------- overlay & buttons
function showPop(html) { popEl.innerHTML = html; overlayEl.classList.remove('hidden'); }
function hideOverlay() { overlayEl.classList.add('hidden'); }
function showFeature(list) {
  const f = list[0], [title, text] = FEATURES[f];
  const intro = ART.features && ART.features[f + 'Intro'];
  const demo = intro ? `<img class="feature-intro" src="${intro}" alt="">` : `<div class="feat-demo demo-${f}"></div>`;
  showPop(`<div class="new">YENİ!</div><h2>${title}</h2>${demo}<p>${text}</p>
    <button class="btn" data-act="feature" data-f="${f}" data-rest="${list.slice(1).join(',')}">Anladım</button>`);
}
function showMenu() {
  const grid = LEVELS.map((L, i) => `<button data-act="go" data-i="${i}" class="${i === levelIdx ? 'cur' : ''} ${L.hard ? 'hard' : ''}">${i + 1}
    <small>${'★'.repeat(stars[i] || 0)}</small></button>`).join('');
  showPop(`<h2>Bölümler</h2><div class="lvl-grid">${grid}</div><button class="btn ghost" data-act="close">Kapat</button>`);
}
popEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  if (act === 'next') startLevel(levelIdx + 1);
  else if (act === 'retry') startLevel(levelIdx);
  else if (act === 'menu') showMenu();
  else if (act === 'go') startLevel(+b.dataset.i);
  else if (act === 'close') hideOverlay();
  else if (act === 'feature') {
    seen[b.dataset.f] = true; save(LS.seen, seen);
    const rest = b.dataset.rest ? b.dataset.rest.split(',') : [];
    if (rest.length) showFeature(rest); else hideOverlay();
  }
});
$('#btnLevels').addEventListener('click', showMenu);
$('#btnSettings').addEventListener('click', () => openAdmin({
  current: levelIdx, jump: startLevel,
  getPockets: () => pocketsEnabled, setPockets: setPocketsEnabled
}));
$('#btnRestart').addEventListener('click', () => startLevel(levelIdx));
$('#btnUndo').addEventListener('click', undo);
window.addEventListener('resize', () => { if (st) { buildBoard(); render(); } });

// ---------------------------------------------------------------- sound
let ac = null;
let rollBuffer = null;
const marbleRolls = new Set();
function audioContext() {
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    return ac;
  } catch (_) { return null; }
}
function stopMarbleRolls() {
  [...marbleRolls].forEach(stop => stop());
}
// Soft, unpitched contact taps: no ringing tones, pitch sweeps or continuous hiss.
function marbleRoll(duration, volume = 1) {
  const ctx = audioContext();
  if (!ctx) return () => {};
  try {
    if (!rollBuffer) {
      rollBuffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 1.2), ctx.sampleRate);
      const data = rollBuffer.getChannelData(0);
      let nextTick = 0, age = 1, strength = .8, softNoise = 0;
      const smoothing = 1 - Math.exp(-2 * Math.PI * 1400 / ctx.sampleRate);
      for (let i = 0; i < data.length; i++) {
        if (i >= nextTick) {
          age = 0;
          strength = .7 + Math.random() * .25;
          nextTick = i + Math.round(ctx.sampleRate * (.065 + Math.random() * .035));
        }
        // A rounded 28 ms tap followed by silence avoids the previous buzzing cadence.
        const envelope = age < .028 ? Math.sin(Math.PI * age / .028) ** 2 : 0;
        softNoise += smoothing * (Math.random() * 2 - 1 - softNoise);
        const edge = Math.min(1, i / (ctx.sampleRate * .005), (data.length - 1 - i) / (ctx.sampleRate * .005));
        data[i] = softNoise * envelope * strength * edge;
        age += 1 / ctx.sampleRate;
      }
    }
    const t = ctx.currentTime, end = t + Math.max(.06, duration);
    const src = ctx.createBufferSource(), low = ctx.createBiquadFilter();
    const high = ctx.createBiquadFilter(), gain = ctx.createGain();
    src.buffer = rollBuffer; src.loop = true;
    src.playbackRate.value = 1;
    low.type = 'lowpass'; low.Q.value = .5; low.frequency.value = 1600;
    high.type = 'highpass'; high.frequency.value = 420; high.Q.value = .5;
    gain.gain.setValueAtTime(.0001, t);
    gain.gain.exponentialRampToValueAtTime(.16 * volume, t + .018);
    gain.gain.exponentialRampToValueAtTime(.065 * volume, Math.max(t + .02, end - .035));
    gain.gain.exponentialRampToValueAtTime(.0001, end);
    src.connect(low).connect(high).connect(gain).connect(ctx.destination);
    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      marbleRolls.delete(stop);
      const at = ctx.currentTime;
      gain.gain.cancelScheduledValues(at);
      gain.gain.setTargetAtTime(.0001, at, .006);
      src.stop(at + .025);
    };
    marbleRolls.add(stop);
    src.onended = () => {
      stopped = true; marbleRolls.delete(stop);
      src.disconnect(); low.disconnect(); high.disconnect(); gain.disconnect();
    };
    src.start(t, Math.random() * .5);
    src.stop(end + .015);
    return stop;
  } catch (_) { return () => {}; }
}
function sfx(kind) {
  try {
    if (!audioContext()) return;
    const t = ac.currentTime;
    if (kind === 'marbleSeat') {
      // Empty felt pocket / slot floor: a quiet, rounded tap with no glass ringing.
      const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * .055), ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const age = i / ac.sampleRate;
        data[i] = (Math.random() * 2 - 1) * (1 - Math.exp(-age * 650)) *
          Math.exp(-age * 95) * (1 - i / data.length);
      }
      const src = ac.createBufferSource(), low = ac.createBiquadFilter();
      const high = ac.createBiquadFilter(), gain = ac.createGain();
      src.buffer = buf;
      low.type = 'lowpass'; low.frequency.value = 1300; low.Q.value = .5;
      high.type = 'highpass'; high.frequency.value = 280; high.Q.value = .5;
      gain.gain.value = .22;
      src.connect(low).connect(high).connect(gain).connect(ac.destination);
      src.onended = () => { src.disconnect(); low.disconnect(); high.disconnect(); gain.disconnect(); };
      src.start(t);
      return;
    }
    if (kind === 'marbleHit') {
      // A dry glass clink: short resonant modes plus a sharp contact transient.
      const pitch = .94 + Math.random() * .12;
      for (const [frequency, level, decay] of [[1050, .12, .07], [2380, .075, .045], [3920, .035, .025]]) {
        const ping = ac.createOscillator(), gain = ac.createGain();
        ping.type = 'sine'; ping.frequency.value = frequency * pitch;
        gain.gain.setValueAtTime(.0001, t);
        gain.gain.exponentialRampToValueAtTime(level, t + .0015);
        gain.gain.exponentialRampToValueAtTime(.0001, t + decay);
        ping.connect(gain).connect(ac.destination);
        ping.onended = () => { ping.disconnect(); gain.disconnect(); };
        ping.start(t); ping.stop(t + decay + .01);
      }
      const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * .018), ac.sampleRate), data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 4);
      const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      src.buffer = buf; f.type = 'bandpass'; f.frequency.value = 2900; f.Q.value = 1.2; g.gain.value = .3;
      src.connect(f).connect(g).connect(ac.destination);
      src.onended = () => { src.disconnect(); f.disconnect(); g.disconnect(); };
      src.start(t);
      return;
    }
    if (kind === 'clack' || kind === 'pick') {
      // short wooden knock: filtered noise burst
      const len = kind === 'pick' ? 0.03 : 0.06;
      const buf = ac.createBuffer(1, ac.sampleRate * len, ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3);
      const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      src.buffer = buf; f.type = 'bandpass'; f.frequency.value = kind === 'pick' ? 1800 : 900; g.gain.value = 0.5;
      src.connect(f).connect(g).connect(ac.destination); src.start(t);
      return;
    }
    const notes = { nope: [[180, .1]], lock: [[660, .07], [990, .12]], crack: [[1400, .04], [900, .05]],
      win: [[523, .1], [659, .1], [784, .1], [1046, .25]] }[kind];
    let at = t;
    for (const [fq, d] of notes) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = kind === 'nope' || kind === 'crack' ? 'square' : 'triangle'; o.frequency.value = fq;
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.1, at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, at + d);
      o.connect(g).connect(ac.destination); o.start(at); o.stop(at + d + 0.02);
      at += d * 0.8;
    }
  } catch (_) {}
}

startLevel(levelIdx);
})();
