"""Full-bleed backgrounds: the border detector and background/extend.

Every level must be full-bleed (user rule, 2026-11-05). A generated watercolour often comes back as a painting on
white paper: margins / a vignette around it. border_info() finds near-white, near-neutral "paper" pixels connected
to the canvas edge; set_background stores it as background.border = {ok, fraction, sides} and POST edits refuses a
project whose BG is not full-bleed (409) unless the request says allow_border.

extend: the whole BG (scaled to fit 2048, ratio kept) goes to Nano (Clai -> Albert as the project's fallback) or
Astra with a fill prompt; the answer is resized to the canvas, registered onto the BG (plc.register), and pasted ONLY
inside the border mask (grown ~24 px, feathered ~16 px). Outside the mask the BG stays bit-identical, so edits and
candidates stay valid; a mask that would touch a kept candidate is refused with the list. The old BG is kept as
bg_v1.png (then bg_v2.png ...), bg.png becomes the new version. Ledger: bgx/<id>/request.json before the paid call,
unknown outcomes never resent (store.recover handles "extends" like generations).
"""
from __future__ import annotations

import io
import shutil
import time
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

from . import providers, store
from .providers import ProviderError
from .store import StoreError, now

PAPER_L = 226        # paper: mean channel >= this (on a lightly blurred image, so paper texture does not break it)
PAPER_C = 22         # ... and max-min channel spread <= this (a cream wall or window light is more saturated)
EDGE_BAND = 4        # px band along each canvas side used for the side coverage
SIDE_COVER = 0.4     # a side counts as bordered when this share of its band is paper
MIN_FRACTION = 0.003 # paper connected to the edges below this share of the canvas is ignored
GROW = 24
FEATHER = 16
MAX_SEND = 2048
DEFAULT_PROMPT = ('Extend the painting to fill the white paper border to all four edges, continue the scene naturally, '
                  'full bleed, keep everything inside exactly as it is, no border, no vignette, no text.')


# ---- detection -------------------------------------------------------------------------------------------------

def paper_mask(rgb: np.ndarray) -> np.ndarray:
    """Near-white, near-neutral pixels connected to the canvas edge (bool, canvas size)."""
    a = cv2.GaussianBlur(rgb.astype(np.float32), (0, 0), 1.5)
    L, C = a.mean(2), a.max(2) - a.min(2)
    paper = (L >= PAPER_L) & (C <= PAPER_C)
    p = 3   # closing on a reflected pad: a plain closing erodes the pixels on the canvas edge away
    paper = ndi.binary_closing(np.pad(paper, p, mode='reflect'), iterations=2)[p:-p, p:-p]
    lab, n = ndi.label(paper)
    if not n:
        return paper
    edge = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    return np.isin(lab, edge[edge > 0])


def border_info(rgb: np.ndarray, mask: np.ndarray | None = None) -> dict:
    """{ok, fraction, sides: {top, bottom, left, right}}: not ok when paper (connected to the edge) covers >= 0.3 % of
    the canvas and lines >= 2 sides (a frame or a vignette). A pale sky along one side does not count as a border;
    a very pale sky reaching down both side edges can (then allow_border=true)."""
    m = paper_mask(rgb) if mask is None else mask
    b = EDGE_BAND
    sides = {'top': float(m[:b].mean()), 'bottom': float(m[-b:].mean()),
             'left': float(m[:, :b].mean()), 'right': float(m[:, -b:].mean())}
    frac = float(m.mean())
    bordered = sum(v >= SIDE_COVER for v in sides.values())
    ok = frac < MIN_FRACTION or bordered < 2
    return {'ok': bool(ok), 'fraction': round(frac, 4), 'sides': {k: round(v, 3) for k, v in sides.items()}}


def border_alpha(mask: np.ndarray, grow: int = GROW, feather: int = FEATHER) -> np.ndarray:
    """1 on the mask grown by `grow` px, fading to 0 over `feather` px further in (float32, canvas size)."""
    if not mask.any():
        return np.zeros(mask.shape, np.float32)
    d = ndi.distance_transform_edt(~mask)
    t = np.clip(1 - (d - grow) / max(1, feather), 0, 1)
    return (t * t * (3 - 2 * t)).astype(np.float32)


def nearest_ratio(w: int, h: int, choices) -> str:
    r = w / h
    return min(choices, key=lambda s: abs(np.log(r / (int(s.split(':')[0]) / int(s.split(':')[1])))))


# ---- extend ----------------------------------------------------------------------------------------------------

PROTECT_GROW = 9     # = build's layer reach (grow 3 + fade 6): the whole soft ring of a kept layer stays as it is
PROTECT_FADE = 12    # px over which the extension fades back in around a protected layer


def _kept_masks(pdir, project, shape):
    from . import detect
    for c in project.get('candidates', []):
        if c.get('state') != 'kept':
            continue
        try:
            k = detect.load_mask(pdir, c)
        except Exception:
            continue
        full = np.zeros(shape, bool)
        x0, y0, x1, y1 = c['box']
        full[y0:y1, x0:x1] = k
        yield c, full


def _kept_overlap(pdir, project, alpha: np.ndarray) -> list[str]:
    return [f"{c.get('label') or '?'} (#{c['id']})" for c, full in _kept_masks(pdir, project, alpha.shape)
            if (alpha[full] > 0).any()]


def protect_kept(pdir, project, alpha: np.ndarray, paper: np.ndarray) -> tuple[np.ndarray, list[dict]]:
    """alpha with every kept layer's footprint (mask grown by the layer ring) kept at 0, fading back in over
    PROTECT_FADE px. Returns (alpha, notes): a note per kept target the border reached, with how many of its own mask
    pixels are white paper (its layer carries that paper into the full-bleed scene: consider redoing it)."""
    prot = np.zeros(alpha.shape, bool)
    notes = []
    for c, full in _kept_masks(pdir, project, alpha.shape):
        if not (alpha[full] > 0).any() and not (ndi.binary_dilation(full, iterations=PROTECT_GROW)
                                                 & (alpha > 0)).any():
            continue
        prot |= full
        notes.append({'id': c['id'], 'label': c.get('label'), 'paper_px': int((paper & full).sum()),
                      'mask_px': int(full.sum())})
    if not prot.any():
        return alpha, notes
    d = ndi.distance_transform_edt(~prot)
    t = np.clip((d - PROTECT_GROW) / PROTECT_FADE, 0, 1)
    return (alpha * (t * t * (3 - 2 * t))).astype(np.float32), notes


MARGIN_MASKS = ('auto', 'original')


def near_white(rgb: np.ndarray) -> np.ndarray:
    a = cv2.GaussianBlur(rgb.astype(np.float32), (0, 0), 1.5)
    return (a.mean(2) >= PAPER_L) & (a.max(2) - a.min(2) <= PAPER_C)


def select_mask(pdir, project, rgb: np.ndarray, margin_mask: str = 'auto', rois=None) -> np.ndarray:
    """The paper to replace. 'auto' = paper connected to the canvas edge now; 'original' = also paper islands left
    INSIDE the first BG version's border (near-white now and within the original edge-paper mask grown 24 px), e.g.
    a patch a protected letter kept that is no longer connected to the edge. rois = [[x0,y0,x1,y1], ...]: near-white
    pixels inside these boxes are added too."""
    if margin_mask not in MARGIN_MASKS:
        raise StoreError(f'margin_mask must be one of {MARGIN_MASKS}')
    mask = paper_mask(rgb)
    if margin_mask == 'original':
        versions = (project.get('background') or {}).get('versions') or []
        first = Path(pdir) / (versions[0]['file'] if versions else 'bg.png')
        v1 = np.asarray(Image.open(first).convert('RGB'))
        if v1.shape == rgb.shape:
            orig = ndi.binary_dilation(paper_mask(v1), iterations=GROW)
            mask = mask | (near_white(rgb) & orig)
    if rois:
        nw = near_white(rgb)
        H, W = rgb.shape[:2]
        for r in rois:
            try:
                x0, y0, x1, y1 = (int(round(float(v))) for v in r)
            except (TypeError, ValueError):
                raise StoreError('rois: [[x0, y0, x1, y1], ...]')
            x0, y0, x1, y1 = max(0, x0), max(0, y0), min(W, x1), min(H, y1)
            if x1 <= x0 or y1 <= y0:
                raise StoreError(f'roi {r} is empty or outside the canvas')
            mask[y0:y1, x0:x1] |= nw[y0:y1, x0:x1]
    return mask


def apply_kept(pdir, p, alpha0: np.ndarray, mask: np.ndarray, kept: str) -> tuple[np.ndarray, list[dict]]:
    if kept == 'protect':
        return protect_kept(pdir, p, alpha0, mask)
    if kept == 'under':
        return alpha0, [{'id': c['id'], 'label': c.get('label'), 'paper_px': int((mask & full).sum()),
                         'mask_px': int(full.sum())} for c, full in _kept_masks(pdir, p, alpha0.shape)
                        if (alpha0[full] > 0).any()]
    hits = _kept_overlap(pdir, p, alpha0)
    if hits:
        raise StoreError(f'the border mask would touch kept candidates: {hits} '
                         "(kept='under' extends under them, kept='protect' keeps the BG around them)", 409)
    return alpha0, []


def _paper_warnings(notes):
    return [f"{n['label']} (#{n['id']}): {n['paper_px']} of its {n['mask_px']} mask px are white paper; its layer "
            'carries that paper into the full-bleed scene, consider cut_unchanged or redoing it'
            for n in notes if n['paper_px'] > 0.02 * n['mask_px']]


def add_extend(name: str, prompt: str | None = None, provider: str = 'nano', margin_mask: str = 'auto',
               kept: str = 'refuse', force: bool = False, rois=None) -> dict:
    """Validate and record an extend job (nothing is sent here). kept: 'refuse' (default: the border mask may not
    touch a kept candidate), 'protect' (the BG under/around kept layers stays as it is, the extension fades in around
    them; leaves paper patches next to letters that sit on paper) or 'under' (the BG is extended under kept letters
    too: their layers still come from their own answers, build cuts them against the edit's own BG version, and the
    BG that shows after a letter is found is the full-bleed one). force: extend residual edge paper even when the
    border check says ok."""
    if kept not in ('refuse', 'protect', 'under'):
        raise StoreError("kept must be 'refuse', 'protect' or 'under'")
    if provider not in ('nano', 'astra'):
        raise StoreError("provider for extend: 'nano' or 'astra'")
    prompt = (prompt or DEFAULT_PROMPT).strip()
    if len(prompt) > providers.ASTRA_MAX_PROMPT:
        raise StoreError(f'prompt: at most {providers.ASTRA_MAX_PROMPT} characters')
    pdir = store.pdir(name)
    if not (pdir / 'bg.png').is_file():
        raise StoreError('the project has no background yet', 409)
    rgb = np.asarray(Image.open(pdir / 'bg.png').convert('RGB'))
    mask = select_mask(pdir, store.read(name), rgb, margin_mask, rois)
    info = border_info(rgb)
    if not mask.any():
        raise StoreError('no paper found to extend', 409)
    if info['ok'] and not force:
        raise StoreError(f'no paper border found (fraction {info["fraction"]}): the background is full-bleed '
                         '(force=true extends the residual edge paper anyway)', 409)
    alpha0 = border_alpha(mask)
    box = {}

    def fn(p):
        if any(x.get('status') in ('queued', 'running') for x in p.get('extends', [])):
            raise StoreError('an extend is already running', 409)
        box['alpha'], box['notes'] = apply_kept(pdir, p, alpha0, mask, kept)
        xs = p.setdefault('extends', [])
        xid = f'x{len(xs) + 1}'
        rec = {'id': xid, 'dir': f'bgx/{xid}', 'provider': provider, 'prompt': prompt, 'status': 'queued',
               'border': info, 'kept': kept, 'margin_mask': margin_mask, 'rois': rois or [],
               'protected': box['notes'], 'warnings': _paper_warnings(box['notes']),
               'via': None, 'channel': None, 'error': None, 'created': now(), 'ended': None}
        xs.append(rec)
        return dict(rec)
    rec = store.update(name, fn)[1]
    xdir = pdir / rec['dir']
    xdir.mkdir(parents=True, exist_ok=True)
    Image.fromarray((box['alpha'] * 255).round().astype(np.uint8)).save(xdir / 'mask.png')
    return rec


def _commit_version(name: str, out: np.ndarray, xid: str, via, source: str = 'extend') -> int:
    """bg_v1.png (first time) + bg_v<n>.png = out, bg.png = out; background.version/border/extended_by updated."""
    pdir = store.pdir(name)
    new_border = border_info(out)
    res = {}

    def commit(p):
        bgm = p['background']
        versions = bgm.setdefault('versions', [])
        if not versions:
            shutil.copyfile(pdir / 'bg.png', pdir / 'bg_v1.png')
            versions.append({'file': 'bg_v1.png', 'source': bgm.get('source'), 'set': bgm.get('set')})
        n = len(versions) + 1
        Image.fromarray(out).save(pdir / f'bg_v{n}.png')
        shutil.copyfile(pdir / f'bg_v{n}.png', pdir / 'bg.png')
        versions.append({'file': f'bg_v{n}.png', 'source': source, 'extend': xid, 'via': via, 'set': now()})
        bgm.update(version=n, border=new_border, extended_by=xid)
        res['n'] = n
    store.update(name, commit)
    return res['n']


def reapply_extend(name: str, from_xid: str, margin_mask: str = 'original', rois=None, kept: str = 'under') -> dict:
    """No paid call: paste an earlier extend's answer (bgx/<from>/answer.png, already registered to the canvas) into
    the CURRENT bg.png under a new mask (e.g. a paper island the first mask missed). Recorded as a new extend with
    paid=false. Returns the record."""
    pdir = store.pdir(name)
    p = store.read(name)
    src = _find(p, from_xid)
    if src.get('status') != 'done':
        raise StoreError(f'extend {from_xid} is {src.get("status")}, not done', 409)
    ans_path = pdir / src['dir'] / 'answer.png'
    if not ans_path.is_file():
        raise StoreError(f'extend {from_xid} has no answer.png', 409)
    rgb = np.asarray(Image.open(pdir / 'bg.png').convert('RGB'))
    A = np.asarray(Image.open(ans_path).convert('RGB'))
    if A.shape != rgb.shape:
        raise StoreError('that answer does not match the current canvas', 409)
    mask = select_mask(pdir, p, rgb, margin_mask, rois)
    if not mask.any():
        raise StoreError('no paper found under that mask', 409)
    alpha0 = border_alpha(mask)
    p = store.read(name)
    if any(x.get('status') in ('queued', 'running') for x in p.get('extends', [])):
        raise StoreError('an extend is running', 409)
    alpha, notes = apply_kept(pdir, p, alpha0, mask, kept)
    xid = f"x{len(p.get('extends', [])) + 1}"
    xdir = pdir / 'bgx' / xid
    xdir.mkdir(parents=True, exist_ok=True)
    Image.fromarray((alpha * 255).round().astype(np.uint8)).save(xdir / 'mask.png')
    out = rgb.copy()
    m = alpha > 0
    out[m] = np.clip(rgb[m].astype(np.float32) + (A[m].astype(np.float32) - rgb[m]) * alpha[m, None], 0,
                     255).round().astype(np.uint8)
    rec = {'id': xid, 'dir': f'bgx/{xid}', 'provider': None, 'reapply_of': from_xid, 'paid': False,
           'prompt': None, 'status': 'done', 'border': border_info(rgb), 'kept': kept,
           'margin_mask': margin_mask, 'rois': rois or [], 'protected': notes,
           'warnings': _paper_warnings(notes), 'via': src.get('via'), 'channel': None, 'error': None,
           'created': now(), 'ended': now(), 'replaced_px': int(m.sum())}
    store.update(name, lambda q: q.setdefault('extends', []).append(rec))
    rec['version'] = _commit_version(name, out, xid, src.get('via'))
    store.write_json(xdir / 'result.json', rec)
    return rec


PATCH_GROW = 6        # px the patch mask grows by (a hand-drawn mask rarely covers an object's soft edge)
PATCH_FEATHER = 12    # px over which the patch fades into the BG


def _patch_mask_in(pdir, H, W, box, mask_path=None, rois=None) -> np.ndarray:
    m = np.zeros((H, W), bool)
    x0, y0, x1, y1 = box
    if mask_path:
        f = Path(mask_path)
        f = f if f.is_absolute() else Path(pdir) / f
        if not f.is_file():
            raise StoreError(f'mask: no such file {mask_path}', 404)
        im = Image.open(f)
        a = np.asarray(im.getchannel('A') if im.mode in ('RGBA', 'LA') else im.convert('L')) > 127
        if a.shape == (H, W):
            m |= a
        elif a.shape == (y1 - y0, x1 - x0):
            m[y0:y1, x0:x1] |= a
        else:
            raise StoreError(f'mask is {a.shape[1]}x{a.shape[0]}: it must be the canvas ({W}x{H}) or the edit box '
                             f'({x1 - x0}x{y1 - y0}); white (or opaque) = replace')
    for r in rois or []:
        try:
            rx0, ry0, rx1, ry1 = (int(round(float(v))) for v in r)
        except (TypeError, ValueError):
            raise StoreError('rois: [[x0, y0, x1, y1], ...]')
        rx0, ry0, rx1, ry1 = max(0, rx0), max(0, ry0), min(W, rx1), min(H, ry1)
        if rx1 <= rx0 or ry1 <= ry0:
            raise StoreError(f'roi {r} is empty or outside the canvas')
        m[ry0:ry1, rx0:rx1] = True
    if not m.any():
        raise StoreError('patch: give a mask (png path) and/or rois')
    return m


def patch_background(name: str, eid: str, mask_path=None, rois=None, kept: str = 'refuse',
                     grow: int = PATCH_GROW, feather: int = PATCH_FEATHER) -> dict:
    """No paid call: paste edit <eid>'s registered answer into the CURRENT bg.png only under a mask (a PNG path,
    canvas- or box-sized, white/opaque = replace, and/or rois = boxes replaced whole), grown `grow` px and feathered
    `feather` px, clipped to the edit box. For a BG artefact found after edits exist: make a normal edit that paints
    the fix, then patch it in. Outside the mask the BG stays bit-identical. kept='refuse' (409 when the feathered
    mask touches a kept candidate) or 'protect' (kept layers and their ring stay as they are). Commits a new BG
    version (source 'patch') and records it in "extends" (paid=false, patch_of=<eid>)."""
    from . import detect
    if kept not in ('refuse', 'protect'):
        raise StoreError("kept must be 'refuse' or 'protect'")
    grow, feather = int(grow), int(feather)
    if not (0 <= grow <= 64 and 0 <= feather <= 64):
        raise StoreError('grow and feather: 0-64 px')
    pdir = store.pdir(name)
    p = store.read(name)
    e = store.find_edit(p, eid)
    if e.get('status') != 'done':
        raise StoreError(f'edit {eid} is {e.get("status")}, not done', 409)
    if any(x.get('status') in ('queued', 'running') for x in p.get('extends', [])):
        raise StoreError('an extend is running', 409)
    rgb = np.asarray(Image.open(pdir / 'bg.png').convert('RGB'))
    H, W = rgb.shape[:2]
    x0, y0, x1, y1 = e['box']
    mask = _patch_mask_in(pdir, H, W, e['box'], mask_path, rois)
    outside = int(mask.sum() - mask[y0:y1, x0:x1].sum())
    if outside:
        raise StoreError(f'{outside} mask px lie outside edit {eid} box {e["box"]}: the edit has no pixels there', 409)
    ebg = detect.load_rgb(store.bg_file_for_edit(pdir, p, e))
    ans = detect.load_answer(pdir, e, registered=True, bg=ebg)
    A = rgb.copy()
    A[y0:y1, x0:x1] = ans
    m = ndi.binary_dilation(mask, iterations=grow) if grow else mask
    if feather:
        d = ndi.distance_transform_edt(~m)
        t = np.clip(1 - d / feather, 0, 1)
        alpha = (t * t * (3 - 2 * t)).astype(np.float32)
    else:
        alpha = m.astype(np.float32)
    inbox = np.zeros((H, W), bool)
    inbox[y0:y1, x0:x1] = True
    alpha[~inbox] = 0
    warnings = []
    if ebg.shape == rgb.shape and not np.array_equal(ebg[y0:y1, x0:x1][mask[y0:y1, x0:x1]],
                                                     rgb[y0:y1, x0:x1][mask[y0:y1, x0:x1]]):
        warnings.append(f'edit {eid} was made on an older BG version and the BG changed under the mask since')
    if kept == 'protect':
        alpha, notes = protect_kept(pdir, p, alpha, np.zeros((H, W), bool))
    else:
        hits = _kept_overlap(pdir, p, alpha)
        if hits:
            raise StoreError(f'the patch mask would touch kept candidates: {hits} '
                             "(kept='protect' keeps them and their ring as they are)", 409)
        notes = []
    mm = alpha > 0
    out = rgb.copy()
    out[mm] = np.clip(rgb[mm].astype(np.float32) + (A[mm].astype(np.float32) - rgb[mm]) * alpha[mm, None], 0,
                      255).round().astype(np.uint8)
    p = store.read(name)
    xid = f"x{len(p.get('extends', [])) + 1}"
    xdir = pdir / 'bgx' / xid
    xdir.mkdir(parents=True, exist_ok=True)
    Image.fromarray((alpha * 255).round().astype(np.uint8)).save(xdir / 'mask.png')
    rec = {'id': xid, 'dir': f'bgx/{xid}', 'provider': None, 'patch_of': eid, 'paid': False, 'prompt': None,
           'status': 'done', 'kept': kept, 'grow': grow, 'feather': feather, 'rois': rois or [],
           'mask_in': str(mask_path) if mask_path else None, 'protected': notes, 'warnings': warnings,
           'via': e.get('provider') or 'nano', 'channel': None, 'error': None, 'created': now(), 'ended': now(),
           'replaced_px': int(mm.sum()), 'border': border_info(rgb)}
    store.update(name, lambda q: q.setdefault('extends', []).append(rec))
    rec['version'] = _commit_version(name, out, xid, rec['via'], source='patch')
    store.write_json(xdir / 'result.json', rec)
    return rec


def _find(p, xid):
    for x in p.get('extends', []):
        if x['id'] == xid:
            return x
    raise StoreError(f'no extend {xid!r}', 404)


def run_extend(name: str, xid: str) -> str:
    """Job body. Returns the final status."""
    pdir = store.pdir(name)

    def start(p):
        x = _find(p, xid)
        if x['status'] != 'queued':
            return None
        x['status'], x['started'] = 'running', now()
        return dict(x)
    x = store.update(name, start)[1]
    if x is None:
        return _find(store.read(name), xid)['status']
    xdir = pdir / x['dir']
    req_path = xdir / 'request.json'
    status, error, via, channel, clai_error, info = 'failed', None, None, None, None, {}
    t0 = time.time()
    try:
        bg = Image.open(pdir / 'bg.png').convert('RGB')
        W, H = bg.size
        k = min(1.0, MAX_SEND / max(W, H))
        sw, sh = max(16, round(W * k)), max(16, round(H * k))
        sent = bg if (sw, sh) == (W, H) else bg.resize((sw, sh), Image.LANCZOS)
        sent.save(xdir / 'sent.png')
        sent_png = (xdir / 'sent.png').read_bytes()
        alpha = np.asarray(Image.open(xdir / 'mask.png').convert('L')).astype(np.float32) / 255
        if alpha.shape != (H, W):
            raise StoreError('the background changed since the extend was queued')
        request = {'kind': 'extend', 'provider': x['provider'], 'prompt': x['prompt'], 'send': [sw, sh],
                   'canvas': [W, H]}
        prior = store.read_json(req_path) or {}
        if prior.get('attempts'):
            request['attempts'] = prior['attempts']
        fallback = store.read(name)['settings'].get('fallback', 'albert')
        if x['provider'] == 'astra':
            until = providers.astra_limit_until()
            if until:
                raise ProviderError(providers.astra_limit_text(until), 'invalid')
            with providers.ASTRA_SLOTS:
                store.record_attempt(req_path, request, 'astra')
                ans = providers.astra_edit(x['prompt'], [xdir / 'sent.png'],
                                           ratio=nearest_ratio(sw, sh, providers.ASTRA_RATIOS), take_slot=False)
            via = 'astra'
        else:
            from .edits import JobCancelled, _retry_note, clai_with_retry
            try:
                ans = clai_with_retry(
                    lambda: providers.clai_edit(x['prompt'], [sent_png], square=sw == sh, long_side=max(sw, sh),
                                                aspect_ratio=nearest_ratio(sw, sh, providers.RATIOS)),
                    req_path, request, f'{name}.{xid}', _retry_note(name, lambda p: _find(p, xid)))
                via = 'clai'
            except ProviderError as ce:
                clai_error = str(ce)
                if fallback != 'albert' or isinstance(ce, JobCancelled):
                    raise
                store.record_attempt(req_path, request, 'albert')
                ans = providers.albert_image(x['prompt'], [sent_png], sw, sh)
                via = 'albert'
        channel = ans.get('channel')
        raw = Image.open(io.BytesIO(ans['png'])).convert('RGB')
        raw.save(xdir / 'answer_raw.png')
        A = np.asarray(raw.resize((W, H), Image.LANCZOS))
        B = np.asarray(bg)
        try:
            from . import register as R
            A2, info = R.register(A, B, apply_fit=True)
            A = np.asarray(A2).astype(np.uint8)
        except Exception as rex:
            info = {'applied': False, 'error': f'{type(rex).__name__}: {str(rex)[:200]}'}
        out = B.copy()
        m = alpha > 0
        out[m] = np.clip(B[m].astype(np.float32) + (A[m].astype(np.float32) - B[m]) * alpha[m, None], 0,
                         255).round().astype(np.uint8)
        Image.fromarray(A).save(xdir / 'answer.png')

        _commit_version(name, out, xid, via)
        status = 'done'
    except ProviderError as e:
        status, error = ('unknown' if e.kind == 'unknown' else 'failed'), str(e)
    except StoreError as e:
        status, error = 'failed', str(e)
    except Exception as e:  # never leave the job hanging; never resend
        status = 'unknown' if store.was_sent(req_path) else 'failed'
        error = f'internal error: {type(e).__name__}: {str(e)[:200]}'
    result = {'status': status, 'error': error, 'via': via, 'channel': channel, 'clai_error': clai_error,
              'registration': {k: v for k, v in info.items() if k != 'M'}, 'seconds': round(time.time() - t0, 1)}
    store.write_json(xdir / 'result.json', result)

    def end(p):
        _find(p, xid).update(status=status, error=error, via=via, channel=channel, clai_error=clai_error,
                             registration=result['registration'], ended=now())
    store.update(name, end)
    return status
