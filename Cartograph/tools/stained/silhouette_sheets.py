import json
from PIL import Image,ImageDraw,ImageFont
from silhouette_rollout import OUT
from pilot_preview import raster
rows=json.loads((OUT/'before/manifest.json').read_text());(OUT/'sheets').mkdir(exist_ok=True)
font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',18)
for base in range(0,len(rows),24):
 sheet=Image.new('RGB',(1680,1680),'#f4efe3');draw=ImageDraw.Draw(sheet)
 for j,row in enumerate(rows[base:base+24]):
  info=json.loads((OUT/'maps'/f'{row["id"]}.json').read_text());x=j%6*280;y=j//6*420
  sheet.paste(raster(info,(274,380)),(x+3,y+32));draw.text((x+8,y+8),f'{row["level"]}. {info["name"]}',font=font,fill='#273c32')
 sheet.save(OUT/'sheets'/f'geometry-{base//24+1:02}.jpg',quality=92)
print('12 sheets created')
