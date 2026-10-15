import json, os, sys, time, requests
TOKEN = open(os.path.expanduser('~/.config/marla/token')).read().strip()
API = 'https://albert.fugo.com.tr/api/level-generator'
H = {'Authorization': 'Bearer ' + TOKEN}
PROJECT = '20261014-081433_semihcetin_project_editor_0x0_51a76d-waldo-beach'
PDIR = '/YOLO/HO Level Generator/projects/' + PROJECT

def get(route, **params):
    r = requests.get(API + route, headers=H, params=params, timeout=300); r.raise_for_status(); return r

def post(path, body, timeout=600):
    r = requests.post(API + path, headers=H, json=body, timeout=timeout)
    if not r.ok: raise RuntimeError(f'{r.status_code}: {r.text[:1000]}')
    return r.json()

def project():
    return get('/projects/get', project=PROJECT).json()

def file(path, out):
    r = get('/file', path=path); open(out, 'wb').write(r.content); return out

def add_edits(boxes, model='gemini-3-pro-image', candidates=1, quality=None):
    return post('/projects/edits', {'project': PROJECT, 'boxes': boxes, 'model': model, 'candidates': candidates, 'quality': quality})

def queue():
    return get('/queue', surface='projects').json()

def wait(ids, poll=10, limit=3600):
    t0 = time.time()
    while time.time() - t0 < limit:
        q = queue(); jobs = {j['id']: j for j in q['jobs']}
        st = [jobs.get(i, {}).get('status') for i in ids]
        if all(s in ('done', 'failed') for s in st):
            return [jobs[i] for i in ids]
        time.sleep(poll)
    raise TimeoutError(ids)

def ref_data_url(path='/tmp/marla/ref_char.png', height=400):
    import base64, io
    from PIL import Image
    im = Image.open(path).convert('RGB'); im = im.resize((round(im.width * height / im.height), height), Image.LANCZOS)
    b = io.BytesIO(); im.save(b, 'PNG'); return 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()

def spot_boxes(nums):
    import spots
    ref = ref_data_url()
    out = []
    for n in nums:
        x0, y0, x1, y1 = spots.box(n)
        out.append({'type': 'rect', 'x0': x0, 'y0': y0, 'x1': x1, 'y1': y1, 'description': spots.description(n), 'ref_image': ref})
    return out

def spot_of(edit):
    import spots
    g = edit['geometry']; px0, py0, px1, py1 = g['paste']
    for n in range(1, len(spots.SPOTS) + 1):
        x0, y0, x1, y1 = spots.box(n); cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        if px0 <= cx <= px1 and py0 <= cy <= py1 and x0 >= px0 - 2 and x1 <= px1 + 2 and y0 >= py0 - 2 and y1 <= py1 + 2:
            return n
    return None

def fetch_patch(edit, variant=None, outdir='/tmp/marla/work/patches'):
    os.makedirs(outdir, exist_ok=True)
    v = variant or edit
    out = f"{outdir}/{v['id']}.png"
    if not os.path.exists(out): file(v['patch'], out)
    return out

def origin(edit):
    # the server leaves x/y as None when the context crop is clamped to the canvas edge
    g = edit['geometry']
    return g.get('x') or 0, g.get('y') or 0
