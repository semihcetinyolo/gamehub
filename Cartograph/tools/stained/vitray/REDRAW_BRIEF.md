# V2 redraw design sheets (Astra brief)

The user loves the new Pinterest-style vitray levels and wants every older level
with a subject redrawn in that style for the new V2 level list (the old drawings
stay as V1). Each entry of `tools/stained/vitray/redraw/queue.json` is one level:
`id` (new, `v2_…`), `name`, `scene`, `targetPanes` [min, max], `oldImage`.

Follow `DESIGN_BRIEF.md` completely (picture, geometry rules, colour strategy and
especially **"Colour pairs (update 2)"**), with these differences:

- **Subject and idea** come from the old level: same subject as `scene`/`name`,
  the old glass `oldImage` shows what it is about. Do **not** copy its childish
  geometry: redraw it as a real, elegant leaded stained-glass panel like
  `design/vitray_fox.png`, `design/vitray_lighthouse.png`,
  `design/vitray_hotairballoon.png`, `design/vitray_poppies.png` (attach one or
  two of them as style references).
- **Pane count:** aim inside `targetPanes`. Small targets (12–40) mean a simple,
  bold panel with big pieces – still real glass style, not a cartoon. Large
  targets (100–160, scenes) mean a rich picture.
- **Silhouette:** pick one that suits the subject and vary it: circle, oval,
  octagon, round arch, gothic arch. Never a plain rectangle.
- **Colours:** exactly four, as a subject pair and a background pair that
  alternate within each side; `"subjectColours": [i, j]` in the JSON is
  **required**. No white/near-white glass. No subject mask needed.
- `v2_cat` is the game's tutorial: a sitting cat, **12–16 big panes**, very clear.

Output `design/<id>.png` + `design/<id>.json` (`id`, `name` = the given Turkish
name, `scene`, `shape`, `palette`, `subjectColours`, `notes`). Record every
generation with action-log. Check each image once (open lines, X crossings,
shading, colour pairs) and regenerate once if it clearly fails. Do not message
the orchestrator per level (a watcher picks the files up). Do not edit other files.
