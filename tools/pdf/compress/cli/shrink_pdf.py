"""Shrink a PDF locally with PyMuPDF. Optionally keep only the first page.

Usage:
    python shrink_pdf.py input.pdf                 # -> input_small.pdf
    python shrink_pdf.py input.pdf -o out.pdf
    python shrink_pdf.py input.pdf --first-page    # keep page 1 only
    python shrink_pdf.py input.pdf --dpi 100 --quality 60   # stronger
"""
import argparse
import os
import sys

import pymupdf


def default_output(path):
    return os.path.splitext(path)[0] + "_small.pdf"


def shrink(src, dst, first_page=False, dpi=150, quality=75, images=True):
    """Write a smaller copy of `src` to `dst`. Returns (bytes_before, bytes_after)."""
    doc = pymupdf.open(src)
    try:
        if first_page and doc.page_count > 1:
            doc.select([0])
        if images:
            doc.rewrite_images(dpi_threshold=dpi + 1, dpi_target=dpi, quality=quality)
        doc.scrub(metadata=False, xml_metadata=True, thumbnails=True)
        doc.subset_fonts()
        doc.save(dst, garbage=4, deflate=True, deflate_images=True, deflate_fonts=True,
                 clean=True, use_objstms=True)
    finally:
        doc.close()
    return os.path.getsize(src), os.path.getsize(dst)


def main(argv=None):
    ap = argparse.ArgumentParser(description="Reduce PDF size (local, no network).")
    ap.add_argument("input")
    ap.add_argument("-o", "--output", help="default: <input>_small.pdf")
    ap.add_argument("--first-page", action="store_true", help="keep only page 1")
    ap.add_argument("--dpi", type=int, default=150, help="downsample images above this DPI (default 150)")
    ap.add_argument("--quality", type=int, default=75, help="JPEG quality 1-100 (default 75)")
    ap.add_argument("--no-images", action="store_true", help="leave images untouched (lossless only)")
    a = ap.parse_args(argv)

    if not 1 <= a.quality <= 100:
        ap.error("--quality must be between 1 and 100")
    if a.dpi < 1:
        ap.error("--dpi must be positive")

    out = a.output or default_output(a.input)
    before, after = shrink(a.input, out, a.first_page, a.dpi, a.quality, not a.no_images)
    print(f"{a.input}: {before/1024:.0f} KB -> {out}: {after/1024:.0f} KB "
          f"({100 * (1 - after / before):.0f}% smaller)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
