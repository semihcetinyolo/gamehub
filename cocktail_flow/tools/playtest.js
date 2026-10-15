// Browser playtest (needs playwright-core). Replays every solver solution with
// real taps (serving and moving up are automatic), then runs a few rule checks.
//   PW=/path/to/node_modules/playwright-core node tools/playtest.js [levelOrders...]
//   SHOT=1 also saves tools/shot_<level>.png of each level's start
'use strict';
const path = require('path');
const { chromium } = require(process.env.PW || 'playwright-core');
const sols = require('./solutions.json');

const URL = 'file://' + path.join(__dirname, '..', 'index.html');
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };

async function open(browser, level, vp) {
  const page = await browser.newPage({ viewport: vp || { width: 390, height: 844 } });
  page.on('pageerror', e => fails.push(`L${level}: page error ${e.message}`));
  await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  await page.goto(`${URL}?level=${level}`);
  await page.waitForFunction(() => window.FlowGame && FlowGame.state());
  await page.evaluate(() => FlowGame.play());
  return page;
}
const S = page => page.evaluate(() => FlowGame.state());
const vid = (st, i) => st.vessels[i].id;
const tap = (page, id) => page.locator(`.slot[data-id="${id}"]`).click();
const idle = (page, served) => page.waitForFunction(n => {
  const st = FlowGame.state();
  return st.served >= n && st.vessels.every(b => !b.phase);
}, served, { timeout: 6000 });

async function replay(browser, level) {
  const page = await open(browser, level);
  const st0 = await S(page);
  if (process.env.SHOT) await page.screenshot({ path: path.join(__dirname, `shot_${level}.png`) });
  let served = 0;
  for (const a of sols[level].actions) {
    if (a.from === undefined) { served++; continue; }
    await idle(page, served).catch(() => {});
    await tap(page, vid(st0, a.from)); await tap(page, vid(st0, a.to));
  }
  await page.waitForFunction(() => FlowGame.state().status !== 'play', null, { timeout: 15000 }).catch(() => {});
  const st = await S(page);
  check(st.status === 'won', `L${level}: replay ended ${st.status} (${st.served}/${st.total})`);
  check(st.hearts === 3, `L${level}: lost hearts during replay`);
  await page.close();
}

async function rules(browser) {
  const level = 15;
  const page = await open(browser, level);
  let st = await S(page);
  const lanes = st.vessels.filter(b => !b.prep), preps = st.vessels.filter(b => b.prep);
  check(lanes.length === 3 && preps.length === 3, 'not 3 lanes + 3 glasses');
  check(preps.every(b => !b.layers.length), 'glasses do not start empty');
  // top to bottom: customers, glasses on the counter, front row, back row
  const box = await page.evaluate(() => {
    const r = s => document.querySelector(s).getBoundingClientRect();
    return { back: r('.back-bottle'), front: r('.slot.front .bottle'), prep: r('.slot.prep .bottle'), cards: r('#customers') };
  });
  check(box.cards.bottom <= box.prep.top && box.prep.bottom < box.front.top && box.front.bottom < box.back.top, 'rows are not glasses / front / back top to bottom');
  check(box.back.width < box.front.width, 'back bottles are not smaller');
  // tapping a back bottle does nothing
  const snap = JSON.stringify(st.vessels);
  await page.locator('.back-slot').first().click();
  st = await S(page);
  check(st.selected === null && JSON.stringify(st.vessels) === snap, 'a back bottle reacted to a tap');
  // a supply bottle refuses a different colour
  const top = b => b.layers[b.layers.length - 1];
  await tap(page, lanes[0].id); await tap(page, preps[0].id);
  st = await S(page);
  check(st.vessels[3].layers.length === 1, 'pour into a glass did not move one layer');
  const other = st.vessels.slice(0, 3).find(b => b.layers.length && top(b) !== top(st.vessels[3]));
  if (other) {
    const snap2 = JSON.stringify(st.vessels);
    await tap(page, preps[0].id); await tap(page, other.id);
    st = await S(page);
    check(JSON.stringify(st.vessels) === snap2, 'a supply bottle took a different colour');
    check(st.selected === null, 'a refused pour kept the bottle selected');
  }
  // emptying a front bottle brings the one behind forward
  await page.evaluate(() => FlowGame.start(15));
  await page.evaluate(() => FlowGame.play());
  st = await S(page);
  const L = await page.evaluate(() => window.FLOW_LEVELS.find(l => l.levelOrder === 15));
  const n = st.vessels[0].layers.length;
  let k = 0;
  for (let i = 0; i < n; i++) {
    while (st.vessels[3 + k].layers.length >= 4) k++;
    await tap(page, 'l0'); await tap(page, 'p' + k);
    st = await S(page);
  }
  await page.waitForFunction(() => FlowGame.state().vessels[0].ptr === 1, null, { timeout: 3000 }).catch(() => {});
  st = await S(page);
  check(st.vessels[0].ptr === 1 && JSON.stringify(st.vessels[0].layers) === JSON.stringify(L.lanes[0][1]), 'the bottle behind did not move up');
  // only exact recipes are served
  await page.evaluate(() => FlowGame.start(15));
  await page.evaluate(() => FlowGame.play());
  st = await S(page);
  const recipe = L.orders[st.slots[0].uid].layers;
  const rev = recipe.slice().reverse();
  if (JSON.stringify(rev) !== JSON.stringify(recipe) && !st.slots.some(s => JSON.stringify(L.orders[s.uid].layers) === JSON.stringify(rev))) {
    await page.evaluate(r => FlowGame.setVessel(3, r), rev);
    check((await S(page)).served === 0, 'reversed recipe was served');
  }
  // green marks: off by default; switched on, a glass holding the start of an
  // order marks those layers, in the glass and on the order card
  await page.evaluate(r => FlowGame.setVessel(4, r.slice(0, 2)), recipe);
  check(await page.evaluate(() => document.querySelectorAll('.layer.match').length) === 0, 'marks shown although the switch starts off');
  await page.click('#btnPause'); await page.click('#marksSwitch');
  await page.evaluate(() => FlowGame.play());
  st = await S(page);
  const greenGlass = await page.evaluate(() => document.querySelectorAll('.slot[data-id="p1"] .layer.match').length);
  check(st.matches.glass[1] >= 2 && greenGlass >= 2, 'matching glass layers are not marked green');
  check(st.matches.order[0] >= 2, 'matching order layers are not marked');
  const greenCard = await page.evaluate(() => document.querySelector('.cust').querySelectorAll('.layer.match').length);
  check(greenCard >= 2, 'order card layers are not marked green');
  // the pause switch turns the marks off (and on again)
  await page.click('#btnPause'); await page.click('#marksSwitch');
  check(await page.evaluate(() => document.querySelectorAll('.layer.match').length) === 0, 'marks still shown with the switch off');
  await page.click('#marksSwitch');
  check(await page.evaluate(() => document.querySelectorAll('.layer.match').length) > 0, 'marks not back with the switch on');
  await page.evaluate(() => FlowGame.play());
  await page.evaluate(r => FlowGame.setVessel(4, r), recipe);
  check((await S(page)).served === 1, 'the exact recipe in a glass was not served');
  // layout fits small and large screens without overlap
  for (const vp of [{ width: 360, height: 640 }, { width: 375, height: 553 }, { width: 393, height: 700 }, { width: 430, height: 932 }, { width: 768, height: 1024 }]) {
    const p = await open(browser, 38, vp);
    const r = await p.evaluate(() => {
      const b = document.querySelector('#boardPanel').getBoundingClientRect(), h = document.querySelector('#hint').getBoundingClientRect();
      const c = document.querySelector('#customers').getBoundingClientRect();
      return { fits: b.top >= c.bottom - 1 && b.bottom <= h.top + 1 && b.right <= innerWidth && b.left >= 0, w: b.width, h: b.height };
    });
    check(r.fits, `board does not fit ${vp.width}x${vp.height}`);
    if (process.env.SHOT) await p.screenshot({ path: path.join(__dirname, `shot_${vp.width}x${vp.height}.png`) });
    await p.close();
  }
  await page.close();
}

(async () => {
  const only = process.argv.slice(2).map(Number);
  const levels = only.length ? only : Object.keys(sols).map(Number);
  const browser = await chromium.launch();
  await rules(browser);
  const queue = levels.slice();
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (queue.length) await replay(browser, queue.shift());
  }));
  await browser.close();
  console.log(fails.length ? fails.join('\n') + `\n${fails.length} problem(s)` : `playtest OK (${levels.length} levels replayed)`);
  process.exit(fails.length ? 1 : 0);
})();
