// PW=/path/to/playwright-core node tools/belt_check.js
// Check movement, pause/resume, drink anchoring and responsive placement.
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.PW || 'playwright-core');
const URL = 'file://' + path.join(__dirname, '..', 'index.html');

async function snapshot(page) {
  return page.evaluate(() => {
    const track = document.querySelector('.belt-surface');
    const length = track.getTotalLength();
    const offset = +document.querySelector('.belt-slats').getAttribute('stroke-dashoffset');
    const drink = FlowGame.state().drinks[0];
    const node = document.querySelector('.drink:not(.boarding)');
    let anchorError = 0;
    if (node && drink) {
      const r = node.getBoundingClientRect(), area = document.querySelector('#customers').getBoundingClientRect();
      const at = track.getPointAtLength(drink.u % 1 * length);
      anchorError = Math.hypot(r.left + r.width / 2 - area.left - at.x, r.top + r.height * .96 - area.top - at.y);
    }
    return { phase: -offset / length, u: drink?.u, anchorError };
  });
}

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    let layouts = 0;
    for (const view of ['v1', 'v2', 'v3']) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${URL}?level=7&view=${view}`);
      await page.waitForFunction(() => window.FlowGame?.state());
      await page.evaluate(async () => { await document.fonts.ready; FlowGame.play(); });
      await page.waitForTimeout(600);
      await page.evaluate(() => {
        const state = FlowGame.state(), level = FLOW_LEVELS.find(l => l.levelOrder === state.levelOrder);
        // Slot 1 lies far enough along every view to measure before delivery.
        FlowGame.setVessel(3, level.orders[state.slots[1].uid].layers);
      });
      await page.waitForFunction(() => document.querySelector('.drink:not(.boarding)'));
      const a = await snapshot(page);
      await page.waitForTimeout(350);
      const b = await snapshot(page);
      assert(b.u > a.u, `${view}: drink did not advance`);
      assert(Math.abs((b.phase - a.phase) - (b.u - a.u)) < .0001, `${view}: slats slip under the drink`);
      assert(b.anchorError < .2, `${view}: glass base misses the belt centre`);
      await page.locator('#btnPause').click();
      const paused = await snapshot(page);
      await page.waitForTimeout(200);
      assert.deepEqual(await snapshot(page), paused, `${view}: movement continued during pause`);

      for (const viewport of [{ width: 360, height: 640 }, { width: 390, height: 844 },
        { width: 430, height: 932 }, { width: 768, height: 1024 }]) {
        await page.setViewportSize(viewport);
        await page.evaluate(() => window.dispatchEvent(new Event('resize')));
        const geometry = await page.evaluate(() => {
          const B = FlowGame.belt();
          const area = document.querySelector('#customers').getBoundingClientRect();
          const board = document.querySelector('#boardPanel').getBoundingClientRect();
          const hint = document.querySelector('#hint').getBoundingClientRect();
          const overlaps = B.spots.some(p => p.x < B.box.x + B.box.w && p.x + B.cw > B.box.x &&
            p.y < B.box.y + B.box.h && p.y + B.ch > B.box.y);
          return { overlaps, contained: B.box.x >= -.1 && B.box.y >= -.1 && B.box.x + B.box.w <= area.width + .1,
            fits: board.bottom <= hint.top + 1 && board.left >= 0 && board.right <= innerWidth };
        });
        assert(!geometry.overlaps && geometry.contained && geometry.fits,
          `${view} ${viewport.width}x${viewport.height}: ${JSON.stringify(geometry)}`);
        const resized = await snapshot(page);
        assert(Math.abs(resized.phase - paused.phase) < .0001 && resized.u === paused.u,
          `${view}: resizing reset movement`);
        assert(resized.anchorError < .2, `${view}: resizing detached the drink`);
        layouts++;
      }
      const milk = await page.evaluate(() => {
        const nodes = [...document.querySelectorAll('.layer[data-c=milk]')];
        return nodes.length && nodes.every(n => getComputedStyle(n).boxShadow.includes('127, 146, 158')) &&
          !!document.querySelector('.order-layers [data-c=milk]');
      });
      assert(milk, `${view}: milk is missing its contrasting edge on orders or vessels`);
      await page.getByRole('button', { name: 'Devam et', exact: true }).click();
      await page.waitForTimeout(200);
      assert((await snapshot(page)).u > paused.u, `${view}: resume did not restart movement`);
    }
    assert.deepEqual(errors, []);
    console.log(`belt OK: ${layouts} layouts; synchronized movement, pause/resume, resize, drink bases, milk`);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
