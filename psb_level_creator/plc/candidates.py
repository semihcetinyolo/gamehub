"""Candidate ops: label / drop / restore / split / merge (+ add / crop), applied in order.

apply_ops(pdir, project, ops) works on a deep copy of the project dict and the cand/<id>.png mask files and returns
the new project; it never writes project.json (plc/store.py persists the result inside the project lock).
A bad op raises ValueError (the server answers 400 with the message); nothing of the copy is kept then.

Ops (dicts with an "op" key):
  {"op": "label", "id": 12, "label": "L07_D", "group": "Letters"}   also sets state "kept"
  {"op": "drop", "id": 12}
  {"op": "restore", "id": 12}                                         back to "kept" when labelled, else "new"
  {"op": "split", "id": 12, "axis": "x"|"y", "at": 840}               cut at a canvas coordinate
  {"op": "split", "id": 12, "parts": 2}                               connected pieces, eroding until N appear
  {"op": "merge", "ids": [7, 8]}                                       same edit only
  {"op": "add", "edit": "e003", "box": [x0, y0, x1, y1], "thr": 18}   a missed (faint) object from the diff in box
  {"op": "crop", "id": 12, "box": [x0, y0, x1, y1]}                   keep only the mask inside box
  {"op": "cut_unchanged", "id": 12, "thr": 12}                         drop mask px the edit did not change
  {"op": "glyph", "id": 12, "mode": "auto"|"mask"|"file"|"reset", ...}   how the build cuts this target's glyph
glyph (the sprite that flies to the slot, plc/glyph.py), stored as candidate["glyph"] and used by build:
  mode "auto" (default): the automatic cut, optionally with "params" (plc.glyph.GLYPH overrides), "box" (keep only
    inside [x0, y0, x1, y1], canvas px) and "fill_from_mask": n (add the candidate mask eroded by n px: whole strokes
    where wood meets wood);
  mode "mask": the candidate mask itself (optionally "box", "erode": n px);
  mode "file": "file" = a PNG (path absolute or relative to the project; alpha, or grey > 127 when it has none) placed
    with its top-left at "at" = [x, y] canvas px (default: the candidate box's top-left); copied to cand/<id>_glyph.png;
  mode "sam": "attempt" = a done SAM ask (python3 -m plc.sam <project> <id> [--prompt ..]; plc/sam.py): SAM's
    outline, kept to new pixels by the diff, counters open, no broad shadow (glyph.with_sam);
  mode "reset": back to the automatic cut.
label takes an optional "desc": a short English name of the letter object (the default SAM prompt).
  {"op": "mask", "id": 12, "file": "<png>", "at": [x, y], "glyph": true}   set the candidate (scene) mask from a PNG
  {"op": "layer", "id": 12, "keep_holes": true, "reach": 4}           scene patch: keep the mask's holes as BG; how
                                                                       far changed pieces join (default 16, null)
mask: alpha (or grey > 127) of a hand-made selection of the approved answer pixels, top-left at "at" (canvas px,
default the candidate box's top-left); box / area / flags are recomputed; "glyph": true also makes it the glyph
(mode "file"). Nothing is regenerated.
cut_unchanged: mask pixels where the edit's answer equals the edit's OWN BG (the BG version it was made on; a +-3 px
tolerant diff below thr) leave the mask (old paper border, untouched scene inside a generous mask); the largest piece
and the pieces of at least CUT_KEEP of its size stay, nicks up to ~10 px are closed and every hole inside the
kept outline is filled (the object's body stays whole where its paint equals the old BG); box / area / flags are
recomputed. Rule: the entire glyph must be new pixels from the edit.
Split / merge: the originals become "dropped" with "replaced_by"; the new candidates carry "parent" / "parents".
"""
from __future__ import annotations

import copy
from pathlib import Path

import numpy as np
from scipy import ndimage as ndi

from . import detect as D

DEFAULT_GROUP = 'Letters'
MIN_PART = 20  # px; split pieces smaller than this are crumbs and are left out
CUT_THR = 12    # cut_unchanged: +-3 px tolerant diff below this = unchanged
CUT_KEEP = 0.05  # cut_unchanged: pieces smaller than this share of the largest piece are dropped


def _find(project: dict, cid) -> dict:
    try:
        cid = int(cid)
    except (TypeError, ValueError):
        raise ValueError(f'bad candidate id {cid!r}')
    for c in project['candidates']:
        if int(c['id']) == cid:
            return c
    raise ValueError(f'candidate {cid} not found')


def _new(project: dict, pdir: Path, base: dict, mask: np.ndarray, ox: int, oy: int, **extra) -> dict:
    k, box = D.crop_to_mask(mask, ox, oy)
    if k is None:
        raise ValueError('the new candidate would be empty')
    edit = D.edit_by_id(project, base['edit'])
    nid = D.next_id(project)
    D.save_mask(pdir, nid, k)
    c = dict(id=nid, edit=base['edit'], box=box, area=int(k.sum()),
             flags=D.flags_for(k, box, edit, project['canvas'], D.PARAMS),
             state='new', label=None, group=None, contrast=base.get('contrast'))
    c.update(extra)
    project['candidates'].append(c)
    return c


def _split_parts(k: np.ndarray, n: int) -> np.ndarray:
    """Label image with n parts: plain components first, else erode until n big pieces appear, then every pixel goes
    to its nearest piece (Waldo detect._split)."""
    for it in range(0, max(4, max(k.shape) // 4) + 1, 1 if max(k.shape) < 80 else 2):
        er = ndi.binary_erosion(k, iterations=it) if it else k
        lab, m = ndi.label(er)
        if not m:
            break
        if m < n:
            continue
        sz = ndi.sum(er, lab, range(1, m + 1))
        top = np.argsort(sz)[::-1][:n] + 1
        if sz[top[-1] - 1] < max(MIN_PART / 2, 0.04 * sz.sum()):
            continue
        seeds = np.zeros_like(lab)
        for t, j in enumerate(top, 1):
            seeds[lab == j] = t
        _, (iy, ix) = ndi.distance_transform_edt(seeds == 0, return_indices=True)
        return np.where(k, seeds[iy, ix], 0)
    raise ValueError(f'could not split into {n} parts (try axis/at)')


def _op_split(project, pdir, op):
    c = _find(project, op.get('id'))
    k = D.load_mask(pdir, c)
    x0, y0 = c['box'][:2]
    parts = []
    if 'parts' in op:
        n = int(op['parts'])
        if n < 2:
            raise ValueError('split parts must be >= 2')
        lab = _split_parts(k, n)
        parts = [lab == t for t in range(1, n + 1)]
    else:
        axis, at = op.get('axis'), op.get('at')
        if axis not in ('x', 'y') or at is None:
            raise ValueError('split needs "parts" or "axis" ("x"|"y") and "at" (canvas px)')
        cut = int(round(float(at))) - (x0 if axis == 'x' else y0)
        size = k.shape[1] if axis == 'x' else k.shape[0]
        if not 0 < cut < size:
            raise ValueError(f"split at {at} lies outside candidate {c['id']} box {c['box']}")
        a, b = np.zeros_like(k), np.zeros_like(k)
        if axis == 'x':
            a[:, :cut], b[:, cut:] = k[:, :cut], k[:, cut:]
        else:
            a[:cut], b[cut:] = k[:cut], k[cut:]
        parts = [a, b]
    keep = []
    for part in parts:
        lab, m = ndi.label(part)
        if m:
            sz = ndi.sum(part, lab, range(1, m + 1))
            part = np.isin(lab, [j + 1 for j in range(m) if sz[j] >= MIN_PART])
        if part.sum() >= MIN_PART:
            keep.append(part)
    if len(keep) < 2:
        raise ValueError(f"split of candidate {c['id']} leaves fewer than 2 parts")
    new = [_new(project, pdir, c, p, x0, y0, parent=c['id']) for p in keep]
    c['state'] = 'dropped'
    c['replaced_by'] = [n['id'] for n in new]


def _op_merge(project, pdir, op):
    ids = op.get('ids') or []
    if len(ids) < 2:
        raise ValueError('merge needs "ids" with 2 or more candidates')
    cs = [_find(project, i) for i in ids]
    if len({c['edit'] for c in cs}) > 1:
        raise ValueError('merge: candidates come from different edits (a layer takes the pixels of one edit)')
    win = [min(c['box'][0] for c in cs), min(c['box'][1] for c in cs),
           max(c['box'][2] for c in cs), max(c['box'][3] for c in cs)]
    U = np.zeros((win[3] - win[1], win[2] - win[0]), bool)
    for c in cs:
        U |= D.place(D.load_mask(pdir, c), c['box'], win)
    base = cs[0]
    n = _new(project, pdir, base, U, win[0], win[1], parents=[c['id'] for c in cs])
    if base.get('label'):
        n.update(label=base['label'], group=base.get('group'), state='kept')
    for c in cs:
        c['state'] = 'dropped'
        c['replaced_by'] = [n['id']]


def _op_add(project, pdir, op):
    edit = D.edit_by_id(project, op.get('edit'))
    if edit.get('status') != 'done':
        raise ValueError(f"edit {edit['id']} is {edit.get('status')}, not done")
    box = op.get('box')
    if not box or len(box) != 4:
        raise ValueError('add needs "box": [x0, y0, x1, y1]')
    k, cbox = D.detect_in_box(pdir, project, edit, box, op.get('thr'))
    base = dict(edit=edit['id'])
    c = _new(project, pdir, base, k, cbox[0], cbox[1], added=True)
    c['contrast'] = None


def _op_crop(project, pdir, op):
    c = _find(project, op.get('id'))
    box = op.get('box')
    if not box or len(box) != 4:
        raise ValueError('crop needs "box": [x0, y0, x1, y1]')
    k = D.load_mask(pdir, c)
    keep = D.place(np.ones((int(box[3]) - int(box[1]), int(box[2]) - int(box[0])), bool),
                   [int(box[0]), int(box[1])], c['box']) & k
    nk, nbox = D.crop_to_mask(keep, c['box'][0], c['box'][1])
    if nk is None:
        raise ValueError(f"crop leaves candidate {c['id']} empty")
    D.save_mask(pdir, c['id'], nk)
    edit = D.edit_by_id(project, c['edit'])
    c.update(box=nbox, area=int(nk.sum()), flags=D.flags_for(nk, nbox, edit, project['canvas'], D.PARAMS))


def _op_cut_unchanged(project, pdir, op):
    c = _find(project, op.get('id'))
    thr = op.get('thr', CUT_THR)
    try:
        thr = float(thr)
    except (TypeError, ValueError):
        raise ValueError(f'bad "thr" {thr!r}')
    if not 0 < thr < 255:
        raise ValueError(f'"thr" must be in (0, 255), got {thr}')
    edit = D.edit_by_id(project, c['edit'])
    ex0, ey0, ex1, ey1 = edit['box']
    own = D.load_edit_bg(pdir, project, edit)
    ans = D.load_answer(pdir, edit, bg=own)
    bg = own[ey0:ey1, ex0:ex1]
    if D.PARAMS['tone']:
        ans = D.apply_tone(ans, D.edit_tone_fit(edit, ans, bg))
    x0, y0, x1, y1 = c['box']
    wx0, wy0, wx1, wy1 = max(ex0, x0 - 4), max(ey0, y0 - 4), min(ex1, x1 + 4), min(ey1, y1 + 4)
    win = np.s_[wy0 - ey0:wy1 - ey0, wx0 - ex0:wx1 - ex0]
    d = D.tolerant_diff(ans[win], bg[win], 3, 1.0)
    k = D.place(D.load_mask(pdir, c), c['box'], [wx0, wy0, wx1, wy1])
    keep = k & (d >= thr)
    lab, n = ndi.label(keep)
    if not n:
        raise ValueError(f"candidate {c['id']}: no pixel of its mask differs from the edit's BG by {thr:g} or more")
    sz = ndi.sum(keep, lab, range(1, n + 1))
    keep = np.isin(lab, [j + 1 for j in range(n) if sz[j] >= max(MIN_PART, CUT_KEEP * sz.max())])
    # pinholes and 1-3 px nicks inside the object (flat paint the BG happens to explain) stay; bigger unchanged
    # areas (the paper, the scene seen through a C) leave
    # the object's own body is whole even where its paint equals the old BG (a light C on white paper): nicks up to
    # ~10 px are closed and every hole inside the kept outline is filled - also where an earlier cut left holes in the
    # mask (running the op again repairs it); the scene seen through a C's opening is no hole and stays out
    keep = ndi.binary_closing(np.pad(keep, 6), iterations=5)[6:-6, 6:-6] | keep
    keep = ndi.binary_fill_holes(keep)
    # then peel what is still unchanged at the outline (a 1-3 px rim of old paper the blurred diff let through):
    # unchanged pixels connected to the outside through unchanged pixels leave; enclosed ones (the body) stay
    raw = D.tolerant_diff(ans[win], bg[win], 1, 0) < thr
    lab, _ = ndi.label((raw & keep) | ~keep)
    outside = np.unique(lab[~keep])
    keep &= ~(np.isin(lab, outside[outside > 0]) & raw)
    keep = ndi.binary_opening(keep) | (keep & ~ndi.binary_dilation(~keep, iterations=2))
    nk, nbox = D.crop_to_mask(keep, wx0, wy0)
    if nk is None:
        raise ValueError(f"cut_unchanged leaves candidate {c['id']} empty")
    removed = int((k & ~keep).sum())
    D.save_mask(pdir, c['id'], nk)
    c.update(box=nbox, area=int(nk.sum()), flags=D.flags_for(nk, nbox, edit, project['canvas'], D.PARAMS),
             cut_unchanged=dict(thr=thr, removed=removed))
    if c.get('contrast') is not None:
        c['flags'] = D.flags_for(nk, nbox, edit, project['canvas'], D.PARAMS, contrast=c['contrast'])


def _read_mask_file(project, pdir, c, op):
    from PIL import Image
    f = Path(str(op.get('file') or ''))
    f = f if f.is_absolute() else Path(pdir) / f
    if not op.get('file') or not f.is_file():
        raise ValueError(f'mask file {op.get("file")!r} not found')
    im = Image.open(f)
    a = np.asarray(im.getchannel('A') if 'A' in im.getbands() else im.convert('L')) > 127
    if not a.any():
        raise ValueError('mask file is empty')
    at = op.get('at') or c['box'][:2]
    if not isinstance(at, (list, tuple)) or len(at) != 2:
        raise ValueError('"at" must be [x, y]')
    k, box = D.crop_to_mask(a, int(at[0]), int(at[1]))
    W, H = project['canvas']['w'], project['canvas']['h']
    if box[0] < 0 or box[1] < 0 or box[2] > W or box[3] > H:
        raise ValueError(f'mask file at {list(at)} reaches outside the canvas')
    return k, box, f


def _op_mask(project, pdir, op):
    from PIL import Image
    c = _find(project, op.get('id'))
    k, box, f = _read_mask_file(project, pdir, c, op)
    edit = D.edit_by_id(project, c['edit'])
    e = edit['box']
    if box[0] < e[0] or box[1] < e[1] or box[2] > e[2] or box[3] > e[3]:
        raise ValueError(f"mask {box} reaches outside edit {edit['id']}'s box {e}")
    D.save_mask(pdir, c['id'], k)
    c.update(box=box, area=int(k.sum()), mask_from=dict(file=f.name, at=[int(v) for v in (op.get('at') or box[:2])]),
             flags=D.flags_for(k, box, edit, project['canvas'], D.PARAMS, contrast=c.get('contrast')))
    c.pop('cut_unchanged', None)
    if op.get('keep_holes') is not None:
        c['keep_holes'] = bool(op['keep_holes'])
    if op.get('glyph'):
        (Path(pdir) / 'cand').mkdir(parents=True, exist_ok=True)
        Image.fromarray((k * 255).astype(np.uint8)).save(glyph_file(pdir, c['id']))
        c['glyph'] = dict(mode='file', file_box=box)


def glyph_file(pdir: Path, cid) -> Path:
    return Path(pdir) / 'cand' / f'{int(cid)}_glyph.png'


def _op_glyph(project, pdir, op):
    from PIL import Image
    from . import glyph as G
    c = _find(project, op.get('id'))
    mode = op.get('mode', 'auto')
    if mode not in ('auto', 'mask', 'file', 'sam', 'reset'):
        raise ValueError(f'glyph "mode" must be auto, mask, file, sam or reset, not {mode!r}')
    if mode == 'reset':
        c.pop('glyph', None)
        return
    spec = dict(mode=mode)
    box = op.get('box')
    if box is not None:
        if not isinstance(box, (list, tuple)) or len(box) != 4 or not box[0] < box[2] or not box[1] < box[3]:
            raise ValueError('glyph "box" must be [x0, y0, x1, y1]')
        spec['box'] = [int(v) for v in box]
    if mode == 'auto':
        params = op.get('params') or {}
        unknown = set(params) - set(G.GLYPH)
        if unknown:
            raise ValueError(f'unknown glyph params: {sorted(unknown)}')
        if params:
            spec['params'] = dict(params)
        if op.get('fill_from_mask') is not None:
            spec['fill_from_mask'] = max(0, int(op['fill_from_mask']))
    elif mode == 'mask':
        spec['erode'] = max(0, int(op.get('erode', 0)))
    elif mode == 'sam':
        from . import sam as S
        try:
            attempt = int(op.get('attempt'))
            S.mask_of(pdir, c['id'], attempt)
        except (TypeError, OSError) as e:
            raise ValueError(f'glyph mode sam needs "attempt" = a done SAM ask of candidate {c["id"]} ({e})')
        spec['attempt'] = attempt
        if op.get('params'):
            unknown = set(op['params']) - set(G.GLYPH)
            if unknown:
                raise ValueError(f'unknown glyph params: {sorted(unknown)}')
            spec['params'] = dict(op['params'])
    else:
        try:
            k, gbox, _ = _read_mask_file(project, pdir, c, op)
        except ValueError as e:
            raise ValueError(str(e).replace('mask file', 'glyph file'))
        (Path(pdir) / 'cand').mkdir(parents=True, exist_ok=True)
        Image.fromarray((k * 255).astype(np.uint8)).save(glyph_file(pdir, c['id']))
        spec['file_box'] = gbox
    c['glyph'] = spec


def apply_ops(pdir, project: dict, ops: list) -> dict:
    pdir = Path(pdir)
    project = copy.deepcopy(project)
    project.setdefault('candidates', [])
    if not isinstance(ops, list):
        raise ValueError('ops must be a list')
    for n, op in enumerate(ops):
        if not isinstance(op, dict) or 'op' not in op:
            raise ValueError(f'op #{n}: needs an "op" key')
        kind = op['op']
        try:
            if kind == 'label':
                c = _find(project, op.get('id'))
                label = op.get('label')
                if not label or not isinstance(label, str):
                    raise ValueError('label needs a non-empty "label"')
                c.update(label=label, group=op.get('group') or c.get('group') or DEFAULT_GROUP, state='kept')
                if op.get('desc') is not None:  # short English name of the letter object (SAM prompt for its glyph)
                    desc = str(op['desc']).strip()
                    if len(desc) > 300:
                        raise ValueError('"desc" is at most 300 characters')
                    if desc:
                        c['desc'] = desc
                    else:
                        c.pop('desc', None)
            elif kind == 'drop':
                _find(project, op.get('id'))['state'] = 'dropped'
            elif kind == 'restore':
                c = _find(project, op.get('id'))
                c['state'] = 'kept' if c.get('label') else 'new'
            elif kind == 'split':
                _op_split(project, pdir, op)
            elif kind == 'merge':
                _op_merge(project, pdir, op)
            elif kind == 'add':
                _op_add(project, pdir, op)
            elif kind == 'crop':
                _op_crop(project, pdir, op)
            elif kind == 'cut_unchanged':
                _op_cut_unchanged(project, pdir, op)
            elif kind == 'glyph':
                _op_glyph(project, pdir, op)
            elif kind == 'mask':
                _op_mask(project, pdir, op)
            elif kind == 'layer':
                c = _find(project, op.get('id'))
                if 'keep_holes' not in op and 'reach' not in op:
                    raise ValueError('layer needs "keep_holes": true|false and/or "reach": px (null = default)')
                if 'keep_holes' in op:
                    c['keep_holes'] = bool(op['keep_holes'])
                if 'reach' in op:  # how far changed pieces touching the mask (shadow, rim) join the scene patch
                    if op['reach'] is None:
                        c.pop('reach', None)
                    else:
                        r = int(op['reach'])
                        if not 0 <= r <= 64:
                            raise ValueError('"reach" must be 0..64 px')
                        c['reach'] = r
            else:
                raise ValueError(f'unknown op {kind!r} (label, drop, restore, split, merge, add, crop, cut_unchanged, '
                                 f'glyph, mask, layer)')
        except ValueError as e:
            raise ValueError(f'op #{n} ({kind}): {e}') from None
    return project
