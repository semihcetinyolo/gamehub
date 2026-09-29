// Rewrite level grids inside levels.js in place. Only the grid rows change; every other field
// (theme, jelly, feature, tips, comments, formatting) is left exactly as it is. Handles both the
// JS style (grid: [ 'row', ... ]) and the JSON style ("grid": [ "row", ... "row" ]) entries.
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

module.exports = { writeGrids, writeField };
