# Cozy Marble Puzzle ekran tel kafesi

Referans: `Cozy Marble Puzzle Level 35.png` (1024 × 1536). Arayüz iki katmandan oluşur:

```text
┌────────────────────────────────────────────────────────────┐
│  [ geri / bölümler ]            [ 35 ]          [ yeniden ] │  y=72
│                                                            │
│        ┌────────────────────────────────────────────┐      │
│        │  hedef kartı · 4 kolon · 4 satır           │      │
│        ├────────────────────────────────────────────┤      │
│        │          yatay kadife kanal                │      │
│        │   │槽│   │槽│   │槽│   │槽│                │      │
│        │   │  │   │  │   │  │   │  │                │      │
│        └────────────────────────────────────────────┘      │
│                 krem mermer + pirinç tabla                 │
└────────────────────────────────────────────────────────────┘
```

## Uygulanan ölçü sistemi

- Oyun tasarım alanı: **1024 × 1536**. Referans ekranındaki tabla bu tasarım alanının yaklaşık **0.888 ölçeğinde**, `(56px, 155px)` konumunda yerleşir.
- Üst kontrol şeridi: üstten 72 px, yanlardan %8.6; butonlar 112 × 112 px, seviye rozeti 270 × 94 px.
- Tabla sahnesi: `top: 155px`, `bottom: 17px`; referans görünümde 0.888 ölçek.
- Hedef kartı: ilk merkez `y=162`, satır aralığı 85 tasarım px.
- Kanal başlangıcı: `y=585`; oynanabilir hücre merkezleri yatayda **144,2**, dikeyde **106 tasarım px** aralıklı; bilye çapı **104 tasarım px**. Dikeyde bilyeler arasında yalnızca **2 px** boşluk kalır. Yatay merkezler `154 + x × 144,2` formülüyle hesaplanır.
- Tahta görselindeki oluklar aynı merkezlere hizalanır; olukların iç genişliği korunarak aralarındaki alanlar yeniden ölçeklenir. Bu geometri cep görünümü açıkken de kapalıyken de kullanılır.
- Küçük ekranlarda üst şerit 58 px butonlara, tabla sahnesi `92px 0 42px` aralığına düşer.

## Claude Opus 5.5 için fizik notu

Görsel katman hazır; aşağıdaki oynanış kararları mevcut projede özellikle ayrı tutuldu:

1. Mevcut oyun fiziği hücre tabanlı bir grafik kullanıyor. Taş, kanalda komşu boş hücrelerden ilerliyor; yuvaya bırakılınca en alt boş hücreye düşüyor. Bu, görsel tablanın fiziksel eğimi veya çarpışma kuvveti değildir.
2. Referans görselde sol yuvanın üstünde kanalda duran bir bilye ve yuvalarda toplam beş görsel bilye görülüyor. `levels.js` seviye 35 ise dört renk, kapasite dört ve dört yuva kuralı kullanıyor. Görsel durum ile veri modeli birebir eşlenecekse seviye 35 için kapasite/renk sayısı yeniden tanımlanmalı.
3. Kanalda duran taşın açık bir yuvaya otomatik düşmesi `afterMove()` içinde yapılıyor. Bu kural korunacaksa animasyon tamamlanmadan yeni giriş engellenmeli; aksi halde hızlı sürüklemede iki taşın aynı hücreye düşme ihtimali oluşabilir.
4. `undo()` konum, gizli taş, kilit açma ve buz çözülme durumlarını geri yüklüyor; ses ve animasyon geçmişi geri alınmıyor. Fizik revizyonunda görsel animasyon ile durum geçmişi aynı zaman çizelgesine bağlanmalı.

