# Vitray bölümleri

Oyuna hazır 50 bölüm `../../stained-levels.js` dosyasındadır. Bölüm sırası
`build_levels.js` içindeki `ORDER` listesiyle belirlenir.

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
zorunlu tutar.
