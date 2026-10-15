#!/usr/bin/env node
'use strict';
// New puzzles for the 97 pack levels on boards up to 10×12, with shape clues, keeping every
// level's picture: the board keeps its picture's proportions (within 7%, the picture is
// centre-cropped by tools/fit_art.py) and its difficulty band.
// Writes tools/puzzles/<id>.json { id, band, art: [cols, rows], spec, puzzle }, which
// build_pack.js uses instead of the level's own spec and puzzle. Resumable: existing files
// are kept, delete one to make it again.
//   node tools/generate_levels.js [--workers 10] [--extras] [id ...]   (--extras: remake only levels with I/II, m+, corners, twins or key locks)
const fs = require('fs'), path = require('path');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const { generatePuzzle, analyse, puzzleClues } = require('./shikaku');

const DIR = path.join(__dirname, 'puzzles');
const MAX_COLS = 10, MAX_ROWS = 12, CROP = 0.07;
const seedOf = (id) => [...id].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
const tagOf = (e) => { const d = Math.min(100, Math.round(e / 1.4)); return d < 30 ? 'easy' : d < 58 ? 'medium' : d < 82 ? 'hard' : 'expert'; };
const lerp = (a, b, t) => a + (b - a) * t;

// boards for a picture of artCols × artRows, closest to the wanted area first
function sizesFor([ac, ar], area) {
  const out = [];
  for (let c = 5; c <= MAX_COLS; c++) for (let r = c; r <= MAX_ROWS; r++) {
    const err = Math.abs(r / c - ar / ac) / (ar / ac);
    if (err <= CROP && c * r >= ac * ar) out.push({ cols: c, rows: r, err }); // never smaller than before
  }
  return out.sort((x, y) => Math.abs(x.cols * x.rows - area) - Math.abs(y.cols * y.rows - area) || x.err - y.err);
}

// The newer clues come in one at a time. Each debut level shows its clue several times and
// nothing else new; after that the clue keeps turning up, mixed with the others.
//   medium: I/II (parity) from 20% of the band, m+ (more) from 60%, corners from 85%
//   hard:   twin "?" from 15%, key locks from 60%; expert mixes everything
function extrasFor(band, i, n) {
  const at = (f) => Math.round(f * (n - 1));
  const cycle = (list) => list[i % list.length];
  if (band === 'medium') {
    if (i < at(0.2)) return {};
    if (i === at(0.2)) return { parity: 3 };
    if (i < at(0.6)) return (i - at(0.2)) % 2 === 0 ? { parity: 2 } : {};
    if (i === at(0.6)) return { more: 3 };
    if (i < at(0.85)) return i % 2 ? { more: 2 } : { parity: 2 };
    if (i === at(0.85)) return { corners: 3 };
    return cycle([{ corners: 2 }, { more: 2 }, { parity: 1, corners: 1 }]);
  }
  if (band === 'hard') {
    if (i < at(0.15)) return cycle([{ parity: 1 }, { more: 1 }, { corners: 1 }]);
    if (i === at(0.15)) return { links: 2, lockCount: 0, hiddenCount: 0 };
    if (i < at(0.6)) return cycle([{ links: 1 }, { more: 1, corners: 1 }, { parity: 1, links: 1 }]);
    if (i === at(0.6)) return { keyLocks: 1, lockCount: 0 };
    return cycle([{ keyLocks: 1, lockCount: 0, links: 1 }, { more: 1, parity: 1 }, { keyLocks: 1, lockCount: 0, corners: 1 }, { links: 1, corners: 1 }]);
  }
  if (band === 'expert') return cycle([{ links: 1, parity: 1 }, { keyLocks: 1, lockCount: 0, more: 2 }, { links: 2, corners: 1 }, { parity: 2, more: 1 }, { keyLocks: 1, links: 1, corners: 1 }]);
  return {};
}

// t: 0 at the band's easiest level, 1 at its hardest
function plan(band, t, extras = {}) {
  const area = { easy: [30, 45], medium: [45, 72], hard: [72, 100], expert: [99, 120] }[band];
  const target = { easy: [24, 40], medium: [46, 78], hard: [85, 112], expert: [118, 150] }[band];
  const make = (cols, rows) => {
    const a = cols * rows, base = { cols, rows, maxTech: 4, effortTarget: Math.round(lerp(...target, t)) };
    if (band === 'easy') return { ...base, start: [1, 2], pieces: [Math.round(a / 6), Math.round(a / 3.6)], t1Max: 0.6, decMin: 3, liveMin: 2, hiddenCount: 0, shapes: t < 0.45 ? 0 : 1 };
    if (band === 'medium') return { ...base, start: [1, 2], pieces: [Math.round(a / 6.5), Math.round(a / 4)], t1Max: 0.42, decMin: 5, liveMin: 2.6, deepMin: t > 0.5 ? 1 : 0, hiddenCount: 1, shapes: t < 0.5 ? 1 : 2 };
    if (band === 'hard') return { ...base, start: [1, 1], pieceStyle: 'big', pieces: [Math.round(a / 8.5), Math.round(a / 5.5)], t1Max: 0.34, decMin: 8, liveMin: 3, deepMin: 2, cornerMax: 0.4, hiddenCount: 1, lockCount: 1, shapes: t < 0.5 ? 2 : 3 };
    return { ...base, start: [0, 0], openTech: 3, calm: 0, pieceStyle: 'big', pieces: [Math.round(a / 8.5), Math.round(a / 5.5)], t1Max: 0.28, decMin: 9, liveMin: 3, deepMin: 3, cornerMax: 0.35, hiddenCount: 1, lockCount: 1, shapes: t < 0.5 ? 3 : 4 };
  };
  // with newer clues on the board, one shape clue fewer
  const withExtras = (cols, rows) => {
    const spec = make(cols, rows);
    return Object.keys(extras).length ? { ...spec, shapes: Math.max(0, spec.shapes - 1), ...extras } : spec;
  };
  return { area: Math.round(lerp(...area, t)), make: withExtras };
}

function run(job) {
  const { id, band, art, t, extras } = job;
  const tries = [];
  const { area, make } = plan(band, t, extras);
  // if the full mix never lands, the same newer clues with no shape clues or plain "?"
  const variants = (size) => [make(size.cols, size.rows), ...(Object.keys(extras).length ? [{ ...make(size.cols, size.rows), shapes: 0, hiddenCount: 0 }] : [])];
  for (const [size, spec] of sizesFor(art, area).slice(0, 3).flatMap((size) => variants(size).map((spec) => [size, spec]))) {
    let best = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const seed = (seedOf(id) + attempt * 104729 + size.cols * 7919 + size.rows) >>> 0;
      const puzzle = generatePuzzle(size.cols, size.rows, spec, { seed, tilings: 8, samples: 220, polish: 700, deadline: Date.now() + 90000 });
      if (!puzzle) { tries.push(`${size.cols}x${size.rows} none`); continue; }
      const a = analyse({ rows: size.rows, cols: size.cols, clues: puzzleClues(puzzle).solver });
      if (!a.solved || !a.unique) continue;
      const tag = tagOf(a.effort);
      tries.push(`${size.cols}x${size.rows} ${tag} ${a.effort}`);
      if (tag !== band) continue;
      const error = Math.abs(a.effort - spec.effortTarget);
      if (!best || error < best.error) best = { puzzle, error, a };
      if (error <= 6) break;
    }
    if (best) {
      fs.writeFileSync(path.join(DIR, id + '.json'), JSON.stringify({ id, band, art, spec, puzzle: best.puzzle }, null, 2) + '\n');
      return { id, band, size: `${size.cols}x${size.rows}`, effort: best.a.effort, pieces: best.a.steps.length, shapes: Object.keys(best.puzzle.shapes).length, extras };
    }
  }
  throw new Error(`${id}: no ${band} puzzle (${tries.join(', ')})`);
}

if (!isMainThread) {
  try { parentPort.postMessage({ ok: run(workerData) }); } catch (e) { parentPort.postMessage({ error: String(e.message || e) }); }
} else {
  fs.mkdirSync(DIR, { recursive: true });
  const args = process.argv.slice(2);
  const extrasOnly = args.includes('--extras');
  if (extrasOnly) args.splice(args.indexOf('--extras'), 1);
  const wi = args.indexOf('--workers');
  const workers = wi >= 0 ? +args.splice(wi, 2)[1] : 8;
  const only = new Set(args);
  const pack = [...require('./pack_4-23'), ...require('./themes_100').map((t) => require(`./puzzles_100/${t.id}.json`))];
  const manifest = Object.fromEntries(require('../levels_manifest.json').map((l) => [l.id, l]));
  // each level keeps its band and its place inside the band
  const jobs = [];
  for (const band of ['easy', 'medium', 'hard', 'expert']) {
    const list = pack.filter((L) => manifest[L.id].tag === band).sort((x, y) => manifest[x.id].order - manifest[y.id].order);
    list.forEach((L, i) => jobs.push({ id: L.id, band, art: [L.spec.cols, L.spec.rows], t: list.length > 1 ? i / (list.length - 1) : 0, extras: extrasFor(band, i, list.length) }));
  }
  const todo = jobs.filter((j) => (only.size ? only.has(j.id) : extrasOnly ? Object.keys(j.extras).length > 0 : !fs.existsSync(path.join(DIR, j.id + '.json'))));
  // the slow ones (big boards) first
  todo.sort((x, y) => ({ expert: 3, hard: 2, medium: 1, easy: 0 }[y.band] - { expert: 3, hard: 2, medium: 1, easy: 0 }[x.band]));
  let cursor = 0, failures = 0;
  const next = async () => {
    while (cursor < todo.length) {
      const job = todo[cursor++];
      await new Promise((resolve) => {
        const w = new Worker(__filename, { workerData: job });
        w.once('message', (m) => { console.log(JSON.stringify(m)); if (m.error) failures++; resolve(); });
        w.once('error', (e) => { console.error(job.id, e); failures++; resolve(); });
      });
    }
  };
  Promise.all(Array.from({ length: workers }, next)).then(() => {
    console.log(`done: ${todo.length - failures}/${todo.length} made, ${failures} failed`);
    process.exitCode = failures ? 1 : 0;
  });
}
