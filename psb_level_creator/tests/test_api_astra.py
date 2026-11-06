import io
import json
import subprocess

import cv2
import numpy as np
import pytest
from PIL import Image

from _api_helpers import env, Fake, bg_png, answer_from  # noqa: F401
from plc import edits, providers, store
from plc.edits import edit_area
from plc import register as R
from plc.providers import ProviderError


def _project(name='p', provider='astra', boxes=None):
    store.create(name, {'provider': provider})
    edits.set_background(name, bg_png(), 'upload')
    boxes = boxes or [{'x0': 600, 'y0': 1000, 'x1': 900, 'y1': 1300, 'description': 'add a small red apple'}]
    return edits.add_edits(name, boxes)


def _textured(h=1024, w=1024, seed=1):
    rng = np.random.default_rng(seed)
    a = cv2.GaussianBlur(rng.integers(0, 255, (h, w, 3)).astype(np.uint8), (0, 0), 3)
    a = cv2.normalize(a, None, 0, 255, cv2.NORM_MINMAX)
    return a


def _warp(a, dx, dy, scale):
    h, w = a.shape[:2]
    M = np.array([[scale, 0, dx], [0, scale, dy]], np.float32)
    return cv2.warpAffine(a, M, (w, h), borderMode=cv2.BORDER_REFLECT)


def test_astra_square_is_1024_and_sent_as_is():
    a = edit_area([700, 900, 900, 1100], 1536, 2048, provider='astra')   # 200 px -> 1024, not 512
    assert a['box'][2] - a['box'][0] == 1024 and a['send'] == [1024, 1024]
    a = edit_area([0, 0, 1100, 1100], 3000, 3000, provider='astra')      # 2048 square sent at 1024
    assert a['box'] == [0, 0, 2048, 2048] and a['send'] == [1024, 1024]


def test_register_undoes_shift_and_scale():
    bg = _textured()
    ans = _warp(bg, 7.0, -5.0, 1.02).copy()
    ans[450:560, 450:560] = (220, 20, 20)                  # the asked change
    out, info = R.register(ans, bg, apply_fit=True)
    assert info['applied'] and info['by'] == 'plc.register'
    err = np.abs(out.astype(int) - bg.astype(int))[60:-60, 60:-60].mean(-1)
    keep = np.ones_like(err, bool)
    keep[330:510, 330:510] = False
    assert err[keep].mean() < 4                            # back in place outside the change
    _, info = R.register(bg.copy(), bg, apply_fit=True)
    assert not info['applied']                             # already in place: untouched


def test_astra_edit_registered_and_counted(env, monkeypatch):
    seen = {}

    def shifted(images, extra):
        seen['ledger'] = [a['route'] for a in json.loads((store.edit_dir('p', 'e001') / 'request.json')
                                                          .read_text())['attempts']]
        sent = np.asarray(Image.open(io.BytesIO(images[0])).convert('RGB'))
        a = _warp(sent, 6.0, 4.0, 1.0)
        a = cv2.resize(a, (1254, 1254))                    # GPT answers about 1.5 MP
        b = io.BytesIO()
        Image.fromarray(a).save(b, 'PNG')
        return {'png': b.getvalue(), 'format': 'png', 'channel': 'astra'}
    fake = Fake(monkeypatch, astra=shifted)
    [eid] = _project()
    assert edits.run_edit('p', eid) == 'done'
    assert fake.routes() == ['astra'] and seen['ledger'] == ['astra']
    e = store.read('p')['edits'][0]
    assert e['provider'] == 'astra' and e['via'] == 'astra' and e['fallback'] == 'none'
    assert e['registration']['applied'] and e['registration']['by'] == 'plc.register'
    d = store.edit_dir('p', eid)
    assert (d / 'answer_raw.png').exists()
    x0, y0, x1, y1 = e['box']
    bg = np.asarray(Image.open(store.pdir('p') / 'bg.png'))[y0:y1, x0:x1].astype(int)
    ans = np.asarray(Image.open(d / 'answer.png')).astype(int)
    assert np.abs(ans - bg)[40:-40, 40:-40].mean() < 6
    u = edits.usage('p')
    assert u['edits']['astra'] == 1 and u['requests_sent']['astra'] == 1 and u['by_provider'] == {
        'astra': {'done': 1, 'failed': 0, 'unknown': 0, 'pending': 0}}


def test_nano_registration_measured_not_applied(env, monkeypatch):
    Fake(monkeypatch)
    [eid] = _project('n', provider='nano')
    edits.run_edit('n', eid)
    reg = store.read('n')['edits'][0]['registration']
    assert reg['applied'] is False


def test_usage_limit_stops_astra_for_20_min(env, monkeypatch):
    def limit(images, extra):
        providers._astra_set_limit()
        e = ProviderError('Astra usage limit: Görüntü alınamadı (HTTP 429): usage_limit', 'failed', 429)
        e.usage_limit = True
        raise e
    fake = Fake(monkeypatch, astra=limit)
    ids = _project(boxes=[{'x0': 100 + 300 * i, 'y0': 100, 'x1': 300 + 300 * i, 'y1': 300, 'description': 'x'}
                          for i in range(2)])
    assert edits.run_edit('p', ids[0]) == 'failed'
    assert edits.run_edit('p', ids[1]) == 'failed'            # queued before the limit: refused, nothing sent
    assert fake.routes() == ['astra']
    e2 = store.read('p')['edits'][1]
    assert 'usage limit' in e2['error'] and not store.was_sent(store.edit_dir('p', ids[1]) / 'request.json')
    with pytest.raises(store.StoreError) as ex:
        edits.add_edits('p', [{'x0': 0, 'y0': 0, 'x1': 200, 'y1': 200, 'description': 'x'}])
    assert ex.value.status == 429
    edits.add_edits('p', [{'x0': 0, 'y0': 0, 'x1': 200, 'y1': 200, 'description': 'x'}], provider='nano')
    assert edits.usage('p')['astra_limit_until']


# ---- the CLI wrapper (subprocess mocked) ---------------------------------------------------------------------------

class Run:
    def __init__(self, code=0, stderr='', write=True):
        self.code, self.stderr, self.write, self.args = code, stderr, write, None

    def __call__(self, args, **kw):
        self.args, self.kw = args, kw
        if self.write:
            out = args[args.index('--output-path') + 1]
            Image.new('RGB', (1254, 1254), (9, 9, 9)).save(out)
        return subprocess.CompletedProcess(args, self.code, '', self.stderr)


def test_astra_cli_args(env, tmp_path):
    r = Run()
    out = providers.astra_edit('add an apple', [tmp_path / 'sent.png', tmp_path / 'ref_1.png'], run=r)
    a = r.args
    assert a[1:6] == ['image', '--model', 'gpt', '--ratio', '1:1']
    assert a[a.index('--input-path') + 1].endswith('sent.png') and a.count('--input-path') == 2
    assert a[-2:] == ['--prompt', 'add an apple'] and '--transparent' not in a
    assert not any('key' in str(x).lower() for x in a)
    assert out['png'][:4] == b'\x89PNG' and out['channel'] == 'astra'


@pytest.mark.parametrize('code,stderr,kind', [
    (1, 'Düzenleniyor…\nSunucuya ulaşılamadı ya da istek zaman aşımına uğradı.', 'unknown'),
    (2, 'Girdi dosyası okunamadı: x', 'invalid'),
    (1, 'Görüntü alınamadı (HTTP 500): server error', 'failed'),
])
def test_astra_cli_errors(env, tmp_path, code, stderr, kind):
    with pytest.raises(ProviderError) as e:
        providers.astra_edit('x', [tmp_path / 's.png'], run=Run(code, stderr, write=False))
    assert e.value.kind == kind
    assert providers.astra_limit_until() is None


def test_astra_cli_usage_limit_sets_the_stop(env, tmp_path):
    with pytest.raises(ProviderError) as e:
        providers.astra_edit('x', [tmp_path / 's.png'],
                             run=Run(1, 'Görüntü alınamadı (HTTP 429): {"type":"usage_limit_reached"}', write=False))
    assert getattr(e.value, 'usage_limit', False) and providers.astra_limit_until()
    r = Run()
    with pytest.raises(ProviderError) as e:
        providers.astra_edit('x', [tmp_path / 's.png'], run=r)
    assert e.value.kind == 'invalid' and r.args is None          # nothing started


def test_astra_cli_timeout_is_unknown(env, tmp_path):
    def slow(args, **kw):
        raise subprocess.TimeoutExpired(args, 1)
    with pytest.raises(ProviderError) as e:
        providers.astra_edit('x', [tmp_path / 's.png'], run=slow)
    assert e.value.kind == 'unknown'


def test_astra_slots_resizable():
    import threading
    import time as _t
    s = providers.Slots(2)
    live, peak, lock = [0], [0], threading.Lock()

    def work():
        with s:
            with lock:
                live[0] += 1
                peak[0] = max(peak[0], live[0])
            _t.sleep(0.05)
            with lock:
                live[0] -= 1
    ts = [threading.Thread(target=work) for _ in range(6)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    assert peak[0] == 2
    s.set_limit(5)
    peak[0] = 0
    ts = [threading.Thread(target=work) for _ in range(6)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    assert peak[0] == 5
