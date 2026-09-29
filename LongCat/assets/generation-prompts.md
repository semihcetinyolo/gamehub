# Long Dog — production asset prompts

Generated with the built-in image_gen tool on 2026-09-29. Original PNG alpha is preserved; the runtime samples the atlas without modifying the source images.

## Dachshund rig — assets/dog/dachshund-rig.png

Use case: stylized-concept
Asset type: production 2D skeletal animation sprite atlas for a cute mobile puzzle game, square 1024x1024 transparent PNG.
Generate a red-brown dachshund / sausage dog rig parts sheet with EXACTLY FOUR isolated parts, one per equal 512x512 quadrant, no lines or labels. Thick dark brown outline #3d1c0b, polished softly shaded warm chestnut fur #c9692e, caramel highlights, tan muzzle #f1b57d, dark floppy ears #86391a. Casual mobile game illustration, smooth rounded shapes, top left lighting.
TOP LEFT quadrant: front-facing central dog HEAD ONLY, no ears, no body, no collar; head centered in this quadrant, occupies 75% width and 80% height. Broad domed forehead tapering into a protruding rounded tan muzzle at lower centre. Small glossy black nose centered at 60% of head height. IMPORTANT completely BLANK eye and brow area, no eyes no eyebrows no mouth no tongue: these will be animated in code. Attractive dachshund anatomy with elongated muzzle, not a cat, no pointy ears.
TOP RIGHT quadrant: one detached long floppy left ear, narrow at top attachment and round broad end at bottom; upright vertical axis; centered, occupies 35% quadrant width and 75% height.
BOTTOM LEFT quadrant: matching detached right ear, centered identical size.
BOTTOM RIGHT quadrant: two tiny front paws together, each caramel rounded dachshund paw with three toes and dark outline, side by side with a clear transparent gap. Centered, combined width 65% quadrant.
All parts have generous clear transparent margins, no touching other quadrants, actual alpha transparency, no shadows behind parts, no background, no text, no checkerboard.

## Wall surface — assets/environment/wall-periwinkle.png

Use case: stylized-concept
Asset type: seamless square environment texture for raised walls in a cute mobile puzzle game.
Create an orthographic straight top-down material texture of softly polished periwinkle blue / lavender molded stone, palette #8fa3ef with light blue #b6c7ff softly mottled subtle highlights, tiny sparse pale mineral flecks. Calm broad tonal variation, extremely subtle rounded surface texture. The entire square is ONE continuous material, edge-to-edge, seamlessly tiling on all four edges. Toy-like rounded softness, elegant polished casual 3D game material. No separate bricks, no grid, no grout, no objects, no borders, no bevel at the image boundaries, no perspective, no text, no symbols, no drop shadows. Opaque 1024x1024 image. The game will clip this texture into wall shapes and add vertical faces, bevels and shadows dynamically, so do not draw any block silhouette.
