# Word Branch — work split and contract

Vanilla HTML/CSS/JS, no build step, ES modules, relative paths (the game must run both standalone
and inside the hub). Portrait mobile first (390×844), touch and mouse via Pointer Events.
Run: `cd "Word Branch" && python3 -m http.server 8000`. Logic tests: `node --test tests/`.

Ledger topic: `wordbranch`. CLAIM before editing, DONE when finished. Do not edit files you do not own;
if you need a change in someone else's file, `clai ctl send` the owner (or the orchestrator).

| Owner | Files |
|---|---|
| Astra (Codex, GPT 6 Astra) | `logic.js`, `levels.js`, `tests/*` |
| Claude worker | `index.html`, `style.css`, `game.js` |
| Orchestrator | `CONTRACT.md`, `game.json`, integration, review |

## Game in one line
Start at the fixed root in the wheel centre → drag across ring parts → release → if root + parts equals a
visible target word, its row fills, animates, disappears, rows slide up and the next queued target appears
at the bottom. The level ends when the queue is empty and every visible row is found.

## levels.js (Astra)
```js
export const LEVELS = [
  { id: 1, root: 'SNOW', words: [
      { word: 'SNOWBALL',   parts: ['BA', 'LL'] },
      { word: 'SNOWFLAKE',  parts: ['FL', 'AKE'] },
      { word: 'SNOWBLOWER', parts: ['BL', 'OW', 'ER'] },
      { word: 'SNOWFALL',   parts: ['FA', 'LL'] },   // second LL: a separate node
      // ...
  ]},
  // at least 3 levels, 8–14 real English compound words each, uppercase, authored parts of 1–3 letters
];
```
Rule: `root + parts.join('') === word` for every word (validated by `validateLevel`).

## logic.js (Astra) — pure, no DOM, deterministic with a seed
```js
export const DEFAULTS = { visibleRows: 4, wheelSlots: 7 };
export function validateLevel(level, opts) // throws a readable Error; wheelSlots >= max parts of any word
export function createGame(level, { visibleRows, wheelSlots, seed } = {}) // -> state
export function submit(state, nodeIds)      // -> { state, result } ; never mutates the input state
export function findSolutions(state)        // -> [{ rowId, nodeIds }] for visible unfound rows (hint/tests)
export function wordOf(state, nodeIds)      // -> root + texts of those nodes in order (live preview)
```
State shape (plain JSON-serialisable objects):
```js
{
  root: 'SNOW',
  rows:  [{ id: 'r3', word: 'SNOWBLOWER', suffixLength: 6 }],  // visible, top to bottom, at most visibleRows
  queue: ['SNOWDRIFT', ...],                                    // targets not yet shown, in order
  wheel: [{ id: 'n12', text: 'BL' } | null, ...],               // length === wheelSlots; index = fixed slot
  found: ['SNOWBALL', ...],
  total: 12,
  done: false,
}
```
- Node ids and row ids are unique for the whole game and never reused (two `LL` nodes have different ids).
- A node keeps its slot index until it is used; new nodes go into empty (`null`) slots. The UI places slot i
  at angle `i / wheelSlots` around the circle, so nothing moves except removed/added nodes.
- `submit` result: `{ ok: true, word, rowId, usedNodeIds, addedNodeIds, addedRowId|null }` or
  `{ ok: false, reason: 'not-a-target' | 'too-short' | 'duplicate-node' | 'unknown-node' }`.
  Wrong answers return the same state (nothing removed). The word is checked as a string, so any choice
  of nodes that spells a visible target counts, even if it differs from the authored split.
- On a correct word: remove used nodes, remove the row, append the next queued target (if any), then refill.
- **Solvability invariant**, checked after `createGame` and after every correct `submit`, unless `done`:
  at least one visible row can be spelled as root + distinct wheel nodes. Refill must guarantee it: fill
  empty slots first with authored parts of visible rows (top row first), then upcoming queue words as
  natural decoys; if the invariant still fails (e.g. the player used another word's part), evict nodes
  that no visible row needs and put the missing parts in. Prefer keeping several rows solvable. Never more
  than `wheelSlots` nodes; near the end the wheel may have empty slots.
- Tests must play every level to completion with many seeds, assert the invariant after every step, try
  alternate splits / wrong answers / duplicate texts, and check ids are never reused.

## index.html / style.css / game.js (Claude worker)
- `game.js` imports `logic.js` and `levels.js`. Config via URL: `?level=1&rows=4&slots=7&seed=123`
  (defaults from `DEFAULTS`), and a `CONFIG` object at the top of `game.js`.
- **Top:** numbered rows `1. S N O W _ _ _ _`. Root letters shown, one blank tile per suffix letter; part
  boundaries are never visible. Row count capped by `visibleRows`, not by level size.
- **Found word:** blanks fill with letters (short stagger), success animation on the row, row fades out,
  remaining rows slide up, the new row's blanks appear at the bottom. No new row when the queue is empty.
  Level complete screen after the last word (next level / replay).
- **Bottom wheel:** large fixed root node in the centre, ring nodes at fixed slot angles, comfortable touch
  targets (≥ 56px, generous hit radius, no overlaps for 7–8 slots on a 360px wide screen).
- **Input:** a drag must start on the centre root. Moving over a ring node selects it; a node cannot be
  selected twice; dragging back onto the previous node (or the root, when one node is selected) undoes the
  last selection. A line connects selected nodes and follows the finger. Selected nodes are highlighted.
  The live word (`SNOW`, `SNOWBL`, `SNOWBLOW`, ...) shows just above the wheel. Releasing the pointer
  submits automatically — no CHECK button. Wrong: short shake/red flash, selection clears, nodes stay.
  The wheel layout never changes during a drag; used nodes animate out and new ones pop in only after a
  correct submit.
- Prevent page scroll/zoom/text selection while dragging (`touch-action: none`).

## Clarifications (agreed with Astra)
- `state._meta`: one opaque, JSON-serialisable object (authored parts, options, RNG state, id counters). The UI never reads it.
- Eviction: choose the top-most visible row with the fewest missing parts, keep its required multiset, evict surplus
  nodes preferring texts no visible row uses, then texts only lower rows use.

## Admin panel (added)
`admin.js` (Astra): self-contained ES module, injects its own CSS (pattern: `../4_color_sort/admin.js`), bottom sheet over
the game, works at 390×844 with touch. `export function openAdmin({ levels, currentIndex, rows, slots, seed, apply })`
where `apply({ levelIndex, rows, slots, seed })` is provided by game.js and restarts the game with those settings and keeps
them in the URL. Panel: every level as a tappable card (number, root, word count, current one marked, tap = jump),
expandable word list per level with authored splits (for testing), rows / slots steppers within valid limits
(slots >= max parts of any word in the chosen level; use validateLevel), seed field + "new seed", Apply / Restart, close.
UI worker: a gear button in the top bar that lazy-imports `admin.js` and calls `openAdmin`; implement `apply`.

## Languages (added): English + Turkish
- `levels-tr.js` (astra-levels, Word Branch:4): `export const LEVELS = [...]` — 12 Turkish levels, same shape and rules as
  levels.js. Real, common Turkish words starting with the root (compounds or root + suffix: KİTAPLIK, GÜNEŞ, KARTOPU...),
  written in Turkish uppercase (İ, I, Ş, Ğ, Ü, Ö, Ç — never `toUpperCase()` without the 'tr' locale), parts of 1–3 letters,
  max 3 parts, gentle difficulty curve, no proper nouns or offensive words.
- `levels.js` (astra-levels) additionally exports `LEVEL_SETS = { en: LEVELS, tr: <LEVELS from levels-tr.js> }`.
  `LEVELS` stays the English set.
- `logic.js` (Astra, Word Branch:1): validation must accept the Turkish uppercase alphabet (A–Z plus ÇĞİÖŞÜ); no other
  behaviour change. Tests cover every set in LEVEL_SETS.
- UI (Claude worker, Word Branch:2): a player-facing Settings sheet (separate from the admin gear) with a language choice
  English / Türkçe. Choice is kept in the URL (`lang=en|tr`) and remembered in localStorage (wrapped in try/catch);
  switching language starts level 1 of that set. All UI strings (Level, Words, hint, praise words, Level complete,
  buttons, Settings) are translated. Admin panel receives the current language's levels. Tiles must render İ/Ş/Ğ etc.

## Visual theme (changed)
No snow/winter theme. One general, level-independent look (works for any root, any language): neutral, warm/modern
word-game palette, no snowfall background, no snowflake icons or snowflake particles (use generic sparkles/confetti/stars).
All colours stay CSS variables on :root in style.css. admin.js reads those same variables (`var(--...)` with fallbacks)
instead of its own snowy palette, so the panel always matches the game.

## Turkish word rules (tightened after review)
- Dictionary headwords only (as in TDK Güncel Türkçe Sözlük): no case, possessive or plural inflections
  (no -LAR/-LER, -IM, -IN, -DA, -DAN, -I; no participles like -MIŞ).
- Verbs: at most a few per level, and never both the -MA and -MAK form of the same verb.
- Prefer variety over suffix chains: real compounds and words whose rest is not a suffix are welcome
  (GÜNEŞ, GÜNEY, GÜNAYDIN, BAŞKENT, KARTOPU, KARTAL, DENİZALTI...). Parts are letter chunks of 1–3 letters,
  they do not have to be morphemes. Avoid many words in one level ending in the same suffix.

## Version 2 (click mode) and Shuffle (added)
Settings gets a "Version" choice: V1 (wheel, current) / V2 (click). Kept in URL (`mode=v1|v2`) and localStorage.
Both versions use the same logic, rows, counter, hint, effects, admin and languages; only the input surface differs.

### logic.js (Astra): `shuffleWheel(state) -> state`
Pure, deterministic (uses the RNG in `_meta`), returns a new state where the existing nodes (and empty slots) are
permuted among slot indexes; same node ids/texts, never identical order when 2+ nodes exist; rows/queue untouched;
invariant unaffected. Tests included.

### v2.js + v2.css (new Claude worker "claude-v2", Word Branch:6) — click board component
```js
export function createClickBoard(container, {
  root,                    // e.g. 'SNOW'
  getTargets,              // () => visible unfound row words, e.g. ['SNOWBALL', ...]
  onLive(word),            // live word changed (root + selected texts); game.js shows it in #live
  onSubmit(nodeIds),       // built word equals a target -> game.js runs logic.submit + effects; returns result
  onWrong(nodeIds),        // built word is no longer a prefix of any target -> game.js shows wrong feedback
  t,                       // (key) => translated string
}) -> {
  setNodes(wheel, { removedIds = [], addedIds = [] } = {}),  // wheel = state.wheel (slot order = on-screen order, nulls skipped)
  clear(), setEnabled(bool), showHint(nodeIds), destroy()
}
```
Behaviour: a fixed root chip ("SNOW") sits at the start of a build bar above the tiles; the tiles (parts) are laid out
below in a tidy grid in slot order, big touch targets (≥ 56px tall), wraps for 3–8 tiles at 360px width. Tap a tile =
append it (it becomes visibly "used" and cannot be tapped again); tap the last chosen tile again or a backspace button =
undo; a clear button. Auto-check, no CHECK button: exact match with a target -> onSubmit; dead end (no target starts
with the built word) -> onWrong, short shake, selection clears, tiles stay. Removed tiles animate out, added tiles pop in;
shuffle (a new slot order passed via setNodes) animates tiles moving to their new positions (FLIP). Hint: badges 1,2,3 on
the tiles in order + gentle pulse until the next tap. Uses the game's CSS variables; no snow theme.

### Claude UI worker (Word Branch:2)
Settings: V1/V2 choice; in V2 mount `createClickBoard` in place of the wheel and route submit/effects/hint through it.
Shuffle button in both versions (near the wheel / tile area, icon + accessible label): disabled mid-drag/mid-animation,
calls `shuffleWheel`, then V1 animates nodes gliding to their new slot positions, V2 calls `setNodes`.

## Refill quality (added after user feedback)
Problem: after a correct word, the newly added nodes on their own spell a visible target (e.g. BA + LL arrive together
-> SNOWBALL), so the player just traces the new tiles. Refill rules, in priority order:
1. Solvability invariant (unchanged, always).
2. Hard rule whenever the invariant still holds: no visible target can be spelled using only the nodes added in this
   refill (`addedNodeIds`). Split a word's parts across refills instead: keep partial words on the wheel and let new
   nodes complete words whose other parts are already there.
3. Soft: every solvable target should need at least one node that survived from before the submit; prefer wheels where
   2+ rows are partially present so each refill finishes one and seeds another.
4. Initial wheel: no single target may be spelled only from nodes in adjacent slots in order; parts of one word are
   spread around the wheel.
Report in tests how often rule 2 had to be broken (should be ~0; only when unavoidable, e.g. last word of the level).
- Content rule (added): every word has at least 2 parts (suffix of 2+ letters), so no target is a single tile.
- Adjacency in rule 4 means either direction (clockwise or counter-clockwise).
- Prefer filling slots with partial parts of other rows / queued words over leaving them empty; empty only as last resort.

## Navy theme (user request) — owner: astra-levels (Word Branch:4) for this task
The light cream theme strains the eyes. New look: dark, elegant navy/midnight-blue palette ("şık ve klas"), comfortable
for long play, high but not harsh contrast. astra-levels temporarily owns the theme: the :root variables in style.css
and any colour values in v2.css (no layout/behaviour changes; game.js/v2.js untouched). Claude workers do not edit
style.css/v2.css until its DONE.

## Part length rule (user feedback: too many single-letter Turkish parts)
- Parts are 2–3 letters. Single-letter parts are an exception: at most 1 per level, never two in one word.
- So every word's suffix (after the root) is 4–9 letters (2–3 parts of 2–3 letters). Words with shorter suffixes are
  replaced, not split into letters (AYAK, AYNA, BALON, GÜNEŞ... go; choose roots/words with longer remainders).
- Applies to every level in both languages, including SNOW/SUN/RAIN, but keep the user's own examples
  (SNOWBALL BA+LL, SNOWFLAKE FL+AKE, SNOWBLOWER BL+OW+ER, SNOWFALL FA+LL).
- All previous Turkish rules stay (TDK headwords, no inflections, no -MA/-MAK pairs, natural tone, common words).

## Prefix-word trap + Turkish cleanup (user feedback)
- Trap: ELVERİŞLİ = EL+VE+RİŞ+Lİ; the player builds ELVERİŞ (a real word), it is not a target, so it is rejected.
  Rule: for every target, root + its first k authored parts (every k < all parts) must not be a real dictionary word,
  unless that word is also a target in the same level. Also check other easy spellings from the level's parts that
  give a real, common word that is not a target, and avoid them where possible. Both languages.
- Turkish: no -MA/-ME verbal nouns (ATLAMA, SULAMA, ANLAŞMA, GÜNCELLEME, İŞİTME ...) and no infinitives (SUSAMAK).
- Rare words are fine.

## Open (spaced) compounds allowed (user decision)
- Turkish (and English) targets may be compounds written as two words, e.g. YER ÇEKİMİ, GÖK TAŞI, as long as the root is
  the first word. Data: `{ word: 'YERÇEKİMİ', parts: ['ÇE','Kİ','Mİ'], open: true }` — `word` has no space; logic ignores
  `open`. TDK validity is checked in the spaced form.
- UI (rows, found-word fill, live word / V2 build bar): for `open` words show a visible word gap between the root and the
  rest (a wider gap between root tiles and the first blank; live word "YER ÇEKİMİ"). Rows must expose `open` — logic
  copies it into `state.rows[i].open`.
- User decision on the prefix trap: prefer keeping BOTH words as targets in the same level (ELVERİŞ and ELVERİŞLİ are
  asked separately). Replace a word only if its prefix word cannot satisfy the part rules (2+ parts of 2–3 letters).

## LEVEL CONTENT RULES — CURRENT (supersedes every earlier content note)
Concept: the centre root is a real word and every target genuinely branches from it in meaning.
1. Roots: real, meaningful words that productively form compounds/derived words (GÖZ, GÖK, DENİZ, BAŞ, KAR, AY, GÜN, SU,
   EL, YER, TAŞ, DEMİR, YOL, SES, DİL, ATEŞ, KUŞ, AĞAÇ ...). No coincidence roots (AR, ON, AS, AN, AL, AK used only as letter
   prefixes for ARKEOLOG, ONKOLOJİ, ASANSÖR, ALFABE, ANANAS ...).
2. Targets: meaning-linked to the root — closed compounds (KARTOPU), open compounds written as two words with the root first
   (YER ÇEKİMİ, `open: true`), or derivations of the root (GÖZLÜK, GÖZLÜKÇÜ). Not words that merely start with the same letters.
3. Prefix words: if root + first k parts of a target is a real, common word, keep BOTH as targets in the same level
   (ELVERİŞ and ELVERİŞLİ). Replace only if the shorter word cannot meet rule 4. Only words ordinary players know count
   (SNOWBLOW is NOT a word for this purpose; SNOWBLOWER stays BL+OW+ER without adding SNOWBLOW).
4. Parts: 2–3 letter natural syllables/chunks (vowel-bearing in Turkish); ≤1 single-letter part per level; 2–3 parts per word;
   remainder after the root 4–9 letters.
5. Turkish: TDK headwords (open compounds checked in spaced form); no inflections, no -MA/-ME verbal nouns, no infinitives;
   avoid grim words. Rare words are fine.
6. 12 levels per language, 8–12 targets each, gentle curve; English keeps SNOWBALL BA+LL, SNOWFLAKE FL+AKE,
   SNOWBLOWER BL+OW+ER, SNOWFALL FA+LL. English prefix words: FIREFIGHT/FIREFIGHTER style pairs may both be targets.

## Expansion (user: "use every level you have")
- Turkish (Word Branch:10, owns levels-tr.js + tests/levels-tr.test.mjs): append levels for DEMİR, YOL, SES, DİL, ATEŞ, AY,
  GÜN after the current 12 (every root that reaches 8 qualifying targets under the CURRENT rules).
- English (astra-en, Word Branch:4, owns levels.js + a new tests/levels-en.test.mjs): append BLACK, BLUE, GREEN, WHITE,
  WIND, NIGHT, DAY, PLAY, FRUIT, COFFEE, TEA, FLOWER, BIRTH, HEAT after the current 12 (open compounds use `open: true`).
- Existing levels keep their order and content. CURRENT content rules apply; slots 5..8 must validate; all tests pass.
