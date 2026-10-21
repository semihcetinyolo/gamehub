// Word Train — the train view every variant uses. A wooden toy locomotive pulls flatcars along a track laid
// out like lines of text, tightly stacked: the bottom row runs right to left, a short U-turn on the left
// leads up to the next row (left to right), and so on; the last row runs off screen (dashed ahead of the
// locomotive). Cars never turn, so words always read left to right. The bottom row always holds the pair
// that makes the current phrase: the previous word's wagon and, coupled to its right, the empty car being
// searched — [KİTAP]=[K_____]. Everything older flows over the rows above like words in a paragraph.
// Found words ride in their base form: as the train moves on, the suffix blocks fall off the car
// (BAHÇESİ → BAHÇE; KAPAĞI → KAPA + K), so the bottom row always reads as the start of the next phrase.
// At the level end (core/levelend.js) the bottom track becomes the platform of a result station: enterEnd().
// core/theme.css paints the pieces, core/train.css sizes them (--wt-k).

import { suffixSplit } from './logic.js';

const TONES = 5;
const BLOCK = 24;       // px: letter block width on the cars above the bottom row
const PAIR = 26;        // px: blocks of the phrase pair on the bottom row (both cars always the same size)
const GAP = 16;         // px between neighbouring vehicles on a row (drawbar length)
const PITCH = 78;       // px between rows: a 68 px car + 10
const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const SVG = 'http://www.w3.org/2000/svg';

function h(tag, className, attrs = {}) {
  const node = document.createElement(tag);
  node.className = className;
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

function svg(tag, attrs = {}) {
  const node = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

function block(ch, tone, i, kind = '') {
  const node = h('span', `wt-block${kind ? ` wt-block--${kind}` : ''}`);
  node.dataset.tone = tone;
  node.style.setProperty('--wt-letter-i', i);
  const face = h('span', 'wt-block__face');
  face.textContent = ch;
  node.append(face);
  return node;
}

// '?' (or empty) = one question block; otherwise '_'/'·' = empty slot, a leading letter = the given
// first letter, any later letter = a hint block.
function ghostBlocks(text, seed) {
  const chars = Array.from(text);
  if (!chars.length || text === '?') return [block('?', 0, 0, 'ask')];
  return chars.map((ch, i) => ch === '_' || ch === '·'
    ? block('', 0, i, 'slot')
    : block(ch, (seed + i) % TONES, i, i === 0 ? 'given' : 'hint'));
}

function buildCar(kind) {
  const car = kind === 'ghost'
    ? h('div', 'wt-wagon wt-wagon--ghost', { 'aria-label': 'Sıradaki kelime' })
    : h('button', 'wt-wagon', { type: 'button' });
  const cargo = h('span', 'wt-wagon__cargo', { 'aria-hidden': 'true' });
  car.append(h('span', 'wt-wagon__coupler', { 'aria-hidden': 'true' }), cargo,
    h('span', 'wt-wagon__deck', { 'aria-hidden': 'true' }),
    ...['front', 'front2', 'back2', 'back'].map(end =>
      h('span', `wt-wagon__wheel wt-wagon__wheel--${end}`, { 'aria-hidden': 'true' })));
  return { car, cargo };
}

/**
 * Track rows for a W×H area (astra-art's row layout): rows PITCH·k apart from the bottom (H − 18) up, as
 * many as leave 100 px above the top one for the locomotive (1–3, or `rowCount`). Straight parts run 24 px in from each
 * side (scaled with the width); U-turns are stadium shapes with 14 px corners just outside them.
 * Returns { d, rows: [{ y, dir, s0, x0 }], xa, xb } — row i's straight starts at arc length s0 at x0 and
 * runs in direction dir (−1 left on the bottom row, then alternating); the last row runs on off screen.
 */
export function rowTrack(W, H, k = 1, rowCount) {
  const pitch = PITCH * k, bottom = H - 18 * k;
  const n = rowCount ?? clamp(1 + Math.floor((bottom - 100 * k) / pitch + 0.01), 1, 3);
  const ys = Array.from({ length: n }, (_, i) => bottom - i * pitch);
  const inset = 24 * W / 390;
  const xa = inset, xb = W - inset, r = 14 * k;
  const lead = 2 * W;                                 // the bottom row starts off screen on the right
  const rows = [];
  let d = `M ${xb + lead} ${ys[0]} H ${n === 1 ? -2 * W : xa}`;
  let s = lead + (xb - xa);
  rows.push({ y: ys[0], dir: -1, s0: lead, x0: xb });
  for (let i = 1; i < ys.length; i++) {
    const left = i % 2 === 1;                         // odd rows are reached by a turn on the left
    const x = left ? xa : xb, out = left ? xa - r : xb + r, sweep = left ? 1 : 0;
    const y0 = ys[i - 1], y1 = ys[i];
    d += ` A ${r} ${r} 0 0 ${sweep} ${out} ${y0 - r} V ${y1 + r} A ${r} ${r} 0 0 ${sweep} ${x} ${y1}`;
    s += Math.PI * r + (y0 - y1 - 2 * r);
    rows.push({ y: y1, dir: left ? 1 : -1, s0: s, x0: x });
    const last = i === ys.length - 1;
    const end = left ? (last ? 3 * W : xb) : (last ? -2 * W : xa);
    d += ` H ${end}`;
    s += Math.abs(end - x);
  }
  return { d, rows, xa, xb };
}

/**
 * mountTrain(el, { words, phrases, bases, onWagonTap, onGhostTap, sfx })
 *   words      found words in order (words[0] is the start word)
 *   phrases    optional phrases, phrases[i] = phrase that words[i] closes (phrases[0] unused)
 *   bases      optional base forms, bases[i] = what words[i] shows once found (chain[i].base)
 *   onWagonTap ({ index, word, phrase, el }) when a wagon is tapped
 *   onGhostTap ({ el }) when the empty car is tapped
 *   sfx        optional { chug(), place(), couple(), whistle() } played with the motion (core/sfx.js fits)
 * The element must be in the document; its height comes from --wt-train-height.
 */
export function mountTrain(el, { words = [], phrases = [], bases = [], onWagonTap, onGhostTap, sfx } = {}) {
  const root = h('div', 'wt-train', { 'aria-label': 'Kelime trenin' });
  const rails = svg('svg', { class: 'wt-train__rails', 'aria-hidden': 'true' });
  const layers = Object.fromEntries(['bed', 'groove', 'inner', 'ahead'].map(name => {
    const g = svg('g', { class: `wt-rail__${name}` });
    rails.append(g);
    return [name, g];
  }));
  const probe = svg('path', { fill: 'none', stroke: 'none' });
  // Drawbars between neighbours on the same row; across rows the track itself shows the train goes on.
  const links = svg('g', { class: 'wt-train__links' });
  rails.append(probe, links);
  const cars = h('div', 'wt-train__cars');
  const loco = h('div', 'wt-locomotive', { 'aria-hidden': 'true' });
  loco.append(h('span', 'wt-locomotive__steam'));
  const ghost = buildCar('ghost');
  // The searched word's letter count, just right of the empty car's blocks ("6").
  const tally = h('span', 'wt-wagon__count', { 'aria-hidden': 'true' });
  ghost.car.append(tally);
  const pill = h('div', 'wt-train__phrase wt-train__phrase--pair', { 'aria-hidden': 'true' });
  pill.hidden = true;
  // The phrase pair's shared ground, under the track and the cars.
  const under = h('div', 'wt-train__pair-field', { 'aria-hidden': 'true' });
  under.hidden = true;
  // Level end: the bottom track's wooden platform lip, over the rails and under the cars.
  const platform = h('div', 'wt-train__platform', { 'aria-hidden': 'true' });
  platform.hidden = true;
  cars.append(loco, ghost.car, pill);
  root.append(h('div', 'wt-train__scene', { 'aria-hidden': 'true' }), under, rails, platform, cars);
  el.append(root);

  let list = [];                 // found words, oldest first: { word, phrase, el }
  let ghostText = null;
  let ghostOn = false;           // the empty car is part of the train
  let queue = Promise.resolve();
  let pending = 0;               // queued arrivals (incl. the running one); a backlog plays faster
  let busy = false;
  let alive = true;
  let epoch = 0;                 // bumped to drop every queued/running arrival (reset, level end)
  let endMode = false;           // the level-end station layout (enterEnd)
  let endTarget = new Map();     // where the station's vehicles stop (re-measured when the track resizes)
  let k = 1;
  let W = 0, H = 0;
  let geo = null;                // { total, step, lut, rows, xa, xb }
  let chunks = [];               // rail pieces { s0, nodes, ahead }
  let headS = 0;
  let tween = null;              // the running move: { raf, resolve }
  let facingRight = false;       // the locomotive's last heading (kept through the vertical part of a turn)
  const poses = new Map();       // vehicle element -> arc length of its bottom centre along the track
  const timers = new Map();       // timeout id -> resolve, so a cancelled wait still lets its caller finish

  const later = ms => new Promise(resolve => {
    const id = setTimeout(() => { timers.delete(id); resolve(); }, ms);
    timers.set(id, resolve);
  });
  function cancelTimers() {
    for (const [id, resolve] of timers) { clearTimeout(id); resolve(); }
    timers.clear();
  }

  // ---- track ----
  function buildTrack() {
    W = root.clientWidth;
    H = root.clientHeight;
    if (!W || !H) return false;
    // Two rows need about 200 px (18 + 78 + 100) and shrink with a lower area down to 60 %; below that
    // (e.g. a hint card squeezing the scene) the train runs on a single row, the locomotive in front of
    // the pair, so nothing is cut off at the top. Block widths stay physical either way.
    const two = Math.min(W / 390, H / 200);
    let rowCount;
    if (two >= 0.6) {
      k = Math.min(1, two);
      rowCount = clamp(1 + Math.floor((H - 118 * k) / (PITCH * k) + 0.01), 2, 3);
    } else {
      k = clamp(Math.min(W / 390, H / 118), 0.3, 1);
      rowCount = 1;
    }
    root.style.setProperty('--wt-k', k.toFixed(3));
    root.classList.toggle('wt-train--one-row', rowCount === 1);
    const spec = rowTrack(W, H, k, rowCount);
    rails.setAttribute('viewBox', `0 0 ${W} ${H}`);
    probe.setAttribute('d', spec.d);
    const total = probe.getTotalLength();
    const step = 2;
    const lut = [];
    for (let s = 0; s < total; s += step) lut.push(probe.getPointAtLength(s));
    lut.push(probe.getPointAtLength(total));
    geo = { total, step, lut, rows: spec.rows, xa: spec.xa, xb: spec.xb };
    buildRails();
    return true;
  }

  // Point at arc length s; beyond either end the track continues straight.
  function point(s) {
    const { lut, step, total } = geo;
    if (s <= 0 || s >= total) {
      const [a, b] = s <= 0 ? [lut[0], lut[1]] : [lut.at(-2), lut.at(-1)];
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const base = s <= 0 ? a : b;
      const d = s <= 0 ? s : s - total;
      return { x: base.x + (b.x - a.x) / len * d, y: base.y + (b.y - a.y) / len * d };
    }
    const i = Math.floor(s / step);
    const a = lut[i], b = lut[Math.min(i + 1, lut.length - 1)];
    const f = s / step - i;
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
  }

  // The row whose straight part holds arc length s (null inside a U-turn).
  function rowAt(s) {
    for (let i = geo.rows.length - 1; i >= 0; i--) {
      const row = geo.rows[i];
      if (s < row.s0 - 0.5 && i > 0) continue;
      const end = i === geo.rows.length - 1 ? Infinity : row.s0 + (geo.xb - geo.xa);
      return s <= end + 0.5 ? row : null;
    }
    return geo.rows[0];
  }

  const sOf = (row, x) => row.s0 + row.dir * (x - row.x0);

  function buildRails() {
    for (const g of Object.values(layers)) g.replaceChildren();
    chunks = [];
    const piece = 16;
    for (let s0 = 0; s0 < geo.total; s0 += piece) {
      const s1 = Math.min(geo.total, s0 + piece + 1);
      let d = '';
      for (let s = s0; s < s1; s += 4) { const p = point(s); d += `${d ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)} `; }
      const p = point(s1);
      d += `L${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
      const nodes = ['bed', 'groove', 'inner', 'ahead'].map(name => {
        const node = svg('path', { d });
        if (name === 'ahead') node.setAttribute('stroke-dashoffset', String(-s0));
        layers[name].append(node);
        return node;
      });
      chunks.push({ s0, nodes, ahead: null });
    }
    paintRails();
  }

  // Solid wooden track up to the locomotive's nose, dashed track ahead of it.
  function paintRails() {
    for (const c of chunks) {
      const ahead = c.s0 >= headS;
      if (c.ahead === ahead) continue;
      c.ahead = ahead;
      for (let i = 0; i < 3; i++) c.nodes[i].style.display = ahead ? 'none' : '';
      c.nodes[3].style.display = ahead ? '' : 'none';
    }
  }

  // ---- layout ----
  const width = node => node.offsetWidth;

  const count = car => car.querySelector('.wt-wagon__cargo').childElementCount;
  // Block widths are physical px and never shrink with the area (only heights follow --wt-k).
  const setBlock = (car, px) => car.style.setProperty('--wt-block-w', (px / k).toFixed(2));

  // Smallest pair block: 20 px on a 390 px wide screen, 18 px at 360.
  const minPair = () => clamp(18 + (W - 360) / 15, 18, 20);

  // Room the letter count takes right of the empty car (0 when it is not shown).
  const tallyW = () => (ghostOn && !tally.hidden ? Math.max(0, tally.offsetWidth - 3 * k) : 0);

  // Cars above the bottom row carry 24 px blocks. The phrase pair shares one size: PAIR px, or as large as
  // still lets both words (and the empty car's letter count, `tag` px) fit the bottom row (down to minPair),
  // using the screen edges (8 px) and a 10 px coupling when it is tight. Returns { gap, room, x0 } for layout().
  function fitBlocks(pair, tag = 0) {
    for (const item of list) setBlock(item.el, BLOCK);
    setBlock(ghost.car, BLOCK);
    const cars2 = pair.filter(car => car !== loco);
    if (!geo || !cars2.length) return { gap: GAP, room: geo ? geo.xb - geo.xa : W, x0: geo?.xa ?? 0 };
    const n = cars2.map(count);
    const letters = n.reduce((x, y) => x + y, 0);
    // The largest shared block size that fits `room` with coupling `gap` (block gaps + padding are fixed).
    const fixed = gap => n.reduce((sum, c) => sum + (c - 1) * 2 * k + 12 * k, 0) + (pair.length > 1 ? gap : 0)
      + (pair.includes(loco) ? width(loco) : 0) + tag;
    const best = (room, gap) => (room - fixed(gap)) / letters;
    let room = geo.xb - geo.xa, gap = GAP, x0 = geo.xa;
    let px = clamp(best(room, gap), 0, PAIR);
    if (px < BLOCK) {
      // Tight: use the screen edges and a short coupling, and share smaller blocks.
      room = W - 16; gap = 10; x0 = 8;
      px = clamp(best(room, gap), minPair(), PAIR);
    }
    cars2.forEach(car => setBlock(car, px));
    return { gap, room, x0 };
  }

  const trainOrder = () => [...(ghostOn ? [ghost.car] : []), ...list.map(item => item.el).reverse(), loco];

  // Tail first. The bottom row holds the phrase pair — the tail car (the empty car, else the newest wagon)
  // with the vehicle ahead of it coupled on its left — centred as one group. Everything further ahead flows
  // over the rows above like words in lines, each in its full width + GAP: a vehicle that does not fit what
  // is left of a row moves to the start of the next one; the last row runs off screen.
  function layout() {
    if (endMode) return endLayout();
    const order = trainOrder();
    const out = new Map();
    const { rows, xa, xb } = geo;
    const tag = order[0] === ghost.car ? tallyW() : 0;
    const fit = fitBlocks(order.slice(0, 2), tag);
    const [w0, w1] = order.slice(0, 2).map(width);
    const pairW = w0 + tag + (order.length > 1 ? fit.gap + w1 : 0);
    // Centred in the row; if even the smallest blocks do not fit, the empty car and its count keep their full
    // width at the right edge and the previous word runs off the left edge (its last letters still beside it).
    const right = pairW <= fit.room ? fit.x0 + fit.room / 2 + pairW / 2 : W - 8;
    out.set(order[0], sOf(rows[0], right - tag - w0 / 2));
    if (order.length > 1) out.set(order[1], sOf(rows[0], right - tag - w0 - fit.gap - w1 / 2));
    // With a single row everything else runs on to the left of the pair.
    let r = rows.length > 1 ? 1 : 0;
    let cursor = r ? rows[1].x0 : right - pairW - fit.gap;
    for (const node of order.slice(2)) {
      const w = width(node);
      for (;;) {
        const row = rows[r];
        const last = r === rows.length - 1;
        const far = cursor + row.dir * w;
        if (last || (row.dir > 0 ? far <= xb : far >= xa)) {
          out.set(node, sOf(row, cursor + row.dir * w / 2));
          cursor = far + row.dir * GAP;
          break;
        }
        r++;
        cursor = rows[r].x0;
      }
    }
    return out;
  }

  // The cars that stay at the level end: the last word's car and, coupled on its left, the one before.
  const endPair = () => [list.at(-1)?.el, list.at(-2)?.el].filter(Boolean);

  // Level-end station: the last pair centred on the bottom row (the platform) as in play, the locomotive
  // standing at the start of the row above, facing right; older cars are hidden.
  function endLayout() {
    const out = new Map();
    const { rows, xa } = geo;
    const pair = endPair();
    const fit = fitBlocks(pair);
    const [w0, w1 = 0] = pair.map(width);
    const pairW = w0 + (pair.length > 1 ? fit.gap + w1 : 0);
    const right = pairW <= fit.room ? fit.x0 + fit.room / 2 + pairW / 2 : W - 8;
    if (pair[0]) out.set(pair[0], sOf(rows[0], right - w0 / 2));
    if (pair[1]) out.set(pair[1], sOf(rows[0], right - w0 - fit.gap - w1 / 2));
    const lw = width(loco);
    out.set(loco, rows[1] ? sOf(rows[1], xa + lw / 2 + 8 * k) : sOf(rows[0], right - pairW - GAP - lw / 2));
    return out;
  }

  // Bottom centre on the track, never turned. Inside a U-turn the body stays upright and inside the
  // screen. The wheel centres sit on the rail bed's top line (7k above the track line): a car's wheels are
  // 11k up from its bottom, the locomotive model's 14k.
  function spot(node, s) {
    const p = point(s);
    const w = width(node);
    const row = rowAt(s);
    const x = row ? p.x : clamp(p.x, Math.min(w / 2 + 8, W / 2), Math.max(W - w / 2 - 8, W / 2));
    return { x, y: p.y + (node === loco ? 7 : 4) * k, w, h: node.offsetHeight, row };
  }

  function place(node, s) {
    const f = spot(node, s);
    let mirror = '';
    if (node === loco) {
      // The locomotive art faces left: mirror it while it heads right.
      const a = point(s - 3), b = point(s + 3);
      if (Math.abs(b.x - a.x) > 1) facingRight = b.x > a.x;
      if (facingRight) mirror = ' scaleX(-1)';
    }
    node.style.transform = `translate(${f.x.toFixed(1)}px, ${f.y.toFixed(1)}px) translate(-50%, -100%)${mirror}`;
    node.style.zIndex = String(Math.max(1, 5000 - Math.round(s / 4)));
  }

  // The phrase pair: a soft underlay below both cars on the bottom row, and — for a moment after a correct
  // answer — the phrase they make above them.
  let phraseShown = null;
  function placePair() {
    if (endMode) { under.hidden = true; pill.hidden = true; return; }
    const order = trainOrder().filter(node => poses.has(node) && !node.hidden);
    const spots = order.slice(0, 2).map(node => spot(node, poses.get(node)));
    const ok = spots.length === 2 && spots.every(f => f.row === geo.rows[0])
      && !root.classList.contains('wt-train--departed');
    under.hidden = !ok;
    if (!ok) { pill.hidden = true; return; }
    const tag = order[0] === ghost.car ? tallyW() : 0;
    const left = Math.min(...spots.map(f => f.x - f.w / 2)), right = Math.max(...spots.map(f => f.x + f.w / 2)) + tag;
    const y = spots[0].y, hgt = Math.max(...spots.map(f => f.h));
    under.style.width = `${(right - left + 12 * k).toFixed(1)}px`;
    under.style.height = `${(hgt + 8 * k).toFixed(1)}px`;
    under.style.transform = `translate(${(left - 6 * k).toFixed(1)}px, ${(y - hgt - 4 * k).toFixed(1)}px)`;
    pill.hidden = !phraseShown;
    if (!phraseShown) return;
    if (pill.textContent !== phraseShown) pill.textContent = phraseShown;
    const half = pill.offsetWidth / 2 + 6;
    const top = Math.max(2, y - hgt - pill.offsetHeight - 6 * k);
    pill.style.transform = `translate(${clamp((left + right) / 2, half, W - half).toFixed(1)}px, ${top.toFixed(1)}px) translate(-50%, 0)`;
  }

  // Drawbars between neighbours that stand on the same row, at the deck's middle (23k up); the one inside the
  // phrase pair is the highlighted (gold) one.
  function drawLinks() {
    const order = (endMode ? endPair() : trainOrder()).filter(node => poses.has(node) && !node.hidden);
    const bars = [];
    for (let i = 0; i + 1 < order.length; i++) {
      const a = spot(order[i], poses.get(order[i])), b = spot(order[i + 1], poses.get(order[i + 1]));
      if (!a.row || a.row !== b.row) continue;
      const dir = a.row.dir, y = a.y - 23 * k;
      bars.push({ pair: i === 0,
        d: `M${(a.x + dir * a.w / 2).toFixed(1)} ${y.toFixed(1)}L${(b.x - dir * b.w / 2).toFixed(1)} ${y.toFixed(1)}` });
    }
    if (links.childElementCount !== bars.length) links.replaceChildren(...bars.map(() => svg('path')));
    bars.forEach((bar, i) => {
      links.children[i].setAttribute('d', bar.d);
      links.children[i].classList.toggle('wt-link--pair', bar.pair);
    });
  }

  function render() {
    for (const [node, s] of poses) if (node.isConnected && !node.hidden) place(node, s);
    const ls = poses.get(loco);
    headS = ls === undefined ? 0 : ls + width(loco) / 2;
    paintRails();
    drawLinks();
    placePair();
    if (endMode) placePlatform();
  }

  // The platform lip: its contact line (8k down in its 34k art) on the bottom track, down to the bottom edge.
  function placePlatform() {
    const top = geo.rows[0].y - 8 * k;
    platform.style.top = `${top.toFixed(1)}px`;
    platform.style.height = `${Math.max(0, H - top).toFixed(1)}px`;
  }

  // A new move replaces the running one; whoever waited for the old one is released right away.
  function stop() {
    if (!tween) return;
    cancelAnimationFrame(tween.raf);
    tween.resolve();
    tween = null;
  }

  // target: Map node -> s, or a function giving it each frame (a goal that follows a resized track; the
  // vehicles keep their offset from it, so a resize mid-move does not cut the move short).
  function animateTo(target, ms, shape = ease) {
    stop();
    const goal = typeof target === 'function' ? target : () => target;
    if (ms <= 0 || reducedMotion()) {
      for (const [node, s] of goal()) poses.set(node, s);
      render();
      return Promise.resolve();
    }
    const lead = new Map([...goal()].map(([node, to]) => [node, (poses.get(node) ?? to) - to]));
    return new Promise(resolve => {
      const t0 = performance.now();
      const mine = { raf: 0, resolve };
      const frame = now => {
        if (!alive) return resolve();
        const p = shape(clamp((now - t0) / ms, 0, 1));
        const to = goal();
        for (const [node, d] of lead) if (to.has(node)) poses.set(node, to.get(node) + d * (1 - p));
        render();
        if (p < 1) mine.raf = requestAnimationFrame(frame);
        else { if (tween === mine) tween = null; resolve(); }
      };
      mine.raf = requestAnimationFrame(frame);
      tween = mine;
    });
  }

  // Move every vehicle to its spot in the current layout; `from` sets start positions (e.g. roll in).
  function move(ms, from = new Map()) {
    for (const [node, s] of from) poses.set(node, s);
    for (const node of poses.keys()) if (!node.isConnected) poses.delete(node);
    if (!ghostOn) poses.delete(ghost.car);
    return animateTo(layout(), ms);
  }

  // Off screen on the right of the bottom row, so a car can roll in.
  const offTail = node => sOf(geo.rows[0], W + width(node) / 2 + 20);

  // ---- cars ----
  function renderGhost() {
    const show = ghostText !== null;
    root.classList.toggle('wt-train--no-ghost', !show);
    ghost.car.hidden = !show;
    if (!show) return;
    ghost.cargo.replaceChildren(...ghostBlocks(ghostText, list.length * 2));
    ghost.car.classList.toggle('wt-wagon--short', ghost.cargo.children.length <= 3);
    const ask = ghost.cargo.querySelector('.wt-block--ask');
    tally.hidden = Boolean(ask);
    tally.textContent = ask ? '' : String(ghost.cargo.children.length);
    ghost.car.setAttribute('aria-label', ask ? 'Sıradaki kelime' : `Sıradaki kelime, ${ghost.cargo.children.length} harf`);
  }

  // shown = the letters the car carries (the word while its phrase is read, then its base).
  function append(word, phrase, { drop = false, base, shown = word } = {}) {
    const index = list.length;
    const { car, cargo } = buildCar('wagon');
    car.dataset.index = index;
    car.setAttribute('aria-label', phrase ? `${word} — ${phrase}` : word);
    if (phrase) car.dataset.phrase = phrase;
    cargo.append(...Array.from(shown).map((ch, i) => {
      const b = block(ch, (index * 2 + i) % TONES, i);
      if (drop) b.classList.add('wt-block--pending');
      return b;
    }));
    cars.insertBefore(car, ghost.car);
    car.classList.toggle('wt-wagon--short', Array.from(shown).length <= 3);
    list.push({ word, phrase, base: base ?? word, shown, el: car });
    return car;
  }

  // The car drops its suffix: those blocks fall off the deck (and fade) while the base's own ending settles
  // in. The falling blocks are loose copies riding along with the car, so it can already move on.
  function shed(item, t) {
    const { keep, drop, add } = suffixSplit(item.shown, item.base);
    if (!drop && !add) return;
    const cargo = item.el.querySelector('.wt-wagon__cargo');
    const fallen = [...cargo.children].slice(Array.from(keep).length);
    for (const [i, b] of fallen.entries()) {
      const copy = b.cloneNode(true);
      copy.classList.add('wt-block--shed');
      copy.style.cssText += `;left:${b.offsetLeft}px;top:${b.offsetTop}px`;
      cargo.append(copy);
      if (!reducedMotion()) {
        copy.animate([
          { transform: 'translateY(0) rotate(0)', opacity: 1 },
          { transform: `translateY(${22 * k}px) rotate(${i % 2 ? 8 : -8}deg)`, opacity: 1, offset: 0.45 },
          { transform: `translateY(${15 * k}px) rotate(${i % 2 ? 10 : -10}deg)`, opacity: 0.85, offset: 0.6 },
          { transform: `translateY(${34 * k}px) rotate(${i % 2 ? 10 : -10}deg)`, opacity: 0 },
        ], { duration: 520 * Math.max(t, 0.4), delay: Math.min(i * 40, 120) * t, easing: 'ease-in', fill: 'forwards' }).finished
          .catch(() => {}).then(() => copy.remove());
      } else copy.remove();
      b.remove();
    }
    const start = Array.from(keep).length;
    const index = Number(item.el.dataset.index);
    cargo.append(...Array.from(add).map((ch, i) => {
      const b = block(ch, (index * 2 + start + i) % TONES, start + i);
      if (!reducedMotion()) {
        // The base's own ending settles in from just above, once the fallen blocks are clear.
        b.animate([{ transform: `translateY(${-12 * k}px)`, opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }],
          { duration: 240 * Math.max(t, 0.4), delay: 360 * t, easing: 'ease-out', fill: 'backwards' });
      }
      return b;
    }));
    item.shown = item.base;
    item.el.classList.toggle('wt-wagon--short', Array.from(item.base).length <= 3);
    sfx?.tap?.();
  }

  function rebuild(next = [], nextPhrases = [], nextBases = []) {
    for (const item of list) item.el.remove();
    list = [];
    root.classList.remove('wt-train--celebrate', 'wt-train--shake', 'wt-train--departed', 'wt-train--moving');
    next.forEach((word, i) => append(word, nextPhrases[i] ?? undefined, { base: nextBases[i], shown: nextBases[i] ?? word }));
    renderGhost();
    ghostOn = ghostText !== null;
    poses.clear();
    facingRight = false;
    if (geo) move(0);
  }

  // A new level (or a replay): whatever was queued or still moving is dropped first.
  function reset(next = [], nextPhrases = [], nextBases = []) {
    settleNow();
    leaveEnd();
    rebuild(next, nextPhrases, nextBases);
  }

  cars.addEventListener('click', event => {
    const car = event.target.closest('.wt-wagon');
    if (!car) return;
    if (car === ghost.car) { onGhostTap?.({ el: car }); return; }
    const index = Number(car.dataset.index);
    const item = list[index];
    if (item) onWagonTap?.({ index, word: item.word, phrase: item.phrase ?? null, el: car });
  });

  // The train never holds the game up: answers queue here and play one after another. With another answer
  // already waiting the running one finishes at ~4× speed, and with two or more waiting the oldest ones are
  // placed without animation, so the train is never more than about one step behind.
  const tempo = () => (pending > 1 ? 0.25 : 1);

  // A letter block drops onto the deck and settles with a little bounce.
  function dropBlock(b, i, t = 1) {
    b.classList.replace('wt-block--pending', 'wt-block--drop');
    return b.animate([
      { transform: `translateY(${-58 * k}px) rotate(${i % 2 ? 8 : -8}deg)`, opacity: 0 },
      { transform: 'translateY(0) rotate(0)', opacity: 1, offset: 0.55 },
      { transform: `translateY(${-1.5 * k}px)`, offset: 0.75 },
      { transform: 'translateY(0)' },
    ], { duration: 420 * Math.max(t, 0.4), easing: 'ease-in' }).finished.catch(() => {})
      .then(() => b.classList.remove('wt-block--drop'));
  }

  // e = the epoch the answer was queued in; a reset or the level end drops it.
  async function arrive(word, phrase, base, animate, e) {
    const live = () => alive && e === epoch;
    if (!live() || !geo) return;
    if (root.classList.contains('wt-train--departed')) rebuild(list.map(i => i.word), list.map(i => i.phrase), list.map(i => i.base));
    const quiet = !animate || reducedMotion() || pending > 2;
    busy = true;
    const ghostAt = ghostOn ? poses.get(ghost.car) : undefined;
    ghostOn = false;
    ghost.car.classList.add('wt-wagon--waiting');
    const car = append(word, phrase, { drop: !quiet, base, shown: quiet ? (base ?? word) : word });
    const item = list.at(-1);
    if (quiet) {
      if (animate && pending <= 2) car.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220 });
      sfx?.couple?.();
      busy = false;
      ghost.car.classList.remove('wt-wagon--waiting');
      renderGhost();
      ghostOn = ghostText !== null;
      await move(0);
      return;
    }
    root.classList.add('wt-train--arriving');
    car.classList.add('wt-wagon--loading');
    // The loaded car takes the empty car's place (or rolls in from the right when there was none).
    if (ghostAt === undefined) sfx?.chug?.();
    await move(ghostAt !== undefined ? 160 * tempo() : 700 * tempo(), new Map([[car, ghostAt ?? offTail(car)]]));
    if (!live()) return;

    // Letter blocks drop onto the deck one by one and settle with a little bounce.
    const blocks = [...car.querySelectorAll('.wt-block')];
    const step = tempo() < 1 ? 0 : blocks.length > 8 ? 55 : 75;
    await Promise.all(blocks.map((b, i) => later(i * step).then(() => {
      if (!live()) return;
      if (tempo() === 1 || i === 0) sfx?.place?.();
      return dropBlock(b, i, tempo());
    })));
    if (!live()) return;
    car.classList.remove('wt-wagon--loading');
    car.classList.add('wt-wagon--coupled');
    sfx?.couple?.();
    // The finished pair reads as the phrase for a moment ("kitap kapağı"), then the train moves on.
    phraseShown = phrase ?? null;
    render();
    await later((phrase ? 650 : 180) * tempo());
    if (!live()) return;
    phraseShown = null;
    // As the train pulls away the suffix falls off: the car now carries the next phrase's first word.
    shed(item, tempo());

    // The whole train flows one car ahead, row by row, and the next empty car rolls in at the bottom.
    busy = false;
    ghost.car.classList.remove('wt-wagon--waiting');
    renderGhost();
    ghostOn = ghostText !== null;
    root.classList.remove('wt-train--arriving');
    root.classList.add('wt-train--moving');
    if (ghostOn) sfx?.chug?.();
    await move(900 * tempo(), ghostOn ? new Map([[ghost.car, offTail(ghost.car)]]) : new Map());
    if (!live()) return;
    root.classList.remove('wt-train--moving');
    car.classList.remove('wt-wagon--coupled');
  }

  // ---- level end: the result station ----
  // Replaces a car's letters at once (no drop), e.g. a word that has not shed its suffix yet -> its base.
  function setCargo(item, text) {
    const cargo = item.el.querySelector('.wt-wagon__cargo');
    const index = Number(item.el.dataset.index);
    cargo.replaceChildren(...Array.from(text).map((ch, i) => block(ch, (index * 2 + i) % TONES, i)));
    item.shown = text;
    item.el.classList.toggle('wt-wagon--short', Array.from(text).length <= 3);
  }

  // Drops every queued or running arrival and brings the running visuals to their last frame.
  function settleNow() {
    epoch++;
    pending = 0;
    queue = Promise.resolve();
    busy = false;
    stop();
    cancelTimers();
    for (const a of root.getAnimations?.({ subtree: true }) ?? []) {
      if ((globalThis.CSSAnimation && a instanceof CSSAnimation) || (globalThis.CSSTransition && a instanceof CSSTransition)) continue;
      try { a.finish(); } catch { a.cancel(); }
    }
    root.querySelectorAll('.wt-block--shed').forEach(node => node.remove());
    root.querySelectorAll('.wt-block--drop').forEach(node => node.classList.remove('wt-block--drop'));
    root.classList.remove('wt-train--arriving', 'wt-train--moving', 'wt-train--celebrate', 'wt-train--shake');
    cars.querySelectorAll('.wt-wagon--loading, .wt-wagon--coupled')
      .forEach(car => car.classList.remove('wt-wagon--loading', 'wt-wagon--coupled'));
    ghost.car.classList.remove('wt-wagon--waiting');
    phraseShown = null;
  }

  function leaveEnd() {
    if (!endMode) return;
    endMode = false;
    root.classList.remove('wt-train--end', 'wt-train--end-settle', 'wt-train--end-rest');
    platform.hidden = true;
    for (const item of list) { item.el.hidden = false; item.el.classList.remove('wt-train__away'); }
    loco.classList.remove('wt-train__away');
  }

  /**
   * The level is done: the train becomes the result station at once, whatever it was doing. Queued answers
   * are dropped and the cars take the final state — words[i] found, the last car keeps its inflected word
   * (letters still to land drop in), the one before shows its base — older cars fade out, the empty car goes,
   * the bottom track grows a platform lip and the locomotive pulls in on the row above (whistle at ~1.6 s).
   */
  function enterEnd({ words: next, phrases: nextPhrases = [], bases: nextBases = [] } = {}) {
    if (!alive || !geo) return null;
    next ??= list.map(item => item.word);
    const departed = root.classList.contains('wt-train--departed');
    // Moved to another box (the result card's dock): the track is rebuilt now and old spots no longer apply.
    const moved = root.clientWidth !== W || root.clientHeight !== H;
    const ghostAt = ghostOn && !moved ? poses.get(ghost.car) : undefined;
    settleNow();
    if (moved && buildTrack()) for (const item of list) poses.delete(item.el);
    const mine = epoch;
    const n = next.length;
    const baseOf = i => nextBases[i] ?? list[i]?.base ?? next[i];
    const phraseOf = i => nextPhrases[i] ?? list[i]?.phrase;
    if (departed || list.length > n || list.some((item, i) => item.word !== next[i])) {
      rebuild(next.slice(0, -1), next.map(phraseOf), next.map(baseOf));
    }
    // The last word's car, if the queue never got to it, comes in with its letters still to drop.
    if (list.length < n) {
      for (let i = list.length; i < n - 1; i++) append(next[i], phraseOf(i), { base: baseOf(i), shown: baseOf(i) });
      append(next[n - 1], phraseOf(n - 1), { base: baseOf(n - 1), shown: next[n - 1], drop: !reducedMotion() });
    }
    list.forEach((item, i) => {
      const want = i === n - 1 ? item.word : item.base;
      if (item.shown !== want) setCargo(item, want);
      else if (i < n - 1) item.el.querySelectorAll('.wt-block--pending').forEach(b => b.classList.remove('wt-block--pending'));
    });
    ghostText = null;
    ghostOn = false;
    renderGhost();
    poses.delete(ghost.car);
    root.classList.remove('wt-train--departed');
    endMode = true;
    root.classList.add('wt-train--end');
    platform.hidden = false;
    const target = endTarget = layout();
    const [lastCar, prevCar] = endPair();
    if (lastCar && !poses.has(lastCar)) poses.set(lastCar, ghostAt ?? target.get(lastCar));
    if (prevCar && !poses.has(prevCar)) poses.set(prevCar, target.get(prevCar));
    const older = list.slice(0, -2).map(item => item.el);
    // Cars that never got a place on the track (a backlog) are not shown at all.
    older.forEach(car => { if (!poses.has(car)) car.hidden = true; });
    if (reducedMotion()) {
      older.forEach(car => { car.hidden = true; });
      root.classList.add('wt-train--end-rest');
      animateTo(target, 0);
      return endGeometry();
    }
    older.forEach(car => car.classList.add('wt-train__away'));
    loco.classList.add('wt-train__away');
    // The goals are read from endTarget on every frame: a resize (a clue closing, the browser bar) re-aims them.
    const pairTo = () => new Map([...endTarget].filter(([node]) => node !== loco));
    const locoTo = () => new Map([[loco, endTarget.get(loco)]]);
    if (!poses.has(loco)) poses.set(loco, target.get(loco));
    render();
    platform.animate([{ transform: `scaleY(${16 / 34})`, opacity: 0.6 }, { transform: 'none', opacity: 1 }],
      { duration: 330, delay: 120, easing: 'ease-out', fill: 'backwards' });
    const blocks = [...(lastCar?.querySelectorAll('.wt-block--pending') ?? [])];
    const step = blocks.length > 8 ? 55 : 75;
    blocks.forEach((b, i) => later(200 + i * step).then(() => {
      if (mine !== epoch) return;
      if (i === 0 || i === blocks.length - 1) sfx?.place?.();
      dropBlock(b, i);
    }));
    (async () => {
      await animateTo(pairTo, 300);
      await later(180);
      if (mine !== epoch) return;
      older.forEach(car => { car.hidden = true; });
      // The locomotive comes in from just behind its stop, on the row above.
      poses.set(loco, endTarget.get(loco) - 30 * k);
      render();
      loco.classList.remove('wt-train__away');
      await animateTo(locoTo, 1100, p => 1 - Math.pow(1 - p, 3));
      if (mine !== epoch) return;
      sfx?.whistle?.();
      root.classList.add('wt-train--end-settle', 'wt-train--end-rest');
      await later(400);
      if (mine === epoch) root.classList.remove('wt-train--end-settle');
    })();
    return endGeometry();
  }

  // The station at its last frame right away (a result button was pressed); nothing of it plays on.
  function finishEnd() {
    if (!endMode) return;
    settleNow();
    cars.querySelectorAll('.wt-block--pending').forEach(b => b.classList.remove('wt-block--pending'));
    list.slice(0, -2).forEach(item => { item.el.hidden = true; });
    loco.classList.remove('wt-train__away');
    root.classList.remove('wt-train--end-settle');
    root.classList.add('wt-train--end-rest');
    animateTo(endTarget = layout(), 0);
  }

  // Back to the normal train (the level-end view closed without a new level).
  function exitEnd() {
    if (!endMode) return;
    settleNow();
    if (root.clientWidth !== W || root.clientHeight !== H) buildTrack();
    leaveEnd();
    renderGhost();
    ghostOn = ghostText !== null;
    if (geo) move(0);
  }

  // Where the station stands, in px inside the train element (rect = its box on screen): the bottom track
  // (rail), the row above (upper, null on a one-row track) and the locomotive's box at its stop.
  function endGeometry() {
    if (!geo) return null;
    const s = endMode ? layout().get(loco) : poses.get(loco);
    const f = s === undefined ? null : spot(loco, s);
    return { rect: root.getBoundingClientRect(), k, width: W, height: H, rail: geo.rows[0].y, upper: geo.rows[1]?.y ?? null,
      xa: geo.xa, xb: geo.xb, loco: f && { left: f.x - f.w / 2, right: f.x + f.w / 2, top: f.y - f.h, bottom: f.y } };
  }

  async function flash(className, ms) {
    if (!alive) return;
    root.classList.remove(className);
    void root.offsetWidth; // restart the CSS animation when called twice in a row
    root.classList.add(className);
    await later(reducedMotion() ? Math.min(ms, 300) : ms);
    root.classList.remove(className);
  }

  // Level end: the blocks hop in a wave and the whistle blows, then the whole train steams along the rows
  // and off the top (each car passing through every row on the way).
  async function celebrate({ depart = true } = {}) {
    if (!alive || !geo) return;
    const blocks = [...cars.querySelectorAll('.wt-wagon:not(.wt-wagon--ghost) .wt-block')];
    blocks.forEach((b, i) => b.style.setProperty('--wt-i', blocks.length - i));
    ghostOn = false;
    ghost.car.hidden = true;
    await move(reducedMotion() ? 0 : 300);
    sfx?.whistle?.();
    await flash('wt-train--celebrate', 900 + Math.min(blocks.length, 30) * 20);
    if (!depart || reducedMotion() || !alive) return;
    root.classList.add('wt-train--moving');
    const lastRow = geo.rows.at(-1);
    const shift = lastRow.s0 + 1.6 * W - Math.min(...poses.values());
    const target = new Map([...poses].map(([node, s]) => [node, s + shift]));
    await animateTo(target, 2600, p => p * p * (3 - 2 * p));
    root.classList.remove('wt-train--moving');
    root.classList.add('wt-train--departed');
    pill.hidden = true;
  }

  const resizer = new ResizeObserver(() => {
    if (root.clientWidth === W && root.clientHeight === H) return;
    // Re-frame at once (even mid-animation, which then carries on from the new spots).
    if (!buildTrack()) return;
    // The station re-aims its running moves (animateTo goals read endTarget) instead of jumping to the end.
    if (endMode) { endTarget = layout(); if (tween) render(); else animateTo(endTarget, 0); return; }
    if (!root.classList.contains('wt-train--departed')) move(0);
  });
  resizer.observe(root);
  buildTrack();
  reset(words, phrases, bases);

  return {
    el: root,
    get words() { return list.map(item => item.word); },
    // Resolves once the blocks are loaded, the suffix has dropped (to `base`) and the train has moved on.
    // Calls are queued and never need awaiting: the game can go straight on to the next word.
    addWagon(word, { phrase, base, animate = true } = {}) {
      const e = epoch;
      pending++;
      const done = queue.then(() => (e === epoch ? arrive(word, phrase, base, animate, e) : undefined))
        .finally(() => { if (e === epoch) pending--; });
      queue = done.catch(() => {});
      return done;
    },
    // text: '?' / 'K_____' (first letter given, '_' = empty block slot, later letters = hints) / null.
    setGhost(text) {
      const wasOn = ghostOn;
      ghostText = text === null || text === undefined ? null : String(text);
      if (busy || !geo || endMode) return; // the running arrival (or the end of the end view) picks it up
      renderGhost();
      ghostOn = ghostText !== null;
      if (root.classList.contains('wt-train--departed')) { ghostOn = false; return; }
      // A new empty car rolls in and the train moves on; a changed mask just re-spaces the train.
      if (!wasOn && ghostOn) move(900, new Map([[ghost.car, offTail(ghost.car)]]));
      else move(wasOn && ghostOn ? 250 : 500);
    },
    shake() { return flash('wt-train--shake', 480); },
    // Level end: hop wave + whistle, then the train leaves along the rows ({ depart: false } stays).
    celebrate(options) { return queue.then(() => celebrate(options)); },
    // Kept for older callers: the whole track is always in view.
    scrollToEnd() {},
    fit() {},
    reset,
    // Level end (core/levelend.js runs these): enterEnd({ words, phrases, bases }) -> endGeometry(),
    // finishEnd() jumps to the last frame, exitEnd() goes back to the normal train; reset() also leaves it.
    enterEnd,
    finishEnd,
    exitEnd,
    endGeometry,
    get ending() { return endMode; },
    destroy() {
      alive = false;
      resizer.disconnect();
      stop();
      cancelTimers();
      root.getAnimations?.({ subtree: true }).forEach(a => a.cancel());
      root.remove();
    },
  };
}
