// Word Train v4 — "Ray Çiz" board builder. Pure, no DOM: lays the target word on a 5×6 honeycomb (flat-top
// hexagons, Word Master style) as a path of neighbouring cells, then fills the other cells. Same rand -> same
// board on every device.
//
// Cell id = row * COLS + col. Odd columns (1, 3) sit half a cell higher than even columns (0, 2, 4), so
//   even column (c, r) touches (c±1, r) and (c±1, r+1);  odd column (c, r) touches (c±1, r−1) and (c±1, r);
//   plus (c, r±1) in its own column: six neighbours inside the board.
import { shuffle } from '../core/logic.js';

export const COLS = 5;
export const ROWS = 6;
export const CELLS = COLS * ROWS;
// Model geometry in px at scale 1 (astra-art, 390-wide screen): the view scales all of it uniformly.
export const GEOMETRY = { w: 80, h: 70, xStep: 64, yStep: 74 };
export const ALPHABET = Array.from('ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ');
// Rough Turkish letter frequencies, so filler looks like Turkish rather than random noise.
const FREQUENT = Array.from('AAAAAAEEEEEİİİİİNNNNRRRRLLLLIIIKKKKDDDMMMYYYUUUTTTSSSBBOOÜÜŞŞZZGGÇÇHHĞVCÖPF');
const SEARCH_BUDGET = 4000;   // node expansions before falling back to the snake
const AHEAD_SHARE = 0.3;      // share of filler drawn from the following word's letters

export const rowOf = (id) => Math.floor(id / COLS);
export const colOf = (id) => id % COLS;
const idOf = (row, col) => row * COLS + col;
const inside = (row, col) => row >= 0 && row < ROWS && col >= 0 && col < COLS;

export function neighbours(id) {
  const r = rowOf(id), c = colOf(id), out = [];
  const side = c % 2 ? [r - 1, r] : [r, r + 1];
  for (const [row, col] of [[r - 1, c], [r + 1, c], ...side.flatMap((row) => [[row, c - 1], [row, c + 1]])]) {
    if (inside(row, col)) out.push(idOf(row, col));
  }
  return out;
}

export const adjacent = (a, b) => neighbours(a).includes(b);

// Cell centre in model px (scale 1); the view multiplies by its scale.
export function centerOf(id) {
  const c = colOf(id), r = rowOf(id);
  const { w, h, xStep, yStep } = GEOMETRY;
  return { x: c * xStep + w / 2, y: r * yStep + (c % 2 ? 0 : yStep / 2) + h / 2 };
}

// Row-by-row zigzag over the whole board (every row is a chain of neighbours, rows join in the edge column),
// rows top-down or bottom-up, mirrored and/or reversed by the seed, then a window of n cells from a seeded
// offset. Mirroring left-right keeps column parity, so neighbours stay neighbours.
export function snakePath(n, rand) {
  const bottomUp = rand() < 0.5, flipH = rand() < 0.5, reverse = rand() < 0.5;
  let path = [];
  for (let k = 0; k < ROWS; k++) {
    const r = bottomUp ? ROWS - 1 - k : k;
    for (let j = 0; j < COLS; j++) {
      let c = k % 2 ? COLS - 1 - j : j;
      if (flipH) c = COLS - 1 - c;
      path.push(idOf(r, c));
    }
  }
  if (reverse) path = path.reverse();
  const offset = Math.floor(rand() * (CELLS - n + 1));
  return path.slice(offset, offset + n);
}

// The neighbour of `id` that continues the step prev -> id in a straight line, if any.
const straightCache = new Map();
const straightAfter = (prev, id) => {
  const k = prev * CELLS + id;
  if (!straightCache.has(k)) straightCache.set(k, straightOn(prev, id));
  return straightCache.get(k);
};
function straightOn(prev, id) {
  const a = centerOf(prev), b = centerOf(id);
  const want = Math.atan2(b.y - a.y, b.x - a.x);
  return neighbours(id).find((x) => {
    const c = centerOf(x);
    return Math.abs(Math.atan2(c.y - b.y, c.x - b.x) - want) < 0.2;
  });
}

// Depth-first walk over unvisited neighbours in seeded order; null when the budget runs out.
// turnBias (0–1): chance that turning steps are tried before going straight, for more winding paths.
export function searchPath(n, rand, { budget = SEARCH_BUDGET, turnBias = 0 } = {}) {
  let left = budget;
  const path = [];
  const used = new Set();
  function walk(id) {
    if (--left < 0) return false;
    path.push(id);
    used.add(id);
    if (path.length === n) return true;
    let order = shuffle(neighbours(id).filter((x) => !used.has(x)), rand);
    if (path.length >= 2 && rand() < turnBias) {
      const straight = straightOn(path[path.length - 2], id);
      order = [...order.filter((x) => x !== straight), ...order.filter((x) => x === straight)];
    }
    for (const next of order) {
      if (walk(next)) return true;
      if (left < 0) break;
    }
    path.pop();
    used.delete(id);
    return false;
  }
  for (const start of shuffle([...Array(CELLS).keys()], rand)) {
    if (walk(start)) return path;
    if (left < 0) break;
  }
  return null;
}

// How tricky a level is:
//   snake       straight row zigzag path (easy reading) instead of a searched one
//   turnBias    chance that a searched path turns rather than goes straight
//   ownShare    share of filler cells taken from the word's own letters
//   falseStarts extra copies of the given first letter
//   decoyPairs  how many of those false starts get the word's second letter next to them (a fake opening)
export function fillerPlan(levelNo) {
  if (levelNo <= 2) return { snake: true, turnBias: 0, ownShare: 0.25, falseStarts: 1, decoyPairs: 0 };
  if (levelNo <= 5) return { snake: false, turnBias: 0.5, ownShare: 0.4, falseStarts: 2, decoyPairs: 1 };
  if (levelNo <= 8) return { snake: false, turnBias: 0.7, ownShare: 0.5, falseStarts: 2, decoyPairs: 2 };
  return { snake: false, turnBias: 0.85, ownShare: 0.55, falseStarts: 3, decoyPairs: 3 };
}

// Most copies of one letter on the board: 4, or (target count + 2) when the target has it more than twice.
function letterCap(letters) {
  const inTarget = new Map();
  for (const ch of letters) inTarget.set(ch, (inTarget.get(ch) ?? 0) + 1);
  return (ch) => ((inTarget.get(ch) ?? 0) > 2 ? inTarget.get(ch) + 2 : 4);
}

// Fills the null cells in `ids` of `grid` (letters or null) for a level's difficulty: false starts (the given
// letter, some with the second letter beside it), then filler drawn from the word's letters (ownShare) or
// Turkish frequencies, never pushing a letter over its cap. `ahead` (the word after this one, if known)
// gets a share of the filler too, so the next refill usually finds its path without changing stones.
// Mutates `grid`.
function fillCells(grid, ids, letters, plan, rand, ahead = []) {
  const { snake, ownShare, falseStarts, decoyPairs } = plan;
  const cap = letterCap(letters);
  const tally = new Map();
  for (const ch of grid) if (ch) tally.set(ch, (tally.get(ch) ?? 0) + 1);
  const fits = (ch) => (tally.get(ch) ?? 0) < cap(ch);
  const put = (id, ch) => { grid[id] = ch; tally.set(ch, (tally.get(ch) ?? 0) + 1); };
  const open = new Set(ids.filter((id) => grid[id] === null));
  const isOpen = (id) => open.has(id) && grid[id] === null;

  shuffle([...open], rand).slice(0, falseStarts).forEach((id, i) => {
    if (!fits(letters[0])) return;
    put(id, letters[0]);
    if (i >= decoyPairs) return;
    const next = shuffle(neighbours(id).filter(isOpen), rand)[0];
    if (next !== undefined && fits(letters[1])) put(next, letters[1]);
  });

  const inWord = new Set(letters);
  const outside = FREQUENT.filter((ch) => !inWord.has(ch));
  const pick = (pool) => {
    for (let tries = 0; tries < 12; tries++) {
      const ch = pool[Math.floor(rand() * pool.length)];
      if (fits(ch)) return ch;
    }
    const left = shuffle(ALPHABET.filter(fits), rand);
    return left[0] ?? pool[0];
  };
  for (const id of [...open].sort((x, y) => x - y)) {
    if (!isOpen(id)) continue;
    const roll = rand();
    const pool = roll < ownShare ? letters
      : ahead.length && roll < ownShare + AHEAD_SHARE ? ahead
        : snake ? (outside.length ? outside : FREQUENT) : FREQUENT;
    put(id, pick(pool));
  }
}

/**
 * buildBoard(word, { levelNo, rand, ahead, policy }) -> { cells: [{ id, letter, key }], solutionPath: [cellId…], nextKey, nextMode }
 * A whole new board (level start, restart, admin). `key` identifies a stone across refills.
 * Difficulty per level comes from fillerPlan(). Other paths that spell the word may exist (decoys can even
 * create them); the game accepts any of them.
 */
export function buildBoard(word, { levelNo = 1, rand = Math.random, firstKey = 0, ahead = '', policy = DEFAULT_POLICY } = {}) {
  const letters = Array.from(word);
  const n = letters.length;
  if (n < 2 || n > CELLS) throw new Error(`"${word}" ${n} harf; petek tahta 2–${CELLS} harf alır`);
  const plan = fillerPlan(levelNo);
  const solutionPath = (!plan.snake && searchPath(n, rand, { turnBias: plan.turnBias })) || snakePath(n, rand);
  const grid = Array(CELLS).fill(null);
  solutionPath.forEach((id, i) => { grid[id] = letters[i]; });
  const nextMode = pickMode(policy, rand);
  plantAhead(grid, solutionPath, ahead, plan, rand, letterCap(letters), levelNo, nextMode);
  fillCells(grid, [...Array(CELLS).keys()], letters, plan, rand, Array.from(ahead ?? ''));
  return {
    cells: grid.map((letter, id) => ({ id, letter, key: firstKey + id })),
    solutionPath,
    nextKey: firstKey + CELLS,
    nextMode,
  };
}

// ---------- refill modes ----------
// After a found word its stones leave and the board refills in one of these modes:
//   { kind: 'flow', dir }  the other stones slide along hex direction `dir` towards the far edge and new stones
//                          come in at the near edge (dir 0 = down: gravity)
//   { kind: 'stay' }       nothing moves; new stones appear where the used ones were
//   { kind: 'cols', cols } per column: true = that column falls (gravity), false = it stays
// A policy picks the mode of every refill (seeded). Each board already knows the mode of its next refill
// (board.nextMode), because the next word is planted over the cells that will survive it.
// Directions as screen angles: down, down-left, up-left, up, up-right, down-right.
const DIR_ANGLES = [90, 150, -150, -90, -30, 30].map((deg) => (deg * Math.PI) / 180);
const DIR_STEP = DIR_ANGLES.map((want) => Array.from({ length: CELLS }, (_, id) => {
  const a = centerOf(id);
  return neighbours(id).find((x) => {
    const b = centerOf(x);
    const diff = Math.atan2(b.y - a.y, b.x - a.x) - want;
    return Math.abs(Math.atan2(Math.sin(diff), Math.cos(diff))) < 0.2;
  }) ?? -1;
}));
const opposite = (dir) => (dir + 3) % 6;
// LINES[dir] = every line of cells along dir, listed from the near edge (where new stones come in) to the far one
const LINES = DIR_STEP.map((step, dir) => [...Array(CELLS).keys()]
  .filter((id) => DIR_STEP[opposite(dir)][id] < 0)
  .map((start) => { const line = []; for (let id = start; id >= 0; id = step[id]) line.push(id); return line; }));
export const GRAVITY = { kind: 'flow', dir: 0 };

// Seeded mode choice per refill. 'gravity' / 'stay' always the same; 'mix' gravity or stay per turn; 'cols'
// every column falls or stays; 'slide' gravity or one of the two lower diagonals; 'flow' any of the 6 directions;
// 'mixslide' stay or one of the three downward directions.
export const REFILL_POLICIES = ['gravity', 'stay', 'mix', 'cols', 'slide', 'flow', 'mixslide', 'tilt', 'mixflow'];
export const DEFAULT_POLICY = 'mixflow';
export function pickMode(policy, rand) {
  const flow = (dirs) => ({ kind: 'flow', dir: dirs[Math.floor(rand() * dirs.length)] });
  switch (policy) {
    case 'stay': return { kind: 'stay' };
    case 'mix': return rand() < 0.5 ? GRAVITY : { kind: 'stay' };
    case 'cols': return { kind: 'cols', cols: Array.from({ length: COLS }, () => rand() < 0.5) };
    case 'slide': return flow([0, 1, 5]);
    case 'flow': return flow([0, 1, 2, 3, 4, 5]);
    case 'mixslide': return rand() < 0.4 ? { kind: 'stay' } : flow([0, 1, 5]);
    case 'tilt': return flow([0, 1, 2, 4, 5]);
    case 'mixflow': return rand() < 0.25 ? { kind: 'stay' } : flow([0, 1, 2, 3, 4, 5]);
    default: return GRAVITY;
  }
}

function linesOf(mode) {
  if (mode.kind === 'flow') return LINES[mode.dir];
  if (mode.kind === 'cols') return LINES[0].filter((line) => mode.cols[colOf(line[0])]);
  return [];
}

// Where every cell of the board comes from once `usedCells` leave in `mode`: from[id] = the cell whose stone
// slides (or stays) there, or -1 for a new stone.
export function settle(usedCells, mode = GRAVITY) {
  const used = new Set(usedCells);
  const from = [...Array(CELLS).keys()].map((id) => (used.has(id) ? -1 : id));
  for (const line of linesOf(mode)) {
    const keep = line.filter((id) => !used.has(id));
    line.forEach((id, i) => { from[id] = i < line.length - keep.length ? -1 : keep[i - line.length + keep.length]; });
  }
  return from;
}

// How deep a cell lies behind the edge where new stones come in, scaled 0 (that edge) .. ROWS-1 (far edge);
// null where nothing flows (stay). The answer-spreading costs (ROW_COST) work on this depth.
function depthOf(mode) {
  const depth = Array(CELLS).fill(null);
  for (const line of linesOf(mode)) {
    line.forEach((id, i) => { depth[id] = line.length > 1 ? Math.round((i * (ROWS - 1)) / (line.length - 1)) : ROWS - 1; });
  }
  return depth;
}

// Start offset (model px) of a new stone that flows in: from outside the near edge, one step further out per
// cell it has to travel. null when the mode lets it appear in place.
export function entryOffset(id, mode) {
  const line = linesOf(mode).find((l) => l.includes(id));
  if (!line) return null;
  const a = centerOf(LINES[0][0][0]), b = centerOf(LINES[0][0][1]);
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const ang = DIR_ANGLES[mode.kind === 'flow' ? mode.dir : 0];
  const k = line.indexOf(id) + 1;
  return { x: -Math.cos(ang) * len * k, y: -Math.sin(ang) * len * k };
}

// Fresh stones may carry only a few letters of the guaranteed path, so the new stones never point at the
// answer: at most this many, never two in a row, never the first letter if avoidable.
const freshCap = (levelNo) => (levelNo <= 2 ? 1 : 2);
// Path step costs: a fresh stone, a surviving stone whose letter changes while it slides / stands still,
// and (when planting) a still-empty cell that takes a letter. Cheaper steps are preferred.
const COST = { fresh: 1, moving: 1.1, still: 3, free: 0.25 };
// Extra cost per step by depth behind the edge where new stones come in (depthOf). Without it planted answers
// sit just behind that edge and the far side goes stale; this keeps answers using and clearing the whole board.
const ROW_COST = { path: [0.05, 0.12, 0.15, 0.1, 0, 0], plant: [0.15, 0.35, 0.45, 0.3, 0.1, 0] };
const ROW_PULL = 0.03;
// Cost of a step that runs straight on, times the level's turnBias: the row costs alone favour long straight
// runs (more words down one column), this keeps the harder levels winding.
const STRAIGHT = 0.05;

// Cheapest path for `letters` over a settled layout; layout[id] = { t: 'fix', letter, moving } (a surviving
// stone), { t: 'fresh' } (a new stone) or { t: 'free' } (an empty cell we may still write, room(ch) letters
// left under the cap). rows[depth[id]] / firstRows[row] add a cost for every letter / the first one. Seeded
// branch-and-bound DFS; null when nothing fits the limits within budget.
function cheapestPath(layout, letters, rand, {
  turnBias = 0, maxFresh = 2, maxChanges = 3, firstFresh = false, free = COST.free, room = () => Infinity,
  budget = 30000, rows = null, depth = null, firstRows = null, straight = 0,
} = {}) {
  const n = letters.length;
  let left = budget, best = null, bestScore = Infinity;
  const path = [], used = new Set(), spent = new Map();
  const lift = (id) => (straight && path.length >= 2 && id === straightAfter(path[path.length - 2], path[path.length - 1]) ? straight : 0) +
     (rows && depth?.[id] != null ? rows[depth[id]] : 0) + (firstRows && !path.length ? firstRows[rowOf(id)] : 0);
  const step = (id, i) => {
    const cell = layout[id];
    if (cell.t === 'fresh') return { s: COST.fresh + lift(id), f: 1, k: 0 };
    if (cell.t === 'fix') return cell.letter === letters[i] ? { s: lift(id), f: 0, k: 0 } : { s: (cell.moving ? COST.moving : COST.still) + lift(id), f: 0, k: 1 };
    return (spent.get(letters[i]) ?? 0) < room(letters[i]) ? { s: free + lift(id), f: 0, k: 0 } : null;
  };
  const price = (id, i) => step(id, i)?.s ?? 99;
  function walk(id, score, fresh, changes, prevFresh) {
    if (--left < 0) return;
    const st = step(id, path.length);
    if (!st) return;
    const s = score + st.s, f = fresh + st.f, k = changes + st.k;
    if (s >= bestScore || f > maxFresh || k > maxChanges) return;
    if (st.f && (prevFresh || (!path.length && !firstFresh))) return;
    const letter = letters[path.length];
    const isFree = layout[id].t === 'free';
    path.push(id);
    used.add(id);
    if (isFree) spent.set(letter, (spent.get(letter) ?? 0) + 1);
    if (path.length === n) {
      best = [...path];
      bestScore = s;
    } else {
      let order = shuffle(neighbours(id).filter((x) => !used.has(x)), rand);
      order.sort((x, y) => price(x, path.length) - price(y, path.length));
      if (path.length >= 2 && rand() < turnBias) {
        const straight = straightOn(path[path.length - 2], id);
        order = [...order.filter((x) => x !== straight), ...order.filter((x) => x === straight)];
      }
      for (const next of order) {
        walk(next, s, f, k, st.f === 1);
        if (bestScore === 0 || left < 0) break;
      }
    }
    path.pop();
    used.delete(id);
    if (isFree) spent.set(letter, spent.get(letter) - 1);
  }
  const starts = shuffle([...Array(CELLS).keys()], rand).sort((x, y) => price(x, 0) - price(y, 0));
  for (const start of starts) {
    walk(start, 0, 0, 0, false);
    if (bestScore === 0 || left < 0) break;
  }
  return best;
}

// The planted word's first letter is drawn toward a seeded row, so first letters spread over the whole board.
function aimRows(rand) {
  const aim = Math.floor(rand() * ROWS);
  return Array.from({ length: ROWS }, (_, r) => ROW_PULL * Math.abs(r - aim));
}

// Plans one word ahead: assuming the player takes `usedPath`, lays a path for `ahead` over the cells that will
// survive the next refill (in `mode`), writing its letters into still-empty cells (`grid` null) and reusing stones that
// already fit, plus the ahead word's false starts. Next turn, its answer then sits mostly in old stones.
// Mutates `grid`; returns the cells it wrote.
function plantAhead(grid, usedPath, ahead, plan, rand, cap, levelNo, mode) {
  const word = Array.from(ahead ?? '');
  if (word.length < 2) return [];
  const tally = new Map();
  for (const ch of grid) if (ch) tally.set(ch, (tally.get(ch) ?? 0) + 1);
  const room = (ch) => cap(ch) - (tally.get(ch) ?? 0);
  const from = settle(usedPath, mode);
  const layout = from.map((src, id) => (src < 0 ? { t: 'fresh' }
    : grid[src] === null ? { t: 'free' } : { t: 'fix', letter: grid[src], moving: src !== id }));
  const path = cheapestPath(layout, word, rand, {
    turnBias: Math.max(plan.turnBias, 0.5), maxFresh: freshCap(levelNo), maxChanges: 2, room, budget: 12000,
    rows: ROW_COST.plant, depth: depthOf(mode), firstRows: aimRows(rand), straight: STRAIGHT * plan.turnBias,
  });
  if (!path) return [];
  const planted = [];
  const put = (id, ch) => {
    const src = from[id];
    if (src < 0 || grid[src] !== null || room(ch) <= 0) return false;
    grid[src] = ch;
    layout[id] = { t: 'fix', letter: ch };
    tally.set(ch, (tally.get(ch) ?? 0) + 1);
    planted.push(src);
    return true;
  };
  path.forEach((id, i) => put(id, word[i]));
  // its false starts survive the refill too, so the next turn's decoys are old stones, not fresh ones
  const spots = shuffle(layout.map((c, id) => (c.t === 'free' ? id : -1)).filter((id) => id >= 0), rand);
  spots.slice(0, plan.falseStarts).forEach((id, i) => {
    if (!put(id, word[0]) || i >= plan.decoyPairs) return;
    const next = shuffle(neighbours(id).filter((x) => layout[x].t === 'free'), rand)[0];
    if (next !== undefined) put(next, word[1]);
  });
  return planted;
}

// A run of `len` consecutive letters of `word` spelled through neighbouring cells of `ids` only; [] if none.
export function runIn(cells, ids, word, len = 3) {
  const letters = Array.from(word);
  const pool = new Set(ids);
  const letterAt = (id) => (typeof cells[id] === 'string' || cells[id] === null ? cells[id] : cells[id].letter);
  for (let i = 0; i + len <= letters.length; i++) {
    const path = [];
    const walk = (id) => {
      if (!pool.has(id) || path.includes(id) || letterAt(id) !== letters[i + path.length]) return false;
      path.push(id);
      if (path.length === len) return true;
      for (const next of neighbours(id)) if (walk(next)) return true;
      path.pop();
      return false;
    };
    for (const id of pool) if (walk(id)) return path;
  }
  return [];
}

/**
 * refill(board, usedCells, nextWord, rand, levelNo, { ahead, policy })
 *   -> { board: { cells, nextKey, nextMode }, mode, moves: [{ key, from, to }], newCells: [id], changedCells: [id],
 *        fullReset, solutionPath }
 * Refill after a found word: the used stones leave and the board refills in board.nextMode (planned with the
 * board; see the refill modes above): the other stones slide along the flow and new stones come in at the near
 * edge, or new stones appear in place. The default policy mixes both for variety (measured against gravity
 * only, in place only and the other mixes: flattest rows and columns, least reuse of the last answer's cells,
 * fewest stale stones). The new stones must not give the answer away:
 * - the guaranteed path for `nextWord` runs through surviving stones (the previous turn planted it, see
 *   plantAhead); at most freshCap(levelNo) of its letters sit on new stones, never two in a row, never the
 *   first letter; else a few surviving stones quietly change letter (changedCells, ≤ 3, a fallback ≤ 5);
 *   else the whole board is rebuilt (fullReset);
 * - the other new stones carry the word after (`ahead`, planted for the next turn) and ordinary filler, with
 *   nextWord's letters no more often than on the old stones, and never 3 answer letters in a row.
 * Same input + same rand -> same result.
 */
export function refill(board, usedCells, nextWord, rand, levelNo = 1, { ahead = '', policy = DEFAULT_POLICY } = {}) {
  const letters = Array.from(nextWord);
  const plan = fillerPlan(levelNo);
  let nextKey = board.nextKey ?? CELLS;
  const mode = board.nextMode ?? pickMode(policy, rand);
  const from = settle(usedCells, mode);
  const slots = from.map((src) => (src < 0 ? null : board.cells[src]));
  const moves = [];
  slots.forEach((cell, to) => { if (cell && cell.id !== to) moves.push({ key: cell.key, from: cell.id, to }); });
  const newCells = slots.map((cell, id) => (cell ? -1 : id)).filter((id) => id >= 0);
  const grid = slots.map((cell) => (cell ? cell.letter : null));
  const layout = slots.map((cell, id) => (cell ? { t: 'fix', letter: cell.letter, moving: cell.id !== id } : { t: 'fresh' }));

  const turnBias = Math.max(plan.turnBias, 0.5);
  const limits = { turnBias, maxFresh: freshCap(levelNo), maxChanges: 3, rows: ROW_COST.path, depth: depthOf(mode),
    straight: STRAIGHT * plan.turnBias };
  // a few more quiet letter changes are better than a whole new board; the first letter never goes on a new stone
  const path = cheapestPath(layout, letters, rand, limits) ?? cheapestPath(layout, letters, rand, { ...limits, maxChanges: 5 });
  if (!path) {
    const fresh = buildBoard(nextWord, { levelNo, rand, firstKey: nextKey, ahead, policy });
    return { board: { cells: fresh.cells, nextKey: fresh.nextKey, nextMode: fresh.nextMode }, mode, moves: [],
      newCells: [...Array(CELLS).keys()], changedCells: [], fullReset: true, solutionPath: fresh.solutionPath };
  }
  const changedCells = [];
  path.forEach((id, i) => {
    if (grid[id] === letters[i]) return;
    if (grid[id] !== null) changedCells.push(id);
    grid[id] = letters[i];
  });
  const nextMode = pickMode(policy, rand);
  fillFresh(grid, newCells, path, letters, plan, rand, ahead, levelNo, nextMode);
  const cells = grid.map((letter, id) => ({ id, letter, key: slots[id] ? slots[id].key : nextKey++ }));
  return { board: { cells, nextKey, nextMode }, mode, moves, newCells, changedCells, fullReset: false, solutionPath: path };
}

// Letters for the new stones that are not on the guaranteed path: first the next word is planted ahead, then
// filler with the answer's letters at the rate the surviving stones show them, the rest from the next words or
// ordinary Turkish frequencies. Finally no 3 answer letters may line up on new stones. Mutates `grid`.
function fillFresh(grid, newCells, path, letters, plan, rand, ahead, levelNo, nextMode) {
  const cap = letterCap(letters);
  const tally = new Map();
  for (const ch of grid) if (ch) tally.set(ch, (tally.get(ch) ?? 0) + 1);
  const planted = new Set(plantAhead(grid, path, ahead, plan, rand, cap, levelNo, nextMode));
  for (const id of planted) tally.set(grid[id], (tally.get(grid[id]) ?? 0) + 1);
  const fits = (ch) => (tally.get(ch) ?? 0) < cap(ch);
  const put = (id, ch) => {
    if (grid[id]) tally.set(grid[id], tally.get(grid[id]) - 1);
    grid[id] = ch;
    tally.set(ch, (tally.get(ch) ?? 0) + 1);
  };
  const inWord = new Set(letters);
  const fresh = new Set(newCells);
  const onPath = new Set(path);
  const old = grid.filter((ch, id) => !fresh.has(id) && !onPath.has(id));
  const rate = old.length ? old.filter((ch) => inWord.has(ch)).length / old.length : 0.3;
  const others = newCells.filter((id) => !onPath.has(id));
  const open = shuffle(others.filter((id) => grid[id] === null), rand);
  const have = others.filter((id) => grid[id] !== null && inWord.has(grid[id])).length;
  let own = Math.max(0, Math.floor(rate * others.length + rand()) - have);
  const outside = FREQUENT.filter((ch) => !inWord.has(ch));
  const aheadOut = Array.from(ahead ?? '').filter((ch) => !inWord.has(ch));
  const pick = (pool) => {
    for (let tries = 0; tries < 12 && pool.length; tries++) {
      const ch = pool[Math.floor(rand() * pool.length)];
      if (fits(ch)) return ch;
    }
    return shuffle(ALPHABET.filter((ch) => fits(ch) && !inWord.has(ch)), rand)[0]
      ?? shuffle(ALPHABET.filter(fits), rand)[0] ?? 'A';
  };
  const filler = () => pick(aheadOut.length && rand() < plan.ownShare ? aheadOut : outside);
  for (const id of open) put(id, own-- > 0 ? pick(letters) : filler());
  // never 3 answer letters in a row on new stones: re-letter one of the run (not the path, planted last)
  for (let tries = 0; tries < 12; tries++) {
    const run = runIn(grid, newCells, letters.join(''));
    if (!run.length) break;
    const spot = run.find((id) => !onPath.has(id) && !planted.has(id)) ?? run.find((id) => !onPath.has(id));
    if (spot === undefined) break;
    planted.delete(spot);
    put(spot, pick(outside));
  }
}

// Cell id sequences that spell `word` under the rules (tests/admin checks).
export function findPaths(cells, word, limit = 50) {
  const letters = Array.from(word);
  const out = [];
  const path = [];
  function walk(id) {
    if (out.length >= limit || cells[id].letter !== letters[path.length] || path.includes(id)) return;
    path.push(id);
    if (path.length === letters.length) out.push([...path]);
    else for (const next of neighbours(id)) walk(next);
    path.pop();
  }
  for (let id = 0; id < CELLS; id++) walk(id);
  return out;
}
