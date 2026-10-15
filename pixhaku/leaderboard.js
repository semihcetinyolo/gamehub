// Pixhaku leaderboard and player profile.
// A port of Meowdoku's "Rank Activity" season (game_apk/meowdoku/meowdoku-leaderboard-gdd.html):
// a rolling 24-hour season against 49 local bots, stars = hearts left on each win, the
// level-end climb page, and chest rewards for the top 3. Everything runs on the device.
//
// Loaded after the game script, because it reads the game's globals (lives, level, completed,
// activeScreen, finishedLevels, hintLeft…), and before admin.js. The game calls
// PixhakuLB.levelWon / beforeWinScreen / onNext / onHome / refresh at its hook points.
// Pictures come from leaderboard_art.js (tools/build_lb_art.py). Any picture missing there is
// drawn in code, so the feature works before the art exists.
(() => {
  "use strict";

  // ---- config: the GDD's generic values; Pixhaku-specific changes are commented ----
  const CFG = {
    season: { durationSec: 86400, unlockLevel: 11, reopenWins: 10 },
    board: { botCount: 49, minScoringBotsAtStart: 5 },
    difficulty: {
      floor: 32, ceiling: 230,
      alphaByPrevRank: [[1, 0.08], [10, 0.03], [30, -0.10], [50, -0.20]],
      stepValues: [1, 2, 3], stepWeights: [0.2, 0.3, 0.5],
      buckets: [[30, 2], [60, 1], [120, 1], [240, 1], [1320, 5], [1440, 1]], // [end minute, weight]
      firstHourSteps: 2, cooldownMin: 3,
    },
    companions: { max: 10, slotDiv: 25, capOffset: -2, perMinute: 1.5 },
    identity: {
      guestIdShare: 0.59, frames: 6,
      badgeBuckets: [[1, 4, 50], [5, 14, 30], [15, 29, 15], [30, 49, 4], [50, 99, 1]],
      tierThresholds: [1, 5, 15, 30, 50],
      epoch: "2026-10-01", // Pixhaku's "global season" day 0 (Meowdoku: 16 July 2026)
    },
    online: { windowSec: 180, neighborRange: 2 },
    likes: { replyChancePct: 35, proactiveChancePct: 5, maxNewPerWin: 5, maxTotal: 49, botSelfLike: [[3, 20, 3], [15, 10, 2], [50, 5, 2]] },
    barrage: { lanes: 3, gapSec: [1, 3], crossSec: 8, aggregateAbove: 3 },
    // Pixhaku has one booster, so hints stand in for Meowdoku's Locate + Hint
    rewards: { 1: { frame: true, hints: 4 }, 2: { hints: 2 }, 3: { hints: 1 } },
    watchdogSec: 15,
  };
  const AVATARS = 9;
  const ROW_H = 62; // climb page row step (56 row + 6 gap)

  // ---- small helpers ----
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const svgUrl = (svg) => `data:image/svg+xml,${encodeURIComponent(svg)}`;
  const html = (markup) => { const t = document.createElement("template"); t.innerHTML = markup.trim(); return t.content.firstElementChild; };
  const online = () => navigator.onLine !== false;
  const reduced = () => typeof motionPreference !== "undefined" && motionPreference.matches;
  const buzz = (ms) => { try { navigator.vibrate?.(ms); } catch (_) { /* no haptics */ } };
  function weighted(values, weights) {
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < values.length; i += 1) { r -= weights[i]; if (r < 0) return values[i]; }
    return values[values.length - 1];
  }
  function shuffle(list) {
    for (let i = list.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
    return list;
  }
  const ease = {
    linear: (p) => p,
    sineInOut: (p) => -(Math.cos(Math.PI * p) - 1) / 2,
    quadOut: (p) => 1 - (1 - p) * (1 - p),
    quadIn: (p) => p * p,
    cubicOut: (p) => 1 - Math.pow(1 - p, 3),
  };
  function tween(ms, step, fn = ease.linear) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      const frame = (now) => {
        const p = Math.min(1, (now - t0) / ms);
        step(fn(p));
        if (p < 1) requestAnimationFrame(frame); else resolve();
      };
      requestAnimationFrame(frame);
    });
  }
  const hms = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, "0")).join(":");
  };
  function ago(ms) {
    const m = Math.max(1, Math.floor(ms / 60000));
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    return h < 24 ? `${h}h ${m % 60}m ago` : `${Math.floor(h / 24)}d ${h % 24}h ago`;
  }
  const ordinal = (n) => ["1st", "2nd", "3rd"][n - 1] || `${n}th`;

  // ---- sounds and pictures ----
  const play = (...args) => { if (typeof tone === "function") tone(...args); };
  const sfx = {
    collect: (i) => play(660 * Math.pow(2, [0, 4, 7, 12][i % 4] / 12), 0.16, "triangle", 0.07),
    count: () => [0, 1, 2, 3, 4, 5].forEach((i) => play(880 + i * 70, 0.05, "square", 0.022, 0.8 + i * 0.1)),
    rise: () => play(330, 0.55, "triangle", 0.05, 0, 880),
    drop: () => { play(150, 0.18, "square", 0.07, 0, 70); play(988, 0.22, "triangle", 0.06, 0.05); },
    box: () => play(196, 0.3, "triangle", 0.08, 0, 392),
    open: () => [523, 659, 784, 1047, 1319].forEach((n, i) => play(n, 0.2, "triangle", 0.07, i * 0.07)),
    popup: () => play(740, 0.08, "triangle", 0.05),
    like: () => play(1175, 0.08, "sine", 0.06),
  };

  const ART = window.PIXHAKU_LB_ART || {};
  const STAR = svgUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges"><path fill="#906437" d="M6 0h4v4h6v4h-4v4h2v4h-4v-2H6v2H2v-4h2V8H0V4h6z"/><path fill="#e8b951" d="M7 2h2v4h5v1h-4v5h1v1H9v-1H7v1H5v-1h1V7H2V6h5z"/><rect x="7" y="4" width="2" height="4" fill="#fff0a2"/></svg>');
  const HEART = svgUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges"><path fill="#743b32" d="M2 1h4v2h4V1h4v2h2v7h-2v2h-2v2h-2v2H6v-2H4v-2H2v-2H0V3h2z"/><path fill="#cd6550" d="M2 3h4v2h4V3h4v6h-2v2h-2v2H6v-2H4V9H2z"/><rect x="3" y="3" width="2" height="2" fill="#f3af78"/><rect x="2" y="5" width="2" height="2" fill="#f3af78"/></svg>');
  const HEART_EMPTY = svgUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges"><path fill="#9b8057" d="M2 1h4v2h4V1h4v2h2v7h-2v2h-2v2h-2v2H6v-2H4v-2H2v-2H0V3h2z"/><path fill="#f1e2ba" d="M2 3h4v2h4V3h4v6h-2v2h-2v2H6v-2H4V9H2z"/></svg>');
  const TROPHY = svgUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges"><path fill="#6e4e1e" d="M3 0h10v2h3v5h-1v1h-2v1h-2v2H9v2h3v3H4v-3h3v-2H5V9H3V8H1V7H0V2h3z"/><path fill="#e8b951" d="M4 1h8v6h-1v1h-1v1H6V8H5V7H4z"/><path fill="#c59440" d="M1 3h2v3H2V5H1zM13 3h2v2h-1v1h-1zM6 9h4v1H9v3H7v-3H6z"/><rect x="5" y="2" width="2" height="4" fill="#fff0a2"/><rect x="5" y="14" width="6" height="1" fill="#b48657"/></svg>');
  const CROWN = svgUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 8" shape-rendering="crispEdges"><path fill="#6e4e1e" d="M0 1h2v1h1V0h2v1h2V0h2v2h1V1h2v7H0z"/><path fill="#f0c94f" d="M1 2h1v2h2V1h1v2h2V1h1v3h2V2h1v5H1z"/><rect x="5" y="5" width="2" height="1" fill="#cd6550"/></svg>');
  const CLOCK = svgUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" shape-rendering="crispEdges"><path fill="#6c5535" d="M3 0h6v1h1v1h1v1h1v6h-1v1h-1v1H9v1H3v-1H2v-1H1V9H0V3h1V2h1V1h1z"/><path fill="#fff3d3" d="M3 1h6v1h1v1h1v6h-1v1H9v1H3v-1H2V9H1V3h1V2h1z"/><path fill="#6c5535" d="M5 3h2v3h2v2H5z"/></svg>');
  const WIFI_OFF = svgUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges"><path fill="#fff4d4" d="M4 3h8v1h2v1h2v2h-2V6h-2V5H4v1H2v1H0V5h2V4h2zM5 8h6v1h1v2h-2v-1H6v1H4V9h1zM7 12h2v2H7z"/><path fill="#b64c4c" d="M1 1h2v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v2h-2v-1h-1v-1h-1v-1h-1v-1H9V9H8V8H7V7H6V6H5V5H4V4H3V3H2V2H1z"/></svg>');
  const PH_AVATAR = [
    ["#7fa35a", "#e2945a", "#f6dcb0"], ["#c9973f", "#8b603f", "#e8c79a"], ["#b66240", "#f2e6cc", "#ffffff"],
    ["#5f7f8f", "#c9c9c0", "#f1ede0"], ["#d9a441", "#6b4a1f", "#d8b27a"], ["#8a9b55", "#f0c94f", "#fff0a2"],
    ["#9c6b8a", "#e8b09a", "#fbe3d4"], ["#6f8a48", "#5b4630", "#c9a77a"], ["#c27a45", "#3f3a33", "#e9e2cf"],
  ];
  const phCache = new Map();
  // drawn stand-in for a missing avatar picture: a 16×16 pixel critter (pointy, round or long ears)
  function placeholderAvatar(i) {
    if (phCache.has(i)) return phCache.get(i);
    const small = document.createElement("canvas");
    small.width = small.height = 16;
    const g = small.getContext("2d");
    const [bg, fur, light] = PH_AVATAR[i % PH_AVATAR.length];
    const px = (x, y, w, h, color) => { g.fillStyle = color; g.fillRect(x, y, w, h); };
    px(0, 0, 16, 16, bg);
    if (i % 3 === 0) { px(3, 2, 2, 4, fur); px(11, 2, 2, 4, fur); px(2, 1, 1, 2, fur); px(13, 1, 1, 2, fur); }
    else if (i % 3 === 1) { px(2, 3, 4, 3, fur); px(10, 3, 4, 3, fur); px(3, 4, 2, 1, light); px(11, 4, 2, 1, light); }
    else { px(4, 0, 2, 6, fur); px(10, 0, 2, 6, fur); px(5, 1, 1, 4, light); px(10, 1, 1, 4, light); }
    px(3, 5, 10, 8, fur); px(2, 7, 12, 5, fur); px(4, 13, 8, 1, fur); px(1, 14, 14, 2, fur);
    px(5, 10, 6, 3, light);
    px(4, 8, 2, 2, "#2d251a"); px(10, 8, 2, 2, "#2d251a"); px(4, 8, 1, 1, "#fff4d4"); px(10, 8, 1, 1, "#fff4d4");
    px(7, 10, 2, 1, "#51432f"); px(7, 12, 2, 1, "#b66240");
    const big = document.createElement("canvas");
    big.width = big.height = 96;
    const G = big.getContext("2d");
    G.imageSmoothingEnabled = false;
    G.drawImage(small, 0, 0, 96, 96);
    const url = big.toDataURL();
    phCache.set(i, url);
    return url;
  }
  const avatarSrc = (i) => ART[`avatar-${i + 1}`] || placeholderAvatar(i);
  const CHEST_COLORS = { 1: ["#6e4e1e", "#e8b951", "#f0c94f", "#fff0a2", "#b66240"], 2: ["#4f4c45", "#b8b3a2", "#d8d4c6", "#f6f3ea", "#7f7a6d"], 3: ["#5b3a22", "#a8703f", "#c48a52", "#e3b07a", "#6e4e1e"] };
  function chestSrc(rank, open) {
    const key = `chest-${rank}${open ? "-open" : ""}`;
    if (ART[key]) return ART[key];
    const [edge, body, lid, light, band] = CHEST_COLORS[rank] || CHEST_COLORS[3];
    const lidY = open ? -3 : 4;
    return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -6 32 34" shape-rendering="crispEdges">
      ${open ? '<rect x="4" y="9" width="24" height="5" fill="#fff0a2"/>' : ""}
      <rect x="2" y="12" width="28" height="14" fill="${edge}"/><rect x="4" y="14" width="24" height="10" fill="${body}"/>
      <rect x="8" y="14" width="3" height="10" fill="${band}"/><rect x="21" y="14" width="3" height="10" fill="${band}"/>
      <rect x="2" y="${lidY}" width="28" height="9" fill="${edge}"/><rect x="4" y="${lidY + 2}" width="24" height="6" fill="${lid}"/>
      <rect x="4" y="${lidY + 2}" width="24" height="2" fill="${light}"/>
      <rect x="8" y="${lidY + 2}" width="3" height="6" fill="${band}"/><rect x="21" y="${lidY + 2}" width="3" height="6" fill="${band}"/>
      ${open ? "" : `<rect x="14" y="10" width="4" height="6" fill="${edge}"/><rect x="15" y="11" width="2" height="3" fill="${light}"/>`}
    </svg>`);
  }
  const medalHTML = (rank) => (ART[`medal-${rank}`]
    ? `<img class="lb-medal" src="${ART[`medal-${rank}`]}" alt="${rank}" draggable="false">`
    : `<span class="lb-medal ph m${rank}">${rank}</span>`);
  const rankHTML = (rank) => (rank <= 3 ? medalHTML(rank) : `<span class="lb-num">${rank}</span>`);
  const tierOf = (count) => CFG.identity.tierThresholds.filter((t) => count >= t).length;
  function avatarHTML(av, { fr = 0, champ = 0, size = "" } = {}) {
    const tier = tierOf(champ);
    const frame = tier && ART["champion-frame"] ? `<img class="lb-champ-img" src="${ART["champion-frame"]}" alt="" draggable="false">` : "";
    return `<span class="lb-av fr-${fr}${tier ? ` champ t${tier}` : ""}${size ? ` ${size}` : ""}"><img src="${avatarSrc(av)}" alt="" draggable="false">${frame}${champ ? `<b class="lb-badge">${champ}</b>` : ""}</span>`;
  }

  // ---- saved state ----
  const KEY = "pixhaku-leaderboard-v1";
  const PROFILE_KEY = "pixhaku-profile-v1";
  const SKEW_KEY = "pixhaku-leaderboard-skew"; // admin time warp
  const read = (key) => { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch (_) { return {}; } };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* no storage in file previews */ } };
  const blank = () => ({
    periodCount: 0, prev: { score: 0, rank: 0, awarded: false },
    state: "closed", // closed | open (not joined) | joined | settling
    startTs: 0, endTs: 0, joined: false, score: 0, scoreTs: 0,
    settled: false, finalRank: 0, rewardClaimed: false, winsSinceClose: 0, bestCheered: 0,
    likes: { given: {}, from: [] }, pool: null,
  });
  let S = Object.assign(blank(), read(KEY));
  const P = Object.assign({ name: "", avatar: 0, edited: false, firsts: 0, seconds: 0, thirds: 0 }, read(PROFILE_KEY));
  let skew = Number(read(SKEW_KEY).ms) || 0;
  const now = () => Date.now() + skew;
  const save = () => write(KEY, S);
  const saveProfile = () => write(PROFILE_KEY, P);
  // the default nickname is saved on first run so the player's row keeps one name
  if (!P.name) { P.name = `PLAYER${randInt(1000, 9999)}`; P.avatar = randInt(0, AVATARS - 1); saveProfile(); }

  // levels cleared + 1: the GDD's "current level" (custom puzzles count after the campaign)
  const playerLevel = () => [...finishedLevels].filter((n) => n < BUILTIN_LEVELS).length + (typeof customSolved === "number" ? customSolved : 0) + 1;

  // ---- bot engine (GDD #6) ----
  const NAMES = "ekoly|x_KRaL_TR|Bisco|civciv|10MilyonlukCocuk|Marsoyku|Amberviajero4|shark70|Alphidden|zvezdaCookie634|renard7|4Gryphonsevgi|KoshkaDagci|Soleilyildirim|Fioremystic14|1Lichtcay|luzDragon|cimen44Echo|Piesled|fogliaVert|weaver47|Data15|Grove31Machine|Yildirim88Candy|Moon579Hazel|noche67|603Brisefiore|isik8|Nova40Sparrow|chatEstrella|Alphakoshka326|osoOnda|retrovoid2|bandit|cay20|crowNeon84|Cometa99Electric|yagmursogno|List1|Vortexcamino|phoenix52|chatserene|retrovoid5|CrowAy|Tiger912Warden|Isik67Luce|lismystic|mete|374Mechtaviento|TinyOnda|Koala69Camino|Novabrisa69|pilot68|Kayra24|kar80Ruzgar|lasRanger|welleBosque|CoffeeGwiazda|LedNehir|Falconlis|hielodenizci|oro8|Gun415|Yildirim10Ninja|argent|Aydinfunke|Wrenorage13|Dream103|Medved4Rain|Cieloplasma79|ViejoMarble|Fuzzy62|Machinefiore|baerRayo|aquila107|263Hazeloso|vortex|Echo57|weaverWalker|funke79|Funkehacker9|panda07|caminoIron|Niedzwiedz48|Nube90Medved|Lale74|21Crimsonestrella|roseDragon06|cielocarbon|Retromarble|sol774Light|hidden|ormanestrella|Baharorman|forgeAigle|hojaLis|SwiatloMystic|chatfleur|dataNehir37|Viajero23|Aydindolphin|cookie335|gecehielo|81Volnasahin|artsyAlp96|304Tilkibrise|rangerzorro|etoileMechta33|marbleLisc|hielo|raven43|synthMachine35|fogliaLuz4|Soleilcastle796|luzmavi|nubeLune|kediTutku30|cay904|Fleur11Yildirim|Kot10|Tiny80|Panda20|kaplanvert|Ruzgartraum|sneg45Tigre|Kar4|Carbon57|Bearsailor6|glitch1Sahin|bulutLupo|oroninja|Vientohielo10|quantumogien|DataSailor|cielo11|shadow0Rzeka|hielo140Loup|etoileGamer8|shark|Tigr9Synth|EisSogno|ocean25Renard|Comet0Niedzwiedz|Sloncelisc74|Metesahin47|yildirim726|Quantumdruid|glitch64|meteCane|castle99|rouge|dusBear|yildizkedi|12Ksiezycwren|Midnightmarti114|Perro67Slonce|Isik537Gun|ormanTiny|dusege|binary22|luna09|cane171Wolf|kayra385|jaguarbot|Carbon1|viejoKedi|Volk3Serene|Aigle28|Nacht1|veilHidden856|Koala43Tygrys|Tiger57Mechta|volpe22|Vaguelumiere645|luce33|Chispa7|8Ormanchat|Moon60|hojacimen|98Lumierealpha|caminoKedi|72Pantherwizard|castlewander|VividPanther|runnerlight|5Loupwander|Deniz10|Raven44|Brise23Estrella|84Blazetuna|Horse84Ocean|mistnehir|cielo45Gamer|svet99|whiskerBaran|Tormenta70|rayoBosque14|Blaze4Bleu|fioresilent|las4Druid|Truenonehir|ombreSogno72|Volpeblatt|Led55|Bosque92|Glitchkurt|glitch3|swiatloisik|lazyLion87|SoleilDenizci|Ondastorm96|wald6|minty13Crow|kisGlanz20|59Luzmechta|211Dataforesta|whiskersole|Trueno78Data|toaster|aiglelune|mystic48|loup960Chat|harborGlitch92|lazyLeopard80|Lichtminty55|537Sonbaharloup|plata76Daisy|loup9|lisc1|flussOwl|DenizciOso|Dataogien29|lirik|CaneSvet|8Oyunwald|tuna15Nube|28Gwiazdabahar|Yildirim98Swiatlo|Ornuevo|fiore68|Rainblatt|keyboard6|ogienswiatlo|stern61|nova|SevgiArgent|eagleZen03|Glitchluz96|lobo|Wren32|azul55|26Chatleopard|fleurNinja|kurt|Neural2Camino|rouge1|aslan71|velvet1|volna17Trueno|30Amberlisc|Mintlicht95|zihinvortex|falconForet836|whisker|aigle55Akdeniz|velvet0|88Egewander|Waldlis65|303Synthglitch|koshkaRayo37|Aslan0Orel|SyntaxSevgi|Mint0Bulut|fleur88|soleilCoffee|piesHorse73|etoileKartal525|MartiCrow|75Novaorage|binary|plataorel|Alpnoche|Frostturtle37|retro78Eis|Baer98Snieg|Viejopies|Hoja25Hidden|tiny89|46Midnightruya|lynx|Carbondus6|frost25|viejoCosmic|Bot638Castle|Orel20|630Cometrio|aquila18Gryphon|Caypilot|Soleelectric|aydin91Echo|tormentaComet5|Argent17|tigreKsiezyc220|moon81|Leaf2|electricSueno|Egeluce|WizardFala|Sognoorman962|candyCoffee28|ogien6Sueno|Orel28|fuzzy958|Tigre44Sunny|Gelincik54Ogon|Moon6|foret9|zenfirefly|isikkus|Lynxbot36|ruya12|Welle66Soleil|lis370|marsunny|kartal5|brisa76Flor|ghiacciotoaster|Serenehunter|cometNebel|BrisaFleur|plataWizard|drift82Blaze|nebelNacht|Lucewizard|renardWander|orel88Sleepy|luzViejo|vivid45Carbon|43Crimsonhacker|tutkufunke|Oyunshark33|Vortextygrys27|gece00|fiumeCastle72|Traumay|dagci685Onda|Bloomdus410|fox89|bahar|Chientiger|lisctormenta|Deniz227Astro|halcon51|zorrosilent|iskraSilent14|Wellevague|ForestaKis|lodvortex|RuyaForge|Yagmur591|SparrowUmut|panda50Brise|grove|78Ayluce|kus97|zihinForesta|Camino7|Runnerreka|Perromete|Badger11Light|35Rayotigr|Fuocozihin516|Eule9|6Hielogrove|echo7|cay279|veil790|volpe8Keeper|gattoBloom3|raven7|Ogonfirefly243|lazydus|NubeChat|chienLicht|sole367|Gokyuzu9|shadow38|feuer59|toasterCielo|MechtaAzul|eisLynx|Quantumsueno|dragonFuego|17Viejolazy|leopard74|runnerGelincik6|Orelrio|Rainombre9|Tigrforge|rzeka63Denizci|leopardgwiazda|KurtWilk|GhiaccioNoc|Velvetblume|tilki|foxMedved8|sniegMarti20|Owl1|Orman82Ruse|Viejo642Gelincik|Grove67|Roseluce|tigreSwiatlo42|coffeeBosque29|dagci1|horseWizard|fleur5|42Goldenorman|viajero06|tigr29|Oceanmechta42|estrellaGlitch4|zorrolod|rune4|whale4|orman34|68Nuevonoch|Mist06Data|marzenie81|ruya|0Chispasueno|bandit5|Ruzgar7Renard|neveNova15|mist7|Frozen18|Foglianote|Ocean46|trueno17|Warden3|sonbahareule|gelinciklist|Orsonotte|Whisker0Finch|ironCrimson|Eisrzeka96|fuchsWalker47|CaneOrman|neige19|alpha95|677Sniegtilki|cosmic78|tormenta72Nova|Chispakayra|Neuralmavi|neuralorel|Lazy0|Oyun43|Crimson39|Blatt83Alp|Nevemystic20|tormenta2Adler|tigerMystic26|Nocege|loup281Pfad|kurtMedved5|Light43Neural|Trueno00|hazelyaz|Tigr3Frozen|druid21|Baran32Neve|Wardenrayo76|rain26Rider|wandervolk|verdewren|ledbrook|Crimson01Sunny|renard4|yastre6|AyEge|Viajeroestrella|velvetor|zen64|Swiatlohielo213|firefly604|adlerblaze|Jaguarrouge|comet|yastreForesta11|Lod7|sharkDolphin|95Eisslonce|akdenizOurs|loboHarbor95|Kot0Kayra|Mondfuzzy|volpe894Plata|Fuchs17|novaOso|sniegBloom|FinchToaster|Sniegwalker8|cosmic|BinaryDenizci|Chispahalcon64|iskra|Luna772Gun|sleepy20Noche|reka29|tunaFiume|Brise41|sari74Daisy|Grove30|volpe58Firefly|Mavininja|Sahin97Volna|rojo2|starlitRetro|toaster169|Gwiazda51|WalkerFrozen|piesLas07|NovaHidden|oursMechta|sole7|gokyuzuStorm68|ormanSahin44|Hazel3Aguila|Notte67|lazyZihin573|rzeka|Lune69|Veilsilent|Snegfiore14|Aydinblatt|argentSol054|Cat9|mondLed|ShadowMarti|72Sloncezorro|Vivid7|TunaPath|30Pilotstorm|RavenNehir|wolffeuer|ninjaSonbahar15|65Vaguedeniz|Bahar1Niedzwiedz|ege|Stormgokyuzu|renard7Nebel|0Hielobrook|lasEstrella95|Ruyadenizci|orbitalMechta|viejo87|Neve8Sol|luneIskra|Vert86Panther|lisogon|coffee54Swiatlo|tuna967|fiume23|slonce90Pfad|Mechta9Wren|Mintylumiere2|perro715Ocean|93Owlamber|45Walddruid|wolf155|turtleSerene|Deepsealion|Sloncerayo1|lobo718Velvet|Tigr97Harbor|Hielotigr1|ombre|slonce91|lis|pantherTutku|Deepsea38|Mar36|98Chispakayra|Sonbahardenizci|Soleilstella55|blaze16|MoonCastle|fuzzyGamer|59Fiorealp|cayNacht|Neural513|coffee7Licht|28Kaplandus|veil26|jaguar77|1Karnote|cookie95|kus4|Baran67|Cometa746Pixel|Keyboard458Binary|leopardComet|Lazy51Kot|Candy462Ours|9Lisviajero|neveSahin73|drift09Bear|GoldenOyun|BanditData|Amberkar47|yaz75|kuscomet|Niedzwiedz08Aguila|coffeeFleur|ilkbaharRuse72|SereneGwiazda|wren51|9Marzeniehielo|martiLight|led26Bleu|346Vividwizard|rain14Toaster|gattoSlonce|13Gokyuzuviajero|pixelCookie785|leafWald|14Kotsneg|yastre35|cane5|shadow|90Umutor|633Plasmasueno|Weaver66Tiger|Velvet63|ay26|eule3|Ogonnehir|7Rainrojo|Tiger02Druid|frostFuchs41|cimen61|ogien|sternOyun847|Plasmacimen|badgerviajero|bear|horseGokyuzu46|riviere063|gatoDream|Isikwald|LunaDolphin|rangerMarti7|crow|Rojokayra71|sari91Azul|leaf62|finchLoup|KusDragon|Viejo35|Botkayra7|Denizcidaisy|dusIron|bot0|Kayraakdeniz3|Denizci20Tiny|Lion097|sunny|echo40|FleurCielo|hiddenRetrovoid5|Aiglecoffee77|Etoilepes|Veil8Zihin|Rzeka811|whale671|Brisa4Halcon|viejoJaguar|umut5|mechtaPanda|bosque41|tigre71Path|Badger3Snieg|synth23Bandit|catisik|plasma|bot|Plasmaeis9|Egetigre|lumiere36|52Foretkoala|hieloPies98|54Ayniedzwiedz|gattoDragon942|68Coffeewilk|Wolf6Bosque|Carbonviento|Ombre7Licht|01Retrovoidorzel|nochninja|Frozen67|Niedzwiedzglanz3|Cielomarble|BaerList|4Renardrouge|piesForesta|bleu492|cosmicmint|stern15Camino|Volna59|Firefly67|CometPes|71Sereneaquila|swiatlo99|CrimsonOcean|horse|Aychien|Orminty641|ruya13|ruse3|syntax62|Sunnycomet|zvezda29|quantum31|sharkEtoile|OceanSyntax|Sleepyzvezda29|denizci92Orso|Lion39Blaze|Blaze21|flor7Bulut|mavi8Nube|brook61|fleurBot01|pilot|tigre954|CometOrzel|Tinysol53|cosmic989|lod57|lasRenard|2Hazeloyun|kis16Mystic|Bandit61|51Binaryeagle|kot93Sevgi|Sneg10Etoile|swiatlo54|Panther12|perro49Nova|Yildirim50Fiume|catLoup31|marzenie|note60Candy|lynxOyun29|alpDenizci326|Cimen02|plataSerene375|mar939|pixel67|iron45|yastre82Bloom|moon|Riviereforge717|neigetoaster|bleu|Tutkuay|Cometa51Sogno|Yildiz85Cane|PesBloom|bear8|Ours522|mond93|Fox10|minty7Ocean|tuna53Comet|tilkiRojo05|electric|firefly3|finchruya|led60|Soleilnova|synth|deepsea165Firefly|retrovoid67|iron81|Mintykis96|echo88|baran|Lionorso|31Rzekasunny|RavenCarbon|foresta67|Moonhoja|Toasterpath76|brisa03|Ogiennote6|wander60Serene|ocean|neve52|riofala|frozenrunner|99Catlobo|aiglemete|stern90|Veil92|neve32|path47|Marti316Kartal|falconAquila5|MarEge|Hawklisc|9Glitchbear|Otterruzgar|eule41Soleil|Kedi38|oroMete|dagciViento|Chispajaguar452|Tinypfad32|74Eagleblume|nebel81|stella|nuevo3|Cosmichoja|ksiezyc69Zorro|nottenoc|leafOrzel78|fiume87|Velvet64Machine|ruseKaplan53|kotRain28|hazelNote5|LeopardTiny|brisaVerde5|lucemarzenie|Aguila4|Starlitblatt|rougeLion509|sunny950Kayra|osocane|Fireflypes09|riviereaquila|Cimen28|Yildirim31|denizci848Trueno|ogonOrso62|52Kedinube|Grovefox|Wilkestrella0|candysyntax|finchJaguar68|fireflylumiere|wolfruya|Cometafuzzy42|Cimenhazel|sariVerde467|orsoKus|Synth51|Castlewander|mete2|alp99|Foretplasma4|LazyWalker|frost6Sparrow|ay2Sleepy|GattoArgent|florAzul87|38Daisytygrys|shadowglitch|Lynx3Iskra|bot408|nocdenizci|trueno|Castlefuchs477|kot89|Mechta32|mist40Retrovoid|sol|Note27Ilkbahar|OrelVortex|novaMist|70Ombrekis|Ilkbahar01Sogno|Neveviejo|Hawkazul0|Nuevo8|wizard79|umut136|lobo94|Forestalune|gun74|OrmanHarbor|Lale42Tutku|8Seekerstarlit|orman59|Soleilserene406|Ksiezyctiger48|70Orageecho|gryphonVortex|crimsonEtoile94|Lynx9Keyboard|onda|lazyPes|250Rangerdolphin|echo|midnightLumiere|RetrovoidMond|VolpeArtsy|Les30Retrovoid|Pathwolf|NoteHarbor|halcon96Finch|DenizciTiger|Neon656Foret|98Lodgato|nehir19|RunnerMarble|keeper7|artsySunny|luz65Echo|Kedigokyuzu88|BosqueHawk|medvedfeuer|Oyungolden56|ilkbahar002|daisy37|phoenixfrost|yildiz58|koala1|Mete80|Ogienyildiz291|32Stellarose|vividWarden11|kaplan837|Rosesahin117|drift60|Tigr46|FoxChien|isik42Foret|pathVolna|mist450|Yildiz32Ocean|Ogien8Falcon|SunnyNoc|neige|retroCrow|Neve90|hielo56|Lupo37|Kartallod34|Pes66Gamer|TygrysTurtle|ogon|Luce565Yagmur|Lesocean|Harbor1|Lynx857|sleepypilot|OrbitalSogno|fox67|fala|Nochmavi15|castleAslan|viento|marzenieWilk|GoldenTilki|3Lightiron|Plata1|crowlynx|leopardWeaver|Gryphonzorro|KeeperChat|Flussbaran42|Zihinlynx|orel2|foglia217|Gece69|pandaMete164|mond98|yaz|nehirWizard74|58Kayragece|Blumeneve18|LodLis|zvezda|Lobo64|briseHazel|denizcirune|Zvezdacat43|svetPath|deniz|zihinWilk8|Swiatlotygrys37|wander8|ksiezycNoch34|Phoenix0Sparrow|whale73Dream|traum|Caminocielo|Sevgidaisy96|FleurBlume|KoalaOtter|aigle35|orso40Sueno|orsoBandit|Bearrenard63".split("|");
  const guestId = () => Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789"[randInt(0, 33)]).join("");
  function botName(used) {
    for (let tries = 0; ; tries += 1) {
      const name = Math.random() < CFG.identity.guestIdShare ? guestId() : pick(NAMES);
      if (!used.has(name) || tries > 50) { used.add(name); return name; }
    }
  }
  function timelineMinutes(n) {
    const { buckets, cooldownMin: cd, firstHourSteps } = CFG.difficulty;
    const mins = [];
    for (let k = 0; k < n; k += 1) {
      if (k < firstHourSteps) { mins.push(rand(0, 60)); continue; }
      const j = weighted(buckets.map((_, x) => x), buckets.map((b) => b[1]));
      mins.push(rand(j ? buckets[j - 1][0] : 0, buckets[j][0]));
    }
    mins.sort((a, b) => a - b);
    for (let k = 1; k < n; k += 1) mins[k] = Math.max(mins[k], mins[k - 1] + cd);
    let cap = 1439;
    for (let k = n - 1; k >= 0 && mins[k] > cap; k -= 1) { mins[k] = cap; cap -= cd; }
    return mins.map((m) => Math.max(0, Math.floor(m)));
  }
  function badgeCount() {
    const g = Math.max(1, Math.floor((now() - Date.parse(CFG.identity.epoch)) / 864e5));
    const b = CFG.identity.badgeBuckets.map((x) => [...x]);
    if (g < 50) { b[3][2] += b[4][2]; b[4][2] = 0; }
    if (g < 30) { b[2][2] += b[3][2]; b[3][2] = 0; }
    const j = weighted(b.map((_, x) => x), b.map((x) => x[2]));
    return randInt(b[j][0], j === 4 ? Math.min(99, Math.max(b[j][0], g)) : b[j][1]);
  }
  function makePool(B, start, end) {
    const D = CFG.difficulty;
    const used = new Set([P.name]);
    const bots = [];
    for (let i = 0; i < CFG.board.botCount; i += 1) {
      const final = 1 + Math.round(B * Math.random());
      const steps = [];
      for (let r = final; r > 0;) { const v = r >= 3 ? weighted(D.stepValues, D.stepWeights) : r; steps.push(v); r -= v; }
      shuffle(steps);
      const mins = timelineMinutes(steps.length);
      if (i < CFG.board.minScoringBotsAtStart) mins[0] = 0; // the board never opens empty
      bots.push({
        id: i, name: botName(used), av: randInt(0, AVATARS - 1), fr: randInt(0, CFG.identity.frames - 1),
        final, champ: 0, likes: 0, active: 0, comp: false,
        tl: steps.map((d, k) => [Math.round(start + (mins[k] / 1440) * (end - start)), d]),
      });
    }
    const n = randInt(1, 3);
    const champs = new Set([...bots].sort((a, b) => b.final - a.final).slice(0, n));
    while (champs.size < n + n + 2) champs.add(pick(bots));
    champs.forEach((b) => { b.champ = badgeCount(); });
    return { B, seen: start, stalk: false, bots };
  }
  const scoreAt = (b, t) => b.tl.reduce((s, [ts, d]) => (ts <= t ? s + d : s), 0);
  const lastAt = (b, t) => b.tl.reduce((l, [ts]) => (ts <= t && ts > l ? ts : l), 0);
  const nextAt = (b, t) => b.tl.reduce((n, [ts]) => (ts > t && ts < n ? ts : n), Infinity);
  // the board's clock: stops at the season end and never runs backwards
  function T() {
    const p = S.pool;
    let t = Math.min(now(), S.endTs);
    if (!p) return t;
    if (t < p.seen) t = p.seen;
    p.seen = t;
    return t;
  }
  function standings(t = T(), score = S.score, at = S.scoreTs) {
    if (!S.pool) return [];
    const rows = S.pool.bots.map((b) => ({ id: String(b.id), bot: b, score: scoreAt(b, t), at: lastAt(b, t) })).filter((r) => r.score > 0);
    if (S.joined) rows.push({ id: "me", me: true, score, at: score > 0 ? at : Infinity });
    rows.sort((a, b) => b.score - a.score || a.at - b.at);
    rows.forEach((r, i) => { r.rank = i + 1; });
    return rows;
  }
  const myRank = (rows = standings()) => rows.find((r) => r.me)?.rank || 0;
  // GDD "companions": once the player passes the water level B, the bots stop and a few
  // of them trail the player, never closer than player − 2
  function onPlayerScore(t) {
    const p = S.pool;
    const C = CFG.companions;
    if (!p.stalk && S.score > p.B) {
      p.stalk = true;
      p.bots.forEach((b) => { b.tl = b.tl.filter(([ts]) => ts <= t); });
    }
    if (!p.stalk) return;
    const K = Math.min(C.max, Math.floor((CFG.difficulty.ceiling - S.score) / C.slotDiv));
    if (K <= 0) return;
    p.bots.map((b) => ({ b, s: scoreAt(b, t) })).sort((x, y) => y.s - x.s).slice(0, K).forEach(({ b, s }) => {
      const dt = (t - lastAt(b, t)) / 60000;
      const maxAdd = Math.max(0, Math.min(S.score - s + C.capOffset, dt * C.perMinute));
      let add = 0;
      for (;;) { const v = randInt(1, 3); if (add + v > maxAdd) break; add += v; }
      if (add > 0) {
        b.tl.push([Math.min(S.endTs, S.scoreTs + randInt(5, 30) * 1000), add]);
        b.comp = true;
      }
    });
  }
  function presence(b, t) {
    const w = CFG.online.windowSec * 1000;
    if (b.comp || nextAt(b, t) - t <= w || (b.active && t - b.active < w)) return { on: true, text: "Playing now" };
    return { on: false, text: ago(t - Math.max(lastAt(b, t), b.active || 0)) };
  }
  // someone near the player always looks online
  function ensureNeighbor(rows, t) {
    const i = rows.findIndex((r) => r.me);
    if (i < 0) return;
    const range = CFG.online.neighborRange;
    const near = rows.slice(Math.max(0, i - range), i + range + 1).filter((r) => !r.me);
    if (!near.length || near.some((r) => presence(r.bot, t).on)) return;
    near[0].bot.active = t;
    save();
  }

  // ---- season lifecycle (GDD #4) ----
  let newSession = true; // consumed by the first open check after launch
  let graceLevel = null; // the level being played when the season ran out
  const inLevel = () => activeScreen === "game" && !completed;
  const rewardPending = () => S.state === "settling" && S.settled && !S.rewardClaimed && S.finalRank >= 1 && S.finalRank <= 3;
  function shouldOpen(atHome) {
    const fresh = newSession;
    newSession = false;
    if (S.state !== "closed") return false;
    if (S.periodCount === 0) return playerLevel() >= CFG.season.unlockLevel;
    if (S.prev.awarded) return atHome || S.winsSinceClose >= CFG.season.reopenWins;
    return S.winsSinceClose >= CFG.season.reopenWins || fresh;
  }
  function openSeason() {
    const D = CFG.difficulty;
    const { score, rank } = S.prev;
    const alpha = (D.alphaByPrevRank.find(([max]) => rank <= max) || D.alphaByPrevRank[D.alphaByPrevRank.length - 1])[1];
    const B = S.periodCount === 0 || !rank ? D.floor : clamp(Math.floor(score * (1 + alpha)), D.floor, D.ceiling);
    const start = now();
    const end = start + CFG.season.durationSec * 1000;
    Object.assign(S, {
      state: "open", startTs: start, endTs: end, joined: false, score: 0, scoreTs: 0, settled: false,
      finalRank: 0, rewardClaimed: false, winsSinceClose: 0, bestCheered: 0, likes: { given: {}, from: [] },
      pool: makePool(B, start, end),
    });
    S.periodCount += 1;
    save();
    refresh();
  }
  const maybeOpen = (atHome) => { if (!shouldOpen(atHome)) return false; openSeason(); return true; };
  function join() {
    if (S.state !== "open") return;
    S.state = "joined";
    S.joined = true;
    save();
    refresh();
  }
  function fold() {
    S.state = "closed";
    S.pool = null;
    S.winsSinceClose = 0;
    save();
    refresh();
  }
  // final rank and reward; offline the season just closes and its result is lost
  function settle() {
    if (!online()) { fold(); return; }
    const rank = !S.joined ? 0 : S.score > 0 ? myRank() : CFG.board.botCount + 1;
    S.prev = { score: S.score, rank, awarded: rank >= 1 && rank <= 3 };
    S.state = "settling";
    S.settled = true;
    S.finalRank = rank;
    S.rewardClaimed = false;
    graceLevel = null;
    if (!S.prev.awarded) fold(); else { save(); refresh(); }
  }
  function check() {
    if ((S.state === "open" || S.state === "joined") && now() >= S.endTs) {
      if (S.state === "joined" && inLevel()) { S.state = "settling"; S.settled = false; graceLevel = assignments; save(); refresh(); }
      else settle();
    }
    // the grace ends when that level is left; a win settles in levelWon instead
    if (S.state === "settling" && !S.settled && !(inLevel() && assignments === graceLevel)) settle();
  }

  // ---- level win (GDD #5, #10) ----
  let pending = null;
  function levelWon() {
    pending = null;
    // the season ran out during this level: the win still counts, then the season settles
    if ((S.state === "open" || S.state === "joined") && now() >= S.endTs) {
      if (S.state === "joined") { S.state = "settling"; S.settled = false; } else settle();
    }
    if (S.state === "closed") { S.winsSinceClose += 1; save(); return; }
    const counting = S.joined && (S.state === "joined" || (S.state === "settling" && !S.settled));
    if (!counting) return;
    const pts = clamp(lives, 1, 3);
    const t = T();
    const before = standings(t);
    const oldScore = S.score;
    const oldRank = myRank(before);
    S.score += pts;
    S.scoreTs = now();
    onPlayerScore(t);
    const after = standings(t);
    const newRank = myRank(after);
    const likers = oldScore === 0 ? [] : botLikes(after);
    const info = { pts, oldScore, newScore: S.score, oldRank, newRank, before, after, likers, t, climb: online() };
    if (S.state === "settling") settle();
    save();
    info.flight = flight(info);
    pending = info;
  }
  function botLikes(rows) {
    const L = CFG.likes;
    const from = S.likes.from;
    const out = [];
    for (const r of shuffle(rows.filter((x) => !x.me))) {
      if (out.length >= L.maxNewPerWin || from.length >= L.maxTotal) break;
      if (from.includes(r.id)) continue;
      const chance = S.likes.given[r.id] ? L.replyChancePct : L.proactiveChancePct;
      if (Math.random() * 100 < chance) { from.push(r.id); out.push(r.bot); }
    }
    rows.forEach((r) => {
      if (r.me) return;
      const rule = L.botSelfLike.find(([max]) => r.rank <= max);
      if (rule && Math.random() * 100 < rule[1]) r.bot.likes += randInt(1, rule[2]);
    });
    return out;
  }

  // stars from the hearts left fly into a pill under the HUD (on the level screen)
  let pill = null;
  function ensurePill() {
    if (pill) return pill;
    const hud = $(".hud");
    pill = html(`<div class="lb-pill" aria-hidden="true"><img src="${STAR}" alt=""><b>0</b></div>`);
    hud.appendChild(pill);
    return pill;
  }
  function hidePill() { pill?.classList.remove("show"); }
  async function flight(info) {
    const p = ensurePill();
    const count = $("b", p);
    const icon = $("img", p);
    let shown = info.oldScore;
    count.textContent = String(shown);
    if (reduced()) { count.textContent = String(info.newScore); return; }
    await sleep(500);
    p.classList.add("show");
    await sleep(600);
    const hearts = $$("#livesValue span:not(.lost)").slice(-info.pts);
    const target = () => icon.getBoundingClientRect();
    const arrivals = [];
    for (let i = 0; i < info.pts; i += 1) {
      const heart = hearts[i] || $("#livesValue");
      const from = heart.getBoundingClientRect();
      sfx.collect(i);
      heart.animate?.([{ opacity: 1, transform: "scale(1)" }, { opacity: 0.15, transform: "scale(.6)" }], { duration: 250, fill: "forwards" });
      arrivals.push(comet(from, target()).then(() => {
        shown += 1;
        count.textContent = String(shown);
        const r = target();
        burst(document.body, r.left + r.width / 2, r.top + r.height / 2, 12, ["#ffe58a", "#fff4d4", "#e8b951"], 60, 500);
        if (i === 0) icon.animate([{ transform: "scale(1)" }, { transform: "scale(.5)" }, { transform: "scale(1)" }, { transform: "scale(.5)" }, { transform: "scale(1)" }, { transform: "scale(.5)" }, { transform: "scale(1)" }], { duration: 300 });
      }));
      await sleep(83);
    }
    await Promise.all(arrivals);
    count.textContent = String(info.newScore);
    await sleep(250);
  }
  // a star-headed comet on an arc: x and y run on different curves (GDD #10)
  function comet(from, to) {
    const x0 = from.left + from.width / 2, y0 = from.top + from.height / 2;
    const x1 = to.left + to.width / 2, y1 = to.top + to.height / 2;
    const parts = [0, 28, 56, 84].map((delay, k) => {
      const outer = html(`<div class="lb-comet${k ? " tail" : ""}" style="--k:${k}"><i></i></div>`);
      document.body.appendChild(outer);
      const inner = outer.firstElementChild;
      const opts = { duration: 400, delay, fill: "both" };
      outer.animate([{ transform: `translateX(${x0}px)` }, { transform: `translateX(${x1}px)` }], { ...opts, easing: "cubic-bezier(.125,0,.875,1)" });
      return inner.animate([{ transform: `translateY(${y0}px)` }, { transform: `translateY(${y1}px)` }], { ...opts, easing: "cubic-bezier(0,.141,.7,1)" }).finished.then(() => outer.remove());
    });
    return parts[0];
  }
  function burst(host, x, y, n, colors, dist, ms) {
    if (reduced()) return;
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2 + rand(-0.3, 0.3);
      const d = dist * rand(0.6, 1.2);
      const dot = html(`<i class="lb-px" style="background:${pick(colors)}"></i>`);
      host.appendChild(dot);
      dot.animate([
        { transform: `translate(${x}px,${y}px) scale(1)`, opacity: 1 },
        { transform: `translate(${x + Math.cos(a) * d}px,${y + Math.sin(a) * d}px) scale(.4)`, opacity: 0 },
      ], { duration: ms * rand(0.8, 1.2), easing: "cubic-bezier(.1,.8,.3,1)" }).finished.then(() => dot.remove());
    }
  }

  // ---- screens ----
  function screen(cls) {
    const el = html(`<div class="lb-screen ${cls}"><div class="lb-in"></div><div class="lb-fx"></div></div>`);
    document.body.appendChild(el);
    return el;
  }
  const who = (r) => (r.me ? { name: P.name, av: P.avatar, fr: 0, champ: P.firsts } : { name: r.bot.name, av: r.bot.av, fr: r.bot.fr, champ: r.bot.champ });
  const likeCount = (r) => (r.me ? S.likes.from.length + (S.likes.given.me ? 1 : 0) : r.bot.likes + (S.likes.given[r.id] ? 1 : 0));
  function rowHTML(r, t, { likes = false } = {}) {
    const w = who(r);
    const status = r.me ? { on: true, text: "Online now" } : presence(r.bot, t);
    const liked = Boolean(S.likes.given[r.id]);
    return `<div class="lb-row${r.me ? " me" : ""}" data-id="${r.id}">
      <span class="lb-rank" data-rank="${r.rank}">${rankHTML(r.rank)}</span>
      ${avatarHTML(w.av, w)}
      <span class="lb-who"><b>${esc(w.name)}</b><i class="${status.on ? "on" : ""}">${status.text}</i></span>
      <span class="lb-score"><img src="${STAR}" alt=""><b>${r.score}</b></span>
      ${likes ? `<button class="lb-like${liked ? " liked" : ""}" type="button" data-like="${r.id}" aria-label="Like ${esc(w.name)}"><img src="${liked ? HEART : HEART_EMPTY}" alt=""><em>${likeCount(r)}</em></button>` : ""}
    </div>`;
  }
  function seatHTML(r) {
    if (!r) return '<div class="lb-seat empty"></div>';
    const w = who(r);
    return `<div class="lb-seat${r.me ? " me" : ""}" data-id="${r.id}">${avatarHTML(w.av, { ...w, size: "lg" })}<b class="lb-pname">${esc(w.name)}</b><span class="lb-score sm"><img src="${STAR}" alt=""><b>${r.score}</b></span></div>`;
  }
  function podiumHTML(rows, { chests = false } = {}) {
    return `<div class="lb-podium">${[2, 1, 3].map((place) => `<div class="lb-pod p${place}" data-place="${place}">${seatHTML(rows[place - 1])}<div class="lb-block"><span>${place}</span>${chests ? `<img class="lb-minichest" src="${chestSrc(place, false)}" alt="">` : ""}</div></div>`).join("")}</div>`;
  }
  const timerText = () => (S.state === "settling" || now() >= S.endTs ? "ENDED" : hms(S.endTs - now()));

  // full leaderboard (GDD #9)
  let tableEl = null;
  function openTable() {
    if (!S.pool || !S.joined) return;
    closeTable();
    const t = T();
    const rows = standings(t);
    ensureNeighbor(rows, t);
    const el = screen("lb-table");
    tableEl = el;
    el.firstElementChild.innerHTML = `
      <header class="lb-top"><button class="icon-btn lb-back" type="button" data-act="back" aria-label="Back"><span>◀</span></button><h2>LEADERBOARD</h2><button class="icon-btn lb-info" type="button" data-act="info" aria-label="How it works"><span>?</span></button></header>
      <div class="lb-timer"><img src="${CLOCK}" alt=""><span data-timer>${timerText()}</span></div>
      ${podiumHTML(rows, { chests: true })}
      <div class="lb-listwrap"><div class="lb-list">${rows.slice(3).map((r) => rowHTML(r, t)).join("")}</div><div class="lb-sticky" hidden></div></div>
      <div class="lb-cta-wrap"><button class="btn primary lb-cta" type="button" data-act="play">PLAY</button></div>`;
    const list = $(".lb-list", el);
    if (!reduced()) {
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120 });
      podiumAppear($(".lb-podium", el), 0);
      $$(".lb-row", list).slice(0, 12).forEach((row, i) => row.animate([{ transform: "translateX(110%)" }, { transform: "none" }], { duration: 367, delay: 60 + 50 * i, easing: "cubic-bezier(0,.655,.318,1)", fill: "backwards" }));
      $(".lb-cta-wrap", el).animate([{ opacity: 0, transform: "scale(.8)" }, { opacity: 1, transform: "none" }], { duration: 120, delay: 400, fill: "backwards" });
    }
    // the player's row sticks to the list's top or bottom edge while it is scrolled out of view
    const sticky = $(".lb-sticky", el);
    const me = $(".lb-row.me", list);
    if (me) {
      sticky.innerHTML = me.outerHTML;
      const place = () => {
        const top = me.offsetTop - list.scrollTop;
        const out = top < 0 ? "top" : top + me.offsetHeight > list.clientHeight ? "bottom" : "";
        sticky.hidden = !out;
        sticky.dataset.edge = out;
      };
      list.addEventListener("scroll", place, { passive: true });
      requestAnimationFrame(place);
    }
    el.addEventListener("click", (event) => {
      const act = event.target.closest("[data-act]")?.dataset.act;
      if (act === "back") closeTable();
      if (act === "info") openHowTo();
      if (act === "play") { closeTable(); if (activeScreen === "menu") playBtn.click(); }
    });
  }
  function closeTable() { tableEl?.remove(); tableEl = null; }
  function podiumAppear(podium, delay) {
    if (reduced()) return;
    $$(".lb-pod", podium).forEach((col, k) => {
      col.animate([{ transform: "translateY(200px)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 300, delay: delay + 33 * k, easing: "cubic-bezier(.1,.9,.2,1)", fill: "backwards" });
      const av = $(".lb-av", col);
      av?.animate([
        { transform: "translateY(60px) scale(0) rotate(6deg)" }, { transform: "translateY(-18px) scale(1) rotate(-3deg)", offset: 0.45 },
        { transform: "translateY(-2px) rotate(3deg)", offset: 0.7 }, { transform: "translateY(-5px) rotate(0)", offset: 0.85 }, { transform: "none" },
      ], { duration: 680, delay: delay + 120 + 33 * k, easing: "ease-out", fill: "backwards" });
    });
  }

  // ---- level-end climb page (GDD #11) ----
  let animGen = 0;
  function cheerText(info) {
    const r = info.newRank;
    if (r <= 3 && (!S.bestCheered || r < S.bestCheered)) {
      S.bestCheered = r;
      save();
      return ["Outstanding! You're currently in 1st place!", "Great job! You're currently in the top 2!", "Congratulations! You're currently in the top 3!"][r - 1];
    }
    const up = info.oldRank - r;
    if (up >= 3) return pick(["Impressive progress! You jumped up {n} places.", "Way to go! You climbed {n} places.", "On a roll! Up {n} places in one go.", "Nice climb! You're {n} places higher."]).replace("{n}", up);
    return "";
  }
  function climb(info) {
    return new Promise((resolve) => {
      const { before, after, t } = info;
      const newRank = info.newRank;
      const oldRank = clamp(info.oldRank, newRank, before.length);
      const A = oldRank - newRank;
      ensureNeighbor(after, t);
      const el = screen("lb-climb");
      const inner = el.firstElementChild;
      const fx = $(".lb-fx", el);
      inner.innerHTML = `
        <h2 class="lb-ctitle">LEADERBOARD</h2>
        <div class="lb-timer"><img src="${CLOCK}" alt=""><span data-timer>${timerText()}</span></div>
        <div class="lb-podwrap">${podiumHTML(before)}</div>
        <div class="lb-view"><div class="lb-track"></div></div>
        <div class="lb-band" hidden></div>
        <div class="lb-barrage" aria-hidden="true"></div>
        <p class="lb-tap" hidden>Tap to Continue</p>`;
      const view = $(".lb-view", inner);
      const track = $(".lb-track", inner);
      const podWrap = $(".lb-podwrap", inner);
      const rowEls = new Map();
      let viewH = view.clientHeight;
      let scroll = 0;
      let maxScroll = 0;
      function renderList(rows) {
        track.innerHTML = "";
        rowEls.clear();
        const list = rows.filter((r) => r.rank >= 4);
        track.style.height = `${list.length * ROW_H}px`;
        maxScroll = Math.max(0, list.length * ROW_H - viewH);
        list.forEach((r) => {
          const row = html(rowHTML(r, t, { likes: true }));
          row.style.top = `${(r.rank - 4) * ROW_H}px`;
          track.appendChild(row);
          rowEls.set(r.id, row);
        });
      }
      const cam = (y) => { scroll = clamp(y + ROW_H / 2 - viewH / 2, 0, maxScroll); track.style.transform = `translateY(${-scroll}px)`; };
      const setRank = (row, n) => { const cell = $(".lb-rank", row); if (cell.dataset.rank !== String(n)) { cell.dataset.rank = String(n); cell.innerHTML = rankHTML(n); } };
      renderList(before);
      const meRow = rowEls.get("me");
      if (meRow) cam((oldRank - 4) * ROW_H);

      // likes work the whole time; any other tap continues once the page has settled
      let finished = false;
      el.addEventListener("click", (event) => {
        const like = event.target.closest(".lb-like");
        if (like) { toggleLike(like); return; }
        if (!finished) return;
        stopBarrage();
        animGen += 1;
        el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150 }).finished.then(() => el.remove());
        resolve();
      });
      const stopBarrage = startBarrage($(".lb-barrage", inner), info.likers);

      const gen = ++animGen;
      const alive = () => gen === animGen;
      const t0 = performance.now();
      const at = (sec) => sleep(Math.max(0, t0 + sec * 1000 - performance.now()));
      const scoreHost = () => meRow || $('.lb-seat[data-id="me"]', podWrap);

      async function lift(e) { await tween(233, (p) => { e.style.transform = `scale(${1 + 0.05 * p})`; }, ease.quadIn); }
      async function slam(e) {
        sfx.drop();
        buzz(45);
        await tween(133, (p) => { e.style.transform = `scale(${1.05 + 0.03 * p})`; });
        const r = e.getBoundingClientRect();
        e.classList.add("lb-glow");
        setTimeout(() => e.classList.remove("lb-glow"), 500);
        const colors = ["#ffeb33", "#fff4d4", "#e8b951"];
        for (let i = 0; i < 20; i += 1) {
          const x = r.left + rand(0, r.width);
          const up = i % 2 === 0;
          spark(fx, x, up ? r.top : r.bottom, x + rand(-20, 20), (up ? r.top : r.bottom) + (up ? -1 : 1) * rand(30, 50), pick(colors));
        }
        for (let i = 0; i < 6; i += 1) {
          const left = i % 2 === 0;
          const x = left ? r.left : r.right;
          const y = r.top + rand(0, r.height);
          spark(fx, x, y, x + (left ? -1 : 1) * rand(30, 50), y + rand(-12, 12), pick(colors));
        }
        await tween(100, (p) => { e.style.transform = `scale(${1.08 - 0.13 * p})`; }, ease.quadIn);
        await tween(100, (p) => { e.style.transform = `scale(${0.95 + 0.05 * p})`; });
        e.style.transform = "";
      }
      let arrows = 0;
      const startArrows = (e) => {
        arrows = setInterval(() => {
          if (!e.isConnected) return;
          const r = e.getBoundingClientRect();
          const x = r.left + rand(10, r.width - 10);
          const a = html('<i class="lb-arrow"></i>');
          fx.appendChild(a);
          a.animate([{ transform: `translate(${x}px,${r.bottom + 8}px)`, opacity: 0 }, { opacity: 1, offset: 0.32 }, { opacity: 0, offset: 0.72 }, { transform: `translate(${x}px,${r.bottom - 60}px)`, opacity: 0 }], { duration: 700 }).finished.then(() => a.remove());
        }, 90);
      };
      const stopArrows = () => clearInterval(arrows);
      // passed rows each slide down one slot inside their 1/A share of the climb
      function domino(passed, p, n) {
        let done = 0;
        passed.forEach((r, k) => {
          const lp = clamp(p * n - k, 0, 1);
          const row = rowEls.get(r.id);
          row.style.top = `${(r.rank - 4 + lp) * ROW_H}px`;
          if (lp >= 0.5) done += 1;
          setRank(row, lp >= 0.5 ? r.rank + 1 : r.rank);
        });
        return done;
      }

      async function animate() {
        const title = $(".lb-ctitle", inner);
        el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 100 });
        title.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 100, delay: 100, fill: "backwards" });
        $(".lb-timer", inner).animate([{ opacity: 0 }, { opacity: 1 }], { duration: 100, delay: 167, fill: "backwards" });
        podiumAppear($(".lb-podium", podWrap), 167);
        [...rowEls.values()].map((row) => [row, parseFloat(row.style.top) - scroll]).filter(([, y]) => y > -ROW_H && y < viewH)
          .sort((a, b) => a[1] - b[1]).forEach(([row], k) => {
            row.animate([{ transform: "scale(.6)", opacity: 0 }, { transform: "scale(1.05)", opacity: 1, offset: 0.55 }, { transform: "scale(1)" }], { duration: 300, delay: 200 + 66.7 * k, fill: "backwards" });
          });

        // six stars fly into the player's score
        await at(0.733); if (!alive()) return;
        sfx.count();
        const host = scoreHost();
        const hr = host.getBoundingClientRect();
        const icon = $(".lb-score img", host);
        for (let i = 0; i < 6; i += 1) {
          const x0 = hr.right - 26 - (i % 3) * 24, y0 = hr.top + hr.height / 2 + (i < 3 ? -12 : 12);
          const tr = icon.getBoundingClientRect();
          const x1 = tr.left + tr.width / 2, y1 = tr.top + tr.height / 2;
          const s = html(`<i class="lb-flystar" style="background-image:url('${STAR}')"></i>`);
          fx.appendChild(s);
          const mx = (x0 + x1) / 2, my = Math.min(y0, y1) - 50;
          s.animate([
            { transform: `translate(${x0}px,${y0}px) scale(.3)`, opacity: 0, offset: 0 },
            { transform: `translate(${x0}px,${y0}px) scale(.8)`, opacity: 1, offset: 0.18 },
            { transform: `translate(${x0}px,${y0}px) scale(.6)`, offset: 0.32 },
            { transform: `translate(${x0}px,${y0}px) scale(.67)`, offset: 0.77 },
            { transform: `translate(${mx}px,${my}px) scale(.6)`, offset: 0.88 },
            { transform: `translate(${x1}px,${y1}px) scale(.45)`, opacity: 1, offset: 0.97 },
            { transform: `translate(${x1}px,${y1}px) scale(.3)`, opacity: 0, offset: 1 },
          ], { duration: 1033, delay: 100 * i, fill: "backwards" }).finished.then(() => {
            s.remove();
            burst(fx, x1, y1, 6, ["#ffeb33", "#fff4d4"], 22, 300);
          });
        }
        await at(1.733); if (!alive()) return;
        const num = $(".lb-score b", host);
        await tween(633, (p) => { num.textContent = String(Math.round(info.oldScore + (info.newScore - info.oldScore) * p)); }, ease.quadOut);
        if (!alive()) return;

        if (A === 0) {
          const e = scoreHost();
          await at(2.4); await lift(e); await sleep(0); await slam(e);
        } else if (newRank >= 4) {
          await at(2.367); if (!alive()) return;
          sfx.rise();
          await lift(meRow);
          startArrows(meRow);
          await at(2.9); if (!alive()) return;
          const D = clamp(1 + 0.05 * A, 1, 3) * 1000;
          const passed = before.filter((r) => r.rank >= newRank && r.rank < oldRank).sort((a, b) => b.rank - a.rank);
          await tween(D, (p) => {
            if (!alive()) return;
            const y = (newRank - 4 + A * (1 - p)) * ROW_H;
            meRow.style.top = `${y}px`;
            setRank(meRow, oldRank - domino(passed, p, A));
            cam(y);
          }, ease.sineInOut);
          stopArrows();
          if (!alive()) return;
          await sleep(50);
          await slam(meRow);
        } else if (oldRank >= 4) {
          // out of the list onto the podium
          await at(2.367); if (!alive()) return;
          sfx.rise();
          await lift(meRow);
          startArrows(meRow);
          await at(2.9); if (!alive()) return;
          const passed = before.filter((r) => r.rank >= 4 && r.rank < oldRank).sort((a, b) => b.rank - a.rank);
          const n = passed.length;
          const oldSlot = oldRank - 4;
          await tween(Math.max(300, 150 * n), (p) => {
            if (!alive()) return;
            const y = oldSlot * (1 - p) * ROW_H;
            meRow.style.top = `${y}px`;
            setRank(meRow, oldRank - domino(passed, p, Math.max(1, n)));
            cam(y);
          });
          stopArrows();
          if (!alive()) return;
          const dist = 290;
          let handed = null;
          await tween(dist / (ROW_H / 0.15) * 1000, (p) => {
            const y = -dist * p;
            meRow.style.top = `${y}px`;
            if (!handed && y < -30) handed = podiumHandoff();
          });
          meRow.remove();
          await handed;
          if (!alive()) return;
          renderList(after);
          const fresh = [...rowEls.values()][0];
          fresh?.animate([{ transform: "scale(.6)", opacity: 0 }, { transform: "scale(1.05)", opacity: 1, offset: 0.55 }, { transform: "scale(1)" }], { duration: 300 });
          cam(0);
        } else {
          // a jump between podium places
          const seat = $('.lb-seat[data-id="me"]', podWrap);
          const av = $(".lb-av", seat);
          await at(1.767); if (!alive()) return;
          av.animate([{ transform: "scale(1)" }, { transform: "scale(.85)" }, { transform: "scale(1)" }], { duration: 300 });
          await at(2.067); if (!alive()) return;
          const from = av.getBoundingClientRect();
          const to = $(`.lb-pod.p${newRank} .lb-av`, podWrap).getBoundingClientRect();
          const copy = html(`<div class="lb-flycopy">${avatarHTML(P.avatar, { champ: P.firsts, size: "lg" })}</div>`);
          fx.appendChild(copy);
          av.style.visibility = "hidden";
          const dx = to.left - from.left, dy = to.top - from.top - 85;
          copy.style.left = `${from.left}px`;
          copy.style.top = `${from.top}px`;
          copy.animate([{ transform: "none" }, { transform: `translate(${dx}px,${dy}px) scale(1.2)` }], { duration: 300, easing: "cubic-bezier(.389,.25,1,1)", fill: "forwards" });
          await at(2.233); if (!alive()) return;
          sweep($(`.lb-pod.p${newRank} .lb-block`, podWrap));
          await at(2.367); if (!alive()) return;
          podWrap.innerHTML = podiumHTML(after);
          const landed = $('.lb-seat[data-id="me"] .lb-av', podWrap);
          landed.style.visibility = "hidden";
          const end = landed.getBoundingClientRect();
          copy.animate([{ transform: `translate(${dx}px,${dy}px) scale(1.2)` }, { transform: `translate(${end.left - from.left}px,${end.top - from.top}px) scale(.9)` }], { duration: 133, easing: "ease-in", fill: "forwards" });
          await at(2.5);
          copy.remove();
          landed.style.visibility = "";
          sfx.drop();
          buzz(45);
          landed.animate([{ transform: "scale(.9)" }, { transform: "scale(1)" }], { duration: 167 });
          confettiPops(fx, landed.getBoundingClientRect());
          await at(2.667);
        }
      }
      // GDD: the old owner drops out, the player's avatar jumps onto the pedestal, light sweeps it
      async function podiumHandoff() {
        const pod = $(`.lb-pod.p${newRank}`, podWrap);
        const seat = $(".lb-seat", pod);
        seat.animate([{ transform: "none" }, { transform: "translateY(300px) scale(0)" }], { duration: 167, easing: "cubic-bezier(.55,0,1,.45)", fill: "forwards" });
        await sleep(167);
        const mine = html(seatHTML(after.find((r) => r.me)));
        seat.replaceWith(mine);
        mine.animate([
          { transform: "translateY(0) scale(.9)" }, { transform: "translateY(-50px) scale(1.2)", offset: 0.8, easing: "ease-in-out" },
          { transform: "translateY(0) scale(.95)" },
        ], { duration: 500, easing: "cubic-bezier(.2,.8,.3,1)" });
        sfx.drop();
        buzz(45);
        setTimeout(() => { sweep($(".lb-block", pod)); confettiPops(fx, mine.getBoundingClientRect()); }, 100);
        await sleep(400);
        podWrap.innerHTML = podiumHTML(after);
        $$(".lb-seat:not(.me)", podWrap).forEach((s) => s.animate([{ transform: "scale(.6)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 200 }));
      }
      function renderFinal() {
        podWrap.innerHTML = podiumHTML(after);
        renderList(after);
        cam(newRank >= 4 ? (newRank - 4) * ROW_H : 0);
      }
      async function finish() {
        stopArrows();
        if (!alive()) return;
        animGen += 1; // stops anything still running
        await sleep(50);
        renderFinal();
        const band = $(".lb-band", inner);
        const text = cheerText(info);
        if (text) {
          band.textContent = text;
          band.hidden = false;
          if (!reduced()) band.animate([{ transform: "translateY(-24px)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 250, easing: "cubic-bezier(.2,.9,.3,1.2)" });
        }
        // the list can be dragged once it has settled
        track.style.transform = "";
        view.classList.add("free");
        view.scrollTop = scroll;
        const tap = $(".lb-tap", inner);
        tap.hidden = false;
        tap.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250 });
        finished = true;
      }
      if (reduced()) { finish(); return; }
      Promise.race([animate(), sleep(CFG.watchdogSec * 1000)]).then(async () => {
        if (alive()) await sleep(A === 0 ? 300 : 530); // GDD: the tap prompt comes ≈0.53 s after the slam
        finish();
      });
    });
  }
  function spark(host, x0, y0, x1, y1, color) {
    const dot = html(`<i class="lb-px" style="background:${color}"></i>`);
    host.appendChild(dot);
    dot.animate([{ transform: `translate(${x0}px,${y0}px)`, opacity: 1 }, { transform: `translate(${x1}px,${y1}px) scale(.5)`, opacity: 0 }], { duration: 600, easing: "cubic-bezier(.05,.9,.2,1)" }).finished.then(() => dot.remove());
  }
  function sweep(block) {
    if (!block) return;
    block.classList.remove("sweep");
    void block.offsetWidth;
    block.classList.add("sweep");
  }
  function confettiPops(host, r) {
    burst(host, r.left + r.width / 2, r.top + r.height / 2, 22, ["#e8b951", "#cf7955", "#82944c", "#fff4d4", "#b66240"], 90, 900);
  }
  function toggleLike(button) {
    const id = button.dataset.like;
    const given = S.likes.given;
    if (given[id]) delete given[id]; else given[id] = true;
    save();
    const liked = Boolean(given[id]);
    button.classList.toggle("liked", liked);
    $("img", button).src = liked ? HEART : HEART_EMPTY;
    const em = $("em", button);
    em.textContent = String(Number(em.textContent) + (liked ? 1 : -1));
    if (liked) { sfx.like(); button.animate([{ transform: "scale(1)" }, { transform: "scale(1.35)" }, { transform: "scale(1)" }], { duration: 250 }); }
  }
  // GDD "bullet" messages: bots that liked the player float across the page
  function startBarrage(host, likers) {
    if (!likers.length || reduced()) return () => {};
    const B = CFG.barrage;
    const T1 = ["%s just liked you", "%s loved your play", "%s cheered for you", "%s clapped for you", "Wow! %s liked you"];
    const T3 = ["%s, %s and %d others liked you", "%s, %s and %d more cheered for you", "%s, %s and %d others loved your play"];
    const msgs = likers.length <= B.aggregateAbove
      ? shuffle([...T1]).slice(0, likers.length).map((tpl, i) => [likers[i], tpl.replace("%s", likers[i].name)])
      : [[likers[0], pick(T3).replace("%s", likers[0].name).replace("%s", likers[1].name).replace("%d", likers.length - 2)]];
    let lanes = shuffle([...Array(B.lanes).keys()]);
    let stopped = false;
    let timer = 0;
    const send = (k) => {
      if (stopped || k >= msgs.length) return;
      if (k && k % 3 === 0) lanes = shuffle(lanes);
      const [bot, text] = msgs[k];
      const bullet = html(`<div class="lb-bullet" style="top:${lanes[k % B.lanes] * 30}px">${avatarHTML(bot.av, { size: "xs" })}<span>${esc(text)}</span><img src="${HEART}" alt=""></div>`);
      host.appendChild(bullet);
      const w = host.clientWidth;
      bullet.animate([{ transform: `translateX(${w}px)` }, { transform: "translateX(-110%)" }], { duration: B.crossSec * 1000, easing: "linear" }).finished.then(() => bullet.remove());
      timer = setTimeout(() => send(k + 1), rand(B.gapSec[0], B.gapSec[1]) * 1000);
    };
    timer = setTimeout(() => send(0), 300);
    return () => { stopped = true; clearTimeout(timer); };
  }

  // ---- season-end reward (GDD #7, #12) ----
  let claiming = null;
  function claimFlow() {
    if (!claiming) claiming = doClaim().finally(() => { claiming = null; });
    return claiming;
  }
  async function doClaim() {
    if (!rewardPending()) return;
    const rank = S.finalRank;
    const items = { hints: 0, frame: false, ...CFG.rewards[rank] };
    // saved before the show, so a crash mid-animation can't lose or repeat the reward
    hintLeft += items.hints;
    updateBoosters();
    saveProgress();
    if (rank === 1) P.firsts += 1; else if (rank === 2) P.seconds += 1; else P.thirds += 1;
    saveProfile();
    S.rewardClaimed = true;
    save();
    try { await chestShow(rank, items); } catch (error) { console.error(error); }
    fold();
    refreshChip();
  }
  function chestShow(rank, items) {
    return new Promise((resolve) => {
      const el = screen("lb-reward");
      const inner = el.firstElementChild;
      const fx = $(".lb-fx", el);
      const t = T();
      const rows = standings(t);
      const times = [P.firsts, P.seconds, P.thirds][rank - 1];
      const text = rank === 1 ? `You've won 1st place ${times} time${times > 1 ? "s" : ""}!` : `You've finished ${ordinal(rank)} ${times} time${times > 1 ? "s" : ""}!`;
      const hintIcon = $("#hintBtn img")?.src || STAR;
      inner.innerHTML = `
        <p class="lb-rtext">${text}</p>
        <div class="lb-rstage">
          <div class="lb-rays" hidden></div>
          <div class="lb-rpod">${podiumHTML(rows)}</div>
          <div class="lb-chest" hidden><img src="${chestSrc(rank, false)}" alt="Reward chest"></div>
          <div class="lb-items" hidden>
            ${items.frame ? `<div class="lb-item">${avatarHTML(P.avatar, { champ: P.firsts, size: "lg" })}<b>Champion frame</b></div>` : ""}
            ${items.hints ? `<div class="lb-item"><img src="${hintIcon}" alt=""><b>Hint ×<span data-hints>${items.hints}</span></b></div>` : ""}
          </div>
        </div>
        <div class="lb-ractions">
          <button class="btn primary" type="button" data-collect hidden>COLLECT</button>
          <button class="btn primary" type="button" data-take hidden>COLLECT</button>
          ${items.hints ? `<button class="btn ghost lb-double" type="button" data-double hidden>▶ COLLECT ×2</button>` : ""}
        </div>`;
      const pod = $(".lb-rpod", inner);
      const chest = $(".lb-chest", inner);
      const chestImg = $("img", chest);
      const rays = $(".lb-rays", inner);
      const textEl = $(".lb-rtext", inner);
      const collect = $("[data-collect]", inner);
      const R = reduced();
      $$(".lb-seat:not(.me) .lb-av img", pod).forEach((img) => img.classList.add("silhouette"));
      (async () => {
        if (!R) {
          el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 270 });
          textEl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 267 });
          pod.animate([{ transform: "scale(2)" }, { transform: "scale(1)" }], { duration: 500, easing: "cubic-bezier(.2,.8,.3,1)" });
          $(".lb-pod.p2", pod).animate([{ transform: "translateX(-320px)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 500, delay: 67, fill: "backwards" });
          $(".lb-pod.p3", pod).animate([{ transform: "translateX(320px)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 500, delay: 133, fill: "backwards" });
          await sleep(417);
          rays.hidden = false;
          rays.animate([{ transform: "scale(0)" }, { transform: "scale(1)" }], { duration: 170 });
          await sleep(83);
          const hero = $('.lb-seat[data-id="me"] .lb-av', pod);
          hero?.animate([
            { transform: "translateY(0)" }, { transform: "translateY(-104px)", offset: 0.34, easing: "ease-out" }, { transform: "translateY(-108px)", offset: 0.45 },
            { transform: "translateY(-102px)", offset: 0.6, easing: "ease-in" }, { transform: "translateY(8px)", offset: 0.82 }, { transform: "translateY(-6px)", offset: 0.92 }, { transform: "translateY(0)" },
          ], { duration: 733 });
          await sleep(110);
          const sr = el.getBoundingClientRect();
          burst(fx, sr.left + 20, sr.bottom - 40, 26, ["#e8b951", "#cf7955", "#82944c", "#fff4d4"], 220, 1200);
          burst(fx, sr.right - 20, sr.bottom - 40, 26, ["#e8b951", "#cf7955", "#82944c", "#fff4d4"], 220, 1200);
          for (const delay of [357, 233, 133]) {
            await sleep(delay);
            burst(fx, rand(sr.left + 60, sr.right - 60), rand(sr.top + 90, sr.top + 260), 18, ["#ffeb33", "#fff4d4", "#e8b951"], 70, 800);
          }
          await sleep(567);
          pod.animate([{ transform: "none" }, { transform: "translateY(-30px) scale(.85)" }], { duration: 500, fill: "forwards", easing: "ease-in-out" });
          await sleep(367);
          $$(".silhouette", pod).forEach((img) => img.classList.remove("silhouette"));
          await sleep(233);
        } else {
          rays.hidden = false;
          $$(".silhouette", pod).forEach((img) => img.classList.remove("silhouette"));
        }
        chest.hidden = false;
        sfx.box();
        if (!R) chest.animate([
          { transform: "translateY(260px) scale(.5,.4)" }, { transform: "translateY(-60px) scale(1.05,.95)", offset: 0.45 },
          { transform: "translateY(10px) scale(.95,1.05)", offset: 0.75 }, { transform: "none" },
        ], { duration: 500, easing: "ease-out" });
        await sleep(R ? 0 : 380);
        buzz(200);
        await sleep(R ? 0 : 120);
        collect.hidden = false;
        if (!R) collect.animate([{ opacity: 0, transform: "scale(.8)" }, { opacity: 1, transform: "none" }], { duration: 200 });
        chest.classList.add("idle");
      })();
      collect.addEventListener("click", async () => {
        collect.hidden = true;
        sfx.open();
        textEl.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: "forwards" });
        pod.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 270, fill: "forwards" });
        chest.classList.remove("idle");
        chest.animate([{ transform: "rotate(0)" }, { transform: "rotate(-4deg)" }, { transform: "rotate(4deg)" }, { transform: "rotate(0)" }], { duration: 300, iterations: 2 });
        await sleep(R ? 0 : 650);
        chestImg.src = chestSrc(rank, true);
        buzz(60);
        const cr = chest.getBoundingClientRect();
        burst(fx, cr.left + cr.width / 2, cr.top + cr.height / 3, 34, ["#e8b951", "#cf7955", "#82944c", "#fff4d4", "#ffeb33"], 160, 1000);
        await sleep(R ? 0 : 230);
        const box = $(".lb-items", inner);
        box.hidden = false;
        if (!R) {
          box.animate([{ transform: "scale(.5)", opacity: 0 }, { transform: "scale(1.08)", opacity: 1, offset: 0.6 }, { transform: "none" }], { duration: 350 });
          chest.animate([{ transform: "none", opacity: 1 }, { transform: "translateY(200px)", opacity: 0 }], { duration: 550, delay: 130, fill: "forwards" });
        } else chest.hidden = true;
        $("[data-take]", inner).hidden = false;
        const dbl = $("[data-double]", inner);
        if (dbl) dbl.hidden = false;
      });
      const close = () => { el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200 }).finished.then(() => el.remove()); resolve(); };
      $("[data-take]", inner).addEventListener("click", close);
      $("[data-double]", inner)?.addEventListener("click", () => {
        // the ad doubles the tools only, never the frame
        adModal.style.zIndex = "90";
        playRewarded(() => {
          adModal.style.zIndex = "";
          hintLeft += items.hints;
          updateBoosters();
          saveProgress();
          $("[data-hints]", inner).textContent = String(items.hints * 2);
          setTimeout(close, 450);
        });
      });
    });
  }

  // ---- popups ----
  const modals = [];
  function modal(id, markup) {
    const el = html(`<div class="modal lb-modal" id="${id}" role="dialog" aria-modal="true">${markup}</div>`);
    document.body.appendChild(el);
    return el;
  }
  function openModal(el, onEscape) {
    el.classList.add("open");
    modals.push({ el, onEscape });
    sfx.popup();
  }
  function closeModal(el) {
    el.classList.remove("open");
    const i = modals.findIndex((m) => m.el === el);
    if (i >= 0) modals.splice(i, 1);
  }
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (modals.length) { modals[modals.length - 1].onEscape?.(); return; }
    if (tableEl) closeTable();
  });

  // GDD: closing the season popup in any way joins the season
  const joinEl = modal("lbJoin", `<div class="modal-card compact-modal lb-join">
      <button class="close-button" type="button" data-x aria-label="Close"><span aria-hidden="true">×</span></button>
      <div class="lb-join-art">${ART["season-banner"] ? `<img src="${ART["season-banner"]}" alt="">` : `<img class="lb-join-trophy" src="${ART["leaderboard-icon"] || TROPHY}" alt="">`}</div>
      <h2>New Season</h2>
      <p class="lb-p">Win levels to collect <img src="${STAR}" alt="stars"> and rank up. Every heart you have left is a star. Finish in the top 3 to win a chest!</p>
      <div class="lb-timer lb-join-timer"><img src="${CLOCK}" alt=""><span data-timer></span></div>
      <button class="btn primary" type="button" data-ok>Got it</button>
    </div>`);
  function joinPopup({ atHome = false } = {}) {
    return new Promise((resolve) => {
      $("[data-timer]", joinEl).textContent = timerText();
      const done = async (button) => {
        $("[data-ok]", joinEl).onclick = $("[data-x]", joinEl).onclick = null;
        closeModal(joinEl);
        join();
        if (S.periodCount === 1 && !P.edited) await profilePopup();
        if (atHome && button) playBtn.click();
        resolve();
      };
      $("[data-ok]", joinEl).onclick = () => done(true);
      $("[data-x]", joinEl).onclick = () => done(false);
      openModal(joinEl, () => done(false));
      $("[data-ok]", joinEl).focus({ preventScroll: true });
    });
  }

  const offlineEl = modal("lbOffline", `<div class="modal-card compact-modal lb-offline">
      <button class="close-button" type="button" data-x aria-label="Close"><span aria-hidden="true">×</span></button>
      <img class="lb-offline-icon" src="${WIFI_OFF}" alt=""><h2>Network error</h2>
      <p class="lb-p">Please check your connection.</p>
      <button class="btn primary" type="button" data-x>OK</button>
    </div>`);
  $$("[data-x]", offlineEl).forEach((b) => b.addEventListener("click", () => closeModal(offlineEl)));

  const howEl = modal("lbHow", `<div class="modal-card lb-how">
      <h2>Leaderboard</h2>
      <ol class="lb-steps">
        <li><span class="lb-step-icon"><img src="${svgUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges"><path fill="#3f512d" d="M3 1h3v1h2v1h2v1h2v1h2v1h1v4h-1v1h-2v1h-2v1H8v1H6v1H3z"/><path fill="#fff4d4" d="M4 3h2v1h2v1h2v1h2v1h1v2h-1v1h-2v1H8v1H6v1H4z"/></svg>')}" alt=""></span><p>Clear levels</p></li>
        <li><span class="lb-step-icon"><img src="${STAR}" alt=""></span><p>Hearts left become stars</p></li>
        <li><span class="lb-step-icon">${medalHTML(1)}</span><p>Top the leaderboard</p></li>
        <li><span class="lb-step-icon"><img src="${chestSrc(1, false)}" alt=""></span><p>Win chests and the champion frame</p></li>
      </ol>
      <p class="lb-p lb-how-note">A season lasts 24 hours.</p>
      <p class="lb-tapclose">Tap anywhere to close</p>
    </div>`);
  function openHowTo() {
    openModal(howEl, () => closeModal(howEl));
    if (!reduced()) $$(".lb-steps > *", howEl).forEach((li, i) => li.animate([{ transform: "scale(0)" }, { transform: "scale(1.05)", offset: 0.7 }, { transform: "none" }], { duration: 283, delay: 150 + i * 220, fill: "backwards" }));
  }
  howEl.addEventListener("click", () => closeModal(howEl));

  // ---- profile (Finding Animals' PopupEditProfile: nickname + avatar, Save when changed) ----
  const profileEl = modal("lbProfile", `<div class="modal-card compact-modal lb-prof">
      <button class="close-button" type="button" data-x aria-label="Close"><span aria-hidden="true">×</span></button>
      <h2>Profile</h2>
      <div class="lb-prof-top"><div class="lb-prof-preview"></div><div class="lb-prof-wins"></div></div>
      <label class="lb-nick"><span>NICKNAME</span><input type="text" maxlength="16" autocomplete="off" autocapitalize="characters" spellcheck="false" enterkeyhint="done"></label>
      <div class="lb-avgrid" role="radiogroup" aria-label="Avatar">${Array.from({ length: AVATARS }, (_, i) => `<button class="lb-avpick" type="button" role="radio" data-av="${i}" aria-label="Avatar ${i + 1}"><img src="${avatarSrc(i)}" alt="" draggable="false"></button>`).join("")}</div>
      <button class="btn primary" type="button" data-save>Save</button>
    </div>`);
  let profileDone = null;
  let selectedAvatar = P.avatar;
  const nickInput = $("input", profileEl);
  const saveBtn = $("[data-save]", profileEl);
  function profileDirty() { return selectedAvatar !== P.avatar || nickInput.value.trim() !== P.name; }
  function renderProfile() {
    $(".lb-prof-preview", profileEl).innerHTML = avatarHTML(selectedAvatar, { champ: P.firsts, size: "xl" });
    $$(".lb-avpick", profileEl).forEach((b) => {
      const on = Number(b.dataset.av) === selectedAvatar;
      b.classList.toggle("on", on);
      b.setAttribute("aria-checked", String(on));
    });
    const wins = [["1st", P.firsts], ["2nd", P.seconds], ["3rd", P.thirds]].filter(([, n]) => n);
    $(".lb-prof-wins", profileEl).innerHTML = wins.map(([label, n]) => `<span>${label} ×${n}</span>`).join("");
    saveBtn.disabled = !profileDirty() || !nickInput.value.trim();
  }
  nickInput.addEventListener("input", () => {
    const clean = nickInput.value.replace(/[^a-zA-Z0-9 ]/g, "").slice(0, 16);
    if (clean !== nickInput.value) nickInput.value = clean;
    renderProfile();
  });
  // keep the admin panel's single-key shortcuts out of the text field
  nickInput.addEventListener("keydown", (event) => { event.stopPropagation(); if (event.key === "Enter" && !saveBtn.disabled) saveBtn.click(); if (event.key === "Escape") closeProfile(); });
  profileEl.addEventListener("click", (event) => {
    const pickBtn = event.target.closest(".lb-avpick");
    if (pickBtn) { selectedAvatar = Number(pickBtn.dataset.av); sfx.like(); renderProfile(); }
    if (event.target.closest("[data-x]") || event.target === profileEl) closeProfile();
  });
  saveBtn.addEventListener("click", () => {
    P.avatar = selectedAvatar;
    P.name = nickInput.value.trim();
    P.edited = true;
    saveProfile();
    refreshChip();
    closeProfile();
  });
  function profilePopup() {
    selectedAvatar = P.avatar;
    nickInput.value = P.name;
    renderProfile();
    openModal(profileEl, closeProfile);
    return new Promise((resolve) => { profileDone = resolve; });
  }
  function closeProfile() {
    closeModal(profileEl);
    profileDone?.();
    profileDone = null;
  }

  // ---- main menu: profile chip (where the stars were) and the leaderboard entry ----
  const chip = $("#profileBtn");
  function refreshChip() {
    if (!chip) return;
    chip.innerHTML = `${avatarHTML(P.avatar, { champ: P.firsts, size: "sm" })}<span class="pc-name">${esc(P.name)}</span>`;
    chip.setAttribute("aria-label", `Profile: ${P.name}`);
  }
  chip?.addEventListener("click", () => { profilePopup(); });

  const entry = html(`<button class="lb-entry" type="button" hidden aria-label="Leaderboard">
      <span class="le-icon"><img src="${ART["leaderboard-icon"] || TROPHY}" alt="" draggable="false"></span>
      <span class="le-text"><span class="le-title">RANK</span><span class="le-time"><img src="${CLOCK}" alt=""><span data-timer></span></span></span>
      <img class="le-offline" src="${WIFI_OFF}" alt="" hidden>
    </button>`);
  {
    const levelsBtn = $("#levelsBtn");
    const row = html('<div class="menu-row"></div>');
    levelsBtn.before(row);
    row.append(levelsBtn, entry);
  }
  entry.addEventListener("click", () => {
    buzz(20);
    if (!online()) { openModal(offlineEl, () => closeModal(offlineEl)); return; }
    if (rewardPending()) { openTable(); requestAnimationFrame(() => claimFlow().then(afterHomeClaim)); return; }
    if (S.state === "open") { joinPopup({ atHome: true }); return; }
    openTable();
  });
  function refresh() {
    refreshChip();
    const show = S.state === "open" || S.state === "joined" || rewardPending() || (S.state === "settling" && !S.settled);
    entry.hidden = !show;
    if (!show) return;
    const off = !online();
    const reward = rewardPending();
    entry.classList.toggle("offline", off);
    entry.classList.toggle("reward", reward);
    $(".le-offline", entry).hidden = !off;
    const rank = S.joined && S.score > 0 && !off ? myRank() : 0;
    $(".le-title", entry).textContent = reward ? "OPEN" : S.state === "open" ? "JOIN" : rank ? `RANK ${rank}` : "RANK";
    $(".le-time [data-timer]", entry).textContent = off ? "--:--:--" : reward ? "REWARD" : timerText();
  }

  // ---- game hook points ----
  async function beforeWinScreen(openWin) {
    const info = pending;
    pending = null;
    const level0 = assignments;
    try {
      if (info) {
        await info.flight;
        if (info.climb) await climb(info);
        hidePill();
      }
      if (rewardPending()) await claimFlow();
    } catch (error) { console.error(error); }
    refresh();
    if (completed && assignments === level0) openWin();
  }
  let nextBusy = false;
  async function onNext(cont) {
    if (nextBusy) return;
    nextBusy = true;
    try {
      if (rewardPending()) await claimFlow();
      if (maybeOpen(false) || S.state === "open") await joinPopup();
    } catch (error) { console.error(error); }
    nextBusy = false;
    cont();
  }
  function afterHomeClaim() {
    closeTable();
    if (activeScreen === "menu" && maybeOpen(true)) joinPopup({ atHome: true });
  }
  function onHome() {
    check();
    hidePill();
    refresh();
    if (rewardPending()) { openTable(); requestAnimationFrame(() => claimFlow().then(afterHomeClaim)); return; }
    if (maybeOpen(true) || S.state === "open") joinPopup({ atHome: true });
  }

  // one clock for every countdown on screen
  let ticks = 0;
  setInterval(() => {
    check();
    $$("[data-timer]").forEach((el) => { if (el.closest(".le-time")) return; el.textContent = timerText(); });
    if (activeScreen === "menu") refresh();
    ticks += 1;
    if (S.pool && ticks % 30 === 0) save(); // keeps the board clock's high-water mark
  }, 1000);
  window.addEventListener("online", refresh);
  window.addEventListener("offline", refresh);

  // ---- admin panel section (only when admin.js is loaded) ----
  function attachAdmin() {
    const panel = $("#admPanel");
    if (!panel) return;
    const box = html(`<div class="adm-lb">
        <div class="adm-lb-state"></div>
        <div class="adm-row c2"><button class="adm-b" type="button" data-lb="open" title="Sezonu şimdi aç (level şartı yok)">LB AÇ</button><button class="adm-b" type="button" data-lb="end" title="Sezonu şimdi bitir: sıra kilitlenir, ilk 3'teysen sandık">LB BİTİR</button></div>
        <div class="adm-row c3"><button class="adm-b" type="button" data-lb="h1" title="Saati 1 saat ileri al">+1 SA</button><button class="adm-b" type="button" data-lb="h6" title="Saati 6 saat ileri al">+6 SA</button><button class="adm-b" type="button" data-lb="star" title="Sezon puanına +10 yıldız ekle">+10 ★</button></div>
        <div class="adm-row"><button class="adm-b" type="button" data-lb="reset" title="Leaderboard kaydını ve saat kaydırmayı sil">LB SIFIRLA</button></div>
      </div>`);
    const msg = $(".adm-msg", panel);
    (msg || panel.lastElementChild).before(box);
    const state = $(".adm-lb-state", box);
    const show = () => {
      const left = S.state === "closed" ? "" : ` · ${timerText()}`;
      state.textContent = `LB: ${S.state}${S.joined ? " ✓" : ""} · ★${S.score} · #${S.joined ? myRank() : "-"} · B ${S.pool?.B ?? "-"}${left} · sezon ${S.periodCount}`;
    };
    setInterval(() => { if (!panel.hidden) show(); }, 500);
    box.addEventListener("click", (event) => {
      const act = event.target.closest("[data-lb]")?.dataset.lb;
      if (!act) return;
      if (act === "open") {
        if (S.state === "closed") openSeason();
        if (S.state === "open") joinPopup({ atHome: activeScreen === "menu" });
      }
      if (act === "end" && S.pool) { S.endTs = now() - 1; save(); check(); if (activeScreen === "menu") onHome(); }
      if (act === "h1" || act === "h6") { skew += (act === "h1" ? 1 : 6) * 3600e3; write(SKEW_KEY, { ms: skew }); check(); if (activeScreen === "menu") onHome(); }
      if (act === "star" && S.joined && S.pool) { S.score += 10; S.scoreTs = now(); onPlayerScore(T()); save(); }
      if (act === "reset") { S = blank(); skew = 0; write(SKEW_KEY, { ms: 0 }); save(); closeTable(); }
      refresh();
      show();
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", attachAdmin); else setTimeout(attachAdmin, 0);

  // ---- styles ----
  const css = `
    .profile-chip { display:flex; align-items:center; gap:12px; min-width:0; max-width:calc(100% - 70px); height:44px; padding:0 12px 0 4px; border:0; background:#dcc79a; color:#725434; font:400 10px/1 var(--px-font); box-shadow:3px 0 #c0a778,-3px 0 #c0a778,0 3px #c0a778,0 -3px #c0a778; cursor:pointer; }
    .profile-chip:active { transform:translateY(2px); }
    .profile-chip .pc-name { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .lb-av { --fr:#6c5535; position:relative; display:inline-block; flex:none; width:40px; height:40px; background:#e9d6a8; box-shadow:2px 0 var(--fr),-2px 0 var(--fr),0 2px var(--fr),0 -2px var(--fr); }
    .lb-av > img:first-child { display:block; width:100%; height:100%; object-fit:cover; }
    .lb-av.xs { width:20px; height:20px; box-shadow:1px 0 var(--fr),-1px 0 var(--fr),0 1px var(--fr),0 -1px var(--fr); }
    .lb-av.sm { width:34px; height:34px; }
    .lb-av.lg { width:52px; height:52px; box-shadow:3px 0 var(--fr),-3px 0 var(--fr),0 3px var(--fr),0 -3px var(--fr); }
    .lb-av.xl { width:96px; height:96px; box-shadow:4px 0 var(--fr),-4px 0 var(--fr),0 4px var(--fr),0 -4px var(--fr),0 8px #ae9668; }
    .lb-av.fr-1 { --fr:#4c6331; } .lb-av.fr-2 { --fr:#86452c; } .lb-av.fr-3 { --fr:#8a6526; } .lb-av.fr-4 { --fr:#57366a; } .lb-av.fr-5 { --fr:#5b5e57; }
    .lb-av.champ { --fr:#e3b04b; outline:2px solid #8a6526; outline-offset:2px; }
    .lb-av.champ.t2 { --fr:#f0c94f; outline-color:#b98b3a; }
    .lb-av.champ.t3 { --fr:#f6dc8f; outline-color:#b66240; }
    .lb-av.champ.t4 { --fr:#fff0a2; outline-color:#7a4f8f; }
    .lb-av.champ.t5 { --fr:#fff4d4; outline:3px solid #b66240; }
    .lb-av.champ::before { content:""; position:absolute; z-index:2; left:50%; top:-12px; width:18px; height:12px; transform:translateX(-50%); background:url("${CROWN}") center/contain no-repeat; image-rendering:pixelated; }
    .lb-av.lg.champ::before, .lb-av.xl.champ::before { top:-18px; width:27px; height:18px; }
    .lb-av.xs.champ::before { display:none; }
    .lb-av .lb-champ-img { position:absolute; inset:-22%; width:144%; height:144%; pointer-events:none; }
    .lb-av.champ:has(.lb-champ-img) { outline:0; }
    .lb-av.champ:has(.lb-champ-img)::before { display:none; }
    .lb-badge { position:absolute; z-index:3; right:-9px; bottom:-8px; min-width:17px; height:15px; padding:0 3px; background:#b66240; color:#fff4d4; font:400 7px/15px var(--px-font); text-align:center; box-shadow:2px 0 #6e4e32,-2px 0 #6e4e32,0 2px #6e4e32,0 -2px #6e4e32; }
    .lb-av.xs .lb-badge { display:none; }
    .menu-row { display:flex; justify-content:center; align-items:stretch; gap:18px; width:100%; }
    .lb-entry { position:relative; display:flex; align-items:center; gap:10px; padding:8px 14px 8px 10px; border:0; background:#c9973f; color:#fff4d4; font:400 10px/1 var(--px-font); text-shadow:2px 2px #7a5a22; cursor:pointer;
      box-shadow:4px 0 #6e4e1e,-4px 0 #6e4e1e,0 -4px #6e4e1e,0 4px #6e4e1e,0 8px var(--shade),inset 0 4px #e8c26a,inset 0 -4px #9c7228; transition:transform .1s steps(2); }
    .lb-entry:active { transform:translateY(4px) scale(.96); box-shadow:4px 0 #6e4e1e,-4px 0 #6e4e1e,0 -4px #6e4e1e,0 4px #6e4e1e,inset 0 4px #e8c26a,inset 0 -4px #9c7228; }
    .le-icon { position:relative; width:32px; height:32px; flex:none; }
    .le-icon img { width:100%; height:100%; image-rendering:pixelated; display:block; animation:le-bob 2.4s steps(4) infinite; }
    @keyframes le-bob { 50% { transform:translateY(-2px); } }
    .le-text { display:flex; flex-direction:column; align-items:flex-start; gap:7px; }
    .le-title { font-size:10px; }
    .le-time { display:flex; align-items:center; gap:4px; font-size:8px; color:#fff0c7; text-shadow:1px 1px #7a5a22; }
    .le-time img { width:10px; height:10px; image-rendering:pixelated; }
    .lb-entry.reward .le-title { animation:le-blink .8s steps(2) infinite; }
    @keyframes le-blink { 50% { color:#fff0a2; } }
    .lb-entry.offline > *:not(.le-offline) { opacity:.4; }
    .lb-entry.offline .le-icon img { animation:none; }
    .le-offline { position:absolute; left:50%; top:50%; width:24px; height:24px; transform:translate(-50%,-50%); image-rendering:pixelated; }
    @media (max-width:360px) { .menu-row { gap:12px; } .lb-entry { padding-inline:8px; gap:8px; } .menu-row .levels-button { padding-inline:14px; } }

    .hud { position:relative; }
    .lb-pill { position:absolute; right:25px; top:calc(100% + 8px); z-index:8; display:flex; align-items:center; gap:6px; padding:5px 10px 5px 6px; background:#fff3d3; color:#6b4a1f; font:400 12px/1 var(--px-font);
      box-shadow:3px 0 #b98b3a,-3px 0 #b98b3a,0 3px #b98b3a,0 -3px #b98b3a,0 6px #0002; transform:translateX(calc(100% + 60px)); opacity:0; pointer-events:none; transition:transform .3s cubic-bezier(0,.83,.28,1),opacity .05s; }
    .lb-pill.show { transform:none; opacity:1; }
    .lb-pill img { width:22px; height:22px; image-rendering:pixelated; }
    .lb-comet { position:fixed; left:0; top:0; z-index:70; pointer-events:none; }
    .lb-comet i { display:block; width:22px; height:22px; margin:-11px 0 0 -11px; background:url("${STAR}") center/contain no-repeat; image-rendering:pixelated; filter:drop-shadow(0 0 3px #ffe58a); }
    .lb-comet.tail i { background:#ffd35a; width:10px; height:10px; margin:-5px 0 0 -5px; filter:none; opacity:calc(.8 - var(--k) * .2); transform:scale(calc(1 - var(--k) * .2)); }
    .lb-px { position:fixed; left:0; top:0; z-index:70; width:6px; height:6px; margin:-3px 0 0 -3px; pointer-events:none; }
    .lb-fx { position:fixed; inset:0; z-index:5; pointer-events:none; }
    .lb-fx .lb-px { position:absolute; }
    .lb-flystar { position:absolute; left:-14px; top:-14px; width:28px; height:28px; background:center/contain no-repeat; image-rendering:pixelated; }
    .lb-arrow { position:absolute; left:-5px; top:0; width:10px; height:12px; background:#ffeb33; clip-path:polygon(50% 0,100% 50%,70% 50%,70% 100%,30% 100%,30% 50%,0 50%); }
    .lb-flycopy { position:absolute; z-index:6; transform-origin:center; }

    .lb-screen { position:fixed; inset:0; z-index:45; display:flex; justify-content:center; font:400 11px/1.6 var(--px-font); color:var(--ink); }
    .lb-in { position:relative; width:min(100%,480px); height:100%; display:flex; flex-direction:column; align-items:stretch; padding:max(18px,env(safe-area-inset-top)) 0 max(18px,env(safe-area-inset-bottom)); }
    .lb-table { background:#d1c29d; }
    .lb-table .lb-in { background-color:#e8dcbd; background-image:linear-gradient(45deg,#d4c39b33 25%,transparent 25%,transparent 75%,#d4c39b33 75%),linear-gradient(45deg,#d4c39b33 25%,transparent 25%,transparent 75%,#d4c39b33 75%); background-size:32px 32px; background-position:0 0,16px 16px; border-inline:4px solid #b29c70; animation:lb-pattern 60s linear infinite; }
    @keyframes lb-pattern { to { background-position:32px 32px,48px 48px; } }
    .lb-top { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:0 22px; }
    .lb-top h2 { margin:0; padding:10px 14px 8px; font-size:15px; font-weight:400; color:#fff0c7; background:#bb714e; text-shadow:2px 2px #87492f; box-shadow:4px 0 #73482f,-4px 0 #73482f,0 -4px #73482f,0 4px #73482f,0 8px #ac946a,inset 0 3px #df9b68; }
    .lb-top .icon-btn span { font-size:14px; line-height:1; }
    .lb-timer { align-self:center; display:flex; align-items:center; gap:7px; margin:18px 0 6px; padding:6px 10px 5px 7px; background:#e2cf9e; color:#725532; font-size:10px; box-shadow:3px 0 #c7ae78,-3px 0 #c7ae78,0 -3px #c7ae78,0 3px #c7ae78; }
    .lb-timer img { width:14px; height:14px; image-rendering:pixelated; }
    .lb-podium { display:grid; grid-template-columns:1fr 1.12fr 1fr; align-items:end; gap:8px; padding:30px 26px 0; }
    .lb-pod { position:relative; display:flex; flex-direction:column; align-items:center; min-width:0; }
    .lb-seat { display:flex; flex-direction:column; align-items:center; gap:6px; max-width:100%; margin-bottom:10px; }
    .lb-seat.empty { height:96px; }
    .lb-pname { max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:400; font-size:8px; color:#5b4630; margin-top:4px; }
    .lb-seat.me .lb-pname { color:#c55c3c; }
    .lb-block { position:relative; width:100%; display:grid; place-items:center; overflow:hidden; color:#fff4d4; font-size:18px; text-shadow:2px 2px #0003; }
    .lb-block > span { position:relative; z-index:1; }
    .p1 .lb-block { height:74px; background:#d9a441; box-shadow:4px 0 #8a6526,-4px 0 #8a6526,0 -4px #8a6526,inset 0 5px #f3d27a; }
    .p2 .lb-block { height:56px; background:#b8b3a2; box-shadow:4px 0 #6f6a5c,-4px 0 #6f6a5c,0 -4px #6f6a5c,inset 0 5px #dcd8cb; }
    .p3 .lb-block { height:42px; background:#c27a45; box-shadow:4px 0 #7c4826,-4px 0 #7c4826,0 -4px #7c4826,inset 0 5px #e3a06c; }
    .lb-minichest { position:absolute; right:4px; bottom:4px; width:26px; height:26px; image-rendering:pixelated; }
    .lb-block.sweep::after { content:""; position:absolute; inset:0; background:linear-gradient(transparent,#fff9 45%,#fff9 55%,transparent); animation:lb-sweep .45s ease-out forwards; }
    .p1 .lb-block.sweep { animation:lb-tint-1 .9s; } .p2 .lb-block.sweep { animation:lb-tint-2 .9s; } .p3 .lb-block.sweep { animation:lb-tint-3 .9s; }
    @keyframes lb-sweep { from { transform:translateY(100%); } to { transform:translateY(-100%); } }
    @keyframes lb-tint-1 { 40% { background-color:#ffe066; } } @keyframes lb-tint-2 { 40% { background-color:#cfe3f0; } } @keyframes lb-tint-3 { 40% { background-color:#ff9a7a; } }
    .lb-score { display:inline-flex; align-items:center; gap:4px; min-width:58px; padding:4px 8px 3px 4px; background:#e9d3a0; color:#6b4a1f; font-size:10px; box-shadow:2px 0 #c6a96f,-2px 0 #c6a96f,0 2px #c6a96f,0 -2px #c6a96f; }
    .lb-score img { width:16px; height:16px; image-rendering:pixelated; }
    .lb-score b { font-weight:400; }
    .lb-score.sm { min-width:0; font-size:9px; }
    .lb-listwrap { position:relative; flex:1; min-height:0; margin:14px 0 0; }
    .lb-list { height:100%; overflow-y:auto; overscroll-behavior:contain; display:flex; flex-direction:column; gap:10px; padding:6px 22px 14px; scrollbar-width:none; }
    .lb-list::-webkit-scrollbar { display:none; }
    .lb-row { display:flex; align-items:center; gap:10px; flex:none; height:56px; padding:0 10px 0 6px; background:#f6e8c4; color:#935a5a; box-shadow:3px 0 #b39b6b,-3px 0 #b39b6b,0 3px #b39b6b,0 -3px #b39b6b; transform-origin:center; }
    .lb-row.me { background:#ffe2a0; color:#c55c3c; box-shadow:3px 0 #b66240,-3px 0 #b66240,0 3px #b66240,0 -3px #b66240; }
    .lb-rank { width:34px; flex:none; display:grid; place-items:center; font-size:11px; }
    .lb-medal { width:30px; height:30px; object-fit:contain; image-rendering:pixelated; }
    .lb-medal.ph { display:grid; place-items:center; color:#fff4d4; font:400 11px/1 var(--px-font); text-shadow:1px 1px #0004; background:var(--m); box-shadow:2px 0 var(--me),-2px 0 var(--me),0 2px var(--me),0 -2px var(--me),inset 0 3px #fff5; }
    .lb-medal.m1 { --m:#e3b04b; --me:#8a6526; } .lb-medal.m2 { --m:#b8b3a2; --me:#6f6a5c; } .lb-medal.m3 { --m:#c27a45; --me:#7c4826; }
    .lb-who { flex:1; min-width:0; display:flex; flex-direction:column; gap:6px; }
    .lb-who b { font-weight:400; font-size:10px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .lb-who i { font-style:normal; font-size:7px; line-height:1; color:#b08a5c; }
    .lb-who i.on { color:#5f8a3a; }
    .lb-sticky { position:absolute; left:22px; right:22px; z-index:2; pointer-events:none; }
    .lb-sticky[data-edge="top"] { top:6px; } .lb-sticky[data-edge="bottom"] { bottom:14px; }
    .lb-sticky .lb-row { box-shadow:3px 0 #b66240,-3px 0 #b66240,0 3px #b66240,0 -3px #b66240,0 9px #51432f40; }
    .lb-sticky[data-edge="top"] .lb-row { box-shadow:3px 0 #b66240,-3px 0 #b66240,0 3px #b66240,0 -3px #b66240,0 -9px #51432f40; }
    .lb-cta-wrap { padding:16px 40px 6px; }
    .lb-cta { width:100%; }
    .lb-like { flex:none; display:flex; flex-direction:column; align-items:center; gap:2px; width:34px; padding:2px 0; border:0; background:none; color:#935a5a; font:400 7px/1 var(--px-font); cursor:pointer; }
    .lb-like img { width:20px; height:20px; image-rendering:pixelated; }
    .lb-like em { font-style:normal; }

    .lb-climb { background:#1b150ed9; color:#fff0c7; cursor:default; }
    .lb-climb .lb-in { padding-top:max(26px,env(safe-area-inset-top)); }
    .lb-ctitle { align-self:center; margin:0; font-size:17px; font-weight:400; color:#fff0c7; text-shadow:3px 3px #87492f; }
    .lb-climb .lb-timer { margin-top:14px; }
    .lb-climb .lb-pname { color:#fff0c7; }
    .lb-climb .lb-seat.me .lb-pname { color:#ffd27a; }
    .lb-climb .lb-podium { padding-top:36px; }
    .lb-view { position:relative; height:${ROW_H * 4.5}px; margin:14px 16px 0; overflow:hidden; }
    .lb-view.free { overflow-y:auto; scrollbar-width:none; }
    .lb-view.free::-webkit-scrollbar { display:none; }
    .lb-track { position:relative; will-change:transform; }
    .lb-track .lb-row { position:absolute; left:10px; right:10px; }
    .lb-track .lb-row.me { z-index:3; }
    .lb-row.lb-glow { box-shadow:3px 0 #ffeb33,-3px 0 #ffeb33,0 3px #ffeb33,0 -3px #ffeb33,0 0 22px #ffeb33aa; background:#fff1b8; }
    .lb-band { align-self:center; margin:14px 20px 0; padding:9px 14px 8px; background:#78934f; color:#fff5d2; font-size:9px; line-height:1.8; text-align:center; text-shadow:1px 1px #48622f; box-shadow:3px 0 #405630,-3px 0 #405630,0 3px #405630,0 -3px #405630; }
    .lb-tap { align-self:center; margin:auto 0 8px; padding-top:14px; color:#fff0c7; font-size:10px; animation:lb-tap 1.1s steps(2) infinite; }
    @keyframes lb-tap { 50% { opacity:.45; } }
    .lb-barrage { position:relative; flex:none; height:${3 * 30}px; margin-top:16px; overflow:hidden; pointer-events:none; }
    .lb-bullet { position:absolute; left:0; display:flex; align-items:center; gap:6px; white-space:nowrap; padding:3px 8px 3px 3px; background:#fff3d3e6; color:#6b4a1f; font-size:8px; box-shadow:2px 0 #b98b3a,-2px 0 #b98b3a,0 2px #b98b3a,0 -2px #b98b3a; }
    .lb-bullet > img { width:12px; height:12px; image-rendering:pixelated; }

    .lb-reward { background:#1b150ed9; color:#fff0c7; }
    .lb-reward .lb-in { justify-content:center; overflow:hidden; }
    .lb-rtext { margin:0 24px 6px; text-align:center; font-size:12px; line-height:1.8; color:#ffd27a; text-shadow:2px 2px #87492f; }
    .lb-rstage { position:relative; display:flex; flex-direction:column; align-items:center; min-height:360px; }
    .lb-rpod { position:relative; z-index:1; width:100%; }
    .lb-reward .lb-pname { color:#fff0c7; }
    .lb-rays { position:absolute; left:50%; top:46%; width:560px; height:560px; margin:-280px 0 0 -280px; background:repeating-conic-gradient(#ffe9a340 0 9deg,transparent 9deg 18deg); -webkit-mask:radial-gradient(#000 20%,transparent 66%); mask:radial-gradient(#000 20%,transparent 66%); animation:lb-spin 14s linear infinite; pointer-events:none; }
    @keyframes lb-spin { to { rotate:360deg; } }
    .lb-av img.silhouette { filter:brightness(0); }
    .lb-av img { transition:filter .15s; }
    .lb-chest { position:relative; z-index:2; margin-top:-6px; }
    .lb-chest img { display:block; width:170px; height:170px; object-fit:contain; image-rendering:pixelated; filter:drop-shadow(0 8px 0 #0005); }
    .lb-chest.idle img { animation:lb-idle 2.5s ease-in-out infinite; }
    @keyframes lb-idle { 0%,100% { transform:none; } 40% { transform:translateY(-6px) scale(1.02,.98); } 60% { transform:translateY(-6px) rotate(-2deg); } }
    .lb-items { position:relative; z-index:3; display:flex; justify-content:center; gap:22px; margin-top:-120px; padding:22px 24px 18px; background:#f1e2ba; color:#735137; box-shadow:5px 0 #6c5535,-5px 0 #6c5535,0 -5px #6c5535,0 5px #6c5535,0 12px #392e2380; }
    .lb-item { display:flex; flex-direction:column; align-items:center; gap:12px; font-size:9px; }
    .lb-item > img { width:56px; height:56px; image-rendering:pixelated; }
    .lb-item b { font-weight:400; }
    .lb-ractions { display:flex; flex-direction:column; gap:16px; padding:20px 50px 0; min-height:70px; }

    .lb-modal { z-index:55; }
    .lb-modal.open .modal-card { animation:lb-pop .3s cubic-bezier(.2,1.4,.4,1) both; }
    @keyframes lb-pop { 0% { transform:scale(.7); opacity:0; } 18% { opacity:1; } 33% { transform:scale(1.05); } 100% { transform:none; } }
    .lb-p { margin:0 0 18px; color:#80633e; font-size:9px; line-height:2; }
    .lb-p img { display:inline-block; width:16px; height:16px; vertical-align:-3px; image-rendering:pixelated; }
    .lb-join-art img { display:block; margin:0 auto 14px; max-width:100%; image-rendering:pixelated; }
    .lb-join-trophy { width:72px; height:72px; }
    .lb-join-timer { margin:0 auto 22px; width:max-content; }
    .lb-offline-icon { display:block; width:48px; height:48px; margin:0 auto 14px; image-rendering:pixelated; background:#8d7b5b; padding:6px; }
    .lb-how { max-width:360px; cursor:pointer; }
    .lb-steps { list-style:none; margin:0 0 14px; padding:0; display:grid; grid-template-columns:1fr 1fr; gap:18px 14px; counter-reset:step; }
    .lb-steps li { display:flex; flex-direction:column; align-items:center; gap:10px; padding:12px 6px 10px; background:#e3d1a5; box-shadow:2px 0 #c3a674,-2px 0 #c3a674,0 2px #c3a674,0 -2px #c3a674; counter-increment:step; position:relative; }
    .lb-steps li::before { content:counter(step); position:absolute; left:-6px; top:-8px; width:18px; height:18px; background:#bb714e; color:#fff0c7; font-size:9px; line-height:19px; }
    .lb-steps li:nth-child(odd)::after { content:"▶"; position:absolute; right:-14px; top:42%; color:#b48657; font-size:10px; }
    .lb-step-icon { display:grid; place-items:center; width:44px; height:44px; }
    .lb-step-icon img { width:40px; height:40px; image-rendering:pixelated; }
    .lb-steps p { margin:0; font-size:8px; line-height:1.8; color:#6c5535; text-align:center; }
    .lb-how-note { margin-bottom:6px; }
    .lb-tapclose { margin:0; font-size:7px; color:#9b8057; }
    .lb-prof { max-width:350px; }
    .lb-prof h2 { margin-bottom:22px; }
    .lb-prof-top { display:flex; flex-direction:column; align-items:center; gap:14px; margin-bottom:20px; }
    .lb-prof-preview { padding-top:8px; }
    .lb-prof-wins { display:flex; gap:12px; font-size:8px; color:#8a6526; min-height:8px; }
    .lb-nick { display:flex; flex-direction:column; align-items:stretch; gap:8px; margin:0 6px 20px; text-align:left; }
    .lb-nick span { font-size:8px; color:#9b8057; }
    .lb-nick input { width:100%; padding:11px 10px 9px; border:0; border-radius:0; background:#fff7de; color:#51432f; font:400 12px/1.2 var(--px-font); box-shadow:3px 0 #8f754b,-3px 0 #8f754b,0 3px #8f754b,0 -3px #8f754b,inset 0 3px #e9dcb7; outline:0; text-transform:uppercase; }
    .lb-nick input:focus { box-shadow:3px 0 #b66240,-3px 0 #b66240,0 3px #b66240,0 -3px #b66240,inset 0 3px #e9dcb7; }
    .lb-avgrid { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin:0 14px 24px; }
    .lb-avpick { position:relative; aspect-ratio:1; padding:0; border:0; background:#e9d6a8; cursor:pointer; box-shadow:3px 0 #8f754b,-3px 0 #8f754b,0 3px #8f754b,0 -3px #8f754b; }
    .lb-avpick img { display:block; width:100%; height:100%; object-fit:cover; }
    .lb-avpick.on { box-shadow:4px 0 #5f8a3a,-4px 0 #5f8a3a,0 4px #5f8a3a,0 -4px #5f8a3a,0 0 0 8px #a8bd6d; }
    .lb-avpick.on::after { content:"✓"; position:absolute; right:-10px; bottom:-10px; width:22px; height:22px; background:#78934f; color:#fff5d2; font:400 10px/23px var(--px-font); box-shadow:2px 0 #405630,-2px 0 #405630,0 2px #405630,0 -2px #405630; }
    .lb-prof [data-save]:disabled { opacity:.5; }
    .adm-lb { margin-top:10px; padding-top:8px; border-top:2px dashed #8d7b5b; }
    .adm-lb-state { color:#e9d9ae; min-height:3.4em; }
    @media (max-height:700px) { .lb-podium { padding-top:24px; } .lb-view { height:${ROW_H * 3.5}px; } .lb-timer { margin-top:12px; } .lb-rstage { min-height:320px; } }
    @media (prefers-reduced-motion:reduce) { .lb-table .lb-in, .lb-rays, .le-icon img, .lb-chest.idle img, .lb-tap { animation:none; } }`;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  window.PixhakuLB = { levelWon, beforeWinScreen, onNext, onHome, refresh, openTable, profilePopup, state: () => S, profile: () => P, _standings: () => standings() };
  refresh();
  if (activeScreen === "menu") onHome(); // the game's first showMenu ran before this file loaded
})();
