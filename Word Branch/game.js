// Word Branch — UI layer. Game rules live in logic.js (pure); this file only renders state,
// reads the drag on the wheel and animates the results of submit().
import { DEFAULTS, validateLevel, createGame, submit, findSolutions, wordOf } from './logic.js';
import * as logic from './logic.js';      // optional newer exports (shuffleWheel) are looked up here
import * as levelData from './levels.js';

// LEVEL_SETS = { en, tr }; older levels.js only has the English LEVELS
const LEVEL_SETS = levelData.LEVEL_SETS ?? { en: levelData.LEVELS };

// URL params override these: ?level=1&rows=4&slots=5&seed=123
export const CONFIG = {
  visibleRows: DEFAULTS.visibleRows,
  wheelSlots: DEFAULTS.wheelSlots,
  seed: null,            // null = new random seed on every (re)start
  maxWheel: 380,         // px, wheel diameter cap
  minWheel: 220,
  maxTile: 40,           // px, row tile size cap
  fillStagger: 110,      // ms between letters filling a found row
  successHold: 900,      // ms the found row stays green before leaving
  hintStepMs: 480,       // ghost finger: time per hop on the hint trace
  revealChance: 0.4,     // share of rows that start with one blank already showing its letter
  revealMinBlanks: 3,    // only rows with at least this many blanks get a revealed letter
  rootPassMs: 350,       // crossing the root faster than this, roughly straight, is not an undo
  rootPassAngle: Math.PI / 4,
  praiseTiers: [         // by number of letters the player added; words come from TEXT[lang].praise
    { min: 0, size: '' },
    { min: 4, size: 'big' },
    { min: 6, size: 'huge' },
  ],
  langStorageKey: 'wordbranch.lang',
  modeStorageKey: 'wordbranch.mode',
  shuffleMs: 450,
  v2MinHeight: 200,      // px, V2 click board height range (bar + two rows of tiles)
  v2MaxHeight: 280,
};

// Every player-facing string. Words in the levels are already upper case in their own alphabet;
// this file never upper-cases text itself (CSS text-transform follows <html lang>, so Turkish İ is right).
const TEXT = {
  en: {
    level: 'Level {n}', words: 'Words', hint: 'Hint', restart: 'Restart level', settings: 'Settings',
    admin: 'Levels (admin)', close: 'Close', language: 'Language',
    langNote: 'Changing the language starts from level 1.',
    complete: 'Level complete!', allComplete: 'All levels complete!', foundAll: 'You found all {n} words.',
    next: 'Next level', fromStart: 'Play from level 1', replay: 'Replay',
    wordsFound: 'Words found: {found} of {total}',
    shuffle: 'Shuffle', version: 'Version', modeWheel: 'Wheel', modeTap: 'Tap',
    modeNote: 'Wheel: drag from the centre. Tap: tap the pieces in order.',
    undo: 'Undo', clearWord: 'Clear', parts: 'Parts', v2Missing: 'Tap mode is not available yet.',
    startError: 'Could not start level: {msg}', adminMissing: 'The admin panel is not available yet.',
    praise: [
      ['Nice!', 'Good!', 'Sweet!', 'Neat!'],
      ['Great!', 'Lovely!', 'Super!', 'Splendid!'],
      ['Awesome!', 'Brilliant!', 'Fantastic!', 'Amazing!'],
    ],
  },
  tr: {
    level: 'Bölüm {n}', words: 'Kelime', hint: 'İpucu', restart: 'Bölümü yeniden başlat', settings: 'Ayarlar',
    admin: 'Bölümler (yönetici)', close: 'Kapat', language: 'Dil',
    langNote: 'Dil değişince oyun 1. bölümden başlar.',
    complete: 'Bölüm tamamlandı!', allComplete: 'Tüm bölümler bitti!', foundAll: '{n} kelimenin hepsini buldun.',
    next: 'Sonraki bölüm', fromStart: '1. bölümden oyna', replay: 'Tekrar oyna',
    wordsFound: 'Bulunan kelime: {found} / {total}',
    shuffle: 'Karıştır', version: 'Sürüm', modeWheel: 'Çark', modeTap: 'Dokun',
    modeNote: 'Çark: ortadan sürükle. Dokun: parçalara sırayla dokun.',
    undo: 'Geri al', clearWord: 'Temizle', parts: 'Parçalar', v2Missing: 'Dokunma modu henüz hazır değil.',
    startError: 'Bölüm başlatılamadı: {msg}', adminMissing: 'Yönetici paneli henüz hazır değil.',
    praise: [
      ['Güzel!', 'İyi!', 'Hoş!', 'Oldu!'],
      ['Harika!', 'Süper!', 'Çok iyi!', 'Bravo!'],
      ['Muhteşem!', 'Mükemmel!', 'Olağanüstü!', 'Şahane!'],
    ],
  },
};

const $ = (id) => document.getElementById(id);
const els = {
  app: $('app'), top: document.querySelector('.top'), board: $('board'), live: $('live'),
  wheelArea: $('wheelArea'), wheel: $('wheel'), line: $('pathLine'), root: $('rootNode'),
  hintLine: $('hintLine'), hintTrail: $('hintTrail'), wheelTop: $('wheelTop'), hintFinger: $('hintFinger'),
  levelLabel: $('levelLabel'), counter: $('counter'), counterFill: $('counterFill'),
  foundNum: $('foundNum'), totalNum: $('totalNum'), fx: $('fx'),
  adminBtn: $('adminBtn'), settingsBtn: $('settingsBtn'), hintBtn: $('hintBtn'), restartBtn: $('restartBtn'),
  settings: $('settings'), settingsClose: $('settingsClose'), langOptions: $('langOptions'),
  modeOptions: $('modeOptions'), clickArea: $('clickArea'), shuffleBtn: $('shuffleBtn'), liveRow: $('liveRow'),
  overlay: $('overlay'), overlayTitle: $('overlayTitle'), overlayText: $('overlayText'),
  nextBtn: $('nextBtn'), replayBtn: $('replayBtn'), error: $('error'),
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

// ---------- config from URL ----------
const params = new URLSearchParams(location.search);
const intParam = (name) => {
  const v = parseInt(params.get(name), 10);
  return Number.isFinite(v) ? v : null;
};
const opts = {
  visibleRows: intParam('rows') ?? CONFIG.visibleRows,
  wheelSlots: intParam('slots') ?? CONFIG.wheelSlots,
};
let fixedSeed = intParam('seed') ?? CONFIG.seed;   // admin apply can pin or release it

// ---------- language ----------
const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* private mode etc. */ } },
};
const isLang = (l) => !!(l && LEVEL_SETS[l] && TEXT[l]);
let lang = [params.get('lang'), storage.get(CONFIG.langStorageKey), 'en'].find(isLang) ?? Object.keys(LEVEL_SETS)[0];
let LEVELS = LEVEL_SETS[lang];

// V1 = drag on the wheel (this file), V2 = tap board from v2.js (createClickBoard)
const isMode = (m) => m === 'v1' || m === 'v2';
let mode = [params.get('mode'), storage.get(CONFIG.modeStorageKey), 'v1'].find(isMode);
let board = null;            // V2 click board instance while mode === 'v2'
let v2Module = null;

function t(key, vars = {}) {
  const s = TEXT[lang]?.[key] ?? TEXT.en[key] ?? key;
  return typeof s === 'string' ? s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? '')) : s;
}

function applyTexts() {
  document.documentElement.lang = lang;
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-label]')) {
    el.setAttribute('aria-label', t(el.dataset.i18nLabel));
    el.title = t(el.dataset.i18nLabel);
  }
  for (const b of els.langOptions.querySelectorAll('[data-lang]')) {
    b.setAttribute('aria-checked', String(b.dataset.lang === lang));
    b.disabled = !isLang(b.dataset.lang);
  }
  for (const b of els.modeOptions.querySelectorAll('[data-mode]')) {
    b.setAttribute('aria-checked', String(b.dataset.mode === mode));
  }
  els.shuffleBtn.hidden = typeof logic.shuffleWheel !== 'function';
}

// Switching version keeps the running game; only the input surface changes.
async function setMode(next) {
  if (!isMode(next)) return;
  closeSettings();
  storage.set(CONFIG.modeStorageKey, next);
  if (next === mode) return;
  mode = next;
  applyTexts();
  await mountSurface();
  syncUrl();
}

async function loadV2() {
  if (v2Module) return v2Module;
  v2Module = await import('./v2.js');            // v2.js loads its own v2.css
  return v2Module;
}

// Show the wheel (V1) or a fresh click board (V2) for the current game; falls back to V1 if v2.js can't load.
// The wheel nodes are kept (hidden) in V2 too, so switching back and the removed/added diff keep working.
async function mountSurface() {
  if (!game) return;
  clearHint();
  if (drag) { drag = null; clearDragVisuals(); }
  board?.destroy();
  board = null;
  const v2 = mode === 'v2';
  els.wheelArea.hidden = v2;
  els.app.classList.toggle('mode-v2', v2);
  els.clickArea.hidden = !v2;
  clearLive();
  if (v2) {
    let mod;
    try {
      mod = await loadV2();
    } catch (err) {
      console.error(err);
      flashError(t('v2Missing'));
      mode = 'v1';
      storage.set(CONFIG.modeStorageKey, mode);
      els.wheelArea.hidden = false;
      els.app.classList.remove('mode-v2');
      els.clickArea.hidden = true;
      applyTexts();
      syncUrl();
      layout();
      return;
    }
    if (mode !== 'v2' || !game) return;   // changed again while loading
    board = mod.createClickBoard(els.clickArea, {
      root: game.root,
      getTargets: () => game.rows.map((r) => r.word),
      onLive: (word) => { clearHint(); showLive(word); },
      onSubmit: (nodeIds) => submitNodes(nodeIds),
      onWrong: () => wrong(),
      spaceAfterRoot: (word) => liveGap(word),      // open compounds: build bar shows "YER ÇEKİMİ"
      t: (key) => t(key),
    });
    board.setNodes(game.wheel);
    board.setEnabled(!game.done && !busy);
  }
  layout();
}

function flashError(msg) {
  els.error.textContent = msg;
  els.error.hidden = false;
  clearTimeout(flashError.timer);
  flashError.timer = setTimeout(() => { els.error.hidden = true; }, 2500);
}

function setLanguage(next) {
  if (!isLang(next)) return;
  closeSettings();
  storage.set(CONFIG.langStorageKey, next);
  if (next === lang) return;
  lang = next;
  LEVELS = LEVEL_SETS[lang];
  applyTexts();
  startLevel(0);
}

function openSettings() {
  if (drag) return;
  applyTexts();
  els.settings.hidden = false;
}

function closeSettings() {
  els.settings.hidden = true;
}

function levelIndexFromParam() {
  const want = intParam('level');
  if (want == null) return 0;
  const byId = LEVELS.findIndex((l) => l.id === want);
  if (byId >= 0) return byId;
  return Math.min(Math.max(want - 1, 0), LEVELS.length - 1);
}

// ---------- runtime state ----------
let levelIndex = levelIndexFromParam();
let level = null;
let game = null;
let busy = false;            // short lock while the wheel swaps nodes
let rowEls = new Map();      // rowId -> { el, tiles, ready: Promise }
let nodeEls = new Map();     // nodeId -> element
let pendingRows = new Set(); // row animations still running (level end waits for them)
let geo = { size: 340, node: 64, rootD: 100, R: 130, hitR: 38, rootHit: 56 };
let firstDragDone = false;
let currentSeed = null;      // the seed the running game was created with
let hintState = null;        // { rowId, nodeIds, raf, t0 } while a hint is on screen
let lastPraise = '';

// ---------- start / restart ----------
function startLevel(index) {
  levelIndex = (index + LEVELS.length) % LEVELS.length;
  level = LEVELS[levelIndex];
  const seed = fixedSeed ?? Math.floor(Math.random() * 2 ** 31);
  try {
    validateLevel(level, opts);
    game = createGame(level, { ...opts, seed });
  } catch (err) {
    showError(err);
    return;
  }
  currentSeed = seed;
  els.error.hidden = true;
  clearHint();

  busy = false;
  drag = null;
  pendingRows = new Set();
  els.overlay.hidden = true;
  els.levelLabel.textContent = t('level', { n: level.id ?? levelIndex + 1 });
  els.root.querySelector('span').textContent = game.root;
  els.root.classList.toggle('long', game.root.length >= 5);
  els.root.classList.toggle('pulse', !firstDragDone);
  clearLive();

  // rows
  els.board.textContent = '';
  rowEls = new Map();
  for (const row of game.rows) {
    const r = makeRow(row);
    r.el.classList.remove('hidden');
    els.board.append(r.el);
  }

  // wheel
  for (const el of nodeEls.values()) el.remove();
  nodeEls = new Map();
  layout();
  game.wheel.forEach((node, slot) => { if (node) addNodeEl(node, slot, false); });
  if (mode === 'v2' || board) mountSurface();

  updateProgress();
  syncUrl();
}

function syncUrl() {
  const p = new URLSearchParams(location.search);
  p.set('lang', lang);
  p.set('mode', mode);
  p.set('level', String(level.id ?? levelIndex + 1));
  const keep = (name, value, dflt) => (value == null || value === dflt ? p.delete(name) : p.set(name, String(value)));
  keep('rows', opts.visibleRows, DEFAULTS.visibleRows);
  keep('slots', opts.wheelSlots, DEFAULTS.wheelSlots);
  keep('seed', fixedSeed, null);
  history.replaceState(null, '', `${location.pathname}?${p}${location.hash}`);
}

function showError(err) {
  console.error(err);
  els.error.textContent = t('startError', { msg: err.message ?? err });
  els.error.hidden = false;
}

// ---------- layout ----------
function maxWordLength() {
  return Math.max(...level.words.map((w) => w.word.length));
}

function layout() {
  if (!level) return;
  // rows: one tile size for the whole level so rows line up
  const boardW = els.board.clientWidth;
  const L = maxWordLength();
  const hasOpen = level.words.some((w) => w.open);    // open compounds need room for a word gap
  const gap = L > 10 ? 3 : 4;
  const tile = Math.max(18, Math.min(CONFIG.maxTile, Math.floor((boardW - 8 - gap * (L - 1)) / (L + (hasOpen ? 0.5 : 0)))));
  const wordGap = hasOpen ? Math.round(tile * 0.5) : 0;
  const rowH = tile + 14;
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty('--tile', `${tile}px`);
  rootStyle.setProperty('--tile-gap', `${gap}px`);
  rootStyle.setProperty('--row-h', `${rowH}px`);
  rootStyle.setProperty('--row-w', `${L * tile + (L - 1) * gap + wordGap}px`);
  rootStyle.setProperty('--word-gap', `${wordGap}px`);
  els.board.style.height = `${opts.visibleRows * rowH}px`;

  // wheel: whatever height is left, capped by width
  const cs = getComputedStyle(els.app);
  const innerH = els.app.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const innerW = els.app.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const used = els.top.offsetHeight + els.counter.offsetHeight + 10 + 14 + opts.visibleRows * rowH
    + els.liveRow.offsetHeight + 6 + 8;
  const size = Math.round(Math.max(CONFIG.minWheel, Math.min(innerW, CONFIG.maxWheel, innerH - used)));
  els.wheelArea.style.height = `${size}px`;
  // V2 board: a definite height (v2.js sizes its tiles from it), capped so the spare space stays between
  // the rows and the shuffle row instead of inside the board
  const freeH = innerH - used + els.liveRow.offsetHeight - 48;
  els.clickArea.style.height = `${Math.round(Math.max(CONFIG.v2MinHeight, Math.min(CONFIG.v2MaxHeight, freeH)))}px`;

  const n = opts.wheelSlots;
  // fewer slots leave more room on the ring, so the nodes grow a little
  const few = n <= 5;
  let node = Math.min(few ? 84 : 72, Math.max(56, size * (few ? 0.23 : 0.2)));
  let R = size / 2 - node / 2 - 6;
  const chord = 2 * R * Math.sin(Math.PI / n);
  if (chord < node + 6) {                     // keep ring nodes apart on tiny wheels
    node = Math.max(48, chord - 6);
    R = size / 2 - node / 2 - 6;
  }
  const rootD = Math.min(size * 0.3, (R - node / 2) * 2 - 16);
  geo = {
    size, node, rootD, R,
    // generous, but a straight swipe between two nodes must not clip the node between them
    hitR: Math.min(node / 2 + 8, (2 * R * Math.sin(Math.PI / n)) / 2 - 2, 0.9 * R * (1 - Math.cos((2 * Math.PI) / n))),
    rootHit: rootD / 2 + 10,
  };
  els.wheel.style.setProperty('--wheel', `${size}px`);
  els.wheel.style.setProperty('--node', `${node}px`);
  els.wheel.style.setProperty('--root', `${rootD}px`);
  for (const svg of els.wheel.querySelectorAll('svg')) svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  placeEl(els.root, size / 2, size / 2);
  for (const [id, el] of nodeEls) {
    const p = slotPos(Number(el.dataset.slot));
    placeEl(el, p.x, p.y);
  }
}

function slotPos(slot) {
  const a = -Math.PI / 2 + (2 * Math.PI * slot) / opts.wheelSlots;
  return { x: geo.size / 2 + geo.R * Math.cos(a), y: geo.size / 2 + geo.R * Math.sin(a) };
}

function placeEl(el, x, y) {
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}

// ---------- open compounds ----------
// Words such as YERÇEKİMİ are stored without the space and flagged open. Rows carry `open` (copied by logic);
// the level entry is the fallback.
function isOpenWord(word) {
  return !!level?.words.find((w) => w.word === word)?.open;
}

function isOpenRow(row) {
  return row.open ?? isOpenWord(row.word);
}

// The live word gets a space after the root only once every visible target it can still become is open,
// so the gap never gives away which word is meant.
function liveGap(word) {
  if (!game || word.length <= game.root.length) return false;
  const matches = game.rows.filter((r) => r.word.startsWith(word));
  return matches.length > 0 && matches.every(isOpenRow);
}

// ---------- rows ----------
// Which blank (if any) starts revealed: stable for a given seed and row, so Restart replays it.
function revealedIndex(row, rootLen) {
  if (row.suffixLength < CONFIG.revealMinBlanks) return -1;
  let h = 2166136261 ^ (currentSeed ?? 0);
  for (const c of `${row.id}:${row.word}`) h = Math.imul(h ^ c.codePointAt(0), 16777619);
  h >>>= 0;
  if ((h % 1000) / 1000 >= CONFIG.revealChance) return -1;
  return rootLen + (Math.floor(h / 1000) % row.suffixLength);
}

function makeRow(row) {
  const el = document.createElement('div');
  el.className = 'row hidden';
  el.dataset.rowId = row.id;
  const tilesWrap = document.createElement('div');
  tilesWrap.className = 'tiles';
  const tiles = [];
  const rootLen = row.word.length - row.suffixLength;
  const reveal = revealedIndex(row, rootLen);
  for (let i = 0; i < row.word.length; i++) {
    const t = document.createElement('div');
    if (i < rootLen) {
      t.className = 'tile root';
      t.textContent = row.word[i];
    } else if (i === reveal) {
      t.className = 'tile blank revealed';
      t.textContent = row.word[i];
    } else {
      t.className = 'tile blank';
    }
    tiles.push(t);
    if (i === rootLen && isOpenRow(row)) {
      // open compound (YER ÇEKİMİ): a word gap between the root and the rest
      const space = document.createElement('div');
      space.className = 'word-gap';
      tilesWrap.append(space);
      el.classList.add('open');
    }
    tilesWrap.append(t);
  }
  el.append(tilesWrap);
  const r = { el, tiles, rootLen, ready: Promise.resolve() };
  rowEls.set(row.id, r);
  return r;
}

async function animateFoundRow(rowId, word, addedRow) {
  const r = rowEls.get(rowId);
  if (!r) return;
  rowEls.delete(rowId);
  await r.ready;   // the row may still be waiting to slide in

  // 1. blanks fill with letters
  for (let i = r.rootLen; i < word.length; i++) {
    const t = r.tiles[i];
    t.className = 'tile filled';
    t.textContent = word[i];
    await wait(CONFIG.fillStagger);
  }
  await wait(380);   // let the last letter finish its pop
  // 2. success: row glows, confetti and sparkles burst out of it
  r.el.classList.add('success');
  burst(r.el);
  await wait(CONFIG.successHold);
  // 3. fade out, then collapse so the rows below slide up
  r.el.classList.add('leaving');
  await wait(420);
  r.el.style.height = `${r.el.offsetHeight}px`;
  r.el.getBoundingClientRect();
  r.el.style.height = '';
  r.el.classList.add('collapse');
  await wait(400);
  r.el.remove();

  // 4. the next queued target appears at the bottom
  if (addedRow) {
    addedRow.el.classList.add('entering');
    addedRow.el.classList.remove('hidden');
    await nextFrame();
    addedRow.el.classList.remove('entering');
    await wait(320);
  }
}

// ---------- wheel nodes ----------
function addNodeEl(node, slot, animate) {
  const el = document.createElement('div');
  el.className = 'node ring' + (node.text.length >= 3 ? ' len3' : '') + (animate ? ' in' : '');
  el.dataset.id = node.id;
  el.dataset.slot = String(slot);
  el.textContent = node.text;
  const p = slotPos(slot);
  placeEl(el, p.x, p.y);
  els.wheel.append(el);
  nodeEls.set(node.id, el);
  if (animate) el.addEventListener('animationend', () => el.classList.remove('in'), { once: true });
}

function removeNodeEl(id) {
  const el = nodeEls.get(id);
  if (!el) return;
  nodeEls.delete(id);
  el.classList.remove('selected', 'hinted');
  el.querySelector('.badge')?.remove();
  el.classList.add('out');
  setTimeout(() => el.remove(), 320);
}

// ---------- drag input ----------
let drag = null; // { pointerId, sel: [nodeId], hover: key|null, last: {x,y} }

function localPoint(e) {
  const rect = els.wheel.getBoundingClientRect();
  // the wheel may be mid-shake; use its untransformed box
  const scale = rect.width / geo.size || 1;
  return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };
}

function hitTest(p, rootRadius) {
  const c = geo.size / 2;
  if (Math.hypot(p.x - c, p.y - c) <= rootRadius) return 'root';
  let best = null, bestD = Infinity;
  game.wheel.forEach((node, slot) => {
    if (!node) return;
    const q = slotPos(slot);
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d <= geo.hitR && d < bestD) { best = node.id; bestD = d; }
  });
  return best;
}

function onPointerDown(e) {
  if (drag || busy || !game || game.done) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  const p = localPoint(e);
  if (hitTest(p, geo.rootHit) !== 'root') return;   // a drag must start on the root
  e.preventDefault();
  try { els.wheel.setPointerCapture(e.pointerId); } catch { /* synthetic events have no capture */ }
  drag = { pointerId: e.pointerId, sel: [], hover: 'root', last: p, rootUndo: null };
  clearHint();
  if (!firstDragDone) {
    firstDragDone = true;
    els.root.classList.remove('pulse');
  }
  els.root.classList.add('selected');
  els.wheel.classList.remove('shake', 'bad');
  renderDrag(p);
}

function onPointerMove(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  e.preventDefault();
  const p = localPoint(e);
  // walk the segment in small steps so a fast swipe can't skip a node
  const from = drag.last;
  const steps = Math.max(1, Math.ceil(Math.hypot(p.x - from.x, p.y - from.y) / 6));
  for (let i = 1; i <= steps; i++) {
    const q = { x: from.x + ((p.x - from.x) * i) / steps, y: from.y + ((p.y - from.y) * i) / steps };
    const key = hitTest(q, geo.rootD * 0.42);   // a bit inside the root's edge, so grazing it is not an undo
    if (key !== drag.hover) {
      if (drag.hover === 'root') leaveRoot(q);
      drag.hover = key;
      if (key) enter(key, q);
    }
  }
  drag.last = p;
  renderDrag(p);
}

function enter(key, at) {
  const sel = drag.sel;
  if (key === 'root') {
    if (sel.length === 1) {                                  // back to the root: undo the only pick
      drag.rootUndo = { id: sel.pop(), t: performance.now(), at };
    }
  } else if (sel.length >= 2 && key === sel[sel.length - 2]) {
    sel.pop();                                               // back onto the previous node: undo
  } else if (!sel.includes(key)) {
    sel.push(key);
  }
}

// The root sits in the middle of the ring, so a quick straight swipe from one node to the far side
// crosses it. If the finger leaves the root soon, on the far side and still heading the same way,
// it was a pass through, not an undo: give the pick back.
function leaveRoot(exit) {
  const u = drag.rootUndo;
  drag.rootUndo = null;
  if (!u || drag.sel.length || performance.now() - u.t > CONFIG.rootPassMs) return;
  const el = nodeEls.get(u.id);
  if (!el) return;
  const from = slotPos(Number(el.dataset.slot));
  const inn = u.at;
  if (Math.hypot(exit.x - inn.x, exit.y - inn.y) < 4) return;   // left where it came in: turned back
  const a = Math.atan2(inn.y - from.y, inn.x - from.x);  // heading when entering the root
  const b = Math.atan2(exit.y - inn.y, exit.x - inn.x);  // heading across it
  let diff = Math.abs(a - b) % (2 * Math.PI);
  if (diff > Math.PI) diff = 2 * Math.PI - diff;
  if (diff < CONFIG.rootPassAngle) drag.sel.push(u.id);
}

function renderDrag(finger) {
  const sel = drag ? drag.sel : [];
  for (const [id, el] of nodeEls) el.classList.toggle('selected', sel.includes(id));
  const c = geo.size / 2;
  const pts = [[c, c]];
  for (const id of sel) {
    const el = nodeEls.get(id);
    const q = slotPos(Number(el.dataset.slot));
    pts.push([q.x, q.y]);
  }
  if (finger) pts.push([finger.x, finger.y]);
  els.line.setAttribute('points', pts.map((q) => q.map((v) => v.toFixed(1)).join(',')).join(' '));
  showLive(wordOf(game, sel));
}

function clearDragVisuals() {
  for (const el of nodeEls.values()) el.classList.remove('selected');
  els.root.classList.remove('selected');
  els.line.setAttribute('points', '');
}

function onPointerUp(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const sel = drag.sel;
  drag = null;
  clearDragVisuals();
  if (e.type === 'pointercancel' || sel.length === 0) {
    clearLive();
    return;
  }
  submitNodes(sel);
}

// Both versions submit here. Returns the logic result (V2's onSubmit hands it back to the board).
function submitNodes(nodeIds) {
  if (busy || !game || game.done) return { ok: false, reason: 'busy' };
  const { state, result } = submit(game, nodeIds);
  if (!result.ok) {
    wrong();
    return result;
  }
  game = state;
  correct(result);
  return result;
}

// ---------- results ----------
function wrong() {
  const lw = els.live.firstElementChild;
  if (lw) {
    lw.classList.add('bad');
    setTimeout(() => { if (lw.isConnected) clearLive(); }, 520);
  }
  const surface = mode === 'v2' ? els.clickArea : els.wheel;
  surface.classList.remove('shake');
  void surface.offsetWidth;
  surface.classList.add('shake');
  setTimeout(() => surface.classList.remove('shake'), 420);
}

async function correct(result) {
  busy = true;
  clearHint();
  celebrate(result);
  const lw = els.live.firstElementChild;
  if (lw) {
    lw.children[1]?.classList.toggle('gap', isOpenWord(result.word));
    lw.classList.add('good');
    setTimeout(() => { if (lw.isConnected) lw.classList.add('fade'); }, 250);
    setTimeout(() => { if (lw.isConnected && lw === els.live.firstElementChild) clearLive(); }, 700);
  }

  // rows: queue the new bottom row now (hidden) so later finds keep their order
  let addedRow = null;
  if (result.addedRowId) {
    const rowState = game.rows.find((r) => r.id === result.addedRowId);
    if (rowState) {
      addedRow = makeRow(rowState);
      els.board.append(addedRow.el);
    }
  }
  const job = animateFoundRow(result.rowId, result.word, addedRow);
  if (addedRow) addedRow.ready = job;
  pendingRows.add(job);
  job.finally(() => {
    pendingRows.delete(job);
    if (game.done && pendingRows.size === 0) levelComplete();
  });
  updateProgress(true);

  // wheel: used nodes leave, then the new ones pop into their fixed slots
  const live = new Set(game.wheel.filter(Boolean).map((n) => n.id));
  const removedIds = [...nodeEls.keys()].filter((id) => !live.has(id));   // used + anything evicted
  for (const id of removedIds) removeNodeEl(id);
  if (board) {
    board.setEnabled(false);
    board.setNodes(game.wheel, { removedIds, addedIds: [...live].filter((id) => !nodeEls.has(id)) });
  }
  await wait(260);
  game.wheel.forEach((node, slot) => {
    if (node && !nodeEls.has(node.id)) addNodeEl(node, slot, true);
  });
  await wait(120);
  busy = false;
  board?.setEnabled(!game.done);
}

function levelComplete() {
  board?.setEnabled(false);
  const last = levelIndex === LEVELS.length - 1;
  els.overlayTitle.textContent = t(last ? 'allComplete' : 'complete');
  els.overlayText.textContent = t('foundAll', { n: game.total });
  els.nextBtn.textContent = t(last ? 'fromStart' : 'next');
  els.overlay.hidden = false;
}

function updateProgress(bump = false) {
  const found = game.found.length;
  els.foundNum.textContent = String(found);
  els.totalNum.textContent = String(game.total);
  els.counter.setAttribute('aria-label', t('wordsFound', { found, total: game.total }));
  els.counterFill.style.width = `${game.total ? (found / game.total) * 100 : 0}%`;
  if (bump) {
    els.counter.classList.remove('bump');
    void els.counter.offsetWidth;
    els.counter.classList.add('bump');
  }
}

// ---------- found-word effects (short, never block input) ----------
function celebrate(result) {
  const added = result.word.length - game.root.length;
  const tierIndex = CONFIG.praiseTiers.findLastIndex((tier) => added >= tier.min);
  const tier = CONFIG.praiseTiers[tierIndex];
  const choices = t('praise')[tierIndex].filter((w) => w !== lastPraise);
  const text = choices[Math.floor(Math.random() * choices.length)];
  lastPraise = text;

  // praise word, centred in the gap between the rows and the wheel
  const boardBox = els.board.getBoundingClientRect();
  const liveBox = els.liveRow.getBoundingClientRect();   // in V2 the live pill is hidden; the row still marks the gap
  // short screens in V2 leave almost no gap: use the (otherwise empty) shuffle row instead
  const y = board && liveBox.top - boardBox.bottom < 56
    ? liveBox.top + liveBox.height / 2
    : (boardBox.bottom + liveBox.top) / 2;
  const p = document.createElement('div');
  p.className = `praise ${tier.size}`;
  p.textContent = text;
  p.style.top = `${y}px`;
  els.fx.append(p);
  p.animate([
    { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0 },
    { transform: 'translate(-50%, -50%) scale(1.15)', opacity: 1, offset: 0.25 },
    { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.45 },
    { transform: 'translate(-50%, -110%) scale(1)', opacity: 0 },
  ], { duration: 950, easing: 'ease-out' }).finished.then(() => p.remove());

  // soft glow over the screen from the found row
  const rowEl = rowEls.get(result.rowId)?.el;
  const rb = rowEl?.getBoundingClientRect();
  const glow = document.createElement('div');
  glow.className = 'screen-pulse';
  if (rb) {
    glow.style.setProperty('--px', `${rb.left + rb.width / 2}px`);
    glow.style.setProperty('--py', `${rb.top + rb.height / 2}px`);
  }
  els.fx.append(glow);
  glow.animate([{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], { duration: 450, easing: 'ease-out' })
    .finished.then(() => glow.remove());
}

function burst(rowEl) {
  const box = rowEl.querySelector('.tiles').getBoundingClientRect();
  for (let i = 0; i < 22; i++) {
    const sparkle = Math.random() < 0.35;
    const el = document.createElement('div');
    el.className = `particle ${sparkle ? 'sparkle' : 'confetti'} c${1 + Math.floor(Math.random() * 5)}`;
    if (sparkle) {
      el.textContent = '✦';
      el.style.fontSize = `${12 + Math.random() * 10}px`;
    } else {
      el.style.width = `${5 + Math.random() * 4}px`;
      el.style.height = `${8 + Math.random() * 6}px`;
    }
    const x0 = box.left + Math.random() * box.width;
    const y0 = box.top + box.height / 2;
    const a = Math.random() * Math.PI * 2;
    const d = 40 + Math.random() * 80;
    const x1 = x0 + Math.cos(a) * d;
    const y1 = y0 + Math.sin(a) * d * 0.7 - 14;
    const spin = (Math.random() - 0.5) * 540;
    els.fx.append(el);
    el.animate([
      { transform: `translate(${x0}px, ${y0}px) scale(0.3) rotate(0deg)`, opacity: 1 },
      { transform: `translate(${x1}px, ${y1}px) scale(1) rotate(${spin * 0.6}deg)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${x1}px, ${y1 + 26}px) scale(0.8) rotate(${spin}deg)`, opacity: 0 },
    ], { duration: 700 + Math.random() * 250, easing: 'cubic-bezier(.2,.8,.3,1)' }).finished.then(() => el.remove());
  }
}

// ---------- live word ----------
function showLive(word) {
  let lw = els.live.firstElementChild;
  if (!lw || lw.classList.contains('bad') || lw.classList.contains('good')) {
    els.live.textContent = '';
    lw = document.createElement('div');
    lw.className = 'live-word';
    lw.innerHTML = '<span class="lw-root"></span><span class="lw-add"></span>';
    els.live.append(lw);
  }
  const rootLen = Math.min(game.root.length, word.length);
  lw.children[0].textContent = word.slice(0, rootLen);
  lw.children[1].textContent = word.slice(rootLen);
  lw.children[1].classList.toggle('gap', liveGap(word));
}

function clearLive() {
  els.live.textContent = '';
}

// ---------- hint: highlight a whole word and trace its path ----------
function hint() {
  if (!game || game.done || busy || drag) return;
  const sols = findSolutions(game).filter((sol) => {
    const r = rowEls.get(sol.rowId);
    return r && !r.el.classList.contains('hidden') && (board || sol.nodeIds.every((id) => nodeEls.has(id)));
  });
  if (!sols.length) return;
  // pressing again replays the same word while it is still on the board
  const sol = sols.find((x) => x.rowId === hintState?.rowId) ?? sols[0];
  clearHint();
  board?.clear();
  hintState = { rowId: sol.rowId, nodeIds: sol.nodeIds, raf: 0, t0: performance.now() };
  rowEls.get(sol.rowId).el.classList.add('hinted');
  if (board) {
    board.showHint(sol.nodeIds);      // badges + pulse until the next tap (onLive clears the row glow)
    return;
  }
  sol.nodeIds.forEach((id, i) => {
    const el = nodeEls.get(id);
    el.classList.add('hinted');
    const b = document.createElement('span');
    b.className = 'badge';
    b.textContent = String(i + 1);
    el.append(b);
  });
  drawHintLine();
  hintState.raf = requestAnimationFrame(hintFrame);
}

function hintPoints() {
  const c = geo.size / 2;
  // read where the nodes are drawn right now, so the trace follows them during a shuffle
  const at = (el) => ({ x: parseFloat(el.style.left), y: parseFloat(el.style.top) });
  return [{ x: c, y: c }, ...hintState.nodeIds.map((id) => at(nodeEls.get(id)))];
}

function drawHintLine() {
  if (board) return;
  els.hintLine.setAttribute('points', hintPoints().map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' '));
}

// ghost finger loop: fade in on the root, hop through the nodes, fade out, pause, repeat
function hintFrame(now) {
  if (!hintState) return;
  const pts = hintPoints();
  const hops = pts.length - 1;
  const fadeIn = 250, travel = hops * CONFIG.hintStepMs, hold = 350, fadeOut = 250, pause = 350;
  const cycle = fadeIn + travel + hold + fadeOut + pause;
  const t = (now - hintState.t0) % cycle;
  let pos = pts[0], opacity = 1, trail = [pts[0]];
  if (t < fadeIn) {
    opacity = t / fadeIn;
  } else if (t < fadeIn + travel) {
    const k = (t - fadeIn) / CONFIG.hintStepMs;
    const i = Math.floor(k);
    const f = k - i;
    const e = f < 0.5 ? 2 * f * f : 1 - (-2 * f + 2) ** 2 / 2;   // ease in-out per hop
    pos = { x: pts[i].x + (pts[i + 1].x - pts[i].x) * e, y: pts[i].y + (pts[i + 1].y - pts[i].y) * e };
    trail = [...pts.slice(0, i + 1), pos];
  } else {
    pos = pts[hops];
    trail = pts;
    const after = t - fadeIn - travel - hold;
    opacity = after <= 0 ? 1 : Math.max(0, 1 - after / fadeOut);
  }
  els.hintFinger.setAttribute('transform', `translate(${pos.x.toFixed(1)} ${pos.y.toFixed(1)})`);
  els.hintFinger.setAttribute('opacity', opacity.toFixed(2));
  els.hintTrail.setAttribute('points', trail.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' '));
  els.hintTrail.style.opacity = String(0.8 * opacity);
  hintState.raf = requestAnimationFrame(hintFrame);
}

function clearHint() {
  if (!hintState) return;
  cancelAnimationFrame(hintState.raf);
  rowEls.get(hintState.rowId)?.el.classList.remove('hinted');
  for (const el of nodeEls.values()) {
    el.classList.remove('hinted');
    el.querySelector('.badge')?.remove();
  }
  els.hintLine.setAttribute('points', '');
  els.hintTrail.setAttribute('points', '');
  els.hintFinger.setAttribute('opacity', '0');
  hintState = null;
}

// ---------- shuffle ----------
async function shuffle() {
  if (typeof logic.shuffleWheel !== 'function' || drag || busy || !game || game.done) return;
  busy = true;
  board?.setEnabled(false);
  game = logic.shuffleWheel(game);
  els.shuffleBtn.classList.remove('spin');
  void els.shuffleBtn.offsetWidth;
  els.shuffleBtn.classList.add('spin');
  // wheel nodes glide around the ring to their new slots (hidden in V2, but kept in step for switching back)
  const moves = [];
  game.wheel.forEach((node, slot) => {
    const el = node && nodeEls.get(node.id);
    if (!el) return;
    const from = Number(el.dataset.slot);
    el.dataset.slot = String(slot);
    let d = (slot - from) % opts.wheelSlots;           // shortest way round
    if (d > opts.wheelSlots / 2) d -= opts.wheelSlots;
    if (d < -opts.wheelSlots / 2) d += opts.wheelSlots;
    moves.push({ el, from, d });
  });
  if (board) board.setNodes(game.wheel);             // the board animates tiles to their new places
  if (!board) {
    await new Promise((done) => {
      const t0 = performance.now();
      const step = (now) => {
        const k = Math.min(1, (now - t0) / CONFIG.shuffleMs);
        const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        for (const m of moves) {
          const p = slotPos(m.from + m.d * e);
          placeEl(m.el, p.x, p.y);
        }
        if (hintState) drawHintLine();
        if (k < 1) requestAnimationFrame(step); else done();
      };
      requestAnimationFrame(step);
    });
  } else {
    for (const m of moves) {
      const p = slotPos(Number(m.el.dataset.slot));
      placeEl(m.el, p.x, p.y);
    }
    await wait(CONFIG.shuffleMs);
  }
  busy = false;
  board?.setEnabled(true);
}

// ---------- admin panel (admin.js is Astra's; loaded only when the gear is tapped) ----------
async function openAdminPanel() {
  if (drag) return;
  let mod;
  try {
    mod = await import('./admin.js');
  } catch (err) {
    console.error(err);
    els.error.textContent = t('adminMissing');
    els.error.hidden = false;
    setTimeout(() => { els.error.hidden = true; }, 2500);
    return;
  }
  clearHint();
  mod.openAdmin({
    levels: LEVELS,
    currentIndex: levelIndex,
    rows: opts.visibleRows,
    slots: opts.wheelSlots,
    seed: currentSeed,
    apply: applySettings,
  });
}

// Restart with new settings. Throws (and changes nothing) if the level can't be played that way.
// seed: a number pins it (kept in the URL, Restart replays it); null/'' = fresh random seed each start.
function applySettings({ levelIndex: index = levelIndex, rows = opts.visibleRows, slots = opts.wheelSlots, seed } = {}) {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= LEVELS.length) throw new Error(`No level at index ${index}`);
  const next = { visibleRows: Number(rows), wheelSlots: Number(slots) };
  validateLevel(LEVELS[i], next);
  Object.assign(opts, next);
  if (seed !== undefined) {
    const n = seed === null || seed === '' ? NaN : Number(seed);
    fixedSeed = Number.isFinite(n) ? Math.trunc(n) : null;
  }
  startLevel(i);
  return { levelIndex, rows: opts.visibleRows, slots: opts.wheelSlots, seed: currentSeed };
}

// ---------- wiring ----------
els.wheel.addEventListener('pointerdown', onPointerDown);
els.wheel.addEventListener('pointermove', onPointerMove);
els.wheel.addEventListener('pointerup', onPointerUp);
els.wheel.addEventListener('pointercancel', onPointerUp);
els.wheel.addEventListener('contextmenu', (e) => e.preventDefault());
// block page scroll/zoom on the game only; overlays such as the admin sheet scroll normally
els.app.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());

els.hintBtn.addEventListener('click', hint);
els.adminBtn.addEventListener('click', openAdminPanel);
els.shuffleBtn.addEventListener('click', shuffle);
els.modeOptions.addEventListener('click', (e) => {
  const b = e.target.closest('[data-mode]');
  if (b) setMode(b.dataset.mode);
});
els.settingsBtn.addEventListener('click', openSettings);
els.settingsClose.addEventListener('click', closeSettings);
els.settings.addEventListener('click', (e) => { if (e.target === els.settings) closeSettings(); });
els.langOptions.addEventListener('click', (e) => {
  const b = e.target.closest('[data-lang]');
  if (b && !b.disabled) setLanguage(b.dataset.lang);
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSettings(); });
els.restartBtn.addEventListener('click', () => startLevel(levelIndex));
els.replayBtn.addEventListener('click', () => startLevel(levelIndex));
els.nextBtn.addEventListener('click', () => startLevel(levelIndex + 1));

let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (drag) { drag = null; clearDragVisuals(); clearLive(); }
    layout();
    if (hintState) drawHintLine();
  }, 80);
});

// small read-only hook for automated checks in the browser
window.__wordBranch = { get state() { return game; }, get geo() { return geo; }, get lang() { return lang; }, slotPos, apply: applySettings };

applyTexts();
startLevel(levelIndex);
