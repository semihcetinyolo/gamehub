HANDOVER (user, 2026-11-06): you take over comparison set C (ALL MARLA SUNBURST) from the Astra workers astra-c1/astra-c2.
They are closed: Astra's subscription quota ran out (429 for 15 h) and they could not think any more. Marla itself was fine.
Finish your levels end to end, then report. Work autonomously; do not ask the user.

Read first (in this order): README.md (agent workflow, endpoints, plc_client.py, 4b blind read, glyph SAM), docs/briefs/c1.md
(the original set C brief: sources, style refs, phrases, rules), recipes/hidden_letters/PROMPTS.md (hard rules at the top),
lab/c5_plan/README.md and your level's files in lab/c5_plan/ (astra-c1's plans: <slug>.json, *_boxes_v2.json,
grandma_masks/) or lab/c5_plans/ (astra-c2's catgaming plans/scripts). Then GET the project and look at its edits,
answers and candidates yourself (view the images) before deciding anything; their notes may be stale.

Hard rules (user):
- provider "marla" (model gpt-image-2.5-sunburst) for EVERY edit/regeneration in these projects; never nano/astra.
  Marla is paid: at most 3 concurrent Marla jobs across the whole server (both of you share it). Never resend an edit
  whose outcome is unknown; re-add as a new edit only if still needed.
- 18:24 restart lost these edits as 'unknown' (>=7 of 8 were never sent): catgaming e004/e014/e016, costume e006/e007,
  halloween e001/e003/e006. Check what letters they were for and re-add the ones still needed.
- Every letter: a separately added, complete, clearly visible object made in the scene's style (formed by a host
  object's part, never a pasted-on/typeset glyph, never strokes borrowed from existing BG objects); glyph long side
  >= 100 px (aim 120-190); difficulty per level ~25% easy / 50% medium / 25% hard; whole letter visible.
- Full-bleed backgrounds (no margins/frames). No text/digits anywhere else in the scene.
- Duplicate letters are separate layers. Glyph SAM refinement yourself (python3 -m plc.sam ..., then op glyph mode sam).
- blindread mode=all runs=2 must pass (scene, layer, flight glyph) before build.
- Build with expected_labels and meta {"phrase","style","source":"<gameindex>"}; report.ok must be true.
- Only use the server on 127.0.0.1:8790; never start another plc server. Tool problems -> "Hidden Words:opus-api"
  (service) or "Hidden Words:opus-detect" (detection/SAM).

When a level is built: clai ctl send "Hidden Words:1" "<slug>: psb path, preview path, phrase, difficulty per letter,
Marla usage (calls / cost from GET usage), retries, problems". Then continue with your next level.
