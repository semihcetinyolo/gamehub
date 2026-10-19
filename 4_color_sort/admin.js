// In-game admin panel (gear button in the header): jump to any level, see which level
// introduces which feature and what every level contains. Reads LEVELS + FEATURE_INFO.
// window.openAdmin({ current, jump(i), getPockets(), setPockets(enabled) })
(() => {
  'use strict';
  const FEAT_COLOR = { hidden: '#a39cb4', clay: '#c9774a', box: '#a8763f', ice: '#7cc8ec', plaster: '#cfc8b6', stopper: '#e2583f', bag: '#bb9459', tag: '#f26482' };
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };

  // first level that uses each feature, and every level that uses it
  const first = {}, uses = {};
  LEVELS.forEach((L, i) => Object.keys(L.features || {}).forEach(f => {
    if (first[f] == null) first[f] = i;
    (uses[f] = uses[f] || []).push(i);
  }));
  const feats = Object.keys(FEATURE_INFO).filter(f => first[f] != null).sort((a, b) => first[a] - first[b]);

  const css = `
  #admin { position: fixed; inset: 0; z-index: 200; background: rgba(30,45,38,.55); backdrop-filter: blur(3px); display: flex; align-items: flex-end; justify-content: center; }
  #admin.hidden { display: none; }
  #admin .a-sheet { width: 100%; max-width: 520px; max-height: 92vh; display: flex; flex-direction: column; background: #fbf8ee; color: #22302a; border-radius: 22px 22px 0 0; box-shadow: 0 -10px 40px rgba(0,0,0,.25); font-family: ui-rounded, "SF Pro Rounded", system-ui, sans-serif; animation: admIn .25s ease-out; }
  @keyframes admIn { from { transform: translateY(40px); opacity: 0; } }
  #admin .a-head { display: flex; align-items: center; gap: 10px; padding: 16px 16px 10px; }
  #admin .a-head h2 { margin: 0; font-size: 19px; flex: 1; }
  #admin .a-x { width: 36px; height: 36px; border: 0; border-radius: 12px; background: #e9e6d6; font-size: 18px; font-weight: 900; cursor: pointer; }
  #admin .a-appearance { display: flex; align-items: center; gap: 14px; margin: 0 16px 14px; padding: 12px; border-radius: 14px; background: #eef1ea; }
  #admin .a-appearance-copy { flex: 1; min-width: 0; }
  #admin .a-appearance b { display: block; font-size: 14px; }
  #admin .a-appearance p { margin: 4px 0 0; font-size: 12px; line-height: 1.4; color: #6b7a72; }
  #admin .a-switch { display: flex; align-items: center; gap: 7px; min-height: 44px; padding: 4px; border: 0; background: transparent; color: #22302a; font: inherit; font-size: 12px; font-weight: 800; cursor: pointer; }
  #admin .a-switch:focus-visible { outline: 3px solid #c9963f; outline-offset: 3px; border-radius: 8px; }
  #admin .a-switch-track { width: 44px; height: 26px; padding: 3px; border-radius: 20px; background: #87948c; }
  #admin .a-switch-track::after { content: ''; display: block; width: 20px; height: 20px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px #0003; transition: transform .15s; }
  #admin .a-switch[aria-checked="true"] .a-switch-track { background: #2f6d5a; }
  #admin .a-switch[aria-checked="true"] .a-switch-track::after { transform: translateX(18px); }
  #admin .a-tabs { display: flex; gap: 6px; padding: 0 16px 10px; }
  #admin .a-tab { flex: 1; border: 2px solid #ddd9c6; background: #fff; border-radius: 12px; padding: 8px; font: inherit; font-size: 13px; font-weight: 800; cursor: pointer; }
  #admin .a-tab.a-on { background: #2f6d5a; border-color: #2f6d5a; color: #fff; }
  #admin .a-body { flex: 1; min-height: 0; overflow-y: auto; padding: 0 16px 18px; -webkit-overflow-scrolling: touch; touch-action: pan-y; }
  #admin .a-jump { display: flex; gap: 6px; margin-bottom: 12px; }
  #admin .a-jump input { flex: 1; min-width: 0; font: inherit; font-size: 16px; padding: 9px 10px; border: 2px solid #ddd9c6; border-radius: 12px; background: #fff; }
  #admin .a-jump button, #admin .a-tool { border: 0; border-radius: 12px; padding: 9px 12px; font: inherit; font-size: 14px; font-weight: 800; cursor: pointer; background: #2f6d5a; color: #fff; }
  #admin .a-jump .a-alt { background: #e9e6d6; color: #22302a; }
  #admin .a-feat { background: #fff; border-radius: 14px; padding: 10px 12px; margin-bottom: 8px; box-shadow: 0 1px 0 #e3dfcc; }
  #admin .a-feat b { font-size: 15px; }
  #admin .a-feat p { margin: 4px 0 8px; font-size: 12.5px; color: #6b7a72; line-height: 1.35; }
  #admin .a-dot { display: inline-block; width: 11px; height: 11px; border-radius: 4px; margin-right: 6px; vertical-align: -1px; }
  #admin .a-lv { display: inline-block; min-width: 30px; margin: 2px; padding: 4px 6px; border: 0; border-radius: 8px; background: #eef1ea; font: inherit; font-size: 12px; font-weight: 800; cursor: pointer; }
  #admin .a-lv.a-first { background: #f5a13a; color: #fff; }
  #admin .a-lv.a-cur { outline: 2px solid #2f6d5a; }
  #admin .a-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
  #admin .a-chip { border: 2px solid #ddd9c6; background: #fff; border-radius: 999px; padding: 4px 10px; font: inherit; font-size: 12px; font-weight: 800; cursor: pointer; }
  #admin .a-chip.a-on { background: #2f6d5a; border-color: #2f6d5a; color: #fff; }
  #admin .a-row { width: 100%; display: flex; align-items: center; gap: 8px; text-align: left; border: 0; background: #fff; border-radius: 14px; padding: 9px 10px; margin-bottom: 6px; font: inherit; color: inherit; cursor: pointer; box-shadow: 0 1px 0 #e3dfcc; }
  #admin .a-row.a-cur { outline: 2px solid #2f6d5a; }
  #admin .a-row .a-n { font-weight: 900; font-size: 15px; min-width: 30px; }
  #admin .a-row .a-mid { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
  #admin .a-row .a-meta { font-size: 11px; color: #6b7a72; font-weight: 700; }
  #admin .a-row .a-hard { color: #e2583f; }
  #admin .a-row .a-fs { display: flex; flex-wrap: wrap; gap: 4px; }
  #admin .a-row .a-f { font-size: 10.5px; font-weight: 800; border-radius: 6px; padding: 2px 6px; background: #eef1ea; }
  #admin .a-row .a-f.a-new { background: #f5a13a; color: #fff; }
  #admin .a-row .a-st { color: #f4b400; font-size: 12px; white-space: nowrap; }
  #admin .a-row .a-st .a-off { color: #dcdfd6; }
  #admin .a-tools { display: flex; gap: 8px; flex-wrap: wrap; }
  #admin .a-tool.a-alt { background: #e9e6d6; color: #22302a; }
  #admin .a-note { font-size: 12px; color: #6b7a72; margin: 10px 2px 0; }`;

  let root = null, ctx = null, tab = 'levels', filter = null;

  function build() {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    root = document.createElement('div');
    root.id = 'admin';
    root.className = 'hidden';
    root.innerHTML = `<div class="a-sheet">
      <div class="a-head"><h2>Ayarlar · Admin</h2><button class="a-x" data-a="close" aria-label="Kapat">✕</button></div>
      <div class="a-appearance"><div class="a-appearance-copy"><b id="admPocketLabel">Tüm yuvalarda cep</b><p id="admPocketHelp">Bilye alanlarını belirginleştirir. Renkli cep kuralı her zaman geçerlidir.</p></div>
        <button class="a-switch" data-a="pockets" role="switch" aria-checked="true" aria-labelledby="admPocketLabel" aria-describedby="admPocketHelp"><span class="a-switch-state" aria-hidden="true">Açık</span><span class="a-switch-track" aria-hidden="true"></span></button></div>
      <div class="a-tabs"><button class="a-tab" data-tab="levels">Bölümler</button><button class="a-tab" data-tab="features">Özellikler</button><button class="a-tab" data-tab="tools">Araçlar</button></div>
      <div class="a-body"></div></div>`;
    document.body.appendChild(root);
    root.addEventListener('click', onClick);
    root.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'admJump') go(+e.target.value - 1); });
  }

  function go(i) {
    if (!(i >= 0 && i < LEVELS.length)) return;
    close();
    ctx.jump(i);
  }
  function close() { root.classList.add('hidden'); }

  function onClick(e) {
    if (e.target === root) return close();
    const b = e.target.closest('[data-a], [data-tab], [data-go], [data-f]');
    if (!b) return;
    if (b.dataset.tab) { tab = b.dataset.tab; return render(); }
    if (b.dataset.go != null) return go(+b.dataset.go);
    if (b.dataset.f != null) { filter = b.dataset.f || null; return render(); }
    const a = b.dataset.a;
    if (a === 'pockets') { ctx.setPockets(!ctx.getPockets()); return renderPocketSetting(); }
    if (a === 'close') close();
    if (a === 'jump') go(+root.querySelector('#admJump').value - 1);
    if (a === 'prev') go(ctx.current - 1);
    if (a === 'next') go(ctx.current + 1);
    if (a === 'seen') { localStorage.removeItem('fcs_seen'); b.textContent = 'Tanıtımlar sıfırlandı ✓'; }
    if (a === 'progress') { localStorage.removeItem('fcs_stars'); localStorage.removeItem('fcs_level'); b.textContent = 'İlerleme sıfırlandı ✓'; }
  }

  const jumpBar = () => `<div class="a-jump">
    <button class="a-alt" data-a="prev" ${ctx.current <= 0 ? 'disabled' : ''}>◀</button>
    <input id="admJump" type="number" inputmode="numeric" min="1" max="${LEVELS.length}" placeholder="Bölüm no (1–${LEVELS.length})">
    <button data-a="jump">Git</button>
    <button class="a-alt" data-a="next" ${ctx.current >= LEVELS.length - 1 ? 'disabled' : ''}>▶</button></div>`;

  function levelsTab() {
    const stars = load('fcs_stars', {});
    const chips = `<div class="a-chips"><button class="a-chip ${filter ? '' : 'a-on'}" data-f="">Hepsi</button>` +
      feats.map(f => `<button class="a-chip ${filter === f ? 'a-on' : ''}" data-f="${f}">${FEATURE_INFO[f][0]}</button>`).join('') +
      `<button class="a-chip ${filter === 'none' ? 'a-on' : ''}" data-f="none">Özelliksiz</button></div>`;
    const rows = LEVELS.map((L, i) => [L, i]).filter(([L]) => {
      const fs = Object.keys(L.features || {});
      return !filter || (filter === 'none' ? !fs.length : fs.includes(filter));
    }).map(([L, i]) => {
      const fs = Object.keys(L.features || {});
      const got = stars[i] || 0;
      return `<button class="a-row ${i === ctx.current ? 'a-cur' : ''}" data-go="${i}">
        <span class="a-n">${i + 1}</span>
        <span class="a-mid">
          <span class="a-meta">${L.cols}×${L.rows} · hedef ${L.par} hamle${L.hard ? ' · <span class="a-hard">ZOR</span>' : ''}</span>
          <span class="a-fs">${fs.length ? fs.map(f => `<span class="a-f ${first[f] === i ? 'a-new' : ''}">${first[f] === i ? 'YENİ · ' : ''}${FEATURE_INFO[f][0]}</span>`).join('') : '<span class="a-meta">özellik yok</span>'}</span>
        </span>
        <span class="a-st">${[0, 1, 2].map(k => `<span class="${k < got ? '' : 'a-off'}">★</span>`).join('')}</span></button>`;
    }).join('');
    return jumpBar() + chips + rows;
  }

  function featuresTab() {
    return jumpBar() + feats.map(f => `<div class="a-feat">
      <b><span class="a-dot" style="background:${FEAT_COLOR[f] || '#999'}"></span>${FEATURE_INFO[f][0]}</b> · açıldığı bölüm
      <button class="a-lv a-first" data-go="${first[f]}">${first[f] + 1}</button>
      <p>${FEATURE_INFO[f][1]}</p>
      ${uses[f].map(i => `<button class="a-lv ${i === first[f] ? 'a-first' : ''} ${i === ctx.current ? 'a-cur' : ''}" data-go="${i}">${i + 1}</button>`).join('')}
      <span class="a-note">${uses[f].length} bölüm</span></div>`).join('');
  }

  function toolsTab() {
    return jumpBar() + `<div class="a-tools">
      <button class="a-tool a-alt" data-a="seen">Tanıtım kartlarını sıfırla</button>
      <button class="a-tool a-alt" data-a="progress">İlerlemeyi sıfırla</button></div>
      <p class="a-note">Tanıtım kartları: özellik ilk görüldüğünde çıkan "YENİ!" kartları tekrar gösterilir.<br>
      İlerleme: yıldızlar ve kayıtlı bölüm silinir.</p>`;
  }

  function renderPocketSetting() {
    const enabled = ctx.getPockets();
    const toggle = root.querySelector('[data-a="pockets"]');
    toggle.setAttribute('aria-checked', String(enabled));
    toggle.querySelector('.a-switch-state').textContent = enabled ? 'Açık' : 'Kapalı';
  }

  function render() {
    renderPocketSetting();
    root.querySelectorAll('.a-tab').forEach(t => t.classList.toggle('a-on', t.dataset.tab === tab));
    const body = root.querySelector('.a-body');
    body.innerHTML = tab === 'features' ? featuresTab() : tab === 'tools' ? toolsTab() : levelsTab();
    if (tab === 'levels') body.querySelector('.a-row.a-cur')?.scrollIntoView({ block: 'center' });
  }

  window.openAdmin = (c) => {
    ctx = c;
    if (!root) build();
    root.classList.remove('hidden');
    render();
  };
})();
