"""Rebuild a level from its authored lines instead of repairing an already damaged polygon.

Root cause of unnecessary bends and bumps (level 8 rabbit): when a background
ray ends close to a subject outline or the rim, the exact line arrangement has
a tiny atom (a sliver or a small triangle). The legacy builder merged every
such atom into the neighbour with the longest shared border - often the
subject - so a piece of the authored ear/body curve disappeared (a bump) and
the background ray gained a jog to reach the merged corner.

Here the authored lines are kept exactly (no atom merging). Tiny atoms and
grey-zone contacts are then resolved by `repair_visible_contacts`, whose
candidates may only move or remove background seams: every seam lying on the
authored subject is immutable. Pane identities follow the published map by
overlap, so solution and glass stay as close as possible.

python tools/stained/rebuild_authored.py rabbit
"""
import argparse
import json

from shapely import affinity
from shapely.geometry import LineString
from shapely.ops import unary_union

from audit_geometry import active_ids, fingerprint, inspect as geometry_inspect, VERSION
from contact_policy import from_lines
from designs import DESIGNS
from make_maps import color, region_polys
from readable_junctions import renumber_variable
from repair_visible_contacts import OUT, snapshot, write, repair, keep_colours, closest_colouring, local_recolour
from visible_contacts import inspect


def authored(ident, cols, rows):
    design = DESIGNS[ident]
    lines, _, focus = design['build']()
    scale = cols / 12
    lines = [affinity.scale(l, scale, scale, origin=(0, 0)) for l in lines]
    outline = affinity.scale(design['outline'], scale, scale, origin=(0, 0))
    focus = affinity.scale(focus, scale, scale, origin=(0, 0)) if focus is not None else None
    return outline, lines, focus


def rebuild(info):
    old = info['map']
    outline, lines, focus = authored(info['id'], old['cols'], old['rows'])
    m = from_lines(outline, lines, old['cols'], old['rows'], merge=False).to_map()
    m, sol = renumber_variable(m, old, info['solution'])
    zone = focus.buffer(.003) if focus is not None else None
    immutable = unary_union([LineString([e[:2], e[2:4]]) for e in m['edges']
                             if zone is not None and LineString([e[:2], e[2:4]]).within(zone)])
    before = inspect(m)
    staged = dict(info, map=m, solution=sol)
    staged, row = repair(staged, immutable)
    if not staged.get('visibleContactRepair'):
        # Keep the published colours (and so the glass) whenever they are still
        # a proper colouring; recolour only when a new border makes them clash.
        if any(sol[i] == sol[j] for i, ns in enumerate(m['adj']) for j in ns):
            areas = [p.area for p in region_polys(m)]
            start = keep_colours(m['adj'], sol, areas) or color(m['adj'], sol, areas, 20261021)
            local = local_recolour(m['adj'], sol, areas)
            change = lambda c: sum(a for a, x, y in zip(areas, c, sol) if x != y) if c else float('inf')
            start = min([start, local], key=change)
            sol = closest_colouring(m['adj'], sol, areas, start)
        staged.update(solution=sol, artworkNeedsRefresh=True)
        for key in ['given', 'difficulty', 'clueFocus']:
            staged.pop(key, None)
        staged['visibleContactRepair'] = dict(repairs=[], remaining=[])
    staged['visibleContactRepair'].update(rebuiltFromAuthored=True, panesBefore=old['count'],
                                          authoredIssues=before, immutableLength=round(immutable.length, 3))
    issues = geometry_inspect(staged['map'])
    staged['geometryQuality'] = dict(version=VERSION, valid=not issues, issues=issues, fingerprint=fingerprint(staged['map']))
    return staged, dict(row, rebuiltFrom=len(before), geometryIssues=issues)


def main():
    parser = argparse.ArgumentParser(); parser.add_argument('ids', nargs='+')
    args = parser.parse_args(); snapshot()
    for n, ident in enumerate(active_ids(), 1):
        if ident in args.ids:
            info = json.loads((OUT / 'before/maps' / f'{ident}.json').read_text())
            staged, row = rebuild(info)
            write(OUT / 'maps' / f'{ident}.json', staged); row['level'] = n
            print(json.dumps(row), flush=True)


if __name__ == '__main__':
    main()
