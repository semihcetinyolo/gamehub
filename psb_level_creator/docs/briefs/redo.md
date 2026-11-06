REDO TASK (user, 2026-11-06): the game's levels 5-10 are rejected and must be produced again FROM SCRATCH under the
two new rules at the top of recipes/hidden_letters/PROMPTS.md (read them first, they override anything older):
(1) the source is the Hidden PSB's BG layer only (already extracted for you: lab/bg_src/<gameindex>_<id>.png,
    overview lab/bg_src/contact.jpg) — the old full composites were far too crowded;
(2) letters are PARTS of scene objects: medium and hard letters are formed by a scene object's own part, redrawn by
    the edit; a standalone letter-shaped object (wooden/toy/metal/plaque letter) only for EASY letters (~25%).
    The user's favourites to copy: upon_storybook_attic green A in the spiral plant tendrils, I inside the lantern,
    N in the bookshelf, C in the rocking horse legs; home_cartoon_garden M and W in the flower pots;
    quiet_photoreal_porch G of the kettle grip, E of the fork. Look at those previews (projects/<slug>/out/*_preview.jpg)
    and at the rejected old level (old slug below) so you do not repeat it.

Read also: README.md (workflow, endpoints, plc_client.py, blind read, glyph SAM), the rest of PROMPTS.md.
Work autonomously; do not ask the user. Do not touch the old projects; create the new slug.

Steps per level:
1. POST background/restyle from lab/bg_src/<source>.png with the style ref (WATERCOLOR -> projects/upon_storybook_attic/bg.png,
   CARTOON -> projects/home_cartoon_garden/bg.png) and your provider. Prompt: redraw the scene in the reference style,
   keep composition/characters/story, FEWER objects and calm areas so ~15 letters fit, NO text/letters/digits/logos
   anywhere, FULL-BLEED to all four edges. Inspect at full size; regenerate if text or letter-like shapes appear.
2. Plan every letter BEFORE any edit: index, char, host object, which part of it forms the letter, difficulty
   (~25% easy / 50% medium / 25% hard), position, intended size (glyph long side >= 100 px, aim 120-190).
   Every medium/hard letter needs a host object part. Save the plan as lab/redo/<slug>_plan.json.
3. Edits with your provider only; every stroke new pixels (the edit redraws the host part into the letter, so the whole
   letter flies), whole glyph visible, duplicates are separate layers.
4. Glyph SAM refinement yourself (python3 -m plc.sam ..., op glyph mode sam). blindread mode=all runs=2 must pass.
5. Build with expected_labels and meta {"phrase","style","source":"<gameindex>","difficulty":{label: easy|medium|hard}};
   report.ok true.
6. Report: clai ctl send "Hidden Words:1" "<slug>: psb, preview, phrase, per letter host+part+difficulty, usage
   (calls, retries), problems".

Rules: only the server on 127.0.0.1:8790 (never start another). Astra: server-wide limit of 5 concurrent jobs, shared
by everyone; if it hits its usage limit the server pauses Astra for 20 min — just wait, do not switch provider.
Marla: paid, max 3 concurrent across the server (shared with opus-c1/opus-c2); never resend an unknown outcome.
Tool problems -> "Hidden Words:opus-api" (service) / "Hidden Words:opus-detect" (detection/SAM).

LEVELS (old slug -> new slug, phrase, style, source, provider for EVERYTHING):
5  galley_watercolor       -> galley_watercolor_r2      "SOUP OF THE DAY"      WATERCOLOR 2531_32996  astra
6  gamenight_watercolor    -> gamenight_watercolor_r2   "LET THE GAMES BEGIN"  WATERCOLOR 2513_32988  astra
7  phonecall_watercolor    -> phonecall_watercolor_r2   "A CALL FROM THE PAST" WATERCOLOR 2560_33022  astra
8  camper_cartoon_astra    -> camper_cartoon_r2         "RISE AND SHINE"       CARTOON    1888_32545  astra
9  roadtrip_cartoon_marla  -> roadtrip_cartoon_marla_r2 "ON THE ROAD AGAIN"    CARTOON    2518_32976  marla (gpt-image-2.5-sunburst)
10 catgaming_cartoon_marla -> catgaming_cartoon_marla_r2 "GAME OVER KITTY"     CARTOON    2532_32998  marla (gpt-image-2.5-sunburst)
