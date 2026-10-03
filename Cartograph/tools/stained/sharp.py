"""Every pane corner sharper than 40° that is not a corner of the panel itself.
python3 tools/stained/sharp.py [--sheet]   (sheet → /tmp/cg/sharp.png crops)"""
import json, math, sys
from pathlib import Path
from shapely.geometry import Point
sys.path.insert(0, str(Path(__file__).parent))
from make_maps import region_polys, shape_poly

def sharp(m, limit=40):
    ps = region_polys(m); rim = shape_poly(m).exterior
    hits = []
    for r, p in enumerate(ps):
        if p.geom_type != 'Polygon':
            continue
        ring = p.exterior
        for v in list(ring.coords)[:-1]:
            t = ring.project(Point(v))
            a = ring.interpolate((t - 0.25) % ring.length); b = ring.interpolate((t + 0.25) % ring.length)
            va = (a.x - v[0], a.y - v[1]); vb = (b.x - v[0], b.y - v[1])
            la, lb = math.hypot(*va), math.hypot(*vb)
            if la < 1e-6 or lb < 1e-6:
                continue
            ang = math.degrees(math.acos(max(-1, min(1, (va[0] * vb[0] + va[1] * vb[1]) / (la * lb)))))
            if ang < limit and p.contains(Point((a.x + b.x) / 2, (a.y + b.y) / 2)) and rim.distance(Point(v)) > 0.01:
                if not any(math.dist(v, h[1]) < 0.5 for h in hits):
                    hits.append((r, v, ang))
    return hits

if __name__ == '__main__':
    HERE = Path(__file__).parent
    crops = []
    for f in sorted((HERE / 'maps').glob('*.json')):
        h = sharp(json.loads(f.read_text())['map'])
        if h:
            print(f.stem, len(h), [(r, round(v[0], 1), round(v[1], 1), round(a)) for r, v, a in h])
            if '--sheet' in sys.argv:
                from PIL import Image, ImageDraw
                im = Image.open(HERE / 'guides' / f'{f.stem}.png').convert('RGB'); d = ImageDraw.Draw(im)
                for r, (x, y), a in h:
                    d.ellipse((x * 64 - 7, y * 64 - 7, x * 64 + 7, y * 64 + 7), outline=(255, 0, 255), width=3)
                    crops.append((f.stem, im.crop((int(x * 64) - 90, int(y * 64) - 90, int(x * 64) + 90, int(y * 64) + 90))))
    if crops:
        from PIL import Image, ImageDraw
        s = Image.new('RGB', (180 * 8, 196 * ((len(crops) + 7) // 8)), 'white'); d = ImageDraw.Draw(s)
        for i, (n, c) in enumerate(crops):
            s.paste(c, ((i % 8) * 180, (i // 8) * 196)); d.text(((i % 8) * 180 + 3, (i // 8) * 196 + 182), n, fill='black')
        s.save('/tmp/cg/sharp.png')
