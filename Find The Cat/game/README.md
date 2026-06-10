# Find The Cat

A hidden-objects playable: a scene packed with **73 cats**. Tap each cat to find
it — it fades out with a happy pop. You have **3 hearts** per level; tapping empty
space (a miss) costs a heart. Find every cat before your hearts run out.

## Run

```bash
cd game
python3 -m http.server 8766   # then open http://localhost:8766
```

(`fetch()` of `assets/manifest.json` needs HTTP — opening `index.html` via
`file://` will not work.)

## How it plays

- The scene is larger than the viewport — **drag to pan** and **pinch / scroll to
  zoom** (1×–4×, two-axis panning once zoomed). A short press that doesn't move
  past a small threshold counts as a tap.
- **Tap a cat** → pixel-accurate (alpha) hit-test on its silhouette → it **fades
  out** with a pop and a golden burst. The **counter** (`found/total`, e.g.
  `5/73`) at the top bumps up.
- **Miss** (tap something that isn't a cat) → a red ripple and **−1 heart**. Three
  misses (hearts → 0) ends the level with **Out of Hearts! → Try Again**.
- **Win** = all cats found → **You Found Them All! → Next Level**.
- 💡 **Hint** (HUD) — zooms/pans to a random remaining cat and pulses it.
- ⚙ **Admin panel** (HUD) — dev aids: **Restart**, **Reveal all cats** (glows
  every remaining cat briefly), **Next level**.

## Asset pipeline

Assets are extracted from the layered `.psb`s under `../levels/` the same way the
triple-match build reads its scene — each `.psb` → its own `assets/<slug>/` folder
(`bg.jpg` + `catN.png` + `manifest.json`):

```bash
python3 tools/extract.py levels/0002psb  0002   # -> game/assets/0002/
python3 tools/extract.py levels/0003.psb 0003   # -> game/assets/0003/
```

(slug defaults to the `.psb` filename stem if omitted.)

Layer conventions the extractor understands:

- `Background` (or `bg`) — full-canvas background (bottom layer) → `bg.jpg`.
- `Cats` — a group whose children are each named `cat`; every child is one hidden
  cat, exported as `catK.png` with its normalized bbox (0–1 of the canvas) and a
  stacking `z` (its position in the layer stack; higher draws on top and is
  hit-tested first).

Each `manifest.json` stores `{canvas, cats:[{x,y,w,h,z,file}]}`. Add more levels
by extracting more `.psb`s into their own `assets/<slug>/` folders and listing
their manifests in the `LEVELS` array in `game.js` (currently `0002`, `0003`).
`game.js` derives each level's asset folder from its manifest path, so `bg.jpg`
and the cat cut-outs load from the right place. **Next level** cycles through the
list.
