"""Pure HTTP calls to the image providers (no project knowledge).

- Clai team pool, Nano Banana Pro (`gemini-3-pro-image`), ported from Odin bridge/clai-edit.mjs and the `clai image`
  CLI: POST {CLAI_URL}/v1/images/edits (input images) and /v1/images/generations (text-to-image), JSON body, Bearer =
  ~/.config/claiface/key, answer data[0].b64_json, account channel in header x-claiface-image-channel.
- Albert image generator (fallback), ported from Odin bridge/image-api.mjs: POST /api/tools/image-generator,
  Bearer = ~/.config/marla/token, answer image_base64.

Secrets are read from disk per call and never logged, printed, written or put in an error message.
Every failure raises ProviderError with kind:
  "failed"  - a known outcome without an image (HTTP error, no image in the answer)
  "unknown" - the request may have reached the provider but no answer came back (timeout, broken connection)
  "invalid" - nothing was sent (no key, bad input)
"""
from __future__ import annotations

import base64
import io
import json
import os
import re
import threading
from pathlib import Path

import requests
from PIL import Image

CLAI_URL = os.environ.get('PLC_CLAI_URL', 'https://63.189.88.172')
ALBERT_URL = os.environ.get('PLC_ALBERT_URL', 'https://albert.fugo.com.tr/api/tools/image-generator')
CLAI_KEY_FILE = Path('~/.config/claiface/key').expanduser()
MARLA_TOKEN_FILE = Path('~/.config/marla/token').expanduser()
MODEL = 'gemini-3-pro-image'
CLAI_EDIT_MAX_WAIT_S = 180                      # Odin: Clai answers within max_wait or says why not
CLAI_EDIT_TIMEOUT_S = CLAI_EDIT_MAX_WAIT_S + 30  # ends a silent connection
CLAI_GENERATE_TIMEOUT_S = 640                   # same cap as `clai image` for Nano Banana
ALBERT_TIMEOUT_S = 600
MAX_PIXELS = 17_000_000
RATIOS = ('1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9')
SIZES = ('1K', '2K', '4K')
# Albert wants pixel sizes; for a generated BG (fallback only) the ratio maps like Odin's imageSettings
ALBERT_DIMENSIONS = {'1:1': (2048, 2048), '3:4': (1536, 2048), '4:3': (2048, 1536), '9:16': (1152, 2048),
                     '16:9': (2048, 1152), '2:3': (1344, 2016), '3:2': (2016, 1344)}


class _InFlight:
    """How many paid requests are on the wire right now (a restart waits for 0)."""

    def __init__(self):
        self.n = 0
        self._lock = threading.Lock()

    def __enter__(self):
        with self._lock:
            self.n += 1

    def __exit__(self, *exc):
        with self._lock:
            self.n -= 1


IN_FLIGHT = _InFlight()


class ProviderError(Exception):
    def __init__(self, message: str, kind: str = 'failed', status: int | None = None):
        super().__init__(message)
        self.kind = kind
        self.status = status


def excerpt(text) -> str:
    """Short, credential-free excerpt of an upstream answer (Odin upstreamExcerpt)."""
    s = str(text or '')[:400]
    s = re.sub(r'Bearer\s+\S+', 'Bearer [hidden]', s, flags=re.I)
    s = re.sub(r'\b[A-Za-z0-9_-]{32,}\b', '[hidden]', s)
    return re.sub(r'\s+', ' ', s).strip()


def _secret(path: Path, what: str) -> str:
    try:
        v = path.read_text().strip()
    except OSError:
        v = ''
    if not re.fullmatch(r'[\x21-\x7e]{16,400}', v):
        raise ProviderError(f'{what} not found on this Mac (run clai login / connect Albert)', 'invalid')
    return v


def to_png(data: bytes) -> bytes:
    """Validate an image answer and return it as PNG bytes (RGB)."""
    try:
        im = Image.open(io.BytesIO(data))
        if im.width * im.height > MAX_PIXELS:
            raise ValueError('too large')
        im.load()
        out = io.BytesIO()
        im.convert('RGB').save(out, 'PNG')
        return out.getvalue()
    except Exception:
        raise ProviderError('the provider did not return a valid image', 'failed')


def data_url(png: bytes, mime: str = 'image/png') -> str:
    return f'data:{mime};base64,' + base64.b64encode(png).decode()


def _clai_post(route: str, body: dict, timeout: float, session=None) -> dict:
    key = _secret(CLAI_KEY_FILE, 'Clai key (~/.config/claiface/key)')
    http = session or requests
    try:
        with IN_FLIGHT:
            r = http.post(CLAI_URL.rstrip('/') + route, json=body, timeout=timeout, allow_redirects=False,
                          headers={'Authorization': 'Bearer ' + key})
    except requests.Timeout:
        raise ProviderError(f'Clai did not answer within {int(timeout)} s', 'unknown')
    except requests.RequestException as e:
        raise ProviderError(f'Clai connection failed ({type(e).__name__})', 'unknown')
    try:
        j = r.json()
    except ValueError:
        j = {}
    if r.status_code != 200:
        err = j.get('error') if isinstance(j.get('error'), dict) else {}
        what = ' '.join(str(x) for x in (err.get('code') or err.get('type'), err.get('message')) if x)
        raise ProviderError(f'Clai HTTP {r.status_code}' + (': ' + excerpt(what) if what else ''), 'failed',
                            r.status_code)
    b64 = ((j.get('data') or [{}])[0] or {}).get('b64_json')
    if not isinstance(b64, str) or not b64:
        raise ProviderError('Clai returned no image', 'failed', 200)
    try:
        raw = base64.b64decode(b64)
    except Exception:
        raise ProviderError('Clai returned no valid image', 'failed', 200)
    return {'png': to_png(raw), 'format': j.get('output_format') or 'unknown',
            'channel': r.headers.get('x-claiface-image-channel', '')}


def clai_edit(prompt: str, images: list[bytes], *, square: bool, long_side: int, aspect_ratio: str | None = None,
              timeout: float = CLAI_EDIT_TIMEOUT_S, session=None) -> dict:
    """Nano Banana Pro edit through the Clai pool. images[0] = the crop, the rest = reference images (PNG bytes).
    Returns {png, format, channel}."""
    if not images:
        raise ProviderError('no input image', 'invalid')
    body = {'model': MODEL, 'prompt': prompt, 'max_wait': CLAI_EDIT_MAX_WAIT_S,
            'image_size': '2K' if long_side > 1024 else '1K',
            'images': [{'image_url': data_url(b)} for b in images]}
    if square:
        body['aspect_ratio'] = '1:1'   # any other shape leaves the ratio to the model (Odin)
    elif aspect_ratio:
        body['aspect_ratio'] = aspect_ratio
    return _clai_post('/v1/images/edits', body, timeout, session)


def clai_generate(prompt: str, *, ratio: str = '3:4', size: str = '2K',
                  timeout: float = CLAI_GENERATE_TIMEOUT_S, session=None) -> dict:
    """Nano Banana Pro text-to-image through the Clai pool (/v1/images/generations). Returns {png, format, channel}."""
    if ratio not in RATIOS:
        raise ProviderError(f'ratio must be one of {RATIOS}', 'invalid')
    if size not in SIZES:
        raise ProviderError(f'size must be one of {SIZES}', 'invalid')
    body = {'model': MODEL, 'prompt': prompt, 'aspect_ratio': ratio, 'image_size': size}
    return _clai_post('/v1/images/generations', body, timeout, session)


def albert_image(prompt: str, images: list[bytes], width: int, height: int, *, model: str = MODEL,
                 quality: str | None = None, timeout: float = ALBERT_TIMEOUT_S, session=None) -> dict:
    """Albert image generator (fallback route). images = input images (PNG bytes), may be empty.
    Returns {png, format, channel}."""
    if not all(isinstance(v, int) and 16 <= v <= 2048 for v in (width, height)):
        raise ProviderError('Albert size must be 16-2048 px', 'invalid')
    token = _secret(MARLA_TOKEN_FILE, 'Albert token (~/.config/marla/token)')
    body = {'model': model, 'prompt': prompt, 'width': width, 'height': height,
            'input_images': [base64.b64encode(b).decode() for b in images], 'transparent_background': False}
    q = quality or GPT_QUALITY.get(model) or ('medium' if model.startswith('gpt-image-') else None)
    if q:
        body['quality'] = q
    http = session or requests
    try:
        with IN_FLIGHT:
            r = http.post(ALBERT_URL, json=body, timeout=timeout, allow_redirects=False,
                          headers={'Authorization': 'Bearer ' + token})
    except requests.Timeout:
        raise ProviderError(f'Albert did not answer within {int(timeout)} s', 'unknown')
    except requests.RequestException as e:
        raise ProviderError(f'Albert connection failed ({type(e).__name__})', 'unknown')
    if not r.ok:
        detail = ('API key or model access refused' if r.status_code in (401, 403) else
                  'quota or rate limit' if r.status_code == 429 else
                  'model or route not found' if r.status_code == 404 else 'image request failed')
        raise ProviderError(f'Albert HTTP {r.status_code}: {detail}', 'failed', r.status_code)
    try:
        j = r.json()
    except ValueError:
        raise ProviderError('Albert answer unreadable', 'failed', r.status_code)
    enc = j.get('image_base64')
    if not isinstance(enc, str) or not enc:
        raise ProviderError('Albert returned no image', 'failed', r.status_code)
    try:
        raw = base64.b64decode(enc)
    except Exception:
        raise ProviderError('Albert returned no valid image', 'failed', r.status_code)
    return {'png': to_png(raw), 'format': 'png', 'channel': ''}


# ---- Astra: GPT image through the Clai subscription (`clai image --model gpt`) -----------------------------------
# Ported from the sister team's scripts/rs_astra.sh: 1:1, the square sent as it is, extra images as more --input-path,
# at most 3 asks at a time, and every ask stops for 20 min once an answer says usage_limit (the flag file is shared by
# every process on this Mac, so a restart keeps it). The CLI reads the Clai key itself; nothing secret is in argv.
import subprocess  # noqa: E402
import tempfile  # noqa: E402
import threading  # noqa: E402
import time as _time  # noqa: E402

CLAI_BIN = os.environ.get('PLC_CLAI_BIN', 'clai')
class Slots:
    """A resizable concurrency limit (context manager): the server can change it without a restart."""

    def __init__(self, limit: int):
        self._cond = threading.Condition()
        self.limit = max(1, int(limit))
        self.busy = 0

    def set_limit(self, n: int) -> None:
        with self._cond:
            self.limit = max(1, int(n))
            self._cond.notify_all()

    def __enter__(self):
        with self._cond:
            while self.busy >= self.limit:
                self._cond.wait()
            self.busy += 1
        return self

    def __exit__(self, *exc):
        with self._cond:
            self.busy -= 1
            self._cond.notify_all()


ASTRA_SLOTS = Slots(int(os.environ.get('PLC_ASTRA_CONCURRENCY', '3') or 3))   # Astra asks at once on this Mac
ASTRA_LIMIT_FILE = Path(os.environ.get('PLC_ASTRA_LIMIT_FILE', '/tmp/plc-astra-limit'))
ASTRA_LIMIT_S = 20 * 60
ASTRA_TIMEOUT_S = 420           # the CLI's own curl cap for GPT is 330 s
ASTRA_MAX_PROMPT = 3900         # the CLI caps prompts at 4000, the ratio phrase is appended


def astra_limit_until() -> float | None:
    """Epoch seconds until which Astra asks are refused, or None."""
    try:
        until = ASTRA_LIMIT_FILE.stat().st_mtime + ASTRA_LIMIT_S
    except OSError:
        return None
    if until <= _time.time():
        try:
            ASTRA_LIMIT_FILE.unlink()
        except OSError:
            pass
        return None
    return until


def astra_limit_text(until: float) -> str:
    return ('Astra usage limit reached; Astra asks are refused until '
            + _time.strftime('%H:%M', _time.localtime(until)) + ' (20 min after the limit answer), nothing sent')


def _astra_set_limit():
    ASTRA_LIMIT_FILE.touch()
    os.utime(ASTRA_LIMIT_FILE, None)


def _cli_verdict(text: str) -> str:
    """clai prints progress lines; its own verdict is the Turkish line it starts (Odin claiImageError)."""
    lines = [ln.strip() for ln in str(text or '').splitlines() if ln.strip()]
    for ln in lines:
        if re.match(r'^(Görüntü alınamadı|Sunucuya ulaşılamadı|Yanıtta görsel yok|İstek hazırlanamadı|Girdi|Prompt|'
                    r'ClaiFace anahtarı|Dosya|Klasör|Görsel)', ln):
            return ln
    return lines[-1] if lines else ''


ASTRA_RATIOS = ('1:1', '3:4', '4:3', '9:16', '16:9')


class _NoSlot:
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def astra_edit(prompt: str, input_paths: list, *, transparent: bool = False, timeout: float = ASTRA_TIMEOUT_S,
               ratio: str = '1:1', run=subprocess.run, take_slot: bool = True) -> dict:
    """One Astra edit: `clai image --model gpt --ratio 1:1 --input-path <square> [--input-path <ref> ...] <prompt>`.
    input_paths[0] = the square. Returns {png, format, channel}; raises ProviderError like the other routes, with
    `usage_limit=True` when the answer was Astra's usage limit (the 20-min stop is then set)."""
    if not input_paths:
        raise ProviderError('no input image', 'invalid')
    if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > ASTRA_MAX_PROMPT:
        raise ProviderError(f'Astra prompt required, at most {ASTRA_MAX_PROMPT} characters', 'invalid')
    until = astra_limit_until()
    if until:
        raise ProviderError(astra_limit_text(until), 'invalid')
    # take_slot=False: the caller already holds an ASTRA_SLOTS slot (taken BEFORE its ledger entry, so a job that
    # only waits for a slot is never recorded as sent)
    with (ASTRA_SLOTS if take_slot else _NoSlot()), tempfile.TemporaryDirectory(prefix='plc-astra-') as tmp:
        out = Path(tmp) / 'answer.png'
        if ratio not in ASTRA_RATIOS:
            raise ProviderError(f'Astra ratio must be one of {ASTRA_RATIOS}', 'invalid')
        args = [CLAI_BIN, 'image', '--model', 'gpt', '--ratio', ratio]
        for p in input_paths:
            args += ['--input-path', str(p)]
        args += ['--output-path', str(out), '--force'] + (['--transparent'] if transparent else []) + ['--prompt', prompt]
        try:
            with IN_FLIGHT:
                r = run(args, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=timeout)
        except subprocess.TimeoutExpired:
            raise ProviderError(f'Astra did not answer within {int(timeout)} s', 'unknown')
        except OSError as e:
            raise ProviderError(f'clai could not be started ({type(e).__name__})', 'invalid')
        text = (r.stderr or '') + '\n' + (r.stdout or '')
        if r.returncode == 0 and out.is_file() and out.stat().st_size:
            return {'png': to_png(out.read_bytes()), 'format': 'png', 'channel': 'astra'}
        verdict = excerpt(_cli_verdict(text)) or f'clai image exited {r.returncode}'
        if re.search(r'usage_limit|usage limit', text, re.I):
            _astra_set_limit()
            e = ProviderError(f'Astra usage limit: {verdict}', 'failed', 429)
            e.usage_limit = True
            raise e
        status = int(m.group(1)) if (m := re.search(r'HTTP (\d{3})', verdict)) else None
        if r.returncode == 2 or verdict.startswith('İstek hazırlanamadı'):
            kind = 'invalid'
        elif re.search(r'ulaşılamadı|zaman aşımı', verdict, re.I):
            kind = 'unknown'
        else:
            kind = 'failed'
        raise ProviderError(f'Astra: {verdict}', kind, status)


# ---- vision (Claude through the Clai pool, Messages API) ----------------------------------------------------------
VISION_MODEL = os.environ.get('PLC_VISION_MODEL', 'claude-sonnet-5-5')
VISION_TIMEOUT_S = 300


def claude_vision(images: list[bytes], prompt: str, *, model: str = VISION_MODEL, effort: str = 'medium',
                  max_tokens: int = 8000, timeout: float = VISION_TIMEOUT_S, client=None) -> dict:
    """One fresh, stateless Messages call with JPEG/PNG images + a text prompt (no system prompt, no history).
    Returns {text, model, stop_reason, usage}. The Clai key is read here and only given to the SDK client."""
    import anthropic
    if client is None:
        key = _secret(CLAI_KEY_FILE, 'Clai key (~/.config/claiface/key)')
        client = anthropic.Anthropic(base_url=CLAI_URL.rstrip('/'), auth_token=key, max_retries=1, timeout=timeout)
    content = []
    for b in images:
        mime = 'image/jpeg' if b[:2] == b'\xff\xd8' else 'image/png'
        content.append({'type': 'image', 'source': {'type': 'base64', 'media_type': mime,
                                                    'data': base64.standard_b64encode(b).decode()}})
    content.append({'type': 'text', 'text': prompt})
    try:
        # the installed SDK predates output_config as a named argument: it goes in the body as is
        r = client.messages.create(model=model, max_tokens=max_tokens, messages=[{'role': 'user', 'content': content}],
                                   extra_body={'output_config': {'effort': effort}})
    except anthropic.APITimeoutError:
        raise ProviderError(f'vision model did not answer within {int(timeout)} s', 'unknown')
    except anthropic.APIConnectionError as e:
        raise ProviderError(f'vision call: connection failed ({type(e).__name__})', 'unknown')
    except anthropic.APIStatusError as e:
        raise ProviderError(f'vision call HTTP {e.status_code}: {excerpt(getattr(e, "message", ""))[:200]}', 'failed',
                            e.status_code)
    if r.stop_reason == 'refusal':
        raise ProviderError('vision model declined the request (refusal)', 'failed')
    text = ''.join(b.text for b in r.content if getattr(b, 'type', '') == 'text')
    usage = getattr(r, 'usage', None)
    return {'text': text, 'model': getattr(r, 'model', model), 'stop_reason': r.stop_reason,
            'usage': {'input_tokens': getattr(usage, 'input_tokens', None),
                      'output_tokens': getattr(usage, 'output_tokens', None)}}


# ---- Marla partner fix (Albert /api/marla/v1), ported from Odin bridge/marla.mjs ---------------------------------
# One region per job: POST /edits/fix (multipart: model, regions=[{type:'rect', x0..y1, description, ref_image?}],
# image=the whole scene) -> job_id; GET /jobs/<id> until done/failed; GET /jobs/<id>/result = the whole scene PNG.
# Token ~/.config/marla/token (same as Albert). At most 3 Marla jobs at a time on this Mac. A submit is never sent
# twice by itself; on_job(job_id) lets the caller record the accepted job in its ledger.
MARLA_URL = os.environ.get('PLC_MARLA_URL', 'https://albert.fugo.com.tr/api/marla/v1')
MARLA_MODEL = 'gpt-image-2.5-sunburst'
MARLA_SLOTS = Slots(3)
MARLA_POLL_S = 3
MARLA_WAIT_S = 30 * 60
GPT_QUALITY = {'gpt-image-2.5-sunburst': 'high'}   # Odin: Sunburst renders at high quality


def _marla_reason(r) -> str:
    try:
        j = r.json()
        v = j.get('error', {}).get('message') if isinstance(j.get('error'), dict) else (
            j.get('error') or j.get('detail') or j.get('message'))
        return excerpt(v if isinstance(v, str) else json.dumps(v))[:300]
    except Exception:
        return excerpt(getattr(r, 'text', ''))[:300]


def marla_fix(scene_png: bytes, region: dict, *, model: str = MARLA_MODEL, on_job=None, session=None,
              sleep=None, wait_s: float = MARLA_WAIT_S, take_slot: bool = True) -> dict:
    """Returns {png (the whole scene), job_id, format, channel}. Raises ProviderError: a non-2xx submit = 'failed'
    with its status (nothing was accepted); a lost submit connection = 'unknown'; a failed job = 'failed' (no
    status); a job that does not finish in wait_s = 'unknown' (the job id is in the ledger)."""
    if not re.fullmatch(r'[\w.:-]{1,100}', model or ''):
        raise ProviderError('Marla model name invalid', 'invalid')
    token = _secret(MARLA_TOKEN_FILE, 'Marla/Albert token (~/.config/marla/token)')
    http = session or requests
    sleep = sleep or _time.sleep
    H = {'Authorization': 'Bearer ' + token}
    base = MARLA_URL.rstrip('/')
    with (MARLA_SLOTS if take_slot else _NoSlot()):   # take_slot=False: the caller holds one (taken before its ledger)
        # Marla's multipart limit is 1 MB.  Large watercolor PNGs commonly exceed
        # it, so callers may provide a quality-compressed JPEG scene.  Keep the
        # content type aligned with the bytes; the provider accepts both formats.
        if scene_png[:2] == b'\xff\xd8':
            upload = ('scene.jpg', scene_png, 'image/jpeg')
        else:
            upload = ('scene.png', scene_png, 'image/png')
        try:
            with IN_FLIGHT:
                r = http.post(base + '/edits/fix', headers=H, timeout=180, allow_redirects=False,
                          data={'model': model, 'regions': json.dumps([region])},
                          files={'image': upload})
        except requests.Timeout:
            raise ProviderError('Marla submit did not answer within 180 s', 'unknown')
        except requests.RequestException as e:
            raise ProviderError(f'Marla submit connection failed ({type(e).__name__})', 'unknown')
        if not r.ok:
            raise ProviderError(f'Marla HTTP {r.status_code}: {_marla_reason(r)}', 'failed', r.status_code)
        try:
            job = r.json().get('job_id')
        except ValueError:
            job = None
        if not isinstance(job, str) or not re.fullmatch(r'[\w-]+', job):
            raise ProviderError('Marla returned no job id; not resent', 'unknown')
        if on_job:
            on_job(job)
        return marla_wait(job, session=session, sleep=sleep, wait_s=wait_s, _token=token)


def marla_wait(job: str, *, session=None, sleep=None, wait_s: float = MARLA_WAIT_S, _token: str | None = None) -> dict:
    """Poll an accepted Marla job to its end and download the result (also used to RESUME a job after a server
    restart: nothing is submitted again). Returns {png, job_id, format, channel}."""
    if not re.fullmatch(r'[\w-]+', job or ''):
        raise ProviderError('Marla job id invalid', 'invalid')
    token = _token or _secret(MARLA_TOKEN_FILE, 'Marla/Albert token (~/.config/marla/token)')
    http = session or requests
    sleep = sleep or _time.sleep
    H = {'Authorization': 'Bearer ' + token}
    base = MARLA_URL.rstrip('/')
    t0 = _time.time()
    while _time.time() - t0 < wait_s:
        try:
            st_r = http.get(f'{base}/jobs/{job}', headers=H, timeout=60, allow_redirects=False)
            st = st_r.json() if st_r.ok else {}
        except (requests.RequestException, ValueError):
            st = {}
        status = st.get('status')
        if status == 'failed':
            raise ProviderError(f'Marla job {job} failed: {excerpt(st.get("error"))[:300]}', 'failed')
        if status == 'done':
            try:
                res = http.get(f'{base}/jobs/{job}/result', headers=H, timeout=120, allow_redirects=False)
            except requests.RequestException as e:
                raise ProviderError(f'Marla result download failed ({type(e).__name__}); job {job}', 'unknown')
            if not res.ok:
                raise ProviderError(f'Marla result HTTP {res.status_code}; job {job}', 'unknown', res.status_code)
            return {'png': to_png(res.content), 'job_id': job, 'format': 'png', 'channel': 'marla'}
        sleep(MARLA_POLL_S)
    raise ProviderError(f'Marla job {job} did not finish in {int(wait_s)} s; not resent', 'unknown')
