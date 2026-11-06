You are the art/level-design worker for a new hidden-object tool: ~/Desktop/quest_projects/psb_level_creator (git branch hidden-word; do NOT commit; only write under psb_level_creator/lab/ and psb_level_creator/recipes/hidden_letters/).

Context: read docs/spec.md (approved design). Two Opus workers are building the API service right now; you do the prompt/style research in parallel, then you will produce the first end-to-end level with the service.

The game: a hidden-word level. Every letter of a phrase (e.g. "YOUR DOOR IS ALWAYS OPEN" = 20 letters, duplicates each placed separately) is hidden in a portrait scene. Look at ref/examples/mosaic_tulips.jpg and ref/examples/porch_door.jpg: letters built from scene material (twigs, wreath, wire, mosaic tiles), letters as decor objects (hooks, plaques, door-mat weave), and faint engraved/printed letters on surfaces; a mix of easy and hard. Art style does not have to be realistic: we want several art styles and will keep the best.

TASK 1 — styles (lab/styles/): generate 5 portrait backgrounds in clearly different art styles (e.g. stained-glass mosaic, photo-real cozy interior/porch, bright cartoon/casual-mobile, storybook watercolor, one of your choice), each a rich scene with many surfaces/objects where letters can hide, and NO text, letters or numbers anywhere (any stray letter would confuse the player). Use:
  clai image --model nano-banana --ratio 3:4 --output-path lab/styles/<name>.png "<prompt>"
Save each prompt next to the image (<name>.txt).

TASK 2 — hiding letters by edit (lab/letters/): for 2–3 of those BGs, cut 1024x1024 crops and edit them with
  clai image --model nano-banana --input-path <crop.png> --output-path <out.png> "<prompt>"
asking for 3–5 specific capital letters at named spots in the crop, each hidden a different way (material, decor object, faint engraving). Measure per try: is every letter there, is it the RIGHT letter, readable but not obvious, at the asked spot, any extra letters, does the rest of the crop stay unchanged (pixel diff vs the crop), does the result come back at the same framing/scale. Iterate on the prompt wording. Budget: at most ~25 edit calls total.

TASK 3 — write recipes/hidden_letters/PROMPTS.md: the scene-prompt template (incl. the no-text rule), the letter-edit prompt template that worked best, how many letters per 1024 square is safe, sizes that read well, which hiding styles work in which art style, failure modes and how to spot them. Include a contact image lab/letters/summary.jpg of the best results.

Then reply to me with: clai ctl send "Hidden Words:1" "<short summary + which art styles look best + paths>" and wait; I will tell you when the service is up for the full level. Ask me the same way if anything is unclear.
