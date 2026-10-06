import { defineTools, file } from "../../../src/agent/contract.js";
import { ALGORITHMS, hash } from "./core.js";

export default defineTools({
  name: "generate_hash",
  title: "Hash Generator",
  description:
    "Hash text (as UTF-8) or a file with SHA-256, SHA-512, SHA-384, SHA-1 or MD5, as lowercase hex. Use it to check a download against a published checksum. MD5 and SHA-1 are not safe for passwords or signatures. Runs on this device; nothing is uploaded.",
  input: {
    type: "object",
    properties: {
      text: { type: "string", description: "Text to hash. Give this or file." },
      file: file("A file to hash. Give this or text."),
      algorithms: { type: "array", items: { type: "string", enum: ALGORITHMS }, minItems: 1, description: "Which hashes to make (default [\"SHA-256\"])." },
    },
    additionalProperties: false,
  },
  example: { text: "abc", algorithms: ["SHA-256", "MD5"] },
  run: async ({ text, file: f, algorithms = ["SHA-256"] }) => {
    if (f && text !== undefined) throw new Error("Give either text or a file, not both.");
    if (!f && text === undefined) throw new Error("Give some text, or a file.");
    const bytes = f ? f.bytes : new TextEncoder().encode(text);
    const data = {};
    for (const a of algorithms) data[a] = await hash(bytes, a);
    return { summary: `${algorithms.join(", ")} of ${bytes.length} bytes.`, data };
  },
});
