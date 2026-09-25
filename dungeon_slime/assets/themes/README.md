# Level art

Generated with the built-in `image_gen` tool. The complete production prompts are in `prompts.json`; the final Ember mascot was corrected to cyan in a second image edit.

Runtime assets:
- `garden-atlas.webp` — pink stone, amethyst hazards, purple jelly.
- `moon-atlas.webp` — slate stone, violet steel spikes, indigo jelly.
- `ember-atlas.webp` — volcanic stone, lava hazards, cyan water jelly.
- `toxic-atlas.webp` — sage floor, teal stone and lime poison walls. Its prompt is in `../animation/prompts.json`.

Each 1536×1024 atlas has a 3×2 layout: floor / wall / hazard on the first row; faceless jelly body / map mascot / decorative ornament on the second row. Source PNGs are retained in `source/`. The ornament cell is reserved for future environmental decoration. WebP files are quality 90 exports with original dimensions and alpha preserved. The generated art includes colored halos; runtime character drawing clips the selected body rectangle and uses nine-slice stretching. Eyes and expressions remain animated canvas drawings.

`themes.js` holds atlas rectangles and matching UI/effect palettes. Each entry in `levels.js` explicitly owns `theme: 'garden' | 'moon' | 'ember' | 'toxic'`. A level selects and loads its theme before play begins. Rooms, camera position, movement, death, hints and retry never reselect it. New level themes can be added without changing the physics engine.

Static floor/wall/hazard art is cached once per level and viewport size. Asset-load failures keep the same theme through palette-based fallback rendering. `?bg=<palette-id>` remains an explicit floor preview override for the existing palette gallery.

`board.js` now derives a single continuous boundary from the union of safe (`#`) and hazardous (`*`) solid cells. Only the room-facing wall skin is rendered; hidden backing never forms a second wall row. Rounded corners, masonry seams, bevels and collision edges share that boundary. Lava veins, poison glaze, inset spike teeth and crystal facets change the wall material. Static wall art is cached; glints, embers and bubbles move on the surface. Old hazard-atlas cells are retained as source art but no longer tiled onto the board.

The playable floor uses one low-contrast checkerboard at the collision unit scale. The multi-stone floor atlas is no longer repeated inside those squares. This removes the overlapping grid pattern without changing level geometry or solution paths.

Checks: `node tools/verify.js`, `node tools/verify-themes.js`, and `node tools/verify-themes.js --missing-assets`.

Character selection is independent of the environment. `motion.js` reads each level’s fixed `jelly` field and drives material-specific shape changes, wall motion and failure clips. See [animation assets and prompts](../animation/README.md).
