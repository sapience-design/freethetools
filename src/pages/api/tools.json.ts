// Machine-readable catalogue for developers and AI agents. Described by openapi.yaml.
import type { APIRoute } from "astro";
import { loadCatalogue, REPO } from "../../data/catalogue";

export const GET: APIRoute = async ({ site }) => {
  const { aisles } = await loadCatalogue();
  const abs = (p: string) => new URL(p, site).href;
  const body = {
    name: "Free the Tools",
    publisher: { name: "Sapience Design", url: "https://sapience.design" },
    description: "Free, open-source tools that run in the browser. Files are never uploaded.",
    license: "AGPL-3.0-only",
    source: REPO,
    categories: aisles.map((a) => ({
      id: a.slug,
      name: a.name,
      url: abs(`/${a.slug}/`),
      description: a.blurb,
      tools: a.live.map((t) => ({
        id: t.id,
        name: t.data.name,
        url: abs(t.url),
        description: t.data.description,
        section: t.data.section,
        keywords: t.data.keywords,
        status: t.data.status,
        offline: t.data.offline,
        added: t.data.added,
        source: `${REPO}/tree/main/tools/${t.id}`,
        cli: t.data.cli ? `${REPO}/tree/main/tools/${t.id}/cli` : null,
        authors: t.data.authors,
      })),
      wanted: a.wanted.map((w) => ({ name: w.name, section: w.section, request: w.url })),
    })),
  };
  return new Response(JSON.stringify(body, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8" } });
};
