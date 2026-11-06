"""SAM 3 outline for a target's glyph, through Clai (the Odin route: POST <CLAI_URL>/team/odin/sam).

The automatic glyph (plc/glyph.py) is built from the diff and the colours. Where a letter has the colour of the scene
behind it (wood on wood, a wire letter on a wire rack), it loses parts or keeps scene. SAM sees the object's outline.
glyph.with_sam then combines the two:
- SAM gives the outline;
- the diff keeps only new pixels, drops broad shadow, and keeps the counters (the inside of an O) open.

One ask = one paid call (about 0.005 USD), authenticated with the creator's own Clai key (~/.config/claiface/key;
read only here, never logged or written anywhere). Every ask is recorded in a ledger before the call:
<pdir>/sam/<candidate id>/ask-<n>.json (status submitting -> done | failed). An ask whose outcome is unknown (timeout,
lost connection) stays "submitting", still counts, and is never resent automatically. At most ATTEMPTS asks per
candidate. Results: ask-<n>.png (the best-scored mask in canvas px of the frame), ask-<n>-overlay.jpg.

This module never writes project.json; the glyph op {"op": "glyph", "id": N, "mode": "sam", "attempt": n} picks a
done ask for the build.

CLI: python3 -m plc.sam <project dir> <candidate id> [--prompt "metal wire letter M napkin holder"] [--box x0 y0 x1 y1]
"""
from __future__ import annotations

import base64
import datetime as _dt
import io
import json
import os
import ssl
import urllib.error
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

CLAI_URL = 'https://63.189.88.172'
ATTEMPTS = 3
SQUARE_PAD = 1.12      # the square around the object (Odin hidden-square.mjs)
MIN_EDGE = 1024        # the square is enlarged to at least this
SCORE_MIN = 0.5
TIMEOUT = 240


class SamError(RuntimeError):
    pass


def _key() -> str:
    try:
        k = (Path.home() / '.config/claiface/key').read_text().strip()
    except OSError:
        k = ''
    if not (16 <= len(k) <= 200) or any(not (0x21 <= ord(ch) <= 0x7e) for ch in k):
        raise SamError('Clai key not found (~/.config/claiface/key): clai must be installed and logged in on this Mac')
    return k


def segment(image_png: bytes, prompt: str, box: dict, base: str | None = None, timeout: int = TIMEOUT):
    """One SAM call: a square PNG, a short English object prompt, its box in square px. Returns
    ([(mask bool array, score)], request_id). Raises SamError; the caller records the outcome."""
    if not prompt or len(prompt) > 300:
        raise SamError('SAM needs a 1-300 character English object prompt')
    body = json.dumps(dict(image=base64.b64encode(image_png).decode(), prompt=prompt.strip(),
                           box={k: int(box[k]) for k in ('x_min', 'y_min', 'x_max', 'y_max')})).encode()
    url = (base or os.environ.get('PLC_CLAI_URL') or CLAI_URL).rstrip('/') + '/team/odin/sam'
    req = urllib.request.Request(url, data=body, method='POST',
                                 headers={'Authorization': 'Bearer ' + _key(), 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ssl.create_default_context()) as r:
            text = r.read(48 * 1024 * 1024 + 1)
    except urllib.error.HTTPError as e:
        try:
            detail = json.loads(e.read(4096) or b'{}').get('error')
        except ValueError:
            detail = None
        extra = f': {detail}' if isinstance(detail, str) and len(detail) <= 200 and not any(
            w in detail.lower() for w in ('key', 'token', 'bearer', 'sk-', 'fal_')) else ''
        raise SamError(f'SAM (Clai) HTTP {e.code}{extra}; not resent') from None
    except Exception as e:  # timeout / connection: the outcome is unknown
        raise SamError(f'SAM (Clai) outcome unknown ({type(e).__name__}); not resent') from None
    try:
        data = json.loads(text)
        masks = [(np.asarray(Image.open(io.BytesIO(base64.b64decode(m['png']))).convert('L')) >= 128, float(m['score']))
                 for m in data['masks']]
    except Exception:
        raise SamError('SAM reply has no valid masks') from None
    if not masks:
        raise SamError('SAM reply has no masks')
    rid = data.get('request_id')
    return masks, (rid[:120] if isinstance(rid, str) else None)


def frame(box, canvas):
    """The square around box (canvas px): (left, top, side, edge)."""
    x0, y0, x1, y1 = box
    side = int(np.ceil(max(x1 - x0, y1 - y0) * SQUARE_PAD))
    left, top = int(round((x0 + x1) / 2 - side / 2)), int(round((y0 + y1) / 2 - side / 2))
    return left, top, side, max(MIN_EDGE, side)


def scene_square(scene: np.ndarray, fr) -> np.ndarray:
    """The frame's pixels from the scene (grey outside the canvas), enlarged to edge x edge."""
    left, top, side, edge = fr
    H, W = scene.shape[:2]
    sq = np.full((side, side, 3), 128, np.uint8)
    sx0, sy0, sx1, sy1 = max(0, left), max(0, top), min(W, left + side), min(H, top + side)
    sq[sy0 - top:sy1 - top, sx0 - left:sx1 - left] = scene[sy0:sy1, sx0:sx1]
    return np.asarray(Image.fromarray(sq).resize((edge, edge), Image.LANCZOS))


def ask_dir(pdir, cid) -> Path:
    return Path(pdir) / 'sam' / str(int(cid))


def asks(pdir, cid) -> list[dict]:
    d = ask_dir(pdir, cid)
    out = []
    for f in sorted(d.glob('ask-*.json'), key=lambda f: int(f.stem.split('-')[1])):
        try:
            out.append(json.loads(f.read_text()))
        except (OSError, ValueError):
            out.append(dict(attempt=int(f.stem.split('-')[1]), status='unreadable'))
    return out


def mask_of(pdir, cid, attempt: int):
    """(bool mask, [x0, y0, x1, y1] canvas box of it) of a done ask."""
    d = ask_dir(pdir, cid)
    rec = json.loads((d / f'ask-{int(attempt)}.json').read_text())
    if rec.get('status') != 'done':
        raise ValueError(f'SAM ask {attempt} of candidate {cid} is {rec.get("status")}, not done')
    m = np.asarray(Image.open(d / f'ask-{int(attempt)}.png').convert('L')) > 127
    return m, rec['mask_box']


def default_prompt(c: dict) -> str:
    if c.get('desc'):
        return str(c['desc'])[:300]
    ch = str(c.get('label') or '').split('_')[-1][:1]
    return f'letter {ch} shaped object' if ch.isalpha() else 'letter shaped object'


def ask(pdir, project: dict, cid, prompt: str | None = None, box=None, segment_fn=None) -> dict:
    """One recorded SAM ask for a candidate (one paid call). Returns the ask record."""
    from . import build as B
    from . import detect as D
    pdir = Path(pdir)
    c = next((c for c in project.get('candidates', []) if int(c['id']) == int(cid)), None)
    if c is None:
        raise ValueError(f'candidate {cid} not found')
    done = asks(pdir, cid)
    if len(done) >= ATTEMPTS:
        raise SamError(f'candidate {cid} already used its {ATTEMPTS} SAM asks: pick one with the glyph op')
    if any(a.get('status') == 'submitting' for a in done):
        raise SamError(f'candidate {cid} has a SAM ask with an unknown outcome; not resent')
    prompt = (prompt or default_prompt(c)).strip()
    box = [int(v) for v in (box or c['box'])]
    ctx = B.Ctx(pdir, project)
    e = ctx.edits[c['edit']]
    ex0, ey0, ex1, ey1 = e['box']
    scene = ctx.bg.copy()
    scene[ey0:ey1, ex0:ex1] = ctx.answer(c['edit'])  # the edited scene the player sees
    fr = frame(box, project['canvas'])
    left, top, side, edge = fr
    k = edge / side
    sbox = dict(x_min=max(0, int(round((box[0] - left) * k))), y_min=max(0, int(round((box[1] - top) * k))),
                x_max=min(edge, int(round((box[2] - left) * k))), y_max=min(edge, int(round((box[3] - top) * k))))
    sq = scene_square(scene, fr)
    buf = io.BytesIO()
    Image.fromarray(sq).save(buf, 'PNG')
    d = ask_dir(pdir, cid)
    d.mkdir(parents=True, exist_ok=True)
    n = len(done) + 1
    rec_path = d / f'ask-{n}.json'
    rec = dict(attempt=n, candidate=int(cid), prompt=prompt, box=box, frame=list(fr), status='submitting',
               at=_dt.datetime.now().astimezone().isoformat(timespec='seconds'))
    with open(rec_path, 'x') as f:  # recorded before the paid call; never overwritten by a second ask
        json.dump(rec, f, indent=1)
    try:
        masks, rid = (segment_fn or segment)(buf.getvalue(), prompt, sbox)
    except SamError as err:
        rec.update(status='submitting' if 'unknown' in str(err) else 'failed', error=str(err)[:300])
        rec_path.write_text(json.dumps(rec, indent=1))
        raise
    # SAM returns several scored masks; the one that best matches the candidate (IoU with its filled mask in the
    # square) wins, the score breaks ties - the top-scored one is sometimes a neighbour (the wall behind a stand)
    from scipy import ndimage as ndi
    cm = np.zeros((side, side), bool)
    k_ = ndi.binary_fill_holes(D.load_mask(pdir, c))
    cx0, cy0, cx1, cy1 = c['box']
    ox, oy = cx0 - left, cy0 - top
    ys, xs = np.nonzero(k_)
    ok = (ys + oy >= 0) & (ys + oy < side) & (xs + ox >= 0) & (xs + ox < side)
    cm[ys[ok] + oy, xs[ok] + ox] = True
    cm = np.asarray(Image.fromarray(cm.astype(np.uint8) * 255).resize((edge, edge), Image.NEAREST)) > 127

    def fit(t):
        pl = t[0] if t[0].shape == (edge, edge) else np.asarray(
            Image.fromarray(t[0].astype(np.uint8) * 255).resize((edge, edge), Image.NEAREST)) > 127
        iou = (pl & cm).sum() / max(1, (pl | cm).sum())
        return pl, t[1], float(iou)
    cands = [fit(t) for t in masks]
    plane, score, iou = max(cands, key=lambda t: (round(t[2], 2), t[1]))
    # back to canvas px
    m = np.asarray(Image.fromarray(plane.astype(np.uint8) * 255).resize((side, side), Image.BILINEAR)) > 127
    H, W = project['canvas']['h'], project['canvas']['w']
    full = np.zeros((H, W), bool)
    sx0, sy0, sx1, sy1 = max(0, left), max(0, top), min(W, left + side), min(H, top + side)
    full[sy0:sy1, sx0:sx1] = m[sy0 - top:sy1 - top, sx0 - left:sx1 - left]
    kk, mbox = D.crop_to_mask(full, 0, 0)
    problems = []
    if score < SCORE_MIN:
        problems.append(f'low score {score:.2f}')
    if kk is None:
        problems.append('empty mask')
    else:
        inside = full[box[1]:box[3], box[0]:box[2]].sum() / max(1, full.sum())
        if inside < 0.9:
            problems.append(f'{100 * (1 - inside):.0f}% of the mask lies outside the box')
        Image.fromarray(kk.astype(np.uint8) * 255).save(d / f'ask-{n}.png')
        ov = sq.copy()
        pm = plane
        ov[pm] = (ov[pm] * 0.45 + np.array([255, 0, 200]) * 0.55).astype(np.uint8)
        Image.fromarray(ov).resize((512, 512), Image.LANCZOS).save(d / f'ask-{n}-overlay.jpg', quality=85)
    rec.update(status='done' if kk is not None else 'failed', score=round(score, 3), iou=round(iou, 3),
               masks=[dict(score=round(t[1], 3), iou=round(t[2], 3)) for t in cands], request_id=rid,
               mask_box=mbox, problems=problems)
    rec_path.write_text(json.dumps(rec, indent=1))
    return rec


def _main(argv=None):
    import argparse
    ap = argparse.ArgumentParser(description='One recorded SAM ask (one paid call) for a candidate\'s glyph outline.')
    ap.add_argument('project_dir')
    ap.add_argument('candidate', type=int)
    ap.add_argument('--prompt')
    ap.add_argument('--box', type=int, nargs=4)
    a = ap.parse_args(argv)
    pdir = Path(a.project_dir)
    project = json.loads((pdir / 'project.json').read_text())
    rec = ask(pdir, project, a.candidate, a.prompt, a.box)
    print(json.dumps({k: v for k, v in rec.items() if k != 'frame'}))


if __name__ == '__main__':
    _main()
