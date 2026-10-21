"""Catalogue rollout of the visible-contact rules (see visible_contacts.py).

For every active level with a grey-zone contact, fleck or too-small pane:
* if its authored source still matches the published map and the old builder
  merged a tiny atom into the subject (a bump), rebuild from the source
  (rebuild_authored.py) - accepted only when the result is completely clean;
* otherwise repair the published geometry (repair_visible_contacts.py).
Subject seams are immutable in both. Results stage in output/visible-contacts;
publication is visible_contact_assets.py. Already published levels are skipped.

python tools/stained/rollout_visible_contacts.py [--jobs 10] [ids…]
"""
import argparse
import json
from concurrent.futures import ProcessPoolExecutor, as_completed

from shapely.geometry import LineString
from shapely.ops import unary_union

from audit_geometry import active_ids
from designs import DESIGNS
from repair_visible_contacts import OUT, HERE, snapshot, write, repair
from visible_contacts import inspect


def bumped_source(info):
    """Missing fraction of authored subject lines, when the source still aligns."""
    from rebuild_authored import authored
    m = info['map']
    try:
        _, lines, focus = authored(info['id'], m['cols'], m['rows'])
    except Exception:
        return None
    if focus is None:
        return None
    net = unary_union([LineString([e[:2], e[2:4]]) for e in m['edges'] + m['rim']]).buffer(.01)
    subject = unary_union(lines).intersection(focus.buffer(.003))
    missing = [g for g in getattr(subject.difference(net), 'geoms', [subject.difference(net)]) if g.length > .05]
    share = sum(g.length for g in missing) / subject.length
    return share if 0 < share < .05 else None


def run(ident, level):
    info = json.loads((OUT / 'before/maps' / f'{ident}.json').read_text())
    row = dict(id=ident, level=level, before=len(inspect(info['map'])))
    if ident in DESIGNS and bumped_source(info) is not None:
        from rebuild_authored import rebuild
        try:
            staged, result = rebuild(json.loads(json.dumps(info)))
            if not result['remaining'] and not result['geometryIssues']:
                write(OUT / 'maps' / f'{ident}.json', staged)
                return dict(row, method='authored rebuild', **{k: result[k] for k in ['repairs', 'remaining']})
            row['rebuildRejected'] = len(result['remaining']) + len(result['geometryIssues'])
        except Exception as error:
            row['rebuildRejected'] = str(error)[:120]
    if not row['before']:
        return dict(row, method='unchanged', repairs=0, remaining=[])
    staged, result = repair(info)
    write(OUT / 'maps' / f'{ident}.json', staged)
    return dict(row, method='repair', repairs=result['repairs'], remaining=result['remaining'], geometryIssues=result['geometryIssues'])


def main():
    parser = argparse.ArgumentParser(); parser.add_argument('ids', nargs='*'); parser.add_argument('--jobs', type=int, default=10)
    args = parser.parse_args(); snapshot()
    done = {'fox', 'rabbit'}
    pending = []
    for level, ident in enumerate(active_ids(), 1):
        if (args.ids and ident not in args.ids) or ident in done:
            continue
        info = json.loads((OUT / 'before/maps' / f'{ident}.json').read_text())
        if inspect(info['map']) or (ident in DESIGNS and bumped_source(info) is not None):
            pending.append((ident, level))
    print('pending', len(pending), flush=True)
    report_file = OUT / 'reports' / 'rollout.json'
    report = json.loads(report_file.read_text()) if report_file.exists() else []
    report = [r for r in report if r['id'] not in {i for i, _ in pending}]
    with ProcessPoolExecutor(max_workers=args.jobs) as pool:
        futures = {pool.submit(run, ident, level): ident for ident, level in pending}
        for future in as_completed(futures):
            try:
                row = future.result()
            except Exception as error:
                row = dict(id=futures[future], error=str(error)[:200])
            report.append(row); print(json.dumps(row), flush=True)
            report_file.write_text(json.dumps(report, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
