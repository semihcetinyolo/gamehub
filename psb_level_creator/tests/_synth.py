"""Synthetic BG / answer pairs for the detect / ops / sheet / freespots / build tests (no network, no providers)."""
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

W, H = 768, 1024
FONT = '/System/Library/Fonts/Helvetica.ttc'


def texture(w=W, h=H, seed=1):
    """A wall-like BG: soft gradient, planks with dark seams, smooth grain (so a shifted redraw differs)."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[:h, :w].astype(np.float32)
    base = np.stack([150 + 40 * xx / w, 140 + 30 * yy / h, 120 + 0 * xx], -1)
    grain = cv2.GaussianBlur(rng.normal(0, 1, (h, w)).astype(np.float32), (0, 0), 3)
    grain = grain / (grain.std() + 1e-6) * 9
    base += grain[..., None]
    base[(yy.astype(int) % 96) < 3] -= 45  # plank seams
    return np.clip(base, 0, 255).astype(np.uint8)


def font(size):
    try:
        return ImageFont.truetype(FONT, size)
    except OSError:
        return ImageFont.load_default(size)


def draw_letter(img: np.ndarray, ch: str, xy, size=110, colour=(70, 40, 20), stroke=0) -> np.ndarray:
    """Draw `ch` with its top-left near canvas `xy` (crop coords of img). Returns the bool mask of the drawn pixels."""
    im = Image.fromarray(img)
    m = Image.new('L', im.size, 0)
    f = font(size)
    ImageDraw.Draw(m).text(xy, ch, fill=255, font=f, stroke_width=stroke, stroke_fill=255)
    mk = np.asarray(m) > 127
    out = np.asarray(im).copy()
    out[mk] = colour
    img[...] = out
    return mk


def engrave(img: np.ndarray, ch: str, xy, size=110, depth=22) -> np.ndarray:
    """A faint engraved letter: the surface a little darker inside the letter."""
    m = Image.new('L', (img.shape[1], img.shape[0]), 0)
    ImageDraw.Draw(m).text(xy, ch, fill=255, font=font(size), stroke_width=2, stroke_fill=255)
    mk = np.asarray(m) > 127
    img[mk] = np.clip(img[mk].astype(int) - depth, 0, 255).astype(np.uint8)
    return mk


def redraw(crop: np.ndarray, shift=(2, -2), gain=1.03, off=3, noise=3, seed=7, bg=None, box=None) -> np.ndarray:
    """What a model gives back for an untouched crop: shifted a little, tone drift, noise. With bg + box the shifted
    content comes from the scene around the box (like a real redraw); without, np.roll wraps a strip round the
    border (a border artefact)."""
    rng = np.random.default_rng(seed)
    if bg is not None:
        x0, y0, x1, y1 = box
        dy, dx = shift
        pad = np.pad(bg, ((16, 16), (16, 16), (0, 0)), mode='reflect')
        src = pad[y0 + 16 - dy:y1 + 16 - dy, x0 + 16 - dx:x1 + 16 - dx]
    else:
        src = np.roll(crop, shift, axis=(0, 1))
    a = src.astype(np.float32) * gain + off
    a += rng.normal(0, noise, a.shape)
    return np.clip(a, 0, 255).astype(np.uint8)


def make_project(tmp: Path, edits, bg=None):
    """edits: list of (id, box, rect, answer array). Writes bg.png + edits/<id>/answer.png; returns the project dict."""
    tmp = Path(tmp)
    bg = texture() if bg is None else bg
    Image.fromarray(bg).save(tmp / 'bg.png')
    proj = dict(name='t', canvas=dict(w=bg.shape[1], h=bg.shape[0]), settings={}, background={'file': 'bg.png'},
                edits=[], candidates=[], builds=[])
    for eid, box, rect, ans in edits:
        d = tmp / 'edits' / eid
        d.mkdir(parents=True, exist_ok=True)
        Image.fromarray(ans).save(d / 'answer.png')
        proj['edits'].append(dict(id=eid, rect=list(rect), box=list(box), prompt='', status='done', via='clai',
                                  detected=False))
    return proj, bg


def crop(bg, box):
    x0, y0, x1, y1 = box
    return bg[y0:y1, x0:x1].copy()


def box_contains(box, x, y):
    return box[0] <= x < box[2] and box[1] <= y < box[3]


def centre(mask, ox=0, oy=0):
    ys, xs = np.nonzero(mask)
    return ox + xs.mean(), oy + ys.mean()


def save_json(p, obj):
    Path(p).write_text(json.dumps(obj))
