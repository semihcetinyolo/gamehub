"""Living room level: koalas. Targets: G = blue guitar (object), W = green sweater (worn), P = disco pose (action), D = plain koala.
Feature decoys (look-alike grey animals that borrow a target feature, all go to D): g / w / p = raccoon or mouse with that feature."""

NAME = 'livingroom'
GROUPS = [('G', 'BlueGuitar'), ('W', 'GreenSweater'), ('P', 'DiscoDance')]  # top of the layer panel first
TARGET = {'G': 10, 'W': 10, 'P': 10, 'D': 40, 'g': 6, 'w': 6, 'p': 6}
D_KINDS = 'Dgwp'
CHAR_H = 200
FIRST_ROUND = 34

R, M = 'raccoon', 'mouse'
REGIONS = [
    ((80, 230, 640, 1000), [('D', 'sitting in the cream armchair on the upper loft'), ('P', 'on the loft carpet in front of the low sideboard'),
                            ('w', M, 'standing on the loft carpet next to the sideboard')]),
    ((660, 300, 1240, 980), [('G', 'standing on the loft carpet next to the magazine rack'), ('D', 'sitting in the cream armchair'),
                             ('D', 'leaning on the wooden loft railing, looking down')]),
    ((1250, 180, 1960, 760), [('W', 'walking on the tiled hallway floor'), ('D', 'sitting under the wooden console table'),
                              ('g', R, 'standing on the tiled floor near the doorway'), ('D', 'leaning on the loft railing')]),
    ((2060, 30, 2700, 500), [('D', 'peeking out from behind the wooden door frame'), ('p', M, 'on the tiled floor of the hallway'), ('W', 'standing in the doorway')]),
    ((2720, 380, 3720, 1060), [('D', 'sitting on an orange dining chair'), ('G', 'standing on the white rug beside the dining table'),
                               ('P', 'on the white rug'), ('w', R, 'standing next to the dining table'), ('D', 'sitting on the rug under the dining table')]),
    ((3730, 380, 4096, 1000), [('W', 'sitting on the shelf next to the white pitcher'), ('D', 'peeking out from behind the stone pillar')]),
    ((2060, 520, 2700, 1040), [('D', 'sitting inside a bookcase cubby between the vases'), ('W', 'sitting on a bookcase shelf next to the books')]),
    ((2060, 1050, 2700, 1340), [('p', R, 'on the carpet in front of the bookcase'), ('D', 'sitting on the bottom shelf of the bookcase')]),
    ((2720, 1060, 3300, 1440), [('G', 'sitting on the carpeted stairs'), ('D', 'walking up the steps'), ('w', M, 'standing on the top step')]),
    ((3330, 1150, 4096, 1720), [('D', 'standing next to the potted monstera plant'), ('P', 'on the carpet'),
                                ('g', R, 'standing next to the low shelf with the wicker basket'), ('G', 'standing on the carpet in front of the stone wall')]),
    ((1300, 1000, 1800, 1520), [('D', 'sitting on top of the record cabinet next to the turntable'),
                                ('W', 'standing in front of the record cabinet next to the wicker basket')]),
    ((650, 1150, 1290, 1720), [('D', 'peeking out from beside the big TV screen'), ('g', M, 'sitting on top of the TV cabinet'), ('D', 'sitting on the floor in front of the TV')]),
    ((0, 1200, 560, 1950), [('D', 'sitting on the shelf next to the cassette stereo'), ('G', 'standing on the floor beside the side table'),
                            ('p', R, 'on the floor next to the table lamp'), ('D', 'sitting next to the vinyl records')]),
    ((0, 2050, 820, 2640), [('D', 'sitting in the orange armchair'), ('W', 'standing next to the magazine rack'), ('P', 'on the open carpet')]),
    ((830, 2100, 1300, 2700), [('D', 'lying on the orange ottoman'), ('g', R, 'standing next to the snake plant')]),
    ((1020, 1730, 1780, 2080), [('D', 'sitting on the white sofa next to the orange cushions'), ('G', 'sitting on the white sofa'),
                                ('w', M, 'sitting on the white sofa')]),
    ((1800, 1350, 2550, 1720), [('D', 'sitting on the back of the white sofa'), ('P', 'standing on the sofa seat'),
                                ('D', 'lying on the brown sofa section')]),
    ((2560, 1460, 3100, 2150), [('D', 'sitting on the sofa beside the striped cushion'), ('W', 'sitting on the sofa arm next to the knitted throw'),
                                ('p', M, 'standing on the sofa seat')]),
    ((1790, 1730, 2240, 2200), [('G', 'sitting on the edge of the square coffee table'), ('D', 'looking at the teacups on the coffee table')]),
    ((1300, 2210, 2200, 2700), [('D', 'sitting on the low wooden shelf behind the sofa'), ('g', R, 'standing on the carpet near the orange pouf'),
                                ('D', 'lying on the long white sofa'), ('P', 'on the carpet below the sofa')]),
    ((2250, 2160, 2700, 2560), [('D', 'sitting on the small round side table'), ('w', R, 'standing next to the knitted throw'), ('G', 'standing on the carpet')]),
    ((2400, 2580, 3150, 3100), [('D', 'sitting on a big carpeted step'), ('P', 'on a big carpeted step'), ('g', M, 'standing on the top step'), ('D', 'walking down the steps')]),
    ((3100, 1960, 3900, 2560), [('D', 'sitting on the shelf among the books'), ('W', 'sitting on top of the stone wall'),
                                ('p', R, 'on the carpet at the foot of the stone wall')]),
    ((3250, 2580, 4096, 3100), [('D', 'sitting on the bar counter next to the snacks'), ('G', 'standing behind the bar counter'),
                                ('w', M, 'sitting on the bar counter next to the bottles')]),
    ((3160, 3110, 4096, 3800), [('D', 'sitting on an orange bar stool'), ('P', 'on the carpet next to the bar stools'),
                                ('g', R, 'sitting on an orange bar stool'), ('D', 'sitting on the floor under the bar')]),
    ((1150, 2720, 2240, 3250), [('P', 'on the swirly orange rug'), ('D', 'lying on its tummy on the swirly rug'),
                                ('W', 'walking on the swirly rug'), ('p', R, 'on the swirly rug')]),
    ((1600, 3260, 2400, 3800), [('G', 'standing on the swirly rug'), ('D', 'sitting on the edge of the rug'), ('w', R, 'walking on the rug')]),
    ((0, 2650, 560, 3330), [('D', 'sitting on the sideboard next to the tall white vase'), ('W', 'sitting next to the potted plant on the sideboard')]),
    ((570, 2950, 1000, 3700), [('G', 'sitting on the console table'), ('D', 'peeking out of the wicker basket of records')]),
    ((0, 3400, 560, 4096), [('D', 'lying on the patterned runner rug'), ('P', 'on the tiled floor'), ('w', M, 'standing on the runner rug')]),
    ((700, 3720, 1300, 4096), [('D', 'standing on the tiled floor next to the potted plant'), ('G', 'standing on the tiled floor in front of the doors'), ('W', 'standing on the tiled floor near the wall')]),
    ((1500, 3820, 2000, 4096), [('D', 'standing next to the umbrella stand'), ('p', M, 'on the floor')]),
    ((2420, 3150, 2900, 3600), [('W', 'walking on the carpet'), ('D', 'sitting on the carpet'), ('D', 'lying on the carpet')]),
    ((2900, 3820, 3700, 4096), [('D', 'sitting on top of the low wooden wall'), ('g', R, 'standing on the carpet'), ('P', 'on the carpet')]),
    # second round: fill the counts short after the first round
    ((3700, 3600, 4096, 4096), [('P', 'on the carpet'), ('D', 'sitting on the carpet')]),
    ((3250, 3820, 3650, 4096), [('G', 'sitting on the carpet')]),
    ((3000, 130, 3400, 400), [('D', 'standing on the carpet by the wall'), ('D', 'sitting on the carpet by the wall')]),
    ((0, 3830, 420, 4096), [('D', 'lying on the patterned runner rug')]),
    ((1350, 1520, 1800, 1740), [('G', 'sitting on the carpet in front of the record cabinet')]),
    ((0, 700, 320, 1000), [('P', 'on the loft carpet')]),
    # third round: two more disco koalas in the only free spots left
    ((1392, 560, 1712, 944), [('P', 'on the loft carpet, in front of the railing')]),
    ((3648, 1856, 3968, 2240), [('P', 'standing on the wooden ledge on top of the stone wall')]),
]

FEATURE = {
    'G': 'playing a bright BLUE electric guitar (the guitar clearly visible against its body)',
    'W': 'wearing a bright lime-GREEN knitted sweater',
    'P': ('striking the famous DISCO pose: one arm stretched fully straight up HIGH ABOVE its head with the index finger pointing at the ceiling, '
          'the other hand on its hip, hip pushed to the side (the arm must clearly rise far above the ears)'),
}
SPECIES = {
    'raccoon': 'a RACCOON (grey fur, black bandit eye mask, pointed ears, black-ringed bushy tail) - clearly a raccoon, NOT a koala',
    'mouse': 'a grey MOUSE (big round pink-lined ears, pointed pink nose, long thin pink tail) - clearly a mouse, NOT a koala',
}


def _item(k, rest):
    if k.isupper():
        what = 'a koala' if k == 'D' else f'a koala {FEATURE[k]}'
        return f'{what}, {rest[0]}' + (' (arms down, holding nothing, wearing nothing)' if k == 'D' else '')
    sp, where = rest
    return f'{SPECIES[sp]}, {FEATURE[k.upper()]}, {where}'


def description(rect, items):
    x0, y0, x1, y1 = rect
    pct = round(100 * CHAR_H / (y1 - y0))
    lines = [f'{i}. {_item(it[0], it[1:])}' for i, it in enumerate(items, 1)]
    return (
        f'Add exactly {len(items)} small cartoon animals into this region. Every KOALA is the same character as in the reference image '
        '(identical design: light-grey fur, big round fluffy ears, big black oval nose, cream-white belly). Raccoons and mice are different animals with their own look. '
        f'Each animal is small: about {pct}% of the region height, the natural size for this room (a little shorter than an armchair). '
        'Spread them apart: no two animals touch or overlap, and every animal is fully inside the region, away from its edges.\n'
        + '\n'.join(lines) + '\n'
        'Only the animals described with a guitar hold a guitar; only those described with a sweater wear clothes; only those described dancing raise an arm. '
        'Keep everything else in the region exactly as it is (same furniture, positions and colors). '
        "Match the scene's cartoon line work, outlines and warm lighting, with soft contact shadows. No other characters, no text."
    )


# detection hooks (detect.py): any big changed blob is an animal; species and the disco pose are marked by eye on the sheet
def is_head(st, area):
    return area > 5000 and st['grey'] + st['white'] + st['black'] > 0.35


def is_prop(st):
    return st['blue'] > 0.35 or st['green'] > 0.4


def features(c):
    f = []
    if c['blue'] > 0.05: f.append('G')
    if c['green'] > 0.12: f.append('W')
    return f


def check():
    from collections import Counter
    c = Counter(it[0] for _, its in REGIONS for it in its)
    Rs = [r for r, _ in REGIONS[:FIRST_ROUND]]
    bad = [(a, b) for i, a in enumerate(Rs) for b in Rs[i + 1:] if not (a[2] <= b[0] or b[2] <= a[0] or a[3] <= b[1] or b[3] <= a[1])]
    return c, len(Rs), bad


if __name__ == '__main__':
    print(check())
