"""In-memory job queue: a thread pool where each project runs at most `settings.concurrency` jobs at once.

Jobs do not survive a restart: store.recover() gives every queued/running edit a final status at start, and the
authoritative status always lives in project.json (the job record is a view for /queue and /jobs).
Job ids are "<project>.<ref>" (e.g. "door_v1.e003", "door_v1.g1"); project names cannot contain dots.
"""
from __future__ import annotations

import threading
import traceback
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor

from . import store
from .store import now

KEEP_FINISHED = 500
FINAL = ('done', 'failed', 'unknown', 'cancelled')
CURRENT = None   # the server's queue: job bodies report 'retrying (n)' and read cancel flags through it


def active(status: str) -> bool:
    return status not in FINAL


def set_status(jid: str, status: str, error: str | None = None) -> None:
    q = CURRENT
    if q is not None:
        q.set_status(jid, status, error)


def is_cancelled(jid: str) -> bool:
    q = CURRENT
    return bool(q is not None and q.cancelled(jid))


class JobQueue:
    def __init__(self, max_workers: int = 48, concurrency_of=None):
        self._pool = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix='plc-job')
        self._jobs: OrderedDict[str, dict] = OrderedDict()
        self._running: dict[str, int] = {}
        self._cond = threading.Condition()
        self._concurrency_of = concurrency_of or _project_concurrency
        self._cancel: set[str] = set()
        global CURRENT
        CURRENT = self

    def submit(self, project: str, kind: str, ref: str, fn) -> str:
        """fn() runs in a worker thread and returns the final status ("done" | "failed" | "unknown")."""
        jid = f'{project}.{ref}'
        with self._cond:
            old = self._jobs.get(jid)
            if old and active(old['status']):
                return jid
            self._cancel.discard(jid)
            self._jobs[jid] = {'id': jid, 'project': project, 'kind': kind, 'ref': ref, 'status': 'queued',
                               'error': None, 'created': now(), 'started': None, 'ended': None}
            self._jobs.move_to_end(jid)
            self._trim()
        self._pool.submit(self._run, jid, project, fn)
        return jid

    def _limit(self, project: str) -> int:
        try:
            return max(1, int(self._concurrency_of(project)))
        except Exception:
            return 1

    def _run(self, jid: str, project: str, fn):
        with self._cond:
            # re-read the limit while waiting: a PATCH of the settings takes effect for waiting jobs
            while self._running.get(project, 0) >= self._limit(project):
                self._cond.wait(timeout=2)
            self._running[project] = self._running.get(project, 0) + 1
            job = self._jobs[jid]
            job['status'], job['started'] = 'running', now()
        status, error = 'failed', None
        try:
            status = fn() or 'done'
        except Exception as e:
            error = f'{type(e).__name__}: {str(e)[:300]}'
            traceback.print_exc()
        finally:
            with self._cond:
                self._running[project] -= 1
                job.update(status=status, error=(error or job.get('error')) if status != 'done' else None,
                           ended=now())
                self._cond.notify_all()

    def _trim(self):
        done = [k for k, j in self._jobs.items() if not active(j['status'])]
        for k in done[:max(0, len(done) - KEEP_FINISHED)]:
            del self._jobs[k]

    def get(self, jid: str) -> dict | None:
        with self._cond:
            j = self._jobs.get(jid)
            return dict(j) if j else None

    def list(self, project: str | None = None) -> list[dict]:
        with self._cond:
            return [dict(j) for j in self._jobs.values() if project is None or j['project'] == project]

    def wait_idle(self, timeout: float = 30) -> bool:
        """For tests: wait until no job is queued or running."""
        import time
        end = time.time() + timeout
        while time.time() < end:
            with self._cond:
                if not any(active(j['status']) for j in self._jobs.values()):
                    return True
                self._cond.wait(timeout=0.05)
        return False

    def set_status(self, jid: str, status: str, error: str | None = None):
        with self._cond:
            j = self._jobs.get(jid)
            if j is not None and active(j['status']):
                j['status'] = status
                if error is not None:
                    j['error'] = error

    def cancel(self, jid: str) -> dict | None:
        """Ask a job to stop: a queued one ends before anything is sent; a retrying one stops before its next
        attempt. A request already in flight is never cut (its outcome would be unknown)."""
        with self._cond:
            j = self._jobs.get(jid)
            if j is None:
                return None
            if active(j['status']):
                self._cancel.add(jid)
                j['cancel_requested'] = now()
            return dict(j)

    def cancelled(self, jid: str) -> bool:
        with self._cond:
            return jid in self._cancel

    def shutdown(self):
        self._pool.shutdown(wait=False, cancel_futures=True)


def _project_concurrency(project: str) -> int:
    return store.read(project)['settings'].get('concurrency', 3)
