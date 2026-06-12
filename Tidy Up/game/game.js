/* Tidy Up — a hidden-object playable.
 * Find every hidden item in the messy room and tap it; it flies into the tray.
 * Tray order mirrors the PSB stack: top-of-stack = left-most slot. Each item is
 * its own "single" (object h + nestled shadow s); some belong to a "multiple"
 * cluster that shares one common shadow (ss) which only lifts once the whole
 * cluster is gathered. Misclicks cost one of 3 hearts. */

const LEVEL = "level1";
const ALPHA_HIT = 12;          // min alpha (0-255) that counts as a solid pixel
const TAP_MOVE = 8;            // px of movement that turns a tap into a drag
const ZOOM_MAX = 1.0;         // never scale the board PAST native px (1:1) -> always crisp

const $ = (id) => document.getElementById(id);
const board = $("board"), boardWrap = $("boardWrap"), tray = $("tray");

let M = null;                  // manifest
let items = [];                // {id, h, s, group, el:{h,s}, alpha, slot, found}
let groups = [];               // {id, ss, members, el, lifted}
let foundCount = 0, hearts = 3, locked = false, soundOn = true;
let INF_HEALTH = localStorage.getItem('tidyup_infhealth') === '1';   // infinite-health cheat (Settings)
let mode = "v1";   // v1 = tray shows silhouettes, v2 = tray shows full items

/* ---------- boot ---------- */
(async function boot() {
  M = await (await fetch(`assets/${LEVEL}/manifest.json`)).json();
  $("bg").src = `assets/${LEVEL}/bg.jpg`;
  $("total").textContent = M.total;
  buildBoard();
  buildTray();
  layout();
  wireInput();
  wireUI();
  window.addEventListener("resize", layout);
  setTimeout(() => $("hintPill").classList.add("hide"), 4200);
})();

/* ---------- build scene ---------- */
function buildBoard() {
  // collect every sprite (bg excluded — it's the static <img class=bg>)
  const sprites = [];
  groups = M.groups.map((g) => {
    const rec = { id: g.id, members: g.members.slice(), lifted: false, el: null };
    if (g.ss) sprites.push({ kind: "ss", z: g.ss.z, box: g.ss.box, file: g.ss.file, ref: rec });
    return rec;
  });
  items = M.items.map((it) => {
    const rec = { id: it.id, group: it.group, found: false, el: {}, alpha: null,
                  box: it.h.box, slot: null };
    if (it.s) sprites.push({ kind: "s", z: it.s.z, box: it.s.box, file: it.s.file, ref: rec });
    sprites.push({ kind: "h", z: it.h.z, box: it.h.box, file: it.h.file, ref: rec });
    return rec;
  });

  sprites.sort((a, b) => a.z - b.z);
  for (const sp of sprites) {
    const img = document.createElement("img");
    img.className = "sprite";
    img.src = `assets/${LEVEL}/${sp.file}`;
    img.draggable = false;
    img.style.left = pct(sp.box.x); img.style.top = pct(sp.box.y);
    img.style.width = pct(sp.box.w); img.style.height = pct(sp.box.h);
    img.style.zIndex = sp.z + 1;
    board.appendChild(img);
    if (sp.kind === "ss") sp.ref.el = img;
    else if (sp.kind === "s") sp.ref.el.s = img;
    else { sp.ref.el.h = img; buildAlpha(sp.ref, img); }
  }
}

// offscreen alpha map for precise (transparent-aware) hit testing
function buildAlpha(item, img) {
  const make = () => {
    const maxw = 240;
    const sc = Math.min(1, maxw / img.naturalWidth);
    const w = Math.max(1, Math.round(img.naturalWidth * sc));
    const h = Math.max(1, Math.round(img.naturalHeight * sc));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);
    item.alpha = { data: ctx.getImageData(0, 0, w, h).data, w, h };
  };
  if (img.complete && img.naturalWidth) make();
  else img.addEventListener("load", make, { once: true });
}

function buildTray() {
  tray.innerHTML = "";
  for (const it of items) {            // items are already in tray order (id 0 = left)
    const slot = document.createElement("div");
    slot.className = "slot";
    const img = document.createElement("img");
    img.src = `assets/${LEVEL}/${M.items[it.id].h.file}`;
    img.draggable = false;
    slot.appendChild(img);
    tray.appendChild(slot);
    it.slot = slot;
  }
  // hearts
  const hc = $("hearts"); hc.innerHTML = "";
  for (let i = 0; i < 3; i++) {
    const h = document.createElement("div");
    h.className = "heart"; h.textContent = "❤️";
    hc.appendChild(h);
  }
}

/* ---------- layout / pan / zoom ---------- */
// The board is laid out at the PSB's NATIVE pixel size, so its (and every
// sprite's) bitmap carries full resolution. transform:scale() only ever shrinks
// it to fit / zooms back toward 1:1 — it never upsamples, so it stays crisp.
let LW = 0, LH = 0, scale = 0, tx = 0, ty = 0, minScale = 1, maxScale = 1;

function layout() {
  const vw = boardWrap.clientWidth, vh = boardWrap.clientHeight;
  LW = M.canvas[0]; LH = M.canvas[1];        // native canvas px
  board.style.width = LW + "px";
  board.style.height = LH + "px";
  // Play vertically: scene HEIGHT fills the viewport (fit-height = min zoom);
  // its native width then overflows horizontally -> drag L/R. Max zoom = native.
  minScale = vh / LH;
  maxScale = Math.max(minScale, ZOOM_MAX);
  scale = scale ? Math.max(minScale, Math.min(maxScale, scale)) : minScale;
  tx = (vw - LW * scale) / 2;                // centre (clamp keeps it on the bg)
  ty = (vh - LH * scale) / 2;
  applyTransform();
}

function clampApply() {
  const vw = boardWrap.clientWidth, vh = boardWrap.clientHeight;
  const sw = LW * scale, sh = LH * scale;
  tx = sw <= vw ? (vw - sw) / 2 : Math.min(0, Math.max(vw - sw, tx));
  ty = sh <= vh ? (vh - sh) / 2 : Math.min(0, Math.max(vh - sh, ty));
}
function applyTransform() {
  clampApply();
  board.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`;
}

function zoomAt(cx, cy, factor) {
  const ns = Math.max(minScale, Math.min(maxScale, scale * factor));
  if (ns === scale) return;
  const rect = boardWrap.getBoundingClientRect();
  const px = cx - rect.left, py = cy - rect.top;
  // keep the point under the cursor fixed
  tx = px - (px - tx) * (ns / scale);
  ty = py - (py - ty) * (ns / scale);
  scale = ns;
  applyTransform();
}

/* ---------- input ---------- */
function wireInput() {
  const pts = new Map();
  let moved = false, downAt = 0, pinchDist = 0, lastMid = null;

  boardWrap.addEventListener("pointerdown", (e) => {
    try { boardWrap.setPointerCapture(e.pointerId); } catch (_) {}
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) { moved = false; downAt = e.timeStamp; }
    else if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      lastMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      moved = true;
    }
  });

  boardWrap.addEventListener("pointermove", (e) => {
    const p = pts.get(e.pointerId); if (!p) return;
    const px = e.clientX, py = e.clientY;
    if (pts.size === 2) {
      pts.set(e.pointerId, { x: px, y: py });
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (pinchDist > 0) zoomAt(mid.x, mid.y, d / pinchDist);
      if (lastMid) { tx += mid.x - lastMid.x; ty += mid.y - lastMid.y; applyTransform(); }
      pinchDist = d; lastMid = mid;
      return;
    }
    const dx = px - p.x, dy = py - p.y;
    if (!moved && Math.hypot(px - p.x, py - p.y) > TAP_MOVE) moved = true;
    if (moved) { tx += dx; ty += dy; applyTransform(); }
    pts.set(e.pointerId, { x: px, y: py });
  });

  const up = (e) => {
    const wasTap = pts.size === 1 && !moved && (e.timeStamp - downAt) < 500;
    pts.delete(e.pointerId);
    if (pts.size < 2) { pinchDist = 0; lastMid = null; }
    if (wasTap) handleTap(e.clientX, e.clientY);
  };
  boardWrap.addEventListener("pointerup", up);
  boardWrap.addEventListener("pointercancel", (e) => pts.delete(e.pointerId));

  boardWrap.addEventListener("wheel", (e) => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12);
  }, { passive: false });
}

const TAP_TOL = 17;   // px of forgiveness around the tap, for thin/small items

function handleTap(cx, cy) {
  if (locked) return;
  const rect = board.getBoundingClientRect();
  const baseNx = (cx - rect.left) / rect.width;
  const baseNy = (cy - rect.top) / rect.height;

  const candidates = [...items]
    .filter((it) => !it.found && it.alpha)
    .sort((a, b) => (+b.el.h.style.zIndex) - (+a.el.h.style.zIndex)); // topmost first

  // Sample the exact point first (precise for overlaps), then expanding rings up
  // to TAP_TOL px — so a tap just beside a thin item still snaps to it. The
  // tolerance is in screen px, converted to board-normalized via the live rect,
  // so it scales correctly with zoom.
  const rx = TAP_TOL / rect.width, ry = TAP_TOL / rect.height;
  const offsets = [[0, 0]];
  for (const r of [0.55, 1]) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * 2 * Math.PI;
      offsets.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
  }

  let hit = null;
  for (const [ox, oy] of offsets) {           // nearest sample wins
    const nx = baseNx + ox * rx, ny = baseNy + oy * ry;
    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) continue;
    hit = candidates.find((it) => solidAt(it, nx, ny));
    if (hit) break;
  }

  if (hit) collect(hit);
  else if (baseNx >= 0 && baseNx <= 1 && baseNy >= 0 && baseNy <= 1) miss(cx, cy);
}

function solidAt(it, nx, ny) {
  const b = it.box;
  if (nx < b.x || nx > b.x + b.w || ny < b.y || ny > b.y + b.h) return false;
  const lx = Math.floor(((nx - b.x) / b.w) * it.alpha.w);
  const ly = Math.floor(((ny - b.y) / b.h) * it.alpha.h);
  const idx = (ly * it.alpha.w + lx) * 4 + 3;
  return it.alpha.data[idx] > ALPHA_HIT;
}

/* ---------- collect / miss ---------- */
function collect(it) {
  it.found = true;
  foundCount++;
  $("found").textContent = foundCount;
  $("counter").classList.remove("bump"); void $("counter").offsetWidth;
  $("counter").classList.add("bump");
  beep(660, 0.07);

  const srcRect = it.el.h.getBoundingClientRect();
  it.el.h.classList.add("gone");
  if (it.el.s) it.el.s.classList.add("gone");

  flyToTray(srcRect, it);

  // shared-shadow cluster: lift the common ss once every member is gathered
  if (it.group != null) {
    const g = groups[it.group];
    if (!g.lifted && g.members.every((id) => items[id].found)) {
      g.lifted = true;
      if (g.el) { g.el.classList.add("gone"); }
    }
  }

  if (foundCount >= M.total) setTimeout(() => endGame(true), 650);
}

function flyToTray(srcRect, it) {
  const slotRect = it.slot.getBoundingClientRect();
  const fly = document.createElement("img");
  fly.src = it.el.h.src; fly.className = "fly";
  fly.style.left = srcRect.left + "px"; fly.style.top = srcRect.top + "px";
  fly.style.width = srcRect.width + "px"; fly.style.height = srcRect.height + "px";
  $("fxLayer").appendChild(fly);
  // ensure the slot is visible in the scrolling tray
  it.slot.scrollIntoView({ inline: "nearest", block: "nearest" });
  requestAnimationFrame(() => {
    const sx = slotRect.left + slotRect.width / 2 - (srcRect.left + srcRect.width / 2);
    const sy = slotRect.top + slotRect.height / 2 - (srcRect.top + srcRect.height / 2);
    const k = Math.min(slotRect.width / srcRect.width, slotRect.height / srcRect.height) * 0.7;
    fly.style.transform = `translate(${sx}px,${sy}px) scale(${k})`;
    fly.style.opacity = "0.2";
  });
  setTimeout(() => {
    fly.remove();
    it.slot.classList.add("found");
  }, 600);
}

function miss(cx, cy) {
  beep(150, 0.09, "square");
  const wrapRect = boardWrap.getBoundingClientRect();
  const r = document.createElement("div");
  r.className = "ripple";
  r.style.left = (cx - wrapRect.left) + "px";
  r.style.top = (cy - wrapRect.top) + "px";
  boardWrap.appendChild(r);
  setTimeout(() => r.remove(), 520);

  if (INF_HEALTH) return;          // infinite-health cheat: a miss costs nothing
  hearts--;
  const hEls = $("hearts").children;
  const lost = hEls[hearts];
  if (lost) { lost.classList.add("lost", "pulse"); setTimeout(() => lost.classList.remove("pulse"), 400); }
  if (hearts <= 0) setTimeout(() => endGame(false), 450);
}

/* ---------- end / reset ---------- */
function endGame(win) {
  locked = true;
  $("endTitle").textContent = win ? "All Tidy! 🎉" : "Out of Hearts";
  $("endMsg").textContent = win
    ? `You found all ${M.total} items.`
    : `You found ${foundCount} of ${M.total}. Give it another go!`;
  $("endBtn").textContent = win ? "Play again" : "Try again";
  $("endOverlay").hidden = false;
  if (win) beep(880, 0.12), setTimeout(() => beep(1175, 0.16), 120);
}

function resetGame() {
  foundCount = 0; hearts = 3; locked = false;
  $("found").textContent = 0;
  for (const it of items) {
    it.found = false;
    it.el.h.classList.remove("gone");
    if (it.el.s) it.el.s.classList.remove("gone");
    it.slot.classList.remove("found");
  }
  for (const g of groups) { g.lifted = false; if (g.el) g.el.classList.remove("gone"); }
  [...$("hearts").children].forEach((h) => h.classList.remove("lost", "pulse"));
  scale = minScale; applyTransform();
  $("endOverlay").hidden = true;
  $("settingsOverlay").hidden = true;
}

/* ---------- infinite health (Settings cheat) ---------- */
function syncInfHealth() {
  const s = $("infHealthState");
  if (s) s.textContent = INF_HEALTH ? "Açık" : "Kapalı";
  if (INF_HEALTH) {           // refill to full on enable
    hearts = 3;
    [...$("hearts").children].forEach((h) => h.classList.remove("lost", "pulse"));
  }
}

/* ---------- UI wiring ---------- */
function wireUI() {
  $("settingsBtn").onclick = () => { syncInfHealth(); $("settingsOverlay").hidden = false; };
  $("closeSettings").onclick = () => { $("settingsOverlay").hidden = true; };
  $("infHealthToggle").onclick = () => {
    INF_HEALTH = !INF_HEALTH;
    localStorage.setItem('tidyup_infhealth', INF_HEALTH ? '1' : '0');
    syncInfHealth();
  };
  $("restartBtn").onclick = resetGame;
  $("endBtn").onclick = resetGame;
  $("soundToggle").onclick = () => {
    soundOn = !soundOn;
    $("soundState").textContent = soundOn ? "On" : "Off";
  };
  $("versionToggle").onclick = () => {
    mode = mode === "v1" ? "v2" : "v1";
    $("versionState").textContent = mode === "v1" ? "v1 · silhouette" : "v2 · full item";
    $("frame").classList.toggle("v2", mode === "v2");
  };
  syncInfHealth();   // apply persisted infinite-health on load
}

/* ---------- sound ---------- */
let actx = null;
function beep(freq, dur, type = "sine") {
  if (!soundOn) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.18, actx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
    o.connect(g).connect(actx.destination);
    o.start(); o.stop(actx.currentTime + dur + 0.02);
  } catch (e) {}
}

const pct = (v) => (v * 100) + "%";
