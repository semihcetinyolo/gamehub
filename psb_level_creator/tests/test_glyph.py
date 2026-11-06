"""Glyph masks (plc/glyph.py), the glyph product of a build, BG versions (an extend after the edit) and the
cut_unchanged op, on synthetic scenes (no network)."""
import json

import numpy as np
import pytest
from PIL import Image
from psd_tools import PSDImage
from scipy import ndimage as ndi

from _synth import crop, draw_letter, make_project, redraw, texture
from plc import build as B
from plc import candidates as C
from plc import detect as D
from plc import glyph as G

WIN = (0, 0, 320, 320)


def scene(seed=3):
    bg = texture(320, 320, seed=seed)
    ans = redraw(bg.copy(), shift=(2, -1), bg=np.pad(bg, ((40, 40), (40, 40), (0, 0)), mode='reflect'),
                 box=(40, 40, 360, 360), seed=seed)
    return bg, ans


def generous(*masks, grow=14):
    m = np.zeros_like(masks[0])
    for k in masks:
        m |= k
    return ndi.binary_dilation(m, iterations=grow)  # like a detect mask: the letter plus a halo of scene


def test_glyph_is_the_letter_without_shadow_or_scene():
    bg, ans = scene()
    tmp = ans.copy()
    letter = draw_letter(tmp, 'K', (90, 70), size=150, colour=(40, 70, 150))
    import cv2
    cast = cv2.GaussianBlur(np.roll(ndi.binary_dilation(letter, iterations=4), (12, 14), axis=(0, 1)).astype(np.float32),
                            (0, 0), 3)
    f = 1 - 0.45 * cast  # a soft cast shadow: the BG darkened, same hue
    shadow = (f < 0.8) & ~letter
    a = ans.astype(np.float32) * f[..., None]
    a[letter] = (40, 70, 150)
    a = np.clip(a, 0, 255).astype(np.uint8)
    M = generous(letter, shadow)
    g, info = G.glyph_mask(a, bg, M)
    assert info['mode'] == 'colour' and info['pieces'] == 1
    assert (g & letter).sum() >= 0.93 * letter.sum()
    far_shadow = shadow & ~ndi.binary_dilation(letter, iterations=3)
    assert (g & far_shadow).sum() <= 0.1 * far_shadow.sum()
    halo = M & ~ndi.binary_dilation(letter, iterations=3) & ~shadow
    assert (g & halo).sum() <= 0.03 * halo.sum()


def test_counter_stays_open_and_thin_protrusion_stays():
    bg, ans = scene(5)
    o = draw_letter(ans, 'O', (60, 50), size=170, colour=(150, 40, 30), stroke=2)
    stem = np.zeros_like(o)
    ys, xs = np.nonzero(o)
    y0 = ys.max() - 2
    cx = int(xs.mean())
    stem[y0:y0 + 45, cx - 1:cx + 2] = True  # a 3 px wire hanging from the O
    ans[stem] = (150, 40, 30)
    g, _ = G.glyph_mask(ans, bg, generous(o, stem))
    counter = ndi.binary_erosion(ndi.binary_fill_holes(o) & ~o, iterations=3)
    assert counter.sum() > 1000
    assert (g & counter).sum() <= 0.02 * counter.sum()
    assert (g & o).sum() >= 0.93 * o.sum()
    assert (g & stem).sum() >= 0.8 * stem.sum()


def test_body_painted_like_the_scene_is_filled():
    """A part of the object whose colour matches the scene behind (wood on wood) is still the object: the edit
    painted it (its diff stands above the redraw noise), so the hole it leaves in the colour model is filled."""
    bg, ans = scene(7)
    obj = np.zeros(bg.shape[:2], bool)
    obj[80:240, 80:240] = True
    ans[obj] = (40, 90, 60)
    inner = np.zeros_like(obj)
    inner[130:190, 130:190] = True
    rng = np.random.default_rng(1)
    ans[inner] = np.clip(bg[inner].astype(int) + 28 + rng.normal(0, 3, (inner.sum(), 3)), 0, 255).astype(np.uint8)
    g, _ = G.glyph_mask(ans, bg, generous(obj))
    assert (g & inner).sum() >= 0.95 * inner.sum()


def test_alpha_has_a_short_antialiased_edge():
    g = np.zeros((80, 80), bool)
    g[20:60, 25:55] = True
    a = G.glyph_alpha(g)
    assert (a[ndi.binary_erosion(g)] == 1).all()
    assert (a[~ndi.binary_dilation(g, iterations=2)] == 0).all()
    soft = (a > 0) & (a < 1)
    assert soft.any() and not (soft & ndi.binary_erosion(g, iterations=2)).any()


def test_decontaminate_takes_inner_colours():
    rgb = np.zeros((40, 40, 3), np.uint8)
    rgb[:] = (250, 250, 250)      # the scene (light)
    g = np.zeros((40, 40), bool)
    g[10:30, 10:30] = True
    rgb[11:29, 11:29] = (20, 30, 40)  # the object; its outer mask pixel still has scene colour
    out = G.decontaminate(rgb, g)
    assert (out[g] == (20, 30, 40)).all()
    assert (out[0, 0] == 250).all()


# --- build: glyph product, BG versions, cut_unchanged ---------------------------------------------------------

BOX, RECT = [0, 0, 512, 512], [40, 40, 472, 472]
PAPER = 60  # px of white paper border on the left of BG v1


def versioned(tmp_path, extend=True):
    """BG v1 with a white paper border on the left; v2 (current bg.png) has the scene full-bleed. One edit made on v1
    (no bg_version stamp) draws two letters, one next to the border; its answer keeps the paper."""
    v2 = texture(768, 1024, seed=4)
    v1 = v2.copy()
    v1[:, :PAPER] = (246, 244, 238)
    ans = redraw(crop(v1, BOX), bg=v1, box=BOX, shift=(0, 0), gain=1.0, off=0, noise=2)
    ans[:, :PAPER] = (246, 244, 238)
    m = dict(H=draw_letter(ans, 'H', (70, 100), size=145, colour=(30, 60, 140)),
             K=draw_letter(ans, 'K', (280, 260), size=145, colour=(140, 40, 30)))
    p, _ = make_project(tmp_path, [('e001', BOX, RECT, ans)], bg=v2 if extend else v1)
    if extend:
        Image.fromarray(v1).save(tmp_path / 'bg_v1.png')
        Image.fromarray(v2).save(tmp_path / 'bg_v2.png')
        p['background'].update(versions=[dict(file='bg_v1.png'), dict(file='bg_v2.png', source='extend')], version=2)
    return p, v1, v2, ans, m


def test_detect_old_edit_diffs_against_its_own_bg(tmp_path):
    p, v1, v2, ans, m = versioned(tmp_path)
    assert D.edit_bg_file(tmp_path, p, p['edits'][0]).name == 'bg_v1.png'
    cands = D.detect_edit(tmp_path, p, p['edits'][0])
    assert len(cands) == 2  # the two letters; the paper margin (changed vs bg.png v2) is no candidate
    for c in cands:
        assert c['box'][0] >= PAPER - 8 or c['box'][2] - c['box'][0] < 200


def _keep_both(tmp_path, p):
    for e in p['edits']:
        p['candidates'] += D.detect_edit(tmp_path, p, e)
    ids = sorted(c['id'] for c in p['candidates'])
    return C.apply_ops(tmp_path, p, [dict(op='label', id=i, label=f'L{n:02d}') for n, i in enumerate(ids)])


def test_layer_of_old_edit_blends_onto_current_bg(tmp_path):
    p, v1, v2, ans, m = versioned(tmp_path)
    p = _keep_both(tmp_path, p)
    ctx = B.Ctx(tmp_path, p)
    kept = [c for c in p['candidates'] if c['state'] == 'kept']
    ctx.set_owners(kept)
    for c in kept:
        rgba, left, top = B.target_layer(ctx, c)
        k = D.place(D.load_mask(tmp_path, c), c['box'], [left, top, left + rgba.shape[1], top + rgba.shape[0]])
        rim = (rgba[..., 3] > 0) & ~ndi.binary_dilation(k, iterations=4)
        cur = v2[top:top + rgba.shape[0], left:left + rgba.shape[1]]
        # where nothing changed the layer is the CURRENT BG (not the old paper, not a re-tone of it)
        assert np.abs(rgba[..., :3][rim].astype(int) - cur[rim]).max(1).mean() < 4
        assert not ((rgba[..., :3][rim] > 240).all(1)).any()  # no white paper in the ring


def test_build_writes_glyphs_and_hidden_psb_layers(tmp_path):
    p, v1, v2, ans, m = versioned(tmp_path)
    p = _keep_both(tmp_path, p)
    r = B.build(tmp_path, p)
    rep = json.loads((tmp_path / r['report']).read_text())
    assert rep['ok'] and rep['psb_check']['ok'], rep
    assert [g['pieces'] for g in rep['glyphs']] == [1, 1]
    level = json.loads((tmp_path / r['level_json']).read_text())
    for t in level['targets']:
        gl = Image.open(tmp_path / 'out' / t['glyph'])
        gx0, gy0, gx1, gy1 = t['glyph_bbox']
        x0, y0, x1, y1 = t['bbox']
        assert gl.mode == 'RGBA' and list(gl.size) == [gx1 - gx0, gy1 - gy0]
        assert x0 <= gx0 and y0 <= gy0 and gx1 <= x1 and gy1 <= y1  # the glyph is tighter than the scene patch
        a = np.asarray(gl)[..., 3]
        letter = m['H'] if gx0 < 250 else m['K']
        lk = letter[gy0:gy1, gx0:gx1]
        assert (a[lk] > 127).mean() > 0.95
        assert (a > 127).sum() < 1.25 * letter.sum()  # no halo of scene
        assert (np.asarray(gl)[..., :3][a > 127] > 240).all(1).mean() < 0.01  # no paper
    psd = PSDImage.open(str(tmp_path / r['psb']))
    names = [(l.name, l.visible) for l in reversed(list(list(psd)[1]))]
    assert names == [('L00_glyph', False), ('L00', True), ('L01_glyph', False), ('L01', True)]


def test_glyph_never_covers_another_targets_core(tmp_path):
    bg = texture()
    a = redraw(crop(bg, BOX), bg=bg, box=BOX)
    draw_letter(a, 'X', (120, 200), size=110, colour=(30, 30, 90))
    draw_letter(a, 'Y', (186, 200), size=110, colour=(30, 30, 90))
    p, _ = make_project(tmp_path, [('e001', BOX, RECT, a)], bg=bg)
    p['candidates'] += D.detect_edit(tmp_path, p, p['edits'][0])
    (xy,) = p['candidates']
    p = C.apply_ops(tmp_path, p, [dict(op='split', id=xy['id'], parts=2)])
    new = [c for c in p['candidates'] if c['state'] == 'new']
    p = C.apply_ops(tmp_path, p, [dict(op='label', id=c['id'], label=f'L{n}') for n, c in enumerate(new)])
    ctx = B.Ctx(tmp_path, p)
    kept = [c for c in p['candidates'] if c['state'] == 'kept']
    ctx.set_owners(kept)
    for c in kept:
        rgba, left, top, _ = B.target_glyph(ctx, c)
        other = next(o for o in kept if o['id'] != c['id'])
        ko = D.place(D.load_mask(tmp_path, other), other['box'], [left, top, left + rgba.shape[1], top + rgba.shape[0]])
        assert not ((rgba[..., 3] > 0) & ko).any()


def test_cut_unchanged_drops_paper_from_the_mask(tmp_path):
    p, v1, v2, ans, m = versioned(tmp_path)
    p = _keep_both(tmp_path, p)
    h = min((c for c in p['candidates']), key=lambda c: c['box'][0])
    # a generous mask that runs onto the paper border (as attic #25 did)
    x0, y0, x1, y1 = h['box']
    k = np.zeros((y1 - y0 + 40, x1 + 20), bool)
    k[:, :] = True
    nb = [0, y0 - 20, x1 + 20, y1 + 20]
    D.save_mask(tmp_path, h['id'], k)
    h.update(box=nb, area=int(k.sum()))
    out = C.apply_ops(tmp_path, p, [dict(op='cut_unchanged', id=h['id'])])
    c = next(c for c in out['candidates'] if c['id'] == h['id'])
    nk = D.place(D.load_mask(tmp_path, c), c['box'], [0, 0, 768, 1024])
    assert c['box'][0] >= PAPER - 4 and c['area'] < h['area'] and c['cut_unchanged']['removed'] > 0
    assert (nk[:, :PAPER - 4]).sum() == 0          # no paper left
    hm = np.zeros((1024, 768), bool)
    hm[:512, :512] = m['H']
    assert (nk & hm).sum() >= 0.97 * hm.sum()  # the letter stays whole
    assert c['state'] == 'kept' and c['label'] == h['label']
    with pytest.raises(ValueError, match='cut_unchanged'):
        C.apply_ops(tmp_path, out, [dict(op='cut_unchanged', id=h['id'], thr=0)])
    with pytest.raises(ValueError, match='no pixel'):
        C.apply_ops(tmp_path, out, [dict(op='cut_unchanged', id=h['id'], thr=254)])


# --- minimum letter size (user rule: 50 px long side) ----------------------------------------------------------

def test_small_letters_are_flagged_and_refused_by_build(tmp_path):
    bg = texture()
    a = redraw(crop(bg, BOX), bg=bg, box=BOX)
    draw_letter(a, 'H', (80, 80), size=160, colour=(30, 60, 140))   # about 118 px tall: fine
    draw_letter(a, 'K', (320, 320), size=44, colour=(140, 40, 30))  # about 32 px: below 50 px
    p, _ = make_project(tmp_path, [('e001', BOX, RECT, a)], bg=bg)
    assert D.min_letter_px(p["canvas"]) == 50
    assert D.min_letter_px(p['canvas'], {'min_letter_frac': 0.05}) == 52  # the optional share-of-height override
    p['candidates'] += D.detect_edit(tmp_path, p, p['edits'][0])
    assert len(p['candidates']) == 2
    big, small = sorted(p['candidates'], key=lambda c: -c['area'])
    assert 'small' in small['flags'] and 'small' not in big['flags']
    p = C.apply_ops(tmp_path, p, [dict(op='label', id=big['id'], label='L00_H'),
                                  dict(op='label', id=small['id'], label='L01_K')])
    rep = json.loads((tmp_path / B.build(tmp_path, p)['report']).read_text())
    assert not rep['ok'] and any('minimum size' in e and 'L01_K' in e for e in rep['errors'])
    assert rep["min_letter_px"] == 50
    sz = {s['label']: s for s in rep['sizes']}
    assert sz['L01_K']['small'] and not sz['L00_H']['small'] and sz['L00_H']['source'] == 'glyph'
    p['builds'] = [{'id': 'b1'}]
    rep = json.loads((tmp_path / B.build(tmp_path, p, allow_small=['L01_K'])['report']).read_text())
    assert rep['ok'], rep['errors']
    assert any('allowed' in w and 'L01_K' in w for w in rep['warnings'])


# --- manual glyph op ---------------------------------------------------------------------------------------------

def test_glyph_op_modes(tmp_path):
    p, v1, v2, ans, m = versioned(tmp_path)
    p = _keep_both(tmp_path, p)
    h = min(p['candidates'], key=lambda c: c['box'][0])
    ctx = lambda q: (B.Ctx(tmp_path, q), [c for c in q['candidates'] if c['state'] == 'kept'])

    def glyph_of(q):
        cx, kept = ctx(q)
        cx.set_owners(kept)
        c = next(c for c in kept if c['id'] == h['id'])
        rgba, left, top, info = B.target_glyph(cx, c)
        full = np.zeros((1024, 768), bool)
        full[top:top + rgba.shape[0], left:left + rgba.shape[1]] = rgba[..., 3] > 127
        return full, info

    auto, _ = glyph_of(p)
    # mask: the candidate mask itself
    q = C.apply_ops(tmp_path, p, [dict(op='glyph', id=h['id'], mode='mask')])
    g, info = glyph_of(q)
    k = D.place(D.load_mask(tmp_path, h), h['box'], [0, 0, 768, 1024])
    assert info['mode'] == 'mask' and info['manual'] == {'mode': 'mask', 'erode': 0}
    assert (g == k).mean() > 0.995
    # auto clipped to a box: only the left half of the letter
    x0, y0, x1, y1 = h['box']
    mid = (x0 + x1) // 2
    q = C.apply_ops(tmp_path, p, [dict(op='glyph', id=h['id'], box=[x0, y0, mid, y1])])
    g, _ = glyph_of(q)
    assert g[:, mid + 2:].sum() == 0 and g[:, :mid].sum() > 0.4 * auto.sum()
    # auto + the eroded mask: never less than auto
    q = C.apply_ops(tmp_path, p, [dict(op='glyph', id=h['id'], fill_from_mask=2)])
    g, info = glyph_of(q)
    assert (g >= auto).all() and info['mode'] == 'colour+mask'
    # file: a hand-made mask placed on the canvas
    hand = np.zeros((60, 40), np.uint8)
    hand[10:50, 5:35] = 255
    Image.fromarray(hand).save(tmp_path / 'hand.png')
    q = C.apply_ops(tmp_path, p, [dict(op='glyph', id=h['id'], mode='file', file='hand.png', at=[x0 + 10, y0 + 10])])
    g, info = glyph_of(q)
    ys, xs = np.nonzero(g)
    assert info['mode'] == 'file' and (xs.min(), ys.min(), xs.max(), ys.max()) == (x0 + 15, y0 + 20, x0 + 44, y0 + 59)
    # reset: back to auto; bad ops raise
    q = C.apply_ops(tmp_path, q, [dict(op='glyph', id=h['id'], mode='reset')])
    assert 'glyph' not in next(c for c in q['candidates'] if c['id'] == h['id'])
    for bad, msg in [(dict(mode='paint'), 'mode'), (dict(params={'nope': 1}), 'unknown glyph params'),
                     (dict(mode='file', file='missing.png'), 'not found'), (dict(box=[5, 5, 1, 1]), 'box')]:
        with pytest.raises(ValueError, match=msg):
            C.apply_ops(tmp_path, p, [dict(op='glyph', id=h['id'], **bad)])


def test_mask_op_sets_scene_mask_and_glyph_from_a_file(tmp_path):
    p, v1, v2, ans, m = versioned(tmp_path)
    p = _keep_both(tmp_path, p)
    h = min(p['candidates'], key=lambda c: c['box'][0])
    hand = (m['H'][60:260, 40:260] * 255).astype(np.uint8)  # a hand selection of the approved letter pixels
    Image.fromarray(hand).save(tmp_path / 'sel.png')
    q = C.apply_ops(tmp_path, p, [dict(op='mask', id=h['id'], file=str(tmp_path / 'sel.png'), at=[40, 60], glyph=True)])
    c = next(c for c in q['candidates'] if c['id'] == h['id'])
    k = D.place(D.load_mask(tmp_path, c), c['box'], [0, 0, 512, 512])
    assert (k == m['H']).all() and c['area'] == int(m['H'].sum()) and c['glyph']['mode'] == 'file'
    cx = B.Ctx(tmp_path, q)
    kept = [x for x in q['candidates'] if x['state'] == 'kept']
    cx.set_owners(kept)
    rgba, left, top, info = B.target_glyph(cx, c)
    g = np.zeros((512, 512), bool)
    g[top:top + rgba.shape[0], left:left + rgba.shape[1]] = rgba[..., 3] > 127
    assert info['mode'] == 'file' and (g == m['H']).mean() > 0.998
    with pytest.raises(ValueError, match='outside'):
        C.apply_ops(tmp_path, p, [dict(op='mask', id=h['id'], file=str(tmp_path / 'sel.png'), at=[700, 60])])


# --- SAM outline (stubbed: no network) --------------------------------------------------------------------------

def test_sam_ask_is_recorded_and_used_by_the_glyph(tmp_path):
    from plc import sam as S
    p, v1, v2, ans, m = versioned(tmp_path)
    p = _keep_both(tmp_path, p)
    h = min(p['candidates'], key=lambda c: c['box'][0])
    full = np.zeros((1024, 768), bool)
    full[:512, :512] = m['H']
    seen = {}

    def fake(png, prompt, box):  # SAM returns the letter's outline in square px
        seen.update(prompt=prompt, box=box)
        sq = np.asarray(Image.open(__import__('io').BytesIO(png)))
        left, top, side, edge = S.frame(h['box'], p['canvas'])
        sub = np.zeros((side, side), bool)
        H, W = full.shape
        sx0, sy0, sx1, sy1 = max(0, left), max(0, top), min(W, left + side), min(H, top + side)
        sub[sy0 - top:sy1 - top, sx0 - left:sx1 - left] = full[sy0:sy1, sx0:sx1]
        plane = np.asarray(Image.fromarray(sub.astype(np.uint8) * 255).resize((edge, edge), Image.NEAREST)) > 127
        assert sq.shape[:2] == (edge, edge)
        return [(plane, 0.95), (~plane, 0.2)], 'req-1'

    p = C.apply_ops(tmp_path, p, [dict(op='label', id=h['id'], label='L00', desc='blue letter H')])
    rec = S.ask(tmp_path, p, h['id'], segment_fn=fake)
    assert seen['prompt'] == 'blue letter H' and rec['status'] == 'done' and rec['score'] == 0.95
    assert json.loads((S.ask_dir(tmp_path, h['id']) / 'ask-1.json').read_text())['request_id'] == 'req-1'
    q = C.apply_ops(tmp_path, p, [dict(op='glyph', id=h['id'], mode='sam', attempt=1)])
    cx = B.Ctx(tmp_path, q)
    kept = [c for c in q['candidates'] if c['state'] == 'kept']
    cx.set_owners(kept)
    c = next(c for c in kept if c['id'] == h['id'])
    rgba, left, top, info = B.target_glyph(cx, c)
    g = np.zeros((1024, 768), bool)
    g[top:top + rgba.shape[0], left:left + rgba.shape[1]] = rgba[..., 3] > 127
    assert info['mode'] == 'sam' and (g & full).sum() >= 0.97 * full.sum() and (g & ~full).sum() < 0.03 * full.sum()

    def lost(png, prompt, box):
        raise S.SamError('SAM (Clai) outcome unknown (TimeoutError); not resent')
    with pytest.raises(S.SamError):
        S.ask(tmp_path, p, h['id'], segment_fn=lost)
    assert S.asks(tmp_path, h['id'])[-1]['status'] == 'submitting'
    with pytest.raises(S.SamError, match='unknown outcome'):  # never resent
        S.ask(tmp_path, p, h['id'], segment_fn=fake)
    with pytest.raises(ValueError, match='not done'):
        C.apply_ops(tmp_path, p, [dict(op='glyph', id=h['id'], mode='sam', attempt=2)])


def test_glyph_only_rebuild_reuses_scene_patches(tmp_path):
    p, v1, v2, ans, m = versioned(tmp_path)
    p = _keep_both(tmp_path, p)
    r1 = B.build(tmp_path, p)
    p['builds'] = [dict(id=r1['id'])]
    # the layer code would cut differently now (stand-in: a wider soft edge); reuse keeps b1's pixels
    r2 = B.build(tmp_path, p, opts=dict(fade=14), reuse_from=r1['id'])
    l1 = json.loads((tmp_path / r1['level_json']).read_text())
    l2 = json.loads((tmp_path / r2['level_json']).read_text())
    for a, b in zip(l1['targets'], l2['targets']):
        assert a['bbox'] == b['bbox'] and b['glyph']
        assert (np.asarray(Image.open(tmp_path / 'out' / a['file'])) == np.asarray(Image.open(tmp_path / 'out' / b['file']))).all()
    rep = json.loads((tmp_path / r2['report']).read_text())
    assert rep['ok'] and rep['reused']['source'] == r1['id'] and len(rep['reused']['ids']) == 2


def test_keep_holes_leaves_the_inside_of_a_ring_bg(tmp_path):
    bg = texture()
    a = redraw(crop(bg, BOX), bg=bg, box=BOX)
    yy, xx = np.mgrid[:512, :512]
    r = np.hypot(yy - 250, xx - 250)
    ring = (r > 60) & (r < 80)
    inside = r < 52
    a[ring] = (150, 110, 40)
    a[inside] = np.clip(a[inside].astype(int) + 40, 0, 255).astype(np.uint8)  # the picture inside was re-rendered
    p, _ = make_project(tmp_path, [('e001', BOX, RECT, a)], bg=bg)
    p['candidates'] += D.detect_edit(tmp_path, p, p['edits'][0])
    big = max(p['candidates'], key=lambda c: c['area'])
    hand = (ring * 255).astype(np.uint8)
    Image.fromarray(hand).save(tmp_path / 'ring.png')
    p = C.apply_ops(tmp_path, p, [dict(op='mask', id=big['id'], file=str(tmp_path / 'ring.png'), at=[0, 0]),
                                  dict(op='label', id=big['id'], label='L00_O')])
    for keep, want_bg in ((False, False), (True, True)):
        q = C.apply_ops(tmp_path, p, [dict(op='layer', id=big['id'], keep_holes=keep)])
        cx = B.Ctx(tmp_path, q)
        kept = [c for c in q['candidates'] if c['state'] == 'kept']
        cx.set_owners(kept)
        rgba, left, top = B.target_layer(cx, next(c for c in kept if c['id'] == big['id']))
        al = np.zeros((1024, 768)); al[top:top + rgba.shape[0], left:left + rgba.shape[1]] = rgba[..., 3] / 255
        core_in = (r < 40)
        full = np.zeros((1024, 768), bool); full[:512, :512] = core_in
        assert (al[full].max() < 0.05) == want_bg
    with pytest.raises(ValueError, match='keep_holes'):
        C.apply_ops(tmp_path, p, [dict(op='layer', id=big['id'])])
