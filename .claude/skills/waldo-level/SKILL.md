---
name: waldo-level
description: Generate a new Waldo find-the-character level (quest_projects/Waldo) from a background with Marla - PSB with BG + groups of H layers, then add it to Waldo/game. Use whenever the user asks for a new Waldo / hidden-character / "bul" level, a new background level, or a level like beach/park.
---

# Waldo level generation

The output is `Waldo/output/<bg>_waldo.psb`. It has the same structure as `Waldo/psb_example/10163.psb`:

- `BG` layer: the clean background.
- One group per target feature. The group names are CamelCase and the user picks them or lets you pick (e.g. `RedBalloon`, `YellowRaincoat`, `Handstand`).
- A `D` group with the distractors.
- Every layer inside a group is named `H`: the character plus a soft patch of its own background.
- No `E`/`M` layers.

Do not call `fa/duration` or `fho/duration` for solve time unless the user asks.

## Design rule: the feature must not give the answer away

**Every target feature also has to appear on characters that are NOT targets.**

In the park level only the target pandas had red balloons. The player tapped every red balloon in sight and finished the stage without searching. The target is *main character + feature*. Never make it the feature alone.

For each target group, also place **feature decoys**. These are other characters carrying the same feature. Examples for a panda level:

- zebras holding red balloons
- dalmatian dogs in yellow raincoats
- penguins / cows doing handstands

Pick decoy species that look like the main character at a glance, such as black-and-white animals for a panda. The player then has to check both *who* has the feature and *whether* it has the feature.

### Near-miss decoys (user, 2026-10-16)

Also add decoys that carry a **slightly different version of the feature**. The player then has to check *which exact* feature it is, not only that one is there. Mix two directions:

- **the main character with a near-miss feature**, e.g. in a red-balloon stage a panda holding a blue balloon;
- **a decoy species with a near-miss feature**, e.g. a zebra holding a yellow balloon.

These are only examples; do not copy them. Invent the variation that fits each feature. A near-miss changes one property of the feature and keeps the rest:

- colour (red vs blue, striped vs plain)
- shape or type (round vs heart-shaped, a beanie vs a cap)
- count or size (one vs two, big vs small)
- direction or side (hanging by the tail vs by the paws, left arm vs right arm)
- a related item from the same family (a vinyl record vs a cassette)

The difference must still read clearly at play zoom; a near-miss the player cannot tell apart is unfair. Near-miss decoys go in `D` and are marked by eye on the detection sheet like the other decoys.

### Decoy counts

Plan these numbers up front and tell the user:

- Per target group, 4–10 decoys in total, split between exact-feature decoys (other species) and near-miss decoys (main character and/or other species). Vary the split per group: one group may lean on near-misses, another on look-alike species.
- Use 1–2 decoy species per group.
- They go in `D` together with the plain main-character distractors.
- They are extra, on top of the counts the user asked for (e.g. 10+10+10+40). Ask for more only if the user wants it harder.

## Design rule: blend in and hide (user, 2026-10-14)

The level should feel like a hidden-objects level, not a crowd standing in plain view.

**Pick a character that blends with the background's palette.** Before choosing it, look at the dominant colours of the bg.
- Choose a character whose body colours sit inside that palette, so at a glance it melts into the scene. Examples:
  - a warm orange/brown room: fox, red panda, ginger cat, brown bear cub, squirrel
  - a green park: frog, turtle, green dragon
  - a sandy beach: crab, sand-coloured dog
  - a snowy bg: polar bear, white rabbit
- Pick the feature decoys from the same palette.
- Counter-examples: the grey koalas in the orange living room and the black-and-white pandas on the green park stood out too much.
- The target **feature** still has to be readable once the player looks closely. The character body blends; the feature is what gets checked. The feature may use a colour that fits the scene too, as long as it is distinct on the character.

**Hide both H and D characters, often.**
- About half of all characters (targets and D alike) should be partly hidden:
  - peeking from behind furniture, doors, plants, railings or walls
  - inside baskets, boxes, shelves or cabinets
  - under tables, behind cushions
  - half-covered by a foreground object
  - small in a corner, or blending against a same-coloured surface
- The rest are in the open, but tucked into busy spots rather than on empty floor.
- Avoid rows of characters standing front-facing in open space.
- For a hidden target, the identifying feature still has to show:
  - the guitar neck sticks out
  - the sweater sleeve is visible
  - the raised arm is above the cover
- Write this into each region's descriptions: "peeking out from behind the armchair, only head and the raised arm visible", "curled up inside the wicker basket, green sweater showing", etc.
- Mix sizes slightly with perspective; characters further back may be smaller.
- When choosing between extras in build.py, prefer keeping the hidden and blended ones.

## Design rule: vary the structure between levels (user, 2026-10-15)

- **Stage mix and order change per level.** The first entry in `GROUPS` is the first stage. Check the previous levels before choosing, and do not reuse the same mix of feature types or the same order. Never always end on a pose stage. Past levels: park = tongue out, sunflower, red cap; living room = white beanie, upside down, vinyl record.
- **Decoy counts change per feature and per level.** Never 6/6/6. Pick different numbers per group (e.g. 4 / 6 / 9), vary the exact-vs-near-miss split, and set them in `TARGET`.

## Design rule: no visual glitches (user, 2026-10-15)

Before installing, look at every selected H in context (not only the quadrants), at about 300 px per tile, and drop or fix:
- a body part without its owner (a tail by a door handle, a lone arc of fur);
- blurry or smeared characters (a melted squirrel);
- a character on a square patch of different art (a floating planter, a blurred bush);
- a straight cut where the patch ends.

`checkh.py WORK` flags hard alpha cuts automatically. `build.py` fades H layers out near the patch edges (`EDGE_FADE`). `fixcore.py ... carve` removes a leftover tail from a core; drop the carved piece.

Other design rules:

- One feature per character. A main character never has two target features (balloon + raincoat happened 3 times in park).
- Decoy species never carry the main character's look. Feature decoys only borrow the feature.
- Placement is natural and mixed, with no hints, labels or text.
- Every feature stays clearly visible at play zoom.
- Pick features that read at ~200 px: a strong colour (red, yellow) or a distinct silhouette (upside down). Avoid tiny accessories.
- Each level gets a NEW reference character, chosen by you unless the user names one. It does not have to be human. Its colours must fit the bg palette (see above).

## Choosing features: be creative (user, 2026-10-16)

There is no fixed recipe of "one object, one worn item, one action". That was only an example from the user. Choose any features that make a fun, readable search, and fit them to the level's theme and background. Any mix is allowed, including two of a similar type in one level. Ideas, not a checklist:

- something held or carried (an umbrella, a fishing rod, an ice cream)
- something worn (a scarf, sunglasses, a crown, a cape)
- a pose or activity (sleeping, waving, reading, juggling, on one leg)
- a body marking or colour variant (a spotted one, a white-tailed one)
- a companion (riding a duck, with a tiny bird on its head)
- a state or expression (wet, sneezing, wearing a bandage)
- a situation that fits the scene (in a teacup at a café, on a surfboard at the beach)

Each feature still needs a clear near-miss variant for decoys (see above), must read at play zoom, and must be something the image model can draw reliably.

## Pipeline (cheap: one Marla call per region, not per character)

**Edit cost is what matters (user, 2026-10-16).** Every Marla edit call costs; my own token use does not matter here. Goal: about 20–25 calls per level instead of 44, with the same quality.
- Bigger regions with more characters per call.
- Exactly one combined fill round, never a string of 1–2 character fill regions.

Tools are in `Waldo/tools/regions/`; `README.md` there has the commands. The API token is at `~/.config/marla/token`.

1. **Project.**
   - `marla_api.create_project`, then `upload_background`.
   - Save the doc with `background` and `edits_background` set to the uploaded path; upload alone does not set them.
2. **Reference character.**
   - Make one rect edit on empty ground: "exactly ONE <character>, front view, fills ~85% of the region".
   - Crop the changed pixels to `ref_char.png`, copy it to `output/<bg>_character_ref.png`, then delete that edit from the doc.
3. **Plan** in `plan_<bg>.py`.
   - Use about 15–18 non-overlapping rects of **~1000–1300 px**. Each holds **5–7 characters** described by scene landmarks. Leave at least ~200 px between characters inside a region so the model does not merge them.
   - Leave **one or two ~1200 px spots empty** in round one as reserve for the fill round.
   - Mix the kinds across regions, including the feature decoys (give them their own kind letters, e.g. `Z` = zebra with balloon).
   - About half of the items in every region use a hiding spot (behind/inside/under scenery, partly covered), with the target feature still showing. See "blend in and hide" above.
   - **Ask for ~15% more of every kind than needed.** Extras are dropped for free, because BG stays clean. Do not ask for more than that; living room v2 asked for 131 characters to use 88, which wasted many calls.
   - Keep characters away from region edges. Do not put two regions' characters near the same spot.
   - Render a layout preview with the rects to check the landmarks.
4. **Test.** Run `gen.py` on 2 regions first and look at the result.
   - Check that each big region delivered all 5–7 characters, with one feature each and none merged. If it falls short, shrink the regions to ~900–1000 px with 4–5 characters and re-plan; do not keep going with a size that misses.
   - Then submit the rest in batches of about 4 regions.
   - The job is sequential, about 1 min per region; poll the queue.
5. **Detect.** Run `detect.py`, then look at `sheet.jpg` once.
   - Colour checks cover red/yellow features. Handstands and **species (main character vs decoy)** have to be marked by eye on the sheet; panda, zebra and dalmatian are all black-and-white.
   - Use `split.py` for a blob that holds two side-by-side characters.
6. **Build.**
   - Run `build.py ... --drop --kind --allow --pairs`.
   - It drops pairs from different edits that overlap. The server's paste mask grows past the rect, so models draw into neighbours.
   - For each kept H, the owner map only competes with kept characters, same-edit characters and copies present in that patch.
7. **Check.** Look at the composite in 4 quadrants and zoom on dense spots.
   - Typical faults: flat-cut heads, ghost limbs, rectangular patch edges.
   - **Shortfalls: one combined fill round.** Collect every missing kind across all groups first, then put them all into the reserved spots, 5–7 characters per region, in a single batch. If there is no reserve left, `freespots.py WORK [N] [W] [H]` finds the largest empty rects (no character within 120 px) and draws them on `freespots.jpg`. Never send a fill region with only 1–2 characters.
   - If after that only a few plain `D` characters are missing, accept the shortfall (e.g. 37 instead of 40) rather than paying for another round. Target groups must still reach their full count.
8. **Verify the PSB.** Re-open it and check:
   - version 2, size 4096²
   - group counts, every layer named `H`
   - BG identical to the source image
   - `composite(force=True)` ≈ preview
9. **Add to the game.**
   - Run `python3 Waldo/game/tools/extract.py ../output/<bg>_waldo.psb`.
   - Add the stage texts to `Waldo/game/tools/labels.json` **before** extracting. They are keyed by level slug, then group name. Each one names the character and its feature, in the plural: "Koalas With Blue Guitars", "Pandas In Yellow Raincoats", "Disco Dancing Koalas". Never use the feature alone, such as "Blue Guitar's"; the user rejected that.
   - Add the manifest to `LEVELS` in `game.js` and bump `ASSET_V`.
   - Smoke-test with headless Chrome (playwright at `~/Library/Caches/ms-playwright/chromium-*`).

Marla call counts so far:
- beach: 90+ (per-character approach)
- park: about 33
- living room: 43, for 88 characters including feature decoys
- park v2 (frogs, blend + hide): 44, for 90 characters including 20 decoys
- living room v2 (red pandas, blend + hide): 44 plus one failed 32-region job, for 88 characters including 18 decoys

Notes from living room v2 (red pandas in the orange 70s room, 2026-10-15):
- **Submit in batches of about 4 regions** (still true with bigger regions) (`gen.py WORK PLAN 1 3 4 5`, one batch after another). When one region fails ("the image model drew an unrelated picture 3 times"), the whole job fails and nothing is kept; a 32-region job was lost that way.
- **Later batches see earlier characters.** Each patch keeps the characters of earlier edits as context. `regrow.py` now subtracts them (via `depends_on`); without that, cores swallowed neighbours and `build.py` reported false overlaps.
- **Overlap pairs:** open both crops (`patches/<edit>.png` around the box). If the later patch no longer shows the earlier character, the spot was redrawn: drop one (keep the kind that is short). If both show up side by side, pass `--pairs`.
- **Manual fixes:** `fixcore.py WORK add|carve|keep ...` adds a missed head, carves a second character out of a blob, or cuts off a neighbour's tail. Keep the merge/split/fix commands in a small redo script, since re-running `detect.py` resets them. For a fill round, detect, then append only the new region's characters (renumbered) to the fixed `found.json` and regrow just those.
- **Upside-down pose:** pandas crawling head-first down furniture are not "hanging upside down"; drop them and keep only clear hangs (body vertical, tail/legs holding on).

Notes from park v2 (green frogs on a green park, 2026-10-14):
- **Matching colours break detection.** When the character's colours match the bg, `detect.py`'s shift-tolerant diff finds only fragments, and fill rounds can come back empty.
  - Run `regrow.py WORK --merge a+b,...` after `detect.py` and after every `split.py`. It regrows each core from the plain diff of its own patch and merges fragments of one character.
  - Give the plan a `tol_r(region)` hook that returns a small shift (2) for later rounds. Keep 8 for round one so the ids stay stable.
- **Re-run after each round.** After each extra round, re-run `detect.py` from scratch, then `regrow.py`, then any `split.py`. The ids of earlier characters stay stable; check by comparing boxes.
- **Hidden targets.** Hiding descriptions work well: characters peek from boots, windows, crates or watering cans. But a feature sometimes ends up alone, such as a sunflower whose frog is outside the core. Mark those `X` (dropped) on the sheet.
- **Stage icons.** The automatic icon picks a hidden character. Pass `--icon` overrides for an open, standing character.

Notes from the living room level (koala, 2026-10-14):
- **Source size:** the source bg may be 8192²; downscale it to 4096² first.
- **Plan hooks:** a plan for a non-panda character defines `is_head(st, area)`, `is_prop(st)` and `features(c)`, plus `D_KINDS`, which lists the plain and decoy kinds that go to `D`. Plan items are `(kind, where)` for the main character and `(kind, species, where)` for decoys. `detect.py` has blue/green/grey colour stats.
- **Model failures:**
  - It sometimes merges two features on one koala (disco + guitar). Drop those.
  - It draws the same character twice across neighbouring regions. `build.py`'s overlap check catches this.
  - Pass `--pairs a-b` only for overlaps that look natural (one koala behind another).
- **Splitting:** `split.py WORK ID L R [CUT_X]` takes an explicit cut when the automatic cut slices a character. To merge two pieces of one character (one occluded by a railing), union their cores into a new id.
- **Free spots:** for fill rounds, find empty rects with a coverage map of all found boxes, padded by ~100 px.
- **Stage icon:** `extract.py --icon=<stage>:<n>` overrides the automatic icon when it picks a character with scenery in it, such as bar-stool legs or a railing.

## Report to the user

Write in Turkish and keep it short:
- the character, the groups and their counts, and the feature decoys
- the number of Marla calls
- what was checked
- known rough spots

Do not narrate the steps.
