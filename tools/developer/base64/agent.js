import { defineTools, detectType, file } from "../../../src/agent/contract.js";
import { base64ToBytes, bytesToBase64, decodeText } from "./core.js";

export default defineTools(
  {
    name: "base64_encode",
    title: "Base64",
    description:
      "Encode text (as UTF-8) or a file as Base64, in standard or URL-safe form. Runs on this device; nothing is uploaded.",
    input: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to encode. Give this or file." },
        file: file("A file to encode. Give this or text."),
        urlSafe: { type: "boolean", description: "Use the URL-safe alphabet (- and _) without padding (default false)." },
      },
      additionalProperties: false,
    },
    example: { text: "Free the Tools" },
    run: ({ text, file: f, urlSafe = false }) => {
      if (f && text !== undefined) throw new Error("Give either text or a file, not both.");
      if (!f && text === undefined) throw new Error("Give some text, or a file.");
      const bytes = f ? f.bytes : new TextEncoder().encode(text);
      return { summary: `Encoded ${bytes.length} bytes.`, data: { base64: bytesToBase64(bytes, urlSafe) } };
    },
  },
  {
    name: "base64_decode",
    title: "Base64",
    description:
      "Decode Base64 (standard or URL-safe, padding optional) to text, or to a file when the result is binary. Runs on this device; nothing is uploaded.",
    input: {
      type: "object",
      properties: {
        base64: { type: "string", description: "The Base64 to decode." },
        output: { type: "string", enum: ["text", "file"], description: "Decode to UTF-8 text (default) or save as a file." },
        fileName: { type: "string", description: "Name for the file when output is \"file\" (default decoded.bin)." },
      },
      required: ["base64"],
      additionalProperties: false,
    },
    example: { base64: "RnJlZSB0aGUgVG9vbHM=" },
    run: ({ base64, output = "text", fileName = "decoded.bin" }) => {
      if (output === "text") {
        const text = decodeText(base64);
        return { summary: `Decoded ${text.length} characters.`, data: { text } };
      }
      const bytes = base64ToBytes(base64);
      return { summary: `Decoded ${bytes.length} bytes.`, files: [{ name: fileName, type: detectType(bytes, fileName), bytes }] };
    },
  },
);
