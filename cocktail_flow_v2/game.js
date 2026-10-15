// Cocktail Belt — a conveyor belt runs round the bar in a loop; customers sit
// here and there around it, each with a drink order: a list of fruits to be
// added in order. The fruits wait in 3 lanes under the belt; tap a lane and its
// front fruit jumps straight onto the belt above it. The belt carries it round
// the loop, and the first customer it passes whose order needs exactly that
// fruit next takes it (their glass gets that layer). Nobody wants it: it keeps
// going round. The belt holds only `beltSlots` fruits; full with nothing
// anybody wants = jammed.
(() => {
'use strict';
const P = window.BeltProgression;
const Core = window.BeltCore;
const A = window.BeltAssets;
const LEVELS = (window.BELT_LEVELS || []).slice().sort((a, b) => a.levelOrder - b.levelOrder);

const ARRIVE_S = 0.5;     // card slide-in; patience starts after it
const LEAVE_S = 0.8;      // happy customer leaves, the next one takes the seat
const ANGRY_S = 1.4;      // sad face after running out of patience
const POSITIONS = 24;     // places on the belt (spacing); beltSlots caps how many are used
const THROW_MS = 280;
const TAKE_MS = 360;
const SAVE_KEY = 'cocktail_belt_v1';
// Where customers sit: inside the loop, against one run of it, t = how far
// along that run (in the belt's direction). The belt runs left -> right
// along the bottom (where the fruits get on), up the right side, right -> left
// along the top, down the left side. No seat on the bottom run, so a fruit
// passes the seats in this order wherever it lands.
const SPOTS = {
  A: { run: 'right', side: 'in', t: 0.1 },
  B: { run: 'right', side: 'in', t: 0.9 },
  C: { run: 'top', side: 'in', t: 0.8 },
  D: { run: 'left', side: 'in', t: 0.9 },
};
const SEAT_SETS = { 1: ['C'], 2: ['A', 'C'], 3: ['A', 'B', 'D'], 4: ['A', 'B', 'C', 'D'] };
const qs = new URLSearchParams(location.search);

const $ = s => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const SVGNS = 'http://www.w3.org/2000/svg';

// ---------- save ----------
function loadSave() {
  // patience: customers' patience timers (pause panel switch, off by default)
  const base = { unlocked: 0, current: 0, coins: 0, howto: false, patience: false };
  try { return Object.assign(base, JSON.parse(localStorage.getItem(SAVE_KEY)) || {}); }
  catch (e) { return base; }
}
function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* private mode */ } }
const save = loadSave();

// ---------- state ----------
let G = null;
let runToken = 0;
let itemId = 0;

function rawLevel(order) { return LEVELS.find(l => l.levelOrder === order) || null; }
function nextOrder(order) { const n = LEVELS.find(l => l.levelOrder > order); return n ? n.levelOrder : null; }

function startLevel(order) {
  const raw = rawLevel(order) || LEVELS[0];
  const L = Core.resolveLevel(raw);
  const errs = Core.validateLevel(L);
  runToken++;
  G = {
    L,
    lanes: L.lanes.map(list => ({ list, ptr: 0 })),
    // pos[k] = fruit on belt place k ({ id, c }); place k sits at
    // u = k / POSITIONS + phase along the loop (0 = bottom-left, belt direction)
    phase: 0,
    pos: Array(POSITIONS).fill(null),
    queue: L.orders.map((o, i) => ({ uid: i, name: o.name, layers: o.layers, patience: o.patience, coins: o.coins })),
    seats: SEAT_SETS[L.seats].map(place => ({ place, state: 'empty', u: 0 })),
    total: L.orders.length,
    served: 0,
    hearts: L.startingHearts,
    coins: 0,
    status: 'play',
    paused: false,
    lastChar: 0,
  };
  save.current = L.levelOrder; writeSave();
  const bg = A.url('bg');
  $('#bg').style.backgroundImage = bg ? `url("${bg}")` : '';
  G.seats.forEach(fillSeat);
  buildSupply();
  buildSeats();
  clearItems();
  hidePanel();
  layout();
  renderAll();
  if (L.difficulty) flashHint('Zor bölüm! Bantta yer az.', 'bad');
  if (errs.length) {
    G.status = 'error';
    console.error(`Level ${L.levelOrder}:`, errs);
    showPanel(`<h2>Bölüm verisi hatalı</h2><p class="err">${errs.join('<br>')}</p>`, [['Bölümler', showLevels]]);
  } else if (!save.howto) showHowto();
}

// ---------- customers ----------
function fillSeat(seat) {
  if (!G.queue.length) { seat.state = 'empty'; seat.order = null; return; }
  seat.order = G.queue.shift();
  seat.k = 0;                       // fruits taken so far
  seat.state = 'arriving';
  seat.t = ARRIVE_S;
  seat.left = seat.max = seat.order.patience;
  seat.mood = null; seat.angry = 0;
  seat.char = pickChar();
}

function pickChar() {
  const used = new Set(G.seats.filter(s => s.state !== 'empty').map(s => s.char));
  const pool = A.customerPool().filter(c => !used.has(c) && c !== G.lastChar);
  const c = pool.length ? pool[Math.floor(Math.random() * pool.length)] : A.customerPool()[0];
  G.lastChar = c;
  return c;
}

function seated(s) { return s.state === 'arriving' || s.state === 'active'; }
function wants(s, c) { return seated(s) && s.order.layers[s.k] === c; }

// Out of patience: the customer stays (what they took stays in their glass),
// a heart is lost and the patience starts again.
function runOut(s) {
  G.hearts--;
  s.left = s.max; s.mood = 'sad'; s.angry = ANGRY_S;
  restartAnim(seatEls[G.seats.indexOf(s)].wrap, 'shake');
  flashHint('Müşteri sabırsızlandı! −1 kalp', 'bad');
  if (G.hearts <= 0) end('lost');
}

// ---------- moves ----------
function onBelt() { return G.pos.reduce((n, it) => n + (it ? 1 : 0), 0); }
function uOf(k, phase = G.phase) { return (k / POSITIONS + phase) % 1; }

// The front fruit of lane i jumps onto the free belt place nearest to the
// point straight above the lane.
function tapLane(i) {
  if (G.status !== 'play' || G.paused) return;
  const lane = G.lanes[i];
  if (lane.ptr >= lane.list.length) return;
  if (onBelt() >= G.L.beltSlots) {
    restartAnim(laneEls[i].node, 'bad');
    restartAnim($('#cap'), 'bad');
    return flashHint('Bant dolu! Önce müşteriler bir şey alsın.', 'bad');
  }
  const target = laneEls[i].u;
  let best = -1, dist = 2;
  G.pos.forEach((it, k) => {
    if (it) return;
    const d = Math.abs(((uOf(k) - target) % 1 + 1.5) % 1 - 0.5);
    if (d < dist) { dist = d; best = k; }
  });
  const from = laneEls[i].front.getBoundingClientRect();
  const c = lane.list[lane.ptr++];
  const item = { id: ++itemId, c };
  G.pos[best] = item;
  makeItem(item, from);
  checkJam();
  renderAll();
}

function take(seat, k) {
  const item = G.pos[k];
  G.pos[k] = null;
  const i = G.seats.indexOf(seat);
  flyTake(item, i, seat.k);
  seat.k++;
  G.fillAt = { seat: i, index: seat.k - 1 };
  if (seat.k >= seat.order.layers.length) serve(seat, i);
}

function serve(seat, i) {
  G.coins += seat.order.coins;
  floatCoins(i, seat.order.coins);
  seat.state = 'leaving'; seat.mood = 'happy'; seat.t = LEAVE_S;
  G.served++;
  flashHint('Afiyet olsun!', 'info');
  if (G.served >= G.total) end('won');
}

// Full belt, more fruits to throw, nobody wants what is on it and no new
// customer on the way: nothing can change any more.
function checkJam() {
  if (G.status !== 'play' || onBelt() < G.L.beltSlots) return;
  if (G.lanes.every(l => l.ptr >= l.list.length)) return;
  if (G.seats.some(s => s.state === 'leaving' || s.state === 'arriving')) return;
  if (G.pos.some(it => it && G.seats.some(s => wants(s, it.c)))) return;
  end('stuck');
}

function end(status) {
  G.status = status;
  const tok = runToken;
  if (status === 'won') {
    const nx = nextOrder(G.L.levelOrder);
    if (nx !== null) save.unlocked = Math.max(save.unlocked, nx);
    writeSave();
  }
  setTimeout(() => { if (tok === runToken) showEnd(status); }, status === 'won' ? 1300 : 800);
}

// ---------- loop ----------
let last = 0;
function tick(now) {
  const dt = Math.min(0.1, (now - last) / 1000 || 0);
  last = now;
  if (G && !G.paused && !G.manual && (G.status === 'play' || G.status === 'won')) step(dt);
  requestAnimationFrame(tick);
}

// a point at u passes x while u moves on by d
function passes(u, d, x) { const off = ((x - u) % 1 + 1) % 1; return off > 0 && off <= d; }

function step(dt) {
  let changed = false;
  if (G.status === 'play') {
    const d = dt / G.L.lap;
    for (let k = 0; k < POSITIONS; k++) {
      const it = G.pos[k];
      if (!it) continue;
      const u = uOf(k);
      const s = G.seats.find(q => passes(u, d, q.u) && wants(q, it.c));
      if (s) { take(s, k); changed = true; }
    }
    G.phase = (G.phase + d) % 1;
    for (const s of G.seats) {
      if (s.state === 'arriving') {
        if ((s.t -= dt) <= 0) { s.state = 'active'; changed = true; }
      } else if (s.state === 'active') {
        if (s.angry > 0 && (s.angry -= dt) <= 0) { s.mood = null; changed = true; }
        if (save.patience) {
          s.left = Math.max(0, s.left - dt);
          if (s.left <= 0) { runOut(s); changed = true; }
        }
      } else if (s.state === 'leaving') {
        if ((s.t -= dt) <= 0) { fillSeat(s); changed = true; }
      }
      if (G.status !== 'play') break;
    }
    if (changed) checkJam();
  }
  if (changed) renderAll(); else renderTimers();
  renderBelt();
}

function pause(on) {
  if (!G || G.status !== 'play') return;
  G.paused = on;
  if (on) showPause(); else hidePanel();
}
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(true); });
window.addEventListener('pagehide', () => pause(true));

// ---------- drawings ----------
function color(c) { return P.COLORS[c] || { hex: '#999', hi: '#bbb', lo: '#777' }; }

// The fruits, one per colour, on a 40x40 canvas.
const INK = '#5b2e1a';
function fruitSVG(c) {
  const C = color(c), o = `stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"`;
  const leaf = (d) => `<path d="${d}" fill="#4fae22" ${o}/>`;
  const shine = (d) => `<path d="${d}" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="2.4" stroke-linecap="round"/>`;
  const body = {
    pink:   // strawberry
      `<path d="M20 37 C9 31 5.5 22 7 16 C8.5 11 14 10.5 20 12.5 C26 10.5 31.5 11 33 16 C34.5 22 31 31 20 37Z" fill="${C.hex}" ${o}/>` +
      [[13, 18], [20, 17], [27, 18], [16, 24], [24, 24], [20, 30]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="1.1" ry="1.6" fill="#fff3b0"/>`).join('') +
      leaf('M11 13 L15 6.5 L20 11 L25 6.5 L29 13 Q20 16.5 11 13Z') + shine('M11 19 Q11.5 24 14 27'),
    orange: // orange
      `<circle cx="20" cy="22" r="13.5" fill="${C.hex}" ${o}/>` +
      [[15, 19], [24, 17], [26, 26], [17, 28], [21, 23]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".9" fill="${C.lo}"/>`).join('') +
      `<path d="M20 9 L20 6" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>` + leaf('M20 8.5 Q26 2.5 32 6.5 Q26 12 20 8.5Z') + shine('M11 19 Q12 14 16 12'),
    purple: // grapes
      `<path d="M20 9 L20 4" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>` + leaf('M20 7 Q27 1.5 33 6 Q26 11 20 7Z') +
      [[12.5, 14], [20, 13], [27.5, 14], [16, 21], [24, 21], [20, 28.5], [12, 21.5], [28, 21.5]].slice(0, 6)
        .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5.6" fill="${C.hex}" ${o}/><circle cx="${x - 1.8}" cy="${y - 1.8}" r="1.5" fill="#fff" opacity=".55"/>`).join(''),
    lime:   // lime slice
      `<circle cx="20" cy="21" r="15" fill="${C.lo}" ${o}/><circle cx="20" cy="21" r="12" fill="#e9f8c8"/><circle cx="20" cy="21" r="10.4" fill="${C.hi}"/>` +
      [0, 1, 2, 3, 4, 5, 6, 7].map(j => { const a = j * Math.PI / 4; return `<path d="M20 21 L${(20 + 10.4 * Math.cos(a)).toFixed(1)} ${(21 + 10.4 * Math.sin(a)).toFixed(1)}" stroke="#e9f8c8" stroke-width="1.6"/>`; }).join('') +
      `<circle cx="20" cy="21" r="2" fill="#e9f8c8"/>`,
    blue:   // blueberry
      `<circle cx="20" cy="22" r="14" fill="${C.hex}" ${o}/>` +
      `<path d="M20 11 L22 14.5 L26 14 L23.6 17 L25 20.5 L20 18.8 L15 20.5 L16.4 17 L14 14 L18 14.5Z" fill="${C.lo}" ${o}/>` + shine('M10.5 22 Q11 16 15 13.5'),
  }[c] || `<circle cx="20" cy="21" r="14" fill="${C.hex}" ${o}/>`;
  return `<svg viewBox="0 0 40 40" class="fruit"><ellipse cx="20" cy="37" rx="12" ry="2.6" fill="#00000022"/>${body}</svg>`;
}

// The customer's glass (mixer.png); every fruit taken adds its colour as a layer.
function glassMarkup() {
  const B = A.GLASS, q = B.liquid;
  const url = A.url('mixer');
  const back = url ? `<img class="glass-art" src="${url}" alt="">`
    : `<svg class="glass-art" viewBox="0 0 ${B.w} ${B.h}"><path d="M60 230 L60 800 Q60 850 110 850 L290 850 Q340 850 340 800 L340 230 Z" fill="rgba(255,255,255,.45)" stroke="#8a6a55" stroke-width="10"/></svg>`;
  return back + `<div class="liquid" style="left:${q.x / B.w * 100}%;top:${q.y / B.h * 100}%;width:${q.w / B.w * 100}%;height:${q.h / B.h * 100}%;` +
    `border-radius:0 0 ${q.r / q.w * 100}% ${q.r / q.w * 100}% / 0 0 ${q.r / q.h * 100}% ${q.r / q.h * 100}%"></div>`;
}

// ---------- belt ----------
// A rounded-rectangle loop drawn in SVG in stage pixels (wood rim, brass
// rails, dark band, moving slats and arrows). The fruits are DOM nodes placed
// on the band's centre line every frame.
const beltSvg = $('#belt'), itemsEl = $('#items');
let geo = null;          // loop geometry, set by layout()
let itemEls = {};        // item id -> node
let chevrons = [];

// point + direction at distance s along the band's centre line
function loopPoint(s) {
  const g = geo, { x0, x1, y0, y1, R, sx, sy, arc } = g;
  s = ((s % g.len) + g.len) % g.len;
  const corner = (cx, cy, a0) => { const a = a0 + s / R; return { x: cx + R * Math.cos(a), y: cy - R * Math.sin(a), dx: -Math.sin(a), dy: -Math.cos(a) }; };
  if (s < sx) return { x: x0 + R + s, y: y1, dx: 1, dy: 0 };
  if ((s -= sx) < arc) return corner(x1 - R, y1 - R, -Math.PI / 2);
  if ((s -= arc) < sy) return { x: x1, y: y1 - R - s, dx: 0, dy: -1 };
  if ((s -= sy) < arc) return corner(x1 - R, y0 + R, 0);
  if ((s -= arc) < sx) return { x: x1 - R - s, y: y0, dx: -1, dy: 0 };
  if ((s -= sx) < arc) return corner(x0 + R, y0 + R, Math.PI / 2);
  if ((s -= arc) < sy) return { x: x0, y: y0 + R + s, dx: 0, dy: 1 };
  s -= sy;
  return corner(x0 + R, y1 - R, Math.PI);
}
function beltPoint(u) { return loopPoint(u * geo.len); }
// distance along the loop where a run starts (in the belt's direction)
function runStart(run) {
  const { sx, sy, arc } = geo;
  return { bottom: 0, right: sx + arc, top: sx + 2 * arc + sy, left: 2 * sx + 3 * arc + sy }[run];
}
function runLength(run) { return run === 'top' || run === 'bottom' ? geo.sx : geo.sy; }

function drawBelt() {
  const g = geo, { x0, x1, y0, y1, R, band, rim } = g;
  const d = `M ${x0 + R} ${y1} L ${x1 - R} ${y1} A ${R} ${R} 0 0 0 ${x1} ${y1 - R} L ${x1} ${y0 + R} A ${R} ${R} 0 0 0 ${x1 - R} ${y0} ` +
    `L ${x0 + R} ${y0} A ${R} ${R} 0 0 0 ${x0} ${y0 + R} L ${x0} ${y1 - R} A ${R} ${R} 0 0 0 ${x0 + R} ${y1} Z`;
  const stroke = (w, col, extra = '') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" ${extra}/>`;
  const gap = g.len / Math.round(g.len / 16);
  beltSvg.innerHTML =
    `<path d="${d}" fill="none" stroke="#3b2314" stroke-opacity=".22" stroke-width="${band + 2 * rim + 4}" transform="translate(0 5)"/>` +
    `<path d="${d}" fill="#f4e2c3" stroke="none"/>` +
    `<path d="${d}" fill="none" stroke="#e2c79d" stroke-width="${band + 2 * rim + 18}" stroke-opacity=".6"/>` +
    stroke(band + 2 * rim, '#8f5f3b') + stroke(band + 2 * rim - 3, '#b07d4d') + stroke(band + 2 * rim * 0.45, '#a26f42') +
    stroke(band + 7, '#d9b45e') + stroke(band + 3, '#9c7a35') +
    stroke(band, '#45454b') +
    stroke(band, '#2c2c31', `class="seam" stroke-dasharray="3 ${gap - 3}"`) +
    stroke(band - 10, '#5d5d64', `class="shine" stroke-dasharray="0 4 ${gap - 10} 6" stroke-opacity=".55"`) +
    `<g class="chev"></g>`;
  const cg = beltSvg.querySelector('.chev');
  const n = Math.round(g.len / (band * 2.6));
  chevrons = Array.from({ length: n }, () => {
    const p = document.createElementNS(SVGNS, 'path');
    const h = band * 0.22;
    p.setAttribute('d', `M ${-h * 0.6} ${-h} L ${h * 0.6} 0 L ${-h * 0.6} ${h}`);
    p.setAttribute('fill', 'none'); p.setAttribute('stroke', '#ffffff'); p.setAttribute('stroke-opacity', '.22');
    p.setAttribute('stroke-width', Math.max(2, band * 0.08)); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
    cg.appendChild(p);
    return p;
  });
}

function makeItem(item, fromRect) {
  const n = el('div', 'item', `<div class="tok">${fruitSVG(item.c)}</div>`);
  itemsEl.appendChild(n);
  itemEls[item.id] = n;
  placeItem(item, uOf(G.pos.indexOf(item)));
  if (fromRect && fromRect.width) {
    const to = n.getBoundingClientRect();
    const dx = fromRect.left + fromRect.width / 2 - (to.left + to.width / 2), dy = fromRect.top + fromRect.height / 2 - (to.top + to.height / 2);
    n.firstChild.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(${fromRect.width / to.width})` },
      { transform: `translate(${dx / 2}px, ${dy / 2 - 26}px) scale(1.2)`, offset: 0.55 },
      { transform: 'none' },
    ], { duration: THROW_MS, easing: 'ease-out' });
  }
}

function placeItem(item, u) {
  const p = beltPoint(u), s = geo.tok;
  itemEls[item.id].style.transform = `translate(${p.x - s / 2}px, ${p.y - s / 2}px)`;
}

function renderBelt() {
  if (!geo) return;
  const off = -G.phase * geo.len;
  beltSvg.querySelector('.seam').setAttribute('stroke-dashoffset', off);
  beltSvg.querySelector('.shine').setAttribute('stroke-dashoffset', off);
  chevrons.forEach((c, j) => {
    const p = loopPoint((j / chevrons.length + G.phase) * geo.len);
    c.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${(Math.atan2(p.dy, p.dx) * 180 / Math.PI).toFixed(1)})`);
  });
  G.pos.forEach((it, k) => { if (it && itemEls[it.id]) placeItem(it, uOf(k)); });
}

function clearItems() { itemsEl.innerHTML = ''; itemEls = {}; }

function flyTake(item, i, index) {
  const n = itemEls[item.id];
  delete itemEls[item.id];
  if (!n) return;
  const r = n.getBoundingClientRect();
  n.remove();
  const icon = seatEls[i].icons.children[index];
  const t = (icon || seatEls[i].card).getBoundingClientRect();
  if (!r.width || !t.width) return;
  const c = el('div', 'fly-fruit', fruitSVG(item.c));
  Object.assign(c.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
  fx.appendChild(c);
  const dx = t.left + t.width / 2 - (r.left + r.width / 2), dy = t.top + t.height / 2 - (r.top + r.height / 2);
  const anim = c.animate([
    { transform: 'none', opacity: 1 },
    { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 20}px) scale(1.15)`, opacity: 1, offset: 0.5 },
    { transform: `translate(${dx}px, ${dy}px) scale(${t.width / r.width})`, opacity: 0.2 },
  ], { duration: TAKE_MS, easing: 'ease-in' });
  anim.onfinish = anim.oncancel = () => c.remove();
}

// ---------- supply lanes (under the belt) ----------
const supply = $('#supply');
let laneEls = [];
const SHOW = [1, 0.74, 0.58];   // front, next, the one after (sizes)

function buildSupply() {
  supply.innerHTML = '';
  laneEls = G.lanes.map((lane, i) => {
    const node = el('button', 'lane');
    node.setAttribute('aria-label', `Sıra ${i + 1}`);
    const toks = SHOW.map((s, j) => { const t = el('div', 'stok' + (j ? ' back' : ' front')); node.appendChild(t); return t; });
    const more = el('div', 'more');
    node.appendChild(more);
    node.addEventListener('pointerdown', e => { e.preventDefault(); tapLane(i); });
    supply.appendChild(node);
    return { node, toks, front: toks[0], more, key: -1, u: 0 };
  });
}

function renderSupply() {
  G.lanes.forEach((lane, i) => {
    const E = laneEls[i];
    if (E.key === lane.ptr) return;
    const moved = E.key >= 0;
    E.key = lane.ptr;
    E.toks.forEach((t, j) => {
      const c = lane.list[lane.ptr + j];
      t.innerHTML = c ? fruitSVG(c) : '';
      t.classList.toggle('none', !c);
    });
    const hidden = Math.max(0, lane.list.length - lane.ptr - SHOW.length);
    E.more.textContent = hidden ? '+' + hidden : '';
    E.more.classList.toggle('none', !hidden);
    E.node.classList.toggle('done', lane.ptr >= lane.list.length);
    if (moved) E.toks.forEach(t => t.animate([{ transform: 'translateY(40%) scale(.85)' }, { transform: 'none' }], { duration: 200, easing: 'ease-out' }));
  });
  const used = onBelt(), cap = G.L.beltSlots;
  let pips = '';
  for (let k = 0; k < cap; k++) pips += `<i class="${k < used ? 'on' : ''}"></i>`;
  $('#cap').innerHTML = `<span>BANT ${used}/${cap}</span><b>${pips}</b>`;
  $('#cap').classList.toggle('full', used >= cap);
}

// ---------- seats ----------
const seatsEl = $('#seats');
let seatEls = [];

function buildSeats() {
  seatsEl.innerHTML = '';
  seatEls = G.seats.map(() => {
    const wrap = el('div', 'seat');
    const card = el('div', 'card',
      `<div class="portrait"><div class="face"></div><div class="price"></div>` +
      `<div class="order" style="aspect-ratio:${A.GLASS.w}/${A.GLASS.h}">${glassMarkup()}</div></div>` +
      `<div class="recipe-status"><span>ŞİMDİ</span><b></b></div><div class="recipe" role="list" aria-label="Meyveleri soldan sağa ekle"></div>`);
    const timer = el('div', 'timer',
      `<span class="clock">${A.url('clock') ? `<img src="${A.url('clock')}" alt="">` : clockSVG()}</span><div class="track"><i></i><b></b></div>`);
    wrap.append(card, timer);
    const pick = el('div', 'pick');
    seatsEl.append(pick, wrap);
    return { wrap, pick, card, face: card.querySelector('.face'), price: card.querySelector('.price'),
      order: card.querySelector('.order'), liquid: card.querySelector('.liquid'), icons: card.querySelector('.recipe'),
      status: card.querySelector('.recipe-status'), fill: timer.querySelector('i'), text: timer.querySelector('b'), timer, key: '' };
  });
}

function renderSeat(seat, i) {
  const E = seatEls[i];
  E.wrap.className = `seat ${SPOTS[seat.place].side} ${seat.state}` + (seat.mood ? ' ' + seat.mood : '');
  E.pick.classList.toggle('none', !seated(seat));
  if (seated(seat)) E.pick.innerHTML = fruitSVG(seat.order.layers[seat.k]);
  if (seat.state === 'empty') return;
  const key = `${seat.order.uid}:${seat.char}:${seat.mood}`;
  if (E.key !== key) {
    const fresh = !E.key.startsWith(seat.order.uid + ':');
    E.key = key;
    const img = A.customer(seat.char, seat.mood);
    E.face.innerHTML = img ? `<img src="${img}" alt="">` : avatarSVG(seat.char, seat.mood);
    E.price.innerHTML = `<span class="coin">${coinIcon()}</span>${seat.order.coins}`;
    E.card.setAttribute('aria-label', `${seat.order.name}: ${seat.order.layers.map(c => color(c).label).join(', ')}`);
    if (fresh) {
      E.liquid.innerHTML = '';
      E.icons.innerHTML = seat.order.layers.map((c, j) =>
        `<span class="ic" role="listitem"><span class="step-number" aria-hidden="true">${j + 1}</span>${fruitSVG(c)}</span>`).join('');
    }
  }
  const n = seat.order.layers.length;
  const complete = seat.k >= n;
  E.status.classList.toggle('complete', complete);
  E.status.firstElementChild.textContent = complete ? 'HAZIR ✓' : 'ŞİMDİ';
  E.status.lastElementChild.textContent = complete ? `${n}/${n}` : `${seat.k + 1}/${n} →`;
  E.card.setAttribute('aria-label', `${seat.order.name}: ${complete ? 'Sipariş hazır' : `${seat.k + 1}. adım, ${color(seat.order.layers[seat.k]).label}`}. ${seat.k}/${n} tamamlandı.`);
  seat.order.layers.forEach((c, j) => {
    const state = j < seat.k ? 'got' : j === seat.k && seated(seat) ? 'next' : 'todo';
    const icon = E.icons.children[j];
    icon.className = 'ic ' + state;
    icon.firstElementChild.textContent = state === 'got' ? '✓' : j + 1;
    icon.setAttribute('aria-label', `${j + 1}. ${color(c).label}: ${state === 'got' ? 'tamamlandı' : state === 'next' ? 'şimdi ekle' : 'bekliyor'}`);
    if (state === 'next') icon.setAttribute('aria-current', 'step');
    else icon.removeAttribute('aria-current');
    let d = E.liquid.children[j];
    if (j >= seat.k) { if (d) d.remove(); return; }
    if (!d) {
      d = el('div', 'layer');
      E.liquid.appendChild(d);
      if (G.fillAt && G.fillAt.seat === i && G.fillAt.index === j) d.classList.add('fill-in');
    }
    const C = color(c);
    d.style.background = `linear-gradient(180deg, ${C.hi} 0%, ${C.hex} 22%, ${C.hex} 70%, ${C.lo} 100%)`;
    d.style.bottom = (j / n * 100) + '%';
    d.style.height = (100 / n) + '%';
  });
}

function renderTimers() {
  G.seats.forEach((s, i) => {
    const E = seatEls[i];
    if (s.state === 'empty') return;
    const frac = s.state === 'arriving' ? 1 : s.left / s.max;
    E.fill.style.width = (frac * 100).toFixed(1) + '%';
    E.timer.dataset.level = frac > 0.5 ? 'ok' : frac > 0.25 ? 'warn' : 'low';
    const sec = Math.ceil(s.state === 'arriving' ? s.max : s.left);
    E.text.textContent = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  });
}

// ---------- HUD / hint ----------
function renderHUD() {
  $('#lvlText').innerHTML = `Bölüm ${G.L.levelOrder + 1}` + (G.L.difficulty ? '<span class="diff">ZOR</span>' : '');
  $('#lvlText').className = 'pill pill-level ' + (G.L.difficulty || '');
  $('#ordersText').textContent = `Sipariş ${G.served}/${G.total}`;
  $('#coinText').textContent = save.coins;
  let h = '';
  for (let i = 0; i < G.L.startingHearts; i++) {
    const on = i < G.hearts, src = A.url(on ? 'heartFull' : 'heartEmpty');
    h += `<span class="heart ${on ? 'on' : 'off'}">` + (src ? `<img src="${src}" alt="">` : heartSVG()) + '</span>';
  }
  $('#hearts').innerHTML = h;
}

let hintUntil = 0;
function renderHint() {
  if (performance.now() < hintUntil) return;
  const H = $('#hint');
  H.className = 'pill';
  H.textContent = 'Meyveyi banda at: müşteri sıradaki meyvesini alır.';
}
function flashHint(text, kind) {
  const H = $('#hint');
  H.textContent = text;
  H.className = 'pill ' + (kind || 'info');
  hintUntil = performance.now() + 1600;
  clearTimeout(flashHint.t);
  flashHint.t = setTimeout(() => { hintUntil = 0; if (G) renderHint(); }, 1650);
}

function renderAll() {
  renderHUD();
  renderSupply();
  G.seats.forEach(renderSeat);
  renderTimers();
  renderHint();
  renderBelt();
  G.fillAt = null;
}

// ---------- fx ----------
const fx = $('#fx');
function restartAnim(node, cls) {
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
  clearTimeout(node['_t' + cls]);
  node['_t' + cls] = setTimeout(() => node.classList.remove(cls), 450);
}
function coinIcon() {
  return A.url('coin') ? `<img src="${A.url('coin')}" alt="">`
    : '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#f6b51e" stroke="#c98a0c" stroke-width="2"/><circle cx="12" cy="12" r="7" fill="none" stroke="#ffe08a" stroke-width="2"/></svg>';
}
function floatCoins(i, n) {
  const r = seatEls[i].card.getBoundingClientRect();
  if (!r.width) return;
  const d = el('div', 'coin-float', `<span class="coin">${coinIcon()}</span>+${n}`);
  Object.assign(d.style, { left: r.left + r.width / 2 - 26 + 'px', top: r.top + r.height * 0.4 + 'px' });
  fx.appendChild(d);
  const anim = d.animate([
    { transform: 'translateY(0) scale(.7)', opacity: 0 },
    { transform: 'translateY(-16px) scale(1.1)', opacity: 1, offset: 0.25 },
    { transform: 'translateY(-50px) scale(1)', opacity: 0 },
  ], { duration: 1100, easing: 'ease-out' });
  anim.onfinish = anim.oncancel = () => d.remove();
}

// ---------- layout ----------
// The loop (big enough for 2x2 cards inside it), the 3 supply lanes under it.
// Seats sit at their SPOTS against the band inside the loop; a seat that would
// overlap another slides along its run.
function layout() {
  const stage = $('#stage');
  const W = stage.clientWidth, H = stage.clientHeight;
  const compact = H < 500;
  stage.classList.toggle('compact', compact);
  const band = Math.round(Math.max(compact ? 28 : 38, Math.min(50, W * 0.135, H * 0.065)));
  const rim = Math.round(band * 0.2);
  const PAD = 13;                                   // room for the pickup mark between card and band
  const f = Math.round(Math.max(38, Math.min(74, W * 0.19, H * (compact ? 0.085 : 0.1))));        // front fruit in a lane
  const supplyH = Math.round(f * (1 + 0.8 * (SHOW[1] + SHOW[2]))) + 8;
  const ring = 2 * (band + rim + PAD);              // loop edge -> inside area, both sides
  const portraitRatio = compact ? 0.42 : 0.6;
  const chOf = w => Math.round(w * portraitRatio) + Math.ceil(w * 0.24) + (compact ? 35 : 47) + (save.patience ? 4 + 16 : 0);   // portrait + numbered recipe + status + card padding/gaps (+ timer)
  // inside the loop: two columns of cards, two rows with a little stagger
  let cw = Math.floor(Math.max(72, Math.min(104, (W - ring - 8) / 2)));
  let ch = chOf(cw), loopH;
  const room = H - supplyH - 22;
  for (;;) {
    loopH = ring + 2 * ch + (compact ? 16 : 30);
    if (loopH <= room || cw <= 72) break;
    cw = Math.max(72, cw - 2); ch = chOf(cw);
  }
  loopH = Math.min(loopH, room);
  let top = 0;
  const spare = Math.max(0, H - top - loopH - supplyH - 22);
  top += spare / 2;
  const m = rim + band / 2;
  const x0 = m, x1 = W - m, y0 = top + m, y1 = top + loopH - m;
  const R = Math.min(W * 0.14, (y1 - y0) / 4);
  const sx = x1 - x0 - 2 * R, sy = y1 - y0 - 2 * R, arc = Math.PI * R / 2;
  geo = { x0, x1, y0, y1, R, sx, sy, arc, len: 2 * sx + 2 * sy + 4 * arc, band, rim, tok: Math.round(band * 1.2) };
  beltSvg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  drawBelt();
  stage.style.setProperty('--cw', cw + 'px');
  stage.style.setProperty('--ph', Math.round(cw * portraitRatio) + 'px');
  stage.style.setProperty('--tok', geo.tok + 'px');
  stage.style.setProperty('--band', band + 'px');

  // seats
  const placed = [];
  const inner = { l: x0 + band / 2 + PAD, r: x1 - band / 2 - PAD, t: y0 + band / 2 + PAD, b: y1 - band / 2 - 3 };
  const rectAt = (spot, t) => {
    const s = runStart(spot.run) + runLength(spot.run) * t, p = loopPoint(s);
    let x, y;
    if (spot.run === 'top' && spot.side === 'out') { x = W / 2 + (0.5 - t) / 0.38 * (cw + 8) - cw / 2; y = y0 - band / 2 - rim - PAD + 4 - ch; }   // a row above the loop
    else if (spot.run === 'top') { x = p.x - cw / 2; y = inner.t; }
    else if (spot.run === 'right') { x = inner.r - cw; y = p.y - ch / 2; }
    else if (spot.run === 'left') { x = inner.l; y = p.y - ch / 2; }
    else { x = p.x - cw / 2; y = inner.b - ch; }
    x = Math.max(0, Math.min(W - cw, x));
    if (spot.side === 'in') { x = Math.max(inner.l, Math.min(inner.r - cw, x)); y = Math.max(inner.t, Math.min(inner.b - ch, y)); }
    return { x, y, w: cw, h: ch };
  };
  const hit = (a, b) => a.x < b.x + b.w + 4 && b.x < a.x + a.w + 4 && a.y < b.y + b.h + 4 && b.y < a.y + a.h + 4;
  G.seats.forEach((seat, i) => {
    const spot = SPOTS[seat.place];
    let r = rectAt(spot, spot.t);
    for (let k = 1; k <= 18 && placed.some(q => hit(q, r)); k++) {
      const t = spot.t + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.06;
      if (t < 0.02 || t > 0.98) continue;
      const r2 = rectAt(spot, t);
      if (!placed.some(q => hit(q, r2))) { r = r2; break; }
    }
    placed.push(r);
    Object.assign(seatEls[i].wrap.style, { left: r.x + 'px', top: r.y + 'px' });
    // pickup point: where the card's centre faces the band
    const cx = r.x + cw / 2, cy = r.y + ch / 2;
    const s0 = runStart(spot.run), L0 = runLength(spot.run);
    const along = spot.run === 'top' ? (x1 - R - cx) : spot.run === 'right' ? (y1 - R - cy) : spot.run === 'left' ? (cy - y0 - R) : (cx - x0 - R);
    const s = s0 + Math.max(-geo.arc * 0.6, Math.min(L0 + geo.arc * 0.6, along));   // may reach into a corner
    seat.u = s / geo.len;
    const p = loopPoint(s), nx = -p.dy, ny = p.dx;     // left of travel = outside of the loop
    const off = (band / 2 + 4) * (spot.side === 'out' ? 1 : -1);
    Object.assign(seatEls[i].pick.style, { left: p.x + nx * off + 'px', top: p.y + ny * off + 'px' });
  });

  // capacity, on the loop's bottom rim
  Object.assign($('#cap').style, { left: W / 2 + 'px', top: y1 + band / 2 + rim - 11 + 'px' });

  // supply lanes under the loop; each throws onto the band right above it
  const ly = top + loopH + 18;
  const gapX = Math.min(W * 0.3, f * 2);
  laneEls.forEach((E, i) => {
    const x = W / 2 + (i - 1) * gapX;
    Object.assign(E.node.style, { left: x - f * 0.65 + 'px', top: ly + 'px', width: f * 1.3 + 'px', height: supplyH + 'px' });
    E.u = Math.max(0, Math.min(sx, x - x0 - R)) / geo.len;
  });
  supply.style.setProperty('--f', f + 'px');
  if (G) renderBelt();
}
window.addEventListener('resize', () => { if (G) layout(); });
if (document.fonts) document.fonts.ready.then(() => { if (G) layout(); });

// ---------- panels ----------
const overlay = $('#overlay'), panel = $('#panel');
function showPanel(html, buttons, cls) {
  panel.className = 'panel ' + (cls || '');
  panel.innerHTML = html;
  const row = el('div', 'btns');
  for (const [label, fn, kind] of buttons || []) {
    const b = el('button', 'btn ' + (kind || ''), label);
    b.addEventListener('click', fn);
    row.appendChild(b);
  }
  panel.appendChild(row);
  overlay.classList.remove('hidden');
}
function hidePanel() { overlay.classList.add('hidden'); }

function levelFacts(L) {
  const colors = new Set(L.orders.flatMap(o => o.layers));
  const items = L.lanes.reduce((n, l) => n + l.length, 0);
  return `<div class="facts"><span><b>${items}</b> meyve</span><span><b>${L.beltSlots}</b> bant yeri</span>` +
    `<span><b>${colors.size}</b> renk</span><span><b>${L.orders.length}</b> sipariş</span><span><b>${L.seats}</b> koltuk</span></div>`;
}

function showHowto() {
  G.paused = true;
  showPanel(`<div class="eyebrow">NASIL OYNANIR</div><h2>Kokteyl Bandı</h2>` +
    `<ol class="how"><li>Alttaki sıralardan birine dokun: öndeki meyve doğrudan banda atlar.</li>` +
    `<li>Bant döner. Siparişinde <b>sıradaki meyve</b> o olan ilk müşteri onu alır; sırayı atlayamaz.</li>` +
    `<li>Karttaki meyveleri <b>1 → 2 → 3</b> sırasıyla ekle. <b>Sarı çerçeve</b> şimdi gerekeni, <b>yeşil tik</b> tamamlananı gösterir.</li>` +
    `<li>Kimse istemezse meyve dönmeye devam eder. Bantta yer sınırlı (BANT göstergesi).</li>` +
    `<li>Bant dolar ve kimse bir şey alamazsa bölüm biter.</li></ol>`,
  [['Başla', () => { save.howto = true; writeSave(); G.paused = false; hidePanel(); }, 'go']]);
}

function showPause() {
  showPanel(`<div class="eyebrow">DURAKLATILDI</div><h2>Bölüm ${G.L.levelOrder + 1}</h2>` + levelFacts(G.L) +
    `<button class="switch${save.patience ? ' on' : ''}" id="patienceSwitch" role="switch" aria-checked="${save.patience}">` +
    `<span>Müşteri sabrı<small>Süre biterse −1 kalp</small></span><i></i></button>`, [
    ['Devam et', () => pause(false), 'go'],
    ['Nasıl oynanır', () => { showHowto(); }],
    ['Yeniden başlat', () => { hidePanel(); startLevel(G.L.levelOrder); }],
    ['Bölümler', showLevels],
  ]);
  $('#patienceSwitch').addEventListener('click', () => {
    save.patience = !save.patience; writeSave();
    applyPatience();
    showPause();
  });
}

// Patience off: no timers, no hearts to lose (a jammed belt is the only way to
// lose). Switching it on starts every customer's patience from full.
function applyPatience() {
  document.body.classList.toggle('no-patience', !save.patience);
  if (!G) return;
  for (const s of G.seats) if (s.order) { s.left = s.max; s.mood = null; s.angry = 0; }
  layout();
  renderAll();
}

function showEnd(status) {
  const L = G.L;
  if (status === 'won') {
    const nx = nextOrder(L.levelOrder);
    const art = A.url('winArt') ? `<img class="art" src="${A.url('winArt')}" alt="">` : '<div class="art emoji">🍹</div>';
    const claim = mult => {
      panel.querySelectorAll('.btn').forEach(b => { b.disabled = true; });
      save.coins += G.coins * mult; writeSave();
      $('#coinText').textContent = save.coins;
      restartAnim($('#coins'), 'bump');
      const tok = runToken;
      setTimeout(() => { if (tok === runToken) nx === null ? showLevels() : startLevel(nx); }, 650);
    };
    showPanel(`${art}<div class="eyebrow">BÖLÜM ${L.levelOrder + 1} TAMAMLANDI</div><h2>Next Level</h2>` +
      `<div class="reward"><span class="coin">${coinIcon()}</span>+${G.coins}</div>`,
      [['Claim x2<span class="x2">+' + G.coins * 2 + '</span>', () => claim(2), 'go'], ['Claim', () => claim(1)]], 'win');
  } else {
    const art = A.url('loseArt') ? `<img class="art" src="${A.url('loseArt')}" alt="">` : '<div class="art emoji">💔</div>';
    const msg = status === 'stuck' ? 'Bant tıkandı: üstündekileri kimse istemiyor.' : 'Müşteriler çok bekledi, kalpler bitti.';
    showPanel(`${art}<div class="eyebrow">BÖLÜM ${L.levelOrder + 1}</div><h2>Bar kapandı</h2><p>${msg}</p>`,
      [['Yeniden dene', () => startLevel(L.levelOrder), 'go'], ['Bölümler', showLevels]], 'lose');
  }
}

function showLevels() {
  const cells = LEVELS.map(l => {
    const cls = [G && l.levelOrder === G.L.levelOrder ? 'cur' : '', l.difficulty || ''].join(' ');
    return `<button data-o="${l.levelOrder}" class="${cls}">${l.levelOrder + 1}<small>${l.orders.length}🍹</small></button>`;
  }).join('');
  showPanel(`<h2>Bölümler</h2><div class="lvl-grid">${cells}</div>`, G && G.status === 'play' ? [['Geri', showPause]] : []);
  panel.querySelectorAll('.lvl-grid button').forEach(b =>
    b.addEventListener('click', () => { hidePanel(); startLevel(+b.dataset.o); }));
}

$('#btnPause').addEventListener('click', () => pause(true));

// ---------- drawings used when a PNG is missing ----------
function heartSVG() {
  return '<svg viewBox="0 0 24 22"><path d="M12 21C5 15.5 1 12 1 7a5.5 5.5 0 0 1 11-1 5.5 5.5 0 0 1 11 1c0 5-4 8.5-11 14Z"/></svg>';
}
function clockSVG() {
  return '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#fff6e6" stroke="#8a5a2b" stroke-width="2.4"/><path d="M12 6.5V12l3.5 2.2" fill="none" stroke="#8a5a2b" stroke-width="2.4" stroke-linecap="round"/></svg>';
}
function avatarSVG(i, mood) {
  const skins = ['#f6c9a8', '#7b4a2e', '#f3d2b5', '#e2a77f', '#fbe0c8', '#a8714f'];
  const mouth = mood === 'happy' ? '<path d="M45 64q11 12 22 0Z" fill="#b8423d"/>'
    : mood === 'sad' ? '<path d="M47 70q9-8 18 0" stroke="#3a2418" stroke-width="3" fill="none"/>'
    : '<path d="M47 65q9 7 18 0" stroke="#3a2418" stroke-width="3" fill="none"/>';
  return `<svg viewBox="0 0 112 112"><path d="M14 112q4-30 42-32t42 32Z" fill="#fff4e4"/>` +
    `<ellipse cx="56" cy="54" rx="25" ry="27" fill="${skins[(i - 1) % skins.length]}"/>` +
    `<circle cx="45" cy="52" r="3.6" fill="#3a2418"/><circle cx="67" cy="52" r="3.6" fill="#3a2418"/>${mouth}</svg>`;
}

// ---------- boot ----------
function boot() {
  document.body.classList.toggle('no-patience', !save.patience);
  $('#coins .coin').innerHTML = coinIcon();
  $('#btnPause').innerHTML = A.url('pause') ? `<img src="${A.url('pause')}" alt="">`
    : '<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1.5"/><rect x="14" y="5" width="4" height="14" rx="1.5"/></svg>';
  if (!LEVELS.length) return showPanel('<h2>levels.js boş</h2><p>node tools/gen.js çalıştır.</p>', []);
  if (qs.has('nohowto')) save.howto = true;
  const q = qs.get('level');
  const start = q !== null && rawLevel(+q - 1) ? +q - 1 : rawLevel(save.current) ? save.current : LEVELS[0].levelOrder;
  startLevel(start);
  requestAnimationFrame(t => { last = t; tick(t); });
}

// Test hook (tools/playtest.js)
window.BeltGame = {
  state: () => G && JSON.parse(JSON.stringify({
    levelOrder: G.L.levelOrder, status: G.status, hearts: G.hearts, served: G.served, total: G.total,
    onBelt: onBelt(), cap: G.L.beltSlots, phase: G.phase,
    lanes: G.lanes.map(l => l.list.slice(l.ptr)),
    belt: G.pos.map((it, k) => it && { c: it.c, u: uOf(k) }),
    seats: G.seats.map(s => ({ place: s.place, state: s.state, u: s.u, need: s.order && seated(s) ? s.order.layers[s.k] : null, k: s.k, left: s.left, layers: s.order ? s.order.layers : [] })),
  })),
  start: o => { hidePanel(); startLevel(o); G.paused = false; hidePanel(); },
  play: () => { hidePanel(); G.paused = false; },
  freeze: () => { G.manual = true; },   // stop the clock; drive it with step()
  patience: on => { save.patience = !!on; applyPatience(); },
  tap: i => tapLane(i),
  step: dt => step(dt),
};

A.load(1500).then(boot);
})();
