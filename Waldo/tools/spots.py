# (cx, cy, kind, activity)  kind: S stand/walk 180x250, L lying 290x190, I sitting 200x210, K kneeling 210x200, W in water 190x190
SIZE = {'S': (180, 250), 'L': (290, 190), 'I': (200, 210), 'K': (210, 200), 'W': (160, 160)}
SPOTS = [
    (1060, 580, 'L', 'lying on his back on the striped sun lounger, sunbathing with hands behind his head'),
    (785, 785, 'L', 'lying on his stomach on the teal sun lounger, reading a small comic book'),
    (760, 1060, 'S', 'standing at the foot of the sun lounger, stretching his arms up'),
    (1000, 1250, 'S', 'walking across the sand toward the flip-flops'),
    (1560, 845, 'S', 'standing in front of the bamboo drinks bar, reaching for a drink'),
    (1500, 1150, 'S', 'walking along the sandy path, seen from behind'),
    (1870, 1185, 'S', 'walking on the sand, looking toward the sandcastle'),
    (1400, 1560, 'K', 'kneeling on the sand, digging a hole with his hands'),
    (1600, 1800, 'S', 'standing on the sand holding a small spade'),
    (560, 1530, 'I', 'sitting relaxed in the big shell-shaped armchair'),
    (260, 1650, 'I', 'sitting on the curved cushioned bench, leaning back'),
    (640, 1800, 'L', 'lying on his back on the round pink rug, arms spread'),
    (1050, 1900, 'I', 'sitting on the edge of the wooden deck, legs dangling'),
    (1050, 1560, 'S', 'standing next to the little table with the radio, dancing'),
    (2420, 380, 'W', 'standing chest-deep in the sea, waving with both arms raised'),
    (2600, 640, 'S', 'standing in ankle-deep shallow water at the shoreline, splashing with his feet'),
    (2850, 700, 'S', 'walking along the wooden pier'),
    (3250, 420, 'I', 'sitting on the edge of the wooden pier, legs dangling toward the water'),
    (3880, 180, 'W', 'swimming in the sea, doing a doggy paddle'),
    (3900, 560, 'W', 'floating in the sea, waist-deep, waving'),
    (3230, 790, 'W', 'standing waist-deep in the shallow sea, splashing water'),
    (3500, 820, 'W', 'swimming in the sea near the life ring'),
    (3995, 895, 'W', 'standing waist-deep in the sea'),
    (2290, 820, 'S', 'standing on the beach next to the fishing net, looking at a starfish'),
    (3050, 1550, 'S', 'walking on the sand carrying a beach ball'),
    (2650, 1850, 'K', 'kneeling on the sand, patting the wall of the little sand town'),
    (3300, 1600, 'S', 'standing on the sand, putting on sunscreen'),
    (2250, 1960, 'K', 'crouching on the sand, picking up a seashell'),
    (1950, 1735, 'S', 'standing on the little wooden bridge of the sandcastle'),
    (1980, 920, 'S', 'walking on the sand past the sandcastle flag'),
    (1060, 2600, 'L', 'lying in the striped hammock, relaxing'),
    (1400, 2800, 'S', 'hopping across the wooden stepping stones'),
    (760, 3150, 'W', 'standing waist-deep in the lagoon pool, waving with both arms'),
    (1150, 3420, 'W', 'standing waist-deep in the lagoon pool, splashing'),
    (1450, 3300, 'W', 'swimming in the lagoon pool on his back'),
    (900, 3500, 'W', 'standing waist-deep in the lagoon pool, waving'),
    (560, 3540, 'I', 'sitting on the yellow curved sofa, leaning on a pillow'),
    (650, 3780, 'L', 'lying on his stomach on the round wooden deck, sunbathing'),
    (1550, 3620, 'S', 'walking across the wooden rope bridge'),
    (1950, 3920, 'W', 'standing waist-deep in the stream, splashing'),
    (1100, 3800, 'S', 'standing on the sand next to the little stone frog'),
    (2140, 2550, 'S', 'walking along the sandy path'),
    (1650, 3100, 'S', 'standing on the sand next to the glass bottles'),
    (1805, 2270, 'K', 'kneeling on the sand next to the party-hat sand cones'),
    (1650, 2045, 'K', 'kneeling at the edge of the sand maze, drawing in the sand with a finger'),
    (2380, 2240, 'K', 'kneeling in the middle of the pebble spiral, placing a pebble'),
    (2650, 2280, 'S', 'walking on the sand, seen from behind'),
    (2910, 2200, 'S', 'standing on the sand, looking up at the giant pineapple'),
    (3300, 2250, 'S', 'walking on the sand holding an ice cream cone'),
    (3560, 2240, 'S', 'standing on the sand, shading his eyes with one hand'),
    (2120, 2900, 'S', 'walking along the sandy path, waving'),
    (2150, 3250, 'S', 'standing on the sandy path drinking from a coconut with a straw'),
    (3460, 2935, 'I', 'sitting on the bar stool'),
    (3700, 3275, 'S', 'standing in front of the vending machine, choosing a drink'),
    (3200, 3330, 'I', 'sitting on the wooden bench at the table, eating fruit'),
    (3230, 3720, 'S', 'standing next to the clothes rack, trying on a sun hat'),
    (1375, 3500, 'W', 'standing waist-deep in the lagoon pool, splashing water with his hands'),
    (2160, 3960, 'S', 'standing in ankle-deep water at the water\'s edge'),
    (2080, 3560, 'S', 'walking on the sandy path next to the surfboard'),
    (2950, 200, 'I', 'sitting in the seat of the pedal boat, pedalling'),
    (2600, 150, 'W', 'swimming in the sea, head and shoulders above the water'),
    (600, 1180, 'S', 'standing next to the sun lounger, holding a towel'),
    (1305, 1250, 'S', 'walking on the sand carrying a coconut drink'),
    (230, 3200, 'S', 'standing under the shell shower, rinsing off'),
    (1370, 730, 'S', 'standing on the sand beside the sun lounger, stretching'),
    (350, 1985, 'I', 'sitting on the edge of the round wooden deck'),
    (2740, 1560, 'S', 'standing on the sand next to the buckets, holding a bucket'),
    (1180, 3175, 'W', 'standing waist-deep in the lagoon pool, on a submerged stone'),
    (1400, 3030, 'K', 'kneeling on the sand, looking closely at the red starfish'),
    (1680, 1415, 'S', 'standing behind the sand buckets, holding a spade'),
]

GREEN = [1, 10, 17, 27, 31, 39, 42, 48, 53, 62]
ARMBANDS = [15, 20, 33, 40, 16, 4, 29, 46, 55, 66]
COLORS = ['royal blue', 'purple', 'coral pink', 'sunny yellow']

def group(n):
    return 'A' if n in GREEN else 'B' if n in ARMBANDS else 'C'

BOX_SIZE = {8: (170, 165), 42: (150, 210)}

def box(n):
    cx, cy, k, _ = SPOTS[n - 1]; w, h = BOX_SIZE.get(n, SIZE[k])
    return (cx - w // 2, cy - h // 2, cx + w // 2, cy + h // 2)

def color(n):
    if group(n) == 'A': return 'GREEN'
    others = [m for m in range(1, len(SPOTS) + 1) if group(m) != 'A']
    return COLORS[others.index(n) % 4]

def description(n):
    _, _, k, act = SPOTS[n - 1]
    g = group(n)
    if g == 'A':
        suit = 'in solid bright GREEN (a clear, saturated grass green) with thin white side stripes'
    else:
        suit = f'in solid {color(n).upper()} with thin white side stripes (NOT green)'
    arm = ('He wears a matching pair of bright ORANGE inflatable swimming armbands, one on each upper arm, both clearly visible.'
           if g == 'B' else 'He wears NO armbands and no other flotation items.')
    return ('Add exactly ONE small boy into this region: the same boy as in the reference image (identical face, big spiky dark-brown hair tuft, '
            'light-tan skin, freckles, same body proportions). '
            f'He is {act}. He wears the same short-sleeve rash guard top and matching knee-length swim shorts as in the reference, but {suit}. {arm} '
            'Fit him entirely inside this region at a natural small size relative to the nearby props, matching the scene\'s perspective, cartoon line work, '
            'outlines, colors and lighting, with a soft contact shadow. Keep the rest of the region unchanged. No other people, no text.')
