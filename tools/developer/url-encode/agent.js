import { defineTools } from "../../../src/agent/contract.js";
import { decode, encode } from "./core.js";

const mode = {
  type: "string",
  enum: ["component", "url"],
  description: "component (default) encodes one part of an address, such as a query value, and also escapes / ? & = # and :. url keeps those characters, for a whole address.",
};

export default defineTools(
  {
    name: "url_encode",
    title: "URL Encode and Decode",
    description: "Percent-encode text for use in a web address (encodeURIComponent or encodeURI). Runs on this device; nothing is uploaded.",
    input: {
      type: "object",
      properties: { text: { type: "string", description: "The text to encode." }, mode },
      required: ["text"],
      additionalProperties: false,
    },
    example: { text: "café & crème 👍" },
    run: ({ text, mode: m = "component" }) => {
      const encoded = encode(text, m);
      return { summary: `Encoded ${text.length} characters.`, data: { encoded } };
    },
  },
  {
    name: "url_decode",
    title: "URL Encode and Decode",
    description: "Decode percent-encoded text (decodeURIComponent or decodeURI). A broken % sequence gives a plain error. Runs on this device; nothing is uploaded.",
    input: {
      type: "object",
      properties: {
        text: { type: "string", description: "The percent-encoded text to decode." },
        mode,
        plusAsSpace: { type: "boolean", description: "Read + as a space, as in form data and query strings (default false)." },
      },
      required: ["text"],
      additionalProperties: false,
    },
    example: { text: "caf%C3%A9%20%26%20cr%C3%A8me" },
    run: ({ text, mode: m = "component", plusAsSpace = false }) => {
      const decoded = decode(text, { mode: m, plusAsSpace });
      return { summary: `Decoded to ${decoded.length} characters.`, data: { decoded } };
    },
  },
);
