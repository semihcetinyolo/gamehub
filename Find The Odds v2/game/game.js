/* ================= Find The Strange ================= */

const MAX_HEARTS = 5;     // lives
const ALPHA_HIT  = 28;    // alpha threshold for a "hit"
const HIT_GROW   = 0.07;  // enlarge each item's clickable silhouette by 7%
const MIN_SCALE  = 1;     // fit-to-height (whole scene height visible)
const MAX_SCALE  = 4;     // how far you can zoom in

/* ---------------- state ---------------- */
const State = {
  levels:[],       // ['beach','market',...] play order, from assets/levels.json
  levelIndex:0,    // which level is loaded
  assetPath:'',    // 'assets/<level>/'  — prefix for this level's images
  manifest:null,
  items:{},        // name -> {name, kind, x,y,w,h, el, ob, collected, shadow, hit:{ctx,cw,ch,ready}}
  shadowEls:{},    // sName -> standalone glow element (removed when its odd is found)
  rank:{},         // name -> z rank
  oddNames:[],     // ['o1','o2',...]  (the items to find)
  goal:0,          // number of odds to find
  found:0,         // odds found so far
  hearts:MAX_HEARTS,
  busy:false,      // lock during win / game-over
  view:{ s:1, tx:0, ty:0, side:0 }, // scale + translate of the oversized scene
  overlayAction:null,            // what the overlay button does
};
const view = State.view;

/* ---------------- dom refs ---------------- */
const $ = (s)=>document.querySelector(s);
const board    = $('#board');
const boardWrap= $('#boardWrap');
const trayEl   = $('#tray');
const heartsEl = $('#hearts');
const fxLayer  = $('#fxLayer');
const progNum  = $('#progNum');
const progDen  = $('#progDen');
const progress = $('#progress');
const overlay  = $('#overlay');
const dragHint = $('#dragHint');

/* ================= init ================= */
init();

async function init(){
  const res = await fetch('assets/levels.json');
  State.levels = await res.json();
  bindEvents();
  addEventListener('resize', ()=> setupPan(false));
  await loadLevel(0);
}

/* fetch a level's manifest, wire up its assets, and start it fresh */
async function loadLevel(i){
  State.levelIndex = i;
  const name = State.levels[i];
  State.assetPath = 'assets/' + name + '/';

  const res = await fetch(State.assetPath + 'manifest.json');
  State.manifest = await res.json();

  State.oddNames = Object.keys(State.manifest.odds);
  State.goal = State.oddNames.length;
  State.found = 0;
  State.hearts = MAX_HEARTS;
  State.busy = false;
  progDen.textContent = '/' + State.goal;
  progNum.textContent = '0';

  // z rank from PSB draw order (bg first/bottom -> later = on top); odds, traps & shadows
  State.rank = {};
  let r = 0;
  for (const nm of State.manifest.order){
    if (/^[ors]\d+$/.test(nm)) State.rank[nm] = ++r;
  }

  $('#bg').src = State.assetPath + 'bg.jpg';
  buildBoard();
  buildTray();
  buildHearts();
  hideOverlay();
  setupPan(true);
}

const assetUrl = (name)=> State.assetPath + name + '.png';

/* size the square scene to the viewport height; at scale 1 the whole height is
   visible and you pan horizontally. Zooming in lets you pan both axes.
   recenter=true resets zoom to 1 and centers the scene. */
function setupPan(recenter){
  const wv = boardWrap.clientWidth, hv = boardWrap.clientHeight;
  if (!hv) return;
  board.style.width = hv + 'px';
  board.style.height = hv + 'px';
  view.side = hv;
  if (recenter){
    view.s = MIN_SCALE;
    view.tx = (wv - hv * view.s) / 2; // center the (wider-than-viewport) scene
    view.ty = 0;
  }
  clampView();
  applyView();
}
function applyView(){ board.style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`; }

/* keep the scaled scene covering the viewport (no empty gutters) */
function clampView(){
  const wv = boardWrap.clientWidth, hv = boardWrap.clientHeight;
  view.s = clamp(view.s, MIN_SCALE, MAX_SCALE);
  const disp = view.side * view.s;
  view.tx = disp <= wv ? (wv - disp)/2 : clamp(view.tx, wv - disp, 0);
  view.ty = disp <= hv ? (hv - disp)/2 : clamp(view.ty, hv - disp, 0);
}

/* zoom toward a point (px,py) given relative to the board-wrap's top-left */
function zoomAt(px, py, newS){
  newS = clamp(newS, MIN_SCALE, MAX_SCALE);
  view.tx = px - (px - view.tx) / view.s * newS;
  view.ty = py - (py - view.ty) / view.s * newS;
  view.s = newS;
  clampView();
  applyView();
}
const clamp = (v,lo,hi)=> Math.max(lo, Math.min(hi, v));

function buildBoard(){
  // remove any previously injected nodes (on restart / level change)
  board.querySelectorAll('.item, .shadow').forEach(n=>n.remove());
  State.items = {};
  State.shadowEls = {};

  // helper: place a board node by its normalized bbox
  const placeNode = (el, bb, z)=>{
    el.style.left = pct(bb.x); el.style.top = pct(bb.y);
    el.style.width = pct(bb.w); el.style.height = pct(bb.h);
    el.style.zIndex = z || 1;
  };

  // shadows / glows: standalone, non-interactive scene art keyed by number.
  // When the matching odd (sN <-> oN) is found, its shadow is removed (see collectOdd).
  for (const sName in (State.manifest.shadows || {})){
    const el = document.createElement('div');
    el.className = 'shadow';
    el.dataset.name = sName;
    placeNode(el, State.manifest.shadows[sName], State.rank[sName]);
    el.appendChild(imgEl(assetUrl(sName), 'sob'));
    board.appendChild(el);
    State.shadowEls[sName] = el;
  }

  // odds + traps: tappable items, each placed by its normalized bbox
  const all = { ...State.manifest.traps, ...State.manifest.odds };
  for (const name in all){
    const bb = all[name];
    const kind = name[0] === 'o' ? 'odd' : 'trap';

    const wrap = document.createElement('div');
    wrap.className = 'item';
    wrap.dataset.name = name;
    placeNode(wrap, bb, State.rank[name]);

    const ob = imgEl(assetUrl(name), 'ob');
    wrap.appendChild(ob);
    board.appendChild(wrap);

    const rec = { name, kind, x:bb.x, y:bb.y, w:bb.w, h:bb.h,
                  el:wrap, ob, collected:false, hit:{ready:false},
                  shadow: kind === 'odd' ? (State.manifest.odds[name].shadow || null) : null };
    State.items[name] = rec;
    buildAlpha(ob, rec);   // pixel-perfect hit map from the clean object
  }
}

function imgEl(src, cls){
  const im = document.createElement('img');
  im.className = cls; im.src = src; im.draggable = false; im.alt='';
  return im;
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
/* one slot per odd item; each found odd flies into the next free slot */
function buildTray(){
  trayEl.innerHTML = '';
  for (let k = 0; k < State.goal; k++){
    const s = document.createElement('div');
    s.className = 'slot'; s.dataset.k = k;
    trayEl.appendChild(s);
  }
}
function fillSlot(k, name){
  const slot = trayEl.children[k];
  if (!slot) return;
  slot.classList.add('filled');
  slot.innerHTML = '';
  slot.appendChild(imgEl(assetUrl(name), 'tok'));
}

/* ================= hearts ================= */
function buildHearts(){
  heartsEl.innerHTML = '';
  for (let k = 0; k < MAX_HEARTS; k++){
    const h = document.createElement('span');
    h.className = 'heart'; h.textContent = '❤️';
    heartsEl.appendChild(h);
  }
}
function loseHeart(){
  if (State.hearts <= 0) return;
  State.hearts--;
  const h = heartsEl.children[State.hearts]; // lose from the right
  if (h){
    h.classList.add('lost', 'pop');
    setTimeout(()=> h.classList.remove('pop'), 460);
  }
}

/* ================= input: drag-pan + pinch / wheel zoom ================= */
const DRAG_THRESHOLD = 7;   // px of movement before a press becomes a pan (not a tap)
const pointers = new Map(); // pointerId -> {x,y} for active pointers on the board
let drag = null;            // single-finger pan: { id, startX, startY, startTx, startTy, moved }
let pinch = null;           // two-finger zoom: { startDist, startS }
let pinched = false;        // a pinch happened during this gesture -> suppress tap

function bindEvents(){
  boardWrap.addEventListener('pointerdown', onPointerDown);
  boardWrap.addEventListener('pointermove', onPointerMove);
  boardWrap.addEventListener('pointerup',   onPointerUp);
  boardWrap.addEventListener('pointercancel', onPointerUp);
  boardWrap.addEventListener('wheel', onWheel, { passive:false });
  $('#refreshBtn').addEventListener('click', ()=> hardReset());
  $('#hintBtn').addEventListener('click', onHint);
  $('#ovBtn').addEventListener('click', onOverlayBtn);
  $('#settingsBtn').addEventListener('click', openSettings);
  $('#settingsCloseBtn').addEventListener('click', closeSettings);
  $('#nextLevelBtn').addEventListener('click', goNextLevel);
  $('#settingsOverlay').addEventListener('click', (e)=>{ if (e.target.id === 'settingsOverlay') closeSettings(); });
}

/* ---------------- settings ---------------- */
function openSettings(){
  $('#settingsLevelInfo').textContent =
    `Level ${State.levelIndex + 1} / ${State.levels.length}`;
  $('#settingsOverlay').classList.add('show');
}
function closeSettings(){ $('#settingsOverlay').classList.remove('show'); }
function goNextLevel(){
  closeSettings();
  const next = (State.levelIndex + 1) % State.levels.length;   // wraps to first after the last
  loadLevel(next);
}

const dist = (a,b)=> Math.hypot(a.x - b.x, a.y - b.y);

function onPointerDown(e){
  if (State.busy) return;
  boardWrap.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x:e.clientX, y:e.clientY });
  boardWrap.classList.add('grabbing');

  if (pointers.size === 1){
    drag = { id:e.pointerId, startX:e.clientX, startY:e.clientY,
             startTx:view.tx, startTy:view.ty, moved:false };
  } else if (pointers.size === 2){
    drag = null;             // a second finger landed -> switch to pinch-zoom
    pinched = true;
    const [a,b] = [...pointers.values()];
    pinch = { startDist: dist(a,b) || 1, startS: view.s };
  }
}

function onPointerMove(e){
  const p = pointers.get(e.pointerId);
  if (!p) return;
  p.x = e.clientX; p.y = e.clientY;

  if (pinch && pointers.size >= 2){
    const [a,b] = [...pointers.values()];
    const d = dist(a,b);
    if (d > 0){
      const rect = boardWrap.getBoundingClientRect();
      const mx = (a.x + b.x)/2 - rect.left;
      const my = (a.y + b.y)/2 - rect.top;
      zoomAt(mx, my, pinch.startS * d / pinch.startDist);
      dragHint.classList.add('hide');
    }
  } else if (drag && e.pointerId === drag.id){
    const dx = e.clientX - drag.startX, dy = e.clientY - drag.startY;
    if (Math.hypot(dx,dy) > DRAG_THRESHOLD){ drag.moved = true; dragHint.classList.add('hide'); }
    if (drag.moved){
      view.tx = drag.startTx + dx;
      view.ty = drag.startTy + dy;
      clampView(); applyView();
    }
  }
}

function onPointerUp(e){
  if (!pointers.has(e.pointerId)) return;
  const wasTap = drag && e.pointerId === drag.id && !drag.moved && !pinched;
  pointers.delete(e.pointerId);

  if (pointers.size === 0){
    boardWrap.classList.remove('grabbing');
    drag = null; pinch = null;
    const wasPinch = pinched; pinched = false;
    if (wasTap && !wasPinch && !State.busy) tapAt(e.clientX, e.clientY);
  } else if (pointers.size === 1){
    // dropped from a pinch to one finger -> resume panning from the remaining finger
    pinch = null;
    const [id, p] = [...pointers.entries()][0];
    drag = { id, startX:p.x, startY:p.y, startTx:view.tx, startTy:view.ty, moved:true };
  }
}

/* wheel / trackpad-pinch zoom on desktop, anchored at the cursor */
function onWheel(e){
  if (State.busy) return;
  e.preventDefault();
  const rect = boardWrap.getBoundingClientRect();
  const factor = Math.exp(-e.deltaY * 0.0015);
  zoomAt(e.clientX - rect.left, e.clientY - rect.top, view.s * factor);
  dragHint.classList.add('hide');
}

/* a genuine tap (no pan): act on the topmost item under the point, else point fx */
function tapAt(clientX, clientY){
  const rect = board.getBoundingClientRect(); // board moves with pan; items are % of it
  const bx = (clientX - rect.left) / rect.width;
  const by = (clientY - rect.top)  / rect.height;

  const order = Object.keys(State.items)
    .sort((a,b)=> (State.rank[b]||0) - (State.rank[a]||0));

  for (const name of order){
    const it = State.items[name];
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
      if (it.kind === 'odd') collectOdd(name);
      else wrongTap(name);
      return;
    }
  }
  bluePoint(clientX, clientY); // empty tap feedback
}

function isOpaque(it, nx, ny){
  const h = it.hit;
  if (!h.ready) return true; // fallback to bbox before alpha map is ready
  const px = Math.min(h.cw-1, Math.max(0, Math.floor(nx*h.cw)));
  const py = Math.min(h.ch-1, Math.max(0, Math.floor(ny*h.ch)));
  return h.ctx.getImageData(px, py, 1, 1).data[3] > ALPHA_HIT;
}

/* ================= collect odd (board -> tray) ================= */
function collectOdd(name){
  const it = State.items[name];
  it.collected = true;
  it.el.classList.add('collected');

  // remove the matching glow/shadow (oN <-> sN) from the scene
  if (it.shadow){
    const sEl = State.shadowEls[it.shadow];
    if (sEl){ sEl.classList.add('gone'); setTimeout(()=> sEl.remove(), 340); }
  }

  const k = State.found;          // next free slot
  State.found++;

  const from = it.ob.getBoundingClientRect();
  const slot = trayEl.children[k];
  const to = slot.getBoundingClientRect();
  flyImg(assetUrl(name), from, to, ()=> fillSlot(k, name));

  progNum.textContent = State.found;
  progress.classList.remove('bump'); void progress.offsetWidth;
  progress.classList.add('bump');

  if (State.found >= State.goal) setTimeout(win, 430);
}

/* ================= wrong tap (decoy) ================= */
function wrongTap(name){
  const it = State.items[name];
  // red shake on the tapped decoy
  it.el.classList.remove('wrong'); void it.el.offsetWidth;
  it.el.classList.add('wrong');
  setTimeout(()=> it.el.classList.remove('wrong'), 440);

  loseHeart();
  if (State.hearts <= 0) setTimeout(gameOver, 420);
}

/* ================= hint ================= */
function onHint(){
  if (State.busy) return;
  // pan to the first odd that hasn't been found yet
  const next = State.oddNames.find(n => !State.items[n].collected);
  if (!next) return;
  panToItem(next);
  const it = State.items[next];
  it.el.classList.remove('hint'); void it.el.offsetWidth;
  it.el.classList.add('hint');
  setTimeout(()=> it.el.classList.remove('hint'), 2100);
}

/* smoothly pan the scene so an item is centered in the viewport (at current zoom) */
function panToItem(name){
  const it = State.items[name];
  const wv = boardWrap.clientWidth, hv = boardWrap.clientHeight;
  view.tx = wv/2 - (it.x + it.w/2) * view.side * view.s;
  view.ty = hv/2 - (it.y + it.h/2) * view.side * view.s;
  clampView();
  board.style.transition = 'transform .45s cubic-bezier(.4,.9,.3,1)';
  applyView();
  setTimeout(()=> { board.style.transition = ''; }, 470);
  dragHint.classList.add('hide');
}

/* ================= fly animation ================= */
function flyImg(src, from, to, cb){
  const im = document.createElement('img');
  im.className = 'fly'; im.src = src;
  im.style.left = from.left+'px';  im.style.top = from.top+'px';
  im.style.width = from.width+'px'; im.style.height = from.height+'px';
  document.body.appendChild(im);
  const dur = 420;
  im.animate([
    { left:from.left+'px', top:from.top+'px',  width:from.width+'px',  height:from.height+'px' },
    { left:to.left+'px',   top:to.top+'px',    width:to.width*0.84+'px', height:to.height*0.84+'px' }
  ], { duration:dur, easing:'cubic-bezier(.4,.9,.3,1)' });
  setTimeout(()=>{ im.remove(); cb && cb(); }, dur);
}

/* ================= fx ================= */
function bluePoint(clientX, clientY){
  const fr = fxLayer.getBoundingClientRect();
  const p = document.createElement('div');
  p.className = 'point';
  p.style.left = (clientX - fr.left)+'px';
  p.style.top  = (clientY - fr.top)+'px';
  fxLayer.appendChild(p);
  setTimeout(()=> p.remove(), 580);
}

/* ================= win / lose / reset ================= */
function win(){
  const hasNext = State.levelIndex < State.levels.length - 1;
  if (hasNext){
    showOverlay('🎉', 'Level Complete!', `Found all ${State.goal} odd items!`,
                'Next Level', ()=> loadLevel(State.levelIndex + 1));
  } else {
    showOverlay('🏆', 'All Levels Cleared!', 'You found every odd item — nicely done!',
                'Play Again', ()=> loadLevel(0));
  }
}
function gameOver(){
  showOverlay('💔', 'Out of Hearts!', 'You ran out of hearts — give it another go.',
              'Try Again', ()=> hardReset());
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

/* restart the current level from scratch */
function hardReset(){
  loadLevel(State.levelIndex);
}
