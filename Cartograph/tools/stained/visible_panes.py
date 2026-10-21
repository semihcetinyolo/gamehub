"""A playable pane must remain visibly connected beneath the game's lead lines.

Measure at a 300 x 400 px board with the widest (3D) 3.2 px seams plus
0.8 px of readable interior on each side. Ignore only specks below 9 square px,
not substantial lobes. This is separate from mathematical polygon validity.
"""
from make_maps import region_polys


def metrics(m):
    unit = max(m['cols'] / 300, m['rows'] / 400)
    return unit * 2.4, 9 * unit * unit


def visible_parts(p, inset, minimum_area):
    core = p.buffer(-inset)
    return [q for q in getattr(core, 'geoms', [core])
            if q.geom_type == 'Polygon' and q.area >= minimum_area]


def pane_profile(p, inset, minimum):
    # The safety margin may erase a small but still visible island altogether.
    # Also inspect the actual 3D stroke footprint. Use the same 9 square px
    # significance threshold so raster-sized flecks do not become tiny panes.
    strict = (inset * 2 / 3, minimum)
    return strict if len(visible_parts(p, *strict)) > 1 else (inset, minimum)


def inspect(m, polys=None):
    inset, minimum = metrics(m)
    issues = []
    for r, p in enumerate(polys if polys is not None else region_polys(m)):
        parts = visible_parts(p, *pane_profile(p, inset, minimum))
        if len(parts) > 1:
            issues.append(('visually-disconnected', r, -1, len(parts),
                           tuple(parts[1].representative_point().coords)[0]))
    return issues
