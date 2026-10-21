# Word Train — bölüm tasarımı

## Teslim ve kullanım

`levels.js`, sözleşmedeki `export const LEVELS` dizisini sağlar. 12 bölümün her birinde
1 başlangıç kelimesi + 9 cevap vardır: toplam 120 vagon kelimesi, 108 cevap/ipucu ve
756 çeldirici. Böylece başlangıç sayıldığında da sayılmadığında da 8–12 halka aralığı korunur.
İlk 3 bölüm erken entegrasyon için opus-core'a teslim edildi; tam sette aynı alanlar korundu.

Her cevap `{ word, base, phrase, hint, distractors }` biçimindedir. Başlangıç yalnızca
`{ word, base }` taşır. Ek hece alanı gerekmedi; mekanikler Türkçe büyük harfli `word`
üzerinden harfleri üretebilir. Dizide rastgelelik, DOM erişimi ve yan etki yoktur.

- `word`: vagonda görünen çekimli biçim; örneğin `KAYDI`.
- `base`: bir sonraki tamlamada kullanılacak sözlük kökü; örneğin `KAYIT`.
- `phrase`: önceki `base` + boşluk + şimdiki `word`, Türkçe küçük harfle.
- `hint`: hedefi veya kökünü açıkça yazmayan, kısa ve ayırt edici Türkçe açıklama.
- `distractors`: cevapla aynı ilk harfi taşıyan yedi farklı Türkçe büyük harfli seçenek.
  Cevap veya cevabın kökü değiller; Türkçe harfler birebir karşılaştırılır (`I ≠ İ`,
  `C ≠ Ç`, `G ≠ Ğ`, `O ≠ Ö`, `S ≠ Ş`, `U ≠ Ü`).

## Zorluk ve akış

İlk bölüm kullanıcının verdiği örneği harfiyen korur. İlk altı bölümde kitap, okul,
mutfak, şişe, hediye ve oyun gibi tanıdık başlangıçlar kullanılır. Sonraki bölümlerde
ses kaydı, eğitim, başvuru, fotoğraf, enerji ve raporlama gibi daha soyut bağlantılar artar.
Bu, bölüm grupları arasında bir zorluk eğrisidir; her tekil kelime bir öncekinden zor değildir.
Kelime sayısı sabit tutularak mekanikler arasında karşılaştırma kolaylaştırıldı.

Tema, ilk istasyonu adlandırır; bütün zinciri tek bir konuya zorlamaz. Örneğin
`kaynak suyu` halkası enerji konusundan suya geçer. Bu anlam değişimleri oyunun keşif tarafıdır.
Bölüm içinde hem `word` hem `base` benzersizdir. Bölümler arasında öğrenilen bazı köprüler
tekrar edilir; her bölümün tamamen ayrı bir söz varlığı olması hedeflenmedi.

## Editoryal olarak gözden geçirilen zincirler

Aşağıdaki her ok, soldaki kelimenin **kökü** ile sağdaki kelimenin tamlamasını kurar.
Örneğin `KAPAĞI → TASARIMI`, `kapağı tasarımı` değil `kapak tasarımı` demektir.

1. **Kitap Treni:** KİTAP → KAPAĞI → TASARIMI → EKİBİ → TOPLANTISI → NOTLARI → DEFTERİ → SAYFASI → KENARI → ÇİZGİSİ

2. **Okul Zili:** OKUL → BAHÇESİ → KAPISI → KOLU → SAATİ → KAYIŞI → TOKASI → RENGİ → UYUMU → SORUNU

3. **Minik Anahtar:** MUTFAK → DOLABI → KAPAĞI → KİLİDİ → ANAHTARI → HALKASI → ÇAPI → ÖLÇÜSÜ → BİRİMİ → FİYATI

4. **Mavi Şişe:** DENİZ → SUYU → ŞİŞESİ → KAPAĞI → RENGİ → TONU → FARKI → HESABI → DEFTERİ → SAYFASI

5. **Sürpriz Paket:** HEDİYE → PAKETİ → SERVİSİ → ARACI → LASTİĞİ → BASINCI → ÖLÇÜMÜ → SONUCU → RAPORU → DOSYASI

6. **Oyun Molası:** OYUN → PARKI → ALANI → ÖLÇÜSÜ → BİRİMİ → FİYATI → ETİKETİ → YAZISI → TİPİ → SEÇİMİ

7. **Yağmur Ezgisi:** YAĞMUR → DAMLASI → SESİ → KAYDI → CİHAZI → EKRANI → PARLAKLIĞI → AYARI → DÜĞMESİ → DELİĞİ

8. **Orman Rotası:** ORMAN → YOLU → HARİTASI → İŞARETİ → DİLİ → KURSU → PROGRAMI → SUNUCUSU → EKİBİ → LİDERİ

9. **Tatil Postası:** YAZ → TATİLİ → PLANI → DEĞİŞİKLİĞİ → TALEBİ → FORMU → NUMARASI → SIRASI → ARKADAŞI → GRUBU

10. **Neşeli Notalar:** MÜZİK → DERSİ → KİTABI → YAZARI → İMZASI → TÖRENİ → ALANI → DERİNLİĞİ → ALGISI → YÖNETİMİ

11. **Güneş Atölyesi:** GÜNEŞ → ENERJİSİ → KAYNAĞI → SUYU → DEPOSU → HACMİ → HESABI → MAKİNESİ → PARÇASI → NUMARASI

12. **Bulut İstasyonu:** HAVA → BASINCI → ÖLÇÜMÜ → SONUCU → RAPORU → DOSYASI → ADI → LİSTESİ → SIRASI → NUMARASI

## İpuçları ve çeldiriciler

İpuçları, sırf harf veya uzunluk bilgisi vermek yerine anlamı tarif eder. Seçenekler içinde
hedefin kökü verilmez. Çeldiricinin dilde gerçek bir tamlama oluşturması hata değildir;
ancak **önceki kökle birlikte okunduğunda görünür ipucuna uymaması gerekir**. Tüm
varyantlarda `target.hint` başlangıçtan görünür olmalıdır. Yanlış seçim mesajı
“Bu ipucuna uymuyor” olmalı; seçeneğin Türkçede geçersiz olduğu söylenmemelidir.

İlk denetimdeki “İçindekileri dıştan korur” ipucu kitap kılıfını ve kutusunu da kapsıyordu.
Düzeltme: “Cilde bağlı, ilk sayfadan önce açtığımız koruyucu bölüm.” İlk harf kuralıyla seçilen
`KILIFI`, `KUTUSU`, `KONUSU` korundu; `KÜNYESİ`, `KAYDI`, `KATALOĞU`,
`KARAKTERİ` eklendi. Hiçbiri cilde bağlı açılan koruyucu bölüm değildir.

Tanıdık tamlamanın yerine daha baskın bir çeldirici koymamak editoryal seçim ölçütüdür;
seçeneklere sayısal sıklık puanı atanmamıştır. Uzunluk farkı en fazla üç harftir;
bu sınır içinde doğal Türkçe ve ipucunun ayırt ediciliği korunur.

Özellikle üç sözcüğe dayanan kestirmeler elendi: `doğum günü → hediyesi` kullanılamaz,
çünkü sonraki kök `GÜN` olur ve gerekli ikili `gün hediyesi` yeterince yerleşik değildir.
Bunun yerine bölüm doğrudan `HEDİYE → PAKETİ` ile başlar.

## TDK kontrol kaydı — 21 Ekim 2026

Şüpheli ayrı/bitişik yazım adayları [TDK Güncel Türkçe Sözlük](https://sozluk.gov.tr/)
üzerinden doğrudan `gts?ara=` sorgularıyla kontrol edildi. Aşağıdaki ifadeler ayrı yazılmış
madde başları olarak döndü; kimlikler sorgu yanıtındaki `madde_id` değerleridir.

| Kullanılan ifade | TDK madde kimliği | Doğrudan sorgu |
| --- | --- | --- |
| kol saati | 28265 | [TDK](https://sozluk.gov.tr/gts?ara=kol%20saati) |
| yol haritası | 75106 | [TDK](https://sozluk.gov.tr/gts?ara=yol%20haritas%C4%B1) |
| işaret dili | 82601 | [TDK](https://sozluk.gov.tr/gts?ara=i%C5%9Faret%20dili) |
| imza töreni | 33823 | [TDK](https://sozluk.gov.tr/gts?ara=imza%20t%C3%B6reni) |
| hesap makinesi | 74555 | [TDK](https://sozluk.gov.tr/gts?ara=hesap%20makinesi) |
| kaynak suyu | 43142 | [TDK](https://sozluk.gov.tr/gts?ara=kaynak%20suyu) |
| hava basıncı | 22476 | [TDK](https://sozluk.gov.tr/gts?ara=hava%20bas%C4%B1nc%C4%B1) |
| güneş enerjisi | 90232 | [TDK](https://sozluk.gov.tr/gts?ara=g%C3%BCne%C5%9F%20enerjisi) |

`alan derinliği`, `algı yönetimi`, `birim fiyatı`, `ses kaydı`, `renk tonu`, `yazı tipi`,
`düğme deliği`, `sıra arkadaşı`, `not defteri` sorguları “Sonuç bulunamadı” döndürdü.
Bu ifadeler için TDK madde doğrulaması iddia edilmiyor: sözlük bütün üretken isim
tamlamalarını ayrı birer madde olarak listelemez. Bunlar iki kelimeli standart isim
tamlamaları olarak editoryal denetimle tutuldu. Sonuç bulunmamasını bitişik yazım
kanıtı olarak yorumlamadık. Kullanılmayan adaylardan `dalga boyu`, `doğum günü`,
`hava durumu` ve `bilgi işlem` de ayrı madde olarak doğrulandı; son sete alınmadı.

## Doğrulama

Çalıştırma: `node --test tests/levels.test.js` (harici paket veya ağ gerektirmez).

16 test; bölüm sayısı ve kimliklerini, kısa başlıkları, 8–12 halka sınırını, bölüm içi
kelime/kök tekrarını, ilk örneğin birebir korunmasını, Türkçe büyük/küçük harfleri,
NFC metinlerini, iki kelimelik tamlama bağlantısını, çekimli kelimeden sözlük köküne
geçişi, ipucunda açık cevap bulunmamasını ve yedi benzersiz çeldiriciyi doğrular.
Yeni kural testi 108 halkanın tamamında sekiz seçeneğin aynı Türkçe ilk harfi taşıdığını,
cevaptan farklı çeldiricileri, halka içindeki tekrar yokluğunu ve ±3 harf uzunluk
sınırını ayrıca denetler.

Çekim kontrolü büyük ünlü uyumu, iyelik eki, ünsüz yumuşaması ve setteki istisnaları
(`SUYU`, `KAYDI`, `HACMİ`, `RENGİ`, `SAATİ`) ele alır. Kullanıcının `NOTLARI` çoğulu
ayrıca korunur. Bilinen bitişik birleşikler için küçük bir regresyon listesi vardır.

Testler gerçek dünyadaki yaygınlığı veya bütün olası birleşik sözcüklerin yazımını
kanıtlamaz. Bu kısmın güvencesi yukarıdaki dil denetimi ve açık kaynak kaydıdır;
ağ erişimi veya canlı sözlük çıktısı testlerin geçme koşulu değildir.


## Sekiz seçenek: ilk harf ve tekillik denetimi — 21 Ekim 2026

Oyuncuya sonraki vagonun ilk harfi verilir: `KİTAP + K…` → `KAPAĞI`, ardından
`KAPAK + T…` → `TASARIMI`. Sekiz seçenekli modda 1 cevap + 7 çeldiricinin tamamı
aynı Türkçe harfle başlar; ilk harf hiçbir seçeneği elemez. 108 halkadaki mevcut
324 uygun çeldirici korundu ve 432 yeni çeldirici eklendi: toplam 756 çeldirici.
Cevaplar, sözlük kökleri, tamlamalar ve zincir sırası değişmedi.

Bütün seçenekler gerçek isimlerin iyelik/tamlama biçimleridir. `NOTLARI` için
yedi çeldirici de çoğuldur; diğer halkalarda tekil isim çekimleri kullanılır.
Her çeldiricinin uzunluğu cevaptan en fazla üç harf farklıdır. `I/İ`, `C/Ç`, `G/Ğ`,
`O/Ö`, `S/Ş`, `U/Ü` ayrımları birebir korunur; harf sadeleştirmesi yoktur.

Bölümler arasında **aynı yedili çeldirici seti hiç tekrarlanmıyor** (108 farklı set).
Önceki uygun üçlüleri koruma isteği nedeniyle `ÖRNEĞİ / ÖZETİ / ÖYKÜSÜ` gibi
bazı üçlüler tekrar eder; yeni dörtlüler her bağlama göre farklılaştırıldı:

- `çap ölçüsü`: ÖDEVİ, ÖNERİSİ, ÖNEMİ, ÖMRÜ.
- `basınç ölçümü` (5. bölüm): ÖZELLİĞİ, ÖNGÖRÜSÜ, ÖDEVİ, ÖNERİSİ.
- `alan ölçüsü`: ÖNSÖZÜ, ÖĞÜDÜ, ÖDÜLÜ, ÖZLEMİ.
- `basınç ölçümü` (12. bölüm): ÖNEMİ, ÖNCESİ, ÖDÜLÜ, ÖĞÜDÜ.

Yedi gerçek, uygun uzunlukta ve ipucuyla elenebilir seçenek bulunamayan halka
kalmadı; zincir değişikliği gerekmiyor. Bazı seçeneklerin önceki kökle birleşimi
seyrektir (`halka çileği`, `renk uzamı` gibi); tek başına sözcükler ve çekimleri
gerçektir. Yaygınlık eşitliği iddia edilmiyor. Otomatik denetim biçimi sınar;
Türkçe anlam ve ipucuyla tekillik aşağıdaki editoryal gerekçelerle değerlendirilir.

Sekize geçişte üç ipucu daraltıldı:

- `yazı tipi`: Arial veya Times gibi menüden seçilen harf biçimini belirtir;
  yazının tavrı veya tarihi değildir.
- `tatil planı`: kişinin yerleri ve kalacağı günleri kararlaştırma **eylemini**
  belirtir; satılan tatil paketi veya gezi portalı değildir.
- `ders kitabı`: ders konularını öğreten **sayfaları ciltlenmiş** basılı kaynaktır;
  tek kart, kroki veya veri kaydı değildir.

Önceki turda netleştirilen `hediye paketi`, `harita işareti`, `ad listesi` ipuçları
korundu. Her satırın ilk gerekçesi korunan üçlüyü, devamı yeni dört seçeneği açıklar.

| Halka | Doğru tamlama | İlk harf | Çeldiriciler | İpucunun ayırdığı anlam |
| --- | --- | --- | --- | --- |
| 1.1 | kitap kapağı | K | KILIFI, KUTUSU, KONUSU, KÜNYESİ, KAYDI, KATALOĞU, KARAKTERİ | Cilde bağlı açılan koruyucu parça; kılıf ve kutu dış ambalaj, konu içeriktir. Künye tanıtıcı bilgi, kayıt veri, katalog döküm, karakter eserdeki kişidir; cilde bağlı açılan koruyucu yüz değildir. |
| 1.2 | kapak tasarımı | T | TARİHİ, TAMİRİ, TAKVİMİ, TALEBİ, TUTANAĞI, TALİMATI, TESLİMİ | Renk, biçim ve yerleşimi planlama; tarih ve takvim zaman bilgisi, tamir onarımdır. Talep istek, tutanak kayıt, talimat yönerge, teslim ulaştırma işidir; görünüş planlama değildir. |
| 1.3 | tasarım ekibi | E | ESERİ, ETİĞİ, EVRESİ, EKSENİ, ETKİSİ, EKRANI, EMEĞİ | Birlikte çalışan kişiler; eser ürün, etik ilke, evre aşamadır. Eksen doğru, etki sonuç, ekran yüzey, emek çabadır; birlikte çalışan kişiler değildir. |
| 1.4 | ekip toplantısı | T | TAKVİMİ, TABELASI, TALİMATI, TESLİMATI, TUTANAĞI, TEMPOSU, TUTARLILIĞI | Konuşmak için buluşma; takvim zaman planı, tabela levha, talimat yönergedir. Teslimat ulaştırma, tutanak kayıt, tempo hız, tutarlılık uyumluluktur; konuşmak için buluşma değildir. |
| 1.5 | toplantı notları | N | NUTUKLARI, NİYETLERİ, NİŞANLARI, NEDENLERİ, NÜKTELERİ, NESNELERİ, NÜSHALARI | Hatırlamak için yazılan kısa maddeler; nutuk uzun konuşma, niyet amaç, nişan işarettir. Neden gerekçe, nükte esprili söz, nesne eşya, nüsha kopyadır; konuşmanın hatırlatıcı kısa maddeleri değildir. |
| 1.6 | not defteri | D | DOSYASI, DESENİ, DÜZENİ, DİZİNİ, DİLİ, DÖKÜMÜ, DEĞERİ | Bir kenarından ciltlenmiş boş yapraklar; dosya belge saklar, desen süs, düzen yerleşimdir. Dizin yer buldurur, dil anlatım aracı, döküm içerik, değer kıymettir; ciltli boş yapraklar değildir. |
| 1.7 | defter sayfası | S | SIRASI, SAYISI, SATIRI, SÜSÜ, SAHİBİ, SIRTLIĞI, SEMBOLÜ | Yaprağın bütün yazı yüzü; sıra konum, sayı adet, satır yüzün tek çizgisidir. Süs bezeme, sahip kişi, sırtlık destek, sembol simgedir; yazılan yaprak yüzü değildir. |
| 1.8 | sayfa kenarı | K | KALINLIĞI, KIVRIMI, KOKUSU, KÜNYESİ, KUTUSU, KODU, KATMANI | Yazı alanının dış sınırı; kalınlık başka boyut, kıvrım bükülme, koku duyusal özelliktir. Künye tanıtıcı bilgi, kutu muhafaza, kod tanıtıcı, katman tabakadır; yazı alanının sınırı değildir. |
| 1.9 | kenar çizgisi | Ç | ÇİVİSİ, ÇENTİĞİ, ÇATLAĞI, ÇAPAĞI, ÇIKINTISI, ÇÜRÜĞÜ, ÇELİĞİ | Kalemle çekilmiş ince sınır izi; çivi metal bağlantı, çentik oyuk, çatlak yarıktır. Çapak artık parça, çıkıntı tümsek, çürük hasar, çelik malzemedir; kalemle çekilen iz değildir. |
| 2.1 | okul bahçesi | B | BİNASI, BÜFESİ, BÖLÜMÜ, BAYRAĞI, BÜTÇESİ, BELGESİ, BANDOSU | Teneffüste dışarıda oynanan açık yer; bina kapalı yapı, büfe satış yeri, bölüm genel alt birimdir. Bayrak simge, bütçe para planı, belge kayıt, bando müzik topluluğudur; açık oyun yeri değildir. |
| 2.2 | bahçe kapısı | K | KULÜBESİ, KÖŞESİ, KUYUSU, KORKULUĞU, KOVASI, KAZMASI, KİLİMİ | İçeri girilen geçit; kulübe barınak, köşe iki sınırın birleşimi, kuyu derin çukurdur. Korkuluk sınır yapısı, kova kap, kazma alet, kilim örtüdür; içeri girilen geçit değildir. |
| 2.3 | kapı kolu | K | KABI, KODU, KOTU, KİLİDİ, KASASI, KİLİMİ, KAYDI | Aşağı bastırılan yatay tutamak; kap muhafaza, kod tanıtıcı, kot yükseklik bilgisidir. Kilit mekanizma, kasa sabit çerçeve, kilim örtü, kayıt veridir; aşağı bastırılan tutamak değildir. |
| 2.4 | kol saati | S | SARGISI, SÜSÜ, SINIRI, SAYISI, SAÇI, SERTLİĞİ, SIZISI | Bilekte zamanı gösteren araç; sargı sarar, süs bezeme, sınır bitiş yeridir. Sayı adet, saç kıl, sertlik direnç, sızı ağrıdır; zamanı göstermez. |
| 2.5 | saat kayışı | K | KILIFI, KASASI, KUTUSU, KADRANI, KURALI, KAYDI, KODU | Bileği saran delikli şerit; kılıf ve kutu muhafaza, kasa mekanizmanın gövdesidir. Kadran gösterge yüzü, kural ilke, kayıt veri, kod tanıtıcıdır; bileği saran delikli şerit değildir. |
| 2.6 | kayış tokası | T | TABANI, TARAFI, TUTKALI, TİPİ, TARİFİ, TAMİRİ, TOZU | Deliklere giren dilli metal bağlantı; taban alt yüz, taraf yan, tutkal yapıştırıcıdır. Tip çeşit, tarif açıklama, tamir onarım, toz ince tanedir; dilli metal bağlantı değildir. |
| 2.7 | toka rengi | R | RESMİ, ROZETİ, RİTMİ, RAFI, RAPORU, RAKAMI, REÇİNESİ | Mavi veya sarı olma özelliği; resim görsel, rozet simge, ritim düzenli tekrardır. Raf taşıyıcı, rapor metin, rakam simge, reçine malzemedir; mavi veya kırmızı olma özelliği değildir. |
| 2.8 | renk uyumu | U | USULÜ, USTASI, UZUNLUĞU, UCU, UZAMI, UNSURU, UYARISI | Tonların birbirine yakışması; usul yöntem, usta kişi, uzunluk boyuttur. Uç bitiş, uzam mekân, unsur bileşen, uyarı ikazdır; tonların birbirine yakışması değildir. |
| 2.9 | uyum sorunu | S | SÜRESİ, SEBEBİ, SINIRI, SAYACI, SÖZCÜĞÜ, SİMGESİ, SINAVI | Birlikte iyi işlemeyi engelleyen güçlük; süre zaman, sebep neden, sınır kapsamdır. Sayaç araç, sözcük ifade, simge işaret, sınav değerlendirmedir; güçlüğün kendisi değildir. |
| 3.1 | mutfak dolabı | D | DUVARI, DEKORU, DESENİ, DÖŞEMESİ, DÜĞMESİ, DEMLİĞİ, DAVULU | Tabak saklayan mobilya; duvar yapı, dekor görünüş, desen bezemedir. Döşeme zemin kaplaması, düğme kontrol parçası, demlik kap, davul çalgıdır; tabak kaldırılan mobilya değildir. |
| 3.2 | dolap kapağı | K | KULPU, KİLİDİ, KÖŞESİ, KASASI, KUTUSU, KİLİMİ, KAPLAMASI | Menteşeyle dönerek rafların önünü kapatan yüzey; kulp tutamak, kilit mekanizma, köşe birleşimdir. Kasa sabit gövde, kutu ve kilim eşya, kaplama yüzey malzemesidir; menteşeyle dönen panel değildir. |
| 3.3 | kapak kilidi | K | KILIFI, KUTUSU, KENARI, KULPU, KANADI, KANCASI, KONUMU | Anahtarla açılan güvenlik mekanizması; kılıf ve kutu muhafaza, kenar sınırdır. Kulp tutamak, kanat panel, kanca askı, konum yerdir; anahtarla açılan güvenlik mekanizması değildir. |
| 3.4 | kilit anahtarı | A | AMBALAJI, ARALIĞI, ARIZASI, AKSAMI, AĞIRLIĞI, ALAŞIMI, ATÖLYESİ | Yuvaya sokulup çevrilen dişli metal açıcı; ambalaj sarar, aralık boşluk, arıza bozukluktur. Aksam parçalar bütünü, ağırlık büyüklük, alaşım malzeme, atölye üretim yeridir; dişli açıcı değildir. |
| 3.5 | anahtar halkası | H | HATIRASI, HEDİYESİ, HURDASI, HAMMADDESİ, HACMİ, HESABI, HARİTASI | Sap deliklerini birleştiren metal çember; hatıra anı, hediye armağan, hurda artık malzemedir. Hammadde malzeme, hacim büyüklük, hesap işlem, harita çizimdir; birleştiren metal çember değildir. |
| 3.6 | halka çapı | Ç | ÇANI, ÇAYI, ÇÖPÜ, ÇİVİSİ, ÇELİĞİ, ÇÜRÜĞÜ, ÇİLEĞİ | Çemberin merkezinden geçen genişlik; çan ses aracı, çay içecek, çöp atıktır. Çivi bağlantı parçası, çelik malzeme, çürük hasar, çilek meyvedir; merkezden geçen genişlik değildir. |
| 3.7 | çap ölçüsü | Ö | ÖRNEĞİ, ÖZETİ, ÖYKÜSÜ, ÖDEVİ, ÖNERİSİ, ÖNEMİ, ÖMRÜ | Cetvelden okunan milimetre değeri; örnek temsilci, özet kısa anlatım, öykü olay anlatımıdır. Ödev görev, öneri teklif, önem değer, ömür süredir; milimetreyle belirtilen genişlik değildir. |
| 3.8 | ölçü birimi | B | BİÇİMİ, BİLGİSİ, BELGESİ, BOYASI, BAŞLIĞI, BAŞARISI, BASAMAĞI | Metre veya litre gibi ortak standart; biçim görünüş, bilgi içerik, belge kayıttır. Boya kaplama, başlık adlandırma, başarı sonuç, basamak aşamadır; metre veya litre gibi standart değildir. |
| 3.9 | birim fiyatı | F | FARKI, FİKRİ, FİŞİ, FORMU, FOTOĞRAFI, FONU, FAKTÖRÜ | Satıcıya ödenecek para tutarı; fark karşılaştırma, fikir düşünce, fiş belgedir. Form belge, fotoğraf görsel, fon para kaynağı, faktör etkendir; bir adet için ödenecek tutar değildir. |
| 4.1 | deniz suyu | S | SESİ, SÜSÜ, SİSİ, SALI, SÜTÜ, SÖZÜ, SEYRİ | Dalgaları oluşturan tuzlu sıvı; ses işitsel, süs bezeme, sis havadaki küçük damlalardır. Sal taşıt, süt başka sıvı, söz ifade, seyir ilerleyiştir; dalgaları oluşturan tuzlu sıvı değildir. |
| 4.2 | su şişesi | Ş | ŞEKLİ, ŞERİDİ, ŞİDDETİ, ŞEMASI, ŞAİBESİ, ŞAKASI, ŞARTI | Dar boyunlu ve vidalı ağızlı taşıma kabı; şekil görünüş, şerit uzun parça, şiddet güç derecesidir. Şema çizim, şaibe kuşku, şaka gülünç söz, şart koşuldur; dar boyunlu taşıma kabı değildir. |
| 4.3 | şişe kapağı | K | KILIFI, KUTUSU, KOKUSU, KULPU, KIRINTISI, KÖŞESİ, KAYDI | Ağza vidalanıp çevrilerek çıkarılan parça; kılıf ve kutu dış muhafaza, koku duyusal özelliktir. Kulp tutamak, kırıntı döküntü, köşe birleşim, kayıt veridir; ağza vidalanan kapatıcı değildir. |
| 4.4 | kapak rengi | R | RESMİ, ROZETİ, RİTMİ, RAFI, REÇETESİ, RAKAMI, RÖLYEFİ | Mavi veya sarı olma özelliği; resim görsel, rozet simge, ritim düzenli tekrardır. Raf taşıyıcı, reçete tarif, rakam simge, rölyef kabartmadır; sarı veya mavi olma özelliği değildir. |
| 4.5 | renk tonu | T | TOZU, TADI, TÜRÜ, TASI, TELİ, TUTARI, TİRAJI | Açık veya koyu olma derecesi; toz madde, tat duyusal özellik, tür sınıftır. Tas kap, tel malzeme, tutar miktar, tiraj baskı adedidir; açıklık veya koyuluk derecesi değildir. |
| 4.6 | ton farkı | F | FİŞİ, FONU, FİKRİ, FORMU, FİLTRESİ, FİYATI, FIRÇASI | İki açıklık-koyuluk değerinin aynı olmayışı; fiş belge, fon kaynak veya arka plan, fikir düşüncedir. Form biçim, filtre süzgeç, fiyat para tutarı, fırça araçtır; iki değerin eşit olmayışı değildir. |
| 4.7 | fark hesabı | H | HARFİ, HABERİ, HATASI, HİSSESİ, HACMİ, HIZI, HÜKMÜ | İki değer arasını bulma işlemi; harf simge, haber bilgi, hata yanlışlıktır. Hisse pay, hacim büyüklük, hız oran, hüküm karardır; iki değer arasını bulma işlemi değildir. |
| 4.8 | hesap defteri | D | DOSYASI, DÖKÜMÜ, DÜZENİ, DEĞERİ, DİZİNİ, DİSKİ, DAMGASI | Gelir gider için ciltlenmiş yapraklar; dosya saklama bütünü, döküm içerik, düzen yerleşimdir. Değer kıymet, dizin yer bulduran bölüm, disk veri ortamı, damga izdir; ciltlenmiş yaprak bütünü değildir. |
| 4.9 | defter sayfası | S | SIRASI, SAYISI, SATIRI, SÜSÜ, SAPMASI, SAHİBİ, SEPETİ | Yaprağın bütün yazı yüzü; sıra konum, sayı adet, satır yüzün tek çizgisidir. Süs bezeme, sapma kayma, sahip kişi, sepet kaptır; yazı yazılan yaprak yüzü değildir. |
| 5.1 | hediye paketi | P | PARASI, POŞETİ, PUANI, PULU, POSTASI, PAZARI, PROJESİ | Eşyaya göre katlanıp bantlanan kapalı ambalaj; para ödeme, poşet saplı taşıma kabı, puan değerlendirmedir. Pul damga, posta gönderim, pazar satış ortamı, proje tasarıdır; kâğıtla sarılı kapalı ambalaj değildir. |
| 5.2 | paket servisi | S | SÜRESİ, SAYISI, SATICISI, SİPARİŞİ, STOKU, SEMBOLÜ, STANDI | Yemeği adrese ulaştırma hizmeti; süre zaman, sayı adet, satıcı kişidir. Sipariş istek, stok mevcut miktar, sembol işaret, stant tezgahtır; adrese ulaştırma hizmeti değildir. |
| 5.3 | servis aracı | A | ALANI, ADRESİ, ARIZASI, AKIŞI, AMACI, ANISI, AYARI | Yolcu taşıyan taşıt; alan yer, adres konum bilgisi, arıza bozukluktur. Akış sıra, amaç hedef, anı hatıra, ayar düzenlemedir; yolcu taşıyan taşıt değildir. |
| 5.4 | araç lastiği | L | LAMBASI, LEVHASI, LİSTESİ, LİSANSI, LAKABI, LEVYESİ, LOKASYONU | Tekerleğin yola değen esnek bölümü; lamba aydınlatır, levha bilgi taşır, liste dökümdür. Lisans izin, lakap ad, levye alet, lokasyon konumdur; tekerleğin esnek dış bölümü değildir. |
| 5.5 | lastik basıncı | B | BOYASI, BEDELİ, BİÇİMİ, BANDI, BAĞLANTISI, BOZULUŞU, BELGESİ | İç havanın uyguladığı kuvvetle ilgili büyüklük; boya kaplama, bedel tutar, biçim şekildir. Bant şerit, bağlantı birleşim, bozuluş yıpranma, belge kayıttır; havanın uyguladığı kuvvetin ölçüsü değildir. |
| 5.6 | basınç ölçümü | Ö | ÖRNEĞİ, ÖZETİ, ÖYKÜSÜ, ÖZELLİĞİ, ÖNGÖRÜSÜ, ÖDEVİ, ÖNERİSİ | Aletle sayısal değer belirleme işi; örnek temsilci, özet kısa anlatım, öykü olay anlatımıdır. Özellik nitelik, öngörü tahmin, ödev görev, öneri tekliftir; aletle değer belirleme eylemi değildir. |
| 5.7 | ölçüm sonucu | S | SÜRESİ, SIRASI, SEBEBİ, SAYISI, SEHPASI, SINIRI, SAATİ | İşlem bitince elde edilen değer; süre geçen zaman, sıra konum, sebep yapılış nedenidir. Sayı adet, sehpa taşıyıcı, sınır uç değer, saat zamandır; işlem sonunda okunan asıl değer değildir. |
| 5.8 | sonuç raporu | R | RESMİ, ROZETİ, RENGİ, RİTMİ, RAFI, RAKAMI, REÇETESİ | Gerekçeli değerlendirme metni; resim görsel, rozet simge, renk görünüş özelliğidir. Ritim tekrar, raf taşıyıcı, rakam sayı işareti, reçete tariftir; bulguları değerlendiren metin değildir. |
| 5.9 | rapor dosyası | D | DESENİ, DÜZEYİ, DİLİ, DEĞERİ, DAMGASI, DERECESİ, DAĞILIMI | Bilgisayarda saklanan belge bütünü; desen bezeme, düzey seviye, dil anlatım aracıdır. Değer kıymet, damga iz, derece düzey, dağılım yayılıştır; saklanan belge bütünü değildir. |
| 6.1 | oyun parkı | P | PULU, PUANI, PLANI, PİYONU, PERDESİ, PAKETİ, PANOSU | Salıncak ve kaydırakların bulunduğu yer; pul küçük oyun taşı, puan skor, plan hazırlıktır. Piyon oyun taşı, perde örtü, paket ambalaj, pano yüzeydir; salıncaklı açık yer değildir. |
| 6.2 | park alanı | A | AĞACI, ARACI, AMACI, ADRESİ, AMPULÜ, AYNASI, AKIŞI | Araçlara ayrılmış zeminin tamamı; ağaç bitki, araç taşıt, amaç hedeftir. Adres konum bilgisi, ampul ışık aracı, ayna yansıtıcı, akış ilerleyiştir; araçlara ayrılan zeminin tamamı değildir. |
| 6.3 | alan ölçüsü | Ö | ÖRNEĞİ, ÖZETİ, ÖYKÜSÜ, ÖNSÖZÜ, ÖĞÜDÜ, ÖDÜLÜ, ÖZLEMİ | Metrekareyle belirtilen yüzey büyüklüğü; örnek temsilci, özet ve öykü anlatım biçimleridir. Önsöz giriş metni, öğüt tavsiye, ödül armağan, özlem duygudur; metrekareyle belirtilen büyüklük değildir. |
| 6.4 | ölçü birimi | B | BİÇİMİ, BİLGİSİ, BELGESİ, BASKISI, BÖLÜMÜ, BİLETİ, BEDELİ | Metre veya kilogram gibi karşılaştırma standardı; biçim görünüş, bilgi içerik, belge kayıttır. Baskı basılı nüsha, bölüm parça, bilet belge, bedel tutardır; kilogram veya metre gibi standart değildir. |
| 6.5 | birim fiyatı | F | FARKI, FİKRİ, FİŞİ, FORMU, FONU, FATURASI, FIRÇASI | Satıcıya ödenecek para tutarı; fark karşılaştırma, fikir düşünce, fiş belgedir. Form ve fatura belge, fon para kaynağı, fırça araçtır; tek ürünün parasal değeri değildir. |
| 6.6 | fiyat etiketi | E | EĞRİSİ, ETKİSİ, EKSENİ, ESNEKLİĞİ, EVRESİ, EŞİĞİ, ERİMESİ | Ürüne iliştirilmiş fiyatlı küçük kâğıt; eğri grafik, etki sonuç, eksen grafik doğrusudur. Esneklik tepki özelliği, evre aşama, eşik sınır, erime azalmadır; ürüne iliştirilen küçük kâğıt değildir. |
| 6.7 | etiket yazısı | Y | YERİ, YÜZEYİ, YIRTILIŞI, YAPIŞKANI, YÜKÜ, YUVASI, YUMAĞI | Levhanın üzerindeki harfler; yer konum, yüzey taşıyan zemin, yırtılış kopma biçimidir. Yapışkan tutturucu, yük ağırlık, yuva boşluk, yumak sarılı iptir; levha üzerindeki harfler değildir. |
| 6.8 | yazı tipi | T | TADI, TELİ, TASI, TOZU, TÜYÜ, TAVRI, TARİHİ | Harflerin ortak görünüş biçimi; tat duyusal özellik, tel ince metal, tas kaptır. Toz ince tane, tüy kıl, tavır üslup, tarih zaman bilgisidir; Arial gibi seçilen font ailesi değildir. |
| 6.9 | tip seçimi | S | SAYISI, SINIRI, SÜRESİ, SIRASI, SEBEBİ, SÖZLÜĞÜ, SAHİBİ | Çeşitler arasından birini tercih etme; sayı adet, sınır kapsam, süre zamandır. Sıra konum, sebep neden, sözlük başvuru kaynağı, sahip kişidir; tercih etme eylemi değildir. |
| 7.1 | yağmur damlası | D | DÖNEMİ, DUASI, DESENİ, DURGUNLUĞU, DUYURUSU, DEĞERİ, DURAĞI | Buluttan düşen küçücük su tanesi; dönem zaman, dua dilek, desen biçimlerin düzenidir. Durgunluk hareket azlığı, duyuru haber, değer kıymet, durak yerdir; buluttan düşen su tanesi değildir. |
| 7.2 | damla sesi | S | SÜSÜ, SAYISI, SINIRI, SIVISI, SÜRESİ, SERİSİ, SEYRİ | Duyulan tıp tıp; süs görsel, sayı adet, sınır dış kenardır. Sıvı madde, süre zaman, seri dizi, seyir ilerleyiştir; kulakla duyulan tıp tıp değildir. |
| 7.3 | ses kaydı | K | KODU, KAYBI, KİPİ, KAYNAĞI, KALIBI, KANALI, KALİTESİ | Yeniden dinlemek için saklanan veri; kod simge, kayıp eksilme, kip biçimdir. Kaynak çıkış yeri, kalıp biçim, kanal iletim yolu, kalite niteliktir; yeniden çalınmak üzere saklanan veri değildir. |
| 7.4 | kayıt cihazı | C | CİLDİ, CEVABI, CETVELİ, CİNSİ, CİROSU, CEBİ, CİLASI | Başlat tuşuyla görüntü veya konuşma saklayan elektronik alet; cilt kitap bölümü, cevap yanıt, cetvel çizelgedir. Cins tür, ciro satış tutarı, cep bölme, cila kaplamadır; kayıt yapan elektronik alet değildir. |
| 7.5 | cihaz ekranı | E | ETİKETİ, ENERJİSİ, EVRAKI, EKSENİ, EKLENTİSİ, EŞİĞİ, ETKİSİ | Açılınca görüntü veren dijital yüzey; etiket tanıtıcı, enerji güç, evrak belgelerdir. Eksen doğru, eklenti ek parça, eşik sınır, etki sonuçtur; açılınca görüntü veren yüzey değildir. |
| 7.6 | ekran parlaklığı | P | PENCERESİ, PİKSELİ, PÜRÜZSÜZLÜĞÜ, PAZARLIĞI, POLİÇESİ, PAKETLEMESİ, PROTOKOLÜ | Görüntünün ışıklılık derecesi; pencere görüntü bölümü, piksel tek nokta, pürüzsüzlük yüzey niteliğidir. Pazarlık fiyat görüşmesi, poliçe belge, paketleme sarma, protokol kurallar bütünüdür; görüntünün ışıklılık derecesi değildir. |
| 7.7 | parlaklık ayarı | A | AMACI, ARALIĞI, ARACI, ARTIŞI, AKIŞI, ANISI, ALANI | Işığı artırıp azaltan düzenleme; amaç hedef, aralık sınırlar arası, araç düzenlemeyi yapan nesnedir. Artış sonuç, akış ilerleyiş, anı hatıra, alan yüzeydir; artırıp azaltmak için yapılan düzenleme değildir. |
| 7.8 | ayar düğmesi | D | DÜZEYİ, DİZİNİ, DÖKÜMÜ, DEĞERİ, DERECESİ, DAMGASI, DESENİ | Parmakla çevrilen yuvarlak kontrol parçası; düzey seviye, dizin ve döküm bilgi düzenleridir. Değer büyüklük, derece seviye, damga iz, desen bezemedir; çevrilen fiziksel kontrol parçası değildir. |
| 7.9 | düğme deliği | D | DESENİ, DİZİSİ, DÜZEYİ, DÜZENİ, DEĞERİ, DÖKÜMÜ, DOKUSU | İpliğin geçtiği açıklık; desen bezeme, dizi sıralanış, düzey yükseklik veya seviyedir. Düzen yerleşim, değer kıymet, döküm üretim veya liste, doku yüzey niteliğidir; iplik geçen açıklık değildir. |
| 8.1 | orman yolu | Y | YAŞI, YANI, YÜZÜ, YÜKÜ, YEMİ, YAPISI, YANGINI | Üzerinde yürünerek ağaçlardan geçilen güzergâh; yaş zaman, yan taraf, yüz dış görünüştür. Yük ağırlık, yem besin, yapı düzen, yangın afettir; yürünecek güzergâh değildir. |
| 8.2 | yol haritası | H | HATIRASI, HESABI, HABERİ, HİZMETİ, HURDASI, HATTI, HARCI | Ölçekli coğrafi çizim; hatıra anı, hesap işlem, haber bilgidir. Hizmet iş, hurda artık, hat bağlantı, harç malzeme veya ücrettir; ölçekli coğrafi çizim değildir. |
| 8.3 | harita işareti | İ | İÇERİĞİ, İSMİ, İPLİĞİ, İZAHI, İADESİ, İMALATI, İSTEĞİ | Bir yeri veya özelliği anlatan tek simge; içerik bütün bilgi, isim ad, iplik ince liftir. İzah açıklama, iade geri verme, imalat üretim, istek taleptir; tek bir coğrafi simge değildir. |
| 8.4 | işaret dili | D | DİBİ, DİZİSİ, DESENİ, DALI, DİŞİ, DOZU, DÖNEMİ | El ve beden hareketleriyle iletişim sistemi; dip alt kısım, dizi sıralanış, desen bezemedir. Dal kol, diş çıkıntı, doz miktar, dönem zamandır; el hareketleriyle iletişim sistemi değildir. |
| 8.5 | dil kursu | K | KARTI, KODU, KURALI, KÖKÜ, KURAMI, KAPSAMI, KILIFI | Lisan öğrenmek için gidilen eğitim; kart belge, kod tanıtıcı, kural ilkedir. Kök temel sözcük, kuram açıklama sistemi, kapsam sınır, kılıf örtüdür; gidilen eğitim değildir. |
| 8.6 | kurs programı | P | PANOSU, PROJESİ, PERSONELİ, PAKETİ, PANJURU, PUSULASI, PROSEDÜRÜ | Derslerin gün ve saatlerini gösteren plan; pano taşıyıcı yüzey, proje çalışma tasarısı, personel çalışanlardır. Paket hizmet bütünü, panjur örtü, pusula yön aracı, prosedür işlem kurallarıdır; gün ve saat planı değildir. |
| 8.7 | program sunucusu | S | SÜRESİ, SENARYOSU, SPONSORU, SEYİRCİSİ, SAHNESİ, SLOGANI, SAHİBİ | Yayında konuk ve konu tanıtan kişi; süre zaman, senaryo metin, sponsor destekçidir. Seyirci izleyen, sahne mekân, slogan söz, sahip maliktir; yayında konuk tanıtan görev değildir. |
| 8.8 | sunucu ekibi | E | EVİ, ESERİ, EŞYASI, ETKİSİ, EMEĞİ, EKRANI, EĞİTİMİ | Yayını takdim eden kişiler topluluğu; ev konut, eser ürün, eşya nesnelerdir. Etki sonuç, emek çaba, ekran yüzey, eğitim öğrenimdir; yayını takdim eden kişiler topluluğu değildir. |
| 8.9 | ekip lideri | L | LİSTESİ, LOGOSU, LAKABI, LİSANSI, LİMANI, LAMBASI, LEVHASI | Gruba yol gösteren kişi; liste döküm, logo simge, lakap takma addır. Lisans izin, liman yer, lamba araç, levha yüzeydir; gruba yol gösteren kişi değildir. |
| 9.1 | yaz tatili | T | TARİHİ, TARİFİ, TAKVİMİ, TEMPOSU, TADİLATI, TASVİRİ, TEKNESİ | Sıcak aylardaki uzun okul molası; tarih gün bilgisi, tarif açıklama, takvim zaman planıdır. Tempo hız, tadilat onarım, tasvir betimleme, tekne taşıttır; okul molası değildir. |
| 9.2 | tatil planı | P | PARASI, PUANI, PULU, PAKETİ, PORTALI, POSTASI, PANOSU | Gidilecek yer ve zamanı önceden belirleme; para kaynak, puan değerlendirme, pul küçük damgadır. Paket satın alınan hizmet bütünü, portal site, posta gönderim, pano yüzeydir; kişinin gezi yer ve günlerini kararlaştırma eylemi değildir. |
| 9.3 | plan değişikliği | D | DENETİMİ, DOKÜMANI, DAYANAĞI, DESTEKÇİSİ, DANIŞMANI, DİSİPLİNİ, DİREKTÖRÜ | Önceden kararlaştırılanı başka türlü yapma; denetim kontrol, doküman belge, dayanak gerekçedir. Destekçi ve danışman kişi, disiplin çalışma düzeni, direktör yöneticidir; kararlaştırılanı başka türlü yapma değildir. |
| 9.4 | değişiklik talebi | T | TARİHİ, TAKVİMİ, TASLAĞI, TUTARI, TANIMI, TÜRÜ, TESPİTİ | Başka hâle getirmeyi isteme; tarih ve takvim zaman bilgisi, taslak ön çalışmadır. Tutar miktar, tanım açıklama, tür sınıf, tespit belirlemedir; değişmesini isteme eylemi değildir. |
| 9.5 | talep formu | F | FARKI, FONU, FİKRİ, FAZLASI, FAKTÖRÜ, FİYATI, FİLTRESİ | İstek ve kimlik kutucukları doldurulan başvuru belgesi; fark karşılaştırma, fon kaynak, fikir düşüncedir. Fazla artan miktar, faktör etken, fiyat tutar, filtre süzgeçtir; kutucuklu başvuru belgesi değildir. |
| 9.6 | form numarası | N | NİTELİĞİ, NÜSHASI, NEDENİ, NOKTASI, NİZAMI, NİYETİ, NAKLİ | Belgeyi ayıran sayı; nitelik özellik, nüsha kopya, neden gerekçedir. Nokta iz, nizam düzen, niyet amaç, nakil aktarımdır; belgeyi ayıran sayı değildir. |
| 9.7 | numara sırası | S | SAYISI, SİMGESİ, SINIRI, SESİ, SERÜVENİ, SEBEBİ, SAHİBİ | Sayıların küçükten büyüğe dizilişi; sayı adet, simge işaret, sınır uç değerdir. Ses işitsel, serüven olaylar, sebep gerekçe, sahip kişidir; küçükten büyüğe diziliş değildir. |
| 9.8 | sıra arkadaşı | A | ARALIĞI, AHŞABI, ANAHTARI, ARKALIĞI, AYRINTISI, AKSESUARI, AĞIRLIĞI | Sınıfta aynı masayı paylaşan kişi; aralık boşluk, ahşap malzeme, anahtar açıcıdır. Arkalık destek, ayrıntı küçük özellik, aksesuar ek eşya, ağırlık büyüklüktür; masayı paylaşan kişi değildir. |
| 9.9 | arkadaş grubu | G | GÜCÜ, GİZİ, GÖZÜ, GİYSİSİ, GÜNÜ, GELİRİ, GÖREVİ | Birlikte vakit geçiren insanlar topluluğu; güç kuvvet, giz sır, göz organdır. Giysi kıyafet, gün zaman, gelir kazanç, görev iştir; insanlar topluluğu değildir. |
| 10.1 | müzik dersi | D | DALI, DİLİ, DİSKİ, DÜZEYİ, DOKUSU, DEĞERİ, DOZU | Okulda nota ve ezgi öğrenilen saat; dal alan, dil ifade sistemi, disk kayıt ortamıdır. Düzey seviye, doku yapı, değer kıymet, doz miktardır; okulda öğrenim saati değildir. |
| 10.2 | ders kitabı | K | KAYDI, KONUSU, KURALI, KARTI, KUTUSU, KROKİSİ, KADROSU | Konuları çalışmak için basılı kaynak; kayıt saklanan veri, konu içerik, kural ilkedir. Kart tek küçük belge, kutu muhafaza, kroki yer çizimi, kadro çalışanlardır; sayfaları ciltli öğrenim kaynağı değildir. |
| 10.3 | kitap yazarı | Y | YERİ, YAPISI, YORUMU, YÜZEYİ, YILI, YOLU, YAPIŞKANI | Eseri kaleme alan kişi; yer konum, yapı düzen, yorum değerlendirmedir. Yüzey dış bölüm, yıl zaman, yol güzergâh, yapışkan maddedir; eseri kaleme alan kişi değildir. |
| 10.4 | yazar imzası | İ | İSMİ, İZNİ, İMAJI, İŞİ, İLANI, İLGİSİ, İKAMETİ | Kendine özgü el yazısı işareti; isim ad, izin onay, imaj izlenimdir. İş uğraş, ilan duyuru, ilgi dikkat, ikamet oturulan yerdir; özgün el yazısı işareti değildir. |
| 10.5 | imza töreni | T | TARİHİ, TAKVİMİ, TALEBİ, TASLAĞI, TUTANAĞI, TABELASI, TAMİRİ | Anlaşmanın resmen onaylandığı etkinlik; tarih ve takvim zaman bilgisi, talep istektir. Taslak ön çalışma, tutanak kayıt, tabela levha, tamir onarımdır; resmî onay etkinliği değildir. |
| 10.6 | tören alanı | A | AKIŞI, AMACI, ANISI, ADRESİ, AFİŞİ, AKSAMI, ARACI | Kutlama için ayrılan geniş açık yer; akış sıra, amaç hedef, anı hatıradır. Adres konum bilgisi, afiş duyuru, aksam parçalar, araç taşıttır; geniş açık kutlama yeri değildir. |
| 10.7 | alan derinliği | D | DERECESİ, DÜZENİ, DESENİ, DAĞILIMI, DENETİMİ, DEĞERİ, DOKUSU | Fotoğrafta net çıkan yakın-uzak mesafesi; derece ölçek değeri, düzen yerleşim, desen bezemedir. Dağılım yayılış, denetim kontrol, değer kıymet, doku yüzey niteliğidir; fotoğraftaki netlik mesafesi değildir. |
| 10.8 | derinlik algısı | A | AYARI, ARALIĞI, ARTIŞI, AMACI, ARACI, AZALIŞI, ANLATIMI | Görerek uzaklık ayırt etme yetisi; ayar düzenleme, aralık mesafe, artış büyümedir. Amaç hedef, araç nesne, azalış küçülme, anlatım ifadedir; gözün uzaklık ayırt etme yetisi değildir. |
| 10.9 | algı yönetimi | Y | YANILGISI, YÖNTEMİ, YETERLİĞİ, YAPISI, YÜZEYİ, YOLCULUĞU, YANSIMASI | İzlenimleri amaçlı yönlendirme işi; yanılgı hata, yöntem yol, yeterlik beceri düzeyidir. Yapı düzen, yüzey dış bölüm, yolculuk süreç, yansıma sonuçtur; izlenimleri yönlendirme işi değildir. |
| 11.1 | güneş enerjisi | E | EVRESİ, EKSENİ, ETKİSİ, ETİKETİ, EKRANI, EMİCİSİ, ERİŞİMİ | Panellerle yararlanılan ışık ve ısı gücü; evre aşama, eksen dönme doğrusu, etki genel sonuçtur. Etiket tanıtıcı, ekran yüzey, emici parça, erişim ulaşmadır; panellerle yararlanılan güç değildir. |
| 11.2 | enerji kaynağı | K | KOTASI, KAYBI, KANALI, KAYDI, KALİTESİ, KATSAYISI, KILAVUZU | Gücün elde edildiği köken; kota sınır, kayıp eksilen miktar, kanal iletim yoludur. Kayıt veri, kalite nitelik, katsayı çarpan, kılavuz rehberdir; gücün elde edildiği yer veya madde değildir. |
| 11.3 | kaynak suyu | S | SESİ, SÜSÜ, SELİ, SÖZÜ, SÜTÜ, SIRRI, SİSİ | Yerden çıkan içilebilir sıvı; ses işitsel, süs bezeme, sel taşkındır. Söz ifade, süt başka sıvı, sır gizli bilgi, sis küçük damlacıklardır; yerden çıkan içilebilir sıvı değildir. |
| 11.4 | su deposu | D | DÜZEYİ, DALGASI, DAMLASI, DEVRESİ, DÖNGÜSÜ, DİRENCİ, DOKUSU | Tonlarca sıvı biriktiren büyük tank; düzey seviye, dalga hareket, damla küçük sıvı tanesidir. Devre sistem, döngü tekrar, direnç karşı koyma, doku yapıdır; tonlarca sıvı biriktiren tank değildir. |
| 11.5 | depo hacmi | H | HARCI, HATTI, HIZI, HATASI, HURDASI, HİSSESİ, HIRSIZI | Tankın içine sığan sıvı miktarı; harç yapı malzemesi, hat çizgi veya bağlantı, hız hareketin çabukluğudur. Hata yanlışlık, hurda artık, hisse pay, hırsız kişidir; tankın iç kapasitesi değildir. |
| 11.6 | hacim hesabı | H | HATASI, HARFİ, HABERİ, HİSSESİ, HİLESİ, HÜKMÜ, HİZASI | Kaplanan yeri sayılarla bulma işlemi; hata yanlışlık, harf simge, haber bilgidir. Hisse pay, hile aldatma, hüküm karar, hiza doğrultudur; kaplanan yeri sayılarla bulma işlemi değildir. |
| 11.7 | hesap makinesi | M | MASASI, MADDESİ, MERKEZİ, MANTIĞI, MASRAFI, METNİ, MÜHRÜ | Tuşlarla dört işlem yapan araç; masa mobilya, madde unsur, merkez yerdir. Mantık düşünme düzeni, masraf gider, metin yazı, mühür damgadır; tuşlu dört işlem aracı değildir. |
| 11.8 | makine parçası | P | PAKETİ, PROJESİ, PAZARI, PLANI, PORTRESİ, PROTOKOLÜ, PASLANMASI | Sökülüp değiştirilen fiziksel bileşen; paket ambalaj, proje tasarı, pazar satış ortamıdır. Plan tasarı, portre görsel, protokol kurallar, paslanma aşınma sürecidir; sökülüp değiştirilen bileşen değildir. |
| 11.9 | parça numarası | N | NİTELİĞİ, NÜSHASI, NEDENİ, NOKTASI, NAKLİ, NAKLİYESİ, NOKSANLIĞI | Katalogdaki rakamlı kimlik; nitelik özellik, nüsha kopya, neden gerekçedir. Nokta iz, nakil ve nakliye taşıma, noksanlık eksikliktir; katalogdaki rakamlı kimlik değildir. |
| 12.1 | hava basıncı | B | BOŞLUĞU, BORUSU, BİLGİSİ, BİÇİMİ, BOYASI, BÜLTENİ, BAĞLANTISI | Atmosferin yüzeylere uyguladığı kuvvetle ilgili büyüklük; boşluk aralık, boru iletim aracı, bilgi içeriktir. Biçim şekil, boya kaplama, bülten haber metni, bağlantı ilişkidir; atmosfer kuvvetinin ölçüsü değildir. |
| 12.2 | basınç ölçümü | Ö | ÖRNEĞİ, ÖZETİ, ÖYKÜSÜ, ÖNEMİ, ÖNCESİ, ÖDÜLÜ, ÖĞÜDÜ | Barometreyle sayısal değer belirleme işi; örnek temsilci, özet ve öykü anlatım biçimleridir. Önem değer, önce zaman, ödül armağan, öğüt tavsiyedir; barometreyle değer belirleme eylemi değildir. |
| 12.3 | ölçüm sonucu | S | SÜRESİ, SIRASI, SEBEBİ, SAYISI, SAATİ, SİSTEMİ, SÖZLÜĞÜ | Aletle bulunan değer; süre geçen zaman, sıra konum, sebep yapılış nedenidir. Sayı adet, saat zaman, sistem düzenek, sözlük başvuru kaynağıdır; işlemden çıkan asıl değer değildir. |
| 12.4 | sonuç raporu | R | RESMİ, ROZETİ, RENGİ, RİTMİ, RAKAMI, REÇETESİ, REKLAMI | Gerekçeli değerlendirme metni; resim görsel, rozet simge, renk görünüş özelliğidir. Ritim tekrar, rakam simge, reçete tarif, reklam tanıtımdır; bulguları değerlendiren ayrıntılı metin değildir. |
| 12.5 | rapor dosyası | D | DESENİ, DÜZEYİ, DİLİ, DEĞERİ, DAĞITIMI, DÜZELTİSİ, DÖNEMİ | Bilgisayarda saklanan belge bütünü; desen bezeme, düzey seviye, dil anlatım aracıdır. Değer kıymet, dağıtım ulaştırma, düzelti hata giderme, dönem zamandır; bilgisayarda saklanan belge bütünü değildir. |
| 12.6 | dosya adı | A | AĞI, ALTI, ASLI, AKIŞI, ARŞİVİ, ALANI, AMACI | Belgeye verilen tanıtıcı sözcük; ağ bağlantı yapısı, alt aşağıdaki bölüm, asıl özgün nüshadır. Akış ilerleyiş, arşiv saklama bütünü, alan yer, amaç hedeftir; dosyayı tanıtan sözcük değildir. |
| 12.7 | ad listesi | L | LAKABI, LEKESİ, LEVHASI, LİSANSI, LİSANI, LÜGATİ, LİMANI | Birçok ismin alt alta dökümü; lakap takma ad, leke iz, levha yazı taşıyıcı yüzeydir. Lisans izin, lisan dil, lügat sözlük, liman yerdir; kişilerin isimlerinin alt alta dökümü değildir. |
| 12.8 | liste sırası | S | SAYISI, SINIRI, SÜRESİ, SAHİBİ, SEBEBİ, SÜRÜMÜ, SEMBOLÜ | Dizilmiş maddeler arasındaki konum; sayı adet, sınır kapsam, süre zamandır. Sahip kişi, sebep gerekçe, sürüm versiyon, sembol simgedir; maddeler arasındaki konum değildir. |
| 12.9 | sıra numarası | N | NİTELİĞİ, NÜSHASI, NEDENİ, NOKTASI, NİYETİ, NİZAMI, NEZAKETİ | Kuyruktaki yeri belirten sayı; nitelik özellik, nüsha kopya, neden gerekçedir. Nokta iz, niyet amaç, nizam düzen, nezaket davranıştır; kuyruktaki yeri belirten sayı değildir. |
