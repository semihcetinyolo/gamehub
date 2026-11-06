# New levels with GENERATED backgrounds, all Astra (user, 2026-11-06)

User: "Astra Cartoon, Astra Watercolor, Astra Folk Vector, Astra Papercut, Astra Gouache, Astra Colored Pencil
stillerinden 2'şer adet background üretimi ile birlikte yeni level üretir misin? hidden'dan alma bu levellarda bg'leri."

= 12 new levels, 2 per style. The background is GENERATED FROM SCRATCH by Astra (a new original scene). Do NOT use any
Hidden PSB / lab/*_src picture / existing project BG as source or reference. Astra makes every image (BG + every letter
edit); you (Opus) plan and instruct. Never nano/albert/marla.

## Read first
- psb_level_creator/README.md (workflow, endpoints, plc_client.py, blind read, glyph SAM).
- psb_level_creator/recipes/hidden_letters/PROMPTS.md: ALL hard rules (letters are PARTS of scene objects; standalone
  letter objects only for EASY ~25%; no letter-shaped fittings; no letters drawn ON a surface; medium = colour blend;
  hard = same colour and texture in a busy area; min glyph 50 px, judge by scene scale; honest achieved difficulty).
- psb_level_creator/docs/briefs/redo.md steps 2-6 (plan file, edits, SAM glyphs, blindread, build, report) and its
  server/Astra rules. Step 1 there (restyle from a source) is REPLACED by the BG step below.
- Look at the user's favourites: projects/upon_storybook_attic, projects/home_cartoon_garden, quiet_photoreal_porch
  (out/*_preview.jpg) and at the best Astra levels: coffee_truck_gouache_r2, fireside_serenade_folkvector_r2,
  travel_journal_papercut_r2, reading_fairy_pencil_r2.

## Lessons from earlier Astra levels (save paid calls)
- Ask letters "flush, same thickness as the host part, no highlight/bevel/emboss, no serifs" - Astra otherwise draws
  typeset serif reliefs. Astra draws letters ~30% smaller than asked: ask ~1.4x, "as tall as <object>".
- Hanging rope/ribbon asked as S comes back as a squiggle; supported things work (vine stem, coil top turn, drawstring).
  Things lying flat on the ground come out too wide. E made of strands: "EXACTLY THREE arms, bottom as long as top".
- Before accepting a letter check its box does not overlap a kept target (the build erases the overlap from the glyph).
- SAM glyph often grabs the host: tight box + short prompt; else a hand-drawn mask (op glyph mode file).
- blindread glance is noisy: run it twice, write the easier achieved level per letter into meta.difficulty.
- Budget: 1-3 BG generations and about 25-30 letter edits per level.

## BG step (replaces restyle)
1. Write a rich prompt: the scene (yours below), the art style described in detail, phone portrait 3:4, warm and
   inviting, a clear focal story; FEW big objects plus calm free areas so ~15 letters fit; SEVERAL busy same-colour
   textured areas spread over the scene for hard letters (foliage, wicker/rattan, knit, lace, wood grain, stacked books,
   rope, patterned fabric/wallpaper - pick what fits the style); NO text, letters, digits, signs or logos anywhere;
   FULL-BLEED to all four edges (no border, frame, vignette or paper margin).
2. Generate with Astra directly (the server's generate route has no astra provider):
   `clai image --model gpt --ratio 3:4 --output-path lab/bggen/<slug>/bg_v<N>.png --force --prompt "<prompt>"`
   (record every prompt in lab/bggen/<slug>/prompts.md).
3. Look at it at full size. Regenerate if text or letter-like shapes appear, or the scene is crowded/smooth.
4. `python3 plc_client.py create <slug>` then `upload <slug> lab/bggen/<slug>/bg_vN.png`; the full-bleed check must pass
   (background/border); if not, background/extend with provider astra or regenerate.
Then plan, edit (provider astra), SAM, blindread mode=all runs=2, build exactly as redo.md steps 2-5.
Build meta: {"phrase", "style", "source": "astra-generated", "difficulty": {label: easy|medium|hard}}; report.ok true.

## Phrase
A NEW short, warm, well-known English phrase that fits YOUR scene, 11-20 letters without spaces. Taken (never use):
ONCE UPON A TIME, HOME SWEET HOME, A QUIET MORNING, YOUR DOOR IS ALWAYS OPEN, SOUP OF THE DAY, LET THE GAMES BEGIN,
A CALL FROM THE PAST, RISE AND SHINE, ON THE ROAD AGAIN, GAME OVER KITTY, CHOO CHOO TRAIN, BUT FIRST COFFEE,
HEART AND SOUL, THE LADY IN RED, TRICK OR TREAT, WHAT BIG EYES YOU HAVE, READING IS MAGIC, PLAY TOGETHER,
ADVENTURE AWAITS, LITTLE THINGS MATTER, JUMP IN THE LEAVES, DREAM BIG STUDY HARD, SMOOTH SAILING, READY STEADY GO,
DREAMS COME TRUE, PULL THE STRINGS, THE SHOW MUST GO ON, DRESS TO IMPRESS, HAVE A NICE TRIP.
Before using a phrase, claim it: `clai ctl ledger --topic hw-bggen add CLAIM "phrase: <PHRASE> (<slug>)"` and check
`clai ctl ledger --topic hw-bggen show` that nobody claimed it first.

## Workers, styles, scenes, slugs
| worker | style (group label)                  | level 1 scene -> slug                                  | level 2 scene -> slug                                   |
|--------|--------------------------------------|--------------------------------------------------------|---------------------------------------------------------|
| hw-g1  | Cartoon (bright cartoon, like home_cartoon_garden) | seaside boardwalk ice-cream stand -> icecream_cartoon_gen | backyard treehouse clubhouse -> treehouse_cartoon_gen |
| hw-g2  | Watercolor (storybook, like upon_storybook_attic)  | cosy village bakery kitchen -> bakery_watercolor_gen       | rainy-day greenhouse flower shop -> greenhouse_watercolor_gen |
| hw-g3  | Folk vector (Scandinavian folk-art flat vector)    | snowy cabin, knitting by the stove -> cabin_folkvector_gen | spring village beehive garden -> beehive_folkvector_gen |
| hw-g4  | Papercut (layered paper craft)                     | coral reef with fish and a diver -> reef_papercut_gen      | autumn forest campsite with tent -> campsite_papercut_gen |
| hw-g5  | Gouache (mid-century vintage illustration)         | café terrace by a city square -> cafe_gouache_gen          | farm vegetable garden at harvest -> harvest_gouache_gen |
| hw-g6  | Colored pencil (storybook sketch)                  | kids' blanket fort bedroom at night -> blanketfort_pencil_gen | meadow picnic with butterflies -> picnic_pencil_gen |

Do your two levels one after the other (or overlap them while waiting on jobs). Astra is shared: max 5 concurrent jobs
server-wide; on a usage limit the server pauses Astra 20 min - wait, never switch provider.

## Report
Per finished level: `clai ctl send "Hidden Words:opus-game" "<slug>: psb path, preview path, phrase, per letter
host+part+difficulty, usage (BG gens, edits, retries), problems"`. opus-game installs it in the game.
Tool problems -> "Hidden Words:opus-api" (service) / "Hidden Words:opus-detect" (detection/SAM).
Do not touch other projects, the game folder, or git (never commit).
