"""Pipeline status of every staged vitray level."""
import json
import sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
ROOT = HERE.parents[2]
catalog = {l['id'] for l in json.loads((HERE / 'catalog.json').read_text())['levels']} if (HERE / 'catalog.json').exists() else set()
for f in sorted((HERE / 'work').glob('*.map.json')):
    i = json.loads(f.read_text()); id = i['id']
    issues = len(i['geometryQuality']['issues']) + len(i.get('visibleContactIssues', []))
    given = i.get('given'); blanks = sum(1 for g in given if g < 0) if given else None
    raw = (HERE / 'raw' / f'{id}.png').exists()
    print(f"{id:22s} {i['map']['count']:4d} panes  issues {issues:2d}  "
          f"{'clues ' + str(blanks) + ' blank' if given else 'no clues':16s} "
          f"{'hard' if i.get('difficulty', {}).get('tier') == 'hard' else '    '} "
          f"guide {'Y' if (HERE.parent / 'guides' / f'{id}.png').exists() else '-'} raw {'Y' if raw else '-'} "
          f"art {'Y' if not i.get('artworkNeedsRefresh') else '-'} pub {'Y' if id in catalog else '-'}")
