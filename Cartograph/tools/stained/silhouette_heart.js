// Preserve the red heart and geometry; make its colour deducible from neighbours.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const E=require('../../engine.js'),{normalClues,focalClues}=require('./starting_clues.js');
const file=path.resolve(__dirname,'../../output/silhouette-rollout/maps/heart.json'),x=JSON.parse(fs.readFileSync(file));
const old=x.solution.slice(),adj=x.map.adj,heart=x.clueFocus.primary[0];
let result=null;
for(let limit=1;limit<=31&&!result;limit++){
 for(const target of adj[heart]){
  const fixed=Array(old.length).fill(-1);fixed[heart]=old[heart];fixed[target]=3;
  function visit(cost){
   if(cost>limit)return null;
   let pick=-1,choices=null;
   for(let r=0;r<fixed.length;r++)if(fixed[r]<0){
    const allowed=[old[r],...[0,1,2,3].filter(c=>c!==old[r])].filter(c=>!adj[r].some(j=>fixed[j]===c));
    if(!allowed.length)return null;
    if(pick<0||allowed.length<choices.length){pick=r;choices=allowed;}
   }
   if(pick<0)return new Set(adj[heart].map(r=>fixed[r])).size===3?fixed.slice():null;
   for(const c of choices){fixed[pick]=c;const got=visit(cost+(c!==old[pick]));if(got)return got;}fixed[pick]=-1;return null;
  }
  result=visit(1);if(result)break;
 }
}
if(!result)throw Error('No suitable heart colouring');
x.solution=result;
const baseline=normalClues(adj,result,1103,4);
x.given=focalClues(adj,result,baseline,x.clueFocus.weights,98171,{requested:4});
if(x.given[heart]>=0)throw Error('Heart must be left for the player');
x.clueFocus.solution=crypto.createHash('sha256').update(JSON.stringify(result)).digest('hex');
x.artworkNeedsRefresh=true;
fs.writeFileSync(file,JSON.stringify(x));
console.log({heart,changedColors:result.map((c,r)=>c!==old[r]?r:null).filter(r=>r!==null),openings:E.openings(adj,x.given,4),heartGiven:x.given[heart]});
