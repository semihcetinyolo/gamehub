# Jelly Escape

GDD: [docs/GDD.pdf](docs/GDD.pdf). Bu klasörün amacı sadece oynanabilir bir HTML oyun ve 33 seviye.

- `index.html` — oyun (swipe / ok tuşları; `r` baştan, `h` ipucu — geri al yok). `index.html#7` doğrudan 7. seviyeyi açar.
- `engine.js` — saf oyun mantığı: kayma, şekil kuralı, BFS çözücü (par + ipucu buradan).
- `levels.js` — 33 seviye, ASCII grid (lejant engine.js başında).
- `bg_variants.html` — dama zemin varyantları (16 renk ailesi × çok yakın / orta / yüksek kontrast + iki farklı renk). Paletler `bg_palettes.js`'te üretilir; oyun `index.html?bg=<id>` ile o zeminle açılır (normal oyunda her levelın kendi teması kullanılır; `?bg=` yalnızca zemin önizlemesini değiştirir).
- **Gofret:** ilk çarpmada çatlar, ikinci çarpmada kırılır; kırıldığı an Jöli orada durur ve normal bir çarpma gibi şekil değiştirir (boşluktan kayarak geçmez — geçmek için yeniden kaydırmak gerekir).
- **Kural — sürpriz ölüm yok:** hiçbir levelda, kayması güvenli olup sadece yeni şekli dikene/kapalı kapıya değdiği için ölünen bir hamle olamaz. `tools/verify.js` tüm erişilebilir durumları gezip bunu kontrol eder; `tools/gen.js` bu tür levelları hiç üretmez (yeni şeklin değebileceği diken şeridini düz duvara çevirir — geometri aynı, çözüm aynı).
- `tools/defuse.js` — mevcut levellara aynı kuralı uygular (sadece grid'leri değiştirir). `tools/levelfile.js` — levels.js'te sadece grid satırlarını yerinde yeniden yazar (theme/jelly/feature alanlarına dokunmaz).
- `tools/respike.js` — mevcut seviyelerde dikenleri yeniden yerleştirir (çözümün değmediği duvarların önüne 1 karelik şerit); `tools/spikes.js` ortak yerleştirme kodu.
- `tools/verify.js` — `node tools/verify.js [--gems]`: her seviye çözülebilir mi, par, mücevher par'ı, hamle hakkı ve zorluk eğrisi kuralı (ZOR bölümden sonraki iki bölüm daha kolay olmalı).
- `tools/limits.js` — hamle haklarını, ZOR işaretlerini ve zorluk puanlarını hesaplar (`--write` levels.js'e yazar). `tools/curve-plan.js` — mevcut levelları zorluk eğrisine en iyi oturacak sıraya dizer (`--write` levels.js'i yeniden sıralar). Ayrıntı: aşağıda "Zorluk eğrisi ve hamle hakkı".
- `tools/gen.js` — zindan tarzı taslak üretici: `--rooms N` büyük oda üst üste, 4/2/1 karelik koridorlar (`--doors 4,2,1`), yan cepler (`--pockets`), çözümün değmediği duvar yüzleri boyunca diken şeritleri (`--spikep .6`); çok odalı levellar buradan seçildi, 1–6 el yapımı.

Kural (Dungeon Slime gibi, grid yok): Jöli sürekli uzayda serbest bir dikdörtgen, orijinal oyundaki gibi 3 sabit formu var (ölçüler arka plan karesi cinsinden): **kare 4×4** (başlangıç) → **ince 2×6** → **en ince 1×8** (yatayda: basık 6×2 → en basık 8×1). En ince hâlin kısa kenarı tam 1 kare. Jöli karelere oturmaz; arka plan sadece dekor.
Formlar tek bir zincir: **8×1 ↔ 6×2 ↔ 4×4 ↔ 2×6 ↔ 1×8**. Swipe'ta bir şeye değene kadar kayar; minicik bir kayma bile olsa her gerçek çarpışta, olduğu yere ortalı ve çarptığı yüzeye yaslı olarak zincirde **bir adım** ilerler: yan duvar → inceye doğru, alt/üst duvar → basığa doğru (ör. 6×2 yan duvara çarpınca tekrar 4×4 olur). Yeni form duvara taşarsa yüzey boyunca en yakın boş yere kayar; hiç yer yoksa form değişmez. Zaten dokunduğun duvara swipe hiçbir şey yapmaz.
Geçitler: 4 kare → kare geçer, 2 kare → ince gerekir, 1 kare → en ince gerekir (tam oturur; duvara yaslanıp hizalanmak gerekir).
`#` güvenli, `*` tehlikeli katı duvardır. İkisi aynı oda konturunu ve duvar kalınlığını kullanır; arkadaki dolgu hücreleri ikinci bir sıra olarak çizilmez. Jöli tehlikeli yüzeye veya köşesine dokunursa fail. Zeminde tek kare düzeni vardır; atlasın taş çizgileri zemine tekrar bindirilmez.
Her yeni özellik önce kolay bir seviyeyle tanıtılır: dikenler 5 (el yapımı, par 2) → 6 (el yapımı, par 5); sonra zorluk eğrisinin kolay slotlarında gofret 10, anahtar 11, yıldızlı taş 15 → 16, yıldızlı düğme / açılan geçit 20 → 25. Sıra Puppy Maze'deki gibi beşli döngülerle ilerler (aşağıda "Zorluk eğrisi ve hamle hakkı").
Seviyeler Dungeon Slime gibi çok kareden oluşan zindan haritaları (22–32 × 30–66 kare, 1 kare kalın duvarlar, oda içinde küçük duvar parçaları). Çok odalı levellar alttan üste dizilmiş 2–4 odadan oluşur, odalar 4, 2 ve 1 karelik koridorlarla bağlı, bazı odalarda yan cepler var; kapıdan geçmek seviyeyi bitirmez, sadece son çıkış (E) bitirir. Kamera 26 kareye kadar geniş haritaları tam genişlikte, daha genişleri 26 karelik pencereyle gösterir ve Jöli'yi yatay + dikey takip eder; ekrana sığan küçük haritalar tamamen gösterilir. Anahtar ve mücevher 2×2 karelik tek büyük ikon olarak çizilir. Bal ve marshmallow yüzey mekaniği şimdilik oyundan çıkarıldı; bal renkli jöli görsel bir malzeme çeşididir.
Her levelın `levels.js` içinde sabit bir `theme` ve `jelly` seçimi var. Dört dünya: Kristal Bahçe, Aytaşı Zindanı, Kor Kalesi ve Zehirli Sera (9, 14, 21, 25, 26, 32). Yedi element jölisi: sarı şimşek, mavi-beyaz buz, su mavisi, yeşil doğa, turuncu ateş, beyaz rüzgâr ve sedefli mor boşluk. Tema ve jöli odalar arasında, hareket sırasında veya yeniden denemede değişmez. Tehlikeli yüzeyler ortak taş gövdenin temas kenarında ayrı ve net bir şerit kullanır.

`motion.js` yedi element için ayrı şekil değiştirme, boşta hareket ve temas efektleri sağlar. Alevde erime/buharlaşma, dikende renkli parçalanma/sıçrama, zehirde kabarcıklarla çökme ve kristalde donup parçalanma oynatılır. Şekil geçişleri 160–210 ms süren kesintisiz eğrilerdir; yeni hamle bunların bitmesini beklemeden başlar ve mevcut görsel şekli akıcı biçimde devralır. Gözler ölümden sonra kısa süre kalır, sıçrar ve etrafa bakar. Fail animasyonu tamamlanınca aynı karakterle tekrar başlanır. Hareket hızı 30 kare/sn; çarpışma geometrisi değişmez.

`board.js` tek duvar konturunu, duvar malzemelerini ve ortam hareketini; `themes.js` tema ayarlarını; `ui.css` arayüzü yönetir. Üretilen görseller ve promptlar: [tema atlasları](assets/themes/README.md), [karakter ve efektler](assets/animation/README.md). [Jöli koleksiyonu](animation-preview.html) yedi elementi ve on tehlikeyi yan yana oynatır; animasyonu durdurup istediğin anını seçebilirsin.

Jöli'nin yüzü animasyonlu: göz kırpar, etrafa bakar, kayarken yöne bakar, çarpınca gözlerini sıkar, en ince hâle geçince şaşırır, dikene yakınken endişelenir/terler, kazanınca sevinir.
Yıldız: ★ hamle hakkı içinde çıkış, ★★ par + payın yarısı, ★★★ par (mücevherli bölümde mücevher de gerekir). Ayrıntı: aşağıda "Zorluk eğrisi ve hamle hakkı".

Tema, karakter ve 28 temel fail animasyonu kontrolü: `node tools/verify-themes.js` (33 level, 381 çözüm hamlesi, yeniden başlatma, geçiş yarışı ve ölüm sonrası geçiş). Asset yükleme hatası kontrolü: `node tools/verify-themes.js --missing-assets`.

Sunum kontrolleri: `node tools/verify-presentation.js` — 33 levelda 5340 duvar yüzü ve 30/60/120 kare/sn hızlarında 56 kesintisiz şekil geçişi.

Yıldızlı taş ve düğme:

- `o`: 2×2 yıldızlı taş. Jöli çarptığında aynı yönde kayar; duvar, gofret, tehlike, başka taş veya çıkış sınırında durur. Taşlar birbirini zincirleme itmez. Jöli çarpıştığı yerde şekil değiştirir; zaten temas ettiği taşı da fırlatabilir.
- `b`: en az 2×2 yıldızlı düğme. Hizasından geçen taşı üzerinde durdurup etkinleşir; jöli tek başına düğmeyi etkinleştirmez. Düğme yalnızca taş üstünde dururken basılı kalır; taş ayrıldığı anda serbest kalır.
- `!`: bağlı düğmeye basılana kadar tehlikeli geçit. Tüm yüz ve köşe temasları ölümcüldür. Düğmeye basılınca tehlikenin üstüne metal güvenlik kapakları kapanır. Yuvası ve yeşil durum ışıkları görünür kalır; üstünden güvenle geçilir. Taş düğmeden ayrılınca kapaklar açılır ve tehlike geri döner. Başlangıç durumuna dönmek tüm taşları, düğmeleri ve geçitleri sıfırlar.
- Her işaretin dört yönde bağlı dikdörtgen kümesi tek nesne oluşturur. Varsayılan bağlantı, okuma sırasındaki geçidi aynı sıradaki düğmeye (son düğmeden fazla geçit varsa sonuncuya) bağlar. `gateButtons: [0, 0, 1]` gibi bir listeyle iki geçit aynı düğmeye bağlanabilir.

`features.js` kabartmalı yıldız taşını, düğmeyi ve temaya uygun lav / zehir / kristal / diken geçitlerini çizer. Mevcut zemin üzerine çizilir; ikinci bir karo düzeni eklemez. Taş çarpışma anında harekete başlar, en geç 340 ms içinde yerine ulaşır. Düğme ışığı, kısa açılma efekti ve ses tam taşın varışında başlar. Hareket sırasında verilen bir sonraki hamle varış anında işlenir; şekil değişimi kontrolü kilitlemez.

`node tools/verify-stones.js`: dört yönde fırlatma, engeller, düğmeye hizalanma, geçit teması, taş ayrıldığında yeniden kapanma, ortak düğme bağlantıları ve dört bölümün mekanikleri kullanmadan çözülememesi. `verify-themes.js` ayrıca 30/60/120 kare/sn'de taş/düğme eşzamanlamasını, sıradaki hamlenin gecikmeden başlamasını ve hareket sırasında baştan/haritaya dönüşü denetler.

Duvar gövdesi ve taş derzleri güvenli/tehlikeli sınırında değişmez. Tehlike yalnızca katı duvarın temas kenarında çizilir; güvenli komşulara renk harmanlanmaz.

Yuvarlak, gömme düğme görseli: `assets/mechanisms/pressure-plate.svg` (basılı / serbest iki kare). Taşın köşeli gri siluetinden ayrı bir bronz çerçeve ve mercan renkli basma yüzeyi kullanır. Basılıyken yeşil durum ışıkları taşın etrafından görünür. 20. bölüm (Yıldızlı Düğme) taşı yukarıdaki düğmede bırakıp alttaki geçitten ilerlemeyi öğretir.

Çıkış kuralı: jölinin çıkışa dik genişliğinin tamamı portal açıklığına sığmalı ve hizalı olmalı. Kısmi temas veya duvara çarpıp şekil değiştirme tek başına başarı getirmez. `node tools/verify-exits.js` dört yöndeki genişlik/hiza kontrollerini ve 20. bölümdeki (Yıldızlı Düğme) 6×2 jöli hatasını denetler; bu bölümün yeni hedefi 5 hamledir.

Zehirli temada taş gövde nötr gri, tehlike kanalı koyu yeşil ve zehir tabakası parlak sarı-yeşildir. Duvar yüzeyleri hücre içinde kendilerine ait alana kırpılır; köşelerde ve ince duvarlarda üst üste boyama veya ikinci bir duvar oluğu oluşmaz.

## Zorluk eğrisi ve hamle hakkı

Her bölümün bir hamle hakkı (`levels.js` → `moves`) var. Sayaç kalan hamleyi gösterir; son 3 hamlede sarı yanıp söner. Hak bitince **Hamlen bitti!** kartı açılır ve bölüm tekrar oynanır. Son 6 hamlede çıkışa artık yetişilemiyorsa sayaç kırmızıya döner ve uyarı çıkar; ipucu da hakkın yetmediğini söyler. Duvara çarpmayan (hiç hareket etmeyen) kaydırmalar hamle saymaz. Yıldızlar: ★★★ en iyi yol (par), ★★ par + payın yarısı, ★ hamle hakkı içinde.

**Eğri (Puppy Maze ile aynı düzen):** 1–6 öğretici (1–4 formlar, 5–6 dikenler), sonra beşli döngüler: **normal, normal+, ZOR, kolay, kolay**. Her ZOR bölümden hemen sonra iki kolay bölüm gelir; normal bölümün zorluğu 7. bölümden sona doğru yavaşça artar. ZOR bölümler: 9, 14, 19, 24, 29 (seviye seçiminde ✦ ile işaretli). Yeni mekanikler kolay slotlarda tanıtılır. `verify.js`, ZOR bölümden sonraki iki bölümün daha kolay olmasını ve ZOR işaretlerinin doğru slotlarda olmasını zorunlu tutar.

Hesap `node tools/limits.js` ile yapılır (`--write` hamle haklarını ve ZOR işaretlerini `levels.js`'e yazar; level değişince tekrar çalıştır):

1. Bölümün erişilebilir tüm durumları (konum, form, gofret, anahtar, taş/düğme) ve her durumdan çıkışa kalan en az hamle hesaplanır.
2. Oyuncu modeli: her hamlede en iyi hamle ağırlık 1, boşa hamle veya çıkmaz ağırlık r, görünen tehlikeye kaymak r × 0,2 (insanlar gördükleri dikene nadiren kayar). r, tipik bir anda (1 doğru, 2 yanlış seçenek) doğruyu bulma olasılığı q olacak şekilde seçilir; referans oyuncu q = 0,9 (10 hamlede 1 hata).
3. P(L): bu oyuncunun L hamlede ilk denemede çıkma olasılığı, dinamik programlamayla tam olarak hesaplanır. P(∞): hamle sınırı olmadan bölümün kendi zorluğu.
4. **Zorluk puanı** (Puppy Maze'deki formülün aynısı): D = −log2 P(hamle hakkı) + 0,06 × par. Yani ilk denemede geçmenin ne kadar zor olduğu, artı en iyi yoldaki her hamle için küçük bir pay.
5. Slot hedefleri: normal = taban (0,85 → 1,25), normal+ = taban + 0,22, ZOR = taban + 1,0, kolay = taban − 0,4 ve taban − 0,3.
6. Hamle hakkı iki sınır arasında kalır: alt sınır par + bir tipik hata (bölümün ortanca hata maliyeti), yani tek bir sıradan hata her zaman affedilir; üst sınır bölümün kendi şansının %95'ini koruyan en küçük hak (en fazla par + max(6, par/2)). Kolay bölümler üst sınırı (cömert hak) alır; diğerleri zorluğu slot hedefini aşmayan en küçük hakkı alır. Hedeften 0,15'ten fazla sapan bölüm "slotundan zor/kolay" diye işaretlenir.
7. Onboarding (1–6) kendi kuralını korur: öğreticilerde %97, diken tanıtımlarında %88 ilk deneme başarısı; ayrıca pay bilerek yüksek başlar ve her bölümde azalır: en az +8, +7, +6, +5, +4, +3 ek hamle.

Sıralama `node tools/curve-plan.js` ile bulundu: onboarding yerinde kalır, diğer bölümler her birinin zorluğu slot hedefine en yakın olacak şekilde yerleştirilir. Kurallar: her mekaniğin ilk bölümü (tanıtımı) o mekaniği kullanan diğer bölümlerden önce ve kolay bir slotta gelir, tanıtımlar sırasını korur (gofret, anahtar, taş, düğme), taş/düğme bölümleri kendi sıralarını korur, son bölüm son kalır, bölümler gerektiğinden fazla yer değiştirmez. Yeni level eklenince `node tools/curve-plan.js --write` ve ardından `node tools/limits.js --write` çalıştır.

## Malzeme koleksiyonu

On malzeme bölümü zorluk eğrisine göre oyunun geneline dağılır: 12, 17, 22, 23, 26, 27, 30, 31, 32 ve 33 (Son Dişli yine son bölüm). 10 ayrı duvar ve 10 ayrı tehlike dokusu `assets/materials/` altında; anahtar, portal ve gofret `assets/props/` altında. Built-in ImageGen ile her asset ayrı üretildi. Orijinal PNGler `assets/materials/source/`, üretim promptları `assets/materials/prompts.json`; oyun 640px WebP sürümlerini yükler. `asset-gallery.html` gerçek duvar çizimi ve yeni bölümlerin bağlantılarını gösterir.

`materials.js` bir duvar–tehlike çiftini bölümün `material` alanına bağlar. Eski bölümler dünya başına sabit bir varsayılan kullanır. `themes.js` doku tekrarı ve dokuz dilimli çizimi, `props.js` nesne başına tek anahtar/çıkış/gofret çizimini yönetir. Portal çerçevesi ve gofret kenarları nine-slice ile korunur; gofretin çatlak ve kırıntı durumları devam eder. Duvar dokusu dünya koordinatlarında düşük yoğunlukta uygulanır; ölümcül temas kenarı ayrı, kesin bir şerittir. Oda ve yeniden başlatma sırasında malzeme değişmez.

`node tools/verify-materials.js`: 20 benzersiz doku, 3 eşya, her çifti kullanan 10 farklı çözülebilir harita, tüm yeni erişilebilir durumlarda sürpriz ölüm kontrolü ve nine-slice sınırları. Yeni çözümler: `docs/material-level-solutions.json`.

Doğrulama notu: 33 bölümün tamamı çözülebiliyor. Genel `verify.js` taraması, görsel değişikliklerden bağımsız 20. bölümde (Yıldızlı Düğme) 28, 25. bölümde (Geçidi Aç) 7 kapalı-geçit şekil değişimi ölüm durumu bildiriyor; bu iki eski mekanik uyarısı nedeniyle genel tarama sıfır koduyla bitmiyor. Malzeme bölümlerinde böyle bir durum yok. Çıkış genişliği, taş/düğme, sunum ve tüm bölüm yaşam döngüsü testleri geçiyor.

## Elementler, çıkış işareti ve duvar parçaları

Yedi jöli `elements.js` ile Şimşek (sarı), Buz (mavi-beyaz), Su (mavi), Doğa (yeşil), Ateş (turuncu-kırmızı), Rüzgâr (beyaz) ve Boşluk (sedefli mor) elementlerine bağlı. Şimşek çıkıntıları, alev tepesi, buz yüzeyleri, bulut kıvrımları ve yıldızlı boşluk ayrı gövde görselleridir; gözler oyun tarafından hareketli çizilir. Üst bilgi çubuğunda element ve tehlike adı görünür. Eski `jelly` kimlikleri ve kayıtlı ilerleme korunur.

On tehlike kendi kimliğiyle ölüm animasyonuna aktarılır; buz/elektrik/boşluk/asit artık yalnızca eski dört türden birinin adıyla çalışmaz. 7×10 tepkime matrisi buhar, erime, kül, kısa devre, aşınma, sarmaşık lifleri, kıvılcım ve girdap hareketlerini seçer. Elementler sunumu değiştirir; tehlikeli temas yine ölümcüldür. Kristal: yerinde büyüyen kabuk, rezonans/çatlak ve dikey çöküş. Diken: anında delinme, temastan uzağa sıçrayan element parçaları. Gözler kristalde bekler, elektrikle titrer, boşlukta merkeze çekilir; diğer tepkimelerde düşer veya buharla yükselir.

`animation-preview.html` 70 eşleşmeyi yedi karakter üzerinde yan yana gösterir; duraklatma ve zaman sürgüsü aynı oyun çizimini kullanır. `node tools/verify-elements.js` tüm eşleşmelerin sekiz anını, altı farklı duvar parçasını, 1214 köşeyi ve farklı ölçeklerde çıkışın dik oranını denetler.

`Board.build()` artık `parts` ve `corners` üretir: dış duvar, iç duvar, iç köşe, dış köşe, uç kapak ve sütun. Normal/tehlikeli malzemeler aynı topolojiyi kullanır. Tüm parçalar tek duvar kabuğunun parçasıdır; pahlar sadece kabuğun sınırına çizilir. Doku dünya koordinatlarında kesintisiz devam eder, dönen yüzlerde yeniden başlamaz.

Çıkış, turkuaz-krem damalı bir bitiş eşiği ve yanında küçük bir kumaş bayrakla gösterilir. Eşik gerçek açıklığın tamamını kaplar; oklar çıkış yönünü gösterir. Bayrak açıklığı örtmez, hafifçe dalgalanır ve telefon ölçeğinde en az 26px genişlikte kalır. Anahtar gereken bölümlerde eşik kehribar rengindedir ve bayrakta kilit vardır; anahtar alınınca turkuaz damalı görünüme geçer. Parlak portal ve yazı etiketi kullanılmaz. Mevcut tam-sığma ve anahtar kuralları aynıdır.

Yeni element gövdeleri built-in ImageGen ile üretildi: `assets/characters/` (640px WebP; buz PNG), orijinaller `assets/characters/source/`, tam promptlar `assets/characters/prompts.json`, toplu görsel `assets/characters/contact-sheet.jpg`. Esneme çizimi şeffaf siluetleri korur; gecikme eklemez. Boşluk jölisi 30. bölümde oynanır ve tehlikeye göre parçaları merkeze çeken, gözleri döndürerek içine alan özel temas animasyonu kullanır.

## Jelly Escape arayüzü

Finding Animals projesinin Home/Gameplay prefabları ve butonları referans alındı. `assets/ui/sources.json` yeniden kullanılan yeşil buton, ampul, ev, ayar ve yıldız görsellerinin kaynaklarını listeler. Yeni ana menü, ayrı bölüm seçimi, yeşil Play, ses ayarı ve dokunmaya uygun İpucu/Baştan butonları içerir. Oyun ekranında yalnızca bölüm, hamle sayacı ve kontroller görünür. Önceki `jellysquish.v1` ilerlemesi okunur; yeni kayıtlar `jellyescape.v1` içine yazılır.

Void gövdesi `assets/characters/void-pearl.png` ile sedefli mora yenilendi. Koleksiyon beş gerçek formu (4×4, 6×2, 8×1, 2×6, 1×8) gösterir.

## Birleşik duvar sistemi

`board.js` içindeki `build()` oynanabilir alanın etrafında bir kare kalınlığında `skinCells` kabuğu üretir; çapraz köşe hücrelerini ve kapalı sütunların içini de doldurur. `skinEdges` sadece bu kabuğun dış sınırıdır. Gövde, düşük yoğunluklu doku, ortak taş derzleri ve sabit ışıklı pahlar bir kez çizilir. İç duvar, L/T birleşimi ve tek hücrelik sütun için ayrı doku veya kalınlık hilesi kullanılmaz.

`STYLE` ortak ölçüleri yönetir: üst/sol pah 0,10 kare, ön yüz 0,34 kare, sağ yüz 0,23 kare, tehlike gövdesi 0,58 kare, kanal 0,44 kare, temas çizgisi 0,035 kare. `HAZARDS` on tehlikenin paletidir; diken, kristal, buz, lav, zehir, elektrik, boşluk, sarmaşık, tuzlu su ve testere şekilleri aynı ölçekle çizilir. Tehlike yönü açık yüzün normalinden gelir; tüm şekiller duvar hücresine kırpılır. Mevcut raster tehlike dokuları arşivde kalır, temas işaretleri bunlara bağımlı değildir. Yeni görsel üretimi gerekmedi.

`asset-gallery.html` on temayı aynı L/T, köşe, sütun ve güvenli/tehlikeli geçiş düzeninde canlı gösterir. `node tools/verify-walls.js` 33 bölüm + 5 geometri örneğinde duvar kabuğunu, zemine taşmamasını, ortak kalınlığı ve üç ölçekte dokusuz çizimi denetler.

### Form ve renk sürekliliği

Arayüzün ana paleti turkuaz, açık krem ve sıcak sarı; Play yeşil kalır. İnce jöleler artık düz renk gövdelere dönüşmez: yedi elementin aynı kare görsellerinden üretilmiş 14 dikey/yatay gövdesi `assets/characters/forms/` içindedir. Kare çizimler korunur; ara oranlarda resimler yumuşakça harmanlanır. İnce dokuların dalgalanması kısa kenarla ölçülür ve çarpışma sınırları içinde kalır. Alev, kabarcık, elektrik, buz, rüzgâr ve yıldız hareketleri her formda sürer. Görsel yüklenemezse kare çizim kullanılmaya devam eder.

Form görselleri built-in ImageGen ile üretildi. Tam promptlar ve kaynak eşleştirmeleri `assets/characters/forms/prompts.json`, orijinaller `source/` altındadır. Oyun için şeffaf kenar boşlukları temizlenmiş, en uzun kenarı 768px olan PNG sürümleri kullanılır. `node tools/verify-elements.js` tüm 35 element/form eşleşmesinde görsel seçimini, hareketi, sınırları ve geçiş sürekliliğini denetler.

Duvar derinliği: üst-sol ışığına göre aydınlık bir üst yüzey ve koyu ön/sağ yan yüzler çizilir. `depthFaces` köşeleri yüz derinliğine göre paylaştırır; ince duvar ve sütunlarda yüzeyler üst üste binmez. Katı çizim duvarın mevcut hücrelerinde kalır, yalnızca yumuşak gölge zemine sağa/aşağı düşer. Tehlike kanalları gömme kenar gölgesi ve aynı statik/hareketli renk geçişini kullanır. Bu katmanlar duvar önbelleğine bir kez çizilir; çarpışma ve geçit genişlikleri değişmez.

Tehlikeli duvar derinliği: ortak yükseltilmiş çerçevenin arka dudağı aydınlık, ön yüzü koyu ve iç kanalı gölgelidir. Diken/kristal/buz yüzleri ayrı parlak ve koyu düzlemlerle, lav/zehir/tuzlu su kalın sıvı kenarıyla, elektrik kutupları ve testereler gölgeli metal yüzeylerle çizilir. Boşluk yuvaları gömme halkalar kullanır. Parça gölgeleri duvar yönünden bağımsız olarak dünya koordinatlarında sağa/aşağı düşer. `drawHazardFace()` statik ve hareketli çizimde aynı gövdeyi kullanır; yüzeyler mevcut hücre sınırına kırpılır.
