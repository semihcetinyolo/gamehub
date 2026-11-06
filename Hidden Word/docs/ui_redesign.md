# Hidden Word UI + main menu redesign (user, 2026-11-06)

User: "oyunun levelları ile uyumlu bir ui ve ana menü tasarımı yaptır astraya" - Astra designs a UI and main menu that
fit the game's levels. Plus three explicit main-menu changes:
1. Remove the row of small boxes on the main menu (one box per level).
2. The PLAY button is GREEN.
3. "Level N" is NOT inside the PLAY button any more: it gets its own separate box/badge on the main menu.

## Context
- Game: Hidden Word/game (index.html, game.js, styles.css). UI art: game/assets/ui/*.png, masters in docs/ui_masters,
  sources in docs/ui_src, prompts in docs/ASTRA_PROMPTS.md (Astra made the first UI the same way).
- Levels (look at them: game/assets/<slug>/thumb.jpg, bg.jpg): mostly illustrated, warm storybook watercolor and
  bright cartoon, plus gouache, claymation, folk vector, papercut, stained glass, pixel art, soft 3D. The user's
  favourites: upon_storybook_attic (watercolor storybook) and home_cartoon_garden (cartoon). The UI must feel like
  the same world as these levels (illustrated, warm, crafted), but stay readable and must not compete with the scene.
- House rules: mobile portrait game, not a web page; compact HUD, thumb-zone controls, no slogans/hero copy; a 50 px
  banner strip at the bottom of the gameplay screen stays reserved (hint button sits just above it); settings top-right
  in game, "Level N" top-left, found/total counter top-centre, hint centre-bottom. No level locks (every level playable).
  All test/debug controls only in the admin popup.

## Deliverables (astra-ui)
1. Look at the current game (http://192.168.68.88:8771, or open the files) and the level art.
2. Wireframe/mockup images for: main menu, gameplay HUD, level list (Levels tab, grouped), win/"Perfect" screen,
   settings popup. Phone portrait 1170x2532. 2 directions for the main menu; recommend one.
3. Final UI art as PNGs (logo, buttons incl. the green PLAY, level badge box, panels, slots, icons, ribbons) with
   transparent backgrounds where needed, into docs/ui_masters/v2/ and production sizes into game/assets/ui_v2/.
   Every prompt recorded in docs/ASTRA_PROMPTS.md (v2 section). Use `clai image --model gpt ...`.
4. A short handoff note docs/ui_v2_handoff.md: which file goes where, sizes, 9-slice insets, colours (hex), fonts.
Do not edit game code: opus-game implements. Report to "Hidden Words:1" with the mockup paths when the mockups are
ready (before final assets), then again when final assets + handoff are done.
