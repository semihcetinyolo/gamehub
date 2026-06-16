/* ================= Sticker Match =================
   Drag each sticker from the 3-slot tray onto its matching silhouette in the
   scene. Place one and a fresh sticker slides into the tray. Fill the whole
   picture to win, then advance to the next level.

   Assets come from the layered PSBs in ../levels (bg / slots / stickers·si),
   extracted into assets/<id>/ by tools/extract.py. */

const TRAY_SIZE = 3;        // stickers offered at once
const TAP_SLOP  = 8;        // px of movement before a press becomes a drag

// levels in rotation order. id = the assets/<id>/ folder the extractor wrote.
const LEVELS = [
  { id:"0003", name:"Secret Garden" },
  { id:"0002", name:"food" },
  { id:"0001", name:"spooky" },
];

/* ---------------- state ---------------- */
const State = {
  manifest:null,
  levelIndex:0,
  assetBase:'assets/',
  stickers:[],        // [{n,x,y,w,h,z,file,placed}]
  queue:[],           // sticker indices not yet shown, in shuffled order
  tray:[null,null,null],
  placed:0,
  total:0,
  busy:false,
  drag:null,          // active drag state
  overlayAction:null,
};

/* ---------------- dom ---------------- */
const $ = (s)=>document.querySelector(s);
const board    = $('#board');
const boardWrap= $('#boardWrap');
const bgImg    = $('#bg');
const slotsImg = $('#slots');
const trayEl   = $('#tray');
const fxLayer  = $('#fxLayer');
const progNum  = $('#progNum');
const progDen  = $('#progDen');
const progress = $('#progress');
const overlay  = $('#overlay');
const levelPill= $('#levelPill');

const asset = (name)=> State.assetBase + name;
const pct = (v)=> (v*100)+'%';
const clamp = (v,lo,hi)=> Math.max(lo, Math.min(hi, v));

/* ================= init ================= */
init();

function init(){
  buildTray();
  bindEvents();
  addEventListener('resize', layoutBoard);
  loadLevel(0);
}

async function loadLevel(index, _tries){
  _tries = _tries || 0;
  if (!LEVELS.length) return;   // no levels (deleted) — empty shell, no crash
  State.levelIndex = ((index % LEVELS.length) + LEVELS.length) % LEVELS.length;
  State.assetBase  = 'assets/' + LEVELS[State.levelIndex].id + '/';
  let manifest;
  try {
    const res = await fetch(asset('manifest.json'));
    if (!res.ok) throw new Error('manifest ' + res.status);
    manifest = await res.json();
  } catch (e) {
    if (_tries < LEVELS.length - 1) return loadLevel(index + 1, _tries + 1);
    console.error('Sticker Match: no loadable level', e);
    return;
  }
  State.manifest = manifest;
  levelPill.textContent = LEVELS[State.levelIndex].name;

  bgImg.src = asset('bg.jpg');
  if (manifest.slots){ slotsImg.src = asset('slots.png'); slotsImg.style.display = ''; }
  else { slotsImg.removeAttribute('src'); slotsImg.style.display = 'none'; }
  bgImg.style.zIndex   = (manifest.bg && manifest.bg.z) || 0;
  slotsImg.style.zIndex = (manifest.slots && manifest.slots.z) || 1;

  startLevel();
}

function startLevel(){
  // build sticker records from the manifest
  State.stickers = (State.manifest.stickers || []).map((s,i)=>({
    n:i+1, x:s.x, y:s.y, w:s.w, h:s.h, z:s.z, file:s.file, placed:false,
  }));
  State.total  = State.stickers.length;
  State.placed = 0;
  State.busy   = false;
  State.drag   = null;

  // shuffle the deal order, then fill the tray with the first three
  State.queue = State.stickers.map(s=>s.n);
  shuffle(State.queue);
  State.tray = [null,null,null];
  for (let k=0;k<TRAY_SIZE;k++) State.tray[k] = State.queue.length ? State.queue.shift() : null;

  progNum.textContent = '0';
  progDen.textContent = '/' + State.total;

  buildBoard();
  renderTray(false);
  layoutBoard();
}

/* clear and re-create the scene layers (bg/slots persist as <img>; stickers add as placed) */
function buildBoard(){
  board.querySelectorAll('.sticker,.ghost,.slot-ring').forEach(n=>n.remove());
}

/* contain-fit the board inside its wrap and centre it; %-positioned children follow */
function layoutBoard(){
  const wv = boardWrap.clientWidth, hv = boardWrap.clientHeight;
  if (!wv || !hv) return;
  const a = State.manifest ? State.manifest.frameAspect : 1; // w/h
  let W = wv, H = wv / a;
  if (H > hv){ H = hv; W = hv * a; }
  board.style.width  = W + 'px';
  board.style.height = H + 'px';
  board.style.left   = ((wv - W)/2) + 'px';
  board.style.top    = ((hv - H)/2) + 'px';
}

/* ================= tray ================= */
function buildTray(){
  trayEl.innerHTML = '';
  for (let k=0;k<TRAY_SIZE;k++){
    const s = document.createElement('div');
    s.className = 'slot'; s.dataset.k = k;
    trayEl.appendChild(s);
  }
}

function renderTray(animateRefill){
  for (let k=0;k<TRAY_SIZE;k++) renderSlot(k, animateRefill);
}
function renderSlot(k, animateRefill){
  const slot = trayEl.children[k];
  const n = State.tray[k];
  slot.classList.remove('dragging','refill');
  if (n == null){ slot.classList.remove('filled'); slot.innerHTML = ''; return; }
  slot.classList.add('filled');
  const im = document.createElement('img');
  im.src = asset(stickerByN(n).file); im.draggable = false; im.alt = '';
  slot.innerHTML = '';
  slot.appendChild(im);
  if (animateRefill){ slot.classList.add('refill'); }
}

const stickerByN = (n)=> State.stickers[n-1];

/* ================= input ================= */
function bindEvents(){
  trayEl.addEventListener('pointerdown', onTrayPointerDown);
  $('#hintBtn').addEventListener('click', onHint);
  $('#revealBtn').addEventListener('click', onReveal);
  $('#refreshBtn').addEventListener('click', ()=> startLevel());
  $('#nextBtn').addEventListener('click', ()=> nextLevel());
  $('#ovBtn').addEventListener('click', onOverlayBtn);
}

function onTrayPointerDown(e){
  if (State.busy || State.drag) return;
  const slot = e.target.closest('.slot');
  if (!slot || !slot.classList.contains('filled')) return;
  const k = +slot.dataset.k;
  const n = State.tray[k];
  if (n == null) return;

  // belt-and-suspenders: kill any orphan clone left by an interrupted drag
  document.querySelectorAll('.drag-sticker').forEach(c=> c.remove());
  e.preventDefault();

  const st = stickerByN(n);
  const br = board.getBoundingClientRect();
  const wPx = st.w * br.width, hPx = st.h * br.height;

  // floating clone, sized exactly as it will sit on the board (satisfying snap)
  const clone = document.createElement('img');
  clone.className = 'drag-sticker';
  clone.src = asset(st.file); clone.draggable = false; clone.alt = '';
  clone.style.width = wPx + 'px'; clone.style.height = hPx + 'px';
  document.body.appendChild(clone);

  slot.classList.add('dragging');
  State.drag = { k, n, st, clone, wPx, hPx,
                 startX:e.clientX, startY:e.clientY, moved:false, pointerId:e.pointerId };
  moveClone(e.clientX, e.clientY);

  window.addEventListener('pointermove', onDragMove, { passive:false });
  window.addEventListener('pointerup',   onDragUp);
  window.addEventListener('pointercancel', onDragUp);
}

function moveClone(cx, cy){
  const d = State.drag;
  d.clone.style.left = (cx - d.wPx/2) + 'px';
  d.clone.style.top  = (cy - d.hPx/2) + 'px';
}

function onDragMove(e){
  const d = State.drag; if (!d || e.pointerId !== d.pointerId) return;
  e.preventDefault();
  if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > TAP_SLOP) d.moved = true;
  moveClone(e.clientX, e.clientY);
}

function onDragUp(e){
  const d = State.drag; if (!d || e.pointerId !== d.pointerId) return;
  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointerup',   onDragUp);
  window.removeEventListener('pointercancel', onDragUp);

  // a tap (no real drag) → drop the clone and just reveal where this sticker belongs
  if (!d.moved){ endDrag(true); pulseRing(d.st); return; }

  const br = board.getBoundingClientRect();
  const nx = (e.clientX - br.left) / br.width;
  const ny = (e.clientY - br.top)  / br.height;
  const cx = d.st.x + d.st.w/2, cy = d.st.y + d.st.h/2;
  const dist = Math.hypot((nx-cx)*br.width, (ny-cy)*br.height);
  const tol  = Math.max(0.5 * Math.hypot(d.wPx, d.hPx), 0.05 * Math.hypot(br.width, br.height));

  if (dist <= tol) placeSticker(d);
  else snapBack(d);
}

function endDrag(removeClone){
  const d = State.drag; if (!d) return;
  trayEl.children[d.k].classList.remove('dragging');
  if (removeClone && d.clone) d.clone.remove();
  State.drag = null;
}

/* miss → glide the clone back into its tray slot, then restore it */
function snapBack(d){
  const slot = trayEl.children[d.k];
  const sr = slot.getBoundingClientRect();
  const size = Math.min(sr.width, sr.height) * 0.84;
  d.clone.classList.add('snapback');
  d.clone.style.left = (sr.left + (sr.width - size)/2) + 'px';
  d.clone.style.top  = (sr.top  + (sr.height- size)/2) + 'px';
  d.clone.style.width = size + 'px'; d.clone.style.height = size + 'px';
  d.clone.style.transform = 'rotate(-6deg)';
  setTimeout(()=>{ d.clone.remove(); slot.classList.remove('dragging'); }, 260);
  State.drag = null;
}

/* ================= place a sticker ================= */
function placeSticker(d){
  const st = d.st;
  st.placed = true;

  const im = document.createElement('img');
  im.className = 'sticker pop';
  im.src = asset(st.file); im.draggable = false; im.alt = '';
  im.style.left   = pct(st.x);
  im.style.top    = pct(st.y);
  im.style.width  = pct(st.w);
  im.style.height = pct(st.h);
  im.style.zIndex = st.z;
  board.appendChild(im);

  endDrag(true);                 // remove the floating clone
  sparkle(st);                   // burst at the slot

  State.placed++;
  progNum.textContent = State.placed;
  progress.classList.remove('bump'); void progress.offsetWidth; progress.classList.add('bump');

  // empty this tray slot, then deal the next sticker into it
  State.tray[d.k] = null;
  if (State.queue.length){
    State.tray[d.k] = State.queue.shift();
    renderSlot(d.k, true);
  } else {
    renderSlot(d.k, false);
  }

  if (State.placed >= State.total) setTimeout(win, 420);
}

/* ================= hints ================= */
/* 💡 — ring the target slot of every sticker currently in the tray */
function onHint(){
  if (State.busy) return;
  State.tray.forEach(n=>{ if (n != null) pulseRing(stickerByN(n)); });
}
function pulseRing(st){
  const r = document.createElement('div');
  r.className = 'slot-ring';
  r.style.left = pct(st.x); r.style.top = pct(st.y);
  r.style.width = pct(st.w); r.style.height = pct(st.h);
  r.style.zIndex = 999;
  board.appendChild(r);
  setTimeout(()=> r.remove(), 2000);
}

/* 👁 — peek the finished picture: faint ghosts of everything not yet placed */
function onReveal(){
  if (State.busy) return;
  board.querySelectorAll('.ghost').forEach(n=>n.remove());
  const ghosts = [];
  for (const st of State.stickers){
    if (st.placed) continue;
    const g = document.createElement('img');
    g.className = 'ghost';
    g.src = asset(st.file); g.draggable = false; g.alt = '';
    g.style.left = pct(st.x); g.style.top = pct(st.y);
    g.style.width = pct(st.w); g.style.height = pct(st.h);
    g.style.zIndex = st.z;
    board.appendChild(g);
    ghosts.push(g);
  }
  requestAnimationFrame(()=> ghosts.forEach(g=> g.classList.add('show')));
  setTimeout(()=>{
    ghosts.forEach(g=> g.classList.remove('show'));
    setTimeout(()=> ghosts.forEach(g=> g.remove()), 400);
  }, 2200);
}

/* ================= fx ================= */
function sparkle(st){
  const br = board.getBoundingClientRect();
  const fr = fxLayer.getBoundingClientRect();
  const cx = br.left - fr.left + (st.x + st.w/2) * br.width;
  const cy = br.top  - fr.top  + (st.y + st.h/2) * br.height;
  for (let i=0;i<6;i++){
    const s = document.createElement('div');
    s.className = 'spark';
    const a = (Math.PI*2*i)/6, d = 18;
    s.style.left = (cx + Math.cos(a)*d) + 'px';
    s.style.top  = (cy + Math.sin(a)*d) + 'px';
    fxLayer.appendChild(s);
    setTimeout(()=> s.remove(), 520);
  }
}

/* ================= win / nav ================= */
function win(){
  const next = LEVELS[(State.levelIndex + 1) % LEVELS.length];
  showOverlay('🏆', 'You Win!', `Every sticker is home! Up next: ${next.name}.`,
              'Next Level', ()=> nextLevel());
}
function nextLevel(){ hideOverlay(); loadLevel(State.levelIndex + 1); }

function showOverlay(emoji, title, sub, btnText, action){
  State.busy = true;
  $('#ovEmoji').textContent = emoji;
  $('#ovTitle').textContent = title;
  $('#ovSub').textContent   = sub;
  $('#ovBtn').textContent   = btnText || 'Play Again';
  State.overlayAction = action || (()=> startLevel());
  overlay.classList.add('show');
}
function hideOverlay(){ overlay.classList.remove('show'); State.busy = false; }
function onOverlayBtn(){
  const a = State.overlayAction; State.overlayAction = null;
  hideOverlay();
  if (a) a();
}

/* Fisher–Yates */
function shuffle(arr){
  for (let i = arr.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
