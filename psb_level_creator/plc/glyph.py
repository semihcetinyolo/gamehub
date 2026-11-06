"""The glyph of a target: only the letter object itself, on real alpha.

The scene patch (build.target_layer) keeps the letter's rim, its shadow and the changed pieces around it so that the
letter can be removed from the scene seamlessly. That patch is wrong for what flies into the phrase slot and for
hit-testing: a chunk of wicker or cloth comes with it. The glyph is the object alone:

1. Seeds: pixels the edit clearly changed (+-3 px tolerant diff above `hi`, scaled to the letter's own contrast) that
   are not explained by the BG: neither the same structure re-rendered (local correlation with the BG) nor a shadow
   (same hue, darker, a smooth ratio field).
2. Colour: a GMM of the seeds' Lab colours against one of the BG's own pixels around the letter (the clean scene)
   plus the answer outside the candidate. The log-likelihood ratio and the diff make one score per pixel.
3. Edges: the score's probability is refined with a guided filter on the answer (He et al.), so the cut follows the
   object's own outline; then hysteresis (`p_hi` seeds, `p_lo` reach), a small closing, small holes filled (the
   inside of an O stays open), pieces too small next to the largest dropped.
4. A 1-2 px anti-aliased edge.

No shadow, no scene: thin protrusions stay when they are part of the object (they have their own colour and outline).
"""
from __future__ import annotations

import cv2
import numpy as np
from scipy import ndimage as ndi
from sklearn.mixture import GaussianMixture

from . import detect as D

GLYPH = dict(
    pad=16,          # px of context around the candidate box
    near=4,          # px: the glyph stays within the candidate mask grown this much
    hi=45,           # seed diff (blurred +-3 px tolerant diff) at most ...
    hi_min=15,       # ... and at least this; in between 0.6 x the letter's 90th percentile diff
    hi_rel=0.6,
    seed_min=20,     # fewer seed px: no colour model, the glyph is the thresholded diff
    gmm=5,           # components per colour model
    wc=0.35,         # weight of the colour log-likelihood ratio
    ds=8,            # diff scale of the score: (diff - hi / 2) / ds
    ws=2.0,          # score penalty where the BG explains the pixel (re-rendered or shadow)
    gr=8,            # guided filter radius
    eps=2e-3,        # guided filter regularisation
    p_lo=0.3,        # hysteresis on the refined probability
    p_hi=0.6,
    close=3,         # closing iterations (bridges 1-4 px gaps along a rope or a wire)
    hole_min=60,     # holes up to max(hole_min, hole_frac x glyph area) are filled
    hole_frac=0.004,
    hole_diff=10,    # bigger holes are filled when their median diff is above max(hole_diff, hole_noise x the
    hole_noise=2.5,  #   redraw noise outside the candidate): the edit painted there, it is the letter's body
    min_frac=0.02,   # pieces smaller than this share of the largest piece are dropped
    close_rel=0.4,   # stroke closing: this share of the stroke width (0 = off), see _close_strokes
    bite_noise=1.5,  #   it adds pixels whose diff is above this x the redraw noise
    new_min=3,       # blurred +-3 px diff below this vs the edit's own BG = not new: never glyph
    sam_reach=10,
    sam_close=0,     # with_sam: closing iterations on the result (0 = off): bridges a gap a thin occluder leaves
    sam_trust=False,  # with_sam: SAM's outline as it is (no new-pixels / counter / seed / shadow cuts): for letters
                      #   whose face is the BG's own paint (outlined on glass, engraved)
    sam_counter=0.03,  # with_sam: an unchanged hole of the automatic glyph this big (share of the outline) stays open    # with_sam: the SAM outline counts up to this many px outside the candidate mask
    shadow_open=3,   # shadow areas thinner than about 2x this many px are not cut off
    aa=0.8,          # sigma of the anti-aliased edge (about 1-2 px)
)

SHADOW = dict(spread=1.35, ratio=0.9, smooth=0.12)  # see explained()


def _gray(x):
    return x[..., 0] * 0.299 + x[..., 1] * 0.587 + x[..., 2] * 0.114


def explained(A: np.ndarray, B: np.ndarray):
    """(same, shadow) masks: where the answer is the BG's own structure re-rendered, and where it is the BG darkened
    (same hue, a smooth ratio field: a cast or contact shadow)."""
    ga, gb = _gray(A), _gray(B)
    k = (7, 7)
    ma, mb = cv2.blur(ga, k), cv2.blur(gb, k)
    va = np.maximum(cv2.blur(ga * ga, k) - ma * ma, 0)
    vb = np.maximum(cv2.blur(gb * gb, k) - mb * mb, 0)
    ncc = (cv2.blur(ga * gb, k) - ma * mb) / np.sqrt(va * vb + 1e-3)
    same = (np.sqrt(va) > 4) & (np.sqrt(vb) > 4) & (ncc > 0.6)
    # a shadow darkens every channel by about the same factor, smoothly; an object brings its own colour and edges
    Ab, Bb = cv2.blur(A, (5, 5)) + 6, cv2.blur(B, (5, 5)) + 6
    rc = Ab / Bb
    ratio = rc.mean(2)
    spread = rc.max(2) / rc.min(2)
    rs = np.sqrt(np.maximum(cv2.blur(ratio * ratio, k) - cv2.blur(ratio, k) ** 2, 0)) / (ratio + 0.05)
    shadow = (spread < SHADOW['spread']) & (ratio < SHADOW['ratio']) & (ratio > 0.12) & (rs < SHADOW['smooth'])
    return same, shadow


def guided(I: np.ndarray, p: np.ndarray, r: int, eps: float) -> np.ndarray:
    """Guided filter of p with the colour guide I (HxWx3, 0..1): p's edges snap to I's."""
    box = lambda x: cv2.boxFilter(x, -1, (2 * r + 1, 2 * r + 1))
    mI, mp = box(I), box(p)
    cov = box(I * p[..., None]) - mI * mp[..., None]
    var = np.empty(I.shape[:2] + (3, 3), np.float32)
    for i in range(3):
        for j in range(3):
            var[..., i, j] = box(I[..., i] * I[..., j]) - mI[..., i] * mI[..., j]
    a = np.linalg.solve(var + eps * np.eye(3, dtype=np.float32), cov[..., None])[..., 0]
    b = mp - (a * mI).sum(2)
    return (box(a) * I).sum(2) + box(b)


def _keep_pieces(g, seeds, min_frac):
    lab, n = ndi.label(g)
    if not n:
        return g
    keep = np.unique(lab[seeds])
    keep = keep[keep > 0]
    if not len(keep):
        return np.zeros_like(g)
    sz = ndi.sum(g, lab, range(1, n + 1))
    big = max(sz[k - 1] for k in keep)
    return np.isin(lab, [k for k in keep if sz[k - 1] >= max(30, min_frac * big)])


def _fill_changed_holes(g, db, near, o):
    """Fill the holes the edit really painted over (the letter's own body where its colour matches the scene behind:
    wood on wood): a hole whose median diff stands well above the redraw noise. A counter (the inside of an O, the
    scene seen through it) is unchanged and stays open."""
    holes = ndi.binary_fill_holes(g) & ~g
    if not holes.any():
        return g
    quiet = ~near
    noise = float(np.median(db[quiet])) if quiet.sum() > 50 else 4.0
    lim = max(o['hole_diff'], o['hole_noise'] * noise)
    lab, n = ndi.label(holes)
    med = ndi.median(db, lab, range(1, n + 1))
    return g | np.isin(lab, [j + 1 for j in range(n) if med[j] > lim])


def _close_strokes(g, db, near, o):
    """Bridge the bites a wide stroke loses where its colour matches the scene behind (wood on wood): a closing
    scaled to the stroke width (close_rel x 2 x the 90th percentile distance to the edge), adding only pixels the edit
    did paint (diff above the redraw noise). Thin wires get a small closing, so the gaps between them stay."""
    if not o['close_rel'] or not g.any():
        return g
    w = 2 * float(np.percentile(ndi.distance_transform_edt(g)[g], 90))
    k = int(round(o['close_rel'] * w))
    if k <= o['close']:
        return g
    quiet = ~near
    noise = float(np.median(db[quiet])) if quiet.sum() > 50 else 4.0
    pad = k + 1
    closed = ndi.binary_closing(np.pad(g, pad), structure=ndi.generate_binary_structure(2, 1),
                                iterations=k)[pad:-pad, pad:-pad]
    return g | (closed & near & (db > max(o['new_min'], o['bite_noise'] * noise)))


def glyph_mask(A: np.ndarray, B: np.ndarray, M: np.ndarray, opts=None):
    """(mask, info) of the letter object inside one window: A the (registered, tone-matched) answer, B the BG,
    M the candidate mask (all the same window, float or uint8 RGB)."""
    o = {**GLYPH, **(opts or {})}
    A = A.astype(np.float32)
    B = B.astype(np.float32)
    db = cv2.GaussianBlur(D.tolerant_diff(A, B, 3, 0), (0, 0), 1.0)
    same, shadow = explained(A, B)
    Mf = ndi.binary_fill_holes(M)  # a mask cut to changed pixels (cut_unchanged) may have holes in the object
    near = ndi.binary_dilation(Mf, iterations=o['near']) if o['near'] else Mf
    p90 = float(np.percentile(db[M], 90)) if M.any() else 0.0
    hi = float(np.clip(o['hi_rel'] * p90, o['hi_min'], o['hi']))
    seeds = (db > hi) & ~same & ~shadow & M
    info = dict(hi=round(hi, 1), seeds=int(seeds.sum()))
    if seeds.sum() < o['seed_min']:
        g = _keep_pieces((db > hi / 2) & near & ~shadow, (db > hi) & M, o['min_frac'])
        info['mode'] = 'diff'
    else:
        La = cv2.cvtColor(np.clip(A, 0, 255).astype(np.uint8), cv2.COLOR_RGB2LAB).astype(np.float32)
        Lb = cv2.cvtColor(np.clip(B, 0, 255).astype(np.uint8), cv2.COLOR_RGB2LAB).astype(np.float32)
        rng = np.random.default_rng(0)

        def sample(x, n=4000):
            return x[rng.choice(len(x), min(n, len(x)), replace=False)]

        fgx = sample(La[seeds])
        bgx = sample(np.vstack([Lb[near], La[~near], La[shadow & near]]))
        kf, kb = max(1, min(o['gmm'], len(fgx) // 20)), max(1, min(o['gmm'], len(bgx) // 20))
        gf = GaussianMixture(kf, covariance_type='full', reg_covar=4, random_state=0).fit(fgx)
        gb = GaussianMixture(kb, covariance_type='full', reg_covar=4, random_state=0).fit(bgx)
        X = La.reshape(-1, 3)
        llr = (gf.score_samples(X) - gb.score_samples(X)).reshape(db.shape)
        s = o['wc'] * np.clip(llr, -10, 10) + (db - hi / 2) / o['ds']
        s[same & (db < hi)] -= o['ws']
        s[shadow & (db < hi)] -= o['ws']
        s[seeds] = 6
        s[~near] = -8
        p = (1 / (1 + np.exp(-s))).astype(np.float32)
        pr = guided((A / 255).astype(np.float32), p, o['gr'], o['eps'])
        pr[~near] = 0
        g = _keep_pieces(pr > o['p_lo'], pr > o['p_hi'], 0)
        info['mode'] = 'colour'
    if o['close'] and g.any():
        c = o['close'] + 1
        g = (ndi.binary_closing(np.pad(g, c), iterations=o['close'])[c:-c, c:-c] | g) & near
    # no cast or contact shadow, even where the filter or the closing pulled it in; only broad shadow areas count
    # (a thin dark rim along the object itself can pass the shadow test too)
    broad = ndi.binary_opening(shadow & ~seeds, iterations=o['shadow_open']) if o['shadow_open'] else shadow & ~seeds
    if broad.any():
        g &= ~ndi.binary_dilation(broad, iterations=1) | seeds
        g = ndi.binary_opening(g) | (g & seeds)
    g &= db >= o['new_min']  # the glyph is new pixels only: what the edit's BG explains (old paper, scene) leaves
    g = _keep_pieces(g, seeds | (g & (db > hi)), o['min_frac'])
    g = D.fill_small_holes(g, max(o['hole_min'], int(o['hole_frac'] * g.sum())))
    g = _fill_changed_holes(g, db, near, o)
    g = _close_strokes(g, db, near, o)
    lab, n = ndi.label(g)
    info.update(pieces=int(n), area=int(g.sum()), cover=round(float((g & M).sum()) / max(1, int(M.sum())), 3))
    return g, info


def glyph_alpha(g: np.ndarray, aa: float = GLYPH['aa']) -> np.ndarray:
    """Float alpha with a 1-2 px anti-aliased edge: opaque inside, fading over the mask's border pixels."""
    if not g.any():
        return np.zeros(g.shape, np.float32)
    a = cv2.GaussianBlur(g.astype(np.float32), (0, 0), aa) if aa else g.astype(np.float32)
    a[ndi.binary_erosion(g)] = 1.0
    a[~ndi.binary_dilation(g, iterations=2)] = 0.0
    return np.clip(a, 0, 1)


def decontaminate(rgb: np.ndarray, g: np.ndarray) -> np.ndarray:
    """Edge pixels (the anti-aliased rim and the mask's outer pixel) take the colour of the nearest inner glyph pixel,
    so no light or dark fringe of the scene shows when the glyph sits on another background (the phrase slot)."""
    inner = ndi.binary_erosion(g, iterations=1)
    if not inner.any():
        return rgb
    dist, (iy, ix) = ndi.distance_transform_edt(~inner, return_indices=True)
    rim = ~inner & (dist <= 3)  # a wire too thin to have an inside keeps its own pixels
    out = rgb.copy()
    out[rim] = rgb[iy[rim], ix[rim]]
    return out


def with_sam(A: np.ndarray, B: np.ndarray, M: np.ndarray, S: np.ndarray, opts=None):
    """(mask, info): the glyph from a SAM outline S (plc/sam.py) and the diff, same window as glyph_mask.
    SAM gives the object's outline (whole strokes where wood meets wood, no scene inside it); the diff keeps only new
    pixels (what the edit's own BG explains leaves), cuts broad shadow, and the counters the automatic glyph found
    (unchanged holes: the inside of an O) stay open."""
    o = {**GLYPH, **(opts or {})}
    A = A.astype(np.float32)
    B = B.astype(np.float32)
    auto, _ = glyph_mask(A, B, M, o)
    db = cv2.GaussianBlur(D.tolerant_diff(A, B, 3, 0), (0, 0), 1.0)
    _, shadow = explained(A, B)
    # sam_trust: the whole window (candidate box + pad) counts, a faint letter's candidate mask holds only parts of it
    reach = np.ones_like(M) if o['sam_trust'] else ndi.binary_dilation(ndi.binary_fill_holes(M), iterations=o['sam_reach'])
    g = S & reach
    # SAM leaves a see-through counter out itself; where it filled one (the inside of an O), the automatic glyph's
    # unchanged holes open it again - only big ones (>= sam_counter of the outline), so a small low-diff spot of the
    # body (wood on wood) is not punched out
    counters = ndi.binary_fill_holes(auto) & ~auto & g
    lab, n = ndi.label(counters)
    if n and not o['sam_trust']:
        sz = ndi.sum(counters, lab, range(1, n + 1))
        g &= ~np.isin(lab, [j + 1 for j in range(n) if sz[j] > max(o['hole_min'], o['sam_counter'] * g.sum())])
    if not o['sam_trust']:
        g &= db >= o['new_min']
    # a cast shadow SAM took in lies at the outline's edge; a darker patch enclosed by the object is its own paint
    broad = ndi.binary_opening(shadow & ~auto & g, iterations=o['shadow_open']) if o['shadow_open'] else shadow & ~auto & g
    lab, n = ndi.label(broad)
    if n and not o['sam_trust']:  # trusted: an engraving's own shading passes the shadow test
        edge = ndi.binary_dilation(~g, iterations=2)
        cut = np.isin(lab, np.unique(lab[edge & (lab > 0)]))
        g &= ~ndi.binary_dilation(cut, iterations=1)
    # (no opening here: SAM's thin wires stay; crumbs go with the piece filter below)
    # sam_trust: the letter's face may be the BG's own paint (a letter outlined on glass, a faint engraving): keep
    # every SAM piece that is not a crumb; otherwise a piece needs changed pixels to stay
    g = _keep_pieces(g, g if o['sam_trust'] else g & (auto | (db > 2 * o['hi_min'])), o['min_frac'])
    if o['sam_close']:  # bridge a thin occluder SAM cut out of the object (a cord in front of a ring)
        k = o['sam_close'] + 1
        g = ndi.binary_closing(np.pad(g, k), iterations=o['sam_close'])[k:-k, k:-k] | g
    g = D.fill_small_holes(g, max(o['hole_min'], int(o['hole_frac'] * g.sum())))
    info = dict(mode='sam', pieces=int(ndi.label(g)[1]), area=int(g.sum()),
                cover=round(float((g & M).sum()) / max(1, int(M.sum())), 3),
                sam_px=int((S & reach).sum()), auto_px=int(auto.sum()))
    return g, info
