# New V2 subjects (Astra brief)

The user loves the new-style vitray levels but finds most of them too busy for
the start of the game. Each entry of `tools/stained/vitray/fresh/queue.json` is a
**new** level: `id` (`v2n_…`), `name` (Turkish), `scene` (what to draw), `size`
and `targetPanes` [min, max].

Follow `DESIGN_BRIEF.md` completely (picture, geometry rules, colour strategy and
especially **"Colour pairs (update 2)"**), with these differences:

- **Style:** a real, elegant leaded stained-glass panel like
  `design/vitray_fox.png`, `design/vitray_lighthouse.png`,
  `design/vitray_hotairballoon.png` (attach one or two as style references), never
  a cartoon.
- **Pane count is the main point: stay inside `targetPanes`.** Count the closed
  pieces before you finish and regenerate once if you are clearly above `max`.
  - `small` [12–22]: the opening levels. One bold, centred subject made of
    roughly 5–10 big pieces, and a background of roughly 6–12 big calm pieces
    (wide radial or curved bands, no small filler). Thick, clear lead, no tiny
    slivers, no decorative border ring. Puzzle need: most pieces should touch
    at least three other pieces, so avoid concentric rings (bullseye shapes)
    and long chains of pieces that each touch only two neighbours.
  - `medium` [28–45]: subject of about 12–22 pieces, a simple background.
  - `large` [70–110]: a rich picture like the current V2 levels.
- **Silhouette:** pick one that suits the subject and vary it: circle, oval,
  octagon, round arch, gothic arch. Never a plain rectangle.
- **Colours:** exactly four, as a subject pair and a background pair that
  alternate within each side; `"subjectColours": [i, j]` in the JSON is
  **required**. No white/near-white glass. No subject mask needed.

Output `design/<id>.png` + `design/<id>.json` (`id`, `name` = the given Turkish
name, `scene`, `shape`, `palette`, `subjectColours`, `notes`) on an opaque white
background. Record every generation with action-log. Check each image once (open
lines, X crossings, shading, colour pairs, pane count) and regenerate once if it
clearly fails. Do not message the orchestrator. Do not edit other files.
