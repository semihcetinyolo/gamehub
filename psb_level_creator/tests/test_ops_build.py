"""apply_ops, render_sheet / render_overview, find_free and build on a synthetic project (no network)."""
import copy
import json

import numpy as np
import pytest
from scipy import ndimage as ndi
from PIL import Image
from psd_tools import PSDImage

from _synth import box_contains, centre, crop, draw_letter, engrave, make_project, redraw, texture
from plc import build as B
from plc import candidates as C
from plc import detect as D
from plc import freespots as F
from plc import sheet as S

BOX1, RECT1 = [64, 64, 576, 576], [112, 112, 528, 528]
BOX2, RECT2 = [192, 448, 704, 960], [240, 496, 656, 912]


@pytest.fixture
def proj(tmp_path):
    """Two edits: e001 draws A, B and a touching X+Y pair; e002 draws C, D and a faint engraved F."""
    bg = texture()
    a1 = redraw(crop(bg, BOX1), bg=bg, box=BOX1)
    m = {}
    m['A'] = draw_letter(a1, 'A', (80, 80))
    m['B'] = draw_letter(a1, 'B', (300, 90), size=100, colour=(20, 90, 140))
    m['X'] = draw_letter(a1, 'X', (120, 300), size=80, colour=(30, 30, 90))
    m['Y'] = draw_letter(a1, 'Y', (172, 300), size=80, colour=(30, 30, 90))
    a2 = redraw(crop(bg, BOX2), shift=(-2, 3), bg=bg, box=BOX2, seed=9)
    m['C'] = draw_letter(a2, 'C', (90, 120), size=100, colour=(160, 30, 30))
    m['D'] = draw_letter(a2, 'D', (300, 300), size=100, colour=(60, 30, 10))
    m['F'] = engrave(a2, 'F', (120, 330), size=70, depth=12)    # faint: found through the texture-relative diff
    p, _ = make_project(tmp_path, [('e001', BOX1, RECT1, a1), ('e002', BOX2, RECT2, a2)], bg=bg)
    for e in p['edits']:
        p['candidates'] += D.detect_edit(tmp_path, p, e)
        e['detected'] = True
    p['_marks'] = m
    return p


def cid(p, ch):
    """Id of the candidate that holds letter ch's centre."""
    m = p['_marks'][ch]
    box = BOX1 if ch in 'ABXY' else BOX2
    cx, cy = centre(m, box[0], box[1])
    hits = [c for c in p['candidates'] if box_contains(c['box'], cx, cy) and c.get('state') != 'dropped']
    assert len(hits) == 1, (ch, hits)
    return hits[0]['id']


def by_id(p, i):
    return next(c for c in p['candidates'] if c['id'] == i)


def test_fixture_detects_six_blobs(proj):
    assert len(proj['candidates']) == 6
    assert 'faint' in by_id(proj, cid(proj, 'F'))['flags']
    assert cid(proj, 'X') == cid(proj, 'Y')
    assert 'multi' in by_id(proj, cid(proj, 'X'))['flags']


def test_label_drop_restore_and_purity(proj, tmp_path):
    before = copy.deepcopy(proj)
    a, b = cid(proj, 'A'), cid(proj, 'B')
    out = C.apply_ops(tmp_path, proj, [dict(op='label', id=a, label='L00_A'), dict(op='drop', id=b)])
    assert proj['candidates'] == before['candidates']  # pure on the dict
    assert by_id(out, a)['state'] == 'kept' and by_id(out, a)['group'] == 'Letters'
    assert by_id(out, b)['state'] == 'dropped'
    out = C.apply_ops(tmp_path, out, [dict(op='restore', id=b), dict(op='drop', id=a), dict(op='restore', id=a)])
    assert by_id(out, b)['state'] == 'new' and by_id(out, a)['state'] == 'kept'
    out = C.apply_ops(tmp_path, out, [dict(op='label', id=b, label='W1', group='Words')])
    assert by_id(out, b)['group'] == 'Words'


def test_split_parts_separates_two_letters(proj, tmp_path):
    xy = cid(proj, 'X')
    out = C.apply_ops(tmp_path, proj, [dict(op='split', id=xy, parts=2)])
    orig = by_id(out, xy)
    assert orig['state'] == 'dropped' and len(orig['replaced_by']) == 2
    parts = [by_id(out, i) for i in orig['replaced_by']]
    assert all(p['parent'] == xy and p['state'] == 'new' for p in parts)
    assert parts[0]['id'] == max(c['id'] for c in proj['candidates']) + 1
    left, right = sorted(parts, key=lambda p: p['box'][0])
    for part, ch in ((left, 'X'), (right, 'Y')):
        k = D.place(D.load_mask(tmp_path, part), part['box'], BOX1)
        mine = (k & proj['_marks'][ch]).sum() / proj['_marks'][ch].sum()
        assert mine > 0.85, (ch, mine)
    assert 'multi' not in left['flags'] and 'multi' not in right['flags']


def test_split_axis_and_merge_back(proj, tmp_path):
    xy = by_id(proj, cid(proj, 'X'))
    cut = (centre(proj['_marks']['X'], *BOX1[:2])[0] + centre(proj['_marks']['Y'], *BOX1[:2])[0]) / 2
    out = C.apply_ops(tmp_path, proj, [dict(op='split', id=xy['id'], axis='x', at=cut)])
    l, r = by_id(out, xy['id'])['replaced_by']
    assert by_id(out, l)['box'][2] <= cut + 1 and by_id(out, r)['box'][0] >= cut - 1
    out = C.apply_ops(tmp_path, out, [dict(op='label', id=l, label='L05_X'), dict(op='merge', ids=[l, r])])
    merged = out['candidates'][-1]
    assert merged['parents'] == [l, r] and merged['box'] == xy['box']
    assert merged['label'] == 'L05_X' and merged['state'] == 'kept'
    assert by_id(out, l)['state'] == by_id(out, r)['state'] == 'dropped'


def test_add_finds_a_missed_faint_letter_and_crop(proj, tmp_path):
    m = proj['_marks']['F']
    ys, xs = np.nonzero(m)
    box = [BOX2[0] + xs.min() - 15, BOX2[1] + ys.min() - 15, BOX2[0] + xs.max() + 15, BOX2[1] + ys.max() + 15]
    out = C.apply_ops(tmp_path, proj, [dict(op='add', edit='e002', box=box, thr=5)])
    c = out['candidates'][-1]
    assert c['edit'] == 'e002' and c['added']
    k = D.place(D.load_mask(tmp_path, c), c['box'], BOX2)
    assert (k & m).sum() / m.sum() > 0.6
    half = [c['box'][0], c['box'][1], c['box'][2], (c['box'][1] + c['box'][3]) // 2]
    out = C.apply_ops(tmp_path, out, [dict(op='crop', id=c['id'], box=half)])
    assert out['candidates'][-1]['box'][3] <= half[3]


@pytest.mark.parametrize('ops,msg', [
    ([dict(op='label', id=999, label='x')], 'not found'),
    ([dict(op='label', id=1)], 'label'),
    ([dict(op='nope', id=1)], 'unknown op'),
    ([dict(id=1)], '"op"'),
    ([dict(op='split', id=1, axis='x', at=-5)], 'outside'),
    ([dict(op='merge', ids=[1])], '2 or more'),
])
def test_bad_ops_raise_value_error(proj, tmp_path, ops, msg):
    with pytest.raises(ValueError, match=msg):
        C.apply_ops(tmp_path, proj, ops)


def test_merge_across_edits_is_refused(proj, tmp_path):
    with pytest.raises(ValueError, match='different edits'):
        C.apply_ops(tmp_path, proj, [dict(op='merge', ids=[cid(proj, 'A'), cid(proj, 'C')])])


def test_sheet_and_overview(proj, tmp_path):
    p = C.apply_ops(tmp_path, proj, [dict(op='label', id=cid(proj, 'A'), label='L00_A'),
                                     dict(op='drop', id=cid(proj, 'B'))])
    f = S.render_sheet(tmp_path, p)
    assert f == tmp_path / 'sheet.jpg'
    w, h = Image.open(f).size
    assert w == S.COLS * (S.CELL + S.SIDE) and h == 2 * (S.CELL + S.HEAD)  # 6 tiles: 5 + 1
    S.render_sheet(tmp_path, p, state='kept')
    assert Image.open(f).size == (S.CELL + S.SIDE, S.CELL + S.HEAD)
    S.render_sheet(tmp_path, p, edit='e002')
    assert Image.open(f).size[0] == 3 * (S.CELL + S.SIDE)
    S.render_sheet(tmp_path, p, ids=[123])
    assert Image.open(f).size == (600, 80)
    o = S.render_overview(tmp_path, p)
    assert o == tmp_path / 'overview.jpg' and Image.open(o).size == (768, 1024)


def test_find_free_avoids_candidates_and_pending_rects(proj, tmp_path):
    p = copy.deepcopy(proj)
    p['edits'].append(dict(id='e003', rect=[400, 20, 760, 300], box=[0, 0, 512, 512], status='queued'))
    rects = F.find_free(tmp_path, p, n=3, w=200, h=150, pad=30)
    assert len(rects) == 3 and (tmp_path / 'freespots.jpg').is_file()
    occupied = [c['box'] for c in p['candidates']] + [p['edits'][-1]['rect']]

    def inter(a, b, g=0):
        return a[0] < b[2] + g and b[0] < a[2] + g and a[1] < b[3] + g and b[1] < a[3] + g

    for r in rects:
        assert r[2] - r[0] == 200 and r[3] - r[1] == 150
        assert 0 <= r[0] and r[2] <= 768 and 0 <= r[1] and r[3] <= 1024
        assert not any(inter(r, o, 30) for o in occupied[:-1]) and not inter(r, occupied[-1])
    assert not any(inter(a, b) for i, a in enumerate(rects) for b in rects[i + 1:])
    # a dropped candidate frees its spot
    huge = F.find_free(tmp_path, p, n=1, w=768, h=1024, pad=0, min_side=700)
    assert huge == []


def _label_all(proj, tmp_path):
    xy = cid(proj, 'X')
    p = C.apply_ops(tmp_path, proj, [dict(op='split', id=xy, parts=2)])
    l, r = sorted(by_id(p, xy)['replaced_by'], key=lambda i: by_id(p, i)['box'][0])
    names = [('A', cid(p, 'A')), ('B', cid(p, 'B')), ('X', l), ('Y', r), ('C', cid(p, 'C')), ('D', cid(p, 'D'))]
    ops = [dict(op='label', id=i, label=f'L{n:02d}_{ch}') for n, (ch, i) in enumerate(names)]
    return C.apply_ops(tmp_path, p, ops)


def test_build_writes_psb_level_preview_report(proj, tmp_path):
    p = _label_all(proj, tmp_path)
    labels = [f'L{n:02d}_{ch}' for n, ch in enumerate('ABXYCD')]
    r = B.build(tmp_path, p, expected_labels=labels + ['L06_E'])
    assert r['id'] == 'b1' and r['psb'] == 'out/b1.psb'
    rep = json.loads((tmp_path / r['report']).read_text())
    assert rep['missing'] == ['L06_E'] and not rep['ok']
    assert rep['counts'] == {'Letters': 6} and rep['overlaps'] == [] and rep['psb_check']['ok']
    assert rep['undecided'] == [cid(p, 'F')]

    psd = PSDImage.open(str(tmp_path / r['psb']))
    assert psd._record.header.version == 2 and (psd.width, psd.height) == (768, 1024)
    top = list(psd)
    assert top[0].name == 'BG' and not top[0].is_group()
    assert [g.name for g in top[1:]] == ['Letters']
    panel = [l.name for l in reversed(list(top[1]))]
    assert [n for n in panel if not n.endswith('_glyph')] == labels  # panel order: first label on top
    assert panel == [n for lab in labels for n in (lab + '_glyph', lab)]  # each glyph right above its patch, hidden
    assert not any(l.visible for l in top[1] if l.name.endswith('_glyph'))

    level = json.loads((tmp_path / r['level_json']).read_text())
    assert level['canvas'] == {'w': 768, 'h': 1024}
    assert [t['label'] for t in level['targets']] == labels
    assert level['groups'] == [{'name': 'Letters', 'labels': labels}]
    for t in level['targets']:
        im = Image.open(tmp_path / 'out' / t['file'])
        assert im.mode == 'RGBA' and list(im.size) == [t['bbox'][2] - t['bbox'][0], t['bbox'][3] - t['bbox'][1]]
    assert sorted(t['z'] for t in level['targets']) == list(range(1, 7))

    # the preview shows each letter as drawn and the clean BG away from the letters
    pv = np.asarray(Image.open(tmp_path / r['preview'])).astype(int)
    bg = np.asarray(Image.open(tmp_path / 'bg.png')).astype(int)
    for ch in 'ABCD':
        box = BOX1 if ch in 'AB' else BOX2
        m = proj['_marks'][ch]
        ys, xs = np.nonzero(m)
        drawn = pv[box[1] + ys, box[0] + xs]
        assert np.abs(drawn - bg[box[1] + ys, box[0] + xs]).max(1).mean() > 50  # the letter is there
    far = np.ones(bg.shape[:2], bool)
    for t in level['targets']:
        x0, y0, x1, y1 = t['bbox']
        far[y0:y1, x0:x1] = False
    assert np.abs(pv - bg).max(2)[far].mean() < 3  # JPEG noise only


def test_layer_alpha_is_soft_and_opaque_on_the_letter(proj, tmp_path):
    p = _label_all(proj, tmp_path)
    ctx = B.Ctx(tmp_path, p)
    kept = [c for c in p['candidates'] if c['state'] == 'kept']
    ctx.set_owners(kept)
    c = by_id(p, cid(p, 'A'))
    rgba, left, top = B.target_layer(ctx, c)
    a = rgba[..., 3]
    k = D.place(D.load_mask(tmp_path, c), c['box'], [left, top, left + a.shape[1], top + a.shape[0]])
    assert (a[k] == 255).all()
    assert a[0].max() < 40 and a[-1].max() < 40 and a[:, 0].max() < 40 and a[:, -1].max() < 40  # fades out
    mid = (a > 20) & (a < 235)
    assert mid.sum() > 0.3 * k.sum() ** 0.5 * 4  # a real soft ring, not a hard cut


def test_touching_targets_split_hard_inside_one_edit(proj, tmp_path):
    """X and Y came from one edit and touch: each pixel goes to one layer, the two layers together stay opaque
    between them (no BG seam)."""
    p = _label_all(proj, tmp_path)
    ctx = B.Ctx(tmp_path, p)
    kept = sorted([c for c in p['candidates'] if c['state'] == 'kept'], key=lambda c: c['label'])
    ctx.set_owners(kept)
    x, y = [c for c in kept if c['label'] in ('L02_X', 'L03_Y')]
    W, H = 768, 1024
    acc = np.zeros((H, W), np.float32)
    for c in (x, y):
        rgba, l, t = B.target_layer(ctx, c)
        a = rgba[..., 3].astype(np.float32) / 255
        acc[t:t + a.shape[0], l:l + a.shape[1]] += a
    kx = D.place(D.load_mask(tmp_path, x), x['box'], [0, 0, W, H])
    ky = D.place(D.load_mask(tmp_path, y), y['box'], [0, 0, W, H])
    assert acc[kx | ky].min() >= 0.999 and acc.max() <= 1.001


def test_overlap_and_duplicate_are_errors(proj, tmp_path):
    xy = cid(proj, 'X')
    p = C.apply_ops(tmp_path, proj, [dict(op='split', id=xy, parts=2)])
    l, r = by_id(p, xy)['replaced_by']
    # keep the original pair blob too: it overlaps both parts
    p = C.apply_ops(tmp_path, p, [dict(op='label', id=l, label='L00_X'), dict(op='label', id=r, label='L01_Y'),
                                  dict(op='label', id=xy, label='L01_Y')])
    r_ = B.build(tmp_path, p)
    rep = json.loads((tmp_path / r_['report']).read_text())
    assert not rep['ok']
    assert {tuple(sorted((o['a'], o['b']))) for o in rep['overlaps']} >= {tuple(sorted((xy, l))), tuple(sorted((xy, r)))}
    assert 'L01_Y' in rep['duplicates']
    assert (tmp_path / r_['psb']).is_file()  # products are still written so the caller can look


def test_build_ids_follow_the_builds_list(proj, tmp_path):
    p = _label_all(proj, tmp_path)
    p['builds'] = [dict(id='b1'), dict(id='b2')]
    assert B.build(tmp_path, p)['id'] == 'b3'


def test_layer_rim_shows_the_bg_where_only_redrawn(proj, tmp_path):
    """Paste only what changed: outside the letter the layer's pixels are the BG's own wherever the answer only
    re-rendered the scene (the fixture's answers are shifted 2-3 px with noise), so the soft rim adds no texture seam."""
    p = _label_all(proj, tmp_path)
    ctx = B.Ctx(tmp_path, p)
    kept = [c for c in p['candidates'] if c['state'] == 'kept']
    ctx.set_owners(kept)
    for ch in 'AC':
        c = by_id(p, cid(p, ch))
        rgba, left, top = B.target_layer(ctx, c)
        h, w = rgba.shape[:2]
        win = [left, top, left + w, top + h]
        k = D.place(D.load_mask(tmp_path, c), c['box'], win)
        rim = (rgba[..., 3] > 0) & ~ndi.binary_dilation(k, iterations=6)
        bg = np.asarray(Image.open(tmp_path / 'bg.png'))[top:top + h, left:left + w].astype(int)
        diff = np.abs(rgba[..., :3].astype(int) - bg).max(2)
        assert rim.sum() > 100
        assert np.median(diff[rim]) <= 2, np.median(diff[rim])
