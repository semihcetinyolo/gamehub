#!/usr/bin/env python3
"""Cut overlapping H layers of a Waldo .psb so no H hides or carries another's character.

Each H layer is a Marla edit patch whose shape lives in its layer mask (build_psb.py
writes the alpha there; the pixel channels are an opaque rectangle). Read layers with
layer_rgba(), not topil(), or every H comes out as that rectangle.

Where two H shapes still overlap, the upper one paints its own copy of that area over the
lower one, so it can chop the lower character off, and the lower one may still hold a
copy of the upper character (a ghost left behind once the upper one is removed).

For each overlapping pair, the pixels of one layer's character (what differs from the
clean BG, kept to the blob that is that layer's own character) are cut out of the other
layer, with a 1-2 px soft edge. Where both characters really overlap, nothing is cut.

Usage:  python3 tools/cut_overlaps.py in.psb out.psb [preview.jpg]
Requires: psd-tools, Pillow, numpy, scipy, opencv-python.
"""
import sys
import numpy as np, cv2
from PIL import Image
from psd_tools import PSDImage
from psd_tools.api.layers import PixelLayer, Group
from scipy import ndimage as ndi

DIFF_THR = 40     # max-channel difference from BG that counts as "drawn"
GROW = 4          # px the character mask is grown before cutting it out of a neighbour


def character(rgb, bg):
    """Mask of the layer's own character: the biggest drawn blob reaching the middle of the
    rectangle, plus any other sizeable blob centred well inside it (a raised hand, a ball)."""
    d = cv2.GaussianBlur(np.abs(rgb.astype(np.int16) - bg.astype(np.int16)).max(2).astype(np.float32), (0, 0), 1.5)
    m = ndi.binary_closing(ndi.binary_opening(d > DIFF_THR, iterations=1), iterations=3)
    lab, n = ndi.label(m)
    if not n:
        return m
    h, w = m.shape
    sizes = ndi.sum(m, lab, range(1, n + 1))
    mid = np.zeros_like(m); mid[h // 4:h - h // 4, w // 4:w - w // 4] = True
    in_mid = [i + 1 for i in range(n) if (lab == i + 1)[mid].any()]
    main = max(in_mid or range(1, n + 1), key=lambda i: sizes[i - 1])
    keep = {main}
    for i in range(1, n + 1):
        cy, cx = ndi.center_of_mass(lab == i)
        if sizes[i - 1] >= max(150, 0.15 * sizes[main - 1]) and 0.2 * h < cy < 0.8 * h and 0.2 * w < cx < 0.8 * w:
            keep.add(i)
    m = ndi.binary_fill_holes(ndi.binary_closing(np.isin(lab, list(keep)), iterations=5))
    return ndi.binary_dilation(m, iterations=GROW)


def layer_rgba(h):
    """Layer pixels with its layer mask applied as alpha."""
    a = np.array(h.topil().convert("RGBA"))
    if h.has_mask():
        m = h.mask
        full = np.full(a.shape[:2], m.background_color, np.uint8)
        mi = np.asarray(m.topil().convert("L"))
        l, t = m.left - h.left, m.top - h.top
        y0, x0 = max(0, t), max(0, l)
        y1, x1 = min(a.shape[0], t + mi.shape[0]), min(a.shape[1], l + mi.shape[1])
        full[y0:y1, x0:x1] = mi[y0 - t:y1 - t, x0 - l:x1 - l]
        a[..., 3] = (a[..., 3].astype(np.uint16) * full // 255).astype(np.uint8)
    return a


def load_layers(groups, bg):
    """Every H of the given groups, in draw order (bottom -> top), ready for cut_layers()."""
    L = []
    for gname, hs in groups:
        for h in hs:
            rgba = layer_rgba(h)
            x0, y0 = h.left, h.top
            y1, x1 = y0 + rgba.shape[0], x0 + rgba.shape[1]
            L.append(dict(group=gname, layer=h, box=(x0, y0, x1, y1), rgba=rgba,
                          char=character(rgba[..., :3], bg[y0:y1, x0:x1]) & (rgba[..., 3] > 128), cut=np.zeros(rgba.shape[:2], bool)))
    return L


def cut_layers(L):
    """Cut each layer's character out of every overlapping layer (in place). Returns pair count."""
    pairs = 0
    for i, a in enumerate(L):
        for b in L[i + 1:]:
            ax0, ay0, ax1, ay1 = a["box"]; bx0, by0, bx1, by1 = b["box"]
            x0, y0, x1, y1 = max(ax0, bx0), max(ay0, by0), min(ax1, bx1), min(ay1, by1)
            if x0 >= x1 or y0 >= y1:
                continue
            sa = (slice(y0 - ay0, y1 - ay0), slice(x0 - ax0, x1 - ax0))
            sb = (slice(y0 - by0, y1 - by0), slice(x0 - bx0, x1 - bx0))
            ca, cb = a["char"][sa], b["char"][sb]
            a["cut"][sa] |= cb & ~ca      # b's character out of a
            b["cut"][sb] |= ca & ~cb      # a's character out of b
            pairs += 1

    for l in L:
        if l["cut"].any():
            soft = cv2.GaussianBlur(l["cut"].astype(np.float32), (0, 0), 0.8)
            l["rgba"][..., 3] = np.minimum(l["rgba"][..., 3], ((1 - soft) * 255).round().astype(np.uint8))
    return pairs


def main(src, dst, preview=None):
    psd = PSDImage.open(src)
    W, H = psd.width, psd.height
    layers = list(psd)
    bg_layer = next(l for l in layers if not l.is_group())
    bg = np.asarray(bg_layer.composite().convert("RGB"))  # full canvas

    groups = [(g.name, [h for h in g if h.width and h.height]) for g in layers if g.is_group()]
    L = load_layers(groups, bg)
    pairs = cut_layers(L)

    out = PSDImage.new("RGB", (W, H), color=(255, 255, 255))
    out._record.header.version = 2   # PSB
    PixelLayer.frompil(bg_layer.topil().convert("RGB"), out, bg_layer.name, bg_layer.top, bg_layer.left)
    k = 0
    for gname, hs in groups:
        grp = Group.new(out, gname, open_folder=False)
        for h in hs:
            l = L[k]; k += 1
            PixelLayer.frompil(Image.fromarray(l["rgba"], "RGBA"), grp, h.name, l["box"][1], l["box"][0])
    out.save(dst)

    if preview:
        sc = Image.fromarray(bg).convert("RGBA")
        for l in L:
            sc.alpha_composite(Image.fromarray(l["rgba"], "RGBA"), l["box"][:2])
        sc.convert("RGB").save(preview, quality=88)
    print(f"cut {sum(l['cut'].any() for l in L)} layers over {pairs} overlapping pairs -> {dst}")


if __name__ == "__main__":
    main(*sys.argv[1:4])
