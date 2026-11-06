# Hidden Word

Mobile hidden-object word game: every letter of a phrase is hidden in a portrait scene. Tap a letter and it flies
into the first empty slot of the same character; fill the phrase to finish. Design: `docs/spec.md`.

## Run

```bash
python3 tools/serve.py        # http://localhost:8771 ; phone on the same Wi-Fi: http://<mac-ip>:8771
```
(from an agent: `clai ctl run hw-serve -- python3 tools/serve.py`). Hub entry: `Hidden Word/game/index.html`.

## Game screen

Top bar: `Level N` (+ hearts when on) left, `found/total` counter centred, ⚙ settings right. Phrase slots below it.
Bottom: 💡 hint centred, directly above a reserved banner-ad strip (full width × 50 px + bottom safe area; admin can
draw a grey 320×50 placeholder in it). The scene opens contain-fitted (1x = whole scene) into the space between the
phrase slots and the hint row; drag to pan, pinch / scroll to zoom 1x-4x; tap = press that moves < 7 px.
Settings (⚙): Hearts on/off (default off; 3 per level), sound, reset progress; in game also Main menu and Admin.
Admin (only place for debug controls): restart, reveal letters, solve, prev/next, level picker, banner placeholder.
Combo praise from the 3rd find in a chain (10 s window, a wrong tap breaks it), as in Waldo.
Progress: localStorage `hw_done` (finished level slugs; the next level = first level in levels.js order not done, all done = level 1, so reordering never shifts progress), `hw_settings`, `hw_admin_banner`.

## Letters: scene patch + glyph

Each letter has a **scene patch** (`file`, `x,y,w,h`: letter + rim/shadow + re-rendered scene) that fades out in place
on a find, and a **glyph** (`glyph`, `gx,gy,gw,gh`: only the letter object on real alpha) that flies to the slot and
is the hit-test shape: glyph alpha > 127 (holes inside O/A/D count) plus a finger tolerance of
max(14 px of a 1792-wide canvas, scaled to the level's canvas, 6 screen px), widened for small letters so the hit
area across the glyph's short side is at least 32 screen px (50 px letters at 1x); nearest glyph wins. Levels without
glyphs fall back to the patch for both. Max zoom is 4x, or more when needed to reach 1 screen px per canvas px; the
hint zooms until the letter is ~52 screen px. Small-letter test level:
`python3 tools/fake_level.py --slug small50_1536 --width 1536 --letter-px 50` (delete its assets folder afterwards).

## Levels

```bash
python3 tools/extract.py <level.psb> <slug> [--phrase "..."]   # -> game/assets/<slug>/
```
PSB from `../psb_level_creator`: `BG` + group `Letters` with layers `L<index>_<char>` (scene patch; index 0- or
1-based, phrase order without spaces) and optional hidden `L<index>_<char>_glyph` right above each. Phrase from
`--phrase` or `phrase` in `<stem>_level.json` / `level.json` next to the PSB; extraction fails if an index is
missing/duplicated or a character does not match. Output: `bg.jpg`, `L07_D.png` + `L07_D_glyph.png` per letter,
`thumb.jpg`, `manifest.json` (all boxes normalised to the canvas, `i` 0-based). Then add the slug to
`game/levels.js` (`HW_LEVELS` = player order; `HW_ADMIN_ONLY_LEVELS` = only in the admin picker, tag via
`HW_ADMIN_TAGS`). Next Level after the last level loops to level 1.
The Levels tab groups cards by `HW_LEVEL_INFO[slug] = {bg, provider, style}` (one section per
"bg · provider · style", in order of first appearance, play order inside; a level without info goes to "Diğer").
An `*_r2` rebuild replaces its old slug at the same position in `HW_LEVELS`; the old assets stay on disk.
Measured difficulty (admin only): extract.py copies level.json `difficulty` {plc label: easy|medium|hard} to each
letter as `diff` and `difficulty_source` to the manifest; Admin › Reveal outlines letters green/orange/red with a
legend, and the level picker shows the mix (e.g. `2/6/6 measured`, easy/medium/hard). Levels without it: plain glow.

`python3 tools/fake_level.py` builds a test level `cozy_porch_fake` (letters drawn on
`../psb_level_creator/lab/styles/cozy_porch.png`, patch + glyph layers, PSB in `levels/fake/`, then extract.py);
it is not in the game's level list.

## UI art

Astra's PNGs in `game/assets/ui/` (names + 9-slice insets in `docs/ASTRA_PROMPTS.md`); each one replaces its
placeholder CSS automatically when the file exists (`body.ui-<name>` rules at the end of `styles.css`).
