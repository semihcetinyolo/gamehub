You produce one hidden-word level with the psb_level_creator service: ~/Desktop/quest_projects/psb_level_creator (git branch hidden-word; do NOT commit; only write under psb_level_creator/projects/ via the service and psb_level_creator/lab/astra-letters/).
Read first: README.md ("Agent workflow"), docs/spec.md, recipes/hidden_letters/PROMPTS.md (prompt guide, incl. Nano vs Astra verdict), lab/level/REVIEW.md (how the first level door_stained_glass went). Use plc_client.py; server is running on 127.0.0.1:8790 (do not restart it; other workers use it).

Your level:
- Phrase "A QUIET MORNING"; every letter occurrence is its own target, labels L01_<char>... in phrase order without spaces (same scheme as door_stained_glass), group Letters.
- Art style: photo-real cozy interior/porch photography (like lab/styles/cozy_porch.png, warm morning light): a breakfast nook by a window. New 2K 3:4 BG via the service (generate_background; Albert fallback allowed for the BG only); the scene prompt forbids any text, letters, numbers. Scene must suit the phrase and have many objects/surfaces to hide letters in.
- Edits: provider nano (Clai), fallback "none". Use astra only where PROMPTS.md says it is better.
- Art rule from the user's review of level 1: about half of its letters were too obvious (a letter alone and centred on a plain tile reads as a letter board, not hidden). Make ~70% of letters part of an object or texture, in its colour/material (rope O on a mat, N in the door frame, P on a pot, S as a hook, L as a handle); the rest may be easier decor letters. Spread letters across the whole scene, not only along the edges. No letter may be unreadable either.
- Rounds: plan -> edits -> look at sheet.jpg/overview.jpg -> label/drop/split/crop/add -> freespots fill-up for missing ones. Build with expected_labels = all, meta {"phrase": "A QUIET MORNING", "style": "photoreal"}; report.ok must be true; check preview.jpg at full size yourself.
- Project name: quiet_photoreal_porch.
Then reply: clai ctl send "Hidden Words:1" "<psb path, preview path, usage (clai/astra/albert/failed), rounds, problems>". Ask me the same way if blocked.
