"""New V2 subjects in three sizes (user, 2026-10-21): "daha az bölgeli levellar da
üret ... oyunun başı için az bölgeli, biraz orta seviye, şuanki gibi adetliler de".

python tools/stained/vitray/fresh_queue.py  ->  tools/stained/vitray/fresh/queue.json
Small panels open the V2 list, medium ones ramp up, large ones continue the
current style. Subjects avoid everything already in V2. Ids are 'v2n_<slug>'.
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent

SMALL = [  # [12, 22] panes: one bold subject, a few big background pieces
    ('apple', 'Kırmızı Elma', 'a single shiny apple with a leaf'),
    ('lemon', 'Limon', 'a lemon with two leaves'),
    ('watermelon', 'Karpuz Dilimi', 'a watermelon slice with seeds'),
    ('carrot', 'Havuç', 'a carrot with leafy top'),
    ('grapes', 'Üzüm Salkımı', 'a bunch of grapes with a vine leaf'),
    ('pine', 'Çam Ağacı', 'a simple pine tree on a hill'),
    ('shootingstar', 'Kayan Yıldız', 'a shooting star with a curved tail'),
    ('raincloud', 'Yağmur Bulutu', 'a cloud with three raindrops'),
    ('rainbow', 'Gökkuşağı', 'a rainbow arc over two small clouds'),
    ('paperboat', 'Kağıt Gemi', 'a folded paper boat on waves'),
    ('goldfish', 'Japon Balığı', 'a goldfish with a flowing tail'),
    ('birdnest', 'Kuş Yuvası', 'a nest with three eggs on a branch'),
    ('key', 'Eski Anahtar', 'an ornate old key'),
    ('bell', 'Çan', 'a bell with a bow'),
    ('giftbox', 'Hediye Kutusu', 'a gift box with a ribbon bow'),
    ('clover', 'Dört Yapraklı Yonca', 'a four-leaf clover'),
    ('daisy', 'Papatya', 'a single daisy flower with a stem'),
    ('ladybug', 'Uğur Böceği', 'a ladybug seen from above'),
    ('caterpillar', 'Tırtıl', 'a smiling caterpillar on a leaf'),
    ('pinecone', 'Kozalak', 'a pine cone'),
    ('feather', 'Tüy', 'a single curved feather'),
    ('icecream', 'Dondurma', 'an ice cream cone with two scoops'),
    ('teaglass', 'Çay Bardağı', 'a tulip-shaped Turkish tea glass on a saucer'),
    ('pomegranate', 'Nar', 'a pomegranate with a crown top'),
    ('avocado', 'Avokado', 'an avocado half with its stone'),
    ('snowdrop', 'Kardelen', 'a drooping snowdrop flower'),
    ('chick', 'Civciv', 'a round chick'),
    ('olive', 'Zeytin Dalı', 'an olive branch with olives'),
    ('evileye', 'Nazar Boncuğu', 'a round evil-eye bead'),
    ('candle', 'Mum', 'a lit candle with a flame'),
]
MEDIUM = [  # [28, 45] panes
    ('seagull', 'Martı', 'a seagull gliding over waves'),
    ('eagle', 'Kartal', 'an eagle with spread wings'),
    ('stork', 'Leylek', 'a stork standing on one leg'),
    ('beaver', 'Kunduz', 'a beaver beside a log'),
    ('kangaroo', 'Kanguru', 'a kangaroo mid-hop'),
    ('zebra', 'Zebra', 'a zebra head with bold stripes'),
    ('camel', 'Deve', 'a camel among dunes'),
    ('lamb', 'Kuzu', 'a woolly lamb in a meadow'),
    ('macaw', 'Ara Papağanı', 'a macaw on a branch'),
    ('pelican', 'Pelikan', 'a pelican on a post'),
    ('clocktower', 'Saat Kulesi', 'a clock tower'),
    ('rowboat', 'Kayık', 'a rowing boat on a lake'),
    ('vase', 'Çiçekli Vazo', 'a vase with three flowers'),
    ('birdcage', 'Kuş Kafesi', 'an open birdcage with a bird on top'),
    ('samovar', 'Semaver', 'a Turkish samovar with a teapot on top'),
    ('passionflower', 'Çarkıfelek', 'a passion flower bloom'),
    ('orchid', 'Orkide', 'an orchid stem with blossoms'),
    ('anglerfish', 'Fener Balığı', 'an anglerfish with its glowing lure'),
    ('shark', 'Köpek Balığı', 'a shark swimming'),
    ('hourglass', 'Kum Saati', 'an ornate hourglass'),
]
LARGE = [  # [70, 110] panes, like the current redraws
    ('aurora', 'Kuzey Işıkları', 'northern lights over a snowy pine forest and a cabin'),
    ('lavender', 'Lavanta Tarlası', 'lavender field rows towards a farmhouse at sunset'),
    ('riceterraces', 'Pirinç Terasları', 'rice terraces stepping down a valley'),
    ('sakura', 'Sakura Köprüsü', 'a red arched bridge under cherry blossoms'),
    ('fireflies', 'Ateş Böcekleri', 'fireflies over a pond at night'),
    ('sled', 'Kış Kızağı', 'a sled on a snowy hill with a village below'),
    ('greatwave', 'Büyük Dalga', 'a great curling ocean wave'),
    ('caravanserai', 'Kervansaray Avlusu', 'an arched caravanserai courtyard with a fountain'),
    ('flowermarket', 'Çiçek Pazarı', 'a flower market stall with buckets of flowers'),
    ('treehouse', 'Ağaç Ev', 'a treehouse in a big oak'),
    ('gardengate', 'Bahçe Kapısı', 'an arched garden gate covered in roses'),
    ('beehive', 'Arı Kovanı Bahçesi', 'beehives in a flower garden with bees'),
    ('floatingmarket', 'Yüzen Pazar', 'boats with fruit on a canal market'),
    ('lanterns', 'Fener Festivali', 'paper lanterns rising over a river'),
    ('vineyard', 'Bağ Bozumu', 'a vineyard on rolling hills with grapes in front'),
]


def main():
    queue = []
    for kind, items, target in (('small', SMALL, [12, 22]), ('medium', MEDIUM, [28, 45]), ('large', LARGE, [70, 110])):
        for n, (slug, name, scene) in enumerate(items):
            queue.append(dict(id=f'v2n_{slug}', name=name, scene=scene, kind='fresh', size=kind,
                              hard=kind == 'large' and n % 3 == 1, targetPanes=target, brief='FRESH_BRIEF.md'))
    out = HERE / 'fresh'
    out.mkdir(exist_ok=True)
    (out / 'queue.json').write_text(json.dumps(queue, ensure_ascii=False, indent=1) + '\n')
    print(f'{len(queue)} new subjects: small {len(SMALL)}, medium {len(MEDIUM)}, large {len(LARGE)}; '
          f'{sum(q["hard"] for q in queue)} hard')


if __name__ == '__main__':
    main()
