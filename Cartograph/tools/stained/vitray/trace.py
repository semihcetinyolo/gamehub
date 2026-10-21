"""Trace a flat design sheet (black lead on flat colour fills) into Cartograph linework.

python tools/stained/vitray/trace.py <id> [--debug]
  reads  tools/stained/vitray/design/<id>.png (+ <id>.json palette)
  writes tools/stained/vitray/work/<id>.trace.json  (outline, lines, pane wishes)

Every pixel of the panel gets the label of the nearest glass pane (lead pixels
split down their middle), so neighbouring panes share one boundary by
construction. Boundaries between labels are chained into arcs between junction
nodes; nodes closer than the lead width merge, each arc is smoothed with its end
points pinned, so all arcs still meet exactly. The outline comes from the arcs
facing the white exterior, the interior arcs become lead lines.
"""
import argparse
import json
import math
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from scipy.spatial import cKDTree
from shapely.geometry import LineString, Polygon
from shapely.ops import polygonize, unary_union

HERE = Path(__file__).resolve().parent
COLS, ROWS = 27, 36
MERGE = .9  # junction nodes closer than MERGE lead widths become one node


def hex_rgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], float)


def lab(rgb):
    c = np.asarray(rgb, float) / 255
    c = np.where(c > .04045, ((c + .055) / 1.055) ** 2.4, c / 12.92)
    m = np.array([[.4124, .3576, .1805], [.2126, .7152, .0722], [.0193, .1192, .9505]])
    xyz = c @ m.T / np.array([.95047, 1, 1.08883])
    f = np.where(xyz > .008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def classify(img, palette):
    """Per pixel: 0 = lead, 1 = exterior white, 2.. = glass (palette index + 2)."""
    refs = [np.zeros(3), np.full(3, 255.0)] + [hex_rgb(h) for h in palette]
    L = lab(img)
    R = lab(np.array(refs))
    d = ((L[:, :, None, :] - R[None, None]) ** 2).sum(-1)
    return d.argmin(-1)


def labels_from(img, palette, lead_grow=1):
    h, w, _ = img.shape
    cls = classify(img, palette) if palette else None
    if cls is None:
        mx = img.max(-1)
        cls = np.where(mx < 80, 0, np.where(img.min(-1) > 225, 1, 2))
    lead = cls == 0
    white = cls == 1
    # Exterior: white connected to the canvas border.
    wl, _ = ndi.label(white)
    border = set(np.unique(np.concatenate([wl[0], wl[-1], wl[:, 0], wl[:, -1]]))) - {0}
    exterior = np.isin(wl, list(border))
    panel = ndi.binary_fill_holes(~exterior)
    # Lead-only spurs outside the outer border are not glass: open the panel
    # by about one lead width (uniform stroke: EDT p90 ~ .45 w).
    edt = ndi.distance_transform_edt(lead)
    lead_w = max(3.0, np.percentile(edt[lead], 90) / .45) if lead.any() else 4.0
    panel = ndi.binary_opening(panel, structure=ndi.generate_binary_structure(2, 1), iterations=max(3, int(lead_w * .75)))
    lab_ = ndi.label(panel)[0]
    if lab_.max() > 1:
        sizes = ndi.sum(panel, lab_, range(1, lab_.max() + 1))
        panel = lab_ == 1 + int(np.argmax(sizes))
    glass = panel & ~ndi.binary_dilation(lead, iterations=lead_grow)
    comp, n = ndi.label(glass)
    sizes = ndi.sum(glass, comp, range(1, n + 1))
    minimum = max(40, panel.sum() * 1.5e-4)
    keep = np.zeros(n + 1, bool)
    keep[1:] = sizes >= minimum
    comp = np.where(keep[comp], comp, 0)
    ids = np.unique(comp[comp > 0])
    remap = np.zeros(n + 1, int)
    remap[ids] = np.arange(1, len(ids) + 1)
    comp = remap[comp]
    # Every panel pixel (lead, specks) joins its nearest pane.
    _, (ri, ci) = ndi.distance_transform_edt(comp == 0, return_indices=True)
    full = comp[ri, ci]
    full[~panel] = 0
    return full, panel, len(ids), lead_w


def cracks(L):
    """Lattice graph of label boundaries: corner -> [(corner, pair)]."""
    P = np.pad(L, 1, constant_values=0)
    g = defaultdict(list)
    # horizontal neighbours differ -> vertical crack at x = j+1 between rows i..i+1
    a, b = P[:, :-1], P[:, 1:]
    for i, j in zip(*np.nonzero(a != b)):
        p, q = (j + 1, i), (j + 1, i + 1)
        pair = tuple(sorted((int(a[i, j]), int(b[i, j]))))
        g[p].append((q, pair)); g[q].append((p, pair))
    a, b = P[:-1, :], P[1:, :]
    for i, j in zip(*np.nonzero(a != b)):
        p, q = (j, i + 1), (j + 1, i + 1)
        pair = tuple(sorted((int(a[i, j]), int(b[i, j]))))
        g[p].append((q, pair)); g[q].append((p, pair))
    return g


def chains(g):
    nodes = {p for p, nb in g.items() if len(nb) != 2}
    seen = set()
    arcs = []

    def walk(start, nxt, pair):
        pts = [start, nxt]
        seen.add(frozenset((start, nxt)))
        prev, cur = start, nxt
        while cur not in nodes and cur != start:
            for q, pr in g[cur]:
                if q != prev and frozenset((cur, q)) not in seen:
                    seen.add(frozenset((cur, q)))
                    prev, cur = cur, q
                    pts.append(cur)
                    break
            else:
                break
        return pts

    for p in nodes:
        for q, pair in g[p]:
            if frozenset((p, q)) not in seen:
                arcs.append((pair, walk(p, q, pair)))
    for p in list(g):
        for q, pair in g[p]:
            if frozenset((p, q)) not in seen:
                arcs.append((pair, walk(p, q, pair)))   # closed loop without nodes
    return arcs, nodes


def smooth(pts, sigma, closed):
    P = np.asarray(pts, float)
    if len(P) < 4:
        return P
    if closed:
        P = P[:-1] if np.allclose(P[0], P[-1]) else P
        S = ndi.gaussian_filter1d(P, sigma, axis=0, mode='wrap')
        return np.vstack([S, S[:1]])
    t = np.linspace(0, 1, len(P))[:, None]
    base = P[0] + (P[-1] - P[0]) * t
    D = P - base
    S = ndi.gaussian_filter1d(D, sigma, axis=0, mode='constant')
    # pin the ends exactly; fade the smoothing in over the first sigma points
    S[0] = S[-1] = 0
    return base + S


def trace(id, lead_px=None, debug=False, root=HERE):
    src = Image.open(root / 'design' / f'{id}.png').convert('RGBA')
    flat = Image.new('RGBA', src.size, 'white')  # some sheets come with a transparent exterior
    flat.alpha_composite(src)
    img = np.asarray(flat.convert('RGB'), float)
    meta_path = root / 'design' / f'{id}.json'
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    palette = [h for _, h in meta.get('palette', [])]
    h, w, _ = img.shape
    L, panel, n, lead_est = labels_from(img, palette)
    # lead width estimate: lead area / boundary length
    leadmask = panel & (classify(img, palette) == 0 if palette else img.max(-1) < 80)
    g = cracks(L)
    boundary = sum(len(v) for v in g.values()) / 2
    lead_w = lead_px or max(3.0, lead_est)
    arcs, nodes = chains(g)
    # merge junction nodes closer than about one lead width
    node_list = sorted(nodes)
    owner = {p: p for p in node_list}
    if node_list:
        tree = cKDTree(node_list)
        parent = list(range(len(node_list)))

        def find(i):
            while parent[i] != i:
                parent[i] = parent[parent[i]]; i = parent[i]
            return i
        for i, j in tree.query_pairs(lead_w * MERGE):
            parent[find(i)] = find(j)
        groups = defaultdict(list)
        for i in range(len(node_list)):
            groups[find(i)].append(node_list[i])
        for members in groups.values():
            c = tuple(np.mean(members, 0))
            for m in members:
                owner[m] = c
    s = min(COLS / w, ROWS / h)
    ox, oy = (COLS - w * s) / 2, (ROWS - h * s) / 2
    sigma = max(2.0, lead_w * .6)
    lines, rim = [], []
    for pair, pts in arcs:
        closed = pts[0] == pts[-1] and pts[0] not in nodes
        if not closed:
            a, b = owner[pts[0]], owner[pts[-1]]
            if a == b and len(pts) < 4 * lead_w:
                continue  # micro arc inside a merged junction
            # drop the stair points inside the merge radius, re-anchor on the node
            body = [p for p in pts[1:-1] if math.dist(p, a) > lead_w * MERGE and math.dist(p, b) > lead_w * MERGE]
            pts = [a, *body, b]
        P = smooth(pts, sigma, closed)
        P = np.column_stack([(P[:, 0] - 1) * s + ox, (P[:, 1] - 1) * s + oy])
        ls = LineString(P).simplify(.25 * s, preserve_topology=False)
        if ls.length < 1e-6:
            continue
        (rim if 0 in pair else lines).append(ls)
    outline_polys = list(polygonize(unary_union(rim)))
    outline = max(outline_polys, key=lambda p: p.area)
    outline = Polygon(outline.exterior)
    out = dict(id=id, cols=COLS, rows=ROWS, scale=s, offset=[ox, oy], leadWidthPx=lead_w, panes=n,
               outline=[list(map(lambda v: round(v, 4), c)) for c in outline.exterior.coords],
               lines=[[[round(x, 4), round(y, 4)] for x, y in l.coords] for l in lines],
               palette=meta.get('palette'), image=[w, h])
    work = root / 'work'
    work.mkdir(exist_ok=True)
    (work / f'{id}.trace.json').write_text(json.dumps(out))
    if debug:
        rng = np.random.default_rng(1)
        cols = rng.integers(40, 255, (L.max() + 1, 3)); cols[0] = 255
        Image.fromarray(cols[L].astype(np.uint8)).save(work / f'{id}.labels.png')
    print(f'{id}: {n} panes traced, lead {lead_w:.1f}px, {len(lines)} lines, {len(arcs)} arcs')
    return out


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('ids', nargs='+')
    ap.add_argument('--debug', action='store_true')
    ap.add_argument('--root', type=Path, default=HERE)
    a = ap.parse_args()
    for id in a.ids:
        trace(id, debug=a.debug, root=a.root)
