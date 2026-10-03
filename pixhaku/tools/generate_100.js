#!/usr/bin/env node
'use strict';
// Resumable deterministic puzzle generation: one persisted source JSON per new theme.
const fs = require('fs'), path = require('path');
const {Worker,isMainThread,parentPort,workerData} = require('worker_threads');
const {generatePuzzle,parseLayout,analyse} = require('./shikaku');
const themes = require('./themes_100');
const dir = path.join(__dirname,'puzzles_100');
const seedOf = id => [...id].reduce((h,c)=>(Math.imul(h,31)+c.charCodeAt(0))>>>0,7);
const tagOf = e => {const d=Math.min(100,Math.round(e/1.4)); return d<30?'easy':d<58?'medium':d<82?'hard':'expert';};
function specOf(t) {
  const area=t.cols*t.rows;
  const base={cols:t.cols,rows:t.rows,start:[1,2],maxTech:4,effortTarget:t.target};
  if(t.band==='easy') return {...base,pieces:[6,10],t1Max:.6,decMin:3,liveMin:2,hiddenCount:0};
  if(t.band==='medium') return {...base,pieces:[8,13],t1Max:.42,decMin:5,liveMin:2.6,deepMin:t.target>62?1:0,hiddenCount:1};
  if(t.band==='hard') return {...base,start:[1,1],pieceStyle:'big',pieces:[10,13],t1Max:.34,decMin:8,liveMin:3,deepMin:2,cornerMax:.4,hiddenCount:1,lockCount:1};
  return {...base,start:[0,0],openTech:3,calm:0,pieceStyle:'big',pieces:[10,14],t1Max:.28,decMin:9,liveMin:3,deepMin:3,cornerMax:.35,hiddenCount:2,lockCount:1};
}
function run(t) {
  const spec=specOf(t); let best=null;
  for(let attempt=0;attempt<40;attempt++) {
    const puzzle=generatePuzzle(t.cols,t.rows,spec,{seed:(seedOf(t.id)+attempt*104729)>>>0,tilings:8,samples:220,polish:700});
    if(!puzzle) continue;
    const layout=parseLayout(puzzle.grid);
    const clues=layout.zones.map(z=>({r:puzzle.clues[z.key][0],c:puzzle.clues[z.key][1],n:z.area,...(puzzle.hidden.includes(z.key)||z.key in puzzle.locks?{h:1}:{})}));
    const a=analyse({rows:t.rows,cols:t.cols,clues});
    if(!a.unique||!a.solved||tagOf(a.effort)!==t.band) continue;
    const error=Math.abs(a.effort-t.target);
    if(!best||error<best.error) best={puzzle,error,a};
    if(error<=3 || (attempt>=5 && error<=7)) break;
  }
  if(!best) throw new Error('No matching puzzle for '+t.id);
  const {band,target,cols,rows,...meta}=t;
  const level={...meta,spec,puzzle:best.puzzle};
  fs.writeFileSync(path.join(dir,t.id+'.json'),JSON.stringify(level,null,2)+'\n');
  return {id:t.id,band,effort:best.a.effort,score:Math.round(best.a.effort/1.4),pieces:best.a.steps.length,error:best.error};
}
if(!isMainThread) {try {parentPort.postMessage({ok:run(workerData)});}catch(e){parentPort.postMessage({error:String(e)});}}
else {
  fs.mkdirSync(dir,{recursive:true});
  const todo=themes.filter(t=>!fs.existsSync(path.join(dir,t.id+'.json')));
  let cursor=0,failures=0;
  async function next(){while(cursor<todo.length){const t=todo[cursor++]; await new Promise(resolve=>{const w=new Worker(__filename,{workerData:t});w.once('message',m=>{console.log(JSON.stringify(m));if(m.error)failures++;resolve();});w.once('error',e=>{console.error(e);failures++;resolve();});});}}
  Promise.all(Array.from({length:3},next)).then(()=>{console.log(`Done: ${themes.length-todo.length+todo.length-failures}/77 sources; failures=${failures}`);process.exitCode=failures?1:0;});
}
