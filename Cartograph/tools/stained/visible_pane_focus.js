// Stage subject-aware starting clues on the existing fixed geometry and artwork.
const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');
const E=require('../../engine.js'),{focalClues,openingSeeds}=require('./starting_clues.js');
const out=path.resolve(__dirname,'../../output/visible-panes'),ctx={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(out,'before/stained-levels.js'),'utf8'),ctx);
const report=[];
for(const [i,l] of ctx.window.CARTO_STAINED.entries()){
 if(process.argv.length>2&&!process.argv.slice(2).includes(l.id))continue;
 const file=path.join(out,'maps',l.id+'.json'),info=JSON.parse(fs.readFileSync(file));
 if(!info.geometryQuality.valid || !info.given || !info.clueFocus || info.clueFocus.prepared) continue;
 const current={...l,map:info.map,solution:info.solution,given:info.given};
 const hard=info.difficulty?.tier==='hard',weights=info.clueFocus.weights;
 const requested=hard?2:openingSeeds(info.map.adj,info.solution,[...info.solution.keys()],i<8?4:3).length;
 const given=info.tutorial?Array.from(l.given):focalClues(info.map.adj,info.solution,Array.from(info.given),weights,98171+i*7919,{hard,requested,minimumEmpty:hard?(info.large?35:20):1});
 info.given=given;
 const logic=E.logicSolve(info.map.adj,given,4,hard);
 if(hard)info.difficulty={...info.difficulty,toPaint:given.filter(c=>c<0).length,openings:E.openings(info.map.adj,given,4),pairs:logic.stats.pairs,contradictions:logic.stats.probes,simpleEliminationSolves:false};
 info.clueFocus.solution=crypto.createHash('sha256').update(JSON.stringify(info.solution)).digest('hex');
 info.clueFocus.prepared=true;
 const focus=weights.map((w,r)=>w>0?r:-1).filter(r=>r>=0);
 const row={level:i+1,id:l.id,focus:focus.length,before:focus.filter(r=>current.given[r]>=0).length,after:focus.filter(r=>given[r]>=0).length,primary:info.clueFocus.primary,primaryGiven:info.clueFocus.primary.filter(r=>given[r]>=0),changed:JSON.stringify(given)!==JSON.stringify(l.given),openings:E.openings(info.map.adj,given,4),blanks:given.filter(c=>c<0).length,hard};
 fs.writeFileSync(file,JSON.stringify(info));report.push(row);console.log(JSON.stringify(row));
}
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
