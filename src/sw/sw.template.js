// Free the Tools service worker. scripts/build-sw.mjs fills in VERSION and SHELL and writes
// dist/sw.js after each build. See docs/adr/0010-service-worker-offline.md.
//
// Same-origin GET requests only. One cache per build; the old ones are deleted on activate.
const VERSION = "__VERSION__";
const SHELL = __SHELL__;
const CACHE = "ftt-" + VERSION;
const OFFLINE = "/offline/";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE);
        // Not addAll: one missing file must not stop the worker from installing.
        await Promise.all(SHELL.map((path) => cache.add(path).catch(() => {})));
      } catch {
        // Storage is denied or full. The site still works online.
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const names = await caches.keys();
        await Promise.all(names.filter((n) => n.startsWith("ftt-") && n !== CACHE).map((n) => caches.delete(n)));
      } catch {}
      // No clients.claim(): taking over a page mid-load aborts its cross-document view transition
      // (see Base.astro). A first visit is served by the network; the worker
      // controls the page from the next navigation, and a worker that replaces an older one
      // already controls the open pages.
    })(),
  );
});

async function put(cacheKey, response) {
  // Only whole, successful, non-redirected answers are worth keeping.
  if (!response.ok || response.redirected || response.status !== 200) return;
  try {
    const cache = await caches.open(CACHE);
    await cache.put(cacheKey, response);
  } catch {}
}

async function lookup(key) {
  try {
    return await caches.match(key, { ignoreSearch: true });
  } catch {
    return undefined;
  }
}

async function networkFirst(request, key) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      put(key, response.clone());
      return response;
    }
    if (response.status < 500) return response;
    return (await lookup(key)) || response;
  } catch {
    return (await lookup(key)) || (await lookup(OFFLINE)) || Response.error();
  }
}

async function cacheFirst(request, key) {
  const hit = await lookup(key);
  if (hit) return hit;
  const response = await fetch(request);
  put(key, response.clone());
  return response;
}

async function staleWhileRevalidate(event, request, key) {
  const hit = await lookup(key);
  const refresh = fetch(request).then((response) => {
    put(key, response.clone());
    return response;
  });
  if (hit) {
    event.waitUntil(refresh.catch(() => {}));
    return hit;
  }
  return refresh;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.headers.has("range")) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;
  // Usage totals and likes are never stored. The script itself always comes from the network.
  if (path.startsWith("/api/stats/") || path === "/sw.js") return;

  const key = url.origin + path;
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, key));
  } else if (path.startsWith("/_astro/") || /^\/[^/]+\/[^/]+\/vendor\//.test(path)) {
    event.respondWith(cacheFirst(request, key));
  } else {
    event.respondWith(staleWhileRevalidate(event, request, key));
  }
});
