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
/** Largest sampling weight the Worker accepts. */
export const MAX_WEIGHT = 20;
/** Fetch the tool list again at most this often (milliseconds), when an unknown id arrives. */
export const TOOL_REFRESH_MS = 60000;

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
 * @param {"event" | "like" | "visit" | "want"} type
 * @param {number} [rate] current sampling rate for this kind of request (1 means no sampling)
 */
export function parseBody(body, tools, type, rate = 1) {
  if (!body || typeof body !== "object") throw new Error("bad body");
  if (Object.keys(body).length > MAX_KEYS) throw new Error("too many keys");
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
export function summarize(rows, dimRows = [], visits7 = 0, wantRows = []) {
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
  const site = { visits30, countries: lists.countries.slice(0, 20), referrers: lists.referrers.slice(0, 20), devices: lists.devices };
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

/** Text with control characters removed (tabs and new lines kept when `lines` is true). */
const clean = (v, lines) => String(v).replace(lines ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g, "").trim();

/**
 * Check a feedback body. Returns { spam: true } when the hidden "website" field is filled (a bot),
 * otherwise a clean { kind, message, use, tool, email }. Throws with a short reason when it is bad.
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
  return { kind: b.kind, message, use, tool: text("tool", TOOL_MAX), email };
}

/** The subject line: "Suggestion: pdf/page-delete", "Suggestion: new tool" or "Problem: pdf/merge". */
export const feedbackSubject = ({ kind, tool }) =>
  kind === "problem" ? `Problem: ${tool || "the site"}` : `Suggestion: ${tool || "new tool"}`;

// Base64 of UTF-8 text, in the 76-character lines mail expects.
const b64 = (text) => {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/.{1,76}/g, "$&\r\n").trimEnd();
};
// A header value with non-ASCII characters is sent as an RFC 2047 encoded word.
const header = (text) => (/^[\x20-\x7e]*$/.test(text) ? text : `=?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(text)))}?=`);

/** The plain-text body of the email, in the words of the form. */
export function feedbackBody({ kind, message, use, tool, email }) {
  const lines = [kind === "problem" ? "Kind: problem report" : "Kind: suggestion"];
  lines.push(`Tool: ${tool || "(none given)"}`, `Reply to: ${email || "(no email given)"}`, "");
  lines.push(kind === "problem" ? "What went wrong?" : "What should it do?", message);
  if (kind === "suggestion") lines.push("", "What do you use today?", use || "(not answered)");
  return lines.join("\n") + "\n";
}

/**
 * A minimal RFC 5322 message: plain text, UTF-8, base64 body. Every value in a header was cleaned
 * of line breaks by parseFeedback, and the Reply-To address cannot hold spaces or commas.
 * @param {ReturnType<typeof parseFeedback>} fb a result that is not spam
 * @param {{ from: string, to: string, date: Date, id: string }} env
 */
export function buildEmail(fb, { from, to, date, id }) {
  const domain = from.split("@")[1];
  const headers = [
    `From: Free the Tools <${from}>`,
    `To: ${to}`,
    ...(fb.email ? [`Reply-To: ${fb.email}`] : []),
    `Subject: ${header(feedbackSubject(fb))}`,
    `Date: ${date.toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <${id}@${domain}>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
  ];
  return headers.join("\r\n") + "\r\n\r\n" + b64(feedbackBody(fb)) + "\r\n";
}
