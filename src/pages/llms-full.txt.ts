// llms-full.txt (https://llmstxt.org): everything a language model needs about every tool, in one
// plain-text file. llms.txt is the short index; this is the full version.
import type { APIRoute } from "astro";
import { loadCatalogue, REPO } from "../data/catalogue";

export const GET: APIRoute = async ({ site }) => {
  const { aisles } = await loadCatalogue();
  const abs = (p: string) => new URL(p, site).href;
  const lines = [
    "# Free the Tools: every tool in full",
    "",
    "> Free, open-source tools that run entirely in the browser. Files are never uploaded: every page's Content Security Policy blocks connections to other servers. No sign-up, no ads, no tracking of people. A Sapience Design initiative (https://sapience.design), licensed AGPL-3.0.",
    "",
    `Short index: ${abs("/llms.txt")}. AI assistant setup as Markdown: ${abs("/ai.md")}. Machine-readable catalogue: ${abs("/api/tools.json")} (schema: ${REPO}/blob/main/openapi.yaml). Source code: ${REPO}.`,
    "",
    "## How to use the tools from an AI assistant",
    "",
    "- On the person's computer: the npm package `freethetools` runs an MCP server and a command line with the same tools. Claude Code: `claude mcp add freethetools -- npx -y freethetools mcp`. Without MCP: `npx -y freethetools run <tool> '<json>'`. Files are paths; results are saved in a \"freethetools\" folder in the home folder. Nothing is uploaded. Published on npm (https://www.npmjs.com/package/freethetools) and listed in the official MCP Registry (https://registry.modelcontextprotocol.io/) as io.github.sapience-design/freethetools.",
    "- In a browser with WebMCP (Chrome and Edge origin trials): each tool page registers its tools for agents in the browser.",
    "- There is no hosted MCP server, because the files would have to be uploaded.",
    "",
  ];
  for (const a of aisles) {
    lines.push(`## ${a.name}`, "", a.blurb, "");
    for (const t of a.live) {
      const d = t.data;
      lines.push(`### ${d.name}: ${d.task}`, "", `URL: ${abs(t.url)}`, `Added: ${d.added}`, "", d.description, "");
      if (d.tagline) lines.push(d.tagline, "");
      if (d.keywords?.length) lines.push(`Also called: ${d.keywords.join(", ")}.`, "");
      const specs = Object.entries(d.specs ?? {});
      if (specs.length) {
        lines.push("Details:", "");
        for (const [k, v] of specs) lines.push(`- ${k}: ${v}`);
        lines.push("");
      }
      if (d.faq?.length) {
        lines.push("Questions:", "");
        for (const f of d.faq) lines.push(`- Q: ${f.q}`, `  A: ${f.a}`);
        lines.push("");
      }
    }
    if (a.wanted.length) lines.push(`Not built yet (open requests): ${a.wanted.map((w) => w.name).join(", ")}.`, "");
  }
  lines.push(
    "## About the project",
    "",
    `- About: ${abs("/about/")}`,
    `- Privacy: ${abs("/privacy/")}`,
    `- Usage stats and exactly what is counted: ${abs("/stats/")}`,
    `- Contributing: ${REPO}/blob/main/CONTRIBUTING.md`,
    "",
  );
  return new Response(lines.join("\n"), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
