"""Shared helpers for the API-side tests (store / providers / edits / jobqueue / server). No network."""
import io
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def bg_png(w=1536, h=2048, seed=0) -> bytes:
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:h, 0:w]
    a = np.stack([(xx * 255 // w), (yy * 255 // h), np.full_like(xx, 120)], -1).astype(np.uint8)
    a = np.clip(a.astype(int) + rng.integers(-8, 8, a.shape), 0, 255).astype(np.uint8)
    b = io.BytesIO()
    Image.fromarray(a).save(b, 'PNG')
    return b.getvalue()


def answer_from(sent_png: bytes, size=None, dot=True) -> bytes:
    """A fake provider answer: the sent crop (optionally rescaled) with a red square painted in the middle."""
    im = Image.open(io.BytesIO(sent_png)).convert('RGB')
    if size:
        im = im.resize(size)
    if dot:
        a = np.array(im)
        cy, cx = a.shape[0] // 2, a.shape[1] // 2
        a[cy - 40:cy + 40, cx - 40:cx + 40] = (220, 20, 20)
        im = Image.fromarray(a)
    b = io.BytesIO()
    im.save(b, 'PNG')
    return b.getvalue()


import pytest  # noqa: E402


@pytest.fixture(autouse=False)
def env(tmp_path, monkeypatch):
    """Projects under tmp, fake secrets, and provider URLs pointing at a closed local port: nothing paid can leave."""
    from plc import providers
    monkeypatch.setenv('PLC_PROJECTS', str(tmp_path / 'projects'))
    key = tmp_path / 'clai_key'
    key.write_text('test-key-' + 'k' * 30)
    tok = tmp_path / 'marla_token'
    tok.write_text('test-token-' + 't' * 30)
    monkeypatch.setattr(providers, 'CLAI_KEY_FILE', key)
    monkeypatch.setattr(providers, 'MARLA_TOKEN_FILE', tok)
    monkeypatch.setattr(providers, 'CLAI_URL', 'http://127.0.0.1:9')
    monkeypatch.setattr(providers, 'ALBERT_URL', 'http://127.0.0.1:9/albert')
    monkeypatch.setattr(providers, 'CLAI_BIN', str(tmp_path / 'no-clai-in-tests'))
    monkeypatch.setattr(providers, 'ASTRA_LIMIT_FILE', tmp_path / 'astra-limit')
    return tmp_path


class Fake:
    """Records provider calls; `clai`/`albert` are behaviours: a callable, an exception, or 'ok'."""

    def __init__(self, monkeypatch, clai='ok', albert='ok', answer_size=None, on_call=None, astra='ok'):
        from plc import providers
        self.calls = []
        self.clai, self.albert, self.answer_size, self.on_call = clai, albert, answer_size, on_call
        self.astra = astra

        def run(route, behaviour, images, extra):
            self.calls.append((route, extra))
            if self.on_call:
                self.on_call(route)
            if isinstance(behaviour, Exception):
                raise behaviour
            if callable(behaviour):
                return behaviour(images, extra)
            png = answer_from(images[0], self.answer_size) if images else bg_png(1536, 2048, seed=3)
            return {'png': png, 'format': 'png', 'channel': f'{route}-test'}

        monkeypatch.setattr(providers, 'clai_edit',
                            lambda prompt, images, **kw: run('clai', self.clai, images, {'prompt': prompt, **kw}))
        monkeypatch.setattr(providers, 'clai_generate',
                            lambda prompt, **kw: run('clai', self.clai, [], {'prompt': prompt, **kw}))
        monkeypatch.setattr(providers, 'astra_edit',
                            lambda prompt, paths, **kw: run('astra', self.astra,
                                                            [open(p, 'rb').read() for p in paths],
                                                            {'prompt': prompt, 'paths': [str(p) for p in paths]}))
        monkeypatch.setattr(providers, 'albert_image',
                            lambda prompt, images, w, h, **kw: run('albert', self.albert, images,
                                                                   {'prompt': prompt, 'w': w, 'h': h}))

    def routes(self):
        return [c[0] for c in self.calls]
