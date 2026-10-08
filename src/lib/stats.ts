// Anonymous usage totals and likes, from the browser side. Nothing here identifies you: the
// server only adds 1 to a total for the day. Visits, views, uses and outcomes are not sent at
// all if your browser asks sites not to track (Global Privacy Control or Do Not Track).

export type ToolStats = { views: number; uses: number; likes: number; uses30: number; successes: number; errors: number };
export type SiteStats = { visits30: number; countries: [string, number][]; referrers: [string, number][]; devices: [string, number][] };
export type Summary = { tools: Record<string, ToolStats>; site: SiteStats };

const optedOut = () =>
  (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true || navigator.doNotTrack === "1";

function send(path: string, body: object) {
  return fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true });
}

/** Phone, tablet or desktop, from the screen and pointer only. */
function deviceType(): "phone" | "tablet" | "desktop" {
  const uaMobile = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile;
  if (uaMobile) return "phone";
  if (!matchMedia("(pointer: coarse)").matches) return "desktop";
  return Math.min(screen.width, screen.height) >= 600 ? "tablet" : "phone";
}

/**
 * Count one visit per browser session, with the name of the site that sent you (only its host,
 * never the link) and your device type. Moving between pages here is not a new visit.
 */
export function trackVisit() {
  if (optedOut()) return;
  let ref = "";
  try {
    if (document.referrer) {
      const host = new URL(document.referrer).hostname;
      if (host === location.hostname) return; // came from another page on this site
      ref = host;
    }
  } catch {}
  try { if (sessionStorage.getItem("ftt:visit")) return; sessionStorage.setItem("ftt:visit", "1"); } catch { return; }
  send("/api/stats/visit", { ref, device: deviceType() }).catch(() => {});
}

/** Count a view of this tool, once per browser session. */
export function trackView(tool: string) {
  if (optedOut()) return;
  const key = `ftt:v:${tool}`;
  try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, "1"); } catch {}
  send("/api/stats/event", { tool, kind: "view" }).catch(() => {});
}

/** Count a use the first time someone actually works with the tool on this visit. */
export function watchUse(tool: string, root: Element) {
  if (optedOut()) return;
  let done = false;
  const fire = () => {
    if (done) return;
    done = true;
    send("/api/stats/event", { tool, kind: "use" }).catch(() => {});
    for (const t of ["input", "change", "drop", "click"]) root.removeEventListener(t, handler, true);
  };
  const handler = (e: Event) => {
    // A click counts only on buttons and download links; opening a file picker or typing counts too.
    if (e.type === "click" && !(e.target as Element).closest("button, a[download]")) return;
    fire();
  };
  for (const t of ["input", "change", "drop", "click"]) root.addEventListener(t, handler, true);
}

/**
 * Count outcomes: a success when a result is downloaded, shared or copied, an error when a tool reports it
 * couldn't process something (the `ftt:outcome` event). Only the kind is sent, never what or why.
 */
export function watchOutcomes(tool: string, root: Element) {
  if (optedOut()) return;
  let left = 20; // enough for a batch of files, not a flood
  const report = (kind: "success" | "error") => { if (left-- > 0) send("/api/stats/event", { tool, kind }).catch(() => {}); };
  root.addEventListener("click", (e) => {
    const el = (e.target as Element).closest("a[download], button");
    if (!el) return;
    const isCopy = el.tagName === "BUTTON" && (el.id.endsWith("-copy") || el.textContent?.trim() === "Copy");
    const isShare = el.tagName === "BUTTON" && el.classList.contains("share-btn"); // sharing a result counts as taking it
    if (el.tagName === "A" || isCopy || isShare) report("success");
  });
  document.addEventListener("ftt:outcome", (e) => { if ((e as CustomEvent).detail?.ok === false) report("error"); });
}

const LIKED = "ftt:liked";
const likedSet = (): Set<string> => { try { return new Set(JSON.parse(localStorage.getItem(LIKED) || "[]")); } catch { return new Set(); } };

export const isLiked = (tool: string) => likedSet().has(tool);

/** Like or unlike; remembered in this browser so each browser counts once. Returns the new total. */
export async function setLiked(tool: string, on: boolean): Promise<number | null> {
  const set = likedSet();
  on ? set.add(tool) : set.delete(tool);
  try { localStorage.setItem(LIKED, JSON.stringify([...set])); } catch {}
  try {
    const res = await send("/api/stats/like", { tool, on });
    return res.ok ? (await res.json()).likes : null;
  } catch { return null; }
}

let summaryPromise: Promise<Summary | null> | null = null;
/** Everything on /stats, or null when stats aren't available (for example in local development). */
export function fullSummary() {
  summaryPromise ??= fetch("/api/stats/summary")
    .then((r) => (r.ok ? (r.json() as Promise<Summary>) : null))
    .catch(() => null);
  return summaryPromise;
}

/** Totals for every tool, or null when stats aren't available. */
export const summary = () => fullSummary().then((s) => s?.tools ?? null);

const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
export const fmtCount = (n: number) => compact.format(n);
