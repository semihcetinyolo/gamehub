"""Unattended V2 redraw pipeline: design -> geometry -> clues/guide -> glass, per level.

python tools/stained/vitray/redraw/pipeline.py [--design N] [--build N] [--art N] [--queue Q] [ids...]
Runs until every queue entry (redraw/queue.json) has finished glass or failed
twice in a stage. Astra work runs as one-shot `clai codex exec` sessions
(fresh context per level); geometry runs locally. Logs: logs/exec/<id>.<stage>.log,
progress: redraw/state.json. Safe to restart: each stage is decided from files.
"""
import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
VITRAY = HERE.parent
STAINED = VITRAY.parent
ROOT = STAINED.parents[1]
LOGS = VITRAY / 'logs' / 'exec'
QUEUE = HERE / 'queue.json'
ASTRA = ['clai', 'codex', 'exec', '--dangerously-bypass-approvals-and-sandbox', '--model', 'gpt-6-astra',
         '-c', 'model_reasoning_effort=medium']

DESIGN_PROMPT = ('Read tools/stained/vitray/REDRAW_BRIEF.md and tools/stained/vitray/DESIGN_BRIEF.md, then make the '
                 'design sheet for exactly one level: the entry with id {id} in tools/stained/vitray/redraw/queue.json. '
                 'Do not send any clai ctl messages. Finish when tools/stained/vitray/design/{id}.png and .json exist.')
FRESH_PROMPT = ('Read tools/stained/vitray/FRESH_BRIEF.md and tools/stained/vitray/DESIGN_BRIEF.md, then make the '
                'design sheet for exactly one level: the entry with id {id} in {queue}. '
                'Do not send any clai ctl messages. Finish when tools/stained/vitray/design/{id}.png and .json exist.')
ART_PROMPT = ('Read tools/stained/vitray/ART_BRIEF.md and follow it for exactly one level: {id}. Do not send any clai ctl '
              'messages (skip that step of the brief). Finish after `python tools/stained/vitray/art.py finish {id}` '
              'succeeded, or after one regeneration if it still fails.')


def staged(id):
    f = VITRAY / 'work' / f'{id}.map.json'
    return json.loads(f.read_text()) if f.exists() else None


def stage_of(q, fails):
    id = q['id']
    design = VITRAY / 'design' / f'{id}.png'
    info = staged(id)
    if not design.exists() or not (VITRAY / 'design' / f'{id}.json').exists():
        return 'design'
    if info is None or not info.get('geometryQuality', {}).get('valid') or (VITRAY / 'design' / f'{id}.png').stat().st_mtime > (VITRAY / 'work' / f'{id}.map.json').stat().st_mtime:
        return 'build'
    if not info.get('given') or not (STAINED / 'guides' / f'{id}.png').exists():
        return 'clues'
    if info.get('artworkNeedsRefresh', True):
        return 'art'
    return 'done'


def command(q, stage):
    id = q['id']
    if stage == 'design':
        if q.get('brief') == 'FRESH_BRIEF.md':
            return [*ASTRA, FRESH_PROMPT.format(id=id, queue=QUEUE.relative_to(ROOT))]
        return [*ASTRA, DESIGN_PROMPT.format(id=id)]
    if stage == 'build':
        return ['bash', '-c', f'python3 tools/stained/vitray/trace.py {id} && python3 tools/stained/vitray/build_map.py {id}']
    if stage == 'clues':
        clue = ('node tools/stained/vitray/tutorial.js' if id == 'v2_cat'
                else 'node tools/stained/vitray/clues.js' + (' --hard' if q['hard'] else ''))
        return ['bash', '-c', f'{clue} {id} && python3 tools/stained/vitray/art.py guide {id}']
    if stage == 'art':
        return [*ASTRA, ART_PROMPT.format(id=id)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--design', type=int, default=6)
    ap.add_argument('--build', type=int, default=9)
    ap.add_argument('--art', type=int, default=5)
    ap.add_argument('--queue', type=Path, default=HERE / 'queue.json', help='queue file; its state.json sits beside it')
    ap.add_argument('ids', nargs='*')
    a = ap.parse_args()
    global QUEUE
    QUEUE = a.queue.resolve()
    limits = {'design': a.design, 'build': a.build, 'clues': 4, 'art': a.art}
    LOGS.mkdir(parents=True, exist_ok=True)
    queue = json.loads(QUEUE.read_text())
    if a.ids:
        queue = [q for q in queue if q['id'] in a.ids]
    running, fails = {}, {}
    while True:
        # reap
        for id, (stage, proc, log) in list(running.items()):
            if proc.poll() is not None:
                log.close()
                del running[id]
                if proc.returncode != 0:
                    fails[(id, stage)] = fails.get((id, stage), 0) + 1
                    print(f'{time.strftime("%H:%M")} {id} {stage} failed ({fails[(id, stage)]})', flush=True)
                else:
                    print(f'{time.strftime("%H:%M")} {id} {stage} ok', flush=True)
        state = {q['id']: stage_of(q, fails) for q in queue}
        busy = {s: sum(1 for st, _, _ in running.values() if st == s) for s in limits}
        for q in queue:  # queue order = V2 play order: early levels first
            id, stage = q['id'], state[q['id']]
            if id in running or stage == 'done' or fails.get((id, stage), 0) >= 2:
                continue
            if busy[stage] >= limits[stage]:
                continue
            log = open(LOGS / f'{id}.{stage}.log', 'a')
            running[id] = (stage, subprocess.Popen(command(q, stage), cwd=ROOT, stdout=log, stderr=subprocess.STDOUT,
                                                   stdin=subprocess.DEVNULL), log)
            busy[stage] += 1
        summary = {}
        for id, st in state.items():
            key = 'failed' if fails.get((id, st), 0) >= 2 else st
            summary[key] = summary.get(key, 0) + 1
        (QUEUE.parent / 'state.json').write_text(json.dumps(dict(time=time.strftime('%H:%M:%S'), summary=summary, state=state,
                                                         running={i: s for i, (s, _, _) in running.items()},
                                                         failed=[f'{i}:{s}' for (i, s), n in fails.items() if n >= 2]), indent=1))
        if not running and all(st == 'done' or fails.get((id, st), 0) >= 2 for id, st in state.items()):
            print('pipeline finished', summary, flush=True)
            return
        time.sleep(15)


if __name__ == '__main__':
    main()
