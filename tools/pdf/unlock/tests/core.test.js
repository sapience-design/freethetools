import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { decryptArgs, inspectArgs, listWords, readInspection, removedSentence, restrictionsFrom, unlockPdf } from "../core.js";
import { OPEN_PASSWORD, OWNER_PASSWORD, encrypt, plain, qpdf, withPassword, withPasswordRc4, withRestrictions } from "./helpers.js";

const pages = async (bytes) => (await PDFDocument.load(bytes)).getPageCount();

test("arguments carry the password only when there is one", () => {
  assert.deepEqual(inspectArgs(), ["--show-encryption", "/in.pdf"]);
  assert.deepEqual(inspectArgs("pw"), ["--show-encryption", "--password=pw", "/in.pdf"]);
  assert.deepEqual(decryptArgs(), ["--decrypt", "/in.pdf", "/out.pdf"]);
  assert.deepEqual(decryptArgs("--odd pw"), ["--decrypt", "--password=--odd pw", "/in.pdf", "/out.pdf"]);
});

test("qpdf's words are read, not its exit code (this build exits 2 for three different cases)", () => {
  assert.deepEqual(readInspection({ code: 2, lines: ["qpdf: /in.pdf: invalid password"] }), { kind: "password" });
  assert.deepEqual(readInspection({ code: 0, lines: ["File is not encrypted"] }), { kind: "none" });
  assert.deepEqual(readInspection({ code: 2, lines: ["WARNING: /in.pdf: can't find PDF header", "qpdf: /in.pdf: can't find startxref"] }), { kind: "damaged" });
  assert.deepEqual(readInspection({ code: 2, lines: [] }), { kind: "damaged" });
  const shown = ["R = 6", "User password = ", "Supplied password is user password", "print low resolution: not allowed", "print high resolution: not allowed", "extract for any purpose: not allowed", "modify forms: allowed"];
  assert.deepEqual(readInspection({ code: 0, lines: shown }), { kind: "restricted", restrictions: ["printing", "copying text and images"], as: "user" });
  assert.equal(readInspection({ code: 3, lines: [...shown, "Supplied password is owner password"] }).as, "owner");
});

test("restrictions are named in plain words, once each", () => {
  assert.deepEqual(
    restrictionsFrom(["modify other: not allowed", "modify anything: not allowed", "modify annotations: not allowed", "something new: not allowed", "print low resolution: allowed"]),
    ["adding comments and notes", "editing", "something new"],
  );
  assert.equal(listWords(["a", "b", "c"]), "a, b and c");
  assert.equal(listWords(["a"]), "a");
  assert.equal(removedSentence("password", []), "Removed the password.");
  assert.equal(removedSentence("restrictions", ["printing", "editing"]), "Removed the restrictions on printing and editing.");
  assert.equal(removedSentence("restrictions", []), "Removed the encryption, which set no restrictions.");
  assert.equal(removedSentence("password", ["printing"]), "Removed the password and the restrictions on printing.");
});

test("the fixtures are what they claim to be", async () => {
  assert.deepEqual(readInspection(await qpdf(inspectArgs(), plain)), { kind: "none" });
  assert.equal(readInspection(await qpdf(inspectArgs(), withPassword)).kind, "password");
  assert.equal(readInspection(await qpdf(inspectArgs("nope"), withPassword)).kind, "password");
  assert.equal(readInspection(await qpdf(inspectArgs(OPEN_PASSWORD), withPassword)).kind, "restricted");
  const r = readInspection(await qpdf(inspectArgs(), withRestrictions));
  assert.equal(r.kind, "restricted");
  for (const word of ["printing", "copying text and images", "editing"]) assert.ok(r.restrictions.includes(word), `${word} in ${r.restrictions.join()}`);
  await assert.rejects(PDFDocument.load(withPassword), /encrypted/);
});

test("the right password unlocks, losslessly", async () => {
  const r = await unlockPdf(qpdf, withPassword, OPEN_PASSWORD);
  assert.equal(r.status, "unlocked");
  assert.equal(r.lock, "password");
  assert.equal(await pages(r.bytes), await pages(plain));
  assert.deepEqual(readInspection(await qpdf(inspectArgs(), r.bytes)), { kind: "none" });
});

test("the owner password also unlocks", async () => {
  assert.equal((await unlockPdf(qpdf, withPassword, OWNER_PASSWORD)).status, "unlocked");
});

test("old 40-bit files unlock too", async () => {
  const r = await unlockPdf(qpdf, withPasswordRc4, OPEN_PASSWORD);
  assert.equal(r.status, "unlocked");
  assert.equal(await pages(r.bytes), await pages(plain));
});

test("no password, or a wrong one, says which", async () => {
  assert.deepEqual(await unlockPdf(qpdf, withPassword), { status: "needs-password" });
  assert.deepEqual(await unlockPdf(qpdf, withPassword, "wrong"), { status: "wrong-password" });
  assert.deepEqual(await unlockPdf(qpdf, withPassword, ""), { status: "needs-password" });
});

test("restrictions-only files unlock with no password and say what was removed", async () => {
  const r = await unlockPdf(qpdf, withRestrictions);
  assert.equal(r.status, "unlocked");
  assert.equal(r.lock, "restrictions");
  assert.ok(r.restrictions.includes("printing"));
  assert.equal(await pages(r.bytes), await pages(plain));
  assert.deepEqual(readInspection(await qpdf(inspectArgs(), r.bytes)), { kind: "none" });
});

test("a plain PDF is not locked, and garbage is damaged", async () => {
  assert.deepEqual(await unlockPdf(qpdf, plain), { status: "not-locked" });
  assert.deepEqual(await unlockPdf(qpdf, new TextEncoder().encode("not a pdf at all")), { status: "damaged" });
  assert.deepEqual(await unlockPdf(qpdf, new Uint8Array()), { status: "damaged" });
});

test("an engine that cannot run is an error, and one that makes no output is a damaged file", async () => {
  const broken = async () => { throw new Error("boom"); };
  await assert.rejects(unlockPdf(broken, withPassword, "x"), /boom/);
  const noOutput = async (args) => (args[0] === "--decrypt" ? { code: 2, lines: [] } : { code: 0, lines: ["R = 6", "Supplied password is user password"] });
  assert.deepEqual(await unlockPdf(noOutput, withPassword, "x"), { status: "damaged" });
});

test("forms are kept", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage();
  doc.getForm().createTextField("name").addToPage(page, { x: 50, y: 700 });
  doc.addPage();
  const locked = await encrypt(await doc.save(), "pw", "own", "256");
  const back = await PDFDocument.load((await unlockPdf(qpdf, locked, "pw")).bytes);
  assert.equal(back.getPageCount(), 2);
  assert.deepEqual(back.getForm().getFields().map((f) => f.getName()), ["name"]);
});
