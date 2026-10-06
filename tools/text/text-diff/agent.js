import { defineTools } from "../../../src/agent/contract.js";
import { compare } from "./core.js";

/** Render parts as a readable diff: lines prefixed "+ ", "- " or "  "; words as [-old-]{+new+}. */
function render(parts, mode) {
  if (mode === "words") return parts.map((p) => (p.added ? `{+${p.value}+}` : p.removed ? `[-${p.value}-]` : p.value)).join("");
  return parts
    .flatMap((p) => p.value.replace(/\n$/, "").split("\n").map((l) => (p.added ? "+ " : p.removed ? "- " : "  ") + l))
    .join("\n");
}

export default defineTools({
  name: "compare_texts",
  title: "Text Diff",
  description:
    "Compare two texts and show what changed, line by line or word by word, with counts of added and removed lines or words. Runs on this device; nothing is uploaded.",
  input: {
    type: "object",
    properties: {
      original: { type: "string", description: "The original text." },
      changed: { type: "string", description: "The changed text." },
      mode: { type: "string", enum: ["lines", "words"], description: "Compare by lines (default) or by words." },
    },
    required: ["original", "changed"],
    additionalProperties: false,
  },
  example: { original: "one\ntwo\nthree", changed: "one\n2\nthree" },
  run: ({ original, changed, mode = "lines" }) => {
    const r = compare(original, changed, mode);
    const unit = mode === "words" ? "words" : "lines";
    const same = r.added === 0 && r.removed === 0;
    return {
      summary: same ? "The texts are the same." : `${r.added} ${unit} added, ${r.removed} ${unit} removed.`,
      data: { added: r.added, removed: r.removed, identical: same, diff: render(r.parts, mode) },
    };
  },
});
