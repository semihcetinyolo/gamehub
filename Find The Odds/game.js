/* Find the Odds
 * 2D stickers, physics pile (behaves like a 3D heap). Multiple levels.
 * Tap an ODD sticker -> it flies into a slot; fill every slot to win, then Next Level.
 * Tap a real sticker -> wrong: a red X pops, the sticker shakes, and you lose a heart.
 */
const { Engine, Runner, Composite, Bodies, Body, Query, Events, Sleeping } = Matter;

// ---- levels ------------------------------------------------------------
// window.LEVELS comes from levels-data.js: [{ name, odds:[src...], reals:[src...] }]
const LEVELS = window.LEVELS || [];
let levelIndex = 0;
let level = LEVELS[0];

const FILL_COVERAGE = 0.67;   // fill the bin this full; reals are duplicated to reach it
const SPRITE_SCALE = 1.32;    // sprite box scale (sticker art has transparent padding)

function buildDeck() {
  const deck = [];
  level.odds.forEach((src, i) => deck.push({ type: 'fake', id: 'o' + i, src }));
  level.reals.forEach((src, i) => deck.push({ type: 'real', id: 'r' + i, src }));
  // duplicate reals (cycling through them) until the playfield is full
  const target = fillCount();
  for (let d = 0; deck.length < target && level.reals.length; d++) {
    deck.push({ type: 'real', id: 'rd' + d, src: level.reals[d % level.reals.length] });
  }
  return deck;
}
const oddTotal = () => level.odds.length;

// deterministic-ish shuffle (no Math.random restrictions here, but keep it simple)
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rand = (lo, hi) => lo + Math.random() * (hi - lo);

// ---- DOM ---------------------------------------------------------------
const stage = document.getElementById('stage');
const playfield = document.getElementById('playfield');
const stickersLayer = document.getElementById('stickers');
const flyLayer = document.getElementById('fly');
const trayEl = document.getElementById('tray');
const winEl = document.getElementById('win');
const failEl = document.getElementById('fail');
const heartsEl = document.getElementById('hearts');
const hintBtn = document.getElementById('hintBtn');
const nextBtn = document.getElementById('nextBtn');
const levelNameEl = document.getElementById('levelName');
const oddCountEl = document.getElementById('oddCount');
const oddNumEl = document.getElementById('oddNum');

function updateOddCount() {
  oddNumEl.textContent = (oddTotal() - fakesLeft) + '/' + oddTotal();
  oddCountEl.classList.remove('bump');
  void oddCountEl.offsetWidth;
  oddCountEl.classList.add('bump');
}

// ---- engine ------------------------------------------------------------
let engine, runner, world;
let W = 0, H = 0, floorY = 0;
let baseR = 28, baseS = 80;  // base body radius / sprite box (each item is randomized around this)

// inset of the visual bin (matches .playfield in CSS)
const PAD_X = 10, PAD_TOP = 6, RADIUS = 22;

// each item gets a stable random size (75%–125% of base)
function itemRadius(item) {
  if (item._r == null) item._r = clamp(Math.round(baseR * rand(0.75, 1.25)), 14, 64);
  return item._r;
}
let recs = [];               // all live sticker records
let slots = [];              // one slot per odd item to find
let fakesLeft = 0;
let spawnTimer = null;

const MAX_LIVES = 3;
let lives = MAX_LIVES;       // hearts; a wrong tap costs one
let hearts = [];
let locked = false;          // ignore taps during win/fail transitions

function preloadImages(deck) {
  deck.forEach(d => { const im = new Image(); im.src = d.src; });
}

let trayH = 92;
let binBottom = 0; // y where the bin visually ends (top of tray)

function measure() {
  const r = stage.getBoundingClientRect();
  W = r.width;
  H = r.height;
  trayH = trayEl.getBoundingClientRect().height || 92;
  binBottom = H - trayH;
}

function buildWalls() {
  // rest the pile a little above the tray so the holders stay visible
  floorY = binBottom - Math.round(baseS * 0.42);
  // clip the pile to the rounded bin so nothing spills outside the play area
  stickersLayer.style.clipPath =
    `inset(${PAD_TOP}px ${PAD_X}px ${trayH}px ${PAD_X}px round ${RADIUS}px)`;

  const t = 200; // thick walls so nothing tunnels out
  const opts = { isStatic: true, restitution: 0.0, friction: 0.6 };
  Composite.add(world, [
    Bodies.rectangle(W / 2, floorY + t / 2, W + t * 2, t, opts),                 // floor
    Bodies.rectangle(PAD_X - t / 2, H / 2, t, H * 3, opts),                       // left wall
    Bodies.rectangle(W - PAD_X + t / 2, H / 2, t, H * 3, opts),                   // right wall
  ]);
}

const TRAY_GAP = 6, TRAY_PAD_X = 12, MAX_PER_ROW = 10;

// slot layout for the current odd count: up to MAX_PER_ROW per row, wraps to rows
function trayLayout() {
  const n = oddTotal();
  const perRow = Math.min(n, MAX_PER_ROW);
  const rows = Math.ceil(n / perRow);
  const avail = (stage.getBoundingClientRect().width || 400) - TRAY_PAD_X * 2;
  const slotW = clamp(Math.floor((avail - (perRow - 1) * TRAY_GAP) / perRow), 22, 70);
  return { n, perRow, rows, slotW };
}

// tray grows taller when the slots need a second row (keeps --tray-h in sync)
function applyTrayHeight() {
  const { rows, slotW } = trayLayout();
  const h = rows * slotW + (rows - 1) * TRAY_GAP + 22; // + vertical padding
  document.documentElement.style.setProperty('--tray-h', Math.max(92, Math.round(h)) + 'px');
}

function buildTray() {
  const { slotW } = trayLayout();
  trayEl.style.gap = TRAY_GAP + 'px';
  trayEl.innerHTML = '';
  slots = [];
  for (let i = 0; i < oddTotal(); i++) {        // one slot per odd item to find
    const el = document.createElement('div');
    el.className = 'slot';
    el.style.flex = '0 0 ' + slotW + 'px';
    el.style.width = slotW + 'px';
    trayEl.appendChild(el);
    slots.push({ el, item: null });
  }
}

function buildHearts() {
  heartsEl.innerHTML = '';
  hearts = [];
  for (let i = 0; i < MAX_LIVES; i++) {
    const h = document.createElement('span');
    h.className = 'heart';
    h.textContent = '❤️';
    heartsEl.appendChild(h);
    hearts.push(h);
  }
}

// a wrong tap costs a heart; running out fails the level
function loseLife() {
  if (locked || lives <= 0) return;
  lives--;
  if (hearts[lives]) hearts[lives].classList.add('lost');
  if (lives <= 0) failLevel();
}

function failLevel() {
  locked = true;
  failEl.classList.add('show');
  setTimeout(() => { computeSizes(); reset(); }, 1200);  // auto-restart
}

// hint: instantly find one odd item
function useHint() {
  if (locked) return;
  const fake = recs.find(r => r.item.type === 'fake' && r.state === 'pile');
  if (fake) collectFake(fake, fake.body.position);
}

// create one sticker as a physics body + DOM element
function createSticker(item, x, y, vy = 0) {
  const r = itemRadius(item);
  const s = Math.round(r * 2 * SPRITE_SCALE);  // sprite box (sticker has transparent padding)
  const body = Bodies.circle(x, y, r, {
    restitution: 0.02,
    friction: 0.7,
    frictionStatic: 1,
    density: 0.0014,
    angle: rand(-0.5, 0.5),
  });
  Body.setVelocity(body, { x: rand(-0.3, 0.3), y: vy });
  Body.setAngularVelocity(body, rand(-0.04, 0.04));
  Composite.add(world, body);

  const el = document.createElement('div');
  el.className = 'sticker';
  el.style.setProperty('--d', s + 'px');
  const img = document.createElement('img');
  img.src = item.src;
  img.draggable = false;
  el.appendChild(img);
  stickersLayer.appendChild(el);

  const rec = { item, body, el, state: 'pile', r, s, _z: 0, _asleep: false };
  body.plugin = { rec };
  recs.push(rec);
  wakeAll();        // let the pile react to the new arrival
  return rec;
}

// wake every resting sticker so the pile re-settles after a change
function wakeAll() {
  for (const rc of recs) if (rc.state === 'pile') Sleeping.set(rc.body, false);
}

// stagger the fill so stickers rain into the bin
function startFill(deck) {
  let i = 0;
  const step = () => {
    if (i >= deck.length) { spawnTimer = null; return; }
    const item = deck[i++];
    const r = itemRadius(item);
    const x = clamp(rand(r + 14, W - r - 14), PAD_X + r, W - PAD_X - r);
    const y = -r - rand(8, 90);
    createSticker(item, x, y);
    spawnTimer = setTimeout(step, 26);
  };
  step();
}

// ---- render: sync DOM to physics each tick ----------------------------
function onAfterUpdate() {
  for (const rec of recs) {
    if (rec.state !== 'pile') continue;
    const b = rec.body;
    // a resting (sleeping) sticker is positioned once, then left alone —
    // this is what kills the per-frame jitter/flicker
    if (b.isSleeping && rec._asleep) continue;
    const p = b.position;
    rec.el.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${b.angle}rad)`;
    // quantize the depth so micro-movements don't reshuffle the stack
    const z = (Math.round(p.y / 6) + 2000) | 0; // front (lower) on top
    if (z !== rec._z) { rec._z = z; rec.el.style.zIndex = z; }
    rec._asleep = b.isSleeping;
  }
}

// ---- interaction: tap the pile ----------------------------------------
function onStagePointerDown(e) {
  if (locked) return;
  const r = stickersLayer.getBoundingClientRect();
  const point = { x: e.clientX - r.left, y: e.clientY - r.top };
  // only the bin region (above the tray) reacts to pile taps
  if (point.y > floorY) return;
  const bodies = recs.filter(rc => rc.state === 'pile').map(rc => rc.body);
  const hits = Query.point(bodies, point);
  if (!hits.length) return;
  hits.sort((a, b) => b.position.y - a.position.y); // front-most first
  const rec = hits[0].plugin.rec;
  if (rec.item.type === 'fake') collectFake(rec, point); // correct! collect it
  else wrongTap(rec, point);                             // wrong — it's a real sport item
}

// found an odd one -> it flies into the next empty slot
function collectFake(rec, point) {
  const slot = slots.find(s => !s.item);
  if (!slot) return;

  rec.state = 'flying';
  Composite.remove(world, rec.body);
  wakeAll();                    // pile settles into the gap
  slot.item = rec;
  flyLayer.appendChild(rec.el); // move out of the clipped bin layer

  // happy little spark where it was picked (left/top so the scale animation is free)
  const sp = document.createElement('div');
  sp.className = 'spark';
  sp.style.left = point.x + 'px';
  sp.style.top = point.y + 'px';
  flyLayer.appendChild(sp);
  setTimeout(() => sp.remove(), 420);

  const sRect = stage.getBoundingClientRect();
  const slRect = slot.el.getBoundingClientRect();
  const tx = slRect.left - sRect.left + slRect.width / 2;
  const ty = slRect.top - sRect.top + slRect.height / 2;
  const scale = (slRect.width * 0.86) / rec.s;

  rec.el.classList.add('flying');
  rec.el.style.zIndex = 6000;
  requestAnimationFrame(() => {
    rec.el.style.transform =
      `translate(${tx}px, ${ty}px) rotate(0rad) scale(${scale})`;
  });
  const done = () => {
    rec.state = 'collected';
    slot.el.classList.add('filled');
    rec.el.removeEventListener('transitionend', done);
  };
  rec.el.addEventListener('transitionend', done);

  fakesLeft--;
  updateOddCount();
  if (fakesLeft <= 0) setTimeout(showWin, 500);
}

// tapped a real sport sticker -> wrong: lose a heart, flash a red X and shake it
function wrongTap(rec, point) {
  loseLife();
  rec.el.classList.remove('shaking');
  void rec.el.offsetWidth;        // restart the animation even on rapid taps
  rec.el.classList.add('shaking');
  rec.el.addEventListener('animationend', () => rec.el.classList.remove('shaking'), { once: true });

  const x = document.createElement('div');
  x.className = 'xmark';
  x.textContent = '✕';
  x.style.left = point.x + 'px';
  x.style.top = point.y + 'px';
  flyLayer.appendChild(x);
  setTimeout(() => x.remove(), 650);
}

// ---- win / reset -------------------------------------------------------
function showWin() { locked = true; winEl.classList.add('show'); }

function reset() {
  if (spawnTimer) { clearTimeout(spawnTimer); spawnTimer = null; }
  winEl.classList.remove('show');
  failEl.classList.remove('show');
  locked = false;
  recs.forEach(r => r.el.remove());
  recs = [];
  stickersLayer.innerHTML = '';
  flyLayer.innerHTML = '';

  if (engine) { Runner.stop(runner); Composite.clear(world, false); Engine.clear(engine); }

  engine = Engine.create({ enableSleeping: true }); // resting bodies sleep -> no jitter/flicker
  engine.gravity.y = 1;
  engine.positionIterations = 10;
  engine.velocityIterations = 8;
  world = engine.world;

  applyTrayHeight();   // size the tray (rows of slots) before measuring the bin
  measure();
  buildWalls();

  const deck = shuffle(buildDeck());
  fakesLeft = oddTotal();
  oddNumEl.textContent = '0/' + oddTotal();
  if (levelNameEl) levelNameEl.textContent = level.name;
  lives = MAX_LIVES;
  buildHearts();
  buildTray();

  Events.on(engine, 'afterUpdate', onAfterUpdate);
  runner = Runner.create();
  Runner.run(runner, engine);

  startFill(deck);
}

// ---- size the stickers to the stage so the pile fills nicely ----------
function computeSizes() {
  applyTrayHeight();   // tray height feeds into binBottom below
  measure();
  // Keep the item size CONSISTENT across levels (sized as if REF_N items fill the
  // bin) instead of shrinking with item count. buildDeck() then duplicates reals
  // up to fillCount() so every playfield is actually full.
  const REF_N = 82, sizeCoverage = 0.60;
  const r = Math.sqrt((sizeCoverage * W * binBottom) / (REF_N * Math.PI));
  baseR = clamp(Math.round(r), 18, 36);
  baseS = Math.round(baseR * 2 * SPRITE_SCALE);
}

// how many stickers are needed to fill the bin at the current item size
function fillCount() {
  return Math.round((FILL_COVERAGE * W * binBottom) / (Math.PI * baseR * baseR));
}

// load level by index, (re)build the board
function startLevel(i) {
  levelIndex = (i % LEVELS.length + LEVELS.length) % LEVELS.length;
  level = LEVELS[levelIndex];
  computeSizes();               // sets baseR, which fillCount()/buildDeck() depend on
  preloadImages(buildDeck());
  reset();
}
function nextLevel() { startLevel(levelIndex + 1); }

// ---- boot --------------------------------------------------------------
function boot() {
  if (!LEVELS.length) { console.error('No levels found (levels-data.js missing?)'); return; }
  const startIdx = LEVELS.findIndex(l => l.name === 'Bakery 2');
  startLevel(startIdx >= 0 ? startIdx : 0);

  playfield.addEventListener('pointerdown', onStagePointerDown);
  hintBtn.addEventListener('click', useHint);
  nextBtn.addEventListener('click', nextLevel);
  document.getElementById('restart').addEventListener('click', () => startLevel(levelIndex));
  document.getElementById('playAgain').addEventListener('click', nextLevel);
}

// debug hook (handy for testing in the preview console)
window.FTO = {
  get recs() { return recs; },
  get slots() { return slots; },
  collectFake, wrongTap, useHint, loseLife, nextLevel, startLevel,
  get lives() { return lives; },
  get level() { return level.name; },
  get levelIndex() { return levelIndex; },
  tapAt(point) { // simulate a tap at a stage-space point
    const bodies = recs.filter(rc => rc.state === 'pile').map(rc => rc.body);
    const hits = Query.point(bodies, point);
    if (!hits.length) return null;
    hits.sort((a, b) => b.position.y - a.position.y);
    const rec = hits[0].plugin.rec;
    if (rec.item.type === 'fake') collectFake(rec, point); else wrongTap(rec, point);
    return rec.item.id;
  },
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(boot));
} else {
  requestAnimationFrame(boot);
}
