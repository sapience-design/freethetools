// Share images for link previews, written at build time: /og/site.png, /og/<group>.png and
// /og/<group>/<tool>.png. See src/lib/og.js.
import type { APIRoute, GetStaticPaths } from "astro";
import { loadCatalogue } from "../../data/catalogue";
import { artFor } from "../../data/art";
import { ogPng } from "../../lib/og.js";

type Card = { eyebrow: string; title: string; text: string; art: string; group?: string };

export const getStaticPaths: GetStaticPaths = async () => {
  const { tools, aisles } = await loadCatalogue();
  const site: Card = {
    eyebrow: "A Sapience initiative",
    title: "Simple tools for your files.",
    text: `${tools.length} free, open-source tools that work inside your browser.`,
    art: artFor("pdf/compress", "pdf", "ogsite"),
    group: "",
  };
  return [
    { params: { slug: "site" }, props: site },
    ...aisles.filter((a) => a.live.length).map((a) => ({
      params: { slug: a.slug },
      props: { eyebrow: `${a.live.length} free tools`, title: a.label, text: a.blurb, art: artFor(a.shot, a.slug, `og${a.slug}`), group: a.slug },
    })),
    ...tools.map((t) => ({
      params: { slug: t.id },
      props: {
        eyebrow: t.data.name,
        title: t.data.task,
        text: t.data.tagline,
        art: artFor(t.id, t.category.slug, `og${t.id.replace(/\W/g, "")}`, t.data.name),
        group: t.category.slug,
      },
    })),
  ];
};

export const GET: APIRoute = async ({ props }) => {
  const png = await ogPng(props as Card);
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png" } });
};
