// Pure rules for the stats API, kept apart from the Worker so they can be unit-tested.

export const KINDS = ["view", "use"];

/** UTC day key: "2026-09-28". */
export const dayKey = (date = new Date()) => date.toISOString().slice(0, 10);

/**
 * Validate an event or like body. Returns a clean object, or throws with a short reason.
 * @param {unknown} body
 * @param {Set<string>} tools known tool ids
 * @param {"event" | "like"} type
 */
export function parseBody(body, tools, type) {
  if (!body || typeof body !== "object") throw new Error("bad body");
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
export function summarize(rows) {
  const tools = {};
  for (const r of rows) tools[r.tool] = { views: r.views ?? 0, uses: r.uses ?? 0, likes: Math.max(0, r.likes ?? 0), uses30: r.uses30 ?? 0 };
  return { tools, generated: new Date().toISOString() };
}
