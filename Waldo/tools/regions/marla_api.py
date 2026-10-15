"""Thin client for Marla's level-generator API (the endpoints the web app uses)."""
import base64, io, json, os, time, requests
from PIL import Image

TOKEN = open(os.path.expanduser('~/.config/marla/token')).read().strip()
API = 'https://albert.fugo.com.tr/api/level-generator'
H = {'Authorization': 'Bearer ' + TOKEN}


def get(route, **params):
    r = requests.get(API + route, headers=H, params=params, timeout=300); r.raise_for_status(); return r


def post(route, body=None, timeout=600, **kw):
    r = requests.post(API + route, headers=H, json=body, timeout=timeout, **kw)
    if not r.ok: raise RuntimeError(f'{r.status_code}: {r.text[:1000]}')
    return r.json()


def create_project(name):
    return post('/projects', {'name': name, 'type': 'hidden_objects'})['project']


def upload_background(project, png_path):
    with open(png_path, 'rb') as f:
        r = requests.post(API + '/backgrounds/upload', headers=H, params={'project': project}, files={'file': f}, timeout=600)
    r.raise_for_status(); return r.json()


def project(name):
    return get('/projects/get', project=name).json()


def save_doc(name, doc, updated_at):
    return post('/projects/save', {'project': name, 'doc': doc, 'expect_updated_at': updated_at})


def file(path, out):
    if not os.path.exists(out):
        open(out, 'wb').write(get('/file', path=path).content)
    return out


def add_edits(project_name, boxes, model='gemini-3-pro-image', candidates=1, quality=None):
    return post('/projects/edits', {'project': project_name, 'boxes': boxes, 'model': model,
                                    'candidates': candidates, 'quality': quality})


def wait(ids, poll=15, limit=3600):
    t0 = time.time()
    while time.time() - t0 < limit:
        jobs = {j['id']: j for j in get('/queue', surface='projects').json()['jobs']}
        st = [jobs.get(i, {}).get('status') for i in ids]
        if all(s in ('done', 'failed') for s in st):
            return [jobs[i] for i in ids]
        time.sleep(poll)
    raise TimeoutError(ids)


def data_url(path, height=400):
    im = Image.open(path).convert('RGB')
    im = im.resize((round(im.width * height / im.height), height), Image.LANCZOS)
    b = io.BytesIO(); im.save(b, 'PNG'); return 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()


def origin(edit):
    # the server leaves x/y as None when the context crop is clamped to the canvas edge
    g = edit['geometry']
    return g.get('x') or 0, g.get('y') or 0
