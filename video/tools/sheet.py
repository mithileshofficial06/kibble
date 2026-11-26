"""Contact sheet: python tools/sheet.py out.jpg a.jpg b.jpg ... (2 columns, half size)."""
import sys
from PIL import Image
out, files = sys.argv[1], sys.argv[2:]
ims = [Image.open(f).resize((960, 540)) for f in files]
rows = (len(ims) + 1) // 2
sheet = Image.new("RGB", (1920, 540 * rows), (0, 0, 0))
for i, im in enumerate(ims): sheet.paste(im, ((i % 2) * 960, (i // 2) * 540))
sheet.save(out, quality=85)
