// Free the Tools service worker. scripts/build-sw.mjs fills in VERSION and SHELL and writes
// dist/sw.js after each build. See docs/adr/0010-service-worker-offline.md.
//
// Same-origin GET requests only. One cache per build, "ftt-<version>". A new build is prepared in
// full while the old one keeps serving: files that did not change are copied from the old cache,
// the rest are fetched and checked against /offline-files.json. The new worker then waits until the
// visitor reloads (the page offers it) or closes every tab, and only then deletes the old cache.
const VERSION = "__VERSION__";
const RELEASE = "__RELEASE__"; // the site's version number; a new one is announced, other builds are not
const SHELL = __SHELL__;
const CACHE = "ftt-" + VERSION;
const STATE = "ftt-state"; // what the visitor chose to keep; outlives versions
const LIST = "/offline-files.json";
const OFFLINE = "/offline/";
const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel("ftt-offline") : null;
const tell = (msg) => { try { channel?.postMessage(msg); } catch {} };

// ---- What the visitor chose: { full, lang, engine, removed } ----
async function readState() {
  try {
    const r = await (await caches.open(STATE)).match("/__state");
    return r ? await r.json() : {};
  } catch {
    return {};
  }
}
async function writeState(state) {
  try {
    await (await caches.open(STATE)).put("/__state", new Response(JSON.stringify(state), { headers: { "Content-Type": "application/json" } }));
  } catch {}
}

// ---- The list of files (scripts/build-sw.mjs) ----
// Decoded to { files: Map(path -> { sha, bytes, deps }), sets: { name: [paths] } }.
function decode(raw) {
  const paths = raw.files.map((f) => f[0]);
  const files = new Map(raw.files.map(([path, sha, bytes, dep]) => [path, { sha, bytes, deps: dep === undefined ? [] : raw.deps[dep].map((i) => paths[i]) }]));
  const sets = Object.fromEntries(Object.entries(raw.sets).map(([k, v]) => [k, v.map((i) => paths[i])]));
  return { version: raw.version, files, sets };
}
async function listIn(cache) {
  try {
    const r = await cache.match(LIST);
    return r ? decode(await r.json()) : null;
  } catch {
    return null;
  }
}
// This version's list, from its cache or the network. A list from another version (a deploy in
// progress) is not used.
async function currentList(cache) {
  const kept = await listIn(cache);
  if (kept) return kept;
  const r = await fetch(LIST, { cache: "no-cache" });
  if (!r.ok) throw new Error("no file list");
  const list = decode(await r.clone().json());
  if (list.version !== VERSION) throw new Error("the file list belongs to another version");
  await cache.put(LIST, r);
  return list;
}

// The paths to keep: the shell, every page asked for with the files it needs, and, for a full
// download, the visitor's language, the shared files and any engine they chose.
function wanted(list, state, extra = []) {
  const out = new Set(SHELL);
  const pages = [...extra];
  if (state.full) {
    pages.push(...list.sets.common, ...(list.sets[state.lang] || list.sets.en));
    if (state.engine) pages.push(...(list.sets.compress || []));
  }
  for (const p of pages) {
    const f = list.files.get(p);
    if (!f) continue;
    out.add(p);
    for (const d of f.deps) out.add(d);
  }
  return out;
}

// The caches of earlier versions, each with its list (null when it was made before lists existed).
async function earlier() {
  const out = [];
  try {
    for (const name of await caches.keys()) {
      if (!name.startsWith("ftt-") || name === CACHE || name === STATE) continue;
      const cache = await caches.open(name);
      out.push({ cache, list: await listIn(cache) });
    }
  } catch {}
  return out;
}

async function sha(buffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

// Puts every path into the cache: already there, copied unchanged from an earlier version, or
// fetched and checked. A file whose bytes do not match the list is not kept (a deploy in progress,
// or something changed it on the way). Returns how many could not be fetched for lack of network.
async function fill(cache, paths, list, old, progress, localOnly = false) {
  const todo = [...paths];
  let next = 0, done = 0, offline = 0;
  async function one(path) {
    if (await cache.match(path)) return;
    const want = list?.files.get(path);
    for (const o of old) {
      if (!want || o.list?.files.get(path)?.sha !== want.sha) continue;
      const hit = await o.cache.match(path);
      if (hit) return cache.put(path, hit);
    }
    if (localOnly) return;
    let response;
    try {
      response = await fetch(path, { cache: "no-cache" });
    } catch {
      offline++;
      return;
    }
    if (!response.ok || response.status !== 200 || response.redirected) return;
    if (!want) return cache.put(path, response);
    const body = await response.arrayBuffer();
    if ((await sha(body)) !== want.sha) return;
    await cache.put(path, new Response(body, { status: 200, headers: response.headers }));
  }
  // Six at a time: quick, without crowding a slow connection.
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (next < todo.length) {
      const path = todo[next++];
      try { await one(path); } catch {}
      done++;
      if (progress && (done % 10 === 0 || done === todo.length)) progress(done, todo.length);
    }
  }));
  return offline;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE);
        const state = await readState();
        const old = await earlier();
        let list = null;
        try { list = await currentList(cache); } catch {}
        // Without the list an update cannot tell what to keep: try again later.
        if (!list && (old.length || state.full)) throw new Error("the offline copy is incomplete");
        // Keep what the visitor had: every page an earlier version kept that this version still has.
        const had = [];
        for (const o of old) for (const req of await o.cache.keys()) had.push(new URL(req.url).pathname);
        const paths = list ? wanted(list, state, had) : new Set(SHELL);
        const offline = await fill(cache, paths, list, old);
        // A full offline copy must be complete before this version takes over: when the network
        // drops, fail, and the browser tries again later while the old version keeps serving.
        if (offline && state.full) throw new Error("the offline copy is incomplete");
      } catch (e) {
        if (String(e?.message).includes("incomplete")) throw e;
        // Storage is denied or full. The site still works online.
      }
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        // A full copy asked for while this version was waiting went into the old cache: carry
        // over what did not change before the old cache goes. A page that opens online fetches the rest.
        const state = await readState();
        const cache = await caches.open(CACHE);
        const list = await listIn(cache);
        if (state.full && list) await fill(cache, wanted(list, state), list, await earlier(), null, true);
      } catch {}
      try {
        const names = await caches.keys();
        await Promise.all(names.filter((n) => n.startsWith("ftt-") && n !== CACHE && n !== STATE).map((n) => caches.delete(n)));
      } catch {}
      // No clients.claim(): taking over a page mid-load aborts its cross-document view transition
      // (see Base.astro). A first visit is served by the network; the worker controls the page
      // from the next navigation, and a worker that replaces an older one already controls them.
    })(),
  );
});

// ---- Messages from pages: the Offline use page, the install button and the update note ----
let job = Promise.resolve();
const queue = (work) => (job = job.then(work, work));

async function status() {
  const state = await readState();
  const out = { type: "status", version: VERSION, full: !!state.full, lang: state.lang || "en", engine: !!state.engine, removed: !!state.removed, sizes: {}, missing: 0, engineReady: false };
  try {
    const cache = await caches.open(CACHE);
    const list = await currentList(cache);
    const bytes = (paths) => [...paths].reduce((n, p) => n + (list.files.get(p)?.bytes || 0), 0);
    for (const lang of ["en", "nb", "es", "ru"]) if (list.sets[lang]) out.sizes[lang] = bytes(wanted(list, { full: true, lang }));
    out.sizes.engine = bytes(list.sets.compress || []);
    const want = wanted(list, state);
    for (const p of want) if (!(await cache.match(p))) out.missing++;
    out.engineReady = (list.sets.compress || []).length > 0 && (await Promise.all((list.sets.compress || []).map((p) => cache.match(p)))).every(Boolean);
    out.kept = bytes(new Set((await cache.keys()).map((r) => new URL(r.url).pathname)));
  } catch {
    out.error = true;
  }
  tell(out);
}

async function download({ lang, engine }) {
  const before = await readState();
  const state = { full: true, lang: ["en", "nb", "es", "ru"].includes(lang) ? lang : "en", engine: engine ?? !!before.engine, removed: false };
  await writeState(state);
  await sync();
}

// Brings the cache up to what the visitor chose. Also runs when a page opens online, so a copy that
// was cut short (closed tab, lost network) is finished later.
async function sync({ report = true } = {}) {
  const state = await readState();
  if (!state.full) return report ? status() : undefined;
  try {
    const cache = await caches.open(CACHE);
    const list = await currentList(cache);
    const paths = wanted(list, state);
    let missing = 0;
    for (const p of paths) if (!(await cache.match(p))) missing++;
    if (missing) {
      report = true;
      tell({ type: "progress", done: 0, total: paths.size });
      await fill(cache, paths, list, [], (done, total) => tell({ type: "progress", done, total }));
    }
  } catch {}
  if (report) await status();
}

async function remove({ what }) {
  const state = await readState();
  try {
    const cache = await caches.open(CACHE);
    const list = await listIn(cache);
    if (what === "engine") {
      await writeState({ ...state, engine: false });
      for (const p of list?.sets.compress || []) await cache.delete(p);
    } else {
      // Everything but the shell and the list goes, including tools kept after a visit.
      await writeState({ full: false, lang: state.lang, engine: false, removed: true });
      const keep = new Set([...SHELL, LIST]);
      for (const req of await cache.keys()) if (!keep.has(new URL(req.url).pathname)) await cache.delete(req);
    }
  } catch {}
  await status();
}

self.addEventListener("message", (event) => {
  const msg = event.data || {};
  if (msg.type === "skip-waiting") {
    self.skipWaiting();
    return;
  }
  // Any worker, waiting or in charge, says which release it is, so the page can compare the two.
  if (msg.type === "release") {
    event.ports?.[0]?.postMessage(RELEASE);
    return;
  }
  // Only the version in charge changes what is kept; a waiting one gets its turn after the reload.
  // (Browsers without self.serviceWorker get their messages only from pages that ask the active one.)
  if (self.serviceWorker && self.registration.active !== self.serviceWorker) return;
  if (msg.type === "status") event.waitUntil(queue(status));
  else if (msg.type === "download") event.waitUntil(queue(() => download(msg)));
  else if (msg.type === "sync") event.waitUntil(queue(() => sync({ report: !msg.quiet })));
  else if (msg.type === "remove") event.waitUntil(queue(() => remove(msg)));
  else if (msg.type === "auto") {
    // An installed app downloads everything once, unless the visitor removed it before.
    event.waitUntil(queue(async () => {
      const state = await readState();
      if (!state.full && !state.removed) await download(msg);
    }));
  }
});

// ---- Requests ----
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
  // Usage totals and likes are never stored. The script itself always comes from the network, and so
  // does the file list: a newer list must never land in an older version's cache.
  if (path.startsWith("/api/stats/") || path === "/sw.js" || path === LIST) return;

  const key = url.origin + path;
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, key));
  } else if (path.startsWith("/_astro/") || /^\/([^/]+\/[^/]+\/)?vendor\//.test(path)) {
    event.respondWith(cacheFirst(request, key));
  } else {
    event.respondWith(staleWhileRevalidate(event, request, key));
  }
});
