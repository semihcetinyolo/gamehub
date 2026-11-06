"""Build the level: kept candidates -> target layers -> PSB + level.json + preview + report.

Each target layer = its edit's (registered, tone-matched) answer inside the candidate mask plus the changed pieces
touching it (a shadow, a rim), grown a few px with a soft edge. Outside the mask only what changed is pasted: a pixel
the BG explains within +-3 px shows the BG's own pixel (HiddenLevelRecreate rs_astra.py cut, docs/learned-hiddenlevel.md),
so the layer composes seamlessly on the clean BG. Where two targets come close, every pixel belongs to the
nearest one (soft split against other edits, hard split inside one edit, as in Waldo build.py).

PSB (psd_tools, version 2 header): BG at the bottom, one group per candidate group, layers named by label.
In the layers panel the groups and layers read top-down in label order (first label on top).

Two products per target:
  - the scene patch <label>.png (above): removes the letter from the scene seamlessly; it carries the letter's rim,
    shadow and the scene it re-rendered around it. In the game it fades out in place.
  - the glyph <label>_glyph.png (plc/glyph.py): only the letter object on real alpha, a 1-2 px anti-aliased edge, no
    shadow, no scene. It flies to the phrase slot and is the hit-test mask (alpha > 0.5, plus finger tolerance).
    The PSB carries it too, as a hidden layer "<label>_glyph" right above "<label>" in the same group.

BG versions (background/extend): every edit is diffed and tone-fitted against the BG it was made on
(detect.load_edit_bg); the scene patch is blended onto the CURRENT bg.png, so where nothing changed it shows the
current BG (the extended full-bleed one, not the old paper border) and an old edit's layer stays pixel-identical.

Products under pdir/out/ (paths returned relative to pdir):
  <id>.psb, <id>_preview.jpg, <id>_level.json, <id>_report.json, <id>/<label>.png and <id>/<label>_glyph.png
build() never writes project.json; the store appends {"id", "psb", "preview", "level_json", "report"}.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from psd_tools import PSDImage
from psd_tools.api.layers import Group, PixelLayer
from scipy import ndimage as ndi

from . import detect as D
from . import glyph as G

LAYER = dict(
    grow=3,         # px the mask grows at full opacity
    fade=6,         # px of soft edge beyond that
    edge_fade=16,   # px fade towards an edit box edge that is not the canvas edge
    split_soft=1.5,  # sigma of the soft split against a target of another edit
    tone=True,      # tone-match the answer to the BG (same fit as detect)
    reach=16,       # px: changed pieces (a shadow, a plaque's edge) touching the mask this close join the layer
    changed=30,     # blurred +-3 px diff above this counts as changed for that
    keep_lo=12,     # outside the mask: answer pixels weigh 0 below this blurred +-3 px diff (BG shows), 1 at
    keep_hi=30,     #   keep_hi ("paste only what changed", HiddenLevelRecreate rs_astra.py cut)
    hole_small=40,  # keep_holes: pinholes up to this many px are still filled
    psb_glyphs=True,  # the glyphs also go into the PSB as hidden layers "<label>_glyph"
)
GLYPH_SUFFIX = '_glyph'
GLYPH_COVER_MIN = 0.25  # glyph px / candidate mask px below this -> "check glyph" warning
OVERLAP_PX = 6      # kept masks sharing more pixels than this are an error
TINY_SIDE = 36      # core bbox longest side below this -> "tiny" warning
TINY_AREA = 250


def _natural(s: str):
    return [int(t) if t.isdigit() else t for t in re.split(r'(\d+)', s or '')]


def _safe(name: str) -> str:
    return re.sub(r'[^A-Za-z0-9_.-]+', '_', name) or 'layer'


class Ctx:
    """Caches the BG, every edit's (tone-matched) answer, and the owner map of the kept targets."""

    def __init__(self, pdir, project, opts=None):
        self.pdir = Path(pdir)
        self.project = project
        self.o = {**LAYER, **(opts or {})}
        self.bg = D.load_bg(self.pdir)   # the CURRENT BG: what every layer is blended onto
        self.H, self.W = self.bg.shape[:2]
        self.edits = {e['id']: e for e in project.get('edits', [])}
        self._ans = {}
        self._own = {}  # BG file -> array: the BG each edit was made on (diffs and tone fits use it)
        self.owner = None   # canvas int32: index+1 of the nearest kept core
        self.cores = None   # canvas int32: index+1 where a kept core lies
        self.index = {}     # candidate id -> index+1 in the owner map

    def own_bg(self, eid):
        """The full BG the edit was generated from (bg.png unless a background/extend came after it)."""
        f = D.edit_bg_file(self.pdir, self.project, self.edits[eid])
        if f not in self._own:
            self._own[f] = D.load_edit_bg(self.pdir, self.project, self.edits[eid], current=self.bg)
        return self._own[f]

    def answer(self, eid):
        if eid not in self._ans:
            e = self.edits[eid]
            own = self.own_bg(eid)
            ans = D.load_answer(self.pdir, e, bg=own)
            x0, y0, x1, y1 = e['box']
            if self.o['tone']:
                ans = D.apply_tone(ans, D.edit_tone_fit(e, ans, own[y0:y1, x0:x1]))
            self._ans[eid] = ans
        return self._ans[eid]

    def set_owners(self, cands):
        """Owner map over the canvas for these candidates; returns the overlapping pairs [(a, b, px)]."""
        cores = np.zeros((self.H, self.W), np.int32)
        overlaps = []
        self.index = {}
        for n, c in enumerate(cands, 1):
            k = D.load_mask(self.pdir, c)
            x0, y0, x1, y1 = c['box']
            wx0, wy0, wx1, wy1 = max(0, x0), max(0, y0), min(self.W, x1), min(self.H, y1)
            sub = cores[wy0:wy1, wx0:wx1]
            core = D.place(k, c['box'], [wx0, wy0, wx1, wy1])
            hit = sub[core]  # shared pixels (touching is fine: the owner map splits touching layers)
            for j in np.unique(hit[hit > 0]):
                px = int((hit == j).sum())
                if px > OVERLAP_PX:
                    overlaps.append((cands[j - 1], c, px))
            sub[core & (sub == 0)] = n
            self.index[c['id']] = n
        self.cores = cores
        if cores.any():
            _, (iy, ix) = ndi.distance_transform_edt(cores == 0, return_indices=True)
            self.owner = cores[iy, ix]
        else:
            self.owner = cores
        self.cands = cands
        return overlaps


def target_layer(ctx: Ctx, c: dict):
    """(RGBA uint8 array, left, top) of one candidate's layer."""
    o = ctx.o
    e = ctx.edits[c['edit']]
    ex0, ey0, ex1, ey1 = e['box']
    ans = ctx.answer(c['edit'])
    k = D.load_mask(ctx.pdir, c)
    reach = int(c['reach']) if c.get('reach') is not None else o['reach']  # per-candidate override (layer op)
    r = o['grow'] + o['fade'] + reach + 2
    x0, y0, x1, y1 = c['box']
    wx0, wy0, wx1, wy1 = max(ex0, x0 - r), max(ey0, y0 - r), min(ex1, x1 + r), min(ey1, y1 + r)
    M = D.place(k, c['box'], [wx0, wy0, wx1, wy1])
    A = ans[wy0 - ey0:wy1 - ey0, wx0 - ex0:wx1 - ex0].astype(np.float32)
    B = ctx.own_bg(c['edit'])[wy0:wy1, wx0:wx1].astype(np.float32)  # the BG the edit saw: what changed is vs this
    Bn = ctx.bg[wy0:wy1, wx0:wx1].astype(np.float32)  # the current BG: what the layer is blended onto
    # what the edit really changed here: a pixel the BG explains within +-3 px is BG (the redraw is a px or two off)
    d3 = D.tolerant_diff(A, B, 3, 0)
    # area: the mask, plus the changed pieces touching it (its shadow, the plaque's rim), holes filled
    ch = cv2.GaussianBlur(d3, (0, 0), 1.5) > o['changed']
    near = ndi.binary_dilation(M, iterations=reach) if reach else M
    lab, n = ndi.label(ch & near)
    core = ndi.binary_dilation(M, iterations=2)
    area = core | (np.isin(lab, np.unique(lab[core & (lab > 0)])) if n else core)
    if c.get('keep_holes'):
        # the mask's own holes stay the BG (a hoop with a re-rendered picture inside: only the ring is the object)
        inner = ndi.binary_erosion(ndi.binary_fill_holes(M) & ~M, iterations=2)
        area = D.fill_small_holes(area, o['hole_small']) & ~inner
    else:
        area = ndi.binary_fill_holes(area)
    d = ndi.distance_transform_edt(~area)
    t = np.clip(1 - (d - o['grow']) / max(1e-6, o['fade']), 0, 1)
    al = t * t * (3 - 2 * t)  # smoothstep
    # paste only what changed: outside the mask the answer's pixels weigh by how much they differ from the BG, so the
    # soft rim shows the BG's own pixels where the model only re-rendered it (no doubled lines, no texture seam)
    wgt = np.clip((cv2.GaussianBlur(d3, (0, 0), 3) - o['keep_lo']) / max(1, o['keep_hi'] - o['keep_lo']), 0, 1)
    wgt = np.maximum(wgt, ndi.binary_dilation(ndi.binary_opening(d3 > 60, iterations=2), iterations=2))
    # the mask and its 2 px ring are the answer's own pixels; where the BG changed since the edit (an extend replaced
    # old paper) the ring keeps the diff weight, so no rim of old paper comes back around the letter
    moved = np.abs(B - Bn).max(2) > 0
    wgt[core & ~moved] = 1.0
    if c.get('keep_holes'):
        wgt[ndi.binary_erosion(ndi.binary_fill_holes(M) & ~M, iterations=2)] = 0.0  # inside a kept hole: the BG
    wgt[M] = 1.0
    rgb_full = Bn + (A - Bn) * wgt[..., None]
    if ctx.owner is not None and c['id'] in ctx.index:
        me = ctx.index[c['id']]
        own = ctx.owner[wy0:wy1, wx0:wx1]
        others = set(np.unique(own)) - {0, me}
        if others:
            # soft against other edits: 1 up to the border of my territory, fading over ~2 sigma into theirs, so
            # both layers are opaque at the border (no BG shining through); hard inside one edit (same pixels)
            same = np.isin(own, [j for j in others if ctx.cands[j - 1]['edit'] == c['edit']])
            soft = np.clip(cv2.GaussianBlur((own == me).astype(np.float32), (0, 0), o['split_soft']) * 2, 0, 1)
            soft[same] = 0
            cores = ctx.cores[wy0:wy1, wx0:wx1]
            soft[(cores > 0) & (cores != me)] = 0  # never cover another target's own pixels
            al = np.minimum(al, soft)
    # the answer ends at the box: fade out before an inner box edge
    hh, ww = M.shape
    yy, xx = np.mgrid[:hh, :ww]
    dist = np.full(M.shape, 1e9, np.float32)
    if ex0 > 0: dist = np.minimum(dist, xx + (wx0 - ex0))
    if ey0 > 0: dist = np.minimum(dist, yy + (wy0 - ey0))
    if ex1 < ctx.W: dist = np.minimum(dist, (ex1 - wx0) - 1 - xx)
    if ey1 < ctx.H: dist = np.minimum(dist, (ey1 - wy0) - 1 - yy)
    al = np.where(M, al, al * np.clip(dist / max(1, o['edge_fade']), 0, 1))
    al[M] = 1.0
    ys, xs = np.nonzero(al > 0.004)
    t0, b0, l0, r0 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgb = np.clip(rgb_full[t0:b0, l0:r0], 0, 255).round().astype(np.uint8)
    a8 = (al[t0:b0, l0:r0] * 255).round().astype(np.uint8)
    return np.dstack([rgb, a8]), int(wx0 + l0), int(wy0 + t0)


def target_glyph(ctx: Ctx, c: dict):
    """(RGBA uint8 array, left, top, info) of one candidate's glyph (plc/glyph.py), or None when nothing is left.
    RGB = the (registered, tone-matched) answer; never covers another target's own pixels."""
    e = ctx.edits[c['edit']]
    ex0, ey0, ex1, ey1 = e['box']
    pad = G.GLYPH['pad']
    x0, y0, x1, y1 = c['box']
    wx0, wy0, wx1, wy1 = max(ex0, x0 - pad), max(ey0, y0 - pad), min(ex1, x1 + pad), min(ey1, y1 + pad)
    M = D.place(D.load_mask(ctx.pdir, c), c['box'], [wx0, wy0, wx1, wy1])
    A = ctx.answer(c['edit'])[wy0 - ey0:wy1 - ey0, wx0 - ex0:wx1 - ex0]
    B = ctx.own_bg(c['edit'])[wy0:wy1, wx0:wx1]
    spec = c.get('glyph') or {}
    mode = spec.get('mode', 'auto')
    if mode == 'file':
        from .candidates import glyph_file
        k = np.asarray(Image.open(glyph_file(ctx.pdir, c['id'])).convert('L')) > 127
        fb = spec['file_box']
        wx0, wy0 = min(wx0, fb[0]), min(wy0, fb[1])
        wx1, wy1 = max(wx1, fb[2]), max(wy1, fb[3])
        wx0, wy0, wx1, wy1 = max(ex0, wx0), max(ey0, wy0), min(ex1, wx1), min(ey1, wy1)
        A = ctx.answer(c['edit'])[wy0 - ey0:wy1 - ey0, wx0 - ex0:wx1 - ex0]
        M = D.place(D.load_mask(ctx.pdir, c), c['box'], [wx0, wy0, wx1, wy1])
        g = D.place(k, fb, [wx0, wy0, wx1, wy1])
        info = dict(mode='file')
    elif mode == 'mask':
        g = ndi.binary_erosion(M, iterations=spec['erode']) if spec.get('erode') else M.copy()
        info = dict(mode='mask')
    elif mode == 'sam':
        from . import sam as SAM
        sm, sbox = SAM.mask_of(ctx.pdir, c['id'], spec['attempt'])
        S = D.place(sm, sbox, [wx0, wy0, wx1, wy1])
        g, info = G.with_sam(A, B, M, S, {**(ctx.o.get('glyph') or {}), **(spec.get('params') or {})})
    else:
        g, info = G.glyph_mask(A, B, M, {**(ctx.o.get('glyph') or {}), **(spec.get('params') or {})})
        if spec.get('fill_from_mask') is not None:
            n = spec['fill_from_mask']
            g |= ndi.binary_erosion(M, iterations=n) if n else M
            info['mode'] = 'colour+mask'
    if spec.get('box'):
        bx0, by0, bx1, by1 = spec['box']
        g &= D.place(np.ones((by1 - by0, bx1 - bx0), bool), [bx0, by0], [wx0, wy0, wx1, wy1])
    if spec:
        info.update(pieces=int(ndi.label(g)[1]), area=int(g.sum()),
                    cover=round(float((g & M).sum()) / max(1, int(M.sum())), 3))
        info['manual'] = {k: v for k, v in spec.items() if k != 'file_box'}
    theirs = None
    if ctx.cores is not None and c['id'] in ctx.index:
        cores = ctx.cores[wy0:wy1, wx0:wx1]
        theirs = (cores > 0) & (cores != ctx.index[c['id']])
        g &= ~theirs
    a = G.glyph_alpha(g)
    if theirs is not None:
        a[theirs] = 0  # the anti-aliased rim does not reach into a touching target either
    ys, xs = np.nonzero(a > 0.004)
    if not len(ys):
        return None
    t0, b0, l0, r0 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgb = G.decontaminate(np.ascontiguousarray(A), g)
    rgba = np.dstack([rgb[t0:b0, l0:r0], (a[t0:b0, l0:r0] * 255).round().astype(np.uint8)])
    return rgba, int(wx0 + l0), int(wy0 + t0), info


def _paste(canvas: Image.Image, rgba: np.ndarray, left: int, top: int):
    im = Image.fromarray(rgba, 'RGBA')
    canvas.alpha_composite(im, (left, top))


def _reused_layers(pdir: Path, bid: str, kept) -> dict:
    """Scene patches of an earlier build, per candidate id: {id: (rgba, left, top)}. A target is reused only when that
    build holds the same candidate under the same label; everything else is cut again."""
    lv = json.loads((pdir / 'out' / f'{bid}_level.json').read_text())
    by = {(t['candidate'], t['label']): t for t in lv['targets']}
    out = {}
    for c in kept:
        t = by.get((c['id'], c['label']))
        if t:
            out[c['id']] = (np.asarray(Image.open(pdir / 'out' / t['file']).convert('RGBA')), t['bbox'][0], t['bbox'][1])
    return out


def build(pdir, project: dict, expected_labels=None, opts=None, allow_small=None, reuse_from=None) -> dict:
    """reuse_from: an earlier build id whose scene patches are taken as they are (a glyph-only rebuild: the letters'
    pixels stay exactly those of that build; only glyphs are added). allow_small: labels that may stay below the minimum letter size (detect.min_letter_px: 50 px on the glyph
    bbox long side, the core box when there is no glyph); any other kept target below it is an error."""
    pdir = Path(pdir)
    bid = f"b{len(project.get('builds', [])) + 1}"
    out = pdir / 'out'
    (out / bid).mkdir(parents=True, exist_ok=True)
    ctx = Ctx(pdir, project, opts)
    W, H = ctx.W, ctx.H
    cands = project.get('candidates', [])
    kept = [c for c in cands if c.get('state') == 'kept']
    errors, warnings = [], []
    unlabeled = [c['id'] for c in kept if not c.get('label')]
    if unlabeled:
        errors.append(f'kept without a label: {unlabeled}')
    kept = [c for c in kept if c.get('label')]
    bad_edit = [c['id'] for c in kept if c['edit'] not in ctx.edits]
    if bad_edit:
        errors.append(f'kept candidates of unknown edits: {bad_edit}')
        kept = [c for c in kept if c['edit'] in ctx.edits]
    kept.sort(key=lambda c: (_natural(c['label']), c['id']))
    if not kept:
        errors.append('no kept candidates')

    by_label = {}
    for c in kept:
        by_label.setdefault(c['label'], []).append(c['id'])
    duplicates = {l: ids for l, ids in by_label.items() if len(ids) > 1}
    if duplicates:
        errors.append(f'duplicate labels: {duplicates}')

    overlaps = ctx.set_owners(kept)
    ov = [dict(a=a['id'], b=b['id'], labels=[a['label'], b['label']], px=px) for a, b, px in overlaps]
    for x in ov:
        errors.append(f"overlap: {x['a']} ({x['labels'][0]}) and {x['b']} ({x['labels'][1]}), {x['px']} px — drop one")

    groups = []
    for c in kept:
        g = c.get('group') or 'Letters'
        if g not in groups:
            groups.append(g)

    layers, glyphs = {}, {}
    reused = _reused_layers(pdir, reuse_from, kept) if reuse_from else {}
    if reuse_from and len(reused) < len(kept):
        warnings.append(f"cut again (not in {reuse_from}): {[c['label'] for c in kept if c['id'] not in reused]}")
    for c in kept:
        rgba, left, top = reused[c['id']] if c['id'] in reused else target_layer(ctx, c)
        layers[c['id']] = (rgba, left, top)
        glyphs[c['id']] = target_glyph(ctx, c)

    # PSB: psd_tools appends bottom -> top, so the first group / label is added last (top of the panel)
    bgim = Image.fromarray(ctx.bg, 'RGB')
    psd = PSDImage.new('RGB', (W, H), color=(255, 255, 255))
    psd._record.header.version = 2  # PSB
    PixelLayer.frompil(bgim, psd, 'BG', 0, 0)
    z = {}
    zi = 1
    for g in reversed(groups):
        grp = Group.new(psd, g, open_folder=False)
        members = [c for c in kept if (c.get('group') or 'Letters') == g]
        for c in reversed(members):
            rgba, left, top = layers[c['id']]
            PixelLayer.frompil(Image.fromarray(rgba, 'RGBA'), grp, c['label'], top, left)
            z[c['id']] = zi
            zi += 1
            if ctx.o['psb_glyphs'] and glyphs[c['id']] is not None:
                grgba, gl, gt, _ = glyphs[c['id']]
                lay = PixelLayer.frompil(Image.fromarray(grgba, 'RGBA'), grp, c['label'] + GLYPH_SUFFIX, gt, gl)
                lay.visible = False
    psb = out / f'{bid}.psb'
    psd.save(str(psb))

    # preview + per-target files, in stack order (bottom first)
    comp = bgim.convert('RGBA')
    targets = []
    files = {}
    for c in sorted(kept, key=lambda c: z[c['id']]):
        rgba, left, top = layers[c['id']]
        _paste(comp, rgba, left, top)
        name = _safe(c['label'])
        n = 1
        while name in files.values():
            n += 1
            name = f"{_safe(c['label'])}_{n}"
        files[c['id']] = name
        Image.fromarray(rgba, 'RGBA').save(out / bid / f'{name}.png')
        if glyphs[c['id']] is not None:
            Image.fromarray(glyphs[c['id']][0], 'RGBA').save(out / bid / f'{name}{GLYPH_SUFFIX}.png')
    preview = out / f'{bid}_preview.jpg'
    comp.convert('RGB').save(preview, quality=90)

    for c in kept:
        rgba, left, top = layers[c['id']]
        h, w = rgba.shape[:2]
        x0, y0, x1, y1 = c['box']
        t = dict(label=c['label'], group=c.get('group') or 'Letters', candidate=c['id'], edit=c['edit'],
                 bbox=[left, top, left + w, top + h], core=[x0, y0, x1, y1],
                 x=round(left / W, 6), y=round(top / H, 6), w=round(w / W, 6), h=round(h / H, 6),
                 z=z[c['id']], file=f"{bid}/{files[c['id']]}.png", glyph=None, glyph_bbox=None)
        if glyphs[c['id']] is not None:
            grgba, gl, gt, _ = glyphs[c['id']]
            gh, gw = grgba.shape[:2]
            t.update(glyph=f"{bid}/{files[c['id']]}{GLYPH_SUFFIX}.png", glyph_bbox=[gl, gt, gl + gw, gt + gh])
        targets.append(t)
    level = dict(canvas=dict(w=W, h=H), bg='../bg.png', psb=f'{bid}.psb',
                 groups=[dict(name=g, labels=[t['label'] for t in targets if t['group'] == g]) for g in groups],
                 targets=targets)
    level_json = out / f'{bid}_level.json'
    level_json.write_text(json.dumps(level, indent=1))

    # report
    counts = {g: sum(1 for t in targets if t['group'] == g) for g in groups}
    missing, unexpected = [], []
    if expected_labels is not None:
        have = set(by_label)
        missing = [l for l in expected_labels if l not in have]
        unexpected = sorted((have - set(expected_labels)), key=_natural)
        if missing:
            errors.append(f'missing labels: {missing}')
        if unexpected:
            warnings.append(f'labels not in the expected list: {unexpected}')
    tiny = []
    for c in kept:
        x0, y0, x1, y1 = c['box']
        if max(x1 - x0, y1 - y0) < TINY_SIDE or c.get('area', TINY_AREA) < TINY_AREA:
            tiny.append(dict(id=c['id'], label=c['label'], side=max(x1 - x0, y1 - y0), area=c.get('area')))
    if tiny:
        warnings.append(f"tiny targets: {[t['label'] for t in tiny]}")
    flagged = [dict(id=c['id'], label=c['label'], flags=c.get('flags', [])) for c in kept
               if set(c.get('flags', [])) & {'clipped', 'outside', 'big', 'multi'}]
    if flagged:
        warnings.append(f"kept with flags: {[(f['label'], f['flags']) for f in flagged]}")
    glyph_info = []
    for c in kept:
        gi = glyphs[c['id']]
        info = dict(gi[3]) if gi is not None else dict(area=0, pieces=0, cover=0.0, mode='none')
        info.update(id=c['id'], label=c['label'])
        info['check'] = bool(gi is None or info['pieces'] > 1 or info['cover'] < GLYPH_COVER_MIN
                             or info['mode'] == 'diff')
        glyph_info.append(info)
    if any(gi is None for gi in glyphs.values()):
        errors.append(f"no glyph for: {[c['label'] for c in kept if glyphs[c['id']] is None]}")
    to_check = [g['label'] for g in glyph_info if g['check'] and g['area']]
    if to_check:
        warnings.append(f'check glyphs (several pieces, small, or no colour model): {to_check}')
    min_px = D.min_letter_px(project['canvas'])
    allowed = set(allow_small or [])
    sizes = []
    for c in kept:
        gi = glyphs[c['id']]
        if gi is not None:
            side, src = max(gi[0].shape[:2]), 'glyph'
        else:
            x0, y0, x1, y1 = c['box']
            side, src = max(x1 - x0, y1 - y0), 'core'
        sizes.append(dict(label=c['label'], id=c['id'], side=int(side), source=src, frac=round(side / H, 4),
                          small=bool(side < min_px), allowed=c['label'] in allowed))
    small = [(s['label'], s['side']) for s in sizes if s['small'] and not s['allowed']]
    if small:
        errors.append(f'letters below the minimum size ({min_px} px long side): {small} - make them bigger, '
                      f'or pass allow_small')
    let = [s['label'] for s in sizes if s['small'] and s['allowed']]
    if let:
        warnings.append(f'below the minimum size, allowed: {let}')
    undecided = [c['id'] for c in cands if c.get('state', 'new') == 'new']
    if undecided:
        warnings.append(f'{len(undecided)} candidates still new (neither labelled nor dropped)')

    def panel(c):  # names top-down in a group: the glyph sits right above its scene patch
        g = [c['label'] + GLYPH_SUFFIX] if ctx.o['psb_glyphs'] and glyphs[c['id']] is not None else []
        return g + [c['label']]
    check = psb_check(psb, groups, [[n for c in kept if (c.get('group') or 'Letters') == g for n in panel(c)]
                                    for g in groups], (W, H))
    if not check['ok']:
        errors.append(f"PSB read-back: {check['problem']}")
    report = dict(id=bid, ok=not errors, errors=errors, warnings=warnings, total=len(targets), counts=counts,
                  missing=missing, unexpected=unexpected, duplicates=duplicates, overlaps=ov, tiny=tiny,
                  flagged=flagged, undecided=undecided, glyphs=glyph_info, min_letter_px=min_px, sizes=sizes,
                  reused=dict(source=reuse_from, ids=sorted(reused)) if reuse_from else None,
                  psb_check=check)
    rep = out / f'{bid}_report.json'
    rep.write_text(json.dumps(report, indent=1))
    rel = lambda p: str(p.relative_to(pdir))
    return dict(id=bid, psb=rel(psb), preview=rel(preview), level_json=rel(level_json), report=rel(rep))


def psb_check(path, groups, labels, size) -> dict:
    """Read the PSB back: BG at the bottom, the groups top-down in order, each with its labels top-down."""
    try:
        psd = PSDImage.open(str(path))
        top = list(psd)
        if (psd.width, psd.height) != tuple(size):
            return dict(ok=False, problem=f'size {psd.width}x{psd.height}, want {size[0]}x{size[1]}')
        if not top or top[0].is_group() or top[0].name != 'BG':
            return dict(ok=False, problem='BG is not the bottom layer')
        got = [g.name for g in reversed(top[1:])]
        if got != list(groups):
            return dict(ok=False, problem=f'groups {got}, want {groups}')
        for g, want in zip(reversed(top[1:]), labels):
            names = [l.name for l in reversed(list(g))]
            if names != want:
                return dict(ok=False, problem=f'group {g.name}: layers {names}, want {want}')
        hidden = [l.name for g in top[1:] for l in g if l.name.endswith(GLYPH_SUFFIX) and l.visible]
        if hidden:
            return dict(ok=False, problem=f'glyph layers visible: {hidden}')
        return dict(ok=True, version=psd._record.header.version, layers=sum(len(w) for w in labels))
    except Exception as e:  # a PSB that does not read back is an error in the report, not a crash
        return dict(ok=False, problem=f'{type(e).__name__}: {e}')
