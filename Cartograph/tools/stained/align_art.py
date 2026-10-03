"""Register each AI artwork onto its colour guide so the glass seams sit exactly on the map.

The image model follows the guide's layout but may shift or scale it a little. This finds the
affine warp (OpenCV ECC on the lead-line maps of both images) and rewrites assets/glass/<id>.webp
from the untouched original in tools/stained/raw/<id>.png.
python3 tools/stained/align_art.py [ids…]
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).parent
ROOT = HERE.parents[1]
W, H = 768, 1024


def leads(img):
    """Soft map of dark seams: high where a pixel is much darker than its surroundings."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
    local = cv2.GaussianBlur(gray, (0, 0), 9)
    dark = np.clip(local - gray, 0, 80) / 80
    return cv2.GaussianBlur(dark, (0, 0), 2.5)


def align(id):
    guide = cv2.imread(str(HERE / 'guides' / f'{id}.png'))
    src = next(p for p in (HERE / 'raw' / f'{id}.png', ROOT / 'assets' / 'glass' / f'{id}.png') if p.exists())
    art = cv2.imread(str(src))
    art = cv2.resize(art, (W, H), interpolation=cv2.INTER_AREA)
    a, b = leads(guide), leads(art)
    def refine(init):
        warp = init.copy()
        for scale in (0.25, 0.5, 1.0):
            sa = cv2.resize(a, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
            sb = cv2.resize(b, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
            w = warp.copy()
            w[:, 2] *= scale
            criteria = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-6)
            try:
                _, w = cv2.findTransformECC(sa, sb, w, cv2.MOTION_AFFINE, criteria, None, 5)
            except cv2.error:
                return None
            warp = w.copy()
            warp[:, 2] /= scale
        return warp

    # the model sometimes draws the panel a little larger or smaller: try a few starting scales
    best, best_score = np.eye(2, 3, dtype=np.float32), -1
    starts = [(1.0, 1.0)] + [(kx, ky) for kx in (1.0, 0.92, 1.08) for ky in (0.85, 0.92, 1.0, 1.08, 1.15) if (kx, ky) != (1.0, 1.0)]
    for kx, ky in starts:
        init = np.array([[kx, 0, W / 2 * (1 - kx)], [0, ky, H / 2 * (1 - ky)]], dtype=np.float32)
        w = refine(init)
        if w is None:
            continue
        out = cv2.warpAffine(art, w, (W, H), flags=cv2.INTER_CUBIC + cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)
        score = float(np.corrcoef(a.ravel(), leads(out).ravel())[0, 1])
        if score > best_score:
            best, best_score = w, score
        if score > 0.75:
            break
    warp = best
    before = float(np.corrcoef(a.ravel(), b.ravel())[0, 1])
    out = cv2.warpAffine(art, warp, (W, H), flags=cv2.INTER_CUBIC + cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)
    after = float(np.corrcoef(a.ravel(), leads(out).ravel())[0, 1])
    if after < before:
        out, warp, after = art, np.eye(2, 3, dtype=np.float32), before
    cv2.imwrite(str(ROOT / 'assets' / 'glass' / f'{id}.webp'), out, [cv2.IMWRITE_WEBP_QUALITY, 86])
    meta_path = ROOT / 'assets' / 'glass' / f'{id}.json'
    meta = json.loads(meta_path.read_text())
    meta['alignment'] = {'affine': [[round(float(v), 5) for v in row] for row in warp], 'seamCorrelation': [round(before, 3), round(after, 3)]}
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + '\n')
    shift = np.hypot(*warp[:, 2])
    print(f'{id}: seam match {before:.2f} → {after:.2f} (shift {shift:.0f}px, scale {warp[0, 0]:.3f}/{warp[1, 1]:.3f})')


if __name__ == '__main__':
    ids = sys.argv[1:] or sorted(p.stem for p in (HERE / 'maps').glob('*.json'))
    for id in ids:
        align(id)
