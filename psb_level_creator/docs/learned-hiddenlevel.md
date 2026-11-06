# What we took from HiddenLevelProjects (2026-11-05)

Source (read-only, not copied): `~/Downloads/HiddenLevelProjects`. This is a sister team's hidden-object pipeline:
- `HiddenLevelRecreate` restyles or remakes shipped levels with Astra (GPT image through Clai), Sunburst and Leonardo.
- `HiddenLevelBot` cuts items out of a finished illustration with SAM, Nano completion, polish and removal.

We read `CLAUDE.md`, `COMMON.md`, `RESTYLE.md`, `REMAKE.md`, `HiddenLevelBot/FLOW.md`, `scripts/rs_astra.py`
(`answer`, `register`, `fit`, `cut`, `build`) and `scripts/bg_fix.py` (`paste`).

## The problem they share with us

Every edit model redraws the whole square, not just the object it was asked for:
- **Nano** answers come back in place, a shade off.
- **Astra** answers come back shifted by 2–14 px (more with several input images), sometimes scaled or turned a little. They are a shade off too, with textures re-rendered.

A plain diff then marks every edge in the square. A layer cut from the answer also brings the redrawn texture into its soft rim, which shows up as doubled lines or a seam. Their fixes:
1. Register the answer onto the BG.
2. Match its tone.
3. Paste only what really changed, so the cut runs where nothing changed.

## Adopted

| Their idea | Where it lives in ours | Notes |
|---|---|---|
| **Register the answer** (`rs_astra.py register`): phase correlation, then an affine ECC fit away from the item. A wild fit (\|A−I\| > 0.1 or a shift > 40 px) keeps the answer. | `plc/register.py`, called by `plc/edits.py` when the answer arrives (`apply_fit` for astra; Nano is only measured). `detect.load_answer` registers lazily for older edits (`answer_reg.png` + `register.json`). | Changed from theirs: (1) ECC runs coarse to fine (1/4 → 1/2 → full), from both no shift and the phase shift. (2) It is refitted without the pixels that still differ, instead of masking out the whole rect. (3) The lowest residual wins, with no warp included as a candidate. Masking out our rect left too thin a ring: on a synthetic 9 px shift the fit stuck at 1.3 px. (4) Pixels the warp pulls in from outside the answer get the BG's own pixels. Tested on scale 0.97–1.03, shifts of 9–14 px and 0.5° turns, with letters drawn in. |
| **Tone match** (one gain per channel from the pixels far from the item) | `detect.tone_fit` / `edit_tone_fit`, already there | Ours matches moments (mean and std of blurred images). A per-pixel regression drags the gain towards 0 on a shifted redraw. |
| **A pixel the BG explains within ±3 px is BG** (`cut`: `D3`) | `build.target_layer` (`d3`) | The detector already used a ±6 px shift-tolerant diff; the build now uses ±3 px too. |
| **Paste only what changed** (`cut`'s weight `wgt = clip((blur(D3,3) − 12) / 18)`, with every pixel inside the item taken from the answer; `bg_fix paste`) | `build.target_layer`: layer RGB = BG + (answer − BG) · wgt, with wgt = 1 on the mask. Params `keep_lo` / `keep_hi` = 12 / 30. | Outside the letter, the layer shows the BG's own pixels wherever the model only re-rendered the scene. The soft rim then adds no texture seam (tested: rim median diff to the BG ≤ 2 levels; without the weight the test fails). |
| **The area = the core plus the changed pieces that touch it** (a shadow, the arm it redrew in front), holes filled, with a short fade | `build.target_layer`: mask + changed pieces (blurred ±3 px diff > 30) within `reach` = 16 px, holes filled, grow 3 + fade 6 px | This keeps a plaque's shadow or rim with its letter. The fill is harmless because unchanged pixels inside it are the BG's own. |
| **Never cut up to the square's edge** unless it is the canvas edge (`bg_fix paste`) | `build` `edge_fade` (was already there) | |
| **Checks per build:** start view = original, no fragment left when a group is hidden, PSB read back (`checks.py`, `verify.py`) | `build.psb_check` and the report | By construction our BG is clean and a hidden letter shows the BG, so no ghost check is needed. Overlaps are reported as errors. |

## Rejected (and why)

- **The fit of an old H onto the answer** (`rs_astra.py fit` and `fithint`, scale ±15 %, agreement and cover flags). That solves *their* problem: the same old item must sit on a redrawn S. We have no prior layer to fit; the candidate is whatever changed.
- **SAM → Nano completion → polish → removal** (HiddenLevelBot). It cuts objects out of a finished picture and then paints the hole. Our letters are drawn onto a clean BG, so the BG is already the "removed" state and the layer is the edit's own pixels. Their numbers also argue against it here: about 2 SAM + 3.5 Nano calls per finished item.
- **`rs_hdraw` (H drawn by Astra with `--transparent`, then set back by alpha IoU).** It gives a separate complete H for a tray icon when the item is partly hidden in the scene. Letters are mostly fully visible, and the Hidden Word game reveals the letter in place.
  - Worth it later only if the game wants a clean tray glyph per letter, or if a letter is mostly hidden. Then one transparent Astra ask per letter, set back on the layer, would do.
  - Not built.
- **Wide feathered seams between old and new pixels.** They rejected these ("abuk duruyor"). We kept our short 6 px fade: with paste-only-what-changed, the rim's unchanged pixels are BG anyway, so no wide feather is needed.
- **Model judges (Astra) as gates.** They found these unreliable (a 96 score for a malformed bag). Our sheet and overview are evidence for the calling agent, not an automatic verdict.

## Still open

- **Real Astra answers have not been tried yet.** Registration is tested on synthetic warps; the first real Astra edit should be checked: `register.json` `residual` vs `identity_residual`, and the sheet.
- **Astra re-renders texture more than Nano.** On a box whose rect fills almost the whole square there is no quiet area to measure that drift, so the thresholds fall back to the median. If real astra edits come back noisy, a per-route preset (`edit["via"] == "astra"` → higher `thr` / `sig_thr`) is the next step.
