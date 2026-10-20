"""Hand-off page for the 76 pattern levels (atlas, spiral, rings, brain) whose finished picture is
still the flat vector drawing, so their end-of-level reveal does not turn into glass.

python3 tools/stained/make_astra_patterns.py
  → tools/stained/astra/desen_astra.html  (open it from the game server: it links the guides)
One card per level in play order: guide image, material reference, prompt, file name.
Generated images go to tools/stained/raw/desen/<id>.png.
"""
import colorsys
import html
import json
import re
import subprocess
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE.parents[1]
OUT = HERE / 'astra'
FAMILIES = ('atlas', 'spiral', 'rings', 'brain')

PROMPT = """Generate a NEW, exquisite PHOTOGRAPHIC ARTWORK of a real artisan-made stained-glass panel: {scene}.
Image 1 is the exact pane layout and colour plan. Image 2 is only a real-world material reference. The output must NOT look like image 1's flat vector drawing: turn every flat area into stunning, convincingly real, richly textured handmade translucent glass — organic ripples, hammered dimples, tiny trapped bubbles, light refracting inside the coloured glass, glowing sunlight transmitted from behind, delicate dark aged metal solder seams. A high-end Tiffany-style art object, photographed perfectly straight-on. Deep and jewel-like, not a cartoon, not paint, not paper.
CRITICAL STRUCTURE: every flat-coloured area of image 1 is exactly ONE glass pane and every dark line is a lead seam. Keep all seams exactly where they are — same positions, same curves, same silhouette and proportions — so the artwork aligns with image 1 when superimposed. Do not add, remove, subdivide, merge or move any pane or seam. Do not paint extra details (no faces, veins, stripes, text, symbols) onto the glass. The flat cream area outside the panel's silhouette is not glass: render it as plain dark neutral grey.
FOUR COLOURS ONLY, PANE BY PANE: the glass uses exactly these four colours: {colors}. Every pane keeps the colour image 1 gives it. Make them rich, luminous, translucent versions of those same hues, with natural light and texture variation inside each hue, but no fifth glass colour. Neutral lead seams and specular highlights do not count as colours.
COMPOSITION: {aspect}, frontal/orthographic, the panel filling the frame exactly as in image 1. No frame, no wall, no room, no hanging chain, no perspective, no mockup, no vignette, no border. NO TEXT, NO LETTERING, NO LOGOS. Deliver only the finished raster artwork."""

SCENES = {
    'atlas': 'an abstract map of an imaginary land, its coastline silhouette divided into provinces by lead seams',
    'spiral': 'an abstract geometric design of angular spiral ribbons and stepped corridors',
    'rings': 'an abstract geometric design of overlapping circular bands split into segments',
    'brain': 'a stylised human brain with its brainstem, made of broad flat glass regions',
}


def color_name(hex_):
    r, g, b = (int(hex_[i:i + 2], 16) / 255 for i in (1, 3, 5))
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    if s < .18:
        base = 'white' if l > .85 else 'light grey' if l > .6 else 'grey' if l > .3 else 'charcoal'
        return base
    hue = h * 360
    names = [(15, 'red'), (40, 'orange'), (65, 'yellow'), (90, 'yellow-green'), (160, 'green'), (190, 'teal'),
             (250, 'blue'), (290, 'purple'), (335, 'pink'), (360, 'red')]
    base = next(n for limit, n in names if hue < limit)
    if base == 'orange' and l < .35:
        base = 'brown'
    tone = 'pale ' if l > .75 else 'light ' if l > .6 else 'deep ' if l < .3 else ''
    return tone + base


def aspect_text(w, h):
    r = w / h
    if abs(r - 1) < .04:
        return 'exactly square (1:1)'
    shape = 'landscape' if r > 1 else 'portrait'
    return f'{shape}, the same aspect ratio as image 1 ({w}x{h}, about {max(r, 1 / r):.2f}:1)'


def levels():
    """(play number, id, name) of every pattern level, read from the game's own level file."""
    js = ("global.window={};require(process.argv[1]);"
          "console.log(JSON.stringify(window.CARTO_STAINED.map((L,i)=>[i+1,L.id,L.name,L.map.cols,L.map.rows])))")
    rows = json.loads(subprocess.run(['node', '-e', js, str(ROOT / 'stained-levels.js')],
                                     capture_output=True, text=True, check=True).stdout)
    return [r for r in rows if re.match(r'(atlas|spiral|rings|brain)', r[1])]


def card(n, id, name):
    info = json.loads((HERE / 'maps' / f'{id}.json').read_text())
    art = json.loads((ROOT / (info.get('artMetadata') or f'assets/glass/{id}.json')).read_text())
    family = info.get('family') or id.split('_')[0]
    from PIL import Image
    with Image.open(HERE / 'guides' / f'{id}.png') as g:
        w, h = g.size
    palette = art['palette']
    colors = ', '.join(f'{color_name(c)} ({c})' for c in palette)
    prompt = PROMPT.format(scene=SCENES[family], colors=colors, aspect=aspect_text(w, h))
    sw = ''.join(f'<span class="sw"><i style="background:{c}"></i>{c}</span>' for c in palette)
    guide = f'../guides/{id}.png'
    return f'''
<section class="card" id="{id}" data-id="{id}" data-family="{family}">
  <header><span class="num">{n}</span><h2>{html.escape(name)} <code>{id}</code></h2>
    <label class="done"><input type="checkbox"> bitti</label></header>
  <div class="body">
    <figure><img loading="lazy" src="{guide}" alt="Image 1, {id} kılavuzu">
      <a class="btn" download="{id}_guide.png" href="{guide}">Image 1'i indir (kılavuz)</a></figure>
    <div class="text">
      <p class="out">Sonucu <b><code>{id}.png</code></b> adıyla kaydet</p>
      <p class="pal">{sw}<span class="asp">{w}×{h}</span></p>
      <div class="prompt-head"><b>Prompt</b><button class="btn copy" type="button">Prompt'u kopyala</button></div>
      <pre>{html.escape(prompt)}</pre>
    </div>
  </div>
</section>'''


def main():
    rows = levels()
    cards = ''.join(card(n, id, name) for n, id, name, *_ in rows)
    listing = ''.join(f'<tr data-id="{id}"><td>{n}</td><td>{html.escape(name)}</td><td><code>{id}.png</code></td>'
                      f'<td class="st">–</td></tr>' for n, id, name, *_ in rows)
    ref = '../../../vitray%20example/vitray3.jpg'
    page = f'''<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Desen Vitrayları</title>
<style>
:root {{ --bg:#f4f1ea; --card:#fff; --ink:#1d1d1b; --mute:#6b675e; --line:#dcd6c8; --accent:#23506b; --ok:#2f7a4b; }}
@media (prefers-color-scheme:dark) {{ :root:not([data-theme="light"]) {{ --bg:#1b1d1c; --card:#252827; --ink:#ecebe6; --mute:#a5a29a; --line:#3a3d3b; --accent:#8cc0dc; --ok:#7fca98; }} }}
:root[data-theme="dark"] {{ --bg:#1b1d1c; --card:#252827; --ink:#ecebe6; --mute:#a5a29a; --line:#3a3d3b; --accent:#8cc0dc; --ok:#7fca98; }}
* {{ box-sizing:border-box; }}
body {{ margin:0; background:var(--bg); color:var(--ink); font:15px/1.5 -apple-system,system-ui,sans-serif; }}
main {{ max-width:1100px; margin:0 auto; padding:24px 16px 80px; }}
h1 {{ margin:0 0 4px; font-size:26px; }} .lead {{ color:var(--mute); margin:0 0 18px; }}
.box {{ background:var(--card); border:1px solid var(--line); border-radius:12px; padding:16px 20px; margin-bottom:20px; }}
.box ol {{ margin:8px 0 0; padding-left:22px; }} .box li {{ margin:5px 0; }}
.ref {{ display:flex; gap:16px; align-items:flex-start; flex-wrap:wrap; margin-top:12px; }}
.ref img {{ width:160px; border-radius:8px; border:1px solid var(--line); }}
.count {{ font-weight:700; }}
details summary {{ cursor:pointer; font-weight:700; }}
.wrap {{ overflow-x:auto; }} table {{ border-collapse:collapse; width:100%; font-size:14px; margin-top:10px; }}
td, th {{ border-bottom:1px solid var(--line); padding:5px 8px; text-align:left; }} tr.ok .st {{ color:var(--ok); font-weight:700; }}
.filters {{ display:flex; gap:8px; flex-wrap:wrap; margin:0 0 6px; }}
.filters button {{ font:inherit; font-size:13px; padding:5px 10px; border-radius:7px; border:1px solid var(--line); background:var(--card); color:var(--ink); cursor:pointer; }}
.filters button[aria-pressed=true] {{ background:var(--accent); color:var(--card); border-color:var(--accent); }}
.card {{ background:var(--card); border:1px solid var(--line); border-radius:12px; margin:16px 0; overflow:hidden; }}
.card.is-done {{ opacity:.5; }}
.card header {{ display:flex; align-items:center; gap:12px; padding:10px 16px; border-bottom:1px solid var(--line); }}
.num {{ font:700 13px ui-monospace,monospace; background:var(--accent); color:var(--card); border-radius:6px; padding:2px 8px; }}
.card h2 {{ font-size:17px; margin:0; flex:1; min-width:0; }} .card h2 code {{ color:var(--mute); font-size:13px; font-weight:400; }}
.done {{ color:var(--mute); font-size:13px; white-space:nowrap; }}
.body {{ display:grid; grid-template-columns:240px minmax(0,1fr); gap:18px; padding:16px; }}
figure {{ margin:0; display:flex; flex-direction:column; gap:8px; }}
figure img {{ width:100%; border-radius:6px; border:1px solid var(--line); }}
.btn {{ display:inline-block; text-align:center; font:inherit; font-size:13px; padding:6px 10px; border-radius:6px; border:1px solid var(--accent); color:var(--accent); background:transparent; cursor:pointer; text-decoration:none; }}
.btn:hover {{ background:var(--accent); color:var(--card); }}
.out {{ margin:0 0 6px; }} .pal {{ margin:0 0 10px; display:flex; flex-wrap:wrap; gap:6px 14px; font-size:13px; color:var(--mute); }}
.sw i {{ display:inline-block; width:12px; height:12px; border-radius:3px; margin-right:5px; vertical-align:-1px; border:1px solid rgba(0,0,0,.2); }}
.prompt-head {{ display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; }}
pre {{ white-space:pre-wrap; background:var(--bg); border:1px solid var(--line); border-radius:8px; padding:12px; margin:0; font:12.5px/1.5 ui-monospace,monospace; max-height:240px; overflow:auto; }}
@media (max-width:700px) {{ .body {{ grid-template-columns:1fr; }} figure img {{ max-width:260px; }} }}
</style></head>
<body><main>
<h1>Desen bölümleri için vitray görselleri ({len(rows)})</h1>
<p class="lead">Bu bölümlerin bitiş görseli şu an düz renkli çizim, o yüzden bölüm sonunda vitraya dönüşmüyor. Her kart bir bölüm; görsel kılavuzla bölge bölge örtüşmeli, çünkü oyun bölgeleri görselin üstüne yerleştiriyor.</p>
<div class="box">
  <b>Her kart için:</b>
  <ol>
    <li>Yeni bir görsel üretimi başlat. <b>İki görseli bu sırayla</b> ekle: <b>Image 1</b> = kartın kılavuzu (altındaki düğme), <b>Image 2</b> = aşağıdaki malzeme referansı (hepsinde aynı).</li>
    <li>Kartın prompt'unu olduğu gibi yapıştır. Kare kılavuzlarda kare, diğerlerinde kılavuzun yönünde (yatay/dikey) görsel iste.</li>
    <li>Kabul etmeden önce kılavuzla karşılaştır: her koyu çizgi aynı yerde bir kurşun hat; hiçbir bölge eklenmemiş, bölünmemiş, birleşmemiş; her bölge kılavuzdaki rengiyle aynı; çerçeve, duvar, yazı yok. Biri tutmuyorsa yeniden üret ("keep every seam and pane colour exactly as Image 1" diyebilirsin).</li>
    <li>Görseli kartta yazan adla (<code>id.png</code>) <code>Cartograph/tools/stained/raw/desen/</code> klasörüne kaydet, <i>bitti</i>'yi işaretle.</li>
  </ol>
  <div class="ref"><img src="{ref}" alt="Image 2, malzeme referansı">
    <div><b>Image 2, malzeme referansı</b><br>Sadece gerçek cam görünümü için (doku, ışık, kurşun). Resmini ve renklerini kopyalamamalı.<br><br>
    <a class="btn" download="material_reference.jpg" href="{ref}">Image 2'yi indir</a></div></div>
</div>
<div class="box"><details><summary>Liste: <span class="count" id="count"></span></summary>
  <div class="wrap"><table><thead><tr><th>Seviye</th><th>Ad</th><th>Dosya</th><th>Durum</th></tr></thead><tbody>{listing}</tbody></table></div>
</details></div>
<div class="filters" id="filters"><button data-f="all" aria-pressed="true">Hepsi</button><button data-f="todo">Kalanlar</button>
  <button data-f="atlas">Harita</button><button data-f="spiral">Spiral</button><button data-f="rings">Halka</button><button data-f="brain">Beyin</button></div>
{cards}
</main>
<script>
const key = id => 'desen.done.' + id;
const read = id => {{ try {{ return localStorage.getItem(key(id)) === '1'; }} catch (e) {{ return false; }} }};
let filter = 'all';
function update() {{
  const cards = [...document.querySelectorAll('.card')];
  let done = 0;
  for (const c of cards) {{
    const ok = read(c.dataset.id); done += ok;
    c.classList.toggle('is-done', ok); c.querySelector('.done input').checked = ok;
    c.hidden = !(filter === 'all' || (filter === 'todo' && !ok) || c.dataset.family === filter);
    const row = document.querySelector(`tr[data-id="${{c.dataset.id}}"]`);
    row.classList.toggle('ok', ok); row.querySelector('.st').textContent = ok ? 'bitti' : '–';
  }}
  document.getElementById('count').textContent = `${{done}}/${{cards.length}} bitti`;
}}
document.querySelectorAll('.copy').forEach(b => b.addEventListener('click', () => {{
  navigator.clipboard.writeText(b.closest('.text').querySelector('pre').textContent)
    .then(() => {{ b.textContent = 'Kopyalandı'; setTimeout(() => b.textContent = "Prompt'u kopyala", 1200); }}, () => {{ b.textContent = 'Kopyalanamadı'; }});
}}));
document.querySelectorAll('.card .done input').forEach(box => box.addEventListener('change', () => {{
  try {{ localStorage.setItem(key(box.closest('.card').dataset.id), box.checked ? '1' : '0'); }} catch (e) {{}}
  update();
}}));
document.getElementById('filters').addEventListener('click', e => {{
  const b = e.target.closest('button'); if (!b) return;
  filter = b.dataset.f;
  document.querySelectorAll('#filters button').forEach(x => x.setAttribute('aria-pressed', x === b));
  update();
}});
update();
</script>
</body></html>
'''
    OUT.mkdir(exist_ok=True)
    (HERE / 'raw' / 'desen').mkdir(parents=True, exist_ok=True)
    path = OUT / 'desen_astra.html'
    path.write_text(page)
    print(f'{path.relative_to(ROOT)}: {len(rows)} levels, {len(page) // 1024} KB')


if __name__ == '__main__':
    main()
