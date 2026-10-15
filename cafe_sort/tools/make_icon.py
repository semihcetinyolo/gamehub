import sys
from PIL import Image, ImageFilter, ImageDraw
# Sip Sort app icon: the win-screen drink (cocktail_sort win_art.png) on a
# blurred cafe backdrop.  python3 tools/make_icon.py ../cocktail_sort/assets/img icon.png
img = sys.argv[1]; out = sys.argv[2]
S = 1024
bg = Image.open(img + '/bg_cafe.png').convert('RGB')
# square crop around the window, heavily blurred -> warm cafe backdrop
w, h = bg.size
bg = bg.crop((0, 120, w, 120 + w)).resize((S, S), Image.LANCZOS).filter(ImageFilter.GaussianBlur(18))
warm = Image.new('RGB', (S, S), (255, 196, 140))
bg = Image.blend(bg, warm, 0.28)
# soft light glow behind the drink
glow = Image.new('L', (S, S), 0)
ImageDraw.Draw(glow).ellipse((170, 150, 854, 874), fill=255)
glow = glow.filter(ImageFilter.GaussianBlur(110))
bg = Image.composite(Image.new('RGB', (S, S), (255, 244, 222)), bg, glow.point(lambda v: int(v * .85)))
art = Image.open(img + '/win_art.png').convert('RGBA')
art = art.crop((150, 0, 470, 400))          # bottle + straw + sparkles
k = 940 / art.height
art = art.resize((int(art.width * k), int(art.height * k)), Image.LANCZOS)
x, y = (S - art.width) // 2 + 10, (S - art.height) // 2 + 20
# drop shadow
sh = Image.new('RGBA', (S, S), (0, 0, 0, 0))
a = art.split()[3].point(lambda v: int(v * .45))
sh.paste((90, 45, 15, 255), (x + 14, y + 22), a)
sh = sh.filter(ImageFilter.GaussianBlur(16))
canvas = bg.convert('RGBA')
canvas.alpha_composite(sh)
canvas.alpha_composite(art, (x, y))
canvas.convert('RGB').save(out)
