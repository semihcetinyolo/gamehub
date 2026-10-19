# Kil yuva, Kapak ve Buzlu taş: wireframe ve Astra listesi

## Kil ağız revizyonu · 19 Ekim 2026

Güncel ağız tasarımı: `wireframes/clay-mouth-v2.svg`. Eski hareketli üçgen huni ve sonradan eklenen CSS şerit yerine **sabit, yuvarlatılmış seramik bir giriş çerçevesi** kullanılır. Ortası ve altı açıktır; pişmiş toprak malzeme kil kaplamaya, ince pirinç kenar da tahtaya bağlanır. Tek yön işareti malzemeye oyulmuştur.

- Oyun kutusu: **128 × 40**, sol `cx − 64`, üst `y0 + 34`.
- Görsel: `clay-mouth-v2.png`, şeffaf PNG; orta boğaz en az 104 oyun birimi genişliğinde, alt kenar açık.
- Animasyon yok; mevcut bilye ve cep yerleşimi korunur.
- Üretim: yerleşik `image_gen.imagegen`; tam İngilizce prompt `clay-mouth-v2.prompt.txt`.
- Aşağıdaki huni bölümü önceki tasarımın arşividir; güncel ağız için bu revizyon geçerlidir.

Bu üç özellik için 13 şeffaf PNG üretildi ve oyuna bağlandı (18 Ekim 2026). `art.js` → `ART.features` görsel yollarını, `game.js` → `featureMarks()` yerleşimi yönetir. Buz kalıbı `discHTML()`, parçalar `shatter()`, tanıtımlar `showFeature()` üzerinden kullanılır. Üretim bilgisi ve prompt özeti: `assets/feature-assets.json`.
Ölçüler tahta görselinin pikseliyle verilmiştir (`board-panel.png`, 1024 px genişlik). Görselleri **2 katı boyutta**, **şeffaf PNG** olarak üretin. Görsellerde yazı olmamalı.

Ortak malzeme: krem mermer, cilalı pirinç, koyu yeşil kadife. Işık sol üstten gelen sıcak pencere ışığı, temas gölgeleri yumuşak.

---

## 1. Kil yuva: taş girer, çıkmaz

Oyuncu bir bakışta "bu yuva tek yönlü, giren taş geri çıkmaz" diye anlamalı. Bunun için üç ipucu bir arada kullanılıyor:
1. Yuvanın içi yeşil kadife değil, pişmiş toprak (kil) kaplı.
2. Yuvanın ağzında aşağı bakan oklu, kilden bir huni var.
3. Kil yuvadaki taşa dokunulunca alttan kırmızı bir uyarı çıkıyor: "Kil yuva tek yönlü: giren taş geri çıkmaz".

```text
          kanal (yeşil kadife)
   ───────────────────────────────
        ╲  ⌄  ⌄  ⌄  ╱      ← kil huni 140×44 (oklar aşağı doğru hafifçe hareket eder)
         ┃░░░░░░░░░┃
         ┃░  (●)  ░┃      ← kil kaplama 124 × (satır×110 + 10)
         ┃░  (●)  ░┃         taşlar kaplamanın ÜSTÜNDE görünür
         ┃░  (●)  ░┃
          ╲░░░░░░░╱       ← alt uç yuvarlak, yarıçap 58
```

| Asset | Dosya | Boyut (2×) | Not |
|---|---|---|---|
| Kil kaplama, 3 satır | `clay-liner-3.png` | 248 × 680 | Yuvanın içi; üst kenar düz, alt uç yarım daire |
| Kil kaplama, 4 satır | `clay-liner-4.png` | 248 × 900 | Aynı tasarımın uzun hali |
| Kil huni | `clay-funnel.png` | 280 × 88 | Aşağı doğru daralan; ortada kabartma üç ok (⌄⌄⌄) |
| Tanıtım kartı görseli | `clay-intro.png` | 480 × 400 | Solda yeşil ok ile taş içeri giriyor, sağda kırmızı çarpı ile taş çıkamıyor |

**Astra promptu (kaplama):** "Vertical U-shaped channel liner made of smooth terracotta clay, inner surface slightly hand-pressed with subtle fingerprints, warm orange-brown, darker edges and soft inner shadow at the top, rounded bottom end, top view, transparent background, no text, premium tabletop puzzle style matching cream marble and polished brass."

**Astra promptu (huni):** "Small terracotta clay funnel lip seen from above, trapezoid narrowing downward, three embossed downward chevrons in lighter clay, soft shadow, transparent background, no text, cozy premium board-game asset."

---

## 2. Kapak: her hamlede açılır, kapanır

Oyuncu kapağın şu anki durumunu ve bir sonraki hamlede değişeceğini anlamalı. Şu anki çözüm:
1. Yuvanın ağzında pirinçten iki sürgülü kanat var. Kapalıyken kanatlar ortada birleşiyor, açıkken yanlara çekiliyor. Her hamlede yaylanarak yer değiştiriyorlar.
2. Kanatların ortasında bir durum rozeti var: kapalıyken kırmızı ✕, açıkken yeşil ✓.
3. Kapalıyken yuvanın üstüne koyu, çizgili bir gölge geliyor; içindeki taşlar sönük görünüyor.
4. Kapalı yuvaya taş bırakmaya ya da oradan taş almaya çalışınca uyarı çıkıyor: "Kapak kapalı, bir hamle sonra açılır".

```text
   KAPALI                          AÇIK (bir sonraki hamle)
   ════════(✕)════════             ▐█          (✓)          █▌
   ┃▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒┃               ┃                        ┃
   ┃▒▒  (●) sönük ▒┃               ┃        (●)             ┃
   ┃▒▒  (●)       ▒┃               ┃        (●)             ┃
    ╲▒▒▒▒▒▒▒▒▒▒▒▒▒╱                 ╲                      ╱
   kanatlar 2 × 72×46              kanatlar yanlara çekilmiş
```

| Asset | Dosya | Boyut (2×) | Not |
|---|---|---|---|
| Sol kanat | `stopper-door-l.png` | 144 × 92 | Pirinç sürgü; sol ucu yuvarlak, sağ ucu düz (ortada birleşir) |
| Sağ kanat | `stopper-door-r.png` | 144 × 92 | Solun aynası |
| Durum rozeti (isteğe bağlı) | `stopper-chip-open.png` / `stopper-chip-shut.png` | 100 × 100 | Yeşil ✓ / kırmızı ✕ emaye düğme, pirinç çerçeve |
| Tanıtım kartı görseli | `stopper-intro.png` | 480 × 400 | Aynı yuva yan yana: açık / kapalı, arada ⇄ |

**Astra promptu (kanat):** "Half of a polished brass sliding gate seen from above, horizontal bar with rounded outer end and flat inner end, engraved grip lines, warm highlights, soft drop shadow, transparent background, no text, premium tabletop puzzle asset."

---

## 3. Buzlu taş: donmuş, bir yuva tamamlanınca çözülür

Oyuncu taşın donduğunu, rengini ve neyle çözüleceğini anlamalı. Şu anki çözüm:
1. Bilye köşeleri yuvarlatılmış kare bir buz kalıbının içinde. Kalıbın ortası saydam, böylece bilyenin rengi okunuyor. Kenarları buzlu beyaz, üstünde iki çatlak çizgisi var.
2. Sağ üst köşede mavi bir kar tanesi rozeti var.
3. Donmuş taşa dokunulunca uyarı çıkıyor: "Buzlu taş donmuş: herhangi bir yuvayı tamamlayınca buz kırılır".
4. Bir yuva tamamlanınca buz parçalara ayrılıp dağılıyor (8 parça) ve "Yuva tamamlandı, buz kırıldı!" yazısı çıkıyor.

```text
     DONMUŞ                          ✓ 1 yuva            SERBEST
   ╭──────────❄╮                                    ·  ╲ │ ╱  ·
   │ ░ ╲       │   ← kalıp 112×112, köşe 24           ─  (●)  ─   ← parçalar dışa uçar
   │   (●)  ╱  │      ortası saydam                    ·  ╱ │ ╲  ·
   │ ░      ░  │   ← rozet 42×42, sağ üst
   ╰───────────╯
```

| Asset | Dosya | Boyut (2×) | Not |
|---|---|---|---|
| Buz kalıbı | `ice-cube.png` | 224 × 224 | Yuvarlatılmış kare; **ortası %80 saydam**, kenarları buzlu beyaz, ince çatlaklar |
| Kar tanesi rozeti | `ice-chip.png` | 84 × 84 | Mavi emaye düğme, beyaz kar tanesi, beyaz çerçeve |
| Buz parçaları | `ice-shards.png` | 4 parça, her biri 60 × 44 | Kırılma animasyonu için; yatay sprite (240 × 44) |
| Tanıtım kartı görseli | `ice-intro.png` | 480 × 260 | Donmuş bilye → yeşil ✓ "1 yuva" → serbest bilye |

**Astra promptu (kalıp):** "Rounded square ice cube frame seen from above, clear transparent center so an object inside stays visible, frosty white beveled edges, a few thin white cracks, cold blue rim light, soft drop shadow, transparent background, no text, premium tabletop puzzle asset."

**Astra promptu (parçalar):** "Four small broken ice shards, clear blue-white glass-like ice, sharp edges, isolated on transparent background, top view, no text."

---

## Yerleştirme (kod tarafı)

| Parça | `featureMarks()` kutusu |
|---|---|
| Kil kaplama | `slotBox(x)`: sol `cx-62`, üst `y0+50`, 124 × (cap·110 + 10) |
| Kil huni | sol `cx-70`, üst `y0+30`, 140 × 44 |
| Kapak kanatları | sol `cx-72`, üst `y0+30`, 144 × 46 (her kanat yarı genişlik) |
| Kapalı gölgesi | `slotBox(x)` |
| Buz kalıbı | bilyenin kendi kutusu (104×104), 4 px taşar |
| Kar tanesi rozeti | bilyenin sağ üst köşesi, 42×42 |
