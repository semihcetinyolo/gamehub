// Word Train — the level-end result station, shared by every variant (design/visual.md "Level end").
// The train's bottom track becomes the platform of a station: the last pair stays on the rail, the result
// surface opens downward from it and the locomotive pulls into the station on the row above. The three
// actions take taps from ~600 ms on; a tap finishes every animation and runs the action right away.
//
//   const end = openLevelEnd({ train, level, found, mistakes, hints, last, number, sfx, inert,
//                              onNext, onReplay, onLevels });
//   end.finish()   jump to the last frame          end.destroy()   close (the train goes back to normal)
//
// levelEndSummary() is the pure part (texts and numbers) and is tested on its own.

import { phraseOf, trUpper } from './logic.js';

const READY_MS = 600;        // actions take taps from here on (160 ms with reduced motion)
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
    note: last ? 'Tüm bölümler tamamlandı. Yeni bir yolculuk için bir bölüm seç.' : '',
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

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'wt-icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `${ICONS}#${name}`);
  svg.append(use);
  return svg;
}

// levelend.css comes along with this module, so a variant only has to import it.
function ensureStyles() {
  const href = new URL('./levelend.css', import.meta.url).href;
  if ([...document.styleSheets].some(sheet => sheet.href === href) || document.querySelector(`link[href="${href}"]`)) return;
  document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href }));
}

let active = null;
let serial = 0;

/**
 * Opens the result station over the game. train = mountTrain() handle (its view turns into the station);
 * level = the finished level ({ id, title, chain }); found / mistakes / hints from the run state; last = the
 * final level (no "Sonraki bölüm"); number = level number to show; sfx = core/sfx.js (optional);
 * inert = element to make inert behind the station (e.g. the game's main element).
 * onNext / onReplay / onLevels run once, after the station has closed. Escape = onLevels.
 * Opening the same result again returns the open one.
 */
export function openLevelEnd(options) {
  const { train, level, found = [], last = false, inert, onNext, onReplay, onLevels } = options;
  const key = `${level?.id}:${found.length}`;
  if (active && active.key === key && active.train === train) return active.handle;
  active?.handle.destroy();
  ensureStyles();

  const info = levelEndSummary(options);
  const id = `wt-levelend-${++serial}`;
  const motion = !reducedMotion();
  const root = h('section', 'wt-levelend');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', `${id}-title`);
  root.setAttribute('aria-describedby', `${id}-summary`);
  if (last) root.classList.add('wt-levelend--last');

  const sign = h('div', 'wt-levelend__station-sign');
  sign.setAttribute('aria-hidden', 'true');
  sign.append(h('small', '', info.sign.small), h('strong', '', info.sign.name));

  const body = h('div', 'wt-levelend__body');
  const scroll = h('div', 'wt-levelend__scroll');
  const tag = h('div', 'wt-levelend__phrase');
  const tick = icon('check');
  tag.append(tick, h('span', '', info.phrase));
  tag.setAttribute('aria-label', `Son tamlama: ${info.phrase}`);
  const title = h('h2', 'wt-levelend__title', info.title);
  title.id = `${id}-title`;
  const summary = h('p', 'wt-levelend__sr', info.announce);
  summary.id = `${id}-summary`;
  const stats = h('div', 'wt-levelend__stats');
  stats.setAttribute('aria-hidden', 'true');
  stats.append(...info.stats.map(stat => {
    const cell = h('div', 'wt-levelend__stat');
    cell.append(h('strong', '', String(stat.value)), h('span', '', stat.label));
    return cell;
  }));
  const receipt = h('div', 'wt-levelend__receipt');
  const rows = h('ol', 'wt-levelend__links');
  rows.append(...info.receipt.map((text, i) => {
    const row = h('li', 'wt-levelend__link');
    row.append(h('i', 'wt-levelend__dot'), h('span', '', text));
    if (i === info.receipt.length - 1) { row.classList.add('wt-levelend__link--last'); row.append(icon('check')); }
    return row;
  }));
  receipt.append(h('p', 'wt-levelend__receipt-title', 'SON BAĞLANTILAR'), rows);
  receipt.hidden = !info.receipt.length;
  const note = h('p', 'wt-levelend__all-complete', info.note);
  note.hidden = !info.note;
  scroll.append(tag, title, summary, stats, receipt, note);

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
  root.append(sign, body);
  document.body.append(root);

  // A train without the station hook (e.g. a stale cached train.js next to a fresh levelend.js) still gets the
  // result surface, but say so: the train part of the level end would silently be missing.
  if (train && typeof train.enterEnd !== 'function') console.warn('Word Train: train.enterEnd yok (eski train.js önbellekte mi?)');
  const geometry = train?.enterEnd?.({ words: found, phrases: (level?.chain ?? []).map(link => link.phrase),
    bases: (level?.chain ?? []).map(link => link.base) });
  const previousInert = inert ? inert.inert : false;
  if (inert) inert.inert = true;

  let ready = false;
  let closed = false;
  const timers = new Set();
  const after = (ms, fn) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); };

  // ---- placement: everything hangs off the train's bottom track ----
  function place() {
    if (closed) return;
    const g = train?.endGeometry?.() ?? geometry;
    if (g) {
      const k = g.k ?? 1;
      root.style.setProperty('--wt-k', k.toFixed(3));
      body.style.top = `${Math.round(g.rect.top + g.height)}px`;
      const loco = g.loco;
      const room = g.upper === null || !loco ? 0 : g.width - g.xa - loco.right - 14;
      sign.hidden = room < 120;
      if (!sign.hidden) {
        const w = Math.min(214, room), hgt = Math.min(69, Math.max(48, 69 * k));
        Object.assign(sign.style, { width: `${w}px`, height: `${hgt}px`,
          left: `${Math.round(g.rect.left + g.width - g.xa - w)}px`,
          top: `${Math.round(g.rect.top + Math.max(4, g.upper - 10 * k - hgt))}px` });
      }
    } else {
      body.style.top = '35%';
      sign.hidden = true;
    }
    fitReceipt();
  }

  // Short screens / big text: the oldest links go first (down to one); then the middle part scrolls.
  function fitReceipt() {
    const items = [...rows.children];
    items.forEach(item => { item.hidden = false; });
    for (const item of items.slice(0, -1)) {
      if (scroll.scrollHeight <= scroll.clientHeight + 1) break;
      item.hidden = true;
    }
  }

  // ---- motion (visual only: nothing here holds the actions up) ----
  const play = (node, frames, timing) => motion && node.animate(frames, { fill: 'backwards', easing: 'ease-out', ...timing });
  if (motion) {
    play(body, [{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0 0)' }], { delay: 180, duration: 420 });
    play(actions, [{ opacity: 0 }, { opacity: 1 }], { delay: 300, duration: 300 });
    play(tag, [{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { delay: 500, duration: 350 });
    play(tick, [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'none' }], { delay: 1700, duration: 250 });
    [...rows.children].forEach((row, i) => play(row, [{ opacity: 0 }, { opacity: 1 }], { delay: 700 + i * 70, duration: 160 }));
    play(sign, [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { delay: 450, duration: 500 });
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
    for (const a of root.getAnimations?.({ subtree: true }) ?? []) { try { a.finish(); } catch { a.cancel(); } }
    train?.finishEnd?.();
    ready = true;
    actions.inert = false;
  }

  function destroy() {
    if (closed) return;
    closed = true;
    timers.forEach(clearTimeout);
    timers.clear();
    resizer?.disconnect();
    removeEventListener('resize', onResize);
    root.removeEventListener('keydown', onKey);
    root.remove();
    if (inert) inert.inert = previousInert;
    train?.exitEnd?.();
    if (active?.handle === handle) active = null;
  }

  // One tap: the station jumps to its last frame, closes, and the chosen action runs.
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
  function onKey(event) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); run('levels'); return; }
    if (event.key !== 'Tab') return;
    const live = buttons.filter(button => !button.disabled);
    const i = live.indexOf(document.activeElement);
    event.preventDefault();
    live[(i + (event.shiftKey ? live.length - 1 : 1)) % live.length]?.focus();
  }
  root.addEventListener('keydown', onKey);
  root.tabIndex = -1;
  root.focus({ preventScroll: true });

  let frame = 0;
  const onResize = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(place); };
  addEventListener('resize', onResize);
  const resizer = train?.el && typeof ResizeObserver === 'function' ? new ResizeObserver(onResize) : null;
  resizer?.observe(train.el);
  resizer?.observe(body);
  place();

  const handle = { el: root, finish, destroy, get ready() { return ready; }, summary: info };
  active = { key, train, handle };
  return handle;
}
