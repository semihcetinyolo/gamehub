"""List the V1 levels with a subject that get a new-style V2 drawing (user, 2026-10-21).

python tools/stained/vitray/redraw_queue.py  ->  tools/stained/vitray/redraw/queue.json
Subject levels = the 50 classic panels, the brain, the 100 story/motif figures and
the 25 large scenes; ring/spiral/atlas/geometric patterns stay V1 only. Sizes are
mixed on purpose (user: "eskiler gibi de yeniler gibi de"): every other level
keeps about its old pane count, the others get a large new-style panel; the large
scenes stay large and hard. V2 ids are 'v2_<old id>'.
"""
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
STAINED = HERE.parent
ROOT = STAINED.parents[1]


def family(id):
    if id == 'brain':
        return 'brain'
    if id.startswith('grand_'):
        return 'scene'
    if id.startswith(('story_', 'motif_')):
        return 'figurative'
    if id.startswith(('rings_', 'spiral_', 'atlas_', 'chapter_')):
        return 'pattern'
    return 'classic'


def main():
    text = (ROOT / 'stained-levels.js').read_text()
    levels = json.JSONDecoder().raw_decode(text[text.index('['):])[0]
    queue = []
    for n, L in enumerate(levels, 1):
        kind = family(L['id'])
        if kind == 'pattern':
            continue
        info = json.loads((STAINED / 'maps' / f"{L['id']}.json").read_text())
        old = L['map']['count']
        h = int(hashlib.sha256(L['id'].encode()).hexdigest()[:6], 16)
        hard = (L.get('difficulty') or {}).get('tier') == 'hard'
        if L['id'] == 'cat':
            target, size = [12, 16], 'tutorial'
        elif kind == 'scene':
            target, size = [110, 160], 'large'
        elif len(queue) % 2 == 0:
            base = max(16, round(old * 1.3))
            target, size = [base, base + 10], 'like-old'
        else:
            lo = 70 + h % 30
            target, size = [lo, lo + 40], 'like-new'
        queue.append(dict(id=f"v2_{L['id']}", source=L['id'], v1Level=n, name=L['name'], scene=info.get('scene') or L['name'],
                          kind=kind, hard=hard, oldPanes=old, targetPanes=target, size=size,
                          oldImage=L['image'], oldGuide=f"tools/stained/guides/{L['id']}.png"))
    out = HERE / 'redraw'
    out.mkdir(exist_ok=True)
    (out / 'queue.json').write_text(json.dumps(queue, ensure_ascii=False, indent=1) + '\n')
    print(f'{len(queue)} levels to redraw; {sum(q["hard"] for q in queue)} hard; '
          + ', '.join(f'{k} {sum(q["size"] == k for q in queue)}' for k in ('tutorial', 'like-old', 'like-new', 'large')))


if __name__ == '__main__':
    main()
