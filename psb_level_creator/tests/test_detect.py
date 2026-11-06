"""detect_edit on synthetic BG / answer pairs: known letters, a faint engraved one, a shifted redraw, flags, ids."""
import numpy as np
import pytest
from scipy import ndimage as ndi
from PIL import Image

from _synth import (box_contains, centre, crop, draw_letter, engrave, make_project, redraw, texture)
from plc import detect as D

BOX = [128, 256, 640, 768]
RECT = [176, 304, 592, 720]


def _scene(tmp_path, shift=(2, -2)):
    bg = texture()
    ans = redraw(crop(bg, BOX), shift=shift, bg=bg, box=BOX)
    marks = {
        'A': draw_letter(ans, 'A', (80, 80)),
        'R': engrave(ans, 'R', (300, 90)),          # faint: the surface only 22 levels darker
        'O': draw_letter(ans, 'O', (120, 300), size=90, colour=(200, 60, 40)),
    }
    proj, bg = make_project(tmp_path, [('e001', BOX, RECT, ans)], bg=bg)
    return proj, marks


def _match(cands, marks):
    """letter -> the candidate whose box holds that letter's centre."""
    out = {}
    for ch, m in marks.items():
        cx, cy = centre(m, BOX[0], BOX[1])
        hits = [c for c in cands if box_contains(c['box'], cx, cy)]
        out[ch] = hits
    return out


def test_finds_every_letter_and_nothing_else(tmp_path):
    proj, marks = _scene(tmp_path)
    cands = D.detect_edit(tmp_path, proj, proj['edits'][0])
    hits = _match(cands, marks)
    assert all(len(h) == 1 for h in hits.values()), hits
    assert len(cands) == 3, [c['box'] for c in cands]
    for c in cands:
        assert c['state'] == 'new' and c['edit'] == 'e001' and c['label'] is None
        k = D.load_mask(tmp_path, c)  # mask file matches the box
        assert k.sum() == c['area'] > 0


def test_faint_engraved_letter_is_whole_and_flagged(tmp_path):
    proj, marks = _scene(tmp_path)
    cands = D.detect_edit(tmp_path, proj, proj['edits'][0])
    r = _match(cands, marks)['R'][0]
    k = D.place(D.load_mask(tmp_path, r), r['box'], BOX)
    got = (k & marks['R']).sum() / marks['R'].sum()
    assert got > 0.8, got
    assert 'faint' in r['flags']
    a = _match(cands, marks)['A'][0]
    assert 'faint' not in a['flags']


def test_mask_covers_the_drawn_letter(tmp_path):
    proj, marks = _scene(tmp_path)
    cands = D.detect_edit(tmp_path, proj, proj['edits'][0])
    for ch in ('A', 'O'):
        c = _match(cands, marks)[ch][0]
        k = D.place(D.load_mask(tmp_path, c), c['box'], BOX)
        assert (k & marks[ch]).sum() / marks[ch].sum() > 0.97
        filled = ndi.binary_fill_holes(marks[ch])  # holes (the inside of an O) belong to the letter's layer
        assert k.sum() < 1.6 * filled.sum()  # not the whole surroundings


@pytest.mark.parametrize('shift', [(0, 0), (2, -2), (3, 1), (-4, 4)])
def test_pure_redraw_gives_nothing(tmp_path, shift):
    bg = texture()
    ans = redraw(crop(bg, BOX), shift=shift, gain=0.97, off=-4, bg=bg, box=BOX)
    proj, _ = make_project(tmp_path, [('e001', BOX, RECT, ans)], bg=bg)
    assert D.detect_edit(tmp_path, proj, proj['edits'][0]) == []


def test_border_strip_is_ignored(tmp_path):
    bg = texture()
    ans = redraw(crop(bg, BOX), shift=(2, -2))  # np.roll: a 2 px strip of wrapped content along two edges
    proj, _ = make_project(tmp_path, [('e001', BOX, RECT, ans)], bg=bg)
    assert D.detect_edit(tmp_path, proj, proj['edits'][0]) == []


def test_drift_far_from_the_rect_is_ignored(tmp_path):
    bg = texture()
    box, rect = [0, 0, 512, 512], [300, 300, 450, 450]
    ans = redraw(crop(bg, box))
    draw_letter(ans, 'B', (60, 60), colour=(20, 120, 40))     # far outside rect + margin: drift, ignored
    m = draw_letter(ans, 'C', (330, 320), size=90)
    proj, _ = make_project(tmp_path, [('e001', box, rect, ans)], bg=bg)
    cands = D.detect_edit(tmp_path, proj, proj['edits'][0])
    assert len(cands) == 1
    assert box_contains(cands[0]['box'], *centre(m))


def test_flags_clipped_outside_multi(tmp_path):
    bg = texture()
    box, rect = [128, 128, 640, 640], [200, 200, 560, 560]
    ans = redraw(crop(bg, box), shift=(0, 0))
    draw_letter(ans, 'L', (-20, 230), size=110)               # cut by the box edge (left, not the canvas edge)
    draw_letter(ans, 'T', (230, 20), size=90)                 # mostly above the rect, within the margin
    draw_letter(ans, 'X', (240, 300), size=70, colour=(30, 30, 90))
    draw_letter(ans, 'Y', (285, 300), size=70, colour=(30, 30, 90))  # touches X: one blob of two letters
    proj, _ = make_project(tmp_path, [('e001', box, rect, ans)], bg=bg)
    cands = D.detect_edit(tmp_path, proj, proj['edits'][0])
    by_x = sorted(cands, key=lambda c: c['box'][0])
    assert len(cands) == 3, [(c['box'], c['flags']) for c in cands]
    assert 'clipped' in by_x[0]['flags']
    top = min(cands, key=lambda c: c['box'][1])
    assert 'outside' in top['flags'] and 'clipped' not in top['flags']
    xy = [c for c in cands if c is not by_x[0] and c is not top][0]
    assert 'multi' in xy['flags']


def test_canvas_edge_is_not_clipped(tmp_path):
    bg = texture()
    box, rect = [0, 0, 512, 512], [0, 0, 400, 400]
    ans = redraw(crop(bg, box), shift=(0, 0))
    draw_letter(ans, 'L', (-10, 100), size=110)
    proj, _ = make_project(tmp_path, [('e001', box, rect, ans)], bg=bg)
    (c,) = D.detect_edit(tmp_path, proj, proj['edits'][0])
    assert c['box'][0] == 0 and 'clipped' not in c['flags']


def test_ids_continue_after_the_highest(tmp_path):
    proj, _ = _scene(tmp_path)
    proj['candidates'] = [dict(id=3, edit='x', box=[0, 0, 1, 1]), dict(id=7, edit='x', box=[0, 0, 1, 1])]
    cands = D.detect_edit(tmp_path, proj, proj['edits'][0])
    assert [c['id'] for c in cands] == [8, 9, 10]
    assert all((tmp_path / 'cand' / f'{i}.png').is_file() for i in (8, 9, 10))


def test_params_are_overridable(tmp_path):
    proj, _ = _scene(tmp_path)
    big = D.detect_edit(tmp_path, proj, proj['edits'][0], params_over={'min_area': 3500})
    assert len(big) < 3
    with pytest.raises(ValueError):
        D.detect_edit(tmp_path, proj, proj['edits'][0], params_over={'nope': 1})


def test_answer_of_another_size_is_resized(tmp_path):
    proj, _ = _scene(tmp_path)
    f = tmp_path / 'edits' / 'e001' / 'answer.png'
    Image.open(f).resize((1024, 1024)).save(f)
    assert D.load_answer(tmp_path, proj['edits'][0]).shape == (512, 512, 3)


def test_missing_answer_is_a_value_error(tmp_path):
    proj, _ = _scene(tmp_path)
    (tmp_path / 'edits' / 'e001' / 'answer.png').unlink()
    with pytest.raises(ValueError):
        D.detect_edit(tmp_path, proj, proj['edits'][0])


def test_tone_fit_recovers_gain():
    bg = texture()[:300, :300]
    a = np.clip(bg.astype(np.float32) * 1.08 - 6, 0, 255).astype(np.uint8)
    g, o = D.tone_fit(np.roll(a, (2, 2), (0, 1)), bg)
    assert np.allclose(g, 1 / 1.08, atol=0.03)
