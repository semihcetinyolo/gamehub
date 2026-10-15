"""Main menu + profile pictures: the list for ChatGPT (Astra) and the importer.

python3 tools/menu/menu_art.py astra   → tools/menu/astra_menu.html + tools/menu/PROMPTS.md
python3 tools/menu/menu_art.py build   → assets/menu/<name>.webp from assets/menu/src/<name>.(png|jpg|webp)
                                          and menu-art.js (the list the game reads)
Until a picture exists the game draws a code-made stand-in, so the files can arrive one by one.
"""
import base64
import html
import io
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).parent
SRC = ROOT / 'assets' / 'menu' / 'src'
OUT = ROOT / 'assets' / 'menu'

STYLE = (
    'STYLE: a real handcrafted stained-glass piece (like Image 1, the CARTOGRAPH app icon): rich translucent jewel-toned '
    'glass with subtle ripples and inner glow, joined by dark bronze lead came lines; set in the world of an antique '
    'cartographer (brass compass, parchment sea charts, explorers). Palette built around deep forest green #294f43, '
    'warm parchment cream #faf3df, brass gold #d7b76c, terracotta #bf8c70 and sea teal #13878a, with small amber and '
    'crimson accents. Straight-on front view, bold simple shapes that still read at 48 px. No text, letters, numbers, '
    'logos, signature or watermark; no mockup, no photo background, no drop shadow outside the object.'
)

# name, what, size asked from ChatGPT, transparent?, size in the game, required?, prompt
ASSETS = [
    ('logo-emblem', 'Ana menüde CARTOGRAPH yazısının üstündeki amblem', '1024×1024', True, 256, True,
     'A circular stained-glass emblem: an eight-pointed compass rose in brass-gold and parchment-cream glass on a deep '
     'forest-green glass disc, ringed by a thin brass band with tiny teal and terracotta glass gems at the four '
     'cardinal points. Centred, filling about 90% of the canvas. Transparent background outside the circle.'),
] + [
    (f'avatar-{i + 1}', f'Profil resmi {i + 1}: {tr}', '1024×1024', False, 256, True,
     f'A round stained-glass portrait medallion of {who}, head and shoulders, friendly, facing the viewer. '
     'The medallion fills the whole square canvas edge to edge (the corners can be plain dark forest-green glass); '
     'the character is large and centred so it reads at 48 px. Same style, same lead thickness and same framing as '
     'the other avatars in this set.')
    for i, (tr, who) in enumerate([
        ('tilki kâşif', 'a clever red fox explorer in a forest-green coat holding a brass spyglass'),
        ('baykuş rotacı', 'a wise brown owl navigator with round brass spectacles and a small compass'),
        ('kedi denizci', 'a ginger cat sailor in a dark tricorn hat with a rolled sea chart under its arm'),
        ('kaplumbağa kaptan', "a sea turtle captain in a navy captain's cap with a small brass anchor"),
        ('ayı dağcı', 'a brown bear mountaineer with a cream scarf holding a glowing amber lantern'),
        ('tavşan haritacı', 'a cream rabbit map-maker with a quill pen and a parchment map'),
        ('kirpi gözlemci', 'a small hedgehog scout looking through a brass magnifying glass'),
        ('su samuru gezgin', 'a cheerful otter traveller in a terracotta neckerchief holding a wooden oar'),
    ])
] + [
    ('avatar-frame', 'Profil resminin çerçevesi (ortası boş)', '1024×1024', True, 256, False,
     'A thin round brass-and-glass ring frame for a profile picture: a polished brass ring with small inset glass '
     'gems (teal, amber, terracotta) and tiny compass ticks at north, east, south and west. The ring is about 12% of '
     'the width; everything inside the ring and outside it is fully transparent.'),
    ('icon-collection', '"Koleksiyon" düğmesinin ikonu', '1024×1024', True, 128, False,
     'A small icon of an arched stained-glass window with four colourful panes (teal, amber, terracotta, green) and '
     'dark lead lines, on a transparent background. Very simple, bold, readable at 24 px.'),
    ('menu-background', 'Ana menünün arka planı', '1024×1536', False, 1024, False,
     'A very soft, low-contrast background for a mobile menu: aged parchment with faint antique map contour lines and '
     'a pale compass rose, edges slightly darker. Mostly empty in the middle so text and buttons sit on top. Portrait 2:3.'),
]


def b64(path, mime):
    return f'data:{mime};base64,' + base64.b64encode(Path(path).read_bytes()).decode()


def small_ref(path, size=512):
    from PIL import Image
    im = Image.open(path).convert('RGB')
    im.thumbnail((size, size))
    buf = io.BytesIO()
    im.save(buf, 'JPEG', quality=88)
    return 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()


def prompt_of(a):
    name, _, size, transparent, _, _, text = a
    tail = ' Transparent background (PNG with alpha).' if transparent else ''
    return f'{text}{tail}\n\n{STYLE}'


def astra():
    icon = small_ref(ROOT / 'assets' / 'app-icon.png')
    glass = small_ref(ROOT / 'assets' / 'glass' / 'cat.webp')
    cards = []
    for n, a in enumerate(ASSETS, 1):
        name, what, size, transparent, game, req, _ = a
        cards.append(f'''
<section class="card" data-id="{name}">
  <header><span class="num">{n:02d}</span><h2>{html.escape(what)} <code>{name}</code></h2>
    <span class="tag {'req' if req else 'opt'}">{'gerekli' if req else 'isteğe bağlı'}</span>
    <label class="done"><input type="checkbox"> bitti</label></header>
  <div class="text">
    <p class="out">Kaydet: <b><code>{name}.png</code></b> · ChatGPT boyutu <b>{size}</b>{' · <b>şeffaf arka plan</b>' if transparent else ''} · oyunda {game} px</p>
    <div class="prompt-head"><b>Prompt</b><button class="btn copy">Prompt'u kopyala</button></div>
    <pre>{html.escape(prompt_of(a))}</pre>
  </div>
</section>''')
    page = f'''<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cartograph Menü Görselleri</title>
<style>
:root {{ --bg:#eef0e4; --card:#fffdf6; --ink:#1f2a24; --mute:#66705f; --line:#d8d6c2; --accent:#294f43; }}
* {{ box-sizing:border-box; }}
body {{ margin:0; background:var(--bg); color:var(--ink); font:15px/1.5 -apple-system,system-ui,sans-serif; }}
main {{ max-width:960px; margin:0 auto; padding:24px 16px 80px; }}
h1 {{ margin:0 0 4px; font-size:26px; }} .lead {{ color:var(--mute); margin:0 0 20px; }}
.howto {{ background:var(--card); border:1px solid var(--line); border-radius:12px; padding:18px 22px; margin-bottom:24px; }}
.howto ol {{ margin:8px 0 0; padding-left:22px; }} .howto li {{ margin:6px 0; }}
.refs {{ display:flex; gap:18px; flex-wrap:wrap; margin-top:14px; }}
.refs figure {{ margin:0; display:grid; gap:6px; font-size:13px; color:var(--mute); }}
.refs img {{ width:160px; border-radius:8px; border:1px solid var(--line); }}
.card {{ background:var(--card); border:1px solid var(--line); border-radius:12px; margin:16px 0; overflow:hidden; }}
.card.is-done {{ opacity:.5; }}
.card header {{ display:flex; align-items:center; gap:10px; padding:12px 18px; border-bottom:1px solid var(--line); flex-wrap:wrap; }}
.num {{ font:600 13px ui-monospace,monospace; background:var(--accent); color:#fff; border-radius:6px; padding:2px 7px; }}
.card h2 {{ font-size:17px; margin:0; flex:1; min-width:200px; }} .card h2 code {{ color:var(--mute); font-size:13px; font-weight:400; }}
.tag {{ font-size:12px; border-radius:20px; padding:2px 9px; }} .tag.req {{ background:#294f43; color:#fff; }} .tag.opt {{ background:#e3e0c8; color:#5b5f50; }}
.done {{ color:var(--mute); font-size:13px; white-space:nowrap; }}
.text {{ padding:14px 18px 18px; }} .out {{ margin:0 0 8px; }}
.prompt-head {{ display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; }}
.btn {{ display:inline-block; font:inherit; font-size:13px; padding:6px 10px; border-radius:6px; border:1px solid var(--accent); color:var(--accent); background:#fff; cursor:pointer; text-decoration:none; }}
.btn:hover {{ background:var(--accent); color:#fff; }}
pre {{ white-space:pre-wrap; background:#f5f3ea; border:1px solid var(--line); border-radius:8px; padding:12px; margin:0; font:12.5px/1.5 ui-monospace,monospace; }}
code {{ font-family:ui-monospace,monospace; }}
</style></head>
<body><main>
<h1>Cartograph — ana menü ve profil görselleri ({len(ASSETS)})</h1>
<p class="lead">{sum(a[5] for a in ASSETS)} gerekli, {sum(not a[5] for a in ASSETS)} isteğe bağlı görsel. Oyun eksik görselin yerine kendi çizimini gösterir; görseller tek tek gelebilir.</p>
<div class="howto">
  <b>Her kart için:</b>
  <ol>
    <li>Yeni bir görsel üretimi başlat ve <b>Image 1</b> olarak uygulama ikonunu ekle (aşağıdan indir). Avatarlarda ilk beğendiğin avatarı da <b>Image 2</b> olarak ekleyip "same style as Image 2" yaz; sekiz avatar aynı aileden görünmeli.</li>
    <li>Kartın prompt'unu aynen yapıştır, karttaki boyutu seç. Şeffaf istenenlerde arka planın gerçekten şeffaf olduğuna bak (düz tek renk gelirse de olur, script temizler).</li>
    <li>Kontrol et: yazı/harf yok, çerçeve dışı boş, nesne tuvali dolduruyor, küçükken (48 px) seçilebiliyor.</li>
    <li>İndirdiğin dosyayı karttaki adla kaydet ve hepsini <code>Cartograph/assets/menu/src/</code> klasörüne koy. Sonra <code>python3 tools/menu/menu_art.py build</code>.</li>
  </ol>
  <div class="refs">
    <figure><img src="{icon}" alt=""><span><b>Image 1</b> — uygulama ikonu (stil)</span><a class="btn" download="cartograph_app_icon.jpg" href="{icon}">İndir</a></figure>
    <figure><img src="{glass}" alt=""><span>Oyundaki vitray görünümü (yalnızca bakmak için)</span></figure>
  </div>
</div>
{''.join(cards)}
</main>
<script>
document.querySelectorAll('.copy').forEach(b => b.addEventListener('click', () => {{
  navigator.clipboard.writeText(b.closest('.text').querySelector('pre').textContent).then(() => {{ b.textContent = 'Kopyalandı'; setTimeout(() => b.textContent = "Prompt'u kopyala", 1200); }});
}}));
document.querySelectorAll('.card').forEach(c => {{
  const box = c.querySelector('.done input'), key = 'menuastra.done.' + c.dataset.id;
  try {{ box.checked = localStorage.getItem(key) === '1'; }} catch (e) {{}}
  c.classList.toggle('is-done', box.checked);
  box.addEventListener('change', () => {{ c.classList.toggle('is-done', box.checked); try {{ localStorage.setItem(key, box.checked ? '1' : '0'); }} catch (e) {{}} }});
}});
</script></body></html>'''
    (HERE / 'astra_menu.html').write_text(page)
    rows = '\n'.join(f'| {i} | `{a[0]}` | {a[1]} | {a[2]}{", şeffaf" if a[3] else ""} | {a[4]} px | {"**Şart**" if a[5] else "İsteğe bağlı"} |' for i, a in enumerate(ASSETS, 1))
    prompts = '\n\n'.join(f'### {i}. `{a[0]}` — {a[1]}\n\n```\n{prompt_of(a)}\n```' for i, a in enumerate(ASSETS, 1))
    (HERE / 'PROMPTS.md').write_text(f'''# Cartograph ana menü + profil görselleri

ChatGPT (Astra) için hazırlanan liste. Görsel sayfası: `tools/menu/astra_menu.html` (prompt kopyalama, referans indirme, "bitti" işareti).

**İş akışı**
1. Her görseli uygulama ikonunu (`assets/app-icon.png`) referans vererek üret. Avatarlarda ilk beğendiğini sonrakilere de referans ver.
2. Dosyayı aşağıdaki adla `assets/menu/src/` içine kaydet (png, jpg, webp olur).
3. `python3 tools/menu/menu_art.py build` → `assets/menu/<ad>.webp` ve `menu-art.js` yazılır. Oyun eksik olanların yerine kendi çizimini gösterir.

Butonlar, profil kartı, istatistik kutuları ve koleksiyon ızgarası CSS ile çiziliyor; koleksiyondaki küçük vitraylar oyunun kendi bölüm görselleri. Bunlar için görsel gerekmiyor.

| # | Dosya | Ne | Üretim | Oyunda | Durum |
|---|---|---|---|---|---|
{rows}

## Ortak stil (her prompt'un sonunda var)

```
{STYLE}
```

## Prompt'lar

{prompts}
''')
    print('tools/menu/astra_menu.html and PROMPTS.md written,', len(ASSETS), 'pictures')


def clear_flat_background(im):
    """A 'transparent' picture that came back with a flat background: make that colour clear."""
    import numpy as np
    from scipy import ndimage
    a = np.asarray(im.convert('RGBA')).astype(int)
    if (a[..., 3] < 250).mean() > 0.02:
        return im.convert('RGBA')  # already has real transparency
    corners = np.array([a[0, 0, :3], a[0, -1, :3], a[-1, 0, :3], a[-1, -1, :3]])
    bg = np.median(corners, axis=0)
    near = np.abs(a[..., :3] - bg).sum(axis=2) < 40
    lab, _ = ndimage.label(near)
    edge = set(lab[0]) | set(lab[-1]) | set(lab[:, 0]) | set(lab[:, -1])
    edge.discard(0)
    mask = np.isin(lab, list(edge))
    a[..., 3] = np.where(mask, 0, 255)
    from PIL import Image
    return Image.fromarray(a.astype('uint8'), 'RGBA')


def build():
    from PIL import Image
    OUT.mkdir(parents=True, exist_ok=True)
    found = {}
    for name, what, _, transparent, size, _, _ in ASSETS:
        src = next((p for p in (SRC / f'{name}.{e}' for e in ('png', 'jpg', 'jpeg', 'webp')) if p.exists()), None)
        if not src:
            continue
        im = Image.open(src)
        im = clear_flat_background(im) if transparent else im.convert('RGB')
        if name == 'menu-background':
            im = im.resize((size, round(size * im.height / im.width)), Image.Resampling.LANCZOS)
        else:
            s = min(im.size)
            im = im.crop(((im.width - s) // 2, (im.height - s) // 2, (im.width + s) // 2, (im.height + s) // 2))
            im = im.resize((size, size), Image.Resampling.LANCZOS)
        out = OUT / f'{name}.webp'
        im.save(out, 'WEBP', quality=88, method=6)
        found[name] = f'assets/menu/{name}.webp'
        print(f'{name}: {out.stat().st_size // 1024} KB')
    missing = [a[0] for a in ASSETS if a[0] not in found]
    (ROOT / 'menu-art.js').write_text(
        '// Written by tools/menu/menu_art.py build: menu pictures that exist (name → file).\n'
        f'window.CARTO_MENU_ART = {json.dumps(found, indent=2)};\n')
    print(f'menu-art.js: {len(found)} pictures' + (f'; still drawn by the game: {", ".join(missing)}' if missing else ''))


if __name__ == '__main__':
    {'astra': astra, 'build': build}[sys.argv[1] if len(sys.argv) > 1 else 'astra']()
