# OCR one detail image in tall tiles with tesseract (kor+eng). Prints text only.
# Tiles are temp files next to the input and are removed at once; the caller
# deletes the input image right after this returns.
import os, subprocess, sys
from PIL import Image
src = sys.argv[1]
im = Image.open(src).convert('L')
w, h = im.size
step, over, y, i, out = 1000, 200, 0, 0, []
while y < h and i < 30:
    tile = im.crop((0, y, w, min(h, y + step + over)))
    tile = tile.resize((tile.width * 2, tile.height * 2), Image.LANCZOS)
    p = f'{src}.t{i}.png'
    tile.save(p)
    try:
        r = subprocess.run(['tesseract', p, '-', '-l', 'kor+eng', '--psm', '3'], capture_output=True, text=True, timeout=300)
        out.append(f'--- tile {i} y={y}\n' + r.stdout)
    finally:
        os.remove(p)
    y += step; i += 1
print('\n'.join(out))
