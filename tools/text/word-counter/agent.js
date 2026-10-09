import { defineTools } from "../../../src/agent/contract.js";
import { stats } from "./core.js";

export default defineTools({
  name: "count_words",
  title: "Word Counter",
  description:
    "Count words, characters (as people see them, emoji included), sentences and paragraphs, with reading and speaking time. Counts Chinese, Japanese and Thai words correctly. Runs on this device; nothing is uploaded.",
  input: {
    type: "object",
    properties: { text: { type: "string", description: "The text to count." } },
    required: ["text"],
    additionalProperties: false,
  },
  example: { text: "Free the tools. Nothing is uploaded." },
  run: ({ text }) => {
    const s = stats(text);
    return { summary: `${s.words} words, ${s.characters} characters.`, data: s };
  },
});
