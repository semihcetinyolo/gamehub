#!/usr/bin/env node
const assert=require('node:assert/strict'),M=require('../motion'),E=require('../elements'),Board=require('../board'),Engine=require('../engine'),levels=require('../levels'),Props=require('../props');
let calls=0,arcs=0;
const context=new Proxy({}, {get(_,key){
  if(key==='createLinearGradient')return()=>({addColorStop(){}});
  return(...args)=>{calls++;for(const a of args)if(typeof a==='number')assert(Number.isFinite(a),key+' finite');if(key==='arc'||key==='ellipse'){arcs++;assert(args[2]>=0);}};
},set(){return true;}}),themes={sprite(){return true;}};
// Generated elemental silhouettes must load independently and render in every shape.
const fs=require('node:fs'),path=require('node:path');
for(const actor of Object.values(M.SKINS)){
  assert(fs.existsSync(path.join(__dirname,'..',actor.atlas)),actor.name+' asset');
  for(const ready of [false,true])for(const [w,h] of [[80,80],[120,40],[160,20],[40,120],[20,160]])
    M.paintBody(context,{x:0,y:0,w,h},actor,.3,{...themes,ready:()=>ready},.7);
}
assert.equal(levels[29].jelly,'void','void must be playable in level 30');
const ids=new Set();let clips=0;
for(const actor of Object.values(M.SKINS))for(const hazard of Object.keys(E.HAZARDS)){
  const f=M.death({x:5,y:5,w:4,h:4},0,1,actor,hazard);
  assert.equal(f.reaction.element,actor.element.id);assert.equal(f.hazard,hazard);assert(f.reaction.label);ids.add(f.reaction.id);
  for(const age of [0,.02,.12,.3,.7,1.1,f.duration-.01,f.duration]){f.age=age;M.drawDeath(context,f,20,themes);}
  const crystal=M.death({x:5,y:5,w:4,h:4},0,1,actor,'crystal');
  const spikes=M.death({x:5,y:5,w:4,h:4},0,1,actor,'spikes');
  assert.notEqual(crystal.reaction.effect,spikes.reaction.effect);assert.notEqual(crystal.duration,spikes.duration);
  clips++;
}
assert.equal(ids.size,70);assert.equal(new Set(Object.values(M.SKINS).map(a=>a.element.id)).size,7);
// A fading body must not leave its crest, highlights or material lines behind.
for(const actor of Object.values(M.SKINS)){
  const state={globalAlpha:0},stack=[];
  const fading=new Proxy(state,{get(target,key){
    if(key==='globalAlpha')return target.globalAlpha;
    if(key==='save')return()=>stack.push(target.globalAlpha);
    if(key==='restore')return()=>{target.globalAlpha=stack.pop();};
    return context[key];
  },set(target,key,value){if(key==='globalAlpha')assert.equal(value,0,'invisible body resurrected an overlay');target[key]=value;return true;}});
  for(const [w,h] of [[80,80],[160,20],[20,160]])M.paintBody(fading,{x:0,y:0,w,h},actor,1,themes,1);
}
const types=new Set();let corners=0;
for(const level of levels){
  const L=Engine.parse(level),b=Board.build(L);
  for(const part of b.parts){types.add(part.type);assert.equal(part.hazard,L.cells[part.y]?.[part.x]==='*');assert(part.faces.length>0);}
  for(const corner of b.corners){corners++;types.add(corner.type);assert.equal(corner.before.bx,corner.x);assert.equal(corner.after.ax,corner.x);assert.equal(corner.hazard,corner.before.hazard||corner.after.hazard);}
  const neutral=Board.build({...L,cells:L.cells.map(row=>row.map(c=>c==='*'?'#':c))});
  assert.deepEqual(b.parts.map(p=>[p.x,p.y,p.type]),neutral.parts.map(p=>[p.x,p.y,p.type]));
  for(const r of L.portals)for(const scale of [10,18,28]){
    const p=Props.portalLayout(r,L,scale);assert(p.width>=34);assert.equal(p.height/p.width,1.35);assert(p.x>=0&&p.y>=0);assert(p.x+p.width<=L.W*scale&&p.y+p.height<=L.H*scale);
  }
}
for(const type of ['outer-straight','inner-straight','inner-corner','outer-corner','end-cap','pillar'])assert(types.has(type),type);
assert(calls>1000&&arcs>1000);
console.log(`${clips} elemental reactions rendered at 8 stages (${calls} canvas calls). Crystal/spike reactions differ for all seven elements.`);
console.log(`${corners} typed wall corners; six wall part types share identical safe/hazard geometry. Exit signs preserve upright proportions at three scales.`);
