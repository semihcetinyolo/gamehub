(function (root) {
  'use strict';

  function rng(seed) {
    let s = seed >>> 0 || 1;
    return function () {
      s += 0x6d2b79f5;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Fisher–Yates: sort() with a random comparator gives different orders in different JS engines.
  function shuffle(a, rand) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  // Grow `count` blobs on a cols×rows grid; returns cell→region index.
  function growRegions(cols, rows, count, rand) {
    const n = cols * rows;
    const owner = new Int32Array(n).fill(-1);
    const sizes = [];
    const frontier = [];
    const seeds = new Set();
    while (seeds.size < count) seeds.add(Math.floor(rand() * n));
    [...seeds].forEach((c, r) => { owner[c] = r; sizes.push(1); frontier.push([c]); });
    let left = n - count;
    while (left > 0) {
      // Smaller regions grow first, with jitter, so sizes stay balanced but irregular.
      let best = -1, bestScore = Infinity;
      for (let r = 0; r < count; r++) {
        if (!frontier[r].length) continue;
        const sc = sizes[r] * (0.6 + rand() * 0.9);
        if (sc < bestScore) { bestScore = sc; best = r; }
      }
      if (best < 0) break;
      const f = frontier[best];
      const i = Math.floor(rand() * f.length);
      const c = f[i];
      const x = c % cols, y = (c / cols) | 0;
      const opts = [];
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const nc = ny * cols + nx;
        if (owner[nc] === -1) opts.push(nc);
      }
      if (!opts.length) { f.splice(i, 1); continue; }
      const nc = opts[Math.floor(rand() * opts.length)];
      owner[nc] = best; sizes[best]++; left--;
      f.push(nc);
    }
    return owner;
  }

  // Each cell is two triangles split by a diagonal.
  // orient 0: "\" diagonal -> atom0 = upper-right (top,right), atom1 = lower-left (left,bottom)
  // orient 1: "/" diagonal -> atom0 = upper-left (top,left),  atom1 = lower-right (right,bottom)
  function sideAtom(orient, side) {
    if (orient === 0) return (side === 'top' || side === 'right') ? 0 : 1;
    return (side === 'top' || side === 'left') ? 0 : 1;
  }

  function buildMap(cols, rows, count, rand) {
    const cellOwner = growRegions(cols, rows, count, rand);
    const at = (x, y) => (x < 0 || y < 0 || x >= cols || y >= rows) ? -1 : cellOwner[y * cols + x];
    const orient = new Uint8Array(cols * rows);
    const atoms = new Int32Array(cols * rows * 2);
    const cellCount = new Array(count).fill(0);
    for (let c = 0; c < cols * rows; c++) {
      atoms[c * 2] = atoms[c * 2 + 1] = cellOwner[c];
      cellCount[cellOwner[c]]++;
      orient[c] = rand() < 0.5 ? 0 : 1;
    }
    // Chamfer convex corners: hand the corner triangle to the region wrapping it.
    const corners = [
      { a: [0, -1], b: [-1, 0], orient: 1, atom: 0 }, // top-left
      { a: [0, -1], b: [1, 0], orient: 0, atom: 0 },  // top-right
      { a: [0, 1], b: [1, 0], orient: 1, atom: 1 },   // bottom-right
      { a: [0, 1], b: [-1, 0], orient: 0, atom: 1 },  // bottom-left
    ];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const c = y * cols + x, me = cellOwner[c];
        if (cellCount[me] < 3 || rand() > 0.55) continue;
        const order = shuffle(corners.slice(), rand);
        for (const k of order) {
          const ra = at(x + k.a[0], y + k.a[1]);
          const rb = at(x + k.b[0], y + k.b[1]);
          if (ra < 0 || ra !== rb || ra === me) continue;
          // The opposite neighbours must still be ours or the half-cell gets isolated.
          const oa = at(x - k.a[0], y - k.a[1]);
          const ob = at(x - k.b[0], y - k.b[1]);
          if (oa !== me && ob !== me) continue;
          orient[c] = k.orient;
          atoms[c * 2 + k.atom] = ra;
          break;
        }
      }
    }
    return removeCornerTouches(cols, rows, count, [...orient], [...atoms]);
  }


  // Two regions meeting only at a point look like neighbours to players but aren't
  // constrained, so repaint the triangles between them until they share an edge.
  function atomsAtVertex(cols, rows, orient, vx, vy) {
    const out = [];
    for (const [cx, cy] of [[vx - 1, vy - 1], [vx, vy - 1], [vx, vy], [vx - 1, vy]]) {
      if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) continue;
      const c = cy * cols + cx;
      for (let k = 0; k < 2; k++) {
        const tri = triangle(cx, cy, orient[c], k);
        if (tri.some(q => q[0] === vx && q[1] === vy)) out.push({ id: c * 2 + k, tri });
      }
    }
    return out;
  }
  const shareEdge = (a, b) => a.tri.filter(p => b.tri.some(q => q[0] === p[0] && q[1] === p[1])).length === 2;

  function findCornerTouch(map) {
    for (let vy = 0; vy <= map.rows; vy++) {
      for (let vx = 0; vx <= map.cols; vx++) {
        const around = atomsAtVertex(map.cols, map.rows, map.orient, vx, vy);
        const regs = [...new Set(around.map(a => map.atoms[a.id]))];
        for (const x of regs) for (const y of regs) {
          if (x < y && !map.adj[x].includes(y)) return { x, y, around };
        }
      }
    }
    return null;
  }

  function chainBetween(map, around, x, y, banned) {
    const prev = new Map();
    const queue = around.filter(a => map.atoms[a.id] === x);
    queue.forEach(a => prev.set(a.id, null));
    for (let i = 0; i < queue.length; i++) {
      for (const b of around) {
        if (prev.has(b.id) || banned.has(b.id) || !shareEdge(queue[i], b)) continue;
        prev.set(b.id, queue[i].id);
        if (map.atoms[b.id] === y) {
          const between = [];
          for (let id = queue[i].id; id != null && map.atoms[id] !== x; id = prev.get(id)) between.push(id);
          return between;
        }
        queue.push(b);
      }
    }
    return null;
  }

  function cornerFixes(map, t) {
    const fixes = [];
    const arc1 = chainBetween(map, t.around, t.x, t.y, new Set());
    const arc2 = arc1 && arc1.length ? chainBetween(map, t.around, t.x, t.y, new Set(arc1)) : null;
    for (const arc of [arc1, arc2]) {
      if (!arc || !arc.length) continue;
      fixes.push(arc.map(id => [id, t.x]), arc.map(id => [id, t.y]));
    }
    // Or pull one of the two regions back from the vertex.
    for (const z of [t.x, t.y]) {
      const mine = t.around.filter(a => map.atoms[a.id] === z);
      const others = new Set();
      for (const a of mine) for (const b of t.around) {
        const r = map.atoms[b.id];
        if (r !== t.x && r !== t.y && shareEdge(a, b)) others.add(r);
      }
      for (const r of others) fixes.push(mine.map(a => [a.id, r]));
    }
    return fixes;
  }

  function countCornerTouches(map) {
    let n = 0;
    for (let vy = 0; vy <= map.rows; vy++) {
      for (let vx = 0; vx <= map.cols; vx++) {
        const regs = [...new Set(atomsAtVertex(map.cols, map.rows, map.orient, vx, vy).map(a => map.atoms[a.id]))];
        for (const x of regs) for (const y of regs) if (x < y && !map.adj[x].includes(y)) n++;
      }
    }
    return n;
  }

  function removeCornerTouches(cols, rows, count, orient, atoms) {
    let map = finalize(cols, rows, count, orient, atoms);
    let touches = countCornerTouches(map);
    for (let guard = 0; guard < 200 && touches > 0; guard++) {
      const t = findCornerTouch(map);
      let best = null;
      for (const fix of cornerFixes(map, t)) {
        const next = map.atoms.slice();
        fix.forEach(([id, r]) => { next[id] = r; });
        if (!regionsConnected({ cols, rows, count, orient, atoms: next })) continue;
        const m = finalize(cols, rows, count, orient, next);
        const n = countCornerTouches(m);
        if (n < touches && (!best || n < best.n)) best = { m, n };
      }
      if (!best) return null;
      map = best.m; touches = best.n;
    }
    return touches ? null : map;
  }

  function finalize(cols, rows, count, orient, atoms) {
    const regionAtom = (x, y, side) => {
      const c = y * cols + x;
      return atoms[c * 2 + sideAtom(orient[c], side)];
    };
    const adjSets = Array.from({ length: count }, () => new Set());
    const edges = []; // boundary segments between different regions [x1,y1,x2,y2,a,b]
    const link = (a, b, seg) => {
      if (a === b) return;
      adjSets[a].add(b); adjSets[b].add(a);
      edges.push([...seg, a, b]);
    };
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const c = y * cols + x;
        const a0 = atoms[c * 2], a1 = atoms[c * 2 + 1];
        if (orient[c] === 0) link(a0, a1, [x, y, x + 1, y + 1]);
        else link(a0, a1, [x + 1, y, x, y + 1]);
        if (x + 1 < cols) link(regionAtom(x, y, 'right'), regionAtom(x + 1, y, 'left'), [x + 1, y, x + 1, y + 1]);
        if (y + 1 < rows) link(regionAtom(x, y, 'bottom'), regionAtom(x, y + 1, 'top'), [x, y + 1, x + 1, y + 1]);
      }
    }
    // Label anchor: the full cell of each region farthest from any boundary.
    const dist = new Int32Array(cols * rows).fill(999);
    const q = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const c = y * cols + x;
      const r = atoms[c * 2];
      let edge = atoms[c * 2 + 1] !== r;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const n = ny * cols + nx;
        if (atoms[n * 2] !== r || atoms[n * 2 + 1] !== r) edge = true;
      }
      if (edge) { dist[c] = 0; q.push(c); }
    }
    for (let i = 0; i < q.length; i++) {
      const c = q[i], x = c % cols, y = (c / cols) | 0;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const n = ny * cols + nx;
        if (dist[n] > dist[c] + 1) { dist[n] = dist[c] + 1; q.push(n); }
      }
    }
    const anchors = new Array(count).fill(null);
    const best = new Array(count).fill(-1);
    for (let c = 0; c < cols * rows; c++) {
      const r = atoms[c * 2];
      if (atoms[c * 2 + 1] !== r) continue;
      const x = c % cols, y = (c / cols) | 0;
      // Prefer interior cells, tie-break toward the region's middle via a tiny centre bias.
      const sc = dist[c] * 10 - Math.abs(x - cols / 2) * 0.01 - Math.abs(y - rows / 2) * 0.01;
      if (sc > best[r]) { best[r] = sc; anchors[r] = [x + 0.5, y + 0.5]; }
    }
    for (let r = 0; r < count; r++) {
      if (anchors[r]) continue;
      // Region with only half cells: use the triangle centroid.
      for (let c = 0; c < cols * rows && !anchors[r]; c++) {
        for (let k = 0; k < 2; k++) {
          if (atoms[c * 2 + k] !== r) continue;
          const x = c % cols, y = (c / cols) | 0;
          const tri = triangle(x, y, orient[c], k);
          anchors[r] = [(tri[0][0] + tri[1][0] + tri[2][0]) / 3, (tri[0][1] + tri[1][1] + tri[2][1]) / 3];
          break;
        }
      }
    }
    const adj = adjSets.map(s => [...s].sort((a, b) => a - b));
    return { cols, rows, count, orient: [...orient], atoms: [...atoms], adj, edges, anchors };
  }

  // Boundary segments of one region, including the outer frame.
  function regionOutline(map, r) {
    const { cols, rows, orient, atoms } = map;
    const segs = map.edges.filter(e => e[4] === r || e[5] === r).map(e => e.slice(0, 4));
    const owner = (x, y, side) => atoms[(y * cols + x) * 2 + sideAtom(orient[y * cols + x], side)];
    for (let x = 0; x < cols; x++) {
      if (owner(x, 0, 'top') === r) segs.push([x, 0, x + 1, 0]);
      if (owner(x, rows - 1, 'bottom') === r) segs.push([x, rows, x + 1, rows]);
    }
    for (let y = 0; y < rows; y++) {
      if (owner(0, y, 'left') === r) segs.push([0, y, 0, y + 1]);
      if (owner(cols - 1, y, 'right') === r) segs.push([cols, y, cols, y + 1]);
    }
    return segs;
  }

  function triangle(x, y, orient, k) {
    const TL = [x, y], TR = [x + 1, y], BR = [x + 1, y + 1], BL = [x, y + 1];
    if (orient === 0) return k === 0 ? [TL, TR, BR] : [TL, BR, BL];
    return k === 0 ? [TL, TR, BL] : [TR, BR, BL];
  }

  function regionsConnected(map) {
    const { cols, rows, count, atoms, orient } = map;
    const seen = new Uint8Array(cols * rows * 2);
    const comps = new Array(count).fill(0);
    const neighbours = (c, k) => {
      const x = c % cols, y = (c / cols) | 0, o = orient[c];
      const out = [[c, 1 - k]];
      const sides = o === 0 ? (k === 0 ? ['top', 'right'] : ['left', 'bottom']) : (k === 0 ? ['top', 'left'] : ['right', 'bottom']);
      for (const s of sides) {
        let nx = x, ny = y, opp;
        if (s === 'top') { ny--; opp = 'bottom'; } else if (s === 'bottom') { ny++; opp = 'top'; }
        else if (s === 'left') { nx--; opp = 'right'; } else { nx++; opp = 'left'; }
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const n = ny * cols + nx;
        out.push([n, sideAtom(orient[n], opp)]);
      }
      return out;
    };
    for (let i = 0; i < cols * rows * 2; i++) {
      if (seen[i]) continue;
      const r = atoms[i];
      comps[r]++;
      const st = [i]; seen[i] = 1;
      while (st.length) {
        const a = st.pop();
        for (const [n, k] of neighbours(a >> 1, a & 1)) {
          const id = n * 2 + k;
          if (!seen[id] && atoms[id] === r) { seen[id] = 1; st.push(id); }
        }
      }
    }
    return comps.every(v => v === 1);
  }

  // Count colourings (up to `limit`) consistent with fixed colours.
  function countSolutions(adj, fixed, k, limit) {
    const n = adj.length;
    const col = fixed.slice();
    let found = 0, first = null;
    const order = [];
    const placed = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (col[i] >= 0) placed[i] = 1;
    function pick() {
      let best = -1, bestFree = 99, bestDeg = -1;
      for (let i = 0; i < n; i++) {
        if (col[i] >= 0) continue;
        let mask = 0;
        for (const j of adj[i]) if (col[j] >= 0) mask |= 1 << col[j];
        let free = 0;
        for (let c = 0; c < k; c++) if (!(mask & (1 << c))) free++;
        if (free < bestFree || (free === bestFree && adj[i].length > bestDeg)) {
          best = i; bestFree = free; bestDeg = adj[i].length;
        }
      }
      return best;
    }
    function rec() {
      if (found >= limit) return;
      const i = pick();
      if (i < 0) { found++; if (!first) first = col.slice(); return; }
      let mask = 0;
      for (const j of adj[i]) if (col[j] >= 0) mask |= 1 << col[j];
      for (let c = 0; c < k; c++) {
        if (mask & (1 << c)) continue;
        col[i] = c; rec(); col[i] = -1;
        if (found >= limit) return;
      }
    }
    for (let i = 0; i < n; i++) {
      if (col[i] < 0) continue;
      for (const j of adj[i]) if (col[j] === col[i]) return { count: 0, solution: null };
    }
    rec();
    return { count: found, solution: first };
  }

  // Human-style deduction: elimination, then pairs, then "one region left for a colour" isn't valid
  // for maps, so: elimination + naked pairs + (optionally) one-step contradiction.
  function logicSolve(adj, fixed, k, allowProbe) {
    const n = adj.length;
    const full = (1 << k) - 1;
    let cand = fixed.map(c => c >= 0 ? 1 << c : full);
    const stats = { steps: 0, pairs: 0, probes: 0 };
    const bits = m => { let c = 0; while (m) { c += m & 1; m >>= 1; } return c; };

    function propagate(cd) {
      let changed = true;
      while (changed) {
        changed = false;
        for (let i = 0; i < n; i++) {
          if (bits(cd[i]) !== 1) continue;
          for (const j of adj[i]) {
            if (cd[j] & cd[i]) {
              cd[j] &= ~cd[i];
              if (!cd[j]) return false;
              changed = true;
            }
          }
        }
      }
      return true;
    }
    function pairs(cd) {
      let did = false;
      for (let i = 0; i < n; i++) {
        if (bits(cd[i]) !== 2) continue;
        for (const j of adj[i]) {
          if (j <= i || cd[j] !== cd[i]) continue;
          const common = adj[i].filter(x => x !== j && adj[j].includes(x));
          for (const x of common) {
            if (cd[x] & cd[i]) { cd[x] &= ~cd[i]; did = true; }
          }
        }
      }
      return did;
    }

    if (!propagate(cand)) return { solved: false, stats };
    for (let guard = 0; guard < 200; guard++) {
      if (cand.every(m => bits(m) === 1)) return { solved: true, stats, cand };
      stats.steps++;
      if (pairs(cand)) { stats.pairs++; if (!propagate(cand)) return { solved: false, stats }; continue; }
      if (!allowProbe) break;
      let progressed = false;
      for (let i = 0; i < n && !progressed; i++) {
        if (bits(cand[i]) < 2) continue;
        for (let c = 0; c < k; c++) {
          if (!(cand[i] & (1 << c))) continue;
          const t = cand.slice(); t[i] = 1 << c;
          if (!propagate(t)) { cand[i] &= ~(1 << c); progressed = true; stats.probes++; break; }
        }
      }
      if (!progressed) break;
      if (!propagate(cand)) return { solved: false, stats };
    }
    return { solved: cand.every(m => bits(m) === 1), stats, cand };
  }

  // Recolour so as many regions as possible see all other colours around them;
  // those regions can be deduced, so the puzzle needs fewer clues.
  function tighten(adj, start, k, rand) {
    const n = adj.length;
    const col = start.slice();
    const full = (1 << k) - 1;
    const seenMask = i => { let m = 0; for (const j of adj[i]) m |= 1 << col[j]; return m; };
    const forced = i => (seenMask(i) | (1 << col[i])) === full;
    const score = () => { let s = 0; for (let i = 0; i < n; i++) if (forced(i)) s++; return s; };
    let cur = score(), best = cur, bestCol = col.slice();
    for (let it = 0; it < n * 120; it++) {
      const i = Math.floor(rand() * n);
      const free = [];
      const m = seenMask(i);
      for (let c = 0; c < k; c++) if (c !== col[i] && !(m & (1 << c))) free.push(c);
      if (!free.length) continue;
      const old = col[i];
      col[i] = free[Math.floor(rand() * free.length)];
      const s = score();
      const temp = 1 - it / (n * 120);
      if (s >= cur || rand() < 0.15 * temp) {
        cur = s;
        if (s > best) { best = s; bestCol = col.slice(); }
      } else col[i] = old;
    }
    return bestCol;
  }

  const DIFFICULTY = [
    { cols: 7, rows: 9, regions: 16, probe: false },
    { cols: 7, rows: 9, regions: 20, probe: false },
    { cols: 8, rows: 10, regions: 24, probe: false },
    { cols: 8, rows: 10, regions: 28, probe: true },
    { cols: 9, rows: 12, regions: 34, probe: true },
  ];

  function tierFor(level) {
    if (level <= 2) return 0;
    if (level <= 5) return 1;
    if (level <= 9) return 2;
    if (level <= 14) return 3;
    return 4;
  }

  function generate(level, colors) {
    const k = colors || 4;
    const tier = tierFor(level);
    const tries = [1, 2, 4, 8, 10][tier];
    let best = null;
    for (let t = 0; t < tries; t++) {
      const p = generateOnce(level, k, tier, t * 50);
      const sc = p.clues / p.map.count - (p.stats.pairs + p.stats.probes) * 0.03;
      if (!best || sc < best.sc) best = { p, sc };
    }
    best.p.locks = addLocks(best.p, lockCountFor(level), DIFFICULTY[tier].probe);
    return best.p;
  }

  function lockCountFor(level) {
    if (level < 5) return 0;
    if (level < 12) return 1;
    return 2;
  }

  // Empty regions the logic solver can settle while the `hidden` clues are still covered.
  function progressWithout(p, hidden, probe) {
    const given = p.given.map((c, r) => (hidden.includes(r) ? -1 : c));
    const res = logicSolve(p.map.adj, given, p.colors, probe);
    if (!res.cand) return 0;
    let n = 0;
    for (let r = 0; r < p.map.count; r++) {
      const m = res.cand[r];
      if (p.given[r] < 0 && m && !(m & (m - 1))) n++;
    }
    return n;
  }

  // Locked clues hide their colour until k regions are painted. k never exceeds what the
  // player can deduce with the lock still closed, so a lock can't stall the puzzle.
  function addLocks(p, want, probe) {
    if (!want) return [];
    const rand = rng(p.level * 4241 + 99);
    const area = new Array(p.map.count).fill(0);
    p.map.atoms.forEach(r => { area[r]++; });
    const empties = p.given.filter(c => c < 0).length;
    const cands = shuffle(p.given.map((c, r) => r).filter(r => p.given[r] >= 0 && area[r] >= 3), rand)
      .map(r => ({ r, alone: progressWithout(p, [r], probe) }));
    const locks = [];
    // First lock should bite mid-solve, a second one later on.
    for (const target of [0.45, 0.75].slice(0, want)) {
      const floor = locks.length ? locks[locks.length - 1].k + 1 : 2;
      const order = cands.filter(c => !locks.some(l => l.r === c.r))
        .sort((x, y) => Math.abs(x.alone / empties - target) - Math.abs(y.alone / empties - target));
      for (const c of order) {
        const k = Math.max(floor, Math.round(c.alone * 0.85));
        if (k > c.alone) continue;
        const trial = locks.concat({ r: c.r, k });
        if (!trial.every((l, i) => progressWithout(p, trial.slice(i).map(x => x.r), probe) >= l.k)) continue;
        locks.push({ r: c.r, k });
        break;
      }
    }
    return locks;
  }


  function generateOnce(level, k, tier, offset) {
    const spec = DIFFICULTY[tier];
    for (let attempt = offset; attempt < offset + 50; attempt++) {
      const rand = rng(level * 7919 + attempt * 104729 + 17);
      const map = buildMap(spec.cols, spec.rows, spec.regions, rand);
      if (!map || !regionsConnected(map)) continue;
      const base = countSolutions(map.adj, new Array(map.count).fill(-1), k, 1).solution;
      if (!base) continue;
      const solution = tighten(map.adj, base, k, rand);
      const given = solution.slice();
      const order = shuffle([...Array(map.count).keys()], rand);
      for (const r of order) {
        const keep = given[r];
        given[r] = -1;
        const ok = logicSolve(map.adj, given, k, spec.probe).solved
          && countSolutions(map.adj, given, k, 2).count === 1;
        if (!ok) given[r] = keep;
      }
      const res = logicSolve(map.adj, given, k, spec.probe);
      return {
        level, seed: attempt, colors: k, map, solution, given,
        clues: given.filter(c => c >= 0).length,
        stats: res.stats,
      };
    }
    throw new Error('generate failed for level ' + level);
  }

  const api = { rng, generate, buildMap, findCornerTouch, progressWithout, countSolutions, logicSolve, triangle, regionOutline,regionsConnected, DIFFICULTY, tierFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CartoEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
