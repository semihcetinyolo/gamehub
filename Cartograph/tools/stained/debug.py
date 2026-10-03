"""Debug sheet: raw linework (red) over polygonized atoms, per design."""
import random, sys
from pathlib import Path
from PIL import Image, ImageDraw
from shapely.ops import polygonize, unary_union
sys.path.insert(0, str(Path(__file__).parent))
from designs import DESIGNS
from geom import _atoms, close_dangles, subdivide
S = 24
ids = [a for a in sys.argv[1:] if a != '-s'] or list(DESIGNS)
cols = 6
sheet = Image.new('RGB', (cols * 12 * S, ((len(ids) + cols - 1) // cols) * (16 * S + 16)), 'white')
for k, id in enumerate(ids):
    D = DESIGNS[id]; o = D['outline']; lines, prefer = D['build']()
    img = Image.new('RGB', (12 * S, 16 * S), '#eee'); d = ImageDraw.Draw(img)
    pal = [h for _, h in D['palette']]
    lines = close_dangles(o, lines)
    if len(sys.argv) > 1 and sys.argv[1] == '-s': lines = subdivide(o, lines, D.get('max_area') or 6)
    atoms = sorted(_atoms(o, lines, []), key=lambda a: -a.area)
    for a in atoms:
        p = a.representative_point()
        d.polygon([(x * S, y * S) for x, y in a.exterior.coords], fill=pal[prefer(p.x, p.y)])
    for a in atoms:
        d.line([(x * S, y * S) for x, y in a.exterior.coords], fill='#222', width=1)
    d.line([(x * S, y * S) for x, y in o.exterior.coords], fill='black', width=2)
    d.text((4, 4), f'{id} {len(atoms)}', fill='black')
    sheet.paste(img, ((k % cols) * 12 * S, (k // cols) * (16 * S + 16)))
sheet.save('/tmp/cg/debug.png')
