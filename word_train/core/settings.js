// Word Train — "Ayarlar" bottom sheet shared by both game modes: game mode switch (Ray Çiz / Sekiz Seçenek),
// sound and vibration switches, and a small "Yönetim" row that hands over to the admin sheet (core/admin.js).
// The sheet frame comes from theme.css (.wt-sheet); settings.css (loaded with this module) styles the contents.

import { sfx } from './sfx.js';
import { haptics } from './haptics.js';

const ROOT = new URL('../', import.meta.url);
const ICONS = new URL('../assets/icons.svg', import.meta.url).href;
const MODE_KEY = 'wordtrain.mode';

// Each mode's page, relative to the project root. Progress stays per mode; only the last mode is remembered.
export const MODES = {
  ray: { label: 'Ray Çiz', note: 'Harflerden yol çiz', page: 'v4/index.html' },
  secenek: { label: 'Sekiz Seçenek', note: 'Sekiz kelimeden seç', page: 'core/demo.html' },
};
export const DEFAULT_MODE = 'ray';

/** The last mode played ('ray' | 'secenek'), DEFAULT_MODE when none or unknown. */
export function storedMode() {
  try {
    const mode = localStorage.getItem(MODE_KEY);
    return MODES[mode] ? mode : DEFAULT_MODE;
  } catch { return DEFAULT_MODE; }
}

/** Each mode's page calls this on load, so the root page reopens the last mode. */
export function rememberMode(mode) {
  if (!MODES[mode]) return;
  try { localStorage.setItem(MODE_KEY, mode); } catch { /* private mode: the default mode opens */ }
}

export const modeUrl = (mode) => new URL(MODES[mode].page, ROOT).href;

const VIBRATE_ICON = '<svg class="wt-icon" viewBox="0 0 24 24" aria-hidden="true"><g stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"><rect x="8" y="3" width="8" height="18" rx="2"/><path d="M4 8v8M20 8v8"/></g></svg>';
const icon = (id) => `<svg class="wt-icon" aria-hidden="true"><use href="${ICONS}#${id}"></use></svg>`;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function loadCss() {
  if (document.getElementById('wt-settings-css')) return;
  const href = new URL('./settings.css', import.meta.url).href;
  document.head.append(Object.assign(document.createElement('link'), { id: 'wt-settings-css', rel: 'stylesheet', href }));
}

let activeClose = null;

/**
 * openSettings({ mode, onAdmin, onChange, onClose })
 *   mode      'ray' | 'secenek' — the page's own mode (selected in the switch)
 *   onAdmin   the "Yönetim" row was tapped (settings close first)
 *   onChange  ({ muted, haptics }) after a switch flips, so the page can redraw its own sound icon
 *   onClose   the sheet closed (not called when switching mode: the page navigates away)
 * Returns { close }.
 */
export function openSettings({ mode = DEFAULT_MODE, onAdmin, onChange, onClose } = {}) {
  activeClose?.();
  loadCss();
  const previousFocus = document.activeElement;
  const dialog = el('dialog', 'wt-sheet');
  dialog.id = 'wt-settings';
  dialog.setAttribute('aria-labelledby', 'wts-title');

  const head = el('header', 'wt-sheet__header');
  const heading = el('h2', '', 'Ayarlar');
  heading.id = 'wts-title';
  const closeButton = el('button', 'wt-icon-button');
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Kapat');
  closeButton.innerHTML = icon('close');
  head.append(heading, closeButton);

  const body = el('div', 'wt-sheet__body');

  // game mode: two-option segmented control (radio group)
  const modeTitle = el('h3', 'wts-label', 'Oyun modu');
  modeTitle.id = 'wts-mode';
  const segments = el('div', 'wts-segments');
  segments.setAttribute('role', 'radiogroup');
  segments.setAttribute('aria-labelledby', 'wts-mode');
  for (const [key, info] of Object.entries(MODES)) {
    const button = el('button', 'wts-segment');
    button.type = 'button';
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', String(key === mode));
    button.tabIndex = key === mode ? 0 : -1;
    button.append(el('strong', '', info.label), el('small', '', info.note));
    button.addEventListener('click', () => {
      if (key === mode) return;
      haptics.tap();
      rememberMode(key);
      segments.querySelectorAll('.wts-segment').forEach(b => b.setAttribute('aria-checked', String(b === button)));
      location.assign(modeUrl(key));
    });
    segments.append(button);
  }
  segments.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const other = [...segments.children].find(b => b !== document.activeElement);
    other?.focus();
  });

  // sound and vibration switches
  const list = el('div', 'wts-switches');
  const soundRow = switchRow('Ses', () => !sfx.muted, () => {
    sfx.setMuted(!sfx.muted);
    sfx.tap?.();
    renderSwitches();
  }, () => icon(sfx.muted ? 'mute' : 'sound'));
  const hapticsRow = switchRow('Titreşim', () => haptics.supported && haptics.enabled, () => {
    haptics.toggle();
    haptics.tap();
    renderSwitches();
  }, () => VIBRATE_ICON);
  list.append(soundRow.button, hapticsRow.button);

  function renderSwitches() {
    soundRow.render();
    hapticsRow.render(haptics.supported ? null : 'Bu cihazda yok');
    hapticsRow.button.disabled = !haptics.supported;
  }
  renderSwitches();

  // a quiet admin row at the very bottom: the test buttons stay in the admin sheet
  const admin = el('button', 'wts-admin');
  admin.type = 'button';
  admin.innerHTML = `${icon('admin')}<span>Yönetim</span><small>Test araçları</small>${icon('arrow-right')}`;
  admin.addEventListener('click', () => { close(); onAdmin?.(); });
  admin.hidden = !onAdmin;

  body.append(modeTitle, segments, el('h3', 'wts-label', 'Ses ve titreşim'), list, admin);
  dialog.append(el('div', 'wt-sheet__handle'), head, body);

  function switchRow(label, isOn, toggle, iconHtml) {
    const button = el('button', 'wts-switch');
    button.type = 'button';
    button.setAttribute('role', 'switch');
    const glyph = el('span', 'wts-switch__icon');
    const state = el('span', 'wts-switch__state');
    button.append(glyph, el('span', 'wts-switch__label', label), state, el('span', 'wts-switch__track'));
    button.addEventListener('click', () => { toggle(); onChange?.({ muted: sfx.muted, haptics: haptics.enabled }); });
    return {
      button,
      render(note = null) {
        const on = isOn();
        button.setAttribute('aria-checked', String(on));
        glyph.innerHTML = iconHtml();
        state.textContent = note ?? (on ? 'Açık' : 'Kapalı');
      },
    };
  }

  function close() {
    if (!dialog.isConnected) return;
    dialog.close();
    dialog.remove();
    if (activeClose === close) activeClose = null;
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    onClose?.();
  }
  closeButton.addEventListener('click', close);
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); event.stopPropagation(); close(); });
  // backdrop taps hit the dialog element itself, outside its rectangle
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close();
  });
  document.body.append(dialog);
  activeClose = close;
  dialog.showModal();
  closeButton.focus({ preventScroll: true });
  return { close };
}
