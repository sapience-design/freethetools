// Astro writes the page src/pages/[lang]/404.html.astro as a folder, dist/nb/404.html/index.html.
// Only the root 404 page is written as a file. The Worker fetches /nb/404.html (worker/index.js), so
// this turns each folder into a file. Run by the Astro integration in astro.config.mjs.
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export function languageNotFoundPages(dist) {
  const moved = [];
  for (const name of readdirSync(dist)) {
    const index = join(dist, name, "404.html", "index.html");
    if (!statSync(join(dist, name)).isDirectory() || !existsSync(index)) continue;
    const html = readFileSync(index);
    rmSync(dirname(index), { recursive: true });
    writeFileSync(join(dist, name, "404.html"), html);
    moved.push(`/${name}/404.html`);
  }
  return moved;
}
