"""Reproducible Clai GPT asset generation. Existing files are never overwritten."""
import os, json, subprocess
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'game/assets/ui'
STYLE='Create exactly one production ready casual mobile game UI asset on a truly transparent background. Style: restrained soft matte ceramic, front facing orthographic, rounded forms, subtle upper left highlight and shallow shadow; no busy ornament, no perspective, no texture noise, no watermark. Palette: ink indigo #3E4870, warm ivory #FAF6EA, soft mint #B7E1D2, muted gold #EEBF62, coral #E27D70. The game scene changes styles, so UI must remain calm and neutral. '
ITEMS=[
('icon','1:1','An app icon: a deep indigo rounded square with two overlapping ivory rounded letter tiles, one showing H and the other W, a tiny mint glint between them. App icon centered, generous simplified silhouette readable at 48 pixels; outer corners fully transparent. No text except H and W.'),
('slot_empty','1:1','A single empty rounded square ivory letter slot tile. Thin muted slate border, very shallow inset center, ample empty center. No glyph, letter, underline, dots, or text. Tile occupies 90 percent of canvas and is completely symmetrical, ready for 9-slice.'),
('slot_filled','1:1','A single rounded square pale mint letter slot tile in its found state. Thin muted teal border, soft ivory upper rim, very shallow raised center. Entire center left blank for game-rendered dark text. No glyph, letter, checkmark, dots, or text. Tile occupies 90 percent of canvas, symmetric, ready for 9-slice.'),
('counter_pill','16:9','A single horizontal indigo counter pill plate, width to height 3 to 1. Smooth rounded capsule, restrained ivory hairline upper edge, gentle shallow shadow. Entire center solid indigo and blank, no digits, text, icons, pattern or border ornament. Centered with narrow transparent margin. Designed for stretchable numeric counter.'),
('btn_hint','1:1','One large round ivory button with a centered simple gold lightbulb symbol, indigo bulb base and two short muted gold rays. Circular mint edge and subtle shadow. Strong recognizable silhouette, no text, no ad badge, no numbers, no separate decorative elements. Button fills 90 percent of the canvas.'),
('btn_settings','1:1','One circular ivory button with a centered clean indigo cogwheel symbol, 8 soft teeth and open circular center. Thin pale mint edge and gentle shadow. Quiet utility action. No text, no separate decorative elements. Button fills 90 percent of the canvas.'),
('btn_home','1:1','One circular ivory button with a centered clean indigo house symbol: simple roof, square walls, open ivory door. Thin pale mint edge and gentle shadow. Quiet utility action. No text, no separate decorative elements. Button fills 90 percent of the canvas.'),
('heart','1:1','One friendly plump coral heart icon with smooth symmetric silhouette, small upper left soft highlight and very subtle dark coral lower rim. No enclosing button, no text, no extra decorations. Heart fills 80 percent of the canvas, completely transparent around it.'),
('heart_empty','1:1','One empty heart icon matching a casual game health display. Symmetric rounded heart outline in muted slate gray with a pale gray translucent interior and very subtle lower rim. Flat neutral unfilled state, no coral, no enclosing button, no text, no extra decorations. Heart fills 80 percent of the canvas, completely transparent around it.'),
('ribbon_perfect','16:9','One wide soft gold celebratory ribbon with small folded ends, restrained ivory rim and subtle shadow. Exact centered text: Perfect. Use bold rounded indigo lettering exceptionally easy to read. Ribbon width to height 3 to 1 and fills width; small ends, no stars or confetti, no scene, no extra text.'),
('btn_primary','16:9','One large horizontal soft indigo rounded rectangle primary button plate, width to height 4 to 1, corner radius one third of button height. Subtle lighter indigo top edge and soft shallow shadow. Entire center solid calm indigo, EMPTY for runtime PLAY or Next Level label. No text, no letters, no symbols, no ornament. Straight long horizontal edges; 9-slice friendly. Centered with narrow transparent margins.'),
('panel','3:4','One large upright ivory popup panel, rounded rectangle width to height 3 to 4, soft mint hairline rim, very subtle shadow. Completely plain empty solid ivory interior, uniform simple straight edges and consistent corner radius. No text, no heading, no buttons, no symbols, no patterns. Designed as 9-slice modal panel; outside rounded corners transparent, panel fills 92 percent of canvas.'),
('card_frame','3:4','One portrait level thumbnail frame, width to height 3 to 4. Thin rounded warm ivory rim with subtle muted mint outer edge and gentle shadow. THE ENTIRE LARGE CENTRAL WINDOW MUST BE TRULY TRANSPARENT, a hollow frame for placing a scene thumbnail behind. No image inside, no fill in the opening, no lettering, no checkmark, no badges, no feet. Narrow rim uses only 5 percent of width. Entire outside transparent too.'),
]
LOGO='Create one premium mobile casual game wordmark on a truly transparent background. Exact text on two centered lines: Hidden Word. Soft rounded bold lettering, restrained matte ceramic style, deep indigo #3E4870 letters with a warm ivory #FAF6EA edge and a very subtle shadow. Add a single small mint #B7E1D2 square letter tile tucked beside the W as a quiet brand detail. Wordmark only, fills 85 percent of canvas width, no enclosing rectangle, no tagline, no stars, no magnifier, no scene, no extra text, no watermark. Orthographic 2D game UI asset, friendly and exceptionally legible on phones.'
MANIFEST=[{'name':'logo','ratio':'16:9','prompt':LOGO}]+[{'name':n,'ratio':r,'prompt':STYLE+p} for n,r,p in ITEMS]
(ROOT/'docs/ui_prompts.json').write_text(json.dumps(MANIFEST,indent=2))
def one(item):
    dst=OUT/(item['name']+'.png')
    if dst.exists(): return print('SKIP',item['name'],flush=True)
    env=dict(os.environ,CLAI_IMAGE_SOURCE='codex',CLAI_IMAGE_SESSION=os.environ.get('CODEX_THREAD_ID',''))
    cmd=['/Users/semihcetin/.local/bin/clai','image','--model','gpt','--ratio',item['ratio'],'--transparent','--output-path',str(dst),item['prompt']]
    result=subprocess.run(cmd,env=env,text=True,capture_output=True)
    print(item['name'],result.returncode,result.stdout,result.stderr,flush=True)
    env=dict(os.environ,CLAI_ACTION_SOURCE='codex',CLAI_ACTION_SESSION=os.environ.get('CODEX_THREAD_ID',''))
    subprocess.run(['/Users/semihcetin/.local/bin/clai','action-log','--what','Generated a Hidden Word UI image: '+item['name']+'.','--ok' if result.returncode==0 else '--fail'],env=env)
if __name__=='__main__':
    with ThreadPoolExecutor(max_workers=3) as pool: list(pool.map(one,MANIFEST[1:]))
