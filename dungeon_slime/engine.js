// Jelly Squish — pure game logic (no DOM). Loaded by index.html and by tools/verify.js.
//
// Continuous, not grid-snapped (like Dungeon Slime): Jöli is a free-floating rectangle at any
// (x, y) in one of three fixed forms, exactly like the original game (sizes in background tiles):
//   SQUARE 4×4 (start)  ->  THIN 2×6  ->  THINNEST 1×8
//   (lying down: FLAT 6×2 -> FLATTEST 8×1)
// The forms are one chain:  FLATTEST 8×1 <-> FLAT 6×2 <-> SQUARE 4×4 <-> THIN 2×6 <-> THINNEST 1×8.
// A swipe slides it until its leading face touches something. On a real hit — however short the
// slide — it moves ONE step along the chain, centred on where it was and flush with what it hit:
// a side wall steps toward THINNEST, the floor/ceiling steps toward FLATTEST (so a flat Jöli that
// hits a side wall becomes a square again). If the new form overlaps
// a wall it shifts along the surface to the nearest free spot that still touches the old body;
// with no room at all the form stays. Swiping into what it already touches does nothing.
// Passages are plain geometry: 4-wide gaps take the square, 2-wide gaps need THIN, 1-wide gaps
// need THINNEST — exact fits, so Jöli must be flush-aligned (e.g. by hugging a wall).
// Hazard cells are solid wall material. ANY contact with a hazardous wall, including
// grazing its edge, is a fail. The renderer uses the same boundary for # and *.
// A level can be several rooms joined by narrow doors; only the final exit (E) ends it.
//
// Levels are drawn in ASCII purely as an authoring convenience (1 char = 1 unit of wall);
// the body is never snapped to those units.
//   #  wall                      .  floor
//   S  start: top-left of Jöli's 4×4 start square
//   E  exit aperture: the entire body must fit across it (and have the key if needed)
//   *  hazardous solid wall: touching any exposed face or corner = fail
//   w  wafer block: first hit cracks it, the next hit breaks it and Jöli slides through
//   k  sugar key (opens the exit)     g  hidden gem (3rd star)
//   o  star stone (each rectangular blob is one sliding stone)
//   b  star pressure plate (active only while a stone rests on it)
//   !  hazardous passage, removed by its linked plate (gateButtons maps gate -> plate)
(function (root) {
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const EPS = 1e-6;
  const SQ = 4;
  // the chain of forms, index -2..2: [w, h]
  const FORMS = { '-2': [8, 1], '-1': [6, 2], 0: [4, 4], 1: [2, 6], 2: [1, 8] };
  const formOf = b => b.w === b.h ? 0 : b.h > b.w ? (b.h >= 8 ? 2 : 1) : (b.w >= 8 ? -2 : -1);
  const TOUCH = 1e-4;               // spike contact tolerance: flush counts as touching
  const SHAPES = { square: [4, 4], thin: [2, 6], thinnest: [1, 8] };
  const vertical = d => d === 'up' || d === 'down';
  const rnd = v => Math.round(v * 1e6) / 1e6;
  const shapeOf = (w, h) => w === h ? 'square' : w > h ? (w >= 8 ? 'flattest' : 'flat') : (h >= 8 ? 'thinnest' : 'thin');
  const perpOverlap = (b, r, d) => vertical(d)
    ? (r.x < b.x + b.w - EPS && r.x + r.w > b.x + EPS)
    : (r.y < b.y + b.h - EPS && r.y + r.h > b.y + EPS);

  function parse(level) {
    const rows = level.grid;
    const H = rows.length, W = Math.max(...rows.map(r => r.length));
    const cells = [];
    let start = null;
    for (let y = 0; y < H; y++) {
      cells.push([]);
      for (let x = 0; x < W; x++) {
        let c = rows[y][x] || '#';
        if (c === ' ') c = '#';
        if (c === 'S') { if (!start) start = [x, y]; c = '.'; }
        cells[y].push(c);
      }
    }
    if (!start) throw new Error('level has no S: ' + level.name);
    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? '#' : cells[y][x];
    const runs = ch => { // merge horizontal runs of one char into rects
      const out = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (cells[y][x] !== ch) continue;
        let x2 = x; while (x2 + 1 < W && cells[y][x2 + 1] === ch) x2++;
        out.push({ x, y, w: x2 - x + 1, h: 1 }); x = x2;
      }
      return out;
    };
    const ones = ch => { const r = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (cells[y][x] === ch) r.push({ x, y, w: 1, h: 1 }); return r; };
    // bounding boxes of 4-connected blobs of one char (items are drawn and act per blob)
    const blobs = ch => {
      const out = [], seen = new Set();
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (cells[y][x] !== ch || seen.has(x + ',' + y)) continue;
        let x0 = x, y0 = y, x1 = x, y1 = y; const q = [[x, y]]; seen.add(x + ',' + y);
        while (q.length) {
          const [cx, cy] = q.pop(); x0 = Math.min(x0, cx); y0 = Math.min(y0, cy); x1 = Math.max(x1, cx); y1 = Math.max(y1, cy);
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = (cx + dx) + ',' + (cy + dy); if (at(cx + dx, cy + dy) === ch && !seen.has(k)) { seen.add(k); q.push([cx + dx, cy + dy]); } }
        }
        out.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
      }
      return out;
    };
    // wafers: each 4-connected blob is one breakable block
    const wafers = [], seen = new Set();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (cells[y][x] !== 'w' || seen.has(x + ',' + y)) continue;
      const blob = [], q = [[x, y]]; seen.add(x + ',' + y);
      while (q.length) {
        const [cx, cy] = q.pop(); blob.push({ x: cx, y: cy, w: 1, h: 1 });
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const k = (cx + dx) + ',' + (cy + dy);
          if (at(cx + dx, cy + dy) === 'w' && !seen.has(k)) { seen.add(k); q.push([cx + dx, cy + dy]); }
        }
      }
      wafers.push(blob);
    }
    const solids = [
      ...runs('#').map(r => ({ ...r, t: 'wall' })),
      ...runs('*').map(r => ({ ...r, t: 'spike' })),
    ];
    wafers.forEach((blob, i) => blob.forEach(r => solids.push({ ...r, t: 'wafer', i })));
    const keys = ones('k'), gems = ones('g'), rocks=blobs('o'), buttons=blobs('b');
    const gates=blobs('!').map((r,i)=>({...r,button:level.gateButtons?.[i]??Math.min(i,buttons.length-1)}));
    return {
      name: level.name, W, H, cells, start, solids, wafers, exit: runs('E'), portals:blobs('E'),
      keys, gems, blobs, rocks, buttons, gates, hasKey: keys.length > 0, hasGem: gems.length > 0,
    };
  }
  const cellAt = (L, x, y) => (x < 0 || y < 0 || x >= L.W || y >= L.H) ? '#' : L.cells[y][x];

  function initialState(L) {
    const s = { x: L.start[0], y: L.start[1], w: SQ, h: SQ, key: false, gem: false, wafer: L.wafers.map(() => 0), rocks:L.rocks.map(r=>({...r})), switches:L.buttons.map(()=>false) };
    pick(L, s, s);
    return s;
  }

  const overlap = (a, b) => a.x < b.x + b.w - EPS && a.x + a.w > b.x + EPS && a.y < b.y + b.h - EPS && a.y + a.h > b.y + EPS;
  const exitOpen = (L, s) => !L.hasKey || s.key;
  const fitsExit=(b,e,dir)=>vertical(dir)
    ? b.x>=e.x-EPS&&b.x+b.w<=e.x+e.w+EPS
    : b.y>=e.y-EPS&&b.y+b.h<=e.y+e.h+EPS;
  const gateOpen=(L,s,i)=>!!s.switches[L.gates[i].button];
  const pressedButtons=(L,rocks)=>L.buttons.map(p=>rocks.some(r=>
    r.x>=p.x-EPS&&r.y>=p.y-EPS&&r.x+r.w<=p.x+p.w+EPS&&r.y+r.h<=p.y+p.h+EPS));
  function solidsFor(L, s) {
    const out = L.solids.filter(r => r.t !== 'wafer' || s.wafer[r.i] < 2);
    out.push(...s.rocks.map((r,i)=>({...r,t:'rock',i})),...L.gates.filter((_,i)=>!gateOpen(L,s,i)).map(r=>({...r,t:'spike'})));
    return exitOpen(L, s) ? out : out.concat(L.exit.map(r => ({ ...r, t: 'wall' })));
  }
  function fits(L, s, b) { return !solidsFor(L, s).some(r => overlap(r, b)); }
  function pick(L, s, b) {
    if (L.keys.some(r => overlap(r, b))) s.key = true;
    if (L.gems.some(r => overlap(r, b))) s.gem = true;
  }

  // Distance body b can travel in d before touching rect r (Infinity if r is not ahead).
  function gap(b, r, d) {
    if (!perpOverlap(b, r, d)) return Infinity;
    let g;
    if (d === 'right') g = r.x - (b.x + b.w);
    if (d === 'left') g = b.x - (r.x + r.w);
    if (d === 'down') g = r.y - (b.y + b.h);
    if (d === 'up') g = b.y - (r.y + r.h);
    return g > -EPS ? Math.max(0, g) : Infinity;
  }
  const shift = (b, d, t) => { const [dx, dy] = DIRS[d]; return { ...b, x: rnd(b.x + dx * t), y: rnd(b.y + dy * t) }; };
  const spikesOf = (L,s) => L.solids.filter(r => r.t === 'spike').concat(L.gates.filter((_,i)=>!gateOpen(L,s,i)));
  const touches = (a, b) => a.x <= b.x + b.w + TOUCH && a.x + a.w >= b.x - TOUCH && a.y <= b.y + b.h + TOUCH && a.y + a.h >= b.y - TOUCH;
  // Earliest distance in [0, maxT] at which body b, sliding in d, touches any spike (or Infinity).
  function spikeContact(L, s, b, d, maxT) {
    let best = Infinity;
    for (const r of spikesOf(L,s)) {
      const perp = vertical(d) ? (r.x <= b.x + b.w + TOUCH && r.x + r.w >= b.x - TOUCH) : (r.y <= b.y + b.h + TOUCH && r.y + r.h >= b.y - TOUCH);
      if (!perp) continue;
      let lo, hi;
      if (d === 'right') { lo = r.x - b.x - b.w; hi = r.x + r.w - b.x; }
      if (d === 'left') { lo = b.x - r.x - r.w; hi = b.x + b.w - r.x; }
      if (d === 'down') { lo = r.y - b.y - b.h; hi = r.y + r.h - b.y; }
      if (d === 'up') { lo = b.y - r.y - r.h; hi = b.y + b.h - r.y; }
      const t0 = Math.max(0, lo - TOUCH);
      if (t0 <= Math.min(maxT, hi + TOUCH) && t0 < best) best = t0;
    }
    return best;
  }

  function launchStone(L,s,index,dir) {
    const from={...s.rocks[index]};
    const before=s.switches.slice();
    // A departing stone releases its plate immediately. The returning hazard is
    // already an obstacle for this launch, so a stone cannot coast through it.
    const travellingSwitches=pressedButtons(L,s.rocks.filter((_,i)=>i!==index));
    // Stones do not leave through exits or move other stones in a chain.
    const obstacles=solidsFor(L,{...s,switches:travellingSwitches}).filter(r=>r.t!=='rock'||r.i!==index).concat(L.exit);
    obstacles.push({x:-1,y:0,w:1,h:L.H},{x:L.W,y:0,w:1,h:L.H},{x:0,y:-1,w:L.W,h:1},{x:0,y:L.H,w:L.W,h:1});
    let distance=Math.min(...obstacles.map(r=>gap(from,r,dir))),button=-1;
    for(let i=0;i<L.buttons.length;i++){
      const plate=L.buttons[i],along=vertical(dir),perp=along?'x':'y',size=along?'w':'h';
      if(from[perp]<plate[perp]-EPS||from[perp]+from[size]>plate[perp]+plate[size]+EPS)continue;
      const target=along?plate.y+(plate.h-from.h)/2:plate.x+(plate.w-from.w)/2;
      const delta=(target-(along?from.y:from.x))*(dir==='up'||dir==='left'?-1:1);
      if(delta>EPS&&delta<=distance+EPS){distance=delta;button=i;}
    }
    if(!Number.isFinite(distance)||distance<=EPS)return null;
    const to=shift(from,dir,distance);s.rocks[index]=to;
    s.switches=pressedButtons(L,s.rocks);
    const released=before.flatMap((on,i)=>on&&!travellingSwitches[i]?[i]:[]);
    const activated=button>=0&&!travellingSwitches[button]&&s.switches[button];
    return {index,from,to,button,activated,released};
  }

  // Step one form along the chain against the face hit while moving in d (a side wall -> thinner,
  // floor/ceiling -> flatter). Returns the new rect or null (no room).
  function spread(L, s, b, d) {
    const f = formOf(b);
    const nf = Math.max(-2, Math.min(2, f + (vertical(d) ? -1 : 1)));
    if (nf === f) return null;
    const [nw, nh] = FORMS[nf];
    return place(solidsFor(L, s), b, d, nw, nh);
  }
  // Put a nw×nh body flush with the face b hit (moving in d), centred on b, else the nearest
  // free spot along the surface that still touches the old body.
  function place(sol, b, d, nw, nh) {
    const alongX = vertical(d);
    const from = alongX ? b.x : b.y, oldLen = alongX ? b.w : b.h, newLen = alongX ? nw : nh;
    let fixed;
    if (d === 'right') fixed = b.x + b.w - nw;
    if (d === 'left') fixed = b.x;
    if (d === 'down') fixed = b.y + b.h - nh;
    if (d === 'up') fixed = b.y;
    const ideal = from + (oldLen - newLen) / 2;
    const cand = [ideal];
    for (const r of sol) {
      const a = alongX ? r.x : r.y, len = alongX ? r.w : r.h;
      cand.push(a + len, a - newLen); // butt up against either side of each solid
    }
    const ok = cand.map(rnd)
      .filter(p => p < from + oldLen - EPS && p + newLen > from + EPS)
      .sort((p, q) => Math.abs(p - ideal) - Math.abs(q - ideal) || p - q);
    for (const p of ok) {
      const r = alongX ? { x: p, y: rnd(fixed), w: nw, h: nh } : { x: rnd(fixed), y: p, w: nw, h: nh };
      if (!sol.some(q => overlap(q, r))) return r;
    }
    return null;
  }

  // Slide Jöli one swipe. Returns { state, result, path, impact }.
  //   result: 'stop' | 'win' | 'dead' | 'none' (nothing changed, not counted as a move)
  //   path:   [{x,y,ev?}] points the body's top-left passes through, in order (the size stays
  //           the same until the end); ev: 'break' (wafer burst)
  //   impact: {dir, rects, kinds, reshaped} what the leading face hit at the end
  function move(L, s0, dir) {
    const s = { ...s0, wafer: s0.wafer.slice(),rocks:s0.rocks.map(r=>({...r})),switches:s0.switches.slice() };
    let b = { x: s.x, y: s.y, w: s.w, h: s.h };
    const path = [];
    let impact = null, result = 'stop', travelled = 0, broke = false;
    const sign = dir === 'right' || dir === 'down' ? 1 : -1;
    for (let guard = 0; guard < 50; guard++) {
      const sol = solidsFor(L, s);
      let dmin = Infinity;
      for (const r of sol) dmin = Math.min(dmin, gap(b, r, dir));
      if (dmin === Infinity) dmin = Math.max(0, gap(b, { x: dir === 'left' ? -1 : dir === 'right' ? L.W : b.x, y: dir === 'up' ? -1 : dir === 'down' ? L.H : b.y, w: 1, h: 1 }, dir)); // board edge
      // Partial contact is not an escape: the whole leading face must fit the aperture.
      let de = Infinity;
      if (exitOpen(L, s)) for (const r of L.portals) if(fitsExit(b,r,dir)) de = Math.min(de, gap(b, r, dir));
      const stop = dmin;
      const tk = spikeContact(L, s, b, dir, Math.min(stop, de + .6));
      if (tk !== Infinity && (de === Infinity || tk < de + EPS)) { // grazed a spike on the way
        b = shift(b, dir, tk); travelled += tk; path.push({ x: b.x, y: b.y });
        impact = { dir, rects: spikesOf(L,s).filter(r => touches(r, b)), kinds: ['spike'], reshaped: false };
        result = 'dead'; break;
      }
      if (de !== Infinity && de < stop + EPS) {
        const t = Math.min(stop, de + .6);
        const nb = shift(b, dir, t);
        pick(L, s, sweep(b, nb)); b = nb; travelled += t;
        path.push({ x: b.x, y: b.y }); result = 'win'; break;
      }
      if (stop > EPS) {
        const nb = shift(b, dir, stop);
        pick(L, s, sweep(b, nb)); b = nb; travelled += stop;
        path.push({ x: b.x, y: b.y });
      }
      const hit = sol.filter(r => gap(b, r, dir) < EPS);
      const kinds = hit.map(r => r.t);
      const launches=hit.filter(r=>r.t==='rock').map(r=>launchStone(L,s,r.i,dir)).filter(Boolean);
      if(launches.length)path.push({x:b.x,y:b.y,ev:'push',launches});
      if(launches.some(f=>f.released.length)&&spikesOf(L,s).some(r=>touches(r,b))){
        impact={dir,rects:spikesOf(L,s).filter(r=>touches(r,b)),kinds:['spike'],reshaped:false};
        result='dead';break;
      }
      if (!travelled && !broke && !launches.length) break; // resting against a fixed obstacle
      impact = { dir, rects: hit, kinds, reshaped: false };
      if (kinds.includes('spike')) { result = 'dead'; break; }
      let allCracked = hit.length > 0 && hit.every(r => r.t === 'wafer');
      for (const i of new Set(hit.filter(r => r.t === 'wafer').map(r => r.i))) {
        if (s.wafer[i] === 1) s.wafer[i] = 2; else { s.wafer[i] = 1; allCracked = false; }
      }
      if (allCracked) { path.push({ x: b.x, y: b.y, ev: 'break' }); impact = null; broke = true; continue; } // burst through
      const r = spread(L, s, b, dir);
      if (r) {
        b = r; impact.reshaped = true; pick(L, s, b);
        if (spikesOf(L,s).some(q => touches(q, b))) result = 'dead'; // spread onto a spike
      }
      break;
    }
    Object.assign(s, b);
    const changed = s.x !== s0.x || s.y !== s0.y || s.w !== s0.w || s.wafer.some((v, i) => v !== s0.wafer[i]) || s.rocks.some((r,i)=>r.x!==s0.rocks[i].x||r.y!==s0.rocks[i].y);
    if (result === 'stop' && !changed) result = 'none';
    return { state: s, result, path, impact };
  }
  const sweep = (a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x) + a.w, h: Math.abs(b.y - a.y) + a.h });
  const grow = (b, e) => ({ x: b.x - e, y: b.y - e, w: b.w + 2 * e, h: b.h + 2 * e });

  // Layout rules the level must follow (returns a list of problems).
  function lint(L) {
    const bad = [];
    for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) {
      if (L.cells[y][x] !== '*') continue;
      const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => cellAt(L, x + dx, y + dy));
      if (!n.includes('#') && !n.includes('*')) bad.push(`spike at ${x},${y} is not on a wall surface`);
      if (!n.some(c => c !== '#' && c !== '*')) bad.push(`spike at ${x},${y} faces nothing`);
    }
    const s = initialState(L);
    if (!fits(L, s, s)) bad.push('start body does not fit');
    if (spikesOf(L,s).some(q => touches(q, s))) bad.push('start body touches a spike');
    for(const [i,gate] of L.gates.entries())if(!L.buttons[gate.button])bad.push(`gate ${i} has no linked star plate`);
    for(const [i,rock] of L.rocks.entries()){
      if(solidsFor(L,s).some(r=>(r.t!=='rock'||r.i!==i)&&overlap(r,rock)))bad.push(`stone ${i} overlaps an obstacle`);
      if(rock.w!==2||rock.h!==2)bad.push(`stone ${i} must be a 2×2 rectangle`);
    }
    for(const [i,button] of L.buttons.entries())if(button.w<2||button.h<2)bad.push(`plate ${i} is too small for a stone`);
    return bad;
  }

  const keyOf = s => `${s.x},${s.y},${s.w},${+s.key},${+s.gem},${s.wafer.join('')}|${s.rocks.map(r=>r.x+','+r.y).join(';')}|${s.switches.map(Number).join('')}`;

  // Breadth-first search for the shortest winning swipe sequence from state s.
  function solve(L, s, needGem = false, limit = 60000) {
    const prev = new Map([[keyOf(s), null]]);
    let frontier = [s];
    while (frontier.length && prev.size < limit) {
      const next = [];
      for (const cur of frontier) {
        for (const dir of Object.keys(DIRS)) {
          const r = move(L, cur, dir);
          if (r.result === 'none' || r.result === 'dead') continue;
          if (r.result === 'win' && (!needGem || r.state.gem)) {
            const path = [dir];
            let k = keyOf(cur);
            while (prev.get(k)) { const p = prev.get(k); path.unshift(p.dir); k = p.from; }
            return { path, explored: prev.size };
          }
          if (r.result === 'win') continue;
          const k = keyOf(r.state);
          if (prev.has(k)) continue;
          prev.set(k, { from: keyOf(cur), dir });
          next.push(r.state);
        }
      }
      frontier = next;
    }
    return null;
  }

  const api = { DIRS, SHAPES, SQ, TOUCH, shapeOf, touches, parse, initialState, move, solve, keyOf, cellAt, lint, fits,gateOpen,solidsFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JellyEngine = api;
})(this);
