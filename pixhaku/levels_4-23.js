// Pixhaku — Level 4–23. tools/build_pack.js üretir; elle değil, tools/pack_4-23.js üzerinden düzenle.
// Pixhaku_prototype.html'deki levels dizisine eklenecek biçimde.
//   solution  mantıksal çözüm sırasında: Hint her zaman sıradaki kesinleşen parçayı verir.
//   artImage  üretilmiş görselin proje içindeki yolu; prototipte görsel dosyanın içine gömülür.
const PIXHAKU_LEVELS_4_23 = [
  {
    // Level 4 — Kiraz Çiçeği Tapınağı · easy (21) · Dik mi yatay mı
    rows: 6,
    cols: 6,
    clues: [
      { r: 0, c: 0, n: 3 },
      { r: 1, c: 3, n: 9 },
      { r: 1, c: 0, n: 6 },
      { r: 3, c: 2, n: 6 },
      { r: 5, c: 4, n: 6 },
      { r: 4, c: 5, n: 3 },
      { r: 5, c: 1, n: 3 }
    ],
    solution: [
      [0, 0, 0, 2],
      [0, 3, 2, 5],
      [3, 5, 5, 5],
      [5, 0, 5, 2],
      [3, 3, 5, 4],
      [3, 0, 4, 2],
      [1, 0, 2, 2]
    ],
    artName: "Cherry Blossom Shrine",
    artImage: "assets/levels/cherry-blossom-shrine.jpg",
    difficulty: 21,
    tag: "easy",
    artPrompt: "Cozy pixel-art cherry blossom shrine garden scene built on the Level 4 Shikaku region blueprint (6 zones, one continuous scene)."
  },
  {
    // Level 5 — Şeker Diyarı · easy (23) · Nefes molası
    rows: 6,
    cols: 6,
    clues: [
      { r: 1, c: 0, n: 3 },
      { r: 2, c: 2, n: 6 },
      { r: 3, c: 4, n: 8 },
      { r: 2, c: 5, n: 3 },
      { r: 3, c: 0, n: 9, h: 1 },
      { r: 5, c: 5, n: 3 },
      { r: 5, c: 4, n: 4 }
    ],
    solution: [
      [3, 5, 5, 5],
      [0, 0, 2, 0],
      [0, 5, 2, 5],
      [0, 3, 3, 4],
      [4, 3, 5, 4],
      [0, 1, 2, 2],
      [3, 0, 5, 2]
    ],
    artName: "Candy Land",
    artImage: "assets/levels/candy-land.jpg",
    difficulty: 23,
    tag: "easy",
    artPrompt: "Cozy pixel-art candy land scene built on the Level 5 Shikaku region blueprint (7 zones, one continuous scene)."
  },
  {
    // Level 6 — Mercan Resifi · easy (28) · Çift açılış
    rows: 6,
    cols: 6,
    clues: [
      { r: 0, c: 3, n: 12 },
      { r: 2, c: 0, n: 8 },
      { r: 2, c: 5, n: 6 },
      { r: 4, c: 1, n: 2 },
      { r: 5, c: 2, n: 2 },
      { r: 5, c: 3, n: 2 },
      { r: 5, c: 1, n: 2 },
      { r: 5, c: 5, n: 2 }
    ],
    solution: [
      [5, 0, 5, 1],
      [4, 2, 5, 2],
      [4, 3, 5, 3],
      [5, 4, 5, 5],
      [4, 0, 4, 1],
      [2, 4, 4, 5],
      [0, 0, 1, 5],
      [2, 0, 3, 3]
    ],
    artName: "Coral Reef",
    artImage: "assets/levels/coral-reef.jpg",
    difficulty: 28,
    tag: "easy",
    artPrompt: "Cozy pixel-art underwater coral reef scene built on the Level 6 Shikaku region blueprint (7 zones, one continuous scene)."
  },
  {
    // Level 7 — Hasat Çiftliği · medium (36) · Dik mi yatay mı
    rows: 7,
    cols: 7,
    clues: [
      { r: 1, c: 0, n: 6 },
      { r: 0, c: 3, n: 12, h: 1 },
      { r: 1, c: 5, n: 10 },
      { r: 2, c: 6, n: 3 },
      { r: 6, c: 0, n: 8 },
      { r: 3, c: 6, n: 4 },
      { r: 5, c: 4, n: 2 },
      { r: 5, c: 5, n: 2 },
      { r: 6, c: 3, n: 2 }
    ],
    solution: [
      [3, 0, 6, 1],
      [0, 6, 2, 6],
      [6, 2, 6, 3],
      [5, 4, 6, 4],
      [5, 5, 6, 5],
      [3, 6, 6, 6],
      [0, 4, 4, 5],
      [0, 2, 5, 3],
      [0, 0, 2, 1]
    ],
    artName: "Harvest Farm",
    artImage: "assets/levels/harvest-farm.jpg",
    difficulty: 36,
    tag: "medium",
    artPrompt: "Cozy pixel-art autumn harvest farm scene built on the Level 7 Shikaku region blueprint (8 zones, one continuous scene)."
  },
  {
    // Level 8 — Kitapçı Kafe · medium (36) · Nefes molası
    rows: 7,
    cols: 7,
    clues: [
      { r: 1, c: 0, n: 8, h: 1 },
      { r: 0, c: 6, n: 9 },
      { r: 2, c: 1, n: 6 },
      { r: 2, c: 3, n: 2 },
      { r: 4, c: 4, n: 4 },
      { r: 4, c: 6, n: 6 },
      { r: 4, c: 0, n: 3 },
      { r: 4, c: 2, n: 3 },
      { r: 6, c: 1, n: 6 },
      { r: 6, c: 5, n: 2 }
    ],
    solution: [
      [0, 4, 2, 6],
      [3, 5, 5, 6],
      [6, 5, 6, 6],
      [5, 1, 6, 3],
      [4, 1, 4, 3],
      [3, 4, 6, 4],
      [2, 3, 3, 3],
      [4, 0, 6, 0],
      [0, 0, 1, 3],
      [2, 0, 3, 2]
    ],
    artName: "Bookshop Café",
    artImage: "assets/levels/bookshop-cafe.jpg",
    difficulty: 36,
    tag: "medium",
    artPrompt: "Cozy pixel-art bookshop café interior scene built on the Level 8 Shikaku region blueprint (8 zones, one continuous scene)."
  },
  {
    // Level 9 — Çöl Vahası · medium (42) · Gizli sayı
    rows: 7,
    cols: 7,
    clues: [
      { r: 0, c: 0, n: 9 },
      { r: 0, c: 6, n: 4 },
      { r: 3, c: 4, n: 12 },
      { r: 3, c: 6, n: 4 },
      { r: 3, c: 1, n: 6 },
      { r: 6, c: 0, n: 8, h: 1 },
      { r: 5, c: 4, n: 2 },
      { r: 6, c: 6, n: 2 },
      { r: 6, c: 4, n: 2 }
    ],
    solution: [
      [0, 0, 2, 2],
      [5, 4, 5, 5],
      [1, 3, 4, 5],
      [0, 3, 0, 6],
      [1, 6, 4, 6],
      [5, 6, 6, 6],
      [6, 4, 6, 5],
      [5, 0, 6, 3],
      [3, 0, 4, 2]
    ],
    artName: "Desert Oasis",
    artImage: "assets/levels/desert-oasis.jpg",
    difficulty: 42,
    tag: "medium",
    artPrompt: "Cozy pixel-art desert oasis town scene built on the Level 9 Shikaku region blueprint (7 zones, one continuous scene)."
  },
  {
    // Level 10 — Kutup Gecesi · medium (46) · Çift açılış
    rows: 7,
    cols: 7,
    clues: [
      { r: 0, c: 1, n: 4 },
      { r: 3, c: 3, n: 12 },
      { r: 2, c: 5, n: 6 },
      { r: 4, c: 1, n: 6 },
      { r: 5, c: 5, n: 6 },
      { r: 6, c: 3, n: 6, h: 1 },
      { r: 5, c: 4, n: 3 },
      { r: 6, c: 0, n: 2 },
      { r: 6, c: 1, n: 2 },
      { r: 6, c: 5, n: 2 }
    ],
    solution: [
      [5, 0, 6, 0],
      [3, 5, 5, 6],
      [6, 5, 6, 6],
      [0, 5, 2, 6],
      [5, 1, 6, 1],
      [2, 0, 4, 1],
      [0, 0, 1, 1],
      [0, 2, 3, 4],
      [4, 4, 6, 4],
      [4, 2, 6, 3]
    ],
    artName: "Arctic Night",
    artImage: "assets/levels/arctic-night.jpg",
    difficulty: 46,
    tag: "medium",
    artPrompt: "Cozy pixel-art arctic night village scene built on the Level 10 Shikaku region blueprint (7 zones, one continuous scene)."
  },
  {
    // Level 11 — Lunapark Gecesi · medium (56) · Nefes molası
    rows: 8,
    cols: 8,
    clues: [
      { r: 0, c: 0, n: 9 },
      { r: 0, c: 5, n: 9, h: 1 },
      { r: 4, c: 6, n: 10 },
      { r: 3, c: 4, n: 6 },
      { r: 6, c: 1, n: 8 },
      { r: 4, c: 3, n: 6 },
      { r: 5, c: 4, n: 3 },
      { r: 4, c: 5, n: 2 },
      { r: 6, c: 6, n: 6, h: 1 },
      { r: 6, c: 5, n: 2 },
      { r: 7, c: 3, n: 3 }
    ],
    solution: [
      [0, 0, 2, 2],
      [4, 0, 7, 1],
      [7, 2, 7, 4],
      [6, 5, 7, 5],
      [4, 4, 6, 4],
      [4, 5, 5, 5],
      [4, 2, 6, 3],
      [3, 0, 3, 5],
      [0, 6, 4, 7],
      [5, 6, 7, 7],
      [0, 3, 2, 5]
    ],
    artName: "Carnival Night",
    artImage: "assets/levels/carnival-night.jpg",
    difficulty: 56,
    tag: "medium",
    artPrompt: "Cozy pixel-art night carnival scene built on the Level 11 Shikaku region blueprint (6 zones, one continuous scene)."
  },
  {
    // Level 12 — Buharlı Gök Şehri · medium (57) · Dik mi yatay mı
    rows: 8,
    cols: 8,
    clues: [
      { r: 3, c: 0, n: 4 },
      { r: 1, c: 2, n: 8 },
      { r: 2, c: 5, n: 10 },
      { r: 6, c: 7, n: 8 },
      { r: 2, c: 2, n: 4 },
      { r: 3, c: 2, n: 2 },
      { r: 7, c: 4, n: 10, h: 1 },
      { r: 4, c: 1, n: 3, h: 1 },
      { r: 7, c: 0, n: 9 },
      { r: 5, c: 6, n: 4 },
      { r: 7, c: 6, n: 2 }
    ],
    solution: [
      [5, 0, 7, 2],
      [0, 7, 7, 7],
      [0, 5, 4, 6],
      [7, 5, 7, 6],
      [5, 5, 6, 6],
      [2, 1, 2, 4],
      [0, 1, 1, 4],
      [0, 0, 3, 0],
      [3, 3, 7, 4],
      [3, 1, 3, 2],
      [4, 0, 4, 2]
    ],
    artName: "Steampunk Sky City",
    artImage: "assets/levels/steampunk-sky-city.jpg",
    difficulty: 57,
    tag: "medium",
    artPrompt: "Cozy pixel-art steampunk sky city scene built on the Level 12 Shikaku region blueprint (11 zones, one continuous scene)."
  },
  {
    // Level 13 — Korsan Koyu · hard (62) · Gizli sayı
    rows: 8,
    cols: 8,
    clues: [
      { r: 0, c: 1, n: 6 },
      { r: 0, c: 4, n: 3 },
      { r: 2, c: 5, n: 8 },
      { r: 5, c: 6, n: 6 },
      { r: 0, c: 7, n: 5 },
      { r: 5, c: 2, n: 6 },
      { r: 6, c: 4, n: 12 },
      { r: 4, c: 1, n: 4 },
      { r: 5, c: 1, n: 6, h: 1 },
      { r: 5, c: 7, n: 3 },
      { r: 6, c: 6, n: 2, h: 1 },
      { r: 7, c: 2, n: 3 }
    ],
    solution: [
      [0, 7, 4, 7],
      [5, 7, 7, 7],
      [0, 0, 2, 1],
      [3, 0, 4, 1],
      [0, 2, 0, 4],
      [0, 6, 5, 6],
      [0, 5, 7, 5],
      [1, 3, 6, 4],
      [1, 2, 6, 2],
      [6, 6, 7, 6],
      [7, 2, 7, 4],
      [5, 0, 7, 1]
    ],
    artName: "Pirate Cove",
    artImage: "assets/levels/pirate-cove.jpg",
    difficulty: 62,
    tag: "hard",
    artPrompt: "Cozy pixel-art tropical pirate cove scene built on the Level 13 Shikaku region blueprint (9 zones, one continuous scene)."
  },
  {
    // Level 14 — Dinozor Vadisi · hard (66) · Çift açılış
    rows: 8,
    cols: 8,
    clues: [
      { r: 1, c: 0, n: 3 },
      { r: 1, c: 3, n: 10 },
      { r: 1, c: 7, n: 4 },
      { r: 2, c: 6, n: 6 },
      { r: 2, c: 7, n: 3 },
      { r: 3, c: 1, n: 8 },
      { r: 4, c: 5, n: 6 },
      { r: 5, c: 2, n: 8, h: 1 },
      { r: 7, c: 0, n: 2 },
      { r: 7, c: 1, n: 4 },
      { r: 6, c: 4, n: 6 },
      { r: 7, c: 7, n: 4 }
    ],
    solution: [
      [6, 0, 7, 0],
      [2, 7, 4, 7],
      [0, 6, 1, 7],
      [0, 0, 2, 0],
      [3, 0, 4, 3],
      [0, 1, 1, 5],
      [2, 1, 2, 6],
      [3, 4, 4, 6],
      [5, 0, 5, 7],
      [6, 6, 7, 7],
      [6, 1, 7, 2],
      [6, 3, 7, 5]
    ],
    artName: "Dinosaur Valley",
    artImage: "assets/levels/dinosaur-valley.jpg",
    difficulty: 66,
    tag: "hard",
    artPrompt: "Cozy pixel-art prehistoric dinosaur valley scene built on the Level 14 Shikaku region blueprint (9 zones, one continuous scene)."
  },
  {
    // Level 15 — Mantar Ormanı Peri Köyü · hard (71) · Dik mi yatay mı
    rows: 9,
    cols: 8,
    clues: [
      { r: 2, c: 2, n: 16, h: 1 },
      { r: 1, c: 5, n: 10 },
      { r: 0, c: 6, n: 7 },
      { r: 1, c: 7, n: 6 },
      { r: 6, c: 0, n: 12 },
      { r: 5, c: 3, n: 4 },
      { r: 6, c: 4, n: 3, lock: 4 },
      { r: 6, c: 5, n: 3 },
      { r: 8, c: 7, n: 3 },
      { r: 8, c: 6, n: 2 },
      { r: 8, c: 2, n: 6 }
    ],
    solution: [
      [6, 7, 8, 7],
      [7, 6, 8, 6],
      [0, 7, 5, 7],
      [0, 6, 6, 6],
      [0, 4, 4, 5],
      [5, 5, 7, 5],
      [8, 0, 8, 5],
      [4, 0, 7, 2],
      [5, 4, 7, 4],
      [4, 3, 7, 3],
      [0, 0, 3, 3]
    ],
    artName: "Mushroom Village",
    artImage: "taslaklar/mushroom-village-taslak.png",
    difficulty: 71,
    tag: "hard",
    artPrompt: "Cozy pixel-art mushroom forest fairy village scene built on the Level 15 Shikaku region blueprint (9 zones, one continuous scene)."
  },
  {
    // Level 16 — Kristal Mağarası · hard (76) · Gizli sayı
    rows: 10,
    cols: 7,
    clues: [
      { r: 1, c: 1, n: 6 },
      { r: 3, c: 2, n: 7, h: 1 },
      { r: 3, c: 3, n: 9 },
      { r: 2, c: 4, n: 5, lock: 4 },
      { r: 1, c: 6, n: 6 },
      { r: 4, c: 1, n: 6 },
      { r: 6, c: 5, n: 6 },
      { r: 7, c: 6, n: 6 },
      { r: 7, c: 4, n: 4 },
      { r: 8, c: 1, n: 6 },
      { r: 7, c: 2, n: 2 },
      { r: 9, c: 5, n: 7 }
    ],
    solution: [
      [9, 0, 9, 6],
      [6, 0, 8, 1],
      [3, 6, 8, 6],
      [7, 2, 8, 2],
      [0, 3, 8, 3],
      [0, 5, 2, 6],
      [3, 5, 8, 5],
      [5, 4, 8, 4],
      [0, 4, 4, 4],
      [3, 0, 5, 1],
      [0, 0, 2, 1],
      [0, 2, 6, 2]
    ],
    artName: "Crystal Cave",
    artImage: "taslaklar/crystal-cave-taslak.png",
    difficulty: 76,
    tag: "hard",
    artPrompt: "Cozy pixel-art crystal cave mine scene built on the Level 16 Shikaku region blueprint (9 zones, one continuous scene)."
  },
  {
    // Level 17 — Oyuncak Atölyesi · hard (80) · Çift açılış · Kesişim ve eleme
    rows: 9,
    cols: 8,
    clues: [
      { r: 1, c: 0, n: 9 },
      { r: 2, c: 1, n: 5 },
      { r: 1, c: 3, n: 14 },
      { r: 1, c: 4, n: 5 },
      { r: 4, c: 5, n: 8 },
      { r: 5, c: 6, n: 8, h: 1 },
      { r: 3, c: 7, n: 7, lock: 4 },
      { r: 7, c: 1, n: 4 },
      { r: 6, c: 4, n: 3 },
      { r: 7, c: 3, n: 4 },
      { r: 7, c: 7, n: 2 },
      { r: 8, c: 5, n: 3 }
    ],
    solution: [
      [0, 0, 8, 0],
      [0, 2, 6, 3],
      [0, 4, 4, 4],
      [0, 1, 4, 1],
      [5, 1, 8, 1],
      [7, 2, 8, 3],
      [0, 5, 7, 5],
      [5, 4, 7, 4],
      [8, 4, 8, 6],
      [7, 7, 8, 7],
      [0, 7, 6, 7],
      [0, 6, 7, 6]
    ],
    artName: "Toy Workshop",
    artImage: "taslaklar/toy-workshop-taslak.png",
    difficulty: 80,
    tag: "hard",
    artPrompt: "Cozy pixel-art toy maker's workshop interior scene built on the Level 17 Shikaku region blueprint (12 zones, one continuous scene)."
  },
  {
    // Level 18 — Perili Köşk · hard (81) · Çift gizli sayı
    rows: 10,
    cols: 7,
    clues: [
      { r: 1, c: 0, n: 10 },
      { r: 2, c: 1, n: 4 },
      { r: 0, c: 2, n: 4 },
      { r: 3, c: 4, n: 15, lock: 4 },
      { r: 3, c: 2, n: 8, h: 1 },
      { r: 4, c: 3, n: 5 },
      { r: 8, c: 1, n: 6 },
      { r: 6, c: 4, n: 8, h: 1 },
      { r: 6, c: 6, n: 5 },
      { r: 8, c: 3, n: 3 },
      { r: 9, c: 5, n: 2 }
    ],
    solution: [
      [0, 0, 9, 0],
      [7, 3, 9, 3],
      [9, 4, 9, 5],
      [5, 6, 9, 6],
      [2, 3, 6, 3],
      [0, 2, 1, 3],
      [0, 1, 3, 1],
      [4, 1, 9, 1],
      [2, 2, 9, 2],
      [0, 4, 4, 6],
      [5, 4, 8, 5]
    ],
    artName: "Haunted Manor",
    artImage: "taslaklar/haunted-manor-taslak.png",
    difficulty: 81,
    tag: "hard",
    artPrompt: "Cozy pixel-art cute-spooky Halloween manor scene built on the Level 18 Shikaku region blueprint (8 zones, one continuous scene)."
  },
  {
    // Level 19 — Savana Gün Batımı · expert (84) · Gizli sayı
    rows: 10,
    cols: 8,
    clues: [
      { r: 0, c: 1, n: 9 },
      { r: 1, c: 3, n: 6 },
      { r: 3, c: 4, n: 5 },
      { r: 4, c: 5, n: 8 },
      { r: 7, c: 6, n: 10, lock: 3 },
      { r: 4, c: 7, n: 6 },
      { r: 4, c: 1, n: 9 },
      { r: 7, c: 4, n: 5 },
      { r: 7, c: 1, n: 9, h: 1 },
      { r: 7, c: 3, n: 3 },
      { r: 7, c: 7, n: 4 },
      { r: 8, c: 5, n: 2 },
      { r: 9, c: 2, n: 4 }
    ],
    solution: [
      [0, 0, 2, 2],
      [6, 7, 9, 7],
      [0, 7, 5, 7],
      [0, 6, 9, 6],
      [0, 5, 7, 5],
      [8, 5, 9, 5],
      [0, 3, 5, 3],
      [6, 3, 8, 3],
      [3, 0, 5, 2],
      [0, 4, 4, 4],
      [5, 4, 9, 4],
      [9, 0, 9, 3],
      [6, 0, 8, 2]
    ],
    artName: "Savanna Sunset",
    artImage: "taslaklar/savanna-sunset-taslak.png",
    difficulty: 84,
    tag: "expert",
    artPrompt: "Cozy pixel-art golden-hour savanna scene built on the Level 19 Shikaku region blueprint (9 zones, one continuous scene)."
  },
  {
    // Level 20 — Ay Üssü · expert (89) · Çok seçenekli kararlar
    rows: 10,
    cols: 8,
    clues: [
      { r: 1, c: 0, n: 4 },
      { r: 2, c: 1, n: 6 },
      { r: 0, c: 3, n: 5 },
      { r: 1, c: 7, n: 5 },
      { r: 7, c: 2, n: 9 },
      { r: 2, c: 4, n: 10, lock: 4 },
      { r: 2, c: 5, n: 4 },
      { r: 2, c: 6, n: 9 },
      { r: 8, c: 0, n: 5 },
      { r: 6, c: 5, n: 5 },
      { r: 7, c: 7, n: 5, h: 1 },
      { r: 7, c: 1, n: 3, h: 1 },
      { r: 7, c: 3, n: 8 },
      { r: 9, c: 0, n: 2 }
    ],
    solution: [
      [9, 0, 9, 1],
      [1, 2, 9, 2],
      [4, 0, 8, 0],
      [0, 0, 3, 0],
      [1, 6, 9, 6],
      [5, 5, 9, 5],
      [1, 5, 4, 5],
      [0, 2, 0, 6],
      [0, 7, 4, 7],
      [0, 1, 5, 1],
      [6, 1, 8, 1],
      [5, 7, 9, 7],
      [1, 3, 5, 4],
      [6, 3, 9, 4]
    ],
    artName: "Moon Base",
    artImage: "taslaklar/moon-base-taslak.png",
    difficulty: 89,
    tag: "expert",
    artPrompt: "Cozy pixel-art moon base scene built on the Level 20 Shikaku region blueprint (12 zones, one continuous scene)."
  },
  {
    // Level 21 — Viking Fiyortu · expert (92) · Çift açılış
    rows: 10,
    cols: 8,
    clues: [
      { r: 0, c: 4, n: 6 },
      { r: 1, c: 7, n: 6 },
      { r: 6, c: 0, n: 7 },
      { r: 3, c: 1, n: 7 },
      { r: 4, c: 2, n: 7 },
      { r: 2, c: 4, n: 8 },
      { r: 5, c: 5, n: 6, h: 1 },
      { r: 6, c: 7, n: 10, lock: 4 },
      { r: 8, c: 4, n: 10 },
      { r: 8, c: 5, n: 3 },
      { r: 8, c: 1, n: 6 },
      { r: 8, c: 6, n: 4 }
    ],
    solution: [
      [7, 5, 9, 5],
      [5, 3, 9, 4],
      [1, 3, 4, 4],
      [1, 2, 7, 2],
      [8, 0, 9, 2],
      [1, 0, 7, 0],
      [1, 1, 7, 1],
      [0, 0, 0, 5],
      [0, 6, 2, 7],
      [3, 6, 7, 7],
      [8, 6, 9, 7],
      [1, 5, 6, 5]
    ],
    artName: "Viking Fjord",
    artImage: "taslaklar/viking-fjord-taslak.png",
    difficulty: 92,
    tag: "expert",
    artPrompt: "Cozy pixel-art Viking fjord village scene built on the Level 21 Shikaku region blueprint (10 zones, one continuous scene)."
  },
  {
    // Level 22 — Gökyüzü Adaları · expert (96) · Gizli sayı · Kesişim ve eleme
    rows: 10,
    cols: 8,
    clues: [
      { r: 3, c: 1, n: 10, h: 1 },
      { r: 5, c: 2, n: 7 },
      { r: 5, c: 3, n: 10 },
      { r: 7, c: 4, n: 10, h: 1 },
      { r: 1, c: 5, n: 6 },
      { r: 1, c: 7, n: 7 },
      { r: 5, c: 5, n: 12 },
      { r: 6, c: 0, n: 5 },
      { r: 7, c: 1, n: 5 },
      { r: 8, c: 2, n: 3, lock: 4 },
      { r: 8, c: 7, n: 2 },
      { r: 9, c: 6, n: 3 }
    ],
    solution: [
      [0, 7, 6, 7],
      [5, 1, 9, 1],
      [5, 0, 9, 0],
      [0, 2, 6, 2],
      [0, 0, 4, 1],
      [0, 3, 9, 3],
      [7, 2, 9, 2],
      [7, 7, 8, 7],
      [9, 5, 9, 7],
      [3, 5, 8, 6],
      [0, 5, 2, 6],
      [0, 4, 9, 4]
    ],
    artName: "Sky Islands",
    artImage: "taslaklar/sky-islands-taslak.png",
    difficulty: 96,
    tag: "expert",
    artPrompt: "Cozy pixel-art floating sky islands scene built on the Level 22 Shikaku region blueprint (12 zones, one continuous scene)."
  },
  {
    // Level 23 — Orman Tapınağı · expert (100) · Çift açılış · Gizli sayı
    rows: 10,
    cols: 8,
    clues: [
      { r: 4, c: 0, n: 7 },
      { r: 4, c: 1, n: 14, h: 1 },
      { r: 1, c: 5, n: 12 },
      { r: 3, c: 6, n: 5, lock: 4 },
      { r: 1, c: 7, n: 5 },
      { r: 4, c: 4, n: 9 },
      { r: 6, c: 6, n: 6 },
      { r: 7, c: 1, n: 6 },
      { r: 8, c: 2, n: 7 },
      { r: 8, c: 7, n: 2, h: 1 },
      { r: 9, c: 3, n: 5 },
      { r: 9, c: 6, n: 2 }
    ],
    solution: [
      [0, 7, 4, 7],
      [9, 0, 9, 4],
      [9, 5, 9, 6],
      [8, 0, 8, 6],
      [0, 0, 6, 0],
      [7, 0, 7, 5],
      [5, 6, 7, 7],
      [8, 7, 9, 7],
      [4, 3, 6, 5],
      [0, 3, 3, 5],
      [0, 6, 4, 6],
      [0, 1, 6, 2]
    ],
    artName: "Jungle Temple",
    artImage: "taslaklar/jungle-temple-taslak.png",
    difficulty: 100,
    tag: "expert",
    artPrompt: "Cozy pixel-art ancient jungle temple ruins scene built on the Level 23 Shikaku region blueprint (13 zones, one continuous scene)."
  }
];

if (typeof module !== "undefined") module.exports = PIXHAKU_LEVELS_4_23;
