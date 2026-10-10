// Build a ZIP file in the browser from several files. Nothing is sent anywhere.
// fflate (MIT) is bundled by Vite like the other libraries the page script imports.
import { zipSync } from "fflate";

/** @typedef {{ name: string, blob: Blob }} ZipEntry */

// Outputs that are already compressed are stored as they are: deflate would only cost time.
const STORED = /\.(pdf|jpe?g|png|webp|avif|gif|heic|zip|mp3|mp4|m4a|webm)$/i;

/** A name that is safe inside a ZIP (no folders), made unique: "a.pdf", "a (2).pdf", "a (3).pdf". */
/** @param {string[]} names @returns {string[]} */
export function uniqueNames(names) {
  const used = new Set();
  return names.map((raw) => {
    const clean = raw.replace(/[\/]+/g, "_").replace(/^\.+/, "") || "file";
    let name = clean;
    for (let n = 2; used.has(name.toLowerCase()); n++) {
      const dot = clean.lastIndexOf(".");
      name = dot > 0 ? `${clean.slice(0, dot)} (${n})${clean.slice(dot)}` : `${clean} (${n})`;
    }
    used.add(name.toLowerCase());
    return name;
  });
}

/** One ZIP with all the files. Duplicate names get " (2)", " (3)"... before the extension. */
/** @param {ZipEntry[]} files @returns {Promise<Blob>} */
export async function zipAll(files) {
  const names = uniqueNames(files.map((f) => f.name));
  /** @type {Record<string, [Uint8Array, { level: 0 | 6 }]>} */
  const data = {};
  for (let i = 0; i < files.length; i++) {
    const bytes = new Uint8Array(await files[i].blob.arrayBuffer());
    data[names[i]] = [bytes, { level: STORED.test(names[i]) ? 0 : 6 }];
  }
  return new Blob([zipSync(data)], { type: "application/zip" });
}
