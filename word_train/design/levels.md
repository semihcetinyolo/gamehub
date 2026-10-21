# Word Train — gündelik ve tekrarsız bölüm tasarımı

## Güncel kurallar

12 bölüm, **98 cevap**, başlangıçlar dahil **110 kelime**, **686 çeldirici**.
Cevap sayıları `5, 6, 7, 8, 9, 9, 9, 9, 9, 9, 9, 9`;
`chain.length = cevap sayısı + 1`. İlk bölüm kullanıcının kitap örneğinin ilk beş
cevabını korur. Sonraki bölümler uzunluk ve gündelik anlam geçişleriyle zorlaşır.

- Her tamlama bütün oyunda **bir kez** geçer: 98 bağlantının 98'i farklıdır.
- Bir cevap kökü en fazla **iki farklı bölümde** kullanılır.
- Tekrarlanan kökün önceki ve sonraki komşuları farklıdır. Aynı ilişkiyi ters
  çevirmek de tekrar sayılır; örneğin `etiket fiyatı / fiyat etiketi` birlikte yoktur.
- Bölüm içinde cevap ve kök tekrarı yoktur.
- Her halkada **1 doğru + 7 çeldirici** bulunur; aynı Türkçe ilk harf, benzersizlik,
  iyelik/tamlama biçimi ve **±3 harf** uzunluk sınırı korunur.
- `I ≠ İ`, `C ≠ Ç`, `G ≠ Ğ`, `O ≠ Ö`, `S ≠ Ş`, `U ≠ Ü`; harf sadeleştirme yoktur.

`levels.js` yalnız hazır veriyi dışa aktarır: `export const LEVELS`.
Başlangıç `{word, base}`, cevap `{word, base, phrase, hint, distractors}` biçimindedir.
`phrase = lowerTr(prev.base) + ' ' + lowerTr(word)`; sonraki halkada çekimli
kelime köküne döner. `NOTLARI` halkasındaki bütün seçenekler çoğuldur.

## Tekrar istatistikleri

| Ölçüt | Sonuç |
| --- | --- |
| Toplam tamlama | 98 |
| Farklı tamlama | 98 |
| Birden fazla kullanılan tamlama | 0 |
| Farklı cevap kökü | 89 |
| Yalnız bir bölümde cevap olan kök | 80 |
| İki bölümde cevap olan kök | 9 |
| Bir cevap kökünün en fazla göründüğü bölüm sayısı | 2 |
| Tekrarlanan komşu kök çifti (iki yön birlikte) | 0 |
| Başlangıçlar dahil farklı kök | 100 |
| Başlangıçlar dahil bir kökün en fazla göründüğü bölüm sayısı | 2 |
| Farklı yedili çeldirici seti | 98 |

İki bölümde cevap olan kökler ve farklı komşuları:

| Kök | Bölümler | İlk kullanımın komşuları | İkinci kullanımın komşuları |
| --- | --- | --- | --- |
| KAPAK | 1, 4 | KİTAP / TASARIM | ŞİŞE / RESİM |
| SAAT | 2, 3 | DUVAR / PİL | KOL / ALARM |
| ALARM | 3, 7 | SAAT / SES | EV / SİSTEM |
| SES | 3, 9 | ALARM / KAYIT | PATLAMA / TON |
| SU | 4, 11 | MEYVE / ŞİŞE | KAYNAK / FATURA |
| ŞİŞE | 4, 6 | SU / KAPAK | YAĞ / MANTAR |
| YAZI | 5, 10 | TABELA / MASA | ETİKET / TAHTA |
| BİLET | 6, 10 | MAÇ / GİŞE | DÖNÜŞ / FİYAT |
| ÇORBA | 6, 9 | MANTAR / TABAK | BALIK / KAŞIK |

`KİTAP` ayrıca 1. bölümün başlangıcı ve 12. bölümün cevabıdır; komşuları yine
farklıdır. Başlangıcı yeniden kullanarak sınırı aşma veya aynı komşuyu gizleme yoktur.

## Bölüm alanları ve uzunlukları

Tema zincirin başladığı alanı tanımlar; kelimelerin gündelik farklı anlamlara
geçmesine izin verir. Bölümler aynı saat/alarm/ses/kitap/ders yoluna dönmez.

| Bölüm | Başlık | Cevap | Başlangıç dahil | Alan ve geçiş |
| --- | --- | --- | --- | --- |
| 1 | Kitap Treni | 5 | 6 | Okuma ve iş hayatı: kitap kapağından birlikte çalışmaya. |
| 2 | Okul Bahçesi | 6 | 7 | Okul, bahçe ve ev eşyaları; yaşam süresinde biter. |
| 3 | Yatak Odası | 7 | 8 | Yatak odası, kapı ve uyanma; ses kaydı yalnız burada. |
| 4 | Meyve Suyu | 8 | 9 | İçecek, ambalaj, çizim ve telefon; numara değişikliğiyle biter. |
| 5 | Şehir Turu | 9 | 10 | Yerel yönetim, toplu taşıma ve çalışma masası. |
| 6 | Maç Günü | 9 | 10 | Spor bileti ve sıra bekleme; kuyruk kelimesiyle mutfağa geçer. |
| 7 | Evden Oyuna | 9 | 10 | Ev güvenliği, ekrandaki uyarı, yazışma, oyun ve iş görüşmesi. |
| 8 | Aile Fotoğrafı | 9 | 10 | Aile hatırası ve ev eşyası; cam parçasından sağlık giderlerine geçer. |
| 9 | Ormandan Sofraya | 9 | 10 | Doğa ve güvenlik haberleri; ses tonu → ton balığı ile sofraya geçer. |
| 10 | Tatil Dönüşü | 9 | 10 | Tatil, ulaşım, alışveriş ve okul araçları. |
| 11 | Müzik ve Haber | 9 | 10 | Öğretmenlik, ücret haberi, bilgi kaynağı ve ev giderleri. |
| 12 | Randevu Günü | 9 | 10 | Sağlık randevusu, tarih dersi ve okur-yazar buluşması. |

## 12 zincir — yalnız tamlamalar

Oklar ortak kelimenin kökünü takip eder. Her satırın son tamlaması o bölümün son cevabıdır.

1. kitap kapağı → kapak tasarımı → tasarım ekibi → ekip toplantısı → toplantı notları

2. okul bahçesi → bahçe duvarı → duvar saati → saat pili → pil ömrü → ömür boyu

3. yatak odası → oda kapısı → kapı kolu → kol saati → saat alarmı → alarm sesi → ses kaydı

4. meyve suyu → su şişesi → şişe kapağı → kapak resmi → resim defteri → defter sayfası → sayfa numarası → numara değişikliği

5. ilçe belediyesi → belediye otobüsü → otobüs durağı → durak tabelası → tabela yazısı → yazı masası → masa lambası → lamba düğmesi → düğme deliği

6. futbol maçı → maç bileti → bilet gişesi → gişe kuyruğu → kuyruk yağı → yağ şişesi → şişe mantarı → mantar çorbası → çorba tabağı

7. ev alarmı → alarm sistemi → sistem hatası → hata mesajı → mesaj kutusu → kutu oyunu → oyun hamuru → hamur işi → iş görüşmesi

8. düğün fotoğrafı → fotoğraf çerçevesi → çerçeve camı → cam kırığı → kırık tedavisi → tedavi masrafı → masraf listesi → liste başı → baş ağrısı

9. orman yangını → yangın tüpü → tüp patlaması → patlama sesi → ses tonu → ton balığı → balık çorbası → çorba kaşığı → kaşık sapı

10. yaz tatili → tatil dönüşü → dönüş bileti → bilet fiyatı → fiyat etiketi → etiket yazısı → yazı tahtası → tahta kalemi → kalem ucu

11. müzik öğretmeni → öğretmen maaşı → maaş zammı → zam haberi → haber kaynağı → kaynak suyu → su faturası → fatura borcu → borç faizi

12. çocuk hastanesi → hastane randevusu → randevu tarihi → tarih dersi → ders kitabı → kitap yazarı → yazar imzası → imza günü → gün sayısı

## Gündelik dil ve ipucu denetimi

Seçimler ev, okul, sokak, maç bileti, yemek, telefon, alışveriş, çalışma, sağlık
randevusu ve ev bütçesi gibi sıradan yetişkin bağlamlarından gelir. Sıklık değerlendirmesi
editoryaldir; ölçülmüş derlem sayıları veya bütün ifadelerin sözlük madde başı olduğu
iddia edilmez. Uzmanlık gerektiren `alan derinliği`, `halka çapı`, `hacim hesabı`
gibi eski bağlantılar ve kullanıcının belirttiği `damla sesi` geri getirilmedi.

`alarm sistemi / sistem hatası / hata mesajı`, günlük ev güvenliği ve cihaz
kullanıcısının gördüğü ifadeler olarak kullanılır; iç işleyiş veya uzmanlık bilgisi
sorulmaz. `borç faizi` normal ev bütçesi ifadesidir; teknik finans hesabı yapılmaz.
`ömür boyu` herkesin kullandığı süre ifadesidir; kökü `BOY` olarak korunur.

Anlam değiştiren köprüler açık ipuçlarıyla ayrılır: `gişe kuyruğu` insan sırası,
`kuyruk yağı` yemek malzemesidir; `ses tonu` konuşmanın duyuluşu,
`ton balığı` deniz canlısıdır. Fotoğraf çerçevesinden cam kırığına, oradan sağlık
bakımına geçiş de somut kelimelerle kurulur.

Her çeldirici gerçek, tanıdık bir kelimenin çekimidir; önceki kökle her yanlış
seçeneğin yaygın bir tamlama kurması beklenmez. Ancak **ipucuna uyan ikinci bir
gerçek tamlama** olmamalıdır. Eşanlamlı seçenekler elenir: `ses tonu` için `TÜRÜ`
kullanılmadı; `çorba tabağı` için `TASI`, `kırık tedavisi` için `TAMİRİ`
kullanılmadı. Çoğul `NOTLARI` için çoğul seçenekler korunur.

Anlam ipucunun açılışı oyuna aittir; mevcut akışta önce ilk harf verilir, anlam
ipucu ilk yardımda gösterilir. İpucu açılmadan farklı bir anlamda kurulabilen
bir tamlama Türkçede yanlış ilan edilmez. İpuçları cevabı veya kökünü açıkça yazmaz.

## Önceki sürümdeki tekrarların çözümü

Önceki 98 halkada 62 farklı tamlama ve 17 tekrarlanan tamlama vardı;
36 fazla kullanım kaldırıldı. Güncel veri 98 farklı tamlamadır.

| Önceki tekrarlanan tamlama | Eski kullanım | Yeni kullanım |
| --- | --- | --- |
| kapı kolu | 2 | 1 |
| kol saati | 2 | 1 |
| saat alarmı | 5 | 1 |
| alarm sesi | 5 | 1 |
| ses kaydı | 5 | 1 |
| kapak resmi | 3 | 1 |
| resim dersi | 2 | 0 |
| ders kitabı | 5 | 1 |
| kitap yazarı | 4 | 1 |
| yazar imzası | 3 | 1 |
| kayıt tarihi | 3 | 0 |
| tarih dersi | 4 | 1 |
| imza günü | 2 | 1 |
| yazı tahtası | 2 | 1 |
| tahta kalemi | 2 | 1 |
| kalem kutusu | 2 | 0 |
| kutu kapağı | 2 | 0 |

Önceki sürümden tamamen çıkan ifadeler aşağıdadır. Bunlar seyrek oldukları için
değil, aynı köklere tekrar dönüşü kırmak ve bölüm alanlarını ayırmak için çıkarıldı:

`bahçe kapısı`, `fatura tarihi`, `görüşme saati`, `güneş kremi`, `haber programı`, `hediye paketi`, `kalem kutusu`, `kayıt tarihi`, `krem kutusu`, `kutu kapağı`, `orman yolu`, `paket servisi`, `program saati`, `randevu saati`, `resim dersi`, `servis saati`, `yağmur suyu`, `yol tabelası`.

`bahçe duvarı`, `çorba tabağı`, `kırık tedavisi`, `fatura borcu` gibi yeni bağlantılar
uzmanlık terimi eklemeden kök çeşitliliğini artırır. Daha önce yalnız zincir değişimi
nedeniyle çıkarılmış gündelik `defter sayfası`, `kaynak suyu` ve `düğme deliği`
yeni grafikte farklı komşuluklarla kullanıldı; bunlar önceki denetimde de seyrek
olarak işaretlenmemişti.

## 98 halkanın seçenek ve ipucu tablosu

| Halka | Tamlama | Bağlam | İpucu | Yedi çeldirici | Eleme ölçütü |
| --- | --- | --- | --- | --- | --- |
| 1.1 | kitap kapağı | Okuma | Cilde bağlı, ilk sayfadan önce açtığımız koruyucu bölüm. | KILIFI, KUTUSU, KONUSU, KAYDI, KOKUSU, KÖŞESİ, KULPU | Cilde bağlı açılan parça; dış kılıf, kutu, içerik ve bilgiler değildir. |
| 1.2 | kapak tasarımı | Kitap seçimi | Ön yüzün renklerini, resmini ve yazı yerlerini planlama işi. | TARİHİ, TAMİRİ, TALEBİ, TUTANAĞI, TAKVİMİ, TABELASI, TUTARI | Görünüşü planlama eylemi; tarih, onarım, yönerge ve eşya değildir. |
| 1.3 | tasarım ekibi | İş hayatı | Bir ürünün görünüşünü birlikte hazırlayan kişiler topluluğu. | EMEĞİ, EŞYASI, EKMEĞİ, ELİ, ESERİ, ETİKETİ, EKRANI | Çalışan kişiler topluluğu; emek, eşya, eser ve araç değildir. |
| 1.4 | ekip toplantısı | İş hayatı | Birlikte çalışanların konuşmak için aynı zamanda bir araya gelmesi. | TABELASI, TALİMATI, TESLİMATI, TUTANAĞI, TATİLCİSİ, TAŞIMASI, TEMİZLİĞİ | Konuşma amacıyla buluşma; belge, teslimat, temizlik ve tercih değildir. |
| 1.5 | toplantı notları | İş hayatı | Konuşulanları unutmamak için yazılan kısa hatırlatma maddeleri. | NEDENLERİ, NİYETLERİ, NUMARALARI, NEFESLERİ, NÖBETLERİ, NARLARI, NİŞANLARI | Yazılı hatırlatmalar; neden, niyet, numara, nefes, nöbet, nar ve nişan değildir. |
| 2.1 | okul bahçesi | Okul | Teneffüste binanın dışında koşup oynadığımız açık alan. | BİNASI, BÜFESİ, BÖLÜMÜ, BAYRAĞI, BÜTÇESİ, BELGESİ, BALONU | Açık oyun alanı; bina, büfe, bölüm, bayrak, bütçe veya eşya değildir. |
| 2.2 | bahçe duvarı | Ev ve bahçe | Evin dışındaki yeşil alanı çevreleyen taş veya tuğla sınır. | DESENİ, DÜZENİ, DİLİ, DEĞERİ, DÜĞMESİ, DOLABI, DAVULU | Taş veya tuğladan çevreleyici yapı; desen, düzen, değer, mobilya ve dilek değildir. |
| 2.3 | duvar saati | Ev | Odanın dik yüzeyine asılan, akrep ve yelkovanla zamanı gösteren araç. | SARGISI, SÜSÜ, SINIRI, SAYISI, SAÇI, SERTLİĞİ, SIZISI | Asılan zaman göstergesi; süre, sayı, sınır ve eşya değildir. |
| 2.4 | saat pili | Ev | İçine takıldığında çalışması için elektrik sağlayan küçük parça. | PARASI, PAKETİ, PERDESİ, PULU, PUANI, PLANI, PİDESİ | Elektrik kaynağı; paket, perde, para, yiyecek ve diğer nesneler değildir. |
| 2.5 | pil ömrü | Ev | Yenisi takılana kadar enerji sağlayabildiği toplam süre. | ÖDEVİ, ÖDÜLÜ, ÖFKESİ, ÖYKÜSÜ, ÖZLEMİ, ÖZETİ, ÖRNEĞİ | Kullanılabilir süre; ödev, ödül, duygu, örnek veya özet değildir. |
| 2.6 | ömür boyu | Gündelik anlatım | Doğumdan yaşamın sonuna kadar, hep. | BALI, BİBERİ, BANYOSU, BALONU, BİLETİ, BİNASI, BOYASI | Yaşamın tümüne yayılan süre ifadesi; nesne, yiyecek ve borç değildir. |
| 3.1 | yatak odası | Ev | Evde uyumak için ayrılan bölüm. | ORMANI, OYUNU, OKULU, OCAĞI, ORANI, OTELİ, OTOBÜSÜ | Uyunan bölüm; oyun, orman, okul, ocak, oran veya taşıt değildir. |
| 3.2 | oda kapısı | Ev | Evde bir bölüme girerken açıp arkamızdan kapattığımız geçit. | KÖŞESİ, KUTUSU, KOVASI, KOKUSU, KİLİMİ, KİLİDİ, KULÜBESİ | İçeri geçilen açıklık; kilit, köşe, eşya ve koku değildir. |
| 3.3 | kapı kolu | Ev | Açmak için elimizle aşağı bastırdığımız yatay tutamak. | KABI, KODU, KİLİDİ, KASASI, KİLİMİ, KAYDI, KOKUSU | Bastırılan tutamak; kilit, kasa, kod ve diğer eşyalar değildir. |
| 3.4 | kol saati | Giyinme | Bileğe takılan ve zamanı gösteren küçük araç. | SÜSÜ, SINIRI, SAYISI, SAÇI, SERTLİĞİ, SIZISI, SÜRESİ | Zaman gösteren araç; süs, sargı, sayı, süre ve vücut özelliği değildir. |
| 3.5 | saat alarmı | Günlük program | İstediğimiz zamanda çalıp bizi uyandırması için kurduğumuz uyarı. | AMACI, ALANI, ANISI, ADRESİ, ARIZASI, AĞIRLIĞI, AYNASI | Kurulup çalan uyarı; amaç, adres, arıza, ağırlık ve nesne değildir. |
| 3.6 | alarm sesi | Günlük program | Uyarı çaldığında kulağımızla duyduğumuz zil gürültüsü. | SÜSÜ, SAYISI, SINIRI, SÜRESİ, SIRASI, SAHİBİ, SÖZÜ | İşitilen zil; süre, sayı, sıra, sahip, söz ve eşya değildir. |
| 3.7 | ses kaydı | Telefon kullanımı | Konuşmayı sonradan aynen dinlememizi sağlayan saklanmış veri. | KODU, KAYBI, KAYNAĞI, KALIBI, KANALI, KALİTESİ, KUTUSU | Tekrar dinlenebilen veri; kaynak, kanal, kalite, kayıp, kod ve kap değildir. |
| 4.1 | meyve suyu | Mutfak | Portakal gibi ürünleri sıkarak elde ettiğimiz içecek. | SESİ, SÜSÜ, SİSİ, SÖZÜ, SEPETİ, SIRRI, SAYISI | Sıkılarak elde edilen içecek; süt, sabun, sis, söz veya başka nesne değildir. |
| 4.2 | su şişesi | Mutfak | İçecek taşımak için kullanılan, dar boyunlu ve vidalı ağızlı kap. | ŞEKLİ, ŞERİDİ, ŞİDDETİ, ŞAKASI, ŞARTI, ŞARKISI, ŞAPKASI | Dar boyunlu kap; şekil, şerit, şiddet, şaka, şart, şarkı ve şapka değildir. |
| 4.3 | şişe kapağı | Mutfak | İçmek için ağız kısmından çevirerek çıkardığımız küçük parça. | KUTUSU, KONUSU, KAYDI, KOKUSU, KÖŞESİ, KULPU, KARTI | Vidalanan ağız kapatıcısı; kılıf, kutu, kulp, köşe ve özellik değildir. |
| 4.4 | kapak resmi | Okuma | Kitabın ön yüzündeki kişi, nesne veya manzarayı gösteren görsel. | RAPORU, RENGİ, RAKAMI, REÇETESİ, RÜYASI, ROMANI, RADYOSU | Bir şeyi tasvir eden görsel; renk, rakam, rapor, reçete ve nesne değildir. |
| 4.5 | resim defteri | Okul | Çizim yapmak için boş yaprakları bir kenarından ciltlenmiş araç. | DOSYASI, DESENİ, DÜZENİ, DİLİ, DEĞERİ, DÜĞMESİ, DUVARI | Ciltli boş yapraklar; dosya, düzen, desen ve mobilya değildir. |
| 4.6 | defter sayfası | Okul | Ciltteki tek bir yaprağın yazı yazılan yüzü. | SIRASI, SAYISI, SATIRI, SÜSÜ, SAHİBİ, SEPETİ, SİLGİSİ | Yaprağın bütün yüzü; satır tek çizgi, sayı adet, sıra konum, diğerleri nesne veya özelliktir. |
| 4.7 | sayfa numarası | Okuma | Bir yaprağın sırasını göstermek için köşesine yazılan rakam. | NEDENİ, NİYETİ, NOKTASI, NEFESİ, NÖBETİ, NEŞESİ, NİŞANI | Sıralamayı belirten rakam; nokta, neden, niyet, duygu veya özellik değildir. |
| 4.8 | numara değişikliği | Telefon kullanımı | Eski telefon hattındaki rakamların yerine yeni bir dizinin kullanılmaya başlanması. | DİREKSİYONU, DAVETİYESİ, DONDURMASI, DOMATESİ, DETERJANI, DİKKATSİZLİĞİ, DAVRANIŞI | Eskisinin yerine yenisinin geçmesi; nesne, davetiye, yiyecek veya davranış özelliği değildir. |
| 5.1 | ilçe belediyesi | Şehir | Yerleşim yerindeki yol, çöp ve park işlerinden sorumlu yerel yönetim. | BATTANİYESİ, BİLEZİĞİ, BİLGİSİ, BÜYÜKLÜĞÜ, BAĞLANTISI, BİSİKLETİ, BAHÇESİ | Yerel yönetim kurumu; bilgi, büyüklük, bağlantı ve nesne değildir. |
| 5.2 | belediye otobüsü | Ulaşım | Yerel yönetimin şehir içinde yolcu taşıyan büyük toplu taşıma aracı. | OCAĞI, OYUNU, OKULU, ORMANI, OTELİ, OYUNCAĞI, ORANI | Toplu taşıma aracı; oyuncak, okul, otel, orman ve otopark değildir. |
| 5.3 | otobüs durağı | Ulaşım | Toplu taşıma aracını beklediğimiz, yolcuların inip bindiği belirli yer. | DESENİ, DÜZENİ, DİLİ, DEĞERİ, DÜĞMESİ, DUVARI, DOLABI | Yolcu bekleme noktası; düzen, değer, eşya ve dilek değildir. |
| 5.4 | durak tabelası | Ulaşım | Aracın nerede duracağını ve oranın adını gösteren levha. | TAKVİMİ, TUTARI, TATİLİ, TUTANAĞI, TARİFİ, TABAĞI, TEPSİSİ | Fiziksel ad levhası; tarif, takvim, tutar, tutanak ve nesne değildir. |
| 5.5 | tabela yazısı | Ulaşım | Levhanın üzerindeki, okuyarak yer adını öğrendiğimiz harfler. | YERİ, YÜZEYİ, YAPIŞKANI, YUVASI, YÜKÜ, YAPRAĞI, YASTIĞI | Okunan harfler; yer, yüzey, yapışkan ve malzeme değildir. |
| 5.6 | yazı masası | Ev ve çalışma | Üzerine kâğıt koyup çalışmak için oturduğumuz düz yüzeyli mobilya. | MANTIĞI, MÜZİĞİ, MİDESİ, MEYVESİ, MUMU, MENDİLİ, MİSAFİRİ | Çalışma mobilyası; mantık, müzik, yiyecek, beden bölümü ve kişi değildir. |
| 5.7 | masa lambası | Ev ve çalışma | Çalışırken önümüzü aydınlatmak için mobilyanın üzerine koyduğumuz ışıklı araç. | LİSTESİ, LEKESİ, LİMONU, LAKABI, LOKMASI, LOKANTASI, LİMANI | Işık veren araç; liste, leke, limon, lokma ve yer adı değildir. |
| 5.8 | lamba düğmesi | Ev | Elektrikli aydınlatmayı açıp kapatmak için bastığımız küçük parça. | DÜZEYİ, DÜZENİ, DEĞERİ, DESENİ, DİLİ, DUVARI, DOLABI | Basılan kontrol parçası; düzen, değer, desen, damla ve mobilya değildir. |
| 5.9 | düğme deliği | Giyinme | Giysideki küçük yuvarlak parçanın üzerinden ipliğin geçtiği açıklık. | DESENİ, DİZİSİ, DÜZEYİ, DÜZENİ, DEĞERİ, DOKUSU, DOLABI | Parçanın içindeki iplik açıklığı; desen, dizi, doku, değer ve eşya değildir. |
| 6.1 | futbol maçı | Spor | İki takımın sahada topu kaleye sokmaya çalışarak karşılaştığı oyun. | MASASI, MUMU, MALI, MÜZİĞİ, MİDESİ, MANTIĞI, MEYVESİ | Takımların karşılaşması; nesne, mantık, müzik veya yiyecek değildir. |
| 6.2 | maç bileti | Spor | Stada girip karşılaşmayı izleme hakkı veren belge. | BİLGİSİ, BEDELİ, BOYASI, BAHÇESİ, BALI, BİBERİ, BALONU | Giriş hakkı belgesi; bedel, bilgi, boya, yiyecek ve bina değildir. |
| 6.3 | bilet gişesi | Spor ve ulaşım | Yolculuk veya karşılaşma için giriş belgelerinin satıldığı küçük satış bölmesi. | GÜCÜ, GÜNÜ, GÖZÜ, GÖREVİ, GÖLGESİ, GİYSİSİ, GÜLÜ | Satış bölmesi; gün, görev, gider, beden bölümü ve giysi değildir. |
| 6.4 | gişe kuyruğu | Gündelik işler | Satış penceresinin önünde sırası gelsin diye art arda bekleyen insanlar. | KARTI, KAYDI, KÖŞESİ, KİLİDİ, KUTUSU, KOKUSU, KURALI | Bekleyen insan dizisi; kart, kayıt, köşe, kilit ve nesne değildir. |
| 6.5 | kuyruk yağı | Mutfak | Yemeklere lezzet vermek için koyunun arka bölümünden alınan beyaz madde. | YAŞI, YANI, YÜZÜ, YÜKÜ, YEMİ, YAPISI, YORUMU | Yemekte kullanılan hayvansal madde; yaş, yüz, yük, yem ve yer değildir. |
| 6.6 | yağ şişesi | Mutfak | Yemekte kullanılan sıvıyı saklayan, dar boyunlu cam veya plastik kap. | ŞERİDİ, ŞİDDETİ, ŞAKASI, ŞARTI, ŞARKISI, ŞAPKASI, ŞEMSİYESİ | Dar boyunlu kap; şekil, şerit, şaka, şart, şarkı ve şapka değildir. |
| 6.7 | şişe mantarı | Mutfak | İçecek kabının ağzına sıkıştırılan, ağaç kabuğundan yapılmış tıpa. | MUMU, MALI, MÜZİĞİ, MİDESİ, MANTIĞI, MEYVESİ, MENDİLİ | Kabuktan yapılmış ağız tıpası; masa, mum, yiyecek, müzik ve kişi değildir. |
| 6.8 | mantar çorbası | Mutfak | Kâsede sıcak içilen, küçük doğranmış parçalarla hazırlanan sulu yemek. | ÇANTASI, ÇORABI, ÇİZGİSİ, ÇEKMECESİ, ÇİLEĞİ, ÇÖZÜMÜ, ÇİÇEĞİ | Kâsede içilen yemek; çorap, çanta, çizgi, çekmece ve sofra aracı değildir. |
| 6.9 | çorba tabağı | Sofra | Sıcak sıvı yemeği koyduğumuz, içi çukur sofra kabı. | TOZU, TADI, TÜRÜ, TUTARI, TARİFİ, TAKVİMİ, TABELASI | Çukur yemek kabı; tat, tür, tutar, tarif, takvim, torba ve düz tepsi değildir. |
| 7.1 | ev alarmı | Ev güvenliği | Hırsız girdiğinde çalıp içeridekileri veya sahibini uyaran güvenlik aracı. | ALANI, ANISI, ADRESİ, ARIZASI, AĞIRLIĞI, AYNASI, ARKASI | Kurulup çalan uyarı aracı; adres, amaç, arıza, ağırlık ve nesne değildir. |
| 7.2 | alarm sistemi | Ev güvenliği | Tehlikeyi algılayıp haber veren parçaların birlikte oluşturduğu düzen. | SINIRI, SAYISI, SAÇI, SERTLİĞİ, SIZISI, SÜRESİ, SÖZÜ | Birlikte çalışan parçalar bütünü; süre, sayı, sınır, süs ve nesne değildir. |
| 7.3 | sistem hatası | Gündelik cihaz kullanımı | Bilgisayardaki düzenin çalışmasını bozan yanlışlık. | HABERİ, HEDİYESİ, HARİTASI, HESABI, HIRKASI, HALISI, HIZI | Çalışmayı bozan yanlışlık; haber, hesap, harita, hız ve nesne değildir. |
| 7.4 | hata mesajı | Gündelik cihaz kullanımı | Bir işlem yapılamadığında ekranda görünen açıklayıcı uyarı yazısı. | MALI, MÜZİĞİ, MİDESİ, MANTIĞI, MEYVESİ, MENDİLİ, MİSAFİRİ | Ekrandaki uyarı yazısı; masa, müzik, mantık, yiyecek ve kişi değildir. |
| 7.5 | mesaj kutusu | İletişim | Telefonda gelen yazışmaların bir arada tutulduğu bölüm. | KOKUSU, KONUSU, KAYDI, KÖŞESİ, KULPU, KARTI, KİLİDİ | Yazışmaları barındıran bölüm; koku, konu, kayıt, kulp ve kilit değildir. |
| 7.6 | kutu oyunu | Oyun | Zar ve taş gibi parçaları ambalajından çıkararak masada oynadığımız eğlence. | OCAĞI, OKULU, ORMANI, OTELİ, OTOBÜSÜ, ORANI, ODASI | Kurallarla oynanan masa eğlencesi; oda, okul, otel, oran ve taşıt değildir. |
| 7.7 | oyun hamuru | Çocuk etkinliği | Çocukların yoğurup şekil verdiği renkli, yumuşak malzeme. | HAVASI, HATASI, HABERİ, HEDİYESİ, HARİTASI, HESABI, HIRKASI | Yoğrulan malzeme; hava, hata, haber, hediye, hesap ve eşya değildir. |
| 7.8 | hamur işi | Mutfak | Börek, poğaça ve çörek gibi unla yapılan yiyeceklerin ortak adı. | İPİ, İZİ, İSMİ, İZNİ, İLANI, İLGİSİ, İSTEĞİ | Yiyecek grubunun adı; ip, iz, ad, izin, ilan ve ilgi değildir. |
| 7.9 | iş görüşmesi | İş arama | İşe alınmadan önce adayla yapılan yüz yüze konuşma. | GÖMLEĞİ, GÖREVİ, GÜVENLİĞİ, GÜZELLİĞİ, GEÇMİŞİ, GİDERİ, GÜRÜLTÜSÜ | Adayla konuşma; görev, güvenlik, geçmiş, gider, giysi ve gezi değildir. |
| 8.1 | düğün fotoğrafı | Aile | Evlilik kutlamasında çekilip hatıra olarak saklanan görüntü. | FİYATI, FİLTRESİ, FAYDASI, FİNCANI, FIRÇASI, FISTIĞI, FASULYESİ | Çekilmiş görüntü; fiyat, filtre, fayda, fatura ve mutfak nesnesi değildir. |
| 8.2 | fotoğraf çerçevesi | Ev | Görüntünün kenarlarını çevreleyen, duvara asılabilen sert dışlık. | ÇORABI, ÇİZGİSİ, ÇEKMECESİ, ÇİLEĞİ, ÇÖZÜMÜ, ÇİÇEĞİ, ÇATALI | Sert çevreleyici dışlık; çizgi ince iz, çekmece saklama bölmesi, diğerleri nesne veya özelliktir. |
| 8.3 | çerçeve camı | Ev | Görüntünün önüne takılan, içindekini gösterip tozdan koruyan saydam levha. | CEBİ, CİLDİ, CEVABI, CİNSİ, CİLASI, CEZASI, CÜZDANI | Saydam katı levha; cila kaplama, diğerleri bölüm, yanıt, tür veya nesnedir. |
| 8.4 | cam kırığı | Ev | Parçalanan saydam eşyanın etrafa saçılan keskin parçası. | KÖŞESİ, KİLİDİ, KUTUSU, KOKUSU, KURALI, KARTI, KAZANI | Kopmuş keskin parça; köşe, kayıt, koku, kural ve nesne değildir. |
| 8.5 | kırık tedavisi | Sağlık | Zedelenen kemiğin iyileşmesi için doktorun yaptığı bakım. | TUTARI, TARİFİ, TAKVİMİ, TABELASI, TORBASI, TEPSİSİ, TABAĞI | İyileştirmeye yönelik bakım; tutar, tarif, takvim, tatil ve nesne değildir. |
| 8.6 | tedavi masrafı | Sağlık ve bütçe | İyileşmek için muayene, ilaç ve bakımda harcanan para. | MÜZİĞİ, MİDESİ, MANTIĞI, MEYVESİ, MENDİLİ, MİSAFİRİ, MASASI | Harcanan para; masa, müzik, mantık, beden bölümü, yiyecek ve kişi değildir. |
| 8.7 | masraf listesi | Bütçe | Yapılan harcamaların alt alta yazıldığı döküm. | LAMBASI, LEKESİ, LİMONU, LAKABI, LOKMASI, LOKANTASI, LİMANI | Harcamaları sıralayan döküm; lamba, leke, lokma ve yer değildir. |
| 8.8 | liste başı | Gündelik anlatım | Bir sıralamanın en üstünde bulunan ilk yer. | BİBERİ, BANYOSU, BALONU, BİLETİ, BİNASI, BOYASI, BORCU | İlk konum; yiyecek, bina, bilet, boya ve borç değildir. |
| 8.9 | baş ağrısı | Sağlık | Şakaklarda veya alında hissedilen zonklama ve acı. | ANISI, ADRESİ, ARIZASI, AĞIRLIĞI, AYNASI, ARKASI, AĞACI | Hissedilen acı; ağırlık, arıza, amaç, anı, adres ve nesne değildir. |
| 9.1 | orman yangını | Doğa ve haber | Ağaçların alev alıp hızla yanmasıyla oluşan afet. | YERİ, YAPISI, YORUMU, YÜZEYİ, YILI, YOLU, YAPIŞKANI | Alevli afet; yer, yapı, yorum, yıl, yol ve nesne değildir. |
| 9.2 | yangın tüpü | Güvenlik | Alevleri söndürmek için içindekini püskürttüğümüz kırmızı kap. | TADI, TELİ, TASI, TOZU, TÜYÜ, TAVRI, TARİHİ | Basınçlı söndürme kabı; tas, tel, toz, tüy, tarih ve tabak değildir. |
| 9.3 | tüp patlaması | Gündelik haber | Gaz dolu kabın büyük bir gürültüyle parçalanması. | PENCERESİ, PANTOLONU, PAZARLIĞI, PASTANESİ, PAYLAŞIMI, PİJAMASI, PİŞİRMESİ | Kabın gürültüyle dağılması; nesne, pazarlık, paylaşım ve pişirme değildir. |
| 9.4 | patlama sesi | Gündelik haber | Bir şey gürültüyle parçalandığında kulağımıza gelen güçlü bangırtı. | SAYISI, SINIRI, SÜRESİ, SIRASI, SAHİBİ, SÖZÜ, SÜTÜ | İşitilen bangırtı; süre, sayı, sıra, sahip, söz ve nesne değildir. |
| 9.5 | ses tonu | İletişim | Konuşmanın ince, kalın, yumuşak ya da sert duyulma biçimi. | TOZU, TADI, TABAĞI, TASI, TELİ, TUTARI, TEPSİSİ | Duyuluş niteliği; tat, tel, toz, tutar, tarih ve sofra nesnesi değildir. |
| 9.6 | ton balığı | Mutfak | Konservelerde satılan, salatalara da katılan bir deniz canlısı. | BİLETİ, BİLGİSİ, BEDELİ, BOYASI, BAHÇESİ, BALI, BİBERİ | Deniz canlısı; bal, biber, bilgi, bedel ve nesne değildir. |
| 9.7 | balık çorbası | Mutfak | Denizden tutulan canlıların etiyle yapılan, kâsede sıcak içilen yemek. | ÇİZGİSİ, ÇEKMECESİ, ÇİLEĞİ, ÇÖZÜMÜ, ÇİÇEĞİ, ÇATALI, ÇARŞAFI | Kâsede içilen yemek; giysi, çizgi, çözüm, çekmece ve sofra aracı değildir. |
| 9.8 | çorba kaşığı | Sofra | Sıvı yemeği ağza götürmek için kullanılan, ucu çukur ve saplı araç. | KABI, KODU, KUTUSU, KILIFI, KAPAĞI, KÖŞESİ, KOKUSU | Yeme aracı; kabın kendisi, kod, kılıf, kapak ve köşe değildir. |
| 9.9 | kaşık sapı | Sofra | Yemek yerken çukur ucun gerisinde elimizle tuttuğumuz uzun bölüm. | SINIRI, SÜRESİ, SIRASI, SAHİBİ, SÖZÜ, SÜTÜ, SEPETİ | Tutulan uzun bölüm; süs, sayı, sınır, süre, sıra, sahip ve nesne değildir. |
| 10.1 | yaz tatili | Okul ve gezi | Okullar kapandığında sıcak aylarda verilen uzun dinlenme arası. | TARİHİ, TARİFİ, TAKVİMİ, TADI, TABAĞI, TEKNESİ, TUTARI | Uzun okul molası; tarih, takvim, tarif, tutar ve nesne değildir. |
| 10.2 | tatil dönüşü | Gezi | Dinlenmek için gittiğimiz yerden tekrar eve gelme yolculuğu. | DESENİ, DÜZENİ, DİLİ, DEĞERİ, DÜĞMESİ, DUVARI, DURAĞI | Eve geri gelme eylemi; durak, düzen, değer ve eşya değildir. |
| 10.3 | dönüş bileti | Ulaşım | Eve geri giden otobüs veya uçakta koltuğumuzu ayıran yolculuk belgesi. | BEDELİ, BOYASI, BAHÇESİ, BALI, BİBERİ, BALONU, BAYRAĞI | Koltuğu ayıran belge; bilgi, bedel, boya, yiyecek ve bina değildir. |
| 10.4 | bilet fiyatı | Ulaşım | Yolculuk hakkını satın almak için ödenecek para tutarı. | FARKI, FİKRİ, FİŞİ, FORMU, FOTOĞRAFI, FIRÇASI, FİNCANI | Satın alma tutarı; fark, fikir, fiş, form, fotoğraf ve nesne değildir. |
| 10.5 | fiyat etiketi | Alışveriş | Ürüne iliştirilen, satış tutarının yazdığı küçük kâğıt. | ETKİSİ, EKMEĞİ, EŞYASI, ESERİ, EKRANI, ELBİSESİ, EMEĞİ | İliştirilen fiyatlı kâğıt; etki, eser, ekran, emek ve giysi değildir. |
| 10.6 | etiket yazısı | Alışveriş | Ürüne iliştirilen küçük kâğıdın üzerinde okuduğumuz harfler. | YÜZEYİ, YAPIŞKANI, YUVASI, YÜKÜ, YAPRAĞI, YASTIĞI, YORGANI | Okunan harfler; yer, yüzey, yapışkan, yük ve nesne değildir. |
| 10.7 | yazı tahtası | Okul | Öğretmenin sınıfta önüne geçip tebeşirle yazdığı büyük yüzey. | TABAĞI, TORBASI, TABELASI, TUTARI, TADI, TAKVİMİ, TEPSİSİ | Sınıftaki tebeşir yüzeyi; tabela, tepsi, takvim ve eşya değildir. |
| 10.8 | tahta kalemi | Okul | Silinebilir yüzeye yazmak için kullanılan, mürekkepli ince araç. | KODU, KUTUSU, KILIFI, KAPAĞI, KÖŞESİ, KOKUSU, KİLİDİ | Yazan ince araç; kutu, kılıf, kapak, kod ve köşe değildir. |
| 10.9 | kalem ucu | Okul | Yazarken kâğıda değen, sivri ve iz bırakan bölüm. | UYKUSU, USTASI, UMUDU, USULÜ, UYUMU, UZAYI, UÇAĞI | Yazı bırakan sivri bölüm; uyku, usta, umut, usul, uyum ve nesne değildir. |
| 11.1 | müzik öğretmeni | Okul | Okulda nota ve çalgı çalmayı öğrencilere öğreten kişi. | ÖRNEĞİ, ÖNERİSİ, ÖZELLİĞİ, ÖZLEMİ, ÖFKESİ, ÖYKÜSÜ, ÖĞRENCİSİ | Öğreten kişi; öğrenci, örnek, öneri, özellik, duygu ve önlük değildir. |
| 11.2 | öğretmen maaşı | İş hayatı | Okulda çalışan eğitimciye emeği karşılığında her ay ödenen para. | MASASI, MANTIĞI, MÜZİĞİ, MİDESİ, MEYVESİ, MUMU, MENDİLİ | Aylık ücret; masa, mantık, mide, yiyecek, giysi ve kişi değildir. |
| 11.3 | maaş zammı | İş hayatı | Her ay alınan ücretin artırılması. | ZAMANI, ZARFI, ZİLİ, ZİNCİRİ, ZEMİNİ, ZEYTİNİ, ZARARI | Ücret artışı; zaman, zarf, zil, zincir, zemin ve zarar değildir. |
| 11.4 | zam haberi | Haber izleme | Fiyatların veya ücretlerin arttığını duyuran gazete ya da televizyon bilgisi. | HATASI, HEDİYESİ, HARİTASI, HESABI, HIRKASI, HALISI, HIZI | Artışı duyuran bilgi; hata, hediye, hesap, harita ve nesne değildir. |
| 11.5 | haber kaynağı | Medya | Bir bilginin ilk alındığı kişi veya yer. | KAYDI, KALİTESİ, KUTUSU, KOKUSU, KİLİDİ, KARTI, KURALI | Bilginin geldiği köken; kayıt, kalite, kutu, koku ve kural değildir. |
| 11.6 | kaynak suyu | Mutfak ve doğa | Doğal olarak yerin altından çıkan, içilebilir sıvı. | SÜSÜ, SİSİ, SÖZÜ, SEPETİ, SIRRI, SAYISI, SABUNU | İçilebilir doğal sıvı; süt, sis, ses, söz ve nesne değildir. |
| 11.7 | su faturası | Ev giderleri | Evde tüketilen sıvının ücretini ödemek için gelen belge. | FİYATI, FİKRİ, FİLTRESİ, FOTOĞRAFI, FAYDASI, FİNCANI, FIRÇASI | Ödeme belgesi; fiyatın kendisi, fikir, fotoğraf, filtre ve eşya değildir. |
| 11.8 | fatura borcu | Ev giderleri | Tüketim belgesinde yazan, henüz ödenmemiş para tutarı. | BİBERİ, BANYOSU, BALONU, BİLETİ, BİNASI, BOYASI, BAĞI | Ödenmesi gereken tutar; yiyecek, belge, bina, boya ve bağ değildir. |
| 11.9 | borç faizi | Para | Ödünç alınan paraya, kullanılan süre için eklenen ücret. | FARKI, FİKRİ, FİŞİ, FORMU, FIRÇASI, FİNCANI, FISTIĞI | Paranın kullanım süresine bağlı ücret; genel fark, fikir, fiş, form ve nesne değildir. |
| 12.1 | çocuk hastanesi | Sağlık | Küçük yaştakilerin muayene ve bakımına ayrılmış sağlık kurumu. | HABERİ, HATASI, HEDİYESİ, HARİTASI, HESABI, HIRKASI, HALISI | Sağlık kurumu; haber, hata, hediye, hesap, giysi ve nesne değildir. |
| 12.2 | hastane randevusu | Günlük işler | Muayene için önceden ayırttığımız belirli gün ve saat. | RAKAMI, RAPORU, REÇETESİ, REKLAMI, RÜYASI, ROMANI, ROZETİ | Önceden ayrılan zaman; rapor, reçete, rakam, reklam ve nesne değildir. |
| 12.3 | randevu tarihi | Günlük işler | Önceden ayarlanan buluşmanın yapılacağı gün, ay ve yıl. | TADI, TÜRÜ, TUTARI, TARİFİ, TAKVİMİ, TABELASI, TAMİRİ | Belirli gün bilgisi; takvim, tarif, tutar, tat ve nesne değildir. |
| 12.4 | tarih dersi | Okul | Okulda geçmişteki olayları ve uygarlıkları öğrendiğimiz öğretim saati. | DALI, DİLİ, DOMATESİ, DÜZEYİ, DOKUSU, DEĞERİ, DÜĞMESİ | Öğretim saati; dönem, dal, düzey, doku ve eşya değildir. |
| 12.5 | ders kitabı | Okul | Okuldaki konuları öğreten, sayfaları ciltlenmiş basılı kaynak. | KAYDI, KONUSU, KURALI, KARTI, KUTUSU, KALEMİ, KASASI | Ciltli basılı kaynak; kayıt, konu, kart, kalem ve kap değildir. |
| 12.6 | kitap yazarı | Okuma | Okuduğumuz eseri kaleme alan kişi. | YAPISI, YORUMU, YÜZEYİ, YILI, YOLU, YAPIŞKANI, YAŞI | Eseri yazan kişi; yer, yapı, yorum, yüzey, yıl ve malzeme değildir. |
| 12.7 | yazar imzası | Okuma | Eser sahibinin onay veya hatıra için attığı kendine özgü el yazısı işaret. | İSMİ, İZNİ, İŞİ, İLANI, İLGİSİ, İSTEĞİ, İPLİĞİ | Atılan özgün el yazısı işaret; adın kendisi, izin, iş, ilan ve ilgi değildir. |
| 12.8 | imza günü | Kitapçı | Yazarın okurlarıyla buluşup kitaplarını imzalaması için ayrılan özel tarih. | GÖZÜ, GÜCÜ, GÖREVİ, GÖLGESİ, GİYSİSİ, GÜLÜ, GİDERİ | Okur buluşması için ayrılan tarih; gezi, görev, gider, güç ve eşya değildir. |
| 12.9 | gün sayısı | Takvim | Bir sürenin kaç tane yirmi dört saatlik parçadan oluştuğu. | SIRASI, SAHİBİ, SORUSU, SÜSÜ, SESİ, SEPETİ, SABUNU | Toplam adet; sıra, sahip, soru, ses ve nesne değildir. |

## Doğrulama

`node --test tests/`: **45/45 başarılı**. Bölüm verisinin 19 testi; uzunlukları,
Türkçe biçimleri, kök–cevap ilişkisini, ipuçlarını, seçenek sayısını, ilk harfi,
±3 uzunluğu, benzersizliği ve önceden elenen seyrek örnekleri denetler.

İki yeni denetim: (1) bütün oyunda 98 tamlama benzersizdir; (2) cevap kökleri en
fazla iki bölümde kullanılır ve her kökün iki yöndeki komşuları tekrarlanmaz.
Komşuluk kontrolü başlangıçları da kapsar ve ters çevrilmiş çifti de yakalar.
`MAÇI`, `TÜPÜ`, `SAPI` çekimleri için bağımsız iyelik testine ünsüzü değişmeyen
kökler eklendi. İlk kitap örneğinin beş cevabı ve 5/6/7/8/9 uzunluk dizisi korunur.

Tam paket ayrıca core oynanışı, ek düşürme, bölüm sonu özetleri, yeni kelimelerle
v4 tahta üretimi, tüm doldurma yönlerinde çözülebilirlik, yeni taşların cevabı
belli etmemesi ve bütün satır/sütunların kullanılması denetimlerini geçti.
Son veri için yeni bir görsel mobil test iddia edilmiyor; bu turdaki doğrulama
veri, core ve tahta mantığı testleridir.
