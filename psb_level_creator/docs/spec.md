# psb_level_creator — design spec (2026-11-05)

## Goal

A local HTTP service that builds hidden-object levels as layered PSB files, driven by **agents through API calls**
(no human prompt, no Photoshop). It replaces the paid Marla Edit calls with Odin's cheaper edit route: Nano Banana Pro
through the **Clai team pool** first, **Albert** only as a fallback.

First user: the Hidden Word game (every letter of a phrase hidden in the scene). Later: Waldo
(`../Waldo/tools/regions/*` can switch from `marla_api.py` to this client).

The service never plans anything. Callers (agents) choose prompts, rectangles and labels; the service runs the
generation, finds what changed, and returns evidence (sheets, overlays, flags) so the caller can decide.

## Sources we port from

- **Odin** (`ref/odin`, clone of Yolo-Game-Studio/Odin, read-only reference):
  - `bridge/clai-edit.mjs`: Clai `/v1/images/edits` call (Bearer = `~/.config/claiface/key`, model `gemini-3-pro-image`,
    `max_wait` 180 s, `image_size` 1K/2K, `aspect_ratio` 1:1 for squares, response `data[0].b64_json`,
    header `x-claiface-image-channel`). `CLAI_URL` / TLS handling: see `bridge/sam.mjs`.
  - `bridge/nano-edit.mjs`: `editArea()` square rule (512/1024/2048 square around the rect, kept inside the canvas;
    squares come back in place), Clai first → Albert once on any Clai error, answer resized back to the box.
  - `bridge/image-api.mjs`: Albert `/api/tools/image-generator` call (fallback route; token `~/.config/marla/token`).
  - `bridge/marla-patch.mjs`: blend-margin idea (only changed pixels outside the rect are kept).
  - Ledger rule: a paid request is recorded **before** it is sent; an unknown outcome is **never resent**.
- **Waldo** (`../Waldo/tools/regions/`): `detect.py` (shift-tolerant diff, blobs, colour stats, flags, sheet),
  `split.py`, `regrow.py`, `fixcore.py`, `freespots.py`, `build.py` + `checkh.py` (overlaps, H cut, PSB via psd_tools).

## Stack

Python 3.11, FastAPI + uvicorn, numpy, opencv, scipy, Pillow, psd_tools (all installed). Port **8790**.

## Layout

```
psb_level_creator/
  plc/
    store.py       project dirs, project.json (locked read/modify/write), paths, ledger helpers
    providers.py   clai_edit(), clai_generate(), albert_image()  — pure HTTP, no project knowledge
    edits.py       edit_area(), run_edit(), run_background()      — uses providers + store
    jobqueue.py    thread pool (project setting `concurrency`, default 3), job status
    detect.py      detect_edit()                                  — candidates from one edit
    candidates.py  apply_ops()                                    — label / drop / split / merge / restore
    sheet.py       render_sheet(), render_overview()
    freespots.py   find_free()
    build.py       build()                                        — targets → layers → PSB + level.json + report
    server.py      FastAPI app (thin: validation + calls into the modules above)
  plc_client.py    client library + CLI (same spirit as Waldo's marla_api.py)
  recipes/hidden_letters/  README.md (agent workflow), PROMPTS.md (prompt guide from the lab), plan schema
  lab/             prompt/style experiments (images, notes)
  tests/           pytest; providers are mocked, no paid calls in tests
  projects/        runtime data (gitignored)
  ref/             Odin clone (gitignored) + example screenshots
```

## Data on disk (the contract between modules)

`projects/<name>/`
- `project.json` — the single state file, written only through `store.py`:
  ```json
  {
    "name": "door_v1", "created": "...", "canvas": {"w": 1536, "h": 2048},
    "settings": {"fallback": "albert", "concurrency": 3},
    "background": {"file": "bg.png", "source": "generate|upload", "prompt": "...", "via": "clai"},
    "edits": [{
      "id": "e003", "rect": [x0, y0, x1, y1], "box": [x0, y0, x1, y1], "prompt": "...",
      "ref_images": ["refs/r1.png"], "status": "queued|running|done|failed|unknown",
      "via": "clai|albert", "channel": "...", "error": null, "detected": false,
      "created": "...", "ended": "..."
    }],
    "candidates": [{
      "id": 12, "edit": "e003", "box": [x0, y0, x1, y1], "area": 5120,
      "flags": ["big", "multi", "clipped", "outside"], "state": "new|kept|dropped",
      "label": "L07_D", "group": "Letters"
    }],
    "builds": [{"id": "b1", "psb": "out/b1.psb", "report": "out/b1_report.json"}]
  }
  ```
  `rect` = what the caller asked for; `box` = the square actually sent (canvas coords).
- `bg.png` — the clean background (never modified after creation; every edit is generated from it).
- `edits/<id>/request.json` (written before sending = ledger), `sent.png`, `ref_*.png`, `answer.png`
  (resized back to `box` size), `result.json` (`via`, `channel`, clai failure text, timings).
- `cand/<id>.png` — candidate mask (L, canvas-cropped to the candidate box, 255 = object).
- `sheet.jpg`, `overview.jpg`, `freespots.jpg`, `out/` (build products).

Module functions never write `project.json` themselves; they return data and `store.py` persists it.

## Behaviour

**Background.** `generate`: Clai Nano Banana (text-to-image) with the caller's prompt and ratio (default 3:4, 2K);
the canvas is whatever comes back (stored in `canvas`). Prefer Clai's HTTP image endpoint; if none fits, call the
`clai image --model nano-banana` CLI. `upload`: any PNG/JPG becomes `bg.png`.

**Edit** (`POST /projects/{p}/edits`, Marla-style `boxes`). For each box: `edit_area()` picks the square (512 / 1024 /
2048) around the rect inside the canvas; the BG crop is sent with the prompt (+ optional ref images) to Clai; on any
Clai error and `fallback == "albert"` it goes once to Albert; `fallback == "none"` marks it failed. The answer is
resized back to the box. Each edit is one job in the queue. A job whose request was recorded but whose outcome is
unknown (crash, restart) becomes `unknown` and is never resent; a retry is a new edit id.

**Detect** (`POST .../edits/{id}/detect`, also run automatically when an edit finishes). Port of Waldo `detect.py`:
shift-tolerant diff of `answer.png` vs the BG crop, blobs above a minimum area become candidates; flags: `clipped`
(touches the box edge), `outside` (mostly outside `rect`), `big`, `multi` (looks like several objects), `faint`,
`small` (long side below the minimum letter size: `min_letter_px` = 50 px, optional `min_letter_frac` override; a
build refuses a kept letter below it unless the request passes `allow_small: [labels]`; `report.sizes`).
Redraw drift elsewhere in the square is ignored.

**Candidate ops** (`POST .../candidates/ops`, list of ops, applied in order):
`label {id, label, group}` (also sets state kept), `drop {id}`, `restore {id}`, `split {id, axis: "x"|"y", at}`
or `split {id, parts: N}` (connected components after erosion), `merge {ids}`, `add {edit, box, thr}`,
`crop {id, box}`, `cut_unchanged {id, thr}` (drop mask px equal to the edit's own BG version), `mask {id, file, at,
glyph}` (scene mask from a hand selection PNG), `glyph {id, mode: auto|mask|file|reset, ...}` (how the glyph is cut).

**Evidence.** `sheet.jpg`: one numbered tile per candidate (crop of the edited scene around it, outline drawn, id and
flags printed), filterable by ids / edit / state. `overview.jpg`: whole canvas with numbered boxes coloured by state.
`freespots`: largest empty rects (not covered by kept candidates or pending edit rects) for a fill-up round.

**Build** (`POST .../build`). Kept candidates only. Overlapping kept masks → reported as errors (caller drops one).
Each target layer = answer pixels inside its mask grown a few px with a soft edge, so it composes seamlessly on the
clean BG. PSB (psd_tools): `BG` at the bottom, one group per `group`, layers named by `label`, groups and layers in
label order. Also `level.json` (canvas, groups, targets with label, bbox, z, file) — the same shape Find The Cat /
Waldo extractors produce — `preview.jpg` (composite) and `report.json` (counts per group, missing labels if the caller
passed an expected list, overlaps, tiny targets).
Two products per target: the **scene patch** `<label>.png` (above; removes the letter from the scene seamlessly, fades
out in place in the game) and the **glyph** `<label>_glyph.png` (only the letter object on real alpha, 1-2 px
anti-aliased edge, no shadow, no scene; flies to the phrase slot and is the hit-test mask, alpha > 0.5 plus finger
tolerance). `level.json` targets carry `glyph` (file) and `glyph_bbox` (canvas px); the PSB carries each glyph as a
hidden layer `<label>_glyph` right above `<label>` in the same group; `report.json` `glyphs` lists pieces / cover per
glyph and warns "check glyphs". After a background/extend, each edit is diffed and tone-fitted against its own BG
version and its layer is blended onto the current `bg.png`.

**Usage.** `GET .../usage`: edits by route (clai / albert / failed), to prove the cost saving.

## API (FastAPI, `127.0.0.1:8790`)

| Method | Path | Body / query | Returns |
|---|---|---|---|
| POST | `/projects` | `{name, settings?}` | project |
| GET | `/projects`, `/projects/{p}` | | list / project.json |
| PATCH | `/projects/{p}/settings` | `{fallback?, concurrency?}` | project |
| POST | `/projects/{p}/background/upload` | multipart `file` | project |
| POST | `/projects/{p}/background/generate` | `{prompt, ratio?, size?}` | `{job}` |
| POST | `/projects/{p}/edits` | `{boxes:[{x0,y0,x1,y1,description,ref_images?:[dataurl or path]}], fallback?}` | `{ids}` |
| GET | `/queue` | `project?` | jobs |
| GET | `/jobs/{id}` | | job |
| POST | `/projects/{p}/edits/{id}/detect` | | candidates of that edit |
| GET | `/projects/{p}/candidates` | `state?, edit?` | candidates |
| POST | `/projects/{p}/candidates/ops` | `{ops:[...]}` | candidates |
| GET | `/projects/{p}/sheet.jpg`, `/overview.jpg`, `/freespots` | `ids?, edit?, state?` / `n, w, h, pad` | image / rects |
| POST | `/projects/{p}/build` | `{expected_labels?}` | `{psb, preview, level_json, report}` |
| GET | `/projects/{p}/usage` | | counts |
| GET | `/file` | `path` (confined to `projects/`) | bytes |

`plc_client.py` wraps every route (`create_project`, `generate_background`, `add_edits`, `wait`, `detect`,
`candidates`, `ops`, `sheet`, `freespots`, `build`, `usage`, `file`) and exposes them as a CLI
(`python3 plc_client.py edits door_v1 boxes.json --wait`).

## Hidden letters recipe (first level type)

Phrase → letters without spaces, **every occurrence is its own target** ("YOUR DOOR IS ALWAYS OPEN" = 20).
Labels `L<index 2 digits>_<char>` in phrase order, group `Letters`.
Hiding styles (from `ref/examples/`): letters built from scene material (twigs, wreath, wire, mosaic tiles), letters
as decor objects (hooks, plaques, door-mat weave), and faint engraved/printed letters on surfaces — mix of easy and
hard. Art style is free and varied (stained glass, photo-real, cartoon...); we try several and keep the best.

Agent workflow (`recipes/hidden_letters/README.md`): scene prompt → BG → plan non-overlapping 1024 regions with
3–5 letters each, each letter tied to a named spot in the region → edits → detect → read `sheet.jpg`, label each
candidate with its letter index or drop it → `freespots` + fill-up round for missing letters → build with
`expected_labels` → check `preview.jpg` and `report.json`.

## Testing

pytest with mocked providers (no paid calls): store/ledger (unknown never resent), edit_area squares, Clai→Albert
fallback and `fallback: none`, detect on synthetic BG+answer pairs (known blobs, shifted redraw), ops, build writes a
PSB that psd_tools reads back with the right groups/names. One real end-to-end level is the acceptance test.

## Out of scope (v1)

S/H pairs, SAM extraction, item sheets, Photoshop panel, chat cards, the Hidden Word game itself (own spec).

## Additions (2026-11-05, after the first levels)

**Full-bleed rule.** Every level fills the canvas. `plc/background.py` detects a white paper border / vignette
(near-white, near-neutral pixels connected to the canvas edge, lining >= 2 sides, >= 0.3 % of the canvas).
generate/upload/extend store `background.border = {ok, fraction, sides}`; `POST .../edits` on a BG that is not ok
returns 409 "background not full-bleed: run background/extend or regenerate" unless `allow_border: true`.
`GET .../background/border` runs the check on demand.

**background/extend** (`POST .../background/extend {prompt?, provider: nano|astra, kept: refuse|protect}` -> job):
the whole BG (fit to 2048, ratio kept) goes to the provider with a fill prompt; the answer is registered back onto the
canvas (`plc/register.py`) and replaces ONLY the border mask (paper grown ~24 px, feathered ~16 px); everything else
stays bit-identical. `kept: refuse` (default) refuses if the mask touches a kept candidate; `protect` keeps every
kept layer's footprint + ring exactly and warns when a kept mask lies on paper. The old BG stays as `bg_v1.png`
(`background.versions`, `background.version`); edits carry `bg_version`, and `store.bg_file_for_edit()` gives the BG
an edit was generated from (build/detect use it for tone fit and change detection). Ledger: `bgx/<id>/request.json`.

**Glance read** (`POST .../blindread {mode: 'glance', width?: 390, planned?: {label: level}, runs?}`): achieved
difficulty without the phrase. The scene the player sees (BG + every kept build layer) goes at phone width to a fresh
call: letters seen there are EASY; the rest of the 2x2 split (12% overlap) at 2x that scale: MEDIUM; letters read only
in the zoomed scene crop (the scene read, with controls): HARD; not read: fail. Stage 1-2 answers carry a position;
a report counts for the nearest target of that letter within max(6% of the canvas, half the letter side) of its
box. Several runs: a stage counts with a majority. Result: per label achieved vs planned (latest build
meta.difficulty or `planned`), the mixes, mismatches, extra letters seen; overview `blindread_<n>.jpg`.

**background/patch** (`POST .../background/patch {edit, mask?, rois?, kept: refuse|protect, grow?, feather?}`, no
paid call): a BG artefact found after edits exist is fixed with a normal edit that paints the fix; its registered
answer is pasted into the current BG only under the mask (PNG path, canvas- or box-sized, and/or rois; grown 6 px,
feathered 12 px, clipped to the edit box). Refused (409) when it touches a kept candidate unless `kept: protect`.
Commits a new BG version (`source: patch`), recorded in `extends` with `patch_of: <edit>`.

**Blind read** (`POST .../blindread`, `plc/blindread.py`): a fresh vision model (Opus by default) reads unlabeled,
shuffled tiles numbered 1..n, knowing nothing of the phrase. `mode: scene` = the letter in its scene (crop on the
letter, elongated masks trimmed of stakes/strings); `mode: layer` = ONLY the build layer on flat grey (what flies to
the slot); `both` (default). User-approved control letters (`blindread_controls.json`) are mixed into every sheet; a
run with a misread control is invalid (targets ok = None). Runs 1-3, majority of valid runs. Rule: a letter passes
only if its layer alone AND the scene read pass; the build report warns for kept targets without a valid layer pass.

**Providers.** `provider: nano` (Clai Nano Banana Pro -> Albert) or `astra` (GPT image via `clai image --model gpt`,
1024 squares sent as is, 3 at a time, 20-min stop after a usage limit). Every answer is registered onto the BG.

**background/restyle** (`POST .../background/restyle {source, style_refs, prompt, ratio, size, provider}` -> job):
the source picture (path relative to the repo root, absolute, or data URL; fit to 2048) and up to 4 style references
(fit to 1536) go to the image edit route as input images (nano: Clai `/v1/images/edits`, image_size 1K/2K, aspect
ratio; Albert fallback per project; astra: `clai image --model gpt --ratio` with one `--input-path` each). The answer
becomes bg.png (canvas = what comes back) and the full-bleed check runs on it. Inputs and ledger in `gen/<id>/`.
