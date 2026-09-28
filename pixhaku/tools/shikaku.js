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
//   effortTarget / dilemmaTarget  what searchClues aims for
// Returns null when the analysed puzzle meets the spec, else the first failed rule.
function checkSpec(a, spec, layout) {
  if (!a.solved) return "needs guessing";
  if (a.maxTech > spec.maxTech) return `needs T${a.maxTech}`;
  if (a.startTech !== 1) return "opening is not a plain T1";
  const [smin, smax] = spec.start;
  if (a.startOptions < smin || a.startOptions > smax) return `${a.startOptions} openings`;
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

module.exports = { prepare, countSolutions, humanSolve, analyse, parseLayout, placeOf, orient, checkSpec, searchClues };
