"""Perceived adjacency must equal logical adjacency.

The game draws lead over every seam, so the player never sees a pane's exact
polygon, only what is left beside the lead. Model that with mathematical
morphology at the normal 300 x 400 px fitted board (same scale as
`visible_panes.py`; large scenes at 2x zoom):

    core(P)    = P eroded by the lead radius r (3D seam: 1.6 px)
    visible(P) = core(P) dilated by r          (the morphological opening)

* Neighbours A, B (shared border S): the visible contact is the part of S with
  colour of both panes beside it, |S n visible(A) n visible(B)|. It must be at
  least CONTACT_PX. A clean right-angle T loses 2r, so 4 px matches the
  approved .28 canvas-unit border (7 px) without counting hidden wedges.
* Non-neighbours A, B: the visible separation dist(core A, core B) - 2r must be
  at least GAP_PX, the approved .22-unit (5.5 px) gap measured on what is seen.

Anything between 0 and the threshold is the grey zone in which a player cannot
tell "touching" from "not touching". A border hidden in a sliver thinner than
the lead (visible contact 0 although the polygons share a long edge) is the
worst case: logically adjacent, visually separate.

Every pane must also read as one sizeable piece of glass:
* its visible shape is a single component; a second fleck of colour beyond a
  hidden neck (even 4 square px) is a defect, not merely an ignorable speck;
* its visible area is at least PANE_PX square px (10 x 10 px at the fit).
"""
from collections import defaultdict

import shapely
from shapely.geometry import LineString
from shapely.ops import nearest_points, unary_union

from make_maps import region_polys

SEAM_PX = 1.6
CONTACT_PX = 4.0
GAP_PX = 5.5
FLECK_PX = 1.0
PANE_PX = 100.0


def unit(m):
    # Large 27 x 36 scenes are played zoomed in (the game says so on entry);
    # measure them at 2x, i.e. the same pane scale as a normal 12 x 16 level.
    fit = max(m['cols'] / 300, m['rows'] / 400)
    return fit / 2 if m['cols'] >= 27 and m['rows'] >= 36 else fit


def shared_lines(m):
    shared = defaultdict(list)
    for x, y, u, v, a, b in m['edges']:
        shared[tuple(sorted((a, b)))].append(LineString([(x, y), (u, v)]))
    return {pair: unary_union(lines) for pair, lines in shared.items()}


def inspect(m, polys=None):
    """Return (kind, a, b, visible px, (x, y)) for every grey-zone pair."""
    u = unit(m); r = SEAM_PX * u
    ps = polys if polys is not None else region_polys(m)
    cores = [p.buffer(-r) for p in ps]
    seen = [c.buffer(r + .002) for c in cores]
    issues = []
    for (a, b), line in shared_lines(m).items():
        visible = line.intersection(seen[a]).intersection(seen[b]).length
        if visible < CONTACT_PX * u:
            c = line.centroid
            issues.append(('hidden-contact', a, b, round(visible / u, 2), (round(c.x, 3), round(c.y, 3))))
    for i, core in enumerate(cores):
        pieces = sorted((g.buffer(r) for g in getattr(core, 'geoms', [core]) if not g.is_empty), key=lambda g: -g.area)
        if not pieces or pieces[0].area < PANE_PX * u * u:
            c = ps[i].representative_point()
            issues.append(('small-pane', i, -1, round(pieces[0].area / u / u if pieces else 0, 1), (round(c.x, 3), round(c.y, 3))))
        for g in pieces[1:]:
            if g.area >= FLECK_PX * u * u:
                c = g.centroid
                issues.append(('visible-fleck', i, -1, round(g.area / u / u, 1), (round(c.x, 3), round(c.y, 3))))
    tree = shapely.STRtree(cores)
    for a, core in enumerate(cores):
        if core.is_empty:
            continue
        for b in tree.query(core.buffer(2 * r + GAP_PX * u)):
            b = int(b)
            if b <= a or b in m['adj'][a] or cores[b].is_empty:
                continue
            gap = core.distance(cores[b]) - 2 * r
            if gap < GAP_PX * u:
                p, q = nearest_points(core, cores[b])
                issues.append(('hidden-gap', a, b, round(gap / u, 2), (round((p.x + q.x) / 2, 3), round((p.y + q.y) / 2, 3))))
    return issues


if __name__ == '__main__':
    import json
    import sys
    from pathlib import Path
    root = Path(__file__).resolve().parents[2]
    text = (root / 'stained-levels.js').read_text()
    levels = json.JSONDecoder().raw_decode(text[text.index('['):])[0]
    wanted = sys.argv[1:]; total = affected = 0
    for n, level in enumerate(levels, 1):
        if wanted and level['id'] not in wanted and str(n) not in wanted:
            continue
        found = inspect(level['map']); total += len(found); affected += bool(found)
        if found:
            print(n, level['id'], len(found), ' '.join(f'{k[7:]}{a}-{b}:{v}px' for k, a, b, v, _ in found[:8]))
    print(f'{total} grey-zone pairs in {affected} levels')
