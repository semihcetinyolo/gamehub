const fs=require('fs'),path=require('path'),E=require('../../engine.js');
const {openingSeeds,normalClues}=require('./starting_clues.js');
const dir=path.resolve(__dirname,'../../output/geometry-rollout/maps');
for(const id of process.argv.slice(2)){
 const f=path.join(dir,id+'.json'),l=JSON.parse(fs.readFileSync(f));
 const original=l.solution.slice();let sol=original.slice(),best=null,rand=E.rng(91831);
 for(let attempt=0;attempt<12000;attempt++){
  if(attempt%200===0)sol=original.slice();
  const start=Math.floor(rand()*sol.length),a=sol[start],b=Math.floor(rand()*4);
  if(a===b)continue;
  const seen=new Set([start]),q=[start];
  while(q.length)for(const j of l.map.adj[q.pop()]) if(!seen.has(j)&&(sol[j]===a||sol[j]===b)){seen.add(j);q.push(j)}
  for(const r of seen)sol[r]=sol[r]===a?b:a;
  if(new Set(sol).size!==4)continue;
  let seeds;try{seeds=openingSeeds(l.map.adj,sol,[...sol.keys()],3)}catch(e){continue}
  if(seeds.length<3)continue;
  const score=sol.reduce((s,c,i)=>s+(c===original[i]?l.map.area?.[i]||1:0),0);
  if(!best||score>best.score)best={score,solution:sol.slice()};
 }
 if(best){l.solution=best.solution;l.artworkNeedsRefresh=true;l.given=normalClues(l.map.adj,l.solution,814,3);fs.writeFileSync(f,JSON.stringify(l));console.log(id,'recoloured',l.given.filter(x=>x<0).length)}else console.log(id,'NEEDS SUBDIVISION');
}
