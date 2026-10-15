# Pixhaku leaderboard + profil görselleri

Bu klasördeki görseller leaderboard ve profil ekranlarında kullanılıyor. Henüz üretilmemiş olanları oyun kendisi basit piksel çizimlerle gösteriyor, yani eksik görsel oyunu bozmuyor.

**İş akışı**
1. Görseli ChatGPT'de üret ve aşağıdaki dosya adıyla `assets/leaderboard/src/` içine kaydet. png, jpg ve webp olur, boyut fark etmez.
2. `python3 tools/build_lb_art.py` çalıştır. Script görseli kırpıp küçültür, `assets/leaderboard/<ad>.png` dosyasını yazar ve hepsini `leaderboard_art.js` içine gömer. Fugo export bu dosyayı da tek HTML'e koyar.
3. Şeffaf olması gereken bir görsel düz, tek renk bir arka planla gelirse script o arka planı kendisi siler. Yine de "transparent background" istemek en temizi.

**Tutarlılık için:** önce `avatar-1`'i üret ve beğen. Diğer avatarları üretirken onu referans olarak yükle ("same style as the attached image"). Sandıklar ve madalyalar için de aynısını yap. Her prompt'un sonuna aşağıdaki STYLE bloğunu ekle.

```
STYLE: Authentic, beautifully crafted crisp pixel art in the style of the PIXHAKU app icon: consistent coarse pixel grid, hard square edges, strong dark-brown pixel outlines, all shading made of flat pixel clusters. Warm limited palette: terracotta orange, warm cream, ochre/mustard, olive and leaf green, soft brown. No gradients, no blur, no smooth vector curves, no 3D plastic rendering, no anti-aliased glow. No purple, violet, cyan or turquoise. No text, letters, numbers, watermark or mockup.
```

## Liste

| # | Dosya adı | Ne | Üretim | Oyundaki boyut | Şart mı |
|---|---|---|---|---|---|
| 1–9 | `avatar-1` … `avatar-9` | 9 profil resmi (oyuncu ve botlar) | 1024×1024, opak | 192×192 | **Şart** |
| 10–12 | `medal-1`, `medal-2`, `medal-3` | Altın, gümüş, bronz sıra madalyası | 1024×1024, şeffaf | 96×96 | **Şart** |
| 13–15 | `chest-1`, `chest-2`, `chest-3` | Ödül sandığı, kapalı (1. altın, 2. gümüş, 3. ahşap) | 1024×1024, şeffaf | 256×256 | **Şart** |
| 16–18 | `chest-1-open`, `chest-2-open`, `chest-3-open` | Aynı sandıklar, açık | 1024×1024, şeffaf | 256×256 | **Şart** |
| 19 | `leaderboard-icon` | Ana menüdeki leaderboard butonunun ikonu | 1024×1024, şeffaf | 128×128 | **Şart** |
| 20 | `champion-frame` | Birinciye verilen şampiyon çerçevesi (ortası boş) | 1024×1024, şeffaf | 256×256 | **Şart** |
| 21 | `season-banner` | "New Season" popup'ının üst görseli | 1536×768, şeffaf | 640×320 | İsteğe bağlı |

Toplam 20 şart görsel + 1 isteğe bağlı. Butonlar, sıra satırları, podyum kaideleri, sayaçlar, ışık huzmesi ve konfeti CSS ile çiziliyor, onlar için görsel gerekmiyor. Yıldız ve kalp ikonları oyunun mevcut piksel ikonları.

---

## 1–9 · Avatarlar (`avatar-1` … `avatar-9`)

Kare, dolu arka planlı portreler. Oyunda kare çerçeve içinde 34–96 px arasında görünüyor, o yüzden küçükken de okunur olmalı. Her biri ayrı görsel olarak üretilecek.

Ortak prompt (her avatar için `ANIMAL` ve `BACKGROUND` değişir):

```
Square 1024x1024 profile avatar for a cozy pixel-art puzzle game. One cute, friendly ANIMAL shown head and shoulders, facing the viewer, centered, big expressive dark eyes with a single square white highlight, gentle smile. The head fills about 70% of the frame; ears may touch the top edge. Solid flat BACKGROUND background, one color, no pattern, no frame, no border, full-bleed square with square corners. Must stay clearly recognizable when shown at 40x40 pixels. One avatar only, not a sheet.
```

| Dosya | ANIMAL | BACKGROUND |
|---|---|---|
| `avatar-1` | orange tabby cat with cream muzzle | leaf green (#7fa35a) |
| `avatar-2` | red fox with a white chest | mustard ochre (#d9a441) |
| `avatar-3` | panda | terracotta (#c27a45) |
| `avatar-4` | grey-and-white rabbit with long upright ears | olive green (#8a9b55) |
| `avatar-5` | raccoon with a dark eye mask | warm sand (#e2cf9e) |
| `avatar-6` | small brown owl with big round eyes | brick red (#b66240) |
| `avatar-7` | green frog | soft cream (#f1e2ba) |
| `avatar-8` | brown bear cub | sage green (#a8bd6d) |
| `avatar-9` | shiba inu dog | dusty brown (#b48657) |

## 10–12 · Madalyalar (`medal-1`, `medal-2`, `medal-3`)

Sıra listesinde ve podyumda ilk üç sıranın numarası yerine duruyor. Oyunda 30 px görünüyor, bu yüzden sade ve kalın olmalı. Madalyanın içine sayı **yazdırma**, oyun gerekirse kendi yazar.

```
Single game UI icon, 1024x1024, transparent background. A round pixel-art medal hanging from a short V-shaped ribbon, front view, centered, filling 85% of the canvas. Medal face: METAL with a simple raised star in the middle and a thick dark-brown pixel outline. Ribbon: RIBBON. Chunky, readable at 30x30 pixels. No number on the medal.
```

| Dosya | METAL | RIBBON |
|---|---|---|
| `medal-1` | shiny gold (#e3b04b, highlights #fff0a2) | terracotta red |
| `medal-2` | silver (#b8b3a2, highlights #f6f3ea) | olive green |
| `medal-3` | bronze (#c27a45, highlights #e3a06c) | mustard ochre |

## 13–18 · Ödül sandıkları (`chest-N` ve `chest-N-open`)

Sezon sonunda ilk üçe giren oyuncu açıyor: 1. büyük altın sandık, 2. gümüş sandık, 3. ahşap sandık. Ekranda 170 px büyüklükte ve sallanarak duruyor. Açık hali kapalı halin **aynı açıdan, aynı boyutta** kapağı açılmış versiyonu olmalı. Kapalıyı ürettikten sonra açığı onu referans vererek üret.

Kapalı:
```
Single game reward chest, 1024x1024, transparent background. A closed treasure chest seen from a slight three-quarter front view, centered, filling about 80% of the canvas, sitting flat on an invisible floor. Material: MATERIAL. Domed lid, a big central lock plate, thick dark-brown pixel outline. Feels like a prize worth opening.
```

Açık (kapalı sandığı referans olarak yükle):
```
The same treasure chest as the attached image, same angle, same size, same position on the canvas, transparent background, but now OPEN: the lid tilted back and up, warm golden light and a few square pixel sparkles bursting out of the inside. The inside is empty (no coins, no items).
```

| Dosya | MATERIAL |
|---|---|
| `chest-1` / `chest-1-open` | the largest and richest chest: gold-plated with ornate gold bands, small red gem on the lock |
| `chest-2` / `chest-2-open` | medium chest: polished silver-grey metal bands on light wood |
| `chest-3` / `chest-3-open` | small simple chest: warm brown wood planks with plain iron bands |

## 19 · Leaderboard ikonu (`leaderboard-icon`)

Ana menüde Levels butonunun yanındaki leaderboard butonunun ikonu. 32 px görünüyor, siluet çok net olmalı.

```
Single game UI icon, 1024x1024, transparent background. A golden pixel-art trophy cup with two handles standing on a small three-step podium (gold center step, silver left, bronze right), front view, centered, filling 85% of the canvas. Very bold silhouette, thick dark-brown outline, readable at 32x32 pixels.
```

## 20 · Şampiyon çerçevesi (`champion-frame`)

Sezonu birinci bitiren oyuncunun avatarının etrafına giriyor (botlarda da var). Görselin tamamı avatarın %144'ü kadar büyüklükte çiziliyor, avatar tam ortaya oturuyor. Bu yüzden **ortadaki kare boşluk görselin yaklaşık ortadaki %70'i** olmalı ve tamamen şeffaf kalmalı.

```
Square avatar frame for a game profile picture, 1024x1024, transparent background AND a fully transparent square hole in the center (the hole is about 70% of the image width, perfectly centered, sharp square edges). The frame itself is a thick golden pixel-art border with a small golden crown on the top edge and green laurel leaves wrapping the lower left and right sides. Thick dark-brown outline. Nothing inside the hole.
```

## 21 · Sezon banner'ı (`season-banner`) · isteğe bağlı

"New Season" popup'ının üstünde duruyor. Yoksa oyun yerine leaderboard ikonunu büyük gösteriyor.

```
Wide 2:1 game illustration, 1536x768, transparent background. A celebratory pixel-art scene: a golden trophy on a three-step podium in the center, a terracotta ribbon banner draped behind it (the banner is blank, no text), small square golden sparkles and a few pixel confetti pieces around. Centered composition with empty transparent space around the edges.
```
