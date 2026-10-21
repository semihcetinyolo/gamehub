"""Traced linework -> readable Cartograph map with a subject-aware four-colouring.

python tools/stained/vitray/build_map.py <id> [--root DIR] [--stage-only]
  reads  work/<id>.trace.json, design/<id>.png (+ .json, .subject.png)
  writes work/<id>.geom.json  (final geometry)
         work/<id>.map.json   (staged level info, not yet in the catalogue)
         work/<id>.preview.png (design | map in solution colours)

Colour plan: the subject (design/<id>.subject.png, majority per pane) keeps the
two palette colours it mostly has in the design, the background the other two.
A four-colouring cannot keep that everywhere: three panes meeting at a T form a
triangle. Where the best colouring still has to put a background colour into the
subject (or the reverse), that pane is joined to a neighbour of its own side
(its longest shared border), which removes the odd cycle instead of breaking the
picture into a patchwork. Only then the approved geometry passes run, with the
subject silhouette immutable.
"""
import argparse
import contextlib
import io
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from shapely import contains_xy
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import contact_policy  # noqa: E402
from audit_geometry import inspect as audit  # noqa: E402
from make_maps import color, region_polys, shape_poly  # noqa: E402
import visible_contacts  # noqa: E402
from trace import hex_rgb, lab  # noqa: E402

MIN_PANES = 60
ROLE = .2  # weight of the subject/background colour roles next to the design colour (1)
SUBJECT_SEAM = 1.0  # colour_merge cost per unit of subject lead dropped (background: .15)
KEEP = .72  # colour_merge may drop seams of at most 28% of the traced panes


def load(id, root):
    t = json.loads((root / 'work' / f'{id}.trace.json').read_text())
    outline = Polygon(t['outline']).buffer(0)
    lines = [LineString(l) for l in t['lines'] if len(l) > 1]
    return t, outline, lines


def quiet(f, *a, **k):
    with contextlib.redirect_stdout(io.StringIO()):
        return f(*a, **k)


def raw_map(t, outline, lines):
    b = quiet(contact_policy.from_lines, outline, lines, t['cols'], t['rows'], merge=True)
    return b.to_map()


def rebuild(m, keep_edge):
    lines = [LineString([e[:2], e[2:4]]) for e in m['edges'] if keep_edge(e)]
    return quiet(contact_policy.from_lines, shape_poly(m), lines, m['cols'], m['rows'], merge=False).to_map()


def pane_pixels(m, t, image):
    """Design pixels inside each pane (sampled grid, away from the lead)."""
    s, (ox, oy) = t['scale'], t['offset']
    out = []
    for poly in region_polys(m):
        core = poly.buffer(-.12)
        core = core if not core.is_empty else poly
        minx, miny, maxx, maxy = core.bounds
        X, Y = np.meshgrid(np.linspace(minx, maxx, 24), np.linspace(miny, maxy, 24))
        inside = contains_xy(core, X, Y)
        if not inside.any():
            p = poly.representative_point(); X, Y, inside = np.array([p.x]), np.array([p.y]), np.array([True])
        px = ((X[inside] - ox) / s + 1).astype(int).clip(0, image.shape[1] - 1)
        py = ((Y[inside] - oy) / s + 1).astype(int).clip(0, image.shape[0] - 1)
        out.append(image[py, px])
    return out


def wishes(m, t, root, id):
    """Design colour (palette index) of every pane by majority."""
    img = np.asarray(Image.open(root / 'design' / f'{id}.png').convert('RGB'), float)
    P = lab(np.array([hex_rgb(h) for _, h in t['palette']]))
    out = []
    for px in pane_pixels(m, t, img):
        d = ((lab(px)[:, None, :] - P[None]) ** 2).sum(-1)
        out.append(int(np.bincount(d.argmin(1), minlength=4).argmax()))
    return out


def subject_of(m, t, root, id):
    path = root / 'design' / f'{id}.subject.png'
    meta = root / 'design' / f'{id}.json'
    colours = json.loads(meta.read_text()).get('subjectColours') if meta.exists() else None
    if colours:
        # Design drawn with disjoint subject / background colour pairs.
        return [w in colours for w in wishes(m, t, root, id)]
    if not path.exists():
        return None
    img = np.asarray(Image.open(path).convert('L').resize(tuple(t['image'])), float)[..., None]
    return [bool((px[:, 0] < 128).mean() > .5) for px in pane_pixels(m, t, img)]


def plan(wish, subject):
    """Colour roles from the design: A = the subject's signature colour (only in
    the subject), B = its second colour, C = the background's second colour,
    D = the background's own colour (only in the background). B and C may cross
    over where the four-colour rule forces it, A and D never if avoidable."""
    if subject is None:
        return None, None
    n = {side: np.bincount([w for w, s in zip(wish, subject) if s == side], minlength=4) + 1e-3 for side in (True, False)}
    share = n[True] / n[True].sum() - n[False] / n[False].sum()
    order = [int(c) for c in np.argsort(-share)]          # most subject-specific first
    A, B, C, D = order
    groups = {True: [A, B], False: [D, C]}
    return dict(A=A, B=B, C=C, D=D), groups


def milp_colour(adj, value, seconds=60):
    """Exact best four-colouring for per-pane colour values (HiGHS MILP)."""
    from scipy.optimize import milp, LinearConstraint, Bounds
    from scipy.sparse import lil_matrix
    n = len(adj)
    edges = [(a, b) for a in range(n) for b in adj[a] if a < b]
    A = lil_matrix((n + 4 * len(edges), 4 * n))
    for r in range(n):
        for c in range(4):
            A[r, 4 * r + c] = 1
    for k, (a, b) in enumerate(edges):
        for c in range(4):
            A[n + 4 * k + c, 4 * a + c] = 1; A[n + 4 * k + c, 4 * b + c] = 1
    lo = np.r_[np.ones(n), np.zeros(4 * len(edges))]
    hi = np.r_[np.ones(n), np.ones(4 * len(edges))]
    res = milp(-np.asarray(value, float).ravel(), constraints=LinearConstraint(A.tocsr(), lo, hi),
               integrality=np.ones(4 * n), bounds=Bounds(0, 1), options=dict(time_limit=seconds))
    if res.x is None:
        return None
    sol = [int(np.argmax(res.x[4 * r:4 * r + 4])) for r in range(n)]
    if any(sol[a] == sol[b] for a, b in edges) or len(set(sol)) < 4:
        return None
    return sol


def solve(m, roles, subject, wish=None, seed=7, iters=200000):
    """Four-colouring maximising readability (see plan) plus the design's own colour."""
    import random
    n = m['count']; adj = m['adj']
    area = [p.area for p in region_polys(m)]
    if roles is None:
        return color(adj, [(w,) for w in wish], area, seed)
    score = {True: {roles['A']: 2.0, roles['B']: 1.7, roles['C']: .7, roles['D']: 0.0},
             False: {roles['D']: 2.0, roles['C']: 1.7, roles['B']: .7, roles['A']: 0.0}}
    weight = [(6.0 if s else 1.0) * min(4.0, max(.6, a)) for a, s in zip(area, subject)]

    def val(r, c):
        return weight[r] * (score[subject[r]][c] + (.3 if wish is not None and wish[r] == c else 0))
    exact = milp_colour(adj, [[val(r, c) for c in range(4)] for r in range(n)])
    if exact is not None:
        return exact
    pref = [tuple(sorted(range(4), key=lambda c: -val(r, c))) for r in range(n)]
    cur = color(adj, [p[:1] for p in pref], area, seed)   # valid start
    rand = random.Random(seed)
    total = sum(val(r, cur[r]) for r in range(n)); best, best_total = cur[:], total
    T0 = 1.5 * float(np.mean(weight))
    for it in range(iters):
        if it and it % (iters // 4) == 0:
            cur, total = best[:], best_total   # restart the cooling from the best so far
        T = T0 * (1 - (it % (iters // 4)) / (iters // 4)) ** 2 + .01
        r = rand.randrange(n); c = rand.randrange(4)
        a = cur[r]
        if c == a:
            continue
        chain, stack = {r}, [r]
        while stack:
            i = stack.pop()
            for j in adj[i]:
                if j not in chain and cur[j] in (a, c):
                    chain.add(j); stack.append(j)
        delta = sum(val(i, c if cur[i] == a else a) - val(i, cur[i]) for i in chain)
        if delta >= 0 or rand.random() < math.exp(delta / T):
            for i in chain:
                cur[i] = c if cur[i] == a else a
            total += delta
            if total > best_total + 1e-9:
                best, best_total = cur[:], total
    assert all(best[i] != best[j] for i in range(n) for j in adj[i])
    return best


def intruders(sol, subject, groups):
    return [r for r, (c, s) in enumerate(zip(sol, subject)) if c not in groups[s]]


def unify(m, t, root, id, log):
    """Join intruding panes to a same-side neighbour until the colouring reads."""
    best = None
    for rnd in range(40):
        wish, subject = wishes(m, t, root, id), subject_of(m, t, root, id)
        prefs, groups = plan(wish, subject)
        sol = solve(m, prefs, subject)
        bad = intruders(sol, subject, groups)
        log(f'  colour round {rnd}: {m["count"]} panes, {len(bad)} off-side panes')
        if best is None or len(bad) < best[0]:
            best = (len(bad), rnd, m)
        if len(bad) <= max(1, .03 * m['count']) or m['count'] <= MIN_PANES or rnd - best[1] >= 2:
            return best[2]
        shared = defaultdict(float)
        for x, y, u, v, a, b in m['edges']:
            shared[(a, b)] += math.hypot(u - x, v - y); shared[(b, a)] += math.hypot(u - x, v - y)
        used, joins = set(), []
        for r in sorted(bad, key=lambda r: -max([l for (a, b), l in shared.items() if a == r] or [0])):
            if r in used:
                continue
            same = [(l, b) for (a, b), l in shared.items() if a == r and subject[b] == subject[r] and b not in used]
            if not same:
                continue
            l, b = max(same)
            if l < .35:
                continue
            used |= {r, b}; joins.append((r, b))
            if len(joins) >= max(1, min(len(bad) // 2, (m['count'] - MIN_PANES) // 2)):
                break
        if not joins:
            return best[2]
        pairs = {tuple(sorted(j)) for j in joins}
        m = rebuild(m, lambda e: tuple(sorted(e[4:])) not in pairs)
    return best[2]


def merge_same(m, t, root, id, log, cap=2.0, longest=1.2):
    """Join neighbouring panes the design paints in the same colour.

    The design sheet alternates colours; where two touching pieces still share
    one, the lead between them is construction, not picture. Removing it keeps
    the look and makes the design colours a valid four-colouring. A merged pane
    stays below `cap` x the median pane area so the glass keeps its piecework.
    """
    for rnd in range(6):
        wish = wishes(m, t, root, id)
        ps = region_polys(m)
        area = [p.area for p in ps]
        limit = cap * float(np.median(area))
        shared = defaultdict(float)
        for x, y, u, v, a, b in m['edges']:
            if wish[a] == wish[b]:
                shared[(min(a, b), max(a, b))] += math.hypot(u - x, v - y)
        parent = list(range(m['count']))

        def find(i):
            while parent[i] != i:
                parent[i] = parent[parent[i]]; i = parent[i]
            return i
        size = area[:]
        joined = 0
        for (a, b), l in sorted(shared.items(), key=lambda kv: -kv[1]):
            ra, rb = find(a), find(b)
            if ra == rb or size[ra] + size[rb] > limit or l > longest:
                continue
            parent[rb] = ra; size[ra] += size[rb]; joined += 1
        if not joined:
            break
        m = rebuild(m, lambda e: find(e[4]) != find(e[5]))
    wish = wishes(m, t, root, id)
    same = sum(1 for a in range(m['count']) for b in m['adj'][a] if a < b and wish[a] == wish[b])
    log(f'  merged same-colour neighbours: {m["count"]} panes, {same} same-colour contacts left')
    return m


def two_tone(m, t, root, id, log, keep_same=.25, agree=.15):
    """Make each side (subject / background) two-colourable with the least lead removed.

    Weighted max-cut on each side's pane graph: a seam is worth its length, a
    quarter of it when the design paints both panes alike (that lead is only
    construction). Seams inside one colour class are removed, so the subject
    alternates A/B and the background C/D: an exact four-colouring that follows
    the design. Returns (map, solution).
    """
    from scipy.optimize import milp, LinearConstraint, Bounds
    from scipy.sparse import lil_matrix
    wish, subject = wishes(m, t, root, id), subject_of(m, t, root, id)
    roles, groups = plan(wish, subject)
    area = [p.area for p in region_polys(m)]
    L = defaultdict(float)
    for x, y, u, v, a, b in m['edges']:
        L[(min(a, b), max(a, b))] += math.hypot(u - x, v - y)
    colour_of = {}
    removed = set()
    for side in (True, False):
        nodes = [r for r in range(m['count']) if subject[r] == side]
        pair = groups[side]
        idx = {r: i for i, r in enumerate(nodes)}
        E = [(a, b, l * (keep_same if wish[a] == wish[b] else 1)) for (a, b), l in L.items() if a in idx and b in idx]
        n, k = len(nodes), len(E)
        A = lil_matrix((2 * k, n + k)); hi = []
        for j, (a, b, _) in enumerate(E):
            A[2 * j, n + j] = 1; A[2 * j, idx[a]] = -1; A[2 * j, idx[b]] = -1; hi.append(0)
            A[2 * j + 1, n + j] = 1; A[2 * j + 1, idx[a]] = 1; A[2 * j + 1, idx[b]] = 1; hi.append(2)
        # y = 1 means the pair's second colour; agreeing with the design earns a little
        bonus = np.array([agree * area[r] * ((1 if wish[r] == pair[1] else -1) if wish[r] in pair else 0) for r in nodes])
        c = np.r_[-bonus, -np.array([e[2] for e in E])]
        res = milp(c, constraints=LinearConstraint(A.tocsr(), -np.inf, hi), integrality=np.ones(n + k),
                   bounds=Bounds(0, 1), options=dict(time_limit=120))
        y = res.x[:n].round().astype(int)
        for r in nodes:
            colour_of[r] = pair[y[idx[r]]]
        removed |= {(a, b) for a, b, _ in E if y[idx[a]] == y[idx[b]]}
    cm = rebuild(m, lambda e: (min(e[4], e[5]), max(e[4], e[5])) not in removed)
    # carry colours over by overlap
    old = region_polys(m)
    sol = []
    for p in region_polys(cm):
        q = p.representative_point()
        r = next(i for i, o in enumerate(old) if o.covers(q))
        sol.append(colour_of[r])
    assert all(sol[a] != sol[b] for a in range(cm['count']) for b in cm['adj'][a]), 'two-tone colouring clash'
    log(f'  two-tone: {m["count"]} -> {cm["count"]} panes, {len(removed)} seams removed')
    return cm, sol


def colour_merge(m, t, root, id, log, keep=KEEP, seconds=180):
    """Joint choice of colours and of the few seams to drop (one MILP).

    Every pane earns sqrt(area) x (1 for its design colour + half its role score,
    see plan): the picture's colours and the subject/background contrast. Two
    neighbours may share a colour only if their seam is dropped (they become
    one pane). At most (1 - keep) x panes seams may go, each costing a little
    per length, so the solver drops exactly the seams whose removal saves the
    most picture: the in-between of a recoloured patchwork and a flat poster.
    Returns (map, solution).
    """
    from scipy.optimize import milp, LinearConstraint, Bounds
    from scipy.sparse import lil_matrix
    wish, subject = wishes(m, t, root, id), subject_of(m, t, root, id)
    roles, groups = plan(wish, subject)
    n = m['count']
    area = [p.area for p in region_polys(m)]
    L = defaultdict(float)
    for x, y, u, v, a, b in m['edges']:
        L[(min(a, b), max(a, b))] += math.hypot(u - x, v - y)
    E = list(L)
    k = len(E)
    if roles:
        score = {True: {roles['A']: 2.0, roles['B']: 1.7, roles['C']: .7, roles['D']: 0.0},
                 False: {roles['D']: 2.0, roles['C']: 1.7, roles['B']: .7, roles['A']: 0.0}}
    val = np.array([[math.sqrt(area[r]) * (1.5 if roles and subject[r] else 1) * ((1.0 if c == wish[r] else 0) + (ROLE * score[subject[r]][c] if roles else 0))
                     for c in range(4)] for r in range(n)])
    rows = n + 4 * k + 1
    A = lil_matrix((rows, 4 * n + k)); lo = np.full(rows, -np.inf); hi = np.zeros(rows)
    for r in range(n):
        for c in range(4):
            A[r, 4 * r + c] = 1
        lo[r] = hi[r] = 1
    for j, (a, b) in enumerate(E):
        for c in range(4):
            q = n + 4 * j + c
            A[q, 4 * a + c] = 1; A[q, 4 * b + c] = 1; A[q, 4 * n + j] = -1; hi[q] = 1
        A[rows - 1, 4 * n + j] = 1
    hi[rows - 1] = int((1 - keep) * n)
    ub = np.ones(4 * n + k)
    for j, (a, b) in enumerate(E):
        if subject is not None and subject[a] != subject[b]:
            ub[4 * n + j] = 0          # never merge across the silhouette
    # Dropping lead costs per length: inside the subject its pieces are the
    # picture's detail (a sail's panels), in the background mostly construction.
    inner = lambda a, b: subject is not None and subject[a] and subject[b]
    cost = np.r_[-val.ravel(), np.array([(SUBJECT_SEAM if inner(*e) else .15) * L[e] for e in E])]
    from visible_panes import inspect as necks
    old = region_polys(m)
    before = len(necks(m))
    for attempt in range(6):
        res = milp(cost, constraints=LinearConstraint(A.tocsr(), lo, hi), integrality=np.ones(4 * n + k),
                   bounds=Bounds(0, ub), options=dict(time_limit=seconds))
        x = res.x[:4 * n].reshape(n, 4).argmax(1)
        drop = {E[j] for j in range(k) if res.x[4 * n + j] > .5 and x[E[j][0]] == x[E[j][1]]}
        cm = rebuild(m, lambda e: (min(e[4], e[5]), max(e[4], e[5])) not in drop) if drop else m
        # A joined pane must still read as one piece of glass (visible_panes.py):
        # forbid the joins that made a pane with a hidden neck, then solve again.
        bad = necks(cm)
        if len(bad) <= before:
            break
        polys = region_polys(cm)
        for _, r, *_ in bad:
            inside = {i for i, o in enumerate(old) if polys[r].covers(o.representative_point())}
            for j, e in enumerate(E):
                if e in drop and e[0] in inside:
                    ub[4 * n + j] = 0
    sol = []
    for p in region_polys(cm):
        q = p.representative_point()
        sol.append(int(x[next(i for i, o in enumerate(old) if o.covers(q))]))
    assert all(sol[a] != sol[b] for a in range(cm['count']) for b in cm['adj'][a]), 'colour clash after merge'
    kept = sum(int(x[r]) == wish[r] for r in range(n))
    log(f'  colour+merge: {n} -> {cm["count"]} panes, {len(drop)} seams dropped, {kept}/{n} design colours kept')
    return cm, sol


def silhouette(m, subject):
    if subject is None:
        return None
    lines = [LineString([e[:2], e[2:4]]) for e in m['edges'] if subject[e[4]] != subject[e[5]]]
    # closed small panes inside the subject (eyes) keep their ring too
    for r, ns in enumerate(m['adj']):
        if len(ns) == 1 and subject[r]:
            lines += [LineString([e[:2], e[2:4]]) for e in m['edges'] if r in e[4:]]
    return unary_union(lines) if lines else None


def finish(m, immutable, colours, minimum=MIN_PANES):
    """Approved production passes: drop dispensable seams beside measured issues,
    then separate four-way crossings into readable T junctions.

    `colours(m)` gives the design colour of every pane. The junction pass
    (readable_junctions.repair) scores each candidate split by the same-colour
    borders it creates, so a crossing opens towards the diagonal pair the design
    paints differently - the picture's colours survive the repair."""
    from shapely.geometry import GeometryCollection
    from authored_clean import cleanup
    from readable_junctions import repair, remove_divider
    from junction_pilot import junctions
    protected = immutable if immutable is not None else GeometryCollection()
    m, h1 = quiet(cleanup, m, immutable, minimum_count=minimum)
    wish = colours(m)
    m, h2 = quiet(repair, m, wish, protected, None, passes=3, immutable=immutable)
    for _ in range(40):
        if not junctions(m):
            break
        changed = False
        for pt, _ in junctions(m):
            if not any(q == pt for q, _ in junctions(m)):
                continue
            result = quiet(remove_divider, m, wish, pt, protected, None, minimum, immutable)
            if result:
                m, wish, detail = result; h2.append(detail); changed = True
                m, more = quiet(repair, m, wish, protected, None, passes=2, immutable=immutable); h2.extend(more)
        if not changed:
            break
    return m, h1 + h2


def visible_repair(m, immutable):
    """Grey-zone contacts (visible_contacts.py) -> clear touch or clear gap."""
    from repair_visible_contacts import repair
    from shapely.geometry import GeometryCollection
    sol = color(m['adj'], [(0,)] * m['count'], [1] * m['count'], 7)
    info, row = repair(dict(id='x', map=m, solution=sol), immutable=immutable if immutable is not None else GeometryCollection())
    return info['map']


def neck_repair(m):
    """Hidden necks (visible_panes) -> straight separators beside the neck
    (approved repair_visible_panes pass; contours are kept)."""
    from repair_visible_panes import repair
    sol = color(m['adj'], [(0,)] * m['count'], [1] * m['count'], 7)
    for broad in (False, True):
        info, row = quiet(repair, dict(id='x', map=m, solution=sol), broad)
        m, sol = info['map'], info['solution']
        if not row['remaining']:
            break
    return m


def merge_out(m, subject_fn, log):
    """Last resort for an issue the repair passes cannot clear (a too-short
    border, a neck that every separator leaves behind): merge one of the panes
    involved into a neighbour. The seam must not be part of the silhouette
    (subject|background); the merge that leaves the fewest issues wins, then
    the one whose merged pane is smallest."""
    for _ in range(6):
        issues = audit(m) + visible_contacts.inspect(m)
        if not issues:
            break
        subject = subject_fn(m)
        area = [p.area for p in region_polys(m)]
        panes = set()
        for kind, a, b, _, pt in issues:
            panes |= {r for r in (a, b) if r >= 0}
            if a < 0 and kind == 'ambiguous-junction':
                panes |= {e[k] for e in m['edges'] for k in (4, 5) if math.dist(e[:2], pt) < 1e-3 or math.dist(e[2:4], pt) < 1e-3}
        best = None
        for r in panes:
            for k in m['adj'][r]:
                if subject is not None and subject[r] != subject[k]:
                    continue
                pair = {r, k}
                try:
                    cm = rebuild(m, lambda e: {e[4], e[5]} != pair)
                except (ValueError, RuntimeError, AssertionError):
                    continue
                if cm['count'] != m['count'] - 1:
                    continue
                score = (len(audit(cm) + visible_contacts.inspect(cm)), area[r] + area[k])
                if best is None or score < best[0]:
                    best = (score, cm, pair)
        if best is None or best[0][0] >= len(issues):
            break
        m = best[1]
        log(f'  merged panes {sorted(best[2])}: {best[0][0]} issues left')
    return m


def polish(m, colours, log, subject_fn=None):
    """Leftover audit issues after the main passes: split hidden necks, then
    rerun the junction and contact passes with the silhouette unlocked; merge
    a pane away only when that still leaves something."""
    for n in range(3):
        issues = audit(m) + visible_contacts.inspect(m)
        if not issues:
            break
        if any(i[0] == 'visually-disconnected' for i in issues):
            m = neck_repair(m)
        if [i for i in audit(m) + visible_contacts.inspect(m) if i[0] != 'visually-disconnected']:
            m, _ = finish(m, None, colours)
            m = visible_repair(m, None)
        if report(m, f'polish {n + 1}', log) and n == 1:
            m = merge_out(m, subject_fn or (lambda mm: None), log)
    for key in ('preferred', 'area', 'clearance'):
        m.pop(key, None)
    return m


def report(m, label, log=print):
    issues = audit(m); vis = visible_contacts.inspect(m)
    kinds = {}
    for k, *_ in issues + vis:
        kinds[k] = kinds.get(k, 0) + 1
    log(f'  {label}: {m["count"]} panes, audit {len(issues)}, visible {len(vis)} {kinds}')
    return issues + vis


def preview(m, solution, palette, design, path, issues=(), subject=None):
    from make_maps import render
    tmp = path.with_suffix('.guide.png')
    render(m, solution, palette, tmp)
    g = Image.open(tmp).convert('RGB')
    d = ImageDraw.Draw(g)
    S = 64
    for kind, a, b, v, (x, y) in issues:
        d.ellipse((x * S - 22, y * S - 22, x * S + 22, y * S + 22), outline='#ff00ff', width=6)
    tmp.with_suffix('.labels.png').unlink(missing_ok=True)
    tmp.unlink()
    des = Image.open(design).convert('RGB').resize(g.size)
    sheet = Image.new('RGB', (g.width * 2 + 20, g.height), 'white')
    sheet.paste(des, (0, 0)); sheet.paste(g, (g.width + 20, 0))
    sheet.thumbnail((1400, 1400))
    sheet.save(path)


def focus_weights(m, subject):
    """Subject panes are focal (start blank when the rules allow); without a
    mask use the focal_regions.py fallback (central, prominent panes)."""
    c = Point(m['cols'] / 2, m['rows'] / 2)
    out = []
    for r, p in enumerate(region_polys(m)):
        if subject is not None:
            out.append(round(2 + min(8, p.area ** .5), 3) if subject[r] else 0)
            continue
        central = 1 - min(1, p.centroid.distance(c) / (m['cols'] * .55))
        out.append(round((1 + min(5, p.area ** .5)) * central, 3) if central > .5 else 0)
    return out


def stage(id, t, m, issues, root, log=print):
    import hashlib
    from audit_geometry import fingerprint, VERSION
    meta_file = root / 'design' / f'{id}.json'
    meta = json.loads(meta_file.read_text()) if meta_file.exists() else {}
    palette = [h for _, h in t['palette']]
    wish, subject = wishes(m, t, root, id), subject_of(m, t, root, id)
    prefs, groups = plan(wish, subject)
    _, solution = colour_merge(m, t, root, id, log, keep=1.0)
    kept = sum(s == w for s, w in zip(solution, wish))
    off = intruders(solution, subject, groups) if subject is not None else []
    log(f'  colouring: {kept}/{m["count"]} panes keep their design colour, {len(off)} off-side')
    audit_issues = audit(m)
    info = dict(id=id, name=meta.get('name', id), scene=meta.get('scene', ''), family='vitray', large=False,
                catalogVersion=3, geometryRevision=3, junctionStyle='subject-preserving-t',
                palette=[list(p) for p in t['palette']],
                map=m, solution=solution, geometryHash=hashlib.sha256(json.dumps(m['paths']).encode()).hexdigest(),
                design=dict(wish=wish, subject=subject, groups={str(k): v for k, v in (groups or {}).items()}, offSide=off),
                source=dict(reference=f'tools/stained/vitray/refs/{id}.jpg', design=f'tools/stained/vitray/design/{id}.png',
                            method='Astra design sheet traced by tools/stained/vitray/trace.py'),
                geometryQuality=dict(version=VERSION, valid=not audit_issues, fingerprint=fingerprint(m), issues=audit_issues),
                visibleContactIssues=[i for i in issues if i not in audit_issues],
                clueFocus=dict(version=1, geometry=fingerprint(m), weights=focus_weights(m, subject), primary=[],
                               method='design subject mask' if subject is not None else 'central prominent panes'),
                artworkStyle='stained-glass', artworkNeedsRefresh=True)
    # Only an approved map is staged; a rejected one is kept for review and the
    # pipeline sees the level as unbuilt (it retries, then marks it failed).
    staged, rejected = root / 'work' / f'{id}.map.json', root / 'work' / f'{id}.rejected.json'
    (rejected if audit_issues else staged).write_text(json.dumps(info, ensure_ascii=False, separators=(',', ':')))
    (staged if audit_issues else rejected).unlink(missing_ok=True)
    preview(m, solution, palette, root / 'design' / f'{id}.png', root / 'work' / f'{id}.preview.png', issues)


def build(id, root=HERE, stage_only=False, residual=False):
    lines_out = []

    def log(s):
        lines_out.append(s); print(s, flush=True)
    t, outline, lines = load(id, root)
    geom_file = root / 'work' / f'{id}.geom.json'
    log(id)
    if stage_only and geom_file.exists():
        m = json.loads(geom_file.read_text())
        if residual and report(m, 'staged', log):
            m = polish(m, lambda mm: wishes(mm, t, root, id), log, lambda mm: subject_of(mm, t, root, id))
            geom_file.write_text(json.dumps(m))
    else:
        m = raw_map(t, outline, lines)
        report(m, 'traced', log)
        immutable = silhouette(m, subject_of(m, t, root, id))
        m, _ = finish(m, immutable, lambda mm: wishes(mm, t, root, id))
        report(m, 'finished', log)
        m, _ = colour_merge(m, t, root, id, log)
        report(m, 'colour-merged', log)
        m = visible_repair(m, immutable)
        if report(m, 'visible-repaired', log):
            # Residual crossings sit on the silhouette itself (a background seam
            # meeting a subject corner). Retry those few with the silhouette
            # unlocked; the repairs stay local and are reviewed on the preview.
            m, _ = finish(m, None, lambda mm: wishes(mm, t, root, id))
            m = visible_repair(m, None)
            report(m, 'residual-repaired', log)
        m = polish(m, lambda mm: wishes(mm, t, root, id), log, lambda mm: subject_of(mm, t, root, id))
        geom_file.write_text(json.dumps(m))
    issues = report(m, 'final', log)
    stage(id, t, m, issues, root, log)
    return not audit(m)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('ids', nargs='+')
    ap.add_argument('--root', type=Path, default=HERE)
    ap.add_argument('--stage-only', action='store_true', help='reuse work/<id>.geom.json')
    ap.add_argument('--residual', action='store_true', help='with --stage-only: repair leftover issues with the silhouette unlocked')
    a = ap.parse_args()
    ok = [build(id, a.root, a.stage_only, a.residual) for id in a.ids]
    # An unapproved map is staged for review but fails the run, so the
    # pipeline keeps it in the build stage instead of sending it to glass.
    sys.exit(0 if all(ok) else 1)


if __name__ == '__main__':
    main()
