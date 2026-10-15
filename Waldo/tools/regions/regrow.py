"""Grow character cores back to the whole character, and merge fragments of one character.

On a bg whose colours match the character (green frogs on grass) the shift-tolerant diff in detect.py
finds only pieces of each character. This takes the plain diff of the character's own patch near
its core, so the H layer later holds the whole character.

usage: python3 regrow.py WORKDIR [--merge a+b+c,d+e ...]   (merged pieces keep the first id)"""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import numpy as np, cv2
from PIL import Image
from scipy import ndimage as ndi
import marla_api as m

W = sys.argv[1]
merges = []
if '--merge' in sys.argv:
    merges = [[int(x) for x in g.split('+')] for g in sys.argv[sys.argv.index('--merge') + 1].split(',')]
F = json.load(open(f'{W}/found.json'))
C = {c['id']: c for c in F['chars']}
E = {e['id']: e for e in json.load(open(f'{W}/proj.json'))['edits']}
BG = np.asarray(Image.open(f'{W}/bg.png').convert('RGB')).astype(np.int16)
PAD, THR = 40, 40


OUT = {}  # id -> new core, written at the end


def core(c):
    return OUT[c['id']] if c['id'] in OUT else np.asarray(Image.open(f"{W}/cores/{c['id']:03d}.png")) > 0


def place(c, x0, y0, shape):
    """c's core in a canvas window starting at (x0, y0)."""
    out = np.zeros(shape, bool); k = core(c); bx, by = c['box'][0] - x0, c['box'][1] - y0
    ys, xs = slice(max(0, by), min(shape[0], by + k.shape[0])), slice(max(0, bx), min(shape[1], bx + k.shape[1]))
    out[ys, xs] = k[ys.start - by:ys.stop - by, xs.start - bx:xs.stop - bx]
    return out


for g in merges:
    cs = [C[i] for i in g]
    x0 = min(c['box'][0] for c in cs); y0 = min(c['box'][1] for c in cs)
    x1 = max(c['box'][2] for c in cs); y1 = max(c['box'][3] for c in cs)
    U = np.zeros((y1 - y0, x1 - x0), bool)
    for c in cs: U |= place(c, x0, y0, U.shape)
    OUT[g[0]] = U
    C[g[0]]['box'] = [x0, y0, x1, y1]
    for i in g[1:]: del C[i]

NEW = {}
for c in C.values():
    e = E[c['edit']]; px0, py0, px1, py1 = e['geometry']['paste']; ox, oy = m.origin(e)
    x0, y0, x1, y1 = c['box']
    wx0, wy0, wx1, wy1 = max(px0, x0 - PAD), max(py0, y0 - PAD), min(px1, x1 + PAD), min(py1, y1 + PAD)
    pt = np.asarray(Image.open(f"{W}/patches/{c['edit']}.png").convert('RGB'))[wy0 - oy:wy1 - oy, wx0 - ox:wx1 - ox].astype(np.int16)
    d = cv2.GaussianBlur(np.abs(pt - BG[wy0:wy1, wx0:wx1]).max(2).astype(np.float32), (0, 0), 1.5) > THR
    d = ndi.binary_closing(ndi.binary_opening(d, iterations=1), iterations=4)
    k = place(c, wx0, wy0, d.shape)
    lab, n = ndi.label(d | k)
    keep = np.unique(lab[k]); keep = keep[keep > 0]
    g = ndi.binary_fill_holes(np.isin(lab, keep))
    ys, xs = np.nonzero(g)
    NEW[c['id']] = g[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    c['box'] = [int(wx0 + xs.min()), int(wy0 + ys.min()), int(wx0 + xs.max() + 1), int(wy0 + ys.max() + 1)]
    c['area'] = int(g.sum())

for i, k in NEW.items():
    Image.fromarray(k.astype(np.uint8) * 255).save(f"{W}/cores/{i:03d}.png")
F['chars'] = list(C.values())
json.dump(F, open(f'{W}/found.json', 'w'), indent=1)
print('chars', len(C))
