# Vitray level design sheets (Astra brief)

Cartograph is a four-colour puzzle on stained-glass panels: every glass pane is a
region, panes that share a border must get different colours, the player paints
them by logic. These new levels are based on real stained-glass panels the user
found on Pinterest (`refs/<id>.jpg`). Your job is the **design sheet**: a clean,
flat, cartoon-like colour drawing of the leaded panel, which a script traces into
puzzle geometry. The finished glass artwork is made later from the traced guide.

## Output per level

- `design/<id>.png` – the design sheet (rules below).
- `design/<id>.json` – `{"id", "name" (short Turkish title for the game, e.g. "Melek Balığı"),
  "scene" (one English sentence), "shape", "palette": [["name", "#hex"] × 4], "notes"}`.

Record every image generation with the action-log skill.

## The picture

- Portrait **3:4** canvas (1536×2048 or the closest portrait size you get).
- The panel has the silhouette given in the task (circle, oval, octagon, round arch,
  gothic arch) and is centred on a **plain pure white background**, touching or
  nearly touching the canvas edges. A thick black outer border (lead) closes it.
- Re-draw a fresh composition inspired by the reference: same subject, mood and
  kind of background division (waves, sky bands, sun rays, leaves, stems). Drop
  photo context (hands, window frames, walls) and decorative bevelled border
  frames; the whole panel is the picture.
- Flat fills only: **exactly four colours**, taken from the reference's mood. No
  white/near-white and no very pale cream glass (it reads as an unpainted pane);
  a light tint is fine if clearly coloured. The four must be easy to tell apart.
  Try to give panes that share a border different colours.
- Lead lines: **pure black, uniform width ≈ 1% of the canvas width** (≈15 px at
  1536 wide), smooth curves. No shading, gradients, glass texture, highlights,
  outlines of a second weight, dots, bubbles, hatching, text or signatures.

## Geometry rules (the tracer and the puzzle need these)

1. **Every pane is closed.** Every line runs from a junction (or the rim) to a
   junction; no line ends loose inside a pane, no gaps in lines.
2. **Only T junctions:** at most three panes meet at a point. Never four or more
   lines at one point, no X crossings. Neighbouring junctions are at least ~3% of
   the panel width apart.
3. **No slivers:** each pane is at least ~3% of the panel width wide (except near
   its own pointed tips). Lines never run close and nearly parallel, never almost
   touch without meeting, and meet other lines and the rim at angles ≥ 30°.
4. **No tiny panes:** none smaller than ~1/1000 of the panel area. Eyes are small
   round panes, but clearly visible ones.
5. **Pane count 70–130**, mixed sizes: the subject has meaningful pieces (feathers,
   petals, fins, scales of fur), the background is cut like real glass along
   waves, sky bands, rays, leaves – never an arbitrary grid.
6. The subject keeps clean, recognisable outlines (silhouette, eye, beak, petals).

After generating, open the image and check it against the rules (loose line ends,
four-way crossings, slivers, shading). Regenerate once if it clearly breaks them;
note the remaining doubts in `notes`.

## Colour strategy (update)

Keep colours semantic and readable like the reference: the subject mainly in two
of the four colours (its pieces alternate), the background mainly in the other two
(bands alternate). Do not paint background pieces in subject colours only to make
neighbours differ; the solver fixes equal neighbours. Readability of the subject
comes first.

## Subject mask (second output per level)

`design/<id>.subject.png`: an edit of the finished design sheet with the same
canvas, framing and lines, where every pane that belongs to the **subject**
(animal, bird, flower heads, boat, lighthouse... the thing the panel is about)
is filled pure black and every background pane (sky, water, leaves behind,
ground, rays) pure white; lead lines may stay black. Exterior stays white. It
only needs to be roughly aligned; it is used per pane by majority vote.

## Colour pairs (update 2, applies to designs made from now on)

The tracer recolours or merges any two touching panes of the same colour, so
the closer the sheet is to a proper four-colouring, the more of it survives:

- Pick the four colours as two pairs: the subject's pair (e.g. orange + golden
  yellow) and the background's pair (e.g. sky blue + leaf green). Do not use
  subject colours in the background or the reverse.
- Inside the subject neighbouring pieces alternate between its two colours;
  inside the background between the other two. Lines that run across the whole
  subject (outline to outline, like stripes or bands) make alternation easy;
  lines ending on other inner lines make it hard.
- Pane count may be 100–180; panes that cannot alternate get merged anyway.
- Add `"subjectColours": [i, j]` (palette indices of the subject pair) to the
  JSON. With that, the subject mask is optional.
