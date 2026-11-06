"""Generate v2 art via the explicitly requested Clai GPT route; never overwrite sources."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import subprocess, os, json, sys
ROOT=Path(__file__).resolve().parents[1]
STYLE='One production mobile game UI asset. Warm illustrated storybook gouache and watercolor on subtly grained paper, hand-painted but clean smooth contours, front-facing flat 2D, exceptionally readable at phone size. Forest ink #304B3B, cream #FFF8E8, sage #A9BC93, ochre #E9B85F, fine warm brown outlines #957D5B. Very shallow lower edge, NO glossy plastic, NO metallic gold, NO strong 3D bevel. Isolated on genuinely transparent background. No watermark. '
ITEMS=[
dict(name='concept_storybook',stage='mockups',ratio='9:16',transparent=False,prompt='Create a portrait mobile game main-menu background illustration, NO text, NO buttons, NO logo, NO UI. Warm gentle watercolor and colored pencil on cream cotton paper #FFF8E8, a cozy storybook atmosphere matching the supplied attic reference in palette and paper texture. This is a decorative quiet background, not a level screenshot. Center 75 percent of image is almost blank ivory paper with subtle warm washes, generous empty space. Small handpainted illustrated clusters ONLY along the far corners: upper left a delicate sage leafy branch, bottom left two closed storybooks and a tiny ochre flower, bottom right a small terracotta pot with sage leaves. Keep decorations within outer 15 percent and lowest 17 percent. Faint warm ochre paper shading, restrained charming craft. No framed inset, no large scene, no characters. Almost blank upper right for a settings control. Match reference material and palette only; do not reproduce room or furniture.',ref='game/assets/upon_storybook_attic/thumb.jpg'),
dict(name='concept_garden',stage='mockups',ratio='9:16',transparent=False,prompt='Create a portrait mobile casual game menu BACKGROUND only, NO text, NO buttons, NO logo, NO UI. Use supplied cozy cartoon garden as style and color reference only. Friendly flat hand-inked gouache cartoon, sage green leaves, warm peach accents, cream center. Large empty light buttercream central 75 percent, a few illustrated tree leaves hanging in top corners and small flowers, terracotta pots and a tiny coral picket fence hugging only the bottom 16 percent. Fine warm dark green outlines, cheerful but restrained, a softly painted pale sage edge vignette. No full garden scene, no door, no characters, no level thumbnail. Upper right nearly blank for settings. All central controls will be added separately.',ref='game/assets/home_cartoon_garden/thumb.jpg'),
]
def add(n,r,p):ITEMS.append(dict(name=n,stage='final',ratio=r,transparent=True,prompt=STYLE+p))
add('logo','16:9','Exact text on two centered lines: Hidden Word. Bold rounded custom hand-lettered forest-green wordmark, subtle ivory paper outline, small ochre baseline shadow. Letter shapes friendly and slightly organic, consistent weight; only lettering. No letter tiles, no leaf decorations, no frame, no symbols, no tagline. Tight composition, exact spelling.')
add('btn_play','16:9','One single wide horizontal green rounded rectangle button plate, width to height 4.1 to 1. Solid rich leaf green #39814B with restrained top wash #4A9258 and dark forest lower edge #286138, cream hairline around edge. Clearly GREEN. Flat broad quiet center, completely blank for runtime white PLAY label. NO text, NO triangle, NO decorations. Straight long edges and rounded corners, 9-slice friendly. Narrow transparent margins.')
add('btn_secondary','16:9','One single horizontal warm cream rounded rectangle button plate, width to height 4.1 to 1, fine warm brown drawn outline, thin sage lower edge. Flat opaque cream center completely blank. NO text, NO icons, NO decorations. Straight long edges and rounded corners, 9-slice friendly, narrow transparent margins.')
add('level_badge','16:9','One single small horizontal cream label plaque with soft rounded corners, width to height 2.8 to 1. Fine double contour in sage and warm brown, shallow ochre lower edge. Blank solid cream interior for runtime Level 9 text. NO text, NO icons, NO holes, NO hanging strings. Calm paper label, not a button, straight long edges, 9-slice friendly.')
add('counter_pill','16:9','One single horizontal forest-green #304B3B counter capsule, width to height 2.7 to 1. Fine sage outside edge and almost invisible paper grain, completely blank solid dark center for white digits. No text, no icons, no decorations. Symmetric straight long edges, soft rounded corners. Narrow transparent margins.')
add('panel','3:4','One upright warm cream #FFF8E8 paper popup panel, width to height 3 to 4, softly rounded corners, fine warm brown contour and thin muted sage outer rim. Very subtle ochre lower shadow. Entire interior UNIFORM flat cream with barely perceptible grain. NO text, NO illustrations, NO buttons, NO ornaments. Straight sides; 9-slice friendly. Transparent exterior, narrow margins.')
add('slot_empty','1:1','One blank rounded square warm cream letter tile, quiet thin warm brown outline, shallow ochre lower edge, center flat opaque cream for a dark letter. No text, no marks, no dots. Almost square with consistent rounded corners and narrow transparent margins.')
add('slot_filled','1:1','One blank rounded square pale sage #D6E4C6 found-letter tile, quiet thin forest-green outline, shallow sage lower edge, center flat pale sage for a dark letter. No text, no checkmark, no marks, no dots. Almost square with consistent rounded corners and narrow transparent margins.')
for n,s in [('btn_settings','simple forest-green cogwheel with six softly rounded teeth and a clear circular hole'),('btn_home','simple forest-green house silhouette with clear cream door'),('btn_close','simple thick forest-green X made of two rounded crossing strokes'),('btn_back','simple thick forest-green left-facing chevron')]:
 add(n,'1:1','One circular cream utility button with thin warm brown edge and subtle sage lower rim. Centered '+s+'. Large clear flat symbol occupying half the circle. No text, no other objects, no ornament, narrow transparent margins.')
add('btn_hint','1:1','One circular cream hint button with thin ochre edge and sage lower rim. Centered large ochre lightbulb silhouette, forest-green base, exactly three short simple ochre rays. Friendly illustrated clean shape, recognisable at 48 pixels. No text, no counters, no ad tag, no ornament. Narrow transparent margins.')
add('ribbon_perfect','16:9','One wide soft ochre paper ribbon with small folded ends, width to height 3.6 to 1. Fine warm brown contour, shallow fold shading. Entire center COMPLETELY BLANK for runtime title Perfect. No text, no stars, no confetti, no ornament. Narrow transparent margins.')
add('heart','1:1','One small simple plump terracotta coral #CB7560 heart, gentle watercolor wash and fine warm brown outline. No enclosing circle, no extra objects, no text. Symmetric clearly readable shape, narrow transparent margins.')
add('heart_empty','1:1','One small simple empty heart outline in muted warm brown, pale cream interior, thin sage lower edge, gentle watercolor paper. No enclosing circle, no extra objects, no text. Symmetric clearly readable shape, narrow transparent margins.')

def record():
 p=ROOT/'docs/ui_v2_prompts.json';extra=[i for i in json.loads(p.read_text()) if i.get('stage')=='rename'] if p.exists() else []
 p.write_text(json.dumps(ITEMS+extra,indent=2))
 p=ROOT/'docs/ASTRA_PROMPTS.md'; s=p.read_text(); marker='\n## V2 — warm storybook UI (2026-11-06)\n'
 if marker not in s:
  s+=marker+'\nGenerated with `clai image --model gpt`. Full sources in `clai-images/ui-v2-*.png`; exact commands reproducible with `docs/ui_v2_generate.py`. Mockups are deterministic compositions at 1170×2532. Concept illustrations use the named level thumbnails only as style references. Production labels are runtime text except the logo.\n'
  for i in ITEMS:s+=f"\n### `{i['name']}` — {i['ratio']}, transparent: {i['transparent']}\n\nReference: {i.get('ref','none')}\n\n```text\n{i['prompt']}\n```\n"
  p.write_text(s)
def one(i):
 dst=ROOT/'clai-images'/('ui-v2-'+i['name']+'.png')
 if dst.exists(): print('SKIP',i['name'],flush=True);return
 cmd=['/Users/semihcetin/.local/bin/clai','image','--model','gpt','--ratio',i['ratio'],'--output-path',str(dst)]
 if i['transparent']:cmd+=['--transparent']
 if i.get('ref'):cmd+=['--input-path',str(ROOT/i['ref'])]
 cmd+=[i['prompt']]
 env=dict(os.environ,CLAI_IMAGE_SOURCE='codex',CLAI_IMAGE_SESSION=os.environ.get('CODEX_THREAD_ID',''))
 print('START',i['name'],flush=True)
 r=subprocess.run(cmd,env=env,text=True,capture_output=True)
 logenv=dict(os.environ,CLAI_ACTION_SOURCE='codex',CLAI_ACTION_SESSION=os.environ.get('CODEX_THREAD_ID',''))
 subprocess.run(['/Users/semihcetin/.local/bin/clai','action-log','--what','Generated Hidden Word v2 art: '+i['name']+'.','--ok' if r.returncode==0 else '--fail'],env=logenv)
 print('DONE',i['name'],r.returncode,r.stdout,r.stderr,flush=True)
 if r.returncode:raise RuntimeError(i['name'])
if __name__=='__main__':
 record();stage=sys.argv[1] if len(sys.argv)>1 else 'mockups'
 with ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(one,[i for i in ITEMS if i['stage']==stage]))
