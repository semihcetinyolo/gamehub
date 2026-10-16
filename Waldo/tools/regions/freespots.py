"""Find large empty rects for ONE combined fill round (instead of many 1-2 character regions).

python3 freespots.py WORK [N=3] [W=1200] [H=1000] [PAD=120]

Reads WORK/found.json (every detected character box) and WORK/bg.png, pads each box by PAD px,
then greedily picks up to N non-overlapping W x H rects with no character inside, preferring
spots far from existing characters. If a size does not fit, it retries at 85% until 600 px.
Prints the rects (paste them into the plan's fill regions) and writes WORK/freespots.jpg.
"""
import json, sys
import numpy as np
from PIL import Image, ImageDraw

W = sys.argv[1]
N = int(sys.argv[2]) if len(sys.argv) > 2 else 3
RW = int(sys.argv[3]) if len(sys.argv) > 3 else 1200
RH = int(sys.argv[4]) if len(sys.argv) > 4 else 1000
PAD = int(sys.argv[5]) if len(sys.argv) > 5 else 120
CELL = 16

bg = Image.open(f'{W}/bg.png').convert('RGB')
SW, SH = bg.size
gw, gh = (SW + CELL - 1) // CELL, (SH + CELL - 1) // CELL
occ = np.zeros((gh, gw), np.int32)
chars = json.load(open(f'{W}/found.json'))['chars']
for c in chars:
    x0, y0, x1, y1 = c['box']
    occ[max(0, (y0 - PAD) // CELL):(y1 + PAD) // CELL + 1, max(0, (x0 - PAD) // CELL):(x1 + PAD) // CELL + 1] = 1


def integral(a):
    return np.pad(a.cumsum(0).cumsum(1), ((1, 0), (1, 0)))


def window_sums(I, h, w):
    return I[h:, w:] - I[:-h, w:] - I[h:, :-w] + I[:-h, :-w]


picked = []
rw, rh = RW, RH
while len(picked) < N and min(rw, rh) >= 600:
    h, w = rh // CELL, rw // CELL
    if h > gh or w > gw:
        rw, rh = int(rw * .85), int(rh * .85); continue
    I = integral(occ)
    free = window_sums(I, h, w) == 0
    if not free.any():
        rw, rh = int(rw * .85), int(rh * .85); continue
    # clearance score: occupancy in a ring of `ring` cells around the window (lower is better)
    ring = 300 // CELL
    big = np.pad(occ, ring, constant_values=0)
    Ib = integral(big)
    around = window_sums(Ib, h + 2 * ring, w + 2 * ring)[:free.shape[0], :free.shape[1]]
    score = np.where(free, around, 1 << 30)
    y, x = np.unravel_index(score.argmin(), score.shape)
    r = (int(x * CELL), int(y * CELL), int(min(SW, (x + w) * CELL)), int(min(SH, (y + h) * CELL)))
    picked.append(r)
    occ[y:y + h, x:x + w] = 1  # the next rect must not overlap this one

im = bg.copy()
d = ImageDraw.Draw(im)
for c in chars:
    d.rectangle(c['box'], outline=(255, 0, 0), width=6)
for i, r in enumerate(picked):
    d.rectangle(r, outline=(0, 255, 0), width=14)
    d.text((r[0] + 20, r[1] + 20), f'F{i + 1}', fill=(0, 255, 0))
im.resize((1024, 1024 * SH // SW)).save(f'{W}/freespots.jpg', quality=85)
for i, r in enumerate(picked):
    print(f'F{i + 1}: {r}  ({r[2] - r[0]}x{r[3] - r[1]})')
if len(picked) < N:
    print(f'only {len(picked)} free rects of >= 600 px')
