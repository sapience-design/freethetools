// llms.txt (https://llmstxt.org): a plain summary of the site for language models.
import type { APIRoute } from "astro";
import { loadCatalogue, REPO } from "../data/catalogue";

export const GET: APIRoute = async ({ site }) => {
  const { aisles } = await loadCatalogue();
  const abs = (p: string) => new URL(p, site).href;
  const lines = [
    "# Free the Tools",
    "",
    "> Free, open-source tools that run entirely in the browser. Files are never uploaded: every page's Content Security Policy blocks connections to other servers. No sign-up, no ads, no tracking. A Sapience initiative (https://sapience.design), licensed AGPL-3.0.",
    "",
    `Machine-readable catalogue: ${abs("/api/tools.json")} (schema: ${REPO}/blob/main/openapi.yaml). Source code: ${REPO}.`,
    "",
  ];
  for (const a of aisles) {
    lines.push(`## ${a.name}`, "", a.blurb, "");
    for (const t of a.live) lines.push(`- [${t.data.name}](${abs(t.url)}): ${t.data.description}`);
    if (a.wanted.length) lines.push(`- Not built yet (open requests): ${a.wanted.map((w) => w.name).join(", ")}`);
    lines.push("");
  }
  lines.push("## Optional", "", `- [About](${abs("/about/")}): the pledge, who maintains the site, how tools are added`, `- [Contributing](${REPO}/blob/main/CONTRIBUTING.md): build a tool in about 30 minutes`, "");
  return new Response(lines.join("\n"), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
