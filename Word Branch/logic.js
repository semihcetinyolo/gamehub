// wheelSlots holds real parts; decoys are extra ring slots with fake parts that fit no target.
export const DEFAULTS = Object.freeze({ visibleRows: 4, wheelSlots: 5, decoys: 0 });

function options(opts = {}) {
  return { visibleRows: opts.visibleRows ?? DEFAULTS.visibleRows,
    wheelSlots: opts.wheelSlots ?? DEFAULTS.wheelSlots, decoys: opts.decoys ?? DEFAULTS.decoys };
}

export function validateLevel(level, opts = {}) {
  const config = options(opts);
  for (const key of ['visibleRows', 'wheelSlots']) {
    if (!Number.isSafeInteger(config[key]) || config[key] < 1) {
      throw new Error(`${key} must be a positive integer`);
    }
  }
  if (!Number.isSafeInteger(config.decoys) || config.decoys < 0) throw new Error('decoys must be a non-negative integer');
  if (!level || !/^[A-ZÇĞİÖŞÜ]+$/.test(level.root ?? '')) throw new Error('root must be uppercase letters');
  if (!Array.isArray(level.words) || !level.words.length) throw new Error('words must be a nonempty array');
  const seen = new Set();
  for (const entry of level.words) {
    if (!entry || typeof entry.word !== 'string' || !Array.isArray(entry.parts) || entry.parts.length < 2 ||
        entry.parts.some(part => typeof part !== 'string' || !/^[A-ZÇĞİÖŞÜ]{1,3}$/.test(part))) {
      throw new Error('Every word needs at least 2 uppercase parts of 1–3 letters');
    }
    if (entry.open !== undefined && typeof entry.open !== 'boolean') throw new Error(`open must be a boolean for ${entry.word}`);
    if (level.root + entry.parts.join('') !== entry.word) throw new Error(`Parts do not spell ${entry.word}`);
    if (seen.has(entry.word)) throw new Error(`Duplicate target: ${entry.word}`);
    seen.add(entry.word);
    if (entry.parts.length > config.wheelSlots) throw new Error(`wheelSlots cannot fit ${entry.word}'s parts`);
  }
}

function seedValue(seed) {
  let value = 2166136261;
  for (const char of String(seed ?? 1)) value = Math.imul(value ^ char.charCodeAt(0), 16777619) >>> 0;
  return value;
}

function random(meta) {
  // Mulberry32: all evolving state lives in the serialisable game state.
  meta.rng = (meta.rng + 0x6d2b79f5) >>> 0;
  let value = meta.rng;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function row(state, word) {
  return { id: `r${state._meta.nextRow++}`, word, suffixLength: word.length - state.root.length,
    open: state._meta.open?.[word] === true };
}

function insert(state, text) {
  const empty = state.wheel.flatMap((node, i) => node === null ? [i] : []);
  if (!empty.length) return;
  const slot = empty[Math.floor(random(state._meta) * empty.length)];
  state.wheel[slot] = { id: `n${state._meta.nextNode++}`, text };
}

// ---------- decoys ----------
// A decoy is never a substring of any target's remainder, so it can't take part in any
// spelling. Real-part logic runs on the ring without decoy slots; decoys keep their slots.
const VOWELS = new Set('AEIİOÖUÜ');

function decoyText(state) {
  const meta = state._meta;
  const onWheel = new Set(state.wheel.filter(Boolean).map(node => node.text));
  const pool = meta.decoyPool.filter(text => !onWheel.has(text));
  if (pool.length) return pool[Math.floor(random(meta) * pool.length)];
  // No pool left: build a syllable from the level's own letters.
  const vowels = meta.letters.filter(c => VOWELS.has(c));
  const consonants = meta.letters.filter(c => !VOWELS.has(c));
  const pick = list => list[Math.floor(random(meta) * list.length)];
  for (let attempt = 0; attempt < 60 && vowels.length && consonants.length; attempt++) {
    const text = pick(consonants) + pick(vowels) + (random(meta) < 0.5 ? pick(consonants) : '');
    if (!onWheel.has(text) && !meta.remainders.some(rest => rest.includes(text))) return text;
  }
  return null;
}

function placeDecoys(state, count) {
  for (let i = 0; i < count; i++) {
    const text = decoyText(state);
    if (!text) return;
    const node = { id: `n${state._meta.nextNode++}`, text };
    state.wheel.splice(Math.floor(random(state._meta) * (state.wheel.length + 1)), 0, node);
    state._meta.decoyIds.push(node.id);
  }
}

// After a found word every decoy changes, so fake parts can't be learnt by sight.
function rerollDecoys(state) {
  const ids = new Set(state._meta.decoyIds);
  const lost = new Set();
  state._meta.decoyIds = [];
  state.wheel.forEach((node, slot) => {
    if (!node || !ids.has(node.id)) return;
    state.wheel[slot] = null;
    const text = decoyText(state);
    if (!text) { lost.add(slot); return; }
    state.wheel[slot] = { id: `n${state._meta.nextNode++}`, text };
    state._meta.decoyIds.push(state.wheel[slot].id);
  });
  // A decoy slot with no replacement is dropped, so real logic never sees a hole it can't fill.
  if (lost.size) state.wheel = state.wheel.filter((_, slot) => !lost.has(slot));
}

function withRealWheel(state, fn) {
  const ids = new Set(state._meta.decoyIds);
  const full = state.wheel;
  const decoySlots = new Set(full.flatMap((node, i) => node && ids.has(node.id) ? [i] : []));
  if (!decoySlots.size) return fn(state);
  state.wheel = full.filter((_, i) => !decoySlots.has(i));
  try {
    return fn(state);
  } finally {
    const real = state.wheel;
    let k = 0;
    state.wheel = full.map((node, i) => decoySlots.has(i) ? node : real[k++]);
  }
}

// Check actual strings, including alternate splits and duplicate texts.
function newOnlySolutions(state, survivorIds) {
  return findSolutions({ ...state, wheel: state.wheel.map(node =>
    node && !survivorIds.has(node.id) ? node : null) });
}

function safeCompletion(state, allowFresh = false) {
  // Search both authored and alternate splits using natural level chunks. A plan
  // must use a survivor and its new chunks must not spell ANY visible target.
  const suffixes = new Set(state.rows.map(row => row.word.slice(state.root.length)));
  const chunks = [...new Set(Object.values(state._meta.parts).flat())].filter(text => !suffixes.has(text));
  const survivors = state.wheel.flatMap((node, index) => node ? [{ ...node, index }] : []);
  let best = null;
  for (const target of state.rows) {
    const suffix = target.word.slice(state.root.length);
    const used = new Set();
    const missing = [];
    const failed = new Set();
    function search(offset, count) {
      if (best && missing.length >= best.missing.length) return;
      if (offset === suffix.length) {
        if (used.size || allowFresh) best = { keep: new Set(used), missing: [...missing] };
        return;
      }
      if (count >= state.wheel.length) return;
      const key = `${offset}|${[...used].sort().join(',')}|${[...missing].sort().join(',')}`;
      if (failed.has(key)) return;
      failed.add(key);
      const tried = new Set();
      for (const node of survivors) {
        if (used.has(node.index) || tried.has(node.text) || !suffix.startsWith(node.text, offset)) continue;
        tried.add(node.text);
        used.add(node.index);
        search(offset + node.text.length, count + 1);
        used.delete(node.index);
      }
      for (const text of chunks) {
        if (!suffix.startsWith(text, offset)) continue;
        missing.push(text);
        const freshWheel = missing.map((part, i) => ({ id: `test${i}`, text: part }));
        if (allowFresh || !findSolutions({ ...state, wheel: freshWheel }).length) search(offset + text.length, count + 1);
        missing.pop();
      }
    }
    search(0, 0);
  }
  return best;
}

function installPlan(state, choice) {
  const priority = text => {
    const index = state.rows.findIndex(item => state._meta.parts[item.word].includes(text));
    return index < 0 ? Infinity : index;
  };
  const surplus = state.wheel.flatMap((node, i) => node && !choice.keep.has(i) ? [i] : []);
  surplus.sort((a, b) => priority(state.wheel[b].text) - priority(state.wheel[a].text) || a - b);
  for (const text of choice.missing) {
    if (!state.wheel.includes(null)) state.wheel[surplus.shift()] = null;
    insert(state, text);
  }
}

function refill(state, initial = false) {
  if (state.done) return;
  const suffixes = new Set(state.rows.map(row => row.word.slice(state.root.length)));
  // A queued decoy can become a whole answer when its row enters view.
  // Replace those nodes before planning; submissions still accept alternate splits.
  state.wheel = state.wheel.map(node => node && suffixes.has(node.text) ? null : node);
  const survivors = new Set(state.wheel.filter(Boolean).map(node => node.id));
  if (!findSolutions(state).length) {
    // First complete a word that already has pieces on the wheel. Only if no
    // safe spelling exists may solvability override the new-only rule.
    const plan = initial ? safeCompletion(state, true) : safeCompletion(state) ?? safeCompletion(state, true);
    installPlan(state, plan);
  }

  // Seed one part of each target before adding its next part. Include queued
  // targets so even one-row games can carry a useful piece into the next refill.
  const groups = [state.rows.map(item => item.word), state.queue];
  const reserved = new Set();
  const unavoidable = new Set(initial ? [] : newOnlySolutions(state, survivors).map(solution => solution.rowId));
  for (const words of groups) {
    const maxParts = Math.max(0, ...words.map(word => state._meta.parts[word].length));
    for (let depth = 0; depth < maxParts; depth++) {
      for (const word of words) {
        const text = state._meta.parts[word][depth];
        if (!text || suffixes.has(text)) continue;
        const existing = state.wheel.findIndex((node, i) => node?.text === text && !reserved.has(i));
        if (existing >= 0) { reserved.add(existing); continue; }
        const empty = state.wheel.indexOf(null);
        if (empty < 0) continue;
        // Probe without consuming an id or RNG draw. Unsafe filler is omitted;
        // later visible/queued parts still get a chance to use the empty slot.
        state.wheel[empty] = { id: 'probe', text };
        const safe = initial || newOnlySolutions(state, survivors).every(solution => unavoidable.has(solution.rowId));
        state.wheel[empty] = null;
        if (!safe) continue;
        insert(state, text);
        reserved.add(state.wheel.findIndex(node => node?.id === `n${state._meta.nextNode - 1}`));
      }
    }
  }
}

// A consecutive run may wrap and may be read in either direction. One-node
// targets cannot be separated geometrically and are excluded from this check.
function adjacentTargets(state, wheel = state.wheel) {
  let count = 0;
  for (const row of state.rows) {
    const suffix = row.word.slice(state.root.length);
    if (state._meta.parts[row.word].length === 1 || state.wheel.some(node => node?.text === suffix)) continue;
    let adjacent = false;
    for (let start = 0; start < wheel.length && !adjacent; start++) {
      for (const direction of [1, -1]) {
        let text = '';
        for (let length = 1; length <= wheel.length; length++) {
          const node = wheel[(start + direction * (length - 1) + wheel.length) % wheel.length];
          if (!node) break;
          text += node.text;
          if (text === suffix) { adjacent = true; break; }
          if (!suffix.startsWith(text)) break;
        }
      }
    }
    if (adjacent) count++;
  }
  return count;
}

function spreadInitial(state) {
  let best = [...state.wheel];
  let score = adjacentTargets(state);
  if (!score) return 0;
  // Seeded trials quickly find a separated layout on normal mobile wheels.
  for (let attempt = 0; attempt < 64 && score; attempt++) {
    const candidate = [...state.wheel];
    for (let i = candidate.length - 1; i > 0; i--) {
      const j = Math.floor(random(state._meta) * (i + 1));
      [candidate[i], candidate[j]] = [candidate[j], candidate[i]];
    }
    const nextScore = adjacentTargets(state, candidate);
    if (nextScore < score) { best = candidate; score = nextScore; }
  }
  // Exact fallback: enumerate distinct text arrangements (rotation fixed). This
  // proves the remaining adjacency unavoidable for this wheel's multiset.
  if (score) {
    const pool = [...state.wheel];
    const candidate = [pool.shift()];
    function search() {
      if (!score) return;
      if (!pool.length) {
        const nextScore = adjacentTargets(state, candidate);
        if (nextScore < score) { best = [...candidate]; score = nextScore; }
        return;
      }
      const tried = new Set();
      for (let i = 0; i < pool.length && score; i++) {
        const key = pool[i]?.text ?? null;
        if (tried.has(key)) continue;
        tried.add(key);
        const [node] = pool.splice(i, 1);
        candidate.push(node);
        // Any forbidden run already inside the prefix survives every extension.
        const partial = [...candidate, ...Array(pool.length).fill(null)];
        if (adjacentTargets(state, partial) < score) search();
        candidate.pop();
        pool.splice(i, 0, node);
      }
    }
    search();
  }
  state.wheel = best;
  return score;
}

function prepareInitial(state) {
  let score = spreadInitial(state);
  if (!score || state.wheel.length < 4) return;
  let best = null;
  // If mutually conflicting partial words prevent separation, retain a complete
  // answer and rebuild the surplus from natural parts. Dropping just one piece
  // is insufficient when several duplicate chunks impose the same constraint.
  for (const solution of findSolutions(state)) {
    const keep = new Set(solution.nodeIds);
    const trial = { ...state, wheel: state.wheel.map(node => node && keep.has(node.id) ? node : null),
      _meta: { ...state._meta } };
    const nextScore = spreadInitial(trial);
    if (nextScore < score) { best = trial; score = nextScore; }
    if (!score) break;
  }
  if (!best) return;
  const words = [...state.rows.map(row => row.word), ...state.queue];
  const suffixes = new Set(state.rows.map(row => row.word.slice(state.root.length)));
  const maxParts = Math.max(...words.map(word => state._meta.parts[word].length));
  for (let depth = 0; depth < maxParts; depth++) {
    for (const word of words) {
      const text = state._meta.parts[word][depth];
      if (!text || suffixes.has(text) || !best.wheel.includes(null)) continue;
      const trial = { ...best, wheel: [...best.wheel], _meta: { ...best._meta } };
      insert(trial, text);
      const nextScore = spreadInitial(trial);
      if (nextScore > score) continue;
      best = trial;
      score = nextScore;
    }
  }
  state.wheel = best.wheel;
  state._meta = best._meta;
}

export function createGame(level, opts = {}) {
  validateLevel(level, opts);
  const config = options(opts);
  const remainders = level.words.map(item => item.word.slice(level.root.length));
  const decoyPool = [...new Set(opts.decoyPool ?? [])].filter(text => typeof text === 'string' &&
    /^[A-ZÇĞİÖŞÜ]{2,3}$/.test(text) && !remainders.some(rest => rest.includes(text)));
  const state = {
    root: level.root, rows: [], queue: level.words.map(item => item.word),
    wheel: Array(config.wheelSlots).fill(null), found: [], total: level.words.length, done: false,
    _meta: { ...config, rng: seedValue(opts.seed), nextNode: 1, nextRow: 1,
      parts: Object.fromEntries(level.words.map(item => [item.word, [...item.parts]])),
      open: Object.fromEntries(level.words.map(item => [item.word, item.open === true])),
      decoyIds: [], decoyPool, remainders,
      letters: [...new Set(remainders.join(''))] },
  };
  while (state.rows.length < config.visibleRows && state.queue.length) state.rows.push(row(state, state.queue.shift()));
  refill(state, true);
  prepareInitial(state);
  placeDecoys(state, config.decoys);
  return state;
}

export function wordOf(state, nodeIds) {
  const nodes = new Map(state.wheel.filter(Boolean).map(node => [node.id, node.text]));
  return state.root + nodeIds.map(id => nodes.get(id) ?? '').join('');
}

export function findSolutions(state) {
  const nodes = state.wheel.filter(Boolean);
  const answers = [];
  for (const target of state.rows) {
    const suffix = target.word.slice(state.root.length);
    const used = new Set();
    const path = [];
    function search(offset) {
      if (offset === suffix.length) return true;
      const tried = new Set();
      for (const node of nodes) {
        if (used.has(node.id) || tried.has(node.text) || !suffix.startsWith(node.text, offset)) continue;
        tried.add(node.text);
        used.add(node.id);
        path.push(node.id);
        if (search(offset + node.text.length)) return true;
        path.pop();
        used.delete(node.id);
      }
      return false;
    }
    if (search(0)) answers.push({ rowId: target.id, nodeIds: [...path] });
  }
  return answers;
}

export function submit(state, nodeIds) {
  const reject = reason => ({ state, result: { ok: false, reason } });
  if (!Array.isArray(nodeIds) || !nodeIds.length) return reject('too-short');
  if (new Set(nodeIds).size !== nodeIds.length) return reject('duplicate-node');
  const available = new Set(state.wheel.filter(Boolean).map(node => node.id));
  if (nodeIds.some(id => !available.has(id))) return reject('unknown-node');
  const word = wordOf(state, nodeIds);
  const target = state.rows.find(item => item.word === word);
  if (!target) return reject('not-a-target');
  const next = JSON.parse(JSON.stringify(state));
  const used = new Set(nodeIds);
  next.wheel = next.wheel.map(node => node && used.has(node.id) ? null : node);
  next.rows = next.rows.filter(item => item.id !== target.id);
  next.found.push(word);
  let addedRowId = null;
  if (next.queue.length) {
    const added = row(next, next.queue.shift());
    next.rows.push(added);
    addedRowId = added.id;
  }
  next.done = !next.rows.length && !next.queue.length;
  withRealWheel(next, () => refill(next));
  if (!next.done) rerollDecoys(next);
  return { state: next, result: { ok: true, word, rowId: target.id, usedNodeIds: [...nodeIds],
    addedNodeIds: next.wheel.filter(node => node && !available.has(node.id)).map(node => node.id), addedRowId } };
}

export function shuffleWheel(state) {
  const next = JSON.parse(JSON.stringify(state));
  // Fisher–Yates includes empty slots so sparse wheels can change their layout too.
  for (let i = next.wheel.length - 1; i > 0; i--) {
    const j = Math.floor(random(next._meta) * (i + 1));
    [next.wheel[i], next.wheel[j]] = [next.wheel[j], next.wheel[i]];
  }
  const occupied = next.wheel.flatMap((node, index) => node ? [index] : []);
  const unchanged = next.wheel.every((node, index) => node?.id === state.wheel[index]?.id);
  if (occupied.length >= 2 && unchanged) {
    // An identity permutation is possible; swapping two distinct ids guarantees movement.
    const [a, b] = occupied;
    [next.wheel[a], next.wheel[b]] = [next.wheel[b], next.wheel[a]];
  }
  return next;
}
