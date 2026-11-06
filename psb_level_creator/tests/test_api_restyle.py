import io
import json

import numpy as np
import pytest
from PIL import Image

from _api_helpers import env, Fake, bg_png  # noqa: F401
from plc import edits, store
from plc.providers import ProviderError


def _img(path, size, colour):
    Image.new('RGB', size, colour).save(path)
    return str(path)


def _answer(images, extra):
    a = np.zeros((2048, 1536, 3), np.uint8)
    a[..., 1] = 140
    b = io.BytesIO()
    Image.fromarray(a).save(b, 'PNG')
    return {'png': b.getvalue(), 'format': 'png', 'channel': 'test'}


def test_restyle_with_nano(env, monkeypatch, tmp_path):
    seen = {}

    def ans(images, extra):
        seen.update(extra, n=len(images))
        seen['ledger'] = json.loads((store.pdir('p') / 'gen/g1/request.json').read_text())['attempts']
        return _answer(images, extra)
    fake = Fake(monkeypatch, clai=ans)
    src = _img(tmp_path / 'src.png', (1650, 2400), (200, 100, 50))
    ref = _img(tmp_path / 'ref.png', (1792, 2400), (10, 20, 30))
    store.create('p')
    g = edits.add_restyle('p', src, [ref], 'Redraw image 1 in the watercolour style of image 2.')
    gdir = store.pdir('p') / g['dir']
    assert g['inputs'] == ['source.png', 'style_1.png'] and max(Image.open(gdir / 'style_1.png').size) == 1536
    assert Image.open(gdir / 'source.png').size == (1408, 2048)
    assert edits.run_generation('p', g['id']) == 'done'
    assert fake.routes() == ['clai'] and seen['n'] == 2 and seen['ledger'][0]['route'] == 'clai'
    assert seen['aspect_ratio'] == '3:4' and seen['long_side'] == 2048 and seen['square'] is False
    p = store.read('p')
    assert p['canvas'] == {'w': 1536, 'h': 2048}
    assert p['background']['source'] == 'restyle' and p['background']['restyle_source'] == src
    assert p['background']['border']['ok'] is True
    assert edits.usage('p')['requests_sent']['clai'] == 1


def test_restyle_with_astra_and_fallback(env, monkeypatch, tmp_path):
    seen = {}

    def ans(images, extra):
        seen.update(extra)
        return _answer(images, extra)
    Fake(monkeypatch, astra=ans)
    src = _img(tmp_path / 'src.png', (800, 1000), (1, 2, 3))
    store.create('a')
    g = edits.add_restyle('a', src, [], 'redraw', provider='astra')
    assert edits.run_generation('a', g['id']) == 'done'
    assert seen['paths'][0].endswith('source.png') and store.read('a')['background']['via'] == 'astra'

    fake = Fake(monkeypatch, clai=ProviderError('Clai HTTP 400: invalid_request', 'failed', 400), albert=_answer)
    store.create('b')
    g = edits.add_restyle('b', src, [src], 'redraw')
    assert edits.run_generation('b', g['id']) == 'done'
    assert fake.routes() == ['clai', 'albert'] and fake.calls[1][1]['w'] == 1536


def test_restyle_validation(env, monkeypatch, tmp_path):
    Fake(monkeypatch)
    store.create('p')
    src = _img(tmp_path / 's.png', (600, 800), (5, 5, 5))
    for bad in (dict(source='nope.png', prompt='x'), dict(source=src, prompt=''),
                dict(source=src, prompt='x', ratio='7:5'), dict(source=src, prompt='x', size='4K'),
                dict(source=src, prompt='x', provider='gpt'), dict(source=src, prompt='x', style_refs=[src] * 5)):
        with pytest.raises(store.StoreError):
            edits.add_restyle('p', **bad)
    edits.set_background('p', bg_png(), 'upload')
    edits.add_edits('p', [{'x0': 10, 'y0': 10, 'x1': 300, 'y1': 300, 'description': 'x'}])
    with pytest.raises(store.StoreError) as e:
        edits.add_restyle('p', src, [], 'x')
    assert e.value.status == 409
