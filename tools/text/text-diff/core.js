// Text Diff: compare two texts by line or by word, using jsdiff (BSD-3-Clause).
import { diffLines, diffWordsWithSpace } from "diff";

/**
 * @param {string} a original
 * @param {string} b changed
 * @param {"lines" | "words"} mode
 * @returns {{ parts: { value: string, added: boolean, removed: boolean }[], added: number, removed: number }}
 */
export function compare(a, b, mode = "lines") {
  const parts = (mode === "words" ? diffWordsWithSpace(a, b) : diffLines(a, b)).map((p) => ({
    value: p.value,
    added: !!p.added,
    removed: !!p.removed,
  }));
  const unit = mode === "words" ? (s) => s.split(/\s+/).filter(Boolean).length : (s) => s.split("\n").filter((l, i, arr) => l !== "" || i < arr.length - 1).length;
  return {
    parts,
    added: parts.filter((p) => p.added).reduce((n, p) => n + unit(p.value), 0),
    removed: parts.filter((p) => p.removed).reduce((n, p) => n + unit(p.value), 0),
  };
}
