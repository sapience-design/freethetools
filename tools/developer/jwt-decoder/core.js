// JWT Decoder: split a JSON Web Token into header and payload, explain the standard claims, and
// verify HMAC (HS256/384/512) signatures when you provide the secret. Nothing leaves the page.
import { base64ToBytes } from "../base64/core.js";

const utf8 = (bytes) => new TextDecoder().decode(bytes);

/** @param {string} token */
export function decodeJwt(token) {
  const parts = token.trim().split(".");
  if (parts.length !== 3) throw new Error("A JWT has three parts separated by dots: header.payload.signature");
  let header, payload;
  try { header = JSON.parse(utf8(base64ToBytes(parts[0]))); } catch { throw new Error("The header isn't valid Base64-encoded JSON."); }
  try { payload = JSON.parse(utf8(base64ToBytes(parts[1]))); } catch { throw new Error("The payload isn't valid Base64-encoded JSON."); }
  return { header, payload, signature: parts[2], signingInput: `${parts[0]}.${parts[1]}` };
}

const CLAIMS = { iss: "Issuer", sub: "Subject", aud: "Audience", exp: "Expires", nbf: "Not before", iat: "Issued at", jti: "Token ID" };

/** Human-readable notes on the registered claims, including whether the token has expired. */
export function describeClaims(payload, now = Date.now()) {
  const notes = [];
  for (const [k, label] of Object.entries(CLAIMS)) {
    if (!(k in payload)) continue;
    const v = payload[k];
    if (["exp", "nbf", "iat"].includes(k) && typeof v === "number") {
      const when = new Date(v * 1000);
      let state = "";
      if (k === "exp") state = v * 1000 < now ? " · expired" : " · still valid";
      if (k === "nbf" && v * 1000 > now) state = " · not valid yet";
      notes.push({ claim: k, label, value: `${when.toISOString().replace(".000", "")}${state}` });
    } else notes.push({ claim: k, label, value: Array.isArray(v) ? v.join(", ") : String(v) });
  }
  return notes;
}

/** Verify an HS256/384/512 signature with a shared secret. Returns null for other algorithms. */
export async function verifyHmac(token, secret) {
  const { header, signature, signingInput } = decodeJwt(token);
  const hash = { HS256: "SHA-256", HS384: "SHA-384", HS512: "SHA-512" }[header.alg];
  if (!hash) return null;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash }, false, ["verify"]);
  return crypto.subtle.verify("HMAC", key, base64ToBytes(signature), new TextEncoder().encode(signingInput));
}
