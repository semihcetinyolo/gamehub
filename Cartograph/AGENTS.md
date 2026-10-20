# Cartograph level work

For creating, replacing, reordering or repairing levels, apply the `cartograph-levels` skill at `/Users/semihcetin/.config/claiface/codex/skills/cartograph-levels/SKILL.md` and read `tools/stained/README.md`.

For generating, replacing or completing stained-glass (vitray) artwork, apply `/Users/semihcetin/.config/claiface/codex/skills/cartograph-vitray/SKILL.md`. Use exact final guides, validate pane colours, and explicitly connect imported assets to the game catalogue.

All active levels must pass `tools/stained/audit_geometry.py --stamp` before `build_levels.js`. Preserve authored curves and symmetry where shared borders are clear; sharpness alone is not a defect. Use the v3 audit: actual shared borders, readable separated T junctions (no ambiguous four-or-more-way contacts), definite logical starting moves and matching final artwork. Prefer moving background dividers over bending the subject, and reuse existing glass textures for geometry refreshes when suitable. `readable_junctions.py` is the approved production junction pass; the user approved the full rollout after reviewing eight levels.

Meaningful subject contours are immutable constraints. Resolve contacts by moving/removing background divisions or adjusting whole source parts and spacing. Do not use short-edge collapse, gap warping, or an unconstrained fan fallback to dent the subject. Restore older damage from authored curves; proximity alone must not classify a parallel background line as a subject. Keep pristine source arcs locked during restoration. Leave prominent subject panes unpainted when the deduction rules permit; prepare `clueFocus` metadata after final geometry/solution and preserve the cat tutorial.
