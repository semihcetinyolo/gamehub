"""Stage readable geometry for catalogue maps without overwriting live artwork."""
import argparse
import hashlib
import contextlib
import io
import json
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

from shapely import affinity
from shapely.geometry import LineString
from geom import Build
from make_maps import region_polys, shape_poly, color
from audit_geometry import inspect, fingerprint, VERSION, active_ids

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]


def repair(job):
    ident, destination = job
    info = json.loads((HERE / 'maps' / f'{ident}.json').read_text())
    original = info['map']
    before = inspect(original, info.get('large', False))
    if not before:
        return dict(id=ident, changed=False, before=0, after=0)
    scale = 1.5 if info.get('large') else 1
    outline = affinity.scale(shape_poly(original), 1/scale, 1/scale, origin=(0, 0))
    old_polys = [affinity.scale(p, 1/scale, 1/scale, origin=(0, 0)) for p in region_polys(original)]
    lines = [LineString([(e[0]/scale, e[1]/scale), (e[2]/scale, e[3]/scale)]) for e in original['edges']]
    cols, rows = original['cols']/scale, original['rows']/scale
    issues = before
    enlargement = 1
    for attempt in range(14):
        with contextlib.redirect_stdout(io.StringIO()):
            b = Build(outline, lines, min_r=.32, min_area=.6, cols=cols, rows=rows).run()
            m = b.to_map()
        issues = inspect(m)
        if not issues:
            polys = region_polys(m)
            preferred = [(info['solution'][max(range(len(old_polys)), key=lambda i: p.intersection(old_polys[i]).area)],)
                         for p in polys]
            solution = color(m['adj'], preferred, m['area'], 812)
            if len(set(solution)) != 4:
                raise ValueError(f'{ident}: four solution colours required')
            if info.get('large') and m['count'] < 60:
                raise ValueError(f'{ident}: lost too many large-scene panes ({m["count"]})')
            if scale != 1:
                # Small spacing margin survives three-decimal serialization at large scale.
                scale *= 1.01
                enlargement *= 1.01
                b.outline = affinity.scale(b.outline, scale, scale, origin=(0, 0))
                b.atoms = [affinity.scale(p, scale, scale, origin=(0, 0)) for p in b.atoms]
                b.cols, b.rows = cols*scale, rows*scale
                b._group(b.atoms, [], False)
                m = b.to_map()
            m.pop('area', None); m.pop('preferred', None)
            issues = inspect(m, info.get('large', False))
            if issues:
                return dict(id=ident, changed=False, before=len(before), after=len(issues), issues=issues, precision=True)
            info.update(map=m, solution=solution, geometryRevision=2, cornerRevision=1,
                        geometryHash=hashlib.sha256(json.dumps(m['paths']).encode()).hexdigest(),
                        junctionStyle='flat-readable', artworkNeedsRefresh=True,
                        geometryQuality=dict(version=VERSION, valid=True, fingerprint=fingerprint(m), issues=[]))
            if enlargement > 1:
                info['geometryEnlargement'] = round(enlargement, 6)
            if info.get('difficulty', {}).get('tier') == 'hard':
                info.pop('difficulty', None); info.pop('given', None)
            info['image'] = f'assets/glass/{ident}-clear.webp'
            info['artMetadata'] = f'assets/glass/{ident}-clear.json'
            target = Path(destination) / f'{ident}.json'
            target.write_text(json.dumps(info, ensure_ascii=False, separators=(',', ':')))
            return dict(id=ident, changed=True, before=len(before), after=0,
                        panes=m['count'], attempts=attempt+1, enlargement=enlargement)
        # Rebuild the repaired boundaries, not the original defective junctions.
        lines = [LineString([(e[0], e[1]), (e[2], e[3])]) for e in m['edges']]
        if attempt in (2, 4, 6, 8, 10, 12):
            # More room is preferable to squeezing a narrow junction into place.
            factor = 1.15
            outline = affinity.scale(outline, factor, factor, origin=(0, 0))
            lines = [affinity.scale(l, factor, factor, origin=(0, 0)) for l in lines]
            old_polys = [affinity.scale(p, factor, factor, origin=(0, 0)) for p in old_polys]
            cols *= factor; rows *= factor; enlargement *= factor
    return dict(id=ident, changed=False, before=len(before), after=len(issues), issues=issues[:8])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--jobs', type=int, default=4)
    parser.add_argument('ids', nargs='*')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    ids = args.ids or active_ids()
    report = []
    with ProcessPoolExecutor(max_workers=args.jobs) as pool:
        jobs = {pool.submit(repair, (ident, str(args.output))): ident for ident in ids}
        for job in as_completed(jobs):
            try:
                row = job.result()
            except Exception as e:
                row = dict(id=jobs[job], error=str(e))
            report.append(row)
            print(json.dumps(row), flush=True)
    (args.output / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
    raise SystemExit(any(r.get('error') or r.get('after', 0) for r in report))


if __name__ == '__main__':
    main()
