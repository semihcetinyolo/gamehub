"""Split one found character that is really two side-by-side ones, at the emptiest column.
usage: python3 split.py WORKDIR ID LEFT_KIND RIGHT_KIND [CUT_X canvas px]"""
import json, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

work, cid, lk, rk = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4]
F = json.load(open(f'{work}/found.json'))
c = next(c for c in F['chars'] if c['id'] == cid)
k = np.asarray(Image.open(f'{work}/cores/{cid:03d}.png')) > 0
cols = k.sum(0); w = len(cols)
cut = int(sys.argv[5]) - c['box'][0] if len(sys.argv) > 5 else int(np.argmin(cols[w // 5: 4 * w // 5]) + w // 5)
nxt = max(x['id'] for x in F['chars']) + 1
for part, kind in ((np.s_[:, :cut], lk), (np.s_[:, cut:], rk)):
    sub = np.zeros_like(k); sub[part] = k[part]
    lab, n = ndi.label(sub); sz = ndi.sum(sub, lab, range(1, n + 1))
    sub = np.isin(lab, [i + 1 for i in range(n) if sz[i] > 1500])
    ys, xs = np.nonzero(sub)
    x0, y0 = c['box'][0], c['box'][1]
    Image.fromarray(sub[ys.min():ys.max() + 1, xs.min():xs.max() + 1].astype(np.uint8) * 255).save(f'{work}/cores/{nxt:03d}.png')
    F['chars'].append(dict(c, id=nxt, kind=kind, flags=[], balloon=(kind == 'B'), area=int(sub.sum()),
                           box=[int(x0 + xs.min()), int(y0 + ys.min()), int(x0 + xs.max() + 1), int(y0 + ys.max() + 1)]))
    print(nxt, kind, F['chars'][-1]['box']); nxt += 1
F['chars'] = [x for x in F['chars'] if x['id'] != cid]
json.dump(F, open(f'{work}/found.json', 'w'), indent=1)
