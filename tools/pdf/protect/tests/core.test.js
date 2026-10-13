import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { DEFAULT_ALLOW, allowsEverything, encryptArgs, passwordProblem, protectPdf, protectedSentence, randomOwner } from "../core.js";
import { unlockPdf } from "../../unlock/core.js";
import { OPEN_PASSWORD, plain, qpdf, withPassword, withRestrictions } from "../../unlock/tests/helpers.js";

const shown = async (bytes, password) => (await qpdf(["--show-encryption", `--password=${password}`, "/in.pdf"], bytes)).lines.join("\n");

test("the default lets people print, and nothing else", () => {
  assert.deepEqual(DEFAULT_ALLOW, { print: true, copy: false, edit: false });
  assert.deepEqual(encryptArgs({ password: "pw" }), ["--encrypt", "pw", "pw", "256", "--print=full", "--extract=n", "--modify=none", "--", "/in.pdf", "/out.pdf"]);
});

test("each checkbox maps to one qpdf option", () => {
  const args = (allow) => encryptArgs({ password: "pw", allow }).slice(4, 7);
  assert.deepEqual(args({ print: false }), ["--print=none", "--extract=n", "--modify=none"]);
  assert.deepEqual(args({ copy: true }), ["--print=full", "--extract=y", "--modify=none"]);
  assert.deepEqual(args({ edit: true }), ["--print=full", "--extract=n", "--modify=all"]);
  assert.deepEqual(args({ print: true, copy: true, edit: true }), ["--print=full", "--extract=y", "--modify=all"]);
});

test("a separate owner password goes second, and a password with odd characters stays one argument", () => {
  const a = encryptArgs({ password: "open me --x", owner: "boss" });
  assert.deepEqual(a.slice(0, 4), ["--encrypt", "open me --x", "boss", "256"]);
  assert.equal(a.filter((x) => x === "--").length, 1);
});

test("an empty password is refused", async () => {
  assert.throws(() => encryptArgs({ password: "" }), /password is needed/);
  assert.equal((await protectPdf(async () => assert.fail("qpdf must not run"), plain, { password: "" })).status, "no-password");
});

test("the two boxes must match", () => {
  assert.equal(passwordProblem("a", "a"), "");
  assert.match(passwordProblem("", ""), /Type a password/);
  assert.match(passwordProblem("a", "b"), /don't match/);
  assert.match(passwordProblem("a", ""), /don't match/);
});

test("the sentence says what is allowed", () => {
  assert.match(protectedSentence(), /People can print, but not copy text and change the file/);
  assert.match(protectedSentence({ print: false }), /People can't print, copy text and change the file/);
  assert.match(protectedSentence({ print: true, copy: true, edit: true }), /no limits/);
  assert.equal(allowsEverything({ print: true, copy: true, edit: true }), true);
  assert.equal(allowsEverything(), false);
});

test("a random owner password is long and different each time", () => {
  assert.notEqual(randomOwner(), randomOwner());
  assert.match(randomOwner(), /^[0-9a-f]{48}$/);
});

test("a protected file is encrypted with 256-bit AES and opens only with the password", async () => {
  const r = await protectPdf(qpdf, plain, { password: "s3cret", allow: DEFAULT_ALLOW });
  assert.equal(r.status, "protected");
  await assert.rejects(PDFDocument.load(r.bytes), /encrypted/i);
  const text = await shown(r.bytes, "s3cret");
  assert.match(text, /R = 6/);
  assert.match(text, /AESv3/);
  assert.match(text, /extract for any purpose: not allowed/);
  assert.match(text, /print high resolution: allowed/);
  assert.match(text, /modify other: not allowed/);
  assert.equal((await unlockPdf(qpdf, r.bytes, "")).status, "needs-password");
  assert.equal((await unlockPdf(qpdf, r.bytes, "wrong")).status, "wrong-password");
  const opened = await unlockPdf(qpdf, r.bytes, "s3cret");
  assert.equal(opened.status, "unlocked");
  assert.equal((await PDFDocument.load(opened.bytes)).getPageCount(), (await PDFDocument.load(plain)).getPageCount());
});

test("the limits hold only with a separate owner password", async () => {
  const r = await protectPdf(qpdf, plain, { password: "s3cret", owner: randomOwner(), allow: { print: false } });
  const text = await shown(r.bytes, "s3cret");
  assert.match(text, /Supplied password is user password/);
  assert.match(text, /print high resolution: not allowed/);
  // With the same password for both, the person who opens the file is the owner: the limits do nothing.
  const same = await protectPdf(qpdf, plain, { password: "s3cret", allow: { print: false } });
  assert.match(await shown(same.bytes, "s3cret"), /Supplied password is owner password/);
});

test("a PDF that is already locked is refused, with no output", async () => {
  assert.deepEqual(await protectPdf(qpdf, withPassword, { password: "x" }), { status: "locked" });
  assert.deepEqual(await protectPdf(qpdf, withRestrictions, { password: "x" }), { status: "locked" });
});

test("something that is not a PDF is reported as damaged", async () => {
  assert.deepEqual(await protectPdf(qpdf, new TextEncoder().encode("not a pdf"), { password: "x" }), { status: "damaged" });
});

test("qpdf is asked twice, and the password is only in the encrypt call", async () => {
  const calls = [];
  const spy = async (args, input) => { calls.push(args); return qpdf(args, input); };
  await protectPdf(spy, plain, { password: OPEN_PASSWORD });
  assert.equal(calls.length, 2);
  assert.ok(!calls[0].join(" ").includes(OPEN_PASSWORD));
  assert.equal(calls[1][0], "--encrypt");
});

test("a password that starts with a dash is refused with a reason, since qpdf would read it as an option", async () => {
  assert.match(passwordProblem("-secret", "-secret"), /can't start with a dash/);
  assert.throws(() => encryptArgs({ password: "--print=none" }), /can't start with a dash/);
  // A dash later in the password is fine, and the file opens with it.
  const r = await protectPdf(qpdf, plain, { password: "se-cret", owner: randomOwner() });
  assert.equal(r.status, "protected");
  const { status } = await unlockPdf(qpdf, r.bytes, "se-cret");
  assert.equal(status, "unlocked");
});
