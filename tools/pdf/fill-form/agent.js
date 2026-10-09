import { baseName, defineTools, expectType, file } from "../../../src/agent/contract.js";
import { fillForm, listFields } from "./core.js";

const PDF = ["application/pdf"];

export default defineTools(
  {
    name: "list_pdf_form_fields",
    title: "Fill PDF Form",
    description:
      "List the fillable fields in a PDF form: name, type (text, checkbox, dropdown, radio, list), current value, choices and whether it is read-only. Call this before fill_pdf_form. Runs on this device; nothing is uploaded.",
    input: {
      type: "object",
      properties: { file: file("The PDF form.", PDF) },
      required: ["file"],
      additionalProperties: false,
    },
    run: async ({ file: f }) => {
      expectType(f, PDF, "a PDF");
      const fields = await listFields(f.bytes);
      return { summary: fields.length ? `${fields.length} fillable field${fields.length > 1 ? "s" : ""}.` : "This PDF has no fillable fields.", data: { fields } };
    },
  },
  {
    name: "fill_pdf_form",
    makesFiles: true,
    title: "Fill PDF Form",
    description:
      "Fill a PDF form's fields by name and save a new PDF. Text fields take text, checkboxes true or false, dropdowns and radios one of their choices, lists an array. Optionally flatten so the answers can no longer be edited. Get field names with list_pdf_form_fields first. Runs on this device; nothing is uploaded.",
    input: {
      type: "object",
      properties: {
        file: file("The PDF form.", PDF),
        values: {
          type: "object",
          description: "Values by field name.",
          additionalProperties: { type: ["string", "boolean", "array"] },
        },
        flatten: { type: "boolean", description: "Make the answers part of the page so they can't be edited (default false)." },
      },
      required: ["file", "values"],
      additionalProperties: false,
    },
    run: async ({ file: f, values, flatten = false }) => {
      expectType(f, PDF, "a PDF");
      const fields = new Map((await listFields(f.bytes)).map((x) => [x.name, x]));
      const filled = [], skipped = [];
      for (const name of Object.keys(values)) {
        const x = fields.get(name);
        if (!x) skipped.push({ name, reason: "no field with this name" });
        else if (x.readOnly) skipped.push({ name, reason: "read-only" });
        else if (x.options && !Array.isArray(values[name]) && values[name] !== "" && !x.options.includes(String(values[name])))
          skipped.push({ name, reason: `not one of: ${x.options.join(", ")}` });
        else filled.push(name);
      }
      const keep = Object.fromEntries(filled.map((n) => [n, values[n]]));
      const out = await fillForm(f.bytes, keep, { flatten });
      return {
        summary: `Filled ${filled.length} field${filled.length === 1 ? "" : "s"}${skipped.length ? `; skipped ${skipped.length}` : ""}${flatten ? ", flattened" : ""}.`,
        data: { filled, skipped },
        files: [{ name: `${baseName(f.name)}_filled.pdf`, type: "application/pdf", bytes: out }],
      };
    },
  },
);
