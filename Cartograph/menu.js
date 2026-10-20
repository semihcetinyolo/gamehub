// Main menu, player profile and the stained-glass collection.
// Art made in ChatGPT (tools/menu/PROMPTS.md) is listed in menu-art.js; until a picture exists the
// menu draws a code-made stand-in, so a missing image never breaks it.
(function () {
  'use strict';

  const G = window.CartoGame;
  const STAINED = window.CARTO_STAINED;
  const ART = window.CARTO_MENU_ART || {};
  const store = G.store;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const menu = $('menu');
  const AVATARS = 8;

  // ---------- profile ----------
  const P = Object.assign({ name: '', avatar: 0 }, store.get('profile', {}));
  if (!P.name) {
    P.name = 'Kâşif ' + (1000 + Math.floor(Math.random() * 9000));
    store.set('profile', P);
  }
  const activeIds = new Set(STAINED.map(L => L.id));
  const solved = () => store.get('solved', []).filter(id => activeIds.has(id));
  const stats = () => ({
    panels: new Set(solved()).size,
    panes: store.get('stats.panes', 0),
    perfect: new Set(store.get('perfect', []).filter(id => activeIds.has(id))).size,
    hints: store.get('stats.hints', 0),
  });

  // Stand-in avatar until avatar-N exists: a small rose window in its own four colours.
  const AVATAR_COLORS = [
    ['#d84602', '#f6c343', '#2e6b4f', '#f3ead2'], ['#1e40af', '#f4b400', '#0f8a5f', '#a4161a'],
    ['#7b4b2a', '#ffbf00', '#6b8e23', '#f7f7f2'], ['#13878a', '#f2b81b', '#1d2b6b', '#d8dde6'],
    ['#c8102e', '#f28cb1', '#3f9b2f', '#f4e3b2'], ['#2a9d8f', '#fa8072', '#264b7a', '#f1dcb0'],
    ['#e0218a', '#9bd53a', '#ff7b00', '#2b4acb'], ['#294f43', '#d7b76c', '#bf8c70', '#7f9bb8'],
  ];
  function avatarSVG(i) {
    const c = AVATAR_COLORS[i % AVATAR_COLORS.length];
    let wedges = '';
    for (let k = 0; k < 8; k++) {
      const a0 = (k / 8) * Math.PI * 2 - Math.PI / 2, a1 = ((k + 1) / 8) * Math.PI * 2 - Math.PI / 2;
      const p = (r, a) => `${(50 + r * Math.cos(a)).toFixed(2)} ${(50 + r * Math.sin(a)).toFixed(2)}`;
      wedges += `<path d="M${p(18, a0)}L${p(46, a0)}A46 46 0 0 1 ${p(46, a1)}L${p(18, a1)}A18 18 0 0 0 ${p(18, a0)}Z" fill="${c[k % 2]}"/>`;
    }
    return `<svg viewBox="0 0 100 100" aria-hidden="true">${wedges}<circle cx="50" cy="50" r="18" fill="${c[2]}"/><circle cx="50" cy="50" r="7" fill="${c[3]}"/>
      <g fill="none" stroke="#2b3127" stroke-width="3"><circle cx="50" cy="50" r="46"/><circle cx="50" cy="50" r="18"/>${[0, 1, 2, 3, 4, 5, 6, 7].map(k => {
        const a = (k / 8) * Math.PI * 2 - Math.PI / 2;
        return `<path d="M${(50 + 18 * Math.cos(a)).toFixed(2)} ${(50 + 18 * Math.sin(a)).toFixed(2)}L${(50 + 46 * Math.cos(a)).toFixed(2)} ${(50 + 46 * Math.sin(a)).toFixed(2)}"/>`;
      }).join('')}</g></svg>`;
  }
  function avatarHTML(i, cls) {
    const src = ART['avatar-' + (i + 1)];
    const face = src ? `<img src="${src}" alt="" draggable="false">` : avatarSVG(i);
    const frame = ART['avatar-frame'] ? `<img class="av-frame" src="${ART['avatar-frame']}" alt="" draggable="false">` : '';
    return `<span class="avatar${cls ? ' ' + cls : ''}${frame ? ' framed' : ''}"><span class="av-face">${face}</span>${frame}</span>`;
  }

  // ---------- small panel drawings ----------
  // A level's panel: its finished AI glass if solved, otherwise the empty leading with the
  // pre-painted panes in colour (a teaser of what is waiting).
  // Unfinished panels use the board's look: with 3D (the default) every pane is a bevelled tile
  // like in the game; small collection tiles skip the bevel filter to stay light.
  let uid = 0;
  const is3D = () => document.getElementById('app').dataset.boardLook !== 'classic';
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const ch = v => Math.max(0, Math.min(255, Math.round(v + (amt > 0 ? (255 - v) * amt : v * amt))));
    return `rgb(${ch(n >> 16)}, ${ch((n >> 8) & 255)}, ${ch(n & 255)})`;
  }
  function panelSVG(L, done, small) {
    const m = L.map, id = 'mp' + (uid++);
    const clip = `<clipPath id="${id}"><path d="${m.shape}"/></clipPath>`;
    if (done) {
      return `<svg viewBox="0 0 ${m.cols} ${m.rows}" aria-hidden="true"><defs>${clip}</defs>
        <image href="${L.image}" width="${m.cols}" height="${m.rows}" preserveAspectRatio="none" clip-path="url(#${id})"/>
        <path d="${m.shape}" fill="none" stroke="#2f362b" stroke-width="2.6" vector-effect="non-scaling-stroke"/></svg>`;
    }
    const empty = L.palette.some(c => { const n = parseInt(c.slice(1), 16); return ((n >> 16) * .3 + ((n >> 8) & 255) * .59 + (n & 255) * .11) > 200; }) ? '#c9c5ad' : '#efeddc';
    const colors = [empty, ...L.palette];
    const fill = r => (L.given[r] >= 0 ? L.given[r] + 1 : 0);
    if (!is3D()) {
      return `<svg viewBox="0 0 ${m.cols} ${m.rows}" aria-hidden="true">
        ${m.paths.map((d, r) => `<path d="${d}" fill="${colors[fill(r)]}"/>`).join('')}
        <path d="${m.edgePath}" fill="none" stroke="#3a4234" stroke-width="1.3" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
        <path d="${m.shape}" fill="none" stroke="#2f362b" stroke-width="2.6" vector-effect="non-scaling-stroke"/></svg>`;
    }
    const grads = colors.map((c, i) => `<linearGradient id="${id}c${i}" x1="0%" y1="0%" x2="75%" y2="100%">
        ${[[0, shade(c, .22)], [.35, shade(c, .05)], [.7, c], [1, shade(c, -.18)]].map(([o, v]) => `<stop offset="${o}" stop-color="${v}"/>`).join('')}</linearGradient>`).join('');
    const glaze = `<linearGradient id="${id}g" x1="0%" y1="0%" x2="65%" y2="100%">${[[0, .22], [.28, .04], [.48, .1], [.65, 0], [1, 0]].map(([o, a]) => `<stop offset="${o}" stop-color="#fff" stop-opacity="${a}"/>`).join('')}</linearGradient>`;
    const bevel = small ? '' : `<filter id="${id}b" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">
        <feOffset in="SourceAlpha" dx=".065" dy=".075" result="down"/><feComposite in="SourceAlpha" in2="down" operator="out" result="topEdge"/>
        <feGaussianBlur in="topEdge" stdDeviation=".025" result="topSoft"/><feFlood flood-color="#fff9de" flood-opacity=".85" result="light"/>
        <feComposite in="light" in2="topSoft" operator="in" result="highlight"/>
        <feOffset in="SourceAlpha" dx="-.075" dy="-.1" result="up"/><feComposite in="SourceAlpha" in2="up" operator="out" result="bottomEdge"/>
        <feGaussianBlur in="bottomEdge" stdDeviation=".035" result="bottomSoft"/><feFlood flood-color="#15201d" flood-opacity=".7" result="shade"/>
        <feComposite in="shade" in2="bottomSoft" operator="in" result="shadow"/>
        <feMerge><feMergeNode in="shadow"/><feMergeNode in="highlight"/></feMerge></filter>`;
    return `<svg viewBox="0 0 ${m.cols} ${m.rows}" aria-hidden="true"><defs>${grads}${glaze}${bevel}</defs>
      ${m.paths.map((d, r) => `<path d="${d}" fill="url(#${id}c${fill(r)})"/>`).join('')}
      ${m.paths.map(d => `<path d="${d}" fill="url(#${id}g)"/>${small ? '' : `<path d="${d}" fill="#fff" filter="url(#${id}b)"/>`}`).join('')}
      <path d="${m.edgePath}" fill="none" stroke="#30332c" stroke-width="${small ? 1.6 : 3.2}" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
      <path d="${m.shape}" fill="none" stroke="#44483a" stroke-width="${small ? 2.6 : 4.5}" vector-effect="non-scaling-stroke"/></svg>`;
  }

  const EMBLEM = ART['logo-emblem']
    ? `<img src="${ART['logo-emblem']}" alt="" draggable="false">`
    : `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" fill="#294f43" stroke="#d7b76c" stroke-width="5"/>
        <path d="M50 10 60 40 90 50 60 60 50 90 40 60 10 50 40 40Z" fill="#f3ead2" stroke="#2b3127" stroke-width="2.5" stroke-linejoin="round"/>
        <path d="M50 10 60 40 50 50ZM90 50 60 60 50 50ZM50 90 40 60 50 50ZM10 50 40 40 50 50Z" fill="#d7b76c"/>
        <circle cx="50" cy="50" r="6" fill="#bf8c70" stroke="#2b3127" stroke-width="2.5"/></svg>`;
  const ICON_GALLERY = ART['icon-collection'] ? `<img src="${ART['icon-collection']}" alt="" draggable="false">` : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V10a7 7 0 0 1 14 0v11Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M12 3v18M5 13h14" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>`;
  const ICON_GEAR = document.querySelector('#settingsBtn svg').outerHTML;

  // ---------- main menu ----------
  function renderMenu() {
    const level = G.S.level, L = STAINED[level - 1], s = stats();
    const all = solved(), done = all.includes(L.id);
    menu.innerHTML = `
      <div class="menu-top">
        <button class="profile-chip" id="menuProfile" type="button" aria-label="Profil: ${esc(P.name)}">
          ${avatarHTML(P.avatar, 'sm')}
          <span class="pc-text"><b>${esc(P.name)}</b><small>${s.panels}/${STAINED.length} vitray</small></span>
        </button>
        <button class="round-btn" id="menuSettings" type="button" aria-label="Ayarlar">${ICON_GEAR}</button>
      </div>
      <div class="menu-title">
        <span class="menu-emblem">${EMBLEM}</span>
        <h1>CARTOGRAPH</h1>
      </div>
      <button class="menu-panel" id="menuPanel" type="button" aria-label="Seviye ${level}: ${esc(L.name)}">
        <span class="mp-glass">${panelSVG(L, done)}</span>
      </button>
      <div class="menu-actions">
        <button class="btn-green menu-play" id="menuPlay" type="button"><span>OYNA</span><small${L.difficulty?.tier === 'hard' ? ' class="difficulty-holder"' : ''}>SEVİYE ${level}${L.difficulty?.tier === 'hard' ? ' · ZOR' : ''}</small></button>
        <button class="btn-flat menu-gallery" id="menuGallery" type="button">${ICON_GALLERY}<span>KOLEKSİYON</span><b>${s.panels}/${STAINED.length}</b></button>
      </div>`;
    $('menuProfile').addEventListener('click', openProfile);
    $('menuSettings').addEventListener('click', () => G.settings());
    $('menuPlay').addEventListener('click', play);
    $('menuPanel').addEventListener('click', play);
    $('menuGallery').addEventListener('click', openGallery);
  }

  if (ART['menu-background']) menu.style.setProperty('--menu-bg', `url("${ART['menu-background']}")`);

  function show() {
    renderMenu();
    menu.hidden = false;
    document.body.classList.add('in-menu');
  }
  function hide() {
    menu.hidden = true;
    document.body.classList.remove('in-menu');
  }
  function play(n) {
    hide();
    G.play(typeof n === 'number' ? n : undefined);
  }

  // ---------- profile card ----------
  const card = $('card'), overlay = $('overlay');
  function openCard(html, cls) {
    card.className = 'card' + (cls ? ' ' + cls : '');
    card.innerHTML = html;
    overlay.classList.remove('hidden');
  }
  function closeCard() {
    overlay.classList.add('hidden');
    card.className = 'card';
  }

  let pick = P.avatar;
  function openProfile() {
    pick = P.avatar;
    const s = stats();
    openCard(`
      <button class="close" data-menu="close" aria-label="Kapat"></button>
      <h2>PROFİL</h2>
      <div class="prof-head">${avatarHTML(pick, 'xl')}</div>
      <label class="prof-name"><span>KÂŞİF ADI</span>
        <input id="profName" type="text" maxlength="14" autocomplete="off" spellcheck="false" enterkeyhint="done" value="${esc(P.name)}"></label>
      <div class="prof-avatars" role="radiogroup" aria-label="Profil resmi">
        ${Array.from({ length: AVATARS }, (_, i) => `<button type="button" role="radio" class="av-pick" data-av="${i}" aria-label="Profil resmi ${i + 1}" aria-checked="${i === pick}">${avatarHTML(i, 'md')}</button>`).join('')}
      </div>
      <div class="prof-stats">
        <div><b>${s.panels}<small>/${STAINED.length}</small></b><span>Tamamlanan vitray</span></div>
        <div><b>${s.panes}</b><span>Boyanan cam</span></div>
        <div><b>${s.perfect}</b><span>İpucusuz vitray</span></div>
        <div><b>${s.hints}</b><span>Kullanılan ipucu</span></div>
      </div>
      <button class="btn-green" id="profSave" type="button" disabled>KAYDET</button>`, 'profile-card');
    const input = $('profName'), save = $('profSave');
    const dirty = () => pick !== P.avatar || input.value.trim() !== P.name;
    const update = () => {
      save.disabled = !dirty() || !input.value.trim();
      card.querySelector('.prof-head').innerHTML = avatarHTML(pick, 'xl');
      card.querySelectorAll('.av-pick').forEach(b => b.setAttribute('aria-checked', String(+b.dataset.av === pick)));
    };
    input.addEventListener('input', update);
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !save.disabled) save.click(); });
    card.querySelectorAll('.av-pick').forEach(b => b.addEventListener('click', () => { pick = +b.dataset.av; update(); }));
    save.addEventListener('click', () => {
      P.avatar = pick;
      P.name = input.value.trim().slice(0, 14);
      store.set('profile', P);
      closeCard();
      renderMenu();
    });
  }

  // ---------- collection ----------
  function openGallery() {
    const all = new Set(solved()), perfect = new Set(store.get('perfect', []));
    openCard(`
      <button class="close" data-menu="close" aria-label="Kapat"></button>
      <h2>KOLEKSİYON</h2>
      <p class="gal-sub">${all.size}/${STAINED.length} vitray tamamlandı</p>
      <div class="gal-grid">
        ${STAINED.map((L, i) => {
          const done = all.has(L.id);
          return `<button type="button" class="gal-tile${done ? ' done' : ''}" data-i="${i}" aria-label="${i + 1}. ${esc(L.name)}${done ? '' : ', tamamlanmadı'}">
            <span class="gal-art">${panelSVG(L, done, true)}</span>
            <span class="gal-name">${done ? esc(L.name) : (i + 1) + '. bölüm'}</span>
            ${L.difficulty?.tier === 'hard' ? `<span class="gal-difficulty">${L.canvasSize === 'large' ? 'BÜYÜK · ' : ''}ZOR</span>` : ''}
            ${perfect.has(L.id) ? '<i class="gal-star" title="İpucusuz">★</i>' : ''}
          </button>`;
        }).join('')}
      </div>`, 'gallery-card');
    card.querySelectorAll('.gal-tile').forEach(b => b.addEventListener('click', () => {
      const i = +b.dataset.i, L = STAINED[i];
      if (!all.has(L.id)) { closeCard(); play(i + 1); return; }
      openCard(`
        <button class="close" data-menu="gallery" aria-label="Geri"></button>
        <h2>${esc(L.name.toLocaleUpperCase('tr'))}</h2>
        <div class="gal-big">${panelSVG(L, true)}</div>
        <p class="gal-sub">${i + 1}. bölüm${perfect.has(L.id) ? ' · ipucusuz' : ''}</p>
        ${L.difficulty?.tier === 'hard' ? `<p><span class="gal-difficulty">${L.canvasSize === 'large' ? 'BÜYÜK · ' : ''}ZOR</span></p>` : ''}
        <button class="btn-green" type="button" data-play="${i + 1}">TEKRAR OYNA</button>
        <button class="btn-flat" type="button" data-menu="gallery">KOLEKSİYONA DÖN</button>`, 'gallery-card');
    }));
  }

  card.addEventListener('click', e => {
    const b = e.target.closest('[data-menu],[data-play]');
    if (!b) return;
    e.stopPropagation();
    if (b.dataset.play) { closeCard(); play(+b.dataset.play); }
    else if (b.dataset.menu === 'gallery') openGallery();
    else closeCard();
  }, true);

  window.addEventListener('carto:solved', () => { if (!menu.hidden) renderMenu(); });
  // Starting a level from the settings' level grid while the menu is open goes straight in.
  card.addEventListener('click', e => {
    if (!menu.hidden && e.target.closest('[data-act="glass"],[data-act="tutorial"]')) setTimeout(hide, 0);
  });

  window.CartoMenu = { show, hide, profile: () => P, stats, openProfile, openGallery };
  show();
})();
