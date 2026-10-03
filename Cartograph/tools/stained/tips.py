"""List sharp pane tips left in each map (should be none but the panel's own corners)."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from make_maps import region_polys, shape_poly
from geom import tip_cuts
HERE = Path(__file__).parent
for f in sorted((HERE / 'maps').glob('*.json')):
    m = json.loads(f.read_text())['map']
    t = tip_cuts(region_polys(m), shape_poly(m))
    print(f.stem, len(t), [(round(g.centroid.x, 1), round(g.centroid.y, 1)) for g in t][:6])
