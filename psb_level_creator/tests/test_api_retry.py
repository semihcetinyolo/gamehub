import json
import time

import pytest

from _api_helpers import env, Fake, bg_png, answer_from  # noqa: F401
from plc import edits, jobqueue, store
from plc.providers import ProviderError

AI403 = 'Clai HTTP 502: image_failed Görsel üretilemedi: AI Studio: 403 The caller does not have permission'


def flaky(n_fail, err=None):
    state = {'n': 0}

    def call(images, extra):
        state['n'] += 1
        if state['n'] <= n_fail:
            raise err or ProviderError(AI403, 'failed', 502)
        return {'png': answer_from(images[0]), 'format': 'png', 'channel': 'ok'}
    return call, state


@pytest.fixture
def sleeps(monkeypatch):
    s = []
    monkeypatch.setattr(edits, '_sleep', lambda sec: s.append(sec))
    return s


def _project(name='p', fallback='albert'):
    store.create(name, {'fallback': fallback})
    edits.set_background(name, bg_png(), 'upload')
    return edits.add_edits(name, [{'x0': 600, 'y0': 1000, 'x1': 900, 'y1': 1300, 'description': 'apple'}],
                           auto_detect=False)


def _req(name, eid):
    return json.loads((store.edit_dir(name, eid) / 'request.json').read_text())


def test_definite_clai_errors_are_retried_until_success(env, monkeypatch, sleeps):
    call, state = flaky(3)
    fake = Fake(monkeypatch, clai=call)
    [eid] = _project()
    assert edits.run_edit('p', eid) == 'done'
    assert fake.routes() == ['clai'] * 4                           # no Albert although fallback is albert
    att = _req('p', eid)['attempts']
    assert [a['route'] for a in att] == ['clai'] * 4
    assert [a['outcome'].startswith('error') for a in att[:3]] == [True] * 3 and att[3]['outcome'] == 'ok'
    assert sum(sleeps) == 10 + 20 + 40
    e = store.read('p')['edits'][0]
    assert e['via'] == 'clai' and e['retry']['attempts'] == 3


@pytest.mark.parametrize('err', [ProviderError('Clai HTTP 429: rate', 'failed', 429),
                                 ProviderError('Clai HTTP 503: image_queue_timeout', 'failed', 503),
                                 ProviderError('Clai HTTP 502: image_failed AI Studio: 504', 'failed', 502)])
def test_retryable_kinds(err):
    assert edits.clai_retryable(err)


@pytest.mark.parametrize('err', [ProviderError('Clai HTTP 400: bad', 'failed', 400),
                                 ProviderError('Clai HTTP 401', 'failed', 401),
                                 ProviderError('Clai did not answer within 210 s', 'unknown'),
                                 ProviderError('no key', 'invalid')])
def test_not_retryable(err):
    assert not edits.clai_retryable(err)


def test_unknown_outcome_is_never_resent(env, monkeypatch, sleeps):
    call, state = flaky(5, ProviderError('Clai did not answer within 210 s', 'unknown'))
    Fake(monkeypatch, clai=call)
    [eid] = _project(fallback='none')
    assert edits.run_edit('p', eid) == 'unknown'
    assert state['n'] == 1 and 'outcome' not in _req('p', eid)['attempts'][0]


def test_other_errors_still_go_to_albert(env, monkeypatch, sleeps):
    fake = Fake(monkeypatch, clai=ProviderError('Clai HTTP 400: bad request', 'failed', 400))
    [eid] = _project()
    assert edits.run_edit('p', eid) == 'done'
    assert fake.routes() == ['clai', 'albert'] and sleeps == []


def test_cancel_stops_a_retrying_job(env, monkeypatch):
    monkeypatch.setattr(edits, '_sleep', lambda sec: time.sleep(0.01))
    call, state = flaky(10 ** 9)
    Fake(monkeypatch, clai=call)
    [eid] = _project(fallback='none')
    q = jobqueue.JobQueue()
    jid = q.submit('p', 'edit', eid, lambda: edits.run_edit('p', eid))
    t0 = time.time()
    while state['n'] < 3 and time.time() - t0 < 10:
        time.sleep(0.01)
    assert q.get(jid)['status'].startswith('retrying')
    q.cancel(jid)
    assert q.wait_idle(10)
    e = store.read('p')['edits'][0]
    assert e['status'] == 'failed' and 'cancelled after' in e['error']
    n = state['n']
    time.sleep(0.1)
    assert state['n'] == n                                          # nothing more is sent
    att = _req('p', eid)['attempts']
    assert len(att) == n and all('outcome' in a for a in att)
    jobqueue.CURRENT = None


def test_cancel_a_queued_job_sends_nothing(env, monkeypatch):
    call, state = flaky(0)
    Fake(monkeypatch, clai=call)
    [eid] = _project()
    q = jobqueue.JobQueue()
    q._cancel.add(f'p.{eid}')                                       # cancelled before it starts
    assert edits.run_edit('p', eid) == 'failed'
    assert state['n'] == 0 and 'before sending' in store.read('p')['edits'][0]['error']
    jobqueue.CURRENT = None


def test_restart_between_retries_is_failed_not_unknown(env, monkeypatch):
    Fake(monkeypatch)
    [eid] = _project()
    store.update('p', lambda p: p['edits'][0].update(status='running'))
    req = {'prompt': 'x'}
    path = store.edit_dir('p', eid) / 'request.json'
    store.record_attempt(path, req, 'clai')
    store.record_outcome(path, req, 'error: Clai HTTP 502 image_failed')
    plan = []
    store.recover('p', plan)
    e = store.read('p')['edits'][0]
    assert e['status'] == 'queued' and plan == [('edit', 'p', eid)]   # a definite error: requeued
    Fake(monkeypatch)
    assert edits.run_edit('p', eid) == 'done'
    att = json.loads(path.read_text())['attempts']
    assert [a['route'] for a in att] == ['clai', 'clai'] and att[0]['outcome'].startswith('error')


def test_background_generation_retries(env, monkeypatch, sleeps):
    state = {'n': 0}

    def gen(images, extra):
        state['n'] += 1
        if state['n'] == 1:
            raise ProviderError('Clai HTTP 503: queue', 'failed', 503)
        return {'png': bg_png(1536, 2048), 'format': 'png', 'channel': 'x'}
    Fake(monkeypatch, clai=gen)
    store.create('g')
    g = edits.add_generation('g', 'a porch')
    assert edits.run_generation('g', g['id']) == 'done' and state['n'] == 2
    assert store.read('g')['generations'][0]['retry']['attempts'] == 1


def test_quota_exhausted_retries_every_60s(env, monkeypatch, sleeps):
    call, state = flaky(2, ProviderError('Clai HTTP 502: image_quota_exhausted every account used up', 'failed', 502))
    Fake(monkeypatch, clai=call)
    [eid] = _project(fallback='none')
    assert edits.run_edit('p', eid) == 'done'
    assert sum(sleeps) == 120
    assert edits.clai_retryable(ProviderError('Clai HTTP 500: AI Studio: 503 UNAVAILABLE', 'failed', 500))
