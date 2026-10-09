// The library folder on disk: library.jsonl plus result files under files/<id>/.
import { appendFile, mkdir, open } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import { LOG_FILE, logLine } from "../../../src/agent/library.js";

/** The library folder: --library, then FREETHETOOLS_LIBRARY, then "freethetools" in the home folder. */
export function libraryDir(option) {
  const chosen = option || process.env.FREETHETOOLS_LIBRARY;
  return chosen ? resolve(chosen) : join(homedir(), "freethetools");
}

/** A name that is safe as one file name on Windows, macOS and Linux. */
export function safeName(name, max = 180) {
  const cleaned = basename(String(name).replaceAll("\\", "/"))
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, "_")
    .replace(/[. ]+$/, "");
  if (!cleaned || cleaned === "." || cleaned === "..") return "file";
  if (cleaned.length <= max) return cleaned;
  // Cut the name, not the extension.
  const ext = extname(cleaned);
  const keep = ext.length <= 20 ? ext : "";
  const stem = cleaned.slice(0, cleaned.length - keep.length).slice(0, max - keep.length).replace(/[. ]+$/, "");
  return (stem || "file") + keep;
}

/**
 * Write bytes to a new file in `dir`, never over an existing one: "a.pdf", "a (2).pdf", "a (3).pdf".
 * Returns the path written.
 */
export async function writeNew(dir, name, bytes) {
  await mkdir(dir, { recursive: true });
  const ext = extname(name);
  const stem = ext ? name.slice(0, -ext.length) : name;
  for (let n = 1; n < 10000; n++) {
    const path = join(dir, n === 1 ? name : `${stem} (${n})${ext}`);
    let fh;
    try {
      fh = await open(path, "wx");
    } catch (e) {
      if (e.code === "EEXIST") continue;
      throw e;
    }
    try { await fh.writeFile(bytes); } finally { await fh.close(); }
    return path;
  }
  throw new Error(`Too many files named ${name} in ${dir}.`);
}

/** Append one record to library.jsonl, creating the folder on first use. */
export async function appendEntry(dir, entry) {
  await mkdir(dir, { recursive: true });
  await appendFile(join(dir, LOG_FILE), logLine(entry), "utf8");
}
