"""Build 150 distinct, readable maps. Retries are deterministic and saved with each map."""
import hashlib
import json
from pathlib import Path
from shapely.errors import GEOSException

from audit_geometry import inspect
from geom import Build
from make_maps import color, render, region_polys
from mass_designs import FAMILY_NAMES, OUTLINES, _builder, _palette

HERE = Path(__file__).resolve().parent


def main():
    hashes = set()
    retired = set()
    for name in ('creative-prompts.json', 'pattern-catalog.json'):
        manifest = HERE / name
        if manifest.exists():
            retired.update(a['replaces'] for a in json.loads(manifest.read_text())['assets'] if a.get('replaces'))
    for v in range(150):
        level, family = 51 + v, v % 10
        ident = f'chapter_{level:03d}'
        if ident in retired:
            continue
        target = HERE / 'maps' / f'{ident}.json'
        if target.exists():
            previous = json.loads(target.read_text())
            if previous.get('catalogVersion') == 2:
                hashes.add(previous['geometryHash'])
                continue
        for attempt in range(40):
            seed = v + 150 * attempt
            lines, prefer, protect = _builder(seed, family)
            try:
                b = Build(OUTLINES[(v + family) % len(OUTLINES)], lines,
                          min_r=.38, max_area=6.5, seed=seed + 1).run()
                m = b.to_map(prefer)
                if not 20 <= m['count'] <= 55:
                    continue
                polys = region_polys(m)
                if any(p.area < .9 for p in polys) or inspect(m):
                    continue
                signature = hashlib.sha256(json.dumps(m['paths']).encode()).hexdigest()
                if signature in hashes:
                    continue
                solution = color(m['adj'], m.pop('preferred'), m.pop('area'), 7)
                if len(set(solution)) != 4:
                    continue
                colors = _palette(v + 100)
                info = dict(id=ident, name=f'{FAMILY_NAMES[family]} {v // 10 + 1}',
                            scene=FAMILY_NAMES[family], palette=[(f'glass colour {i+1}', c) for i,c in enumerate(colors)],
                            catalogVersion=2, generationSeed=seed, geometryHash=signature,
                            map=m, solution=solution)
                render(m, solution, colors, HERE / 'guides' / f'{ident}.png')
                target.write_text(json.dumps(info, ensure_ascii=False, separators=(',', ':')))
                hashes.add(signature)
                print(f'{level}: {m["count"]} panes, attempt {attempt + 1}', flush=True)
                break
            except (ValueError, RuntimeError, AssertionError, AttributeError, GEOSException) as exc:
                print(f'{level}: retry {attempt+1}: {exc}', flush=True)
        else:
            raise RuntimeError(f'{ident}: no readable candidate after 40 attempts')


if __name__ == '__main__':
    main()
