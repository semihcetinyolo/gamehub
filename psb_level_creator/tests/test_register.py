"""plc/register.py on GPT-like answers (shifted, scaled, a little rotated) and Nano-like ones (in place)."""
import json

import cv2
import numpy as np
import pytest

from _synth import box_contains, centre, crop, draw_letter, engrave, make_project, redraw, texture
from plc import detect as D
from plc import register as R

BOX, RECT = [128, 256, 640, 768], [176, 304, 592, 720]


def astra_like(bg, box, scale=1.02, shift=(9, -6), rot=0.3):
    """The square drawn again from the scene around it, shifted / scaled / rotated (no wrapped or mirrored border)."""
    x0, y0, x1, y1 = box
    s = x1 - x0
    M = cv2.getRotationMatrix2D((x0 + s / 2, y0 + s / 2), rot, scale)
    M[:, 2] += (shift[1], shift[0])
    M[:, 2] -= (x0, y0)
    a = cv2.warpAffine(bg, M, (s, s), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    return redraw(a, shift=(0, 0), gain=0.96, off=5, noise=3)


@pytest.mark.parametrize('args', [dict(), dict(scale=0.97, shift=(-12, 4), rot=-0.5), dict(scale=1.03, shift=(14, 10), rot=0.4)])
def test_register_lays_a_moved_answer_back(args):
    bg = texture()
    a = astra_like(bg, BOX, **args)
    draw_letter(a, 'K', (150, 150))
    b = crop(bg, BOX)
    out, info = R.register(a, b)
    assert info['applied'] and info['ok']
    err = lambda x: np.abs(x.astype(int) - b.astype(int)).max(2)[30:-30, 30:-30].mean()
    assert err(out) < 0.5 * err(a)
    assert err(out) < 7


def test_answer_in_place_is_not_warped():
    bg = texture()
    a = redraw(crop(bg, BOX), shift=(0, 0), bg=bg, box=BOX)
    out, info = R.register(a, crop(bg, BOX))
    assert not info['applied'] and out is a


def test_measure_only_keeps_the_answer():
    bg = texture()
    a = astra_like(bg, BOX)
    out, info = R.register(a, crop(bg, BOX), apply_fit=False)
    assert not info['applied'] and out is a and info['shift'] > 5


def test_wild_fit_is_rejected():
    bg = texture()
    a = texture(seed=99)[:512, :512]  # a different picture
    out, info = R.register(a, crop(bg, BOX))
    assert out is a and not info['applied']


def test_detect_on_a_moved_answer_finds_the_letters_only(tmp_path):
    bg = texture()
    a = astra_like(bg, BOX, scale=0.97, shift=(-12, 4), rot=-0.5)
    k = draw_letter(a, 'K', (150, 150))
    r = engrave(a, 'R', (300, 280), depth=22)
    proj, _ = make_project(tmp_path, [('e001', BOX, RECT, a)], bg=bg)
    cands = D.detect_edit(tmp_path, proj, proj['edits'][0])
    assert len(cands) == 2, [c['box'] for c in cands]
    info = json.loads((tmp_path / 'edits' / 'e001' / 'register.json').read_text())
    assert info['applied'] and (tmp_path / 'edits' / 'e001' / 'answer_reg.png').is_file()
    # the letters moved with the registration: their boxes hold the warped letter centres
    M = np.asarray(info['M'])
    for m in (k, r):
        cx, cy = centre(m)
        inv = cv2.invertAffineTransform(M.astype(np.float32))
        px, py = inv @ np.array([cx, cy, 1.0])
        assert any(box_contains(c['box'], BOX[0] + px, BOX[1] + py) for c in cands)


def test_registration_on_arrival_is_trusted(tmp_path):
    bg = texture()
    a = astra_like(bg, BOX)
    proj, _ = make_project(tmp_path, [('e001', BOX, RECT, a)], bg=bg)
    ed = tmp_path / 'edits' / 'e001'
    (ed / 'result.json').write_text(json.dumps({'registration': {'applied': False, 'by': 'plc.register'}}))
    got = D.load_answer(tmp_path, proj['edits'][0])
    assert np.array_equal(got, a) and not (ed / 'register.json').exists()
