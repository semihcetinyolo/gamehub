// Real browser taps on every published vitray level: each tap at a blank pane's
// label point paints exactly that pane, and painting the solution wins the level.
// node tools/stained/vitray/verify_taps.js   (game served at CARTOGRAPH_URL; LIST=v2 checks the whole V2 list,
// ONLY=id1,id2 limits it)
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const URL = process.env.CARTOGRAPH_URL || 'http://localhost:8765/Cartograph/';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(list => { localStorage.setItem('carto.tutorial', 'true'); if (list) localStorage.setItem('carto.levelList', JSON.stringify(list)); }, process.env.LIST || '');
  const only = (process.env.ONLY || '').split(',').filter(Boolean);
  await page.goto(URL);
  await page.locator('#menuPlay').click();
  await page.waitForTimeout(1500);
  const ids = await page.evaluate(() => window.CARTO_LEVELS.map((l, i) => [l.id, i + 1]).filter(([id]) => id.startsWith('vitray_') || id.startsWith('v2')));
  if (only.length) ids.splice(0, ids.length, ...ids.filter(([id]) => only.includes(id)));
  let taps = 0;
  for (const [id, n] of ids) {
    await page.evaluate(n => CartoGame.play(n), n);
    await page.waitForTimeout(300);
    const info = await page.evaluate(() => ({ id: CartoGame.S.puzzle.glass.id, given: CartoGame.S.puzzle.given, solution: CartoGame.S.puzzle.solution }));
    assert.equal(info.id, id, `could not open ${id}`);
    const blanks = info.given.map((c, r) => c < 0 ? r : -1).filter(r => r >= 0);
    for (const r of blanks) {
      const c = info.solution[r];
      if (await page.evaluate(() => CartoGame.S.color) !== c) await page.locator('#palette button').nth(c).click();
      const before = await page.evaluate(() => CartoGame.S.fill.slice());
      // zoom stays at 1: tap the pane's label anchor on the fitted board
      const p = await page.evaluate(r => {
        const { map } = CartoGame.S.puzzle, box = document.querySelector('#board').getBoundingClientRect();
        const [x, y] = map.anchors[r];
        return { x: box.x + x / map.cols * box.width, y: box.y + y / map.rows * box.height };
      }, r);
      await page.mouse.click(p.x, p.y);
      const after = await page.evaluate(() => CartoGame.S.fill.slice());
      const changed = after.map((v, i) => v !== before[i] ? i : -1).filter(i => i >= 0);
      assert.deepEqual(changed, [r], `${id}: tap on pane ${r} changed ${JSON.stringify(changed)}`);
      taps++;
    }
    await page.waitForTimeout(400);
    assert(await page.evaluate(() => CartoGame.S.done), `${id}: solved board not accepted`);
    console.log(`${n} ${id}: ${blanks.length} taps, solved`);
  }
  assert.deepEqual(errors, []);
  console.log(`${ids.length} vitray levels, ${taps} taps ok`);
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
