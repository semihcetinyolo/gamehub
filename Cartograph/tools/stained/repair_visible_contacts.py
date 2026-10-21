"""Resolve grey-zone contacts so perceived adjacency equals logical adjacency.

A grey-zone pair (see `visible_contacts.py`) always sits on a strip that is
thinner than the lead: a wedge where two seams meet at a shallow angle, or a
background line that runs almost along the rim/another seam. Inside such a
strip the colour is invisible, so any contact placed there is unreadable no
matter how long its polygon edge is.

Repair, per strip t of pane X (t = X minus its opening by rho, rho = half the
minimum readable pane width):

1. cut t off with the straight chord across its base, where X is still
   2*rho wide (a clean, readable T instead of a hairline wedge);
2. give the strip to one neighbour N of t by deleting the X|N seam along it.

Every neighbour is tried; the result must clear the grey-zone pair, add no new
one, pass the complete v4 geometry audit and keep every subject (clue focus)
seam. The smallest valid change wins. Outcomes are therefore either a visibly
long shared border or a visibly wide separation - never in between.
Stage under output/visible-contacts; publishing is a separate step.
"""
import argparse
import copy
import hashlib
import json
import math
import shutil
from collections import defaultdict
from pathlib import Path

from shapely.geometry import LineString, Point
from shapely.ops import linemerge, split, substring, unary_union

from audit_geometry import active_ids, fingerprint, inspect as geometry_inspect, VERSION
from contact_policy import from_lines
from make_maps import region_polys, shape_poly, color
from readable_junctions import renumber_variable, preserves_boundary
from visible_contacts import inspect, unit, SEAM_PX, CONTACT_PX

ROOT = Path(__file__).resolve().parents[2]
HERE = ROOT / 'tools/stained'
OUT = ROOT / 'output/visible-contacts'


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


def parts(g):
    return [q for q in getattr(g, 'geoms', [g]) if q.geom_type == 'Polygon' and not q.is_empty]


def extend(line, by=.001):
    (x, y), (u, v) = line.coords[0], line.coords[-1]
    dx, dy = u - x, v - y; length = (dx * dx + dy * dy) ** .5
    dx, dy = dx / length * by, dy / length * by
    return LineString([(x - dx, y - dy), (u + dx, v + dy)])


def strips(p, rho, near):
    """Parts of p narrower than 2*rho near a grey-zone point, with base chords."""
    opened = p.buffer(-rho).buffer(rho)
    found = []
    for t in parts(p.difference(opened.buffer(1e-7))):
        if t.area < 1e-6 or t.distance(near) > 3 * rho:
            continue
        arcs = t.boundary.difference(p.boundary.buffer(1e-5))
        arcs = linemerge(arcs) if arcs.geom_type == 'MultiLineString' else arcs
        chords = [LineString([a.coords[0], a.coords[-1]]) for a in getattr(arcs, 'geoms', [arcs])
                  if a.geom_type == 'LineString' and a.length > 1e-4]
        chords = [c for c in chords if c.length > 1e-4 and c.within(p.buffer(1e-4))]
        if not chords:
            continue
        pieces = [p]
        for c in chords:
            pieces = [g for piece in pieces for g in split(piece, extend(c)).geoms]
        tip = unary_union([g for g in pieces if g.intersection(t).area > .5 * g.area])
        if tip.is_empty or tip.area > .5 * p.area:
            continue
        found.append((tip, chords))
    return found


def network(m):
    graph = defaultdict(list)
    for e in [*m['edges'], *m['rim']]:
        p, q = tuple(e[:2]), tuple(e[2:4])
        if p != q:
            graph[p].append((q, tuple(e[4:]))); graph[q].append((p, tuple(e[4:])))
    return graph


def walk(graph, p, q, length):
    """Follow a seam from node p through q for `length`; stop at junctions."""
    path = [p, q]
    while sum(math.dist(u, v) for u, v in zip(path, path[1:])) < length:
        ahead = [v for v, _ in graph[path[-1]] if v != path[-2]]
        if len(ahead) != 1:
            break
        path.append(ahead[0])
    line = LineString(path)
    return line if line.length <= length else substring(line, 0, length)


def slides(m, issue, base):
    """Move a divider's end along the seam it meets, keeping the divider straight.

    For a short A|B border ending at T junctions, sliding the divider that
    closes it lengthens the border; sliding it the other way removes it.
    """
    kind, a, b, visible, _ = issue
    if kind != 'hidden-contact':
        return
    graph = network(m)
    border = [e for e in m['edges'] if set(e[4:]) == {a, b}]
    ends = defaultdict(int)
    for e in border:
        ends[tuple(e[:2])] += 1; ends[tuple(e[2:4])] += 1
    need = (CONTACT_PX - visible) * base / (CONTACT_PX + 2 * SEAM_PX) * 2
    for p, count in ends.items():
        if count != 1 or len(graph[p]) != 3:
            continue
        inward = next(q for q, owners in graph[p] if set(owners) == {a, b})
        others = [(q, owners) for q, owners in graph[p] if set(owners) != {a, b}]
        if len(others) != 2:
            continue
        for (div, downers), (thru, towners) in (others, others[::-1]):
            if len(downers) == 1:
                continue  # the rim is never moved
            for sign, target in ((1, thru), (-1, inward)):
                for delta in (need, need * 1.5, need * 2.2, need * 3):
                    track = walk(graph, p, target, delta + 1e-9)
                    if track.length < delta * .98:
                        continue
                    moved = track.interpolate(delta)
                    arm = walk(graph, p, div, max(.35, 4 * delta))
                    r = arm.coords[-1]
                    drop = arm.buffer(1e-4)
                    lines = [LineString([e[:2], e[2:4]]) for e in m['edges']
                             if not LineString([e[:2], e[2:4]]).within(drop)]
                    lines.append(extend(LineString([r, (moved.x, moved.y)])))
                    yield delta * (1 if sign > 0 else 1.2), downers, sign, lines, 0


def candidates(m, ps, issue, base):
    kind, a, b, _, at = issue
    near = Point(at)
    seen = set()
    if kind == 'small-pane':
        # A pane too small to see joins a neighbour (subject seams stay locked).
        for n in m['adj'][a]:
            lines = [LineString([e[:2], e[2:4]]) for e in m['edges'] if set(e[4:]) != {a, n}]
            yield ps[a].area, a, n, lines, -1
    for score, owners, sign, lines, delta in slides(m, issue, base):
        yield score, owners, sign, lines, delta
    # A background pane that is thin wherever it matters may dissolve whole
    # into a neighbour; immutable subject seams reject subject panes.
    for x in range(len(ps)):
        if ps[x].distance(near) < 2 * base:
            for n in m['adj'][x]:
                lines = [LineString([e[:2], e[2:4]]) for e in m['edges'] if set(e[4:]) != {x, n}]
                yield ps[x].area + .5, x, n, lines, -1
    # Try wider cuts too: a join must leave a border long enough to read.
    for x, rho in ((x, base * k) for k in (1, 1.3, 1.7, 2.2) for x in range(len(ps))):
        if ps[x].distance(near) > 6 * rho:
            continue
        for tip, chords in strips(ps[x], rho, near):
            for n in m['adj'][x]:
                if tip.boundary.intersection(ps[n].boundary).length < 1e-3:
                    continue
                key = (x, n, round(tip.area, 5))
                if key in seen:
                    continue
                seen.add(key)
                zone = tip.boundary.buffer(1e-4)
                drop = lambda e: set(e[4:]) == {x, n} and LineString([e[:2], e[2:4]]).within(zone)
                lines = [LineString([e[:2], e[2:4]]) for e in m['edges'] if not drop(e)]
                yield tip.area + .1 * sum(c.length for c in chords), x, n, lines + [extend(c) for c in chords], 0


def keep_colours(adj, sol, area):
    """Fix clashes with the fewest recoloured panes (by area) instead of recolouring the map.

    A clash is mended by giving one pane a free colour, or by a Kempe-chain swap
    of two colours; the cheapest wins. Falls back to a full colouring only when
    local moves cannot finish.
    """
    sol = list(sol)
    for _ in range(4 * len(sol)):
        clash = next(((i, j) for i, ns in enumerate(adj) for j in ns if i < j and sol[i] == sol[j]), None)
        if clash is None:
            return sol if len(set(sol)) == 4 else None
        best = None
        for r, partner in (clash, clash[::-1]):
            free = {0, 1, 2, 3} - {sol[n] for n in adj[r]}
            for c in free:
                if best is None or area[r] < best[0]:
                    best = (area[r], {r: c})
            for c in {0, 1, 2, 3} - {sol[r]}:
                a, chain, todo = sol[r], {r}, [r]
                while todo:
                    k = todo.pop()
                    for n in adj[k]:
                        if (k, n) == (r, partner):
                            continue  # the clashing edge itself is what the swap repairs
                        if n not in chain and sol[n] in (a, c):
                            chain.add(n); todo.append(n)
                trial = {k: (c if sol[k] == a else a) for k in chain}
                if any(trial.get(n, sol[n]) == trial[k] for k in chain for n in adj[k]):
                    continue
                cost = sum(area[k] for k in chain)
                if best is None or cost < best[0]:
                    best = (cost, trial)
        if best is None:
            return None
        for k, c in best[1].items():
            sol[k] = c
    return None


def closest_colouring(adj, wanted, area, start=None, seconds=8.0):
    """Proper 4-colouring that repaints the least glass area relative to `wanted`.

    Branch and bound, largest panes first, wanted colour tried first; `start`
    (any valid colouring) is the initial bound. Stops at the time limit with the
    best found.
    """
    import time
    n = len(adj); order = sorted(range(n), key=lambda r: -area[r])
    best = [sum(area[r] for r in range(n) if start[r] != wanted[r]) if start else float('inf'), list(start) if start else None]
    colour = [-1] * n; deadline = time.time() + seconds
    suffix = [0.0] * (n + 1)

    def go(k, cost):
        if cost >= best[0] or time.time() > deadline:
            return
        if k == n:
            if len(set(colour)) == 4:
                best[0], best[1] = cost, colour[:]
            return
        r = order[k]
        used = {colour[j] for j in adj[r] if colour[j] >= 0}
        for c in sorted({0, 1, 2, 3} - used, key=lambda c: c != wanted[r]):
            colour[r] = c
            go(k + 1, cost + (area[r] if c != wanted[r] else 0))
        colour[r] = -1
    go(0, 0.0)
    return best[1]


def local_recolour(adj, wanted, area, depth_limit=6, seconds=6.0):
    """Mend each clash by the cheapest exact recolouring of a small ball around it.

    Panes outside the ball keep their colour; the ball grows (graph distance
    1, 2, ...) until a proper colouring exists inside it.
    """
    import time
    col = list(wanted)
    for _ in range(len(adj)):
        clash = next(((i, j) for i, ns in enumerate(adj) for j in ns if i < j and col[i] == col[j]), None)
        if clash is None:
            return col if len(set(col)) == 4 else None
        solved = False
        for depth in range(1, depth_limit + 1):
            ball, frontier = set(clash), set(clash)
            for _ in range(depth - 1):
                frontier = {n for r in frontier for n in adj[r]} - ball; ball |= frontier
            order = sorted(ball, key=lambda r: -area[r]); best = [float('inf'), None]
            trial = dict(); deadline = time.time() + seconds

            def go(k, cost):
                if cost >= best[0] or time.time() > deadline:
                    return
                if k == len(order):
                    best[0], best[1] = cost, dict(trial); return
                r = order[k]
                used = {trial.get(j, col[j]) if j in ball else col[j] for j in adj[r] if j not in ball or j in trial}
                for c in sorted({0, 1, 2, 3} - used, key=lambda c: c != col[r]):
                    trial[r] = c
                    go(k + 1, cost + (area[r] if c != wanted[r] else 0))
                    del trial[r]
            go(0, 0.0)
            if best[1] is not None:
                for r, c in best[1].items():
                    col[r] = c
                solved = True
                break
        if not solved:
            return None
    return None


def anneal_colouring(adj, wanted, area, seed=20261021, steps=200000):
    """Min-conflicts annealing from the wanted colours: changed area + heavy clash penalty."""
    import random
    rand = random.Random(seed); n = len(adj); col = list(wanted)
    clash = lambda r, c: sum(col[j] == c for j in adj[r])
    best = None; temperature = 2.0
    for step in range(steps):
        bad = [r for r in range(n) if clash(r, col[r])]
        if not bad and len(set(col)) == 4:
            cost = sum(area[r] for r in range(n) if col[r] != wanted[r])
            if best is None or cost < best[0]:
                best = (cost, col[:])
            r = rand.randrange(n)
        else:
            r = rand.choice(bad) if bad else rand.randrange(n)
        options = []
        for c in range(4):
            delta = 50 * (clash(r, c) - clash(r, col[r])) + area[r] * ((c != wanted[r]) - (col[r] != wanted[r]))
            options.append((delta, c))
        delta, c = min(options, key=lambda o: (o[0], rand.random()))
        if delta <= 0 or rand.random() < math.exp(-delta / max(temperature, 1e-3)):
            col[r] = c
        temperature *= .99997
    return best[1] if best else None


def attempt(m, lines, immutable, delta=0):
    try:
        cm = from_lines(shape_poly(m), lines, m['cols'], m['rows'], merge=False).to_map()
    except (ValueError, RuntimeError, AssertionError):
        return None
    if cm['count'] != m['count'] + delta or not preserves_boundary(cm, immutable):
        return None
    return cm


def improves(cm, issues, reach, audit_before=0):
    """Fewer grey-zone pairs, none in a new place, and no more v4 audit issues.

    A map that already passes v4 must keep passing; a freshly rebuilt authored
    map starts with its tiny atoms listed and may only reduce them.
    """
    after = inspect(cm)
    if len(after) >= len(issues):
        return False
    old = [Point(i[4]) for i in issues]
    if any(min((Point(i[4]).distance(p) for p in old), default=1e9) > reach for i in after):
        return False
    return len(geometry_inspect(cm)) <= audit_before


def step(m, issues, rho, immutable, stuck):
    """Best single strip transfer; else a transfer whose side effect one more transfer clears.

    Issues that no candidate resolved are remembered in `stuck` and skipped
    until a later change happens near them.
    """
    ps = region_polys(m); reach = 4 * rho; audit_before = len(geometry_inspect(m))
    for issue in issues:
        if any(Point(issue[4]).distance(Point(p)) < 1e-3 for p in stuck):
            continue
        ranked = sorted(candidates(m, ps, issue, rho), key=lambda c: c[0])
        for score, x, n, lines, delta in ranked:
            cm = attempt(m, lines, immutable, delta)
            if cm and improves(cm, issues, reach, audit_before):
                return [(issue, x, n, score)], cm
        # Two neighbouring wedges (e.g. both sides of a shallow crossing) may
        # need to move together; the intermediate state is never kept alone.
        for score, x, n, lines, delta in ranked[:4]:
            cm = attempt(m, lines, immutable, delta)
            if not cm:
                continue
            cps = region_polys(cm)
            for follow in inspect(cm):
                if Point(follow[4]).distance(Point(issue[4])) > reach:
                    continue
                for score2, x2, n2, lines2, delta2 in sorted(candidates(cm, cps, follow, rho), key=lambda c: c[0])[:4]:
                    cm2 = attempt(cm, lines2, immutable, delta2)
                    if cm2 and improves(cm2, issues, reach, audit_before):
                        return [(issue, x, n, score), (follow, x2, n2, score2)], cm2
        stuck.append(issue[4])
    return None, None


def repair(info, immutable=None):
    m = copy.deepcopy(info['map']); sol = info['solution'][:]
    rho = (CONTACT_PX + 2 * SEAM_PX) * unit(m) / 2
    if immutable is None:
        focus = [w > 0 for w in info.get('clueFocus', {}).get('weights', [0] * m['count'])]
        immutable = unary_union([LineString([e[:2], e[2:4]]) for e in m['edges'] if focus[e[4]] or focus[e[5]]])
    history = []; stuck = []
    for _ in range(120):
        issues = inspect(m)
        if not issues:
            break
        moves, cm = step(m, issues, rho, immutable, stuck)
        if not moves:
            break
        changed = [Point(issue[4]) for issue, *_ in moves]
        stuck[:] = [p for p in stuck if min(Point(p).distance(c) for c in changed) > 8 * rho]
        cm, sol = renumber_variable(cm, m, sol)
        history += [dict(pair=issue[1:3], kind=issue[0], visiblePx=issue[3], at=issue[4], strip=x, givenTo=n,
                         area=round(score, 4)) for issue, x, n, score in moves]
        m = cm
    remaining = inspect(m)
    if history:
        # Keep the published colours (and so the glass) whenever they are still
        # a proper colouring; recolour only when a new border makes them clash.
        if any(sol[i] == sol[j] for i, ns in enumerate(m['adj']) for j in ns):
            areas = [p.area for p in region_polys(m)]
            start = keep_colours(m['adj'], sol, areas) or color(m['adj'], sol, areas, 20261021)
            local = local_recolour(m['adj'], sol, areas)
            change = lambda c: sum(a for a, x, y in zip(areas, c, sol) if x != y) if c else float('inf')
            start = min([start, local], key=change)
            sol = closest_colouring(m['adj'], sol, areas, start)
        for key in ['preferred', 'area', 'clearance']:
            m.pop(key, None)
        info.update(map=m, solution=sol, artworkNeedsRefresh=True)
        for key in ['given', 'difficulty', 'clueFocus']:
            info.pop(key, None)
        info['visibleContactRepair'] = dict(repairs=history, remaining=remaining,
                                            method='strips thinner than the lead cut at their base chord and given to one neighbour')
    issues = geometry_inspect(m)
    info['geometryQuality'] = dict(version=VERSION, valid=not issues, issues=issues, fingerprint=fingerprint(m))
    return info, dict(id=info['id'], repairs=len(history), remaining=remaining, geometryIssues=issues)


def main():
    parser = argparse.ArgumentParser(); parser.add_argument('ids', nargs='+')
    args = parser.parse_args(); snapshot()
    for n, ident in enumerate(active_ids(), 1):
        if ident not in args.ids:
            continue
        file = OUT / 'maps' / f'{ident}.json'
        info, row = repair(json.loads((OUT / 'before/maps' / file.name).read_text()))
        write(file, info); row['level'] = n
        print(json.dumps(row), flush=True)


if __name__ == '__main__':
    main()
