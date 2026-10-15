(() => {
'use strict';

// Four vertical tiffins and two temporary tables. Products move directly between stations.
// Only a product with nothing above it can be picked. Only the move that completes a tiffin
// can serve it, so a tiffin is never sent by itself: an order keeps its ingredients but its
// layer sequence is chosen when it opens (the designed one, else the first arrangement no
// full tiffin shows); if no queued order can open that way the customer waits until the
// tiffins change, and refills take the first arrangement no open order shows.
// tools/gen.js runs the same rules, so every level stays solvable.

const $ = (s) => document.querySelector(s);
const boardEl = $('#board'), overlayEl = $('#overlay'), cardEl = $('#card');
const hintEl = $('#hint'), orderEl = $('#orderPanel');
const levelTimers = new Set();
function schedule(fn, ms) {
  const id = window.setTimeout(() => { levelTimers.delete(id); fn(); }, ms);
  levelTimers.add(id);
  return id;
}

const LS = { level: 'tray_level', boosters: 'ps_boosters', won: 'tray_won', seen: 'ps_seen', coins: 'ps_coins', muted: 'ps_muted' };
const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

const FREEZE_MS = 10000;
const COIN_PER_LAYER = 10;
const HEARTS = 3;
const FIRST_WAVE = 1.5;   // the opening customers wait longer, the board starts mixed up
const INGREDIENT_NAMES = FOOD_ITEMS.map(item => item.name);
function ingredientIcon(c) {
  return `<img class="product-sprite" src="assets/items/${FOOD_ITEMS[c].asset}.svg" alt="" aria-hidden="true" draggable="false">`;
}
const FEATURES = {
  frozen: { title: 'Donmuş malzeme', text: 'Buzlu malzeme yerinden oynamaz. Üzerindeki sayı kadar hamle yapınca buz çözülür.' },
  hidden: { title: 'Gizli malzeme', text: 'Ne olduğu görünmez. Üstündekileri kaldırıp en üste çıkınca açılır.' },
  chained: { title: 'Zincirli malzeme', text: 'Zincir kırılmadan alınamaz. Her servis ettiğin içecekte zincir 1 azalır.' },
};

let boosters = load(LS.boosters, { space: 3, freeze: 3, swap: 3 });
let won = load(LS.won, {});
let seen = load(LS.seen, {});
let coins = load(LS.coins, 0);
let muted = load(LS.muted, false);
let levelIdx = Math.min(load(LS.level, 0), LEVELS.length - 1);

let st = null;          // level state
let G = null;           // geometry
let sel = null;         // selected piece
let drag = null;        // pointer interaction
let mode = 'play';      // 'play' | 'swap'
let swapFirst = null;   // first piece picked in swap mode
let nextId = 1;

// ---------------------------------------------------------------- level setup
function startLevel(i) {
  levelTimers.forEach(id => clearTimeout(id));
  levelTimers.clear();
  levelIdx = i;
  save(LS.level, i);
  const L = LEVELS[i];
  st = {
    L, T: L.cols + 2, h: L.h, lanes: L.lanes.slice(), extra: 0,
    queue: L.recipes.map((_, o) => o), slots: [], slotRec: [], waiting: [], wait: [], sup: 0, served: 0, earned: 0,
    hearts: HEARTS, started: false, over: false, freezeUntil: 0, moves: 0, continued: false,
  };
  buildGraph();
  L.start.forEach((col, c) => col.forEach((color, k) => {
    const p = newPiece(color);
    p.cell = trackCell(c + 1, k);
    st.at[p.cell] = p;
  }));
  for (let k = 0; k < L.open; k++) openSlot(k, FIRST_WAVE + k * 0.3);   // staggered, not all at once
  for (const s of L.specials) {
    const p = st.at[trackCell(s.c + 1, s.i)];
    if (s.type === 'frozen') p.frozen = s.n;
    if (s.type === 'chained') p.chain = s.n;
    if (s.type === 'hidden') p.hidden = true;
  }
  sel = null; mode = 'play'; swapFirst = null; drag = null;
  revealTops();
  buildBoard();
  render();
  updateClocks();
  $('#lvlNum').textContent = 'Bölüm ' + (i + 1);
  $('#lvlTag').textContent = L.hard ? 'ZOR' : '';
  setHint('En üstteki ürünü al, siparişle aynı katları hazırla.');

  const types = [...new Set(L.specials.map(s => s.type))].filter(t => !seen[t]);
  if (types.length) showFeature(types);
  else hideOverlay();
}
const sameSeq = (a, b) => a.length === b.length && a.every((v, k) => v === b[k]);
const fullTiffins = () => Array.from({ length: st.L.cols }, (_, c) => trayCups(c + 1).map(p => p.color)).filter(g => g.length === st.h);
// unique arrangements of a recipe, the designed one first
function perms(rec) {
  const out = [], seen = new Set();
  const go = (rest, cur) => {
    if (!rest.length) { const k = cur.join(); if (!seen.has(k)) { seen.add(k); out.push(cur); } return; }
    rest.forEach((v, i) => go(rest.slice(0, i).concat(rest.slice(i + 1)), cur.concat(v)));
  };
  go(rec, []);
  return out;
}
// next customer takes the slot: the first queued order with an arrangement no full tiffin
// shows; if there is none the slot waits (waiting[slot] keeps the patience multiplier).
// wait = [seconds left, seconds total]
function openSlot(slot, mult = 1) {
  const full = fullTiffins();
  let pick = null;
  for (let i = 0; i < st.queue.length && !pick; i++) {
    const r = perms(st.L.recipes[st.queue[i]]).find(r => !full.some(g => sameSeq(g, r)));
    if (r) pick = [i, r];
  }
  st.slots[slot] = pick ? st.queue.splice(pick[0], 1)[0] : null;
  st.slotRec[slot] = pick ? pick[1] : null;
  st.waiting[slot] = !pick && st.queue.length ? mult : 0;
  st.wait[slot] = [st.L.patience * mult, st.L.patience * mult];
  return st.slots[slot];
}
// let waiting customers in once the tiffins allow it (skip: a slot whose ticket is animating)
function fillWaiting(skip = -1) {
  st.waiting.forEach((mult, k) => {
    if (!mult || openSlot(k, mult) == null || k === skip) return;
    const t = orderEl.querySelectorAll('.ticket')[k];
    if (!t) return;
    const holder = document.createElement('div');
    holder.innerHTML = ticketHTML(k);
    t.replaceWith(holder.firstChild);
    orderEl.querySelectorAll('.ticket')[k].classList.add('in');
  });
}
// pending = a refill cup that has not arrived on its tray yet (no element, can't move)
function newPiece(color) { return { id: nextId++, color, frozen: 0, chain: 0, hidden: false, pending: false, cell: -1 }; }

// Preserve station membership when capacity changes.
function buildGraph() {
  const keep = [];
  if (st.at) forEachPiece(p => keep.push([p, st.cells[p.cell].x, st.stacks[st.cells[p.cell].x].indexOf(p.cell)]));
  st.cells = []; st.stacks = [];
  for (let x = 0; x < st.T; x++) {
    const capacity = x === 0 ? st.lanes[0] : x === st.T - 1 ? st.lanes[1] : st.h;
    st.stacks[x] = Array.from({ length: capacity }, (_, k) => {
      const id = st.cells.length; st.cells.push({ x, y: k }); return id;
    });
  }
  st.at = Array(st.cells.length).fill(null);
  keep.forEach(([p, x, k]) => { p.cell = st.stacks[x][k]; st.at[p.cell] = p; });
}

// ---------------------------------------------------------------- geometry
const trackCell = (x, k) => st.stacks[x][k];          // k = 0 is the bottom compartment
function trackCount(x) { return st.stacks[x].filter(c => st.at[c]).length; }
function trackTop(x) { const n = trackCount(x); return n ? st.at[trackCell(x, n - 1)] : null; }
function landing(x) { const n = trackCount(x); return n < st.stacks[x].length ? trackCell(x, n) : null; }
const trayCups = (x) => st.stacks[x].map(c => st.at[c]).filter(Boolean);

// Six separate objects: two tables, four vertical tiffins. Coordinates stay in board space.
function layout() {
  const app = $('#app'), css = getComputedStyle(app);
  const width = app.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
  const others = [...app.children].filter(el => el.id !== 'stage' && getComputedStyle(el).display !== 'none');
  const used = others.reduce((sum, el) => sum + el.getBoundingClientRect().height, 0);
  const available = window.innerHeight - used - others.length * parseFloat(css.rowGap) - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom) - 20;
  const H = tiffinBase() + 66;
  const scale = Math.min(width / 360, Math.max(180, available) / H, 1.4);
  G = { W: 360, H, scale, d: 54, lh: 54, u: 60, screenW: 360 * scale, screenH: H * scale };
}
// board units: tiffins are 84 wide with 60 per tier, tables 172 wide with 56 per place,
// big enough to drag comfortably on a phone
const TIER = 60;
const tiffinBase = () => 222 + (st.h - 1) * TIER;   // y of the bottom tier, just under the tables
function objectCenter(x) {
  if (isTable(x)) return [x === 0 ? 90 : 270, 64];
  return [45 + (x - 1) * 90, tiffinBase()];
}
function cellXY(c) {
  const cell = st.cells[c], stack = st.stacks[cell.x];
  const k = Math.max(0, stack.indexOf(c)), n = stack.length;
  const [x, y] = objectCenter(cell.x);
  if (!isTable(cell.x)) return [x, y - k * TIER];
  if (n <= 3) return [x + (k - (n - 1) / 2) * 56, y - 4];
  return [x + (k % 2 ? 30 : -30), y - 26 + Math.floor(k / 2) * 46];
}
const cx = x => objectCenter(x)[0];
const cy = () => 150;
const toXY = ([x, y]) => `translate(${x - G.d / 2}px, ${y - G.lh / 2}px)`;

// ---------------------------------------------------------------- render
function layerHTML(p) {
  if (p.hidden) return `<div class="disc cx hidden"><span class="q">?</span></div>`;
  let extra = '', cls = '';
  if (p.frozen > 0) { cls += ' frozen'; extra += `<span class="ice"></span><b class="badge">${p.frozen}</b>`; }
  if (p.chain > 0) { cls += ' chained'; extra += chainSVG() + `<b class="badge">${p.chain}</b>`; }
  return `<div class="disc product c${p.color}${cls}">${ingredientIcon(p.color)}${extra}</div>`;
}
function chainSVG() {
  const link = (x, y, r) => `<rect x="${x - 7}" y="${y - 4.5}" width="14" height="9" rx="4.5" transform="rotate(${r} ${x} ${y})" fill="none" stroke="#5d5a6e" stroke-width="3.2"/>` +
    `<rect x="${x - 7}" y="${y - 4.5}" width="14" height="9" rx="4.5" transform="rotate(${r} ${x} ${y})" fill="none" stroke="#c9c6d6" stroke-width="1.2"/>`;
  let s = '';
  for (let k = 0; k < 5; k++) { s += link(10 + k * 10, 10 + k * 10, 45 + (k % 2) * 90); s += link(10 + k * 10, 50 - k * 10, -45 + (k % 2) * 90); }
  return `<svg class="chain" viewBox="0 0 60 60" preserveAspectRatio="none">${s}</svg>`;
}
function ticketHTML(slot) {
  const o = st.slots[slot];
  if (o == null) return st.waiting[slot]
    ? `<div class="ticket empty waiting"><span>…</span><small>Müşteri geliyor</small></div>`
    : `<div class="ticket empty"><span>✓</span><small>Servis edildi</small></div>`;
  const recipe = st.slotRec[slot];
  const menu = MEAL_MENUS[st.L.menuIds[o]];
  const tiers = recipe.map((c, k) => ({ c, k })).reverse().map(({ c, k }) =>
    `<div class="recipe-place" data-tier="${k}" aria-label="${k === 0 ? 'Alt' : k === recipe.length - 1 ? 'Üst' : 'Orta'} kat: ${INGREDIENT_NAMES[c]}">
      <span class="order-product">${ingredientIcon(c)}</span>
    </div>`).join('');
  return `<div class="ticket tone-${menu.tone}" aria-label="${menu.name}. Sefer tasında alttan üste: ${recipe.map((c, k) => `${k === 0 ? 'Alt' : k === recipe.length - 1 ? 'Üst' : 'Orta'} kat: ${INGREDIENT_NAMES[c]}`).join(', ')}">
    <span class="menu-seal" aria-hidden="true">${menu.tone === 'sage' ? '❧' : menu.tone === 'berry' ? '✿' : '✦'}</span><b class="t-head">${menu.name}</b><span class="t-face">Bekliyor</span>
    <div class="recipe-tiffin"><span class="tiffin-mini-handle" aria-hidden="true"></span>${tiers}<svg class="stack-direction" viewBox="0 0 12 72" aria-hidden="true"><path d="M6 68V5m-4 5 4-5 4 5"/></svg></div>
    <div class="t-bar"><i></i></div></div>`;
}

function buildBoard() {
  orderEl.querySelector('.tickets').innerHTML = st.slots.map((_, k) => ticketHTML(k)).join('');
  layout();
  const { W, H, scale } = G;
  const root = document.documentElement.style;
  root.setProperty('--d', G.d + 'px'); root.setProperty('--lh', G.lh + 'px');
  boardEl.style.width = W + 'px'; boardEl.style.height = H + 'px';
  $('#boardFrame').style.width = G.screenW + 'px'; $('#boardFrame').style.height = G.screenH + 'px';
  boardEl.style.transform = `scale(${scale})`;
  let objects = '';
  for (const x of [0, st.T - 1, 1, 2, 3, 4]) {
    const [px, py] = objectCenter(x), table = isTable(x);
    if (table) {
      const slots = st.stacks[x].map(c => {
        const [sx, sy] = cellXY(c);
        return `<ellipse class="place-mark" cx="${sx}" cy="${sy + 16}" rx="25" ry="12"/>`;
      }).join('');
      objects += `<g class="station table" data-x="${x}">
        <ellipse class="station-shadow" cx="${px}" cy="${py + 60}" rx="80" ry="14"/>
        <path class="table-leg" d="M${px-62} ${py+26}v32m124-32v32"/>
        <rect class="table-edge" x="${px-86}" y="${py-38}" width="172" height="100" rx="30"/>
        <rect class="table-top" x="${px-86}" y="${py-50}" width="172" height="100" rx="30"/>
        <path class="wood-grain" d="M${px-70} ${py-28}h140m-144 44h146"/>${slots}
        <text class="station-label" x="${px}" y="${py+80}">MASA ${x === 0 ? 1 : 2}</text>
        <text class="table-kind" x="${px}" y="${py+95}"></text></g>`;
      continue;
    }
    const top = py - (st.h - 1) * TIER;
    let tiers = '';
    for (let k = 0; k < st.h; k++) {
      const y = py - k * TIER;
      tiers += `<g class="tiffin-compartment" data-tier="${k}">
        <rect class="tiffin-tier-edge" x="${px-42}" y="${y-19}" width="84" height="50" rx="12"/>
        <rect style="fill:url(#enamel${x})" class="tiffin-tier" x="${px-42}" y="${y-26}" width="84" height="50" rx="12"/>
        <path class="tiffin-rim" d="M${px-37} ${y-20}Q${px} ${y-28} ${px+37} ${y-20}"/>
        <path class="tiffin-reflection" d="M${px-33} ${y-12}v18"/>
      </g>`;
    }
    objects += `<g class="station tray tiffin enamel-${x}" data-x="${x}">
      <ellipse class="station-shadow" cx="${px}" cy="${py+36}" rx="44" ry="11"/>
      <path class="tiffin-carry-frame" d="M${px-45} ${py+22}V${top-24}Q${px-45} ${top-36} ${px-32} ${top-36}H${px+32}Q${px+45} ${top-36} ${px+45} ${top-24}V${py+22}"/>
      ${tiers}
      <rect class="tiffin-lid-edge" x="${px-44}" y="${top-33}" width="88" height="10" rx="5"/>
      <ellipse class="tiffin-lid" cx="${px}" cy="${top-34}" rx="44" ry="8"/>
      <path class="tiffin-handle" d="M${px-16} ${top-38}v-9q16-11 32 0v9"/>
      <path class="tiffin-clasp" d="M${px+43} ${top-14}v24m0 32v24"/>
      <text class="station-label tiffin-label" x="${px}" y="${py+56}">SEFER TASI</text>
    </g>`;
  }
  boardEl.innerHTML = `<svg class="grooves" width="${W}" height="${H}" aria-hidden="true"><defs>
    ${[['#cf7360','#fff0d5','#f1b4a0','#d98470'],['#5e9c90','#eaf8df','#aad5bd','#6eab9d'],['#cd9c45','#fff4c9','#edcc80','#d1a252'],['#9d87b3','#f6e9f2','#d7c2de','#ac91bb']].map((colors,i)=>`<linearGradient id="enamel${i+1}">${colors.map((c,k)=>`<stop offset="${[0,.22,.65,1][k]}" stop-color="${c}"/>`).join('')}</linearGradient>`).join('')}
    <linearGradient id="tableWood" x2="0" y2="1"><stop stop-color="#f6cf91"/><stop offset="1" stop-color="#dfb270"/></linearGradient>
    <linearGradient id="tiffinMetal"><stop stop-color="#93b6a9"/><stop offset=".16" stop-color="#f1f5e5"/><stop offset=".55" stop-color="#e3edde"/><stop offset="1" stop-color="#aac5b7"/></linearGradient>
    <linearGradient id="tiffinLid" x2="0" y2="1"><stop stop-color="#f7fae9"/><stop offset="1" stop-color="#b7cec0"/></linearGradient>
  </defs>${objects}</svg><div class="spots"></div>`;
  st.pieceEls = new Map();
  forEachPiece(p => { if (!p.pending) addPieceEl(p); });
  updateClocks();
}
function addPieceEl(p) {
  const el = document.createElement('div');
  el.className = 'piece';
  boardEl.appendChild(el);
  st.pieceEls.set(p.id, el);
  return el;
}

function forEachPiece(fn) { st.at.forEach(p => p && fn(p)); }
function place(p) { st.pieceEls.get(p.id).style.transform = toXY(cellXY(p.cell)); }

function render(opt = {}) {
  forEachPiece(p => {
    const el = st.pieceEls.get(p.id);
    if (!el) return;
    const sig = `${p.color}|${p.hidden}|${p.frozen}|${p.chain}`;
    if (el.dataset.sig !== sig) { el.innerHTML = layerHTML(p); el.dataset.sig = sig; el.setAttribute('aria-label', p.hidden ? 'Gizli ürün' : INGREDIENT_NAMES[p.color]); el.title = p.hidden ? 'Gizli ürün' : INGREDIENT_NAMES[p.color]; }
    const disc = el.firstChild;
    disc.classList.toggle('sel', p === sel || p === swapFirst);
    if (opt.pop && opt.pop.includes(p.id)) { disc.classList.remove('pop'); void disc.offsetWidth; disc.classList.add('pop'); }
    if (opt.thaw && opt.thaw.includes(p.id)) disc.classList.add('thaw');
    if (!(drag && drag.moved && drag.p === p)) place(p);
  });
  // a tray glows green while its cups match the start of an open order
  boardEl.querySelectorAll('.tray').forEach(g => {
    const layers = trayCups(+g.dataset.x);
    g.classList.toggle('fit', layers.length > 0 && !layers.some(p => p.hidden || p.pending) && st.slotRec.some(r => r &&
      layers.every((p, k) => r[k] === p.color)));
  });
  boardEl.querySelectorAll('.table').forEach(g => {
    const cups = trayCups(+g.dataset.x);
    g.querySelector('.table-kind').textContent = cups.length
      ? `Yalnızca ${INGREDIENT_NAMES[cups[0].color].toLocaleLowerCase('tr-TR')} · ${cups.length}/${st.stacks[+g.dataset.x].length}`
      : 'Boş · tek tür ürün';
  });
  renderHearts();
  $('#served').textContent = `${st.served} / ${st.L.recipes.length} hazır`;
  $('#earned').textContent = coins.toLocaleString('tr-TR');
  $('#orderProgress').style.width = `${st.served / st.L.recipes.length * 100}%`;
  showSpots(sel && mode === 'play' ? dests(sel).cells : []);
  renderBoosters();
}

function showSpots(cells) {
  boardEl.querySelector('.spots').innerHTML = cells.map(c =>
    `<i data-c="${c}" style="transform:${toXY(cellXY(c))}"></i>`).join('');
}

function renderBoosters() {
  document.querySelectorAll('.booster').forEach(btn => {
    const b = btn.dataset.b;
    btn.querySelector('.cnt').textContent = boosters[b];
    let off = boosters[b] <= 0 || st.over;
    if (b === 'space' && st.extra >= 2) off = true;
    btn.disabled = off && !(b === 'swap' && mode === 'swap');
    btn.classList.toggle('active', b === 'swap' && mode === 'swap');
  });
}

function setHint(text, cls) { hintEl.textContent = text || ''; hintEl.className = cls || ''; }

// ---------------------------------------------------------------- rules
// tiffins give only their top product; a table holds one kind, so any product on it can go
const isTop = p => isTable(st.cells[p.cell].x) || p === trackTop(st.cells[p.cell].x);
function movable(p) { return p && !p.hidden && !p.pending && p.frozen <= 0 && p.chain <= 0 && isTop(p); }

function dests(p) {
  if (!movable(p)) return { cells: [], par: new Map() };
  const own = st.cells[p.cell].x, cells = [], par = new Map([[p.cell, -1]]);
  for (let x = 0; x < st.T; x++) {
    if (x === own || !tableTakes(x, p)) continue;
    const target = landing(x);
    if (target != null) { cells.push(target); par.set(target, p.cell); }
  }
  return { cells, par };
}
const isTable = x => x === 0 || x === st.T - 1;
function tableTakes(x, p) {
  return !isTable(x) || trayCups(x).every(cup => cup.color === p.color);
}
function rejectTableDrop(p, c) {
  if (c == null) return false;
  const x = st.cells[c].x;
  if (!isTable(x) || tableTakes(x, p)) return false;
  const color = trayCups(x)[0].color;
  setHint(`Bu masaya yalnızca ${INGREDIENT_NAMES[color].toLocaleLowerCase('tr-TR')} bırakabilirsin.`, 'swap');
  const table = boardEl.querySelector(`.table[data-x="${x}"]`);
  table?.classList.add('reject');
  schedule(() => table?.classList.remove('reject'), 400);
  sfx('nope'); vibrate(20);
  return true;
}
// a station tap resolves to its next available place
function resolve(c) {
  return c == null ? null : landing(st.cells[c].x);
}

function revealTops() {
  const shown = [];
  for (let x = 0; x < st.T; x++) {
    const p = trackTop(x);
    if (p && p.hidden) { p.hidden = false; shown.push(p.id); }
  }
  return shown;
}

function doMove(p, to, fromXY) {
  const { cells, par } = dests(p);
  if (!cells.includes(to)) return false;
  const route = [];
  for (let c = to; c !== -1; c = par.get(c)) route.unshift(c);
  const source = st.cells[p.cell].x;
  st.at[p.cell] = null;
  if (isTable(source)) {   // close the gap left on the table
    const rest = trayCups(source);
    st.stacks[source].forEach(c => { st.at[c] = null; });
    rest.forEach((q, k) => { q.cell = trackCell(source, k); st.at[q.cell] = q; });
  }
  st.at[to] = p;
  p.cell = to;
  st.moves++;
  const thaw = [];
  forEachPiece(q => { if (q.frozen > 0) { q.frozen--; if (!q.frozen) thaw.push(q.id); } });
  thaw.push(...revealTops());

  sel = null;
  setHint('En üstteki ürünü al, siparişle aynı katları hazırla.');
  render({ thaw });
  slide(p, fromXY ? [fromXY, cellXY(to)] : route.map(cellXY));
  sfx('drop');
  if (thaw.length) schedule(() => sfx('crack'), 120);
  serveReady(fromXY ? 200 : Math.min(560, route.length * 60), [st.cells[to].x]);
  fillWaiting();
  return true;
}

// open order slot a full tiffin matches, or -1
function matchSlot(x) {
  if (isTable(x)) return -1;
  const layers = trayCups(x);
  if (layers.length !== st.h || layers.some(p => p.pending)) return -1;
  const colors = layers.map(p => p.color);
  return st.slotRec.findIndex(r => r && sameSeq(r, colors));
}
// serve the tiffins the player just completed (never any other one)
function serveReady(delay, xs) {
  let wait = delay;
  for (const x of xs) {
    const slot = matchSlot(x);
    if (slot < 0) continue;
    serve(x, slot, trayCups(x), wait);
    wait += 700;
  }
  render();
  if (wait > delay && st.served === st.L.recipes.length) win(wait);
}

function serve(x, slot, layers, delay) {
  const reward = st.h * COIN_PER_LAYER;
  layers.forEach(p => { st.at[p.cell] = null; });
  const oldEls = layers.map(p => { const el = st.pieceEls.get(p.id); st.pieceEls.delete(p.id); return el; });
  st.slots[slot] = st.slotRec[slot] = null;
  openSlot(slot);
  // refill with the first arrangement of the next batch that matches no open order
  const next = st.sup < st.L.batches.length ? st.L.batches[st.sup] : [];
  const batch = perms(next).find(r => !st.slotRec.some(o => o && sameSeq(o, r))) || next;
  const fresh = batch.map((color, k) => {
    const p = newPiece(color);
    p.pending = true;
    p.cell = trackCell(x, k);
    st.at[p.cell] = p;
    return p;
  });
  st.sup++;
  fillWaiting(slot);
  st.served++;
  st.earned += reward;
  coins += reward;
  save(LS.coins, coins);
  const unchained = [];
  forEachPiece(q => { if (q.chain > 0) { q.chain--; if (!q.chain) unchained.push(q.id); } });
  revealTops();

  // animation: cups lift to the ticket, the ticket changes and the tray refills
  const ticket = () => orderEl.querySelectorAll('.ticket')[slot];
  schedule(() => {
    const t = ticket();
    if (!t) return;
    const tr = t.getBoundingClientRect();
    const [tx, ty] = boardXY({ clientX: tr.left + tr.width / 2, clientY: tr.top + tr.height / 2 });
    oldEls.forEach((el, k) => {
      if (!el) return;
      el.style.zIndex = 6;
      const from = cellXY(trackCell(x, k));
      el.animate([{ transform: toXY(from), opacity: 1 },
        { transform: toXY([from[0], from[1] - G.u * 0.4]), opacity: 1, offset: 0.3 },
        { transform: toXY([tx, ty]) + ' scale(.3)', opacity: 0 }],
      { duration: 520, easing: 'cubic-bezier(.5,0,.6,1)', fill: 'forwards' }).onfinish = () => el.remove();
    });
    sfx('col');
    schedule(() => {
      t.classList.add('done');
      celebrate(tx, ty);
      floatText(`+${reward} ✦`, tx, ty);
      sfx('good');
    }, 420);
    schedule(() => {
      const holder = document.createElement('div');
      holder.innerHTML = ticketHTML(slot);
      ticket().replaceWith(holder.firstChild);
      ticket().classList.add('in');
      fresh.forEach((p, k) => {
        if (!p.pending || st.at[p.cell] !== p) return;   // already served again by a chain
        p.pending = false;
        const el = addPieceEl(p);
        el.innerHTML = layerHTML(p);
        el.dataset.sig = `${p.color}|${p.hidden}|${p.frozen}|${p.chain}`;
        place(p);
        el.animate([{ transform: toXY([cx(x), cy(0)]), opacity: 0 }, { transform: toXY(cellXY(p.cell)), opacity: 1 }],
          { duration: 260, delay: k * 70, easing: 'cubic-bezier(.3,1.3,.5,1)', fill: 'backwards' });
      });
      render({ thaw: unchained });
    }, 660);
  }, delay);
}

function celebrate(x, y) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (let i = 0; i < 10; i++) {
    const spark = document.createElement('span');
    spark.className = 'reward-spark'; spark.textContent = i % 2 ? '✦' : '♥';
    spark.style.left = x + 'px'; spark.style.top = y + 'px';
    spark.style.color = ['#ffd267', '#fff4d7', '#ed8f80'][i % 3];
    boardEl.appendChild(spark);
    const angle = Math.PI * 2 * i / 10;
    spark.animate([{ transform: 'translate(-50%,-50%) scale(.3)', opacity: 1 },
      { transform: `translate(${Math.cos(angle)*65}px,${Math.sin(angle)*65}px) rotate(${i*37}deg)`, opacity: 0 }],
      { duration: 750, easing: 'ease-out' }).onfinish = () => spark.remove();
  }
}

function floatText(text, x, y) {
  const el = document.createElement('div');
  el.className = 'float';
  el.textContent = text;
  el.style.left = x + 'px'; el.style.top = y + 'px';
  boardEl.appendChild(el);
  el.animate([{ transform: 'translate(-50%, -50%)', opacity: 1 }, { transform: 'translate(-50%, -160%)', opacity: 0 }],
    { duration: 900, easing: 'ease-out' }).onfinish = () => el.remove();
}

function win(delay) {
  st.over = true;
  const stars = st.continued ? 1 : st.hearts;
  won[levelIdx] = Math.max(won[levelIdx] || 0, stars);
  save(LS.won, won);
  const keys = ['space', 'freeze', 'swap'];
  const gift = keys[Math.floor(Math.random() * 3)];
  boosters[gift]++;
  save(LS.boosters, boosters);
  const names = { space: 'Masa Genişlet', freeze: 'Süre Dondur', swap: 'Yer Değiştir' };
  schedule(() => {
    sfx('win');
    const last = levelIdx >= LEVELS.length - 1;
    showCard(`
      <h2>Tüm siparişler hazır!</h2>
      <div class="stars">${[0, 1, 2].map(k => `<span class="${k < stars ? '' : 'off'}">★</span>`).join('')}</div>
      <div class="stats"><span><b class="result-heart">♥</b> ${st.hearts}/${HEARTS}</span><span><b class="coin-icon">✦</b> +${st.earned}</span></div>
      <p>Hediye: +1 ${names[gift]}</p>
      <button class="btn" data-act="${last ? 'menu' : 'next'}">${last ? 'Bölümler' : 'Sonraki Bölüm'}</button>
      <button class="btn ghost" data-act="retry">Tekrar Oyna</button>`);
  }, delay + 500);
}

// a customer ran out of patience: lose a heart, the order goes to the back of the queue
function customerLeaves(slot) {
  const o = st.slots[slot];
  st.queue.push(o);
  openSlot(slot);
  st.hearts--;
  renderHearts(true);
  sfx('nope');
  vibrate(30);
  const t = orderEl.querySelectorAll('.ticket')[slot];
  if (t) {
    t.classList.add('angry');
    schedule(() => {
      const holder = document.createElement('div');
      holder.innerHTML = ticketHTML(slot);
      const fresh = holder.firstChild;
      t.replaceWith(fresh);
      fresh.classList.add('in');
      render();
    }, 650);
  }
  setHint('Müşteri beklemekten sıkılıp gitti!', 'swap');
  if (st.hearts <= 0) {
    st.over = true; sel = null; mode = 'play'; swapFirst = null;
    cancelDrag();
    schedule(() => {
      sfx('lose');
      showCard(`
        <h2>Müşteriler kaçtı!</h2>
        <p>${st.L.recipes.length} siparişten ${st.served} tanesi servis edildi.</p>
        ${st.continued ? '' : '<button class="btn alt" data-act="continue">+1 Can ile Devam Et</button>'}
        <button class="btn" data-act="retry">Tekrar Dene</button>`);
    }, 700);
  }
}

// slide a layer through the corners of its route, ending where place() put it
function slide(p, pts) {
  const el = st.pieceEls.get(p.id);
  if (!el || pts.length < 2) return;
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
  el.style.zIndex = 5;
  el.animate(frames, { duration: Math.min(560, Math.max(140, len / G.u * 70)), easing: 'cubic-bezier(.35,.1,.25,1)' })
    .onfinish = () => { el.style.zIndex = ''; };
}

// ---------------------------------------------------------------- timer
let lastTs = 0;
function tick(ts) {
  const dt = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 0;
  lastTs = ts;
  if (st && st.started && !st.over && overlayEl.classList.contains('hidden') && !document.hidden) {
    if (performance.now() >= st.freezeUntil) {
      st.slots.forEach((o, k) => {
        if (o == null || st.over) return;
        st.wait[k][0] = Math.max(0, st.wait[k][0] - dt);
        if (st.wait[k][0] <= 0) customerLeaves(k);
      });
    }
    updateClocks();
  }
  requestAnimationFrame(tick);
}
// patience bars and faces on the tickets, freeze tag in the header
function updateClocks() {
  const frozen = performance.now() < st.freezeUntil;
  orderEl.querySelectorAll('.ticket').forEach((t, k) => {
    const w = st.wait[k];
    if (!w || st.slots[k] == null || t.classList.contains('done') || t.classList.contains('angry')) return;
    const r = w[0] / w[1];
    const bar = t.querySelector('.t-bar i');
    if (bar) bar.style.width = (r * 100) + '%';
    t.classList.toggle('low', r < 0.3 && !frozen);
    t.classList.toggle('frozen', frozen);
    const face = t.querySelector('.t-face');
    if (face) face.textContent = frozen ? 'Dondu' : r > 0.6 ? 'Bekliyor' : r > 0.3 ? 'Acele et' : 'Son anlar';
  });
  $('#freezeTag').textContent = frozen ? '❄ ' + Math.ceil((st.freezeUntil - performance.now()) / 1000) : '';
}
function renderHearts(lost) {
  const el = $('#hearts');
  el.setAttribute('aria-label', `${st.hearts} can kaldı`);
  el.innerHTML = Array.from({ length: HEARTS }, (_, k) => `<span class="${k < st.hearts ? '' : 'off'}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21C8 18 2 13 2 7a5 5 0 0 1 10-1A5 5 0 0 1 22 7c0 6-6 11-10 14Z"/></svg></span>`).join('');
  if (lost) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
}
function startClock() { st.started = true; }

// ---------------------------------------------------------------- input
function boardXY(e) {
  const r = $('#boardFrame').getBoundingClientRect();
  return [(e.clientX - r.left) / G.scale, (e.clientY - r.top) / G.scale];
}
function nearestCell(x, y, maxDist) {
  let best = null, distance = maxDist;
  st.cells.forEach((cell, c) => {
    if (!st.stacks[cell.x].includes(c)) return;
    const [px, py] = cellXY(c), d = Math.hypot(px - x, py - y);
    if (d < distance) { best = c; distance = d; }
  });
  if (best != null) return best;
  for (let station = 0; station < st.T; station++) {
    const [px, py] = objectCenter(station);
    const inside = isTable(station)
      ? Math.abs(x - px) < 88 && Math.abs(y - py) < 56
      : Math.abs(x - px) < 46 && y > py - (st.h - 1) * TIER - 34 && y < py + 32;
    if (inside) return st.stacks[station][0];
  }
  return null;
}
// pick the cup directly under the pointer
function grabAt(c) {
  return c == null ? null : st.at[c];
}

function onDown(e) {
  if (!st || st.over || !overlayEl.classList.contains('hidden')) return;
  if (!e.target.closest('#board')) { if (sel) { sel = null; render(); } return; }
  const [x, y] = boardXY(e);
  const c = nearestCell(x, y, G.u * 0.75);
  if (mode === 'swap') return onSwapTap(c);
  drag = { c, p: grabAt(c), x0: e.clientX, y0: e.clientY, moved: false, pid: e.pointerId };
}
function onMove(e) {
  if (!drag || e.pointerId !== drag.pid) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 7) {
    if (!drag.p || drag.p.pending) { drag = null; return; }
    if (!movable(drag.p)) { nope(drag.p); drag = null; return; }
    drag.moved = true;
    drag.d = dests(drag.p);
    sel = null;
    render();
    showSpots(drag.d.cells);
    st.pieceEls.get(drag.p.id).classList.add('dragging');
    startClock();
    vibrate(8);
    sfx('pick');
  }
  if (drag.moved) {
    const [x, y] = boardXY(e);
    st.pieceEls.get(drag.p.id).style.transform = toXY([x, y - 12]);
    const to = resolve(nearestCell(x, y - 12, G.u * 1.1));
    boardEl.querySelectorAll('.spots i').forEach(s => s.classList.toggle('over', +s.dataset.c === to));
  }
}
function onUp(e) {
  if (!drag || e.pointerId !== drag.pid) return;
  const d = drag; drag = null;
  if (d.moved) {
    const [x, y] = boardXY(e);
    st.pieceEls.get(d.p.id).classList.remove('dragging');
    const to = resolve(nearestCell(x, y - 12, G.u * 1.1));
    const from = [x, y - 12];
    if (to == null || !d.d.cells.includes(to) || !doMove(d.p, to, from)) {
      render();
      slide(d.p, [from, cellXY(d.p.cell)]);
      const targetCell = nearestCell(x, y - 12, G.u * 1.1);
      if (!rejectTableDrop(d.p, targetCell) && to != null && to !== d.p.cell) sfx('nope');
    }
    return;
  }
  // tap: a selected cup moves to the next free place on the target station
  const p = d.p && !d.p.pending ? d.p : null;
  if (sel) {
    if (rejectTableDrop(sel, d.c)) return;
    const to = resolve(d.c);
    if (to != null && dests(sel).cells.includes(to)) { startClock(); doMove(sel, to); return; }
    if (p === sel || !p) { sel = null; render(); return; }
  }
  if (p && movable(p)) { sel = p; startClock(); sfx('pick'); render(); }
  else if (p) nope(p);
}
function cancelDrag() {
  if (drag && drag.moved) {
    const el = st.pieceEls.get(drag.p.id);
    if (el) { el.classList.remove('dragging'); place(drag.p); }
  }
  drag = null;
}
function nope(p) {
  const el = st.pieceEls.get(p.id);
  if (el) { const disc = el.firstChild; disc.classList.remove('shake'); void disc.offsetWidth; disc.classList.add('shake'); }
  if (!p.hidden && !isTop(p)) setHint('Önce üstündeki ürünü almalısın', 'swap');
  else if (p.frozen > 0) setHint(`Buz ${p.frozen} hamle sonra çözülecek`);
  else if (p.chain > 0) setHint(`Zincir ${p.chain} servis sonra kırılacak`);
  else if (!dests(p).cells.length) setHint('Boş yer yok');
  sfx('nope');
}

// swap booster: tap any two layers (buried ones too)
function onSwapTap(c) {
  const p = c == null ? null : st.at[c];
  if (!p || p.pending) return;
  if (p.frozen > 0 || p.chain > 0) { nope(p); return; }
  if (isTable(st.cells[c].x)) { setHint('Masadaki malzemeler değiştirilemez', 'swap'); sfx('nope'); return; }
  if (!swapFirst) { swapFirst = p; sfx('pick'); render(); setHint('Şimdi değiştirmek istediğin ikinci malzemeye dokun', 'swap'); return; }
  if (swapFirst === p) { swapFirst = null; render(); setHint('Yer değiştirmek için iki malzemeye dokun', 'swap'); return; }
  const a = swapFirst, b = p;
  const ca = a.cell, cb = b.cell;
  st.at[ca] = b; st.at[cb] = a; a.cell = cb; b.cell = ca;
  a.hidden = b.hidden = false;
  boosters.swap--; save(LS.boosters, boosters);
  mode = 'play'; swapFirst = null;
  startClock();
  render({ pop: [a.id, b.id] });
  slide(a, [cellXY(ca), cellXY(cb)]);
  slide(b, [cellXY(cb), cellXY(ca)]);
  setHint('');
  sfx('good');
  serveReady(300, [st.cells[a.cell].x, st.cells[b.cell].x]);
  fillWaiting();
}

document.addEventListener('pointerdown', onDown);
document.addEventListener('pointermove', onMove);
document.addEventListener('pointerup', onUp);
document.addEventListener('pointercancel', () => { if (drag && drag.moved) { cancelDrag(); render(); } drag = null; });

// ---------------------------------------------------------------- boosters
document.querySelectorAll('.booster').forEach(btn => btn.addEventListener('click', () => {
  if (!st || st.over) return;
  const b = btn.dataset.b;
  if (b === 'swap' && mode === 'swap') { mode = 'play'; swapFirst = null; setHint(''); render(); return; }
  if (boosters[b] <= 0) return;
  sel = null;
  if (b === 'space') {
    if (st.extra >= 2) return;
    st.lanes[st.lanes[0] <= st.lanes[1] ? 0 : 1]++;   // the shorter shelf grows one cell
    st.extra++;
    boosters.space--;
    const before = new Map();
    forEachPiece(q => before.set(q.id, cellXY(q.cell)));
    buildGraph();
    buildBoard();
    render();
    forEachPiece(q => { const a = before.get(q.id), b = cellXY(q.cell); if (a[0] !== b[0] || a[1] !== b[1]) slide(q, [a, b]); });
    setHint('Masaya bir yer eklendi');
    sfx('good');
  } else if (b === 'freeze') {
    st.freezeUntil = Math.max(performance.now(), st.freezeUntil) + FREEZE_MS;
    boosters.freeze--;
    startClock();
    render();
    setHint('Müşteriler 10 saniye sabırla bekleyecek');
    sfx('crack');
  } else if (b === 'swap') {
    mode = 'swap'; swapFirst = null;
    render();
    setHint('Yer değiştirmek için iki malzemeye dokun', 'swap');
  }
  save(LS.boosters, boosters);
}));

// ---------------------------------------------------------------- overlay
let previousFocus = null;
function showCard(html) {
  cancelDrag();
  if (overlayEl.classList.contains('hidden')) previousFocus = document.activeElement;
  cardEl.innerHTML = html; overlayEl.classList.remove('hidden');
  cardEl.querySelector('button')?.focus({ preventScroll: true });
}
function hideOverlay() {
  overlayEl.classList.add('hidden');
  if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
}
function showHelp() {
  showCard(`<div class="eyebrow">KÜÇÜK BİR KAHVE MOLASI</div><h2>Birlikte hazırlayalım.</h2>
    <ol class="help-steps"><li>Sefer tasındaki bir yiyeceğe veya içeceğe dokunarak seç.</li><li>İki masadan birine bırak. İstersen sürükleyerek taşı.</li><li>Ürünlerin alttan üste dizilişini siparişteki sefer tasıyla eşleştir. Tamamlanan sefer tası otomatik servis edilir.</li></ol>
    <p>Her masa yalnızca tek tür ürün alır. Boş masaya istediğin türle başlayabilirsin.</p>
    <button class="btn" data-act="close">Hazırlamaya başla</button>`);
}

function showFeature(types) {
  const t = types[0];
  const f = FEATURES[t];
  const demo = { color: 2, frozen: t === 'frozen' ? 5 : 0, chain: t === 'chained' ? 2 : 0, hidden: t === 'hidden' };
  showCard(`
    <div class="eyebrow">YENİ BİR SÜRPRİZ</div>
    <h2>${f.title}</h2>
    <div class="demo">${layerHTML(demo)}</div>
    <p>${f.text}</p>
    <button class="btn" data-act="feature" data-t="${t}" data-rest="${types.slice(1).join(',')}">Anladım</button>`);
}

function showMenu() {
  let g = '';
  LEVELS.forEach((L, i) => {
    g += `<button data-act="go" data-i="${i}" class="${L.hard ? 'hard' : ''} ${i === levelIdx ? 'cur' : ''} ${won[i] ? 'won' : ''}">${i + 1}</button>`;
  });
  showCard(`
    <div class="eyebrow">HER KATTA YENİ BİR LEZZET</div><h2>Lezzet yolculuğun</h2><p>Bir bölüm seç, tezgâhın başına geç.</p>
    <div class="lvl-grid">${g}</div>
    <button class="btn ghost" data-act="close">Kapat</button>
    <button class="small-link" data-act="help">Nasıl oynanır?</button>`);
}

cardEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  if (act === 'next') startLevel(levelIdx + 1);
  else if (act === 'retry') startLevel(levelIdx);
  else if (act === 'menu') showMenu();
  else if (act === 'go') startLevel(+b.dataset.i);
  else if (act === 'close') hideOverlay();
  else if (act === 'help') showHelp();
  else if (act === 'continue') {
    st.continued = true; st.over = false; st.hearts = 1;
    st.wait.forEach(w => { w[0] = w[1]; });
    hideOverlay(); render(); updateClocks();
  } else if (act === 'feature') {
    seen[b.dataset.t] = true; save(LS.seen, seen);
    const rest = b.dataset.rest ? b.dataset.rest.split(',') : [];
    if (rest.length) showFeature(rest); else hideOverlay();
  }
});
$('#btnLevels').addEventListener('click', showMenu);
$('#btnRestart').addEventListener('click', () => {
  if (!st.started || st.over) { startLevel(levelIdx); return; }
  showCard('<div class="eyebrow">TAZE BİR BAŞLANGIÇ</div><h2>Yeniden hazırlayalım mı?</h2><p>Bu bölümdeki hamlelerin sıfırlanacak.</p><button class="btn" data-act="retry">Yeniden başla</button><button class="btn ghost" data-act="close">Oyuna dön</button>');
});
function renderSound() {
  $('#btnSound').setAttribute('aria-pressed', String(muted));
  $('#btnSound').setAttribute('aria-label', muted ? 'Sesi aç' : 'Sesi kapat');
}
$('#btnSound').addEventListener('click', () => { muted = !muted; save(LS.muted, muted); renderSound(); });
renderSound();
document.addEventListener('keydown', e => {
  if (overlayEl.classList.contains('hidden')) return;
  if (e.key === 'Escape' && cardEl.querySelector('[data-act="close"]')) hideOverlay();
  if (e.key === 'Tab') {
    const buttons = [...cardEl.querySelectorAll('button')];
    const first = buttons[0], last = buttons[buttons.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  }
});
window.addEventListener('resize', () => { if (st) { cancelDrag(); buildBoard(); render(); } });

// ---------------------------------------------------------------- sound
let ac = null;
function sfx(kind) {
  if (muted) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const notes = {
      pick: [[520, .05]], drop: [[330, .07]], good: [[660, .07], [880, .09]],
      col: [[660, .08], [880, .08], [1100, .14]], nope: [[180, .1]], crack: [[1400, .04], [900, .05]],
      win: [[523, .1], [659, .1], [784, .1], [1046, .25]], lose: [[392, .15], [330, .15], [262, .3]],
    }[kind];
    let t = ac.currentTime;
    for (const [f, d] of notes) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = kind === 'nope' ? 'square' : 'triangle';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(ac.destination);
      o.start(t); o.stop(t + d + 0.02);
      t += d * 0.8;
    }
  } catch (_) {}
}
function vibrate(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (_) {} }

document.addEventListener('animationend', (e) => e.target.classList?.remove('shake'));

startLevel(levelIdx);
requestAnimationFrame(tick);
})();
