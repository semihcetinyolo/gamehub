# Hidden letters: measured prompt recipes

## Hard rule (user, 2026-11-06): letters are PARTS of scene objects; standalone letter objects only for EASY

Levels 5-10 (galley, gamenight, phonecall, camper, roadtrip, catgaming) were rejected for this: almost every letter was
a separate letter-shaped object dropped into the scene (wooden A on the wall, toy G, metal I, plaque M). That is wrong.

- **Medium and hard letters** must be formed by an object that belongs to the scene, from its own part, in its
  material and colour. The user's favourites (copy these): level 1 upon_storybook_attic - the green **A** in the
  spiral plant's tendrils, the **I** inside the lantern, the **N** in the bookshelf (books/shelf forming it), the **C**
  in the rocking horse's legs/rocker; level 2 home_cartoon_garden - the **M** and **W** in the flower pots; level 3
  quiet_photoreal_porch - the **G** of the kettle grip, the **E** of the fork.
- **A standalone letter-shaped object** (a letter cut from wood, a toy letter, a letter-shaped hook or sign) is allowed
  ONLY for EASY letters, and at most the easy share (~25%).
- Still required: every stroke is new pixels from the edit (the edit redraws the host part into the letter shape, so
  the whole letter flies), whole glyph visible, >= 100 px, blind read passes.
- Plan per letter: host object + which part forms it + difficulty. A plan where a medium/hard letter has no host
  object is rejected before any paid call.

## Hard rule (user, 2026-11-06, after camper_cartoon_r2 "çok kolay olmuş"): no letter-shaped fittings; real colour blend; min 50 px

camper_cartoon_r2 passed the rule above on paper but was far too easy: its brass E strap hinge on the door, the H hinge
and the D-ring pull were letter-shaped FITTINGS bolted onto a host, and the "hard" letters were only medium.
- **A letter-shaped accessory added to a host (hinge, handle, pull, hook, bracket, plaque, sign, sticker, ornament) is
  NOT a host part.** The letter must come from the host's own structure/body: stems, tendrils, rope/cord, window bars,
  chair/table legs and rails, folds of a plant, a lantern's filament, books standing on a shelf, a rocker's legs.
  (Easy letters may still be standalone letter-shaped objects, max ~25%.)
- **No letters drawn ON a surface.** A letter painted, printed, embroidered, appliquéd, braided or ribboned onto a
  flat face (side of a box/trunk, a jacket's chest, a skirt panel, a cushion, a wall) reads as a label/print, not as a
  host part (rejected: ladys_luggage_oil_r2 b7 jacket E, hat-box V, trunk I, heart-box R; red_gown_diner hem E/N).
  The letter must be the 3D structure of a thing (stems, legs, cords, folds that ARE the object), not a decoration on it.
  NOT forbidden (clarification): a letter formed by the material's OWN strands/texture in the SAME colour - weave
  strands of a hamper or rattan chair, knit ribs of a sweater, lace threads, wood grain, carved relief in the same
  wood/marble. That is how coffee_truck's hard F/E work. Forbidden is a letter in a different colour or material laid
  on the face (print, paint, ribbon, appliqué, contrasting embroidery, a block letter on a chest).
  Also not OK: a typeset-looking (serif/block) letter embossed into a texture - reading_fairy b7's basket R, blanket E
  and the S on the cat's fur read as labels even in the same colour. Texture letters are made of a few strands/ribs.
- **Medium letters: colour blend.** The letter's colour tones must be very close to the area it sits on (the host and
  the background right around it), same light and texture, so the eye does not jump to it; it is found by its shape.
- **Hard letters:** same colour AND texture as the host, inside a busy part of the scene, not seen at first glance,
  yet a complete, correctly readable glyph when zoomed.
- **Minimum glyph long side is now 50 px (was 100).** Smaller letters are allowed only when a player can still read
  them by zooming: the game zooms up to 4x on a phone (~390 css px wide), so judge the SCENE SCALE. In a close-up
  scene (big objects) 50-80 px is fine for hard letters; in a far/wide view with tiny objects keep letters larger
  (>= 80-100 px) so that at 4x zoom they are clearly readable, not a speck. Easy letters stay ~100-190 px.
- Check the achieved difficulty honestly after the build: if a "hard" letter is seen at first glance, it is medium;
  re-do it until the mix is ~25/50/25 in reality, not only in the plan.

## Background tip (learned 2026-11-06): ask the restyle for busy same-colour texture

Hard letters need somewhere to hide. ladys_luggage_oil_r2 failed after three passes because the restyled scene was
large smooth surfaces (marble, satin, gold rail); coffee_truck_gouache_r2 worked because it had wicker, rattan and
foliage. In every restyle prompt ask for several busy, same-colour textured areas spread over the scene (wicker/rattan,
knitwear, lace, foliage, patterned wallpaper/carpet, wood grain, stacked books, rope), while keeping calm free space.

## Hard rule (user, 2026-11-06): Hidden sources = BG layer only

NEVER produce a level from the full Hidden composite ("Hidden full", user 2026-11-06 11:3x). When a level starts from a Hidden PSB, use only its `BG` layer (all H/M layers off): `python3 tools/hidden_source.py bg
<psb> <out_dir>`. The full composite made levels 5, 6 and 9 far too crowded. Restyle/generate from that BG image.

## Hard rule: minimum letter size and production references

**Minimum glyph long side: 50 px since 2026-11-06 (see the rule at the top: scene scale decides; easy ~100–190 px).** Former: This replaces the former 5%-of-canvas-height / 120px minimum. Measure the actual letter, not a long handle, mounting stake, shadow, or candidate box. Plan its intended dimensions before generation and inspect its measured glyph after extraction. New levels follow this minimum. Existing accepted letters are grandfathered only with explicit user approval: quiet b5 preserves the other twelve b4 targets, with `allow_small` for G and shelf I if needed; its new I must meet the current minimum and should land in the 120–190px target band. The cartoon pot's small green T was rejected by the user.

Primary letter-production references: the user **LOVES** [upon_storybook_attic, ONCE UPON A TIME](../../projects/upon_storybook_attic/out/b2_preview.jpg), and likes [home_cartoon_garden](../../projects/home_cartoon_garden/out/b4_preview.jpg) very much. Follow their clearly readable complete physical letter objects and scene-matched materials. These are references for letter construction, not exceptions to the full-bleed rule below; the attic reference's paper margin must not be copied into new backgrounds.

## Hard rule: full-bleed background

The scene fills the entire canvas to all four edges. **No white or paper margins, vignette, torn or rounded painted edges, frame or border.** Include this requirement in EVERY scene prompt. Inspect the background before any letter edit; regenerate or use background/extend if it fails.

## Hard gate: the whole removable layer must be the letter

1. **Every stroke of the entire glyph must be NEW pixels added by the edit, complete and clearly visible; never folds, joinery or existing furniture parts left as they were.** For medium/hard letters the edit REDRAWS the host object's part into the letter (see the 2026-11-06 rule at the top), so the new pixels are the host part itself; a standalone letter-shaped object is only for easy letters. Never borrow an existing background spindle, leg, frame, stem or rail to complete a letter. A newly added diagonal between existing uprights is a stick, not an N target.
2. **Blend means a fully visible, complete letter made of the scene's material and lit like the scene.** It never means hiding or omitting strokes. All strokes must travel together when the target is found.
3. **Both checks are mandatory before every build:** the actual extracted RGBA layer alone on flat grey must read as the expected letter, AND the calibrated in-scene blind read must pass. Inspect the entire layer, including extra poles/handles; a tight scene crop must not conceal a broken or incomplete removable glyph. `plc.blindread(P, mode='all', runs=2, ...)` must pass scene, layer and flight glyph; it uses the actual build cutouts. Do not build before this gate passes.

An explicit user approval can override an automated reading miss when manual inspection confirms the entire glyph is present in the layer. Record the approved target and failed reading honestly; never fabricate a machine pass. The quiet fork E #35 remains explicitly approved. The earlier approval of bobbin I #26 was REVOKED after b4 gameplay: replace only that I for b5; keep the other twelve b4 targets unchanged.

These rules supersede historical host-construction examples below. The played quiet b2 failed because its chair Ns borrowed background uprights: only one new stick flew away. The earlier b3 was held for layer audit and is superseded by the completed revision described at the end of this guide. Door b1 files and letter art remain unchanged; the user subsequently authorized opus-detect to make a separate glyph-only rebuild without altering labels or scene pixels.

Lab date: 2026-11-05. Six background variants, six paid edit calls (a quoting error before one call was corrected; it did not send a request). Files: `lab/styles/contact.jpg`, `lab/letters/summary.jpg`, individual PNG + TXT pairs, `lab/letters/metrics.json`, and reproducible `lab/letters/analyze.py`. These are small-sample observations, not provider guarantees.

## Current calibration: natural material AND complete readable glyphs

**Latest user correction supersedes all earlier approval lists below.** Blend letters through physical materials, perspective and light, but do not sacrifice the letter. Every stroke must be continuous and present in standard proportions, upright within about ±20°, made by one coherent host part/object. No strokes inferred across unrelated objects, gaps or fold shadows. The letter edge must contrast with what is directly behind it as much as the host itself does. Target glyph long side is about 120–190px, with a hard minimum of 100px. No lone letter centered on a blank tile, plaque, panel or label; no painted glyph/sticker.

### Visual calibration references

- [Door reference](../../projects/door_stained_glass/out/b1_preview.jpg): isolated tile U/D/R/A/R/A/I/W and green Y are too obvious. L handle and S lantern are good easy targets; rope O on mat and Y bench are good medium targets; N in the bottom door frame is a good hard target.
- [Quiet rejected build](../../projects/quiet_photoreal_porch/out/b2_preview.jpg), [detail contact](../../lab/astra-letters/quiet_final_details.jpg): the latest user correction keeps ONLY both I targets, A flower stems, E fork and G kettle grip. Quiet Q/U/T/M/O/R/N/N must be redone. Earlier statements that quiet U/T/O or its folds/joinery were approved are withdrawn.
- Easy: clear letter-shaped physical part, found in a few seconds (A stems, door L handle/S lantern). Medium: requires a search, clearly a letter when found (E fork, G kettle grip, rope O). Hard: blends with host material/color but remains a complete correctly readable glyph on a zoomed crop (quiet I, door N). Unreadable is never a difficulty category.

### Plan the difficulty before generation

Aim at roughly **25% easy / 50% medium / 25% hard** within every level. For 13 targets use 3 easy, 7 medium, 3 hard. Write label, host, actual physical part, intended difficulty, position, height and defining strokes in the plan before any paid ask. After review, check the achieved mix; do not rename failures as hard targets.

### Blind read before labeling

Create an unlabeled sheet of scene crops, each showing roughly three times the letter's extent around it. Neutral cell numbers are allowed; never expose expected characters, phrase, labels, host hints, generation prompts or the planned difficulty to the reader. Have a fresh vision reader name the letter in each cell, or explicitly say unclear/ambiguous. Hard targets may use zoomed crops with the whole glyph and surrounding material retained. Record the sheet, independent answer and decision. A wrong/unclear read in a valid calibrated run fails: inspect the complete layer and scene, fix extraction if it cut off newly added strokes, otherwise regenerate, then use a fresh blind check. A failed control invalidates the run, not the art. Do not repeatedly pay for unchanged art to solve reader calibration. Apply to every target, including retained targets during recalibration. Designer inspection and a valid build report cannot substitute for this check.

### Add rather than replace when possible

Prefer a small added functional part/object whose own construction is the complete letter. Preserve the clean background's existing object underneath. Finding the letter then removes the addition instead of reverting a reshaped object (the old quiet Q changed a ball of twine into a coil, so discovery restored the ball). Inspect the clean BG beneath each new target during extraction. Keep natural material, shadows, wear and contact; adding a part does not permit pasted typography.

## Scene template

> FULL-BLEED image: the scene fills the entire canvas to all four edges, with no white/paper margins, vignette, torn or rounded painted edges, frame or border. A portrait 3:4 [photograph / specified art medium] of [scene fitting phrase], with [coherent real objects] distributed through foreground, middle and upper scene. Include structurally useful details: handles, frames, woven bindings, slat joints, curled stems, folds, seams, cords, lamp filaments and natural cracks. Give each object natural material texture, wear and lighting. Avoid broad blank presentation panels or a decorative perimeter of empty tiles. Keep the center as useful for hiding as the edges. Absolutely NO text, NO letters, NO digits, NO monograms, NO lettering, NO logos, NO watermarks, NO labels or signs. These are normal objects, not alphabet decor.

For actual stained-glass medium explicitly say that the whole artwork is made of glass/ceramic pieces, not merely a photographed room containing a stained-glass window. The first lab backgrounds returned 896x1200 through the CLI; production uses the service with native 2K and actual canvas dimensions. Do not enlarge tiny inputs for production crops.

## Letter-edit template: host + its own physical part

> Add one small [FUNCTIONAL PART/OBJECT] at [HOST/SPOT]. Every stroke is part of this NEW added object; do not reuse any existing background edge or object as a stroke. Its actual [material] construction forms a complete upright capital [LETTER]: [all defining strokes in standard proportions]. Glyph long side [120–190px target, at least 100px], tilt below 20°, nearly frontal. Difficulty [easy/medium/hard]: [specific contrast and placement]. It is a plausible physical part/object with the scene's material, light, wear, thickness and contact shadows; never a flat glyph, engraving, monogram or badge. Keep every stroke readable, including [distinguishing stroke]. Preserve every pre-existing object and unrelated pixel, so removing this addition reveals the original scene naturally. No extra text/digits/letters; no crop, zoom or lighting change.

Name a unique spot viewed in the clean crop. Materials and positions alone do not establish success. Inspect the actual glyph, then require the independent blind read. Avoid vague requests for letter-like folds, distant joinery or branching vines: the previous level showed that the designer can read intent where a player cannot read a letter.

### Five material references, rewritten for complete added layers

- **O / doormat:** “Add a new loose braided rope on the mat as one complete oval coil, its fibers, resting shadow and slight flattening matching the mat. The coil itself forms O, with no tail or crossbar. No O is printed onto the weave.”
- **L / door:** “Add a new complete door handle with an upright grip and a short horizontal foot, forming L. Same aged metal, mounting hardware, wear and reflection as the door fittings. No separate letter is attached to the panel.”
- **N / lower door frame:** “Add a complete small metal N brace: BOTH uprights and the diagonal are new, joined at their endpoints, in the lower door structure. Match neighboring metal/color/thickness and lighting. All three bars must remain a readable N when lifted away together; never borrow the existing door rails as strokes.”
- **S / lantern:** “Add one complete gently glowing filament inside the lantern that traces an open S, with its warm glow/reflection inside the lantern. Preserve the housing and glass boundaries. Do not print an S on the pane.”
- **Y / bench:** “Add one complete wooden Y support with two new arms and a new lower stem, joined together. Match the bench woodgrain and wear. The whole Y is removable; no existing bench slat supplies a stroke.”

## Density, scale and difficulty

- **Start with 1-3 physical host constructions per 1024 square.** The newer photoreal round showed that even one fork can fail its stroke count or orientation; inspect each result. The old four-letter glass successes measured glyph readability, not the stricter host-part art requirement. Five is untested; do not claim it is validated.
- Current target: glyph long side 120–190px, minimum100px; retain visible material strokes. Historical measurements follow and do not override this: Our best stained-glass result contains approximately 104 px Y, 90 px O, 90 px U and 45 px etched R. The etched R was readable when zoomed but is rejected by the current art gate; use a small structural detail for hard targets. The historical 45–60px observations are below the current minimum and are not an acceptable production target.
- Pixel dimensions are soft instructions. M/S became 120-200 px in the conservatory, and the porch doormat A grew to about 200 px wide. Reject or re-edit oversized target art if it dominates the scene.
- Mix easier functional silhouettes (handle U, forked slat Y) with medium material constructions (frame joints, twigs, vines) and complete harder components with restrained contrast. Folds or intertwined stems that only suggest strokes are rejected. Faint must still retain every distinguishing stroke. Do not use a nearly invisible target simply because an API candidate exists.
- For 20 targets on a 1536x2048 canvas, five non-overlapping 1024 squares are geometrically impossible. Use non-overlapping smaller target rectangles (each expands to a 1024 context square) in 2 columns and 3 rows, or sequential fill-up rounds. Overlapping context is acceptable because each edit is from the clean BG; kept letter masks must be disjoint.

## Historical art style findings — pre-feedback, not current approval

| Background | Useful hiding forms | Assessment |
|---|---|---|
| `stained_glass_entry` | leaf-shaped glass Y, vine O, brass U, etched glass R | Best overall; coherent decorative art, all 4 letters correct; coordinates need manual review. Preferred for first entrance level. |
| `cozy_porch` | coir weave A, green-painted engraving O, twig C, metal hooks | Strong atmosphere for the phrase. Dark textures raise difficulty; vague instructions lost C/A and hook T became ambiguous. |
| `mosaic_conservatory` | lead came M, vine S, basket wire I, ceramic P | Four legible letters; rich materials but large and obvious M/S, high redraw drift. A photo-like conservatory, not a true flat mosaic. |
| `cartoon_garden_shed` | hose O, fence grain R | Excellent legibility and lowest unrelated large-difference fraction, but tool Y is oversized and stepping-stone U is not unambiguous. Clear silhouettes need explicit shapes. |
| `storybook_attic` | potential stitching, wood engraving, thin wire | Background-only visual study; calm and readable. No letter edits tested. |
| `art_nouveau_courtyard` | potential ironwork, tiles, carving | Background-only visual study; beautiful but dense, already contains many alphabet-like curves. No letter edits tested. |

## Historical trial review — readability only; reapply current art gate

| Trial | Correct/legible at inspection | Placement, difficulty and failure modes |
|---|---|---|
| cozy porch 1, C A T O | O clear; T tiny at far-right; C fails (closed ring); A not clear enough | C blended back into wreath ring; doormat A too vague; right tool cluster was poorly specified. No definite extra typographic letters. |
| cartoon 1, Y O U R | O and R clear; Y oversized/ambiguous tool shadow; U fails | R at correct fence, O correct coil; U never forms a clean capital. No definite extras. |
| conservatory 1, M I S P | 4/4 | M/I/P at requested objects; S at middle shelf. M/S too large/easy; P very near edge. No definite extras. |
| cozy porch 2, C A T | C and A clear; T hook has curved base, potentially J-like | C is open, A has legs/crossbar but is oversized; T not safe for production. No definite extras. |
| conservatory 2, M S P | 3/3 | Reduced count and explicit strokes improved S; M looks like a mounted serif glyph, less natural than lead came. No definite extras. |
| stained-glass entry 1, Y O U R | 4/4 | Balanced easy Y/O/U and hard R. R shifted to upper-right lilac pane, U to adjacent pale pane. Accept actual positions only after checking collision and boundaries. No definite extras. |

All six edits returned 1024x1024, retained overall framing, and had integer FFT phase-correlation peak (0,0). This checks global translation, not subpixel warping or scale perfectly. Visual review found no large zoom/crop change. The rest of the image is **not pixel-identical**.

| Trial | Whole-image RGB MAE /255 | Outside reviewed letter boxes MAE /255 | Outside pixels with mean RGB difference >20 |
|---|---:|---:|---:|
| porch 1 | 8.039 | 7.501 | 7.353% |
| porch 2 | 8.155 | 7.473 | 7.537% |
| cartoon 1 | 8.150 | 6.314 | 1.840% |
| conservatory 1 | 12.218 | 11.368 | 15.306% |
| conservatory 2 | 11.838 | 11.278 | 15.125% |
| stained-glass entry 1 | 7.425 | 6.804 | 2.776% |

These are raw RGB differences, not perceptual quality scores; manually defined review boxes are deliberately broad. See metrics JSON for exact ROIs and all values. Keep only approved target masks over the clean BG instead of pasting the entire edited square. Inspect seams against underlying glass boundaries, shadow edges and texture.

## Acceptance checklist for each production round

1. Open returned full crop, candidate sheet and overview. Count actual characters including extras. Check complete strokes, upright orientation, 100px minimum glyph long side and 120–190px target scale and planned difficulty. Run the independent unlabeled blind-read step above before labeling.
2. Label every occurrence separately in phrase order (`L00_Y`, ..., `L19_N` for YOUR DOOR IS ALWAYS OPEN); repeated O/R/A/S are separate targets.
3. Drop drift and false candidates. Split merged letters; merge disconnected strokes only if they belong to one letter. Add or crop a bounded region if a subtle physical component was missed. Do not mistake a redraw blob for a letter.
4. Check containment, spatial separation and style. A detected target at an unplanned location may be accepted only if still safe and visually suitable.
5. Fill missing letters with new edits against clean BG. Run freespots to support placement; it does not prove the material is suitable.
6. Require a valid calibrated `mode='both'` blind read and visually inspect every actual layer on flat grey. Every stroke must be present in the layer, with no background-borrowed strokes. Then build with the full expected-label list and phrase/style metadata. A passing report checks structural validity, not visual correctness; inspect the full preview and per-letter details too.

## Sister-pipeline reference lessons (read-only study)

Read on 2026-11-05: `/Users/semihcetin/Downloads/HiddenLevelProjects/HiddenLevelRecreate/{CLAUDE,COMMON,RESTYLE,REMAKE}.md`, its `scripts/rs_astra.py` registration functions, and `HiddenLevelBot/FLOW.md`. No reference files were copied and none of their machine-specific shell wrappers were run.

- P1 uses exact existing placement, scale and angle from a reference, with the new scene supplying style/light and real occluders. For this project there is no old item reference: name a unique current surface and every essential letter stroke instead.
- P7 uses an outline to constrain a valid existing spot. Use only when a target shape keeps shrinking/moving; it cannot make an inappropriate placement sensible. An outline can also over-constrain the drawing.
- P10 preserves object identity and placement while redesigning the old muddy art. This is useful in principle for material letters, but measured 0.6-0.8x item-size drift in their pipeline is a warning to measure actual drawn size, not the intended box or an assumed fit. That range is their observation, not our Nano measurement.
- Name an actual occluder only when it covers the target; a nearby object is not an occluder. Pin specific neighbors to their current position/shape when a re-edit moves them. Fully visible letter strokes are preferable here unless enough remains for unambiguous reading.
- Native 1024 context avoids enlarging tiny crops and retains nearby scene structure. Global registration and local silhouette fitting are separate tasks. Fix a bad fit before paying for a new drawing.
- Their Astra answer step fits an affine transform to background pixels away from the object, rejects implausible transforms, then tone-matches away from the target. Their change-based paste seeks unchanged boundaries; blindly pasting a square or cutting through an altered object causes seams.
- Re-ask for a concrete defect, stop on a satisfactory result, and inspect full-size seams and per-target cutouts. A passing automatic report is not a human art approval.

## First service level: structural success; art partly rejected by user

`door_stained_glass`, **YOUR DOOR IS ALWAYS OPEN**, native 1536x2048. Background requested at 2K, Clai generation failed and the authorized Albert fallback succeeded. Edits all used Clai Nano with fallback none.

Six initial regions (four or three letters each) produced 20 readable attempts; 18 were accepted. One vine S crossed an existing leaf and read as 8. One etched R recolored its whole turquoise host pane cream. A single two-letter fill-up edit replaced both after consulting freespots. The correction named the surfaces that must keep their color and explicitly required open S ends and no crossing strokes. It still moved the S onto the other door leaf, but the returned position was clear and disjoint.

Seven edit calls across two rounds, all successful: Clai edits 7, Albert edits 0, failed/unknown edits 0. Background requests: Clai 1 failed, Albert 1 succeeded. Build `projects/door_stained_glass/out/b1.psb` has `report.ok=true`, all 20 expected labels, no overlaps/duplicates/missing/tiny targets. Four accepted moved targets retain outside flags, one braided coir O also multi. Full-size visual review and all four native-resolution quadrants showed readable characters and no obvious paste seams. The final design is easier decorative-letter hiding, mixed with several pale/engraved hard targets; it is not uniformly deep camouflage.

New failure pattern: “etch on pale glass” can recolor a neighboring turquoise pane to create the requested pale substrate. Pin the current substrate explicitly: “the turquoise glass remains turquoise; no panel may be recolored to make the letter visible.” For an S on a plant, require a single open curve and inspect every underlying line for an accidental closed loop. `lab/level/REVIEW.md` and `round1_decisions.json` record the review.

## Historical controlled Astra comparison — technique evidence, not current art approval

Two **identical prompts and clean BG squares** from the completed level were resubmitted with `provider='astra', fallback='none'`: Nano e002 vs Astra e008 (D/O/O), and Nano e006 vs Astra e009 (P/E/N). Both Astra calls succeeded on the first attempt. Evidence: `lab/level/nano_vs_astra.jpg`, native detail comparison `nano_vs_astra_details.jpg`, individual `e008/e009_*` files, `provider_metrics.json`, and reproducible `compare_providers.py`.

**Art:** both providers produced 6/6 correct uppercase letters at the appropriate named surfaces, without extra letters. Astra's D is a convincing thin bronze fitting; the wreath O has more dimensional green leaves; its engraved O is smaller and simpler inside. P has a deeper cut, E and N read as polished raised gold. Nano preserves the flat stained-glass illustration better and keeps P/N less conspicuous. Astra is attractive for easy decor targets, but the polished relief can make hard targets too easy and introduce a 3D appearance into flatter art. For this level, retain the all-Nano `b1` build. All 19 Astra candidates were reviewed and dropped as comparison-only, leaving 20 kept targets and zero undecided candidates.

**Size and registration:** Nano returned native 1024x1024. Astra returned **1254x1254**, normalized by the service to the sent 1024 square. After this size normalization both Astra samples retained the framing and geometry well: estimated max affine translation 0.16 / 0.12 px and max linear deviation 0.0002 / 0.0001, below application thresholds; `registration.applied=false`. Nano's best fit was identity. These two samples do **not** demonstrate the 2-14 px drift reported by the sister pipeline. Keep registration evidence/guards for other samples; do not assume that all Astra outputs drift, or that none will. The substantial actual size change was the etched O: approximately 103 px high in Nano versus 62 px in Astra; this is target-design scale, not camera zoom. Other measured letter silhouettes were broadly similar in size.

**Unrelated redraw and extraction:** Astra redraws more surrounding color/texture even with stable geometry. The detector produced 8 candidates for e008 (3 true letters + 5 drift candidates), and 11 for e009 (3 letters + 8 drift candidates). Nano e002 produced 4 (3 letters + 1 drift), e006 produced exactly 3. Astra D/P/E masks also include more host-surface redraw and would need crop/refinement before a production build. Registration alone cannot remove stylistic or tonal redraw.

| Pair | Provider | Time | Whole RGB MAE /255 | Outside common target ROIs MAE /255 | Outside pixels with mean RGB diff >20 |
|---|---|---:|---:|---:|---:|
| D/O/O | Nano e002 | 27.7 s | 7.231 | 6.311 | 2.110% |
| D/O/O | Astra e008 | 72.5 s | 10.948 | 10.204 | 10.142% |
| P/E/N | Nano e006 | 25.1 s | 6.722 | 6.393 | 1.421% |
| P/E/N | Astra e009 | 76.4 s | 10.534 | 9.961 | 9.416% |

Metrics use the same manually reviewed target-ROI union for each matched pair and raw RGB differences at 1024; they do not tone-correct or claim to measure perceptual quality. Requested pixel sizes remain soft for both providers. The former recommendation for shallow low-relief etching is withdrawn under the current art gate. Use restrained highlights on functional components and pin host material colors instead; this replacement is not yet an A/B-tested improvement.

Final service usage including comparison: **7 Clai Nano edits + 2 Astra edits, 0 Albert edits, 0 failed/unknown edits**. Including BG attempts: 8 Clai requests, 1 Albert request, 2 Astra requests. Two Nano production rounds plus one separate two-region comparison batch; no further paid re-asks.

# Addendum for recipes/hidden_letters/PROMPTS.md

## User art review of the first level — apply to future levels

The pipeline passed, but about half the first level's characters were too obvious. U, D, R, A, R, A, I and W, each isolated and centered on a plain cream wall tile, read as a letter-tile board. The standalone green Y had the same problem. Do not repeat this composition.

Aim for **at least 70% of targets built into an object or texture in its own color and material**, distributed throughout the whole scene, including its center. Good first-level examples: N in the bottom door rail, P in the terracotta pot, rope O on the mat, S hook, L handle, S in the lantern glass, E on the watering can. The remaining targets may be easier decor, but no character should become unreadable. An otherwise correct character fails the art brief if its treatment makes a prominent isolated glyph on an empty panel.

Plan the physical construction and host before the letter: a bent fastener, woven binding, twine loop, structural joint, branching stem, cloth fold or functional handle. Surface grooves/marks are not substitutes for this rule. Ask for local, restrained contrast and pin neighboring shapes/colors. Inspect the actual character, material integration, distribution and difficulty after editing; the prompt's intended construction is not evidence that the result achieved it.

For A QUIET MORNING there are 13 targets, so the working quota is at least 10 object/texture-integrated targets, with at most 3 easier decor targets. Labels begin at L01 as explicitly requested for this level.

## Tight Astra wording — two further matched-region trials

After original Astra e008/e009, exactly ONE extra ask per region was made: e010/e011. Same clean BG and target descriptions, prefixed with "Only the specified letter strokes change. Every other pixel of the image stays exactly as it is" plus explicit named neighbors/surface colors and restrained shading. Both succeeded, all six letters correct, 1254x1254 raw returned and normalized to 1024. Estimated shift 0.18 px / identity; no affine warp needed. Side by side: `lab/astra-letters/nano_astra_tight_comparison.jpg`. Exact prompts, result JSONs, candidate sheets, and `tight_metrics.json` accompany it.

| Pair | Nano outside-ROI MAE | Original Astra | Tight Astra | Outside pixels >20: Nano / original / tight |
|---|---:|---:|---:|---:|
| D/O/O | 6.311 | 10.204 | 8.340 | 2.110% / 10.142% / 6.774% |
| P/E/N | 6.393 | 9.961 | 8.077 | 1.421% / 9.416% / 5.956% |

The tight wording reduced unrelated redraw by about 18-19% MAE in these two samples, but did not achieve pixel preservation and remained worse than Nano. Whole-image percentage with maximum channel difference >40 was Nano 1.108/0.649%, original Astra 4.550/4.606%, tight Astra 2.732/2.346%. These metrics use fixed common target ROIs and no tone correction; do not compare them directly to another test using a different pixel statistic or scene.

Tight outputs still yielded 8 and 9 candidates, only three real letters per output; N/P/E candidates can contain changed host pixels and require refinement. The detector was updated between original and tight trials, so candidate-count differences do not isolate the effect of wording. The raw image metrics are independent of that update. All comparison-only candidates were reviewed and dropped; the selected all-Nano b1 remains unchanged.

**Provider verdict:** default to Nano for physical fabric/rush constructions, wood joints, stems, functional fittings and patches that must preserve surrounding art. The faint-engraving examples above are historical technique tests, not approved current art. Astra is an optional rescue for a well-bounded physical decor object when Nano's shape/material is poor: e.g. a twig wreath or delicate metal fitting. In this matched study its wreath leaves and thin D fitting were attractive, but brighter/rounder material can make the letter less hidden. There is no demonstrated Astra advantage for faint engraving or stricter registration in these samples. Use the tight wording on Astra and inspect the host boundary; one targeted comparison is enough unless a real defect remains.

## Historical quiet b2 production: pipeline passed, readability rejected

`quiet_photoreal_porch`, A QUIET MORNING, 13 targets, native 1792×2400. Final `out/b2.psb` / `out/b2_preview.jpg`, report.ok true, all labels and no overlap. Evidence and detailed decisions: `lab/astra-letters/QUIET_REVIEW.md`, `quiet_final_details.jpg`, `final_sheet.jpg`, `final_b2_report.json`.

Physical geometry worked better than texture instructions: actual curtain rope, shelf reinforcement, window latch, linen peaks, vine branches, table/chair braces, thread bobbin and kettle grip. Reject even matching-colored little reed letters when they sit on a basket face instead of being its construction. Requests for craquelure, engraving or knitted letters easily become pencil marks or monograms; those outputs were dropped.

A three-tine fork intended as E failed twice in Nano (four tines, then wrong orientation). One bounded Astra rescue produced three right-facing tines with a vertical back, a correct E made by the utensil itself. This supports the existing optional-Astra recommendation for a small physical metal object when Nano shape fails. Astra still redrew other textures; crop to the object and discard drift. It is not evidence to switch all edits to Astra.

Four edit rounds: 12 Nano + 1 Astra calls, no failures, Albert 0; one additional successful Clai BG request. Large real structural Ns carry big flags but blend more naturally than small applied monograms. This historical acceptance was WRONG: each N layer was only a stick, with other strokes borrowed from the background. Both in-scene and complete-layer reading are now required. Crop mask drift before final build: a 138-pixel bobbin/towel overlap in interim b1 was resolved without another paid edit.

The latest user correction rejects eight b2 characters despite its passing structural report. The earlier claim that all thirteen were readable was overconfident; the independent blind-read gate above is mandatory.

## Quiet revision evidence: scene pass is insufficient without a layer pass

The independent blind checks caught defects the informed designer had accepted: the old shelf I was interrupted by the shelf rail; the vine R hid its stem/bowl junction; successive plant Ns hid endpoints or extended uprights below the diagonal joint. A correct guessed character is insufficient when the reader flags missing defining joins. The shelf fitting was moved entirely below the rail, and R became a visible bronze blanket-retaining pin.

Use relative size anchors together with pixels: “half the height of the terracotta pot” constrained a plant support better than “140px” alone. For an N explicitly connect the diagonal to the TOP LEFT and BOTTOM RIGHT ENDPOINTS, with equal upright heights and no extensions; otherwise the model can build a trellis that only vaguely suggests N. Place the full glyph above the foliage, not merely the top half.

Keep rect dimensions <=1000px when requesting a 1024 context. An accidental 1030px-wide rect in e015 produced a non-square fallback crop on this canvas; it was dropped and redone with a verified 1024 square. Inspect the actual `edit.box` and sent image before interpreting provider quality.


### Calibrated three-view acceptance recipe

```python
br = plc.blindread(P, mode='all', runs=2, model='opus', tile=400,
                   rois={candidate_id: [glyph_x0, glyph_y0, glyph_x1, glyph_y1]},
                   zoom={hard_candidate_id: 1.5})
```

Scene ROIs focus the reading on the actual glyph when a mounting pole/handle extends its bounding box; they do not change extraction. The layer view must show the full extracted cutout on grey, not an isolated screenshot that borrows background strokes. Save both sheets and the raw result. Require valid controls and expected reads for both modes, and manually verify every defining stroke belongs to the added object. Do not infer complete-layer success from an older response that has no layer-mode results.

The held quiet b3 passed calibrated scene r8 (13/13 majority; all controls correct; 12 targets 3/3, user-approved original bobbin I 2/3). Its new chair N is a fully added hanging frame, and its new herb N has a fully added three-stroke head. See `lab/astra-letters/layer_manual_audit.jpg` for the real exported b3 layers, including all parts that travel. The earlier scene-only pass did not test this. The original bobbin must remain unchanged per explicit user instruction; retain it as hard and report borderline reads transparently. Cropped/zoomed reader effort is not the planned full-scene difficulty: planned 3/7/3 easy/medium/hard does not establish actual player search times.


### Whole-piece failure modes measured after the layer gate

Quiet's long-handled E fork and thin N head on a long stake passed focused scene crops but failed the whole-layer reader. Their replacement compact E-shaped pastry comb (no protruding handle) and complete three-rod N frame (no mounting pole) pass BOTH modes twice with valid controls in r13. Each whole extracted piece is now the letter. A recognizable glyph at one end of a much larger object is insufficient. Candidate b3 layers and revised layer contact are under `lab/astra-letters/layer_manual_audit.jpg` and `complete_object_layers.jpg`.

Resolved by explicit user decision: KEEP original cylindrical bobbin I #26 and RESTORE original fork E #35 unchanged. Their complete physical objects are in the extracted layers, and user approval overrides automated misses. The e029 E and e028 flat winder are dropped. Retain only e030 compact N from this last generation batch. Do not report either approved exception as an automated layer pass.


### Final quiet acceptance decision

Original fork E #35 and bobbin I #26 are retained by explicit user approval after inspection of their complete layers. Ten other retained targets passed layer r12; replacement compact N #80 passed both scene and layer r13 twice with every control correct. All retained original targets passed scene r11 three times. No further image generation was necessary. Total image usage: 26 Nano + 4 Astra edits, zero provider failures; one successful Clai background. Revision cost since b2: 17 edits across 10 batches (plus the earlier 13 edits across 4 batches). Planned difficulty remains 3 easy / 7 medium / 3 hard; these are design intentions, not measured play-test timing.

Completed output: `projects/quiet_photoreal_porch/out/b4.psb` and `b4_preview.jpg`, report.ok true, 13 complete targets and no overlaps. `lab/astra-letters/approved_final_layers.jpg` shows actual exported layers on grey; E/I unchanged at pixel level. The build report truthfully retains their missing automated layer-pass warnings under the explicit user-approved exceptions. Full review: `lab/astra-letters/READABILITY_REVISION.md`.


### Quiet b5: bobbin approval revoked after gameplay

User accepted twelve other b4 letters and rejected the bobbin I. b5 replaces only it with complete brass I #83. All twelve other scene layers are pixel-identical to b4. Nano e031 failed permission403; Astra e032 succeeded. Requested165px returned103px core (107px exported glyph), above revised100px minimum but below preferred120-190. Measure returned art rather than trusting requested size. A manually selected metal silhouette excludes surrounding towel redraw. Scene+layer r15 and scene+flight-glyph r16 passed twice with all controls correct. b5.psb/b5_preview.jpg: report.ok true; old G uses explicit small-target exception. See lab/astra-letters/READABILITY_REVISION.md.


### Galley watercolor: complete objects and extraction review

The source-restyled `galley_watercolor` uses separately added hooks, rope rings, compact metal tools, a peg rack and a wooden stand. Final r3 reads all twelve targets correctly in scene, scene-layer and flight-glyph views, twice, with every control correct. Evidence: `lab/astra-letters/galley/blind_final.json`, `glyph_review.jpg`, and `scene_review.jpg`. Planned search difficulty is 3 easy / 6 medium / 3 hard; zoomed scene-crop effort was 9 easy / 3 medium / 0 hard, so it does not verify the full-scene search distribution. Several objects exceed the preferred 120–190px band; do not present requested size as measured size.

Two extraction lessons:

- Astra's compact copper U/P and red H were readable, but automatic cutouts retained wall, hat or stool fragments. SAM flight-glyph masks remove these without regenerating the art. A scene-mask replacement and a glyph replacement are separate operations: use `op: mask` without `glyph: true` to tighten a scene mask while preserving its reviewed SAM glyph. Inspect the recomposed scene for shadow seams afterwards.
- Automatic reader crops can trim a real letter stroke as if it were a mounting stem. The P's complete cutout is 169px tall, but the crop heuristic reported89px after trimming its lower vertical. A full-object explicit ROI corrected the test (r4: all three modes pass twice). A neighboring S also contaminated the first O's default scene crop; an explicit whole-O ROI with moderate zoom fixed that. Never use an ROI that excludes a defining stroke. Layer and flight views still show the entire cutout.

Successful metal-object rescues do not establish that Astra preserves nearby pixels. Seven SAM asks were used on A/D/E/P/U/H/T to remove background fragments and preserve counters; this is extraction work, not new letter art. A cord crossing the D required a small reviewed mask closure. Avoid occluding a closed letter contour in new prompts when possible.
