// What the package may read and write. An AI assistant chooses the paths and names, so none of
// them are trusted: hidden files and folders are never read or written, saved files stay inside
// folders the person allows, and names that could run a program are refused.
import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, parse, relative, resolve } from "node:path";

const fail = (message) => Object.assign(new Error(message), { plain: true });

/** Extensions of files that run a program or start on their own. Refused wherever the package writes. */
export const BLOCKED_EXTENSIONS = new Set(
  ".bat .cmd .com .exe .dll .msi .ps1 .psm1 .vbs .vbe .js .jse .wsf .wsh .hta .scr .pif .lnk .url .reg .sh .bash .zsh .command .desktop .app .jar .py .rb .pl .mjs .cjs .scpt .workflow .ps1xml .inf .cpl".split(" "),
);

/** The real path of `p`. A path that does not exist yet gets the real path of its nearest folder that does. */
export async function realish(p) {
  let cur = resolve(p);
  const rest = [];
  for (;;) {
    try {
      return join(await realpath(cur), ...rest.reverse());
    } catch (e) {
      if (e.code !== "ENOENT" && e.code !== "ENOTDIR") throw e;
      const up = dirname(cur);
      if (up === cur) return resolve(p);
      rest.push(basename(cur));
      cur = up;
    }
  }
}

const inside = (base, p) => {
  const rel = relative(base, p);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
};
const isHidden = (segment) => segment.startsWith(".") && segment !== "." && segment !== "..";
const segmentsOf = (rel) => rel.split(/[\\/]/).filter(Boolean);

/** The first hidden segment of `p` below `base`, or of the whole path when `base` is not given. */
function hiddenIn(p, base) {
  const rel = base ? relative(base, p) : p.slice(parse(p).root.length);
  return segmentsOf(rel).find(isHidden);
}

/** A folder too broad to count as "the working directory": a drive or filesystem root, or the home folder. */
const tooBroad = (dir, home) => parse(dir).root === dir || dir === home;

/**
 * The folders this call may use. Real paths, so a link cannot point outside them.
 * @param {{ library: string, allowSave?: string[] }} o
 */
export async function foldersFor({ library, allowSave = [] }) {
  const home = await realish(homedir());
  const cwd = await realish(process.cwd());
  return {
    home,
    cwd,
    library: await realish(library),
    allowSave: await Promise.all(allowSave.map((d) => realish(d))),
    cwdOk: !tooBroad(cwd, home),
  };
}

/**
 * Check a file the assistant wants read. `real` is its real path. A hidden file, or anything
 * inside a hidden folder, is refused. Folders above the working directory, the library or the home
 * folder do not count, so a project may live under a folder such as .work.
 */
export function checkReadable(real, f) {
  const bases = [f.home, f.cwd, f.library].filter((b) => inside(b, real));
  const base = bases.sort((a, b) => b.length - a.length)[0];
  const hidden = hiddenIn(real, base);
  if (hidden)
    throw fail(
      `I won't read ${real}. It is hidden (${hidden} starts with a dot), and hidden files and folders hold keys, passwords and settings. Copy the file you mean to a normal folder and give me that path.`,
    );
}

/**
 * The folder to save copies in. It must be inside the working directory, the library or a folder
 * allowed with --allow-save, and must not go through a hidden folder. Returns the real path.
 */
export async function checkSaveTo(saveTo, f) {
  const target = await realish(resolve(process.cwd(), saveTo));
  const roots = [...(f.cwdOk ? [f.cwd] : []), f.library, ...f.allowSave];
  const base = roots.filter((r) => inside(r, target)).sort((a, b) => b.length - a.length)[0];
  if (!base)
    throw fail(
      `I won't save to ${target}. Files can only be saved inside the working directory (${f.cwdOk ? f.cwd : "not usable here, it is too broad"}), the library (${f.library}) or a folder you allow. To allow a folder, start freethetools with --allow-save <folder>, or set FREETHETOOLS_ALLOW_SAVE.`,
    );
  const hidden = hiddenIn(target, base);
  if (hidden) throw fail(`I won't save into ${target}. It is inside a hidden folder (${hidden} starts with a dot). Choose a normal folder.`);
  return target;
}

/** Refuse a file name that starts with a dot, has no extension, or would run a program. */
export function checkFileName(name) {
  if (name.startsWith("."))
    throw fail(`I won't save a file named "${name}": names that start with a dot are hidden or hold settings. Use another name.`);
  const ext = extname(name).toLowerCase();
  if (!ext)
    throw fail(`I won't save a file named "${name}": it has no extension, so the computer can't tell what it is. Use another name that ends in an extension, such as .txt.`);
  if (BLOCKED_EXTENSIONS.has(ext))
    throw fail(`I won't save a file named "${name}": ${ext} files can run programs. Use another name, such as ${name.slice(0, -ext.length)}.txt.`);
}
