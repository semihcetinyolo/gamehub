"""Wrong-board art: assets/wrong/src/wrong-lens.png (from Astra) → assets/wrong/wrong-lens.webp.

python3 tools/wrong/build_art.py
Prints where the lens circle sits in the picture; game.js (LENS) uses those fractions to put the
lens centre on the clashing border.
"""
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'assets' / 'wrong' / 'src' / 'wrong-lens.png'
OUT = ROOT / 'assets' / 'wrong' / 'wrong-lens.webp'
SIZE = 256

im = Image.open(SRC).convert('RGBA')
px = np.array(im)
px[px[:, :, 3] < 12] = 0  # stray specks around the object
a = px[:, :, 3]
H, W = a.shape
# The see-through lens: the transparent area enclosed by the rim, grown from the picture's middle-left.
start = next((x, H // 2) for x in range(W // 2, 0, -1) if a[H // 2, x] == 0)
seen = np.zeros_like(a, bool)
seen[start[1], start[0]] = True
q = deque([start])
while q:
    x, y = q.popleft()
    for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
        if 0 <= nx < W and 0 <= ny < H and not seen[ny, nx] and a[ny, nx] < 40:
            seen[ny, nx] = True
            q.append((nx, ny))
ys, xs = np.nonzero(seen)
assert xs.min() > 0 and ys.min() > 0, 'lens interior leaks to the edge'
cx, cy = xs.mean(), ys.mean()
top = next(y for y in range(int(cy)) if a[y, int(cx)] > 128)
Image.fromarray(px).resize((SIZE, SIZE), Image.LANCZOS).save(OUT, 'WEBP', quality=90, method=6)
print(f'{OUT.relative_to(ROOT)}: {OUT.stat().st_size // 1024} KB; '
      f'LENS = {{ cx: {cx / W:.3f}, cy: {cy / H:.3f}, r: {(cy - top) / H:.3f} }}')
