# Pixhaku — level görselleri

Görseller Codex'in yerleşik ImageGen aracıyla, her level için ayrı bir üretim isteğiyle oluşturulur. Güncel 100 level'ın kompozisyon prompt'ları `prompts_100.json` dosyasında; bu genişletmede kullanılan tam üretim istekleri `generation_prompts_2026-10-03.json` dosyasındadır. `prompts.json` önceki üretimlerin arşividir.

Dosyalar level numarasıyla değil tema kimliğiyle (`id`) adlandırılır, çünkü oyundaki sıra build'de zorluk skoruna göre değişebilir. Önceki 20 bulmacanın kaynağı `tools/pack_4-23.js`, eklenen 77 bulmacanın kaynağı `tools/puzzles_100/`, tema tanımları `tools/themes_100.js` dosyasıdır. İlk üç öğretici level prototipten korunur.

- `<id>.jpg`: kare level görseli, 1024×1024 JPEG. Yeni görseller kalite 82, önceki görseller kalite 90'dır. `<id>.png`: orijinali (repoda değil, diskte).
- `<id>-<en>x<boy>.jpg`: kare olmayan level'ın görseli, tahtanın oranında (ör. 8×10 tahta → 1024×1280).
- `eski-kare/`: tahtası sonradan dikey yapılan level'ların eski kare görselleri. Artık kullanılmıyor.

`../../pixhaku_level_creation_1-100.html` her level'ın görselini, taslağını, başlangıç tahtasını, çözüm sırasını, zorluk metriklerini ve prompt'unu gösterir. Eski `../../pixhaku_level_creation_4-23.html` adresi aynı 100 level'lık içeriği taşır.

Pixhaku klasöründen çalıştırılacak komutlar:

```sh
node tools/generate_100.js          # yalnız eksik yeni bulmaca dosyalarını üretir
node tools/build_pack.js            # HTML, prototip, katalog ve level verilerini günceller
node tools/verify_100.js --require-art  # bağımsız çözücüyle 100 tek çözümü ve tüm görselleri doğrular
python3 ../fugo_export.py pixhaku    # fugo_export/Pixhaku.html dosyasını günceller
```

`../../levels_manifest.json` öğreticiler dahil 100 level'ın güncel sırasını ve görsel durumunu içerir. `../../levels_4-100.js` prototipteki üç öğreticiye eklenen 97 bulmacadır; `../../levels_4-23.js` önceki paketin arşividir.

Kampanya 20 easy, 30 medium, 30 hard, 20 expert level'dan oluşur. Skor çözücünün hesapladığı eforun 1,4'e bölünüp 0–100 arasına alınmasıdır; easy <30, medium <58, hard <82, expert ≥82. Oyuncu verisiyle ölçülmüş başarı oranı değildir. Tahtalar en fazla 8 sütun ve 10 satırdır. İlerleme tema kimliğiyle saklanır; eski 23 level'lık kayıtlardaki tamamlamalar yeni sıraya taşınır.
