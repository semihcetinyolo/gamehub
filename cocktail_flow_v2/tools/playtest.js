// Browser playtest (needs playwright-core and the game served over http):
//   PW=/path/to/node_modules/playwright-core node tools/playtest.js [url] [levels...]
// A simple bot plays every level in real-time steps: it throws a lane whose
// front ingredient a seated customer needs next, otherwise (with room left on
// the belt) the lane whose front is needed soonest by the queue. Prints the
// result, hearts lost and play time per level. SHOT=1 saves screenshots.
// Patience is on unless PATIENCE=0.
'use strict';
const path = require('path');
const { chromium } = require(process.env.PW || 'playwright-core');
const URL = process.argv[2] || 'http://localhost:8095/';
const only = process.argv.slice(3).map(Number);
const PATIENCE = process.env.PATIENCE !== '0';   // PATIENCE=0 plays with the patience switch off

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL + '?nohowto');
  await page.waitForFunction(() => window.BeltGame && BeltGame.state());
  const count = await page.evaluate(() => BELT_LEVELS.length);
  let fails = 0;
  for (let n = 0; n < count; n++) {
    if (only.length && !only.includes(n + 1)) continue;
    const r = await page.evaluate(([n, PATIENCE]) => {
      BeltGame.patience(PATIENCE); BeltGame.start(n); BeltGame.freeze();
      const DT = 1 / 30, THINK = 0.6;   // the bot acts every THINK seconds
      let t = 0, next = 0.5;
      while (t < 600) {
        const s = BeltGame.state();
        if (s.status !== 'play') return { status: s.status, hearts: s.hearts, t: Math.round(t) };
        if (t >= next) {
          next = t + THINK;
          const want = s.seats.filter(q => q.need).map(q => q.need);
          const lanes = s.lanes.map((l, i) => ({ i, c: l[0] })).filter(l => l.c);
          const free = s.cap - s.onBelt;
          const good = lanes.find(l => want.includes(l.c));
          if (free > 0 && good) BeltGame.tap(good.i);
          else if (free > 1 && lanes.length) {
            // nothing needed now: throw the front a seated customer needs soonest
            const soon = c => Math.min(99, ...s.seats.filter(q => q.need).map(q => {
              const rest = q.layers.slice(q.k), j = rest.indexOf(c);
              return j < 0 ? 99 : j;
            }));
            lanes.sort((a, b) => soon(a.c) - soon(b.c));
            if (soon(lanes[0].c) < 99 || free > 2) BeltGame.tap(lanes[0].i);
          }
        }
        BeltGame.step(DT); t += DT;
      }
      return { status: 'timeout', t: 600 };
    }, [n, PATIENCE]);
    if (r.status !== 'won') fails++;
    console.log(`L${n + 1}: ${r.status}${r.hearts != null ? ', hearts ' + r.hearts : ''}, ${r.t}s`);
    if (process.env.SHOT) await page.screenshot({ path: path.join(__dirname, 'screenshots', `L${n + 1}.png`) });
  }
  if (errors.length) console.log('page errors:', errors.slice(0, 5));
  console.log(fails ? `${fails} level(s) not won by the bot` : 'bot won every level');
  await browser.close();
})();
