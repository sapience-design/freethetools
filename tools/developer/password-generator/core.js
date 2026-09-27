// Password Generator: random passwords and passphrases from the browser's secure random source,
// with no modulo bias, and an honest strength estimate in bits of entropy.

const SETS = {
  lower: "abcdefghijkmnopqrstuvwxyz",
  upper: "ABCDEFGHJKLMNPQRSTUVWXYZ",
  digits: "23456789",
  symbols: "!#$%&*+-=?@^_~",
};
const SIMILAR = { lower: "l", upper: "IO", digits: "01" };

/** Unbiased random integer in [0, n). */
export function randomInt(n) {
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf); while (buf[0] >= limit);
  return buf[0] % n;
}

/**
 * @param {{ length?: number, lower?: boolean, upper?: boolean, digits?: boolean, symbols?: boolean, similar?: boolean }} opts
 */
export function password(opts = {}) {
  const { length = 20, lower = true, upper = true, digits = true, symbols = true, similar = false } = opts;
  const chosen = Object.entries({ lower, upper, digits, symbols }).filter(([, on]) => on).map(([k]) => SETS[k] + (similar ? SIMILAR[k] ?? "" : ""));
  if (!chosen.length) throw new Error("Choose at least one kind of character.");
  if (length < chosen.length || length > 256) throw new Error(`Choose a length between ${chosen.length} and 256.`);
  const all = chosen.join("");
  // One from each chosen set, the rest from all, then shuffle (Fisher-Yates).
  const chars = chosen.map((s) => s[randomInt(s.length)]);
  while (chars.length < length) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) { const j = randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return { value: chars.join(""), bits: Math.round(length * Math.log2(all.length)) };
}

/** @param {string[]} words @param {{ count?: number, separator?: string, capitalize?: boolean, number?: boolean }} opts */
export function passphrase(words, opts = {}) {
  const { count = 5, separator = "-", capitalize = false, number = false } = opts;
  if (count < 3 || count > 12) throw new Error("Choose 3 to 12 words.");
  const picked = Array.from({ length: count }, () => {
    const w = words[randomInt(words.length)];
    return capitalize ? w[0].toUpperCase() + w.slice(1) : w;
  });
  if (number) picked.push(String(randomInt(100)));
  return { value: picked.join(separator), bits: Math.round(count * Math.log2(words.length) + (number ? Math.log2(100) : 0)) };
}

/** Plain-language strength from entropy bits. */
export function strength(bits) {
  if (bits < 50) return "Weak";
  if (bits < 70) return "Fair";
  if (bits < 100) return "Strong";
  return "Very strong";
}
