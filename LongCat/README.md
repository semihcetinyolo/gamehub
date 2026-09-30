# Puppy Maze (prototip)

Referans: Long Cat (Google Play `com.martinmagni.longcat`). Bizde kedi yerine **sosis köpek**. Tek kareden başlarsın, kaydırınca köpeğin kafası duvara **ya da kendi gövdesine** çarpana kadar gider, geçtiği her kare gövde olur. Bütün kareleri doldurunca bölüm biter. Kendi üstünden geçemezsin; hiçbir yöne gidemezsen sıkışırsın (fail). Amaze'den farkı bu.

- **Hamle sınırı yok.**
- **Fail'de devam yok:** sıkıştığın an köpek üzülür, başlangıca geri sarılır ve bölüm baştan başlar. Geri al yalnızca oynarken kullanılabilir.

- `index.html`: oyun. `index.html#7` doğrudan 7. bölümü açar. Ok tuşları / WASD, Z veya Backspace geri al, R baştan, H ipucu.
- **Kontrol:** Kaydır. Parmağını kaldırmadan yön değiştirebilirsin: sağa sürükleyip duvara yaslandıktan sonra aynı hareketle yukarı sürüklersen köpek yukarı devam eder. Köpek kayarken verilen yönler sıraya girer (en fazla 3). Ayrıca köpeğin satırında veya sütununda, gideceği yol üzerindeki bir kareye **dokunursan** köpek o yöne gider. Ulaşılamayan bir kareye dokunursan köpek sadece o yöne küçük bir sarsılma yapar.
- **İpucu:** Ok gösterilmez. Doğru yöndeki karelerin patileri 2,6 saniye boyunca altın renginde parlar; parlama köpekten uzağa doğru dalga hâlinde ilerler.
- `engine.js`: saf mantık (kaydırma, kazanma, sıkışma) ve çözücü (ipucu + zorluk ölçümü). Node'da da çalışır.
- `render.js`: tahta çizimi. `dog.js`: üretilmiş sosis köpek atlası, hareketli kulaklar/patiler ve canlı yüz. `art.js`: görsel slotları. `game.js`: ekranlar, girdi, animasyon. `ui.css`: arayüz.
- [ART.md](ART.md): üretilmiş görseller, animasyonlar ve tam prompt dosyası. [Animasyon önizlemesi](art-preview.html): canlı karakter animasyonları ve derinlik karşılaştırması.

- `levels.js`: 30 bölüm. `tools/gen.js` üretir; `node tools/verify.js` hepsinin çözülebildiğini ve eğri kuralını kontrol eder.

**Yüz:** göz kırpar (bazen iki kere), etrafa bakar, kayarken gideceği yöne bakar ve dili dışarıda sallanır, çarpınca gözlerini sıkar, uzun kaydırmada şaşırır, köşeye sıkışınca (tek ve kısa bir çıkış kalınca) hafifçe endişelenir, kazanınca sevinir, sıkışınca küçük bir gözyaşı belirir. Kulaklar ve kuyruk da ruh haline göre hareket eder. Kayarken kafanın arkasında hafif bir blur izi kalır.

## UI sistemi

Sosis köpeğe özel bisküvi, karamel ve krem teması. Ana menüde yeşil kemik biçimli OYNA butonu, pati desenli zemin, yıldız sayacı ve ayarlar; bölüm seçiminde bisküvi kartları; oyunda ortalanmış bölüm başlığı ve sade ilerleme çubuğu bulunur. Kalan kare sayacı kaldırıldı. Alt alanda yalnızca ödül kemiği (İPUCU) ve pati/dönüş oku (BAŞTAN) butonları bulunur. Geri al boosterı kaldırılmıştır. Ayarlar ve sonuç kartları da aynı krem-kahve görünümündedir. Yeni ölçeklenebilir çizimler: `assets/ui/dog-icons.svg`, `bone-button.svg`, `paw-pattern.svg`. Eski PNG dosyaları korunur ancak arayüz onları kullanmaz.

## Analizden gelen kararlar

| Long Cat'te sorun | Prototipte |
|---|---|
| Zorluk eğrisi kötü | 1–3 öğretici, sonra beşli döngüler: normal, normal+, **ZOR**, kolay, kolay. Her zor bölümden sonra hemen iki kolay bölüm gelir, taban zorluk yavaşça artar. `verify.js` zor bölümden sonraki iki bölümün daha kolay olmasını zorunlu tutar. |
| Her duvar çarpmasında ekran sallanıyor | Ekran hiç sallanmaz. Çarpınca sadece kafa çarptığı yöne doğru ezilir, gözlerini sıkar, küçük bir toz çıkar, kısa bir "boop" sesi ve 8 ms titreşim olur. |
| UI kötü, performans sorunu var | Ortak UI sistemi kullanılıyor. Tahta her bölümde bir kez offscreen canvas'a çiziliyor; yüz ve kulak animasyonları açık ekranda çalışır; ana menüden ayrılınca demo döngüsü durur. |
| Gölgeyle verilen boyut algısı kötü | Bölüme göre sırayla lavanta, nane yeşili, şeftali ve gökyüzü mavisi yüzey dokuları, ışıklı üst kenarlar, koyu dikey yüzler ve yumuşak temas gölgeleri kullanılıyor. Her duvarın ön yüzü altındaki karede görünür; ışık her yerde aynı yönden gelir. Ayarlar → **Derinlik: Derinlikli / Düz** ile iki görünüm karşılaştırılabilir. |
| Kısa bölümlerden sonra bile reklam | Prototipte reklam yok. Canlı oyunda interstitial'ı bölüm sayısına değil oynama süresine bağlamak ve öğretici bölümlerle zor bölümden sonraki kolay bölümlerde göstermemek önerilir. |

## Zorluk ölçümü (`engine.js` → `analyse`)

Çözücü, bölümün bütün durum ağacını gezer (Zobrist hash + memo). Zorluk, bir oyuncunun rastgele ama dikkatli oynayarak bölümü çözme olasılığından hesaplanır. Dikkatli oyuncu, onu hemen sıkıştıracak hamleyi yapmaz: `-log2(pSmart)`. Buna kaydırma sayısı başına küçük bir terim ve **geç ısıran tuzaklar** için ek puan eklenir. Geç ısıran tuzak, yanlış hamlenin ancak birkaç hamle sonra sıkıştırdığı karar noktasıdır.

`tools/gen.js`, bölümleri kaydırma kuralını boş bir tahtada oynayarak "kazır"; böylece her bölümün çözümü garantidir. Durduğu karenin önündeki kare kalıcı duvar olarak kilitlenir. Üretici her slot için yüzlerce aday üretir ve eğrideki hedefe en yakın olanı seçer. Zor slotlar geç ısıran tuzak ister. Yeniden üretmek için:

```bash
node tools/gen.js --seed 7
node tools/verify.js
```

Yıldızlar: ★ bitir · ★★ ipucusuz · ★★★ ipucusuz ve geri almadan (sıkışmadan).

## Animasyon doğrulaması

`node tools/verify-animation.js`: ana menüde hamle başlangıcının sıçramaması, hareket sürekliliği, yeniden boyutlandırma, kazanma, geri sarma ve ekran geçişlerinde tek animasyon döngüsü kontrol edilir.

Duvar teması bölüm numarasına bağlıdır: dört renkten biri sırayla seçilir; tekrar başlatma ve ekran boyutu değişimi rengi değiştirmez. Yan yüz ve ışıklı kenarlar aynı paleti kullanır. Yeni görseller ve tam promptlar `assets/environment/wall-variants-prompts.md` içinde listelenir.
