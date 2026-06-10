# Hidden Triple Match

A hidden-objects + match-3 playable. Find hidden items in the scene; collect **3
of the same kind** and they clear from the bar. Clear all **10 matches** to win.

Ships with three levels — **Garden**, **Elvan** (a gamer's room), and **Emir** (a
cottage kitchen) — that cycle via ⏭ / "Next Level" (the rotation is the `LEVELS`
array in `game.js`).

## Run

```bash
cd game
python3 -m http.server 8765   # then open http://localhost:8765
```

(`fetch()` of `assets/manifest.json` needs HTTP — opening `index.html` via
`file://` will not work.)

## How it plays

- Each level's scene holds **30 hidden items** (`h1`–`h30`), grouped into **10
  matchable triplets**: `g_n = h(3n-2), h(3n-1), h(3n)`. Clear all 10 triplets to
  win, then advance to the next level. (Garden's PSB also contains `h31`–`h40`,
  which are unused — only the first 30 items per level are played.)
- **Rotated items** (`hN ro<deg>` in the PSB, e.g. `h11ro52`) appear tilted in
  the scene; when collected they **rotate upright** as they fly into the bar
  (each token carries a `barRot` that seats it straight).
- The scene is larger than the viewport — **drag to pan** and **pinch / scroll to
  zoom** (1×–3×, two-axis panning once zoomed). A short press that doesn't move
  past a small threshold counts as a tap.
- Each item is drawn exactly as the PSB stacks it: **`h_i` then `s_i`** (h below,
  the in-scene "nestled" `s_i` on top), at the item's PSB z. Together they form
  the item as it sits in the garden. The clean **`h_i`** cutout is what flies to
  the bar. Finding an item **fades out both layers** and sends the clean `h_i`
  to the tray. (`h4`/`h16` have no `s` and just show `h`.) Collected items stay
  in the bar — they cannot be returned to the scene.
- **Bar** = 6 cells (5 usable + 1 rewarded), with the `x/10` progress badge at
  its top-left (it bumps on each match). The rightmost cell is **locked with a +**
  and only unlocks by tapping it to watch a short **rewarded ad** (simulated, ~3s),
  which raises the usable cells from 5 to 6. It re-locks each level.
- **Win** = all 10 matches → a **"You Win!"** popup with **Next Level**.
- **Fail** = the bar fills (6 cells, no possible match) → a **"Tray Full!"** popup
  with **Try Again**, which restarts the level. (No lives/hearts.)
- 💡 hint pans to/pulses a useful item · ⟳ restarts the level · ⏭ next level ·
  tapping empty space shows a small ripple.

## Asset pipeline

Assets are extracted per level from the layered PSBs in `../levels/` into
`assets/<level>/`, where `<level>` is the PSB filename stem lowercased
(`Garden.psb` → `assets/garden/`, `Elvan.psb` → `assets/elvan/`). Add a level by
extracting its PSB and appending it to the `LEVELS` array in `game.js`.

```bash
# regenerate game/assets/<level>/ from a .psb (requires psd-tools + Pillow)
python3 tools/extract.py            # defaults to levels/Garden.psb -> assets/garden/
python3 tools/extract.py path.psb   # any layered level -> assets/<stem>/
```

If a level's PSB is missing an item's clean cut-out `hN` but carries two `sN`
layers (a labeling slip — Elvan's `h13` was shipped as a second `s13`), the
extractor auto-repairs it: the tighter-bbox `sN` is relabeled `hN`.

Layer-name matching is **case-insensitive** (PSBs ship mixed case — Emir uses
`BG`, `H1`…`H30`, and some `S4`-style shadows; all are recognized).

Layer conventions the extractor understands:

- `bg` — full-canvas background (clean; items are separate layers on top).
- `hN` / `hN ro<deg>` — hidden item N, optionally rotated `<deg>` in the scene
  (negative = left/CCW). `barRot` (the upright rotation for the bar) is written
  into the manifest; assets stored pre-rotated need `-deg`, while any that
  composite upright are listed in `BAR_ROT_OVERRIDE`.
- `sN` — the in-scene "nestled" rendering of item N, drawn on top of `hN`. Paired
  to its `hN` strictly **by number** (`s1`↔`h1`, …). Finding the item fades both
  `hN` and `sN`, and the clean `hN` flies to the bar.
- `m` — static foreground occluders, rendered at their **true stack z** so hidden
  items tucked behind garden objects are partly hidden. Non-interactive and they
  never change (don't fade with items). Each is exported as `mK.png` with its
  normalized bbox + `z` in `manifest.foreground`.

`assets/manifest.json` stores each item's normalized bbox (0–1 of the canvas),
its `barRot` and stacking `z`, the shadows present, the `foreground` occluders,
and the original PSB draw order. The `z` values come straight from the PSB layer
stack and drive both CSS `z-index` and the topmost-first hit-test.
