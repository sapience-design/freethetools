import { defineTools } from "../../../src/agent/contract.js";
import { convertColour } from "./core.js";

export default defineTools({
  name: "convert_colour",
  title: "Colour Converter",
  description:
    "Read a colour written as HEX (#f80, #ff8800, #ff880080), rgb()/rgba(), hsl()/hsla() or a CSS colour name, and return it as HEX, RGB and HSL with the nearest CSS colour name and the WCAG contrast ratio against white and black (pass or fail for normal and large text). Runs on this device; nothing is uploaded.",
  input: {
    type: "object",
    properties: {
      colour: { type: "string", description: "The colour, for example #336699, rgb(255 0 0 / 50%), hsl(210 50% 40%) or rebeccapurple." },
    },
    required: ["colour"],
    additionalProperties: false,
  },
  example: { colour: "rebeccapurple" },
  run: ({ colour }) => {
    const r = convertColour(colour);
    const against = (label, c) => `${label} ${c.ratio}:1 (normal text ${c.normalText ? "pass" : "fail"}, large text ${c.largeText ? "pass" : "fail"})`;
    return {
      summary: `${r.hex}, ${r.rgb}, ${r.hsl}. ${r.nameIsExact ? "CSS name" : "Nearest CSS name"}: ${r.name}. ${against("On white", r.contrastWithWhite)}; ${against("on black", r.contrastWithBlack)}.`,
      data: r,
    };
  },
});
