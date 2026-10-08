// Site search: typo-tolerant, prefix-matching search over the catalogue with MiniSearch (MIT).
// Runs in the browser; the index is built from a small JSON list embedded in the home page.
import MiniSearch from "minisearch";

/**
 * @param {{ n: string, t?: string, c: string, g?: string, u: string, k: string, w?: 1 }[]} items
 *   n name, t task ("Make a PDF smaller"), c group, g group slug, u url, k keywords, w planned
 * @returns {(query: string) => { n: string, t?: string, c: string, g?: string, u: string, w?: 1 }[]}
 */
// Filler words that appear in nearly every description ("Nothing is uploaded", "your files")
// and would make any query match everything.
const STOP = new Set("a an and are as at be by for from in into is it its of on or the this to with your you nothing never never leave leaves uploaded upload free browser device files file page make my i want need".split(" "));

export function makeSearch(items) {
  const ms = new MiniSearch({
    fields: ["n", "t", "k", "c"],
    processTerm: (term) => {
      const t = term.toLowerCase();
      return STOP.has(t) ? null : t;
    },
    storeFields: ["n", "t", "c", "g", "u", "w"],
    // Typos: none for 1-3 letters, up to two edits (a swapped pair counts as two) for 4-6, 30% beyond.
    // A word people are still typing ("compres") outranks a near-miss spelling ("compare").
    searchOptions: { boost: { n: 3, t: 1.5, k: 1, c: 0.5 }, weights: { fuzzy: 0.2, prefix: 0.6 }, prefix: true, fuzzy: (term) => (term.length < 4 ? false : term.length < 7 ? 2 : 0.3) },
  });
  ms.addAll(items.map((it, id) => ({ id, ...it })));
  return (query) => {
    const q = query.trim();
    if (!q) return [];
    // Prefer tools matching every word; fall back to any word so a long query still finds something.
    let hits = ms.search(q, { combineWith: "AND" });
    if (!hits.length) hits = ms.search(q, { combineWith: "OR" });
    // Tools you can use now come before planned ones, then by relevance.
    return hits.sort((a, b) => (a.w ?? 0) - (b.w ?? 0) || b.score - a.score).map(({ n, t, c, g, u, w }) => ({ n, t, c, g, u, w }));
  };
}
