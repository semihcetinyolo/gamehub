"""FastAPI app (127.0.0.1:8790): validation + calls into store / edits / jobqueue and the detect-side modules.

Run: python3 -m uvicorn plc.server:app --host 127.0.0.1 --port 8790
"""
from __future__ import annotations

import base64
import json
import re
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Body, FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse

from . import edits, store
from .jobqueue import JobQueue
from .store import StoreError

MAX_UPLOAD = 64 * 1024 * 1024
NO_CACHE = {'Cache-Control': 'no-store'}
queue: JobQueue | None = None
DRAIN = {'on': False, 'since': None}   # draining before a restart: no new jobs are queued (HTTP 503, nothing queued)


def _no_drain():
    if DRAIN['on']:
        raise StoreError('server restarting: nothing was queued, resend this request in about a minute', 503)


def get_queue() -> JobQueue:
    global queue
    if queue is None:
        queue = JobQueue()
    return queue


_owner = {}


def claim_projects():
    """Only ONE server may own projects/: its startup recovery marks other servers' running edits as unknown/failed
    (2026-11-05: a second server on :8791 did exactly that). The lock is an flock on projects/.server.lock held for
    the life of the process; a second instance refuses to start."""
    import fcntl
    import json as _json
    import os
    import sys
    root = store.projects_root()
    root.mkdir(parents=True, exist_ok=True)
    path = root / '.server.lock'
    fh = open(path, 'a+')
    try:
        fcntl.flock(fh, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        fh.seek(0)
        who = fh.read().strip() or 'unknown'
        fh.close()
        raise RuntimeError(f'another plc server already owns {root} ({who}); use it (port 8790) or stop it first — '
                           'two servers on one projects/ corrupt each other\'s jobs')
    fh.seek(0)
    fh.truncate()
    fh.write(_json.dumps({'pid': os.getpid(), 'started': store.now(), 'argv': ' '.join(sys.argv)[:200]}))
    fh.flush()
    _owner['fh'] = fh


def release_projects():
    import fcntl
    fh = _owner.pop('fh', None)
    if fh:
        try:
            fcntl.flock(fh, fcntl.LOCK_UN)
        finally:
            fh.close()


@asynccontextmanager
async def lifespan(_app):
    claim_projects()
    _load_server_settings()
    plan = []
    fixed = store.recover_all(plan)
    if fixed:
        print(f'[plc] after restart: {fixed} (requeued/resumed go back to the queue; unknown = never resent)',
              flush=True)
    q = get_queue()
    for kind, p, ref in plan:
        try:
            if kind == 'edit':
                e = store.find_edit(store.read(p), ref)
                q.submit(p, 'edit', ref, lambda p=p, ref=ref, auto=e.get('auto_detect', True):
                         edits.run_edit_job(p, ref, auto))
            elif kind == 'generation':
                q.submit(p, 'background', ref, lambda p=p, ref=ref: edits.run_generation(p, ref))
            elif kind == 'extend':
                from . import background as bgx
                q.submit(p, 'extend', ref, lambda p=p, ref=ref: bgx.run_extend(p, ref))
        except Exception as ex:
            print(f'[plc] could not resubmit {kind} {p}.{ref}: {ex}', flush=True)
    try:
        yield
    finally:
        get_queue().shutdown()
        release_projects()
        _exit_if_drained()


def _exit_if_drained():
    """After a drain, held jobs sleep in store.record_attempt (before their ledger entry) and would keep the
    process alive forever (worker threads are joined at exit). They are safe to drop: the next start requeues them.
    So once nothing is on the wire, end the process at once."""
    import os
    import sys
    import time
    from . import providers
    if not store.HOLD.is_set() or 'pytest' in sys.modules:
        return
    while providers.IN_FLIGHT.n:
        time.sleep(0.5)
    print('[plc] drained: exiting (held jobs are requeued at the next start)', flush=True)
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(0)


app = FastAPI(title='psb_level_creator', version='1', lifespan=lifespan)


@app.exception_handler(StoreError)
async def _store_error(_req, e: StoreError):
    return JSONResponse({'error': str(e)}, status_code=e.status)


@app.exception_handler(ValueError)
async def _value_error(_req, e: ValueError):
    return JSONResponse({'error': str(e)}, status_code=400)


def _module(name: str):
    """The detect-side modules (detect, candidates, sheet, freespots, build) are imported lazily."""
    import importlib
    try:
        return importlib.import_module(f'plc.{name}')
    except ImportError as e:
        raise StoreError(f'plc.{name} is not available: {e}', 501)


def _project(p: str) -> dict:
    return store.read(p)


def _rel(pdir: Path, path) -> str:
    """A product path as given by a module (relative to the project or absolute) -> path relative to the project."""
    full = Path(path)
    full = full if full.is_absolute() else pdir / full
    return str(full.resolve().relative_to(pdir.resolve()))


def _file(path: Path, media: str):
    return FileResponse(path, media_type=media, headers=NO_CACHE)


# ---- projects --------------------------------------------------------------------------------------------------

@app.post('/projects')
def create_project(body: dict = Body(...)):
    return store.create(body.get('name'), body.get('settings'))


@app.get('/projects')
def list_projects():
    return {'projects': store.list_projects()}


@app.get('/projects/{p}')
def get_project(p: str):
    return _project(p)


@app.patch('/projects/{p}/settings')
def patch_settings(p: str, body: dict = Body(...)):
    s = store.check_settings(body)
    return store.update(p, lambda proj: proj['settings'].update(s))[0]


# ---- background ------------------------------------------------------------------------------------------------

def _multipart_file(content_type: str, body: bytes, field: str = 'file') -> bytes | None:
    m = re.search(r'boundary="?([^";]+)"?', content_type)
    if not m:
        raise StoreError('multipart upload without a boundary')
    for part in body.split(b'--' + m.group(1).encode()):
        head, sep, data = part.partition(b'\r\n\r\n')
        if sep and re.search(rb'name="' + field.encode() + rb'"', head):
            return data[:-2] if data.endswith(b'\r\n') else data
    return None


@app.post('/projects/{p}/background/upload')
async def upload_background(p: str, request: Request):
    """multipart field `file` (spec); also a raw image/* body or JSON {path} / {data_url}."""
    store.read(p)
    ct = request.headers.get('content-type', '')
    body = await request.body()
    if len(body) > MAX_UPLOAD:
        raise StoreError('upload too large', 413)
    data, origin = None, None
    if ct.startswith('multipart/form-data'):
        data = _multipart_file(ct, body)
    elif ct.startswith('image/'):
        data = body
    elif ct.startswith('application/json'):
        import json
        j = json.loads(body or b'{}')
        if j.get('path'):
            src = Path(j['path']).expanduser()
            if not src.is_file():
                raise StoreError(f'no such file: {src}', 404)
            data, origin = src.read_bytes(), str(src)
        elif j.get('data_url'):
            data = base64.b64decode(j['data_url'].split(',', 1)[-1])
    if not data:
        raise StoreError('send the image as multipart field "file"')
    return edits.set_background(p, data, 'upload', {'origin': origin} if origin else None)


@app.post('/projects/{p}/background/generate')
def generate_background(p: str, body: dict = Body(...)):
    _no_drain()
    g = edits.add_generation(p, body.get('prompt'), body.get('ratio') or '3:4', body.get('size') or '2K',
                             body.get('provider') or 'nano')
    jid = get_queue().submit(p, 'background', g['id'], lambda: edits.run_generation(p, g['id']))
    return {'job': jid, 'generation': g['id']}


@app.post('/projects/{p}/background/restyle')
def restyle_background(p: str, body: dict = Body(...)):
    """Source picture + style references -> a new BG (image edit route; nano = Clai -> Albert fallback, astra = clai
    image --model gpt). Canvas = what comes back; the full-bleed check runs on it."""
    _no_drain()
    g = edits.add_restyle(p, body.get('source'), body.get('style_refs'), body.get('prompt') or '',
                          body.get('ratio') or '3:4', body.get('size') or '2K', body.get('provider') or 'nano')
    jid = get_queue().submit(p, 'background', g['id'], lambda: edits.run_generation(p, g['id']))
    return {'job': jid, 'generation': g['id']}


@app.post('/projects/{p}/background/extend')
def extend_background(p: str, body: dict = Body(default={})):
    """Fill a white paper border / vignette to full bleed; only the border mask is replaced (plc/background.py)."""
    _no_drain()
    from . import background as bgx
    rec = bgx.add_extend(p, body.get('prompt'), body.get('provider') or 'nano', body.get('margin_mask') or 'auto',
                         body.get('kept') or 'refuse', body.get('force') is True, body.get('rois'))
    jid = get_queue().submit(p, 'extend', rec['id'], lambda: bgx.run_extend(p, rec['id']))
    return {'job': jid, 'extend': rec['id'], 'border': rec['border'], 'protected': rec['protected'],
            'warnings': rec['warnings']}


@app.post('/projects/{p}/background/extend/{xid}/reapply')
def reapply_extend(p: str, xid: str, body: dict = Body(default={})):
    """No paid call: paste extend <xid>'s answer into the current BG under a new mask (margin_mask 'original' =
    paper islands inside the first BG's border, rois = boxes whose near-white pixels are added)."""
    from . import background as bgx
    return bgx.reapply_extend(p, xid, body.get('margin_mask') or 'original', body.get('rois'),
                              body.get('kept') or 'under')


@app.post('/projects/{p}/background/patch')
def patch_background(p: str, body: dict = Body(...)):
    """No paid call: paste edit <edit>'s registered answer into the current BG under a mask (png path, canvas- or
    box-sized, and/or rois), feathered, as a new BG version. kept: 'refuse' (409 on a kept candidate) | 'protect'."""
    from . import background as bgx
    if not body.get('edit'):
        raise StoreError('edit required')
    return bgx.patch_background(p, body['edit'], body.get('mask'), body.get('rois'), body.get('kept') or 'refuse',
                                body.get('grow', bgx.PATCH_GROW), body.get('feather', bgx.PATCH_FEATHER))


@app.get('/projects/{p}/background/border')
def background_border(p: str):
    """The border detector on the current bg.png (also stored as background.border on generate/upload/extend)."""
    import numpy as np
    from PIL import Image
    from . import background as bgx
    f = store.pdir(p) / 'bg.png'
    if not f.is_file():
        raise StoreError('the project has no background yet', 409)
    return bgx.border_info(np.asarray(Image.open(f).convert('RGB')))


# ---- edits + jobs ----------------------------------------------------------------------------------------------

@app.post('/projects/{p}/edits')
def add_edits(p: str, body: dict = Body(...)):
    _no_drain()
    auto = body.get('detect', True) is not False
    ids = edits.add_edits(p, body.get('boxes'), body.get('fallback'), auto, body.get('provider'),
                          body.get('allow_border') is True)
    q = get_queue()
    jobs = [q.submit(p, 'edit', eid, lambda eid=eid: edits.run_edit_job(p, eid, auto)) for eid in ids]
    return {'ids': ids, 'jobs': jobs}


@app.post('/projects/{p}/edits/{eid}/requeue')
def requeue_edit(p: str, eid: str):
    """A failed edit that was never sent (no ledger attempt) goes back to the queue (e.g. after a wrong recovery)."""
    _no_drain()
    e = edits.requeue_unsent(p, eid)
    jid = get_queue().submit(p, 'edit', eid, lambda: edits.run_edit_job(p, eid, e.get('auto_detect', True)))
    return {'id': eid, 'job': jid}


@app.get('/projects/{p}/edits/{eid}')
def get_edit(p: str, eid: str):
    return store.find_edit(_project(p), eid)


@app.get('/queue')
def get_queue_jobs(project: str | None = None):
    return {'jobs': get_queue().list(project)}


@app.get('/jobs/{jid}')
def get_job(jid: str):
    j = get_queue().get(jid)
    if j:
        return j
    # not in memory (e.g. after a restart): the status in project.json is the truth
    p, _, ref = jid.partition('.')
    proj = _project(p)
    if re.fullmatch(r'e\d+', ref):
        e = store.find_edit(proj, ref)
        return {'id': jid, 'project': p, 'kind': 'edit', 'ref': ref, 'status': e['status'], 'error': e.get('error'),
                'ended': e.get('ended')}
    for g in proj.get('generations', []):
        if g['id'] == ref:
            return {'id': jid, 'project': p, 'kind': 'background', 'ref': ref, 'status': g['status'],
                    'error': g.get('error'), 'ended': g.get('ended')}
    raise StoreError(f'no job {jid!r}', 404)


# ---- candidates + evidence -------------------------------------------------------------------------------------

@app.post('/jobs/{jid}/cancel')
def cancel_job(jid: str):
    """Stop a job: a queued one ends before anything is sent, a retrying one before its next attempt; a request
    already in flight is never cut."""
    j = get_queue().cancel(jid)
    if j is None:
        raise StoreError(f'no job {jid!r} in this server run', 404)
    return j


@app.post('/projects/{p}/edits/{eid}/detect')
def detect(p: str, eid: str, force: bool = False):
    return {'candidates': edits.detect_and_store(p, eid, force)}


@app.get('/projects/{p}/candidates')
def candidates(p: str, state: str | None = None, edit: str | None = None):
    cs = _project(p).get('candidates', [])
    return {'candidates': [c for c in cs if (state is None or c.get('state') == state)
                           and (edit is None or c.get('edit') == edit)]}


@app.post('/projects/{p}/candidates/ops')
def candidate_ops(p: str, body: dict = Body(...)):
    ops = body.get('ops')
    if not isinstance(ops, list) or not ops:
        raise StoreError('ops: a non-empty list required')
    mod = _module('candidates')
    proj, _ = store.update(p, lambda proj: mod.apply_ops(store.pdir(p), proj, ops))
    return {'candidates': proj.get('candidates', [])}


_sam_locks: dict = {}


@app.post('/projects/{p}/candidates/{cid}/sam')
def sam_ask(p: str, cid: int, body: dict = Body(default={})):
    """One SAM 3 outline ask for a candidate (one paid call via Clai, plc/sam.py; recorded before the call, max 3
    per candidate, unknown never resent). Asks of a project run one at a time (two at once gave 429 elsewhere).
    Use the result with the glyph op {"op": "glyph", "id": cid, "mode": "sam", "attempt": n}."""
    import threading
    sam = _module('sam')
    box = body.get('box')
    if box is not None and not (isinstance(box, list) and len(box) == 4):
        raise StoreError('box: [x0, y0, x1, y1]')
    prompt = body.get('prompt')
    if prompt is not None and (not isinstance(prompt, str) or not prompt.strip() or len(prompt) > 200):
        raise StoreError('prompt: a short English object name')
    lock = _sam_locks.setdefault(p, threading.Lock())
    with lock:   # outside the store lock: it is a network call
        proj = _project(p)
        try:
            return sam.ask(store.pdir(p), proj, cid, prompt, box)
        except sam.SamError as e:
            raise StoreError(str(e), 409)


@app.get('/projects/{p}/candidates/{cid}/sam')
def sam_asks(p: str, cid: int):
    _project(p)
    return {'asks': _module('sam').asks(store.pdir(p), cid)}


def _ids(ids: str | None):
    if not ids:
        return None
    try:
        return [int(x) for x in ids.split(',') if x.strip()]
    except ValueError:
        raise StoreError('ids: comma-separated integers')


@app.get('/projects/{p}/sheet.jpg')
def sheet(p: str, ids: str | None = None, edit: str | None = None, state: str | None = None):
    proj = _project(p)
    path = _module('sheet').render_sheet(store.pdir(p), proj, ids=_ids(ids), edit=edit, state=state)
    return _file(path, 'image/jpeg')


@app.get('/projects/{p}/overview.jpg')
def overview(p: str):
    proj = _project(p)
    return _file(_module('sheet').render_overview(store.pdir(p), proj), 'image/jpeg')


@app.get('/projects/{p}/freespots')
def freespots(p: str, n: int = 3, w: int = 1024, h: int = 1024, pad: int = 60):
    proj = _project(p)
    rects = _module('freespots').find_free(store.pdir(p), proj, n, w, h, pad)
    out = {'rects': rects}
    if (store.pdir(p) / 'freespots.jpg').is_file():
        out['image'] = 'freespots.jpg'
    return out


META_KEY = re.compile(r'^[A-Za-z_][A-Za-z0-9_]{0,40}$')


def _check_meta(meta):
    """Optional build meta (e.g. {"phrase": ..., "style": ...}): top-level keys added to level.json."""
    if meta is None:
        return None
    import json
    if not isinstance(meta, dict) or len(meta) > 30 or not all(META_KEY.match(str(k)) for k in meta):
        raise StoreError('meta: an object with up to 30 keys (letters, digits, _)')
    if len(json.dumps(meta)) > 20000:
        raise StoreError('meta too large')
    return meta


def _add_layer_read_warnings(d: Path, proj: dict, report_path: Path):
    """Every kept target whose layer has no valid layer-mode blind-read pass on record (newer than its mask) gets a
    warning in the build report (rule: the layer alone must read as its letter)."""
    import json
    from . import blindread as br
    try:
        rep = json.loads(report_path.read_text())
    except (OSError, ValueError):
        return
    layer_ok, glyph_ok = br.layer_passes(proj, d, 'layer'), br.layer_passes(proj, d, 'glyph')
    kept = [c for c in proj.get('candidates', []) if c.get('state') == 'kept' and c.get('label')]
    gdir = report_path.parent / str(rep.get('id', ''))
    # the piece that flies: the glyph when build made one (out/<b>/<label>_glyph.png), else the layer
    flies = {c['id']: ('glyph' if (gdir / f"{c['label']}_glyph.png").is_file() else 'layer') for c in kept}
    ok = {c['id'] for c in kept if c['id'] in (glyph_ok if flies[c['id']] == 'glyph' else layer_ok)}
    missing = sorted((c['label'], c['id'], flies[c['id']]) for c in kept if c['id'] not in ok)
    rep['layer_read'] = {'passed': sorted(c['label'] for c in kept if c['id'] in ok),
                         'missing': [f'{lab} (#{cid}, {m})' for lab, cid, m in missing],
                         'layer_passed': sorted(c['label'] for c in kept if c['id'] in layer_ok),
                         'glyph_passed': sorted(c['label'] for c in kept if c['id'] in glyph_ok)}
    if missing:
        rep.setdefault('warnings', []).append(
            'no blind-read pass on record for the piece that flies (glyph, or the layer when there is no glyph; '
            'run blindread mode=flight or all): ' + ', '.join(f'{lab} (#{cid}, {m})' for lab, cid, m in missing))
    store.write_json(report_path, rep)


def _add_meta(level_json: Path, meta: dict):
    """Top-level keys of level.json written by build.py are never overwritten."""
    import json
    level = json.loads(level_json.read_text())
    clash = sorted(set(meta) & set(level))
    if clash:
        raise StoreError(f'meta keys clash with level.json keys: {clash}')
    level.update(meta)
    store.write_json(level_json, level)


@app.post('/projects/{p}/build')
def build(p: str, body: dict = Body(default={})):
    expected = body.get('expected_labels')
    if expected is not None and not (isinstance(expected, list) and all(isinstance(x, str) for x in expected)):
        raise StoreError('expected_labels: a list of strings')
    meta = _check_meta(body.get('meta'))
    allow_small = body.get('allow_small')
    if allow_small is not None and not (isinstance(allow_small, list) and all(isinstance(x, str) for x in allow_small)):
        raise StoreError('allow_small: a list of labels')
    reuse_from = body.get('reuse_from')
    if reuse_from is not None and not (isinstance(reuse_from, str) and re.fullmatch(r'b\d+', reuse_from)):
        raise StoreError("reuse_from: a build id like 'b1'")
    mod = _module('build')
    d = store.pdir(p)

    def fn(proj):
        kw = {'reuse_from': reuse_from} if reuse_from else {}
        res = mod.build(d, proj, expected_labels=expected, allow_small=allow_small, **kw)
        res = dict(res)
        res.setdefault('id', f'b{len(proj.get("builds", [])) + 1}')
        entry = {'id': res['id'], 'created': store.now()}
        for k in ('psb', 'preview', 'level_json', 'report'):
            if res.get(k):
                res[k] = _rel(d, res[k])
                entry[k] = res[k]
        if meta:
            _add_meta(d / res['level_json'], meta)
            entry['meta'] = meta
        if res.get('report'):
            _add_layer_read_warnings(d, proj, d / res['report'])
        proj.setdefault('builds', []).append(entry)
        return res
    return store.update(p, fn)[1]


@app.post('/projects/{p}/blindread')
def blindread(p: str, body: dict = Body(default={})):
    """Unlabeled, shuffled crops of kept candidates (or ids) read by a fresh vision model; see plc/blindread.py."""
    ids = body.get('ids')
    if ids is not None and not (isinstance(ids, list) and all(isinstance(i, int) for i in ids)):
        raise StoreError('ids: a list of candidate ids')
    runs = body.get('runs', 1)
    seeds = body.get('seeds')
    if seeds is not None and not (isinstance(seeds, list) and all(isinstance(x, int) for x in seeds)):
        raise StoreError('seeds: a list of integers')
    from . import blindread as br
    store.read(p)
    ctl = body.get('controls', True)
    if not (isinstance(ctl, bool) or isinstance(ctl, list)):
        raise StoreError('controls: true, false or a list of {project, id, expected}')
    return br.run(p, ids, runs, seeds, body.get('model'), window=body.get('window'), tile=body.get('tile'),
                  rois=body.get('rois'), zoom=body.get('zoom'), controls=ctl, mode=body.get('mode') or 'both',
                  glance={k: body[k] for k in ('width', 'planned') if body.get(k) is not None})


@app.get('/projects/{p}/blindread.jpg')
def blindread_image(p: str, n: int | None = None):
    proj = _project(p)
    reads = proj.get('blindreads', [])
    if not reads:
        raise StoreError('no blind read yet', 404)
    rec = reads[-1] if n is None else next((r for r in reads if r['id'] == f'r{n}'), None)
    if rec is None:
        raise StoreError(f'no blind read r{n}', 404)
    return _file(store.pdir(p) / rec['image'], 'image/jpeg')


@app.get('/projects/{p}/usage')
def usage(p: str):
    return edits.usage(p)


@app.get('/file')
def get_file(path: str):
    full = store.confined(path)
    media = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.json': 'application/json',
             '.psb': 'application/octet-stream', '.psd': 'application/octet-stream'}.get(full.suffix.lower(),
                                                                                         'application/octet-stream')
    return _file(full, media)


@app.get('/server/settings')
def server_settings():
    from . import jobqueue as JQ, providers
    jobs = get_queue().list()
    return {'astra_concurrency': providers.ASTRA_SLOTS.limit, 'astra_busy': providers.ASTRA_SLOTS.busy,
            'astra_limit_until': providers.astra_limit_until(), 'draining': DRAIN['on'],
            'drain_since': DRAIN['since'], 'active_jobs': sum(JQ.active(j['status']) for j in jobs),
            'in_flight': providers.IN_FLIGHT.n, 'held_jobs': len(store.HOLD_WAITERS),
            'restart_safe': DRAIN['on'] and providers.IN_FLIGHT.n == 0}


@app.post('/server/drain')
def server_drain(body: dict = Body(default={})):
    """Before a restart: on=true makes new edit/generate/restyle/extend requests answer 503 (nothing queued; the
    client resends them after a pause) and holds every job before its next paid request. Once in_flight is 0
    (restart_safe) a restart loses nothing: queued/held/retrying jobs are requeued, Marla jobs resumed by job id."""
    on = body.get('on', True) is not False
    DRAIN.update(on=on, since=store.now() if on else None)
    if on:
        store.HOLD.set()     # jobs stop before their next paid request (before the ledger), so they restart cleanly
    else:
        store.HOLD.clear()
    return server_settings()


@app.patch('/server/settings')
def patch_server_settings(body: dict = Body(...)):
    """astra_concurrency (1-12): Astra asks at once on this Mac. Kept in projects/.server_settings.json, so it
    survives restarts (start value without that file: env PLC_ASTRA_CONCURRENCY, default 3)."""
    from . import providers
    n = body.get('astra_concurrency')
    if not isinstance(n, int) or isinstance(n, bool) or not 1 <= n <= 12:
        raise StoreError('astra_concurrency: an integer 1-12')
    providers.ASTRA_SLOTS.set_limit(n)
    store.write_json(_server_settings_path(), {'astra_concurrency': n})
    return server_settings()


def _server_settings_path():
    return store.projects_root() / '.server_settings.json'


def _load_server_settings():
    from . import providers
    try:
        n = json.loads(_server_settings_path().read_text()).get('astra_concurrency')
    except (OSError, ValueError):
        return
    if isinstance(n, int) and 1 <= n <= 12:
        providers.ASTRA_SLOTS.set_limit(n)
        print(f'[plc] astra_concurrency {n} (projects/.server_settings.json)', flush=True)


@app.get('/health')
def health():
    return {'ok': True}
