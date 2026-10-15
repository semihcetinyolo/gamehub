// Browser playtest (needs playwright-core). Replays every solver solution with
// real taps (serving is automatic), then runs rule checks from the design doc.
//   PW=/path/to/node_modules/playwright-core node tools/playtest.js [levelOrders...]
'use strict';
const path = require('path');
const { chromium } = require(process.env.PW || 'playwright-core');
const sols = require('./solutions.json');

const URL = 'file://' + path.join(__dirname, '..', 'index.html');
const fails = [];
let gone = 0;   // bottles that disappeared over all replays
const emptyWithRefills = new Set();   // levels where a bottle sat empty while refills were left
const check = (ok, msg) => { if (!ok) fails.push(msg); };

async function open(browser, level, vp) {
  const page = await browser.newPage({ viewport: vp || { width: 390, height: 844 } });
  page.on('pageerror', e => fails.push(`L${level}: page error ${e.message}`));
  await page.addInitScript(() => { try { localStorage.clear(); } catch (e) {} });
  await page.goto(`${URL}?level=${level}`);
  await page.waitForFunction(() => window.CocktailGame && CocktailGame.state());
  await page.evaluate(() => CocktailGame.play());
  return page;
}
const S = page => page.evaluate(() => CocktailGame.state());
const tapBottle = (page, i) => page.locator(`.slot[data-id="b${i}"]`).click();
const idle = (page, served) => page.waitForFunction(n => {
  const st = CocktailGame.state();
  return st.served >= n && st.bottles.every(b => !b.phase);
}, served, { timeout: 5000 });

// Taps the solver's pours. Serves and refills are automatic, so before each
// pour wait for the serves the solver already counted and for refills to land.
async function playSolution(page, actions, stopBeforeServe) {
  let served = 0;
  for (const a of actions) {
    if (a.from === undefined) { if (stopBeforeServe) return served; served++; continue; }
    await idle(page, served);
    // while refills are left, no normal bottle may sit empty (user bug report)
    const bad = await page.evaluate(() => {
      const st = CocktailGame.state(), L = window.COCKTAIL_LEVELS.find(l => l.levelOrder === st.levelOrder);
      return st.refillAt < L.refills.length && st.bottles.some((b, i) => i !== st.mixer && !b.gone && !b.layers.length);
    });
    if (bad) emptyWithRefills.add(await page.evaluate(() => CocktailGame.state().levelOrder));
    await tapBottle(page, a.from); await tapBottle(page, a.to);
  }
  return served;
}

// layers in bottles + served layers + refills still to come never change
const unitCount = (page, cap) => page.evaluate(c => {
  const st = CocktailGame.state();
  const L = window.COCKTAIL_LEVELS.find(l => l.levelOrder === st.levelOrder);
  return st.bottles.reduce((n, b) => n + b.layers.length + (b.next ? b.next.length : 0), 0) +
    st.served * c + (L.refills.length - st.refillAt) * c;
}, cap);

async function replay(browser, level) {
  const page = await open(browser, level);
  await playSolution(page, sols[level].actions);
  await page.waitForFunction(() => CocktailGame.state().status !== 'play', null, { timeout: 5000 }).catch(() => {});
  const st = await S(page);
  check(st.status === 'won', `L${level}: replay ended ${st.status} (${st.served}/${st.total})`);
  check(st.hearts === 3, `L${level}: lost hearts during replay`);
  check(st.bottles.every(b => !b.gone || !b.layers.length), `L${level}: a gone bottle still has liquid`);
  gone += st.bottles.filter(b => b.gone).length;
  await page.close();
}

async function rules(browser) {
  // 15 = 8 bottles; uses solution of that level to get a bottle that is one pour from ready.
  const level = 15;
  let page = await open(browser, level);
  let st = await S(page);
  // the most impatient customer is on the left
  const byPos = st.slots.filter(x => x.uid !== null).sort((a, b) => a.pos - b.pos);
  const pat = await page.evaluate(() => window.COCKTAIL_LEVELS.find(l => l.levelOrder === 15).orders.map(o => o.patience));
  check(byPos.every((x, k) => !k || pat[byPos[k - 1].uid] <= pat[x.uid]), 'cards are not sorted by patience');
  const cardX = await page.evaluate(() => [...document.querySelectorAll('.cust')].map(e => e.getBoundingClientRect().left));
  check(byPos.every((x, k) => !k || cardX[st.slots.indexOf(byPos[k - 1])] < cardX[st.slots.indexOf(x)]), 'card screen order differs from pos');
  const M = st.mixer;
  const top = b => b.layers[b.layers.length - 1];
  const before = JSON.stringify(st.bottles);
  check(st.bottles[M].layers.length === 0, 'mixer does not start empty');
  // the mixer sits in the middle of the first row
  const mixerBox = await page.evaluate(m => { const r = document.querySelector(`.slot[data-id="b${m}"]`).getBoundingClientRect();
    const all = [...document.querySelectorAll('.slot')].map(e => e.getBoundingClientRect());
    return { top: r.top <= Math.min(...all.map(x => x.top)) + 1, mid: Math.abs(r.left + r.width / 2 - innerWidth / 2) < 2 }; }, M);
  check(mixerBox.top && mixerBox.mid, 'mixer is not top middle');

  // one pour = one layer; any colour goes into the mixer
  const a = st.bottles.findIndex((b, i) => i !== M && b.layers.length);
  await tapBottle(page, a); await tapBottle(page, M);
  st = await S(page);
  check(st.bottles[M].layers.length === 1, 'pour into the mixer moved more than one layer');
  const other = st.bottles.findIndex((b, i) => i !== M && b.layers.length && top(b) !== top(st.bottles[M]));
  if (other >= 0) {
    await tapBottle(page, other); await tapBottle(page, M);
    st = await S(page);
    check(st.bottles[M].layers.length === 2, 'mixer refused a different colour');
  }
  // normal bottles: a different colour is refused, the same colour / an empty bottle is fine
  const pairs = [];
  st.bottles.forEach((x, i) => st.bottles.forEach((y, j) => {
    if (i !== j && i !== M && j !== M && x.layers.length && y.layers.length && y.layers.length < 4) pairs.push([i, j, top(x) === top(y)]);
  }));
  const diff = pairs.find(p => !p[2]), same = pairs.find(p => p[2]);
  if (diff) {
    const snap = JSON.stringify(st.bottles);
    await tapBottle(page, diff[0]); await tapBottle(page, diff[1]);
    st = await S(page);
    check(JSON.stringify(st.bottles) === snap, 'a normal bottle took a different colour');
    check(st.selected === null, 'a failed pour kept the bottle selected');
  }
  if (same) {
    const n = st.bottles[same[1]].layers.length;
    await tapBottle(page, same[0]); await tapBottle(page, same[1]);
    st = await S(page);
    check(st.bottles[same[1]].layers.length === n + 1, 'a normal bottle refused the same colour');
  }
  // empty source refused
  const e2 = st.bottles.findIndex(b => !b.layers.length);
  if (e2 >= 0) { await tapBottle(page, e2); st = await S(page); check(st.selected === null, 'empty bottle got selected'); }

  // restart restores the start
  await page.evaluate(l => CocktailGame.start(l), level);
  await page.evaluate(() => CocktailGame.play());
  st = await S(page);
  check(JSON.stringify(st.bottles) === before && st.served === 0 && st.hearts === 3, 'restart did not reset the level');

  // only the mixer serves, and only the exact layer order
  const order0 = st.slots[0].uid;
  const recipe = await page.evaluate(u => window.COCKTAIL_LEVELS.find(l => l.levelOrder === 15).orders[u].layers, order0);
  const normal = st.bottles.findIndex((b, i) => i !== M);
  await page.evaluate(([i, r]) => CocktailGame.setBottle(i, r), [normal, recipe]);
  check((await S(page)).served === 0, 'a normal bottle equal to a recipe was served');
  const reversed = recipe.slice().reverse();
  if (JSON.stringify(reversed) !== JSON.stringify(recipe)) {
    await page.evaluate(([i, r]) => CocktailGame.setBottle(i, r), [M, reversed]);
    check((await S(page)).served === 0, 'reversed recipe was served');
  }
  await page.evaluate(([i, r]) => CocktailGame.setBottle(i, r), [M, recipe]);
  check((await S(page)).served === 1, 'the exact recipe in the mixer was not served');
  await page.evaluate(() => CocktailGame.start(15));
  await page.evaluate(() => CocktailGame.play());

  // the solution's first pour that completes a recipe serves it with no tap,
  // the mixer locks, then empties
  const acts = sols[level].actions;
  const firstServe = acts.findIndex(a => a.from === undefined);
  await playSolution(page, acts.slice(0, firstServe));
  st = await S(page);
  check(st.served === 1 && st.bottles[M].phase === 'serving', `completing pour: served ${st.served}, phase ${st.bottles[M].phase}`);
  check(await page.locator('#serveFeedback.show').count() === 1, 'impression did not show the moment the mixer matched');
  check(st.slots.some(s => s.uid === acts[firstServe].order && s.state === 'leaving'), 'served customer did not leave');
  // rapid taps on the mixer being served change nothing
  await page.evaluate(i => { const e = document.querySelector(`.slot[data-id="b${i}"]`);
    for (let n = 0; n < 4; n++) e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); }, M);
  check((await S(page)).served === 1 && (await S(page)).selected === null, 'tapping the mixer being served did something');
  await idle(page, 1);
  st = await S(page);
  check(st.bottles[M].layers.length === 0, 'mixer not empty after serving');
  // rapid random taps never create or lose liquid
  const units = await unitCount(page, 4);
  await page.evaluate(() => { const els = document.querySelectorAll('.slot');
    for (let n = 0; n < 60; n++) els[(n * 7 + 3) % els.length].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
  await page.waitForTimeout(1500);
  check(await unitCount(page, 4) === units, 'rapid taps changed the amount of liquid');
  st = await S(page);

  // timeouts: exactly one heart each, bottles untouched, order back in the queue
  const served0 = st.served;
  await idle(page, served0);
  st = await S(page);
  const bottlesNow = JSON.stringify(st.bottles);
  await page.evaluate(() => { for (let i = 0; i < 20; i++) CocktailGame.step(0.1); });   // finish arrivals
  const lefts = (await S(page)).slots.filter(s => s.state === 'active').map(s => s.left);
  const firstLeft = Math.min(...lefts);
  const expiring = lefts.filter(l => l - firstLeft < 0.05).length;   // first-wave customers share a start time
  await page.evaluate(t => { for (let x = 0; x < t + 0.05; x += 0.05) CocktailGame.step(0.05); }, firstLeft);
  st = await S(page);
  check(st.hearts === 3 - expiring, `${expiring} timeout(s) left ${st.hearts} hearts`);
  check(st.queue.length >= expiring, 'timed-out order not back in the queue');
  check(JSON.stringify(st.bottles) === bottlesNow, 'timeout changed bottles');
  check(st.served === served0, 'timeout changed served count');
  // run the clock out completely: lose at 0 hearts, never below
  await page.evaluate(() => { for (let i = 0; i < 4000; i++) CocktailGame.step(0.1); });
  st = await S(page);
  check(st.status === 'lost' && st.hearts === 0, `after long wait: ${st.status} hearts ${st.hearts}`);
  await page.waitForTimeout(900);
  check(await page.locator('#overlay:not(.hidden)').count() === 1, 'no lose panel');
  await page.locator('.btn.go').click();      // Yeniden dene (starts right away, no intro)
  st = await S(page);
  check(st.status === 'play' && st.hearts === 3 && JSON.stringify(st.bottles) === before, 'retry after loss did not reset');

  // pause freezes timers
  await page.click('#btnPause');
  const t1 = (await S(page)).slots.map(s => s.left);
  await page.waitForTimeout(600);
  const t2 = (await S(page)).slots.map(s => s.left);
  check(JSON.stringify(t1) === JSON.stringify(t2), 'timers ran while paused');
  await page.close();

  // dead end after a pour: -1 heart and the pour is taken back (user request)
  page = await open(browser, 7);
  {
    st = await S(page);
    const M7 = st.mixer, n = st.bottles.length;
    const recipes = await page.evaluate(() => window.COCKTAIL_LEVELS.find(l => l.levelOrder === 7).orders.map(o => o.layers));
    const colour = recipes[0][0];
    await page.evaluate(() => CocktailGame.useUpRefills());
    const normals = [...Array(n).keys()].filter(i => i !== M7);
    const [A, B] = normals;
    for (const i of normals.slice(2)) await page.evaluate(k => CocktailGame.setGone(k), i);
    // only two single layers of one colour left: no order can ever be finished
    await page.evaluate(([a, b, c]) => { CocktailGame.setBottle(a, [c]); CocktailGame.setBottle(b, [c]); }, [A, B, colour]);
    await tapBottle(page, A); await tapBottle(page, B);
    st = await S(page);
    check(st.hearts === 2, `dead end: hearts ${st.hearts}`);
    check(st.bottles[A].layers.length === 1 && st.bottles[B].layers.length === 1 && !st.bottles[A].gone, 'dead end: the pour was not taken back');
    check(st.status === 'play', `dead end: status ${st.status}`);
  }
  await page.close();
  // the check is quick enough to run after every pour (10-bottle level)
  page = await open(browser, 39);
  {
    const ms = await page.evaluate(() => { const t = performance.now(); for (let k = 0; k < 5; k++) CocktailGame.deadEnd(); return (performance.now() - t) / 5; });
    check(ms < 150, `dead-end check takes ${ms.toFixed(0)} ms`);
    console.log(`dead-end check: ${ms.toFixed(0)} ms on a 10-bottle level`);
  }
  await page.close();

  // impressions (as in cocktail_flow): one word per serve the moment the mixer matches,
  // "COMBO ×N" from the second serve in a row; the win panel waits for them
  page = await open(browser, 0);
  await page.evaluate(() => {
    window.__seen = [];
    new MutationObserver(() => {
      const f = document.querySelector('#serveFeedback');
      if (!f.hidden && f.classList.contains('show'))
        window.__seen.push(f.querySelector('.impression-word').textContent + '|' + f.querySelector('.impression-combo').textContent);
    }).observe(document.querySelector('#serveFeedback'), { attributes: true, attributeFilter: ['class', 'hidden'] });
  });
  await playSolution(page, sols[0].actions);
  await page.waitForFunction(() => !document.querySelector('#overlay').classList.contains('hidden'), null, { timeout: 8000 });
  {
    const seen = [...new Set(await page.evaluate(() => window.__seen))];
    const total = (await S(page)).total;
    check(seen.length === total, `impressions shown ${seen.length}, serves ${total}: ${seen.join(', ')}`);
    check(seen[0] && seen[0].endsWith('|') && seen.slice(1).every((x, k) => x.endsWith(`COMBO ×${k + 2}`)), `combo texts: ${seen.join(', ')}`);
  }
  await page.close();

  // end of a level: an emptied bottle stays while it is one of the last
  // bottles needed to take a wrong mixer apart; with no move left the level
  // is lost ('stuck') instead of hanging (bug seen on level 8)
  page = await open(browser, 7);
  st = await S(page);
  {
    const M7 = st.mixer, n = st.bottles.length;
    const recipes = await page.evaluate(() => window.COCKTAIL_LEVELS.find(l => l.levelOrder === 7).orders.map(o => o.layers.join()));
    const [E, C] = await page.evaluate(() => window.COCKTAIL_LEVELS.find(l => l.levelOrder === 7).orders[0].layers.filter((c, i, a) => a.indexOf(c) === i));
    const wrong = [[E, C, E, E], [E, E, C, E], [C, E, E, E], [E, C, C, E]].find(w => !recipes.includes(w.join()));
    await page.evaluate(() => { CocktailGame.useUpRefills(); CocktailGame.noDeadCheck(); });
    const normals = [...Array(n).keys()].filter(i => i !== M7);
    const [A, B] = normals;
    for (const i of normals.slice(2)) await page.evaluate(k => CocktailGame.setGone(k), i);
    await page.evaluate(([m, w]) => CocktailGame.setBottle(m, w), [M7, wrong.slice(0, 3)]);
    await page.evaluate(([a, c]) => CocktailGame.setBottle(a, [c]), [A, wrong[3]]);
    await page.evaluate(b => CocktailGame.setBottle(b, []), B);
    await tapBottle(page, A); await tapBottle(page, M7);
    st = await S(page);
    check(st.bottles[M7].layers.length === 4 && !st.bottles[A].gone, 'the last bottles needed to fix the mixer disappeared');
    check(st.status === 'play', `level ended (${st.status}) while moves were left`);
    // now take every normal bottle away: no move left -> lost, not frozen
    await page.evaluate(([a, b]) => { CocktailGame.setGone(a); CocktailGame.setGone(b); }, [A, B]);
    st = await S(page);
    check(st.status === 'stuck', `no move left but status is ${st.status}`);
    await page.waitForTimeout(900);
    check(await page.locator('#overlay:not(.hidden)').count() === 1, 'no panel after getting stuck');
  }
  await page.close();

  // win -> 'Next Level' panel; Claim credits the level's coins, Claim x2 doubles
  // them, both load the next levelOrder
  for (const [level, btn, mult] of [[4, '.claim-btn', 1], [0, '.x2-btn', 2]]) {
    page = await open(browser, level);
    await playSolution(page, sols[level].actions);
    await page.waitForFunction(() => !document.querySelector('#overlay').classList.contains('hidden'), null, { timeout: 4000 });
    const won = await S(page);
    check(won.status === 'won' && won.coins > 0, `L${level}: won with ${won.coins} coins`);
    check(await page.locator('#panel h2').innerText() === 'Next Level', 'win panel title is not "Next Level"');
    await page.locator(btn).click();
    await page.locator(btn).click({ force: true, timeout: 500 }).catch(() => {});   // double click: credited once
    await page.waitForTimeout(900);
    st = await S(page);
    check(st.wallet === won.wallet + won.coins * mult, `${btn}: wallet ${won.wallet} -> ${st.wallet}, level coins ${won.coins}`);
    check(st.levelOrder === level + 1 && st.status === 'play' && st.served === 0, `after ${btn}: level ${st.levelOrder} ${st.status}`);
    check(await page.locator('#overlay.hidden').count() === 1, `after ${btn}: a panel is still open`);
    await page.close();
  }
}

// No overlap between cards, timers, board and hint; every bottle fully on screen.
async function layoutCheck(browser) {
  for (const vp of [{ width: 320, height: 568 }, { width: 360, height: 640 }, { width: 375, height: 667 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
    for (const level of [0, 5, 15, 19, 30, 39]) {
      const page = await open(browser, level, vp);
      await page.waitForTimeout(400);
      const r = await page.evaluate(() => {
        const box = e => e.getBoundingClientRect();
        const cust = box(document.querySelector('#customers')), panel = box(document.querySelector('#boardPanel'));
        const hint = box(document.querySelector('#hint')), hud = box(document.querySelector('#hud'));
        const bottles = [...document.querySelectorAll('.bottle')].map(box);
        return {
          overlap: cust.bottom > panel.top + 1 || panel.bottom > hint.top + 1 || hud.bottom > cust.top + 1,
          off: bottles.some(b => b.top < 0 || b.bottom > innerHeight || b.left < 0 || b.right > innerWidth),
          minW: Math.min(...bottles.map(b => b.width)),
          scrolls: (w => w.scrollHeight > w.clientHeight + 1 || w.scrollWidth > w.clientWidth + 1)(document.querySelector('#boardWrap')),
        };
      });
      const tag = `${vp.width}x${vp.height} L${level}`;
      check(!r.overlap, `${tag}: areas overlap`);
      check(!r.off, `${tag}: bottle off screen`);
      check(!r.scrolls, `${tag}: the bottle area would scroll`);
      // 320x568 (smallest iPhone) is only checked for overlap / scrolling
      if (vp.width >= 360) check(r.minW >= 40, `${tag}: bottles only ${r.minW.toFixed(0)}px wide`);
      await page.close();
    }
  }
}

(async () => {
  const browser = await chromium.launch();
  const only = process.argv.slice(2).map(Number);
  const levels = only.length ? only : Object.keys(sols).map(Number);
  for (const l of levels) await replay(browser, l);
  console.log(`replayed ${levels.length} levels, ${gone} bottles disappeared`);
  check(!emptyWithRefills.size, `empty bottle while refills were left: levels ${[...emptyWithRefills].join(', ')}`);
  if (!only.length) check(gone > 0, 'no bottle ever disappeared after the refills ran out');
  if (!only.length) { await rules(browser); console.log('rules checked'); await layoutCheck(browser); console.log('layout checked'); }
  await browser.close();
  console.log(fails.length ? 'FAIL\n' + fails.join('\n') : 'all OK');
  process.exit(fails.length ? 1 : 0);
})();
