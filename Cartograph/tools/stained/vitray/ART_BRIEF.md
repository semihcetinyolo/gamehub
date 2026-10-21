# Vitray finished glass (Astra brief)

For each level id you get a final puzzle guide `tools/stained/guides/<id>.png`
(1728×2304, flat colours + black lead, grey outside the panel). Make the finished
stained-glass picture of exactly that panel with your built-in image generation,
the guide as the input/reference image. One image per level, portrait **3:4**
(e.g. 1536×2048 or 1086×1448).

Prompt (fill in `<scene>` from `tools/stained/vitray/work/<id>.map.json` → `scene`):

> Use case: style-transfer. Subject: <scene>. Transform this exact flat colour
> guide into a luminous photographic artisan stained-glass panel, seen straight on
> and backlit. Preserve every pane, boundary, silhouette and margin, and keep all
> four existing hues exactly (each pane stays the colour it has in the guide). Add
> handmade translucent glass texture: gentle ripples, seedy bubbles, subtle streaks
> and brightness variation inside each pane, thin dark metallic lead only on the
> existing seams. No extra lines, cracks, objects, frames, text or decorations. Do
> not shift, stretch, zoom, rotate, merge or subdivide any part. Neutral dark grey
> outside the panel. Colour fidelity and exact registration matter more than
> dramatic lighting.

Save the result as `tools/stained/vitray/raw/<id>.png` (PNG, no cropping or
resizing beyond the 3:4 canvas) and record the generation with action-log.
Then run `python tools/stained/vitray/art.py finish <id>` from the project root:
it registers your glass on the exact geometry and checks every pane. If it
reports a mismatch, look at `assets/glass/<id>.webp` and the failing panes,
regenerate once with a sharper instruction about the wrong panes' colours, and
report. After each level: `clai ctl send Cartograph:4 "art <id>: <result line>"`.
Do not edit other project files.
