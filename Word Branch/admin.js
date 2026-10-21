import { DEFAULTS, validateLevel } from './logic.js';

// The panel owns only its presentation. game.js owns restarting and URL updates.
let activePanel = null;
const css = `
#wb-admin { position:fixed; inset:auto 0 0; margin:0 auto; padding:0; width:min(100%,480px); max-width:100%; max-height:92vh; max-height:92dvh; border:1px solid var(--btn-bg,#e8dfd3); border-bottom:0; border-radius:26px 26px 0 0; background:var(--card-bg,#faf6ee); color:var(--card-text,#302b26); font-family:var(--font,system-ui); box-shadow:0 -12px 60px var(--shadow-strong,#30271e40); }
#wb-admin::backdrop { background:var(--overlay-bg,#30271e88); backdrop-filter:blur(5px); }
#wb-admin * { box-sizing:border-box; }
#wb-admin .wa-layout { display:flex; flex-direction:column; max-height:92vh; max-height:92dvh; }
#wb-admin .wa-head { display:flex; align-items:center; gap:12px; padding:18px 18px 10px; flex:none; }
#wb-admin h2 { font-size:22px; margin:0; flex:1; letter-spacing:-.5px; }
#wb-admin button { font:inherit; color:inherit; border:0; cursor:pointer; min-height:44px; border-radius:12px; font-weight:750; background:var(--btn-bg,#e8dfd3); touch-action:manipulation; }
#wb-admin button:disabled { opacity:.38; cursor:default; }
#wb-admin :focus-visible { outline:3px solid var(--btn-primary,#b96b45); outline-offset:3px; }
#wb-admin .wa-close { width:44px; font-size:22px; flex:none; }
#wb-admin .wa-body { min-height:0; overflow-y:auto; overscroll-behavior:contain; touch-action:pan-y; padding:0 18px 14px; }
#wb-admin .wa-intro { margin:0 0 14px; color:var(--card-muted,#716455); font-size:13px; line-height:1.5; }
#wb-admin .wa-level { background:var(--node-bg,#fffdf8); border:1px solid var(--btn-bg,#e8dfd3); border-radius:16px; margin:0 0 10px; overflow:hidden; }
#wb-admin .wa-level[data-current] { border:2px solid var(--btn-primary,#b96b45); }
#wb-admin .wa-jump { width:100%; display:flex; align-items:center; text-align:left; gap:12px; padding:12px; background:transparent; border-radius:0; }
#wb-admin .wa-number { display:grid; place-items:center; width:38px; height:38px; flex:none; border-radius:12px; background:var(--btn-bg,#e8dfd3); color:var(--card-text,#302b26); }
#wb-admin .wa-copy { flex:1; display:grid; gap:3px; }
#wb-admin .wa-copy strong { font-size:17px; letter-spacing:1px; }
#wb-admin .wa-copy small { color:var(--card-muted,#716455); font-size:12px; font-weight:600; }
#wb-admin .wa-current { font-size:11px; color:var(--card-text,#302b26); background:var(--btn-bg,#e8dfd3); padding:5px 7px; border-radius:20px; }
#wb-admin details { border-top:1px solid var(--btn-bg,#e8dfd3); }
#wb-admin summary { min-height:44px; padding:12px; cursor:pointer; font-size:12px; font-weight:700; color:var(--card-muted,#716455); touch-action:manipulation; }
#wb-admin .wa-words { margin:0; padding:0 12px 12px; list-style:none; }
#wb-admin .wa-words li { padding:7px 0; border-top:1px solid var(--btn-bg,#e8dfd3); font-size:12px; line-height:1.5; }
#wb-admin .wa-words b { display:block; }
#wb-admin .wa-words span { color:var(--card-muted,#716455); }
#wb-admin h3 { margin:20px 0 8px; font-size:14px; }
#wb-admin .wa-setting { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:9px 0; }
#wb-admin .wa-setting label { font-size:14px; font-weight:700; }
#wb-admin .wa-stepper { display:flex; align-items:center; gap:8px; }
#wb-admin .wa-stepper button { width:44px; font-size:22px; }
#wb-admin output { width:30px; text-align:center; font-weight:800; font-variant-numeric:tabular-nums; }
#wb-admin .wa-seed { display:flex; gap:8px; margin-top:8px; }
#wb-admin input { min-width:0; width:100%; min-height:46px; border:1px solid var(--btn-bg,#e8dfd3); border-radius:12px; padding:10px; background:var(--input-bg,#fffdf8); color:inherit; font:inherit; font-size:16px; user-select:text; -webkit-user-select:text; touch-action:manipulation; }
#wb-admin .wa-seed button { flex:none; padding:0 12px; font-size:12px; }
#wb-admin .wa-footer { flex:none; padding:12px 18px max(18px,env(safe-area-inset-bottom)); border-top:1px solid var(--btn-bg,#e8dfd3); background:var(--card-bg,#faf6ee); }
#wb-admin .wa-apply { width:100%; min-height:50px; background:var(--btn-primary,#b96b45); color:var(--btn-primary-text,#fff); }
#wb-admin .wa-error { color:var(--danger,#b83e46); font-size:13px; line-height:1.4; margin:0 0 8px; }
`;

const clamp = (value, min, max, fallback) => Math.min(max, Math.max(min, Number.isSafeInteger(value) ? value : fallback));

export function openAdmin({ levels, currentIndex, rows, slots, decoys, seed, apply }) {
  if (!Array.isArray(levels) || !levels.length || typeof apply !== 'function') {
    throw new Error('openAdmin needs levels and an apply callback');
  }
  activePanel?.();
  if (!document.getElementById('wb-admin-css')) {
    const style = document.createElement('style');
    style.id = 'wb-admin-css';
    style.textContent = css;
    document.head.append(style);
  }
  const levelIndex = clamp(currentIndex, 0, levels.length - 1, 0);
  const minSlots = index => Math.max(...levels[index].words.map(word => word.parts.length));
  let draftRows = clamp(rows, 1, 6, DEFAULTS.visibleRows);
  let draftSlots = clamp(slots, minSlots(levelIndex), 8, DEFAULTS.wheelSlots);
  let draftDecoys = clamp(decoys, 0, 3, DEFAULTS.decoys ?? 0);
  const previousFocus = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.id = 'wb-admin';
  dialog.setAttribute('aria-labelledby', 'wa-title');
  dialog.innerHTML = `<div class="wa-layout">
    <header class="wa-head"><h2 id="wa-title">Levels & settings</h2><button class="wa-close" aria-label="Close settings" type="button">×</button></header>
    <div class="wa-body"><p class="wa-intro">Choose a branch to play. Tap a level to jump in.</p>
      <div class="wa-levels"></div>
      <h3>Game settings</h3>
      <div class="wa-setting"><label id="wa-rows-label">Visible rows</label><div class="wa-stepper"><button data-step="rows:-1" aria-label="Fewer visible rows">−</button><output id="wa-rows" aria-labelledby="wa-rows-label"></output><button data-step="rows:1" aria-label="More visible rows">+</button></div></div>
      <div class="wa-setting"><label id="wa-slots-label">Wheel slots</label><div class="wa-stepper"><button data-step="slots:-1" aria-label="Fewer wheel slots">−</button><output id="wa-slots" aria-labelledby="wa-slots-label"></output><button data-step="slots:1" aria-label="More wheel slots">+</button></div></div>
      <div class="wa-setting"><label id="wa-decoys-label">Fake parts</label><div class="wa-stepper"><button data-step="decoys:-1" aria-label="Fewer fake parts">−</button><output id="wa-decoys" aria-labelledby="wa-decoys-label"></output><button data-step="decoys:1" aria-label="More fake parts">+</button></div></div>
      <h3><label for="wa-seed">Seed</label></h3><div class="wa-seed"><input id="wa-seed" type="text" inputmode="numeric" autocomplete="off" spellcheck="false"><button class="wa-new-seed" type="button">New seed</button></div>
    </div><footer class="wa-footer"><p class="wa-error" role="alert" hidden></p><button class="wa-apply" type="button">Apply / Restart</button></footer>
  </div>`;
  const query = selector => dialog.querySelector(selector);
  function close() {
    dialog.close();
    dialog.remove();
    if (activePanel === close) activePanel = null;
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  }
  function refresh() {
    query('#wa-rows').value = draftRows;
    query('#wa-slots').value = draftSlots;
    query('#wa-decoys').value = draftDecoys;
    for (const button of dialog.querySelectorAll('[data-step]')) {
      const [kind, delta] = button.dataset.step.split(':');
      const value = { rows: draftRows, slots: draftSlots, decoys: draftDecoys }[kind];
      const min = { rows: 1, slots: minSlots(levelIndex), decoys: 0 }[kind];
      const max = { rows: 6, slots: 8, decoys: 3 }[kind];
      button.disabled = value + Number(delta) < min || value + Number(delta) > max;
    }
  }
  function commit(index) {
    const error = query('.wa-error');
    try {
      const rawSeed = query('#wa-seed').value.trim();
      if (!/^-?\d+$/.test(rawSeed) || !Number.isSafeInteger(Number(rawSeed))) throw new Error('Enter a whole-number seed.');
      const nextSlots = Math.max(draftSlots, minSlots(index));
      validateLevel(levels[index], { visibleRows: draftRows, wheelSlots: nextSlots, decoys: draftDecoys });
      apply({ levelIndex: index, rows: draftRows, slots: nextSlots, decoys: draftDecoys, seed: Number(rawSeed) });
      close();
    } catch (problem) {
      error.textContent = problem.message;
      error.hidden = false;
    }
  }
  levels.forEach((level, index) => {
    const card = document.createElement('section');
    card.className = 'wa-level';
    if (index === levelIndex) card.dataset.current = '';
    const button = document.createElement('button');
    button.className = 'wa-jump';
    button.type = 'button';
    button.innerHTML = '<span class="wa-number"></span><span class="wa-copy"><strong></strong><small></small></span>';
    button.querySelector('.wa-number').textContent = level.id ?? index + 1;
    button.querySelector('strong').textContent = level.root;
    button.querySelector('small').textContent = `${level.words.length} words`;
    if (index === levelIndex) {
      button.setAttribute('aria-current', 'true');
      const badge = document.createElement('span');
      badge.className = 'wa-current';
      badge.textContent = 'Current';
      button.append(badge);
    }
    button.addEventListener('click', () => commit(index));
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'Words & splits';
    const list = document.createElement('ul');
    list.className = 'wa-words';
    for (const word of level.words) {
      const item = document.createElement('li');
      const title = document.createElement('b');
      title.textContent = word.word;
      const split = document.createElement('span');
      split.textContent = `${level.root} + ${word.parts.join(' + ')}`;
      item.append(title, split);
      list.append(item);
    }
    details.append(summary, list);
    card.append(button, details);
    query('.wa-levels').append(card);
  });
  query('#wa-seed').value = Number.isSafeInteger(seed) ? seed : 1;
  query('.wa-new-seed').addEventListener('click', () => {
    const previous = Number(query('#wa-seed').value);
    let next = crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff;
    if (next === previous) next = (next + 1) & 0x7fffffff;
    query('#wa-seed').value = next;
  });
  for (const button of dialog.querySelectorAll('[data-step]')) {
    button.addEventListener('click', () => {
      const [kind, delta] = button.dataset.step.split(':');
      if (kind === 'rows') draftRows += Number(delta);
      else if (kind === 'decoys') draftDecoys += Number(delta);
      else draftSlots += Number(delta);
      refresh();
    });
  }
  query('.wa-close').addEventListener('click', close);
  query('.wa-apply').addEventListener('click', () => commit(levelIndex));
  query('#wa-seed').addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); commit(levelIndex); }
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  // Backdrop clicks target the dialog; clicks within its rectangle must stay open.
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
  });
  document.body.append(dialog);
  activePanel = close;
  refresh();
  dialog.showModal();
  query('.wa-close').focus({ preventScroll: true });
}
