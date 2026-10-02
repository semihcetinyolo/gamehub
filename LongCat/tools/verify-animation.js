#!/usr/bin/env node
// Deterministic regression coverage of the actual home animation, with a virtual clock.
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const E = require('../engine.js');
let now = 0, sequence = 0, homeWidth = 360, latest;
const callbacks = new Map(), events = {}, nodes = new Map();
const context2d = new Proxy({}, {get: (_, name) => name === 'createLinearGradient' ? () => ({addColorStop(){}}) : () => {}});
function node(id = '') {
  const classes = new Set(id === 'map' ? ['on'] : []);
  return {id, hidden: true, style: {}, width: 0, height: 0, innerHTML: '', textContent: '',
    classList: {contains:c=>classes.has(c),add:c=>classes.add(c),remove:c=>classes.delete(c),toggle(c,on){on?classes.add(c):classes.delete(c)}},
    toDataURL:()=>'data:image/png;base64,',appendChild(){},setAttribute(){},addEventListener(){},getContext:()=>context2d,
    getBoundingClientRect:()=>({width:homeWidth,height:300})};
}
for (const id of ['map','game','levelSelect']) nodes.set(id,node(id));
const D = {newFace:()=>({}),stepFace(){},trigger(){},load:()=>Promise.resolve(),
  drawDog(g,pts,c,o){latest={pts:pts.map(p=>({...p})),c,state:o.state,squash:o.squash}}, drawBody(){},drawHead(){}};
const R = {PAL:{},wallTheme:()=>({top:'#8fa3ef'}),paw(){},arrow(){},load:()=>Promise.resolve(),bakeBoard:()=>({}),
  layout:(L,w,h)=>({cell:40*(w/360),ox:25,oy:30})};
const sandbox = {console,LongCatEngine:E,LongCatRender:R,LongDog:D,
  document:{getElementById(id){if(!nodes.has(id))nodes.set(id,node(id));return nodes.get(id)},querySelectorAll:()=>['map','game','levelSelect'].map(id=>nodes.get(id)),createElement:()=>node(),addEventListener(){},hidden:false},
  localStorage:{getItem:()=>null,setItem(){}},performance:{now:()=>now},
  location:{hash:'',pathname:'/',search:''},history:{replaceState(){}},navigator:{},devicePixelRatio:1,
  addEventListener:(name,fn)=>{events[name]=fn},setTimeout:()=>0,clearTimeout(){},
  requestAnimationFrame:fn=>{callbacks.set(++sequence,fn);return sequence},cancelAnimationFrame:id=>callbacks.delete(id),
};
sandbox.window=sandbox;vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(require.resolve('../levels.js'),'utf8'),sandbox);
vm.runInContext(fs.readFileSync(require.resolve('../game.js'),'utf8'),sandbox);
const tick=t=>{now=t;const work=[...callbacks.values()];callbacks.clear();work.forEach(f=>f(t));return latest};
const head=p=>p.pts.at(-1);
const normalize=p=>({x:(head(p).x-25)/p.c,y:(head(p).y-30)/p.c});
const initial=tick(0), start=head(initial);
const transition=tick(650);
assert.equal(transition.state,'slide');
assert.deepEqual(head(transition),start,'A new move must begin at its origin, not teleport to its target');
const next=tick(666);
assert(Math.hypot(head(next).x-start.x,head(next).y-start.y)>0,'The head must start moving');
assert(Math.hypot(head(next).x-start.x,head(next).y-start.y)<3,'The first frame must remain close to the origin');
tick(820);const before=normalize(latest);
homeWidth=540;events.resize();const after=normalize(tick(820));
assert(Math.abs(before.x-after.x)<1e-9&&Math.abs(before.y-after.y)<1e-9,'Resize must preserve position within the grid during movement');
let happy=false,rewound=false,previousLength=0;
for(let t=836;t<15000;t+=16){const p=tick(t);if(p.state==='happy')happy=true;const len=p.pts.reduce((n,b,i)=>i?n+Math.hypot(b.x-p.pts[i-1].x,b.y-p.pts[i-1].y):n,0);if(happy&&p.state==='idle'&&len>0&&len<previousLength)rewound=true;previousLength=len;}
assert(happy,'Home demo must complete the level');assert(rewound,'Completed demo must rewind smoothly');
nodes.get('bLevels').onclick();assert.equal(callbacks.size,0,'Leaving home must cancel its animation loop');
nodes.get('bLevelsBack').onclick();assert.equal(callbacks.size,1,'Returning home must start exactly one loop');
assert.equal(head(tick(now)).x,25+.5*latest.c,'Returning home starts a fresh demo');
console.log('PASS: no teleport, gradual movement, resize continuity, win, smooth rewind, stop/start lifecycle');
