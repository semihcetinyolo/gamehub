import threading
import time

import pytest
from fastapi.testclient import TestClient

from _api_helpers import env, Fake, bg_png  # noqa: F401
from plc import detect, server, store


@pytest.fixture
def client(env):
    server.queue = None
    with TestClient(server.app) as c:
        yield c
    server.queue = None


def _fake_detect(monkeypatch, fail=False):
    def det(pdir, project, edit):
        if fail:
            raise RuntimeError('detect bug')
        n = max((c['id'] for c in project.get('candidates', [])), default=0)
        x0, y0 = edit['box'][:2]
        return [{'id': n + 1, 'edit': edit['id'], 'box': [x0 + 10, y0 + 10, x0 + 50, y0 + 50], 'area': 1600,
                 'flags': [], 'state': 'new', 'label': None, 'group': None}]
    monkeypatch.setattr(detect, 'detect_edit', det)


def _setup(client, name='p', **settings):
    assert client.post('/projects', json={'name': name, 'settings': settings or None}).status_code == 200
    r = client.post(f'/projects/{name}/background/upload', files={'file': ('bg.png', bg_png(), 'image/png')})
    assert r.status_code == 200, r.text
    assert r.json()['canvas'] == {'w': 1536, 'h': 2048}


def _box(x=600, y=1000, s=300, d='add a small red apple on the ground'):
    return {'x0': x, 'y0': y, 'x1': x + s, 'y1': y + s, 'description': d}


def test_edit_flow_with_auto_detect(client, monkeypatch):
    Fake(monkeypatch)
    _fake_detect(monkeypatch)
    _setup(client)
    r = client.post('/projects/p/edits', json={'boxes': [_box(), _box(100, 100)]})
    assert r.status_code == 200, r.text
    assert r.json() == {'ids': ['e001', 'e002'], 'jobs': ['p.e001', 'p.e002']}
    assert server.get_queue().wait_idle(20)
    p = client.get('/projects/p').json()
    assert [e['status'] for e in p['edits']] == ['done', 'done'] and all(e['detected'] for e in p['edits'])
    cs = client.get('/projects/p/candidates', params={'edit': 'e002'}).json()['candidates']
    assert len(cs) == 1 and cs[0]['edit'] == 'e002'
    assert sorted(c['id'] for c in p['candidates']) == [1, 2]
    assert client.get('/jobs/p.e001').json()['status'] == 'done'
    u = client.get('/projects/p/usage').json()
    assert u['edits']['clai'] == 2 and u['requests_sent'] == {'clai': 2, 'albert': 0, 'astra': 0, 'marla': 0}
    # detect again: same candidates; force replaces them
    assert client.post('/projects/p/edits/e001/detect').json()['candidates'][0]['id'] in (1, 2)
    new = client.post('/projects/p/edits/e001/detect', params={'force': 'true'}).json()['candidates']
    assert len(new) == 1 and len(client.get('/projects/p/candidates').json()['candidates']) == 2
    f = client.get('/file', params={'path': 'p/edits/e001/answer.png'})
    assert f.status_code == 200 and f.content[:4] == b'\x89PNG'
    assert client.get('/file', params={'path': '../../etc/hosts'}).status_code in (403, 404)


def test_detect_bug_never_fails_the_edit(client, monkeypatch):
    Fake(monkeypatch)
    _fake_detect(monkeypatch, fail=True)
    _setup(client)
    client.post('/projects/p/edits', json={'boxes': [_box()]})
    assert server.get_queue().wait_idle(20)
    e = client.get('/projects/p/edits/e001').json()
    assert e['status'] == 'done' and not e['detected'] and 'detect bug' in e['detect_error']


def test_concurrency_limit(client, monkeypatch):
    live, peak, lock = [0], [0], threading.Lock()

    def slow(images, extra):
        with lock:
            live[0] += 1
            peak[0] = max(peak[0], live[0])
        time.sleep(0.15)
        with lock:
            live[0] -= 1
        from _api_helpers import answer_from
        return {'png': answer_from(images[0]), 'channel': ''}
    Fake(monkeypatch, clai=slow)
    _fake_detect(monkeypatch)
    _setup(client, concurrency=2)
    client.post('/projects/p/edits', json={'boxes': [_box(100 + 60 * i, 100) for i in range(6)], 'detect': False})
    assert server.get_queue().wait_idle(20)
    assert peak[0] == 2
    assert all(e['status'] == 'done' and not e['detected'] for e in client.get('/projects/p').json()['edits'])


def test_generate_background_job(client, monkeypatch):
    Fake(monkeypatch)
    client.post('/projects', json={'name': 'g'})
    r = client.post('/projects/g/background/generate', json={'prompt': 'a cosy porch', 'ratio': '3:4'})
    assert r.status_code == 200 and r.json()['job'] == 'g.g1'
    assert server.get_queue().wait_idle(20)
    p = client.get('/projects/g').json()
    assert p['canvas'] == {'w': 1536, 'h': 2048} and p['background']['via'] == 'clai'


def test_validation_errors(client, monkeypatch):
    Fake(monkeypatch)
    client.post('/projects', json={'name': 'p'})
    assert client.post('/projects/p/edits', json={'boxes': [_box()]}).status_code == 409    # no background yet
    assert client.post('/projects', json={'name': '../x'}).status_code == 400
    assert client.get('/projects/nope').status_code == 404
    assert client.patch('/projects/p/settings', json={'fallback': 'none'}).json()['settings']['fallback'] == 'none'
    assert client.patch('/projects/p/settings', json={'concurrency': 99}).status_code == 400
    client.post('/projects/p/background/upload', content=bg_png(), headers={'content-type': 'image/png'})
    assert client.post('/projects/p/edits', json={'boxes': [{'x0': 0, 'y0': 0, 'x1': 50, 'y1': 50}]}).status_code == 400
    assert client.post('/projects/p/edits', json={'boxes': [_box(5000, 5000)]}).status_code == 400
    assert client.post('/projects/p/edits', json={'boxes': [_box()], 'fallback': 'x'}).status_code == 400
    assert client.post('/projects/p/edits', json={'boxes': [_box()]}).status_code == 200
    r = client.post('/projects/p/background/upload', files={'file': ('bg.png', bg_png(), 'image/png')})
    assert r.status_code == 409


def test_restart_marks_unknown(env, monkeypatch):
    Fake(monkeypatch)
    store.create('p')
    from plc import edits
    edits.set_background('p', bg_png(), 'upload')
    [eid] = edits.add_edits('p', [_box()])
    store.update('p', lambda p: p['edits'][0].update(status='running'))
    store.record_attempt(store.edit_dir('p', eid) / 'request.json', {}, 'clai')
    server.queue = None
    with TestClient(server.app) as c:          # lifespan runs the recovery
        assert c.get('/jobs/p.e001').json()['status'] == 'unknown'
    server.queue = None


def test_build_meta_goes_into_level_json(client, monkeypatch):
    import json
    from plc import build as build_mod

    def fake_build(pdir, project, expected_labels=None, opts=None, allow_small=None, reuse_from=None):
        bid = f'b{len(project.get("builds", [])) + 1}'
        (pdir / 'out').mkdir(exist_ok=True)
        (pdir / 'out' / f'{bid}_level.json').write_text(json.dumps({'canvas': project['canvas'], 'targets': []}))
        return {'id': bid, 'psb': f'out/{bid}.psb', 'preview': f'out/{bid}_preview.jpg',
                'level_json': f'out/{bid}_level.json', 'report': f'out/{bid}_report.json'}
    monkeypatch.setattr(build_mod, 'build', fake_build)
    _setup(client)
    meta = {'phrase': 'YOUR DOOR IS ALWAYS OPEN', 'style': 'cozy_porch'}
    r = client.post('/projects/p/build', json={'meta': meta})
    assert r.status_code == 200, r.text
    level = json.loads((store.pdir('p') / r.json()['level_json']).read_text())
    assert level['phrase'] == meta['phrase'] and level['style'] == 'cozy_porch' and 'canvas' in level
    assert client.get('/projects/p').json()['builds'][0]['meta'] == meta
    assert client.post('/projects/p/build', json={'meta': {'canvas': 1}}).status_code == 400   # never overwrites
    assert client.post('/projects/p/build', json={'meta': ['x']}).status_code == 400
    assert client.post('/projects/p/build', json={'meta': {'bad key': 1}}).status_code == 400
    assert len(client.get('/projects/p').json()['builds']) == 1


def test_sam_endpoint_calls_plc_sam_outside_the_lock(client, monkeypatch):
    from plc import sam
    Fake(monkeypatch)
    _setup(client)
    seen = {}

    def fake_ask(pdir, project, cid, prompt=None, box=None, segment_fn=None):
        seen.update(cid=cid, prompt=prompt, box=box, name=project['name'])
        return {'attempt': 1, 'status': 'done'}
    monkeypatch.setattr(sam, 'ask', fake_ask)
    monkeypatch.setattr(sam, 'asks', lambda pdir, cid: [{'attempt': 1}])
    r = client.post('/projects/p/candidates/7/sam', json={'prompt': 'wooden letter', 'box': [1, 2, 30, 40]})
    assert r.status_code == 200 and r.json()['status'] == 'done'
    assert seen == {'cid': 7, 'prompt': 'wooden letter', 'box': [1, 2, 30, 40], 'name': 'p'}
    assert client.get('/projects/p/candidates/7/sam').json()['asks'] == [{'attempt': 1}]

    def limit(*a, **k):
        raise sam.SamError('candidate 7 already used its 3 SAM asks')
    monkeypatch.setattr(sam, 'ask', limit)
    assert client.post('/projects/p/candidates/7/sam', json={}).status_code == 409
    assert client.post('/projects/p/candidates/7/sam', json={'box': [1, 2]}).status_code == 400


def test_build_passes_allow_small_and_reuse_from(client, monkeypatch):
    import json
    from plc import build as build_mod
    seen = {}

    def fake_build(pdir, project, expected_labels=None, opts=None, allow_small=None, reuse_from=None):
        seen.update(allow_small=allow_small, reuse_from=reuse_from)
        (pdir / 'out').mkdir(exist_ok=True)
        (pdir / 'out' / 'b1_level.json').write_text(json.dumps({'canvas': project['canvas']}))
        return {'id': 'b1', 'level_json': 'out/b1_level.json'}
    monkeypatch.setattr(build_mod, 'build', fake_build)
    _setup(client)
    r = client.post('/projects/p/build', json={'allow_small': ['L01_E'], 'reuse_from': 'b1'})
    assert r.status_code == 200, r.text
    assert seen == {'allow_small': ['L01_E'], 'reuse_from': 'b1'}
    assert client.post('/projects/p/build', json={'reuse_from': '../x'}).status_code == 400
    assert client.post('/projects/p/build', json={'allow_small': 'L01_E'}).status_code == 400


def test_drain_refuses_new_jobs(client, monkeypatch):
    Fake(monkeypatch)
    _setup(client)
    assert client.post('/server/drain', json={'on': True}).json()['draining'] is True
    r = client.post('/projects/p/edits', json={'boxes': [_box()]})
    assert r.status_code == 503 and 'server restarting' in r.json()['error']
    assert client.get('/projects/p').json()['edits'] == []          # nothing queued
    client.post('/server/drain', json={'on': False})
    assert client.post('/projects/p/edits', json={'boxes': [_box()]}).status_code == 200
    assert server.get_queue().wait_idle(20)


def test_only_one_server_owns_projects(client):
    with pytest.raises(RuntimeError) as e:
        server.claim_projects()                       # the TestClient's server already holds the lock
    assert 'already owns' in str(e.value)


def test_requeue_only_never_sent_edits(client, monkeypatch):
    fake = Fake(monkeypatch)
    _setup(client)
    from plc import edits
    [eid] = edits.add_edits('p', [_box()], auto_detect=False)
    store.update('p', lambda p: p['edits'][0].update(status='failed', error='server restarted before the request was sent'))
    r = client.post(f'/projects/p/edits/{eid}/requeue')
    assert r.status_code == 200 and r.json()['job'] == f'p.{eid}'
    assert server.get_queue().wait_idle(20)
    assert client.get(f'/projects/p/edits/{eid}').json()['status'] == 'done' and fake.routes() == ['clai']
    store.update('p', lambda p: p['edits'][0].update(status='failed'))
    assert client.post(f'/projects/p/edits/{eid}/requeue').status_code == 409   # it was sent: never again


def test_drain_holds_jobs_before_the_ledger(client, monkeypatch):
    import threading
    import time as _t
    from plc import edits as E
    Fake(monkeypatch)
    _setup(client)
    client.post('/server/drain', json={'on': True})
    try:
        [eid] = E.add_edits('p', [_box()], auto_detect=False)
        t = threading.Thread(target=E.run_edit, args=('p', eid), daemon=True)
        t.start()
        _t.sleep(1.5)
        s = client.get('/server/settings').json()
        assert s['held_jobs'] == 1 and s['in_flight'] == 0 and s['restart_safe'] is True
        assert not (store.edit_dir('p', eid) / 'request.json').exists()     # held BEFORE the ledger
        plan = []
        store.recover('p', plan)                                           # what a restart would do now
        assert plan == [('edit', 'p', eid)]
    finally:
        client.post('/server/drain', json={'on': False})
    t.join(10)


def test_post_edits_returns_at_once_while_astra_is_busy(client, monkeypatch):
    import time as _t
    from plc import providers
    Fake(monkeypatch)
    _setup(client)
    slots = providers.ASTRA_SLOTS
    held = [slots.__enter__() for _ in range(slots.limit)]                # every Astra slot taken
    try:
        t0 = _t.time()
        r = client.post('/projects/p/edits', json={'boxes': [_box()], 'provider': 'astra', 'detect': False})
        assert r.status_code == 200 and _t.time() - t0 < 2                 # recorded + queued, not blocked
        assert client.get('/projects/p').json()['edits'][0]['status'] in ('queued', 'running')
    finally:
        for _ in held:
            slots.__exit__(None, None, None)
    assert server.get_queue().wait_idle(20)


def test_astra_concurrency_survives_a_restart(env):
    from plc import providers
    old = providers.ASTRA_SLOTS.limit
    try:
        with TestClient(server.app) as c:
            assert c.patch('/server/settings', json={'astra_concurrency': 12}).json()['astra_concurrency'] == 12
        providers.ASTRA_SLOTS.set_limit(3)                                  # a fresh process starts from the env
        with TestClient(server.app) as c:                                   # lifespan reads the saved value
            assert c.get('/server/settings').json()['astra_concurrency'] == 12
    finally:
        providers.ASTRA_SLOTS.set_limit(old)
