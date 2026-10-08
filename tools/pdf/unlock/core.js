// Unlock PDF: the logic, with no page code, so the page, the agent tool and the tests share it.
// qpdf (WebAssembly) removes the encryption without touching anything else in the file, so pages,
// forms and bookmarks come out the same. qpdf itself is lent to these functions as `qpdf`:
//   qpdf(args, input) -> Promise<{ code, lines, output? }>
// It writes `input` to /in.pdf, runs qpdf with `args`, and returns the exit code, everything qpdf
// printed (one entry per line) and /out.pdf if qpdf made one.
// A password only ever travels inside `args`. Nothing here stores or logs it.

export const IN = "/in.pdf";
export const OUT = "/out.pdf";

/** What qpdf calls each permission, in the words a person would use. Several can share one word. */
const PERMISSIONS = [
  ["print low resolution", "printing"],
  ["print high resolution", "printing"],
  ["extract for any purpose", "copying text and images"],
  ["extract for accessibility", "reading text aloud with assistive tools"],
  ["modify document assembly", "adding, removing and reordering pages"],
  ["modify forms", "filling in forms"],
  ["modify annotations", "adding comments and notes"],
  ["modify other", "editing"],
  ["modify anything", "editing"],
];

const passwordArgs = (password) => (password ? [`--password=${password}`] : []);

/** The qpdf command that describes a file's encryption. With a wrong or missing password it fails. */
export function inspectArgs(password = "") {
  return ["--show-encryption", ...passwordArgs(password), IN];
}

/** The qpdf command that writes an unencrypted copy of the file. */
export function decryptArgs(password = "") {
  return ["--decrypt", ...passwordArgs(password), IN, OUT];
}

/** Group the "not allowed" lines of --show-encryption into plain words, without repeats. */
export function restrictionsFrom(lines) {
  const words = [];
  for (const line of lines) {
    const m = /^(.*?):\s*not allowed\s*$/i.exec(line.trim());
    if (!m) continue;
    const label = m[1].trim().toLowerCase();
    const word = PERMISSIONS.find(([l]) => l === label)?.[1] ?? label;
    if (!words.includes(word)) words.push(word);
  }
  const rank = (w) => { const i = PERMISSIONS.findIndex(([, word]) => word === w); return i < 0 ? PERMISSIONS.length : i; };
  return words.sort((a, b) => rank(a) - rank(b)); // printing first, then copying, then editing
}

/**
 * Read what qpdf printed for --show-encryption.
 * kind: "none" (not encrypted), "restricted" (opens without a password, may have restrictions),
 * "password" (needs a password, or the one given is wrong), "damaged" (not a PDF qpdf can read).
 * This build of qpdf exits with 2 for several of these, so the words it prints decide, not the code.
 */
export function readInspection({ code, lines }) {
  const text = lines.join("\n");
  if (/invalid password/i.test(text)) return { kind: "password" };
  if (/file is not encrypted/i.test(text)) return { kind: "none" };
  if (/^R = \d/m.test(text) && (code === 0 || code === 3)) {
    return { kind: "restricted", restrictions: restrictionsFrom(lines), as: /supplied password is owner password/i.test(text) ? "owner" : "user" };
  }
  return { kind: "damaged" };
}

/** A sentence listing things, "printing, copying text and images and editing". */
export function listWords(words) {
  if (words.length < 2) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** Say what was removed, in a sentence. */
export function removedSentence(lock, restrictions) {
  const parts = [];
  if (lock === "password") parts.push("the password");
  if (restrictions.length) parts.push(`the restrictions on ${listWords(restrictions)}`);
  if (!parts.length) parts.push("the encryption, which set no restrictions");
  return `Removed ${listWords(parts)}.`;
}

/**
 * Look at a PDF's lock and remove it if no password is missing.
 * Returns one of:
 *   { status: "unlocked", lock: "password" | "restrictions", restrictions, bytes }
 *   { status: "not-locked" }
 *   { status: "needs-password" }   no password was given, and the file needs one
 *   { status: "wrong-password" }   a password was given and it did not fit
 *   { status: "damaged" }
 * @param {(args: string[], input: Uint8Array) => Promise<{ code: number, lines: string[], output?: Uint8Array }>} qpdf
 * @param {Uint8Array} bytes
 * @param {string} [password]
 */
export async function unlockPdf(qpdf, bytes, password = "") {
  // If qpdf itself cannot run, this throws: that is a broken engine, not a damaged file.
  const seen = readInspection(await qpdf(inspectArgs(password), bytes));
  if (seen.kind === "none") return { status: "not-locked" };
  if (seen.kind === "password") return { status: password ? "wrong-password" : "needs-password" };
  if (seen.kind === "damaged") return { status: "damaged" };
  const run = await qpdf(decryptArgs(password), bytes);
  if (!run.output?.length || (run.code !== 0 && run.code !== 3)) return { status: "damaged" };
  return { status: "unlocked", lock: password ? "password" : "restrictions", restrictions: seen.restrictions, bytes: run.output };
}
