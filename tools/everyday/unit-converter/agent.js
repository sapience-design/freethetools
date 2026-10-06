import { defineTools } from "../../../src/agent/contract.js";
import { UNITS, convert, pretty } from "./core.js";

const unitList = Object.entries(UNITS)
  .map(([cat, { units }]) => `${cat}: ${Object.keys(units).join(", ")}`)
  .join("; ");

export default defineTools({
  name: "convert_units",
  title: "Unit Converter",
  description: `Convert a value between units in one category, using exact definitions where they exist. Units by category: ${unitList}. Runs on this device; nothing is uploaded.`,
  input: {
    type: "object",
    properties: {
      value: { type: "number", description: "The amount to convert." },
      category: { type: "string", enum: Object.keys(UNITS), description: "The kind of quantity." },
      from: { type: "string", description: "Unit key to convert from, e.g. km." },
      to: { type: "string", description: "Unit key to convert to, e.g. mi." },
    },
    required: ["value", "category", "from", "to"],
    additionalProperties: false,
  },
  example: { value: 10, category: "length", from: "km", to: "mi" },
  run: ({ value, category, from, to }) => {
    const result = convert(value, category, from, to);
    const names = UNITS[category].units;
    return {
      summary: `${pretty(value)} ${from} = ${pretty(result)} ${to}`,
      data: { result, text: pretty(result), from: names[from][0], to: names[to][0] },
    };
  },
});
