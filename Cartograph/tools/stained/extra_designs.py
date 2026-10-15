"""Levels 26–50: distinct motifs using the same geometry/colouring pipeline as levels 1–25."""
import math
import shapely

from shapely import affinity
from shapely.geometry import Point, Polygon
from shapely.ops import unary_union

from geom import (circle, ellipse, spline, seg, petal_poly,
                  o_round_arch, o_oval, o_circle, o_hex, o_octagon, o_drop, o_shield)


def oval(x, y, rx, ry, rot=0):
    return Polygon(ellipse(x, y, rx, ry, rot).coords).buffer(0)


def soft(points):
    return Polygon(spline(points, closed=True).coords).buffer(0)


def poly(points):
    return Polygon(points).buffer(0)


def compose(parts, style=0):
    """Front-to-back coloured shapes; background seams stop at the subject silhouette."""
    occupied = Polygon()
    visible = []
    for shape, preference in parts:
        shape = shapely.set_precision(shape.buffer(0), .001)
        region = shape.difference(occupied)
        if not region.is_empty:
            visible.append((region, (preference,) if isinstance(preference, int) else preference))
        occupied = unary_union([occupied, shape])
    lines = []
    for region, _ in visible:
        for piece in getattr(region, 'geoms', [region]):
            if piece.geom_type == 'Polygon':
                lines += [piece.exterior, *piece.interiors]
    # Staggered rays terminate on rings, keeping background contacts readable.
    center = (6, 8)
    radii = [5.0] if style % 3 else [4.8, 6.7]
    network = [circle(*center, radius) for radius in radii]
    limits = [0, *radii, 13]
    sectors = 12 if style % 2 else 10
    for band in range(len(limits) - 1):
        for i in range(sectors):
            angle = math.radians(360 * i / sectors + band * 180 / sectors + style * 7)
            network.append(seg(*[(6 + r * math.cos(angle), 8 + r * math.sin(angle)) for r in limits[band:band + 2]]))
    for line in network:
        clipped = line.difference(occupied)
        lines += [g for g in getattr(clipped, 'geoms', [clipped]) if g.geom_type == 'LineString' and g.length > .05]

    def prefer(x, y):
        p = Point(x, y)
        for region, preference in visible:
            if region.covers(p):
                return preference
        return (3, 2, 1)
    return lines, prefer, occupied


def butterflygarden():
    wings = [oval(3.6, 6.3, 2.5, 3.2, -25), oval(8.4, 6.3, 2.5, 3.2, 25),
             oval(4.1, 10.3, 1.95, 2.55, 25), oval(7.9, 10.3, 1.95, 2.55, -25)]
    return compose([(seg((6, 4), (6, 12)).buffer(.7), 2), (oval(3.4, 6.2, 1.1, 1.6, -25), 1),
                    (oval(8.6, 6.2, 1.1, 1.6, 25), 1), (oval(4.1, 10.7, .85, 1.15), 2),
                    (oval(7.9, 10.7, .85, 1.15), 2), *[(w, 0) for w in wings]], 1)


def dragonfly():
    parts = [(oval(6, 5.2, .9, 1), 1), (oval(6, 9, .55, 3.5), 0)]
    for y, angle in [(6.5, -18), (8.5, 18)]:
        parts += [(oval(3.5, y, 2.8, .9, angle), 2), (oval(8.5, y, 2.8, .9, -angle), 2)]
    parts += [(soft([(1, 13.8), (4, 12.8), (7, 13.2), (11, 12.2), (12, 16), (0, 16)]), 1)]
    return compose(parts, 4)


def snail():
    body = soft([(1, 12), (4, 11), (7.3, 10.7), (8.7, 6.8), (10, 6.4), (10.7, 8), (10, 11), (11.4, 12.8), (7, 13.6), (2, 13.5)])
    return compose([(oval(9.7, 7.3, .48, .5), 3), (oval(4.7, 8.8, .85, .85), 1),
                    (oval(4.7, 8.8, 1.8, 1.8), 3), (oval(4.7, 8.8, 2.7, 2.7), 1),
                    (oval(4.7, 8.8, 3.6, 3.6), 0), (body, 2)], 3)


def seashell():
    shell = soft([(6, 12.7), (1.3, 9.3), (1.1, 6.1), (3.1, 3.8), (6, 3), (8.9, 3.8), (10.9, 6.1), (10.7, 9.3)])
    lines, _, protect = compose([(shell, 0)], 4)
    for x in [3.3, 5.1, 6.9, 8.7]:
        lines.append(seg((x, 1), (x, 14)).intersection(shell))
    def prefer(x, y):
        if shell.covers(Point(x, y)):
            return (int((x - 1.5) / 1.8) % 2,)
        return (3, 2, 1)
    return lines, prefer, protect


def jellyfish():
    cap = soft([(1.6, 7.6), (2.5, 4.2), (6, 2.8), (9.5, 4.2), (10.4, 7.6), (8, 8.1), (6, 7.5), (4, 8.1)])
    parts = [(oval(6, 5.4, 1.6, 1.9), 1), (cap, 0)]
    for i, x in enumerate([3.2, 5.0, 7.0, 8.8]):
        ribbon = spline([(x, 7), (x - .3, 9.7), (x + .5, 11.5), (x, 13.5)]).buffer(.38, cap_style=1)
        parts.append((ribbon, 1 if i % 2 else 2))
    return compose(parts, 5)


def whale():
    body = soft([(1.1, 8.8), (2.6, 6), (5.9, 5.7), (8.2, 7), (9.7, 7.1), (10.8, 5.5), (11.2, 8.2), (9.6, 9.2), (7.2, 11), (3.3, 11.6), (1.5, 10.5)])
    belly = oval(4.9, 11, 3.8, 1.4).intersection(body)
    fin = petal_poly((6, 9), 120, 3, 1)
    return compose([(oval(2.7, 8.4, .65, .65), 3), (belly, 1), (fin, 2), (body, 0),
                    (petal_poly((4, 4.7), -125, 2.4, .9), 1), (petal_poly((4.2, 4.7), -55, 2.4, .9), 1)], 5)


def penguin():
    parts = [(oval(6, 6.5, .95, .7), 2),
             (oval(4.5, 4.8, .65, .7), 1), (oval(7.5, 4.8, .65, .7), 1),
             (oval(6, 10, 2.2, 2.65), 1),
             (oval(6, 8, 3.5, 5.3), 0), (oval(2.4, 9, .9, 2.8, 22), 0), (oval(9.6, 9, .9, 2.8, -22), 0),
             (oval(4.5, 13.1, 1.2, .65), 2), (oval(7.5, 13.1, 1.2, .65), 2)]
    return compose(parts, 7)


def rabbit():
    return compose([(oval(4.5, 7.2, .65, .7), 3), (oval(7.5, 7.2, .65, .7), 3),
                    (oval(6, 8.7, .7, .6), 0), (oval(6, 11.9, 1.5, 1.5), 0),
                    (oval(6, 7.8, 2.9, 2.6), 1), (oval(4.1, 3.4, 1.2, 2.7, -14), 0),
                    (oval(7.9, 3.4, 1.2, 2.7, 14), 0), (oval(6, 11.9, 2.9, 2.7), 1)], 8)


def bear():
    return compose([(oval(4.5, 6.6, .66, .68), 3), (oval(7.5, 6.6, .66, .68), 3),
                    (oval(6, 9, .65, .65), 3), (oval(6, 9, 1.9, 1.65), 1),
                    (oval(2.8, 4.3, .8, .85), 1), (oval(9.2, 4.3, .8, .85), 1),
                    (oval(6, 7, 3.65, 3.9), 0), (oval(2.8, 4.3, 1.45, 1.45), 0),
                    (oval(9.2, 4.3, 1.45, 1.45), 0), (oval(6, 12.6, 2, 1.6), 1),
                    (oval(6, 12.1, 3, 3), 0)], 9)


def cherries():
    stems = unary_union([spline([(3.5, 10), (4.3, 6), (6.8, 2.8)]).buffer(.34), spline([(8.3, 10), (8.3, 6), (6.8, 2.8)]).buffer(.34)])
    return compose([(oval(2.8, 9.2, .65, .9, 25), 1), (oval(7.7, 10.4, .65, .9, 25), 1),
                    (oval(3.5, 10.5, 2.5, 2.65), 0), (oval(8.4, 11.5, 2.4, 2.6), 0),
                    (petal_poly((6.8, 3), -160, 4.1, 1.2), 2), (stems, 2)], 10)


def pear():
    fruit = soft([(6, 3.6), (7.5, 4.5), (7.9, 7), (9.6, 9.4), (9.3, 12.6), (6, 14), (2.7, 12.6), (2.4, 9.4), (4.1, 7), (4.5, 4.5)])
    return compose([(oval(4.6, 10.4, 1.1, 1.7), 1), (fruit, 0),
                    (spline([(6, 4), (6.1, 2.5), (7, 1.6)]).buffer(.35), 3),
                    (petal_poly((6.1, 3), 195, 3.3, .95), 2)], 11)


def strawberry():
    fruit = soft([(6, 13.8), (2.6, 10.4), (1.9, 7), (3.2, 4.8), (6, 5.1), (8.8, 4.8), (10.1, 7), (9.4, 10.4)])
    leaves = [petal_poly((6, 5.6), a, 3, .85) for a in [-170, -130, -90, -50, -10]]
    return compose([*[(oval(x, y, .63, .8), 1) for x, y in [(3.7, 7.5), (6.2, 8.8), (8.3, 7.4), (5, 11)]],
                    *[(p, 2) for p in leaves], (fruit, 0)], 12)


def pumpkin():
    fruit = oval(6, 9.3, 4.8, 3.8)
    bands = [(fruit.intersection(poly([(x, 4), (x + 1.9, 4), (x + 1.9, 14), (x, 14)])), i % 2) for i, x in enumerate([1.2, 3.1, 5, 6.9, 8.8])]
    return compose([*bands, (fruit, 0),
                    (soft([(5.3, 5.8), (5, 3.1), (6.6, 2.6), (6.7, 5.8)]), 3),
                    (petal_poly((6, 4.6), -30, 4, 1), 2)], 11)


def maple():
    leaf = poly([(6, 2), (7.3, 5.6), (9.7, 3.8), (9.1, 7.2), (11.2, 7.1), (9.5, 10.4), (7, 11.7),
                 (6.4, 14.4), (5.6, 14.4), (5, 11.7), (2.5, 10.4), (.8, 7.1), (2.9, 7.2), (2.3, 3.8), (4.7, 5.6)])
    sectors = [poly([(6, 10.7), (-1, 3), (6, -1)]), poly([(6, 10.7), (6, -1), (13, 3)]),
               poly([(6, 10.7), (13, 3), (13, 16)]), poly([(6, 10.7), (13, 16), (-1, 16)])]
    return compose([(leaf.intersection(s), i % 3) for i, s in enumerate(sectors)] + [(leaf, 1)], 14)


def acorn():
    cap = oval(6, 6.4, 3.6, 2.1)
    parts = [(poly([(5.6, 2.9), (6.4, 2.9), (6.6, 5.2), (5.4, 5.2)]), 3)]
    for i in range(3):
        parts.append((cap.intersection(poly([(i * 2.4 + 2.4, 3), (i * 2.4 + 4.8, 3), (i * 2.4 + 4.8, 9), (i * 2.4 + 2.4, 9)])), 1 if i % 2 else 3))
    parts += [(oval(6, 9.3, 3, 4.3), 0), (petal_poly((7.8, 5.6), -20, 3.5, .9), 2)]
    return compose(parts, 15)


def rose():
    parts = [(oval(6, 6.1, .85, .85), 1), (oval(6, 6.3, 1.8, 1.9), 0),
             (oval(6, 6.5, 2.8, 3), 1), (oval(6, 6.8, 3.9, 4.1), 0),
             (poly([(5.6, 8), (6.4, 8), (6.4, 15.5), (5.6, 15.5)]), 2),
             (petal_poly((6, 12.6), -150, 3.9, 1), 2), (petal_poly((6, 14), -30, 3.8, 1), 2)]
    return compose(parts, 16)


def iris():
    petals = [(petal_poly((6, 8.5), a, length, width), c) for a, length, width, c in
              [(-90, 5.7, 1.5, 0), (-140, 4.5, 1.3, 1), (-40, 4.5, 1.3, 1), (145, 3.4, 1.4, 0), (35, 3.4, 1.4, 0)]]
    return compose([(oval(6, 8.2, .8, 1.1), 1), *petals,
                    (poly([(5.6, 9), (6.4, 9), (6.4, 16), (5.6, 16)]), 2),
                    (petal_poly((6, 15.8), -120, 4.8, .85), 2), (petal_poly((6, 15.8), -60, 4.8, .85), 2)], 17)


def teapot():
    body = oval(6, 9.4, 3.7, 3.4)
    handle = oval(9.1, 8.5, 2.2, 2.5).difference(oval(9.1, 8.5, 1.3, 1.6))
    spout = soft([(3, 8.8), (1.5, 5.8), (.6, 5.6), (.9, 8.6), (3.8, 11.4)])
    band = body.intersection(poly([(0, 8.2), (12, 8.2), (12, 10.5), (0, 10.5)]))
    return compose([(band, 1), (oval(6, 5.3, .7, .65), 1), (oval(6, 6.7, 2.5, .85), 2),
                    (body, 0), (spout, 0), (handle, 2), (oval(6, 13.2, 4.2, .8), 1)], 18)


def lantern():
    frame = poly([(3, 5), (9, 5), (8.5, 12), (3.5, 12)])
    bars = [poly([(5.65, 4.8), (6.35, 4.8), (6.35, 12.3), (5.65, 12.3)]),
            poly([(2.5, 8.2), (9.5, 8.2), (9.5, 8.9), (2.5, 8.9)])]
    return compose([*[(b.intersection(frame), 3) for b in bars], (frame, 1),
                    (poly([(2.8, 5), (6, 2.8), (9.2, 5)]), 0), (oval(6, 12.4, 3.1, .7), 0),
                    (oval(6, 2.3, .9, 1.2).difference(oval(6, 2.3, .4, .65)), 3)], 19)


def windmill():
    parts = [(oval(6, 6.5, .85, .85), 1)]
    for a in [0, 90, 180, 270]:
        blade = poly([(6, 6.3), (6.5, 6), (10.8, 3), (10.4, 5.1)])
        parts.append((affinity.rotate(blade, a, origin=(6, 6.5)), 1))
    parts += [(poly([(4.1, 6.5), (7.9, 6.5), (8.6, 14.5), (3.4, 14.5)]), 0),
              (poly([(3.5, 6.5), (6, 3.5), (8.5, 6.5)]), 2)]
    parts.insert(0, (poly([(5.2, 11.5), (6.8, 11.5), (6.8, 14.5), (5.2, 14.5)]), 3))
    return compose(parts, 20)


def castle():
    parts = [(oval(6, 12.2, 1.05, 1.7), 3)]
    for x, y in [(2.8, 6.5), (9.2, 6.5), (6, 4.3)]:
        parts += [(oval(x, y + 2.5, .55, .8), 1),
                  (poly([(x - 1.1, y), (x + 1.1, y), (x + 1.1, 14), (x - 1.1, 14)]), 0),
                  (poly([(x - 1.5, y), (x, y - 2.5), (x + 1.5, y)]), 2)]
    parts.append((poly([(2, 10), (10, 10), (10, 14), (2, 14)]), 1))
    return compose(parts, 20)


def bridge():
    arch = oval(6, 13.6, 5.5, 5.4).difference(oval(6, 13.6, 4.4, 4.2))
    arch = arch.intersection(poly([(0, 6), (12, 6), (12, 13.6), (0, 13.6)]))
    deck = poly([(0, 7.2), (12, 7.2), (12, 8.1), (0, 8.1)])
    piers = [poly([(x, 7.5), (x + .8, 7.5), (x + .8, 13.6), (x, 13.6)]) for x in [1, 3.4, 7.8, 10.2]]
    return compose([(oval(8.7, 3.5, 1.5, 1.5), 1), (deck, 1), (arch, 0),
                    *[(p, 0) for p in piers], (soft([(-1, 14), (3, 13.6), (6, 14.4), (13, 13.6), (13, 17), (-1, 17)]), 2)], 22)


def waterfall():
    water = soft([(5, 2), (7.4, 2), (7.1, 6), (6.7, 9.1), (8, 13.1), (5.8, 14.3), (4.1, 12.9), (5.2, 8), (4.8, 5)])
    pool = oval(6, 13.5, 4.7, 1.65)
    rockL = poly([(0, 2), (4.6, 2), (4, 5), (4.7, 7.7), (3.8, 11.5), (0, 13)])
    rockR = poly([(8, 1), (12, 1), (12, 13), (8.3, 11.4), (7.5, 8), (8.2, 5)])
    return compose([(oval(6, 13.6, 2.9, .75), 1), (water, 1), (pool, 0), (rockL, 2), (rockR, 3)], 23)


def planet():
    globe = oval(6, 7.5, 3.5, 3.5)
    band = oval(6, 7.5, 5.6, 2, -25)
    belt = globe.intersection(poly([(0, 6.4), (12, 6.4), (12, 8.4), (0, 8.4)]))
    return compose([(belt, 2), (globe, 0), (band, 1), (oval(9.7, 2.5, .9, .9), 2),
                    (oval(2.8, 12.9, 1.15, 1.15), 1)], 24)


def hourglass():
    glass = soft([(3, 3.7), (9, 3.7), (8.4, 6.2), (6.7, 8), (8.4, 9.8), (9, 12.3), (3, 12.3), (3.6, 9.8), (5.3, 8), (3.6, 6.2)])
    sandT = poly([(2, 5.1), (10, 5.1), (6, 8.6)]).intersection(glass)
    sandB = poly([(2, 13), (6, 9.6), (10, 13)]).intersection(glass)
    return compose([(sandT, 1), (sandB, 1), (glass, 2),
                    (poly([(2.4, 2.6), (9.6, 2.6), (9.6, 3.7), (2.4, 3.7)]), 0),
                    (poly([(2.4, 12.3), (9.6, 12.3), (9.6, 13.4), (2.4, 13.4)]), 0),
                    (poly([(2.4, 3.7), (3.1, 3.7), (3.1, 12.3), (2.4, 12.3)]), 3),
                    (poly([(8.9, 3.7), (9.6, 3.7), (9.6, 12.3), (8.9, 12.3)]), 3)], 25)


# Each palette has four distinct hues, ordered to match its motif's semantic preferences.
EXTRA = [
    ('butterflygarden', 'Kelebek Bahçesi', 'a butterfly with four broad patterned wings', ['#c7388b', '#f5c742', '#503b86', '#239d91'], butterflygarden, o_oval(6, 8)),
    ('dragonfly', 'Yusufçuk', 'a dragonfly with four translucent wings above a pond', ['#bb4b45', '#6c9239', '#f5daa0', '#247f9f'], dragonfly, o_round_arch(6)),
    ('snail', 'Bahçe Salyangozu', 'a snail with a large concentric spiral shell', ['#ce6533', '#efc66a', '#698d44', '#36537b'], snail, o_circle(6)),
    ('seashell', 'Deniz Kabuğu', 'a scallop seashell with broad alternating fan ribs', ['#e77891', '#f8d79a', '#31a4a3', '#365b86'], seashell, o_drop()),
    ('jellyfish', 'Denizanası', 'a jellyfish with a domed bell and four flowing ribbons', ['#b665c7', '#ffd493', '#e96680', '#237a9c'], jellyfish, o_oval(6, 8)),
    ('whale', 'Mavi Balina', 'a friendly whale with a broad tail and a little water spout', ['#257ca5', '#f1ddbc', '#725bad', '#162f57'], whale, o_hex()),
    ('penguin', 'Kutup Pengueni', 'a penguin with a cream belly and amber beak on ice', ['#244963', '#f4e7bc', '#e99237', '#619dae'], penguin, o_round_arch(6)),
    ('rabbit', 'Çayır Tavşanı', 'a seated rabbit with long ears in a meadow', ['#d67b8d', '#f6dfb4', '#80a047', '#4a6078'], rabbit, o_oval(6, 8)),
    ('bear', 'Orman Ayısı', 'a friendly bear with round ears and a honey-coloured muzzle', ['#9d5937', '#f0c576', '#568767', '#304b69'], bear, o_shield()),
    ('cherries', 'İkiz Kiraz', 'two ripe cherries hanging from stems with a broad leaf', ['#c32b4e', '#f7d794', '#3b8658', '#3d76a4'], cherries, o_round_arch(6)),
    ('pear', 'Altın Armut', 'a golden pear with a green leaf', ['#eab73c', '#fff0b7', '#428357', '#6a4988'], pear, o_oval(6, 8)),
    ('strawberry', 'Yaz Çileği', 'a ripe strawberry with a leafy crown and four broad seeds', ['#dc4258', '#f9dc87', '#47864a', '#3592a5'], strawberry, o_drop()),
    ('pumpkin', 'Sonbahar Kabağı', 'a ribbed pumpkin with a curling green leaf', ['#dc6227', '#f3b442', '#527743', '#67416d'], pumpkin, o_circle(6)),
    ('maple', 'Akçaağaç Yaprağı', 'a broad autumn maple leaf divided into warm-coloured lobes', ['#bd4334', '#f0ae43', '#8b6334', '#30898a'], maple, o_hex()),
    ('acorn', 'Meşe Palamudu', 'an acorn with a patterned cap and one oak leaf', ['#c68239', '#eac98d', '#58864c', '#684834'], acorn, o_oval(6, 8)),
    ('rose', 'Kadife Gül', 'a full rose with layered petals, a stem and two leaves', ['#b62f64', '#f594a4', '#367d61', '#e6b652'], rose, o_round_arch(6)),
    ('iris', 'Mor Süsen', 'a purple iris flower with broad petals and tall leaves', ['#7854af', '#f2ca61', '#438d70', '#2c587f'], iris, o_oval(6, 8)),
    ('teapot', 'Çay Saati', 'a decorated teapot with a curved spout and handle on a saucer', ['#c95046', '#f7d68a', '#348f90', '#514578'], teapot, o_round_arch(6)),
    ('lantern', 'Işık Feneri', 'an ornate lantern with four glowing golden panes', ['#b74f32', '#f6c850', '#278e91', '#394b67'], lantern, o_shield()),
    ('windmill', 'Yel Değirmeni', 'a windmill with four broad sails and a warm tower', ['#b15a42', '#f5dfa2', '#568c67', '#3d7fa6'], windmill, o_round_arch(6)),
    ('castle', 'Masal Şatosu', 'a fairytale castle with three roofed towers and an arched gate', ['#9d78b6', '#f2dca3', '#c64e67', '#345f83'], castle, o_round_arch(6)),
    ('bridge', 'Taş Köprü', 'a stone arched bridge over a river under the sun', ['#b78662', '#f2ca68', '#3e99a6', '#526646'], bridge, o_hex()),
    ('waterfall', 'Saklı Şelale', 'a waterfall cascading between cliffs into an oval pool', ['#208fa7', '#d8f0e1', '#667c42', '#8b6450'], waterfall, o_round_arch(6)),
    ('planet', 'Halkalı Gezegen', 'a ringed planet with a broad equatorial band and two moons', ['#a063b5', '#f0bf65', '#e27a68', '#254878'], planet, o_circle(6)),
    ('hourglass', 'Zaman Kumları', 'an hourglass with golden sand in a carved frame', ['#ad653e', '#f2cb70', '#5cabb1', '#5c477b'], hourglass, o_octagon(2.4)),
]


def register(design):
    for id, name, scene, colors, build, outline in EXTRA:
        palette = [(f'glass colour {i + 1}', value) for i, value in enumerate(colors)]
        design(id, name, scene, palette, outline, max_area=5.0, min_r=.36)(build)
