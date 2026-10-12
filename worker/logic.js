// Pure rules for the stats API, kept apart from the Worker so they can be unit-tested.

export const KINDS = ["view", "use", "success", "error"];
export const DEVICES = ["phone", "tablet", "desktop"];

/** Most keys a request body may have. Real bodies have at most three. */
export const MAX_KEYS = 5;
/** A tool's likes for one UTC day stay within plus or minus this. */
export const LIKE_LIMIT = 500;
/** A planned tool's "I want this" votes for one UTC day stop here. */
export const WANT_LIMIT = 1000;
/** Per tool per day, each event counter stops counting here. */
export const EVENT_CEILING = 100000;
/** A search term's count for one UTC day stops here, so one person cannot inflate a term. */
export const SEARCH_LIMIT = 200;
/** A term is published only with at least this many searches in 30 days... */
export const SEARCH_MIN_TOTAL = 5;
/** ...seen on at least this many different days. */
export const SEARCH_MIN_DAYS = 3;
/** Most terms in the public list. */
export const SEARCH_LIST_MAX = 20;
/**
 * Phrases never shown on /stats/, even past the thresholds. The thresholds stop one-off and personal
 * text, not someone who searches the same phrase on purpose over several days: add any such phrase
 * here, normalized (lowercase, single spaces), and it disappears at the next deploy.
 */
export const HIDDEN_SEARCHES = new Set([]);
/** Largest sampling weight the Worker accepts. */
export const MAX_WEIGHT = 20;
/** Fetch the tool list again at most this often (milliseconds), when an unknown id arrives. */
export const TOOL_REFRESH_MS = 60000;

/** UTC day key: "2026-09-28". */
export const dayKey = (date = new Date()) => date.toISOString().slice(0, 10);

// Well-known sources get a readable name; everything else is shown as its bare domain.
const SOURCES = [
  [/(^|\.)gemini\.google\.com$/, "Gemini"],
  [/(^|\.)google\.[a-z.]+$/, "Google"],
  [/(^|\.)bing\.com$/, "Bing"],
  [/(^|\.)duckduckgo\.com$/, "DuckDuckGo"],
  [/(^|\.)yahoo\.[a-z.]+$/, "Yahoo"],
  [/(^|\.)ecosia\.org$/, "Ecosia"],
  [/(^|\.)kagi\.com$/, "Kagi"],
  [/(^|\.)(chatgpt\.com|chat\.openai\.com|openai\.com)$/, "ChatGPT"],
  [/(^|\.)perplexity\.ai$/, "Perplexity"],
  [/(^|\.)claude\.ai$/, "Claude"],
  [/(^|\.)copilot\.microsoft\.com$/, "Copilot"],
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

/**
 * A search term the site may count, or null. Trim, lowercase, collapse spaces; 2 to 40 characters,
 * at most 6 words; only letters of any script, spaces, hyphens, apostrophes, "+" and "&". A digit,
 * "@", "/", "\\", ":" or "." (or anything else) drops the whole term, which keeps out emails,
 * phone numbers, links, file names and IDs. The browser applies the same rules; this one decides.
 * @param {unknown} term
 */
export function normalizeSearch(term) {
  if (typeof term !== "string" || term.length > 200) return null;
  const t = term.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");
  if (t.length < 2 || t.length > 40 || t.split(" ").length > 6) return null;
  return /^[\p{L}\p{M} '’&+-]+$/u.test(t) && /\p{L}/u.test(t) ? t : null;
}

/** Two-letter country code from Cloudflare's network, or "XX" when unknown. */
export const normalizeCountry = (c) => (typeof c === "string" && /^[A-Z]{2}$/.test(c) && c !== "T1" ? c : "XX");

/**
 * How many real visits one counted visit stands for, from the last 7 days' average daily visits.
 * Above about 25,000 visits a day the free D1 plan runs out of writes, so we count a sample.
 * @param {number} avgDailyVisits
 */
export function sampleRateFor(avgDailyVisits) {
  const n = Number(avgDailyVisits);
  if (!(n >= 15000)) return 1;
  if (n >= 100000) return 20;
  if (n >= 40000) return 10;
  return 5;
}

/**
 * The weight to add for one request: the sent weight if it is a whole number from 1 to 20 and
 * equals the current server rate; otherwise 1.
 * @param {unknown} sent
 * @param {number} rate
 */
export function cleanWeight(sent, rate) {
  return Number.isInteger(sent) && sent >= 1 && sent <= MAX_WEIGHT && sent === rate ? sent : 1;
}

/** True when the tool list may be fetched again: never within a minute of the last fetch. */
export const canRefetchTools = (now, lastFetch) => now - lastFetch >= TOOL_REFRESH_MS;

/**
 * Validate an event, like or visit body. Returns a clean object, or throws with a short reason.
 * @param {unknown} body
 * @param {Set<string>} tools known tool ids (for "want": the ids of planned tools)
 * @param {"event" | "like" | "visit" | "want" | "search"} type
 * @param {number} [rate] current sampling rate for this kind of request (1 means no sampling)
 */
export function parseBody(body, tools, type, rate = 1) {
  if (!body || typeof body !== "object") throw new Error("bad body");
  if (Object.keys(body).length > MAX_KEYS) throw new Error("too many keys");
  if (type === "search") {
    const term = normalizeSearch(body.term);
    if (!term) throw new Error("bad term");
    return { term, weight: cleanWeight(body.weight, rate) };
  }
  if (type === "visit") {
    return { ref: normalizeRef(body.ref ?? ""), device: DEVICES.includes(body.device) ? body.device : null, weight: cleanWeight(body.weight, rate) };
  }
  const { tool } = body;
  if (typeof tool !== "string" || !tools.has(tool)) throw new Error("unknown tool");
  if (type === "want") return { tool };
  if (type === "event") {
    if (!KINDS.includes(body.kind)) throw new Error("unknown kind");
    return { tool, kind: body.kind, weight: cleanWeight(body.weight, rate) };
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
export function summarize(rows, dimRows = [], visits7 = 0, wantRows = [], searchRows = []) {
  const tools = {};
  for (const r of rows) {
    tools[r.tool] = {
      views: r.views ?? 0, uses: r.uses ?? 0, likes: Math.max(0, r.likes ?? 0), uses30: r.uses30 ?? 0,
      successes: r.successes ?? 0, errors: r.errors ?? 0,
    };
  }
  const wants = {};
  for (const r of wantRows) wants[r.tool] = Math.max(0, r.n ?? 0);
  const lists = { countries: [], referrers: [], devices: [] };
  const key = { country: "countries", referrer: "referrers", device: "devices" };
  let visits30 = 0;
  for (const d of dimRows) {
    if (d.dim === "visit") visits30 += d.n;
    else if (key[d.dim]) lists[key[d.dim]].push([d.key, d.n]);
  }
  for (const list of Object.values(lists)) list.sort((a, b) => b[1] - a[1]);
  // Searches that found nothing: shown only when often enough and on enough different days.
  const searches = searchRows
    .filter((r) => r.n >= SEARCH_MIN_TOTAL && r.days >= SEARCH_MIN_DAYS && normalizeSearch(r.key) === r.key && !HIDDEN_SEARCHES.has(r.key))
    .sort((a, b) => b.n - a.n || (a.key < b.key ? -1 : 1))
    .slice(0, SEARCH_LIST_MAX)
    .map((r) => [r.key, r.n]);
  const site = { visits30, countries: lists.countries.slice(0, 20), referrers: lists.referrers.slice(0, 20), devices: lists.devices, searches };
  const rate = sampleRateFor(visits7 / 7);
  return { tools, wants, site, sample: { visits: rate, events: rate }, generated: new Date().toISOString() };
}

// ---- Suggestions and problem reports (POST /api/feedback) ----

/** Largest request body the feedback endpoint reads, in characters. */
export const FEEDBACK_MAX_BODY = 6144;
export const MESSAGE_MIN = 10;
export const MESSAGE_MAX = 2000;
const USE_MAX = 300;
const TOOL_MAX = 100;
const EMAIL_MAX = 254;
/** No spaces, quotes, brackets or commas, so an address can never smuggle in a header or a second recipient. */
const EMAIL_RE = /^[^\s@<>()[\],;:"\\]+@[^\s@<>()[\],;:"\\]+\.[^\s@<>()[\],;:"\\]{2,}$/;

const PAGE_MAX = 200;
const SEARCH_MAX = 100;
/** A path on this site ("/pdf/compress/"): no scheme, host or query, and no "//", so it can only ever point here. */
const PAGE_RE = /^\/(?!\/)[A-Za-z0-9\-._~/%]*$/;
/** A site language code: "en", "nb", "es", "pt". */
const LANG_RE = /^[a-z]{2,3}$/;

/** Text with control characters removed (tabs and new lines kept when `lines` is true). */
const clean = (v, lines) => String(v).replace(lines ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g, "").trim();

/**
 * Check a feedback body. Returns { spam: true } when the hidden "website" field is filled (a bot),
 * otherwise a clean { kind, message, use, tool, email, page, search, lang }. Throws with a short
 * reason when it is bad. The context (page, search, lang) is dropped, not refused, when it does not
 * fit its pattern: a stray value must never cost a real suggestion.
 * @param {unknown} body
 */
export function parseFeedback(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("bad body");
  if (Object.keys(body).length > 10) throw new Error("too many keys");
  const b = /** @type {Record<string, unknown>} */ (body);
  if (typeof b.website === "string" ? b.website !== "" : b.website != null) return { spam: true };
  if (b.kind !== "suggestion" && b.kind !== "problem") throw new Error("bad kind");
  if (typeof b.message !== "string") throw new Error("bad message");
  const message = clean(b.message.replace(/\r\n?/g, "\n"), true);
  if (message.length < MESSAGE_MIN) throw new Error("message too short");
  if (message.length > MESSAGE_MAX) throw new Error("message too long");
  const text = (key, max) => {
    const v = b[key];
    if (v == null || v === "") return "";
    if (typeof v !== "string") throw new Error(`bad ${key}`);
    const out = clean(v.replace(/\s+/g, " "), false);
    if (out.length > max) throw new Error(`${key} too long`);
    return out;
  };
  const email = text("email", EMAIL_MAX);
  if (email && !EMAIL_RE.test(email)) throw new Error("bad email");
  const use = b.kind === "suggestion" ? text("use", USE_MAX) : "";
  // Where the person was when they wrote: shown to them in the form before they send.
  const context = (key, max, re) => {
    const v = b[key];
    if (typeof v !== "string") return "";
    const out = clean(v.replace(/\s+/g, " "), false);
    return out.length <= max && (!re || re.test(out)) ? out : "";
  };
  return {
    kind: b.kind, message, use, tool: text("tool", TOOL_MAX), email,
    page: context("page", PAGE_MAX, PAGE_RE), search: context("search", SEARCH_MAX), lang: context("lang", 3, LANG_RE),
  };
}

/**
 * The subject line opens with the message, so an inbox reads like a list of requests:
 * "Suggestion: Passport image resize", "Suggestion for pdf/merge: Keep bookmarks",
 * "Problem in pdf/merge: The download does nothing".
 */
export function feedbackSubject({ kind, tool, message }) {
  const words = snippet(message, 60);
  if (kind === "problem") return tool ? `Problem in ${tool}: ${words}` : `Problem: ${words}`;
  return tool ? `Suggestion for ${tool}: ${words}` : `Suggestion: ${words}`;
}

// Base64 of UTF-8 text, in the 76-character lines mail expects.
const b64 = (text) => {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/.{1,76}/g, "$&\r\n").trimEnd();
};
// A header value with non-ASCII characters is sent as an RFC 2047 encoded word.
const header = (text) => (/^[\x20-\x7e]*$/.test(text) ? text : `=?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(text)))}?=`);

/** The plain-text body of the email, in the words of the form. The source of truth: the HTML part shows the same. */
export function feedbackBody({ kind, message, use, tool, email, page, search, lang }) {
  const lines = [kind === "problem" ? "Kind: problem report" : "Kind: suggestion"];
  lines.push(`Tool: ${tool || "(none given)"}`, `Reply to: ${email || "(no email given)"}`);
  if (page) lines.push(`Page: ${page}`);
  if (search) lines.push(`Searched for: ${search}`);
  if (lang) lines.push(`Language: ${lang}`);
  lines.push("");
  lines.push(kind === "problem" ? "What went wrong?" : "What should it do?", message);
  if (kind === "suggestion") lines.push("", "What do you use today?", use || "(not answered)");
  return lines.join("\n") + "\n";
}

/** Text made safe as HTML text and inside a quoted attribute. Every visitor value passes through it. */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const SITE = "https://freethetools.com";
// The site's colours (src/styles/global.css), set inline: mail apps drop <style> blocks.
const INK = "#1d1b16", SOFT = "#4b473f", MUTED = "#6a655b", PAPER = "#fbf8f2", HL = "#ffe27a", PICK = "#fff3ca", HAIR = "#e6e0d4";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * The same message as feedbackBody, laid out like the site: cream paper, an ink-outlined card, the
 * yellow mark. Every value from the visitor is escaped; the page link can only point at this site
 * (parseFeedback allows a path only) and the reply link only at an address with no quotes or spaces.
 * @param {ReturnType<typeof parseFeedback>} fb a result that is not spam
 */
export function feedbackHtml(fb) {
  const problem = fb.kind === "problem";
  const muted = (text) => `<span style="color:${MUTED};">${text}</span>`;
  const row = (label, value) =>
    `<tr><td style="padding:8px 12px 8px 0;border-top:1px solid ${HAIR};color:${MUTED};vertical-align:top;width:38%;">${label}</td>` +
    `<td style="padding:8px 0;border-top:1px solid ${HAIR};vertical-align:top;">${value}</td></tr>`;
  const link = (href, text) => `<a href="${href}" style="color:${INK};">${text}</a>`;
  const rows = [
    !problem && row("What do you use today?", fb.use ? esc(fb.use) : muted("Not answered")),
    row("Tool", fb.tool ? esc(fb.tool) : muted("None given")),
    row("Reply to", fb.email ? link(`mailto:${esc(fb.email)}`, esc(fb.email)) : muted("No email given")),
    fb.page && row("Page", link(`${SITE}${esc(fb.page)}`, esc(fb.page))),
    fb.search && row("Searched for", esc(fb.search)),
    fb.lang && row("Language", esc(fb.lang)),
  ].filter(Boolean).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(feedbackSubject(fb))}</title></head>
<body style="margin:0;padding:0;background:${PAPER};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;font-family:${FONT};color:${INK};">
<tr><td style="padding:0 2px 14px;"><span style="display:inline-block;padding:3px 10px;background:${HL};border:1.5px solid ${INK};border-radius:8px;font-size:15px;font-weight:700;">Free the Tools</span></td></tr>
<tr><td style="padding:22px;background:#ffffff;border:1.5px solid ${INK};border-radius:14px;box-shadow:0 3px 0 ${INK};">
<p style="margin:0 0 6px;font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${SOFT};">${problem ? "Problem report" : "New suggestion"}</p>
<h1 style="margin:0 0 14px;font-size:22px;line-height:1.25;font-weight:700;">${problem ? "What went wrong?" : "What should it do?"}</h1>
<div style="padding:14px 16px;background:${PICK};border-radius:10px;font-size:16px;line-height:1.5;">${esc(fb.message).replace(/\n/g, "<br>")}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;font-size:15px;line-height:1.4;color:${INK};">${rows}</table>
</td></tr>
<tr><td style="padding:14px 2px 0;font-size:13px;line-height:1.5;color:${MUTED};">${fb.email ? "Reply to this email to answer the visitor." : "The visitor left no email address."} Sent by the form at ${link(`${SITE}/suggest/`, "freethetools.com/suggest")}.</td></tr>
</table></td></tr></table>
</body></html>
`;
}

/**
 * An RFC 5322 message with two parts: the plain text (feedbackBody, the source of truth) and the
 * same in the site's look (feedbackHtml). UTF-8 and base64 throughout. Every header value was
 * cleaned of line breaks by parseFeedback, and the Reply-To address cannot hold spaces or commas.
 * The boundary is built from the message id; base64 never contains "--", so no part can end early.
 * @param {ReturnType<typeof parseFeedback>} fb a result that is not spam
 * @param {{ from: string, to: string, date: Date, id: string }} env
 */
export function buildEmail(fb, { from, to, date, id }) {
  const domain = from.split("@")[1];
  const boundary = `ftt-${String(id).replace(/[^A-Za-z0-9-]/g, "")}`;
  const headers = [
    `From: Free the Tools <${from}>`,
    `To: ${to}`,
    ...(fb.email ? [`Reply-To: ${fb.email}`] : []),
    `Subject: ${header(feedbackSubject(fb))}`,
    `Date: ${date.toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <${id}@${domain}>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  const part = (type, text) => [`--${boundary}`, `Content-Type: ${type}; charset=UTF-8`, "Content-Transfer-Encoding: base64", "", b64(text)].join("\r\n");
  return headers.join("\r\n") + "\r\n\r\n" + [part("text/plain", feedbackBody(fb)), part("text/html", feedbackHtml(fb)), `--${boundary}--`].join("\r\n") + "\r\n";
}

// ---- Delivery: email and a private GitHub issue ----

const ZWSP = "​";
/** Text that is safe inside a code span or fence: backticks become modifier letters, so nothing can close the block. */
const defang = (text) => String(text).replace(/`/g, "ˋ");
/** First `max` characters (whole code points), on one line. */
const oneLine = (text, max) => [...String(text).replace(/\s+/g, " ").trim()].slice(0, max).join("");
/** Like oneLine, but a cut text ends at a word, with "…". For a subject a person reads. */
function snippet(text, max) {
  const all = [...String(text ?? "").replace(/\s+/g, " ").trim()];
  if (all.length <= max) return all.join("");
  const cut = all.slice(0, max).join("");
  const space = cut.lastIndexOf(" ");
  return (space > max * 0.6 ? cut.slice(0, space) : cut) + "…";
}

/**
 * The GitHub issue for one message. The sender's email address, and anything else that identifies
 * them, is never part of it: the address stays in the email, as Reply-To. The message, the tool
 * and the "what do you use today" answer sit in code spans or a fence with backticks neutralised,
 * so they cannot mention a person, make a link or load an image. The title is one line.
 * @param {ReturnType<typeof parseFeedback>} fb a result that is not spam
 * @returns {{ title: string, body: string, labels: string[] }}
 */
export function buildIssue(fb) {
  const problem = fb.kind === "problem";
  // "@" followed by a zero-width space cannot form a mention, even where a title is rendered.
  const title = (problem ? "Problem: " : "Suggestion: ") + defang(oneLine(fb.message, 60)).replace(/@/g, `@${ZWSP}`);
  const lines = [
    `**Kind:** ${problem ? "problem report" : "suggestion"}`,
    `**Tool:** ${fb.tool ? `\`${defang(fb.tool)}\`` : "(none given)"}`,
    ...(fb.page ? [`**Page:** \`${defang(fb.page)}\``] : []),
    ...(fb.search ? [`**Searched for:** \`${defang(fb.search)}\``] : []),
    ...(fb.lang ? [`**Language:** \`${defang(fb.lang)}\``] : []),
    "",
    `**${problem ? "What went wrong?" : "What should it do?"}**`,
    "```text",
    defang(String(fb.message).slice(0, MESSAGE_MAX)),
    "```",
  ];
  if (!problem) lines.push("", "**What do you use today?**", fb.use ? `\`${defang(fb.use)}\`` : "(not answered)");
  return { title, body: lines.join("\n") + "\n", labels: [problem ? "problem" : "suggestion", "needs triage"] };
}

/**
 * One plain email address ("name@example.com"), or "" when the value is not one. The suggestion
 * email goes to the address in the FEEDBACK_TO secret; a space, line break or angle bracket would
 * let it add mail headers, so anything but a single plain address is refused.
 */
export const cleanMailbox = (v) => (typeof v === "string" && v.length <= 254 && /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(v) ? v : "");

/** "owner/name" as GitHub names a repository, or "" when the value is not one. */
export const cleanRepo = (v) => (typeof v === "string" && /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(v) && !v.split("/").some((p) => /^\.+$/.test(p)) ? v : "");

/**
 * Run the configured channels together. A channel is { name, send }; send() rejects on failure.
 * Delivered when at least one succeeds: 204. All failed: 502. None configured: 503.
 * @param {{ name: string, send: () => Promise<unknown> }[]} channels only the configured ones
 * @returns {Promise<{ status: 204 | 502 | 503, failed: { name: string, reason: string }[] }>}
 */
export async function deliver(channels) {
  if (!channels.length) return { status: 503, failed: [] };
  const results = await Promise.allSettled(channels.map((c) => Promise.resolve().then(c.send)));
  const failed = [];
  results.forEach((r, i) => {
    if (r.status === "rejected") failed.push({ name: channels[i].name, reason: String(r.reason?.message ?? r.reason).slice(0, 120) });
  });
  return { status: failed.length < channels.length ? 204 : 502, failed };
}

/** The body of /api/health from dims rows ({ key, n }) of dim "fail". */
export function healthBody(rows = []) {
  const n = (key) => Math.max(0, rows.find((r) => r.key === key)?.n ?? 0);
  return { feedbackFailures: { email: n("feedback-email"), github: n("feedback-github") } };
}
