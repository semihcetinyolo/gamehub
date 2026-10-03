"""Check that each AI artwork paints every pane in the colour the puzzle's solution gives it.

python3 tools/stained/check_art.py [--fix] [ids…]   → per level: panes whose art colour disagrees.
--fix: when the artwork's own pane colours form a valid 4-colouring, adopt them as the solution
(and their averages as the palette), so what the player paints is exactly what the glass shows.
Also writes tools/stained/guides/<id>.check.png (guide | artwork) for a visual look.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import binary_erosion

sys.path.insert(0, str(Path(__file__).parent))
from generate_art import lab  # noqa: E402
from make_maps import region_polys  # noqa: E402

HERE = Path(__file__).parent
ROOT = HERE.parents[1]
S = 64


def check(id):
    info = json.loads((HERE / 'maps' / f'{id}.json').read_text())
    meta = json.loads((ROOT / 'assets' / 'glass' / f'{id}.json').read_text())
    m, sol, pal = info['map'], info['solution'], meta['palette']
    polys = region_polys(m)
    idx = Image.new('I', (12 * S, 16 * S), -1)
    d = ImageDraw.Draw(idx)
    for r in sorted(range(len(polys)), key=lambda r: -polys[r].area):
        for g in (polys[r].geoms if hasattr(polys[r], 'geoms') else [polys[r]]):
            d.polygon([(x * S, y * S) for x, y in g.exterior.coords], fill=r)
    idx = np.asarray(idx)
    art = np.asarray(Image.open(ROOT / 'assets' / 'glass' / f'{id}.webp').convert('RGB')).astype(float)
    medians = []
    for r in range(m['count']):
        mask = binary_erosion(idx == r, iterations=6)
        if mask.sum() < 30:
            mask = idx == r
        medians.append(np.median(art[mask], axis=0))
    hexes = ['#' + ''.join(f'{int(v):02x}' for v in c) for c in medians]
    pane_lab = np.array([lab(h) for h in hexes])
    centers = np.array([lab(h) for h in pal])
    for _ in range(12):  # k-means on pane colours, seeded with the guide palette
        got = [int(np.argmin(np.linalg.norm(centers - p, axis=1))) for p in pane_lab]
        for c in range(4):
            if any(g == c for g in got):
                centers[c] = np.median(pane_lab[[g == c for g in got]], axis=0)
    bad = [(r, sol[r], g) for r, g in enumerate(got) if g != sol[r]]
    valid = len(set(got)) == 4 and all(got[r] != got[j] for r in range(m['count']) for j in m['adj'][r])
    if FIX and bad and valid:
        info['solution'] = got
        (HERE / 'maps' / f'{id}.json').write_text(json.dumps(info, ensure_ascii=False, separators=(',', ':')))
        meta['palette'] = ['#' + ''.join(f'{int(v):02x}' for v in np.median(np.array(medians)[[g == c for g in got]], axis=0)) for c in range(4)]
        (ROOT / 'assets' / 'glass' / f'{id}.json').write_text(json.dumps(meta, ensure_ascii=False, indent=2) + '\n')
    guide = Image.open(HERE / 'guides' / f'{id}.png').resize((384, 512))
    im = Image.open(ROOT / 'assets' / 'glass' / f'{id}.webp').resize((384, 512))
    sheet = Image.new('RGB', (768, 512))
    sheet.paste(guide, (0, 0))
    sheet.paste(im, (384, 0))
    sheet.save(HERE / 'guides' / f'{id}.check.png')
    return m['count'], bad, valid


FIX = '--fix' in sys.argv
if __name__ == '__main__':
    ids = [a for a in sys.argv[1:] if a != '--fix'] or sorted(p.stem for p in (HERE / 'maps').glob('*.json'))
    for id in ids:
        if not (ROOT / 'assets' / 'glass' / f'{id}.webp').exists():
            print(f'{id}: no artwork yet')
            continue
        n, bad, valid = check(id)
        state = '' if not bad else ('  → art colouring is valid' + (', adopted' if FIX else '')) if valid else '  → art colouring CLASHES, regenerate'
        print(f'{id}: {n - len(bad)}/{n} panes match' + (f'  {bad}' if bad else '') + state)
