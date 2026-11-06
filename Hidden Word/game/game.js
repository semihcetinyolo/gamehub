/* ================= Hidden Word ================= */
/* Every letter of a phrase is hidden in the scene. Tap a letter: its cut-out flies into the first
   empty slot of the same character. Animations never block input. Base: Find The Cat + Waldo menu/combo. */

const LEVELS       = (window.HW_LEVELS || []).slice();                    // player order
const ALL_LEVELS   = LEVELS.concat(window.HW_ADMIN_ONLY_LEVELS || []);  // + admin-picker-only levels (after the player ones)
const START_HEARTS = 3;
const ALPHA_GLYPH  = 127;    // glyph pixels count from this alpha (glyph = the letter object only)
const ALPHA_PATCH  = 28;     // fallback when a level has no glyph: hit-test the scene patch
const TOL_CANVAS   = 14;     // finger tolerance around the glyph, canvas px on a 1792 px wide canvas (scaled to the level) ...
const TOL_SCREEN   = 6;      // ... but never less than this many screen px
const MIN_TARGET   = 32;     // ... and a small letter's hit area (short side + tolerance both ways) is at least this many screen px
const HIT_PAD      = 48;     // distance field margin around the glyph (image px)
const HIT_PAD_SMALL = 128;   // ... for glyphs whose short side is under 160 px (they get the wide MIN_TARGET tolerance at 1x)
const MIN_SCALE    = 1;      // whole scene contained in the free area
const MAX_SCALE    = 4;      // max zoom, or more when needed to reach 1 screen px per canvas px (small letters on short phones)
const maxScale = ()=> Math.max(MAX_SCALE, State.man && State.bw ? State.man.canvas.w / State.bw : 0);
const REVEAL_MS    = 2500;
const COMBO_WINDOW_MS = 10000;  // each find opens a 10 s window for the next; a miss breaks the chain
const COMBO_FIRST     = 3;      // the 3rd find in a chain shows the first praise, then every find after it

/* ---------------- storage (every access guarded) ---------------- */
function load(k){ try { return localStorage.getItem(k); } catch(_){ return null; } }
function save(k, v){ try { localStorage.setItem(k, v); } catch(_){} }
function loadJSON(k, d){ try { const v = JSON.parse(load(k)); return v == null ? d : v; } catch(_){ return d; } }

const Settings = Object.assign({ hearts:false, sound:true }, loadJSON('hw_settings', {}));
/* Progress is kept by level SLUG (hw_done), never by index, so reordering levels.js never shifts anyone's
   progress; the next level = the first level in the current order that is not done (all done: level 1). */
const Progress = { done: [] };
function loadProgress(){
  const d = loadJSON('hw_done', []);
  Progress.done = Array.isArray(d) ? d : [];
}
function saveProgress(){ save('hw_done', JSON.stringify(Progress.done)); }
function saveSettings(){ save('hw_settings', JSON.stringify(Settings)); }

/* ---------------- state ---------------- */
const State = {
  idx: 0, slug: '', man: null, base: '',
  letters: [], slots: [],
  total: 0, found: 0, hearts: START_HEARTS,
  won: false, lost: false, token: 0,
  bw: 0, bh: 0, pan: { tx:0, ty:0, s:1 },
  combo: 0, lastFindAt: -Infinity,
};
const manifests = {};

/* ---------------- dom ---------------- */
const $ = (s)=>document.querySelector(s);
const frame = $('#frame'), board = $('#board'), boardWrap = $('#boardWrap'), fxLayer = $('#fxLayer');
const phraseEl = $('#phrase'), phrasePanel = $('#phrasePanel');
const cntNum = $('#cntNum'), cntDen = $('#cntDen'), counter = $('#counter');
const heartsEl = $('#hearts');
const comboLayer = document.createElement('div'); comboLayer.className = 'combo-layer'; frame.appendChild(comboLayer);
const clamp = (v,lo,hi)=> Math.max(lo, Math.min(hi, v));
const pct = (v)=> (v*100)+'%';

/* ================= init (called at the end of the file) ================= */

/* Astra's UI art (v2 "storybook paper", docs/ui_v2_handoff.md): each file switches its CSS skin on as soon as it
   exists (placeholder CSS otherwise). The v1 art stays in assets/ui/. */
const UI_DIR = 'assets/ui_v2';
const UI_ART = ['logo','slot_empty','slot_filled','counter_pill','level_badge','btn_hint','btn_settings','btn_back',
                'btn_close','heart','heart_empty','ribbon_perfect','btn_play','btn_secondary','panel','bg_menu'];
/* main-menu background: 'storybook' (recommended) or 'garden' (direction B); admin toggle or ?menu=garden */
const MENU_ART = { storybook:'bg_menu', garden:'bg_menu_garden' };
function menuArt(){
  const q = new URLSearchParams(location.search).get('menu');
  if (q && MENU_ART[q]) save('hw_menu_art', q);
  const v = load('hw_menu_art');
  return MENU_ART[v] ? v : 'storybook';
}
function uiFile(n){ return n === 'bg_menu' ? MENU_ART[menuArt()] : n; }
function loadUiArt(only){
  for (const n of (only || UI_ART)){
    const im = new Image(), url = `${UI_DIR}/${uiFile(n)}.png`;
    im.onload = ()=>{
      document.documentElement.style.setProperty('--ui-' + n.replace(/_/g, '-'), `url("${url}")`);
      document.body.classList.add('ui-' + n);
    };
    im.src = url;
  }
}
function syncMenuArt(){ $('#admMenuArt').textContent = '🖼 Menu art: ' + (menuArt() === 'garden' ? 'Garden' : 'Storybook'); }

function init(){
  loadUiArt();
  loadProgress();
  try { localStorage.removeItem('hw_level'); } catch(_){}   // old index-based pointer (pre slug progress)
  bindEvents();
  addEventListener('resize', onResize);
  showMenu();
}

async function getManifest(slug){
  if (!manifests[slug]){
    const res = await fetch(`assets/${slug}/manifest.json`);
    if (!res.ok) throw new Error('manifest ' + slug);
    manifests[slug] = await res.json();
  }
  return manifests[slug];
}

function nextPlayable(){ const i = LEVELS.findIndex(s=> !Progress.done.includes(s)); return i < 0 ? 0 : i; }

/* ================= screens ================= */
function showScreen(id){
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
  closeModals();
}

function showMenu(){
  State.token++;                     // in-flight letters of the old level stop landing
  fxLayer.innerHTML = ''; comboLayer.innerHTML = '';
  showScreen('menuScreen');
  const i = nextPlayable();
  $('#playLabel').textContent = LEVELS.length ? 'PLAY' : 'No levels';
  $('#menuLevel').textContent = `Level ${i+1}`;
  $('#menuLevel').hidden = !LEVELS.length;
}

async function showLevels(){
  showScreen('levelsScreen');
  const grid = $('#levelGrid');
  grid.innerHTML = '';
  $('#levelsCount').textContent = `${Progress.done.filter(s=>LEVELS.includes(s)).length}/${LEVELS.length}`;
  // one section per production route · provider · style, in order of first appearance; play order inside
  const OTHER = 'Diğer', groups = new Map();
  LEVELS.forEach((slug, i)=>{
    const key = (window.HW_LEVEL_GROUP && window.HW_LEVEL_GROUP(slug)) || OTHER;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push([slug, i]);
  });
  if (groups.has(OTHER)){ const o = groups.get(OTHER); groups.delete(OTHER); groups.set(OTHER, o); }
  groups.forEach((items, key)=>{
    const h = document.createElement('div');
    h.className = 'level-group';
    h.textContent = key;
    grid.appendChild(h);
    items.forEach(([slug, i])=> grid.appendChild(levelCard(slug, i)));
  });
}

function levelCard(slug, i){
  // no locks (user): every level can be played at any time; done levels show their phrase
  const done = Progress.done.includes(slug);
  const card = document.createElement('button');
  card.className = 'level-card' + (done ? ' done' : '') + (i === nextPlayable() ? ' current' : '');
  card.innerHTML = `<div class="lc-thumb"><img src="assets/${slug}/thumb.jpg" alt="" draggable="false"></div>
    <div class="lc-name">Level ${i+1}</div><div class="lc-phrase"></div>`;
  if (done) getManifest(slug).then(m=> card.querySelector('.lc-phrase').textContent = m.phrase).catch(()=>{});
  else card.querySelector('.lc-phrase').textContent = 'Play';
  card.addEventListener('click', ()=> startGame(i));
  return card;
}

async function startGame(i){
  showScreen('gameScreen');
  await startLevel(i);
}

/* ================= level ================= */
async function startLevel(i){
  if (!ALL_LEVELS.length) return;
  State.idx = ((i % ALL_LEVELS.length) + ALL_LEVELS.length) % ALL_LEVELS.length;
  State.slug = ALL_LEVELS[State.idx];
  State.base = `assets/${State.slug}/`;
  const token = ++State.token;
  closeModals();
  endReveal();
  fxLayer.innerHTML = ''; comboLayer.innerHTML = '';
  phrasePanel.classList.remove('glow');
  let man;
  try { man = await getManifest(State.slug); }
  catch(e){ console.error(e); return; }
  if (token !== State.token) return;
  State.man = man;
  State.found = 0; State.won = false; State.lost = false;
  State.total = man.letters.length;
  State.hearts = START_HEARTS;
  resetCombo();
  $('#levelLabel').textContent = State.idx < LEVELS.length ? `Level ${State.idx+1}` : 'Admin level';
  $('#bg').src = State.base + 'bg.jpg';
  buildSlots();
  buildBoard();
  renderCounter(); renderHearts();
  setupBoard(true);
  syncAdminPick();
}

/* Each letter has a SCENE PATCH (file: letter + rim + re-rendered scene; fades out in place on a find)
   and a GLYPH (glyph: only the letter object; it flies to the slot and is the hit-test shape).
   Levels without glyphs fall back to the patch for both. */
function buildBoard(){
  board.querySelectorAll('.letter, .glyph').forEach(n=>n.remove());
  State.letters = State.man.letters.map((L)=>{
    const el = layerEl('letter', L.x, L.y, L.w, L.h, L.z, State.base + L.file);
    const hasGlyph = !!L.glyph;
    const box = hasGlyph ? { x:L.gx, y:L.gy, w:L.gw, h:L.gh } : { x:L.x, y:L.y, w:L.w, h:L.h };
    const gEl = layerEl('glyph', box.x, box.y, box.w, box.h, 1000 + L.z, State.base + (hasGlyph ? L.glyph : L.file));
    const rec = { ...L, el, gEl, box, glyphSrc: gEl.firstChild.src, found:false, slot:null, hit:{ ready:false } };
    buildHit(gEl.firstChild, rec, hasGlyph ? ALPHA_GLYPH : ALPHA_PATCH);
    return rec;
  });
}
function layerEl(cls, x, y, w, h, z, src){
  const el = document.createElement('div');
  el.className = cls;
  el.style.left = pct(x); el.style.top = pct(y); el.style.width = pct(w); el.style.height = pct(h);
  el._r = [x, y, w, h];                 // board fractions; commitZoom() places it in device-pixel-snapped board px
  el.style.zIndex = z;
  const img = document.createElement('img');
  img.src = src; img.alt = ''; img.draggable = false;
  el.appendChild(img);
  board.appendChild(el);
  return el;
}

/* distance field (image px) to the nearest solid glyph pixel, with a HIT_PAD margin all round */
function buildHit(im, rec, thr){
  const finish = ()=>{
    const cw = im.naturalWidth, ch = im.naturalHeight;
    if (!cw || !ch) return;
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const ctx = c.getContext('2d', { willReadFrequently:true });
    ctx.drawImage(im, 0, 0);
    const mask = solidMask(ctx.getImageData(0, 0, cw, ch).data, cw, ch, thr);
    const P = Math.min(cw, ch) < 160 ? HIT_PAD_SMALL : HIT_PAD;
    rec.hit = { ready:true, dist: distField(mask, cw, ch, P), cw, ch, P,
                pxPerCanvas: cw / (rec.box.w * State.man.canvas.w) };
  };
  if (im.complete && im.naturalWidth) finish();
  else im.addEventListener('load', finish, { once:true });
}
function distField(mask, w, h, P){
  const W = w + 2 * P, H = h + 2 * P, d = new Float32Array(W * H).fill(1e9), D = Math.SQRT2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) d[(y + P) * W + x + P] = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
    const k = y * W + x; let v = d[k];
    if (x > 0) v = Math.min(v, d[k - 1] + 1);
    if (y > 0){ v = Math.min(v, d[k - W] + 1); if (x > 0) v = Math.min(v, d[k - W - 1] + D); if (x < W - 1) v = Math.min(v, d[k - W + 1] + D); }
    d[k] = v;
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--){
    const k = y * W + x; let v = d[k];
    if (x < W - 1) v = Math.min(v, d[k + 1] + 1);
    if (y < H - 1){ v = Math.min(v, d[k + W] + 1); if (x < W - 1) v = Math.min(v, d[k + W + 1] + D); if (x > 0) v = Math.min(v, d[k + W - 1] + D); }
    d[k] = v;
  }
  return d;
}

/* solid pixels + the holes they enclose (the inside of an O, A, D... counts as the letter) */
function solidMask(data, w, h, thr){
  const m = new Uint8Array(w * h);
  for (let k = 0; k < w * h; k++) m[k] = data[k * 4 + 3] > thr ? 1 : 0;
  const out = new Uint8Array(w * h);           // 2 = transparent and reachable from the border
  const stack = [];
  const push = (k)=>{ if (!m[k] && !out[k]){ out[k] = 2; stack.push(k); } };
  for (let x = 0; x < w; x++){ push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++){ push(y * w); push(y * w + w - 1); }
  while (stack.length){
    const k = stack.pop(), x = k % w;
    if (x > 0) push(k - 1);
    if (x < w - 1) push(k + 1);
    if (k >= w) push(k - w);
    if (k < w * (h - 1)) push(k + w);
  }
  for (let k = 0; k < w * h; k++) out[k] = out[k] === 2 ? 0 : 1;
  return out;
}

/* ---------------- phrase slots ---------------- */
function buildSlots(){
  const words = State.man.phrase.trim().split(/\s+/);
  State.slots = [];
  State.words = words;
  phraseEl.innerHTML = '';
  let k = 0;
  State.wordEls = words.map(w=>{
    const wEl = document.createElement('div'); wEl.className = 'word';
    for (const ch of w){
      const s = document.createElement('div'); s.className = 'slot';
      s.innerHTML = '<span></span>';
      wEl.appendChild(s);
      State.slots.push({ i:k++, ch, el:s, reserved:false, filled:false });
    }
    return wEl;
  });
  layoutSlots();
}

/* choose the largest slot size that fits the phrase in 2 lines (3 for very long phrases) */
function layoutSlots(){
  if (!State.wordEls) return;
  const avail = phrasePanel.clientWidth - 16;
  const lens = State.words.map(w=>w.length);
  let pick = null;
  for (const maxLines of [2, 3]){
    for (let s = 40; s >= 16; s--){
      const gap = Math.max(2, Math.round(s * .12)), wgap = Math.round(s * .55);
      const wpx = (n)=> n * s + (n - 1) * gap;
      const lines = []; let line = [], w = 0, over = false;
      for (let j = 0; j < lens.length; j++){
        if (wpx(lens[j]) > avail) over = true;
        if (line.length && w + wgap + wpx(lens[j]) > avail){ lines.push(line); line = []; w = 0; }
        w += (line.length ? wgap : 0) + wpx(lens[j]);
        line.push(j);
      }
      lines.push(line);
      if (!over && lines.length <= maxLines){ pick = { s, gap, wgap, lines }; break; }
    }
    if (pick) break;
  }
  if (!pick) pick = { s:16, gap:2, wgap:8, lines:[lens.map((_,j)=>j)] };
  phraseEl.style.setProperty('--slot', pick.s + 'px');
  phraseEl.style.setProperty('--sgap', pick.gap + 'px');
  phraseEl.style.setProperty('--wgap', pick.wgap + 'px');
  phraseEl.innerHTML = '';
  for (const ln of pick.lines){
    const l = document.createElement('div'); l.className = 'phrase-line';
    for (const j of ln) l.appendChild(State.wordEls[j]);
    phraseEl.appendChild(l);
  }
}

/* ---------------- HUD ---------------- */
function renderCounter(){ cntNum.textContent = State.found; cntDen.textContent = '/ ' + State.total; }
function renderHearts(){
  heartsEl.hidden = !Settings.hearts;
  [...heartsEl.children].forEach((h,k)=> h.classList.toggle('lost', k >= State.hearts));
}
function bump(el, cls='bump'){ el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

/* ================= board / pan ================= */
/* 1x = the whole scene contained in the free area; the scene frame (boardWrap) hugs it */
function setupBoard(recenter){
  const area = $('#boardArea');
  const aw = area.clientWidth, ah = area.clientHeight;
  if (!aw || !ah || !State.man) return;
  const c = State.man.canvas;
  const fit = Math.min(aw / c.w, ah / c.h);
  State.bw = c.w * fit; State.bh = c.h * fit;
  boardWrap.style.width = State.bw + 'px'; boardWrap.style.height = State.bh + 'px';
  const wv = State.bw, hv = State.bh;
  if (recenter){
    stopPanTween();
    State.pan.s = MIN_SCALE;
    State.pan.tx = (wv - State.bw) / 2;
    State.pan.ty = (hv - State.bh) / 2;
  }
  clampPan(); commitZoom();
}
function clampPan(){
  const wv = boardWrap.clientWidth, hv = boardWrap.clientHeight, p = State.pan;
  const sw = State.bw * p.s, sh = State.bh * p.s;
  p.tx = sw <= wv ? (wv - sw) / 2 : clamp(p.tx, wv - sw, 0);
  p.ty = sh <= hv ? (hv - sh) / 2 : clamp(p.ty, hv - sh, 0);
}
/* Sharp zoom: the board is LAID OUT at its zoomed size (layoutS) so the browser rasterises the images from the
   full-resolution sources; during a pinch/wheel/tween only a cheap compositor scale (s / layoutS) is applied, and
   commitZoom() re-lays the board out at the new scale when the gesture ends.
   Rigid scene: the board is ONE composited layer all the time (will-change in CSS, never toggled), the BG and every
   letter are placed in the same device-pixel grid (snapPx) and a pan is a translate snapped to device pixels, so the
   layer is only moved, never re-rasterised or re-rounded while dragging: letters cannot slide against the BG. */
let layoutS = 1, commitTimer = null;
const snapPx = v => { const d = window.devicePixelRatio || 1; return Math.round(v * d) / d; };
function applyPan(){ const p = State.pan, k = p.s / layoutS;
  board.style.transform = Math.abs(k - 1) < 1e-6 ? `translate(${snapPx(p.tx)}px,${snapPx(p.ty)}px)`
                                                 : `translate(${p.tx}px,${p.ty}px) scale(${k})`; }
function commitZoom(){
  clearTimeout(commitTimer); commitTimer = null;
  layoutS = State.pan.s;
  const W = snapPx(State.bw * layoutS), H = snapPx(State.bh * layoutS);
  board.style.width = W + 'px'; board.style.height = H + 'px';
  for (const el of board.children){
    const r = el._r; if (!r) continue;
    const x0 = snapPx(r[0] * W), y0 = snapPx(r[1] * H), x1 = snapPx((r[0] + r[2]) * W), y1 = snapPx((r[1] + r[3]) * H);
    el.style.left = x0 + 'px'; el.style.top = y0 + 'px'; el.style.width = (x1 - x0) + 'px'; el.style.height = (y1 - y0) + 'px';
  }
  board.classList.remove('moving');
  applyPan();
}
function scheduleCommit(ms){ clearTimeout(commitTimer); commitTimer = setTimeout(commitZoom, ms); }
function startMoving(){ clearTimeout(commitTimer); commitTimer = null; board.classList.add('moving'); }
function zoomAt(px, py, newS){
  const p = State.pan;
  newS = clamp(newS, MIN_SCALE, maxScale());
  const f = newS / p.s;
  p.tx = px - (px - p.tx) * f; p.ty = py - (py - p.ty) * f; p.s = newS;
  clampPan(); applyPan();
}
function onResize(){
  layoutSlots();
  if (!$('#gameScreen').hidden) setupBoard(false);
}

/* ================= input ================= */
const DRAG_THRESHOLD = 7, WHEEL_ZOOM = 0.0016;
const pointers = new Map();
let gesture = null;

function bindEvents(){
  boardWrap.addEventListener('pointerdown', onPointerDown);
  boardWrap.addEventListener('pointermove', onPointerMove);
  boardWrap.addEventListener('pointerup', onPointerUp);
  boardWrap.addEventListener('pointercancel', onPointerUp);
  boardWrap.addEventListener('wheel', onWheel, { passive:false });
  document.addEventListener('pointerdown', Sfx.unlock, { once:true });

  $('#playBtn').addEventListener('click', ()=> LEVELS.length && startGame(nextPlayable()));
  $('#levelsBtn').addEventListener('click', showLevels);
  $('#levelsBack').addEventListener('click', showMenu);
  $('#levelsHome').addEventListener('click', showMenu);
  $('#menuSettingsBtn').addEventListener('click', ()=> openSettings(false));
  $('#gameSettingsBtn').addEventListener('click', ()=> openSettings(true));
  $('#setHome').addEventListener('click', showMenu);
  $('#setAdmin').addEventListener('click', ()=> { syncAdminPick(); openModal('adminModal'); });
  $('#hintBtn').addEventListener('click', onHint);

  document.querySelectorAll('.modal').forEach(m=>{
    m.addEventListener('click', (e)=>{ if (e.target === m && !m.classList.contains('end-modal')) closeModals(); });
  });
  document.querySelectorAll('[data-close]').forEach(b=> b.addEventListener('click', closeModals));

  // admin
  $('#admRestart').addEventListener('click', ()=> startLevel(State.idx));
  $('#admReveal').addEventListener('click', ()=> { closeModals(); revealAll(); });
  $('#admSolve').addEventListener('click', ()=> { closeModals(); solveAll(); });
  $('#admSettings').addEventListener('click', ()=> openSettings(true));
  $('#admPrev').addEventListener('click', ()=> startLevel(State.idx - 1));
  $('#admNext').addEventListener('click', ()=> startLevel(State.idx + 1));
  $('#admPick').addEventListener('change', (e)=> startLevel(+e.target.value));
  $('#admBanner').addEventListener('click', ()=>{ save('hw_admin_banner', load('hw_admin_banner') === '1' ? '0' : '1'); syncBanner(); });
  syncBanner();
  $('#admMenuArt').addEventListener('click', ()=>{
    save('hw_menu_art', menuArt() === 'garden' ? 'storybook' : 'garden'); loadUiArt(['bg_menu']); syncMenuArt();
  });
  syncMenuArt();

  // settings
  $('#setHearts').addEventListener('click', ()=>{
    Settings.hearts = !Settings.hearts; saveSettings(); syncSettings();
    State.hearts = START_HEARTS; renderHearts();
  });
  $('#setSound').addEventListener('click', ()=>{ Settings.sound = !Settings.sound; saveSettings(); syncSettings(); });
  $('#resetBtn').addEventListener('click', ()=>{
    if (!confirm('Reset all progress?')) return;
    Progress.done = []; saveProgress();
    closeModals(); showMenu();
  });
  syncSettings();

  // end screens
  $('#winNext').addEventListener('click', ()=> startLevel(State.idx + 1 < LEVELS.length ? State.idx + 1 : 0));
  $('#winHome').addEventListener('click', showMenu);
  $('#loseRetry').addEventListener('click', ()=> startLevel(State.idx));
  $('#loseHome').addEventListener('click', showMenu);
}

/* in-game the settings popup also holds Main menu + Admin (the only way into the debug controls) */
function openSettings(inGame){
  $('#settingsModal').classList.toggle('in-game', inGame);
  openModal('settingsModal');
}
function openModal(id){
  document.querySelectorAll('.modal.show').forEach(m=> m.classList.remove('show'));
  $('#' + id).classList.add('show');
}
function closeModals(){ document.querySelectorAll('.modal.show').forEach(m=> m.classList.remove('show')); }

function syncSettings(){
  const h = $('#setHearts'), s = $('#setSound');
  h.classList.toggle('on', Settings.hearts); h.setAttribute('aria-checked', Settings.hearts);
  s.classList.toggle('on', Settings.sound);  s.setAttribute('aria-checked', Settings.sound);
}
/* admin: draw a grey 320x50 box in the reserved banner strip */
function syncBanner(){
  const on = load('hw_admin_banner') === '1';
  $('#adBanner').classList.toggle('show-box', on);
  $('#admBanner').textContent = `▭ Banner placeholder: ${on ? 'on' : 'off'}`;
}
function syncAdminPick(){
  const sel = $('#admPick');
  const test = window.HW_TEST_LEVELS || [], tags = window.HW_ADMIN_TAGS || {};
  const groupOf = s => (window.HW_LEVEL_GROUP ? window.HW_LEVEL_GROUP(s, true) : '');
  sel.innerHTML = ALL_LEVELS.map((s,i)=> `<option value="${i}">${i < LEVELS.length ? i+1 : '–'} · ${s}${
    groupOf(s) ? ` [${groupOf(s)}]` : ''}${test.includes(s) ? ' (test)' : ''}${tags[s] ? ` (${tags[s]})` : ''}</option>`).join('');
  sel.value = State.idx;
  // measured difficulty mix, filled in as the manifests arrive (cached)
  ALL_LEVELS.forEach((s, i)=> getManifest(s).then(man=>{
    const mix = diffMix(man), o = sel.options[i];
    if (mix && o && o.value === String(i) && !o.textContent.endsWith(' measured')) o.textContent += ` · ${mix}`;
  }).catch(()=>{}));
}

const wrapXY = (cx, cy)=>{ const r = boardWrap.getBoundingClientRect(); return { x: cx - r.left, y: cy - r.top }; };

function onPointerDown(e){
  if (e.isPrimary){ pointers.clear(); gesture = null; }
  try { boardWrap.setPointerCapture(e.pointerId); } catch(_){}
  pointers.set(e.pointerId, { x:e.clientX, y:e.clientY });
  boardWrap.classList.add('grabbing');
  if (pointers.size === 1){
    gesture = { mode:'press', startX:e.clientX, startY:e.clientY, startTx:State.pan.tx, startTy:State.pan.ty, moved:false };
  } else if (pointers.size === 2) beginPinch();
}
function beginPinch(){
  startMoving();
  const [a, b] = [...pointers.values()];
  const r = boardWrap.getBoundingClientRect();
  gesture = { mode:'pinch', prevDist: Math.hypot(a.x-b.x, a.y-b.y),
              prevMid: { x:(a.x+b.x)/2 - r.left, y:(a.y+b.y)/2 - r.top } };
}
function onPointerMove(e){
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x:e.clientX, y:e.clientY });
  if (!gesture) return;
  if (gesture.mode === 'pinch'){
    if (pointers.size < 2) return;
    const [a, b] = [...pointers.values()];
    const r = boardWrap.getBoundingClientRect();
    const dist = Math.hypot(a.x-b.x, a.y-b.y);
    const mid = { x:(a.x+b.x)/2 - r.left, y:(a.y+b.y)/2 - r.top };
    stopPanTween();
    zoomAt(mid.x, mid.y, State.pan.s * (dist / gesture.prevDist));
    State.pan.tx += mid.x - gesture.prevMid.x; State.pan.ty += mid.y - gesture.prevMid.y;
    clampPan(); applyPan();
    gesture.prevDist = dist; gesture.prevMid = mid;
    return;
  }
  const dx = e.clientX - gesture.startX, dy = e.clientY - gesture.startY;
  if (!gesture.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD){
    gesture.moved = true; gesture.mode = 'pan';
    stopPanTween(); startMoving();
    gesture.startTx = State.pan.tx - dx; gesture.startTy = State.pan.ty - dy;
  }
  if (gesture.moved){
    State.pan.tx = gesture.startTx + dx; State.pan.ty = gesture.startTy + dy;
    clampPan(); applyPan();
  }
}
function onPointerUp(e){
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (pointers.size === 0){ boardWrap.classList.remove('grabbing'); if (board.classList.contains('moving')) commitZoom(); }
  if (gesture && gesture.mode === 'pinch'){
    if (pointers.size === 1){
      const [pt] = [...pointers.values()];
      gesture = { mode:'pan', startX:pt.x, startY:pt.y, startTx:State.pan.tx, startTy:State.pan.ty, moved:true };
    } else gesture = null;
    return;
  }
  const wasTap = gesture && gesture.mode === 'press' && !gesture.moved;
  gesture = null;
  if (wasTap && pointers.size === 0) tapAt(e.clientX, e.clientY);
}
function onWheel(e){
  e.preventDefault();
  stopPanTween(); startMoving();
  const p = wrapXY(e.clientX, e.clientY);
  zoomAt(p.x, p.y, State.pan.s * Math.exp(-e.deltaY * WHEEL_ZOOM));
  scheduleCommit(180);
}

/* ================= tap ================= */
function tapAt(cx, cy){
  if (State.won || State.lost || !State.man) return;
  const rect = board.getBoundingClientRect();
  const bx = (cx - rect.left) / rect.width, by = (cy - rect.top) / rect.height;
  // the nearest unfound glyph within its tolerance wins (ties: the one drawn on top)
  let best = null, bestD = Infinity;
  for (const L of State.letters){
    if (L.found) continue;
    const d = glyphDist(L, bx, by);
    if (d <= tolCanvas(L, rect) && (d < bestD || (d === bestD && L.z > best.z))){ best = L; bestD = d; }
  }
  if (best){ foundLetter(best, cx, cy); return; }
  if (State.letters.some(L=> L.found && glyphDist(L, bx, by) <= tolCanvas(L, rect))) return;   // already found: nothing
  miss(cx, cy);
}
/* finger tolerance in canvas px: TOL_CANVAS (scaled to the canvas), at least TOL_SCREEN screen px, and wide enough
   that a small letter's hit area is MIN_TARGET screen px across its short side (50 px letters at 1x on a phone) */
function tolCanvas(L, rect){
  const cw = State.man.canvas.w, perScreen = cw / rect.width;          // canvas px per screen px
  const side = Math.min(L.box.w * rect.width, L.box.h * rect.height);  // glyph short side on screen
  const t = Math.max(TOL_CANVAS * cw / 1792, Math.max(TOL_SCREEN, (MIN_TARGET - side) / 2) * perScreen);
  return L.hit.ready ? Math.min(t, L.hit.P / L.hit.pxPerCanvas) : t;
}
/* distance in canvas px from a board point (0-1) to the letter's glyph (0 = on it) */
function glyphDist(L, bx, by){
  const b = L.box, h = L.hit;
  if (!h.ready) return (bx >= b.x && by >= b.y && bx <= b.x + b.w && by <= b.y + b.h) ? 0 : Infinity;
  const P = h.P, W = h.cw + 2 * P;
  const px = Math.floor((bx - b.x) / b.w * h.cw) + P, py = Math.floor((by - b.y) / b.h * h.ch) + P;
  if (px < 0 || py < 0 || px >= W || py >= h.ch + 2 * P) return Infinity;
  return h.dist[py * W + px] / h.pxPerCanvas;
}

/* ================= find ================= */
function foundLetter(L, cx, cy){
  const slot = State.slots.find(s=> s.ch === L.ch && !s.reserved) || State.slots.find(s=> !s.reserved);
  if (!slot) return;
  L.found = true; L.slot = slot; slot.reserved = true;
  const from = L.gEl.getBoundingClientRect();
  L.gEl.classList.remove('glow', 'hint');
  L.el.classList.add('found');            // the scene patch fades out in place, clean BG shows through
  burst(cx, cy);
  Sfx.find();
  State.found++;
  renderCounter(); bump(counter);
  comboFind(cx, cy);
  flyToSlot(L, from, slot);
  if (State.found >= State.total) win();
}

/* the cut-out lifts off the scene and flies into its slot; purely visual, input stays live */
function flyToSlot(L, from, slot){
  const token = State.token;
  const fr = frame.getBoundingClientRect();
  const to = slot.el.getBoundingClientRect();
  const fly = document.createElement('div');
  fly.className = 'fly';
  fly.style.left = (from.left - fr.left) + 'px'; fly.style.top = (from.top - fr.top) + 'px';
  fly.style.width = from.width + 'px'; fly.style.height = from.height + 'px';
  const img = document.createElement('img'); img.src = L.glyphSrc; img.draggable = false;
  fly.appendChild(img);
  fxLayer.appendChild(fly);

  const dx = (to.left + to.width/2) - (from.left + from.width/2);
  const dy = (to.top + to.height/2) - (from.top + from.height/2);
  const k = Math.min(to.width / from.width, to.height / from.height) * 0.9;
  const lift = Math.max(1.25, Math.min(3.5, 46 / Math.max(from.width, from.height)));   // tiny letters grow so they read
  const dur = 560 + Math.min(260, Math.hypot(dx, dy) * 0.35);
  const anim = fly.animate([
    { transform:'translate(0,0) scale(1)', offset:0, easing:'cubic-bezier(.2,.8,.3,1)' },
    { transform:`translate(0,-12px) scale(${lift})`, offset:.22, easing:'cubic-bezier(.55,0,.35,1)' },
    { transform:`translate(${dx}px,${dy}px) scale(${k})`, opacity:1, offset:.9 },
    { transform:`translate(${dx}px,${dy}px) scale(${k})`, opacity:0, offset:1 },
  ], { duration: dur, fill:'forwards' });
  const done = ()=>{ fly.remove(); if (token === State.token) fillSlot(slot); };
  anim.onfinish = done; anim.oncancel = ()=> fly.remove();
}

function fillSlot(slot){
  if (slot.filled) return;
  slot.filled = true;
  slot.el.querySelector('span').textContent = slot.ch;
  slot.el.classList.add('filled');
  bump(slot.el, 'land');
  Sfx.land();
  if (State.won && State.slots.every(s=> s.filled)) phraseComplete();
}

/* ================= miss ================= */
function miss(cx, cy){
  ripple(cx, cy);
  resetCombo();
  Sfx.miss();
  if (!Settings.hearts) return;
  State.hearts = Math.max(0, State.hearts - 1);
  renderHearts();
  const h = heartsEl.children[State.hearts];
  if (h) bump(h, 'pop');
  bump(heartsEl, 'shake');
  if (State.hearts <= 0) lose();
}

/* ================= combo (as in Waldo) ================= */
const COMBO_WORDS = [
  ['Nice', 'Great', 'Sharp eye', 'Spotted'],
  ['Excellent', 'Amazing', 'Brilliant', 'Super'],
  ['Incredible', 'Unstoppable', 'Legendary', 'Word wizard'],
];
const COMBO_COLORS = ['#fff6dc', '#ffe39a', '#ffc9a0', '#ffb3c1', '#d9c2ff', '#aef0e2'];
const recentWords = [];
function resetCombo(){ State.combo = 0; State.lastFindAt = -Infinity; }
function comboFind(cx, cy){
  const now = performance.now();
  if (now - State.lastFindAt > COMBO_WINDOW_MS) State.combo = 0;
  State.combo++; State.lastFindAt = now;
  if (State.combo >= COMBO_FIRST) showImpression(cx, cy);
}
function showImpression(cx, cy){
  const n = State.combo;
  const words = COMBO_WORDS[n >= 8 ? 2 : n >= 5 ? 1 : 0];
  const pool = words.filter(w=> !recentWords.includes(w));
  const word = pool[Math.floor(Math.random() * pool.length)] || words[0];
  recentWords.push(word); if (recentWords.length > 2) recentWords.shift();
  comboLayer.querySelectorAll('.impression').forEach(el=> el.remove());
  const el = document.createElement('div');
  el.className = 'impression';
  el.innerHTML = `${word}!<small>Combo ×${n}</small>`;
  const k = Math.min(n - COMBO_FIRST, 5);
  el.style.setProperty('--imp-color', COMBO_COLORS[k]);
  el.style.setProperty('--imp-size', 1 + k * .07);
  el.style.setProperty('--imp-tilt', `${(2 + k * .6) * (n % 2 ? -1 : 1)}deg`);
  comboLayer.appendChild(el);
  const lr = comboLayer.getBoundingClientRect(), br = boardWrap.getBoundingClientRect();
  const hw = el.offsetWidth * 1.15 / 2 + 8, hh = el.offsetHeight * 1.15 / 2 + 8;
  el.style.left = clamp(cx, br.left + hw, br.right - hw) - lr.left + 'px';
  el.style.top  = clamp(cy - 64, br.top + hh, br.bottom - hh) - lr.top + 'px';
  setTimeout(()=> el.remove(), 1150);
}

/* ================= hint ================= */
let panTween = null;
function stopPanTween(){
  if (!panTween) return;
  clearTimeout(panTween);
  panTween = null;
  // freeze where the tween currently is
  const m = new DOMMatrix(getComputedStyle(board).transform);
  board.style.transition = '';
  State.pan.s = m.a * layoutS; State.pan.tx = m.e; State.pan.ty = m.f;
  applyPan();
}
function onHint(){
  if (State.won || State.lost || !State.man) return;
  const left = State.letters.filter(L=> !L.found);
  if (!left.length) return;
  const L = left[Math.floor(Math.random() * left.length)];
  panToLetter(L);
  bump(L.gEl, 'hint');
  setTimeout(()=> L.gEl.classList.remove('hint'), 2100);
  const slot = State.slots.find(s=> s.ch === L.ch && !s.reserved);
  if (slot){ bump(slot.el, 'blink'); setTimeout(()=> slot.el.classList.remove('blink'), 2100); }
  Sfx.hint();
}
function panToLetter(L){
  const wv = boardWrap.clientWidth, hv = boardWrap.clientHeight;
  const b = L.box;
  const need = 52 / Math.max(b.h * State.bh, b.w * State.bw);   // letter at least ~52px on screen
  State.pan.s = clamp(Math.max(State.pan.s, need, 1.6), MIN_SCALE, maxScale());
  State.pan.tx = wv/2 - (b.x + b.w/2) * State.bw * State.pan.s;
  State.pan.ty = hv/2 - (b.y + b.h/2) * State.bh * State.pan.s;
  clampPan();
  startMoving();
  board.style.transition = 'transform .45s cubic-bezier(.4,.9,.3,1)';
  applyPan();
  clearTimeout(panTween);
  panTween = setTimeout(()=>{ board.style.transition = ''; panTween = null; commitZoom(); }, 470);
}

/* ================= admin aids ================= */
const DIFFS = ['easy', 'medium', 'hard'];
let revealTimer = null;
function revealAll(){
  if (!State.man) return;
  setupBoard(true);
  // measured difficulty (admin only): outline colour per letter + a tiny legend; levels without it: plain glow
  const has = State.letters.some(L=> DIFFS.includes(L.diff));
  State.letters.forEach(L=>{
    if (L.found) return;
    L.gEl.classList.add('glow');
    if (DIFFS.includes(L.diff)) L.gEl.classList.add('d-' + L.diff);
  });
  const lg = $('#diffLegend');
  if (has){
    const n = d => State.letters.filter(L=> L.diff === d).length;
    lg.innerHTML = DIFFS.map(d=> `<span class="dl-${d}"><i></i>${d} ${n(d)}</span>`).join('');
    lg.hidden = false;
  } else lg.hidden = true;
  clearTimeout(revealTimer);
  revealTimer = setTimeout(endReveal, REVEAL_MS);
}
function endReveal(){
  clearTimeout(revealTimer); revealTimer = null;
  $('#diffLegend').hidden = true;
  State.letters.forEach(L=> L.gEl.classList.remove('glow', ...DIFFS.map(d=> 'd-' + d)));
}
/* "2/6/6 measured" (easy/medium/hard) from the manifest, '' when the level has no difficulty */
function diffMix(man){
  const ls = man.letters || [];
  if (!ls.some(L=> DIFFS.includes(L.diff))) return '';
  return DIFFS.map(d=> ls.filter(L=> L.diff === d).length).join('/') + ' measured';
}
function solveAll(){
  const token = State.token;
  State.letters.filter(L=> !L.found).forEach((L, k)=>{
    setTimeout(()=>{
      if (token !== State.token || L.found || State.lost) return;
      const r = L.gEl.getBoundingClientRect();
      foundLetter(L, r.left + r.width/2, r.top + r.height/2);
    }, k * 90);
  });
}

/* ================= win / lose ================= */
function win(){
  State.won = true;
  const slug = State.slug;
  if (State.idx < LEVELS.length && !Progress.done.includes(slug)) Progress.done.push(slug);
  saveProgress();
  if (State.slots.every(s=> s.filled)) phraseComplete();   // (normally the last landing calls it)
}
function phraseComplete(){
  const token = State.token;
  State.slots.forEach((s, k)=> s.el.style.setProperty('--k', k * 45));
  phrasePanel.classList.add('glow');
  Sfx.win();
  setTimeout(()=>{ if (token === State.token) showWin(); }, 1300);
}
function showWin(){
  const m = State.man;
  const sc = document.querySelector('.end-scene');
  sc.style.aspectRatio = `${m.canvas.w} / ${m.canvas.h}`;
  sc.innerHTML = `<img src="${State.base}bg.jpg" alt="" draggable="false">` + State.letters.map(L=>
    `<div class="end-letter" style="left:${pct(L.x)};top:${pct(L.y)};width:${pct(L.w)};height:${pct(L.h)}">
       <img src="${State.base + L.file}" alt="" draggable="false"></div>`).join('') + State.letters.map(L=>
    `<div class="end-ring" style="left:${pct(L.box.x)};top:${pct(L.box.y)};width:${pct(L.box.w)};height:${pct(L.box.h)}"></div>`).join('');
  $('#winPhrase').textContent = m.phrase;
  $('#winNext').textContent = 'Next Level';
  openModal('winModal');
}
function lose(){
  State.lost = true;
  $('#loseSub').textContent = `You found ${State.found} of ${State.total} letters.`;
  const token = State.token;
  setTimeout(()=>{ if (token === State.token) openModal('loseModal'); }, 450);
}

/* ================= fx ================= */
function fxAt(cls, cx, cy, ms){
  const fr = frame.getBoundingClientRect();
  const d = document.createElement('div'); d.className = cls;
  d.style.left = (cx - fr.left) + 'px'; d.style.top = (cy - fr.top) + 'px';
  fxLayer.appendChild(d);
  setTimeout(()=> d.remove(), ms);
}
const ripple = (cx, cy)=> fxAt('ripple miss', cx, cy, 520);
const burst  = (cx, cy)=> fxAt('burst', cx, cy, 520);

/* ================= sound (tiny synth, no files) ================= */
const Sfx = (()=>{
  let ac = null;
  const unlock = ()=>{ try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); ac.resume(); } catch(_){} };
  function tone(freq, dur, type='sine', vol=.12, delay=0, slide=0){
    if (!Settings.sound || !ac) return;
    const t = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + .012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ac.destination);
    o.start(t); o.stop(t + dur + .02);
  }
  return {
    unlock,
    find(){ tone(660, .12, 'triangle', .12, 0, 1.5); },
    land(){ tone(990, .09, 'sine', .07); },
    miss(){ tone(180, .16, 'sine', .10, 0, .7); },
    hint(){ tone(520, .18, 'sine', .07, 0, 1.3); },
    win(){ [523, 659, 784, 1047].forEach((f,k)=> tone(f, .22, 'triangle', .1, k * .11)); },
  };
})();

init();
