# Puppy Maze — görseller ve animasyonlar

Yeni görseller yerleşik **image_gen** ile üretildi ve proje içine kaydedildi. Tam üretim prompt'ları: [assets/generation-prompts.md](assets/generation-prompts.md).

| Görsel | Dosya | Kullanım |
|---|---|---|
| Sosis köpek parça atlası | `assets/dog/dachshund-rig.png` | 1254×1254, gerçek alfa; kafa, iki kulak ve iki pati |
| Tombul yavru kafa | `assets/dog/puppy-head-square.png` | Hafif karemsi, yuvarlatılmış köşeler, dolgun yanaklar ve kısa burun bölgesi; kulaklar ve yüz ifadeleri ayrı hareket eder |
| Kafayla eşleşen tüy dokusu | `assets/dog/coat-cinnamon.png` | Kafa atlası referans alınarak üretilmiş kesintisiz tarçın-kestane tüy yüzeyi |
| Mavi-mor duvar dokusu | `assets/environment/wall-periwinkle.png` | 1254×1254; bütün bölüm şekillerine uyarlanan yüzey |

`art.js` içindeki normalize kaynak dikdörtgenleri atlası kesmeden örnekler. Kulakların pivotları başın iki yanında; kulakların içte kalan üst uçları bu pivotlara oturur. Yeni yavru yüzünün göz ve ağız yerleşimi `dog.js` içindeki `features` fonksiyonundadır. Gözler, kaşlar, ağız ve dil kodla çizilir; bu özellikler atlasın üzerine gömülü değildir.

Gövde tasmasızdır; mavi boyun şeridi kaldırılmıştır. Kafa atlası referans alınarak üretilen gerçek tüy dokusu gövdeye uygulanır. Katmanlı kenar gölgesi aynı dokuyu koruyarak hacim verir. Baş ölçeği %94, gövde kalınlığı 0,68 hücredir. Pati kökleri gövdenin arkasında kalır; kaymada adımlama hareketi yapar. Kuyruk ince, uca doğru daralan bir şekildir ve ruh haline göre sallanır.

## Animasyonlar

[art-preview.html](art-preview.html) canlı önizlemesinde sekiz panel bulunur:

- Bekleme: nefes, göz kırpma, etrafa bakış ve hafif kulak salınımı.
- Kayma: yöne bakış, geriye yatan kulaklar, adımlayan patiler ve sallanan dil.
- Çarpma: sınırlı, yumuşak kafa esnemesi ve kavisli kapanan gözler; sivri gözler ve sert ezilme yok.
- Şaşırma: açılan gözler ve yukarı kalkan kulaklar.
- Endişe: hafif eğilen kaşlar ve küçük endişeli ağız; iri parlak gözler korunur.
- Sevinme: hafif kafa sekmesi, yavaş kulak salınımı, kavisli gülen gözler ve küçük dil.
- Üzülme: hafif düşen kulaklar, parlak yavru gözleri, tek küçük gözyaşı ve duran kuyruk.
- Dönüş: yol köşelerinde kesintisiz gövde.

## Duvarlar

Üretilen doku yükseltilmiş üst yüzeye uygulanır. Dikey ön yüzler açık maviden koyu mora geçer; üst kenar ışığı, yan yüz ve zemine düşen temas gölgesi yüksekliği belirtir. Tahta her bölüm/boyut değişiminde bir kez önbelleğe çizilir. Görseller yüklenince ana menü ve aktif bölümün önbelleği yenilenir. Ayarlar → Derinlik ile **Derinlikli / Düz** karşılaştırılabilir.

## Ana menü

Demo gerçek bölüm çözümünü izler: bekleme → yumuşak kayma → çarpma → sevinme → yumuşak geri sarma. Faz değişince geçen süre yeniden hesaplanır; yeni hamlenin ilk karesi başlangıç noktasındadır. Pencere boyutu değişirse hamlenin başlangıcı hücre numarasından tekrar hesaplanır. Ekrandan ayrılınca döngü durur, dönünce tek döngü ile başlar.

## Kontroller

```sh
node tools/verify.js
node tools/verify-animation.js
```

İlk kontrol 30 bölümün çözümünü ve zorluk sırasını; ikinci kontrol gerçek ana menü kodunu sanal saatle çalıştırarak sıçramama, kademeli ilerleme, yeniden boyutlandırma, kazanma, geri sarma ve ekran geçişlerini doğrular.

Eski `head.base`, ruh hali kafaları ve gövde tile slotları `dog.js` içinde desteklenir. Atlas yüklenemezse koddan çizilen köpek; duvar görseli yüklenemezse düz renk yüzey kullanılır.

Gövde tüy dokusunun tam üretim promptu: [assets/dog/coat-prompt.md](assets/dog/coat-prompt.md). Yerleşik image_gen kullanıldı.

Tombul kafa yerleşik image_gen ile üretildi; tam prompt: [assets/dog/puppy-prompt.md](assets/dog/puppy-prompt.md). Önizleme üstünde dört büyük, canlı yüz yakın planı bulunur.

Kafa silueti kareli zemine uyum için hafif karemsi hale getirildi. Eski yuvarlak sürüm `puppy-head.png` olarak korunur. Yeni düzenleme promptu: [assets/dog/puppy-square-prompt.md](assets/dog/puppy-square-prompt.md).

Sıfır uzunlukta yalnızca kafa çizilir: ilk açılışta, yeniden başlatmada ve tam geri sarmada gövde, patiler ve kuyruk görünmez. İlk uzamayla birlikte görünürler.

## Sosis köpek arayüzü

Arayüz çizimleri SVG olarak tasarlandı: `assets/ui/dog-icons.svg` (10 ikon), `assets/ui/bone-button.svg` (yeşil kemik OYNA butonu) ve `assets/ui/paw-pattern.svg` (pati zemini). Krem ve karamel düğmeler, kesikli bisküvi kenarları, köpek kulübesi ana menü simgesi ve temalı sonuç/ayar kartları `ui.css` içindedir. Kalan kare sayacı HTML ve güncelleme kodundan kaldırılmıştır.

## Dönüşümlü duvarlar

`art.js` içindeki dört duvar paleti bölüm sırasına göre tekrar eder: Lavanta → Nane → Şeftali → Gökyüzü. Yeni PNG dosyaları `assets/environment/wall-mint.png`, `wall-peach.png`, `wall-sky.png`; yerleşik image_gen ile üretildi. Tam promptlar: [wall-variants-prompts.md](assets/environment/wall-variants-prompts.md). Önizleme sayfasında dört renk yan yana görülebilir. Oyunun görünen adı Puppy Maze; alt araç çubuğunda yalnızca İPUCU ve BAŞTAN bulunur.
