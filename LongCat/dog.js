// Long Dog — the sausage dog. Two ways to draw it:
//  1. sprites from art.js (window.DOG_ART), once the final art exists — see ART.md;
//  2. the built-in vector placeholder below, used for anything art.js does not list.
// Body sprites are grid tiles (straight / corner / rear), so a body of any shape and length
// is built from three images. The head is one front-facing image per face state.
(function () {
  const PAL = {
    fur: '#c9692e', furHi: '#e48d4f', saddle: '#9a481b', ink: '#3d1c0b', ear: '#86391a', earIn: '#a54b22',
    muzzle: '#f1b57d', nose: '#23130c', eye: '#fffdf6', pupil: '#231109', tongue: '#ff7d8c', blush: '#ff8f86',
  };
  const ART = window.DOG_ART || {};
  const img = {};
  const FACES = ['base', 'idle', 'slide', 'squish', 'surprise', 'happy', 'dead'];

  // ---------- sprite loading (missing files just fall back to the placeholder) ----------
  function load(onReady) {
    const jobs = [];
    // Images are decoded before first use: on phones a big PNG decoded mid-slide showed the
    // dark outline layers without the coat for a moment (the dog looked darker on the first drag).
    const add = (key, src) => { if (!src) return; jobs.push(new Promise(res => {
      const i = new Image();
      i.onload = () => Promise.resolve(i.decode ? i.decode() : 0).catch(() => {}).then(() => { img[key] = key === 'coat' ? shrink(i, 512) : i; warm(img[key]); res(); });
      i.onerror = () => { console.warn('art missing:', src); res(); }; i.src = src;
    })); };
    add('rig', ART.rig); add('coat', ART.coat); add('puppy', ART.puppy);
    for (const f of FACES) add('head_' + f, ART.head && ART.head[f]);
    add('straight', ART.bodyStraight); add('corner', ART.bodyCorner); add('rear', ART.rear);
    return Promise.all(jobs).then(() => onReady && onReady());
  }
  const tiles = () => img.straight && img.corner && img.rear;
  // the coat repeats every ~1.5 cells, so 512 px is plenty and far cheaper to upload than 1254
  function shrink(im, size) { const cv = document.createElement('canvas'); cv.width = cv.height = size; cv.getContext('2d').drawImage(im, 0, 0, size, size); return cv; }
  const warmCv = document.createElement('canvas'); warmCv.width = warmCv.height = 2;
  function warm(im) { try { warmCv.getContext('2d').drawImage(im, 0, 0, 2, 2); } catch (_) {} } // forces decode + upload now
  const coatPatterns = new WeakMap(); // one pattern per context instead of one per frame
  function coatPattern(g) { let p = coatPatterns.get(g); if (!p) { p = g.createPattern(img.coat, 'repeat'); coatPatterns.set(g, p); } return p; }

  function part(g, name, x, y, w, h) {
    const r = ART.parts && ART.parts[name]; if (!img.rig || !r) return;
    const im = img.rig;
    g.drawImage(im, r[0] * im.width, r[1] * im.height, r[2] * im.width, r[3] * im.height, x, y, w, h);
  }

  // ---------- polyline → cell samples ----------
  // pts are cell centres except the last one, which may sit part-way along the final segment.
  function samples(pts, c) {
    const cells = [{ x: pts[0].x, y: pts[0].y }]; let partial = null;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], len = Math.hypot(b.x - a.x, b.y - a.y); if (len < 1e-3) continue;
      const u = [(b.x - a.x) / len, (b.y - a.y) / len], n = Math.floor(len / c + 1e-4);
      for (let k = 1; k <= n; k++) cells.push({ x: a.x + u[0] * k * c, y: a.y + u[1] * k * c });
      const rest = len - n * c;
      if (i === pts.length - 1 && rest > 1e-3) partial = { u, len: rest };
    }
    return { cells, partial };
  }
  const unit = (a, b) => { const l = Math.hypot(b.x - a.x, b.y - a.y) || 1; return [Math.round((b.x - a.x) / l), Math.round((b.y - a.y) / l)]; };

  function tile(g, im, x, y, c, ang, clip) {
    g.save(); g.translate(x, y);
    if (clip) { g.beginPath(); g.rect(clip[0] - x, clip[1] - y, clip[2], clip[3]); g.clip(); }
    g.rotate(ang); const s = c * 1.02; g.drawImage(im, -s / 2, -s / 2, s, s); g.restore();
  }
  // corner art joins the LEFT and BOTTOM edges; rotate clockwise for the other three
  function cornerAngle(from, out) {
    const has = (v) => (from[0] === v[0] && from[1] === v[1]) || (out[0] === v[0] && out[1] === v[1]);
    const L = [-1, 0], B = [0, 1], T = [0, -1], R = [1, 0];
    if (has(L) && has(B)) return 0; if (has(T) && has(L)) return Math.PI / 2; if (has(R) && has(T)) return Math.PI; return Math.PI * 1.5;
  }
  const straightAngle = d => d[0] ? 0 : Math.PI / 2; // never flipped, so the art's light stays on one side

  function drawTiles(g, pts, c, o) {
    const { cells, partial } = samples(pts, c), n = cells.length;
    for (let k = 0; k < n; k++) {
      const p = cells[k], prev = cells[k - 1], next = cells[k + 1];
      const out = next ? unit(p, next) : partial ? partial.u : null;
      const inn = prev ? unit(prev, p) : null;
      if (k === 0) { // rear: body attaches at the art's RIGHT edge
        const d = out || [-(o.tailDir || [0, 1])[0], -(o.tailDir || [0, 1])[1]];
        tile(g, img.rear, p.x, p.y, c, Math.atan2(d[1], d[0])); continue;
      }
      if (!out) { // head cell: only the half the body enters through
        const cx = p.x - inn[0] * c / 2, cy = p.y - inn[1] * c / 2;
        const r = inn[0] ? [Math.min(cx, p.x), p.y - c / 2, c / 2, c] : [p.x - c / 2, Math.min(cy, p.y), c, c / 2];
        tile(g, img.straight, p.x, p.y, c, straightAngle(inn), r); continue;
      }
      if (inn[0] === out[0] && inn[1] === out[1]) tile(g, img.straight, p.x, p.y, c, straightAngle(inn));
      else tile(g, img.corner, p.x, p.y, c, cornerAngle([-inn[0], -inn[1]], out));
    }
    if (partial && partial.len > c / 2) { // growing into the next cell
      const last = cells[n - 1], u = partial.u, q = { x: last.x + u[0] * c, y: last.y + u[1] * c };
      const e = partial.len - c / 2, sx = last.x + u[0] * c / 2, sy = last.y + u[1] * c / 2;
      const r = u[0] ? [u[0] > 0 ? sx : sx - e, q.y - c / 2, e, c] : [q.x - c / 2, u[1] > 0 ? sy : sy - e, c, e];
      tile(g, img.straight, q.x, q.y, c, straightAngle(u), r);
    }
  }

  // Continuous coat follows rounded bends; limbs and tail are a separate small rig.
  function drawVector(g, pts, c, o) {
    const points = pts.filter((p, i) => !i || Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) > .001);
    const rear = points[0], head = points.at(-1), time = o.t || 0;
    const td = o.tailDir || [0, 1];
    const direction = (a, b) => { const n = Math.hypot(b.x - a.x, b.y - a.y) || 1; return [(b.x - a.x) / n, (b.y - a.y) / n]; };
    const first = points.length > 1 ? direction(rear, points[1]) : [-td[0], -td[1]];
    const last = points.length > 1 ? direction(points.at(-2), head) : first;
    const width = c * .68;
    const path = () => {
      g.beginPath(); g.moveTo(rear.x, rear.y);
      for (let i = 1; i < points.length - 1; i++) {
        const a = points[i - 1], p = points[i], b = points[i + 1];
        const incoming = direction(a, p), outgoing = direction(p, b);
        const radius = Math.min(c * .29, Math.hypot(p.x - a.x, p.y - a.y) * .45, Math.hypot(b.x - p.x, b.y - p.y) * .45);
        g.lineTo(p.x - incoming[0] * radius, p.y - incoming[1] * radius);
        g.quadraticCurveTo(p.x, p.y, p.x + outgoing[0] * radius, p.y + outgoing[1] * radius);
      }
      if (points.length > 1) g.lineTo(head.x, head.y);
      // A tiny segment makes the rounded cap visible even before the first move.
      else g.lineTo(rear.x + first[0] * .01, rear.y + first[1] * .01);
    };
    g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
    if (o.depth !== 'flat') {
      g.save(); g.translate(c * .015, c * .055); g.strokeStyle = 'rgba(102,57,27,.18)'; g.lineWidth = width + c * .06; path(); g.stroke(); g.restore();
    }
    // A fine tapered tail grows from the rump, rather than a thick cord.
    const wag = Math.sin(time * (o.state === 'happy' ? 17 : o.state === 'slide' ? 9 : 3)) * (o.state === 'dead' ? .025 : .16);
    g.save(); g.translate(rear.x, rear.y); g.rotate(Math.atan2(td[1], td[0]));
    g.beginPath(); g.moveTo(c * .20, -c * .065);
    g.bezierCurveTo(c * .42, -c * .09, c * .48, c * (wag - .11), c * .66, c * wag);
    g.quadraticCurveTo(c * .49, c * (wag + .045), c * .23, c * .065);
    g.closePath(); g.fillStyle = '#a7542b'; g.strokeStyle = '#623218'; g.lineWidth = c * .028; g.fill(); g.stroke();
    g.restore();

    // Short, visible dachshund legs. Paws face outwards and alternate while moving.
    const legs = (x, y, d, phase) => {
      for (const side of [-1, 1]) {
        const n = [-d[1] * side, d[0] * side];
        const stride = o.state === 'slide' ? Math.sin(time * 24 + side * 1.7 + phase) * c * .045 : 0;
        const px = x + n[0] * c * .25 + d[0] * stride, py = y + n[1] * c * .25 + d[1] * stride;
        g.save(); g.translate(px, py); g.rotate(Math.atan2(n[1], n[0]) - Math.PI / 2);
        if (img.rig) part(g, side < 0 ? 'pawLeft' : 'pawRight', -c * .115, -c * .035, c * .23, c * .25);
        else { g.fillStyle = PAL.furHi; g.beginPath(); g.ellipse(0, c * .07, c * .09, c * .14, 0, 0, Math.PI * 2); g.fill(); }
        g.restore();
      }
    };
    legs(rear.x + first[0] * c * .04, rear.y + first[1] * c * .04, first, 0);
    if (points.length > 1) {
      const length = Math.hypot(head.x - rear.x, head.y - rear.y);
      if (length > c * .9 || points.length > 2) legs(head.x - last[0] * c * .65, head.y - last[1] * c * .65, last, Math.PI);
    }
    // The generated coat shares the head's painted hair detail. Paint over limb roots
    // so paws emerge from the same silhouette rather than floating above its edge.
    g.strokeStyle = '#68341b'; g.lineWidth = width + c * .028; path(); g.stroke();
    if (img.coat) {
      const coat = coatPattern(g);
      const scale = c * 1.55 / img.coat.width;
      coat.setTransform(new DOMMatrix().scale(scale));
      g.strokeStyle = coat; g.lineWidth = width; path(); g.stroke();
      // Soft coat volume with fine painted detail visible through every layer.
      g.strokeStyle = 'rgba(62,24,9,.38)'; g.lineWidth = width; path(); g.stroke();
      for (let layer = 0; layer < 18; layer++) {
        const a = layer / 17;
        g.save(); g.translate(-c * .035 * a, -c * .045 * a);
        g.strokeStyle = coat; g.globalAlpha = .16;
        g.lineWidth = width * (.98 - .80 * a); path(); g.stroke(); g.restore();
      }
    } else {
      g.strokeStyle = '#b56b37'; g.lineWidth = width; path(); g.stroke();
      g.save(); g.translate(-c * .025, -c * .035); g.strokeStyle = '#c47a42';
      g.lineWidth = width * .65; path(); g.stroke(); g.restore();
    }
    g.restore();
  }

  // ---------- animated face (same timeline as Jelly Escape's) ----------
  // fx: blinks, wandering look, squish on impact, surprise, worry. step() once per frame.
  function newFace() { return { t: 0, blink: 0, blinkAt: 1.2, lx: 0, ly: 0, wx: 0, wy: 0, wanderAt: 1, squish: 0, surprise: 0, worry: 0 }; }
  function stepFace(fx, dt, o) { // o: {state, look, hint, worried}
    fx.t += dt;
    if (fx.t > fx.blinkAt) { fx.blink = .22; fx.blinkAt = fx.t + (Math.random() < .2 ? .3 : 2 + Math.random() * 3); } // sometimes a double blink
    fx.blink = Math.max(0, fx.blink - dt); fx.squish = Math.max(0, fx.squish - dt); fx.surprise = Math.max(0, fx.surprise - dt);
    let tx = 0, ty = 0;
    if (o.state === 'slide' && o.look) [tx, ty] = o.look;
    else if (o.hint) [tx, ty] = o.hint;
    else {
      if (fx.t > fx.wanderAt) { fx.wx = (Math.random() * 2 - 1) * .45; fx.wy = (Math.random() * 2 - 1) * .3; fx.wanderAt = fx.t + 1.2 + Math.random() * 2.5; }
      tx = fx.wx; ty = fx.wy;
    }
    const k = Math.min(1, dt * 7); fx.lx += (tx - fx.lx) * k; fx.ly += (ty - fx.ly) * k;
    fx.worry += ((o.worried ? 1 : 0) - fx.worry) * Math.min(1, dt * 6);
  }
  const moodOf = (fx, state) => state === 'dead' ? 'dead' : state === 'happy' ? 'happy' : fx.squish > 0 ? 'squish' : fx.surprise > 0 ? 'surprise' : state === 'slide' ? 'slide' : 'idle';

  // o: {fx, state, dir, squash, stretch, t}
  function drawHead(g, x, y, c, o) {
    const fx = o.fx || newFace(), mood = moodOf(fx, o.state), t = o.t || 0;
    const [dx, dy] = o.dir || [0, 0], sq = o.squash || 0, st = o.stretch || 0;
    const breathe = mood === 'idle' ? Math.sin(t * 2.4) * 0.018 : 0;
    g.save(); g.translate(x, y);
    const sxs = 1 - sq * Math.abs(dx) * 0.28 + sq * Math.abs(dy) * 0.20 + st * Math.abs(dx) - st * .5 * Math.abs(dy);
    const sys = 1 - sq * Math.abs(dy) * 0.28 + sq * Math.abs(dx) * 0.20 + st * Math.abs(dy) - st * .5 * Math.abs(dx) + breathe;
    g.translate(dx * sq * c * 0.18, dy * sq * c * 0.18 + (mood === 'happy' ? -Math.abs(Math.sin(t * 5)) * c * 0.035 : 0)); g.scale(sxs, sys);
    if (img.rig) g.scale(ART.characterScale || 1, ART.characterScale || 1);
    const R = c * 0.5;
    // a full per-mood sprite wins; otherwise base art (or the vector head) + animated features
    const full = img['head_' + mood] || (mood === 'squish' && img.head_bonk);
    if (full) { const s = c * (ART.headScale || 1.35); g.drawImage(full, -s / 2, -s / 2 + (ART.headOffsetY || 0) * c, s, s); g.restore(); return; }
    if (img.rig) rigHead(g, c, mood, t, dx, dy);
    else if (img.head_base) { const s = c * (ART.headScale || 1.35); g.drawImage(img.head_base, -s / 2, -s / 2 + (ART.headOffsetY || 0) * c, s, s); }
    else vectorHead(g, R, c, mood, t, dx);
    const F = ART.face || {};
    g.translate((F.x || 0) * c, (F.y || 0) * c); if (F.scale) g.scale(F.scale, F.scale);
    features(g, R, c, fx, mood, t);
    g.restore();
  }

  function rigHead(g, c, mood, t, dx, dy) {
    const speed = mood === 'slide' ? 10 : mood === 'happy' ? 7 : 2;
    const amp = mood === 'happy' ? .12 : mood === 'slide' ? .065 : .025;
    for (const s of [-1, 1]) {
      g.save(); g.translate(s * c * .37, -c * .29);
      const lift = mood === 'slide' ? -.28 - dy * .08 : mood === 'surprise' ? -.17 : mood === 'dead' ? .14 : 0;
      g.rotate(s * (.06 + lift + Math.sin(t * speed + s * .6) * amp) - dx * (mood === 'slide' ? .22 : .025));
      part(g, s < 0 ? 'earLeft' : 'earRight', s < 0 ? -c * .25 : -c * .055, -c * .025, c * .29, c * .70);
      g.restore();
    }
    if (img.puppy) g.drawImage(img.puppy, -c * .50, -c * .51, c, c * .98);
    else part(g, 'head', -c * .445, -c * .54, c * .89, c * .97);
  }

  function vectorHead(g, R, c, mood, t, dx) {
    g.lineJoin = 'round'; g.lineCap = 'round';
    // floppy ears: sway when idle, fly back while sliding, flap when happy, droop when sad
    const sway = mood === 'idle' ? Math.sin(t * 1.7) * 0.05 : 0, flap = mood === 'happy' ? Math.sin(t * 16) * 0.22 : 0;
    const droop = mood === 'dead' ? 0.2 : 0, lift = mood === 'slide' ? -0.35 : mood === 'surprise' ? -0.25 : 0;
    for (const s of [-1, 1]) {
      const back = mood === 'slide' ? -dx * s * 0.25 : 0; // the ear on the leading side folds back
      g.save(); g.translate(s * R * 0.78, -R * 0.45); g.rotate(s * (0.28 + droop + lift + back + sway) + flap * s);
      g.beginPath(); g.ellipse(0, R * 0.55, R * 0.3, R * 0.62, 0, 0, Math.PI * 2);
      g.fillStyle = PAL.ear; g.fill(); g.strokeStyle = PAL.ink; g.lineWidth = c * 0.055; g.stroke();
      g.beginPath(); g.ellipse(-s * R * 0.04, R * 0.6, R * 0.15, R * 0.42, 0, 0, Math.PI * 2); g.fillStyle = PAL.earIn; g.fill();
      g.restore();
    }
    g.beginPath(); g.ellipse(0, -R * 0.05, R * 0.82, R * 0.8, 0, 0, Math.PI * 2);
    g.fillStyle = PAL.fur; g.fill(); g.strokeStyle = PAL.ink; g.lineWidth = c * 0.06; g.stroke();
    g.beginPath(); g.ellipse(0, -R * 0.5, R * 0.34, R * 0.2, 0, 0, Math.PI * 2); g.fillStyle = PAL.furHi; g.globalAlpha = .5; g.fill(); g.globalAlpha = 1;
    g.beginPath(); g.ellipse(0, R * 0.36, R * 0.46, R * 0.36, 0, 0, Math.PI * 2);
    g.fillStyle = PAL.muzzle; g.fill(); g.strokeStyle = PAL.ink; g.lineWidth = c * 0.045; g.stroke();
    g.fillStyle = PAL.nose; g.beginPath(); g.ellipse(0, R * 0.2, R * 0.19, R * 0.13, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.globalAlpha = .5; g.beginPath(); g.ellipse(-R * 0.06, R * 0.16, R * 0.06, R * 0.035, 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
  }

  // Soft puppy expressions: large chocolate eyes, small smiles and gentle blinks.
  function features(g, R, c, fx, mood, t) {
    const ex = c * .19, ey = -c * .075, er = c * .102;
    const lx = fx.lx * c * .014, ly = fx.ly * c * .012;
    const blink = fx.blink > 0 ? Math.sin(Math.PI * (1 - fx.blink / .22)) : 0;
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const side of [-1, 1]) {
      const x = side * ex, y = ey;
      g.strokeStyle = '#58311e'; g.lineWidth = c * .022;
      if (mood === 'happy' || mood === 'squish' || blink > .88) {
        g.beginPath(); g.moveTo(x - er * .8, y + er * .12);
        g.quadraticCurveTo(x, y - er * (mood === 'squish' ? .25 : .88), x + er * .8, y + er * .12); g.stroke();
      } else {
        const openness = (mood === 'surprise' ? 1.12 : mood === 'dead' ? .92 : 1) * (1 - .9 * blink);
        g.save(); g.translate(x + lx * .35, y + ly * .35); g.scale(1, Math.max(.08, openness));
        // Only a narrow cream rim is exposed; pupils never shrink to startled pinpoints.
        g.fillStyle = '#ffefcd'; g.beginPath(); g.ellipse(0, 0, er * 1.07, er * 1.22, 0, 0, Math.PI * 2); g.fill();
        const iris = g.createLinearGradient(0, -er, 0, er);
        iris.addColorStop(0, '#24160f'); iris.addColorStop(.55, '#362018'); iris.addColorStop(1, '#754829');
        g.fillStyle = iris; g.beginPath(); g.ellipse(lx, ly, er * .96, er * 1.12, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#26170f'; g.beginPath(); g.ellipse(lx, ly - er * .07, er * .65, er * .8, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#fffaf0'; g.beginPath(); g.ellipse(lx - er * .28, ly - er * .38, er * .29, er * .34, -.25, 0, Math.PI * 2); g.fill();
        g.globalAlpha = .8; g.beginPath(); g.arc(lx + er * .35, ly + er * .35, er * .13, 0, Math.PI * 2); g.fill(); g.restore();
      }
      // Small soft brow tufts, with only a gentle worried tilt.
      const concern = mood === 'dead' ? .75 : fx.worry;
      g.save(); g.translate(x, y - c * .17); g.rotate(side * concern * .28);
      g.fillStyle = '#e6a66b'; g.beginPath(); g.ellipse(0, 0, c * .038, c * .017, 0, 0, Math.PI * 2); g.fill(); g.restore();
      // Diffuse blush rests on the plump cheeks.
      const cheek = g.createRadialGradient(side * c * .295, c * .13, 0, side * c * .295, c * .13, c * .075);
      cheek.addColorStop(0, 'rgba(244,139,121,.30)'); cheek.addColorStop(1, 'rgba(244,139,121,0)');
      g.fillStyle = cheek; g.beginPath(); g.ellipse(side * c * .295, c * .13, c * .077, c * .052, 0, 0, Math.PI * 2); g.fill();
    }
    const my = c * .285;
    g.strokeStyle = '#633520'; g.lineWidth = c * .018;
    g.beginPath();
    if (mood === 'dead' || fx.worry > .65 && mood === 'idle') {
      g.moveTo(-c * .06, my + c * .015); g.quadraticCurveTo(0, my - c * .018, c * .06, my + c * .015); g.stroke();
    } else if (mood === 'surprise') {
      g.fillStyle = '#75422d'; g.ellipse(0, my, c * .028, c * .032, 0, 0, Math.PI * 2); g.fill();
    } else {
      g.moveTo(-c * .095, my - c * .014);
      g.quadraticCurveTo(-c * .045, my + c * .035, 0, my + c * .002);
      g.quadraticCurveTo(c * .045, my + c * .035, c * .095, my - c * .014); g.stroke();
      if (mood === 'happy' || mood === 'slide') {
        // A tiny rounded tongue; slow movement avoids the old frantic panting.
        tongue(g, R, c, 0, my + c * .008, Math.sin(t * 7) * .075 - fx.lx * .10);
      }
    }
    if (mood === 'dead') {
      const bob = Math.sin(t * 2) * c * .008;
      g.fillStyle = 'rgba(171,218,238,.8)'; g.beginPath();
      g.ellipse(c * .265, c * .055 + bob, c * .014, c * .023, -.2, 0, Math.PI * 2); g.fill();
    }
  }
  function tongue(g, R, c, x, y, swing) {
    g.save(); g.translate(x, y); g.rotate(swing);
    g.fillStyle = '#ed9c9e'; g.strokeStyle = '#ac6260'; g.lineWidth = c * .01;
    g.beginPath(); g.roundRect(-c * .034, 0, c * .068, c * .073, [0, 0, c * .03, c * .03]); g.fill(); g.stroke();
    g.strokeStyle = '#cc777c'; g.beginPath(); g.moveTo(0, c * .008); g.lineTo(0, c * .035); g.stroke();
    g.restore();
  }

  // body only; the head is drawn separately (game.js caches it in a bitmap for the blur trail)
  function drawBody(g, pts, c, o) {
    // At zero length (initial state, restart or fully rewound), show only the head.
    if (!pts.some((p, i) => i && Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) > .001)) return;
    if (tiles()) drawTiles(g, pts, c, o); else drawVector(g, pts, c, o);
  }
  function drawDog(g, pts, c, o) { drawBody(g, pts, c, o); const h = pts[pts.length - 1]; drawHead(g, h.x, h.y, c, o); }
  const trigger = (fx, what, s) => { fx[what] = s; };

  window.LongDog = { PAL, load, drawBody, drawDog, drawHead, newFace, stepFace, moodOf, trigger, art: img };
})();
