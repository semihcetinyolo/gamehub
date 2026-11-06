#!/usr/bin/env python3
"""Client library + CLI for the psb_level_creator service (http://127.0.0.1:8790, docs/spec.md).

Library:
    import plc_client as plc
    plc.create_project('door_v1')
    plc.upload_background('door_v1', 'scene.jpg')            # or: job = plc.generate_background('door_v1', 'a porch ...')
    ids = plc.add_edits('door_v1', [{'x0': 100, 'y0': 900, 'x1': 400, 'y1': 1200,
                                     'description': 'hide the letter D in the door wreath'}])['ids']
    plc.wait('door_v1', ids)
    plc.sheet('door_v1', 'sheet.jpg', edit=ids[0])

CLI (python3 plc_client.py -h):
    create door_v1 | projects | project door_v1 | settings door_v1 --fallback none --concurrency 2
    upload door_v1 scene.jpg | generate door_v1 "a porch ..." --ratio 3:4 --wait
    edits door_v1 boxes.json --wait | wait door_v1 e001 e002 | queue | job door_v1.e001
    detect door_v1 e001 [--force] | candidates door_v1 [--state new] [--edit e001] | ops door_v1 ops.json
    sheet door_v1 out.jpg [--ids 1,2] [--edit e001] [--state new] | overview door_v1 out.jpg
    freespots door_v1 [--n 3 --w 1024 --h 1024 --pad 60] | build door_v1 [--expected labels.json] [--meta meta.json]
    usage door_v1 | file door_v1/out/b1.psb out.psb
"""
from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import os
import sys
import time
from pathlib import Path

import requests

BASE = os.environ.get('PLC_URL', 'http://127.0.0.1:8790')
FINAL = ('done', 'failed', 'unknown')


class PlcError(RuntimeError):
    pass


def _check(r):
    if not r.ok:
        try:
            msg = r.json().get('error') or r.json().get('detail')
        except ValueError:
            msg = r.text[:500]
        raise PlcError(f'{r.status_code}: {msg}')
    return r


def get(route, **params):
    return _check(requests.get(BASE + route, params={k: v for k, v in params.items() if v is not None},
                               timeout=300))


def post(route, body=None, timeout=600, **params):
    """POST; when the server is draining for a restart (503 'server restarting', nothing was queued) or briefly down
    during the restart, the same request is sent again after a pause (up to ~10 min)."""
    t0 = time.time()
    while True:
        try:
            r = requests.post(BASE + route, json=body, timeout=timeout,
                              params={k: v for k, v in params.items() if v is not None})
        except requests.ConnectionError as e:
            # only "nothing reached the server" (refused while it restarts) is resent; a connection that broke
            # after the request was sent may have been processed and is never resent
            if 'Failed to establish a new connection' not in str(e) or time.time() - t0 > 600:
                raise
            time.sleep(10)
            continue
        if r.status_code == 503 and 'server restarting' in r.text and time.time() - t0 < 600:
            print(f'[plc_client] server is restarting; {route} not queued yet, resending in 20 s', file=sys.stderr,
                  flush=True)
            time.sleep(20)
            continue
        return _check(r).json()


# ---- projects --------------------------------------------------------------------------------------------------

def create_project(name, settings=None):
    return post('/projects', {'name': name, 'settings': settings})


def projects():
    return get('/projects').json()['projects']


def project(name):
    return get(f'/projects/{name}').json()


def settings(name, fallback=None, concurrency=None, provider=None, marla_model=None):
    body = {k: v for k, v in (('fallback', fallback), ('concurrency', concurrency), ('provider', provider),
                              ('marla_model', marla_model)) if v is not None}
    return _check(requests.patch(f'{BASE}/projects/{name}/settings', json=body, timeout=60)).json()


def upload_background(name, path):
    mime = mimetypes.guess_type(path)[0] or 'application/octet-stream'
    with open(path, 'rb') as fh:
        r = requests.post(f'{BASE}/projects/{name}/background/upload',
                          files={'file': (os.path.basename(path), fh, mime)}, timeout=600)
    return _check(r).json()


def generate_background(name, prompt, ratio='3:4', size='2K', provider='nano'):
    """Returns {job, generation}; wait with wait_background()."""
    return post(f'/projects/{name}/background/generate', {'prompt': prompt, 'ratio': ratio, 'size': size,
                                                           'provider': provider})


def restyle_background(name, source, style_refs=None, prompt='', ratio='3:4', size='2K', provider='nano'):
    """source (path or data URL: the picture to redraw) + style_refs (paths) -> a new BG via the image edit route.
    Paths may be absolute or relative to the repo root. Returns {job, generation}; wait with wait_background()."""
    return post(f'/projects/{name}/background/restyle', {'source': source, 'style_refs': style_refs or [],
                                                          'prompt': prompt, 'ratio': ratio, 'size': size,
                                                          'provider': provider})


def border(name):
    """The full-bleed check of the current BG: {ok, fraction, sides}."""
    return get(f'/projects/{name}/background/border').json()


def extend_background(name, prompt=None, provider='nano', kept='refuse', force=False, margin_mask='auto', rois=None):
    """Fill a white paper border / vignette to full bleed (only the border is replaced). Returns {job, extend, border};
    wait with wait_extend()."""
    return post(f'/projects/{name}/background/extend', {'prompt': prompt, 'provider': provider, 'kept': kept,
                                                         'force': force, 'margin_mask': margin_mask, 'rois': rois})


def reapply_extend(name, extend_id, margin_mask='original', rois=None, kept='under'):
    """No paid call: paste an earlier extend's answer into the current BG under a new mask (paper islands the first
    mask missed: margin_mask='original' and/or rois=[[x0,y0,x1,y1]]). Returns the new extend record."""
    return post(f'/projects/{name}/background/extend/{extend_id}/reapply',
                {'margin_mask': margin_mask, 'rois': rois, 'kept': kept})


def patch_background(name, edit, mask=None, rois=None, kept='refuse', grow=None, feather=None):
    """No paid call: paste a done edit's registered answer into the current BG under `mask` (PNG path, canvas- or
    edit-box-sized, white = replace) and/or rois=[[x0,y0,x1,y1]], feathered; a new BG version. Returns the record."""
    body = {'edit': edit, 'mask': str(Path(mask).resolve()) if mask else None, 'rois': rois, 'kept': kept}
    if grow is not None:
        body['grow'] = grow
    if feather is not None:
        body['feather'] = feather
    return post(f'/projects/{name}/background/patch', body)


def wait_extend(name, extend_id, poll=5, limit=1800):
    t0 = time.time()
    while time.time() - t0 < limit:
        x = next(x for x in project(name).get('extends', []) if x['id'] == extend_id)
        if x['status'] in FINAL:
            return x
        time.sleep(poll)
    raise TimeoutError(extend_id)


def wait_background(name, generation, poll=5, limit=1800):
    t0 = time.time()
    while time.time() - t0 < limit:
        g = next(g for g in project(name).get('generations', []) if g['id'] == generation)
        if g['status'] in FINAL:
            return g
        time.sleep(poll)
    raise TimeoutError(generation)


# ---- edits -----------------------------------------------------------------------------------------------------

def data_url(path, max_side=1024):
    """A ref image as a data URL (scaled down to max_side)."""
    from io import BytesIO
    from PIL import Image
    im = Image.open(path)
    im = im.convert('RGBA') if im.mode in ('RGBA', 'LA', 'P') else im.convert('RGB')
    k = min(1.0, max_side / max(im.size))
    if k < 1:
        im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    b = BytesIO()
    im.save(b, 'PNG')
    return 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()


def add_edits(name, boxes, fallback=None, detect=True, provider=None, allow_border=False):
    """boxes: [{x0, y0, x1, y1, description, ref_images?: [data URL or path]}]. Returns {ids, jobs}.
    provider: 'nano' (Clai Nano Banana Pro -> Albert) | 'astra' (GPT via `clai image --model gpt`); default = project's."""
    return post(f'/projects/{name}/edits', {'boxes': boxes, 'fallback': fallback, 'detect': detect,
                                            'provider': provider, 'allow_border': allow_border})


def wait(name, ids, poll=5, limit=3600):
    """Wait until every edit id is done / failed / unknown (and its auto-detect has run). Returns the edits."""
    ids = list(ids)
    t0 = time.time()
    while time.time() - t0 < limit:
        es = {e['id']: e for e in project(name)['edits']}
        sel = [es[i] for i in ids]
        if all(e['status'] in FINAL and (e['status'] != 'done' or not e.get('auto_detect', True)
                                         or e.get('detected') or e.get('detect_error')) for e in sel):
            return sel
        time.sleep(poll)
    raise TimeoutError(ids)


def queue(name=None):
    return get('/queue', project=name).json()['jobs']


def job(jid):
    return get(f'/jobs/{jid}').json()


def cancel(jid):
    """Stop a job (e.g. 'door_v1.e004' that keeps retrying Clai): no new attempt is sent after this."""
    return post(f'/jobs/{jid}/cancel')


# ---- candidates + evidence -------------------------------------------------------------------------------------

def detect(name, edit_id, force=False):
    return post(f'/projects/{name}/edits/{edit_id}/detect', force=str(force).lower())['candidates']


def candidates(name, state=None, edit=None):
    return get(f'/projects/{name}/candidates', state=state, edit=edit).json()['candidates']


def ops(name, op_list):
    return post(f'/projects/{name}/candidates/ops', {'ops': op_list})['candidates']


def sam(name, cand_id, prompt=None, box=None):
    """One SAM 3 outline ask for a candidate (one paid call, max 3 per candidate). Then use it with
    ops(name, [{'op': 'glyph', 'id': cand_id, 'mode': 'sam', 'attempt': n}])."""
    return post(f'/projects/{name}/candidates/{cand_id}/sam', {'prompt': prompt, 'box': box})


def sam_asks(name, cand_id):
    return get(f'/projects/{name}/candidates/{cand_id}/sam').json()['asks']


def _save(r, out):
    with open(out, 'wb') as fh:
        fh.write(r.content)
    return out


def sheet(name, out, ids=None, edit=None, state=None):
    ids = ','.join(map(str, ids)) if isinstance(ids, (list, tuple)) else ids
    return _save(get(f'/projects/{name}/sheet.jpg', ids=ids, edit=edit, state=state), out)


def overview(name, out):
    return _save(get(f'/projects/{name}/overview.jpg'), out)


def freespots(name, n=3, w=1024, h=1024, pad=60):
    return get(f'/projects/{name}/freespots', n=n, w=w, h=h, pad=pad).json()


def build(name, expected_labels=None, meta=None, allow_small=None, reuse_from=None):
    """reuse_from='b1': glyph-only rebuild that keeps that build's scene patches byte-identical."""
    """meta: optional dict written into level.json as top-level keys, e.g. {'phrase': 'YOUR DOOR IS ALWAYS OPEN'}."""
    return post(f'/projects/{name}/build', {'expected_labels': expected_labels, 'meta': meta,
                                           'allow_small': allow_small, 'reuse_from': reuse_from}, timeout=1800)


def blindread(name, ids=None, runs=1, seeds=None, model=None, window=None, tile=None, rois=None, zoom=None,
              controls=True, mode='both', width=None, planned=None):
    """A fresh vision model reads unlabeled, shuffled crops of the kept candidates (or ids) without knowing the phrase.
    Crops sit on the letter (mask trimmed of long stakes/strings), `window` x its long side (1.2-6, default 2.2);
    zoom: {cand id: f} crops tighter (f > 1) for hard letters; rois: {cand id: [x0,y0,x1,y1]} canvas px = a hand-given
    glyph box; tile: px per tile (200-512, default 300). model: 'opus' (default) | 'sonnet' | a claude-* id.
    runs 1-3: new shuffles, read = majority of the valid runs. controls: user-approved letters from other projects
    mixed in (blindread_controls.json); a run with a misread control is invalid (ok = None), never failing targets.
    mode: 'scene' (the letter in the scene), 'layer' (ONLY the build layer on grey: what flies to the slot) or
    'both' (default, scene + layer), 'glyph' (ONLY the build glyph <label>_glyph.png), 'flight' (scene + glyph),
    'all'; results[id] = {label, expected, ok (all modes), scene: {...}, layer: {...}, glyph: {...}}.
    Returns {id, results: {cand id: {label, expected, read, effort, ok, tile[, reads, agree]}}, summary, image}.
    mode 'glance': ACHIEVED difficulty: easy = seen in the whole scene at phone width (`width`, default 390 px),
    medium = seen in a 2x2 split at 2x, hard = read only in the zoomed scene crop, fail = not even then;
    results[id] = {label, achieved, planned, match, vs_plan}, summary = {achieved, planned, mismatches,
    easier_than_planned, harder_than_planned, extra_letters}; planned = latest build meta.difficulty or `planned`."""
    return post(f'/projects/{name}/blindread', {'ids': ids, 'runs': runs, 'seeds': seeds, 'model': model,
                                                'window': window, 'tile': tile, 'controls': controls, 'mode': mode,
                                                'width': width, 'planned': planned,
                                                'rois': {str(k): v for k, v in (rois or {}).items()} or None,
                                                'zoom': {str(k): v for k, v in (zoom or {}).items()} or None},
                timeout=1800)


def server_settings(astra_concurrency=None):
    """Read (or set) server-wide settings, e.g. the number of Astra asks at once."""
    if astra_concurrency is None:
        return get('/server/settings').json()
    return _check(requests.patch(f'{BASE}/server/settings', json={'astra_concurrency': astra_concurrency},
                                 timeout=60)).json()


def usage(name):
    return get(f'/projects/{name}/usage').json()


def file(path, out):
    """path relative to projects/ (e.g. 'door_v1/out/b1.psb')."""
    return _save(get('/file', path=path), out)


def fetch(name, rel, out):
    """A project file by its path inside the project, as build() and project() return them (e.g. 'out/b1.psb')."""
    return file(f'{name}/{rel}', out)


# ---- CLI -------------------------------------------------------------------------------------------------------

def _load(path_or_json):
    if os.path.isfile(path_or_json):
        with open(path_or_json) as fh:
            return json.load(fh)
    return json.loads(path_or_json)


def main(argv=None):
    ap = argparse.ArgumentParser(description='psb_level_creator client (PLC_URL, default ' + BASE + ')')
    sp = ap.add_subparsers(dest='cmd', required=True)
    a = sp.add_parser('create'); a.add_argument('name'); a.add_argument('--fallback'); a.add_argument('--concurrency', type=int)
    a.add_argument('--provider', choices=('nano', 'astra', 'marla'))
    sp.add_parser('projects')
    a = sp.add_parser('project'); a.add_argument('name')
    a = sp.add_parser('settings'); a.add_argument('name'); a.add_argument('--fallback'); a.add_argument('--concurrency', type=int)
    a.add_argument('--provider', choices=('nano', 'astra', 'marla'))
    a = sp.add_parser('upload'); a.add_argument('name'); a.add_argument('path')
    a = sp.add_parser('generate'); a.add_argument('name'); a.add_argument('prompt')
    a.add_argument('--ratio', default='3:4'); a.add_argument('--size', default='2K'); a.add_argument('--wait', action='store_true')
    a.add_argument('--provider', default='nano', choices=('nano', 'marla'))
    a = sp.add_parser('restyle', help='redraw a source picture in the style of reference pictures as the BG')
    a.add_argument('name'); a.add_argument('source'); a.add_argument('--style', action='append', default=[],
                                                                     help='style reference image (repeatable)')
    a.add_argument('--prompt', required=True); a.add_argument('--ratio', default='3:4')
    a.add_argument('--size', default='2K', choices=('1K', '2K'))
    a.add_argument('--provider', default='nano', choices=('nano', 'astra', 'marla')); a.add_argument('--wait', action='store_true')
    a = sp.add_parser('border', help='full-bleed check of the BG'); a.add_argument('name')
    a = sp.add_parser('patch', help="paste a done edit's answer into the BG under a mask (no paid call)")
    a.add_argument('name'); a.add_argument('edit'); a.add_argument('--mask', help='PNG, canvas or edit-box size, white = replace')
    a.add_argument('--rois', help='JSON file or string: [[x0,y0,x1,y1], ...] replaced whole')
    a.add_argument('--kept', default='refuse', choices=('refuse', 'protect'))
    a.add_argument('--grow', type=int); a.add_argument('--feather', type=int)
    a = sp.add_parser('extend', help='fill a white paper border to full bleed'); a.add_argument('name')
    a.add_argument('--prompt'); a.add_argument('--provider', default='nano', choices=('nano', 'astra'))
    a.add_argument('--kept', default='refuse', choices=('refuse', 'protect', 'under'),
                   help='protect: BG around kept letters stays; under: BG extended under kept letters too')
    a.add_argument('--force', action='store_true', help='extend residual edge paper even when the border check is ok')
    a.add_argument('--margin-mask', default='auto', choices=('auto', 'original'),
                   help="original = also paper islands inside the first BG's border")
    a.add_argument('--rois', help='JSON [[x0,y0,x1,y1], ...]: near-white pixels in these boxes are added')
    a = sp.add_parser('reapply', help="paste an earlier extend's answer under a new mask (no paid call)")
    a.add_argument('name'); a.add_argument('extend_id')
    a.add_argument('--margin-mask', default='original', choices=('auto', 'original'))
    a.add_argument('--rois', help='JSON [[x0,y0,x1,y1], ...]')
    a.add_argument('--kept', default='under', choices=('refuse', 'protect', 'under'))
    a.add_argument('--wait', action='store_true')
    a = sp.add_parser('edits', help='boxes.json = list of boxes (or {"boxes": [...]})'); a.add_argument('name'); a.add_argument('boxes')
    a.add_argument('--fallback'); a.add_argument('--no-detect', action='store_true'); a.add_argument('--wait', action='store_true')
    a.add_argument('--provider', choices=('nano', 'astra', 'marla'))
    a.add_argument('--allow-border', action='store_true', help='edit even though the BG is not full-bleed')
    a = sp.add_parser('wait'); a.add_argument('name'); a.add_argument('ids', nargs='+')
    a = sp.add_parser('queue'); a.add_argument('name', nargs='?')
    a = sp.add_parser('job'); a.add_argument('id')
    a = sp.add_parser('cancel', help='stop a job (queued or retrying)'); a.add_argument('id')
    a = sp.add_parser('detect'); a.add_argument('name'); a.add_argument('edit'); a.add_argument('--force', action='store_true')
    a = sp.add_parser('candidates'); a.add_argument('name'); a.add_argument('--state'); a.add_argument('--edit')
    a = sp.add_parser('ops', help='ops.json = list of ops (or {"ops": [...]})'); a.add_argument('name'); a.add_argument('ops')
    a = sp.add_parser('sam', help='one SAM 3 outline ask for a candidate (paid, max 3 per candidate)')
    a.add_argument('name'); a.add_argument('id', type=int); a.add_argument('--prompt')
    a.add_argument('--box', help='JSON [x0,y0,x1,y1]'); a.add_argument('--list', action='store_true')
    a = sp.add_parser('sheet'); a.add_argument('name'); a.add_argument('out')
    a.add_argument('--ids'); a.add_argument('--edit'); a.add_argument('--state')
    a = sp.add_parser('overview'); a.add_argument('name'); a.add_argument('out')
    a = sp.add_parser('freespots'); a.add_argument('name')
    for k, v in (('n', 3), ('w', 1024), ('h', 1024), ('pad', 60)):
        a.add_argument('--' + k, type=int, default=v)
    a = sp.add_parser('build'); a.add_argument('name'); a.add_argument('--expected', help='JSON list or file')
    a.add_argument('--meta', help='JSON object or file, written into level.json')
    a.add_argument('--allow-small', help='JSON list of labels allowed below the minimum letter size')
    a.add_argument('--reuse-from', help="build id (e.g. b1): glyph-only rebuild keeping its scene patches")
    a = sp.add_parser('blindread', help='fresh vision model reads the kept letters blind')
    a.add_argument('name'); a.add_argument('--ids', help='comma-separated candidate ids (default: all kept)')
    a.add_argument('--runs', type=int, default=1, choices=(1, 2, 3))
    a.add_argument('--model', help="opus (default) | sonnet | a claude-* id")
    a.add_argument('--zoom', help='JSON {cand id: factor} (or a file), > 1 = tighter crop for hard letters')
    a.add_argument('--no-controls', action='store_true', help='leave the control tiles out')
    a.add_argument('--mode', default='both', choices=('both', 'scene', 'layer', 'glyph', 'flight', 'all', 'glance'),
                   help='scene = letter in the scene, layer = build layer alone, glyph = build glyph alone '
                        '(<label>_glyph.png); both = scene+layer (default), flight = scene+glyph, all = all three; '
                        'glance = achieved difficulty (phone-size scene / 2x2 at 2x / zoomed crop) vs the plan')
    a.add_argument('--width', type=int, help='glance: phone width in px (default 390)')
    a.add_argument('--planned', help='glance: JSON {label: easy|medium|hard} (default: latest build meta.difficulty)')
    a.add_argument('--full', action='store_true', help='print the whole record, not just the table')
    a.add_argument('--window', type=float, help='crop side / letter long side, 1.2-6 (default 2.2)')
    a.add_argument('--tile', type=int, help='px per tile, 200-512 (default 300)')
    a.add_argument('--rois', help='JSON {cand id: [x0,y0,x1,y1]} (or a file): crop on the glyph, not the mask box')
    a = sp.add_parser('server', help='server-wide settings'); a.add_argument('--astra-concurrency', type=int)
    a = sp.add_parser('usage'); a.add_argument('name')
    a = sp.add_parser('file'); a.add_argument('path'); a.add_argument('out')
    x = ap.parse_args(argv)

    c = x.cmd
    if c == 'create':
        s = {k: v for k, v in (('fallback', x.fallback), ('concurrency', x.concurrency), ('provider', x.provider))
             if v is not None}
        res = create_project(x.name, s or None)
    elif c == 'projects':
        res = projects()
    elif c == 'project':
        res = project(x.name)
    elif c == 'settings':
        res = settings(x.name, x.fallback, x.concurrency, x.provider)['settings']
    elif c == 'upload':
        res = {k: v for k, v in upload_background(x.name, x.path).items() if k in ('canvas', 'background')}
    elif c == 'generate':
        res = generate_background(x.name, x.prompt, x.ratio, x.size, x.provider)
        if x.wait:
            res = wait_background(x.name, res['generation'])
    elif c == 'restyle':
        res = restyle_background(x.name, x.source, x.style, x.prompt, x.ratio, x.size, x.provider)
        if x.wait:
            res = {k: v for k, v in wait_background(x.name, res['generation']).items() if k != 'prompt'}
            res['border'] = border(x.name)
    elif c == 'border':
        res = border(x.name)
    elif c == 'extend':
        res = extend_background(x.name, x.prompt, x.provider, x.kept, x.force, x.margin_mask,
                                _load(x.rois) if x.rois else None)
        if x.wait:
            res = {k: v for k, v in wait_extend(x.name, res['extend']).items() if k != 'prompt'}
    elif c == 'patch':
        res = patch_background(x.name, x.edit, x.mask, _load(x.rois) if x.rois else None, x.kept, x.grow, x.feather)
    elif c == 'reapply':
        res = reapply_extend(x.name, x.extend_id, x.margin_mask, _load(x.rois) if x.rois else None, x.kept)
    elif c == 'edits':
        boxes = _load(x.boxes)
        boxes = boxes['boxes'] if isinstance(boxes, dict) else boxes
        res = add_edits(x.name, boxes, x.fallback, not x.no_detect, x.provider, x.allow_border)
        if x.wait:
            res = [{k: e.get(k) for k in ('id', 'status', 'via', 'error', 'detected', 'detect_error')}
                   for e in wait(x.name, res['ids'])]
    elif c == 'wait':
        res = [{k: e.get(k) for k in ('id', 'status', 'via', 'error', 'detected', 'detect_error')}
               for e in wait(x.name, x.ids)]
    elif c == 'queue':
        res = queue(x.name)
    elif c == 'job':
        res = job(x.id)
    elif c == 'cancel':
        res = cancel(x.id)
    elif c == 'detect':
        res = detect(x.name, x.edit, x.force)
    elif c == 'candidates':
        res = candidates(x.name, x.state, x.edit)
    elif c == 'sam':
        res = sam_asks(x.name, x.id) if x.list else sam(x.name, x.id, x.prompt, _load(x.box) if x.box else None)
    elif c == 'ops':
        o = _load(x.ops)
        res = ops(x.name, o['ops'] if isinstance(o, dict) else o)
    elif c == 'sheet':
        res = sheet(x.name, x.out, x.ids, x.edit, x.state)
    elif c == 'overview':
        res = overview(x.name, x.out)
    elif c == 'freespots':
        res = freespots(x.name, x.n, x.w, x.h, x.pad)
    elif c == 'build':
        res = build(x.name, _load(x.expected) if x.expected else None, _load(x.meta) if x.meta else None,
                    _load(x.allow_small) if x.allow_small else None, x.reuse_from)
    elif c == 'blindread':
        ids = [int(v) for v in x.ids.split(',')] if x.ids else None
        rec = blindread(x.name, ids, x.runs, None, x.model, x.window, x.tile, _load(x.rois) if x.rois else None,
                        _load(x.zoom) if x.zoom else None, not x.no_controls, x.mode, x.width,
                        _load(x.planned) if x.planned else None)
        if x.full:
            res = rec
        elif rec['mode'] == 'glance':
            sm = rec['summary']
            lines = [f"{rec['id']}  glance  model {rec['model']}  width {sm['width']}  "
                     f"{'VALID' if sm['valid'] else 'INVALID (zoomed stage: a control was misread, or an error)'}  "
                     f"overview: {x.name}/{rec['image']}",
                     f"  achieved: {sm['achieved']}", f"  planned:  {sm['planned']} ({sm['planned_from']})"]
            rows = sorted(rec['results'].items(), key=lambda kv: (kv[1].get('label') or '', int(kv[0])))
            for cid, v in rows:
                lines.append(f"  #{cid:>4} {v['label'] or '-':10} planned {v['planned'] or '-':6} achieved "
                             f"{str(v['achieved']):6} {('<- ' + v['vs_plan']) if v.get('vs_plan') else ''}")
            ex = sm['extra_letters']
            if ex['glance'] or ex['quarters']:
                lines.append(f"  letters seen that are no target: glance {[e['letter'] for e in ex['glance']]}, "
                             f"quarters {[e['letter'] for e in ex['quarters']]}")
            res = '\n'.join(lines)
        else:
            rows = sorted(rec['results'].items(), key=lambda kv: (kv[1].get('label') or '', int(kv[0])))
            sm = rec['summary']
            modes = list(rec['modes'])
            lines = [f"{rec['id']}  model {rec['model']}  mode {rec['mode']}  "
                     f"{'VALID' if sm['valid'] else 'INVALID (a control was misread)'}  ok {sm['ok']}/{sm['n']}"
                     f"  sheet: {x.name}/{rec['image']}" + (f"  layer sheet: {x.name}/{rec['image_layer']}"
                                                            if rec.get('image_layer') else '')
                     + (f"  glyph sheet: {x.name}/{rec['image_glyph']}" if rec.get('image_glyph') else '')]
            for m in modes:
                ms = sm[m]
                lines.append(f"  [{m}] {'valid' if ms['valid'] else 'INVALID'}  ok {ms['ok']}/{ms['n']}  "
                             f"unreadable {ms['unreadable']}  wrong {ms['wrong']}  controls {ms['controls']} "
                             f"acc {ms['control_accuracy']}")
                for pr in rec['modes'][m]['runs']:
                    bad = [f"{cr['key']} read {cr['read']} (exp {cr['expected']})" for cr in pr['controls']
                           if not cr['ok']]
                    if bad:
                        lines.append(f"    run seed {pr['seed']}: control misses: {', '.join(bad)}")
            rows = sorted(rec['results'].items(), key=lambda kv: (kv[1].get('label') or '', int(kv[0])))
            for cid, v in rows:
                verdict = 'OK' if v['ok'] else ('-' if v['ok'] is None else 'MISS')
                parts = []
                for m in modes:
                    r = v[m]
                    parts.append(f"{m} {r['read']}" + (f"{r['reads']}" if 'reads' in r else '') + f" e{r['effort']}"
                                 + ('' if r['ok'] else (' ?' if r['ok'] is None else ' MISS')))
                lines.append(f"  #{cid:<4} {str(v['label']):<8} exp {v['expected'] or '-'}  " + '  |  '.join(parts)
                             + f"  => {verdict}" + (f"  SMALL ({v['side']} < {sm.get('min_letter_px')} px)"
                                                    if v.get('small') else ''))
            res = '\n'.join(lines)
    elif c == 'server':
        res = server_settings(x.astra_concurrency)
    elif c == 'usage':
        res = usage(x.name)
    elif c == 'file':
        res = file(x.path, x.out)
    print(res if isinstance(res, str) else json.dumps(res, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except PlcError as e:
        sys.exit(f'error {e}')
