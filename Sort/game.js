(() => {
'use strict';

/* ============================================================
   SORTSCAPES — pick & place
   The level image is sliced into an N×N grid (N² pieces). You TAP a
   piece to pick it up (its whole merged block lifts into the tray/hand),
   then TAP a destination cell to drop it there — the block and whatever
   was at the destination SWAP places (same shape). Rebuild the picture.
   Adjacent correct image-neighbours merge into a seamless block.
   ============================================================ */

const LEVELS = [
  { name:'Level 1', img:'levels/107805.webp', size:2 },
  { name:'Level 2', img:'levels/115709.webp', size:3 },
  { name:'Level 3', img:'levels/128109.webp', size:3 },
  { name:'Level 4', img:'levels/130001.webp', size:3 },
];

let N = 3, NUM = 9;         // grid is N×N, NUM = N² image pieces (set per level)
const GAP = 5;
const RADIUS = 12;
const HAND_GAP = 30;        // gap between grid bottom and the hand area
const HAND_FACTOR = 1.6;    // hand box size relative to a cell
const ANIM = 300;

// ---- DOM ----
const boardWrap  = document.getElementById('boardWrap');
const playfield  = document.getElementById('playfield');
const levelPill  = document.getElementById('levelPill');
const correctNum = document.getElementById('correctNum');
const correctDen = document.getElementById('correctDen');
const correctStat= document.getElementById('correctStat');
const movesNum   = document.getElementById('movesNum');
const statusHint = document.getElementById('statusHint');
const overlay    = document.getElementById('overlay');
const ovTitle    = document.getElementById('ovTitle');
const ovSub      = document.getElementById('ovSub');
const ovBtn      = document.getElementById('ovBtn');
const peek       = document.getElementById('peek');
const peekImg    = document.getElementById('peekImg');
const peekBtn    = document.getElementById('peekBtn');
const undoBtn    = document.getElementById('undoBtn');
const restartBtn = document.getElementById('restartBtn');
const nextBtn    = document.getElementById('nextBtn');

// ---- state ----
let levelIndex = 0;
let grid = [];              // grid[c][r] = tile | null
let held = null;            // { tiles:[{tile,dc,dr}], src:[{c,r}], w, h } while picked up
let joker = null;           // mascot tile shown in the hand when empty
let byId = {};
let cell = 90, gridW = 279, gridH = 279, handBox = 130, handX = 0, handY = 0;
let moves = 0, solved = false, prevCorrect = 0;
let history = [], pendingSnapshot = null;
let wasMerged = new Set(), allowFlash = false;
let settleTimer = null, warnTimer = null, peekTimer = null;

/* ---------- build tiles / frames ---------- */
function buildTiles(){
  playfield.innerHTML = '';
  byId = {};
  const level = LEVELS[levelIndex];

  for(let s=0; s<NUM; s++){
    const f = document.createElement('div');
    f.className = 'slot-frame';
    f.dataset.slot = String(s);
    playfield.appendChild(f);
  }
  const hf = document.createElement('div');
  hf.className = 'slot-frame buffer-frame';
  hf.dataset.slot = 'H';
  playfield.appendChild(hf);

  for(let i=0; i<NUM; i++){
    const el = document.createElement('div');
    el.className = 'tile tile-img';
    el.style.backgroundImage = `url("${level.img}")`;
    el.dataset.id = 't' + i;
    byId['t'+i] = { id:'t'+i, type:'img', row:Math.floor(i/N), col:i%N, el };
    playfield.appendChild(el);
  }

  const jk = document.createElement('div');
  jk.className = 'tile tile-joker';
  jk.dataset.id = 'joker';
  jk.innerHTML = '<div class="joker-inner"><span class="joker-face">🃏</span><span class="joker-word">JOKER</span></div>';
  joker = { id:'joker', type:'joker', el:jk };
  byId.joker = joker;
  playfield.appendChild(jk);

  peekImg.src = level.img;
}

/* ---------- board state ---------- */
function setSolved(){
  grid = [];
  for(let c=0; c<N; c++){ grid[c] = []; for(let r=0; r<N; r++) grid[c][r] = byId['t'+(r*N+c)]; }
  held = null;
}

function isSolved(){
  if(held) return false;
  for(let c=0; c<N; c++)
    for(let r=0; r<N; r++){
      const t = grid[c][r];
      if(!t || t.type !== 'img' || t.col !== c || t.row !== r) return false;
    }
  return true;
}

function countCorrect(){
  let n = 0;
  for(let c=0; c<N; c++)
    for(let r=0; r<N; r++){
      const t = grid[c][r];
      if(t && t.type === 'img' && t.col === c && t.row === r) n++;
    }
  return n;
}

function scramble(){
  const pieces = [];
  for(let i=0; i<NUM; i++) pieces.push(byId['t'+i]);
  do {
    for(let i=pieces.length-1; i>0; i--){ const j = Math.floor(Math.random()*(i+1)); [pieces[i],pieces[j]] = [pieces[j],pieces[i]]; }
    for(let idx=0; idx<NUM; idx++){ grid[idx % N][Math.floor(idx / N)] = pieces[idx]; }
  } while(isSolved());
  held = null;
}

/* ---------- merges (relative image-neighbours) ---------- */
function gp(c, r){ return (c>=0 && c<N && r>=0 && r<N) ? grid[c][r] : null; }
function mergeR(c, r){ const a=gp(c,r), b=gp(c+1,r); return !!(a&&b&&a.type==='img'&&b.type==='img'&&a.row===b.row&&a.col+1===b.col); }
function mergeD(c, r){ const a=gp(c,r), b=gp(c,r+1); return !!(a&&b&&a.type==='img'&&b.type==='img'&&a.col===b.col&&a.row+1===b.row); }

function blockCellsAt(sc, sr){
  const seen = new Set(), stack = [[sc, sr]], out = [];
  while(stack.length){
    const [c, r] = stack.pop(), k = c + ',' + r;
    if(seen.has(k)) continue;
    seen.add(k); out.push([c, r]);
    if(mergeR(c, r))        stack.push([c+1, r]);
    if(mergeR(c-1, r))      stack.push([c-1, r]);
    if(mergeD(c, r))        stack.push([c, r+1]);
    if(mergeD(c, r-1))      stack.push([c, r-1]);
  }
  return out;
}

/* ---------- geometry / layout ---------- */
function cellXY(c, r){ return { x: c*(cell+GAP), y: r*(cell+GAP) }; }

function layout(){
  const availW = boardWrap.clientWidth  - 24;
  const availH = boardWrap.clientHeight - 24;
  const cw = (availW - (N-1)*GAP) / N;
  const ch = (availH - (N-1)*GAP - HAND_GAP) / (N + HAND_FACTOR);
  cell = Math.max(40, Math.floor(Math.min(cw, ch)));
  handBox = Math.round(cell * HAND_FACTOR);
  gridW = gridH = N*cell + (N-1)*GAP;
  handX = (gridW - handBox) / 2;
  handY = gridH + HAND_GAP;
  playfield.style.width  = gridW + 'px';
  playfield.style.height = (handY + handBox) + 'px';

  playfield.querySelectorAll('.slot-frame').forEach(f => {
    if(f.dataset.slot === 'H'){
      f.style.width = handBox + 'px'; f.style.height = handBox + 'px';
      f.style.transform = `translate(${handX}px, ${handY}px)`;
    } else {
      const s = parseInt(f.dataset.slot, 10);
      const p = cellXY(s % N, Math.floor(s / N));
      f.style.width = cell + 'px'; f.style.height = cell + 'px';
      f.style.transform = `translate(${p.x}px, ${p.y}px)`;
    }
  });

  playfield.querySelectorAll('.tile-img').forEach(el => {
    const t = byId[el.dataset.id];
    el.style.backgroundSize = (cell*N) + 'px ' + (cell*N) + 'px';
    el.style.backgroundPosition = `-${t.col*cell}px -${t.row*cell}px`;
  });

  render(true);
}

/* ---------- render ---------- */
function setTransform(t, transform, instant){
  if(instant){ t.el.style.transition = 'none'; t.el.style.transform = transform; void t.el.offsetWidth; t.el.style.transition = ''; }
  else { t.el.style.transform = transform; }
}

function applyMerge(el, edges){
  const merged = edges.up || edges.down || edges.left || edges.right;
  el.classList.toggle('correct', merged);
  if(merged){
    el.style.width  = (cell + (edges.right ? GAP : 0)) + 'px';
    el.style.height = (cell + (edges.down  ? GAP : 0)) + 'px';
    el.style.borderTopLeftRadius     = (edges.up   || edges.left ) ? '0px' : RADIUS + 'px';
    el.style.borderTopRightRadius    = (edges.up   || edges.right) ? '0px' : RADIUS + 'px';
    el.style.borderBottomRightRadius = (edges.down || edges.right) ? '0px' : RADIUS + 'px';
    el.style.borderBottomLeftRadius  = (edges.down || edges.left ) ? '0px' : RADIUS + 'px';
  } else {
    el.style.width = cell + 'px'; el.style.height = cell + 'px'; el.style.borderRadius = RADIUS + 'px';
  }
  return merged;
}

function render(instant){
  const nowMerged = new Set();

  // grid tiles
  for(let c=0; c<N; c++)
    for(let r=0; r<N; r++){
      const t = grid[c][r];
      if(!t) continue;
      const p = cellXY(c, r);
      setTransform(t, `translate(${p.x}px, ${p.y}px)`, instant);
      t.el.classList.remove('held');
      const merged = applyMerge(t.el, { right:mergeR(c,r), down:mergeD(c,r), left:mergeR(c-1,r), up:mergeD(c,r-1) });
      if(merged) nowMerged.add(t.id);
    }

  // hand: the held group, or the joker mascot
  if(held){
    joker.el.style.opacity = '0';
    const naturalW = held.w*cell + (held.w-1)*GAP;
    const naturalH = held.h*cell + (held.h-1)*GAP;
    const scale = Math.min(handBox/naturalW, handBox/naturalH, 1.4);
    const ox = handX + (handBox - naturalW*scale)/2;
    const oy = handY + (handBox - naturalH*scale)/2;
    held.tiles.forEach(o => {
      const x = ox + o.dc*(cell+GAP)*scale;
      const y = oy + o.dr*(cell+GAP)*scale;
      setTransform(o.tile, `translate(${x}px, ${y}px) scale(${scale})`, instant);
      o.tile.el.classList.add('held');
      const has = (dc,dr) => held.tiles.some(q => q.dc===dc && q.dr===dr);
      applyMerge(o.tile.el, { right:has(o.dc+1,o.dr), down:has(o.dc,o.dr+1), left:has(o.dc-1,o.dr), up:has(o.dc,o.dr-1) });
    });
  } else {
    joker.el.style.opacity = '';
    joker.el.classList.remove('held');
    joker.el.classList.remove('correct');
    const scale = handBox / cell * 0.92;
    const x = handX + (handBox - cell*scale)/2;
    const y = handY + (handBox - cell*scale)/2;
    setTransform(joker, `translate(${x}px, ${y}px) scale(${scale})`, instant);
  }

  if(!instant && allowFlash){ for(const id of nowMerged) if(!wasMerged.has(id)) flashCorrect(byId[id].el); }
  wasMerged = nowMerged;

  updateStatus();
  updateHint();
}

function flashCorrect(el){ el.classList.remove('just-correct'); void el.offsetWidth; el.classList.add('just-correct'); setTimeout(() => el.classList.remove('just-correct'), 600); }

function updateHint(){
  if(solved){ statusHint.textContent = 'Solved! 🎉'; statusHint.classList.remove('warn'); return; }
  statusHint.textContent = held ? 'Tap a cell to drop the block there' : 'Tap a piece to pick it up';
}

function updateStatus(){
  const n = countCorrect();
  correctNum.textContent = String(n);
  movesNum.textContent = String(moves);
  undoBtn.classList.toggle('disabled', history.length === 0 || solved);
  if(n > prevCorrect){ correctStat.classList.remove('bump'); void correctStat.offsetWidth; correctStat.classList.add('bump'); }
  prevCorrect = n;
}

/* ---------- interaction ---------- */
function snapshot(){ return { grid: grid.map(col => col.slice()), moves }; }

function cellFromPoint(clientX, clientY){
  const rect = playfield.getBoundingClientRect();
  const x = clientX - rect.left, y = clientY - rect.top;
  if(x < 0 || x > gridW || y < 0 || y > gridH) return null;   // only the grid area picks/places
  const c = Math.floor(x / (cell+GAP)), r = Math.floor(y / (cell+GAP));
  if(c < 0 || c >= N || r < 0 || r >= N) return null;
  return { c, r };
}

function onCell(c, r){
  if(solved) return;
  if(!held) pickBlock(c, r);
  else      placeHeld(c, r);
}

function pickBlock(c, r){
  if(!grid[c][r]) return;
  const cells = blockCellsAt(c, r);
  const minC = Math.min(...cells.map(p => p[0])), minR = Math.min(...cells.map(p => p[1]));
  const tiles = cells.map(([cc, rr]) => ({ tile:grid[cc][rr], dc:cc-minC, dr:rr-minR }));
  pendingSnapshot = snapshot();
  cells.forEach(([cc, rr]) => grid[cc][rr] = null);
  held = {
    tiles,
    src: cells.map(([cc, rr]) => ({ c:cc, r:rr })),
    w: Math.max(...tiles.map(t => t.dc)) + 1,
    h: Math.max(...tiles.map(t => t.dr)) + 1
  };
  render(false);
}

function placeHeld(c, r){
  const target = held.tiles.map(o => ({ tile:o.tile, c:c+o.dc, r:r+o.dr }));
  if(target.some(t => t.c < 0 || t.c >= N || t.r < 0 || t.r >= N)){ warn('Does not fit there'); return; }

  const srcKeys = new Set(held.src.map(p => p.c + ',' + p.r));
  const hitsSrc = target.some(t => srcKeys.has(t.c + ',' + t.r));
  if(hitsSrc){
    const sameRegion = target.length === held.src.length && target.every(t => srcKeys.has(t.c + ',' + t.r));
    if(sameRegion) cancelHeld();            // dropped back where it came from
    else warn('Overlaps its own spot');
    return;
  }

  // pieces currently at the target region (they will move into the vacated source region)
  const displaced = target
    .map(t => ({ tile:grid[t.c][t.r], r:t.r, c:t.c }))
    .filter(o => o.tile)
    .sort((a, b) => a.r - b.r || a.c - b.c)
    .map(o => o.tile);
  const srcSorted = held.src.slice().sort((a, b) => a.r - b.r || a.c - b.c);

  history.push(pendingSnapshot); pendingSnapshot = null;
  if(history.length > 300) history.shift();
  moves++;

  target.forEach(t => { grid[t.c][t.r] = t.tile; });           // drop the held block
  srcSorted.forEach((s, i) => { grid[s.c][s.r] = displaced[i] || null; }); // bumped pieces fill the old spot

  held = null;
  render(false);
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => { if(isSolved()) win(); }, ANIM);
}

function cancelHeld(){
  if(!held) return;
  held.tiles.forEach((o, i) => { const s = held.src[i]; grid[s.c][s.r] = o.tile; });
  held = null; pendingSnapshot = null;
  render(false);
}

function warn(msg){
  statusHint.textContent = '❌ ' + msg;
  statusHint.classList.add('warn');
  clearTimeout(warnTimer);
  warnTimer = setTimeout(() => { statusHint.classList.remove('warn'); updateHint(); }, 1000);
}

function undo(){
  if(solved || !history.length) return;
  cancelHeld();
  const s = history.pop();
  grid = s.grid.map(col => col.slice());
  moves = s.moves; held = null;
  clearTimeout(settleTimer);
  render(false);
}

function win(){
  solved = true;
  updateHint(); updateStatus();
  setTimeout(() => {
    ovTitle.textContent = 'Solved!';
    ovSub.textContent = `${LEVELS[levelIndex].name} · ${moves} moves`;
    overlay.classList.add('show');
  }, 550);
}

/* ---------- peek ---------- */
function showPeek(){ peek.classList.add('show'); clearTimeout(peekTimer); peekTimer = setTimeout(() => peek.classList.remove('show'), 3000); }
function hidePeek(){ clearTimeout(peekTimer); peek.classList.remove('show'); }

/* ---------- lifecycle ---------- */
function startLevel(idx){
  levelIndex = ((idx % LEVELS.length) + LEVELS.length) % LEVELS.length;
  N = LEVELS[levelIndex].size || 4;
  NUM = N * N;
  correctDen.textContent = '/' + NUM;
  levelPill.textContent = LEVELS[levelIndex].name;
  moves = 0; prevCorrect = 0; solved = false; history = []; held = null; pendingSnapshot = null;
  wasMerged = new Set(); allowFlash = false;
  clearTimeout(settleTimer); hidePeek();
  overlay.classList.remove('show');

  buildTiles();
  setSolved();
  requestAnimationFrame(() => {
    layout();
    setTimeout(() => { scramble(); render(false); allowFlash = true; }, 260);
  });
}

/* ---------- events ---------- */
playfield.addEventListener('click', e => {
  const cellPos = cellFromPoint(e.clientX, e.clientY);
  if(cellPos) onCell(cellPos.c, cellPos.r);
  else if(held) cancelHeld();               // tap outside the grid to put the block back
});

undoBtn.addEventListener('click',    undo);
restartBtn.addEventListener('click', () => startLevel(levelIndex));
nextBtn.addEventListener('click',    () => startLevel(levelIndex + 1));
ovBtn.addEventListener('click',      () => startLevel(levelIndex + 1));
peekBtn.addEventListener('click',    showPeek);
peek.addEventListener('click',       hidePeek);

let resizeTimer = null;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(layout, 120); });

startLevel(0);

})();
