"""Stained-glass map geometry: design linework → polygonized panes → game map JSON.

Every design lives in a 12×16 frame (y down). Lines are cut against the outline with
shapely.polygonize; tiny panes are merged away and any spot where two panes meet only at a
point gets a small round lead knot so they share a real border (players read a point touch as
adjacency). Final panes are unions of polygonize atoms, so shared borders stay bit-identical.
"""
import math
import random
from collections import Counter, defaultdict

import shapely
from shapely import affinity
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import linemerge, polygonize, polylabel, substring, unary_union

W, H = 12, 16
STEP = 0.2  # curve sampling (frame units)
GRID = 0.001


# ---------- primitives ----------
def _n(length):
    return max(8, int(math.ceil(length / STEP)))


def circle(cx, cy, r, n=None):
    n = n or _n(2 * math.pi * r)
    pts = [(cx + r * math.cos(2 * math.pi * i / n), cy + r * math.sin(2 * math.pi * i / n)) for i in range(n)]
    return LineString(pts + [pts[0]])


def disk(cx, cy, r):
    return Polygon(circle(cx, cy, r).coords)


def ellipse(cx, cy, rx, ry, rot=0, n=None):
    n = n or _n(math.pi * (rx + ry))
    c, s = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    pts = []
    for i in range(n + 1):
        t = 2 * math.pi * i / n
        x, y = rx * math.cos(t), ry * math.sin(t)
        pts.append((cx + x * c - y * s, cy + x * s + y * c))
    pts[-1] = pts[0]
    return LineString(pts)


def arc(cx, cy, r, a0, a1):
    """Arc from angle a0 to a1 (degrees, y down so +angle turns clockwise on screen)."""
    n = _n(abs(math.radians(a1 - a0)) * r)
    return LineString([(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)), cy + r * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)])


def seg(*pts):
    return LineString(pts)


def bez(p0, p1, p2, p3):
    length = math.dist(p0, p1) + math.dist(p1, p2) + math.dist(p2, p3)
    n = _n(length)
    out = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        out.append(tuple(u ** 3 * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t ** 3 * p3[k] for k in (0, 1)))
    return LineString(out)


def spline(pts, closed=False, tension=0.5):
    """Catmull-Rom curve through pts."""
    pts = [tuple(p) for p in pts]
    if closed:
        ext = [pts[-1]] + pts + [pts[0], pts[1]]
    else:
        ext = [pts[0]] + pts + [pts[-1]]
    out = []
    for i in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[i - 1], ext[i], ext[i + 1], ext[i + 2]
        n = _n(math.dist(p1, p2))
        for j in range(n):
            t = j / n
            t2, t3 = t * t, t * t * t
            out.append(tuple(
                0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)
                for k in (0, 1)))
    out.append(pts[0] if closed else pts[-1])
    return LineString(out)


def wave(y, amp, period, phase=0, x0=-1, x1=W + 1):
    n = _n(x1 - x0) * 2
    return LineString([(x0 + (x1 - x0) * i / n, y + amp * math.sin(2 * math.pi * ((x0 + (x1 - x0) * i / n) / period) + phase)) for i in range(n + 1)])


def petal(base, angle, length, width, bulge=0.5):
    """Pointed leaf/petal from base outward at angle (deg); two mirrored curves."""
    a = math.radians(angle)
    ux, uy, nx, ny = math.cos(a), math.sin(a), -math.sin(a), math.cos(a)
    bx, by = base
    tip = (bx + ux * length, by + uy * length)
    def side(sg):
        c1 = (bx + ux * length * (bulge - .25) + nx * width * sg, by + uy * length * (bulge - .25) + ny * width * sg)
        c2 = (bx + ux * length * (bulge + .3) + nx * width * sg * .9, by + uy * length * (bulge + .3) + ny * width * sg * .9)
        return bez(base, c1, c2, tip)
    return [side(1), side(-1)]


def petal_poly(base, angle, length, width, bulge=0.5):
    a, b = petal(base, angle, length, width, bulge)
    return Polygon(list(a.coords) + list(b.coords)[::-1])


def ray(c, angle, length, start=0):
    a = math.radians(angle)
    return seg((c[0] + start * math.cos(a), c[1] + start * math.sin(a)), (c[0] + length * math.cos(a), c[1] + length * math.sin(a)))


def rot(g, angle, origin=(6, 8)):
    return affinity.rotate(g, angle, origin=origin)


def mirror(g, x=6):
    return affinity.scale(g, -1, 1, origin=(x, 0))


def sym(lines, x=6):
    """lines plus their mirror image about x."""
    return list(lines) + [mirror(l, x) for l in lines]


def radial(geoms, n, origin=(6, 8), offset=0):
    out = []
    for i in range(n):
        for g in geoms:
            out.append(rot(g, offset + 360 * i / n, origin))
    return out


def reg_polygon(cx, cy, r, n, start=-90):
    return [(cx + r * math.cos(math.radians(start + 360 * i / n)), cy + r * math.sin(math.radians(start + 360 * i / n))) for i in range(n)]


def star(cx, cy, r1, r2, n, start=-90):
    pts = []
    for i in range(2 * n):
        r = r1 if i % 2 == 0 else r2
        a = math.radians(start + 180 * i / n)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return LineString(pts + [pts[0]])


def ring(pts):
    pts = [tuple(p) for p in pts]
    return LineString(pts + [pts[0]])


def clipout(lines, *polys):
    """Drop the parts of lines that run inside any of polys (their outlines stay as lead)."""
    hole = unary_union([p.buffer(0.01) for p in polys])
    out = []
    for l in lines:
        g = l.difference(hole)
        out += [p for p in (g.geoms if hasattr(g, 'geoms') else [g]) if not p.is_empty and p.length > 0.05]
    return out


def poly_of(*lines):
    """Polygon enclosed by consecutive curves (each continuing where the previous ended)."""
    pts = []
    for l in lines:
        cs = list(l.coords)
        pts += cs if not pts else cs[1:]
    return Polygon(pts).buffer(0)


# ---------- outlines ----------
def o_circle(r=6, cy=8):
    return Polygon(circle(6, cy, r).coords)


def o_oval(rx=6, ry=8):
    return Polygon(ellipse(6, 8, rx, ry).coords)


def o_round_arch(spring=6):
    """Rectangle with a semicircular top; spring = y of the arch centre."""
    pts = [(12, 16), (0, 16), (0, spring)] + list(arc(6, spring, 6, 180, 360).coords)[1:]
    return Polygon(pts)


def o_gothic(spring=10.4):
    """Pointed (equilateral-style) arch: two arcs of radius 12 springing at y=spring."""
    left = arc(12, spring, 12, 180, 240)
    right = arc(0, spring, 12, 300, 360)
    pts = [(12, 16), (0, 16)] + list(left.coords) + list(right.coords)[1:]
    return Polygon(pts).buffer(0)


def o_hex(pointy=True):
    if pointy:
        return Polygon([(6, 0.2), (12, 4.1), (12, 11.9), (6, 15.8), (0, 11.9), (0, 4.1)])
    return Polygon(reg_polygon(6, 8, 6.9, 6, 0)).intersection(Polygon([(0, 0), (12, 0), (12, 16), (0, 16)]))


def o_octagon(c=3.2):
    return Polygon([(c, 0), (12 - c, 0), (12, c), (12, 16 - c), (12 - c, 16), (c, 16), (0, 16 - c), (0, c)])


def o_diamond():
    return Polygon([(6, 0), (12, 8), (6, 16), (0, 8)])


def o_shield():
    pts = [(0, 0.6), (3, 0), (6, 0.9), (9, 0), (12, 0.6), (12, 8)]
    pts += list(bez((12, 8), (12, 12.5), (8.5, 14.5), (6, 16)).coords)[1:]
    pts += list(bez((6, 16), (3.5, 14.5), (0, 12.5), (0, 8)).coords)[1:]
    return Polygon(pts)


def o_heart():
    pts = []
    n = 220
    for i in range(n):
        t = 2 * math.pi * i / n
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((6 + x * 0.372, 7.2 - y * 0.47))
    return Polygon(pts).buffer(0)


def o_drop(up=True):
    cy, r = 10.2, 5.8
    a = math.degrees(math.asin(r / (cy - 0.0)))
    # tangent points from apex (6,0)
    d = cy
    t = math.degrees(math.acos(r / d))
    pts = [(6, 0)] + list(arc(6, cy, r, -90 + t, 270 - t).coords)
    poly = Polygon(pts)
    return poly if up else affinity.scale(poly, 1, -1, origin=(6, 8))


def o_quatrefoil():
    return unary_union([disk(6, 4.6, 3.6), disk(6, 11.4, 3.6), disk(2.7, 8, 3.3), disk(9.3, 8, 3.3), disk(6, 8, 4)]).simplify(0.002)


def o_scallop(n=12, r=5.1, rr=1.15, cy=8):
    parts = [disk(6, cy, r)] + [disk(6 + r * math.cos(2 * math.pi * i / n), cy + r * math.sin(2 * math.pi * i / n), rr) for i in range(n)]
    return unary_union(parts).simplify(0.002)


def o_egg():
    pts = []
    for i in range(240):
        t = 2 * math.pi * i / 240
        y = -math.cos(t)
        x = math.sin(t) * (1 - 0.18 * y)
        pts.append((6 + 5.9 * x / 1.0 * (0.98), 8.6 + 7.3 * y))
    return Polygon(pts).buffer(0)


# ---------- pipeline ----------
def _snap(g):
    return shapely.set_precision(g, GRID)


def _atoms(outline, lines, knots):
    work = [outline.exterior] + [l for l in lines] + [circle(x, y, r, 20) for x, y, r, _ in knots]
    noded = unary_union([_snap(l) for l in work])
    noded = linemerge(noded) if noded.geom_type == 'MultiLineString' else noded
    parts = list(noded.geoms) if hasattr(noded, 'geoms') else [noded]
    parts = [p.simplify(0.012) for p in parts]
    noded = _snap(unary_union(parts))
    atoms = [_snap(p) for p in polygonize(noded)]
    atoms = [a for a in atoms if a.area > 1e-7 and a.is_valid and a.intersection(outline).area > 0.5 * a.area]
    return atoms


def close_dangles(outline, lines, reach=3.0):
    """Extend every loose line end along its direction until it meets another lead line."""
    noded = unary_union([_snap(l) for l in [outline.exterior] + list(lines)])
    pieces = list(noded.geoms) if hasattr(noded, 'geoms') else [noded]
    deg = Counter()
    for p in pieces:
        cs = p.coords
        deg[cs[0]] += 1
        deg[cs[-1]] += 1
    extra = []
    for p in pieces:
        if p.length < 0.1:  # overshoot past a crossing line, not a loose end
            continue
        cs = list(p.coords)
        for end, prev in ((cs[0], cs[1]), (cs[-1], cs[-2])):
            if deg[end] != 1:
                continue
            dx, dy = end[0] - prev[0], end[1] - prev[1]
            l = math.hypot(dx, dy) or 1
            probe = LineString([end, (end[0] + dx / l * reach, end[1] + dy / l * reach)])
            hit = probe.intersection(noded)
            pts = [g for g in (hit.geoms if hasattr(hit, 'geoms') else [hit]) if not g.is_empty]
            cands = []
            for g in pts:
                for c in (g.coords if g.geom_type == 'Point' else [g.coords[0], g.coords[-1]]):
                    d = math.dist(c, end)
                    if d > 1e-4:
                        cands.append((d, c))
            if cands:
                d, c = min(cands)
                ext = 0.02 / max(d, 1e-6)
                extra.append(LineString([end, (c[0] + (c[0] - end[0]) * ext, c[1] + (c[1] - end[1]) * ext)]))
    return list(lines) + extra


def _cut(poly, rand):
    """A gently curved lead line across a big pane, roughly perpendicular to its long side."""
    mrr = list(poly.minimum_rotated_rectangle.exterior.coords)
    e1 = (mrr[1][0] - mrr[0][0], mrr[1][1] - mrr[0][1])
    e2 = (mrr[2][0] - mrr[1][0], mrr[2][1] - mrr[1][1])
    long, short = (e1, e2) if math.hypot(*e1) >= math.hypot(*e2) else (e2, e1)
    L, Sh = math.hypot(*long), math.hypot(*short)
    ux, uy = long[0] / L, long[1] / L
    a = math.radians(rand.uniform(-12, 12))
    vx, vy = -uy * math.cos(a) - ux * math.sin(a), ux * math.cos(a) - uy * math.sin(a)
    c = polylabel(poly, 0.05)
    t = rand.uniform(-0.08, 0.08) * L
    px, py = c.x + ux * t, c.y + uy * t
    bend = rand.uniform(-0.15, 0.15) * Sh
    R = Sh + L
    curve = bez((px - vx * R, py - vy * R), (px - vx * R / 3 + ux * bend, py - vy * R / 3 + uy * bend),
                (px + vx * R / 3 + ux * bend, py + vy * R / 3 + uy * bend), (px + vx * R, py + vy * R))
    piece = curve.intersection(poly)
    parts = [g for g in (piece.geoms if hasattr(piece, 'geoms') else [piece]) if g.geom_type == 'LineString' and g.length > 0.2]
    if not parts:
        return None
    best = min(parts, key=lambda g: g.distance(Point(px, py)))
    cs = list(best.coords)
    def stretch(a, b):
        d = math.dist(a, b) or 1
        return (a[0] + (a[0] - b[0]) / d * 0.03, a[1] + (a[1] - b[1]) / d * 0.03)
    return LineString([stretch(cs[0], cs[1])] + cs[1:-1] + [stretch(cs[-1], cs[-2])])


def subdivide(outline, lines, max_area, seed=1, protect=None, mirror_x=None):
    """Split every pane larger than max_area with a lead cut until none is left.
    Panes inside `protect` (the picture's subject) are never cut."""
    rand = random.Random(seed)
    lines = list(lines)
    keep = protect.buffer(0.05) if protect is not None else None
    for _ in range(40):
        big = [a for a in _atoms(outline, lines, []) if a.area > max_area and not (keep is not None and keep.contains(a.representative_point()))]
        if not big:
            break
        done = []
        for a in big:
            if mirror_x is not None and any(m.intersection(a).area > 0.5 * a.area for m in done):
                continue  # its mirror image was cut already, with the mirrored lead
            c = _cut(a, rand)
            if c is not None:
                lines.append(c)
                if mirror_x is not None:  # symmetric designs keep their symmetry
                    lines.append(affinity.scale(c, -1, 1, origin=(mirror_x, 0)))
                    done.append(affinity.scale(a, -1, 1, origin=(mirror_x, 0)))
    return lines


def _pieces(outline, lines):
    net = _snap(unary_union([_snap(l) for l in [outline.exterior] + list(lines)]))
    merged = linemerge(net) if net.geom_type == 'MultiLineString' else net
    out = list(merged.geoms) if hasattr(merged, 'geoms') else [merged]
    return [p for p in out if p.length > 2e-3]


def _falloff(t):
    return 0.5 * (1 + math.cos(math.pi * t)) if t < 1 else 0.0


def _drag(oriented, new_start):
    """Move the start of a lead to new_start, bending only its first stretch (smooth falloff)."""
    line = shapely.segmentize(LineString(oriented), 0.08)
    cs = list(line.coords)
    dx, dy = new_start[0] - cs[0][0], new_start[1] - cs[0][1]
    R = min(max(0.8, 2.5 * math.hypot(dx, dy)), 0.85 * line.length)
    out, s = [], 0.0
    for i, (x, y) in enumerate(cs):
        if i:
            s += math.dist(cs[i - 1], cs[i])
        w = _falloff(s / R) if R > 0 else 0
        out.append((x + dx * w, y + dy * w))
    out[0] = new_start
    return out


def steepen(outline, lines, min_angle=50, flat=0.32):
    """Where a lead runs into another one at a shallow angle the wedge between them ends in a
    sharp point (user, 2026-10-03: "a tip — does it touch or not?"). Bend the last stretch of the
    shallow lead so it meets the other one squarely; the wedge then ends on a short flat border."""
    rim = outline.exterior
    rim_zone = rim.buffer(2e-3)
    pieces = _pieces(outline, lines)
    deg = Counter()
    for p in pieces:
        deg[p.coords[0]] += 1
        deg[p.coords[-1]] += 1
    ends = defaultdict(list)  # joint -> [(piece index, coords oriented away from the joint)]
    for i, p in enumerate(pieces):
        cs = list(p.coords)
        if cs[0] == cs[-1]:
            continue
        ends[cs[0]].append((i, cs))
        ends[cs[-1]].append((i, cs[::-1]))

    def heading(cs, d=0.2):
        l = LineString(cs)
        q = l.interpolate(min(d, l.length * 0.5))
        return math.atan2(q.y - cs[0][1], q.x - cs[0][0])

    out = {i: p for i, p in enumerate(pieces)}
    changed = set()
    for w, inc in ends.items():
        if len(inc) < 3 and rim.distance(Point(w)) > 2e-3:
            continue
        hs = [(heading(cs), i, cs) for i, cs in inc]
        if rim.distance(Point(w)) <= 2e-3:  # the rim counts as two leads at a rim joint
            t = rim.project(Point(w))
            for dt in (-0.3, 0.3):
                q = rim.interpolate((t + dt) % rim.length)
                hs.append((math.atan2(q.y - w[1], q.x - w[0]), -1, None))
        hs.sort()
        for k in range(len(hs)):
            a, b = hs[k], hs[(k + 1) % len(hs)]
            gap = (b[0] - a[0]) % (2 * math.pi)
            if math.degrees(gap) >= min_angle or gap < 1e-6:
                continue
            # bend whichever of the two is an interior lead not touched yet (prefer the shorter)
            opts = [x for x in (a, b) if x[1] >= 0 and x[1] not in changed and not pieces[x[1]].within(rim_zone)]
            if not opts:
                continue
            e = min(opts, key=lambda x: pieces[x[1]].length)
            f = b if e is a else a
            el = LineString(e[2])
            sin = max(math.sin(gap), 0.1)
            dist = min(flat / sin, el.length * 0.45, 1.6)
            if dist < 0.15:
                continue
            q = el.interpolate(dist)
            if f[1] >= 0:
                fl = LineString(f[2])
            else:
                fl = LineString([w, (w[0] + math.cos(f[0]) * 3, w[1] + math.sin(f[0]) * 3)])
                fl = rim
            r = fl.interpolate(fl.project(q))
            if math.dist((r.x, r.y), w) < 0.05 or math.dist((r.x, r.y), (q.x, q.y)) < 0.05:
                continue
            rest = substring(el, dist, el.length)
            k2 = 0.02 / max(math.dist((r.x, r.y), (q.x, q.y)), 1e-6)
            start = (r.x + (r.x - q.x) * k2, r.y + (r.y - q.y) * k2)
            out[e[1]] = LineString([start, (r.x, r.y)] + list(rest.coords))
            changed.add(e[1])
    lines = [p for p in out.values() if not p.within(rim_zone)]
    return lines, bool(changed)


def tidy_joints(outline, lines, short=0.28, length=0.5):
    """Make every lead joint a clear T. A lead shorter than `short` between two joints is
    stretched to `length`; a point where four or more leads meet is split into two joints
    `length` apart. Only the nearby ends of the leads bend, smoothly, so the design keeps its look."""
    rim = outline.exterior
    rim_zone = rim.buffer(2e-3)
    on_rim = lambda p: rim.distance(Point(p)) < 2e-3
    lines = [l for l in _pieces(outline, lines) if not l.within(rim_zone)]
    stuck, changed = set(), False
    for _ in range(300):
        pieces = _pieces(outline, lines)
        deg = Counter()
        for p in pieces:
            deg[p.coords[0]] += 1
            deg[p.coords[-1]] += 1

        def ends_at(w, skip=()):
            out = []
            for i, p in enumerate(pieces):
                if i in skip or p.within(rim_zone):
                    continue
                cs = list(p.coords)
                if cs[0] == w:
                    out.append((i, cs))
                if cs[-1] == w and cs[0] != cs[-1]:
                    out.append((i, cs[::-1]))
            return out

        plan = None  # (pieces to drop, [(piece idx, oriented coords, new start)], new link or None)
        for i, p in enumerate(pieces):
            u, v = p.coords[0], p.coords[-1]
            if u == v or p.length >= short or deg[u] < 3 or deg[v] < 3 or (u, v) in stuck:
                continue
            ux, uy = u[0] - v[0], u[1] - v[1]
            n = math.hypot(ux, uy) or 1
            ux, uy = ux / n, uy / n
            mx, my = (u[0] + v[0]) / 2, (u[1] + v[1]) / 2
            if p.within(rim_zone):  # joints sliding apart along the rim
                t = rim.project(Point(mx, my))
                a, b = rim.interpolate(t - length / 2), rim.interpolate(t + length / 2)
                nu, nv = ((a.x, a.y), (b.x, b.y)) if math.dist((a.x, a.y), u) < math.dist((b.x, b.y), u) else ((b.x, b.y), (a.x, a.y))
                link = None
            else:
                if on_rim(u) and on_rim(v):
                    stuck.add((u, v))
                    continue
                if on_rim(u):  # keep the rim joint, push the inner one inwards
                    u, v, ux, uy = v, u, -ux, -uy
                if on_rim(v):
                    nu, nv = (v[0] + ux * length, v[1] + uy * length), v
                else:
                    nu = (mx + ux * length / 2, my + uy * length / 2)
                    nv = (mx - ux * length / 2, my - uy * length / 2)
                link = [nu, nv]
            moves = [(j, cs, nu) for j, cs in ends_at(u, {i})] + ([(j, cs, nv) for j, cs in ends_at(v, {i})] if nv != v else [])
            plan = ({i}, moves, link, (u, v) if (u, v) else None)
            break
        if plan is None:
            for w, d in deg.items():
                if d < 4 or (w, w) in stuck:
                    continue
                inc = []
                for j, cs in ends_at(w):
                    a = LineString(cs).interpolate(min(0.3, LineString(cs).length / 2))
                    inc.append((math.atan2(a.y - w[1], a.x - w[0]), j, cs))
                inc.sort()
                rim_hub = on_rim(w)
                best = None
                for k in range(len(inc)):
                    e, f = inc[k], inc[(k + 1) % len(inc)]
                    gap = (f[0] - e[0]) % (2 * math.pi)
                    if best is None or gap < best[0]:
                        best = (gap, e, f)
                if best is None:
                    stuck.add((w, w))
                    continue
                _, e, f = best
                bx = math.cos(e[0]) + math.cos(f[0])
                by = math.sin(e[0]) + math.sin(f[0])
                n = math.hypot(bx, by) or 1
                bx, by = bx / n, by / n
                if rim_hub:
                    nu, nv = (w[0] + bx * length, w[1] + by * length), w
                else:
                    nu = (w[0] + bx * length / 2, w[1] + by * length / 2)
                    nv = (w[0] - bx * length / 2, w[1] - by * length / 2)
                group = {e[1], f[1]}
                moves = [(e[1], e[2], nu), (f[1], f[2], nu)] + [(j, cs, nv) for _, j, cs in inc if j not in group and nv != w]
                plan = (set(), moves, [nu, nv], (w, w))
                break
        if plan is None:
            break
        drop, moves, link, key = plan
        bent = {}
        for j, cs, new in moves:
            base = bent.get(j, cs if j not in bent else None)
            if j in bent:  # both ends of one lead move: bend the already-bent copy from the other end
                cur = bent[j][::-1] if bent[j][-1] == cs[0] or math.dist(bent[j][-1], cs[0]) < 1e-9 else bent[j]
                bent[j] = _drag(cur if cur[0] == cs[0] else cur[::-1], new)
            else:
                bent[j] = _drag(cs, new)
        new_lines = [LineString(c) for c in bent.values()]
        if link:
            new_lines.append(LineString(link))
        keep = [p for i, p in enumerate(pieces) if i not in drop and i not in bent and not p.within(rim_zone)]
        candidate = keep + new_lines
        # reject a change that makes a bent lead cross another lead
        fixed = unary_union([rim] + keep)
        ok = True
        for l in new_lines:
            hit = l.intersection(fixed)
            ends = [Point(l.coords[0]), Point(l.coords[-1])]
            for g in (hit.geoms if hasattr(hit, 'geoms') else [hit]):
                if g.is_empty:
                    continue
                if g.geom_type == 'Point' and not any(g.distance(e) < 0.02 for e in ends):
                    ok = False
                elif g.geom_type != 'Point' and g.length > 0.02:
                    ok = False
        for i, l in enumerate(new_lines):
            for m in new_lines[i + 1:]:
                hit = l.intersection(m)
                if not hit.is_empty and hit.geom_type != 'Point' and hit.length > 0.02:
                    ok = False
        if not ok:
            stuck.add(key)
            continue
        lines, changed = candidate, True
    return lines, changed


def rim_clear(outline, lines, gap=0.45, max_angle=45):
    """Lead that runs alongside the rim closer than `gap` would leave a sliver too thin to tap.
    Drop those stretches and run the lead straight into the rim instead."""
    rim = outline.exterior
    out = []
    for line in lines:
        line = shapely.segmentize(line, 0.1)
        cs = list(line.coords)
        keep = []
        for i in range(len(cs) - 1):
            a, b = cs[i], cs[i + 1]
            mid = Point((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
            near = rim.distance(mid) < gap and outline.buffer(-1e-6).contains(mid)
            ok = True
            if near:
                t = rim.project(mid)
                p, q = rim.interpolate(max(0, t - 0.05)), rim.interpolate(min(rim.length, t + 0.05))
                ang = abs(math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]) - math.atan2(q.y - p.y, q.x - p.x))) % 180
                ok = min(ang, 180 - ang) > max_angle
            keep.append(ok)
        if all(keep):
            out.append(line)
            continue
        run = []
        for i, ok in enumerate(keep):
            if ok:
                run.append(i)
            if (not ok or i == len(keep) - 1) and run:
                pts = [cs[j] for j in run] + [cs[run[-1] + 1]]
                # ends that met a dropped stretch go straight to the rim
                if run[0] > 0 and not keep[run[0] - 1]:
                    n = rim.interpolate(rim.project(Point(pts[0])))
                    pts.insert(0, (n.x + (n.x - pts[0][0]) * 0.05, n.y + (n.y - pts[0][1]) * 0.05))
                if run[-1] + 1 < len(keep) and not keep[run[-1] + 1]:
                    n = rim.interpolate(rim.project(Point(pts[-1])))
                    pts.append((n.x + (n.x - pts[-1][0]) * 0.05, n.y + (n.y - pts[-1][1]) * 0.05))
                if LineString(pts).length > 0.1:
                    out.append(LineString(pts))
                run = []
    return out


def neck_cuts(polys, protect=None, width=0.4):
    """Lead lines that cut off the small bits a pane pinches into: through a neck thinner than
    `width` such a bit looks like a tiny pane of its own and is too small to tap. The bits then
    join the neighbour they share the most border with. The picture's subject keeps its points."""
    t = width / 2
    keep = protect.buffer(0.05) if protect is not None else None
    cuts = []
    for p in polys:
        p = shapely.set_precision(p, 0)
        body = p.buffer(-t, 8).buffer(t, 8)
        parts = sorted((g for g in getattr(body, 'geoms', [body]) if not g.is_empty), key=lambda g: -g.area)
        if not parts:
            continue
        main = parts[0].intersection(p)
        if main.geom_type == 'GeometryCollection':
            main = unary_union([g for g in main.geoms if g.geom_type in ('Polygon', 'MultiPolygon')])
        rest = p.difference(main.buffer(1e-6))
        for g in getattr(rest, 'geoms', [rest]):
            if g.is_empty or g.geom_type != 'Polygon' or g.area < 0.06 or g.area / max(g.length, 1e-6) < 0.06:
                continue
            if keep is not None and keep.contains(g.representative_point()):
                continue
            cut = g.boundary.intersection(main.boundary.buffer(1e-4))
            segs = [c for c in getattr(cut, 'geoms', [cut]) if c.geom_type == 'LineString']
            cut = linemerge(segs) if len(segs) > 1 else (segs[0] if segs else cut)
            for c in getattr(cut, 'geoms', [cut]):
                if c.geom_type == 'LineString' and c.length > 0.05:
                    cs = list(c.coords)
                    def stretch(a, b):
                        d = math.dist(a, b) or 1
                        return (a[0] + (a[0] - b[0]) / d * 0.03, a[1] + (a[1] - b[1]) / d * 0.03)
                    cuts.append(LineString([stretch(cs[0], cs[1])] + cs[1:-1] + [stretch(cs[-1], cs[-2])]))
    return cuts


def _along(ring, t):
    t %= ring.length
    p = ring.interpolate(t)
    return (p.x, p.y)


def v_on_edge(p, v, eps=0.02):
    """True if the pane runs on both sides of v (a spike of zero width, not a tip)."""
    return p.buffer(-eps).distance(Point(v)) < eps


def tip_cuts(polys, outline, max_angle=40, width=0.32):
    """Flat ends for sharp tips (user, 2026-10-03: a point where a pane runs out reads as
    "does it touch or not?"). A tip sharper than max_angle is cut straight across where the
    pane is `width` wide; the cut-off sliver joins a neighbour, so the pane ends on a short
    flat border instead of a point. The panel's own corners stay."""
    rim = outline.exterior
    cuts = []
    for p in polys:
        p = shapely.set_precision(p, 0)
        if p.geom_type != 'Polygon':
            continue
        ring = p.exterior
        cs = list(ring.coords)[:-1]
        for v in cs:
            t = ring.project(Point(v))
            a, b = _along(ring, t - 0.22), _along(ring, t + 0.22)
            va, vb = (a[0] - v[0], a[1] - v[1]), (b[0] - v[0], b[1] - v[1])
            la, lb = math.hypot(*va), math.hypot(*vb)
            if la < 1e-6 or lb < 1e-6:
                continue
            cos = (va[0] * vb[0] + va[1] * vb[1]) / (la * lb)
            ang = math.degrees(math.acos(max(-1, min(1, cos))))
            mid = Point((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
            if ang >= max_angle or not p.contains(mid):
                continue
            if rim.distance(Point(v)) < 2e-3:  # the panel's own corner?
                rt = rim.project(Point(v))
                ra, rb = _along(rim, rt - 0.3), _along(rim, rt + 0.3)
                turn = abs(math.degrees(math.atan2(rb[1] - v[1], rb[0] - v[0]) - math.atan2(v[1] - ra[1], v[0] - ra[0]))) % 360
                if min(turn, 360 - turn) > 20:
                    continue
            bx, by = va[0] / la + vb[0] / lb, va[1] / la + vb[1] / lb
            bn = math.hypot(bx, by) or 1
            bx, by = bx / bn, by / bn
            d = width / 2 / max(math.tan(math.radians(ang) / 2), 0.05)
            cx, cy = v[0] + bx * d, v[1] + by * d
            line = LineString([(cx + by * width * 2, cy - bx * width * 2), (cx - by * width * 2, cy + bx * width * 2)])
            piece = line.intersection(p)
            parts = [g for g in getattr(piece, 'geoms', [piece]) if g.geom_type == 'LineString' and g.length > 0.05]
            if not parts:
                continue
            g = min(parts, key=lambda g: g.distance(Point(cx, cy)))
            if g.length > 1.6 * width or v_on_edge(p, v):
                continue  # not a real tip: a stray vertex on a straight side
            q = list(g.coords)
            def stretch(a, b):
                n = math.dist(a, b) or 1
                return (a[0] + (a[0] - b[0]) / n * 0.03, a[1] + (a[1] - b[1]) / n * 0.03)
            cuts.append(LineString([stretch(q[0], q[-1]), stretch(q[-1], q[0])]))
    return cuts


def thin_cuts(polys, width=0.44, min_area=0.1, min_len=0.9):
    """Lead lines that cut thin slivers running along the panel's rim away from each pane's body,
    so they can be handed to a neighbour: a strip too thin to tap reads as a tiny pane of its own.
    Thin shapes inside the panel (star points, petal tips) are design and stay."""
    t = width / 2
    cuts = []
    rim = unary_union(polys).exterior if polys else None
    for poly in polys:
        poly = shapely.set_precision(poly, 0)  # atoms carry the 0.001 grid; offsets here are finer
        opened = poly.buffer(-t, 8).buffer(t, 8)
        parts = list(opened.geoms) if hasattr(opened, 'geoms') else [opened]
        parts = [p for p in parts if not p.is_empty]
        if not parts:
            continue
        body = max(parts, key=lambda p: p.area).intersection(poly)
        if body.geom_type == 'GeometryCollection':
            body = unary_union([g for g in body.geoms if g.geom_type in ('Polygon', 'MultiPolygon')])
        if body.is_empty:
            continue
        rest = poly.difference(body.buffer(1e-6))
        for piece in (rest.geoms if hasattr(rest, 'geoms') else [rest]):
            if piece.is_empty or piece.geom_type != 'Polygon':
                continue
            rect = list(piece.minimum_rotated_rectangle.exterior.coords)
            extent = max(math.dist(rect[0], rect[1]), math.dist(rect[1], rect[2]))
            if piece.area < min_area and extent < min_len:
                continue  # an ordinary sharp corner
            if piece.boundary.intersection(rim.buffer(2e-3)).length < 0.4 * extent:
                continue  # not a sliver along the rim
            cut = piece.boundary.intersection(body.boundary.buffer(1e-4))
            segs = [g for g in (cut.geoms if hasattr(cut, 'geoms') else [cut]) if g.geom_type == 'LineString']
            cut = linemerge(segs) if len(segs) > 1 else (segs[0] if segs else cut)
            for g in (cut.geoms if hasattr(cut, 'geoms') else [cut]):
                if g.geom_type == 'LineString' and g.length > 0.05:
                    cuts.append(g)
    return cuts


def _one_piece(g):
    """The pane polygon of a union, ignoring zero-width leftovers; None if it is really split."""
    if g.geom_type == 'Polygon':
        return g
    parts = [p for p in getattr(g, 'geoms', []) if p.geom_type == 'Polygon' and p.area > 1e-6]
    if len(parts) == 1:
        return parts[0]
    return None


def _seg_key(p, q):
    return (p, q) if p <= q else (q, p)


def _segments(poly):
    rings = [poly.exterior] + list(poly.interiors)
    for rg in rings:
        cs = list(rg.coords)
        for i in range(len(cs) - 1):
            p = (round(cs[i][0], 3), round(cs[i][1], 3))
            q = (round(cs[i + 1][0], 3), round(cs[i + 1][1], 3))
            if p != q:
                yield p, q


def _clearance(poly):
    if poly.geom_type != 'Polygon':
        return 0
    pt = polylabel(poly, 0.01)
    return poly.exterior.distance(pt) if not poly.interiors else poly.boundary.distance(pt)


class Build:
    def __init__(self, outline, lines, min_r=0.36, min_area=0.9, max_area=None, seed=1, protect=None, mirror_x=None):
        self.outline = _snap(outline)
        lines = close_dangles(self.outline, lines)
        self.lines = subdivide(self.outline, lines, max_area, seed, protect, mirror_x) if max_area else lines
        self.protect = protect
        self.min_r = min_r
        self.min_area = min_area

    def run(self):
        """Polygonize and merge tiny panes, tidy every joint (tidy_joints), then give any
        remaining point touch a small round lead knot."""
        from contacts import problems
        atoms = _atoms(self.outline, self.lines, [])
        groups = self._group(atoms, [])
        for _round in range(6):
            lead = [LineString([p, q]) for (p, q), o in self.seg_owner.items() if len(o) == 2 and groups[o[0]] != groups[o[1]]]
            lines, _ = tidy_joints(self.outline, lead)
            if _round < 3:
                lines, _ = steepen(self.outline, lines)
            knots = []
            for _ in range(12):
                atoms = _atoms(self.outline, lines, knots)
                groups = self._group(atoms, knots)
                bad = [p for p in self._corner_points(atoms, groups) if all(math.dist(p, k[:2]) > 0.05 for k in knots)]
                knots += [(p[0], p[1], 0.45, None) for p in bad]
                n = max(groups) + 1
                polys = [unary_union([atoms[i] for i, g in enumerate(groups) if g == r]) for r in range(n)]
                edges, adj = [], [set() for _ in range(n)]
                for (p, q), owners in self.seg_owner.items():
                    regs = sorted({groups[o] for o in owners})
                    if len(owners) == 2 and len(regs) == 2:
                        edges.append([*p, *q, *regs])
                        adj[regs[0]].add(regs[1])
                        adj[regs[1]].add(regs[0])
                self.issues = problems(polys, adj, edges)
                if bad:
                    continue
                # a sharp tip poking at another pane: blunt it, handing the tip to the pane around it
                added = False
                for kind, a, c, _, p in self.issues:
                    if kind != 'near' or any(math.dist(p, k[:2]) < 0.2 for k in knots):
                        continue
                    disk = Point(p).buffer(0.35)
                    others = [r for r in range(n) if r not in (a, c) and polys[r].intersects(disk)]
                    if not others:
                        continue
                    host = max(others, key=lambda r: polys[r].intersection(disk).area)
                    h = polys[host].intersection(disk).representative_point()
                    knots.append((p[0], p[1], 0.35, (h.x, h.y)))
                    added = True
                if not added:
                    break
            cuts = neck_cuts(polys, self.protect) if _round < 5 else []
            if not self.issues and not cuts:
                break
            if cuts:  # pinched-off bits join a neighbour; the next round tidies the new joints
                n_before = max(groups) + 1
                cand_atoms = _atoms(self.outline, [*lines, *[circle(x, y, r, 20) for x, y, r, _ in knots], *cuts], [])
                cand_groups = self._group(cand_atoms, [])
                if max(cand_groups) + 1 >= n_before - 1:  # only if nothing else got swallowed
                    atoms, groups = cand_atoms, cand_groups
                else:
                    self._group(atoms, [], False)  # restore seg_owner for the kept atoms
                    if not self.issues:
                        break
        self.atoms, self.groups = atoms, groups
        for width in (0.32, 0.32, 0.5, 0.7):  # wider cuts for tips the narrow ones could not place
            self.flatten_tips(width=width)
        return self

    def flatten_tips(self, max_angle=40, width=0.32):
        """Cut every sharp pane tip off flat and give the tip to a neighbour along its side, so no
        pane ends in a point (user, 2026-10-03: a tip pointing at a border reads as "touching or
        not?"). Works on the finished panes: their borders plus the cut segments are polygonized
        again and every face goes back to its pane, the tips to the chosen neighbour."""
        from contacts import problems
        n = max(self.groups) + 1
        polys = [shapely.set_precision(unary_union([a for a, g in zip(self.atoms, self.groups) if g == r]), 0) for r in range(n)]
        cuts = tip_cuts(polys, self.outline, max_angle, width)
        if not cuts:
            return False
        net = [a.exterior for a in self.atoms] + [i for a in self.atoms for i in a.interiors] + cuts
        faces = [_snap(f) for f in polygonize(_snap(unary_union([_snap(l) for l in net])))]
        faces = [f for f in faces if f.area > 1e-7 and f.intersection(self.outline).area > 0.5 * f.area]
        if abs(sum(f.area for f in faces) - sum(a.area for a in self.atoms)) > 1e-3:
            print('  flatten: area mismatch', round(sum(f.area for f in faces) - sum(a.area for a in self.atoms), 4))
            return False
        tree = shapely.STRtree(self.atoms)
        owner = []
        for f in faces:  # every face lies inside exactly one old atom
            hits = [(self.atoms[int(i)].intersection(f).area, int(i)) for i in tree.query(f)]
            best = max(hits) if hits else (0, -1)
            owner.append(self.groups[best[1]] if best[0] > 0.5 * f.area else -1)
        old_seg = self.seg_owner
        self._group(faces, [], False)  # seg_owner for the faces
        seg = self.seg_owner
        home = owner[:]
        if any(o < 0 for o in owner) or len(set(owner)) < n:
            print('  flatten: lost faces', sum(o < 0 for o in owner), n - len(set(owner)))
            self.seg_owner = old_seg
            return False
        piece = lambda own, r: _one_piece(unary_union([f for f, o in zip(faces, own) if o == r]))
        if any(piece(home, r) is None for r in range(n)):  # re-noding didn't reproduce the panes
            self.seg_owner = old_seg
            return False
        broken = lambda own: {r for r in range(n) if piece(own, r) is None}

        def issues_of(own):
            edges, adj = [], [set() for _ in range(n)]
            for (p, q), owners in self.seg_owner.items():
                regs = sorted({own[o] for o in owners})
                if len(owners) == 2 and len(regs) == 2:
                    edges.append([*p, *q, *regs])
                    adj[regs[0]].add(regs[1])
                    adj[regs[1]].add(regs[0])
            return problems([piece(own, r) for r in range(n)], adj, edges)
        known = {(k, a, b) for k, a, b, _, _ in issues_of(home)}
        tips = []
        for i, f in enumerate(faces):
            r = owner[i]
            if f.area > 0.25 or not any(c.distance(f) < 1e-3 and c.intersection(f.boundary.buffer(1e-3)).length > 0.05 for c in cuts):
                continue
            share = defaultdict(float)
            for (p, q), owners in seg.items():
                if i in owners and len(owners) == 2:
                    j = owners[0] if owners[1] == i else owners[1]
                    if owner[j] != r:
                        share[owner[j]] += math.dist(p, q)
            tips.append((i, sorted(share, key=share.get, reverse=True)))
        # give each tip to the first neighbour that keeps every pane whole and adds no unclear contact
        for i, cands in tips:
            for c in cands:
                trial = owner[:]
                trial[i] = c
                if piece(trial, c) is None or piece(trial, home[i]) is None:
                    continue
                if any((k, a, b) not in known for k, a, b, _, _ in issues_of(trial)):
                    continue
                owner = trial
                break
        if all(o == h for o, h in zip(owner, home)) or broken(owner):
            self.seg_owner = old_seg
            return False
        self.atoms, self.groups = faces, owner
        edges, adj = [], [set() for _ in range(n)]
        for (p, q), owners in self.seg_owner.items():
            regs = sorted({owner[o] for o in owners})
            if len(owners) == 2 and len(regs) == 2:
                edges.append([*p, *q, *regs])
                adj[regs[0]].add(regs[1])
                adj[regs[1]].add(regs[0])
        polys2 = [unary_union([f for f, o in zip(faces, owner) if o == r]) for r in range(n)]
        self.issues = problems(polys2, adj, edges)
        return True

    def _group(self, atoms, knots, merge=True):
        seg_owner = defaultdict(list)
        for i, a in enumerate(atoms):
            for p, q in _segments(a):
                seg_owner[_seg_key(p, q)].append(i)
        self.seg_owner = seg_owner
        parent = list(range(len(atoms)))

        def find(i):
            while parent[i] != i:
                parent[i] = parent[parent[i]]
                i = parent[i]
            return i

        def union(i, j):
            parent[find(i)] = find(j)

        # knots: all atoms inside a knot disk join one neighbouring outside atom
        for x, y, r, h in knots:
            d = Point(x, y).buffer(r * 0.98, 16)
            inside = [i for i, a in enumerate(atoms) if d.contains(a.representative_point()) and a.area < math.pi * r * r * 1.05]
            if not inside:
                continue
            around = set()
            for (p, q), owners in seg_owner.items():
                if len(owners) == 2:
                    a, b = owners
                    if (a in inside) != (b in inside):
                        around.add(b if a in inside else a)
            if not around:
                continue
            host = max(around, key=lambda i: atoms[i].area) if h is None else min(around, key=lambda i: atoms[i].distance(Point(h)))
            for i in inside:
                union(i, host)
        # merge small panes into the neighbour they share the longest border with
        regions = defaultdict(list)
        for i in range(len(atoms)):
            regions[find(i)].append(i)
        while merge:
            regions = defaultdict(list)
            for i in range(len(atoms)):
                regions[find(i)].append(i)
            polys = {root: unary_union([atoms[i] for i in ids]) for root, ids in regions.items()}
            shared = defaultdict(float)
            for (p, q), owners in seg_owner.items():
                if len(owners) == 2:
                    a, b = find(owners[0]), find(owners[1])
                    if a != b:
                        shared[(a, b)] += math.dist(p, q)
                        shared[(b, a)] += math.dist(p, q)
            worst, score = None, 1e9
            for root, poly in polys.items():
                c = _clearance(poly)
                s = min(c / self.min_r, poly.area / self.min_area)
                if s < 1 and s < score:
                    worst, score = root, s
            if worst is None:
                break
            nbrs = [(l, b) for (a, b), l in shared.items() if a == worst]
            if not nbrs:
                break
            union(worst, max(nbrs)[1])
        roots = sorted(set(find(i) for i in range(len(atoms))), key=lambda r: min(regions[r]))
        index = {r: k for k, r in enumerate(roots)}
        return [index[find(i)] for i in range(len(atoms))]

    def _corner_points(self, atoms, groups):
        vert = defaultdict(set)
        adj = defaultdict(set)
        for (p, q), owners in self.seg_owner.items():
            regs = {groups[o] for o in owners}
            for o in owners:
                vert[p].add(groups[o])
                vert[q].add(groups[o])
            if len(regs) == 2:
                a, b = regs
                adj[a].add(b)
                adj[b].add(a)
        bad = []
        for v, regs in vert.items():
            regs = sorted(regs)
            if any(b not in adj[a] for i, a in enumerate(regs) for b in regs[i + 1:]):
                bad.append(v)
        return bad

    def _on_rim(self, v):
        return self.outline.exterior.distance(Point(v)) < 0.002

    # ---------- output ----------
    def to_map(self, prefer=None):
        atoms, groups = self.atoms, self.groups
        n = max(groups) + 1
        polys = []
        for r in range(n):
            u = _one_piece(unary_union([atoms[i] for i, g in enumerate(groups) if g == r])) or unary_union([atoms[i] for i, g in enumerate(groups) if g == r])
            if u.geom_type != 'Polygon':
                raise RuntimeError(f'region {r} is not one piece ({u.geom_type})')
            polys.append(shapely.geometry.polygon.orient(u, 1.0))
        edges, rim = [], []
        adj = [set() for _ in range(n)]
        interior = []
        for (p, q), owners in self.seg_owner.items():
            regs = sorted({groups[o] for o in owners})
            if len(owners) == 1:
                rim.append([*p, *q, regs[0]])
            elif len(regs) == 2:
                a, b = regs
                adj[a].add(b)
                adj[b].add(a)
                edges.append([*p, *q, a, b])
                interior.append(LineString([p, q]))
        merged = linemerge(interior)
        merged = list(merged.geoms) if hasattr(merged, 'geoms') else [merged]
        f = lambda v: ('%.3f' % v).rstrip('0').rstrip('.')
        def d_line(cs):
            return 'M' + 'L'.join(f'{f(x)} {f(y)}' for x, y in cs)
        edge_path = ''.join(d_line(l.coords) for l in merged)
        paths = []
        for poly in polys:
            rings = [poly.exterior] + list(poly.interiors)
            paths.append(''.join(d_line(list(rg.coords)[:-1]) + 'Z' for rg in rings))
        anchors = []
        for poly in polys:
            pt = polylabel(poly, 0.01)
            anchors.append([round(pt.x, 3), round(pt.y, 3)])
        whole = unary_union(polys)
        if whole.geom_type == 'Polygon' and whole.interiors:
            whole = Polygon(whole.exterior) if all(Polygon(i).area < 1e-3 for i in whole.interiors) else whole
        assert whole.geom_type == 'Polygon' and not whole.interiors, 'panes leave a gap'
        shape = d_line(list(whole.exterior.coords)[:-1]) + 'Z'
        preferred = None
        if prefer:
            preferred = [prefer(*a) for a in anchors]
        # sanity: no gaps / overlaps
        total = sum(p.area for p in polys)
        assert abs(total - whole.area) < 1e-3 and abs(total - self.outline.area) < 0.6, (total, whole.area, self.outline.area)
        return {
            'cols': W, 'rows': H, 'count': n, 'shape': shape, 'paths': paths, 'anchors': anchors,
            'adj': [sorted(a) for a in adj], 'edges': edges, 'rim': rim, 'edgePath': edge_path,
            'preferred': preferred,
            'clearance': [round(_clearance(p), 3) for p in polys],
            'area': [round(p.area, 3) for p in polys],
        }
