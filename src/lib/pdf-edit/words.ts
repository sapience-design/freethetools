// The editor's words, in the language of the page. English is written next to each use; a page in
// another language embeds its translations (ViewerDialog.astro, "ftt-pdfedit"). English pages embed
// nothing, so the editor costs them no extra bytes.
import { txt } from "../ui";

export const T = (key: string, fallback: string, vars: Record<string, string | number> = {}) => txt(key, fallback, vars, "ftt-pdfedit");
