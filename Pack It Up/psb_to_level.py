#!/usr/bin/env python3
"""PSB -> Pack It Up level extractor.

Slices the numbered item layers of a layered .psb/.psd into trimmed PNGs and
derives, for each piece, the grid footprint (`cells`, `w`, `h`) + art offset
(`art:{dx,dy,iw,ih}`) it needs in index.html's LEVELS array.

The board (rows/cols/gridMap) is NOT stored in the PSB (it is a level-design
choice), so it is generated here: the smallest rectangle that a fixed-orientation
packer can fit every piece into — guaranteeing the level is solvable.

Convention (reverse-engineered from Assets/Cat_Level.psb, validated 10/10 vs the
in-game cat level):
  - layers named with a number (`1`,`2`,...) = item pieces, anywhere in the tree
  - cell size + grid origin are auto-detected from piece edges
  - a cell counts as part of a piece's footprint if >=COVER_T of it is opaque

Usage:
  python3 psb_to_level.py <file.psb> "<Level Name>" [--cols 6] [--out-dir <slug>]
Prints the JS level entry on stdout and writes piece PNGs into the slug folder.
"""
import sys, os, re, json, argparse
from collections import Counter, defaultdict
import numpy as np
from psd_tools import PSDImage

ALPHA_T = 0.35   # a pixel is "opaque" above this alpha
COVER_T = 0.18   # a cell joins the footprint if this fraction of it is opaque


# --------------------------------------------------------------- piece read ---
def collect_pieces(psd):
    """Return {n: (alpha[H,W] float, bbox)} for every numerically-named layer."""
    pieces = {}
    def walk(layers):
        for l in layers:
            if l.is_group():
                walk(l); continue
            nm = l.name.strip()
            if nm.isdigit():
                pil = l.topil()
                if pil is None:
                    continue
                pil = pil.convert("RGBA")
                a = np.asarray(pil)[:, :, 3].astype(np.float32) / 255.0
                # re-trim to true alpha bounds (layer bbox may carry padding)
                ys, xs = np.where(a > ALPHA_T)
                if len(xs) == 0:
                    continue
                x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
                L, T = l.bbox[0], l.bbox[1]
                pieces[int(nm)] = (a[y0:y1, x0:x1], (L + x0, T + y0, L + x1, T + y1), pil.crop((x0, y0, x1, y1)))
    walk(psd)
    return pieces


# --------------------------------------------------------------- grid detect ---
def _frac(v, o, C):
    f = ((v - o) / C) % 1.0
    return min(f, 1.0 - f)

def detect_grid(bboxes):
    """Find cell size C + origin (ox,oy) by aligning all piece edges to grid lines."""
    xedges, yedges = [], []
    for b in bboxes:
        xedges += [b[0], b[2]]; yedges += [b[1], b[3]]
    min_dim = min(min(b[2] - b[0], b[3] - b[1]) for b in bboxes)
    lo, hi = max(8.0, min_dim * 0.55), min_dim * 1.7   # smallest piece ~= 1 cell
    def best_origin(vals, C):
        return min(np.arange(0, C, max(0.25, C / 400)),
                   key=lambda o: sum(_frac(v, o, C) for v in vals))
    best = None
    for C in np.arange(lo, hi, 0.1):
        ox = best_origin(xedges, C); oy = best_origin(yedges, C)
        resid = sum(_frac(v, ox, C) for v in xedges) + sum(_frac(v, oy, C) for v in yedges)
        score = resid / len(xedges + yedges)
        if best is None or score < best[0]:
            best = (score, float(C), float(ox), float(oy))
    return best[1], best[2], best[3], best[0]


def piece_cells(a, bbox, C, ox, oy):
    """Footprint cells (normalized), w, h, and art offset for one piece."""
    L, Tp, R, B = bbox
    H, W = a.shape
    c0 = round((L - ox) / C); c1 = round((R - ox) / C)
    r0 = round((Tp - oy) / C); r1 = round((B - oy) / C)
    filled = []
    for rr in range(max(1, r1 - r0)):
        for cc in range(max(1, c1 - c0)):
            x0 = ox + (c0 + cc) * C; y0 = oy + (r0 + rr) * C
            lx0 = max(0, int(round(x0 - L))); ly0 = max(0, int(round(y0 - Tp)))
            lx1 = min(W, int(round(x0 + C - L))); ly1 = min(H, int(round(y0 + C - Tp)))
            if lx1 <= lx0 or ly1 <= ly0:
                continue
            if float((a[ly0:ly1, lx0:lx1] > ALPHA_T).mean()) >= COVER_T:
                filled.append((rr, cc))
    if not filled:
        filled = [(0, 0)]
    mr = min(p[0] for p in filled); mc = min(p[1] for p in filled)
    cells = sorted([[r - mr, c - mc] for r, c in filled])
    w = max(c[1] for c in cells) + 1; h = max(c[0] for c in cells) + 1
    fx = ox + (c0 + mc) * C; fy = oy + (r0 + mr) * C
    art = {"dx": round((L - fx) / C, 2), "dy": round((Tp - fy) / C, 2),
           "iw": round((R - L) / C, 2), "ih": round((B - Tp) / C, 2)}
    return cells, w, h, art


# --------------------------------------------------------------- board pack ---
def fits(shapes, cols, rows, budget=400000):
    """True if all fixed-orientation shapes fit in cols x rows with no overlap."""
    grid = [[False] * cols for _ in range(rows)]
    order = sorted(range(len(shapes)), key=lambda i: -len(shapes[i]))
    nodes = [0]
    def can(sh, r, c):
        for dr, dc in sh:
            rr, cc = r + dr, c + dc
            if rr >= rows or cc >= cols or grid[rr][cc]:
                return False
        return True
    def put(sh, r, c, v):
        for dr, dc in sh:
            grid[r + dr][c + dc] = v
    def dfs(i):
        nodes[0] += 1
        if nodes[0] > budget:
            return False
        if i == len(order):
            return True
        sh = shapes[order[i]]
        for r in range(rows):
            for c in range(cols):
                if can(sh, r, c):
                    put(sh, r, c, True)
                    if dfs(i + 1):
                        return True
                    put(sh, r, c, False)
        return False
    return dfs(0)


def make_board(items, cols):
    """Smallest rows for the given cols that fits all pieces (guaranteed solvable)."""
    shapes = [[tuple(c) for c in it["cells"]] for it in items]
    total = sum(len(s) for s in shapes)
    max_h = max(it["h"] for it in items)
    max_w = max(it["w"] for it in items)
    cols = max(cols, max_w)
    rows = max(max_h, -(-total // cols))   # ceil
    for _ in range(40):
        if fits(shapes, cols, rows):
            return cols, rows
        rows += 1
    return cols, rows   # fallback (shouldn't hit)


# --------------------------------------------------------------- build level ---
_TR = str.maketrans("şŞıİöÖüÜçÇğĞ", "ssiioouuccgg")

def slugify(name):
    s = re.sub(r"[^a-z0-9]+", "-", (name or "").translate(_TR).lower()).strip("-")
    return s or "level"

BG_PALETTE = "linear-gradient(180deg,#efe6d6 0%,#d6c1a3 100%)"


def _trim_grid(grid):
    """Drop fully-empty border rows/cols so the board hugs the white region."""
    rows = [r for r in grid if any(r)]
    if not rows:
        return None
    cols = [c for c in range(len(rows[0])) if any(r[c] for r in rows)]
    if not cols:
        return None
    return [[r[c] for c in cols] for r in rows]


def read_map(psd, C):
    """A layer named 'map' marks the playable board: its WHITE grid cells become
    gridMap=1, everything else 0. Sampled on a C-sized grid (same cell size as
    the pieces). Returns the gridMap, or None if there's no map layer."""
    found = [None]
    def walk(layers):
        for l in layers:
            if l.is_group():
                walk(l); continue
            if (l.name or "").strip().lower() == "map":
                found[0] = l
    walk(psd)
    layer = found[0]
    if layer is None:
        return None
    pil = layer.topil()
    if pil is None:
        return None
    arr = np.asarray(pil.convert("RGBA")).astype(np.float32)
    Hm, Wm = arr.shape[:2]
    alpha = arr[:, :, 3] / 255.0
    mn = arr[:, :, :3].min(axis=2)              # min channel: high => near-white
    white = (alpha > 0.5) & (mn > 170)          # opaque AND near-white
    rows = max(1, int(round(Hm / C)))
    cols = max(1, int(round(Wm / C)))
    grid = []
    for r in range(rows):
        y0, y1 = int(round(r * C)), int(round((r + 1) * C))
        row = []
        for c in range(cols):
            x0, x1 = int(round(c * C)), int(round((c + 1) * C))
            cell = white[y0:y1, x0:x1]
            row.append(1 if (cell.size and float(cell.mean()) >= 0.35) else 0)
        grid.append(row)
    return _trim_grid(grid)

# ============================================================================
#  Convention B — "Solution colour-map" levels  (e.g. levels/deneme.psb)
#  PSB layout:
#    Pieces  : group of item-art layers (named 'P'), placed in SOLVED positions
#    BG      : background image (tiled parchment)
#    Cell    : one decorative CxC cell tile, copy/pasted to cover the play area
#    Solution: each piece's footprint painted as a solid colour over the play
#              area (Grid is the same map plus the outer border) — this is the
#              authoritative source for both the gridMap and per-piece shapes
#  Win = fill the play area (= place every piece); pieces tile the board exactly.
# ============================================================================
def _find_layer(psd, name, group=False):
    name = name.strip().lower()
    hit = [None]
    def walk(ls):
        for l in ls:
            if (l.name or "").strip().lower() == name and l.is_group() == group:
                hit[0] = l
            if l.is_group():
                walk(l)
    walk(psd)
    return hit[0]


def _find_grid_layer(psd):
    """The layer whose name starts with 'Grid' (e.g. 'Grid_Hard_67', possibly with
    a Photoshop ' (1)' suffix). Its coloured areas are the SOLE source of the level:
    each colour = one piece's footprint AND its solved board position. There is no
    separate 'Solution' layer."""
    hit = [None]
    def walk(ls):
        for l in ls:
            if not l.is_group() and (l.name or "").strip().lower().startswith("grid"):
                hit[0] = l
            if l.is_group():
                walk(l)
    walk(psd)
    return hit[0]


def parse_grid_meta(name):
    """Extract (difficulty, order) from a grid layer name like 'Grid_Hard_67 (1)'.
    Returns (None, None) if absent. Used later for level ordering."""
    m = re.search(r"grid[_\s]+([A-Za-z]+)[_\s]+(\d+)", name or "", re.I)
    return (m.group(1), int(m.group(2))) if m else (None, None)


def _to_canvas_rgba(layer, W, H):
    """Place a layer's pixels onto a full WxH transparent canvas."""
    im = np.asarray(layer.topil().convert("RGBA"))
    cv = np.zeros((H, W, 4), np.uint8)
    L, T, R, B = layer.bbox
    x0, y0, x1, y1 = max(0, L), max(0, T), min(W, R), min(H, B)
    cv[y0:y1, x0:x1] = im[y0 - T:y1 - T, x0 - L:x1 - L]
    return cv


def _trim(layer):
    """Trimmed RGBA PIL image + its canvas bbox (alpha bounds)."""
    pil = layer.topil()
    if pil is None:
        return None, None
    pil = pil.convert("RGBA")
    a = np.asarray(pil)[:, :, 3]
    ys, xs = np.where(a > ALPHA_T * 255)
    if len(xs) == 0:
        return None, None
    x0, x1, y0, y1 = int(xs.min()), int(xs.max()) + 1, int(ys.min()), int(ys.max()) + 1
    L, T = layer.bbox[0], layer.bbox[1]
    return pil.crop((x0, y0, x1, y1)), (L + x0, T + y0, L + x1, T + y1)


def is_solution_psb(psd):
    return _find_layer(psd, "pieces", group=True) is not None and _find_grid_layer(psd) is not None


def detect_cell_size(psd):
    """Cell size from the 'Cell' tile layer (rounded so canvas is an integer
    number of cells); falls back to the nearest divisor of a ~256 canvas grid."""
    cell = _find_layer(psd, "cell")
    if cell is not None:
        cw = cell.bbox[2] - cell.bbox[0]
        return psd.width / max(1, round(psd.width / cw))
    return psd.width / max(1, round(psd.width / 256.0))


def build_level_solution(psb_path, name, slug=None, out_dir=None, copy_pngs=True, psd=None):
    psd = psd or PSDImage.open(psb_path)
    W, H = psd.width, psd.height
    C = detect_cell_size(psd); Ci = int(round(C))
    slug = slug or slugify(name); out_dir = out_dir or slug
    if copy_pngs:
        os.makedirs(out_dir, exist_ok=True)
    # ---- The Grid layer's coloured areas ARE the solution: each colour marks one
    # piece's cells at its solved board position. From it we derive the footprint
    # (shape), the art offset, AND `sol` (solved position). No 'Solution' layer.
    # Outer border/background colours are dropped since no piece claims them. ----
    smap = _find_grid_layer(psd)
    difficulty, order = parse_grid_meta(smap.name)   # e.g. Grid_Hard_67 -> ("Hard", 67)
    rgba = _to_canvas_rgba(smap, W, H)
    inset = int(Ci * 0.27)
    def qcol(c): return tuple(int(v) // 32 * 32 for v in c)
    cellcol = {}
    for r in range(H // Ci):
        for c in range(W // Ci):
            p = rgba[r*Ci+inset:r*Ci+Ci-inset, c*Ci+inset:c*Ci+Ci-inset]
            op = p[p[:, :, 3] > 128][:, :3]
            if len(op) >= 40:
                cellcol[(r, c)] = qcol(np.median(op, axis=0))
    if not cellcol:
        raise SystemExit("Solution/Grid katmanında renkli hücre bulunamadı.")
    regions = defaultdict(list)
    for cell, col in cellcol.items():
        regions[col].append(cell)
    # ---- match each piece (in solved position) to its colour by cell overlap ----
    grp = _find_layer(psd, "pieces", group=True)
    parts = [l for l in grp if not l.is_group()]
    assigned = {}; used = Counter()
    for idx, layer in enumerate(parts):
        pil, bbox = _trim(layer)
        if pil is None:
            continue
        a = np.asarray(pil)[:, :, 3].astype(np.float32) / 255.0
        L, T, R, B = bbox; Hh, Ww = a.shape
        votes = Counter()
        for r in range(T // Ci, -(-B // Ci)):
            for c in range(L // Ci, -(-R // Ci)):
                if (r, c) not in cellcol:
                    continue
                y0, x0 = r*Ci - T, c*Ci - L
                yy0, xx0 = max(0, y0), max(0, x0)
                yy1, xx1 = min(Hh, y0 + Ci), min(Ww, x0 + Ci)
                if yy1 <= yy0 or xx1 <= xx0:
                    continue
                if float((a[yy0:yy1, xx0:xx1] > ALPHA_T).mean()) >= 0.15:
                    votes[cellcol[(r, c)]] += 1
        if votes:
            col = votes.most_common(1)[0][0]
            assigned[idx] = (col, pil, bbox); used[col] += 1
    bijection = len(assigned) == len(parts) and all(v == 1 for v in used.values())
    # ---- play area = cells of the colours a piece claimed (drops Grid border/bg) ----
    play = {cell for col in used for cell in regions[col]}
    if not play:
        raise SystemExit("Hiçbir parça Grid rengine eşleşmedi.")
    rmin = min(r for r, c in play); rmax = max(r for r, c in play)
    cmin = min(c for r, c in play); cmax = max(c for r, c in play)
    rows, cols = rmax - rmin + 1, cmax - cmin + 1
    gridmap = [[1 if (rmin + r, cmin + c) in play else 0 for c in range(cols)]
               for r in range(rows)]
    # ---- items (footprint from the colour region; art from the solved bbox) ----
    items = []; n = 0
    for idx in sorted(assigned):
        col, pil, bbox = assigned[idx]
        reg = regions[col]
        r0 = min(r for r, c in reg); c0 = min(c for r, c in reg)
        cells = sorted([[r - r0, c - c0] for r, c in reg])
        w = max(cc for rr, cc in cells) + 1; h = max(rr for rr, cc in cells) + 1
        L, T, R, B = bbox
        art = {"dx": round((L - c0 * C) / C, 2), "dy": round((T - r0 * C) / C, 2),
               "iw": round((R - L) / C, 2), "ih": round((B - T) / C, 2)}
        n += 1
        if copy_pngs:
            pil.save(os.path.join(out_dir, f"{n}.png"))
        # sol = the piece's solved board position (its region top-left, relative to
        # the play-area top-left) — used by the in-game hint overlay
        items.append({"img": f"{slug}/{n}.png", "w": w, "h": h, "cells": cells, "art": art,
                      "sol": [r0 - rmin, c0 - cmin]})
    # ---- background + cell-tile images ----
    bg_img = cell_img = None
    bgl = _find_layer(psd, "bg")
    if bgl is not None:
        bg_img = f"{slug}/bg.png"
        if copy_pngs:
            _trim(bgl)[0].save(os.path.join(out_dir, "bg.png"))
    cl = _find_layer(psd, "cell")
    if cl is not None:
        cell_img = f"{slug}/cell.png"
        if copy_pngs:
            _trim(cl)[0].save(os.path.join(out_dir, "cell.png"))
    level = {
        "title": name, "emoji": "🎁", "sub": f"{name} parçalarını yerleştir!",
        "bg": BG_PALETTE, "rows": rows, "cols": cols, "bareGrid": True,
        "gridMap": gridmap, "items": items,
        "winEmoji": "🎉", "winTitle": "Harika!", "winDesc": f"{name} tamamlandı!",
    }
    if bg_img: level["bgImg"] = bg_img
    if cell_img: level["cellImg"] = cell_img
    if difficulty: level["difficulty"] = difficulty   # read from Grid layer name
    if order is not None: level["order"] = order       # for later level ordering
    whites = sum(sum(row) for row in gridmap)
    pcells = sum(len(it["cells"]) for it in items)
    info = dict(C=C, ox=0.0, oy=0.0, resid=0.0, slug=slug, n=len(items), cols=cols,
                rows=rows, board=(smap.name or "grid").strip().lower(),
                whites=whites, pcells=pcells, bijection=bijection,
                difficulty=difficulty, order=order)
    return level, info


def build_level(psb_path, name, cols=6, slug=None, out_dir=None, copy_pngs=True):
    psd = PSDImage.open(psb_path)
    pieces = collect_pieces(psd)
    if not pieces:
        raise SystemExit("No numbered piece layers found (layers must be named 1,2,3,...).")
    bboxes = [pieces[n][1] for n in pieces]
    C, ox, oy, resid = detect_grid(bboxes)
    slug = slug or slugify(name)
    out_dir = out_dir or slug
    if copy_pngs:
        os.makedirs(out_dir, exist_ok=True)
    items = []
    for n in sorted(pieces):
        a, bbox, pil = pieces[n]
        cells, w, h, art = piece_cells(a, bbox, C, ox, oy)
        if copy_pngs:
            pil.save(os.path.join(out_dir, f"{n}.png"))
        items.append({"img": f"{slug}/{n}.png", "w": w, "h": h, "cells": cells, "art": art})
    map_grid = read_map(psd, C)
    if map_grid:                       # board comes from the 'map' layer's white cells
        gridmap = map_grid
        brows, bcols = len(map_grid), len(map_grid[0])
        board_src = "map"
    else:                              # no map layer: auto-pack a solvable rectangle
        bcols, brows = make_board(items, cols)
        gridmap = [[1] * bcols for _ in range(brows)]
        board_src = "auto"
    level = {
        "title": name, "emoji": "🎁", "sub": f"{name} parçalarını yerleştir!",
        "bg": BG_PALETTE, "rows": brows, "cols": bcols, "bareGrid": True,
        "gridMap": gridmap, "items": items,
        "winEmoji": "🎉", "winTitle": "Harika!", "winDesc": f"{name} tamamlandı!",
    }
    whites = sum(sum(row) for row in gridmap)
    pcells = sum(len(it["cells"]) for it in items)
    return level, dict(C=C, ox=ox, oy=oy, resid=resid, slug=slug, n=len(items),
                       cols=bcols, rows=brows, board=board_src, whites=whites, pcells=pcells)


def level_to_js(level):
    """Compact one-line JS object for insertion into the LEVELS array."""
    def cells_js(cells):
        return "[" + ",".join(f"[{r},{c}]" for r, c in cells) + "]"
    items_js = ",".join(
        "{img:%s,w:%d,h:%d,cells:%s,art:{dx:%s,dy:%s,iw:%s,ih:%s}%s}" % (
            json.dumps(it["img"]), it["w"], it["h"], cells_js(it["cells"]),
            it["art"]["dx"], it["art"]["dy"], it["art"]["iw"], it["art"]["ih"],
            (",sol:[%d,%d]" % (it["sol"][0], it["sol"][1])) if it.get("sol") else "")
        for it in level["items"])
    gm = "[" + ",".join("[" + ",".join(str(v) for v in row) + "]" for row in level["gridMap"]) + "]"
    extra = "".join(",%s:%s" % (k, json.dumps(level[k]))
                    for k in ("bgImg", "cellImg", "difficulty", "order") if level.get(k) is not None)
    return ("{title:%s,emoji:'%s',sub:%s,bg:%s%s,rows:%d,cols:%d,bareGrid:true,gridMap:%s,"
            "items:[%s],winEmoji:'%s',winTitle:%s,winDesc:%s}" % (
        json.dumps(level["title"]), level["emoji"], json.dumps(level["sub"]),
        json.dumps(level["bg"]), extra, level["rows"], level["cols"], gm, items_js,
        level["winEmoji"], json.dumps(level["winTitle"]), json.dumps(level["winDesc"])))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("psb"); ap.add_argument("name")
    ap.add_argument("--cols", type=int, default=6)
    ap.add_argument("--slug", default=None, help="folder + img-path prefix (default: from name)")
    ap.add_argument("--out-dir", default=None)
    ap.add_argument("--no-png", action="store_true")
    a = ap.parse_args()
    probe = PSDImage.open(a.psb)
    if is_solution_psb(probe):
        level, info = build_level_solution(a.psb, a.name, slug=a.slug, out_dir=a.out_dir,
                                            copy_pngs=not a.no_png, psd=probe)
    else:
        level, info = build_level(a.psb, a.name, cols=a.cols, slug=a.slug,
                                  out_dir=a.out_dir, copy_pngs=not a.no_png)
    warn = "" if info["whites"] == info["pcells"] else \
        f"  ⚠ board cells ({info['whites']}) != piece cells ({info['pcells']}) — may be unsolvable"
    if info.get("bijection") is False:
        warn += "  ⚠ piece↔colour matching is not 1-to-1"
    meta = ""
    if info.get("difficulty") or info.get("order") is not None:
        meta = f" | difficulty={info.get('difficulty')} order={info.get('order')}"
    sys.stderr.write(
        f"[psb_to_level] {info['n']} pieces | cell C={info['C']:.1f} "
        f"origin=({info['ox']:.0f},{info['oy']:.0f}) edge-resid={info['resid']:.3f} "
        f"| board[{info['board']}] {info['cols']}x{info['rows']} "
        f"({info['whites']} cells){meta} -> {info['slug']}/{warn}\n")
    print(level_to_js(level))


if __name__ == "__main__":
    main()
