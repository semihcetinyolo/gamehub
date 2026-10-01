// Edit levels.js in place: level grids, one numeric field (`moves`), one flag (`hard`) or the level
// order. Every other field (theme, jelly, feature, tips, comments, formatting) is left exactly as
// it is. Handles both the JS style (grid: [ 'row', ... ]) and the JSON style
// ("grid": [ "row", ... "row" ]) entries.
const fs = require('fs'), path = require('path');
const FILE = path.join(__dirname, '..', 'levels.js');

// grids: array (one per level, same order as LEVELS) of row arrays, or null to keep a level as is.
function writeGrids(grids) {
  const src = fs.readFileSync(FILE, 'utf8');
  const re = /("?)grid\1: \[([^\]]*)\]/g;
  const blocks = [...src.matchAll(re)];
  if (blocks.length !== grids.length) throw new Error(`levels.js has ${blocks.length} grids, expected ${grids.length}`);
  let out = '', last = 0;
  blocks.forEach((m, i) => {
    out += src.slice(last, m.index);
    if (!grids[i]) out += m[0];
    else {
      const body = m[2], first = body.match(/\n(\s*)(['"])/);
      const indent = first ? first[1] : '      ', q = first ? first[2] : "'";
      const trailing = /,\s*$/.test(body.replace(/\s+$/, '')) || /,\n\s*$/.test(body); // comma after the last row?
      const close = (body.match(/\n(\s*)$/) || [, '    '])[1];
      const rows = grids[i].map((r, k) => `${indent}${q}${r}${q}${k < grids[i].length - 1 || trailing ? ',' : ''}`);
      out += `${m[1]}grid${m[1]}: [\n${rows.join('\n')}\n${close}]`;
    }
    last = m.index + m[0].length;
  });
  fs.writeFileSync(FILE, out + src.slice(last));
}

// Set one numeric field (e.g. `moves`) on every level, just before its grid. An existing value is
// replaced in place; otherwise the field is inserted in the entry's own style:
//   JS style:   { ..., moves: 14, grid: [          JSON style:  "moves": 14,\n      "grid": [
// values: array (one per level, same order as LEVELS) of numbers, or null to leave a level as is.
function writeField(key, values) {
  const src = fs.readFileSync(FILE, 'utf8');
  const blocks = [...src.matchAll(/("?)grid\1: \[/g)];
  if (blocks.length !== values.length) throw new Error(`levels.js has ${blocks.length} grids, expected ${values.length}`);
  const edits = []; // [start, end, text] applied back to front
  blocks.forEach((m, i) => {
    if (values[i] == null) return;
    const open = src.lastIndexOf('{', m.index), head = src.slice(open, m.index), json = m[1] === '"';
    const existing = head.match(new RegExp(`("?)${key}\\1:\\s*-?\\d+`));
    if (existing) {
      const at = open + existing.index;
      edits.push([at, at + existing[0].length, json ? `"${key}": ${values[i]}` : `${key}: ${values[i]}`]);
    } else if (json) {
      const indent = src.slice(src.lastIndexOf('\n', m.index) + 1, m.index);
      edits.push([m.index, m.index, `"${key}": ${values[i]},\n${indent}`]);
    } else edits.push([m.index, m.index, `${key}: ${values[i]}, `]);
  });
  let out = src;
  for (const [a, b, t] of edits.sort((x, y) => y[0] - x[0])) out = out.slice(0, a) + t + out.slice(b);
  fs.writeFileSync(FILE, out);
}

// Set or clear one boolean flag (e.g. `hard`) on every level: true writes `key: true` just before
// `moves` (or the grid) in the entry's own style; false removes it. values: one per level, or null
// to leave a level as is.
function writeFlag(key, values) {
  const src = fs.readFileSync(FILE, 'utf8');
  const blocks = [...src.matchAll(/("?)grid\1: \[/g)];
  if (blocks.length !== values.length) throw new Error(`levels.js has ${blocks.length} grids, expected ${values.length}`);
  const edits = [];
  blocks.forEach((m, i) => {
    if (values[i] == null) return;
    const open = src.lastIndexOf('{', m.index), head = src.slice(open, m.index), json = m[1] === '"';
    const existing = json ? head.match(new RegExp(`"${key}": (true|false),\\n\\s*`)) : head.match(new RegExp(`${key}: (true|false), `));
    if (existing && !values[i]) edits.push([open + existing.index, open + existing.index + existing[0].length, '']);
    else if (existing && existing[1] !== 'true') edits.push([open + existing.index, open + existing.index + existing[0].length, existing[0].replace('false', 'true')]);
    else if (!existing && values[i]) {
      const before = head.match(json ? /"moves":/ : /moves:/), at = before ? open + before.index : m.index;
      const indent = src.slice(src.lastIndexOf('\n', at) + 1, at);
      edits.push([at, at, json ? `"${key}": true,\n${indent}` : `${key}: true, `]);
    }
  });
  let out = src;
  for (const [a, b, t] of edits.sort((x, y) => y[0] - x[0])) out = out.slice(0, a) + t + out.slice(b);
  fs.writeFileSync(FILE, out);
}

// Reorder the level entries: order[k] = the current (0-based) index of the level that goes to
// position k. Each entry is moved as text, so its fields, style and formatting stay as they are.
function reorder(order) {
  const src = fs.readFileSync(FILE, 'utf8');
  const start = src.indexOf('const LEVELS = [\n') + 'const LEVELS = [\n'.length, end = src.indexOf('\n  ];', start) + 1;
  const body = src.slice(start, end), cuts = [...body.matchAll(/^    \{/gm)].map(m => m.index);
  const entries = cuts.map((c, k) => body.slice(c, k + 1 < cuts.length ? cuts[k + 1] : body.length));
  if (cuts[0] !== 0 || entries.length !== order.length || new Set(order).size !== order.length || order.some(i => !entries[i]))
    throw new Error(`levels.js has ${entries.length} entries; the order must be a permutation of them`);
  if (entries.some(e => !/,\n$/.test(e))) throw new Error('every level entry must end with a comma');
  fs.writeFileSync(FILE, src.slice(0, start) + order.map(i => entries[i]).join('') + src.slice(end));
}

module.exports = { writeGrids, writeField, writeFlag, reorder };
