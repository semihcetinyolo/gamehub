// Builds art-levels.js from tools/art/*.json (made by art_extract.py).
// Each picture becomes a map whose regions are single-colour patches of the mosaic.
const fs = require('fs');
const path = require('path');
const E = require('../engine.js');

const LEVELS = [
  { id: 'owl', name: 'Baykuş', file: 'owl.json', seed: 9001, locks: 0, easy: 4 },
  { id: 'faces', name: 'Yüzler', file: 'faces.json', seed: 9002, locks: 1, minAtoms: 3 },
];
const MIN_ATOMS = 4;      // smaller patches merge into a neighbour (per level: minAtoms)
const TARGET_ATOMS = 16;  // big patches split into pieces about this size
const MAX_ATOMS = 26;

function atomNeighbours(cols, rows, orient) {
  const side = (o, k) => (o === 0 ? (k === 0 ? ['top', 'right'] : ['left', 'bottom']) : (k === 0 ? ['top', 'left'] : ['right', 'bottom']));
  const atomOn = (c, s) => {
    const o = orient[c];
    if (o === 0) return (s === 'top' || s === 'right') ? 0 : 1;
    return (s === 'top' || s === 'left') ? 0 : 1;
  };
  const opp = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
  const out = [];
  for (let c = 0; c < cols * rows; c++) {
    const x = c % cols, y = (c / cols) | 0;
    for (let k = 0; k < 2; k++) {
      const list = [c * 2 + (1 - k)];
      for (const s of side(orient[c], k)) {
        const nx = x + (s === 'right') - (s === 'left'), ny = y + (s === 'bottom') - (s === 'top');
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const n = ny * cols + nx;
        list.push(n * 2 + atomOn(n, opp[s]));
      }
      out.push(list);
    }
  }
  return out;
}

function components(n, nb, same) {
  const comp = new Int32Array(n).fill(-1);
  let id = 0;
  for (let i = 0; i < n; i++) {
    if (comp[i] >= 0) continue;
    const st = [i]; comp[i] = id;
    while (st.length) {
      const a = st.pop();
      for (const b of nb[a]) if (comp[b] < 0 && same(a, b)) { comp[b] = id; st.push(b); }
    }
    id++;
  }
  return { comp, count: id };
}

function build(spec) {
  const src = JSON.parse(fs.readFileSync(path.join(__dirname, 'art', spec.file), 'utf8'));
  const { cols, rows, orient } = src;
  const label = src.labels.slice();
  const n = cols * rows * 2;
  const nb = atomNeighbours(cols, rows, orient);

  // 1. Merge specks into the neighbouring patch they share the most edge with.
  for (let pass = 0; pass < 50; pass++) {
    const { comp, count } = components(n, nb, (a, b) => label[a] === label[b]);
    const size = new Array(count).fill(0);
    comp.forEach(c => size[c]++);
    let changed = false;
    for (let c = 0; c < count; c++) {
      if (size[c] >= (spec.minAtoms || MIN_ATOMS)) continue;
      const votes = new Map();
      for (let a = 0; a < n; a++) if (comp[a] === c) for (const b of nb[a]) if (comp[b] !== c) votes.set(label[b], (votes.get(label[b]) || 0) + 1);
      if (!votes.size) continue;
      const to = [...votes].sort((x, y) => y[1] - x[1])[0][0];
      for (let a = 0; a < n; a++) if (comp[a] === c) label[a] = to;
      changed = true;
    }
    if (!changed) break;
  }

  // 2. Split big patches into mosaic-sized pieces (farthest-point seeds, then grow together).
  const { comp, count } = components(n, nb, (a, b) => label[a] === label[b]);
  const region = new Int32Array(n).fill(-1);
  let next = 0;
  const rand = E.rng(spec.seed);
  for (let c = 0; c < count; c++) {
    const members = [];
    for (let a = 0; a < n; a++) if (comp[a] === c) members.push(a);
    const pieces = members.length > MAX_ATOMS ? Math.round(members.length / TARGET_ATOMS) : 1;
    const inComp = new Set(members);
    const bfs = from => {
      const d = new Map(from.map(a => [a, 0]));
      const q = [...from];
      for (let i = 0; i < q.length; i++) for (const b of nb[q[i]]) if (inComp.has(b) && !d.has(b)) { d.set(b, d.get(q[i]) + 1); q.push(b); }
      return d;
    };
    const seeds = [members[Math.floor(rand() * members.length)]];
    while (seeds.length < pieces) {
      const d = bfs(seeds);
      let far = members[0];
      for (const a of members) if (d.get(a) > d.get(far)) far = a;
      seeds.push(far);
    }
    const ids = seeds.map(() => next++);
    const q = [];
    seeds.forEach((a, i) => { region[a] = ids[i]; q.push(a); });
    for (let i = 0; i < q.length; i++) {
      const a = q[i];
      const nbs = nb[a].slice().sort(() => 0);
      for (const b of nbs) if (inComp.has(b) && region[b] < 0) { region[b] = region[a]; q.push(b); }
    }
  }

  const map = E.mapFromAtoms(cols, rows, next, orient, [...region]);
  if (!map) throw new Error(spec.id + ': could not remove corner touches');
  // A region shows the picture colour most of its triangles had in the photo.
  const colour = new Array(map.count).fill(0).map(() => new Map());
  map.atoms.forEach((r, a) => colour[r].set(src.labels[a], (colour[r].get(src.labels[a]) || 0) + 1));
  const regionColor = colour.map(m => [...m].sort((x, y) => y[1] - x[1])[0][0]);
  const p = E.puzzleFromMap(map, spec.seed, spec.locks, spec.easy);
  const sizes = new Array(map.count).fill(0); map.atoms.forEach(r => sizes[r]++);
  console.log(`${spec.id}: ${cols}x${rows}, ${map.count} regions (atoms ${Math.min(...sizes)}–${Math.max(...sizes)}), clues ${p.given.filter(c => c >= 0).length}, openings ${E.openings(map.adj, p.given, 4)}, plain-elimination ${E.propagationSolves(map.adj, p.given, 4)}, locks ${JSON.stringify(p.locks)}, unique ${E.countSolutions(map.adj, p.given, 4, 2).count === 1}, corner-free ${!E.findCornerTouch(map)}`);
  return {
    id: spec.id, name: spec.name, cols, rows, count: map.count,
    orient: map.orient, atoms: map.atoms, palette: src.palette, regionColor,
    tiles: src.labels, // picture colour of every triangle, used for the finished mosaic
    given: p.given, solution: p.solution, locks: p.locks,
  };
}

const levels = LEVELS.map(build);
const out = '// Generated by tools/build_art.js — mosaic test levels whose regions reveal a picture.\nwindow.CARTO_ART = ' + JSON.stringify(levels) + ';\n';
fs.writeFileSync(path.join(__dirname, '..', 'art-levels.js'), out);
console.log('wrote art-levels.js', (out.length / 1024).toFixed(1) + ' KB');
