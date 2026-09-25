#!/usr/bin/env node
const assert=require('node:assert/strict'),E=require('../engine.js'),levels=require('../levels.js');
const base=Array.from({length:20},(_,y)=>Array.from({length:20},(_,x)=>!x||!y||x===19||y===19?'#':'.'));
for(let x=8;x<12;x++)base[0][x]='E';base[10][8]='S';
const rotateGrid=grid=>grid[0].map((_,x)=>grid.map(row=>row[x]).reverse());
const rotateBody=b=>({...b,x:20-b.y-b.h,y:b.x,w:b.h,h:b.w});
const cases=[
  ['exact fit',{x:8,y:10,w:4,h:4},true],
  ['thin fit',{x:9,y:10,w:2,h:6},true],
  ['too wide',{x:6,y:10,w:6,h:2},false],
  ['partial contact',{x:9,y:10,w:4,h:4},false],
];
let grid=base;
for(const [turn,dir] of ['up','right','down','left'].entries()){
  const L=E.parse({name:'Aperture regression',grid:grid.map(row=>row.join(''))});
  for(const [name,body,win] of cases){
    let b={...body};for(let i=0;i<turn;i++)b=rotateBody(b);
    const state={...E.initialState(L),...b},r=E.move(L,state,dir);
    assert.equal(r.result==='win',win,`${dir}: ${name}`);
    assert(E.fits(L,r.state,r.state),'exit interaction embedded the body in masonry');
  }
  grid=rotateGrid(grid);
}
// Exact reported level-22 sequence: the 6×2 body cannot leave through the 4-wide portal.
const L=E.parse(levels[21]);let s=E.initialState(L);
for(const dir of ['up','down','right'])s=E.move(L,s,dir).state;
assert.equal(s.w,6);assert.equal(s.h,2);
assert.notEqual(E.move(L,s,'up').result,'win');
const solution=E.solve(L,E.initialState(L));assert.equal(solution.path.length,5);
s=E.initialState(L);let last;
for(const dir of solution.path){last=E.move(L,s,dir);s=last.state;}assert.equal(last.result,'win');
// Keys still gate a correctly aligned exit.
const K=E.parse({name:'Keyed aperture',grid:base.map(row=>row.join(''))});K.hasKey=true;
assert.notEqual(E.move(K,E.initialState(K),'up').result,'win');
assert.equal(E.move(K,{...E.initialState(K),key:true},'up').result,'win');
console.log('Exit apertures: full fit, thin fit, oversized/partial rejection in all 4 directions; level-22 regression and keyed exits OK.');
