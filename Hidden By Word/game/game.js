/* ================= Hidden By Word — Terrace =================
   Find items by NAME. The bottom bar holds 3 named targets; only those 3
   items are clickable. A correct tap fades the item out of the scene and the
   freed holder is refilled with the next unfound item. Wrong taps (empty
   space or a non-target item) drop a blue miss-pointer. No lives — finish the
   level to advance. The same PSB feeds 3 levels via different item bands. */

const HOLDERS   = 3;     // named targets shown at once
const ALPHA_HIT = 28;    // alpha threshold for a "hit"
const HIT_GROW  = 0.07;  // enlarge each item's clickable silhouette by 7%
const MIN_SCALE = 1;     // zoomed-out (fits viewport height)
const MAX_SCALE = 3;     // max zoom-in

/* Each level pairs the shared h1-h20 band with one rotating band. The player
   must finish a level (find all 30) before the next one unlocks. */
const LEVELS = [
  { fixed:'h1-h20', extra:'h21-h30' },
  { fixed:'h1-h20', extra:'h31-h40' },
  { fixed:'h1-h20', extra:'h41-h50' },
];

/* ---------------- state ---------------- */
const V3_TARGETS = 15;   // V3: random targets per play
const V3_STEP    = 15;   // V3: items opened per play (15, 30, 45)

const State = {
  manifest:null,
  mode:1,          // 1=V1 (band only), 2=V2 (all 50), 3=V3 (growing pool, random 15)
  level:0,         // index into LEVELS
  ids:[],          // all item numbers in this level
  items:{},        // i -> {x,y,w,h,z,name,el,ob,collected,hit:{...}}
  queue:[],        // shuffled unfound items not yet placed in a holder
  holders:[],      // length HOLDERS, each an item number or null
  found:0,
  total:0,
  busy:false,
  side:0,
  pan:{ tx:0, ty:0, s:null },
  overlayAction:null,
};

/* ---------------- dom refs ---------------- */
const $ = (s)=>document.querySelector(s);
const board    = $('#board');
const boardWrap= $('#boardWrap');
const trayEl   = $('#tray');
const fxLayer  = $('#fxLayer');
const progNum  = $('#progNum');
const progDen  = $('#progDen');
const progress = $('#progress');
const overlay  = $('#overlay');
const dragHint = $('#dragHint');
const levelPill= $('#levelPill');

/* ================= init ================= */
init();

async function init(){
  const res = await fetch('assets/manifest.json');
  State.manifest = await res.json();
  buildHolders();
  bindEvents();
  addEventListener('resize', ()=> setupPan(false));
  startLevel();
}

/* item numbers in a level band (V1/V2): shared h1-h20 + the rotating band */
function levelIds(){
  const g = State.manifest.groups;
  const cfg = LEVELS[State.level];
  return [...(g[cfg.fixed]||[]), ...(g[cfg.extra]||[])];
}

/* every item number that exists in the scene, ascending */
function allIds(){
  return Object.keys(State.manifest.items).map(n => +n.slice(1)).sort((a,b)=> a-b);
}

/* ---- overlap-free selection (the "dice" rule) ----
   Two items conflict when their silhouettes meaningfully overlap, so they can
   never be on the board together. */
const OVERLAP_FRAC = 0.12;   // intersection vs smaller bbox to count as overlapping
function itemRect(i){
  const r = State.manifest.items['h'+i];
  return r ? { x1:r.x, y1:r.y, x2:r.x+r.w, y2:r.y+r.h, area:r.w*r.h } : null;
}
function overlaps(i, j){
  const a = itemRect(i), b = itemRect(j);
  if (!a || !b) return false;
  const ix = Math.max(0, Math.min(a.x2,b.x2) - Math.max(a.x1,b.x1));
  const iy = Math.max(0, Math.min(a.y2,b.y2) - Math.max(a.y1,b.y1));
  const inter = ix * iy;
  if (inter <= 0) return false;
  return inter / Math.min(a.area, b.area) > OVERLAP_FRAC;
}
/* Build a set of `size` mutually non-overlapping items: take `preferred` in
   order, drop any that would overlap one already chosen, then backfill from the
   rest of `universe` (shuffled) with the same no-overlap guarantee. */
function pickNonOverlapping(preferred, size, universe){
  const chosen = [];
  const tryAdd = (i)=>{
    if (chosen.length >= size) return;
    if (chosen.some(j => overlaps(i, j))) return;  // would collide with an item already in the level
    chosen.push(i);
  };
  for (const i of preferred) tryAdd(i);
  if (chosen.length < size){
    for (const i of shuffle(universe.slice())){
      if (chosen.includes(i)) continue;
      tryAdd(i);
      if (chosen.length >= size) break;
    }
  }
  return chosen;
}

/* decide which items are on the board (render) and which must be found (targets) */
function levelPlan(){
  if (State.mode === 2){                 // V2: all 50 on board, band of 30 are targets
    return { render: allIds(), targets: levelIds() };
  }
  if (State.mode === 3){                 // V3: open 15 more each play; random 15 targets
    const open = (State.level + 1) * V3_STEP;       // 15, 30, 45
    // dice rule: no two items on the board may overlap; backfill replacements
    const render = pickNonOverlapping(allIds().slice(0, open), open, allIds());
    const targets = shuffle(render.slice()).slice(0, Math.min(V3_TARGETS, render.length));
    return { render, targets };
  }
  const band = levelIds();               // V1: band of 30 is both rendered and targeted
  return { render: band, targets: band };
}

function startLevel(){
  const plan = levelPlan();
  State.renderIds = plan.render;
  State.targetIds = plan.targets;
  State.total = State.targetIds.length;
  State.found = 0;
  State.busy = false;
  State.queue = shuffle(State.targetIds.slice());
  State.holders = new Array(HOLDERS).fill(null);

  levelPill.textContent = 'Level ' + (State.level + 1);
  progNum.textContent = '0';
  progDen.textContent = '/' + State.total;

  buildBoard();
  // seat the first targets
  for (let k = 0; k < HOLDERS; k++) State.holders[k] = State.queue.shift() ?? null;
  renderHolders();
  setupPan(true);
}

function shuffle(a){
  for (let i = a.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ================= board ================= */
function buildBoard(){
  board.querySelectorAll('.item').forEach(n=>n.remove());
  State.items = {};

  for (const i of State.renderIds){
    const hb = State.manifest.items['h'+i];
    if (!hb) continue;

    const wrap = document.createElement('div');
    wrap.className = 'item';
    wrap.dataset.i = i;
    wrap.style.left   = pct(hb.x);
    wrap.style.top    = pct(hb.y);
    wrap.style.width  = pct(hb.w);
    wrap.style.height = pct(hb.h);
    wrap.style.zIndex = hb.z;

    const ob = imgEl('assets/h'+i+'.png', 'ob');
    wrap.append(ob);
    board.appendChild(wrap);

    const rec = { x:hb.x, y:hb.y, w:hb.w, h:hb.h, z:hb.z, name:hb.name,
                  el:wrap, ob, collected:false, hit:{ready:false} };
    State.items[i] = rec;
    buildAlpha(ob, rec);
  }
}

function imgEl(src, cls){
  const im = document.createElement('img');
  im.className = cls; im.src = src; im.draggable = false; im.alt='';
  return im;
}
const pct = (v)=> (v*100)+'%';

/* small alpha canvas from the clean object image for silhouette hit testing */
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

/* ================= holders ================= */
function buildHolders(){
  trayEl.innerHTML = '';
  for (let k = 0; k < HOLDERS; k++){
    const h = document.createElement('div');
    h.className = 'holder empty'; h.dataset.k = k;
    trayEl.appendChild(h);
  }
}

function renderHolders(){
  for (let k = 0; k < HOLDERS; k++) renderHolder(k);
}

/* (re)draw a single holder cell — used so a refill only animates that one slot */
function renderHolder(k){
  const cell = trayEl.children[k];
  const i = State.holders[k];
  cell.classList.remove('found');
  if (i != null && State.items[i]){
    cell.classList.remove('empty');
    cell.innerHTML = '<span class="name">' + escapeHtml(State.items[i].name) + '</span>';
  } else {
    cell.classList.add('empty');
    cell.innerHTML = '';
  }
  updateHolderVisibility();
}
function escapeHtml(s){ return String(s).replace(/[&<>"]/g, c=>(
  {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

/* the item numbers currently targetable (named in a holder, still on board) */
function activeTargets(){
  return State.holders.filter(i => i != null && State.items[i] && !State.items[i].collected);
}

/* ================= pan / zoom (square scene, drag to explore) ================= */
function setupPan(recenter){
  const wv = boardWrap.clientWidth, hv = boardWrap.clientHeight;
  if (!hv) return;
  State.side = hv;
  board.style.width = hv + 'px';
  board.style.height = hv + 'px';
  if (recenter || State.pan.s == null){
    State.pan.s  = MIN_SCALE;
    State.pan.tx = (wv - hv * State.pan.s) / 2;
    State.pan.ty = (hv - hv * State.pan.s) / 2;
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
  updateHolderVisibility();
}

/* is item i's silhouette currently inside the visible board viewport? */
function itemVisible(i){
  const it = State.items[i];
  if (!it) return false;
  const wv = boardWrap.clientWidth, hv = boardWrap.clientHeight;
  const s = State.pan.s, side = State.side;
  const left   = State.pan.tx + it.x * side * s;
  const top    = State.pan.ty + it.y * side * s;
  const right  = left + it.w * side * s;
  const bottom = top  + it.h * side * s;
  return right > 0 && left < wv && bottom > 0 && top < hv;
}

/* dim a holder when its target has been panned/zoomed off-screen */
function updateHolderVisibility(){
  const cells = trayEl.children;
  for (let k = 0; k < HOLDERS; k++){
    const i = State.holders[k];
    const has = i != null && State.items[i] && !State.items[i].collected;
    cells[k].classList.toggle('passive', has && !itemVisible(i));
  }
}
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

/* ================= input ================= */
const DRAG_THRESHOLD = 7;
const WHEEL_ZOOM     = 0.0016;
const pointers = new Map();
let gesture = null;

function bindEvents(){
  boardWrap.addEventListener('pointerdown',   onPointerDown);
  boardWrap.addEventListener('pointermove',   onPointerMove);
  boardWrap.addEventListener('pointerup',     onPointerUp);
  boardWrap.addEventListener('pointercancel', onPointerUp);
  boardWrap.addEventListener('wheel',         onWheel, { passive:false });
  $('#refreshBtn').addEventListener('click', ()=> startLevel());
  $('#modeBtn').addEventListener('click', cycleMode);
  $('#hintBtn').addEventListener('click', onHint);
  $('#revealBtn').addEventListener('click', revealAll);
  $('#ovBtn').addEventListener('click', onOverlayBtn);
  // admin panel
  $('#adminBtn').addEventListener('click', toggleAdmin);
  $('#admClose').addEventListener('click', ()=> setAdmin(false));
  $('#admNext').addEventListener('click', ()=> adminJump(+1));
  $('#admPrev').addEventListener('click', ()=> adminJump(-1));
  $('#admRestart').addEventListener('click', ()=>{ hideOverlay(); startLevel(); refreshAdminInfo(); });
  $('#admPanel').addEventListener('click', (e)=>{ if (e.target.id === 'admPanel') setAdmin(false); });
}

/* ================= admin panel ================= */
function toggleAdmin(){ setAdmin(!$('#admPanel').classList.contains('show')); }
function setAdmin(on){
  $('#admPanel').classList.toggle('show', on);
  if (on) refreshAdminInfo();
}
function refreshAdminInfo(){
  $('#admInfo').textContent = `Mode V${State.mode}  ·  Level ${State.level+1}/${LEVELS.length}  ·  ${State.found}/${State.total} found`;
}
/* jump levels (wraps), regardless of completion */
function adminJump(dir){
  State.level = (State.level + dir + LEVELS.length) % LEVELS.length;
  hideOverlay();
  startLevel();
  refreshAdminInfo();
}

/* cycle V1 -> V2 -> V3 -> V1, restart from the first play of that mode */
function cycleMode(){
  State.mode = State.mode % 3 + 1;
  State.level = 0;
  const btn = $('#modeBtn');
  btn.textContent = 'V' + State.mode;
  btn.classList.toggle('on', State.mode !== 1);
  hideOverlay();
  startLevel();
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

/* a genuine tap: only a *named* target counts; anything else is a miss */
function tapAt(clientX, clientY){
  const rect = board.getBoundingClientRect();
  const bx = (clientX - rect.left) / rect.width;
  const by = (clientY - rect.top)  / rect.height;

  // only the active targets are clickable; test topmost-first among them
  const targets = activeTargets().sort((a,b)=> State.items[b].z - State.items[a].z);

  for (const i of targets){
    const it = State.items[i];
    const ex = it.x - it.w*HIT_GROW/2, ey = it.y - it.h*HIT_GROW/2;
    const ew = it.w*(1+HIT_GROW),      eh = it.h*(1+HIT_GROW);
    if (bx < ex || by < ey || bx > ex+ew || by > ey+eh) continue;
    const nx = 0.5 + ((bx-it.x)/it.w - 0.5) / (1+HIT_GROW);
    const ny = 0.5 + ((by-it.y)/it.h - 0.5) / (1+HIT_GROW);
    if (isOpaque(it, nx, ny)){
      dragHint.classList.add('hide');
      collect(i);
      return;
    }
  }
  miss(clientX, clientY); // wrong spot (or a non-target item) -> blue pointer
}

function isOpaque(it, nx, ny){
  const h = it.hit;
  if (!h.ready) return true;
  const px = Math.min(h.cw-1, Math.max(0, Math.floor(nx*h.cw)));
  const py = Math.min(h.ch-1, Math.max(0, Math.floor(ny*h.ch)));
  return h.ctx.getImageData(px, py, 1, 1).data[3] > ALPHA_HIT;
}

/* ================= collect (found target) ================= */
function collect(i){
  const it = State.items[i];
  if (it.collected) return;
  it.collected = true;
  it.el.classList.add('collected'); // CSS fades the object straight out

  // mark its holder found, then refill from the queue
  const k = State.holders.indexOf(i);
  if (k !== -1) trayEl.children[k]?.classList.add('found');

  State.found++;
  progNum.textContent = State.found;
  progress.classList.remove('bump'); void progress.offsetWidth;
  progress.classList.add('bump');

  setTimeout(()=>{
    if (k !== -1){ State.holders[k] = State.queue.shift() ?? null; renderHolder(k); }
    if (State.found >= State.total) win();
  }, 280);
}

/* ================= miss (blue pointer) ================= */
function miss(clientX, clientY){
  const fr = fxLayer.getBoundingClientRect();
  const m = document.createElement('div');
  m.className = 'miss';
  m.style.left = (clientX - fr.left)+'px';
  m.style.top  = (clientY - fr.top)+'px';
  fxLayer.appendChild(m);
  setTimeout(()=> m.remove(), 560);
}

/* ================= hint / reveal ================= */
function onHint(){
  if (State.busy) return;
  const targets = activeTargets();
  if (!targets.length) return;
  const pick = targets[Math.floor(Math.random() * targets.length)];
  panToItem(pick);
  const it = State.items[pick];
  it.el.classList.remove('hint'); void it.el.offsetWidth;
  it.el.classList.add('hint');
  setTimeout(()=> it.el.classList.remove('hint'), 2100);
}

const REVEAL_MS = 3000;
function revealAll(){
  if (State.busy) return;
  setupPan(true);
  dragHint.classList.add('hide');
  activeTargets().forEach(i => State.items[i].el.classList.add('glow'));
  setTimeout(()=> board.querySelectorAll('.item.glow').forEach(el=> el.classList.remove('glow')), REVEAL_MS);
}

function panToItem(i){
  const it = State.items[i];
  const wv = boardWrap.clientWidth, hv = boardWrap.clientHeight, s = State.pan.s;
  State.pan.tx = wv/2 - (it.x + it.w/2) * State.side * s;
  State.pan.ty = hv/2 - (it.y + it.h/2) * State.side * s;
  clampPan();
  board.style.transition = 'transform .45s cubic-bezier(.4,.9,.3,1)';
  applyPan();
  setTimeout(()=> { board.style.transition = ''; }, 470);
  dragHint.classList.add('hide');
}

/* ================= win / overlay ================= */
function win(){
  const last = State.level >= LEVELS.length - 1;
  if (last){
    showOverlay('🏆', 'All Levels Cleared!', 'You found every hidden item.',
                'Play Again', ()=>{ State.level = 0; startLevel(); });
  } else {
    showOverlay('🎉', 'Level Complete!', `Level ${State.level+1} done — on to the next.`,
                'Next Level', ()=>{ State.level++; startLevel(); });
  }
}
function showOverlay(emoji, title, sub, btnText, action){
  State.busy = true;
  $('#ovEmoji').textContent = emoji;
  $('#ovTitle').textContent = title;
  $('#ovSub').textContent   = sub;
  $('#ovBtn').textContent   = btnText || 'Continue';
  State.overlayAction = action;
  overlay.classList.add('show');
}
function hideOverlay(){ overlay.classList.remove('show'); }
function onOverlayBtn(){
  hideOverlay();
  const a = State.overlayAction; State.overlayAction = null;
  State.busy = false;
  if (a) a();
}
