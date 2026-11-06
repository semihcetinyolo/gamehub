"""Evidence images for the calling agent.

render_sheet(pdir, project, ids=None, edit=None, state=None) -> pdir/sheet.jpg
    one numbered tile per candidate: the edited scene around it (small ones enlarged so a letter reads) with the mask
    outline drawn just outside the object; beside it the same spot on the clean BG ("before") and the flags;
    id / label / edit in the header, a colour bar for the state (new amber, kept green, dropped red).
render_overview(pdir, project) -> pdir/overview.jpg
    the whole canvas: BG with every non-dropped candidate pasted, numbered boxes coloured by state, edit rects.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi

from . import detect as D

CELL = 250          # side of the "after" view (px)
SIDE = 100          # column right of it: the "before" thumbnail (clean BG) and the flags
HEAD = 30           # header strip above each tile
COLS = 5
MAX_ZOOM = 4.0
STATE_COLOUR = {'new': (235, 170, 0), 'kept': (0, 170, 60), 'dropped': (220, 40, 40)}
OUTLINE = (255, 0, 255)
FLAG_WORDS = {'big', 'multi', 'clipped', 'outside', 'faint'}
_FONTS = {}


def font(size: int):
    if size not in _FONTS:
        for f in ('/System/Library/Fonts/Helvetica.ttc', '/System/Library/Fonts/SFNS.ttf',
                  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'):
            try:
                _FONTS[size] = ImageFont.truetype(f, size)
                break
            except OSError:
                continue
        else:
            _FONTS[size] = ImageFont.load_default(size)
    return _FONTS[size]


def _select(project, ids=None, edit=None, state=None):
    cs = list(project.get('candidates', []))
    if ids is not None:
        want = {int(i) for i in ids}
        cs = [c for c in cs if int(c['id']) in want]
    if edit is not None:
        cs = [c for c in cs if c['edit'] == edit]
    if state is not None:
        states = {state} if isinstance(state, str) else set(state)
        cs = [c for c in cs if c.get('state', 'new') in states]
    return sorted(cs, key=lambda c: int(c['id']))


def _scene(bg, edit, ans, win):
    """RGB crop `win` of the BG with the edit's answer pasted at its box."""
    x0, y0, x1, y1 = win
    im = bg[y0:y1, x0:x1].copy()
    ex0, ey0, ex1, ey1 = edit['box']
    ix0, iy0, ix1, iy1 = max(x0, ex0), max(y0, ey0), min(x1, ex1), min(y1, ey1)
    if ix0 < ix1 and iy0 < iy1:
        im[iy0 - y0:iy1 - y0, ix0 - x0:ix1 - x0] = ans[iy0 - ey0:iy1 - ey0, ix0 - ex0:ix1 - ex0]
    return im


def _tile(bg, edit, ans, c, k):
    W, H = bg.shape[1], bg.shape[0]
    x0, y0, x1, y1 = c['box']
    side = max(x1 - x0, y1 - y0)
    pad = max(20, int(side * 0.35))
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    half = side / 2 + pad
    win = [int(max(0, cx - half)), int(max(0, cy - half)), int(min(W, cx + half)), int(min(H, cy + half))]
    after = _scene(bg, edit, ans, win)
    before = bg[win[1]:win[3], win[0]:win[2]]
    if 'faint' in (c.get('flags') or []):  # stretch the levels (same for both views) so a faint letter reads
        lo, hi = np.percentile(after, [1, 99])
        if hi - lo > 4:
            st = lambda a: np.clip((a.astype(np.float32) - lo) * (255 / (hi - lo)), 0, 255).astype(np.uint8)
            after, before = st(after), st(before)
    ring = D.place(k, c['box'], win)
    ring = ndi.binary_dilation(ring, iterations=4) & ~ndi.binary_dilation(ring, iterations=2)  # 2 px out: strokes stay visible
    after = after.copy()
    after[ring] = OUTLINE
    im = Image.fromarray(after)
    zoom = min(MAX_ZOOM, (CELL - 4) / max(im.size))
    size = (max(1, int(im.width * zoom)), max(1, int(im.height * zoom)))
    im = im.resize(size, Image.LANCZOS if zoom < 1 else Image.BICUBIC)
    inset = Image.fromarray(before)
    z2 = min(MAX_ZOOM, (SIDE - 6) / max(inset.size))
    inset = inset.resize((max(1, int(inset.width * z2)), max(1, int(inset.height * z2))), Image.LANCZOS)
    return im, inset


def render_sheet(pdir, project: dict, ids=None, edit=None, state=None) -> Path:
    pdir = Path(pdir)
    out = pdir / 'sheet.jpg'
    cs = _select(project, ids, edit, state)
    f1, f2 = font(18), font(14)
    if not cs:
        S = Image.new('RGB', (600, 80), 'white')
        ImageDraw.Draw(S).text((12, 26), 'no candidates match', fill=(0, 0, 0), font=f1)
        S.save(out, quality=88)
        return out
    bg = D.load_bg(pdir)
    edits = {e['id']: e for e in project.get('edits', [])}
    answers = {}
    cols = min(COLS, len(cs))
    rows = (len(cs) + cols - 1) // cols
    TW, TH = CELL + SIDE, CELL + HEAD
    S = Image.new('RGB', (cols * TW, rows * TH), 'white')
    d = ImageDraw.Draw(S)
    for n, c in enumerate(cs):
        X, Y = (n % cols) * TW, (n // cols) * TH
        e = edits.get(c['edit'])
        st = c.get('state', 'new')
        col = STATE_COLOUR.get(st, (0, 0, 0))
        head = f"#{c['id']}" + (f"  {c['label']}" if c.get('label') else '') + f"   {c['edit']}"
        d.rectangle([X, Y, X + TW - 1, Y + HEAD - 1], fill=(245, 245, 245))
        d.rectangle([X, Y, X + 7, Y + HEAD - 1], fill=col)
        d.text((X + 12, Y + 5), head, fill=(0, 0, 0), font=f1)
        lines = ([st.upper()] if st != 'new' else []) + [f for f in (c.get('flags') or []) if f != 'small']
        side = max(c['box'][2] - c['box'][0], c['box'][3] - c['box'][1])
        if side < D.min_letter_px(project['canvas']):  # the live rule: stored flags may come from an older minimum
            lines.append('small')
        if 'faint' in lines:
            lines.append('stretched')
        if c.get('contrast') is not None:
            lines.append(f"diff {c['contrast']:.0f}")
        x0, y0, x1, y1 = c['box']
        lines.append(f'{x1 - x0}x{y1 - y0}')
        try:
            if e is None:
                raise ValueError('edit missing')
            if c['edit'] not in answers:
                answers[c['edit']] = D.load_answer(pdir, e, bg=bg)
            im, inset = _tile(bg, e, answers[c['edit']], c, D.load_mask(pdir, c))
        except (ValueError, OSError) as err:
            d.text((X + 10, Y + HEAD + 20), f'cannot draw: {err}'[:40], fill=(200, 0, 0), font=f2)
            continue
        S.paste(im, (X + (CELL - im.width) // 2, Y + HEAD + (CELL - im.height) // 2))
        S.paste(inset, (X + CELL + 3, Y + HEAD + 3))
        d.text((X + CELL + 4, Y + HEAD + inset.height + 4), 'before', fill=(120, 120, 120), font=f2)
        ty = Y + HEAD + inset.height + 26
        for ln in lines:
            d.text((X + CELL + 4, ty), ln, fill=col if ln == st.upper() else (170, 0, 0) if ln in FLAG_WORDS else (80, 80, 80),
                   font=f2)
            ty += 18
        d.rectangle([X, Y, X + TW - 1, Y + TH - 1], outline=(200, 200, 200))
    S.save(out, quality=88)
    return out


def render_overview(pdir, project: dict, max_side: int = 2048) -> Path:
    pdir = Path(pdir)
    out = pdir / 'overview.jpg'
    bg = D.load_bg(pdir)
    H, W = bg.shape[:2]
    comp = bg.copy()
    edits = {e['id']: e for e in project.get('edits', [])}
    answers = {}
    cs = sorted(project.get('candidates', []), key=lambda c: int(c['id']))
    for c in cs:
        if c.get('state') == 'dropped' or c['edit'] not in edits:
            continue
        try:
            if c['edit'] not in answers:
                answers[c['edit']] = D.load_answer(pdir, edits[c['edit']], bg=bg)
            k = D.load_mask(pdir, c)
        except (ValueError, OSError):
            continue
        ans = answers[c['edit']]
        ex0, ey0 = edits[c['edit']]['box'][:2]
        x0, y0, x1, y1 = c['box']
        m = ndi.binary_dilation(np.pad(k, 3), iterations=3)
        win = [x0 - 3, y0 - 3, x1 + 3, y1 + 3]
        e = edits[c['edit']]['box']
        cl = [max(win[0], e[0]), max(win[1], e[1]), min(win[2], e[2]), min(win[3], e[3])]
        if cl[0] >= cl[2] or cl[1] >= cl[3]:
            continue
        mm = m[cl[1] - win[1]:cl[3] - win[1], cl[0] - win[0]:cl[2] - win[0]]
        sub = comp[cl[1]:cl[3], cl[0]:cl[2]]
        sub[mm] = ans[cl[1] - ey0:cl[3] - ey0, cl[0] - ex0:cl[2] - ex0][mm]
    im = Image.fromarray(comp)
    d = ImageDraw.Draw(im)
    lw = max(2, W // 600)
    fs = max(16, W // 55)
    f = font(fs)
    for e in project.get('edits', []):
        r = e.get('rect')
        if r and e.get('status') in ('done', 'queued', 'running'):
            d.rectangle(r, outline=(60, 140, 255), width=max(1, lw // 2))
            fe = font(max(12, fs * 2 // 3))
            d.text((r[0] + 6, r[3] - fe.size - 8), e['id'], fill=(60, 140, 255), font=fe)
    for c in cs:
        col = STATE_COLOUR.get(c.get('state', 'new'), (0, 0, 0))
        x0, y0, x1, y1 = c['box']
        g = 4
        d.rectangle([x0 - g, y0 - g, x1 + g, y1 + g], outline=col, width=lw if c.get('state') != 'dropped' else 1)
        txt = str(c['id']) + (f" {c['label']}" if c.get('label') else '')
        if c.get('state') != 'dropped' and max(x1 - x0, y1 - y0) < D.min_letter_px(project['canvas']):
            txt += f" SMALL {max(x1 - x0, y1 - y0)}px"  # below the minimum letter size: the build refuses it
        tx, ty = x0 - g, max(0, y0 - g - fs - 4)
        tb = d.textbbox((tx, ty), txt, font=f)
        d.rectangle([tb[0] - 2, tb[1] - 2, tb[2] + 2, tb[3] + 2], fill=(255, 255, 255))
        d.text((tx, ty), txt, fill=col, font=f)
    if max(W, H) > max_side:
        s = max_side / max(W, H)
        im = im.resize((int(W * s), int(H * s)), Image.LANCZOS)
    im.save(out, quality=88)
    return out
