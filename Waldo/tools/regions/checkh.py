"""Flag H layers with visible hard cuts: places where the layer's alpha falls from opaque to clear within a few
pixels while the layer's pixels differ strongly from the clean bg (a straight patch edge, a chopped tail, a flat-cut head).
usage: python3 checkh.py WORKDIR [MIN_PX]   -> prints flagged ids and writes WORKDIR/checkh.jpg (flagged spots, cut in red)"""
import json, sys
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi

W = sys.argv[1]; MIN = int(sys.argv[2]) if len(sys.argv) > 2 else 120
S = json.load(open(f'{W}/selection.json'))
BG = np.asarray(Image.open(f'{W}/bg.png').convert('RGB')).astype(np.int16)
comp = Image.open(f'{W}/composite.png').convert('RGB')
bad = []
for i, (x, y) in S['pos'].items():
    h = np.asarray(Image.open(f'{W}/H/{int(i):03d}.png'))
    rgb, a = h[..., :3].astype(np.int16), h[..., 3].astype(np.float32) / 255
    bg = BG[y:y + h.shape[0], x:x + h.shape[1]]
    differs = np.abs(rgb - bg).max(2) > 60
    hi = ndi.binary_dilation(a > 0.9, iterations=3)
    lo = a < 0.1
    cut = hi & lo & differs  # clear pixels right next to opaque ones, where the layer still shows something else than bg
    cut = ndi.binary_opening(cut, iterations=1)
    n = int(cut.sum())
    if n > MIN: bad.append((int(i), S['selected'][i], n, cut, (x, y)))
bad.sort(key=lambda b: -b[2])
print('flagged', [(i, k, n) for i, k, n, _, _ in bad])
if bad:
    f = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 18); cell, cols = 300, 6
    sh = Image.new('RGB', (cols * cell, ((len(bad) + cols - 1) // cols) * (cell + 22)), 'white'); d = ImageDraw.Draw(sh)
    for k, (i, kind, n, cut, (x, y)) in enumerate(bad):
        im = comp.crop((x, y, x + cut.shape[1], y + cut.shape[0]))
        red = Image.new('RGB', im.size, (255, 0, 0))
        im = Image.composite(red, im, Image.fromarray((ndi.binary_dilation(cut, iterations=1) * 160).astype(np.uint8)))
        im.thumbnail((cell - 4, cell - 4))
        X, Y = (k % cols) * cell, (k // cols) * (cell + 22); sh.paste(im, (X + 2, Y + 22)); d.text((X + 2, Y + 2), f'{i} {kind} {n}', fill=(200, 0, 0), font=f)
    sh.save(f'{W}/checkh.jpg', quality=88)
