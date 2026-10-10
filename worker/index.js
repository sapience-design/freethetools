// The only server code on freethetools.com: anonymous usage totals, likes and "I want this" votes
// at /api/stats/*, and the suggestion form at /api/feedback, which sends one email.
// Everything else is a static file served by Cloudflare without running this Worker.
//
// Stored: per tool, per UTC day, counts of views, uses, successes, errors and likes; and per
// UTC day, site-wide counts of visits (one per browser session), countries, referring sites
// and device types; and per planned tool per UTC day, the count of "I want this" votes. Each breakdown is a separate counter, never linked to another or to a tool. Not stored: IP addresses, cookies,
// user agents, full referrer links, or anything that could identify a person. See /stats/.
import { EmailMessage } from "cloudflare:email";
import { EVENT_CEILING, FEEDBACK_MAX_BODY, LIKE_LIMIT, WANT_LIMIT, buildEmail, canRefetchTools, dayKey, normalizeCountry, parseBody, parseFeedback, sampleRateFor, sameOrigin, summarize } from "./logic.js";

// The only address the site writes to. Mail comes from a name on the same domain, which Email Routing sends from.
const FEEDBACK_FROM = "forms@freethetools.com";
const FEEDBACK_TO = "hello@freethetools.com";

const COLUMNS = { view: "views", use: "uses", success: "successes", error: "errors" };

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
let knownTools = null; // cached per isolate
let knownWanted = null; // ids of planned tools, from the same file
let toolsFetchedAt = 0;
let rateCache = { at: 0, rate: 1 }; // sampling rate, cached per isolate for a minute

async function loadTools(env, url) {
  toolsFetchedAt = Date.now();
  const res = await env.ASSETS.fetch(new URL("/api/tools.json", url));
  const cat = await res.json();
  knownTools = new Set(cat.categories.flatMap((c) => c.tools.map((t) => t.id)));
  knownWanted = new Set(cat.categories.flatMap((c) => (c.wanted ?? []).map((w) => w.id)));
}

// A deploy can add a tool while an old isolate lives on. If an id is missing, look again,
// but at most once a minute per isolate, so unknown ids cannot make us fetch in a loop.
async function tools(env, url, id) {
  if (!knownTools) await loadTools(env, url);
  else if (typeof id === "string" && !knownTools.has(id) && !knownWanted.has(id) && canRefetchTools(Date.now(), toolsFetchedAt)) await loadTools(env, url);
  return knownTools;
}

async function wantedTools(env, url, id) {
  await tools(env, url, id);
  return knownWanted;
}

async function currentRate(env) {
  if (Date.now() - rateCache.at > 60000) {
    const since = dayKey(new Date(Date.now() - 7 * 86400000));
    const row = await env.DB.prepare("SELECT SUM(n) AS n FROM dims WHERE dim = 'visit' AND day >= ?").bind(since).first();
    rateCache = { at: Date.now(), rate: sampleRateFor((row?.n ?? 0) / 7) };
  }
  return rateCache.rate;
}

async function readBody(request) {
  const text = await request.text();
  if (text.length > 300) throw new Error("too large");
  return JSON.parse(text);
}

async function stats(request, env, ctx, url) {
  const path = url.pathname.replace(/\/+$/, "");
  // Branch previews have no database binding, so they never touch the real totals.
  if (!env.DB) return new Response(null, { status: 503 });

  if (path === "/api/stats/summary" && request.method === "GET") {
    const cache = caches.default;
    const cached = await cache.match(request);
    if (cached) return cached;
    const since = dayKey(new Date(Date.now() - 30 * 86400000));
    const since7 = dayKey(new Date(Date.now() - 7 * 86400000));
    const [counts, dims, recent, wants] = await env.DB.batch([
      env.DB.prepare(
        "SELECT tool, SUM(views) AS views, SUM(uses) AS uses, SUM(likes) AS likes, SUM(successes) AS successes, SUM(errors) AS errors, SUM(CASE WHEN day >= ? THEN uses ELSE 0 END) AS uses30 FROM counts GROUP BY tool",
      ).bind(since),
      env.DB.prepare("SELECT dim, key, SUM(n) AS n FROM dims WHERE day >= ? GROUP BY dim, key").bind(since),
      env.DB.prepare("SELECT SUM(n) AS n FROM dims WHERE dim = 'visit' AND day >= ?").bind(since7),
      env.DB.prepare("SELECT tool, SUM(n) AS n FROM wants GROUP BY tool"),
    ]);
    const body = summarize(counts.results, dims.results, recent.results[0]?.n ?? 0, wants.results);
    const res = new Response(JSON.stringify(body), { headers: { ...JSON_HEADERS, "Cache-Control": "public, max-age=60" } });
    ctx.waitUntil(cache.put(request, res.clone()));
    return res;
  }

  if (request.method !== "POST") return new Response(null, { status: 405 });
  if (!sameOrigin(request)) return new Response(null, { status: 403 });

  try {
    const body = await readBody(request);
    const known = await tools(env, url, body?.tool);
    if (path === "/api/stats/event") {
      const { tool, kind, weight } = parseBody(body, known, "event", await currentRate(env));
      const col = COLUMNS[kind];
      // Each daily counter stops at a ceiling, so a script cannot push a tool up without bound.
      ctx.waitUntil(
        env.DB.prepare(`INSERT INTO counts (tool, day, ${col}) VALUES (?, ?, MIN(${EVENT_CEILING}, ?)) ON CONFLICT(tool, day) DO UPDATE SET ${col} = MIN(${EVENT_CEILING}, ${col} + excluded.${col})`)
          .bind(tool, dayKey(), weight).run(),
      );
      return new Response(null, { status: 204 });
    }
    if (path === "/api/stats/visit") {
      // One per browser session. Each breakdown is its own counter, so they can't be combined.
      const { ref, device, weight } = parseBody(body, known, "visit", await currentRate(env));
      const day = dayKey();
      const dims = [["visit", "all"], ["country", normalizeCountry(request.cf?.country)], ["referrer", ref], ["device", device]];
      const upsert = env.DB.prepare("INSERT INTO dims (day, dim, key, n) VALUES (?, ?, ?, ?) ON CONFLICT(day, dim, key) DO UPDATE SET n = n + excluded.n");
      ctx.waitUntil(env.DB.batch(dims.filter(([, key]) => key).map(([dim, key]) => upsert.bind(day, dim, key, weight))));
      return new Response(null, { status: 204 });
    }
    if (path === "/api/stats/want") {
      // Only planned tools can be wanted. The browser sends one vote per tool; the ceiling stops a script.
      const { tool } = parseBody(body, await wantedTools(env, url, body?.tool), "want");
      await env.DB.prepare(`INSERT INTO wants (tool, day, n) VALUES (?, ?, 1) ON CONFLICT(tool, day) DO UPDATE SET n = MIN(${WANT_LIMIT}, n + 1)`)
        .bind(tool, dayKey()).run();
      const row = await env.DB.prepare("SELECT SUM(n) AS n FROM wants WHERE tool = ?").bind(tool).first();
      return new Response(JSON.stringify({ wants: row?.n ?? 0 }), { headers: JSON_HEADERS });
    }
    if (path === "/api/stats/like") {
      const { tool, on } = parseBody(body, known, "like");
      const delta = on ? 1 : -1;
      await env.DB.prepare(`INSERT INTO counts (tool, day, likes) VALUES (?, ?, ?) ON CONFLICT(tool, day) DO UPDATE SET likes = MAX(-${LIKE_LIMIT}, MIN(${LIKE_LIMIT}, likes + excluded.likes))`)
        .bind(tool, dayKey(), delta).run();
      const row = await env.DB.prepare("SELECT SUM(likes) AS likes FROM counts WHERE tool = ?").bind(tool).first();
      return new Response(JSON.stringify({ likes: Math.max(0, row?.likes ?? 0) }), { headers: JSON_HEADERS });
    }
  } catch {
    return new Response(null, { status: 400 });
  }
  return new Response(null, { status: 404 });
}

// A suggestion or problem report becomes one plain-text email. Nothing is stored here.
async function feedback(request, env) {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  let fb;
  try {
    const text = await request.text();
    if (text.length > FEEDBACK_MAX_BODY) return new Response(null, { status: 413 });
    fb = parseFeedback(JSON.parse(text));
  } catch {
    return new Response(null, { status: 400 });
  }
  if (fb.spam) return new Response(null, { status: 204 }); // a bot filled the hidden field: say nothing
  // Local development and previews have no mail binding. The page then offers a mailto link.
  if (!env.FEEDBACK) return new Response(null, { status: 503 });
  try {
    const raw = buildEmail(fb, { from: FEEDBACK_FROM, to: FEEDBACK_TO, date: new Date(), id: crypto.randomUUID() });
    await env.FEEDBACK.send(new EmailMessage(FEEDBACK_FROM, FEEDBACK_TO, raw));
  } catch {
    return new Response(null, { status: 502 });
  }
  return new Response(null, { status: 204 });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/stats/")) return stats(request, env, ctx, url);
    if (url.pathname.replace(/\/+$/, "") === "/api/feedback") return feedback(request, env);
    // Anything else reaching the Worker had no matching static file: serve the site's 404 page,
    // in the language of the address when that language has one (/nb/404.html).
    const lang = /^\/([a-z]{2,3})\//.exec(url.pathname)?.[1];
    let page = lang ? await env.ASSETS.fetch(new URL(`/${lang}/404.html`, url)) : null;
    if (!page?.ok) page = await env.ASSETS.fetch(new URL("/404.html", url));
    return new Response(page.body, { status: 404, headers: page.headers });
  },
};
