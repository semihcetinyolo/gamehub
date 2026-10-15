import sys
sys.path.insert(0, '/tmp/marla/tools')
import numpy as np, cv2
from scipy import ndimage as ndi
from PIL import Image
import marla, spots

BG = np.asarray(Image.open('/tmp/marla/beach.png').convert('RGB')).astype(np.int16)

def paste_rgb(edit):
    g = edit['geometry']; px0, py0, px1, py1 = g['paste']; ox, oy = marla.origin(edit)
    pt = np.asarray(Image.open(marla.fetch_patch(edit)).convert('RGB')).astype(np.int16)
    return pt[py0 - oy:py1 - oy, px0 - ox:px1 - ox], (px0, py0, px1, py1)

def _diff(a, b):
    return cv2.GaussianBlur(np.abs(a - b).max(2).astype(np.float32), (0, 0), 1.5)

def cores(E, thr=48):
    """Character mask of every spot, in canvas coordinates: what changed against the clean bg,
    minus content copied from a neighbour's edit, keeping the blobs that touch the spot's box."""
    P = {n: paste_rgb(E[n]) for n in E}
    out = {}
    for n, (pn, (x0, y0, x1, y1)) in P.items():
        m = _diff(pn, BG[y0:y1, x0:x1]) > thr
        deps = set(E[n]['geometry'].get('depends_on') or [])
        for k, (pk, (a0, b0, a1, b1)) in P.items():
            if k == n or E[k]['id'] not in deps: continue  # only neighbours that were in this edit's context
            ix0, iy0, ix1, iy1 = max(x0, a0), max(y0, b0), min(x1, a1), min(y1, b1)
            if ix0 >= ix1 or iy0 >= iy1: continue
            sn = pn[iy0 - y0:iy1 - y0, ix0 - x0:ix1 - x0]; sk = pk[iy0 - b0:iy1 - b0, ix0 - a0:ix1 - a0]
            theirs = (_diff(sk, BG[iy0:iy1, ix0:ix1]) > thr) & (_diff(sn, sk) < 40)
            m[iy0 - y0:iy1 - y0, ix0 - x0:ix1 - x0] &= ~ndi.binary_dilation(theirs, iterations=2)
        m = ndi.binary_opening(m, iterations=1)
        m = ndi.binary_closing(m, iterations=4)
        lab, cnt = ndi.label(m)
        bx0, by0, bx1, by1 = spots.box(n)
        inner = np.zeros_like(m); inner[max(0, by0 - y0):by1 - y0, max(0, bx0 - x0):bx1 - x0] = True
        sizes = ndi.sum(np.ones_like(lab), lab, range(1, cnt + 1))
        keep = [i + 1 for i in range(cnt) if sizes[i] > 150 and (lab == i + 1)[inner].any()]
        out[n] = (ndi.binary_fill_holes(np.isin(lab, keep)), (x0, y0, x1, y1))
    return P, out

def owner_map(C):
    lab = np.zeros((4096, 4096), np.int32)
    for n, (c, (x0, y0, x1, y1)) in C.items():
        sub = lab[y0:y1, x0:x1]; sub[c & (sub == 0)] = n
    _, (iy, ix) = ndi.distance_transform_edt(lab == 0, return_indices=True)
    return lab[iy, ix]

def layers(E, grow=26, feather=10):
    P, C = cores(E)
    own = owner_map(C)
    res = {}
    for n in E:
        core, (x0, y0, x1, y1) = C[n]; pn = P[n][0]
        m = ndi.binary_fill_holes(ndi.binary_dilation(core, iterations=grow))
        a = np.clip((cv2.GaussianBlur(m.astype(np.float32), (0, 0), feather) - 0.02) / 0.5, 0, 1)
        a = np.minimum(a, cv2.GaussianBlur((own[y0:y1, x0:x1] == n).astype(np.float32), (0, 0), 1.5))
        a[core] = 1.0
        ys, xs = np.nonzero(a > 0.004)
        t, b, l, r = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        rgba = np.dstack([pn[t:b, l:r].astype(np.uint8), (a[t:b, l:r] * 255).round().astype(np.uint8)])
        res[n] = (Image.fromarray(rgba, 'RGBA'), int(x0 + l), int(y0 + t))
    return res
