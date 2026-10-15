"""Submit plan regions as Marla region edits (one generation per region).
usage: python3 gen.py WORKDIR PLAN [region numbers...]   (1-based, default: all)"""
import importlib, json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import marla_api as m

work, plan_name = sys.argv[1], sys.argv[2]
plan = importlib.import_module(plan_name)
state = json.load(open(f'{work}/state.json'))
nums = [int(a) for a in sys.argv[3:]] or list(range(1, len(plan.REGIONS) + 1))
ref = m.data_url(f'{work}/ref_char.png')
boxes = []
for n in nums:
    (x0, y0, x1, y1), items = plan.REGIONS[n - 1]
    boxes.append({'type': 'rect', 'x0': x0, 'y0': y0, 'x1': x1, 'y1': y1,
                  'description': plan.description((x0, y0, x1, y1), items), 'ref_image': ref})
r = m.add_edits(state['project'], boxes)
print('queued', len(r['ids']))
jobs = m.wait(r['ids'])
print('done', sum(j['status'] == 'done' for j in jobs), 'failed', [j.get('error') for j in jobs if j['status'] != 'done'])
