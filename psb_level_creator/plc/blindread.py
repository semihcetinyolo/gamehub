"""Blind read: an independent check of hidden letters by a fresh vision model that knows nothing of the phrase.

Modes (mode='both' by default = scene + layer; 'glyph', 'flight' = scene + glyph, 'all'; results per mode):
- scene: the letter in its edited scene (can a player spot and read it?);
- layer: ONLY the candidate's layer as build cuts it (plc.build.target_layer: mask + soft ring, alpha over flat
  mid-grey) — the piece that flies to the slot when found. It must be the whole letter on its own: a letter
  completed with strokes the BG already had reads as a single stick here and fails;
- glyph: ONLY the target's build glyph (plc.build.target_glyph: the letter object alone, new pixels only, real alpha),
  i.e. <label>_glyph.png — use it when the game flies the glyph.

Agents grading their own letters are too generous. Each candidate is cut out of its edited scene around the LETTER
itself: an elongated candidate (a letter on a stake, a string, a long stem) has the thin end rows of its mask trimmed
off (glyph_box), so the letter is not shrunk to nothing. The crop is `window` (default 2.2) x the letter's long side, so the letter is
about 136 px tall in a 300 px tile; `zoom` per candidate or `rois` (a hand-given glyph box) refine it for hard ones.
Tiles are shuffled with a stored seed, numbered 1..n only (no label, no outline, no phrase) and shown to a fresh
Claude call through the Clai pool: "answer the letter in each tile or ?, rate 1-3 how hard it was to spot".

Control tiles: user-approved letters from other projects (blindread_controls.json at the repo root) are mixed into
every sheet, unlabeled. A run in which any control is misread is INVALID: its target reads are kept for evidence but
count for nothing (ok = None), so a weak model or a bad crop never fails real letters. With several runs the read is
the majority of the valid runs (2 runs: both must agree).

Files: blindread/<rid>/request.json (written before the calls), sheet_<run>_<k>.jpg, answer_<run>_<k>.txt,
result.json; pdir/blindread_<n>.jpg = the first sheet of the last run. The record goes to project["blindreads"].
"""
from __future__ import annotations

import io
import json
import random
import re
import threading
from collections import Counter
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from . import providers, store
from .store import StoreError, now

TILE = 300
COLS = 5
PER_SHEET = 25          # tiles per model call, controls included
WINDOW = 2.2            # crop side = WINDOW x the letter's long side (letter ~136 px in a 300 px tile)
MIN_WINDOW = 96         # px of scene at least (a tiny letter is enlarged, not drowned in context)
TRIM = 0.4              # end rows/cols with less than TRIM x the typical full row/col count are a protrusion
ELONG = 1.8             # only a candidate this elongated (long / short side) is trimmed
CONTROLS_FILE = store.ROOT / 'blindread_controls.json'
MODELS = {'sonnet': 'claude-sonnet-5-5', 'opus': 'claude-opus-5-5', 'haiku': 'claude-haiku-5-5'}
DEFAULT_MODEL = 'opus'
PROMPT = (
    'This image is a grid of {n} numbered tiles (numbers 1 to {n} in the top-left corner of each tile). '
    'Each tile may show one capital Latin letter formed by objects in the picture (for example built from twigs, '
    'wire, tiles, handles or other things in the scene, or faintly carved or printed on a surface). '
    'A letter can also be the whole silhouette of one object (for example a hook shaped like a J), and it may be '
    'rotated or lying on its side. '
    'For each tile number answer the letter you can read, or ? if you cannot read one. '
    'Also rate 1-3 how hard it was to spot (1 = obvious at a glance, 2 = found after looking, 3 = very hard to spot). '
    'Answer with JSON only, no other text: {{"tiles": [{{"tile": 1, "read": "A", "effort": 2}}, ...]}} '
    'with exactly one entry for every tile from 1 to {n}.'
)

LAYER_PROMPT = (
    'This image is a grid of {n} numbered tiles (numbers 1 to {n} in the top-left corner of each tile). '
    'Each tile shows one cut-out piece of a picture on a flat grey background. '
    'The piece may be one capital Latin letter, made of objects or material (for example twigs, wire, tiles or a '
    'handle), and it may be rotated or lying on its side. It may also be just an object that is not a letter. '
    'For each tile number answer the letter the piece itself forms, or ? if it does not form one clear letter. '
    'Also rate 1-3 how hard it was to read (1 = obvious at a glance, 2 = read after looking, 3 = very hard). '
    'Answer with JSON only, no other text: {{"tiles": [{{"tile": 1, "read": "A", "effort": 2}}, ...]}} '
    'with exactly one entry for every tile from 1 to {n}.'
)
MODES = ('scene', 'layer', 'glyph')
MODE_SETS = {'scene': ('scene',), 'layer': ('layer',), 'glyph': ('glyph',), 'both': ('scene', 'layer'),
             'flight': ('scene', 'glyph'), 'all': ('scene', 'layer', 'glyph')}
GREY = 128

_locks: dict[str, threading.Lock] = {}
_guard = threading.Lock()


def expected_letter(label) -> str | None:
    m = re.search(r'_([A-Za-z0-9])$', label or '')
    return m.group(1).upper() if m else None


def model_id(model) -> str:
    m = MODELS.get(model or DEFAULT_MODEL, model)
    if not isinstance(m, str) or not re.fullmatch(r'claude-[a-z0-9-]{3,60}', m):
        raise StoreError(f'model: one of {sorted(MODELS)} or a claude-* model id')
    return m


def _font(size):
    try:
        from .sheet import font
        return font(size)
    except Exception:
        from PIL import ImageFont
        return ImageFont.load_default()


# ---- crops -----------------------------------------------------------------------------------------------------

def _trim(prof: np.ndarray, frac: float, smooth: int = 1) -> tuple[int, int]:
    """[a, b): the run of the (smoothed) profile above frac x its typical full value that holds the most mask."""
    nz = prof[prof > 0]
    if not len(nz):
        return 0, len(prof)
    if smooth > 1:
        prof = np.convolve(prof.astype(float), np.ones(smooth) / smooth, mode='same')
    thr = max(1.0, frac * float(np.percentile(prof[prof > 0], 90)))
    on = prof >= thr
    best, best_mass, start = (0, len(prof)), -1.0, None
    for i, v in enumerate(list(on) + [False]):
        if v and start is None:
            start = i
        elif not v and start is not None:
            mass = float(prof[start:i].sum())
            if mass > best_mass:
                best, best_mass = (start, i), mass
            start = None
    return best


def glyph_box(mask: np.ndarray, box, frac: float = TRIM, elong: float = ELONG) -> list[int]:
    """The letter's own box inside a candidate. Only an elongated candidate (long side >= elong x short side: a letter
    on a stake, a string or a long stem) is trimmed: along its long axis, the smoothed row (or column) mask counts
    are cut at frac x the typical full row and the run holding the most mask is kept (the letter, not the stake),
    then the other axis is tightened to what is left; repeated
    while it stays elongated. A compact letter (T, L, F, M...) is never trimmed. Falls back to the candidate box when
    the trim would leave too little of the mask."""
    x0, y0, x1, y1 = box
    if mask is None or not mask.any():
        return list(box)
    r0, r1, c0, c1 = 0, mask.shape[0], 0, mask.shape[1]
    for _ in range(3):
        h, w = r1 - r0, c1 - c0
        if max(h, w) < elong * min(h, w):
            break
        sub = mask[r0:r1, c0:c1]
        sm = max(3, min(h, w) // 4)      # bridges the gaps inside a letter, not a long stake
        if h >= w:
            a, b = _trim(sub.sum(1), frac, sm)
            r0, r1 = r0 + a, r0 + b
        else:
            a, b = _trim(sub.sum(0), frac, sm)
            c0, c1 = c0 + a, c0 + b
        sub = mask[r0:r1, c0:c1]
        ys, xs = np.nonzero(sub)
        if not len(ys):
            return list(box)
        nr0, nr1, nc0, nc1 = r0 + ys.min(), r0 + ys.max() + 1, c0 + xs.min(), c0 + xs.max() + 1
        if (nr0, nr1, nc0, nc1) == (r0, r1, c0, c1) and (a, b) == (0, (h if h >= w else w)):
            break
        r0, r1, c0, c1 = nr0, nr1, nc0, nc1
    if (r1 - r0) < 8 or (c1 - c0) < 8 or mask[r0:r1, c0:c1].sum() < 0.3 * mask.sum():
        return list(box)
    return [int(x0 + c0), int(y0 + r0), int(x0 + c1), int(y0 + r1)]


def _mask(pdir: Path, cand: dict):
    try:
        from . import detect
        return detect.load_mask(pdir, cand)
    except Exception:
        return None


def _scene(pdir: Path, project: dict, edit: dict, cache: dict) -> np.ndarray:
    """The BG with this edit's (registered) answer in its box."""
    if edit['id'] not in cache:
        from . import detect
        bg = cache.setdefault('_bg', detect.load_bg(pdir))
        ans = detect.load_answer(pdir, edit, bg=bg)
        sc = bg.copy()
        x0, y0, x1, y1 = edit['box']
        ref = store.bg_file_for_edit(pdir, project, edit)
        if ref.name != 'bg.png' and ref.is_file():
            # the BG was extended after this edit: where it changed (the old paper border), show the new BG
            old = np.asarray(Image.open(ref).convert('RGB'))[y0:y1, x0:x1]
            ans = np.where((old != bg[y0:y1, x0:x1]).any(2, keepdims=True), bg[y0:y1, x0:x1], ans)
        sc[y0:y1, x0:x1] = ans
        cache[edit['id']] = sc
    return cache[edit['id']]


def crop_tile(scene: np.ndarray, box, size: int = TILE, window: float = WINDOW,
              min_window: int = MIN_WINDOW) -> Image.Image:
    """A square window of `window` x the box's long side centred on it, kept inside the canvas."""
    h, w = scene.shape[:2]
    x0, y0, x1, y1 = box
    side = int(min(max(min_window, window * max(x1 - x0, y1 - y0)), w, h))
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    left = int(min(w - side, max(0, round(cx - side / 2))))
    top = int(min(h - side, max(0, round(cy - side / 2))))
    return Image.fromarray(scene[top:top + side, left:left + side]).resize((size, size), Image.LANCZOS)


def render_sheet(tiles: list[Image.Image], first_number: int = 1) -> Image.Image:
    tile = tiles[0].width if tiles else TILE
    rows = (len(tiles) + COLS - 1) // COLS
    gap = 6
    sheet = Image.new('RGB', (COLS * (tile + gap) + gap, rows * (tile + gap) + gap), (255, 255, 255))
    dr = ImageDraw.Draw(sheet)
    f = _font(30)
    for k, t in enumerate(tiles):
        x, y = gap + (k % COLS) * (tile + gap), gap + (k // COLS) * (tile + gap)
        sheet.paste(t, (x, y))
        num = str(first_number + k)
        bw = 18 * len(num) + 16
        dr.rectangle([x, y, x + bw, y + 40], fill=(255, 255, 255), outline=(0, 0, 0), width=2)
        dr.text((x + 8, y + 4), num, fill=(0, 0, 0), font=f)
    return sheet


# ---- answers ---------------------------------------------------------------------------------------------------

def parse_answer(text: str, n: int) -> dict[int, dict]:
    """{tile: {read, effort}} for tiles 1..n; a tile the answer misses reads '?' with effort None."""
    out = {}
    m = re.search(r'\{.*\}', text or '', re.S)
    items = None
    if m:
        try:
            j = json.loads(m.group(0))
            items = j.get('tiles') if isinstance(j, dict) else None
        except ValueError:
            items = None
    if isinstance(items, list):
        for it in items:
            try:
                t = int(it.get('tile'))
            except (TypeError, ValueError, AttributeError):
                continue
            out[t] = {'read': _letter(it.get('read')), 'effort': _effort(it.get('effort'))}
    else:   # plain lines "3: D (2)" / "3 - ? - 3"
        for ln in (text or '').splitlines():
            mm = re.match(r'\s*(?:tile\s*)?(\d+)\s*[:.)=-]+\s*["\']?([A-Za-z?])["\']?\W*(\d)?', ln, re.I)
            if mm:
                out[int(mm.group(1))] = {'read': _letter(mm.group(2)), 'effort': _effort(mm.group(3))}
    return {t: out.get(t, {'read': '?', 'effort': None, 'missing': True}) for t in range(1, n + 1)}


def _letter(v) -> str:
    s = str(v or '?').strip().strip('"\'').upper()
    return s if re.fullmatch(r'[A-Z0-9]', s) else '?'


def _effort(v):
    try:
        e = int(v)
        return e if 1 <= e <= 3 else None
    except (TypeError, ValueError):
        return None


def majority(reads: list[str]) -> str:
    """The read more than half the runs agree on, else '?'."""
    if not reads:
        return '?'
    r, k = Counter(reads).most_common(1)[0]
    return r if k * 2 > len(reads) else '?'


# ---- selection + options ---------------------------------------------------------------------------------------

def select(project: dict, ids=None) -> list[dict]:
    cands = {c['id']: c for c in project.get('candidates', [])}
    if ids:
        missing = [i for i in ids if i not in cands]
        if missing:
            raise StoreError(f'no candidates {missing}', 404)
        sel = [cands[i] for i in ids]
    else:
        sel = [c for c in cands.values() if c.get('state') == 'kept']
    if not sel:
        raise StoreError('nothing to read: no kept candidates (or pass ids)', 409)
    if len(sel) > 120:
        raise StoreError('at most 120 candidates per blind read')
    return sel


def _boxes(raw, what: str, canvas) -> dict[int, list[int]]:
    out = {}
    for k, v in (raw or {}).items():
        try:
            cid = int(k)
            x0, y0, x1, y1 = (int(round(float(t))) for t in v)
        except (TypeError, ValueError):
            raise StoreError(f'{what}[{k!r}]: [x0, y0, x1, y1] required')
        if x1 - x0 < 4 or y1 - y0 < 4 or (canvas and (x0 < 0 or y0 < 0 or x1 > canvas['w'] or y1 > canvas['h'])):
            raise StoreError(f'{what}[{k!r}] is empty or outside the canvas')
        out[cid] = [x0, y0, x1, y1]
    return out


def check_options(window=None, tile=None, rois=None, canvas=None, zoom=None) -> dict:
    """window: crop side / letter long side (1.2-6, default 2.2); tile: px per tile (200-512, default 300);
    rois: {cand id: [x0,y0,x1,y1]} canvas px, the glyph box to crop on instead of the trimmed mask (test crop only,
    the mask is untouched); zoom: {cand id: f} (0.5-4), f > 1 crops tighter (window / f) for that candidate."""
    window = WINDOW if window is None else window
    tile = TILE if tile is None else tile
    if not isinstance(window, (int, float)) or isinstance(window, bool) or not 1.2 <= window <= 6:
        raise StoreError('window must be a number 1.2-6')
    if not isinstance(tile, int) or isinstance(tile, bool) or not 200 <= tile <= 512:
        raise StoreError('tile must be an integer 200-512')
    zooms = {}
    for k, v in (zoom or {}).items():
        try:
            cid, f = int(k), float(v)
        except (TypeError, ValueError):
            raise StoreError(f'zoom[{k!r}]: a number')
        if not 0.5 <= f <= 4:
            raise StoreError(f'zoom[{k!r}] must be 0.5-4')
        zooms[cid] = f
    return {'window': float(window), 'tile': tile, 'rois': _boxes(rois, 'rois', canvas), 'zoom': zooms}


def load_controls(path: Path | None = None) -> list[dict]:
    try:
        data = json.loads(Path(path or CONTROLS_FILE).read_text())
    except (OSError, ValueError):
        return []
    return [c for c in data.get('controls', []) if c.get('project') and c.get('id') is not None and c.get('expected')]


def _layer_ctx(pdir: Path, project: dict, cache: dict):
    """plc.build's own context (tone-matched answers, owner map of the kept targets), so a layer tile is exactly the
    pixels build would put in the PSB."""
    if '_ctx' not in cache:
        from . import build as B
        ctx = B.Ctx(pdir, project)
        kept = [c for c in project.get('candidates', []) if c.get('state') == 'kept' and c.get('label')
                and c.get('edit') in ctx.edits]
        ctx.set_owners(kept)
        cache['_ctx'] = ctx
    return cache['_ctx']


def layer_tile(pdir: Path, project: dict, cand: dict, cache: dict, size: int = TILE, window: float = WINDOW,
               min_window: int = MIN_WINDOW, glyph: bool = False) -> Image.Image:
    """The candidate's build layer (or, glyph=True, its build glyph: only the letter object, plc/glyph.py) alone,
    alpha-composited over flat mid-grey, centred, its long side 1/window of the tile. No glyph -> a plain grey tile."""
    from . import build as B
    ctx = _layer_ctx(pdir, project, cache)
    if glyph:
        g = B.target_glyph(ctx, cand)
        if g is None:
            return Image.new('RGB', (size, size), (GREY, GREY, GREY))
        rgba = g[0]
    else:
        rgba, _, _ = B.target_layer(ctx, cand)
    a = rgba[..., 3:4].astype(np.float32) / 255
    rgb = (rgba[..., :3].astype(np.float32) * a + GREY * (1 - a)).round().astype(np.uint8)
    h, w = rgb.shape[:2]
    side = int(max(min_window, window * max(h, w)))
    canvas = np.full((side, side, 3), GREY, np.uint8)
    top, left = (side - h) // 2, (side - w) // 2
    canvas[max(0, top):max(0, top) + min(h, side), max(0, left):max(0, left) + min(w, side)] = \
        rgb[max(0, -top):max(0, -top) + min(h, side), max(0, -left):max(0, -left) + min(w, side)]
    return Image.fromarray(canvas).resize((size, size), Image.LANCZOS)


def letter_side(pdir: Path, project: dict, cand: dict, cache: dict) -> tuple[int, str]:
    """The letter's long side as build measures it (report.sizes): the build glyph's bbox, else the candidate's core
    mask box. glyph_box (which trims stakes for the reading crop) is NOT used here: it can cut a P's stem."""
    try:
        from . import build as B
        g = B.target_glyph(_layer_ctx(pdir, project, cache), cand)
        if g is not None:
            a = g[0][..., 3] > 127
            if a.any():
                ys, xs = np.nonzero(a)
                return int(max(xs.max() - xs.min() + 1, ys.max() - ys.min() + 1)), 'glyph'
    except Exception:
        pass
    x0, y0, x1, y1 = cand['box']
    return int(max(x1 - x0, y1 - y0)), 'mask box'


def _tile(mode, pdir, project, cand, edit, cache, opt, window, roi=None):
    if mode in ('layer', 'glyph'):
        return layer_tile(pdir, project, cand, cache, opt['tile'], window, glyph=mode == 'glyph')
    gb = roi or glyph_box(_mask(pdir, cand), cand['box'])
    return crop_tile(_scene(pdir, project, edit, cache), gb, opt['tile'], window)


def _control_tiles(controls, here: str, here_ids: set, opt: dict, modes) -> tuple[dict, list]:
    """({mode: [{key, expected, image}]}, skipped keys) for the usable controls; a missing one is skipped."""
    out, skipped = {m: [] for m in modes}, []
    by_project: dict[str, list] = {}
    for c in controls:
        if c['project'] == here and int(c['id']) in here_ids:
            continue                       # a target of this read is never its own control
        by_project.setdefault(c['project'], []).append(c)
    for pname, cs in by_project.items():
        try:
            p = store.read(pname)
        except StoreError:
            skipped += [f"{pname}#{c['id']}" for c in cs]
            continue
        pdir = store.pdir(pname)
        cands = {x['id']: x for x in p.get('candidates', [])}
        eds = {e['id']: e for e in p.get('edits', [])}
        cache = {}
        for c in cs:
            cand = cands.get(int(c['id']))
            if not cand or eds.get(cand.get('edit'), {}).get('status') != 'done':
                skipped.append(f"{pname}#{c['id']}")
                continue
            try:
                imgs = {m: _tile(m, pdir, p, cand, eds[cand['edit']], cache, opt, opt['window']) for m in modes}
            except Exception:
                skipped.append(f"{pname}#{c['id']}")
                continue
            for m in modes:
                if m in c.get('modes', MODES):     # a control may be approved for one mode only
                    out[m].append({'key': f"{pname}#{c['id']}", 'expected': str(c['expected']).upper(),
                                   'image': imgs[m]})
    return out, skipped


# ---- the read --------------------------------------------------------------------------------------------------

def run(name: str, ids=None, runs: int = 1, seeds=None, model: str | None = None, ask=None, window=None, tile=None,
        rois=None, zoom=None, controls=True, mode: str = 'both', glance: dict | None = None) -> dict:
    """Render, ask, parse, store. mode 'scene' | 'layer' | 'both'. runs 1-3 (each a new shuffle; the read is the
    majority of the valid runs). controls: True = blindread_controls.json, False = none, or a list of
    {project, id, expected}. ask(images, prompt) -> text is injectable (tests); default = providers.claude_vision."""
    if not isinstance(runs, int) or isinstance(runs, bool) or not 1 <= runs <= 3:
        raise StoreError('runs must be 1, 2 or 3')
    if mode == 'glance':
        return run_glance(name, ids, runs, seeds, model, ask, window, tile, rois, zoom, controls, **(glance or {}))
    if mode not in MODE_SETS:
        raise StoreError(f"mode must be one of {sorted(MODE_SETS) + ['glance']}")
    with _guard:
        lock = _locks.setdefault(name, threading.Lock())
    with lock:   # one blind read per project at a time (its id is taken from the count)
        return _run(name, ids, runs, seeds, model, ask, window, tile, rois, zoom, controls, mode)


def _read_mode(mode, sel, tiles, ctrl, runs, seeds, ask, rdir, rid):
    """One mode: every run shuffles targets + controls into sheets, asks, parses. Returns (per_run, results, summary)."""
    prompt = PROMPT if mode == 'scene' else LAYER_PROMPT
    per_run = []
    per_sheet_targets = PER_SHEET - len(ctrl)
    for r in range(runs):
        rng = random.Random(seeds[r] + {'scene': 0, 'layer': 7919, 'glyph': 15881}[mode])
        order = [c['id'] for c in sel]
        rng.shuffle(order)
        reads, ctrl_reads, sheets, errors, tile_of = {}, [], [], [], {}
        for s, start in enumerate(range(0, len(order), per_sheet_targets)):
            items = [('t', cid) for cid in order[start:start + per_sheet_targets]] + [('c', k) for k in range(len(ctrl))]
            rng.shuffle(items)
            sheet = render_sheet([tiles[v] if kind == 't' else ctrl[v]['image'] for kind, v in items])
            fname = f'{mode}_{r + 1}_{s + 1}.jpg'
            sheet.save(rdir / fname, quality=90)
            sheets.append(f'blindread/{rid}/{fname}')
            b = io.BytesIO()
            sheet.save(b, 'JPEG', quality=90)
            try:
                text = ask([b.getvalue()], prompt.format(n=len(items)))
            except providers.ProviderError as e:
                errors.append(str(e))
                text = ''
            (rdir / f'answer_{mode}_{r + 1}_{s + 1}.txt').write_text(text or '')
            parsed = parse_answer(text, len(items))
            for k, (kind, v) in enumerate(items):
                got = parsed[k + 1]
                if kind == 't':
                    reads[v] = got
                    tile_of[v] = f'{s + 1}:{k + 1}'
                else:
                    ctrl_reads.append({'key': ctrl[v]['key'], 'sheet': s + 1, 'tile': k + 1,
                                       'expected': ctrl[v]['expected'], 'read': got['read'],
                                       'ok': got['read'] == ctrl[v]['expected']})
        n_ok = sum(x['ok'] for x in ctrl_reads)
        per_run.append({'seed': seeds[r], 'valid': not errors and n_ok == len(ctrl_reads), 'controls': ctrl_reads,
                        'control_accuracy': round(n_ok / len(ctrl_reads), 3) if ctrl_reads else None,
                        'tiles': {str(cid): tile_of[cid] for cid in order}, 'sheets': sheets, 'errors': errors,
                        'reads': reads})
    valid_runs = [pr for pr in per_run if pr['valid']]
    use = valid_runs or per_run
    results = {}
    for c in sel:
        exp = expected_letter(c.get('label'))
        read = majority([pr['reads'][c['id']]['read'] for pr in use])
        res = {'read': read, 'effort': use[0]['reads'][c['id']]['effort'],
               'ok': (exp is not None and read == exp) if valid_runs else None,
               'tile': per_run[0]['tiles'][str(c['id'])]}
        if runs > 1:
            res.update(reads=[pr['reads'][c['id']]['read'] for pr in per_run],
                       efforts=[pr['reads'][c['id']]['effort'] for pr in per_run],
                       agree=len({pr['reads'][c['id']]['read'] for pr in per_run}) == 1)
        results[c['id']] = res
    n = len(results)
    exp_of = {c['id']: expected_letter(c.get('label')) for c in sel}
    summary = {'valid': bool(valid_runs), 'valid_runs': len(valid_runs), 'n': n,
               'ok': sum(bool(v['ok']) for v in results.values()) if valid_runs else None,
               'unreadable': sum(v['read'] == '?' for v in results.values()),
               'wrong': sum(v['read'] not in ('?', exp_of[i]) for i, v in results.items() if exp_of[i] is not None),
               'effort': {str(e): sum(v['effort'] == e for v in results.values()) for e in (1, 2, 3)},
               'controls': len(ctrl), 'control_accuracy': [pr['control_accuracy'] for pr in per_run]}
    if runs > 1:
        summary['agreement'] = round(sum(v['agree'] for v in results.values()) / n, 3)
    if any(pr['errors'] for pr in per_run):
        summary['errors'] = [e for pr in per_run for e in pr['errors']]
    return [{k: v for k, v in pr.items() if k != 'reads'} for pr in per_run], results, summary


def _run(name, ids, runs, seeds, model, ask, window, tile, rois, zoom, controls, mode) -> dict:
    mid = model_id(model)
    modes = MODE_SETS[mode]
    p = store.read(name)
    pdir = store.pdir(name)
    sel = select(p, ids)
    sel_ids = {c['id'] for c in sel}
    opt = check_options(window, tile, rois, p.get('canvas'), zoom)
    stray = sorted((set(opt['rois']) | set(opt['zoom'])) - sel_ids)
    if stray:
        raise StoreError(f'rois/zoom for candidates not in this read: {stray}')
    edits_by_id = {e['id']: e for e in p.get('edits', [])}
    for c in sel:
        if edits_by_id.get(c.get('edit'), {}).get('status') != 'done':
            raise StoreError(f'candidate {c["id"]}: its edit {c.get("edit")} has no answer', 409)

    try:
        from . import detect as _D
        min_px = _D.min_letter_px(p['canvas']) if p.get('canvas') else None
    except Exception:
        min_px = None
    cache, crop_box = {}, {}
    tiles = {m: {} for m in modes}
    for c in sel:
        w = opt['window'] / opt['zoom'].get(c['id'], 1.0)
        roi = opt['rois'].get(c['id'])
        crop_box[c['id']] = roi or glyph_box(_mask(pdir, c), c['box'])
        for m in modes:
            tiles[m][c['id']] = _tile(m, pdir, p, c, edits_by_id[c['edit']], cache, opt, w, crop_box[c['id']])
    clist = load_controls() if controls is True else (list(controls) if controls else [])
    ctrl, skipped = _control_tiles(clist, name, sel_ids, opt, modes)
    if any(len(v) >= PER_SHEET for v in ctrl.values()):
        raise StoreError('too many control tiles for one sheet')

    rid = f'r{len(p.get("blindreads", [])) + 1}'
    rdir = pdir / 'blindread' / rid
    rdir.mkdir(parents=True, exist_ok=True)
    seeds = [int(s) for s in (seeds or [])]
    while len(seeds) < runs:
        seeds.append(random.randrange(1, 10 ** 9))
    if ask is None:
        def ask(images, prompt):
            return providers.claude_vision(images, prompt, model=mid)['text']
    record = {'id': rid, 'created': now(), 'model': mid, 'mode': mode, 'ids': [c['id'] for c in sel],
              'window': opt['window'], 'tile': opt['tile'], 'rois': {str(k): v for k, v in opt['rois'].items()},
              'zoom': {str(k): v for k, v in opt['zoom'].items()},
              'crop_boxes': {str(k): v for k, v in crop_box.items()},
              'controls': {m: [{'key': x['key'], 'expected': x['expected']} for x in ctrl[m]] for m in modes},
              'controls_skipped': skipped, 'seeds': seeds[:runs]}
    store.write_json(rdir / 'request.json', {**record, 'prompts': {'scene': PROMPT, 'layer': LAYER_PROMPT}})

    by_mode = {}
    for m in modes:
        runs_m, res_m, sum_m = _read_mode(m, sel, tiles[m], ctrl[m], runs, seeds, ask, rdir, rid)
        by_mode[m] = {'runs': runs_m, 'results': res_m, 'summary': sum_m}
    results = {}
    for c in sel:
        per = {m: by_mode[m]['results'][c['id']] for m in modes}
        oks = [per[m]['ok'] for m in modes]
        side, side_src = letter_side(pdir, p, c, cache)
        res = {'label': c.get('label'), 'expected': expected_letter(c.get('label')),
               'ok': None if any(o is None for o in oks) else all(oks), 'side': side, 'side_source': side_src,
               'small': bool(min_px and side < min_px), **per}
        if len(modes) == 1:   # one mode: its fields also at the top (read, effort, tile, reads...)
            res.update({k: v for k, v in per[modes[0]].items() if k != 'ok'})
        results[str(c['id'])] = res
    summary = {'mode': mode, 'valid': all(by_mode[m]['summary']['valid'] for m in modes), 'runs': runs,
               'min_letter_px': min_px, 'small': sorted(v['label'] or k for k, v in results.items() if v['small']),
               'n': len(results), 'ok': (sum(bool(v['ok']) for v in results.values())
                                         if all(by_mode[m]['summary']['valid'] for m in modes) else None),
               **{m: by_mode[m]['summary'] for m in modes}}
    if len(modes) == 1:   # one mode: its runs and summary fields also at the top
        summary = {**by_mode[modes[0]]['summary'], **summary}
    record.update(modes={m: {'runs': by_mode[m]['runs'], 'summary': by_mode[m]['summary']} for m in modes},
                  results=results, summary=summary, ended=now())
    if len(modes) == 1:
        record['runs'] = by_mode[modes[0]]['runs']
    first = by_mode[modes[0]]['runs'][-1]['sheets'][0]
    Image.open(pdir / first).save(pdir / f'blindread_{rid[1:]}.jpg', quality=90)
    record['image'] = f'blindread_{rid[1:]}.jpg'
    for m in modes[1:]:
        lf = by_mode[m]['runs'][-1]['sheets'][0]
        Image.open(pdir / lf).save(pdir / f'blindread_{rid[1:]}_{m}.jpg', quality=90)
        record[f'image_{m}'] = f'blindread_{rid[1:]}_{m}.jpg'
    store.write_json(rdir / 'result.json', record)
    store.update(name, lambda proj: proj.setdefault('blindreads', []).append(record))
    return record


def layer_passes(project: dict, pdir: Path | None = None, mode: str = 'layer') -> dict[int, str]:
    """{candidate id: blind read id} for candidates with a VALID pass in `mode` ('layer' or 'glyph') on record that
    is newer than their mask file (a crop/split after the read voids it)."""
    import datetime as _dt
    out = {}
    for rec in project.get('blindreads', []):
        m = (rec.get('modes') or {}).get(mode)
        if not m or not m['summary'].get('valid'):
            continue
        try:
            ended = _dt.datetime.fromisoformat(rec.get('ended') or rec.get('created')).timestamp()
        except (TypeError, ValueError):
            continue
        for cid, r in rec.get('results', {}).items():
            lr = r.get(mode) or {}
            if not lr.get('ok'):
                continue
            if pdir is not None:
                f = Path(pdir) / 'cand' / f'{cid}.png'
                if f.is_file() and f.stat().st_mtime > ended + 1:
                    continue
            out[int(cid)] = rec['id']
    return out


# ---- glance: achieved difficulty ---------------------------------------------------------------------------------
#
# mode='glance' measures how hard each kept letter really is to FIND, honestly and without the phrase:
#   1. EASY   - seen in the whole scene shown at phone size (GLANCE_WIDTH px wide, one fresh call);
#   2. MEDIUM - not seen there, but seen in a 2x2 split of the scene at 2x that scale (one fresh call per quarter);
#   3. HARD   - seen only in the zoomed scene crop of the letter (the existing 'scene' read, controls included);
#   4. fail   - not read even zoomed.
# Stages 1-2 report letters with a position (x, y in % of the picture); a report counts for a target when its letter
# is the target's letter and its point lies within TOL of the target's box (the nearest unclaimed target wins). Those
# stages have no control tiles (no approved whole scenes exist); stage 3 keeps the control rule, so a run whose
# controls are misread leaves the letters not found in 1-2 at achieved None. Several runs: a stage counts when more
# than half the runs found the letter there (2 runs: both). The planned mix is the latest build's meta.difficulty
# ({label: easy|medium|hard}) or the request's `planned`.

GLANCE_WIDTH = 390
QUAD_OVERLAP = 0.12     # share of the canvas side each quarter reaches past the middle
TOL = 0.06              # a report's point may miss its target's box by this share of the canvas long side ...
TOL_SIDE = 0.5          # ... or by half the letter's long side, whichever is larger
LEVELS = ('easy', 'medium', 'hard')
LEVEL_COLOUR = {'easy': (40, 170, 60), 'medium': (230, 180, 0), 'hard': (240, 110, 20), 'fail': (220, 30, 30),
                None: (120, 120, 120)}

GLANCE_PROMPT = (
    'This is a picture as a player sees it on a phone screen. Capital Latin letters may be hidden in it, formed by '
    'objects or parts of the scene (for example twigs, wire, tiles, handles, folds of cloth or the silhouette of one '
    'object); a letter may be rotated or lying on its side. Look at it the way a player glances at the screen: list '
    'only the letters you can actually see right away, without hunting for them. Do not guess and do not list '
    'ordinary printed text such as signs or labels unless it is a single large letter. For each letter give the '
    'centre of the letter as x and y in percent of the picture width and height (0 = left/top, 100 = right/bottom). '
    'Answer with JSON only, no other text: {"letters": [{"letter": "A", "x": 12, "y": 40}, ...]} '
    '(an empty list when you see none).'
)
QUAD_PROMPT = (
    'This is one enlarged part of a picture as a player sees it on a phone screen. Capital Latin letters may be hidden '
    'in it, formed by objects or parts of the scene (for example twigs, wire, tiles, handles, folds of cloth or the '
    'silhouette of one object); a letter may be rotated or lying on its side. List the letters you can find in this '
    'part when you look for them for a few seconds. Do not guess and do not list ordinary printed text such as signs '
    'or labels unless it is a single large letter. For each letter give the centre of the letter as x and y in '
    'percent of THIS image\'s width and height (0 = left/top, 100 = right/bottom). Answer with JSON only, no other '
    'text: {"letters": [{"letter": "A", "x": 12, "y": 40}, ...]} (an empty list when you see none).'
)


def composite(pdir: Path, project: dict, cache: dict) -> np.ndarray:
    """What the player sees: the current BG with every kept, labelled target's build layer on it."""
    from . import build as B
    ctx = _layer_ctx(pdir, project, cache)
    out = ctx.bg.astype(np.float32).copy()
    for c in project.get('candidates', []):
        if c.get('state') != 'kept' or not c.get('label') or c.get('edit') not in ctx.edits:
            continue
        rgba, left, top = B.target_layer(ctx, c)
        h, w = rgba.shape[:2]
        a = rgba[..., 3:4].astype(np.float32) / 255
        sub = out[top:top + h, left:left + w]
        sub[:] = rgba[..., :3].astype(np.float32) * a + sub * (1 - a)
    return out.round().clip(0, 255).astype(np.uint8)


def quarters(W: int, H: int, overlap: float = QUAD_OVERLAP) -> list[list[int]]:
    ox, oy = int(W * overlap / 2), int(H * overlap / 2)
    xs = [(0, W // 2 + ox), (W // 2 - ox, W)]
    ys = [(0, H // 2 + oy), (H // 2 - oy, H)]
    return [[x0, y0, x1, y1] for (y0, y1) in ys for (x0, x1) in xs]


def parse_points(text: str) -> list[dict]:
    """[{letter, x, y}] (x, y in 0-100) from a {"letters": [...]} answer; anything unreadable is dropped."""
    m = re.search(r'\{.*\}', text or '', re.S)
    try:
        items = json.loads(m.group(0)).get('letters') if m else None
    except (ValueError, AttributeError):
        items = None
    out = []
    for it in items if isinstance(items, list) else []:
        try:
            letter, x, y = _letter(it.get('letter')), float(it.get('x')), float(it.get('y'))
        except (TypeError, ValueError, AttributeError):
            continue
        if letter != '?' and -5 <= x <= 105 and -5 <= y <= 105:
            out.append({'letter': letter, 'x': min(100.0, max(0.0, x)), 'y': min(100.0, max(0.0, y))})
    return out


def _box_dist(px, py, box) -> float:
    x0, y0, x1, y1 = box
    return float(np.hypot(max(x0 - px, 0, px - x1), max(y0 - py, 0, py - y1)))


def match_points(points: list[dict], targets: list[dict], W: int, H: int) -> tuple[dict, list[dict]]:
    """points in canvas px [{letter, px, py}] -> ({cand id: point}, unmatched points). Nearest first."""
    tol_c = TOL * max(W, H)
    pairs = []
    for i, pt in enumerate(points):
        for t in targets:
            if t['expected'] != pt['letter']:
                continue
            d = _box_dist(pt['px'], pt['py'], t['box'])
            if d <= max(tol_c, TOL_SIDE * t['side']):
                pairs.append((d, i, t['id']))
    got, used = {}, set()
    for d, i, cid in sorted(pairs):
        if i in used or cid in got:
            continue
        got[cid] = {**points[i], 'miss_px': round(d)}
        used.add(i)
    return got, [p for i, p in enumerate(points) if i not in used]


def _jpeg(img: Image.Image) -> bytes:
    b = io.BytesIO()
    img.save(b, 'JPEG', quality=92)
    return b.getvalue()


def _planned(project: dict, planned=None) -> tuple[dict, str | None]:
    if planned is not None:
        if not isinstance(planned, dict) or any(v not in LEVELS for v in planned.values()):
            raise StoreError("planned: {label: 'easy'|'medium'|'hard'}")
        return dict(planned), 'request'
    for b in reversed(project.get('builds', [])):
        d = (b.get('meta') or {}).get('difficulty')
        if isinstance(d, dict) and d:
            return {k: str(v).lower() for k, v in d.items()}, f"build {b.get('id')}"
    return {}, None


def run_glance(name: str, ids=None, runs: int = 1, seeds=None, model: str | None = None, ask=None, window=None,
               tile=None, rois=None, zoom=None, controls=True, width: int = GLANCE_WIDTH, planned=None) -> dict:
    if not isinstance(runs, int) or isinstance(runs, bool) or not 1 <= runs <= 3:
        raise StoreError('runs must be 1, 2 or 3')
    if not isinstance(width, int) or isinstance(width, bool) or not 240 <= width <= 800:
        raise StoreError('width must be an integer 240-800 (phone width in px, default 390)')
    with _guard:
        lock = _locks.setdefault(name, threading.Lock())
    with lock:
        return _run_glance(name, ids, runs, seeds, model, ask, window, tile, rois, zoom, controls, width, planned)


def _run_glance(name, ids, runs, seeds, model, ask, window, tile, rois, zoom, controls, width, planned) -> dict:
    mid = model_id(model)
    p = store.read(name)
    pdir = store.pdir(name)
    sel = select(p, ids)
    sel_ids = {c['id'] for c in sel}
    opt = check_options(window, tile, rois, p.get('canvas'), zoom)
    edits_by_id = {e['id']: e for e in p.get('edits', [])}
    for c in sel:
        if edits_by_id.get(c.get('edit'), {}).get('status') != 'done':
            raise StoreError(f'candidate {c["id"]}: its edit {c.get("edit")} has no answer', 409)
    plan, plan_src = _planned(p, planned)
    cache = {}
    scene = composite(pdir, p, cache)
    H, W = scene.shape[:2]
    targets = []
    for c in sel:
        side, _ = letter_side(pdir, p, c, cache)
        targets.append({'id': c['id'], 'label': c.get('label'), 'expected': expected_letter(c.get('label')),
                        'box': list(c['box']), 'side': side})

    rid = f'r{len(p.get("blindreads", [])) + 1}'
    rdir = pdir / 'blindread' / rid
    rdir.mkdir(parents=True, exist_ok=True)
    seeds = [int(s) for s in (seeds or [])]
    while len(seeds) < runs:
        seeds.append(random.randrange(1, 10 ** 9))
    if ask is None:
        def ask(images, prompt):
            return providers.claude_vision(images, prompt, model=mid)['text']
    s1 = width / W
    glance_img = Image.fromarray(scene).resize((width, max(1, round(H * s1))), Image.LANCZOS)
    glance_img.save(rdir / 'glance.jpg', quality=92)
    quads = quarters(W, H)
    quad_imgs = []
    for k, (x0, y0, x1, y1) in enumerate(quads, 1):
        im = Image.fromarray(scene[y0:y1, x0:x1])
        im = im.resize((max(1, round((x1 - x0) * 2 * s1)), max(1, round((y1 - y0) * 2 * s1))), Image.LANCZOS)
        im.save(rdir / f'quarter_{k}.jpg', quality=92)
        quad_imgs.append(im)
    record = {'id': rid, 'created': now(), 'model': mid, 'mode': 'glance', 'ids': [c['id'] for c in sel],
              'width': width, 'quarters': quads, 'planned_from': plan_src, 'seeds': seeds[:runs],
              'window': opt['window'], 'tile': opt['tile']}
    store.write_json(rdir / 'request.json', {**record, 'prompts': {'glance': GLANCE_PROMPT, 'quarter': QUAD_PROMPT,
                                                                   'scene': PROMPT}})

    def stage_call(img, prompt, fname):
        try:
            text = ask([_jpeg(img)], prompt)
            err = None
        except providers.ProviderError as e:
            text, err = '', str(e)
        (rdir / fname).write_text(text or '')
        return parse_points(text), err

    stage_runs, errors = [], []
    for r in range(runs):
        pts, err = stage_call(glance_img, GLANCE_PROMPT, f'answer_glance_{r + 1}.txt')
        errors += [err] if err else []
        pts = [{**q, 'px': q['x'] / 100 * W, 'py': q['y'] / 100 * H} for q in pts]
        g_hit, g_extra = match_points(pts, targets, W, H)
        q_pts = []
        for k, ((x0, y0, x1, y1), im) in enumerate(zip(quads, quad_imgs), 1):
            qp, err = stage_call(im, QUAD_PROMPT, f'answer_quarter_{r + 1}_{k}.txt')
            errors += [err] if err else []
            q_pts += [{**q, 'quarter': k, 'px': x0 + q['x'] / 100 * (x1 - x0), 'py': y0 + q['y'] / 100 * (y1 - y0)}
                      for q in qp]
        q_hit, q_extra = match_points(q_pts, targets, W, H)
        stage_runs.append({'seed': seeds[r], 'glance': {str(k): v for k, v in g_hit.items()},
                           'quarters': {str(k): v for k, v in q_hit.items()},
                           'glance_extra': g_extra, 'quarter_extra': q_extra})

    def found(stage, cid):
        n = sum(str(cid) in sr[stage] for sr in stage_runs)
        return n * 2 > runs

    easy = {t['id'] for t in targets if found('glance', t['id'])}
    medium = {t['id'] for t in targets if t['id'] not in easy and found('quarters', t['id'])}
    rest = [c for c in sel if c['id'] not in easy | medium]
    scene_res, scene_sum, scene_runs = {}, None, []
    if rest:
        tiles = {}
        for c in rest:
            w = opt['window'] / opt['zoom'].get(c['id'], 1.0)
            roi = opt['rois'].get(c['id'])
            tiles[c['id']] = _tile('scene', pdir, p, c, edits_by_id[c['edit']], cache, opt, w, roi)
        clist = load_controls() if controls is True else (list(controls) if controls else [])
        ctrl, skipped = _control_tiles(clist, name, sel_ids, opt, ('scene',))
        record['controls'] = {'scene': [{'key': x['key'], 'expected': x['expected']} for x in ctrl['scene']]}
        record['controls_skipped'] = skipped
        scene_runs, scene_res, scene_sum = _read_mode('scene', rest, tiles, ctrl['scene'], runs, seeds, ask, rdir,
                                                      rid)
    results, mix, mism = {}, Counter(), []
    for t in targets:
        cid = t['id']
        if cid in easy:
            ach = 'easy'
        elif cid in medium:
            ach = 'medium'
        else:
            ok = scene_res[cid]['ok']
            ach = None if ok is None else ('hard' if ok else 'fail')
        mix[str(ach)] += 1
        pl = plan.get(t['label']) if t['label'] else None
        res = {'label': t['label'], 'expected': t['expected'], 'achieved': ach, 'planned': pl,
               'match': (pl == ach) if pl and ach else None, 'side': t['side'],
               'glance_runs': sum(str(cid) in sr['glance'] for sr in stage_runs),
               'quarter_runs': sum(str(cid) in sr['quarters'] for sr in stage_runs)}
        if cid in scene_res:
            res['scene'] = scene_res[cid]
        if pl and ach and pl != ach:
            order = {'easy': 0, 'medium': 1, 'hard': 2, 'fail': 3}
            res['vs_plan'] = 'easier' if order[ach] < order[pl] else 'harder'
            mism.append(f"{t['label']}: planned {pl}, achieved {ach}")
        results[str(cid)] = res
    planned_mix = Counter(v['planned'] for v in results.values() if v['planned'])
    summary = {'mode': 'glance', 'n': len(results), 'runs': runs, 'width': width,
               'achieved': {k: mix.get(k, 0) for k in ('easy', 'medium', 'hard', 'fail', 'None')},
               'planned': {k: planned_mix.get(k, 0) for k in LEVELS} if plan else None,
               'planned_from': plan_src,
               'mismatches': mism,
               'easier_than_planned': sorted(v['label'] for v in results.values() if v.get('vs_plan') == 'easier'),
               'harder_than_planned': sorted(v['label'] for v in results.values() if v.get('vs_plan') == 'harder'),
               'extra_letters': {'glance': [x for sr in stage_runs for x in sr['glance_extra']],
                                 'quarters': [x for sr in stage_runs for x in sr['quarter_extra']]},
               'scene_valid': None if scene_sum is None else scene_sum['valid'],
               'valid': not errors and (scene_sum is None or scene_sum['valid'])}
    if errors:
        summary['errors'] = errors
    record.update(stages=stage_runs, results=results, summary=summary, ended=now(),
                  modes={'scene': {'runs': scene_runs, 'summary': scene_sum}} if scene_sum else {})
    _glance_overview(scene, targets, results, summary).save(pdir / f'blindread_{rid[1:]}.jpg', quality=90)
    record['image'] = f'blindread_{rid[1:]}.jpg'
    record['glance_image'] = f'blindread/{rid}/glance.jpg'
    store.write_json(rdir / 'result.json', record)
    store.update(name, lambda proj: proj.setdefault('blindreads', []).append(record))
    return record


def _glance_overview(scene: np.ndarray, targets, results, summary) -> Image.Image:
    """The scene (1024 px wide) with every target boxed in its achieved level's colour, label + planned->achieved."""
    H, W = scene.shape[:2]
    s = min(1.0, 1024 / W)
    im = Image.fromarray(scene).resize((round(W * s), round(H * s)), Image.LANCZOS)
    d = ImageDraw.Draw(im)
    f = _font(18)
    for t in targets:
        r = results[str(t['id'])]
        col = LEVEL_COLOUR.get(r['achieved'], LEVEL_COLOUR[None])
        x0, y0, x1, y1 = (v * s for v in t['box'])
        d.rectangle([x0 - 3, y0 - 3, x1 + 3, y1 + 3], outline=col, width=4)
        txt = f"{t['label'] or t['id']} {r['planned'] or '-'}>{r['achieved']}"
        tw = d.textlength(txt, font=f) + 6
        tx = max(0, min(x0 - 3, im.width - tw))          # keep the label inside the picture
        ty = y0 - 26 if y0 >= 56 else y1 + 4
        d.rectangle([tx, ty, tx + tw, ty + 22], fill=(255, 255, 255))
        d.text((tx + 3, ty + 1), txt, fill=col, font=f)
    a = summary['achieved']
    head = f"glance: easy {a['easy']}  medium {a['medium']}  hard {a['hard']}  fail {a['fail']}"
    if summary.get('planned'):
        pm = summary['planned']
        head += f"   planned: easy {pm['easy']}  medium {pm['medium']}  hard {pm['hard']}"
    d.rectangle([0, 0, im.width, 30], fill=(255, 255, 255))
    d.text((8, 5), head, fill=(0, 0, 0), font=f)
    return im
