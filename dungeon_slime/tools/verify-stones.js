#!/usr/bin/env node
// Collision, switch and puzzle regressions for movable star stones.
const assert=require('node:assert/strict');
const E=require('../engine.js'),levels=require('../levels.js');
function arena(){
  const grid=Array.from({length:22},(_,y)=>Array.from({length:22},(_,x)=>!x||!y||x===21||y===21?'#':'.'));
  grid[2][2]='S';
  return {
    box(x,y,w,h,c){for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)grid[yy][xx]=c;return this;},
    parse(extra={}){return E.parse({name:'Stone test',grid:grid.map(row=>row.join('')),...extra});},
  };
}
const launch=r=>r.path.find(p=>p.ev==='push')?.launches[0];
const bodies={right:{x:3,y:9},left:{x:15,y:9},up:{x:9,y:15},down:{x:9,y:3}};
for(const [dir,body] of Object.entries(bodies)){
  const L=arena().box(10,10,2,2,'o').parse(),s={...E.initialState(L),...body};
  const before=JSON.stringify(s),r=E.move(L,s,dir),f=launch(r);
  assert(f,`${dir}: stone did not launch`);assert.equal(r.result,'stop');
  assert.deepEqual(s,JSON.parse(before),'move mutated its input');
  const target={right:[19,10],left:[1,10],up:[10,1],down:[10,19]}[dir];
  assert.deepEqual([r.state.rocks[0].x,r.state.rocks[0].y],target);
  assert(E.fits(L,r.state,r.state),'jelly embedded in a stone after impact');
  // A plate catches a correctly aligned stone from any of the four directions.
  const plate={right:[15,10],left:[5,10],up:[10,5],down:[10,15]}[dir];
  const P=arena().box(10,10,2,2,'o').box(...plate,2,2,'b').parse();
  const p=E.move(P,{...E.initialState(P),...body},dir);
  assert.equal(p.state.switches[0],true,`${dir}: plate missed aligned stone`);
  assert.deepEqual([p.state.rocks[0].x,p.state.rocks[0].y],plate);
}
const L=arena().box(10,10,2,2,'o').box(15,10,2,2,'b').box(18,8,2,6,'!').parse();
const initial={...E.initialState(L),...bodies.right};
const opened=E.move(L,initial,'right');
assert.equal(launch(opened).activated,true);assert(E.gateOpen(L,opened.state,0));
assert.deepEqual(opened.state.rocks[0],{x:15,y:10,w:2,h:2},'plate should catch and centre the stone');
const blocked={...L,solids:L.solids.concat({x:17,y:9,w:1,h:4,t:'wall'})};
const blockedPush=E.move(blocked,opened.state,'right');
assert(!launch(blockedPush),'blocked stone should not launch');
assert(E.gateOpen(blocked,blockedPush.state,0),'blocked push released a plate still occupied by its stone');
const pushedOff=E.move(L,opened.state,'right');
assert(pushedOff.state.rocks[0].x>15,'stone cannot leave a pressed plate');
assert(!E.gateOpen(L,pushedOff.state,0),'gate remained open after the stone left');
assert.deepEqual(launch(pushedOff).released,[0]);
assert.equal(pushedOff.state.rocks[0].x,16,'stone crossed the returning hazard');
const back=E.move({...L,gates:[]},{...pushedOff.state,x:18,y:9},'left');
assert(E.gateOpen(L,back.state,0),'returning stone did not reopen plate');
assert.equal(E.gateOpen(L,E.initialState(L),0),false,'restart left the gate open');
assert.deepEqual(E.initialState(L).rocks[0],{x:10,y:10,w:2,h:2});
// Standing on the plate is not enough; a stone is required.
const alone={...initial,rocks:[]};
const jellyOnPlate=E.move(L,alone,'right');
assert.equal(jellyOnPlate.result,'dead');assert.equal(jellyOnPlate.state.switches[0],false);
// Both touching the face and grazing a corner of a closed passage are lethal.
for(const y of [9,4]){
  const atGate={...alone,x:12,y,w:4,h:4};
  assert.equal(E.move(L,atGate,'right').result,'dead');
  assert.notEqual(E.move(L,{...atGate,switches:[true]},'right').result,'dead');
}
// A grazing stone neither presses the plate nor crosses the closed hazard.
const grazing=E.move(L,{...initial,rocks:[{x:10,y:9.5,w:2,h:2}]},'right');
assert.equal(grazing.state.switches[0],false);assert.equal(grazing.state.rocks[0].x,16);
// Walls, other stones, wafers and exits all stop a launched stone.
for(const ch of ['#','o','w','E']){
  const B=arena().box(10,10,2,2,'o').box(15,10,2,2,ch).parse();
  const s={...E.initialState(B),...bodies.right};
  const r=E.move(B,s,'right');assert.equal(r.state.rocks[0].x,13,`${ch}: stone crossed an obstacle`);
  if(ch==='o')assert.deepEqual(r.state.rocks[1],s.rocks[1],'stones should not launch each other');
}
// A flush contact may launch a stone; fixed contacts may not add phantom moves.
const flush=E.move(L,{...initial,x:6},'right');assert(launch(flush));
const trapped=arena().box(10,10,2,2,'o').box(12,9,1,4,'#').parse();
assert.equal(E.move(trapped,{...E.initialState(trapped),x:6,y:9},'right').result,'none');
// Multiple gates can share a plate without affecting unrelated gates.
const linked=arena().box(10,10,2,2,'o').box(15,10,2,2,'b').box(4,17,2,2,'b')
  .box(18,8,2,6,'!').box(7,17,2,2,'!').box(12,17,2,2,'!').parse({gateButtons:[0,0,1]});
const linkedMove=E.move(linked,{...E.initialState(linked),...bodies.right},'right');
assert.deepEqual(linked.gates.map((_,i)=>E.gateOpen(linked,linkedMove.state,i)),[true,true,false]);
assert.notEqual(E.keyOf(initial),E.keyOf({...initial,rocks:[{...initial.rocks[0],x:11}]}));
assert.notEqual(E.keyOf(initial),E.keyOf({...initial,switches:[true]}));
let solved=0;
for(const level of levels.filter(l=>l.feature)){
  const P=E.parse(level),s=E.initialState(P),solution=E.solve(P,s);
  assert.deepEqual(E.lint(P),[]);assert(solution,`${level.name}: no solution`);
  let state=s,pushes=0,pressed=0,result;
  for(const dir of solution.path){const r=E.move(P,state,dir);state=r.state;result=r.result;
    for(const point of r.path)for(const f of point.launches||[]){pushes++;if(f.activated)pressed++;}}
  assert.equal(result,'win');assert(pushes);if(P.gates.length)assert(pressed);
  const fixed={...P,rocks:[],solids:P.solids.concat(P.rocks.map(r=>({...r,t:'wall'})))};
  assert.equal(E.solve(fixed,E.initialState(fixed)),null,`${level.name}: stone can be bypassed`);
  if(P.gates.length){const inactive={...P,buttons:[]};assert.equal(E.solve(inactive,E.initialState(inactive)),null,`${level.name}: gate can be bypassed`);}
  solved++;
}
console.log(`Star stones: all 4 directions, obstacles, button capture, lethal contact, release/re-press, linked gates and state isolation OK. ${solved} puzzles solved; their features cannot be bypassed.`);
