#!/usr/bin/env node
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),M=require('../materials').MATERIALS,levels=require('../levels'),E=require('../engine'),SPK=require('./spikes');
const materials=Object.values(M),newLevels=levels.slice(23);
assert.equal(materials.length,10);assert.equal(newLevels.length,10);
assert.equal(new Set(materials.flatMap(m=>[m.wallArt,m.hazardArt])).size,20);
assert.equal(new Set(newLevels.map(l=>l.material)).size,10);
assert.equal(new Set(newLevels.map(l=>l.grid.join('\n'))).size,10);
for(const m of materials)for(const art of [m.wallArt,m.hazardArt])assert(fs.statSync(path.join(root,art)).size>1000,art);
for(const art of Object.values(require('../props').ART))assert(fs.statSync(path.join(root,art)).size>1000,art);
for(const level of newLevels){
  const L=E.parse(level);assert.deepEqual(E.lint(L),[]);assert(L.cells.flat().includes('*'));
  const sol=E.solve(L,E.initialState(L));assert(sol&&sol.path.length>=5,level.name);
  const check=SPK.reshapeDeaths(L);assert(check.complete,level.name+' state coverage');assert.equal(check.deaths.length,0,level.name+' surprise death');
}
// Nine-slice corners must stay positive and inside both image and destination,
// including one-cell-wide exits and long wafer blocks.
global.Image=class {set src(src){this.naturalWidth=640;this.naturalHeight=640;queueMicrotask(()=>this.onload());}};
const T=require('../themes');
(async()=>{
 await T.load({atlas:'test-panel'});
 for(const [w,h] of [[18,144],[144,18],[36,36],[96,48]]){
  let count=0;const c={drawImage(im,sx,sy,sw,sh,x,y,dw,dh){count++;assert(sw>0&&sh>0&&dw>0&&dh>0);assert(sx>=0&&sy>=0&&sx+sw<=640&&sy+sh<=640);assert(x>=0&&y>=0&&x+dw<=w&&y+dh<=h);}};
  assert(T.nineSlice(c,'test-panel',0,0,w,h,8));assert.equal(count,9);
 }
 console.log('10 unique wall/hazard pairs, 3 props, 10 distinct solvable levels; all new reachable states free of reshape deaths. Nine-slice bounds OK.');
})().catch(e=>{console.error(e);process.exitCode=1;});
