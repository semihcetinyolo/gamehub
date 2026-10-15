// Cocktail Flow — the supply bottles stand in 3 lanes under the counter. Only
// the front bottle of a lane can be used; the top of the one behind it shows
// (smaller, below it) and it moves up when the front one runs empty. Pour one layer at a
// time into the 3 preparation glasses on the counter (any colour) and build
// each customer's recipe bottom -> top before their patience runs out. A glass
// that equals an on-screen order is served to that customer by itself. Layers
// of a glass that already match the start of an order share a progress frame,
// on the glass and the order. Supply bottles only take a layer onto the same colour.
(() => {
'use strict';
const P = window.FlowProgression;
const Core = window.FlowCore;
const A = window.FlowAssets;
const LEVELS = (window.FLOW_LEVELS || []).slice().sort((a, b) => a.levelOrder - b.levelOrder);

const ARRIVE_S = 0.5;    // card slide-in; patience starts after it (tools/solver.js T.arrive)
const LEAVE_S = 0.8;     // card leave before the next customer comes (T.leave)
const SERVE_S = 0.45;    // matched glass glows, then flies to the customer
const ADVANCE_S = 0.3;   // an emptied front bottle fades out, then the one behind moves up
const MOVE_UP_MS = 380;
const BACK_SCALE = 0.7;  // bottles waiting behind the front row
const BACK_SHOW = 0.56;  // ...of which only the top shows (neck + top layer)
const PREP_SCALE = 0.9;
const SAVE_KEY = 'cocktail_flow_v1';
const MARK_MODES = { v1: 'Hazırlık şişesi', v2: 'Sipariş şişesi', v3: 'İkisi de' };
const BOARD_VIEWS = { v1: 'Klasik tezgâh', v2: 'Ortak tezgâh', v3: 'Müşteri bardakları' };
const IMPRESSIONS = ['Nice', 'Wow', 'Amazing', 'Bingo', 'Great', 'Bravo', 'Yay'];
const IMPRESSION_COLORS = ['#27866e', '#d57520', '#9750c5', '#c84767', '#287eb8', '#c85d34', '#438739'];
const IMPRESSION_S = 1.05;
const qs = new URLSearchParams(location.search);
const WIRE = qs.has('wire');

const $ = s => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

// ---------- save ----------
function loadSave() {
  // marks: progress frames for matching layers (pause panel switch, off by default)
  try { return Object.assign({ unlocked: 0, current: 0, coins: 0, marks: false, marksMode: 'v3', boardView: 'v1' }, JSON.parse(localStorage.getItem(SAVE_KEY)) || {}); }
  catch (e) { return { unlocked: 0, current: 0, coins: 0, marks: false, marksMode: 'v3', boardView: 'v1' }; }
}
function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* private mode */ } }
const save = loadSave();
if (!Object.hasOwn(MARK_MODES, save.marksMode)) save.marksMode = 'v3';
if (!Object.hasOwn(BOARD_VIEWS, save.boardView)) save.boardView = 'v1';
// saves from before the default became "off" stored marks: true; reset them once
if (save.marksDefault !== 'off') { save.marks = false; save.marksDefault = 'off'; writeSave(); }
// the default board became the classic one (v1); move saves made under the old default once
if (save.boardViewDefault !== 'v1') { save.boardView = 'v1'; save.boardViewDefault = 'v1'; writeSave(); }

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
  // vessels: the lanes' front bottles first, then the preparation glasses
  // (same indices as tools/solver.js)
  const lanes = L.lanes.map((list, i) => ({ id: 'l' + i, list, ptr: 0, layers: (list[0] || []).slice(), phase: null, prep: false }));
  const preps = Array.from({ length: L.prepCount }, (_, i) => ({ id: 'p' + i, layers: [], phase: null, prep: true }));
  G = {
    L,
    lanes, preps,
    vessels: lanes.concat(preps),
    queue: L.orders.map((o, i) => ({ uid: i, name: o.name, layers: o.layers, patience: o.patience, coins: o.coins })),
    slots: Array.from({ length: Math.min(L.maxActiveCustomers, L.orders.length) }, () => ({ state: 'empty' })),
    total: L.orders.length,
    served: 0,
    combo: 0,
    feedbackQueue: [],
    feedbackLeft: 0,
    hearts: L.startingHearts,
    coins: 0,                // earned this level, credited on Claim / Claim x2
    selected: null,
    status: 'play',          // play | won | lost | stuck
    paused: false,
    lastChar: 0,
  };
  clearServeFeedback();
  fx.querySelectorAll('.serve-flight').forEach(node => {
    node.getAnimations().forEach(animation => animation.cancel());
    node.remove();
  });
  save.current = L.levelOrder; writeSave();
  document.body.dataset.theme = L.theme;
  const bg = A.themed('bg', L.theme);
  $('#bg').style.backgroundImage = bg ? `url("${bg}")` : '';
  buildBoard();
  buildCards();
  G.slots.forEach(fillSlot);
  hidePanel();
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
function vessel(id) { return G.vessels.find(b => b.id === id); }
function busy(b) {
  return !!b.phase || !!b.gone || (save.boardView === 'v3' && b.prep &&
    G.slots[G.preps.indexOf(b)]?.state === 'leaving');
}

function tapVessel(id) {
  if (G.status !== 'play' || G.paused) return;
  const b = vessel(id);
  if (G.selected !== null && busy(vessel(G.selected))) G.selected = null;
  if (b.gone) return;
  if (busy(b)) {
    G.selected = null;   // a failed pour drops the bottle in hand
    return bad(id, b.phase === 'serving' ? 'Bu içecek servis ediliyor.' : b.prep ? 'Yeni müşteri bekleniyor.' : 'Arkadaki şişe öne geliyor.');
  }
  if (G.selected === null) {
    if (!b.layers.length) return bad(id, 'Bu bardak boş.');
    G.selected = id;
  } else if (G.selected === id) {
    G.selected = null;
  } else {
    const src = vessel(G.selected);
    // a pour that can't happen shakes the target and drops the bottle in hand
    if (b.layers.length >= G.L.bottleCapacity) { G.selected = null; return bad(id, b.prep ? 'Bardak dolu.' : 'Bu şişe dolu.'); }
    if (!Core.canPour(src.layers, b.layers, G.L.bottleCapacity, b.prep)) {
      G.selected = null;
      return bad(id, 'Şişelere yalnızca aynı renk dökülür. Karıştırmak için hazırlık bardaklarını kullan.');
    }
    pour(src, b);
    G.selected = null;
  }
  renderAll();
}

function tapBack(i) {
  if (G.status !== 'play' || G.paused) return;
  if (G.selected !== null) { G.selected = null; renderAll(); }
  restartAnim(laneEls[i].back, 'bad');
  flashHint('Yalnızca öndeki şişeler kullanılabilir.', 'bad');
}

function pour(src, dst) {
  if (!Core.canPour(src.layers, dst.layers, G.L.bottleCapacity, dst.prep)) return;
  const color = src.layers[src.layers.length - 1];
  const from = layerRect(src.id, src.layers.length - 1);
  src.layers.pop();
  dst.layers.push(color);
  const to = layerRect(dst.id, dst.layers.length - 1);
  flyLayer(color, from, to);
  G.pourInto = { id: dst.id, index: dst.layers.length - 1 };
  // an emptied front bottle makes way for the one behind it (taken now, as
  // tools/solver.js does); an exhausted lane is gone
  if (!src.prep && !src.layers.length) {
    if (src.ptr + 1 < src.list.length) { src.phase = 'advancing'; src.t = ADVANCE_S; }
    else src.gone = true;
    if (G.selected === src.id) G.selected = null;
  }
  autoServe();
  checkStuck();
}

// A glass is served by itself when it equals an on-screen order: after a pour
// or when a customer arrives. Same recipe twice -> the most impatient one.
function autoServe() {
  if (G.status !== 'play') return;
  for (const b of G.preps) {
    if (busy(b) || !b.layers.length) continue;
    let best = -1;
    G.slots.forEach((s, i) => {
      if (save.boardView === 'v3' && G.preps[i] !== b) return;
      if (!onScreen(s) || !Core.sameLayers(b.layers, s.order.layers)) return;
      if (best < 0 || timeLeft(s) < timeLeft(G.slots[best])) best = i;
    });
    if (best >= 0) serve(b, best);
    if (G.status !== 'play') return;
  }
}
function timeLeft(s) { return s.state === 'arriving' ? s.max : s.left; }

function serve(b, i) {
  // The order is done the moment it matches; the card can't time out after this.
  const slot = G.slots[i];
  G.coins += slot.order.coins;
  floatCoins(i, slot.order.coins);
  slot.state = 'leaving'; slot.mood = 'happy';
  slot.t = save.boardView === 'v3' ? SERVE_S + 0.52 + 0.2 : LEAVE_S;
  G.served++;
  G.combo++;
  const impression = (G.served - 1) % IMPRESSIONS.length;
  b.feedback = { word: IMPRESSIONS[impression], color: IMPRESSION_COLORS[impression], combo: G.combo, ready: false };
  G.feedbackQueue.push(b.feedback);
  b.phase = 'serving'; b.t = SERVE_S; b.slot = i;
  if (G.selected === b.id) G.selected = null;
  flashHint('Afiyet olsun!', 'info');
  if (G.served >= G.total) end('won');
}

// How many layers from the bottom of a glass match the start of an on-screen
// order: per glass (best order) and per customer (best glass).
function matches() {
  const glass = G.preps.map(() => 0), order = G.slots.map(() => 0);
  G.preps.forEach((b, g) => {
    if (b.phase) return;
    G.slots.forEach((s, i) => {
      if (save.boardView === 'v3' && i !== g) return;
      if (!onScreen(s)) return;
      let m = 0;
      while (m < b.layers.length && m < s.order.layers.length && b.layers[m] === s.order.layers[m]) m++;
      glass[g] = Math.max(glass[g], m);
      order[i] = Math.max(order[i], m);
    });
  });
  return { glass, order };
}

// glass: serving (glow) -> flies to the customer, empty again
// front bottle: advancing (empty one fades) -> the bottle behind moves up
function stepVessels(dt) {
  let changed = false;
  for (const b of G.vessels) {
    if (!b.phase || (b.t -= dt) > 0) continue;
    changed = true;
    if (b.phase === 'serving') {
      flyServe(b.id, b.slot, b.feedback);
      b.feedback = null;
      b.layers = [];
    } else {
      b.from = laneEls[b.id].back.getBoundingClientRect();   // where it comes from, for the move-up
      b.ptr++;
      b.layers = b.list[b.ptr].slice();
    }
    b.phase = null;
  }
  return changed;
}

function checkStuck() {
  const cap = G.L.bottleCapacity;
  const free = G.vessels.filter(b => !busy(b));
  const canMove = free.some(a => free.some(b => Core.canPour(a.layers, b.layers, cap, b.prep)));
  if (!canMove && !G.vessels.some(b => b.phase) && G.slots.some(onScreen)) end('stuck');
}

function end(status) {
  G.status = status;
  G.selected = null;
  const tok = runToken;
  if (status === 'won') {
    const nx = nextOrder(G.L.levelOrder);
    if (nx !== null) save.unlocked = Math.max(save.unlocked, nx);
    writeSave();
    G.winDelay = 1.4;
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
    if (!G.feedbackLeft) nextServeFeedback();
  } else if (G.feedbackQueue[0]?.ready) nextServeFeedback();
  let changed = stepVessels(dt);
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
    if (!G.winDelay && !G.feedbackLeft && !G.feedbackQueue.length && !G.vessels.some(b => b.phase === 'serving')) {
      G.endShown = true;
      showEnd('won');
    }
  }
}

function pause(on) {
  if (!G || G.status !== 'play') return;
  G.paused = on;
  pauseServeFeedback(on);
  if (on) showPause();
  else { hidePanel(); autoServe(); renderAll(); }
}

document.addEventListener('visibilitychange', () => { if (document.hidden) pause(true); });
window.addEventListener('pagehide', () => pause(true));

// ---------- board ----------
const lanesEl = $('#lanes'), prepsEl = $('#preps');
let vesselEls = {};   // id -> { slot, node, liquid }
let laneEls = {};     // lane id (and lane index) -> { back, backLiquid, more, key }

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
  // The default outline only fits the default bottle. Other vessels keep their own rim and shape.
  const front = backUrl === A.url('bottle') && A.url('bottleOverlay') ? `<img class="glass front" src="${A.url('bottleOverlay')}" alt="">`
    : backUrl ? `<svg class="glass front" viewBox="0 0 ${B.w} ${B.h}"><path d="M78 300 L78 760" stroke="rgba(255,255,255,.45)" stroke-width="16" stroke-linecap="round"/></svg>`
    : svg.front;
  return back +
    `<div class="liquid ${liquidClass}" style="left:${q.x / B.w * 100}%;top:${q.y / B.h * 100}%;width:${q.w / B.w * 100}%;height:${q.h / B.h * 100}%;` +
    `border-radius:0 0 ${q.r / q.w * 100}% ${q.r / q.w * 100}% / 0 0 ${q.r / q.h * 100}% ${q.r / q.h * 100}%"></div>` + front;
}
function prepMarkup(liquidClass) {
  const url = A.themed('mixer', G.L.theme);
  return url ? bottleMarkup(liquidClass, url) : bottleMarkup(liquidClass);
}

function buildBoard() {
  lanesEl.innerHTML = prepsEl.innerHTML = '';
  vesselEls = {}; laneEls = {};
  const glass = bottleMarkup();
  const check = A.url('check') ? `<img src="${A.url('check')}" alt="">` : '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#3cc152" stroke="#fff" stroke-width="2"/><path d="M6.5 12.5l3.6 3.6 7.4-7.6" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  G.lanes.forEach((b, i) => {
    const lane = el('div', 'lane');
    const backSlot = el('div', 'back-slot');
    const back = el('div', 'bottle back-bottle asset', glass);
    back.dataset.label = 'bottle (arkada)';
    const more = el('div', 'more');
    backSlot.append(back, more);
    backSlot.addEventListener('pointerdown', e => { e.preventDefault(); tapBack(i); });
    const slot = el('div', 'slot front');
    slot.dataset.id = b.id;
    const node = el('div', 'bottle asset', glass);
    node.dataset.label = 'bottle';
    slot.appendChild(node);
    const targetMark = el('span', 'transfer-mark', '+');
    targetMark.setAttribute('aria-hidden', 'true');
    targetMark.hidden = true;
    slot.appendChild(targetMark);
    slot.addEventListener('pointerdown', e => { e.preventDefault(); tapVessel(b.id); });
    lane.append(slot, backSlot);   // the waiting bottle stands below the front one
    lanesEl.appendChild(lane);
    vesselEls[b.id] = { slot, node, targetMark, liquid: node.querySelector('.liquid') };
    laneEls[b.id] = laneEls[i] = { back, backLiquid: back.querySelector('.liquid'), more, key: null };
  });
  for (const b of G.preps) {
    const slot = el('div', 'slot prep');
    slot.dataset.id = b.id;
    const node = el('div', 'bottle asset', prepMarkup('') + `<div class="badge">${check}</div>`);
    node.dataset.label = 'mixer';
    slot.appendChild(node);
    const targetMark = el('span', 'transfer-mark', '+');
    targetMark.setAttribute('aria-hidden', 'true');
    targetMark.hidden = true;
    slot.appendChild(targetMark);
    slot.addEventListener('pointerdown', e => { e.preventDefault(); tapVessel(b.id); });
    prepsEl.appendChild(slot);
    vesselEls[b.id] = { slot, node, targetMark, liquid: node.querySelector('.liquid') };
  }
}

function layerStyle(n, c, i, cap) {
  if (n.dataset.c !== c) {
    const C = P.COLORS[c] || { hex: '#999', hi: '#bbb', lo: '#777' };
    n.dataset.c = c;
    n.style.background = `linear-gradient(180deg, ${C.hi} 0%, ${C.hex} 22%, ${C.hex} 70%, ${C.lo} 100%)`;
  }
  n.style.bottom = (i / cap * 100) + '%';
  n.style.height = (100 / cap) + '%';
}

// fillAt: index of a layer that just got poured in (grows in); the first
// `matched` layers share one progress frame, keeping their liquid colours clear.
function renderLiquid(liq, layers, fillAt, matched = 0) {
  const cap = G.L.bottleCapacity;
  while (liq.children.length > layers.length) liq.lastElementChild.remove();
  layers.forEach((c, i) => {
    let n = liq.children[i];
    if (!n) {
      n = el('div', 'layer');
      liq.appendChild(n);
      if (i === fillAt) n.classList.add('fill-in');
    }
    layerStyle(n, c, i, cap);
    n.classList.toggle('match', i < matched);
  });
  renderMatchGuide(liq, matched, cap);
}

function renderMatchGuide(liq, matched, cap) {
  let guide = liq.parentElement.querySelector('.match-guide');
  if (!guide && !matched) return;
  if (!guide) {
    guide = el('div', 'match-guide');
    guide.setAttribute('aria-hidden', 'true');
    liq.parentElement.appendChild(guide);
  }
  guide.hidden = !matched;
  if (!matched) return;
  const height = parseFloat(liq.style.height), top = parseFloat(liq.style.top);
  guide.style.setProperty('--liquid-left', liq.style.left);
  guide.style.setProperty('--liquid-width', liq.style.width);
  guide.style.top = (top + height * (1 - matched / cap)) + '%';
  guide.style.height = (height * matched / cap) + '%';
}

function renderVessel(b, matched) {
  const E = vesselEls[b.id];
  const source = G.selected === null ? null : vessel(G.selected);
  const selected = source === b && !busy(b);
  const canReceive = G.status === 'play' && source && source !== b && !busy(source) && !busy(b) &&
    Core.canPour(source.layers, b.layers, G.L.bottleCapacity, b.prep);
  E.slot.classList.toggle('can-receive', !!canReceive);
  E.targetMark.hidden = !selected && !canReceive;
  E.targetMark.textContent = selected ? '●' : '+';
  const fillAt = G.pourInto && G.pourInto.id === b.id ? G.pourInto.index : -1;
  renderLiquid(E.liquid, b.layers, fillAt, matched);
  E.slot.classList.toggle('matching', matched > 0);
  E.slot.classList.toggle('sel', G.selected === b.id);
  E.slot.classList.toggle('ready', b.phase === 'serving');
  E.slot.classList.toggle('emptied', b.phase === 'advancing');
  E.slot.classList.toggle('gone', !!b.gone);
  if (!b.prep) renderLane(b);
}

// The bottle behind the front one (contents shown, can't be tapped) and how
// many more wait behind that.
function renderLane(b) {
  const E = laneEls[b.id];
  const next = b.list[b.ptr + 1] || null;
  const hidden = Math.max(0, b.list.length - b.ptr - 2);
  if (E.key !== b.ptr) {
    E.key = b.ptr;
    E.backLiquid.innerHTML = '';
    if (next) renderLiquid(E.backLiquid, next, -1);
    E.back.classList.toggle('none', !next);
    E.more.textContent = hidden ? '+' + hidden : '';
    E.more.classList.toggle('none', !hidden);
    if (b.from) moveUp(b);
  }
}

// The bottle that was behind slides into the front place; the new one behind
// it fades in.
function moveUp(b) {
  const E = vesselEls[b.id], L = laneEls[b.id];
  const a = b.from, z = E.node.getBoundingClientRect();
  b.from = null;
  if (!a.width || !z.width) return;
  const dx = (a.left + a.width / 2) - (z.left + z.width / 2), dy = a.bottom - z.bottom, s = a.width / z.width;
  E.node.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${s})` }, { transform: 'none' }],
    { duration: MOVE_UP_MS, easing: 'cubic-bezier(.3,1.25,.5,1)' });
  L.back.animate([{ opacity: 0, transform: 'translateY(-14%) scale(.85)' }, { opacity: 1, transform: 'none' }],
    { duration: MOVE_UP_MS, delay: 120, easing: 'ease-out', fill: 'backwards' });
}

// ---------- cards ----------
// Every customer keeps their place; a new customer takes the place of the one
// who left.
const cardsEl = $('#customers');
let cardEls = [];

function buildCards() {
  cardsEl.innerHTML = '';
  cardEls = G.slots.map((slot, i) => {
    const wrap = el('div', 'cust');
    const card = el('div', 'card');
    card.innerHTML =
      `<div class="portrait asset" data-label="customer_0X"><div class="face"></div><div class="price"></div>` +
      `<div class="mini" role="img" style="aspect-ratio:${A.BOTTLE.w}/${A.BOTTLE.h}">` +
      `<div class="order-glass" aria-hidden="true">${prepMarkup('order-layers')}</div></div></div>` +
      `<div class="rname" lang="en"></div>` +
      `<div class="customer-station"><span class="recipe-title">TARİF</span>` +
      `<div class="customer-recipe" aria-label="Tarif, alttan üste"></div><div class="customer-cup-dock"></div></div>`;
    card.addEventListener('pointerdown', e => {
      if (save.boardView === 'v3' && G.selected && G.preps[i] && !e.target.closest('.slot')) {
        e.preventDefault(); tapVessel(G.preps[i].id);
      }
    });
    const timer = el('div', 'timer',
      `<span class="clock asset" data-label="clock">${A.url('clock') ? `<img src="${A.url('clock')}" alt="">` : clockSVG()}</span>` +
      `<div class="track"><i></i><b></b></div>`);
    wrap.append(card, timer);
    cardsEl.appendChild(wrap);
    return { wrap, card, timer, face: card.querySelector('.face'), mini: card.querySelector('.mini'),
      name: card.querySelector('.rname'), price: card.querySelector('.price'), layers: card.querySelector('.order-layers'),
      fill: timer.querySelector('i'), text: timer.querySelector('b'),
      dock: card.querySelector('.customer-cup-dock'), recipe: card.querySelector('.customer-recipe'), key: '' };
  });
}

// Reuse the actual preparation vessels when switching views, including their
// current liquid and input handlers. Each V3 card owns the cup in its position.
function placePreparationGlasses() {
  G.preps.forEach((b, i) => {
    const host = save.boardView === 'v3' && cardEls[i] ? cardEls[i].dock : prepsEl;
    if (vesselEls[b.id].slot.parentElement !== host) host.appendChild(vesselEls[b.id].slot);
  });
  $('#counter').classList.toggle('no-preps', !prepsEl.children.length);
}

function renderCard(slot, i, matched) {
  const E = cardEls[i];
  const key = slot.state === 'empty' ? 'empty' : `${slot.order.uid}:${slot.char}:${slot.mood}`;
  E.wrap.className = 'cust ' + slot.state + (slot.mood ? ' ' + slot.mood : '') + (matched && onScreen(slot) ? ' matching' : '');
  const cup = G.preps[i], source = G.selected === null ? null : vessel(G.selected);
  E.wrap.classList.toggle('cup-target', save.boardView === 'v3' && cup && source && source !== cup &&
    !busy(source) && !busy(cup) && Core.canPour(source.layers, cup.layers, G.L.bottleCapacity, true));
  if (E.key !== key) {
    E.key = key;
    if (slot.state !== 'empty') {
      const img = A.customer(slot.char, slot.mood);
      E.face.innerHTML = img ? `<img src="${img}" alt="">` : avatarSVG(slot.char, slot.mood);
      E.name.textContent = slot.order.name;
      E.price.innerHTML = `<span class="coin">${coinIcon()}</span>${slot.order.coins}`;
      E.mini.setAttribute('aria-label', `${slot.order.name}, alttan üste: ${slot.order.layers.map(c => (P.COLORS[c] || {}).label || c).join(', ')}`);
      E.recipe.innerHTML = slot.order.layers.map((c, step) => {
        const color = P.COLORS[c];
        return `<span class="recipe-step" data-c="${c}" style="--recipe-color:${color.hex}" aria-label="${step + 1}. katman: ${color.label}">${step + 1}</span>`;
      }).join('');
    } else {
      E.recipe.innerHTML = '';
      E.name.textContent = 'Yedek bardak';
    }
  }
  if (slot.state !== 'empty') renderLiquid(E.layers, slot.order.layers, -1, onScreen(slot) ? matched : 0);
}

// The served glass flies to its customer.
function flyServe(id, i, feedback) {
  const token = runToken;
  const arrived = () => {
    if (token !== runToken || !G.feedbackQueue.includes(feedback)) return;
    feedback.ready = true;
    if (!G.paused && !G.feedbackLeft) nextServeFeedback();
  };
  const src = vesselEls[id].node, r = src.getBoundingClientRect();
  const t = cardEls[i].card.querySelector('.portrait').getBoundingClientRect();
  if (!r.width) { arrived(); return; }
  const c = src.cloneNode(true);
  c.classList.add('fly-bottle', 'serve-flight');
  c.classList.remove('asset');
  Object.assign(c.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
  fx.appendChild(c);
  const dx = t.left + t.width * 0.7 - (r.left + r.width / 2), dy = t.top + t.height * 0.6 - (r.top + r.height / 2);
  const personal = save.boardView === 'v3' && G.preps[i]?.id === id;
  const anim = c.animate(personal ? [
    { transform: 'translateY(0) scale(1)', opacity: 1 },
    { transform: 'translateY(-12px) scale(1.04)', opacity: 1, offset: 0.35 },
    { transform: 'translateY(-25px) scale(.8)', opacity: 0 },
  ] : [
    { transform: 'translate(0,0) scale(1)', opacity: 1 },
    { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 30}px) scale(.8) rotate(-8deg)`, opacity: 1, offset: 0.5 },
    { transform: `translate(${dx}px, ${dy}px) scale(.35)`, opacity: 0 },
  ], { duration: 520, easing: 'ease-in' });
  anim.onfinish = () => { c.remove(); arrived(); };
  anim.oncancel = () => c.remove();
  if (G.paused) anim.pause();
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
  if (save.boardView === 'v3') {
    H.textContent = G.selected ? 'Bardağa veya uygun şişeye dokun.' : 'Tarifi müşterinin kendi bardağında hazırla.';
  } else if (save.boardView === 'v1') {
    H.textContent = G.selected ? 'Dökmek için hedefe dokun.' : G.L.theme === 'coffee'
      ? 'Şişeden fincana dök, kahveyi alttan üste kur!' : 'Şişeden bardağa dök, tarifi alttan üste kur!';
  } else H.textContent = G.selected ? 'Uygun şişeye veya hazırlık kabına dokun.' : P.THEMES[G.L.theme].hint;
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
  const m = matches();
  if (!save.marks || save.marksMode === 'v2') m.glass.fill(0);
  if (!save.marks || save.marksMode === 'v1') m.order.fill(0);
  G.lanes.forEach(b => renderVessel(b, 0));
  G.preps.forEach((b, g) => renderVessel(b, m.glass[g]));
  $('#reserveLabel').hidden = !G.lanes.some(b => b.ptr + 1 < b.list.length);
  G.slots.forEach((s, i) => renderCard(s, i, m.order[i]));
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
function bad(id, msg) { restartAnim(vesselEls[id].slot, 'bad'); flashHint(msg, 'bad'); renderAll(); }

function layerRect(id, index) {
  const r = vesselEls[id].liquid.getBoundingClientRect();
  const h = r.height / G.L.bottleCapacity;
  return { x: r.left, y: r.bottom - (index + 1) * h, w: r.width, h };
}

const fx = $('#fx');
function clearServeFeedback() {
  G.feedbackQueue.length = 0;
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

function nextServeFeedback() {
  const feedback = $('#serveFeedback');
  feedback.classList.remove('show');
  feedback.hidden = true;
  if (!G.feedbackQueue[0]?.ready) return;
  const item = G.feedbackQueue.shift();
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
  Object.assign(d.style, { left: a.x + 'px', top: a.y + 'px', width: a.w + 'px', height: a.h + 'px', background: C.hex });
  fx.appendChild(d);
  const lift = Math.min(a.y, b.y) - a.y - a.h * 1.4;
  const anim = d.animate([
    { transform: 'translate(0,0) scale(1)', opacity: 1 },
    { transform: `translate(${(b.x - a.x) / 2}px, ${lift}px) scale(.55)`, opacity: 1, offset: 0.45 },
    { transform: `translate(${b.x - a.x}px, ${b.y - a.y}px) scale(${b.w / a.w}, ${b.h / a.h})`, opacity: 0.2 },
  ], { duration: 260, easing: 'ease-in-out' });
  anim.onfinish = anim.oncancel = () => d.remove();
}

// ---------- layout ----------
// Cards keep a third of the width each. The board is three rows: the
// preparation glasses on the counter, the front bottles, the bottles waiting
// behind them (smaller, fully visible in V3). Bottle size = the biggest
// that fits the space left.
function layout() {
  const sharedWorktop = save.boardView === 'v2';
  const personal = save.boardView === 'v3';
  document.body.dataset.boardView = save.boardView;
  placePreparationGlasses();
  $('#prepTag').textContent = sharedWorktop ? 'KARIŞTIRMA TEZGÂHI' : P.THEMES[G.L.theme].prepTag;
  const app = $('#app');
  const W = app.clientWidth, H = app.clientHeight;
  const gutter = 16, gap = 10;
  const cw = Math.min(150, Math.floor((W - 2 * gutter - 2 * gap) / 3));
  const fixed = 74;                                    // name + timer + paddings
  const ph = personal ? Math.max(40, Math.min(80, H * 0.095)) : Math.max(60, Math.min(cw * 1.0, H * 0.27 - fixed));
  app.style.setProperty('--cw', cw + 'px');
  app.style.setProperty('--ph', ph + 'px');
  const cupW = Math.max(28, Math.min(cw * 0.55, H * 0.072));
  app.style.setProperty('--customer-cup-w', cupW + 'px');
  app.style.setProperty('--customer-cup-h', Math.round(cupW * A.BOTTLE.h / A.BOTTLE.w) + 'px');
  $('.work-caption').textContent = personal ? 'ŞİŞELER ARASINDA DA AKTAR' : 'SEÇ · AKTAR · HAZIRLA';

  // the board gets whatever height the flex layout leaves it (measured, so
  // phone browser bars, safe areas and fonts are already accounted for)
  const pad = 12;
  const cols = Math.max(G.lanes.length, G.preps.length);
  const availW = W - 2 * gutter - 2 * pad;
  const wrapH = $('#boardWrap').clientHeight - (personal ? 8 : 0);
  const ratio = A.BOTTLE.h / A.BOTTLE.w;
  const cupsOnCards = personal && !prepsEl.children.length;
  const extra = (cupsOnCards ? 56 : sharedWorktop || personal ? 98 : 74) + (personal ? 12 : 0);
  const backShow = personal ? 1 : BACK_SHOW;
  const rows = BACK_SCALE * backShow + 1 + (cupsOnCards ? 0 : PREP_SCALE);
  const panel = $('#boardPanel'), root = panel.style;
  const apply = bw => {
    const bh = Math.round(bw * ratio);
    root.setProperty('--bw', bw + 'px');
    root.setProperty('--bh', bh + 'px');
    root.setProperty('--sw', Math.floor(Math.min(availW / cols, bw * 1.5)) + 'px');
  };
  root.setProperty('--bs', BACK_SCALE);
  root.setProperty('--bv', backShow);
  root.setProperty('--ps', PREP_SCALE);
  root.setProperty('--cols', cols);
  let bw = Math.max(30, Math.floor(Math.min(112, availW / cols * 0.74, (wrapH - extra) / rows / ratio)));
  apply(bw);
  // the estimate can be off by a few pixels: shrink until the panel really fits
  for (let k = 0; k < 20 && panel.offsetHeight > wrapH && bw > 30; k++) apply(bw -= 2);
  const appRect = app.getBoundingClientRect(), counter = $('#counter').getBoundingClientRect();
  // A separate effect layer, aligned to the play area even on wide screens.
  const feedbackTop = personal ? panel.getBoundingClientRect().top + 24 : counter.top + 26;
  Object.assign($('#serveFeedback').style, { left: appRect.left + 'px', width: appRect.width + 'px', top: feedbackTop + 'px' });
}
window.addEventListener('resize', () => { if (G) layout(); });
// Phone browsers / in-app web views can change the visible height without a
// window resize (toolbars, late sizing), and late fonts or art can make the
// header or the cards taller: whenever the board's space changes, lay out again.
if (window.ResizeObserver) {
  let last = '';
  new ResizeObserver(() => {
    const k = $('#app').clientWidth + 'x' + $('#boardWrap').clientHeight;
    if (G && k !== last) { last = k; layout(); }
  }).observe($('#boardWrap'));
}
if (window.visualViewport) visualViewport.addEventListener('resize', () => { if (G) layout(); });
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
  const bottles = L.lanes.reduce((n, lane) => n + lane.length, 0);
  return `<div class="facts"><span><b>${bottles}</b> şişe</span><span><b>${L.prepCount}</b> bardak</span>` +
    `<span><b>${colors.size}</b> renk</span><span><b>${L.orders.length}</b> sipariş</span>` +
    `<span><b>${patienceRange(L)}</b> sn sabır</span></div>`;
}

function showPause() {
  const views = Object.entries(BOARD_VIEWS).map(([view, label]) =>
    `<button class="marks-mode" data-board-view="${view}" aria-pressed="${save.boardView === view}">` +
    `<b>${view.toUpperCase()}</b><span>${label}</span></button>`).join('');
  const modes = Object.entries(MARK_MODES).map(([mode, label]) =>
    `<button class="marks-mode" data-marks-mode="${mode}" aria-pressed="${save.marksMode === mode}"${save.marks ? '' : ' disabled'}>` +
    `<b>${mode.toUpperCase()}</b><span>${label}</span></button>`).join('');
  showPanel(`<div class="eyebrow">DURAKLATILDI</div><h2>Bölüm ${G.L.levelOrder + 1}</h2>` +
    (G.L.name ? `<p>${G.L.name}</p>` : '') + levelFacts(G.L) +
    `<div class="settings-label">TEZGÂH GÖRÜNÜMÜ</div>` +
    `<div class="board-views" role="group" aria-label="Tezgâh görünümü">${views}</div>` +
    `<button class="switch${save.marks ? ' on' : ''}" id="marksSwitch" role="switch" aria-checked="${save.marks}">` +
    `<span>Eşleşen katmanları işaretle</span><i></i></button>` +
    `<div class="marks-modes" role="group" aria-label="Eşleşmelerin gösterileceği şişeler">${modes}</div>`, [
    ['Devam et', () => pause(false), 'go'],
    ['Yeniden başlat', () => { hidePanel(); startLevel(G.L.levelOrder); }],
    ['Bölümler', showLevels],
    ...(window.GAME_HOME ? [['Ana Menü', window.GAME_HOME]] : []),   // set by the combined page (../cafe_sort)
  ]);
  panel.querySelectorAll('[data-board-view]').forEach(button => button.addEventListener('click', () => {
    save.boardView = button.dataset.boardView;
    writeSave();
    layout();
    renderAll();
    panel.querySelectorAll('[data-board-view]').forEach(option =>
      option.setAttribute('aria-pressed', String(option.dataset.boardView === save.boardView)));
  }));
  $('#marksSwitch').addEventListener('click', () => {
    save.marks = !save.marks; writeSave();
    renderAll();
    showPause();
  });
  panel.querySelectorAll('[data-marks-mode]').forEach(button => button.addEventListener('click', () => {
    save.marksMode = button.dataset.marksMode;
    writeSave();
    renderAll();
    panel.querySelectorAll('[data-marks-mode]').forEach(option =>
      option.setAttribute('aria-pressed', String(option.dataset.marksMode === save.marksMode)));
  }));
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
    const msg = status === 'stuck' ? 'Hiç hamle kalmadı.' : 'Üç müşteri beklemekten sıkılıp gitti.';
    showPanel(`${art}<div class="eyebrow">BÖLÜM ${L.levelOrder + 1}</div><h2>Bar kapandı</h2><p>${msg}</p>`,
      [['Yeniden dene', () => startLevel(L.levelOrder), 'go'], ['Bölümler', showLevels]], 'lose');
  }
}

function showLevels() {
  // every level can be picked here (prototype: no locks)
  const cells = LEVELS.map(l => {
    const coffee = l.theme === 'coffee';
    const cls = [G && l.levelOrder === G.L.levelOrder ? 'cur' : '', l.difficulty || '', coffee ? 'coffee' : ''].join(' ');
    return `<button data-o="${l.levelOrder}" class="${cls}"${coffee ? ' aria-label="Bölüm ' + (l.levelOrder + 1) + ', kahve"' : ''}>` +
      `${l.levelOrder + 1}<small>${l.orders.length}${coffee ? '☕' : '🍹'}</small></button>`;
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

// Test hook (tools/playtest.js): state snapshot, start/play, clock steps, a glass setter.
window.FlowGame = {
  state: () => G && JSON.parse(JSON.stringify({
    levelOrder: G.L.levelOrder, status: G.status, hearts: G.hearts, served: G.served, total: G.total,
    coins: G.coins, wallet: save.coins, selected: G.selected, combo: G.combo,
    vessels: G.vessels.map(b => ({ id: b.id, prep: b.prep, layers: b.layers, phase: b.phase, gone: !!b.gone, ptr: b.ptr })),
    queue: G.queue.map(o => o.uid),
    slots: G.slots.map((s, i) => ({ state: s.state, uid: s.order ? s.order.uid : null, left: s.left, pos: i })),
    matches: matches(),
  })),
  start: o => { hidePanel(); startLevel(o); },
  play: () => { hidePanel(); G.paused = false; pauseServeFeedback(false); autoServe(); renderAll(); },
  step: dt => step(dt),
  // put layers straight into a vessel (to test recipe matching), then let auto-serve look
  setVessel: (i, layers) => { G.vessels[i].layers = layers.slice(); autoServe(); renderAll(); },
};

A.load(1500).then(boot);
})();
