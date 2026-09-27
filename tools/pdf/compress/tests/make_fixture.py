"""Build tests/fixtures/sample.pdf: three pages of text, each with a 600 dpi image.

The image is stored losslessly, so both the web and CLI versions have something to shrink.
Run it again only if you change the fixture: python tools/pdf/compress/tests/make_fixture.py
"""
import os

import pymupdf

HERE = os.path.dirname(os.path.abspath(__file__))  # tools/pdf/compress/tests
FIXTURE = os.path.join(HERE, "fixtures", "sample.pdf")


def gradient(w=900, h=900):
    rows = []
    for y in range(h):
        g = y * 255 // h
        rows.append(bytes(v for x in range(w) for v in (x * 255 // w, g, 128)))
    return pymupdf.Pixmap(pymupdf.csRGB, w, h, b"".join(rows), False)


def build(path=FIXTURE):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    pix = gradient()
    doc = pymupdf.open()
    for n in range(1, 4):
        page = doc.new_page(width=595, height=842)  # A4 in points
        page.insert_text((72, 72), f"PDF Shrink test fixture - page {n}", fontsize=16)
        # 900 px across 108 pt (1.5 in) = 600 dpi
        page.insert_image(pymupdf.Rect(72, 100, 180, 208), pixmap=pix)
    doc.save(path, deflate=True)
    doc.close()
    return path


if __name__ == "__main__":
    print(build(), os.path.getsize(FIXTURE), "bytes")
