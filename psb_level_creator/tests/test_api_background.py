import io
import json

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from _api_helpers import env, Fake, bg_png  # noqa: F401
from plc import background as bgx, edits, server, store

W, H, M = 768, 1024, 60


def painting(margin=True, seed=0):
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:H, 0:W]
    a = np.stack([60 + xx * 120 // W, 90 + yy * 100 // H, np.full_like(xx, 70)], -1)
    a = np.clip(a + rng.integers(-10, 10, a.shape), 0, 255).astype(np.uint8)
    if margin:   # white watercolour paper around a ragged painting edge
        edge = M + (8 * np.sin(np.arange(max(W, H)) / 9)).astype(int)
        for x in range(W):
            a[:edge[x], x] = 248
            a[H - edge[x]:, x] = 247
        for y in range(H):
            a[y, :edge[y]] = 249
            a[y, W - edge[y]:] = 246
    return a


def png(a):
    b = io.BytesIO()
    Image.fromarray(a).save(b, 'PNG')
    return b.getvalue()


def test_border_detector():
    info = bgx.border_info(painting(True))
    assert not info['ok'] and info['fraction'] > 0.1 and min(info['sides'].values()) == 1.0
    assert bgx.border_info(painting(False))['ok']
    sky = painting(False)
    sky[:200] = (236, 238, 240)                               # a pale sky along one side is not a border
    assert bgx.border_info(sky)['ok']
    assert bgx.nearest_ratio(1792, 2400, ('1:1', '3:4', '4:3')) == '3:4'


def test_edits_refused_on_a_bordered_background(env, monkeypatch):
    Fake(monkeypatch)
    store.create('p')
    p = edits.set_background('p', png(painting(True)), 'upload')
    assert p['background']['border']['ok'] is False
    box = [{'x0': 200, 'y0': 300, 'x1': 400, 'y1': 500, 'description': 'apple'}]
    with pytest.raises(store.StoreError) as e:
        edits.add_edits('p', box)
    assert e.value.status == 409 and ('full-bleed' in str(e.value) or 'no paper found' in str(e.value))
    assert edits.add_edits('p', box, allow_border=True) == ['e001']


def _bordered_project(monkeypatch, name='p'):
    Fake(monkeypatch)
    store.create(name)
    edits.set_background(name, png(painting(True)), 'upload')
    [eid] = edits.add_edits(name, [{'x0': 250, 'y0': 350, 'x1': 450, 'y1': 550, 'description': 'x'}],
                            auto_detect=False, allow_border=True)
    assert edits.run_edit(name, eid) == 'done'
    from plc import detect

    def add(p):
        p['candidates'] = [{'id': 1, 'edit': eid, 'box': [330, 430, 370, 470], 'area': 1600, 'flags': [],
                            'state': 'kept', 'label': 'L01_A', 'group': 'Letters'}]
    store.update(name, add)
    detect.save_mask(store.pdir(name), 1, np.ones((40, 40), bool))
    return eid


def fill_answer(images, extra):
    """A full-bleed answer: the sent picture with its white border painted over."""
    a = np.asarray(Image.open(io.BytesIO(images[0])).convert('RGB')).copy()
    white = (a.min(2) > 230)
    a[white] = (90, 120, 80)
    return {'png': png(a), 'format': 'png', 'channel': 'test'}


def test_extend_replaces_only_the_border(env, monkeypatch):
    _bordered_project(monkeypatch)
    seen = {}

    def ans(images, extra):
        seen.update(extra)
        seen['ledger'] = json.loads((store.pdir('p') / 'bgx/x1/request.json').read_text())['attempts']
        return fill_answer(images, extra)
    Fake(monkeypatch, clai=ans)
    before = np.asarray(Image.open(store.pdir('p') / 'bg.png').convert('RGB')).copy()
    rec = bgx.add_extend('p')
    assert rec['border']['ok'] is False and (store.pdir('p') / 'bgx/x1/mask.png').is_file()
    assert bgx.run_extend('p', 'x1') == 'done'
    assert seen['aspect_ratio'] == '3:4' and seen['square'] is False and [a['route'] for a in seen['ledger']] == ['clai']
    after = np.asarray(Image.open(store.pdir('p') / 'bg.png').convert('RGB'))
    alpha = np.asarray(Image.open(store.pdir('p') / 'bgx/x1/mask.png'))
    assert (after[alpha == 0] == before[alpha == 0]).all()               # interior bit-identical
    assert np.abs(after[:20].astype(int) - before[:20]).mean() > 50      # the paper is gone
    p = store.read('p')
    bgm = p['background']
    assert bgm['border']['ok'] is True and bgm['version'] == 2 and bgm['extended_by'] == 'x1'
    assert [v['file'] for v in bgm['versions']] == ['bg_v1.png', 'bg_v2.png']
    assert (np.asarray(Image.open(store.pdir('p') / 'bg_v1.png').convert('RGB')) == before).all()
    assert p['extends'][0]['status'] == 'done' and p['extends'][0]['via'] == 'clai'
    # full-bleed now: edits go through without allow_border
    assert edits.add_edits('p', [{'x0': 300, 'y0': 600, 'x1': 400, 'y1': 700, 'description': 'y'}]) == ['e002']
    with pytest.raises(store.StoreError) as e:
        bgx.add_extend('p')
    assert e.value.status == 409 and ('full-bleed' in str(e.value) or 'no paper found' in str(e.value))


def test_extend_refuses_when_the_mask_touches_a_kept_candidate(env, monkeypatch):
    _bordered_project(monkeypatch)
    from plc import detect
    store.update('p', lambda p: p['candidates'][0].update(box=[30, 30, 90, 90]))
    detect.save_mask(store.pdir('p'), 1, np.ones((60, 60), bool))
    with pytest.raises(store.StoreError) as e:
        bgx.add_extend('p')
    assert e.value.status == 409 and 'L01_A (#1)' in str(e.value)


def test_extend_astra_and_endpoint(env, monkeypatch):
    _bordered_project(monkeypatch)
    seen = {}

    def ans(images, extra):
        seen.update(extra)
        return fill_answer(images, extra)
    Fake(monkeypatch, astra=ans)
    server.queue = None
    with TestClient(server.app) as c:
        b = c.get('/projects/p/background/border').json()
        assert b['ok'] is False
        r = c.post('/projects/p/background/extend', json={'provider': 'astra'})
        assert r.status_code == 200, r.text
        assert r.json()['job'] == 'p.x1'
        assert server.get_queue().wait_idle(30)
        p = c.get('/projects/p').json()
        assert p['extends'][0]['status'] == 'done' and p['extends'][0]['via'] == 'astra'
        assert c.get('/projects/p/background/border').json()['ok'] is True
        assert c.post('/projects/p/background/extend', json={'provider': 'gpt'}).status_code == 400
    server.queue = None


def test_extend_unknown_outcome_is_not_resent(env, monkeypatch):
    from plc.providers import ProviderError
    _bordered_project(monkeypatch)
    Fake(monkeypatch, clai=ProviderError('Clai did not answer', 'unknown'))
    store.update('p', lambda p: p['settings'].update(fallback='none'))
    bgx.add_extend('p')
    assert bgx.run_extend('p', 'x1') == 'unknown'
    assert bgx.run_extend('p', 'x1') == 'unknown'
    assert store.read('p')['background'].get('version') is None


def test_extend_protect_keeps_kept_layers_exact(env, monkeypatch):
    _bordered_project(monkeypatch)
    from plc import detect
    store.update('p', lambda p: p['candidates'][0].update(box=[40, 300, 100, 360]))   # reaches into the paper
    detect.save_mask(store.pdir('p'), 1, np.ones((60, 60), bool))
    Fake(monkeypatch, clai=fill_answer)
    before = np.asarray(Image.open(store.pdir('p') / 'bg.png').convert('RGB')).copy()
    rec = bgx.add_extend('p', kept='protect')
    assert rec['protected'][0]['id'] == 1 and rec['protected'][0]['paper_px'] > 0
    assert rec['warnings'] and 'L01_A (#1)' in rec['warnings'][0]
    assert bgx.run_extend('p', 'x1') == 'done'
    after = np.asarray(Image.open(store.pdir('p') / 'bg.png').convert('RGB'))
    zone = np.zeros(after.shape[:2], bool)
    zone[300 - 6:360 + 6, 40 - 6:100 + 6] = True                         # footprint + layer ring
    assert (after[zone] == before[zone]).all()
    assert np.abs(after[:20, 300:].astype(int) - before[:20, 300:]).mean() > 50


def test_extend_force_on_residual_paper(env, monkeypatch):
    _bordered_project(monkeypatch)
    Fake(monkeypatch, clai=fill_answer)
    bgx.add_extend('p')
    assert bgx.run_extend('p', 'x1') == 'done'
    a = np.asarray(Image.open(store.pdir('p') / 'bg.png').convert('RGB')).copy()
    a[-3:, 100:130] = 250                                       # a thin residual paper tip on the bottom edge
    Image.fromarray(a).save(store.pdir('p') / 'bg.png')
    with pytest.raises(store.StoreError):
        bgx.add_extend('p')                                     # check says ok
    rec = bgx.add_extend('p', force=True)
    assert bgx.run_extend('p', rec['id']) == 'done'
    assert store.read('p')['background']['version'] == 3


def test_extend_under_kept_letters(env, monkeypatch):
    _bordered_project(monkeypatch)
    from plc import detect
    store.update('p', lambda p: p['candidates'][0].update(box=[40, 300, 100, 360]))
    detect.save_mask(store.pdir('p'), 1, np.ones((60, 60), bool))
    Fake(monkeypatch, clai=fill_answer)
    rec = bgx.add_extend('p', kept='under')
    assert rec['protected'][0]['id'] == 1 and rec['warnings']
    assert bgx.run_extend('p', 'x1') == 'done'
    after = np.asarray(Image.open(store.pdir('p') / 'bg.png').convert('RGB'))
    assert after[300:310, 40:50].min() < 200                       # the paper under the letter is painted too


def test_reapply_fills_a_paper_island_without_a_paid_call(env, monkeypatch):
    _bordered_project(monkeypatch)
    Fake(monkeypatch, clai=fill_answer)
    bgx.add_extend('p')
    assert bgx.run_extend('p', 'x1') == 'done'
    v2 = np.asarray(Image.open(store.pdir('p') / 'bg.png').convert('RGB')).copy()
    island = v2.copy()
    island[200:240, 30:50] = 248                                  # paper left inside the old border, not on the edge
    Image.fromarray(island).save(store.pdir('p') / 'bg.png')
    fake = Fake(monkeypatch, clai=ProviderErrorRaiser())
    assert not bgx.paper_mask(island)[200:240, 30:50].any()        # the edge-connected mask misses it
    rec = bgx.reapply_extend('p', 'x1')                             # margin_mask 'original' finds it
    assert rec['paid'] is False and rec['reapply_of'] == 'x1' and rec['id'] == 'x2' and rec['replaced_px'] > 0
    after = np.asarray(Image.open(store.pdir('p') / 'bg.png').convert('RGB'))
    assert after[210:230, 35:45].max() < 200 and fake.calls == []
    alpha = np.asarray(Image.open(store.pdir('p') / 'bgx/x2/mask.png'))
    assert (after[alpha == 0] == island[alpha == 0]).all()
    assert store.read('p')['background']['version'] == 3
    with pytest.raises(store.StoreError):
        bgx.reapply_extend('p', 'x9')


class ProviderErrorRaiser:
    def __call__(self, images, extra):
        raise AssertionError('no paid call expected')


def _patch_project(monkeypatch):
    eid = _bordered_project(monkeypatch)
    from plc import detect
    e = store.find_edit(store.read('p'), eid)
    x0, y0, x1, y1 = e['box']
    monkeypatch.setattr(detect, 'load_answer', lambda pdir, edit, registered=True, bg=None:
                        np.full((y1 - y0, x1 - x0, 3), (200, 30, 30), np.uint8))
    Fake(monkeypatch, clai=ProviderErrorRaiser())
    return eid, e['box']


def test_patch_pastes_an_edit_under_the_mask_only(env, monkeypatch):
    eid, (x0, y0, x1, y1) = _patch_project(monkeypatch)
    before = np.asarray(Image.open(store.pdir('p') / 'bg.png').convert('RGB')).copy()
    roi = [x0 + 5, y0 + 5, x0 + 45, y0 + 45]                     # away from the kept letter at 330..370
    rec = bgx.patch_background('p', eid, rois=[roi])
    assert rec['paid'] is False and rec['patch_of'] == eid and rec['replaced_px'] > 1600
    after = np.asarray(Image.open(store.pdir('p') / 'bg.png').convert('RGB'))
    alpha = np.asarray(Image.open(store.pdir('p') / f"bgx/{rec['id']}/mask.png"))
    assert (after[alpha == 0] == before[alpha == 0]).all()               # bit-identical outside the mask
    assert (after[y0 + 10:y0 + 40, x0 + 10:x0 + 40] == (200, 30, 30)).all()
    assert not alpha[:y0].any() and not alpha[:, :x0].any()             # clipped to the edit box
    bgm = store.read('p')['background']
    assert bgm['version'] == 2 and bgm['versions'][-1]['source'] == 'patch'


def test_patch_refuses_or_protects_kept_letters(env, monkeypatch):
    eid, box = _patch_project(monkeypatch)
    with pytest.raises(store.StoreError) as e:
        bgx.patch_background('p', eid, rois=[[320, 420, 380, 480]])
    assert e.value.status == 409 and 'L01_A (#1)' in str(e.value)
    before = np.asarray(Image.open(store.pdir('p') / 'bg.png').convert('RGB')).copy()
    rec = bgx.patch_background('p', eid, rois=[[300, 400, 400, 500]], kept='protect')
    after = np.asarray(Image.open(store.pdir('p') / 'bg.png').convert('RGB'))
    assert (after[430:470, 330:370] == before[430:470, 330:370]).all() and rec['protected'][0]['id'] == 1
    with pytest.raises(store.StoreError) as e:
        bgx.patch_background('p', eid, rois=[[box[2] - 5, box[3] - 5, box[2] + 20, box[3] + 20]])
    assert e.value.status == 409 and 'outside edit' in str(e.value)


def test_patch_endpoint_with_a_mask_png(env, monkeypatch, tmp_path):
    from plc_client import patch_background  # noqa: F401  (client function exists)
    eid, (x0, y0, x1, y1) = _patch_project(monkeypatch)
    m = np.zeros((y1 - y0, x1 - x0), np.uint8)
    m[5:40, 5:40] = 255
    Image.fromarray(m).save(tmp_path / 'm.png')
    with TestClient(server.app) as c:
        r = c.post('/projects/p/background/patch', json={'edit': eid, 'mask': str(tmp_path / 'm.png')})
        assert r.status_code == 200, r.text
        assert r.json()['version'] == 2
        r = c.post('/projects/p/background/patch', json={'edit': eid})
        assert r.status_code == 400
