import { baseName, defineTools, expectType, file } from "../../../src/agent/contract.js";
import { removedSentence, unlockPdf } from "./core.js";

export default defineTools({
  name: "unlock_pdf",
  makesFiles: true,
  title: "Unlock PDF",
  description:
    "Remove the lock from a PDF with qpdf, without changing the pages, forms or bookmarks. Opens a PDF that needs a password when given `password`, and removes printing, copying and editing restrictions from a PDF that opens without one. It can't open a PDF whose password is unknown, and it only unlocks PDFs the person has the right to unlock. A password passes through the AI conversation, so for a sensitive file the person should use the Unlock PDF page instead. Runs on this device; nothing is uploaded.",
  input: {
    type: "object",
    properties: {
      file: file("The locked PDF.", ["application/pdf"]),
      password: { type: "string", description: "The password that opens the PDF. Leave it out for a PDF that opens without one but has restrictions." },
    },
    required: ["file"],
    additionalProperties: false,
  },
  needs: ["qpdf"],
  run: async ({ file: f, password = "" }, ctx) => {
    expectType(f, ["application/pdf"], "a PDF");
    if (!ctx.qpdf) throw new Error("The PDF unlocker isn't available here.");
    const r = await unlockPdf(ctx.qpdf, f.bytes, password);
    switch (r.status) {
      case "unlocked":
        return {
          summary: `${f.name}: ${removedSentence(r.lock, r.restrictions)}`,
          data: { lock: r.lock, restrictions: r.restrictions },
          files: [{ name: `${baseName(f.name)}_unlocked.pdf`, type: "application/pdf", bytes: r.bytes }],
        };
      case "not-locked":
        return { summary: `${f.name} isn't locked, so there is nothing to remove.`, data: { lock: "none", restrictions: [] } };
      case "needs-password":
        throw new Error(`${f.name} needs a password to open. Ask the person for it, or have them use the Unlock PDF page.`);
      case "wrong-password":
        throw new Error(`That password doesn't open ${f.name}.`);
      default:
        throw new Error(`Could not read ${f.name}. It may be damaged or not a PDF.`);
    }
  },
});
