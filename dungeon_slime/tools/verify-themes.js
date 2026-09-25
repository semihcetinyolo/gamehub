#!/usr/bin/env node
// Headless application lifecycle checks; no browser, network or save-data changes.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const listeners = {}, elements = new Map(), timers = new Map();
let frame, timerId = 0, draws = 0, now = 0;
const failAssets = process.argv.includes('--missing-assets');
const canvas = new Proxy({}, { get: (_, key) => {
  if (key === 'createLinearGradient') return () => ({ addColorStop() {} });
  return (...args) => {
    if (key === 'drawImage') draws++;
    for (const arg of args) if (typeof arg === 'number') assert(Number.isFinite(arg), `${key}: non-finite canvas coordinate`);
  };
}, set: () => true });
function element(id = '') {
  const classes = new Set(id === 'map' ? ['on'] : []), children = {};
  return { id, style: { setProperty() {} }, dataset: {}, firstChild: {}, innerHTML: '', textContent: '',
    classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c), toggle(c, on) { if (on) classes.add(c); else classes.delete(c); } },
    setAttribute() {}, appendChild() {}, addEventListener() {},
    querySelector: s => children[s] || (children[s] = element()),
    getBoundingClientRect: () => ({ width: 390, height: 560 }), getContext: () => canvas,
  };
}
for (const [, id] of html.matchAll(/id="([^"]+)"/g)) elements.set(id, element(id));
const sandbox = {
  console, Math, Date, Promise, Map, Set, URLSearchParams, location: { search: '', hash: '' },
  performance: { now: () => now }, navigator: {}, devicePixelRatio: 2,
  localStorage: { getItem: () => null, setItem() {} },
  document: { getElementById: id => elements.get(id), createElement: () => element(), querySelectorAll: () => [elements.get('map'), elements.get('game')] },
  addEventListener: (name, fn) => { listeners[name] = fn; },
  requestAnimationFrame: fn => { frame = fn; },
  setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id),
  Image: class { set src(src) { this.naturalWidth = 1536; this.naturalHeight = 1024; Promise.resolve().then(() => {
    if (!failAssets && fs.existsSync(path.join(root, src))) this.onload(); else this.onerror();
  }); } },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const name of ['engine.js', 'levels.js', 'bg_palettes.js', 'themes.js', 'motion.js', 'board.js', 'features.js']) vm.runInContext(fs.readFileSync(path.join(root,name),'utf8'),sandbox,{filename:name});
vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],sandbox,{filename:'index.html'});
const key = direction => listeners.keydown({ key: direction, preventDefault() {} });
const flush = () => { sandbox.JellyDebug.tick(4); now += 4000; frame(now); };
(async () => {
  const E = sandbox.JellyEngine, debug = sandbox.JellyDebug;
  const expected = JSON.parse(JSON.stringify(sandbox.LEVELS.map(lv => lv.theme)));
  const skins = JSON.parse(JSON.stringify(sandbox.LEVELS.map(lv => lv.jelly)));
  assert.equal(new Set(expected).size,4);
  let moves = 0;
  for (let i = 0; i < sandbox.LEVELS.length; i++) {
    await debug.start(i);
    assert.equal(debug.theme(), expected[i]); assert.equal(debug.assets(),!failAssets);
    const L = E.parse(sandbox.LEVELS[i]), solution = E.solve(L,E.initialState(L));
    for (const dir of solution.path) {
      key('Arrow' + dir[0].toUpperCase() + dir.slice(1)); flush(); moves++;
      assert.equal(debug.theme(),expected[i],`level ${i+1} changed theme while moving`);
      assert.equal(debug.skin(),skins[i],`level ${i+1} changed jelly while moving`);
    }
    assert.equal(debug.moves(), solution.path.length);
    elements.get('bRestart').onclick();
    assert.equal(debug.moves(),0); assert.equal(debug.theme(),expected[i]); assert.equal(debug.skin(),skins[i]);
    elements.get('bMap').onclick();
    assert(!elements.get('game').classList.contains('on'));
  }
  // Starting a different level invalidates an older pending asset load/start.
  await Promise.all([debug.start(0),debug.start(2)]);
  assert.equal(debug.level(),2); assert.equal(debug.theme(),'ember');
  // A pending death restart must not reset the next level.
  await debug.start(4);
  const hazardLevel = E.parse(sandbox.LEVELS[4]);
  const lethal = Object.keys(E.DIRS).find(dir => E.move(hazardLevel,E.initialState(hazardLevel),dir).result === 'dead');
  assert(lethal);
  key('Arrow' + lethal[0].toUpperCase() + lethal.slice(1)); flush();
  assert.equal(debug.theme(),'moon');
  await debug.start(5);
  assert.equal(debug.theme(),'ember'); assert.equal(debug.moves(),0);
  // Render every stage of every material/hazard combination, including automatic retry.
  const original = sandbox.LEVELS[0], fixture = sandbox.LEVELS[4];
  let clips = 0;
  for (const jelly of Object.keys(sandbox.JellyMotion.SKINS)) for (const theme of Object.keys(sandbox.JellyThemes.THEMES)) {
    sandbox.LEVELS[0] = {...fixture, jelly, theme};
    await debug.start(0);
    key('Arrow' + lethal[0].toUpperCase() + lethal.slice(1));
    for (let f=0; f<60 && !debug.failure(); f++) { now+=50; frame(now); }
    assert(debug.failure(),`${jelly}/${theme}: missing failure clip`);
    assert.equal(debug.failure().kind,sandbox.JellyThemes.THEMES[theme].hazardType);
    assert.equal(debug.failure().skin,jelly);
    for (let f=0; f<180 && debug.failure(); f++) { now+=50; frame(now); }
    assert.equal(debug.failure(),null,`${jelly}/${theme}: retry did not finish`);
    assert.equal(debug.moves(),0); assert.equal(debug.skin(),jelly); assert.equal(debug.theme(),theme);
    clips++;
  }
  sandbox.LEVELS[0]=original;
  // Wall marks survive death and either automatic or player-triggered respawn.
  for(const manual of [false,true]){
    await debug.start(4);key('ArrowUp');flush();
    const marks=debug.wallMarks();assert(marks.length>0,'safe impact left no wall mark');
    key('ArrowDown');
    for(let f=0;f<120&&!debug.failure();f++){now+=16;frame(now);}
    assert(debug.failure());
    if(manual)elements.get('bRestart').onclick();else flush();
    assert.equal(debug.failure(),null);assert.equal(debug.moves(),0);
    assert.deepEqual(debug.wallMarks(),marks,'death erased or moved existing wall marks');
    await debug.start(5);assert.equal(debug.wallMarks().length,0,'marks leaked into another level');
  }
  // An input during a shape change starts immediately without a visual jump.
  await debug.start(3);
  const queueLevel=E.parse(sandbox.LEVELS[3]), queuePath=E.solve(queueLevel,E.initialState(queueLevel)).path;
  key('Arrow'+queuePath[0][0].toUpperCase()+queuePath[0].slice(1));
  for(let f=0;f<120&&!debug.morph();f++){now+=16;frame(now);}
  assert(debug.morph());
  assert.equal(debug.busy(),false,'visual morph must not lock controls');
  const beforeInput=debug.render();
  key('Arrow'+queuePath[1][0].toUpperCase()+queuePath[1].slice(1));
  assert.equal(debug.moves(),2,'input waited for a visual animation');
  for(const k of ['x','y','w','h'])assert(Math.abs(debug.render()[k]-beforeInput[k])<1e-8,`input jumped ${k}`);
  for(let f=0;f<180&&(debug.busy()||debug.morph());f++){now+=16;frame(now);}
  assert.equal(debug.moves(),2); assert.equal(debug.busy(),false);
  const expectedQueued=E.move(queueLevel,E.move(queueLevel,E.initialState(queueLevel),queuePath[0]).state,queuePath[1]).state;
  for(const k of ['x','y','w','h']) assert.equal(debug.jelly()[k],expectedQueued[k]);
  await debug.start(3);
  const firstMove=E.move(queueLevel,E.initialState(queueLevel),queuePath[0]);
  let previous=E.initialState(queueLevel),distance=0;
  for(const point of firstMove.path){distance+=Math.abs(point.x-previous.x)+Math.abs(point.y-previous.y);previous=point;}
  for(const dir of queuePath.slice(0,2))key('Arrow'+dir[0].toUpperCase()+dir.slice(1));
  debug.tick(distance/30+.04);
  assert.equal(debug.moves(),2,'queued swipe waited after wall contact');
  // A star plate activates at visual arrival, never at the solver's earlier logical result.
  const stoneIndex=sandbox.LEVELS.findIndex(lv=>lv.feature==='switch');
  const stoneLevel=E.parse(sandbox.LEVELS[stoneIndex]),stoneStart=E.initialState(stoneLevel);
  const stonePath=E.solve(stoneLevel,stoneStart).path;
  const stoneKey=d=>'Arrow'+d[0].toUpperCase()+d.slice(1);
  const axis=['up','down'].includes(stonePath[0])?'y':'x', sign=['up','left'].includes(stonePath[0])?-1:1;
  for(const fps of [30,60,120]){
    await debug.start(stoneIndex);key(stoneKey(stonePath[0]));
    assert.equal(debug.view().switches[0],false);
    for(let f=0;f<fps*2&&!debug.flights();f++){now+=1000/fps;frame(now);}
    assert(debug.flights(),'missing stone slide');
    assert.equal(debug.view().switches[0],false,'plate lit before the stone landed');
    assert.equal(debug.state().switches[0],true,'logical switch result missing');
    key(stoneKey(stonePath[1]));assert.equal(debug.moves(),1,'queued move crossed a stone still in flight');
    let prev=debug.view().rocks[0][axis];
    for(let f=0;f<fps&&debug.moves()===1;f++){
      now+=1000/fps;frame(now);
      const drawn=debug.view();assert((drawn.rocks[0][axis]-prev)*sign>=0,'stone reversed during its slide');prev=drawn.rocks[0][axis];
      if(debug.moves()===1)assert.equal(drawn.switches[0],false,'switch anticipated stone arrival');
    }
    assert.equal(debug.moves(),2,'queued move waited after stone arrival');
    assert.equal(debug.view().switches[0],true);
    assert.equal(elements.get('featureStatus').textContent,'★ Geçit açık');
    flush();elements.get('bRestart').onclick();
    assert.equal(debug.flights(),0);assert.equal(debug.view().switches[0],false);
    assert.equal(E.keyOf(debug.state()),E.keyOf(stoneStart));
    assert.equal(elements.get('tip').textContent,sandbox.LEVELS[stoneIndex].tip,'retry kept the gate-open message');
  }
  // Retry and map navigation cancel a sliding stone before it can press an old plate.
  for(const action of ['bRestart','bMap']){
    await debug.start(stoneIndex);key(stoneKey(stonePath[0]));
    for(let f=0;f<120&&!debug.flights();f++){now+=8;frame(now);}
    assert(debug.flights());elements.get(action).onclick();
    assert.equal(debug.flights(),0);
    if(action==='bMap')await debug.start(stoneIndex);
    flush();assert.equal(debug.view().switches[0],false);assert.equal(debug.moves(),0);
    assert.equal(E.keyOf(debug.state()),E.keyOf(stoneStart));
  }
  // The hazard returns at departure, not when the stone finishes its next flight.
  await debug.start(22);key('ArrowRight');flush();
  assert.equal(debug.view().switches[0],true);
  key('ArrowRight');
  assert.equal(debug.view().switches[0],true,'plate released before the jelly touched its stone');
  for(let f=0;f<120&&!debug.flights();f++){now+=8;frame(now);}
  assert(debug.flights());assert.equal(debug.view().switches[0],false,'plate stayed pressed during departure');
  assert.equal(elements.get('featureStatus').textContent,'★ Geçit kapalı');
  flush();assert.equal(debug.state().switches[0],false);assert.equal(debug.view().switches[0],false);
  // The reported wide-body exit contact must not show the success overlay.
  await debug.start(21);
  for(const dir of ['ArrowUp','ArrowDown','ArrowRight','ArrowUp']){key(dir);flush();}
  assert.equal(debug.state().w,6);
  for(const callback of [...timers.values()])callback();
  assert(!elements.get('result').classList.contains('on'),'oversized body showed success');
  await debug.start(0);
  assert(draws > moves);
  assert.equal(timers.size,0,'obsolete result/death timers survived level changes');
  console.log(`${sandbox.LEVELS.length} levels / ${moves} solution moves: theme stable, ${failAssets ? 'missing-art fallback' : 'art loading'}, restart/map/racing starts OK.`);
  console.log(`Canvas paths checked (${draws} image draws); all five jelly shapes exercised by level solutions.`);
  console.log(`${clips} material/hazard clips rendered through retry; immediate input preserves visual continuity.`);
  console.log('Stone arrival, plate feedback and queued swipes stay synchronized at 30/60/120 fps; retry/map cancel pending launches.');
})().catch(error => { console.error(error); process.exitCode=1; });
