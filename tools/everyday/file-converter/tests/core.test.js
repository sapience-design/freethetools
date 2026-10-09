import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import createDOMPurify from "dompurify";
import {
  detectType, outputsFor, relatedTools, renameTo, encodeBmp, encodeIco, icoSizes, svgRasterSize, encodeWav,
  convertData, convertDocument, htmlPage, decodeText, textToHtml, delimiterName, estimateAudio, longAudioWarning,
} from "../core.js";

const { window } = new JSDOM("");
globalThis.DOMParser = window.DOMParser;
const purify = createDOMPurify(window);

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAEElEQVR4nGP4z8DAwMDAAAAN/gH/7yFJ5QAAAABJRU5ErkJggg==", "base64");
const bytes = (...n) => Uint8Array.from(n);
const text = (s) => new TextEncoder().encode(s);
const ascii = (b, from, len) => String.fromCharCode(...b.subarray(from, from + len));

// ---- Type detection ----

test("detects images from their first bytes", () => {
  assert.equal(detectType(new Uint8Array(PNG), "x.dat").format, "png");
  assert.equal(detectType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46), "x").format, "jpeg");
  assert.equal(detectType(text("GIF89a\x01\x00\x01\x00"), "x").format, "gif");
  assert.equal(detectType(text("RIFF\x24\x00\x00\x00WEBPVP8 "), "x").format, "webp");
  const bmp = new Uint8Array(54); bmp[0] = 0x42; bmp[1] = 0x4d; bmp[14] = 40;
  assert.equal(detectType(bmp, "x").format, "bmp");
  assert.equal(detectType(bytes(0, 0, 1, 0, 1, 0, 16, 16, 0, 0, 1, 0, 32, 0), "x").format, "ico");
  assert.equal(detectType(bytes(0, 0, 0, 0x1c, ...text("ftypavif")), "x").format, "avif");
});

test("magic bytes beat the extension", () => {
  const d = detectType(new Uint8Array(PNG), "notes.txt");
  assert.deepEqual({ kind: d.kind, format: d.format }, { kind: "image", format: "png" });
  assert.equal(detectType(bytes(0xff, 0xd8, 0xff, 0xe1), "photo.png").format, "jpeg");
});

test("detects SVG from its content", () => {
  assert.equal(detectType(text('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'), "a.svg").format, "svg");
  assert.equal(detectType(text('<?xml version="1.0"?>\n<!-- c -->\n<svg viewBox="0 0 8 8"></svg>'), "").format, "svg");
  assert.equal(detectType(text("<!doctype html><html><body><svg></svg></body></html>"), "a.html").format, "html");
  // A comment after the doctype, and a doctype after a comment, are both fine.
  assert.equal(detectType(text('<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x.dtd">\n<!-- made by hand -->\n<svg></svg>'), "").format, "svg");
});

test("type detection stays fast on a crafted file full of comment markers", () => {
  // A single regular expression with a repeated group took exponential time on input like this.
  const crafted = "<!--" + "--><!--".repeat(40000);
  const started = Date.now();
  assert.notEqual(detectType(text(crafted), "x.svg").format, "svg");
  assert.notEqual(detectType(text("<?xml?>" + "<!-- -->".repeat(5000) + "<p>"), "x.txt").format, "svg");
  assert.ok(Date.now() - started < 1000, `took ${Date.now() - started} ms`);
});

test("detects audio, PDF and other binary types", () => {
  assert.equal(detectType(text("RIFF\x24\x00\x00\x00WAVEfmt "), "x").format, "wav");
  assert.equal(detectType(text("ID3\x04\x00"), "x").format, "mp3");
  assert.equal(detectType(bytes(0xff, 0xfb, 0x90, 0x00), "x").format, "mp3");
  assert.equal(detectType(text("OggS\x00\x02"), "x").format, "ogg");
  assert.equal(detectType(text("fLaC\x00"), "x").format, "flac");
  assert.equal(detectType(bytes(0, 0, 0, 0x20, ...text("ftypM4A ")), "x").kind, "audio");
  assert.equal(detectType(text("%PDF-1.7\n"), "x").kind, "pdf");
  assert.equal(detectType(text("PK\x03\x04"), "report.docx").kind, "unknown");
  assert.equal(detectType(bytes(0, 0, 0, 0x18, ...text("ftypheic")), "x.heic").label, "HEIC photo");
  assert.equal(detectType(bytes(1, 2, 0, 3, 4, 5), "mystery.xyz").kind, "unknown");
});

test("text formats use the extension; other text is unknown", () => {
  assert.equal(detectType(text("a,b\n1,2"), "t.csv").format, "csv");
  assert.equal(detectType(text("a\tb\n1\t2"), "t.TSV").format, "tsv");
  assert.equal(detectType(text('[{"a":1}]'), "t.json").format, "json");
  assert.equal(detectType(text("# Hi"), "readme.md").format, "markdown");
  assert.equal(detectType(text("<p>Hi</p>"), "p.htm").format, "html");
  assert.equal(detectType(text("<!DOCTYPE html><html></html>"), "page.txt").format, "html");
  assert.equal(detectType(text("hello"), "n.txt").format, "txt");
  assert.equal(detectType(text("hello"), "n.xyz").kind, "unknown");
  assert.equal(detectType(text("hello"), "").kind, "unknown");
});

test("lists outputs, never offering the input format back", () => {
  const ids = (name, b) => outputsFor(detectType(b, name)).map((o) => o.id);
  assert.deepEqual(ids("a.png", new Uint8Array(PNG)), ["jpeg", "webp", "bmp", "ico"]);
  assert.deepEqual(ids("a.csv", text("a,b")), ["json", "tsv"]);
  assert.deepEqual(ids("a.json", text("[]")), ["csv", "tsv"]);
  assert.deepEqual(ids("a.md", text("#")), ["html", "text"]);
  assert.deepEqual(ids("a.html", text("<p>")), ["markdown", "text"]);
  assert.deepEqual(ids("a.wav", text("RIFF\x24\x00\x00\x00WAVE")), ["wav"]);
  assert.deepEqual(ids("a.pdf", text("%PDF-")), []);
  assert.deepEqual(ids("a.xyz", text("zz")), []);
});

test("links to the specialised tools", () => {
  assert.deepEqual(relatedTools(detectType(text("%PDF-"), "a.pdf")).map((t) => t.href), ["/pdf/to-images/", "/pdf/compress/"]);
  assert.deepEqual(relatedTools(detectType(new Uint8Array(PNG), "a.png")).map((t) => t.href), ["/pdf/images-to-pdf/", "/images/compress/", "/images/resize/"]);
  assert.deepEqual(relatedTools(detectType(text("a,b"), "a.csv")), []);
});

test("renames with the new extension", () => {
  assert.equal(renameTo("holiday.photo.PNG", "bmp"), "holiday.photo.bmp");
  assert.equal(renameTo("noext", "wav"), "noext.wav");
});

// ---- Encoders ----

test("BMP: header, size, pixel order and row padding", () => {
  // 3 pixels wide: rows are 9 bytes, padded to 12. Red, green, blue on top; white, black, grey below.
  const rgba = Uint8ClampedArray.from([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255, 128, 128, 128, 255]);
  const bmp = encodeBmp(3, 2, rgba);
  const v = new DataView(bmp.buffer);
  assert.equal(ascii(bmp, 0, 2), "BM");
  assert.equal(v.getUint32(2, true), bmp.length);
  assert.equal(bmp.length, 54 + 12 * 2);
  assert.equal(v.getUint32(10, true), 54);
  assert.equal(v.getUint32(14, true), 40);
  assert.equal(v.getInt32(18, true), 3);
  assert.equal(v.getInt32(22, true), 2);
  assert.equal(v.getUint16(28, true), 24);
  assert.equal(v.getUint32(34, true), 24);
  // Bottom row is written first, as BGR.
  assert.deepEqual([...bmp.subarray(54, 63)], [255, 255, 255, 0, 0, 0, 128, 128, 128]);
  // Then the top row: red, green, blue as BGR.
  assert.deepEqual([...bmp.subarray(66, 75)], [0, 0, 255, 0, 255, 0, 255, 0, 0]);
  assert.equal(detectType(bmp, "x").format, "bmp");
  assert.throws(() => encodeBmp(2, 2, new Uint8Array(4)), /no pixels/);
});

test("ICO: directory entries point at the PNG data", () => {
  const png = new Uint8Array(PNG);
  const ico = encodeIco([{ size: 16, png }, { size: 256, png }]);
  const v = new DataView(ico.buffer);
  assert.equal(v.getUint16(0, true), 0);
  assert.equal(v.getUint16(2, true), 1);
  assert.equal(v.getUint16(4, true), 2);
  assert.equal(ico[6], 16);
  assert.equal(ico[6 + 16], 0); // 256 is stored as 0
  assert.equal(v.getUint16(6 + 6, true), 32);
  assert.equal(v.getUint32(6 + 8, true), png.length);
  const offset = v.getUint32(6 + 12, true);
  assert.equal(offset, 6 + 32);
  assert.deepEqual([...ico.subarray(offset, offset + 8)], [...png.subarray(0, 8)]);
  assert.equal(v.getUint32(6 + 16 + 12, true), offset + png.length);
  assert.equal(ico.length, 6 + 32 + png.length * 2);
  assert.equal(detectType(ico, "x").format, "ico");
  assert.throws(() => encodeIco([]), /at least one/);
  assert.throws(() => encodeIco([{ size: 300, png }]), /256/);
});

test("ICO sizes fit inside the picture", () => {
  assert.deepEqual(icoSizes(1000, 800), [16, 32, 48, 64, 128, 256]);
  assert.deepEqual(icoSizes(40, 40), [16, 32]);
  assert.deepEqual(icoSizes(5, 5), [16]);
});

test("WAV: 16-bit PCM header and sample values", () => {
  const left = Float32Array.from([0, 1, -1, 0.5]);
  const right = Float32Array.from([0, -1, 2, -0.5]); // 2 is clipped to 1
  const wav = encodeWav([left, right], 44100);
  const v = new DataView(wav.buffer);
  assert.equal(ascii(wav, 0, 4), "RIFF");
  assert.equal(v.getUint32(4, true), wav.length - 8);
  assert.equal(ascii(wav, 8, 8), "WAVEfmt ");
  assert.equal(v.getUint16(20, true), 1); // PCM
  assert.equal(v.getUint16(22, true), 2);
  assert.equal(v.getUint32(24, true), 44100);
  assert.equal(v.getUint32(28, true), 44100 * 4);
  assert.equal(v.getUint16(32, true), 4);
  assert.equal(v.getUint16(34, true), 16);
  assert.equal(ascii(wav, 36, 4), "data");
  assert.equal(v.getUint32(40, true), 16);
  assert.equal(wav.length, 44 + 16);
  assert.equal(v.getInt16(44 + 4, true), 32767);
  assert.equal(v.getInt16(44 + 6, true), -32768);
  assert.equal(v.getInt16(44 + 8, true), -32768);
  assert.equal(v.getInt16(44 + 10, true), 32767);
  assert.equal(detectType(wav, "x").format, "wav");
  assert.throws(() => encodeWav([], 44100), /channels/);
});

test("SVG raster size: declared size, viewBox, and small icons scaled up", () => {
  assert.deepEqual(svgRasterSize('<svg width="400" height="300"></svg>'), { width: 400, height: 300 });
  assert.deepEqual(svgRasterSize('<svg viewBox="0 0 1000 500"></svg>'), { width: 1000, height: 500 });
  assert.deepEqual(svgRasterSize('<svg width="24" height="24" viewBox="0 0 24 24"></svg>'), { width: 512, height: 512 });
  assert.deepEqual(svgRasterSize('<svg width="200px" viewBox="0 0 100 50"></svg>'), { width: 512, height: 256 });
  assert.deepEqual(svgRasterSize("<svg></svg>"), { width: 512, height: 512 });
});

// ---- Data ----

test("CSV to JSON, TSV to JSON and back", () => {
  assert.deepEqual(JSON.parse(convertData("name,age\nAda,36\nAlan,41", "csv", "json").text), [{ name: "Ada", age: "36" }, { name: "Alan", age: "41" }]);
  const tsv = convertData("name\tnote\nAda\ta, b\n", "tsv", "json");
  assert.equal(tsv.rows, 1);
  assert.deepEqual(JSON.parse(tsv.text), [{ name: "Ada", note: "a, b" }]);
  assert.equal(convertData('[{"a":1,"b":"x,y"}]', "json", "csv").text, 'a,b\r\n1,"x,y"');
  assert.equal(convertData('[{"a":1,"b":"x"}]', "json", "tsv").text, "a\tb\r\n1\tx");
});

test("CSV and TSV convert to each other, keeping quotes and every row", () => {
  const tsv = convertData('name,note\nAda,"one, two"\n"Q ""x""",3', "csv", "tsv");
  assert.equal(tsv.text, 'name\tnote\r\nAda\tone, two\r\n"Q ""x"""\t3');
  assert.equal(tsv.rows, 2);
  assert.equal(convertData(tsv.text, "tsv", "csv").text, 'name,note\r\nAda,"one, two"\r\n"Q ""x""",3');
});

test("data conversion handles a byte order mark, nested values and bad input", () => {
  assert.deepEqual(JSON.parse(convertData("﻿a,b\n1,2", "csv", "json").text), [{ a: "1", b: "2" }]);
  assert.equal(convertData('[{"a":{"x":1},"b":[1,2]}]', "json", "csv").text, 'a,b\r\n"{""x"":1}","[1,2]"');
  assert.throws(() => convertData("", "csv", "json"), /empty/);
  assert.throws(() => convertData("{oops", "json", "csv"), /isn't valid JSON/);
  assert.throws(() => convertData('{"a":1}', "json", "csv"), /list of objects/);
  assert.throws(() => convertData("[1,2]", "json", "csv"), /must be an object/);
});

// ---- Documents ----

test("Markdown to HTML makes a full page, cleaned", () => {
  const html = convertDocument("# Hi <script>x()</script>\n\n*there*", "markdown", "html", "Note <1>", { purify });
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<title>Note &lt;1&gt;<\/title>/);
  assert.match(html, /<h1>Hi/);
  assert.match(html, /<em>there<\/em>/);
  assert.doesNotMatch(html, /script/);
  assert.equal(htmlPage("<p>x</p>").includes('<meta charset="utf-8">'), true);
});

test("HTML to Markdown and plain text", () => {
  assert.match(convertDocument("<h1>Title</h1><p>Hello <b>you</b></p>", "html", "markdown"), /^# Title\n\nHello \*\*you\*\*/);
  assert.equal(convertDocument("<h1>Title</h1><p>Hello <b>you</b></p>", "html", "text"), "Title\n\nHello you\n");
  assert.equal(convertDocument("# Title\n\n- a\n- b", "markdown", "text"), "Title\n\n- a\n- b\n");
  assert.throws(() => convertDocument("  ", "markdown", "html"), /empty/);
  assert.throws(() => convertDocument("x", "txt", "markdown"), /isn't available/);
});

// ---- Review fixes ----

test("a semicolon CSV is detected and read as columns", () => {
  const r = convertData("name;age\nAda;36", "csv", "json");
  assert.deepEqual(JSON.parse(r.text), [{ name: "Ada", age: "36" }]);
  assert.equal(r.delimiter, ";");
  assert.equal(delimiterName(r.delimiter), "semicolon");
  assert.equal(convertData("a;b\n1;2", "csv", "tsv").text, "a\tb\r\n1\t2");
  assert.equal(convertData("a\tb\n1\t2", "csv", "json").delimiter, "\t");
  assert.equal(convertData("a,b\n1,2", "csv", "json").delimiter, ",");
});

test("JSON with different keys per row keeps every column", () => {
  assert.equal(convertData('[{"a":1,"b":2},{"a":3,"c":4}]', "json", "csv").text, "a,b,c\r\n1,2,\r\n3,,4");
  assert.throws(() => convertData('[{"a":1},[1]]', "json", "csv"), /mixes objects and arrays/);
});

test("TSV keeps empty cells on the last row", () => {
  assert.equal(convertData("a\tb\tc\n1\t2\t3\n4\t\t\n", "tsv", "csv").text, "a,b,c\r\n1,2,3\r\n4,,");
  assert.deepEqual(JSON.parse(convertData("a\tb\n1\t2\n4\t", "tsv", "json").text)[1], { a: "4", b: "" });
});

test("data conversion reports repeated column names", () => {
  const r = convertData("a,a\n1,2", "csv", "json");
  assert.match(r.warnings.join(" "), /renamed/);
  assert.deepEqual(convertData("a,b\n1,2", "csv", "json").warnings, []);
  assert.deepEqual(convertData("a\n1", "csv", "json").warnings, []);
  assert.match(convertData("a,b\n1,2,3", "csv", "tsv").warnings.join(" "), /Row 2/);
});

test("text is decoded as UTF-8, then windows-1252, and UTF-16 by its byte order mark", () => {
  assert.deepEqual(decodeText(new TextEncoder().encode("café")), { text: "café", encoding: "utf-8" });
  assert.deepEqual(decodeText(bytes(0x63, 0x61, 0x66, 0xe9)), { text: "café", encoding: "windows-1252" });
  assert.equal(decodeText(bytes(0xef, 0xbb, 0xbf, 0x61)).text, "a");
  assert.deepEqual(decodeText(bytes(0xff, 0xfe, 0x61, 0x00, 0xe9, 0x00)), { text: "aé", encoding: "utf-16le" });
  assert.deepEqual(decodeText(bytes(0xfe, 0xff, 0x00, 0x61, 0x00, 0xe9)), { text: "aé", encoding: "utf-16be" });
  const csv = convertData(decodeText(bytes(...Buffer.from("name;city\nAda;Zürich", "latin1"))).text, "csv", "json").text;
  assert.deepEqual(JSON.parse(csv), [{ name: "Ada", city: "Zürich" }]);
});

test("UTF-16 text with a byte order mark is text, not audio or binary", () => {
  const le = Uint8Array.from([0xff, 0xfe, ...Buffer.from("a,b\n1,2", "utf16le")]);
  assert.equal(detectType(le, "t.csv").format, "csv");
  const be = Uint8Array.from([0xfe, 0xff, ...Buffer.from("a,b\n1,2", "utf16le").swap16()]);
  assert.equal(detectType(be, "t.txt").format, "txt");
  assert.equal(detectType(new TextEncoder().encode("<?xml version='1.0'?><svg></svg>"), "x.txt").format, "svg");
});

test("plain text becomes escaped paragraphs, not Markdown", () => {
  assert.equal(textToHtml("* star\nnext <b>\n\nsecond & last"), "<p>* star<br>\nnext &lt;b&gt;</p>\n<p>second &amp; last</p>");
  const page = convertDocument("* star\nline two", "txt", "html", "T");
  assert.match(page, /<p>\* star<br>\nline two<\/p>/);
  assert.doesNotMatch(page, /<li>/);
});

test("audio length is checked before decoding", () => {
  const wav = new Uint8Array(44);
  new DataView(wav.buffer).setUint32(28, 176400, true); // 44.1 kHz, stereo, 16-bit
  assert.equal(longAudioWarning(estimateAudio(wav, 44 + 176400 * 60, "wav")), "");
  const long = estimateAudio(wav, 44 + 176400 * 3600, "wav");
  assert.equal(long.exact, true);
  assert.match(longAudioWarning(long), /about 60 minutes/);
  assert.match(longAudioWarning(estimateAudio(new Uint8Array(0), 40 * 1024 * 1024, "mp3")), /roughly/);
  assert.equal(longAudioWarning(estimateAudio(new Uint8Array(0), 3 * 1024 * 1024, "mp3")), "");
});
