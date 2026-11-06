"""Edits and the background: square choice, the paid call (Clai first, Albert once on any Clai error), the answer put
back in place, and the ledger. Uses providers + store; jobs are run by jobqueue.

Ported from Odin bridge/nano-edit.mjs (editArea square rule, Clai -> Albert) and its ledger rule: request.json gets
an attempt entry BEFORE each paid request; an outcome that is not known is never resent.
"""
from __future__ import annotations

import base64
import io
import re
import time
from pathlib import Path

import numpy as np
from PIL import Image

from . import jobqueue, providers, store
from .providers import ProviderError
from .store import StoreError, now

SQUARES = (512, 1024, 2048)
MAX_SEND = 2048
# Astra (GPT image): a 1024 square at least (more context, sister team: "kareyi büyük yapmak lazım") sent as it is;
# GPT answers about 1.5 MP whatever it gets, so nothing above 1024 is sent
ASTRA_SQUARES = (1024, 2048)
ASTRA_MAX_SEND = 1024
MAX_PROMPT = 8000
MAX_REFS = 4
REF_MAX_SIDE = 1024


# ---- Clai retries ---------------------------------------------------------------------------------------------
# User decision (2026-11-05): a DEFINITE Clai error answer (HTTP 502 image_failed with an AI Studio 403/504/5xx
# inside, 429, 503, image_quota_exhausted) is harmless: the same request is sent again with backoff (10 s, 20 s,
# 40 s, then every 60 s; a used-up quota every 60 s from the start),
# no attempt cap, until it succeeds or the job is cancelled. Every attempt is recorded in the ledger before it is
# sent and gets its outcome after. An UNKNOWN outcome (connection dropped, our own timeout) is never resent.
RETRY_BACKOFF = (10, 20, 40, 60)


def _sleep(seconds: float) -> None:   # patched in tests
    time.sleep(seconds)


QUOTA_WAIT = 60   # a used-up quota comes back slowly: every 60 s from the first retry


def clai_quota(e: ProviderError) -> bool:
    msg = str(e)
    return 'image_quota_exhausted' in msg or ('AI Studio' in msg and '503' in msg)


def clai_retryable(e: ProviderError) -> bool:
    """A definite Clai error answer with no pixels generated: 429, 503, image_quota_exhausted (any status), or a
    500/502/504 that is image_failed / an AI Studio error inside."""
    if e.kind != 'failed' or e.status is None:
        return False
    if e.status in (429, 503) or clai_quota(e):
        return True
    msg = str(e)
    return e.status in (500, 502, 504) and ('image_failed' in msg or 'AI Studio' in msg)


class JobCancelled(ProviderError):
    """The job was cancelled: never a reason to try another route."""

    def __init__(self, message: str):
        super().__init__(message, 'failed')


def marla_retryable(e: ProviderError) -> bool:
    """A definite error answer of Marla's submit / Albert's generator (nothing accepted): 429 or 5xx."""
    return e.kind == 'failed' and e.status in (429, 500, 502, 503, 504)


def clai_with_retry(call, req_path: Path, request: dict, jid: str, note=None, route: str = 'clai',
                    retryable=None):
    """call() = one request (Clai by default; route/retryable for Marla/Albert). Returns its answer; raises the first
    non-retryable ProviderError (or a 'cancelled' one). note(n, error, wait) is told about every retry."""
    retryable = retryable or clai_retryable
    n = 0
    while True:
        if jobqueue.is_cancelled(jid):
            raise JobCancelled(f'cancelled after {n} attempts' if n else 'cancelled before sending')
        n += 1
        store.record_attempt(req_path, request, route)          # ledger BEFORE the paid request
        try:
            ans = call()
        except ProviderError as e:
            if e.kind != 'unknown':
                store.record_outcome(req_path, request, f'error: {e}')
            if not retryable(e):
                raise
            wait = QUOTA_WAIT if clai_quota(e) else RETRY_BACKOFF[min(n - 1, len(RETRY_BACKOFF) - 1)]
            jobqueue.set_status(jid, f'retrying ({n})', str(e)[:300])
            if note:
                try:
                    note(n, str(e), wait)
                except Exception:
                    pass
            waited = 0.0
            while waited < wait:
                if jobqueue.is_cancelled(jid):
                    raise JobCancelled(f'cancelled after {n} attempts (last: {str(e)[:200]})')
                step = min(1.0, wait - waited)
                _sleep(step)
                waited += step
            continue
        store.record_outcome(req_path, request, 'ok')
        jobqueue.set_status(jid, 'running')
        return ans


def _retry_note(name: str, find):
    def note(n, err, wait):
        def fn(p):
            find(p)['retry'] = {'attempts': n, 'last_error': err[:300], 'next_in_s': wait, 'at': now()}
        store.update(name, fn)
    return note


# ---- geometry --------------------------------------------------------------------------------------------------

MARLA_MARGIN = 256      # Marla blends its answer up to 256 px outside the rect (Odin marla-patch.mjs)
MARLA_SUFFIX = (' Change only the requested edit and the necessary nearby contact or overlap area; keep the rest of '
                'the scene exactly as it is.')   # Odin creator-tools


def edit_area(rect, canvas_w: int, canvas_h: int, square: bool = True, provider: str = 'nano') -> dict:
    """Odin editArea: a square of 512/1024/2048 around the rect, kept inside the canvas (squares come back in place).
    When no square fits, the rect itself is sent. Anything larger than 2048 is sent scaled down.
    rect/box = [x0, y0, x1, y1] canvas px. Returns {box, send: [w, h], square}."""
    x0, y0, x1, y1 = clamp_rect(rect, canvas_w, canvas_h)
    if provider == 'marla':   # the whole scene is sent; the box = the rect + Marla's blend margin
        m = MARLA_MARGIN
        box = [max(0, x0 - m), max(0, y0 - m), min(canvas_w, x1 + m), min(canvas_h, y1 + m)]
        return {'box': box, 'send': [box[2] - box[0], box[3] - box[1]], 'square': False}
    w, h = x1 - x0, y1 - y0
    long = max(w, h)
    box, squared = [x0, y0, x1, y1], False
    if square:
        side = next((s for s in (ASTRA_SQUARES if provider == 'astra' else SQUARES) if s >= long), long)
        if side <= canvas_w and side <= canvas_h:
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
            left = min(canvas_w - side, max(0, round(cx - side / 2)))
            top = min(canvas_h - side, max(0, round(cy - side / 2)))
            box, squared = [left, top, left + side, top + side], True
    bw, bh = box[2] - box[0], box[3] - box[1]
    k = min(1.0, (ASTRA_MAX_SEND if provider == 'astra' else MAX_SEND) / max(bw, bh))
    return {'box': box, 'send': [max(1, round(bw * k)), max(1, round(bh * k))], 'square': squared}


def clamp_rect(rect, canvas_w: int, canvas_h: int) -> list[int]:
    try:
        x0, y0, x1, y1 = (int(round(float(v))) for v in rect)
    except (TypeError, ValueError):
        raise StoreError('a box needs numeric x0, y0, x1, y1')
    x0, y0, x1, y1 = max(0, x0), max(0, y0), min(canvas_w, x1), min(canvas_h, y1)
    if x1 - x0 < 8 or y1 - y0 < 8:
        raise StoreError(f'box {rect} is empty or outside the {canvas_w}x{canvas_h} canvas')
    return [x0, y0, x1, y1]


# ---- images ----------------------------------------------------------------------------------------------------

def png_bytes(im: Image.Image) -> bytes:
    b = io.BytesIO()
    im.save(b, 'PNG')
    return b.getvalue()


MARLA_REF_SIDE = 512          # Albert refuses a multipart FIELD over ~1 MB: the regions JSON carries ref_image
MARLA_REF_BYTES = 600_000     # as a data URL (astra-c1, 2026-11-05: a 1.5 MB ref -> 400 'field size limit')


def marla_scene_bytes(im: Image.Image) -> bytes:
    """The whole scene for Marla as PNG (Odin sends PNG; a 4.8 MB scene went through in the smoke test)."""
    return png_bytes(im.convert('RGB'))


def marla_ref_url(ref_png: bytes) -> str:
    """A reference image for a Marla region as a data URL small enough for the regions form field."""
    im = Image.open(io.BytesIO(ref_png))
    im = im.convert('RGBA') if im.mode in ('RGBA', 'LA', 'P') else im.convert('RGB')
    if max(im.size) > MARLA_REF_SIDE:
        k = MARLA_REF_SIDE / max(im.size)
        im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
    b = png_bytes(im)
    if len(b) * 4 // 3 > MARLA_REF_BYTES:
        jb = io.BytesIO()
        im.convert('RGB').save(jb, 'JPEG', quality=85)
        return providers.data_url(jb.getvalue(), 'image/jpeg')
    return providers.data_url(b)


def load_image_ref(ref: str, project_dir: Path) -> Image.Image:
    """A reference image given as a data URL or a local path (absolute, or relative to the project dir)."""
    if not isinstance(ref, str) or not ref:
        raise StoreError('ref_images entries must be data URLs or paths')
    try:
        if ref.startswith('data:'):
            m = re.match(r'data:image/[\w.+-]+;base64,(.*)$', ref, re.S)
            if not m:
                raise StoreError('ref image data URL must be data:image/...;base64,...')
            im = Image.open(io.BytesIO(base64.b64decode(m.group(1))))
        else:
            p = Path(ref).expanduser()
            p = p if p.is_absolute() else project_dir / p
            if not p.is_file():
                raise StoreError(f'ref image not found: {ref}')
            im = Image.open(p)
        im.load()
    except StoreError:
        raise
    except Exception:
        raise StoreError('a ref image could not be read as an image')
    im = im.convert('RGBA') if im.mode in ('RGBA', 'LA', 'P') else im.convert('RGB')
    if max(im.size) > REF_MAX_SIDE:
        k = REF_MAX_SIDE / max(im.size)
        im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
    return im


def bg_image(name: str) -> Image.Image:
    p = store.pdir(name) / 'bg.png'
    if not p.is_file():
        raise StoreError('the project has no background yet', 409)
    return Image.open(p).convert('RGB')


# ---- background ------------------------------------------------------------------------------------------------

def _bg_locked_reason(p: dict) -> str | None:
    if p.get('edits'):
        return 'the background is fixed once edits exist (every edit is generated from it); make a new project'
    if any(g.get('status') in ('queued', 'running') for g in p.get('generations', [])):
        return 'a background generation is already running'
    return None


def set_background(name: str, data: bytes, source: str, extra: dict | None = None) -> dict:
    """Make `data` (PNG/JPG bytes) the project's bg.png. Only while the project has no edits."""
    try:
        im = Image.open(io.BytesIO(data))
        im.load()
        if im.width * im.height > providers.MAX_PIXELS:
            raise StoreError('image too large')
        im = im.convert('RGB')
    except StoreError:
        raise
    except Exception:
        raise StoreError('the upload is not a readable PNG/JPG image')
    if min(im.size) < 512:
        raise StoreError('the background must be at least 512 px on each side')

    def fn(p):
        if p.get('edits'):
            raise StoreError(_bg_locked_reason(p), 409)
        im.save(store.pdir(name) / 'bg.png', 'PNG')
        p['canvas'] = {'w': im.width, 'h': im.height}
        from . import background as bgx
        p['background'] = {'file': 'bg.png', 'source': source, 'set': now(), **(extra or {}),
                           'border': bgx.border_info(np.asarray(im))}
    return store.update(name, fn)[0]


def add_generation(name: str, prompt: str, ratio: str = '3:4', size: str = '2K', provider: str = 'nano') -> dict:
    if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > MAX_PROMPT:
        raise StoreError(f'prompt required (max {MAX_PROMPT} characters)')
    if ratio not in providers.RATIOS:
        raise StoreError(f'ratio must be one of {providers.RATIOS}')
    if size not in providers.SIZES:
        raise StoreError(f'size must be one of {providers.SIZES}')
    if provider not in ('nano', 'marla'):
        raise StoreError("provider for generate: 'nano' or 'marla'")
    if provider == 'marla' and ratio not in providers.ALBERT_DIMENSIONS:
        raise StoreError(f'ratio for marla must be one of {sorted(providers.ALBERT_DIMENSIONS)}')

    def fn(p):
        why = _bg_locked_reason(p)
        if why:
            raise StoreError(why, 409)
        gens = p.setdefault('generations', [])
        gid = f'g{len(gens) + 1}'
        g = {'id': gid, 'dir': f'gen/{gid}', 'prompt': prompt, 'ratio': ratio, 'size': size, 'provider': provider,
             **({'model': p['settings'].get('marla_model') or providers.MARLA_MODEL} if provider == 'marla' else {}),
             'status': 'queued',
             'via': None, 'channel': None, 'error': None, 'created': now(), 'ended': None}
        gens.append(g)
        return dict(g)
    return store.update(name, fn)[1]


RESTYLE_SOURCE_MAX = 2048
RESTYLE_REF_MAX = 1536
MAX_STYLE_REFS = 4


def _resolve_image(ref: str, project_dir: Path) -> Image.Image:
    """A data URL, an absolute path, a path relative to the repo root (lab/..., projects/...) or to the project."""
    if isinstance(ref, str) and not ref.startswith('data:') and not Path(ref).expanduser().is_absolute():
        for base in (store.ROOT, project_dir):
            if (base / ref).is_file():
                ref = str(base / ref)
                break
    im = load_image_ref(ref, project_dir) if ref.startswith('data:') else None
    if im is None:
        p = Path(ref).expanduser()
        if not p.is_file():
            raise StoreError(f'image not found: {ref}')
        try:
            im = Image.open(p)
            im.load()
        except Exception:
            raise StoreError(f'not a readable image: {ref}')
    return im.convert('RGB')


def _fit(im: Image.Image, side: int) -> Image.Image:
    k = min(1.0, side / max(im.size))
    return im if k >= 1 else im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)


def add_restyle(name: str, source: str, style_refs=None, prompt: str = '', ratio: str = '3:4', size: str = '2K',
                provider: str = 'nano') -> dict:
    """Record a background restyle job: the source picture (image 1) + style reference pictures go to the image edit
    route; the answer becomes the BG. Inputs are copied into gen/<id>/ (source.png, style_<k>.png) before queueing."""
    if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > providers.ASTRA_MAX_PROMPT:
        raise StoreError(f'prompt required (max {providers.ASTRA_MAX_PROMPT} characters)')
    if provider not in store.PROVIDERS:
        raise StoreError(f'provider must be one of {store.PROVIDERS}')
    ratios = (providers.ASTRA_RATIOS if provider == 'astra' else tuple(providers.ALBERT_DIMENSIONS)
              if provider == 'marla' else providers.RATIOS)
    if ratio not in ratios:
        raise StoreError(f'ratio must be one of {ratios}')
    if size not in ('1K', '2K'):
        raise StoreError("size must be '1K' or '2K'")
    refs = style_refs or []
    if not isinstance(refs, list) or len(refs) > MAX_STYLE_REFS:
        raise StoreError(f'style_refs: a list of at most {MAX_STYLE_REFS} images')
    if not isinstance(source, str) or not source:
        raise StoreError('source: a path or data URL')
    d = store.pdir(name)
    src = _fit(_resolve_image(source, d), RESTYLE_SOURCE_MAX)
    style = [_fit(_resolve_image(r, d), RESTYLE_REF_MAX) for r in refs]

    def fn(p):
        why = _bg_locked_reason(p)
        if why:
            raise StoreError(why, 409)
        gens = p.setdefault('generations', [])
        gid = f'g{len(gens) + 1}'
        g = {'id': gid, 'kind': 'restyle', 'dir': f'gen/{gid}', 'prompt': prompt, 'ratio': ratio, 'size': size,
             'provider': provider, 'source': source if not source.startswith('data:') else 'data URL',
             **({'model': p['settings'].get('marla_model') or providers.MARLA_MODEL} if provider == 'marla' else {}),
             'style_refs': [r if not r.startswith('data:') else 'data URL' for r in refs],
             'status': 'queued', 'via': None, 'channel': None, 'error': None, 'created': now(), 'ended': None}
        gdir = d / g['dir']
        gdir.mkdir(parents=True, exist_ok=True)
        src.save(gdir / 'source.png')
        for k, im in enumerate(style, 1):
            im.save(gdir / f'style_{k}.png')
        g['inputs'] = ['source.png'] + [f'style_{k}.png' for k in range(1, len(style) + 1)]
        gens.append(g)
        return dict(g)
    return store.update(name, fn)[1]


def run_generation(name: str, gid: str) -> str:
    """Job body for a background generation. Returns the final status."""
    d = store.pdir(name)

    def start(p):
        g = _find_gen(p, gid)
        if g['status'] != 'queued':
            return None
        g['status'], g['started'] = 'running', now()
        return dict(g)
    g = store.update(name, start)[1]
    if g is None:
        return _find_gen(store.read(name), gid)['status']
    gdir = d / g['dir']
    gdir.mkdir(parents=True, exist_ok=True)
    req_path = gdir / 'request.json'
    kind = g.get('kind', 'generate')
    provider = g.get('provider', 'nano')
    request = {'kind': kind, 'provider': provider,
               'model': g.get('model') if provider == 'marla' else
               'gpt (clai image)' if provider == 'astra' else providers.MODEL,
               'prompt': g['prompt'], 'ratio': g['ratio'], 'size': g['size'], 'inputs': g.get('inputs', [])}
    prior = store.read_json(req_path) or {}
    if prior.get('attempts'):   # requeued after a restart: keep the earlier attempts
        request['attempts'] = prior['attempts']
    fallback = store.read(name)['settings'].get('fallback', 'albert')
    result, status, error, clai_error = {}, 'failed', None, None
    t0 = time.time()
    try:
        inputs = [gdir / f for f in g.get('inputs', [])]
        if provider == 'marla':
            dims = providers.ALBERT_DIMENSIONS[g['ratio']]
            blobs = [f.read_bytes() for f in inputs]
            ans = clai_with_retry(
                lambda: providers.albert_image(g['prompt'], blobs, *dims, model=g.get('model') or providers.MARLA_MODEL),
                req_path, request, f'{name}.{gid}', _retry_note(name, lambda p: _find_gen(p, gid)),
                route='marla', retryable=marla_retryable)
            via = 'marla'
        elif kind == 'restyle' and provider == 'astra':
            until = providers.astra_limit_until()
            if until:
                raise ProviderError(providers.astra_limit_text(until), 'invalid')
            with providers.ASTRA_SLOTS:
                store.record_attempt(req_path, request, 'astra')
                ans = providers.astra_edit(g['prompt'], inputs, ratio=g['ratio'], take_slot=False)
            via = 'astra'
        else:
            try:
                if kind == 'restyle':
                    blobs = [f.read_bytes() for f in inputs]
                    call = lambda: providers.clai_edit(g['prompt'], blobs, square=False,  # noqa: E731
                                                       long_side=2048 if g['size'] == '2K' else 1024,
                                                       aspect_ratio=g['ratio'])
                else:
                    call = lambda: providers.clai_generate(g['prompt'], ratio=g['ratio'], size=g['size'])  # noqa: E731
                ans = clai_with_retry(call, req_path, request, f'{name}.{gid}',
                                      _retry_note(name, lambda p: _find_gen(p, gid)))
                via = 'clai'
            except ProviderError as ce:
                clai_error = str(ce)
                dims = providers.ALBERT_DIMENSIONS.get(g['ratio'])
                if fallback != 'albert' or not dims or isinstance(ce, JobCancelled):
                    raise
                store.record_attempt(req_path, request, 'albert')
                ans = providers.albert_image(g['prompt'], [f.read_bytes() for f in inputs], *dims)
                via = 'albert'
        (gdir / 'answer.png').write_bytes(ans['png'])
        result = {'via': via, 'channel': ans.get('channel'), 'format': ans.get('format')}
        extra = {'prompt': g['prompt'], 'via': via, 'generation': gid}
        if kind == 'restyle':
            extra.update(restyle_source=g.get('source'), style_refs=g.get('style_refs'))
        set_background(name, ans['png'], kind, extra)
        status = 'done'
    except ProviderError as e:
        status, error = ('unknown' if e.kind == 'unknown' else 'failed'), str(e)
    except StoreError as e:
        status, error = 'failed', f'answer kept in {g["dir"]}/answer.png but not used: {e}'
    except Exception as e:  # a bug here must not leave the job hanging; never resend
        status = 'unknown' if store.was_sent(req_path) else 'failed'
        error = f'internal error: {type(e).__name__}: {str(e)[:200]}'
    result.update({'status': status, 'error': error, 'clai_error': clai_error, 'seconds': round(time.time() - t0, 1)})
    store.write_json(gdir / 'result.json', result)

    def end(p):
        x = _find_gen(p, gid)
        x.update(status=status, error=error, via=result.get('via'), channel=result.get('channel'),
                 clai_error=clai_error, ended=now())
    store.update(name, end)
    return status


def _find_gen(p, gid):
    for g in p.get('generations', []):
        if g['id'] == gid:
            return g
    raise StoreError(f'no generation {gid!r}', 404)


# ---- edits -----------------------------------------------------------------------------------------------------

def add_edits(name: str, boxes: list, fallback: str | None = None, auto_detect: bool = True,
              provider: str | None = None, allow_border: bool = False) -> list[str]:
    """Validate Marla-style boxes and record them as queued edits (nothing is sent here). Returns the edit ids."""
    if not isinstance(boxes, list) or not boxes:
        raise StoreError('boxes: a non-empty list required')
    if len(boxes) > 50:
        raise StoreError('at most 50 boxes per request')
    if fallback is not None and fallback not in store.FALLBACKS:
        raise StoreError(f'fallback must be one of {store.FALLBACKS}')
    if provider is not None and provider not in store.PROVIDERS:
        raise StoreError(f'provider must be one of {store.PROVIDERS}')
    p0 = store.read(name)
    provider = provider or p0['settings'].get('provider', 'nano')
    if provider == 'astra':
        until = providers.astra_limit_until()
        if until:
            raise StoreError(providers.astra_limit_text(until), 429)
    border = (p0.get('background') or {}).get('border')
    if border and not border.get('ok') and not allow_border:
        raise StoreError('background not full-bleed: run background/extend or regenerate '
                         f'(paper border {border.get("fraction")} of the canvas; allow_border=true to override)', 409)
    if not p0.get('canvas') or not (store.pdir(name) / 'bg.png').is_file():
        raise StoreError('the project has no background yet', 409)
    cw, ch = p0['canvas']['w'], p0['canvas']['h']
    d = store.pdir(name)
    prepared = []
    for i, b in enumerate(boxes):
        if not isinstance(b, dict):
            raise StoreError(f'box {i}: an object required')
        prompt = b.get('description', b.get('prompt'))
        cap = providers.ASTRA_MAX_PROMPT if provider == 'astra' else MAX_PROMPT
        if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > cap:
            raise StoreError(f'box {i}: description required (max {cap} characters)')
        rect = clamp_rect([b.get('x0'), b.get('y0'), b.get('x1'), b.get('y1')], cw, ch)
        area = edit_area(rect, cw, ch, square=b.get('square', True) is not False, provider=provider)
        refs = b.get('ref_images') or ([b['ref_image']] if b.get('ref_image') else [])
        if not isinstance(refs, list) or len(refs) > MAX_REFS:
            raise StoreError(f'box {i}: ref_images must be a list of at most {MAX_REFS}')
        prepared.append((rect, area, prompt.strip(), [load_image_ref(r, d) for r in refs]))

    def fn(p):
        fb = 'none' if provider in ('astra', 'marla') else (fallback or p['settings'].get('fallback', 'albert'))
        ids = []
        for rect, area, prompt, refs in prepared:
            eid = store.next_edit_id(p)
            ed = store.edit_dir(name, eid)
            ed.mkdir(parents=True, exist_ok=True)
            ref_files = []
            for k, im in enumerate(refs, 1):
                im.save(ed / f'ref_{k}.png', 'PNG')
                ref_files.append(f'edits/{eid}/ref_{k}.png')
            p['edits'].append({'id': eid, 'rect': rect, 'box': area['box'], 'send': area['send'],
                               'square': area['square'], 'prompt': prompt, 'ref_images': ref_files,
                               'bg_version': (p.get('background') or {}).get('version', 1),
                               'provider': provider, 'fallback': fb, 'auto_detect': auto_detect,
                               **({'model': p['settings'].get('marla_model') or providers.MARLA_MODEL}
                                  if provider == 'marla' else {}), 'status': 'queued', 'via': None, 'channel': None, 'error': None,
                               'detected': False, 'created': now(), 'ended': None})
            ids.append(eid)
        return ids
    return store.update(name, fn)[1]


def run_edit(name: str, edit_id: str) -> str:
    """Job body for one edit. Never sends an edit that is not "queued". Returns the final status."""
    d = store.pdir(name)
    ed = store.edit_dir(name, edit_id)

    def start(p):
        e = store.find_edit(p, edit_id)
        if e['status'] != 'queued':
            return None
        e['status'], e['started'] = 'running', now()
        return dict(e)
    e = store.update(name, start)[1]
    if e is None:
        return store.find_edit(store.read(name), edit_id)['status']

    req_path = ed / 'request.json'
    result, status, error, clai_error, albert_error = {}, 'failed', None, None, None
    t0 = time.time()
    timings = {}
    try:
        x0, y0, x1, y1 = e['box']
        sw, sh = e['send']
        crop = bg_image(name).crop((x0, y0, x1, y1))
        sent = crop if crop.size == (sw, sh) else crop.resize((sw, sh), Image.LANCZOS)
        sent_png = png_bytes(sent)
        (ed / 'sent.png').write_bytes(sent_png)
        refs = [(d / r).read_bytes() for r in e.get('ref_images', [])]
        provider = e.get('provider', 'nano')
        request = {'kind': 'edit', 'provider': provider,
                   'model': e.get('model') if provider == 'marla' else
                   'gpt (clai image)' if provider == 'astra' else providers.MODEL,
                   'prompt': e['prompt'], 'rect': e['rect'], 'box': e['box'], 'send': e['send'],
                   'square': e['square'], 'ref_images': e.get('ref_images', []), 'fallback': e['fallback']}
        via, ans = None, None
        prior = store.read_json(req_path) or {}
        if prior.get('attempts'):   # requeued after a restart: the ledger keeps every earlier attempt
            request['attempts'] = prior['attempts']
        if provider == 'marla':
            full = bg_image(name)
            scene_png = marla_scene_bytes(full)
            rx0, ry0, rx1, ry1 = e['rect']
            region = {'type': 'rect', 'x0': rx0, 'y0': ry0, 'x1': rx1, 'y1': ry1,
                      'description': e['prompt'] + MARLA_SUFFIX}
            if refs:
                region['ref_image'] = marla_ref_url(refs[0])
            request['marla_region'] = {k: v for k, v in region.items() if k != 'ref_image'}

            def on_job(job_id):
                request['attempts'][-1]['job_id'] = job_id
                store.write_json(req_path, request)
            t = time.time()
            try:
                # the Marla slot is taken BEFORE the ledger entry: waiting for a slot is never "sent"
                with providers.MARLA_SLOTS:
                    if e.get('resume_job'):   # after a restart: poll the accepted job again, nothing is resent
                        ans = providers.marla_wait(e['resume_job'])
                        store.record_outcome(req_path, request, 'ok (resumed)')
                    else:
                        ans = clai_with_retry(
                            lambda: providers.marla_fix(scene_png, region,
                                                        model=e.get('model') or providers.MARLA_MODEL,
                                                        on_job=on_job, take_slot=False),
                            req_path, request, f'{name}.{edit_id}',
                            _retry_note(name, lambda p: store.find_edit(p, edit_id)),
                            route='marla', retryable=marla_retryable)
                via = 'marla'
            finally:
                timings['marla_s'] = round(time.time() - t, 1)
            whole = Image.open(io.BytesIO(ans['png'])).convert('RGB')
            if whole.size != full.size:
                whole = whole.resize(full.size, Image.LANCZOS)
            whole.save(ed / 'answer_full.png', 'PNG')
            ans = {**ans, 'png': png_bytes(whole.crop((x0, y0, x1, y1)))}
        elif provider == 'astra':
            until = providers.astra_limit_until()
            if until:                                             # refused before anything is recorded or sent
                raise ProviderError(providers.astra_limit_text(until), 'invalid')
            t = time.time()
            try:
                with providers.ASTRA_SLOTS:   # slot first, then the ledger: waiting for a slot is never "sent"
                    store.record_attempt(req_path, request, 'astra')      # ledger BEFORE the paid request
                    ans = providers.astra_edit(e['prompt'], [ed / 'sent.png'] + [d / r for r in e.get('ref_images', [])],
                                               take_slot=False)
                via = 'astra'
            finally:
                timings['astra_s'] = round(time.time() - t, 1)
        else:
            t = time.time()
            try:
                ans = clai_with_retry(
                    lambda: providers.clai_edit(e['prompt'], [sent_png] + refs, square=e['square'],
                                                long_side=max(sw, sh)),
                    req_path, request, f'{name}.{edit_id}',
                    _retry_note(name, lambda p: store.find_edit(p, edit_id)))
                via = 'clai'
            except ProviderError as ce:
                clai_error = str(ce)
                if e['fallback'] != 'albert' or isinstance(ce, JobCancelled):
                    raise
            timings['clai_s'] = round(time.time() - t, 1)
        if via is None:
            store.record_attempt(req_path, request, 'albert')    # ledger BEFORE the paid request
            t = time.time()
            try:
                ans = providers.albert_image(e['prompt'], [sent_png] + refs, sw, sh)
                via = 'albert'
            except ProviderError as ae:
                albert_error = str(ae)
                raise
            finally:
                timings['albert_s'] = round(time.time() - t, 1)
        raw = Image.open(io.BytesIO(ans['png'])).convert('RGB')
        bw, bh = x1 - x0, y1 - y0
        answer = raw if raw.size == (bw, bh) else raw.resize((bw, bh), Image.LANCZOS)
        # GPT answers are not pixel-registered: fit the answer back onto the BG square (applied for astra; for nano
        # only measured, its squares come back in place)
        reg = {'applied': False}
        try:
            from . import register as R   # one registration for edits, detect, sheet and build (opus-detect's)
            aligned, reg = R.register(np.asarray(answer), np.asarray(crop), apply_fit=via == 'astra')
            if reg.get('applied'):
                answer = Image.fromarray(np.asarray(aligned).astype(np.uint8))
        except Exception as rex:  # registration is evidence, never a reason to lose a paid answer
            reg = {'applied': False, 'error': f'{type(rex).__name__}: {str(rex)[:200]}'}
        if raw.size != (bw, bh) or reg['applied']:
            raw.save(ed / 'answer_raw.png', 'PNG')
        answer.save(ed / 'answer.png', 'PNG')
        result = {'via': via, 'channel': ans.get('channel'), 'format': ans.get('format'),
                  'answer_size': list(raw.size), 'registration': reg,
                  **({'model': e.get('model'), 'job_id': ans.get('job_id')} if via == 'marla' else {})}
        status = 'done'
    except ProviderError as pe:
        status, error = ('unknown' if pe.kind == 'unknown' else 'failed'), str(pe)
    except Exception as ex:  # a bug or disk error must not leave the job hanging; never resend
        status = 'unknown' if store.was_sent(req_path) else 'failed'
        error = f'internal error: {type(ex).__name__}: {str(ex)[:200]}'
    timings['total_s'] = round(time.time() - t0, 1)
    result.update({'status': status, 'error': error, 'clai_error': clai_error, 'albert_error': albert_error,
                   'timings': timings})
    store.write_json(ed / 'result.json', result)

    def end(p):
        x = store.find_edit(p, edit_id)
        x.update(status=status, error=error, via=result.get('via'), channel=result.get('channel'),
                 clai_error=clai_error, ended=now())
        x.pop('resume_job', None)
        if result.get('registration'):
            x['registration'] = result['registration']
    store.update(name, end)
    return status


def requeue_unsent(name: str, edit_id: str) -> dict:
    """Put a failed edit that was NEVER sent (no attempt in its ledger) back to queued. Anything that may have been
    sent is refused: a retry of a sent edit is a new edit."""
    req = store.edit_dir(name, edit_id) / 'request.json'
    if store.was_sent(req):
        raise StoreError(f'edit {edit_id} was sent at least once: add a new edit instead', 409)

    def fn(p):
        e = store.find_edit(p, edit_id)
        if e['status'] != 'failed':
            raise StoreError(f'edit {edit_id} is {e["status"]}: only a failed, never-sent edit can be requeued', 409)
        e.update(status='queued', error=None, ended=None, requeued=now())
        return dict(e)
    return store.update(name, fn)[1]


def detect_and_store(name: str, edit_id: str, force: bool = False) -> list[dict]:
    """Run plc.detect.detect_edit for a finished edit inside the project lock (ids stay unique) and store the
    candidates. Already detected -> its candidates, unless force (then that edit's candidates are replaced)."""
    from . import detect  # owned by the detect worker; imported lazily

    def fn(p):
        e = store.find_edit(p, edit_id)
        if e['status'] != 'done':
            raise StoreError(f'edit {edit_id} is {e["status"]}, not done', 409)
        mine = [c for c in p.get('candidates', []) if c.get('edit') == edit_id]
        if e.get('detected') and not force:
            return mine
        p['candidates'] = [c for c in p.get('candidates', []) if c.get('edit') != edit_id]
        new = detect.detect_edit(store.pdir(name), p, e) or []
        taken = {c['id'] for c in p['candidates']}
        for c in new:
            c.setdefault('edit', edit_id)
            c.setdefault('state', 'new')
            c.setdefault('label', None)
            c.setdefault('group', None)
            c.setdefault('flags', [])
            if c['id'] in taken:
                raise RuntimeError(f'detect returned a duplicate candidate id {c["id"]}')
            taken.add(c['id'])
        p['candidates'].extend(new)
        e['detected'] = True
        e.pop('detect_error', None)
        return new
    return store.update(name, fn)[1]


def run_edit_job(name: str, edit_id: str, auto_detect: bool = True) -> str:
    """run_edit + automatic detect. A detect failure is recorded on the edit and never fails it."""
    status = run_edit(name, edit_id)
    if status == 'done' and auto_detect:
        try:
            detect_and_store(name, edit_id)
        except Exception as ex:
            msg = f'{type(ex).__name__}: {str(ex)[:300]}'

            def note(p):
                store.find_edit(p, edit_id)['detect_error'] = msg
            try:
                store.update(name, note)
            except Exception:
                pass
    return status


# ---- usage -----------------------------------------------------------------------------------------------------

def usage(name: str) -> dict:
    p = store.read(name)
    d = store.pdir(name)
    edits = p.get('edits', [])
    out = {'clai': 0, 'albert': 0, 'astra': 0, 'marla': 0, 'failed': 0, 'unknown': 0, 'pending': 0, 'total': len(edits)}
    fallbacks = 0
    paid = {'clai': 0, 'albert': 0, 'astra': 0, 'marla': 0}
    for e in edits:
        s = e.get('status')
        if s == 'done':
            out[e.get('via') or 'clai'] += 1
            fallbacks += e.get('via') == 'albert'
        elif s in ('failed', 'unknown'):
            out[s] += 1
        else:
            out['pending'] += 1
        req = store.read_json(d / 'edits' / e['id'] / 'request.json') or {}
        for a in req.get('attempts', []):
            paid[a['route']] = paid.get(a['route'], 0) + 1
    gens = [{'id': g['id'], 'status': g['status'], 'via': g.get('via')} for g in p.get('generations', [])]
    for g in p.get('generations', []):
        req = store.read_json(d / g['dir'] / 'request.json') or {}
        for a in req.get('attempts', []):
            paid[a['route']] = paid.get(a['route'], 0) + 1
    by_provider = {}
    for e in edits:
        pv = e.get('provider', 'nano')
        bp = by_provider.setdefault(pv, {'done': 0, 'failed': 0, 'unknown': 0, 'pending': 0})
        s = e.get('status')
        bp[s if s in ('done', 'failed', 'unknown') else 'pending'] += 1
    until = providers.astra_limit_until()
    marla_models = {}
    for e in edits:
        if e.get('via') == 'marla':
            marla_models[e.get('model') or providers.MARLA_MODEL] = marla_models.get(
                e.get('model') or providers.MARLA_MODEL, 0) + 1
    for g in p.get('generations', []):
        if g.get('via') == 'marla':
            k = (g.get('model') or providers.MARLA_MODEL) + ' (background)'
            marla_models[k] = marla_models.get(k, 0) + 1
    return {'project': name, 'edits': out, 'by_provider': by_provider, 'albert_after_clai_error': fallbacks,
            'marla_models': marla_models,
            'requests_sent': paid,
            'astra_limit_until': time.strftime('%H:%M', time.localtime(until)) if until else None,
            'generations': gens,
            'background': {k: (p.get('background') or {}).get(k) for k in ('source', 'via')}}
