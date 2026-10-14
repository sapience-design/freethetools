// Protect PDF: the logic, with no page code, so the page, the agent tool and the tests share it.
// qpdf (WebAssembly, the same engine as Unlock PDF) writes the password into the file with 256-bit
// AES. qpdf itself is lent to these functions as `qpdf`:
//   qpdf(args, input) -> Promise<{ code, lines, output? }>
// It writes `input` to /in.pdf, runs qpdf with `args`, and returns the exit code, everything qpdf
// printed (one entry per line) and /out.pdf if qpdf made one.
// A password only ever travels inside `args`. Nothing here stores or logs it.
import { IN, OUT, inspectArgs, readInspection } from "../unlock/core.js";

/**
 * What people may still do without the owner password. Printing is allowed by default; copying
 * and changing are not.
 * @typedef {{ print?: boolean, copy?: boolean, edit?: boolean }} Allow
 */
export const DEFAULT_ALLOW = Object.freeze({ print: true, copy: false, edit: false });

// qpdf 11.0 reads a password that starts with "-" as one of its own options and stops.
const DASH = "A password can't start with a dash (-). Start it with a letter, a number or another sign.";

/** Why a password pair can't be used yet, in a sentence a person can act on. Empty when it is fine. */
export function passwordProblem(password, again) {
  if (!password) return "Type a password first.";
  if (password.startsWith("-")) return DASH;
  if (password !== again) return "The two passwords don't match. Type the same password in both boxes.";
  return "";
}

/**
 * The qpdf command that locks a file with 256-bit AES.
 * `password` opens the file. `owner` is the owner password: it lifts the limits below. When no
 * owner password is given, the opening password is used for both, which means anyone who can open
 * the file can also do everything, so the limits on printing, copying and editing do nothing.
 * @param {{ password: string, owner?: string, allow?: Allow }} o
 */
export function encryptArgs({ password, owner = "", allow = DEFAULT_ALLOW }) {
  if (!password) throw new Error("A password is needed to protect a PDF.");
  if (password.startsWith("-") || owner.startsWith("-")) throw new Error(DASH);
  const a = { ...DEFAULT_ALLOW, ...allow };
  return [
    "--encrypt", password, owner || password, "256",
    `--print=${a.print ? "full" : "none"}`,
    `--extract=${a.copy ? "y" : "n"}`,
    `--modify=${a.edit ? "all" : "none"}`,
    "--", IN, OUT,
  ];
}

/** True when every limit is off, so the owner password may as well be the opening password. */
export const allowsEverything = (allow = DEFAULT_ALLOW) => {
  const a = { ...DEFAULT_ALLOW, ...allow };
  return a.print && a.copy && a.edit;
};

/** A sentence for what the lock does, "Anyone with the password can open it. Printing is allowed." */
export function protectedSentence(allow = DEFAULT_ALLOW) {
  const a = { ...DEFAULT_ALLOW, ...allow };
  const yes = [a.print && "print", a.copy && "copy text", a.edit && "change the file"].filter(Boolean);
  const no = [!a.print && "print", !a.copy && "copy text", !a.edit && "change the file"].filter(Boolean);
  const list = (w) => (w.length < 2 ? w.join("") : `${w.slice(0, -1).join(", ")} and ${w[w.length - 1]}`);
  if (!no.length) return "It needs the password to open, and then has no limits.";
  return `It needs the password to open. ${yes.length ? `People can ${list(yes)}, but not ${list(no)}.` : `People can't ${list(no)}.`}`;
}

/**
 * Lock a PDF with a password.
 * Returns one of:
 *   { status: "protected", bytes }
 *   { status: "locked" }      the PDF already has a password or limits: unlock it first
 *   { status: "damaged" }
 *   { status: "no-password" }
 * @param {(args: string[], input: Uint8Array) => Promise<{ code: number, lines: string[], output?: Uint8Array }>} qpdf
 * @param {Uint8Array} bytes
 * @param {{ password: string, owner?: string, allow?: Allow }} o
 */
export async function protectPdf(qpdf, bytes, o) {
  if (!o.password) return { status: "no-password" };
  // If qpdf itself cannot run, this throws: that is a broken engine, not a damaged file.
  const seen = readInspection(await qpdf(inspectArgs(""), bytes));
  if (seen.kind === "password" || seen.kind === "restricted") return { status: "locked" };
  if (seen.kind === "damaged") return { status: "damaged" };
  const run = await qpdf(encryptArgs(o), bytes);
  if (!run.output?.length || (run.code !== 0 && run.code !== 3)) return { status: "damaged" };
  return { status: "protected", bytes: run.output };
}

/** A random owner password nobody needs to know: it is made so that the limits hold. Needs Web Crypto. */
export function randomOwner() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
