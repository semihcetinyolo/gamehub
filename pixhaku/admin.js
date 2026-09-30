// Pixhaku admin panel — playtest controls for Pixhaku_prototype.html.
// Loaded with <script src="admin.js"> at the end of the prototype, so it runs after the
// game script and drives the game's own functions: jump between levels, skip a level
// through the real win flow, fail it through the real heart loss, place the next piece,
// refill hearts or hints and reset saved progress. Remove that script tag to ship
// without it. Keys while the panel is open: ← → level, W skip, F fail, N piece, R restart.
(() => {
  "use strict";

  // the game's globals this panel drives; if the game code renames one, the panel says so
  const need = ["levels", "level", "levelIndex", "selectedLevel", "activeScreen", "assignments", "completed", "failed", "lives",
    "hintLeft", "adPlaying", "nextRegionId", "regionColors", "palette", "finishedLevels", "helpModal", "settingsModal",
    "levelsModal", "failModal", "startGame", "loseLife", "checkCompletion", "addPiece", "assignRegion", "rectangleIndices",
    "indexOfCell", "clearPreview", "renderLives", "render", "placeSound", "updateBoosters", "saveProgress", "refreshMenu"];
  const missing = need.filter((name) => !new Function(`return typeof ${name} !== "undefined"`)());

  const css = `
    .adm-toggle { position:fixed; left:max(8px, env(safe-area-inset-left)); bottom:max(8px, env(safe-area-inset-bottom)); z-index:1000;
      font:400 8px/1 var(--px-font, monospace); letter-spacing:1px; color:#fff3d3; background:#51432fd9; border:0; padding:8px 9px;
      box-shadow:2px 0 #2d251a,-2px 0 #2d251a,0 2px #2d251a,0 -2px #2d251a; cursor:pointer; opacity:.75; }
    .adm-toggle:hover, .adm-toggle[aria-expanded="true"] { opacity:1; }
    .adm-panel { position:fixed; left:max(8px, env(safe-area-inset-left)); bottom:calc(max(8px, env(safe-area-inset-bottom)) + 38px); z-index:1000;
      width:min(272px, calc(100vw - 16px)); max-height:calc(100svh - 64px); overflow:auto; padding:12px; color:#fff3d3; background:#51432f;
      box-shadow:3px 0 #2d251a,-3px 0 #2d251a,0 3px #2d251a,0 -3px #2d251a,6px 8px #0000004d; font:400 8px/1.7 var(--px-font, monospace); }
    .adm-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; letter-spacing:1px; }
    .adm-close { font:inherit; color:#fff3d3; background:none; border:0; padding:2px 4px; cursor:pointer; font-size:12px; }
    .adm-state { color:#e9d9ae; margin-bottom:10px; min-height:3.4em; }
    .adm-state b { color:#fff3d3; font-weight:400; }
    .adm-row { display:grid; gap:6px; margin-top:6px; }
    .adm-row.c2 { grid-template-columns:1fr 1fr; }
    .adm-row.c3 { grid-template-columns:1fr 1fr 1fr; }
    .adm-row.nav { grid-template-columns:36px 1fr 36px; }
    .adm-panel button.adm-b, .adm-panel select { font:400 8px/1.2 var(--px-font, monospace); color:#51432f; background:#fff3d3; border:0; padding:8px 4px;
      box-shadow:inset 0 -3px #d9c28f; cursor:pointer; min-height:30px; }
    .adm-panel select { width:100%; padding:6px 4px; }
    .adm-panel button.adm-b:active { box-shadow:inset 0 3px #d9c28f; }
    .adm-panel button.adm-b:disabled { opacity:.45; cursor:default; }
    .adm-panel button.win { background:#b9d18a; box-shadow:inset 0 -3px #7f9a55; }
    .adm-panel button.fail { background:#eeaa8c; box-shadow:inset 0 -3px #b86c4d; }
    .adm-keys { margin-top:10px; color:#cbb98d; font-size:7px; line-height:1.9; }
    .adm-msg { margin-top:8px; color:#f6d27d; min-height:1.7em; }`;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "adm-toggle";
  toggle.textContent = "ADMIN";
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", "admPanel");

  const panel = document.createElement("section");
  panel.className = "adm-panel";
  panel.id = "admPanel";
  panel.hidden = true;
  panel.setAttribute("aria-label", "Admin");
  panel.innerHTML = `
    <div class="adm-head"><span>ADMIN</span><button class="adm-close" type="button" aria-label="Kapat">×</button></div>
    <div class="adm-state" aria-live="polite"></div>
    <div class="adm-row nav">
      <button class="adm-b" type="button" data-act="prev" title="Önceki level (←)" aria-label="Önceki level">◀</button>
      <select aria-label="Level seç"></select>
      <button class="adm-b" type="button" data-act="next" title="Sonraki level (→)" aria-label="Sonraki level">▶</button>
    </div>
    <div class="adm-row c2">
      <button class="adm-b win" type="button" data-act="win" title="Level'ı çözülmüş say: resim açılır, kazanma ekranı gelir (W)">GEÇ</button>
      <button class="adm-b fail" type="button" data-act="fail" title="Canları bitir: kaybetme ekranı gelir (F)">KAYBET</button>
    </div>
    <div class="adm-row c2">
      <button class="adm-b" type="button" data-act="piece" title="Sıradaki doğru parçayı hint harcamadan koy (N)">PARÇA +1</button>
      <button class="adm-b" type="button" data-act="restart" title="Level'ı baştan başlat (R)">BAŞTAN</button>
    </div>
    <div class="adm-row c3">
      <button class="adm-b" type="button" data-act="heal" title="Canları 3'e doldur">CAN 3</button>
      <button class="adm-b" type="button" data-act="hurt" title="Bir can düşür">CAN -1</button>
      <button class="adm-b" type="button" data-act="hints" title="3 hint ekle">HINT +3</button>
    </div>
    <div class="adm-row">
      <button class="adm-b" type="button" data-act="reset" title="Tamamlanan level kayıtlarını sil">İLERLEMEYİ SIFIRLA</button>
    </div>
    <div class="adm-row c2 adm-gen" title="Oyun içi üreticiyle hemen yeni bir level üret">
      <button class="adm-b" type="button" data-act="genEasy">ÜRET EASY</button>
      <button class="adm-b" type="button" data-act="genMedium">ÜRET MEDIUM</button>
      <button class="adm-b" type="button" data-act="genHard">ÜRET HARD</button>
      <button class="adm-b" type="button" data-act="genExpert">ÜRET EXPERT</button>
    </div>
    <div class="adm-msg"></div>
    <div class="adm-keys">← → LEVEL · W GEÇ · F KAYBET<br>N PARÇA · R BAŞTAN</div>`;
  document.body.append(toggle, panel);

  const stateEl = panel.querySelector(".adm-state");
  const msgEl = panel.querySelector(".adm-msg");
  const select = panel.querySelector("select");

  let msgTimer = 0;
  function say(text) {
    msgEl.textContent = text;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => { msgEl.textContent = ""; }, 2200);
  }

  if (missing.length) {
    panel.querySelectorAll("button.adm-b, select").forEach((el) => { el.disabled = true; });
    stateEl.textContent = `Oyun kodu değişmiş, admin bağlanamadı: ${missing.join(", ")}`;
  } else {
    levels.forEach((lv, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = `${i + 1} · ${lv.tag || ""}${lv.difficulty != null ? ` ${lv.difficulty}` : ""} · ${lv.artName}`;
      select.appendChild(opt);
    });
  }

  const cellsOf = ([r0, c0, r1, c1]) => rectangleIndices(indexOfCell(r0, c0), indexOfCell(r1, c1)).indices;
  const isFree = (rect) => cellsOf(rect).every((i) => assignments[i] === null);

  function stopDrag() {
    clearPreview();
    dragging = false;
    dragStart = dragEnd = dragPointerId = null;
  }

  function closeSideModals() {
    [helpModal, settingsModal, levelsModal].forEach((m) => m.classList.remove("open"));
  }

  // every action runs on the game screen; returns false while a rewarded ad is playing
  function ensureGame() {
    if (adPlaying) { say("Reklam bitince tekrar dene"); return false; }
    closeSideModals();
    if (activeScreen !== "game") startGame(selectedLevel);
    return true;
  }

  function go(index) {
    if (adPlaying) { say("Reklam bitince tekrar dene"); return; }
    closeSideModals();
    stopDrag();
    startGame((index + levels.length) % levels.length, true);
  }

  // Skip = solve: remaining pieces land at once and the game's own completion runs
  // (progress is saved, the picture is revealed, the win screen opens).
  function win() {
    if (!ensureGame()) return;
    if (completed) { say("Level zaten çözüldü"); return; }
    stopDrag();
    if (failed) {
      failed = false;
      lives = 3;
      renderLives(false);
      failModal.classList.remove("open");
    }
    for (const rect of level.solution) {
      if (!isFree(rect)) continue;
      const id = nextRegionId;
      nextRegionId += 1;
      regionColors.set(id, palette[(id - 1) % palette.length]);
      const cells = cellsOf(rect);
      cells.forEach((i) => { assignments[i] = id; });
      addPiece(id, cells);
    }
    render();
    placeSound();
    checkCompletion();
  }

  // Fail = the last heart is lost the normal way (shake, sound, fail screen).
  function fail() {
    if (!ensureGame()) return;
    if (completed) { say("Level çözülmüş, önce BAŞTAN"); return; }
    if (failed) { say("Level zaten kaybedildi"); return; }
    stopDrag();
    lives = 1;
    loseLife("admin");
  }

  function hurt() {
    if (!ensureGame()) return;
    if (completed || failed) { say("Önce BAŞTAN"); return; }
    stopDrag();
    loseLife("admin");
  }

  function heal() {
    if (!ensureGame()) return;
    lives = 3;
    failed = false;
    renderLives(false);
    failModal.classList.remove("open");
    render();
    say("Canlar dolu");
  }

  function hints() {
    hintLeft += 3;
    updateBoosters();
    say(`Hint: ${hintLeft}`);
  }

  function piece() {
    if (!ensureGame()) return;
    if (completed || failed) { say("Önce BAŞTAN"); return; }
    const next = level.solution.find(isFree);
    if (!next) return;
    stopDrag();
    assignRegion(cellsOf(next));
  }

  function restart() {
    if (!ensureGame()) return;
    stopDrag();
    startGame(levelIndex, true);
  }

  function resetProgress() {
    finishedLevels.clear();
    selectedLevel = levelIndex;
    saveProgress();
    if (activeScreen === "menu") refreshMenu();
    say("İlerleme sıfırlandı");
  }

  function makeCustom(tag) {
    if (typeof playCustom !== "function") { say("Bu oyunda üretici yok"); return; }
    if (adPlaying) { say("Reklam bitince tekrar dene"); return; }
    closeSideModals();
    say("Üretiliyor…");
    playCustom(tag);
  }

  const actions = {
    prev: () => go(levelIndex - 1), next: () => go(levelIndex + 1), win, fail, piece, restart,
    heal, hurt, hints, reset: resetProgress,
    // straight to the in-game puzzle maker, without clearing the built-in levels first
    genEasy: () => makeCustom("easy"), genMedium: () => makeCustom("medium"), genHard: () => makeCustom("hard"), genExpert: () => makeCustom("expert"),
  };

  function refresh() {
    if (missing.length) return;
    const where = activeScreen === "game" ? "oyunda" : "menüde";
    const status = completed ? "çözüldü" : failed ? "kaybedildi" : `${new Set(assignments.filter((v) => v !== null)).size}/${level.clues.length} parça`;
    stateEl.innerHTML = "";
    const title = document.createElement("b");
    title.textContent = `LEVEL ${levelIndex + 1} / ${levels.length}${level.tag ? ` · ${level.tag.toUpperCase()} ${level.difficulty}` : ""}`;
    stateEl.append(title, document.createElement("br"),
      document.createTextNode(level.artName), document.createElement("br"),
      document.createTextNode(`${where} · ${status} · ♥${lives} · hint ${hintLeft} · biten ${finishedLevels.size}`));
    if (document.activeElement !== select) select.value = String(levelIndex);
  }

  let ticker = 0;
  function setOpen(open) {
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    clearInterval(ticker);
    if (open) { refresh(); ticker = setInterval(refresh, 400); }
  }

  toggle.addEventListener("click", () => setOpen(panel.hidden));
  panel.querySelector(".adm-close").addEventListener("click", () => setOpen(false));
  panel.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-act]");
    if (!button || button.disabled) return;
    actions[button.dataset.act]();
    refresh();
  });
  select.addEventListener("change", () => { go(Number(select.value)); refresh(); select.blur(); });

  document.addEventListener("keydown", (event) => {
    if (panel.hidden || missing.length || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target === select) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const act = { ArrowLeft: "prev", ArrowRight: "next", w: "win", f: "fail", n: "piece", r: "restart" }[key];
    if (!act) return;
    event.preventDefault();
    actions[act]();
    refresh();
  });
})();
