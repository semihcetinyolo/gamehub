// Browser regression: every pane's hit target, plus actual clicks on former islands.
// A scoped local HTTP server closes together with the browser; no persistent service.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../..'), out = path.join(root, 'output/visible-panes');
const cases = JSON.parse(fs.readFileSync(path.join(out, 'reports/hit-cases.json')));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/\/$/, '/index.html'));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  const errors = [], report = { levels: 0, anchors: 0, islandClicks: 0, lotus: [] };
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem('carto.tutorial', 'true'); localStorage.setItem('carto.sound', 'false');
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.locator('#menuPlay').click();
    const total = await page.evaluate(() => CARTO_STAINED.length);
    for (let n = 1; n <= total; n++) {
      const result = await page.evaluate(n => {
        CartoGame.level(n); CartoGame.S.sound = false;
        const svg = document.querySelector('#board'), m = CartoGame.S.puzzle.map, matrix = svg.getScreenCTM();
        const misses = [];
        m.anchors.forEach(([x, y], r) => {
          const p = new DOMPoint(x, y).matrixTransform(matrix);
          const target = document.elementFromPoint(p.x, p.y)?.closest('.region');
          if (!target || +target.dataset.r !== r) misses.push(r);
        });
        return { id: CartoGame.S.puzzle.glass.id, count: m.count, misses };
      }, n);
      assert.deepEqual(result.misses, [], `${n} ${result.id}: incorrect hit targets`);
      report.levels++; report.anchors += result.count;
      const scene = cases.find(row => row.id === result.id);
      if (!scene) continue;
      // Isolate interaction from clue locks; normal lock behaviour is checked
      // separately below. All pane IDs, paths and hit targets remain production data.
      await page.evaluate(() => { const S = CartoGame.S; S.given.fill(-1); S.fill.fill(-1); });
      for (const test of scene.islands) {
        const position = await page.evaluate(test => {
          const p = new DOMPoint(...test.point).matrixTransform(document.querySelector('#board').getScreenCTM());
          const target = document.elementFromPoint(p.x, p.y)?.closest('.region');
          return { x: p.x, y: p.y, region: target ? +target.dataset.r : -1, before: CartoGame.S.fill.slice() };
        }, test);
        assert.equal(position.region, test.region, `${result.id}: former island hit target`);
        await page.mouse.click(position.x, position.y);
        const changed = await page.evaluate(before => CartoGame.S.fill.flatMap((c, r) => c !== before[r] ? [r] : []), position.before);
        assert.deepEqual(changed, [test.region], `${result.id}: one click must change one independent island`);
        report.islandClicks++;
        if (n === 3) report.lotus.push(test.region);
      }
    }
    assert.equal(new Set(report.lotus).size, 3, 'The lotus petals and lower wedge must be three regions');
    // Normal gameplay, clues intact, in both visual modes and with zoom.
    for (const look of ['3d', 'classic']) {
      await page.evaluate(look => { localStorage.setItem('carto.boardLook', look); localStorage.setItem('carto.boardLookVersion', '1'); }, look);
      await page.reload(); await page.locator('#menuPlay').click();
      await page.evaluate(() => CartoGame.level(3));
      const targets = cases.find(row => row.id === 'lotus').islands.slice().reverse();
      assert(await page.evaluate(rs => rs.every(r => CartoGame.S.given[r] === -1), targets.map(t => t.region)), 'The main lotus panes should start blank');
      const locked = await page.evaluate(() => {
        const S = CartoGame.S, r = S.given.findIndex(c => c >= 0);
        const p = new DOMPoint(...S.puzzle.map.anchors[r]).matrixTransform(document.querySelector('#board').getScreenCTM());
        return { x: p.x, y: p.y, before: S.fill.slice() };
      });
      await page.mouse.click(locked.x, locked.y);
      assert.deepEqual(await page.evaluate(() => CartoGame.S.fill), locked.before, 'Fixed clues remain locked');
      for (const [i, test] of targets.entries()) {
        const p = await page.evaluate(test => {
          const p = new DOMPoint(...test.point).matrixTransform(document.querySelector('#board').getScreenCTM());
          return { x: p.x, y: p.y, before: CartoGame.S.fill.slice() };
        }, test);
        await page.mouse.click(p.x, p.y);
        const diff = await page.evaluate(old => CartoGame.S.fill.flatMap((c, r) => c === old[r] ? [] : [r]), p.before);
        assert.deepEqual(diff, [test.region]);
        if (i === 0) {
          await page.waitForTimeout(500);
          await page.locator('#board').screenshot({ path: path.join(out, 'review', `lotus-one-tap-${look}.png`) });
        }
      }
      await page.waitForTimeout(500);
      await page.locator('#board').screenshot({ path: path.join(out, 'review', `lotus-play-${look}.png`) });
      await page.locator('#zoomIn').click(); await page.waitForTimeout(500);
      const test = targets.find(t => t.point[1] < 10);
      const p = await page.evaluate(test => {
        const p = new DOMPoint(...test.point).matrixTransform(document.querySelector('#board').getScreenCTM());
        return { x: p.x, y: p.y, before: CartoGame.S.fill.slice() };
      }, test);
      await page.mouse.click(p.x, p.y);
      assert.deepEqual(await page.evaluate(old => CartoGame.S.fill.flatMap((c, r) => c === old[r] ? [] : [r]), p.before), [test.region]);
    }
    assert.deepEqual(errors, []);
    report.errors = errors; report.valid = true;
    fs.writeFileSync(path.join(out, 'reports/browser.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
