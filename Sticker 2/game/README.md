# Sticker Match

A sticker-placement playable. Each level is a scene with a faint **slot guide**
(grey silhouettes) showing where every sticker belongs. You're handed **3
stickers at a time** — drag each onto its matching silhouette. Place one and a
fresh sticker slides into the tray. Fill the whole picture to win, then advance
to the next level.

Ships with two levels — **Spooky Forest** and **FoodVenture** (a café) — that
cycle via ⏭ / "Next Level" (the rotation is the `LEVELS` array in `game.js`).

The UI shell (frame, HUD, tray, win overlay, blue theme) is borrowed from the
*Hidden Triple Match* playable; the mechanic and asset pipeline are new.

## Run

```bash
cd game
python3 -m http.server 8777   # then open http://localhost:8777
```

(`fetch()` of `assets/<id>/manifest.json` needs HTTP — opening `index.html`
via `file://` will not work.)

## How it plays

- The board is the PSB canvas, **contain-fit** so the whole scene is always
  visible (no panning). Layers stack **bg → slots guide → stickers**: placed
  stickers are drawn on top of the guide at their true PSB position and z, so
  they overlap exactly as authored and cover their silhouette.
- **Tray = 3 slots.** They're filled from a shuffled deal order. Placing a
  sticker empties its slot and the next sticker in the queue slides in, so you
  always have up to 3 choices until the deck runs out.
- **Drag to place.** Press a tray sticker to lift a clone sized exactly as it
  will sit on the board, drag it over its silhouette, and release. A drop within
  a forgiving tolerance of the sticker's own slot snaps it home (only its own
  slot is ever accepted — a wrong drop bounces back).
- **Tap a tray sticker** (press without dragging) to flash a ring on the slot
  where it belongs — a quick "where does this go?".
- 💡 **hint** rings the target slot of all 3 stickers currently in the tray ·
  👁 **peek** fades in faint ghosts of everything not yet placed (the finished
  picture) for ~2s · ⟳ restarts the level · ⏭ jumps to the next level.
- **Win** = every sticker placed → a 🏆 "You Win!" popup with **Next Level**.
  There is no fail state.

## Asset pipeline

Each level is a layered `.psb` in `../levels/` (the files are named `0001`,
`0002`). The extractor reads the PSB layer stack and writes web assets into
`assets/<stem>/`:

```bash
python3 tools/extract.py            # every level file in ../levels
python3 tools/extract.py ../levels/0001   # one level
```

Outputs per level: `bg.jpg`, `slots.png`, `s1.png … sN.png`, `manifest.json`
(normalized bboxes + paint-order `z`).

Layer convention (bottom → top):

- `bg` — full-canvas background (clean).
- `slots` — the empty-slot guide painted over the bg: the silhouettes / outlines
  showing where every sticker goes.
- `stickers` — a group of sticker layers, **each named `si`**. They're told apart
  by stack order and by their bbox, which *is* the slot the player drops them on.
  Each `si` is exported as `sN.png` (1-based in stack order) with its normalized
  bbox and `z`.

Add a level by dropping its PSB in `../levels/`, re-running the extractor, and
appending `{ id, name }` to the `LEVELS` array in `game.js`.
