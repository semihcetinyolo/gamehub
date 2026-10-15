import sys, json
sys.path.insert(0, '/tmp/marla/tools')
import spots
from PIL import Image
from psd_tools import PSDImage
from psd_tools.api.layers import PixelLayer, Group

OUT = sys.argv[1]
pos = json.load(open('/tmp/marla/work/H/pos.json'))
psd = PSDImage.new('RGB', (4096, 4096), color=(255, 255, 255))
psd._record.header.version = 2  # PSB, like the 10163 example
PixelLayer.frompil(Image.open('/tmp/marla/beach.png').convert('RGB'), psd, 'BG', 0, 0)
for gname, g in (('D', 'C'), ('SwimmingArmband', 'B'), ('GreenMayo', 'A')):
    grp = Group.new(psd, gname, open_folder=False)
    nums = [n for n in range(1, 71) if spots.group(n) == g]
    for n in sorted(nums, key=lambda n: -pos[str(n)][1]):  # bottom of the canvas first, as in the example
        l, t, w, h = pos[str(n)]
        PixelLayer.frompil(Image.open(f'/tmp/marla/work/H/{n:02d}.png').convert('RGBA'), grp, 'H', t, l)
psd.save(OUT)
