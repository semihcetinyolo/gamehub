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

module.exports = { writeGrids };
