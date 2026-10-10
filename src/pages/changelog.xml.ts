import type { APIRoute } from "astro";
import { readFileSync } from "node:fs";
import { marked } from "marked";
import { anchor, sections } from "../../scripts/changelog.mjs";

// RSS 2.0, one item per released version, built from CHANGELOG.md.
export const GET: APIRoute = ({ site }) => {
  const base = new URL("/", site).href;
  const cdata = (html: string) => `<![CDATA[${html.replaceAll("]]>", "]]]]><![CDATA[>")}]]>`;
  const released = sections(readFileSync("CHANGELOG.md", "utf8")).filter((s) => s.date && s.body);
  const items = released.map((s) => {
    const link = `${base}changelog/#${anchor(s.version)}`;
    return `    <item>
      <title>Free the Tools ${s.version}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${new Date(`${s.date}T12:00:00Z`).toUTCString()}</pubDate>
      <description>${cdata(marked.parse(s.body, { async: false }) as string)}</description>
    </item>`;
  });
  const built = released.length ? `\n    <lastBuildDate>${new Date(`${released[0].date}T12:00:00Z`).toUTCString()}</lastBuildDate>` : "";
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Free the Tools: what's new</title>
    <link>${base}changelog/</link>
    <description>New tools, changes and fixes in Free the Tools.</description>
    <language>en</language>${built}
    <atom:link href="${base}changelog.xml" rel="self" type="application/rss+xml"/>
${items.join("\n")}
  </channel>
</rss>
`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
};
