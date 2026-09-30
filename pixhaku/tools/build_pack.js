#!/usr/bin/env node
"use strict";
// Builds the Pixhaku Level 4–23 pack from tools/pack_4-23.js:
//   pixhaku_level_creation_4-23.html   embedded artwork, drafts, zones, solve path, prompts
//   taslaklar/levelN-taslak.png        1024×1024 zone drafts for the image model (no numbers)
//   levels_4-23.js                     level objects in Pixhaku_prototype.html's format
//   Pixhaku_prototype.html             the generated level block (pictures, or drafts until they exist)
//   generator.js                       the solver + difficulty profiles for making levels in the game
//   (Fugo upload: python3 fugo_export.py pixhaku from the repo root)
// Every level is checked first: unique solution, solvable without guessing, and its
// spec's opening rules; the build stops on the first level that fails.
//
//   node tools/build_pack.js            verify + write everything
//   node tools/build_pack.js --search   first pick clue cells for levels whose `clues` is empty
//                                       and save them into pack_4-23.js

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { analyse, parseLayout, placeOf, orient, checkSpec, generatePuzzle } = require("./shikaku");
const PACK = require("./pack_4-23");

const ROOT = path.resolve(__dirname, "..");
const DRAFT_DIR = "taslaklar";
const PAGE = "pixhaku_level_creation_4-23.html";
const DATA = "levels_4-23.js";
const ART_DIR = "assets/levels";

// The picture has the board's proportions: 1024 wide, 1024 × rows / cols tall. Square
// levels use assets/levels/level-N.jpg; the others expect level-N-<cols>x<rows>.jpg, so an
// old square picture is never stretched onto a tall board.
const artSize = (L) => [1024, Math.round((1024 * L.spec.rows) / L.spec.cols)];
const isSquare = (L) => L.spec.cols === L.spec.rows;
const artFile = (L) => `${ART_DIR}/${L.id}${isSquare(L) ? "" : `-${L.spec.cols}x${L.spec.rows}`}.jpg`;
const draftFile = (L) => `${DRAFT_DIR}/${L.id}-taslak.png`;

function artPath(L) {
  return fs.existsSync(path.join(ROOT, artFile(L))) ? artFile(L) : null;
}

function embeddedArt(L) {
  const file = artPath(L);
  return file ? `data:image/jpeg;base64,${fs.readFileSync(path.join(ROOT, file)).toString("base64")}` : null;
}

// until the picture exists the prototype shows the zone draft, which has the right shape
function playableArt(L) {
  return embeddedArt(L) || `data:image/png;base64,${fs.readFileSync(path.join(ROOT, draftFile(L))).toString("base64")}`;
}

const TIER_COLOR = { easy: "#6da7ec", medium: "#3987e5", hard: "#1c5cab", expert: "#0d366b" }; // ordinal ramp, validated on #f8f4e3

// Difficulty score 0–100: the solver's effort scaled so the hardest pack level (≈140,
// on par with the 9×11 benchmark) sits at 100. Levels play in score order.
const difficultyOf = (effort) => Math.min(100, Math.round(effort / 1.4));
const tagOf = (d) => (d < 30 ? "easy" : d < 58 ? "medium" : d < 82 ? "hard" : "expert");
const TAG_TR = { easy: "easy (kolay)", medium: "medium (orta)", hard: "hard (zor)", expert: "expert (uzman)" };
const seedOf = (id) => [...id].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 7);
const TECH = { 1: ["tek yer", "Sayının sığabileceği tek dikdörtgen kaldı."],
  2: ["tek sahip", "Boş bir hücreye yalnızca bir sayı uzanabiliyor; o sayının dikdörtgeni o hücreyi kapsamak zorunda."],
  3: ["kesişim", "Bir sayının bütün seçenekleri aynı hücrelerden geçiyor; o hücreler komşu sayılara kapanıyor."],
  4: ["eleme", "Seçeneklerden birini çizseydin başka bir sayıya yer kalmazdı ya da bir hücre boşta kalırdı; o seçenek elenir."] };
const ORIENT_ORDER = ["dik", "yatay", "kare"];
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen"];

// ---------- levels ----------
// L.artGrid is the zone layout the level's picture was drawn on (drafts, zone table,
// prompt); L.puzzle is the Shikaku split the player solves, independent of it.
function buildLevel(L, { search }) {
  const art = parseLayout(L.artGrid);
  for (const z of art.zones) if (!L.zones[z.key]) throw new Error(`${L.id}: art zone ${z.key} has no content`);
  if (!L.puzzle) {
    if (!search) throw new Error(`${L.id}: no puzzle (run with --search)`);
    L.puzzle = generatePuzzle(L.spec.cols, L.spec.rows, L.spec, { seed: seedOf(L.id) });
    if (!L.puzzle) throw new Error(`${L.id}: no puzzle meets the spec, loosen it`);
    savePuzzle(L);
  }
  const layout = parseLayout(L.puzzle.grid);
  const locks = L.puzzle.locks || {};
  const clues = layout.zones.map((z) => {
    const [r, c] = L.puzzle.clues[z.key] || [];
    if (r === undefined || r < z.r0 || r > z.r1 || c < z.c0 || c > z.c1) throw new Error(`${L.id}: clue of piece ${z.key} is outside it`);
    // the solver treats a locked clue as "?": the player can't see its size until it opens
    return L.puzzle.hidden.includes(z.key) || z.key in locks ? { r, c, n: z.area, h: 1 } : { r, c, n: z.area };
  });
  // what the game gets: "?" clues keep h, locked clues carry the piece count that opens them
  const gameClues = layout.zones.map((z, k) => (z.key in locks ? { r: clues[k].r, c: clues[k].c, n: clues[k].n, lock: locks[z.key] } : clues[k]));
  const puzzle = { rows: layout.rows, cols: layout.cols, clues };
  const a = analyse(puzzle);
  if (!a.unique) throw new Error(`${L.id}: ${a.sols === 0 ? "no" : "more than one"} solution`);
  const why = checkSpec(a, L.spec, layout);
  if (why) throw new Error(`${L.id}: ${why}`);
  layout.zones.forEach((z, k) => {
    if (!(z.key in locks)) return;
    const at = a.steps.findIndex((st) => st.clue === k);
    if (at < locks[z.key]) throw new Error(`${L.id}: lock on ${z.key} opens after ${locks[z.key]} pieces but the solve needs it as piece ${at + 1}`);
  });
  // solve order = hint order: the game hands out the first unplaced rect of `solution`
  const solution = a.steps.map((s) => [s.rect.r0, s.rect.c0, s.rect.r1, s.rect.c1]);
  return { L, art, layout, puzzle, gameClues, a, solution };
}

function savePuzzle(L) {
  const file = path.join(__dirname, "pack_4-23.js");
  const src = fs.readFileSync(file, "utf8");
  const at = src.indexOf(`id: "${L.id}",`);
  const i = src.indexOf("puzzle: null,", at);
  if (at < 0 || i < 0) throw new Error(`${L.id}: can't find its "puzzle: null," line in pack_4-23.js`);
  const p = L.puzzle;
  const block = `puzzle: {\n      grid: [\n${p.grid.map((r) => `        ${JSON.stringify(r)},`).join("\n")}\n      ],\n` +
    `      clues: { ${Object.entries(p.clues).map(([k, v]) => `${k}: [${v.join(", ")}]`).join(", ")} },\n      hidden: ${JSON.stringify(p.hidden)},\n` +
    `      locks: { ${Object.entries(p.locks || {}).map(([k, v]) => `${k}: ${v}`).join(", ")} },\n    },`;
  fs.writeFileSync(file, src.slice(0, i) + block + src.slice(i + "puzzle: null,".length));
  console.log(`${L.id}: new puzzle saved`);
}

// ---------- formatting ----------
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pct = (v, n) => Math.round((v / n) * 1000) / 10;
const en = (x) => String(x);
const tr = (x) => String(x).replace(".", ",");
const zoneBox = (z, m) => ({ x0: pct(z.c0, m.art.cols), x1: pct(z.c1 + 1, m.art.cols), y0: pct(z.r0, m.art.rows), y1: pct(z.r1 + 1, m.art.rows) });
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

function where(q, R, C) {
  const top = q.r0 === 0, bottom = q.r1 === R - 1, left = q.c0 === 0, right = q.c1 === C - 1;
  if (left && right) return top ? "tahtanın üstünde, boydan boya" : bottom ? "tahtanın altında, boydan boya" : "tahtayı enine kesiyor";
  if (top && bottom) return left ? "sol kenarda, boydan boya" : right ? "sağ kenarda, boydan boya" : "tahtayı boyuna kesiyor";
  if (top && left) return "sol üst köşede";
  if (top && right) return "sağ üst köşede";
  if (bottom && left) return "sol alt köşede";
  if (bottom && right) return "sağ alt köşede";
  if (top) return "üst kenarda";
  if (bottom) return "alt kenarda";
  if (left) return "sol kenarda";
  if (right) return "sağ kenarda";
  return "tahtanın ortasında";
}
const shape = (q) => `${q.c1 - q.c0 + 1}×${q.r1 - q.r0 + 1}`;
const clueCell = (m, i) => { const k = m.puzzle.clues[i]; return `${k.r + 1}. satır ${k.c + 1}. sütun`; };
const clueLabel = (m, i) => (m.gameClues[i].lock ? `🔒${m.gameClues[i].lock}` : m.puzzle.clues[i].h ? "?" : String(m.puzzle.clues[i].n));

function openingPiece(m, st) {
  const { a, layout } = m;
  const raw = a.raw[st.clue];
  const lead = `<b>${clueCell(m, st.clue)}daki ${clueLabel(m, st.clue)}</b>, ${where(st.rect, layout.rows, layout.cols)}`;
  return raw === 1
    ? `${lead}: tahtaya tek bir şekilde sığıyor (${shape(st.rect)}).`
    : `${lead}: sığabileceği ${raw} dikdörtgenden yalnızca biri başka bir sayı içermiyor (${shape(st.rect)}).`;
}

const cellName = (m, x) => `${Math.floor(x / m.layout.cols) + 1}. satır ${(x % m.layout.cols) + 1}. sütun`;
const orList = (list) => {
  const o = ORIENT_ORDER.filter((x) => list.includes(x));
  return o.length > 1 ? `${o.slice(0, -1).join(", ")} ya da ${o[o.length - 1]}` : o[0];
};

// why the solver could settle a decision moment, in the player's words
function reasonText(m, st) {
  const notes = st.why || [];
  if (st.tech === 4) {
    const w = notes.find((x) => orient(x.rect) !== st.orient) || notes[0];
    if (!w) return "";
    const alt = orient(w.rect);
    return w.by !== undefined
      ? `${alt} çizseydin ${clueCell(m, w.by)}daki ${clueLabel(m, w.by)} için yer kalmazdı`
      : `${alt} çizseydin ${cellName(m, w.cell)}daki hücreye hiçbir sayı uzanamazdı`;
  }
  const w = notes[0];
  if (!w) return "";
  if (w.cell !== undefined) return `${cellName(m, w.cell)}daki boş hücreye bu sayıdan başka hiçbiri uzanamıyor`;
  return `${clueCell(m, w.by)}daki ${clueLabel(m, w.by)} nasıl çizilirse çizilsin bazı hücreleri kaplıyor ve bu sayı o hücrelere giremiyor`;
}

function openingText(m) {
  const { a } = m;
  const opens = a.steps.slice(0, a.startOptions);
  let html = opens.length === 1
    ? `<p><span class="k">Açılış</span> ${openingPiece(m, opens[0])}</p>`
    : `<p><span class="k">İki açılış</span> ${opens.map((st) => openingPiece(m, st)).join(" ")}${m.L.spec.twoFronts ? " İki uçtan başlayıp ortada buluşuyorsun." : " İstediğinden başlayabilirsin."}</p>`;
  const k = a.steps.findIndex((st) => st.tech >= 2 && st.orients.length >= 2);
  if (k >= 0) {
    const st = a.steps[k];
    const why = reasonText(m, st);
    html += `<p><span class="k">İlk karar</span> ${k + 1}. hamlede hiçbir parça hemen kesin değil. <b>${clueCell(m, st.clue)}daki ${clueLabel(m, st.clue)}</b> ${orList(st.orients)} çizilebilir görünüyor.${why ? ` Ama ${why}.` : ""} Doğrusu ${st.orient}: ${shape(st.rect)}.</p>`;
  }
  return html;
}

const PLACE = { tl: "sol üst köşe", tr: "sağ üst köşe", bl: "sol alt köşe", br: "sağ alt köşe",
  top: "üst kenar", bottom: "alt kenar", left: "sol kenar", right: "sağ kenar", center: "merkez" };
function shortOpening(m) {
  const { a, layout } = m;
  const R = layout.rows, C = layout.cols;
  return a.steps.slice(0, a.startOptions).map((s) => {
    const q = s.rect, full = (q.c0 === 0 && q.c1 === C - 1) || (q.r0 === 0 && q.r1 === R - 1);
    return `${clueLabel(m, s.clue)} · ${PLACE[placeOf(q, R, C)]}${full ? " (boydan boya)" : ""}`;
  }).join(" + ");
}

// ---------- SVG ----------
function draftSVG(m) {
  const { art: layout, L } = m;
  const [AW, AH] = artSize(L), VH = Math.round((300 * AH) / AW);
  const S = 300 / layout.cols, T = VH / layout.rows;
  let s = `<svg viewBox="0 0 300 ${VH}" role="img" aria-label="Level ${L.no} bölge taslağı"><rect x="0" y="0" width="300" height="${VH}" fill="#2b3229"/>`;
  layout.zones.forEach((z, k) => {
    const x = z.c0 * S + 3, y = z.r0 * T + 3, w = (z.c1 - z.c0 + 1) * S - 6, h = (z.r1 - z.r0 + 1) * T - 6;
    const col = L.zones[z.key][2];
    s += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${col}"/>`;
    const tx = x + w / 2, ty = y + h / 2 + 5;
    s += `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="middle"${luminance(col) < 0.2 ? ' style="fill:#e8eee9"' : ""}>${k + 1}</text>`;
  });
  return s + "</svg>";
}

function boardSVG(m) {
  const { layout, puzzle, a, L } = m;
  const R = layout.rows, C = layout.cols;
  const pad = 7, gap = 2, cell = (300 - 2 * pad - (C - 1) * gap) / C;
  const H = Math.round(2 * pad + R * cell + (R - 1) * gap);
  const cx = (c) => pad + c * (cell + gap), cy = (r) => pad + r * (cell + gap);
  let s = `<svg class="board" viewBox="0 0 300 ${H}" role="img" aria-label="Level ${L.no} oyuncu görünümü"><rect x="0" y="0" width="300" height="${H}" fill="#9fac97"/>`;
  const opens = a.steps.slice(0, a.startOptions).map((st) => st.rect);
  const inOpen = (r, c) => opens.some((q) => r >= q.r0 && r <= q.r1 && c >= q.c0 && c <= q.c1);
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    s += `<rect x="${cx(c).toFixed(1)}" y="${cy(r).toFixed(1)}" width="${cell.toFixed(1)}" height="${cell.toFixed(1)}" fill="${inOpen(r, c) ? "#dfeede" : "#fbfaf0"}"/>`;
  }
  for (const q of opens) {
    const x = cx(q.c0), y = cy(q.r0), w = cx(q.c1) + cell - x, h = cy(q.r1) + cell - y;
    s += `<rect x="${(x + 1.5).toFixed(1)}" y="${(y + 1.5).toFixed(1)}" width="${(w - 3).toFixed(1)}" height="${(h - 3).toFixed(1)}" fill="none" stroke="#477a5b" stroke-width="3"/>`;
  }
  const b = Math.min(24, cell * 0.62);
  for (const k of m.gameClues) {
    const x = cx(k.c) + cell / 2, y = cy(k.r) + cell / 2;
    const label = k.lock ? `🔒${k.lock}` : k.h ? "?" : String(k.n);
    const w = label.length > 1 ? b * 1.3 : b;
    s += `<rect x="${(x - w / 2).toFixed(1)}" y="${(y - b / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${b.toFixed(1)}" fill="${k.h ? "#f5e7c4" : "#fffdf0"}" stroke="#2b3229" stroke-width="1.5"/>`;
    s += `<text class="clue" x="${x.toFixed(1)}" y="${(y + b * 0.24).toFixed(1)}" text-anchor="middle" style="font-size:${(b * 0.62).toFixed(1)}px${k.h ? ";fill:#7a5c16" : ""}">${label}</text>`;
  }
  return s + "</svg>";
}

function chartSVG(models) {
  const W = 860, left = 40, right = 850, top = 22, base = 200;
  const stepV = 20, max = 100;
  const band = (right - left) / models.length, bw = 22;
  const y = (v) => base - (v / max) * (base - top);
  let s = `<svg class="chart" viewBox="0 0 ${W} 232" role="group" aria-label="Level başına zorluk skoru">`;
  for (let t = 0; t < max; t += max > 100 ? 2 * stepV : stepV) {
    s += `<line x1="${left}" x2="${right}" y1="${y(t)}" y2="${y(t)}" class="${t ? "grid" : "base"}"/><text class="tick" x="${left - 8}" y="${y(t) + 4}" text-anchor="end">${t}</text>`;
  }
  s += `<line x1="${left}" x2="${right}" y1="${y(100)}" y2="${y(100)}" class="grid"/><text class="tick" x="${left - 8}" y="${y(100) + 4}" text-anchor="end">100</text>`;
  let peak = models[0];
  for (const m of models) if (m.difficulty > peak.difficulty) peak = m;
  models.forEach((m, i) => {
    const x = left + i * band + (band - bw) / 2, v = m.difficulty, yt = y(v);
    const d = `M${x},${base} V${yt + 4} Q${x},${yt} ${x + 4},${yt} H${x + bw - 4} Q${x + bw},${yt} ${x + bw},${yt + 4} V${base} Z`;
    const label = `Level ${m.L.no}, ${m.L.tr}, ${m.tag}, zorluk skoru ${v}`;
    s += `<g class="bar" tabindex="0" role="img" aria-label="${esc(label)}" data-tip="${esc(JSON.stringify({ v: String(v), t: `Level ${m.L.no} · ${m.L.tr} · ${m.tag}` }))}">`;
    s += `<rect class="hit" x="${left + i * band}" y="${top - 12}" width="${band}" height="${base - top + 12}"/>`;
    s += `<path d="${d}" fill="${TIER_COLOR[m.tag]}"/></g>`;
    s += `<text class="tick" x="${x + bw / 2}" y="${base + 16}" text-anchor="middle">${m.L.no}</text>`;
    if (m === peak) s += `<text class="peak" x="${x + bw / 2}" y="${yt - 6}" text-anchor="middle">${tr(v)}</text>`;
  });
  return s + "</svg>";
}

// ---------- prompt ----------
function promptText(m) {
  const { L, art: layout } = m;
  const sc = L.scene, n = layout.zones.length, N = WORDS[n] || String(n);
  const lines = layout.zones.map((z, k) => {
    const b = zoneBox(z, m);
    return `- Zone ${k + 1} (x ${en(b.x0)}-${en(b.x1)}%, y ${en(b.y0)}-${en(b.y1)}%): ${L.zones[z.key][1]}`;
  });
  const bullets = [...sc.bullets,
    sc.horizon === "eye level" ? "one consistent eye level and perspective" : "one consistent horizon and perspective",
    sc.light,
    sc.repeat === "natural" ? "repeating natural details and materials" : "repeating architectural details and materials",
    "environmental elements that naturally continue across zone boundaries"];
  return [
    `Cozy pixel-art scene, ${artSize(L).join("x")}${isSquare(L) ? "" : ` portrait (${L.spec.cols}:${L.spec.rows}, taller than wide)`}, inspired by warm farming-life RPG pixel art.`,
    `Create one single, continuous, coherent <b>${esc(sc.what)}</b> scene viewed from a fixed camera angle. The entire image must share the same perspective, architecture, lighting direction, scale, materials, atmosphere, and visual storytelling.`,
    `The image is divided into ${n} rectangular color regions that must follow this exact layout (percent of width x height):\n${lines.map(esc).join("\n")}`,
    `IMPORTANT: These ${n} zones are not separate rooms, panels, illustrations, or mini-scenes. They are only underlying compositional regions within one unified ${esc(sc.place)} environment. Every zone must feel like part of the same physical place.`,
    `Use one continuous ${esc(sc.structure)} across the full image:\n${bullets.map((x) => `- ${esc(x)}`).join("\n")}`,
    `Each region may have a slightly different dominant color identity, but the colors must blend harmoniously into neighboring regions. Use gradual changes in ${esc(sc.identity)} to establish each region's color identity.`,
    `Objects and architectural elements should cross zone boundaries to visually connect the regions. ${esc(sc.cross)}`,
    `Zone boundaries must not look like frames, cards, panels, separate rooms, or hard scene cuts. Boundaries should be implied subtly through natural transitions such as ${esc(sc.bounds)}.`,
    `The final image should read immediately as one ${esc(sc.readAs)} scene, with the ${n}-region structure only becoming noticeable when examined carefully.`,
    `Cozy, polished pixel art, soft cream highlights, ${esc(sc.style)}, charming details, harmonious ${esc(sc.palette)} palette, readable silhouettes, consistent pixel density, casual puzzle-game reward image. No text anywhere in the image.`,
    `Avoid: ${N} separate pictures, collage layout, comic panels, isolated rooms, mismatched perspectives, different times of day, unrelated environments, hard rectangular borders, abrupt color changes, separate backgrounds, repeated ${esc(sc.place)} scenes.`,
  ].join("\n\n");
}

// ---------- level data ----------
function levelObject(m, indent = "  ") {
  const { L, puzzle, solution } = m;
  const i1 = indent + "  ", i2 = i1 + "  ";
  const clue = (k) => `{ r: ${k.r}, c: ${k.c}, n: ${k.n}${k.h ? ", h: 1" : ""}${k.lock ? `, lock: ${k.lock}` : ""} }`;
  return [
    `${indent}{`,
    `${i1}// Level ${L.no} — ${L.tr} · ${m.tag} (${m.difficulty}) · ${L.variety}`,
    `${i1}rows: ${puzzle.rows},`,
    `${i1}cols: ${puzzle.cols},`,
    `${i1}clues: [`,
    m.gameClues.map((k) => `${i2}${clue(k)}`).join(",\n"),
    `${i1}],`,
    `${i1}solution: [`,
    solution.map((q) => `${i2}[${q.join(", ")}]`).join(",\n"),
    `${i1}],`,
    `${i1}artName: ${JSON.stringify(L.artName)},`,
    `${i1}artImage: ${JSON.stringify(artPath(L) || draftFile(L))},`,
    `${i1}difficulty: ${m.difficulty},`,
    `${i1}tag: ${JSON.stringify(m.tag)},`,
    `${i1}artPrompt: ${JSON.stringify(`Cozy pixel-art ${L.scene.what} scene built on the Level ${L.no} Shikaku region blueprint (${m.art.zones.length} zones, one continuous scene).`)}`,
    `${indent}}`,
  ].join("\n");
}

function writeData(models) {
  const body = models.map((m) => levelObject(m)).join(",\n");
  const js = `// Pixhaku — Level 4–23. tools/build_pack.js üretir; elle değil, tools/pack_4-23.js üzerinden düzenle.
// Pixhaku_prototype.html'deki levels dizisine eklenecek biçimde.
//   solution  mantıksal çözüm sırasında: Hint her zaman sıradaki kesinleşen parçayı verir.
//   artImage  üretilmiş görselin proje içindeki yolu; prototipte görsel dosyanın içine gömülür.
const PIXHAKU_LEVELS_4_23 = [
${body}
];

if (typeof module !== "undefined") module.exports = PIXHAKU_LEVELS_4_23;
`;
  fs.writeFileSync(path.join(ROOT, DATA), js);
}

// ---------- PNG ----------
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return (buf) => { let c = 0xffffffff; for (const b of buf) c = t[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
})();
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(CRC(td));
  return Buffer.concat([len, td, crc]);
}
function writeDraftPNG(m, file) {
  const [SIZE, HEIGHT] = artSize(m.L), inset = SIZE * 3 / 300; // same proportions as the page's SVG drafts
  const px = Buffer.alloc(SIZE * HEIGHT * 3);
  const fill = (x0, y0, x1, y1, hex) => {
    const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const o = (yy * SIZE + xx) * 3; px[o] = rgb[0]; px[o + 1] = rgb[1]; px[o + 2] = rgb[2]; }
  };
  fill(0, 0, SIZE, HEIGHT, "#2b3229");
  const S = SIZE / m.art.cols, T = HEIGHT / m.art.rows;
  for (const z of m.art.zones) {
    fill(Math.round(z.c0 * S + inset), Math.round(z.r0 * T + inset), Math.round((z.c1 + 1) * S - inset), Math.round((z.r1 + 1) * T - inset), m.L.zones[z.key][2]);
  }
  const raw = Buffer.alloc((SIZE * 3 + 1) * HEIGHT);
  for (let yy = 0; yy < HEIGHT; yy++) px.copy(raw, yy * (SIZE * 3 + 1) + 1, yy * SIZE * 3, (yy + 1) * SIZE * 3);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(HEIGHT, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr), pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })), pngChunk("IEND", Buffer.alloc(0))]));
}

// ---------- page ----------
function levelSection(m) {
  const { L, layout, a } = m;
  const n = layout.zones.length;
  const png = draftFile(L);
  const art = embeddedArt(L);
  const [AW, AH] = artSize(L);
  const rows = m.art.zones.map((z, k) => {
    const b = zoneBox(z, m);
    const [trText, , col] = L.zones[z.key];
    return `<tr><td><i class="sw" style="background:${col}"></i>${k + 1}</td><td>${tr(b.x0)}–${tr(b.x1)} · ${tr(b.y0)}–${tr(b.y1)}</td><td>${esc(trText)}</td></tr>`;
  }).join("\n      ");
  const steps = a.steps.map((s) => {
    const dilemma = s.tech >= 2 && s.orients.length >= 2
      ? `<span class="o">${ORIENT_ORDER.filter((x) => s.orients.includes(x)).join("/")} → ${s.orient}</span>` : "";
    return `<li${s.tech >= 2 ? ' class="karar"' : ""} title="${clueCell(m, s.clue)}">${clueLabel(m, s.clue)}<span class="t t${s.tech}">${TECH[s.tech][0]}</span>${dilemma}</li>`;
  }).join("");
  const tc = a.techCounts;
  const nLocks = Object.keys(L.puzzle.locks || {}).length;
  const hiddenNote = (L.puzzle.hidden.length ? ` · <b>${L.puzzle.hidden.length} gizli sayı</b> (?)` : "") + (nLocks ? ` · <b>${nLocks} kilit</b> (🔒)` : "");
  return `
  <section class="level" id="level-${L.no}">
  <h2>Level ${L.no} — ${esc(L.tr)}</h2>
  <p class="sub">${layout.cols}×${layout.rows} tahta · ${n} parça · görsel ${m.art.zones.length} bölgeli taslakla ${art ? "üretildi" : "üretilecek"}</p>
  <p class="sub">Referans dosya: <a href="${png}" download><strong>${png}</strong></a> · <span class="tier"><i class="sw" style="background:${TIER_COLOR[m.tag]}"></i>${m.tag} · skor ${m.difficulty}</span> · ${esc(L.variety)} · ${a.startOptions} kesin açılış · ${a.decisions} karar anı · hamlelerin %${Math.round(a.t1Frac * 100)}'i kendiliğinden belli${hiddenNote}</p>
  ${art ? `<figure class="artwork"><a href="${artPath(L)}" target="_blank" rel="noopener"><img src="${art}" alt="Level ${L.no} — ${esc(L.tr)} piksel sanat görseli" width="${AW}" height="${AH}" loading="lazy"></a><figcaption>Üretilmiş level görseli · <a href="${artPath(L)}" download>Görseli indir</a> · <a href="Pixhaku_prototype.html#level-${L.no}">Bu level'ı oyna →</a></figcaption></figure>`
    : `<div class="pending"><b>Görsel bekleniyor · ${AW}×${AH}${isSquare(L) ? "" : " dikey"}</b><br>Taslak PNG'yi ve aşağıdaki prompt'u kullanıp görseli <code>${artFile(L)}</code> olarak kaydet, sonra <code>node tools/build_pack.js</code> çalıştır. O zamana kadar prototipte taslak görünür. <a href="Pixhaku_prototype.html#level-${L.no}">Bu level'ı oyna →</a></div>`}
  <div class="row">
    ${draftSVG(m)}
    <table>
      <tr><th>Görsel bölgesi</th><th>Konum (x · y, %)</th><th>İçerik önerisi</th></tr>
      ${rows}
    </table>
  </div>
  <div class="row solve">
    <figure>${boardSVG(m)}<figcaption>Oyuncunun gördüğü tahta. Yeşil çerçeve: ${a.startOptions === 2 ? "iki kesin açılış" : "kesin açılış parçası"}.</figcaption></figure>
    <div class="path">
      ${openingText(m)}
      <p class="k">Çözüm sırası (Hint de bu sırayı izler) · çerçeveli: karar anı</p>
      <ol class="steps">${steps}</ol>
      <p class="meta">${tc[1]} tek yer · ${tc[2]} tek sahip · ${tc[3]} kesişim · ${tc[4]} eleme · karar başına ortalama ${tr(a.avgLive)} seçenek · tahmin gerekmiyor · tek çözüm ✓ · zorluk puanı ${tr(a.effort)}</p>
    </div>
  </div>
  <details${art ? "" : " open"}><summary>Görsel üretim prompt'u</summary><div class="copyable"><button type="button" class="copy">Kopyala</button><pre>${promptText(m)}</pre></div></details>
  <details><summary>Level verisi — Pixhaku_prototype.html → levels</summary><div class="copyable"><button type="button" class="copy">Kopyala</button><pre class="code">${esc(levelObject(m, ""))}</pre></div></details>
  </section>`;
}

function writePage(models, order) {
  const overview = models.map((m) => `<tr><td><a href="#level-${m.L.no}">${m.L.no}</a></td><td>${esc(m.L.tr)}</td><td>${m.layout.cols}×${m.layout.rows}</td><td class="num">${m.layout.zones.length}</td><td class="num">${m.a.startOptions}</td><td class="num">${m.a.decisions}</td><td class="num">${Math.round(m.a.t1Frac * 100)}%</td><td class="num">${m.difficulty}</td><td><span class="tier"><i class="sw" style="background:${TIER_COLOR[m.tag]}"></i>${m.tag}</span></td><td>${esc(m.L.variety)}</td><td>${esc(shortOpening(m))}</td><td>${artPath(m.L) ? "hazır" : `bekleniyor · ${artSize(m.L).join("×")}`}</td></tr>`).join("\n      ");
  const pending = models.filter((m) => !artPath(m.L));
  const pendingNote = pending.length ? `<div class="note"><b>Görseli bekleyen ${pending.length} level:</b> ${pending.map((m) => `<a href="#level-${m.L.no}">Level ${m.L.no}</a> → <code>${artFile(m.L)}</code> (${artSize(m.L).join("×")})`).join(" · ")}. Her birinin taslağı ve prompt'u kendi bölümünde. Görseli bu adla kaydedip build'i çalıştırınca sayfaya ve prototipe gömülür.</div>` : "";
  const legend = Object.entries(TIER_COLOR).map(([t, c]) => `<span><i class="sw" style="background:${c}"></i>${t}</span>`).join("");
  const html = `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Pixhaku Level 4–23</title>
<!-- tools/build_pack.js üretir; içeriği tools/pack_4-23.js'ten düzenle. -->
<style>
  :root{--ink:#2b3229;--paper:#e8e3cf;--card:#f8f4e3;--muted:#6a7468;--accent:#477a5b}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--paper);color:var(--ink);font:15px/1.55 -apple-system,'Segoe UI',sans-serif;padding:36px 16px 80px}
  .wrap{max-width:860px;margin:0 auto}
  h1{font-size:24px;margin-bottom:6px}
  .lead{color:var(--muted);margin-bottom:8px;max-width:70ch}
  .note{background:#f5ebd4;border:1px solid #e4ce9a;border-left:4px solid #b07a12;padding:10px 14px;font-size:13.5px;margin:14px 0;max-width:70ch}
  .note.rule{background:#e3eedf;border-color:#b8d0b0;border-left-color:var(--accent)}
  .note ul{padding-left:18px;margin-top:4px}
  h2{font-size:19px;margin:0 0 4px}
  h3{font-size:16px;margin:34px 0 8px}
  .level{margin-top:44px;padding-top:6px;border-top:2px solid #cfc9b4}
  .sub{color:var(--muted);font-size:13.5px;margin-bottom:14px}
  .sub a{color:inherit}
  .row{display:grid;grid-template-columns:300px 1fr;gap:22px;align-items:start}
  .row + .row{margin-top:18px}
  @media(max-width:720px){.row{grid-template-columns:1fr}}
  svg{display:block;width:100%;max-width:300px;border:3px solid var(--ink)}
  svg text{font:700 15px monospace;fill:#1c211b}
  svg text.clue{font-family:monospace;font-weight:700;fill:#26382b}
  figure figcaption{font-size:12.5px;color:var(--muted);margin-top:6px;max-width:300px}
  table{border-collapse:collapse;width:100%;background:var(--card);border:1px solid #cfc9b4;font-size:13px}
  th,td{padding:7px 10px;text-align:left;border-bottom:1px solid #e3ddc8;vertical-align:top}
  th{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
  tr:last-child td{border-bottom:none}
  td.num{font-variant-numeric:tabular-nums;text-align:right}
  .scroll{overflow-x:auto}
  .overview{min-width:960px}
  .overview a{color:var(--ink);font-weight:700}
  .sw{display:inline-block;width:12px;height:12px;border:1px solid rgba(0,0,0,.25);vertical-align:-1px;margin-right:6px}
  .tier{white-space:nowrap}
  .path p{font-size:14px;margin-bottom:8px}
  .k{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-right:6px}
  p.k{margin:12px 0 6px}
  .steps{list-style:none;counter-reset:s;display:flex;flex-wrap:wrap;gap:6px}
  .steps li{counter-increment:s;background:var(--card);border:1px solid #cfc9b4;padding:3px 8px 3px 6px;font-size:12.5px;white-space:nowrap}
  .steps li::before{content:counter(s);display:inline-block;min-width:16px;font-weight:700;color:var(--muted);margin-right:4px}
  .steps .sw{margin-right:4px}
  .t{margin-left:6px;font-size:11px;padding:0 5px;border-radius:3px;background:#e7e2cc;color:#4d5a4b}
  .t2{background:#dfe7f3;color:#2b4a70}
  .t3{background:#f1dcd0;color:#7a3b1c}
  .t4{background:#e6dcf1;color:#4b2f73}
  .steps li.karar{border-color:#8a8a6a;box-shadow:inset 0 0 0 1px #8a8a6a}
  .o{margin-left:6px;font-size:11px;color:#4d5a4b}
  .meta{font-size:12.5px;color:var(--muted);margin-top:10px}
  .copyable{position:relative;margin-top:14px}
  .copy{position:absolute;top:8px;right:8px;font:600 11px -apple-system,'Segoe UI',sans-serif;color:#e8eee9;background:rgba(232,238,233,.12);border:1px solid rgba(232,238,233,.35);padding:4px 9px;border-radius:3px;cursor:pointer}
  .copy:hover{background:rgba(232,238,233,.22)}
  pre{background:#2b3229;color:#e8eee9;font:12.5px/1.6 ui-monospace,Menlo,monospace;padding:16px 18px;border-radius:4px;white-space:pre-wrap}
  pre b{color:#7bd8b8}
  pre.code{white-space:pre;overflow-x:auto}
  details{margin-top:12px}
  details .copyable{margin-top:8px}
  summary{cursor:pointer;font-size:13.5px;color:var(--muted)}
  .chartbox{background:var(--card);border:1px solid #cfc9b4;padding:14px 14px 8px;position:relative}
  .chartbox .legend{display:flex;gap:16px;flex-wrap:wrap;font-size:12.5px;margin-bottom:6px}
  .chartscroll{overflow-x:auto}
  svg.chart{max-width:none;min-width:620px;border:none}
  svg.chart .grid{stroke:rgba(43,50,41,.12);stroke-width:1}
  svg.chart .base{stroke:rgba(43,50,41,.35);stroke-width:1}
  svg.chart text.tick{font:400 11px -apple-system,'Segoe UI',sans-serif;fill:var(--muted);font-variant-numeric:tabular-nums}
  svg.chart text.peak{font:600 12px -apple-system,'Segoe UI',sans-serif;fill:var(--ink)}
  svg.chart .hit{fill:transparent}
  svg.chart .bar{cursor:default;outline:none}
  svg.chart .bar:hover path,svg.chart .bar:focus path{filter:brightness(1.15)}
  svg.chart .bar:focus .hit{fill:rgba(43,50,41,.06)}
  .tip{position:absolute;pointer-events:none;background:#fffdf0;border:1px solid #cfc9b4;box-shadow:2px 2px 0 rgba(43,50,41,.15);padding:6px 9px;font-size:12.5px;white-space:nowrap;display:none}
  .tip b{display:block;font-size:14px}
  .caption{font-size:12.5px;color:var(--muted);margin:8px 0 0}
  .artwork{margin:18px 0 24px}
  .pending{margin:18px 0 24px;padding:12px 14px;background:#f5ebd4;border:1px dashed #b07a12;font-size:13.5px}
  .artwork img{display:block;width:100%;height:auto;border:3px solid var(--ink);image-rendering:pixelated}
  .artwork figcaption{max-width:none}
  .artwork a,.play-link{color:var(--accent)}
</style>
</head>
<body>
<div class="wrap">
  <h1>Level 4–23 — Görseller ve Level Tasarımları</h1>
  <p class="lead">Prototipteki ilk 3 level'dan sonra gelen 20 yeni level. Üretilmiş görseller, bölge şemaları, çözüm sıraları ve üretim prompt'ları aşağıda. Görseller bu HTML'in içine gömülüdür; sayfayı tek dosya olarak açabilirsin.</p>
  <p><a class="play-link" href="Pixhaku_prototype.html#level-4">Yeni levelları oyna →</a></p>
  <div class="note">Kurallar: görsel tahtanın oranında, 1024 genişlik (kare level'lar 1024×1024; dikey level'lar örneğin 8×10 tahtada 1024×1280) · görselde yazı olmasın · bölgeler ayrı paneller değil, tek bir sürekli sahnenin altındaki kompozisyon alanları. Her bölgenin kendi renk kimliği olsun ama sınırlar doğal geçişlerle (yol, duvar, gölge, çatı çizgisi) ima edilsin. Prompt'lar Level 3'te doğrulanan "tek sürekli sahne" şablonunu kullanır. Taslak PNG'lerde bölge numarası yok, görsele yazı sızmasın diye. Numaralar yalnızca bu sayfadaki şemalarda. Bölge konuları öneri, değiştirebilirsin. Görsellerin bölge düzeni ile bulmacanın parçaları artık ayrı: bölge tabloları ve prompt'lar görselin nasıl üretildiğini belgeliyor, oyundaki bulmaca daha büyük tahtada kendi parçalarıyla kurulu.</div>
  <div class="note rule"><b>Level tasarım kuralı:</b> açılış hep kesin, boş tahtada yeri belli olan 1 ya da 2 parça var. Sonrasında level karar anlarıyla ilerliyor: hiçbir parçanın hemen kesin olmadığı, bir sayının dik, yatay ya da kare çizilebilir göründüğü anlar. Bu anlar tahminle değil düşünerek çözülüyor, aşağıdaki dört adımdan biri her seferinde doğru seçeneği gösteriyor. Çözücü her level'ı yalnızca bu adımlarla bitiriyor ve çözümün tek olduğunu ayrıca doğruluyor.
    <ul>
      <li><b>tek yer</b>: ${TECH[1][1]}</li>
      <li><b>tek sahip</b>: ${TECH[2][1]}</li>
      <li><b>kesişim</b>: ${TECH[3][1]}</li>
      <li><b>eleme</b>: ${TECH[4][1]}</li>
    </ul>
    Tahtalar 6×6'dan başlıyor, en fazla 8 genişlik ve 10 yükseklik (8×8'e kadar kare, üstü 8×9, 7×10, 8×10 gibi dikey). Hamlelerin çoğu kendiliğinden belli değil: easy level'larda en fazla %45'i, hard level'larda yalnızca dörtte biri. Birçok level'da birden fazla gizli sayı (?) var. Kalan her hamle bir karar anı ve karar başına ortalama 3–4 seçenek tartılıyor. En zor level'lar, referans alınan 9×11'lik zor level'ın profiline yakın: hamlelerin yaklaşık %25'i belli, 12'den fazla karar anı. Açılıştan hemen sonraki hamle en fazla "tek sahip" gerektiriyor. Şekiller en×boy (hücre) olarak yazılı. <code>solution</code> dizisi çözüm sırasında olduğu için Hint butonu da her zaman sıradaki mantıklı parçayı verir.
  </div>

  ${pendingNote}
  <h3>Zorluk skoru ve sıra</h3>
  <div class="chartbox">
    <div class="legend">${legend}</div>
    <div class="chartscroll">${chartSVG(order)}</div>
    <div class="tip" id="tip"></div>
  </div>
  <p class="caption">Zorluk puanı: her parça için gereken mantık adımının ağırlığı, o parçayı açık sayılar arasında bulmanın güçlüğü ve karar anında tartılan seçenek sayısı level boyunca toplanır. Skor bu toplamın 0–100'e ölçeklenmiş hali (140 = 100). Etiketler: easy < 30 ≤ medium < 58 ≤ hard < 82 ≤ expert. Level'lar oyunda skora göre sıralı. İlk üç level prototipte elle yazılmış olanlar, onlar da aynı ölçüyle skorlandı. Değerler aşağıdaki tabloda.</p>

  <h3>Genel bakış</h3>
  <div class="scroll"><table class="overview">
      <tr><th>Level</th><th>Tema</th><th>Tahta</th><th>Parça</th><th>Açılış</th><th>Karar anı</th><th>Belli hamle</th><th>Skor</th><th>Etiket</th><th>Zorluk tipi</th><th>Kesin açılış</th><th>Görsel</th></tr>
      ${overview}
  </table></div>
${models.map(levelSection).join("\n")}
</div>
<script>
  // prompt / level data copy buttons
  document.querySelectorAll(".copy").forEach((btn) => btn.addEventListener("click", async () => {
    const text = btn.parentElement.querySelector("pre").innerText;
    try { await navigator.clipboard.writeText(text); btn.textContent = "Kopyalandı"; }
    catch (e) { btn.textContent = "Kopyalanamadı"; }
    setTimeout(() => { btn.textContent = "Kopyala"; }, 1400);
  }));
  // chart tooltip
  const box = document.querySelector(".chartbox"), tip = document.getElementById("tip");
  function show(bar) {
    const d = JSON.parse(bar.dataset.tip);
    tip.replaceChildren();
    const v = document.createElement("b"); v.textContent = "skor " + d.v;
    tip.append(v, document.createTextNode(d.t));
    tip.style.display = "block";
    const r = bar.querySelector("path").getBoundingClientRect(), b = box.getBoundingClientRect();
    let x = r.left - b.left + r.width / 2 - tip.offsetWidth / 2;
    x = Math.max(4, Math.min(x, b.width - tip.offsetWidth - 4));
    tip.style.left = x + "px";
    tip.style.top = Math.max(4, r.top - b.top - tip.offsetHeight - 8) + "px";
  }
  document.querySelectorAll(".bar").forEach((bar) => {
    bar.addEventListener("pointerenter", () => show(bar));
    bar.addEventListener("focus", () => show(bar));
    bar.addEventListener("pointerleave", () => { tip.style.display = "none"; });
    bar.addEventListener("blur", () => { tip.style.display = "none"; });
  });
</script>
</body>
</html>
`;
  fs.writeFileSync(path.join(ROOT, PAGE), html);
}

// Keep the playable HTML self-contained, including all generated reward images.
function updatePrototype(models, statics) {
  const file = path.join(ROOT, "Pixhaku_prototype.html");
  let html = fs.readFileSync(file, "utf8");
  const levels = models.map((m) => ({
    rows: m.puzzle.rows,
    cols: m.puzzle.cols,
    clues: m.gameClues,
    solution: m.solution,
    artName: m.L.artName,
    artImage: playableArt(m.L),
    artPrompt: `Cozy pixel-art ${m.L.scene.what} scene built on the Level ${m.L.no} Shikaku region blueprint (${m.art.zones.length} zones, one continuous scene).`,
    difficulty: m.difficulty,
    tag: m.tag,
  }));
  const fixed = statics.map((st) => ({ difficulty: st.difficulty, tag: st.tag }));
  const marker = "    // BEGIN GENERATED LEVELS 4-23";
  const block = `${marker}\n    levels.push(...${JSON.stringify(levels)});\n` +
    `    // difficulty score 0-100 and easy/medium/hard tag for the hand-made first levels, then play in score order\n` +
    `    ${JSON.stringify(fixed)}.forEach((d, i) => Object.assign(levels[i], d));\n` +
    `    levels.sort((a, b) => a.difficulty - b.difficulty);\n    // END GENERATED LEVELS 4-23\n\n`;
  if (html.includes(marker)) {
    html = html.replace(/    \/\/ BEGIN GENERATED LEVELS 4-23[\s\S]*?    \/\/ END GENERATED LEVELS 4-23\n\n/, () => block);
  } else {
    if (!html.includes("    const palette = [")) throw new Error("Prototype insertion point missing");
    html = html.replace("    const palette = [", () => block + "    const palette = [");
  }
  html = html.replace("    loadLevel(0);", `    const initialLevel = Number(location.hash.match(/^#level-(\\d+)$/)?.[1] || 1);
    loadLevel(initialLevel >= 1 && initialLevel <= levels.length ? initialLevel - 1 : 0);`);
  fs.writeFileSync(file, html);
}

// The hand-made levels at the top of the prototype's levels array (read from its source,
// which the build never reorders) are scored too, so the whole game plays in one order.
function staticLevels() {
  const html = fs.readFileSync(path.join(ROOT, "Pixhaku_prototype.html"), "utf8");
  const src = html.slice(html.indexOf("const levels = ["), html.indexOf("// BEGIN GENERATED LEVELS"));
  const out = [];
  for (const m of src.matchAll(/rows: (\d+),\s*cols: (\d+),\s*clues: \[([\s\S]*?)\],[\s\S]*?artName: "([^"]+)"/g)) {
    const clues = [...m[3].matchAll(/\{ r: (\d+), c: (\d+), n: (\d+)(, h: 1)? \}/g)].map((x) => ({ r: +x[1], c: +x[2], n: +x[3], ...(x[4] ? { h: 1 } : {}) }));
    const a = analyse({ rows: +m[1], cols: +m[2], clues });
    if (!a.unique || !a.solved) throw new Error(`prototype level "${m[4]}" is not uniquely solvable`);
    const difficulty = difficultyOf(a.effort);
    out.push({ static: true, L: { tr: m[4], artName: m[4] }, a, difficulty, tag: tagOf(difficulty) });
  }
  return out;
}

// ---------- in-game generator ----------
// generator.js: tools/shikaku.js plus these profiles, for making levels inside the game
// once the built-in ones are done. Each profile mirrors its tag's band in the pack; a
// result that lands in another band is retried with a new seed.
const INGAME = {
  easy:   { sizes: [[6, 6], [6, 7]], spec: { start: [1, 2], maxTech: 4, pieces: [7, 10], effortTarget: 32, t1Max: 0.5, decMin: 3, liveMin: 2.3, hiddenCount: 0 } },
  medium: { sizes: [[7, 7], [7, 8]], spec: { start: [1, 2], maxTech: 4, pieces: [9, 12], effortTarget: 62, t1Max: 0.38, decMin: 6, liveMin: 2.8, deepMin: 1, hiddenCount: 1 } },
  hard:   { sizes: [[8, 8], [8, 9], [7, 10]], spec: { start: [1, 1], maxTech: 4, pieceStyle: "big", pieces: [10, 13], effortTarget: 96, t1Max: 0.3, decMin: 8, liveMin: 3, deepMin: 2, cornerMax: 0.35, hiddenCount: 1, lockCount: 1 } },
  expert: { sizes: [[8, 10]], spec: { start: [0, 0], openTech: 3, calm: 0, maxTech: 4, pieceStyle: "big", pieces: [11, 14], effortTarget: 128, t1Max: 0.25, decMin: 10, liveMin: 3, deepMin: 3, cornerMax: 0.35, hiddenCount: 2, lockCount: 1 } },
};

function writeGenerator() {
  const solver = fs.readFileSync(path.join(__dirname, "shikaku.js"), "utf8").replace(/\nmodule\.exports = \{[^}]*\};\s*$/, "\n");
  if (/module\.exports/.test(solver)) throw new Error("generator.js: couldn't strip module.exports from shikaku.js");
  const js = `// Pixhaku in-game level generator. Built from tools/shikaku.js by tools/build_pack.js; edit those, not this.
// PixhakuGen.generate(tag) → Promise of a level { rows, cols, clues, solution, difficulty, tag } that is
// uniquely solvable without guessing, made in a Web Worker so the game keeps running.
// PixhakuGen.mosaic(level) → data-URL picture of the solution, used as the reward image.
(function () {
  "use strict";
  function pixhakuEngine(scope) {
${solver}
    const PROFILES = ${JSON.stringify(INGAME)};
    const difficultyOf = ${difficultyOf.toString()};
    const tagOf = ${tagOf.toString()};
    function generateLevel(tag, seed) {
      const prof = PROFILES[tag];
      if (!prof) throw new Error("unknown difficulty " + tag);
      let best = null;
      const budget = Date.now() + 9000; // stop retrying after ~9 s and keep the closest valid puzzle
      for (let t = 0; t < 8 && (t === 0 || Date.now() < budget || !best); t++) {
        const s = (seed + t * 7919) >>> 0;
        const [cols, rows] = prof.sizes[s % prof.sizes.length];
        // vary the target inside the band so puzzles of one difficulty don't all feel the same
        const effortTarget = Math.round(prof.spec.effortTarget * (0.82 + ((s % 997) / 997) * 0.36));
        const p = generatePuzzle(cols, rows, { ...prof.spec, effortTarget, cols, rows }, { seed: s, tilings: 6, samples: 150, polish: 400, deadline: Date.now() + 3000 });
        if (!p) continue;
        const layout = parseLayout(p.grid);
        const locks = p.locks || {};
        const clues = layout.zones.map((z) => {
          const [r, c] = p.clues[z.key];
          return p.hidden.includes(z.key) || z.key in locks ? { r, c, n: z.area, h: 1 } : { r, c, n: z.area };
        });
        const a = analyse({ rows, cols, clues });
        if (!a.unique || !a.solved) continue;
        const difficulty = difficultyOf(a.effort);
        const level = {
          rows, cols,
          clues: layout.zones.map((z, k) => (z.key in locks ? { r: clues[k].r, c: clues[k].c, n: clues[k].n, lock: locks[z.key] } : clues[k])),
          solution: a.steps.map((st) => [st.rect.r0, st.rect.c0, st.rect.r1, st.rect.c1]),
          difficulty, tag: tagOf(difficulty),
        };
        if (level.tag === tag) return level;
        if (!best || Math.abs(level.difficulty - difficultyOf(prof.spec.effortTarget)) < Math.abs(best.difficulty - difficultyOf(prof.spec.effortTarget))) best = level;
      }
      return best;
    }
    if (scope) scope.onmessage = (e) => {
      try { scope.postMessage({ id: e.data.id, level: generateLevel(e.data.tag, e.data.seed) }); }
      catch (err) { scope.postMessage({ id: e.data.id, error: String(err && err.message || err) }); }
    };
    return { generateLevel };
  }

  let worker = null, nextId = 1;
  const pending = new Map();
  function getWorker() {
    if (worker !== null) return worker;
    try {
      const url = URL.createObjectURL(new Blob(["(" + pixhakuEngine.toString() + ")(self);"], { type: "text/javascript" }));
      worker = new Worker(url);
      worker.onmessage = (e) => {
        const job = pending.get(e.data.id);
        if (!job) return;
        pending.delete(e.data.id);
        if (e.data.error || !e.data.level) job.reject(new Error(e.data.error || "no level")); else job.resolve(e.data.level);
      };
    } catch (_) { worker = false; }
    return worker;
  }

  function generate(tag, seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0) {
    const w = getWorker();
    if (!w) {
      // no worker (some file previews): run on the page after a frame so the spinner shows
      return new Promise((resolve, reject) => setTimeout(() => {
        try { const level = pixhakuEngine(null).generateLevel(tag, seed); level ? resolve(level) : reject(new Error("no level")); }
        catch (err) { reject(err); }
      }, 30));
    }
    return new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      w.postMessage({ id, tag, seed });
    });
  }

  // reward picture: every piece of the solution as a soft tile in the game's palette
  const TINTS = ["#e7cf92", "#c9d59a", "#e9b98f", "#d9c3a0", "#b9cfa8", "#efd9a6", "#dfae8c", "#c5c08c", "#f1e2b8", "#d6b98a"];
  function mosaic(level) {
    const S = 48, canvas = document.createElement("canvas");
    canvas.width = level.cols * S; canvas.height = level.rows * S;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#51432f"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const owner = Array.from({ length: level.rows }, () => Array(level.cols).fill(-1));
    level.solution.forEach(([r0, c0, r1, c1], k) => { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) owner[r][c] = k; });
    const color = [];
    level.solution.forEach(([r0, c0, r1, c1], k) => {
      const near = new Set();
      for (let r = r0 - 1; r <= r1 + 1; r++) for (let c = c0 - 1; c <= c1 + 1; c++) {
        if (r >= 0 && c >= 0 && r < level.rows && c < level.cols && owner[r][c] !== k && owner[r][c] >= 0 && owner[r][c] < k) near.add(color[owner[r][c]]);
      }
      let i = k % TINTS.length;
      while (near.has(i)) i = (i + 1) % TINTS.length;
      color[k] = i;
      const x = c0 * S + 3, y = r0 * S + 3, w = (c1 - c0 + 1) * S - 6, h = (r1 - r0 + 1) * S - 6;
      ctx.fillStyle = TINTS[i]; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "#ffffff40"; ctx.fillRect(x, y, w, 4); ctx.fillRect(x, y, 4, h);
      ctx.fillStyle = "#0000001f"; ctx.fillRect(x, y + h - 4, w, 4); ctx.fillRect(x + w - 4, y, 4, h);
    });
    return canvas.toDataURL("image/png");
  }

  window.PixhakuGen = { generate, mosaic, tags: Object.keys(${JSON.stringify(INGAME)}) };
})();
`;
  fs.writeFileSync(path.join(ROOT, "generator.js"), js);
}

// ---------- main ----------
function main() {
  const search = process.argv.includes("--search");
  const models = PACK.map((L) => buildLevel(L, { search }));
  for (const m of models) { m.difficulty = difficultyOf(m.a.effort); m.tag = tagOf(m.difficulty); }
  const statics = staticLevels();
  // stable sort: equal scores keep the prototype first, then pack order
  const order = [...statics, ...models].map((m, i) => ({ m, i })).sort((x, y) => x.m.difficulty - y.m.difficulty || x.i - y.i).map(({ m }) => m);
  order.forEach((m, i) => { m.L.no = i + 1; });
  const pack = order.filter((m) => !m.static);
  fs.mkdirSync(path.join(ROOT, DRAFT_DIR), { recursive: true });
  for (const m of pack) writeDraftPNG(m, path.join(ROOT, draftFile(m.L)));
  writeData(pack);
  writePage(pack, order);
  updatePrototype(pack, statics);
  writeGenerator();
  for (const m of order) {
    const t = m.a.techCounts;
    const where = m.static ? "prototipte sabit" : `${m.layout.cols}x${m.layout.rows} ${String(m.layout.zones.length).padStart(2)} parça`;
    console.log(`Level ${String(m.L.no).padStart(2)}  ${m.tag.padEnd(6)} ${String(m.difficulty).padStart(3)}  ${where.padEnd(17)} belli %${String(Math.round(m.a.t1Frac * 100)).padStart(3)}  karar ${String(m.a.decisions).padStart(2)}  T1-T4 ${t[1]}/${t[2]}/${t[3]}/${t[4]}  ${m.L.tr}`);
  }
  console.log(`\n→ ${PAGE}, ${DATA}, ${DRAFT_DIR}/ (${pack.length} PNG)`);
}

main();
