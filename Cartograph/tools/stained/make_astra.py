"""Build the hand-off page for generating the stained-glass artwork in ChatGPT (Astra).

python3 tools/stained/make_astra.py [ids…]
  → tools/stained/astra/vitray_astra.html  (one card per level: guide image, reference, prompt, file name)
Bring the downloaded images back with import_astra.py.
"""
import base64
import html
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from generate_art import PROMPT  # noqa: E402

HERE = Path(__file__).parent
ROOT = HERE.parents[1]
OUT = HERE / 'astra'


def order():
    src = (HERE / 'build_levels.js').read_text()
    return re.findall(r"'([a-z]+)'", src[src.index('const ORDER'):src.index('];', src.index('const ORDER'))])


def b64(path, mime):
    return f'data:{mime};base64,' + base64.b64encode(path.read_bytes()).decode()


def card(i, info):
    id = info['id']
    colors = ', '.join(f'{name} ({hex_})' for name, hex_ in info['palette'])
    prompt = PROMPT.format(scene=info['scene'], colors=colors)
    swatches = ''.join(f'<span class="sw"><i style="background:{h}"></i>{html.escape(n)} {h}</span>' for n, h in info['palette'])
    return f'''
<section class="card" id="{id}" data-id="{id}">
  <header>
    <span class="num">{i:02d}</span>
    <h2>{html.escape(info['name'])} <code>{id}</code></h2>
    <label class="done"><input type="checkbox"> done</label>
  </header>
  <div class="body">
    <figure>
      <img src="{b64(HERE / 'guides' / f'{id}.png', 'image/png')}" alt="Image 1 — pane guide for {id}">
      <a class="btn" download="{id}_guide.png" href="{b64(HERE / 'guides' / f'{id}.png', 'image/png')}">Download Image 1 (guide)</a>
    </figure>
    <div class="text">
      <p class="out">Save the result as <b><code>{id}.png</code></b></p>
      <p class="pal">{swatches}</p>
      <div class="prompt-head"><b>Prompt</b><button class="btn copy">Copy prompt</button></div>
      <pre>{html.escape(prompt)}</pre>
    </div>
  </div>
</section>'''


def main(ids):
    maps = {p.stem: json.loads(p.read_text()) for p in (HERE / 'maps').glob('*.json')}
    ids = ids or [id for id in order() if not maps[id].get('keepArt')]
    ref = b64(ROOT / 'vitray example' / 'vitray3.jpg', 'image/jpeg')
    cards = ''.join(card(i + 1, maps[id]) for i, id in enumerate(ids))
    names = ' '.join(f'<code>{id}.png</code>' for id in ids)
    page = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cartograph Stained Glass</title>
<style>
:root {{ --bg:#f4f1ea; --card:#fff; --ink:#1d1d1b; --mute:#6b675e; --line:#dcd6c8; --accent:#23506b; }}
* {{ box-sizing:border-box; }}
body {{ margin:0; background:var(--bg); color:var(--ink); font:15px/1.5 -apple-system,system-ui,sans-serif; }}
main {{ max-width:1100px; margin:0 auto; padding:24px 16px 80px; }}
h1 {{ margin:0 0 4px; font-size:26px; }}
.lead {{ color:var(--mute); margin:0 0 20px; }}
.howto {{ background:var(--card); border:1px solid var(--line); border-radius:12px; padding:18px 22px; margin-bottom:24px; }}
.howto ol {{ margin:8px 0 0; padding-left:22px; }} .howto li {{ margin:6px 0; }}
.ref {{ display:flex; gap:18px; align-items:flex-start; flex-wrap:wrap; margin-top:14px; }}
.ref img {{ width:180px; border-radius:8px; border:1px solid var(--line); }}
.card {{ background:var(--card); border:1px solid var(--line); border-radius:12px; margin:18px 0; overflow:hidden; }}
.card.is-done {{ opacity:.55; }}
.card header {{ display:flex; align-items:center; gap:12px; padding:12px 18px; border-bottom:1px solid var(--line); }}
.num {{ font:600 13px ui-monospace,monospace; background:var(--accent); color:#fff; border-radius:6px; padding:2px 7px; }}
.card h2 {{ font-size:18px; margin:0; flex:1; }} .card h2 code {{ color:var(--mute); font-size:14px; font-weight:400; }}
.done {{ color:var(--mute); font-size:13px; white-space:nowrap; }}
.body {{ display:grid; grid-template-columns:240px 1fr; gap:20px; padding:18px; }}
figure {{ margin:0; display:flex; flex-direction:column; gap:8px; }}
figure img {{ width:100%; border-radius:6px; border:1px solid var(--line); }}
.btn {{ display:inline-block; text-align:center; font:inherit; font-size:13px; padding:6px 10px; border-radius:6px; border:1px solid var(--accent); color:var(--accent); background:#fff; cursor:pointer; text-decoration:none; }}
.btn:hover {{ background:var(--accent); color:#fff; }}
.out {{ margin:0 0 6px; }} .pal {{ margin:0 0 10px; display:flex; flex-wrap:wrap; gap:6px 14px; font-size:13px; color:var(--mute); }}
.sw i {{ display:inline-block; width:12px; height:12px; border-radius:3px; margin-right:5px; vertical-align:-1px; border:1px solid rgba(0,0,0,.2); }}
.prompt-head {{ display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; }}
pre {{ white-space:pre-wrap; background:#f7f5ef; border:1px solid var(--line); border-radius:8px; padding:12px; margin:0; font:12.5px/1.5 ui-monospace,monospace; max-height:260px; overflow:auto; }}
code {{ font-family:ui-monospace,monospace; }}
@media (max-width:700px) {{ .body {{ grid-template-columns:1fr; }} figure img {{ max-width:260px; }} }}
</style></head>
<body><main>
<h1>Cartograph — stained-glass artwork ({len(ids)} images)</h1>
<p class="lead">Each card is one game level. The image must line up pane-for-pane with its guide, because the game lays the puzzle regions on top of it.</p>

<div class="howto">
  <b>For every card below, one at a time:</b>
  <ol>
    <li>Start a new image generation. Attach <b>two images in this order</b>: <b>Image 1</b> = the card's guide (button under it), <b>Image 2</b> = the material reference below (same for every card).</li>
    <li>Paste the card's prompt exactly (use <i>Copy prompt</i>). Ask for a <b>portrait 3:4</b> image (if only 2:3 portrait is offered, use that).</li>
    <li>Check the result against the guide before accepting it:
      every black line is still a lead seam in the same place; no pane added, split, merged or moved; every pane has the same colour as in the guide; the panel fills the frame like the guide (no frame, wall, border or perspective); no text.
      If any of these fail, regenerate (you may reply "keep every seam and pane colour exactly as Image 1").</li>
    <li>Download the accepted image and name it exactly as the card says (<code>id.png</code>). Tick <i>done</i>.</li>
    <li>When all are done, put every file in one folder or zip: {names}</li>
  </ol>
  <div class="ref">
    <img src="{ref}" alt="Image 2 — material reference">
    <div><b>Image 2 — material reference</b><br>Only for the look of real glass (texture, light, lead). Do not copy its picture or colours.<br><br>
    <a class="btn" download="material_reference.jpg" href="{ref}">Download Image 2 (reference)</a></div>
  </div>
</div>
{cards}
</main>
<script>
document.querySelectorAll('.copy').forEach(b => b.addEventListener('click', () => {{
  const text = b.closest('.text').querySelector('pre').textContent;
  navigator.clipboard.writeText(text).then(() => {{ b.textContent = 'Copied'; setTimeout(() => b.textContent = 'Copy prompt', 1200); }});
}}));
document.querySelectorAll('.card').forEach(c => {{
  const box = c.querySelector('.done input'), key = 'astra.done.' + c.dataset.id;
  try {{ box.checked = localStorage.getItem(key) === '1'; }} catch (e) {{}}
  c.classList.toggle('is-done', box.checked);
  box.addEventListener('change', () => {{
    c.classList.toggle('is-done', box.checked);
    try {{ localStorage.setItem(key, box.checked ? '1' : '0'); }} catch (e) {{}}
  }});
}});
</script>
</body></html>
'''
    OUT.mkdir(exist_ok=True)
    path = OUT / 'vitray_astra.html'
    path.write_text(page)
    print(f'{path.relative_to(ROOT)}: {len(ids)} levels, {len(page) // 1024} KB')


if __name__ == '__main__':
    main(sys.argv[1:])
