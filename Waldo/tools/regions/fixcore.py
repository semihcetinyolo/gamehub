"""Manual core fixes after looking at the sheet (canvas px):
  python3 fixcore.py WORK add ID x0 y0 x1 y1     union the plain diff inside the box into ID's core (a missed head, a tail)
  python3 fixcore.py WORK carve ID cx cy rx ry   move the core pixels inside an ellipse into a new character (prints its id)
  python3 fixcore.py WORK keep ID x0 y0 x1 y1    keep only the core pixels inside the box (cut off a neighbour's tail)"""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__)); import marla_api as m
import numpy as np, cv2
from PIL import Image
from scipy import ndimage as ndi
W = sys.argv.pop(1); F = json.load(open(f'{W}/found.json')); C = {c['id']: c for c in F['chars']}
E = {e['id']: e for e in json.load(open(f'{W}/proj.json'))['edits']}
BG = np.asarray(Image.open(f'{W}/bg.png').convert('RGB')).astype(np.int16)
op, i = sys.argv[1], int(sys.argv[2]); c = C[i]
k = np.asarray(Image.open(f'{W}/cores/{i:03d}.png')) > 0
def save(cid, mask, x0, y0, base):
    ys, xs = np.nonzero(mask)
    Image.fromarray(mask[ys.min():ys.max() + 1, xs.min():xs.max() + 1].astype(np.uint8) * 255).save(f'{W}/cores/{cid:03d}.png')
    base['box'] = [int(x0 + xs.min()), int(y0 + ys.min()), int(x0 + xs.max() + 1), int(y0 + ys.max() + 1)]; base['area'] = int(mask.sum())
if op == 'add':
    b = [int(v) for v in sys.argv[3:7]]
    x0, y0 = min(b[0], c['box'][0]), min(b[1], c['box'][1]); x1, y1 = max(b[2], c['box'][2]), max(b[3], c['box'][3])
    U = np.zeros((y1 - y0, x1 - x0), bool); bx, by = c['box'][0] - x0, c['box'][1] - y0
    U[by:by + k.shape[0], bx:bx + k.shape[1]] = k
    e = E[c['edit']]; ox, oy = m.origin(e)
    pt = np.asarray(Image.open(f"{W}/patches/{c['edit']}.png").convert('RGB'))[b[1] - oy:b[3] - oy, b[0] - ox:b[2] - ox].astype(np.int16)
    d = cv2.GaussianBlur(np.abs(pt - BG[b[1]:b[3], b[0]:b[2]]).max(2).astype(np.float32), (0, 0), 1.5) > 30
    d = ndi.binary_opening(d, iterations=1)
    U[b[1] - y0:b[3] - y0, b[0] - x0:b[2] - x0] |= d
    U = ndi.binary_fill_holes(ndi.binary_closing(U, iterations=3))
    save(i, U, x0, y0, c)
elif op == 'carve':
    cx, cy, rx, ry = [int(v) for v in sys.argv[3:7]]
    yy, xx = np.mgrid[:k.shape[0], :k.shape[1]]
    el = ((xx + c['box'][0] - cx) / rx) ** 2 + ((yy + c['box'][1] - cy) / ry) ** 2 <= 1
    nid = max(C) + 1; n = dict(c, id=nid, flags=[])
    x0, y0 = c['box'][:2]
    save(nid, k & el, x0, y0, n); save(i, k & ~el, x0, y0, c)
    F['chars'].append(n); print('new', nid)
elif op == 'keep':
    b = [int(v) for v in sys.argv[3:7]]
    yy, xx = np.mgrid[:k.shape[0], :k.shape[1]]; xx = xx + c['box'][0]; yy = yy + c['box'][1]
    save(i, k & (xx >= b[0]) & (xx < b[2]) & (yy >= b[1]) & (yy < b[3]), c['box'][0], c['box'][1], c)
json.dump(F, open(f'{W}/found.json', 'w'), indent=1)
