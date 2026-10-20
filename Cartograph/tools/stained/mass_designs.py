"""Procedural level catalog for levels 51–200.

These maps deliberately use a small set of stable stained-glass grammars with different
geometry, symmetry and palettes. Existing hand-authored levels 2–50 are preserved;
the first cat level has a separate tutorial design.
"""
import colorsys
import math
import random

from shapely import affinity
from shapely.geometry import Point, Polygon
from shapely.ops import unary_union

from geom import (circle, ellipse, o_circle, o_diamond, o_hex, o_octagon,
                  o_round_arch, o_shield, petal_poly, ray, reg_polygon, ring,
                  seg, spline)


FAMILY_NAMES = [
    'Gökkuşağı Halkası', 'Kristal Pano', 'Yıldız Kırığı', 'Dalga Bahçesi',
    'Çiçek Rozeti', 'Elmas Mozaik', 'Güneş Yelpazesi', 'Ay Seramiği',
    'Dört Yaprak', 'Geometrik Vitray',
]
OUTLINES = [o_circle(6), o_round_arch(6), o_hex(), o_octagon(2.3), o_diamond(), o_shield()]


def _palette(v):
    # Four well-separated hues. Every variant has a unique palette string.
    h = (v * 0.071) % 1.0
    vals = []
    for i in range(4):
        rgb = colorsys.hsv_to_rgb((h + i * .25) % 1.0, .54 + (v % 3) * .04, .62 + ((v + i) % 3) * .07)
        vals.append('#' + ''.join(f'{round(c * 255):02x}' for c in rgb))
    return vals


def _builder(v, family):
    outline = OUTLINES[(v + family) % len(OUTLINES)]
    cx, cy = 6, 8
    lines = []
    n = 6 + (v + family) % 7
    phase = (v * 13 + family * 17) % 360

    if family == 0:  # concentric rings and radial lead
        radii = [2.0 + .22 * (v % 4), 3.7 + .15 * (v % 5), 5.2]
        lines += [circle(cx, cy, r) for r in radii]
        lines += [ray((cx, cy), phase + 360 * i / n, 9, 0) for i in range(n)]
    elif family == 1:  # offset square lattice
        for i in range(3 + v % 3):
            x = 1.5 + i * 2.2 + .18 * (v % 2)
            lines.append(seg((x, -1), (x + (v % 3 - 1) * .5, 17)))
        for i in range(4 + (v + 1) % 3):
            y = 2 + i * 2.5
            lines.append(seg((-1, y), (13, y + (v % 2) * .35)))
        lines.append(circle(cx, cy, 3.2 + .1 * (v % 3)))
    elif family == 2:  # pointed star and inner rays
        pts = reg_polygon(cx, cy, 5.6, n, phase - 90)
        inner = reg_polygon(cx, cy, 2.2, n, phase - 90 + 180 / n)
        lines += [ring(pts), ring(inner)]
        lines += [seg(a, b) for a, b in zip(pts, inner)]
        lines += [circle(cx, cy, 1.0 + .15 * (v % 3))]
    elif family == 3:  # broad waves crossing a few uprights
        for i in range(5 + v % 3):
            y = 1.4 + i * 2.5
            lines.append(spline([(-1, y), (2.5, y + .8), (6, y - .5), (9.5, y + .7), (13, y)]))
        for i in range(2 + v % 3):
            x = 2.2 + i * 3.4
            lines.append(seg((x, -1), (x + .7, 17)))
    elif family == 4:  # petal rosette
        for i in range(n):
            a = phase + i * 360 / n
            p = petal_poly((cx, cy), a, 5.1, .82 + .12 * (v % 3))
            lines.append(p.exterior)
        lines += [circle(cx, cy, 1.25), circle(cx, cy, 4.7)]
    elif family == 5:  # diamond weave
        for i in range(4 + v % 3):
            d = -4.5 + i * 2.4
            lines.append(seg((d, 16), (d + 12, 0)))
            lines.append(seg((d, 0), (d + 12, 16)))
        lines.append(circle(cx, cy, 2.3 + .2 * (v % 3)))
    elif family == 6:  # fan from the bottom
        origin = (cx, 15.2)
        for i in range(7 + v % 4):
            lines.append(seg(origin, (1 + i * 1.65, 1 + .3 * ((i + v) % 2))))
        lines += [circle(cx, 11.8, 1.3 + i * 1.3) for i in range(3)]
    elif family == 7:  # offset arcs
        for i in range(4 + v % 3):
            lines.append(ellipse(2.0 + i * 1.8, 8, 2.3, 6.7, phase % 25 - 12))
        lines += [seg((-1, 5 + i * 3), (13, 5 + i * 3.05)) for i in range(3)]
    elif family == 8:  # quatrefoil-like lobes
        lobes = [ellipse(cx + math.cos(2 * math.pi * i / 4) * 2.8,
                         cy + math.sin(2 * math.pi * i / 4) * 2.8, 2.5, 2.5,
                         phase % 20 - 10) for i in range(4)]
        lines += [g for g in lobes]
        lines += [circle(cx, cy, 1.3), *[ray((cx, cy), phase + i * 45, 7, 1.3) for i in range(8)]]
    else:  # framed geometric panels
        for i in range(4):
            y = 2.2 + i * 3.0
            lines.append(seg((1, y), (11, y + (i % 2) * .35)))
        for i in range(3):
            x = 2.1 + i * 3.0
            lines.append(seg((x, 1), (x + (v % 2) * .4, 15)))
        lines += [ring(reg_polygon(cx, cy, 4.8, 6, phase)), ring(reg_polygon(cx, cy, 2.1, 6, phase + 30))]

    # Small deterministic changes to spacing/angles prevent variants from sharing a map.
    rand = random.Random(8041 + v * 7919 + family)
    matrix = [rand.uniform(.93, 1.08), rand.uniform(-.07, .07),
              rand.uniform(-.07, .07), rand.uniform(.93, 1.08),
              rand.uniform(-.25, .25), rand.uniform(-.25, .25)]
    clipped = [affinity.affine_transform(line, matrix).intersection(outline) for line in lines]
    lines = [piece for line in clipped for piece in getattr(line, 'geoms', [line])
             if piece.geom_type in ('LineString', 'LinearRing') and piece.length > .05]

    def prefer(x, y):
        # Bias the solution toward the motif while allowing all four colours in the background.
        angle = math.degrees(math.atan2(y - cy, x - cx))
        sector = int(((angle - phase) % 360) / 360 * 4)
        band = int(math.hypot(x - cx, y - cy) * 1.7)
        first = (sector + band + v + family) % 4
        return (first, (first + 1) % 4, (first + 2) % 4, (first + 3) % 4)

    return lines, prefer, None


