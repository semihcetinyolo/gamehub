# Pixhaku — level görselleri

İlk görseller Codex'in yerleşik ImageGen aracıyla, her level için ayrı bir üretim isteğiyle oluşturuldu. Kullanılan prompt'lar `prompts.json` dosyasında (`no` alanı eski level numarası, `id` alanı görselin bugünkü kimliği).

Dosyalar level numarasıyla değil tema kimliğiyle (`tools/pack_4-23.js` → `id`) adlandırılır, çünkü oyundaki sıra build'de zorluk skoruna göre değişebilir.

- `<id>.jpg`: kare level görseli, 1024×1024, kalite 90 JPEG. `<id>.png`: orijinali (repoda değil, diskte).
- `<id>-<en>x<boy>.jpg`: kare olmayan level'ın görseli, tahtanın oranında (ör. 8×10 tahta → 1024×1280).
- `eski-kare/`: tahtası sonradan dikey yapılan level'ların eski kare görselleri. Artık kullanılmıyor.

Eksik görseller için `../../pixhaku_level_creation_4-23.html` sayfası her level'ın taslağını (`../../taslaklar/<id>-taslak.png`), prompt'unu ve beklenen dosya adını gösterir. Görseli o adla kaydedip proje kökünde `node tools/build_pack.js` çalıştırınca görsel sayfaya ve `../../Pixhaku_prototype.html` içine gömülür. Görsel gelene kadar prototipte taslak görünür.
