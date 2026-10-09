// Renders the conveyor-belt wireframes / templates given to the image model
// (see assets/ASTRA_PROMPTS.md) into assets/wireframes/, one set per view.
//   PW=/path/to/node_modules/playwright-core node tools/wireframes.js
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PW || 'playwright-core');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'wireframes');
const GAME = 'file://' + path.join(ROOT, 'index.html');
const VIEWS = [['v1', 10, 'round loop, customers left / top / right'], ['v2', 11, 'tall loop, customers in two columns'], ['v3', 12, 'wide flat loop, customers in a row above']];
const LONG = 1024;   // long side of the belt templates
const FONT = 'font-family:ui-monospace,Menlo,monospace';
const CHECKER = 'background:repeating-conic-gradient(#e9e9e9 0 25%,#fff 0 50%) 0 0/32px 32px';

async function openGame(page, view, wire) {
  await page.goto(`${GAME}?level=15&view=${view}${wire ? '&wire=1' : ''}`);
  await page.waitForFunction(() => window.FlowGame && FlowGame.state());
  await page.evaluate(() => FlowGame.play());
  await page.waitForTimeout(700);
  // one drink riding the belt, so the screen shows what the belt carries
  await page.evaluate(() => {
    const st = FlowGame.state(), L = window.FLOW_LEVELS.find(l => l.levelOrder === st.levelOrder);
    FlowGame.setVessel(3, L.orders[st.slots[st.slots.length - 1].uid].layers);
  });
  await page.waitForTimeout(1400);
}

// Exact loop shape. labels = annotated version, otherwise a clean silhouette on
// transparent background.
function template(b, labels) {
  const k = LONG / Math.max(b.box.w, b.box.h);
  const W = Math.round(b.box.w * k), H = Math.round(b.box.h * k);
  const vb = `${b.box.x} ${b.box.y} ${b.box.w} ${b.box.h}`;
  const t = (x, y, s, txt, col = '#222', anchor = 'middle') =>
    `<text x="${x}" y="${y}" font-size="${s}" fill="${col}" text-anchor="${anchor}" font-weight="700" style="${FONT}">${txt}</text>`;
  const fs1 = b.bt * 0.32, fs2 = b.bt * 0.26;
  const cx = b.box.x + b.box.w / 2, cy = b.box.y + b.box.h / 2;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${vb}">`;
  if (labels) {
    svg += `<path d="${b.d}" fill="#f6e6c8" stroke="#7a5236" stroke-width="${b.bt + 6}"/>` +
      `<path d="${b.d}" fill="none" stroke="#8d8a8c" stroke-width="${b.bt}"/>` +
      `<path d="${b.d}" fill="none" stroke="#e5354a" stroke-width="${b.bt * 0.04}" stroke-dasharray="${b.bt * 0.2} ${b.bt * 0.15}"/>`;
    // direction arrows (clockwise from the bottom middle)
    svg += `<defs><marker id="ar" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0 L10 5 L0 10Z" fill="#e5354a"/></marker></defs>`;
    svg += `<path d="${b.d}" fill="none" stroke="none" marker-mid="url(#ar)"/>`;
    const iw = b.box.w - 2 * (b.bt + 6), ih = b.box.h - 2 * (b.bt + 6);   // inner counter, for the legend
    const f = Math.min(fs1, iw / 12.5, ih / 5);
    svg += t(cx, cy - f * 1.1, f, 'INNER COUNTER') +
      t(cx, cy + f * 0.2, f * 0.62, 'grey = moving belt, brown = rim', '#555') +
      t(cx, cy + f * 1.1, f * 0.62, 'green 1-3 = customer stops', '#1d6b2a') +
      t(cx, cy + f * 2.0, f * 0.62, 'yellow = drinks get on', '#7a4b00');
    const r = b.bt * 0.3, sw = b.bt * 0.04;
    svg += `<circle cx="${b.start.x}" cy="${b.start.y}" r="${r}" fill="#ffd34d" stroke="#222" stroke-width="${sw}"/>`;
    b.stops.forEach((p, i) => {
      svg += `<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="#3cc152" stroke="#222" stroke-width="${sw}"/>` +
        t(p.x, p.y + r * 0.45, r * 1.2, i + 1, '#fff');
    });
  } else {
    svg += `<path d="${b.d}" fill="#c9c2b8" stroke="#000" stroke-width="${b.bt + 6}"/>` +
      `<path d="${b.d}" fill="none" stroke="#555" stroke-width="${b.bt}"/>`;
  }
  return { svg: svg + '</svg>', W, H };
}

async function shot(page, html, w, h, file, transparent) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<!doctype html><html><body style="margin:0;${transparent ? '' : CHECKER}">${html}</body></html>`);
  await page.screenshot({ path: path.join(OUT, file), omitBackground: !!transparent });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  // 390x844 CSS px at 2.77x = 1080x2338, a modern tall phone.
  const game = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1080 / 390 });
  const plain = await browser.newPage();
  const sizes = [];
  for (const [view, n, what] of VIEWS) {
    await openGame(game, view, true);
    await game.screenshot({ path: path.join(OUT, `${n}_belt_${view}_layout.png`) });
    await openGame(game, view, false);
    await game.screenshot({ path: path.join(OUT, `${n}b_belt_${view}_colour_placeholder.png`) });
    const b = await game.evaluate(() => FlowGame.belt());
    const a = template(b, true), s = template(b, false);
    await shot(plain, a.svg, a.W, a.H, `${n}c_belt_${view}_template_${a.W}x${a.H}.png`);
    await shot(plain, s.svg, s.W, s.H, `${n}d_belt_${view}_silhouette_${s.W}x${s.H}.png`, true);
    sizes.push(`${view}: ${a.W}x${a.H} (${what})`);
  }
  await browser.close();
  console.log('wireframes written:\n  ' + sizes.join('\n  '));
})();
