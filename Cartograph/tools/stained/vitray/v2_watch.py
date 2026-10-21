"""Rebuild stained-levels-v2.js whenever a level finishes its glass (runs beside the pipeline).

python tools/stained/vitray/v2_watch.py
"""
import json
import subprocess
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]


def done():
    out = set()
    for f in (HERE / 'work').glob('*.map.json'):
        i = json.loads(f.read_text())
        if i.get('given') and not i.get('artworkNeedsRefresh', True) and i.get('artMetadata'):
            out.add((i['id'], f.stat().st_mtime))
    return out


last = None
while True:
    try:
        now = done()
        if now != last:
            r = subprocess.run(['node', str(HERE / 'build_v2.js')], cwd=ROOT, capture_output=True, text=True)
            print(time.strftime('%H:%M:%S'), (r.stdout or r.stderr).strip().splitlines()[-1], flush=True)
            last = now
    except Exception as e:  # a half-written map: try again on the next round
        print(time.strftime('%H:%M:%S'), 'retry', e, flush=True)
    time.sleep(30)
