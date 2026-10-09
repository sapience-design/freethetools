import { defineTools } from "../../../src/agent/contract.js";
import { generate } from "./core.js";

export default defineTools({
  name: "generate_uuids",
  title: "UUID Generator",
  description:
    "Make UUIDs (RFC 9562) from a secure random source: random v4, or time-ordered v7, which sorts by creation time and suits database keys. Runs on this device; nothing is uploaded.",
  input: {
    type: "object",
    properties: {
      version: { type: "string", enum: ["v4", "v7"], description: "v4 random (default) or v7 time-ordered." },
      count: { type: "integer", minimum: 1, maximum: 1000, description: "How many (default 1)." },
      upper: { type: "boolean", description: "Upper-case letters (default false)." },
      braces: { type: "boolean", description: "Wrap in {braces} (default false)." },
      hyphens: { type: "boolean", description: "Keep the hyphens (default true)." },
    },
    additionalProperties: false,
  },
  example: { version: "v7", count: 3 },
  run: ({ version = "v4", count = 1, upper = false, braces = false, hyphens = true }) => {
    const uuids = generate(version, count, { upper, braces, hyphens });
    return { summary: `${uuids.length} ${version} UUID${uuids.length > 1 ? "s" : ""}.`, data: { uuids } };
  },
});
