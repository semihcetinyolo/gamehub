/* ================= Waldo ================= */

const START_HEARTS = 3;     // hearts per level (shared by all its stages)
let INF_HEALTH = load('waldo_infhealth') === '1';   // infinite-health cheat (Admin)
const ALPHA_HIT    = 128;   // alpha threshold on a target's H layer (it already has a soft margin)
const MIN_SCALE    = 1;     // zoomed-out (fits viewport height)
const MAX_SCALE    = 5;     // characters are small, so allow a deep zoom
const REVEAL_MS    = 2500;
const STAGE_GAP_MS = 750;   // pause after the last find of a stage before the next banner

/* Levels come from a layered .psb via tools/extract.py: BG + one group of "H" layers
   per stage (GreenMayo, SwimmingArmband, ...) + a decoy group "D". Each level lives
   in assets/<slug>/ (bg.jpg = clean BG + decoys, one PNG per target, manifest.json).
   A found target's PNG is removed, revealing the clean background. Add more here. */
const ASSET_V = 8;          // bump when assets are re-extracted (phones cache them hard)
const LEVELS = [
  'assets/beach/manifest.json',
  'assets/park/manifest.json',
  'assets/livingroom/manifest.json',
];

/* ---------------- state ---------------- */
const State = {
  manifest:null,
  levelIdx:0,
  baseDir:'',      // asset folder of the current level (e.g. "assets/beach/")
  stages:[],       // [{label, icon, targets:[{x,y,w,h,cx,cy,cw,ch,z, el, found, hit}]}]
  stageIdx:0,
  found:0,         // found in the current stage
  hearts:START_HEARTS,
  busy:false,      // lock during cards / win / lose
  side:0,          // square scene side in px (= viewport height)
  pan:{ tx:0, ty:0, s:null },
  overlayAction:null,
};
const stage = ()=> State.stages[State.stageIdx];

/* ---------------- dom refs ---------------- */
const $ = (s)=>document.querySelector(s);
const board    = $('#board');
const boardWrap= $('#boardWrap');
const fxLayer  = $('#fxLayer');
const cntNum   = $('#cntNum');
const cntDen   = $('#cntDen');
const cntIco   = $('#cntIco');
const counter  = $('#counter');
const heartsEl = $('#hearts');
const taskEl   = $('#task');
const overlay  = $('#overlay');
const dragHint = $('#dragHint');
const adminBtn = $('#adminBtn');
const adminPanel = $('#adminPanel');

function load(k){ try { return localStorage.getItem(k); } catch(_){ return null; } }
function save(k, v){ try { localStorage.setItem(k, v); } catch(_){} }

/* ================= init ================= */
init();

async function init(){
  bindEvents();
  addEventListener('resize', ()=> setupPan(false));
  await startLevel();
}

async function loadManifest(){
  const url = LEVELS[State.levelIdx];
  State.baseDir = url.replace(/[^/]+$/, '');   // strip "manifest.json" -> "assets/beach/"
  const res = await fetch(url + '?v=' + ASSET_V);
  State.manifest = await res.json();
  $('#bg').src = asset('bg.jpg');
}

/* (re)start the current level from its first stage */
async function startLevel(){
  if (!State.manifest) await loadManifest();
  State.hearts = START_HEARTS;
  State.busy = false;
  buildBoard();
  renderHearts();
  setupPan(true);
  beginStage(0);
}

/* play stage k: a "Find The X's  0/10" banner pops in over the board and fades away
   by itself (it doesn't block play) */
function beginStage(k){
  State.stageIdx = k;
  State.found = 0;
  const st = stage();
  cntIco.src = asset(st.icon);
  renderCounter();
  renderTask();
  State.busy = false;
  const n = State.stages.length;
  $('#bnStep').textContent  = n > 1 ? `Stage ${k+1} of ${n}` : '';
  $('#bnIcon').src          = asset(st.icon);
  $('#bnTitle').innerHTML   = `Find The <b>${st.label}</b>`;
  $('#bnCount').textContent = `0/${st.targets.length}`;
  const bn = $('#banner');
  bn.classList.remove('show'); void bn.offsetWidth; bn.classList.add('show');
  bn.onanimationend = (e)=>{ if (e.target === bn){
    bn.classList.remove('show');
    taskEl.classList.remove('pop'); void taskEl.offsetWidth; taskEl.classList.add('pop');
  } };
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
let settleTimer = 0;
function applyPan(settleMs = 220){
  const p = State.pan;
  board.classList.add('moving');
  board.style.transform = `translate(${p.tx}px, ${p.ty}px) scale(${p.s})`;
  board.style.setProperty('--s', p.s);
  clearTimeout(settleTimer);
  settleTimer = setTimeout(()=> board.classList.remove('moving'), settleMs);
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

/* every stage's targets are on the board from the start (the next stage's
   characters act as decoys until their turn); a found one is removed */
function buildBoard(){
  board.querySelectorAll('.target, .ring').forEach(n=>n.remove());
  State.stages = State.manifest.stages.map(st => ({
    label: st.label, icon: st.icon,
    targets: st.targets.map(t => {
      const el = document.createElement('div');
      el.className = 'target';
      el.style.left   = pct(t.x);
      el.style.top    = pct(t.y);
      el.style.width  = pct(t.w);
      el.style.height = pct(t.h);
      el.style.zIndex = t.z;
      const img = new Image();
      img.draggable = false; img.alt = '';
      el.append(img);
      board.appendChild(el);
      const rec = { ...t, el, found:false, hit:{ready:false} };
      buildAlpha(img, rec);
      img.src = asset(t.file);
      return rec;
    }),
  }));
}

const pct = (v)=> (v*100)+'%';
const asset = (f)=> State.baseDir + f + '?v=' + ASSET_V;

/* the target PNG's alpha is its hit mask */
function buildAlpha(im, rec){
  im.addEventListener('load', ()=>{
    const cw = im.naturalWidth, ch = im.naturalHeight;
    const c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const ctx = c.getContext('2d', { willReadFrequently:true });
    ctx.drawImage(im, 0, 0);
    rec.hit = { ready:true, data:ctx.getImageData(0, 0, cw, ch).data, cw, ch };
  }, { once:true });
}

/* an ellipse around the character's own bbox (not the soft-margin H bbox) */
function ringEl(t, cls){
  const r = document.createElement('div');
  r.className = 'ring ' + cls;
  const pad = 0.18;
  const w = t.cw * (1 + pad), h = t.ch * (1 + pad*0.6);
  r.style.left   = pct(t.cx + t.cw/2 - w/2);
  r.style.top    = pct(t.cy + t.ch/2 - h/2);
  r.style.width  = pct(w);
  r.style.height = pct(h);
  board.appendChild(r);
  return r;
}

/* ================= HUD ================= */
function renderCounter(){
  cntNum.textContent = State.found;
  cntDen.textContent = '/' + stage().targets.length;
}
function renderTask(){
  $('#taskText').innerHTML = `Find The <b>${stage().label}</b>`;
  const pips = $('#pips');
  pips.innerHTML = '';
  if (State.stages.length < 2) return;
  State.stages.forEach((_, k)=>{
    const p = document.createElement('span');
    p.className = 'pip' + (k < State.stageIdx ? ' done' : k === State.stageIdx ? ' on' : '');
    pips.appendChild(p);
  });
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
  $('#infHealthBtn').addEventListener('click', toggleInfHealth);
  $('#restartBtn').addEventListener('click', ()=>{ closeAdmin(); hideOverlay(); startLevel(); });
  $('#revealBtn').addEventListener('click', ()=>{ closeAdmin(); revealAll(); });
  $('#skipBtn').addEventListener('click', ()=>{ closeAdmin(); skipStage(); });
  $('#nextBtn').addEventListener('click', ()=>{ closeAdmin(); nextLevel(); });
  document.addEventListener('click', (e)=>{
    if (adminPanel.classList.contains('show') &&
        !adminPanel.contains(e.target) && e.target !== adminBtn) closeAdmin();
  });
  syncInfHealth();   // apply persisted infinite-health on load
}

function toggleAdmin(e){
  e.stopPropagation();
  adminPanel.classList.toggle('show');
  adminBtn.classList.toggle('open', adminPanel.classList.contains('show'));
}
function closeAdmin(){ adminPanel.classList.remove('show'); adminBtn.classList.remove('open'); }

/* infinite-health cheat */
function syncInfHealth(){
  const b = $('#infHealthBtn');
  if (b) b.textContent = '♾️ Sonsuz Can: ' + (INF_HEALTH ? 'Açık' : 'Kapalı');
  if (INF_HEALTH){ State.hearts = START_HEARTS; renderHearts(); }  // refill on enable
}
function toggleInfHealth(){
  INF_HEALTH = !INF_HEALTH;
  save('waldo_infhealth', INF_HEALTH ? '1' : '0');
  syncInfHealth();
}

/* reveal: ring every remaining target of this stage for a few seconds (admin aid) */
function revealAll(){
  if (State.busy) return;
  setupPan(true);
  dragHint.classList.add('hide');
  const rings = stage().targets.filter(t=> !t.found).map(t=> ringEl(t, 'glow'));
  setTimeout(()=> rings.forEach(r=> r.remove()), REVEAL_MS);
}

/* admin: mark the rest of this stage found */
function skipStage(){
  if (State.busy) return;
  stage().targets.forEach(t=>{ if (!t.found){ t.found = true; t.el.style.display = 'none'; } });
  State.found = stage().targets.length;
  renderCounter();
  stageDone();
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

/* a genuine tap: a target of this stage -> found; the spot of an already-found
   character -> nothing (forgives a double tap); anything else (scenery, decoys, other stages' characters) -> lose a heart */
function tapAt(clientX, clientY){
  const rect = board.getBoundingClientRect();
  const bx = (clientX - rect.left) / rect.width;
  const by = (clientY - rect.top)  / rect.height;
  dragHint.classList.add('hide');

  const hitT = (t)=> bx >= t.x && by >= t.y && bx <= t.x + t.w && by <= t.y + t.h &&
                     isOpaque(t, (bx - t.x) / t.w, (by - t.y) / t.h);

  const st = stage();
  const i = st.targets.findIndex(t=> !t.found && hitT(t));
  if (i >= 0){ foundTarget(i, clientX, clientY); return; }
  if (State.stages.some(s=> s.targets.some(t=> t.found && hitT(t)))){ ripple(clientX, clientY, false); return; }
  miss(clientX, clientY);
}

function isOpaque(t, nx, ny){
  const h = t.hit;
  if (!h.ready) return true; // fall back to bbox before the mask is ready
  const px = Math.min(h.cw-1, Math.max(0, Math.floor(nx*h.cw)));
  const py = Math.min(h.ch-1, Math.max(0, Math.floor(ny*h.ch)));
  return h.data[(py*h.cw + px)*4 + 3] > ALPHA_HIT;
}

/* ================= find a target ================= */
function foundTarget(i, clientX, clientY){
  const t = stage().targets[i];
  t.found = true;
  t.el.style.display = 'none';               // disappear instantly; the clean BG is underneath

  burst(clientX, clientY);
  State.found++;
  renderCounter();
  counter.classList.remove('bump'); void counter.offsetWidth; counter.classList.add('bump');

  if (State.found >= stage().targets.length) stageDone();
}

function stageDone(){
  State.busy = true;
  setTimeout(()=>{
    if (State.stageIdx + 1 < State.stages.length) beginStage(State.stageIdx + 1);
    else win();
  }, STAGE_GAP_MS);
}

/* ================= miss (lose a heart) ================= */
function miss(clientX, clientY){
  ripple(clientX, clientY, true);
  if (INF_HEALTH) return;          // infinite-health cheat (Admin)
  State.hearts = Math.max(0, State.hearts - 1);
  renderHearts();
  // pop the heart we just lost
  const hEl = heartsEl.children[State.hearts];
  if (hEl){ hEl.classList.remove('pop'); void hEl.offsetWidth; hEl.classList.add('pop'); }
  heartsEl.classList.remove('shake'); void heartsEl.offsetWidth; heartsEl.classList.add('shake');

  if (State.hearts <= 0) lose();
}

/* ================= hint ================= */
/* pan to and ring a random remaining target of this stage */
function onHint(){
  if (State.busy) return;
  const remaining = stage().targets.filter(t=> !t.found);
  if (!remaining.length) return;
  const t = remaining[Math.floor(Math.random() * remaining.length)];
  panToTarget(t);
  const r = ringEl(t, 'hint');
  setTimeout(()=> r.remove(), 2100);
}

/* smoothly pan (and zoom in a bit) so target t is centered */
function panToTarget(t){
  const wv = boardWrap.clientWidth, hv = boardWrap.clientHeight;
  State.pan.s = clamp(Math.max(State.pan.s, 2.4), MIN_SCALE, MAX_SCALE);
  State.pan.tx = wv/2 - (t.cx + t.cw/2) * State.side * State.pan.s;
  State.pan.ty = hv/2 - (t.cy + t.ch/2) * State.side * State.pan.s;
  clampPan();
  board.style.transition = 'transform .45s cubic-bezier(.4,.9,.3,1)';
  applyPan(520);
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
  const total = State.stages.reduce((n, s)=> n + s.targets.length, 0);
  showOverlay({ emoji:'🏆', title:'Level Complete!', sub:`You found all ${total}!`,
                btn:'Next Level', action:()=> nextLevel() });
}
function lose(){
  showOverlay({ emoji:'😵', title:'Out of Hearts!',
                sub:`You found ${State.found} of ${stage().targets.length} ${stage().label}.`,
                btn:'Try Again', action:()=> startLevel() });
}
function showOverlay({ emoji, title, sub, btn, action }){
  State.busy = true;
  $('#banner').classList.remove('show');
  $('#ovEmoji').textContent = emoji;
  $('#ovTitle').textContent = title;
  $('#ovSub').innerHTML     = sub;
  $('#ovBtn').textContent   = btn || 'Play Again';
  State.overlayAction = action || (()=> startLevel());
  overlay.classList.add('show');
}
function hideOverlay(){ overlay.classList.remove('show'); }
function onOverlayBtn(){
  hideOverlay();
  const a = State.overlayAction; State.overlayAction = null;
  if (a) a();
}
