// Cocktail Sort — pour one layer at a time. Normal bottles only stack a colour
// on the same colour; the mixer (top middle) takes anything. Build each
// customer's recipe bottom -> top in the mixer before their patience runs out.
(() => {
'use strict';
const P = window.CocktailProgression;
const Core = window.CocktailCore;
const A = window.CocktailAssets;
const LEVELS = (window.COCKTAIL_LEVELS || []).slice().sort((a, b) => a.levelOrder - b.levelOrder);

const ARRIVE_S = 0.5;   // card slide-in; patience starts after it (tools/solver.js T.arrive)
const LEAVE_S = 0.8;    // card leave before the next customer comes (T.leave)
const SERVE_S = 0.45;   // matched bottle glows, then flies to the customer
const IMPRESSIONS = ['Nice', 'Wow', 'Amazing', 'Bingo', 'Great', 'Bravo', 'Yay'];   // as in cocktail_flow
const IMPRESSION_COLORS = ['#27866e', '#d57520', '#9750c5', '#c84767', '#287eb8', '#c85d34', '#438739'];
const IMPRESSION_S = 1.05;
const REFILL_S = 0.6;   // an emptied normal bottle waits, then the next refill pours in
const SAVE_KEY = 'cocktail_sort_v1';
const qs = new URLSearchParams(location.search);
const WIRE = qs.has('wire');

const $ = s => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

// ---------- save ----------
function loadSave() {
  try { return Object.assign({ unlocked: 0, current: 0, coins: 0 }, JSON.parse(localStorage.getItem(SAVE_KEY)) || {}); }
  catch (e) { return { unlocked: 0, current: 0, coins: 0 }; }
}
function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* private mode */ } }
const save = loadSave();

// ---------- state ----------
let G = null;          // current run, rebuilt by startLevel()
let runToken = 0;      // bumps on every (re)start so stale timeouts do nothing

function rawLevel(order) { return LEVELS.find(l => l.levelOrder === order) || null; }
function nextOrder(order) { const n = LEVELS.find(l => l.levelOrder > order); return n ? n.levelOrder : null; }

function startLevel(order) {
  const raw = rawLevel(order) || LEVELS[0];
  const L = Core.resolveLevel(raw);
  const errs = Core.validateLevel(L);
  runToken++;
  G = {
    L,
    bottles: L.initialBottles.map((layers, i) => ({ id: 'b' + i, layers: layers.slice(), phase: null, mixer: i === L.mixer })),
    refillAt: 0,             // next batch in L.refills
    queue: L.orders.map((o, i) => ({ uid: i, name: o.name, layers: o.layers, patience: o.patience, coins: o.coins })),
    slots: Array.from({ length: Math.min(L.maxActiveCustomers, L.orders.length) }, () => ({ state: 'empty' })),
    total: L.orders.length,
    served: 0,
    hearts: L.startingHearts,
    coins: 0,                // earned this level, credited on Claim / Claim x2
    selected: null,
    status: 'play',          // play | won | lost | stuck
    paused: false,
    lastChar: 0,
    combo: 0,                // serves in a row without a customer leaving
    feedbackLeft: 0,         // seconds the current impression stays up
  };
  save.current = L.levelOrder; writeSave();
  document.body.dataset.theme = L.theme;
  const bg = A.themed('bg', L.theme);
  $('#bg').style.backgroundImage = bg ? `url("${bg}")` : '';
  fillEmpties(true);
  buildBoard();
  buildCards();
  G.slots.forEach(fillSlot);
  G.cardPos = G.slots.map((_, i) => i);   // screen position of each slot's card
  arrangeCards(false);
  hidePanel();
  clearServeFeedback();
  renderAll();
  layout();
  if (L.difficulty) flashHint(L.difficulty === 'veryHard' ? 'Çok zor bölüm! Müşteriler çok sabırsız.' : 'Zor bölüm! Müşteriler daha sabırsız.', 'bad');
  if (errs.length) {
    G.status = 'error';
    console.error(`Level ${L.levelOrder}:`, errs);
    showPanel(`<h2>Bölüm verisi hatalı</h2><p class="err">${errs.join('<br>')}</p>`, [['Bölümler', showLevels]]);
  }
}

// ---------- customers ----------
function fillSlot(slot) {
  if (!G.queue.length) { slot.state = 'empty'; slot.order = null; return; }
  slot.order = G.queue.shift();
  slot.state = 'arriving';
  slot.t = ARRIVE_S;
  slot.left = slot.max = slot.order.patience;
  slot.mood = null;
  slot.char = pickChar();
}

// A random customer look that is not on screen right now and was not the last
// one to leave. Only looks with art are used once any customer art exists.
function pickChar() {
  const used = new Set(G.slots.filter(s => s.state !== 'empty').map(s => s.char));
  const pool = A.customerPool().filter(c => !used.has(c) && c !== G.lastChar);
  const c = pool.length ? pool[Math.floor(Math.random() * pool.length)] : A.customerPool()[0];
  G.lastChar = c;
  return c;
}

function onScreen(slot) { return slot.state === 'arriving' || slot.state === 'active'; }

function timeout(slot) {
  if (slot.state !== 'active' || G.status !== 'play') return;
  G.hearts--;
  G.combo = 0;
  clearServeFeedback();
  slot.state = 'leaving'; slot.mood = 'sad'; slot.t = LEAVE_S;
  G.queue.push(slot.order);          // missed: back of the queue, fresh patience next time
  flashHint('Müşteri beklemekten sıkıldı! −1 kalp', 'bad');
  if (G.hearts <= 0) end('lost');
}

// ---------- moves ----------
function bottle(id) { return G.bottles.find(b => b.id === id); }
function busy(b) { return !!b.phase || !!b.gone; }   // being served / refilled / gone: can't be touched
function mixer() { return G.bottles[G.L.mixer]; }

function tapBottle(id) {
  if (G.status !== 'play' || G.paused) return;
  const b = bottle(id);
  if (G.selected !== null && busy(bottle(G.selected))) G.selected = null;
  if (b.gone) return;
  // a failed pour (red shake) also lets go of the bottle in hand
  if (busy(b)) { G.selected = null; return bad(id, b.phase === 'serving' ? 'Bu içecek servis ediliyor.' : 'Şişe yeniden doluyor.'); }
  if (G.selected === null) {
    if (!b.layers.length) return bad(id, 'Bu şişe boş.');
    G.selected = id;
  } else if (G.selected === id) {
    G.selected = null;
  } else {
    const src = bottle(G.selected);
    if (!Core.canPour(src.layers, b.layers, G.L.bottleCapacity, b.mixer)) {
      G.selected = null;
      return bad(id, b.layers.length >= G.L.bottleCapacity ? (b.mixer ? 'Kap dolu.' : 'Bu şişe dolu.')
        : 'Şişelerde yalnızca aynı rengin üstüne dökülür. Karıştırmak için kabı kullan.');
    }
    pour(src, b);
    G.selected = null;
  }
  renderAll();
}

function pour(src, dst) {
  if (!Core.canPour(src.layers, dst.layers, G.L.bottleCapacity, dst.mixer)) return;
  const before = snapshot();
  const color = src.layers[src.layers.length - 1];
  const from = layerRect(src.id, src.layers.length - 1);
  src.layers.pop();
  dst.layers.push(color);
  const to = layerRect(dst.id, dst.layers.length - 1);
  flyLayer(color, from, to);
  G.pourInto = { id: dst.id, index: dst.layers.length - 1 };
  // a normal bottle poured empty: with no refills left it disappears, unless
  // that leaves fewer normal bottles than colours still on the board;
  // otherwise fillEmpties gives it the next refill batch
  if (!src.mixer && !src.layers.length) {
    if (G.refillAt >= G.L.refills.length && mayVanish(src)) src.gone = true;
    if (G.selected === src.id) G.selected = null;
  }
  fillEmpties(false);
  autoServe();
  if (G.status === 'play' && !G.noDeadCheck && deadEnd()) return stuckPenalty(before);
  checkStuck();
}

// ---------- dead ends ----------
// After every pour: if no sequence of pours can finish the level any more
// (tools/solver.js canFinish, patience ignored), the player loses a heart and
// the pour is taken back.
function deadEnd() {
  const onScreenOrders = G.slots.filter(onScreen).map(s => s.order.layers);
  return !window.CocktailSolver.canFinish({
    cap: G.L.bottleCapacity, K: G.L.maxActiveCustomers, mixer: G.L.mixer,
    bottles: G.bottles.map(b => b.gone ? null : b.phase === 'refilling' ? b.next : b.phase === 'serving' ? [] : b.layers),
    orders: onScreenOrders.concat(G.queue.map(o => o.layers)),
    refills: G.L.refills.slice(G.refillAt),
  });
}

function snapshot() {
  return {
    bottles: G.bottles.map(b => ({ layers: b.layers.slice(), gone: !!b.gone, phase: b.phase, t: b.t,
      next: b.next ? b.next.slice() : null, slot: b.slot })),
    slots: G.slots.map(s => Object.assign({}, s)),
    queue: G.queue.slice(),
    refillAt: G.refillAt, served: G.served, coins: G.coins, combo: G.combo, status: G.status,
  };
}

function stuckPenalty(snap) {
  G.bottles.forEach((b, i) => Object.assign(b, snap.bottles[i]));
  G.slots.forEach((s, i) => { for (const k of Object.keys(s)) delete s[k]; Object.assign(s, snap.slots[i]); });
  G.queue = snap.queue;
  Object.assign(G, { refillAt: snap.refillAt, served: snap.served, coins: snap.coins, status: snap.status });
  G.selected = null;
  G.pourInto = null;
  G.hearts--;
  G.combo = 0;
  clearServeFeedback();
  restartAnim($('#boardPanel'), 'bad');
  flashHint('Takıldın! −1 kalp, son hamle geri alındı.', 'bad');
  if (G.hearts <= 0) { G.lossMsg = 'Takıldın ve kalbin kalmadı.'; end('lost'); }
  renderAll();
}

// The mixer is served by itself when it equals an on-screen order: after a
// pour or when a customer arrives. Same recipe twice -> the most impatient one.
// Normal bottles are never served.
function autoServe() {
  const b = mixer();
  if (busy(b) || !b.layers.length || G.status !== 'play') return;
  let best = -1;
  G.slots.forEach((s, i) => {
    if (!onScreen(s) || !Core.sameLayers(b.layers, s.order.layers)) return;
    if (best < 0 || timeLeft(s) < timeLeft(G.slots[best])) best = i;
  });
  if (best >= 0) serve(b, best);
}
function timeLeft(s) { return s.state === 'arriving' ? s.max : s.left; }

function serve(b, i) {
  // The order is done the moment it matches; the card can't time out after this.
  const slot = G.slots[i];
  G.coins += slot.order.coins;
  floatCoins(i, slot.order.coins);
  slot.state = 'leaving'; slot.mood = 'happy'; slot.t = LEAVE_S;
  G.served++;
  G.combo++;
  const impression = (G.served - 1) % IMPRESSIONS.length;
  showImpression({ word: IMPRESSIONS[impression], color: IMPRESSION_COLORS[impression], combo: G.combo });
  b.phase = 'serving'; b.t = SERVE_S; b.slot = i;
  if (G.selected === b.id) G.selected = null;
  flashHint('Afiyet olsun!', 'info');
  if (G.served >= G.total) end('won');
}

// mixer: serving (glow) -> flies to the customer, empty again
// normal bottle: refilling (stream) -> the next refill batch
function stepBottles(dt) {
  let changed = false;
  for (const b of G.bottles) {
    if (!b.phase || (b.t -= dt) > 0) continue;   // (gone bottles have no phase)
    changed = true;
    if (b.phase === 'serving') {
      flyServe(b.id, b.slot);
      b.layers = [];
    } else {
      b.layers = b.next; b.next = null;
      b.refilled = true;
    }
    b.phase = null;
  }
  return changed;
}

// While refills are left, no normal bottle stays empty: each empty one takes
// the next batch, in board order (tools/solver.js fillEmpties). At level start
// this is instant, later it animates (refilling phase).
function fillEmpties(instant) {
  for (const b of G.bottles) {
    if (G.refillAt >= G.L.refills.length) return;
    if (b.mixer || b.gone || b.phase || b.layers.length) continue;
    const next = G.L.refills[G.refillAt++].slice();
    if (instant) b.layers = next;
    else { b.next = next; b.phase = 'refilling'; b.t = REFILL_S; }
  }
}

// Keep one normal bottle per colour still in play (tools/solver.js mayVanish),
// so a wrongly built mixer can always be poured apart again.
function mayVanish(src) {
  const colours = new Set();
  let left = 0;
  for (const b of G.bottles) {
    if (b.gone) continue;
    b.layers.forEach(c => colours.add(c));
    if (!b.mixer && b !== src) left++;
  }
  return left >= colours.size;
}

// No pour possible and nothing being served / refilled -> the level is lost.
// (Gone bottles don't count as busy: they never come back.)
function checkStuck() {
  const cap = G.L.bottleCapacity;
  const free = G.bottles.filter(b => !busy(b));
  const canMove = free.some(a => free.some(b => Core.canPour(a.layers, b.layers, cap, b.mixer)));
  if (!canMove && !G.bottles.some(b => b.phase) && G.slots.some(onScreen)) end('stuck');
}

function end(status) {
  G.status = status;
  G.selected = null;
  const tok = runToken;
  if (status === 'won') {
    const nx = nextOrder(G.L.levelOrder);
    if (nx !== null) save.unlocked = Math.max(save.unlocked, nx);
    writeSave();
    G.winDelay = 1.4;          // the panel waits for the last glass and its impression (step)
    G.endShown = false;
    return;
  }
  setTimeout(() => { if (tok === runToken) showEnd(status); }, 700);
}

// ---------- loop ----------
let last = 0;
function tick(now) {
  const dt = Math.min(0.1, (now - last) / 1000 || 0);
  last = now;
  if (G && !G.paused && (G.status === 'play' || G.status === 'won')) step(dt);
  requestAnimationFrame(tick);
}

function step(dt) {
  if (G.feedbackLeft > 0) {
    G.feedbackLeft = Math.max(0, G.feedbackLeft - dt);
    if (!G.feedbackLeft) clearServeFeedback();
  }
  let changed = stepBottles(dt);
  if (G.status === 'play') {
    for (const s of G.slots) {
      if (s.state === 'arriving') {
        if ((s.t -= dt) <= 0) { s.state = 'active'; changed = true; }
      } else if (s.state === 'active') {
        s.left = Math.max(0, s.left - dt);
        if (s.left <= 0) { timeout(s); changed = true; }
      } else if (s.state === 'leaving') {
        if ((s.t -= dt) <= 0) { fillSlot(s); changed = true; }
      }
      if (G.status !== 'play') break;
    }
    if (changed) { autoServe(); checkStuck(); }
  }
  if (changed) renderAll(); else renderTimers();
  if (G.status === 'won' && !G.endShown) {
    G.winDelay = Math.max(0, G.winDelay - dt);
    if (!G.winDelay && !G.feedbackLeft && !G.bottles.some(b => b.phase === 'serving')) {
      G.endShown = true;
      showEnd('won');
    }
  }
}

function pause(on) {
  if (!G || G.status !== 'play') return;
  G.paused = on;
  pauseServeFeedback(on);
  if (on) showPause(); else hidePanel();
}

document.addEventListener('visibilitychange', () => { if (document.hidden) pause(true); });
window.addEventListener('pagehide', () => pause(true));

// ---------- board ----------
const board = $('#board');
let bottleEls = {};

function bottleSVG() {
  const B = A.BOTTLE, q = B.liquid;
  const glass = 'M132 54 L132 140 C132 196 40 196 40 262 L40 796 Q40 850 94 850 L306 850 Q360 850 360 796 L360 262 C360 196 268 196 268 140 L268 54 Z';
  const back = `<svg class="glass back" viewBox="0 0 ${B.w} ${B.h}"><path d="${glass}" fill="rgba(255,255,255,.38)"/>` +
    `<rect x="118" y="10" width="164" height="48" rx="16" fill="rgba(255,255,255,.55)"/></svg>`;
  const front = `<svg class="glass front" viewBox="0 0 ${B.w} ${B.h}">` +
    `<path d="${glass}" fill="none" stroke="rgba(120,110,120,.55)" stroke-width="9"/>` +
    `<path d="${glass}" fill="none" stroke="rgba(255,255,255,.85)" stroke-width="3"/>` +
    `<rect x="118" y="10" width="164" height="48" rx="16" fill="none" stroke="rgba(120,110,120,.55)" stroke-width="8"/>` +
    `<path d="M78 300 L78 760" stroke="rgba(255,255,255,.55)" stroke-width="16" stroke-linecap="round"/>` +
    `<path d="M112 300 L112 420" stroke="rgba(255,255,255,.35)" stroke-width="8" stroke-linecap="round"/>` +
    `<path d="M ${q.x} ${q.y + q.h / 4} h ${q.w} M ${q.x} ${q.y + q.h / 2} h ${q.w} M ${q.x} ${q.y + 3 * q.h / 4} h ${q.w}" ` +
    `stroke="rgba(150,140,150,.18)" stroke-width="3"/></svg>`;
  return { back, front };
}

// Use the same glass art and liquid bounds for the board and customer orders.
function bottleMarkup(liquidClass = '', backUrl = A.themed('bottle', G && G.L.theme)) {
  const B = A.BOTTLE, q = B.liquidByAsset[backUrl && backUrl.split('/').pop()] || B.liquid;
  const svg = bottleSVG();
  const back = backUrl ? `<img class="glass back" src="${backUrl}" alt="">` : svg.back;
  const reflection = backUrl && backUrl.endsWith('mixer_cocktail_gold.png') ? 'M80 240 L80 690' : 'M78 300 L78 760';
  // The default outline only fits the default bottle. Other vessels keep their own rim and shape.
  const front = backUrl === A.url('bottle') && A.url('bottleOverlay') ? `<img class="glass front" src="${A.url('bottleOverlay')}" alt="">`
    : backUrl ? `<svg class="glass front" viewBox="0 0 ${B.w} ${B.h}"><path d="${reflection}" stroke="rgba(255,255,255,.45)" stroke-width="16" stroke-linecap="round"/></svg>`
    : svg.front;
  return back +
    `<div class="liquid ${liquidClass}" style="left:${q.x / B.w * 100}%;top:${q.y / B.h * 100}%;width:${q.w / B.w * 100}%;height:${q.h / B.h * 100}%;` +
    `border-radius:0 0 ${q.r / q.w * 100}% ${q.r / q.w * 100}% / 0 0 ${q.r / q.h * 100}% ${q.r / q.h * 100}%"></div>` + front;
}

const rowBreak = el('div', 'row-break');   // ends the mixer's row (layout)

function buildBoard() {
  board.innerHTML = '';
  board.appendChild(rowBreak);
  bottleEls = {};
  // normal bottles use the milk-bottle art in every theme (user's choice), else the theme's bottle
  const glass = bottleMarkup('', A.url('bottle_coffee') || A.themed('bottle', G.L.theme));
  const mixUrl = A.themed('mixer', G.L.theme);
  const mixGlass = mixUrl ? bottleMarkup('', mixUrl) : glass;
  const check = A.url('check') ? `<img src="${A.url('check')}" alt="">` : '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#3cc152" stroke="#fff" stroke-width="2"/><path d="M6.5 12.5l3.6 3.6 7.4-7.6" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  for (const b of G.bottles) {
    const slot = el('div', 'slot' + (b.mixer ? ' mixer' : ''));
    slot.dataset.id = b.id;
    const node = el('div', 'bottle asset');
    node.dataset.label = b.mixer ? 'mixer' : 'bottle';
    node.innerHTML = (b.mixer ? mixGlass : glass) + `<div class="badge">${check}</div>`;
    if (b.mixer) slot.appendChild(el('div', 'mixer-tag', P.THEMES[G.L.theme].mixerTag));
    slot.appendChild(node);
    slot.addEventListener('pointerdown', e => { e.preventDefault(); tapBottle(b.id); });
    board.appendChild(slot);
    bottleEls[b.id] = { slot, node, liquid: node.querySelector('.liquid') };
  }
}

function renderBottle(b) {
  const E = bottleEls[b.id], liq = E.liquid, cap = G.L.bottleCapacity;
  while (liq.children.length > b.layers.length) liq.lastElementChild.remove();
  b.layers.forEach((c, i) => {
    let n = liq.children[i];
    if (!n) {
      n = el('div', 'layer');
      liq.appendChild(n);
      if (b.refilled) { n.classList.add('fill-in'); n.style.animationDelay = (i * 0.09) + 's'; }
      else if (G.pourInto && G.pourInto.id === b.id && G.pourInto.index === i) n.classList.add('fill-in');
    }
    if (n.dataset.c !== c) {
      const C = P.COLORS[c] || { hex: '#999', hi: '#bbb', lo: '#777' };
      n.dataset.c = c;
      n.style.background = `linear-gradient(180deg, ${C.hi} 0%, ${C.hex} 22%, ${C.hex} 70%, ${C.lo} 100%)`;
    }
    n.style.bottom = (i / cap * 100) + '%';
    n.style.height = (100 / cap) + '%';
  });
  b.refilled = false;
  E.slot.classList.toggle('sel', G.selected === b.id);
  E.slot.classList.toggle('ready', b.phase === 'serving');
  E.slot.classList.toggle('refilling', b.phase === 'refilling');
  E.slot.classList.toggle('gone', !!b.gone);
  if (b.phase === 'refilling') E.node.style.setProperty('--stream', (P.COLORS[b.next[0]] || {}).hex);
}

// ---------- cards ----------
const cardsEl = $('#customers');
let cardEls = [];

function buildCards() {
  cardsEl.innerHTML = '';
  const orderGlass = bottleMarkup('order-layers', A.themed('mixer', G.L.theme) || A.themed('bottle', G.L.theme));
  cardEls = G.slots.map((_, i) => {
    const wrap = el('div', 'cust');
    const card = el('div', 'card');
    card.innerHTML =
      `<div class="portrait asset" data-label="customer_0X"><div class="face"></div><div class="price"></div>` +
      `<div class="mini" role="img" style="aspect-ratio:${A.BOTTLE.w}/${A.BOTTLE.h}">` +
      `<div class="order-glass" aria-hidden="true">${orderGlass}</div></div></div>` +
      `<div class="rname" lang="en"></div>`;
    const timer = el('div', 'timer',
      `<span class="clock asset" data-label="clock">${A.url('clock') ? `<img src="${A.url('clock')}" alt="">` : clockSVG()}</span>` +
      `<div class="track"><i></i><b></b></div>`);
    wrap.append(card, timer);
    cardsEl.appendChild(wrap);
    return { wrap, card, timer, face: card.querySelector('.face'), mini: card.querySelector('.mini'),
      name: card.querySelector('.rname'), price: card.querySelector('.price'), layers: card.querySelector('.order-layers'),
      fill: timer.querySelector('i'), text: timer.querySelector('b'), key: '' };
  });
}

function renderCard(slot, i) {
  const E = cardEls[i];
  const key = slot.state === 'empty' ? 'empty' : `${slot.order.uid}:${slot.char}:${slot.mood}`;
  E.wrap.className = 'cust ' + slot.state + (slot.mood ? ' ' + slot.mood : '');
  if (E.key !== key) {
    E.key = key;
    if (slot.state !== 'empty') {
      const img = A.customer(slot.char, slot.mood);
      E.face.innerHTML = img ? `<img src="${img}" alt="">` : avatarSVG(slot.char, slot.mood);
      E.name.textContent = slot.order.name;
      E.price.innerHTML = `<span class="coin">${coinIcon()}</span>${slot.order.coins}`;
      E.mini.setAttribute('aria-label', `${slot.order.name}, alttan üste: ${slot.order.layers.map(c => (P.COLORS[c] || {}).label || c).join(', ')}`);
      E.layers.innerHTML = slot.order.layers.map((c, index) => {
        const C = P.COLORS[c] || { hex: '#999', hi: '#bbb', lo: '#777' };
        return `<i class="layer" data-c="${c}" style="bottom:${index / G.L.bottleCapacity * 100}%;height:${100 / G.L.bottleCapacity}%;` +
          `background:linear-gradient(180deg, ${C.hi} 0%, ${C.hex} 22%, ${C.hex} 70%, ${C.lo} 100%)"></i>`;
      }).join('');
    }
  }
}

// The most impatient customer sits on the left. Cards are re-sorted only when a
// new customer arrives (all timers run at the same speed, so the order can't
// change otherwise); leaving and empty cards keep their place until replaced.
function arrangeCards(animate) {
  const fixed = new Set(), movable = [];
  G.slots.forEach((s, i) => (onScreen(s) ? movable.push(i) : fixed.add(G.cardPos[i])));
  const free = G.slots.map((_, p) => p).filter(p => !fixed.has(p));
  movable.sort((a, b) => timeLeft(G.slots[a]) - timeLeft(G.slots[b]));
  const old = cardEls.map(E => E.wrap.getBoundingClientRect().left);
  movable.forEach((i, k) => { G.cardPos[i] = free[k]; });
  cardEls.forEach((E, i) => { E.wrap.style.order = G.cardPos[i]; });
  if (!animate) return;
  cardEls.forEach((E, i) => {
    const dx = old[i] - E.wrap.getBoundingClientRect().left;
    if (dx && G.slots[i].state === 'active') E.wrap.animate([{ translate: `${dx}px 0` }, { translate: '0 0' }], { duration: 320, easing: 'ease-out' });
  });
}

function renderTimers() {
  G.slots.forEach((s, i) => {
    const E = cardEls[i];
    if (s.state === 'empty' || !s.order) return;
    const frac = s.state === 'arriving' ? 1 : s.left / s.max;
    E.fill.style.width = (frac * 100).toFixed(1) + '%';
    E.timer.dataset.level = frac > 0.5 ? 'ok' : frac > 0.25 ? 'warn' : 'low';
    const sec = Math.ceil(s.state === 'arriving' ? s.max : s.left);
    E.text.textContent = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  });
}

// ---------- HUD / hint ----------
const DIFF_TAG = { hard: 'ZOR', veryHard: 'ÇOK ZOR' };
function renderHUD() {
  const tag = DIFF_TAG[G.L.difficulty];
  $('#lvlText').innerHTML = `Bölüm ${G.L.levelOrder + 1}` + (tag ? `<span class="diff">${tag}</span>` : '');
  $('#lvlText').className = 'pill pill-level ' + (G.L.difficulty || '');
  $('#ordersText').textContent = `Sipariş ${G.served}/${G.total}`;
  $('#coinText').textContent = save.coins;
  const full = A.url('heartFull'), empty = A.url('heartEmpty');
  let h = '';
  for (let i = 0; i < G.L.startingHearts; i++) {
    const on = i < G.hearts;
    const src = on ? full : empty;
    h += `<span class="heart asset ${on ? 'on' : 'off'}" data-label="heart">` +
      (src ? `<img src="${src}" alt="">` : heartSVG()) + '</span>';
  }
  $('#hearts').innerHTML = h;
}

let hintUntil = 0;
function renderHint() {
  if (performance.now() < hintUntil) return;
  const H = $('#hint');
  H.className = 'pill';
  H.textContent = G.selected ? 'Dökmek için hedef şişeye dokun.'
    : P.THEMES[G.L.theme].hint;
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
  G.bottles.forEach(renderBottle);
  const before = cardEls.map(E => E.key);
  G.slots.forEach(renderCard);
  if (cardEls.some((E, i) => E.key !== before[i] && G.slots[i].state === 'arriving')) arrangeCards(true);
  renderTimers();
  renderHint();
  G.pourInto = null;
}

// ---------- feedback / fx ----------
function restartAnim(node, cls) {
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
  clearTimeout(node['_t' + cls]);
  node['_t' + cls] = setTimeout(() => node.classList.remove(cls), 450);
}
function bad(id, msg) { restartAnim(bottleEls[id].slot, 'bad'); flashHint(msg, 'bad'); renderAll(); }

function layerRect(id, index) {
  const r = bottleEls[id].liquid.getBoundingClientRect();
  const h = r.height / G.L.bottleCapacity;
  return { x: r.left, y: r.bottom - (index + 1) * h, w: r.width, h };
}

const fx = $('#fx');
function coinIcon() {
  return A.url('coin') ? `<img src="${A.url('coin')}" alt="">`
    : '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#f6b51e" stroke="#c98a0c" stroke-width="2"/>' +
      '<circle cx="12" cy="12" r="7" fill="none" stroke="#ffe08a" stroke-width="2"/><path d="M12 8v8" stroke="#c98a0c" stroke-width="2.4" stroke-linecap="round"/></svg>';
}

// "+15" rising from the served customer's card
function floatCoins(i, n) {
  const r = cardEls[i].card.getBoundingClientRect();
  if (!r.width) return;
  const d = el('div', 'coin-float', `<span class="coin">${coinIcon()}</span>+${n}`);
  Object.assign(d.style, { left: r.left + r.width / 2 - 26 + 'px', top: r.top + r.height * 0.45 + 'px' });
  fx.appendChild(d);
  const anim = d.animate([
    { transform: 'translateY(0) scale(.7)', opacity: 0 },
    { transform: 'translateY(-16px) scale(1.1)', opacity: 1, offset: 0.25 },
    { transform: 'translateY(-50px) scale(1)', opacity: 0 },
  ], { duration: 1100, easing: 'ease-out' });
  anim.onfinish = anim.oncancel = () => d.remove();
}
function flyLayer(color, a, b) {
  if (!a.w || !b.w) return;
  const C = P.COLORS[color];
  const d = el('div', 'fly-layer');
  d.dataset.c = color;
  Object.assign(d.style, { left: a.x + 'px', top: a.y + 'px', width: a.w + 'px', height: a.h + 'px', background: C.hex });
  fx.appendChild(d);
  const lift = Math.min(a.y, b.y) - a.y - a.h * 1.4;
  const anim = d.animate([
    { transform: 'translate(0,0) scale(1)', opacity: 1 },
    { transform: `translate(${(b.x - a.x) / 2}px, ${lift}px) scale(.55)`, opacity: 1, offset: 0.45 },
    { transform: `translate(${b.x - a.x}px, ${b.y - a.y}px) scale(${b.w / a.w}, 1)`, opacity: 0.2 },
  ], { duration: 260, easing: 'ease-in-out' });
  anim.onfinish = anim.oncancel = () => d.remove();
}

// The served glass flies to its customer.
function flyServe(id, i) {
  const src = bottleEls[id].node, r = src.getBoundingClientRect();
  const t = cardEls[i].card.querySelector('.portrait').getBoundingClientRect();
  if (!r.width) return;
  const c = src.cloneNode(true);
  c.classList.add('fly-bottle', 'serve-flight');
  Object.assign(c.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
  fx.appendChild(c);
  const dx = t.left + t.width * 0.7 - (r.left + r.width / 2), dy = t.top + t.height * 0.6 - (r.top + r.height / 2);
  const anim = c.animate([
    { transform: 'translate(0,0) scale(1)', opacity: 1 },
    { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 30}px) scale(.8) rotate(-8deg)`, opacity: 1, offset: 0.5 },
    { transform: `translate(${dx}px, ${dy}px) scale(.35)`, opacity: 0 },
  ], { duration: 480, easing: 'ease-in' });
  anim.onfinish = anim.oncancel = () => c.remove();
  if (G.paused) anim.pause();
}

// "Nice / Wow / Amazing ..." over the board the moment the mixer matches an
// order (a newer one replaces the one on screen), "COMBO ×N" from the second
// serve in a row (a customer leaving resets the combo).
function clearServeFeedback() {
  G.feedbackLeft = 0;
  const feedback = $('#serveFeedback');
  feedback.hidden = true;
  feedback.classList.remove('show', 'paused');
  feedback.querySelector('.impression-word').textContent = '';
  feedback.querySelector('.impression-combo').textContent = '';
  feedback.querySelector('.impression-combo').hidden = true;
}

function pauseServeFeedback(on) {
  $('#serveFeedback').classList.toggle('paused', on);
  fx.querySelectorAll('.serve-flight').forEach(node =>
    node.getAnimations().forEach(animation => on ? animation.pause() : animation.play()));
}

function showImpression(item) {
  const feedback = $('#serveFeedback');
  feedback.classList.remove('show', 'paused');
  feedback.hidden = false;
  feedback.querySelector('.impression-word').textContent = item.word;
  const combo = feedback.querySelector('.impression-combo');
  combo.hidden = item.combo < 2;
  combo.textContent = item.combo >= 2 ? `COMBO ×${item.combo}` : '';
  feedback.style.setProperty('--impression-color', item.color);
  feedback.style.setProperty('--impression-time', IMPRESSION_S + 's');
  void feedback.offsetWidth;
  feedback.classList.add('show');
  G.feedbackLeft = IMPRESSION_S;
}

// ---------- layout ----------
// Cards keep a third of the width each; the board picks the odd column count
// that gives the biggest bottles for this screen and bottle count, and the
// mixer takes the middle of the first row.
function layout() {
  const app = $('#app');
  const W = app.clientWidth, H = app.clientHeight;
  const appStyle = getComputedStyle(app);
  const contentW = W - parseFloat(appStyle.paddingLeft) - parseFloat(appStyle.paddingRight);
  const gap = parseFloat(getComputedStyle($('#customers')).columnGap) || 0;
  const cw = Math.min(150, Math.floor((contentW - 2 * gap) / 3));
  const fixed = 78;                                    // name + timer + paddings
  // more bottles -> the order cards give up a little height to the board
  const n = G.bottles.length;
  const share = n >= 10 ? 0.25 : n >= 8 ? 0.29 : 0.33;
  const ph = Math.max(66, Math.min(cw * 1.08, H * share - fixed));
  app.style.setProperty('--cw', cw + 'px');
  app.style.setProperty('--ph', ph + 'px');

  // Flex layout already accounts for safe areas, responsive gaps, HUD, cards and hint.
  // Fit the board to its actual remaining space, rather than subtracting estimates.
  const wrap = $('#boardWrap'), panel = $('#boardPanel');
  const wrapStyle = getComputedStyle(wrap), panelStyle = getComputedStyle(panel);
  const availW = Math.max(1, wrap.clientWidth - parseFloat(wrapStyle.paddingLeft) - parseFloat(wrapStyle.paddingRight)
    - parseFloat(panelStyle.paddingLeft) - parseFloat(panelStyle.paddingRight));
  const availH = Math.max(1, wrap.clientHeight - parseFloat(wrapStyle.paddingTop) - parseFloat(wrapStyle.paddingBottom)
    - parseFloat(panelStyle.paddingTop) - parseFloat(panelStyle.paddingBottom));
  // Only the first row (the mixer's) needs room for the KAP tag above the glass.
  const tagRoom = (board.querySelector('.mixer-tag')?.offsetHeight || 24) + 12;
  const rowPadding = 10;
  const heightFactor = 1.18 * 1.1; // Larger mixer plus its selection lift (width: 0.82 x 1.18 keeps the mixer inside its slot).
  const ratio = A.BOTTLE.h / A.BOTTLE.w;
  let best = null;
  // Odd column counts put the mixer in the middle of a full first row; with an
  // even count the first row has one bottle fewer (normal, mixer, normal...).
  for (let cols = 1; cols <= Math.max(1, n); cols++) {
    const first = cols % 2 ? cols : cols - 1;
    const rows = 1 + Math.ceil(Math.max(0, n - first) / cols);
    const slotW = availW / cols;
    const bw = Math.min(118, slotW * 0.82, (availH - tagRoom - rows * rowPadding) / (rows * ratio * heightFactor));
    if (!best || bw > best.bw + 0.5) best = { cols, first, rows, bw, slotW };
  }
  // The board never scrolls: bottles shrink to whatever fits.
  const bw = Math.max(1, Math.floor(best.bw));
  const bh = Math.floor(bw * ratio);
  const slotW = Math.floor(Math.min(best.slotW, bw * 1.4));
  const slotH = Math.ceil(bh * heightFactor + rowPadding);
  board.style.setProperty('--bw', bw + 'px');
  board.style.setProperty('--bh', bh + 'px');
  board.style.setProperty('--sw', slotW + 'px');
  board.style.setProperty('--sh', slotH + 'px');
  board.style.setProperty('--tag', tagRoom + 'px');
  board.style.width = slotW * best.cols + 'px';
  board.dataset.cols = best.cols;
  const appRect = app.getBoundingClientRect(), panelRect = $('#boardPanel').getBoundingClientRect();
  Object.assign($('#serveFeedback').style, { left: appRect.left + 'px', width: appRect.width + 'px', top: (panelRect.top + 26) + 'px' });
  const first = Math.min(best.first, n), mid = Math.floor(first / 2);
  let pos = 0;
  for (const b of G.bottles) {
    if (pos === mid && !b.mixer) pos++;
    const order = b.mixer ? mid : pos++;
    bottleEls[b.id].slot.style.order = order < first ? order : order + 1;   // +1: after the row break
    bottleEls[b.id].slot.classList.toggle('row0', order < first);
  }
  rowBreak.style.order = first;
}
window.addEventListener('resize', () => { if (G) layout(); });
if (window.visualViewport) window.visualViewport.addEventListener('resize', () => { if (G) layout(); });
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

function patienceRange(L) {
  const p = L.orders.map(o => o.patience), lo = Math.min(...p), hi = Math.max(...p);
  return lo === hi ? lo : `${lo}–${hi}`;
}

function levelFacts(L) {
  const colors = new Set(L.orders.flatMap(o => o.layers));
  const empty = L.initialBottles.filter(b => !b.length).length;
  return `<div class="facts"><span><b>${L.bottleCount}</b> şişe</span><span><b>${empty}</b> boş</span>` +
    `<span><b>${colors.size}</b> renk</span><span><b>${L.orders.length}</b> sipariş</span>` +
    `<span><b>${patienceRange(L)}</b> sn sabır</span></div>`;
}

function showPause() {
  showPanel(`<div class="eyebrow">DURAKLATILDI</div><h2>Bölüm ${G.L.levelOrder + 1}</h2>${levelFacts(G.L)}`, [
    ['Devam et', () => pause(false), 'go'],
    ['Yeniden başlat', () => { hidePanel(); startLevel(G.L.levelOrder); }],
    ['Bölümler', showLevels],
    ...(window.GAME_HOME ? [['Ana Menü', window.GAME_HOME]] : []),   // set by the combined page (../cafe_sort)
  ]);
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
      [['Claim x2<span class="x2">+' + G.coins * 2 + '</span>', () => claim(2), 'go x2-btn'], ['Claim', () => claim(1), 'claim-btn']], 'win');
  } else {
    const art = A.url('loseArt') ? `<img class="art" src="${A.url('loseArt')}" alt="">` : '<div class="art emoji">💔</div>';
    const msg = G.lossMsg || (status === 'stuck' ? 'Hiç hamle kalmadı.' : 'Üç müşteri beklemekten sıkılıp gitti.');
    showPanel(`${art}<div class="eyebrow">BÖLÜM ${L.levelOrder + 1}</div><h2>Bar kapandı</h2><p>${msg}</p>`,
      [['Yeniden dene', () => startLevel(L.levelOrder), 'go'], ['Bölümler', showLevels]], 'lose');
  }
}

function showLevels() {
  // every level can be picked here (prototype: no locks)
  const cells = LEVELS.map(l => {
    const L = Core.resolveLevel(l), coffee = L.theme === 'coffee';
    const cls = [G && l.levelOrder === G.L.levelOrder ? 'cur' : '', l.difficulty || '', coffee ? 'coffee' : ''].join(' ');
    return `<button data-o="${l.levelOrder}" class="${cls}" aria-label="Bölüm ${l.levelOrder + 1}, ${coffee ? 'kahve' : 'kokteyl'}">` +
      `${l.levelOrder + 1}<small>${L.bottleCount}${coffee ? '☕' : '🍾'}</small></button>`;
  }).join('');
  const legend = '<div class="lvl-legend"><span class="coffee">☕ Kahve</span><span class="hard">Zor</span><span class="veryHard">Çok zor</span></div>';
  showPanel(`<h2>Bölümler</h2><div class="lvl-grid">${cells}</div>${legend}`,
    G && G.status === 'play' ? [['Geri', showPause]] : []);
  panel.querySelectorAll('.lvl-grid button').forEach(b =>
    b.addEventListener('click', () => { hidePanel(); startLevel(+b.dataset.o); }));
}

$('#btnPause').addEventListener('click', () => pause(true));

// ---------- drawings used until the PNGs exist ----------
function heartSVG() {
  return '<svg viewBox="0 0 24 22"><path d="M12 21C5 15.5 1 12 1 7a5.5 5.5 0 0 1 11-1 5.5 5.5 0 0 1 11 1c0 5-4 8.5-11 14Z"/></svg>';
}
function clockSVG() {
  return '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#fff6e6" stroke="#8a5a2b" stroke-width="2.4"/><path d="M12 6.5V12l3.5 2.2" fill="none" stroke="#8a5a2b" stroke-width="2.4" stroke-linecap="round"/></svg>';
}
const LOOKS = [
  { skin: '#f6c9a8', hair: '#7a4a2a', shirt: '#fff4e4', apron: '#5c9b56', style: 'bun', acc: '#ff6f91' },
  { skin: '#7b4a2e', hair: '#231814', shirt: '#f2b53a', apron: '#4d7f49', style: 'curly', acc: null },
  { skin: '#f3d2b5', hair: '#2a1e3a', shirt: '#fff4e4', apron: '#38364a', style: 'beret', acc: '#a77bf0' },
  { skin: '#e2a77f', hair: '#c3521f', shirt: '#7fc6e8', apron: '#d0634c', style: 'short', acc: null },
  { skin: '#fbe0c8', hair: '#e8c35a', shirt: '#ffb7c9', apron: '#7a63c9', style: 'long', acc: null },
  { skin: '#a8714f', hair: '#3b2a20', shirt: '#9be0b0', apron: '#e08c3c', style: 'cap', acc: '#3a7bd5' },
];
function avatarSVG(i, mood) {
  const k = LOOKS[(i - 1) % LOOKS.length];
  const eyes = mood === 'happy'
    ? '<path d="M41 52q4-5 8 0M63 52q4-5 8 0" stroke="#3a2418" stroke-width="3" fill="none" stroke-linecap="round"/>'
    : '<circle cx="45" cy="52" r="3.6" fill="#3a2418"/><circle cx="67" cy="52" r="3.6" fill="#3a2418"/>';
  const mouth = mood === 'happy' ? '<path d="M45 64q11 12 22 0Z" fill="#b8423d"/>'
    : mood === 'sad' ? '<path d="M47 70q9-8 18 0" stroke="#3a2418" stroke-width="3" fill="none" stroke-linecap="round"/>'
    : '<path d="M47 65q9 7 18 0" stroke="#3a2418" stroke-width="3" fill="none" stroke-linecap="round"/>';
  const brows = mood === 'sad' ? '<path d="M39 44l9 3M73 44l-9 3" stroke="#3a2418" stroke-width="2.6" stroke-linecap="round"/>' : '';
  const hair = {
    bun: `<circle cx="56" cy="16" r="11" fill="${k.hair}"/><path d="M30 52q-2-30 26-30t26 30q-6-16-26-16t-26 16Z" fill="${k.hair}"/><path d="M33 34q23-14 46 0" stroke="${k.acc}" stroke-width="6" fill="none"/>`,
    curly: `<path d="M30 48q-4-30 26-30t26 30q-4-12-10-14-8 4-16 0-8 4-16 0-6 2-10 14Z" fill="${k.hair}"/><path d="M38 72q18 18 36 0q0 16-18 18t-18-18Z" fill="${k.hair}"/>`,
    beret: `<path d="M28 58q-4-34 28-34t28 34q-4-18-28-18t-28 18Z" fill="${k.hair}"/><path d="M28 60q-6 20 2 32M84 60q6 20-2 32" stroke="${k.hair}" stroke-width="10" stroke-linecap="round"/><ellipse cx="54" cy="26" rx="30" ry="12" fill="${k.acc}"/>`,
    short: `<path d="M31 50q-3-30 25-30t25 30q-3-12-12-14l-13 6-12-6q-10 2-13 14Z" fill="${k.hair}"/>`,
    long: `<path d="M29 56q-4-34 27-34t27 34q-4-16-27-18t-27 18Z" fill="${k.hair}"/><path d="M29 54q-6 26 4 42M83 54q6 26-4 42" stroke="${k.hair}" stroke-width="11" stroke-linecap="round"/>`,
    cap: `<path d="M30 46q0-24 26-24t26 24Z" fill="${k.acc}"/><path d="M76 44h16q2 4-4 5H76Z" fill="${k.acc}"/><path d="M31 48q2 6 6 8M81 48q-2 6-6 8" stroke="${k.hair}" stroke-width="5"/>`,
  }[k.style];
  return `<svg viewBox="0 0 112 112" class="avatar">` +
    `<path d="M14 112q4-30 42-32t42 32Z" fill="${k.shirt}"/><path d="M34 112l4-26h36l4 26Z" fill="${k.apron}"/>` +
    `<rect x="48" y="70" width="16" height="14" rx="6" fill="${k.skin}"/>` +
    `<ellipse cx="56" cy="54" rx="25" ry="27" fill="${k.skin}"/>` +
    `<circle cx="40" cy="62" r="4.5" fill="#ff8f8f" opacity=".45"/><circle cx="72" cy="62" r="4.5" fill="#ff8f8f" opacity=".45"/>` +
    hair + brows + eyes + mouth + `</svg>`;
}

// ---------- boot ----------
function boot() {
  if (WIRE) document.body.classList.add('wire');
  if (qs.has('calib')) document.body.classList.add('calib');
  $('#coins .coin').innerHTML = coinIcon();
  if (A.url('pause')) $('#btnPause').innerHTML = `<img src="${A.url('pause')}" alt="">`;
  else $('#btnPause').innerHTML = '<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1.5"/><rect x="14" y="5" width="4" height="14" rx="1.5"/></svg>';
  if (!LEVELS.length) return showPanel('<h2>levels.js boş</h2><p>node tools/gen.js çalıştır.</p>', []);
  const q = qs.get('level');
  const start = q !== null && rawLevel(+q) ? +q : rawLevel(save.current) ? save.current : LEVELS[0].levelOrder;
  startLevel(start);
  requestAnimationFrame(t => { last = t; tick(t); });
}

// Test hook (tools/playtest.js): state snapshot, start/play, clock steps, bottle setters.
window.CocktailGame = {
  state: () => G && JSON.parse(JSON.stringify({
    levelOrder: G.L.levelOrder, status: G.status, hearts: G.hearts, served: G.served, total: G.total, mixer: G.L.mixer,
    refillAt: G.refillAt,
    coins: G.coins, wallet: save.coins, combo: G.combo,
    selected: G.selected, bottles: G.bottles, queue: G.queue.map(o => o.uid),
    slots: G.slots.map((s, i) => ({ state: s.state, uid: s.order ? s.order.uid : null, left: s.left, pos: G.cardPos[i] })),
  })),
  start: o => { hidePanel(); startLevel(o); },
  play: () => { hidePanel(); G.paused = false; pauseServeFeedback(false); renderAll(); },
  step: dt => step(dt),
  // put layers straight into a bottle (to test recipe matching), then let auto-serve look
  setBottle: (i, layers) => { G.bottles[i].layers = layers.slice(); autoServe(); checkStuck(); renderAll(); },
  setGone: i => { G.bottles[i].gone = true; G.bottles[i].layers = []; checkStuck(); renderAll(); },
  useUpRefills: () => { G.refillAt = G.L.refills.length; },
  deadEnd: () => deadEnd(),
  noDeadCheck: () => { G.noDeadCheck = true; },   // for tests that build impossible boards on purpose
};

A.load(1500).then(boot);
})();
