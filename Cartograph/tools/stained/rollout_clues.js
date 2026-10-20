// Staged production clue generation; final publication still validates uniqueness.
const fs=require('fs'),path=require('path'),E=require('../../engine.js');
const {normalClues,openingSeeds}=require('./starting_clues.js');
const dir=path.resolve(__dirname,'../../output/geometry-rollout');
const rows=JSON.parse(fs.readFileSync(path.join(dir,'before/manifest.json'))),report=[];
for(const row of rows){
 if(row.hard)continue;
 const file=path.join(dir,'maps',row.id+'.json'),l=JSON.parse(fs.readFileSync(file));
 try{
  if(!l.tutorial) {
    if(openingSeeds(l.map.adj,l.solution,[...l.solution.keys()],3).length<3)throw Error('Three independent opening regions required');
    l.given=normalClues(l.map.adj,l.solution,80000+row.level,3);
  }
  let logic={id:row.id,startingMoves:E.openings(l.map.adj,l.given,4),toPaint:l.given.filter(c=>c<0).length,elimination:E.propagationSolves(l.map.adj,l.given,4),solutions:E.countSolutions(l.map.adj,l.given,4,2).count};
  if(logic.startingMoves<(l.tutorial?2:3)||!logic.elimination||logic.solutions!==1)throw Error(JSON.stringify(logic));
  l.geometryPolicy.logic=logic;fs.writeFileSync(file,JSON.stringify(l));report.push(logic);
 }catch(e){report.push({id:row.id,error:e.message});console.log(row.id,e.message)}
}
fs.writeFileSync(path.join(dir,'normal-logic-report.json'),JSON.stringify(report,null,2));
console.log('Normal logic:',report.filter(r=>!r.error).length,'/',report.length);
