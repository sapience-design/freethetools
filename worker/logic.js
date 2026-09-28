// Pure rules for the stats API, kept apart from the Worker so they can be unit-tested.

export const KINDS = ["view", "use", "success", "error"];
export const DEVICES = ["phone", "tablet", "desktop"];

/** UTC day key: "2026-09-28". */
export const dayKey = (date = new Date()) => date.toISOString().slice(0, 10);

// Well-known sources get a readable name; everything else is shown as its bare domain.
const SOURCES = [
  [/(^|\.)google\.[a-z.]+$/, "Google"],
  [/(^|\.)bing\.com$/, "Bing"],
  [/(^|\.)duckduckgo\.com$/, "DuckDuckGo"],
  [/(^|\.)yahoo\.[a-z.]+$/, "Yahoo"],
  [/(^|\.)ecosia\.org$/, "Ecosia"],
  [/(^|\.)kagi\.com$/, "Kagi"],
  [/(^|\.)(chatgpt\.com|openai\.com)$/, "ChatGPT"],
  [/(^|\.)perplexity\.ai$/, "Perplexity"],
  [/(^|\.)claude\.ai$/, "Claude"],
  [/(^|\.)news\.ycombinator\.com$/, "Hacker News"],
  [/(^|\.)reddit\.com$/, "Reddit"],
  [/(^|\.)(t\.co|x\.com|twitter\.com)$/, "X"],
  [/(^|\.)(facebook\.com|fb\.com|l\.facebook\.com)$/, "Facebook"],
  [/(^|\.)(linkedin\.com|lnkd\.in)$/, "LinkedIn"],
  [/(^|\.)producthunt\.com$/, "Product Hunt"],
  [/(^|\.)github\.com$/, "GitHub"],
];

/**
 * Reduce a referrer to a source name. Only the host is ever sent by the page; anything that
 * doesn't look like a plain host name is dropped.
 * @param {unknown} host
 */
export function normalizeRef(host) {
  if (typeof host !== "string" || host === "") return "Direct";
  const h = host.toLowerCase().replace(/^www\./, "");
  if (h.length > 64 || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(h)) return null;
  for (const [re, name] of SOURCES) if (re.test(h)) return name;
  return h;
}

/** Two-letter country code from Cloudflare's network, or "XX" when unknown. */
export const normalizeCountry = (c) => (typeof c === "string" && /^[A-Z]{2}$/.test(c) && c !== "T1" ? c : "XX");

/**
 * Validate an event, like or visit body. Returns a clean object, or throws with a short reason.
 * @param {unknown} body
 * @param {Set<string>} tools known tool ids
 * @param {"event" | "like" | "visit"} type
 */
export function parseBody(body, tools, type) {
  if (!body || typeof body !== "object") throw new Error("bad body");
  if (type === "visit") {
    return { ref: normalizeRef(body.ref ?? ""), device: DEVICES.includes(body.device) ? body.device : null };
  }
  const { tool } = body;
  if (typeof tool !== "string" || !tools.has(tool)) throw new Error("unknown tool");
  if (type === "event") {
    if (!KINDS.includes(body.kind)) throw new Error("unknown kind");
    return { tool, kind: body.kind };
  }
  if (typeof body.on !== "boolean") throw new Error("bad like");
  return { tool, on: body.on };
}

/** Only accept writes from pages on our own site (a browser always sends Origin on POST). */
export function sameOrigin(request) {
  const origin = request.headers.get("Origin");
  return !!origin && origin === new URL(request.url).origin;
}

/** Shape database rows into the public summary. */
export function summarize(rows, dimRows = []) {
  const tools = {};
  for (const r of rows) {
    tools[r.tool] = {
      views: r.views ?? 0, uses: r.uses ?? 0, likes: Math.max(0, r.likes ?? 0), uses30: r.uses30 ?? 0,
      successes: r.successes ?? 0, errors: r.errors ?? 0,
    };
  }
  const lists = { countries: [], referrers: [], devices: [] };
  const key = { country: "countries", referrer: "referrers", device: "devices" };
  let visits30 = 0;
  for (const d of dimRows) {
    if (d.dim === "visit") visits30 += d.n;
    else if (key[d.dim]) lists[key[d.dim]].push([d.key, d.n]);
  }
  for (const list of Object.values(lists)) list.sort((a, b) => b[1] - a[1]);
  const site = { visits30, countries: lists.countries.slice(0, 20), referrers: lists.referrers.slice(0, 20), devices: lists.devices };
  return { tools, site, generated: new Date().toISOString() };
}
