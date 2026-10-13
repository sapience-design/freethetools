import { baseName, defineTools, expectType, file } from "../../../src/agent/contract.js";
import { allowsEverything, protectPdf, protectedSentence, randomOwner } from "./core.js";

export default defineTools({
  name: "protect_pdf",
  makesFiles: true,
  title: "Protect PDF",
  description:
    "Lock a PDF with a password, using qpdf and 256-bit AES. The password is needed to open the file. Optionally let people print, copy text or change the file without the owner password (printing is allowed by default; copying and changing are not). A PDF that is already locked must be unlocked first with unlock_pdf. The password can't be recovered if it is forgotten. A password passes through the AI conversation, so for a sensitive file the person should use the Protect PDF page instead. Runs on this device; nothing is uploaded.",
  input: {
    type: "object",
    properties: {
      file: file("The PDF to protect.", ["application/pdf"]),
      password: { type: "string", description: "The password that will be needed to open the PDF." },
      allowPrint: { type: "boolean", "x-setting": true, description: "Let people print it (default true)." },
      allowCopy: { type: "boolean", "x-setting": true, description: "Let people copy text and images from it (default false)." },
      allowEdit: { type: "boolean", "x-setting": true, description: "Let people change the file (default false)." },
    },
    required: ["file", "password"],
    additionalProperties: false,
  },
  needs: ["qpdf"],
  run: async ({ file: f, password, allowPrint = true, allowCopy = false, allowEdit = false }, ctx) => {
    expectType(f, ["application/pdf"], "a PDF");
    if (!ctx.qpdf) throw new Error("The PDF protector isn't available here.");
    if (!password) throw new Error("Give the password to lock the PDF with.");
    const allow = { print: allowPrint, copy: allowCopy, edit: allowEdit };
    // The limits only hold when the owner password differs from the opening password.
    const owner = allowsEverything(allow) ? "" : randomOwner();
    const r = await protectPdf(ctx.qpdf, f.bytes, { password, owner, allow });
    switch (r.status) {
      case "protected":
        return {
          summary: `${f.name}: locked with a password. ${protectedSentence(allow)}`,
          data: { encryption: "AES-256", allowPrint, allowCopy, allowEdit },
          files: [{ name: `${baseName(f.name)}_protected.pdf`, type: "application/pdf", bytes: r.bytes }],
        };
      case "locked":
        throw new Error(`${f.name} is already locked. Run unlock_pdf on it first, then protect the unlocked copy.`);
      default:
        throw new Error(`Could not read ${f.name}. It may be damaged or not a PDF.`);
    }
  },
});
