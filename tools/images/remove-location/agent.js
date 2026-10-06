import { baseName, defineTools, files } from "../../../src/agent/contract.js";
import { stripMetadata } from "./core.js";

const EXT = { jpeg: "jpg", png: "png", webp: "webp" };
const MIME = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

export default defineTools({
  name: "remove_photo_metadata",
  makesFiles: true,
  title: "Remove Photo Location",
  description:
    "Strip location (GPS), camera details, time, XMP and IPTC metadata from JPEG, PNG and WebP photos before sharing them. The picture itself is not re-encoded, so it is unchanged byte for byte. Reports what each photo contained. Runs on this device; nothing is uploaded.",
  input: {
    type: "object",
    properties: { files: files("Photos to clean: JPEG, PNG or WebP.", ["image/jpeg", "image/png", "image/webp"]) },
    required: ["files"],
    additionalProperties: false,
  },
  run: ({ files: photos }) => {
    const out = [], report = [];
    for (const f of photos) {
      let r;
      try { r = stripMetadata(f.bytes); } catch (e) { throw new Error(`${f.name}: ${e.message}`); }
      out.push({ name: `${baseName(f.name)}_clean.${EXT[r.format]}`, type: MIME[r.format], bytes: r.bytes });
      report.push({ file: f.name, removed: Object.keys(r.found).filter((k) => r.found[k]) });
    }
    const gps = report.filter((r) => r.removed.includes("gps")).length;
    return {
      summary: `Cleaned ${out.length} photo${out.length > 1 ? "s" : ""}; ${gps ? `${gps} had a location` : "none had a location"}.`,
      data: { photos: report },
      files: out,
    };
  },
});
