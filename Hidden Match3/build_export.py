#!/usr/bin/env python3
"""Tek dosyalık (self-contained) iPhone export'u üretir:
- index.html'deki tüm PNG'leri cihaz çözünürlüğüne göre küçültüp data URI olarak gömer.
- matter.js'i CDN'den çekip inline eder.
Çıktı: match3_iphone.html  (AirDrop ile telefona atılıp Safari'de açılabilir)
"""
import re, os, base64, json, subprocess, tempfile, sys, urllib.request

GAME_DIR = "/Users/emircicek/Desktop/demomatch2d/oyun/match_factory_weighted_art_v83_candy_direct_level copy"
SRC = os.path.join(GAME_DIR, "index.html")
OUT = os.path.join(GAME_DIR, "match3_iphone.html")
MATTER_URL = "https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.19.0/matter.min.js"
MAX_DIM = 300  # sprite'lar ~270px backing render edildiği için yeterli

html = open(SRC, "r", encoding="utf-8").read()

# 1) Referans verilen tüm png yollarını topla.
paths = sorted(set(re.findall(r"assets[\w/]*\.png", html)))
print(f"{len(paths)} png bulundu")

tmp = tempfile.mkdtemp()
asset_data = {}
total_in = total_out = 0
for i, p in enumerate(paths):
    full = os.path.join(GAME_DIR, p)
    if not os.path.isfile(full):
        print("EKSİK:", p); sys.exit(1)
    total_in += os.path.getsize(full)
    out_png = os.path.join(tmp, f"a{i}.png")
    # küçült (sadece downsize; -Z aspect'i korur)
    subprocess.run(["sips", "-Z", str(MAX_DIM), full, "-o", out_png],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    raw = open(out_png, "rb").read()
    total_out += len(raw)
    asset_data[p] = "data:image/png;base64," + base64.b64encode(raw).decode("ascii")

print(f"PNG toplam: {total_in/1e6:.1f}MB -> küçültülmüş {total_out/1e6:.1f}MB")

# 2) matter.js'i çek.
matter_code = urllib.request.urlopen(MATTER_URL, timeout=30).read().decode("utf-8")
print(f"matter.js: {len(matter_code)/1e3:.0f}KB")

# 3) HTML'i dönüştür: CDN script -> inline, ASSET_DATA enjekte.
html = re.sub(r'<script src="https://cdnjs[^"]*matter[^"]*"></script>',
              lambda m: "<script>\n" + matter_code + "\n</script>", html, count=1)

asset_js = "<script>window.ASSET_DATA=" + json.dumps(asset_data) + ";</script>\n"
html = html.replace("<body>", "<body>\n" + asset_js, 1)

open(OUT, "w", encoding="utf-8").write(html)
print(f"YAZILDI: {OUT}  ({os.path.getsize(OUT)/1e6:.1f}MB)")
