"""Park level v2 (blend + hide): green tree frogs that melt into the lawn and bushes.
Targets: S = holding a yellow sunflower (object), C = red cap (worn), T = long pink tongue catching a fly (action), D = plain frog.
Feature decoys (green look-alikes that borrow a feature, all go to D): s / c / t = chameleon or turtle with that feature."""

NAME = 'park'
GROUPS = [('T', 'Tongue'), ('S', 'Sunflower'), ('C', 'RedCap')]  # top of the layer panel first = first stage
TARGET = {'S': 10, 'C': 10, 'T': 10, 'D': 40, 's': 5, 'c': 7, 't': 8}
D_KINDS = 'Dsct'
CHAR_H = 170
FIRST_ROUND = 27

CH, TU = 'chameleon', 'turtle'
REGIONS = [
    ((90, 230, 700, 760), [('D', 'peeking out of the left window of the blue house, only head and hands on the sill'),
                           ('C', 'sitting at the foot of the drainpipe, half behind it'), ('t', CH, 'clinging to the drainpipe')]),
    ((620, 780, 1480, 1400), [('D', 'sitting on the seat of the green chair, green on green'), ('S', 'peeking out from behind the pot of red geraniums, sunflower poking up'),
                              ('T', 'sitting inside the fruit bowl'), ('D', 'hiding under the round table, half in its shadow')]),
    ((1500, 600, 2000, 1380), [('C', 'peeking out of one of the red rain boots'), ('D', 'crouching behind the porch step post'),
                               ('s', TU, 'on the welcome mat'), ('D', 'sitting next to the pot of flowers at the deck edge')]),
    ((2030, 560, 2760, 1080), [('T', 'sitting on top of the green watering can'), ('D', 'peeking out from behind the barbecue grill'),
                               ('S', 'half behind the blue cabinet, only head, arm and sunflower showing'), ('c', CH, 'on top of the blue cabinet')]),
    ((0, 1250, 600, 2140), [('D', 'lying along a big green tree branch among the leaves'), ('C', 'peeking out from behind the tree trunk'),
                            ('T', 'sitting on the wooden swing seat'), ('D', 'sitting in the grass between the tree roots')]),
    ((680, 1560, 1450, 2080), [('D', 'climbing the blue ladder of the slide'), ('S', 'sitting at the bottom of the yellow slide'),
                               ('c', TU, 'inside the hula hoop'), ('D', 'peeking out from behind a wooden block, only head and hands visible')]),
    ((1480, 1560, 2100, 2150), [('T', 'sitting on a hopscotch square'), ('D', 'crouching behind a wooden block'), ('C', 'hopping on the hopscotch'), ('D', 'peeking out of the grass at the path edge'), ('s', CH, 'next to the wooden blocks')]),
    ((2120, 1100, 2770, 1770), [('D', 'hiding among the tomato plant leaves, only head showing'), ('S', 'sitting between the carrot leaves in the vegetable bed'),
                                ('t', CH, 'climbing a tomato stake'), ('D', 'peeking over the wooden edge of the vegetable bed')]),
    ((2800, 1100, 3510, 1790), [('C', 'standing inside the greenhouse, seen through the glass'), ('D', 'sitting inside a big flower pot among the flowers'),
                                ('T', 'peeking out from behind the pink flower pot'), ('s', CH, 'in the open greenhouse door')]),
    ((3540, 900, 4096, 1720), [('D', 'sitting on the stack of soil bags'), ('S', 'peeking out of the vegetable basket'),
                               ('D', 'curled up inside the coiled green garden hose'), ('c', TU, 'next to the ladder')]),
    ((2300, 1800, 3010, 2390), [('T', 'sitting inside the red wheelbarrow'), ('D', 'hiding between big cabbage leaves, only head showing'),
                                ('C', 'peeking from behind the wheelbarrow wheel'), ('t', TU, 'on the soil of the cabbage bed')]),
    ((3230, 1800, 3900, 2420), [('D', 'sitting among the jars on the workbench'), ('S', 'sitting under the workbench in its shadow'),
                                ('D', 'peeking out from behind a seed bag'), ('c', CH, 'on the workbench next to the seed packets')]),
    ((380, 2150, 1170, 2720), [('C', 'peeking out of a window of the sand castle'), ('D', 'half buried in the sand, only head showing'),
                               ('T', 'sitting on the wooden edge of the sandbox'), ('s', TU, 'in the sandbox'), ('D', 'peeking out from behind the sand bucket')]),
    ((1190, 2160, 2040, 2720), [('D', 'sitting inside the red toy wagon among the blocks'), ('S', 'peeking out of the green bushes'),
                                ('D', 'crouching behind the striped beach ball'), ('t', CH, 'on the grass near the jump rope')]),
    ((300, 2760, 830, 3560), [('T', 'sitting on the workbench inside the shed'), ('D', 'peeking out of the open red toolbox'),
                              ('C', 'in the dark doorway of the shed, half hidden by the door frame')]),
    ((850, 2760, 1620, 3580), [('D', 'sitting in the basket of the blue bicycle'), ('S', 'lying on the rolled-up green mat, green on green'),
                               ('D', 'peeking out of the wooden crate by the bicycle wheel'), ('c', TU, 'behind the plank, head poking out')]),
    ((1640, 2860, 2150, 3580), [('C', 'sitting on the colorful wooden chair'), ('D', 'peeking out of the bucket of garden tools'),
                                ('t', CH, 'under the chair'), ('D', 'hiding behind a big fern')]),
    ((2440, 2440, 3060, 2990), [('T', 'curled up on the cushions of the hanging egg chair'), ('D', 'peeking out between the potted palm leaves'),
                                ('S', 'sitting on the stone wall next to the fountain'), ('s', CH, 'in the fountain basin')]),
    ((2160, 3010, 2950, 3560), [('D', 'crouching behind a flat stepping stone, only head showing'), ('C', 'peeking through the open wooden gate'),
                                ('D', 'sitting on a stepping stone'), ('t', TU, 'in the grass by the gate'), ('D', 'half hidden in the tall grass')]),
    ((3080, 2620, 4000, 3420), [('S', 'lying in the striped hammock'), ('D', 'sitting in the bird bath'), ('T', 'half hidden among the rock garden plants'),
                                ('D', 'peeking out from under the mosaic table'), ('c', CH, 'on the patterned floor cushions')]),
    ((2960, 3460, 4096, 4096), [('D', 'sitting on a lily pad in the pond'), ('C', 'peeking out of the water between the pond rocks'),
                                ('D', 'half hidden among the reeds and ferns at the pond edge'), ('S', 'sitting on a pond rock'), ('t', TU, 'on the pond rocks')]),
    ((700, 3600, 1650, 4096), [('T', 'peeking out of the metal watering can'), ('D', 'sitting inside the yellow crate'),
                               ('D', 'hiding among the fern leaves'), ('C', 'peeking from behind the birdhouse post'), ('s', CH, 'on the grass by the crate')]),
    ((2060, 3580, 2930, 4096), [('S', 'peeking out from behind the old wooden trunk'), ('D', 'sitting on top of the old wooden trunk'),
                                ('T', 'half behind the garden clock post'), ('c', TU, 'in the grass')]),
    ((3000, 0, 4096, 860), [('D', 'sitting on a big branch of the tree among the leaves'), ('C', 'sitting on top of the wooden fence'),
                            ('D', 'peeking over the fence, only eyes and hands showing'), ('t', CH, 'on the tree trunk'), ('s', TU, 'in the grass behind the fence')]),
    ((0, 3660, 400, 4090), [('D', 'peeking out of the green bush, only head and hands showing'), ('S', 'sitting in the grass in front of the bush')]),
    ((0, 2180, 370, 2470), [('D', 'sitting among the tree roots'), ('T', 'in the grass'), ('D', 'peeking out of the grass')]),
    ((2050, 2180, 2290, 2540), [('D', 'sitting at the edge of the stone path, half behind a tuft of grass')]),
    # second round: fill the counts in free spots (coverage map of the found characters)
    ((1712, 736, 2064, 1088), [('D', 'sitting next to the blue garden clogs on the deck'), ('s', TU, 'on the deck boards')]),
    ((1664, 1100, 2016, 1440), [('D', 'peeking over the edge of the deck step, only head and hands showing'), ('D', 'sitting on the deck step')]),
    ((816, 1232, 1168, 1584), [('D', 'hiding among the flower pots below the deck, only head showing'), ('S', 'peeking out between the flower pots')]),
    ((2960, 2080, 3312, 2432), [('D', 'sitting next to the garden gloves'), ('s', TU, 'on the grass')]),
    ((3312, 2080, 3664, 2432), [('c', CH, 'on the stone wall among the roses'), ('D', 'peeking over the stone wall')]),
    ((3664, 2080, 4016, 2432), [('D', 'peeking out between the roses')]),
    ((0, 2448, 352, 2800), [('D', 'peeking out of the green bush')]),
    ((1824, 2640, 2176, 2992), [('D', 'hiding in the bush, only head showing'), ('S', 'peeking out of the bush')]),
    ((1248, 2928, 1600, 3280), [('D', 'sitting on the bicycle saddle'), ('D', 'peeking from behind the bicycle wheel')]),
    ((2400, 0, 2752, 352), [('s', CH, 'on top of the wooden fence')]),
    ((3744, 0, 4096, 352), [('D', 'sitting among the tree leaves')]),
    ((688, 352, 1040, 704), [('D', 'peeking out of the house window, only head and hands on the sill')]),
    # third round: spares after duplicate drops
    ((2960, 2432, 3280, 2752), [('D', 'peeking over the stone wall, only head and hands showing')]),
    ((512, 1232, 832, 1552), [('D', 'sitting among the tree leaves')]),
    ((2848, 592, 3168, 912), [('S', 'sitting on the grass in front of the wooden fence')]),
    ((320, 2448, 640, 2768), [('D', 'hiding in the green bush, only head showing')]),
    # fourth round: replace two glitchy frogs (floating planter, blurry bush)
    ((1560, 2580, 1900, 2900), [('D', 'peeking out of the green bush, only head and hands showing')]),
]

FEATURE = {
    'S': 'holding a big bright YELLOW SUNFLOWER (yellow petals, brown middle) on its stem',
    'C': 'wearing a bright RED baseball CAP',
    'T': 'catching a fly with its long pink TONGUE stretched far out of its mouth',
}
SPECIES = {
    'chameleon': 'a green CHAMELEON (curled tail, crest on its head, turret eyes) - clearly a chameleon, NOT a frog',
    'turtle': 'a small green TURTLE (round shell, head and legs out of the shell) - clearly a turtle, NOT a frog',
}


def _item(k, rest):
    if k.isupper():
        what = 'a frog' if k == 'D' else f'a frog {FEATURE[k]}'
        return f'{what}, {rest[0]}' + (' (holding nothing, wearing nothing, mouth closed)' if k == 'D' else '')
    sp, where = rest
    return f'{SPECIES[sp]}, {FEATURE[k.upper()]}, {where}'


def description(rect, items):
    x0, y0, x1, y1 = rect
    pct = round(100 * CHAR_H / (y1 - y0))
    lines = [f'{i}. {_item(it[0], it[1:])}' for i, it in enumerate(items, 1)]
    return (
        f'Add exactly {len(items)} small cartoon animals into this region, hidden-object style: tuck them into the scenery so they are '
        'partly covered and blend in, exactly as described, never lined up in open space. Every FROG is the same character as in the reference '
        'image (same green skin that matches the lawn, lighter belly, darker spots, big golden eyes). Chameleons and turtles are different animals with their own look. '
        f'Each animal is small: about {pct}% of the region height or less, the natural size for this garden. '
        'Spread them apart: no two animals touch or overlap, and every animal stays inside the region, away from its edges. '
        'When an animal is partly hidden, the scenery in front of it covers part of its body, but its sunflower, red cap or tongue (if it has one) stays clearly visible.\n'
        + '\n'.join(lines) + '\n'
        'Only the animals described with a sunflower hold a flower; only those described with a cap wear anything; only those described catching a fly show a tongue. '
        'Keep everything else in the region exactly as it is (same objects, positions and colors). '
        "Match the scene's cartoon line work, outlines and lighting, with soft contact shadows. No other characters, no text."
    )


def tol_r(region):
    """Shift tolerance of the diff: green frogs on green grass vanish with the default 8 px (kept for round one so ids stay put)."""
    return 2 if region and region > FIRST_ROUND else 8


# detection hooks (detect.py): any big changed blob is an animal; species, tongue and caps are marked by eye on the sheet
def is_head(st, area):
    return area > 2500


def is_prop(st):
    return False


def features(c):
    f = []
    if c['yellow'] > 0.08: f.append('S')
    if c['red'] > 0.06: f.append('C')
    return f


def check():
    from collections import Counter
    c = Counter(it[0] for _, its in REGIONS for it in its)
    Rs = [r for r, _ in REGIONS[:FIRST_ROUND]]
    bad = [(a, b) for i, a in enumerate(Rs) for b in Rs[i + 1:] if not (a[2] <= b[0] or b[2] <= a[0] or a[3] <= b[1] or b[3] <= a[1])]
    return c, len(Rs), bad


if __name__ == '__main__':
    print(check())
