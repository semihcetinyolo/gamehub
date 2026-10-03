"""Turn a mosaic photo into a half-split cell grid with a palette label per triangle.

Usage: python3 tools/art_extract.py <image> <out.json> --crop x0 y0 x1 y1 --grid cols rows --k colours
"""
import argparse, json
import numpy as np
import cv2
from PIL import Image


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('image'); ap.add_argument('out')
    ap.add_argument('--crop', nargs=4, type=int, required=True)
    ap.add_argument('--grid', nargs=2, type=int, required=True)
    ap.add_argument('--k', type=int, default=6)
    ap.add_argument('--preview')
    a = ap.parse_args()
    cols, rows = a.grid
    im = Image.open(a.image).convert('RGB').crop(tuple(a.crop))
    cell = 24
    im = im.resize((cols * cell, rows * cell), Image.LANCZOS)
    px = np.asarray(im).astype(np.float32)
    hsv = cv2.cvtColor(px.astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)
    # Grout is the low-saturation mid grey between tiles; leave it out of the colour vote.
    grout = (hsv[..., 1] < 40) & (hsv[..., 2] > 90) & (hsv[..., 2] < 200)
    sample = px[~grout].reshape(-1, 3)
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 60, 0.5)
    _, labels, centers = cv2.kmeans(sample, a.k, None, crit, 6, cv2.KMEANS_PP_CENTERS)
    centers = centers.astype(np.float32)
    lab = np.argmin(((px[..., None, :] - centers[None, None]) ** 2).sum(-1), axis=-1)
    lab[grout] = -1

    yy, xx = np.mgrid[0:cell, 0:cell]
    fx, fy = (xx + 0.5) / cell, (yy + 0.5) / cell
    masks = {  # orient, atom -> pixel mask inside one cell (see engine.triangle)
        (0, 0): fx > fy, (0, 1): fx <= fy,
        (1, 0): fx + fy < 1, (1, 1): fx + fy >= 1,
    }
    orient, atoms = [], []
    for r in range(rows):
        for c in range(cols):
            block = lab[r * cell:(r + 1) * cell, c * cell:(c + 1) * cell]
            best = None
            for o in (0, 1):
                picks, purity = [], 0
                for k in (0, 1):
                    v = block[masks[(o, k)]]
                    v = v[v >= 0]
                    if len(v) == 0:
                        picks.append(-1); continue
                    counts = np.bincount(v, minlength=a.k)
                    picks.append(int(counts.argmax()))
                    purity += counts.max() / len(v)
                if best is None or purity > best[0]:
                    best = (purity, o, picks)
            orient.append(best[1]); atoms.extend(best[2])
    # Cells that were all grout borrow their neighbour's label.
    for i, v in enumerate(atoms):
        if v < 0:
            atoms[i] = atoms[i ^ 1] if atoms[i ^ 1] >= 0 else 0
    palette = ['#%02x%02x%02x' % tuple(int(round(x)) for x in c) for c in centers]
    json.dump({'cols': cols, 'rows': rows, 'orient': orient, 'labels': atoms, 'palette': palette}, open(a.out, 'w'))
    if a.preview:
        s = 30
        out = Image.new('RGB', (cols * s, rows * s))
        d = np.asarray(out).copy()
        for r in range(rows):
            for c in range(cols):
                o = orient[r * cols + c]
                for k in (0, 1):
                    col = centers[atoms[(r * cols + c) * 2 + k]]
                    m = masks[(o, k)]
                    mm = cv2.resize(m.astype(np.uint8), (s, s), interpolation=cv2.INTER_NEAREST).astype(bool)
                    d[r * s:(r + 1) * s, c * s:(c + 1) * s][mm] = col
        Image.fromarray(d).save(a.preview)
    print(a.out, 'palette', palette)


if __name__ == '__main__':
    main()
