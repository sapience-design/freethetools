import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { decodeJwt, describeClaims, verifyHmac } from "../core.js";

const b64url = (s) => Buffer.from(s).toString("base64url");
function makeJwt(payload, secret = "s3cret", alg = "HS256") {
  const head = b64url(JSON.stringify({ alg, typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

test("decodes header and payload", () => {
  const { header, payload } = decodeJwt(makeJwt({ sub: "ada", name: "Ada Lovelace" }));
  assert.equal(header.alg, "HS256");
  assert.deepEqual(payload, { sub: "ada", name: "Ada Lovelace" });
});

test("explains times and expiry", () => {
  const now = Date.UTC(2026, 8, 28);
  const notes = describeClaims({ exp: now / 1000 - 60, iat: now / 1000 - 3600, sub: "ada" }, now);
  assert.match(notes.find((n) => n.claim === "exp").value, /expired/);
  assert.equal(notes.find((n) => n.claim === "sub").label, "Subject");
});

test("verifies HS256 with the right secret only", async () => {
  const t = makeJwt({ sub: "ada" });
  assert.equal(await verifyHmac(t, "s3cret"), true);
  assert.equal(await verifyHmac(t, "wrong"), false);
});

test("explains malformed tokens", () => {
  assert.throws(() => decodeJwt("abc"), /three parts/);
  assert.throws(() => decodeJwt("!!.!!.!!"), /header/);
});
