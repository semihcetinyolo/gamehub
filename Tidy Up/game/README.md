# Tidy Up — hidden-object playable

Find every hidden item in the messy living room and tap it; it flies into the
tray at the bottom. Misclicks (tapping where there's no item) cost one of your
**3 hearts** — run out and the round ends.

## Run

```bash
cd game
python3 -m http.server 8765   # then open http://localhost:8765
```

(`fetch()` of `assets/<level>/manifest.json` needs HTTP — opening `index.html`
via `file://` will not work.)

## How it plays

- The scene holds **38 hidden items**. Tap one to collect it; the clean cut-out
  flies into its tray slot, which lights up with a ✓. The `x/38` counter bumps.
- **Tray order mirrors the Photoshop stack**: the item highest in the layer
  panel is the **left-most** tray slot, and walking down the stack walks the
  tray rightward. The tray scrolls horizontally and auto-reveals the slot of
  whatever you just found.
- Each item is a **`single`** group in the PSB — an object layer `h` plus its
  nestled shadow `s`. Finding it fades out both.
- Some items belong to a **`multiple`** cluster that shares one common shadow
  `ss`. The `ss` only lifts once **every** member of the cluster is collected.
- **Hearts:** 3. A tap that lands on empty scenery (no item's solid pixels under
  it) is a misclick — a red ripple shows and you lose a heart. 0 hearts → fail.
- **Pan / zoom:** drag to pan, pinch or scroll to zoom (1×–4.5×) so small items
  are easy to find and tap. Hit-testing is **per-pixel alpha-aware** and picks
  the top-most uncollected item under the tap, so transparent edges and stacked
  objects behave correctly.
- **Settings** (⚙, top-right): toggle sound, restart the level.
- **Win** = all 38 found → "All Tidy!" popup with replay.

## Asset pipeline

Assets are extracted from the layered PSB in `../levels/` into
`assets/<level>/` (`<level>` = PSB stem lowercased, `level1.psb` → `level1/`).

```bash
python3 tools/extract.py               # defaults to ../levels/level1.psb
python3 tools/extract.py path/to.psb   # any level laid out the same way
```

`extract.py` writes `bg.jpg`, `item<id>_h.png` / `item<id>_s.png` per
collectible, `group<g>_ss.png` per shared-shadow cluster, and `manifest.json`
(normalized 0–1 boxes, stack `z`, tray order, cluster membership).

### Expected PSB layer convention

```
bg                         full-canvas background (bottom)
hiddens                    group with every collectible
  single                   object "h" + nestled shadow "s" (lone child = no shadow)
  multiple                 cluster sharing one common shadow "ss"
    single / Group N       each an object "h" (+ optional "s")
    ss                     common shadow, lifts when the whole cluster is gathered
```

If a `single`'s two layers are mislabelled (both `h` / both `s`), the
larger-area pixel layer is treated as the shadow and the tighter one as the
object.
