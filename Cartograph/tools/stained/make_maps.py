"""Build every stained-glass map, its 4-colouring and the colour guide sent to the image model.

python3 tools/stained/make_maps.py [ids…]
  → tools/stained/maps/<id>.json   (game map + solution + palette)
  → tools/stained/guides/<id>.png  (colour guide, 768×1024) and <id>.labels.png (pane colour index)
  → tools/stained/guides/sheet.png (contact sheet of every guide)
Legacy levels (flower, valley, butterfly) keep the maps from stained-levels.js so their artwork still lines up.
"""
import json
import math
import random
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw
from shapely.geometry import LineString, Polygon
from shapely.ops import polygonize, unary_union

sys.path.insert(0, str(Path(__file__).parent))
from designs import DESIGNS  # noqa: E402
from geom import Build  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).parent / 'maps'
GUIDES = Path(__file__).parent / 'guides'
S = 64  # px per frame unit → 768×1024

LEGACY = {}  # every level is built from designs.py now


def color(adj, preferred, area, seed):
    """A valid 4-colouring that keeps as many panes (weighted by size) in their wished colours."""
    n = len(adj)
    rand = random.Random(seed)
    pref = [p if isinstance(p, (tuple, list)) else (p,) for p in preferred]
    w = [min(6, max(0.6, a)) * (2 if len(p) == 1 else 1) for a, p in zip(area, pref)]
    sol = [-1] * n

    def pick():
        best, score = -1, -1
        for i in range(n):
            if sol[i] < 0:
                s = len({sol[j] for j in adj[i] if sol[j] >= 0}) * 100 + len(adj[i])
                if s > score:
                    best, score = i, s
        return best

    def bt():
        r = pick()
        if r < 0:
            return True
        for c in list(pref[r]) + [c for c in range(4) if c not in pref[r]]:
            if all(sol[j] != c for j in adj[r]):
                sol[r] = c
                if bt():
                    return True
        sol[r] = -1
        return False

    assert bt()

    def val(r, c):
        return w[r] * (2 if c == pref[r][0] else 1.4 if c in pref[r] else 0)

    cur = sol[:]
    score = sum(val(r, cur[r]) for r in range(n))
    best, best_score = cur[:], score
    iters = 60000
    for it in range(iters):
        T = 2.0 * (1 - it / iters) + 0.01
        r = rand.randrange(n)
        c = rand.randrange(4)
        if c == cur[r]:
            continue
        # Kempe chain of (cur[r], c) through r: swapping it keeps the colouring valid
        a = cur[r]
        chain, stack = {r}, [r]
        while stack:
            i = stack.pop()
            for j in adj[i]:
                if j not in chain and cur[j] in (a, c):
                    chain.add(j)
                    stack.append(j)
        delta = sum(val(i, c if cur[i] == a else a) - val(i, cur[i]) for i in chain)
        if delta >= 0 or rand.random() < math.exp(delta / T):
            for i in chain:
                cur[i] = c if cur[i] == a else a
            score += delta
            if score > best_score + 1e-9:
                best, best_score = cur[:], score
    assert all(best[i] != best[j] for i in range(n) for j in adj[i])
    return best


def path_poly(d):
    """Polygon of an SVG path made of M/L/C/Z commands (cubic curves sampled)."""
    toks = re.findall(r'[MLCZ]|-?\d*\.?\d+(?:e-?\d+)?', d)
    rings, pts, i, cmd = [], [], 0, None
    while i < len(toks):
        t = toks[i]
        if t in 'MLCZ':
            cmd = t
            i += 1
            if t == 'Z':
                rings.append(pts)
                pts = []
            elif t == 'M' and pts:
                rings.append(pts)
                pts = []
            continue
        if cmd in 'ML':
            pts.append((float(toks[i]), float(toks[i + 1])))
            i += 2
        elif cmd == 'C':
            c = [float(v) for v in toks[i:i + 6]]
            p0 = pts[-1]
            for k in range(1, 13):
                s = k / 12
                u = 1 - s
                pts.append((u ** 3 * p0[0] + 3 * u * u * s * c[0] + 3 * u * s * s * c[2] + s ** 3 * c[4],
                            u ** 3 * p0[1] + 3 * u * u * s * c[1] + 3 * u * s * s * c[3] + s ** 3 * c[5]))
            i += 6
    if pts:
        rings.append(pts)
    polys = [Polygon(r).buffer(0) for r in rings if len(r) >= 3]
    out = polys[0]
    for p in polys[1:]:
        out = out.symmetric_difference(p)
    return out


def region_polys(m):
    shape = shape_poly(m)
    return [path_poly(d).intersection(shape) for d in m['paths']]


def shape_poly(m):
    nums = [float(v) for v in re.findall(r'-?\d*\.?\d+', m['shape'])] if m.get('shape') else [0, 0, 12, 0, 12, 16, 0, 16]
    return Polygon(list(zip(nums[0::2], nums[1::2])))


def render(m, solution, palette, path):
    polys = region_polys(m)
    shape = shape_poly(m)
    order = sorted(range(len(polys)), key=lambda r: -polys[r].area)

    def px(cs):
        return [(x * S, y * S) for x, y in cs]

    img = Image.new('RGB', (12 * S, 16 * S), '#cfcfcf')
    lab = Image.new('L', (12 * S, 16 * S), 255)
    d, dl = ImageDraw.Draw(img), ImageDraw.Draw(lab)
    for r in order:
        geoms = polys[r].geoms if hasattr(polys[r], 'geoms') else [polys[r]]
        for g in geoms:
            d.polygon(px(g.exterior.coords), fill=palette[solution[r]])
            dl.polygon(px(g.exterior.coords), fill=solution[r] * 60)
    for x1, y1, x2, y2, *_ in m['edges']:
        d.line(px([(x1, y1), (x2, y2)]), fill='#161616', width=7, joint='curve')
    for x1, y1, x2, y2, *_ in m['edges']:
        for x, y in ((x1, y1), (x2, y2)):
            d.ellipse((x * S - 3, y * S - 3, x * S + 3, y * S + 3), fill='#161616')
    d.line(px(list(shape.exterior.coords)), fill='#161616', width=10, joint='curve')
    img.save(path)
    lab.save(path.with_suffix('.labels.png'))
    return img


def legacy(id):
    src = (ROOT / 'stained-levels.js').read_text()
    levels = json.loads(src[src.index('['):src.rindex(']') + 1])
    L = next(l for l in levels if l['id'] == id)
    return L['map'], L['solution']


def main(ids):
    OUT.mkdir(exist_ok=True)
    GUIDES.mkdir(exist_ok=True)
    for id in ids:
        issues = []
        if id in LEGACY:
            meta = LEGACY[id]
            m, solution = legacy(id)
            m = {k: v for k, v in m.items()}
            info = dict(id=id, name=meta['name'], scene=meta['scene'], palette=meta['palette'], legacy=True, keepArt=meta.get('keepArt', False))
        else:
            D = DESIGNS[id]
            lines, prefer, protect = D['build']()
            b = Build(D['outline'], lines, D['min_r'], max_area=D['max_area'], protect=protect, mirror_x=D['mirror_x']).run()
            issues = b.issues
            m = b.to_map(prefer)
            solution = color(m['adj'], m.pop('preferred'), m.pop('area'), 7)
            info = dict(id=id, name=D['name'], scene=D['scene'], palette=D['palette'])
        used = sorted(set(solution))
        if used != [0, 1, 2, 3]: print(f'!! {id}: colours used {used}')
        info.update(map=m, solution=solution)
        (OUT / f'{id}.json').write_text(json.dumps(info, ensure_ascii=False, separators=(',', ':')))
        render(m, solution, [h for _, h in info['palette']], GUIDES / f'{id}.png')
        cl = m.get('clearance')
        print(f"{id}: {m['count']} panes" + (f", min clearance {min(cl):.2f}" if cl else '') + (f", {len(issues)} unclear contacts {issues[:4]}" if issues else ''))


def sheet(ids):
    files = [GUIDES / f'{i}.png' for i in ids]
    cols = 6
    tw, th = 192, 256
    rows = (len(files) + cols - 1) // cols
    img = Image.new('RGB', (cols * tw, rows * (th + 18)), 'white')
    d = ImageDraw.Draw(img)
    for i, f in enumerate(files):
        im = Image.open(f).resize((tw - 8, th - 8))
        x, y = (i % cols) * tw, (i // cols) * (th + 18)
        img.paste(im, (x + 4, y + 4))
        d.text((x + 6, y + th), f.stem, fill='black')
    img.save(GUIDES / 'sheet.png')


if __name__ == '__main__':
    ids = sys.argv[1:] or [*LEGACY, *DESIGNS]
    main(ids)
    sheet([*LEGACY, *DESIGNS])
