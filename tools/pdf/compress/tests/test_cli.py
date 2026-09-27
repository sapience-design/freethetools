import os
import subprocess
import sys

import pymupdf
import pytest

TOOL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.join(TOOL, "cli")
sys.path.insert(0, ROOT)

import shrink_pdf  # noqa: E402

FIXTURE = os.path.join(TOOL, "tests", "fixtures", "sample.pdf")


def pages(path):
    with pymupdf.open(path) as doc:
        return doc.page_count


@pytest.fixture
def out(tmp_path):
    return str(tmp_path / "out.pdf")


def test_fixture_has_three_pages():
    assert pages(FIXTURE) == 3


def test_output_is_smaller(out):
    before, after = shrink_pdf.shrink(FIXTURE, out)
    assert after < before * 0.5


def test_keeps_all_pages_by_default(out):
    shrink_pdf.shrink(FIXTURE, out)
    assert pages(out) == 3


def test_first_page_only(out):
    shrink_pdf.shrink(FIXTURE, out, first_page=True)
    assert pages(out) == 1


def test_text_survives(out):
    shrink_pdf.shrink(FIXTURE, out)
    with pymupdf.open(out) as doc:
        assert "page 2" in doc[1].get_text()


def test_no_images_is_lossless_for_images(out):
    shrink_pdf.shrink(FIXTURE, out, images=False)
    with pymupdf.open(FIXTURE) as a, pymupdf.open(out) as b:
        xa, xb = a[0].get_images()[0][0], b[0].get_images()[0][0]
        assert a.extract_image(xa)["image"] == b.extract_image(xb)["image"]


def test_lower_dpi_is_smaller(tmp_path):
    hi, lo = str(tmp_path / "hi.pdf"), str(tmp_path / "lo.pdf")
    shrink_pdf.shrink(FIXTURE, hi, dpi=300)
    shrink_pdf.shrink(FIXTURE, lo, dpi=72)
    assert os.path.getsize(lo) < os.path.getsize(hi)


def test_input_file_is_not_modified(out):
    with open(FIXTURE, "rb") as f:
        original = f.read()
    shrink_pdf.shrink(FIXTURE, out)
    with open(FIXTURE, "rb") as f:
        assert f.read() == original


def test_default_output_name():
    assert shrink_pdf.default_output("a/b/report.pdf") == "a/b/report_small.pdf"


def test_cli_end_to_end(tmp_path):
    out = tmp_path / "cli.pdf"
    r = subprocess.run(
        [sys.executable, os.path.join(ROOT, "shrink_pdf.py"), FIXTURE, "-o", str(out), "--first-page"],
        capture_output=True, text=True,
    )
    assert r.returncode == 0, r.stderr
    assert "smaller" in r.stdout
    assert pages(str(out)) == 1


@pytest.mark.parametrize("args", [["--quality", "0"], ["--quality", "101"], ["--dpi", "0"]])
def test_cli_rejects_bad_values(args, out):
    with pytest.raises(SystemExit):
        shrink_pdf.main([FIXTURE, "-o", out, *args])
