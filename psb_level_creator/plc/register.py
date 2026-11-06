"""Register an edit's answer onto the BG crop of its box before anything diffs it.

Nano Banana answers come back pixel-registered; GPT image (Astra) answers may come back shifted (2-14 px seen) or
scaled a little, and a diff of such an answer marks every edge in the square. Port of HiddenLevelRecreate
scripts/rs_astra.py register(): phase correlation for the shift, then an ECC affine fit, refitted without the
pixels that changed (the drawn objects); a wild fit is rejected and the answer kept as it is. Pixels the warp pulls
in from outside the answer get the BG's own pixels (no smeared border strip).

Hand-off (agreed with opus-api): plc/edits.py calls register() when the answer arrives and saves the registered
answer.png (raw in answer_raw.png, the info in result.json "registration"). For an answer.png without that record
(older edits), detect.load_answer registers it lazily: cached() keeps edits/<id>/answer_reg.png + register.json, so
detect, sheet and build all read the same pixels; answer.png is never changed here.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import cv2
import numpy as np

MAX_LINEAR = 0.1    # |A - I| of the 2x2 part above this = a wild fit, answer kept as is (rs_astra.py)
MAX_SHIFT = 40      # px
MIN_SHIFT = 0.35    # below this (and a near-identity linear part) nothing is warped: no resampling blur on Nano answers
MIN_LINEAR = 0.002
WORK_SIDE = 512     # ECC runs at about this size, the matrix is scaled back
VERSION = 1


def _lum(a):
    a = a.astype(np.float32)
    return a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114


def _ecc(n, a, M, mask=None, iters=50):
    return cv2.findTransformECC(n, a, M.astype(np.float32), cv2.MOTION_AFFINE,
                                (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, iters, 1e-4), mask, 5)[1]


def estimate(answer: np.ndarray, bg: np.ndarray) -> dict:
    """Affine M (2x3, answer px = M @ bg px, for cv2 WARP_INVERSE_MAP) that lays the answer onto the BG.
    ECC coarse to fine (1/4 size first: a wider basin for a scaled answer), started from no shift and from the phase
    correlation shift; then refitted without the pixels that still differ (the drawn objects; rs_astra.py leaves out
    the item). The candidate with the smallest residual against the BG wins, no warp included.
    Returns {M, ok, why, shift, linear, residual, identity_residual}."""
    h, w = answer.shape[:2]
    f = min(1.0, WORK_SIDE / max(h, w))
    sz = (max(16, int(round(w * f))), max(16, int(round(h * f))))
    raw_a = cv2.resize(_lum(answer), sz, interpolation=cv2.INTER_AREA)
    raw_n = cv2.resize(_lum(bg), sz, interpolation=cv2.INTER_AREA)
    k = max(2, int(0.06 * min(sz)))

    def warp(img, M, size):
        return cv2.warpAffine(img, M.astype(np.float32), size, flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP,
                              borderMode=cv2.BORDER_REPLICATE)

    def err(M):  # unblurred residual over the inner part, capped (the drawn objects are a small share)
        return float(np.minimum(np.abs(warp(raw_a, M, sz) - raw_n)[k:-k, k:-k], 30).mean())

    def level(s):
        size = (max(16, int(sz[0] * s)), max(16, int(sz[1] * s)))
        return (cv2.GaussianBlur(cv2.resize(raw_n, size, interpolation=cv2.INTER_AREA), (0, 0), 1.0),
                cv2.GaussianBlur(cv2.resize(raw_a, size, interpolation=cv2.INTER_AREA), (0, 0), 1.0), size)

    def scaled(M, s):
        M = M.astype(np.float64).copy()
        M[:, 2] *= s
        return M

    def pyramid(M0, mask=None):
        M = M0
        for s, iters in ((0.25, 60), (0.5, 30), (1.0, 15)):
            n, a, size = level(s)
            m = None if mask is None else cv2.resize(mask, size, interpolation=cv2.INTER_NEAREST)
            try:
                M = scaled(_ecc(n, a, scaled(M, s), m, iters), 1 / s)
            except cv2.error:
                pass
        return M

    n1, a1, _ = level(1.0)
    (dx, dy), _ = cv2.phaseCorrelate(n1.copy(), a1.copy(), cv2.createHanningWindow(a1.shape[::-1], cv2.CV_32F))
    I = np.eye(2, 3)
    tries = [('identity', I), ('phase', np.array([[1, 0, dx], [0, 1, dy]], np.float64))]
    for name, M0 in list(tries):
        tries.append((f'ecc from {name}', pyramid(M0)))
    best = min(tries, key=lambda t: err(t[1]))
    changed = cv2.dilate((cv2.GaussianBlur(np.abs(warp(raw_a, best[1], sz) - raw_n), (0, 0), 1.5) > 25).astype(np.uint8),
                         np.ones((9, 9), np.uint8))
    if 0.005 < changed.mean() < 0.6:
        tries.append((best[0] + ', changed pixels left out', pyramid(best[1], (1 - changed).astype(np.uint8))))
    scored = [(err(M), why, M) for why, M in tries]
    if os.environ.get('PLC_REG_DEBUG'):
        print([(round(x, 2), y) for x, y, _ in scored])
    e, why, M = min(scored, key=lambda t: t[0])
    M = M.astype(np.float64)
    M[:, 2] /= f  # translation back to full size (the linear part is scale-free)
    lin = float(np.abs(M[:, :2] - np.eye(2)).max())
    shift = float(np.abs(M[:, 2]).max())
    if lin > MAX_LINEAR or shift > MAX_SHIFT:
        return dict(M=np.eye(2, 3).tolist(), ok=False, why=f'wild fit rejected (linear {lin:.3f}, shift {shift:.1f})',
                    shift=0.0, linear=0.0)
    return dict(M=M.tolist(), ok=True, why=why, shift=round(shift, 2), linear=round(lin, 4), residual=round(e, 2),
                identity_residual=round(scored[0][0], 2))


def apply(answer: np.ndarray, bg: np.ndarray, M) -> np.ndarray:
    """The answer warped onto the BG; pixels that come from outside the answer take the BG's own."""
    M = np.asarray(M, np.float32)
    h, w = answer.shape[:2]
    out = cv2.warpAffine(answer, M, (w, h), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP,
                         borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    valid = cv2.warpAffine(np.full((h, w), 255, np.uint8), M, (w, h), flags=cv2.INTER_NEAREST | cv2.WARP_INVERSE_MAP,
                           borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    valid = cv2.erode(valid, np.ones((3, 3), np.uint8)) > 0  # the interpolated rim pixel is half black
    out[~valid] = bg[~valid]
    return out


def needed(info: dict) -> bool:
    return bool(info.get('ok')) and (info['shift'] >= MIN_SHIFT or info['linear'] >= MIN_LINEAR)


def register(answer: np.ndarray, bg: np.ndarray, apply_fit: bool = True):
    """(registered answer, info). Info carries `applied`: False when the answer was already in place, the fit was
    rejected, or apply_fit is False (only measured; then the answer comes back unchanged)."""
    info = estimate(answer, bg)
    info['applied'] = bool(apply_fit) and needed(info)
    info['by'] = 'plc.register'
    return (apply(answer, bg, info['M']) if info['applied'] else answer), info


def cached(edir: Path, answer: np.ndarray, bg: np.ndarray, src: Path):
    """register() with the result cached in edir (answer_reg.png + register.json), keyed on the source file."""
    from PIL import Image
    edir = Path(edir)
    st = src.stat()
    key = dict(src=src.name, mtime=st.st_mtime_ns, size=st.st_size, shape=list(answer.shape), version=VERSION)
    meta, reg = edir / 'register.json', edir / 'answer_reg.png'
    try:
        info = json.loads(meta.read_text())
        if info.get('key') == key:
            if not info.get('applied'):
                return answer, info
            if reg.is_file():
                return np.asarray(Image.open(reg).convert('RGB')), info
    except (OSError, ValueError):
        pass
    out, info = register(answer, bg)
    info['key'] = key
    if info['applied']:
        tmp = reg.with_suffix(f'.{os.getpid()}.tmp.png')
        Image.fromarray(out).save(tmp)
        os.replace(tmp, reg)
    tmp = meta.with_suffix(f'.{os.getpid()}.tmp')
    tmp.write_text(json.dumps(info, indent=1))
    os.replace(tmp, meta)
    return out, info
