# Jöli ve tehlike animasyonları

Yeni bitmap görseller yerleşik `image_gen` aracıyla üretildi. Üretim promptları [prompts.json](prompts.json) dosyasında; kaynak PNG'ler `source/` içinde korunuyor. Oyun 1536×1024 boyutundaki, kalite 90 WebP sürümlerini kullanır.

- [jellies.webp](jellies.webp): nane, bal ve çilek renkleri. Üst sıra yüzsüz gövdeler, alt sıra harita portreleri. Mor, indigo ve su jölisi mevcut tema atlaslarından gelir.
- [effects.webp](effects.webp): üst sıra su sıçraması, mor jöle parçaları, zehir bulutu; alt sıra alev, buhar, bal sıçraması. Siyah zemin oyun yüzeyine `screen` ile karıştırılır.
- [toxic-atlas.webp](../themes/toxic-atlas.webp): yeni Zehirli Sera zemini, duvarı ve zehirli taş dokusu. Kaynak `../themes/source/toxic-atlas.png`.

`motion.js` bu görselleri zaman tabanlı gövde deformasyonu, damlalar, parçacıklar ve duvar hareketleriyle birleştirir. Animasyonlar hazır video değildir; oyun içindeki konuma, şekle, renge ve çarpışma yönüne uyarlanır.

| Malzeme | Şekil değişimi | Süre |
| --- | --- | --- |
| Su | Akışkan toparlanma, yüzey halkaları ve damlalar | 0,20 sn |
| Esnek jöle | Kesintisiz esneme ve hızlı toparlanma | 0,17 sn |
| Nane jeli | Yumuşak salınım ve yükselen kabarcıklar | 0,21 sn |
| Bal | Yumuşak yayılma ve uzun damlalar | 0,24 sn |

| Tehlike | Duvar hareketi | Temas animasyonu |
| --- | --- | --- |
| Alev | Taşa bağlı titreyen alevler ve közler | Su buharlaşır; jöleler erir, koyulaşır ve söner |
| Diken | Gömülü uçlarda dolaşan ışık | Su damlalara, jöle renkli parçalara ayrılır; bal ağır saçılır |
| Zehir | Kabarcıklar ve hafif sis | Titreme, yeşil renklenme, kabarcıklar ve çökme |
| Kristal | Mor ışık darbeleri | Kısa donma/parlama, ardından kristal parçaları |

Altı renk ile dört tehlikenin 24 birleşimi desteklenir. Levelın `theme` ve `jelly` alanları sabittir. Şekil değişimi kontrolleri kilitlemez. Yeni hamle hemen başlar; mevcut görünüş 120 ms içinde hareketli gövdeye yumuşakça aktarılır. Kayma sırasında alınan hamle ise ilk duvar temasında başlar. Şekil eğrileri tek yönlüdür; duraklama ve ters salınım içermez. Ölümde gözler gövdeden bağımsız kalır, tehlikeye göre sıçrar/yüzer, etrafa bakar ve son anda göz kırpar. Fail klibi tamamlanınca aynı level ve jöliyle tekrar başlanır. Çarpışma kuralları ve çözümler `engine.js` tarafından belirlenmeye devam eder.

[Animasyon koleksiyonu](../../animation-preview.html): duvar seçimi, toplu veya tekli şekil/fail oynatma, duraklatma ve belirli bir anı inceleme kontrolleri.

Kontroller: `node tools/verify.js`, `node tools/verify-themes.js`, `node tools/verify-themes.js --missing-assets`. Son iki kontrol 19 levelın 246 çözüm hamlesini, 24 fail klibinin ara karelerini, otomatik yeniden başlamayı ve şekil geçişi sırasında anında başlayan hamlenin konum sürekliliğini çalıştırır.

Duvarlar ve ortam animasyonu artık `board.js` içindeki ortak kontur sistemini kullanır; koleksiyon sayfası da oyundaki aynı duvarları gösterir.
