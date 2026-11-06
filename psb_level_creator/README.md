# psb_level_creator

Local HTTP service that builds hidden-object levels as layered PSB files, driven by agents through API calls.
Edits go to Nano Banana Pro through the **Clai team pool** first and to **Albert** once only when Clai fails.
Design and contract: [docs/spec.md](docs/spec.md).

## Run

```bash
cd psb_level_creator
python3 -m uvicorn plc.server:app --host 127.0.0.1 --port 8790
# from an agent session: clai ctl run plc-server -- env PLC_ASTRA_CONCURRENCY=5 python3 -m uvicorn plc.server:app --host 127.0.0.1 --port 8790
```

Needs Python 3.11 with fastapi, uvicorn, numpy, opencv, scipy, Pillow, psd_tools, requests. Keys are read from disk
per call (`~/.config/claiface/key` for Clai, `~/.config/marla/token` for Albert) and never logged. Project data lives
in `projects/<name>/` (gitignored; `PLC_PROJECTS` moves it). `PLC_CLAI_URL` / `PLC_ALBERT_URL` override the
provider endpoints.

## Use

`plc_client.py` is the client library and CLI (`PLC_URL`, default `http://127.0.0.1:8790`):

```bash
python3 plc_client.py create door_v1
python3 plc_client.py generate door_v1 "a cosy front porch, storybook style" --ratio 3:4 --wait   # or: upload door_v1 bg.jpg
python3 plc_client.py border door_v1                     # full-bleed check; if not ok: extend door_v1 [--kept protect] --wait
python3 plc_client.py edits door_v1 boxes.json --wait     # [{x0,y0,x1,y1,description,ref_images?}]
python3 plc_client.py sheet door_v1 sheet.jpg --edit e001
python3 plc_client.py ops door_v1 '[{"op":"label","id":3,"label":"L01_Y","group":"Letters"}]'
python3 plc_client.py freespots door_v1 --n 4
python3 plc_client.py build door_v1 --expected '["L01_Y","L02_O"]'
python3 plc_client.py usage door_v1
python3 plc_client.py file door_v1/out/b1.psb b1.psb
```

- Each box becomes one edit: a 512/1024/2048 square around it inside the canvas is sent with the description
  (+ ref images); the answer is resized back into the square (`edits/<id>/answer.png`). Detect runs automatically
  when an edit finishes (`"detect": false` in the request turns it off).
- Ledger: `edits/<id>/request.json` lists every paid attempt and is written before the request leaves. An edit whose
  outcome is not known (timeout, crash, restart) ends as `unknown` and is never resent; to retry, send a new edit.
- **Providers** (project setting `provider` or per request): `nano` (default: Clai Nano Banana Pro, Albert once on a
  Clai error) or `astra` (GPT image through the Clai subscription: `clai image --model gpt --ratio 1:1`, a 1024 square at
  least, sent as it is, ref images as extra inputs, no fallback, at most 3 at a time on this Mac). After an Astra
  `usage_limit` answer every Astra ask is refused for 20 min (HTTP 429 on POST, the job error says until when;
  `usage.astra_limit_until`). GPT answers are not pixel-registered: every answer is fitted back onto the BG square
  (`plc/register.py`) and `answer.png` is the aligned one (`answer_raw.png` as it came, the fit in
  `edit.registration`); Astra redraws much more of the square than Nano, so expect more drift candidates to drop.
- **Marla** (`provider: marla`, project setting `marla_model`, default `gpt-image-2.5-sunburst`): edits go to Albert's
  Marla partner fix (`/api/marla/v1/edits/fix`, the whole scene + one rect, 3 jobs at a time, job polled to the end);
  the edit box = rect + 256 px (Marla's blend margin), `answer_full.png` = Marla's whole scene. generate/restyle with
  `provider: marla` use Albert's image generator with that model (3:4 = 1536x2048, quality high for Sunburst).
  `usage.marla_models` counts calls per model.
- **Retries:** definite Clai errors (502 image_failed / AI Studio 403/504/5xx, 429, 503, image_quota_exhausted) and
  Marla/Albert submit errors (429/5xx) are resent automatically (10/20/40 s then every 60 s, no cap), each attempt in
  the ledger; job status `retrying (n)`. `POST /jobs/{id}/cancel` (`plc_client.py cancel <p>.<id>`) stops it.
  Unknown outcomes are never resent.
- **Server settings:** `GET/PATCH /server/settings {astra_concurrency}` (`plc_client.py server --astra-concurrency 5`);
  a PATCH is saved in `projects/.server_settings.json` and kept across restarts (without that file the start
  value is env `PLC_ASTRA_CONCURRENCY`, default 3).
- **Full-bleed backgrounds:** `GET /projects/{p}/background/border` (also stored as `background.border` on
  generate/upload/extend). `POST /projects/{p}/background/extend {prompt?, provider: nano|astra, kept: refuse|protect}`
  sends the whole BG (fit to 2048, ratio kept) with a fill prompt, registers the answer and replaces ONLY the border
  mask (paper grown 24 px, feathered 16 px): the rest of the BG stays bit-identical, edits and candidates stay valid.
  `kept: refuse` (default) refuses when the mask touches a kept candidate; `protect` keeps kept layers + their ring
  exactly and warns when a kept mask itself lies on paper. New BG = `bg_v<n>.png` + `bg.png`; edits carry
  `bg_version`. POST edits on a non-full-bleed BG: 409 unless `allow_border: true`.
- **Background patch** (BG artefact found after edits exist, no paid call): make a normal edit whose prompt paints the
  fix (e.g. "remove the blue teapot, show the white teapot and the shelf behind it", `detect: false`), then
  `POST /projects/{p}/background/patch {edit, mask?: png path (canvas- or edit-box-sized, white = replace), rois?:
  [[x0,y0,x1,y1]], kept: refuse|protect, grow?: 6, feather?: 12}` (`plc_client.py patch P e0xx --mask m.png`). The
  edit's registered answer replaces the BG only under the mask (grown, feathered, clipped to the edit box); the rest
  stays bit-identical. New BG version (`source: patch`), recorded in `extends` with `patch_of`, `paid: false`.
- `fallback: "none"` (project setting or per request) marks a Clai failure as failed instead of trying Albert.
  `concurrency` (default 3) caps parallel jobs per project.
- `GET /projects/{p}/usage` counts edits by route (clai / albert / failed / unknown) and paid requests sent.

## Agent workflow (one full level, Python)

Run from this folder (or put it on `sys.path`). Every step is one client call; the service never plans: you choose
prompts, rectangles and labels, it returns evidence (sheet, overview, flags) for you to decide on.

```python
import plc_client as plc
P = 'door_v1'

# 1. project + background (2K 3:4 -> 1536x2048; Clai first, Albert once if Clai fails: one paid BG per level is fine)
plc.create_project(P)                                   # settings: {'fallback': 'albert'|'none', 'concurrency': 1-8}
g = plc.generate_background(P, 'a cosy front porch with a green door ..., storybook illustration, no text',
                            ratio='3:4', size='2K')     # or: plc.upload_background(P, 'scene.jpg')
g = plc.wait_background(P, g['generation'])            # g['status'] 'done' | 'failed' | 'unknown'
canvas = plc.project(P)['canvas']                       # {'w': 1536, 'h': 2048}
# or RESTYLE an existing picture as the BG (image 1 = source, then style references), same ledger/fallback rules:
#   g = plc.restyle_background(P, 'lab/top5_src/2531_32996.png', ['projects/upon_storybook_attic/bg.png'],
#                              prompt='Redraw image 1 ... in the watercolor style of image 2 ...', ratio='3:4',
#                              size='2K', provider='nano')        # or provider='astra'; then plc.wait_background(P, g['generation'])
# FULL-BLEED rule: every level fills the canvas. generate/upload store background.border = {ok, fraction, sides}
# (white paper / vignette connected to the edges); edits on a BG that is not ok get 409 unless allow_border=True.
if not plc.border(P)['ok']:
    x = plc.extend_background(P, provider='nano')       # fill the border; kept='protect' if kept letters are near it
    x = plc.wait_extend(P, x['extend'])                  # only the border is replaced; old BG kept as bg_v1.png
plc.fetch(P, 'bg.png', '/tmp/bg.png')                   # look at it before planning regions

# 2. edits: one box per region; the service sends a 512/1024/2048 square around it (keep regions <= ~1000 px and
#    non-overlapping so each goes as a 1024 square). One description per box, naming every spot in it.
res = plc.add_edits(P, [   # provider='astra' for GPT through the Clai subscription (default: the project's)
    {'x0': 100, 'y0': 900, 'x1': 900, 'y1': 1700,
     'description': 'Hide the letter Y as twigs in the wreath on the door, the letter O as the door knocker ring, ...',
     'ref_images': []},                                 # optional: data URLs (plc.data_url(path)) or local paths
])
edits = plc.wait(P, res['ids'])                        # waits for the edit AND its automatic detect
# each: status 'done' | 'failed' | 'unknown', via 'clai'|'albert', detect_error if detect broke.
# 'unknown' is never resent: to retry, add a new edit for that box.

# 3. evidence + decisions
plc.sheet(P, '/tmp/sheet.jpg', edit=res['ids'][0])     # numbered tiles: id, outline, flags (big/multi/clipped/outside/faint)
plc.overview(P, '/tmp/overview.jpg')                   # whole canvas, boxes coloured by state
cands = plc.candidates(P, edit=res['ids'][0])          # [{id, edit, box, area, flags, state, label, group, contrast}]
plc.ops(P, [
    {'op': 'label', 'id': 3, 'label': 'L01_Y', 'group': 'Letters'},   # label = also kept
    {'op': 'drop', 'id': 4},                                          # redraw drift / not a letter
    {'op': 'split', 'id': 5, 'parts': 2},              # or {'op': 'split', 'id': 5, 'axis': 'x', 'at': 812} (canvas px)
    {'op': 'merge', 'ids': [7, 8]},                    # same edit only
    {'op': 'add', 'edit': 'e001', 'box': [x0, y0, x1, y1]},           # a faint letter detect missed
    {'op': 'crop', 'id': 9, 'box': [x0, y0, x1, y1]},                 # keep only the mask inside the box
    {'op': 'cut_unchanged', 'id': 9, 'thr': 12},       # drop mask px equal to the edit's own BG (old paper border)
    {'op': 'mask', 'id': 9, 'file': '/abs/sel.png', 'at': [x, y], 'glyph': True},  # scene mask (+ glyph) from a PNG
    {'op': 'glyph', 'id': 9, 'mode': 'file', 'file': '/abs/g.png', 'at': [x, y]},  # glyph only; also mode 'mask'
    #   (the candidate mask), 'auto' with 'params' / 'box' / 'fill_from_mask': n, 'reset'
    {'op': 'restore', 'id': 4},
])
# split/merge drop the originals ('replaced_by') and add new ids: re-read candidates / the sheet before labelling them.
# plc.detect(P, 'e001', force=True) re-runs detect for one edit (replaces its candidates, labels included).

# 4. fill-up round for missing letters
free = plc.freespots(P, n=3, w=1024, h=1024, pad=60)   # {'rects': [[x0,y0,x1,y1], ...], 'image': 'freespots.jpg'}
# -> add_edits on those rects with the missing letters, wait, sheet, ops as above

# 4b. independent blind read (do this before building; your own reading of your letters is too generous)
br = plc.blindread(P)                                   # all kept candidates; ids=[...] for some
# a fresh Claude call (model='opus' default, 'sonnet' possible; Clai pool) sees unlabeled, shuffled tiles numbered
# 1..n and knows nothing of the phrase; it answers each tile's letter or ? plus how hard it was to spot (1-3).
# Crops sit on the LETTER: an elongated mask (letter on a stake/string/stem) is trimmed to its letter part, and the
# crop is window (2.2) x the letter's long side, so the letter is ~136 px tall in a 300 px tile.
# Hard letters: zoom={cand_id: 1.6} (tighter), rois={cand_id: [x0,y0,x1,y1]} (your glyph box), window=, tile=.
# Controls: user-approved letters from other projects (blindread_controls.json) are mixed into every sheet; a run
# with a misread control is INVALID (summary.valid False, ok = None): the reader failed, not your letters.
# runs=2|3: new shuffles; the read is the majority of the valid runs (2 runs: both must agree).
# br['results'][str(cand_id)] = {label, expected, read, effort, ok, tile[, reads, agree]}; br['summary'] =
# {valid, n, ok, unreadable, wrong, effort counts, control_accuracy[, agreement]}; plc.fetch(P, br['image'], out)
# -> a MISS (read '?' or another letter) in a VALID run: strengthen the letter (new edit) or drop/redo

# 4c. ACHIEVED difficulty (blind, honest): do not label a letter 'hard' that a player sees at once
g = plc.blindread(P, mode='glance')                     # planned = latest build meta.difficulty, or planned={label: lvl}
# easy   = seen in the WHOLE scene at phone size (width=390 px; BG + every kept layer = what the player sees)
# medium = not seen there, but seen in a 2x2 split of the scene at 2x that scale (4 fresh calls)
# hard   = read only in the zoomed scene crop (the 'scene' read above, with controls); fail = not even then
# Stage 1-2 answers give letter + position; a report counts for a target when the letter matches and the point is
# near its box. runs=2|3: a stage counts when more than half the runs saw it there.
# g['results'][id] = {label, planned, achieved, match, vs_plan: easier|harder}; g['summary'] = {achieved, planned,
# mismatches, easier_than_planned, harder_than_planned, extra_letters (letters seen that are no target)};
# plc.fetch(P, g['image'], out) = the scene with each target boxed in its achieved colour (green/yellow/orange/red).
# CLI: python3 plc_client.py blindread P --mode glance [--runs 2] [--planned plan.json]
# -> fix the plan to the achieved levels (or rework the letters) before you write meta.difficulty

# 5. build + check
b = plc.build(P, expected_labels=['L01_Y', 'L02_O', ...],
              meta={'phrase': 'YOUR DOOR IS ALWAYS OPEN', 'style': 'cozy_porch'})   # meta -> top-level keys of level.json
# {'id': 'b1', 'psb': 'out/b1.psb', 'preview': ..., 'level_json': ..., 'report': ...}  (paths inside the project)
plc.fetch(P, b['preview'], '/tmp/preview.jpg')
plc.fetch(P, b['report'], '/tmp/report.json')         # ok, errors (overlaps, missing, duplicates), warnings (tiny)
plc.fetch(P, b['psb'], '/tmp/door_v1.psb')
print(plc.usage(P))                                     # edits by route: clai / albert / failed / unknown
```

The same steps from a shell: `python3 plc_client.py <create|generate|upload|edits|wait|sheet|overview|candidates|ops|
detect|freespots|blindread|build|usage|file> ...` (`-h` lists the arguments). Errors come back as `PlcError("<status>: <message>")`
(400 bad input, 404 unknown project/edit, 409 wrong state, e.g. the background is fixed once edits exist).

## Tests

```bash
python3 -m pytest -q
```

Providers are mocked in every test (their URLs point at a closed local port); no test makes a paid call.
