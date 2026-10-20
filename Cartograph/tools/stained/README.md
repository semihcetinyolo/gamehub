# Vitray bölümleri

Oyuna hazır 276 bölüm `../../stained-levels.js` dosyasındadır. `build_levels.js`
içindeki `ORDER` kaynak sırasıdır; oynanış sırası aşağıdaki karıştırma ve zor
bölüm yerleştirme adımıyla oluşturulur.

## Güncel geometri ve vitray politikası (20 Ekim 2026)

### Figür sınırlarını koruma ve başlangıç renkleri

Tamamlandı: **276/276 denetim**, **154 geometri**, **156 vitray / 5760 eşleşen parça**. Sıra, 27 zor konum, 25 büyük sahne ve kedi öğreticisi korundu. [Yeni önce/sonra görünümü](../../output/silhouette-rollout/index.html); son rapor `output/silhouette-rollout/final-report.json`.

Yeni çalışma `output/silhouette-rollout/` altında ayrı bir snapshot ile tutulur.
57 (`iris`) yaprakları, eski snapshot'ta da çentikli olduğu için doğrudan
özgün kaynak eğrilerinden yeniden kurulmuştur. Temizlenmiş eski çokgeni yeniden
bükmek kayıp eğriyi geri getirmez.

- Anlamlı figür sınırları, kapalı gözler ve daireler değişmez kısıttır.
  Önce arka plan bölücüsü kaydırılır/kaldırılır. Gerçek figür çakışmasında
  bütün parça orantılı taşınır/büyütülür; yerel çentik açılmaz.
- `contact_policy.finish_builder` artık eski kısa-kenar daraltma ve boşluk
  bükme geçişlerini çağırmaz. Kilitli şekilleri koruyarak çözemediği kaynağı
  hata ile durdurur. Tuvali büyütmek kısa kenarı rahatlatabilir; nokta
  temasını kendi başına ayırmaz.
- `silhouette_authored.py`, kaynak parçalarını ve düzgün eğrileri yeniden
  kurar. `silhouette_incremental.py`, doğru T birleşimlerini koruyarak
  kaynak yaylarını tek tek geri getirir. Uygun mevcut ayrımlar korunur;
  geri getirildiğinde yeniden belirsizlik yaratacak kesişimler zorlanmaz.
- `focal_regions.py` / `starting_clues.focalClues` hazır renkleri arka plana
  önceliklendirir. Ana kalp boş başlar. Mantıksal zorunluluk bulunan küçük
  göz vb. alanlar hazır kalabilir. Kedi öğreticisi korunur.
- `clueFocus` geometri özeti, çözüm özeti ve hazırlanmış ipuçlarını bağlar.
  `build_levels.js` artık ipuçlarını körlemesine yeniden üretmez.
- Sıra: son geometri → `silhouette_clues.js` → odak ağırlıkları →
  `silhouette_focus.js` → `silhouette_art.py` → tam geometri denetimi →
  `publish_silhouette.py` → katalog derlemesi → `verify_silhouette.js`.
  Bunlar bu snapshot'a bağlı araçlardır; yeni çalışmada yeni snapshot alınır.
- Cam aktarımı mevcut dört gerçek dokuyu kullanır. En uzun raster kenarı
  2304 px ile sınırlıdır; maske, çizgi ve kılavuz aynı ölçeği kullanır.
  Yeni dosyalar `*-silhouette.webp/.json`; eski kaynaklar korunur.

### Kesişim okunurluğu — bütün katalog

Kullanıcının sekiz bölümlük deneme sonrası onayıyla kalan katalog da aynı
kuralla düzenlendi. `output/junction-rollout/` deneme sonrasındaki yeni
snapshot'ı, aşamalı haritaları, vitrayları ve karşılaştırmaları içerir.
Önceki `output/junction-pilot/` ve `output/geometry-rollout/` geçmişi korunur.

Sonuç: **276/276 bölüm denetlendi**, kalan **251 bölümde 1781 belirsiz
birleşim** giderildi. 25 bölümün yayımlanan hali aynen korundu. **251 vitrayda
8597/8597 parça** eşleşti; bütün bölümler tek çözümlü ve mantıkla çözülebilir.
27 zor bölüm, 25 büyük sahne, bölüm sırası ve kedi öğreticisi korundu.

- Belirsiz dört veya daha çok yönlü temaslar, aralarında görünen bir ortak
  kenar bulunan T birleşimlerine ayrılır. 300 px pano genişliğinde hedef
  ayrım 10–13 px; yalnızca çok küçük sayısal bir fark yeterli değildir.
- Önce arka plan bölücüsünü mevcut figür sınırı üzerinde kaydırın; düz çizgiyi
  düz tutun. Sıkışık yerde gereksiz bir bölücüyü kaldırın. Gözleri, kapalı
  daireleri, figür siluetini ve karşılıklı simetriyi görsel olarak inceleyin.
  Pusula göbeğinde iç ışınlar sadeleştirilir; daire bükülmez.
- `readable_junctions.py` ortak üretim geçişidir; `contact_policy.finish_builder`
  üzerinden yeni üretime uygulanır. Yeni düğüm her iki çizgiye aynı
  yuvarlatılmış koordinatla eklenir; mikroskobik kopuk sınır bırakılmaz.
- `audit_geometry.py` **sürüm 3**, önceki ortak kenar/kapsam kontrollerine ek
  olarak dış çerçeve dahil bütün çok yönlü birleşimleri reddeder.
  `build_levels.js` v3 onayı olmadan katalog üretmez.
- `junction_rollout.py`, `junction_refine.py`, `junction_compass.py` bu snapshot'a
  ait onarımlardır. `junction_rollout_clues.js` son komşuluklarla renk ve
  ipuçlarını tamamlar; bundan sonra `junction_rollout_art.py` mevcut gerçek
  cam dokularını aktarır. Yeni görseller `assets/glass/<id>-junctions.webp`.
- `publish_junction_rollout.py` snapshot özetlerini ve bütün aşamalı sonuçları
  kontrol ederek oyuna aktarır. `verify_junction_rollout.js` yayımlanan
  kataloğun sırasını, öğreticiyi, zor konumlarını, mantığını ve cam özetlerini
  karşılaştırır. Sonuç: `output/junction-rollout/final-report.json`.
- İnceleme: `../../output/junction-rollout/index.html` bütün bölümlerin senkron
  yakınlaştırılabilir önce/sonra çizgi ve vitraylarını gösterir. İlk sekiz
  bölümün önceki onarımları `../../output/junction-pilot/index.html` içindedir.

### Önceki siluet ve kısa temas düzeltmesinin kaydı

Onaylanan 10 bölümlük pilot bütün kataloğa uygulandı. **Sivri olmak tek başına
hata değildir:** uzun ortak kenarı olan bölgelerin özgün eğrileri, köşeleri,
simetrisi ve silueti korunur. Açık nokta teması komşuluk sayılmaz. Eski genel
pah/köşe düzleştirme hattı artık üretimde kullanılmaz.

- `contact_policy.py`: gerçek kısa ortak kenarlar (<.28 birim), ayrı sınırlar
  arasındaki çok dar aralıklar (.003–.219) ve kullanılamayacak küçük artıklar
  için yerel düzeltme. Farklı konumlardaki temaslar tek noktaya birleştirilmez.
  Önce gereksiz arka plan çizgileri sadeleştirilir; kaynak motif korunur.
- `geom.Build.run()` ve `figurative_geometry.finish()` bu politikayı kullanır.
  `run_legacy()` sadece tarihsel üretimi yeniden incelemek içindir.
- `audit_geometry.py` önceki **sürüm 2** denetimi (yerini v3 aldı): geçerli/bağlı bölgeler, kapsam/çakışma,
  gerçek ortak kenar ile komşuluk tutarlılığı, kısa sınırlar, dar aralıklar,
  küçük alanlar ve etiket konumları. Eşikler çizgi kalınlığıyla aynı gerçek
  tuval birimindedir. Genel açı yasağı yoktur. Görsel inceleme ayrıca gerekir.
- `play-order.json` oynanış sırasını sabitler. Geometri veya renk değişmesi
  erken desen bölümlerini yeniden seçmez. Yeni bölüm/sıra talebinde bu dosya
  açıkça güncellenir; zor bölümler 10,20,… konumlarını korur.
- `geometryRevision: 3`, `junctionStyle: shared-border-aware`. Kaynak
  oluşturucular mevcut tamamlanmış sürümleri korur.

Önceki siluet yayınının denetimi: **276/276 geometri**, **274 vitray / 9229 eşleşen parça**.
Kedi ve beyin mevcut uygun sürümleriyle korundu. 27 zor bölümün yeri sabit;
25 büyük sahnede 67–118 parça, 42–80 boş alan bulunur. Son karşılaştırma:
`../../output/geometry-rollout/index.html`; yayın kontrolü:
`../../output/geometry-rollout/final-report.json`.

### Mevcut camı yeniden kullanma

Kullanıcı tercihiyle mevcut görsellerin dört renk cam dokusu yerel olarak
aktarılır. `reuse_glass.py` eski bölüm maskelerinden çizgisiz cam örnekleri
çıkarır, uygun iç pikselleri korur, değişen alanları aynı gerçek dokuyla
kaplar; eski kurşun çizgilerini kaldırıp yeni sınırları çizer. Sentetik gürültü
veya düz renk kılavuz, vitray yerine kullanılmaz. Bütün görseli bir görüntü
modeline yeniden ürettirmek gerekmez. Uygun cam örneği yoksa veya aktarım
kalitesi yetersizse yalnızca ilgili görsel yeniden üretilebilir.

Yeni varlıklar `assets/glass/<id>-restored.webp` ve `.json`; kaynaklar korunur.
`glass-reuse-manifest.json` kaynak/hedef/rehber yollarını ve kaynak özetlerini
kaydeder. Metadata aktarım yöntemi, örnek ölçüleri, eski geometri özeti, son
rehber/görsel özetleri ve gerçek parça renk kontrolünü içerir.

`output/geometry-rollout/` eski katalog/haritaları, aşamalı yeni haritaları,
karşılaştırmaları, denetim raporlarını ve işlem kayıtlarını içerir. Bu çalışmaya
ait `rollout_geometry.py`, `refine_rollout.py`, `rollout_hard.js`,
`rollout_clues.js`, `reuse_glass.py`, `publish_rollout.py` araçları bu snapshot'a
bağlıdır. Gelecekteki bağımsız bir düzeltmede yeni snapshot ve çıktı dizini
kullanılmalıdır. Aynı tarihsel kaydın üstüne yazılmamalıdır.

Son geometri/çözüm/ipuçları → son rehber → cam aktarımı/üretimi → parça renk
kontrolü → `image`/`artMetadata` bağlantısı → tam denetim ve katalog derlemesi
sırası zorunludur. Açılış hamleleri ve zor çıkarımlar yeniden doğrulanır;
kedi eğitimi korunur. Eski bölümlerin üretim tarihçesi aşağıdadır; genel pah
ve image-gen zorunluluğu anlatan tarihsel notların yerini bu politika alır.

## 26–50. bölümlerin kaynakları

- `extra_designs.py`: 25 yeni motif; `designs.py` tarafından kaydedilir.
- `maps/<id>.json`: bölge geometrisi, komşuluklar ve dört renkli çözüm.
- `guides/<id>.png` ve `<id>.labels.png`: görsel üretim kılavuzu ve renk maskesi.
- `levels-26-50-prompts.json`: yerleşik `image_gen` ile kullanılan istemler ve referanslar.
- `raw/<id>.png`: üretilen kaynak görseller.
- `../../assets/glass/<id>.webp` ve `.json`: oyunda kullanılan 768×1024 görsel,
  örneklenmiş palet ve üretim bilgileri.

Kaynak PNG'yi oyun formatına aktarmak için:

```sh
python tools/stained/import_generated.py snail
node tools/stained/build_levels.js
```

Komutlar proje kökünden çalıştırılır. İçe aktarıcı API çağrısı yapmaz; mevcut
PNG'yi dönüştürür, paleti örnekler ve bölge renkleri çözümle uyuşmazsa durur.
Python araçları Pillow, Shapely 2, NumPy, SciPy, OpenCV, httpx ve python-dotenv
paketlerini kullanır.

Yalnızca tasarımı değişen haritayı yeniden üretmek için
`python tools/stained/make_maps.py <id>` kullanılır. Geometri değişince eski
görsel de yeniden üretilmelidir. `build_levels.js` başlangıç ipuçlarını
oluşturur; her bulmacanın tek çözümü olmasını ve mantıkla çözülebilmesini
zorunlu tutar. Normal bölümler yalnızca hazır komşu renklerini eleyerek baştan
sona çözülebilir; ikili aday veya çelişki çıkarımı gerektirmez.

## Kesin başlangıç hamleleri

`starting_clues.js` normal bölümlerde birbirine komşu olmayan kesin başlangıç
alanları seçer. İpuçları azaltılırken hem bu başlangıç sayısı hem de yalnızca
tek kalan rengi bularak tamamlanabilme koşulu korunur. İlk sekiz kaynak tasarımda
dört, diğer normal bölümlerde üç başlangıç hedeflenir. Kedi eğitimi kendi
ipuçlarını korur (iki başlangıç). Köşe düzeltmesinden sonra 12 parçalı beyin
dahil diğer tüm normal bölümlerde en az üç kesin hamle bulunur.

Zor bölümlerde en az iki kesin başlangıç zorunludur. `prepare_hard.js`, daha az
başlangıcı olan mevcut zor bölümlere gerekli ipuçlarını ekler; tek çözümü,
en az üç ileri çıkarımı ve büyük bölümlerde en az 35 boş alanı korur.
Bu düzenleme bölüm sırasını, geometriyi, çözüm renklerini ve görselleri değiştirmez.
Örneğin 118. bölüm `atlas_06` artık üç kesin başlangıç ve 21 boyanacak alan içerir.

## Kısa kedi eğitimi

İlk bölüm yine `cat`: 12 büyük parça, 4 boyanacak alan. Geometri `designs.py`
içindedir. `node tools/stained/build_tutorial.js`, tek çözümü olan başlangıç
renklerini ve boya/not hedeflerini seçip `maps/cat.json` içine kaydeder.
Yeni tamamlanma görseli `assets/glass/cat-tutorial.webp` dosyasıdır.

Kedi haritası yeniden üretilirse `build_tutorial.js` de tekrar çalıştırılmalıdır.
Eğitim sırası: ortak kenar kuralı ve hazır alanlar, renk seçimi, çift dokunarak
boyama, tek dokunarak iki olası rengi not alma, kalan üç alanı tamamlama.

## 51–200. bölümler

`mass_designs.py` on geometrik motif ailesini tanımlar; `build_expansion.py`
150 farklı haritayı deterministik olarak üretir. Uygun olmayan adayları eler:
20–55 parça, küçük parça sınırı, belirsiz komşuluklar ve tekrarlanan geometri.
Kabul edilen üretim tohumu ve geometri özeti harita metadatasında tutulur.
Kaydedilmiş sürüm 2 haritaları sonraki çalıştırmalarda korunur. Belirli bir
haritayı yeniden üretmek için o haritanın `catalogVersion` alanı kaldırılır.

```sh
python tools/stained/build_expansion.py
python tools/stained/import_generated.py --manifest tools/stained/levels-51-200-prompts.json chapter_051
node tools/stained/build_tutorial.js
node tools/stained/build_levels.js
```

Bu genişlemede kedi görseli ve 150 geometrik vitray, yerleşik `image_gen` ile
ayrı ayrı üretilmiştir. Sonraki temalı sürüm bu geometrik bölümlerin 50'sini
kaldırır; referans desenleri güncellemesi 75'ini daha değiştirir ve 25'i kalır.
Tarihsel istemler `levels-51-200-prompts.json`
içindedir. İçe aktarıcı her parçanın rengini çözüme karşı kontrol ederek
`paneColorCheck` metadatasını yazar; derleyici uyumsuz görsellerle durur.
Aktif bölümlerin görselleri projede bulunur; oyun sırasında görsel üretilmez.

## Temalı bölümler ve büyük zor sahneler (sürüm 3)

İlk 50 tasarım korunur. Kaynak sırasındaki 51–200 aralığındaki kare/çiçek şablonlarının en çok tekrar
eden 50 örneği yeni temalı sahnelerle değiştirilmiştir. Değişen numaralar:
102, 105, 106, 109, 110; 112, 115, 116, 119, 120; 122, 125, 126, 129, 130;
132, 135, 136, 139, 140; 142, 145, 146, 149, 150; 152, 155, 156, 159, 160;
162, 165, 166, 169, 170; 172, 175, 176, 179, 180; 182, 185, 186, 189, 190;
192, 195, 196, 199, 200. Bunlar karıştırmadan önceki kaynak numaralarıdır.

- **Kaynak 201–250:** 50 yeni hayvan ve nesne; ahtapot, bukalemun, tukan, gramofon,
  daktilo, saksafon, astronot, denizaltı ve diğer elle çizilmiş motifler.
- **Kaynak 251–275:** 25 büyük sahne; dağ ekspresi, yıldızlı kamp, sualtı şehri,
  rasathane, kütüphane, balon vadisi, çöl kervanı, lunapark ve diğer manzaralar.
- Büyük haritalar başlangıçta 18×24 idi; temiz birleşimler güncellemesiyle
  **27×36** olmuştur. Normal figürlü haritalar **12×16** birimdir.
  Büyük görseller 1728×2304, normal görseller 768×1024 olarak saklanır.
- Büyük bölümlerde **68–98 parça**, **39–66 boyanacak alan** bulunur. Başlangıç
  düzeni tek çözüm, en az üç çift/çelişki çıkarımı ve basit elemeyle tek başına
  çözülememe koşullarını sağlar. Tahmin zorunlu değildir.

`creative_designs.py` motifleri ve sahneleri tanımlar. `figurative_geometry.py`,
göz/mercek gibi kapalı halkaları ve çizilen sınırları korur; birleşimlere yuvarlak
çıkıntılar eklemez. Yalnızca ortak kenarı olan parçalar komşudur. `build_creative.py` güncel
haritaları korur, eksikleri üretir. `prepare_hard.js` büyük sahnelerin başlangıç
ipuçlarını ve ölçülen zorluk metadatasını kaydeder.

```sh
python tools/stained/build_creative.py
node tools/stained/prepare_hard.js
# Yerleşik image_gen ile creative-prompts.json istemlerini ve kılavuzlarını kullan.
python tools/stained/import_generated.py --manifest tools/stained/creative-prompts.json motif_octopus
node tools/stained/build_levels.js
```

`creative-prompts.json` 125 görselin tam istemlerini, yollarını, bölüm numarasını
ve değiştirdiği eski kimliği içerir. Kaynak PNG'ler `raw/`, oyun görselleri ve
renk kontrolü kayıtları `../../assets/glass/` altındadır. Yeni görseller yerleşik
`image_gen` ile üretilir; derleme eksik veya yanlış renkli bir görselle durur.
Kaldırılan `chapter_*` kimlikleri yeniden üretilmez. Koleksiyon sayaçları yalnızca
güncel katalogdaki kimlikleri sayar; kalan bölümlerin tamamlanma kayıtları korunur.

## Oynanış sırası: her 10 bölümde bir zor

- Zor bölümler tam olarak **10, 20, 30, …, 270** numaralarındadır; beyin bölümüyle
  toplam 276 bölüm vardır. Son altı bölüm normaldir.
- İlk 50 normal tasarım kendi sırasını korur; araya zor bölümler girince
  numaraları kayar. Örneğin eski 10. bölüm 11, eski 50. bölüm 55 olur.
- İlk 10 bölüme dokunulmaz. 11–50 arasına en kolay 10 desen bölümü (4 halka,
  3 spiral, 3 harita) birkaç bölümde bir girer: 12, 15, 19, 23, 27, 31, 35, 38,
  43, 47 (`EARLY_PATTERN_SLOTS`). İlk 50 tasarım aynı sırayla ama bu kadar
  geriye kayarak devam eder.
- Sonraki normal tasarımlar sabit tohumla karıştırılır; her açılışta değişmez.
- Karıştırma görsel aileleri dengeler: figürlü, halka/spiral/harita, geometrik ve
  büyük sahne bölümleri art arda aynı aileden gelmez. Zor bölümün iki yanında da
  aynı aile tekrarı varsa kuyruk yeniden yerleştirilir; ilk 50 tasarımın sırası
  değişmez.
- Horoz ve Istakoz'un başlangıç ipuçları zorlaştırılmıştır. Bu iki normal boyutlu
  bölüm 10 ve 20'de, 25 büyük zor bölüm ise 30–270 arasında yer alır. Zor
  bölümlerin sırası `hard-order.json` ile korunur. Hepsi tek çözümlüdür ve en az üç
  çift/çelişki çıkarımı gerektirir.
- Kaynak sırası ipucu üretiminde sabit kalır. Sıralama değişirken mevcut bölüm
  kimliği ve tamamlanan bölüm kayıtları korunur; `CARTO_STAINED_ORDER` eski
  sayısal kaydı yeni sıraya taşımak için kullanılır.
- Zor bölüm başlıkları, seçim kartları ve koleksiyon etiketleri kırmızıdır.

## Kullanıcı referanslarından 75 yeni düzen (sürüm 4)

`references/38.webp`, `references/16.webp` ve `references/usa.gif` kullanıcının
verdiği tasarım referanslarıdır. İlk ikisindeki dairesel bantlar ve köşeli
koridorlar, üçüncüsündeki bölgelere ayrılmış harita görünümü esas alınır.

- **25 halka:** örtüşen çemberler, ufuk yayları, elipsler ve çok merkezli düzenler.
- **25 spiral/labirent:** köşeli sarmallar, ikili/dörtlü avlular ve basamaklı yollar.
- **25 harita:** farklı kıyı siluetleri ve düz/kıvrımlı bölge sınırları. Bunlar
  kurgusal coğrafyalardır; gerçek ülkelerin idari sınırlarını temsil etmez.

Kalan 100 eski `chapter_*` tasarımının 75'i yerinde değiştirilmiştir; eski
şablonlardan 25 tane kalır. Bu aşamada katalog 275 bölümdür. Diğer 200 bölüm, ilk 50
tasarımın göreli sırası ve 10'un katlarındaki 27 zor bölüm korunur. Yeni
bölümlerde 17–40 parça, 6–24 boyanacak alan vardır; her biri mantıkla çözülebilir
ve tek çözümlüdür.

`pattern_designs.py` tasarımları, `build_patterns.py` geometri ve tam hizalı
PNG/SVG üretim kılavuzlarını oluşturur. Tamamlanma görselleri bu kılavuzlardan
yerleşik `image_gen` ile üretilen cam dokulu vitraylardır. Düz renkli kılavuzlar
tamamlanma görseli olarak yayımlanmaz. Üretici mevcut vitray dosyalarının üzerine
yazmaz; kılavuz yenilendiğinde `artworkNeedsRefresh` işaretini bırakır.

`pattern-catalog.json`, kaynak numarası (`level`), güncel oyun numarası
(`playLevel`), değiştirilen kimlik ve dosya yollarını içerir. Önizlemeler:
`guides/rings-catalog.png`, `guides/spiral-catalog.png`, `guides/atlas-catalog.png`.

```sh
python tools/stained/build_patterns.py
node tools/stained/build_levels.js
```

Üretici tamamlanmış haritaları korur. Derleyici görsel/geometri özetlerini,
renk uyumunu ve tek çözümü zorunlu tutar. `build_expansion.py` her iki değişim
kataloğundaki kaldırılmış kimlikleri atlar; eski bölümleri tekrar üretmez.

## Temiz birleşimler, geniş tuval ve beyin bölümü

`geometryRevision: 2` ile 125 figürlü/sahneli ve 75 desen/harita bölümündeki
otomatik dairesel birleşim yamaları kaldırılmıştır. Özellikle 113
(`story_iguana`), 118 (`story_giraffe`) ve 121 (`motif_deer`) kendi numaralarında
kalır. Gerçek motif eğrileri korunur; gereksiz küçük çıkıntılar üretilmez.
Köşe temasları kenar komşuluğu değildir; oyun içindeki kural metni bunu açıklar.
Kılavuz üretimi ve renk örneklemesi, kapalı halkaların iç boşluklarını ayrı
maskelerle korur; küçük bir halka içindeki büyük parça başka renkle örtülmez.

25 büyük bölümün kompozisyonu her eksende 1,5 kat büyütülür: **27×36** tuval,
önceki sürüme göre **2,25 kat alan**. Küçük parça alt sınırları da aynı oranda
büyür; fazladan ayrıntı sıkıştırılmaz. Bölüm başlangıçta panelin tamamını gösterir; yakınlaştırıldığında
kaydırılabilir ve 6× yakınlaştırılabilir. Ekran yeniden ölçüldüğünde
kullanıcının zoom/pan konumu korunur; eksi düğmesiyle tüm harita görülebilir.

`prepare_hard.js` temiz geometri üzerinde ipuçlarını yeniden üretir. Gerekirse
geometriyi değiştirmeden geçerli bir alternatif renklendirme seçer ve haritayı
`artworkNeedsRefresh` ile işaretler. Böyle bir durumda yeni çözümle kılavuz ve
görsel yeniden üretilmelidir; `import_generated.py` başarılı renk kontrolünden
sonra bayrağı kaldırır. Derleyici eski görselle devam etmez.

**276. bölüm Renkli Beyin:** `references/brain.png` örneğinden esinlenen 12 büyük
parçalı doğal beyin silueti. `build_brain.py`, haritasını ve aynı geometriyi kullanan
SVG/PNG kılavuzunu üretir; tamamlanma görseli kılavuza göre üretilen vitraydır.
Mevcut 275 bölümün sırası değişmez.

```sh
python tools/stained/build_creative.py
python tools/stained/build_patterns.py
python tools/stained/build_brain.py
node tools/stained/prepare_hard.js
# Değişen figürlü/sahneli kılavuzlar için creative-prompts.json ile image_gen.
# Ardından import_generated.py ile yeni görselleri içe aktar.
node tools/stained/build_levels.js
```

## Köşe okunurluğu ve zorunlu geometri denetimi

`cartograph-levels` skill'i yeni bölüm üretme, değiştirme ve onarma işlerinde
bu kuralları kalıcı olarak uygular. `figurative_geometry.finish`, ilk 50'deki
`Build.run` temizleme hattını kullanır: kapalı göz/pencere halkaları korunur,
yuvarlak düğümler yerine düz pahlar ve okunaklı T birleşimleri oluşturulur.
Sadece sivri uç kontrolü yeterli değildir; örneğin 122 (`atlas_05`, İki Körfez)
sivri uç içermese de çok kısa ortak kenarlar ve belirsiz temaslar içeriyordu.

`audit_geometry.py` aktif kataloğun tamamında kısa ortak kenarları (<0,28),
yakın komşu olmayan alanları (<0,22), sivri uçları (<40°), dar kenar şeritlerini
ve geçersiz alanları denetler. Büyük sahneler 1,5 ölçeğine göre normalleştirilir.
Yuvarlama kaynaklı, koordinat ızgarasından küçük morfolojik artıklar dar şerit
sayılmaz. Gerektiğinde tuval büyütülür; 27×36 büyük bölümler için alt sınırdır.

```sh
python tools/stained/repair_corners.py --output /tmp/cartograph-repaired
# Düzeltmeleri incele, gerekli haritaları kaynaklara aktar.
node tools/stained/prepare_hard.js
# Son çözümden kılavuzları ve eşleşen görselleri oluştur/içe aktar.
python tools/stained/audit_geometry.py --stamp --report tools/stained/geometry-audit.json
node tools/stained/build_levels.js
```

Onay; bölge yolları, dış sınır, komşuluk listesi ve ortak kenarların SHA-256
özetine bağlıdır. Derleyici eksik/geçersiz veya sonradan değişmiş onayla durur.
`cornerRevision: 1` düzeltilen haritaları, `junctionStyle: flat-readable`
düz pahları belirtir. `*-clear.webp` görselleri yeni geometriye aittir;
önceki dosyalar korunur. `corner-repair-prompts.json` vitray yenileme
istemlerini içerir. Görsel renk kontrolü geçmeden `artworkNeedsRefresh`
kaldırılmaz. Son tam tarama `geometry-audit.json` dosyasındadır.

Son köşe düzeltmesinde 206 bölümün geometrisi ve eşleşen görseli yenilendi.
276/276 bölüm geometri denetiminden geçti; bölüm sırası ve 10–270 arasındaki
onar aralıklı 27 zor bölümün konumu korundu. 130 vitray yerleşik `image_gen`
ile yenilendi; o aşamada düz vektör olarak kalan 76 desen/beyin görseli
aşağıdaki vitray tamamlama çalışmasında cam dokulu görsellere dönüştürüldü.


## Desen ve beyin vitraylarının tamamlanması

75 halka/spiral/harita ve beyin bölümünün düz renkli tamamlanma görselleri,
`pattern-vitray-prompts.json` içindeki 76 ayrı istem ve geometri kılavuzu ile
cam dokulu görsellere dönüştürülür. Kaynaklar `raw/<id>-vitray.png`, oyun
varlıkları `../../assets/glass/<id>-vitray.webp` ve `.json` dosyalarıdır.
Haritalarda `image`, `artMetadata`, `artworkStyle: stained-glass` alanları kullanılır.
`vectorGuide`, düzenlenebilir vektör kılavuzudur; vitrayın SVG kopyası değildir.

```sh
python tools/stained/import_generated.py --manifest tools/stained/pattern-vitray-prompts.json spiral_03
node tools/stained/build_levels.js
```

İçe aktarma renk kontrolünü geçtikten sonra haritanın `image` ve `artMetadata`
yolları ilgili yeni dosyalara bağlanmalıdır. Çözüm, geometri ve başlangıç
ipuçları görseli uydurmak için değiştirilmez. Üreticiyle yeni kılavuz hazırlamak
vitray üretiminin yerini tutmaz; yenilenen kılavuz için yeniden görsel üretilir.
