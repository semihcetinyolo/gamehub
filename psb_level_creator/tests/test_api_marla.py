import io
import json

import numpy as np
import pytest
import requests
from PIL import Image

from _api_helpers import env, Fake, bg_png  # noqa: F401
from plc import edits, providers, store
from plc.providers import ProviderError


def _png(a):
    b = io.BytesIO()
    Image.fromarray(a).save(b, 'PNG')
    return b.getvalue()


class Resp:
    def __init__(self, status=200, body=None, content=b''):
        self.status_code, self._body, self.content = status, body, content
        self.ok = status < 400
        self.text = json.dumps(body) if body is not None else ''

    def json(self):
        if self._body is None:
            raise ValueError
        return self._body


class MarlaSession:
    """POST /edits/fix -> job; GET /jobs/j1 -> running, done; GET /jobs/j1/result -> png."""

    def __init__(self, result_png, submit=None, states=('running', 'done')):
        self.result_png, self.submit, self.states = result_png, submit, list(states)
        self.posts, self.gets = [], []

    def post(self, url, **kw):
        self.posts.append((url, kw))
        return self.submit or Resp(200, {'job_id': 'j1'})

    def get(self, url, **kw):
        self.gets.append(url)
        if url.endswith('/result'):
            return Resp(200, None, self.result_png)
        st = self.states.pop(0) if self.states else 'done'
        return Resp(200, {'status': st, 'error': 'boom' if st == 'failed' else None})


def test_marla_fix_request_shape(env, tmp_path):
    scene = _png(np.zeros((64, 48, 3), np.uint8))
    s = MarlaSession(scene)
    jobs = []
    out = providers.marla_fix(scene, {'type': 'rect', 'x0': 1, 'y0': 2, 'x1': 30, 'y1': 40, 'description': 'apple'},
                              on_job=jobs.append, session=s, sleep=lambda _: None)
    url, kw = s.posts[0]
    assert url.endswith('/edits/fix') and kw['data']['model'] == 'gpt-image-2.5-sunburst'
    assert json.loads(kw['data']['regions'])[0]['x1'] == 30 and kw['files']['image'][0] == 'scene.png'
    assert kw['headers']['Authorization'].startswith('Bearer test-token-')
    assert jobs == ['j1'] and out['job_id'] == 'j1' and out['png'][:4] == b'\x89PNG'
    assert s.gets[-1].endswith('/jobs/j1/result')


def test_marla_fix_errors(env):
    scene = _png(np.zeros((8, 8, 3), np.uint8))
    with pytest.raises(ProviderError) as e:
        providers.marla_fix(scene, {}, session=MarlaSession(scene, submit=Resp(503, {'error': 'busy'})))
    assert e.value.kind == 'failed' and e.value.status == 503
    with pytest.raises(ProviderError) as e:
        providers.marla_fix(scene, {}, session=MarlaSession(scene, states=['failed']), sleep=lambda _: None)
    assert e.value.kind == 'failed' and e.value.status is None and 'j1' in str(e.value)

    class Drop(MarlaSession):
        def post(self, url, **kw):
            raise requests.ConnectionError()
    with pytest.raises(ProviderError) as e:
        providers.marla_fix(scene, {}, session=Drop(scene))
    assert e.value.kind == 'unknown'
    with pytest.raises(ProviderError) as e:
        providers.marla_fix(scene, {}, session=MarlaSession(scene, states=['running'] * 50), sleep=lambda _: None,
                            wait_s=0)
    assert e.value.kind == 'unknown'


def test_marla_edit_end_to_end(env, monkeypatch):
    store.create('p', {'provider': 'marla'})
    edits.set_background('p', bg_png(), 'upload')
    bg = np.asarray(Image.open(store.pdir('p') / 'bg.png').convert('RGB'))
    seen = {}

    def fake_fix(scene_png, region, model, on_job=None, **kw):
        seen.update(region=region, model=model)
        on_job('job-7')
        seen['ledger'] = json.loads((store.pdir('p') / 'edits/e001/request.json').read_text())['attempts']
        a = bg.copy()
        a[1100:1200, 700:800] = (220, 20, 20)                        # inside the rect
        return {'png': _png(a), 'job_id': 'job-7', 'format': 'png', 'channel': 'marla'}
    monkeypatch.setattr(providers, 'marla_fix', fake_fix)
    [eid] = edits.add_edits('p', [{'x0': 600, 'y0': 1000, 'x1': 900, 'y1': 1300, 'description': 'a red box'}],
                            auto_detect=False)
    e = store.read('p')['edits'][0]
    assert e['box'] == [344, 744, 1156, 1556] and e['model'] == 'gpt-image-2.5-sunburst' and e['fallback'] == 'none'
    assert edits.run_edit('p', eid) == 'done'
    assert seen['region']['x0'] == 600 and 'keep the rest of the scene' in seen['region']['description']
    assert seen['ledger'][0]['route'] == 'marla' and seen['ledger'][0]['job_id'] == 'job-7'
    d = store.edit_dir('p', eid)
    ans = np.asarray(Image.open(d / 'answer.png'))
    assert ans.shape == (812, 812, 3) and (ans[1100 - 744 + 5, 700 - 344 + 5] == (220, 20, 20)).all()
    assert (d / 'answer_full.png').is_file()
    e = store.read('p')['edits'][0]
    assert e['via'] == 'marla'
    u = edits.usage('p')
    assert u['edits']['marla'] == 1 and u['requests_sent']['marla'] == 1
    assert u['marla_models'] == {'gpt-image-2.5-sunburst': 1}


def test_marla_submit_errors_are_retried(env, monkeypatch):
    monkeypatch.setattr(edits, '_sleep', lambda s: None)
    store.create('p', {'provider': 'marla', 'marla_model': 'gpt-image-2'})
    edits.set_background('p', bg_png(), 'upload')
    bg = np.asarray(Image.open(store.pdir('p') / 'bg.png').convert('RGB'))
    n = {'k': 0}

    def fake_fix(scene_png, region, model, on_job=None, **kw):
        n['k'] += 1
        if n['k'] < 3:
            raise ProviderError('Marla HTTP 503: busy', 'failed', 503)
        return {'png': _png(bg), 'job_id': 'j', 'channel': 'marla'}
    monkeypatch.setattr(providers, 'marla_fix', fake_fix)
    [eid] = edits.add_edits('p', [{'x0': 10, 'y0': 10, 'x1': 200, 'y1': 200, 'description': 'x'}], auto_detect=False)
    assert edits.run_edit('p', eid) == 'done' and n['k'] == 3
    assert store.read('p')['edits'][0]['model'] == 'gpt-image-2'

    def failed_job(*a, **k):
        raise ProviderError('Marla job j2 failed: boom', 'failed')
    monkeypatch.setattr(providers, 'marla_fix', failed_job)
    [eid] = edits.add_edits('p', [{'x0': 10, 'y0': 10, 'x1': 200, 'y1': 200, 'description': 'x'}], auto_detect=False)
    assert edits.run_edit('p', eid) == 'failed'                       # a failed job is not resent


def test_marla_background_generate_and_restyle(env, monkeypatch, tmp_path):
    seen = []

    def fake_albert(prompt, images, w, h, model=providers.MODEL, **kw):
        seen.append((len(images), w, h, model))
        return {'png': bg_png(1536, 2048), 'format': 'png', 'channel': ''}
    monkeypatch.setattr(providers, 'albert_image', fake_albert)
    store.create('g')
    g = edits.add_generation('g', 'a galley kitchen', '3:4', '2K', provider='marla')
    assert edits.run_generation('g', g['id']) == 'done'
    src = tmp_path / 's.png'
    Image.new('RGB', (1650, 2400), (9, 9, 9)).save(src)
    store.create('r')
    g = edits.add_restyle('r', str(src), [str(src)], 'redraw image 1 in the style of image 2', provider='marla')
    assert edits.run_generation('r', g['id']) == 'done'
    assert seen == [(0, 1536, 2048, 'gpt-image-2.5-sunburst'), (2, 1536, 2048, 'gpt-image-2.5-sunburst')]
    assert store.read('r')['background']['via'] == 'marla'
    assert edits.usage('g')['marla_models'] == {'gpt-image-2.5-sunburst (background)': 1}


def test_albert_quality_for_sunburst(env):
    class S:
        def post(self, url, **kw):
            self.kw = kw
            b = io.BytesIO()
            Image.new('RGB', (16, 16)).save(b, 'PNG')
            import base64
            return Resp(200, {'image_base64': base64.b64encode(b.getvalue()).decode()})
    s = S()
    providers.albert_image('x', [], 1536, 2048, model='gpt-image-2.5-sunburst', session=s)
    assert s.kw['json']['quality'] == 'high'
    providers.albert_image('x', [], 1536, 2048, session=s)
    assert 'quality' not in s.kw['json']


def test_marla_scene_is_png_and_refs_are_shrunk():
    small = Image.new('RGB', (300, 400), (10, 20, 30))
    assert edits.marla_scene_bytes(small)[:4] == b'\x89PNG'
    rng = np.random.default_rng(0)
    big = _png(rng.integers(0, 255, (1500, 1200, 3), dtype=np.uint8))       # ~5 MB of noise
    url = edits.marla_ref_url(big)
    assert len(url) <= edits.MARLA_REF_BYTES + 100
    import base64
    im = Image.open(io.BytesIO(base64.b64decode(url.split(',', 1)[1])))
    assert max(im.size) == edits.MARLA_REF_SIDE


def test_marla_job_is_resumed_after_a_restart(env, monkeypatch):
    from fastapi.testclient import TestClient
    from plc import server
    store.create('p', {'provider': 'marla'})
    edits.set_background('p', bg_png(), 'upload')
    bg = np.asarray(Image.open(store.pdir('p') / 'bg.png').convert('RGB'))
    [eid] = edits.add_edits('p', [{'x0': 600, 'y0': 1000, 'x1': 900, 'y1': 1300, 'description': 'x'}],
                            auto_detect=False)
    # the old server had submitted and got a job id, then died while polling
    store.update('p', lambda p: p['edits'][0].update(status='running'))
    req = {'kind': 'edit'}
    path = store.edit_dir('p', eid) / 'request.json'
    store.record_attempt(path, req, 'marla')
    req['attempts'][-1]['job_id'] = 'job-9'
    store.write_json(path, req)
    seen = []
    monkeypatch.setattr(providers, 'marla_fix', lambda *a, **k: (_ for _ in ()).throw(AssertionError('resent!')))
    monkeypatch.setattr(providers, 'marla_wait', lambda job, **k: (seen.append(job), {
        'png': _png(bg), 'job_id': job, 'format': 'png', 'channel': 'marla'})[1])
    server.queue = None
    with TestClient(server.app):
        assert server.get_queue().wait_idle(30)
    server.queue = None
    e = store.read('p')['edits'][0]
    assert seen == ['job-9'] and e['status'] == 'done' and 'resume_job' not in e
    att = json.loads(path.read_text())['attempts']
    assert len(att) == 1 and att[0]['outcome'] == 'ok (resumed)'
