// Pixhaku in-game level generator. Built from tools/shikaku.js by tools/build_pack.js; edit those, not this.
// PixhakuGen.generate(tag) → Promise of a level { rows, cols, clues, solution, difficulty, tag } that is
// uniquely solvable without guessing, made in a Web Worker so the game keeps running.
// PixhakuGen.mosaic(level) → data-URL picture of the solution, used as the reward image.
(function () {
  "use strict";
  function pixhakuEngine(scope) {
"use strict";
// Shikaku solver for Pixhaku levels.
//
//   countSolutions(p)  exact solution count (stops at `limit`), "?" clues take any size
//   humanSolve(p)      solves the way a player does, one certain piece at a time, and
//                      records which reasoning step each piece needed
//   analyse(p)         both of the above plus the numbers the level specs check
//   searchClues(...)   picks one clue cell per zone so a layout meets a level spec
//
// Puzzle: { rows, cols, clues: [{ r, c, n, h? }] }   h: hidden "?" clue.
// Reasoning steps (a level may need 1–4; 5 means "too deep, re-roll"):
//   T1 tek yer    a clue has exactly one rectangle left that fits
//   T2 tek sahip  an empty cell only one clue can still reach, so that clue must cover it
//   T3 kesişim    every option of a clue covers the same cells, so the others can't use them
//   T4 eleme      "if I drew it this way, that clue would have no room": one-step what-if
//   T5            chains of the above to a fixpoint, then what-if (trial and error)
// A step above T1 is a decision moment: no piece is plainly certain and the clue that
// resolves still shows several rectangles; when those differ in orientation
// (dik / yatay / kare) it is the "dik mi yatay mı" dilemma the levels are built around.

function rectCells(cols, r0, c0, r1, c1) {
  const out = [];
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) out.push(r * cols + c);
  return out;
}

function prepare(p) {
  const N = p.rows * p.cols;
  const clueAt = new Int16Array(N).fill(-1);
  p.clues.forEach((k, i) => { clueAt[k.r * p.cols + k.c] = i; });
  // every rectangle a clue could ever take: right area, on the board, no other clue inside
  const all = p.clues.map((k, i) => {
    const list = [];
    for (let h = 1; h <= p.rows; h++) {
      for (let w = 1; w <= p.cols; w++) {
        if (!k.h && h * w !== k.n) continue;
        for (let r0 = Math.max(0, k.r - h + 1); r0 <= Math.min(k.r, p.rows - h); r0++) {
          for (let c0 = Math.max(0, k.c - w + 1); c0 <= Math.min(k.c, p.cols - w); c0++) {
            const cells = rectCells(p.cols, r0, c0, r0 + h - 1, c0 + w - 1);
            if (cells.some((x) => clueAt[x] !== -1 && clueAt[x] !== i)) continue;
            list.push({ r0, c0, r1: r0 + h - 1, c1: c0 + w - 1, cells });
          }
        }
      }
    }
    return list;
  });
  // raw = how many rectangles fit ignoring the other clues (how open a clue looks at first)
  const raw = p.clues.map((k) => {
    if (k.h) return Infinity;
    let n = 0;
    for (let h = 1; h <= p.rows; h++) {
      if (k.n % h) continue;
      const w = k.n / h;
      if (w > p.cols) continue;
      const rr = Math.min(k.r, p.rows - h) - Math.max(0, k.r - h + 1) + 1;
      const cc = Math.min(k.c, p.cols - w) - Math.max(0, k.c - w + 1) + 1;
      if (rr > 0 && cc > 0) n += rr * cc;
    }
    return n;
  });
  return { N, clueAt, all, raw };
}

// The first uncovered cell in reading order is always the top-left corner of the
// rectangle that covers it, so only those rectangles are tried there.
function countSolutions(p, limit = 2, prep = prepare(p)) {
  const { N, all } = prep;
  const byTL = Array.from({ length: N }, () => []);
  all.forEach((list, i) => list.forEach((rc) => byTL[rc.r0 * p.cols + rc.c0].push([i, rc])));
  const covered = new Uint8Array(N);
  const used = new Uint8Array(p.clues.length);
  let count = 0;
  (function rec(from) {
    let cell = from;
    while (cell < N && covered[cell]) cell++;
    if (cell === N) { count++; return; }
    for (const [i, rc] of byTL[cell]) {
      if (used[i] || rc.cells.some((x) => covered[x])) continue;
      used[i] = 1;
      for (const x of rc.cells) covered[x] = 1;
      rec(cell + 1);
      for (const x of rc.cells) covered[x] = 0;
      used[i] = 0;
      if (count >= limit) return;
    }
  })(0);
  return count;
}

const overlaps = (rc, mask) => rc.cells.some((x) => mask[x]);

// One look at the board: the forced pieces found with the simplest step that finds any.
function reasonStep(p, prep, covered, placed) {
  const n = p.clues.length;
  const open = [];
  for (let i = 0; i < n; i++) if (!placed[i]) open.push(i);
  const live = prep.all.map((list, i) => (placed[i] ? null : list.filter((rc) => !overlaps(rc, covered))));
  if (open.some((i) => live[i].length === 0)) return null;
  const copy = (c) => c.map((l) => (l ? l.slice() : null));
  const singles = (c) => open.filter((i) => c[i].length === 1);
  const result = (tech, c, why) => {
    const f = singles(c);
    return f.length ? { tech, forced: f.map((i) => [i, c[i][0]]), live, why } : null;
  };
  const note = (why, i, v) => { if (why) (why[i] = why[i] || []).push(v); };

  const t1 = result(1, live);
  if (t1) return t1;
  if (open.length === 1) {
    // the last piece just fills what is left (matters for a "?" clue, which could be any size)
    const rest = [];
    for (let x = 0; x < prep.N; x++) if (!covered[x]) rest.push(x);
    const fill = live[open[0]].filter((rc) => rc.cells.length === rest.length);
    if (fill.length === 1) return { tech: 1, forced: [[open[0], fill[0]]], live };
  }

  // cells only one clue can still reach pin that clue's options (a single pass)
  const ownerPass = (cands, why) => {
    const who = new Map();
    for (const i of open) for (const rc of cands[i]) for (const x of rc.cells) {
      if (!who.has(x)) who.set(x, new Set());
      who.get(x).add(i);
    }
    let changed = false;
    for (let x = 0; x < prep.N; x++) {
      if (covered[x]) continue;
      const s = who.get(x);
      if (!s) return null;
      if (s.size === 1) {
        const [i] = s;
        const before = cands[i].length;
        cands[i] = cands[i].filter((rc) => rc.cells.includes(x));
        if (!cands[i].length) return null;
        if (cands[i].length !== before) { changed = true; note(why, i, { cell: x }); }
      }
    }
    return { changed };
  };
  // cells every option of a clue covers are closed to the other clues (one round)
  const interPass = (cands, why) => {
    const claims = [];
    for (const i of open) {
      const s = new Set(cands[i][0].cells);
      for (const rc of cands[i]) for (const x of [...s]) if (!rc.cells.includes(x)) s.delete(x);
      s.delete(p.clues[i].r * p.cols + p.clues[i].c);
      if (s.size) claims.push([i, s]);
    }
    let changed = false;
    for (const j of open) {
      const before = cands[j].length;
      cands[j] = cands[j].filter((rc) => {
        const by = claims.find(([i, s]) => i !== j && rc.cells.some((x) => s.has(x)));
        if (by) note(why, j, { by: by[0] });
        return !by;
      });
      if (!cands[j].length) return null;
      if (cands[j].length !== before) changed = true;
    }
    return { changed };
  };

  const why2 = {};
  const c2 = copy(live);
  if (!ownerPass(c2, why2)) return null;
  const t2 = result(2, c2, why2);
  if (t2) return t2;

  const why3 = {};
  const c3 = copy(c2);
  if (!interPass(c3, why3) || !ownerPass(c3, why3)) return null;
  const t3 = result(3, c3, why3);
  if (t3) return t3;

  // what-if: a candidate that leaves some clue without room, or some cell unreachable, is out
  const whatIf = (base, why) => {
    const out = copy(base);
    for (const i of open) {
      if (out[i].length < 2) continue;
      out[i] = out[i].filter((rc) => {
        const cov = covered.slice();
        for (const x of rc.cells) cov[x] = 1;
        const reach = new Uint8Array(prep.N);
        for (const j of open) {
          if (j === i) continue;
          const left = base[j].filter((q) => !overlaps(q, cov));
          if (!left.length) { note(why, i, { rect: rc, by: j }); return false; }
          for (const q of left) for (const x of q.cells) reach[x] = 1;
        }
        for (let x = 0; x < prep.N; x++) if (!cov[x] && !reach[x]) { note(why, i, { rect: rc, cell: x }); return false; }
        return true;
      });
      if (!out[i].length) return null;
    }
    return out;
  };

  const why4 = {};
  const c4 = whatIf(c3, why4);
  if (!c4) return null;
  const t4 = result(4, c4, why4);
  if (t4) return t4;

  const c5 = copy(c4);
  for (let round = 0; round < 60; round++) {
    const a = ownerPass(c5, null);
    const b = a && interPass(c5, null);
    if (!a || !b) return null;
    if (!a.changed && !b.changed) break;
  }
  const c5b = whatIf(c5, null);
  return c5b ? result(5, c5b) : null;
}

const orient = (q) => { const h = q.r1 - q.r0, w = q.c1 - q.c0; return h > w ? "dik" : w > h ? "yatay" : "kare"; };

function humanSolve(p, prep = prepare(p)) {
  const n = p.clues.length;
  const covered = new Uint8Array(prep.N);
  const placed = new Array(n).fill(null);
  const steps = [];
  for (let s = 0; s < n; s++) {
    const res = reasonStep(p, prep, covered, placed);
    if (!res) return { solved: false, steps };
    // several certain pieces: take the most visible one (fewest options, fewest raw fits, reading order)
    const forced = res.forced.slice().sort((a, b) =>
      (res.live[a[0]].length - res.live[b[0]].length) || (prep.raw[a[0]] - prep.raw[b[0]]) ||
      (p.clues[a[0]].r - p.clues[b[0]].r) || (p.clues[a[0]].c - p.clues[b[0]].c));
    const [i, rc] = forced[0];
    const live = res.live[i];
    steps.push({ clue: i, rect: rc, tech: res.tech, options: res.forced.length, openBefore: n - s,
      live: live.length, orients: [...new Set(live.map(orient))].sort(), orient: orient(rc),
      why: res.why ? res.why[i] || null : null,
      forcedAll: res.forced.map(([j, q]) => ({ clue: j, rect: q })) });
    placed[i] = rc;
    for (const x of rc.cells) covered[x] = 1;
  }
  return { solved: true, steps };
}

const TECH_WEIGHT = [0, 1, 2.6, 4, 6, 10];

function analyse(p, { skipUnique = false } = {}) {
  const prep = prepare(p);
  const sols = skipUnique ? null : countSolutions(p, 2, prep);
  const { solved, steps } = humanSolve(p, prep);
  const techCounts = [0, 0, 0, 0, 0, 0];
  steps.forEach((s) => techCounts[s.tech]++);
  const first = steps[0];
  const startOptions = first && first.tech === 1 ? first.options : 0;
  // effort: each piece costs its step's weight, more when it hides among many open clues
  // and when the player has to weigh several rectangles for it
  let effort = 0;
  for (const s of steps) {
    effort += TECH_WEIGHT[s.tech] * (1 + Math.log2(s.openBefore / Math.max(1, s.options)));
    if (s.tech >= 2) effort += 0.5 * (s.live - 1);
  }
  // longest run of plain T1 pieces between the opening and the last decision
  let lastDecision = -1;
  steps.forEach((s, k) => { if (s.tech >= 2) lastDecision = k; });
  let run = 0, t1Run = 0;
  for (let k = startOptions; k < lastDecision; k++) {
    run = steps[k].tech === 1 ? run + 1 : 0;
    t1Run = Math.max(t1Run, run);
  }
  return {
    unique: sols === 1, sols, solved, steps, techCounts,
    maxTech: steps.reduce((m, s) => Math.max(m, s.tech), 0),
    startTech: first ? first.tech : 0,
    startOptions,
    startRaw: first ? prep.raw[first.clue] : 0,
    decisions: steps.filter((s) => s.tech >= 2).length,
    // share of pieces that are plainly certain, options weighed per decision, deep steps
    t1Frac: steps.length ? Math.round((techCounts[1] / steps.length) * 100) / 100 : 0,
    avgLive: (() => {
      const d = steps.filter((s) => s.tech >= 2);
      return d.length ? Math.round((d.reduce((t, s) => t + s.live, 0) / d.length) * 10) / 10 : 0;
    })(),
    deep: techCounts[3] + techCounts[4],
    // clues in a corner of their piece let it grow one way only; on a side it can go two ways
    cornerFrac: steps.length ? Math.round((steps.filter((s) => {
      const k = p.clues[s.clue], q = s.rect;
      return (k.r === q.r0 || k.r === q.r1) && (k.c === q.c0 || k.c === q.c1);
    }).length / steps.length) * 100) / 100 : 0,
    dilemmas: steps.filter((s) => s.tech >= 2 && s.orients.length >= 2).length,
    firstDecision: steps.findIndex((s) => s.tech >= 2),
    t1Run,
    effort: Math.round(effort * 10) / 10,
    raw: prep.raw,
  };
}

// ---------- layouts ----------
// grid: rows of letters, each letter one rectangular zone. Zones come back in reading
// order of their top-left cell (that order is the zone numbering on the drafts).
function parseLayout(grid) {
  const g = grid.map((row) => row.replace(/\s+/g, "").split(""));
  const rows = g.length, cols = g[0].length;
  const seen = new Map();
  g.forEach((row, r) => {
    if (row.length !== cols) throw new Error(`row ${r} has ${row.length} cols, expected ${cols}`);
    row.forEach((k, c) => {
      if (!seen.has(k)) seen.set(k, { key: k, r0: r, c0: c, r1: r, c1: c });
      const b = seen.get(k);
      b.r0 = Math.min(b.r0, r); b.c0 = Math.min(b.c0, c); b.r1 = Math.max(b.r1, r); b.c1 = Math.max(b.c1, c);
    });
  });
  const zones = [...seen.values()];
  for (const z of zones) {
    for (let r = z.r0; r <= z.r1; r++) for (let c = z.c0; c <= z.c1; c++) {
      if (g[r][c] !== z.key) throw new Error(`zone ${z.key} is not a rectangle (cell ${r},${c} is ${g[r][c]})`);
    }
    z.area = (z.r1 - z.r0 + 1) * (z.c1 - z.c0 + 1);
  }
  zones.sort((a, b) => a.r0 - b.r0 || a.c0 - b.c0);
  return { rows, cols, zones };
}

// ---------- level specs ----------
// where a piece sits: tl/tr/bl/br corner, top/bottom/left/right edge, or center
// (a piece spanning the whole width or height counts as the edge it sits on)
function placeOf(q, R, C) {
  const top = q.r0 === 0, bottom = q.r1 === R - 1, left = q.c0 === 0, right = q.c1 === C - 1;
  if (left && right) return top ? "top" : bottom ? "bottom" : "center";
  if (top && bottom) return left ? "left" : right ? "right" : "center";
  if (top) return left ? "tl" : right ? "tr" : "top";
  if (bottom) return left ? "bl" : right ? "br" : "bottom";
  if (left) return "left";
  if (right) return "right";
  return "center";
}

// spec (level profile):
//   start        [min, max] certain openings on the empty board (1 or 2)
//   maxTech      hardest step allowed: 2 tek sahip, 3 kesişim, 4 eleme
//   calm         moves right after the opening(s) that may need at most T2 (default 1)
//   dilemmas     [min, max] decision moments whose clue showed several orientations
//   minLookahead at least this many T4 (eleme) moves
//   maxT1Run     longest run of plain T1 pieces between the opening and the last decision
//   startRawMax  the (first) opening clue fits at most this many ways, ignoring other clues
//   startAt      where the opening(s) sit: a placeOf value, or a list for two openings
//   twoFronts    the two openings sit far apart
//   t1Max        highest share of plainly certain (T1) pieces
//   decMin       at least this many decision moments (steps above T1)
//   liveMin      average rectangles the resolving clue still shows at a decision
//   deepMin      at least this many kesişim/eleme (T3/T4) moves
//   cornerMax    highest share of clues sitting in a corner of their piece
//   start [0, 0] no plainly certain opening; the first piece may need up to openTech (default T3)
//   pieces / pieceStyle  piece count range; "big" favours large pieces and long 1-wide strips
//   lockCount    hidden clues shown as a lock that opens after N placed pieces
//   effortTarget / dilemmaTarget  what the searches aim for
// Returns null when the analysed puzzle meets the spec, else the first failed rule.
function checkSpec(a, spec, layout) {
  if (!a.solved) return "needs guessing";
  if (a.maxTech > spec.maxTech) return `needs T${a.maxTech}`;
  const [smin, smax] = spec.start;
  if (smin === 0 && smax === 0) {
    // no plainly certain opening: the first piece already needs reasoning, never guessing
    if (a.startTech === 1) return "opening is plainly certain";
    if (a.startTech > (spec.openTech ?? 3)) return `opening needs T${a.startTech}`;
  } else {
    if (a.startTech !== 1) return "opening is not a plain T1";
    if (a.startOptions < smin || a.startOptions > smax) return `${a.startOptions} openings`;
  }
  const calm = spec.calm ?? 1;
  for (let s = a.startOptions; s < Math.min(a.startOptions + calm, a.steps.length); s++) {
    if (a.steps[s].tech > 2) return `T${a.steps[s].tech} right after the opening`;
  }
  if (spec.dilemmas) {
    const [dmin, dmax] = spec.dilemmas;
    if (a.dilemmas < dmin || a.dilemmas > dmax) return `${a.dilemmas} dilemmas`;
  }
  if (spec.minLookahead && a.techCounts[4] < spec.minLookahead) return "too few what-if moves";
  if (spec.maxT1Run != null && a.t1Run > spec.maxT1Run) return `T1 run of ${a.t1Run}`;
  if (spec.startRawMax && a.startRaw > spec.startRawMax) return "opening not obvious enough";
  if (spec.t1Max != null && a.t1Frac > spec.t1Max) return `${Math.round(a.t1Frac * 100)}% of pieces plainly certain`;
  if (spec.decMin && a.decisions < spec.decMin) return `${a.decisions} decision moments`;
  if (spec.liveMin && a.avgLive < spec.liveMin) return `${a.avgLive} options per decision`;
  if (spec.deepMin && a.deep < spec.deepMin) return `${a.deep} kesişim/eleme moves`;
  if (spec.cornerMax != null && a.cornerFrac > spec.cornerMax) return `${Math.round(a.cornerFrac * 100)}% of clues in a piece corner`;
  if (spec.startAt) {
    const want = [].concat(spec.startAt).sort().join();
    const got = a.steps[0].forcedAll.map((f) => placeOf(f.rect, layout.rows, layout.cols)).sort().join();
    if (want !== got) return `opening at ${got}, not ${want}`;
  }
  if (spec.twoFronts) {
    const f = a.steps[0].forcedAll;
    if (f.length !== 2) return "not two openings";
    const mid = (x) => [(x.r0 + x.r1) / 2, (x.c0 + x.c1) / 2];
    const [m1, m2] = [mid(f[0].rect), mid(f[1].rect)];
    if (Math.abs(m1[0] - m2[0]) + Math.abs(m1[1] - m2[1]) < (layout.rows + layout.cols) / 2) return "openings too close";
  }
  return null;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Random clue cells per zone, then single-clue moves that bring the puzzle closer to
// the spec. Openings, step limits and uniqueness are hard rules the whole way; the
// dilemma, what-if and T1-run targets are scored so the moves can climb towards them,
// and the result must meet the full spec. Deterministic for a given seed.
function searchClues(layout, spec, { iters = 20000, polish = 2500, seeds = 4, seed = 1 } = {}) {
  const rand = rng(seed);
  const cells = layout.zones.map((z) => {
    const out = [];
    for (let r = z.r0; r <= z.r1; r++) for (let c = z.c0; c <= z.c1; c++) out.push([r, c]);
    return out;
  });
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const hard = { ...spec, dilemmas: null, minLookahead: 0, maxT1Run: null };
  const evaluate = (clues) => {
    const p = { rows: layout.rows, cols: layout.cols, clues };
    if (countSolutions(p, 2) !== 1) return null;
    const a = analyse(p, { skipUnique: true });
    if (checkSpec(a, hard, layout)) return null;
    let miss = 0;
    if (spec.dilemmas) miss += Math.max(0, spec.dilemmas[0] - a.dilemmas) + Math.max(0, a.dilemmas - spec.dilemmas[1]);
    if (spec.minLookahead) miss += Math.max(0, spec.minLookahead - a.techCounts[4]);
    if (spec.maxT1Run != null) miss += Math.max(0, a.t1Run - spec.maxT1Run);
    let score = miss * 20 + a.startRaw * 0.6 + a.t1Run * 0.5;
    if (spec.effortTarget) score += Math.abs(a.effort - spec.effortTarget);
    if (spec.dilemmaTarget) score += Math.abs(a.dilemmas - spec.dilemmaTarget) * 3;
    return { clues, score, a };
  };
  const pool = [];
  for (let it = 0; it < iters; it++) {
    const hidden = new Set(spec.hidden || []);
    while (hidden.size < (spec.hiddenPick || 0)) hidden.add(pick(layout.zones).key);
    const clues = layout.zones.map((z, k) => {
      const [r, c] = pick(cells[k]);
      return hidden.has(z.key) ? { r, c, n: z.area, h: 1 } : { r, c, n: z.area };
    });
    const e = evaluate(clues);
    if (e) { pool.push(e); pool.sort((x, y) => x.score - y.score); pool.length = Math.min(pool.length, seeds); }
  }
  let best = null;
  for (let cur of pool) {
    for (let it = 0; it < polish; it++) {
      const k = Math.floor(rand() * layout.zones.length);
      const [r, c] = pick(cells[k]);
      if (cur.clues[k].r === r && cur.clues[k].c === c) continue;
      const clues = cur.clues.slice();
      clues[k] = { ...clues[k], r, c };
      const e = evaluate(clues);
      if (e && e.score <= cur.score) cur = e; // sideways moves let it cross flat stretches
    }
    if (!checkSpec(cur.a, spec, layout) && (!best || cur.score < best.score)) best = cur;
  }
  return best && best.clues;
}

// ---------- whole puzzles ----------
// how many placed pieces open a lock whose piece is solved at position `idx` (0-based)
const lockCounter = (idx, rand) => 2 + Math.floor(rand() * (Math.min(6, idx) - 1));

// Random tiling of a rows×cols board: the first empty cell in reading order is always a
// top-left corner, so a rectangle is picked there, weighted by area.
const AREA_WEIGHT = { 2: 0.5, 3: 0.8, 4: 1.4, 5: 0.9, 6: 1.6, 7: 0.4, 8: 1.4, 9: 1.1, 10: 1.1, 12: 1.0 };
// "big": few small pieces, many 5–14 areas and long 1-wide strips (the expert benchmark's mix)
const BIG_WEIGHT = { 2: 0.12, 3: 0.35, 4: 0.7, 5: 1.3, 6: 1.3, 7: 1.3, 8: 1.3, 9: 1.1, 10: 1.1, 12: 1.0, 14: 0.6, 15: 0.3, 16: 0.3 };
function randomTiling(R, C, rand, style) {
  const table = style === "big" ? BIG_WEIGHT : AREA_WEIGHT;
  const weight = (h, w) => {
    const base = table[h * w];
    if (!base) return 0;
    return style === "big" && (h === 1 || w === 1) && h * w >= 5 ? base * 1.8 : base;
  };
  const g = Array.from({ length: R }, () => Array(C).fill(-1));
  const rects = [];
  for (;;) {
    let r0 = -1, c0 = -1;
    for (let x = 0; x < R * C && r0 < 0; x++) if (g[Math.floor(x / C)][x % C] < 0) { r0 = Math.floor(x / C); c0 = x % C; }
    if (r0 < 0) return rects;
    const opts = [];
    let maxW = 0;
    while (c0 + maxW < C && g[r0][c0 + maxW] < 0) maxW++;
    for (let h = 1; r0 + h <= R && maxW > 0; h++) {
      for (let w = 1; w <= maxW; w++) {
        if (g[r0 + h - 1].slice(c0, c0 + w).some((v) => v >= 0)) { maxW = w - 1; break; }
        const wt = weight(h, w);
        if (wt) opts.push([h, w, wt]);
      }
    }
    if (!opts.length) return null;
    let x = rand() * opts.reduce((t, o) => t + o[2], 0), pick = opts[0];
    for (const o of opts) { x -= o[2]; if (x <= 0) { pick = o; break; } }
    const [h, w] = pick;
    for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) g[r][c] = rects.length;
    rects.push({ r0, c0, r1: r0 + h - 1, c1: c0 + w - 1, area: h * w });
  }
}

const KEYS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

// A whole level: many random tilings, clue cells sampled and then moved one at a time
// towards the spec (hard rules must hold; effort, certain-share, decisions, options and
// deep moves are scored). Returns { grid, clues, hidden } in pack format, or null.
function generatePuzzle(cols, rows, spec, { seed = 1, tilings = 40, samples = 400, polish = 1500, deadline = Infinity } = {}) {
  const late = () => Date.now() > deadline; // optional time budget: stop searching, keep the best so far
  const rand = rng(seed);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const hard = { ...spec, dilemmas: null, minLookahead: 0, maxT1Run: null, t1Max: null, decMin: 0, liveMin: 0, deepMin: 0, cornerMax: null };
  const lockCount = spec.lockCount || 0;
  // a lock opens after N placed pieces, so its piece must come late enough in the solve
  const lockable = (a, clues) => a.steps.map((s, idx) => ({ s, idx })).filter(({ s, idx }) => clues[s.clue].h && idx >= 2 && idx <= a.steps.length - 2);
  const scoreOf = (a) => {
    let sc = Math.abs(a.effort - (spec.effortTarget || a.effort)) + a.startRaw * 0.3;
    if (spec.t1Max != null) sc += Math.max(0, a.t1Frac - spec.t1Max) * 200;
    if (spec.decMin) sc += Math.max(0, spec.decMin - a.decisions) * 8;
    if (spec.liveMin) sc += Math.max(0, spec.liveMin - a.avgLive) * 15;
    if (spec.deepMin) sc += Math.max(0, spec.deepMin - a.deep) * 10;
    if (spec.cornerMax != null) sc += Math.max(0, a.cornerFrac - spec.cornerMax) * 120 + a.cornerFrac * 10;
    return sc;
  };
  let best = null;
  for (let t = 0, guard = 0; t < tilings && guard < tilings * 50 && !late(); guard++) {
    const rects = randomTiling(rows, cols, rand, spec.pieceStyle);
    if (!rects || (spec.pieces && (rects.length < spec.pieces[0] || rects.length > spec.pieces[1]))) continue;
    t++;
    const zones = rects.map((q, k) => ({ ...q, key: KEYS[k] }));
    const layout = { rows, cols, zones };
    const cells = rects.map((q) => { const o = []; for (let r = q.r0; r <= q.r1; r++) for (let c = q.c0; c <= q.c1; c++) o.push([r, c]); return o; });
    const evaluate = (clues) => {
      const p = { rows, cols, clues };
      if (countSolutions(p, 2) !== 1) return null;
      const a = analyse(p, { skipUnique: true });
      if (checkSpec(a, hard, layout)) return null;
      if (lockCount && lockable(a, clues).length < lockCount) return null;
      return { clues, a, sc: scoreOf(a), zones };
    };
    let cur = null;
    for (let s = 0; s < samples && !late(); s++) {
      const hid = new Set();
      while (hid.size < (spec.hiddenCount || 0) + lockCount) hid.add(Math.floor(rand() * rects.length));
      const e = evaluate(rects.map((q, k) => { const [r, c] = pick(cells[k]); return hid.has(k) ? { r, c, n: q.area, h: 1 } : { r, c, n: q.area }; }));
      if (e && (!cur || e.sc < cur.sc)) cur = e;
    }
    for (let it = 0; cur && it < polish && !late(); it++) {
      const k = Math.floor(rand() * rects.length);
      const [r, c] = pick(cells[k]);
      const clues = cur.clues.slice();
      clues[k] = { ...clues[k], r, c };
      const e = evaluate(clues);
      if (e && e.sc <= cur.sc) cur = e;
    }
    if (cur && !checkSpec(cur.a, spec, layout) && (!best || cur.sc < best.sc)) best = cur;
  }
  if (!best) return null;
  const grid = Array.from({ length: rows }, () => Array(cols).fill("."));
  best.zones.forEach((z) => { for (let r = z.r0; r <= z.r1; r++) for (let c = z.c0; c <= z.c1; c++) grid[r][c] = z.key; });
  // random hidden clues become locks; each opens after 2..min(6, its solve position) pieces,
  // so the solve never needs a piece before its lock is open
  const locks = {};
  const pool = lockable(best.a, best.clues).map((x) => ({ ...x, key: rand() })).sort((x, y) => x.key - y.key);
  pool.slice(0, lockCount).forEach(({ s, idx }) => {
    locks[best.zones[s.clue].key] = lockCounter(idx, rand);
  });
  return {
    grid: grid.map((row) => row.join("")),
    clues: Object.fromEntries(best.zones.map((z, k) => [z.key, [best.clues[k].r, best.clues[k].c]])),
    hidden: best.zones.filter((z, k) => best.clues[k].h && !(z.key in locks)).map((z) => z.key),
    locks,
  };
}


    const PROFILES = {"easy":{"sizes":[[6,6],[6,7]],"spec":{"start":[1,2],"maxTech":4,"pieces":[7,10],"effortTarget":32,"t1Max":0.5,"decMin":3,"liveMin":2.3,"hiddenCount":0}},"medium":{"sizes":[[7,7],[7,8]],"spec":{"start":[1,2],"maxTech":4,"pieces":[9,12],"effortTarget":62,"t1Max":0.38,"decMin":6,"liveMin":2.8,"deepMin":1,"hiddenCount":1}},"hard":{"sizes":[[8,8],[8,9],[7,10]],"spec":{"start":[1,1],"maxTech":4,"pieceStyle":"big","pieces":[10,13],"effortTarget":96,"t1Max":0.3,"decMin":8,"liveMin":3,"deepMin":2,"cornerMax":0.35,"hiddenCount":1,"lockCount":1}},"expert":{"sizes":[[8,10]],"spec":{"start":[0,0],"openTech":3,"calm":0,"maxTech":4,"pieceStyle":"big","pieces":[11,14],"effortTarget":128,"t1Max":0.25,"decMin":10,"liveMin":3,"deepMin":3,"cornerMax":0.35,"hiddenCount":2,"lockCount":1}}};
    const difficultyOf = (effort) => Math.min(100, Math.round(effort / 1.4));
    const tagOf = (d) => (d < 30 ? "easy" : d < 58 ? "medium" : d < 82 ? "hard" : "expert");
    function generateLevel(tag, seed) {
      const prof = PROFILES[tag];
      if (!prof) throw new Error("unknown difficulty " + tag);
      let best = null;
      const budget = Date.now() + 9000; // stop retrying after ~9 s and keep the closest valid puzzle
      for (let t = 0; t < 8 && (t === 0 || Date.now() < budget || !best); t++) {
        const s = (seed + t * 7919) >>> 0;
        const [cols, rows] = prof.sizes[s % prof.sizes.length];
        // vary the target inside the band so puzzles of one difficulty don't all feel the same
        const effortTarget = Math.round(prof.spec.effortTarget * (0.82 + ((s % 997) / 997) * 0.36));
        const p = generatePuzzle(cols, rows, { ...prof.spec, effortTarget, cols, rows }, { seed: s, tilings: 6, samples: 150, polish: 400, deadline: Date.now() + 3000 });
        if (!p) continue;
        const layout = parseLayout(p.grid);
        const locks = p.locks || {};
        const clues = layout.zones.map((z) => {
          const [r, c] = p.clues[z.key];
          return p.hidden.includes(z.key) || z.key in locks ? { r, c, n: z.area, h: 1 } : { r, c, n: z.area };
        });
        const a = analyse({ rows, cols, clues });
        if (!a.unique || !a.solved) continue;
        const difficulty = difficultyOf(a.effort);
        const level = {
          rows, cols,
          clues: layout.zones.map((z, k) => (z.key in locks ? { r: clues[k].r, c: clues[k].c, n: clues[k].n, lock: locks[z.key] } : clues[k])),
          solution: a.steps.map((st) => [st.rect.r0, st.rect.c0, st.rect.r1, st.rect.c1]),
          difficulty, tag: tagOf(difficulty),
        };
        if (level.tag === tag) return level;
        if (!best || Math.abs(level.difficulty - difficultyOf(prof.spec.effortTarget)) < Math.abs(best.difficulty - difficultyOf(prof.spec.effortTarget))) best = level;
      }
      return best;
    }
    if (scope) scope.onmessage = (e) => {
      try { scope.postMessage({ id: e.data.id, level: generateLevel(e.data.tag, e.data.seed) }); }
      catch (err) { scope.postMessage({ id: e.data.id, error: String(err && err.message || err) }); }
    };
    return { generateLevel };
  }

  let worker = null, nextId = 1;
  const pending = new Map();
  function getWorker() {
    if (worker !== null) return worker;
    try {
      const url = URL.createObjectURL(new Blob(["(" + pixhakuEngine.toString() + ")(self);"], { type: "text/javascript" }));
      worker = new Worker(url);
      worker.onmessage = (e) => {
        const job = pending.get(e.data.id);
        if (!job) return;
        pending.delete(e.data.id);
        if (e.data.error || !e.data.level) job.reject(new Error(e.data.error || "no level")); else job.resolve(e.data.level);
      };
    } catch (_) { worker = false; }
    return worker;
  }

  function generate(tag, seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0) {
    const w = getWorker();
    if (!w) {
      // no worker (some file previews): run on the page after a frame so the spinner shows
      return new Promise((resolve, reject) => setTimeout(() => {
        try { const level = pixhakuEngine(null).generateLevel(tag, seed); level ? resolve(level) : reject(new Error("no level")); }
        catch (err) { reject(err); }
      }, 30));
    }
    return new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      w.postMessage({ id, tag, seed });
    });
  }

  // reward picture: every piece of the solution as a soft tile in the game's palette
  const TINTS = ["#e7cf92", "#c9d59a", "#e9b98f", "#d9c3a0", "#b9cfa8", "#efd9a6", "#dfae8c", "#c5c08c", "#f1e2b8", "#d6b98a"];
  function mosaic(level) {
    const S = 48, canvas = document.createElement("canvas");
    canvas.width = level.cols * S; canvas.height = level.rows * S;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#51432f"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const owner = Array.from({ length: level.rows }, () => Array(level.cols).fill(-1));
    level.solution.forEach(([r0, c0, r1, c1], k) => { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) owner[r][c] = k; });
    const color = [];
    level.solution.forEach(([r0, c0, r1, c1], k) => {
      const near = new Set();
      for (let r = r0 - 1; r <= r1 + 1; r++) for (let c = c0 - 1; c <= c1 + 1; c++) {
        if (r >= 0 && c >= 0 && r < level.rows && c < level.cols && owner[r][c] !== k && owner[r][c] >= 0 && owner[r][c] < k) near.add(color[owner[r][c]]);
      }
      let i = k % TINTS.length;
      while (near.has(i)) i = (i + 1) % TINTS.length;
      color[k] = i;
      const x = c0 * S + 3, y = r0 * S + 3, w = (c1 - c0 + 1) * S - 6, h = (r1 - r0 + 1) * S - 6;
      ctx.fillStyle = TINTS[i]; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "#ffffff40"; ctx.fillRect(x, y, w, 4); ctx.fillRect(x, y, 4, h);
      ctx.fillStyle = "#0000001f"; ctx.fillRect(x, y + h - 4, w, 4); ctx.fillRect(x + w - 4, y, 4, h);
    });
    return canvas.toDataURL("image/png");
  }

  window.PixhakuGen = { generate, mosaic, tags: Object.keys({"easy":{"sizes":[[6,6],[6,7]],"spec":{"start":[1,2],"maxTech":4,"pieces":[7,10],"effortTarget":32,"t1Max":0.5,"decMin":3,"liveMin":2.3,"hiddenCount":0}},"medium":{"sizes":[[7,7],[7,8]],"spec":{"start":[1,2],"maxTech":4,"pieces":[9,12],"effortTarget":62,"t1Max":0.38,"decMin":6,"liveMin":2.8,"deepMin":1,"hiddenCount":1}},"hard":{"sizes":[[8,8],[8,9],[7,10]],"spec":{"start":[1,1],"maxTech":4,"pieceStyle":"big","pieces":[10,13],"effortTarget":96,"t1Max":0.3,"decMin":8,"liveMin":3,"deepMin":2,"cornerMax":0.35,"hiddenCount":1,"lockCount":1}},"expert":{"sizes":[[8,10]],"spec":{"start":[0,0],"openTech":3,"calm":0,"maxTech":4,"pieceStyle":"big","pieces":[11,14],"effortTarget":128,"t1Max":0.25,"decMin":10,"liveMin":3,"deepMin":3,"cornerMax":0.35,"hiddenCount":2,"lockCount":1}}}) };
})();
