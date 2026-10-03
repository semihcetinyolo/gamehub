"""The stained-glass level designs: outline + lead linework + which colours each pane may take.

Colour index 0..3 refers to that design's palette (hex goes into the guide, names to the image
model). `prefer(x, y)` returns the colours a pane at that point may take, best first; it only
steers the 4-colouring (neighbours always differ). `protect` is the picture's subject: the
automatic background cuts never split it.
"""
import math

from shapely import affinity
from shapely.geometry import Point, Polygon
from shapely.ops import unary_union

from geom import (arc, bez, circle, clipout, ellipse, mirror, o_circle, o_diamond, o_drop, o_egg, o_gothic, o_heart,
                  o_hex, o_octagon, o_oval, o_round_arch, o_scallop, o_shield, petal, petal_poly, poly_of, radial,
                  ray, reg_polygon, ring, rot, seg, spline, star, wave)

DESIGNS = {}


SYMMETRIC = {'lotus', 'compass', 'medallion', 'kaleido', 'heart', 'snowflake', 'rosewindow', 'tulip', 'owl', 'fox', 'peacock', 'lighthouse'}


def design(id, name, scene, palette, outline, max_area=5.0, min_r=0.36):
    def wrap(fn):
        DESIGNS[id] = dict(id=id, name=name, scene=scene, palette=palette, outline=outline, build=fn, min_r=min_r, max_area=max_area,
                           mirror_x=6 if id in SYMMETRIC else None)
        return fn
    return wrap


def sector(x, y, cx, cy, n, offset=0):
    a = (math.degrees(math.atan2(y - cy, x - cx)) - offset) % 360
    return int(a // (360 / n))


def rays(c, n, offset=0, r0=0, r1=20):
    return [ray(c, offset + 360 * i / n, r1, r0) for i in range(n)]


def burst(c, n, radii, offset=0, r0=0, r1=20):
    """Sunburst: rings at radii, rays between consecutive rings shifted half a step so every
    ray ends on a ring (T-junction) instead of crossing it."""
    out = [circle(c[0], c[1], r) for r in radii]
    edges = [r0, *radii, r1]
    for k in range(len(edges) - 1):
        out += rays(c, n, offset + (180 / n if k % 2 else 0), edges[k], edges[k + 1])
    return out


def P(*shapes):
    return unary_union([s if isinstance(s, Polygon) else Polygon(s.coords).buffer(0) for s in shapes])


def within(poly, x, y):
    return poly.contains(Point(x, y))


# ---------------------------------------------------------------- sun flower
@design('flower', 'Güneş Çiçeği', 'a beautiful swirling ten-petal sunflower / botanical sun medallion',
        [('leaf green', '#3d8c11'), ('sun yellow', '#f9d20f'), ('flame orange', '#e04903'), ('azure blue', '#0d83d7')],
        o_circle(6), max_area=9.0)
def flower():
    n, c = 10, (6, 8)

    def polar(r, t):
        return (c[0] + r * math.cos(t), c[1] + r * math.sin(t))
    centre = P(circle(6, 8, 1.35))
    lines = [centre.exterior]
    for i in range(n):
        a = -math.pi / 2 + i * 2 * math.pi / n
        b = a + 2 * math.pi / n
        lines.append(bez(polar(1.35, a), polar(3.0, a + .19), polar(3.7, a - .13), polar(4.5, a)))
        lines.append(bez(polar(4.5, a), polar(5.1, a + .20), polar(5.1, b - .20), polar(4.5, b)))
        lines.append(seg(polar(4.5, a), polar(6.5, a)))

    def prefer(x, y):
        d = math.dist((x, y), c)
        if d < 1.35:
            return (1,)
        k = sector(x, y, *c, n, -90 + 8)
        if d < 4.6:
            return (2, 0) if k % 2 else (0, 3)
        return (3, 1) if k % 2 else (1, 3)
    return lines, prefer, None


# ---------------------------------------------------------------- tulip
@design('tulip', 'Lale', 'a single elegant red tulip with two broad leaves in front of a radiant sunburst',
        [('crimson red', '#c8102e'), ('rose pink', '#f28cb1'), ('leaf green', '#3f9b2f'), ('warm cream ivory', '#f4e3b2')],
        o_round_arch(6), max_area=7.5)
def tulip():
    cup = spline([(3.6, 4.2), (3.9, 7.6), (6, 8.7), (8.1, 7.6), (8.4, 4.2)])
    crown = spline([(3.6, 4.2), (4.6, 4.5), (5.2, 4.4), (6, 2.6), (6.8, 4.4), (7.4, 4.5), (8.4, 4.2)])
    inner = [spline([(5.2, 4.4), (5.3, 7.2), (5.95, 8.7)]), spline([(6.8, 4.4), (6.7, 7.2), (6.05, 8.7)])]
    head = poly_of(cup, spline([(8.4, 4.2), (7.4, 4.5), (6.8, 4.4), (6, 2.6), (5.2, 4.4), (4.6, 4.5), (3.6, 4.2)]))
    stem = Polygon([(5.5, 8.4), (6.5, 8.4), (6.5, 16.2), (5.5, 16.2)])
    leafL = poly_of(spline([(5.6, 15.8), (3.0, 13.8), (1.6, 10.4), (2.1, 10.2)]), spline([(2.1, 10.2), (3.8, 12.2), (5.6, 13.0)]))
    leafR = poly_of(spline([(6.4, 15.4), (9.0, 13.4), (10.4, 10.9), (9.9, 10.7)]), spline([(9.9, 10.7), (8.4, 12.0), (6.4, 12.8)]))
    plant = unary_union([stem, leafL, leafR]).intersection(o_round_arch(6))
    sub = [head, plant]
    bg = clipout(burst((6, 5.8), 16, [4.4, 7.4], 11.25), *sub)
    lines = [cup, crown, *inner, plant.exterior, *bg]
    centre = Polygon(list(inner[0].coords) + list(inner[1].coords)[::-1] + [(6, 2.6)]).buffer(0)

    def prefer(x, y):
        if within(head, x, y):
            return (0,) if within(centre.buffer(0.1), x, y) else (1, 0)
        if within(plant, x, y):
            return (2,)
        return (3, 1)
    return lines, prefer, unary_union(sub)


# ---------------------------------------------------------------- fish
@design('fish', 'Mercan Balığı', 'a big friendly tropical fish swimming among bubbles over a sandy sea floor',
        [('coral orange', '#ff6f3c'), ('bright aqua', '#2ec4c6'), ('deep navy blue', '#1b3a7a'), ('sand gold', '#e8c15a')],
        o_oval(6, 8), max_area=6.5)
def fish():
    body = ellipse(5.6, 7.6, 3.7, 2.5)
    tail = ring([(8.9, 7.6), (11.1, 5.2), (10.5, 7.6), (11.1, 10.0)])
    finT = poly_of(spline([(4.0, 5.3), (5.0, 3.4), (7.4, 5.3)]))
    finB = poly_of(spline([(4.4, 9.9), (5.4, 11.4), (6.9, 9.9)]))
    gill = arc(2.8, 7.6, 2.1, -58, 58)
    eye = circle(3.2, 7.0, 0.6)
    scales = [arc(6.0, 7.6, 1.8, -75, 75), arc(7.6, 7.6, 1.5, -68, 68)]
    fishp = unary_union([P(body), P(tail), finT, finB])
    sand = spline([(-1, 13.4), (3, 12.8), (7, 13.6), (13, 12.9)])
    waves = clipout([wave(2.4, 0.4, 5.0), wave(4.4, 0.35, 6.0, 1.0), wave(10.9, 0.35, 5.5, 2.1), wave(14.8, 0.3, 4.0, 0.5)], fishp)
    bubbles = [circle(9.2, 3.4, 0.75), circle(7.9, 2.0, 0.55), circle(1.9, 11.6, 0.65)]
    lines = [body, tail, finT.exterior, finB.exterior, gill, eye, *scales, sand, *waves, *bubbles]

    def prefer(x, y):
        if math.dist((x, y), (3.2, 7.0)) < 0.6:
            return (2,)
        if within(P(body), x, y):
            return (0, 3)
        if within(fishp, x, y):
            return (3, 0) if y < 6 or y > 9 else (0, 3)
        if y > 13.2:
            return (3,)
        for b in ((9.2, 3.4, .75), (7.9, 2.0, .55), (1.9, 11.6, .65)):
            if math.dist((x, y), b[:2]) < b[2]:
                return (1,)
        return (1, 2)
    return lines, prefer, fishp


# ---------------------------------------------------------------- moon & stars
@design('moon', 'Ay ve Yıldızlar', 'a crescent moon and twinkling stars in a swirling night sky',
        [('midnight blue', '#1d2b6b'), ('pale silver', '#d8dde6'), ('warm gold', '#f2b81b'), ('teal', '#13878a')],
        o_circle(6), max_area=5.5)
def moon():
    crescent = P(circle(5.0, 8.0, 3.5)).difference(P(circle(6.5, 7.2, 3.0)))
    stars = [star(9.5, 4.3, 1.25, 0.55, 5), star(9.6, 11.0, 1.0, 0.45, 5), star(3.6, 2.9, 0.85, 0.4, 5), star(2.4, 12.6, 0.8, 0.36, 5)]
    sub = [crescent, *[P(s) for s in stars]]
    swirls = clipout([spline([(-1, 5.6), (2, 3.8), (5.6, 3.6), (8, 1.6), (13, 2.2)]),
                      spline([(-1, 10.8), (3, 12.6), (6.4, 11.4), (9.4, 13.6), (13, 12.6)]),
                      spline([(6.8, 8.6), (9.4, 8.4), (13, 6.6)]),
                      spline([(8.6, 15), (10.6, 9.6), (13, 9.0)]),
                      circle(6.5, 7.2, 4.6)], *sub)
    lines = [crescent.exterior, *[s for s in stars], *swirls]

    def prefer(x, y):
        if within(crescent, x, y):
            return (1,)
        if any(within(s, x, y) for s in sub[1:]):
            return (2,)
        return (0, 3)
    return lines, prefer, unary_union(sub)


# ---------------------------------------------------------------- heart rosette
@design('heart', 'Kalp Rozeti', 'a heart-shaped rosette of radiant petals around a small glowing heart',
        [('ruby red', '#b0102f'), ('soft peach', '#ffb38a'), ('mint green', '#7fd1a8'), ('gold', '#e9b523')],
        o_heart(), max_area=4.5)
def heart():
    c = (6, 7.4)
    small = affinity.scale(o_heart(), 0.26, 0.26, origin=(6, 6.9))
    small = affinity.translate(small, 0, 0.35)
    small = small.buffer(0.35, 16).buffer(-0.35, 16)  # round the cleft so nothing points into it
    petals = [petal_poly(c, -90 + i * 36, 3.7, 1.05) for i in range(10)]
    lines = [small.exterior, *clipout([p.exterior for p in petals], small), circle(6, 7.4, 4.6)]
    lines += clipout(rays(c, 10, -72, 4.6), *petals)

    def prefer(x, y):
        if within(small, x, y):
            return (0,)
        if any(within(p, x, y) for p in petals):
            return (1, 2) if sector(x, y, *c, 10, -108) % 2 else (2, 1)
        return (3, 0) if math.dist((x, y), c) < 4.6 else (0, 3)
    return lines, prefer, unary_union([small, *petals])


# ---------------------------------------------------------------- sailboat
@design('sailboat', 'Yelkenli', 'a sailboat with two white sails on a sunny blue sea, the sun shining behind',
        [('ocean blue', '#1f6fb2'), ('sail white', '#f5f5f0'), ('coral red', '#e2483d'), ('sunny yellow', '#ffd23f')],
        o_shield(), max_area=6.0)
def sailboat():
    jib = poly_of(spline([(6.0, 2.4), (3.8, 6.6), (1.6, 10.4)]), seg((1.6, 10.4), (6.0, 10.4)))
    main = poly_of(spline([(6.0, 2.4), (8.6, 6.6), (10.4, 10.4)]), seg((10.4, 10.4), (6.0, 10.4)))
    hull = Polygon([(1.2, 10.9), (10.8, 10.9), (9.2, 12.7), (2.8, 12.7)])
    mast = Polygon([(5.6, 10.4), (6.4, 10.4), (6.4, 10.9), (5.6, 10.9)])
    boat = unary_union([jib, main, hull, mast])
    sun = P(circle(9.4, 3.3, 1.5))
    sea = [wave(13.4, 0.3, 4.0), wave(14.7, 0.3, 3.6, 1.2)]
    sky = clipout(rays((9.4, 3.3), 12, 8, 1.5) + [seg((-1, 10.9), (13, 10.9))], boat, sun)
    lines = [jib.exterior, main.exterior, hull.exterior, seg((6.0, 2.4), (6.0, 10.4)), sun.exterior, *sky, *sea,
             seg((4.4, 10.9), (4.9, 12.7)), seg((7.6, 10.9), (7.1, 12.7))]

    def prefer(x, y):
        if within(jib, x, y) or within(main, x, y):
            return (1,)
        if within(hull, x, y):
            return (2, 3)
        if within(sun, x, y):
            return (3,)
        if y > 10.9:
            return (0, 1)
        return (0, 3)
    return lines, prefer, unary_union([boat, sun])


# ---------------------------------------------------------------- compass rose
@design('compass', 'Pusula Gülü', 'an ornate antique compass rose with an eight-pointed star, like on an old sea chart',
        [('burgundy', '#7d1d3f'), ('antique gold', '#d4a72c'), ('ivory', '#f3ead2'), ('forest green', '#2e6b4f')],
        o_octagon(3.2), max_area=5.0)
def compass():
    c = (6, 8)
    lines, pts = [], []
    for i in range(16):
        a = math.radians(-90 + i * 22.5)
        r = 4.9 if i % 4 == 0 else (3.4 if i % 2 == 0 else 1.25)
        pts.append((c[0] + r * math.cos(a), c[1] + r * math.sin(a)))
    starp = Polygon(pts)
    for i in range(0, 16, 2):
        lines.append(seg(c, pts[i]))
    lines += [starp.exterior, circle(6, 8, 0.8), circle(6, 8, 5.5)]
    lines += clipout(rays(c, 16, -90 + 11.25, 0, 5.5), starp)
    lines += rays(c, 8, -67.5, 5.5, 12)

    def prefer(x, y):
        d = math.dist((x, y), c)
        if d < 0.8:
            return (0,)
        if within(starp, x, y):
            k = sector(x, y, *c, 16, -90)
            return (1,) if k % 2 == 0 else (0,)
        if d < 5.5:
            return (2, 3)
        return (3, 0)
    return lines, prefer, starp


# ---------------------------------------------------------------- lighthouse
@design('lighthouse', 'Deniz Feneri', 'a striped lighthouse on rocks casting beams of light over the sea at dusk',
        [('signal red', '#d7263d'), ('white', '#f7f4ea'), ('navy blue', '#1b2f5e'), ('sunset yellow', '#f9a620')],
        o_gothic(), max_area=6.0)
def lighthouse():
    tower = Polygon([(4.4, 13.2), (5.2, 5.4), (6.8, 5.4), (7.6, 13.2)])
    lantern = Polygon([(5.0, 5.4), (5.0, 3.9), (7.0, 3.9), (7.0, 5.4)])
    roof = Polygon([(4.7, 3.9), (6, 2.4), (7.3, 3.9)])
    house = unary_union([tower, lantern, roof])
    beamL = Polygon([(5.0, 4.3), (-1, 2.0), (-1, 7.4), (5.0, 5.0)])
    beamR = affinity.scale(beamL, -1, 1, origin=(6, 0))
    bands = [seg((4.6, 11.2), (7.4, 11.2)), seg((4.83, 9.0), (7.17, 9.0)), seg((5.03, 7.1), (6.97, 7.1))]
    rocks = [spline([(-1, 13.6), (2.2, 12.4), (4.4, 13.2)]), spline([(7.6, 13.2), (9.6, 12.2), (13, 13.2)])]
    sea = [spline([(-1, 14.4), (3, 14.9), (6, 14.2), (9, 14.9), (13, 14.4)])]
    sky = clipout(burst((6, 4.6), 14, [4.4]), house, beamL, beamR)
    lines = [house.exterior, lantern.exterior, roof.exterior, *bands, beamL.exterior, beamR.exterior, *rocks, *sea, *sky]

    def prefer(x, y):
        if within(roof, x, y):
            return (0,)
        if within(lantern, x, y):
            return (3,)
        if within(tower, x, y):
            return (0,) if (y > 11.2 or 7.1 < y < 9.0) else (1,)
        if within(beamL, x, y) or within(beamR, x, y):
            return (3, 1)
        if y > 13.0:
            return (2, 1)
        return (2, 0)
    return lines, prefer, unary_union([house, beamL, beamR])


# ---------------------------------------------------------------- tree of life
@design('tree', 'Hayat Ağacı', 'a tree of life with a strong trunk and a round leafy crown on a green hill, sun rays behind',
        [('emerald green', '#119a54'), ('chocolate brown', '#6b3e26'), ('amber', '#f0a202'), ('sky blue', '#6cb4e4')],
        o_round_arch(6), max_area=6.0)
def tree():
    trunk = poly_of(spline([(5.0, 14.6), (5.4, 11.5), (5.2, 9.6), (3.9, 8.0)]), seg((3.9, 8.0), (8.1, 8.0)),
                    spline([(8.1, 8.0), (6.8, 9.6), (6.6, 11.5), (7.0, 14.6)]))
    blobs = [P(circle(*b)) for b in ((6, 5.4, 2.2), (3.3, 7.0, 1.7), (8.7, 7.0, 1.7), (6, 2.6, 1.6), (3.7, 4.0, 1.5), (8.3, 4.0, 1.5))]
    crown = unary_union(blobs)
    hill = spline([(-1, 13.4), (3, 14.2), (6, 14.6), (9, 14.2), (13, 13.4)])
    tree_p = unary_union([trunk, crown])
    sky = clipout(burst((6, 5.4), 14, [5.2], 6), tree_p)
    lines = [trunk.exterior, *[b.exterior for b in blobs], hill, seg((-1, 15.2), (13, 15.2)), *sky]

    def prefer(x, y):
        if within(trunk, x, y) and not within(crown, x, y):
            return (1,)
        if within(crown, x, y):
            return (0, 2)
        if y > 13.6:
            return (0, 2)
        return (3, 2)
    return lines, prefer, tree_p


# ---------------------------------------------------------------- peacock feather
@design('peacock', 'Tavus Tüyü', 'a single shimmering peacock feather with its eye and flowing barbs',
        [('sapphire blue', '#0f4c9c'), ('peacock teal', '#00a59b'), ('bright gold', '#f5c518'), ('bronze brown', '#8a5a2b')],
        o_drop(True), max_area=5.0)
def peacock():
    eyes = [(0.9, 1.2), (1.7, 2.2), (2.6, 3.3), (3.6, 4.6)]
    rings_ = [ellipse(6, 7.6 - 0.15 * i, rx, ry) for i, (rx, ry) in enumerate(eyes)]
    outer = P(rings_[-1])
    shaft = Polygon([(5.6, 11.8), (6.4, 11.8), (6.4, 16.5), (5.6, 16.5)])
    barbs = []
    for k in range(6):
        y = 1.6 + k * 2.4
        barbs.append(spline([(6.4, y + 1.6), (8.5, y + 0.5), (12.5, y - 1.4)]))
        barbs.append(spline([(5.6, y + 1.6), (3.5, y + 0.5), (-0.5, y - 1.4)]))
    lines = [*rings_, shaft.exterior, *clipout(barbs + [seg((6, -1), (6, 3))], outer, shaft)]

    def prefer(x, y):
        dx, dy = x - 6, y - 7.4
        for i, (rx, ry) in enumerate(eyes):
            if (dx / rx) ** 2 + (dy / ry) ** 2 < 1:
                return [(0,), (2,), (1,), (3,)][i]
        if within(shaft, x, y):
            return (3,)
        return (1, 0) if x > 6 else (0, 1)
    return lines, prefer, unary_union([outer, shaft])


# ---------------------------------------------------------------- bird
@design('bird', 'Bahar Kuşu', 'a cheerful orange songbird perched on a branch with pink blossoms, sun behind',
        [('tangerine orange', '#ff8a00'), ('bubblegum pink', '#ff5fa2'), ('sky blue', '#3fa7e8'), ('leaf green', '#5cb338')],
        o_circle(6), max_area=5.0)
def bird():
    body = unary_union([P(spline([(3.2, 7.4), (4.6, 5.4), (7.0, 5.2), (8.6, 6.8), (8.0, 9.4), (5.4, 10.2), (3.2, 7.4)])), P(circle(3.8, 6.2, 1.5))])
    beak = Polygon([(2.45, 5.75), (1.2, 6.35), (2.45, 6.8)])
    wing = P(spline([(5.0, 7.0), (7.0, 6.2), (8.5, 7.6), (7.0, 8.7), (5.0, 7.0)]))
    tail = poly_of(spline([(8.0, 8.2), (10.2, 8.4), (11.8, 9.6)]), spline([(11.8, 9.6), (10.6, 10.6), (9.6, 10.4), (7.6, 9.6)]))
    branch = poly_of(spline([(-1, 11.0), (4, 10.4), (8, 10.8), (13, 10.0)]), seg((13, 10.0), (13, 11.2)),
                     spline([(13, 11.2), (8, 12.0), (4, 11.6), (-1, 12.2)]))
    leaves = [petal_poly((3.0, 11.8), 120, 2.6, 0.95), petal_poly((8.8, 11.6), 60, 2.6, 0.95)]
    blossoms = [P(circle(10.8, 9.2, 0.75)), P(circle(1.6, 9.8, 0.75))]
    sun = P(circle(9.4, 3.2, 1.6))
    birdp = unary_union([body, beak, wing, tail])
    sub = [birdp, branch, *leaves, *blossoms, sun]
    sky = clipout(rays((9.4, 3.2), 12, 0, 1.6) + [seg((-1, 12.9), (13, 12.5))], *sub)
    lines = [body.exterior, beak.exterior, wing.exterior, tail.exterior, branch.exterior, *[l.exterior for l in leaves],
             *[b.exterior for b in blossoms], sun.exterior, *sky, circle(3.4, 6.0, 0.35)]

    def prefer(x, y):
        if within(wing, x, y) or within(beak, x, y):
            return (1,)
        if within(birdp, x, y):
            return (0,)
        if any(within(b, x, y) for b in blossoms):
            return (1,)
        if any(within(l, x, y) for l in leaves):
            return (3,)
        if within(branch, x, y):
            return (0, 3)
        if within(sun, x, y):
            return (0,)
        return (2, 3) if y > 12 else (2, 1)
    return lines, prefer, unary_union(sub)


# ---------------------------------------------------------------- snowflake
@design('snowflake', 'Kar Tanesi', 'a crystal snowflake with six branched arms glittering in a winter sky',
        [('ice cyan', '#7fdbff'), ('cobalt blue', '#1747a6'), ('snow white', '#f4f8ff'), ('slate grey', '#5c6b7a')],
        o_hex(True), max_area=5.0)
def snowflake():
    c = (6, 8)
    arm = Polygon([(5.5, 6.6), (5.5, 2.4), (6, 1.5), (6.5, 2.4), (6.5, 6.6)])
    br = [Polygon([(5.5, 4.9), (3.8, 3.1), (4.5, 2.5), (5.5, 3.7)]), Polygon([(6.5, 4.9), (8.2, 3.1), (7.5, 2.5), (6.5, 3.7)])]
    flake = unary_union([p.buffer(0.02) for p in radial([arm, *br], 6, c)] + [Polygon(reg_polygon(6, 8, 1.6, 6, -90))]).buffer(-0.02)
    hexc = Polygon(reg_polygon(6, 8, 1.6, 6, -90))
    lines = [flake.exterior, *[i for i in flake.interiors], hexc.exterior]
    lines += clipout(burst(c, 12, [4.6], -60), flake)

    def prefer(x, y):
        if within(hexc, x, y):
            return (0,)
        if within(flake, x, y):
            return (2,)
        d = math.dist((x, y), c)
        if d < 4.6:
            return (1, 0)
        return (0, 3) if d < 6.4 else (3, 1)
    return lines, prefer, flake


# ---------------------------------------------------------------- lotus
@design('lotus', 'Lotus', 'a blooming pink lotus flower floating on rippling water at golden dawn',
        [('lotus pink', '#f06292'), ('jade green', '#2fa36b'), ('saffron yellow', '#ffb000'), ('deep teal', '#0b5d63')],
        o_diamond(), max_area=4.0)
def lotus():
    base = (6, 10.4)
    spec = [(-90, 4.6, 0.95), (-123, 4.0, 0.85), (-57, 4.0, 0.85), (-155, 3.2, 0.75), (-25, 3.2, 0.75)]
    petals = [petal_poly(base, a, l, w) for a, l, w in spec]
    flower = unary_union(petals)
    pad = P(ellipse(6, 11.9, 4.2, 0.95))
    lines = [p.exterior for p in petals] + [pad.exterior, ellipse(6, 13.0, 2.8, 0.6)]
    lines += clipout(burst(base, 10, [5.0], -180, 0, 9), flower, pad)
    lines += clipout([seg((-1, 11.9), (13, 11.9))], pad)

    def prefer(x, y):
        if within(flower, x, y):
            return (0, 2)
        if within(pad, x, y):
            return (1,)
        return (3, 1)
    return lines, prefer, unary_union([flower, pad])


# ---------------------------------------------------------------- hot-air balloon
@design('balloon', 'Sıcak Hava Balonu', 'a striped hot-air balloon floating between soft clouds',
        [('cherry red', '#e0182d'), ('lemon yellow', '#ffe14d'), ('turquoise', '#1fb5b0'), ('cloud white', '#fbf7ef')],
        o_oval(6, 8), max_area=6.0)
def balloon():
    env = P(spline([(6, 1.2), (9.6, 2.4), (10.0, 6.0), (7.6, 9.8), (6.9, 10.6), (5.1, 10.6), (4.4, 9.8), (2.0, 6.0), (2.4, 2.4), (6, 1.2)]))
    gores = clipout([spline([(6, 0.6), (4.1, 4.2), (4.6, 8.0), (5.2, 11.0)]), spline([(6, 0.6), (7.9, 4.2), (7.4, 8.0), (6.8, 11.0)]),
                     spline([(1.0, 6.0), (6, 6.8), (11.0, 6.0)])], env.exterior.buffer(0.001).envelope.difference(env))
    basket = Polygon([(5.0, 11.8), (7.0, 11.8), (6.7, 13.0), (5.3, 13.0)])
    ropes = [seg((5.1, 10.6), (5.0, 11.8)), seg((6.9, 10.6), (7.0, 11.8))]
    clouds = [P(spline([(-0.5, 12.4), (1.4, 11.2), (2.8, 11.8), (4.2, 11.4), (4.8, 13.2), (2.4, 14.4), (-0.5, 13.8), (-0.5, 12.4)])),
              P(spline([(8.4, 14.2), (9.6, 13.0), (11.2, 13.2), (12.5, 12.6), (12.5, 15.0), (8.4, 14.2)])),
              P(spline([(9.4, 1.0), (10.4, 0.2), (12.5, 0.4), (12.5, 2.6), (10.6, 2.4), (9.4, 1.0)]))]
    sub = [env, basket, *clouds]
    sky = clipout(burst((6, 6.0), 12, [4.7], 15), *sub, Polygon([(5.0, 10.4), (7.0, 10.4), (7.0, 11.9), (5.0, 11.9)]))
    lines = [env.exterior, *gores, basket.exterior, *ropes, *[c.exterior for c in clouds], *sky]

    def prefer(x, y):
        if within(env, x, y):
            k = 0 if (x < 4.4 or x > 7.6) else 1
            return (k,) if y < 6.4 else (1 - k,)
        if within(basket, x, y):
            return (0,)
        if any(within(c, x, y) for c in clouds):
            return (3,)
        return (2, 3)
    return lines, prefer, unary_union(sub)


# ---------------------------------------------------------------- desert cactus
@design('cactus', 'Çöl Kaktüsü', 'a tall saguaro cactus in the desert under a big setting sun with dunes',
        [('terracotta', '#c8553d'), ('desert sand', '#f2cc8f'), ('cactus green', '#3a7d44'), ('turquoise sky', '#3cc5d3')],
        o_round_arch(6), max_area=6.0)
def cactus():
    trunk = P(spline([(5.0, 14.4), (5.0, 5.0), (6, 3.8), (7.0, 5.0), (7.0, 14.4), (5.0, 14.4)]))
    armL = P(spline([(5.05, 10.2), (3.0, 10.0), (2.6, 8.0), (2.8, 6.4), (3.6, 6.4), (3.9, 8.6), (5.05, 9.0)]))
    armR = P(spline([(6.95, 8.8), (9.0, 8.6), (9.4, 6.4), (9.2, 4.8), (8.4, 4.8), (8.2, 7.4), (6.95, 7.6)]))
    cact = unary_union([trunk, armL, armR])
    sun = P(circle(6, 6.2, 4.4))
    dunes = clipout([spline([(-1, 12.8), (3, 12.0), (6.5, 12.8), (9, 12.2), (13, 12.8)]), spline([(-1, 14.6), (4, 14.0), (8, 15.0), (13, 14.2)]),
                     seg((-1, 11.0), (13, 11.0)), seg((2.4, 11.0), (1.4, 16)), seg((9.6, 11.0), (10.6, 16))], cact)
    sunlines = clipout([sun.exterior, *rays((6, 6.2), 10, -90, 4.4)], cact)
    lines = [cact.exterior, *dunes, *sunlines, seg((6, 3.0), (6, 3.8))]

    def prefer(x, y):
        if within(cact, x, y):
            return (2,)
        if y > 11.0:
            return (1, 0)
        if within(sun, x, y):
            return (0, 1)
        return (3, 1)
    return lines, prefer, cact


# ---------------------------------------------------------------- mushrooms
@design('mushroom', 'Mantar Ormanı', 'two spotted red toadstool mushrooms in green grass under a dusky blue sky',
        [('scarlet red', '#d62828'), ('ivory white', '#fff3d6'), ('moss green', '#6a994e'), ('dusky blue', '#3d5a80')],
        o_round_arch(6), max_area=6.0)
def mushroom():
    capA = poly_of(spline([(1.2, 8.0), (2.0, 4.6), (4.6, 3.2), (7.2, 4.6), (8.0, 8.0)]), seg((8.0, 8.0), (1.2, 8.0)))
    capB = poly_of(spline([(7.0, 11.0), (7.6, 8.8), (9.2, 8.0), (10.8, 8.8), (11.4, 11.0)]), seg((11.4, 11.0), (7.0, 11.0)))
    stemA = poly_of(spline([(3.6, 8.0), (3.4, 11.0), (3.3, 14.2)]), seg((3.3, 14.2), (5.9, 14.2)), spline([(5.9, 14.2), (5.8, 11.0), (5.6, 8.0)]))
    stemB = poly_of(spline([(8.6, 11.0), (8.4, 13.0), (8.3, 14.6)]), seg((8.3, 14.6), (10.1, 14.6)), spline([(10.1, 14.6), (10.0, 13.0), (9.8, 11.0)]))
    spots = [P(circle(3.2, 5.8, 0.75)), P(circle(5.6, 5.0, 0.7)), P(circle(9.2, 9.5, 0.55))]
    shrooms = unary_union([capA, capB, stemA, stemB])
    grass = clipout([spline([(-1, 13.0), (2, 12.4), (6, 13.2), (9, 12.6), (13, 13.2)]), seg((-1, 14.8), (13, 14.8)), seg((1.6, 13), (1.4, 16)), seg((7, 13), (7, 16)), seg((11, 13), (11.2, 16))], shrooms)
    sky = clipout(rays((4.6, 5.6), 12, 10, 0, 14), shrooms, Polygon([(-1, 12.4), (13, 12.4), (13, 17), (-1, 17)]))
    lines = [capA.exterior, capB.exterior, stemA.exterior, stemB.exterior, *[s.exterior for s in spots], *grass, *sky]

    def prefer(x, y):
        if any(within(s, x, y) for s in spots):
            return (1,)
        if within(capA, x, y) or within(capB, x, y):
            return (0,)
        if within(stemA, x, y) or within(stemB, x, y):
            return (1,)
        if y > 12.8:
            return (2, 3)
        return (3, 2)
    return lines, prefer, unary_union([shrooms, *spots])


# ---------------------------------------------------------------- cat
@design('cat', 'Ay Işığında Kedi', 'a ginger orange cat sitting on a dark tiled rooftop, gazing at a full yellow moon in a teal night sky',
        [('ginger orange', '#f28a1e'), ('lemon yellow', '#f9e04b'), ('charcoal grey', '#3b3f45'), ('teal', '#16808a')],
        o_round_arch(6), max_area=6.0)
def cat():
    body = P(spline([(4.2, 13.0), (3.8, 10.4), (4.6, 8.2), (5.6, 7.6), (7.2, 8.4), (7.8, 10.8), (7.6, 13.0), (4.2, 13.0)]))
    head = P(circle(5.9, 6.6, 1.6))
    ears = [Polygon([(4.55, 6.0), (4.5, 4.1), (5.7, 5.05)]), Polygon([(7.25, 6.0), (7.3, 4.1), (6.1, 5.05)])]
    tail = poly_of(spline([(7.6, 12.6), (9.4, 12.4), (9.8, 10.4)]), seg((9.8, 10.4), (10.6, 10.4)), spline([(10.6, 10.4), (10.0, 13.1), (7.6, 13.0)]))
    catp = unary_union([body, head, *ears, tail])
    moon = P(circle(6.4, 4.6, 3.6))
    roof = [seg((-1, 13.0), (13, 13.0)), seg((-1, 14.5), (13, 14.5)), *[seg((x, 13.0), (x, 14.5)) for x in (1.6, 4.4, 7.4, 10.4)],
            *[seg((x, 14.5), (x, 16.2)) for x in (3.0, 6.0, 9.0)]]
    chimney = Polygon([(0.8, 13.0), (0.8, 10.2), (2.4, 10.2), (2.4, 13.0)])
    sky = clipout([moon.exterior, *burst((6.4, 4.6), 12, [5.4], 0, 3.6)], catp, chimney)
    lines = [catp.exterior, seg((4.2, 9.0), (4.6, 8.2)), *roof, chimney.exterior, *sky]

    def prefer(x, y):
        if within(catp, x, y):
            return (0,)
        if y > 13.0 or within(chimney, x, y):
            return (2, 3)
        if math.dist((x, y), (6.4, 4.6)) < 3.6:
            return (1,)
        return (3, 1)
    return lines, prefer, unary_union([catp, chimney])


# ---------------------------------------------------------------- rose window
@design('rosewindow', 'Gül Pencere', 'a gothic cathedral rose window with radiating lancets and a ring of roundels',
        [('ruby red', '#a4161a'), ('royal sapphire', '#1e40af'), ('gold', '#f4b400'), ('emerald', '#0f8a5f')],
        o_scallop(12, 5.0, 1.0), max_area=4.0)
def rosewindow():
    c = (6, 8)
    lines = [circle(6, 8, 1.1), circle(6, 8, 3.2), circle(6, 8, 5.0)]
    lancets = []
    for i in range(8):
        a = -90 + i * 45
        lancets.append(petal_poly((6 + 1.1 * math.cos(math.radians(a)), 8 + 1.1 * math.sin(math.radians(a))), a, 2.1, 0.7))
    lines += [l.exterior for l in lancets]
    lines += clipout(rays(c, 8, -67.5, 1.1, 3.2), *lancets)
    rounds = [P(circle(6 + 4.1 * math.cos(math.radians(-90 + i * 30)), 8 + 4.1 * math.sin(math.radians(-90 + i * 30)), 0.7)) for i in range(12)]
    lines += [r.exterior for r in rounds]
    lines += clipout(rays(c, 12, -75, 3.2, 7), *rounds)

    def prefer(x, y):
        d = math.dist((x, y), c)
        if d < 1.1:
            return (2,)
        if any(within(l, x, y) for l in lancets):
            return (1,)
        if d < 3.2:
            return (0, 2)
        if any(within(r, x, y) for r in rounds):
            return (2,)
        if d < 5.0:
            return (1, 3) if sector(x, y, *c, 12, -75) % 2 else (3, 1)
        return (0,)
    return lines, prefer, None


# ---------------------------------------------------------------- mountain sunrise
@design('mountain', 'Dağda Gün Doğumu', 'mountain peaks glowing pink at sunrise, the golden sun rising behind, pine trees by a lake',
        [('rose pink', '#ff7aa2'), ('golden yellow', '#ffc23d'), ('slate blue', '#4a6fa5'), ('pine green', '#1f6f50')],
        o_gothic(10.6), max_area=5.0)
def mountain():
    sun = P(circle(6, 5.0, 1.9))
    peakL = Polygon([(-1, 11.4), (3.4, 5.8), (7.4, 10.8)])
    peakR = Polygon([(4.8, 10.8), (8.6, 5.0), (13, 9.8), (13, 10.8)])
    ridges = [spline([(3.4, 5.8), (3.9, 8.0), (3.5, 9.6), (3.9, 11.2)]), spline([(8.6, 5.0), (9.1, 7.2), (8.7, 8.8), (9.2, 10.8)])]
    trees = [Polygon([(0.6, 13.4), (1.8, 10.0), (3.0, 13.4)]), Polygon([(8.9, 13.4), (10.1, 9.9), (11.3, 13.4)]), Polygon([(2.9, 13.6), (3.8, 11.3), (4.7, 13.6)])]
    mtn = unary_union([peakL, peakR])
    sub = [sun, mtn, *trees]
    sky = clipout(burst((6, 5.0), 12, [3.2], 15, 1.9), *sub)
    lake = clipout([seg((-1, 10.8), (13, 10.8)), spline([(-1, 12.2), (3, 13.4), (6, 13.9), (9, 13.4), (13, 12.2)]),
                    spline([(-1, 14.7), (6, 15.3), (13, 14.7)]), seg((6, 13.9), (6, 15.3))], *trees)
    lines = [sun.exterior, mtn.exterior, peakR.exterior,
             *[t.exterior for t in trees], *sky, *lake]

    def prefer(x, y):
        if any(within(t, x, y) for t in trees):
            return (3,)
        if within(mtn, x, y):
            return (0, 2) if within(peakR, x, y) and within(peakL, x, y) else (2,)
        if within(sun, x, y):
            return (1,)
        if y > 10.8:
            return (2, 3) if 13.4 < y < 15.3 else (3, 2)
        return (0, 1)
    return lines, prefer, unary_union(sub)


# ---------------------------------------------------------------- kaleidoscope
@design('kaleido', 'Kaleydoskop', 'a kaleidoscope mandala of six-fold petals, stars and diamonds',
        [('lime green', '#9bd53a'), ('hot magenta', '#e0218a'), ('deep orange', '#ff7b00'), ('royal blue', '#2b4acb')],
        o_hex(True), max_area=4.0)
def kaleido():
    c = (6, 8)
    hexa = P(star(6, 8, 1.9, 1.1, 6))
    petals = [petal_poly(c, -60 + 60 * i, 4.0, 1.05) for i in range(6)]
    gems = [Polygon([(6 + r * math.cos(math.radians(a + da)), 8 + r * math.sin(math.radians(a + da)))
                     for r, da in ((4.5, 0), (5.3, 9), (6.1, 0), (5.3, -9))]) for a in range(-90, 270, 30)]
    lines = [hexa.exterior, *clipout([p.exterior for p in petals], hexa), circle(6, 8, 4.5)]
    lines += [g.exterior for g in gems]
    lines += clipout(rays(c, 6, -90, 0, 4.5), hexa, *petals)
    lines += clipout(rays(c, 12, -75, 4.5, 12), *gems)
    lines += [circle(6, 8, 0.7)]

    def prefer(x, y):
        d = math.dist((x, y), c)
        if d < 0.7:
            return (2,)
        if within(hexa, x, y):
            return (1, 3)
        if any(within(p, x, y) for p in petals):
            return (0, 2)
        if any(within(g, x, y) for g in gems):
            return (2, 1)
        if d < 4.5:
            return (3, 1)
        return (1, 3)
    return lines, prefer, None


# ---------------------------------------------------------------- owl
@design('owl', 'Gece Baykuşu', 'a wise owl with huge round amber eyes and patterned feathers perched on a branch in a moonlit forest',
        [('chestnut brown', '#7b4b2a'), ('amber', '#ffbf00'), ('snow white', '#f7f7f2'), ('olive green', '#6b8e23')],
        o_egg(), max_area=5.0, min_r=0.34)
def owl():
    body = P(spline([(6, 3.2), (9.4, 3.9), (10.3, 8.2), (8.9, 12.4), (6, 13.3), (3.1, 12.4), (1.7, 8.2), (2.6, 3.9), (6, 3.2)]))
    tufts = [Polygon([(2.8, 4.3), (2.2, 1.8), (4.7, 3.5)]), Polygon([(9.2, 4.3), (9.8, 1.8), (7.3, 3.5)])]
    owlp = unary_union([body, *tufts])
    disc = unary_union([P(circle(4.6, 6.3, 1.95)), P(circle(7.4, 6.3, 1.95))])
    eyes = [P(circle(4.6, 6.3, 1.25)), P(circle(7.4, 6.3, 1.25))]
    pupils = [P(circle(4.6, 6.3, 0.56)), P(circle(7.4, 6.3, 0.56))]
    beak = Polygon([(5.3, 7.4), (6.7, 7.4), (6, 8.9)])
    belly = P(ellipse(6, 11.3, 2.3, 1.7))
    face = unary_union([disc, beak])
    # wings down both sides, each cut into feathers
    wingL = spline([(2.9, 7.4), (3.9, 9.6), (3.6, 12.6)])
    feathers = [l.intersection(body) for l in (seg((1, 9.0), (3.9, 9.3)), seg((1, 10.6), (4.0, 10.9)))]
    wings = [wingL, mirror(wingL), *feathers, *[mirror(f) for f in feathers]]
    # chest: scallop rows, split down the middle
    scallops = [arc(6, 10.3, 1.9, 25, 155), arc(6, 11.6, 1.9, 30, 150), seg((6, 9.4), (6, 13.4))]
    branch = clipout([spline([(-1, 12.9), (4, 12.6), (8, 13.3), (13, 12.6)]), spline([(-1, 14.2), (4, 13.9), (8, 14.6), (13, 13.9)])], owlp)
    moon = P(circle(9.8, 1.9, 1.1))
    sky = clipout(burst((6, 8), 16, [5.3], 11.25, 0, 12), owlp, moon, Polygon([(-1, 12.5), (13, 12.5), (13, 17), (-1, 17)]))
    lines = [owlp.exterior, *clipout([disc.exterior], beak), *[e.exterior for e in eyes + pupils],
             beak.exterior, belly.exterior,
             *clipout(wings, face, belly), *clipout(scallops, Polygon(ellipse(6, 11.2, 6, 8).coords).difference(belly)),
             *branch, moon.exterior, *sky,
             *clipout([seg((x, 14.0), (x, 16.2)) for x in (3, 6, 9)], owlp)]

    def prefer(x, y):
        if any(within(p, x, y) for p in pupils):
            return (0,)
        if any(within(e, x, y) for e in eyes) or within(beak, x, y):
            return (1,)
        if within(disc, x, y):
            return (2,)
        if within(belly, x, y):
            return (2, 1) if (y < 10.4 or 11.5 < y) == (x < 6) else (1, 2)
        if within(owlp, x, y):
            if abs(x - 6) > 1.6 and y > 6.8:  # wing feathers alternate brown / amber
                return (1, 0) if int((y - 6.8) / 1.7) % 2 else (0, 1)
            return (0,)
        if 12.6 < y < 14.4:
            return (0, 1)
        if within(moon, x, y):
            return (2,)
        return (3, 2)
    return lines, prefer, owlp


# ---------------------------------------------------------------- honeybee
@design('bee', 'Bal Arısı', 'a happy honeybee with translucent wings flying over glowing honeycomb cells',
        [('honey amber', '#f29e0c'), ('pale lemon', '#fff07a'), ('slate grey', '#4f5d75'), ('cornflower blue', '#6495ed')],
        o_hex(True), max_area=5.0, min_r=0.34)
def bee():
    lines = []
    s = 1.3
    for row in range(-1, 8):
        for col in range(-1, 7):
            cx = 0.35 + col * s * math.sqrt(3) + (row % 2) * s * math.sqrt(3) / 2
            cy = 9.6 + row * s * 1.5
            lines.append(ring(reg_polygon(cx, cy, s, 6, -90)))
    comb = Polygon([(-1, 8.6), (13, 8.6), (13, 17), (-1, 17)])
    lines = clipout(lines, Polygon([(-1, -1), (13, -1), (13, 8.62), (-1, 8.62)]))
    body = P(ellipse(6.4, 4.8, 2.6, 1.5, -12))
    head = P(circle(3.5, 5.6, 1.0))
    wings = [P(ellipse(5.4, 2.4, 1.6, 0.9, -40)), P(ellipse(7.6, 2.3, 1.4, 0.8, 30))]
    beep = unary_union([body, head, *wings])
    stripes = [seg((5.2, 2.0), (5.8, 7.4)), seg((6.8, 2.0), (7.4, 7.4))]
    sky = clipout(rays((6.2, 4.6), 12, 0) + [seg((-1, 8.6), (13, 8.6))], beep, comb)
    lines += [body.exterior, head.exterior, *[w.exterior for w in wings], *clipout(stripes, unary_union(wings).difference(body), Polygon([(-1, -1), (13, -1), (13, 0), (-1, 0)])), *sky]

    def prefer(x, y):
        if any(within(w, x, y) for w in wings) and not within(body, x, y):
            return (3, 1)
        if within(body, x, y):
            return (2,) if 5.5 < x + (y - 4.8) * 0.1 < 7.1 else (0,)
        if within(head, x, y):
            return (2,)
        if y > 8.6:
            return (0, 1)
        return (3, 1)
    return lines, prefer, beep


# ---------------------------------------------------------------- sea turtle
@design('turtle', 'Deniz Kaplumbağası', 'a sea turtle swimming through sunlit blue water, its shell made of patterned plates',
        [('sea green', '#2a9d8f'), ('sandy beige', '#f1dcb0'), ('salmon coral', '#fa8072'), ('deep sea blue', '#264b7a')],
        o_circle(6), max_area=5.0)
def turtle():
    shell = P(ellipse(6, 8.0, 3.2, 3.9))
    inner = P(ellipse(6, 8.0, 2.5, 3.2))
    head = P(ellipse(6, 3.3, 0.95, 1.15)).difference(shell)
    flippers = [petal_poly((3.4, 6.4), 205, 3.3, 1.05), petal_poly((8.6, 6.4), -25, 3.3, 1.05),
                petal_poly((3.8, 10.6), 140, 2.1, 0.8), petal_poly((8.2, 10.6), 40, 2.1, 0.8)]
    flippers = [f.difference(shell) for f in flippers]
    tail = Polygon([(5.6, 11.7), (6.4, 11.7), (6, 12.9)]).difference(shell)
    plates = [ring(reg_polygon(6, 8.0, 1.05, 6, 0))]
    for k in range(6):
        plates.append(seg((6 + 1.05 * math.cos(math.radians(60 * k)), 8.0 + 1.05 * math.sin(math.radians(60 * k))),
                          (6 + 4 * math.cos(math.radians(60 * k)), 8.0 + 4 * math.sin(math.radians(60 * k)))))
    plates = clipout(plates, Polygon(ellipse(6, 8, 6, 8).coords).difference(inner))
    body = unary_union([shell, head, *flippers, tail])
    water = clipout(burst((6, 8), 14, [5.0], 0), body)
    lines = [shell.exterior, inner.exterior, head.exterior, *[f.exterior for f in flippers if f.geom_type == 'Polygon'], tail.exterior,
             *plates, *water, circle(9.8, 2.6, 0.6), circle(2.4, 13.0, 0.55)]

    def prefer(x, y):
        if within(inner, x, y):
            return (0, 2)
        if within(shell, x, y):
            return (1,)
        if within(body, x, y):
            return (0,)
        return (3, 2)
    return lines, prefer, body


# ---------------------------------------------------------------- star medallion
@design('medallion', 'Yıldız Madalyon', 'an ottoman-style eight-pointed star medallion with interlaced tiles',
        [('turquoise', '#30c5c0'), ('cobalt blue', '#0047ab'), ('saffron', '#f4a300'), ('brick red', '#b23a2b')],
        o_octagon(3.2), max_area=6.0)
def medallion():
    c = (6, 8)
    sq1 = ring([(6 + 4.6 * math.cos(math.radians(a)), 8 + 4.6 * math.sin(math.radians(a))) for a in (-90, 0, 90, 180)])
    sq2 = rot(sq1, 45, c)
    inner = ring([(6 + 2.0 * math.cos(math.radians(a)), 8 + 2.0 * math.sin(math.radians(a))) for a in range(-90, 270, 45)])
    lines = [sq1, sq2, inner, circle(6, 8, 0.9), circle(6, 8, 5.3)]
    lines += radial([ray(c, -90, 2.0, 0.9)], 8, c, 22.5)
    lines += radial([ray(c, -90, 9, 5.3)], 8, c, 22.5)
    starp = unary_union([P(sq1), P(sq2)])

    def prefer(x, y):
        d = math.dist((x, y), c)
        if d < 0.9:
            return (2,)
        if d < 2.0:
            return (0, 3)
        if within(starp, x, y):
            return (1, 2) if sector(x, y, *c, 16, -90) % 2 else (2, 1)
        if d < 5.3:
            return (0, 3)
        return (3, 0)
    return lines, prefer, None


# ---------------------------------------------------------------- fox
@design('fox', 'Orman Tilkisi', 'a clever red fox face peeking out between dark green ferns',
        [('fox orange', '#f26b1d'), ('snow white', '#fafafa'), ('forest green', '#2d6a4f'), ('charcoal', '#33363b')],
        o_diamond(), max_area=4.5, min_r=0.34)
def fox():
    face = Polygon([(6, 12.6), (2.4, 7.2), (3.0, 4.0), (4.6, 6.0), (7.4, 6.0), (9.0, 4.0), (9.6, 7.2)])
    cheeks = [poly_of(spline([(2.4, 7.2), (4.4, 8.4), (5.2, 10.2), (6, 12.6)]), seg((6, 12.6), (2.4, 7.2))),
              poly_of(spline([(9.6, 7.2), (7.6, 8.4), (6.8, 10.2), (6, 12.6)]), seg((6, 12.6), (9.6, 7.2)))]
    ears = [Polygon([(3.0, 4.0), (3.55, 5.3), (4.3, 5.7)]), Polygon([(9.0, 4.0), (8.45, 5.3), (7.7, 5.7)])]
    eyes = [P(ellipse(4.7, 7.7, 0.6, 0.42, 20)), P(ellipse(7.3, 7.7, 0.6, 0.42, -20))]
    nose = P(ellipse(6, 11.6, 0.62, 0.45))
    ferns = [petal_poly((6, 16), -128, 5.4, 1.1), petal_poly((6, 16), -52, 5.4, 1.1), petal_poly((6, 0), 125, 4.4, 0.95), petal_poly((6, 0), 55, 4.4, 0.95)]
    ferns = [f.difference(face) for f in ferns]
    lines = [face.exterior, *[c.exterior for c in cheeks], *[e.exterior for e in ears], *[e.exterior for e in eyes], nose.exterior]
    lines += [f.exterior for f in ferns if f.geom_type == 'Polygon']
    lines += clipout([seg((-1, 8), (2.4, 7.2)), seg((13, 8), (9.6, 7.2)), seg((6, -1), (6, 6.0)), seg((6, 12.6), (6, 17))], *ferns)

    def prefer(x, y):
        if any(within(e, x, y) for e in eyes) or within(nose, x, y):
            return (3,)
        if any(within(e, x, y) for e in ears):
            return (3, 1)
        if within(face, x, y):
            return (1,) if any(within(c, x, y) for c in cheeks) else (0,)
        if any(within(f, x, y) for f in ferns):
            return (2,)
        return (3, 2)
    return lines, prefer, face
