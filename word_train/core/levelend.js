// Word Train — the level-end result card, shared by every variant (design/visual.md "Level end",
// design/compact-end-mock-*.png). A compact card at the bottom of the screen (centred from 600 px up): the
// game's own train moves into its 144 px dock (a size-keeping placeholder holds its old place) and becomes the
// station — the last pair on the platform, the locomotive pulling in on the row above. Below it a title, one
// stats line (the link count opens the last links) and the actions, which take taps from ~600 ms on; a tap
// finishes every animation and runs the action right away. Closing puts the train back where it was.
//
//   const end = openLevelEnd({ train, level, found, mistakes, hints, last, number, sfx, inert,
//                              onNext, onReplay, onLevels });
//   end.finish()   jump to the last frame          end.destroy()   close (the train goes back to normal)
//
// levelEndSummary() is the pure part (texts and numbers) and is tested on its own.

import { phraseOf, trUpper } from './logic.js';

const READY_MS = 600;        // actions take taps from here on (160 ms with reduced motion)
const FLIGHT_MS = 360;       // the train's move from the game into the dock
const ICONS = new URL('../assets/icons.svg', import.meta.url).href;
const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/**
 * Texts and numbers of the result for `level` after `found` (state.found: the start word + every word found).
 * last = this was the final level. number = the level number shown (default level.id).
 */
export function levelEndSummary({ level, found = [], mistakes = 0, hints = 0, last = false, number } = {}) {
  const chain = level?.chain ?? [];
  const links = Math.max(0, found.length - 1);
  const phrases = chain.slice(1, links + 1).map((link, i) => link.phrase ?? phraseOf(chain[i], link));
  const title = last ? 'Bütün duraklar tamam!' : 'Bölüm tamamlandı!';
  return {
    title,
    sign: { small: last ? 'SON DURAK' : trUpper(`Bölüm ${number ?? level?.id ?? ''}`.trim()), name: level?.title ?? '' },
    phrase: phrases.at(-1) ?? '',
    receipt: phrases.slice(-3),
    stats: [{ value: links, label: 'bağlantı' }, { value: mistakes, label: 'hata' }, { value: hints, label: 'yardım' }],
    note: last ? 'Tüm bölümleri tamamladın.' : '',
    actions: last
      ? [{ id: 'levels', label: 'Bölüm seç', icon: 'levels', primary: true }, { id: 'replay', label: 'Tekrar oyna', icon: 'restart', wide: true }]
      : [{ id: 'next', label: 'Sonraki bölüm', icon: 'arrow-right', primary: true, iconAfter: true },
        { id: 'replay', label: 'Tekrar oyna', icon: 'restart' }, { id: 'levels', label: 'Bölümler', icon: 'levels' }],
    announce: `${title.replace(/!$/, '')}, ${links} bağlantı, ${mistakes} hata, ${hints} yardım.`,
  };
}

function h(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const SVG = 'http://www.w3.org/2000/svg';

function chevron() {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'wt-levelend__chevron');
  svg.setAttribute('viewBox', '0 0 12 12');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', 'm3 4.5 3 3 3-3');
  svg.append(path);
  return svg;
}

function icon(name) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'wt-icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG, 'use');
  use.setAttribute('href', `${ICONS}#${name}`);
  svg.append(use);
  return svg;
}

// levelend.css comes along with this module, so a variant only has to import it. It starts loading with the
// module (the card measures itself when it opens); stylesLoaded() says whether it applies yet.
const STYLES = new URL('./levelend.css', import.meta.url).href;
let stylesReady = false;
function ensureStyles() {
  if (typeof document === 'undefined') return Promise.resolve();
  const found = [...document.styleSheets].find(sheet => sheet.href === STYLES);
  if (found) { stylesReady = true; return Promise.resolve(); }
  let link = document.querySelector(`link[href="${STYLES}"]`);
  if (!link) document.head.append(link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: STYLES }));
  return new Promise(resolve => {
    const done = () => { stylesReady = true; resolve(); };
    if (link.sheet) done();
    else { link.addEventListener('load', done, { once: true }); link.addEventListener('error', done, { once: true }); }
  });
}
let stylesLoading = ensureStyles();

let active = null;
let serial = 0;

/**
 * Opens the result card over the game. train = mountTrain() handle (its element moves into the card and turns
 * into the station; it goes back on close); level = the finished level ({ id, title, chain }); found / mistakes
 * / hints from the run state; last = the final level (no "Sonraki bölüm"); number = level number to show;
 * sfx = core/sfx.js (optional); inert = element to make inert behind the card (e.g. the game's main element).
 * onNext / onReplay / onLevels run once, after the card has closed. Escape = onLevels.
 * Opening the same result again returns the open one.
 */
export function openLevelEnd(options) {
  const { train, level, found = [], last = false, inert, onNext, onReplay, onLevels } = options;
  const key = `${level?.id}:${found.length}`;
  if (active && active.key === key && active.train === train) return active.handle;
  active?.handle.destroy();
  if (!stylesReady) stylesLoading = ensureStyles();
  const styled = stylesReady;

  const info = levelEndSummary(options);
  const id = `wt-levelend-${++serial}`;
  const motion = !reducedMotion();
  const root = h('section', 'wt-levelend');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', `${id}-title`);
  root.setAttribute('aria-describedby', `${id}-summary`);
  if (last) root.classList.add('wt-levelend--last');

  const card = h('div', 'wt-levelend__card');
  const dock = h('div', 'wt-levelend__dock');
  const sign = h('div', 'wt-levelend__station-sign');
  sign.setAttribute('aria-hidden', 'true');
  sign.append(h('small', '', info.sign.small), h('strong', '', info.sign.name));

  const body = h('div', 'wt-levelend__body');
  const scroll = h('div', 'wt-levelend__scroll');
  const title = h('h2', 'wt-levelend__title', info.title);
  title.id = `${id}-title`;
  const summary = h('p', 'wt-levelend__sr', info.announce);
  summary.id = `${id}-summary`;
  // The last links (newest checked), behind the link count; closed by default.
  const receipt = h('div', 'wt-levelend__receipt');
  receipt.id = `${id}-links`;
  receipt.hidden = true;
  const rows = h('ol', 'wt-levelend__links');
  rows.append(...info.receipt.map((text, i) => {
    const row = h('li', 'wt-levelend__link');
    row.append(h('i', 'wt-levelend__dot'), h('span', '', text));
    if (i === info.receipt.length - 1) { row.classList.add('wt-levelend__link--last'); row.append(icon('check')); }
    return row;
  }));
  receipt.append(rows);
  // One line: [5 bağlantı ⌄] · 0 hata · 0 yardım.
  const stats = h('div', 'wt-levelend__stats');
  let toggle = null;
  stats.append(...info.stats.map((stat, i) => {
    const cell = h('div', 'wt-levelend__stat');
    const parts = [h('strong', '', String(stat.value)), h('span', '', stat.label)];
    if (i === 0 && info.receipt.length) {
      toggle = h('button', 'wt-levelend__toggle');
      toggle.type = 'button';
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-controls', receipt.id);
      toggle.setAttribute('aria-label', `${stat.value} ${stat.label}, son bağlantılar`);
      toggle.append(...parts, chevron());
      cell.append(toggle);
    } else cell.append(...parts);
    return cell;
  }));
  const note = h('p', 'wt-levelend__all-complete', info.note);
  note.hidden = !info.note;
  scroll.append(title, summary, stats, receipt, note);

  const callbacks = { next: onNext, replay: onReplay, levels: onLevels };
  const actions = h('footer', 'wt-levelend__actions');
  const buttons = info.actions.map(action => {
    const button = h('button', `wt-button wt-levelend__action wt-levelend__action--${action.id}`);
    button.type = 'button';
    button.dataset.action = action.id;
    if (action.primary) button.classList.add('wt-button--primary', 'wt-levelend__action--primary');
    if (action.wide) button.classList.add('wt-levelend__action--wide');
    button.append(...(action.iconAfter ? [action.label, icon(action.icon)] : [icon(action.icon), action.label]));
    return button;
  });
  actions.append(...buttons);
  body.append(scroll, actions);
  dock.append(sign);
  card.append(dock, body);
  root.append(card);

  // ---- the train moves into the dock; a placeholder of its size keeps the game's layout still ----
  const el = train?.el?.isConnected ? train.el : null;
  const from = el && el.getBoundingClientRect();
  const fromGeo = el && train.endGeometry?.();
  const home = el && { parent: el.parentNode, next: el.nextSibling, style: el.getAttribute('style') };
  const holder = el && h('div', 'wt-levelend__placeholder');
  if (el) {
    holder.setAttribute('aria-hidden', 'true');
    Object.assign(holder.style, { height: `${from.height}px`, flex: 'none', visibility: 'hidden' });
    home.parent.insertBefore(holder, el);
    dock.prepend(el);
  } else dock.classList.add('wt-levelend__dock--empty');
  // First open before levelend.css has arrived: no unstyled flash; the train re-frames itself on load.
  if (!styled) { root.style.visibility = 'hidden'; stylesLoading.then(() => { root.style.visibility = ''; }); }
  document.body.append(root);

  // A train without the station hook (e.g. a stale cached train.js next to a fresh levelend.js) still gets the
  // result card, but say so: the train part of the level end would silently be missing.
  if (train && typeof train.enterEnd !== 'function') console.warn('Word Train: train.enterEnd yok (eski train.js önbellekte mi?)');
  train?.enterEnd?.({ words: found, phrases: (level?.chain ?? []).map(link => link.phrase),
    bases: (level?.chain ?? []).map(link => link.base) });
  const previousInert = inert ? inert.inert : false;
  if (inert) inert.inert = true;

  let ready = false;
  let closed = false;
  const timers = new Set();
  const after = (ms, fn) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); };

  // ---- placement: only the sign, in the dock's own geometry (it steps aside for a locomotive under it) ----
  function place() {
    if (closed) return;
    const g = train?.endGeometry?.();
    const loco = g?.loco;
    const signLeft = (g?.width ?? 0) - 12 - 174;
    sign.hidden = !!loco && loco.right > signLeft && loco.top < 8 + 42;
    fitReceipt();
  }

  // Open links on a short screen / with big text: the oldest go first (down to one); then the middle scrolls.
  function fitReceipt() {
    const items = [...rows.children];
    items.forEach(item => { item.hidden = false; });
    if (receipt.hidden) return;
    for (const item of items.slice(0, -1)) {
      if (scroll.scrollHeight <= scroll.clientHeight + 1) break;
      item.hidden = true;
    }
  }

  toggle?.addEventListener('click', () => {
    const open = receipt.hidden;
    receipt.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    fitReceipt();
  });

  // ---- motion (visual only: nothing here holds the actions up) ----
  const mine = [];
  const play = (node, frames, timing) => {
    if (!motion || !node.animate) return null;
    const a = node.animate(frames, { fill: 'backwards', easing: 'ease-out', ...timing });
    mine.push(a);
    return a;
  };
  const LIFT = 12;
  if (motion) {
    const look = getComputedStyle(card);
    play(root, [{ backgroundColor: 'transparent' }, { backgroundColor: getComputedStyle(root).backgroundColor }], { duration: 260 });
    play(card, [{ transform: `translateY(${LIFT}px)` }, { transform: 'none' }], { duration: 260 });
    play(body, [{ opacity: 0 }, { opacity: 1 }], { duration: 260 });
    play(actions, [{ opacity: 0 }, { opacity: 1 }], { delay: 200, duration: 300 });
    play(sign, [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { delay: 450, duration: 500 });
    const to = el?.getBoundingClientRect();
    const toGeo = el && train.endGeometry?.();
    if (styled && el && from.width && from.height && fromGeo && toGeo) {
      // FLIP: the dock's bottom track starts where the game's bottom track was, at the game's scale.
      const s = Math.min(2, Math.max(1, fromGeo.k / toGeo.k));
      const dx = from.left + from.width / 2 - (to.left + to.width / 2);
      const dy = from.top + fromGeo.rail - (to.top + toGeo.rail) - LIFT;
      root.classList.add('wt-levelend--flight');
      play(card, [{ borderColor: 'transparent', boxShadow: 'none' }, { borderColor: look.borderTopColor, boxShadow: look.boxShadow }], { duration: 260 });
      const flight = play(el, [{ transform: `translate(${dx}px, ${dy}px) scale(${s})`, transformOrigin: `50% ${toGeo.rail}px`, borderRadius: '0px' },
        { transform: 'none', transformOrigin: `50% ${toGeo.rail}px` }], { duration: FLIGHT_MS, easing: 'cubic-bezier(.3, 0, .2, 1)' });
      flight?.finished.then(() => root.classList.remove('wt-levelend--flight'), () => {});
    } else {
      play(dock, [{ opacity: 0 }, { opacity: 1 }], { duration: 260 });
    }
  } else {
    root.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 140 });
  }
  actions.inert = true;
  after(motion ? READY_MS : 160, () => {
    ready = true;
    actions.inert = false;
    buttons[0].focus({ preventScroll: true });
  });

  function finish() {
    if (closed) return;
    timers.forEach(clearTimeout);
    timers.clear();
    for (const a of mine) { try { a.finish(); } catch { a.cancel(); } }
    root.classList.remove('wt-levelend--flight');
    train?.finishEnd?.();
    ready = true;
    actions.inert = false;
  }

  function destroy() {
    if (closed) return;
    closed = true;
    timers.forEach(clearTimeout);
    timers.clear();
    cancelAnimationFrame(frame);
    resizer?.disconnect();
    removeEventListener('resize', onResize);
    root.removeEventListener('keydown', onKey);
    for (const a of mine) a.cancel();
    // The train goes back to its old place (and look) before it leaves the station.
    if (el) {
      if (holder.parentNode) holder.replaceWith(el);
      else home.parent.insertBefore(el, home.next?.parentNode === home.parent ? home.next : null);
      if (home.style === null) el.removeAttribute('style'); else el.setAttribute('style', home.style);
    }
    root.remove();
    if (inert) inert.inert = previousInert;
    train?.exitEnd?.();
    if (active?.handle === handle) active = null;
  }

  // One tap: the card jumps to its last frame, closes, and the chosen action runs.
  function run(action) {
    if (closed) return;
    finish();
    destroy();
    options.sfx?.tap?.();
    callbacks[action]?.();
  }

  actions.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (button && ready) run(button.dataset.action);
  });
  // Focus stays in the card: the link toggle and the (ready) actions.
  function onKey(event) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); run('levels'); return; }
    if (event.key !== 'Tab') return;
    const live = [toggle, ...buttons].filter(node => node && !node.disabled && !node.closest('[inert]'));
    const i = live.indexOf(document.activeElement);
    event.preventDefault();
    live[i < 0 ? (event.shiftKey ? live.length - 1 : 0) : (i + (event.shiftKey ? live.length - 1 : 1)) % live.length]?.focus();
  }
  root.addEventListener('keydown', onKey);
  root.tabIndex = -1;
  root.focus({ preventScroll: true });

  let frame = 0;
  const onResize = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(place); };
  addEventListener('resize', onResize);
  const resizer = typeof ResizeObserver === 'function' ? new ResizeObserver(onResize) : null;
  if (el) resizer?.observe(el);
  resizer?.observe(body);
  place();

  const handle = { el: root, finish, destroy, get ready() { return ready; }, summary: info };
  active = { key, train, handle };
  return handle;
}
