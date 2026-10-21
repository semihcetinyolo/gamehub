// Word Train — admin bottom sheet: every level with its full chain, level jump, and the variant's
// test buttons. All debug controls live here, never on the game screen.

let activeClose = null;
const ICONS = new URL('../assets/icons.svg', import.meta.url).href;
// Sheet frame comes from theme.css (.wt-sheet, __handle/__header/__body/__footer); this styles the contents.
const css = `
#wt-admin { font-family:var(--wt-font,system-ui); max-height:92vh; max-height:92dvh; }
#wt-admin h3 { margin:0 0 8px; font-size:12px; letter-spacing:.06em; text-transform:uppercase; color:var(--wt-muted,#786653); }
#wt-admin .wta-level { margin:0 0 10px; border:1px solid var(--wt-border,#d8c5a5); border-radius:6px; background:var(--wt-cream,#faf5e9); overflow:hidden; }
#wt-admin .wta-level[data-current] { border:2px solid var(--wt-primary,var(--wt-sage-dark,#40674d)); }
#wt-admin .wta-jump { width:100%; min-height:56px; display:flex; align-items:center; gap:12px; padding:8px 12px; border:0; text-align:left; background:transparent; color:inherit; font:inherit; font-weight:600; cursor:pointer; touch-action:manipulation; }
#wt-admin .wta-jump:active { background:var(--wt-sage-light,#eee1c7); }
#wt-admin .wta-num { display:grid; place-items:center; width:40px; height:40px; flex:none; border-radius:4px; background:var(--wt-sand,#eee1c7); font-variant-numeric:tabular-nums; }
#wt-admin [data-current] .wta-num { background:var(--wt-primary,var(--wt-sage-dark,#40674d)); color:var(--wt-on-accent,#fffaf0); }
#wt-admin .wta-copy { flex:1; min-width:0; display:grid; gap:2px; }
#wt-admin .wta-copy strong { font-size:16px; }
#wt-admin .wta-copy small { color:var(--wt-muted,#786653); font-size:12px; font-weight:400; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#wt-admin .wta-badge { font-size:11px; font-weight:600; padding:5px 8px; border-radius:4px; background:var(--wt-sage-light,#e2ebd9); color:var(--wt-ink,#40674d); flex:none; }
#wt-admin details { border-top:1px solid var(--wt-border,#d8c5a5); }
#wt-admin summary { min-height:48px; padding:14px 12px; cursor:pointer; font-size:12px; font-weight:600; color:var(--wt-muted,#786653); touch-action:manipulation; }
#wt-admin ol { margin:0; padding:0 12px 10px; list-style:none; }
#wt-admin li { display:grid; gap:2px; padding:8px 0; border-top:1px solid var(--wt-border,#d8c5a5); font-size:12.5px; line-height:1.4; }
#wt-admin li b { font-size:14px; letter-spacing:.03em; }
#wt-admin li i { font-style:normal; font-weight:600; color:var(--wt-sage-dark,#40674d); }
#wt-admin li span { color:var(--wt-muted,#786653); }
#wt-admin .wt-sheet__footer { display:block; max-height:40vh; max-height:40dvh; overflow-y:auto; overscroll-behavior:contain; background:var(--wt-cream,#faf5e9); }
#wt-admin .wta-actions { display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); gap:8px; }
#wt-admin .wta-actions .wt-button { min-height:48px; padding:8px 10px; font-size:13.5px; line-height:1.2; box-shadow:none; }
#wt-admin .wta-actions .wt-button[data-tone="danger"] { color:var(--wt-danger,#a74438); border-color:var(--wt-danger,#a74438); }
`;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * openAdmin({ levels, currentId, onJump, actions, title })
 *   onJump(levelId, index)  a level card was tapped (the sheet closes first)
 *   actions                 [{ label, run, keepOpen?, tone?: 'danger' }] the variant's test buttons;
 *                           the sheet closes before run() unless keepOpen
 * Returns { close }.
 */
export function openAdmin({ levels = [], currentId, onJump, actions = [], title = 'Yönetim' } = {}) {
  activeClose?.();
  if (!document.getElementById('wt-admin-css')) {
    const style = el('style');
    style.id = 'wt-admin-css';
    style.textContent = css;
    document.head.append(style);
  }
  const previousFocus = document.activeElement;
  const dialog = el('dialog', 'wt-sheet');
  dialog.id = 'wt-admin';
  dialog.setAttribute('aria-labelledby', 'wta-title');
  const head = el('header', 'wt-sheet__header');
  const heading = el('h2', '', title);
  heading.id = 'wta-title';
  const closeButton = el('button', 'wt-icon-button');
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Kapat');
  closeButton.innerHTML = `<svg class="wt-icon" aria-hidden="true"><use href="${ICONS}#close"></use></svg>`;
  head.append(heading, closeButton);
  const body = el('div', 'wt-sheet__body');
  body.append(el('h3', '', 'Bölümler'));

  let currentCard = null;
  levels.forEach((level, index) => {
    const chain = level.chain ?? [];
    const card = el('section', 'wta-level');
    const isCurrent = level.id === currentId;
    const jump = el('button', 'wta-jump');
    jump.type = 'button';
    const copy = el('span', 'wta-copy');
    copy.append(el('strong', '', level.title ?? `Bölüm ${level.id}`),
      el('small', '', `${chain[0]?.word ?? ''} → ${chain.at(-1)?.word ?? ''} · ${Math.max(0, chain.length - 1)} kelime`));
    jump.append(el('span', 'wta-num', String(level.id ?? index + 1)), copy);
    if (isCurrent) {
      card.dataset.current = '';
      jump.setAttribute('aria-current', 'true');
      jump.append(el('span', 'wta-badge', 'Şu an'));
      currentCard = card;
    }
    jump.addEventListener('click', () => { close(); onJump?.(level.id, index); });

    const details = el('details');
    details.open = isCurrent;
    details.append(el('summary', '', 'Zincir, ipuçları, çeldiriciler'));
    const list = el('ol');
    chain.forEach((link, i) => {
      const item = el('li');
      item.append(el('b', '', `${i}. ${link.word}`));
      if (link.phrase) item.append(el('i', '', link.phrase));
      if (link.hint) item.append(el('span', '', `İpucu: ${link.hint}`));
      if (link.distractors?.length) item.append(el('span', '', `Çeldiriciler: ${link.distractors.join(', ')}`));
      if (!i) item.append(el('span', '', 'Başlangıç kelimesi'));
      list.append(item);
    });
    details.append(list);
    card.append(jump, details);
    body.append(card);
  });
  dialog.append(el('div', 'wt-sheet__handle'), head, body);

  if (actions.length) {
    const tests = el('section', 'wt-sheet__footer');
    const grid = el('div', 'wta-actions');
    for (const action of actions) {
      const button = el('button', 'wt-button', action.label);
      button.type = 'button';
      if (action.tone) button.dataset.tone = action.tone;
      button.addEventListener('click', () => {
        if (!action.keepOpen) close();
        try { Promise.resolve(action.run?.()).catch(error => console.error(error)); }
        catch (error) { console.error(error); }
      });
      grid.append(button);
    }
    tests.append(el('h3', '', 'Test'), grid);
    dialog.append(tests);
  }

  function close() {
    if (!dialog.isConnected) return;
    dialog.close();
    dialog.remove();
    if (activeClose === close) activeClose = null;
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  }
  closeButton.addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  // Backdrop taps hit the dialog element itself, outside its rectangle.
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close();
  });
  document.body.append(dialog);
  activeClose = close;
  dialog.showModal();
  closeButton.focus({ preventScroll: true });
  currentCard?.scrollIntoView({ block: 'start' });
  return { close };
}
