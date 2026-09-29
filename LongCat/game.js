// Long Dog — screens, input, animation. Logic: engine.js · board: render.js · dog: dog.js (+ art.js)
(() => {
const E = window.LongCatEngine, R = window.LongCatRender, D = window.LongDog, LEVELS = window.LEVELS;
const $ = id => document.getElementById(id);

// ---------- saves (per-browser convenience) ----------
const SAVE = 'longdog.v1';
let prog = { stars: {} };
try { prog = JSON.parse(localStorage.getItem(SAVE)) || prog; } catch (e) {}
const saveProg = () => { try { localStorage.setItem(SAVE, JSON.stringify(prog)); } catch (e) {} };
const pref = (k, d) => { try { return localStorage.getItem('longdog.' + k) ?? d; } catch (e) { return d; } };
const setPref = (k, v) => { try { localStorage.setItem('longdog.' + k, v); } catch (e) {} };
let soundOn = pref('sound', 'on') !== 'off', depth = pref('depth', 'soft');

// ---------- audio + haptics ----------
let ac = null;
function audio() { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (ac && ac.state === 'suspended') ac.resume(); return ac; }
function tone(f0, f1, dur, type = 'sine', vol = .2, delay = 0) {
  if (!soundOn) return; const a = audio(); if (!a) return;
  const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + .02);
}
const SFX = {
  slide: n => tone(300, 300 + n * 45, .06 + n * .018, 'triangle', .07),
  bonk: n => tone(260 + Math.min(n, 8) * 22, 150, .1, 'sine', .28),
  undo: () => tone(520, 300, .09, 'triangle', .12),
  win: () => [659, 784, 988, 1318].forEach((f, i) => tone(f, f, .16, 'triangle', .18, i * .08)),
  stuck: () => { tone(640, 420, .16, 'sine', .18); tone(470, 300, .3, 'sine', .16, .16); },
  rewind: () => tone(900, 250, .35, 'triangle', .1),
  hint: () => tone(880, 1320, .12, 'triangle', .12),
};
const buzz = ms => { try { if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(ms); } catch (e) {} };

// ---------- menus ----------
if (window.DOG_ART && DOG_ART.logo) $('logo').innerHTML = `<img src="${DOG_ART.logo}" alt="Puppy Maze">`;
function show(id) {
  if (id !== 'game' && location.hash) history.replaceState(null, '', location.pathname + location.search);
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === id));
  if (id === 'map') home.start(); else home.stop();
  if (id === 'game') kick();
}
const thumbs = {};
function thumb(i) {
  if (thumbs[i]) return thumbs[i];
  const L = E.parse(LEVELS[i]), s = 8, cv = document.createElement('canvas');
  cv.width = L.W * s + 4; cv.height = L.H * s + 4; const g = cv.getContext('2d');
  g.fillStyle = R.wallTheme(i).top; g.beginPath(); g.roundRect(0, 0, cv.width, cv.height, 5); g.fill();
  for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) if (L.open[y * L.W + x]) {
    g.fillStyle = y * L.W + x === L.start ? '#c9692e' : '#fff1d9'; g.fillRect(2 + x * s, 2 + y * s, s - 1, s - 1);
  }
  return thumbs[i] = cv.toDataURL();
}
function renderMenus() {
  const total = LEVELS.reduce((n, _, i) => n + (prog.stars[i] || 0), 0);
  const done = LEVELS.filter((_, i) => prog.stars[i] > 0).length;
  const firstOpen = LEVELS.findIndex((_, i) => !prog.stars[i]), next = firstOpen < 0 ? 0 : firstOpen;
  $('totalStars').textContent = total;
  $('mapProgress').textContent = `${done} / ${LEVELS.length} bölüm`;
  $('bContinue').innerHTML = '<strong>OYNA</strong>';
  $('bContinue').onclick = () => { audio(); start(next); };
  const box = $('levels'); box.innerHTML = '';
  LEVELS.forEach((lv, i) => {
    const st = prog.stars[i] || 0, b = document.createElement('button');
    b.className = 'lvl' + (i === firstOpen ? ' next' : '') + (lv.hard ? ' hard' : '');
    b.setAttribute('aria-label', `Bölüm ${i + 1}: ${lv.name}, ${st} yıldız${lv.hard ? ', zor' : ''}`);
    b.innerHTML = `<div class="level-art"><img src="${thumb(i)}" alt=""><div class="n">${String(i + 1).padStart(2, '0')}</div></div><div class="nm">${lv.name}</div><div class="st" aria-hidden="true">${'<b>★</b>'.repeat(st)}${'★'.repeat(3 - st)}</div>`;
    b.onclick = () => { audio(); start(i); }; box.appendChild(b);
  });
}
$('bLevels').onclick = () => { renderMenus(); show('levelSelect'); };
$('bLevelsBack').onclick = () => show('map');
$('bMap').onclick = () => { renderMenus(); show('map'); };
const openSettings = () => { $('settings').hidden = false; }, closeSettings = () => { $('settings').hidden = true; };
$('bSettings').onclick = openSettings; $('bSettingsClose').onclick = closeSettings;
$('settings').addEventListener('click', e => { if (e.target === $('settings')) closeSettings(); });
function settingsUI() {
  $('soundState').textContent = soundOn ? 'AÇIK' : 'KAPALI'; $('bSound').setAttribute('aria-pressed', String(soundOn));
  $('depthState').textContent = depth === 'flat' ? 'DÜZ' : 'DERİNLİKLİ'; $('bDepth').setAttribute('aria-pressed', String(depth !== 'flat'));
}
$('bSound').onclick = () => { soundOn = !soundOn; setPref('sound', soundOn ? 'on' : 'off'); settingsUI(); };
$('bDepth').onclick = () => { depth = depth === 'flat' ? 'soft' : 'flat'; setPref('depth', depth); settingsUI(); home.rebake(); if (L) resize(); };
$('bReset').onclick = () => { if (!confirm('Tüm yıldızlar silinsin mi?')) return; prog = { stars: {} }; saveProg(); renderMenus(); };
settingsUI();

// ---------- game state ----------
const cv = $('cv'), ctx = cv.getContext('2d');
const headCv = document.createElement('canvas'), hctx = headCv.getContext('2d');
let idx = 0, lv = null, L = null, S = null, st = null, lay = null, board = null, dpr = 1;
let anim = null, rewind = null, queued = null, over = false, attempt = null;
let mood = 'idle', fx = D.newFace(), lastDir = [0, 1], squashAt = -1e9, bonkLen = 0, lastT = 0;
let particles = [], trail = [], hint = null, tipTimer = 0, failTimer = 0;

function start(i) {
  if (!LEVELS[i]) return;
  idx = i; lv = LEVELS[i]; L = E.parse(lv); S = E.makeSolver(L);
  attempt = { hints: 0, undos: 0, fails: 0, restarts: 0 };
  $('lvlNo').innerHTML = `BÖLÜM ${i + 1}${lv.hard ? '<span class="tag">ZOR</span>' : ''}`;
  $('lvlName').textContent = lv.name;
  history.replaceState(null, '', '#' + (i + 1));
  reset();
  show('game'); resize();
  tip(lv.tip || '', lv.tip ? 4200 : 0);
  if (i === 0) setTimeout(() => { if (idx === 0 && !st.moves.length) showHint(true); }, 700);
}
function reset() { // fresh board for the current level
  clearTimeout(failTimer);
  st = E.newState(L); anim = null; rewind = null; queued = null; over = false; particles = []; trail = []; hint = null;
  mood = 'idle'; fx = D.newFace(); lastDir = tailDir().map(v => -v);
  $('result').classList.remove('on'); hud(); kick();
}
function restart() { if (!L || rewind) return; attempt.restarts++; reset(); }
function tailDir() { // the tail points at a solid side of the start cell
  const x = L.start % L.W, y = (L.start / L.W) | 0;
  for (const d of ['down', 'left', 'right', 'up']) {
    const [dx, dy] = E.DIRS[d], nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= L.W || ny >= L.H || !L.open[ny * L.W + nx]) return [dx, dy];
  }
  return [0, 1];
}
function hud() {
  $('progressFill').style.width = (st.count / L.floor * 100).toFixed(1) + '%';
}
function tip(text, ms) {
  clearTimeout(tipTimer); const t = $('tip');
  if (!text) { t.classList.remove('on'); return; }
  t.textContent = text; t.classList.add('on');
  if (ms) tipTimer = setTimeout(() => t.classList.remove('on'), ms);
}

// ---------- layout ----------
function resize() {
  if (!L) return;
  const r = $('stage').getBoundingClientRect(); if (!r.width) return;
  dpr = Math.min(2.5, window.devicePixelRatio || 1);
  cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
  lay = R.layout(L, r.width, r.height);
  board = R.bakeBoard(L, lay, dpr, depth, idx);
  const hs = Math.ceil(lay.cell * 2.6 * dpr); headCv.width = headCv.height = hs;
  kick();
}
addEventListener('resize', () => { resize(); home.resize(); });
const center = i => ({ x: lay.ox + (i % L.W + 0.5) * lay.cell, y: lay.oy + (((i / L.W) | 0) + 0.5) * lay.cell });

// ---------- input ----------
const SLIDE_SPEED = 0.6; // 1 = the first prototype's pace (~33 cells/s); 0.8 = 80% of it
function input(dir) {
  if (!L || over || !$('game').classList.contains('on')) return;
  audio();
  if (anim) { queued = dir; return; }
  const cells = E.slide(L, st.filled, st.head, dir);
  const [dx, dy] = E.DIRS[dir];
  if (!cells.length) { // blocked: a small nudge of the head, never the screen
    lastDir = [dx, dy]; squashAt = performance.now() - 60; bonkLen = 0; D.trigger(fx, 'squish', .12); kick(); return;
  }
  const from = center(st.head);
  E.apply(L, st, dir);
  hint = null; lastDir = [dx, dy]; mood = 'slide';
  if (cells.length >= 5) D.trigger(fx, 'surprise', .2);
  anim = { dir, cells, from, t0: performance.now(), dur: (50 + cells.length * 30) / SLIDE_SPEED, undo: false };
  SFX.slide(cells.length);
  if (lv.tip && st.moves.length >= 2) tip('');
  hud(); kick();
}
function undo() {
  if (!L || anim || over || !st.moves.length) return;
  audio();
  const m = E.undo(L, st);
  attempt.undos++; hint = null; mood = 'idle';
  anim = { dir: m.dir, cells: m.cells, from: center(st.head), t0: performance.now(), dur: 40 + m.cells.length * 16, undo: true };
  SFX.undo(); hud(); kick();
}
function showHint(auto) {
  if (!L || over || anim) return;
  const d = S.hint(st);
  if (!auto) { attempt.hints++; SFX.hint(); }
  if (d) hint = { dir: d, cells: E.slide(L, st.filled, st.head, d), until: performance.now() + 2600 };
  else { tip('Bu yoldan çıkış yok — baştan dene.', 2600); $('bRestart').classList.remove('nudge'); void $('bRestart').offsetWidth; $('bRestart').classList.add('nudge'); }
  kick();
}
$('bHint').onclick = () => showHint(false);
$('bRestart').onclick = () => { audio(); restart(); };
$('rRetry').onclick = restart;
$('rNext').onclick = () => { if (idx + 1 < LEVELS.length) start(idx + 1); else { renderMenus(); show('levelSelect'); } };

const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('settings').hidden) { closeSettings(); return; }
  if (!$('game').classList.contains('on')) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (KEYS[k]) { e.preventDefault(); input(KEYS[k]); }
  else if (k === 'z' || k === 'Backspace') undo();
  else if (k === 'r') restart();
  else if (k === 'h') showHint(false);
});
let touch = null;
cv.addEventListener('pointerdown', e => { touch = { x: e.clientX, y: e.clientY, used: false }; cv.setPointerCapture?.(e.pointerId); });
cv.addEventListener('pointermove', e => {
  if (!touch || touch.used) return;
  const dx = e.clientX - touch.x, dy = e.clientY - touch.y;
  if (Math.hypot(dx, dy) < 18) return;
  touch.used = true;
  input(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
});
const endTouch = () => { touch = null; };
cv.addEventListener('pointerup', endTouch); cv.addEventListener('pointercancel', endTouch);

// ---------- frame loop (runs while the game screen is up; the face is always alive) ----------
let raf = 0;
function kick() { if (!raf) raf = requestAnimationFrame(frame); }
function frame(now) { raf = 0; if (!$('game').classList.contains('on')) return; draw(now); kick(); }

function finishAnim(now) {
  const a = anim; anim = null;
  if (!a.undo) {
    squashAt = now; bonkLen = a.cells.length; D.trigger(fx, 'squish', .16); mood = 'idle';
    SFX.bonk(a.cells.length); buzz(8);
    const h = center(st.head), [dx, dy] = E.DIRS[a.dir];
    for (let k = 0; k < 6; k++) {
      const sp = (Math.random() - .5) * 1.6;
      particles.push({ x: h.x + dx * lay.cell * .48, y: h.y + dy * lay.cell * .48, vx: (-dx * .5 + dy * sp) * lay.cell * 2.2, vy: (-dy * .5 + dx * sp) * lay.cell * 2.2, t0: now, life: 260, r: lay.cell * (.07 + Math.random() * .06), kind: 'dust' });
    }
    if (E.won(L, st)) win(now);
    else if (E.stuck(L, st)) fail(now);
  } else mood = 'idle';
  hud();
  if (queued && !over) { const q = queued; queued = null; input(q); } else queued = null;
}
function win(now) {
  over = true; mood = 'happy'; SFX.win(); hud();
  bodyPoints(null).forEach((p, i) => { for (let k = 0; k < 2; k++) particles.push({ x: p.x, y: p.y, vx: (Math.random() - .5) * lay.cell * 3, vy: -lay.cell * (1.5 + Math.random() * 2), t0: now + i * 45, life: 700, r: lay.cell * .16, kind: 'star', rot: Math.random() * 6 }); });
  const stars = !attempt.hints && !attempt.undos && !attempt.fails ? 3 : !attempt.hints ? 2 : 1;
  prog.stars[idx] = Math.max(prog.stars[idx] || 0, stars); saveProg();
  setTimeout(() => card(stars), 750);
}
// Stuck = fail, and a fail always restarts: sad face, the dog rewinds to its start, fresh board.
function fail(now) {
  over = true; mood = 'dead'; attempt.fails++; SFX.stuck(); buzz([20, 40, 20]); hud();
  failTimer = setTimeout(() => {
    rewind = { t0: performance.now(), dur: 280 + st.moves.length * 25, pts: bodyPoints(null) }; SFX.rewind(); kick();
  }, 950);
}
function card(stars) {
  $('rTitle').textContent = ['', 'Bitti!', 'Harika!', 'Kusursuz!'][stars];
  $('rStars').innerHTML = '<b>★</b>'.repeat(stars) + '★'.repeat(3 - stars);
  $('rNote').textContent = stars === 3 ? 'İpucusuz, geri almadan.' : stars === 2 ? '★★★ için geri almadan bitir.' : '★★ için ipucusuz bitir.';
  $('rNext').textContent = idx + 1 < LEVELS.length ? 'Sonraki ›' : 'Bölümler ›';
  const f = $('rFace'), g = f.getContext('2d'); g.clearRect(0, 0, f.width, f.height);
  D.drawHead(g, f.width / 2, f.height * .55, f.height * .72, { fx: D.newFace(), state: 'happy', t: .1 });
  $('result').classList.add('on');
}

// polyline tail → head; `a` = current animation (partial last segment)
function bodyPoints(a, p = 1) {
  const pts = [center(L.start)];
  const moves = st.moves, n = a && !a.undo ? moves.length - 1 : moves.length;
  for (let i = 0; i < n; i++) pts.push(center(moves[i].cells.at(-1)));
  if (a) {
    const end = center(a.cells.at(-1)), from = a.from, k = a.undo ? 1 - p : p;
    pts.push({ x: from.x + (end.x - from.x) * k, y: from.y + (end.y - from.y) * k });
  }
  return pts;
}
function truncate(pts, keep) { // first `keep` px of a polyline
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], len = Math.hypot(b.x - a.x, b.y - a.y);
    if (keep >= len) { out.push(b); keep -= len; continue; }
    out.push({ x: a.x + (b.x - a.x) * keep / len, y: a.y + (b.y - a.y) * keep / len }); break;
  }
  return out;
}
const polyLen = pts => pts.reduce((s, p, i) => i ? s + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : 0, 0);

function draw(now) {
  if (!lay) return;
  const dt = Math.min(.05, (now - (lastT || now)) / 1000); lastT = now;
  const c = lay.cell;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.drawImage(board, 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // paws on empty floor (all of them while rewinding — the body covers the rest)
  const pending = anim ? new Set(anim.cells) : null;
  for (let i = 0; i < L.open.length; i++) {
    if (!L.open[i] || (!rewind && st.filled[i] && !(pending && pending.has(i)))) continue;
    const p = center(i); R.paw(ctx, p.x, p.y, c * .42, R.PAL.paw);
  }
  if (hint && now > hint.until) hint = null;
  if (hint) {
    ctx.globalAlpha = .35 + .2 * Math.sin(now / 120); ctx.fillStyle = R.PAL.hint;
    for (const i of hint.cells) { const p = center(i); ctx.beginPath(); ctx.arc(p.x, p.y, c * .2, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  let p = 1, pts;
  if (anim) { const u = Math.min(1, (now - anim.t0) / anim.dur); p = anim.undo ? u : 1 - (1 - u) * (1 - u); }
  if (rewind) {
    const u = Math.min(1, (now - rewind.t0) / rewind.dur), k = u * u * (3 - 2 * u);
    pts = truncate(rewind.pts, polyLen(rewind.pts) * (1 - k));
    if (u >= 1) { reset(); tip('Sıkıştın — baştan!', 1400); pts = bodyPoints(null); }
  } else pts = bodyPoints(anim, p);
  const head = pts.at(-1);

  // face
  const sliding = anim && !anim.undo;
  // worried when cornered: one way out, and it is short
  const ways = !anim && !over && st.moves.length ? E.legal(L, st.filled, st.head) : null;
  const cornered = ways && ways.length === 1 && E.slide(L, st.filled, st.head, ways[0]).length <= 2;
  D.stepFace(fx, dt, { state: mood, look: lastDir, hint: hint && E.DIRS[hint.dir], worried: cornered });
  const sqT = (now - squashAt) / 170, squash = sqT >= 0 && sqT < 1 ? Math.sin(sqT * Math.PI) * (1 - sqT) * (bonkLen ? Math.min(1, .45 + bonkLen * .08) : .35) : 0;

  // motion blur: faded copies of the head along the path it just travelled
  for (const g of trail) g.life -= dt;
  trail = trail.filter(g => g.life > 0);
  if (sliding || rewind) trail.push({ x: head.x, y: head.y, life: .1 });

  D.drawBody(ctx, pts, c, { tailDir: tailDir(), depth, state: mood, t: now / 1000 });
  // head → bitmap once, then blit ghosts + head
  const hs = headCv.width; hctx.setTransform(1, 0, 0, 1, 0, 0); hctx.clearRect(0, 0, hs, hs); hctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  D.drawHead(hctx, hs / dpr / 2, hs / dpr / 2, c, { fx, state: mood, dir: lastDir, squash, stretch: sliding ? .07 : 0, t: now / 1000 });
  const blit = (x, y) => ctx.drawImage(headCv, x - hs / dpr / 2, y - hs / dpr / 2, hs / dpr, hs / dpr);
  trail.forEach((g, i) => { ctx.globalAlpha = .28 * (g.life / .1) * ((i + 1) / trail.length); blit(g.x, g.y); });
  ctx.globalAlpha = 1; blit(head.x, head.y);
  if (hint) R.arrow(ctx, head.x, head.y, E.DIRS[hint.dir], c, now / 1000);

  // particles
  particles = particles.filter(q => now - q.t0 < q.life);
  for (const q of particles) {
    const t = (now - q.t0) / 1000; if (t < 0) continue;
    const k = (now - q.t0) / q.life, x = q.x + q.vx * t, y = q.y + q.vy * t + (q.kind === 'star' ? 600 * t * t : 0);
    ctx.globalAlpha = 1 - k;
    if (q.kind === 'dust') { ctx.fillStyle = '#fff8ea'; ctx.beginPath(); ctx.arc(x, y, q.r * (1 + k), 0, Math.PI * 2); ctx.fill(); }
    else { ctx.fillStyle = '#ffd45e'; ctx.save(); ctx.translate(x, y); ctx.rotate(q.rot + t * 5); star(ctx, q.r); ctx.fill(); ctx.restore(); }
  }
  ctx.globalAlpha = 1;
  if (anim && now - anim.t0 >= anim.dur) finishAnim(now);
}
function star(g, r) { g.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? r * .45 : r; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); }

// ---------- home scene: the dog solves the 4×4 spiral on a loop ----------
const home = (() => {
  const hc = $('homeCv'), hg = hc.getContext('2d');
  const demo = LEVELS.find(l => l.name === 'Kendi kuyruğun') || LEVELS[2];
  let HL, hs, hlay, hboard, hdpr = 1, plan = [], step = 0, t0 = 0, on = false, raf = 0, phase = 'wait', from = null, hfx = D.newFace(), last = 0;
  function resize() {
    const r = hc.getBoundingClientRect(); if (!r.width) return;
    hdpr = Math.min(2.5, devicePixelRatio || 1); hc.width = r.width * hdpr; hc.height = r.height * hdpr;
    HL = E.parse(demo); hlay = R.layout(HL, r.width, r.height, 48); hboard = R.bakeBoard(HL, hlay, hdpr, depth, LEVELS.indexOf(demo));
  }
  function reset(now = performance.now()) { HL = HL || E.parse(demo); hs = E.newState(HL); plan = E.analyse(demo).solution; step = 0; phase = 'wait'; t0 = now; hfx = D.newFace(); }
  const cen = i => ({ x: hlay.ox + (i % HL.W + .5) * hlay.cell, y: hlay.oy + (((i / HL.W) | 0) + .5) * hlay.cell });
  const dur = () => 180 + hs.moves.at(-1).cells.length * 95;
  function frame(now) {
    raf = 0; if (!on) return;
    if (!hboard) resize(); if (!hboard) { raf = requestAnimationFrame(frame); return; }
    const dt = Math.min(.05, (now - (last || now)) / 1000); last = now;
    let el = now - t0;
    if (phase === 'wait' && el > 620) {
      if (step < plan.length) { from = hs.head; E.apply(HL, hs, plan[step++]); phase = 'move'; t0 = now; }
      else if (el > 2000) { phase = 'rewind'; t0 = now; }
    } else if (phase === 'move' && el >= dur()) { phase = 'wait'; t0 = now; D.trigger(hfx, 'squish', .14); }
    else if (phase === 'rewind' && el >= 1000) reset(now);
    // A transition changes the time origin. Never use the previous phase's elapsed time.
    el = Math.max(0, now - t0);
    hg.setTransform(1, 0, 0, 1, 0, 0); hg.clearRect(0, 0, hc.width, hc.height); hg.drawImage(hboard, 0, 0); hg.setTransform(hdpr, 0, 0, hdpr, 0, 0);
    const pending = phase === 'move' ? new Set(hs.moves.at(-1).cells) : null;
    for (let i = 0; i < HL.open.length; i++) if (HL.open[i] && (phase === 'rewind' || !hs.filled[i] || pending?.has(i))) { const p = cen(i); R.paw(hg, p.x, p.y, hlay.cell * .42, R.PAL.paw); }
    let pts = [cen(HL.start)]; const mv = hs.moves, moving = phase === 'move';
    for (let i = 0; i < mv.length - (moving ? 1 : 0); i++) pts.push(cen(mv[i].cells.at(-1)));
    let dir = [0, 1];
    if (moving) { const a = mv.at(-1), e = cen(a.cells.at(-1)), f = cen(from), u = Math.min(1, el / dur()), k = u * u * (3 - 2 * u); pts.push({ x: f.x + (e.x - f.x) * k, y: f.y + (e.y - f.y) * k }); dir = E.DIRS[a.dir]; }
    else if (mv.length) dir = E.DIRS[mv.at(-1).dir];
    if (phase === 'rewind') { const u = Math.min(1, el / 1000); pts = truncate(pts, polyLen(pts) * (1 - u * u * (3 - 2 * u))); }
    const state = phase === 'rewind' ? 'idle' : E.won(HL, hs) && !moving ? 'happy' : moving ? 'slide' : 'idle';
    D.stepFace(hfx, dt, { state, look: dir });
    const sq = phase === 'wait' && el < 170 && mv.length ? Math.sin(el / 170 * Math.PI) * .5 * (1 - el / 170) : 0;
    D.drawDog(hg, pts, hlay.cell, { fx: hfx, dir, state, squash: sq, stretch: moving ? .07 : 0, t: now / 1000, tailDir: [0, -1], depth });
    raf = requestAnimationFrame(frame);
  }
  return {
    start() { if (on) return; on = true; last = 0; resize(); reset(); raf = requestAnimationFrame(frame); },
    stop() { on = false; if (raf) cancelAnimationFrame(raf); raf = 0; },
    resize() { if (on) resize(); },
    rebake() { hboard = null; },
  };
})();

// ---------- debug / playtest hooks ----------
window.LongDogGame = {
  start, undo, restart, input, state: () => ({ idx, head: st && st.head, count: st && st.count, floor: L && L.floor, over, mood, rewinding: !!rewind }),
  solve: () => S && S.hint(st), tick: () => draw(performance.now()),
};

Promise.all([D.load(), R.load()]).then(() => { home.rebake(); if (L) resize(); kick(); });
renderMenus();
function fromHash() {
  const n = parseInt(location.hash.slice(1), 10);
  if (n >= 1 && n <= LEVELS.length) { if (!(L && idx === n - 1 && $('game').classList.contains('on'))) start(n - 1); return true; }
  return false;
}
addEventListener('hashchange', fromHash);
if (!fromHash()) show('map');
})();
