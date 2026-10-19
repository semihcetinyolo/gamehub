# Cozy Marble Puzzle — Astra asset listesi

Bu liste, referans görseldeki premium masa oyunu dilini korumak için kullanılır. Yeni bir özellik eklenirken önce bu listede görsel karşılığı tanımlanır.

## Üretilen ve bağlı assetler

| Asset | Dosya | Kullanım |
|---|---|---|
| Ceviz masa | `assets/tabletop.jpg` | Uygulama arka planı |
| Krem Calacatta mermer | `assets/marble-board.jpg` | Oyun tablası |
| Turkuaz cam bilye | `assets/marble-teal.png` | Renk 0 |
| Pembe cam bilye | `assets/marble-pink.png` | Renk 1 |
| Mavi cam bilye | `assets/marble-blue.png` | Renk 2 |
| Turuncu cam bilye | `assets/marble-orange.png` | Renk 3 |
| Birleşik oyun tablası | `assets/board-panel.png` | Mermer, pirinç ve tek parça kadife oluk yüzeyi |
| Feature sprite sheet | `assets/features-sprite.png` | 8 Astra feature görseli (kaynak) |
| Feature görselleri | `assets/feat-*.png` | Sprite'tan kesilmiş tek tek görseller (oyun bunları kullanır) |
| Oyun bilyeleri | `assets/disc-*.png` | marble-*.png'lerin eşit boya kırpılmış 256 px halleri |

## Yeni özellik görsel listesi

| Özellik | Gerekli görsel | Uygulama kuralı |
|---|---|---|
| Bölüm rozeti | Koyu yeşil deri / kadife kapsül, pirinç çerçeve | CSS/SVG, merkez üst bar |
| Geri al / yeniden başlat | Şeftali renkli porselen buton, koyu kahve ikon | CSS + mevcut SVG ikon |
| Bölüm menüsü | Krem mermer panel, pirinç kenar, yeşil başlık | CSS panel |
| Hedef kartı | İnce krem mermer, altın çerçeve | Oyun SVG’si |
| Boş oluk | Koyu yeşil kadife iç yüzey, altın kenar | Oyun SVG’si |
| Kilitli yuva | Pirinç kilit rozeti, yumuşak gölge | SVG/CSS |
| İpucu | Küçük pirinç yıldız veya pusula | CSS/SVG |
| Başarı ekranı | Krem mermer kart, koyu yeşil ana buton, altın yıldız | CSS panel |
| Bilye çarpışması | Cam tıkırtısı + kısa rezonans | Web Audio |
| Bilye seçimi | Bilyenin altında sıcak altın halo | CSS |
| Bilye sürükleme | Temas gölgesi ve parlaklık artışı | CSS |
| Zor seviye etiketi | Koyu kırmızı / bakır küçük rozet | CSS |
| Bölüm tamamlandı | Pirinç mühür, yıldızlar, koyu yeşil CTA | CSS/SVG |

Feature sprite eşlemesi: üst sıra gizli taş, kil yuva, kilitli kutu, buzlu taş; alt sıra alçı, kapak, renkli cep, çuval. Sprite eş ızgara değil; oyun kesilmiş `feat-*.png` dosyalarını kullanır.

## Astra prompt kuralları

- Referans: Cozy Marble Puzzle Level 35 görseli.
- Kamera: üstten hafif açılı, fiziksel masa oyunu görünümü.
- Malzeme: krem mermer, cilalı pirinç, koyu yeşil kadife, parlak cam.
- Işık: sıcak pencere ışığı, yumuşak temas gölgeleri.
- Asset tek başına üretilecekse arka plan şeffaf olmalı.
- Asset üzerinde yazı, logo veya watermark bulunmamalı.
- UI metinleri görsel içine basılmamalı; HTML/CSS ile eklenmeli.



## Feature açılma planı

| Özellik | Bölüm |
|---|---:|
| Gizli taş | 3 |
| Kil yuva | 6 |
| Kilitli kutu | 8 |
| Buzlu taş | 11 |
| Alçı | 16 |
| Kapak | 19 |
| Renkli cep | 21 |
| Çuval | 23 |

## Kil / kapak / buz görselleri — 18 Ekim 2026

`ART.features` üzerinden bağlanan 13 şeffaf PNG:

- Kil: `clay-liner-3.png`, `clay-liner-4.png`, `clay-funnel.png`, `clay-intro.png`.
- Kapak: `stopper-door-l.png`, `stopper-door-r.png`, `stopper-chip-open.png`, `stopper-chip-shut.png`, `stopper-intro.png`.
- Buz: `ice-cube.png`, `ice-chip.png`, `ice-shards.png`, `ice-intro.png`.

Kaynaklar yerleşik image_gen aracıyla üretildi; boyutlar `FEATURE-WIREFRAMES.md` tablosuna uyar. Sağ kapak sol kanattan aynalanır. Buz sprite'ı dört adet 60×44 hücredir; kırılmada sekiz parça olarak kullanılır. Merkez alfayı korur; bilye rengi buzun içinden görünür. Prompt özetleri ve kaynak eşlemesi `feature-assets.json` içindedir.
