// Word Train v4 — "Ray Çiz": drag through neighbouring letter stones on a 5×6 honeycomb (Word Master
// style) to lay the rail of the missing word; lifting the finger checks it. Rules live in ../core/logic.js and the
// board builder in ./board.js; this file keeps only the board/drag state of the current turn and renders it.
import { LEVELS } from '../levels.js';
import { createRun, current, answer, useHint, rng, linkRand, GIVEN } from '../core/logic.js';
import { mountTrain } from '../core/train.js';
import { sfx } from '../core/sfx.js';
import { haptics } from '../core/haptics.js';
import { openAdmin } from '../core/admin.js';
import { openSettings, rememberMode } from '../core/settings.js';
import { openLevelEnd } from '../core/levelend.js';
import {
  buildBoard, refill, entryOffset, adjacent, rowOf, colOf, centerOf, CELLS, COLS, ROWS, GEOMETRY, DEFAULT_POLICY,
} from './board.js';

const CONFIG = {
  storagePrefix: 'wordtrain.v4.',
  scaleMax: 1,           // honeycomb scale; 1 = 80×70 px stones (astra-art geometry for a 390-wide screen)
  scaleMin: 0.62,        // ≈ 50×43 px stones; the board stays 5×6 on every screen
  trainMin: [[780, 170], [700, 150]],   // [min viewport height, px kept for the train]; else trainMinShort
  trainMinShort: 144,    // a status line (24 px) still leaves the train its two rows (≥ 120 px)
  hitRadius: 0.92,       // share of a stone's inner radius that selects; the seams between stones do not
  sampleStep: 8,         // px between interpolated samples on a fast swipe
  wrongClearMs: 250,     // the coral rail stays this long, then the selection clears
  wrongShakeMs: 180,
  // refill motion (astra-art): used stones leave, survivors slide along the flow, new stones come in from the
  // near edge (or grow in where the used ones were, in place)
  leaveMs: 110,
  slideMs: [180, 280],   // by distance
  dropMs: [220, 320],    // by distance travelled
  columnDelay: 12,       // ms per line across the flow
  appearMs: 220,         // in place: a new stone grows in where a used one left (astra-art: .86 → 1.015 → 1)
  appearDelay: 70,       // … starting while the used stone is still fading
  swapMs: 160,           // a stone whose letter had to change: its letter cross-fades while the column moves
  phraseHoldMs: 900,     // a status message about the found phrase stays at least this long
  pathPreviewMs: 1800,   // admin "Yolu göster"
};

const TEXT = {
  level: (n) => `Bölüm ${n}`,
  tip: 'Komşu harflerden ray çiz',
  short: (n) => `${n} harfi birbirine bağla`,
  wrong: 'Bu ipucuna uymadı. Bir daha dene.',
  mute: 'Sesi kapat', unmute: 'Sesi aç',
  levelLabel: (n, title, done) => `Bölüm ${n}: ${title}${done ? ', tamamlandı' : ''}`,
  answerIs: (w) => `Cevap: ${w}`,
  startError: (msg) => `Bölüm başlatılamadı: ${msg}`,
  cell: (letter, order, hint) => letter + (order ? `, ${order}. seçilen` : '') + (hint ? `, ipucu ${hint}` : ''),
};

const $ = (id) => document.getElementById(id);
const els = {
  train: $('train'), levelNum: $('levelNum'), levelTitle: $('levelTitle'),
  progress: $('progress'), foundNum: $('foundNum'), totalNum: $('totalNum'),
  clueCard: $('clueCard'), clue: $('clue'), clueClose: $('clueClose'), status: $('status'),
  boardWrap: $('boardWrap'), board: $('board'),
  hintRail: $('hintRail'), playerRail: $('playerRail'), fxSvg: $('fxSvg'), previewLine: $('previewLine'),
  hintBtn: $('hintBtn'), restartBtn: $('restartBtn'), settingsBtn: $('settingsBtn'),
  levelsBtn: $('levelsBtn'), levelsSheet: $('levelsSheet'), levelsClose: $('levelsClose'), levelList: $('levelList'),
  soundBtn: $('soundBtn'), soundIcon: $('soundIcon'),
  app: $('app'), error: $('error'),
};
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

// ---------- storage (wordtrain.v4.*) ----------
const storage = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(CONFIG.storagePrefix + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(CONFIG.storagePrefix + key, JSON.stringify(value)); } catch { /* private mode */ }
  },
  remove(key) {
    try { localStorage.removeItem(CONFIG.storagePrefix + key); } catch { /* private mode */ }
  },
};
let completed = new Set(storage.get('completed', []));
let tipSeen = !!storage.get('tipSeen', false);
// refill policy (board.js); the admin sheet can switch to the other modes to compare them on the phone
const REFILL_LABELS = { mixflow: 'karışık akış', gravity: 'yerçekimi', stay: 'yerinde', mix: 'yerçekimi + yerinde', flow: '6 yönlü akış' };
let refillPolicy = REFILL_LABELS[storage.get('refill')] ? storage.get('refill') : DEFAULT_POLICY;

// ---------- run state ----------
const params = new URLSearchParams(location.search);
const seedParam = params.get('seed');
let levelIndex = 0;
let run = null;           // core state
let turn = 0;             // bumps on every new turn / level; late callbacks compare against it
let busy = false;         // input lock while a result plays out
let levelEnd = null;      // core's result station (openLevelEnd handle) after the last word
let target = null;        // current link
let wordLen = 0;
let cells = [];           // [{ id, letter, key }] by cell id; key follows a stone through refills
let nextKey = 0;
let nextMode = null;      // how the next refill moves the stones (board.js modes), chosen with the board
let solutionPath = [];
let pendingLetters = [];  // [{ el, letter }] letter swaps still waiting to show their new letter
let regen = 0;            // admin "Tahtayı yeniden üret" count for this turn
let hintPrefix = 0;       // cells of solutionPath shown by the hint (0 until the first hint, then ≥ 2)
let given = '';           // free first letter of the target ("KİTAP + K…")
let pattern = '?';        // ghost car at rest: given letter + empty slots
let selected = [];        // cell ids of the player's rail
let drag = null;          // { pointerId, last: {x, y} }
let cellEls = [];
let scale = 1;            // honeycomb scale, set by layout()
let boardRect = null;
let statusTimer = 0;
let phraseUntil = 0;
let previewTimer = 0;
let train = null;
let clueOpen = false;     // the meaning clue card is open for this turn

function levelIndexFromStart() {
  const byParam = LEVELS.findIndex((l) => String(l.id) === params.get('level'));
  if (byParam >= 0) return byParam;
  const last = LEVELS.findIndex((l) => l.id === storage.get('last'));
  return last >= 0 ? last : 0;
}

function startLevel(index) {
  levelIndex = Math.max(0, Math.min(LEVELS.length - 1, index));
  const level = LEVELS[levelIndex];
  cancelDrag();
  closeSheets();
  levelEnd?.destroy();
  levelEnd = null;
  clearTimeout(statusTimer);
  phraseUntil = 0;
  setStatus('');
  els.error.hidden = true;
  try {
    run = createRun(level, { seed: seedParam ?? Math.floor(Math.random() * 1e9) });
  } catch (err) {
    console.error(err);
    showError(TEXT.startError(err.message));
    return;
  }
  storage.set('last', level.id);
  els.levelNum.textContent = TEXT.level(levelIndex + 1);
  els.levelTitle.textContent = level.title ?? '';
  const words = [level.chain[0].word];
  const bases = [level.chain[0].base];
  cells = [];
  if (train) train.reset(words, [], bases);
  else train = mountTrain(els.train, { words, bases, sfx });
  syncUrl();
  openTurn();
}

function syncUrl() {
  const url = new URL(location.href);
  url.searchParams.set('level', String(LEVELS[levelIndex].id));
  try { history.replaceState(null, '', url); } catch { /* sandboxed iframe */ }
}

// ---------- turn ----------
// used = the stones of the word just found: the board refills by gravity; otherwise a whole new board.
function openTurn(used = null) {
  turn++;
  busy = false;
  cancelDrag();
  updateProgress();
  const cur = current(run);
  if (!cur) return;
  target = cur.target;
  wordLen = Array.from(target.word).length;
  regen = 0;
  hintPrefix = hintedCells();
  given = cur.given ?? Array.from(target.word)[0];
  pattern = cur.pattern ?? given + '_'.repeat(wordLen - 1);
  els.clue.textContent = target.hint ?? '';
  setClue(false);     // the meaning clue is the first hint of every turn
  if (!(used && cells.length ? refillBoard(used) : makeBoard())) return;
  if (!tipSeen && Date.now() >= phraseUntil) setStatus(TEXT.tip, 'tip');
  else if (Date.now() >= phraseUntil) setStatus('');
}

const aheadWord = () => run.chain[run.index + 1]?.word ?? '';

// Builds a whole new board; the same seed/level/link (and regen count) always gives the same board.
function makeBoard() {
  const rand = regen ? rng(`${run.seed}:${run.levelId}:${run.index}:r${regen}`) : linkRand(run);
  let built;
  try {
    built = buildBoard(target.word, { levelNo: levelIndex + 1, rand, firstKey: nextKey, ahead: aheadWord(), policy: refillPolicy });
  } catch (err) {
    console.error(err);
    showError(TEXT.startError(err.message));
    return false;
  }
  mountBoard(built.cells, built.nextKey, built.solutionPath, built.nextMode);
  return true;
}

function makeStone(cell) {
  const el = document.createElement('button');
  el.type = 'button';
  el.tabIndex = -1;          // played by dragging; the board is not a keyboard widget
  el.className = 'wt-hex';
  el.innerHTML = '<span class="wt-hex__letter"></span><span class="wt-hex__order" aria-hidden="true"></span>';
  el.firstChild.textContent = cell.letter;
  return el;
}

function resetBoardState() {
  selected = [];
  clearTimeout(previewTimer);
  els.board.classList.remove('is-wrong', 'is-right', 'is-preview');
}

// Replaces every stone (level start, restart, admin, the rare full reset) with a short pop-in.
function mountBoard(nextCells, keyAfter, path, modeAfter) {
  finishFx();
  cells = nextCells;
  nextKey = keyAfter;
  nextMode = modeAfter;
  solutionPath = path;
  resetBoardState();
  cellEls = cells.map(makeStone);
  els.board.querySelectorAll('.wt-hex').forEach((el) => el.remove());
  els.board.prepend(...cellEls);
  placeCells();
  if (!reducedMotion()) {
    cellEls.forEach((el, i) => el.animate([{ transform: 'scale(.6)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }],
      { duration: 110, delay: (rowOf(i) + colOf(i)) * 5, easing: 'cubic-bezier(.3,1.4,.5,1)', fill: 'backwards' }));
  }
  render();
}

// Refill after a found word (board.js picks the mode: stones flow along a hex direction, or new ones appear in
// place). The model (cells, path, hit test) is final at once; the motion only catches up, and the next
// pointerdown finishes it first (finishFx), so input never waits for it.
function refillBoard(used) {
  let r;
  try {
    r = refill({ cells, nextKey, nextMode }, used, target.word, linkRand(run), levelIndex + 1,
      { ahead: aheadWord(), policy: refillPolicy });
  } catch (err) {
    console.error(err);
    showError(TEXT.startError(err.message));
    return false;
  }
  if (r.fullReset) { mountBoard(r.board.cells, r.board.nextKey, r.solutionPath, r.board.nextMode); return true; }
  finishFx();
  const oldEl = new Map(cells.map((c, id) => [c.key, cellEls[id]]));
  const oldPos = new Map(cells.map((c, id) => [c.key, id]));
  const motion = !reducedMotion();

  // used stones leave from where they were
  for (const id of used) {
    const el = cellEls[id];
    el.setAttribute('aria-hidden', 'true');
    el.style.pointerEvents = 'none';
    const out = el.animate(motion
      ? [{ transform: 'none', opacity: 1 }, { transform: 'translateY(6px) scale(.92)', opacity: 0 }]
      : [{ opacity: 1 }, { opacity: 0 }], { duration: CONFIG.leaveMs, easing: 'ease-in', fill: 'forwards' });
    out.onfinish = () => el.remove();
  }

  cells = r.board.cells;
  nextKey = r.board.nextKey;
  nextMode = r.board.nextMode;
  solutionPath = r.solutionPath;
  resetBoardState();
  const fresh = new Set(r.newCells);
  const changed = new Set(r.changedCells);
  cellEls = cells.map((c) => oldEl.get(c.key) ?? makeStone(c));
  els.board.prepend(...cellEls.filter((el, id) => fresh.has(id)));
  placeCells();

  const yStep = GEOMETRY.yStep * scale;
  const [slideMin, slideMax] = CONFIG.slideMs;
  const [dropMin, dropMax] = CONFIG.dropMs;
  // unit vector of the flow (gravity: straight down); lines across it start one after another
  const probe = cells.map((c, id) => entryOffset(id, r.mode)).find(Boolean);
  const flow = probe ? { x: -probe.x / Math.hypot(probe.x, probe.y), y: -probe.y / Math.hypot(probe.x, probe.y) } : null;
  const across = (id) => {
    if (!flow) return 0;
    const p = centerOf(id);
    return Math.round(Math.abs(p.x * -flow.y + p.y * flow.x) / GEOMETRY.xStep);
  };
  cells.forEach((c, id) => {
    const el = cellEls[id];
    const delay = across(id) * CONFIG.columnDelay;
    if (fresh.has(id)) {
      if (!motion) { el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 100 }); return; }
      const enter = entryOffset(id, r.mode);
      if (!enter) {
        // in place: grows in where the used stone just left, like every other new stone of this turn
        el.animate([
          { transform: 'scale(.86)', opacity: 0 },
          { transform: 'scale(1.015)', opacity: 1, offset: 0.75 },
          { transform: 'scale(1)', opacity: 1 },
        ], { duration: CONFIG.appearMs, delay: CONFIG.appearDelay, easing: 'cubic-bezier(.22,.68,.3,1)', fill: 'backwards' });
        return;
      }
      const cellsAway = Math.hypot(enter.x, enter.y) / GEOMETRY.yStep;
      const fx = enter.x * scale - flow.x * 24, fy = enter.y * scale - flow.y * 24;
      const ms = dropMin + (dropMax - dropMin) * Math.min(1, (cellsAway - 1) / (ROWS - 1));
      el.animate([
        { transform: `translate(${fx}px, ${fy}px)`, opacity: 0 },
        { transform: `translate(${fx * 0.6}px, ${fy * 0.6}px)`, opacity: 1, offset: 0.25 },
        { transform: `translate(${flow.x * 2}px, ${flow.y * 2}px)`, offset: 0.88 },
        { transform: 'translate(0, 0)' },
      ], { duration: ms, delay, easing: 'ease-in', fill: 'backwards' });
      return;
    }
    const was = oldPos.get(c.key);
    if (motion && was !== id) {
      const dx = (centerOf(was).x - centerOf(id).x) * scale, dy = (centerOf(was).y - centerOf(id).y) * scale;
      const ms = Math.min(slideMax, slideMin + Math.hypot(dx, dy) / yStep * 40);
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
        { duration: ms, delay, easing: 'cubic-bezier(.2,.8,.3,1)' });
    }
    if (changed.has(id)) {
      // the guaranteed path needed this stone: no flip (that would point at the answer), the letter just
      // cross-fades while the stones around it slide and drop
      if (!motion) { el.firstChild.textContent = c.letter; return; }
      const job = { el, letter: c.letter };
      pendingLetters.push(job);
      const at = delay + slideMin * 0.5;
      el.firstChild.animate([{ opacity: 1 }, { opacity: 0 }, { opacity: 1 }], { duration: CONFIG.swapMs, delay: at });
      setTimeout(() => applyLetter(job), at + CONFIG.swapMs / 2);
    }
  });
  render();
  return true;
}

function applyLetter(job) {
  const i = pendingLetters.indexOf(job);
  if (i < 0) return;
  pendingLetters.splice(i, 1);
  job.el.firstChild.textContent = job.letter;
}

// Ends every running board animation at its final frame (a new touch must hit what it sees).
function finishFx() {
  for (const a of els.board.getAnimations({ subtree: true })) {
    try { a.finish(); } catch { a.cancel(); }
  }
  for (const job of [...pendingLetters]) applyLetter(job);
}

function render() {
  const hintIds = solutionPath.slice(0, hintPrefix);
  const wrongNow = els.board.classList.contains('is-wrong');
  const rightNow = els.board.classList.contains('is-right');
  cellEls.forEach((el, id) => {
    const order = selected.indexOf(id) + 1;
    const hint = hintIds.indexOf(id) + 1;
    el.setAttribute('aria-pressed', String(order > 0));
    el.classList.toggle('wt-hex--selected', order > 0);
    el.classList.toggle('wt-hex--wrong', order > 0 && wrongNow);
    el.classList.toggle('wt-hex--correct', order > 0 && rightNow);
    el.classList.toggle('wt-hex--hint', hint > 0 && !order);
    el.classList.toggle('v4-hex--last', order > 0 && order === selected.length);
    el.children[1].textContent = order ? String(order) : hint ? String(hint) : '';
    el.setAttribute('aria-label', TEXT.cell(cells[id].letter, order, hint));
  });
  drawRail(els.playerRail, selected);
  drawRail(els.hintRail, hintIds);
  els.playerRail.classList.toggle('wt-hex-path--wrong', wrongNow);
  els.playerRail.classList.toggle('wt-hex-path--correct', rightNow);
  const letters = selected.map((id) => cells[id].letter);
  // a rail that does not start with the given letter is allowed, only gently pointed out
  const offStart = letters.length > 0 && letters[0] !== given;
  // the ghost's first block is styled as the given letter, so an off-start rail keeps the resting pattern
  train?.setGhost(letters.length && !offStart ? letters.join('') + '_'.repeat(Math.max(0, wordLen - letters.length)) : pattern);
  els.hintBtn.disabled = busy || !!drag || !run || run.done || !hintLeft();
}

// ---------- rails (SVG) ----------
function center(id) {
  const c = centerOf(id);
  return { x: c.x * scale, y: c.y * scale };
}

// A rail (theme: cream bed under a green line) through the stone centres; one stone draws a dot.
function drawRail(svgEl, ids) {
  const pts = ids.map(center);
  if (pts.length === 1) pts.push(pts[0]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  for (const path of svgEl.children) path.setAttribute('d', d);
}

function hidePreview() {
  els.previewLine.setAttribute('visibility', 'hidden');
}

function showPreview(p) {
  if (!selected.length) { hidePreview(); return; }
  const c = center(selected.at(-1));
  els.previewLine.setAttribute('x1', c.x);
  els.previewLine.setAttribute('y1', c.y);
  els.previewLine.setAttribute('x2', p.x);
  els.previewLine.setAttribute('y2', p.y);
  els.previewLine.setAttribute('visibility', 'visible');
}

// ---------- layout ----------
function boardSize(k = scale) {
  const { w, h, xStep, yStep } = GEOMETRY;
  return { width: ((COLS - 1) * xStep + w) * k, height: ((ROWS - 1) * yStep + yStep / 2 + h) * k };
}

function placeCells() {
  const { w, h } = GEOMETRY;
  cellEls.forEach((el, id) => {
    const c = centerOf(id);
    el.style.left = `${(c.x - w / 2) * scale}px`;
    el.style.top = `${(c.y - h / 2) * scale}px`;
  });
}

// The honeycomb gets the height the train does not need: everything except the train and the board panel
// is fixed, the train keeps at least trainMin, and the board scales uniformly into the rest (and the width).
function layout() {
  const app = els.app;
  const panel = els.boardWrap;
  const ps = getComputedStyle(panel);
  const chromeX = parseFloat(ps.paddingLeft) + parseFloat(ps.paddingRight) + parseFloat(ps.borderLeftWidth) + parseFloat(ps.borderRightWidth);
  const chromeY = parseFloat(ps.paddingTop) + parseFloat(ps.paddingBottom) + parseFloat(ps.borderTopWidth) + parseFloat(ps.borderBottomWidth);
  // scrollHeight, not clientHeight: when the board is too big the column overflows (hidden) instead of growing.
  // The status line and the clue band come and go; they take their height from the train, never from the board,
  // so they do not count here (trainMin leaves room for them) and the stones keep one size.
  const gap = parseFloat(getComputedStyle(els.train.parentElement).rowGap) || 0;
  const bands = [els.status, els.clueCard].reduce((sum, el) => sum + (el.offsetHeight ? el.offsetHeight + gap : 0), 0);
  const others = Math.max(app.clientHeight, app.scrollHeight) - els.train.offsetHeight - panel.offsetHeight - bands;
  const trainMin = CONFIG.trainMin.find(([h]) => window.innerHeight >= h)?.[1] ?? CONFIG.trainMinShort;
  const unit = boardSize(1);
  const byWidth = (panel.getBoundingClientRect().width - chromeX) / unit.width;
  const byHeight = (app.clientHeight - others - trainMin - chromeY) / unit.height;
  scale = Math.max(CONFIG.scaleMin, Math.min(CONFIG.scaleMax, byWidth, byHeight));
  const { width, height } = boardSize();
  const { w, h } = GEOMETRY;
  els.board.style.width = `${width}px`;
  els.board.style.height = `${height}px`;
  els.board.style.setProperty('--wt-hex-w', `${(w * scale).toFixed(1)}px`);
  els.board.style.setProperty('--wt-hex-h', `${(h * scale).toFixed(1)}px`);
  els.board.style.setProperty('--wt-hex-font-size', `${(36 * scale).toFixed(1)}px`);
  for (const svgEl of [els.hintRail, els.playerRail, els.fxSvg]) {
    svgEl.setAttribute('viewBox', `0 0 ${width.toFixed(1)} ${height.toFixed(1)}`);
    svgEl.setAttribute('width', width.toFixed(1));
    svgEl.setAttribute('height', height.toFixed(1));
  }
  placeCells();
  render();
}

// ---------- drag ----------
function localPoint(e) {
  return { x: e.clientX - boardRect.left, y: e.clientY - boardRect.top };
}

// Stone under a board point: the nearest centre, if the point is inside that stone's inner circle.
// The seams between stones hit nothing, so a fast swipe only ever lands on whole neighbours.
function hitCell(p) {
  let best = null, bestD = Infinity;
  for (let id = 0; id < CELLS; id++) {
    const c = center(id);
    const d = Math.hypot(p.x - c.x, p.y - c.y);
    if (d < bestD) { bestD = d; best = id; }
  }
  return bestD <= (GEOMETRY.h / 2) * scale * CONFIG.hitRadius ? best : null;
}

// One sample of the finger: start, extend to an adjacent unused cell, or back up one step.
function visit(p) {
  const id = hitCell(p);
  if (id === null) return false;
  if (!selected.length) { selected.push(id); added(); return true; }
  const last = selected.at(-1);
  if (id === last) return false;
  if (selected.length >= 2 && id === selected.at(-2)) { selected.pop(); return true; }
  if (selected.includes(id) || !adjacent(last, id) || selected.length >= wordLen) return false;
  selected.push(id);
  added();
  return true;
}

function added() {
  haptics.tap();
  sfx.letter?.(selected.length - 1);
}

function onPointerDown(e) {
  if (drag || busy || !run || run.done || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
  e.preventDefault();
  finishFx();
  boardRect = els.board.getBoundingClientRect();
  clearPathPreview();
  if (!tipSeen) { tipSeen = true; storage.set('tipSeen', true); }
  if (els.status.dataset.kind !== 'phrase') setStatus('');
  drag = { pointerId: e.pointerId, last: localPoint(e) };
  try { els.board.setPointerCapture(e.pointerId); } catch { /* already released */ }
  selected = [];
  visit(drag.last);
  render();
  showPreview(drag.last);
}

function onPointerMove(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const events = e.getCoalescedEvents?.() ?? [];
  let changed = false;
  for (const ev of events.length ? events : [e]) {
    const p = localPoint(ev);
    const { x: x0, y: y0 } = drag.last;
    const steps = Math.max(1, Math.ceil(Math.hypot(p.x - x0, p.y - y0) / CONFIG.sampleStep));
    for (let s = 1; s <= steps; s++) {
      if (visit({ x: x0 + ((p.x - x0) * s) / steps, y: y0 + ((p.y - y0) * s) / steps })) changed = true;
    }
    drag.last = p;
  }
  if (changed) render();
  showPreview(drag.last);
}

function onPointerUp(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  drag = null;
  hidePreview();
  try { els.board.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
  if (selected.length === wordLen) { submit(); return; }
  if (selected.length) setStatus(TEXT.short(wordLen), 'warn');
  selected = [];
  render();
}

// pointercancel, focus loss, admin, resize: drop the attempt without counting it.
function cancelDrag() {
  if (!drag) return;
  try { els.board.releasePointerCapture(drag.pointerId); } catch { /* not captured */ }
  drag = null;
  hidePreview();
  if (!busy) selected = [];
  render();
}

function onPointerCancel(e) {
  if (drag && e.pointerId === drag.pointerId) cancelDrag();
}

// ---------- results ----------
function submit() {
  const guess = selected.map((id) => cells[id].letter).join('');
  const { state, result } = answer(run, guess);
  run = state;
  if (result.ok) correct(result);
  else wrong();
}

function wrong() {
  busy = true;
  const myTurn = turn;
  haptics.wrong();
  sfx.wrong?.();
  train.shake();
  setStatus(TEXT.wrong, 'bad');
  els.board.classList.add('is-wrong');
  if (!reducedMotion()) {
    els.board.animate([
      { transform: 'translateX(0)' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(6px)' },
      { transform: 'translateX(-3px)' }, { transform: 'translateX(0)' },
    ], { duration: CONFIG.wrongShakeMs, easing: 'ease-out' });
  }
  render();
  setTimeout(() => {
    if (turn !== myTurn) return;
    els.board.classList.remove('is-wrong');
    selected = [];
    busy = false;
    render();
  }, CONFIG.wrongClearMs);
}

function correct(result) {
  haptics.correct();
  sfx.correct?.();
  els.board.classList.add('is-right');
  setClue(false);
  setStatus('');     // the phrase itself shows on the train, over the coupled pair
  render();
  updateProgress();
  const used = selected.slice();
  fadeRail();
  // The train plays in its own queue (blocks drop into the ghost car, phrase, suffix drop, advance); the game
  // never waits for it: the board refills at once and the ghost follows the new turn when it can.
  train.addWagon(result.word, { phrase: result.phrase, base: result.base ?? target.base });
  if (result.done) {
    busy = true;
    finishLevel();
    return;
  }
  openTurn(used);
}

// The found rail lingers as a passive copy for a moment while the board refills under it.
function fadeRail() {
  if (reducedMotion()) return;
  const copy = els.playerRail.cloneNode(true);
  copy.removeAttribute('id');
  copy.classList.add('wt-hex-path--correct', 'v4-rail-ghost');
  els.board.append(copy);
  copy.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: 'ease-out', fill: 'forwards' })
    .onfinish = () => copy.remove();
}

// Level end: the train turns into core's result station at once (it takes over the train's queue: the tail
// drops, the last pair moves onto the platform, the locomotive pulls in and whistles). Its actions close it
// and then start the next level, replay this one or open the level list.
function finishLevel() {
  const level = LEVELS[levelIndex];
  completed.add(level.id);
  storage.set('completed', [...completed]);
  sfx.win?.();
  haptics.win();
  showEnd();
}

function showEnd() {
  levelEnd = openLevelEnd({
    train, level: LEVELS[levelIndex], number: levelIndex + 1, last: levelIndex === LEVELS.length - 1,
    found: run.found, mistakes: run.mistakes, hints: run.hints, sfx, inert: els.app,
    onNext: () => startLevel(levelIndex + 1),
    onReplay: () => startLevel(levelIndex),
    onLevels: openLevels,
  });
}

// ---------- hint: first the meaning clue, then the stations of the stored solution path ----------
// Core counts the given first letter as revealed; the board shows nothing until a path hint, which then
// opens the first two stations (given letter + the hinted one), one more per hint, never the last.
function hintedCells() {
  const revealed = run?.revealed ?? 0;
  return revealed > GIVEN ? Math.min(wordLen - 1, revealed) : 0;
}

function pathHintLeft() {
  return Math.max(hintPrefix, GIVEN) < wordLen - 1;
}

function hintLeft() {
  return !run?.clue || pathHintLeft();
}

function setClue(open) {
  clueOpen = open;
  els.clueCard.hidden = !open;
}

function showClue() {
  setClue(true);
  if (!reducedMotion()) {
    els.clueCard.animate([{ transform: 'translateY(-8px)', opacity: 0 }, { transform: 'none', opacity: 1 }],
      { duration: 200, easing: 'ease-out' });
  }
}

function hint() {
  if (busy || drag || !run || run.done || !hintLeft()) return;
  if (!run.clue) {
    const { state, reveal } = useHint(run, 'clue');
    if (reveal?.fresh) run = state;
    haptics.hint();
    sfx.hint?.();
    showClue();
    render();
    return;
  }
  const { state, reveal } = useHint(run, 'letter');
  if (!reveal?.fresh) { els.hintBtn.disabled = true; return; }
  run = state;
  hintPrefix = hintedCells();
  haptics.hint();
  sfx.hint?.();
  render();
  const el = cellEls[solutionPath[hintPrefix - 1]];
  el?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.1)' }, { transform: 'scale(1)' }],
    { duration: 320, easing: 'ease-out' });
}

// ---------- status / progress ----------
function setStatus(text, kind = '') {
  clearTimeout(statusTimer);
  const wait = phraseUntil - Date.now();
  if (kind !== 'phrase' && wait > 0) {
    // the found phrase stays readable for its full hold time
    statusTimer = setTimeout(() => setStatus(text, kind), wait);
    return;
  }
  els.status.textContent = text;
  els.status.dataset.kind = kind;
  if (kind === 'phrase') {
    statusTimer = setTimeout(() => {
      if (els.status.dataset.kind === 'phrase') { els.status.textContent = ''; els.status.dataset.kind = ''; }
    }, CONFIG.phraseHoldMs + 900);
  }
}

function updateProgress() {
  if (!run) return;
  const total = run.chain.length - 1;
  const found = run.found.length - 1;
  els.foundNum.textContent = String(found);
  els.totalNum.textContent = String(total);
  els.progress.setAttribute('aria-label', `İlerleme: ${found} / ${total}`);
}

function showError(msg) {
  els.error.textContent = msg;
  els.error.hidden = false;
}

// ---------- sheets ----------
function closeSheets() {
  els.levelsSheet.hidden = true;
}

// Closing the level list without picking a level: a finished level goes back to its result station.
function dismissLevels() {
  closeSheets();
  if (run?.done) showEnd();
}

function renderSound() {
  const muted = !!sfx.muted;
  els.soundBtn.setAttribute('aria-pressed', String(muted));
  els.soundBtn.setAttribute('aria-label', muted ? TEXT.unmute : TEXT.mute);
  els.soundBtn.title = muted ? TEXT.unmute : TEXT.mute;
  els.soundIcon.setAttribute('href', `../assets/icons.svg#${muted ? 'mute' : 'sound'}`);
}

function openLevels() {
  cancelDrag();
  els.levelList.replaceChildren(...LEVELS.map((level, i) => {
    const done = completed.has(level.id);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'v4-level';
    b.classList.toggle('v4-level--current', i === levelIndex);
    b.classList.toggle('v4-level--done', done);
    b.innerHTML = '<span class="v4-level__num"></span><span class="v4-level__name"></span>';
    b.children[0].textContent = String(i + 1);
    b.children[1].textContent = level.title ?? '';
    if (done) {
      const mark = document.createElement('span');
      mark.className = 'v4-level__done';
      mark.innerHTML = '<svg class="wt-icon" aria-hidden="true"><use href="../assets/icons.svg#check"></use></svg>';
      b.append(mark);
    }
    if (i === levelIndex) b.setAttribute('aria-current', 'true');
    b.setAttribute('aria-label', TEXT.levelLabel(i + 1, level.title ?? '', done));
    b.addEventListener('click', () => { haptics.tap(); startLevel(i); });
    return b;
  }));
  els.levelsSheet.hidden = false;
  const cur = els.levelList.querySelector('.v4-level--current');
  cur?.scrollIntoView({ block: 'nearest' });
  (cur ?? els.levelsClose).focus({ preventScroll: true });
}

// ---------- admin (all test/debug actions live here) ----------
function clearPathPreview() {
  clearTimeout(previewTimer);
  if (!els.board.classList.contains('is-preview')) return;
  els.board.classList.remove('is-preview');
  render();
}

function adminActions() {
  const playable = () => run && !run.done && !busy;
  return [
    { label: 'Kelimeyi çöz', run: () => {
      if (!playable()) return;
      selected = solutionPath.slice();
      submit();
    } },
    { label: 'Bölüm sonuna geç', run: () => {
      if (!run || run.done) return;
      turn++;
      while (!run.done && run.index < run.chain.length - 1) run = answer(run, run.chain[run.index].word).state;
      train.reset(run.found, run.found.map((_, i) => run.chain[i].phrase), run.found.map((_, i) => run.chain[i].base));
      openTurn();
    } },
    { label: 'Yolu göster', run: () => {
      if (!playable()) return;
      els.board.classList.add('is-preview');
      drawRail(els.hintRail, solutionPath);
      clearTimeout(previewTimer);
      previewTimer = setTimeout(clearPathPreview, CONFIG.pathPreviewMs);
    } },
    { label: 'Cevabı göster', run: () => { if (playable()) setStatus(TEXT.answerIs(target.word), 'warn'); } },
    { label: 'Tahtayı yeniden üret', run: () => {
      if (!playable()) return;
      regen++;
      hintPrefix = hintedCells();
      makeBoard();
    } },
    ...Object.entries(REFILL_LABELS).map(([policy, name]) => ({
      label: `Dolum: ${name}${policy === DEFAULT_POLICY ? ' (varsayılan)' : ''}${policy === refillPolicy ? ' ✓' : ''}`,
      run: () => {
        refillPolicy = policy;
        storage.set('refill', policy);
        // the current board already planned its next refill; a new board plans it with the new mode
        if (playable()) { regen++; hintPrefix = hintedCells(); makeBoard(); }
        setStatus(`Dolum: ${name}`, 'warn');
      },
    })),
    { label: 'İlerlemeyi sıfırla', tone: 'danger', run: () => {
      completed = new Set();
      tipSeen = false;
      for (const key of ['completed', 'last', 'tipSeen']) storage.remove(key);
      startLevel(0);
    } },
  ];
}

// ---------- wiring ----------
els.board.addEventListener('pointerdown', onPointerDown);
els.board.addEventListener('pointermove', onPointerMove);
els.board.addEventListener('pointerup', onPointerUp);
els.board.addEventListener('pointercancel', onPointerCancel);
els.board.addEventListener('lostpointercapture', onPointerCancel);
els.board.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('blur', cancelDrag);
document.addEventListener('visibilitychange', () => { if (document.hidden) cancelDrag(); });

els.hintBtn.addEventListener('click', hint);
els.clueClose.addEventListener('click', () => setClue(false));
els.levelsBtn.addEventListener('click', () => { haptics.tap(); openLevels(); });
els.levelsClose.addEventListener('click', dismissLevels);
els.levelsSheet.addEventListener('click', (e) => { if (e.target === els.levelsSheet) dismissLevels(); });
els.soundBtn.addEventListener('click', () => { sfx.setMuted(!sfx.muted); renderSound(); sfx.tap?.(); });
els.restartBtn.addEventListener('click', () => { haptics.tap(); startLevel(levelIndex); });
function openAdminSheet() {
  cancelDrag();
  return openAdmin({
    levels: LEVELS,
    currentId: LEVELS[levelIndex]?.id,
    onJump: (_id, index) => startLevel(index),
    actions: adminActions(),
    title: 'Yönetim · Ray Çiz',
  });
}
// the gear opens Ayarlar (mode, sound, vibration); its quiet "Yönetim" row leads on to the admin sheet
els.settingsBtn.addEventListener('click', () => {
  cancelDrag();
  haptics.tap();
  openSettings({ mode: 'ray', onAdmin: openAdminSheet, onChange: renderSound });
});
// defaultPrevented: the result station's own Escape (it has just opened the level list) bubbles up here too
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !e.defaultPrevented && !els.levelsSheet.hidden) dismissLevels();
});

let resizeTimer = 0;
// A real size change (rotation, resize) drops the running rail; a mere shift only refreshes the hit box.
new ResizeObserver(() => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const before = scale;
    layout();
    if (!drag) return;
    if (scale !== before) cancelDrag();
    else boardRect = els.board.getBoundingClientRect();
  }, 30);
}).observe(els.app);

rememberMode('ray');
renderSound();
if (!LEVELS?.length) showError(TEXT.startError('levels.js boş'));
else {
  startLevel(levelIndexFromStart());
  layout();
}

// read-only hook for automated playtests
window.__wordTrainV4 = {
  get state() { return run; },
  get board() { return { cells: cells.map((c) => c.letter), keys: cells.map((c) => c.key), solutionPath: [...solutionPath], hintPrefix, selected: [...selected], nextMode, refillPolicy }; },
  openAdmin: () => openAdminSheet(),
  get geo() { return { scale, centers: [...Array(CELLS).keys()].map(center) }; },
};
