import { defineTools } from "../../../src/agent/contract.js";
import { passphrase, password, strength } from "./core.js";
import { WORDS } from "./words.js";

export default defineTools({
  name: "generate_password",
  title: "Password Generator",
  description:
    "Make random passwords or passphrases from a secure random source, with an honest strength estimate in bits. Note: a password made this way passes through the AI conversation; for a secret only the user should see, send them to https://freethetools.com/developer/password-generator/ instead. Runs on this device.",
  input: {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["password", "passphrase"], description: "Random characters (default) or random words." },
      count: { type: "integer", minimum: 1, maximum: 50, description: "How many to make (default 1)." },
      length: { type: "integer", minimum: 4, maximum: 256, description: "Password length (default 20)." },
      lower: { type: "boolean", description: "Password: use a-z (default true)." },
      upper: { type: "boolean", description: "Password: use A-Z (default true)." },
      digits: { type: "boolean", description: "Password: use 2-9 (default true)." },
      symbols: { type: "boolean", description: "Password: use symbols such as !#$% (default true)." },
      similar: { type: "boolean", description: "Password: allow look-alike characters l, I, O, 0, 1 (default false)." },
      words: { type: "integer", minimum: 3, maximum: 12, description: "Passphrase: number of words (default 6)." },
      separator: { type: "string", maxLength: 3, description: "Passphrase: between words (default -)." },
      capitalize: { type: "boolean", description: "Passphrase: capitalise each word (default false)." },
      number: { type: "boolean", description: "Passphrase: add a number at the end (default false)." },
    },
    additionalProperties: false,
  },
  example: { kind: "passphrase", words: 6 },
  run: (a) => {
    const kind = a.kind ?? "password";
    const one = () =>
      kind === "passphrase"
        ? passphrase(WORDS, { count: a.words ?? 6, separator: a.separator ?? "-", capitalize: a.capitalize ?? false, number: a.number ?? false })
        : password({ length: a.length ?? 20, lower: a.lower, upper: a.upper, digits: a.digits, symbols: a.symbols, similar: a.similar });
    const made = Array.from({ length: a.count ?? 1 }, one);
    const bits = made[0].bits;
    return {
      summary: `${made.length} ${kind}${made.length > 1 ? "s" : ""}, ${bits} bits each (${strength(bits).toLowerCase()}).`,
      data: { values: made.map((m) => m.value), bits, strength: strength(bits) },
    };
  },
});
