// Browser check of every stained-glass level with real taps.
// PLAYWRIGHT_MODULE=<path to playwright> node tools/stained/verify.js   (game served at CARTOGRAPH_URL)
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const URL = process.env.CARTOGRAPH_URL || 'http://localhost:8765/Cartograph/';
const SHOTS = process.env.SCREENSHOT_DIR || os.tmpdir();
const FIRST = ['cat', 'cactus', 'lotus', 'heart', 'fox', 'fish', 'flower', 'moon', 'mushroom', 'owl'];

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(URL);
    const total = await page.evaluate(() => window.CARTO_STAINED.length);
    assert(total >= 25, `only ${total} levels`);
    assert.deepEqual(await page.evaluate(n => window.CARTO_STAINED.slice(0, n).map(l => l.id), FIRST.length), FIRST);
    // only the default way to play is left
    assert.equal(await page.locator('#lives, #colorChip, #regionPicker').count(), 0);

    const at = r => page.evaluate(r => {
      const { map } = CartoGame.S.puzzle, box = document.querySelector('#board').getBoundingClientRect();
      const [x, y] = map.anchors[r];
      return { x: box.x + x / map.cols * box.width, y: box.y + y / map.rows * box.height };
    }, r);
    const paint = async (r, color) => {
      if (await page.evaluate(() => CartoGame.S.color) !== color) await page.locator('#palette button').nth(color).click();
      const p = await at(r);
      await page.mouse.dblclick(p.x, p.y, { delay: 40 });
    };

    // tutorial on the first level: pick the colour, double tap, single tap a note, start
    await page.locator('#coach').waitFor();
    await page.screenshot({ path: path.join(SHOTS, 'cartograph-tutorial-1.png') });
    const coach = { target: await page.locator('.color-choice').evaluateAll(bs => bs.findIndex(b => b.classList.contains('coach-target'))) };
    assert(coach.target >= 0, 'tutorial highlights a colour');
    await page.locator('#palette button').nth(coach.target).click();
    assert.match(await page.locator('#coach').textContent(), /iki kez dokun/);
    const step = await page.evaluate(() => {
      const ring = document.querySelector('.coach-ring');
      const { map } = CartoGame.S.puzzle;
      return map.outlines.findIndex(o => o.map(s => `M${s[0]} ${s[1]}L${s[2]} ${s[3]}`).join('') === ring.getAttribute('d'));
    });
    assert(step >= 0);
    await paint(step, coach.target);
    assert.equal(await page.evaluate(r => CartoGame.S.fill[r], step), coach.target);
    assert.match(await page.locator('#coach').textContent(), /ikisini de not al/);
    const noteR = await page.evaluate(() => {
      const ring = document.querySelector('.coach-ring');
      const { map } = CartoGame.S.puzzle;
      return map.outlines.findIndex(o => o.map(s => `M${s[0]} ${s[1]}L${s[2]} ${s[3]}`).join('') === ring.getAttribute('d'));
    });
    const options = await page.evaluate(r => {
      const S = CartoGame.S, used = new Set(S.puzzle.map.adj[r].map(j => S.fill[j]).filter(c => c >= 0));
      return [0, 1, 2, 3].filter(c => !used.has(c));
    }, noteR);
    assert.equal(options.length, 2, 'the note step points at a pane with two colours left');
    const np = await at(noteR);
    for (const c of options) {
      await page.locator('#palette button').nth(c).click();
      await page.mouse.click(np.x, np.y);
      await page.waitForTimeout(350);
    }
    assert(await page.evaluate(([r, o]) => o.every(c => CartoGame.S.marks[r] & (1 << c)), [noteR, options]));
    await page.screenshot({ path: path.join(SHOTS, 'cartograph-tutorial-2.png') });
    await page.locator('#coachOk').click();
    assert(await page.locator('#coach').isHidden());
    assert.equal(await page.evaluate(() => localStorage.getItem('carto.tutorial')), 'true');
    await page.waitForTimeout(350);

    const palettes = new Set();
    for (let level = 1; level <= total; level++) {
      const info = await page.evaluate(() => {
        const S = CartoGame.S, g = S.puzzle.glass;
        return { level: S.level, id: g.id, image: g.image, palette: g.palette, givens: S.given.filter(c => c >= 0).length };
      });
      assert.equal(info.level, level);
      palettes.add(info.palette.join());
      assert.equal(await page.locator('#board .fixed-stripes').count(), info.givens, `${info.id}: every fixed pane is striped`);
      assert.deepEqual(await page.locator('#palette button').evaluateAll(b => b.map(x => x.style.getPropertyValue('--swatch'))), info.palette);
      const hits = await page.evaluate(() => {
        const { map } = CartoGame.S.puzzle, box = document.querySelector('#board').getBoundingClientRect();
        return map.anchors.map(([x, y], r) => {
          const el = document.elementFromPoint(box.x + x / map.cols * box.width, box.y + y / map.rows * box.height);
          const g = el && el.closest('.region');
          return g ? +g.dataset.r === r : false;
        });
      });
      assert(hits.every(Boolean), `${info.id}: anchors miss panes ${hits.map((h, r) => h ? -1 : r).filter(r => r >= 0)}`);
      const todo = await page.evaluate(() => CartoGame.S.given.flatMap((c, r) => c < 0 && CartoGame.S.fill[r] < 0 ? [{ r, color: CartoGame.S.puzzle.solution[r] }] : []));
      if (level === 2) {
        // a full but wrong board: clashes are marked in red until fixed
        const wrong = await page.evaluate(() => {
          const S = CartoGame.S, { adj } = S.puzzle.map;
          const r = S.given.findIndex((c, i) => c < 0 && adj[i].some(j => S.given[j] >= 0));
          return { r, color: S.given[adj[r].find(j => S.given[j] >= 0)] };
        });
        for (const { r, color } of todo) await paint(r, r === wrong.r ? wrong.color : color);
        assert.equal(await page.evaluate(() => CartoGame.S.done), false);
        assert.match(await page.locator('#toast').textContent(), /Yanlış çözüm/);
        assert(await page.locator('#board .wrong-pane').count() >= 1);
        assert.notEqual(await page.locator('#board .conflict').getAttribute('d'), '');
        await page.screenshot({ path: path.join(SHOTS, 'cartograph-wrong.png') });
        await paint(wrong.r, await page.evaluate(r => CartoGame.S.puzzle.solution[r], wrong.r));
      } else {
        if (level <= 3) await page.screenshot({ path: path.join(SHOTS, `cartograph-l${level}.png`) });
        for (const { r, color } of todo) await paint(r, color);
      }
      await page.waitForFunction(() => CartoGame.S.done && !document.querySelector('#glassNext').disabled, null, { timeout: 15000 });
      assert.equal(await page.locator('#board .wrong-pane').count(), 0);
      assert.equal(await page.locator('#glassArtwork').getAttribute('href'), info.image);
      if (level <= 3 || level === total) await page.screenshot({ path: path.join(SHOTS, `cartograph-l${level}-glass.png`) });
      console.log(`  ${level} ${info.id}: ${todo.length} panes painted by tap, artwork shown`);
      await page.locator('#glassNext').click();
    }
    assert.equal(palettes.size, total, 'two levels share the same four colours');
    assert.equal(await page.evaluate(() => CartoGame.S.level), 1, 'after the last level it starts over');
    assert(await page.locator('#coach').isHidden(), 'tutorial runs only once');

    await page.locator('#settingsBtn').click();
    assert.equal(await page.locator('[data-act="lives"], [data-act="start"], [data-act="controls"]').count(), 0);
    assert.equal(await page.locator('.level-chip.done').count(), total);
    await page.locator('.level-chip').nth(4).click();
    assert.equal(await page.evaluate(() => CartoGame.S.level), 5);
    await page.reload();
    assert.equal(await page.evaluate(() => CartoGame.S.level), 5);

    for (const viewport of [{ width: 320, height: 568 }, { width: 1440, height: 900 }]) {
      const ctx = await browser.newContext({ viewport, isMobile: viewport.width < 600, hasTouch: viewport.width < 600, reducedMotion: 'reduce' });
      const p = await ctx.newPage();
      p.on('pageerror', e => errors.push(e.message));
      await p.goto(URL);
      await p.locator('#coach').waitFor();
      assert(await p.evaluate(() => { const c = document.querySelector('#coach').getBoundingClientRect(); return c.top >= 0 && c.right <= innerWidth; }));
      for (const n of [1, 15, total]) {
        await p.evaluate(n => CartoGame.level(n), n);
        assert(await p.evaluate(() => {
          const b = document.querySelector('#board').getBoundingClientRect();
          return b.left >= 0 && b.right <= innerWidth && b.top >= 0 && b.bottom <= innerHeight && document.documentElement.scrollWidth <= innerWidth;
        }), `level ${n} board overflows at ${viewport.width}px`);
      }
      await p.evaluate(() => CartoGame.solveAll());
      await p.waitForFunction(() => !document.querySelector('#glassNext').disabled);
      await p.screenshot({ path: path.join(SHOTS, `cartograph-${viewport.width}.png`) });
      await ctx.close();
    }
    assert.deepEqual(errors, []);
    console.log(`PASS: tutorial, ${total} levels solved by tap, wrong board marked, striped givens, distinct palettes, picker, reload, layouts; no browser errors.`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
