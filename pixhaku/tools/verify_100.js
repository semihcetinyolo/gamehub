#!/usr/bin/env node
'use strict';
const assert=require('assert/strict'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const levels=JSON.parse(fs.readFileSync(path.join(root,'levels_manifest.json'),'utf8'));
// Independent exact-cover search. Enumerates board rectangles rather than solver clue candidates;
// uses BigInt masks and the most constrained uncovered cell (not the production top-left DFS).
function solutions(l){
 const size=l.rows*l.cols,full=(1n<<BigInt(size))-1n;
 const cluesAt=new Map(l.clues.map((k,i)=>[k.r*l.cols+k.c,i]));
 const byCell=Array.from({length:size},()=>[]);
 for(let r0=0;r0<l.rows;r0++)for(let c0=0;c0<l.cols;c0++)
 for(let r1=r0;r1<l.rows;r1++)for(let c1=c0;c1<l.cols;c1++){
  let mask=0n,owners=[],cells=[];
  for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++){const x=r*l.cols+c;mask|=1n<<BigInt(x);cells.push(x);if(cluesAt.has(x))owners.push(cluesAt.get(x));}
  if(owners.length!==1)continue;
  const i=owners[0],k=l.clues[i];
  const h=r1-r0+1,w=c1-c0+1;
  if(k.s){if((h===w?'square':h>w?'tall':'wide')!==k.s||(k.s==='square'&&h<2))continue;}
  else if(k.par){if(cells.length%2!==(k.par==='odd'?1:0))continue;}
  else if(k.more){if(cells.length<=k.more)continue;}
  else if(k.corner){if(`${+(k.r===r0)}${+(k.c===c1)}${+(k.r===r1)}${+(k.c===c0)}`!=={tl:'1001',tr:'1100',bl:'0011',br:'0110',up:'1101',down:'0111',left:'1011',right:'1110'}[k.corner])continue;}
  else if(!k.h&&!k.lock&&!k.keyLock&&cells.length!==k.n)continue;
  const rect={mask,owner:1n<<BigInt(i),link:k.link||0,dim:(r0-k.r)+','+(c0-k.c)+','+h+'x'+w}; // twins: same rectangle as seen from the "?"
  for(const x of cells)byCell[x].push(rect);
 }
 let count=0;
 function dfs(covered,used){
  if(covered===full){count++;return;}
  let opts=null;
  for(let x=0;x<size;x++)if(!(covered&(1n<<BigInt(x)))){
   const live=byCell[x].filter(q=>!(q.mask&covered)&&!(q.owner&used));
   if(!live.length)return;
   if(!opts||live.length<opts.length)opts=live;
   if(opts.length===1)break;
  }
  for(const q of opts){
   // twins (same link) must be the same rectangle, the "?" in the same spot
   if(q.link){const d=linkDim.get(q.link);if(d&&d[0]!==q.dim)continue;if(d)d[1]++;else linkDim.set(q.link,[q.dim,1]);}
   dfs(covered|q.mask,used|q.owner);
   if(q.link){const d=linkDim.get(q.link);if(--d[1]===0)linkDim.delete(q.link);}
   if(count>=2)return;}
 }
 const linkDim=new Map();
 dfs(0n,0n);return count;
}
function signature(l){
 const all=[];
 for(const flipR of [false,true])for(const flipC of [false,true])for(const transpose of [false,true]){
  const clues=l.clues.map(k=>{let r=flipR?l.rows-1-k.r:k.r,c=flipC?l.cols-1-k.c:k.c;if(transpose)[r,c]=[c,r];const s=transpose&&k.s!=='square'?{tall:'wide',wide:'tall'}[k.s]:k.s;return [r,c,k.lock?'L'+k.lock:k.keyLock?'K'+k.keyLock:k.link?'T'+k.link:k.h?'?':s?'S'+s:k.par?'P'+k.par:k.more?'M'+k.more:k.corner?'C':k.n,k.key?'k'+k.key:''].join(',');}).sort();
  all.push([transpose?l.rows:l.cols,transpose?l.cols:l.rows,...clues].join('|'));
 }
 return all.sort()[0];
}
assert.equal(levels.length,100);const seen=new Set();let locks=0,missing=0;
for(const [i,l] of levels.entries()){
 assert.equal(l.order,i+1);assert(l.clues.some(k=>!k.s&&!k.h&&!k.lock&&!k.keyLock&&!k.par&&!k.more&&!k.corner),'no numbered clue '+l.id);assert(l.cols<=10&&l.rows<=12);
 assert(!i||levels[i-1].difficulty<=l.difficulty);
 const sig=signature(l);assert(!seen.has(sig),'duplicate or mirrored puzzle '+l.id);seen.add(sig);
 const covered=new Set(),used=new Set();
 l.solution.forEach(([r0,c0,r1,c1],step)=>{
  assert(r0>=0&&c0>=0&&r1<l.rows&&c1<l.cols&&r0<=r1&&c0<=c1);
  const clues=l.clues.filter(k=>k.r>=r0&&k.r<=r1&&k.c>=c0&&k.c<=c1);assert.equal(clues.length,1);
  assert.equal(clues[0].n,(r1-r0+1)*(c1-c0+1));
  if(clues[0].lock){assert(step>=clues[0].lock,`hint reaches lock too early: ${l.id}`);locks++;}
  if(clues[0].keyLock){const keyStep=l.solution.findIndex(([a,b,c,d])=>l.clues.some(k=>k.key===clues[0].keyLock&&k.r>=a&&k.r<=c&&k.c>=b&&k.c<=d));assert(keyStep>=0&&keyStep<step,`hint reaches key lock before its key: ${l.id}`);locks++;}
  for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++){const x=r*l.cols+c;assert(!covered.has(x));covered.add(x);}
 });assert.equal(covered.size,l.cols*l.rows);
 assert.equal(solutions(l),1,'nonunique '+l.id);
 if(!fs.existsSync(path.join(root,l.art)))missing++;
}
const tags=Object.fromEntries(['easy','medium','hard','expert'].map(tag=>[tag,levels.filter(l=>l.tag===tag).length]));
assert.deepEqual(tags,{easy:20,medium:30,hard:30,expert:20});
if(process.argv.includes('--require-art'))assert.equal(missing,0,'missing art');
// levels 101–300 (mosaic rewards): Classic is numbers only, each block of ten in 201–290 uses only its one clue type
const extra=JSON.parse(fs.readFileSync(path.join(root,'levels_extra.json'),'utf8'));
const kindsOf=l=>[...new Set(l.clues.map(k=>k.lock?'lock':k.keyLock?'keylock':k.link?'twins':k.h?'hidden':k.s?(k.s==='square'?'square':'rect'):k.par?'parity':k.more?'more':k.corner?'corner':null).filter(Boolean))];
assert(extra.length>=200,'expected at least 200 extra levels');
const blocks={};
for(const [i,l] of extra.entries()){
 assert.equal(l.order,101+i);assert(l.cols<=10&&l.rows<=12);
 const sig=signature(l);assert(!seen.has(sig),'duplicate or mirrored puzzle '+l.id);seen.add(sig);
 const kinds=kindsOf(l);
 if(l.order<=200)assert.equal(kinds.length,0,'Classic level with special clues '+l.id);
 else if(l.order<=290){const want=['hidden','rect','square','parity','more','corner','lock','twins','keylock'][Math.floor((l.order-201)/10)];assert.deepEqual(kinds,[want],l.id+' should use only '+want+', has '+kinds);}
 else{assert(kinds.length>=2,'mixed level with one clue type '+l.id);assert.deepEqual(kinds.slice().sort(),l.features.slice().sort(),l.id+' should mix '+l.features+', has '+kinds);(blocks['mix'+kinds.length]=blocks['mix'+kinds.length]||[]).push(l.difficulty);}
 assert(l.clues.some(k=>!k.s&&!k.h&&!k.lock&&!k.keyLock&&!k.par&&!k.more&&!k.corner),'no numbered clue '+l.id);
 const covered=new Set();
 l.solution.forEach(([r0,c0,r1,c1],step)=>{
  const clues=l.clues.filter(k=>k.r>=r0&&k.r<=r1&&k.c>=c0&&k.c<=c1);assert.equal(clues.length,1);assert.equal(clues[0].n,(r1-r0+1)*(c1-c0+1));
  if(clues[0].lock)assert(step>=clues[0].lock,'lock too early '+l.id);
  if(clues[0].keyLock){const ks=l.solution.findIndex(([a,b,c,d])=>l.clues.some(k=>k.key===clues[0].keyLock&&k.r>=a&&k.r<=c&&k.c>=b&&k.c<=d));assert(ks>=0&&ks<step,'key after lock '+l.id);}
  for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++){const x=r*l.cols+c;assert(!covered.has(x));covered.add(x);}
 });assert.equal(covered.size,l.cols*l.rows);
 assert.equal(solutions(l),1,'nonunique '+l.id);
 const b=l.order<=200?'classic':l.order<=290?'block'+Math.floor((l.order-201)/10):'mix';(blocks[b]=blocks[b]||[]).push(l.difficulty);
}
console.log(JSON.stringify({extraLevels:extra.length,unique:extra.length,difficulty:Object.fromEntries(Object.entries(blocks).map(([k,v])=>[k,Math.min(...v)+'–'+Math.max(...v)]))}));
const count=f=>levels.reduce((t,l)=>t+l.clues.filter(f).length,0);
const firstAt=f=>(levels.find(l=>l.clues.some(f))||{}).order;
const features={shape:[count(k=>k.s),firstAt(k=>k.s)],parity:[count(k=>k.par),firstAt(k=>k.par)],more:[count(k=>k.more),firstAt(k=>k.more)],corner:[count(k=>k.corner),firstAt(k=>k.corner)],twins:[count(k=>k.link)/2,firstAt(k=>k.link)],keyLock:[count(k=>k.keyLock),firstAt(k=>k.keyLock)],lock:[count(k=>k.lock),firstAt(k=>k.lock)]};
console.log(JSON.stringify({levels:levels.length,unique:100,features,distinctIncludingMirrors:seen.size,tags,locks,missingArt:missing},null,2));
