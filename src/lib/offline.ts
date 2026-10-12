// Offline use. A service worker (/sw.js, built by scripts/build-sw.mjs) keeps pages and files
// from this site so that tools opened before keep working without a connection, and keeps the whole
// site when the visitor asks for it (/offline-use/) or installs the app.
import { txt } from "./ui";

/** True when the page runs as an installed app (its own window or the Home Screen). */
export const isInstalledApp = () =>
  matchMedia("(display-mode: standalone), (display-mode: window-controls-overlay), (display-mode: minimal-ui)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** What to download with everything else: the Compress PDF engine on computers, not on phones. */
export const engineByDefault = () => !matchMedia("(pointer: coarse)").matches;

/** Sends a message to the worker in charge. Resolves false when there is none (dev, old browser). */
export async function tellWorker(msg: Record<string, unknown>): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false;
  const reg = await navigator.serviceWorker.getRegistration().catch(() => undefined);
  const active = reg?.active;
  if (!active) return false;
  active.postMessage(msg);
  return true;
}

/** Registers the service worker in the production site. Does nothing in `npm run dev`. */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  const register = () =>
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).then(afterRegister, () => {});
  if (document.readyState === "complete") register(); else addEventListener("load", register, { once: true });
}

function afterRegister(reg: ServiceWorkerRegistration) {
  watchForUpdates(reg);
  const lang = document.documentElement.lang || "en";
  // An installed app keeps the whole site, once, unless the visitor removed it on /offline-use/.
  // On the app's first start the worker may still be installing: wait until it is ready.
  const auto = () => navigator.serviceWorker.ready.then(() => tellWorker({ type: "auto", lang, engine: engineByDefault() }));
  if (isInstalledApp()) auto();
  addEventListener("appinstalled", auto);
  // Finish a full copy that was cut short, at most every ten minutes and only online.
  const finish = () => {
    if (!navigator.onLine) return;
    try {
      const last = Number(sessionStorage.getItem("ftt:sync") || 0);
      if (Date.now() - last < 10 * 60 * 1000) return;
      sessionStorage.setItem("ftt:sync", String(Date.now()));
    } catch {}
    tellWorker({ type: "sync", quiet: true });
  };
  finish();
  addEventListener("online", finish);
}

// ---- A new version: a note in the bottom right corner offers to reload ----
const HOUR = 60 * 60 * 1000;

function watchForUpdates(reg: ServiceWorkerRegistration) {
  const offer = () => { if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting); };
  offer();
  reg.addEventListener("updatefound", () => {
    const next = reg.installing;
    next?.addEventListener("statechange", () => { if (next.state === "installed") offer(); });
  });
  // An open window (an installed app often stays open for days) checks for a new version every
  // hour, and when it comes back into view after an hour.
  let last = Date.now();
  const check = () => {
    if (document.visibilityState !== "visible" || !navigator.onLine || Date.now() - last < HOUR) return;
    last = Date.now();
    reg.update().catch(() => {});
  };
  setInterval(check, 5 * 60 * 1000);
  document.addEventListener("visibilitychange", check);
}

function showUpdate(waiting: ServiceWorker) {
  const box = document.getElementById("update-note");
  if (!box || box.childElementCount) return;
  const text = document.createElement("p");
  text.textContent = txt("updateReady", "A new version is ready.");
  const reload = document.createElement("button");
  reload.type = "button";
  reload.className = "btn small";
  reload.textContent = txt("updateReload", "Reload");
  const later = document.createElement("button");
  later.type = "button";
  later.className = "btn quiet small";
  later.textContent = txt("updateLater", "Later");
  reload.addEventListener("click", () => {
    reload.disabled = true;
    // The new version takes over, then this page loads again with it. If the switch does not
    // come (another tab already made it), reload anyway.
    navigator.serviceWorker.addEventListener("controllerchange", () => location.reload(), { once: true });
    waiting.postMessage({ type: "skip-waiting" });
    setTimeout(() => location.reload(), 3000);
  });
  later.addEventListener("click", () => box.replaceChildren());
  box.replaceChildren(text, reload, later);
}

/** True when the service worker is serving this page, so the page is kept for offline use. */
export function isOfflineReady() {
  return "serviceWorker" in navigator && !!navigator.serviceWorker.controller;
}
