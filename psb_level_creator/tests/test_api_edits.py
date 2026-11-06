import base64
import io
import json

import numpy as np
import pytest
import requests
from PIL import Image

from _api_helpers import env, Fake, bg_png, answer_from  # noqa: F401
from plc import edits, providers, store
from plc.edits import edit_area
from plc.providers import ProviderError


# ---- edit_area -------------------------------------------------------------------------------------------------

def test_square_sizes_and_centre():
    a = edit_area([700, 900, 900, 1100], 1536, 2048)       # 200 px -> 512 square centred on the rect
    assert a == {'box': [544, 744, 1056, 1256], 'send': [512, 512], 'square': True}
    a = edit_area([100, 100, 800, 400], 1536, 2048)          # 700 px long side -> 1024
    assert a['box'][2] - a['box'][0] == 1024 and a['square']
    a = edit_area([0, 0, 1100, 1100], 3000, 3000)            # 1100 -> 2048
    assert a['box'] == [0, 0, 2048, 2048] and a['send'] == [2048, 2048]


def test_square_kept_inside_canvas():
    a = edit_area([1400, 1950, 1530, 2040], 1536, 2048)
    x0, y0, x1, y1 = a['box']
    assert (x1, y1) == (1536, 2048) and x1 - x0 == 512 and a['square']
    a = edit_area([-50, -50, 100, 100], 1536, 2048)          # clamped to the canvas first
    assert a['box'][:2] == [0, 0]


def test_no_square_fits_sends_rect_scaled():
    a = edit_area([0, 0, 1500, 1200], 1536, 2048)             # 2048 square does not fit a 1536 wide canvas
    assert a == {'box': [0, 0, 1500, 1200], 'send': [1500, 1200], 'square': False}
    a = edit_area([0, 0, 2600, 3000], 4000, 3000)             # side 3000 fits: square, sent at 2048
    assert a['square'] and a['box'][2] - a['box'][0] == 3000 and a['send'] == [2048, 2048]
    assert edit_area([10, 10, 300, 200], 1536, 2048, square=False)['box'] == [10, 10, 300, 200]


def test_empty_rect_refused():
    with pytest.raises(store.StoreError):
        edit_area([2000, 2000, 2100, 2100], 1536, 2048)


# ---- run_edit --------------------------------------------------------------------------------------------------

def _project(name='p', fallback='albert', boxes=None):
    store.create(name, {'fallback': fallback})
    edits.set_background(name, bg_png(), 'upload')
    boxes = boxes or [{'x0': 600, 'y0': 1000, 'x1': 900, 'y1': 1300, 'description': 'add a small red apple'}]
    return edits.add_edits(name, boxes)


def _request(name, eid):
    return json.loads((store.edit_dir(name, eid) / 'request.json').read_text())


def test_clai_answer_comes_back_in_place(env, monkeypatch):
    seen = {}

    def check_ledger(route):
        # the paid request is recorded BEFORE the provider is called
        seen[route] = [a['route'] for a in _request('p', 'e001')['attempts']]
    fake = Fake(monkeypatch, answer_size=(1000, 1000), on_call=check_ledger)
    [eid] = _project(boxes=[{'x0': 600, 'y0': 1000, 'x1': 1200, 'y1': 1500, 'description': 'apple'}])
    assert edits.run_edit('p', eid) == 'done'
    assert seen == {'clai': ['clai']}
    assert fake.routes() == ['clai']
    _, extra = fake.calls[0]
    assert extra['square'] is True and extra['long_side'] == 1024
    e = store.read('p')['edits'][0]
    assert e['status'] == 'done' and e['via'] == 'clai' and e['channel'] == 'clai-test'
    x0, y0, x1, y1 = e['box']
    assert (x1 - x0, y1 - y0) == (1024, 1024)
    d = store.edit_dir('p', eid)
    ans = np.array(Image.open(d / 'answer.png'))
    assert ans.shape == (1024, 1024, 3)
    assert (d / 'answer_raw.png').exists()                  # 1000 px answer kept, resized back to the box
    bg = np.array(Image.open(store.pdir('p') / 'bg.png'))[y0:y1, x0:x1].astype(int)
    diff = np.abs(ans.astype(int) - bg).sum(-1) > 60
    ys, xs = np.nonzero(diff)
    assert abs(xs.mean() - 512) < 10 and abs(ys.mean() - 512) < 10   # the red square sits where it was painted
    r = json.loads((d / 'result.json').read_text())
    assert r['via'] == 'clai' and r['status'] == 'done'


def test_clai_error_goes_to_albert_once(env, monkeypatch):
    fake = Fake(monkeypatch, clai=ProviderError('Clai HTTP 400: content_policy', 'failed', 400))
    [eid] = _project()
    assert edits.run_edit('p', eid) == 'done'
    assert fake.routes() == ['clai', 'albert']
    assert [a['route'] for a in _request('p', eid)['attempts']] == ['clai', 'albert']
    e = store.read('p')['edits'][0]
    assert e['via'] == 'albert' and 'content_policy' in e['clai_error']
    _, extra = fake.calls[1]
    assert (extra['w'], extra['h']) == (512, 512)
    assert edits.usage('p')['edits']['albert'] == 1


def test_fallback_none_fails_without_albert(env, monkeypatch):
    fake = Fake(monkeypatch, clai=ProviderError('Clai HTTP 400', 'failed', 400))
    [eid] = _project(fallback='none')
    assert edits.run_edit('p', eid) == 'failed'
    assert fake.routes() == ['clai']
    assert store.read('p')['edits'][0]['error'] == 'Clai HTTP 400'


def test_unknown_outcomes(env, monkeypatch):
    Fake(monkeypatch, clai=ProviderError('Clai did not answer within 210 s', 'unknown'))
    [eid] = _project(fallback='none')
    assert edits.run_edit('p', eid) == 'unknown'
    Fake(monkeypatch, clai=ProviderError('x', 'failed', 500), albert=ProviderError('Albert timeout', 'unknown'))
    [eid] = _project('q')
    assert edits.run_edit('q', eid) == 'unknown'
    assert edits.usage('q')['edits']['unknown'] == 1


def test_internal_error_after_send_is_unknown(env, monkeypatch):
    Fake(monkeypatch, clai=lambda images, extra: {'png': b'not an image', 'channel': ''})
    [eid] = _project()
    assert edits.run_edit('p', eid) == 'unknown'           # request left, the answer broke: never resend
    assert edits.run_edit('p', eid) == 'unknown'


def test_refs_are_sent_after_the_crop(env, monkeypatch, tmp_path):
    fake = Fake(monkeypatch)
    ref = tmp_path / 'ref.png'
    Image.new('RGB', (3000, 1500), (0, 200, 0)).save(ref)
    b = io.BytesIO()
    Image.new('RGB', (64, 64), (0, 0, 200)).save(b, 'PNG')
    durl = 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()
    [eid] = _project(boxes=[{'x0': 10, 'y0': 10, 'x1': 200, 'y1': 200, 'description': 'x',
                             'ref_images': [str(ref), durl]}])
    e = store.read('p')['edits'][0]
    assert e['ref_images'] == ['edits/e001/ref_1.png', 'edits/e001/ref_2.png']
    assert max(Image.open(store.pdir('p') / e['ref_images'][0]).size) == 1024
    edits.run_edit('p', eid)
    assert len(fake.calls) == 1


def test_background_locked_once_edits_exist(env, monkeypatch):
    _project()
    with pytest.raises(store.StoreError) as e:
        edits.set_background('p', bg_png(), 'upload')
    assert e.value.status == 409
    with pytest.raises(store.StoreError):
        edits.add_generation('p', 'a porch')


def test_generation_sets_canvas(env, monkeypatch):
    fake = Fake(monkeypatch)
    store.create('g')
    g = edits.add_generation('g', 'a cosy porch', '3:4', '2K')
    assert edits.run_generation('g', g['id']) == 'done'
    p = store.read('g')
    assert p['canvas'] == {'w': 1536, 'h': 2048}
    assert p['background']['via'] == 'clai' and p['background']['source'] == 'generate'
    assert fake.calls[0][1]['ratio'] == '3:4'
    assert edits.usage('g')['requests_sent'] == {'clai': 1, 'albert': 0, 'astra': 0, 'marla': 0}


# ---- providers (HTTP shape, mocked session) --------------------------------------------------------------------

class Resp:
    def __init__(self, status=200, body=None, headers=None):
        self.status_code, self._body, self.headers = status, body or {}, headers or {}
        self.ok = status < 400

    def json(self):
        return self._body


class Session:
    def __init__(self, resp=None, exc=None):
        self.resp, self.exc, self.calls = resp, exc, []

    def post(self, url, **kw):
        self.calls.append((url, kw))
        if self.exc:
            raise self.exc
        return self.resp


def _b64png(size=(64, 64)):
    b = io.BytesIO()
    Image.new('RGB', size, (1, 2, 3)).save(b, 'JPEG')
    return base64.b64encode(b.getvalue()).decode()


def test_clai_edit_body_and_answer(env):
    s = Session(Resp(200, {'data': [{'b64_json': _b64png()}], 'output_format': 'jpeg'},
                     {'x-claiface-image-channel': 'flow-3'}))
    out = providers.clai_edit('add an apple', [b'PNG1', b'PNG2'], square=True, long_side=1024, session=s)
    url, kw = s.calls[0]
    assert url == 'http://127.0.0.1:9/v1/images/edits'
    body = kw['json']
    assert body['model'] == 'gemini-3-pro-image' and body['max_wait'] == 180
    assert body['image_size'] == '1K' and body['aspect_ratio'] == '1:1' and len(body['images']) == 2
    assert body['images'][0]['image_url'].startswith('data:image/png;base64,')
    assert kw['headers']['Authorization'] == 'Bearer test-key-' + 'k' * 30
    assert out['channel'] == 'flow-3' and out['png'][:4] == b'\x89PNG'
    providers.clai_edit('x', [b'P'], square=False, long_side=2048, session=s)
    assert s.calls[1][1]['json']['image_size'] == '2K' and 'aspect_ratio' not in s.calls[1][1]['json']


def test_clai_generate_route(env):
    s = Session(Resp(200, {'data': [{'b64_json': _b64png()}]}))
    providers.clai_generate('porch', ratio='3:4', size='2K', session=s)
    url, kw = s.calls[0]
    assert url.endswith('/v1/images/generations')
    assert kw['json'] == {'model': 'gemini-3-pro-image', 'prompt': 'porch', 'aspect_ratio': '3:4', 'image_size': '2K'}


def test_provider_errors_never_carry_secrets(env):
    secret = 'test-key-' + 'k' * 30
    s = Session(Resp(503, {'error': {'type': 'image_quota_exhausted', 'message': 'Bearer ' + secret + ' used up'}}))
    with pytest.raises(ProviderError) as e:
        providers.clai_edit('x', [b'P'], square=True, long_side=512, session=s)
    assert e.value.kind == 'failed' and e.value.status == 503 and secret not in str(e.value)
    with pytest.raises(ProviderError) as e:
        providers.clai_edit('x', [b'P'], square=True, long_side=512, session=Session(exc=requests.Timeout()))
    assert e.value.kind == 'unknown'
    with pytest.raises(ProviderError) as e:
        providers.clai_edit('x', [b'P'], square=True, long_side=512, session=Session(Resp(200, {'data': []})))
    assert e.value.kind == 'failed'


def test_albert_body(env):
    s = Session(Resp(200, {'image_base64': _b64png((512, 512))}))
    out = providers.albert_image('apple', [b'PNG'], 512, 512, session=s)
    url, kw = s.calls[0]
    assert url == 'http://127.0.0.1:9/albert'
    assert kw['json']['input_images'] == [base64.b64encode(b'PNG').decode()]
    assert kw['json']['width'] == 512 and kw['json']['transparent_background'] is False
    assert kw['headers']['Authorization'].startswith('Bearer test-token-')
    assert out['png'][:4] == b'\x89PNG'
    with pytest.raises(ProviderError) as e:
        providers.albert_image('apple', [], 512, 512, session=Session(Resp(429)))
    assert e.value.status == 429


def test_missing_key_sends_nothing(env, monkeypatch, tmp_path):
    monkeypatch.setattr(providers, 'CLAI_KEY_FILE', tmp_path / 'nope')
    s = Session(Resp(200))
    with pytest.raises(ProviderError) as e:
        providers.clai_edit('x', [b'P'], square=True, long_side=512, session=s)
    assert e.value.kind == 'invalid' and s.calls == []
