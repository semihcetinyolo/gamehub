"""Find every generated character in the region edits, check it automatically and cut its H layer.
usage: python3 detect.py WORKDIR PLAN      -> WORKDIR/found.json, WORKDIR/sheet.jpg"""
import importlib, json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi
from concurrent.futures import ThreadPoolExecutor
import marla_api as m

THR = 48          # diff against the clean bg that counts as "changed"
MIN_AREA = 2500   # smaller blobs are redraw noise


def _diff(a, b):
    return cv2.GaussianBlur(np.abs(a - b).max(2).astype(np.float32), (0, 0), 1.5)


def load(work, edits):
    os.makedirs(f'{work}/patches', exist_ok=True)
    with ThreadPoolExecutor(8) as ex:
        list(ex.map(lambda e: m.file(e['patch'], f"{work}/patches/{e['id']}.png"), edits))
    out = {}
    for e in edits:
        px0, py0, px1, py1 = e['geometry']['paste']; ox, oy = m.origin(e)
        pt = np.asarray(Image.open(f"{work}/patches/{e['id']}.png").convert('RGB')).astype(np.int16)
        out[e['id']] = (pt[py0 - oy:py1 - oy, px0 - ox:px1 - ox], (px0, py0, px1, py1))
    return out


def region_of(plan, paste):
    px0, py0, px1, py1 = paste
    for i, ((x0, y0, x1, y1), _) in enumerate(plan.REGIONS, 1):
        if px0 <= x0 + 2 and py0 <= y0 + 2 and px1 >= x1 - 2 and py1 >= y1 - 2:
            return i


def colour_stats(rgb, mask):
    px = rgb[mask].astype(np.float32) / 255
    if not len(px): return dict(black=0, white=0, red=0, yellow=0, blue=0, green=0, grey=0)
    hsv = cv2.cvtColor(px.reshape(-1, 1, 3), cv2.COLOR_RGB2HSV).reshape(-1, 3)
    h, s, v = hsv[:, 0], hsv[:, 1], hsv[:, 2]
    return dict(black=float((v < 0.3).mean()), white=float(((s < 0.15) & (v > 0.82)).mean()),
                red=float((((h < 14) | (h > 340)) & (s > 0.5) & (v > 0.45)).mean()),
                yellow=float(((h > 38) & (h < 62) & (s > 0.55) & (v > 0.6)).mean()),
                blue=float(((h > 195) & (h < 250) & (s > 0.45) & (v > 0.35)).mean()),
                green=float(((h > 62) & (h < 160) & (s > 0.4) & (v > 0.35)).mean()),
                grey=float(((s < 0.18) & (v > 0.3) & (v < 0.85)).mean()))


def _tolerant_diff(a, bg, r=8):
    """Diff that ignores small shifts of the redrawn background (min over shifts up to r px)."""
    pad = np.pad(bg, ((r, r), (r, r), (0, 0)), mode='edge')
    best = np.full(a.shape[:2], 1e9, np.float32)
    for dy in range(-r, r + 1, 2):
        for dx in range(-r, r + 1, 2):
            best = np.minimum(best, np.abs(a - pad[r + dy:r + dy + a.shape[0], r + dx:r + dx + a.shape[1]]).max(2))
    return cv2.GaussianBlur(best, (0, 0), 1.5)


def _split(lab, n):
    """Two characters drawn close together come out as one blob: erode until it falls apart into
    big pieces, then give every pixel to the nearest piece."""
    out = np.zeros_like(lab); k = 0
    for i, sl in enumerate(ndi.find_objects(lab), 1):
        c = lab[sl] == i
        parts = None
        if c.sum() > 3 * MIN_AREA:
            for it in range(4, 31, 3):
                er = ndi.binary_erosion(c, iterations=it)
                l2, n2 = ndi.label(er)
                if not n2: break
                sz = ndi.sum(er, l2, range(1, n2 + 1))
                big = [j + 1 for j in range(n2) if sz[j] > max(1500, 0.12 * sz.sum())]
                if len(big) >= 2:
                    seeds = np.zeros_like(l2)
                    for t, j in enumerate(big, 1): seeds[l2 == j] = t
                    _, (iy, ix) = ndi.distance_transform_edt(seeds == 0, return_indices=True)
                    parts = np.where(c, seeds[iy, ix], 0); break
        sub = out[sl]
        if parts is None:
            k += 1; sub[c] = k
        else:
            for t in range(1, parts.max() + 1):
                k += 1; sub[parts == t] = k
    return out, k


def blobs(P, E, eid, r=8):
    """Changed-pixel components of one edit, minus content copied from edits it depended on.
    Components come from the shift-tolerant diff (no redraw drift); each one then takes back
    the plain-diff pixels right around it (black fur, shadows)."""
    pn, (x0, y0, x1, y1) = P[eid]
    bg = BG[y0:y1, x0:x1]
    plain = _diff(pn, bg) > THR
    tol = _tolerant_diff(pn, bg, r) > THR
    for k in (E[eid]['geometry'].get('depends_on') or []):
        if k not in P: continue
        pk, (a0, b0, a1, b1) = P[k]
        ix0, iy0, ix1, iy1 = max(x0, a0), max(y0, b0), min(x1, a1), min(y1, b1)
        if ix0 >= ix1 or iy0 >= iy1: continue
        sn = pn[iy0 - y0:iy1 - y0, ix0 - x0:ix1 - x0]; sk = pk[iy0 - b0:iy1 - b0, ix0 - a0:ix1 - a0]
        theirs = ndi.binary_dilation((_diff(sk, BG[iy0:iy1, ix0:ix1]) > THR) & (_diff(sn, sk) < 40), iterations=2)
        plain[iy0 - y0:iy1 - y0, ix0 - x0:ix1 - x0] &= ~theirs
        tol[iy0 - y0:iy1 - y0, ix0 - x0:ix1 - x0] &= ~theirs
    tol = ndi.binary_closing(ndi.binary_opening(tol, iterations=1), iterations=6)
    lab, n = ndi.label(tol)
    lab, n = _split(lab, n)
    out = []
    for i, sl in enumerate(ndi.find_objects(lab), 1):
        if sl is None or (lab[sl] == i).sum() < MIN_AREA: continue
        g = 24
        sl = (slice(max(0, sl[0].start - g), sl[0].stop + g), slice(max(0, sl[1].start - g), sl[1].stop + g))
        comp = lab[sl] == i
        c = ndi.binary_fill_holes(comp | (plain[sl] & ndi.binary_dilation(comp, iterations=18)))
        ys, xs = np.nonzero(c)
        sl2 = (slice(sl[0].start + ys.min(), sl[0].start + ys.max() + 1), slice(sl[1].start + xs.min(), sl[1].start + xs.max() + 1))
        out.append((c[ys.min():ys.max() + 1, xs.min():xs.max() + 1], sl2))
    return out


def describe(pn, c):
    st = colour_stats(pn, c)
    hsv = cv2.cvtColor(pn.astype(np.uint8), cv2.COLOR_RGB2HSV)
    blk = c & (hsv[..., 2] < 77); wht = c & (hsv[..., 1] < 38) & (hsv[..., 2] > 209)
    ys = np.nonzero(c)[0]; h = max(1, ys.max() - ys.min())
    # upright: white head above black legs; handstand: black legs above white head
    st['upside'] = float((np.nonzero(wht)[0].mean() - np.nonzero(blk)[0].mean()) / h) if blk.any() and wht.any() else 0.0
    top = slice(ys.min(), ys.min() + max(1, h // 5))
    st['top_black'] = float(blk[top].sum() / max(1, c[top].sum()))
    return st


def _gap(a, sa, b, sb):
    """Pixel gap between two component masks given as (mask, slice) in the same frame."""
    y0, x0 = min(sa[0].start, sb[0].start), min(sa[1].start, sb[1].start)
    y1, x1 = max(sa[0].stop, sb[0].stop), max(sa[1].stop, sb[1].stop)
    A = np.zeros((y1 - y0, x1 - x0), bool); B = A.copy()
    A[sa[0].start - y0:sa[0].stop - y0, sa[1].start - x0:sa[1].stop - x0] = a
    B[sb[0].start - y0:sb[0].stop - y0, sb[1].start - x0:sb[1].stop - x0] = b
    return float(ndi.distance_transform_edt(~A)[B].min())


def _union(parts):
    y0 = min(s[0].start for _, s in parts); x0 = min(s[1].start for _, s in parts)
    y1 = max(s[0].stop for _, s in parts); x1 = max(s[1].stop for _, s in parts)
    U = np.zeros((y1 - y0, x1 - x0), bool)
    for c, s in parts: U[s[0].start - y0:s[0].stop - y0, s[1].start - x0:s[1].stop - x0] |= c
    return U, (slice(y0, y1), slice(x0, x1))


# Per-level hooks: a plan may define is_head / is_prop / features; these defaults are the park pandas.
def is_head(plan, st, area):
    if hasattr(plan, 'is_head'): return plan.is_head(st, area)
    return st['black'] > 0.15 and st['white'] > 0.06 and st['red'] < 0.3


def is_prop(plan, st):
    """A detached prop (balloon) that belongs to the character below it."""
    if hasattr(plan, 'is_prop'): return plan.is_prop(st)
    return st['red'] > 0.3


def features(plan, c):
    if hasattr(plan, 'features'): return plan.features(c)
    f = []
    if c['balloon'] or c['red'] > 0.06: f.append('B')
    if c['yellow'] > 0.12: f.append('R')
    if c['top_black'] > 0.6: f.append('S')  # legs up: the top of the silhouette is black fur
    return f


def find(work, plan):
    global BG
    BG = np.asarray(Image.open(f'{work}/bg.png').convert('RGB')).astype(np.int16)
    p = m.project(json.load(open(f'{work}/state.json'))['project'])
    json.dump(p, open(f'{work}/proj.json', 'w'))
    E = {e['id']: e for e in p['edits'] if e.get('visible', True)}
    P = load(work, list(E.values()))
    os.makedirs(f'{work}/cores', exist_ok=True)
    chars, extras = [], []
    for eid, e in E.items():
        reg = region_of(plan, e['geometry']['paste']); pn, (x0, y0, x1, y1) = P[eid]
        comps = blobs(P, E, eid, plan.tol_r(reg) if hasattr(plan, 'tol_r') else 8)  # smaller shift when the character matches the bg colours
        stats = [colour_stats(pn[s], c) for c, s in comps]
        heads = [i for i, st in enumerate(stats) if is_head(plan, st, comps[i][0].sum())]
        # touching head pieces are one panda split by the diff
        root = {i: i for i in heads}
        for x in heads:
            for y in heads:
                if x < y and root[y] == y and _gap(comps[x][0], comps[x][1], *comps[y]) < 15: root[y] = root[x]
        heads = [i for i in heads if root[i] == i]
        groups = {i: [j for j in root if root[j] == i] for i in heads}
        for i, st in enumerate(stats):
            if any(i in g for g in groups.values()): continue
            gaps = [(_gap(comps[h][0], comps[h][1], *comps[i]), h) for h in heads]
            balloon = is_prop(plan, st)
            ok = [(g, h) for g, h in gaps if g < (160 if balloon and comps[i][1][0].start < comps[h][1][0].start else 40)]
            if ok: groups[min(ok)[1]].append(i)
            else:
                c, s = comps[i]
                extras.append(dict(edit=eid, region=reg, area=int(c.sum()), box=[int(x0 + s[1].start), int(y0 + s[0].start), int(x0 + s[1].stop), int(y0 + s[0].stop)], **st))
        for h, members in groups.items():
            body = [comps[i] for i in members if not is_prop(plan, stats[i])]
            balloons = [comps[i] for i in members if is_prop(plan, stats[i])]
            c, s = _union(body)
            st = describe(pn[s], c)
            U, su = _union(body + balloons)
            n = len(chars) + 1
            Image.fromarray(U.astype(np.uint8) * 255).save(f'{work}/cores/{n:03d}.png')
            chars.append(dict(id=n, edit=eid, region=reg, area=int(c.sum()), balloon=bool(balloons),
                              box=[int(x0 + su[1].start), int(y0 + su[0].start), int(x0 + su[1].stop), int(y0 + su[0].stop)], **st))
    med = float(np.median([c['area'] for c in chars]))
    for c in chars:
        x0, y0, x1, y1 = c['box']; cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        rx0, ry0, rx1, ry1 = plan.REGIONS[c['region'] - 1][0]
        px0, py0, px1, py1 = E[c['edit']]['geometry']['paste']
        c['outside'] = not (rx0 - 60 <= cx <= rx1 + 60 and ry0 - 60 <= cy <= ry1 + 60)  # drawn over a neighbour's region
        c['clipped'] = any(abs(u - v) < 4 and v not in (0, 4096) for u, v in ((x0, px0), (y0, py0), (x1, px1), (y1, py1)))
        # pixels outside the server's paste mask (info only: our H layers take the patch itself, which runs on past the mask)
        e = E[c['edit']]; ox, oy = m.origin(e)
        mk = np.asarray(Image.open(m.file(e['mask_path'], f"{work}/patches/{e['id']}.mask.png")).convert('L'))
        k = np.asarray(Image.open(f"{work}/cores/{c['id']:03d}.png")) > 0
        sub = mk[y0 - oy:y0 - oy + k.shape[0], x0 - ox:x0 - ox + k.shape[1]]
        sub = np.pad(sub, ((0, k.shape[0] - sub.shape[0]), (0, k.shape[1] - sub.shape[1])))
        c['cut'] = int((k & (sub < 128)).sum())
        f = features(plan, c)
        c['kind'] = f[0] if len(f) == 1 else ('D' if not f else '?')
        c['flags'] = [x for x in ['multi' if len(f) > 1 else '', 'big' if c['area'] > 1.9 * med else '',
                                  'small' if c['area'] < 0.4 * med else '', 'outside' if c['outside'] else '',
                                  'clipped' if c['clipped'] else ''] if x]
    return chars, extras, E


def sheet(work, chars, out, cell=150, cols=12):
    f = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 15)
    rows = (len(chars) + cols - 1) // cols
    S = Image.new('RGB', (cols * cell, rows * (cell + 20)), 'white'); d = ImageDraw.Draw(S)
    proj = json.load(open(f'{work}/proj.json')); E = {e['id']: e for e in proj['edits']}
    for i, c in enumerate(chars):
        e = E[c['edit']]; ox, oy = m.origin(e)
        x0, y0, x1, y1 = c['box']
        im = Image.open(f"{work}/patches/{c['edit']}.png").convert('RGB').crop((x0 - ox, y0 - oy, x1 - ox, y1 - oy))
        k = ndi.binary_dilation(np.asarray(Image.open(f"{work}/cores/{c['id']:03d}.png")) > 0, iterations=6)
        im = Image.composite(im, Image.new('RGB', im.size, 'white'), Image.fromarray((k * 255).astype(np.uint8)))
        im.thumbnail((cell - 4, cell - 4))
        X, Y = (i % cols) * cell, (i // cols) * (cell + 20)
        S.paste(im, (X + 2, Y + 20))
        d.text((X + 2, Y + 2), f"{c['id']} R{c['region']} {c['kind']} {' '.join(c['flags'])}", fill=(200, 0, 0), font=f)
    S.save(out, quality=88)


if __name__ == '__main__':
    work, plan = sys.argv[1], importlib.import_module(sys.argv[2])
    chars, extras, E = find(work, plan)
    json.dump({'chars': chars, 'extras': extras}, open(f'{work}/found.json', 'w'), indent=1)
    from collections import Counter
    print('found', len(chars), Counter(c['kind'] for c in chars), 'flagged', [(c['id'], c['flags']) for c in chars if c['flags']])
    print('extras', [(x['region'], x['area'], round(x['red'], 2), round(x['black'], 2), round(x['white'], 2)) for x in extras])
    for i, (r, items) in enumerate(plan.REGIONS, 1):
        want = Counter(it[0] for it in items); got = Counter(c['kind'] for c in chars if c['region'] == i)
        if want != got: print(f'R{i} want {dict(want)} got {dict(got)}')
    sheet(work, chars, f'{work}/sheet.jpg')
