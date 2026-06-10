# Find The Strange

A hidden-objects playable. Each scene is crammed with decoy items; only a
handful are the **odd ones out**. Find every odd item before your hearts run
out, then move on to the next level.

## Run

```bash
cd game
python3 -m http.server 8766   # then open http://localhost:8766
```

(`fetch()` of the manifests needs HTTP — opening `index.html` via `file://`
will not work.)

## How it plays

- Levels are played in the order listed in `assets/levels.json` (currently
  **beach → market**).
- Each scene holds a few **odd items** (`o1`, `o2`, …) and many **decoys**
  (`r1`, `r2`, …).
- The scene is larger than the viewport — **drag to pan** across it and
  **pinch (touch) or scroll/⌘-pinch (desktop) to zoom** in for a closer look.
  A short press that doesn't move past a small threshold counts as a tap.
- **Tap an odd item** → it flies into the **bar** and fills a slot. The bar has
  exactly one slot per odd item, and the `x/N` badge bumps on each find.
- **Tap a decoy** (`r`) → it does a **red shake** and you **lose a heart**.
- **Tap empty space** → a small **blue point** ripples out.
- **Hearts** = 5 (top-left). Lose them all → **"Out of Hearts!"** popup with
  **Try Again**, which restarts the level.
- **Clear a level** → **"Level Complete!"** with **Next Level**. Clear the last
  level → **"All Levels Cleared!"**.
- 💡 hint pans to and pulses the next odd item · ⟳ restarts the level.

## Asset pipeline

Assets live under `game/assets/<level>/` and are extracted from the layered
`../levels/<level>.psb` files:

```bash
# regenerate every level under ../levels/ (requires psd-tools + Pillow)
python3 tools/extract.py
# or one level:
python3 tools/extract.py ../levels/market.psb
```

This produces, per level, `assets/<level>/bg.jpg`, `o*/r*/s*.png` and a
`manifest.json` (normalized bboxes 0–1 of the canvas + PSB draw order), and
keeps `assets/levels.json` (the play order) up to date.

Layer naming convention in each `.psb`:

```
bg / BG    full-canvas background (bottom layer; case-insensitive)
oN         a clean cut-out of an odd item to find (may sit in a group)
rN         a clean cut-out of a decoy item
sN         optional glow/effect for odd N — shown in the scene and removed
           when oN is found (matched by number: o1<->s1, o2<->s2, …)
```

Numbering need not be contiguous (gaps like `r6`/`r29` are fine). Add a new
level by dropping another `*.psb` in `../levels/` and re-running the extractor.
