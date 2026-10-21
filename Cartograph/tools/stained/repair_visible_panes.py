"""Split hidden necks into independently playable panes, preserving all contours.

Stage under a fresh snapshot. New cuts are straight, readable T-to-T seams
inside the existing pane, positioned beside the bottleneck rather than on a
microscopic throat. Existing subject boundaries are never bent or removed.
"""
import argparse
import copy
import hashlib
import json
import math
import shutil
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import numpy as np
import shapely
from shapely.geometry import LineString, MultiLineString, Point
from shapely.ops import nearest_points, split

from audit_geometry import active_ids, fingerprint, inspect as geometry_inspect, VERSION
from contact_policy import from_lines
from make_maps import region_polys, shape_poly, color
from readable_junctions import renumber_variable
from visible_panes import metrics, visible_parts, pane_profile, inspect

ROOT = Path(__file__).resolve().parents[2]
HERE = ROOT / 'tools/stained'
OUT = ROOT / 'output/visible-panes'


def write(file, data):
    file.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')))


def snapshot():
    if (OUT / 'before/manifest.json').exists():
        return
    for folder in ['before/maps', 'maps', 'reports', 'art', 'guides', 'review']:
        (OUT / folder).mkdir(parents=True, exist_ok=True)
    shutil.copy2(ROOT / 'stained-levels.js', OUT / 'before/stained-levels.js')
    text = (ROOT / 'stained-levels.js').read_text()
    levels = json.JSONDecoder().raw_decode(text[text.index('['):])[0]
    rows = []
    for n, level in enumerate(levels, 1):
        ident = level['id']; file = HERE / 'maps' / f'{ident}.json'
        for directory in ['before/maps', 'maps']:
            shutil.copy2(file, OUT / directory / file.name)
        rows.append(dict(level=n, id=ident, name=level['name'], image=level['image'],
                         hard=level.get('difficulty', {}).get('tier') == 'hard',
                         sha256=hashlib.sha256((ROOT / level['image']).read_bytes()).hexdigest(),
                         mapSha256=hashlib.sha256(file.read_bytes()).hexdigest()))
    write(OUT / 'before/manifest.json', rows)


def defect_count(polys, inset, minimum):
    return sum(max(0, len(visible_parts(p, *pane_profile(p, inset, minimum))) - 1) for p in polys)


def cuts_for(p, m):
    base_inset, base_minimum = metrics(m)
    inset, minimum = pane_profile(p, base_inset, base_minimum)
    cores = visible_parts(p, inset, minimum)
    # Adjacent eroded lobes locate a hidden throat. Try both sides of it;
    # a seam at the throat itself would have an unreadably short shared edge.
    probes = []
    for i, a in enumerate(cores):
        for b in cores[i + 1:]:
            q, t = nearest_points(a, b)
            probes.append((q.distance(t), q, t))
    # Long winding corridors need their actual throat, not a straight line
    # between distant cores (which may cross other panes). Triangulation exposes
    # internal cross-sections while retaining even subpixel connections.
    seen = set(); necks = []
    for triangle in shapely.constrained_delaunay_triangles(p).geoms:
        cs = list(triangle.exterior.coords)
        for a, b in zip(cs, cs[1:]):
            key = tuple(sorted((a, b)))
            if key in seen: continue
            seen.add(key); edge = LineString([a, b])
            if edge.length > inset * 2.5 or edge.length < 1e-7: continue
            mid = edge.interpolate(.5, normalized=True)
            if p.boundary.distance(mid) < 1e-7: continue
            vx, vy = b[0] - a[0], b[1] - a[1]
            extension = LineString([(a[0] - vx * .01, a[1] - vy * .01), (b[0] + vx * .01, b[1] + vy * .01)])
            pieces = list(split(p, extension).geoms)
            if len(pieces) == 2 and all(visible_parts(g, inset, minimum) for g in pieces):
                necks.append((edge.length, mid, -vy / edge.length, vx / edge.length))
    locations = []
    for length, mid, dx, dy in sorted(necks, key=lambda item: item[0]):
        if any(mid.distance(previous) < inset * 2 for previous in locations): continue
        locations.append(mid)
        probes.append((length, Point(mid.x - dx * inset, mid.y - dy * inset), Point(mid.x + dx * inset, mid.y + dy * inset)))
        if len(locations) >= 16: break
    before = defect_count([p], base_inset, base_minimum)
    candidates = []
    span = max(m['cols'], m['rows']) * 2
    for _, q, t in sorted(probes, key=lambda row: row[0]):
        dx, dy = t.x - q.x, t.y - q.y
        length = math.hypot(dx, dy)
        if length < 1e-8:
            continue
        dx, dy = dx / length, dy / length
        cx, cy = (q.x + t.x) / 2, (q.y + t.y) / 2
        for angle in [0, -.25, .25, -.5, .5]:
            ux, uy = dx * math.cos(angle) - dy * math.sin(angle), dx * math.sin(angle) + dy * math.cos(angle)
            for distance in np.linspace(0, max(.9, inset * 9), 28):
                for sign in ([1] if distance == 0 else [-1, 1]):
                    x, y = cx + ux * distance * sign, cy + uy * distance * sign
                    line = LineString([(x - uy * span, y + ux * span), (x + uy * span, y - ux * span)])
                    intersection = line.intersection(p)
                    # A ring may connect its lobes through two hidden necks.
                    # Both arms must be cut together to obtain independent panes.
                    segments = [g for g in getattr(intersection, 'geoms', [intersection]) if g.geom_type == 'LineString']
                    if len(segments) > 1 and all(g.length >= max(.30, inset * 3) for g in segments):
                        pieces = list(split(p, line).geoms)
                        after = defect_count(pieces, base_inset, base_minimum)
                        if 2 <= len(pieces) <= 4 and min(g.area for g in pieces) >= .16 and after < before:
                            extensions = []
                            for seg in segments:
                                a, b = seg.coords[0], seg.coords[-1]; vx, vy = b[0] - a[0], b[1] - a[1]
                                extensions.append(LineString([(a[0] - vx * .001, a[1] - vy * .001), (b[0] + vx * .001, b[1] + vy * .001)]))
                            candidates.append((after * 100 + sum(g.length for g in segments) + distance * 2, MultiLineString(segments), MultiLineString(extensions)))
                    for cut in getattr(intersection, 'geoms', [intersection]):
                        if cut.geom_type != 'LineString' or cut.length < max(.30, inset * 3):
                            continue
                        if cut.length > max(2.5, inset * 16) or cut.distance(Point(cx, cy)) > max(1.4, inset * 10):
                            continue
                        cs = list(cut.coords); a, b = cs[0], cs[-1]
                        vx, vy = b[0] - a[0], b[1] - a[1]
                        extended = LineString([(a[0] - vx * .001, a[1] - vy * .001),
                                               (b[0] + vx * .001, b[1] + vy * .001)])
                        pieces = list(split(p, extended).geoms)
                        if len(pieces) != 2 or min(g.area for g in pieces) < .16:
                            continue
                        after = defect_count(pieces, base_inset, base_minimum)
                        if after >= before:
                            continue
                        # Prefer a compact separator close to the neck. Avoid
                        # tiny secondary pieces and long cuts through the motif.
                        score = (after * 100 + cut.length + distance * 2)
                        candidates.append((score, cut, extended))
    return sorted(candidates, key=lambda item: item[0])


def broad_cuts_for(p, m):
    """Search winding passages when local throat directions are insufficient."""
    inset, minimum = metrics(m); before = defect_count([p], inset, minimum)
    x0, y0, x1, y1 = p.bounds; extent = max(x1-x0, y1-y0)
    candidates = []; seen = set()
    for angle in np.linspace(0, math.pi, 24, endpoint=False):
        ux, uy = math.cos(angle), math.sin(angle)
        for distance in np.linspace(-extent, extent, 150):
            x, y = (x0+x1)/2 + ux*distance, (y0+y1)/2 + uy*distance
            line = LineString([(x-uy*extent*3,y+ux*extent*3),(x+uy*extent*3,y-ux*extent*3)])
            cross = line.intersection(p)
            segs = [s for s in getattr(cross,'geoms',[cross]) if s.geom_type=='LineString' and s.length>=.30]
            for selected in [[s] for s in segs] + ([segs] if len(segs)>1 else []):
                key = tuple(tuple((round(x,2),round(y,2)) for x,y in s.coords) for s in selected)
                if key in seen: continue
                seen.add(key); extensions = []
                for s in selected:
                    a,b=s.coords[0],s.coords[-1];dx,dy=b[0]-a[0],b[1]-a[1]
                    extensions.append(LineString([(a[0]-dx*.001,a[1]-dy*.001),(b[0]+dx*.001,b[1]+dy*.001)]))
                pieces = [p]
                for ex in extensions: pieces = [g for part in pieces for g in split(part,ex).geoms]
                if len(pieces)<2 or len(pieces)>4 or min(g.area for g in pieces)<.12: continue
                after = defect_count(pieces,inset,minimum)
                if after>=before: continue
                cut = selected[0] if len(selected)==1 else MultiLineString(selected)
                extra = extensions[0] if len(extensions)==1 else MultiLineString(extensions)
                candidates.append((after*100+sum(s.length for s in selected),cut,extra))
    return sorted(candidates,key=lambda c:c[0])


def repair(info, broad=False):
    old = copy.deepcopy(info['map']); m = copy.deepcopy(old)
    sol = info['solution'][:]; history = []
    for iteration in range(45):
        defects = inspect(m)
        if not defects:
            break
        ps = region_polys(m); inset, minimum = metrics(m)
        baseline = defect_count(ps, inset, minimum)
        accepted = False
        for issue in defects:
            r = issue[1]
            for _, cut, extended in (broad_cuts_for(ps[r], m) if broad else cuts_for(ps[r], m)):
                # Lotus has two mirrored petals and a separate lower background
                # wedge. Never bisect that wedge to hide its disconnected halves.
                if info['id'] == 'lotus' and cut.geom_type == 'LineString' and abs(cut.coords[0][0] - 6) < .01 and abs(cut.coords[-1][0] - 6) < .01:
                    continue
                try:
                    lines = [LineString([e[:2], e[2:4]]) for e in m['edges']]
                    # The union grid nodes both incident edges identically.
                    cm = from_lines(shape_poly(m), lines + [extended], m['cols'], m['rows'], merge=False).to_map()
                    if not m['count'] < cm['count'] <= m['count'] + 3:
                        continue
                    if defect_count(region_polys(cm), inset, minimum) >= baseline:
                        continue
                    # Existing defects elsewhere are allowed during repair;
                    # all other geometry conditions must pass at each step.
                    if [e for e in geometry_inspect(cm) if e[0] != 'visually-disconnected']:
                        continue
                    cm, preference = renumber_variable(cm, m, sol)
                    history.append(dict(region=r, cut=[list(g.coords) for g in getattr(cut, 'geoms', [cut])], panesBefore=m['count']))
                    m, sol = cm, preference
                    accepted = True
                    break
                except (ValueError, RuntimeError, AssertionError):
                    continue
            if accepted:
                break
        if not accepted:
            break
    if history:
        sol = color(m['adj'], sol, [p.area for p in region_polys(m)], 20261020)
        for key in ['preferred', 'area', 'clearance']:
            m.pop(key, None)
        info.update(map=m, solution=sol, geometryRevision=7, artworkNeedsRefresh=True)
        for key in ['given', 'difficulty', 'clueFocus']:
            info.pop(key, None)
        previous = info.get('visiblePaneRepair', {})
        info['visiblePaneRepair'] = dict(repairs=previous.get('repairs', []) + history, panesBefore=previous.get('panesBefore', old['count']),
                                         method='straight separators beside hidden necks; original contours retained')
    issues = geometry_inspect(m)
    info['geometryQuality'] = dict(version=VERSION, valid=not issues, issues=issues, fingerprint=fingerprint(m))
    return info, dict(id=info['id'], cuts=len(history), remaining=inspect(m), geometryIssues=issues)


def repair_file(ident, broad=False):
    file = OUT / 'maps' / f'{ident}.json'
    info, row = repair(json.loads(file.read_text()), broad)
    write(file, info)
    return row


def main():
    parser = argparse.ArgumentParser(); parser.add_argument('ids', nargs='*'); parser.add_argument('--scan', action='store_true')
    parser.add_argument('--jobs', type=int, default=3)
    parser.add_argument('--broad', action='store_true')
    args = parser.parse_args(); snapshot(); report = []
    pending = []
    for n, ident in enumerate(active_ids(), 1):
        if args.ids and ident not in args.ids:
            continue
        file = OUT / 'maps' / f'{ident}.json'; info = json.loads(file.read_text())
        defects = inspect(info['map'])
        if args.scan:
            report.append(dict(level=n, id=ident, issues=defects))
            continue
        if not defects:
            continue
        pending.append((n, ident))
    if pending:
        with ProcessPoolExecutor(max_workers=args.jobs) as pool:
            futures = {pool.submit(repair_file, ident, args.broad): n for n, ident in pending}
            for future in as_completed(futures):
                row = future.result(); row['level'] = futures[future]
                report.append(row); print(json.dumps(row), flush=True)
    write(OUT / 'reports' / ('scan.json' if args.scan else 'repair.json'), report)
    if args.scan:
        print('Scanned', len(report), 'levels;', sum(bool(r['issues']) for r in report), 'affected')
    elif any(r.get('remaining') or r.get('geometryIssues') for r in report):
        raise SystemExit('Unresolved panes remain in staging; do not publish.')


if __name__ == '__main__':
    main()
