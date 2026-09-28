// Words people type, grouped with the words our tools use. Any word in a group finds tools that
// mention another word in it: "combine" finds Merge PDFs, "gps" finds Remove Photo Location.
export const SYNONYMS = [
  ["merge", "combine", "join", "append", "concatenate", "unite"],
  ["compress", "shrink", "reduce", "smaller", "optimize", "optimise", "size", "squeeze", "lighter"],
  ["split", "separate", "extract", "cut", "divide", "pull"],
  ["rotate", "turn", "flip", "sideways", "orientation", "upside"],
  ["convert", "change", "transform", "turn into", "export", "save as"],
  ["image", "images", "photo", "photos", "picture", "pictures", "pic", "jpg", "jpeg", "png", "webp"],
  ["resize", "scale", "dimensions", "pixels", "bigger", "enlarge"],
  ["remove", "strip", "delete", "clean", "erase", "wipe"],
  ["location", "gps", "exif", "metadata", "geotag", "privacy"],
  ["fill", "form", "fillable", "sign", "complete", "type on"],
  ["count", "counter", "length", "how many", "characters", "letters"],
  ["diff", "compare", "difference", "changes", "versions"],
  ["case", "uppercase", "lowercase", "capitalize", "capitalise", "title"],
  ["json", "format", "pretty", "beautify", "validate", "lint"],
  ["csv", "spreadsheet", "excel", "table", "tsv"],
  ["base64", "encode", "decode", "b64"],
  ["hash", "checksum", "sha256", "md5", "sha1", "digest", "verify"],
  ["uuid", "guid", "unique id", "identifier"],
  ["qr", "qr code", "barcode", "scan", "wifi"],
  ["password", "passphrase", "secret", "random", "generate"],
  ["jwt", "token", "bearer", "claims"],
  ["regex", "regexp", "regular expression", "pattern", "match"],
  ["unit", "units", "measure", "metric", "imperial", "cm", "inches", "kg", "lbs", "celsius", "fahrenheit"],
  ["time zone", "timezone", "time", "clock", "meeting", "utc", "gmt"],
  ["pdf", "pdfs", "document", "documents", "acrobat"],
];

/** Expand text with every synonym group it touches, so the search index knows the other words. */
export function expand(text) {
  const t = ` ${text.toLowerCase()} `;
  const extra = new Set();
  for (const group of SYNONYMS) if (group.some((w) => t.includes(` ${w} `) || t.includes(` ${w}s `))) group.forEach((w) => extra.add(w));
  return extra.size ? `${text} ${[...extra].join(" ")}` : text;
}
