// Anonymous usage totals and likes, from the browser side. Nothing here identifies you: the
// server only adds 1 to a tool's total for the day. Views and uses are not sent at all if your
// browser asks sites not to track (Global Privacy Control or Do Not Track).

export type ToolStats = { views: number; uses: number; likes: number; uses30: number };

const optedOut = () =>
  (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true || navigator.doNotTrack === "1";

function send(path: string, body: object) {
  return fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true });
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

let summaryPromise: Promise<Record<string, ToolStats> | null> | null = null;
/** Totals for every tool, or null when stats aren't available (for example in local development). */
export function summary() {
  summaryPromise ??= fetch("/api/stats/summary")
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => (j ? (j.tools as Record<string, ToolStats>) : null))
    .catch(() => null);
  return summaryPromise;
}

const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
export const fmtCount = (n: number) => compact.format(n);
