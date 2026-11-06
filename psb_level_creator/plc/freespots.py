"""Largest empty rects for a fill-up round (port of Waldo tools/regions/freespots.py).

find_free(pdir, project, n, w, h, pad) -> up to n non-overlapping [x0, y0, x1, y1] rects of w x h px (shrunk by 15 %
steps down to MIN_SIDE when that size no longer fits) that hold nothing yet. Occupied: every candidate that is not
dropped (kept and still-new ones, padded by `pad`) and the rects of edits still queued or running. Among the free
positions it prefers the one with the least occupied area around it. Also writes pdir/freespots.jpg.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from . import detect as D
from .sheet import font

CELL = 8          # occupancy grid cell (px)
MIN_SIDE = 160    # stop shrinking below this
SHRINK = 0.85
RING = 240        # px around a window that count for the clearance score
PENDING = ('queued', 'running')


def _integral(a):
    return np.pad(a.cumsum(0).cumsum(1), ((1, 0), (1, 0)))


def _window_sums(I, h, w):
    return I[h:, w:] - I[:-h, w:] - I[h:, :-w] + I[:-h, :-w]


def occupied_boxes(project: dict, pad: int):
    boxes = []
    for c in project.get('candidates', []):
        if c.get('state') != 'dropped':
            x0, y0, x1, y1 = c['box']
            boxes.append(('cand', [x0 - pad, y0 - pad, x1 + pad, y1 + pad]))
    for e in project.get('edits', []):
        if e.get('status') in PENDING and e.get('rect'):
            boxes.append(('edit', list(e['rect'])))
    return boxes


def find_free(pdir, project: dict, n: int = 3, w: int = 1024, h: int = 1024, pad: int = 60,
              min_side: int = MIN_SIDE, image: bool = True) -> list[list[int]]:
    pdir = Path(pdir)
    SW, SH = project['canvas']['w'], project['canvas']['h']
    n, w, h, pad = int(n), int(w), int(h), int(pad)
    if n < 1 or w < 1 or h < 1 or pad < 0:
        raise ValueError('find_free: n, w, h must be >= 1 and pad >= 0')
    gw, gh = (SW + CELL - 1) // CELL, (SH + CELL - 1) // CELL
    occ = np.zeros((gh, gw), np.int32)
    boxes = occupied_boxes(project, pad)
    for _, (x0, y0, x1, y1) in boxes:
        occ[max(0, y0 // CELL):max(0, -(-y1 // CELL)), max(0, x0 // CELL):max(0, -(-x1 // CELL))] = 1
    picked = []
    rw, rh = min(w, SW), min(h, SH)
    while len(picked) < n and min(rw, rh) >= min(min_side, w, h):
        cw, ch = max(1, -(-rw // CELL)), max(1, -(-rh // CELL))  # cells the rect touches (conservative)
        if cw > gw or ch > gh:
            rw, rh = int(rw * SHRINK), int(rh * SHRINK)
            continue
        I = _integral(occ)
        free = _window_sums(I, ch, cw) == 0
        free[(SH - rh) // CELL + 1:, :] = False  # the rect must end inside the canvas
        free[:, (SW - rw) // CELL + 1:] = False
        if not free.any():
            rw, rh = int(rw * SHRINK), int(rh * SHRINK)
            continue
        ring = RING // CELL
        Ib = _integral(np.pad(occ, ring))
        around = _window_sums(Ib, ch + 2 * ring, cw + 2 * ring)[:free.shape[0], :free.shape[1]]
        # ties: prefer windows nearer the canvas centre (models draw better away from the border)
        yy, xx = np.mgrid[:free.shape[0], :free.shape[1]]
        cen = np.abs(xx + cw / 2 - gw / 2) / gw + np.abs(yy + ch / 2 - gh / 2) / gh
        score = np.where(free, around + cen * 0.5, np.inf)
        y, x = np.unravel_index(int(np.argmin(score)), score.shape)
        r = [int(x * CELL), int(y * CELL), int(x * CELL + rw), int(y * CELL + rh)]
        picked.append(r)
        occ[y:y + ch, x:x + cw] = 1
    if image:
        _draw(pdir, boxes, picked)
    return picked


def _draw(pdir: Path, boxes, picked):
    bg = Image.fromarray(D.load_bg(pdir))
    d = ImageDraw.Draw(bg)
    W = bg.width
    lw = max(2, W // 500)
    for kind, b in boxes:
        d.rectangle(b, outline=(255, 60, 60) if kind == 'cand' else (60, 140, 255), width=lw)
    f = font(max(20, W // 30))
    for i, r in enumerate(picked, 1):
        d.rectangle(r, outline=(0, 230, 0), width=lw * 3)
        d.text((r[0] + 16, r[1] + 12), f'F{i}', fill=(0, 230, 0), font=f)
    if max(bg.size) > 1536:
        s = 1536 / max(bg.size)
        bg = bg.resize((int(bg.width * s), int(bg.height * s)), Image.LANCZOS)
    bg.save(pdir / 'freespots.jpg', quality=85)
