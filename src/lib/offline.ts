// Offline use. A service worker (/sw.js, built by scripts/build-sw.mjs) keeps pages and files
// from this site so that tools opened before keep working without a connection.

/** Registers the service worker in the production site. Does nothing in `npm run dev`. */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  const register = () => navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  if (document.readyState === "complete") register(); else addEventListener("load", register, { once: true });
}

/** True when the service worker is serving this page, so the page is kept for offline use. */
export function isOfflineReady() {
  return "serviceWorker" in navigator && !!navigator.serviceWorker.controller;
}
