"""Find what one edit drew: candidates from the diff of answer.png against the clean BG crop of its box.

Port of Waldo tools/regions/detect.py, tuned for small hidden letters (roughly 60-200 px, sometimes faint or engraved):
- the answer's tone is matched to the BG first (Nano Banana shifts colours a little when it redraws the square);
- a shift-tolerant diff (min over small shifts of the BG) ignores the redraw drift, a plain diff near the strong
  pixels takes back the weak ones (faint strokes, shadows) — a hysteresis of two thresholds;
- the seed threshold adapts to the drift measured in the part of the box outside the rect;
- blobs far outside the rect are drift and ignored; the others become candidates with flags.

Also holds the small helpers the other modules share (masks on disk, BG / answer loading, flags).
Module functions never write project.json; they return data and plc/store.py persists it.
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

# Every threshold is a parameter: detect_edit(..., params={...}) overrides any of these.
PARAMS = dict(
    thr=26,          # tolerant diff (max channel, 0-255) that seeds a candidate
    thr_soft=12,     # diff of the blurred images that seeds a candidate (faint engraved / printed letters)
    soft_blur=2.0,   # sigma of that blur
    sig_thr=1.4,     # soft diff / (local BG texture std + std_s0) that seeds a candidate (faint on smooth surfaces)
    sig_min=6,       # ... as long as the soft diff itself is at least this (JPEG noise on flat areas stays out)
    std_r=9,         # px window of that local std
    std_s0=2.0,
    tile=96,         # px tiles for aligning the BG to the redraw (soft diff)
    thr_lo=13,       # weaker diff that still counts when it is close to a seed (faint / engraved strokes)
    thr_max=60,      # cap for the drift-adaptive seed threshold
    plain_thr=34,    # plain (not shift-tolerant) diff taken back right around a seed
    reach=6,         # px around a seed where the weak / plain diff is taken back
    shift=6,         # px of redraw drift the tolerant diff ignores
    blur=1.2,        # sigma of the diff smoothing
    open=1,          # opening iterations on the seeds (removes specks)
    join=16,         # px; separate pieces closer than this are one candidate
    close=3,         # closing iterations (joins the strokes / pieces of one letter)
    hole_max=300,    # px; holes up to this size are filled, bigger ones (inside an O) stay BG
    min_area=110,    # px; smaller blobs are noise
    min_side=30,     # px; a blob whose bbox is smaller on both sides is noise
    edge_strip=12,   # px; a blob whose seeds all lie this close to one box edge is a border artefact, ignored
    margin=96,       # px; a blob whose centre is farther than this outside the rect is drift, ignored
    outside_frac=0.5,  # less than this share of the mask inside the rect -> "outside"
    big_side=360,    # bbox side above this -> "big"
    big_ratio=None,  # area above this times the edit's median -> "big" (3+ candidates); off: letters vary in size
    multi_aspect=1.6,  # a blob this many times wider than tall also looks like several letters -> "multi"
    faint=30,        # mean plain diff below this -> "faint" (look closely on the sheet)
    min_letter_px=50,      # letter long side below this -> "small" (user rule: a build refuses it unless allowed)
    min_letter_frac=None,  # optional override: a share of the canvas height instead of min_letter_px
    tone=True,       # match the answer's tone to the BG before diffing
)


# ---------------------------------------------------------------- shared helpers

def params(over: dict | None = None) -> dict:
    p = dict(PARAMS)
    if over:
        unknown = set(over) - set(PARAMS)
        if unknown:
            raise ValueError(f'unknown detect params: {sorted(unknown)}')
        p.update(over)
    return p


def load_rgb(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert('RGB'))


def load_bg(pdir: Path) -> np.ndarray:
    return load_rgb(Path(pdir) / 'bg.png')


def edit_bg_file(pdir: Path, project: dict, edit: dict) -> Path:
    """The BG version the edit was generated from (store.bg_file_for_edit: background/extend keeps old versions as
    bg_v<n>.png; edits without a stamp, or projects never extended, use bg.png)."""
    from . import store
    f = store.bg_file_for_edit(Path(pdir), project, edit)
    return f if f.is_file() else Path(pdir) / 'bg.png'


def load_edit_bg(pdir: Path, project: dict, edit: dict, current: np.ndarray | None = None) -> np.ndarray:
    """The full BG the edit's answer must be diffed and tone-fitted against (see edit_bg_file). `current` = the
    already loaded bg.png, returned when the edit's BG is bg.png itself or does not match its size."""
    f = edit_bg_file(pdir, project, edit)
    cur = Path(pdir) / 'bg.png'
    if f == cur or (f.resolve() == cur.resolve()):
        return load_bg(pdir) if current is None else current
    own = load_rgb(f)
    if current is not None and own.shape != current.shape:
        return current
    return own


def edit_by_id(project: dict, eid: str) -> dict:
    for e in project.get('edits', []):
        if e['id'] == eid:
            return e
    raise ValueError(f'edit {eid} not found')


def load_answer(pdir: Path, edit: dict, registered: bool = True, bg: np.ndarray | None = None) -> np.ndarray:
    """answer.png of an edit as RGB uint8, exactly the size of edit["box"]. registered: laid onto the BG first
    (plc/register.py, cached as answer_reg.png), so a shifted or scaled answer (GPT image) diffs like a Nano one.
    `bg` = the full BG when the caller already has it."""
    f = Path(pdir) / 'edits' / edit['id'] / 'answer.png'
    if not f.is_file():
        raise ValueError(f"edit {edit['id']} has no answer.png (status {edit.get('status')})")
    x0, y0, x1, y1 = edit['box']
    im = Image.open(f).convert('RGB')
    if im.size != (x1 - x0, y1 - y0):
        im = im.resize((x1 - x0, y1 - y0), Image.LANCZOS)
    ans = np.asarray(im)
    if not registered or _registered_on_arrival(f.parent):
        return ans
    from . import register as R
    crop = (load_bg(pdir) if bg is None else bg)[y0:y1, x0:x1]
    if crop.shape != ans.shape:
        return ans
    out, _ = R.cached(f.parent, ans, crop, f)
    return out


def _registered_on_arrival(edir: Path) -> bool:
    """plc/edits.py already ran plc/register.py on this answer (result.json "registration" without an error)."""
    try:
        reg = json.loads((edir / 'result.json').read_text()).get('registration') or {}
    except (OSError, ValueError):
        return False
    return 'applied' in reg and not reg.get('error') and reg.get('by') == 'plc.register'


def rect_mask(edit: dict) -> np.ndarray:
    """Bool mask of edit["rect"] inside its box (box-sized)."""
    ex0, ey0, ex1, ey1 = edit['box']
    rect = edit.get('rect') or edit['box']
    m = np.zeros((ey1 - ey0, ex1 - ex0), bool)
    m[max(0, rect[1] - ey0):max(0, rect[3] - ey0), max(0, rect[0] - ex0):max(0, rect[2] - ex0)] = True
    return m


def mask_path(pdir: Path, cid: int) -> Path:
    return Path(pdir) / 'cand' / f'{cid}.png'


def save_mask(pdir: Path, cid: int, mask: np.ndarray) -> None:
    f = mask_path(pdir, cid)
    f.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(mask.astype(np.uint8) * 255, 'L').save(f)


def load_mask(pdir: Path, cand: dict) -> np.ndarray:
    """The candidate's mask (bool), the size of cand["box"]."""
    k = np.asarray(Image.open(mask_path(pdir, cand['id'])).convert('L')) > 127
    x0, y0, x1, y1 = cand['box']
    if k.shape != (y1 - y0, x1 - x0):
        raise ValueError(f"candidate {cand['id']}: mask {k.shape[::-1]} does not match its box {cand['box']}")
    return k


def next_id(project: dict) -> int:
    return max((int(c['id']) for c in project.get('candidates', [])), default=0) + 1


def crop_to_mask(mask: np.ndarray, ox: int, oy: int):
    """(cropped mask, [x0, y0, x1, y1] in canvas coords) of a mask whose top-left sits at canvas (ox, oy)."""
    ys, xs = np.nonzero(mask)
    if not len(ys):
        return None, None
    k = mask[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    return k, [int(ox + xs.min()), int(oy + ys.min()), int(ox + xs.max() + 1), int(oy + ys.max() + 1)]


def place(mask: np.ndarray, box, win) -> np.ndarray:
    """A mask with canvas box `box`, drawn into a bool window `win` = [x0, y0, x1, y1] (clipped)."""
    wx0, wy0, wx1, wy1 = win
    out = np.zeros((wy1 - wy0, wx1 - wx0), bool)
    bx0, by0 = box[0], box[1]
    x0, y0 = max(wx0, bx0), max(wy0, by0)
    x1, y1 = min(wx1, bx0 + mask.shape[1]), min(wy1, by0 + mask.shape[0])
    if x0 < x1 and y0 < y1:
        out[y0 - wy0:y1 - wy0, x0 - wx0:x1 - wx0] = mask[y0 - by0:y1 - by0, x0 - bx0:x1 - bx0]
    return out


# ---------------------------------------------------------------- diffs

def tone_fit(answer: np.ndarray, bg: np.ndarray, exclude: np.ndarray | None = None):
    """Per-channel gain/offset that maps the answer's tone onto the BG. Moment matching (mean / std of blurred
    images), not a per-pixel regression: the redraw is shifted a little, which would drag a regression gain to 0.
    `exclude` = pixels left out (where the edit drew things). Returns (gain[3], offset[3]) or None when untrustworthy."""
    a = cv2.GaussianBlur(answer.astype(np.float32), (0, 0), 3)
    b = cv2.GaussianBlur(bg.astype(np.float32), (0, 0), 3)
    keep = np.ones(a.shape[:2], bool) if exclude is None else ~exclude
    if keep.sum() < 2000:
        return None
    d = np.abs(a - b).max(2)
    keep &= d <= np.percentile(d[keep], 90)  # leave out what the edit drew there anyway
    gain, off = np.ones(3, np.float32), np.zeros(3, np.float32)
    for ch in range(3):
        x, y = a[..., ch][keep], b[..., ch][keep]
        sx, sy = float(x.std()), float(y.std())
        g = sy / sx if sx > 3 and sy > 3 else 1.0
        gain[ch], off[ch] = g, float(y.mean() - g * x.mean())
    if np.any(gain < 0.8) or np.any(gain > 1.25) or np.any(np.abs(off) > 40):
        return None
    if np.all(np.abs(gain - 1) < 0.01) and np.all(np.abs(off) < 1):
        return None
    return gain, off


def edit_tone_fit(edit: dict, ans: np.ndarray, bg_crop: np.ndarray):
    """tone_fit for one edit: fitted outside the rect when enough of the box lies outside it, else on the whole box."""
    ex0, ey0 = edit['box'][:2]
    rect = edit.get('rect') or edit['box']
    h, w = ans.shape[:2]
    in_rect = np.zeros((h, w), bool)
    in_rect[max(0, rect[1] - ey0):max(0, rect[3] - ey0), max(0, rect[0] - ex0):max(0, rect[2] - ex0)] = True
    return tone_fit(ans, bg_crop, in_rect if (~in_rect).sum() > 0.08 * h * w else None)


def apply_tone(answer: np.ndarray, fit) -> np.ndarray:
    if fit is None:
        return answer
    g, o = fit
    return np.clip(answer.astype(np.float32) * g + o, 0, 255).astype(np.uint8)


def plain_diff(a: np.ndarray, b: np.ndarray, blur: float = 1.2) -> np.ndarray:
    d = np.abs(a.astype(np.int16) - b.astype(np.int16)).max(2).astype(np.float32)
    return cv2.GaussianBlur(d, (0, 0), blur) if blur else d


def tolerant_diff(a: np.ndarray, b: np.ndarray, r: int = 6, blur: float = 1.2) -> np.ndarray:
    """Diff that ignores small shifts of the redrawn background: min over BG shifts up to r px (step 2)."""
    a = a.astype(np.int16)
    if r <= 0:
        return plain_diff(a, b, blur)
    pad = np.pad(b.astype(np.int16), ((r, r), (r, r), (0, 0)), mode='edge')
    best = np.full(a.shape[:2], 1e9, np.float32)
    h, w = a.shape[:2]
    steps = sorted(set(list(range(-r, r + 1, 2)) + [-r, r, 0]))
    for dy in steps:
        for dx in steps:
            np.minimum(best, np.abs(a - pad[r + dy:r + dy + h, r + dx:r + dx + w]).max(2), out=best)
    return cv2.GaussianBlur(best, (0, 0), blur) if blur else best


def align_bg(answer: np.ndarray, bg: np.ndarray, r: int = 6, tile: int = 96) -> np.ndarray:
    """The BG warped onto the redraw: per tile, the shift (up to r px) that best matches the answer (template matching
    on blurred images), median-smoothed over the tiles and interpolated per pixel. Unlike the per-pixel min of
    tolerant_diff this keeps faint changes on textured surfaces (the min finds a darker grain to explain them away)."""
    h, w = answer.shape[:2]
    if r <= 0 or h < tile or w < tile:
        return bg
    ga = cv2.GaussianBlur(cv2.cvtColor(answer, cv2.COLOR_RGB2GRAY).astype(np.float32), (0, 0), 1.5)
    gb = cv2.GaussianBlur(cv2.cvtColor(bg, cv2.COLOR_RGB2GRAY).astype(np.float32), (0, 0), 1.5)
    gbp = cv2.copyMakeBorder(gb, r, r, r, r, cv2.BORDER_REPLICATE)
    ny, nx = max(1, h // tile), max(1, w // tile)
    ys = np.linspace(0, h - tile, ny).astype(int)
    xs = np.linspace(0, w - tile, nx).astype(int)
    sy = np.zeros((ny, nx), np.float32)
    sx = np.zeros((ny, nx), np.float32)
    for i, y in enumerate(ys):
        for j, x in enumerate(xs):
            t = ga[y:y + tile, x:x + tile]
            if t.std() < 2:
                continue  # flat: any shift fits
            res = cv2.matchTemplate(gbp[y:y + tile + 2 * r, x:x + tile + 2 * r], t, cv2.TM_SQDIFF)
            _, _, (mx, my), _ = cv2.minMaxLoc(res)
            sy[i, j], sx[i, j] = my - r, mx - r
    if ny >= 3 and nx >= 3:
        sy, sx = ndi.median_filter(sy, 3, mode='nearest'), ndi.median_filter(sx, 3, mode='nearest')
    fy = cv2.resize(sy, (w, h), interpolation=cv2.INTER_LINEAR)
    fx = cv2.resize(sx, (w, h), interpolation=cv2.INTER_LINEAR)
    gy, gx = np.mgrid[:h, :w].astype(np.float32)
    return cv2.remap(bg, gx + fx, gy + fy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)


def diffs(answer: np.ndarray, bg: np.ndarray, p: dict) -> dict:
    """plain: pixel diff; tol: shift-tolerant diff (no redraw drift); soft: diff of blurred images after aligning the
    BG to the redraw (a faint engraved / printed letter survives, fine texture drift does not)."""
    sb = p['soft_blur']
    al = align_bg(answer, bg, p['shift'], p['tile'])
    a_s = cv2.GaussianBlur(answer, (0, 0), sb)
    b_s = cv2.GaussianBlur(al, (0, 0), sb)
    soft = tolerant_diff(a_s, b_s, 1, 0)
    return dict(plain=plain_diff(answer, bg, p['blur']), tol=tolerant_diff(answer, bg, p['shift'], p['blur']),
                soft=soft, sig=soft / (local_std(bg, p['std_r']) + p['std_s0']))


def local_std(img: np.ndarray, r: int) -> np.ndarray:
    """Grey-level std in an r x r window: how much the surface itself varies there."""
    g = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY).astype(np.float32)
    m = cv2.blur(g, (r, r))
    return np.sqrt(np.maximum(cv2.blur(g * g, (r, r)) - m * m, 0))


def thresholds(dd: dict, quiet: np.ndarray | None, p: dict) -> dict:
    """Seed thresholds raised to the drift measured where nothing should have been drawn (`quiet`)."""
    t = dict(tol=float(p['thr']), soft=float(p['thr_soft']), sig=float(p['sig_thr']))
    for key, cap in (('tol', p['thr_max']), ('soft', p['thr_max'] * 0.6), ('sig', p['sig_thr'] * 2)):
        d = dd[key]
        if quiet is not None and quiet.sum() > 0.05 * d.size:
            noise = float(np.percentile(d[quiet], 99))
        else:
            noise = float(np.median(d)) * 3
        extra = 3 if key != 'sig' else 0.2
        t[key] = float(np.clip(max(t[key], noise * 1.15 + extra), t[key], max(t[key], cap)))
    return t


def change_mask(dd: dict, p: dict, thr: dict):
    """Changed pixels: seeds (tolerant or soft diff above the seed thresholds) plus the weak / plain diff right
    around them, kept only in components that hold a seed (hysteresis). Returns (mask, seeds)."""
    tol, soft, plain, sig = dd['tol'], dd['soft'], dd['plain'], dd['sig']
    seeds = (tol > thr['tol']) | (soft > thr['soft']) | ((sig > thr['sig']) & (soft > p['sig_min']))
    if p['open']:
        seeds = ndi.binary_opening(seeds, iterations=p['open'])
    if not seeds.any():
        return seeds, seeds
    near = ndi.binary_dilation(seeds, iterations=p['reach'])
    weak = ((tol > p['thr_lo']) | (plain > p['plain_thr']) | (soft > 0.7 * thr['soft'])
            | ((sig > 0.6 * thr['sig']) & (soft > 0.7 * p['sig_min'])))
    m = seeds | (weak & near)
    lab, n = ndi.label(m)
    if n:
        hit = np.unique(lab[seeds])
        m = np.isin(lab, hit[hit > 0])
    return m, seeds


# ---------------------------------------------------------------- flags

def min_letter_px(canvas: dict, p: dict | None = None) -> int:
    """The minimum letter size (long side) in px: min_letter_px (50), or min_letter_frac x the canvas height
    (rounded up) when that override is set."""
    p = {**PARAMS, **(p or {})}
    if p.get('min_letter_frac'):
        return int(np.ceil(p['min_letter_frac'] * canvas['h']))
    return int(p['min_letter_px'])


def flags_for(mask: np.ndarray, box, edit: dict, canvas: dict, p: dict | None = None,
              contrast: float | None = None) -> list[str]:
    """Flags of one candidate (mask cropped to its canvas box): big, multi, clipped, outside, faint, small."""
    p = {**PARAMS, **(p or {})}
    f = []
    x0, y0, x1, y1 = box
    ex0, ey0, ex1, ey1 = edit['box']
    W, H = canvas['w'], canvas['h']
    if max(x1 - x0, y1 - y0) > p['big_side']:
        f.append('big')
    # several letters side by side come out as one wide blob (separate pieces say little: faint or twig letters
    # break into pieces too)
    if (x1 - x0) > p['multi_aspect'] * max(1, y1 - y0) and (x1 - x0) >= 2 * p['min_side']:
        f.append('multi')
    near = 2
    if ((x0 - ex0 < near and ex0 > 0) or (y0 - ey0 < near and ey0 > 0)
            or (ex1 - x1 < near and ex1 < W) or (ey1 - y1 < near and ey1 < H)):
        f.append('clipped')
    rect = edit.get('rect') or edit['box']
    inside = place(np.ones((rect[3] - rect[1], rect[2] - rect[0]), bool), rect, box)
    if (mask & inside).sum() < p['outside_frac'] * max(1, mask.sum()):
        f.append('outside')
    if contrast is not None and contrast < p['faint']:
        f.append('faint')
    if max(x1 - x0, y1 - y0) < min_letter_px(canvas, p):
        f.append('small')
    return f


# ---------------------------------------------------------------- detect

def fill_small_holes(m: np.ndarray, hole_max: int) -> np.ndarray:
    """Fill holes up to hole_max px (gaps between strokes); bigger ones (the inside of an O or A) stay BG, so the
    layer does not show the redrawn, slightly shifted texture there."""
    filled = ndi.binary_fill_holes(m)
    holes = filled & ~m
    if not holes.any():
        return filled
    lab, n = ndi.label(holes)
    sz = ndi.sum(holes, lab, range(1, n + 1))
    big = np.isin(lab, [j + 1 for j in range(n) if sz[j] > hole_max])
    return filled & ~big


def _edge_strip(seeds: np.ndarray, sl, w: int, h: int, e: int) -> bool:
    """All seed pixels of the blob lie within e px of one box edge (a border artefact, not an object)."""
    ys, xs = np.nonzero(seeds)
    if not len(ys):
        return False
    ys, xs = ys + sl[0].start, xs + sl[1].start
    return bool(xs.max() < e or xs.min() >= w - e or ys.max() < e or ys.min() >= h - e)


def detect_edit(pdir, project: dict, edit: dict, params_over: dict | None = None) -> list[dict]:
    """Candidates drawn by one edit. Writes cand/<id>.png masks (new ids = max existing + 1); returns the dicts.
    The caller (store, inside the project lock) appends them and sets edit["detected"]."""
    p = params(params_over)
    pdir = Path(pdir)
    canvas = project['canvas']
    ex0, ey0, ex1, ey1 = edit['box']
    full = load_edit_bg(pdir, project, edit)  # the BG this edit was made on (an extend later changes bg.png)
    ans = load_answer(pdir, edit, bg=full)
    bg = full[ey0:ey1, ex0:ex1]
    if bg.shape != ans.shape:
        raise ValueError(f"edit {edit['id']}: box {edit['box']} lies outside the {canvas['w']}x{canvas['h']} BG")
    h, w = ans.shape[:2]
    rect = edit.get('rect') or edit['box']
    rx0, ry0, rx1, ry1 = (rect[0] - ex0, rect[1] - ey0, rect[2] - ex0, rect[3] - ey0)
    in_rect = np.zeros((h, w), bool)
    in_rect[max(0, ry0):max(0, ry1), max(0, rx0):max(0, rx1)] = True
    m = p['margin']
    near_rect = np.zeros((h, w), bool)
    near_rect[max(0, ry0 - m):max(0, ry1 + m), max(0, rx0 - m):max(0, rx1 + m)] = True

    ans_t = apply_tone(ans, edit_tone_fit(edit, ans, bg)) if p['tone'] else ans

    dd = diffs(ans_t, bg, p)
    thr = thresholds(dd, ~near_rect, p)
    mask, seeds = change_mask(dd, p, thr)
    plain = dd['plain']
    closed = ndi.binary_closing(mask, iterations=p['close']) if p['close'] else mask
    closed |= mask
    # pieces closer than `join` px are one object (a carved outline or a twig letter breaks into strokes)
    if p['join']:
        groups, n = ndi.label(ndi.binary_dilation(closed, iterations=max(1, p['join'] // 2)))
        lab = np.where(closed, groups, 0)
    else:
        lab, n = ndi.label(closed)
    found = []
    for i, sl in enumerate(ndi.find_objects(lab), 1):
        if sl is None:
            continue
        c = lab[sl] == i
        if p['join']:  # bridge the gaps inside the joined object before filling its holes
            c = ndi.binary_closing(np.pad(c, p['join']), iterations=max(1, p['join'] // 2))[
                p['join']:-p['join'], p['join']:-p['join']] | c
        c = fill_small_holes(c, p['hole_max'])
        area = int(c.sum())
        bh, bw = c.shape
        if area < p['min_area'] or max(bh, bw) < p['min_side']:
            continue
        cy, cx = (sl[0].start + sl[0].stop) / 2, (sl[1].start + sl[1].stop) / 2
        if _edge_strip(seeds[sl] & (lab[sl] == i), sl, w, h, p['edge_strip']):
            continue  # a redraw artefact along the box border
        if not near_rect[int(min(h - 1, cy)), int(min(w - 1, cx))]:
            continue  # redraw drift far from where the caller asked for something
        k, box = crop_to_mask(c, ex0 + sl[1].start, ey0 + sl[0].start)
        contrast = float(plain[sl][c].mean())
        found.append(dict(mask=k, box=box, area=int(k.sum()), contrast=contrast))

    nid = next_id(project)
    out = []
    med = float(np.median([f['area'] for f in found])) if len(found) >= 3 and p['big_ratio'] else None
    for f in sorted(found, key=lambda f: (f['box'][1], f['box'][0])):
        flags = flags_for(f['mask'], f['box'], edit, canvas, p, f['contrast'])
        if med and f['area'] > p['big_ratio'] * med and 'big' not in flags:
            flags.insert(0, 'big')
        save_mask(pdir, nid, f['mask'])
        out.append(dict(id=nid, edit=edit['id'], box=f['box'], area=f['area'], flags=flags, state='new',
                        label=None, group=None, contrast=round(f['contrast'], 1)))
        nid += 1
    return out


def detect_in_box(pdir, project: dict, edit: dict, box, thr: float | None = None, p: dict | None = None):
    """A candidate the automatic pass missed (a faint letter): pixels inside `box` (canvas coords, clipped to the
    edit's box) whose tolerant or aligned-soft diff passes a lower threshold (default thr_soft); keeps the biggest
    piece and what lies close to it. Returns (mask, box)."""
    p = params(p)
    ex0, ey0, ex1, ey1 = edit['box']
    x0, y0, x1, y1 = max(ex0, int(box[0])), max(ey0, int(box[1])), min(ex1, int(box[2])), min(ey1, int(box[3]))
    if x0 >= x1 or y0 >= y1:
        raise ValueError(f"box {box} does not overlap edit {edit['id']} box {edit['box']}")
    full = load_edit_bg(pdir, project, edit)
    ans = load_answer(pdir, edit, bg=full)
    bg = full[ey0:ey1, ex0:ex1]
    if p['tone']:
        ans = apply_tone(ans, edit_tone_fit(edit, ans, bg))
    dd = diffs(ans, bg, p)
    win = np.s_[y0 - ey0:y1 - ey0, x0 - ex0:x1 - ex0]
    thr = float(p['thr_soft'] if thr is None else thr)
    d = np.maximum(dd['tol'][win], dd['soft'][win])
    m = ndi.binary_opening(d > thr, iterations=1)
    lab, n = ndi.label(m)
    if not n:
        raise ValueError(f'nothing differs from the BG inside {box} at thr {thr}')
    sz = ndi.sum(m, lab, range(1, n + 1))
    big = lab == (int(np.argmax(sz)) + 1)
    m &= ndi.binary_dilation(big, iterations=max(8, int(0.15 * max(m.shape))))
    m = ndi.binary_fill_holes(ndi.binary_closing(m, iterations=p['close']) | m)
    return crop_to_mask(m, x0, y0)
