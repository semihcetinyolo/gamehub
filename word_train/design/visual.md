# Word Train — görsel sözleşme

## Level end — kompakt peron kartı (güncel)

Kullanıcının son kararı: sonuç telefon üzerinde **içeriği kadar büyüyen bir
popup** olmalı. Aşağıdaki düzen eski tam ekran alt yüzeyini, sürekli açık
“Son bağlantılar” panosunu ve düğmelerin üzerindeki esnek boşluğu geçersiz kılar.
Orman & Pirinç renkleri, gerçek trenle ortak istasyon fikri ve giriş bekletmeme
kuralı korunur.

**Seçilen tek yön: kompakt peron.** Canlı tren, sonuç kartının 144px yüksekliğindeki
üst peronuna yanaşır. Aynı kartın hemen altında başlık, tek satır istatistik ve
kontroller bulunur; tren üstte ayrı, sonuç altta ayrı iki olay olmaz. Ek bir
lokomotif kopyası çizilmez. Telefonun arkasındaki oyun karartılır.

Referans maketler: `design/compact-end-mock-390.png`,
`compact-end-mock-1280.png`; bağlantılar açılmış durum:
`compact-end-mock-open-390.png`, `compact-end-mock-open-1280.png`.
Review uygulaması `compact-end-mock.css` ve `compact-end-mock.js`; bunlar oyun
runtime'ına yüklenmez. Üretim karşılığı core/levelend.js ve core/levelend.css'tir.

### Yerleşim ve ölçüler

- Overlay tüm ekran, zemin `#08170db3`; telefonda yatay ortalı, alt kenarda
  `max(16px, env(safe-area-inset-bottom))` boşluk. Üst safe-area da korunur.
- Kart `width:min(100%,376px)`, içerik yüksekliği, `max-height:100%`;
  kenar payı16px, köşe12px, ince `--wt-border`, yüzey `--wt-paper`.
  390×844'te kapalı örnek **358×364px**, x16/y464. Büyük ekranda (>=600px)
  iki eksende ortalanır,24px dış pay; **376px genişliği aşmaz**.
  1280×800 örneği376×364px, x452/y218. Esnek dikey dolgu yok.
- Üst peron144px. Canlı train.el bu bölüme taşınır; eski yerinde ölçü koruyan
  geçici placeholder kalır. Kapatılınca özgün parent/sibling/style'a dönülür.
  Train'in eski sayfa inert durumunu miras almaması sağlanır.
- Üstte kalın çatı/direkler yok, peronun alt temas çizgisi kalır. Sağ üstte
  174×42px sessiz tabela:9px durak etiketi,16px Georgia durak adı;
  `--wt-stage-ink`, zemin/çerçevesiz. Lokomotif üst rayda **sağa bakar**.
- Gövde14px iç pay. Kısa başlık23/28px Georgia400. Son tamlama ayrıca büyük
  hap olarak tekrarlanmaz; trendeki iki vagonda okunur.
- İstatistik48px tek satır: **“5 bağlantı ⌄ · 0 hata · 0 yardım”**;13px.
  Bağlantı sayısı48px dokunma hedefli disclosure button'dır. Başlangıçta son
  bağlantılar kapalıdır; açınca son3 tamlama25px satırlarla görünür ve kart
  yalnız gereken kadar büyür. Gereksiz ikinci başlık yok. `aria-expanded`,
  `aria-controls`, klavye odağı ve focus trap kapsamı sağlanır.
- Ana eylem52px, alttaki iki ikincil eylem48px yanyana, aralık8px.
  Normal: “Sonraki bölüm” / “Tekrar oyna” + “Bölümler”. Son bölüm: next yok,
  “Tüm bölümleri tamamladın.” kısa not ve mevcut bölüm listesi/tekrar eylemleri.
- İçerik gerçekten taşarsa yalnız orta metin alanı kayar, kontroller görünür
  kalır. Açık receipt otomatik gizlenmez veya kapalı receipt açılmaz.
  Dar yatay ekran gibi istisnada peron118px olabilir. Metin %200 büyütmede
  gövde scroll'u tercih edilir; düğme boyu48px altına inmez.

### Zaman çizelgesi / ortak bileşen

| Son yanıttan süre | Görünen olay / etkileşim |
| --- | --- |
| 0ms | Son bulunan çift korunur; ortak sonuç yaşam döngüsü başlar, tahta pasifleşir. |
| 0–260ms | Karartma ve kart12px yukarı kayarak yumuşak görünür; ayrı sayfa hissi yok. |
| 0–360ms | Tren aynı DOM ile perona alınır; mümkünse eski/son geometri arasında FLIP. Placeholder tahta zıplamasını önler. |
| 180–600ms | Sonuç metni ve eylemler yerleşir; tüm düğmeler en geç600ms'de aktif. |
| 600–1100ms | Lokomotif peronda sakin yanaşmasını tamamlar; eylemler beklemez. |
| Her aktif dokunuş | Devam eden görsel hareket son kareye gider ve **aynı dokunuş** seçilen eylemi çalıştırır. |

Reduced-motion'da FLIP/kayma yok; kısa solma ve160ms aktif eylemler.
Boyut değişince dock sınırları anında yeniden ölçülür. Kapanışta observer,
RAF, timer ve animasyonlar iptal edilir; tren yerine alınır ve inert/focus
önceki oyuna uygun geri yüklenir. Eski `place()` fonksiyonu kaynak sahnenin
viewport altını gövdenin `top` değeri yapamaz; kart yerel düzendir.

Doğrulama matrisi: **v4 + demo** için390×844@3x mobil emülasyon,
375×667,430×932,360×640,1280×800 masaüstü,820×1180 tablet.
Kontrol: kart<=376px, dolgu boşluğu yok, actions>=48px,600ms erişim,
tek dokunuş/yeniden açma/son bölüm/reduced motion, sayfa taşması ve konsol.

### Kompakt kart — üretim doğrulaması

Core sahibi ortak `core/levelend.js` / `.css` uygulamasını yaptı. Aşağıdaki
kareler **maket CSS/JS enjeksiyonu olmadan**, gerçek v4/demo üzerinden alındı.
Dosya kalıbı: `design/compact-end-final-{v4,demo}-{GENİŞLİK}x{YÜKSEKLİK}-closed.png`.

| Ekran | Emülasyon | Sonuç kartı (CSS px) |
| --- | --- | --- |
| 390×844 | mobil, touch, DPR3 (PNG1170×2532) | 358×364 |
| 375×667 | mobil, touch | 343×364 |
| 430×932 | mobil, touch | 376×364 |
| 360×640 | mobil, touch | 328×364 |
| 1280×800 | masaüstü | 376×364 |
| 820×1180 | tablet, touch | 376×364 |

Her iki modda aynı ölçüler.360×640 ve1280×800 için ayrıca `-open.png`
(bağlantılar açık,463px yükseklik) ve `-last.png` (son bölüm,392px) var.
Kontrollerin merkezine hit-test geçti; ana52px, ikincil48px ve bağlantı
kontrolü48px. Sayfa taşması yok. Kapatıp sonraki bölüme geçince yalnız bir
tren kalıyor, asıl main'e dönmüş ve inert kaldırılmış oluyor.

`design/compact-end-checks.json`:12 ekran +8 açık/son bölüm karesi,
ölçü/hit-test/restore hatası0. Konsolda görülen kaynak404'leri ayrı tekrar
kontrolünde tarayıcının `/favicon.ico` isteğine ait; JavaScript çalışma hatası
yok. Bu ağ kaydı gizlenmemiştir.
`design/compact-end-interactions.json`: gerçek tek touch ile sonraki bölüm,
tekrar, disclosure ve focus trap; açıkken390→360 resize, normal/reduced
motion iki modda geçti. Aktif eylem ilk RAF ölçümü normal608–617ms,
reduced168–174ms (timer hedefleri600/160ms). Dokunuş animasyonu bitirip aynı
olayda eylemi çalıştırıyor. Son bölümde next yok.

`design/compact-end-frame-{0,180,360,600,1100}.png`390@3x hareket kontrolü:
aynı canlı tren eski sahneden kart peronuna iner, son küpler yerleşir ve
lokomotif yanaşır. Dosya adları hedef örnekleme zamanlarıdır; gerçek örnekleme
zamanları `compact-end-sequence.json` içinde. Sonucu okumak/eyleme geçmek
lokomotifin son hareketini beklemez. Orman & Pirinç AA metin renkleri aynen
korundu; önceki palet kontrast raporu geçerlidir.

## Güncel palet — Orman & Pirinç

**Son kullanıcı düzeltmesi:** yetişkin model lokomotifin rengi beğenildi;
oyunun geri kalanı fazla açık bulundu. Lokomotif aynen korunur. **Ceviz &
Fildişi'nin malzeme/oran/tipografi kararı geçerli, açık ekran paleti geçersizdir.**
Yeni varsayılan bütün uygulamada sıcak koyu **Orman & Pirinç** paletidir.

İki390×844 karşılaştırma: `design/palette-forest-game.png` ve
`palette-forest-end.png`; alternatif `palette-walnut-game.png` ve
`palette-walnut-end.png`. **Orman & Pirinç seçildi:** yeşil emaye lokomotifin
kimliğini ekrana taşır, koyu ceviz seçeneğinden daha canlıdır. Gece Ekspresi'nin
laciverti kullanılmaz. Harfler ve küçük metinler sıcak fildişi; ekran, tahta,
paneller ve sonuçlar doygun koyu yüzeylerdir. Bu bir dark-mode düğmesi değil,
oyunun yeni varsayılan kimliğidir.

| Semantik token | Değer | Rol |
| --- | --- | --- |
| `--wt-cream` | `#263D33` | Eski adı korunmuş **koyu ekran** zemini |
| `--wt-paper` | `#334D3F` | HUD dışındaki yükseltilmiş yüzeyler, sheet ve sonuç |
| `--wt-sand` | `#1F332A` | Petek yatağı / koyu girintili yüzey |
| `--wt-ink` | `#F5EDD8` | Koyu ekran üstünde açık metin |
| `--wt-muted` | `#C6CFBC` | Yardımcı açık metin; düşük opaklık kullanılmaz |
| `--wt-primary`, `--wt-gold` | `#D4BC86` | Pirinç ana düğme, istatistik/vurgu |
| `--wt-on-accent` | `#23392E` | **Pirinç düğme/rozet üstünde koyu yazı** |
| `--wt-tile-top` / bottom | `#F1EAD7` / `#DED2B4` | Fildişi harf yüzü |
| `--wt-tile-ink` | `#263B30` | **Fildişi taş üstünde koyu harf** |
| `--wt-tile-edge` | `#AD9B73` | Koyu petek yatağından ayrılan taş sınırı |
| `--wt-stage` | `#8C957E` | Lokomotifi ayıran orta ton zeytin-gri sahne |
| `--wt-stage-ink` | `#1B2E21` | Sahnedeki sayı/gereken koyu yazı |
| `--wt-border` | `#72806B` | Yüzey sınırı / ayırıcı |
| `--wt-danger` / light | `#F0B5A0` / `#65473B` | Hata metni / koyu hata yüzeyi |

Geriye uyum için `--wt-sage-dark` artık pirinç vurguya eşlenir. **Koyu yeşil
gibi varsayılıp fildişi taş harfine veya seçili yüzeye uygulanmamalıdır.**
Ekran yazısı, taş harfi ve vurgu üstü yazı ayrı semantik değişkenlerdir.
Normal UI/başlıklar `--wt-ink`; bütün harf taşları `--wt-tile-ink`; pirinç
eylem veya aktif bölüm numarası `--wt-on-accent` kullanır.

Trenin üstünde orta ton bir sahne gerekir: aynı koyu yeşil modelin koyu
yeşil ekrana gömülmesine izin verilmez. Siluet, pencere, pirinç bant ve ceviz
şasi burada okunur. Bu sahne kendi mevcut yüksekliğini kullanır, daha büyük
bir hero alanı olmaz. Ray yatak/oluk/iç çizgi renkleri sırasıyla`#6B715F`,
`#344A3B`,`#B8B89A`; kesikli ileri yol`#4A5E49`.

Petek yüzleri fildişi kalır; seçili yüz soluk yeşil`#AECAAD→#91B291` ve
harf`#1F3A2A`. Doğru yüz koyu yeşil`#406557→#315448`, harf`#FAF4DF` ve
pirinç kenar. Yanlış yüz`#E8B49B→#D3A188`, harf`#562D25`; ipucu yüzü
`#F3DE9D→#DDC585`, harf`#3E3522`, kesikli pirinç sınır. Seçim rayının
8px yatağı`#263C2D`,4px iç çizgisi`#F5E5B2`; harflerin altında kalır.
İpucu rayı noktalı, yanlış ray kesikli; durum yalnız renkle anlatılmaz.

Koyu tema kapsamı: **v4, demo, picker, HUD, alt kontroller, ipucu bandı,
admin/bölüm listeleri ve ortak sonuç istasyonu**. Sonuç tabelası koyu yeşil
emaye ve pirinç çerçeve (`assets/station-sign.svg`); beyaz tabela üstüne açık
yazı yazılmaz. Son tamlama etiketi pirinç + koyu yazı. Sonuç bilet panosu koyu
ekran yüzeyi, başlıklar fildişi; son satır açık ve onaylı, son bağlantı noktası
pirinçtir. Daha önceki `adult-atelier-*` açık palet referansları bu değişiklik
öncesindeki çalışmadır; yeni referans `palette-forest-*` ve gerçek son
ekranlar `design/palette-final-*`.

Core'a: `levelend.css` metin/yüzey tokenları; `admin.js` aktif numara
`--primary/--on-accent`, fixed krem/dark-ink kaldırma; `demo.html` meta theme
color`#263D33` ve bütün seçenek/durum renklerinin tokenla uyumu bildirildi.
V4'e: panel`--sand`, bölüm numarası`--primary/--on-accent`, done/current
numara`--sage-light/--ink`, meta theme color bildirildi. Orkestratörün
`index.html` picker'ında numara`--primary/--on-accent`, ağırlık600; alt
açıklama`--muted`400, kart`--paper/--ink`, meta theme color`#263D33`.

Boyut, safe-area,48px kontroller, yatay vagonlar ve600ms sonuç eylemleri
değişmez. Renk doğrulaması yeni paletin en zayıf gradient ucuna göre yapılır;
eski açık palet AA sayıları bu yeni paletin kanıtı değildir. Son sonuçlar
`design/palette-checks.json`;390×844/360×640 v4, demo ve bölüm sonu kareleri
ayrı kaydedilir. Reduced-motion davranışı aynen korunur.

### Son gerçek ekran kontrolü — Orman & Pirinç

Ek stil enjeksiyonu olmadan üretim dosyalarıyla çekildi:

- V4: `design/palette-final-v4-390.png`, `palette-final-v4-360.png`.
- Seçili yol: `palette-final-drag-390.png`, `palette-final-drag-360.png`.
- İpucu bandı: `palette-final-clue-390.png`, `palette-final-clue-360.png`.
- Ortak sonuç: `palette-final-end-390.png`, `palette-final-end-360.png`;
  son bölüm: `palette-final-last-390.png`, `palette-final-last-360.png`.
- Demo: `palette-final-demo-390.png`, `palette-final-demo-360.png`;
  demo sonucu: `palette-final-demo-end-390.png`, `palette-final-demo-end-360.png`.
- Admin ve picker: `palette-final-admin-{390,360}.png`,
  `palette-final-picker-{390,360}.png`.

390×844 ve360×640'ta sayfa taşması/konsol hatası yok; görünen UI eylemleri
en az48px, sonuç düğmelerinden yeni bölüme geçiş başarılı. Tren taşı yazısı
Arial600, aktif varlık `locomotive-model.svg`. Demo başlangıç görüntüsü giriş
animasyonu bittikten sonra alınmıştır; animasyonun ara karesi kadraj hatası
gibi değerlendirilmez. Küçük ekranda ipucu açıkken önceki tek-satır tren kuralı
geçerlidir: aranan çift görünür, daha eski araçlar solda kadraj dışında kalabilir.

Ölçülen kontrastlar: gövde metni**7.91:1**, yardımcı metin**5.74:1**, ana
düğme**6.68:1**, normal taş**7.99:1**, seçili**5.29:1**, doğru**5.93:1**,
yanlış**5.13:1**, ipucu**7.14:1**. Küçük sahne sayısı**4.60:1** (opacity1);
taş sınırının koyu yataktan ayrımı**4.93:1**. Rapor
`design/palette-checks.json`:11 kontrast kontrolü geçti, ekran/dokunma
kontrolünde hata yok. Eski `adult-checks.json` açık paletin ara kontrolüdür;
bu rapor onun yerine geçer. Tüm SVG'ler XML olarak geçerli; mevcut eski
referanslar dahil varlık toplamı yaklaşık43KB,300KB sınırının altındadır.

Core'un son geometrisinde model lokomotifin teker merkezi kaynaktaki
oranı nedeniyle **lokomotif** `p.y+7k`, **vagon** `p.y+4k` kullanır; ikisinin
teker merkezi aynı ray üst çizgisinde kalır. Üst satırda gidiş yönü sağdır,
lokomotif sağa bakar. Tabela üretimde CSS tokenlarıyla çizilir;
`station-sign.svg` eşdeğer küçük alternatif varlık olarak tutulur.

## Güncel sanat yönü — yetişkinler için Ceviz & Fildişi

**21 Ekim 2026 son kullanıcı kararı:** oyun yetişkinlere yöneliktir. Aşağıdaki
eski bölümlerde geçen “tatlı oyuncak”, “gülen yüz”, “tombul küp”, pastel renk
çeşitliliği ve eski bölüm sonu çizimleri artık görsel hedef değildir. DOM,
satır akışı, yatay okunurluk, tamlama çifti, ek düşmesi, petek ve ortak sonuç
istasyonu korunur. Bu bölüm malzeme, oran, renk, tipografi ve hareket
genliğinde daha eski tariflerin önüne geçer.

### Üç yön ve seçim

Her yön aynı gerçek v4 ekranında ve ortak bölüm sonu bileşeninde390×844 olarak
maketlendi. Kaynak renk/stil karşılaştırması `design/adult-directions.css`;
altı görseli birlikte açmak için `design/adult-directions.html`.

| Yön | Oyun maketi | Bölüm sonu maketi | Karar |
| --- | --- | --- | --- |
| **A · Ceviz & Fildişi** | `design/adult-atelier-game.png` | `design/adult-atelier-end.png` | **Seçildi.** Ceviz platform, koyu yeşil emaye, pirinç ve fildişi harfler. Sıcaklık ve model demiryolu kimliği korunur; güçlü gündüz kontrastı, sakin görsel hiyerarşi. |
| B · Gece Ekspresi | `design/adult-night-game.png` | `design/adult-night-end.png` | Lacivert zemin, bakır/pirinç vurgusu. Karakterli ama bütün oyunu daha ağır ve koyu gösteriyor. Varsayılan olmadı; ayrı bir gece teması bu işin kapsamı değil. |
| C · Emaye Hat | `design/adult-enamel-game.png` | `design/adult-enamel-end.png` | Kırık beyaz, arduvaz mavisi ve çok sade yüzeyler. Okunur fakat ceviz/model demiryolu kimliği daha zayıf. Seçilmedi. |

Yetişkin hissini küçük harfler veya düşük kontrast üretmez. Harfler büyük
kalır; değişen şey renk sayısı, yüzey kalınlığı, çizgi hassasiyeti ve oranlardır.
Tren minyatür bir demiryolu modeli, harfler kaliteli oyun taşları gibi görünür.
Yüz, göz, şeker renkli küpler, şişen harf, sürekli baloncuk duman ve kalın
oyuncak düğme gölgeleri kullanılmaz.

### Palet, tipografi ve yüzey

| Rol / token | Değer | Kullanım |
| --- | --- | --- |
| `--wt-cream` | `#F1EEE5` | Sıcak kâğıt zemin, ekranın tamamı |
| `--wt-paper` | `#FAF8F1` | Fildişi yüzey, buton/sonuç istasyonu |
| `--wt-ink` | `#293830` | Bütün normal yazı ve harfler |
| `--wt-muted` | `#66685B` | Yardımcı metin, HUD bölüm adı |
| `--wt-sage-dark` | `#315448` | Ana eylem, emaye yeşili |
| `--wt-wood` / edge | `#9A7E58` / `#796247` | Ceviz platform; harflerin yüzü ceviz kadar koyu değildir |
| `--wt-gold` | `#A18A5A` | Pirinç detay, çok küçük vurgu; normal gövde yazısı değil |
| `--wt-pair-gold` | `#8F7747` | Tamlama kancası |
| `--wt-metal` | `#414B42` | Teker, şasi, ince metal aksam |
| `--wt-border` | `#C6C0AE` | Dekoratif ayırıcı; okunması gereken tek bilgi bu çizgiye bağlı değildir |

Arayüz ve harf taşları: **Arial, Helvetica, system-ui, sans-serif**;600 ağırlık,
gerektiğinde yardımcı metin400/500. Sistem fontlarıyla offline çalışır, ek font
indirilmez. Türkçe `İ I Ğ Ş Ç Ö Ü` ve alt/üst aksanlar korunur; büyük harfe
çevirme `toLocaleUpperCase('tr-TR')`. Harf taşında minimum okuma ölçüleri
değişmez; serif harf veya dekoratif stencil kullanılmaz.

İstasyon adı ve bölüm sonu başlığı için **Georgia, Times New Roman, serif**,
400 ağırlık; oyun ekranına büyük bir tanıtım başlığı eklenmez. Sonuç başlığı
390'ta27px,360'ta23px. UI kontrolleri15px600; alt düğmeler48–56px. Köşeler
harf taşında3px, butonda6px, panelde8px, sheet'te12px; gölgeler1–3px ve
düşük opaklıktadır. Ahşap damarı ince ve düşük kontrastlı; harflerin arkasında
gözü oyalayan çizgiler yoktur.

### Yeni tren varlıkları ve geometri

- **`assets/locomotive-model.svg`**:128×80, burnu sola; uzun kazan, düz kabin,
  küçük baca, gerçek bir pencere, koyu yeşil emaye, pirinç bantlar ve ince
  bağlantı kolu. Yüz/karakter yok. Gidiş yönüne göre yalnız lokomotif aynalanır.
  Eski `locomotive-toy.webp/.svg` tarihsel dosyalardır; aktif tema kullanmaz.
- **`assets/flatcar.svg`**:120×20 esneyen ceviz kalas + koyu metal alt şasi,
  ince2px uç yarıçapı ve iki bağlantı bandı. Harfler platformun üstündedir.
- **`assets/wheel.svg`**:26×26 kaynak, üretimde22k; ince metal çember, tel/spok
  detayı ve küçük pirinç göbek. Eski büyük ahşap düğme görünümü kalkar.
- **`assets/coupler.svg`**: ince metal bağlantı. Tamlamanın kancası var olan
  SVG çizgisinde pirinç vurgu taşır; yeni uzun çubuk eklenmez.
- **`assets/block-grain.svg` / `letter-block.svg`**: ince damar ve düz fildişi
  yüzey. Bütün `data-tone` değerleri aynı malzemeyi kullanır; rastgele pastel
  renkler kalkar. Yüz3px köşe,1px kenar ve yalnız1–2px kalınlık hissi.
- **`assets/station-platform.svg` / `station-sign.svg`**: aynı ceviz/demir
  peron, köşeleri3px emaye tabela, ince pirinç çerçeve. SVG içinde yazı yoktur.

Opus-core'a verilen ölçüler (`k` mevcut tren yüksekliği ölçeği): lokomotif
128k×80k; vagon68k; harf alanı36k; güverte18k, bottom14k; teker22k, bottom0;
dış teker6k, iç teker31k. Böylece güverte üstü36k'de, harflerin tam altındadır.
Satır pitch78k (68+10). Ray yatak/oluk/iç çizgi14/8/4k; ileri yol2k,7/8k
kesik. Teker merkezinin ray üst çizgisine değmesi için araç altı `p.y+4k`;
kanca orta çizgisi `p.y−19k`. Fiziksel harf eni min20px/18px ve çiftin
yan yana kalma kuralları değişmez. Bu ölçüler theme'in sahip olmadığı
`train.css/train.js` dosyalarında opus-core tarafından uygulanır.

Baca buharı idle döngü yapmaz; yalnız hareket sırasında ufak ve soluktur.
Yeni lokomotif kutusunda baca konumu yaklaşık x25k/y14k; buhar başlangıcı
x25k/y7k,8×6k. HUD'un altında yüzüyormuş gibi duran büyük beyaz balon yoktur.
Doğru cevap/ek düşme görünür kalır; oturuş veya kenetlenme genliği1–2px.
Oyuncuyu bekletmeme kuralı aynı; sakin yetişkin yönü için süreler zorla
hızlandırılmaz. Yeni taşın yerinde yenilenmesi için aşağıdaki **çeşitli
yenileme** tarifi kullanılır (.86→1.015→1), patlayan pop efekti yoktur.

### Petek ve mobil arayüz

5×6 petek ve hücre ölçüleri değişmez. Normal taş üstü`#FAF8F1`, altı`#EAE4D5`,
kenarı`#8F866F`; harf`#293830`. Seçili taş soluk yeşil (`#DFE8DD→#C8D5C6`),
koyu harf`#293F31`. Doğru taş koyu yeşil`#406557→#315448`, açık harf`#FAF8F1`.
Yanlış taş`#F3E4DC→#E4C5B8`, koyu kırmızı harf`#713A30`. İpucu taşının yüzü
aynı fildişi ailesinde, kesikli pirinç sınır; glow yok. Seçim rayı8px açık
yatak +4px koyu yeşil çizgi; doğru durumda pirinç, yanlış durumda kırmızı
kesik. İşaret/sıra/hata metni korunur; sadece renkle açıklama yapılmaz.

Taş yüzüyle harf arasındaki ray katmanı korunur: köke kalıcı transform,
filter veya z-index eklenmez. En son seçilen harf1.1 ölçekle büyümez.
Yeni gelen taş diğerlerinden renk veya parıltıyla ayrılmaz; sonraki cevabı
ele veren görsel işaret yoktur. İpucu bandı yine tren/petek arasındadır.

HUD ikonlarının48px hedefi korunur; dış kutu/gölge kaldırılır. İlerleme
küçük düz köşeli bir göstergedir. Alt kontroller6px köşeli, birincil koyu
yeşil düz yüzey. “Komşu harflerden ray çiz” yönergesinin parmak emojisi
kaldırılır. Yönetici ve bölüm listesi işlevleri korunur; beyaz sayfa/hero,
tanıtım metni veya web gezinmesi eklenmez.

### Yetişkin sonuç istasyonu

**Level end** bölümünün tek-an koreografisi ve600ms düğme erişimi geçerlidir.
Yeni tasarımda peron kenarı ceviz ve metal, sonuç gövdesi düz fildişidir.
Kalın altın çerçeve/oyuncak çatı yerine ince ahşap çizgi ve dar direkler
kullanılır. Son tamlama etiketi düz4px köşeli; yana yatmaz. Bilet panosunun
5px köşesi ve ince ayırıcıları vardır; perfore daire oyuklar ve kalın gölge
yoktur. Tablodaki son üç tamlama korunur. Renkli konfeti kaldırılır; küçük
onay, hafif oturuş ve kısa düdük yeterlidir. Son bölüm, safe-area ve reduced
motion sözleşmesi aynıdır. `design/level-end-station-*.png` önceki oyuncak
yönün tarihsel maketleridir; yetişkin referansı `adult-atelier-end.png`.

### Sahiplik ve doğrulama

Art teslimi: `core/theme.css`, yukarıdaki küçük SVG varlıkları, bu sözleşme
ve `design/adult-*` görselleri. `train.css/train.js/levelend.css` değişim
listesi Word Train:4'e; `v4/style.css` listesi Word Train:8'e gönderildi.
Bu sahiplik ayrımı yüzünden art tema motor dosyalarına ölçü override'ı
ekleyerek gizli ikinci geometri oluşturmaz.

Üç yön görsel karşılaştırmasıdır; uygulanan varsayılan yalnız Ceviz &
Fildişi'dir. Son gerçek ekranlar `design/adult-final-*`; metin/harf kontrastı,
390×844/360×640 taşma/dokunma ve Türkçe glif kontrolleri
`design/adult-checks.json` içinde kaydedilir. Eski oyuncak PNG/SVG referansları
korunsa da oyunun aktif görsel bağımlılıkları yetişkin varlıklarına gider.

## DOM: yatay satırlarda harf yükü

Son kullanıcı kararı: **tren yazı gibi satır satır akar; vagonlar ve küpler
her an yataydır**. Kullanıcının `design/user-sketch-train-path.jpeg` taslağındaki
alt satırda sola, orta satırda sağa ve üstte sola ilerleyen son çift akışı kullanılır. Vagonlar düz satırlara
sözcük gibi yerleşir; U-dönüşte beklemez, hareket ederken de dönmez.
Her sözcük alçak platformun **üstünde**, fildişi yüzlü harf taşlarıyla taşınır.
Lokomotif öndedir, yalnız yatay olarak çevrilir; kelime yükü asla aynalanmaz.

`core/theme.css` malzeme/grafik; `core/train.css` geometri ve hareket;
`core/train.js` yol örnekleme, araç yerleştirme ve cevap animasyonunu yönetir.
CSS yükleme sırası: theme, train, varyant. Araç içleri değişmez, dış ray DOM'u
satırlı yol için aşağıdaki yapıyı korur (opus-core ile paylaşıldı).

```html
<div class="wt-train" aria-label="Kelime trenin">
  <div class="wt-train__scene" aria-hidden="true"></div>
  <svg class="wt-train__rails" aria-hidden="true">
    <g class="wt-rail__bed"><!-- aynı yolun ahşap yatağı --></g>
    <g class="wt-rail__groove"><!-- koyu oluklar --></g>
    <g class="wt-rail__inner"><!-- açık iç yüz --></g>
    <g class="wt-rail__ahead"><!-- lokomotifin önündeki kesikli yol --></g>
  </svg>
  <div class="wt-train__cars">
    <div class="wt-locomotive" aria-hidden="true">
      <span class="wt-locomotive__steam"></span>
    </div>
    <button class="wt-wagon" type="button" aria-label="KİTAP">
      <span class="wt-wagon__coupler" aria-hidden="true"></span>
      <span class="wt-wagon__cargo" aria-hidden="true">
        <span class="wt-block" data-tone="0" style="--wt-letter-i:0"><span class="wt-block__face">K</span></span>
        <span class="wt-block" data-tone="1" style="--wt-letter-i:1"><span class="wt-block__face">İ</span></span>
        <!-- T, A, P için ayrı .wt-block -->
      </span>
      <span class="wt-wagon__deck" aria-hidden="true"></span>
      <span class="wt-wagon__wheel wt-wagon__wheel--front" aria-hidden="true"></span>
      <span class="wt-wagon__wheel wt-wagon__wheel--front2" aria-hidden="true"></span>
      <span class="wt-wagon__wheel wt-wagon__wheel--back2" aria-hidden="true"></span>
      <span class="wt-wagon__wheel wt-wagon__wheel--back" aria-hidden="true"></span>
    </button>
    <div class="wt-wagon wt-wagon--ghost" aria-label="K ile başlayan 6 harfli kelime">
      <!-- aynı coupler, deck ve tekerlek yapısı -->
      <span class="wt-wagon__cargo" aria-hidden="true">
        <span class="wt-block wt-block--given" data-tone="0"><span class="wt-block__face">K</span></span>
        <span class="wt-block wt-block--slot"><span class="wt-block__face"></span></span>
        <!-- kalan 4 boş yuva -->
      </span>
    </div>
    <span class="wt-train__phrase"><!-- tek güncel tamlama hapı --></span>
  </div>
</div>
```

- Önceki `.wt-wagon__body`, tek parça `.wt-wagon__word`, yatay
  `.wt-train__viewport/__track` artık görsel sözleşmenin parçası değildir.
- Harfler HTML metnidir; `toLocaleUpperCase('tr-TR')`. Blok yüzü **Verdana bold**:
  büyük `İ` üst/alt yatay çizgili gövdesiyle küçük `i` gibi görünmez. Noktalı İ,
  I/ı, Ğ, Ş, Ç, Ö, Ü görüntüsü kontrol edilir. UI fontu çevrimdışı sistem fontudur.
- Temel blok 32×36px; aktif vagonda `--wt-block-w` (sayı; son20/18px fiziksel alt sınır aşağıda), aralık3px;
  kenar boşluğu8px. 6 harfli örnekte28px blok kullanıldı: platform199px.
  11 harfte24px + 10×2px aralık +16px kenar =300px; aktif vagonun tümü okunur.
- Blok tek tombul siluettir; kaymış ikinci kopya/pah çizgileri yok. Ön yüz açık
  pastel boya, 2px kalınlık, ince damar ve oyulmuş görünümü veren koyu harf.
  `data-tone="0..4"`, `--slot`, `--ask`, `--given`, `--hint`, `--pending`, `--drop` destekli.
- Platform belirgin kalın bir ahşap kalastır; üstündeki blok ile tekerlek
  arasında yeterli yükseklik vardır. Vagon kök72px; cargo36px, deck20px;
  4 tekerlek (her uçta çift) deck altında, asla harf üstünde değil.
  Hayalet vagonda platform, tekerlek ve kanca opaktır; boş yükü kesikli yuvalar anlatır.
  Kesin bottom/height değerlerinin sahibi train.css'tir; üstteki cargo
  altı ile deck üstü eşit olmalı. Tek '?' kısa platformunda iki tekerlek yeterli.
- Vagon tamamı tek erişilebilir düğmedir. Küpler ayrı odak/düğme değildir;
  aria-label bütün sözcüğü okur. Başlangıç harfi verilidir: `K_____`, soru
  `KİTAP + K…`. API sayı gizleme gerektiğinde tek `.wt-block--ask` destekler.
- Yeni lokomotif görseli `assets/locomotive-toy.webp`: 324×260, ~22KB, alfa
  kanalı, gülen büyük yüz, tombul ahşap kazan/kabin. 108×96 CSS kutusunda
  `contain`; SVG alternatifi `assets/locomotive-toy.svg`. İkisi aynı anda
  background katmanı olarak çizilmez (alfa boşluklarında çift lokomotif oluşur).
- `.wt-app/.wt-hud/.wt-playfield/.wt-bottom-bar/.wt-sheet` ortak arayüz sınıfları
  değişmez. Kullanıcının son kararıyla geliştirme odağı `v4/` Ray Çiz'dir.

## Satır satır ray — bağlı tamlama çifti

Son karar, önceki ayrı-satır ve dönen S-ray maketlerinin yerini alır.
**Önceki vagon ile aranan vagon her zaman aynı alt satırda, soldan sağa
bir tamlama gibi okunur:** `[KİTAP]=[K_____]`. Birlikte yerleşen tek gruptur.

### Maketler, yön ve sıkı geometri

- Demo: `/tmp/wordtrain-row-mockup2.png` (390×844).
- Güncel v4: `/tmp/wordtrain-v4-30hex.png` (390×844,30altıgen).
  İpucu açık: `/tmp/wordtrain-v4-30hex-hint.png`.20taşlı önceki maket tarihsel kayıttır.
  `/tmp/wordtrain-row-mockup2-v4.png` eski6×6 ara karardır; uygulanmaz.
- Son v4 maketinde HUD y12–60, tren sahnesi y72–242 (170px). İki ray y82 ve155
  (sahne içi), ortak dikey ölçek k=.85; fiziksel küp genişliği24px korunur.
  Aşağıdaki220px geometri normal tren boyutunun referansıdır. Daha yüksek alanda üçüncü satır eklenebilir;
  satır aralığı her zaman araç yüksekliği+8–12px, fazladan gökyüzü boşluğu yok.
- Alt sıra **sola**, sol U'dan orta sıra **sağa**, sağ U'dan üst sıra **sola**.
  Vagon/küp açıları her an0°. Yalnız lokomotif satır yönüne göre aynalanır.
  İki satırlı açılışta lokomotif üst sırada, sağa bakar; bu doğru seyir yönüdür.
- Çok kısa sahnede (yaklaşık120px altı) `.wt-train--one-row` kullanılır:
  çift tek alt sırada kalır, eski vagonlar/lokomotif soldaki devam yoluna ilerler.
  Dikey kırpılma önlenir; fiziksel küp genişliği korunur. İpucu aç/kapatırken
  ResizeObserver, hareket sırasında da kadrajı hemen günceller.
- Normal düz ray x24..366, U köşesi14px (sol dışx10). Uzun çiftte düz
  alan x8..W−8'e açılır; U-dönüş ekran dışına taşabilir.
- İlk çift: KİTAP140px x34..174,16px altın kanca, K_____166px x190..356.
  Küpler24×36px, aralık2px, her platformda iki6px iç pay; k=1.
  Lokomotif108×96px x216..324, üst rayda tam görünür.
- `assets/train-rows.svg`:390×220, bu son yönün iki satırlı referans yolu.

```svg
<path d="M402 202H24Q10 202 10 188V134Q10 120 24 120H402" />
```

### Çiftin görsel bağı ve uzun kelime kuralı

`.wt-train__pair-field` iki platformun ortak açık bal zemini; JS çiftin
sınırlarından x/y/width/height hesaplar. `.wt-link--pair` sadece iki vagon
arasındaki altın bağlantıdır. Başka satırlar arasında uzun çubuk çizilmez.
Durağan araçlar yalnız düz satırdadır; U üzerinde beklemez.

Küpler normalde24–28px. Çift sığmadığında, orkestratörün son karar sırası:

1. Alt satır dış kenarını8px'e, platform iç paylarını asgariye, kancayı10px'e indir.
2. Küpleri ortak küçült; **390px ekranda20px,360pxte18px altına inme**.
   Aranan vagonun küpleri önceki vagonunkinden hiçbir zaman küçük olmaz.
3. Yine sığmıyorsa yalnız önceki vagonun sol ucu ekrandan taşabilir.
   Önceki kelimenin **son4harfi** ve aranan vagonun **tamamı** mutlaka görünür.
   İki kelimeyi ayrı satıra bölme, üç noktayla sözcüğü değiştirme.

Mevcut veride en uzun çift17harf: TOPLANTISI+NOTLARI veya DEĞİŞİKLİĞİ+TALEBİ.
Bu nedenle önceki16px maket önerisi iptal edilmiştir;20/18px alt sınır geçerlidir.
Son karar: kazanılan sözcük önce **KAPAĞI** olarak yüklenir ve **kitap kapağı**
tamlaması gösterilir; ardından ĞI düşer, K gelir ve önceki vagon **KAPAK** olur.
Bütün eski vagonlar base hâlinde kalır. Ayrı soru/anlam satırı ekrandan kaldırılmıştır.

### Ek düşme ve kökün görünür oluşması

Bu bölüm “word vagonda kalır” kuralının **yerini alır**. Tren eski sakin
hareket ritmini korur; toplam süre üst sınırı yoktur. Son hâlde alt çift
`[base]=[ilk harf + boş yuvalar]` olur.
Metin değişimi oyuncunun gözü önünde küplerle gerçekleşir; tek karede sözcük
etiketi değiştirilmez. Türkçe metinler NFC ve `tr-TR` büyük harf olarak ele alınır.

1. `word` ve `base` harf dizilerinin **en uzun ortak öneki** bulunur.
2. Bu önekin küpleri aynı DOM/görünürlükle kalır. `word`ün kalan küpleri
   kendi pastel tonu/harfiyle ayrı FX kopyası olarak aşağı düşer. Hata kırmızısı,
   çarpı veya ceza sesi kullanılmaz; bu doğru cevabın doğal parçasıdır.
3. `base`in önek sonrası harfleri yeni küpler olarak12px yukarıdan yerlerine
   oturur. Düşen eski harfler önce bu yuvalardan ayrılır; iki harf üst üste binmez.
4. Platformun genişliği yeni köke yumuşakça uyarlanır. Sonunda yeni boş vagon
   bunun sağına bağlanır. Tren geçmişinin tüm eski vagonları da base metni taşır.

| Bulunan word → base | Kalan ortak küpler | Düşen küpler | Gelen küpler |
| --- | --- | --- | --- |
| BAHÇESİ → BAHÇE | BAHÇE | Sİ | — |
| KAPAĞI → KAPAK | KAPA | ĞI | K |
| KAYDI → KAYIT | KAY | DI | IT |
| HACMİ → HACİM | HAC | Mİ | İM |
| DEĞİŞİKLİĞİ → DEĞİŞİKLİK | DEĞİŞİKLİ | Ğİ | K |

Bütün vagonlar ve kalan/gelen küpler yataydır. Yalnız **kopmuş ek küpleri**
kısa düşüşte en fazla±10° dönebilir; harfi seçilebilir kalır. Düşüş24–34px,
mini zıplama4–6px; sonra120–160ms solma. Ekin tamamı tek görünür olaydır;
çok harfte toplam sıra farkı120ms'yi geçmez. FX pointer-events:none;
tren overflow sınırı nedeniyle küpler düşmeden bir anda kesilmez.
Küçük ekranda iniş mesafesi sahne altına göre kısalır, görünür zıplama korunur.

### Tren arka planda akar — giriş animasyonu beklemez

**Son kullanıcı açıklaması:** istenen daha hızlı tren değil, treni beklemeyen
oyundur. Animasyon toplam süresine hedef veya üst sınır konmaz. Tren kendi olay
kuyruğunda keyifli oyuncak ritmiyle akar. Oyuncunun yeni kelimeyi çizmeye başlaması
bu kuyruğun herhangi bir Promise/animation bitişine bağlanmaz.

| Aşama | Görsel süre / ritim |
| --- | --- |
| Harf yükleme | Küp başına300–420ms;40–60ms sırayla küçük düşüş ve oturma. Verilen harf yerinde kalır. |
| Tam tamlama | **okul bahçesi / kitap kapağı**400–600ms görünür; bu aşamada bulunan word korunur. |
| Vagon ilerleme |700–900ms yumuşak kayma; U geçişi200–300ms bu hareketin içindedir. |
| Ek düşme | İlerleme sırasında450–600ms düşüş/zıplama/solma;40ms sıra farkı en çok120ms. |
| Yeni kök harfi | Ortak önek sabitken yeni son harfler220–300ms oturur; düşen harflerle üst üste binmez. |
| Yeni boş vagon |150–200ms kısa belirme; tren kuyruğunun görsel çıktısıdır, giriş izni değildir. |

Doğru cevap oyun modeline hemen işlenir; yeni hedef ve yerçekimiyle yenilenen
petek tren bitmeden kullanılabilir. Hızlı oyuncuda geçmiş tren olayları kuyrukta
sırasıyla tamamlanır; oyuncudan hiçbir zaman “tren beklemesi” istenmez.
Kuyruk yönetimi gerekirse eski ara duruşları birleştirebilir; en güncel kelimeyi
ve base dönüşümünü yanlış sıraya sokmaz, kazanılmış vagon kaybetmez.
Tamlama bildirimi yanlış tur ipucuyla karışmaz; her tren olayının word/base/phrase
bilgisi o olayla taşınır. Bölüm sonu için aşağıdaki **Level end** sözleşmesi geçerlidir:
tren ve sonuç yüzeyi aynı istasyonun parçalarıdır; bağımsız kutlama/popup açılmaz.

Reduced motion: düşüş/U/zıplama yerine120–180ms çapraz solma ve base değişimi.
Erişilebilir bildirim “BAHÇESİ, BAHÇE oldu” diyebilir. Bu tercih de girişin
kilitlenmesine neden olmaz. Tren animasyonunun toplam süresi artık kabul ölçütü
**değildir**; kabul ölçütü, yeni doğru seçimin animasyon sürerken alınmasıdır.

### İlk ipucu: anlam balonu

Anlam metni ve `KİTAP + K…` soru satırı normal ekranda **yoktur**; trendeki
çift soruyu zaten taşır. Tahta üstünde yalnız0/6 sayaç ve gerektiğinde kısa
durum mesajı kalır. Bu alan peteğe verilir.

- Turdaki ilk İpucu basışı metin ipucunu açar; bu da yardım sayısına **1** ekler.
  Sonraki basışlar mevcut istasyon/yol ipuçlarıdır; her yeni yardım ayrıca sayılır.
- Balon kapatılabilir, aksi halde o tur boyunca durabilir. Yeni turda kapanır.
  Kapatıp yeniden açmak aynı anlam yardımını tekrar kazanılmış yardım saymaz.
- Kart **tren ile petek arasındaki bantta**, normal belge akışındadır; fixed/overlay
  değildir ve hiçbir harf taşını örtmez. Sayaçla aynı bantta, tercihen onun
  üstünde yer alır. Uzun ipucu iki satıra sarılır; metin kesilmez. Bant büyürken
  yüksekliği **trenden alır**, o turdaki petek ölçeği/merkezleri sabit kalır.
 14px köşe, krem yüz, ince ahşap kenar;13px yeşil başlık,15px/1.3 anlam.
- Kapat düğmesi48×48px, `aria-label="İpucunu kapat"`. `role="note"` veya
  uygun canlı durum bildirimi; odak tuzağı yok. İpucu düğmesiyle ilişki kurulur.
- Tur bitince kart otomatik kapanır; kullanıcı48px kapat düğmesini de kullanabilir.
  İpucu aç/kapat sırasında tren kadrajı eşzamanlı yenilenir; lokomotif üstü
  kırpılmaz. Kartın açılması yeni yolu veya sürükleme girişini bloke etmez.

```html
<aside class="wt-clue-popover" role="note" hidden>
  <h2 class="wt-clue-popover__title">İpucu</h2>
  <p class="wt-clue-popover__text">Kitabın dışını koruyan bölüm.</p>
  <button class="wt-clue-popover__close" aria-label="İpucunu kapat">…</button>
</aside>
```

CSS `core/theme.css`te hazırdır. İlk anlam yardımı/sonraki yol yardımı sırası,
yardım sayacı ve tur kapanışı v4/game.js tarafından yönetilir.

## Petek harf taşları — v4

Referans `design/ref/word-master-hex.png` açılıp incelendi. Kare4×4/6×6
kararları iptal: **5sütun×6 =30 flat-top altıgen**. Sivri uçlar sağ/sol,
üst/alt kenarlar yatay.2. ve4. sütun yarım hücre yukarı kayar.

### Geometri ve mobil yerleşim

390×844 maketinde petek x27..363,y280..757. Taş80×70px, yatay merkez
adımı64px, düşey adımı74px. Sütunları0'dan sayınca0/2/4 için yoffset37,
1/3 için0. Her sütunda6taş; toplam336×477px. Harf36px Verdana bold,
Türkçe İ/Ğ/Ş/Ç/Ö/Ü belirgin. Taşlar normalde78–82px eninde; küçük ekranda
panel genişliğine göre ölçü tek oranda uyarlanır,Yeni yoğun petek kararında44px dokunma alt sınırı korunur.

`x=originX+c*64`, `y=originY+r*74+(c%2===0?37:0)`.
Taş merkezleri `(x+40,y+35)`. Her taşın üst/alt ve4çapraz toplam6komşusu
vardır (kenarlarda daha az). Çizgi sadece komşu merkezlerini bağlar.
Konum ve komşuluk algoritmasının sahibi v4; tema düzeni değiştirmez.

### DOM, durum ve ray sınıfları

```html
<button class="wt-hex" aria-pressed="false">
  <span class="wt-hex__letter">İ</span>
  <span class="wt-hex__order"></span>
</button>
<svg class="wt-hex-path" aria-hidden="true">
  <path class="wt-hex-path__bed" d="M…" />
  <path class="wt-hex-path__line" d="M…" />
</svg>
```

Ölçü değişkenleri üst panelden veya taşın kendisinden verilir:
`--wt-hex-w:80px; --wt-hex-h:70px; --wt-hex-font-size:36px`.
Taş konumunu v4 `position:absolute;left;top` ile verir. Normal sınıf `.wt-hex`.

| Durum | Sınıf | Görünüm |
| --- | --- | --- |
| Normal | `.wt-hex` | Krem boyalı ahşap, bal rengi kenar, koyu oyulmuş harf |
| Seçili | `.wt-hex--selected` veya `aria-pressed=true` | Açık adaçayı yüz, koyu yeşil kenar/harf |
| Doğru | `.wt-hex--correct` | Koyu adaçayı, krem harf |
| Yanlış | `.wt-hex--wrong` | Açık mercan, koyu kızıl kenar/harf |
| İpucu | `.wt-hex--hint` | Bal rengi yüz, çizgili altın kenar |

Durum örnekleri `/tmp/wordtrain-hex-states.png`. Doğru/yanlış renkleri
`aria-pressed=true` ile birlikte de doğru öncelikte uygulanır.
Ray dış krem çizgi10px, iç yeşil6px, yuvarlak uç/birleşim.
`.wt-hex-path--correct`, `--wrong` (mercana dönen kesikli çizgi),
`--hint` (4px noktalı altın) desteklidir. Başlangıç hücresi kendiliğinden
vurgulanmaz; çözüm yolu önizlemesi yalnız admin içindedir.

Ray SVG'si z1, harfler z2; taş köküne transform/filter/isolation ile ayrı
stacking context eklenmez, böylece ray yüzün üstünde ve harfin altında kalır.
SVG pointer-events:none. Taşın dikdörtgen kutuları köşelerde örtüştüğünden
sürükleme hit testi altıgen geometrisine göre yapılır (v4 sorumluluğu).
`touch-action:none` yalnız sürükleme tahtasında; diğer kontroller manipulation.

### Yerçekimli harf yenileme — gidiş, düşme, çevirme

**Son kullanıcı kararı: çeşitli yenileme.** Yerçekimi zorunluluğu kalktı.
Turların yaklaşık %25'inde kullanılan taşlar yerinde yenilenir; %75'inde altı
petek yönünden birinde akış olur. Aşağıdaki yalnız-aşağı açıklama tarihsel
tariftir; yeni akışta vektör değişir, harfler dönmez. Yerinde görünme: eski
taş110ms, opacity1→0, scale1→.92,6px aşağı; yeni taş70ms'den itibaren220ms,
opacity0→1 ve **scale.86→1.015→1** (0/75/100% keyframe),
`cubic-bezier(.22,.68,.3,1)`. Yeni yetişkin yönünde .55 başlangıç ve1.04
sıçrama fazla oyuncaksı; daha küçük ölçek değişimi seçildi. Yeni yüz normal
fildişi/ahşap taşla aynı, parıltı/renk kodu yok. Akışta180–280ms kayma,
220–320ms yeni giriş ve en fazla2px oturuş seçilen2Dvektöre uygulanır;
yerinde modda kalan taşlar hareket etmez. Reduced motion80–120ms yalnız
solma. Model anında final; ilk pointerdown FX'i bitirip aynı dokunuşu işler.
Bu sürelerin hiçbiri girişi kilitlemez; yeni harf görünümü çözüm ipucu değildir.

Her doğru cevapta **yalnız kullanılan taşlar** gider. Sağ kalan taşlar kendi
sütununda, birbirlerinin sırasını koruyarak boşluklara iner. Yeni harfler aynı
sütunun üstünden gelir.5sütun kayması değişmez; altıgenler yuvarlanmaz ve
başka sütuna uçmaz. Tahta bütünüyle silinip tekrar belirmez.

| Eylem | Hareket tarifi |
| --- | --- |
| Kullanılan taşın gidişi |90–120ms; doğru rengiyle1→.92ölçek,6px aşağı ve solma. Harf okunur kalır, patlama yok. |
| Sağ kalan taşın düşüşü |180–280ms ease-out; kendi x merkezinde tam slot mesafesi kadar aşağı. İnişte en fazla2px oturma. |
| Üstten yeni taş |220–320ms; tahtanın üst sınırından hedef slotuna, yumuşak duruş. Sütun başına0–12ms gecikme, toplam animasyon kuyruğu oluşturmaz. |
| Zorunlu ek harf değiştirme | Yalnız çözüm yolu garantisi için değişmesi gereken hücreler120–160ms hafif çevirme yapar;90°yan görünümde harf değişir. Tüm tahtayı döndürme yok. |

Bu süreler paralel yürür; olağan yenilemenin görsel toplamı yaklaşık300–360ms.
Tren süresinden bağımsızdır ve oyun girişinin bekleme süresi **değildir**.
Yeni tahta modeli, harfler, merkezler ve geçerli hedef yol doğru cevap kabulünde
hazırlanır. Başlangıçta eski seçili yol ve numaralar temizlenir.

**Oyuncu düşüş bitmeden dokunursa:** kalan yerçekimi/çevirme animasyonlarını
aynı karede son konuma tamamla; ardından **o pointerdown'ı** yeni tahtada hit-test
et. Dokunuşu yutma, yeniden dokunma isteme, animasyon Promise'ini bekleme.
Böylece eski hareketli harf ile yeni slot harfi çelişmez. Aynı kural devam eden
bir sürükleme için de tutarlı uygulanır; görsel katman girişin önünü kesmez.

Görsel kopyalar pointer-events:none ve aria-hidden'dır; etkileşimli model tektir.
Root transform geçici kullanılıyorsa ilk yeni seçimden önce kaldırılır;
ray yüzün üstünde/harfin altında kalmaya devam eder. Ek tema sınıfı zorunlu
değildir; koordinat animasyonlarını v4 yönetir. Reduced motion:80–120ms solma
ve doğrudan son slot; sütun düşüşü veya çevirme yok, giriş yine açık.

Çözüm garantisi için gereken ek değişiklikler oyun algoritmasının parçasıdır;
önce yalnız yeni gelen harfler seçilir, ek taş değişimi veya tam yeniden
karıştırma son çaredir. Görsel, gerekmedikçe sağ kalan taşı değiştirmez.

### Kabul kontrolü

390×844 ve360×640:30taş, doğru sütun kayması,6komşuluk, büyük Türkçe harfler,
petek dokunmasında en az44px, diğer kontrollerde48px; sayfa kayması yok. Alt tamlama çifti aynı sırada;
uzun çift20/18px sınırında, arananın tamamı ve öncekinin son4harfi görünür.

## Sanat yönü

Sade krem oyuncak masasının üstünde küçük ahşap bir tren. Sıcak
krem boşluklar, yuvarlak biçimler, kontrollü ahşap damarları, yumuşak gölgeler.
Kelime okunurluğu her dekoratif ayrıntıdan önce gelir. Tren yatay satırlar halinde
rayı izler; yeni vagon altta oluşur, lokomotif önde ilerler.

## Renk paleti

| İşlev | Değer | CSS değişkeni |
| --- | --- | --- |
| Sayfa / boşluk | `#FAF5E9` | `--wt-cream` |
| Kart / kâğıt | `#FFFAF0` | `--wt-paper` |
| Ana metin | `#493B30` | `--wt-ink` |
| İkincil metin | `#786653` | `--wt-muted` |
| Ahşap açık / gövde / kenar | `#FAE6BA` / `#E9C48C` / `#BD8D56` | `--wt-wood-light`, `--wt-wood`, `--wt-wood-edge` |
| Adaçayı boya / koyu düğme | `#789B80` / `#40674D` | `--wt-sage`, `--wt-sage-dark` |
| Mercan boya / koyu vurgu | `#CD806A` / `#97513F` | `--wt-coral`, `--wt-coral-dark` |
| Sis mavisi / altın | `#86A7B5` / `#EDC06C` | `--wt-blue`, `--wt-gold` |
| Yanlış cevap | `#A74438` | `--wt-danger` |
| Klavye odağı | `#426B7D` | `--wt-focus` |

Pastel boya metin rengi değildir. Birincil düğmenin koyu adaçayı yüzeyinde krem
metin; gövde, blok ve kartlarda koyu kahverengi metin kullanılır. Yanlış/doğru
durumlar renk yanında metin veya simge ile de anlatılır. İnce dekoratif ahşap
damarlarının opaklığı yaklaşık %12; kelimenin arkasında yüksek kontrastlı desen yok.

## Tipografi ve mobil hiyerarşi

Tamamen offline sistem yığını: `ui-rounded, "SF Pro Rounded", "Arial Rounded MT
Bold", system-ui, -apple-system, "Segoe UI", sans-serif`. İndirilen font, CDN,
harici ağ çağrısı yok. Sistem yuvarlak font sunmuyorsa Türkçe karakterleri içeren
sistem sans fontuna geçilir. Font seçimi sayfa açılışını bekletmez.

- Ekran başlığı: 24–28px, 800; kısa açıklama 14–15px, 450–550, satır aralığı 1.5.
- Trende harfler Verdana800; küpler normal24–28px, uzun çiftte390ekranda20px,
  360ekranda18px alt sınır. Harf genişliğe göre uyarlanır; İ/Ğ/Ş satır aralığı1.25.
- Petek harf taşı: 36px,800;80×70px yüzey. Hareketli seçim alanlarında en az
  48×48px dokunma alanı; vagon sözcükleri tek satır.
- Düğmeler: 15px, 750; en az 48px yükseklik. İkon düğmeler 48×48px.
- Küçük etiketler: 12px, 750; durum ve yönergeler en az 14px.
- 390×844 hedef:16px yatay kenar, üstte kompakt HUD, yaklaşık170px satırlı
  ray sahnesi, sonra kısa kelime bağlantısı ve alt oyun mekaniği. Son ölçüler
  üstteki Satır satır ray bölümünde; eski190–220px yatay sahne artık kullanılmaz.
  Oyun ekranı tam `100dvh`; **sayfa kaydırılmaz**. 320px ekranlarda da tren
  dışında yatay taşma yok. Kısa ekranlarda sahne ve boşluklar küçültülür,
  dokunma alanı 48px altına düşürülmez. Uzun admin listeleri popup içinde kayar.

Türkçe büyük harf JS ile `toLocaleUpperCase('tr-TR')`; CSS `text-transform`
kelime dönüşümü için kullanılmaz. Ekran okuyucu için bütün kelime korunur.

## Varlıklar ve çizim tarifleri

| Dosya | Kullanım |
| --- | --- |
| `assets/locomotive-toy.webp` | 324×260, alfa, ~22KB; konseptteki tombul ahşap ve büyük gülen yüz. SVG alternatifi locomotive-toy.svg. Eski locomotive.svg kullanılmaz. |
| `assets/flatcar.svg` | Esneyen kalın ahşap platform, canlı harf küpleri bunun üstüne oturur. |
| `assets/block-grain.svg` | Küp üstünde düşük opaklıklı ahşap damarları. |
| `assets/hex-shape.svg` | 80×70 yuvarlatılmış flat-top maske; bütün petek durumları CSS ile boyanır. |
| `assets/train-rows.svg` | 390×220, sıkı iki satır; alt sola, üst sağa;14px U köşesi. |
| `assets/train-path.svg` | Eski dönen S-yol referansı; satırlı sürümde kullanılmaz. |
| `assets/wood-grain.svg` | 180×74 yatay tekrarlı, düşük opaklıkta damar. CSS vagon gövdesi bunun ve ahşap gradyanın birleşimidir. |
| `assets/wheel.svg` | 38×38, koyu ahşap disk, açık ahşap göbek, ince tahta damarı. CSS ile döndürülebilir. |
| `assets/coupler.svg` | 26×16, iki kısa mil ve yuvarlak bağlantı halkası; iki vagon arasında okunur. |
| `assets/rails.svg` | 88×34 kesintisiz yatay tekrar; ahşap travers ve sıcak gri iki ray. |
| `assets/scene.svg` | 780×240, krem gökyüzü, yumuşak güneş, bulutlar, katmanlı adaçayı tepeler ve oyun masası. `cover`, orta-alt hizalı. |
| `assets/letter-block.svg` | 64×68, yükseltilmiş ahşap kare; üstüne HTML harf yazılır. |
| `assets/icons.svg` | `admin`, `arrow-right`, `back`, `restart`, `hint`, `sound`, `mute`, `check`, `close`, `star`, `levels` sembolleri; 24×24, `currentColor`. |

Her harf küpü hafifçe değişen pastel boyalı ahşaptır; platform boyasız sıcak
ahşap kalastır. İlk harf dolu, kalan yuvalar kesiklidir. İpucu harfinin
kontrastı azaltılmaz. Etkileşimli vagonlarda odak halkası korunur.

İkon kullanım örneği (varyant sayfasından):

```html
<button class="wt-icon-button" type="button" aria-label="Yeniden başlat">
  <svg class="wt-icon" aria-hidden="true"><use href="../assets/icons.svg#restart"></use></svg>
</button>
```

Varlıklar küçük SVG ve tek22KB WebP lokomotiftir; toplam300KB altında. Harici
ağ resmi, font, filtre kütüphanesi veya base64 veri yok. CSS ve SVG dosyaları normal HTTP sunucusunda ve proje
hub'ı altındaki göreli yollarda çalışır.

## Hareket dili

Tren hareketi için üstteki **Tren arka planda akar — giriş animasyonu beklemez** son sözleşmedir.
Düğme basımı2px, harf seçim bloğu3px;140ms geçiş. Tema hareket azaltma tercihini
uygular; JS kamera/hareket tercihini core yönetir. Geçmiş yatay kaydırma ve
"kelimeyi vagon yanına yazma" yaklaşımı kullanılmaz.

## Mobil oyun ekranı

Bu bir tam ekran mobil oyundur. Hero, pazarlama başlığı, slogan veya sayfa altı
tanıtım metni kullanılmaz. Serbest klavye ile kelime yazma mekaniği yoktur.
Ekran `100dvh`, `html/body` ve oyun kabuğu `overflow:hidden`; `touch-action:
manipulation`. Oyun sayfası kaymaz; tren satır satır otomatik ilerler. Uzun admin
listeleri yalnız popup içinde dikey kaydırılır.

```html
<main class="wt-app wt-game">
  <header class="wt-hud">
    <div class="wt-hud__level">Bölüm 1<small>Kitap Treni</small></div>
    <span class="wt-hud__progress" aria-label="9 bağlantının 0 tanesi tamamlandı">0 / 9</span>
    <button class="wt-icon-button" aria-label="Yönetici paneli">
      <svg class="wt-icon" aria-hidden="true"><use href="../assets/icons.svg#admin"></use></svg>
    </button>
  </header>
  <div class="wt-playfield"><!-- tren, ipucu, seçme/sürükleme mekaniği --></div>
  <footer class="wt-bottom-bar">
    <button class="wt-button wt-button--primary">Vagona yükle</button>
    <button class="wt-button">İpucu</button>
  </footer>
</main>
```

- **HUD:** 48px yükseklik; bölüm adı ve tek ilerleme göstergesi. Yönetici/ayar
  ikonu sağ üstte 48×48px. Uzun isimler HUD içinde kontrollü kısalır. Ayrı büyük
  oyun adı veya mekanik başlığı yok. İsteğe bağlı ses ikonu da 48×48px.
- **Oyun alanı:** `.wt-playfield` esner ve `min-height:0` kullanır. Tren
  satırlı rayın üst yarıyı dolduracağı ölçüdedir (hedef390×844te yaklaşık170px).
  İpucu bir kısa cümle; metin kutusu dekoratif
  giriş yazısı için kullanılmaz. Harf ve seçenekler merkezin alt yarısında,
  başparmak erişiminde. Boşluk daralabilir, dokunma hedefi daralmaz.
- **Alt çubuk:** `.wt-bottom-bar` sayfa içinde en altta, sabit oyun kabuğunun
  parçasıdır. Birincil eylem alanı esner; ipucu yanında durur. Kontroller en az
  52px yükseklik. `env(safe-area-inset-bottom)` ve üst safe-area kabukta korunur.
  Cihaz üst/alt boşluklarına hiçbir düğme taşmaz.
- **Yönetici popup:** tek HUD ikonu `openAdmin({ levels, currentId, onJump,
  actions })` açar. Bölüme atla, cevabı çöz, bölüm sonuna geç, ilerlemeyi sıfırla,
  karıştır/yeniden seed ve diğer debug eylemleri yalnız burada bulunur.
  Kullanıcı düzeltmesi: yalnız TEST/DEBUG eylemleri admin içine taşınır. Normal
  oyuncu kontrolleri (Bölümler, Karıştır, Yeniden, Geri al, İpucu) ekranda kalabilir.
- **Bottom-sheet:** `.wt-overlay > .wt-sheet`; sırasıyla `.wt-sheet__handle`,
  `.wt-sheet__header` (başlık + kapat), `.wt-sheet__body`, `.wt-sheet__footer`.
  Yalnız body kayar; başlık, kapatma ve alt düğmeler sabit kalır. Krem yüzey,
  28px üst köşeler, sıcak kahverengi yarı saydam arka perde. Arkadaki oyun
  etkileşime kapanır. Dialog rolü, odak kilidi, Escape/geri/kapat ve açan
  düğmeye odak dönüşünü popup JS'i yönetir.
- **Bölüm sonu:** aşağıdaki **Level end** bölümündeki ortak istasyon bileşeni.
  Peronun üst kenarı son vagonların rayıdır. Sonuçlar peronun altında, düğmeler
  ekranın dibindedir. Eski merkez kartı ve bağımsız `celebrate()` ayrılışı bu
  akışta kullanılmaz.
- **Dokunma ve titreşim:** hover bilgiyi açmanın şartı değildir. Her hareket
  Pointer Events ile dokunma/farede çalışır. Kısa titreşim `core/haptics.js`
  tarafından; tema kendi `navigator.vibrate` çağrısını yapmaz.
- **İkon netliği:** sprite'ın her `symbol` öğesi ve `.wt-icon` `fill:none`;
  yalnız yıldız bilinçli dolguludur. Böylece yönetici, ampul ve ses ikonları
  siyah dolu lekeye dönüşmez. `stroke:currentColor` ve 22px görsel boyut.

Eski `/tmp/wordtrain-art-initial.png` ve `/tmp/wordtrain-art-mobile.png` önceki
yatay tasarımdır. Son referanslar `/tmp/wordtrain-row-mockup2.png` ve
`/tmp/wordtrain-v4-30hex.png`; ikisi de390×844.

## Entegrasyon kontrolü

Son maketler390×844, verilen ilkharf ve çakışmayan geometriyle güncellendi.
SVG path XML olarak okunur; bütün SVG/WebP varlıkları300KB toplamın altındadır.
Gerçek oyun motorunun son yatay satır ekran kontrolü core ile birlikte yapılır.

### Önceki yatay tasarım kontrolleri (tarihsel kayıt)

`--wt-theme: wooden-toy` fallback çizimlerinin kapatılması için kökte bulunur.
`hidden` vagonlar temadaki `display` kuralına rağmen gizlenir. Demo üzerinde
390×844 ve 320×700 ölçülerinde kısa/uzun kelimeler, boş vagon, kaydırma,
eklenme, yanlış cevap, kutlama ve hareket azaltma kontrol edilmeli.

### Gerçekleştirilen kontrol — 21 Ekim 2026

- Chrome/Playwright ile gerçek `core/demo.html` üzerinde 390×844 ve 320×700:
  sayfa yatay taşması yok; SVG yolları yükleniyor, JS hatası yok, fallback çizim yok.
- Vagon ekleme/kenetlenme, hayalet gizleme, uzun kelimeler (`KÜTÜPHANESİ`,
  `MÜHENDİSLİĞİ`), Türkçe büyük harfler: metin kesilmeden görüntüleniyor.
- Button ve div vagonlarının gövde üst boşluğu eşit; sistem button içeriği
  merkezlemesinden kaynaklanan fark ortak flex yerleşimiyle giderildi.
- 320px grid daralması `.wt-app > * { min-width:0 }` ile korundu.
- Hareket azaltma emülasyonunda kutlama sırasında sıfır aktif tren animasyonu.
- Temel kontrastlar: vagon yazısı 8.76:1; ikincil metin 5.05:1; birincil
  düğme yazısı 6.18:1; yanlış cevap metni 5.47:1.
- 8 SVG XML olarak doğrulandı; tüm CSS varlık yolları mevcut. Toplam varlık
  büyüklüğü yaklaşık 10KB; tek bir dosya bile 300KB sınırına yaklaşmıyor.
- Yeni mobil kuralla gerçek v1 ekranı `/tmp/wordtrain-art-mobile.png` olarak
  390×844 piksel kaydedildi: belge/kabuk 390×844, sayfa scroll yok, görünen
  dokunma hedefleri en az 48px; ampul ve HUD ikonları çizgisel ve net.
- Ortak admin popup gerçek oyun üzerinden açıldı; `.wt-sheet` alt kenara
  oturuyor, liste ve debug eylemleri popup içinde kalıyor. Görüntü:
  `/tmp/wordtrain-art-admin.png`.

### Son entegrasyon görüntüleri

- İpucu bandı390×844: `/tmp/wordtrain-clue-band-final-390.png`.
- İpucu bandı360×640: `/tmp/wordtrain-clue-band-final-360.png`.
- Bu görüntüler eski alt-bar üstünde yüzen ipucu maketinin yerini alır.
  Kart tren/petek arasındadır; petek boyutu açılış/kapanışta değişmez.
- Yerçekimi sırasında ve sonrasında örnekler: `/tmp/wt-v4-gravity-mid.png`,
  `/tmp/wt-v4-gravity-390.png` (opus-v4).

## Level end

### Tek fikir: trenin rayı sonuç istasyonunun peronu olur

Son doğru cevapta trenin alt rayı kalın bir ahşap peron kenarına dönüşür.
Son iki vagon **aynı yerde, aynı harflerle** bu peronun üzerinde kalır; krem
sonuç yüzeyi peron kenarından aşağı açılır. Petek/seçenekler bu yüzeyin
arkasında silinir. Lokomotif üstteki istasyon cebine yanaşır, kısa bir düdük
ve tek bir yumuşak oturuşla durur. Tren, istasyon adı, son tamlama etiketi ve
sonuçlar tek bir oyuncak oluşturur. Tren oyuncu karar verene kadar burada
kalır; sonuç gösterilirken ekranı terk etmez.

Son tamlama, vagonlardaki metinden perona sarkan küçük altın etikete geçer:
`[KENAR]=[ÇİZGİSİ]` → **kenar çizgisi**. Bilet biçimindeki istasyon panosu
son üç tamamlanan tamlamayı gösterir. İstatistikte bütün bağlantılar sayılır.
Bu örnekte **9 bağlantı**; başlangıç vagonu bir başarı gibi sayılmaz.
Hata/yardım bilgileri mevcut oturum verilerinden gelir; yıldız puanı icat edilmez.

Bu tasarım mevcut tam ekranın ortasına yeni bir kart eklemez. Ray, kalın
ahşap kenar ve alt sonuç yüzeyi ortak koordinat sistemini kullanır. Peronun
rayı ile tekerlekler arasında boşluk yoktur. Başlangıç konumu varsayılan bir
`top` sayısından değil, gerçek son çiftin ray konumundan ölçülür.

### Mevcut akışın kaydı ve yeni maketler

Mevcut oyun, bölüm 1'in son cevabı **ÇİZGİSİ** gerçek pointer yoluyla girilerek
390×844'te kaydedildi. Admin yalnız son soruya ulaşmak için kullanıldı.
`t=0` son pointerup/doğru cevap anıdır. `level-end-capture.json` örnekleme
saatlerini ve tren/panel durumunu içerir; PNG rasterlemesi örneklemeden
birkaç kare sonra tamamlanabilir.

- Önce: `design/level-end-before-0000.png`, `-0500.png`, `-1000.png`,
  `-2000.png`, `-3000.png`. Kart açıldığında son küpler hâlâ yüklenmektedir;
  daha sonra tren karttan bağımsız hareket etmektedir.
- **350 ms:** `design/level-end-station-0350.png` — mevcut alt ray kalınlaşır;
  sonuç yüzeyi o raydan aşağı açılmaya başlar, oyun taşları hâlâ altta görünür.
- **850 ms:** `design/level-end-station-0850.png` — düğmeler kullanılır durumda;
  son iki küp otururken lokomotif yanaşmaya devam eder.
- **2400 ms:** `design/level-end-station-2400.png` — tren ve sonuçlar aynı
  istasyonda durur; son tamlama ve son üç bağlantı görünür.
- Dar ekran: `design/level-end-station-360.png` (360×640).
- Son bölüm: `design/level-end-station-last.png` (390×844),
  `design/level-end-station-last-360.png` (360×640).
- Tekrar üretilebilir kaynak: `design/level-end-mock.html?t=350|850|2400`.
  `&last=1` son bölüm durumunu gösterir. Bu HTML **statik tasarım maketidir**;
  üretim oyununun yeni bileşeni veya çalışan zaman çizelgesi değildir.
  Maketin düğmeleri yalnız erken dokunma/ölçü kontrolü için bir test sonucu yazar.

### Zaman çizelgesi — son doğru cevaba göre, kuyruktan bağımsız

| Zaman | Görsel olay | Sorumlu öğe / davranış |
| --- | --- | --- |
| 0 ms | Son cevap yeşil onay alır; bölüm sonucu kaydedilir. | Variant mantığı bir defa tamamlar ve `levelend` açar. Eski 1 saniyelik bağımsız panel zamanlayıcısı kaldırılır. |
| 0–180 ms | Mevcut ray/çift konumu korunur, varsa eski hareket kuyruğu son durum sunumuna devredilir. | `train` hook'u mantıksal son snapshot'ı alır; son cevabı bekleyen uzun Promise zinciri görsel sonucu geciktiremez. Görünür son çift korunur; birikmiş eski kuyruk sessizce iptal/sonlandırılır. |
| 120–450 ms | Alt rayın ahşap yatağı kalınlaşarak peron kenarına dönüşür. | `.wt-levelend__platform` gerçek ray üstüne yerleşir; kalınlık yaklaşık 16→34 px. Rayın temas çizgisi hareket etmez. |
| 180–650 ms | Krem istasyon gövdesi perondan aşağı açılır; petek/seçenekler 180 ms solup 6 px aşağı gider. | `.wt-levelend__body` üstten aşağı clip reveal; içerik ve yazılar ölçeklenmez. Alttaki eski kontrol çubuğu da gider. Karartılmış ikinci bir popup yoktur. |
| **600 ms** | **Üç sonuç eylemi tam opak ve dokunulabilir.** | Sabit `.wt-levelend__actions`: Sonraki bölüm, Tekrar oyna, Bölümler. Etkinleşme CSS/animationend veya tren kuyruğunu beklemez. Pratik üst sınır 900 ms. |
| 200–1100 ms | Son kelimenin kalan küpleri sırayla oturur; altın kanca ve son tamlama etiketi belirginleşir. | Mevcut küp düşüşü korunabilir. Son vagonda suffix/base dönüşümü yapılmaz: **ÇİZGİSİ** kalır; aranan hayalet kaldırılır. Zaten oturmuş harfler yeniden düşürülmez. |
| 450–1600 ms | İstasyon adı yerine oturur; lokomotif üst rayda kısa mesafeyle yanaşır. | `.wt-levelend__dock` içindeki **mevcut tren DOM'u**, bölüm sonuna özel sunum yerleşimi. Ara vagonlar 180 ms solar; karşılıkları bilet panosunun son tamlamalarıyla anlatılır. Lokomotif tam görünür, küpler dönmez. |
| 700–1200 ms | Son üç tamlama bilet panosunda sırayla belirir. | `.wt-levelend__receipt`: en fazla üç satır, satır başına 70 ms fark ve 160 ms opacity. Son satır mevcut çiftle aynı yeşil/altın vurgudadır. |
| 1600–2300 ms | Tek hafif teker/şasi oturuşu, kısa düdük ve 3–4 küçük kâğıt parçası. | Tren 2 px oturur; lokomotif buharı 450 ms solar. Son tamlama etiketine küçük onay işareti basılır. Konfeti bütün ekranı kaplamaz, döngü yoktur. |
| 2400 ms sonrası | Sakin, tamamlanmış istasyon. | Tren ve sonuçlar kalır. Otomatik ayrılış/tur tekrarına başlanmaz. |
| Herhangi bir eyleme basış | Kalan görseller anında bitirilir ve seçilen işlem çalışır. | Aynı pointerup eylemi seçer; ilk dokunuş yalnız “atla” için tüketilmez. Sahneyi bitirip yeni bölümü açmak için animasyon beklenmez. |

2400 ms görsel koreografidir, oyuncunun bekleme süresi değildir. Normal oyun
animasyonlarına 1,6 saniye limiti geri getirilmez. Bölüm sonu eylemleri 600 ms'de
hazırdır; tren kalan hareketini kendi yapar. Render gecikirse düğmeler doğrudan
son yerinde görünür; zaman çizelgesinin ara kareleri yetiştirilmeye çalışılmaz.

### Yerleşim ve mobil ölçüler

390×844 referansında HUD 12..60 px; istasyon sahnesi 66..256 px; peron rayının
teması yaklaşık y250 px; 34 px ahşap dudak y239..273 px. Sonuç gövdesi bunun
altından ekranın dibine uzanır. Son çift yaklaşık x23..367 px, 24 px küpler,
12 px altın kanca; son kelime normal büyük Türkçe harflerle okunur. Etiket
ahşap dudağın **altında** başlar, hiçbir harf dudağın arkasına girmez.

Lokomotif üst rayda tamamen görünür; bu satırın gidiş yönü sağ olduğu için
sağa bakar. Yanaşma bu yönde 18–36 px'lik kısa hareket olabilir. U dönüşünün
devamı kadraj dışında kalabilir. Bu, bütün zincirin mesafe doğruluğunu gösteren
bir ray turu değil, mevcut araçların sonuç istasyonundaki sunum yerleşimidir:
ara vagonlar saklanır, son çift ve lokomotif öne çıkar. Yeni bir ikinci tren
çizilmez; farklı yönde kayan dekoratif lokomotif kullanılmaz.

Sonuç başlığı tek satır “Bölüm tamamlandı!”, altında üç küçük istatistik:
**9 bağlantı / 0 hata / 0 yardım**. Bilet panosu yalnız son üç tamlamayı gösterir;
sonuncusu koyu yeşil onaylıdır. Uzun tamlamalar iki satıra sarılır; tamlama
yerine base adları yan yana eklenmez, doğrudan `chain[].phrase` kullanılır.
Tam listeyi gösteren yeni bir zorunlu popup yoktur.

Ana düğme altta tam genişlikte **Sonraki bölüm**, min-height 56 px; ikinci
satırda **Tekrar oyna** ve **Bölümler**, min-height 52 px. Sol/sağ iç pay 18 px,
alt pay `max(16px, env(safe-area-inset-bottom))`. En alttaki eylemler son
konumlarına doğrudan gelir; oyuncu dokunurken yer değiştirmez. Alt güvenli
alan kadar eylem bloğu yukarı alınır, yazılar küçültülmez.

360×640'ta peron yaklaşık y212 px; istasyon gövdesi kalan 428 px'i kullanır.
Küp eni korunur (bu örnekte24 px), yalnız araç yükseklikleri azalır. Ana
düğme52 px, diğerleri48 px; başlık22 px; bilet satırları28 px. HUD/safe-area
haricindeki gereksiz boşluklar daralır. Öncelik sırası: düğmeler → okunur son
çift → sonuç başlığı/istatistik → son bağlantılar. Uzun metin veya büyük sistem
yazısı sığmazsa biletin son üç satırı ikiye/bire düşer; bunlar da sığmazsa
yalnız orta sonuç alanı kayabilir. Ana düğmeler ve tren sabit kalır. **Sayfanın
tamamı kaymaz; düğmeler 48 px altına inmez.** Uzun çift için mevcut min20/18px
kuralları geçerlidir; yeni sonuç paneli bu alt sınırı düşürmez.

### Paylaşılan bileşen ve tren sorumluluğu

`core/levelend.js` demo ve v4'te aynı istasyon sunumunu oluşturur. Varyant yalnız
tamamlanan seviye/veri ve eylem callback'lerini verir; panelin ayrı bir v4
kopyası olmaz. Aşağıdaki isimler önerilen uygulama sözleşmesidir; bu teslim
tasarım ve statik maket içerir, çalışan core bileşeni içermez.

```html
<section class="wt-levelend" role="dialog" aria-modal="true"
         aria-labelledby="wt-levelend-title">
  <div class="wt-levelend__dock"><!-- aynı .wt-train DOM'u, end-mode --></div>
  <div class="wt-levelend__station-sign"><!-- bölüm adı, metin --></div>
  <div class="wt-levelend__platform" aria-hidden="true"></div>
  <div class="wt-levelend__body">
    <div class="wt-levelend__phrase"><!-- tam son tamlama --></div>
    <h2 id="wt-levelend-title">Bölüm tamamlandı!</h2>
    <div class="wt-levelend__stats"><!-- bağlantı / hata / yardım --></div>
    <div class="wt-levelend__receipt"><!-- en fazla son 3 tamlama --></div>
    <p class="wt-levelend__all-complete" hidden></p>
    <footer class="wt-levelend__actions"><!-- sabit alt eylemler --></footer>
  </div>
</section>
```

- **`levelend`**: tek zaman başlangıcı, istasyon yüzeyi, veri metinleri,
  responsive ölçüler, modal odak/eylemler ve tüm temizleme. Önerilen girdi
  `{ train, level, found, mistakes, hints, last, onNext, onReplay, onLevels }`;
  dönüş `{ finish, destroy }`. Aynı sonucu iki kez açma idempotent olmalı.
- **`train`**: `enterEnd({ snapshot, lastPhrase, dockBounds })` benzeri hook.
  Son çiftin bounding box'larını koruyarak peron rayını verir; hayaleti
  kaldırır; görünür harfleri yeniden üretmeden tamamlar; lokomotifi ve son
  çifti istasyon yerleşimine alır. Son kelime `word` olarak kalır, son önceki
  vagon `base` olarak kalır. Eski suffix döküntüleri temizlenir. Geçerli
  hareketler aynı son durumdan devam eder; birikmiş eski kuyruk geçersiz
  kılınır. `celebrate({depart:true})` eşzamanlı çalıştırılmaz.
- **`finish()`**: tüm WAAPI/CSS/JS görsellerini son kareye alır; kuyruk,
  düdük ve timeout'ları iptal eder; eski animasyon callback'i yeni bölüm
  trenine dokunamaz. Eylem callback'i tek sefer çağrılır. DOM taşıma gerekiyorsa
  eski placeholder ve ölçü geri yüklenir; çift tren/duplicate ID oluşmaz.
- **V4/demo**: oyun mantığı tamamlandığında ortak bileşeni açar. Petek/cevap
  seçenekleri etkileşime kapanır; mevcut HUD kontrolleri modalın arkasında
  inert olur. Bileşenin altındaki **Bölümler** eylemi erişilebilir kalır.
  Demo'da da aynı sonuç, üç eylem ve aynı skip davranışı kullanılır.
- **Katmanlar**: taş/seçenek100 → istasyon arka yüz110 → ray/peron120 →
  araçlar130 → sonuç metni/eylemler140. Bunlar bileşen içi göreli sıralardır;
  uygulamadaki admin/level-list modal sırası ile koordine edilir. Dekor ve
  buhar `pointer-events:none`; saydam görsel katman düğmeyi engelleyemez.

Yeni varlıklar `assets/station-platform.svg` (ahşap dudak + temas rayı) ve
`assets/station-sign.svg` (metinsiz tabela çerçevesi); ikisi toplam yaklaşık
1,5 KB. Etiketler canlı HTML metnidir; SVG içine Türkçe kelime gömülmez.
Lokomotif, güverte, tekerlek, damar ve ikonlar mevcut küçük varlıklardır.
Görsel CSS'in somut örneği `design/level-end-mock.html` içinde; ortak bileşen
yapılırken sınıflar bu sözleşmeye taşınır. `core/theme.css` bu tasarım
tesliminde üretim bileşeni varmış gibi kullanılmayan sınıflarla genişletilmedi.

### Son bölüm, erişilebilirlik ve hareket azaltma

Son bölümde başlık **Bütün duraklar tamam!**; not **Tüm bölümler tamamlandı.
Yeni bir yolculuk için bir bölüm seç.** Ana eylem **Bölüm seç**, ikinci tam
genişlikte **Tekrar oyna**. “Sonraki bölüm” gizli fakat odaklanabilir bir
öğe olarak bırakılmaz; DOM'da yoktur. Tamamlama ve istasyon aynı kalır.
Örnek maket son-bölüm durumunu gösterirken örnek Kitap Treni verisini korur;
üretimde isim/istatistik/son tamlamalar gerçek son bölümden gelir.

`prefers-reduced-motion:reduce`: platform/taş/araç hareketi, küp düşüşü,
bounce, konfeti ve buhar yoktur. Mevcut ekran 120–160 ms opacity ile doğrudan
aynı bitmiş istasyona geçer; düğmeler en geç160 ms'de kullanılabilir. Ses
mevcut ses ayarına bağlıdır; hareket azaltma tercihi ses tercihini değiştirmez.

Dialog tek defa “Bölüm tamamlandı, 9 bağlantı, 0 hata, 0 yardım” duyurur;
animasyon kareleri live-region'a yazılmaz. Son çiftin görsel küpleri ekran
okuyucu için birleştirilmiş tamlama olarak sunulur. İlk odak erişilebilir
olduğu anda ana eyleme alınır, odak modal içinde kalır. Escape/geri, gizli
tamamlanmış tahtaya dönmek yerine **Bölümler** ile aynı güvenli çıkışı
çalıştırır. Tekrarlı dokunma tek geçiş üretir. Renk tek başarı göstergesi
değildir; onay işareti ve metin birlikte kullanılır.

### Uygulama kabul kontrolleri

1. Son doğru pointerup'tan600–900 ms sonra, tren hareket ederken **Sonraki
   bölüm** tek dokunuşla yeni bölümü açar. Tekrar ve bölüm listesi de aynı.
2. Hızlı cevaplarla uzun tren kuyruğu oluşmuşken sonuçtaki son çift ve
   istatistik mantıksal son cevaba aittir; eski kuyruk sonuç ekranını bozmaz.
3. 390×844 ve360×640: peron-ray-tekerlek temasında kopma yok; lokomotif
   yerleştikten sonra tamamen görünür; son tamlama ve alt eylemler kırpılmaz.
4. Normal/son bölüm, demo/v4, reduced-motion ve alt safe-area34px durumlarında
   bütün eylemler ≥48px; sayfa scroll'u ve konsol hatası yok. İki satıra saran
   uzun tamlama ve büyük yazı boyutu için orta alan esner/kayar.
5. Erken çıkıştan sonra eski düdük/partikül/kuyruk yeni bölüme sızmaz; eski
   train DOM'u ikinci kez yaratılmaz. Tekrarlı aç/kapat ve resize tutarlıdır.

Bu teslimde statik maketin ölçüleri, düğme hit-test'i, son bölüm ve hareket
azaltma yerleşimi kontrol edilmiştir (`design/level-end-checks.json`). Gerçek
zamanlı geçiş, gerçek kuyruğu kesme ve oyun entegrasyonu opus-core/v4
uygulamasından sonra yukarıdaki kontrollerle doğrulanmalıdır.
