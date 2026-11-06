"""Rename the v2 wordmark via a GPT reference edit, then mechanically prepare its PNG."""
from pathlib import Path
from PIL import Image,ImageOps
import os,subprocess,shutil,json,sys
R=Path(__file__).resolve().parents[1]
RAW=R/'clai-images/ui-v2-logo-hidden-letters.png'
REF=R/'docs/ui_src/v2/logo_hidden_word_reference.png'
PROMPT='Edit the supplied exact game logo. Change the two-line title from Hidden Word to Hidden Letters. Exact first line: Hidden. Exact second line: Letters. Preserve the original Hidden lettering unchanged in character shapes, proportions and style. Render Letters in precisely the same bold rounded organic hand-lettered storybook style as the old Word: forest-green watercolor/gouache paper texture, warm ivory paper outline and subtle ochre lower offset edge. Match the reference colors exactly, including its dark forest green. Keep the same two-line compact centered silhouette and the same overall width-to-height ratio, approximately 1.9 to 1. Fit the longer word Letters within the original lower-line width by using slightly narrower matching letters, without making the logo wider or adding a third line. Maintain similar visual weight and line spacing. Only the wording changes. No icons, no tiles, no leaves, no border, no extra words, no new decorations, no glossy effects. True transparent background everywhere outside the original-style paper outline, including natural gaps. The final asset will occupy the same 840 by 450 transparent box. Exact spelling: H i d d e n / L e t t e r s.'
def generate():
 if not REF.exists():shutil.copy2(R/'game/assets/ui_v2/logo.png',REF)
 if RAW.exists():print('Existing source:',RAW);return
 env=dict(os.environ,CLAI_IMAGE_SOURCE='codex',CLAI_IMAGE_SESSION=os.environ.get('CODEX_THREAD_ID',''))
 cmd=['/Users/semihcetin/.local/bin/clai','image','--model','gpt','--ratio','16:9','--transparent','--input-path',str(REF),'--output-path',str(RAW),PROMPT]
 r=subprocess.run(cmd,env=env,text=True,capture_output=True)
 logenv=dict(os.environ,CLAI_ACTION_SOURCE='codex',CLAI_ACTION_SESSION=os.environ.get('CODEX_THREAD_ID',''))
 subprocess.run(['/Users/semihcetin/.local/bin/clai','action-log','--what','Generated Hidden Letters replacement wordmark.','--ok' if r.returncode==0 else '--fail'],env=logenv)
 print(r.stdout,r.stderr,flush=True)
 if r.returncode:raise RuntimeError('Logo generation failed')
def install():
 src=Image.open(RAW).convert('RGBA');a=src.getchannel('A');bounds=a.point(lambda a:255 if a>=8 else 0).getbbox()
 assert bounds and a.getextrema()==(0,255)
 src.putalpha(a.point(lambda a:0 if a<=2 else a));master=src.crop(bounds)
 scaled=ImageOps.contain(master,(834,444),Image.Resampling.LANCZOS);out=Image.new('RGBA',(840,450));out.alpha_composite(scaled,((840-scaled.width)//2,(450-scaled.height)//2))
 assert out.getchannel('A').getextrema()==(0,255)
 assert all(out.getpixel(p)[3]==0 for p in [(0,0),(839,0),(0,449),(839,449)])
 for base in ['docs/ui_masters/v2','docs/ui_src/v2']:
  old=R/base/'logo.png';archive=R/base/'logo_hidden_word_original.png'
  if not archive.exists():shutil.copy2(old,archive)
 master.save(R/'docs/ui_masters/v2/logo.png');shutil.copy2(RAW,R/'docs/ui_src/v2/logo.png')
 out.save(R/'game/assets/ui_v2/logo.png',optimize=True)
 path=R/'docs/ui_v2_manifest.json';manifest=json.loads(path.read_text());manifest['logo'].update(source=str(RAW.relative_to(R)),source_size=src.size,alpha_crop=bounds,master_size=master.size,text='Hidden Letters',reference=str(REF.relative_to(R)));path.write_text(json.dumps(manifest,indent=2))
 p=R/'docs/ASTRA_PROMPTS.md';text=p.read_text();heading='\n### V2 logo rename — Hidden Letters (2026-11-06)\n'
 if heading not in text:p.write_text(text+heading+'\nReference: `docs/ui_src/v2/logo_hidden_word_reference.png` (previous production logo). GPT reference edit: `clai image --model gpt --ratio 16:9 --transparent --input-path <reference> --output-path clai-images/ui-v2-logo-hidden-letters.png`. Original source preserved; replacement production `game/assets/ui_v2/logo.png` remains 840×450 RGBA. Full cropped master: `docs/ui_masters/v2/logo.png`. Reproduce with `python3 docs/ui_v2_rename_logo.py generate` then `... install`.\n\n```text\n'+PROMPT+'\n```\n')
 p=R/'docs/ui_v2_prompts.json';prompts=json.loads(p.read_text());prompts=[i for i in prompts if i['name']!='logo_hidden_letters'];prompts.append(dict(name='logo_hidden_letters',stage='rename',ratio='16:9',transparent=True,prompt=PROMPT,ref=str(REF.relative_to(R)),output=str(RAW.relative_to(R))));p.write_text(json.dumps(prompts,indent=2))
 print('Installed 840x450 RGBA Hidden Letters logo; master:',master.size,'alpha:',out.getchannel('A').getextrema())
if __name__=='__main__':generate() if sys.argv[1]=='generate' else install()
