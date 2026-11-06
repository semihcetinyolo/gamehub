Update from the orchestrator: the service is READY (server on 127.0.0.1:8790, all tests pass). Finish TASK 1–3 first (PROMPTS.md + summary.jpg), report to me as planned, and then continue straight into TASK 4 without waiting:

TASK 4 — first real end-to-end level through the service (read psb_level_creator/README.md "Agent workflow"; use plc_client.py, not raw clai image):
- Phrase "YOUR DOOR IS ALWAYS OPEN" (20 letters, each occurrence its own target, labels L00_Y ... L19_N, group Letters).
- Style: the one you judge best from the lab, fitting the phrase (a door/entrance scene). New 2K background through the service (generate_background, 3:4); the scene prompt must forbid any text/letters/numbers.
- Plan non-overlapping 1024 regions, 3–5 letters each, mixing easy decor letters and harder material/engraved ones, following your PROMPTS.md. Project setting fallback = "albert" for the BG only; set fallback "none" for the edits (we want edits only through Clai; a failed edit is retried by you as a new edit).
- After each round: look at sheet.jpg and overview.jpg, label every candidate (L<idx>_<char>, group Letters) or drop/split/add/crop as needed; check every letter is the right character and readable but hidden. Fill missing letters with a freespots round.
- Build with expected_labels = all 20 and meta {"phrase": "YOUR DOOR IS ALWAYS OPEN", "style": "<style>"}; report.ok must be true. Check preview.jpg yourself at full size.
- Project name: door_<style>. Then send me: clai ctl send "Hidden Words:1" "<psb path, preview path, usage counts (clai/albert/failed), how many rounds, problems>".
