"""Find panes that pinch into a tiny separate-looking part (a neck thinner than `width`)."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from make_maps import region_polys

def necks(polys, width=0.4):
    t = width / 2
    out = []
    for r, p in enumerate(polys):
        body = p.buffer(-t, 8).buffer(t, 8)
        parts = sorted((g for g in getattr(body, 'geoms', [body]) if not g.is_empty), key=lambda g: -g.area)
        rest = p.difference(parts[0].buffer(0.02)) if parts else p
        for g in getattr(rest, 'geoms', [rest]):
            if g.is_empty or g.area < 0.03:
                continue
            # a bit that is not an ordinary sharp corner: compact enough to look like its own pane
            if g.area > 0.06 and g.area / max(g.length, 1e-6) > 0.06:
                c = g.representative_point()
                out.append((r, round(g.area, 2), (round(c.x, 2), round(c.y, 2))))
    return out

if __name__ == '__main__':
    HERE = Path(__file__).parent
    for f in sorted((HERE / 'maps').glob('*.json')):
        m = json.loads(f.read_text())['map']
        n = necks(region_polys(m))
        if n:
            print(f.stem, n)
