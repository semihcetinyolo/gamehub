import sys, json
sys.path.insert(0, '/tmp/marla/tools')
import marla, spots
from PIL import Image, ImageDraw, ImageFont
from concurrent.futures import ThreadPoolExecutor

def edits_by_spot(p):
    return {marla.spot_of(e): e for e in p['edits']}

def sheet(nums, out, p, cell=300):
    bg = Image.open('/tmp/marla/beach.png').convert('RGB')
    E = edits_by_spot(p)
    with ThreadPoolExecutor(8) as ex: list(ex.map(lambda n: marla.fetch_patch(E[n]), nums))
    f = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 20)
    cols = 4
    rows = (len(nums) + cols - 1) // cols
    S = Image.new('RGB', (cols * (cell * 2 + 20), rows * (cell + 34)), 'white'); d = ImageDraw.Draw(S)
    for i, n in enumerate(nums):
        e = E[n]; g = e['geometry']; px0, py0, px1, py1 = g['paste']; ox, oy = marla.origin(e)
        pt = Image.open(marla.fetch_patch(e)).convert('RGB')
        a = bg.crop((px0, py0, px1, py1)); b = pt.crop((px0 - ox, py0 - oy, px1 - ox, py1 - oy))
        sc = cell / max(a.size); sz = (round(a.width * sc), round(a.height * sc))
        x = (i % cols) * (cell * 2 + 20); y = (i // cols) * (cell + 34)
        S.paste(a.resize(sz), (x, y + 30)); S.paste(b.resize(sz), (x + cell + 4, y + 30))
        d.text((x, y + 4), f"#{n} {spots.group(n)} {spots.color(n)}", fill=(200, 0, 0), font=f)
    S.save(out, quality=88)

if __name__ == '__main__':
    p = json.load(open('/tmp/marla/proj.json'))
    nums = list(range(1, 71))
    for k in range(0, 70, 12):
        sheet(nums[k:k + 12], f'/tmp/marla/work/sheet_{k // 12}.jpg', p)

CHOSEN_VARIANT = {3: '1186b6e6f3ae4ffe'}

def final_edits(p):
    E = edits_by_spot(p)
    out = {}
    for n in range(1, 71):
        e = E[n]
        vid = CHOSEN_VARIANT.get(n)
        out[n] = next(v for v in e['variants'] if v['id'] == vid) if vid else e
    return out
