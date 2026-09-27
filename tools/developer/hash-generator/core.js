// Hash Generator: SHA-1/256/384/512 with the browser's Web Crypto API, plus MD5 for checksums.

export const ALGORITHMS = ["SHA-256", "SHA-512", "SHA-384", "SHA-1", "MD5"];

const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

/**
 * @param {Uint8Array} bytes
 * @param {string} algorithm one of ALGORITHMS
 * @returns {Promise<string>} lowercase hex digest
 */
export async function hash(bytes, algorithm) {
  if (algorithm === "MD5") return md5(bytes);
  if (!ALGORITHMS.includes(algorithm)) throw new Error(`Unknown algorithm "${algorithm}".`);
  return toHex(await crypto.subtle.digest(algorithm, bytes));
}

export const hashText = (text, algorithm) => hash(new TextEncoder().encode(text), algorithm);

// MD5 (RFC 1321). Not secure for passwords or signatures; offered for matching published checksums.
function md5(bytes) {
  const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);
  const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  const len = bytes.length;
  const n = (((len + 8) >> 6) + 1) * 16;
  const w = new Uint32Array(n);
  for (let i = 0; i < len; i++) w[i >> 2] |= bytes[i] << ((i % 4) * 8);
  w[len >> 2] |= 0x80 << ((len % 4) * 8);
  w[n - 2] = (len * 8) >>> 0;
  w[n - 1] = Math.floor((len * 8) / 2 ** 32);
  let [a0, b0, c0, d0] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
  for (let j = 0; j < n; j += 16) {
    let [a, b, c, d] = [a0, b0, c0, d0];
    for (let i = 0; i < 64; i++) {
      let f, g;
      if (i < 16) { f = (b & c) | (~b & d); g = i; }
      else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; }
      else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; }
      else { f = c ^ (b | ~d); g = (7 * i) % 16; }
      const s = S[(i >> 4) * 4 + (i % 4)];
      const t = d; d = c; c = b;
      const x = (a + f + K[i] + w[j + g]) >>> 0;
      b = (b + ((x << s) | (x >>> (32 - s)))) >>> 0;
      a = t;
    }
    a0 = (a0 + a) >>> 0; b0 = (b0 + b) >>> 0; c0 = (c0 + c) >>> 0; d0 = (d0 + d) >>> 0;
  }
  return [a0, b0, c0, d0].map((v) => [0, 8, 16, 24].map((sh) => ((v >>> sh) & 255).toString(16).padStart(2, "0")).join("")).join("");
}
