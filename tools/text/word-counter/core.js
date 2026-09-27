// Word Counter: words, characters, sentences, paragraphs and reading/speaking time.
// Words are counted with Intl.Segmenter where available, so Chinese, Japanese and Thai count properly.

const segmenter = typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: "word" }) : null;

/** @param {string} text */
export function countWords(text) {
  if (segmenter) {
    let n = 0;
    for (const s of segmenter.segment(text)) if (s.isWordLike) n++;
    return n;
  }
  const t = text.trim();
  return t ? t.split(/\s+/u).length : 0;
}

/** @param {string} text */
export function stats(text) {
  const words = countWords(text);
  const count = (s) => (typeof Intl !== "undefined" && Intl.Segmenter ? [...new Intl.Segmenter().segment(s)].length : [...s].length);
  const graphemes = count(text);
  const noSpaces = count(text.replace(/\s/gu, ""));
  const sentences = (text.match(/[^.!?…。！？]+[.!?…。！？]+(?=\s|$)|[^.!?…。！？]+$/gu) || []).filter((s) => s.trim()).length;
  const paragraphs = text.split(/\n\s*\n/u).filter((p) => p.trim()).length;
  return {
    words,
    characters: graphemes,
    charactersNoSpaces: noSpaces,
    sentences,
    paragraphs,
    readingMinutes: words ? Math.max(1, Math.round(words / 238)) : 0, // average silent reading speed
    speakingMinutes: words ? Math.max(1, Math.round(words / 150)) : 0,
  };
}
