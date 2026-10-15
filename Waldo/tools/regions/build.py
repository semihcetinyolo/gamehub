"""Pick the characters for each group, cut their H layers and write the PSB.
usage: python3 build.py WORKDIR PLAN OUT.psb [--keep id,id,...] [--drop id,id,...] [--kind id=K,...]"""
import argparse, importlib, json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import numpy as np, cv2
from PIL import Image
from scipy import ndimage as ndi
from collections import Counter
from psd_tools import PSDImage
from psd_tools.api.layers import PixelLayer, Group
import marla_api as m

ap = argparse.ArgumentParser()
ap.add_argument('work'); ap.add_argument('plan'); ap.add_argument('out')
ap.add_argument('--drop', default=''); ap.add_argument('--kind', default='')
ap.add_argument('--allow', default='')  # clipped-flagged ids that looked whole on the sheet
ap.add_argument('--pairs', default='')  # overlapping pairs that look natural together, e.g. 8-62
a = ap.parse_args()
plan = importlib.import_module(a.plan)
W = a.work
found = json.load(open(f'{W}/found.json'))
chars = {c['id']: c for c in found['chars']}
for kv in filter(None, a.kind.split(',')):  # manual corrections after looking at the sheet
    i, k = kv.split('='); chars[int(i)]['kind'] = k
dropped = {int(i) for i in filter(None, a.drop.split(','))}

# choose: TARGET per kind, thinning the most crowded regions first
allowed = {int(i) for i in filter(None, a.allow.split(','))}
pool = [c for c in chars.values() if c['id'] not in dropped and c['kind'] in plan.TARGET
        and (not c.get('clipped') or c['id'] in allowed)]


def _mask(c, grow=0):
    k = np.asarray(Image.open(f"{W}/cores/{c['id']:03d}.png")) > 0
    return ndi.binary_dilation(k, iterations=grow) if grow else k


def overlap(a, b):
    ax0, ay0, ax1, ay1 = a['box']; bx0, by0, bx1, by1 = b['box']; g = 3
    if ax1 + g <= bx0 or bx1 + g <= ax0 or ay1 + g <= by0 or by1 + g <= ay0: return 0
    x0, y0 = min(ax0, bx0) - g, min(ay0, by0) - g
    A = np.zeros((max(ay1, by1) - y0 + g, max(ax1, bx1) - x0 + g), bool); B = A.copy()
    ka, kb = _mask(a), _mask(b)
    A[ay0 - y0:ay0 - y0 + ka.shape[0], ax0 - x0:ax0 - x0 + ka.shape[1]] = ka
    B[by0 - y0:by0 - y0 + kb.shape[0], bx0 - x0:bx0 - x0 + kb.shape[1]] = kb
    return int((ndi.binary_dilation(A, iterations=g) & B).sum())


# characters from different edits that touch each other overlap badly: keep one of each pair
need = dict(plan.TARGET)
ok_pairs = {tuple(sorted(map(int, x.split('-')))) for x in filter(None, a.pairs.split(','))}
pairs = [(p, q) for i, p in enumerate(pool) for q in pool[i + 1:] if p['edit'] != q['edit']
         and tuple(sorted((p['id'], q['id']))) not in ok_pairs and overlap(p, q) > 500]
while pairs:
    have = Counter(c['kind'] for c in pool)
    deg = Counter(x['id'] for pq in pairs for x in pq)
    loser = max({x['id']: x for pq in pairs for x in pq}.values(),
                key=lambda c: (deg[c['id']], have[c['kind']] - need[c['kind']], c.get('outside', False)))
    print('overlap: drop', loser['id'], [(p['id'], q['id']) for p, q in pairs if loser in (p, q)])
    pool.remove(loser)
    pairs = [(p, q) for p, q in pairs if loser not in (p, q)]
keep = {c['id'] for c in pool}
for k, need in plan.TARGET.items():
    cand = [c for c in pool if c['kind'] == k]
    if len(cand) < need: sys.exit(f'only {len(cand)} of kind {k}, need {need}')
    while len(cand) > need:
        load = Counter(chars[i]['region'] for i in keep)
        c = max(cand, key=lambda c: (load[c['region']], -c['area']))
        cand.remove(c); keep.discard(c['id'])
sel = {i: chars[i] for i in keep}

proj = json.load(open(f'{W}/proj.json')); E = {e['id']: e for e in proj['edits']}


def core(c):
    x0, y0, x1, y1 = c['box']
    k = np.asarray(Image.open(f"{W}/cores/{c['id']:03d}.png")) > 0
    if c.get('balloon'):  # take the string between the balloon and the paw too
        pts = cv2.findNonZero(k.astype(np.uint8)); hull = np.zeros(k.shape, np.uint8)
        cv2.fillConvexPoly(hull, cv2.convexHull(pts), 1)
        k |= ndi.binary_erosion(hull > 0, iterations=6) & ndi.binary_dilation(k, iterations=40)
    return k, (x0, y0)


# pixels go to the nearest character among the kept ones and the dropped ones of the same edit
# (a dropped panda drawn by another edit is not in this patch, so it must not cut a hole in it)
CORES = {c['id']: core(c) for c in chars.values()}


BGA = np.asarray(Image.open(f'{W}/bg.png').convert('RGB')).astype(np.int16)


def owner(i, win, patch):
    px0, py0, px1, py1 = win
    lab = np.zeros((py1 - py0, px1 - px0), np.int32)
    for j in [i] + [j for j in chars if j != i]:  # this character first: its outline beats a neighbour's
        c = chars[j]
        k, (x0, y0) = CORES[j]
        if j == i:
            k = np.pad(k, 6); x0 -= 6; y0 -= 6; k = ndi.binary_dilation(k, iterations=6)
        ax0, ay0 = max(x0, px0), max(y0, py0); ax1, ay1 = min(x0 + k.shape[1], px1), min(y0 + k.shape[0], py1)
        if ax0 >= ax1 or ay0 >= ay1: continue
        sub = lab[ay0 - py0:ay1 - py0, ax0 - px0:ax1 - px0]
        kk = k[ay0 - y0:ay1 - y0, ax0 - x0:ax1 - x0]
        if j not in sel and c['edit'] != sel[i]['edit']:
            # a dropped panda of another edit only competes where this patch has a copy of it
            d = np.abs(patch[ay0 - py0:ay1 - py0, ax0 - px0:ax1 - px0].astype(np.int16) - BGA[ay0:ay1, ax0:ax1]).max(2) > 48
            kk = kk & d
        sub[kk & (sub == 0)] = j
    _, (iy, ix) = ndi.distance_transform_edt(lab == 0, return_indices=True)
    return lab[iy, ix]


os.makedirs(f'{W}/H', exist_ok=True)
pos = {}
grow, feather = 26, 10
for i, c in sel.items():
    e = E[c['edit']]; px0, py0, px1, py1 = e['geometry']['paste']; ox, oy = m.origin(e)
    patch = np.asarray(Image.open(f"{W}/patches/{c['edit']}.png").convert('RGB'))[py0 - oy:py1 - oy, px0 - ox:px1 - ox]
    k, (x0, y0) = CORES[i]
    M = np.zeros((py1 - py0, px1 - px0), bool); M[y0 - py0:y0 - py0 + k.shape[0], x0 - px0:x0 - px0 + k.shape[1]] = k
    mm = ndi.binary_fill_holes(ndi.binary_dilation(M, iterations=grow))
    al = np.clip((cv2.GaussianBlur(mm.astype(np.float32), (0, 0), feather) - 0.02) / 0.5, 0, 1)
    al = np.minimum(al, cv2.GaussianBlur((owner(i, (px0, py0, px1, py1), patch) == i).astype(np.float32), (0, 0), 1.5))
    al[M] = 1.0
    ys, xs = np.nonzero(al > 0.004)
    t, b, l, r = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    Image.fromarray(np.dstack([patch[t:b, l:r], (al[t:b, l:r] * 255).round().astype(np.uint8)]), 'RGBA').save(f'{W}/H/{i:03d}.png')
    pos[i] = (int(px0 + l), int(py0 + t))

bgim = Image.open(f'{W}/bg.png').convert('RGB')
comp = bgim.copy()
psd = PSDImage.new('RGB', (4096, 4096), color=(255, 255, 255))
psd._record.header.version = 2  # PSB, like the 10163 example
PixelLayer.frompil(bgim, psd, 'BG', 0, 0)
DK = set(getattr(plan, 'D_KINDS', 'D'))  # plain distractors + feature decoys all go to D
order = [(DK, 'D')] + [({k}, g) for k, g in reversed(plan.GROUPS)]  # first target group ends up on top
for ks, gname in order:
    grp = Group.new(psd, gname, open_folder=False)
    for i in sorted((i for i, c in sel.items() if c['kind'] in ks), key=lambda i: -pos[i][1]):
        im = Image.open(f'{W}/H/{i:03d}.png')
        PixelLayer.frompil(im, grp, 'H', pos[i][1], pos[i][0])
for i in sorted(sel, key=lambda i: pos[i][1]):
    im = Image.open(f"{W}/H/{i:03d}.png"); comp.paste(im, pos[i], im)
psd.save(a.out)
comp.save(f'{W}/composite.png')
json.dump({'selected': {str(i): c['kind'] for i, c in sel.items()}, 'pos': {str(i): p for i, p in pos.items()}}, open(f'{W}/selection.json', 'w'))
print('PSB', a.out, Counter(c['kind'] for c in sel.values()))
