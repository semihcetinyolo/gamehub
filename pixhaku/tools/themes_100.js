"use strict";
// 77 additional reward scenes. Each row defines six connected composition regions:
// distant backdrop, main subject, tall right feature, foreground left, central path, foreground right.
const entries = `
Sunflower Mill|Ayçiçeği Değirmeni|sunrise clouds|wooden windmill|sunflower field|flour sacks|cobbled mill path|small millpond
Lavender Cottage|Lavanta Evi|hazy violet hills|thatched cottage|lavender rows|garden baskets|flower-lined path|stone well
Apple Orchard|Elma Bahçesi|spring hills|apple trees|red barn|fallen apples|grass lane|wooden cider press
Duck Pond|Ördek Göleti|willow canopy|duck pond|reed beds|ducklings on bank|wooden footbridge|water lilies
Bunny Garden|Tavşan Bahçesi|soft garden hedges|carrot beds|rabbit hutch|resting rabbits|garden stepping stones|watering can and flowers
Tea Terrace|Çay Terası|misty green hills|tea pavilion|terraced tea bushes|tea basket|winding terrace steps|tea cups on low table
Bakery Courtyard|Fırın Avlusu|warm rooftops|stone bread oven|bakery window|bread baskets|cobbled courtyard|flour cart
Lemon Grove|Limon Korusu|bright coastal sky|lemon trees|yellow farmhouse|lemon baskets|sunlit garden path|blue ceramic fountain
Butterfly Meadow|Kelebek Çayırı|pale summer sky|flower meadow|birch grove|butterflies on flowers|meadow trail|shallow stream
Honey Farm|Bal Çiftliği|sunny hills|colorful beehives|blossoming trees|honey jars|clover path|wooden beekeeper shed
Cozy Campsite|Sıcak Kamp Alanı|pine forest canopy|canvas tent|tall pines|campfire and kettle|forest trail|camping chairs by creek
Wool Workshop|Yün Atölyesi|warm rafters|wooden spinning wheel|shelves of yarn|wool baskets|woven rug|loom near window
Clover Stable|Yonca Ahırı|sunlit pasture|timber stable|hayloft|pony by fence|gravel stable path|water trough
Berry Picnic|Meyveli Piknik|soft hills|picnic blanket under oak|berry bushes|fruit basket|grass path|duck beside creek
Rainy Bookstreet|Yağmurlu Kitap Sokağı|rainy evening rooftops|cozy bookshop|lamplit apartment facade|books beneath awning|wet cobbled street|red bicycle
Harbor Lighthouse|Liman Feneri|ocean horizon|white lighthouse|rocky headland|fishing nets|harbor steps|moored sailboat
Bamboo Onsen|Bambu Kaplıcası|misty mountain sky|outdoor hot spring|bamboo grove|smooth mossy rocks|wooden walkway|stone lantern
Rose Conservatory|Gül Serası|glass roof and sky|arched rose trellis|climbing roses|terracotta pots|greenhouse tiled path|marble basin
Canal Houseboats|Kanal Evleri|pastel city skyline|colorful houseboat|canal houses|flower boxes|canal towpath|arched bridge reflected in water
Mountain Railway|Dağ Treni|snowy distant peaks|small red locomotive|pine mountain slope|station luggage|curving railway|wildflowers beside tracks
Old Clock Shop|Eski Saatçi|wooden ceiling beams|antique workbench|wall clocks|clockwork parts|checker floor|pendulum clock
Lotus Pavilion|Nilüfer Köşkü|golden lake haze|wooden pavilion|flowering willow|lotus blossoms|curved garden bridge|koi water
Snowy Bakery|Karlı Fırın|snowy village roofs|glowing bakery|snow-laden fir|bread sled|snowy cobbled lane|warm window and lantern
Hillside Vineyard|Yamaç Bağı|amber rolling hills|vineyard farmhouse|grape terraces|harvest baskets|stone vineyard stairs|wine barrels
Cat Rooftops|Kedi Çatıları|sunset city sky|warm terracotta rooftops|chimneys and ivy|sleeping cats|roof ridge walkway|roof garden
Paper Lantern Lane|Fenerli Sokak|indigo evening sky|lantern-lit tea stall|timber facades|flower cart|narrow stone lane|small koi canal
Maple Watermill|Akçaağaç Su Değirmeni|autumn forest|timber watermill|red maple grove|fallen leaves|mossy bridge|turning wheel and stream
Firefly Marsh|Ateşböceği Bataklığı|twilight sky|reedy wetland|cypress trees|glowing fireflies|wooden boardwalk|water reflections
Glassblower Studio|Cam Atölyesi|brick vaulted ceiling|glassblowing furnace|colored glass shelves|glass tools|stone studio floor|sunlit glass vessels
Seashell Market|Deniz Kabuğu Pazarı|turquoise bay|striped market stalls|palm grove|shell baskets|sandy market lane|fishing boat
Mossy Ruins|Yosunlu Harabeler|forest light shafts|ancient stone arch|vine-covered wall|ferns and mushrooms|broken flagstone path|still pool
Riverside Pottery|Nehir Kıyısı Çömlekçisi|willow shade|pottery workshop|kiln chimney|clay pots|riverside stepping stones|potter wheel by window
Autumn Bridge|Sonbahar Köprüsü|orange woodland|arched stone bridge|golden birches|leaf-covered bank|riverside trail|reflective stream
Hilltop Observatory|Tepe Gözlemevi|starry violet sky|small domed observatory|cypress-lined hill|astronomy equipment|moonlit steps|roof telescope
Tropical Greenhouse|Tropik Sera|glass greenhouse roof|lush palms|giant fern wall|orchids|curving tiled path|small fish pool
Desert Caravan|Çöl Kervanı|soft desert dunes|resting camel caravan|date palms|woven market baskets|sand trail|shaded water basin
Penguin Cove|Penguen Koyu|pastel polar sky|penguin colony|blue ice cliffs|pebbled snowy shore|icy inlet|calm sea with ice floes
Redwood Cabin|Sekoya Kulübesi|high redwood canopy|tiny timber cabin|giant redwood trunk|mushroom garden|forest steps|gentle brook
Coral Library|Mercan Kütüphanesi|blue underwater rays|ancient reading hall|coral pillars|shell bookshelves|mosaic floor|fish and sea grass
Floating Teahouse|Yüzen Çay Evi|sunset clouds|wooden teahouse on floating rock|hanging gardens|tea terrace|suspended footbridge|falling stream
Geode Workshop|Jeot Atölyesi|rocky cavern roof|gem cutter bench|amethyst geodes|crystal trays|stone walkway|underground pool
Alpine Clocktower|Alp Saat Kulesi|snowy peaks|stone clocktower|alpine chalets|flower balcony|village stairs|mountain fountain
Underwater Station|Sualtı İstasyonu|deep blue ocean|glass research dome|kelp forest|submarine tools|lit connecting tunnel|coral reef
Dragon Nursery|Ejderha Yuvası|warm cave roof|sleeping baby dragon|glowing egg nests|soft moss bed|cavern stepping stones|gentle lava spring
Meteor Crater|Meteor Krateri|violet twilight sky|glowing meteor in crater|rock pinnacles|crystal fragments|crater rim path|shallow reflective pool
Enchanted Loom|Büyülü Tezgâh|attic beams and stars|magical weaving loom|hanging colored threads|yarn baskets|woven carpet|lantern window
Moonlit Aquarium|Ay Işığı Akvaryumu|moonlit glass ceiling|large aquarium tank|seaweed columns|shell exhibits|tiled viewing path|jellyfish display
Cloud Windmills|Bulut Değirmenleri|peach cloud sea|floating windmill|tall wind turbines|flower island|rope bridge|waterfall into clouds
Amber Forest|Kehribar Ormanı|golden forest canopy|giant amber tree|moss-covered roots|amber stones|winding fern path|golden woodland pool
Frost Palace|Buz Sarayı|aurora sky|ice palace gates|crystalline towers|snow sculptures|frozen bridge|ice fountain
Clockwork Harbor|Saat Mekanizmalı Liman|smoky pastel skyline|brass steamship|harbor cranes|copper tools|gear-lined dock|harbor reflections
Lotus Cavern|Nilüfer Mağarası|cavern ceiling with light shaft|giant lotus on underground lake|limestone columns|glowing flowers|mossy stepping stones|cascading spring
Desert Planet|Çöl Gezegeni|ringed planet sky|small desert outpost|sandstone spires|solar equipment|dune path|glass greenhouse
Treehouse Village|Ağaç Evler Köyü|leaf canopy|stacked timber treehouses|giant tree trunk|garden platform|spiraling stairs|hanging bridge
Sakura Night Train|Gece Sakura Treni|starry spring sky|vintage night train|cherry blossom grove|station lanterns|railway platform|river reflection
Volcanic Spa|Volkan Kaplıcası|smoky mountain horizon|steaming mineral pool|basalt columns|warm stones|wooden spa bridge|red mineral waterfall
Sunken Courtyard|Batık Avlu|underwater blue rays|ancient courtyard fountain|broken marble pillars|sea anemones|mosaic walkway|school of fish
Celestial Garden|Göksel Bahçe|starry blue sky|golden garden pavilion|moon-shaped arch|glowing flowers|marble garden path|reflecting celestial pool
Aurora Village|Kutup Işığı Köyü|green aurora sky|snowy fishing village|icy mountain|warm cabin windows|snowy harbor walkway|dark fjord reflections
Stone Giant Valley|Taş Devler Vadisi|misty valley sky|weathered gentle stone giant|steep forest cliffs|wildflower meadow|ancient stone steps|narrow river
Canyon Monastery|Kanyon Manastırı|sunlit canyon sky|cliffside monastery|red sandstone cliffs|prayer garden|rock-cut stairs|blue river far below
Mechanical Garden|Mekanik Bahçe|glass dome sky|brass botanical greenhouse|clockwork trees|metal flowers|copper garden path|reflective gear fountain
Stormwatch Tower|Fırtına Kulesi|dramatic ocean clouds|stone watchtower|sea cliffs|heather and lantern|winding cliff path|waves around rocks
Tidal Temple|Gelgit Tapınağı|warm sea horizon|ancient coastal temple|sea stacks|tidal shells|submerged stepping stones|turquoise tidal pool
Whale Sanctuary|Balina Sığınağı|underwater sunbeams|gentle whale near ruins|kelp forest|coral gardens|ancient seabed avenue|small glowing fish
Crystal Observatory|Kristal Gözlemevi|star-filled indigo sky|crystal-domed observatory|amethyst spires|astronomy instruments|glass bridge|reflecting crystal basin
Sky Archive|Gökyüzü Arşivi|cloud-filled golden sky|floating library tower|suspended bookshelves|reading terrace|stone bridge in clouds|cascading sky garden
Ancient Starport|Antik Uzay Limanı|ringed world horizon|weathered starship hangar|alien stone pillars|cargo and vines|mossy landing strip|luminous water channel
Coral Citadel|Mercan Hisarı|deep blue ocean|coral-covered fortress|tall coral spires|shell gardens|arched seabed bridge|glowing reef fish
Eclipse Pagoda|Tutulma Pagodası|soft eclipse sky|mountaintop pagoda|ancient pines|stone lantern garden|long stone stairs|reflective mountain pool
Dream Weaver Tower|Düş Dokuyucu Kulesi|violet starry sky|spiraling dream tower|floating fabric ribbons|thread garden|curving stone bridge|moonlit cloud well
Obsidian Waterfall|Obsidyen Şelalesi|misty cavern opening|bright waterfall|black volcanic columns|emerald moss|wet basalt steps|clear turquoise pool
Lunar Botanical Dome|Ay Botanik Kubbesi|Earth above lunar horizon|glass botanical dome|lunar rock ridge|flower beds inside dome|glass corridor|small indoor pond
Timekeeper Atrium|Zaman Bekçisi Avlusu|glass skylight with stars|huge ornate clock mechanism|brass column gallery|potted ferns|marble atrium floor|reflective water basin
Prismatic Canyon|Prizma Kanyonu|warm sunset sky|rainbow mineral canyon|quartz cliffs|crystal outcrops|narrow canyon trail|emerald river
Starlight Dragon Grove|Yıldızlı Ejderha Korusu|starry forest canopy|peaceful luminous dragon|ancient giant trees|glowing mushrooms|fern-lined path|quiet forest pool
Dawn Worldtree|Şafak Dünya Ağacı|golden dawn sky|vast ancient worldtree|floating root islands|flowering roots|spiral root stairway|luminous waterfall
`.trim().split('\n');
const palette = ["#a9cce2", "#b88c67", "#759783", "#d6b57c", "#bdb5a2", "#739fba"];
const counts = {easy:14, medium:24, hard:24, expert:15};
let index = 0;
module.exports = Object.entries(counts).flatMap(([band,count]) => Array.from({length:count}, (_,j) => {
  const [artName,tr,...parts] = entries[index++].split('|');
  const id = artName.toLowerCase().replace(/[^a-z0-9]+/g,'-');
  const sizes = band === 'easy' ? [[6,6],[6,7],[5,6]] : band === 'medium' ? [[7,7],[7,8],[6,8]] : band === 'hard' ? [[8,8],[8,9],[7,10]] : [[8,10],[8,9],[7,10]];
  const [cols,rows] = sizes[j%sizes.length];
  const target = {easy: [24,40], medium:[44,79], hard:[83,113], expert:[116,140]}[band];
  return {id, tr, artName, band, target: Math.round(target[0]+j/(count-1)*(target[1]-target[0])),
    variety: band==='expert'?'Uzak hücre ilişkileri · kesişim':band==='hard'?'Uzun şeritler · eleme':band==='medium'?'Çok seçenekli kararlar':'Mantığa alışma',
    cols,rows, artGrid:['AAAAAA','BBBBCC','BBBBCC','DDEECC','DDEEFF','DDEEFF'],
    zones: Object.fromEntries(parts.map((part,k)=>[String.fromCharCode(65+k),[part,part,palette[k]]])),
    scene: {what:artName.toLowerCase(), place:artName.toLowerCase(),structure:'connected environment',
      bullets:[`main focus: ${parts[1]}, connected naturally to ${parts[2]}`,`foreground: ${parts[3]}, ${parts[4]}, and ${parts[5]}`],
      light:`a single coherent light source appropriate to ${parts[0]}`,identity:'local materials, depth, vegetation and lighting',
      cross:'Paths, water, foliage and shadows connect foreground and background into one place.',
      bounds:'changes in terrain, depth and natural edges', style:'intricate hand-placed pixel clusters, no smooth vector surfaces',palette:'rich natural colors with soft cream highlights',readAs:artName.toLowerCase()}
  };
}));
if (index !== 77 || entries.length !== 77) throw new Error(`Expected 77 themes, got ${entries.length}`);
