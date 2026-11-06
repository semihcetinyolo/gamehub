import json
import types

from PIL import Image

import pytest
from fastapi.testclient import TestClient

from _api_helpers import env, Fake, bg_png  # noqa: F401
from plc import blindread as br, edits, providers, server, store
from plc.providers import ProviderError

LETTERS = 'ABC'


def _setup(monkeypatch, name='p'):
    Fake(monkeypatch)
    store.create(name)
    edits.set_background(name, bg_png(), 'upload')
    [eid] = edits.add_edits(name, [{'x0': 400, 'y0': 800, 'x1': 1000, 'y1': 1400, 'description': 'letters'}],
                            auto_detect=False)
    assert edits.run_edit(name, eid) == 'done'

    def add(p):
        p['candidates'] = [{'id': i + 1, 'edit': eid, 'box': [450 + 150 * i, 900, 530 + 150 * i, 1000], 'area': 900,
                            'flags': [], 'state': 'kept', 'label': f'L{i + 1:02d}_{ch}', 'group': 'Letters'}
                           for i, ch in enumerate(LETTERS)]
        p['candidates'].append({'id': 9, 'edit': eid, 'box': [800, 1200, 860, 1260], 'area': 500, 'flags': [],
                                'state': 'dropped', 'label': None, 'group': None})
    store.update(name, add)
    import numpy as np
    from plc import detect
    for c in store.read(name)['candidates']:
        x0, y0, x1, y1 = c['box']
        m = np.zeros((y1 - y0, x1 - x0), bool)
        m[10:-10, 10:-10] = True
        detect.save_mask(store.pdir(name), c['id'], m)
    return eid


def _reader(answers_by_tile, log=None):
    """ask() that answers tile k with answers_by_tile(k, n) and logs the prompts."""
    def ask(images, prompt):
        n = int(prompt.split('grid of ')[1].split()[0])
        if log is not None:
            log.append((images, prompt))
        return json.dumps({'tiles': [{'tile': k, 'read': answers_by_tile(k, n), 'effort': 1 + k % 3}
                                     for k in range(1, n + 1)]})
    return ask


def test_blind_read_maps_tiles_back_to_candidates(env, monkeypatch):
    _setup(monkeypatch)
    log = []
    # the "model" reads tile k as the k-th letter of the alphabet
    rec = br.run('p', mode='scene', ask=_reader(lambda k, n: 'ABCDEFG'[k - 1], log), seeds=[7])
    assert rec['ids'] == [1, 2, 3]                               # only kept candidates by default
    tiles = rec['runs'][0]['tiles']
    for cid, r in rec['results'].items():
        assert r['tile'] == tiles[cid] and r['read'] == 'ABCDEFG'[int(tiles[cid].split(':')[1]) - 1]
        assert r['ok'] == (r['read'] == r['expected'])
    assert rec['summary']['n'] == 3 and rec['summary']['ok'] == sum(r['ok'] for r in rec['results'].values())
    images, prompt = log[0]
    assert images[0][:2] == b'\xff\xd8'
    assert 'L01' not in prompt and 'Letters' not in prompt and 'ABC' not in prompt   # nothing about the answer
    p = store.read('p')
    assert p['blindreads'][0]['id'] == 'r1'
    assert (store.pdir('p') / rec['image']).is_file()
    assert json.loads((store.pdir('p') / 'blindread/r1/request.json').read_text())['seeds'] == [7]
    rec2 = br.run('p', mode='scene', ask=_reader(lambda k, n: 'ABCDEFG'[k - 1]), seeds=[7])
    assert rec2['id'] == 'r2' and rec2['runs'][0]['tiles'] == tiles  # same seed, same order


def test_two_runs_report_agreement(env, monkeypatch):
    _setup(monkeypatch)
    calls = []

    def ask(images, prompt):
        calls.append(1)
        n = int(prompt.split('grid of ')[1].split()[0])
        # run 1 reads every tile as A, run 2 as ?
        r = 'A' if len(calls) == 1 else '?'
        return json.dumps({'tiles': [{'tile': k, 'read': r, 'effort': 2} for k in range(1, n + 1)]})
    rec = br.run('p', mode='scene', ids=[1, 2], runs=2, seeds=[1, 2], ask=ask)
    assert len(calls) == 2
    r1 = rec['results']['1']
    assert r1['reads'] == ['A', '?'] and r1['agree'] is False and r1['ok'] is False   # 2 runs: both must agree
    assert rec['summary']['agreement'] == 0.0


def test_sheets_are_chunked_and_numbered_per_sheet(env, monkeypatch):
    _setup(monkeypatch)
    monkeypatch.setattr(br, 'PER_SHEET', 2)
    log = []
    rec = br.run('p', mode='scene', ask=_reader(lambda k, n: '?', log), seeds=[3])
    assert [int(pr.split('grid of ')[1].split()[0]) for _, pr in log] == [2, 1]
    assert len(rec['runs'][0]['sheets']) == 2 and rec['summary']['unreadable'] == 3


def test_parse_answer_variants():
    assert br.parse_answer('Sure! {"tiles": [{"tile": 1, "read": "d", "effort": "2"}, {"tile": 3, "read": "?"}]}', 3) == {
        1: {'read': 'D', 'effort': 2}, 2: {'read': '?', 'effort': None, 'missing': True},
        3: {'read': '?', 'effort': None}}
    got = br.parse_answer('1: O (1)\n2 - ? - 3\ntile 3: R, 2', 3)
    assert [got[k]['read'] for k in (1, 2, 3)] == ['O', '?', 'R'] and got[1]['effort'] == 1
    assert br.parse_answer('', 2)[2]['read'] == '?'
    assert br.expected_letter('L07_D') == 'D' and br.expected_letter('wreath') is None


def test_model_error_marks_tiles_unreadable(env, monkeypatch):
    _setup(monkeypatch)

    def boom(images, prompt):
        raise ProviderError('vision call HTTP 529: overloaded', 'failed', 529)
    rec = br.run('p', mode='scene', ask=boom, seeds=[1])
    assert rec['summary']['unreadable'] == 3 and 'overloaded' in rec['summary']['errors'][0]


def test_endpoint_and_validation(env, monkeypatch):
    _setup(monkeypatch)
    monkeypatch.setattr(providers, 'claude_vision',
                        lambda images, prompt, **kw: {'text': _reader(lambda k, n: 'B')(images, prompt)})
    server.queue = None
    with TestClient(server.app) as c:
        r = c.post('/projects/p/blindread', json={'ids': [2]})
        assert r.status_code == 200, r.text
        assert r.json()['results']['2']['ok'] is True
        assert c.get('/projects/p/blindread.jpg').content[:2] == b'\xff\xd8'
        assert c.post('/projects/p/blindread', json={'ids': [99]}).status_code == 404
        assert c.post('/projects/p/blindread', json={'runs': 4}).status_code == 400
        store.update('p', lambda p: [x.update(state='new') for x in p['candidates']])
        assert c.post('/projects/p/blindread', json={}).status_code == 409   # nothing kept
    server.queue = None


# ---- the vision call (SDK client mocked) ---------------------------------------------------------------------------

class FakeClient:
    def __init__(self, stop='end_turn'):
        self.kw, self.stop = None, stop
        self.messages = types.SimpleNamespace(create=self.create)

    def create(self, **kw):
        self.kw = kw
        return types.SimpleNamespace(stop_reason=self.stop, model=kw['model'],
                                     content=[types.SimpleNamespace(type='text', text='{"tiles": []}')],
                                     usage=types.SimpleNamespace(input_tokens=10, output_tokens=5))


def test_claude_vision_request_shape():
    fc = FakeClient()
    out = providers.claude_vision([b'\xff\xd8jpeg', b'\x89PNG'], 'read it', client=fc)
    content = fc.kw['messages'][0]['content']
    assert [c['type'] for c in content] == ['image', 'image', 'text']
    assert content[0]['source']['media_type'] == 'image/jpeg' and content[1]['source']['media_type'] == 'image/png'
    assert fc.kw['model'] == 'claude-sonnet-5-5' and fc.kw['extra_body'] == {'output_config': {'effort': 'medium'}}
    assert 'system' not in fc.kw and len(fc.kw['messages']) == 1
    assert out['text'] == '{"tiles": []}'
    with pytest.raises(ProviderError):
        providers.claude_vision([b'\xff\xd8'], 'x', client=FakeClient('refusal'))


def test_glyph_roi_window_and_tile_options(env, monkeypatch):
    _setup(monkeypatch)
    seen = {}
    real = br.crop_tile

    def spy(scene, box, size=br.TILE, window=br.WINDOW, min_window=br.MIN_WINDOW):
        seen[tuple(box)] = (size, window)
        return real(scene, box, size, window, min_window)
    monkeypatch.setattr(br, 'crop_tile', spy)
    rec = br.run('p', mode='scene', ask=_reader(lambda k, n: '?'), seeds=[1], window=1.5, tile=400, rois={2: [610, 920, 660, 980]},
                 zoom={3: 1.5})
    assert seen[(610, 920, 660, 980)] == (400, 1.5)          # candidate 2 cropped on its glyph roi
    assert seen[(450, 900, 530, 1000)] == (400, 1.5)          # no mask on disk: the box itself
    assert seen[(750, 900, 830, 1000)] == (400, 1.0)          # zoom 1.5: window / 1.5
    assert rec['rois'] == {'2': [610, 920, 660, 980]} and rec['window'] == 1.5 and rec['tile'] == 400
    from PIL import Image
    assert Image.open(store.pdir('p') / rec['image']).width == 5 * 406 + 6
    store.read('p')['candidates'][1]['box'] == [600, 900, 680, 1000]   # the mask box is untouched
    for bad in ({'window': 9}, {'tile': 100}, {'rois': {2: [0, 0, 2, 2]}}, {'rois': {9: [1, 1, 50, 50]}},
                {'zoom': {1: 9}}, {'zoom': {9: 2}}, {'model': 'gpt-x'}, {'runs': 0}):
        with pytest.raises(store.StoreError):
            br.run('p', mode='scene', ask=_reader(lambda k, n: '?'), **bad)


def test_glyph_box_trims_a_long_stake():
    import numpy as np
    m = np.zeros((360, 120), bool)
    m[20:120, 10:20] = m[20:120, 90:100] = True               # an N-ish letter, 100 px tall ...
    for k in range(80):
        m[30 + k, 20 + k] = m[30 + k, 21 + k] = True
    m[120:360, 52:58] = True                                  # ... on a 240 px stake
    x0, y0, x1, y1 = br.glyph_box(m, [1000, 500, 1120, 860])
    assert y0 == 520 and 620 <= y1 <= 640 and x1 - x0 >= 85  # the stake is gone, the letter kept whole
    assert br.glyph_box(None, [1, 2, 3, 4]) == [1, 2, 3, 4]


def test_controls_make_a_run_invalid_not_the_targets(env, monkeypatch):
    _setup(monkeypatch)
    _setup(monkeypatch, 'ctl')                                   # a second project holds the "approved" controls
    controls = [{'project': 'ctl', 'id': 1, 'expected': 'A'}, {'project': 'ctl', 'id': 2, 'expected': 'B'},
                {'project': 'nope', 'id': 1, 'expected': 'Z'}]
    seen = []

    def ask(images, prompt):
        n = int(prompt.split('grid of ')[1].split()[0])
        seen.append(n)
        return json.dumps({'tiles': [{'tile': k, 'read': 'A', 'effort': 1} for k in range(1, n + 1)]})
    rec = br.run('p', mode='scene', ask=ask, seeds=[5], controls=controls)
    assert seen == [5]                                          # 3 targets + 2 controls on one sheet
    assert rec['controls_skipped'] == ['nope#1']
    assert rec['summary']['valid'] is False and rec['summary']['control_accuracy'] == [0.5]
    assert all(r['ok'] is None for r in rec['results'].values())   # targets not failed by a bad run
    assert rec['results']['1']['read'] == 'A'

    def right(images, prompt):   # reads the controls right: 'A' everywhere is wrong for B, so answer by tile map
        n = int(prompt.split('grid of ')[1].split()[0])
        return json.dumps({'tiles': [{'tile': k, 'read': answer[k], 'effort': 1} for k in range(1, n + 1)]})
    # run once more with the same seed and answer every tile with its true letter (controls A/B, targets A/B/C)
    rec0 = rec
    answer = {}
    for cr in rec0['runs'][0]['controls']:
        answer[cr['tile']] = cr['expected']
    for cid, tl in rec0['runs'][0]['tiles'].items():
        answer[int(tl.split(':')[1])] = 'ABC'[int(cid) - 1]
    rec2 = br.run('p', mode='scene', ask=right, seeds=[5], controls=controls)
    assert rec2['summary']['valid'] is True and rec2['summary']['ok'] == 3 and rec2['summary']['control_accuracy'] == [1.0]


def test_majority_and_models():
    assert br.majority(['A', 'A', '?']) == 'A' and br.majority(['A', 'B']) == '?' and br.majority(['C']) == 'C'
    assert br.model_id(None) == 'claude-opus-5-5' and br.model_id('sonnet') == 'claude-sonnet-5-5'
    assert br.model_id('claude-haiku-5-5') == 'claude-haiku-5-5'


def test_layer_mode_and_both(env, monkeypatch):
    _setup(monkeypatch)
    prompts = []

    def ask(images, prompt):
        prompts.append(prompt)
        n = int(prompt.split('grid of ')[1].split()[0])
        # the scene reads every tile as A; the layer alone reads as ? (a stick, not a letter)
        r = '?' if 'cut-out piece' in prompt else 'A'
        return json.dumps({'tiles': [{'tile': k, 'read': r, 'effort': 1} for k in range(1, n + 1)]})
    rec = br.run('p', ask=ask, seeds=[3], controls=False)
    assert rec['mode'] == 'both' and set(rec['modes']) == {'scene', 'layer'}
    assert len(prompts) == 2 and 'grey background' in prompts[1]
    a = rec['results']['1']
    assert a['scene']['read'] == 'A' and a['scene']['ok'] is True
    assert a['layer']['read'] == '?' and a['layer']['ok'] is False and a['ok'] is False   # both modes must pass
    assert rec['summary']['scene']['ok'] == 1 and rec['summary']['layer']['ok'] == 0
    assert (store.pdir('p') / rec['image_layer']).is_file()
    assert br.layer_passes(store.read('p'), store.pdir('p')) == {}
    rec2 = br.run('p', ask=_reader(lambda k, n: 'ABC'[0]), seeds=[3], controls=False, mode='layer')
    assert rec2['results']['1']['ok'] is True and 'scene' not in rec2['results']['1']
    assert br.layer_passes(store.read('p'), store.pdir('p')) == {1: rec2['id']}


def test_layer_tile_is_the_build_layer_on_grey(env, monkeypatch):
    import numpy as np
    _setup(monkeypatch)
    p = store.read('p')
    t = np.asarray(br.layer_tile(store.pdir('p'), p, p['candidates'][0], {}))
    assert t.shape == (300, 300, 3)
    assert (np.abs(t[:5, :5].astype(int) - br.GREY) < 3).all()          # flat grey around the layer


def test_build_report_warns_without_layer_pass(env, monkeypatch):
    _setup(monkeypatch)
    server.queue = None
    with TestClient(server.app) as c:
        r = c.post('/projects/p/build', json={})
        assert r.status_code == 200, r.text
        rep = json.loads((store.pdir('p') / r.json()['report']).read_text())
        assert rep['layer_read']['missing'] and any('blind-read pass' in w for w in rep['warnings'])
        br.run('p', ask=_reader(lambda k, n: 'A'), seeds=[1], controls=False, mode='layer', ids=[1])
        r = c.post('/projects/p/build', json={})
        rep = json.loads((store.pdir('p') / r.json()['report']).read_text())
        assert rep['layer_read']['passed'] == ['L01_A'] and 'L01_A (#1)' not in rep['layer_read']['missing']
    server.queue = None


def test_glyph_mode_reads_the_build_glyph(env, monkeypatch):
    _setup(monkeypatch)
    from plc import build as B
    calls = []
    real = B.target_glyph

    def spy(ctx, c):
        calls.append(c['id'])
        return real(ctx, c)
    monkeypatch.setattr(B, 'target_glyph', spy)
    rec = br.run('p', ask=_reader(lambda k, n: '?'), seeds=[2], controls=False, mode='flight')
    assert set(rec['modes']) == {'scene', 'glyph'} and sorted(set(calls)) == [1, 2, 3]
    assert (store.pdir('p') / rec['image_glyph']).is_file()
    assert br.layer_passes(store.read('p'), store.pdir('p'), 'glyph') == {}
    rec = br.run('p', ask=_reader(lambda k, n: 'A'), seeds=[2], controls=False, mode='glyph', ids=[1])
    assert br.layer_passes(store.read('p'), store.pdir('p'), 'glyph') == {1: rec['id']}
    with pytest.raises(store.StoreError):
        br.run('p', ask=_reader(lambda k, n: 'A'), mode='nope')


def _glance_ask(W, H, glance_runs=(True,), log=None):
    """A: seen at a glance (only in the runs marked True); B: seen in the quarters; C: only zoomed. Plus a stray Z."""
    boxes = {'A': [450, 900, 530, 1000], 'B': [600, 900, 680, 1000]}
    quads = br.quarters(W, H)
    state = {'glance': 0, 'quarter': 0}

    def pct(box, q):
        x0, y0, x1, y1 = q
        return {'x': ((box[0] + box[2]) / 2 - x0) / (x1 - x0) * 100, 'y': ((box[1] + box[3]) / 2 - y0) / (y1 - y0) * 100}

    def ask(images, prompt):
        if log is not None:
            log.append(prompt)
        if prompt.startswith('This is a picture'):
            i = state['glance']
            state['glance'] += 1
            letters = [{'letter': 'Z', 'x': 90, 'y': 10}]
            if glance_runs[i]:
                letters.append({'letter': 'A', **pct(boxes['A'], [0, 0, W, H])})
            return json.dumps({'letters': letters})
        if prompt.startswith('This is one enlarged part'):
            q = quads[state['quarter'] % 4]
            state['quarter'] += 1
            b = boxes['B']
            inside = q[0] <= b[0] and b[2] <= q[2] and q[1] <= b[1] and b[3] <= q[3]
            return json.dumps({'letters': [{'letter': 'B', **pct(b, q)}] if inside else []})
        n = int(prompt.split('grid of ')[1].split()[0])
        return json.dumps({'tiles': [{'tile': k, 'read': 'C', 'effort': 3} for k in range(1, n + 1)]})
    return ask


def test_glance_measures_achieved_difficulty(env, monkeypatch):
    _setup(monkeypatch)
    W, H = store.read('p')['canvas']['w'], store.read('p')['canvas']['h']
    log = []
    planned = {'L01_A': 'hard', 'L02_B': 'medium', 'L03_C': 'hard'}
    rec = br.run('p', mode='glance', ask=_glance_ask(W, H, log=log), seeds=[3], controls=False,
                 glance={'planned': planned})
    r = rec['results']
    assert [r[k]['achieved'] for k in ('1', '2', '3')] == ['easy', 'medium', 'hard']
    assert r['1']['vs_plan'] == 'easier' and r['2']['match'] is True and r['3']['match'] is True
    sm = rec['summary']
    assert sm['achieved']['easy'] == 1 and sm['achieved']['medium'] == 1 and sm['achieved']['hard'] == 1
    assert sm['planned'] == {'easy': 0, 'medium': 1, 'hard': 2} and sm['planned_from'] == 'request'
    assert sm['easier_than_planned'] == ['L01_A'] and sm['mismatches'] == ['L01_A: planned hard, achieved easy']
    assert [e['letter'] for e in sm['extra_letters']['glance']] == ['Z']
    assert len(log) == 1 + 4 + 1                                  # glance, 4 quarters, one zoomed sheet (C only)
    assert all('L01' not in pr and 'ABC' not in pr for pr in log)
    g = Image.open(store.pdir('p') / rec['glance_image'])
    assert g.width == 390
    assert (store.pdir('p') / rec['image']).is_file()


def test_glance_needs_a_majority_and_reads_the_build_plan(env, monkeypatch):
    _setup(monkeypatch)
    W, H = store.read('p')['canvas']['w'], store.read('p')['canvas']['h']
    store.update('p', lambda p: p.setdefault('builds', []).append(
        {'id': 'b1', 'meta': {'difficulty': {'L01_A': 'easy', 'L02_B': 'easy', 'L03_C': 'medium'}}}))
    rec = br.run('p', mode='glance', runs=2, ask=_glance_ask(W, H, glance_runs=(True, False)), seeds=[1, 2],
                 controls=False)
    r = rec['results']
    assert r['1']['glance_runs'] == 1 and r['1']['achieved'] != 'easy'   # seen once in two runs: not easy
    assert r['3']['achieved'] == 'hard' and r['3']['vs_plan'] == 'harder'
    assert rec['summary']['planned_from'] == 'build b1'
    with TestClient(server.app) as c:
        res = c.post('/projects/p/blindread', json={'mode': 'glance', 'width': 100})
        assert res.status_code == 400 and 'width' in res.text
