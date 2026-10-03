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
  if(!k.h&&!k.lock&&cells.length!==k.n)continue;
  const rect={mask,owner:1n<<BigInt(i)};
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
  for(const q of opts){dfs(covered|q.mask,used|q.owner);if(count>=2)return;}
 }
 dfs(0n,0n);return count;
}
function signature(l){
 const all=[];
 for(const flipR of [false,true])for(const flipC of [false,true])for(const transpose of [false,true]){
  const clues=l.clues.map(k=>{let r=flipR?l.rows-1-k.r:k.r,c=flipC?l.cols-1-k.c:k.c;if(transpose)[r,c]=[c,r];return [r,c,k.h?'?':k.lock?'L'+k.lock:k.n].join(',');}).sort();
  all.push([transpose?l.rows:l.cols,transpose?l.cols:l.rows,...clues].join('|'));
 }
 return all.sort()[0];
}
assert.equal(levels.length,100);const seen=new Set();let locks=0,missing=0;
for(const [i,l] of levels.entries()){
 assert.equal(l.order,i+1);assert(l.cols<=8&&l.rows<=10);
 assert(!i||levels[i-1].difficulty<=l.difficulty);
 const sig=signature(l);assert(!seen.has(sig),'duplicate or mirrored puzzle '+l.id);seen.add(sig);
 const covered=new Set(),used=new Set();
 l.solution.forEach(([r0,c0,r1,c1],step)=>{
  assert(r0>=0&&c0>=0&&r1<l.rows&&c1<l.cols&&r0<=r1&&c0<=c1);
  const clues=l.clues.filter(k=>k.r>=r0&&k.r<=r1&&k.c>=c0&&k.c<=c1);assert.equal(clues.length,1);
  assert.equal(clues[0].n,(r1-r0+1)*(c1-c0+1));
  if(clues[0].lock){assert(step>=clues[0].lock,`hint reaches lock too early: ${l.id}`);locks++;}
  for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++){const x=r*l.cols+c;assert(!covered.has(x));covered.add(x);}
 });assert.equal(covered.size,l.cols*l.rows);
 assert.equal(solutions(l),1,'nonunique '+l.id);
 if(!fs.existsSync(path.join(root,l.art)))missing++;
}
const tags=Object.fromEntries(['easy','medium','hard','expert'].map(tag=>[tag,levels.filter(l=>l.tag===tag).length]));
assert.deepEqual(tags,{easy:20,medium:30,hard:30,expert:20});
if(process.argv.includes('--require-art'))assert.equal(missing,0,'missing art');
console.log(JSON.stringify({levels:levels.length,unique:100,distinctIncludingMirrors:seen.size,tags,locks,missingArt:missing},null,2));
