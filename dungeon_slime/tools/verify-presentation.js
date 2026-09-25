#!/usr/bin/env node
// Rendering geometry and motion invariants, independent of the browser.
const assert=require('node:assert/strict');
const E=require('../engine.js'),levels=require('../levels.js'),Board=require('../board.js'),M=require('../motion.js'),Features=require('../features.js');
let faces=0,clips=0;
for(const level of levels){
  const L=E.parse(level),board=Board.build(L);
  const neutral=Board.build({...L,cells:L.cells.map(row=>row.map(c=>c==='*'?'#':c))});
  const shape=b=>b.edges.map(({ax,ay,bx,by})=>[ax,ay,bx,by]);
  assert.deepEqual(shape(board),shape(neutral),'hazard material added another wall contour');
  assert.equal(board.loops.flat().length,board.edges.length);
  for(const loop of board.loops){
    for(let i=0;i<loop.length;i++){
      const a=loop[i],b=loop[(i+1)%loop.length];
      assert.equal(a.bx,b.ax,'open contour');assert.equal(a.by,b.ay,'open contour');
      const tile=E.cellAt(L,a.wallX,a.wallY);
      assert(Board.solid(tile));assert.equal(a.hazard,tile==='*');
      assert(Math.abs(Board.materialWeight(a,1)-Board.materialWeight(b,0))<1e-8,'material tint jumps at a join/corner');
      for(let t=0;t<=1;t+=.1){const weight=Board.materialWeight(a,t);assert(weight>=-1e-8&&weight<=1+1e-8);}
      if(a.blend.every(Boolean))assert.equal(Board.materialWeight(a,.5),1);
      if(a.blend.every(v=>!v))assert.equal(Board.materialWeight(a,.5),0);
    }
  }
  assert.equal(board.runs.reduce((sum,e)=>sum+e.length,0),board.edges.length);
  const masonry=b=>b.wallRuns.map(e=>[e.ax,e.ay,e.bx,e.by,e.length]);
  assert.deepEqual(masonry(board),masonry(neutral),'texture/seams restart at a hazard boundary');
  const cells=new Map();
  for(const e of board.edges){const key=e.wallX+','+e.wallY;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(e);}
  const area=p=>Math.abs(p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a[0]*b[1]-b[0]*a[1];},0))/2;
  const contains=(p,x,y)=>p.every((a,i)=>{const b=p[(i+1)%p.length];return (b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0])>=-1e-9;});
  for(const faces of cells.values()){
    assert(Math.abs(faces.reduce((sum,e)=>sum+area(e.region),0)-1)<1e-8,'wall faces leave gaps or overlap');
    for(let x=0;x<3;x++)for(let y=0;y<3;y++){
      const px=faces[0].wallX+(x+.317)/3,py=faces[0].wallY+(y+.719)/3;
      assert.equal(faces.filter(e=>contains(e.region,px,py)).length,1,'corner is painted by multiple wall faces');
    }
  }
  faces+=board.edges.length;
}
assert.equal(Features.gateCover(false),1,'disabled hazard must retain a closed cover');
assert.equal(Features.gateCover(true),0);
for(let i=0;i<=10;i++){
  assert.equal(Features.gateCover(false,{age:i/10,duration:1}),i/10);
  assert.equal(Features.gateCover(true,{age:i/10,duration:1,reactivating:true}),1-i/10);
}
const forms=[[8,1],[6,2],[4,4],[2,6],[1,8]];
for(const actor of Object.values(M.SKINS))for(let f=0;f<forms.length-1;f++)for(const reverse of [false,true]){
  const [w,h]=forms[reverse?f+1:f],[nw,nh]=forms[reverse?f:f+1];
  const from={x:4,y:8,w,h},to={x:4+w-nw,y:8+(h-nh)/2,w:nw,h:nh};
  const clip=M.morph(from,to,'right',actor);
  assert(clip.duration<=.24);
  assert.deepEqual(M.sampleMorph(clip,0),from);assert.deepEqual(M.sampleMorph(clip,clip.duration),to);
  for(const fps of [30,60,120]){
    let previous=from;
    for(let t=1/fps;t<clip.duration;t+=1/fps){
      const sample=M.sampleMorph(clip,t);
      for(const k of ['x','y','w','h']){
        assert(Number.isFinite(sample[k]));
        assert((sample[k]-previous[k])*(to[k]-from[k])>=-1e-9,`${actor.id}: reversed ${k} at ${fps}fps`);
      }
      assert(sample.w>0&&sample.h>0);previous=sample;
    }
  }
  clips++;
}
console.log(`${levels.length} boards / ${faces} wall faces: closed contours, one geometry for safe and dangerous walls.`);
console.log('Material tint stays continuous through corners; masonry is independent of hazard boundaries. Disabled traps keep their closing covers.');
console.log('Exposed wall faces partition every masonry cell exactly once, including thin pillars and corners.');
console.log(`${clips} shape transitions at 30/60/120fps: immediate, monotonic, exact endpoints, ≤240ms.`);
