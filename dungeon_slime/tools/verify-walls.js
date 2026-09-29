#!/usr/bin/env node
// Geometry regressions for the unified wall shell, independent of material art.
const assert=require('node:assert/strict');
const B=require('../board'),E=require('../engine'),levels=require('../levels'),Themes=require('../themes');
const fixtures=[
 ['#######','#S....#','#..#..#','#.....#','#######'],
 ['#######','#.....#','#.###.#','#..#..#','#.....#','#######'],
 ['#######','#.....#','#.##..#','#.##..#','#.....#','#######'],
 ['#######','#.....#','#.#*#.#','#..*..#','#.....#','#######'],
 ['#######','#.....#','#.#...#','#..#..#','#.....#','#######'],
];
let cells=0,draws=0;
const context=new Proxy({}, {get(_,k){
 if(k==='createLinearGradient')return()=>({addColorStop(){}});
 return(...args)=>{draws++;for(const a of args)if(typeof a==='number')assert(Number.isFinite(a),k);};
},set(){return true;}});
for(const level of [...levels,...fixtures.map(grid=>({grid}))]){
 const L=E.parse({...level,grid:level.grid.map((r,i)=>i===1&&!level.grid.some(row=>row.includes('S'))?r.replace('.','S'):r)}),b=B.build(L),neutral=B.build({...L,cells:L.cells.map(r=>r.map(c=>c==='*'?'#':c))});
 assert.deepEqual(b.skinCells,neutral.skinCells,'danger changed wall thickness');
 assert.deepEqual(b.skinEdges,neutral.skinEdges,'danger changed wall bevels');
 assert.deepEqual(b.depthFaces,neutral.depthFaces,'danger changed the raised wall profile');
 const depthCells=new Map();
 for(const e of b.depthFaces){
  const key=e.wallX+','+e.wallY;if(!depthCells.has(key))depthCells.set(key,[]);depthCells.get(key).push(e);
  for(const [x,y] of e.region)assert(x>=e.wallX-1e-8&&x<=e.wallX+1+1e-8&&y>=e.wallY-1e-8&&y<=e.wallY+1+1e-8,'side face escaped its masonry cell');
 }
 const area=p=>Math.abs(p.reduce((sum,a,i)=>{const next=p[(i+1)%p.length];return sum+a[0]*next[1]-next[0]*a[1];},0))/2;
 for(const faces of depthCells.values())assert(Math.abs(faces.reduce((sum,e)=>sum+area(e.region),0)-1)<1e-8,'depth mitres overlap or leave a corner gap');
 const skin=new Set(b.skinCells.map(c=>c.x+','+c.y));assert.equal(skin.size,b.skinCells.length);
 for(const c of b.skinCells){assert(B.solid(b.L.cells[c.y][c.x]),'wall covers floor');cells++;}
 for(const e of b.edges)if(e.wallX>=0&&e.wallY>=0&&e.wallX<L.W&&e.wallY<L.H)assert(skin.has(e.wallX+','+e.wallY),'missing exposed face');
 for(const corner of b.corners)if(corner.type==='inner-corner'){
   const x=corner.x+(corner.before.nx+corner.after.nx<0?-1:0),y=corner.y+(corner.before.ny+corner.after.ny<0?-1:0);
   if(x>=0&&y>=0&&x<L.W&&y<L.H&&B.solid(b.L.cells[y][x]))assert(skin.has(x+','+y),'missing diagonal corner');
 }
 // Each shell boundary separates exactly one wall cell from empty space.
 for(const e of b.skinEdges){
   const x=(e.ax+e.bx)/2,y=(e.ay+e.by)/2;
   assert(skin.has(Math.floor(x-e.nx*.1)+','+Math.floor(y-e.ny*.1)));
   assert(!skin.has(Math.floor(x+e.nx*.1)+','+Math.floor(y+e.ny*.1)));
 }
 for(const T of [10,18,30]){
   const theme=Themes.forLevel(level);
   B.draw(context,b,T,theme,{});B.animate(context,b,T,theme,1.3);
 }
}
assert.equal(Object.keys(B.HAZARDS).length,10);
for(const material of Object.values(require('../materials').MATERIALS)){
 const theme=Themes.forLevel({theme:material.theme,material:material.id});
 assert(B.HAZARDS[theme.hazardStyle]);
 const b=B.build(E.parse({grid:fixtures[3].map((r,i)=>i===1?r.replace('.','S'):r)}));
 for(const time of [0,.3,1.6]){B.draw(context,b,18,theme,{});B.animate(context,b,18,theme,time);}
}
console.log(`${levels.length} levels + ${fixtures.length} corner/pillar/junction fixtures: ${cells} shell cells, no floor overlap, identical safe/hazard thickness.`);
console.log(`10 hazard styles, 3 scales, missing-texture fallback: ${draws} finite drawing operations.`);
