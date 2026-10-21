# Word Train — work split and contract

Turkish word-chain game. Every new word makes a two-word phrase with the previous one, and each found
word is coupled to a cute wooden toy train as a new wagon:

KİTAP → KAPAĞI (kitap kapağı) → TASARIMI (kapak tasarımı) → EKİBİ (tasarım ekibi) → TOPLANTISI → …

**Decision (user, 2026-10-21):** keep `core/demo.html` (four choices) and `v4/` (Ray Çiz); v1–v3 were deleted.
The train must match the user's picture: the word rides ON TOP of a wooden toy flatcar as chunky wooden
alphabet blocks, and the wooden locomotive is fully visible.

**First letter given (user, 2026-10-21):** the prompt is `prev.base + first letter of the answer` ("KİTAP + K…",
then "KAPAK + T…"); the ghost wagon's first block shows that letter; every distractor starts with the same
letter. **Train layout:** the track runs in horizontal rows like lines of text (boustrophedon) in the top ~45% of the
screen, joined by short U-turns (`design/user-sketch-train-path.jpeg`); wagons and letter blocks always stay
upright and horizontal, never rest on a turn; newest wagon on the bottom row just above the board. The previous word's wagon and the searched wagon are
always side by side on the bottom row, reading as the phrase ([KİTAP]=[K_____]); rows are tight. v4 board is a Word Master–style hex grid: 5 staggered columns × 4 = 20 letters, 6-neighbour adjacency (`design/ref/word-master-hex.png`), now 5×6 = 30 letters.
**Suffix drop (user, v4 focus):** as the train moves on, the found word drops its suffix (BAHÇESİ → BAHÇE,
KAPAĞI → KAPAK: dropped blocks fall, changed letters pop in) so the bottom pair always reads like the
start of the next phrase. The meaning hint is no longer on screen; the first hint press shows it. Train
animations keep their original pace but never block input: the next round starts instantly and the train
catches up in its own queue.
**Gravity refill (v4):** after a word only the used tiles leave; tiles above slide down their column and new
tiles drop in from the top. New letters are chosen so the next word always has a path (extra cell swaps or a
full reshuffle only as a fallback) — the board can never lock.
**No tell in fresh stones (user):** the fresh stones must not spell or hint the next word; its path lies mostly
in stones already on the board (the board carries the following word's letters one round ahead), fresh stones
are ordinary filler plus letters for the word after.

The open question was **how the player finds the next word**. We build 4 playable variants (v1–v4), each
with a different finding mechanic, on one shared core, levels and art, so the user can compare them.

Vanilla HTML/CSS/JS, no build step, ES modules, relative paths (must run standalone and inside the hub at
`quest_projects/index.html`). Portrait mobile first (390×844), touch and mouse via Pointer Events.
Turkish text everywhere in the UI. Use `toLocaleUpperCase('tr-TR')` / `toLocaleLowerCase('tr-TR')` (İ/ı!).
Run: `cd word_train && python3 -m http.server 8000`. Logic tests: `node --test tests/`.
Reference for style and quality: `../Word Branch/` (same team, similar game).
Git: the repo is on someone else's branch with unrelated changes. Never commit, stash, checkout or reset;
the orchestrator commits at the end.

Ledger topic: `wordtrain`. `clai ctl ledger --topic wordtrain add CLAIM "<files>"` before editing,
`DONE "<what>"` when finished, `NEED "<what>"` when blocked. Do not edit files you do not own; if you need a
change in someone else's file, `clai ctl send` the owner (or the orchestrator, `Word Train:0`).

| Owner | Model | Files |
|---|---|---|
| astra-mech | GPT 6 Astra, high | `design/mechanics.md` |
| astra-art | GPT 6 Astra, high | `design/visual.md`, `assets/*`, `core/theme.css` |
| astra-levels | GPT 6 Astra, high | `levels.js`, `design/levels.md`, `tests/levels.test.js` |
| opus-core | Opus 5.5, high | `core/logic.js`, `core/train.js`, `core/train.css`, `core/sfx.js`, `core/admin.js`, `core/haptics.js`, `core/demo.html`, `tests/*` (except `levels.test.js`) |
| opus-v4 | Opus 5.5, high | `v4/*`, `tests/v4-board.test.js` |
| orchestrator | Opus 5.5 | `CONTRACT.md`, `game.json`, `index.html` (variant picker), integration, review |

## Mobile game, not a web page (user requirement)
This is a mobile game. Full-screen `100dvh` portrait screen with no page scroll and no web-page hero, headline
or marketing copy; a compact top HUD (level, progress, settings/admin) and thumb-reachable controls at the
bottom; safe-area insets; touch targets ≥ 48 px; no hover-only states; no double-tap zoom
(`touch-action: manipulation`); short haptic feedback via `core/haptics.js`. **No free typing mechanic**:
the user does not want a version where the player just types the word.

## Admin panel
Like `../Word Branch/admin.js`: `core/admin.js` (opus-core) exports `openAdmin({ levels, currentId, onJump })`, a
bottom sheet listing every level with its full chain (word, phrase, hint, distractors) and a jump button.
Every variant has one admin icon button in its HUD that opens it. **All test/debug buttons live inside this
admin popup, never on the game screen**: level jump, solve current word, skip to level end, reset progress,
re-seed/shuffle, reveal answer, plus variant-specific test actions. API:
`openAdmin({ levels, currentId, onJump, actions: [{ label, run }] })` — `actions` are the variant's test buttons.

## levels.js (astra-levels)
```js
export const LEVELS = [
  { id: 1, title: 'Ofis', chain: [
      { word: 'KİTAP', base: 'KİTAP' },
      { word: 'KAPAĞI', base: 'KAPAK', phrase: 'kitap kapağı', hint: 'Kitabın en dış yüzü',
        distractors: ['SAYFASI', 'KAPISI', 'KABI'] },
      { word: 'TASARIMI', base: 'TASARIM', phrase: 'kapak tasarımı', hint: '…', distractors: [...] },
      // … 8–12 links per level
  ]},
];
```
- `word`: what goes on the wagon, uppercase Turkish, exactly as it appears in the phrase.
- `base`: the dictionary form used as the first word of the next phrase (`KAPAĞI` → `KAPAK`).
- `phrase` (all links but the first): `lower(prev.base) + ' ' + lower(word)`; must be a real, common phrase.
- `hint`: short Turkish clue for the phrase, without giving the word away.
- `distractors`: 3 uppercase words that look plausible after `prev.base` but are not the answer and do not
  form a better-known phrase than the answer (mechanics with choices use them).
- No word repeated inside a level. At least 12 levels, easy → hard.

## core (opus-core)
`core/logic.js` — pure, no DOM, deterministic with a seed:
```js
export function trUpper(s), trLower(s), normalize(s)        // Turkish-safe; normalize trims + upper
export function createRun(level, { seed } = {})             // -> state
export function current(state)                             // -> { prev, target, index, total } | null when done
export function answer(state, guess)                       // -> { state, result: { ok, word, phrase, done } }
export function useHint(state, kind)                       // -> { state, reveal } ; kinds: 'letter' | 'clue'
export function rng(seed)                                   // mulberry32-style () => [0,1)
export function shuffle(arr, rand), letterPool(word, extra, rand), choices(link, rand)
```
State: `{ levelId, chain, index, found: [word…], mistakes, hints, done }` (JSON-serialisable, never mutated).

`core/train.js` — the train view every variant uses:
```js
export function mountTrain(el, { words, onWagonTap } = {})  // locomotive + one wagon per found word
  // returns { addWagon(word, { phrase }), setGhost(text|null), shake(), celebrate(), scrollToEnd(), destroy() }
```
Wagons hold their word in big letters; the train scrolls horizontally so the newest wagon and the empty
"ghost" slot (the word being searched) are visible; coupling/arrival animation when a wagon is added.
Uses `assets/` and `core/theme.css` from astra-art; placeholder CSS until they land.

## variants (opus-v1 … opus-v4)
Each `vN/index.html` imports `../levels.js`, `../core/*`, `../core/theme.css`, implements the mechanic from
`design/mechanics.md` section N, has level select / next level / restart / hint, and saves progress in
`localStorage` under `wordtrain.vN.*` (wrapped in try/catch).
