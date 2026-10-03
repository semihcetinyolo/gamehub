"""Find places where a player can't tell whether two panes touch.

Ambiguous: two neighbouring panes share only a very short border (reads as a point touch), or two
panes that are NOT neighbours come very close (reads as touching).
python3 tools/stained/contacts.py [ids…]   (reads tools/stained/maps/*.json)
"""
import json
import sys
from collections import defaultdict
from pathlib import Path

import shapely
from shapely.geometry import LineString
from shapely.ops import nearest_points

MIN_SHARED = 0.28   # frame units; shorter shared borders read as a point touch (user, 2026-10-02)
MIN_GAP = 0.22


def problems(polys, adj, edges):
    from geom import thin_cuts, tip_cuts
    shared = defaultdict(float)
    for x1, y1, x2, y2, a, b in edges:
        shared[(min(a, b), max(a, b))] += ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5
    out = []
    for (a, b), length in shared.items():
        if length < MIN_SHARED:
            segs = [LineString([(e[0], e[1]), (e[2], e[3])]) for e in edges if {e[4], e[5]} == {a, b}]
            c = shapely.unary_union(segs).centroid
            out.append(('short', a, b, round(length, 2), (round(c.x, 2), round(c.y, 2))))
    for g in thin_cuts(polys, min_area=0.2, min_len=1.2):
        c = g.centroid
        out.append(('thin', -1, -1, round(g.length, 2), (round(c.x, 2), round(c.y, 2))))
    n = len(polys)
    tree = shapely.STRtree(polys)
    for a in range(n):
        for b in tree.query(polys[a].buffer(MIN_GAP)):
            b = int(b)
            if b <= a or b in adj[a]:
                continue
            d = polys[a].distance(polys[b])
            if d < MIN_GAP:
                p, q = nearest_points(polys[a], polys[b])
                out.append(('near', a, b, round(d, 2), (round((p.x + q.x) / 2, 2), round((p.y + q.y) / 2, 2))))
    return out


if __name__ == '__main__':
    sys.path.insert(0, str(Path(__file__).parent))
    from make_maps import region_polys
    HERE = Path(__file__).parent
    ids = sys.argv[1:] or sorted(p.stem for p in (HERE / 'maps').glob('*.json'))
    for id in ids:
        m = json.loads((HERE / 'maps' / f'{id}.json').read_text())['map']
        found = problems(region_polys(m), m['adj'], m['edges'])
        print(f'{id}: {len(found)}' + ('' if not found else '  ' + ' '.join(f'{k}{a}-{b}:{v}@{p}' for k, a, b, v, p in found[:8])))
