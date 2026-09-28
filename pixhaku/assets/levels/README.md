# Pixhaku — Level 4–23 görselleri

Görseller Codex'in yerleşik ImageGen aracıyla, her level için ayrı bir üretim isteğiyle oluşturuldu. Kullanılan tam prompt seti `prompts.json` dosyasındadır; kompozisyon koordinatları level tasarımlarındaki Shikaku bölgelerinden gelir.

- `level-N.png`: üretilen orijinal görsel.
- `level-N.jpg`: HTML için 1024×1024, kalite 90 JPEG sürümü.
- `../../pixhaku_level_creation_4-23.html`: görselleri içine gömülü tasarım sayfası.
- `../../Pixhaku_prototype.html`: ilk 3 level ve yeni 20 levelın görselleri içine gömülü oynanabilir prototip.

Tüm JPEG dosyaları hazır olduğunda proje kökünde `node tools/build_pack.js` çalıştırmak level verisini, tasarım sayfasını ve prototipin yeni level bölümünü günceller. Derleme, her bulmacanın tek çözümü olduğunu ve tahmin gerektirmediğini doğrular. Prototipteki ilk üç level korunur; yeniden derleme yeni levelları çoğaltmaz.

Tasarım sayfasındaki “Bu level'ı oyna” bağlantıları prototipi ilgili leveldan açar. HTML dosyaları görselleri göstermek için dış dosyalara ihtiyaç duymaz; sayfalar arası bağlantılar için iki HTML dosyasını aynı klasörde tutun.
