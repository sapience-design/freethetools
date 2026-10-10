# Makes sample.heic: a 64x32 red and blue test image. Needs: pip install pillow pillow-heif
from PIL import Image, ImageDraw
import pillow_heif

pillow_heif.register_heif_opener()
im = Image.new("RGB", (64, 32), (200, 40, 40))
ImageDraw.Draw(im).rectangle([32, 0, 63, 31], fill=(30, 60, 220))
im.save("sample.heic", quality=60)
