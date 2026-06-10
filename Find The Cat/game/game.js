/* ================= Find The Cat ================= */

const START_HEARTS = 3;     // hearts per level
const ALPHA_HIT    = 28;    // alpha threshold for a "hit" on a cat silhouette
const HIT_GROW     = 0.10;  // enlarge each cat's clickable silhouette by 10%
const MIN_SCALE    = 1;     // zoomed-out (fits viewport height)
const MAX_SCALE    = 4;     // max zoom-in (cats are small, so allow a deep zoom)
const REVEAL_MS    = 2500;

/* Levels are read the same way the triple-match build reads its scene: a manifest
   produced from a layered .psb by tools/extract.py. Each level lives in its own
   assets/<slug>/ folder (bg.jpg + catN.png + manifest.json). Add more here. */
const LEVELS = [
  'assets/0002/manifest.json',
  'assets/0003/manifest.json',
];

/* ---------------- state ---------------- */
const State = {
  manifest:null,
  levelIdx:0,
  baseDir:'',      // asset folder of the current level (e.g. "assets/0002/")
  cats:[],         // [{x,y,w,h,z,el,img,found, hit:{...}}]
  total:0,
  found:0,
  hearts:START_HEARTS,
  busy:false,      // lock during win/lose
  side:0,          // square scene side in px (= viewport height)
  pan:{ tx:0, ty:0, s:null },
  overlayAction:null,
};

/* ---------------- dom refs ---------------- */
const $ = (s)=>document.querySelector(s);
const board    = $('#board');
const boardWrap= $('#boardWrap');
const fxLayer  = $('#fxLayer');
const cntNum   = $('#cntNum');
const cntDen   = $('#cntDen');
const counter  = $('#counter');
const heartsEl = $('#hearts');
const overlay  = $('#overlay');
const dragHint = $('#dragHint');
const adminBtn = $('#adminBtn');
const adminPanel = $('#adminPanel');

/* ================= init ================= */
init();

async function init(){
  bindEvents();
  addEventListener('resize', ()=> setupPan(false));
  await startLevel();
}

async function loadManifest(){
  const url = LEVELS[State.levelIdx];
  State.baseDir = url.replace(/[^/]+$/, '');   // strip "manifest.json" -> "assets/0002/"
  const res = await fetch(url);
  State.manifest = await res.json();
}

/* (re)start the current level */
async function startLevel(){
  if (!State.manifest) await loadManifest();
  State.found = 0;
  State.hearts = START_HEARTS;
  State.busy = false;
  State.total = State.manifest.cats.length;
  $('#bg').src = State.baseDir + 'bg.jpg';
  buildBoard();
  renderHearts();
  renderCounter();
  setupPan(true);
}

/* The scene is a square sized to the viewport height (so at scale 1 it overflows
   horizontally). It can be zoomed in (up to MAX_SCALE) and panned on both axes. */
function setupPan(recenter){
  const wv = boardWrap.clientWidth, hv = boardWrap.clientHeight;
  if (!hv) return;
  State.side = hv;
  board.style.width = hv + 'px';
  board.style.height = hv + 'px';
  if (recenter || State.pan.s == null){
    State.pan.s  = MIN_SCALE;
    State.pan.tx = (wv - hv * State.pan.s) / 2; // centre horizontally
    State.pan.ty = (hv - hv * State.pan.s) / 2; // 0 at scale 1
  }
  clampPan();
  applyPan();
}
function panBounds(){
  const wv = boardWrap.clientWidth, hv = boardWrap.clientHeight;
  const sz = State.side * State.pan.s;
  return { minX: Math.min(0, wv - sz), maxX: 0, minY: Math.min(0, hv - sz), maxY: 0 };
}
function clampPan(){
  const b = panBounds();
  State.pan.tx = clamp(State.pan.tx, b.minX, b.maxX);
  State.pan.ty = clamp(State.pan.ty, b.minY, b.maxY);
}
function applyPan(){
  const p = State.pan;
  board.style.transform = `translate(${p.tx}px, ${p.ty}px) scale(${p.s})`;
}
/* zoom so the wrap-relative point (px,py) stays put while scale -> newS */
function zoomAt(px, py, newS){
  const p = State.pan;
  newS = clamp(newS, MIN_SCALE, MAX_SCALE);
  const f = newS / p.s;
  p.tx = px - (px - p.tx) * f;
  p.ty = py - (py - p.ty) * f;
  p.s  = newS;
  clampPan();
  applyPan();
}
const clamp = (v,lo,hi)=> Math.max(lo, Math.min(hi, v));

function buildBoard(){
  board.querySelectorAll('.cat').forEach(n=>n.remove());
  State.cats = [];

  State.manifest.cats.forEach((cb, i)=>{
    const wrap = document.createElement('div');
    wrap.className = 'cat';
    wrap.dataset.i = i;
    wrap.style.left   = pct(cb.x);
    wrap.style.top    = pct(cb.y);
    wrap.style.width  = pct(cb.w);
    wrap.style.height = pct(cb.h);
    wrap.style.zIndex = cb.z;

    const img = imgEl(State.baseDir + cb.file, 'cat-img');
    wrap.append(img);
    board.appendChild(wrap);

    const rec = { x:cb.x, y:cb.y, w:cb.w, h:cb.h, z:cb.z,
                  el:wrap, img, found:false, hit:{ready:false} };
    State.cats.push(rec);
    buildAlpha(img, rec);   // hit-test against the cat silhouette
  });
}

function imgEl(src, cls){
  const im = document.createElement('img');
  im.className = cls; im.src = src; im.draggable = false; im.alt='';
  return im;
}
const pct = (v)=> (v*100)+'%';

/* build a small alpha canvas from the cat image for pixel-accurate hit testing */
function buildAlpha(im, rec){
  const finish = ()=>{
    const cw = im.naturalWidth, ch = im.naturalHeight;
    if (!cw || !ch) return;
    const c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const ctx = c.getContext('2d', { willReadFrequently:true });
    ctx.drawImage(im, 0, 0);
    rec.hit = { ready:true, ctx, cw, ch };
  };
  if (im.complete && im.naturalWidth) finish();
  else im.addEventListener('load', finish, { once:true });
}

/* ================= HUD ================= */
function renderCounter(){
  cntNum.textContent = State.found;
  cntDen.textContent = '/' + State.total;
}
function renderHearts(){
  const hs = heartsEl.children;
  for (let k = 0; k < hs.length; k++){
    hs[k].classList.toggle('lost', k >= State.hearts);
  }
}

/* ================= input ================= */
const DRAG_THRESHOLD = 7;          // px before a press becomes a pan (not a tap)
const WHEEL_ZOOM     = 0.0016;     // wheel sensitivity
const pointers = new Map();        // active pointerId -> {x,y}
let gesture = null;

function bindEvents(){
  boardWrap.addEventListener('pointerdown',   onPointerDown);
  boardWrap.addEventListener('pointermove',   onPointerMove);
  boardWrap.addEventListener('pointerup',     onPointerUp);
  boardWrap.addEventListener('pointercancel', onPointerUp);
  boardWrap.addEventListener('wheel',         onWheel, { passive:false });
  $('#hintBtn').addEventListener('click', onHint);
  $('#ovBtn').addEventListener('click', onOverlayBtn);

  // admin panel
  adminBtn.addEventListener('click', toggleAdmin);
  $('#restartBtn').addEventListener('click', ()=>{ closeAdmin(); hideOverlay(); startLevel(); });
  $('#revealBtn').addEventListener('click', ()=>{ closeAdmin(); revealAll(); });
  $('#nextBtn').addEventListener('click', ()=>{ closeAdmin(); nextLevel(); });
  document.addEventListener('click', (e)=>{
    if (adminPanel.classList.contains('show') &&
        !adminPanel.contains(e.target) && e.target !== adminBtn) closeAdmin();
  });
}

function toggleAdmin(e){
  e.stopPropagation();
  adminPanel.classList.toggle('show');
  adminBtn.classList.toggle('open', adminPanel.classList.contains('show'));
}
function closeAdmin(){ adminPanel.classList.remove('show'); adminBtn.classList.remove('open'); }

/* reveal: glow every remaining cat for a few seconds (admin aid) */
function revealAll(){
  if (State.busy) return;
  setupPan(true);
  dragHint.classList.add('hide');
  board.querySelectorAll('.cat:not(.found)').forEach(el=> el.classList.add('glow'));
  setTimeout(()=> board.querySelectorAll('.cat.glow').forEach(el=> el.classList.remove('glow')), REVEAL_MS);
}

async function nextLevel(){
  hideOverlay();
  State.levelIdx = (State.levelIdx + 1) % LEVELS.length;
  State.manifest = null;          // force reload of the new level's manifest
  await startLevel();
}

const wrapXY = (clientX, clientY)=>{ const r = boardWrap.getBoundingClientRect();
  return { x: clientX - r.left, y: clientY - r.top }; };

function onPointerDown(e){
  if (State.busy) return;
  if (e.isPrimary){ pointers.clear(); gesture = null; }
  try { boardWrap.setPointerCapture(e.pointerId); } catch(_){}
  pointers.set(e.pointerId, { x:e.clientX, y:e.clientY });
  boardWrap.classList.add('grabbing');
  if (pointers.size === 1){
    gesture = { mode:'press', id:e.pointerId, startX:e.clientX, startY:e.clientY,
                startTx:State.pan.tx, startTy:State.pan.ty, moved:false };
  } else if (pointers.size === 2){
    beginPinch();
  }
}

function beginPinch(){
  const [a, b] = [...pointers.values()];
  const r = boardWrap.getBoundingClientRect();
  gesture = { mode:'pinch',
    prevDist: Math.hypot(a.x - b.x, a.y - b.y),
    prevMid : { x:(a.x + b.x)/2 - r.left, y:(a.y + b.y)/2 - r.top } };
  dragHint.classList.add('hide');
}

function onPointerMove(e){
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x:e.clientX, y:e.clientY });
  if (!gesture) return;

  if (gesture.mode === 'pinch'){
    if (pointers.size < 2) return;
    const [a, b] = [...pointers.values()];
    const r = boardWrap.getBoundingClientRect();
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const mid  = { x:(a.x + b.x)/2 - r.left, y:(a.y + b.y)/2 - r.top };
    zoomAt(mid.x, mid.y, State.pan.s * (dist / gesture.prevDist));
    State.pan.tx += mid.x - gesture.prevMid.x;
    State.pan.ty += mid.y - gesture.prevMid.y;
    clampPan(); applyPan();
    gesture.prevDist = dist; gesture.prevMid = mid;
    return;
  }

  const dx = e.clientX - gesture.startX, dy = e.clientY - gesture.startY;
  if (!gesture.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD){
    gesture.moved = true; gesture.mode = 'pan'; dragHint.classList.add('hide');
  }
  if (gesture.moved){
    State.pan.tx = gesture.startTx + dx;
    State.pan.ty = gesture.startTy + dy;
    clampPan(); applyPan();
  }
}

function onPointerUp(e){
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (pointers.size === 0) boardWrap.classList.remove('grabbing');

  if (gesture && gesture.mode === 'pinch'){
    if (pointers.size === 1){
      const [id] = [...pointers.keys()];
      const pt = pointers.get(id);
      gesture = { mode:'pan', id, startX:pt.x, startY:pt.y,
                  startTx:State.pan.tx, startTy:State.pan.ty, moved:true };
    } else { gesture = null; }
    return;
  }

  const wasTap = gesture && gesture.mode === 'press' && !gesture.moved;
  gesture = null;
  if (wasTap && pointers.size === 0 && !State.busy) tapAt(e.clientX, e.clientY);
}

function onWheel(e){
  if (State.busy) return;
  e.preventDefault();
  const p = wrapXY(e.clientX, e.clientY);
  zoomAt(p.x, p.y, State.pan.s * Math.exp(-e.deltaY * WHEEL_ZOOM));
  dragHint.classList.add('hide');
}

/* a genuine tap: find the topmost cat under the point; else it's a miss (lose a heart) */
function tapAt(clientX, clientY){
  const rect = board.getBoundingClientRect();
  const bx = (clientX - rect.left) / rect.width;
  const by = (clientY - rect.top)  / rect.height;

  // topmost-first (higher z drawn on top)
  const order = State.cats
    .map((_,i)=>i)
    .filter(i=> !State.cats[i].found)
    .sort((a,b)=> State.cats[b].z - State.cats[a].z);

  for (const i of order){
    const it = State.cats[i];
    const ex = it.x - it.w*HIT_GROW/2, ey = it.y - it.h*HIT_GROW/2;
    const ew = it.w*(1+HIT_GROW),      eh = it.h*(1+HIT_GROW);
    if (bx < ex || by < ey || bx > ex+ew || by > ey+eh) continue;
    const nx = 0.5 + ((bx-it.x)/it.w - 0.5) / (1+HIT_GROW);
    const ny = 0.5 + ((by-it.y)/it.h - 0.5) / (1+HIT_GROW);
    if (isOpaque(it, nx, ny)){
      dragHint.classList.add('hide');
      foundCat(i, clientX, clientY);
      return;
    }
  }
  miss(clientX, clientY);
}

function isOpaque(it, nx, ny){
  const h = it.hit;
  if (!h.ready) return true; // fall back to bbox before alpha map is ready
  const px = Math.min(h.cw-1, Math.max(0, Math.floor(nx*h.cw)));
  const py = Math.min(h.ch-1, Math.max(0, Math.floor(ny*h.ch)));
  return h.ctx.getImageData(px, py, 1, 1).data[3] > ALPHA_HIT;
}

/* ================= find a cat ================= */
function foundCat(i, clientX, clientY){
  const it = State.cats[i];
  it.found = true;
  it.el.classList.remove('glow','hint');
  it.el.style.display = 'none';               // disappear instantly (no fade)

  burst(clientX, clientY);
  State.found++;
  renderCounter();
  counter.classList.remove('bump'); void counter.offsetWidth; counter.classList.add('bump');

  if (State.found >= State.total) win();
}

/* ================= miss (lose a heart) ================= */
function miss(clientX, clientY){
  ripple(clientX, clientY, true);
  State.hearts = Math.max(0, State.hearts - 1);
  renderHearts();
  // pop the heart we just lost
  const lostIdx = State.hearts; // index of the now-empty slot
  const hEl = heartsEl.children[lostIdx];
  if (hEl){ hEl.classList.remove('pop'); void hEl.offsetWidth; hEl.classList.add('pop'); }
  heartsEl.classList.remove('shake'); void heartsEl.offsetWidth; heartsEl.classList.add('shake');

  if (State.hearts <= 0) lose();
}

/* ================= hint ================= */
/* pan to and pulse a random remaining cat */
function onHint(){
  if (State.busy) return;
  const remaining = State.cats.map((_,i)=>i).filter(i=> !State.cats[i].found);
  if (!remaining.length) return;
  const pick = remaining[Math.floor(Math.random() * remaining.length)];
  panToCat(pick);
  const it = State.cats[pick];
  it.el.classList.remove('hint'); void it.el.offsetWidth;
  it.el.classList.add('hint');
  setTimeout(()=> it.el.classList.remove('hint'), 2100);
}

/* smoothly pan (and zoom in a bit) so cat i is centered */
function panToCat(i){
  const it = State.cats[i];
  const wv = boardWrap.clientWidth, hv = boardWrap.clientHeight;
  const s = Math.max(State.pan.s, 2.2);   // zoom in enough that a small cat is visible
  State.pan.s = clamp(s, MIN_SCALE, MAX_SCALE);
  State.pan.tx = wv/2 - (it.x + it.w/2) * State.side * State.pan.s;
  State.pan.ty = hv/2 - (it.y + it.h/2) * State.side * State.pan.s;
  clampPan();
  board.style.transition = 'transform .45s cubic-bezier(.4,.9,.3,1)';
  applyPan();
  setTimeout(()=> { board.style.transition = ''; }, 470);
  dragHint.classList.add('hide');
}

/* ================= fx ================= */
function ripple(clientX, clientY, isMiss){
  const fr = fxLayer.getBoundingClientRect();
  const r = document.createElement('div');
  r.className = 'ripple' + (isMiss ? ' miss' : '');
  r.style.left = (clientX - fr.left)+'px';
  r.style.top  = (clientY - fr.top)+'px';
  fxLayer.appendChild(r);
  setTimeout(()=> r.remove(), 520);
}
function burst(clientX, clientY){
  const fr = fxLayer.getBoundingClientRect();
  const b = document.createElement('div');
  b.className = 'burst';
  b.style.left = (clientX - fr.left)+'px';
  b.style.top  = (clientY - fr.top)+'px';
  fxLayer.appendChild(b);
  setTimeout(()=> b.remove(), 520);
}

/* ================= win / lose ================= */
function win(){
  showOverlay('🏆', 'You Found Them All!', `All ${State.total} cats found!`,
              'Next Level', ()=> nextLevel());
}
function lose(){
  showOverlay('😿', 'Out of Hearts!', `You found ${State.found} of ${State.total} cats.`,
              'Try Again', ()=> startLevel());
}
function showOverlay(emoji, title, sub, btnText, action){
  State.busy = true;
  $('#ovEmoji').textContent = emoji;
  $('#ovTitle').textContent = title;
  $('#ovSub').textContent   = sub;
  $('#ovBtn').textContent   = btnText || 'Play Again';
  State.overlayAction = action || (()=> startLevel());
  overlay.classList.add('show');
}
function hideOverlay(){ overlay.classList.remove('show'); }
function onOverlayBtn(){
  hideOverlay();
  const a = State.overlayAction; State.overlayAction = null;
  if (a) a();
}
