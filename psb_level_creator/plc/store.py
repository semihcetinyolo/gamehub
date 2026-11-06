"""Project directories, project.json (locked read/modify/write) and the paid-request ledger.

project.json is the single state file of a project and only this module writes it. Every write goes through
`update()`, which holds the project's lock for the whole read -> modify -> write, and replaces the file atomically,
so readers never see half a file and need no lock.

Ledger rule (docs/spec.md): a paid request is recorded in edits/<id>/request.json BEFORE it is sent. After a crash or
restart, an edit that was recorded but has no outcome becomes "unknown" and is never resent; a retry is a new edit.
"""
from __future__ import annotations

import copy
import datetime as _dt
import fcntl
import json
import os
import re
import threading
import time
from contextlib import contextmanager
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NAME_RE = re.compile(r'^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$')
DEFAULT_SETTINGS = {'provider': 'nano', 'fallback': 'albert', 'concurrency': 3}
FALLBACKS = ('albert', 'none')
PROVIDERS = ('nano', 'astra', 'marla')   # nano: Clai Nano Banana Pro -> Albert; astra: GPT image via
# `clai image --model gpt`; marla: Albert's Marla partner fix (edits) / image generator (BG) with settings.marla_model
FINAL = ('done', 'failed', 'unknown')

_locks: dict[str, threading.RLock] = {}
_locks_guard = threading.Lock()


class StoreError(Exception):
    """A request the store refuses; `status` is the HTTP status the server answers with."""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def now() -> str:
    return _dt.datetime.now().astimezone().isoformat(timespec='seconds')


def projects_root() -> Path:
    """Read per call so tests (and PLC_PROJECTS) can point it elsewhere."""
    return Path(os.environ.get('PLC_PROJECTS') or ROOT / 'projects').resolve()


def check_name(name: str) -> str:
    if not isinstance(name, str) or not NAME_RE.match(name):
        raise StoreError('project name: 1-64 letters, digits, _ or -, starting with a letter or digit')
    return name


def pdir(name: str) -> Path:
    return projects_root() / check_name(name)


def exists(name: str) -> bool:
    return (pdir(name) / 'project.json').is_file()


def _lock(name: str) -> threading.RLock:
    with _locks_guard:
        return _locks.setdefault(name, threading.RLock())


@contextmanager
def locked(name: str):
    """Thread lock + file lock (a second process, e.g. a test or tool, cannot interleave writes)."""
    with _lock(name):
        d = pdir(name)
        d.mkdir(parents=True, exist_ok=True)
        with open(d / '.lock', 'a') as fh:
            fcntl.flock(fh, fcntl.LOCK_EX)
            try:
                yield d
            finally:
                fcntl.flock(fh, fcntl.LOCK_UN)


def write_json(path: Path, data) -> None:
    """Atomic JSON write (tmp file + rename)."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f'.{path.name}.{os.getpid()}.{threading.get_ident()}.tmp')
    with open(tmp, 'w') as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)
        fh.write('\n')
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, path)


def read_json(path: Path, default=None):
    try:
        with open(path) as fh:
            return json.load(fh)
    except FileNotFoundError:
        return default


def read(name: str) -> dict:
    p = read_json(pdir(name) / 'project.json')
    if p is None:
        raise StoreError(f'no project {name!r}', 404)
    return p


def list_projects() -> list[dict]:
    root = projects_root()
    out = []
    if root.is_dir():
        for d in sorted(root.iterdir()):
            if not d.is_dir() or not NAME_RE.match(d.name):   # .DS_Store and other stray entries
                continue
            try:
                p = read_json(d / 'project.json')
            except (OSError, ValueError):
                continue
            if p:
                edits = p.get('edits', [])
                out.append({'name': p['name'], 'created': p.get('created'), 'canvas': p.get('canvas'),
                            'edits': len(edits), 'candidates': len(p.get('candidates', [])),
                            'builds': len(p.get('builds', []))})
    return out


def check_settings(settings: dict | None) -> dict:
    out = {}
    for k, v in (settings or {}).items():
        if v is None:
            continue
        if k == 'fallback':
            if v not in FALLBACKS:
                raise StoreError(f'fallback must be one of {FALLBACKS}')
        elif k == 'provider':
            if v not in PROVIDERS:
                raise StoreError(f'provider must be one of {PROVIDERS}')
        elif k == 'marla_model':
            if not isinstance(v, str) or not re.fullmatch(r'[\w.:-]{1,100}', v):
                raise StoreError('marla_model: a model id like gpt-image-2.5-sunburst')
        elif k == 'concurrency':
            if not isinstance(v, int) or isinstance(v, bool) or not 1 <= v <= 8:
                raise StoreError('concurrency must be an integer 1-8')
        else:
            raise StoreError(f'unknown setting {k!r}')
        out[k] = v
    return out


def create(name: str, settings: dict | None = None) -> dict:
    check_name(name)
    s = {**DEFAULT_SETTINGS, **check_settings(settings)}
    with locked(name) as d:
        if (d / 'project.json').exists():
            raise StoreError(f'project {name!r} already exists', 409)
        p = {'name': name, 'created': now(), 'canvas': None, 'settings': s, 'background': None,
             'generations': [], 'edits': [], 'candidates': [], 'builds': []}
        write_json(d / 'project.json', p)
        return p


def update(name: str, fn):
    """Locked read -> fn(project) -> write. fn mutates the dict in place or returns a new project dict.

    Returns (project, extra) where extra is whatever fn returned when it was not a project dict."""
    with locked(name) as d:
        p = read(name)
        before = copy.deepcopy(p)
        res = fn(p)
        if isinstance(res, dict) and res.get('name') == name and 'edits' in res:
            p, extra = res, None
        else:
            extra = res
        if p != before:
            write_json(d / 'project.json', p)
        return p, extra


def find_edit(project: dict, edit_id: str) -> dict:
    for e in project.get('edits', []):
        if e['id'] == edit_id:
            return e
    raise StoreError(f'no edit {edit_id!r}', 404)


def next_edit_id(project: dict) -> str:
    n = max((int(e['id'][1:]) for e in project.get('edits', []) if re.fullmatch(r'e\d+', e['id'])), default=0)
    return f'e{n + 1:03d}'


def edit_dir(name: str, edit_id: str) -> Path:
    if not re.fullmatch(r'e\d{3,}', edit_id or ''):
        raise StoreError(f'bad edit id {edit_id!r}')
    return pdir(name) / 'edits' / edit_id


# ---- ledger --------------------------------------------------------------------------------------------------

HOLD_WAITERS: set = set()
HOLD = threading.Event()   # set while the server drains for a restart: no new paid request starts


def record_attempt(path: Path, request: dict, route: str) -> dict:
    """Add one attempt (the route about to be paid for) to request.json and write it BEFORE the request leaves.

    The very existence of request.json with attempts means: something may have been sent.
    While the server drains (HOLD), this waits BEFORE recording, so a job held here restarts as never-sent."""
    while HOLD.is_set():
        HOLD_WAITERS.add(threading.get_ident())
        time.sleep(1)
    HOLD_WAITERS.discard(threading.get_ident())
    request.setdefault('attempts', []).append({'route': route, 'at': now()})
    write_json(path, request)
    return request


def record_outcome(path: Path, request: dict, outcome: str) -> None:
    """The definite outcome of the last attempt (an answer, or an error answer), in the same request dict that
    record_attempt writes. An attempt without an outcome may still be out there: after a crash it counts as unknown
    and is never resent."""
    if request.get('attempts'):
        request['attempts'][-1].update(outcome=str(outcome)[:300], ended=now())
        write_json(path, request)


def was_sent(path: Path) -> bool:
    r = read_json(path)
    return bool(r and r.get('attempts'))


def in_flight(path: Path) -> bool:
    """True when the last recorded attempt has no definite outcome (it may have reached the provider)."""
    r = read_json(path)
    return bool(r and r.get('attempts') and 'outcome' not in r['attempts'][-1])


def _restart_plan(req: Path) -> tuple[str, str | None]:
    """What a restart does with a queued/running job, from its ledger:
    ('requeue', None)    never sent, or the last attempt got a definite error answer (the retry rule resends those);
    ('resume', job_id)   a Marla job was accepted and is still being polled: poll it again, nothing is resent;
    ('unknown', None)    a request may be out with no answer (or an answer was received but not stored): never resent."""
    r = read_json(req) or {}
    att = r.get('attempts') or []
    if not att:
        return 'requeue', None
    last = att[-1]
    outcome = last.get('outcome')
    if outcome is None:
        if last.get('route') == 'marla' and last.get('job_id'):
            return 'resume', last['job_id']
        return 'unknown', None
    if str(outcome).startswith('error'):
        return 'requeue', None
    return 'unknown', None


def recover(name: str, plan: list | None = None) -> dict:
    """Run at server start: no job survives a restart, but most come back. Queued edits/generations/extends and those
    between retries are put back to "queued" (listed in `plan` for the server to resubmit); a running Marla job is
    resumed by its job id; only a request that may be out without an answer becomes "unknown" (never resent).
    Returns counts."""
    d = pdir(name)
    counts = {'requeued': 0, 'resumed': 0, 'unknown': 0}

    def fix(p):
        for e in p.get('edits', []):
            if e.get('status') in ('queued', 'running'):
                what, job = _restart_plan(d / 'edits' / e['id'] / 'request.json')
                if what == 'unknown':
                    e.update(status='unknown', ended=now(),
                             error='server restarted while the request was out; outcome unknown, not resent')
                    counts['unknown'] += 1
                    continue
                e.update(status='queued', restarted=now())
                if what == 'resume':
                    e['resume_job'] = job
                counts['requeued' if what == 'requeue' else 'resumed'] += 1
                if plan is not None:
                    plan.append(('edit', name, e['id']))
        for kind, coll in (('generation', 'generations'), ('extend', 'extends')):
            for g in p.get(coll, []):
                if g.get('status') in ('queued', 'running'):
                    what, _ = _restart_plan(d / g['dir'] / 'request.json')
                    if what != 'requeue':
                        g.update(status='unknown', ended=now(),
                                 error='server restarted while the request was out; outcome unknown, not resent')
                        counts['unknown'] += 1
                        continue
                    g.update(status='queued', restarted=now())
                    counts['requeued'] += 1
                    if plan is not None:
                        plan.append((kind, name, g['id']))

    update(name, fix)
    return counts


def recover_all(plan: list | None = None) -> dict:
    out = {}
    for item in list_projects():
        try:
            c = recover(item['name'], plan)
        except Exception as e:  # one broken project must not stop the server
            out[item['name']] = {'error': f'{type(e).__name__}: {str(e)[:200]}'}
            continue
        if any(c.values()):
            out[item['name']] = c
    return out


def bg_file_for_edit(pdir: Path, project: dict, edit: dict) -> Path:
    """The BG version an edit was generated from (background/extend makes new versions; old edits keep theirs, so a
    tone fit or a diff against their own BG does not drift). Edits without a stamp predate any extend: version 1."""
    versions = (project.get('background') or {}).get('versions') or []
    if not versions:
        return Path(pdir) / 'bg.png'
    v = int(edit.get('bg_version') or 1)
    v = min(max(v, 1), len(versions))
    return Path(pdir) / versions[v - 1]['file']


def confined(rel: str) -> Path:
    """A path under projects/ (for GET /file); refuses anything that resolves outside it."""
    root = projects_root()
    if not isinstance(rel, str) or not rel or '\x00' in rel:
        raise StoreError('path required')
    p = Path(rel)
    full = (p if p.is_absolute() else root / p).resolve()
    if not full.is_relative_to(root) or full == root:
        raise StoreError('path outside projects/', 403)
    if not full.is_file():
        raise StoreError('no such file', 404)
    return full
