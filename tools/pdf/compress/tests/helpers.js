// Builds a small PDF for tests: one noisy colour picture at 200 dpi, a link, and a title, author and XMP block.
// Noise makes JPEG quality matter, and the details give "remove document details" something to remove.
import { deflateSync } from "node:zlib";

/** @returns {Buffer} */
export function makePdf({ noisy = true, w = 600, h = 600, withMeta = true } = {}) {
  let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const px = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y*w+x)*3; const n = noisy ? (rnd()*60|0) : 0;
    px[i] = Math.min(255, (x*255/w|0) + n); px[i+1] = Math.min(255, (y*255/h|0) + n); px[i+2] = (128 + (Math.sin(x/9)*60|0) + n) & 255; }
  const img = deflateSync(px);
  const xmp = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator><rdf:Seq><rdf:li>Secret Author</rdf:li></rdf:Seq></dc:creator></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
  const objs = [];
  objs[1] = `<< /Type /Catalog /Pages 2 0 R ${withMeta ? "/Metadata 7 0 R" : ""} >>`;
  objs[2] = `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`;
  objs[3] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /XObject << /Im0 5 0 R >> /Font << /F1 6 0 R >> >> /Annots [8 0 R] >>`;
  const content = `q 216 0 0 216 72 500 cm /Im0 Do Q BT /F1 16 Tf 72 460 Td (Hello compress) Tj ET`;
  const parts = []; let off = 0; const offs = [];
  const push = (b) => { const buf = Buffer.isBuffer(b) ? b : Buffer.from(b, "latin1"); parts.push(buf); off += buf.length; };
  push("%PDF-1.4\n");
  const body = (n, dict, stream) => { offs[n] = off; push(`${n} 0 obj\n${dict}\n`); if (stream) { push("stream\n"); push(stream); push("\nendstream\n"); } push("endobj\n"); };
  body(1, objs[1]); body(2, objs[2]); body(3, objs[3]);
  body(4, `<< /Length ${content.length} >>`, content);
  body(5, `<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${img.length} >>`, img);
  body(6, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`);
  const x = Buffer.from(xmp, "utf8");
  body(7, `<< /Type /Metadata /Subtype /XML /Length ${x.length} >>`, x);
  body(8, `<< /Type /Annot /Subtype /Link /Rect [72 460 200 480] /Border [0 0 0] /A << /S /URI /URI (https://example.com/) >> >>`);
  body(9, `<< /Title (Secret Title) /Author (Secret Author) /Subject (Secret Subject) /Keywords (secret) /Creator (Secret Creator) /Producer (Test) >>`);
  const xref = off; push(`xref\n0 10\n0000000000 65535 f \n`);
  for (let i = 1; i <= 9; i++) push(String(offs[i]).padStart(10, "0") + " 00000 n \n");
  push(`trailer\n<< /Size 10 /Root 1 0 R /Info 9 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.concat(parts);
}
