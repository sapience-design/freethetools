// Fill PDF Form: read a PDF's form fields and write values back, optionally flattening so the answers
// can no longer be edited. Uses pdf-lib (MIT).
import { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup, PDFOptionList } from "pdf-lib";

async function load(bytes) {
  try { return await PDFDocument.load(bytes); }
  catch (e) {
    if (/encrypted/i.test(String(e?.message))) throw new Error("This PDF is password-protected. Remove the password in your PDF reader first.");
    throw new Error("This file isn't a readable PDF.");
  }
}

/**
 * @param {ArrayBuffer | Uint8Array} bytes
 * @returns {Promise<{ name: string, type: "text" | "checkbox" | "dropdown" | "radio" | "list", value: string | boolean | string[], options?: string[], multiline?: boolean, readOnly: boolean }[]>}
 */
export async function listFields(bytes) {
  const doc = await load(bytes);
  const fields = [];
  for (const f of doc.getForm().getFields()) {
    const base = { name: f.getName(), readOnly: f.isReadOnly() };
    if (f instanceof PDFTextField) fields.push({ ...base, type: "text", value: f.getText() ?? "", multiline: f.isMultiline() });
    else if (f instanceof PDFCheckBox) fields.push({ ...base, type: "checkbox", value: f.isChecked() });
    else if (f instanceof PDFDropdown) fields.push({ ...base, type: "dropdown", value: f.getSelected()[0] ?? "", options: f.getOptions() });
    else if (f instanceof PDFRadioGroup) fields.push({ ...base, type: "radio", value: f.getSelected() ?? "", options: f.getOptions() });
    else if (f instanceof PDFOptionList) fields.push({ ...base, type: "list", value: f.getSelected(), options: f.getOptions() });
    // Buttons and signature fields can't be filled with a value, so they're left alone.
  }
  return fields;
}

/**
 * @param {ArrayBuffer | Uint8Array} bytes
 * @param {Record<string, string | boolean | string[]>} values by field name
 * @param {{ flatten?: boolean }} [opts]
 * @returns {Promise<Uint8Array>}
 */
export async function fillForm(bytes, values, opts = {}) {
  const doc = await load(bytes);
  const form = doc.getForm();
  for (const [name, v] of Object.entries(values)) {
    const f = form.getFieldMaybe(name);
    if (!f || f.isReadOnly()) continue;
    if (f instanceof PDFTextField) f.setText(String(v ?? ""));
    else if (f instanceof PDFCheckBox) (v ? f.check() : f.uncheck());
    else if (f instanceof PDFDropdown) { if (v) f.select(String(v)); else f.clear(); }
    else if (f instanceof PDFRadioGroup) { if (v) f.select(String(v)); else f.clear(); }
    else if (f instanceof PDFOptionList) { const list = Array.isArray(v) ? v : [String(v)]; if (list.length) f.select(list); else f.clear(); }
  }
  form.updateFieldAppearances();
  if (opts.flatten) form.flatten();
  doc.setProducer("Free the Tools (freethetools.com)");
  return doc.save();
}
