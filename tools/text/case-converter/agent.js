import { defineTools } from "../../../src/agent/contract.js";
import { CASES, convert } from "./core.js";

export default defineTools({
  name: "convert_case",
  title: "Case Converter",
  description:
    "Change the case of text: upper, lower, sentence, title, camel (camelCase), pascal (PascalCase), snake (snake_case), kebab (kebab-case) or constant (CONSTANT_CASE). Runs on this device; nothing is uploaded.",
  input: {
    type: "object",
    properties: {
      text: { type: "string", description: "The text to change." },
      case: { type: "string", enum: Object.keys(CASES), description: "The case to change it to." },
    },
    required: ["text", "case"],
    additionalProperties: false,
  },
  example: { text: "free the tools", case: "title" },
  run: ({ text, case: kind }) => ({ summary: `Changed ${text.length} characters to ${kind} case.`, data: { text: convert(text, kind) } }),
});
