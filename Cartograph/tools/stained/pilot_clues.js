// Build playable clue sets for the staged ten-level geometry pilot only.
const fs = require('fs');
const path = require('path');
const E = require('../../engine.js');
const { normalClues } = require('./starting_clues.js');
const dir = path.resolve(__dirname, '../../output/geometry-pilot');
const report = JSON.parse(fs.readFileSync(path.join(dir, 'geometry-report.json')));
for (const row of report) {
  const file = path.join(dir, 'maps', row.id + '.json');
  const level = JSON.parse(fs.readFileSync(file));
  level.given = normalClues(level.map.adj, level.solution, 80000 + row.level, 3);
  const logic = {
    startingMoves: E.openings(level.map.adj, level.given, 4),
    toPaint: level.given.filter(c => c < 0).length,
    solvedByElimination: E.propagationSolves(level.map.adj, level.given, 4),
    solutions: E.countSolutions(level.map.adj, level.given, 4, 2).count,
  };
  if (logic.startingMoves < 3 || !logic.solvedByElimination || logic.solutions !== 1) {
    throw new Error(`${row.id}: revise the pilot geometry/colouring before previewing`);
  }
  level.pilot.logic = logic;
  fs.writeFileSync(file, JSON.stringify(level));
  console.log(`${row.level} ${row.id}: ${logic.startingMoves} starts, ${logic.toPaint} to paint`);
}
