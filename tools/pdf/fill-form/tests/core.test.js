import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { listFields, fillForm } from "../core.js";

async function makeForm() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const form = doc.getForm();
  form.createTextField("name").addToPage(page, { x: 50, y: 700, width: 200, height: 20 });
  form.createCheckBox("agree").addToPage(page, { x: 50, y: 650, width: 15, height: 15 });
  const dd = form.createDropdown("country");
  dd.addOptions(["Norway", "Sweden"]);
  dd.addToPage(page, { x: 50, y: 600, width: 120, height: 20 });
  const rg = form.createRadioGroup("size");
  rg.addOptionToPage("S", page, { x: 50, y: 550, width: 15, height: 15 });
  rg.addOptionToPage("L", page, { x: 80, y: 550, width: 15, height: 15 });
  return doc.save();
}

test("lists text, checkbox, dropdown and radio fields", async () => {
  const fields = await listFields(await makeForm());
  assert.deepEqual(fields.map((f) => [f.name, f.type]), [["name", "text"], ["agree", "checkbox"], ["country", "dropdown"], ["size", "radio"]]);
  assert.deepEqual(fields.find((f) => f.name === "country").options, ["Norway", "Sweden"]);
});

test("fills values that read back correctly", async () => {
  const out = await fillForm(await makeForm(), { name: "Ada Lovelace", agree: true, country: "Norway", size: "L" });
  const fields = Object.fromEntries((await listFields(out)).map((f) => [f.name, f.value]));
  assert.deepEqual(fields, { name: "Ada Lovelace", agree: true, country: "Norway", size: "L" });
});

test("flattening removes the fields but keeps the page", async () => {
  const out = await fillForm(await makeForm(), { name: "Ada" }, { flatten: true });
  const doc = await PDFDocument.load(out);
  assert.equal(doc.getForm().getFields().length, 0);
  assert.equal(doc.getPageCount(), 1);
});

test("a PDF without a form lists no fields", async () => {
  const doc = await PDFDocument.create();
  doc.addPage();
  assert.deepEqual(await listFields(await doc.save()), []);
});
