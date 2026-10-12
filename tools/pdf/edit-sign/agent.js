import { baseName, defineTools, detectType, expectType, file, withUnlockHint } from "../../../src/agent/contract.js";
import { applyMarks, pageSizes } from "./core.js";

const PDF = ["application/pdf"];
const IMAGE = ["image/png", "image/jpeg"];

const num = (what) => ({ type: "number", description: what });

export default defineTools({
  name: "add_to_pdf",
  makesFiles: true,
  title: "Edit and Sign PDF",
  description:
    "Write text, boxes, highlights and one picture (such as a signature image) onto a PDF's pages and save a new PDF. Positions are in points (1/72 inch) from the top-left corner of the page as it looks when opened, page numbers start at 1. The text uses a built-in Latin font (Windows-1252: æ, ø, å, é, ü, ß). A picture signature is only a picture, not a certificate-based digital signature. Runs on this device; nothing is uploaded.",
  input: {
    type: "object",
    properties: {
      file: file("The PDF.", PDF),
      marks: {
        type: "array",
        maxItems: 500,
        description: "What to add, in order. Each item has a type: text, box or highlight.",
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["text", "box", "highlight"], description: "text: a line of text at x, y. box: a rectangle, optionally with text. highlight: a see-through colour." },
            page: { type: "integer", minimum: 1, description: "Page number, starting at 1." },
            x: num("Distance from the left edge, in points."),
            y: num("Distance from the top edge, in points."),
            width: num("Box and highlight only: width in points."),
            height: num("Box and highlight only: height in points."),
            text: { type: "string", maxLength: 5000, description: "Text to write. Box: text inside the box, wrapped to its width." },
            size: num("Text size in points (default 16 for text, 14 in a box)."),
            color: { type: "string", description: "Colour as #rrggbb: text colour, box border colour or highlight colour." },
            fill: { type: "string", description: "Box only: fill colour as #rrggbb. Leave out for no fill." },
            fillOpacity: num("Box only: how solid the fill is, 0 to 1 (default 1)."),
            borderWidth: num("Box only: border width in points (default 2, 0 for none)."),
          },
          required: ["type", "page", "x", "y"],
          additionalProperties: false,
        },
      },
      image: file("A PNG or JPG picture to put on the PDF, such as a signature. Optional.", IMAGE),
      imageAt: {
        type: "object",
        description: "Where the picture goes. Needed when image is given.",
        properties: {
          page: { type: "integer", minimum: 1, description: "Page number, starting at 1." },
          x: num("Distance from the left edge, in points."),
          y: num("Distance from the top edge, in points."),
          width: num("Width in points. The height follows the picture's shape."),
        },
        required: ["page", "x", "y", "width"],
        additionalProperties: false,
      },
    },
    required: ["file"],
    additionalProperties: false,
  },
  run: withUnlockHint(async ({ file: f, marks = [], image, imageAt }) => {
    expectType(f, PDF, "a PDF");
    if (image && !imageAt) throw new Error("Say where the picture goes with imageAt.");
    if (imageAt && !image) throw new Error("imageAt needs an image file.");
    if (!marks.length && !image) throw new Error("Give at least one mark or an image to add.");

    const list = marks.map((m) => {
      const base = { page: m.page, x: m.x, y: m.y };
      if (m.type === "text") return { ...base, type: "text", text: m.text ?? "", size: m.size, color: m.color };
      if (m.type === "highlight") return { ...base, type: "highlight", w: m.width, h: m.height, color: m.color };
      return {
        ...base, type: "rect", w: m.width, h: m.height, color: m.color, fill: m.fill, fillOpacity: m.fillOpacity,
        strokeWidth: m.borderWidth, text: m.text ?? "", size: m.size,
      };
    });
    if (image) {
      const mime = detectType(image.bytes, image.name);
      if (!IMAGE.includes(mime)) throw new Error(`${image.name} isn't a PNG or JPG picture.`);
      list.push({ type: "image", page: imageAt.page, x: imageAt.x, y: imageAt.y, w: imageAt.width, bytes: image.bytes, mime, label: "Picture" });
    }
    const out = await applyMarks(f.bytes, list);
    const pages = await pageSizes(out);
    return {
      summary: `Added ${list.length} ${list.length === 1 ? "item" : "items"} to a ${pages.length}-page PDF.`,
      data: { added: list.length, pages: pages.map((p, i) => ({ page: i + 1, width: Math.round(p.width * 100) / 100, height: Math.round(p.height * 100) / 100 })) },
      files: [{ name: `${baseName(f.name)}-signed.pdf`, type: "application/pdf", bytes: out }],
    };
  }),
});
