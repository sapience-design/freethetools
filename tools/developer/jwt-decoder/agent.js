import { defineTools } from "../../../src/agent/contract.js";
import { decodeJwt, describeClaims, verifyHmac } from "./core.js";

export default defineTools({
  name: "decode_jwt",
  title: "JWT Decoder",
  description:
    "Decode a JSON Web Token: header, payload, the standard claims in plain words (including whether it has expired), and, given the shared secret, whether an HS256/384/512 signature is valid. Runs on this device; nothing is uploaded.",
  input: {
    type: "object",
    properties: {
      token: { type: "string", minLength: 1, description: "The token: header.payload.signature" },
      secret: { type: "string", description: "Optional shared secret, to check an HMAC signature." },
    },
    required: ["token"],
    additionalProperties: false,
  },
  example: { token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMiLCJleHAiOjE3MDAwMDAwMDB9.c2ln" },
  run: async ({ token, secret }) => {
    const { header, payload } = decodeJwt(token);
    let signature = "not checked: no secret given";
    if (secret !== undefined) {
      const ok = await verifyHmac(token, secret);
      signature = ok === null ? `not checked: ${header.alg ?? "this"} is not an HMAC algorithm` : ok ? "valid" : "invalid";
    }
    const claims = describeClaims(payload);
    const exp = claims.find((c) => c.claim === "exp");
    return {
      summary: `Algorithm ${header.alg ?? "none"}${exp ? `, ${exp.value.split(" · ")[1] ?? "has an expiry"}` : ""}. Signature ${signature}.`,
      data: { header, payload, claims, signature },
    };
  },
});
