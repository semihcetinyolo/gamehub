"""Living room level v2 (blend + hide): rusty red pandas that melt into the orange 70s room.
Targets: V = holding a black vinyl record (object), B = cream-white knitted beanie (worn), U = hanging upside down (action), D = plain red panda.
Feature decoys (orange look-alikes that borrow a feature, all go to D): v / b / u = fox or squirrel with that feature."""

NAME = 'livingroom'
GROUPS = [('B', 'WhiteBeanie'), ('U', 'UpsideDown'), ('V', 'VinylRecord')]  # top of the layer panel first = first stage
TARGET = {'V': 10, 'B': 10, 'U': 10, 'D': 40, 'v': 7, 'b': 6, 'u': 4}  # decoy counts vary per feature
D_KINDS = 'Dvbu'
CHAR_H = 160
FIRST_ROUND = 34

F, S = 'fox', 'squirrel'
REGIONS = [
    ((80, 230, 640, 1000), [('D', 'curled up in the cream armchair on the upper loft, half hidden by its cushion'),
                            ('V', 'peeking out from behind the low sideboard, record held up'), ('b', F, 'lying under the small round side table')]),
    ((660, 300, 1240, 980), [('B', 'peeking out from behind the cream armchair, only head and beanie visible'), ('D', 'sitting among the magazines in the magazine rack'),
                             ('U', 'hanging upside down from the wooden loft railing by its hind legs and tail')]),
    ((1250, 180, 1960, 760), [('D', 'hiding under the wooden console table, half in its shadow'), ('V', 'sitting on the loft carpet behind the railing posts'),
                              ('u', S, 'hanging upside down from the loft railing'), ('D', 'peeking around the corner of the doorway')]),
    ((2060, 30, 2700, 500), [('D', 'peeking out from behind the wooden door frame, only head and paws visible'), ('B', 'sitting on the tiled hallway floor in the doorway'),
                             ('v', F, 'sitting next to the stone wall')]),
    ((2720, 380, 3720, 1060), [('D', 'curled up on an orange dining chair, orange on orange'), ('V', 'hiding under the round dining table, half in its shadow'),
                               ('U', 'hanging upside down from the edge of the dining table'), ('b', S, 'peeking out from behind a dining chair'),
                               ('D', 'lying on the white rug behind a chair leg')]),
    ((3730, 380, 4096, 1000), [('B', 'sitting on the shelf between the vases, half hidden by the white pitcher'), ('D', 'peeking out from behind the stone pillar'), ('D', 'sitting on the floor at the foot of the pillar, half behind a vase')]),
    ((2060, 520, 2700, 1040), [('D', 'curled up inside a bookcase cubby between the vases'), ('V', 'sitting inside a bookcase cubby next to the books, record held up'),
                               ('u', F, 'hanging upside down from a bookcase shelf')]),
    ((2060, 1050, 2700, 1340), [('D', 'peeking out from behind the vinyl records leaning on the bookcase'), ('B', 'sitting in the bottom bookcase cabinet, half behind its door'), ('D', 'curled up on the carpet next to the bookcase')]),
    ((2720, 1060, 3300, 1440), [('D', 'lying flat on a carpeted step, orange on orange'), ('V', 'peeking over the top of the steps, record held up'),
                                ('b', F, 'sitting on the steps')]),
    ((3330, 1150, 4096, 1720), [('D', 'hiding behind the monstera plant leaves, only head showing'), ('U', 'hanging upside down from the edge of the low shelf'),
                                ('v', S, 'peeking out of the wicker basket'), ('B', 'sitting among the books on the shelf on top of the stone wall')]),
    ((1300, 1000, 1800, 1520), [('D', 'peeking out of the wicker basket under the record cabinet'), ('V', 'sitting next to the turntable on top of the record cabinet'),
                                ('u', F, 'hanging upside down from the edge of the record cabinet')]),
    ((650, 1150, 1290, 1720), [('D', 'peeking out from beside the big TV screen'), ('B', 'sitting on the TV cabinet shelf next to the speaker'),
                               ('D', 'sitting on the floor in front of the TV, half behind the stack of records'), ('U', 'hanging upside down from the edge of the TV cabinet')]),
    ((0, 1200, 560, 1950), [('D', 'sitting on the shelf next to the cassette stereo, half behind it'), ('U', 'hanging upside down from the edge of the shelf'),
                            ('v', F, 'next to the vinyl records on the floor'), ('D', 'sitting under the table lamp')]),
    ((0, 2050, 820, 2640), [('D', 'curled up in the orange armchair under the knitted throw, orange on orange'), ('V', 'peeking out from behind the magazine rack'),
                            ('b', S, 'under the dark round side table'), ('U', 'hanging upside down from the arm of the orange armchair')]),
    ((830, 2100, 1300, 2700), [('D', 'lying on the orange ottoman, half under the knitted blanket'), ('B', 'peeking out from behind the snake plant pot'),
                               ('u', S, 'hanging upside down from the edge of the ottoman')]),
    ((1020, 1730, 1780, 2080), [('D', 'peeking up from behind the back of the white sofa, only head and ears showing'), ('V', 'sitting between the orange cushions on the white sofa'),
                                ('b', F, 'half hidden behind an orange cushion')]),
    ((1800, 1350, 2550, 1720), [('U', 'hanging upside down from the back of the white sofa'), ('D', 'lying on the brown sofa section, brown on brown'),
                                ('B', 'peeking out from behind a cushion on the sofa')]),
    ((2560, 1460, 3100, 2150), [('D', 'curled up under the knitted throw, only head and tail showing'), ('V', 'sitting between the striped cushion and the round cushion'),
                                ('u', F, 'hanging upside down from the sofa arm')]),
    ((1790, 1730, 2240, 2200), [('B', 'peeking over the edge of the square coffee table'), ('D', 'curled up on the coffee table next to the teapot tray'), ('D', 'hiding behind the corner of the coffee table, only head showing')]),
    ((1300, 2210, 2200, 2700), [('D', 'peeking out of a cubby of the low wooden shelf'), ('U', 'hanging upside down from the wooden edge of the sofa'),
                                ('v', S, 'next to the orange pouf'), ('D', 'half hidden behind the orange pouf')]),
    ((2250, 2160, 2700, 2560), [('B', 'peeking out from behind the small round side table'), ('D', 'sitting among the leaning vinyl records'),
                                ('v', F, 'standing on the carpet near the side table'), ('U', 'hanging upside down from the edge of the small round side table')]),
    ((2400, 2580, 3150, 3100), [('D', 'lying flat on a big carpeted step, orange on orange'), ('V', 'peeking over the edge of a step, record held up'),
                                ('u', S, 'hanging upside down from the edge of the top step'), ('D', 'sitting at the foot of the steps')]),
    ((3100, 1960, 3900, 2560), [('D', 'sitting on the shelf among the books, half hidden by them'), ('U', 'hanging upside down from the wooden shelf'),
                                ('b', F, 'sitting on top of the stone wall')]),
    ((3250, 2580, 4096, 3100), [('D', 'peeking out from behind the bottles on the bar counter'), ('B', 'standing behind the bar counter, only head and shoulders visible'),
                                ('v', S, 'sitting next to the snack bowls on the bar counter'), ('U', 'hanging upside down from the edge of the bar counter')]),
    ((3160, 3110, 4096, 3800), [('D', 'curled up on an orange bar stool, orange on orange'), ('V', 'sitting under the bar between the stool legs'),
                                ('u', F, 'hanging upside down from a bar stool'), ('D', 'peeking out from behind the end of the bar counter')]),
    ((1150, 2720, 2240, 3250), [('D', 'lying stretched out on the swirly orange rug, blending into its stripes'), ('V', 'sitting on a brown stripe of the swirly rug'),
                                ('B', 'lying on its tummy on the swirly rug'), ('b', F, 'curled up on the swirly rug')]),
    ((1600, 3260, 2400, 3800), [('U', 'hanging upside down from the top edge of the wall'), ('D', 'lying on the swirly rug, blending with its orange stripes'),
                                ('v', F, 'sitting on the rug')]),
    ((0, 2650, 560, 3330), [('D', 'peeking out from behind the tall white vase'), ('B', 'sitting next to the potted plant on the sideboard, half behind its leaves'), ('D', 'peeking out from under the sideboard')]),
    ((570, 2950, 1000, 3700), [('D', 'peeking out of the wicker basket of records'), ('V', 'sitting on the console table'),
                               ('U', 'hanging upside down from the edge of the console table')]),
    ((0, 3400, 560, 4096), [('D', 'lying on the patterned runner rug, blending with its pattern'), ('B', 'peeking out from behind the potted plant'),
                            ('b', S, 'on the tiled floor')]),
    ((700, 3720, 1300, 4096), [('D', 'peeking out from the half-open wooden door'), ('V', 'peeking out from behind the potted plant'),
                               ('U', 'hanging upside down from a door handle')]),
    ((1500, 3820, 2000, 4096), [('D', 'peeking out of the umbrella stand'), ('B', 'standing next to the umbrella stand, half behind it'), ('D', 'lying on the floor by the wall')]),
    ((2420, 3150, 2900, 3600), [('U', 'hanging upside down from the top edge of the wooden wall'), ('D', 'lying on the carpet, orange on orange'),
                                ('u', S, 'hanging upside down from the wall edge')]),
    ((2900, 3820, 3700, 4096), [('D', 'peeking over the low wooden wall, only head and paws showing'), ('V', 'sitting on top of the low wooden wall'),
                                ('D', 'curled up on the carpet in the corner')]),
    # second round: fill the counts in free spots (coverage map of the found characters)
    ((40, 760, 420, 1150), [('U', 'hanging upside down from the wooden loft railing'), ('D', 'peeking out from behind the leg of the armchair')]),
    ((1340, 760, 1720, 1020), [('U', 'hanging upside down from the wooden beam on top of the wall'), ('D', 'peeking out from behind the table lamp')]),
    ((2780, 680, 3160, 1000), [('D', 'lying flat on the orange carpet next to the white rug, orange on orange')]),
    ((2040, 2830, 2420, 3200), [('D', 'lying flat on the orange carpet, blending in'), ('D', 'curled up on the carpet next to the rug edge')]),
    ((2620, 2880, 3000, 3250), [('U', 'hanging upside down from the wooden top of the stone pillar'), ('D', 'peeking out from behind the stone pillar')]),
    ((3640, 3640, 4060, 4060), [('u', F, 'hanging upside down from the rung of the bar stool'), ('D', 'sitting in the shadow under the bar stool')]),
    ((3800, 2150, 4090, 2480), [('D', 'peeking out from behind the old radio on the counter'), ('u', S, 'hanging upside down from the edge of the counter')]),
    ((0, 0, 300, 300), [('U', 'hanging upside down from the wooden beam')]),
    # third round: one more plain panda after duplicate drops
    ((2816, 0, 3300, 330), [('D', 'peeking out from behind the wooden door frame, only head and paws visible'), ('D', 'curled up on the floor in the corner by the wall')]),
]

FEATURE = {
    'V': 'holding up a big shiny BLACK VINYL RECORD (black disc with a small orange label in the middle) in its front paws',
    'B': 'wearing a CREAM-WHITE knitted BEANIE hat with a pompom on its head',
    'U': 'hanging UPSIDE DOWN, head pointing to the floor, holding on with its hind legs and tail',
}
SPECIES = {
    'fox': 'an orange FOX (pointed snout, tall pointed black-tipped ears, white chest, bushy tail with a white tip) - clearly a fox, NOT a red panda',
    'squirrel': 'a reddish-brown SQUIRREL (small, long tufted ears, big bushy tail curled up over its back) - clearly a squirrel, NOT a red panda',
}


def _item(k, rest):
    if k.isupper():
        what = 'a red panda' if k == 'D' else f'a red panda {FEATURE[k]}'
        return f'{what}, {rest[0]}' + (' (right side up, holding nothing, wearing nothing)' if k == 'D' else '')
    sp, where = rest
    return f'{SPECIES[sp]}, {FEATURE[k.upper()]}, {where}'


def description(rect, items):
    x0, y0, x1, y1 = rect
    pct = round(100 * CHAR_H / (y1 - y0))
    lines = [f'{i}. {_item(it[0], it[1:])}' for i, it in enumerate(items, 1)]
    return (
        f'Add exactly {len(items)} small cartoon animals into this region, hidden-object style: tuck them into the furniture so they are '
        'partly covered and blend in, exactly as described, never lined up in open space. Every RED PANDA is the same character as in the reference '
        'image (same rusty orange-red fur that matches the room, cream-white face markings, white-rimmed ears, dark brown legs, ringed tail). '
        'Foxes and squirrels are different animals with their own look. '
        f'Each animal is small: about {min(pct, 45)}% of the region height or less, the natural size for this room (a little shorter than an armchair). '
        'Spread them apart: no two animals touch or overlap, and every animal stays inside the region, away from its edges. '
        'When an animal is partly hidden, the furniture in front of it covers part of its body, but its vinyl record, beanie or upside-down pose (if it has one) stays clearly visible.\n'
        + '\n'.join(lines) + '\n'
        'Only the animals described with a record hold one; only those described with a beanie wear anything; only those described upside down hang upside down, all others are right side up. '
        'Keep everything else in the region exactly as it is (same furniture, positions and colors). '
        "Match the scene's cartoon line work, outlines and warm lighting, with soft contact shadows. No other characters, no text."
    )


def tol_r(region):
    """Shift tolerance of the diff: orange pandas on orange carpet vanish with the default 8 px (kept for round one so ids stay put)."""
    return 2 if region and region > FIRST_ROUND else 8


# detection hooks (detect.py): any big changed blob is an animal; species, records, beanies and poses are marked by eye on the sheet
def is_head(st, area):
    return area > 2500


def is_prop(st):
    return False


def features(c):
    return []


def check():
    from collections import Counter
    c = Counter(it[0] for _, its in REGIONS for it in its)
    Rs = [r for r, _ in REGIONS[:FIRST_ROUND]]
    bad = [(a, b) for i, a in enumerate(Rs) for b in Rs[i + 1:] if not (a[2] <= b[0] or b[2] <= a[0] or a[3] <= b[1] or b[3] <= a[1])]
    return c, len(Rs), bad


if __name__ == '__main__':
    print(check())
