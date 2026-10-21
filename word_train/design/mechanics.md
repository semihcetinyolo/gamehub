# Word Train — dört oynanabilir mekanik

Kodlama kaynağı: `CONTRACT.md`. Bu belge dört varyantın ilk karşılaştırılabilir sürümünü tanımlar. Yeni `levels.js` alanı **gerekmiyor**. Varyantlar aynı bölümleri aynı sırayla oynatır; tren, renkler, doğru cevap ödülü ve bölüm sonu ortaktır.

## Ortak kurallar ve uygulama sözleşmesi

- **Mobil oyun:** kök yüzey `height:100dvh; overflow:hidden`, `html/body` kaydırmasız; `box-sizing:border-box`. `padding-top:env(safe-area-inset-top)` ve alt eşdeğeri ekranın toplam yüksekliğine dahildir. İç oyun alanı da dikey kaydırılmaz. Başlık, varyant adı, slogan veya tanıtım/hero alanı yok; yalnız bölüm numarası, ilerleme, ayarlar ve tek admin ikonu olan kompakt HUD vardır. Mekanik adları bu belgede ve varyant seçicide kullanılabilir.
- Bütün etkileşim hedefleri **en az 48×48 px**. Genel `touch-action:manipulation`, sürüklenen v3/v4 oyun alanında `touch-action:none`; Pointer Events kullanılır, hover gerektiren durum olmaz. Tek aktif pointer; animasyonda tekrar giriş engellenir. Geri bildirim `core/haptics.js` üzerinden kısa titreşimle desteklenir; modülün dışa aktardığı API kullanılır, desteklenmeyen cihazda sessizce geçilir. Seçimde hafif, doğruda kısa başarı, yanlışta kısa hata titreşimi; sürekli titreşim yok.
- HUD ayarlar ikonunun açtığı küçük panelde ses/titreşim ve normal `Yeniden başlat` yer alabilir. **Bölüme atla, cevabı çöz/göster, bölüm sonuna geç, ilerlemeyi sıfırla, yeniden karıştır/seed değiştir ve varyanta özel testler yalnız admin popup içinde:** `openAdmin({ levels: LEVELS, currentId: level.id, onJump, actions: [{ label, run }] })`. HUD'da tek admin ikonu vardır; oyun alanında ayrı bölüm listesi, test veya karıştır düğmesi olmaz. `Geri al`, oyuncunun mevcut seçimini `Temizle`, `İpucu` ve cevap onayı normal oynanış kontrolleridir, altta kalır.
- İlk vagon `chain[0].word` ile dolu başlar; tur `current(state).prev/target` üzerinden yürür. İlerleme `(state.found.length - 1) / (chain.length - 1)`. Vagonda **KAPAĞI** kalırken sonraki soru **KAPAK + ?** olur: soru için `prev.base`, cevap için `target.word`, başarı için `target.phrase`. Ek/kök türetme algoritması yazılmaz.
- `target.hint` her tur başlangıçtan görünür. Aynı kökle başka geçerli tamlamalar bulunabilir; ipucu aranan cevabı tekilleştirir. Yanlış mesajı `Bu ipucuna uymadı. Bir daha dene.`; başka bir tamlamaya geçersiz sözcük denmez. Yalnız hedef sözcük başarı kabul edilir.
- Süre sınırı, can veya puan kaybı yok. Bölüm sonunda `N vagon • X hata • Y yardım`, `Sonraki bölüm`, `Tekrar oyna`; son bölümde `Tekrar oyna` ve admin ikonundan bölüm seçimi. Bölüm değişimi bütün yerel seçimleri/yardımları ve zamanlayıcıları sıfırlar.
- `mountTrain` üstte kullanılır. Ghost `?` veya kısmi cevap; doğruda yalnız bir `answer` ve `addWagon(result.word, { phrase: result.phrase })`. Giriş 550 ms geçiş boyunca kilitli; tamlama ayrı durum satırında en az 900 ms kalır, sonraki turun ipucunu örtmez. Son turda `celebrate()`. Geç kalan callback'ler tur kimliğiyle engellenir. Hareket azaltma tercihinde kısa solma kullanılır.
- Yanlışta `train.shake()`, 180 ms hafif sarsıntı, mercan çerçeve + metin; 250 ms sonra giriş açılır. Eksik seçim `answer` çağırmaz, hata sayılmaz. Renk tek geri bildirim değildir.
- **Core ile uyumlu yardım:** önce varyantta uygulanabilir yardım kaldığını denetle, sonra `useHint(state, 'letter')` çağır. Dönüş `reveal.fresh` true ise yeni state'i sakla ve aşağıdaki varyanta özgü tek yardımı uygula. false ise yardım yapma, düğmeyi pasifleştir. Core hedefte en çok `Array.from(word).length - 1` yardım sayar, son harfi açmaz. UI state.hints/revealed değerlerini elle değiştirmez. `clue` başta çağrılmaz; anlam ipucu ücretsiz ve zaten görünür. v2 eleme/v3 parça kilidi için `reveal.index` harf konumu olarak kullanılmaz; yalnız fresh/state muhasebesi kullanılır. Yerel yardım olanakları biterse daha erken pasifleştir. Yardım otomatik başarı göndermez.
- Türkçe `trUpper`/`normalize`, karakterler `Array.from`; I/İ ayrımı korunur. Her harf veya parça ayrı kimlik taşır. Düzen `rng(seed)`/`shuffle` ile tur başında bir kez üretilir; yanlış cevapta/render'da değişmez. `?level=1&seed=123` tekrar üretilebilir. İlerleme `wordtrain.vN.*` altında `try/catch` ile saklanır; yarım tur saklamak zorunlu değil.
- **Yerleşim bütçesi:** aşağıdaki 390×844 taslakları üst 24 px, alt 34 px örnek güvenli alanla verilmiştir; gerçek değerler cihazdan alınır. HUD 48 px; tren yaklaşık 128 px. Asıl dokunma alanı alt yarıda, ana kontroller güvenli alanın hemen üstündedir. Aynı taslak içindeki y aralıkları yükseklik bütçesidir; safe-area iki kez eklenmez.
- Kısa ekranda önce dekor/boşluklar, sonra tren 64 px'e ve soru alanı 56 px'e iner; 48 px hedefler küçülmez. V1 aşağıdaki kompakt cevap gösterimini kullanır; v2 ayrı önizlemeyi durum satırına birleştirip hatlarını 48 px'e, v3 blokları 48 px yüksekliğe, v4 hücreleri 48 px'e kadar küçülebilir. Kaydırma veya kontrolleri ekran dışına itme çözüm değildir. 360×640 ve 390×844 kontrol edilir. Sadece ortak tren şeridi yatay kayabilir; uzun vagon yazıları kesilmez. Admin popup uzun veri listesi kendi içinde kayabilir; alttaki oyun/sayfa sabit kalır.
- Güncel 12 bölümde 108 cevap, kelime uzunluğu **3–11**: v1 en fazla 14 sandık, v3 en fazla 5 parça, v4 16 hücre yeterlidir. Gelecek veride kapasite aşılırsa geliştirici hatası göster; harfleri sessizce atma veya sayfaya kaydırma ekleme.

## v1 — Harf Sandıkları

**Özet:** Karışık harf sandıklarına sırayla dokunarak aranan kelimeyi boş yük yuvalarına doldur.

### Çekirdek döngü

1. `prev.base + ?`, anlam ipucu ve hedefin harf sayısı gösterilir. `target.word` harflerinden kimlikli sandıklar oluşturulur; ek harflerle karıştırılır. İlk örnekte `KAPAĞI` için altı boş kutu ve `K, A, P, A, Ğ, I` sandıkları vardır.
2. Bir sandığa dokunmak onu soldaki ilk boş, kilitsiz yuvaya taşır. Sandık havuzda soluk bir yer tutucu bırakır; diğer sandıklar kaymaz. Aynı sandık ikinci kez seçilemez.
3. Dolu, kilitsiz yuvaya dokunmak o harfi kendi sandığına geri yollar. Diğer yuvalar yerinde kalır. `Geri al` en son yerleştirilen kilitsiz sandığı iade eder; `Temizle` bütün kilitsiz yuvaları boşaltır.
4. Bütün kutular dolunca `Vagona yükle` etkinleşir. Otomatik gönderme yok; oyuncu son dizilişi inceleyebilir. Gönderimde yuvalar soldan sağa birleştirilir.
5. Doğruda sandıklar yeni vagona 300 ms içinde küçülerek gider, vagon bağlanır. Yanlışta diziliş korunur; oyuncu yalnız hatalı olduğunu düşündüğü yerleri değiştirebilir.

### 390×844 yerleşim

```text
      ┌───────────────────────────────────┐
 0–24 │          üst güvenli alan        │
24–72 │ B.1              2/9    [⚙] [⚒] │ kompakt HUD
72–200│ 🚂 [KİTAP]—[KAPAĞI]—[ ? ]       │
200–280 KAPAK + ? / anlam ipucu          │
280–312       son tamlama / durum        │
312–416 [ ][ ][ ][ ][ ][ ]              │ 48 px yuvalar
      │ [ ][ ]                           │
416–472       esnek boşluk               │
472–664 [S] [I] [T] [M] [A]             │ 5 × 3 havuz
      │ [R] [A] [I] [E]                 │
688–740 [Geri al] [Temizle] [İpucu]      │
752–808       [ Vagona yükle ]           │
810–844          alt güvenli alan        │
      └───────────────────────────────────┘
```

Sandıklar 56×56 px, 5 sütun ve en çok 3 satır; cevap yuvaları 48×48 px, 6 sütun ve en çok 2 satır. Yedinci harf alt satıra geçer. Cevap alanı yeniden düzenlemek için dokunulabilir; temel yükleme ve onay alt yarıdadır. Çizimdeki harfler temsili; gerçek havuz hedefin bütün harflerini ve seçilen ekleri içerir.

**Kısa ekran:** kullanılabilir yükseklik 660 px altındaysa dokunulabilir cevap kutuları yerine 24 px yüksekliğinde, harfleri/boşlukları gösteren tek satır pasif önizleme kullan. Harf geri almak için alttaki `Geri al`/`Temizle` kullanılır; küçük dokunma kutuları üretme. 360×640, üst+alt safe-area 58 px örneğinde bütçe: HUD 48 + tren 64 + soru 56 + durum 24 + cevap 24 + sandık alanı 152 (3×48 + 2×4) + iki kontrol satırı 100 (2×48 + 4) + aralar 14 = 582 px. Havuz 5 sütundur. 390×844'te üstteki iki satırlı dokunulabilir kutular korunur.

### Veri ve türetme

`word` harf havuzu/cevap uzunluğu, `prev.base` soru, `hint` anlam, `phrase` başarı için kullanılır. `distractors` harfleri ek sandık kaynağı olabilir; `base` cevabın yerine geçmez. Yeni alan yok. `letterPool` yardımcı fonksiyonu uygunsa kullanılır; her dönen harfe ayrı UI kimliği verilir. Ek harfleri hedefte hiç olmayan harflerden seç; kaynak yetmezse Türkçe alfabe kullan. Hedefteki tekrarları asla azaltma.

### İpucu, zorluk, eğlence ve risk

- İpucu: core fresh döndürürse soldan ilk kilitsiz yuvayı doğru harfle doldurup kilitle; son harf oyuncuya kalır. Yerindeki yanlış sandığı havuza iade et; gereken doğru sandık başka yuvadaysa oradan al, o yuvayı boş bırak. Önceden kilitli sandık asla taşınmaz. Aynı harf birden çoksa uygun kimliklerden herhangi biri kullanılabilir.
- Zorluk: bölüm 1–4 ek harf 0; 5–8 ek harf 2; 9+ ek harf 3. `Karıştır` yalnız admin actions içindedir; yalnız kullanılmayan sandıkların yerini değiştirir. Güncel en uzun 11 harf + 3 ek = 14 sandık, 15 kapasiteli alana sığar; havuz kaydırılmaz. Havuz 15 sandığı aşarsa önce ekleri azalt, hedef harflerini eksiltme.
- Eğlence: dokunulan her harf somut bir yük olur; küçük yerleştirmeler ve sonunda dolu vagon net bir tamamlanma hissi verir. Anlamı bilmeden harflerden çözüm üretmek mümkündür.
- Risk: uzun kelimelerde fazla dokunma ve tekrar eden harflerde karışıklık. Sabit havuz yuvaları, geri alma ve kilitli ipucu bunu azaltır. Ğ/İ/I harfleri büyük ve açık okunmalı. Sürükleme zorunluluğu eklenmez; ilk sürümün ana girişi dokunmadır.

## v2 — Doğru Makas

**Özet:** İpucuna uyan kelimeyi taşıyan dört yan hat vagonundan birini seçip makası ana trene bağla.

### Çekirdek döngü

1. Yukarıda `prev.base + ?` ve anlam ipucu; aşağıda dört sabit yan hat görünür. Her hatta bir tam kelime vagonu vardır: `target.word` ve üç `distractors`.
2. Oyuncu hat satırına veya makas düğmesine dokunur. Makas seçilen raya döner; yalnız bir seçenek seçilidir. Ghost ve önizleme `trLower(prev.base) + ' ' + trLower(selectedWord)` gösterir.
3. Seçim tek başına gönderim değildir. Oyuncu başka raya geçebilir; `Trene bağla` seçimi onaylar. Zamanlama, hızlı akan vagon yakalama veya refleks gerekmiyor.
4. Yanlışsa vagon 24 px ilerleyip 250 ms içinde geri gelir; o seçenek mercan bir çarpı ile bu tur pasifleşir, seçim temizlenir. Üçüncü hatada kalan doğru seçenek hâlâ oyuncunun onayını bekler.
5. Doğruysa seçili vagon makas üzerinden 400 ms ilerleme hissiyle üst trene katılır; diğer üç hat solar. Yeni turda seçenekler yeniden üretilir.

### 390×844 yerleşim

```text
      ┌───────────────────────────────────┐
 0–24 │          üst güvenli alan        │
24–72 │ B.1              2/9    [⚙] [⚒] │
72–200│ 🚂 [KİTAP]—[KAPAĞI]—[ ? ]       │
200–280 KAPAK + ? / anlam ipucu          │
280–312       son tamlama / durum        │
312–388       esnek boşluk               │
388–428       kapak tasarımı             │ önizleme
440–500 ╱────────── [ TASARIMI ]         │
508–568 ◉────────── [ ...      ]         │
576–636 ╲────────── [ ...      ]         │
644–704  ╲───────── [ ...      ]         │
752–808 [ Trene bağla ]      [İpucu]     │
810–844          alt güvenli alan        │
      └───────────────────────────────────┘
```

Her hat bütünüyle dokunulabilir normalde 60 px, kısa ekranda en az 48 px yüksekliğinde bir düğmedir. Ray çizgileri dekoratiftir; hit test çizgilerin üzerinde yapılmaz. Seçili durum yalnız renk değil, makas yönü ve çerçeveyle gösterilir.

### Veri ve türetme

`choices(target, rand)` veya `shuffle([target.word, ...target.distractors], rand)` kullanılır. Diğer alanlar: `prev.base`, `hint`, `phrase`. Doğru seçenek her zaman tam bir tane olmalı; normalize edilmiş tekrarlar veri hatasıdır. `distractors` eksikse hayali sözcük üretme; eldeki farklı seçeneklerle çalışıp geliştirme konsoluna veri uyarısı ver. Yeni alan yok.

### İpucu, zorluk, eğlence ve risk

- İpucu: aktif yanlış seçeneklerden birini eleyip çarpıla; varsa onun seçimini temizle. Eleme sırası tur başında sabitlenen seçenek sırasıdır. Yanlış denemeyle elenen seçenek için tekrar yardım harcanmaz. Hiç aktif yanlış kalmadığında `Doğru vagon hazır; bağla` göster, ipucunu pasifleştir. Core yardım tavanına daha önce gelinirse kalan seçenekler oyuncuya kalır (3 harfli cevapta en çok 2 eleme).
- Zorluk: karşılaştırma sürümünde her bölümde dört seçenek sabit. Zorluk verideki kelimelerin aşinalığı ve distractor benzerliğinden gelir. Sonraki deney için 3/4 seçenek yapılandırılabilir; varsayılan 4. Sayaç veya hareket hızıyla zorluk eklenmez.
- Eğlence: kelimeyi üretmek yerine tanımak kolay giriş sağlar; tren makası temayla doğrudan ilişkilidir. Tek karar ile gözle görünür vagon hareketi arasında kısa mesafe vardır.
- Risk: rastgele seçimle ilerlemek kolaydır; ipucu zayıfsa birkaç seçenek aynı derecede doğru olabilir. Başta görünen anlam ipucu ve güvenilir distractor yazımı şarttır. Hızlı bitirmeyi daha yüksek başarı olarak puanlamayın.

## v3 — Vagon Tamircisi

**Özet:** Kelimenin bütün parça blokları vagona yanlış sırayla yüklenmiştir; iki bloğun yerini değiştirerek kelimeyi onar.

### Çekirdek döngü

1. Hedef kelime 2–3 harflik parçalara ayrılır ve **bütün parçalar baştan dolu yuvalara** konur. Havuz, eksik harf veya ek sahte parça yoktur. Örnek `TASARIMI` → `TA | SA | RI | MI`; başlangıç `RI | TA | MI | SA` olabilir.
2. Oyuncu bir bloğa dokunur, ardından başka bloğa dokunur: ikisi 160 ms içinde yer değiştirir. Aynı bloğa tekrar dokunmak seçimi kaldırır. Kilitli blok seçilemez. Alternatif olarak blok başka bloğun üstüne sürüklenip bırakılabilir; dışarı bırakma iptal edilir. Ekleme/kaydırma değil, **iki yönlü takas** yapılır.
3. Her değişimde birleşik kelime ve ghost güncellenir. Örneğin `RITAMISA`. Ekran bütün harfleri sunduğu için görev harf seçmek değil, sözcüğün parçalarını zihinde sıralamaktır.
4. `Geri al` son takası geri çevirir. `Kontrol et` her zaman kullanılabilir; ilk karışık diziliş bile tam uzunluktadır. Doğruluk yalnız birleşik yazı üzerinden ölçülür, blok kimliklerinin özgün sırasına bakılmaz.
5. Yanlışta diziliş korunur; yanlış blokların hangileri olduğu otomatik söylenmez. Doğruda blok araları kapanır, tek kelime plakası olur ve yeni vagona bağlanır.

### 390×844 yerleşim

```text
      ┌───────────────────────────────────┐
 0–24 │          üst güvenli alan        │
24–72 │ B.1              2/9    [⚙] [⚒] │
72–200│ 🚂 [KİTAP]—[KAPAĞI]—[ ? ]       │
200–280 KAPAK + ? / anlam ipucu          │
280–312       son tamlama / durum        │
312–440       esnek boşluk               │
440–488           RITAMISA               │
500–564     [ RI ] [ TA ] [ MI ]         │ 96×64 blok
576–640     [ SA ]                       │
      │      1 → 2 → 3 → alt satır       │ yuva sırası
688–740 [Geri al]            [İpucu]     │
752–808        [ Kontrol et ]            │
810–844          alt güvenli alan        │
      └───────────────────────────────────┘
```

Parça alanı üç sütunlu, 96×64 px bloklarla çalışır; satır sonundan sonraki bloğu göstermek için küçük sıra numaraları `1, 2, 3, 4…` yuvaya yazılır. Blok taşınınca yuva numarası yerinde kalır. Alt satıra geçişte ince yön oku eklenebilir. Güncel veride en çok 5 blok iki satıra sığar; alan kaydırılmaz. Kısa ekranda blok yüksekliği 48 px olur.

### Veri ve kesin parçalama algoritması

Yalnız `target.word`, `prev.base`, `hint`, `phrase` gerekir; `distractors` kullanılmaz. Yeni alan yok; bunlar **harf parçalarıdır, hece oldukları iddia edilmez**.

1. `letters = Array.from(target.word)`. Başlangıçta `chunkSize=2`; kelime 14 harften uzunsa `chunkSize=3` kullan. Baştan bu uzunluklarda kes.
2. Sonda tek harf kalırsa önceki parçaya ekle. Böylece `KAPAĞI → KA | PA | ĞI`, `EKİBİ → EK | İBİ`, `TASARIMI → TA | SA | RI | MI` oluşur.
3. Üç harfli kelime için `ilk harf | kalan iki harf`, iki harfli kelime için iki tek harf kullan. Tek harfli hedef veya bütün permütasyonları aynı yazıyı veren kelime bu mekanikte oynanamaz; geliştirmede açık veri uyarısı ver, turda yardım mesajıyla `Kontrol et` üzerinden ilerlenebilsin. Mevcut zincirlerde bunun görülmemesi beklenir.
4. Kimlikli parçaları karıştır. Birleşik sonuç hedefle aynıysa hedeftekinden farklı yazılı iki parçayı bulup yer değiştir; en fazla bir düzeltme yeterlidir. Başlangıçta zaten çözülmüş bulmaca bırakma; yukarıdaki çözülemeyen veri istisnası hariç.
5. Bölüm 1–4 için karıştırma yerine özgün sırada farklı yazılı iki parçanın tek takası; bölüm 5+ için tüm parçaları karıştır. Başlangıç dizilişini geri dönüş için sakla.

### İpucu, zorluk, eğlence ve risk

- İpucu: soldan ilk kilitsiz yuvayı ele al. Orada özgün parçalama sırasındaki doğru metin yoksa, doğru metni taşıyan kilitsiz blokla takas et; sonra yuvayı kilitle. Zaten doğruysa yalnız kilitle. Tekrarlı metinde herhangi bir uygun blok geçerlidir. İpucu geri alma geçmişini temizler; kilitli çözüm geri alınamaz.
- **Yalnız admin actions içindeki** `Baştaki diziliş` kilitler yoksa ilk düzeni getirir. Kilit varsa yalnız kilitsiz blokları, ilk düzende sahip oldukları kimlik sırasıyla kilitsiz yuvalara dağıtır; kilitleri korur ve geri alma geçmişini temizler.
- Zorluk: önce tek takas, sonra tam karışık düzen; uzun kelimede daha çok parça. Sahte parçalar eklenmez; bu varyantın farkı bütün malzemenin hazır olmasıdır. Yardımların açtığı kilitler yeni turda sıfırlanır.
- Eğlence: çok sayıda harf yazmadan birkaç takasla büyük ilerleme; tanıdık kelime bir anda görünür hale gelir. Tahta blokların yer değiştirmesi dokunsal oyuncak hissi verir.
- Risk: yalnız iki parça varsa çözüm tek hamleye düşer; rastgele parçalar Türkçe hece gibi algılanabilir. UI her yerde `parça` der. Bu sürüm kısa kelimelerde rahat nefes, uzunlarda uzamsal sıralama sunar; v1 gibi havuzdan sırayla parça seçme davranışı eklenmemeli.

## v4 — Ray Çiz

**Özet:** 4×4 harf istasyonları arasında parmağını kaldırmadan komşu hücrelerden geç; aranan kelimenin rayını çizince vagon trene katılsın.

V1'den temel fark: herhangi bir harfi istediğin sırada seçemezsin; sonraki harf **yatay/dikey komşu** olmalı, bir hücre yalnız bir kez kullanılabilir. V3'ten fark: hiçbir blok taşınmaz. Serbest yazma, ekran klavyesi ve metin input yoktur.

### Çekirdek döngü ve kesin hareket kuralları

1. Üstte `prev.base + ?` ve `target.hint`; altta sabit 4×4 tahta harf plakaları bulunur. Her hücre ayrı kimlik taşır. Cevabın harf sayısı küçük bir `0 / N` göstergesiyle belirtilir; cevap yolu önceden görünmez.
2. Herhangi bir hücrede `pointerdown` yeni ray başlatır, hücrenin harfi seçilir. Pointer capture alınır. Tek etkin pointer takip edilir; diğer parmaklar yok sayılır. İlk harf başlangıçta bedava işaretlenmez.
3. Parmağın merkezi başka bir hücrenin dokunma alanına girdiğinde son hücreyle Manhattan uzaklığı 1 ise seçime eklenir. Çapraz hücre, boş aralık, komşu olmayan hücre veya daha önce ziyaret edilmiş hücre yeni harf eklemez. Toplam seçim hedef harf sayısını aşamaz.
4. **Geri izleme:** bir önceki hücreye dönmek son hücreyi çıkarır. Aynı hareketle birkaç hücre geri alınabilir; fakat daha eski bir hücreye atlamak yolu kesmez. Mevcut son hücrede beklemek işlem yapmaz. Çizili ray hücre merkezlerini bağlar, son noktadan parmağa uzanan ince önizleme çizgisi harf seçimi sayılmaz.
5. Canlı birleşik kelime ve `k / N` üst önizlemede görünür, seçilen hücrelerde sıra numarası vardır. Yeni hücrede hafif titreşim; hareket olayı başına titreşim yoktur. Harfler animasyon sırasında veya yanlışta yer değiştirmez.
6. **Parmağı kaldırınca kontrol:** N hücre seçilmişse `answer(state, selectedLetters.join(''))` bir kez çağrılır. N'den azsa hata saymadan ray temizlenir, kısa `N harfi birbirine bağla` mesajı gösterilir. Gönder düğmesi yoktur. Parmak tahta dışında bırakılmışsa da aynı kural geçerlidir; `pointercancel`, pencere odağı kaybı veya admin açılışı ise denemeyi saymadan iptal eder.
7. Yanlış tam yolda mercan ray + kısa hata titreşimi, 250 ms sonra seçim temizlenir; tahta aynı kalır. Doğruda minik bir yük vagonu çizili ray üzerinde en fazla 350 ms ilerler, ardından ortak üst tren vagon ekleme animasyonu tamamlanır. Toplam geçiş 550 ms; hareket azaltmada ray parlaması yeterli.

**Hızlı kaydırma ayrıntısı:** pointer capture varken `event.target` yeni hücreyi vermez; tahta koordinatlarından hit test yap. `getCoalescedEvents()` varsa olayları sırayla işle. Ardışık koordinatlar arasında en fazla 8 px aralıklı örnekler al ve her örnekte aynı komşuluk kuralını çalıştır; böylece hızlı yatay/dikey çizgide aradaki hücre atlanmaz. Izgara hücrelerinin gerçek kutuları arasındaki 8 px boşluk seçim yapmaz. Çapraz harekette kullanıcı bir yatay/dikey komşunun kutusundan gerçekten geçmedikçe ara hücre otomatik eklenmez. Yerleşim değişirse/telefon dönerse aktif hareket iptal edilir, hücre koordinatları yenilenir.

### 390×844 yerleşim

```text
      ┌───────────────────────────────────┐
 0–24 │          üst güvenli alan        │
24–72 │ B.1              2/9    [⚙] [⚒] │
72–200│ 🚂 [KİTAP]—[KAPAĞI]—[ ? ]       │
200–280 KAPAK + ? / anlam ipucu          │
280–312       son tamlama / durum        │
312–400       esnek boşluk               │
400–440          TAS…  3/8               │ canlı seçim
452–732   [ T ]—[ A ]—[ S ]  [ E ]      │ 64 px hücre
      │   [ I ]  [ M ]  [ A ]  [ K ]   │ aralık 8 px
      │   [ E ]  [ I ]  [ R ]  [ D ]   │ 4 × 4, 280 px
      │   [ N ]  [ L ]  [ O ]  [ U ]   │
752–808                    [ İpucu ]    │ 112×56 düğme
810–844          alt güvenli alan        │
      └───────────────────────────────────┘
```

Örnekte çözüm koordinatları (satır/sütun, sıfır tabanlı): `(0,0)→(0,1)→(0,2)→(1,2)→(2,2)→(2,1)→(1,1)→(1,0)` = `TASARIMI`. Izgara yatay ortalanır, hücreler 64×64 px. Kısa ekranda 48×48 px + 8 px aralıkla 216×216 px; alan alt kontrolün hemen üstünde durur. Her hücre bir harf ve seçildiğinde küçük sıra rozeti taşır; parmağın örttüğü harf üst önizlemede de okunur. İlk turun yalnız ilk hareketine kadar `Komşu harflerden ray çiz` küçük oyun içi jest açıklaması gösterilebilir; kalıcı başlık/slogan değildir.

### Veri ve çözülebilir tahta üretimi

`target.word` yolun harfleri/uzunluğu; `prev.base`, `hint`, `phrase` ortak kullanım. `distractors` kullanılmaz. Ek veri alanı veya core değişikliği yok. Tahta üretimi v4 içinde saf bir yardımcıyla yapılır; UI durumu `{ cells, solutionPath, selectedIds, hintPrefix, pointerId }` core state dışında tutulur.

1. `N = Array.from(target.word).length`; güncel veri N=3–11, 16 hücreye sığar. Hücre kimliği `row * 4 + col`. Yalnız dört yönlü komşuluk.
2. Seed'li RNG ile başlangıç hücrelerini karıştır; derinlik öncelikli aramada ziyaret edilmemiş komşuları seed'li karışık sırada gez. N farklı hücreye ulaşınca dur. Arama bütçesi toplam 2.000 düğüm genişletme; çıkmazda geri dön. İlk 4 bölümde aşağıdaki fallback yolu doğrudan kullanmak daha okunur giriş sağlar; 5+ bölümde arama kullanılır.
3. Bütçe aşılırsa **garantili fallback:** 4×4 satır yılanı `0,1,2,3,7,6,5,4,8,9,10,11,15,14,13,12`. Seed ile yatay/dikey yansıt ve isterse ters çevir; ilk N hücreyi al. Her dönüşüm komşuluğu korur. Hedefin harflerini yol sırasıyla yerleştir; `solutionPath` yardım için saklanır. Rastgele harf döşeyip tesadüfen çözülebilmesini bekleme.
4. Kalan hücreleri Türkçe alfabeden seed ile doldur. Bölüm 1–4'te hedefte bulunmayan harflerden seç; 5–8'de tüm alfabeden; 9+ bölümde hedef harfleriyle karışık bir havuzdan seç (her dolgu için %50 hedef harfi, %50 alfabe). Eş harfler farklı hücre kimlikleridir.
5. Denetimde **yazılan sözcük** esas alınır: kurallara uygun başka bir yol aynı `target.word` oluşturursa kabul edilir. Tek çözümlü ızgara şart değil. Yardım saklanan bir geçerli yolu gösterir, diğer geçerli yolları yasaklamaz.
6. Yeni turda üret, yanlışta aynı tahtayı koru. Admin'deki `Tahtayı yeniden üret` yeni seed ile tahta + yerel yardım vurgusunu yeniden üretir; core state ve sayaçları değiştirmez, mevcut `state.revealed` kadar yeni yol hücresini vurgular. `Yolu göster` tam rotayı yalnız admin içinde önizler; oyun alanına kalıcı çözüm bindirmez.

### İpucu ve geri bildirim

- `İpucu` etkin bir sürükleme sırasında pasif. Dokununca `useHint(state,'letter')`; fresh true ise `hintPrefix = reveal.count`. Saklanan `solutionPath` üzerindeki ilk `hintPrefix` hücre küçük sıra rozetleri ve altın kesikli rayla kalıcı gösterilir. İlk yardım başlangıç hücresini, ikincisi ilk bağlantıyı vb. açar; son hücre açık edilmez.
- Yardım oyuncunun seçimine harf eklemez ve rayı otomatik çizmez. Oyuncu başlangıçtan parmağıyla yolu çizer; gösterilen yolu izleyebilir veya başka geçerli bir yol bulabilir. İpucu sayacının her artışı bir yeni yol hücresini açar, max N−1; sonra düğme pasifleşir.
- Vurgular yanlışta korunur, yeni hedefte sıfırlanır. Yardım rotası soluk/kesikli; aktif oyuncu rotası koyu/düz çizgiyle ayrılır. Bu ayrım renkten bağımsız okunur.

### Zorluk, neden eğlenceli, riskler

- Zorluk önce az kıvrımlı yılan yolu ve farklı dolgu harfleri, sonra kıvrımlı arama yolu ve benzer harfler. Tahta boyutu 4×4 sabit; süre baskısı yok. N büyüdükçe iz sürme ve kelimeyi zihinde tutma yükü artar.
- Eğlence: bir kelimeyi bulmak aynı anda fiziksel bir ray döşemeye dönüşür. Tek kesintisiz hareket ve rayda yürüyen minik vagon tren temasının ödülünü doğrudan verir. Hem anlamı çözmek hem olası harf komşuluklarını görmek gerekir.
- Risk: parmak harfi kapatır; üst canlı önizleme ve 64 px hücreler bunu azaltır. Çapraz geçiş kuralı öğrenilmelidir; çapraz girişte seçim yapılmaz, gereksiz hata sayılmaz. Hızlı kaydırmada atlanan olaylar segment örneklemesiyle giderilir. Yanlışlıkla kaldırılan kısa yol cezasız sıfırlanır. Geri izleme ve pointercancel davranışı özellikle doğrulanmalı.

## Karşılaştırma ve önerilen sıra

| Varyant | Oyuncunun asıl işi | Cevap malzemesi | Temel hareket | Göreli yük | Başlıca risk |
|---|---|---|---|---|---|
| v1 Harf Sandıkları | Harflerden kelime kurma | Serbest seçilen karışık harfler | Dokun, doldur, onayla | Orta | Uzun kelimede çok dokunma |
| v2 Doğru Makas | İpucundan doğru kelimeyi tanıma | Dört tam kelime | Hat seç, bağla | Düşük | Tahminle ilerleme |
| v3 Vagon Tamircisi | Parça sırasını onarma | Başta dolu parçalar | İkili takas, onayla | Orta | Kısa kelimede aşırı kolaylık |
| v4 Ray Çiz | Kelimeyi komşu harflerde izleme | Sabit 4×4 harf ızgarası | Kesintisiz sürükle, bırak | Orta/yüksek | Parmakla örtme, komşuluk kuralı |

**İlk kullanıcı deneme sırası: v2 → v1 → v3 → v4.** Önce tamlama/vagon döngüsü, ardından kelime kurma, parça onarımı ve son olarak komşuluk kuralı öğrenilir. Aynı bölümü tekrar etmek cevapların hatırlanmasına yol açar; birden çok testçide varyant sırası döndürülmeli.

**Ana oyun adayı sıralamam: v4 → v1 → v2 → v3.** v4 tek parmakla ray çizme ve tren ödülünü birleştirdiği için mobilde ilk adayım; olay yakalama ve komşuluk anlaşılabilirliği test edilmelidir. v1 daha bağışlayıcı kelime kurma, v2 en erişilebilir giriş, v3 kısa sözcüklerde sınırlı parça bulmacasıdır. Bu sıralama tasarım tahminidir.

Kabul kontrolü: 390×844 ve 360×640'da sayfa/oyun alanı kaymıyor; güvenli alanlar korunuyor; tüm hedefler en az 48 px; HUD'da başlık/slogan yok; tek admin ikonu bütün debug eylemlerini topluyor; yazma/klavye mekaniği yok; KAPAĞI→KAPAK geçişi doğru; tekrar eden harfler korunuyor; eksik seçim hatasız; yardım yalnız fresh true iken uygulanıyor; doğru cevap tek vagon ekliyor; sonraki bölüm çalışıyor. V4 ayrıca bütün hedeflerde seed'li çözülebilir yol, komşuluk/tek ziyaret, geri izleme, hızlı kaydırma, alternatif doğru yol ve pointercancel açısından kontrol edilmeli.
