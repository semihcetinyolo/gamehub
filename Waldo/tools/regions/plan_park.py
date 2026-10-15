"""Park level plan: non-overlapping regions, each asking for a few pandas at named landmarks.
Kinds: B = red balloon, R = yellow raincoat, S = handstand, D = plain distractor."""

NAME = 'park'
GROUPS = [('B', 'RedBalloon'), ('R', 'YellowRaincoat'), ('S', 'Handstand')]  # target groups, top of the layer panel first
TARGET = {'B': 10, 'R': 10, 'S': 10, 'D': 40}
PANDA_H = 210
FIRST_ROUND = 24  # rough standing height on the canvas

REGIONS = [
    ((90, 230, 700, 760), [
        ('D', 'peeking out of the left window of the blue house, paws on the window sill'),
    ]),
    ((620, 780, 1480, 1400), [
        ('D', 'sitting on the red-and-white striped seat of the green chair'),
        ('B', 'standing on the wooden deck between the round table and the orange chair'),
        ('R', 'standing on the deck next to the pot of red geraniums at the front edge'),
        ('D', 'peeking over the fruit bowl at the front edge of the deck'),
    ]),
    ((1500, 600, 2000, 1380), [
        ('S', 'on the deck boards just right of the welcome mat'),
        ('D', 'standing next to the red rain boots'),
        ('D', 'sitting on the porch steps'),
    ]),
    ((2030, 560, 2760, 1080), [
        ('D', 'standing in front of the blue painted cabinet, looking at its doors'),
        ('R', 'walking on the stone path in front of the cabinet'),
        ('S', 'on the stone path near the green watering can'),
        ('D', 'peeking from behind the barbecue grill'),
    ]),
    ((0, 1250, 600, 2140), [
        ('D', 'hugging and climbing the tree trunk'),
        ('R', 'sitting on a big tree branch'),
        ('B', 'standing on the grass between the tree trunk and the swing'),
        ('D', 'sitting on the wooden swing seat, holding the ropes'),
    ]),
    ((680, 1560, 1450, 2080), [
        ('D', 'sliding down the yellow slide with its arms up'),
        ('D', 'climbing the blue ladder of the slide'),
        ('S', 'on the grass to the right of the slide, near the hula hoop'),
        ('R', 'standing on top of a wooden block'),
    ]),
    ((1480, 1560, 2100, 2150), [
        ('S', 'on the chalk hopscotch squares'),
        ('D', 'hopping on one leg on the hopscotch'),
        ('B', 'standing next to the wooden blocks on the grass'),
    ]),
    ((2120, 1100, 2770, 1770), [
        ('D', 'sniffing a red tomato on the tomato plants'),
        ('B', 'standing on the grass beside the tomato bed'),
        ('D', 'sitting on the wooden edge of the vegetable bed'),
        ('R', 'crouching between the carrot leaves'),
    ]),
    ((2800, 1100, 3510, 1790), [
        ('D', 'standing inside the greenhouse, looking out through the glass'),
        ('D', 'standing in the open greenhouse door'),
        ('S', 'on the dirt in front of the flower pots'),
        ('B', 'standing on the dirt next to the pink flower pot'),
    ]),
    ((3540, 900, 4096, 1720), [
        ('D', 'climbing the wooden ladder leaning on the fence'),
        ('R', 'sitting on the stack of soil bags'),
        ('S', 'on the dirt near the coiled green garden hose'),
        ('D', 'peeking into the vegetable basket'),
    ]),
    ((2300, 1800, 3010, 2390), [
        ('D', 'sitting inside the red wheelbarrow'),
        ('R', 'hugging a big cabbage in the vegetable bed'),
        ('B', 'standing on the grass beside the wheelbarrow'),
    ]),
    ((3230, 1800, 3900, 2420), [
        ('D', 'standing in front of the wooden workbench, looking up at it'),
        ('S', 'on the dirt in front of the workbench'),
        ('D', 'sitting under the workbench next to the jars'),
        ('R', 'standing next to the small seed bag on the ground'),
    ]),
    ((380, 2150, 1170, 2720), [
        ('D', 'digging in the sand of the sandbox with its paws'),
        ('S', 'in the sandbox next to the sand castle'),
        ('B', 'standing on the grass next to the sandbox'),
        ('D', 'sitting on the wooden edge of the sandbox'),
    ]),
    ((1190, 2160, 2040, 2720), [
        ('D', 'sitting in the red toy wagon among the blocks'),
        ('R', 'pushing the striped beach ball with both paws'),
        ('D', 'stepping over the jump rope lying on the grass'),
        ('B', 'standing on the grass near the bushes'),
    ]),
    ((300, 2760, 830, 3560), [
        ('D', 'sitting on the workbench inside the shed'),
        ('S', 'on the floor of the shed'),
        ('D', 'peeking out of the open red toolbox'),
    ]),
    ((850, 2760, 1620, 3580), [
        ('D', 'sitting on the seat of the blue bicycle'),
        ('B', 'standing on the rolled-out green mat'),
        ('R', 'leaning on the wooden plank next to the ladder'),
        ('D', 'sitting in the wooden crate by the bicycle wheel'),
    ]),
    ((1640, 2860, 2150, 3580), [
        ('D', 'sitting on the colorful wooden chair'),
        ('S', 'on the grass in front of the chair'),
        ('B', 'standing next to the bucket of garden tools'),
    ]),
    ((2440, 2440, 3060, 2990), [
        ('D', 'curled up inside the hanging egg chair on the cushions'),
        ('B', 'standing next to the potted palm plant'),
        ('R', 'sitting on the stone wall'),
    ]),
    ((2160, 3010, 2950, 3560), [
        ('S', 'on a flat stepping stone'),
        ('D', 'walking on the stepping stones'),
        ('R', 'standing at the open wooden gate'),
        ('D', 'sitting on the grass under the egg chair stand'),
    ]),
    ((3080, 2620, 4000, 3420), [
        ('D', 'lying in the striped hammock'),
        ('R', 'sitting on the patterned floor cushions'),
        ('S', 'on the grass beside the mosaic table'),
        ('D', 'drinking from the bird bath'),
        ('B', 'standing on the grass near the rock garden'),
    ]),
    ((2960, 3460, 4096, 4096), [
        ('D', 'sitting on a pond rock next to the frog'),
        ('D', 'dipping its feet into the pond from the rocks'),
        ('B', 'standing on the rocks at the pond edge'),
        ('R', 'standing on the grass left of the pond'),
    ]),
    ((700, 3600, 1650, 4096), [
        ('D', 'sitting on top of the yellow crate'),
        ('S', 'on the grass next to the metal watering can'),
        ('D', 'peeking from behind the birdhouse post'),
    ]),
    ((2060, 3580, 2930, 4096), [
        ('D', 'sitting on top of the old wooden trunk'),
        ('B', 'standing next to the garden clock post'),
        ('D', 'lying on its tummy on the grass, chin on its paws'),
    ]),
    ((3000, 0, 4096, 860), [
        ('D', 'climbing the big tree trunk'),
        ('D', 'sitting on top of the wooden fence'),
    ]),
    # second round: two more balloon pandas in empty spots
    ((2050, 2180, 2290, 2540), [
        ('B', 'standing on the stone path'),
    ]),
    ((3150, 110, 3530, 520), [
        ('B', 'standing on the grass behind the wooden fence'),
    ]),
    # third round: plain pandas to make up the 40 (some first-round ones overlapped)
    ((0, 2180, 370, 2470), [
        ('D', 'sitting on the grass between the tree roots, waving'),
    ]),
    ((3420, 60, 3720, 430), [
        ('D', 'sitting on the grass behind the wooden fence'),
    ]),
    # fourth round: replacements for pandas dropped because two edits drew them on top of each other
    ((20, 3660, 400, 4090), [
        ('D', 'peeking out of the green bush, only its head and paws showing'),
    ]),
    ((3700, 3700, 4096, 4096), [
        ('D', 'peeking out of the green bush, only its head and paws showing'),
    ]),
    ((3720, 2150, 4096, 2560), [
        ('D', 'peeking out from behind the green bush'),
    ]),
    ((3830, 1700, 4096, 1990), [
        ('S', 'on the dirt'),
    ]),
]

FEATURE = {
    'B': 'holding the string of ONE bright RED balloon that floats just above its head',
    'R': 'wearing a bright YELLOW raincoat (hood down, ears showing)',
    'S': 'doing a HANDSTAND: completely upside down, balanced on its front paws with both legs straight up in the air',
}


def description(rect, items):
    x0, y0, x1, y1 = rect
    pct = round(100 * PANDA_H / (y1 - y0))
    lines = []
    for i, (k, where) in enumerate(items, 1):
        if k == 'S':
            lines.append(f'{i}. a panda {FEATURE[k]}, {where}')
        elif k in FEATURE:
            lines.append(f'{i}. a panda {FEATURE[k]}, {where}')
        else:
            lines.append(f'{i}. a plain panda {where}')
    return (
        f'Add exactly {len(items)} baby panda cubs into this region. Every panda is the same character as in the reference image '
        '(identical design: round white head, round black ears, black eye patches, black arms and legs, black band over the shoulders, white belly). '
        f'Each panda is small: about {pct}% of the region height, the natural size for this scene (a panda is a little shorter than the garden chairs). '
        'Spread them apart: no two pandas touch or overlap, and every panda is fully inside the region, away from its edges.\n'
        + '\n'.join(lines) + '\n'
        'Only the panda described with a raincoat wears clothes; all other pandas wear nothing. Only the panda described with a balloon has a balloon. '
        'Only the panda described doing a handstand is upside down; every other panda is upright. '
        'Keep everything else in the region exactly as it is (same objects, positions and colors). '
        "Match the scene's cartoon line work, outlines and lighting, with soft contact shadows. No other characters, no text."
    )


def check():
    from collections import Counter
    c = Counter(k for _, it in REGIONS for k, _ in it)
    R = [r for r, _ in REGIONS[:FIRST_ROUND]]  # later rounds fill gaps inside earlier regions
    for i, a in enumerate(R):
        for b in R[i + 1:]:
            assert a[2] <= b[0] or b[2] <= a[0] or a[3] <= b[1] or b[3] <= a[1], (a, b)
    return c, len(R)


if __name__ == '__main__':
    print(check())
