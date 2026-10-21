"""Regression coverage for hidden connections under the 3D lead lines."""
import json
import unittest
from pathlib import Path
from shapely.geometry import box
from shapely.ops import unary_union
from visible_panes import inspect, metrics, visible_parts


class VisiblePaneTests(unittest.TestCase):
    def test_hairline_bridge_is_not_a_visible_connection(self):
        pane = unary_union([box(0, 0, 3, 3), box(5, 0, 8, 3), box(3, 1.499, 5, 1.501)])
        self.assertEqual(pane.geom_type, 'Polygon')
        self.assertEqual(len(visible_parts(pane, .096, .0144)), 2)
        self.assertEqual(inspect({'cols': 12, 'rows': 16}, [pane])[0][0], 'visually-disconnected')

    def test_readable_connector_and_closed_hole_are_allowed(self):
        pane = unary_union([box(0, 0, 3, 3), box(5, 0, 8, 3), box(3, 1, 5, 2)])
        self.assertEqual(inspect({'cols': 12, 'rows': 16}, [pane]), [])
        ring = box(0, 0, 8, 8).difference(box(2, 2, 6, 6))
        self.assertEqual(inspect({'cols': 12, 'rows': 16}, [ring]), [])

    def test_readability_margin_cannot_hide_a_thin_island(self):
        pane = unary_union([box(0, 0, 3, 3), box(5, 0, 5.14, 2), box(3, .999, 5, 1.001)])
        self.assertEqual(len(visible_parts(pane, .096, .0144)), 1)
        self.assertEqual(inspect({'cols': 12, 'rows': 16}, [pane])[0][0], 'visually-disconnected')

    def test_scale_follows_fitted_board(self):
        a = metrics({'cols': 12, 'rows': 16})
        b = metrics({'cols': 24, 'rows': 32})
        self.assertAlmostEqual(b[0], a[0] * 2)
        self.assertAlmostEqual(b[1], a[1] * 4)

    def test_lotus_regression_and_catalogue(self):
        from make_maps import region_polys
        from audit_geometry import active_ids
        root = Path(__file__).resolve().parents[2]
        before = root / 'output/visible-panes/before/maps/lotus.json'
        if before.exists():
            old = json.loads(before.read_text())['map']
            self.assertTrue(any(e[1] == 22 for e in inspect(old)))
        for ident in active_ids():
            m = json.loads((root / 'tools/stained/maps' / f'{ident}.json').read_text())['map']
            self.assertEqual(inspect(m), [], ident)
        if before.exists():
            current = json.loads((root / 'tools/stained/maps/lotus.json').read_text())['map']
            panes = region_polys(current); inset, minimum = metrics(old)
            islands = visible_parts(region_polys(old)[22], inset, minimum)
            owners = [max(range(len(panes)), key=lambda r: island.intersection(panes[r]).area) for island in islands]
            self.assertEqual(len(set(owners)), 3, 'Both petals and lower wedge must be independent')


if __name__ == '__main__': unittest.main()
