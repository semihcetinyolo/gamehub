import json

import pytest

from _api_helpers import env, Fake, bg_png  # noqa: F401
from plc import edits, store
from plc.store import StoreError


def test_create_read_update(env):
    p = store.create('door_v1', {'concurrency': 2})
    assert p['settings'] == {'provider': 'nano', 'fallback': 'albert', 'concurrency': 2}
    assert store.read('door_v1')['name'] == 'door_v1'
    with pytest.raises(StoreError) as e:
        store.create('door_v1')
    assert e.value.status == 409
    proj, extra = store.update('door_v1', lambda p: (p['settings'].update(fallback='none'), 7)[1])
    assert extra == 7 and proj['settings']['fallback'] == 'none'
    assert json.loads((store.pdir('door_v1') / 'project.json').read_text())['settings']['fallback'] == 'none'
    assert [x['name'] for x in store.list_projects()] == ['door_v1']


@pytest.mark.parametrize('bad', ['', '../x', 'a/b', 'a.b', '-x', 'x' * 65, None])
def test_bad_names(env, bad):
    with pytest.raises(StoreError):
        store.create(bad)


@pytest.mark.parametrize('bad', [{'fallback': 'marla'}, {'provider': 'gpt'}, {'concurrency': 0}, {'concurrency': 9}, {'colour': 1},
                                 {'concurrency': True}])
def test_bad_settings(env, bad):
    with pytest.raises(StoreError):
        store.create('p', bad)


def test_update_failure_writes_nothing(env):
    store.create('p')
    before = (store.pdir('p') / 'project.json').read_text()

    def boom(p):
        p['settings']['concurrency'] = 5
        raise RuntimeError('x')
    with pytest.raises(RuntimeError):
        store.update('p', boom)
    assert (store.pdir('p') / 'project.json').read_text() == before


def test_recover_unknown_is_never_resent(env, monkeypatch):
    store.create('p')
    edits.set_background('p', bg_png(), 'upload')
    box = {'x0': 100, 'y0': 100, 'x1': 300, 'y1': 300, 'description': 'apple'}
    ids = edits.add_edits('p', [box, box, box])
    # e001: crashed after its request was recorded; e002: crashed while running but before sending; e003: queued
    store.update('p', lambda p: [e.update(status='running') for e in p['edits'][:2]])
    store.record_attempt(store.edit_dir('p', ids[0]) / 'request.json', {'prompt': 'apple'}, 'clai')
    counts = store.recover('p')
    assert counts == {'requeued': 2, 'resumed': 0, 'unknown': 1}
    st = {e['id']: e['status'] for e in store.read('p')['edits']}
    assert st == {'e001': 'unknown', 'e002': 'queued', 'e003': 'queued'}    # never sent -> back in the queue
    fake = Fake(monkeypatch)
    edits.run_edit('p', ids[0])          # the unknown one is never sent again
    assert fake.calls == []
    assert store.read('p')['edits'][0]['status'] == 'unknown'


def test_confined(env):
    store.create('p')
    (store.pdir('p') / 'x.txt').write_text('hi')
    assert store.confined('p/x.txt').read_text() == 'hi'
    for bad in ('../secret', '/etc/hosts', 'p/../../x', ''):
        with pytest.raises(StoreError):
            store.confined(bad)
    with pytest.raises(StoreError) as e:
        store.confined('p/missing.png')
    assert e.value.status == 404


def test_stray_entries_in_projects_are_skipped(env):
    store.create('p')
    (store.projects_root() / '.DS_Store').write_bytes(b'x')
    (store.projects_root() / 'empty_dir').mkdir()
    assert [x['name'] for x in store.list_projects()] == ['p']
    assert store.recover_all() == {}
