// Renders the wireframes / templates given to the image model (see
// assets/ASTRA_PROMPTS.md) into assets/wireframes/.
//   PW=/path/to/node_modules/playwright-core node tools/wireframes.js
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PW || 'playwright-core');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'wireframes');
const GAME = 'file://' + path.join(ROOT, 'index.html');
// Must match assets.js BOTTLE and the fallback bottle path in game.js.
const BOTTLE_PATH = 'M132 54 L132 140 C132 196 40 196 40 262 L40 796 Q40 850 94 850 L306 850 Q360 850 360 796 L360 262 C360 196 268 196 268 140 L268 54 Z';
const LIQ = { x: 58, y: 262, w: 284, h: 570 };

const FONT = 'font-family:ui-monospace,Menlo,monospace';
const CHECKER = 'background:repeating-conic-gradient(#e9e9e9 0 25%,#fff 0 50%) 0 0/32px 32px';

async function shotHTML(page, html, w, h, file) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<!doctype html><html><body style="margin:0;${FONT}">${html}</body></html>`);
  await page.screenshot({ path: path.join(OUT, file) });
}

async function gameLayouts(browser) {
  // 390x844 CSS px at 2.77x = 1080x2338, a modern tall phone.
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1080 / 390 });
  const shots = [[0, '01_layout_5_bottles.png'], [5, '02_layout_6_bottles.png'], [15, '03_layout_8_bottles.png'], [30, '04_layout_10_bottles.png']];
  for (const [lv, file] of shots) {
    await page.goto(`${GAME}?wire=1&level=${lv}`);
    await page.waitForFunction(() => window.CocktailGame && CocktailGame.state());
    await page.evaluate(() => CocktailGame.play());
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, file) });
  }
  // the same screen in colour, for mood/composition (built-in placeholder art)
  await page.goto(`${GAME}?level=15`);
  await page.waitForFunction(() => window.CocktailGame && CocktailGame.state());
  await page.evaluate(() => CocktailGame.play());
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, '05_layout_colour_placeholder.png') });

  // UI zones for the background, measured from the real layout at 9:16.
  await page.setViewportSize({ width: 405, height: 720 });
  await page.goto(`${GAME}?level=15`);
  await page.waitForFunction(() => window.CocktailGame && CocktailGame.state());
  await page.evaluate(() => CocktailGame.play());
  await page.waitForTimeout(500);
  const z = await page.evaluate(() => {
    const r = s => { const b = document.querySelector(s).getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; };
    return { hud: r('#hud'), cust: r('#customers'), board: r('#boardPanel'), hint: r('#hint') };
  });
  await page.close();
  return z;
}

function backgroundZones(z) {
  const k = 1080 / 405;
  const box = (r, label, col) => `<div style="position:absolute;left:${r.x * k}px;top:${r.y * k}px;width:${r.w * k}px;height:${r.h * k}px;` +
    `border:6px dashed ${col};background:${col}22;display:grid;place-items:center;font-size:34px;font-weight:700;color:${col};text-align:center">${label}</div>`;
  const crop = 1080 * (1 - 1920 / 2338) / 2;   // a 19.5:9 phone crops this much off each side of a 9:16 image
  return `<div style="position:relative;width:1080px;height:1920px;background:linear-gradient(#f6dcc0 0,#f0c9a0 55%,#c9915e 55%,#b07440 100%)">
    ${box(z.hud, 'HUD<br><small>bölüm · sipariş · kalpler · duraklat</small>', '#6b3fd0')}
    ${box(z.cust, 'MÜŞTERİ KARTLARI (kod)', '#d43f78')}
    ${box(z.board, 'ŞİŞE TEPSİSİ (kod)<br><small>şişe sayısına göre büyür / küçülür</small>', '#2a7fcf')}
    ${box(z.hint, 'ipucu', '#3a8a3a')}
    <div style="position:absolute;top:0;bottom:0;left:0;width:${crop}px;background:#0003;border-right:4px dashed #000"></div>
    <div style="position:absolute;top:0;bottom:0;right:0;width:${crop}px;background:#0003;border-left:4px dashed #000"></div>
    <div style="position:absolute;left:${crop + 40}px;right:${crop + 40}px;top:${(z.board.y + z.board.h * 0.7) * k}px;background:#fffffff0;border-radius:16px;padding:22px 26px;font-size:27px;line-height:1.45;color:#333">
      <b>bg_cafe.png · 1080×1920 · üzerinde UI yok</b><br>
      • Üst: kafe penceresi, gün ışığı, sakin<br>
      • Alt yarı: ahşap tezgâh yüzeyi (tepsi bunun üstünde durur)<br>
      • Orta sütun sade ve hafif bulanık, dekor sadece en sağ/sol kenarda<br>
      • Gri şeritler uzun telefonlarda kırpılır (~%9)</div>
  </div>`;
}

function bottleTemplate(labels) {
  const lines = [1, 2, 3].map(i => LIQ.y + LIQ.h * i / 4);
  const guide = labels ? `
    <rect x="${LIQ.x}" y="${LIQ.y}" width="${LIQ.w}" height="${LIQ.h}" fill="#ff2d5522" stroke="#ff2d55" stroke-width="3" stroke-dasharray="12 8"/>
    ${lines.map(y => `<line x1="${LIQ.x}" x2="${LIQ.x + LIQ.w}" y1="${y}" y2="${y}" stroke="#ff2d55" stroke-width="2" stroke-dasharray="4 6"/>`).join('')}
    <text x="200" y="${LIQ.y + LIQ.h / 2}" text-anchor="middle" font-size="22" fill="#c4001f" font-weight="700">SIVI ALANI</text>
    <text x="200" y="${LIQ.y + LIQ.h / 2 + 28}" text-anchor="middle" font-size="16" fill="#c4001f">kod çizer · 4 katman</text>
    <text x="200" y="${LIQ.y + LIQ.h / 2 + 50}" text-anchor="middle" font-size="16" fill="#c4001f">x58 y262 · 284×570</text>
    <text x="200" y="${LIQ.y - 12}" text-anchor="middle" font-size="15" fill="#c4001f">← en üst katman omuz çizgisinde biter →</text>` : '';
  return `<svg width="400" height="860" viewBox="0 0 400 860" xmlns="http://www.w3.org/2000/svg">
    <path d="${BOTTLE_PATH}" fill="${labels ? '#ffffffcc' : '#000'}" stroke="${labels ? '#444' : '#000'}" stroke-width="${labels ? 6 : 0}"/>
    <rect x="118" y="10" width="164" height="48" rx="16" fill="${labels ? '#ffffffcc' : '#000'}" stroke="${labels ? '#444' : '#000'}" stroke-width="${labels ? 6 : 0}"/>
    ${guide}</svg>`;
}

function bottleSheet() {
  return `<div style="display:flex;gap:60px;padding:40px;background:#fff;width:1340px;height:1080px;box-sizing:border-box">
    <div><div style="width:400px;height:860px;${CHECKER}">${bottleTemplate(true)}</div>
      <p style="font-size:20px;margin:12px 0 0"><b>bottle.png</b> · 400×860 · şeffaf arka plan</p></div>
    <div><div style="width:400px;height:860px;background:#fff;outline:1px solid #ccc">${bottleTemplate(false)}</div>
      <p style="font-size:20px;margin:12px 0 0">siluet (birebir bu sınırlar)</p></div>
    <div style="font-size:20px;line-height:1.55;width:400px">
      <b>Kurallar</b><br>• Boş, temiz cam şişe<br>• Tuval tam 400×860, şişe tuvali doldurur<br>• Gövde düz, alt köşe yuvarlak<br>
      • Kırmızı alan sıvı alanı: içi açık / neredeyse şeffaf olmalı, oraya renkli katmanları oyun çiziyor<br>
      • Gölge yok, zemin yok<br>• Yazı, etiket, kapak yok<br>• Parlama yalnız kenarlarda</div></div>`;
}

function customerSheet() {
  const cell = (label, note) => `<div style="width:512px">
    <div style="position:relative;width:512px;height:512px;${CHECKER};outline:2px solid #333">
      <div style="position:absolute;left:136px;top:50px;width:240px;height:270px;border:4px dashed #6b3fd0;border-radius:50%;display:grid;place-items:center;color:#6b3fd0;font-size:22px;font-weight:700">BAŞ</div>
      <div style="position:absolute;left:40px;right:40px;bottom:0;height:150px;border:4px dashed #2a7fcf;border-bottom:0;border-radius:120px 120px 0 0;display:grid;place-items:center start;padding-left:40px;color:#2a7fcf;font-size:20px;font-weight:700">omuzlar ·<br>alttan kesilir</div>
      <div style="position:absolute;right:16px;bottom:16px;width:130px;height:210px;background:#ff2d5530;border:4px dashed #ff2d55;display:grid;place-items:center;text-align:center;color:#c4001f;font-size:18px;font-weight:700">mini bardak<br>(kod)<br>boş bırak</div>
    </div><p style="font-size:22px;margin:10px 0 0"><b>${label}</b><br>${note}</p></div>`;
  return `<div style="display:flex;gap:40px;padding:40px;background:#fff;width:1696px;box-sizing:border-box">
    ${cell('customer_01.png', 'normal: sıcak gülümseme')}
    ${cell('customer_01_happy.png', 'mutlu: servis edildi, gözler kapalı neşe')}
    ${cell('customer_01_sad.png', 'üzgün: beklemekten sıkıldı, kaşlar çatık')}</div>`;
}

function iconSheet() {
  const icons = [
    ['heart_full.png', 'dolu kalp', '#ec3b52'], ['heart_empty.png', 'boş kalp (gri)', '#cfc4bd'],
    ['clock.png', 'kronometre / saat', '#8a5a2b'], ['coin.png', 'altın coin', '#e0a21a'], ['check_badge.png', 'yeşil onay rozeti', '#3cc152'],
    ['icon_pause.png', 'mor yuvarlak duraklat butonu', '#7a3fe6'],
  ];
  return `<div style="display:flex;flex-wrap:wrap;gap:36px;padding:40px;background:#fff;width:1560px;box-sizing:border-box">
    ${icons.map(([f, d, c]) => `<div style="width:256px">
      <div style="width:256px;height:256px;${CHECKER};outline:2px solid #333;display:grid;place-items:center">
        <div style="width:208px;height:208px;border:4px dashed ${c};border-radius:24px;display:grid;place-items:center;color:${c};font-size:18px;text-align:center;font-weight:700">${d}<br>~208px<br>ortada</div></div>
      <p style="font-size:20px;margin:10px 0 0"><b>${f}</b><br>256×256 · şeffaf</p></div>`).join('')}
    <div style="width:600px">
      <div style="width:600px;height:400px;${CHECKER};outline:2px solid #333;display:grid;place-items:center;color:#555;font-size:22px;text-align:center">
        win_art.png / lose_art.png<br>600×400 · şeffaf<br>pop-up üstünde duran küçük illüstrasyon</div></div></div>`;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const zones = await gameLayouts(browser);
  const page = await browser.newPage();
  await shotHTML(page, backgroundZones(zones), 1080, 1920, '06_background_zones.png');
  await shotHTML(page, bottleSheet(), 1340, 1080, '07_bottle_template.png');
  await shotHTML(page, `<div style="width:400px;height:860px;background:#fff">${bottleTemplate(false)}</div>`, 400, 860, '07b_bottle_silhouette_400x860.png');
  await shotHTML(page, customerSheet(), 1696, 680, '08_customer_template.png');
  await shotHTML(page, iconSheet(), 1560, 820, '09_icons_template.png');
  await browser.close();
  console.log('wireframes ->', path.relative(ROOT, OUT));
})();
