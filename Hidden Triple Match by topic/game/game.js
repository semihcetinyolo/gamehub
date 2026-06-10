/* ================= Hidden Triple Match — Garden ================= */

const TRIPLET_SIZE  = 3;
const REAL_ITEMS    = 30;   // h1..h30 form 10 matchable triplets
const GOAL_MATCHES  = REAL_ITEMS / TRIPLET_SIZE; // 10
const TOTAL_SLOTS   = 6;    // tray cells shown
const BASE_SLOTS    = 5;    // usable cells before the rewarded slot is unlocked
const BONUS_SLOT    = BASE_SLOTS; // rightmost cell — unlocked by watching a rewarded ad
const ALPHA_HIT     = 28;   // alpha threshold for a "hit"
const HIT_GROW      = 0.07; // enlarge each item's clickable silhouette by 7%
const MIN_SCALE     = 1;    // zoomed-out (fits viewport height)
const MAX_SCALE     = 3;    // max zoom-in

// each level uses the first 30 items (10 matchable triplets).
const LEVEL_ITEMS   = 30;

// playable levels, in rotation order. id = the assets/<id>/ subfolder the
// extractor wrote (PSB stem, lowercased). ⏭ / "Next Level" cycle through them.
const LEVELS = [
  { id:'garden', name:'Garden' },
  { id:'elvan',  name:'Elvan'  },
  { id:'emir',   name:'Emir'   },
];

// type of item i (1-based). Real triplets share a type.
function typeOf(i){
  return 'g' + Math.ceil(i / TRIPLET_SIZE); // g1..g10
}

/* ---------------- state ---------------- */
const State = {
  manifest:null,
  levelIndex:0,            // index into LEVELS
  assetBase:'assets/',     // current level's asset folder (assets/<id>/)
  items:{},        // i -> {x,y,w,h, barRot, z, el, sh, ob, collected, hit:{...}}
  tray:[],         // [{i,type}]
  matches:0,
  itemCount:LEVEL_ITEMS,
  slots:BASE_SLOTS,        // currently usable cells (5, or 6 after rewarded unlock)
  bonusUnlocked:false,     // rewarded 6th cell unlocked?
  busy:false,      // lock during fail-resolve / win
  aspect:1,        // bg aspect (w/h); the board is sized to match it
  sideX:0, sideY:0,// scene size in px (sideY = viewport height, sideX = sideY*aspect)
  pan:{ tx:0, ty:0, s:null },    // pan/zoom transform of the oversized scene
  overlayAction:null,            // what the overlay button does
};

/* ---------------- dom refs ---------------- */
const $ = (s)=>document.querySelector(s);
const board    = $('#board');
const boardWrap= $('#boardWrap');
const trayEl   = $('#tray');
const fxLayer  = $('#fxLayer');
const progNum  = $('#progNum');
const progDen   = $('#progDen');
const progress = $('#progress');
const overlay  = $('#overlay');
const dragHint = $('#dragHint');
const adOverlay= $('#adOverlay');
const adTimer  = $('#adTimer');
const bgImg    = $('#bg');

/* asset url within the current level's folder */
const asset = (name)=> State.assetBase + name;

/* ================= init ================= */
init();

async function init(){
  buildTray();
  bindEvents();
  addEventListener('resize', ()=> setupPan(false));
  await loadLevel(0);
}

/* load a level: point at its asset folder, fetch its manifest, then start it.
   one-time setup (tray, events) is done in init(); this can run on every switch. */
async function loadLevel(index){
  State.levelIndex = ((index % LEVELS.length) + LEVELS.length) % LEVELS.length;
  State.assetBase  = 'assets/' + LEVELS[State.levelIndex].id + '/';
  bgImg.src = asset('bg.jpg');
  const res = await fetch(asset('manifest.json'));
  State.manifest = await res.json();

  // the board IS the canvas frame; its height fills the viewport, width follows
  // the frame aspect. The bg image is placed at its true offset within the frame
  // (it may bleed past the edges) and the board clips everything to the frame.
  State.aspect = State.manifest.frameAspect || 1;
  const bgb = State.manifest.bg || { x:0, y:0, w:1, h:1 };
  bgImg.style.left   = pct(bgb.x);
  bgImg.style.top    = pct(bgb.y);
  bgImg.style.width  = pct(bgb.w);
  bgImg.style.height = pct(bgb.h);

  buildForeground();   // static 'm' occluder layers (never change)
  startLevel();
}

/* static foreground scenery from the PSB 'm' layers — rendered at their true
   stack z so hidden items tucked behind garden objects are partly occluded. */
function buildForeground(){
  board.querySelectorAll('.fg').forEach(n=>n.remove());
  for (const fg of (State.manifest.foreground || [])){
    const im = imgEl(asset(fg.file), 'fg');
    im.style.left   = pct(fg.x);
    im.style.top    = pct(fg.y);
    im.style.width  = pct(fg.w);
    im.style.height = pct(fg.h);
    im.style.zIndex = fg.z;
    board.appendChild(im);
  }
}

/* (re)start the level — first 30 items, 10 triplets */
function startLevel(){
  State.itemCount = LEVEL_ITEMS;
  State.tray = [];
  State.matches = 0;
  State.busy = false;
  State.bonusUnlocked = false;   // rewarded slot starts locked each level
  State.slots = BASE_SLOTS;
  progNum.textContent = '0';
  if (progDen) progDen.textContent = '/' + GOAL_MATCHES;
  buildBoard();
  renderTray();
  setupPan(true);
}

/* The scene matches the background: its height fills the viewport and its width
   follows the bg aspect (so a wider-than-tall scene overflows horizontally at
   scale 1). It can be zoomed in (up to MAX_SCALE) and panned on both axes —
   panning is clamped to the bg rectangle, so the level stays within the bg.
   transform = translate(tx,ty) scale(s), origin top-left. */
function setupPan(recenter){
  const wv = boardWrap.clientWidth, hv = boardWrap.clientHeight;
  if (!hv) return;
  State.sideY = hv;                 // height fits the viewport
  State.sideX = hv * State.aspect;  // width follows the bg aspect
  board.style.width  = State.sideX + 'px';
  board.style.height = State.sideY + 'px';
  if (recenter || State.pan.s == null){
    State.pan.s  = MIN_SCALE;
    State.pan.tx = (wv - State.sideX * State.pan.s) / 2; // centre horizontally
    State.pan.ty = (hv - State.sideY * State.pan.s) / 2; // 0 at scale 1
  }
  clampPan();
  applyPan();
}
function panBounds(){
  const wv = boardWrap.clientWidth, hv = boardWrap.clientHeight;
  const szX = State.sideX * State.pan.s, szY = State.sideY * State.pan.s;
  return { minX: Math.min(0, wv - szX), maxX: 0, minY: Math.min(0, hv - szY), maxY: 0 };
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
  // remove any previously injected items (on restart / round change)
  board.querySelectorAll('.item').forEach(n=>n.remove());
  State.items = {};

  for (let i = 1; i <= State.itemCount; i++){
    const hb = State.manifest.items['h'+i];
    const sb = State.manifest.shadows['s'+i]; // s_i pairs with h_i (may be absent)

    // PSB stack order is h_i then s_i, so the wrap holds h (below) + s (on top),
    // both drawn at the item's z. The clean h is reserved for the tray/fly.
    let x = hb.x, y = hb.y, r = hb.x+hb.w, b = hb.y+hb.h;
    if (sb){ x=Math.min(x,sb.x); y=Math.min(y,sb.y); r=Math.max(r,sb.x+sb.w); b=Math.max(b,sb.y+sb.h); }
    const W = r - x, H = b - y;

    const wrap = document.createElement('div');
    wrap.className = 'item';
    wrap.dataset.i = i;
    wrap.style.left   = pct(x);
    wrap.style.top    = pct(y);
    wrap.style.width  = pct(W);
    wrap.style.height = pct(H);
    wrap.style.zIndex = hb.z;

    const ob = imgEl(asset('h'+i+'.png'), 'ob');   // clean object (below)
    place(ob, hb, x, y, W, H);
    wrap.append(ob);
    let sh = null;
    if (sb){ sh = imgEl(asset('s'+i+'.png'), 'sh'); place(sh, sb, x, y, W, H); wrap.append(sh); } // in-scene (on top)
    board.appendChild(wrap);

    const rec = { x:hb.x, y:hb.y, w:hb.w, h:hb.h, barRot:hb.barRot||0, z:hb.z,
                  el:wrap, ob, sh, collected:false, type:typeOf(i),
                  hit:{ready:false} };
    State.items[i] = rec;
    buildAlpha(ob, rec);   // hit-test against the clean object silhouette
  }
}

function imgEl(src, cls){
  const im = document.createElement('img');
  im.className = cls; im.src = src; im.draggable = false; im.alt='';
  return im;
}
// place child (normalized bbox cb) inside wrap whose origin is (ox,oy) size (W,H)
function place(im, cb, ox, oy, W, H){
  im.style.left   = ((cb.x-ox)/W*100)+'%';
  im.style.top    = ((cb.y-oy)/H*100)+'%';
  im.style.width  = (cb.w/W*100)+'%';
  im.style.height = (cb.h/H*100)+'%';
}
const pct = (v)=> (v*100)+'%';

/* build a small alpha canvas from the clean object image for hit testing */
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

/* ================= tray ================= */
function buildTray(){
  trayEl.innerHTML = '';
  for (let k = 0; k < TOTAL_SLOTS; k++){
    const s = document.createElement('div');
    s.className = 'slot'; s.dataset.k = k;
    trayEl.appendChild(s);
  }
}

function renderTray(){
  const slots = trayEl.children;
  for (let k = 0; k < TOTAL_SLOTS; k++){
    const slot = slots[k];
    const entry = State.tray[k];
    const locked = (k === BONUS_SLOT) && !State.bonusUnlocked;
    slot.classList.remove('matched');
    slot.classList.toggle('locked', locked);
    if (locked){
      // rewarded slot: a "+" with a small ▶ rewarded cue
      slot.classList.remove('filled');
      slot.innerHTML = '<span class="plus">+</span><span class="rew">▶</span>';
    } else if (entry){
      slot.classList.add('filled');
      slot.innerHTML = '';
      const im = imgEl(asset('h'+entry.i+'.png'), 'tok');
      const br = State.items[entry.i] ? State.items[entry.i].barRot : 0;
      if (br) im.style.setProperty('--br', br + 'deg'); // seat the item upright
      slot.appendChild(im);
    } else {
      slot.classList.remove('filled');
      slot.innerHTML = '';
    }
  }
}

/* ================= input ================= */
const DRAG_THRESHOLD = 7;          // px before a press becomes a pan (not a tap)
const WHEEL_ZOOM     = 0.0016;     // wheel sensitivity
const pointers = new Map();        // active pointerId -> {x,y} (client coords)
let gesture = null;                // current gesture state machine

function bindEvents(){
  boardWrap.addEventListener('pointerdown',   onPointerDown);
  boardWrap.addEventListener('pointermove',   onPointerMove);
  boardWrap.addEventListener('pointerup',     onPointerUp);
  boardWrap.addEventListener('pointercancel', onPointerUp);
  boardWrap.addEventListener('wheel',         onWheel, { passive:false });
  trayEl.addEventListener('click', onTrayTap);
  $('#refreshBtn').addEventListener('click', ()=> hardReset());
  $('#hintBtn').addEventListener('click', onHint);
  $('#revealBtn').addEventListener('click', revealAll);
  $('#nextBtn').addEventListener('click', nextLevel);
  $('#ovBtn').addEventListener('click', onOverlayBtn);
}

/* tap the locked rewarded slot -> watch a rewarded ad to unlock it */
function onTrayTap(e){
  if (State.busy) return;
  const slot = e.target.closest('.slot');
  if (slot && +slot.dataset.k === BONUS_SLOT && !State.bonusUnlocked) showRewardedAd();
}

/* ===== rewarded ad (simulated): watch ~3s, then the 6th slot unlocks ===== */
const AD_SECONDS = 3;
let adTimerId = null;
function showRewardedAd(){
  if (adTimerId) clearInterval(adTimerId);   // guard against stale timers
  State.busy = true;
  adOverlay.classList.add('show');
  let t = AD_SECONDS;
  adTimer.textContent = 'Reward in ' + t + 's';
  adTimerId = setInterval(()=>{
    t--;
    if (t <= 0){
      clearInterval(adTimerId); adTimerId = null;
      adOverlay.classList.remove('show');
      State.busy = false;
      grantBonusSlot();
    } else {
      adTimer.textContent = 'Reward in ' + t + 's';
    }
  }, 1000);
}
function grantBonusSlot(){
  if (State.bonusUnlocked) return;
  State.bonusUnlocked = true;
  State.slots = TOTAL_SLOTS;      // the 6th cell is now usable
  renderTray();
  const slot = trayEl.children[BONUS_SLOT];
  void slot.offsetWidth;
  slot.classList.add('unlocked'); // brief celebratory flash
  setTimeout(()=> slot.classList.remove('unlocked'), 700);
}

/* reveal hint: glow every remaining item for 5s, then turn the glow off */
const REVEAL_MS = 3000;
function revealAll(){
  if (State.busy) return;
  setupPan(true);                 // zoom out to fit so the most items are visible
  dragHint.classList.add('hide');
  board.querySelectorAll('.item:not(.collected)').forEach(el=> el.classList.add('glow'));
  setTimeout(()=> board.querySelectorAll('.item.glow').forEach(el=> el.classList.remove('glow')), REVEAL_MS);
}

/* advance to the next level in the rotation (wraps back to the first) */
function nextLevel(){
  hideOverlay();
  loadLevel(State.levelIndex + 1);
}

const wrapXY = (clientX, clientY)=>{ const r = boardWrap.getBoundingClientRect();
  return { x: clientX - r.left, y: clientY - r.top }; };

function onPointerDown(e){
  if (State.busy) return;
  if (e.isPrimary){ pointers.clear(); gesture = null; } // recover if an up was ever missed
  try { boardWrap.setPointerCapture(e.pointerId); } catch(_){} // capture is best-effort
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
    // zoom toward the pinch midpoint…
    zoomAt(mid.x, mid.y, State.pan.s * (dist / gesture.prevDist));
    // …and pan with the midpoint drift
    State.pan.tx += mid.x - gesture.prevMid.x;
    State.pan.ty += mid.y - gesture.prevMid.y;
    clampPan(); applyPan();
    gesture.prevDist = dist; gesture.prevMid = mid;
    return;
  }

  // single-pointer press -> pan once it moves past the threshold
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
      // one finger left: hand off to a pan so there's no jump
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

/* wheel = zoom toward the cursor (desktop) */
function onWheel(e){
  if (State.busy) return;
  e.preventDefault();
  const p = wrapXY(e.clientX, e.clientY);
  zoomAt(p.x, p.y, State.pan.s * Math.exp(-e.deltaY * WHEEL_ZOOM));
  dragHint.classList.add('hide');
}

/* a genuine tap (no pan): collect the topmost item under the point, else ripple */
function tapAt(clientX, clientY){
  const rect = board.getBoundingClientRect(); // board moves with pan; items are % of it
  const bx = (clientX - rect.left) / rect.width;
  const by = (clientY - rect.top)  / rect.height;

  const order = Object.keys(State.items)
    .map(Number)
    .sort((a,b)=> State.items[b].z - State.items[a].z);

  for (const i of order){
    const it = State.items[i];
    if (it.collected) continue;
    // hit silhouette grown by HIT_GROW about the item's centre
    const ex = it.x - it.w*HIT_GROW/2, ey = it.y - it.h*HIT_GROW/2;
    const ew = it.w*(1+HIT_GROW),      eh = it.h*(1+HIT_GROW);
    if (bx < ex || by < ey || bx > ex+ew || by > ey+eh) continue;
    // map the point back onto the original alpha map (un-scale toward centre)
    const nx = 0.5 + ((bx-it.x)/it.w - 0.5) / (1+HIT_GROW);
    const ny = 0.5 + ((by-it.y)/it.h - 0.5) / (1+HIT_GROW);
    if (isOpaque(it, nx, ny)){
      dragHint.classList.add('hide');
      collect(i);
      return;
    }
  }
  ripple(clientX, clientY); // empty tap feedback
}

function isOpaque(it, nx, ny){
  const h = it.hit;
  if (!h.ready) return true; // fallback to bbox before alpha map is ready
  const px = Math.min(h.cw-1, Math.max(0, Math.floor(nx*h.cw)));
  const py = Math.min(h.ch-1, Math.max(0, Math.floor(ny*h.ch)));
  return h.ctx.getImageData(px, py, 1, 1).data[3] > ALPHA_HIT;
}

/* ================= collect (board -> tray) ================= */
function collect(i){
  if (State.tray.length >= State.slots) return;
  const it = State.items[i];
  it.collected = true;
  it.el.classList.add('collected');

  const k = State.tray.length;
  State.tray.push({ i, type: it.type });

  const from = it.ob.getBoundingClientRect();
  const slot = trayEl.children[k];
  renderTray();
  const to = slot.getBoundingClientRect();

  // fly the item to the tray, straightening it upright (0 -> barRot) on the way
  flyImg(asset('h'+i+'.png'), from, to, it.barRot, ()=> settle());
}

/* resolve tray state: clear a completed triplet (then chain), else check fail.
   guarded by State.busy so overlapping fly callbacks never double-count. */
function settle(){
  if (State.busy) return; // a clear animation is running; it re-settles when done

  const counts = {};
  State.tray.forEach((e,idx)=> (counts[e.type] ??= []).push(idx));
  let triplet = null;
  for (const t in counts){
    if (counts[t].length >= TRIPLET_SIZE){ triplet = counts[t].slice(0, TRIPLET_SIZE); break; }
  }

  if (triplet){
    State.busy = true;
    triplet.forEach(idx => trayEl.children[idx]?.classList.add('matched'));
    const rm = new Set(triplet);
    setTimeout(()=>{
      State.tray = State.tray.filter((_,idx)=> !rm.has(idx));
      State.matches++;
      progNum.textContent = State.matches;
      progress.classList.remove('bump'); void progress.offsetWidth;
      progress.classList.add('bump');
      renderTray();
      State.busy = false;
      if (State.matches >= GOAL_MATCHES){ win(); return; }
      settle(); // chain: catch further triplets / fail on the updated tray
    }, 360);
    return;
  }

  if (State.tray.length >= State.slots) failFull();
}

/* ================= fail ================= */
function failFull(){
  State.busy = true;            // lock the board until the popup is dismissed
  trayEl.classList.add('danger');
  setTimeout(()=>{
    trayEl.classList.remove('danger');
    showOverlay('😖', 'Tray Full!', 'No matching trio left — give it another go.',
                'Try Again', ()=> hardReset());
  }, 450);
}

/* ================= hint ================= */
/* smart hint: if a triplet already has 2 in the tray, point to the missing 3rd;
   else if a type has 1 in the tray, point to one of its mates; else random. */
function onHint(){
  if (State.busy) return;

  const inTray = {};                         // type -> count in tray (0,1,2)
  State.tray.forEach(e=> inTray[e.type] = (inTray[e.type]||0)+1);

  const uncollected = [];
  for (let i = 1; i <= REAL_ITEMS; i++){
    if (!State.items[i].collected) uncollected.push(i);
  }
  if (!uncollected.length) return;

  // highest tray-progress among the types we can still find on the board
  let best = 0;
  uncollected.forEach(i => { best = Math.max(best, inTray[State.items[i].type] || 0); });

  // pool = items of the most-progressed type (2 beats 1); if none in tray -> all
  const pool = best > 0
    ? uncollected.filter(i => (inTray[State.items[i].type] || 0) === best)
    : uncollected;
  const pick = pool[Math.floor(Math.random() * pool.length)];

  panToItem(pick); // scroll the scene so the hinted item is visible
  const it = State.items[pick];
  it.el.classList.remove('hint'); void it.el.offsetWidth;
  it.el.classList.add('hint');
  setTimeout(()=> it.el.classList.remove('hint'), 2100);
}

/* smoothly pan the scene so item i is centered in the viewport (current zoom) */
function panToItem(i){
  const it = State.items[i];
  const wv = boardWrap.clientWidth, hv = boardWrap.clientHeight, s = State.pan.s;
  State.pan.tx = wv/2 - (it.x + it.w/2) * State.sideX * s;
  State.pan.ty = hv/2 - (it.y + it.h/2) * State.sideY * s;
  clampPan();
  board.style.transition = 'transform .45s cubic-bezier(.4,.9,.3,1)';
  applyPan();
  setTimeout(()=> { board.style.transition = ''; }, 470);
  dragHint.classList.add('hide');
}

/* ================= fly animation ================= */
function flyImg(src, from, to, rot, cb){
  rot = rot || 0;
  const im = document.createElement('img');
  im.className = 'fly'; im.src = src;
  im.style.left = from.left+'px';  im.style.top = from.top+'px';
  im.style.width = from.width+'px'; im.style.height = from.height+'px';
  document.body.appendChild(im);
  const dur = 420;
  im.animate([
    { left:from.left+'px', top:from.top+'px', width:from.width+'px',      height:from.height+'px',      transform:'rotate(0deg)' },
    { left:to.left+'px',   top:to.top+'px',   width:to.width*0.84+'px',   height:to.height*0.84+'px',   transform:`rotate(${rot}deg)` }
  ], { duration:dur, easing:'cubic-bezier(.4,.9,.3,1)' });
  setTimeout(()=>{ im.remove(); cb && cb(); }, dur);
}

/* ================= fx ================= */
function ripple(clientX, clientY){
  const fr = fxLayer.getBoundingClientRect();
  const r = document.createElement('div');
  r.className = 'ripple';
  r.style.left = (clientX - fr.left)+'px';
  r.style.top  = (clientY - fr.top)+'px';
  fxLayer.appendChild(r);
  setTimeout(()=> r.remove(), 520);
}

/* ================= win / reset ================= */
function win(){
  const next = LEVELS[(State.levelIndex + 1) % LEVELS.length];
  showOverlay('🏆', 'You Win!', `All ${GOAL_MATCHES} matches found! Up next: ${next.name}.`,
              'Next Level', ()=> nextLevel());
}
function showOverlay(emoji, title, sub, btnText, action){
  State.busy = true;
  $('#ovEmoji').textContent = emoji;
  $('#ovTitle').textContent = title;
  $('#ovSub').textContent   = sub;
  $('#ovBtn').textContent   = btnText || 'Play Again';
  State.overlayAction = action || (()=> hardReset());
  overlay.classList.add('show');
}
function hideOverlay(){ overlay.classList.remove('show'); }
function onOverlayBtn(){
  hideOverlay();
  const a = State.overlayAction; State.overlayAction = null;
  if (a) a();
}

function hardReset(){          // restart the level
  startLevel();
}
