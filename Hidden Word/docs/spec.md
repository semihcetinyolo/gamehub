# Hidden Word — design spec (2026-11-05, approved in chat)

Mobile hidden-object word game. Every letter of a phrase is hidden in a portrait scene; the player finds them and the
phrase appears letter by letter. Levels come from `../psb_level_creator` (PSB: `BG` + group `Letters`, layers
`L<2-digit index>_<char>`).

Base code: `../Find The Cat/game` (board, pan/zoom, alpha hit-test, hint, admin popup) plus the menu / progress /
combo additions of `../Waldo/game`. Single-page HTML/JS/CSS, no build step, relative asset paths (hub-compatible).

## Rules of the house (user preferences, apply everywhere)

- Mobile game, not a web page: full-screen portrait, compact HUD, thumb-zone controls, no hero/slogan copy.
- Animations never block input: the next tap works immediately while animations run.
- Every test/debug control lives in the single admin popup (⚙), never on the game screen.

## Core loop

- The scene opens fitted to the screen width; drag to pan, pinch / scroll to zoom 1×–4×, tap = press that moves
  less than the drag threshold (all as in Find The Cat).
- Top of the screen: the phrase as **empty slots only** (the player does not know the phrase), word gaps kept, long
  phrases wrap to two lines; counter `found/total` next to it.
- Tap on a letter (pixel-accurate alpha hit-test on its layer): that letter's cut-out lifts off the scene and **flies
  into the first empty slot of the same character**; the scene shows clean BG where it was; in the slot it becomes a
  clean, readable glyph. Tapping a found spot again does nothing.
- Wrong tap: a small red ripple, no penalty by default.
- **Settings → Can (hearts)** on/off, default **off**. When on: 3 hearts, a wrong tap costs one, 0 → "Out of Hearts →
  Try Again". No timer is shown anywhere.
- All slots filled → the phrase glows → "Perfect" screen → Next Level.
- Combo (as in Waldo): finds in quick succession show praise; never blocks input.

## Hint (💡, unlimited, no ads)

Picks a remaining letter, pans/zooms to it and pulses it (Find The Cat), and also blinks its target slot in the phrase.

## Screens

- **Main menu:** logo, preview of the next level, PLAY, Levels.
- **Level list:** thumbnails; finished levels show their completed phrase.
- **Settings:** Can on/off, sound, reset progress.
- **Admin popup (⚙ in HUD):** restart, reveal all letters, solve level, next / previous level, level picker
  (to compare art styles).
- Progress in localStorage (`hw_level`, `hw_done`, `hw_settings`), every access in try/catch.

## Level data

`tools/extract.py <level.psb> <slug> [--phrase "..."]` → `game/assets/<slug>/`:
- `bg.jpg` (BG only, clean), `L07_D.png` per letter (cropped to its alpha bbox), `thumb.jpg`, `manifest.json`:
  ```json
  { "phrase": "YOUR DOOR IS ALWAYS OPEN", "style": "cozy_porch", "canvas": {"w": 1536, "h": 2048},
    "letters": [ {"i": 0, "ch": "Y", "file": "L00_Y.png", "x": 0.12, "y": 0.30, "w": 0.05, "h": 0.06, "z": 3} ] }
  ```
  `x,y,w,h` normalised 0–1 of the canvas (Find The Cat convention); `i` = index in the phrase without spaces.
- Phrase source: `--phrase`, else `phrase` in the `level.json` next to the PSB. Extraction fails loudly if the layer
  indices/characters do not match the phrase exactly (every index once, right character).
- Level order lives in `game/levels.js` (list of slugs).
- Until real levels exist, `tools/fake_level.py` makes a test level from a lab background
  (`../psb_level_creator/lab/styles/*.png`) by drawing letters onto it as separate layers, same manifest shape.

## Art direction

Astra produces the UI art (HUD, phrase slots, buttons, "Perfect" ribbon, menu, logo, icons) and wireframes, the way
Waldo did (`../Waldo/game/assets/ASTRA_PROMPTS.md`, `assets/wireframes/`). The UI must not compete with the scene:
the scene art style changes per level (stained glass, photo-real, cartoon...), so the UI stays neutral and soft.

## Testing

Desktop browser plus a phone on the same Wi-Fi (`tools/serve.py`, like Waldo). Check: taps on letters vs near-misses,
duplicate letters fill the right slots, fly animation does not block taps, hearts toggle, hint, progress survives a
reload, hub entry works.
